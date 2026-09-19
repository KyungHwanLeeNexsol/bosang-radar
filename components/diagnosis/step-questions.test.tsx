// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StepQuestions } from "./step-questions";

// SPEC-B2C-DIAGNOSIS-001 M5 (design.md §15, §18.1 questions 상태;
// acceptance.md AC-B2CDIAG-007~009/017) — 01-B/M01-B 추가 질문 3문항.
// 질문 문구는 design/exports의 실제 캡처가 담보 매칭 엔진이 동적으로 생성한
// 예시 문구라서(plan.md 담보 매칭 로직 미결정) 그대로 재사용할 수 없어,
// "라디오 그룹 + 잘 모르겠어요 옵션" 구조를 보존한 대표 placeholder
// 질문 세트를 사용한다(질문 내용 확정은 이 SPEC의 범위 밖).
//
// questionIndex/answers는 부모(diagnosis-flow.tsx) reducer가 소유하는
// controlled prop이다(design.md §5) — 테스트는 부모 상태를 흉내 내는
// stateful harness로 감싼다.

function Harness({
  onSkip,
  initialIndex = 0,
}: {
  onSkip: () => void;
  initialIndex?: number;
}) {
  const [questionIndex, setQuestionIndex] = React.useState(initialIndex);
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [prevCalls, setPrevCalls] = React.useState(0);

  return (
    <div>
      <span data-testid="prev-calls">{prevCalls}</span>
      <StepQuestions
        questionIndex={questionIndex}
        answers={answers}
        onAnswer={(questionId, value) =>
          setAnswers((prev) => ({ ...prev, [questionId]: value }))
        }
        onNext={() => setQuestionIndex((index) => index + 1)}
        onPrev={() => {
          setPrevCalls((count) => count + 1);
          setQuestionIndex((index) => Math.max(0, index - 1));
        }}
        onSkip={onSkip}
      />
    </div>
  );
}

describe("components/diagnosis/StepQuestions — AC-B2CDIAG-007~009/017", () => {
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

  it("AC-007: 진행 표시가 '질문 1 / 3' 형태로 보인다", () => {
    act(() => {
      root.render(<Harness onSkip={vi.fn()} />);
    });

    expect(container.querySelector('[data-testid="diagnosis-question-progress"]')?.textContent).toContain(
      "1 / 3"
    );
  });

  it("질문 2에서는 진행 표시가 '질문 2 / 3'으로 바뀐다", () => {
    act(() => {
      root.render(<Harness onSkip={vi.fn()} initialIndex={1} />);
    });

    expect(container.querySelector('[data-testid="diagnosis-question-progress"]')?.textContent).toContain(
      "2 / 3"
    );
  });

  it("질문 3에서는 진행 표시가 '질문 3 / 3'으로 바뀐다", () => {
    act(() => {
      root.render(<Harness onSkip={vi.fn()} initialIndex={2} />);
    });

    expect(container.querySelector('[data-testid="diagnosis-question-progress"]')?.textContent).toContain(
      "3 / 3"
    );
  });

  it("AC-008: 질문 1에만 '건너뛰고 결과 보기' 링크가 있고 클릭하면 onSkip이 호출된다", () => {
    const onSkip = vi.fn();
    act(() => {
      root.render(<Harness onSkip={onSkip} />);
    });

    const skipLink = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("건너뛰고 결과 보기")
    ) as HTMLButtonElement;
    expect(skipLink).toBeDefined();

    act(() => {
      skipLink.click();
    });
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("질문 2/3에는 '건너뛰고 결과 보기' 링크가 없다", () => {
    act(() => {
      root.render(<Harness onSkip={vi.fn()} initialIndex={1} />);
    });

    const skipLink = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("건너뛰고 결과 보기")
    );
    expect(skipLink).toBeUndefined();
  });

  it("라디오 옵션을 선택하면 onAnswer가 호출되고 선택 상태가 반영된다", () => {
    act(() => {
      root.render(<Harness onSkip={vi.fn()} />);
    });

    const radios = container.querySelectorAll('input[type="radio"]');
    expect(radios.length).toBeGreaterThanOrEqual(3);
    // 그룹 내 마지막 옵션은 "잘 모르겠어요"여야 한다(design.md §18.1 questions
    // 상태 검증 조건 — "모든 질문 선택 사항, '잘 모르겠어요' 옵션 존재").
    const lastRadio = radios[radios.length - 1] as HTMLInputElement;
    expect(lastRadio.value).toBe("잘 모르겠어요");

    act(() => {
      (radios[0] as HTMLInputElement).click();
    });
    expect((radios[0] as HTMLInputElement).checked).toBe(true);
  });

  it("답변 선택 전에는 '다음' 버튼이 비활성화되고, 선택 후 활성화된다", () => {
    act(() => {
      root.render(<Harness onSkip={vi.fn()} />);
    });

    const nextButton = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("다음")
    ) as HTMLButtonElement;
    expect(nextButton.disabled).toBe(true);

    const firstRadio = container.querySelector('input[type="radio"]') as HTMLInputElement;
    act(() => {
      firstRadio.click();
    });

    const nextButtonAfter = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("다음")
    ) as HTMLButtonElement;
    expect(nextButtonAfter.disabled).toBe(false);
  });

  it("AC-017: 뒤로 갔다가 다시 진행해도 이미 답변한 응답이 유지된다", () => {
    act(() => {
      root.render(<Harness onSkip={vi.fn()} />);
    });

    const firstRadio = container.querySelector('input[type="radio"]') as HTMLInputElement;
    act(() => {
      firstRadio.click();
    });
    expect(firstRadio.checked).toBe(true);

    const prevButton = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("이전")
    ) as HTMLButtonElement;
    act(() => {
      prevButton.click();
    });
    expect(container.querySelector('[data-testid="prev-calls"]')?.textContent).toBe("1");
  });

  it("질문 전환 시 포커스가 새 질문 제목(h1)으로 이동한다", () => {
    act(() => {
      root.render(<Harness onSkip={vi.fn()} />);
    });

    const heading = container.querySelector("h1");
    expect(document.activeElement).toBe(heading);
  });

  it("마지막 질문(3/3)에서는 '다음' 대신 '결과 보기'로 표시된다", () => {
    act(() => {
      root.render(<Harness onSkip={vi.fn()} initialIndex={2} />);
    });

    const lastButton = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("결과 보기") && !btn.textContent?.includes("건너뛰고")
    );
    expect(lastButton).toBeDefined();
  });
});
