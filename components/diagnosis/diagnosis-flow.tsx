"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

import { StepInput } from "./step-input";
import { StepConsentModal } from "./step-consent-modal";
import { StepQuestions } from "./step-questions";

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

export type DiagnosisStep = "input" | "consent" | "questions" | "loading" | "result-none" | "error";

interface DiagnosisState {
  step: DiagnosisStep;
  input: string;
  consentGiven: boolean;
  answers: Record<string, string>;
  questionIndex: number;
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
  | { type: "QUESTIONS_SKIP" };

// step-questions.tsx의 질문 개수와 동기화되어야 한다(design.md §18.1
// questions 상태 "다음 상태" 행 — 3문항 완료 시 loading으로 전이).
const TOTAL_QUESTIONS = 3;

const initialState: DiagnosisState = {
  step: "input",
  input: "",
  consentGiven: false,
  answers: {},
  questionIndex: 0,
};

function reducer(state: DiagnosisState, action: DiagnosisAction): DiagnosisState {
  switch (action.type) {
    case "SET_INPUT":
      return { ...state, input: action.payload };
    case "SUBMIT_INPUT":
      // REQ-B2CDIAG-020 검증은 StepInput이 이미 통과시킨 뒤에만 dispatch된다.
      return { ...state, step: "consent" };
    case "FORCE_STEP":
      return { ...state, step: action.payload };
    case "SET_CONSENT":
      return { ...state, consentGiven: action.payload };
    case "CONSENT_CONFIRM":
      // REQ-B2CDIAG-006 — CTA 비활성화로 이미 막혀 있지만, reducer 레벨에서도
      // 미동의 상태의 전이를 한 번 더 방어한다.
      return state.consentGiven ? { ...state, step: "questions" } : state;
    case "CONSENT_CANCEL":
      // design.md §18.1 consent 상태 "뒤로 가기 동작" — 동의 상태
      // (consentGiven)는 새로고침 전까지 세션 내내 유지되므로(REQ-B2CDIAG-019),
      // 여기서 초기화하지 않는다.
      return { ...state, step: "input" };
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
    default:
      return state;
  }
}

// design.md §10 — ?devStep=consent-detail|loading|result-none|error. 6단계
// 상태 머신에는 "consent-detail"이 별도 상태로 존재하지 않으므로(동의 상세
// 오버레이는 M4에서 구현할 "consent" 상태 위의 오버레이) 가장 가까운 상태로
// 매핑한다.
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
  const [state, dispatch] = React.useReducer(reducer, initialState);
  const appliedDevStepRef = React.useRef(false);

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

    const mapped = DEV_STEP_MAP[devStep];
    if (mapped) {
      dispatch({ type: "FORCE_STEP", payload: mapped });
    }
  }, [enableDevStates, searchParams]);

  return (
    <div
      data-testid="diagnosis-flow"
      data-step={state.step}
      className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-16"
    >
      {state.step === "input" ? (
        <StepInput
          value={state.input}
          onChange={(value) => dispatch({ type: "SET_INPUT", payload: value })}
          onValidSubmit={() => dispatch({ type: "SUBMIT_INPUT" })}
        />
      ) : state.step === "consent" ? (
        // TODO(M7): 768px 분기 전환 — Mobile 뷰포트에서는 StepConsentSheet
        // (M01-A2 Bottom Sheet)를 렌더링해야 한다. 이 마일스톤(M4)에서는
        // Desktop Modal만 배선한다(plan.md M4 범위, M7이 반응형 브레이크포인트
        // 전환을 담당). StepConsentSheet는 독립적으로 구현·테스트되어 있다.
        <StepConsentModal
          consentGiven={state.consentGiven}
          onConsentChange={(checked) => dispatch({ type: "SET_CONSENT", payload: checked })}
          onConfirm={() => dispatch({ type: "CONSENT_CONFIRM" })}
          onCancel={() => dispatch({ type: "CONSENT_CANCEL" })}
        />
      ) : state.step === "questions" ? (
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
      ) : (
        // M6 이후 마일스톤이 나머지 단계(loading/result-none/error)의 실제
        // UI를 구현한다. 이 SPEC의 M4/M5 범위에서는 devStep 강제 진입·reducer
        // 전이 자체가 정상 동작함만 검증하면 되므로 placeholder로 둔다.
        <div data-testid={`diagnosis-step-${state.step}`} />
      )}
    </div>
  );
}
