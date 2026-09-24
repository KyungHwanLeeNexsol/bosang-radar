// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ResultInputConditionDisclosure } from "./result-input-condition-disclosure";

// SPEC-B2C-RESULT-001 D2 (design.md "입력 조건 더보기" 패턴,
// coverage-item-card.tsx의 "왜 확인해야 하나요?" disclosure와 동일한
// <details>/<summary> 패턴) — 01에서 제출한 원문/추가 질문 응답이 접근
// 가능한 disclosure로 재노출되는지 검증한다.
//
// SPEC-B2C-RESULT-001 D1(후속 리뷰) — 이 컴포넌트는 더 이상 sessionStorage를
// 직접 읽지 않는다(readDiagnosisHandoff() 독립 재호출 제거). rawInput/answers를
// props로 받는 순수 프레젠테이션 컴포넌트가 됐으므로, 이 테스트는 sessionStorage
// 모킹 없이 props만으로 렌더링을 검증한다. 일반 01→02 handoff와
// `?devFixture=fracture` 경로 모두 동일한 props 경로를 타는지는
// result-view.test.tsx의 통합 테스트가 별도로 검증한다.

describe("components/result/ResultInputConditionDisclosure", () => {
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

  it("<details>/<summary> 접근성 패턴으로 원문 입력을 노출한다", () => {
    act(() => {
      root.render(
        <ResultInputConditionDisclosure
          rawInput="무릎·아래다리의 골절"
          answers={{ "surgery-status": "수술함" }}
        />
      );
    });

    const details = container.querySelector('[data-testid="result-input-condition-disclosure"]');
    expect(details?.tagName).toBe("DETAILS");
    expect(details?.querySelector("summary")?.textContent).toBe("입력 조건 더보기");
    expect(container.querySelector('[data-testid="result-input-condition-raw"]')?.textContent).toBe(
      "무릎·아래다리의 골절"
    );
  });

  it("추가 질문 응답(answers)을 함께 노출한다", () => {
    act(() => {
      root.render(
        <ResultInputConditionDisclosure
          rawInput="무릎·아래다리의 골절"
          answers={{ "surgery-status": "수술함", "accident-location": "직장" }}
        />
      );
    });

    const answers = container.querySelector('[data-testid="result-input-condition-answers"]');
    expect(answers).not.toBeNull();
    expect(answers?.textContent).toContain("수술함");
    expect(answers?.textContent).toContain("직장");
  });

  it("answers가 비어 있어도 rawInput은 그대로 노출된다", () => {
    act(() => {
      root.render(<ResultInputConditionDisclosure rawInput="무릎·아래다리의 골절" answers={{}} />);
    });

    expect(container.querySelector('[data-testid="result-input-condition-disclosure"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="result-input-condition-raw"]')?.textContent).toBe(
      "무릎·아래다리의 골절"
    );
    expect(container.querySelector('[data-testid="result-input-condition-answers"]')).toBeNull();
  });

  it("링크가 아니라 실제 기능이 있는 disclosure다(no-op 링크 아님)", () => {
    act(() => {
      root.render(<ResultInputConditionDisclosure rawInput="무릎·아래다리의 골절" answers={{}} />);
    });

    expect(
      container.querySelector('[data-testid="result-input-condition-disclosure"] a')
    ).toBeNull();
  });
});
