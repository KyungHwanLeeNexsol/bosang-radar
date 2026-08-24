import type { CaseInput, NormalizedCase } from "./types";

// CaseNormalizer (1/6) — 사건 입력을 정규화된 형태로 변환한다
// (REQ-SCAFFOLD-013). 이번 마일스톤은 trivial 구현체로, 공백 정리 +
// 정규화 시각 기록만 수행한다(plan.md §D 목업 우선 파이프라인).
export function normalizeCase(input: CaseInput): NormalizedCase {
  return {
    incidentDescription: input.incidentDescription.trim(),
    diagnosisName: input.diagnosisName.trim(),
    disabilityBodyPart: input.disabilityBodyPart.trim(),
    incidentDate: input.incidentDate.trim(),
    normalizedAt: new Date().toISOString(),
  };
}
