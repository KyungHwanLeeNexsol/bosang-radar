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
      <div className="flex items-center justify-between gap-2 border-b border-app-line px-4 py-3">
        <h3 className="text-h3 font-semibold text-bora-ink">분석 상태</h3>
        <span className="flex items-center gap-1.5 text-label-s font-medium text-bora-ink-3">
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-violet-500" />
          대기 중
        </span>
      </div>
      {/* SPEC-UI-MIGRATION-001 Post-M8 Round2 (D3.6) — "대기" 상태 안내 +
          장식용 정적 진행 바. 실제 진행률 데이터가 없으므로 role="progressbar"를
          부여하지 않는다(가짜 진행률 금지 — AC-012 회귀 방지).
          Round3: w-[15%] → w-0 (대기 상태 0% — AC-012 취지 준수. 분석이
          시작되기 전 상태에서 15%를 표시하는 것 자체가 가짜 진행률이다). */}
      <div className="flex flex-col gap-1 px-4 pt-3">
        <p className="text-body-s font-semibold text-bora-ink">AI 리서치 대기 중</p>
        <p className="text-label-s text-bora-ink-4">
          필수 4개 항목 입력 후 시작할 수 있습니다. 평균 소요 시간 3~5분이며, 완료되면 리포트로
          이동합니다.
        </p>
        <div
          aria-hidden="true"
          data-testid="analysis-status-static-bar"
          className="mt-1 h-1 w-full overflow-hidden rounded-full bg-app-line"
        >
          <div className="h-full w-0 rounded-full bg-bora-accent" />
        </div>
      </div>
      {/* Round4: Pencil 05-사건-입력.png 정합 — 단계별 "대기" 정적 라벨 추가
          (전부 동일하게 "대기"만 표시 — 개별 완료/진행 여부는 여전히 표현하지
          않으므로 가짜 진행률 금지 원칙과 충돌하지 않는다) */}
      <ol className="flex flex-col gap-2.5 px-4 py-3">
        {ANALYSIS_STAGES.map((stage, index) => (
          <li key={stage} className="flex items-center justify-between gap-2.5">
            <span className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="flex size-5 shrink-0 items-center justify-center rounded-full bg-app-surface-inset text-label-s font-semibold text-bora-ink-3"
              >
                {index + 1}
              </span>
              <span className="text-body-s text-bora-ink-2">{stage}</span>
            </span>
            <span className="text-label-s text-bora-ink-4">대기</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
