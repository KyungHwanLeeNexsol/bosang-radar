// e2e/sidebar-assertions.ts
// SPEC-UI-MIGRATION-001 correction pass (2026-09-08) — 공통 검증 helper.
// e2e/helpers.ts는 PRESERVE 대상이라 여기에 새 파일로 분리한다.
//
// 데스크톱(lg 이상) App Shell 사이드바가 뷰포트 높이 기준으로 sticky
// 고정되어 있고, 하단 사용자 블록이 스크롤 없이 초기 뷰포트 안에
// 보이는지 검증한다. sidebar-sticky.spec.ts(회귀 테스트)와
// capture-evidence-round5.spec.ts(증빙 캡처)가 동일한 판정 조건을
// 공유하도록, 두 곳 모두 이 helper를 호출한다 — 판정 조건이 서로
// 갈라지는 것을 막기 위함이다.
import { expect, type Page } from "@playwright/test";

export interface StickySidebarMeasurement {
  viewportWidth: number;
  viewportHeight: number;
  scrollY: number;
  asideComputedPosition: string;
  asideComputedTop: string;
  asideComputedHeight: string;
  asideBoundingBox: { x: number; y: number; width: number; height: number } | null;
  userBlockBoundingBox: { x: number; y: number; width: number; height: number } | null;
  userBlockText: string | null;
  documentScrollWidth: number;
}

// 캡처 직전에 반드시 호출한다 — assertion을 통과한 뒤에만 스크린샷을
// 찍어야 "코드는 맞는데 캡처만 잘못됐다"는 재발을 막을 수 있다.
export async function assertStickySidebarUserBlockVisible(
  page: Page,
  vp: { width: number; height: number; label: string }
): Promise<StickySidebarMeasurement> {
  // 캡처 조건 자체를 명시적으로 확인 — 스크롤 위치가 0이 아니면 애초에
  // "초기 뷰포트 안에 보이는가"라는 질문 자체가 성립하지 않는다.
  const scrollY = await page.evaluate(() => window.scrollY);
  expect(scrollY, `${vp.label}px: page must be at scroll position 0 before this check`).toBe(0);

  const aside = page.getByTestId("mobile-nav-drawer");
  await expect(aside, `${vp.label}px: aside must exist`).toBeVisible();

  const computed = await aside.evaluate((el) => {
    const style = window.getComputedStyle(el);
    return { position: style.position, top: style.top, height: style.height };
  });

  const asideBoundingBox = await aside.boundingBox();
  expect(asideBoundingBox, `${vp.label}px: aside bounding box must exist`).not.toBeNull();
  expect(
    asideBoundingBox!.height,
    `${vp.label}px: aside height must match viewport (sticky), not stretch to sibling content height`
  ).toBeLessThanOrEqual(vp.height + 1);

  // 사용자 블록(이니셜 배지 + 이름 또는 중립 폴백 "사용자") 텍스트 노드.
  const userBlockLocator = page.locator("aside p.truncate").first();
  await expect(
    userBlockLocator,
    `${vp.label}px: user block text (name or neutral fallback) must actually render`
  ).toBeVisible();
  const userBlockText = await userBlockLocator.textContent();
  expect(userBlockText, `${vp.label}px: user block must render non-empty text`).not.toBeNull();
  expect(
    userBlockText!.trim().length,
    `${vp.label}px: user block text must be non-empty`
  ).toBeGreaterThan(0);

  const userBlockBoundingBox = await userBlockLocator.boundingBox();
  expect(userBlockBoundingBox, `${vp.label}px: user block bounding box must exist`).not.toBeNull();
  expect(
    userBlockBoundingBox!.y + userBlockBoundingBox!.height,
    `${vp.label}px: user block bottom edge must be within the initial viewport (no scroll needed)`
  ).toBeLessThanOrEqual(vp.height);

  const documentScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(documentScrollWidth, `${vp.label}px: no horizontal overflow`).toBeLessThanOrEqual(
    vp.width
  );

  return {
    viewportWidth: vp.width,
    viewportHeight: vp.height,
    scrollY,
    asideComputedPosition: computed.position,
    asideComputedTop: computed.top,
    asideComputedHeight: computed.height,
    asideBoundingBox,
    userBlockBoundingBox,
    userBlockText,
    documentScrollWidth,
  };
}
