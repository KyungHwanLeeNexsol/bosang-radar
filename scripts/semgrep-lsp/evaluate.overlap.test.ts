import { describe, it } from "vitest";
import { D4_SCENARIOS, runScenario } from "./testing/evaluate-scenarios";

// ADR D4 겹침 표의 모든 행: 대표 상태와 사유 코드의 정확한 집합.
describe("ADR D4 겹침 표", () => {
  for (const scenario of D4_SCENARIOS) {
    it(`${scenario.id} ${scenario.title}`, () => {
      runScenario(scenario);
    });
  }
});
