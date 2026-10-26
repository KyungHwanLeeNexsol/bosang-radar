// 실행 식별자(runId)의 형식 — 증거 폴더 이름(`<evidence-root>/<runId>`)이 될 수 있는 값만 허용한다.
//
// 이 규칙의 유일한 출처다. CLI(--run-id를 받은 직후, 경로를 만들거나 자원을 얻기 전), 하네스(runHarness 직접 호출), 대조 기록 읽기
// 어댑터(기록의 run_id)가 모두 이 함수를 쓴다. 규칙을 복제하면 한쪽만 고쳐져 다시 어긋나므로 다른 파일에 정규식을 두지 않는다.
//
// 허용: 영숫자(ASCII)로 시작하고 영숫자·`.`·`_`·`-`만, 1~128자. 그래서 `.`·`..`·구분자(`/`·`\`)·절대 경로·공백·제어 문자·
// 끝의 개행은 모두 거절된다(JS에서 `$`는 문자열 끝에만 맞는다). 이 모듈은 순수하다: 입출력도 환경 접근도 없다.
//
// 공개 API:
//   isValidRunId(value: unknown): value is string
//   RUN_ID_RULE: string      사람이 읽는 규칙 설명(오류 문구용)

const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export const RUN_ID_RULE = "영숫자로 시작하고 영숫자·`.`·`_`·`-`만 쓴 1~128자";

export function isValidRunId(value: unknown): value is string {
  return typeof value === "string" && RUN_ID.test(value);
}
