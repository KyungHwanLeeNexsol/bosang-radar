import { describe, expect, it } from "vitest";
import type { LLMProvider } from "../ai/provider";
import { challenge } from "./skeptic";

const stubProvider: LLMProvider = {
  async generate(request) {
    return { text: `counter:${request.prompt}` };
  },
};

describe("lib/pipeline/skeptic challenge (REQ-SCAFFOLD-013)", () => {
  it("각 소견마다 반대 논리를 하나씩 생성한다", async () => {
    const findings = [
      { queryId: "q1", summary: "s1", supportingEvidenceIds: [] },
      { queryId: "q2", summary: "s2", supportingEvidenceIds: [] },
    ];

    const challenges = await challenge(findings, stubProvider);

    expect(challenges).toHaveLength(2);
    expect(challenges[0].findingIndex).toBe(0);
    expect(challenges[1].findingIndex).toBe(1);
    expect(challenges[0].counterArgument).toBe("counter:s1");
  });
});
