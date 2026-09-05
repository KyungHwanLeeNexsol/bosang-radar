// e2e/capture-evidence.spec.ts
// 시각 증빙 캡처 — SPEC-UI-MIGRATION-001 Round 3 after-state
//
// WARNING: 단독 실행 전용. 전체 suite와 함께 실행하면 rate limit이 발생할 수 있다.
//   CAPTURE_EVIDENCE=1 npx tsx scripts/run-e2e.ts --spec=e2e/capture-evidence.spec.ts --workers=1
// 출력: docs/evidence/SPEC-UI-MIGRATION-001/after-round3/*.png
//
// rate limit 회피: 인증 필요 화면은 단일 loginAsTester 호출(1회만)로 세션을
// 유지한 채 모든 화면을 순서대로 캡처한다.
import { test } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import { loginAsTester } from "./helpers.ts";
import { TESTER_A_EMAIL } from "../scripts/e2e-tester-emails.ts";

const EVIDENCE_DIR = path.join(
  process.cwd(),
  "docs/evidence/SPEC-UI-MIGRATION-001/after-round3"
);

const DESKTOP_VIEWPORTS = [
  { width: 1440, height: 900, label: "1440" },
  { width: 1024, height: 768, label: "1024" },
  { width: 390, height: 844, label: "390" },
] as const;

test.describe("시각 증빙 캡처", () => {
  // 전체 suite에서 실행 시 rate limit 방지: CAPTURE_EVIDENCE=1 환경변수로 활성화
  test.skip(!process.env.CAPTURE_EVIDENCE, "CAPTURE_EVIDENCE=1 환경변수로 활성화");

  test.beforeAll(() => {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  });

  test("로그인 화면 — 인증 없이 캡처", async ({ page }) => {
    for (const vp of DESKTOP_VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/login");
      await page.waitForLoadState("networkidle");
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, `login-${vp.label}.png`),
        fullPage: false,
      });
    }
  });

  test("인증 필요 화면 전체 — 단일 세션", async ({ page }) => {
    // 1회 로그인으로 모든 인증 필요 화면을 캡처한다 (rate limit 회피).
    await loginAsTester(page, TESTER_A_EMAIL);

    // 사건 입력 — 3개 뷰포트
    for (const vp of DESKTOP_VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/cases/new");
      await page.waitForLoadState("networkidle");
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, `case-input-${vp.label}.png`),
        fullPage: false,
      });
    }

    // 예외 화면 — 존재하지 않는 사건 ID (1440px)
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/cases/case-id-nonexistent-evidence-capture");
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "exception-not-found-1440.png"),
      fullPage: false,
    });

    // 모바일 드로어 (390px) — 닫힘 / 열림
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/cases/new");
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "mobile-drawer-closed-390.png"),
      fullPage: false,
    });
    const toggleBtn = page.getByTestId("mobile-nav-toggle");
    await toggleBtn.click();
    await page.waitForTimeout(300); // 드로어 열림 애니메이션 대기
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "mobile-drawer-open-390.png"),
      fullPage: false,
    });
  });
});
