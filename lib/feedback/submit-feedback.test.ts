import { beforeEach, describe, expect, it, vi } from "vitest";

// SPEC-FEEDBACK-001 M3 — submitReportFeedback() write-path 테스트
// (REQ-FEEDBACK-002, REQ-FEEDBACK-009~013, AC-FEEDBACK-009~013).
//
// app/cases/[caseId]/actions.test.ts의 vi.hoisted mocking 패턴을 재사용한다.
// select() 호출 순서: 1) reports 단건 조회 2) cases 단건 조회
// 3) (evidenceAssessments가 비어있지 않을 때만) evidence 존재 검사.

const { valuesMock, insertMock, reportLimitMock, caseLimitMock, evidenceWhereMock, getDbMock } =
  vi.hoisted(() => {
    const valuesMock = vi.fn().mockResolvedValue(undefined);
    const insertMock = vi.fn(() => ({ values: valuesMock }));

    const reportLimitMock = vi.fn();
    const reportWhereMock = vi.fn(() => ({ limit: reportLimitMock }));
    const reportFromMock = vi.fn(() => ({ where: reportWhereMock }));

    const caseLimitMock = vi.fn();
    const caseWhereMock = vi.fn(() => ({ limit: caseLimitMock }));
    const caseFromMock = vi.fn(() => ({ where: caseWhereMock }));

    const evidenceWhereMock = vi.fn();
    const evidenceFromMock = vi.fn(() => ({ where: evidenceWhereMock }));

    let selectCallCount = 0;
    const selectMock = vi.fn(() => {
      selectCallCount += 1;
      if (selectCallCount === 1) return { from: reportFromMock };
      if (selectCallCount === 2) return { from: caseFromMock };
      return { from: evidenceFromMock };
    });

    const getDbMock = vi.fn(() => {
      selectCallCount = 0;
      return { select: selectMock, insert: insertMock };
    });

    return { valuesMock, insertMock, reportLimitMock, caseLimitMock, evidenceWhereMock, getDbMock };
  });

vi.mock("../db/client", () => ({
  getDb: getDbMock,
}));

const OWNER_USER_ID = "user-a";
const OTHER_USER_ID = "user-b";
const REPORT_ID = "report-1";
const CASE_ID = "case-1";

function reportRow(overrides: Partial<{ verifiedClaims: unknown[] }> = {}) {
  return {
    id: REPORT_ID,
    caseId: CASE_ID,
    content: { verifiedClaims: overrides.verifiedClaims ?? [{}, {}] }, // length 2
  };
}

function caseRow(overrides: Partial<{ ownerUserId: string }> = {}) {
  return { id: CASE_ID, ownerUserId: overrides.ownerUserId ?? OWNER_USER_ID };
}

function minimalValidPayload() {
  return { overallRating: "ACCURATE" as const };
}

describe("lib/feedback/submit-feedback submitReportFeedback (REQ-FEEDBACK-009~013)", () => {
  beforeEach(() => {
    valuesMock.mockClear();
    insertMock.mockClear();
    reportLimitMock.mockReset();
    caseLimitMock.mockReset();
    evidenceWhereMock.mockReset();
    getDbMock.mockClear();
  });

  it("[AC-FEEDBACK-009] reportId 소유자가 아닌 사용자가 제출하면 거부되고 insert가 호출되지 않는다", async () => {
    reportLimitMock.mockResolvedValueOnce([reportRow()]);
    caseLimitMock.mockResolvedValueOnce([caseRow({ ownerUserId: OWNER_USER_ID })]);
    const { submitReportFeedback } = await import("./submit-feedback");

    const result = await submitReportFeedback(REPORT_ID, OTHER_USER_ID, minimalValidPayload());

    expect(result.success).toBe(false);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("존재하지 않는 reportId면 거부되고 insert가 호출되지 않는다", async () => {
    reportLimitMock.mockResolvedValueOnce([]);
    const { submitReportFeedback } = await import("./submit-feedback");

    const result = await submitReportFeedback(
      "does-not-exist",
      OWNER_USER_ID,
      minimalValidPayload()
    );

    expect(result.success).toBe(false);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("[AC-FEEDBACK-011] claimIndex가 verifiedClaims 길이 범위를 벗어나면 거부되고 insert가 호출되지 않는다", async () => {
    reportLimitMock.mockResolvedValueOnce([reportRow({ verifiedClaims: [{}, {}] })]);
    caseLimitMock.mockResolvedValueOnce([caseRow()]);
    const { submitReportFeedback } = await import("./submit-feedback");

    const result = await submitReportFeedback(REPORT_ID, OWNER_USER_ID, {
      overallRating: "ACCURATE",
      claimAssessments: [{ claimIndex: 5, verdict: "CORRECT" }],
    });

    expect(result.success).toBe(false);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("[AC-FEEDBACK-012] 존재하지 않는 evidenceId면 거부되고 insert가 호출되지 않는다", async () => {
    reportLimitMock.mockResolvedValueOnce([reportRow()]);
    caseLimitMock.mockResolvedValueOnce([caseRow()]);
    evidenceWhereMock.mockResolvedValueOnce([]); // 존재하는 evidence 없음
    const { submitReportFeedback } = await import("./submit-feedback");

    const result = await submitReportFeedback(REPORT_ID, OWNER_USER_ID, {
      overallRating: "ACCURATE",
      evidenceAssessments: [{ evidenceId: "does-not-exist", verdict: "USEFUL" }],
    });

    expect(result.success).toBe(false);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("[AC-FEEDBACK-012] 존재하지만 리포트에 인용되지 않은 evidenceId도 existence-only 정책상 성공한다", async () => {
    reportLimitMock.mockResolvedValueOnce([reportRow()]);
    caseLimitMock.mockResolvedValueOnce([caseRow()]);
    evidenceWhereMock.mockResolvedValueOnce([{ id: "ev-uncited" }]); // 존재함
    const { submitReportFeedback } = await import("./submit-feedback");

    const result = await submitReportFeedback(REPORT_ID, OWNER_USER_ID, {
      overallRating: "ACCURATE",
      evidenceAssessments: [{ evidenceId: "ev-uncited", verdict: "USEFUL" }],
    });

    expect(result.success).toBe(true);
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("[AC-FEEDBACK-010] 유효한 제출은 caseId를 report→case 조회에서 도출한 값으로 삽입하고 동일 값을 반환한다", async () => {
    reportLimitMock.mockResolvedValueOnce([reportRow()]);
    caseLimitMock.mockResolvedValueOnce([caseRow()]);
    const { submitReportFeedback } = await import("./submit-feedback");

    const result = await submitReportFeedback(REPORT_ID, OWNER_USER_ID, minimalValidPayload());

    expect(result).toMatchObject({ success: true, caseId: CASE_ID });
    expect(insertMock).toHaveBeenCalledTimes(1);
    const inserted = valuesMock.mock.calls[0][0];
    expect(inserted.caseId).toBe(CASE_ID);
    expect(inserted.reportId).toBe(REPORT_ID);
    expect(inserted.userId).toBe(OWNER_USER_ID);
  });

  it("[AC-FEEDBACK-013] 동일 (reportId, userId)로 두 번 제출해도 둘 다 성공하며 append-only로 누적된다", async () => {
    reportLimitMock.mockResolvedValueOnce([reportRow()]).mockResolvedValueOnce([reportRow()]);
    caseLimitMock.mockResolvedValueOnce([caseRow()]).mockResolvedValueOnce([caseRow()]);
    const { submitReportFeedback } = await import("./submit-feedback");

    const first = await submitReportFeedback(REPORT_ID, OWNER_USER_ID, minimalValidPayload());
    const second = await submitReportFeedback(REPORT_ID, OWNER_USER_ID, minimalValidPayload());

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    if (first.success && second.success) {
      expect(first.feedbackId).not.toBe(second.feedbackId);
    }
    expect(insertMock).toHaveBeenCalledTimes(2);
  });

  it("[AC-FEEDBACK-013] 최소 payload({overallRating}만)는 빈 배열에 대해 evidence 존재 검사 쿼리 없이 성공한다", async () => {
    reportLimitMock.mockResolvedValueOnce([reportRow()]);
    caseLimitMock.mockResolvedValueOnce([caseRow()]);
    const { submitReportFeedback } = await import("./submit-feedback");

    const result = await submitReportFeedback(REPORT_ID, OWNER_USER_ID, minimalValidPayload());

    expect(result.success).toBe(true);
    // evidenceAssessments가 비어있으므로 evidence 존재 검사(3번째 select())가 호출되지 않아야 한다.
    expect(evidenceWhereMock).not.toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("정적 검증(Zod) 실패 시 거부되고 insert가 호출되지 않는다", async () => {
    reportLimitMock.mockResolvedValueOnce([reportRow()]);
    caseLimitMock.mockResolvedValueOnce([caseRow()]);
    const { submitReportFeedback } = await import("./submit-feedback");

    const result = await submitReportFeedback(REPORT_ID, OWNER_USER_ID, {
      overallRating: "NOT_A_VALID_RATING",
    });

    expect(result.success).toBe(false);
    expect(insertMock).not.toHaveBeenCalled();
  });
});
