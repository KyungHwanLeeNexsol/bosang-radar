import { test, expect } from "@playwright/test";
import { TESTER_A_EMAIL } from "../scripts/e2e-tester-emails.ts";
import { loginAsTester, requireTesterPassword } from "./helpers.ts";

// AC-RUNTIME-011 — 로그인 성공 및 미등록 이메일 거부. 시크릿 값 동일성은
// 주장하지 않는다(인증 흐름의 동작만 검증 — 그 값 동일성은
// scripts/run-e2e.test.ts의 AC-RUNTIME-022 구조적 검증이 담당한다).

test.describe("인증 — AC-RUNTIME-011", () => {
  test("등록된 테스터 A는 로그인에 성공해 보호 경로로 진입한다", async ({ page }) => {
    await loginAsTester(page, TESTER_A_EMAIL);

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("link", { name: "사건 입력 시작하기" })).toBeVisible();
  });

  test("allowed_testers에 없는 이메일은 로그인이 거부되어 세션이 생성되지 않는다", async ({
    page,
  }) => {
    const password = requireTesterPassword();

    await page.goto("/login");
    await page.getByTestId("login-email").fill("not-invited-e2e@example.com");
    await page.getByTestId("login-password").fill(password);
    await page.getByTestId("login-submit").click();

    await expect(page.getByTestId("login-error")).toBeVisible();
    await expect(page).toHaveURL("/login");

    // 세션이 생성되지 않았다면 보호 경로(/cases/*) 접근 시 proxy.ts가
    // /login으로 리다이렉트한다(REQ-SCAFFOLD-010).
    await page.goto("/cases/new");
    await expect(page).toHaveURL("/login");
  });
});
