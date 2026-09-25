import type { CoverageItem, FactChip } from "./types";

// SPEC-B2C-RESULT-001 M1 — 상단 집계 배너와 "추가 질문 답변" strip이
// 소비하는 순수 파생 함수(design.md §2). 어떤 예시 숫자도 코드에 상수로
// 고정하지 않는다(REQ-B2CRESULT-002).

export interface DiagnosisAggregate {
  total: number;
  review: number;
  needsInfo: number;
  lowLikelihood: number;
}

/**
 * items 배열로부터 상단 집계 배너의 네 숫자를 매번 동적으로 산출한다
 * (REQ-B2CRESULT-002). 하드코딩된 상수는 없다.
 */
export function computeAggregate(items: readonly CoverageItem[]): DiagnosisAggregate {
  return items.reduce<DiagnosisAggregate>(
    (acc, item) => {
      if (item.status === "review") acc.review += 1;
      else if (item.status === "needs-info") acc.needsInfo += 1;
      else acc.lowLikelihood += 1;
      return acc;
    },
    { total: items.length, review: 0, needsInfo: 0, lowLikelihood: 0 }
  );
}

/**
 * "입력하신 사고 내용" 카드의 "추가 질문 답변" strip이 소비하는 값. 별도
 * DiagnosisResult 저장 필드가 아니라 items[].factChips의 순수 파생값이다 —
 * questionId 기준으로 중복을 제거하며, items 배열과 각 item의 factChips
 * 배열을 그 순서 그대로 스캔해 먼저 발견된 항목을 유지한다
 * (REQ-B2CRESULT-001/007/008). rawInput/answers를 직접 재순회하지 않는다 —
 * SSOT는 항상 items[].factChips다.
 */
export function collectAnsweredFacts(items: readonly CoverageItem[]): FactChip[] {
  const seen = new Set<string>();
  const result: FactChip[] = [];

  for (const item of items) {
    for (const chip of item.factChips) {
      if (seen.has(chip.questionId)) continue;
      seen.add(chip.questionId);
      result.push(chip);
    }
  }

  return result;
}
