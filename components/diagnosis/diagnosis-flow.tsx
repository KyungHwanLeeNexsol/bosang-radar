"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { StepInput } from "./step-input";
import { StepConsentModal } from "./step-consent-modal";
import { StepConsentSheet } from "./step-consent-sheet";
import { StepQuestions } from "./step-questions";
import { StepLoading } from "./step-loading";
import { StepResultNone } from "./step-result-none";
import { StepError } from "./step-error";
import { DiagnosisHeader } from "./diagnosis-header";
import { DiagnosisFooter } from "./diagnosis-footer";
import { DESKTOP_MEDIA_QUERY, useMediaQuery } from "./use-media-query";

// SPEC-B2C-DIAGNOSIS-001 M2 (design.md §0, §2, §5, §10) — 01/01-A2/01-B/01-C/
// 01-D/01-E 6단계 상태 머신의 오너. useSearchParams()를 호출하므로 이
// 컴포넌트는 "use client"이며, 부모(app/page.tsx)가 반드시 <Suspense>로
// 감싸야 한다(design.md §2). enableDevStates는 서버에서 계산된 값을 prop으로
// 전달받을 뿐, process.env를 직접 읽지 않는다(design.md §10).
//
// M4/M5 (design.md §17, §18.1) — consentGiven·answers·questionIndex는 모두
// 이 reducer 한 곳에만 존재한다(design.md §5 Enforce Simplicity) — consent
// 상태를 questions와 오가도 동의 체크·응답이 유지되는 이유(REQ-B2CDIAG-019,
// AC-B2CDIAG-017/018)가 바로 이 단일 상태 소유 구조다.
//
// M6 (design.md §11, §12, §18.1 loading/result-none/error 상태) — loading의
// mock 판정 완료, "다시 시도", "내용을 수정할게요", "입력 내용으로
// 돌아가기"는 모두 기존 FORCE_STEP 액션을 재사용한다 — 넷 다 "step만 바꾸고
// 나머지 상태는 그대로 둔다"는 동일한 의미이므로 새 액션을 추가하지 않는다
// (Enforce Simplicity). 이 재사용 덕분에 "다시 시도"가 동일 입력값을
// 자동으로 보존하고(REQ-B2CDIAG-014), "돌아가기" 계열이 검색어·동의·응답을
// 그대로 보존한다(design.md §18.1 result-none/error 상태 "유지되는 데이터"
// 행).
//
// M7 (design.md §13, §18.2) — consent 오버레이는 useMediaQuery(768px)로
// Desktop Modal/Mobile Bottom Sheet 중 하나를 렌더링한다. 상태 머신과
// 데이터는 두 폭에서 완전히 동일하며, 오버레이 컴포넌트 선택만 분기한다.
//
// M-fix-2 (design/exports/01-A2, M01-A2) — 01-A2/M01-A2는 01/M01 "위에"
// 뜨는 오버레이이지 별도의 빈 화면이 아니다. step==="consent"일 때도
// StepInput(배경)을 계속 마운트한 채로 두고, 그 위에 Modal/Sheet를
// 겹쳐 렌더링한다(Base UI가 Portal로 렌더링하므로 DOM 트리 위치와 무관하게
// 시각적으로는 항상 최상단에 뜬다). 검색창 자동 포커스는 실제 "input"
// 단계일 때만 실행해 오버레이의 포커스 트랩과 경쟁하지 않는다.
//
// M-fix-5 — detailOpen은 diagnosis-flow.tsx가 소유한다(StepConsentModal/
// Sheet가 controlled prop으로 전달받음). ?devStep=consent-detail이
// 발생하면 consent 단계로 진입하는 것과 동시에 상세 오버레이도 강제로 열어야
// 하는데, 그 트리거가 이 컴포넌트에만 있기 때문이다.
//
// M-fix-4 (design.md §0 "?step= shallow-route") — ?step=은 표시 전용
// 미러다: 실제 진실은 React state에 있다. 단계 전이마다 ?step=을 갱신하고
// 히스토리 항목을 남겨 뒤로가기가 이전 단계로 자연스럽게 이동하게 한다.
// URL만으로 상태를 재구성하지 않으므로(REQ-B2CDIAG-016), 새로고침·직접
// 진입으로 questions/loading/result-none/error에 도달하면 대응하는
// consentGiven·answers가 없어 input으로 되돌리고 URL을 정리한다. ?devStep=과
// ?step=은 완전히 분리된 코드 경로다 — 서로의 존재를 참조하지 않는다.

export type DiagnosisStep = "input" | "consent" | "questions" | "loading" | "result-none" | "error";

// AC-B2CDIAG-013 — 새로고침은 consent를 포함해 항상 input으로 완전히
// 초기화되어야 한다(REQ-B2CDIAG-016 "URL만으로 상태를 재구성하지 않는다"는
// 예외 없이 모든 비-input 스텝에 적용된다). "input"만 첫 마운트에서 그대로
// 두어도 안전한 유일한 값이다 — 이미 initialState.step === "input"이므로
// 별도 dispatch 없이 URL만 맞으면 그대로 둔다.
const URL_RESTORABLE_STEPS = new Set<DiagnosisStep>(["input"]);

interface DiagnosisState {
  step: DiagnosisStep;
  input: string;
  consentGiven: boolean;
  answers: Record<string, string>;
  questionIndex: number;
  // M-fix-5 — 상세 오버레이 열림 상태. StepConsentModal/Sheet가 이전에
  // 내부 useState로 소유하던 값을 이 reducer로 끌어올렸다(design.md §5
  // 단일 상태 소유 원칙). react-hooks/set-state-in-effect 린트 규칙이
  // "effect 하나에서 setState 두 번" 패턴을 금지하므로, ?devStep=
  // consent-detail이 step과 detailOpen을 동시에 바꿔야 할 때도 반드시
  // dispatch 한 번으로 끝나야 한다(OPEN_CONSENT_DETAIL 액션 참고).
  detailOpen: boolean;
}

type DiagnosisAction =
  | { type: "SET_INPUT"; payload: string }
  | { type: "SUBMIT_INPUT" }
  | { type: "FORCE_STEP"; payload: DiagnosisStep }
  | { type: "SET_CONSENT"; payload: boolean }
  | { type: "CONSENT_CONFIRM" }
  | { type: "CONSENT_CANCEL" }
  | { type: "SET_ANSWER"; payload: { questionId: string; value: string } }
  | { type: "QUESTIONS_NEXT" }
  | { type: "QUESTIONS_PREV" }
  | { type: "QUESTIONS_SKIP" }
  | { type: "SET_DETAIL_OPEN"; payload: boolean }
  | { type: "OPEN_CONSENT_DETAIL" };

// step-questions.tsx의 질문 개수와 동기화되어야 한다(design.md §18.1
// questions 상태 "다음 상태" 행 — 3문항 완료 시 loading으로 전이).
const TOTAL_QUESTIONS = 3;

const initialState: DiagnosisState = {
  step: "input",
  input: "",
  consentGiven: false,
  answers: {},
  questionIndex: 0,
  detailOpen: false,
};

function reducer(state: DiagnosisState, action: DiagnosisAction): DiagnosisState {
  switch (action.type) {
    case "SET_INPUT":
      return { ...state, input: action.payload };
    case "SUBMIT_INPUT":
      // REQ-B2CDIAG-020 검증은 StepInput이 이미 통과시킨 뒤에만 dispatch된다.
      return { ...state, step: "consent" };
    case "FORCE_STEP":
      // consent가 아닌 다른 스텝으로 전이할 때 상세 오버레이가 열린 채로
      // 남아 있으면 안 되므로 함께 닫는다(OPEN_CONSENT_DETAIL만 예외적으로
      // 연다).
      return { ...state, step: action.payload, detailOpen: false };
    case "SET_CONSENT":
      return { ...state, consentGiven: action.payload };
    case "CONSENT_CONFIRM":
      // REQ-B2CDIAG-006 — CTA 비활성화로 이미 막혀 있지만, reducer 레벨에서도
      // 미동의 상태의 전이를 한 번 더 방어한다.
      return state.consentGiven ? { ...state, step: "questions", detailOpen: false } : state;
    case "CONSENT_CANCEL":
      // design.md §18.1 consent 상태 "뒤로 가기 동작" — 동의 상태
      // (consentGiven)는 새로고침 전까지 세션 내내 유지되므로(REQ-B2CDIAG-019),
      // 여기서 초기화하지 않는다.
      return { ...state, step: "input", detailOpen: false };
    case "SET_ANSWER":
      return {
        ...state,
        answers: { ...state.answers, [action.payload.questionId]: action.payload.value },
      };
    case "QUESTIONS_NEXT":
      return state.questionIndex >= TOTAL_QUESTIONS - 1
        ? { ...state, step: "loading" }
        : { ...state, questionIndex: state.questionIndex + 1 };
    case "QUESTIONS_PREV":
      // design.md §18.1 questions 상태 "뒤로 가기 동작" — 첫 질문에서
      // 뒤로가기 시 consent로(동의 상태 유지, REQ-B2CDIAG-019).
      return state.questionIndex <= 0
        ? { ...state, step: "consent" }
        : { ...state, questionIndex: state.questionIndex - 1 };
    case "QUESTIONS_SKIP":
      return { ...state, step: "loading" };
    case "SET_DETAIL_OPEN":
      return { ...state, detailOpen: action.payload };
    case "OPEN_CONSENT_DETAIL":
      // M-fix-5 — ?devStep=consent-detail 전용: consent 진입과 상세 오버레이
      // 오픈을 단일 dispatch로 처리한다.
      return { ...state, step: "consent", detailOpen: true };
    default:
      return state;
  }
}

// design.md §10 — ?devStep=consent-detail|loading|result-none|error. 6단계
// 상태 머신에는 "consent-detail"이 별도 상태로 존재하지 않으므로(동의 상세
// 오버레이는 consent 상태 위의 오버레이) 가장 가까운 상태로 매핑한다.
const DEV_STEP_MAP: Record<string, DiagnosisStep> = {
  "consent-detail": "consent",
  loading: "loading",
  "result-none": "result-none",
  error: "error",
};

interface DiagnosisFlowProps {
  enableDevStates: boolean;
}

export function DiagnosisFlow({ enableDevStates }: DiagnosisFlowProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [state, dispatch] = React.useReducer(reducer, initialState);
  const appliedDevStepRef = React.useRef(false);
  const isFirstUrlSyncRef = React.useRef(true);
  const skipNextPushRef = React.useRef(false);
  const prevStepRef = React.useRef<DiagnosisStep>(state.step);
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);

  React.useEffect(() => {
    // AC-B2CDIAG-016 — enableDevStates=false(프로덕션 기본값)면 ?devStep=은
    // 완전히 무시된다. 마운트 시 1회만 강제 진입을 적용한다(그 이후 사용자
    // 조작으로 인한 상태 전이를 덮어쓰지 않기 위함).
    if (appliedDevStepRef.current || !enableDevStates) {
      return;
    }
    appliedDevStepRef.current = true;

    const devStep = searchParams.get("devStep");
    if (!devStep) {
      return;
    }

    if (devStep === "consent-detail") {
      // M-fix-5 — ?devStep=consent-detail은 동의 오버레이뿐 아니라 그 위의
      // 상세 오버레이까지 열려 있어야 한다(dev 전용, Playwright 검증용).
      // step 전이와 detailOpen 오픈을 단일 dispatch로 처리해 effect 안에서
      // setState를 두 번 호출하지 않는다(react-hooks/set-state-in-effect).
      dispatch({ type: "OPEN_CONSENT_DETAIL" });
      return;
    }

    const mapped = DEV_STEP_MAP[devStep];
    if (mapped) {
      dispatch({ type: "FORCE_STEP", payload: mapped });
    }
  }, [enableDevStates, searchParams]);

  React.useEffect(() => {
    // M-fix-4 — URL의 ?step=이 브라우저 뒤로/앞으로 가기로 바뀌면 React
    // state를 URL에 맞춘다. 첫 실행(마운트)에서 questions/loading/
    // result-none/error처럼 대응하는 client state가 없을 수 있는 step이
    // 발견되면(새로고침·직접 진입), state는 이미 initialState.step===
    // "input"이므로 dispatch 없이 URL만 정리한다(REQ-B2CDIAG-016 — URL만으로
    // 상태를 재구성하지 않는다). 첫 실행 이후에는 이 컴포넌트가 언마운트된
    // 적이 없으므로(같은 세션) 모든 step 값을 그대로 신뢰해 동기화한다.
    const urlStep = searchParams.get("step") as DiagnosisStep | null;
    const isFirstRun = isFirstUrlSyncRef.current;
    isFirstUrlSyncRef.current = false;

    if (!urlStep) {
      return;
    }

    if (isFirstRun && !URL_RESTORABLE_STEPS.has(urlStep)) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("step");
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      return;
    }

    if (urlStep !== state.step) {
      skipNextPushRef.current = true;
      dispatch({ type: "FORCE_STEP", payload: urlStep });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  React.useEffect(() => {
    // M-fix-4 — 사용자 조작으로 인한 step 전이를 ?step=에 반영하고 히스토리
    // 항목을 남긴다(뒤로가기 지원). 위 effect가 URL→state 동기화를 위해
    // dispatch한 경우(skipNextPushRef)는 URL이 이미 올바르므로 다시 push하지
    // 않는다 — 그렇지 않으면 뒤로 가기 1회가 정방향 히스토리 항목을 다시
    // 쌓아 버튼이 계속 앞으로 튕기는 루프가 생긴다.
    const prevStep = prevStepRef.current;
    prevStepRef.current = state.step;

    if (prevStep === state.step) {
      return;
    }
    if (skipNextPushRef.current) {
      skipNextPushRef.current = false;
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    if (state.step === "input") {
      params.delete("step");
    } else {
      params.set("step", state.step);
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step]);

  const isConsentOpen = state.step === "consent";
  // M-fix-2 — consent 오버레이가 열려 있는 동안 배경은 01/M01(StepInput)을
  // 계속 보여준다. 다른 스텝(questions/loading/...)에는 배경 개념이 없다.
  const backgroundStep = isConsentOpen ? "input" : state.step;

  const onDetailOpenChange = (open: boolean) => dispatch({ type: "SET_DETAIL_OPEN", payload: open });

  const consentOverlay = isConsentOpen ? (
    isDesktop ? (
      <StepConsentModal
        consentGiven={state.consentGiven}
        onConsentChange={(checked) => dispatch({ type: "SET_CONSENT", payload: checked })}
        onConfirm={() => dispatch({ type: "CONSENT_CONFIRM" })}
        onCancel={() => dispatch({ type: "CONSENT_CANCEL" })}
        detailOpen={state.detailOpen}
        onDetailOpenChange={onDetailOpenChange}
      />
    ) : (
      <StepConsentSheet
        consentGiven={state.consentGiven}
        onConsentChange={(checked) => dispatch({ type: "SET_CONSENT", payload: checked })}
        onConfirm={() => dispatch({ type: "CONSENT_CONFIRM" })}
        onCancel={() => dispatch({ type: "CONSENT_CANCEL" })}
        detailOpen={state.detailOpen}
        onDetailOpenChange={onDetailOpenChange}
      />
    )
  ) : null;

  return (
    <div data-testid="diagnosis-flow" data-step={state.step} className="flex flex-1 flex-col">
      <DiagnosisHeader />

      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-16">
        {backgroundStep === "input" ? (
          <StepInput
            value={state.input}
            onChange={(value) => dispatch({ type: "SET_INPUT", payload: value })}
            onValidSubmit={() => dispatch({ type: "SUBMIT_INPUT" })}
            autoFocus={state.step === "input"}
          />
        ) : backgroundStep === "questions" ? (
          <StepQuestions
            questionIndex={state.questionIndex}
            answers={state.answers}
            onAnswer={(questionId, value) =>
              dispatch({ type: "SET_ANSWER", payload: { questionId, value } })
            }
            onNext={() => dispatch({ type: "QUESTIONS_NEXT" })}
            onPrev={() => dispatch({ type: "QUESTIONS_PREV" })}
            onSkip={() => dispatch({ type: "QUESTIONS_SKIP" })}
          />
        ) : backgroundStep === "loading" ? (
          <StepLoading
            input={state.input}
            onDone={(step) => dispatch({ type: "FORCE_STEP", payload: step })}
          />
        ) : backgroundStep === "result-none" ? (
          <StepResultNone onEditInput={() => dispatch({ type: "FORCE_STEP", payload: "input" })} />
        ) : (
          <StepError
            onRetry={() => dispatch({ type: "FORCE_STEP", payload: "loading" })}
            onBackToInput={() => dispatch({ type: "FORCE_STEP", payload: "input" })}
          />
        )}
      </div>

      {consentOverlay}

      <DiagnosisFooter />
    </div>
  );
}
