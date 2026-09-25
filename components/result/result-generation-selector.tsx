"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

// SPEC-B2C-RESULT-001 D2 (design.md §1 line ~482 "실손보험 가입 시기를
// 알려주시면…" 5개 고정 옵션, MIGRATION-PLAN.md §4 "가입년도(1~4세대) 수집
// 배너 내장") — 실손 의료비 카테고리 전용 로컬 UI 인터랙션 위젯. 선택
// 결과는 DiagnosisResult를 변경하지 않고 서버로 전송되지도 않는다
// (design.md §7) — 순수 로컬 useState. coverage-category-section.tsx가
// category === "reimbursement"일 때만 렌더링해 Desktop 실손 의료비
// 섹션과 Mobile M02 실손 의료비 탭 양쪽에서 동일하게 노출한다
// (REQ-B2CRESULT-004 단일 데이터 원본 원칙과 동일하게, 렌더링 위치도
// 하나의 공유 컴포넌트로 처리한다).

const GENERATION_OPTIONS = [
  "2009년 이전",
  "2009~2017",
  "2017~2021",
  "2021년 이후",
  "모르겠어요",
] as const;

export function ResultGenerationSelector() {
  const [selected, setSelected] = React.useState<string | null>(null);

  return (
    <div
      data-testid="result-generation-selector"
      className="rounded-[10px] border border-app-line bg-app-surface-inset p-3.5"
    >
      <p className="text-body-s font-semibold text-bora-ink">
        실손보험 가입 시기를 알려주시면 더 정확하게 확인할 수 있어요
      </p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {GENERATION_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            data-testid="result-generation-option"
            aria-pressed={selected === option}
            onClick={() => setSelected(option)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-label-s font-medium transition-colors",
              selected === option
                ? "border-bora-accent bg-bora-accent text-white"
                : "border-app-line bg-app-surface text-bora-ink-3 hover:bg-app-surface-sub"
            )}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
