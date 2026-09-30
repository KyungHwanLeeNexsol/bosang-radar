"use client";

import type { Ref } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ConsultationChannel } from "@/lib/consult/types";

import { SUMMARY_CARD_CLASS, SummaryRow } from "./consult-summary-row";

// SPEC-B2C-CONSULT-001 M5 (design.md §10; acceptance AC-B2CCONSULT-022) —
// 03-D/M03-D 실패 상태. 서버가 실제로 저장했는지 여부를 절대 단정하지
// 않는다 — "저장되었습니다" 류의 확정 문구를 쓰지 않는다(design.md §10).
// "다시 시도하기"는 같은 idempotencyKey 재전송을 트리거해야 하지만, 그
// 책임은 호출부(consult-view.tsx handleSubmit)에 있다 — 이 컴포넌트는
// onRetry 콜백만 받는다(idempotencyKey 자체를 알지 못함, 단일 책임).

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
    <div
      data-testid="consult-failure"
      className="mx-auto flex w-full max-w-[720px] flex-col items-center gap-5 px-5 py-12 text-center"
    >
      <span
        aria-hidden="true"
        className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive md:size-16"
      >
        <TriangleAlert className="size-6 md:size-7" />
      </span>
      <h1
        ref={titleRef}
        tabIndex={-1}
        data-testid="consult-outcome-title"
        className="text-h2 font-bold text-bora-ink outline-none"
      >
        상담 신청이 접수되지 않았습니다
      </h1>
      <p role="alert" className="max-w-sm text-body text-bora-ink-3">
        일시적인 오류로 접수가 완료되지 않았습니다. 입력하신 내용은 다시 입력하지 않아도 됩니다.
      </p>

      <dl
        data-testid="consult-failure-summary"
        className={`mt-[5px] md:mt-[26px] ${SUMMARY_CARD_CLASS}`}
      >
        <SummaryRow label="상담 방식" value={CHANNEL_LABEL[channel]} />
        <SummaryRow label="연락처" value={contact} />
        {channel === "phone" && preferredCallTime ? (
          <SummaryRow label="연락 희망 시간" value={preferredCallTime} />
        ) : null}
        <SummaryRow label="입력 내용" value="유지됨" />
      </dl>

      <div className="mt-[78px] flex w-full flex-col items-center gap-2 md:mt-[72px] md:w-auto">
        <div className="flex w-full flex-col items-center gap-2 md:w-auto md:flex-row md:justify-center">
          <Button
            type="button"
            data-testid="consult-failure-retry"
            variant="diagnosis"
            className="h-12 w-full px-5 md:w-auto"
            aria-disabled={isRetrying}
            aria-busy={isRetrying}
            onClick={() => {
              if (!isRetrying) {
                onRetry();
              }
            }}
          >
            다시 시도하기
          </Button>
          <Link
            href="/result"
            data-testid="consult-failure-back-cta"
            className="w-full rounded-full border border-app-line bg-app-surface px-5 py-3.5 text-center text-body-s font-semibold text-bora-ink-2 transition-colors hover:bg-app-surface-sub md:w-auto"
          >
            이전 화면으로 돌아가기
          </Link>
        </div>
        <p className="mt-1 text-label-s text-bora-ink-4">
          다시 시도해도 접수되지 않으면 카카오톡 상담으로 문의해 주세요
        </p>
      </div>
    </div>
  );
}
