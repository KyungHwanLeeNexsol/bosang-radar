import type { Ref } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import type { ConsultationChannel } from "@/lib/consult/types";

// SPEC-B2C-CONSULT-001 M5 (design.md §10, §9.4; acceptance AC-B2CCONSULT-018
// 최초 제출 성공 응답 형태) — 03-B/M03-B 성공 상태. 서버 응답(maskedContact/
// preferredCallTime)만 그대로 렌더링하고 재계산하지 않는다. "상담 예정
// 전문가"는 §1 D3에 따라 정적 placeholder다(자동 배정 로직은 범위 밖).
// "접수 내용을 확인한 뒤…" 문구는 §1 D6이 확정한 운영 SLA 미확정 중립
// 표현이다 — 구체적 시간을 절대 약속하지 않는다.

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

// 모바일 카드는 디자인 export(M03-B)처럼 카드 자체의 세로 여백 없이 행이 테두리에
// 바로 붙고 행 구분선이 카드 폭 끝까지 이어진다(디자인 175px, 구현 211px 실측 —
// progress.md 열린 항목 7). 그래서 모바일은 행이 px-4를 갖고, md 이상은 디자인을
// 재지 않아 기존대로 카드가 p-4를 갖는다.
function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-app-line px-4 py-3 last:border-b-0 md:px-0">
      <dt className="text-body-s text-bora-ink-3">{label}</dt>
      <dd className="text-body-s font-semibold text-bora-ink">{value}</dd>
    </div>
  );
}

export function ConsultSuccess({
  channel,
  maskedContact,
  preferredCallTime,
  titleRef,
}: ConsultSuccessProps) {
  return (
    <div
      data-testid="consult-success"
      className="mx-auto flex w-full max-w-[720px] flex-col items-center gap-6 px-5 py-14 text-center md:gap-5 md:py-12"
    >
      <span
        aria-hidden="true"
        className="flex size-14 items-center justify-center rounded-full bg-bora-ok-soft text-bora-ok md:size-16"
      >
        <CheckCircle2 className="size-6 md:size-7" />
      </span>
      <h1
        ref={titleRef}
        tabIndex={-1}
        data-testid="consult-outcome-title"
        className="text-h2 font-bold text-bora-ink outline-none"
      >
        상담 신청이 접수되었습니다
      </h1>

      <dl
        data-testid="consult-success-summary"
        className="mt-[2px] w-full rounded-[12px] border border-app-line bg-app-surface text-left md:mt-14 md:p-4"
      >
        <SummaryRow label="상담 방식" value={CHANNEL_LABEL[channel]} />
        <SummaryRow label="연락처" value={maskedContact} />
        {channel === "phone" && preferredCallTime ? (
          <SummaryRow label="연락 희망 시간" value={preferredCallTime} />
        ) : null}
        <SummaryRow label="상담 예정 전문가" value="배정 예정" />
      </dl>

      <p data-testid="consult-success-notice" className="max-w-sm text-body text-bora-ink-3">
        접수 내용을 확인한 뒤 선택하신 방법으로 연락드리겠습니다
      </p>

      <div className="mt-[3px] flex w-full flex-col items-center gap-2 md:mt-[-39px] md:w-auto md:flex-row md:justify-center">
        <Link
          href="/result"
          data-testid="consult-success-back-cta"
          className="w-full rounded-full bg-bora-accent px-5 py-3.5 text-center text-body-s font-semibold text-white hover:bg-bora-accent-deep md:w-auto"
        >
          진단 결과로 돌아가기
        </Link>
        <span data-testid="consult-success-cancel-inquiry" className="text-label-s text-bora-ink-4">
          신청 취소 · 정보 삭제 문의: 준비 중
        </span>
      </div>
    </div>
  );
}
