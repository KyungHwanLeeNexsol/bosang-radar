// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ResultInputSummary } from "./result-input-summary";
import type { FactChip, InputAccidentSummary } from "@/lib/diagnosis/types";

// SPEC-B2C-RESULT-001 D3(후속 리뷰) — design.md 02 목업 대조 결과, "사고
// 내용 수정" 버튼과 ResultInputConditionDisclosure("입력 조건 더보기")가
// 이 카드 안에 있어야 함이 확인돼 result-cta-bar.tsx에서 옮겨왔다. 이 카드가
// 그 둘을 실제로 렌더링하는지 검증한다.

const INPUT_SUMMARY: InputAccidentSummary = {
  title: "무릎·아래다리의 골절",
  when: { label: "언제", value: "3일 전" },
  where: { label: "어디서", value: "헬스장" },
  mechanism: { label: "어떻게", value: "벤치프레스 중" },
  bodyPart: { label: "어디를", value: "무릎 골절" },
};

const ANSWERED_FACTS: FactChip[] = [
  { questionId: "surgery-status", label: "수술 여부", value: "수술 받음" },
];

describe("components/result/ResultInputSummary", () => {
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

  it('상단 라벨과 같은 줄에 "사고 내용 수정" 버튼을 표시한다(design.md 02 목업)', () => {
    act(() => {
      root.render(
        <ResultInputSummary
          inputSummary={INPUT_SUMMARY}
          answeredFacts={ANSWERED_FACTS}
          rawInput="무릎·아래다리의 골절"
          answers={{ "surgery-status": "수술 받음" }}
        />
      );
    });

    expect(container.querySelector('[data-testid="result-edit-input"]')).not.toBeNull();
  });

  it('"추가 질문 답변" 라벨과 같은 줄에 입력 조건 disclosure를 표시한다', () => {
    act(() => {
      root.render(
        <ResultInputSummary
          inputSummary={INPUT_SUMMARY}
          answeredFacts={ANSWERED_FACTS}
          rawInput="무릎·아래다리의 골절"
          answers={{ "surgery-status": "수술 받음" }}
        />
      );
    });

    const disclosure = container.querySelector('[data-testid="result-input-condition-disclosure"]');
    expect(disclosure).not.toBeNull();
    expect(container.querySelector('[data-testid="result-input-condition-raw"]')?.textContent).toBe(
      "무릎·아래다리의 골절"
    );
  });

  it('"사고 내용 수정" 버튼(Desktop/Mobile 둘 다)을 클릭해도 편집 기능은 no-op stub이라 카드가 그대로 유지된다(plan.md §F M4)', () => {
    act(() => {
      root.render(
        <ResultInputSummary
          inputSummary={INPUT_SUMMARY}
          answeredFacts={ANSWERED_FACTS}
          rawInput="무릎·아래다리의 골절"
          answers={{ "surgery-status": "수술 받음" }}
        />
      );
    });

    const editButtons = container.querySelectorAll<HTMLButtonElement>(
      '[data-testid="result-edit-input"]'
    );
    expect(editButtons.length).toBe(2);

    editButtons.forEach((button) => {
      act(() => {
        button.click();
      });
    });

    expect(container.querySelector('[data-testid="result-input-summary"]')).not.toBeNull();
    expect(container.textContent).toContain("무릎·아래다리의 골절");
  });

  it("answeredFacts가 비어도 입력 조건 disclosure는 그대로 표시된다", () => {
    act(() => {
      root.render(
        <ResultInputSummary
          inputSummary={INPUT_SUMMARY}
          answeredFacts={[]}
          rawInput="무릎·아래다리의 골절"
          answers={{}}
        />
      );
    });

    expect(
      container.querySelector('[data-testid="result-input-condition-disclosure"]')
    ).not.toBeNull();
    expect(container.querySelector('[data-testid="result-answered-facts"]')).toBeNull();
  });
});
