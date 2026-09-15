"use client";

import * as React from "react";
import { CalendarDays } from "lucide-react";

import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function formatDisplayDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const [, y, m, d] = match;
  return `${y}.${m}.${d}`;
}

// 날짜는 달력에서만 고른다 — 직접 타이핑은 지원하지 않는다("일자 input
// 클릭시에는 무조건 달력으로 선택하도록"). 그래서 트리거는 버튼이다: 값을
// 직접 채워 넣을 수 있는 통로 자체가 없다.
//
// 이 때문에 네이티브 `required` 검증은 더 이상 걸리지 않는다(버튼은
// required를 지원하지 않고, 입력할 수단이 없으니 애초에 의미도 없다).
// 필수값 보장은 서버 스키마(lib/validation/case-input.ts)가 빈 값을 막고
// fieldErrors로 안내하는 기존 경로가 그대로 담당한다 — 라벨 옆 "*" 표시는
// 여전히 호출부가 그린다.
interface DatePickerProps extends Omit<
  React.ComponentProps<"button">,
  "onClick" | "onChange" | "children" | "value"
> {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function DatePicker({
  value,
  onChange,
  className,
  disabled,
  placeholder = "날짜 선택",
  ...buttonProps
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        {...buttonProps}
        className={cn(
          "group flex h-8 w-full min-w-0 items-center justify-between gap-2 rounded-[4px] border border-app-line bg-app-surface px-2.5 text-left transition-colors duration-150",
          "hover:border-app-line-strong",
          "aria-expanded:border-bora-accent-line aria-expanded:ring-2 aria-expanded:ring-bora-accent-line/25",
          "disabled:pointer-events-none disabled:opacity-50",
          className
        )}
      >
        <span className={cn("truncate text-body", value ? "text-bora-ink" : "text-bora-ink-4")}>
          {value ? formatDisplayDate(value) : placeholder}
        </span>
        <CalendarDays className="size-4 shrink-0 text-bora-ink-3 transition-colors duration-150 group-hover:text-bora-accent" />
      </PopoverTrigger>
      <PopoverContent align="start">
        <Calendar
          value={value}
          onSelect={(next) => {
            onChange(next);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
