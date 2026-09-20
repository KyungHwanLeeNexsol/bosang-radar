"use client";

import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

// SPEC-B2C-DIAGNOSIS-001 M6 (design.md §11, §18.1 loading 상태;
// acceptance.md AC-B2CDIAG-009) — 01-C/M01-C 진단 중 화면. 순차 진행 단계를
// aria-live 영역에 표시한 뒤, mock 판정 로직으로 result-none/error 중 하나로
// 전이한다. "결과 있음"(02) 경로는 이 SPEC에서 도달 불가능하게 둔다
// (design.md §18.2).

const STAGES = ["사고 내용 확인 중", "관련 보상 유형 탐색 중", "확인할 담보 정리 중"] as const;

// D2(second remediation round, design/exports/01-C/M01-C) — 진행 상태 아래
// 뼈대(skeleton) 카드. Desktop 3개(가로 배치)/Mobile 2개(세로 나열)로
// 노출되는 개수 자체가 다르므로 JS 뷰포트 판정 대신 세 번째 카드에만
// `hidden md:flex`를 붙이는 순수 CSS 방식으로 구현한다(design.md §5 —
// 이미 useMediaQuery가 있는 diagnosis-flow.tsx 밖에서 새 매체 질의 상태를
// 만들지 않는다).
const SKELETON_CARD_COUNT = 3;
const SKELETON_BAR_WIDTHS = ["100%", "70%", "85%"] as const;

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
      // D2(4차 재작업) — design/exports/01-C(1440×900)·M01-C(390×650)를
      // 세그먼트 단위로 재실측(header 이후 quiet-gap 분리): 스피너 상단
      // Desktop y≈145 / Mobile y≈87 — 헤더(각 63px/59px) 기준 pt-[82px]/
      // pt-[28px]. 콘텐츠 폭은 707px 실측(pt-[]는 반응형, 폭은 710px로
      // 707에 근접). py-16(상하 64px 공통 중앙정렬용)은 제거 — 상단은
      // pt-*가, 하단은 gap만으로 충분하다.
      className="flex w-full max-w-md flex-col items-center gap-4 pt-[28px] text-center md:max-w-[710px] md:pt-[82px]"
    >
      {/* D2(second remediation round, design/exports/01-C) — 단순 회색
          테두리 스피너 대신 BORA 퍼플 "C" 형태의 스피너로 교체한다: 옅은
          퍼플 트랙 위에 진한 퍼플 호(arc)만 회전시켜 export의 열린-원 형태를
          재현한다. */}
      {/* D2(4차 재작업) — md:size-11(44px)로 키웠던 3차 변경이 스피너
          자체의 렌더링 높이를 늘려 제목 상단이 design/exports/01-C
          실측(y≈192)보다 16px 이상 아래로 밀렸다(DOM 실측으로 확인).
          size-9(36px)로 되돌리고 간격도 gap-5→gap-4로 좁혀 보정한다. */}
      <span
        aria-hidden="true"
        className="size-9 animate-spin rounded-full border-[3px] border-bora-accent-soft border-t-bora-accent motion-reduce:animate-none"
      />
      {/* D2(3차) — text-h2(19px)는 디자인보다 작다. 01 입력 화면과 동일한
          text-h1(26px) 위계를 재사용한다(전역 토큰 변경 없음). */}
      <h1 className="text-h1 font-bold text-bora-ink">입력하신 내용을 확인하고 있습니다</h1>
      {/* D2(5차 재작업) — design/exports/M01-C 설명 세그먼트는 폭 138px
          짜리 한 줄뿐이라 Desktop의 전체 문장("보통 10~20초 정도
          걸립니다. 창을 닫지 말고...")이 그대로 들어갈 수 없다 — Mobile은
          더 짧은 문구를 쓴다(반응형으로 표시만 분리, 스크린리더에서
          숨기지 않음 — 두 <p> 모두 항상 DOM에 존재). */}
      <p className="text-body text-bora-ink-3 md:hidden">잠시만 기다려 주세요</p>
      <p className="hidden text-body text-bora-ink-3 md:block">
        보통 10~20초 정도 걸립니다. 창을 닫지 말고 잠시 기다려 주세요.
      </p>
      <ul aria-live="polite" className="flex w-full flex-col gap-2.5 text-left">
        {STAGES.map((label, index) => {
          const isCompleted = index < stageIndex;
          const isCurrent = index === stageIndex;
          return (
            <li
              key={label}
              data-testid={`diagnosis-loading-stage-${index}`}
              // D2(5차 재작업) — design/exports/01-C·M01-C 단계 행 실측
              // 높이는 47px(Desktop)/44px(Mobile)인데 기존 py-3.5/py-4는
              // 58px/50px로 과대했다. py-3으로 좁혀 디자인에 근접시킨다.
              className={cn(
                "flex items-center justify-between rounded-[10px] border px-4 py-3 text-sm md:px-5 md:py-3 md:text-base",
                isCurrent && "border-bora-accent bg-bora-accent-soft font-medium text-bora-accent",
                isCompleted && "border-app-line text-bora-ink",
                !isCompleted && !isCurrent && "border-app-line text-bora-ink-4"
              )}
            >
              <span className="flex items-center gap-2.5">
                {isCompleted ? (
                  <span
                    aria-hidden="true"
                    className="flex size-4 shrink-0 items-center justify-center rounded-full bg-green-600 text-white"
                  >
                    <Check className="size-2.5" strokeWidth={3} />
                  </span>
                ) : isCurrent ? (
                  <span
                    aria-hidden="true"
                    className="size-4 shrink-0 animate-spin rounded-full border-2 border-bora-accent-line border-t-bora-accent motion-reduce:animate-none"
                  />
                ) : (
                  <span aria-hidden="true" className="size-4 shrink-0 rounded-full border-2 border-app-line" />
                )}
                <span>{label}</span>
              </span>
              <span
                className={cn(
                  "text-meta font-medium",
                  isCompleted && "text-green-600",
                  isCurrent && "text-bora-accent",
                  !isCompleted && !isCurrent && "text-bora-ink-4"
                )}
              >
                {isCompleted ? "완료" : isCurrent ? "진행 중" : "대기"}
              </span>
            </li>
          );
        })}
      </ul>

      {/* D2(second remediation round, design/exports/01-C/M01-C) — 진행 중
          뼈대(skeleton) 카드. 실제 결과 미리보기가 아니라 로딩 상태를 암시하는
          정적 placeholder다(02 실제 결과 화면은 이 SPEC의 Out of Scope). */}
      <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-3">
        {Array.from({ length: SKELETON_CARD_COUNT }, (_, cardIndex) => (
          <div
            key={cardIndex}
            aria-hidden="true"
            className={cn(
              "flex flex-col gap-2 rounded-[10px] border border-app-line bg-app-surface p-4",
              // Mobile은 카드 2개만 세로로 나열한다(design/exports/M01-C).
              cardIndex === SKELETON_CARD_COUNT - 1 && "hidden md:flex"
            )}
          >
            {SKELETON_BAR_WIDTHS.map((width, barIndex) => (
              <span
                key={barIndex}
                className="h-3 animate-pulse rounded-full bg-app-surface-inset"
                style={{ width }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
