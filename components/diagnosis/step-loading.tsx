"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

// SPEC-B2C-DIAGNOSIS-001 M6 (design.md §11, §18.1 loading 상태;
// acceptance.md AC-B2CDIAG-009) — 01-C/M01-C 진단 중 화면. 순차 진행 단계를
// aria-live 영역에 표시한 뒤, mock 판정 로직으로 result-none/error 중 하나로
// 전이한다. "결과 있음"(02) 경로는 이 SPEC에서 도달 불가능하게 둔다
// (design.md §18.2).

const STAGES = ["사고 내용 확인 중", "관련 보상 유형 탐색 중", "확인할 담보 정리 중"] as const;

// UI 시뮬레이션 전용 고정 지연(design.md §11 "고정 지연") — 실제 분석
// 소요 시간과 무관한 값이며, 테스트가 느려지지 않도록 짧게 유지한다.
const STAGE_DELAY_MS = 200;

// @MX:DEBT: 담보 매칭 엔진이 아직 결정되지 않아(tech.md, plan.md §B) 키워드
// 기반 mock 판정으로 임시 대체한다 — 입력 문자열에 "오류"가 포함되면
// error로, 그 외에는 result-none으로 분기한다. 이 분기는 로컬/테스트/리뷰
// 전용 시뮬레이션이며 프로덕션 동작이 아니다(design.md §8/§11/§19) —
// app/page.tsx의 마운트 게이트(productionReady || reviewEnabled)가 프로덕션
// 기본 조합에서 <DiagnosisFlow />를 렌더링하지 않으므로, 실제 프로덕션
// 사용자는 정상 사용자 플로우로 이 분기에 도달할 수 없다.
// @MX:CEILING: "결과 있음"(02 화면)으로의 분기는 구현하지 않는다 —
// result-none/error 두 갈래만 존재한다.
// @MX:UPGRADE: 실제 담보 매칭 엔진이 연결되어 DIAGNOSIS_ENGINE_READY=true로
// 전환되는 후속 SPEC에서 이 함수 전체를 실제 분석 API 호출로 교체한다.
export function mockJudge(input: string): "result-none" | "error" {
  return input.includes("오류") ? "error" : "result-none";
}

interface StepLoadingProps {
  input: string;
  onDone: (step: "result-none" | "error") => void;
}

export function StepLoading({ input, onDone }: StepLoadingProps) {
  const [stageIndex, setStageIndex] = React.useState(0);
  const onDoneRef = React.useRef(onDone);

  React.useEffect(() => {
    // 렌더 중이 아니라 렌더 이후(effect)에 ref를 갱신한다 — 항상 최신
    // 콜백을 참조하면서도 onDone을 아래 타이머 effect의 dependency에서
    // 제외해, 부모 리렌더마다 새로 생성되는 인라인 콜백이 타이머를
    // 불필요하게 재시작하지 않도록 한다(Enforce Simplicity).
    onDoneRef.current = onDone;
  });

  React.useEffect(() => {
    const isLastStage = stageIndex >= STAGES.length - 1;
    const timer = setTimeout(() => {
      if (isLastStage) {
        onDoneRef.current(mockJudge(input));
      } else {
        setStageIndex((current) => current + 1);
      }
    }, STAGE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [stageIndex, input]);

  return (
    <div
      data-testid="diagnosis-loading"
      className="flex w-full max-w-md flex-col items-center gap-4 py-16 text-center"
    >
      <span
        aria-hidden="true"
        className="size-8 animate-spin rounded-full border-2 border-app-line border-t-primary motion-reduce:animate-none"
      />
      <h1 className="text-h2 font-semibold text-bora-ink">입력하신 내용을 확인하고 있습니다</h1>
      <p className="text-body text-bora-ink-3">
        보통 10~20초 정도 걸립니다. 창을 닫지 말고 잠시 기다려 주세요.
      </p>
      <ul aria-live="polite" className="flex w-full flex-col gap-2 text-left">
        {STAGES.map((label, index) => (
          <li
            key={label}
            data-testid={`diagnosis-loading-stage-${index}`}
            className={cn(
              "flex items-center justify-between rounded-[10px] border px-4 py-3.5 text-sm",
              index === stageIndex
                ? "border-primary font-medium text-primary"
                : "border-app-line text-bora-ink-3"
            )}
          >
            <span>{label}</span>
            <span className="text-meta">
              {index < stageIndex ? "완료" : index === stageIndex ? "진행 중" : "대기"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
