"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import type { CoverageCategory } from "@/lib/diagnosis/types";
import { CATEGORY_LABEL, CATEGORY_ORDER } from "./labels";

// SPEC-B2C-RESULT-001 M4 (design.md §6/§10, REQ-B2CRESULT-003/019) — Mobile
// 전용 카테고리 단일 선택 탭. WAI-ARIA Tabs 패턴(role="tablist"/"tab" +
// aria-selected, REQ-B2CRESULT-019)을 적용한다. 탭 전환 시 패널 제목으로
// 포커스를 이동시키는 동작(REQ-B2CRESULT-021)은 이 컴포넌트가 아니라
// result-view.tsx가 activeCategory 변경을 감지해 중앙에서 수행한다 —
// priorityChecklist 선택으로 인한 탭 전환도 동일한 메커니즘을 타야 하므로
// (design.md §6), 포커스 이동 로직을 탭 컴포넌트 내부에 가두지 않는다.

interface ResultCategoryTabsProps {
  active: CoverageCategory;
  onChange: (category: CoverageCategory) => void;
  counts: Record<CoverageCategory, number>;
}

export function ResultCategoryTabs({ active, onChange, counts }: ResultCategoryTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="담보 카테고리"
      data-testid="result-category-tabs"
      className="flex gap-1 overflow-x-auto border-b border-app-line"
    >
      {CATEGORY_ORDER.map((category) => {
        const selected = category === active;
        return (
          <button
            key={category}
            type="button"
            role="tab"
            id={`category-tab-${category}`}
            aria-selected={selected}
            aria-controls={`coverage-section-${category}`}
            tabIndex={selected ? 0 : -1}
            data-testid={`category-tab-${category}`}
            onClick={() => onChange(category)}
            className={cn(
              "shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-body-s font-semibold transition-colors",
              selected
                ? "border-bora-accent text-bora-accent"
                : "border-transparent text-bora-ink-3 hover:text-bora-ink-2"
            )}
          >
            {CATEGORY_LABEL[category]} {counts[category]}
          </button>
        );
      })}
    </div>
  );
}
