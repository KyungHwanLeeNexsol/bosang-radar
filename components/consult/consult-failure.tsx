"use client";

import type { Ref } from "react";
import { ArrowLeft, MessageCircle, RefreshCw, TriangleAlert } from "lucide-react";

import type { ConsultationChannel } from "@/lib/consult/types";

import { OutcomeActions, OutcomeButton } from "./consult-outcome-button";
import { OutcomeFrame, OutcomeNote } from "./consult-outcome-frame";
import { SUMMARY_CARD_CLASS, SummaryRow } from "./consult-summary-row";

// SPEC-B2C-CONSULT-001 M5 (design.md §10; acceptance AC-B2CCONSULT-022) —
// 03-D/M03-D 실패 상태. 서버가 실제로 저장했는지 여부를 절대 단정하지
// 않는다 — "저장되었습니다" 류의 확정 문구를 쓰지 않는다(design.md §10).
// "다시 시도하기"는 같은 idempotencyKey 재전송을 트리거해야 하지만, 그
// 책임은 호출부(consult-view.tsx handleSubmit)에 있다 — 이 컴포넌트는
// onRetry 콜백만 받는다(idempotencyKey 자체를 알지 못함, 단일 책임).
//
// [.pen 최우선 지시 반영] 2줄 부제(알림), 카드 아래 안내 박스(대체 채널 + 입력 유지),
// 아이콘 버튼을 .pen 03-D 그대로 맞춘다. 연락 희망 시간 행은 채널과 상관없이
// 사용자가 입력한 값이 있으면 보인다(.pen 4행).

const CHANNEL_LABEL: Record<ConsultationChannel, string> = {
  kakao: "카카오톡 상담",
  phone: "전화 상담",
};

interface ConsultFailureProps {
  channel: ConsultationChannel;
  contact: string;
  preferredCallTime: string;
  isRetrying: boolean;
  onRetry: () => void;
  /** 화면 전환 직후 스크롤 위치 복원과 함께 이 제목으로 포커스를 옮기는 데
   * 쓰인다(consult-view.tsx) — 클라이언트 상태 전환이라 브라우저가 스크롤을
   * 자동으로 되돌리지 않고, 스크린 리더도 새 화면 진입을 자동으로 알리지
   * 않는다. */
  titleRef?: Ref<HTMLHeadingElement>;
}

export function ConsultFailure({
  channel,
  contact,
  preferredCallTime,
  isRetrying,
  onRetry,
  titleRef,
}: ConsultFailureProps) {
  return (
    <OutcomeFrame
      testId="consult-failure"
      tone="danger"
      icon={TriangleAlert}
      title={
        <>
          상담 신청이
          <br className="md:hidden" /> 접수되지 않았습니다
        </>
      }
      titleRef={titleRef}
      subtitleRole="alert"
      subtitle={
        <>
          <span className="md:block">일시적인 오류로 접수가 완료되지 않았습니다.</span>{" "}
          <span className="md:block">입력하신 내용은 다시 입력하지 않아도 됩니다.</span>
        </>
      }
      card={
        <dl data-testid="consult-failure-summary" className={SUMMARY_CARD_CLASS}>
          <SummaryRow label="상담 방식" value={CHANNEL_LABEL[channel]} />
          <SummaryRow label="연락처" value={contact} />
          {preferredCallTime ? (
            <SummaryRow label="연락 희망 시간" mobileLabel="희망 시간" value={preferredCallTime} />
          ) : null}
          <SummaryRow label="입력 내용" value="유지됨" />
        </dl>
      }
      note={
        <OutcomeNote testId="consult-failure-notice" icon={MessageCircle}>
          다시 시도해도 접수되지 않으면 카카오톡 상담으로 문의해 주세요. 현재 화면에서 입력 내용이
          유지됩니다.
        </OutcomeNote>
      }
      actions={
        <OutcomeActions>
          <OutcomeButton
            variant="primary"
            icon={RefreshCw}
            testId="consult-failure-retry"
            action={{ type: "button", onClick: onRetry, busy: isRetrying }}
          >
            다시 시도하기
          </OutcomeButton>
          <OutcomeButton
            variant="secondary"
            icon={ArrowLeft}
            testId="consult-failure-back-cta"
            action={{ type: "link", href: "/result" }}
          >
            이전 화면으로 돌아가기
          </OutcomeButton>
        </OutcomeActions>
      }
    />
  );
}
