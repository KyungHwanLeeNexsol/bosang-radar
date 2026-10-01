// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConsultHeader } from "./consult-header";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// SPEC-B2C-CONSULT-001 — .pen 03 / 03-B / M03 Topbar. 값은 .pen에서 직접 읽었다:
//   높이 64(데스크톱) / 52(모바일), 좌우 패딩 40 / 18, 아래 테두리 1px(안쪽),
//   로고 아이콘 30 라디우스 8 + "B" 15.8px 800, 워드마크 "BORA" 20px 800,
//   오른쪽: outcome 데스크톱 "사고 · 질병 보상 진단" 12.5px #6b7684(모바일은 비움),
//   form 데스크톱 "← 진단 결과로 돌아가기" 13px 500 #6b7684 / 모바일 "← 결과로" 12.5px 600.

describe("components/consult/ConsultHeader", () => {
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

  function render(variant: "form" | "outcome") {
    act(() => {
      root.render(<ConsultHeader variant={variant} />);
    });
    return container.querySelector('[data-testid="consult-header"]')!;
  }

  it(".pen Topbar: 높이 52(모바일)/64(데스크톱), 좌우 패딩 18/40으로 세로 패딩 없이 고정 높이다", () => {
    const header = render("outcome");
    const cls = header.className;
    expect(cls).toContain("h-[52px]");
    expect(cls).toContain("md:h-16");
    expect(cls).toContain("px-[18px]");
    expect(cls).toContain("md:px-10");
    expect(cls).not.toMatch(/\bpy-/);
  });

  it(".pen Brand: 아이콘 30x30 라디우스 8, 워드마크 20px 800", () => {
    const header = render("outcome");
    const mark = header.querySelector('[data-testid="consult-header-mark"]');
    const word = header.querySelector('[data-testid="consult-header-wordmark"]');
    expect(mark?.className).toContain("size-[30px]");
    expect(mark?.className).toContain("rounded-[8px]");
    expect(mark?.className).toContain("text-[15.8px]");
    expect(mark?.className).toContain("font-extrabold");
    expect(word?.textContent).toBe("BORA");
    expect(word?.className).toContain("text-[20px]");
    expect(word?.className).toContain("font-extrabold");
  });

  it("outcome: 오른쪽 문구는 .pen 표기 '사고 · 질병 보상 진단'이고 모바일에서는 숨긴다", () => {
    const header = render("outcome");
    const right = Array.from(header.querySelectorAll("span")).find((s) =>
      s.textContent?.includes("보상 진단")
    );
    expect(right?.textContent).toBe("사고 · 질병 보상 진단");
    expect(right?.className).toContain("hidden");
    expect(right?.className).toContain("md:inline");
    expect(right?.className).toContain("text-[12.5px]");
    expect(header.querySelector('[data-testid="consult-header-back"]')).toBeNull();
  });

  it("form: 돌아가기 링크는 /result로 가고 모바일 '← 결과로' / 데스크톱 '← 진단 결과로 돌아가기'다", () => {
    const header = render("form");
    const back = header.querySelector('[data-testid="consult-header-back"]');
    expect(back?.getAttribute("href")).toBe("/result");
    expect(back?.textContent).toContain("결과로");
    expect(back?.textContent).toContain("진단 결과로 돌아가기");
    expect(back?.className).toContain("text-bora-ink-3");
  });
});
