// e2e/diagnosis-flow-02.spec.ts
// SPEC-B2C-RESULT-001 M6 (design.md §0/§9, plan.md §F M6) — 02 화면(보상
// 진단 결과) 범위의 Playwright e2e. 01 SPEC의 e2e/diagnosis-flow-01.spec.ts
// 와 동일한 webServer/env/헬퍼 컨벤션을 그대로 따르되, 그 파일에는 export가
// 하나도 없어 helper를 import할 수 없다 — 이 파일에 동일한 스타일로
// 다시 작성한다. e2e/diagnosis-flow-01.spec.ts 자체는 절대 수정하지 않는다
// (REQ-B2CRESULT-011 — 그 파일의 RESULT_NONE_INPUT/ERROR_INPUT 회귀
// 검증은 그대로 유지되어야 한다).
//
// 이 파일이 실행되는 webServer는 playwright.config.ts가 기동하며,
// ENABLE_DIAGNOSIS_DEV_STATES=true를 주입한다(01 스펙과 공유하는 동일한
// webServer.env) — REQ-B2CRESULT-009의 defense-in-depth boolean 게이트가
// 켜져 있어야 골절 fixture 분기(§4)와 review 전용 ?devFixture= 진입점(§9)이
// 모두 동작한다.

import { expect, test, type Page } from "@playwright/test";

const DESKTOP_VIEWPORT = { width: 1440, height: 900 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };

// lib/diagnosis/fixtures/fracture-case.ts의 FRACTURE_FIXTURE_INPUT과 동일한
// 문자열 — mockJudge의 정확 일치 트리거(REQ-B2CRESULT-010). 01 스펙의
// RESULT_NONE_INPUT/ERROR_INPUT과 마찬가지로 소스를 import하지 않고
// 문자열을 그대로 복제한다(01 스펙의 관례를 그대로 따름 — e2e 스펙은
// Next.js 경로 별칭(@/) 해석 대상이 아니므로 값을 복제하는 편이 01 스펙과
// 일관적이다).
const FRACTURE_INPUT = "3일 전에 헬스장에서 벤치프레스 하다가 무릎이 골절됐어요";

async function submitDiagnosisInput(page: Page, text: string): Promise<void> {
  await page
    .getByPlaceholder("예) 3일 전에 헬스장에서 벤치프레스 하다가 무릎이 골절됐어요")
    .fill(text);
  await page.getByRole("button", { name: "보상 진단" }).click();
}

async function checkConsentAndConfirm(page: Page): Promise<void> {
  const confirmButton = page.getByRole("button", { name: "동의하고 진단하기" });
  await expect(confirmButton).toBeDisabled();
  await page.getByRole("checkbox").check();
  await expect(confirmButton).toBeEnabled();
  await confirmButton.click();
}

async function answerAllQuestions(page: Page): Promise<void> {
  // 3문항 순차 진행 — 각 문항에서 첫 번째 라디오 옵션을 선택하고 다음으로
  // 진행한다(01 스펙의 동명 헬퍼와 동일한 절차).
  for (let i = 0; i < 3; i += 1) {
    await page.getByRole("radio").first().check();
    const nextButton = page.getByRole("button", { name: /^(다음|결과 보기)$/ });
    await nextButton.click();
  }
}

/**
 * 01 전체 플로우(입력 → 동의 → 3문항 응답 → 진단 중)를 완주해 /result로
 * 도착한다. mockJudge(input, reviewEnabled)가 FRACTURE_INPUT을 정확 일치로
 * 판정하면 diagnosis-flow.tsx가 buildFractureResult(state.input, state.answers)
 * → writeDiagnosisHandoff → router.push('/result') 순으로 호출한다
 * (plan.md §F M2) — 01의 result-none/error와 달리 실제 라우트 전환이
 * 일어난다.
 */
async function completeFractureFlowToResult(page: Page): Promise<void> {
  await page.goto("/");
  await submitDiagnosisInput(page, FRACTURE_INPUT);
  await checkConsentAndConfirm(page);
  await answerAllQuestions(page);
  await page.waitForURL("**/result", { timeout: 15_000 });
  await page.getByTestId("result-view").waitFor();
}

test.describe("02 화면 — 01→02 전체 플로우 (Desktop, 1440x900)", () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

  test("01 전체 플로우를 완주하면 /result에 도착하고, 집계 배너가 0이 아닌 숫자를 보여주며, 4개 카테고리가 동시에 표시된다", async ({
    page,
  }) => {
    await completeFractureFlowToResult(page);

    await expect(page).toHaveURL(/\/result/);

    // REQ-B2CRESULT-002 — 집계 배너 숫자는 computeAggregate(items)에서
    // 매번 동적으로 산출되며, 디자인 목업 값(15/8/6/1)으로 하드코딩되지
    // 않는다. 골절 fixture는 7개 담보를 반환하므로(design.md §7), 정확한
    // 값이 아니라 "0이 아닌 숫자"임을 검증한다.
    const banner = page.getByTestId("result-aggregate-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/사고 내용으로 [1-9]\d*개 담보를 분석했습니다/);
    await expect(page.getByTestId("result-aggregate-review")).toContainText(/[1-9]\d*개/);

    // Desktop — 4개 카테고리 섹션이 전부 동시에 DOM에 존재한다
    // (REQ-B2CRESULT-003, design.md §6).
    await expect(page.getByTestId("coverage-section-reimbursement")).toBeVisible();
    await expect(page.getByTestId("coverage-section-fixed")).toBeVisible();
    await expect(page.getByTestId("coverage-section-disability")).toBeVisible();
    await expect(page.getByTestId("coverage-section-special")).toBeVisible();

    // Fact Chip 존재(REQ-B2CRESULT-007) — 골절 fixture의 factChip 매핑
    // 테이블은 실제 01-B 질문 ID("surgery-status"/"hospitalization"/
    // "accident-location", step-questions.tsx와 동일)를 그대로 쓴다(design.md
    // §7). 01 플로우에서 3문항을 모두 응답하므로 세 질문 모두 매핑된 카드에
    // Chip이 붙는다 — "입원 여부"(통원 실손), "수술 여부"(골절수술비),
    // "사고 장소"(후유장해) 순으로 각각 확인한다.
    await expect(
      page
        .getByTestId("coverage-item-item-reimbursement-outpatient")
        .getByTestId("coverage-fact-chips")
    ).toBeVisible();
    await expect(
      page
        .getByTestId("coverage-item-item-fixed-fracture-surgery")
        .getByTestId("coverage-fact-chips")
    ).toBeVisible();
    await expect(
      page
        .getByTestId("coverage-item-item-disability-knee")
        .getByTestId("coverage-fact-chips")
    ).toBeVisible();
  });
});

test.describe("02 화면 — Mobile 탭 전환 (390x844)", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test("기본 탭은 실손 의료비 하나만 표시되고, 탭을 전환하면 이전 카테고리는 사라지고 새 카테고리만 표시된다", async ({
    page,
  }) => {
    await completeFractureFlowToResult(page);

    // REQ-B2CRESULT-003 — Mobile은 카테고리 단일 선택 탭으로 한 번에
    // 하나만 렌더링한다. hidden CSS가 아니라 조건부 렌더링이므로(design.md
    // §6) 비활성 카테고리는 DOM에서 완전히 제외된다.
    await expect(page.getByTestId("result-category-tabs")).toBeVisible();
    await expect(page.getByTestId("coverage-section-reimbursement")).toBeVisible();
    await expect(page.getByTestId("coverage-section-fixed")).toHaveCount(0);
    await expect(page.getByTestId("coverage-section-disability")).toHaveCount(0);
    await expect(page.getByTestId("coverage-section-special")).toHaveCount(0);

    await page.getByTestId("category-tab-fixed").click();

    await expect(page.getByTestId("coverage-section-fixed")).toBeVisible();
    await expect(page.getByTestId("coverage-section-reimbursement")).toHaveCount(0);
  });
});

test.describe("02 화면 — 직접 접근 (결과 없음, REQ-B2CRESULT-013)", () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

  test("사전 handoff 데이터 없이 /result에 직접 접근하면 02 전용 결과 없음 상태가 렌더링된다", async ({
    page,
  }) => {
    await page.goto("/result");

    await page.getByTestId("result-no-data").waitFor();
    await expect(page.getByTestId("result-view")).toHaveCount(0);
  });
});

// SPEC-B2C-RESULT-001 M6 (design.md §9, REQ-B2CRESULT-009/012) — review
// 전용 ?devFixture=fracture 직접 진입점. 01 플로우를 매번 완주하지 않고도
// buildFractureResult()의 고정 데이터로 결정론적으로 렌더링되며, §4의
// mockJudge boolean 게이트와 동일한 reviewEnabled를 재사용한다(별도 게이트
// 로직을 다시 계산하지 않음).
test.describe("02 화면 — review 전용 ?devFixture=fracture 직접 진입 (design.md §9)", () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

  test("?devFixture=fracture로 직접 접근하면 01 플로우 없이도 골절 fixture 결과가 렌더링된다", async ({
    page,
  }) => {
    await page.goto("/result?devFixture=fracture");

    await page.getByTestId("result-view").waitFor();
    await expect(page.getByTestId("result-input-summary")).toContainText("무릎·아래다리의 골절");
    await expect(page.getByTestId("result-aggregate-banner")).toContainText(
      /사고 내용으로 [1-9]\d*개 담보를 분석했습니다/
    );

    // FRACTURE_FIXTURE_DEV_ANSWERS = { "surgery-status", hospitalization } —
    // accident-location은 의도적으로 비워 둔다(REQ-B2CRESULT-007/008).
    await expect(
      page
        .getByTestId("coverage-item-item-fixed-fracture-surgery")
        .getByTestId("coverage-fact-chips")
    ).toBeVisible();
    await expect(
      page.getByTestId("coverage-item-item-disability-knee").getByTestId("coverage-fact-chips")
    ).toHaveCount(0);
  });
});
