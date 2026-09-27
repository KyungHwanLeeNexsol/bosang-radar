"use client";

import * as React from "react";
import { Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ConsultationChannel } from "@/lib/consult/types";

// SPEC-B2C-CONSULT-001 M4 (design.md §7, REQ-B2CCONSULT-015; acceptance
// AC-B2CCONSULT-012/015) — 제출 CTA. canSubmit(필수 동의 2개 모두 체크,
// consult-view.tsx가 계산)이 게이트하며, isSubmitting 상태로 aria-busy +
// 이중 클릭/Enter 반복 방지를 자체적으로 구현한다. 실제 POST
// /api/consultations fetch 연결과 성공/중복/실패 응답 분기는 M5 범위다 —
// onSubmit은 이 milestone에서 스텁 콜백을 받는다(consult-view.tsx 주석 참고).
//
// M6 (design.md §11 "모바일 하단 CTA sticky") — 모바일에서 sticky bottom-0,
// 데스크톱(md)에서는 static으로 돌아간다. components/result/result-cta-bar.tsx
// ResultFinalCta의 sticky bottom-0 ... md:static 패턴을 그대로 재사용한다.
// bg-app-surface + border-t로 스크롤되는 내용과 분리한다(02의 dark
// bg-app-sidebar는 이 03 화면의 밝은 배경과 맞지 않아 이 화면의 기존
// surface 토큰을 그대로 쓴다).

const CHANNEL_LABEL: Record<ConsultationChannel, string> = {
  kakao: "카카오톡 상담 신청하기",
  phone: "전화 상담 신청하기",
};

interface ConsultSubmitBarProps {
  canSubmit: boolean;
  channel: ConsultationChannel;
  onSubmit: () => void | Promise<void>;
}

export function ConsultSubmitBar({ canSubmit, channel, onSubmit }: ConsultSubmitBarProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const disabled = !canSubmit || isSubmitting;

  const handleClick = React.useCallback(() => {
    // AC-B2CCONSULT-015 — 진행 중인 요청이 있으면(isSubmitting) 두 번째
    // 클릭/Enter를 완전히 무시한다(두 번째 onSubmit 호출 자체를 막는다).
    if (disabled) {
      return;
    }
    setIsSubmitting(true);
    Promise.resolve(onSubmit()).finally(() => {
      setIsSubmitting(false);
    });
  }, [disabled, onSubmit]);

  return (
    <div
      data-testid="consult-submit-bar"
      className="sticky bottom-0 -mx-4 border-t border-app-line bg-app-surface px-4 py-3 md:static md:mx-0 md:border-none md:bg-transparent md:px-0 md:py-0"
    >
      <Button
        type="button"
        data-testid="consult-submit-button"
        variant="diagnosis"
        aria-disabled={disabled}
        aria-busy={isSubmitting}
        onClick={handleClick}
        className={cn(
          "h-12 w-full rounded-[12px] text-base",
          disabled &&
            "bg-app-surface-inset text-bora-ink-4 shadow-none hover:bg-app-surface-inset"
        )}
      >
        {!canSubmit ? <Lock aria-hidden="true" className="size-4" /> : null}
        {CHANNEL_LABEL[channel]}
      </Button>
      <p className="mt-2 text-center text-meta text-bora-ink-3">필수 동의 후 상담을 신청할 수 있습니다</p>
      {/* M6 (design.md §11 "aria-live=polite로 상태 안내") — 제출 중
          상태를 스크린리더에 안내한다. aria-busy 속성 변경만으로는 일부
          스크린리더 조합에서 안정적으로 안내되지 않아, 별도 role=status
          라이브 리전을 둔다(consult-channel-selector.tsx의 CHANNEL_NOTICE
          role=status aria-live=polite 패턴과 동일). */}
      <span
        role="status"
        aria-live="polite"
        data-testid="consult-submit-status"
        className="sr-only"
      >
        {isSubmitting ? "상담 신청을 제출하는 중입니다" : ""}
      </span>
    </div>
  );
}
