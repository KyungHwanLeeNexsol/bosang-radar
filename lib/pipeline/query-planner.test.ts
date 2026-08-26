import { describe, expect, it } from "vitest";
import { planQueries } from "./query-planner";

const normalizedCase = {
  incidentDescription: "계단에서 미끄러짐",
  diagnosisName: "발목 인대 파열",
  disabilityBodyPart: "우측 발목",
  incidentDate: "2024-03-15",
  normalizedAt: "2024-03-16T00:00:00.000Z",
};

const FORBIDDEN_WORDS = ["지급", "확정", "확률"];

describe("lib/pipeline/query-planner planQueries (REQ-RESEARCH-002/003/010)", () => {
  it("NormalizedCase로부터 최소 1개 이상의 리서치 쿼리를 생성한다", () => {
    const queries = planQueries(normalizedCase);

    expect(queries.length).toBeGreaterThan(0);
  });

  it("각 쿼리는 서로 다른 고유 id를 가진다", () => {
    const queries = planQueries(normalizedCase);
    const ids = new Set(queries.map((query) => query.id));

    expect(ids.size).toBe(queries.length);
  });

  it("쿼리 topic에는 상해/질병 후유장해 담보 관점이 반영된다", () => {
    const queries = planQueries(normalizedCase);
    const topics = queries.map((query) => query.topic).join(" ");

    expect(topics).toContain("후유장해");
  });

  it("AC-RESEARCH-002: 최소 6개 쿼리를 생성하고, 두 도메인 각각 도메인에 맞는 위치/진단 이슈타입 + DISABILITY_GRADE_CRITERIA + CAUSATION 3종을 최소 1개씩 포함한다", () => {
    const queries = planQueries(normalizedCase);

    expect(queries.length).toBeGreaterThanOrEqual(6);

    const injuryQueries = queries.filter((query) => query.domain === "INJURY_DISABILITY");
    const diseaseQueries = queries.filter((query) => query.domain === "DISEASE_DISABILITY");

    for (const issueType of ["DISABILITY_LOCATION", "DISABILITY_GRADE_CRITERIA", "CAUSATION"] as const) {
      expect(injuryQueries.some((query) => query.issueType === issueType)).toBe(true);
    }
    for (const issueType of ["DIAGNOSIS", "DISABILITY_GRADE_CRITERIA", "CAUSATION"] as const) {
      expect(diseaseQueries.some((query) => query.issueType === issueType)).toBe(true);
    }
  });

  it("AC-RESEARCH-002: INJURY_DISABILITY 도메인에는 DIAGNOSIS 이슈타입이, DISEASE_DISABILITY 도메인에는 DISABILITY_LOCATION 이슈타입이 생성되지 않는다(도메인에 맞는 위치/진단 이슈타입만 생성)", () => {
    const queries = planQueries(normalizedCase);

    const injuryQueries = queries.filter((query) => query.domain === "INJURY_DISABILITY");
    const diseaseQueries = queries.filter((query) => query.domain === "DISEASE_DISABILITY");

    expect(injuryQueries.some((query) => query.issueType === "DIAGNOSIS")).toBe(false);
    expect(diseaseQueries.some((query) => query.issueType === "DISABILITY_LOCATION")).toBe(false);
  });

  it("각 쿼리는 EvidenceRetriever 필터링용 keywords 배열을 채운다", () => {
    const queries = planQueries(normalizedCase);

    for (const query of queries) {
      expect(Array.isArray(query.keywords)).toBe(true);
      expect(query.keywords.length).toBeGreaterThan(0);
    }
  });

  it("AC-RESEARCH-003: 쿼리 topic/focus에 지급 여부·확률을 단정하는 금칙어가 포함되지 않는다", () => {
    const queries = planQueries(normalizedCase);

    for (const query of queries) {
      for (const forbidden of FORBIDDEN_WORDS) {
        expect(query.topic).not.toContain(forbidden);
        expect(query.focus).not.toContain(forbidden);
      }
    }
  });

  it("사건 텍스트에 기왕증을 시사하는 표현('이전')이 있으면 PRE_EXISTING_CONDITION 쿼리를 조건부로 추가한다(design.md §5)", () => {
    const withPriorHistory = {
      ...normalizedCase,
      incidentDescription: "이전에도 유사한 부상으로 치료받은 이력이 있습니다.",
    };

    const queries = planQueries(withPriorHistory);
    const baselineQueries = planQueries(normalizedCase);

    expect(queries.some((query) => query.issueType === "PRE_EXISTING_CONDITION")).toBe(true);
    expect(baselineQueries.some((query) => query.issueType === "PRE_EXISTING_CONDITION")).toBe(false);
    expect(queries.length).toBeGreaterThan(baselineQueries.length);
  });
});
