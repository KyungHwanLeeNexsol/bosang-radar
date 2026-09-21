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

    // D2(second remediation round, design/exports/01-C) — 진행 중 단계는
    // 전역 achromatic --primary가 아니라 BORA 퍼플(bora-accent)로
    // 표시되어야 한다(디자인 export의 보라색 강조와 일치).
    expect(
      container.querySelector('[data-testid="diagnosis-loading-stage-1"]')?.className
    ).toContain("text-bora-accent");
    expect(
      container.querySelector('[data-testid="diagnosis-loading-stage-0"]')?.textContent
    ).toContain("완료");
    // D2 — 완료된 단계는 진행 중 단계와 구분되는 초록색 처리를 받아야 한다
    // (이전에는 완료/대기가 같은 muted 스타일을 공유해 구분되지 않았다).
    expect(
      container.querySelector('[data-testid="diagnosis-loading-stage-0"]')?.className
    ).toContain("text-bora-ink");
    const stage0Spans = container.querySelectorAll(
      '[data-testid="diagnosis-loading-stage-0"] span'
    );
    expect(Array.from(stage0Spans).some((span) => span.className.includes("bg-green-600"))).toBe(
      true
    );
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

// D2(8차) — 7차가 도입한 단계 고정(pinnedStage) 동작에는 테스트가 없었다.
// 시각 검증 스크립트가 design/exports와 같은 단계 상태를 결정론적으로
// 캡처하려면 이 고정이 (a) 지정한 단계에서 멈추고 (b) 시간이 지나도
// 진행하지 않으며 (c) onDone을 부르지 않아야 한다 — 셋 다 검증한다.
describe("components/diagnosis/StepLoading — ?devStage= 단계 고정(design.md §10)", () => {
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

  function stageStatuses(): string[] {
    return [0, 1, 2].map((index) =>
      (
        container.querySelector(`[data-testid="diagnosis-loading-stage-${index}-status"]`)
          ?.textContent ?? ""
      ).trim()
    );
  }

  it("pinnedStage=1이면 '완료 / 진행 중 / 대기'로 고정되고, 자동 진행 시간이 지나도 그대로다", async () => {
    const onDone = vi.fn();
    act(() => {
      root.render(
        <StepLoading input="계단에서 넘어져 발목을 다쳤어요" onDone={onDone} pinnedStage={1} />
      );
    });

    expect(stageStatuses()).toEqual(["완료", "진행 중", "대기"]);

    // 고정이 없었다면 3단계를 모두 지나 onDone까지 갔을 시간(STAGE_DELAY_MS
    // 200ms × 3단계 = 600ms)의 두 배를 기다린다.
    await waitInTicks(1200);

    expect(stageStatuses()).toEqual(["완료", "진행 중", "대기"]);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("마지막 단계(pinnedStage=2)로 고정해도 onDone이 호출되지 않는다", async () => {
    const onDone = vi.fn();
    act(() => {
      root.render(
        <StepLoading input="계단에서 넘어져 발목을 다쳤어요" onDone={onDone} pinnedStage={2} />
      );
    });

    expect(stageStatuses()).toEqual(["완료", "완료", "진행 중"]);

    // 마지막 단계는 자동 진행이었다면 onDone을 호출하는 단계다 — 고정
    // 상태에서는 타이머 자체가 등록되지 않아야 한다.
    await waitInTicks(1200);

    expect(stageStatuses()).toEqual(["완료", "완료", "진행 중"]);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("pinnedStage가 없으면 기존대로 자동 진행해 onDone을 호출한다(고정이 기본 동작을 바꾸지 않는다)", async () => {
    const onDone = vi.fn();
    act(() => {
      root.render(
        <StepLoading
          input="계단에서 넘어져 발목을 다쳤어요"
          onDone={onDone}
          pinnedStage={undefined}
        />
      );
    });

    await waitInTicks(1200);

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith("result-none");
  });
});
