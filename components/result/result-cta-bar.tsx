"use client";

import * as React from "react";
import { MessageCircle, Phone } from "lucide-react";

import { ResultDisclaimer } from "./result-disclaimer";
import { ResultFooter } from "./result-footer";
import { ResultInputConditionDisclosure } from "./result-input-condition-disclosure";

// SPEC-B2C-RESULT-001 M4 (design.md §8, MIGRATION-PLAN.md §4 "상담 CTA
// 배치(3곳)", REQ-B2CRESULT-023) — 03 상담 신청 화면이 아직 존재하지
// 않는 이 SPEC 범위 안에서, 3곳(상단 탑바/후유장해 섹션/하단 최종)의
// 상담 CTA를 모두 `aria-disabled="true"`(네이티브 disabled 아님) +
// 클릭·키보드(Enter/Space) 공통 no-op + 스크린리더가 인지 가능한
// "준비 중" 안내로 렌더링한다 — 실제 페이지 이동을 절대 시도하지 않는다.
// 세 CTA 모두 동일한 no-op 핸들러(usePreparingNotice)를 공유해 동작을
// 한 곳에서만 정의한다(Enforce Simplicity).
//
// SPEC-B2C-RESULT-001 D2 — 이 파일은 이번 리뷰의 수정 허용 파일이므로,
// result-view.tsx를 건드리지 않고 하단 고정 영역에 입력 조건
// disclosure/면책 문구/푸터를 배치하기 위해 ResultFinalCta가 Fragment로
// 그 세 컴포넌트 + 기존 sticky CTA 바를 함께 반환한다 — result-view.tsx는
// 이미 `<ResultFinalCta total={...} />` 한 번만 호출하므로 그 호출 지점을
// 그대로 재사용한다.
//
// SPEC-B2C-RESULT-001 D1(후속 리뷰) — ResultInputConditionDisclosure가 더 이상
// sessionStorage를 자체적으로 읽지 않으므로, ResultView가 이미 분류한
// rawInput/answers를 이 컴포넌트를 거쳐 그대로 내려준다.

const PREPARING_MESSAGE = "상담 신청 기능은 아직 준비 중입니다.";

function usePreparingNotice() {
  const [message, setMessage] = React.useState<string | null>(null);

  const trigger = React.useCallback(() => {
    setMessage(PREPARING_MESSAGE);
  }, []);

  const handleClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      trigger();
    },
    [trigger]
  );

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        trigger();
      }
    },
    [trigger]
  );

  return { message, handleClick, handleKeyDown };
}

interface PreparingButtonRenderProps {
  message: string | null;
  buttonProps: {
    type: "button";
    "aria-disabled": true;
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
    onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  };
}

function usePreparingButton(): PreparingButtonRenderProps {
  const { message, handleClick, handleKeyDown } = usePreparingNotice();
  return {
    message,
    buttonProps: {
      type: "button",
      "aria-disabled": true,
      onClick: handleClick,
      onKeyDown: handleKeyDown,
    },
  };
}

/** 상단 탑바 CTA — "카카오톡 상담"(MIGRATION-PLAN.md §4). */
export function ResultTopBarCta() {
  const { message, buttonProps } = usePreparingButton();

  return (
    <header
      data-testid="result-top-bar"
      className="flex w-full items-center justify-between border-b border-app-line bg-app-surface px-4 py-3.5 md:px-8"
    >
      <div className="flex items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-bora-accent text-sm font-bold text-white">
          B
        </span>
        <span className="text-base font-extrabold tracking-tight text-bora-ink">BORA</span>
      </div>

      <div className="flex flex-col items-end gap-1">
        <button
          {...buttonProps}
          aria-label="카카오톡 상담"
          data-testid="result-cta-top"
          className="flex items-center gap-1.5 rounded-full border border-app-line px-3.5 py-1.5 text-body-s font-medium text-bora-ink-2 transition-colors hover:bg-app-surface-sub md:px-4"
        >
          <MessageCircle className="size-4 shrink-0" aria-hidden="true" />
          <span className="hidden md:inline">카카오톡 상담</span>
        </button>
        <span
          role="status"
          aria-live="polite"
          data-testid="result-cta-top-notice"
          className="text-label-s text-bora-warn"
        >
          {message ?? ""}
        </span>
      </div>
    </header>
  );
}

/** 후유장해 섹션 CTA — "내 장해율이 얼마나 나올지 궁금하신가요?"(MIGRATION-PLAN.md §4). */
export function ResultDisabilitySectionCta() {
  const { message, buttonProps } = usePreparingButton();

  return (
    <div
      data-testid="result-cta-disability"
      className="rounded-[10px] border border-bora-accent-line bg-bora-accent-soft p-4"
    >
      <p className="text-body-s font-semibold text-bora-ink">
        내 장해율이 얼마나 나올지 궁금하신가요?
      </p>
      <button
        {...buttonProps}
        data-testid="result-cta-disability-button"
        className="mt-2 inline-flex items-center rounded-full bg-bora-accent px-4 py-2 text-body-s font-semibold text-white shadow-[0_2px_8px_-2px_rgba(108,71,255,0.55)] hover:bg-bora-accent-deep"
      >
        상담 신청하기
      </button>
      <span
        role="status"
        aria-live="polite"
        data-testid="result-cta-disability-notice"
        className="mt-1 block text-label-s text-bora-warn"
      >
        {message ?? ""}
      </span>
    </div>
  );
}

/**
 * 하단 최종 CTA — "N가지를 전부 청구하시겠어요?"(MIGRATION-PLAN.md §4). 예시
 * 숫자(디자인 목업의 11)를 하드코딩하지 않고 result-view.tsx가 넘겨주는
 * aggregate.total을 그대로 사용한다(REQ-B2CRESULT-002와 동일한 원칙).
 */
export function ResultFinalCta({
  total,
  rawInput,
  answers,
}: {
  total: number;
  rawInput: string;
  answers: Record<string, string>;
}) {
  const { message, buttonProps } = usePreparingButton();

  return (
    <>
      <ResultInputConditionDisclosure rawInput={rawInput} answers={answers} />
      <ResultDisclaimer />
      <ResultFooter />
      <div
        data-testid="result-cta-final"
        className="sticky bottom-0 flex w-full flex-col items-center gap-2 bg-app-sidebar px-5 py-4 text-center md:static md:flex-row md:justify-between md:px-8"
      >
        <p className="text-body font-semibold text-white">{total}가지를 전부 청구하시겠어요?</p>
        <div className="flex items-center gap-2">
          <button
            {...buttonProps}
            data-testid="result-cta-final-kakao"
            className="flex items-center gap-1.5 rounded-full bg-bora-accent px-4 py-2 text-body-s font-semibold text-white hover:bg-bora-accent-deep"
          >
            <MessageCircle className="size-4" aria-hidden="true" />
            카카오톡으로 상담
          </button>
          <button
            {...buttonProps}
            data-testid="result-cta-final-phone"
            className="flex items-center gap-1.5 rounded-full border border-app-sidebar-line px-4 py-2 text-body-s font-semibold text-white"
          >
            <Phone className="size-4" aria-hidden="true" />
            전화 상담
          </button>
        </div>
        <span
          role="status"
          aria-live="polite"
          data-testid="result-cta-final-notice"
          className="text-label-s text-amber-200"
        >
          {message ?? ""}
        </span>
      </div>
    </>
  );
}
