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
  {
    value: "kakao",
    icon: MessageCircle,
    label: "카카오톡 상담",
    description: "편한 시간에 답변을 확인하세요",
  },
  { value: "phone", icon: Phone, label: "전화 상담", description: "10분이면 충분합니다" },
];

// [.pen 최우선 지시 반영] 안내 박스는 .pen 03(카카오) / 03-A2(전화) 문구와 아이콘을 그대로 쓴다.
// 전화 채널의 "영업일 기준 1일 이내에…"는 design.md §1 D6이 금지했던 구체적 시간 약속이지만,
// 사용자가 .pen 문구를 최우선으로 정했다. 운영이 이 약속을 지킬 수 있는지는 런북 §11.3의
// 활성화 전 점검 항목이다(03-B 성공 화면 부제와 같은 약속이다).
const CHANNEL_NOTICE: Record<
  ConsultationChannel,
  { icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>; text: string }
> = {
  kakao: { icon: MessageCircle, text: "입력하신 번호의 카카오톡으로 상담 내용을 안내합니다" },
  phone: { icon: Phone, text: "영업일 기준 1일 이내에 입력하신 번호로 전화드립니다" },
};

interface ConsultChannelSelectorProps {
  value: ConsultationChannel;
  onChange: (channel: ConsultationChannel) => void;
}

export function ConsultChannelSelector({ value, onChange }: ConsultChannelSelectorProps) {
  const { icon: NoticeIcon, text: noticeText } = CHANNEL_NOTICE[value];
  return (
    <div data-testid="consult-channel-selector" className="mt-0 md:mt-0">
      <h2 className="text-h3 font-bold text-bora-ink">어떻게 상담받으시겠어요?</h2>
      <div
        role="radiogroup"
        aria-label="상담 채널 선택"
        className="mt-3.5 grid grid-cols-1 gap-4 md:mt-4 md:grid-cols-2 md:gap-3"
      >
        {CHANNEL_OPTIONS.map(({ value: optionValue, icon: Icon, label, description }) => {
          const checked = value === optionValue;
          return (
            <label
              key={optionValue}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-3 rounded-[12px] border px-5 py-3.75 transition-colors md:p-6",
                checked
                  ? "border-bora-accent-line bg-bora-accent-soft"
                  : "border-app-line hover:bg-app-surface-sub"
              )}
            >
              <span className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-[10px] md:size-10",
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
        data-testid="consult-channel-notice"
        role="status"
        aria-live="polite"
        className="mt-2.5 flex items-center gap-2 rounded-[9px] bg-bora-050 px-3.5 py-3 text-[12.5px] font-semibold text-bora-accent-deep md:mt-3"
      >
        <NoticeIcon aria-hidden={true} className="size-3.5 shrink-0 text-bora-accent" />
        {noticeText}
      </p>
    </div>
  );
}
