import type { CaseInput } from "../validation/case-input";

// 파이프라인 6단계(CaseNormalizer → QueryPlanner → EvidenceRetriever →
// Researcher → Skeptic → Verifier) 간에 공유되는 타입 입출력 계약
// (REQ-SCAFFOLD-013, AC-SCAFFOLD-012).
//
// 이 파일은 6개 파이프라인 "단계 모듈"에 포함되지 않는다 — index.ts를
// 제외한 어떤 단계 모듈도 형제 단계 모듈을 직접 import할 수 없다는 제약
// (AC-SCAFFOLD-012)을 지키면서도 각 단계가 공통 타입을 참조할 수 있도록,
// 타입 정의는 이 별도 파일로 분리한다.
//
// SPEC-RESEARCH-001 M1: QueryPlanner(§5)/EvidenceRetriever(§6)/evidence-ID
// 무결성(§7)/ResearchReport(§8) 타입 계약 확정. design.md §5/§6/§7/§8 참고.

export type { CaseInput };

export interface NormalizedCase {
  incidentDescription: string;
  diagnosisName: string;
  disabilityBodyPart: string;
  incidentDate: string;
  normalizedAt: string;
}

// --- QueryPlanner (design.md §5) --------------------------------------------

export type QueryIssueType =
  | "DISABILITY_LOCATION" // 장해 부위
  | "DIAGNOSIS" // 진단명
  | "INCIDENT_CIRCUMSTANCE" // 사고 경위
  | "INJURY_DISEASE_RELATION" // 상해·질병 관련성
  | "DISABILITY_GRADE_CRITERIA" // 장해 평가 기준 검토
  | "PRE_EXISTING_CONDITION" // 기왕증·퇴행성 가능성
  | "CAUSATION" // 인과관계 쟁점
  | "ADDITIONAL_CONFIRMATION_NEEDED"; // 추가 확인 필요 조건

export type CoverageDomain = "INJURY_DISABILITY" | "DISEASE_DISABILITY";

export interface ResearchQuery {
  id: string;
  topic: string;
  focus: string;
  domain: CoverageDomain;
  issueType: QueryIssueType;
  keywords: string[]; // EvidenceRetriever 필터링에 사용 (§6)
}

// --- EvidenceRetriever (design.md §6) ---------------------------------------

export type EvidenceType = "POLICY" | "PRECEDENT" | "DISPUTE_CASE" | "STATUTE" | "OTHER";
export type EvidenceScope = "DOMAIN_SPECIFIC" | "UNIVERSAL";

export interface EvidenceCandidate {
  id: string;
  category: string;
  evidenceType: EvidenceType;
  scope: EvidenceScope;
  title: string;
  content: string;
  sourceUrl: string | null;
}

export interface DraftFinding {
  queryId: string;
  summary: string;
  supportingEvidenceIds: string[];
}

// --- Skeptic / evidence-ID 무결성 (design.md §7) ----------------------------
//
// findingId는 LLM 구조화 출력에 포함되지 않는다 — challenge()가 findings 배열을
// 순회하는 과정에서 finding.queryId를 코드에서 직접 부여한다(4차 revision).

export interface Challenge {
  findingId: string; // finding.queryId — code-assigned, not part of the LLM schema
  counterArgument: string;
  supportingEvidenceIds?: string[]; // 반론을 뒷받침하는 evidence
  counterEvidenceIds?: string[]; // 반론이 반박 근거로 지목하는 evidence
}

// --- Verifier 반환 계약 (design.md §3, §7, §8) ------------------------------

export interface VerifiedCounterArgument {
  summary: string;
  supportingEvidenceIds: string[];
  counterEvidenceIds: string[];
}

export interface VerifiedClaim {
  summary: string;
  supportingEvidenceIds: string[];
  counterArguments: VerifiedCounterArgument[];
  status: "VERIFIED" | "INSUFFICIENT";
}

export interface MissingMaterial {
  description: string;
  relatedIssueType: QueryIssueType;
}

export interface VerificationResult {
  verifiedClaims: VerifiedClaim[];
  missingMaterials: MissingMaterial[];
  uncertainty: string[];
}

// --- ResearchReport (design.md §8) ------------------------------------------

export interface ReviewTarget {
  domain: CoverageDomain;
  issueType: QueryIssueType;
  description: string;
}

export interface ResearchReport {
  caseSummary: NormalizedCase;
  reviewTargets: ReviewTarget[];
  verifiedClaims: VerifiedClaim[];
  missingMaterials: MissingMaterial[];
  uncertainty: string[]; // 판단 불충분 사유 목록
  generatedAt: string;
}
