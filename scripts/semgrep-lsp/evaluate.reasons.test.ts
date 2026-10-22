import { describe, it } from "vitest";
import { REASON_SCENARIOS, runScenario } from "./testing/evaluate-scenarios";

// evaluate.ts가 만드는 사유를 하나씩 일으키는 시나리오(S·D4 표에 없는 것). 각 시나리오는 대표 상태와 사유
// 코드의 정확한 집합을 확인한다. 합성 입력이며 실제 Semgrep의 출력이 아니다.
describe("사유별 합성 시나리오", () => {
  for (const scenario of REASON_SCENARIOS) {
    it(`${scenario.id} ${scenario.title}`, () => {
      runScenario(scenario);
    });
  }
});
