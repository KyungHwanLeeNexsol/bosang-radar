// e2e/diagnosis-flow-01.spec.ts
// SPEC-B2C-DIAGNOSIS-001 M10 — 01 화면(입력→동의→추가질문→진단중→결과없음/
// 오류) 범위의 Playwright e2e. 02/03 화면은 이 SPEC의 Out of Scope이므로
// 다루지 않는다(plan.md §G).
//
// 이 파일이 실행되는 webServer는 playwright.config.ts가 기동하며,
// ENABLE_DIAGNOSIS_DEV_STATES=true만 주입한다(ENABLE_DIAGNOSIS_FLOW/
// DIAGNOSIS_ENGINE_READY는 기본값 false 그대로) — design.md §19.1a 5행
// 동작 행렬의 다섯 번째 행(reviewEnabled 단독 경로)과 일치한다.
//
// AC-B2CDIAG-021(엄격한 production 기본 조합에서 devStep이 무시됨)은 이
// webServer 하나로는 검증할 수 없다 — Playwright webServer.env는 프로세스
// 시작 시점에 고정되므로, 같은 실행 안에서 ENABLE_DIAGNOSIS_DEV_STATES를
// false로 되돌린 별도 서버를 띄우려면 두 번째 포트/두 번째 프로젝트가
// 필요하다. app/page.test.tsx의 "플래그 기반 shouldRenderDiagnosis 5행
// 동작 행렬" describe 블록이 이미 이 5행(AC-015/016/021 포함)을 Vitest로
// 기계적으로 검증하고 있으므로, 이 e2e 파일에서 별도 프로젝트를 신설하는
// 대신 그 커버리지를 그대로 인정한다.

import { expect, test, type Page } from "@playwright/test";

const DESKTOP_VIEWPORT = { width: 1440, height: 900 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };

// mockJudge()(step-loading.tsx)는 입력 문자열에 "오류"가 포함되면 error로,
// 그 외에는 result-none으로 분기한다 — 실제 매칭 엔진이 아직 연결되지
// 않은 로컬/테스트/리뷰 전용 시뮬레이션이다(design.md §11, @MX:DEBT).
const RESULT_NONE_INPUT = "무릎 골절로 수술을 받았어요";
const ERROR_INPUT = "분석 중 오류가 발생했어요";

async function submitDiagnosisInput(page: Page, text: string): Promise<void> {
  await page.getByPlaceholder("예: 계단에서 넘어져 발목을 다쳤어요").fill(text);
  await page.getByRole("button", { name: "보상 진단" }).click();
}

async function checkConsentAndConfirm(page: Page): Promise<void> {
  const confirmButton = page.getByRole("button", { name: "동의하고 진단하기" });
  await expect(confirmButton).toBeDisabled();
  await page.getByRole("checkbox").check();
  await expect(confirmButton).toBeEnabled();
  await confirmButton.click();
}

async function skipQuestions(page: Page): Promise<void> {
  // step-questions.tsx — "건너뛰고 결과 보기"는 질문 1/3에서만 노출되며
  // 클릭 즉시 loading으로 전이한다(REQ-B2CDIAG-011).
  await page.getByRole("button", { name: "건너뛰고 결과 보기" }).click();
}

async function answerAllQuestions(page: Page): Promise<void> {
  // 3문항 순차 진행 — 각 문항에서 첫 번째 라디오 옵션을 선택하고 다음으로
  // 진행한다. 마지막 문항의 CTA 문구만 "결과 보기"로 다르다(step-questions.tsx).
  for (let i = 0; i < 3; i += 1) {
    await page.getByRole("radio").first().check();
    const nextButton = page.getByRole("button", { name: /^(다음|결과 보기)$/ });
    await nextButton.click();
  }
}

async function waitForLoadingOutcome(page: Page): Promise<"result-none" | "error"> {
  await expect(page.getByTestId("diagnosis-loading")).toBeVisible();
  const flow = page.getByTestId("diagnosis-flow");
  await expect(flow).toHaveAttribute("data-step", /result-none|error/, { timeout: 10_000 });
  const step = await flow.getAttribute("data-step");
  return step as "result-none" | "error";
}

test.describe("01 화면 — Desktop happy path (1440x900)", () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

  test("입력 → 동의(Modal) → 추가 질문 → 진단 중 → 결과 상태까지 완주한다", async ({ page }) => {
    await page.goto("/");

    // reviewEnabled 경로로 <DiagnosisFlow />가 마운트되어 있어야 한다 —
    // placeholder("서비스 준비 중입니다")가 아니다(AC-B2CDIAG-015 계열).
    await expect(page.getByTestId("diagnosis-flow")).toBeVisible();
    await expect(page.getByText("서비스 준비 중입니다")).not.toBeVisible();

    await submitDiagnosisInput(page, RESULT_NONE_INPUT);

    // AC-B2CDIAG-001/003 — Desktop에서는 Modal(dialog-content)이 열린다.
    await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible();
    await expect(page.locator('[data-slot="drawer-content"]')).toHaveCount(0);

    // AC-B2CDIAG-002 — 체크 전에는 CTA가 비활성화되어 있다(checkConsentAndConfirm
    // 내부에서 재확인).
    await page.getByRole("button", { name: "내용 보기" }).click();
    // AC-B2CDIAG-025 — 동의 상세 6개 항목은 법무 확정 전까지 리터럴 `{}`
    // placeholder 형태를 그대로 유지해야 한다. 지어낸 문구를 단언하지 않는다.
    await expect(page.getByText("{처리 목적 확정 문구}")).toBeVisible();
    await expect(page.getByText("{동의 거부 및 제한 확정 문구}")).toBeVisible();
    await page.getByRole("button", { name: "확인", exact: true }).click();
    // AC-B2CDIAG-003 — 내용 보기 열람 직후에도 체크박스는 자동 선택되지 않는다.
    await expect(page.getByRole("checkbox")).not.toBeChecked();

    await checkConsentAndConfirm(page);

    await expect(page.getByTestId("diagnosis-question-progress")).toContainText("질문 1 / 3");
    await answerAllQuestions(page);

    const outcome = await waitForLoadingOutcome(page);
    expect(["result-none", "error"]).toContain(outcome);
    // REQ-B2CDIAG-024 — mock 결과는 실제 결과와 혼동되지 않도록 구분
    // 표기를 노출해야 한다.
    await expect(page.getByTestId("diagnosis-mock-badge")).toBeVisible();
  });
});

test.describe("01 화면 — Mobile happy path (390x844)", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test("동의 단계에서 Modal 대신 Bottom Sheet가 사용된다", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("diagnosis-flow")).toBeVisible();

    await submitDiagnosisInput(page, RESULT_NONE_INPUT);

    // AC-B2CDIAG-020/REQ-B2CDIAG-022 — Mobile 폭에서는 Bottom Sheet
    // (drawer-content)가 렌더링되고 Modal(dialog-content)은 렌더링되지 않는다.
    await expect(page.locator('[data-slot="drawer-content"]')).toBeVisible();
    await expect(page.locator('[data-slot="dialog-content"]')).toHaveCount(0);

    await checkConsentAndConfirm(page);
    await skipQuestions(page);

    const outcome = await waitForLoadingOutcome(page);
    expect(["result-none", "error"]).toContain(outcome);
    await expect(page.getByTestId("diagnosis-mock-badge")).toBeVisible();
  });
});

test.describe("01 화면 — devStep 직접 URL 접근 (AC-B2CDIAG-015)", () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

  test("?devStep=result-none은 선행 상태 없이 결과 없음 화면으로 강제 진입한다", async ({
    page,
  }) => {
    await page.goto("/?devStep=result-none");
    await expect(page.getByTestId("diagnosis-flow")).toHaveAttribute("data-step", "result-none");
    await expect(page.getByTestId("diagnosis-result-none")).toBeVisible();
    await expect(page.getByTestId("diagnosis-mock-badge")).toBeVisible();
  });

  test("?devStep=error는 선행 상태 없이 분석 오류 화면으로 강제 진입한다", async ({ page }) => {
    await page.goto("/?devStep=error");
    await expect(page.getByTestId("diagnosis-flow")).toHaveAttribute("data-step", "error");
    await expect(page.getByTestId("diagnosis-error")).toBeVisible();
    await expect(page.getByTestId("diagnosis-mock-badge")).toBeVisible();
  });
});

test.describe("01 화면 — 새로고침 시 상태 초기화 (AC-B2CDIAG-013)", () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

  test("동의 단계까지 진행한 뒤 새로고침하면 입력 화면으로 완전히 초기화된다", async ({
    page,
  }) => {
    await page.goto("/");
    await submitDiagnosisInput(page, RESULT_NONE_INPUT);
    await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible();

    await page.reload();

    await expect(page.getByTestId("diagnosis-flow")).toHaveAttribute("data-step", "input");
    await expect(page.getByPlaceholder("예: 계단에서 넘어져 발목을 다쳤어요")).toHaveValue("");
  });
});

test.describe("01 화면 — 분석 오류 재시도 시 입력값 보존 (AC-B2CDIAG-012)", () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

  test("다시 시도는 동일 입력값으로 재분석해 동일한 오류 분기에 다시 도달한다", async ({
    page,
  }) => {
    await page.goto("/");
    await submitDiagnosisInput(page, ERROR_INPUT);
    await checkConsentAndConfirm(page);
    await skipQuestions(page);

    const firstOutcome = await waitForLoadingOutcome(page);
    expect(firstOutcome).toBe("error");
    await expect(page.getByTestId("diagnosis-error")).toBeVisible();

    await page.getByRole("button", { name: "다시 시도" }).click();

    // "다시 시도"는 FORCE_STEP("loading")만 재사용하고 입력값은 건드리지
    // 않는다(design.md §12, §18.1 error 상태 "유지되는 데이터") — 그
    // 결과 mockJudge(input)이 다시 같은 "오류" 포함 입력을 판정해 동일하게
    // error로 되돌아온다.
    const secondOutcome = await waitForLoadingOutcome(page);
    expect(secondOutcome).toBe("error");
    await expect(page.getByTestId("diagnosis-error")).toBeVisible();
  });
});
