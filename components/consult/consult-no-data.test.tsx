// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConsultNoData } from "./consult-no-data";

// SPEC-B2C-CONSULT-001 M5 (design.md §2.2, acceptance AC-B2CCONSULT-007) —
// consult-view.tsx의 M3/M4 인라인 "먼저 진단 결과가 필요합니다" placeholder를
// 대체하는 전용 컴포넌트. 01 입력 화면으로 돌아가는 CTA만 제공하고 상담
// 폼 자체는 렌더링하지 않는다.

describe("components/consult/ConsultNoData", () => {
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

  it("AC-007: 안내 문구와 01 입력 화면으로 돌아가는 CTA를 렌더링한다", () => {
    act(() => {
      root.render(<ConsultNoData />);
    });

    expect(container.querySelector('[data-testid="consult-no-data"]')).not.toBeNull();
    expect(container.textContent).toContain("먼저 진단 결과가 필요합니다");
    const cta = container.querySelector('[data-testid="consult-no-data-cta"]');
    expect(cta).not.toBeNull();
    expect(cta?.getAttribute("href")).toBe("/");
  });
});
