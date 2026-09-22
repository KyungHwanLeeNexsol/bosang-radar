"use client";

import * as React from "react";

import { DESKTOP_MEDIA_QUERY, useMediaQuery } from "@/components/diagnosis/use-media-query";
import { collectAnsweredFacts, computeAggregate } from "@/lib/diagnosis/aggregate";
import { readDiagnosisHandoff } from "@/lib/diagnosis/handoff";
import type { CoverageCategory, CoverageItem, DiagnosisResult } from "@/lib/diagnosis/types";

import { CATEGORY_LABEL, CATEGORY_ORDER, DEFAULT_MOBILE_CATEGORY } from "./labels";
import { ResultSkeleton } from "./result-skeleton";
import { ResultNoData } from "./result-no-data";
import { ResultError } from "./result-error";
import { ResultInputSummary } from "./result-input-summary";
import { ResultAggregateBanner } from "./result-aggregate-banner";
import { ResultPriorityChecklist } from "./result-priority-checklist";
import { CoverageCategorySection } from "./coverage-category-section";
import { ResultCategoryTabs } from "./result-category-tabs";
import { ResultTopBarCta, ResultDisabilitySectionCta, ResultFinalCta } from "./result-cta-bar";

// SPEC-B2C-RESULT-001 M4 (design.md §0/§3/§5/§6, plan.md §F M4) — 마운트 시
// readDiagnosisHandoff()(제거하지 않는 읽기)로 handoff를 1회 조회해 반환된
// DiagnosisHandoffReadResult 3갈래를 그대로 분기한다: "empty"이면
// <ResultNoData/>(REQ-B2CRESULT-013), "invalid"이면(JSON 파싱 실패·스키마
// 불일치 모두 포함) <ResultError/>(REQ-B2CRESULT-014), "valid"이면
// useMediaQuery(DESKTOP_MEDIA_QUERY)로 Desktop(4카테고리 전체 펼침) vs
// Mobile(단일 탭)을 분기한다. Desktop/Mobile 모두 동일한 DiagnosisResult
// 데이터 원본을 소비한다 — 레이아웃별 재요청·재가공이 없다(REQ-B2CRESULT-004).

function coverageSectionId(category: CoverageCategory): string {
  return `coverage-section-${category}`;
}

function coverageHeadingId(category: CoverageCategory): string {
  return `coverage-heading-${category}`;
}

function groupByCategory(
  items: readonly CoverageItem[]
): Record<CoverageCategory, CoverageItem[]> {
  const grouped: Record<CoverageCategory, CoverageItem[]> = {
    reimbursement: [],
    fixed: [],
    disability: [],
    special: [],
  };
  for (const item of items) {
    grouped[item.category].push(item);
  }
  return grouped;
}

type ViewState =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "invalid" }
  | { kind: "valid"; result: DiagnosisResult };

function classifyHandoff(): ViewState {
  const handoff = readDiagnosisHandoff();
  if (handoff.status === "empty") {
    return { kind: "empty" };
  }
  if (handoff.status === "invalid") {
    return { kind: "invalid" };
  }
  return { kind: "valid", result: handoff.result };
}

function getServerSnapshot(): ViewState {
  return { kind: "loading" };
}

/**
 * sessionStorage(브라우저 전용 동기 API)를 마운트 시 1회 읽는다
 * (REQ-B2CRESULT-016 — 이 컴포넌트는 절대 지우지 않는다). use-media-query.ts와
 * 동일하게 useSyncExternalStore를 재사용한다 — SSR에서는 항상 "loading"
 * placeholder를 반환해 hydration mismatch를 피하고(getServerSnapshot),
 * 클라이언트에서는 최초 1회만 계산한 뒤 ref에 캐시해 재계산하지 않는다
 * (subscribe는 갱신을 구독하지 않는 no-op — 이 값은 세션 동안 불변이다).
 * useEffect 안에서 setState를 직접 호출하는 대신 이 패턴을 쓰는 이유는
 * "effect 본문에서의 동기 setState는 계단식 리렌더를 유발한다"는
 * react-hooks/set-state-in-effect 권고를 따르기 위함이다.
 */
function useDiagnosisHandoffState(): ViewState {
  const snapshotRef = React.useRef<ViewState | null>(null);

  const getSnapshot = React.useCallback((): ViewState => {
    if (snapshotRef.current === null) {
      snapshotRef.current = classifyHandoff();
    }
    return snapshotRef.current;
  }, []);

  const subscribe = React.useCallback(() => () => {}, []);

  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function ResultView() {
  const state = useDiagnosisHandoffState();
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);
  const [activeCategory, setActiveCategory] =
    React.useState<CoverageCategory>(DEFAULT_MOBILE_CATEGORY);
  const isFirstCategoryRenderRef = React.useRef(true);

  // Mobile 탭 전환(REQ-B2CRESULT-021) — 탭 클릭과 "먼저 확인할 항목" 선택
  // 둘 다 setActiveCategory를 호출하므로, 포커스·스크롤 이동을 이 한 곳에서
  // 중앙 처리한다. 최초 마운트(기본 탭 진입)에는 포커스를 뺏지 않는다.
  React.useEffect(() => {
    if (isFirstCategoryRenderRef.current) {
      isFirstCategoryRenderRef.current = false;
      return;
    }
    const heading = document.getElementById(coverageHeadingId(activeCategory));
    heading?.scrollIntoView({ behavior: "smooth", block: "start" });
    heading?.focus();
  }, [activeCategory]);

  if (state.kind === "loading") {
    return <ResultSkeleton />;
  }
  if (state.kind === "empty") {
    return <ResultNoData />;
  }
  if (state.kind === "invalid") {
    return <ResultError />;
  }

  const { result } = state;
  const aggregate = computeAggregate(result.items);
  const answeredFacts = collectAnsweredFacts(result.items);
  const grouped = groupByCategory(result.items);
  const counts: Record<CoverageCategory, number> = {
    reimbursement: grouped.reimbursement.length,
    fixed: grouped.fixed.length,
    disability: grouped.disability.length,
    special: grouped.special.length,
  };

  function handlePrioritySelect(category: CoverageCategory) {
    if (isDesktop) {
      // Desktop은 4카테고리 섹션이 모두 이미 DOM에 있으므로 anchor scroll +
      // 포커스 이동만 수행한다(design.md §6).
      const heading = document.getElementById(coverageHeadingId(category));
      heading?.scrollIntoView({ behavior: "smooth", block: "start" });
      heading?.focus();
      return;
    }
    // Mobile은 활성 탭을 전환한다 — 포커스·스크롤 이동은 위 effect가 담당한다.
    setActiveCategory(category);
  }

  return (
    <div data-testid="result-view" className="flex w-full flex-col">
      <ResultTopBarCta />

      <main className="flex w-full flex-col items-center px-5 py-6 md:px-8 md:py-10">
        <div className="flex w-full max-w-[1080px] flex-col gap-4 md:gap-6">
          <ResultInputSummary inputSummary={result.inputSummary} answeredFacts={answeredFacts} />
          <ResultAggregateBanner aggregate={aggregate} />
          <ResultPriorityChecklist
            priorityChecks={result.priorityChecks}
            onSelect={handlePrioritySelect}
          />

          {isDesktop ? (
            CATEGORY_ORDER.map((category, index) => (
              <React.Fragment key={category}>
                <CoverageCategorySection
                  category={category}
                  categoryLabel={CATEGORY_LABEL[category]}
                  categoryIndex={index + 1}
                  items={grouped[category]}
                  sectionId={coverageSectionId(category)}
                  headingId={coverageHeadingId(category)}
                />
                {category === "disability" ? <ResultDisabilitySectionCta /> : null}
              </React.Fragment>
            ))
          ) : (
            <>
              <ResultCategoryTabs
                active={activeCategory}
                onChange={setActiveCategory}
                counts={counts}
              />
              <CoverageCategorySection
                category={activeCategory}
                categoryLabel={CATEGORY_LABEL[activeCategory]}
                categoryIndex={CATEGORY_ORDER.indexOf(activeCategory) + 1}
                items={grouped[activeCategory]}
                sectionId={coverageSectionId(activeCategory)}
                headingId={coverageHeadingId(activeCategory)}
                role="tabpanel"
                controllingTabId={`category-tab-${activeCategory}`}
              />
              {activeCategory === "disability" ? <ResultDisabilitySectionCta /> : null}
            </>
          )}
        </div>
      </main>

      <ResultFinalCta total={aggregate.total} />
    </div>
  );
}
