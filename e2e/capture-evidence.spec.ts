// e2e/capture-evidence.spec.ts
// 시각 증빙 캡처 — SPEC-UI-MIGRATION-001 Round 4 after-state
//
// WARNING: 단독 실행 전용. 전체 suite와 함께 실행하면 rate limit이 발생할 수 있다.
//   CAPTURE_EVIDENCE=1 npx tsx scripts/run-e2e.ts --spec=e2e/capture-evidence.spec.ts --workers=1
// 출력: docs/evidence/SPEC-UI-MIGRATION-001/after-round4/*.png
//
// rate limit 회피: 인증 필요 화면은 단일 loginAsTester 호출(1회만)로 세션을
// 유지한 채 모든 화면을 순서대로 캡처한다.
import { test } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import { loginAsTester, pickDateFromPicker } from "./helpers.ts";
import { TESTER_A_EMAIL } from "../scripts/e2e-tester-emails.ts";

const EVIDENCE_DIR = path.join(process.cwd(), "docs/evidence/SPEC-UI-MIGRATION-001/after-round4");

const DESKTOP_VIEWPORTS = [
  { width: 1440, height: 900, label: "1440" },
  { width: 1024, height: 768, label: "1024" },
  { width: 390, height: 844, label: "390" },
] as const;

const REPORT_VIEWPORTS = [
  { width: 1440, height: 900, label: "1440" },
  { width: 1024, height: 768, label: "1024" },
] as const;

async function createCase(
  page: import("@playwright/test").Page,
  input: {
    incidentDescription: string;
    diagnosisName: string;
    disabilityBodyPart: string;
    incidentDate: string;
  }
): Promise<string> {
  await page.goto("/cases/new");
  await page.getByTestId("case-incident-description").fill(input.incidentDescription);
  await page.getByTestId("case-diagnosis-name").fill(input.diagnosisName);
  await page.getByTestId("case-disability-body-part").fill(input.disabilityBodyPart);
  await pickDateFromPicker(page, "case-incident-date", input.incidentDate);
  const [response] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/api/cases") && res.request().method() === "POST"
    ),
    page.getByTestId("case-submit").click(),
  ]);
  const { caseId } = (await response.json()) as { caseId: string };
  await page.waitForURL(`/cases/${caseId}`);
  return caseId;
}

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

  test("전역 404 — 인증 없이 캡처", async ({ page }) => {
    // AC-018 수동 확인 라운드에서 사용한 것과 동일한 경로(app/not-found.tsx).
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/존재하지-않는-경로");
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "global-not-found-1440.png"),
      fullPage: false,
    });
  });

  test("인증 필요 화면 전체 — 단일 세션", async ({ page }) => {
    // 1회 로그인으로 모든 인증 필요 화면을 캡처한다 (rate limit 회피).
    await loginAsTester(page, TESTER_A_EMAIL);

    // --- 사건 입력: 최근 리서치 0건 상태(데스크톱 3개 뷰포트) ---
    for (const vp of DESKTOP_VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/cases/new");
      await page.waitForLoadState("networkidle");
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, `case-input-empty-recent-${vp.label}.png`),
        fullPage: false,
      });
    }

    // --- 모바일 사건 입력 전체 페이지(fullPage) ---
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/cases/new");
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "case-input-mobile-390-fullpage.png"),
      fullPage: true,
    });

    // --- 사건 1건 생성 — VERIFIED claim 확보(case-flow.spec.ts와 동일 입력 재사용:
    //     이 입력만이 결정론적 provider 하에서 실제 evidence 매칭이 확인된
    //     입력이다 — 임의 입력으로 우연히 VERIFIED가 나오길 기대하지 않는다) ---
    const verifiedCaseId = await createCase(page, {
      incidentDescription: "계단에서 넘어져 발목을 다쳤습니다.",
      diagnosisName: "발목 인대 파열",
      disabilityBodyPart: "발목",
      incidentDate: "2026-01-15",
    });

    for (const vp of REPORT_VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`/cases/${verifiedCaseId}`);
      await page.waitForLoadState("networkidle");
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, `report-verified-claim-${vp.label}.png`),
        fullPage: false,
      });
    }

    // 모바일 리포트 전체 페이지(fullPage)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/cases/${verifiedCaseId}`);
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "report-mobile-390-fullpage.png"),
      fullPage: true,
    });

    // 전문가 피드백 앵커(#expert-feedback) — 데스크톱 2개 뷰포트
    for (const vp of REPORT_VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`/cases/${verifiedCaseId}#expert-feedback`);
      await page.waitForLoadState("networkidle");
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, `expert-feedback-${vp.label}.png`),
        fullPage: false,
      });
    }

    // --- 사건 2건째 생성 — INSUFFICIENT claim 시도.
    //     결정론적 provider(semanticVerificationFixture)는 검색 단계가 실제로
    //     evidence를 찾지 못한 경우에만 INSUFFICIENT를 만든다(항상 이렇게
    //     되는 것이 보장되지 않음 — lib/ai/providers/deterministic.ts 주석
    //     참조). 시드 데이터가 정형외과·척추 손상 위주로 보여, 도메인이 다른
    //     입력(이명/귀)으로 매칭 실패를 유도한다. 결과는 아래에서 실제로
    //     관찰한 값을 progress.md에 정직하게 기록한다(INSUFFICIENT가 끝내
    //     발생하지 않으면 잔여 위험으로 남긴다). ---
    const insufficientCaseId = await createCase(page, {
      incidentDescription: "사고 이후 지속적인 이명과 어지럼증이 발생함.",
      diagnosisName: "돌발성 난청",
      disabilityBodyPart: "귀",
      incidentDate: "2026-02-01",
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/cases/${insufficientCaseId}`);
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "report-insufficient-attempt-1440.png"),
      fullPage: false,
    });

    // --- 최근 리서치 데이터 있음 상태 캡처(사건 2건 생성된 뒤 재방문) ---
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/cases/new");
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "case-input-with-recent-1440.png"),
      fullPage: false,
    });

    // --- 사건별 404 — 존재하지 않는 사건 ID(1440px) ---
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/cases/case-id-nonexistent-evidence-capture");
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "exception-not-found-1440.png"),
      fullPage: false,
    });

    // --- 모바일 드로어(390px) — 닫힘 / 열림 ---
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
