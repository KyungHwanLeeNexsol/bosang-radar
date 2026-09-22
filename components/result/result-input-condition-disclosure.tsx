"use client";

import * as React from "react";

import { readDiagnosisHandoff, type DiagnosisHandoffReadResult } from "@/lib/diagnosis/handoff";

// SPEC-B2C-RESULT-001 D2 (design.md "빠른 보기"/"입력 조건 더보기" 패턴,
// coverage-item-card.tsx "왜 확인해야 하나요?" disclosure와 동일한
// <details>/<summary> 접근성 패턴 재사용) — 01에서 제출한 입력 조건(원문
// 텍스트 + 추가 질문 응답)을 접근 가능한 disclosure로 재노출한다.
//
// [판단 근거 — 잔여 위험] result-view.tsx/result-input-summary.tsx는 이
// SPEC의 수정 허용 파일 목록에 없으므로, 이 위젯은 result-view.tsx가 이미
// 마운트 시 호출한 것과 별개로 readDiagnosisHandoff()(읽기 전용,
// sessionStorage를 절대 변경하지 않는다 — design.md §3)를 독립적으로
// 재호출해 데이터를 얻는다. `?devFixture=fracture` review 전용 진입
// 경로는 sessionStorage를 쓰지 않고 buildFractureResult()를 직접 렌더링해
// 우회하므로, 그 경로에서는 이 위젯이 "empty"로 판정되어 자체적으로
// 렌더링을 건너뛴다(그래도 페이지 자체는 정상 렌더링된다) — 정식
// 배치 결정은 result-view.tsx를 다시 열 수 있는 후속 milestone에서
// 재검토가 필요한 잔여 위험이다.
function getServerSnapshot(): DiagnosisHandoffReadResult {
  return { status: "empty" };
}

function useDiagnosisHandoffReadOnly(): DiagnosisHandoffReadResult {
  const snapshotRef = React.useRef<DiagnosisHandoffReadResult | null>(null);

  const getSnapshot = React.useCallback((): DiagnosisHandoffReadResult => {
    if (snapshotRef.current === null) {
      snapshotRef.current = readDiagnosisHandoff();
    }
    return snapshotRef.current;
  }, []);

  const subscribe = React.useCallback(() => () => {}, []);

  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function ResultInputConditionDisclosure() {
  const handoff = useDiagnosisHandoffReadOnly();

  if (handoff.status !== "valid") {
    return null;
  }

  const { rawInput, answers } = handoff.result;
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
