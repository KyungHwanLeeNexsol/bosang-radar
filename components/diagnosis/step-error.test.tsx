// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StepError } from "./step-error";

// SPEC-B2C-DIAGNOSIS-001 M6 (design.md §12, §18.1 error 상태;
// acceptance.md AC-B2CDIAG-011/012, REQ-B2CDIAG-024) — 01-E 분석 오류.

describe("components/diagnosis/StepError — AC-B2CDIAG-011/012", () => {
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

  function findButtonByText(text: string): HTMLButtonElement {
    const button = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes(text)
    );
    if (!button) {
      throw new Error(`button with text "${text}" not found`);
    }
    return button;
  }

  it("AC-011: '다시 시도'와 '입력 내용으로 돌아가기' 버튼이 모두 노출된다", () => {
    act(() => {
      root.render(<StepError onRetry={vi.fn()} onBackToInput={vi.fn()} />);
    });

    expect(() => findButtonByText("다시 시도")).not.toThrow();
    expect(() => findButtonByText("입력 내용으로 돌아가기")).not.toThrow();
  });

  it("AC-012: '다시 시도' 클릭 시 onRetry가 호출된다", () => {
    const onRetry = vi.fn();
    act(() => {
      root.render(<StepError onRetry={onRetry} onBackToInput={vi.fn()} />);
    });

    act(() => {
      findButtonByText("다시 시도").click();
    });

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("'입력 내용으로 돌아가기' 클릭 시 onBackToInput이 호출된다", () => {
    const onBackToInput = vi.fn();
    act(() => {
      root.render(<StepError onRetry={vi.fn()} onBackToInput={onBackToInput} />);
    });

    act(() => {
      findButtonByText("입력 내용으로 돌아가기").click();
    });

    expect(onBackToInput).toHaveBeenCalledTimes(1);
  });

  it("오류 메시지가 role=alert로 낭독된다", () => {
    act(() => {
      root.render(<StepError onRetry={vi.fn()} onBackToInput={vi.fn()} />);
    });

    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  it("REQ-B2CDIAG-024: mock 결과임을 알리는 비주얼상 종속적인 표기가 존재한다", () => {
    act(() => {
      root.render(<StepError onRetry={vi.fn()} onBackToInput={vi.fn()} />);
    });

    const badge = container.querySelector('[data-testid="diagnosis-mock-badge"]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain("데모");
  });
});
