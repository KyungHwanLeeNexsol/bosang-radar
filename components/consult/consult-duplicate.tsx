import type { Ref } from "react";
import Link from "next/link";
import { Clock } from "lucide-react";

import type { ConsultationChannel } from "@/lib/consult/types";

import { SUMMARY_CARD_CLASS, SummaryRow } from "./consult-summary-row";

// SPEC-B2C-CONSULT-001 M5 (design.md §10, §9.4; acceptance AC-B2CCONSULT-023,
// REQ-B2CCONSULT-020) — 03-C/M03-C 중복 상태. 서버 duplicate 응답에는
// channel 필드가 없으므로(lib/consult/types.ts ConsultationSubmitResult
// duplicate variant) 호출부(consult-view.tsx)가 제출 당시 formState.channel을
// prop으로 전달한다. 내부 consultationId나 전체 페이로드는 절대 노출하지
// 않는다 — 마스킹된 연락처·날짜 단위 접수일·처리 상태 라벨만 렌더링한다.

const CHANNEL_LABEL: Record<ConsultationChannel, string> = {
  kakao: "카카오톡 상담",
  phone: "전화 상담",
};

// 이 SPEC 범위에서 서버가 실제로 생성하는 값은 "received" 하나뿐이다
// (design.md §9.2 — applicationStatus DEFAULT "received", 상태 전이 로직은
// 범위 밖). 알려지지 않은 값은 원본 문자열을 그대로 표시해 향후 확장에
// 대비한다(하드코딩된 매핑 실패로 화면이 빈 값을 보여주지 않도록).
const APPLICATION_STATUS_LABEL: Record<string, string> = {
  received: "접수됨",
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
    <div
      data-testid="consult-duplicate"
      className="mx-auto flex w-full max-w-[720px] flex-col items-center gap-5 px-5 py-12 text-center"
    >
      <span
        aria-hidden="true"
        className="flex size-14 items-center justify-center rounded-full bg-bora-warn-soft text-bora-warn md:size-16"
      >
        <Clock className="size-6 md:size-7" />
      </span>
      <h1
        ref={titleRef}
        tabIndex={-1}
        data-testid="consult-outcome-title"
        className="text-h2 font-bold text-bora-ink outline-none"
      >
        이미 접수된 상담 신청이 있습니다
      </h1>

      <dl data-testid="consult-duplicate-summary" className={`mt-8 md:mt-10 ${SUMMARY_CARD_CLASS}`}>
        <SummaryRow label="상담 방식" value={CHANNEL_LABEL[channel]} />
        <SummaryRow label="연락처" value={maskedContact} />
        <SummaryRow label="접수일" value={receivedAt} />
        <SummaryRow
          label="처리 상태"
          value={APPLICATION_STATUS_LABEL[applicationStatus] ?? applicationStatus}
        />
      </dl>

      <div className="flex w-full flex-col items-center gap-2 md:w-auto md:flex-row md:justify-center">
        <span
          data-testid="consult-duplicate-status-inquiry"
          className="text-label-s text-bora-ink-4"
        >
          기존 신청 상태 확인: 준비 중
        </span>
        <Link
          href="/result"
          data-testid="consult-duplicate-back-cta"
          className="w-full rounded-full bg-bora-accent px-5 py-3.5 text-center text-body-s font-semibold text-white hover:bg-bora-accent-deep md:w-auto"
        >
          진단 결과로 돌아가기
        </Link>
      </div>
    </div>
  );
}
