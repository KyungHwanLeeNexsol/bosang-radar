import { describe, expect, it } from "vitest";
import type { LLMProvider } from "../ai/provider";
import { research } from "./researcher";

const stubProvider: LLMProvider = {
  async generate(request) {
    return { text: `stub:${request.prompt}` };
  },
};

describe("lib/pipeline/researcher research (REQ-SCAFFOLD-013, REQ-SCAFFOLD-018)", () => {
  it("각 쿼리마다 초안 소견을 생성하고 근거자료 id를 연결한다", async () => {
    const queries = [{ id: "q1", topic: "topic1", focus: "focus1" }];
    const evidence = [{ id: "e1", category: "cat", title: "t", content: "c", sourceUrl: null }];

    const findings = await research(queries, evidence, stubProvider);

    expect(findings).toHaveLength(1);
    expect(findings[0].queryId).toBe("q1");
    expect(findings[0].supportingEvidenceIds).toEqual(["e1"]);
    expect(findings[0].summary).toBe("stub:topic1");
  });

  it("주입된 provider가 없으면 기본 mock provider로 동작한다", async () => {
    const findings = await research(
      [{ id: "q1", topic: "topic1", focus: "focus1" }],
      [{ id: "e1", category: "cat", title: "t", content: "c", sourceUrl: null }]
    );

    expect(findings[0].summary.length).toBeGreaterThan(0);
  });
});
