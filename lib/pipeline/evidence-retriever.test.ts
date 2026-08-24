import { describe, expect, it } from "vitest";
import { retrieveEvidence } from "./evidence-retriever";

describe("lib/pipeline/evidence-retriever retrieveEvidence (REQ-SCAFFOLD-013, REQ-SCAFFOLD-015)", () => {
  it("기본값으로 db/seed/evidence.json의 seed evidence 데이터셋을 반환한다", async () => {
    const result = await retrieveEvidence([]);

    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it("source가 주입되면 seed 기본값 대신 주입된 값을 사용한다", async () => {
    const custom = [{ id: "x", category: "cat", title: "t", content: "c", sourceUrl: null }];

    const result = await retrieveEvidence([], custom);

    expect(result).toEqual(custom);
  });
});
