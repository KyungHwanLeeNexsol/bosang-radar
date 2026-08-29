import { describe, expect, it } from "vitest";
import { retrieveEvidence } from "./evidence-retriever";
import type { EvidenceCandidate, ResearchQuery } from "./types";

// SPEC-RESEARCH-001 M4 — EvidenceRetriever DB 조회 + 쿼리별 필터링/스코어링
// (design.md §6 2차 revision). 반환 타입이 EvidenceCandidate[] →
// Map<queryId, EvidenceCandidate[]>로 바뀌고, 관련성 판정이 "category만
// 일치해도 포함"(1차 설계 결함)에서 "scope별 필터 술어"로 바뀌었으므로
// 기존 두 테스트 케이스는 이 파일에서 전면 재작성된다(plan.md §D 위험).

type FakeRow = EvidenceCandidate & { createdAt: Date };

function makeRow(overrides: Partial<FakeRow> & Pick<FakeRow, "id">): FakeRow {
  return {
    category: "상해후유장해",
    evidenceType: "OTHER",
    scope: "DOMAIN_SPECIFIC",
    title: "",
    content: "",
    sourceUrl: null,
    issueTypes: [],
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeQuery(
  overrides: Partial<ResearchQuery> & Pick<ResearchQuery, "id" | "domain" | "keywords">
): ResearchQuery {
  return {
    topic: "topic",
    focus: "focus",
    issueType: "DISABILITY_LOCATION",
    ...overrides,
  };
}

function makeFakeDb(rows: FakeRow[]): Parameters<typeof retrieveEvidence>[1] {
  return {
    select: () => ({
      from: async () => rows,
    }),
  } as unknown as Parameters<typeof retrieveEvidence>[1];
}

describe("lib/pipeline/evidence-retriever retrieveEvidence (REQ-RESEARCH-004~007, design.md §6)", () => {
  it("반환 타입은 query.id를 키로 갖는 Map이다", async () => {
    const result = await retrieveEvidence([], makeFakeDb([]));

    expect(result).toBeInstanceOf(Map);
  });

  it("category(담보 도메인)만 일치하고 키워드가 하나도 매칭되지 않으면 evidence를 포함하지 않는다 (1차 설계 결함 회귀 방지, AC-RESEARCH-005)", async () => {
    const rows = [
      makeRow({
        id: "e-domain-only",
        category: "상해후유장해",
        scope: "DOMAIN_SPECIFIC",
        title: "무관한 제목",
        content: "무관한 본문",
      }),
    ];
    const query = makeQuery({
      id: "q1",
      domain: "INJURY_DISABILITY",
      keywords: ["장해 평가 기준"],
    });

    const result = await retrieveEvidence([query], makeFakeDb(rows));

    expect(result.get("q1")).toEqual([]);
  });

  it("도메인 일치 AND 키워드 매칭을 모두 만족하는 DOMAIN_SPECIFIC evidence는 포함한다", async () => {
    const rows = [
      makeRow({
        id: "e-match",
        category: "상해후유장해",
        title: "발목 장해 평가 기준",
        content: "관절가동범위 제한",
      }),
      makeRow({
        id: "e-wrong-domain",
        category: "질병후유장해",
        title: "장해 평가 기준",
        content: "장해 평가 기준",
      }),
    ];
    const query = makeQuery({
      id: "q2",
      domain: "INJURY_DISABILITY",
      keywords: ["장해 평가 기준"],
    });

    const result = await retrieveEvidence([query], makeFakeDb(rows));

    expect(result.get("q2")?.map((e) => e.id)).toEqual(["e-match"]);
  });

  it("scope이 UNIVERSAL인 evidence는 담보 도메인이 달라도 키워드가 매칭되면 포함된다", async () => {
    const rows = [
      makeRow({
        id: "e-universal",
        category: "공통",
        evidenceType: "STATUTE",
        scope: "UNIVERSAL",
        title: "보험금 지급 절차",
        content: "청구 절차 공통 규정",
      }),
    ];
    const query = makeQuery({
      id: "q3",
      domain: "DISEASE_DISABILITY",
      keywords: ["청구 절차"],
    });

    const result = await retrieveEvidence([query], makeFakeDb(rows));

    expect(result.get("q3")?.map((e) => e.id)).toEqual(["e-universal"]);
  });

  it("scope이 UNIVERSAL이어도 키워드가 매칭되지 않으면 포함하지 않는다 (무차별 공통 자료 주입 방지)", async () => {
    const rows = [
      makeRow({
        id: "e-universal-nomatch",
        category: "공통",
        scope: "UNIVERSAL",
        title: "무관한 제목",
        content: "무관한 본문",
      }),
    ];
    const query = makeQuery({
      id: "q4",
      domain: "INJURY_DISABILITY",
      keywords: ["장해 평가 기준"],
    });

    const result = await retrieveEvidence([query], makeFakeDb(rows));

    expect(result.get("q4")).toEqual([]);
  });

  it("매칭되는 evidence가 없는 쿼리는 빈 배열을 값으로 가지며 전체 evidence로 폴백하지 않는다", async () => {
    const rows = [
      makeRow({ id: "e-1", category: "상해후유장해", title: "무관", content: "무관" }),
      makeRow({ id: "e-2", category: "상해후유장해", title: "무관2", content: "무관2" }),
    ];
    const query = makeQuery({
      id: "q5",
      domain: "INJURY_DISABILITY",
      keywords: ["존재하지-않는-키워드"],
    });

    const result = await retrieveEvidence([query], makeFakeDb(rows));

    expect(result.get("q5")).toEqual([]);
    expect(result.get("q5")?.length ?? 0).toBe(0);
  });

  it("여러 쿼리를 전달하면 각 query.id별로 독립된 evidence 배열을 반환한다", async () => {
    const rows = [
      makeRow({
        id: "e-injury",
        category: "상해후유장해",
        title: "발목 장해",
        content: "발목 장해",
      }),
      makeRow({
        id: "e-disease",
        category: "질병후유장해",
        title: "진단 확정",
        content: "진단 확정",
      }),
    ];
    const injuryQuery = makeQuery({
      id: "q-injury",
      domain: "INJURY_DISABILITY",
      keywords: ["발목"],
    });
    const diseaseQuery = makeQuery({
      id: "q-disease",
      domain: "DISEASE_DISABILITY",
      keywords: ["진단"],
    });

    const result = await retrieveEvidence([injuryQuery, diseaseQuery], makeFakeDb(rows));

    expect(result.get("q-injury")?.map((e) => e.id)).toEqual(["e-injury"]);
    expect(result.get("q-disease")?.map((e) => e.id)).toEqual(["e-disease"]);
  });
});
