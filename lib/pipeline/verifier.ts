import { z } from "zod";
import type { LLMProvider } from "../ai/provider";
import { findSafetyViolations } from "./safety-validator";
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
// 코드 리뷰 지적(Fix-B): 구조적 evidence-ID 존재 여부만 검증할 뿐, evidence의
// CONTENT가 실제로 claim을 뒷받침하는지는 전혀 검증하지 않았다 — 실존하지만
// 무관한 evidence ID 하나만 인용해도 "VERIFIED"가 될 수 있었다. 이 파일은
// 구조적 필터링(아래 (a)/(b))을 그대로 유지한 채, 그 위에 provider 기반
// 의미 검증 단계를 추가한다.

// --- 의미 검증(semantic verification) 단계 (Fix-B) --------------------------

interface SemanticVerificationItem {
  queryId: string;
  supported: boolean;
  reason: string;
}

interface SemanticCandidate {
  queryId: string;
  summary: string;
  evidenceItems: EvidenceCandidate[];
}

// 전체 배치를 한 번의 구조화 호출로 처리하기 위한 단일 스키마(비용 최소화).
// skeptic.ts의 buildChallengeSchema와 동일한 "LLM은 식별자를 지어낼 수
// 없다" 원칙을 적용한다: 반환된 모든 queryId는 실제로 전달된 candidate
// 집합의 원소여야 하고(.refine() 1), candidate 집합과 정확히 1:1
// 대응해야 한다(.refine() 2) — 누락도 중복도 허용하지 않는다.
function buildSemanticVerificationSchema(candidateQueryIds: readonly string[]) {
  const candidateSet = new Set(candidateQueryIds);
  return z
    .array(
      z.object({
        queryId: z.string(),
        supported: z.boolean(),
        reason: z.string().min(1),
      })
    )
    .refine((items) => items.every((item) => candidateSet.has(item.queryId)), {
      message: "후보 목록에 없는 queryId가 포함되었습니다.",
    })
    .refine(
      (items) =>
        items.length === candidateSet.size &&
        new Set(items.map((item) => item.queryId)).size === candidateSet.size,
      { message: "candidate 개수와 정확히 1:1로 대응해야 합니다(누락 또는 중복 금지)." }
    );
}

// 프롬프트에는 각 candidate의 queryId, 소견(summary), 그리고 구조적으로
// 유효한 evidence의 실제 title+content를 포함한다 — LLM이 ID만으로는
// content 기반 판단을 할 수 없기 때문이다. "쿼리 ID: <id>" 형태로 각
// candidate의 시작 줄을 고정해, deterministic provider가 정규식으로
// candidate queryId 집합을 추출할 수 있게 한다.
function buildSemanticVerificationPrompt(candidates: SemanticCandidate[]): string {
  const blocks = candidates.map((candidate) => {
    const evidenceLines = candidate.evidenceItems
      .map((item) => `  - [${item.id}] ${item.title}: ${item.content}`)
      .join("\n");
    return [
      `쿼리 ID: ${candidate.queryId}`,
      `소견: ${candidate.summary}`,
      "근거자료:",
      evidenceLines,
    ].join("\n");
  });

  return [
    "아래 각 소견(쿼리 ID별)이 제시된 근거자료의 실제 CONTENT로 뒷받침되는지 판단하라.",
    "새로운 사실·출처·evidence ID를 만들어내지 말 것 — 오직 주어진 근거자료 텍스트가",
    "주어진 소견의 구체적 쟁점을 실제로 다루는지만 판단할 것.",
    "근거자료가 주제상 실존하더라도 소견의 구체적 쟁점을 다루지 않으면 supported: false와",
    "함께 그 이유를 reason에 기록할 것.",
    "",
    blocks.join("\n\n"),
  ].join("\n");
}

interface WorkingClaim {
  finding: DraftFinding;
  supportingEvidenceIds: string[];
  status: VerifiedClaim["status"];
  counterArguments: VerifiedCounterArgument[];
}

export async function verify(
  queries: ResearchQuery[],
  findings: DraftFinding[],
  challenges: Challenge[],
  evidence: Map<string, EvidenceCandidate[]>,
  provider: LLMProvider
): Promise<VerificationResult> {
  const verifiedClaims: VerifiedClaim[] = [];
  const missingMaterials: MissingMaterial[] = [];
  const uncertainty: string[] = [];

  const working: WorkingClaim[] = [];

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

    working.push({ finding, supportingEvidenceIds, status, counterArguments });
  }

  // 구조적 필터링을 통과한(즉 유효 evidence ID가 1개 이상 남은) claim만
  // 의미 검증의 candidate가 된다 — 이미 INSUFFICIENT인 claim은 재확인할
  // 필요가 없다(이미 판단불충분).
  const candidates = working.filter((item) => item.status === "VERIFIED");

  if (candidates.length > 0) {
    const semanticCandidates: SemanticCandidate[] = candidates.map((item) => {
      const queryEvidence = evidence.get(item.finding.queryId) ?? [];
      return {
        queryId: item.finding.queryId,
        summary: item.finding.summary,
        evidenceItems: queryEvidence.filter((ev) => item.supportingEvidenceIds.includes(ev.id)),
      };
    });

    const result = await provider.generateStructured({
      prompt: buildSemanticVerificationPrompt(semanticCandidates),
      schema: buildSemanticVerificationSchema(candidates.map((item) => item.finding.queryId)),
    });

    if (!result.ok) {
      // Fail-closed(명시적 코드 리뷰 요구사항) — 호출 실패 시 fail-open(구조적
      // 검증만으로 VERIFIED를 유지)하지 않는다. 배치 내 모든 candidate를
      // INSUFFICIENT로 처리하고, 각각에 대해 실패 사유를 남긴다.
      for (const item of candidates) {
        item.status = "INSUFFICIENT";
        uncertainty.push(
          `쿼리 ${item.finding.queryId}에 대한 의미 검증을 완료하지 못해(${result.reason}) 판단불충분으로 처리되었습니다.`
        );
      }
    } else {
      const byQueryId = new Map<string, SemanticVerificationItem>(
        result.data.map((entry) => [entry.queryId, entry])
      );
      for (const item of candidates) {
        const semanticResult = byQueryId.get(item.finding.queryId);
        // .refine()이 candidate 집합과의 1:1 대응을 이미 보장하지만,
        // 방어적으로 누락 케이스도 INSUFFICIENT로 처리한다.
        if (!semanticResult) {
          item.status = "INSUFFICIENT";
          uncertainty.push(
            `쿼리 ${item.finding.queryId}에 대한 의미 검증 결과를 찾을 수 없어 판단불충분으로 처리되었습니다.`
          );
          continue;
        }
        if (!semanticResult.supported) {
          item.status = "INSUFFICIENT";
          uncertainty.push(`쿼리 ${item.finding.queryId}: ${semanticResult.reason}`);
        }
      }
    }
  }

  // 안전장치(safety-validator) defense-in-depth — 의미 검증 결과와 무관하게
  // 최종적으로 적용되는 마지막 방어선이다(코드 리뷰 지적). 현재 VERIFIED로
  // 남아 있는 claim의 summary와 그 counterArguments[].summary 전체에서
  // 금지 표현을 탐지하면 INSUFFICIENT로 강등한다.
  for (const item of working) {
    if (item.status !== "VERIFIED") {
      continue;
    }
    const hasViolation =
      findSafetyViolations(item.finding.summary).length > 0 ||
      item.counterArguments.some((ca) => findSafetyViolations(ca.summary).length > 0);
    if (hasViolation) {
      item.status = "INSUFFICIENT";
      uncertainty.push(
        `쿼리 ${item.finding.queryId}: 금지된 확정성 표현이 감지되어 판단불충분으로 처리되었습니다.`
      );
    }
  }

  for (const item of working) {
    verifiedClaims.push({
      summary: item.finding.summary,
      supportingEvidenceIds: item.supportingEvidenceIds,
      counterArguments: item.counterArguments,
      status: item.status,
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
