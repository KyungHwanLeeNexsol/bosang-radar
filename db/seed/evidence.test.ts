import { describe, expect, it } from "vitest";
import evidenceSeed from "./evidence.json";

// AC-SCAFFOLD-014 / REQ-SCAFFOLD-015: end-to-end 파이프라인 테스트를 통과시키기에
// 충분한 소규모 seed evidence 데이터셋 — 최소 3건, 최소 2개 이상의 서로 다른
// 담보(coverage) 카테고리.

describe("db/seed/evidence.json (REQ-SCAFFOLD-015, AC-SCAFFOLD-014)", () => {
  it("최소 3건 이상의 evidence 레코드를 포함한다", () => {
    expect(evidenceSeed.length).toBeGreaterThanOrEqual(3);
  });

  it("최소 2개 이상의 서로 다른 담보(coverage) 카테고리에 걸쳐 있다", () => {
    const categories = new Set(evidenceSeed.map((item) => item.category));

    expect(categories.size).toBeGreaterThanOrEqual(2);
  });

  it("각 레코드는 id/category/title/content 필드를 갖는다", () => {
    for (const item of evidenceSeed) {
      expect(typeof item.id).toBe("string");
      expect(typeof item.category).toBe("string");
      expect(typeof item.title).toBe("string");
      expect(typeof item.content).toBe("string");
    }
  });
});
