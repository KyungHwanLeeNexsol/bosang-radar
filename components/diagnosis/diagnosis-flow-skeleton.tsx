// SPEC-B2C-DIAGNOSIS-001 M2 (design.md §2) — <DiagnosisFlow />를 감싸는
// <Suspense> 경계의 fallback. 01 화면 초기 레이아웃(검색창 + 카드 골격)과
// 유사한 비율의 스켈레톤으로 레이아웃 시프트를 최소화한다. 정확한 픽셀
// 스펙은 design-phase 요구사항이 아니며, run-phase 구현 세부사항이다
// (plan.md M2).

export function DiagnosisFlowSkeleton() {
  return (
    <div
      data-testid="diagnosis-flow-skeleton"
      aria-hidden="true"
      className="flex w-full max-w-md flex-1 animate-pulse flex-col items-center gap-4 self-center px-4 py-16"
    >
      <div className="h-7 w-40 rounded-md bg-app-surface-inset" />
      <div className="h-8 w-full rounded-lg bg-app-surface-inset" />
      <div className="flex w-full gap-2">
        <div className="h-7 w-16 rounded-[3px] bg-app-surface-inset" />
        <div className="h-7 w-20 rounded-[3px] bg-app-surface-inset" />
        <div className="h-7 w-24 rounded-[3px] bg-app-surface-inset" />
      </div>
      <div className="h-16 w-full rounded-[4px] bg-app-surface-inset" />
      <div className="h-8 w-full rounded-lg bg-app-surface-inset" />
    </div>
  );
}
