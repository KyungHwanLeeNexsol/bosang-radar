// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Home from "./page";

// SPEC-B2C-FOUNDATION-001 M2 — app/page.tsx는 더 이상 로그인 세션에 따른
// 리다이렉트를 수행하지 않는다. B2C 01 화면이 구현되기 전까지 사용할
// 최소 정적 placeholder를 렌더링하며, 세션·인증 의존성이 전혀 없다.
// react-dom/client로 직접 렌더링한다(@testing-library/react 미설치 —
// app/cases/new/case-input-form.test.tsx와 동일한 패턴).

describe("app/page — 최소 B2C 공개 진입점 placeholder", () => {
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

  it("크래시 없이 렌더링되고 준비 중 안내 문구를 표시한다", () => {
    act(() => {
      root.render(<Home />);
    });

    expect(container.textContent).toContain("서비스 준비 중입니다");
  });

  it("이름·연락처 등 PII 입력 필드를 포함하지 않는다", () => {
    act(() => {
      root.render(<Home />);
    });

    expect(container.querySelector("input")).toBeNull();
    expect(container.querySelector("form")).toBeNull();
  });
});
