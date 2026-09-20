"use client";

import * as React from "react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// SPEC-B2C-DIAGNOSIS-001 M5 (design.md §15, §18.1 questions 상태;
// acceptance.md AC-B2CDIAG-007~009/017) — 01-B/M01-B 추가 질문 3문항.
//
// 담보 매칭 로직이 미결정(tech.md)이라 실제 서비스의 질문은 사용자의 01
// 입력을 바탕으로 동적으로 생성된다(design/exports의 캡처 예시 "무릎
// 골절로 수술을 받으셨나요?"가 그 예). 이 SPEC은 매칭 엔진을 구현하지
// 않으므로, "라디오 그룹 3개 + 각 그룹 마지막에 '잘 모르겠어요' 옵션"이라는
// design.md §18.1의 구조만 보존한 대표 placeholder 질문 세트를 사용한다.
// 실제 질문 문구 확정은 매칭 엔진 연결 시점(후속 SPEC)의 몫이다 — 잔여
// 위험으로 progress.md에 기록한다.

interface Question {
  id: string;
  text: string;
  // D2(second remediation round, design/exports/01-B) — 진행 바 오른쪽 힌트
  // "다음 질문 · <현재> → <다음>"에 쓰이는 짧은 라벨. 질문 본문(text)과 달리
  // 한두 단어로 축약한다.
  shortLabel: string;
  options: string[];
}

// D2(3차 원격 결함 재작업) — Q1은 design/exports/01-B/M01-B의 대표
// placeholder("무릎 골절로 수술을 받으셨나요?" + 선택지 4개)로 교체한다.
// 이 질문 자체는 매칭 엔진 연결과 무관한 placeholder 문구 선택일 뿐이므로
// 범위 위반이 아니다. 아래 "이 답변은 수술비ㆍ후유장해 담보 검토에
// 사용됩니다" 안내 문구가 Q1과 의미상 맞물리도록 Q1도 수술 여부 질문으로
// 맞춘다(이전 "치료 여부" 질문과의 의미 충돌 제거).
const QUESTIONS: readonly Question[] = [
  {
    id: "surgery-status",
    text: "무릎 골절로 수술을 받으셨나요?",
    shortLabel: "수술 여부",
    options: ["수술을 받았어요", "받지 않았어요", "수술 예정입니다", "잘 모르겠어요"],
  },
  {
    id: "hospitalization",
    text: "입원한 적이 있나요?",
    shortLabel: "입원 여부",
    options: ["입원했어요", "통원 치료만 받았어요", "입원 예정이에요", "잘 모르겠어요"],
  },
  {
    id: "accident-location",
    text: "사고나 증상이 발생한 장소는 어디인가요?",
    shortLabel: "사고 장소",
    options: ["직장·학교", "집", "도로·교통수단", "잘 모르겠어요"],
  },
] as const;

const TOTAL_QUESTIONS = QUESTIONS.length;

interface StepQuestionsProps {
  questionIndex: number;
  answers: Record<string, string>;
  onAnswer: (questionId: string, value: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}

export function StepQuestions({
  questionIndex,
  answers,
  onAnswer,
  onNext,
  onPrev,
  onSkip,
}: StepQuestionsProps) {
  const question = QUESTIONS[questionIndex] ?? QUESTIONS[0];
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const selected = answers[question.id];
  const isLastQuestion = questionIndex === TOTAL_QUESTIONS - 1;
  const progressPercent = ((questionIndex + 1) / TOTAL_QUESTIONS) * 100;
  // D2(3차 원격 결함 재작업) — 힌트 라벨은 "현재 질문 → 다음 질문"이
  // 아니라 "현재 질문 다음에 남은 질문들의 순서"를 보여준다(design/exports/
  // 01-B: Q1에서 "다음 질문 · 입원 여부 → 사고 장소" — 이는 Q2→Q3 순서를
  // 미리 보여주는 것이지 Q1→Q2가 아니다). 남은 질문이 하나뿐이면 화살표
  // 없이 그 질문만 보여준다.
  const upcomingLabel = QUESTIONS.slice(questionIndex + 1)
    .map((q) => q.shortLabel)
    .join(" → ");

  React.useEffect(() => {
    // design.md §15 — 질문 전환 시 포커스가 새 질문의 제목으로 이동해
    // 스크린리더 사용자가 진행 상황을 인지할 수 있게 한다.
    headingRef.current?.focus();
  }, [questionIndex]);

  return (
    // D2(4차 재작업) — design/exports/01-B(1440×940)·M01-B(390×672)를
    // 세그먼트 단위로 재실측: 확인 배지 상단 Desktop y≈144 / Mobile y≈78 —
    // 헤더(63px/59px) 기준 pt-[81px]/pt-[19px]. 옵션 행 폭은 707px 실측
    // (710px로 근접). 공통 wrapper의 justify-center 제거에 맞춰 이 pt가
    // 이제 이 화면의 세로 위치를 전적으로 책임진다.
    // Mobile 간격을 gap-3(12px)로 좁혀 옵션 4개+설명+건너뛰기 링크가
    // 390×672 프레임 안에 들어오게 한다(gap-5=20px 유지 시 하단이 잘림).
    // D2(5차 재작업) — Desktop 균일 gap-5(20px)가 디자인 실측 간격(확인
    // 배지→진행 표시 23px/진행 표시→부제 19px/부제→제목 21px/제목→옵션
    // 36px)과 달라 옵션 행이 디자인보다 위로 붙어 보였다. Desktop만
    // 개별 margin-top으로 대체(Mobile은 4차에서 이미 390×672 프레임에
    // 맞춰 튜닝돼 있어 이번엔 건드리지 않는다 — 잔여 위험으로 남긴다).
    <div className="flex w-full max-w-md flex-col gap-3 pt-[19px] md:max-w-[710px] md:gap-0 md:pt-[81px]">
      {/* D2(second remediation round, design/exports/01-B/M01-B) — "입력
          내용을 확인했어요" 확인 배지. 사용자가 01에서 제출한 입력이
          유효하게 넘어왔음을 알려준다. */}
      <div className="flex items-center gap-1.5 self-center rounded-full bg-green-50 px-3 py-1.5 text-meta font-medium text-green-700">
        <Check className="size-3.5 shrink-0" aria-hidden="true" />
        입력 내용을 확인했어요
      </div>

      <div
        data-testid="diagnosis-question-progress"
        aria-live="polite"
        className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3 md:mt-[23px]"
      >
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-body-s font-bold text-bora-accent">
            질문 {questionIndex + 1} / {TOTAL_QUESTIONS}
          </span>
          <div className="h-1.5 w-24 shrink-0 rounded-full bg-app-surface-inset">
            <div
              className="h-full rounded-full bg-bora-accent transition-[width]"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
        {!isLastQuestion && upcomingLabel ? (
          <span className="text-meta text-bora-ink-4 sm:ml-auto">다음 질문 · {upcomingLabel}</span>
        ) : null}
      </div>

      <p className="text-center text-body-s text-bora-ink-3 md:mt-[19px]">
        정확한 확인을 위해 3가지만 여쭤볼게요
      </p>

      <h1
        ref={headingRef}
        tabIndex={-1}
        // D2(3차 원격 결함 재작업) — design/exports 제목이 text-h2(19px)보다
        // 뚜렷이 크다(01 입력 화면의 h1과 동일한 text-h1/26px 위계 재사용 —
        // 전역 토큰은 건드리지 않고 이 컴포넌트에서만 큰 클래스를 선택).
        className="text-h1 font-bold text-bora-ink outline-none md:mt-[21px]"
      >
        {question.text}
      </h1>

      {/* D2(5차 재작업) — 디자인 세그먼트 간 간격(36px)을 그대로 쓰면
          위쪽 요소들의 line-height 박스가 디자인의 ink-only 박스보다
          이미 커진 만큼 누적돼(제목 하단이 디자인보다 23px 아래) 옵션
          행이 오히려 더 아래로 밀렸다(351 vs 목표 328). 실측 제목 하단
          기준으로 역산한 값(13px)을 대신 사용한다. */}
      <div
        role="radiogroup"
        aria-label={question.text}
        className="flex flex-col gap-3 md:mt-[13px]"
      >
        {question.options.map((option) => (
          <label
            key={option}
            // D2(4차 재작업) — 01-B 옵션 행 높이 실측 54px(Desktop)/
            // 51px(Mobile). 이전 라운드의 md:px-6 md:py-6는 실측보다
            // 과도하게 커서(약 68px+) px-5 py-4로 되돌린다 — 두 폭이
            // 서로 크게 다르지 않으므로 반응형 분기를 없애고 공통값을 쓴다.
            className={cn(
              "flex cursor-pointer items-center gap-2.5 rounded-[10px] border border-app-line px-5 py-4 text-sm text-bora-ink md:text-base",
              "has-[:checked]:border-bora-accent"
            )}
          >
            <input
              type="radio"
              name={question.id}
              value={option}
              checked={selected === option}
              onChange={() => onAnswer(question.id, option)}
              className="size-4 shrink-0 accent-bora-accent"
            />
            {option}
          </label>
        ))}
      </div>

      <p className="text-center text-meta text-bora-ink-4 md:mt-[22px]">
        이 답변은 수술비ㆍ후유장해 담보 검토에 사용됩니다. 한 번에 하나씩만 여쭤보고,
        답변하신 내용은 결과 화면의 「추가 질문 답변」에 그대로 표시됩니다.
      </p>

      {questionIndex === 0 ? (
        <button
          type="button"
          onClick={onSkip}
          className="text-center text-sm font-medium text-bora-accent underline-offset-4 hover:underline md:mt-[9px]"
        >
          건너뛰고 결과 보기
        </button>
      ) : null}

      {/* design/exports/01-B/M01-B에는 이전/다음 버튼이 노출되지 않지만,
          AC-B2CDIAG-007~009의 이전/다음/건너뛰기 기능은 계속 필요하다
          (D2 지시사항 — 기능 제거 금지). 시각적 위계에서는 눈에 덜 띄도록
          작은 크기로 아래쪽에 배치한다(디자인 기준 프레임을 침범하지 않는
          종속 위치 — design/exports에는 없는 요소라 정확한 목표값이 없어
          기존 20px 간격을 유지한다). */}
      <div className="flex items-center justify-between gap-2 md:mt-5">
        <Button type="button" variant="ghost" size="sm" onClick={onPrev}>
          이전
        </Button>
        <Button type="button" variant="diagnosis" size="sm" disabled={!selected} onClick={onNext}>
          {isLastQuestion ? "결과 보기" : "다음"}
        </Button>
      </div>
    </div>
  );
}
