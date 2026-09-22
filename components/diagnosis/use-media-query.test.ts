// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DESKTOP_MEDIA_QUERY, useMediaQuery } from "./use-media-query";

// SPEC-B2C-DIAGNOSIS-001 M7 (design.md §13) — 0~767px Mobile / 768px 이상
// Desktop 2-way 반응형 분기 훅. jsdom에는 실제 뷰포트가 없으므로
// window.matchMedia를 표준 Vitest/jsdom 패턴으로 모킹한다(이 저장소에
// 기존 matchMedia 모킹 헬퍼가 없어 새로 작성함).

function mockMatchMedia(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function Probe({ query }: { query: string }) {
  const matches = useMediaQuery(query);
  return React.createElement("span", { "data-testid": "probe", "data-matches": String(matches) });
}

describe("components/diagnosis/useMediaQuery", () => {
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
    // @ts-expect-error — jsdom 기본값(undefined)으로 복원해 테스트 간 격리
    delete window.matchMedia;
  });

  it("쿼리가 일치하면 true를 반환한다", () => {
    mockMatchMedia(true);
    act(() => {
      root.render(React.createElement(Probe, { query: DESKTOP_MEDIA_QUERY }));
    });

    expect(container.querySelector('[data-testid="probe"]')?.getAttribute("data-matches")).toBe(
      "true"
    );
  });

  it("쿼리가 일치하지 않으면 false를 반환한다", () => {
    mockMatchMedia(false);
    act(() => {
      root.render(React.createElement(Probe, { query: DESKTOP_MEDIA_QUERY }));
    });

    expect(container.querySelector('[data-testid="probe"]')?.getAttribute("data-matches")).toBe(
      "false"
    );
  });

  it("window.matchMedia가 없는 환경(예: 미지원 브라우저)에서는 false로 안전하게 저하된다", () => {
    // @ts-expect-error — matchMedia 미지원 환경 시뮬레이션
    delete window.matchMedia;
    act(() => {
      root.render(React.createElement(Probe, { query: DESKTOP_MEDIA_QUERY }));
    });

    expect(container.querySelector('[data-testid="probe"]')?.getAttribute("data-matches")).toBe(
      "false"
    );
  });
});
