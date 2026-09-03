"use client";

import { Button } from "@/components/ui/button";

// SPEC-PILOT-UX-001 REQ-PILOT-UX-015 — app/cases/[caseId]/ 라우트 세그먼트의
// Next.js App Router 오류 경계. 렌더링/데이터 조회 중 발생하는 예외가 빈
// 화면이 아닌 복구 안내 화면으로 노출되도록 한다.
// SPEC-PILOT-VISUAL-001 M6 — 위험 낮은 최소 재스타일. shadcn Card 대신
// design.md 토큰(bg-app-surface/border-app-line/text-bora-ink 계열)으로
// 다른 재스타일된 화면들과 시각적으로 정합하는 카드 외형만 재현한다.
// 카피/구조/testid는 전혀 변경하지 않는다.
export default function ErrorBoundary({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-16">
      <div className="overflow-hidden rounded-[4px] border border-app-line bg-app-surface">
        <div className="border-b border-app-line px-6 py-4">
          <h1 className="text-h2 font-semibold text-bora-ink">문제가 발생했습니다</h1>
        </div>
        <div className="flex flex-col gap-3 px-6 py-5 text-body">
          <p className="text-bora-ink-3">
            사건 상세 화면을 표시하는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.
          </p>
          <Button
            type="button"
            className="self-start rounded-[4px] bg-bora-accent px-5 text-white hover:bg-bora-accent-deep"
            data-testid="case-error-retry"
            onClick={() => reset()}
          >
            다시 시도
          </Button>
        </div>
      </div>
    </div>
  );
}
