// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Notice } from "./notice";

// SPEC-B2C-DIAGNOSIS-001 D2(9차) — 진단 안내 배너가 디자인의 방패형 경고
// 아이콘을 쓰도록 바뀌었다. 그 변경은 진단 호출부(step-input.tsx)의 icon
// prop으로만 이뤄져야 하며 이 공유 컴포넌트의 기본 아이콘은 그대로여야
// 한다 — 기본값을 바꾸면 이 컴포넌트를 쓰는 다른 화면까지 함께 바뀌기
// 때문이다. 아래 두 테스트가 그 경계를 고정한다.

function iconClassOf(container: HTMLElement): string {
  const svg = container.querySelector("svg");
  if (!svg) {
    throw new Error("Notice 안에서 아이콘(svg)을 찾을 수 없습니다.");
  }
  return svg.getAttribute("class") ?? "";
}

describe("components/ui/Notice — 아이콘 기본값 경계", () => {
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

  it("icon prop이 없으면 기본 삼각형 경고 아이콘을 그대로 쓴다", () => {
    act(() => {
      root.render(<Notice title="제목">본문</Notice>);
    });

    expect(iconClassOf(container)).toContain("triangle-alert");
  });

  it("icon prop을 주면 그 아이콘으로 대체된다(기본값은 건드리지 않는다)", () => {
    act(() => {
      root.render(
        <Notice title="제목" icon={<svg data-testid="custom-icon" />}>
          본문
        </Notice>
      );
    });

    expect(container.querySelector('[data-testid="custom-icon"]')).not.toBeNull();
  });
});
