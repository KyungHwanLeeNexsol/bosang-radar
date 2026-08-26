import type { LLMProvider } from "../ai/provider";
import type {
  Challenge,
  DraftFinding,
  EvidenceCandidate,
  MissingMaterial,
  ResearchQuery,
  VerificationResult,
  VerifiedClaim,
  VerifiedCounterArgument,
} from "./types";

// Verifier (6/6) — Researcher의 claim과 Skeptic의 evidence 양쪽을 evidence
// 대비 재검증하는 2차 방어선(design.md §7 defense-in-depth)이자, 원본
// queries와 findings를 대조해 missingMaterials를 산출한다(4차 revision).
// product.md §핵심 원칙 — "AI 판단은 evidence와 연결" — 을 satisfy하기 위해
// 각 claim은 재검증을 통과한 supportingEvidenceIds만 유지한다.
//
// provider는 design.md §3의 균일한 (evidence…, provider) 트레일링 패턴을
// 맞추기 위한 필수 인자다 — 이번 마일스톤의 재검증 로직은 순수 구조적
// 대조이므로 provider를 호출하지 않는다(추후 LLM 보조 검증으로 확장될 수
// 있는 자리를 남겨 둔다).
export async function verify(
  queries: ResearchQuery[],
  findings: DraftFinding[],
  challenges: Challenge[],
  evidence: Map<string, EvidenceCandidate[]>,
  provider: LLMProvider
): Promise<VerificationResult> {
  void provider;

  const verifiedClaims: VerifiedClaim[] = [];
  const missingMaterials: MissingMaterial[] = [];
  const uncertainty: string[] = [];

  for (const finding of findings) {
    const validIds = new Set((evidence.get(finding.queryId) ?? []).map((item) => item.id));

    // (a) Researcher claim 재검증 — 위조 ID는 조용히 제거한다.
    const supportingEvidenceIds = finding.supportingEvidenceIds.filter((id) => validIds.has(id));
    const status: VerifiedClaim["status"] =
      supportingEvidenceIds.length > 0 ? "VERIFIED" : "INSUFFICIENT";

    if (status === "INSUFFICIENT") {
      uncertainty.push(
        `쿼리 ${finding.queryId}에 대한 소견을 뒷받침하는 유효한 근거자료가 없어 판단불충분으로 처리되었습니다.`
      );
    }

    // (b) Skeptic evidence 재검증 — 재검증을 통과한 evidence ID는 구조화된
    // 형태로 보존된다(design.md §7 3차 revision, §8 VerifiedCounterArgument).
    const counterArguments: VerifiedCounterArgument[] = challenges
      .filter((item) => item.findingId === finding.queryId)
      .map((item) => ({
        summary: item.counterArgument,
        supportingEvidenceIds: (item.supportingEvidenceIds ?? []).filter((id) => validIds.has(id)),
        counterEvidenceIds: (item.counterEvidenceIds ?? []).filter((id) => validIds.has(id)),
      }));

    verifiedClaims.push({
      summary: finding.summary,
      supportingEvidenceIds,
      counterArguments,
      status,
    });
  }

  // query↔finding 대조 — 대응하는 finding이 없는 query는 evidence 부재 또는
  // Researcher structured validation 실패로 인해 finding이 생성되지 못한
  // 경우다(design.md §7 4차 revision). relatedIssueType은 항상 대조된
  // ResearchQuery.issueType에서 직접 가져온다 — 추측하거나 기본값을 넣지
  // 않는다.
  for (const query of queries) {
    const hasFinding = findings.some((finding) => finding.queryId === query.id);
    if (hasFinding) {
      continue;
    }

    missingMaterials.push({
      description: `${query.topic}에 대한 근거자료가 부족하여 판단할 수 없습니다.`,
      relatedIssueType: query.issueType,
    });
    uncertainty.push(
      `쿼리 ${query.id}(${query.issueType})에 대해 검토할 소견을 생성하지 못해 추가 확인이 필요합니다.`
    );
  }

  return { verifiedClaims, missingMaterials, uncertainty };
}
