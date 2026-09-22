// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ResultView } from "./result-view";
import { writeDiagnosisHandoff } from "@/lib/diagnosis/handoff";
import { buildFractureResult, FRACTURE_FIXTURE_INPUT } from "@/lib/diagnosis/fixtures/fracture-case";

// SPEC-B2C-RESULT-001 M4 (design.md §5, REQ-B2CRESULT-013/014/016) —
// ResultView의 3갈래 분기(empty/invalid/valid → 올바른 자식 렌더링)를
// 검증한다. 골절 fixture(M2)를 valid 케이스에 사용한다. ResultNoData/
// ResultError가 useRouter()를 호출하므로(next/navigation), diagnosis-flow
// 테스트군과 동일하게 next/navigation을 모킹한다 — app router 컨텍스트가
// 없는 순수 렌더 테스트에서 "invariant expected app router to be mounted"를
// 피하기 위함이다.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const STORAGE_KEY = "bosang-radar:diagnosis-handoff-v1";

describe("components/result/ResultView — 3갈래 분기(REQ-B2CRESULT-013/014/016)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.sessionStorage.clear();
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

  it('"empty"(sessionStorage 비어있음) → ResultNoData가 렌더링된다', () => {
    act(() => {
      root.render(<ResultView />);
    });

    expect(container.querySelector('[data-testid="result-no-data"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="result-view"]')).toBeNull();
  });

  it('"invalid"(구문이 깨진 JSON) → ResultError가 렌더링된다', () => {
    window.sessionStorage.setItem(STORAGE_KEY, "{not valid json");

    act(() => {
      root.render(<ResultView />);
    });

    expect(container.querySelector('[data-testid="result-error"]')).not.toBeNull();
  });

  it('"invalid"(스키마 불일치 JSON) → ResultError가 렌더링된다(AC-B2CRESULT-014)', () => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ resultId: "" }));

    act(() => {
      root.render(<ResultView />);
    });

    expect(container.querySelector('[data-testid="result-error"]')).not.toBeNull();
  });

  it('"valid"(골절 fixture) → ResultView 본문이 렌더링되고 집계 배너·입력 요약을 포함한다', () => {
    const result = buildFractureResult(FRACTURE_FIXTURE_INPUT, { surgery: "수술 받음" });
    writeDiagnosisHandoff(result);

    act(() => {
      root.render(<ResultView />);
    });

    expect(container.querySelector('[data-testid="result-view"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="result-no-data"]')).toBeNull();
    expect(container.querySelector('[data-testid="result-error"]')).toBeNull();
    expect(container.querySelector('[data-testid="result-aggregate-banner"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="result-input-summary"]')).not.toBeNull();
    expect(container.textContent).toContain("무릎·아래다리의 골절");
  });

  it('"valid" 상태에서 (matchMedia 미지원 jsdom 기본값) Mobile 탭이 렌더링된다', () => {
    const result = buildFractureResult(FRACTURE_FIXTURE_INPUT, {});
    writeDiagnosisHandoff(result);

    act(() => {
      root.render(<ResultView />);
    });

    expect(container.querySelector('[data-testid="result-category-tabs"]')).not.toBeNull();
  });
});
