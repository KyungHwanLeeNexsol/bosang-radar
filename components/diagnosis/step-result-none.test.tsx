// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StepResultNone } from "./step-result-none";

// SPEC-B2C-DIAGNOSIS-001 M6 (design.md §18.1 result-none 상태;
// acceptance.md AC-B2CDIAG-010, REQ-B2CDIAG-024) — 01-D 결과 없음.

describe("components/diagnosis/StepResultNone — AC-B2CDIAG-010", () => {
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

  it("'내용을 수정할게요' 버튼 클릭 시 onEditInput이 호출된다", () => {
    const onEditInput = vi.fn();
    act(() => {
      root.render(<StepResultNone onEditInput={onEditInput} />);
    });

    const button = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("내용을 수정할게요")
    ) as HTMLButtonElement;
    act(() => {
      button.click();
    });

    expect(onEditInput).toHaveBeenCalledTimes(1);
  });

  it("REQ-B2CDIAG-024: mock 결과임을 알리는 비주얼상 종속적인 표기가 존재한다", () => {
    act(() => {
      root.render(<StepResultNone onEditInput={vi.fn()} />);
    });

    const badge = container.querySelector('[data-testid="diagnosis-mock-badge"]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain("데모");
  });
});
