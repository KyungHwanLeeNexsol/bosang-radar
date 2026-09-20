"use client";

import * as React from "react";
import { ArrowLeft, RotateCw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

// SPEC-B2C-DIAGNOSIS-001 M6 (design.md §12, §18.1 error 상태;
// acceptance.md AC-B2CDIAG-011/012, REQ-B2CDIAG-014/024) — 01-E 분석 오류.
// "다시 시도"는 동일 입력값으로 loading을 재진입시키고(design.md §12),
// "입력 내용으로 돌아가기"는 검색어를 보존한 채 input으로 되돌아간다 —
// 두 전이 모두 diagnosis-flow.tsx의 FORCE_STEP 재사용으로 구현되어 별도
// 상태 초기화가 없다(design.md §18.1 error 상태 "유지되는 데이터" 행).
// 이 화면 역시 mock 판정 결과이므로(REQ-B2CDIAG-024) 목업 표기를 포함한다.

interface StepErrorProps {
  onRetry: () => void;
  onBackToInput: () => void;
}

export function StepError({ onRetry, onBackToInput }: StepErrorProps) {
  return (
    <div
      data-testid="diagnosis-error"
      // D2(4차 재작업) — 01-D와 동일 근거(아이콘 상단 y≈174, 헤더 기준
      // pt-[111px]; 자매 화면이라 동일 폭 630px 적용).
      // D2(5차 재작업) — 01-D와 동일하게 균일 gap-4를 디자인 실측
      // 간격(제목 28px/설명 17px/버튼 그룹 8px)으로 대체한다.
      className="flex w-full max-w-md flex-col items-center gap-4 pt-[31px] text-center md:max-w-[630px] md:gap-0 md:pt-[111px]"
    >
      <span
        aria-hidden="true"
        className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive md:size-16"
      >
        <TriangleAlert className="size-6 md:size-7" />
      </span>
      {/* 01-D와 동일 근거로 text-h1(26px) 대신 실측에 가까운 21px 사용. */}
      <h1 className="text-[21px] font-bold text-bora-ink md:mt-[28px]">진단 중 문제가 발생했습니다</h1>
      <p role="alert" className="text-body text-bora-ink-3 md:mt-[17px] md:text-base">
        일시적인 오류일 수 있습니다. 입력하신 내용은 그대로 남아 있으니 다시 시도해 주세요.
      </p>
      <p data-testid="diagnosis-mock-badge" className="text-meta text-bora-ink-4 md:mt-[8px]">
        이 화면은 데모/검토용 목업입니다
      </p>
      <div className="flex items-center gap-2 md:mt-[8px]">
        <Button
          type="button"
          variant="diagnosis"
          className="md:h-11 md:rounded-[12px] md:px-7 md:text-base"
          onClick={onRetry}
        >
          <RotateCw aria-hidden="true" />
          다시 시도
        </Button>
        <Button
          type="button"
          variant="outline"
          className="md:h-11 md:rounded-[12px] md:px-7 md:text-base"
          onClick={onBackToInput}
        >
          <ArrowLeft aria-hidden="true" />
          입력 내용으로 돌아가기
        </Button>
      </div>
    </div>
  );
}
