// SPEC-PILOT-READY-001 v0.6.0 (외부 구현 검토 5차 반영) — PII 비노출 로깅
// 헬퍼. `error: String(error)`는 근본 원인 오류의 .message가 우연히
// 사건 입력 원문(incidentDescription/diagnosisName/disabilityBodyPart)
// 일부를 반사할 위험이 있다(예: DB 드라이버 오류, validation 라이브러리
// 오류가 자신에게 전달된 값을 메시지에 그대로 포함하는 경우). 이 헬퍼는
// .message를 절대 읽지 않고, 화이트리스트된 메타데이터(errorName/
// errorCode)만 추출한다.
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
export interface SafeErrorMeta {
  errorName: string;
  errorCode?: string;
}

export function toSafeErrorMeta(error: unknown): SafeErrorMeta {
  if (error instanceof Error) {
    const meta: SafeErrorMeta = { errorName: error.name || "Error" };
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" || typeof code === "number") {
      meta.errorCode = String(code);
    }
    return meta;
  }
  return { errorName: "UnknownError" };
}
