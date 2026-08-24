import { describe, expect, it } from "vitest";
import { planQueries } from "./query-planner";

const normalizedCase = {
  incidentDescription: "계단에서 미끄러짐",
  diagnosisName: "발목 인대 파열",
  disabilityBodyPart: "우측 발목",
  incidentDate: "2024-03-15",
  normalizedAt: "2024-03-16T00:00:00.000Z",
};

describe("lib/pipeline/query-planner planQueries (REQ-SCAFFOLD-013)", () => {
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
});
