import * as React from "react";

import { cn } from "@/lib/utils";

// SPEC-PILOT-VISUAL-001 M3 (REQ-008) — 공유 Chip/Tag 프레젠테이션 컴포넌트.
// design.md §3 "Chip / Tag" 스펙(padding [4,8], radius 3, fill: surface-inset,
// text 11/500 ink-3)을 재현한다. 근거자료 유형/쟁점 태그 등에 사용된다.
// 기존 shadcn 프리미티브로는 표현할 수 없는 시각 패턴이라 신규 컴포넌트로
// 도입한다(REQ-008).

export function Chip({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-[3px] bg-app-surface-inset px-2 py-1 text-label-s font-medium whitespace-nowrap text-bora-ink-3",
        className
      )}
      {...props}
    />
  );
}
