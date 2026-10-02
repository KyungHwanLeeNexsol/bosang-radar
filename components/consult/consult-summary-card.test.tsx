// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConsultSummaryCard } from "./consult-summary-card";
import type { DiagnosisAggregate } from "@/lib/diagnosis/aggregate";

// SPEC-B2C-CONSULT-001 M4 (design.md §2.2, design/exports/03-상담-신청-손해사정사-연결.png)
// — 진단 결과 요약 카드. computeAggregate()의 반환값(부모가 계산)만 그대로
// 렌더링하며, 예시 숫자를 코드에 고정하지 않는다(REQ-B2CRESULT-002와 동일한
// 원칙 — computeAggregate 재사용, 재구현 금지).

describe("components/consult/ConsultSummaryCard", () => {
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

  const aggregate: DiagnosisAggregate = { total: 15, review: 8, needsInfo: 6, lowLikelihood: 1 };

  it("입력 요약 title과 aggregate 숫자를 그대로 렌더링한다(하드코딩 없음)", () => {
    act(() => {
      root.render(<ConsultSummaryCard title="무릎·아래다리의 골절" aggregate={aggregate} />);
    });

    expect(container.textContent).toContain("무릎·아래다리의 골절");
    expect(container.textContent).toContain("검토 대상 8개");
    expect(container.textContent).toContain("추가 정보 필요 6개");
    expect(container.textContent).toContain("가능성 낮음 1개");
    expect(container.textContent).toContain("총 15개");
  });

  it("다른 aggregate 값을 전달하면 렌더링 숫자도 그에 맞춰 달라진다(동적 파생 증명)", () => {
    const other: DiagnosisAggregate = { total: 4, review: 1, needsInfo: 2, lowLikelihood: 1 };
    act(() => {
      root.render(<ConsultSummaryCard title="다른 제목" aggregate={other} />);
    });

    expect(container.textContent).toContain("검토 대상 1개");
    expect(container.textContent).toContain("추가 정보 필요 2개");
    expect(container.textContent).toContain("총 4개");
  });

  it("data-testid로 안정적으로 조회 가능하다", () => {
    act(() => {
      root.render(<ConsultSummaryCard title="제목" aggregate={aggregate} />);
    });

    expect(container.querySelector('[data-testid="consult-summary-card"]')).not.toBeNull();
  });
});
