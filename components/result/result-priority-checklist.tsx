"use client";

import * as React from "react";

import type { CoverageCategory, PriorityCheck } from "@/lib/diagnosis/types";

// SPEC-B2C-RESULT-001 M4 (design.md §5/§6, REQ-B2CRESULT-001) — "먼저
// 확인할 항목" 카드. priorityChecks를 그대로 렌더링하며, 각 행 선택 시
// targetCategory로 이동한다 — 실제 이동 방식(Desktop: anchor scroll,
// Mobile: 탭 전환)은 result-view.tsx가 onSelect 콜백으로 주입한다.

interface ResultPriorityChecklistProps {
  priorityChecks: PriorityCheck[];
  onSelect: (category: CoverageCategory) => void;
}

export function ResultPriorityChecklist({
  priorityChecks,
  onSelect,
}: ResultPriorityChecklistProps) {
  if (priorityChecks.length === 0) {
    return null;
  }

  return (
    <section
      data-testid="result-priority-checklist"
      aria-label="먼저 확인할 항목"
      className="rounded-[12px] border border-bora-accent-line bg-bora-accent-soft p-4 md:p-5"
    >
      <h2 className="text-body font-bold text-bora-ink">먼저 확인할 항목</h2>
      <p className="mt-1 text-label-s text-bora-ink-3">
        이 세 가지를 확인하면 나머지 판단이 빨라집니다
      </p>
      <ul className="mt-3 grid gap-3 md:grid-cols-3">
        {priorityChecks.map((check, index) => (
          <li key={check.id}>
            <button
              type="button"
              data-testid={`result-priority-check-${check.id}`}
              onClick={() => onSelect(check.targetCategory)}
              className="flex w-full flex-col items-start gap-1.5 rounded-[10px] border border-app-line bg-app-surface p-3 text-left transition-colors hover:border-bora-accent-line"
            >
              <span
                aria-hidden="true"
                className="flex size-5 items-center justify-center rounded-full bg-bora-accent text-label-s font-bold text-white"
              >
                {index + 1}
              </span>
              <span className="text-body-s font-semibold text-bora-ink">{check.title}</span>
              <span className="text-label-s text-bora-ink-3">{check.description}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
