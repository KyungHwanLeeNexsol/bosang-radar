// e2e/*.spec.ts와 scripts/run-e2e.ts가 공유하는 테스터 이메일 SSOT.
//
// [HARD] 이 파일은 `import.meta`를 (직접적으로도, 다른 모듈을 통한 재수출로도)
// 사용하지 않는다 — Playwright Test의 spec 번들러는 기본적으로 CommonJS로
// 변환하므로, spec 파일이 `import.meta`를 사용하는 모듈을 간접적으로라도
// import하면 `SyntaxError: Cannot use 'import.meta' outside a module`로
// 실패한다(M5 실측 — `e2e/*.spec.ts`가 `scripts/run-e2e.ts`를 직접 import했을
// 때 재현됨; `run-e2e.ts`는 물론 그것이 import하는 `cli-bootstrap.ts`/
// `db-migrate.ts`/`db-seed.ts`/`provision-tester.ts` 모두 모듈 최상위에서
// `import.meta.url`을 읽는 `isDirectExecution` 판별 코드를 갖고 있다). 이메일
// 상수 두 개만 이 leaf 모듈로 분리해 spec 파일의 import 그래프가 그 코드들에
// 닿지 않게 한다.
export const TESTER_A_EMAIL = "e2e-tester-a@example.com";
export const TESTER_B_EMAIL = "e2e-tester-b@example.com";
