// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ResultPriorityChecklist } from "./result-priority-checklist";
import type { PriorityCheck } from "@/lib/diagnosis/types";

// SPEC-B2C-RESULT-001 M4 (design.md §5/§6, REQ-B2CRESULT-001) — "먼저
// 확인할 항목" 카드. priorityChecks가 비어 있으면 아무것도 렌더링하지
// 않는지, 각 항목 클릭 시 onSelect가 targetCategory와 함께 호출되는지
// 검증한다.

const PRIORITY_CHECKS: PriorityCheck[] = [
  {
    id: "priority-1",
    title: "실손 의료비 가입 세대 확인",
    description: "가입 시기에 따라 자기부담금과 보장 범위가 달라집니다",
    targetCategory: "reimbursement",
  },
  {
    id: "priority-2",
    title: "골절ㆍ상해수술비 가입 여부 확인",
    description: "정액 담보는 가입한 특약 수만큼 각각 검토됩니다",
    targetCategory: "fixed",
  },
];

describe("components/result/ResultPriorityChecklist", () => {
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

  it("priorityChecks가 비어 있으면 아무것도 렌더링하지 않는다", () => {
    act(() => {
      root.render(<ResultPriorityChecklist priorityChecks={[]} onSelect={vi.fn()} />);
    });

    expect(container.querySelector('[data-testid="result-priority-checklist"]')).toBeNull();
    expect(container.innerHTML).toBe("");
  });

  it("priorityChecks 항목을 순서대로 렌더링한다", () => {
    act(() => {
      root.render(<ResultPriorityChecklist priorityChecks={PRIORITY_CHECKS} onSelect={vi.fn()} />);
    });

    expect(
      container.querySelector('[data-testid="result-priority-check-priority-1"]')?.textContent
    ).toContain("실손 의료비 가입 세대 확인");
    expect(
      container.querySelector('[data-testid="result-priority-check-priority-2"]')?.textContent
    ).toContain("골절ㆍ상해수술비 가입 여부 확인");
  });

  it("항목을 클릭하면 onSelect가 해당 targetCategory로 호출된다", () => {
    const onSelect = vi.fn();
    act(() => {
      root.render(<ResultPriorityChecklist priorityChecks={PRIORITY_CHECKS} onSelect={onSelect} />);
    });

    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="result-priority-check-priority-2"]'
    );
    act(() => {
      button?.click();
    });

    expect(onSelect).toHaveBeenCalledWith("fixed");
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
