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
    // D2(6차 재작업) — 5차는 디자인 PNG(ink-only)와 구현(DOM
    // line-height box)을 서로 다른 측정 방식으로 비교해 제목 위치를
    // 20px 놓쳤다. 이번엔 디자인·구현 캡처를 동일 크기로 맞춰 똑같은
    // ink-pixel 세그먼트 알고리즘으로 직접 비교했다 — 제목 top이
    // 디자인(264) 대비 구현이 284로 실제로 20px 처져 있었다(단순
    // ink/line-height 오차가 아니라 실제 결함). 각 요소의 margin을
    // 독립적으로 재조정해 제목과 옵션 행을 각각 디자인 좌표에
    // 맞춘다(제목을 올려도 옵션이 깨지지 않도록 radiogroup 여백도
    // 함께 재계산).
    // D2(6차 재작업) — M01-B(Mobile) 내부 간격을 이번에 처음으로 전부
    // 동일 ink-pixel 좌표계로 측정했다(5차는 "미측정"으로 남겨뒀던
    // 부분). 균일 gap-3(12px) 대신 디자인 실측 간격으로 대체한다.
    // D2(7차) — 옵션 행 폭 실측이 디자인 720px, 구현 710px로 10px 좁았다.
    <div className="flex w-full max-w-md flex-col gap-0 pt-[19px] md:max-w-[720px] md:pt-[81px]">
      {/* D2(second remediation round, design/exports/01-B/M01-B) — "입력
          내용을 확인했어요" 확인 배지. 사용자가 01에서 제출한 입력이
          유효하게 넘어왔음을 알려준다. */}
      {/* D2(7차) — design/exports/M01-B는 배지·진행 표시·부제·제목·답변
          안내·건너뛰기가 전부 좌측 정렬이다(01-B Desktop만 중앙 정렬). */}
      <div
        data-testid="diagnosis-confirm-badge"
        className="flex items-center gap-1.5 self-start rounded-full bg-green-50 px-3.5 py-1.5 text-meta font-medium text-green-700 md:self-center md:px-[19px]"
      >
        <Check className="size-3.5 shrink-0" aria-hidden="true" />
        입력 내용을 확인했어요
      </div>

      <div
        data-testid="diagnosis-question-progress"
        aria-live="polite"
        className="mt-[16px] flex w-full flex-col gap-1 md:mt-[18px] md:flex-row md:items-center md:justify-center md:gap-3"
      >
        <div data-testid="diagnosis-progress-row" className="flex items-center gap-2">
          <span className="shrink-0 text-body-s font-bold text-bora-accent">
            질문 {questionIndex + 1} / {TOTAL_QUESTIONS}
          </span>
          {/* D2(6차 재작업) — design/exports/M01-B는 진행률 트랙이
              고정 96px보다 훨씬 길게(콘텐츠 폭 대부분) 뻗어 있다.
              Mobile만 넓히고 Desktop은 기존 96px(w-24)을 유지한다
              (Desktop은 별도 편차 보고 없음). */}
          {/* D2(7차) — design/exports/M01-B의 진행률 트랙은 고정 폭이 아니라
              라벨 오른쪽의 남은 폭을 전부 채운다(우측 끝이 콘텐츠 우측
              경계와 일치). Desktop은 중앙 정렬된 짧은 트랙을 유지한다. */}
          <div
            data-testid="diagnosis-progress-track"
            className="h-1.5 w-[210px] shrink-0 rounded-full bg-app-surface-inset md:w-[129px]"
          >
            <div
              className="h-full rounded-full bg-bora-accent transition-[width]"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
        {!isLastQuestion && upcomingLabel ? (
          <span data-testid="diagnosis-question-upcoming" className="text-meta text-bora-ink-4">
            다음 질문 · {upcomingLabel}
          </span>
        ) : null}
      </div>

      <p
        data-testid="diagnosis-question-subtitle"
        className="mt-[11px] text-left text-[13.5px] text-bora-ink-3 md:mt-[12px] md:text-center md:text-[15px]"
      >
        정확한 확인을 위해 3가지만 여쭤볼게요
      </p>

      <h1
        ref={headingRef}
        data-testid="diagnosis-question-title"
        tabIndex={-1}
        // D2(3차 원격 결함 재작업) — design/exports 제목이 text-h2(19px)보다
        // 뚜렷이 크다(01 입력 화면의 h1과 동일한 text-h1/26px 위계 재사용 —
        // 전역 토큰은 건드리지 않고 이 컴포넌트에서만 큰 클래스를 선택).
        // D2(6차 재작업) — design/exports/M01-B는 질문 제목이 2줄로
        // 줄바꿈된다("무릎 골절로 수술을" / "받으셨나요?") — Mobile 폭
        // 제한으로 줄바꿈 지점을 재현한다(질문마다 문구 길이가 달라
        // 다른 질문은 줄바꿈 지점이 다를 수 있음 — 잔여 위험).
        className="mt-[5px] max-w-[190px] text-[24.2px] font-bold text-bora-ink outline-none md:mt-[8px] md:max-w-none md:text-center md:text-[30px]"
      >
        {question.text}
      </h1>

      {/* D2(6차 재작업) — 옵션 행 top은 이미 디자인(328)과 동일 픽셀
          측정에서 정확히 일치했었다(제목 위치 수정과 무관하게 유지해야
          함). 제목의 margin을 줄였으므로 radiogroup의 margin은 제목
          위치 변경과 독립적으로 옵션 top=328을 다시 맞추도록
          재계산한다(제목이 위로 이동한 만큼 옵션 쪽 여백을 늘림). */}
      <div
        role="radiogroup"
        aria-label={question.text}
        className="mt-[19px] flex flex-col gap-[9px] md:mt-[29px] md:gap-[11px]"
      >
        {question.options.map((option, optionIndex) => (
          <label
            key={option}
            data-testid={`diagnosis-option-${optionIndex}`}
            // D2(7차) — 옵션 행 높이를 디자인 실측값에 정확히 맞춘다.
            // Desktop: 테두리 2 + line-height 24(text-base) + padding 28
            //          = 54px(디자인 실측), 행 간격 11px → pitch 65px.
            // Mobile:  테두리 2 + line-height 20(text-sm) + padding 26
            //          = 48px, 행 간격 13px → pitch 61px(디자인 실측).
            // 6차까지는 py-4(행 57px)로 4행 누적 편차가 하단 요소까지
            // 밀어냈다. 54px는 44px 최소 터치 타깃보다 크므로 접근성과
            // 상충하지 않는다.
            className={cn(
              "flex cursor-pointer items-center gap-2.5 rounded-[10px] border border-app-line px-5 py-[15px] text-sm text-bora-ink md:py-[14px] md:text-base",
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

      {/* D2(7차) — design/exports/M01-B의 답변 안내는 Desktop(01-B)보다
          짧은 2줄이다. 같은 문구를 좁은 폭에 넣으면 3줄이 되어 건너뛰기
          링크가 아래로 밀린다. */}
      {/* D2(8차) — 7차는 줄 "수"만 검사해서 줄바꿈 지점이 디자인과 다른 것을
          통과시켰다: 구현은 "…「추가 질문" / "답변」에…"로, 디자인은 "…「추가" /
          "질문 답변」에…"로 끊긴다. 원인은 줄바꿈이 아니라 글자 크기다 —
          디자인은 같은 346px 폭에 " 질문" 없이 한 줄을 채우는데 구현은 12px라
          그 두 글자가 더 들어갔다. 실측 비율로 역산한 13.1px로 맞추면 줄바꿈
          지점과 폭이 함께 수렴한다. */}
      <p
        data-testid="diagnosis-answer-guide"
        className="mt-[22px] text-left text-[13px] text-bora-ink-4 md:hidden"
      >
        이 답변은 수술비 · 후유장해 담보 검토에 사용되며, 결과 화면의 「추가 질문 답변」에 그대로
        표시됩니다.
      </p>
      <p
        data-testid="diagnosis-answer-guide"
        className="hidden text-center text-[12.35px] text-bora-ink-4 md:mt-[19px] md:block"
      >
        이 답변은 수술비 · 후유장해 담보 검토에 사용됩니다. 한 번에 하나씩만 여쭤보고, 답변하신
        내용은 결과 화면의 「추가 질문 답변」에 그대로 표시됩니다.
      </p>

      {questionIndex === 0 ? (
        <button
          type="button"
          data-testid="diagnosis-skip-link"
          onClick={onSkip}
          className="mt-[7px] self-start text-sm font-medium text-bora-accent underline-offset-4 hover:underline md:mt-[36px] md:self-center"
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
      <div className="mt-5 flex items-center justify-between gap-2 md:mt-5">
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
