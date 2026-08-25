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

    const feedbackText = "추가로 CT 촬영 기록도 확인이 필요합니다.";
    await page.getByTestId("feedback-content").fill(feedbackText);
    await Promise.all([
      page.waitForLoadState("networkidle"),
      page.getByTestId("feedback-submit").click(),
    ]);

    const feedbackRows = await db
      .select()
      .from(schema.feedback)
      .where(eq(schema.feedback.caseId, caseId));
    expect(feedbackRows).toHaveLength(1);
    expect(feedbackRows[0]?.content).toBe(feedbackText);
    expect(feedbackRows[0]?.userId).toBe(tester?.id);
  });
});
