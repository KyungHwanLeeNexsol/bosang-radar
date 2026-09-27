"use client";

import * as React from "react";
import { MessageCircle, Phone } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ConsultationChannel } from "@/lib/consult/types";

// SPEC-B2C-CONSULT-001 M4 (design.md §2, §3, §11; design/exports/03-*.png) —
// 카카오톡/전화 상담 채널 라디오 선택. 네이티브 <input type="radio">를 같은
// name으로 그룹화해 방향키 탐색을 브라우저 기본 동작에 위임한다(design.md
// §11 "라디오는 방향키" — 커스텀 키보드 핸들러를 작성하지 않는다,
// Enforce Simplicity).

const RADIO_GROUP_NAME = "consult-channel";

interface ChannelOption {
  value: ConsultationChannel;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
}

const CHANNEL_OPTIONS: ChannelOption[] = [
  { value: "kakao", icon: MessageCircle, label: "카카오톡 상담", description: "편한 시간에 답변을 확인하세요" },
  { value: "phone", icon: Phone, label: "전화 상담", description: "10분이면 충분합니다" },
];

// design.md §1 D6 — 전화 채널 안내는 "영업일 기준 1일 이내에…"처럼 구체적
// 시간을 약속하지 않는다(운영 SLA 미확정). 03-B 성공 화면과 동일한 중립
// 표현을 이 배너에도 그대로 적용한다(acceptance.md §12 semanticChecks가
// 이 화면에서도 같은 문구를 요구한다).
const CHANNEL_NOTICE: Record<ConsultationChannel, string> = {
  kakao: "입력하신 번호의 카카오톡으로 상담 내용을 안내합니다",
  phone: "접수 내용을 확인한 뒤 선택하신 방법으로 연락드리겠습니다",
};

interface ConsultChannelSelectorProps {
  value: ConsultationChannel;
  onChange: (channel: ConsultationChannel) => void;
}

export function ConsultChannelSelector({ value, onChange }: ConsultChannelSelectorProps) {
  return (
    <div data-testid="consult-channel-selector">
      <h2 className="text-h3 font-bold text-bora-ink">어떻게 상담받으시겠어요?</h2>
      <div role="radiogroup" aria-label="상담 채널 선택" className="mt-3 grid grid-cols-2 gap-3">
        {CHANNEL_OPTIONS.map(({ value: optionValue, icon: Icon, label, description }) => {
          const checked = value === optionValue;
          return (
            <label
              key={optionValue}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-3 rounded-[12px] border p-3.5 transition-colors",
                checked
                  ? "border-bora-accent-line bg-bora-accent-soft"
                  : "border-app-line hover:bg-app-surface-sub"
              )}
            >
              <span className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-[10px]",
                    checked ? "bg-bora-accent text-white" : "bg-app-surface-inset text-bora-ink-3"
                  )}
                >
                  <Icon className="size-4.5" />
                </span>
                <span className="flex flex-col">
                  <span className="text-sm font-semibold text-bora-ink">{label}</span>
                  <span className="text-label-s text-bora-ink-3">{description}</span>
                </span>
              </span>
              <input
                type="radio"
                name={RADIO_GROUP_NAME}
                value={optionValue}
                checked={checked}
                onChange={() => onChange(optionValue)}
                className="size-4 shrink-0 accent-bora-accent"
              />
            </label>
          );
        })}
      </div>
      <p
        role="status"
        aria-live="polite"
        className="mt-2.5 rounded-[8px] bg-bora-accent-soft px-3.5 py-2.5 text-label-s font-medium text-bora-accent-deep"
      >
        {CHANNEL_NOTICE[value]}
      </p>
    </div>
  );
}
