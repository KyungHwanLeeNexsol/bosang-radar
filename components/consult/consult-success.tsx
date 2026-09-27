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
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-app-line py-2 last:border-b-0">
      <dt className="text-body-s text-bora-ink-3">{label}</dt>
      <dd className="text-body-s font-semibold text-bora-ink">{value}</dd>
    </div>
  );
}

export function ConsultSuccess({ channel, maskedContact, preferredCallTime }: ConsultSuccessProps) {
  return (
    <div
      data-testid="consult-success"
      className="mx-auto flex w-full max-w-[720px] flex-col items-center gap-5 px-4 py-12 text-center"
    >
      <span
        aria-hidden="true"
        className="flex size-14 items-center justify-center rounded-full bg-bora-ok-soft text-bora-ok md:size-16"
      >
        <CheckCircle2 className="size-6 md:size-7" />
      </span>
      <h1 className="text-h2 font-bold text-bora-ink">상담 신청이 접수되었습니다</h1>

      <dl
        data-testid="consult-success-summary"
        className="w-full rounded-[12px] border border-app-line bg-app-surface p-4 text-left"
      >
        <SummaryRow label="상담 방식" value={CHANNEL_LABEL[channel]} />
        <SummaryRow label="연락처" value={maskedContact} />
        {channel === "phone" && preferredCallTime ? (
          <SummaryRow label="연락 희망 시간" value={preferredCallTime} />
        ) : null}
        <SummaryRow label="상담 예정 전문가" value="배정 예정" />
      </dl>

      <p className="max-w-sm text-body text-bora-ink-3">
        접수 내용을 확인한 뒤 선택하신 방법으로 연락드리겠습니다
      </p>

      <div className="flex flex-col items-center gap-2">
        <Link
          href="/result"
          data-testid="consult-success-back-cta"
          className="rounded-full bg-bora-accent px-5 py-2.5 text-body-s font-semibold text-white hover:bg-bora-accent-deep"
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
