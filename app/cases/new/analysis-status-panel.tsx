// SPEC-UI-MIGRATION-001 M6 (REQ-012) — "분석 상태" 우 레일 패널. `cases`
// 테이블에 단계별 진행 데이터가 존재하지 않으므로 4단계를 순수 정보성
// 정적 텍스트로만 렌더링한다 — 개별 완료/진행 상태(체크마크, 진행률 바 등)
// 는 절대 표시하지 않는다(가짜 진행률 금지).
const ANALYSIS_STAGES = [
  "쟁점 자동 추출",
  "판례·결정례 검색",
  "약관·법령 대조",
  "근거 검증 및 반대 논리 생성",
] as const;

export function AnalysisStatusPanel() {
  return (
    <div className="overflow-hidden rounded-[4px] bg-app-surface">
      <div className="border-b border-app-line px-4 py-3">
        <h3 className="text-h3 font-semibold text-bora-ink">분석 상태</h3>
      </div>
      <ol className="flex flex-col gap-2.5 px-4 py-3">
        {ANALYSIS_STAGES.map((stage, index) => (
          <li key={stage} className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex size-5 shrink-0 items-center justify-center rounded-full bg-app-surface-inset text-label-s font-semibold text-bora-ink-3"
            >
              {index + 1}
            </span>
            <span className="text-body-s text-bora-ink-2">{stage}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
