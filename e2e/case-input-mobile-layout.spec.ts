// e2e/case-input-mobile-layout.spec.ts
// Round 5(외부 재검토) — 모바일 사건 입력 Footer 레이아웃 회귀 방지.
//
// 배경: after-round4/case-input-mobile-390-fullpage.png에서 Footer 안내
// 문구가 한 글자씩 세로로 줄바꿈되는 결함이 발견됐다. 근본원인은
// case-input-form.tsx의 Footer 컨테이너였다 — 자세한 원인은
// app/cases/new/case-input-form.tsx의 해당 주석 참조. 이 스펙은 그 결함이
// 재발하면 실제 브라우저 레이아웃(bounding box)으로 실패하도록 만든다 —
// jsdom 단위 테스트는 실제 텍스트 줄바꿈/CJK 줄바꿈 규칙을 재현하지 못하므로
// 이 결함류는 실브라우저 검증이 필수다.
import { test, expect } from "@playwright/test";
import { TESTER_A_STORAGE_STATE_PATH } from "./storage-state-paths.ts";

// SPEC-E2E-AUTH-STATE-001 — TESTER_A storageState를 재사용해 인증된 상태로
// 시작한다(loginAsTester() 직접 호출 제거, REQ-E2EAUTH-002). 로그인 진입
// 방식만 대체하며, 아래 테스트 본문의 단언·시나리오는 전환 전과 완전히
// 동일하다(REQ-E2EAUTH-008). storageState는 e2e/auth.setup.ts가 저장하고,
// playwright.config.ts의 chromium-authed project(dependencies: ["setup"])가
// 이 파일에 그 결과를 주입한다.
test.use({ storageState: TESTER_A_STORAGE_STATE_PATH });

const MOBILE_VIEWPORTS = [
  { width: 320, height: 700, label: "320" },
  { width: 390, height: 844, label: "390" },
] as const;

test.describe("사건 입력 모바일 Footer 레이아웃 — Round5(외부 재검토)", () => {
  test("모바일 뷰포트별 Footer 줄바꿈/겹침/오버플로 검증(단일 세션)", async ({ page }) => {
    for (const vp of MOBILE_VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/cases/new");

      const notice = page.getByTestId("case-input-footer-notice");
      const actions = page.getByTestId("case-input-footer-actions");
      await expect(notice).toBeVisible();
      await expect(actions).toBeVisible();

      const noticeBox = await notice.boundingBox();
      const actionsBox = await actions.boundingBox();
      expect(noticeBox).not.toBeNull();
      expect(actionsBox).not.toBeNull();

      // 결함 재현 시 안내문 폭이 한글 1글자 수준(약 20~30px)까지 붕괴한다.
      // 정상 상태라면 뷰포트 폭에서 좌우 패딩(px-6=24px×2)을 뺀 만큼
      // 거의 채워야 한다 — 최소한 뷰포트 폭의 절반 이상은 확보돼야 한다.
      expect(noticeBox!.width).toBeGreaterThan(vp.width * 0.5);

      // 결함 재현 시 안내문이 세로로 아주 길어진다(문구 전체 글자 수만큼
      // 줄이 생김 — 대략 40줄 이상). 정상 줄바꿈이라면 2~3줄 이내로
      // 수렴해야 하므로, 한 줄 높이의 넉넉한 배수(6줄 상당)를 넘지 않는지만
      // 확인한다(정확한 줄 수는 폰트 렌더링에 따라 달라질 수 있어 느슨하게
      // 잡는다 — 결함 재현 시의 40줄+ 붕괴와는 확실히 구분되는 임계값).
      expect(noticeBox!.height).toBeLessThan(160);

      // Footer가 flex-col이므로 안내문이 버튼 그룹 위에 위치해야 하며,
      // 두 영역이 세로로 겹치지 않아야 한다(겹치면 버튼을 가리거나 버튼이
      // 안내문을 가리는 결함).
      const noticeBottom = noticeBox!.y + noticeBox!.height;
      expect(noticeBottom).toBeLessThanOrEqual(actionsBox!.y + 1);

      // 가로 오버플로가 없어야 한다(페이지 스크롤 폭이 뷰포트 폭을
      // 초과하지 않음).
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(vp.width + 1);
    }

    // 390px: CTA 버튼과 임시저장 버튼이 서로 겹치지 않는다(같은 세션, 마지막
    // 루프 반복이 이미 390px이므로 재탐색만 하면 된다).
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/cases/new");

    const draftSave = page.getByTestId("case-input-draft-save");
    const submit = page.getByTestId("case-submit");
    const draftBox = await draftSave.boundingBox();
    const submitBox = await submit.boundingBox();
    expect(draftBox).not.toBeNull();
    expect(submitBox).not.toBeNull();

    // 두 버튼의 사각형이 겹치지 않아야 한다(가로 배치든 flex-wrap으로 인한
    // 2행 배치든, 어느 쪽이든 겹침은 결함이다).
    const overlapsHorizontally =
      draftBox!.x < submitBox!.x + submitBox!.width && submitBox!.x < draftBox!.x + draftBox!.width;
    const overlapsVertically =
      draftBox!.y < submitBox!.y + submitBox!.height &&
      submitBox!.y < draftBox!.y + draftBox!.height;
    expect(overlapsHorizontally && overlapsVertically).toBe(false);

    // CTA 텍스트/아이콘이 잘리지 않아야 한다 — 버튼 자체의 스크롤 폭이
    // 보이는 폭을 넘지 않는지 확인한다(overflow로 인한 텍스트 클리핑 방지).
    const submitOverflow = await submit.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(submitOverflow).toBeLessThanOrEqual(1);
  });
});
