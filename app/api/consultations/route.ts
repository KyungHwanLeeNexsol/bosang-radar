import { createHash, createHmac, randomUUID } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db/client";
import { consultationRateLimits, consultations } from "@/lib/db/schema";
import { ConsultationRequestSchema } from "@/lib/consult/schema";
import { maskPhone, normalizePhone } from "@/lib/consult/phone";
import { CONSENT_POLICY_VERSION } from "@/lib/consult/consent-policy";
import type { ConsultationChannel, ConsultationSubmitResult } from "@/lib/consult/types";
import { toSafeErrorMeta } from "@/lib/logging/safe-error";

// SPEC-B2C-CONSULT-001 M2 — POST /api/consultations. design.md §8.1이 정의한
// 10단계 처리 순서를 그대로 구현한다(순서 재배열 금지 — 이 SPEC plan-phase의
// 가장 많이 논의된 결정 중 하나, D11/D17): 검증 → 동의 정책 검증 → 요청
// 지문 계산 → idempotencyKey 조회(일치→성공 반환/불일치→거부, 이 두 경로
// 모두 rate limit 미적용) → (신규 제출 시도일 때만) rate limit 판정 →
// 비즈니스 중복 조회 → 삽입 → 삽입 시점 UNIQUE 충돌 재조회.

type DrizzleDb = ReturnType<typeof getDb>;

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const RATE_LIMIT_RETENTION_MS = 60 * 60 * 1000;

interface ConsentPolicy {
  version: string;
  isActive: boolean;
}

// CONSULT_POLICY_READY 환경 변수에서 파생한다(design.md §6.1) — 법무 확정
// 전에는 false로 유지되어 저장 시도 자체를 하지 않는다.
function getActiveConsentPolicy(env: Record<string, string | undefined>): ConsentPolicy {
  return { version: CONSENT_POLICY_VERSION, isActive: env.CONSULT_POLICY_READY === "true" };
}

interface FingerprintInput {
  resultId: string;
  channel: string;
  name: string;
  contactNormalized: string;
  preferredCallTime: string | null;
  piiCollection: boolean;
  healthInfoUse: boolean;
  marketing: boolean;
  acknowledgedConsentVersion: string;
}

// 결정론적으로 키 정렬된 JSON을 SHA-256 해싱한다(design.md §8.2) — idempotencyKey
// 재사용이 "같은 요청의 재시도"인지 "다른 내용을 같은 키로 보내는 것"인지
// 구분하는 근거다. 원본 PII 값은 이 함수의 반환값(해시)만 DB 컬럼에 저장되고
// 어떤 로그에도 노출되지 않는다.
function computeRequestFingerprint(input: FingerprintInput): string {
  const canonical = JSON.stringify({
    acknowledgedConsentVersion: input.acknowledgedConsentVersion,
    channel: input.channel,
    consentHealthInfoUse: input.healthInfoUse,
    consentMarketing: input.marketing,
    consentPiiCollection: input.piiCollection,
    contactNormalized: input.contactNormalized,
    name: input.name,
    preferredCallTime: input.preferredCallTime,
    resultId: input.resultId,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toSuccessResult(row: typeof consultations.$inferSelect): ConsultationSubmitResult {
  const base = {
    status: "success" as const,
    channel: row.channel as ConsultationChannel,
    maskedContact: maskPhone(row.contactNormalized),
  };
  return row.channel === "phone" && row.preferredCallTime
    ? { ...base, preferredCallTime: row.preferredCallTime }
    : base;
}

// maskedContact는 매칭된 기존 레코드의 저장값을 다시 읽어 반환하지 않고,
// 항상 이번 요청 자신이 제출한 연락처를 정규화·마스킹해 파생한다 — 매칭
// 로직 결함이 발생하더라도 다른 제출자의 연락처가 노출될 가능성을 원천
// 차단한다(design.md §9.4, REQ-B2CCONSULT-023).
function toDuplicateResult(
  existing: typeof consultations.$inferSelect,
  requestContactNormalized: string
): ConsultationSubmitResult {
  return {
    status: "duplicate",
    receivedAt: toDateOnly(existing.createdAt),
    maskedContact: maskPhone(requestContactNormalized),
    applicationStatus: existing.applicationStatus,
  };
}

function errorResult(
  code: Extract<ConsultationSubmitResult, { status: "error" }>["code"],
  message: string,
  fieldErrors?: Record<string, string[]>
): ConsultationSubmitResult {
  return { status: "error", code, message, ...(fieldErrors ? { fieldErrors } : {}) };
}

// Nginx가 리버스 프록시로서 채우는 x-forwarded-for를 신뢰 가능한 원본 IP로
// 사용한다 — Next.js 프로세스는 127.0.0.1에만 바인딩되어 Nginx를 거치지 않은
// 요청은 애초에 도달할 수 없다(tech.md, design.md §9.3).
function getTrustedIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) {
    return null;
  }
  const first = forwarded.split(",")[0]?.trim();
  return first && first.length > 0 ? first : null;
}

// 동일 idempotencyKey를 공유하는 동시 요청들이(같은 버튼 재클릭 등) 각자
// 독립적으로 idempotencyKey 조회(§8.1 4번)를 통과해버리면 rate limit
// 판정을 중복으로 소비해 부당하게 429를 받을 수 있다(REQ-B2CCONSULT-021
// 동시성 시나리오). 이 프로젝트의 실제 배포는 PM2가 구동하는 단일
// 프로세스이므로(design.md §9.3), 프로세스 내 idempotencyKey별 순차화로
// 같은 키를 공유하는 요청들을 4-10번 단계 전체에서 직렬화한다 — 서로 다른
// idempotencyKey의 요청들은 이 락의 영향을 받지 않고 그대로 동시 처리된다.
const idempotencyLocks = new Map<string, Promise<unknown>>();

async function withIdempotencyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previousLock = idempotencyLocks.get(key) ?? Promise.resolve();
  const settledPrevious = previousLock.then(
    () => undefined,
    () => undefined
  );
  const lockPromise = settledPrevious.then(fn);
  idempotencyLocks.set(key, lockPromise);
  try {
    return await lockPromise;
  } finally {
    if (idempotencyLocks.get(key) === lockPromise) {
      idempotencyLocks.delete(key);
    }
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleConsultationSubmit(request);
}

// db/env를 기본 매개변수로 주입 가능하게 두어(evidence-retriever.ts와 동일한
// 관례) 테스트가 실제 in-memory DB·시크릿 값을 주입할 수 있게 한다.
export async function handleConsultationSubmit(
  request: NextRequest,
  db: DrizzleDb = getDb(),
  env: Record<string, string | undefined> = process.env
): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(errorResult("validation", "요청 본문을 읽을 수 없습니다."), {
      status: 400,
    });
  }

  // 요청 시작 시점 최소 구조적 로그 — name/contact 원본은 절대 포함하지
  // 않는다(design.md §9.1, REQ-B2CCONSULT-018). channel은 스키마 검증
  // (아래 1번 단계) 이전에 로그를 남기므로, 공격자가 채널 필드에 전화번호나
  // 이름 같은 PII를 넣어 보내는 로그 인젝션을 막기 위해 정확히
  // "kakao"/"phone" 두 값일 때만 그대로 남기고, 그 외(공격 페이로드/잘못된
  // 타입/누락)는 고정 sentinel "invalid"로 대체한다 — 원본 값은 어떤 경우도
  // 로그에 실리지 않는다.
  const rawChannel =
    typeof body === "object" && body !== null && "channel" in body
      ? (body as { channel?: unknown }).channel
      : undefined;
  console.info(
    JSON.stringify({
      event: "consultation_request_received",
      timestamp: new Date().toISOString(),
      channel: rawChannel === "kakao" || rawChannel === "phone" ? rawChannel : "invalid",
      hasResultId: Boolean(
        typeof body === "object" &&
          body !== null &&
          "resultId" in body &&
          (body as { resultId?: unknown }).resultId
      ),
    })
  );

  // 1) 스키마 검증
  const parsed = ConsultationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      errorResult("validation", "입력값 검증에 실패했습니다.", parsed.error.flatten().fieldErrors),
      { status: 400 }
    );
  }
  const payload = parsed.data;
  const contactNormalized = normalizePhone(payload.contact);
  if (!contactNormalized) {
    // schema.ts의 .refine이 이미 이 경로를 차단하지만, 아래에서 string으로
    // 좁혀 쓰기 위해 방어적으로 재확인한다.
    return NextResponse.json(
      errorResult("validation", "연락처 형식이 올바르지 않습니다.", {
        contact: ["형식이 올바르지 않습니다"],
      }),
      { status: 400 }
    );
  }

  // 2) 활성 동의 정책 검증
  const policy = getActiveConsentPolicy(env);
  if (!policy.isActive) {
    return NextResponse.json(
      errorResult("policy_unavailable", "현재 상담 신청을 접수할 수 없습니다."),
      { status: 503 }
    );
  }
  if (payload.acknowledgedConsentVersion !== policy.version) {
    return NextResponse.json(
      errorResult("consent_version_mismatch", "동의 문구 버전이 최신 상태가 아닙니다."),
      { status: 409 }
    );
  }

  // 3-10) 이하 전부 DB에 접근한다 — 예기치 못한 DB 오류가 어느 단계에서
  // 발생하든(idempotency 조회/rate limit upsert/비즈니스 중복 조회/삽입)
  // 오직 500/server_error로만 응답한다(다른 상태로 오인 매핑하지 않는다).
  // 삽입 시점 UNIQUE 레이스(10번)는 내부 try/catch가 먼저 재조회로 해석을
  // 시도하고, 그마저 해석 불가능한 경우에만 이 바깥 catch로 넘어온다.
  try {
    // 3) 요청 지문 계산
    const fingerprint = computeRequestFingerprint({
      resultId: payload.resultId,
      channel: payload.channel,
      name: payload.name,
      contactNormalized,
      preferredCallTime: payload.preferredCallTime ?? null,
      piiCollection: payload.consent.piiCollection,
      healthInfoUse: payload.consent.healthInfoUse,
      marketing: payload.consent.marketing,
      acknowledgedConsentVersion: payload.acknowledgedConsentVersion,
    });

    // 4-10) 동일 idempotencyKey를 공유하는 동시 요청 전체를 이 지점부터
    // 직렬화한다 — 그래야 재시도 요청이 앞선 요청의 커밋을 항상 관측하고
    // rate limit을 중복 소비하지 않는다(위 withIdempotencyLock 주석 참고).
    return await withIdempotencyLock(payload.idempotencyKey, async () => {
      // 4-6) idempotencyKey 조회 — 일치 시 기존 성공 반환, 불일치 시 거부.
      // 이 두 경로 모두 rate limit 판정을 거치지 않는다(§8.1 5-6번, D11).
      const existingByKey = await db
        .select()
        .from(consultations)
        .where(eq(consultations.idempotencyKey, payload.idempotencyKey))
        .limit(1);

      if (existingByKey.length > 0) {
        const existing = existingByKey[0];
        if (existing.requestFingerprint === fingerprint) {
          return NextResponse.json(toSuccessResult(existing), { status: 200 });
        }
        return NextResponse.json(
          errorResult("idempotency_conflict", "이미 다른 내용으로 접수된 요청입니다."),
          { status: 409 }
        );
      }

      // 7) rate limit 판정 — idempotencyKey 조회 결과 기존 레코드가 전혀
      // 없어 이번 제출이 진짜 신규 시도로 판정됐을 때만 호출된다(§8.1 7번,
      // D11). 서버 시크릿·신뢰 가능한 IP 부재는 이 단계에서만 500/
      // server_error로 fail closed 처리된다(§9.3, D17) — 앞선 2-6번
      // 단계에서 이미 종료된 요청에는 적용되지 않는다.
      const secret = env.RATE_LIMIT_HMAC_SECRET;
      const trustedIp = getTrustedIp(request);
      if (!secret || !trustedIp) {
        return NextResponse.json(errorResult("server_error", "일시적인 오류가 발생했습니다."), {
          status: 500,
        });
      }

      const nowMs = Date.now();
      const windowStartMs = Math.floor(nowMs / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_WINDOW_MS;
      const ipHmac = createHmac("sha256", secret).update(trustedIp).digest("hex");

      const [{ requestCount }] = await db
        .insert(consultationRateLimits)
        .values({ windowStart: new Date(windowStartMs), ipHmac, requestCount: 1 })
        .onConflictDoUpdate({
          target: [consultationRateLimits.windowStart, consultationRateLimits.ipHmac],
          set: { requestCount: sql`${consultationRateLimits.requestCount} + 1` },
        })
        .returning({ requestCount: consultationRateLimits.requestCount });

      // 보관·정리 정책 — 같은 upsert 트랜잭션에 곁들여 실행한다(design.md §9.3).
      await db
        .delete(consultationRateLimits)
        .where(lt(consultationRateLimits.windowStart, new Date(nowMs - RATE_LIMIT_RETENTION_MS)));

      if (requestCount > RATE_LIMIT_MAX_REQUESTS) {
        return NextResponse.json(errorResult("rate_limited", "잠시 후 다시 시도해 주세요."), {
          status: 429,
        });
      }

      // 8) 비즈니스 중복 조회 — resultId + 정규화 연락처 복합 키(AND)
      const existingByBusinessKey = await db
        .select()
        .from(consultations)
        .where(
          and(
            eq(consultations.resultId, payload.resultId),
            eq(consultations.contactNormalized, contactNormalized)
          )
        )
        .limit(1);

      if (existingByBusinessKey.length > 0) {
        return NextResponse.json(toDuplicateResult(existingByBusinessKey[0], contactNormalized), {
          status: 409,
        });
      }

      // 9) 신규 삽입
      const insertedAt = new Date();
      const newRow = {
        id: randomUUID(),
        resultId: payload.resultId,
        channel: payload.channel,
        name: payload.name,
        contactNormalized,
        preferredCallTime: payload.preferredCallTime ?? null,
        consentPiiCollection: payload.consent.piiCollection,
        consentHealthInfoUse: payload.consent.healthInfoUse,
        consentMarketing: payload.consent.marketing,
        consentVersion: policy.version,
        requestFingerprint: fingerprint,
        applicationStatus: "received",
        idempotencyKey: payload.idempotencyKey,
        createdAt: insertedAt,
        updatedAt: insertedAt,
      };

      try {
        await db.insert(consultations).values(newRow);
        return NextResponse.json(toSuccessResult(newRow), { status: 201 });
      } catch (insertError) {
        // 10) 삽입 시점 UNIQUE 충돌 재조회(동시 요청 레이스, REQ-B2CCONSULT-021).
        // 어느 제약이 충돌했는지는 정확한 드라이버 에러 코드/메시지 형태에
        // 의존하지 않고 재조회로 판정한다(환경 간 에러 형태 차이에 견고함).
        const raceByKey = await db
          .select()
          .from(consultations)
          .where(eq(consultations.idempotencyKey, payload.idempotencyKey))
          .limit(1);
        if (raceByKey.length > 0) {
          const raced = raceByKey[0];
          if (raced.requestFingerprint === fingerprint) {
            return NextResponse.json(toSuccessResult(raced), { status: 200 });
          }
          return NextResponse.json(
            errorResult("idempotency_conflict", "이미 다른 내용으로 접수된 요청입니다."),
            { status: 409 }
          );
        }

        const raceByBusinessKey = await db
          .select()
          .from(consultations)
          .where(
            and(
              eq(consultations.resultId, payload.resultId),
              eq(consultations.contactNormalized, contactNormalized)
            )
          )
          .limit(1);
        if (raceByBusinessKey.length > 0) {
          return NextResponse.json(toDuplicateResult(raceByBusinessKey[0], contactNormalized), {
            status: 409,
          });
        }

        // 재조회로도 해석되지 않는 진짜 예기치 못한 오류 — 바깥 catch가
        // 공통 500/server_error 포맷으로 응답하도록 그대로 전달한다.
        throw insertError;
      }
    });
  } catch (error) {
    console.error(JSON.stringify({ event: "consultation_request_failed", ...toSafeErrorMeta(error) }));
    return NextResponse.json(errorResult("server_error", "일시적인 오류가 발생했습니다."), {
      status: 500,
    });
  }
}
