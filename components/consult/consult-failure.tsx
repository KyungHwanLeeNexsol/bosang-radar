"use client";

import type { Ref } from "react";
import { ArrowLeft, MessageCircle, RefreshCw, TriangleAlert } from "lucide-react";

import type { ConsultationChannel } from "@/lib/consult/types";

import { OutcomeActions, OutcomeButton } from "./consult-outcome-button";
import { OutcomeFrame, OutcomeNote } from "./consult-outcome-frame";
import { SUMMARY_CARD_CLASS, SummaryRow } from "./consult-summary-row";

// SPEC-B2C-CONSULT-001 M5 (design.md §10; acceptance AC-B2CCONSULT-022) —
// 03-D/M03-D 실패 상태. 서버가 실제로 저장했는지 여부를 절대 단정하지
// 않는다 — "저장되었습니다" 류의 확정 문구도, "접수되지 않았습니다" 류의
// 부정 문구도 쓰지 않는다(design.md §10). 이 화면은 서버 error뿐 아니라
// 응답 유실·네트워크 예외·진단 핸드오프 불일치도 받는데, 서버가 이미
// 접수를 커밋하고 응답만 클라이언트에 닿지 못했을 수 있기 때문이다. 같은
// 이유로 "접수 여부를 확인하지 못했다"고만 말하고, 같은 내용으로 다시
// 시도해도 중복 접수되지 않음(서버가 같은 idempotencyKey로 기존 결과를
// 재생)을 안내한다. 실제 문의 창구가 없으므로 대체 채널은 안내하지 않는다.
// "다시 시도하기"는 같은 idempotencyKey 재전송을 트리거해야 하지만, 그
// 책임은 호출부(consult-view.tsx handleSubmit)에 있다 — 이 컴포넌트는
// onRetry 콜백만 받는다(idempotencyKey 자체를 알지 못함, 단일 책임).
//
// 2줄 부제(알림), 카드 아래 안내 박스(중복 접수 안 됨 + 입력 유지), 아이콘
// 버튼을 갖는다. 연락 희망 시간 행은 채널과 상관없이 사용자가 입력한 값이
// 있으면 보인다(.pen 4행).
//
// 변형은 두 가지다(reason).
//   - "unknown_outcome"(기본): 위에서 설명한 공용 문구. 요청을 보냈을 수 있고
//     결과를 모르는 경로(서버 error·응답 유실·예외)에서만 "접수 여부를 알 수
//     없다"가 사실이므로 중립적이다.
//   - "handoff_mismatch": 제출 직전 진단 핸드오프가 마운트 때와 달라 handleSubmit이
//     서버로 아무것도 보내지 않고 온 경로. 접수 여부가 불명이 아니라 "보내지
//     않았다"가 확정이라 공용 문구가 거짓이 되고, 재시도는 같은 비교를 반복해
//     계속 실패하므로 재시도 버튼과 "중복 접수되지 않습니다" 안내 박스를 그리지
//     않는다. 요약 카드와 이전 화면 링크는 그대로 둔다.

const CHANNEL_LABEL: Record<ConsultationChannel, string> = {
  kakao: "카카오톡 상담",
  phone: "전화 상담",
};

export type ConsultFailureReason = "unknown_outcome" | "handoff_mismatch";

interface ConsultFailureProps {
  /** 실패 경로. 생략하면 결과 불명("unknown_outcome") 공용 문구. */
  reason?: ConsultFailureReason;
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
  reason = "unknown_outcome",
  channel,
  contact,
  preferredCallTime,
  isRetrying,
  onRetry,
  titleRef,
}: ConsultFailureProps) {
  const notSent = reason === "handoff_mismatch";

  return (
    <OutcomeFrame
      testId="consult-failure"
      tone="danger"
      icon={TriangleAlert}
      title={
        notSent ? (
          <>
            상담 신청을
            <br className="md:hidden" /> 보내지 않았습니다
          </>
        ) : (
          <>
            상담 신청 접수 여부를
            <br className="md:hidden" /> 확인하지 못했습니다
          </>
        )
      }
      titleRef={titleRef}
      subtitleRole="alert"
      subtitle={
        notSent ? (
          <>
            진단 결과가 달라져 신청을 보내지 않았습니다. 진단 결과를 다시 확인한 뒤 신청해 주세요.
          </>
        ) : (
          <>
            <span className="md:block">신청이 접수되었는지 이 화면에서는 알 수 없습니다.</span>{" "}
            <span className="md:block">입력하신 내용은 다시 입력하지 않아도 됩니다.</span>
          </>
        )
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
        notSent ? undefined : (
          <OutcomeNote testId="consult-failure-notice" icon={MessageCircle}>
            같은 내용으로 다시 시도해도 중복 접수되지 않습니다. 현재 화면에서 입력 내용이
            유지됩니다.
          </OutcomeNote>
        )
      }
      actions={
        <OutcomeActions>
          {notSent ? null : (
            <OutcomeButton
              variant="primary"
              icon={RefreshCw}
              testId="consult-failure-retry"
              action={{ type: "button", onClick: onRetry, busy: isRetrying }}
            >
              다시 시도하기
            </OutcomeButton>
          )}
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
