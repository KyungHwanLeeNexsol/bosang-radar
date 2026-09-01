import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema.ts";
import { TESTER_A_EMAIL } from "../scripts/e2e-tester-emails.ts";
import { connectE2EDb, loginAsTester } from "./helpers.ts";

// AC-RUNTIME-012 — 사건 입력 → 처리 → 저장 → 리포트 조회.
// AC-RUNTIME-013 — 전문가 피드백 저장.

test.describe("사건 흐름 — AC-RUNTIME-012, AC-RUNTIME-013", () => {
  // connectE2EDb()가 연 libsql 연결을 테스트 성공·실패와 무관하게 닫는다 —
  // afterEach는 본문이 예외로 중단돼도 실행되므로 try/finally로 본문 전체를
  // 감싸지 않고도 해제를 보장한다.
  let closeDb: (() => void) | undefined;

  test.afterEach(() => {
    closeDb?.();
    closeDb = undefined;
  });

  test("사건 입력이 저장되고 리포트가 렌더링되며, 피드백이 저장된다", async ({ page }) => {
    await loginAsTester(page, TESTER_A_EMAIL);

    await page.goto("/cases/new");
    await page.getByTestId("case-incident-description").fill("계단에서 넘어져 발목을 다쳤습니다.");
    await page.getByTestId("case-diagnosis-name").fill("발목 인대 파열");
    await page.getByTestId("case-disability-body-part").fill("발목");
    await page.getByTestId("case-incident-date").fill("2026-01-15");

    const [response] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes("/api/cases") && res.request().method() === "POST"
      ),
      page.getByTestId("case-submit").click(),
    ]);
    expect(response.status()).toBe(201);
    const { caseId } = (await response.json()) as { caseId: string };

    await page.waitForURL(`/cases/${caseId}`);
    await expect(page.getByTestId("case-report")).toBeVisible();

    // 신규 리포트 필드 노출 확인(SPEC-RESEARCH-001 M6, design.md §8) —
    // reviewTargets/verifiedClaims/missingMaterials 카드가 모두 렌더링된다.
    // sourceUrl 유무에 따른 evidence 출처 표시 조건부 렌더링은 app/cases/[caseId]/page.tsx의
    // 정적 로직으로 보장되며(AC-RESEARCH-022), 여기서는 필드 자체의 노출만 확인한다.
    await expect(page.getByTestId("review-targets")).toBeVisible();
    await expect(page.getByTestId("verified-claims")).toBeVisible();
    await expect(page.getByTestId("missing-materials")).toBeVisible();

    const { db, close } = connectE2EDb();
    closeDb = close;
    const [tester] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, TESTER_A_EMAIL))
      .limit(1);
    expect(tester).toBeDefined();

    const [caseRow] = await db
      .select()
      .from(schema.cases)
      .where(eq(schema.cases.id, caseId))
      .limit(1);
    expect(caseRow).toBeDefined();
    expect(caseRow?.ownerUserId).toBe(tester?.id);

    const reportRows = await db
      .select()
      .from(schema.reports)
      .where(eq(schema.reports.caseId, caseId));
    expect(reportRows.length).toBeGreaterThan(0);

    // Fix-C 검증 — claim.status 배지, uncertainty 섹션, skeptic evidence
    // provenance(SPEC-RESEARCH-001 post-run 리뷰 P0/P1). DB에 저장된
    // report.content(JSON)를 ground truth로 삼아, 결정론적 파이프라인이 실제로
    // 만들어낸 shape에 맞춰 단언한다 — 존재하지 않는 INSUFFICIENT 케이스를
    // 조작해 단언하지 않는다.
    const reportContent = reportRows[0]?.content as {
      verifiedClaims: {
        status: "VERIFIED" | "INSUFFICIENT";
        counterArguments: { supportingEvidenceIds: string[]; counterEvidenceIds: string[] }[];
      }[];
      uncertainty: string[];
    };
    expect(reportContent).toBeDefined();

    const claimStatusLocator = page.getByTestId("claim-status");
    await expect(claimStatusLocator).toHaveCount(reportContent.verifiedClaims.length);

    if (reportContent.verifiedClaims.some((claim) => claim.status === "VERIFIED")) {
      await expect(claimStatusLocator.filter({ hasText: "근거 확인" }).first()).toBeVisible();
    }
    // NOTE(검증 갭 — 명시적 기록): 결정론적 provider(lib/ai/providers/
    // deterministic.ts의 semanticVerificationFixture)는 모든 candidate에 대해
    // supported: true를 고정 반환하므로, 이 시나리오(모든 domain·issueType에
    // evidence가 존재하는 seed 데이터)에서는 INSUFFICIENT claim이 자연
    // 발생하지 않는다 — 따라서 "판단 불충분" 배지 자체의 렌더링은 이 E2E
    // 경로에서 실제로 exercise되지 않는다. 아래는 실제 발생 시에만 통과하는
    // 조건부 단언으로 남겨, 향후 시나리오가 바뀌어도 거짓 통과하지 않게 한다.
    if (reportContent.verifiedClaims.some((claim) => claim.status === "INSUFFICIENT")) {
      await expect(claimStatusLocator.filter({ hasText: "판단 불충분" }).first()).toBeVisible();
    }

    await expect(page.getByTestId("uncertainty")).toBeVisible();
    if (reportContent.uncertainty.length > 0) {
      await expect(page.getByTestId("uncertainty")).toContainText(reportContent.uncertainty[0]);
    } else {
      await expect(page.getByTestId("uncertainty")).toContainText(
        "판단 불충분으로 처리된 사유가 없습니다."
      );
    }

    const counterArgumentWithEvidence = reportContent.verifiedClaims
      .flatMap((claim) => claim.counterArguments)
      .find((ca) => ca.supportingEvidenceIds.length > 0 || ca.counterEvidenceIds.length > 0);
    if (counterArgumentWithEvidence) {
      const label =
        counterArgumentWithEvidence.supportingEvidenceIds.length > 0 ? "뒷받침 근거" : "반박 근거";
      await expect(page.getByText(label).first()).toBeVisible();
    }

    // SPEC-FEEDBACK-001 — 구조화 피드백 제출(REQ-FEEDBACK-014/015). 옛
    // 자유 텍스트 feedback-content/feedback-submit 경로는 완전히 대체되었다.
    await page.getByTestId("feedback-overall-rating").selectOption("ACCURATE");
    const claimVerdictRows = page.getByTestId("feedback-claim-verdict");
    const claimVerdictCount = await claimVerdictRows.count();
    if (claimVerdictCount > 0) {
      await claimVerdictRows.first().locator("select").selectOption("CORRECT");
    }

    await Promise.all([
      page.waitForLoadState("networkidle"),
      page.getByTestId("feedback-submit").click(),
    ]);

    const feedbackRows = await db
      .select()
      .from(schema.feedback)
      .where(eq(schema.feedback.caseId, caseId));
    expect(feedbackRows).toHaveLength(1);
    expect(feedbackRows[0]?.userId).toBe(tester?.id);
    expect(feedbackRows[0]?.reportId).toBe(reportRows[0]?.id);
    expect(feedbackRows[0]?.caseId).toBe(caseId);

    const feedbackPayload = feedbackRows[0]?.payload as {
      overallRating: string;
      claimAssessments: { claimIndex: number; verdict: string }[];
    };
    expect(feedbackPayload.overallRating).toBe("ACCURATE");
    if (claimVerdictCount > 0) {
      expect(feedbackPayload.claimAssessments).toContainEqual(
        expect.objectContaining({ claimIndex: 0, verdict: "CORRECT" })
      );
    }
  });
});
