"use client";

import * as React from "react";
import { Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CONSULT_POLICY_NOT_READY_NOTICE } from "@/lib/consult/consent-policy";
import type { ConsultationChannel } from "@/lib/consult/types";

// SPEC-B2C-CONSULT-001 M4 (design.md §7, REQ-B2CCONSULT-015; acceptance
// AC-B2CCONSULT-012/015) — 제출 CTA. canSubmit(필수 동의 2개 모두 체크,
// consult-view.tsx가 계산)이 게이트하며, isSubmitting 상태로 aria-busy +
// 이중 클릭(버튼 활성화) 반복 방지를 자체적으로 구현한다. 실제 POST
// /api/consultations fetch 연결과 성공/중복/실패 응답 분기는 M5 범위다 —
// onSubmit은 이 milestone에서 스텁 콜백을 받는다(consult-view.tsx 주석 참고).
//
// M6 (design.md §11 "모바일 하단 CTA sticky") — 모바일에서 sticky bottom-0,
// 데스크톱(md)에서는 static으로 돌아간다. components/result/result-cta-bar.tsx
// ResultFinalCta의 sticky bottom-0 ... md:static 패턴을 그대로 재사용한다.
// bg-app-surface + border-t로 스크롤되는 내용과 분리한다(02의 dark
// bg-app-sidebar는 이 03 화면의 밝은 배경과 맞지 않아 이 화면의 기존
// surface 토큰을 그대로 쓴다).
//
// 정책 미준비 분기(design.md §4, REQ-B2CCONSULT-005, AC-B2CCONSULT-005 추가
// 시나리오) — isPolicyReady=false면 제출 버튼을 아예 렌더링하지 않고 그 자리에
// 안내 영역(role=status aria-live=polite)을 둔다. 03 폼에는 <form>·Enter 제출
// 핸들러가 없어 제출 경로는 제출 버튼 클릭(키보드로는 포커스된 버튼의 기본
// Enter/Space 활성화)뿐인데, 이 분기에서는 버튼이 DOM에 없으므로 onSubmit에
// 도달할 경로 자체가 없다. 이 대체는 UX 계층일 뿐이며 저장 거부의 권위는
// 서버(503/policy_unavailable)에 있다.

const BAR_CLASS_NAME =
  "sticky bottom-0 -mx-4 border-t border-app-line bg-app-surface px-4 py-3 md:static md:mx-0 md:border-none md:bg-transparent md:px-0 md:py-0";

const CHANNEL_LABEL: Record<ConsultationChannel, string> = {
  kakao: "카카오톡 상담 신청하기",
  phone: "전화 상담 신청하기",
};

interface ConsultSubmitBarProps {
  // 기본값을 두지 않는다 — 호출부(consult-view.tsx)가 fail-closed 기본값(false)을
  // 한 곳에서만 결정하도록, 이 컴포넌트는 항상 명시적으로 받는다.
  isPolicyReady: boolean;
  canSubmit: boolean;
  channel: ConsultationChannel;
  onSubmit: () => void | Promise<void>;
}

export function ConsultSubmitBar({
  isPolicyReady,
  canSubmit,
  channel,
  onSubmit,
}: ConsultSubmitBarProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const disabled = !canSubmit || isSubmitting;

  const handleClick = React.useCallback(() => {
    // AC-B2CCONSULT-015 — 진행 중인 요청이 있으면(isSubmitting) 두 번째
    // 버튼 활성화(클릭, 또는 포커스된 버튼의 Enter/Space 네이티브 활성화)를
    // 완전히 무시한다(두 번째 onSubmit 호출 자체를 막는다).
    if (disabled) {
      return;
    }
    setIsSubmitting(true);
    Promise.resolve(onSubmit()).finally(() => {
      setIsSubmitting(false);
    });
  }, [disabled, onSubmit]);

  if (!isPolicyReady) {
    return (
      <div data-testid="consult-submit-bar" className={BAR_CLASS_NAME}>
        <p
          role="status"
          aria-live="polite"
          data-testid="consult-submit-policy-notice"
          className="rounded-[12px] bg-app-surface-inset px-4 py-3 text-center text-body-s text-bora-ink-3"
        >
          {CONSULT_POLICY_NOT_READY_NOTICE}
        </p>
      </div>
    );
  }

  return (
    <div data-testid="consult-submit-bar" className={BAR_CLASS_NAME}>
      <Button
        type="button"
        data-testid="consult-submit-button"
        variant="diagnosis"
        aria-disabled={disabled}
        aria-busy={isSubmitting}
        onClick={handleClick}
        className={cn(
          "h-12 w-full rounded-[12px] text-base",
          disabled && "bg-app-surface-inset text-bora-ink-4 shadow-none hover:bg-app-surface-inset"
        )}
      >
        {!canSubmit ? <Lock aria-hidden="true" className="size-4" /> : null}
        {CHANNEL_LABEL[channel]}
      </Button>
      <p className="mt-2 text-center text-meta text-bora-ink-3">
        필수 동의 후 상담을 신청할 수 있습니다
      </p>
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
