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
// 아니라 실제 요청 수로 증명하기 위함이다(AC-E2EAUTH-014). storageState 저장
// 직후 새 브라우저 컨텍스트로 그 파일을 로드해 GET /api/auth/get-session을
// 호출하는 계정 검증은, 서버가 살아 있는 이 setup 단계에서 매 실행마다
// 상시 도는 검증이다(AC-E2EAUTH-015a/015b) — leftover 재실행 시의
// 해시/mtime 비교와는 독립적인, "저장된 파일이 실제로 그 테스터로
// 인증되는가"에 대한 별도의 확인이다.
import { test, expect, type Page, type Browser } from "@playwright/test";
import { TESTER_A_EMAIL, TESTER_B_EMAIL } from "../scripts/e2e-tester-emails.ts";
import { requireTesterPassword } from "./helpers.ts";
import { TESTER_A_STORAGE_STATE_PATH, TESTER_B_STORAGE_STATE_PATH } from "./storage-state-paths.ts";

// Better Auth(설치본 1.7.1)의 이메일 로그인 엔드포인트 — 소스 실측 확인:
// node_modules/better-auth/dist/api/routes/sign-in.mjs
// createAuthEndpoint("/sign-in/email", ...). basePath/rateLimit 커스터마이즈
// 없음(lib/auth/config.ts 실측 확인)이므로 기본 마운트 경로 하위에 그대로
// 노출된다(plan.md §D).
const SIGN_IN_EMAIL_PATHNAME = "/api/auth/sign-in/email";

// Better Auth 세션 조회 엔드포인트 — 소스 실측 확인:
// node_modules/better-auth/dist/api/routes/session.mjs
// createAuthEndpoint("/get-session", ...). 응답 스키마 { session, user }
// (basePath 커스터마이즈 없음 — 위 SIGN_IN_EMAIL_PATHNAME과 동일 근거).
const GET_SESSION_PATHNAME = "/api/auth/get-session";

interface GetSessionResponseBody {
  session: unknown;
  user: { email: string } | null;
}

async function loginAndSaveStorageState(
  page: Page,
  browser: Browser,
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

  // AC-E2EAUTH-015a/015b — 저장 직후, 저장한 파일 그 자체를 새 브라우저
  // 컨텍스트에 로드해 실제로 그 테스터로 인증되는지 확인한다. 로그인에
  // 사용한 기존 컨텍스트(`page.context()`)를 확인하는 것으로는 대체할 수
  // 없다 — 그것은 "살아 있는 로그인 세션"을 확인할 뿐, 디스크에 저장된
  // storageState 파일 자체가 유효한지는 증명하지 못한다. baseURL은 이
  // 실행에서 실제로 로그인에 사용한 서버 origin(`page.url()`)에서 구한다.
  const baseURL = new URL(page.url()).origin;
  const verifyContext = await browser.newContext({ storageState: storageStatePath, baseURL });
  try {
    const response = await verifyContext.request.get(GET_SESSION_PATHNAME);
    expect(response.ok()).toBe(true);
    const body = (await response.json()) as GetSessionResponseBody;
    // [HARD] 응답 전체·세션 쿠키는 로그에 남기지 않는다 — 비교에 필요한
    // user.email 필드만 단언에 사용한다(AC-E2EAUTH-015a/015b 증거 기록 제약).
    expect(body.user?.email).toBe(email);
  } finally {
    await verifyContext.close();
  }
}

test("TESTER_A 로그인 후 storageState 저장", async ({ page, browser }) => {
  await loginAndSaveStorageState(page, browser, TESTER_A_EMAIL, TESTER_A_STORAGE_STATE_PATH);
});

test("TESTER_B 로그인 후 storageState 저장", async ({ page, browser }) => {
  await loginAndSaveStorageState(page, browser, TESTER_B_EMAIL, TESTER_B_STORAGE_STATE_PATH);

  // [외부 재검토 v0.1.6 대응] setup의 TESTER_A/TESTER_B 로그인 2건이 뒤이어
  // 실행되는 chromium project(auth.spec.ts 2건 + case-flow.spec.ts 1건)와
  // 같은 Better Auth rate-limit 창(10초/최대 3회, /sign-in/email)을
  // 공유해 4~5번째 요청을 429로 밀어냈다(직접 계측으로 원인 확정 —
  // progress.md § case-flow 회귀 재조사(v0.1.6) 참고). setup은 이 SPEC이
  // 신설한 유일한 수정 가능 파일이므로, TESTER_B 완료 직후 여기서
  // 10초를 대기해 setup의 2건이 chromium project 시작 시점에는 이미
  // 그 창 밖으로 나가도록 만든다 — workers/retries/webServer,
  // auth.spec.ts/case-flow.spec.ts 소스, Better Auth rate-limit 설정은
  // 모두 무변경으로 유지된다(REQ-E2EAUTH-003/005/009/011 PRESERVE 준수).
  await page.waitForTimeout(10_000);
});
