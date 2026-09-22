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
      root.render(<ResultCategoryTabs active="reimbursement" onChange={vi.fn()} counts={counts} />);
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
      root.render(
        <ResultCategoryTabs active="reimbursement" onChange={onChange} counts={counts} />
      );
    });

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="category-tab-special"]')?.click();
    });

    expect(onChange).toHaveBeenCalledWith("special");
  });

  it("각 탭은 aria-controls로 대응하는 담보 카테고리 섹션 id를 가리킨다", () => {
    act(() => {
      root.render(<ResultCategoryTabs active="reimbursement" onChange={vi.fn()} counts={counts} />);
    });

    const tab = container.querySelector('[data-testid="category-tab-fixed"]');
    expect(tab?.getAttribute("aria-controls")).toBe("coverage-section-fixed");
  });
});

// SPEC-B2C-RESULT-001 M5 (design.md §10, REQ-B2CRESULT-019) — 방향키(←/→)
// 및 Home/End 키보드 탭 이동. roving tabindex(selected ? 0 : -1)를 전제로,
// 활성 탭에서 ArrowRight/ArrowLeft/Home/End를 누르면 onChange가 호출된다.
describe("components/result/ResultCategoryTabs — 키보드 탭 이동(REQ-B2CRESULT-019, M5)", () => {
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

  function dispatchKey(target: Element, key: string) {
    act(() => {
      target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    });
  }

  it("ArrowRight는 다음 카테고리로 onChange를 호출한다(reimbursement → fixed)", () => {
    const onChange = vi.fn();
    act(() => {
      root.render(
        <ResultCategoryTabs active="reimbursement" onChange={onChange} counts={counts} />
      );
    });

    const activeTab = container.querySelector('[data-testid="category-tab-reimbursement"]')!;
    dispatchKey(activeTab, "ArrowRight");

    expect(onChange).toHaveBeenCalledWith("fixed");
  });

  it("ArrowLeft는 이전 카테고리로 onChange를 호출한다(fixed → reimbursement)", () => {
    const onChange = vi.fn();
    act(() => {
      root.render(<ResultCategoryTabs active="fixed" onChange={onChange} counts={counts} />);
    });

    const activeTab = container.querySelector('[data-testid="category-tab-fixed"]')!;
    dispatchKey(activeTab, "ArrowLeft");

    expect(onChange).toHaveBeenCalledWith("reimbursement");
  });

  it("ArrowRight는 마지막 카테고리(special)에서 첫 카테고리(reimbursement)로 순환한다", () => {
    const onChange = vi.fn();
    act(() => {
      root.render(<ResultCategoryTabs active="special" onChange={onChange} counts={counts} />);
    });

    const activeTab = container.querySelector('[data-testid="category-tab-special"]')!;
    dispatchKey(activeTab, "ArrowRight");

    expect(onChange).toHaveBeenCalledWith("reimbursement");
  });

  it("ArrowLeft는 첫 카테고리(reimbursement)에서 마지막 카테고리(special)로 순환한다", () => {
    const onChange = vi.fn();
    act(() => {
      root.render(
        <ResultCategoryTabs active="reimbursement" onChange={onChange} counts={counts} />
      );
    });

    const activeTab = container.querySelector('[data-testid="category-tab-reimbursement"]')!;
    dispatchKey(activeTab, "ArrowLeft");

    expect(onChange).toHaveBeenCalledWith("special");
  });

  it("Home은 항상 첫 카테고리(reimbursement)로 이동한다", () => {
    const onChange = vi.fn();
    act(() => {
      root.render(<ResultCategoryTabs active="disability" onChange={onChange} counts={counts} />);
    });

    const activeTab = container.querySelector('[data-testid="category-tab-disability"]')!;
    dispatchKey(activeTab, "Home");

    expect(onChange).toHaveBeenCalledWith("reimbursement");
  });

  it("End는 항상 마지막 카테고리(special)로 이동한다", () => {
    const onChange = vi.fn();
    act(() => {
      root.render(
        <ResultCategoryTabs active="reimbursement" onChange={onChange} counts={counts} />
      );
    });

    const activeTab = container.querySelector('[data-testid="category-tab-reimbursement"]')!;
    dispatchKey(activeTab, "End");

    expect(onChange).toHaveBeenCalledWith("special");
  });
});

// SPEC-B2C-RESULT-001 M5 (design.md §10, REQ-B2CRESULT-021) — 통합
// 시나리오: 실제 탭 전환의 포커스 이동 로직은 result-view.tsx에 중앙화되어
// 있으므로(진단 M4 잔여 위험 항목 #3), 이 파일의 단위 테스트만으로는
// "탭 전환 시 새 패널 제목으로 포커스가 이동한다"는 계약을 완전히 검증하지
// 못한다 — 그 통합 시나리오는 result-view.test.tsx에서 부모(ResultView)를
// 렌더링해 검증한다.
