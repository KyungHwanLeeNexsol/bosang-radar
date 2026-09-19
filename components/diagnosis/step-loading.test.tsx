// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockJudge, StepLoading } from "./step-loading";

// SPEC-B2C-DIAGNOSIS-001 M6 (design.md §11, §18.1 loading 상태;
// acceptance.md AC-B2CDIAG-009) — 01-C/M01-C 진단 중 화면. 단계 지연이
// 짧으므로(STAGE_DELAY_MS=200ms) 실제 타이머로 대기한다 — 이 프로젝트의
// 기존 관례(step-consent-modal.test.tsx의 tick() 실시간 대기 패턴)와
// 일관되며, 가짜 타이머 + React 패시브 이펙트 조합의 flush 타이밍 불확실성을
// 피한다.

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// StepLoading의 각 단계 전환은 useEffect가 다음 setTimeout을 다시 예약하는
// 연쇄 구조다 — 하나의 긴 act(async () => await wait(900))로 한 번에
// 기다리면 중간 커밋들의 패시브 이펙트 flush가 지연되어 마지막 단계의
// 타이머가 등록조차 되지 않을 수 있다(실측 확인됨). 짧은 간격으로 여러 번
// act()를 호출해 매 전환마다 flush 기회를 주는 것이 안정적이다.
async function waitInTicks(totalMs: number, tickMs = 200) {
  const ticks = Math.ceil(totalMs / tickMs);
  for (let i = 0; i < ticks; i++) {
    await act(async () => {
      await wait(tickMs);
    });
  }
}

describe("components/diagnosis/mockJudge — mock 판정 결정론", () => {
  it("입력에 '오류'가 포함되면 항상 error를 반환한다", () => {
    expect(mockJudge("오류 테스트 입력")).toBe("error");
    expect(mockJudge("오류")).toBe("error");
  });

  it("입력에 '오류'가 없으면 항상 result-none을 반환한다", () => {
    expect(mockJudge("계단에서 넘어져 발목을 다쳤어요")).toBe("result-none");
    expect(mockJudge("")).toBe("result-none");
  });
});

describe("components/diagnosis/StepLoading — AC-B2CDIAG-009", () => {
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

  it("aria-live 영역에 3단계 진행 표시가 순서대로 나타나고, 첫 단계 완료 후 다음 단계가 진행 중으로 표시된다", async () => {
    act(() => {
      root.render(<StepLoading input="계단에서 넘어져 발목을 다쳤어요" onDone={vi.fn()} />);
    });

    expect(
      container.querySelector('[data-testid="diagnosis-loading-stage-0"]')?.textContent
    ).toContain("사고 내용 확인 중");
    expect(
      container.querySelector('[data-testid="diagnosis-loading-stage-1"]')?.textContent
    ).toContain("관련 보상 유형 탐색 중");
    expect(
      container.querySelector('[data-testid="diagnosis-loading-stage-2"]')?.textContent
    ).toContain("확인할 담보 정리 중");

    await act(async () => {
      await wait(300);
    });

    expect(
      container.querySelector('[data-testid="diagnosis-loading-stage-1"]')?.className
    ).toContain("text-primary");
    expect(
      container.querySelector('[data-testid="diagnosis-loading-stage-0"]')?.textContent
    ).toContain("완료");
  });

  it("모든 단계가 끝나면 mock 판정 결과로 onDone을 호출한다(결과 없음 분기)", async () => {
    const onDone = vi.fn();
    act(() => {
      root.render(<StepLoading input="계단에서 넘어져 발목을 다쳤어요" onDone={onDone} />);
    });

    await waitInTicks(1200);

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith("result-none");
  });

  it("모든 단계가 끝나면 mock 판정 결과로 onDone을 호출한다(오류 분기, 동일 입력이면 항상 동일 결과)", async () => {
    const onDone = vi.fn();
    act(() => {
      root.render(<StepLoading input="분석 중 오류가 발생하는 입력" onDone={onDone} />);
    });

    await waitInTicks(1200);

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith("error");
  });

  it("M8: 스피너에 motion-reduce 클래스가 정적으로 적용되어 있다(popover.tsx와 동일한 패턴)", () => {
    act(() => {
      root.render(<StepLoading input="x" onDone={vi.fn()} />);
    });

    const spinner = container.querySelector(
      '[data-testid="diagnosis-loading"] span[aria-hidden="true"]'
    );
    expect(spinner?.className).toContain("motion-reduce:animate-none");
  });
});
