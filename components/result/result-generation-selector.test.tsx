// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ResultGenerationSelector } from "./result-generation-selector";

// SPEC-B2C-RESULT-001 D2 (design.md §1 line ~482, MIGRATION-PLAN.md §4) —
// 실손보험 가입 시기 선택 위젯이 5개 고정 옵션을 렌더링하고, 선택이 로컬
// UI 상태로만 처리되는지(DiagnosisResult를 변경하거나 서버로 전송하지
// 않는지 — 이 단위 테스트 범위에서는 "네트워크 호출 없음 + 다른 옵션
// 선택 가능"으로 관찰) 검증한다.

describe("components/result/ResultGenerationSelector", () => {
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

  it("5개 고정 옵션을 렌더링한다", () => {
    act(() => {
      root.render(<ResultGenerationSelector />);
    });

    const options = container.querySelectorAll('[data-testid="result-generation-option"]');
    expect(options.length).toBe(5);
    expect(Array.from(options).map((el) => el.textContent)).toEqual([
      "2009년 이전",
      "2009~2017",
      "2017~2021",
      "2021년 이후",
      "모르겠어요",
    ]);
  });

  it("옵션 선택은 로컬 UI 상태로만 처리되며 aria-pressed로 반영된다", () => {
    act(() => {
      root.render(<ResultGenerationSelector />);
    });

    const options = container.querySelectorAll<HTMLButtonElement>(
      '[data-testid="result-generation-option"]'
    );
    expect(options[0]?.getAttribute("aria-pressed")).toBe("false");

    act(() => {
      options[0]?.click();
    });

    expect(options[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(options[1]?.getAttribute("aria-pressed")).toBe("false");

    // 다른 옵션으로 재선택 가능 — 선택은 언제든 바뀔 수 있는 순수 로컬
    // 상태다.
    act(() => {
      options[2]?.click();
    });

    expect(options[0]?.getAttribute("aria-pressed")).toBe("false");
    expect(options[2]?.getAttribute("aria-pressed")).toBe("true");
  });
});
