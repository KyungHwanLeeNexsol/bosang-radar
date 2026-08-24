import { beforeEach, describe, expect, it, vi } from "vitest";

const { valuesMock, insertMock, getDbMock, getCurrentSessionMock } = vi.hoisted(() => {
  const valuesMock = vi.fn().mockResolvedValue(undefined);
  const insertMock = vi.fn(() => ({ values: valuesMock }));
  const getDbMock = vi.fn(() => ({ insert: insertMock }));
  const getCurrentSessionMock = vi.fn();
  return { valuesMock, insertMock, getDbMock, getCurrentSessionMock };
});

vi.mock("@/lib/db/client", () => ({
  getDb: getDbMock,
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentSession: getCurrentSessionMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("app/cases/[caseId]/actions submitFeedback", () => {
  beforeEach(() => {
    valuesMock.mockClear();
    insertMock.mockClear();
    getDbMock.mockClear();
    getCurrentSessionMock.mockReset();
  });

  it("로그인된 사용자가 피드백을 제출하면 feedback 테이블에 저장한다", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    const { submitFeedback } = await import("./actions");

    await submitFeedback("case-1", "추가 검토 의견입니다.");

    expect(insertMock).toHaveBeenCalledTimes(1);
    const savedValues = valuesMock.mock.calls[0][0];
    expect(savedValues.caseId).toBe("case-1");
    expect(savedValues.userId).toBe("user-1");
    expect(savedValues.content).toBe("추가 검토 의견입니다.");
  });

  it("로그인되지 않은 상태면 저장 없이 예외를 던진다", async () => {
    getCurrentSessionMock.mockResolvedValue(null);
    const { submitFeedback } = await import("./actions");

    await expect(submitFeedback("case-1", "무단 접근 시도")).rejects.toThrow();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("빈 내용은 저장을 건너뛴다", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    const { submitFeedback } = await import("./actions");

    await submitFeedback("case-1", "   ");

    expect(insertMock).not.toHaveBeenCalled();
  });
});
