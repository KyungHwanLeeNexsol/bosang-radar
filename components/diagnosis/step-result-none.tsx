"use client";

import * as React from "react";
import { SearchX } from "lucide-react";

import { Button } from "@/components/ui/button";

// SPEC-B2C-DIAGNOSIS-001 M6 (design.md §18.1 result-none 상태;
// acceptance.md AC-B2CDIAG-010, REQ-B2CDIAG-024) — 01-D 결과 없음. 이 SPEC은
// 02 실제 결과 화면을 구현하지 않으므로 이 화면은 항상 mock 판정 결과다 —
// 실제 결과와 혼동되지 않도록 비주얼상 종속적인(subordinate) 위치에 목업
// 표기를 명시한다(design.md §8/§11, plan.md §G "mock 진단 결과를 실제
// 결과처럼 보이게 스타일링하지 않는다"). "손해사정사에게 바로 문의"(03
// 경계)는 이 SPEC의 Out of Scope다(plan.md §G — 02/03을 겸사겸사 구현하지
// 않는다).

// D2(second remediation round, design/exports/01-D) — "이렇게 적어주시면
// 좋아요" 안내 박스의 예시 문구. 첫 번째 줄은 step-input.tsx의 placeholder와
// 동일한 예시를 재사용한다(별도 문구를 새로 짓지 않는다).
const INPUT_GUIDANCE_EXAMPLES = [
  "3일 전에 헬스장에서 벤치프레스 하다가 무릎이 골절됐어요",
  "어제부터 허리가 아파서 병원에서 디스크 진단을 받았어요",
] as const;

interface StepResultNoneProps {
  onEditInput: () => void;
}

export function StepResultNone({ onEditInput }: StepResultNoneProps) {
  return (
    <div
      data-testid="diagnosis-result-none"
      className="flex w-full max-w-md flex-col items-center gap-3 py-16 text-center"
    >
      <span
        aria-hidden="true"
        className="flex size-14 items-center justify-center rounded-full bg-app-surface-inset text-bora-ink-3"
      >
        <SearchX className="size-6" />
      </span>
      <h1 className="text-h2 font-bold text-bora-ink">
        현재 입력만으로는 보상 가능성을 판단하기 어렵습니다
      </h1>
      <p className="text-body text-bora-ink-3">
        진단명, 치료 여부 또는 사고 장소를 조금 더 구체적으로 적어주세요.
      </p>

      <div className="w-full rounded-[10px] bg-app-surface-inset p-4 text-left">
        <p className="text-sm font-bold text-bora-ink">이렇게 적어주시면 좋아요</p>
        <ul className="mt-2 flex flex-col gap-1 text-body-s text-bora-ink-3">
          {INPUT_GUIDANCE_EXAMPLES.map((example) => (
            <li key={example}>· {example}</li>
          ))}
        </ul>
      </div>

      {/* REQ-B2CDIAG-024 — 이 화면은 항상 mock 판정 결과이므로 실제 결과와
          혼동되지 않도록 종속적인(subordinate) 위치에 목업 표기를 유지한다.
          design/exports/01-D는 이 배지를 보여주지 않지만(허용된 차이 —
          REQ-B2CDIAG-024 근거) 실제/mock 결과 혼동 방지가 우선한다. */}
      <p data-testid="diagnosis-mock-badge" className="text-meta text-bora-ink-4">
        이 화면은 데모/검토용 목업입니다
      </p>

      {/* design/exports/01-D는 "손해사정사에게 바로 문의" 버튼도 함께
          보여주지만, 03 상담 플로우는 이 SPEC의 Out of Scope다(plan.md §G).
          "내용을 수정할게요" 단독 버튼만 유지한다(허용된 차이). */}
      <Button type="button" variant="diagnosis" onClick={onEditInput}>
        내용을 수정할게요
      </Button>
    </div>
  );
}
