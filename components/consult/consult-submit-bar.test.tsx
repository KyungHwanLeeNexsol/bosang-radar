// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConsultSubmitBar } from "./consult-submit-bar";

// SPEC-B2C-CONSULT-001 M4 (design.md §7, REQ-B2CCONSULT-015; acceptance
// AC-B2CCONSULT-012/015) — 제출 CTA. canSubmit(필수 동의 2개 모두 체크)이
// 게이트하며, 제출 진행 중에는 aria-busy + 이중 클릭 방지가 실제로 동작해야
// 한다(onSubmit 연결은 M5 범위이므로 여기서는 콜백 호출 여부만 검증).

function findButton(container: HTMLElement) {
  return container.querySelector<HTMLButtonElement>('[data-testid="consult-submit-button"]');
}

describe("components/consult/ConsultSubmitBar", () => {
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

  it("canSubmit=false면 aria-disabled=true이고 클릭해도 onSubmit이 호출되지 않는다", () => {
    const onSubmit = vi.fn();
    act(() => {
      root.render(
        <ConsultSubmitBar isPolicyReady canSubmit={false} channel="kakao" onSubmit={onSubmit} />
      );
    });

    const button = findButton(container);
    expect(button?.getAttribute("aria-disabled")).toBe("true");

    act(() => {
      button?.click();
    });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("canSubmit=true면 클릭 시 onSubmit이 정확히 1회 호출된다", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    act(() => {
      root.render(<ConsultSubmitBar isPolicyReady canSubmit channel="kakao" onSubmit={onSubmit} />);
    });

    act(() => {
      findButton(container)?.click();
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("channel별로 버튼 라벨이 달라진다(카카오톡 상담 신청하기 / 전화 상담 신청하기)", () => {
    act(() => {
      root.render(<ConsultSubmitBar isPolicyReady canSubmit channel="kakao" onSubmit={vi.fn()} />);
    });
    expect(findButton(container)?.textContent).toContain("카카오톡 상담 신청하기");

    act(() => {
      root.render(<ConsultSubmitBar isPolicyReady canSubmit channel="phone" onSubmit={vi.fn()} />);
    });
    expect(findButton(container)?.textContent).toContain("전화 상담 신청하기");
  });

  it("제출이 진행 중일 때 aria-busy=true이고, 응답 전 재클릭은 두 번째 호출을 발생시키지 않는다(AC-B2CCONSULT-015)", async () => {
    let resolveSubmit: () => void = () => {};
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        })
    );

    act(() => {
      root.render(<ConsultSubmitBar isPolicyReady canSubmit channel="kakao" onSubmit={onSubmit} />);
    });

    act(() => {
      findButton(container)?.click();
    });

    // 진행 중 상태 — 재클릭
    expect(findButton(container)?.getAttribute("aria-busy")).toBe("true");
    act(() => {
      findButton(container)?.click();
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSubmit();
      await Promise.resolve();
    });

    expect(findButton(container)?.getAttribute("aria-busy")).not.toBe("true");
  });

  // SPEC-B2C-CONSULT-001 M6 (design.md §11 "모바일 하단 CTA sticky") —
  // result-cta-final(components/result/result-cta-bar.tsx)과 동일한
  // sticky bottom-0 ... md:static 패턴을 재사용한다.
  it("컨테이너가 모바일에서 sticky bottom-0이고 데스크톱(md)에서 static이다", () => {
    act(() => {
      root.render(<ConsultSubmitBar isPolicyReady canSubmit channel="kakao" onSubmit={vi.fn()} />);
    });

    const bar = container.querySelector('[data-testid="consult-submit-bar"]');
    expect(bar?.className).toContain("sticky");
    expect(bar?.className).toContain("bottom-0");
    expect(bar?.className).toContain("md:static");
  });

  // design.md §11 "aria-live=polite로 상태 안내" — 제출 중 상태를
  // 스크린리더에 안내하는 role=status aria-live=polite 영역.
  it("제출 중일 때 role=status aria-live=polite 영역에 안내 문구가 표시된다", async () => {
    let resolveSubmit: () => void = () => {};
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        })
    );

    act(() => {
      root.render(<ConsultSubmitBar isPolicyReady canSubmit channel="kakao" onSubmit={onSubmit} />);
    });

    const statusRegion = container.querySelector('[data-testid="consult-submit-status"]');
    expect(statusRegion?.getAttribute("role")).toBe("status");
    expect(statusRegion?.getAttribute("aria-live")).toBe("polite");
    expect(statusRegion?.textContent).toBe("");

    act(() => {
      findButton(container)?.click();
    });

    expect(container.querySelector('[data-testid="consult-submit-status"]')?.textContent).not.toBe("");

    await act(async () => {
      resolveSubmit();
      await Promise.resolve();
    });
  });

  // SPEC-B2C-CONSULT-001 run-phase 보완(design.md §4, AC-B2CCONSULT-005 추가
  // 시나리오) — isPolicyReady=false면 제출 버튼 대신 안내 영역을 렌더링한다.
  // 잠정 문구이며 법무·운영이 확정한 문장이 아니다(리터럴로 고정).
  describe("isPolicyReady 분기", () => {
    const NOT_READY_NOTICE = "상담 신청은 아직 준비 중입니다. 준비가 끝나면 이용하실 수 있어요.";

    function findNotice() {
      return container.querySelector<HTMLElement>('[data-testid="consult-submit-policy-notice"]');
    }

    it("isPolicyReady=false면 canSubmit=true여도 제출 버튼이 없고 role=status aria-live=polite 안내 영역이 표시된다", () => {
      const onSubmit = vi.fn();
      act(() => {
        root.render(
          <ConsultSubmitBar isPolicyReady={false} canSubmit channel="kakao" onSubmit={onSubmit} />
        );
      });

      expect(findButton(container)).toBeNull();
      const notice = findNotice();
      expect(notice?.getAttribute("role")).toBe("status");
      expect(notice?.getAttribute("aria-live")).toBe("polite");
      expect(notice?.textContent).toBe(NOT_READY_NOTICE);
    });

    it("isPolicyReady=false에서 바 영역을 클릭해도 onSubmit이 호출되지 않는다", () => {
      const onSubmit = vi.fn();
      act(() => {
        root.render(
          <ConsultSubmitBar isPolicyReady={false} canSubmit channel="kakao" onSubmit={onSubmit} />
        );
      });

      act(() => {
        findNotice()?.click();
        container.querySelector<HTMLElement>('[data-testid="consult-submit-bar"]')?.click();
      });

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("isPolicyReady=false여도 컨테이너는 모바일 sticky bottom-0 / 데스크톱 static 배치를 유지한다", () => {
      act(() => {
        root.render(
          <ConsultSubmitBar isPolicyReady={false} canSubmit channel="kakao" onSubmit={vi.fn()} />
        );
      });

      const bar = container.querySelector('[data-testid="consult-submit-bar"]');
      expect(bar?.className).toContain("sticky");
      expect(bar?.className).toContain("md:static");
    });

    it("회귀 짝: isPolicyReady=true면 안내 영역이 없고 제출 버튼이 있다", () => {
      act(() => {
        root.render(
          <ConsultSubmitBar isPolicyReady canSubmit channel="kakao" onSubmit={vi.fn()} />
        );
      });

      expect(findNotice()).toBeNull();
      expect(findButton(container)).not.toBeNull();
      expect(container.textContent).not.toContain(NOT_READY_NOTICE);
    });
  });
});
