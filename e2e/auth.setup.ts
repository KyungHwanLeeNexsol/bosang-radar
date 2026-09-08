// e2e/auth.setup.ts — SPEC-E2E-AUTH-STATE-001
//
// Playwright "setup" project: TESTER_A/TESTER_B 각각 이 setup 단계 자신의
// 실행 범위 안에서 정확히 1회 UI 로그인(/login 경유)을 수행하고, 결과
// 브라우저 컨텍스트의 storageState를 파일로 저장한다(REQ-E2EAUTH-001).
//
// loginAsTester()는 import하지 않는다 — 그 함수를 재사용하면 helpers.ts
// 변경 시 이 파일의 동작이 암묵적으로 결합되므로, helpers.ts 무변경 제약
// (REQ-E2EAUTH-004)과는 별개로 독립성을 위해 로그인 절차를 직접 재현한다
// (plan.md §D). requireTesterPassword()만 재사용한다 — 읽기 전용 헬퍼
// 재사용은 helpers.ts 자체를 건드리지 않으므로 REQ-E2EAUTH-004와 무관하다.
//
// @MX:NOTE: [AUTO] 이 파일은 playwright.config.ts의 setup project에 의해서만
// 실행되며, 개별 `pnpm exec playwright test auth.setup` 직접 실행도
// 가능하지만 CI/로컬 표준 경로는 `pnpm test:e2e`뿐이다. `/api/auth/sign-in/email`
// 네트워크 카운팅은 REQ-E2EAUTH-001의 "테스터당 1회" 요구를 UI 리다이렉트가
// 아니라 실제 요청 수로 증명하기 위함이다(AC-E2EAUTH-014).
import { test, expect, type Page } from "@playwright/test";
import { TESTER_A_EMAIL, TESTER_B_EMAIL } from "../scripts/e2e-tester-emails.ts";
import { requireTesterPassword } from "./helpers.ts";
import { TESTER_A_STORAGE_STATE_PATH, TESTER_B_STORAGE_STATE_PATH } from "./storage-state-paths.ts";

// Better Auth(설치본 1.7.1)의 이메일 로그인 엔드포인트 — 소스 실측 확인:
// node_modules/better-auth/dist/api/routes/sign-in.mjs
// createAuthEndpoint("/sign-in/email", ...). basePath/rateLimit 커스터마이즈
// 없음(lib/auth/config.ts 실측 확인)이므로 기본 마운트 경로 하위에 그대로
// 노출된다(plan.md §D).
const SIGN_IN_EMAIL_PATHNAME = "/api/auth/sign-in/email";

async function loginAndSaveStorageState(
  page: Page,
  email: string,
  storageStatePath: string
): Promise<void> {
  const password = requireTesterPassword();

  // [HARD] 로그인을 트리거하기 전에 리스너를 등록한다. page.on("request", ...)는
  // 매 시도마다 발화하므로 실패/네트워크 오류로 끝난 요청도 계수한다 —
  // page.on("requestfinished", ...)만 쓰면 성공적으로 완료된 요청만 잡혀
  // rate-limit에 걸려 실패한 시도를 놓칠 수 있다(구현 시 정정 사항).
  let signInHits = 0;
  page.on("request", (req) => {
    if (req.method() === "POST" && new URL(req.url()).pathname === SIGN_IN_EMAIL_PATHNAME) {
      signInHits += 1;
    }
  });

  await page.goto("/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL("/");

  // AC-E2EAUTH-014 — "테스터당 정확히 1회"를 UI 리다이렉트가 아니라 실제
  // 네트워크 요청 수로 직접 증명한다. 이 카운트는 쿠키·토큰을 포함하지
  // 않는 순수 정수이므로 검증 증거로 그대로 로그에 남겨도 안전하다.
  expect(signInHits).toBe(1);

  await page.context().storageState({ path: storageStatePath });
}

test("TESTER_A 로그인 후 storageState 저장", async ({ page }) => {
  await loginAndSaveStorageState(page, TESTER_A_EMAIL, TESTER_A_STORAGE_STATE_PATH);
});

test("TESTER_B 로그인 후 storageState 저장", async ({ page }) => {
  await loginAndSaveStorageState(page, TESTER_B_EMAIL, TESTER_B_STORAGE_STATE_PATH);
});
