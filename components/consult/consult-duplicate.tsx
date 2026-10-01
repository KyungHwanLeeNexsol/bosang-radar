import type { Ref } from "react";
import { ArrowLeft, Clock3, Info, Search } from "lucide-react";

import type { ConsultationChannel } from "@/lib/consult/types";

import { OutcomeActions, OutcomeButton } from "./consult-outcome-button";
import { OutcomeFrame, OutcomeNote } from "./consult-outcome-frame";
import { SUMMARY_CARD_CLASS, SummaryRow } from "./consult-summary-row";

// SPEC-B2C-CONSULT-001 M5 (design.md §10, §9.4; acceptance AC-B2CCONSULT-023,
// REQ-B2CCONSULT-020) — 03-C/M03-C 중복 상태. 서버 duplicate 응답에는
// channel 필드가 없으므로(lib/consult/types.ts ConsultationSubmitResult
// duplicate variant) 호출부(consult-view.tsx)가 제출 당시 formState.channel을
// prop으로 전달한다. 내부 consultationId나 전체 페이로드는 절대 노출하지
// 않는다 — 마스킹된 연락처·날짜 단위 접수일·처리 상태 라벨만 렌더링한다.
//
// [.pen 최우선 지시 반영] 2줄 부제, 카드 아래 안내 박스, 주 버튼 "기존 신청 상태 확인"
// (목적지가 없어 비활성 "준비 중"), 보조 버튼 "진단 결과로 돌아가기"를 .pen 03-C 그대로 맞춘다.

const CHANNEL_LABEL: Record<ConsultationChannel, string> = {
  kakao: "카카오톡 상담",
  phone: "전화 상담",
};

// 이 SPEC 범위에서 서버가 실제로 생성하는 값은 "received" 하나뿐이다
// (design.md §9.2 — applicationStatus DEFAULT "received", 상태 전이 로직은
// 범위 밖). .pen 03-C는 이를 "상담 대기 중"으로 표기한다. 알려지지 않은 값은 원본
// 문자열을 그대로 표시해 향후 확장에 대비한다(하드코딩된 매핑 실패로 화면이 빈
// 값을 보여주지 않도록).
const APPLICATION_STATUS_LABEL: Record<string, string> = {
  received: "상담 대기 중",
};

interface ConsultDuplicateProps {
  channel: ConsultationChannel;
  maskedContact: string;
  receivedAt: string;
  applicationStatus: string;
  /** 화면 전환 직후 스크롤 위치 복원과 함께 이 제목으로 포커스를 옮기는 데
   * 쓰인다(consult-view.tsx) — 클라이언트 상태 전환이라 브라우저가 스크롤을
   * 자동으로 되돌리지 않고, 스크린 리더도 새 화면 진입을 자동으로 알리지
   * 않는다. */
  titleRef?: Ref<HTMLHeadingElement>;
}

export function ConsultDuplicate({
  channel,
  maskedContact,
  receivedAt,
  applicationStatus,
  titleRef,
}: ConsultDuplicateProps) {
  return (
    <OutcomeFrame
      testId="consult-duplicate"
      tone="warn"
      icon={Clock3}
      title={
        <>
          이미 접수된
          <br className="md:hidden" /> 상담 신청이 있습니다
        </>
      }
      titleRef={titleRef}
      subtitle={
        // 데스크톱은 두 줄, 모바일은 한 문단으로 흐른다(.pen 03-C / M03-C).
        <>
          <span className="md:block">같은 진단 결과로 접수된 신청이 처리 중입니다.</span>{" "}
          <span className="md:block">중복으로 다시 신청하지 않으셔도 됩니다.</span>
        </>
      }
      subtitleTestId="consult-duplicate-subtitle"
      card={
        <dl data-testid="consult-duplicate-summary" className={SUMMARY_CARD_CLASS}>
          <SummaryRow label="상담 방식" value={CHANNEL_LABEL[channel]} />
          <SummaryRow label="연락처" value={maskedContact} />
          <SummaryRow label="접수일" value={receivedAt} />
          <SummaryRow
            label="처리 상태"
            value={APPLICATION_STATUS_LABEL[applicationStatus] ?? applicationStatus}
            tone="warn"
          />
        </dl>
      }
      note={
        <OutcomeNote testId="consult-duplicate-notice" icon={Info}>
          {/* 기존 신청의 상태 확인·취소·문의 목적지와 운영 절차가 아직 없다(활성화 전에
              해소할 열린 항목). 그래서 실행할 수 없는 취소 절차나 확인되지 않은 연락
              약속을 안내하지 않고, 지원되지 않는다는 사실만 알린다. */}
          <span className="md:hidden">변경·취소·상태 확인은 아직 지원되지 않습니다.</span>
          <span className="hidden md:inline">
            신청 내용 변경, 취소, 접수 상태 확인은 아직 이 화면에서 지원되지 않습니다.
          </span>
        </OutcomeNote>
      }
      actions={
        <OutcomeActions>
          <OutcomeButton
            variant="primary"
            icon={Search}
            testId="consult-duplicate-status-inquiry"
            action={{ type: "stub" }}
          >
            기존 신청 상태 확인
          </OutcomeButton>
          <OutcomeButton
            variant="secondary"
            icon={ArrowLeft}
            testId="consult-duplicate-back-cta"
            action={{ type: "link", href: "/result" }}
          >
            진단 결과로 돌아가기
          </OutcomeButton>
        </OutcomeActions>
      }
    />
  );
}
