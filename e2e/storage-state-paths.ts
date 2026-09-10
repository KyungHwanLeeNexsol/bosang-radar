// e2e/auth.setup.ts와 e2e/case-input-mobile-layout.spec.ts·e2e/tenant-isolation.spec.ts가
// 공유하는 Playwright storageState 파일 경로 SSOT(SPEC-E2E-AUTH-STATE-001 M2).
//
// @MX:NOTE: [AUTO] 이 leaf 모듈은 문자열 상수만 export한다 — auth.setup.ts가
// 저장하는 경로와 두 대상 스펙 파일이 test.use({ storageState })로 읽는 경로가
// 항상 같은 값을 가리키도록 하는 단일 SSOT다.
// @MX:REASON: scripts/e2e-tester-emails.ts 상단 주석과 동일한 leaf-module
// 규율(REQ-E2EAUTH-010, AC-E2EAUTH-010) — Playwright spec 번들러가
// e2e/*.spec.ts를 CommonJS로 변환하므로, spec 파일이 ESM 전용 모듈 메타
// 프로퍼티(`meta` 키워드, 여기서는 그 특수 토큰을 리터럴로 쓰지 않도록
// 의도적으로 우회 서술한다 — AC-E2EAUTH-010의 grep 검증이 이 파일 자체를
// 스캔하기 때문)를 사용하는 모듈을 직접·간접적으로 import하면 CJS 번들
// 오류로 실패한다. 이 파일은 문자열 리터럴만 export하므로 그 규율을
// 자명하게 충족하며, 향후 유지보수자는 그 토큰을 사용하는 모듈을 이
// 파일에 절대 끌어들이지 말아야 한다(정확한 실패 메시지와 메커니즘은
// scripts/e2e-tester-emails.ts 상단 주석 참고).
export const TESTER_A_STORAGE_STATE_PATH = ".tmp/storageState-tester-a.json";
export const TESTER_B_STORAGE_STATE_PATH = ".tmp/storageState-tester-b.json";
