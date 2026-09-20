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
      // D2(4차 재작업) — 4차 외부 재검토 실측: design/exports/01-D
      // 아이콘 상단 y≈174(헤더 63px 기준 pt-[111px]), 안내 박스 폭이
      // 627px로 실측돼(가장 넓은 요소) 3차의 720px는 과대였다 — 630px로
      // 좁힌다. 제목 블록 ink-height가 24px로 측정돼(text-h1/26px가 아니라
      // text-h2/19px 쪽에 더 가까움) 제목 크기를 text-h2로 되돌린다.
      className="flex w-full max-w-md flex-col items-center gap-4 pt-[31px] text-center md:max-w-[630px] md:gap-0 md:pt-[111px]"
    >
      <span
        aria-hidden="true"
        className="flex size-14 items-center justify-center rounded-full bg-app-surface-inset text-bora-ink-3 md:size-16"
      >
        <SearchX className="size-6 md:size-7" />
      </span>
      {/* text-h1(26px)은 이 화면 제목의 실측 ink-height(24px, 01-B
          제목의 28px보다 작음)를 초과한다. 정확한 값은 `.pen` 미접근으로
          확정 못 하지만(잔여 위험), 실측값에 더 가까운 21px로 보정한다 —
          h2(19px)와 h1(26px) 사이 보간값.
          D2(5차 재작업) — 아이콘 top은 디자인과 정확히 일치했지만
          제목/설명/안내 패널 간격은 균일 gap-4(16px)와 디자인 실측
          간격(28/17/16px)이 달라 아래로 처짐이 확인됐다. 화면별
          개별 margin-top으로 대체한다. */}
      <h1 className="text-[21px] font-bold text-bora-ink md:mt-[28px]">
        현재 입력만으로는 보상 가능성을 판단하기 어렵습니다
      </h1>
      <p className="text-body text-bora-ink-3 md:mt-[17px] md:text-base">
        진단명, 치료 여부 또는 사고 장소를 조금 더 구체적으로 적어주세요.
      </p>

      <div className="w-full rounded-[10px] bg-app-surface-inset p-4 text-left md:mt-[16px] md:p-5">
        <p className="text-sm font-bold text-bora-ink md:text-base">이렇게 적어주시면 좋아요</p>
        <ul className="mt-2 flex flex-col gap-1 text-body-s text-bora-ink-3 md:text-body">
          {INPUT_GUIDANCE_EXAMPLES.map((example) => (
            <li key={example}>· {example}</li>
          ))}
        </ul>
      </div>

      {/* design/exports/01-D는 "손해사정사에게 바로 문의" 버튼도 함께
          보여주지만, 03 상담 플로우는 이 SPEC의 Out of Scope다(plan.md §G).
          "내용을 수정할게요" 단독 버튼만 유지한다(허용된 차이). */}
      {/* D2(6차 재작업) — 동일 ink-pixel 좌표계 재측정에서 mock 배지가
          CTA를 20px 아래로 밀고 있었다(REQ-B2CDIAG-024는 배지 자체의
          존재만 허용하지, 다른 요소 위치 변화까지 허용하지 않는다는
          지시) — 배지를 CTA "다음"으로 옮겨 CTA margin이 배지와
          무관하게 디자인 좌표(491)를 직접 겨냥하도록 한다. */}
      <Button
        type="button"
        variant="diagnosis"
        className="md:mt-[14px] md:h-11 md:rounded-[12px] md:px-7 md:text-base"
        onClick={onEditInput}
      >
        내용을 수정할게요
      </Button>

      {/* REQ-B2CDIAG-024 — 이 화면은 항상 mock 판정 결과이므로 실제 결과와
          혼동되지 않도록 종속적인(subordinate) 위치에 목업 표기를 유지한다.
          design/exports/01-D는 이 배지를 보여주지 않지만(허용된 차이 —
          REQ-B2CDIAG-024 근거) 실제/mock 결과 혼동 방지가 우선한다. */}
      <p data-testid="diagnosis-mock-badge" className="text-meta text-bora-ink-4 md:mt-[8px]">
        이 화면은 데모/검토용 목업입니다
      </p>
    </div>
  );
}
