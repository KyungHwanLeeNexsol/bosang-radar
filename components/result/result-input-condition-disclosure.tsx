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
//
// SPEC-B2C-RESULT-001 D3(후속 리뷰) — 시각 정합성 재측정 결과, 이 위젯은
// design.md의 02 목업에서 "입력하신 사고 내용" 카드 안, "추가 질문 답변"
// 라벨과 같은 줄 우측에 짧은 텍스트 링크(박스 없음)로 배치돼 있다 — 이전에는
// ResultFinalCta(페이지 최하단)에 전체폭 테두리 박스로 배치돼 있어 카드 배경
// 불균일 편차 + 페이지 최하단 배경 프로브 오염의 원인이었다. 렌더링 위치는
// result-input-summary.tsx로 옮기고, 스타일은 원래 의도(coverage-item-card.tsx
// "왜 확인해야 하나요?"와 동일한 박스 없는 텍스트 링크)로 되돌린다.
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
      className="shrink-0 text-label-s text-bora-ink-3"
    >
      <summary className="cursor-pointer list-none font-medium text-bora-accent">
        입력 조건 더보기
      </summary>
      <div className="mt-2 flex flex-col gap-2 text-left">
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
