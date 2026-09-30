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
//
// [D-NEW-25] 4~9단계(키 조회 → rate limit → 중복 조회 → 삽입)는 DB 쓰기 트랜잭션
// 하나 안에서 실행된다. 쓰기 트랜잭션은 시작하는 순간 DB의 쓰기 잠금을 잡으므로(SQLite
// BEGIN IMMEDIATE) 다른 프로세스가 같은 키로 동시에 들어와도 이 트랜잭션이 커밋된 뒤에야
// 키를 조회한다 — 그 요청은 먼저 커밋된 행을 보고 같은 요청이면 재생(200), 다른 요청이면
// idempotency_conflict를 받고 rate limit을 소비하지 않는다. 그래서 같은 키·같은 요청의
// 동시 제출은 프로세스 수와 무관하게 상담 행 1개, 동일한 성공 응답, rate limit 소비 1회다.
// 이전에는 키 조회가 트랜잭션 밖이었고 rate limit 증가가 삽입과 별개로 커밋되어, 두 프로세스가
// 둘 다 조회를 통과해 [409 duplicate, 201]과 카운터 2(이중 소비)가 났다(원격에서 관측, 하네스
// T7). 스키마는 그대로다 — 기존 UNIQUE 인덱스(idempotency_key, result_id+contact_normalized)가
// 마지막 방어선이다.

type DrizzleDb = ReturnType<typeof getDb>;
type ConsultationRow = typeof consultations.$inferSelect;

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

// 쓰기 트랜잭션이 "무슨 일이 일어났는가"만 돌려준다 — HTTP 응답으로의 변환은 트랜잭션 밖에서
// 한다. 429와 duplicate도 정상 반환(커밋)이라 rate limit 카운터를 소비하고, 예상 밖 오류만
// 예외로 끝나 트랜잭션 전체(카운터 포함)가 롤백된다.
type SubmitOutcome =
  | { kind: "replay"; row: ConsultationRow }
  | { kind: "idempotency_conflict" }
  | { kind: "server_error" }
  | { kind: "rate_limited" }
  | { kind: "duplicate"; row: ConsultationRow }
  | { kind: "created"; row: ConsultationRow };

function toResponse(outcome: SubmitOutcome, contactNormalized: string): NextResponse {
  switch (outcome.kind) {
    case "replay":
      return NextResponse.json(toSuccessResult(outcome.row), { status: 200 });
    case "idempotency_conflict":
      return NextResponse.json(
        errorResult("idempotency_conflict", "이미 다른 내용으로 접수된 요청입니다."),
        { status: 409 }
      );
    case "server_error":
      return NextResponse.json(errorResult("server_error", "일시적인 오류가 발생했습니다."), {
        status: 500,
      });
    case "rate_limited":
      return NextResponse.json(errorResult("rate_limited", "잠시 후 다시 시도해 주세요."), {
        status: 429,
      });
    case "duplicate":
      return NextResponse.json(toDuplicateResult(outcome.row, contactNormalized), {
        status: 409,
      });
    case "created":
      return NextResponse.json(toSuccessResult(outcome.row), { status: 201 });
  }
}

// Nginx가 리버스 프록시로서 채우는 x-forwarded-for를 신뢰 가능한 원본 IP로
// 사용한다 — Next.js 프로세스는 127.0.0.1에만 바인딩되어 Nginx를 거치지 않은
// 요청은 애초에 도달할 수 없다(tech.md, design.md §9.3).
//
// [보안 재감사, 이번 세션] design.md §9.3은 "Nginx가 채우는 원본 IP를
// 사용한다"고만 적고 콤마로 구분된 여러 값 중 어느 인덱스를 신뢰할지는
// 명시하지 않았다 — 그 선택은 구현 세부사항이었다. 이전 구현은 첫 번째
// 값(`split(",")[0]`)을 신뢰했는데, 이는 표준 Nginx 레시피
// (`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`)가 클라이언트가
// 보낸 원래 헤더 값 뒤에 실제 클라이언트 IP를 이어 붙이는(append) 방식일
// 때 취약하다 — 외부 클라이언트가 요청에 `X-Forwarded-For: 1.2.3.4`를 직접
// 넣어 보내면 Nginx를 거친 뒤 헤더가 `"1.2.3.4, <진짜 IP>"`가 되고, 첫 번째
// 값을 고르면 신뢰할 수 없는 클라이언트 값을 그대로 rate limit 키로
// 쓰게 된다(공격자가 매 요청마다 다른 가짜 값을 넣어 rate limit을 완전히
// 우회할 수 있다). 이 저장소에는 실제 nginx.conf가 없어(Oracle Cloud VM에서
// 저장소 밖에 관리됨, tech.md) 실제 배포가 append 방식인지 overwrite
// 방식(`proxy_set_header X-Forwarded-For $remote_addr;`)인지 코드만으로는
// 확정할 수 없다 — 이는 design.md §4 운영 배포 체크리스트가 이미 별도
// 항목으로 요구하는 배포 확인 대상이다(§9.3, 미해결 운영 결정으로 남음).
// 다만 **마지막** 값을 신뢰하도록 바꾸면 두 배포 방식 모두에서 안전하다 —
// overwrite 방식이면 값이 하나뿐이라 결과가 그대로 같고, append 방식이면
// 마지막 값이 Nginx(유일한 신뢰 가능한 hop) 자신이 덧붙인 실제 클라이언트
// IP다. 이 프로젝트가 문서화한 배포 구조(Nginx 리버스 프록시 1개, 그 앞에
// CDN 등 추가 프록시 계층 없음, tech.md)에서는 "신뢰 가능한 hop 수만큼
// 뒤에서부터 신뢰한다"는 표준 관행과도 일치한다.
function getTrustedIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) {
    return null;
  }
  const parts = forwarded.split(",");
  const last = parts[parts.length - 1]?.trim();
  return last && last.length > 0 ? last : null;
}

// 같은 프로세스 안에서 동일 idempotencyKey를 공유하는 동시 요청(같은 버튼 재클릭 등)을 순차화한다.
// 정확성의 근거가 아니다 — 프로세스 수와 무관하게 같은 키의 동시 제출이 하나의 접수·동일한 성공
// 응답·rate limit 1회 소비가 되는 것은 아래 DB 쓰기 트랜잭션이 보장한다(D-NEW-25). 이 락은 같은
// 프로세스의 더블클릭이 DB 쓰기 잠금을 놓고 다투지 않게 줄이는 최적화이고, 로컬 file: 드라이버에서는
// 같은 프로세스의 동시 쓰기 트랜잭션이 SQLITE_BUSY로 실패하는 경우를 줄여 준다(수정 전 코드로 관측:
// 같은 키 동시 5건을 로컬 file DB에서 격리 실행하면 이 락 덕에 [201,200,200,200,200]이 나왔고,
// 서로 다른 키의 동시 요청은 로컬에서 SQLITE_BUSY로 실패했다 — 원격 HTTP 클라이언트에는 해당 없음).
// 서로 다른 idempotencyKey의 요청들은 이 락의 영향을 받지 않고 그대로 동시 처리된다.
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
  // 쓰기 트랜잭션이 실패했을 때 경쟁자의 행이 이미 있으면 재조회가 먼저 그 행으로 해석을
  // 시도하고(아래 resolveAfterFailedWrite), 그마저 해석 불가능한 경우에만 이 바깥 catch로
  // 넘어온다.
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

    // 쓰기 트랜잭션이 실패했을 때의 방어적 재조회 — 이미 경쟁자가 같은 키를 커밋했다면 그 행을
    // 기준으로 재생·충돌을 판정한다. 쓰기 잠금이 제대로 동작하는 DB에서는 UNIQUE 충돌이 여기까지
    // 오지 않지만, 원격에서 COMMIT 응답만 유실돼 실제로는 커밋된 모호한 실패도 이 재조회가 정확한
    // 성공(재생)으로 바꿔 준다. 같은 키의 결과만 해석한다 — 다른 키의 같은 업무 키 행이 있다고
    // duplicate로 바꾸면 본 경로(카운터 소비·커밋)와 달리 카운터가 롤백된 채 409가 나가고, 트랜잭션
    // 실패 원인이 409로 가려진다. 못 찾으면 null — 호출한 쪽이 원래 오류를 그대로 던진다.
    const resolveAfterFailedWrite = async (): Promise<SubmitOutcome | null> => {
      const [byKey] = await db
        .select()
        .from(consultations)
        .where(eq(consultations.idempotencyKey, payload.idempotencyKey))
        .limit(1);
      if (!byKey) return null;
      return byKey.requestFingerprint === fingerprint
        ? { kind: "replay", row: byKey }
        : { kind: "idempotency_conflict" };
    };

    // 4-9) 같은 프로세스의 동일 idempotencyKey 요청을 순차화한 뒤(위 withIdempotencyLock 주석),
    // DB 쓰기 트랜잭션 하나로 키 조회부터 삽입까지 실행한다(파일 머리 주석 D-NEW-25).
    return await withIdempotencyLock(payload.idempotencyKey, async () => {
      let outcome: SubmitOutcome;
      try {
        outcome = await db.transaction(async (tx): Promise<SubmitOutcome> => {
          // 4-6) idempotencyKey 조회 — 일치 시 기존 성공 반환, 불일치 시 거부. 이 두 경로
          // 모두 rate limit 판정을 거치지 않는다(§8.1 5-6번, D11). 쓰기 잠금을 잡은 뒤의
          // 조회이므로 다른 프로세스가 이미 커밋한 행을 반드시 본다.
          const [existingByKey] = await tx
            .select()
            .from(consultations)
            .where(eq(consultations.idempotencyKey, payload.idempotencyKey))
            .limit(1);
          if (existingByKey) {
            return existingByKey.requestFingerprint === fingerprint
              ? { kind: "replay", row: existingByKey }
              : { kind: "idempotency_conflict" };
          }

          // 7) rate limit 판정 — idempotencyKey 조회 결과 기존 레코드가 전혀 없어 이번
          // 제출이 진짜 신규 시도로 판정됐을 때만 실행된다(§8.1 7번, D11). 서버 시크릿·신뢰
          // 가능한 IP 부재는 이 단계에서만 500/server_error로 fail closed 처리된다(§9.3,
          // D17) — 앞선 2-6번 단계에서 이미 종료된 요청에는 적용되지 않는다.
          const secret = env.RATE_LIMIT_HMAC_SECRET;
          const trustedIp = getTrustedIp(request);
          if (!secret || !trustedIp) {
            return { kind: "server_error" };
          }

          const nowMs = Date.now();
          const windowStartMs = Math.floor(nowMs / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_WINDOW_MS;
          const ipHmac = createHmac("sha256", secret).update(trustedIp).digest("hex");

          // 카운터 증가(upsert)와 만료 행 정리(delete), 그리고 아래 중복 조회·삽입이 모두 같은
          // 트랜잭션이다 — 어느 하나라도 예외로 끝나면 카운터 증가까지 통째로 롤백되어 실패한
          // 시도는 카운트를 소비하지 않는다(같은 idempotencyKey의 재시도가 카운트를 두 번 태우지
          // 않는다, route.test.ts의 삽입·cleanup 실패 롤백 테스트). 429와 409/duplicate는
          // 예외가 아니라 정상 반환이므로 커밋되어 카운터를 소비한다.
          // [검증 범위] 로컬 file: SQLite 단위 테스트(경쟁 주입·롤백)와 로컬 두 프로세스 하네스
          // T7(원격 왕복 지연 모사)로 확인했다. 원격 Turso(HTTP)에서의 실행은 별도로
          // scripts/verify-remote-consult.ts로 확인한다(결과와 범위는 progress.md D-NEW-25).
          const [{ requestCount }] = await tx
            .insert(consultationRateLimits)
            .values({ windowStart: new Date(windowStartMs), ipHmac, requestCount: 1 })
            .onConflictDoUpdate({
              target: [consultationRateLimits.windowStart, consultationRateLimits.ipHmac],
              set: { requestCount: sql`${consultationRateLimits.requestCount} + 1` },
            })
            .returning({ requestCount: consultationRateLimits.requestCount });

          await tx
            .delete(consultationRateLimits)
            .where(
              lt(consultationRateLimits.windowStart, new Date(nowMs - RATE_LIMIT_RETENTION_MS))
            );

          if (requestCount > RATE_LIMIT_MAX_REQUESTS) {
            return { kind: "rate_limited" };
          }

          // 8) 비즈니스 중복 조회 — resultId + 정규화 연락처 복합 키(AND)
          const [existingByBusinessKey] = await tx
            .select()
            .from(consultations)
            .where(
              and(
                eq(consultations.resultId, payload.resultId),
                eq(consultations.contactNormalized, contactNormalized)
              )
            )
            .limit(1);
          if (existingByBusinessKey) {
            return { kind: "duplicate", row: existingByBusinessKey };
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
          await tx.insert(consultations).values(newRow);
          return { kind: "created", row: newRow };
        });
      } catch (writeError) {
        // 10) 쓰기 트랜잭션이 실패했다 — 경쟁자의 행이 이미 있으면 그 행으로 해석하고, 재조회가
        // 실패하거나 아무것도 없으면 원래 오류를 그대로 전달해 바깥 catch가 공통 500/server_error
        // 포맷으로 응답하게 한다(재조회 자체의 오류가 원래 오류를 가리지 않게 삼킨다).
        const resolved = await resolveAfterFailedWrite().catch(() => null);
        if (!resolved) {
          throw writeError;
        }
        // 구제된 실패도 흔적을 남긴다 — 그렇지 않으면 BEGIN 타임아웃·COMMIT 유실이 모두 조용히
        // 재생/충돌 응답으로 바뀌어 운영에서 트랜잭션 실패율을 알 수 없다.
        console.warn(
          JSON.stringify({
            event: "consultation_write_tx_failed_resolved",
            outcome: resolved.kind,
            ...toSafeErrorMeta(writeError),
          })
        );
        outcome = resolved;
      }
      return toResponse(outcome, contactNormalized);
    });
  } catch (error) {
    console.error(
      JSON.stringify({ event: "consultation_request_failed", ...toSafeErrorMeta(error) })
    );
    return NextResponse.json(errorResult("server_error", "일시적인 오류가 발생했습니다."), {
      status: 500,
    });
  }
}
