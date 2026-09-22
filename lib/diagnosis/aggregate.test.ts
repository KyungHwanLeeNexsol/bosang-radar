import { describe, expect, it } from "vitest";
import { collectAnsweredFacts, computeAggregate } from "./aggregate";
import type { CoverageItem } from "./types";

// SPEC-B2C-RESULT-001 M1 — computeAggregate / collectAnsweredFacts 단위
// 테스트(design.md §2, REQ-B2CRESULT-002/007/008).

function makeItem(overrides: Partial<CoverageItem> & Pick<CoverageItem, "status">): CoverageItem {
  const base = {
    id: "item",
    category: "reimbursement" as const,
    name: "테스트 담보",
    description: "설명",
    whyCheck: "이유",
    badges: [],
    benefit: {
      kind: "unavailable" as const,
      label: "현재 정보상",
      displayText: "현재 정보상",
    },
    factChips: [],
  };

  if (overrides.status === "low-likelihood") {
    return {
      ...base,
      ...overrides,
      status: "low-likelihood",
      reasonNote: overrides.reasonNote ?? "사유",
    } as CoverageItem;
  }

  return { ...base, ...overrides } as CoverageItem;
}

describe("computeAggregate — REQ-B2CRESULT-002", () => {
  it("항목이 없으면 모든 숫자가 0이다", () => {
    expect(computeAggregate([])).toEqual({ total: 0, review: 0, needsInfo: 0, lowLikelihood: 0 });
  });

  it("항목 개수를 바꾸면 집계 숫자도 바뀐다", () => {
    const items: CoverageItem[] = [
      makeItem({ id: "a", status: "review" }),
      makeItem({ id: "b", status: "needs-info" }),
      makeItem({ id: "c", status: "low-likelihood" }),
    ];
    expect(computeAggregate(items)).toEqual({ total: 3, review: 1, needsInfo: 1, lowLikelihood: 1 });

    const moreItems: CoverageItem[] = [...items, makeItem({ id: "d", status: "review" })];
    expect(computeAggregate(moreItems)).toEqual({ total: 4, review: 2, needsInfo: 1, lowLikelihood: 1 });
  });

  it("status별로 정확히 분류한다", () => {
    const items: CoverageItem[] = [
      makeItem({ id: "a", status: "review" }),
      makeItem({ id: "b", status: "review" }),
      makeItem({ id: "c", status: "needs-info" }),
    ];
    expect(computeAggregate(items)).toEqual({ total: 3, review: 2, needsInfo: 1, lowLikelihood: 0 });
  });
});

describe("collectAnsweredFacts — REQ-B2CRESULT-001/007/008", () => {
  it("factChips가 없으면 빈 배열을 반환한다", () => {
    const items: CoverageItem[] = [makeItem({ id: "a", status: "review", factChips: [] })];
    expect(collectAnsweredFacts(items)).toEqual([]);
  });

  it("동일 questionId가 여러 카드의 factChips에 걸쳐도 결과에는 1회만 나타난다", () => {
    const items: CoverageItem[] = [
      makeItem({
        id: "a",
        status: "review",
        factChips: [{ questionId: "surgery", label: "수술 여부", value: "수술 받음" }],
      }),
      makeItem({
        id: "b",
        status: "needs-info",
        factChips: [{ questionId: "surgery", label: "수술 여부", value: "수술 받음" }],
      }),
    ];
    const result = collectAnsweredFacts(items);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ questionId: "surgery", label: "수술 여부", value: "수술 받음" });
  });

  it("먼저 발견된 순서(items 배열 순서, 각 item의 factChips 순서)를 유지한다", () => {
    const items: CoverageItem[] = [
      makeItem({
        id: "a",
        status: "review",
        factChips: [
          { questionId: "hospitalization", label: "입원 여부", value: "입원함" },
          { questionId: "surgery", label: "수술 여부", value: "수술 받음" },
        ],
      }),
      makeItem({
        id: "b",
        status: "needs-info",
        factChips: [{ questionId: "location", label: "사고 장소", value: "헬스장" }],
      }),
    ];
    const result = collectAnsweredFacts(items);
    expect(result.map((chip) => chip.questionId)).toEqual(["hospitalization", "surgery", "location"]);
  });

  it("응답이 없는 질문 ID는 factChips 자체에 없으므로 결과에서 제외된다(REQ-B2CRESULT-008)", () => {
    const items: CoverageItem[] = [
      makeItem({
        id: "a",
        status: "review",
        factChips: [{ questionId: "surgery", label: "수술 여부", value: "수술 받음" }],
      }),
    ];
    const result = collectAnsweredFacts(items);
    expect(result.some((chip) => chip.questionId === "unasked")).toBe(false);
  });
});
