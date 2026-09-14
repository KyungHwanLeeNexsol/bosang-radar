import type {
  DraftFinding,
  EvidenceCandidate,
  QueryIssueType,
  ResearchQuery,
  VerificationResult,
} from "./types";

export type ResearchTier = "lite" | "premium";

export interface ResearchRoutingDecision {
  tier: ResearchTier;
  reason: "standard_case" | "complex_issue" | "lite_incomplete" | "lite_insufficient";
}

// 규칙 기반 QueryPlanner가 사건 입력에서 명시적으로 감지한 복합 신호만
// 선제 승격한다. CAUSATION 등 모든 사건에 생성되는 기본 쟁점은 포함하지 않는다.
const PREMIUM_ISSUE_TYPES = new Set<QueryIssueType>([
  "PRE_EXISTING_CONDITION",
  "INJURY_DISEASE_RELATION",
  "ADDITIONAL_CONFIRMATION_NEEDED",
]);

export function selectInitialResearchTier(queries: ResearchQuery[]): ResearchRoutingDecision {
  return queries.some((query) => PREMIUM_ISSUE_TYPES.has(query.issueType))
    ? { tier: "premium", reason: "complex_issue" }
    : { tier: "lite", reason: "standard_case" };
}

export function selectEscalation(
  queries: ResearchQuery[],
  evidence: Map<string, EvidenceCandidate[]>,
  findings: DraftFinding[],
  verification: VerificationResult
): ResearchRoutingDecision | null {
  const evidenceBackedQueryIds = new Set(
    queries.filter((query) => (evidence.get(query.id) ?? []).length > 0).map((query) => query.id)
  );

  // 근거 자체가 없는 쿼리는 모델을 바꿔도 해결되지 않는다. 근거가 전달됐는데
  // Lite가 finding을 만들지 못한 경우만 상위 모델 재검토 대상으로 삼는다.
  const findingQueryIds = new Set(findings.map((finding) => finding.queryId));
  const hasMissingFinding = [...evidenceBackedQueryIds].some((id) => !findingQueryIds.has(id));
  if (hasMissingFinding) {
    return { tier: "premium", reason: "lite_incomplete" };
  }

  if (verification.verifiedClaims.some((claim) => claim.status === "INSUFFICIENT")) {
    return { tier: "premium", reason: "lite_insufficient" };
  }

  return null;
}

export function preferPremiumVerification(
  lite: VerificationResult,
  premium: VerificationResult
): boolean {
  const verifiedCount = (result: VerificationResult) =>
    result.verifiedClaims.filter((claim) => claim.status === "VERIFIED").length;
  const premiumVerified = verifiedCount(premium);
  const liteVerified = verifiedCount(lite);

  if (premiumVerified !== liteVerified) {
    return premiumVerified > liteVerified;
  }

  // 검증 통과 수가 같으면 재검토를 수행한 상위 모델 결과를 채택한다. 단,
  // 상위 모델이 더 많은 불확실성을 새로 만든 경우에는 기존 Lite 결과를 보존한다.
  return premium.uncertainty.length <= lite.uncertainty.length;
}
