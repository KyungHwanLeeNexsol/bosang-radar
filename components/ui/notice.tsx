import * as React from "react";
import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";

// SPEC-PILOT-VISUAL-001 M3 (REQ-008) — 공유 Notice 프레젠테이션 컴포넌트.
// design.md §3 "Notice" 스펙(padding [13,14], radius 4, fill: warn-soft,
// 아이콘 + 타이틀 12.5/600 warn + 본문 12/400 ink-2)을 재현한다.
// PII/주의 문구 배너 등 기존 카피를 감싸는 시각적 래퍼로만 쓰이며, 이
// 컴포넌트 자체는 어떤 문구도 새로 만들지 않는다(children으로 기존 카피를
// 그대로 전달받는다). 기존 shadcn 프리미티브로는 표현할 수 없는 시각
// 패턴이라 신규 컴포넌트로 도입한다(REQ-008).

interface NoticeProps extends Omit<React.ComponentProps<"div">, "title"> {
  title: React.ReactNode;
  icon?: React.ReactNode;
}

export function Notice({ title, icon, children, className, ...props }: NoticeProps) {
  return (
    <div
      // SPEC-B2C-DIAGNOSIS-001 D2(4차 재작업) — design/exports/01의 안내
      // 배너는 41px 높이 1개 행으로, 아이콘·제목·본문이 한 줄에 나란히
      // 배치된다(Desktop). Mobile은 좁은 폭 탓에 design/exports/M01처럼
      // 제목/본문이 각각 줄바꿈되므로 기존 세로 스택을 유지한다. 이
      // 컴포넌트의 유일한 소비자(step-input.tsx)가 이 화면뿐이라 안전하게
      // 반응형 분기를 추가한다.
      className={cn(
        "flex items-start gap-2.5 rounded-[4px] bg-bora-warn-soft px-3.5 py-[13px] md:items-center",
        className
      )}
      {...props}
    >
      <span aria-hidden="true" className="mt-0.5 shrink-0 text-bora-warn md:mt-0">
        {icon ?? <AlertTriangle className="size-4" />}
      </span>
      <div className="flex flex-col gap-1 md:flex-row md:items-baseline md:gap-1.5">
        <p className="text-[12.5px] font-semibold text-nowrap text-bora-warn">{title}</p>
        <div className="text-meta font-normal text-bora-ink-2">{children}</div>
      </div>
    </div>
  );
}
