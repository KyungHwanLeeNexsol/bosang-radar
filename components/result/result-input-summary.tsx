"use client";

import * as React from "react";

import type { FactChip, InputAccidentSummary } from "@/lib/diagnosis/types";

// SPEC-B2C-RESULT-001 M4 (design.md §5/§6, REQ-B2CRESULT-001) — "입력하신
// 사고 내용" 카드. inputSummary의 title + 4개 AccidentSummaryFact(언제/
// 어디서/어떻게/어디를)를 라벨/값 2단 타이포그래피로 렌더링하고,
// collectAnsweredFacts(items)가 도출한 "추가 질문 답변" strip을 그 아래
// 표시한다 — answers를 직접 순회해 strip을 재구성하지 않는다(SSOT는 항상
// items[].factChips 파생값). "사고 내용 수정" 버튼은 편집 기능 자체가 이
// milestone의 범위가 아니므로 no-op stub이다.

interface ResultInputSummaryProps {
  inputSummary: InputAccidentSummary;
  answeredFacts: FactChip[];
}

const SUMMARY_FACT_KEYS: readonly (keyof Pick<
  InputAccidentSummary,
  "when" | "where" | "mechanism" | "bodyPart"
>)[] = ["when", "where", "mechanism", "bodyPart"];

export function ResultInputSummary({ inputSummary, answeredFacts }: ResultInputSummaryProps) {
  return (
    <section
      data-testid="result-input-summary"
      aria-label="입력하신 사고 내용"
      className="rounded-[12px] border border-app-line bg-app-surface p-4 md:p-5"
    >
      <p className="text-label-s text-bora-ink-3">입력하신 사고 내용</p>
      <h1 className="mt-1 text-h2 font-bold text-bora-ink">{inputSummary.title}</h1>

      <dl className="mt-3 flex flex-wrap gap-2">
        {SUMMARY_FACT_KEYS.map((key) => {
          const fact = inputSummary[key];
          return (
            <div
              key={key}
              className="flex items-center gap-1.5 rounded-full border border-app-line px-3 py-1.5 text-body-s"
            >
              <dt className="text-bora-ink-3">{fact.label}</dt>
              <dd className="font-semibold text-bora-ink">{fact.value}</dd>
            </div>
          );
        })}
      </dl>

      {answeredFacts.length > 0 ? (
        <div className="mt-3" data-testid="result-answered-facts">
          <p className="text-label-s text-bora-ink-3">추가 질문 답변</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {answeredFacts.map((chip) => (
              <div
                key={chip.questionId}
                className="flex items-center gap-1.5 rounded-full bg-bora-accent-soft px-3 py-1.5 text-body-s"
              >
                <span className="text-bora-ink-3">{chip.label}</span>
                <span className="font-semibold text-bora-accent">{chip.value}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        data-testid="result-edit-input"
        onClick={() => {
          // 사고 내용 수정 기능은 이 milestone의 범위 밖이다(plan.md §F M4) —
          // 후속 milestone/SPEC이 실제 편집 흐름을 연결하기 전까지 no-op stub.
        }}
        className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-app-line px-3.5 py-1.5 text-body-s font-medium text-bora-ink-2 transition-colors hover:bg-app-surface-sub"
      >
        사고 내용 수정
      </button>
    </section>
  );
}
