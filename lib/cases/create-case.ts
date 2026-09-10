import { randomUUID } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { getDb } from "../db/client";
import { cases, reports, reservations } from "../db/schema";
import { runPipeline } from "../pipeline/index";
import { validateCaseInput } from "../validation/case-input";

// 사건 입력을 받아 검증 → 파이프라인 실행 → cases/reports 저장까지 수행하는
// 단일 엔트리 포인트 (REQ-SCAFFOLD-016, AC-SCAFFOLD-015). app/api/cases/
// route handler(M5)가 이 함수를 호출한다.
//
// 검증은 반드시 파이프라인 실행 이전에 수행되어야 한다 — PII 형식 입력이
// CaseNormalizer(파이프라인 1단계)나 DB에 도달해서는 안 된다
// (REQ-SCAFFOLD-012, AC-SCAFFOLD-011, M3에서 이미 정의된 계약).
//
// SPEC-PILOT-READY-001 M1(REQ-PILOT-READY-007, plan.md §A 결정 1) — 사용자별
// 동시 실행 가드. TTL 기반 리스(reservations 테이블)를 runPipeline 호출 전에
// 원자적으로 획득하고, 완료 기록(cases/reports INSERT + 리스 해제)은 단일
// DB 트랜잭션으로 묶는다(폴백 없음). 이 가드는 "사용자당 동시 in-flight
// 1개"라는 동시성 제한만 보장하며, 제출 idempotency는 보장하지 않는다
// (REQ-PILOT-READY-015 — 응답 유실 후 재제출은 의도적으로 다루지 않는 gap).

// maxDuration(300초, app/api/cases/route.ts) 대비 약 30초 안전 여유를 둔
// 최소값. 정상 처리 중인 요청의 리스가 플랫폼 강제 종료보다 먼저 만료될
// 수 없도록 하는 것이 이 산정의 안전성 근거다(plan.md §A 결정 1).
export const LEASE_TTL_SECONDS = 330;

export interface CreateCaseSuccess {
  success: true;
  caseId: string;
}

export interface CreateCaseValidationFailure {
  success: false;
  fieldErrors: Record<string, string[]>;
}

// 판별자는 기존 success: false/fieldErrors 패턴과 충돌하지 않는 새 필드로
// 결정했다(plan.md §B M1 "공통" 절 — 구현 시점 결정 사항).
export interface CreateCaseAlreadyProcessing {
  success: false;
  alreadyProcessing: true;
}

export type CreateCaseResult =
  | CreateCaseSuccess
  | CreateCaseValidationFailure
  | CreateCaseAlreadyProcessing;

function toFieldErrors(
  issues: { path: PropertyKey[]; message: string }[]
): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : "_form";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors;
}

// 트랜잭션 안에서 펜싱 게이트(자신의 leaseId가 더 이상 현재 리스가 아님)를
// 감지했을 때 던지는 내부 전용 에러 — 일반 트랜잭션 실패(예: reports INSERT
// 실패)와 구분해서 처리해야 한다: 펜싱 실패는 "이미 다른 실행이 리스를
// 재획득했다"는 정상적인 지연 도착 시나리오이므로 리스 해제를 시도하지
// 않는다(자신의 낡은 leaseId는 어차피 현재 행과 일치하지 않아 해제해도
// no-op이다) — 반면 그 외의 트랜잭션 실패는 자신이 여전히 리스를 보유한
// 채로 롤백된 경우이므로 명시적 후속 해제가 필요하다(plan.md §A v0.5.0).
class LeaseFencedError extends Error {}

type Db = ReturnType<typeof getDb>;

// 획득(원자적, TTL 만료 시 재획득 포함) — 조건부 UPSERT 1개 statement로
// DB 엔진 수준 원자성을 보장한다(plan.md §A 결정 1). 영향받은 행 수가
// 드라이버에서 신뢰성 있게 노출되지 않으므로, 쓰기 직후 즉시 재조회로
// 자신의 leaseId가 실제로 반영됐는지 확인한다.
async function acquireLease(db: Db, ownerUserId: string): Promise<string | null> {
  const leaseId = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LEASE_TTL_SECONDS * 1000);

  await db
    .insert(reservations)
    .values({ ownerUserId, leaseId, expiresAt })
    .onConflictDoUpdate({
      target: reservations.ownerUserId,
      set: { leaseId, expiresAt },
      setWhere: lt(reservations.expiresAt, now),
    });

  const [current] = await db
    .select({ leaseId: reservations.leaseId })
    .from(reservations)
    .where(eq(reservations.ownerUserId, ownerUserId));

  return current?.leaseId === leaseId ? leaseId : null;
}

// 해제(펜싱됨) — ownerUserId AND leaseId가 모두 일치할 때만 삭제한다.
// 0행 매치(이미 만료되어 재획득된 경우)는 오류 없이 조용히 무시된다
// (plan.md §B M1 "해제" 절).
async function releaseLeaseFenced(db: Db, ownerUserId: string, leaseId: string): Promise<void> {
  await db
    .delete(reservations)
    .where(and(eq(reservations.ownerUserId, ownerUserId), eq(reservations.leaseId, leaseId)));
}

export async function createCase(
  ownerUserId: string,
  rawInput: unknown
): Promise<CreateCaseResult> {
  const parsed = validateCaseInput(rawInput);
  if (!parsed.success) {
    return { success: false, fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const db = getDb();
  const leaseId = await acquireLease(db, ownerUserId);
  if (!leaseId) {
    // 다른 요청의 만료 전 리스에 막힘 — 새 파이프라인을 실행하지 않는다
    // (REQ-PILOT-READY-007).
    return { success: false, alreadyProcessing: true };
  }

  let report;
  try {
    // AC-SCAFFOLD-013: 파이프라인 6단계(CaseNormalizer→...→Verifier)를 순차
    // 실행해 seed evidence와 연결된 Research Report를 생성한다.
    report = await runPipeline(parsed.data);
  } catch (error) {
    console.error(
      JSON.stringify({ event: "pipeline_failed", hasOwnerUserId: Boolean(ownerUserId), error: String(error) })
    );
    // 파이프라인 실패/예외 — 리스만 정리하고 cases/reports에는 아무것도
    // 기록하지 않는다(재시도가 차단되지 않게 한다).
    await releaseLeaseFenced(db, ownerUserId, leaseId);
    throw error;
  }

  const caseId = randomUUID();
  const now = new Date();

  try {
    // 완료 기록(단일 트랜잭션, 폴백 없는 하드 요구사항 — REQ-PILOT-READY-007(3)):
    // (1) leaseId 재확인(펜싱 게이트) → (2) cases INSERT → (3) reports INSERT →
    // (4) 리스 해제. libSQL의 서버측 5초 잠금 타임아웃을 넘지 않도록, 이
    // 트랜잭션 안에는 이 4개의 단순 쿼리 외에 어떤 느린 작업도 추가하지 않는다.
    await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ leaseId: reservations.leaseId })
        .from(reservations)
        .where(eq(reservations.ownerUserId, ownerUserId));

      if (current?.leaseId !== leaseId) {
        // 지연 도착 결과의 펜싱 — 자신의 리스가 만료되어 다른 실행이
        // 재획득한 상태. 커밋하지 않고 자신의 결과를 버린다.
        throw new LeaseFencedError();
      }

      await tx.insert(cases).values({
        id: caseId,
        ownerUserId,
        input: parsed.data,
        status: "completed",
        createdAt: now,
        updatedAt: now,
      });

      await tx.insert(reports).values({
        id: randomUUID(),
        caseId,
        content: report,
        createdAt: now,
      });

      await tx
        .delete(reservations)
        .where(and(eq(reservations.ownerUserId, ownerUserId), eq(reservations.leaseId, leaseId)));
    });
  } catch (error) {
    if (error instanceof LeaseFencedError) {
      return { success: false, alreadyProcessing: true };
    }

    // 완료 기록 트랜잭션 자체가 실패(예: reports INSERT 실패)한 경우 —
    // 트랜잭션은 자동 롤백됐으나 reservations DELETE도 함께 롤백되어
    // 리스 행이 여전히 존재한다. 같은 사용자가 TTL을 기다리지 않고 즉시
    // 재제출할 수 있도록 이 트랜잭션과는 별개의 후속 단계로 펜싱된 해제를
    // 수행한다(plan.md §A v0.5.0 정밀화).
    console.error(
      JSON.stringify({ event: "completion_transaction_failed", error: String(error) })
    );
    try {
      await releaseLeaseFenced(db, ownerUserId, leaseId);
    } catch (releaseError) {
      // 이중 실패 — 로그만 남기고 최종 회복은 기존 TTL 만료 메커니즘에
      // 맡긴다(plan.md §A v0.5.0).
      console.error(
        JSON.stringify({
          event: "post_failure_lease_release_failed",
          error: String(releaseError),
        })
      );
    }
    throw error;
  }

  return { success: true, caseId };
}
