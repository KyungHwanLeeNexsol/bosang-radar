// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import {
  FOOTER_ELEMENT_STATES,
  classifyFooterElement,
  findFooterElement,
} from "./footer-element-state";

// SPEC-B2C-LAUNCH-001 M2 / AC-B2CLAUNCH-015 시나리오 1: 분류 규칙 단위 시험.
// 분류 시험의 요소는 속성만 읽는 가짜 객체로 만든다 — 분류기는 getAttribute 외에는 보지 않는다.
// 요소 찾기 시험만 DOM(jsdom)을 쓴다.

function el(attributes: Record<string, string>) {
  return {
    getAttribute: (name: string) => (name in attributes ? attributes[name] : null),
  };
}

describe("lib/launch/footer-element-state", () => {
  it("분류는 spec이 적은 넷뿐이다", () => {
    expect([...FOOTER_ELEMENT_STATES]).toEqual([
      "목적지 있음",
      "# 앵커",
      "비활성 표시",
      "텍스트만",
    ]);
  });

  it("href가 #도 빈 값도 아니고 비활성이 아니면 목적지 있음이다", () => {
    expect(classifyFooterElement(el({ href: "/dest" }))).toBe("목적지 있음");
    expect(classifyFooterElement(el({ href: "/dest", "aria-disabled": "false" }))).toBe(
      "목적지 있음"
    );
  });

  it('href가 "#"이면 # 앵커다(앞뒤 공백은 무시한다)', () => {
    expect(classifyFooterElement(el({ href: "#" }))).toBe("# 앵커");
    expect(classifyFooterElement(el({ href: " # " }))).toBe("# 앵커");
  });

  it("href가 빈 값이면 목적지가 아니므로 # 앵커로 분류한다(spec이 이 경우의 이름을 정하지 않아 목적지 없음 쪽으로 닫는다)", () => {
    expect(classifyFooterElement(el({ href: "" }))).toBe("# 앵커");
    expect(classifyFooterElement(el({ href: "   " }))).toBe("# 앵커");
  });

  it('aria-disabled="true"이면 href가 있어도 비활성 표시다', () => {
    expect(classifyFooterElement(el({ "aria-disabled": "true" }))).toBe("비활성 표시");
    expect(classifyFooterElement(el({ href: "/dest", "aria-disabled": "true" }))).toBe(
      "비활성 표시"
    );
    expect(classifyFooterElement(el({ href: "#", "aria-disabled": "true" }))).toBe("비활성 표시");
  });

  it("링크 속성이 없고 비활성도 아니면 텍스트만이다", () => {
    expect(classifyFooterElement(el({}))).toBe("텍스트만");
    expect(classifyFooterElement(el({ "aria-disabled": "false" }))).toBe("텍스트만");
    expect(classifyFooterElement(el({ role: "link" }))).toBe("텍스트만");
  });

  it('spec 문구 그대로 읽는다: 정확히 "#"가 아닌 "#"로 시작하는 값은 목적지 있음이다(발견 사항으로 보고)', () => {
    expect(classifyFooterElement(el({ href: "#part" }))).toBe("목적지 있음");
  });
});

describe("lib/launch/footer-element-state — findFooterElement", () => {
  function render(html: string): HTMLElement {
    const root = document.createElement("div");
    root.innerHTML = html;
    return root;
  }

  it("a·role=link·span 중 라벨로 시작하는 요소를 하나 찾는다", () => {
    const root = render(
      '<a href="#">가나</a><span role="link">다라<sup>준비 중</sup></span><span>마바: 준비 중</span>'
    );
    expect(findFooterElement(root, "가나").tagName).toBe("A");
    expect(findFooterElement(root, "다라").getAttribute("role")).toBe("link");
    expect(findFooterElement(root, "마바").tagName).toBe("SPAN");
  });

  it("라벨을 포함할 뿐 시작하지 않는 요소는 찾지 않는다", () => {
    expect(() => findFooterElement(render("<span>앞 가나</span>"), "가나")).toThrow();
  });

  it("후보가 없으면 던진다", () => {
    expect(() => findFooterElement(render("<p>가나</p>"), "가나")).toThrow(/정확히 하나/);
  });

  it("후보가 둘 이상이면 던진다(푸터 구조가 바뀐 것이다)", () => {
    expect(() => findFooterElement(render("<a>가나</a><span>가나</span>"), "가나")).toThrow(
      /찾은 수: 2/
    );
  });
});
