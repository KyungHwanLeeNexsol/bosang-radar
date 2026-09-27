"use client";

import * as React from "react";

import { readDiagnosisHandoff } from "@/lib/diagnosis/handoff";
import { computeAggregate } from "@/lib/diagnosis/aggregate";
import {
  clearConsultationDraft,
  readConsultationDraft,
  writeConsultationDraft,
} from "@/lib/consult/draft";
import { CONSULTATION_DRAFT_VERSION } from "@/lib/consult/types";
import type {
  ConsultationChannel,
  ConsultationRequest,
  ConsultationSubmitResult,
} from "@/lib/consult/types";
import { CONSENT_POLICY_VERSION } from "@/lib/consult/consent-policy";
import { ConsultSummaryCard } from "./consult-summary-card";
import { ConsultChannelSelector } from "./consult-channel-selector";
import { ConsultForm } from "./consult-form";
import { ConsultConsentGroup } from "./consult-consent-group";
import { ConsultSubmitBar } from "./consult-submit-bar";
import { ConsultNoData } from "./consult-no-data";
import { ConsultError } from "./consult-error";
import { ConsultSuccess } from "./consult-success";
import { ConsultDuplicate } from "./consult-duplicate";
import { ConsultFailure } from "./consult-failure";

// SPEC-B2C-CONSULT-001 M4/M5 — M3의 최소 placeholder를 전면 교체한다.
// 마운트 시 readDiagnosisHandoff()(design.md §2.2) 3갈래 분기(empty/invalid/
// valid) + readConsultationDraft()(§2.3, 항상 유효한 draft 반환)를 조회해,
// valid일 때만 실제 폼(요약 카드+채널 선택+입력 폼+동의+제출)을 렌더링한다.
// M5는 empty/invalid 상태를 전용 컴포넌트(consult-no-data.tsx/
// consult-error.tsx)로 교체하고, 실제 POST /api/consultations 제출 +
// 응답 3갈래(success/duplicate/error) 라우팅을 연결한다(design.md §9.1,
// acceptance AC-B2CCONSULT-018/020/022).
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

// M5 — POST /api/consultations 응답이 실제로 ConsultationSubmitResult
// 형태인지 최소한으로 확인한다(discriminant 필드만 검증) — 타입이 이미
// 나머지 필드 형태를 컴파일 타임에 보장하는 자체 서버 응답이므로, 전체
// zod 스키마를 새로 정의하지 않는다(Enforce Simplicity — lib/consult/
// schema.ts는 이 milestone의 PRESERVE 대상이라 수정하지 않는다). status가
// 세 값 중 하나가 아니면 예상치 못한 응답으로 간주해 null을 반환하고,
// 호출부가 03-D 실패로 처리한다.
function parseSubmitResult(data: unknown): ConsultationSubmitResult | null {
  if (typeof data !== "object" || data === null || !("status" in data)) {
    return null;
  }
  const status = (data as { status?: unknown }).status;
  if (status === "success" || status === "duplicate" || status === "error") {
    return data as ConsultationSubmitResult;
  }
  return null;
}

type ConsultSubmitView =
  | { kind: "form" }
  | { kind: "success"; result: Extract<ConsultationSubmitResult, { status: "success" }> }
  | { kind: "duplicate"; result: Extract<ConsultationSubmitResult, { status: "duplicate" }> }
  | { kind: "failure" };

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

  // M5 — 폼 마운트 시점(첫 렌더)의 resultId를 캡처한다. useRef의 초기값
  // 인자는 오직 첫 렌더에서만 실제로 쓰이므로, 이 한 줄이 곧 "마운트 시
  // 1회 캡처"다(useEffect 불필요, Enforce Simplicity). 제출 직전
  // readDiagnosisHandoff()를 다시 호출해 이 값과 비교하면 handoff_mismatch를
  // 판정할 수 있다(design.md §9.1, AC-B2CCONSULT-018 handoff_mismatch
  // 시나리오) — 다른 탭에서 새 진단을 시작해 핸드오프가 교체된 경우
  // 서버를 호출하지 않고 즉시 03-D로 판정한다.
  const mountResultIdRef = React.useRef<string | null>(
    handoff.status === "valid" ? handoff.result.resultId : null
  );

  const [submitView, setSubmitView] = React.useState<ConsultSubmitView>({ kind: "form" });
  const [isRetrying, setIsRetrying] = React.useState(false);

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

  // M5 — 실제 제출 핸들러(design.md §9.1). 순서: (1) 제출 직전
  // readDiagnosisHandoff()를 재조회해 mountResultIdRef와 비교 — 다르면
  // 서버를 호출하지 않고 즉시 handoff_mismatch로 03-D 처리한다(REQ-
  // B2CCONSULT-018 handoff_mismatch 시나리오). (2) 일치하면 POST
  // /api/consultations를 호출하고 응답을 status로 3갈래 분기한다 —
  // success는 clearConsultationDraft() 호출 후 03-B, duplicate는 draft를
  // 건드리지 않고 03-C(design.md §2.2 — draft는 "제출 성공" 시에만
  // 제거되며 duplicate는 신규 성공 제출이 아니다), error(어떤 code든)와
  // fetch 예외/비정상 응답은 모두 동일하게 03-D로 수렴한다(acceptance
  // AC-B2CCONSULT-022 — 03-D는 code별로 문구를 분기하지 않는 일반 실패
  // 화면이다).
  async function handleSubmit(): Promise<void> {
    const freshHandoff = readDiagnosisHandoff();
    const freshResultId = freshHandoff.status === "valid" ? freshHandoff.result.resultId : null;
    if (freshResultId !== mountResultIdRef.current) {
      setSubmitView({ kind: "failure" });
      return;
    }

    const request: ConsultationRequest = {
      resultId: mountResultIdRef.current ?? "",
      channel: formState.channel,
      name: formState.name,
      contact: formState.contact,
      preferredCallTime: formState.preferredCallTime || undefined,
      consent: { piiCollection: true, healthInfoUse: true, marketing: formState.marketingConsent },
      acknowledgedConsentVersion: CONSENT_POLICY_VERSION,
      idempotencyKey: formState.idempotencyKey,
    };

    let result: ConsultationSubmitResult | null;
    try {
      const response = await fetch("/api/consultations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      result = parseSubmitResult(await response.json());
    } catch {
      setSubmitView({ kind: "failure" });
      return;
    }

    if (!result) {
      setSubmitView({ kind: "failure" });
      return;
    }

    if (result.status === "success") {
      // REQ-B2CCONSULT-025/design.md §2.2 — draft만 지운다. 진단 결과
      // 핸드오프(DiagnosisResult)는 절대 건드리지 않는다 — 성공/중복/실패
      // 화면 모두 "진단 결과로 돌아가기"가 제출 전과 동일한 결과를 다시
      // 보여줘야 한다.
      clearConsultationDraft();
      setSubmitView({ kind: "success", result });
      return;
    }
    if (result.status === "duplicate") {
      setSubmitView({ kind: "duplicate", result });
      return;
    }
    setSubmitView({ kind: "failure" });
  }

  async function handleRetry(): Promise<void> {
    if (isRetrying) {
      return;
    }
    setIsRetrying(true);
    try {
      // idempotencyKey는 formState에 이미 저장된 값을 그대로 재사용한다
      // (handleSubmit이 formState.idempotencyKey를 읽을 뿐 새로 생성하지
      // 않음) — 새 crypto.randomUUID() 호출 지점이 이 함수 어디에도 없다.
      await handleSubmit();
    } finally {
      setIsRetrying(false);
    }
  }

  if (handoff.status === "empty") {
    return <ConsultNoData />;
  }

  if (handoff.status === "invalid") {
    return <ConsultError />;
  }

  if (submitView.kind === "success") {
    return (
      <ConsultSuccess
        channel={submitView.result.channel}
        maskedContact={submitView.result.maskedContact}
        preferredCallTime={submitView.result.preferredCallTime}
      />
    );
  }

  if (submitView.kind === "duplicate") {
    return (
      <ConsultDuplicate
        channel={formState.channel}
        maskedContact={submitView.result.maskedContact}
        receivedAt={submitView.result.receivedAt}
        applicationStatus={submitView.result.applicationStatus}
      />
    );
  }

  if (submitView.kind === "failure") {
    return (
      <ConsultFailure
        channel={formState.channel}
        name={formState.name}
        contact={formState.contact}
        preferredCallTime={formState.preferredCallTime}
        isRetrying={isRetrying}
        onRetry={handleRetry}
      />
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

      <ConsultSubmitBar canSubmit={canSubmit} channel={formState.channel} onSubmit={handleSubmit} />
    </div>
  );
}
