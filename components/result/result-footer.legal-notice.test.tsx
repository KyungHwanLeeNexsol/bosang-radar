// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { classifyFooterElement, findFooterElement } from "@/lib/launch/footer-element-state";
import { ALLOWED_STATES } from "@/lib/launch/legal-notice-gate";
import { ALLOWANCE_RECORD, S1_FOOTER_RECORD } from "@/lib/launch/legal-notice-record.fixture";

import { ResultFooter } from "./result-footer";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// SPEC-B2C-LAUNCH-001 M2 / AC-B2CLAUNCH-015 시나리오 1 — 02 푸터의 법적 고지 요소를 렌더링해 분류하고
// L-08 요소 기록(현재 상태 칸)과 D-LAUNCH-09 허용 칸에 대조한다. 푸터 컴포넌트는 이 시험이 고치지 않는다.

describe("components/result/ResultFooter — L-08 법적 고지 요소 분류", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<ResultFooter />);
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it.each(S1_FOOTER_RECORD["02"].map((row) => [row.id, row.label, row.current] as const))(
    "%s(%s)의 렌더링 분류는 기록의 현재 상태(%s)와 같다",
    (_id, label, current) => {
      expect(classifyFooterElement(findFooterElement(container, label))).toBe(current);
    }
  );

  it("링크가 아닌 텍스트인 고객 문의 요소도 텍스트만으로 분류된다", () => {
    const contact = findFooterElement(container, "고객 문의");
    expect(contact.getAttribute("href")).toBeNull();
    expect(classifyFooterElement(contact)).toBe("텍스트만");
  });

  it("단계별 허용 칸이 D-LAUNCH-09 결정 기록과 같다", () => {
    expect([...ALLOWANCE_RECORD.G]).toEqual([...ALLOWED_STATES.G]);
    expect([...ALLOWANCE_RECORD.I]).toEqual([...ALLOWED_STATES.I]);
  });

  it("현재 상태 그대로는 G가 요구하는 목적지를 갖춘 요소가 하나도 없다", () => {
    for (const row of S1_FOOTER_RECORD["02"]) {
      const state = classifyFooterElement(findFooterElement(container, row.label));
      expect((ALLOWANCE_RECORD.G as readonly string[]).includes(state)).toBe(false);
    }
  });
});
