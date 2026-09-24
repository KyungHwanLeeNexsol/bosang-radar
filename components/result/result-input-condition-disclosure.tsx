"use client";

// SPEC-B2C-RESULT-001 D2 (design.md "빠른 보기"/"입력 조건 더보기" 패턴,
// coverage-item-card.tsx "왜 확인해야 하나요?" disclosure와 동일한
// <details>/<summary> 접근성 패턴 재사용) — 01에서 제출한 입력 조건(원문
// 텍스트 + 추가 질문 응답)을 접근 가능한 disclosure로 재노출한다.
//
// SPEC-B2C-RESULT-001 D1(후속 리뷰) — 이 위젯은 더 이상 readDiagnosisHandoff()를
// 독립적으로 재호출하지 않는다(과거에는 이 위젯만 sessionStorage를 다시 읽어,
// `?devFixture=fracture` 경로처럼 sessionStorage를 전혀 쓰지 않는 진입에서
// 자체적으로 "empty"로 오판해 렌더링을 건너뛰는 결함이 있었다). result-view.tsx가
// 이미 3갈래로 분류해 둔 DiagnosisResult의 rawInput/answers를 그대로 props로
// 전달받는다 — 별도 상태 원본이 없으므로 일반 01→02 handoff와 devFixture 경로
// 모두 동일하게 렌더링된다.
export interface ResultInputConditionDisclosureProps {
  rawInput: string;
  answers: Record<string, string>;
}

export function ResultInputConditionDisclosure({
  rawInput,
  answers,
}: ResultInputConditionDisclosureProps) {
  const answerEntries = Object.entries(answers);

  return (
    <details
      data-testid="result-input-condition-disclosure"
      className="w-full rounded-[10px] border border-app-line bg-app-surface p-3.5 text-label-s text-bora-ink-3"
    >
      <summary className="cursor-pointer font-medium text-bora-accent">입력 조건 더보기</summary>
      <div className="mt-2 flex flex-col gap-2">
        <p data-testid="result-input-condition-raw">{rawInput}</p>
        {answerEntries.length > 0 ? (
          <dl data-testid="result-input-condition-answers" className="flex flex-col gap-1">
            {answerEntries.map(([questionId, value]) => (
              <div key={questionId} className="flex gap-2">
                <dt className="text-bora-ink-4">{questionId}</dt>
                <dd className="font-medium text-bora-ink-2">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </details>
  );
}
