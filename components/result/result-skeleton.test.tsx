// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ResultSkeleton } from "./result-skeleton";

// SPEC-B2C-RESULT-001 M3 (design.md, REQ-B2CRESULT-015) — 클라이언트 전용
// 데이터 읽기 동안 표시되는 로딩 스켈레톤. aria-hidden으로 스크린리더에서
// 숨겨지는지, 실제 콘텐츠(레이아웃 시프트 방지용 placeholder)를 렌더링하는지
// 검증한다.

describe("components/result/ResultSkeleton", () => {
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

  it("aria-hidden 상태로 로딩 placeholder를 렌더링한다", () => {
    act(() => {
      root.render(<ResultSkeleton />);
    });

    const skeleton = container.querySelector('[data-testid="result-skeleton"]');
    expect(skeleton).not.toBeNull();
    expect(skeleton?.getAttribute("aria-hidden")).toBe("true");
    expect(skeleton?.children.length).toBeGreaterThan(0);
  });
});
