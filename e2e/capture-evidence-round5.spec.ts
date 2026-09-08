// e2e/capture-evidence-round5.spec.ts
// 시각 증빙 캡처 — SPEC-UI-MIGRATION-001 Round 5 after-state
//
// WARNING: 단독 실행 전용. 전체 suite와 함께 실행하면 rate limit이 발생할 수 있다.
//   CAPTURE_EVIDENCE=1 npx tsx scripts/run-e2e.ts --spec=e2e/capture-evidence-round5.spec.ts --workers=1
// 출력: docs/evidence/SPEC-UI-MIGRATION-001/after-round5/*.png
//
// Round 4의 after-round4 캡처와 별도 디렉터리를 사용한다 — Round 4 캡처는
// Round 5 수정 이전 상태의 비교 기준(before)으로 그대로 보존한다.
import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../lib/db/schema.ts";
import { connectE2EDb, loginAsTester } from "./helpers.ts";
import { TESTER_A_EMAIL } from "../scripts/e2e-tester-emails.ts";

const EVIDENCE_DIR = path.join(process.cwd(), "docs/evidence/SPEC-UI-MIGRATION-001/after-round5");

const DESKTOP_VIEWPORTS = [
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
  await page.getByTestId("case-incident-date").fill(input.incidentDate);
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

test.describe("Round 5 시각 증빙 캡처", () => {
  test.skip(!process.env.CAPTURE_EVIDENCE, "CAPTURE_EVIDENCE=1 환경변수로 활성화");

  test.beforeAll(() => {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  });

  test("로그인 화면 — Round5 헤드라인/간격 수정 후", async ({ page }) => {
    for (const vp of [...DESKTOP_VIEWPORTS, { width: 390, height: 844, label: "390" }] as const) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/login");
      await page.waitForLoadState("networkidle");
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, `login-${vp.label}.png`),
        fullPage: false,
      });
    }
  });

  // correction pass (3차, 사용자 승인 2026-09-08) — 데스크톱 App Shell
  // 사이드바를 static → sticky로 전환한 뒤, 폼이 뷰포트보다 긴 /cases/new
  // 화면에서 사이드바 하단 사용자 블록이 초기 뷰포트 안에 보이는지 재캡처.
  // Pencil design/exports/04-App-Shell.png 자체가 "좌측 사이드바 232px +
  // 상단바 62px 고정"이라고 명시하므로, 이 캡처는 그 고정 사이드바 의도와의
  // 정합을 시각적으로 재확인하는 증빙이다.
  test("사이드바 sticky 재캡처 — /cases/new에서 사용자 블록 초기 뷰포트 가시성", async ({
    page,
  }) => {
    await loginAsTester(page, TESTER_A_EMAIL);
    for (const vp of DESKTOP_VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/cases/new");
      await page.waitForLoadState("networkidle");
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, `case-input-sticky-sidebar-${vp.label}.png`),
        fullPage: false,
      });
    }
  });

  test("모바일 사건 입력 Footer — 재캡처(레이아웃 붕괴 수정 확인)", async ({ page }) => {
    await loginAsTester(page, TESTER_A_EMAIL);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/cases/new");
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "case-input-mobile-390-fullpage.png"),
      fullPage: true,
    });

    // 전문가 피드백 화면 증빙 — 동일 세션으로 이어서 캡처(rate limit 회피)
    const caseId = await createCase(page, {
      incidentDescription: "계단에서 넘어져 발목을 다쳤습니다.",
      diagnosisName: "발목 인대 파열",
      disabilityBodyPart: "발목",
      incidentDate: "2026-01-15",
    });

    // 초기 상태(1440/1024 top-of-page, 390 fullPage)
    for (const vp of DESKTOP_VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`/cases/${caseId}#expert-feedback`);
      await page.waitForLoadState("networkidle");
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, `expert-feedback-initial-${vp.label}.png`),
        fullPage: false,
      });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/cases/${caseId}#expert-feedback`);
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "expert-feedback-initial-390-fullpage.png"),
      fullPage: true,
    });

    // 일부 입력 상태 — 전체 평가 카드 선택
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/cases/${caseId}#expert-feedback`);
    await page.waitForLoadState("networkidle");
    await page.getByTestId("feedback-overall-rating-ACCURATE").click();
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "expert-feedback-partial-1440.png"),
      fullPage: false,
    });

    // validation error 상태 — 전체 평가를 선택하지 않은 채 제출 시도
    await page.goto(`/cases/${caseId}#expert-feedback`);
    await page.waitForLoadState("networkidle");
    await page.getByTestId("feedback-submit").click();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "expert-feedback-validation-error-1440.png"),
      fullPage: false,
    });
  });

  // R5-6 — INSUFFICIENT 상태 시각 검증. 결정론적 provider(semanticVerificationFixture)는
  // 검증 단계에서 항상 supported:true를 반환하고, 검색 단계도 도메인 무관하게 항상
  // evidence를 반환하는 것으로 관찰되어(progress.md 기록), 정상 사용자 플로우로는
  // INSUFFICIENT claim이 자연 발생하지 않는다. 화면 자체(claim.status==="INSUFFICIENT"
  // 분기)는 실제 코드이므로, 테스트 전용 결정론적 fixture로 report.content를 직접
  // 덮어써(실제 DB row 갱신 — 화면을 조작하는 게 아니라 입력 데이터를 조작) 그 분기가
  // 실제 브라우저에서 어떻게 렌더링되는지 캡처한다. 파일명과 내용이 실제로 일치하도록,
  // 캡처 직후 claim-status 텍스트에 "판단 불충분"이 존재하는지 assert로 재확인한다.
  test("INSUFFICIENT 상태 — 결정론적 fixture로 report.content 직접 주입 후 캡처", async ({
    page,
  }) => {
    await loginAsTester(page, TESTER_A_EMAIL);
    const caseId = await createCase(page, {
      incidentDescription: "사고 이후 지속적인 이명과 어지럼증이 발생함.",
      diagnosisName: "돌발성 난청",
      disabilityBodyPart: "귀",
      incidentDate: "2026-02-01",
    });

    const { db, close } = connectE2EDb();
    try {
      const [reportRow] = await db
        .select()
        .from(schema.reports)
        .where(eq(schema.reports.caseId, caseId))
        .limit(1);
      expect(reportRow, "report row must exist before fixture injection").toBeDefined();

      const original = reportRow!.content as {
        caseSummary: unknown;
        reviewTargets: unknown;
        verifiedClaims: {
          summary: string;
          supportingEvidenceIds: string[];
          counterArguments: unknown[];
          status: "VERIFIED" | "INSUFFICIENT";
        }[];
        missingMaterials: { description: string; relatedIssueType: string }[];
        uncertainty: string[];
        generatedAt: string;
      };

      // 실제 필드 구조(VerifiedClaim/MissingMaterial, lib/pipeline/types.ts)를 그대로
      // 유지한 채, 첫 claim의 status만 INSUFFICIENT로 바꾸고 uncertainty에 사유를 추가한다.
      const patched = {
        ...original,
        verifiedClaims: original.verifiedClaims.map((claim, i) =>
          i === 0 ? { ...claim, status: "INSUFFICIENT" as const } : claim
        ),
        uncertainty: [
          ...original.uncertainty,
          "[테스트 전용 fixture] 근거 자료가 부족하여 첫 번째 쟁점의 판단을 유보합니다.",
        ],
      };

      await db
        .update(schema.reports)
        .set({ content: patched })
        .where(eq(schema.reports.id, reportRow!.id));
    } finally {
      close();
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/cases/${caseId}`);
    await page.waitForLoadState("networkidle");

    // 캡처 전에 실제로 "판단 불충분" 텍스트가 렌더링됐는지 확인 — 파일명만
    // INSUFFICIENT이고 실제 내용은 다른 상태였던 Round 4의 실수를 반복하지 않는다.
    await expect(page.getByTestId("claim-status").filter({ hasText: "판단 불충분" })).toHaveCount(
      1
    );

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "report-insufficient-fixture-1440.png"),
      fullPage: false,
    });
  });

  // correction pass — comparison-report.html이 Round4 이미지(after-round4/
  // report-verified-claim-1440.png)를 Round5 커밋 SHA와 함께 표기하던 SHA
  // 불일치를 바로잡기 위해, VERIFIED claim 화면을 Round5 production 빌드
  // 기준으로 재캡처한다(Round4와 동일 fixture 입력 — 결정론적 provider 하에서
  // 동일 입력은 항상 VERIFIED 6/6을 재현함, progress.md Round 4 기록 참조).
  test("리포트 VERIFIED — Round5 production 재캡처(comparison-report.html SHA 정합)", async ({
    page,
  }) => {
    await loginAsTester(page, TESTER_A_EMAIL);
    const caseId = await createCase(page, {
      incidentDescription: "계단에서 넘어져 발목을 다쳤습니다.",
      diagnosisName: "발목 인대 파열",
      disabilityBodyPart: "발목",
      incidentDate: "2026-01-15",
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/cases/${caseId}`);
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "report-verified-claim-1440.png"),
      fullPage: false,
    });
  });

  // correction pass (2차) — acceptance.md §3의 "실재하는 예외 화면 3종" 중
  // 기존 일시 런타임 오류(app/cases/[caseId]/error.tsx)는 "코드 무변경"이라는
  // 이유만으로 별도 시각 확인 없이 [x] 체크됐었다 — 외부 재검토가 지적한 대로
  // 코드 무변경은 실제 렌더링 확인을 대체하지 못한다. 정상 플로우로는 이
  // 오류 경계가 트리거되지 않으므로(report.verifiedClaims는 항상 배열),
  // INSUFFICIENT fixture와 동일한 기법으로 DB row를 결정론적으로 손상시켜
  // page.tsx의 실제 코드 경로(`report.verifiedClaims.flatMap(...)`, report는
  // truthy이지만 verifiedClaims가 없어 TypeError)가 Next.js의 실제 오류
  // 경계로 이어지는지 실제 브라우저에서 관찰한다.
  test("런타임 오류 경계 — 실제 예외 트리거 후 error.tsx 렌더링 캡처", async ({ page }) => {
    await loginAsTester(page, TESTER_A_EMAIL);
    const caseId = await createCase(page, {
      incidentDescription: "계단에서 넘어져 발목을 다쳤습니다.",
      diagnosisName: "발목 인대 파열",
      disabilityBodyPart: "발목",
      incidentDate: "2026-01-15",
    });

    const { db, close } = connectE2EDb();
    try {
      const [reportRow] = await db
        .select()
        .from(schema.reports)
        .where(eq(schema.reports.caseId, caseId))
        .limit(1);
      expect(reportRow, "report row must exist before corruption").toBeDefined();

      const original = reportRow!.content as Record<string, unknown>;
      // report 자체는 truthy 객체로 유지하되 verifiedClaims만 제거한다 —
      // page.tsx의 `report ? report.verifiedClaims.flatMap(...) : []` 가드는
      // report의 truthiness만 확인하고 verifiedClaims의 shape는 확인하지
      // 않으므로, 이 상태는 실제로 TypeError를 던진다(테스트 전용 조작).
      const corrupted: Record<string, unknown> = { ...original };
      delete corrupted.verifiedClaims;
      await db
        .update(schema.reports)
        .set({ content: corrupted })
        .where(eq(schema.reports.id, reportRow!.id));
    } finally {
      close();
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/cases/${caseId}`);
    await page.waitForLoadState("networkidle");

    // 캡처 전에 실제로 error.tsx가 렌더링됐는지(정상 리포트 화면이 아니라)
    // 확인한다 — 코드 무변경 주장을 시각 확인으로 대체하지 않기 위해.
    await expect(page.getByText("문제가 발생했습니다")).toBeVisible();
    const retryButton = page.getByTestId("case-error-retry");
    await expect(retryButton).toBeVisible();

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "runtime-error-1440.png"),
      fullPage: false,
    });

    await page.setViewportSize({ width: 1024, height: 768 });
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("문제가 발생했습니다")).toBeVisible();
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "runtime-error-1024.png"),
      fullPage: false,
    });

    // 재시도 버튼 동작 확인 — reset()이 실제로 호출되어 재렌더링을
    // 시도한다(데이터는 여전히 손상 상태이므로 오류 화면이 다시 나타나는
    //것이 정상 — 버튼 자체가 크래시 없이 동작함을 확인하는 것이 목적).
    await retryButton.click();
    await page.waitForTimeout(500);
    await expect(page.getByText("문제가 발생했습니다")).toBeVisible();
  });

  test("모바일 리포트+피드백 전체 페이지 — Round5 UX 검토용 재캡처", async ({ page }) => {
    await loginAsTester(page, TESTER_A_EMAIL);
    const caseId = await createCase(page, {
      incidentDescription: "계단에서 넘어져 발목을 다쳤습니다.",
      diagnosisName: "발목 인대 파열",
      disabilityBodyPart: "발목",
      incidentDate: "2026-01-15",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/cases/${caseId}`);
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "report-mobile-390-fullpage.png"),
      fullPage: true,
    });
  });
});
