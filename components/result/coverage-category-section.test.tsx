// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CoverageCategorySection } from "./coverage-category-section";
import { CATEGORY_DESCRIPTION } from "./labels";
import type { CoverageCategory } from "@/lib/diagnosis/types";

// SPEC-B2C-RESULT-001 D2 (MIGRATION-PLAN.md §4 "4카테고리 고정 프레임" 표,
// design.md §1 실손 세대 선택 위젯) — 카테고리 한 줄 설명이 4개 카테고리
// 모두에 렌더링되는지, 실손 의료비 세대 선택 위젯이 reimbursement에서만
// 렌더링되는지 검증한다.

function renderSection(category: CoverageCategory) {
  return (
    <CoverageCategorySection
      category={category}
      categoryLabel="테스트 카테고리"
      categoryIndex={1}
      items={[]}
      sectionId={`coverage-section-${category}`}
      headingId={`coverage-heading-${category}`}
    />
  );
}

describe("components/result/CoverageCategorySection — D2 추가 요구사항", () => {
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

  it.each(["reimbursement", "fixed", "disability", "special"] as const)(
    "%s 카테고리는 고정 한 줄 설명을 렌더링한다",
    (category) => {
      act(() => {
        root.render(renderSection(category));
      });

      expect(
        container.querySelector(`[data-testid="coverage-section-description-${category}"]`)
          ?.textContent
      ).toBe(CATEGORY_DESCRIPTION[category]);
    }
  );

  it("reimbursement 카테고리에서만 실손 세대 선택 위젯을 렌더링한다", () => {
    act(() => {
      root.render(renderSection("reimbursement"));
    });
    expect(container.querySelector('[data-testid="result-generation-selector"]')).not.toBeNull();

    act(() => {
      root.render(renderSection("fixed"));
    });
    expect(container.querySelector('[data-testid="result-generation-selector"]')).toBeNull();
  });
});
