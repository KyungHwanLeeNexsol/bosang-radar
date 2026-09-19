"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

import { StepInput } from "./step-input";

// SPEC-B2C-DIAGNOSIS-001 M2 (design.md §0, §2, §5, §10) — 01/01-A2/01-B/01-C/
// 01-D/01-E 6단계 상태 머신의 오너. useSearchParams()를 호출하므로 이
// 컴포넌트는 "use client"이며, 부모(app/page.tsx)가 반드시 <Suspense>로
// 감싸야 한다(design.md §2). enableDevStates는 서버에서 계산된 값을 prop으로
// 전달받을 뿐, process.env를 직접 읽지 않는다(design.md §10).

export type DiagnosisStep = "input" | "consent" | "questions" | "loading" | "result-none" | "error";

interface DiagnosisState {
  step: DiagnosisStep;
  input: string;
  consentGiven: boolean;
  answers: Record<string, string>;
}

type DiagnosisAction =
  | { type: "SET_INPUT"; payload: string }
  | { type: "SUBMIT_INPUT" }
  | { type: "FORCE_STEP"; payload: DiagnosisStep };

const initialState: DiagnosisState = {
  step: "input",
  input: "",
  consentGiven: false,
  answers: {},
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
      ) : (
        // M4 이후 마일스톤이 각 단계(consent/questions/loading/result-none/
        // error)의 실제 UI를 구현한다. 이 SPEC의 M2 범위에서는 devStep 강제
        // 진입·reducer 전이 자체가 정상 동작함만 검증하면 되므로 placeholder로
        // 둔다.
        <div data-testid={`diagnosis-step-${state.step}`} />
      )}
    </div>
  );
}
