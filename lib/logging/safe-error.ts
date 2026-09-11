// SPEC-PILOT-READY-001 v0.7.0 (외부 구현 검토 6차 반영) — PII 비노출 로깅
// 헬퍼. `error: String(error)`는 근본 원인 오류의 .message가 우연히
// 사건 입력 원문(incidentDescription/diagnosisName/disabilityBodyPart)
// 일부를 반사할 위험이 있다(예: DB 드라이버 오류, validation 라이브러리
// 오류가 자신에게 전달된 값을 메시지에 그대로 포함하는 경우). 이 헬퍼는
// .message를 절대 읽지 않는다.
//
// v0.7.0 정정(외부 구현 검토 6차) — v0.6.0의 errorName/errorCode는
// "화이트리스트"라는 주석과 달리 실제로는 error.name/.code를 검증 없이
// 그대로 통과시켰다(error.name은 공격자/라이브러리가 임의 문자열로 설정
// 가능하고, error.code도 typeof 검사만으로 임의 값을 통과시켰다). 이제는
// 아래 KNOWN_ERROR_NAMES/KNOWN_ERROR_CODES라는 고정된 안전 목록에 있는
// 값만 통과시킨다 — 목록에 없는 errorName은 "UnclassifiedError"로
// 대체하고, 목록에 없는 errorCode는 필드 자체를 생략한다(그대로
// 통과시키지 않는다).
//
// @MX:ANCHOR: [AUTO] lib/cases/create-case.ts와 lib/pipeline/index.ts의
// 모든 console.error 구조적 로그 호출부가 이 함수를 통해서만 오류 정보를
// 로그에 담는다 — 이 함수를 우회해 error.message나 String(error)를 직접
// 로그에 넣지 않는 것이 PII 비노출 계약의 핵심이다.
// @MX:REASON: fan_in >= 3(create-case.ts의 pipeline_failed/
// completion_transaction_failed/post_failure_lease_release_failed 3개
// 호출부 + pipeline/index.ts의 withStageLogging/withAsyncStageLogging
// 2개 호출부) — 이 함수가 유일한 PII 비노출 경계이므로 호출부를 늘릴 때도
// 반드시 이 함수를 거쳐야 한다.

// errorName 고정 화이트리스트 — 표준 JS 내장 에러 이름 + 이 코드베이스의
// 로그 경로(create-case.ts, pipeline/index.ts)에서 실제로 던져지는
// 앱 전용/드라이버 에러 이름만 포함한다.
const KNOWN_ERROR_NAMES: ReadonlySet<string> = new Set([
  // 표준 JS 내장 에러 이름 (ECMAScript 사양)
  "Error",
  "TypeError",
  "RangeError",
  "SyntaxError",
  "ReferenceError",
  "EvalError",
  "URIError",
  "AggregateError",
  // create-case.ts 펜싱 게이트 내부 에러
  "LeaseFencedError",
  // @libsql/client(DB 드라이버) — 제약조건 위반, 네트워크 오류 등
  // (node_modules/@libsql/core/lib-esm/api.js 확인: 두 클래스 모두
  // 생성자에서 this.name을 명시적으로 이 값으로 설정한다)
  "LibsqlError",
  "LibsqlBatchError",
]);

// errorCode 고정 화이트리스트 — 이 코드베이스가 실제로 마주칠 수 있는
// DB 드라이버/네트워크 오류 코드만 포함한다. 목록에 없는 값(예: validation
// 라이브러리가 입력값을 code에 그대로 담는 경우)은 절대 통과시키지 않는다.
const KNOWN_ERROR_CODES: ReadonlySet<string> = new Set([
  // SQLite 기본 결과 코드(primary result code) — https://www.sqlite.org/rescode.html
  "SQLITE_ERROR",
  "SQLITE_INTERNAL",
  "SQLITE_PERM",
  "SQLITE_ABORT",
  "SQLITE_BUSY",
  "SQLITE_LOCKED",
  "SQLITE_NOMEM",
  "SQLITE_READONLY",
  "SQLITE_INTERRUPT",
  "SQLITE_IOERR",
  "SQLITE_CORRUPT",
  "SQLITE_NOTFOUND",
  "SQLITE_FULL",
  "SQLITE_CANTOPEN",
  "SQLITE_PROTOCOL",
  "SQLITE_EMPTY",
  "SQLITE_SCHEMA",
  "SQLITE_TOOBIG",
  "SQLITE_CONSTRAINT",
  "SQLITE_MISMATCH",
  "SQLITE_MISUSE",
  "SQLITE_NOLFS",
  "SQLITE_AUTH",
  "SQLITE_FORMAT",
  "SQLITE_RANGE",
  "SQLITE_NOTADB",
  "SQLITE_NOTICE",
  "SQLITE_WARNING",
  // 자주 발생하는 SQLite 제약조건 확장 코드(extended result code)
  "SQLITE_CONSTRAINT_PRIMARYKEY",
  "SQLITE_CONSTRAINT_UNIQUE",
  "SQLITE_CONSTRAINT_FOREIGNKEY",
  "SQLITE_CONSTRAINT_NOTNULL",
  "SQLITE_CONSTRAINT_CHECK",
  "SQLITE_CONSTRAINT_TRIGGER",
  // @libsql/client 클라이언트측 오류 코드
  // (node_modules/@libsql/client, @libsql/hrana-client 소스 확인)
  "CLIENT_CLOSED",
  "TRANSACTION_CLOSED",
  "URL_INVALID",
  "ENCRYPTION_KEY_NOT_SUPPORTED",
  "SYNC_NOT_SUPPORTED",
  // Node.js 네트워크 오류 코드 — Turso(원격 libSQL) 접속 실패 시나리오
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "ECONNRESET",
  "EPIPE",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
]);

export interface SafeErrorMeta {
  errorName: string;
  errorCode?: string;
}

export function toSafeErrorMeta(error: unknown): SafeErrorMeta {
  if (error instanceof Error) {
    const name = error.name;
    const meta: SafeErrorMeta = {
      errorName: KNOWN_ERROR_NAMES.has(name) ? name : "UnclassifiedError",
    };
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" || typeof code === "number") {
      const codeStr = String(code);
      if (KNOWN_ERROR_CODES.has(codeStr)) {
        meta.errorCode = codeStr;
      }
    }
    return meta;
  }
  return { errorName: "UnknownError" };
}
