import type { ReactNode } from "react";

// SPEC-UI-MIGRATION-001 M7 (REQ-015, design.md §4) — 이 코드베이스에 실재하는
// 예외 진입 경로에 공통 시각 언어(아이콘 → 타이틀 → 설명 →
// "{context} · {ERROR_CODE}" 메타 → 선택적 Action)를 적용하는 프레젠테이션
// 컴포넌트. app/not-found.tsx와 app/cases/[caseId]/not-found.tsx 2개
// 화면만 사용한다(error.tsx는 대상 아님 — 최소 검증만, 리팩터링 금지).

interface ExceptionPanelProps {
  testId: string;
  icon: ReactNode;
  title: string;
  description: string;
  context: string;
  errorCode: string;
  action?: ReactNode;
}

export function ExceptionPanel({
  testId,
  icon,
  title,
  description,
  context,
  errorCode,
  action,
}: ExceptionPanelProps) {
  return (
    <div
      data-testid={testId}
      className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center"
    >
      <span
        aria-hidden="true"
        className="flex size-14 items-center justify-center rounded-full bg-app-surface-inset text-bora-ink-3"
      >
        {icon}
      </span>
      <h1 className="text-h2 font-semibold text-bora-ink">{title}</h1>
      <p className="max-w-sm text-body text-bora-ink-3">{description}</p>
      <p className="text-meta font-normal text-bora-ink-4">
        {context} · {errorCode}
      </p>
      {action}
    </div>
  );
}
