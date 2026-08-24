import type { NormalizedCase, ResearchQuery } from "./types";

// QueryPlanner (2/6) — 정규화된 사건으로부터 리서치 쿼리 목록을 생성한다
// (REQ-SCAFFOLD-013). 이번 마일스톤은 상해후유장해/질병후유장해 두 관점의
// 고정 쿼리를 trivial하게 생성한다(plan.md §D 목업 우선 파이프라인).
export function planQueries(normalizedCase: NormalizedCase): ResearchQuery[] {
  return [
    {
      id: "q-injury-disability",
      topic: `${normalizedCase.disabilityBodyPart} 상해후유장해 담보 검토`,
      focus: normalizedCase.disabilityBodyPart,
    },
    {
      id: "q-disease-disability",
      topic: `${normalizedCase.diagnosisName} 질병후유장해 담보 검토`,
      focus: normalizedCase.diagnosisName,
    },
  ];
}
