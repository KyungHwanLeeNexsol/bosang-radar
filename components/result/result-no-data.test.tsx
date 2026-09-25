// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ResultNoData } from "./result-no-data";

// SPEC-B2C-RESULT-001 M5 (design.md §3, REQ-B2CRESULT-013) — Milestone 4의
// progress.md §E.2 Residual-risk 항목 #4를 닫는다: "결과 없음" 상태의
// CTA가 실제로 01 입력 화면(/)으로 돌아가는 router.push를 호출하는지
// 검증한다(기존 M4 테스트에서는 커버되지 않았던 갭).

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}));

describe("components/result/ResultNoData — 01로 돌아가는 CTA(REQ-B2CRESULT-013, M5)", () => {
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
      root.render(<ResultNoData />);
    });

    const cta = container.querySelector<HTMLButtonElement>('[data-testid="result-no-data-cta"]');
    expect(cta).not.toBeNull();

    act(() => {
      cta?.click();
    });

    expect(pushMock).toHaveBeenCalledWith("/");
  });
});
