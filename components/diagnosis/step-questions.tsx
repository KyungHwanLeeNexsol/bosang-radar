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

const QUESTIONS: readonly Question[] = [
  {
    id: "treatment-status",
    text: "현재 치료를 받고 계신가요?",
    shortLabel: "치료 여부",
    options: ["치료 중이에요", "치료가 끝났어요", "아직 병원에 가지 않았어요", "잘 모르겠어요"],
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
  const nextQuestion = QUESTIONS[questionIndex + 1];
  const progressPercent = ((questionIndex + 1) / TOTAL_QUESTIONS) * 100;

  React.useEffect(() => {
    // design.md §15 — 질문 전환 시 포커스가 새 질문의 제목으로 이동해
    // 스크린리더 사용자가 진행 상황을 인지할 수 있게 한다.
    headingRef.current?.focus();
  }, [questionIndex]);

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
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
        className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3"
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
        {!isLastQuestion && nextQuestion ? (
          <span className="text-meta text-bora-ink-4 sm:ml-auto">
            다음 질문 · {question.shortLabel} → {nextQuestion.shortLabel}
          </span>
        ) : null}
      </div>

      <p className="text-center text-body-s text-bora-ink-3">
        정확한 확인을 위해 3가지만 여쭤볼게요
      </p>

      <h1
        ref={headingRef}
        tabIndex={-1}
        className="text-h2 font-bold text-bora-ink outline-none"
      >
        {question.text}
      </h1>

      <div role="radiogroup" aria-label={question.text} className="flex flex-col gap-2">
        {question.options.map((option) => (
          <label
            key={option}
            className={cn(
              "flex cursor-pointer items-center gap-2.5 rounded-[10px] border border-app-line px-5 py-5 text-sm text-bora-ink",
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

      <p className="text-center text-meta text-bora-ink-4">
        이 답변은 수술비ㆍ후유장해 담보 검토에 사용됩니다. 한 번에 하나씩만 여쭤보고,
        답변하신 내용은 결과 화면의 「추가 질문 답변」에 그대로 표시됩니다.
      </p>

      {questionIndex === 0 ? (
        <button
          type="button"
          onClick={onSkip}
          className="text-center text-sm font-medium text-bora-accent underline-offset-4 hover:underline"
        >
          건너뛰고 결과 보기
        </button>
      ) : null}

      {/* design/exports/01-B/M01-B에는 이전/다음 버튼이 노출되지 않지만,
          AC-B2CDIAG-007~009의 이전/다음/건너뛰기 기능은 계속 필요하다
          (D2 지시사항 — 기능 제거 금지). 시각적 위계에서는 눈에 덜 띄도록
          작은 크기로 아래쪽에 배치한다. */}
      <div className="flex items-center justify-between gap-2">
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
