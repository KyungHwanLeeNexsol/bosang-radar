// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ResultFooter } from "./result-footer";

// SPEC-B2C-RESULT-001 D2 — 개인정보처리방침/이용약관 링크, 고객문의, BORA
// 브랜드 마크, "참고용" 안내 4가지 필수 섹션이 모두 렌더링되는지 검증한다.

describe("components/result/ResultFooter", () => {
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

  it("개인정보처리방침/이용약관 링크를 렌더링한다", () => {
    act(() => {
      root.render(<ResultFooter />);
    });

    const links = container.querySelectorAll('[data-testid="result-footer-links"] a');
    expect(Array.from(links).map((el) => el.textContent)).toEqual(["개인정보처리방침", "이용약관"]);
  });

  it("고객 문의 안내를 렌더링한다", () => {
    act(() => {
      root.render(<ResultFooter />);
    });

    expect(container.querySelector('[data-testid="result-footer-contact"]')).not.toBeNull();
  });

  it("BORA 브랜드 마크를 렌더링한다", () => {
    act(() => {
      root.render(<ResultFooter />);
    });

    expect(container.querySelector('[data-testid="result-footer"]')?.textContent).toContain("BORA");
  });

  it("참고용 안내 문구를 렌더링한다", () => {
    act(() => {
      root.render(<ResultFooter />);
    });

    expect(
      container.querySelector('[data-testid="result-footer-reference-notice"]')?.textContent
    ).toContain("참고용");
  });
});
