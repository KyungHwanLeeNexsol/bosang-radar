// SPEC-B2C-RESULT-001 M3 (design.md, REQ-B2CRESULT-015) — `/result`가
// 클라이언트 전용 데이터 읽기(useSearchParams()/sessionStorage)를 수행하는
// 동안 표시되는 최소 로딩 스켈레톤. 레이아웃 시프트를 줄이는 최소
// placeholder만 제공하며, Desktop/Mobile 실제 레이아웃에 맞춘 스켈레톤
// 확장은 Milestone 4의 범위다 — 이 milestone에서 과대 구현하지 않는다.
export function ResultSkeleton() {
  return (
    <div
      data-testid="result-skeleton"
      aria-hidden="true"
      className="flex w-full flex-col items-center gap-3 px-5 py-16 md:px-4"
    >
      <span className="h-4 w-40 animate-pulse rounded-full bg-app-surface-inset" />
      <span className="h-4 w-64 animate-pulse rounded-full bg-app-surface-inset" />
      <span className="h-4 w-52 animate-pulse rounded-full bg-app-surface-inset" />
    </div>
  );
}
