"use client";

import * as React from "react";
import type { ZodError } from "zod";

import { readDiagnosisHandoff, type DiagnosisHandoffReadResult } from "@/lib/diagnosis/handoff";
import { computeAggregate } from "@/lib/diagnosis/aggregate";
import {
  clearConsultationDraft,
  readConsultationDraft,
  writeConsultationDraft,
} from "@/lib/consult/draft";
import { ConsultationRequestSchema } from "@/lib/consult/schema";
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
import { ConsultExpertCard } from "./consult-expert-card";
import { ConsultFooter } from "./consult-footer";
import { ConsultConsentGroup } from "./consult-consent-group";
import { ConsultSubmitBar } from "./consult-submit-bar";
import { ConsultNoData } from "./consult-no-data";
import { ConsultError } from "./consult-error";
import { ConsultSuccess } from "./consult-success";
import { ConsultDuplicate } from "./consult-duplicate";
import { ConsultFailure, type ConsultFailureReason } from "./consult-failure";
import { ConsultHeader } from "./consult-header";

// SPEC-B2C-CONSULT-001 M4/M5 — M3의 최소 placeholder를 전면 교체한다.
// 마운트 시 readDiagnosisHandoff()(design.md §2.2) 3갈래 분기(empty/invalid/
// valid) + readConsultationDraft()(§2.3, 항상 유효한 draft 반환)를 조회해,
// valid일 때만 실제 폼(요약 카드+채널 선택+입력 폼+동의+제출)을 렌더링한다.
// M5는 empty/invalid 상태를 전용 컴포넌트(consult-no-data.tsx/
// consult-error.tsx)로 교체하고, 실제 POST /api/consultations 제출 +
// 응답 3갈래(success/duplicate/error) 라우팅을 연결한다(design.md §9.1,
// acceptance AC-B2CCONSULT-018/020/022).
//
// [hydration 불일치 수정 — React error #418] 브라우저 전용 상태(sessionStorage
// 의 handoff·draft, window.location.search의 ?channel=, 무작위 idempotencyKey)를
// 렌더 본문이나 useState 지연 초기화에서 직접 읽으면 서버 HTML(window 없음 →
// handoff "empty" → no-data 안내)과 클라이언트 첫 렌더(실제 값 → 폼)의 텍스트
// 콘텐츠가 달라진다. 이전 주석은 hydration이 "실제 값으로 재조정된다"고
// 적었으나 텍스트 콘텐츠 불일치는 재조정되지 않고 #418 오류를 낸다. 그래서
// 02(result-view.tsx)와 동일하게 useSyncExternalStore로 handoff를 읽는다:
// 서버 스냅샷과 hydration 렌더는 항상 "loading"(빈 컨테이너)이고, 그 뒤
// 클라이언트에서만 실제 handoff로 전환한다. 브라우저 전용 값을 읽는 모든
// 로직(draft·URL 채널·idempotencyKey 지연 초기화)은 이 전환 이후에만
// 마운트되는 ConsultViewBody 안에 두어, 서버 HTML과 어긋날 수 없게 한다.

interface ConsultViewProps {
  isPolicyReady?: boolean;
}

// 서버/hydration 렌더용 "loading" 상태를 실제 handoff 판별 유니언에 더한다.
type ConsultHandoffSnapshot = { status: "loading" } | DiagnosisHandoffReadResult;

// 서버/hydration 스냅샷은 호출마다 새 객체를 만들지 않고 이 모듈 수준의 고정
// 불변 객체를 반환한다. useSyncExternalStore는 같은 상태에서 안정된(동일 참조)
// 스냅샷을 기대하므로 참조가 바뀌지 않게 둔다. (이 변경은 #418의 원인 수정이
// 아니라 스냅샷 참조 안정성 확보다.)
const LOADING_SNAPSHOT = Object.freeze({ status: "loading" } as const);

function getServerSnapshot(): ConsultHandoffSnapshot {
  return LOADING_SNAPSHOT;
}

// sessionStorage를 마운트 시 1회 읽는다(이 컴포넌트는 handoff를 절대 지우지
// 않는다 — REQ-B2CRESULT-016). SSR·hydration에서는 항상 "loading"을 반환하고
// (getServerSnapshot), 클라이언트에서는 최초 1회만 계산해 ref에 캐시한다.
// subscribe는 갱신을 구독하지 않는 no-op — 이 값은 마운트 동안 불변이다(제출
// 시점의 변조 검사는 handleSubmit이 readDiagnosisHandoff()를 다시 호출해
// 수행한다). useEffect 안의 동기 setState 대신 이 패턴을 쓰는 이유는
// react-hooks/set-state-in-effect 권고(계단식 리렌더 방지)를 따르기 위함이며,
// result-view.tsx의 useDiagnosisHandoffState와 동일하다.
function useConsultHandoffSnapshot(): ConsultHandoffSnapshot {
  const snapshotRef = React.useRef<DiagnosisHandoffReadResult | null>(null);

  const getSnapshot = React.useCallback((): ConsultHandoffSnapshot => {
    if (snapshotRef.current === null) {
      snapshotRef.current = readDiagnosisHandoff();
    }
    return snapshotRef.current;
  }, []);

  const subscribe = React.useCallback(() => () => {}, []);

  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
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

interface ConsultViewFormErrors {
  name?: string;
  contact?: string;
  preferredCallTime?: string;
}

// M6 (design.md §11, AC-B2CCONSULT-024) — 첫 오류 필드로 포커스 이동 순서.
// consult-form.tsx가 고정 id(consult-{field}-input)로 렌더링하는 입력
// 요소를 그대로 찾는다 — ref 배선을 새로 추가하지 않는다(Enforce
// Simplicity, 기존 필드 id는 M4부터 이미 안정적이다).
const FIELD_FOCUS_ORDER: Array<keyof ConsultViewFormErrors> = [
  "name",
  "contact",
  "preferredCallTime",
];
const FIELD_INPUT_ID: Record<keyof ConsultViewFormErrors, string> = {
  name: "consult-name-input",
  contact: "consult-contact-input",
  preferredCallTime: "consult-preferred-call-time-input",
};

// zod 기본 메시지(예: name의 min(1))는 영문이라 이 화면의 한국어 UI와
// 어긋난다. schema.ts의 .refine이 만든 커스텀 메시지(code === "custom")는
// 이미 한국어이므로 그대로 쓰고, 그 외(too_small/too_big 등 기본 타입
// 검증)는 이 화면 전용 한국어 대체 문구를 쓴다 — 검증 규칙 자체는 여전히
// ConsultationRequestSchema 그대로이며(제약 D — 서버와 동일 규칙), 문구만
// 다듬는다.
const FIELD_FALLBACK_MESSAGE: Record<"name" | "contact", string> = {
  name: "이름을 입력해 주세요",
  contact: "연락처를 입력해 주세요",
};

function extractFieldErrors(error: ZodError): ConsultViewFormErrors {
  const errors: ConsultViewFormErrors = {};
  for (const issue of error.issues) {
    const rawField = issue.path[0];
    if (rawField !== "name" && rawField !== "contact" && rawField !== "preferredCallTime") {
      continue;
    }
    const field = rawField as "name" | "contact" | "preferredCallTime";
    if (errors[field]) {
      continue;
    }
    errors[field] =
      issue.code === "custom" || field === "preferredCallTime"
        ? issue.message
        : FIELD_FALLBACK_MESSAGE[field];
  }
  return errors;
}

function focusFirstInvalidField(errors: ConsultViewFormErrors): void {
  for (const key of FIELD_FOCUS_ORDER) {
    if (errors[key]) {
      document.getElementById(FIELD_INPUT_ID[key])?.focus();
      return;
    }
  }
}

type ConsultSubmitView =
  | { kind: "form" }
  | { kind: "success"; result: Extract<ConsultationSubmitResult, { status: "success" }> }
  | { kind: "duplicate"; result: Extract<ConsultationSubmitResult, { status: "duplicate" }> }
  | { kind: "failure"; reason: ConsultFailureReason };

interface ConsultViewBodyProps {
  handoff: DiagnosisHandoffReadResult;
  isPolicyReady: boolean;
}

// handoff snapshot이 "loading"을 벗어난 뒤(= 클라이언트에서만) 마운트되므로,
// 아래 useState/useRef 지연 초기화가 읽는 draft·URL 채널·randomUUID는 서버 HTML과
// 비교될 일이 없다. 기존 로직은 그대로다.
function ConsultViewBody({ handoff, isPolicyReady }: ConsultViewBodyProps) {
  // M7 발견 — lazy initializer 실행 시점에 초기 channel이 draft에서 왔는지
  // resolveInitialChannel() 폴백에서 왔는지를 기록해 둔다. 아래 마운트 후
  // 보정 effect가 "draft 복원 값은 절대 덮어쓰지 않는다"는 우선순위
  // (draft.channel ?? resolveInitialChannel())를 지키려면 이 출처 구분이
  // 필요하다 — formState.channel 값만으로는 두 경우가 우연히 같은 값
  // ("kakao")일 수 있어 사후에 구분할 수 없다. readConsultationDraft()는
  // sessionStorage를 읽기만 하는 순수 함수라 여기서 한 번 더 호출해도
  // 안전하다 — useRef의 초기값 인자로 전달할 뿐, 렌더 중 `.current`를
  // 쓰지는 않는다(react-hooks/refs 위반 없음).
  const initialChannelFromDraftRef = React.useRef(readConsultationDraft().channel != null);

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

  // M7 발견 — Next.js <Link> 클라이언트 사이드 전환 직후 첫 렌더 시점에는
  // 브라우저 location이 아직 새 URL로 완전히 안정되지 않을 수 있어(경성
  // 내비게이션에서는 재현되지 않음), 위 lazy initializer 안의
  // resolveInitialChannel() 호출이 오래된 값을 읽는 경우가 있다. 커밋 이후
  // 실행되는(location이 안정된 시점) 이 effect에서 한 번 더 읽어 보정한다 —
  // draft에서 channel을 복원한 경우는 건드리지 않는다(draft 우선순위 유지).
  React.useEffect(() => {
    if (initialChannelFromDraftRef.current) {
      return;
    }
    const settledChannel = resolveInitialChannel();
    setFormState((prev) =>
      prev.channel === settledChannel ? prev : { ...prev, channel: settledChannel }
    );
  }, []);

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
  const [formErrors, setFormErrors] = React.useState<ConsultViewFormErrors>({});

  // 성공/중복/실패(handoff_mismatch 포함, handleSubmit이 동일하게 "failure"로
  // 수렴시킨다) 전환은 하드 네비게이션 없는 client-side 상태 전환이라
  // 브라우저가 스크롤을 자동으로 맨 위로 되돌리지 않는다 — 모바일에서 폼을
  // 채우며 스크롤한 위치가 결과 화면까지 그대로 남는다(실측: visual-verify
  // 재현 스크립트에서 scrollY≈75). 전환마다 맨 위로 스크롤하고, 스크린
  // 리더 사용자가 새 화면임을 인지하도록 결과 제목으로 포커스를 옮긴다.
  // [HARD 재현, e2e/consult-flow-03.spec.ts 390×737 재시도 테스트로 발견]
  // 의존성을 submitView.kind(문자열 값)로 두면 재시도가 "failure"→
  // "failure"로 값이 그대로라 React가 변화 없음으로 판단해 effect가 다시
  // 실행되지 않는다(재시도 후 스크롤이 복원되지 않는 회귀). setSubmitView가
  // 매 호출마다 새 객체를 만드므로 submitView 자체(참조)를 의존성으로 써야
  // 같은 kind로의 재전환도 매번 감지된다.
  const outcomeTitleRef = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => {
    if (submitView.kind === "form") return;
    window.scrollTo(0, 0);
    outcomeTitleRef.current?.focus();
  }, [submitView]);

  // REQ-B2CCONSULT-006 정책 미준비 예외 — isPolicyReady=false에서는 제출이
  // 불가능해 draft(입력 편의·재시도 시 같은 idempotencyKey 재사용)의 존재
  // 이유가 없고, 원문 이름·연락처를 지속 저장소에 남길 근거도 없다. 마운트
  // 초기 기록·blur·채널 변경·마케팅 동의 변경 네 경로가 모두 이 함수를
  // 거치므로 여기 한 곳에서 막는다. 기존 draft는 갱신도 삭제도 하지 않으며
  // 읽기(복원)와 폼 화면 상태는 이 가드의 영향을 받지 않는다.
  const persistDraft = React.useCallback(
    (next: ConsultFormState) => {
      if (!isPolicyReady) {
        return;
      }
      writeConsultationDraft({
        draftVersion: CONSULTATION_DRAFT_VERSION,
        channel: next.channel,
        name: next.name,
        contactRaw: next.contact,
        preferredCallTime: next.preferredCallTime,
        marketingConsent: next.marketingConsent,
        idempotencyKey: next.idempotencyKey,
      });
    },
    [isPolicyReady]
  );

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
    // 다층 방어(design.md §4, AC-B2CCONSULT-005 추가 시나리오) — 정책 미준비
    // 상태에서는 제출 버튼이 렌더링되지 않아 이 함수에 UI로 도달할 수 없지만,
    // 어떤 경로로든 호출되더라도 POST를 발생시키지 않는다. 서버의 503/
    // policy_unavailable 거부와는 독립된 UX 계층의 방어선이다.
    if (!isPolicyReady) {
      return;
    }

    const freshHandoff = readDiagnosisHandoff();
    const freshResultId = freshHandoff.status === "valid" ? freshHandoff.result.resultId : null;
    if (freshResultId !== mountResultIdRef.current) {
      // 아무 요청도 보내지 않은 경로 — 03-D가 "보내지 않았음"을 안내하고
      // 재시도 버튼을 숨기도록 별도 reason을 준다.
      setSubmitView({ kind: "failure", reason: "handoff_mismatch" });
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

    // M6 (design.md §11, AC-B2CCONSULT-024) — 서버로 보내기 전에 동일한
    // ConsultationRequestSchema로 클라이언트에서도 검증한다. 실패하면
    // fetch를 호출하지 않고 오류 요약 + 필드별 오류를 표시한 뒤 첫 오류
    // 필드로 포커스를 이동시킨다.
    const validation = ConsultationRequestSchema.safeParse(request);
    if (!validation.success) {
      const fieldErrors = extractFieldErrors(validation.error);
      setFormErrors(fieldErrors);
      focusFirstInvalidField(fieldErrors);
      return;
    }
    setFormErrors({});

    let result: ConsultationSubmitResult | null;
    try {
      const response = await fetch("/api/consultations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      result = parseSubmitResult(await response.json());
    } catch {
      setSubmitView({ kind: "failure", reason: "unknown_outcome" });
      return;
    }

    if (!result) {
      setSubmitView({ kind: "failure", reason: "unknown_outcome" });
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
    setSubmitView({ kind: "failure", reason: "unknown_outcome" });
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
    return (
      <>
        <ConsultHeader variant="form" />
        <div className="flex flex-1 flex-col bg-app-bg">
          <ConsultNoData />
        </div>
      </>
    );
  }

  if (handoff.status === "invalid") {
    return (
      <>
        <ConsultHeader variant="form" />
        <div className="flex flex-1 flex-col bg-app-bg">
          <ConsultError />
        </div>
      </>
    );
  }

  if (submitView.kind === "success") {
    return (
      <>
        <ConsultHeader variant="outcome" />
        <div className="flex flex-1 flex-col bg-app-bg">
          <ConsultSuccess
            channel={submitView.result.channel}
            maskedContact={submitView.result.maskedContact}
            preferredCallTime={submitView.result.preferredCallTime}
            titleRef={outcomeTitleRef}
          />
        </div>
      </>
    );
  }

  if (submitView.kind === "duplicate") {
    return (
      <>
        <ConsultHeader variant="outcome" />
        <div className="flex flex-1 flex-col bg-app-bg">
          <ConsultDuplicate
            channel={formState.channel}
            maskedContact={submitView.result.maskedContact}
            receivedAt={submitView.result.receivedAt}
            applicationStatus={submitView.result.applicationStatus}
            titleRef={outcomeTitleRef}
          />
        </div>
      </>
    );
  }

  if (submitView.kind === "failure") {
    return (
      <>
        <ConsultHeader variant="outcome" />
        <div className="flex flex-1 flex-col bg-app-bg">
          <ConsultFailure
            reason={submitView.reason}
            channel={formState.channel}
            contact={formState.contact}
            preferredCallTime={formState.preferredCallTime}
            isRetrying={isRetrying}
            onRetry={handleRetry}
            titleRef={outcomeTitleRef}
          />
        </div>
      </>
    );
  }

  const aggregate = computeAggregate(handoff.result.items);
  const canSubmit = piiCollection && healthInfoUse;

  return (
    <>
      <ConsultHeader variant="form" />
      <div className="flex flex-1 flex-col bg-app-bg">
        <div className="mx-auto w-full max-w-[720px] px-5 pt-6 md:px-0 md:pt-8">
          <h1 className="text-h1 font-bold text-bora-ink">손해사정사에게 무료로 물어보세요</h1>
          <p className="mt-2 text-body text-bora-ink-3">
            <span className="md:hidden">
              진단 결과가 함께 전달되어 처음부터 다시 설명하지 않으셔도 됩니다.
            </span>
            <span className="hidden md:inline">
              진단 결과가 함께 전달되어 처음부터 다시 설명하지 않으셔도 됩니다. 보험증권과 치료
              내용을 함께 확인하면 필요한 서류와 청구 절차를 안내받을 수 있습니다.
            </span>
          </p>
        </div>
        <div
          data-testid="consult-view"
          className="mx-auto flex w-full max-w-[720px] flex-col gap-5 px-5 pt-1 pb-8 md:px-0 md:pt-12"
        >
          <ConsultSummaryCard title={handoff.result.inputSummary.title} aggregate={aggregate} />

          <ConsultChannelSelector value={formState.channel} onChange={handleChannelChange} />

          {Object.keys(formErrors).length > 0 ? (
            // M6 (design.md §11 "오류 요약") — role="alert"는 이 프로젝트의
            // 기존 오류 표기 관례(consult-form.tsx FieldError, consult-
            // failure.tsx 등)를 그대로 따른다.
            <div
              data-testid="consult-error-summary"
              role="alert"
              className="rounded-[12px] border border-destructive/30 bg-destructive/5 p-4"
            >
              <p className="text-sm font-semibold text-destructive">
                입력한 내용을 다시 확인해 주세요
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-meta text-destructive">
                {FIELD_FOCUS_ORDER.filter((key) => formErrors[key]).map((key) => (
                  <li key={key}>{formErrors[key]}</li>
                ))}
              </ul>
            </div>
          ) : null}

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
            errors={formErrors}
          />

          {/* .pen 03 / 03-A2 / M03 — 입력칸 아래, 동의 목록 위. 내용은 중립("배정 예정"). */}
          <ConsultExpertCard />

          <ConsultConsentGroup
            piiCollection={piiCollection}
            healthInfoUse={healthInfoUse}
            marketing={formState.marketingConsent}
            onPiiCollectionChange={setPiiCollection}
            onHealthInfoUseChange={setHealthInfoUse}
            onMarketingChange={handleMarketingChange}
            isPolicyReady={isPolicyReady}
          />

          <ConsultSubmitBar
            isPolicyReady={isPolicyReady}
            canSubmit={canSubmit}
            channel={formState.channel}
            onSubmit={handleSubmit}
          />

          {/* .pen 03 / 03-A2 — 데스크톱 푸터(모바일 M03에는 없다). 위 간격은 부모 gap 20 + 2 = 22. */}
          <ConsultFooter className="mt-0.5" />
        </div>
      </div>
    </>
  );
}

export function ConsultView({ isPolicyReady = false }: ConsultViewProps) {
  const handoff = useConsultHandoffSnapshot();

  // 서버 HTML과 hydration 첫 렌더가 100% 동일해야 하므로, 이 분기에는 empty/
  // invalid 문구도 폼도 넣지 않는다 — 헤더 + 빈 컨테이너만 렌더링한다
  // (aria-busy로 보조기기에 로딩 중임을 알린다).
  if (handoff.status === "loading") {
    return (
      <>
        <ConsultHeader variant="form" />
        <div
          data-testid="consult-loading"
          aria-busy="true"
          className="flex flex-1 flex-col bg-app-bg"
        />
      </>
    );
  }

  return <ConsultViewBody handoff={handoff} isPolicyReady={isPolicyReady} />;
}
