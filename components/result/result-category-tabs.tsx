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
            onKeyDown={(event) => {
              // SPEC-B2C-RESULT-001 M5 (design.md §10, REQ-B2CRESULT-019) —
              // WAI-ARIA Tabs 패턴의 방향키 탭 이동. roving tabindex는 이미
              // 위 tabIndex={selected ? 0 : -1}로 구성되어 있으므로, 여기서는
              // 활성 탭의 인덱스를 기준으로 이전/다음 카테고리로 onChange만
              // 호출한다 — 포커스 이동은 아래 useEffect가 담당한다(탭 자체가
              // DOM에서 이동하지 않고 active prop만 바뀌므로, 새로 active가
              // 된 탭 버튼에 focus()를 명시적으로 옮겨야 roving tabindex
              // 계약이 완성된다).
              const currentIndex = CATEGORY_ORDER.indexOf(active);
              if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                event.preventDefault();
                const delta = event.key === "ArrowRight" ? 1 : -1;
                const nextIndex =
                  (currentIndex + delta + CATEGORY_ORDER.length) % CATEGORY_ORDER.length;
                onChange(CATEGORY_ORDER[nextIndex]);
              } else if (event.key === "Home") {
                event.preventDefault();
                onChange(CATEGORY_ORDER[0]);
              } else if (event.key === "End") {
                event.preventDefault();
                onChange(CATEGORY_ORDER[CATEGORY_ORDER.length - 1]);
              }
            }}
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
