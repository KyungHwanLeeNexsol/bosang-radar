import type { Ref } from "react";
import { ArrowLeft, CheckCircle2, CircleX } from "lucide-react";

import type { ConsultationChannel } from "@/lib/consult/types";

import { OutcomeActions, OutcomeButton } from "./consult-outcome-button";
import { OutcomeFrame } from "./consult-outcome-frame";
import { SUMMARY_CARD_CLASS, SummaryRow } from "./consult-summary-row";

// SPEC-B2C-CONSULT-001 M5 (design.md §10, §9.4; acceptance AC-B2CCONSULT-018
// 최초 제출 성공 응답 형태) — 03-B/M03-B 성공 상태. 서버 응답(maskedContact/
// preferredCallTime)만 그대로 렌더링하고 재계산하지 않는다. "상담 예정
// 전문가"는 §1 D3에 따라 정적 placeholder다(자동 배정 로직은 범위 밖).
//
// [.pen 최우선 지시 반영] 부제는 .pen 03-B 문구 "영업일 기준 1일 이내에 선택하신
// 방법으로 연락드립니다."를 그대로 쓴다(design.md §1 D6의 중립 문구를 대체 —
// 운영이 이 약속을 지킬 수 있는지는 런북 §11.3의 활성화 전 점검 항목이다).
// 연락 희망 시간 행은 채널과 상관없이 서버가 값을 돌려주면 보인다(.pen 4행).
// 목적지가 없는 "신청 취소 · 정보 삭제 문의"는 .pen 모양의 비활성 버튼(준비 중)이다.

const CHANNEL_LABEL: Record<ConsultationChannel, string> = {
  kakao: "카카오톡 상담",
  phone: "전화 상담",
};

interface ConsultSuccessProps {
  channel: ConsultationChannel;
  maskedContact: string;
  preferredCallTime?: string;
  /** 화면 전환 직후 스크롤 위치 복원과 함께 이 제목으로 포커스를 옮기는 데
   * 쓰인다(consult-view.tsx) — 클라이언트 상태 전환이라 브라우저가 스크롤을
   * 자동으로 되돌리지 않고, 스크린 리더도 새 화면 진입을 자동으로 알리지
   * 않는다. */
  titleRef?: Ref<HTMLHeadingElement>;
}

export function ConsultSuccess({
  channel,
  maskedContact,
  preferredCallTime,
  titleRef,
}: ConsultSuccessProps) {
  return (
    <OutcomeFrame
      testId="consult-success"
      tone="ok"
      icon={CheckCircle2}
      title="상담 신청이 접수되었습니다"
      titleRef={titleRef}
      subtitle="영업일 기준 1일 이내에 선택하신 방법으로 연락드립니다."
      subtitleTestId="consult-success-notice"
      card={
        <dl data-testid="consult-success-summary" className={SUMMARY_CARD_CLASS}>
          <SummaryRow label="상담 방식" value={CHANNEL_LABEL[channel]} />
          <SummaryRow label="연락처" value={maskedContact} />
          {preferredCallTime ? (
            <SummaryRow label="연락 희망 시간" mobileLabel="희망 시간" value={preferredCallTime} />
          ) : null}
          <SummaryRow label="상담 예정 전문가" value="배정 예정" />
        </dl>
      }
      actions={
        <OutcomeActions>
          <OutcomeButton
            variant="primary"
            icon={ArrowLeft}
            testId="consult-success-back-cta"
            action={{ type: "link", href: "/result" }}
          >
            진단 결과로 돌아가기
          </OutcomeButton>
          <OutcomeButton
            variant="secondary"
            icon={CircleX}
            testId="consult-success-cancel-inquiry"
            action={{ type: "stub" }}
          >
            신청 취소 · 정보 삭제 문의
          </OutcomeButton>
        </OutcomeActions>
      }
    />
  );
}
