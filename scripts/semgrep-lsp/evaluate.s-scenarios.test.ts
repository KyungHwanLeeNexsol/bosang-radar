import { describe, it } from "vitest";
import { S_SCENARIOS, runScenario } from "./testing/evaluate-scenarios";

// rev2 4.3의 합성 메시지 시험(S13a는 framing 단위, T1은 세션 단위의 몫이라 여기에 없다).
// 각 시나리오는 대표 상태와 사유 코드의 *정확한* 집합을 확인하고, evidence.ts의 buildRunRecord가
// 그 Verdict를 받아들이는지도 확인한다. 모든 입력은 합성이며 실제 Semgrep의 출력이 아니다.
describe("rev2 S1~S19 합성 시나리오", () => {
  for (const scenario of S_SCENARIOS) {
    it(`${scenario.id} ${scenario.title}`, () => {
      runScenario(scenario);
    });
  }
});
