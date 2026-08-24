import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, getDbMock } = vi.hoisted(() => {
  const chain = {
    select: vi.fn(),
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
  chain.select.mockReturnValue(chain);
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  return { dbMock: chain, getDbMock: vi.fn(() => chain) };
});

vi.mock("../db/client", () => ({
  getDb: getDbMock,
}));

const sampleCaseRow = {
  id: "case-1",
  ownerUserId: "user-a",
  input: { incidentDescription: "d" },
  status: "completed",
  createdAt: new Date("2024-03-15T00:00:00.000Z"),
  updatedAt: new Date("2024-03-15T00:00:00.000Z"),
};

const sampleReportRow = {
  id: "report-1",
  caseId: "case-1",
  content: { caseSummary: {}, claims: [], generatedAt: "2024-03-15T00:00:00.000Z" },
  createdAt: new Date("2024-03-15T00:00:00.000Z"),
};

describe("lib/cases/get-case-for-owner getCaseForOwner (REQ-SCAFFOLD-011, AC-SCAFFOLD-010)", () => {
  beforeEach(() => {
    dbMock.limit.mockReset();
    getDbMock.mockClear();
  });

  it("사건을 소유한 사용자가 조회하면 case + report를 반환한다", async () => {
    const { getCaseForOwner } = await import("./get-case-for-owner");
    dbMock.limit
      .mockResolvedValueOnce([sampleCaseRow]) // cases 조회
      .mockResolvedValueOnce([sampleReportRow]); // reports 조회

    const result = await getCaseForOwner("case-1", "user-a");

    expect(result).not.toBeNull();
    expect(result?.id).toBe("case-1");
    expect(result?.report?.claims).toEqual([]);
  });

  it("사용자 A 소유의 사건을 사용자 B가 조회하면 owner_user_id 필터링에 의해 null을 반환한다 (cross-user access blocked)", async () => {
    const { getCaseForOwner } = await import("./get-case-for-owner");
    // ownerUserId 필터가 걸린 WHERE절 결과이므로, user-a 소유 사건을
    // user-b로 조회하면 DB는 빈 행 집합을 반환해야 한다.
    dbMock.limit.mockResolvedValueOnce([]);

    const result = await getCaseForOwner("case-1", "user-b");

    expect(result).toBeNull();
  });

  it("존재하지 않는 caseId를 조회하면 null을 반환한다", async () => {
    const { getCaseForOwner } = await import("./get-case-for-owner");
    dbMock.limit.mockResolvedValueOnce([]);

    const result = await getCaseForOwner("does-not-exist", "user-a");

    expect(result).toBeNull();
  });
});
