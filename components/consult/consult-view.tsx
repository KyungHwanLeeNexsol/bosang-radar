"use client";

import * as React from "react";
import Link from "next/link";

import { readDiagnosisHandoff } from "@/lib/diagnosis/handoff";
import { computeAggregate } from "@/lib/diagnosis/aggregate";
import { readConsultationDraft, writeConsultationDraft } from "@/lib/consult/draft";
import { CONSULTATION_DRAFT_VERSION } from "@/lib/consult/types";
import type { ConsultationChannel, ConsultationRequest } from "@/lib/consult/types";
import { CONSENT_POLICY_VERSION } from "@/lib/consult/consent-policy";
import { ConsultSummaryCard } from "./consult-summary-card";
import { ConsultChannelSelector } from "./consult-channel-selector";
import { ConsultForm } from "./consult-form";
import { ConsultConsentGroup } from "./consult-consent-group";
import { ConsultSubmitBar } from "./consult-submit-bar";

// SPEC-B2C-CONSULT-001 M4 — M3의 최소 placeholder를 전면 교체한다. 마운트
// 시 readDiagnosisHandoff()(design.md §2.2) 3갈래 분기(empty/invalid/valid)
// + readConsultationDraft()(§2.3, 항상 유효한 draft 반환)를 조회해, valid일
// 때만 실제 폼(요약 카드+채널 선택+입력 폼+동의+제출)을 렌더링한다.
//
// empty/invalid 상태의 실제 전용 컴포넌트(consult-no-data.tsx/
// consult-error.tsx)는 plan.md §F 5번(Milestone 5)의 파일 목록이다 — 이
// milestone은 M3가 남긴 placeholder와 동일한 방식으로, 마운트 로직이
// 테스트 가능하도록 최소 인라인 렌더링만 두고 M5가 이를 전용 컴포넌트로
// 교체하도록 남겨 둔다.
//
// 02(result-view.tsx)가 이미 확립한 관례와 동일하게, readDiagnosisHandoff()/
// readConsultationDraft()를 렌더 본문에서 직접 호출한다(SSR 가드가 있어
// 서버에서는 안전한 기본값을 반환하고, hydration 시 실제 값으로 재조정된다
// — 이 프로젝트의 기존 관례를 그대로 따른다).

interface ConsultViewProps {
  isPolicyReady?: boolean;
}

// design.md §3 "정책 기본값" — CTA가 전달한 ?channel= 쿼리를 읽어 초기
// 채널을 결정한다(REQ-B2CCONSULT-004). next/navigation의 useSearchParams()
// 대신 window.location.search를 직접 읽는다 — app/consult/page.tsx는 이미
// 확립된 03 라우트 셸 관례상 App Router 컨텍스트 없는 순수 렌더 테스트로도
// 검증되므로(app/consult/page.test.tsx, M3), 이 컴포넌트가 useSearchParams
// 훅에 의존하면 그 기존 테스트가 라우터 컨텍스트 부재로 깨진다(Enforce
// Simplicity — 이미 있는 SSR 가드 패턴을 재사용해 이 의존성 자체를
// 없앤다). SSR 환경에서는 항상 "kakao"로 안전하게 폴백한다.
function resolveInitialChannel(): ConsultationChannel {
  if (typeof window === "undefined") {
    return "kakao";
  }
  const raw = new URLSearchParams(window.location.search).get("channel");
  return raw === "kakao" || raw === "phone" ? raw : "kakao";
}

interface ConsultFormState {
  channel: ConsultationChannel;
  name: string;
  contact: string;
  preferredCallTime: string;
  marketingConsent: boolean;
  idempotencyKey: string;
}

export function ConsultView({ isPolicyReady = false }: ConsultViewProps) {
  const handoff = readDiagnosisHandoff();

  const [formState, setFormState] = React.useState<ConsultFormState>(() => {
    const draft = readConsultationDraft();
    return {
      channel: draft.channel ?? resolveInitialChannel(),
      name: draft.name ?? "",
      contact: draft.contactRaw ?? "",
      preferredCallTime: draft.preferredCallTime ?? "",
      marketingConsent: draft.marketingConsent ?? false,
      idempotencyKey:
        draft.idempotencyKey ?? (typeof window !== "undefined" ? crypto.randomUUID() : ""),
    };
  });
  // 필수 동의 두 항목은 draft에서 절대 복원하지 않는다 — 새로고침 후에도
  // 매번 다시 명시적으로 체크해야 한다(동의 재확인 원칙, design.md §2.3).
  const [piiCollection, setPiiCollection] = React.useState(false);
  const [healthInfoUse, setHealthInfoUse] = React.useState(false);

  const persistDraft = React.useCallback((next: ConsultFormState) => {
    writeConsultationDraft({
      draftVersion: CONSULTATION_DRAFT_VERSION,
      channel: next.channel,
      name: next.name,
      contactRaw: next.contact,
      preferredCallTime: next.preferredCallTime,
      marketingConsent: next.marketingConsent,
      idempotencyKey: next.idempotencyKey,
    });
  }, []);

  const didInitDraftRef = React.useRef(false);
  React.useEffect(() => {
    // design.md §2.3 — idempotencyKey는 폼 마운트 시 1회 생성되어 draft에
    // 저장된다(실패 후 재시도에도 같은 키를 재사용). 여기서 마운트 시점의
    // 전체 초기 상태를 1회 draft에 기록해 새로고침 전에도 키가 보존되게
    // 한다.
    if (didInitDraftRef.current) {
      return;
    }
    didInitDraftRef.current = true;
    persistDraft(formState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateField<K extends keyof ConsultFormState>(key: K, value: ConsultFormState[K]) {
    setFormState((prev) => ({ ...prev, [key]: value }));
  }

  function handleBlurPersist() {
    persistDraft(formState);
  }

  function handleChannelChange(channel: ConsultationChannel) {
    const next = { ...formState, channel };
    setFormState(next);
    persistDraft(next);
  }

  function handleMarketingChange(checked: boolean) {
    const next = { ...formState, marketingConsent: checked };
    setFormState(next);
    persistDraft(next);
  }

  async function handleSubmitStub(): Promise<void> {
    // M5가 실제 POST /api/consultations fetch 호출 + 성공/중복/실패 응답
    // 분기로 이 스텁을 교체한다. 지금은 consult-submit-bar.tsx의 이중 제출
    // 방지 메커니즘만 검증 가능하도록 하는 최소 스텁이다(Enforce
    // Simplicity — M5의 실제 네트워크/라우팅 로직을 여기서 미리 구현하지
    // 않는다).
    const request: ConsultationRequest = {
      resultId: handoff.status === "valid" ? handoff.result.resultId : "",
      channel: formState.channel,
      name: formState.name,
      contact: formState.contact,
      preferredCallTime: formState.preferredCallTime || undefined,
      consent: { piiCollection: true, healthInfoUse: true, marketing: formState.marketingConsent },
      acknowledgedConsentVersion: CONSENT_POLICY_VERSION,
      idempotencyKey: formState.idempotencyKey,
    };
    console.info("[consult] submit stub (M5가 실제 fetch로 교체)", {
      channel: request.channel,
    });
  }

  if (handoff.status === "empty") {
    return (
      <div
        data-testid="consult-no-data"
        className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center"
      >
        <h1 className="text-h2 font-semibold text-bora-ink">먼저 진단 결과가 필요합니다</h1>
        <p className="max-w-sm text-body text-bora-ink-3">
          상담 신청을 위해서는 먼저 보상 가능성 진단을 완료해 주세요.
        </p>
        <Link
          href="/"
          className="mt-2 rounded-full bg-bora-accent px-5 py-2.5 text-body-s font-semibold text-white hover:bg-bora-accent-deep"
        >
          진단 시작하기
        </Link>
      </div>
    );
  }

  if (handoff.status === "invalid") {
    return (
      <div
        data-testid="consult-error"
        className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center"
      >
        <h1 className="text-h2 font-semibold text-bora-ink">진단 결과를 불러올 수 없어요</h1>
        <p className="max-w-sm text-body text-bora-ink-3">
          일시적인 오류로 진단 결과를 확인하지 못했습니다. 처음부터 다시 진단해 주세요.
        </p>
        <Link
          href="/"
          className="mt-2 rounded-full bg-bora-accent px-5 py-2.5 text-body-s font-semibold text-white hover:bg-bora-accent-deep"
        >
          진단 시작하기
        </Link>
      </div>
    );
  }

  const aggregate = computeAggregate(handoff.result.items);
  const canSubmit = piiCollection && healthInfoUse;

  return (
    <div data-testid="consult-view" className="mx-auto flex w-full max-w-[720px] flex-col gap-5 px-4 py-8">
      <ConsultSummaryCard title={handoff.result.inputSummary.title} aggregate={aggregate} />

      <ConsultChannelSelector value={formState.channel} onChange={handleChannelChange} />

      <ConsultForm
        channel={formState.channel}
        name={formState.name}
        onNameChange={(value) => updateField("name", value)}
        onNameBlur={handleBlurPersist}
        contact={formState.contact}
        onContactChange={(value) => updateField("contact", value)}
        onContactBlur={handleBlurPersist}
        preferredCallTime={formState.preferredCallTime}
        onPreferredCallTimeChange={(value) => updateField("preferredCallTime", value)}
        onPreferredCallTimeBlur={handleBlurPersist}
      />

      <ConsultConsentGroup
        piiCollection={piiCollection}
        healthInfoUse={healthInfoUse}
        marketing={formState.marketingConsent}
        onPiiCollectionChange={setPiiCollection}
        onHealthInfoUseChange={setHealthInfoUse}
        onMarketingChange={handleMarketingChange}
        isPolicyReady={isPolicyReady}
      />

      <ConsultSubmitBar canSubmit={canSubmit} channel={formState.channel} onSubmit={handleSubmitStub} />
    </div>
  );
}
