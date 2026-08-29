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

// SPEC-EVIDENCE-001 M2 — candidate eligibility 전략 A(현행)/B(issueType 반영)
// 비교(design.md §2.1, AC-EVIDENCE-008) + 결정론적 정렬(design.md §2.3,
// AC-EVIDENCE-011) + TOP_N 불변 확인(AC-EVIDENCE-010).
describe("retrieveEvidence 전략 A/B 비교 (REQ-EVIDENCE-009/013, AC-EVIDENCE-008)", () => {
  it("전략 A/B 둘 다에서 issueType 정확 일치 evidence A가 키워드 우연 일치 evidence B보다 높은 순위로 온다", async () => {
    const rows = [
      makeRow({
        id: "e-issuetype-and-keyword",
        category: "상해후유장해",
        title: "발목 관절 장해 평가 기준",
        content: "장해 평가 기준 검토",
        issueTypes: ["DISABILITY_GRADE_CRITERIA"],
      }),
      makeRow({
        id: "e-keyword-only",
        category: "상해후유장해",
        title: "장해 평가 기준과 무관한 다른 쟁점",
        content: "우연히 장해 평가 기준이라는 단어만 겹친다",
        issueTypes: [],
      }),
    ];
    const query = makeQuery({
      id: "q-ab",
      domain: "INJURY_DISABILITY",
      issueType: "DISABILITY_GRADE_CRITERIA",
      keywords: ["장해 평가 기준"],
    });

    for (const strategy of ["A", "B"] as const) {
      const result = await retrieveEvidence([query], makeFakeDb(rows), strategy);
      const ids = result.get("q-ab")?.map((e) => e.id) ?? [];
      expect(ids.indexOf("e-issuetype-and-keyword")).toBeLessThan(ids.indexOf("e-keyword-only"));
    }
  });

  it("전략 A는 issueType이 정확히 일치해도 키워드가 전혀 없는 known-relevant evidence C를 후보에서 누락하고, 전략 B는 복구한다 (REQ-EVIDENCE-013)", async () => {
    const rows = [
      makeRow({
        id: "e-c-no-keyword",
        category: "상해후유장해",
        title: "기왕증 감액 판단 판례",
        content: "인과관계·기여도에 대한 구체적 심리가 필요하다",
        issueTypes: ["PRE_EXISTING_CONDITION"],
      }),
    ];
    const query = makeQuery({
      id: "q-c",
      domain: "INJURY_DISABILITY",
      issueType: "PRE_EXISTING_CONDITION",
      keywords: ["연골 손상"], // evidence 어디에도 등장하지 않는 키워드
    });

    const resultA = await retrieveEvidence([query], makeFakeDb(rows), "A");
    expect(resultA.get("q-c")?.map((e) => e.id)).toEqual([]);

    const resultB = await retrieveEvidence([query], makeFakeDb(rows), "B");
    expect(resultB.get("q-c")?.map((e) => e.id)).toEqual(["e-c-no-keyword"]);
  });

  it("전략 B에서도 issueType 불일치만으로 evidence를 하드 배제하지 않는다 — 키워드 매칭만으로도 여전히 후보가 된다 (REQ-EVIDENCE-009)", async () => {
    const rows = [
      makeRow({
        id: "e-keyword-only-2",
        category: "상해후유장해",
        title: "장해 평가 기준",
        content: "장해 평가 기준",
        issueTypes: ["DIAGNOSIS"], // query.issueType과 불일치
      }),
    ];
    const query = makeQuery({
      id: "q-noexclude",
      domain: "INJURY_DISABILITY",
      issueType: "DISABILITY_GRADE_CRITERIA",
      keywords: ["장해 평가 기준"],
    });

    const resultB = await retrieveEvidence([query], makeFakeDb(rows), "B");
    expect(resultB.get("q-noexclude")?.map((e) => e.id)).toEqual(["e-keyword-only-2"]);
  });
});

describe("retrieveEvidence 결정론적 정렬 tie-break (REQ-EVIDENCE-012, AC-EVIDENCE-011)", () => {
  it("score가 동점인 evidence는 id 오름차순으로 정렬되고, 동일 입력을 3회 호출해도 순서가 항상 같다", async () => {
    const rows = [
      makeRow({ id: "e-z", category: "상해후유장해", title: "장해", content: "장해" }),
      makeRow({ id: "e-a", category: "상해후유장해", title: "장해", content: "장해" }),
      makeRow({ id: "e-m", category: "상해후유장해", title: "장해", content: "장해" }),
    ];
    const query = makeQuery({
      id: "q-tie",
      domain: "INJURY_DISABILITY",
      keywords: ["장해"],
    });

    for (let i = 0; i < 3; i++) {
      const result = await retrieveEvidence([query], makeFakeDb(rows));
      expect(result.get("q-tie")?.map((e) => e.id)).toEqual(["e-a", "e-m", "e-z"]);
    }
  });
});

describe("retrieveEvidence TOP_N 불변 확인 (REQ-EVIDENCE-011, AC-EVIDENCE-010)", () => {
  it("동일 쿼리에 매칭되는 evidence가 5건을 초과해도 상위 5건만 반환한다", async () => {
    const rows = Array.from({ length: 7 }, (_, i) =>
      makeRow({
        id: `e-${i}`,
        category: "상해후유장해",
        title: "장해 평가 기준",
        content: "장해 평가 기준",
      })
    );
    const query = makeQuery({
      id: "q-topn",
      domain: "INJURY_DISABILITY",
      keywords: ["장해 평가 기준"],
    });

    const result = await retrieveEvidence([query], makeFakeDb(rows));

    expect(result.get("q-topn")?.length).toBe(5);
  });
});
