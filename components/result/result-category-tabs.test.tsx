// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ResultCategoryTabs } from "./result-category-tabs";

// SPEC-B2C-RESULT-001 M4 (design.md §6/§10, REQ-B2CRESULT-003/019) —
// tablist/tab ARIA 역할이 존재하고, 선택된 탭에 aria-selected가 올바르게
// 반영되는지 검증한다. 탭 전환 시 포커스 이동(REQ-B2CRESULT-021)의
// 세부 사항은 Milestone 5의 범위다.

describe("components/result/ResultCategoryTabs — ARIA roles(REQ-B2CRESULT-019)", () => {
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

  const counts = { reimbursement: 3, fixed: 8, disability: 2, special: 2 };

  it("role=tablist와 4개의 role=tab이 렌더링된다", () => {
    act(() => {
      root.render(
        <ResultCategoryTabs active="reimbursement" onChange={vi.fn()} counts={counts} />
      );
    });

    expect(container.querySelector('[role="tablist"]')).not.toBeNull();
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(4);
  });

  it("활성 탭에만 aria-selected=true가 부여된다", () => {
    act(() => {
      root.render(<ResultCategoryTabs active="disability" onChange={vi.fn()} counts={counts} />);
    });

    const activeTab = container.querySelector('[data-testid="category-tab-disability"]');
    const inactiveTab = container.querySelector('[data-testid="category-tab-fixed"]');
    expect(activeTab?.getAttribute("aria-selected")).toBe("true");
    expect(inactiveTab?.getAttribute("aria-selected")).toBe("false");
  });

  it("탭 클릭 시 onChange가 해당 카테고리와 함께 호출된다", () => {
    const onChange = vi.fn();
    act(() => {
      root.render(<ResultCategoryTabs active="reimbursement" onChange={onChange} counts={counts} />);
    });

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="category-tab-special"]')?.click();
    });

    expect(onChange).toHaveBeenCalledWith("special");
  });

  it("각 탭은 aria-controls로 대응하는 담보 카테고리 섹션 id를 가리킨다", () => {
    act(() => {
      root.render(
        <ResultCategoryTabs active="reimbursement" onChange={vi.fn()} counts={counts} />
      );
    });

    const tab = container.querySelector('[data-testid="category-tab-fixed"]');
    expect(tab?.getAttribute("aria-controls")).toBe("coverage-section-fixed");
  });
});
