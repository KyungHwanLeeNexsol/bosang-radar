import { beforeEach, describe, expect, it, vi } from "vitest";
import { reports } from "../db/schema";

const { dbMock, getDbMock } = vi.hoisted(() => {
  const chain = {
    select: vi.fn(),
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  };
  chain.select.mockReturnValue(chain);
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
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
  content: {
    caseSummary: {},
    reviewTargets: [],
    verifiedClaims: [],
    missingMaterials: [],
    uncertainty: [],
    generatedAt: "2024-03-15T00:00:00.000Z",
  },
  createdAt: new Date("2024-03-15T00:00:00.000Z"),
};

describe("lib/cases/get-case-for-owner getCaseForOwner (REQ-SCAFFOLD-011, AC-SCAFFOLD-010)", () => {
  beforeEach(() => {
    dbMock.limit.mockReset();
    dbMock.orderBy.mockClear();
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
    expect(result?.report?.verifiedClaims).toEqual([]);
    expect(result?.reportId).toBe("report-1");
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

describe("lib/cases/get-case-for-owner 다중 리포트 결정론적 선택 (REQ-FEEDBACK-009, AC-FEEDBACK-010)", () => {
  beforeEach(() => {
    dbMock.limit.mockReset();
    dbMock.orderBy.mockClear();
    getDbMock.mockClear();
  });

  it("reports 쿼리에 createdAt DESC, id DESC tie-break 정렬을 적용한다", async () => {
    const { getCaseForOwner } = await import("./get-case-for-owner");
    dbMock.limit.mockResolvedValueOnce([sampleCaseRow]).mockResolvedValueOnce([sampleReportRow]);

    await getCaseForOwner("case-1", "user-a");

    expect(dbMock.orderBy).toHaveBeenCalledTimes(1);
    const [createdAtOrder, idOrder] = dbMock.orderBy.mock.calls[0];
    // desc(col)의 queryChunks[1]은 원본 column 객체 레퍼런스, queryChunks[2]는 " desc" 문자열이다.
    expect(createdAtOrder.queryChunks[1]).toBe(reports.createdAt);
    expect(createdAtOrder.queryChunks[2].value).toEqual([" desc"]);
    expect(idOrder.queryChunks[1]).toBe(reports.id);
    expect(idOrder.queryChunks[2].value).toEqual([" desc"]);
  });

  it("createdAt이 더 최근인 report-2가 선택되면, 표시용 report와 제출용 reportId가 동일한 행에서 도출된다", async () => {
    const { getCaseForOwner } = await import("./get-case-for-owner");
    const newerReportRow = {
      ...sampleReportRow,
      id: "report-2",
      createdAt: new Date("2024-04-01T00:00:00.000Z"),
    };
    // 실제 DB라면 orderBy(desc(createdAt), desc(id)).limit(1)이 report-2 하나만
    // 반환한다 — 이 mock은 그 결과(DB가 이미 정렬·제한을 적용한 산출물)를 시뮬레이션한다.
    dbMock.limit.mockResolvedValueOnce([sampleCaseRow]).mockResolvedValueOnce([newerReportRow]);

    const result = await getCaseForOwner("case-1", "user-a");

    expect(result?.reportId).toBe("report-2");
    // report와 reportId가 동일한 쿼리 행(newerReportRow)에서 함께 도출됐는지 검증.
    expect(result?.report).toEqual(newerReportRow.content);
  });

  it("createdAt이 동일하면 id DESC로 tie-break된 행이 선택되고, report/reportId가 그 행과 일치한다", async () => {
    const { getCaseForOwner } = await import("./get-case-for-owner");
    const tieBrokenRow = {
      ...sampleReportRow,
      id: "report-9",
      createdAt: sampleReportRow.createdAt, // 동일 시각
    };
    // orderBy(desc(createdAt), desc(id))가 적용된 DB라면 동일 createdAt 중
    // id가 가장 큰 행(tieBrokenRow, "report-9")이 반환된다.
    dbMock.limit.mockResolvedValueOnce([sampleCaseRow]).mockResolvedValueOnce([tieBrokenRow]);

    const result = await getCaseForOwner("case-1", "user-a");

    expect(result?.reportId).toBe("report-9");
    expect(result?.report).toEqual(tieBrokenRow.content);
  });
});
