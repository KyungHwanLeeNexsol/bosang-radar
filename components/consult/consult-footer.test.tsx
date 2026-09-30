// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConsultFooter } from "./consult-footer";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// SPEC-B2C-CONSULT-001 — .pen 03/03-A2/03-B/03-C/03-D 데스크톱 하단 푸터(Footer 컴포넌트 T3mH6).
// 모바일 프레임(M03*)에는 푸터가 없다. 운영정보(법인명·사업자번호 등)는 확정 전이라 화면에
// 두지 않는다(.pen ① 지침). 방침·약관·고객 문의는 목적지가 없어 이동하지 않는다.

describe("components/consult/ConsultFooter", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<ConsultFooter />);
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("데스크톱에서만 보인다(모바일 디자인에는 푸터가 없다)", () => {
    const footer = container.querySelector('[data-testid="consult-footer"]');
    expect(footer?.tagName).toBe("FOOTER");
    expect(footer?.className).toContain("hidden");
    expect(footer?.className).toContain("md:flex");
  });

  it("개인정보처리방침·이용약관·고객 문의를 .pen 순서대로 보여 준다", () => {
    const text = container.textContent ?? "";
    const a = text.indexOf("개인정보처리방침");
    const b = text.indexOf("이용약관");
    const c = text.indexOf("고객 문의");
    expect(a).toBeGreaterThanOrEqual(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it("세 링크는 목적지가 없어 이동하지 않고 준비 중이라고 표기한다", () => {
    expect(container.querySelector("a[href]")).toBeNull();
    const links = container.querySelectorAll('[role="link"][aria-disabled="true"]');
    expect(links).toHaveLength(3);
    for (const link of links) {
      expect(link.textContent).toContain("준비 중");
    }
  });

  it(".pen 면책 문구를 그대로 담는다", () => {
    expect(container.textContent).toContain(
      "본 서비스의 진단 결과는 입력하신 내용을 바탕으로 한 참고용 안내이며, 보상 여부와 금액을 보장하지 않습니다. 실제 지급은 가입하신 보험의 약관과 보험사 심사 결과에 따릅니다."
    );
  });

  it("BORA 브랜드를 포함하고 확정 전 운영정보는 노출하지 않는다", () => {
    expect(container.textContent).toContain("BORA");
    for (const forbidden of ["법인명", "대표자", "사업자등록번호", "등록번호", "사업장 주소"]) {
      expect(container.textContent).not.toContain(forbidden);
    }
  });
});
