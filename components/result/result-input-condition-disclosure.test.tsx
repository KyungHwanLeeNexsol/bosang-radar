// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ResultInputConditionDisclosure } from "./result-input-condition-disclosure";
import { writeDiagnosisHandoff, clearDiagnosisHandoff } from "@/lib/diagnosis/handoff";
import {
  buildFractureResult,
  FRACTURE_FIXTURE_DEV_ANSWERS,
  FRACTURE_FIXTURE_INPUT,
} from "@/lib/diagnosis/fixtures/fracture-case";

// SPEC-B2C-RESULT-001 D2 (design.md "입력 조건 더보기" 패턴,
// coverage-item-card.tsx의 "왜 확인해야 하나요?" disclosure와 동일한
// <details>/<summary> 패턴) — 01에서 제출한 원문/추가 질문 응답이 접근
// 가능한 disclosure로 재노출되는지, sessionStorage가 비어 있을 때는
// 렌더링을 건너뛰는지 검증한다.

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
    clearDiagnosisHandoff();
  });

  it("sessionStorage가 비어 있으면 렌더링하지 않는다", () => {
    act(() => {
      root.render(<ResultInputConditionDisclosure />);
    });

    expect(container.querySelector('[data-testid="result-input-condition-disclosure"]')).toBeNull();
  });

  it("<details>/<summary> 접근성 패턴으로 원문 입력을 노출한다", () => {
    const result = buildFractureResult(FRACTURE_FIXTURE_INPUT, FRACTURE_FIXTURE_DEV_ANSWERS);
    writeDiagnosisHandoff(result);

    act(() => {
      root.render(<ResultInputConditionDisclosure />);
    });

    const details = container.querySelector('[data-testid="result-input-condition-disclosure"]');
    expect(details?.tagName).toBe("DETAILS");
    expect(details?.querySelector("summary")?.textContent).toBe("입력 조건 더보기");
    expect(
      container.querySelector('[data-testid="result-input-condition-raw"]')?.textContent
    ).toBe(FRACTURE_FIXTURE_INPUT);
  });

  it("추가 질문 응답(answers)을 함께 노출한다", () => {
    const result = buildFractureResult(FRACTURE_FIXTURE_INPUT, FRACTURE_FIXTURE_DEV_ANSWERS);
    writeDiagnosisHandoff(result);

    act(() => {
      root.render(<ResultInputConditionDisclosure />);
    });

    expect(
      container.querySelector('[data-testid="result-input-condition-answers"]')
    ).not.toBeNull();
  });

  it("링크가 아니라 실제 기능이 있는 disclosure다(no-op 링크 아님)", () => {
    const result = buildFractureResult(FRACTURE_FIXTURE_INPUT, FRACTURE_FIXTURE_DEV_ANSWERS);
    writeDiagnosisHandoff(result);

    act(() => {
      root.render(<ResultInputConditionDisclosure />);
    });

    expect(container.querySelector('[data-testid="result-input-condition-disclosure"] a')).toBeNull();
  });
});
