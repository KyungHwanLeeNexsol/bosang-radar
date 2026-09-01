import { beforeEach, describe, expect, it, vi } from "vitest";

// SPEC-FEEDBACK-001 M5 — 옛 자유 텍스트 submitFeedback() 테스트를 제거하고
// (REQ-FEEDBACK-015), 신규 submitReportFeedback() Server Action의 얇은
// 세션-가드 테스트만 유지한다. 나머지 write-path 로직(소유권/동적 검증/영속화)은
// lib/feedback/submit-feedback.test.ts가 전담한다(plan.md §B M5).

const { getCurrentSessionMock, submitReportFeedbackWritePathMock } = vi.hoisted(() => {
  return {
    getCurrentSessionMock: vi.fn(),
    submitReportFeedbackWritePathMock: vi.fn(),
  };
});

vi.mock("@/lib/auth/session", () => ({
  getCurrentSession: getCurrentSessionMock,
}));

vi.mock("@/lib/feedback/submit-feedback", () => ({
  submitReportFeedback: submitReportFeedbackWritePathMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("app/cases/[caseId]/actions submitReportFeedback", () => {
  beforeEach(() => {
    getCurrentSessionMock.mockReset();
    submitReportFeedbackWritePathMock.mockReset();
  });

  it("로그인되지 않은 상태면 write-path를 호출하지 않고 예외를 던진다", async () => {
    getCurrentSessionMock.mockResolvedValue(null);
    const { submitReportFeedback } = await import("./actions");

    await expect(submitReportFeedback("report-1", { overallRating: "ACCURATE" })).rejects.toThrow();
    expect(submitReportFeedbackWritePathMock).not.toHaveBeenCalled();
  });

  it("로그인된 사용자는 세션의 userId로 write-path를 호출한다", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    submitReportFeedbackWritePathMock.mockResolvedValue({
      success: true,
      feedbackId: "fb-1",
      caseId: "case-1",
    });
    const { submitReportFeedback } = await import("./actions");

    const result = await submitReportFeedback("report-1", { overallRating: "ACCURATE" });

    expect(submitReportFeedbackWritePathMock).toHaveBeenCalledWith("report-1", "user-1", {
      overallRating: "ACCURATE",
    });
    expect(result).toEqual({ success: true, feedbackId: "fb-1", caseId: "case-1" });
  });
});
