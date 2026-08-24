import type { CaseInput } from "../validation/case-input";

// 파이프라인 6단계(CaseNormalizer → QueryPlanner → EvidenceRetriever →
// Researcher → Skeptic → Verifier) 간에 공유되는 타입 입출력 계약
// (REQ-SCAFFOLD-013, AC-SCAFFOLD-012).
//
// 이 파일은 6개 파이프라인 "단계 모듈"에 포함되지 않는다 — index.ts를
// 제외한 어떤 단계 모듈도 형제 단계 모듈을 직접 import할 수 없다는 제약
// (AC-SCAFFOLD-012)을 지키면서도 각 단계가 공통 타입을 참조할 수 있도록,
// 타입 정의는 이 별도 파일로 분리한다.

export type { CaseInput };

export interface NormalizedCase {
  incidentDescription: string;
  diagnosisName: string;
  disabilityBodyPart: string;
  incidentDate: string;
  normalizedAt: string;
}

export interface ResearchQuery {
  id: string;
  topic: string;
  focus: string;
}

export interface EvidenceCandidate {
  id: string;
  category: string;
  title: string;
  content: string;
  sourceUrl: string | null;
}

export interface DraftFinding {
  queryId: string;
  summary: string;
  supportingEvidenceIds: string[];
}

export interface Challenge {
  findingIndex: number;
  counterArgument: string;
}

export interface VerifiedClaim {
  summary: string;
  supportingEvidenceIds: string[];
  counterArguments: string[];
}

export interface ResearchReport {
  caseSummary: NormalizedCase;
  claims: VerifiedClaim[];
  generatedAt: string;
}
