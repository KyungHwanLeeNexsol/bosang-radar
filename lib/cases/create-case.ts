import { randomUUID } from "node:crypto";
import { and, eq, inArray, lt } from "drizzle-orm";
import { getDb } from "../db/client";
import { caseJobs, cases, reports, reservations } from "../db/schema";
import { toSafeErrorMeta } from "../logging/safe-error";
import { runPipeline } from "../pipeline/index";
import { validateCaseInput, type CaseInput } from "../validation/case-input";

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
// Background Function은 Netlify Free에서 최대 15분까지 실행될 수 있으므로,
// 비동기 job이 정상 처리 중인 동안 리스가 먼저 만료되지 않도록 별도 여유를 둔다.
export const BACKGROUND_LEASE_TTL_SECONDS = 960;

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
  CreateCaseSuccess | CreateCaseValidationFailure | CreateCaseAlreadyProcessing;

export interface StartCaseJobSuccess {
  success: true;
  jobId: string;
}

export type StartCaseJobResult =
  StartCaseJobSuccess | CreateCaseValidationFailure | CreateCaseAlreadyProcessing;

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
async function acquireLease(
  db: Db,
  ownerUserId: string,
  ttlSeconds = LEASE_TTL_SECONDS
): Promise<string | null> {
  const leaseId = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

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
      JSON.stringify({
        event: "pipeline_failed",
        hasOwnerUserId: Boolean(ownerUserId),
        ...toSafeErrorMeta(error),
      })
    );
    // 파이프라인 실패/예외 — 리스만 정리하고 cases/reports에는 아무것도
    // 기록하지 않는다(재시도가 차단되지 않게 한다). 완료 트랜잭션 실패
    // 경로(아래)와 대칭적으로, 이 해제 자체가 실패해도 원래 파이프라인
    // 오류를 삼키지 않고 항상 원래 오류를 던진다(v0.6.0 정정 — 외부
    // 구현 검토 5차 반영).
    try {
      await releaseLeaseFenced(db, ownerUserId, leaseId);
    } catch (releaseError) {
      // 이중 실패 — 로그만 남기고 최종 회복은 기존 TTL 만료 메커니즘에
      // 맡긴다(완료 트랜잭션 실패 경로의 post_failure_lease_release_failed와
      // 동일한 이중 실패 처리 패턴).
      console.error(
        JSON.stringify({
          event: "pipeline_failed_lease_release_failed",
          ...toSafeErrorMeta(releaseError),
        })
      );
    }
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
      JSON.stringify({ event: "completion_transaction_failed", ...toSafeErrorMeta(error) })
    );
    try {
      await releaseLeaseFenced(db, ownerUserId, leaseId);
    } catch (releaseError) {
      // 이중 실패 — 로그만 남기고 최종 회복은 기존 TTL 만료 메커니즘에
      // 맡긴다(plan.md §A v0.5.0).
      console.error(
        JSON.stringify({
          event: "post_failure_lease_release_failed",
          ...toSafeErrorMeta(releaseError),
        })
      );
    }
    throw error;
  }

  return { success: true, caseId };
}

// Netlify Background Function 경로. 요청은 리스를 먼저 획득하고 검증된 input을
// case_jobs에 저장한 뒤 jobId만 반환한다. 실제 Gemini 호출과 cases/reports 완료
// 트랜잭션은 processCaseJob()에서 수행해 동기 함수의 60초 응답 제한을 피한다.
export async function startCaseJob(
  ownerUserId: string,
  rawInput: unknown
): Promise<StartCaseJobResult> {
  const parsed = validateCaseInput(rawInput);
  if (!parsed.success) {
    return { success: false, fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const db = getDb();
  const leaseId = await acquireLease(db, ownerUserId, BACKGROUND_LEASE_TTL_SECONDS);
  if (!leaseId) {
    return { success: false, alreadyProcessing: true };
  }

  const jobId = randomUUID();
  const now = new Date();
  try {
    await db.insert(caseJobs).values({
      id: jobId,
      ownerUserId,
      leaseId,
      input: parsed.data,
      status: "queued",
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    try {
      await releaseLeaseFenced(db, ownerUserId, leaseId);
    } catch (releaseError) {
      console.error(
        JSON.stringify({
          event: "case_job_create_lease_release_failed",
          ...toSafeErrorMeta(releaseError),
        })
      );
    }
    throw error;
  }

  return { success: true, jobId };
}

// Background Function 호출이 Netlify에 접수되지 못한 경우의 보상 작업.
// 아직 완료되지 않은 job만 failed로 전환하고, 그 job이 가진 leaseId와 정확히
// 일치하는 사용자 리스만 같은 트랜잭션에서 해제한다.
export async function cancelCaseJob(ownerUserId: string, jobId: string): Promise<void> {
  const db = getDb();
  const now = new Date();

  await db.transaction(async (tx) => {
    const [cancelled] = await tx
      .update(caseJobs)
      .set({ status: "failed", updatedAt: now })
      .where(
        and(
          eq(caseJobs.id, jobId),
          eq(caseJobs.ownerUserId, ownerUserId),
          inArray(caseJobs.status, ["queued", "processing"])
        )
      )
      .returning({ leaseId: caseJobs.leaseId });

    if (!cancelled) return;

    await tx
      .delete(reservations)
      .where(
        and(eq(reservations.ownerUserId, ownerUserId), eq(reservations.leaseId, cancelled.leaseId))
      );
  });
}

// Background Function 전용 실행부. jobId와 leaseId를 DB에서 함께 읽어 소유권을
// 확인하고, 완료 기록·리스 해제·job 상태 갱신을 하나의 트랜잭션으로 처리한다.
// 실패 시 job은 안전한 일반 오류 상태로 남기고 펜싱된 리스를 해제한다.
export async function processCaseJob(jobId: string): Promise<void> {
  const db = getDb();
  const [job] = await db
    .update(caseJobs)
    .set({ status: "processing", updatedAt: new Date() })
    .where(and(eq(caseJobs.id, jobId), eq(caseJobs.status, "queued")))
    .returning();

  if (!job) {
    return;
  }

  try {
    const report = await runPipeline(job.input as CaseInput);
    const caseId = randomUUID();
    const now = new Date();

    await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ leaseId: reservations.leaseId })
        .from(reservations)
        .where(eq(reservations.ownerUserId, job.ownerUserId));

      if (current?.leaseId !== job.leaseId) {
        throw new LeaseFencedError();
      }

      await tx.insert(cases).values({
        id: caseId,
        ownerUserId: job.ownerUserId,
        input: job.input,
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
        .where(
          and(eq(reservations.ownerUserId, job.ownerUserId), eq(reservations.leaseId, job.leaseId))
        );
      await tx
        .update(caseJobs)
        .set({ status: "completed", caseId, updatedAt: now })
        .where(
          and(
            eq(caseJobs.id, jobId),
            eq(caseJobs.leaseId, job.leaseId),
            eq(caseJobs.status, "processing")
          )
        );
    });
  } catch (error) {
    const now = new Date();
    try {
      await db
        .update(caseJobs)
        .set({ status: "failed", updatedAt: now })
        .where(
          and(
            eq(caseJobs.id, jobId),
            eq(caseJobs.leaseId, job.leaseId),
            eq(caseJobs.status, "processing")
          )
        );
    } catch (statusError) {
      console.error(
        JSON.stringify({ event: "case_job_status_update_failed", ...toSafeErrorMeta(statusError) })
      );
    }
    if (!(error instanceof LeaseFencedError)) {
      try {
        await releaseLeaseFenced(db, job.ownerUserId, job.leaseId);
      } catch (releaseError) {
        console.error(
          JSON.stringify({
            event: "case_job_failed_lease_release_failed",
            ...toSafeErrorMeta(releaseError),
          })
        );
      }
    }
    console.error(JSON.stringify({ event: "case_job_failed", ...toSafeErrorMeta(error) }));
  }
}
