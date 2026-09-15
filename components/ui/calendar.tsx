"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

// 앱 톤(app-surface/app-line/bora-ink/bora-accent)에 맞춘 월간 달력 그리드.
// 값은 항상 로컬 캘린더 날짜의 "YYYY-MM-DD" 문자열로 주고받는다 — UTC로
// 변환하지 않는다(사고·발병 일자처럼 하루 밀리면 안 되는 값이기 때문).

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(value: string | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(date.getTime()) ? null : date;
}

interface CalendarProps {
  value?: string;
  onSelect: (value: string) => void;
  className?: string;
}

export function Calendar({ value, onSelect, className }: CalendarProps) {
  const selectedDate = parseDateKey(value);
  const today = new Date();
  const [viewDate, setViewDate] = React.useState(
    () => new Date((selectedDate ?? today).getFullYear(), (selectedDate ?? today).getMonth(), 1)
  );

  const todayKey = toDateKey(today);
  const selectedKey = selectedDate ? toDateKey(selectedDate) : undefined;

  // viewDate는 항상 해당 월 1일이므로 getDay()가 그 달의 시작 요일이다.
  const gridStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1 - viewDate.getDay());
  const cells = Array.from(
    { length: 42 },
    (_, index) =>
      new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index)
  );

  function changeMonth(offset: number) {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  }

  return (
    <div className={cn("w-[288px] select-none", className)}>
      <div className="mb-3 flex items-center justify-between border-b border-app-line pb-3">
        <button
          type="button"
          onClick={() => changeMonth(-1)}
          aria-label="이전 달"
          className="flex size-9 items-center justify-center rounded-full text-bora-ink-3 transition-colors duration-150 hover:bg-app-surface-inset hover:text-bora-ink active:scale-[0.96]"
        >
          <ChevronLeft className="size-4" />
        </button>
        <p className="text-body-s font-semibold tabular-nums text-bora-ink" aria-live="polite">
          {viewDate.getFullYear()}년 {viewDate.getMonth() + 1}월
        </p>
        <button
          type="button"
          onClick={() => changeMonth(1)}
          aria-label="다음 달"
          className="flex size-9 items-center justify-center rounded-full text-bora-ink-3 transition-colors duration-150 hover:bg-app-surface-inset hover:text-bora-ink active:scale-[0.96]"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-1.5 text-center">
        {WEEKDAY_LABELS.map((label, index) => (
          <span
            key={label}
            className={cn(
              "text-label-s font-medium text-bora-ink-3",
              index === 0 && "text-bora-danger",
              index === 6 && "text-bora-accent"
            )}
          >
            {label}
          </span>
        ))}

        {cells.map((date) => {
          const dateKey = toDateKey(date);
          const inMonth = date.getMonth() === viewDate.getMonth();
          const isSelected = dateKey === selectedKey;
          const isToday = dateKey === todayKey;

          return (
            <button
              key={dateKey}
              type="button"
              data-testid={`calendar-day-${dateKey}`}
              onClick={() => onSelect(dateKey)}
              aria-pressed={isSelected}
              aria-current={isToday ? "date" : undefined}
              className={cn(
                "mx-auto flex size-9 items-center justify-center rounded-full text-body-s tabular-nums transition-[transform,background-color,color] duration-150 active:scale-[0.96]",
                inMonth ? "text-bora-ink" : "text-bora-ink-4/50",
                !isSelected && "hover:bg-app-surface-inset",
                isSelected &&
                  "bg-bora-accent font-semibold text-white shadow-[0_2px_8px_-2px_rgba(108,71,255,0.55)] hover:bg-bora-accent",
                !isSelected && isToday && "border-[1.5px] border-bora-accent-line text-bora-accent"
              )}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
