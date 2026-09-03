import * as React from "react";

import { cn } from "@/lib/utils";

// SPEC-PILOT-VISUAL-001 M3 (REQ-007/008) — 공유 Badge/Status 프레젠테이션
// 컴포넌트. design.md §3 "Badge / Status" 스펙(pill, padding [5,9], radius 3,
// gap 6, 6x6 dot + label 11/600)을 재현한다. 기존 shadcn 프리미티브로는
// 표현할 수 없는 시각 패턴이라 신규 컴포넌트로 도입한다(REQ-008).
// VERIFIED→ok 토큰 쌍, INSUFFICIENT→warn 토큰 쌍으로 매핑한다(REQ-007).

const STATUS_STYLES = {
  VERIFIED: "bg-bora-ok-soft text-bora-ok",
  INSUFFICIENT: "bg-bora-warn-soft text-bora-warn",
} as const;

const STATUS_DOT_STYLES = {
  VERIFIED: "bg-bora-ok",
  INSUFFICIENT: "bg-bora-warn",
} as const;

export type StatusBadgeStatus = keyof typeof STATUS_STYLES;

interface StatusBadgeProps extends React.ComponentProps<"span"> {
  status: StatusBadgeStatus;
}

export function StatusBadge({ status, className, children, ...props }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-[3px] px-[9px] py-[5px] text-label-s font-medium whitespace-nowrap",
        STATUS_STYLES[status],
        className
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT_STYLES[status])}
      />
      {children}
    </span>
  );
}
