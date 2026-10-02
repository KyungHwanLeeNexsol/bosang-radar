"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ConsultationChannel } from "@/lib/consult/types";

// SPEC-B2C-CONSULT-001 M4 (design.md §5, §6; design/exports/03-*.png,
// 03-A2-*.png; acceptance AC-B2CCONSULT-010) — 이름/연락처/연락 희망 시간
// 입력 폼. 연락처 라벨과 연락 희망 시간의 필수/선택 여부는 channel prop에
// 따라 달라지며, ConsultationRequestSchema의 .refine(channel==="phone"일
// 때만 필수)과 정확히 일치해야 한다 — UI 레벨 required 표시가 스키마 규칙과
// 어긋나면 안 된다.

interface ConsultFormErrors {
  name?: string;
  contact?: string;
  preferredCallTime?: string;
}

interface ConsultFormProps {
  channel: ConsultationChannel;
  name: string;
  onNameChange: (value: string) => void;
  onNameBlur: () => void;
  contact: string;
  onContactChange: (value: string) => void;
  onContactBlur: () => void;
  preferredCallTime: string;
  onPreferredCallTimeChange: (value: string) => void;
  onPreferredCallTimeBlur: () => void;
  errors?: ConsultFormErrors;
}

const NAME_HINT_ID = "consult-name-hint";
const NAME_ERROR_ID = "consult-name-error";
const CONTACT_ERROR_ID = "consult-contact-error";
const PREFERRED_CALL_TIME_ERROR_ID = "consult-preferred-call-time-error";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-meta font-medium text-destructive">
      {message}
    </p>
  );
}

export function ConsultForm({
  channel,
  name,
  onNameChange,
  onNameBlur,
  contact,
  onContactChange,
  onContactBlur,
  preferredCallTime,
  onPreferredCallTimeChange,
  onPreferredCallTimeBlur,
  errors,
}: ConsultFormProps) {
  const isPhone = channel === "phone";
  const contactLabel = isPhone ? "통화 가능한 전화번호" : "카카오톡 연락에 사용할 휴대폰 번호";

  return (
    // 모바일에서 채널 안내(consult-channel-selector.tsx의 role=status)와 겹치지
    // 않도록 음수 상단 마진을 두지 않는다 — 폼은 부모(consult-view.tsx)의
    // gap-5 간격만큼만 안내 아래에서 시작한다. 예전 -mt-[62px]은 디자인
    // 목업(안내 배너 없음)의 폼 top에 맞추려고 폼을 안내 위로 끌어올려
    // 안내가 이름 라벨·입력을 덮었다(e2e/consult-flow-03.spec.ts가 검증).
    <div data-testid="consult-form" className="grid gap-9 md:grid-cols-2 md:gap-6">
      <div>
        {/* .pen 03 / 03-A2 / M03 — 라벨 줄 오른쪽 힌트 "상담 시 호칭". .pen은 연락처 필드에도 같은
            힌트를 붙였지만 연락처는 호칭이 아니라 복사 오류로 보고 이름 필드에만 적용한다. */}
        <div className="flex items-baseline justify-between">
          <Label htmlFor="consult-name-input">이름 *</Label>
          <span
            id={NAME_HINT_ID}
            data-testid="consult-name-hint"
            className="text-label-s text-bora-ink-4"
          >
            상담 시 호칭
          </span>
        </div>
        <Input
          id="consult-name-input"
          data-testid="consult-name-input"
          className="mt-2 h-14 md:mt-1.5 md:h-11"
          value={name}
          maxLength={20}
          onChange={(event) => onNameChange(event.target.value)}
          onBlur={onNameBlur}
          aria-invalid={errors?.name ? true : undefined}
          aria-describedby={errors?.name ? `${NAME_HINT_ID} ${NAME_ERROR_ID}` : NAME_HINT_ID}
        />
        <FieldError id={NAME_ERROR_ID} message={errors?.name} />
      </div>

      <div>
        <Label htmlFor="consult-contact-input">{contactLabel} *</Label>
        <Input
          id="consult-contact-input"
          data-testid="consult-contact-input"
          className="mt-2 h-14 md:mt-1.5 md:h-11"
          value={contact}
          placeholder="010-0000-0000"
          onChange={(event) => onContactChange(event.target.value)}
          onBlur={onContactBlur}
          aria-invalid={errors?.contact ? true : undefined}
          aria-describedby={errors?.contact ? CONTACT_ERROR_ID : undefined}
        />
        <FieldError id={CONTACT_ERROR_ID} message={errors?.contact} />
      </div>

      <div className="md:col-span-2">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="consult-preferred-call-time-input">
            연락 희망 시간{isPhone ? " *" : ""}
          </Label>
          <span className="text-label-s text-bora-ink-4">
            {isPhone ? "전화 상담은 필수" : "선택"}
          </span>
        </div>
        <Input
          id="consult-preferred-call-time-input"
          data-testid="consult-preferred-call-time-input"
          className="mt-2 h-14 md:mt-1.5 md:h-11"
          value={preferredCallTime}
          placeholder="평일 오후 (13시 ~ 18시)"
          onChange={(event) => onPreferredCallTimeChange(event.target.value)}
          onBlur={onPreferredCallTimeBlur}
          aria-required={isPhone ? true : undefined}
          aria-invalid={errors?.preferredCallTime ? true : undefined}
          aria-describedby={errors?.preferredCallTime ? PREFERRED_CALL_TIME_ERROR_ID : undefined}
        />
        <FieldError id={PREFERRED_CALL_TIME_ERROR_ID} message={errors?.preferredCallTime} />
      </div>
    </div>
  );
}
