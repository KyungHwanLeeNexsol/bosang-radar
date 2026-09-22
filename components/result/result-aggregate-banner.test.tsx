// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ResultAggregateBanner } from "./result-aggregate-banner";
import { computeAggregate } from "@/lib/diagnosis/aggregate";
import type { CoverageItem } from "@/lib/diagnosis/types";

// SPEC-B2C-RESULT-001 M4 (design.md §2, REQ-B2CRESULT-002) — 집계 배너가
// computeAggregate의 출력을 정확히 반영하는지 검증한다. 항목 개수를
// 바꾸면 화면에 표시되는 숫자도 바뀌어야 한다 — 어떤 숫자도 하드코딩되지
// 않는다.

function makeItem(id: string, status: CoverageItem["status"]): CoverageItem {
  const base = {
    id,
    category: "reimbursement" as const,
    name: "테스트 담보",
    description: "설명",
    whyCheck: "이유",
    badges: [],
    benefit: { kind: "unavailable" as const, label: "현재 정보상", displayText: "현재 정보상" },
    factChips: [],
  };
  if (status === "low-likelihood") {
    return { ...base, status, reasonNote: "사유" };
  }
  return { ...base, status } as CoverageItem;
}

describe("components/result/ResultAggregateBanner — REQ-B2CRESULT-002", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("computeAggregate 출력을 그대로 반영한다", () => {
    const items = [
      makeItem("a", "review"),
      makeItem("b", "review"),
      makeItem("c", "needs-info"),
      makeItem("d", "low-likelihood"),
    ];
    const aggregate = computeAggregate(items);

    act(() => {
      root.render(<ResultAggregateBanner aggregate={aggregate} />);
    });

    expect(
      container.querySelector('[data-testid="result-aggregate-review"]')?.textContent
    ).toContain("2개");
    expect(
      container.querySelector('[data-testid="result-aggregate-needs-info"]')?.textContent
    ).toContain("1개");
    expect(
      container.querySelector('[data-testid="result-aggregate-low-likelihood"]')?.textContent
    ).toContain("1개");
    expect(container.textContent).toContain("4개 담보를 분석했습니다");
  });

  it("항목 개수를 바꾸면 표시되는 숫자도 바뀐다", () => {
    const items = [makeItem("a", "review")];
    act(() => {
      root.render(<ResultAggregateBanner aggregate={computeAggregate(items)} />);
    });
    expect(container.textContent).toContain("1개 담보를 분석했습니다");

    const moreItems = [...items, makeItem("b", "review"), makeItem("c", "review")];
    act(() => {
      root.render(<ResultAggregateBanner aggregate={computeAggregate(moreItems)} />);
    });
    expect(container.textContent).toContain("3개 담보를 분석했습니다");
    expect(
      container.querySelector('[data-testid="result-aggregate-review"]')?.textContent
    ).toContain("3개");
  });
});
