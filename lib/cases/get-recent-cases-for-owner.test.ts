import { beforeEach, describe, expect, it, vi } from "vitest";
import { cases } from "../db/schema";

// SPEC-UI-MIGRATION-001 M6 (REQ-013) — "최근 리서치" 신규 read-only 조회
// 함수. getCaseForOwner와 동일한 owner-scope 신뢰 경계(eq(cases.ownerUserId,
// ownerUserId))를 사용하며, 신규 스키마/마이그레이션 없이 기존 cases
// 테이블만 조회한다.

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

function caseRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "case-1",
    ownerUserId: "user-a",
    input: { diagnosisName: "발목 인대 파열", disabilityBodyPart: "발목" },
    status: "completed",
    createdAt: new Date("2024-03-15T00:00:00.000Z"),
    updatedAt: new Date("2024-03-15T00:00:00.000Z"),
    ...overrides,
  };
}

describe("lib/cases/get-recent-cases-for-owner", () => {
  beforeEach(() => {
    dbMock.limit.mockReset();
    dbMock.where.mockClear();
    dbMock.orderBy.mockClear();
    getDbMock.mockClear();
  });

  it("AC-013: createdAt 내림차순으로 최대 3건을 반환한다", async () => {
    const { getRecentCasesForOwner } = await import("./get-recent-cases-for-owner");
    dbMock.limit.mockResolvedValueOnce([caseRow({ id: "c1" }), caseRow({ id: "c2" })]);

    const result = await getRecentCasesForOwner("user-a");

    expect(dbMock.limit).toHaveBeenCalledWith(3);
    expect(result).toHaveLength(2);
  });

  it("AC-013a: 사건 번호/제목/보조정보/상태가 input.diagnosisName/disabilityBodyPart/cases.id/cases.status에서 파생된다", async () => {
    const { getRecentCasesForOwner } = await import("./get-recent-cases-for-owner");
    dbMock.limit.mockResolvedValueOnce([caseRow()]);

    const [item] = await getRecentCasesForOwner("user-a");

    expect(item.id).toBe("case-1");
    expect(item.title).toBe("발목 인대 파열");
    expect(item.subtitle).toBe("발목");
    expect(item.status).toBe("completed");
  });

  it("AC-013b: eq(cases.ownerUserId, ownerUserId) 조건으로 조회한다(owner-scope)", async () => {
    const { getRecentCasesForOwner } = await import("./get-recent-cases-for-owner");
    dbMock.limit.mockResolvedValueOnce([]);

    await getRecentCasesForOwner("user-a");

    expect(dbMock.where).toHaveBeenCalledTimes(1);
    const condition = dbMock.where.mock.calls[0][0];
    expect(condition.queryChunks[1]).toBe(cases.ownerUserId);
  });

  it("AC-013c: input JSON에 diagnosisName/disabilityBodyPart가 없으면 폴백 텍스트를 반환한다", async () => {
    const { getRecentCasesForOwner } = await import("./get-recent-cases-for-owner");
    dbMock.limit.mockResolvedValueOnce([caseRow({ input: {} })]);

    const [item] = await getRecentCasesForOwner("user-a");

    expect(item.title).toBe("제목 없음");
    expect(item.subtitle).toBe("정보 없음");
  });

  it("AC-013c: input이 손상된 값(null/문자열)이어도 예외 없이 폴백 텍스트를 반환한다", async () => {
    const { getRecentCasesForOwner } = await import("./get-recent-cases-for-owner");
    dbMock.limit.mockResolvedValueOnce([caseRow({ input: null }), caseRow({ input: "broken" })]);

    const result = await getRecentCasesForOwner("user-a");

    expect(result).toHaveLength(2);
    for (const item of result) {
      expect(item.title).toBe("제목 없음");
      expect(item.subtitle).toBe("정보 없음");
    }
  });
});
