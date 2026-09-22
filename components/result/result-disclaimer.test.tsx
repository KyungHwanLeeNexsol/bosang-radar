// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ResultDisclaimer } from "./result-disclaimer";

// SPEC-B2C-RESULT-001 D2 (MIGRATION-PLAN.md §5 "면책 문구 필수 노출 — 숨기거나
// 툴팁 처리 금지") — 항상 렌더링되고(details/summary 등으로 숨겨지지 않음),
// 아이콘 + 텍스트를 함께 표기하며, 단정형 표현이 아닌 조건부 표현을
// 사용하는지 검증한다.

describe("components/result/ResultDisclaimer", () => {
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

  it("항상 노출되는 블록으로 렌더링된다(details/summary로 숨기지 않음)", () => {
    act(() => {
      root.render(<ResultDisclaimer />);
    });

    const block = container.querySelector('[data-testid="result-disclaimer"]');
    expect(block).not.toBeNull();
    expect(block?.tagName).not.toBe("DETAILS");
  });

  it("아이콘(svg)과 텍스트를 함께 표기한다(색상 단독 전달 금지)", () => {
    act(() => {
      root.render(<ResultDisclaimer />);
    });

    const block = container.querySelector('[data-testid="result-disclaimer"]');
    expect(block?.querySelector("svg")).not.toBeNull();
    expect(block?.textContent).toContain("달라질 수 있습니다");
  });

  it("단정형 표현을 사용하지 않는다(REQ-B2CRESULT-022)", () => {
    act(() => {
      root.render(<ResultDisclaimer />);
    });

    const text = container.querySelector('[data-testid="result-disclaimer"]')?.textContent ?? "";
    expect(text).not.toContain("보상받으실 수 있습니다");
    expect(text).not.toMatch(/받으실 수 있습니다/);
  });
});
