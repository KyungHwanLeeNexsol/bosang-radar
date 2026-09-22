import * as React from "react";

import type { CoverageCategory, CoverageItem } from "@/lib/diagnosis/types";
import { CoverageItemCard } from "./coverage-item-card";
import { CATEGORY_DESCRIPTION } from "./labels";
import { ResultGenerationSelector } from "./result-generation-selector";

// SPEC-B2C-RESULT-001 M4 (design.md §5/§6, plan.md §F M4) — 카테고리 헤더
// (번호칩 + 제목 + 담보 개수) + coverage-item-card.tsx 목록. Desktop/Mobile
// 어느 쪽에서 호출되든 동일한 컴포넌트를 그대로 재사용한다(REQ-B2CRESULT-004).
// Mobile에서 이 컴포넌트가 탭 패널로 쓰일 때는 role="tabpanel" +
// controllingTabId(aria-labelledby 대상)를 전달받는다 — Desktop에서는
// 둘 다 생략된다.
//
// SPEC-B2C-RESULT-001 D2 — 카테고리 한 줄 설명(labels.ts CATEGORY_DESCRIPTION)
// 을 category prop으로 직접 조회해 헤더 아래 렌더링한다. category ===
// "reimbursement"일 때는 실손보험 가입 세대 선택 위젯(ResultGenerationSelector,
// 로컬 UI 상태 전용)을 이 섹션 안에서 함께 렌더링한다 — Desktop 전체 펼침
// 구조와 Mobile 탭 구조 모두 이 컴포넌트 하나를 재사용하므로(REQ-B2CRESULT-004
// 와 동일한 단일 데이터/컴포넌트 원칙), 별도의 Desktop/Mobile 전용 배치가
// 필요 없다.

interface CoverageCategorySectionProps {
  category: CoverageCategory;
  categoryLabel: string;
  categoryIndex: number;
  items: CoverageItem[];
  sectionId: string;
  headingId: string;
  role?: "tabpanel";
  controllingTabId?: string;
}

export function CoverageCategorySection({
  category,
  categoryLabel,
  categoryIndex,
  items,
  sectionId,
  headingId,
  role,
  controllingTabId,
}: CoverageCategorySectionProps) {
  return (
    <section
      id={sectionId}
      data-testid={`coverage-section-${category}`}
      role={role}
      aria-labelledby={role === "tabpanel" ? controllingTabId : undefined}
      tabIndex={role === "tabpanel" ? -1 : undefined}
      className="flex flex-col gap-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-bora-accent-soft text-label-s font-bold text-bora-accent"
          >
            {categoryIndex}
          </span>
          <h2
            id={headingId}
            tabIndex={-1}
            className="text-body font-bold text-bora-ink outline-none md:text-[19px]"
          >
            {categoryLabel}
          </h2>
        </div>
        <span className="shrink-0 text-label-s text-bora-ink-3">{items.length}개 담보 검토</span>
      </div>

      <p data-testid={`coverage-section-description-${category}`} className="text-label-s text-bora-ink-3">
        {CATEGORY_DESCRIPTION[category]}
      </p>

      {category === "reimbursement" ? <ResultGenerationSelector /> : null}

      <div className="grid gap-3 md:grid-cols-3">
        {items.map((item) => (
          <CoverageItemCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
