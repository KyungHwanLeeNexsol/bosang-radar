// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConsultError } from "./consult-error";

// SPEC-B2C-CONSULT-001 M5 (design.md §2.2, acceptance AC-B2CCONSULT-008) —
// consult-view.tsx의 M3/M4 인라인 "진단 결과를 불러올 수 없어요" placeholder를
// 대체하는 전용 컴포넌트.

describe("components/consult/ConsultError", () => {
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

  it("AC-008: 오류 안내 문구와 01 입력 화면으로 돌아가는 CTA를 렌더링한다", () => {
    act(() => {
      root.render(<ConsultError />);
    });

    expect(container.querySelector('[data-testid="consult-error"]')).not.toBeNull();
    expect(container.textContent).toContain("진단 결과를 불러올 수 없어요");
    const cta = container.querySelector('[data-testid="consult-error-cta"]');
    expect(cta).not.toBeNull();
    expect(cta?.getAttribute("href")).toBe("/");
  });
});
