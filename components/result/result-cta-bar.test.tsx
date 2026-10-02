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

  it("Enter/Space가 아닌 키를 누르면 아무 반응도 하지 않는다(no-op 유지)", () => {
    act(() => {
      root.render(<ResultTopBarCta />);
    });

    const button = container.querySelector<HTMLButtonElement>('[data-testid="result-cta-top"]');
    act(() => {
      button?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })
      );
    });

    expect(container.querySelector('[data-testid="result-cta-top-notice"]')?.textContent).toBe("");
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
    expect(container.querySelector('[data-testid="result-input-condition-disclosure"]')).toBeNull();
  });
});

// SPEC-B2C-CONSULT-001 M3 (design.md, REQ-B2CCONSULT-003/004/005) —
// shouldRenderConsult=true일 때 4개 CTA가 실제 <Link> 네비게이션으로
// 전환되는지 검증한다. shouldRenderConsult prop을 생략한 위 describe
// 블록은 전부 기존 SPEC-B2C-RESULT-001 회귀 스위트이며 한 글자도 수정하지
// 않았다 — 이 prop이 기본값 false로 완전히 하위 호환됨을 그 자체로 증명한다.
describe("components/result/ResultCtaBar — shouldRenderConsult=true(REQ-B2CCONSULT-003/004/005)", () => {
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

  it("상단 탑바 CTA는 aria-disabled 없는 실제 링크로 /consult?channel=kakao로 이동한다", () => {
    act(() => {
      root.render(<ResultTopBarCta shouldRenderConsult />);
    });

    const link = container.querySelector('[data-testid="result-cta-top"]');
    expect(link?.tagName).toBe("A");
    expect(link?.getAttribute("href")).toBe("/consult?channel=kakao");
    expect(link?.hasAttribute("aria-disabled")).toBe(false);
    expect(container.querySelector('[data-testid="result-cta-top-notice"]')).toBeNull();
  });

  it("후유장해 섹션 CTA는 채널 쿼리 없이 /consult로 이동한다(중립)", () => {
    act(() => {
      root.render(<ResultDisabilitySectionCta shouldRenderConsult />);
    });

    const link = container.querySelector('[data-testid="result-cta-disability-button"]');
    expect(link?.tagName).toBe("A");
    expect(link?.getAttribute("href")).toBe("/consult");
    expect(container.querySelector('[data-testid="result-cta-disability-notice"]')).toBeNull();
  });

  it("하단 최종 CTA 카카오 버튼은 /consult?channel=kakao로 이동한다", () => {
    act(() => {
      root.render(<ResultFinalCta total={3} shouldRenderConsult />);
    });

    const link = container.querySelector('[data-testid="result-cta-final-kakao"]');
    expect(link?.tagName).toBe("A");
    expect(link?.getAttribute("href")).toBe("/consult?channel=kakao");
  });

  it("하단 최종 CTA 전화 버튼은 /consult?channel=phone으로 이동한다", () => {
    act(() => {
      root.render(<ResultFinalCta total={3} shouldRenderConsult />);
    });

    const link = container.querySelector('[data-testid="result-cta-final-phone"]');
    expect(link?.tagName).toBe("A");
    expect(link?.getAttribute("href")).toBe("/consult?channel=phone");
    expect(container.querySelector('[data-testid="result-cta-final-notice"]')).toBeNull();
  });

  it("shouldRenderConsult=true여도 total은 여전히 전달받은 값을 그대로 표시한다", () => {
    act(() => {
      root.render(<ResultFinalCta total={9} shouldRenderConsult />);
    });

    expect(container.textContent).toContain("9가지를 전부 청구하시겠어요?");
  });

  it("shouldRenderConsult=true여도 면책 문구/푸터는 그대로 렌더링된다", () => {
    act(() => {
      root.render(<ResultFinalCta total={3} shouldRenderConsult />);
    });

    expect(container.querySelector('[data-testid="result-disclaimer"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="result-footer"]')).not.toBeNull();
  });
});
