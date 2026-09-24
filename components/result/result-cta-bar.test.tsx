// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ResultFinalCta, ResultDisabilitySectionCta, ResultTopBarCta } from "./result-cta-bar";

// SPEC-B2C-RESULT-001 M4 (design.md §8, REQ-B2CRESULT-023) — aria-disabled
// (네이티브 disabled 아님) + 클릭/키보드(Enter/Space) no-op + "준비 중"
// 안내가 스크린리더에 인지 가능한 형태로 나타나는지 검증한다.

describe("components/result/ResultCtaBar — aria-disabled CTA(REQ-B2CRESULT-023)", () => {
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

  it('네이티브 disabled 속성이 아니라 aria-disabled="true"를 사용해 포커스 가능 상태를 유지한다', () => {
    act(() => {
      root.render(<ResultFinalCta total={5} />);
    });

    const button = container.querySelector('[data-testid="result-cta-final-kakao"]');
    expect(button?.getAttribute("aria-disabled")).toBe("true");
    expect(button?.hasAttribute("disabled")).toBe(false);
  });

  it("클릭 시 실제 네비게이션 없이 '준비 중' 안내를 표시한다", () => {
    act(() => {
      root.render(<ResultDisabilitySectionCta />);
    });

    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="result-cta-disability-button"]'
    );
    expect(
      container.querySelector('[data-testid="result-cta-disability-notice"]')?.textContent
    ).toBe("");

    act(() => {
      button?.click();
    });

    expect(
      container.querySelector('[data-testid="result-cta-disability-notice"]')?.textContent
    ).toContain("준비");
  });

  it("키보드 Enter 활성화도 동일한 no-op 안내를 표시한다", () => {
    act(() => {
      root.render(<ResultTopBarCta />);
    });

    const button = container.querySelector<HTMLButtonElement>('[data-testid="result-cta-top"]');
    act(() => {
      button?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
      );
    });

    expect(container.querySelector('[data-testid="result-cta-top-notice"]')?.textContent).toContain(
      "준비"
    );
  });

  it("하단 최종 CTA는 하드코딩된 숫자가 아니라 전달받은 total을 그대로 표시한다", () => {
    act(() => {
      root.render(<ResultFinalCta total={7} />);
    });

    expect(container.textContent).toContain("7가지를 전부 청구하시겠어요?");
  });

  it("상단 CTA는 Mobile(텍스트 숨김)에서도 aria-label로 접근 가능한 이름을 갖는다(D2)", () => {
    act(() => {
      root.render(<ResultTopBarCta />);
    });

    const button = container.querySelector('[data-testid="result-cta-top"]');
    expect(button?.getAttribute("aria-label")).toBe("카카오톡 상담");
  });

  it("하단 최종 CTA 바는 sticky이면서 md: 이상에서는 static으로 전환되는 클래스를 갖는다(D2)", () => {
    act(() => {
      root.render(<ResultFinalCta total={3} />);
    });

    const bar = container.querySelector('[data-testid="result-cta-final"]');
    expect(bar?.className).toContain("sticky");
    expect(bar?.className).toContain("bottom-0");
    expect(bar?.className).toContain("md:static");
  });

  it("하단 최종 CTA와 함께 면책 문구/푸터가 렌더링된다(D2)", () => {
    act(() => {
      root.render(<ResultFinalCta total={3} />);
    });

    expect(container.querySelector('[data-testid="result-disclaimer"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="result-footer"]')).not.toBeNull();
    // SPEC-B2C-RESULT-001 D3(후속 리뷰) — 입력 조건 disclosure는
    // result-input-summary.tsx로 옮겨졌으므로 이 컴포넌트는 더 이상
    // 렌더링하지 않는다(result-input-summary.test.tsx가 새 위치를 검증한다).
    expect(
      container.querySelector('[data-testid="result-input-condition-disclosure"]')
    ).toBeNull();
  });
});
