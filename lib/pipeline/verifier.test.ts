import { describe, expect, it } from "vitest";
import type { LLMProvider } from "../ai/provider";
import { verify } from "./verifier";

const stubProvider: LLMProvider = {
  async generate() {
    return { text: "검증완료" };
  },
};

describe("lib/pipeline/verifier verify (REQ-SCAFFOLD-013, REQ-SCAFFOLD-014)", () => {
  it("소견과 반대 논리를 교차 검증해 근거자료와 연결된 VerifiedClaim을 생성한다", async () => {
    const findings = [{ queryId: "q1", summary: "s1", supportingEvidenceIds: ["e1"] }];
    const challenges = [{ findingIndex: 0, counterArgument: "반론1" }];

    const claims = await verify(findings, challenges, stubProvider);

    expect(claims).toHaveLength(1);
    expect(claims[0].supportingEvidenceIds).toEqual(["e1"]);
    expect(claims[0].counterArguments).toEqual(["반론1"]);
    expect(claims[0].summary).toContain("검증완료");
  });

  it("해당 소견에 대한 반대 논리가 없으면 counterArguments는 빈 배열이다", async () => {
    const findings = [{ queryId: "q1", summary: "s1", supportingEvidenceIds: ["e1"] }];

    const claims = await verify(findings, [], stubProvider);

    expect(claims[0].counterArguments).toEqual([]);
  });
});
