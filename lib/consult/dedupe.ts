// SPEC-B2C-CONSULT-001 M4 (design.md §5 파일 트리, §8 "resultId + 정규화
// 연락처 복합 키") — resultId + 정규화 연락처 기반 비즈니스 중복 판정 키를
// 도출하는 순수 함수. app/api/consultations/route.ts(M2)의 실제 중복 조회는
// drizzle의 and(eq(resultId), eq(contactNormalized)) 복합 조건으로 직접
// 수행되며(§8.1 8번), 이 함수를 문자열 키로 사용하지 않는다 — 이 함수는
// 같은 비즈니스 규칙을 서버·클라이언트가 순수 함수 형태로 공유할 수 있게
// 도출해 둔 것으로, route.ts의 기존 동작을 바꾸지 않는다.

export interface ConsultationDuplicateKeyInput {
  resultId: string;
  contactNormalized: string;
}

/**
 * resultId + 정규화 연락처를 결합한 결정론적 문자열 키를 반환한다. DB
 * 접근이나 부수효과가 없는 순수 함수다.
 */
export function computeConsultationDuplicateKey(input: ConsultationDuplicateKeyInput): string {
  return `${input.resultId}::${input.contactNormalized}`;
}
