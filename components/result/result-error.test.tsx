// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ResultError } from "./result-error";

// SPEC-B2C-RESULT-001 M5 (design.md §3, REQ-B2CRESULT-014) — Milestone 4의
// progress.md §E.2 Residual-risk 항목 #4를 닫는다: 오류 상태의 CTA가
// 실제로 01 입력 화면(/)으로 돌아가는 router.push를 호출하는지 검증한다
// (기존 M4 테스트에서는 커버되지 않았던 갭).

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}));

describe("components/result/ResultError — 01로 돌아가는 CTA(REQ-B2CRESULT-014, M5)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    pushMock.mockClear();
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

  it("CTA 클릭 시 router.push('/')가 호출된다", () => {
    act(() => {
      root.render(<ResultError />);
    });

    const cta = container.querySelector<HTMLButtonElement>('[data-testid="result-error-cta"]');
    expect(cta).not.toBeNull();

    act(() => {
      cta?.click();
    });

    expect(pushMock).toHaveBeenCalledWith("/");
  });

  it("오류 문구가 role=alert로 스크린리더에 인지 가능하게 노출된다", () => {
    act(() => {
      root.render(<ResultError />);
    });

    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });
});
