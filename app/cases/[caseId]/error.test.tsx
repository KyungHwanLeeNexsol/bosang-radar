// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ErrorBoundary from "./error";

// SPEC-PILOT-UX-001 M3/M4 (AC-014 오류 경계 절반, REQ-PILOT-UX-015) —
// error.tsx는 일반 client component이므로 Next.js의 실제 오류 경계 메커니즘을
// 트리거하지 않고 mock error/reset prop으로 직접 렌더링한다.

describe("app/cases/[caseId]/error — 오류 경계 복구 UI", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("AC-014 (오류 경계): 재시도 액션이 존재하고 클릭 시 reset()이 호출된다", () => {
    const reset = vi.fn();
    const error = Object.assign(new Error("boom"), { digest: "abc123" });

    act(() => {
      root.render(<ErrorBoundary error={error} reset={reset} />);
    });

    const retryButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="case-error-retry"]'
    );
    expect(retryButton).not.toBeNull();

    act(() => {
      retryButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(reset).toHaveBeenCalledTimes(1);
  });
});
