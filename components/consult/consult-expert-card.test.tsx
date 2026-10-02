// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConsultExpertCard } from "./consult-expert-card";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// SPEC-B2C-CONSULT-001 — .pen 03 / 03-A2 / M03 "상담 예정 전문가" 카드(Adjuster).
// design.md §1 D3: 자동 배정 로직은 범위 밖이라 실제 전문가 정보를 만들어 내지 않는다.
// 사용자 결정에 따라 카드 모양은 .pen 그대로 두고 내용은 중립("배정 예정")으로 채운다:
// 이름(정하은 손해사정사)·"금융감독원 등록 손해사정사" 배지·"등록정보 확인" 링크는 넣지 않는다.

describe("components/consult/ConsultExpertCard", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<ConsultExpertCard />);
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("'배정 예정'과 '상담 예정 전문가' 라벨을 보여 준다", () => {
    const card = container.querySelector('[data-testid="consult-expert-card"]');
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain("배정 예정");
    expect(card?.textContent).toContain("상담 예정 전문가");
  });

  it("실제 전문가를 단정하는 내용(이름·등록 배지·등록정보 링크)을 담지 않는다", () => {
    const text = container.textContent ?? "";
    for (const forbidden of ["정하은", "손해사정사", "금융감독원", "등록정보", "등록 손해사정사"]) {
      expect(text).not.toContain(forbidden);
    }
    expect(container.querySelector("a")).toBeNull();
  });

  it("아바타는 장식이라 보조기기에서 숨긴다", () => {
    const avatar = container.querySelector('[data-testid="consult-expert-avatar"]');
    expect(avatar?.getAttribute("aria-hidden")).toBe("true");
  });
});
