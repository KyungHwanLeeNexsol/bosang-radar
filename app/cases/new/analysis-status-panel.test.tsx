// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AnalysisStatusPanel } from "./analysis-status-panel";
import { ANALYSIS_STAGES } from "@/lib/cases/analysis-stages";

// SPEC-CASE-PROGRESS-001 M4 — 공유 상수 추출(REQ-CASE-PROGRESS-001) 이후에도
// AnalysisStatusPanel의 대기(idle) 상태 렌더링 결과가 회귀 없이 동일한지
// 확인하는 최소 1건(AC-CASE-PROGRESS-008). 기존 테스트 파일이 없었으므로
// 과설계 방지를 위해 이 회귀 방지 목적에 필요한 범위로만 작성한다.
describe("app/cases/new/analysis-status-panel — 대기(idle) 상태 렌더링 회귀 방지", () => {
  it("AC-CASE-PROGRESS-008: '대기 중' 배지, 4단계 전부 '대기' 라벨, 정적 바(w-0)가 기존과 동일하게 렌더링된다", () => {
    const html = renderToStaticMarkup(<AnalysisStatusPanel />);

    expect(html).toContain("대기 중");
    for (const stage of ANALYSIS_STAGES) {
      expect(html).toContain(stage);
    }
    const waitingLabelCount = (html.match(/>대기</g) ?? []).length;
    expect(waitingLabelCount).toBe(ANALYSIS_STAGES.length);
    expect(html).toContain('data-testid="analysis-status-static-bar"');
    expect(html).toMatch(/h-full w-0/);
  });
});
