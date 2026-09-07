import { test, expect } from "@playwright/test";
import { TESTER_A_EMAIL } from "../scripts/e2e-tester-emails.ts";
import { requireTesterPassword } from "./helpers.ts";

// B3(외부 리뷰, P1) — 모바일 드로어 닫힘 후 포커스가 실제로 햄버거 버튼으로
// 복귀하는지는 jsdom으로 증명할 수 없다: jsdom은 실브라우저의 "inert
// 서브트리 내부 focus() 호출 무시" 동작을 구현하지 않으므로, 단위 테스트가
// 통과해도 실브라우저에서 포커스가 실제로 이동했는지는 보장되지 않는다.
// 이 스펙은 실제 Chromium에서 열기/닫기 각 경로 이후 포커스 위치와
// app-shell-content의 inert 해제를 직접 관찰한다.

// Round3 회귀 수정 — workers:1 직렬 실행 환경에서 앞 테스트(case-flow.spec.ts)가
// TESTER_A로 로그인한 직후 mobile-drawer-focus도 같은 TESTER_A로 로그인을
// 시도하면 Better Auth의 rate limit("Too many requests")에 걸려 로그인이 실패한다.
// helpers.ts의 loginAsTester 대신 rate limit 오류를 감지해 최대 3회 재시도하는
// 로그인 헬퍼를 인라인 정의한다.
async function loginForDrawerTest(
  page: import("@playwright/test").Page,
  email: string
): Promise<void> {
  const password = requireTesterPassword();

  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto("/login");
    await page.getByTestId("login-email").fill(email);
    await page.getByTestId("login-password").fill(password);
    await page.getByTestId("login-submit").click();

    // rate limit 오류 메시지나 성공 리디렉트를 기다린다.
    const result = await Promise.race([
      page.waitForURL("/").then(() => "success" as const),
      page
        .getByTestId("login-error")
        .waitFor({ state: "visible" })
        .then(() => "error" as const),
    ]);

    if (result === "success") return;

    // rate limit 오류면 Better Auth의 기본 창(10초)보다 길게 대기 후 재시도한다.
    // Better Auth 기본값: /sign-in 경로에 10초 창 최대 3요청(getDefaultSpecialRules).
    const errorText = await page.getByTestId("login-error").textContent();
    if (errorText?.includes("Too many requests")) {
      await page.waitForTimeout(12_000);
      continue;
    }
    // 다른 로그인 오류는 즉시 예외를 던진다.
    throw new Error(`로그인 실패: ${errorText}`);
  }

  throw new Error("로그인 재시도 횟수 초과 — rate limit가 해소되지 않았습니다.");
}

test.describe("모바일 드로어 포커스 복귀 — B3(외부 리뷰)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("열기/닫기 각 경로(닫기 버튼/ESC/스크림/nav 링크) 이후 포커스가 올바르게 이동한다", async ({
    page,
  }) => {
    await loginForDrawerTest(page, TESTER_A_EMAIL);
    await page.goto("/cases/new");

    const toggleButton = page.getByTestId("mobile-nav-toggle");
    const closeButton = page.getByRole("button", { name: "메뉴 닫기" });
    const drawer = page.getByTestId("mobile-nav-drawer");
    const scrim = page.getByTestId("mobile-nav-scrim");
    const backgroundContent = page.getByTestId("app-shell-content");

    // 1) 햄버거 버튼 클릭 → 드로어 내부(닫기 버튼)로 포커스 이동 + 배경은
    // inert로 비활성화된다(AC-017k).
    await toggleButton.click();
    await expect(closeButton).toBeFocused();
    await expect(backgroundContent).toHaveAttribute("inert", "");

    // 2) 닫기 버튼으로 닫기 → 햄버거 버튼으로 포커스 복귀 + 배경 inert 해제.
    await closeButton.click();
    // "lg:translate-x-0"는 열림/닫힘과 무관하게 항상 존재하는 정적
    // 클래스이므로 /translate-x-0/ 부분 일치는 열림/닫힘을 구분하지
    // 못한다 — 닫힘 상태에서만 붙는 "-translate-x-full" 토큰으로 판별한다.
    await expect(drawer).toHaveClass(/-translate-x-full/);
    await expect(toggleButton).toBeFocused();
    await expect(backgroundContent).not.toHaveAttribute("inert", "");

    // 3) 재오픈 → ESC로 닫기 → 포커스 복귀.
    await toggleButton.click();
    await expect(closeButton).toBeFocused();
    await page.keyboard.press("Escape");
    // "lg:translate-x-0"는 열림/닫힘과 무관하게 항상 존재하는 정적
    // 클래스이므로 /translate-x-0/ 부분 일치는 열림/닫힘을 구분하지
    // 못한다 — 닫힘 상태에서만 붙는 "-translate-x-full" 토큰으로 판별한다.
    await expect(drawer).toHaveClass(/-translate-x-full/);
    await expect(toggleButton).toBeFocused();
    await expect(backgroundContent).not.toHaveAttribute("inert", "");

    // 4) 재오픈 → 스크림 클릭으로 닫기 → 포커스 복귀.
    await toggleButton.click();
    await expect(scrim).toBeVisible();
    await scrim.click();
    // "lg:translate-x-0"는 열림/닫힘과 무관하게 항상 존재하는 정적
    // 클래스이므로 /translate-x-0/ 부분 일치는 열림/닫힘을 구분하지
    // 못한다 — 닫힘 상태에서만 붙는 "-translate-x-full" 토큰으로 판별한다.
    await expect(drawer).toHaveClass(/-translate-x-full/);
    await expect(toggleButton).toBeFocused();
    await expect(backgroundContent).not.toHaveAttribute("inert", "");

    // 5) 재오픈 → nav 링크(사건 입력) 클릭으로 닫기 — 같은 페이지로의
    // 링크이므로 내비게이션 자체는 no-op에 가깝지만, 클릭 즉시 드로어가
    // 닫혀야 한다(B2 회귀 확인 겸 B3의 nav-link 닫힘 경로 커버).
    await toggleButton.click();
    const inputLink = drawer.getByRole("link", { name: "사건 입력" });
    await inputLink.click();
    // "lg:translate-x-0"는 열림/닫힘과 무관하게 항상 존재하는 정적
    // 클래스이므로 /translate-x-0/ 부분 일치는 열림/닫힘을 구분하지
    // 못한다 — 닫힘 상태에서만 붙는 "-translate-x-full" 토큰으로 판별한다.
    await expect(drawer).toHaveClass(/-translate-x-full/);
    await expect(scrim).toBeHidden();
  });
});
