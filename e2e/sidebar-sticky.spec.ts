// e2e/sidebar-sticky.spec.ts
// SPEC-UI-MIGRATION-001 correction pass (2026-09-08, 사용자 승인) —
// 데스크톱(lg 이상) App Shell 사이드바가 뷰포트 높이 기준으로 고정되어,
// 폼이 뷰포트보다 긴 화면(/cases/new)에서도 사이드바 하단 사용자 블록이
// 초기 뷰포트 안에 보이는지 실제 브라우저에서 검증한다. jsdom은 실제
// sticky/layout 계산을 수행하지 않으므로(app-shell-chrome.test.tsx는
// 접근성 계약만 검증), 이 계약은 Playwright로만 검증 가능하다.
//
// 판정 조건은 e2e/sidebar-assertions.ts의 assertStickySidebarUserBlockVisible
// 공통 helper로 위임한다 — capture-evidence-round5.spec.ts의 sticky 캡처
// 테스트와 판정 조건이 갈라지지 않도록 하기 위함이다(외부 재검토 지적).
import { test, expect } from "@playwright/test";
import { loginAsTester } from "./helpers.ts";
import { assertStickySidebarUserBlockVisible } from "./sidebar-assertions.ts";
import { TESTER_A_EMAIL } from "../scripts/e2e-tester-emails.ts";

const DESKTOP_VIEWPORTS = [
  { width: 1024, height: 768, label: "1024" },
  { width: 1440, height: 900, label: "1440" },
] as const;

test.describe("데스크톱 사이드바 sticky — 사용자 블록 초기 뷰포트 가시성", () => {
  test("긴 폼 화면(/cases/new)에서 사용자 블록이 스크롤 없이 보인다", async ({ page }) => {
    await loginAsTester(page, TESTER_A_EMAIL);

    for (const vp of DESKTOP_VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/cases/new");
      await page.waitForLoadState("networkidle");

      const measurement = await assertStickySidebarUserBlockVisible(page, vp);
      console.log(`[sidebar-sticky] ${vp.label}px:`, JSON.stringify(measurement));

      // 본문(app-shell-content)이 실제로 렌더링됐는지 sanity 확인 — 폼이
      // 전혀 안 그려진 채 우연히 사이드바-only 상태로 테스트를 통과하는
      // 것을 방지한다. 1024px에서는 폼이 뷰포트보다 실제로 길다는 것을
      // 알고 있으므로(수정 전 aside 높이 1268.75px로 실측) 그 경계로
      // 확인하고, 1440px는 더 넓은 폭에서 폼이 재배치되며 뷰포트 안에
      // 들어갈 수 있으므로 뷰포트 대비 비교 대신 절대 최소 높이만 확인한다.
      const contentScrollHeight = await page
        .getByTestId("app-shell-content")
        .evaluate((el) => el.scrollHeight);
      if (vp.label === "1024") {
        expect(
          contentScrollHeight,
          `${vp.label}px: main content must still be taller than the viewport (regression guard — the original bug reproduces here)`
        ).toBeGreaterThan(vp.height);
      } else {
        expect(
          contentScrollHeight,
          `${vp.label}px: main content must have actually rendered (sanity check)`
        ).toBeGreaterThan(400);
      }
    }
  });
});
