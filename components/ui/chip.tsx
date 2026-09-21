import * as React from "react";

import { cn } from "@/lib/utils";

// SPEC-PILOT-VISUAL-001 M3 (REQ-008) — 공유 Chip/Tag 프레젠테이션 컴포넌트.
// design.md §3 "Chip / Tag" 스펙(padding [4,8], radius 3, fill: surface-inset,
// text 11/500 ink-3)을 재현한다. 근거자료 유형/쟁점 태그 등에 사용된다.
// 기존 shadcn 프리미티브로는 표현할 수 없는 시각 패턴이라 신규 컴포넌트로
// 도입한다(REQ-008).
//
// SPEC-B2C-DIAGNOSIS-001 M-fix-6 — 원래 <span role="button"> 구현은
// onKeyDown이 없어 Tab 포커스 후 Enter/Space가 아무 동작도 하지 않았다.
// 네이티브 <button type="button">으로 전환해 키보드 활성화를 브라우저
// 기본 동작에 위임한다(Enforce Simplicity — 커스텀 keydown 핸들러 불필요).
// 이 컴포넌트의 유일한 소비자는 step-input.tsx이므로 시각적 스타일은
// 그대로 유지한 채 요소 타입만 button으로 바꾼다.

export function Chip({ className, type = "button", ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center rounded-[3px] bg-app-surface-inset px-2 py-1 text-label-s font-medium whitespace-nowrap text-bora-ink-3 outline-none transition-colors hover:bg-app-line focus-visible:ring-2 focus-visible:ring-ring/50",
        className
      )}
      {...props}
    />
  );
}
