import { z } from "zod";
import type { LLMProvider } from "../ai/provider";
import { findSafetyViolations } from "./safety-validator";
import type { Challenge, DraftFinding, EvidenceCandidate } from "./types";

// Skeptic (5/6) — 초안 소견마다 보험사 관점의 반대 논리를 생성한다
// (REQ-RESEARCH-018). SPEC-GEMINI-RUNTIME-001 M2: finding 개수만큼(N회)
// 호출하던 것을 사건당 1회 논리적 배치 호출로 전환한다(REQ-GEMINI-RUNTIME-005).
// findingId는 LLM 구조화 출력에 포함되지 않는다 — 배치 응답의 queryId를
// code가 candidate finding.queryId와 매칭시켜 findingId로 직접 부여한다
// (M2 배치 재설계, design.md §2/§6 마커 규칙).
//
// Researcher와 달리 Skeptic 항목에는 supportingEvidenceIds.length>=1 그라운딩
// 재검증을 적용하지 않는다 — 빈 evidence 배열을 그대로 허용하는 기존 계약을
// 유지한다(REQ-GEMINI-RUNTIME-007 비대칭 서술).
const idArraySchema = z.array(z.string()).optional().default([]);

const challengeItemSchema = z.object({
  queryId: z.string(),
  counterArgument: z.string(),
  // supportingEvidenceIds: 보험사 관점에서 이 반론(counterArgument) 자체를
  // 뒷받침하는 근거. counterEvidenceIds: 피보험자·청구인 관점에서 이 반론에
  // 대해 반박 근거로 제시할 수 있는 근거. 두 필드는 서로 다른 역할이다
  // (design.md §2 Requirement C, REQ-GEMINI-RUNTIME-009).
  supportingEvidenceIds: idArraySchema,
  counterEvidenceIds: idArraySchema,
});

function buildChallengeBatchSchema() {
  return z.object({
    challenges: z.array(challengeItemSchema),
  });
}

function buildChallengeBatchPrompt(
  findings: DraftFinding[],
  evidenceMap: Map<string, EvidenceCandidate[]>
): string {
  const blocks = findings.map((finding) => {
    const evidence = evidenceMap.get(finding.queryId) ?? [];
    const evidenceLines = evidence
      .map((item) => `- [${item.id}] ${item.title}: ${item.content}`)
      .join("\n");
    return [
      `[SKEPTIC] 쿼리 ID: ${finding.queryId}`,
      `소견: ${finding.summary}`,
      "아래 evidence 목록을 참고해 보험사 관점에서 실제로 제기될 수 있는 반론을 작성하라. 목록에 없는 evidence ID는 인용하지 말 것:",
      evidenceLines,
    ].join("\n");
  });

  return [
    ...blocks,
    "각 쿼리 ID에 대해 challenges 배열에 정확히 한 개의 항목을 생성하라. 각 항목의 queryId 필드에는 " +
      "그 항목이 대응하는 쿼리 ID를 그대로 반환할 것.",
    "supportingEvidenceIds에는 보험사 관점에서 이 반론(counterArgument) 자체를 뒷받침하는 근거를, " +
      "counterEvidenceIds에는 피보험자·청구인 측이 이 반론에 대해 반박 근거로 제시할 수 있는 근거를 " +
      "각각 인용하라 — 두 필드는 서로 다른 역할이다.",
    "기왕증/퇴행성 변화/인과관계 부족/약관상 기준 미충족/자료 부족/사고 이전 증상 중 실제로 해당하는 관점을 반영할 것.",
  ].join("\n\n");
}

export async function challenge(
  findings: DraftFinding[],
  evidenceMap: Map<string, EvidenceCandidate[]>,
  provider: LLMProvider
): Promise<Challenge[]> {
  if (findings.length === 0) {
    return [];
  }

  const validEvidenceByQuery = new Map<string, Set<string>>(
    findings.map((finding) => [
      finding.queryId,
      new Set((evidenceMap.get(finding.queryId) ?? []).map((item) => item.id)),
    ])
  );
  const candidateQueryIds = new Set(findings.map((finding) => finding.queryId));

  const result = await provider.generateStructured({
    prompt: buildChallengeBatchPrompt(findings, evidenceMap),
    schema: buildChallengeBatchSchema(),
  });

  // 배치 응답 전체가 최상위에서 파싱 불가능한 진짜 구조적 실패는 이번 호출
  // 전체를 challenges 없음으로 처리한다.
  if (!result.ok) {
    return [];
  }

  const challenges: Challenge[] = [];
  const seenQueryIds = new Set<string>();

  for (const item of result.data.challenges) {
    // (1) candidate 소속 확인
    if (!candidateQueryIds.has(item.queryId)) {
      continue;
    }
    // (2) 중복 응답 처리 — 첫 응답만 채택
    if (seenQueryIds.has(item.queryId)) {
      continue;
    }
    seenQueryIds.add(item.queryId);

    // (3) 양쪽 evidence 배열 모두 그 finding 고유의 유효 집합의 부분집합인지
    // 확인한다(query별 evidence 격리, REQ-GEMINI-RUNTIME-008). Researcher와
    // 달리 length>=1 그라운딩 재검증은 적용하지 않는다 — 빈 배열을 허용한다.
    const validIds = validEvidenceByQuery.get(item.queryId);
    if (
      !validIds ||
      !item.supportingEvidenceIds.every((id) => validIds.has(id)) ||
      !item.counterEvidenceIds.every((id) => validIds.has(id))
    ) {
      continue;
    }

    // (4) safety-validator — 보험금 지급 확정성 금지 표현 방어선.
    if (findSafetyViolations(item.counterArgument).length > 0) {
      continue;
    }

    challenges.push({
      findingId: item.queryId, // 코드로 직접 부여 — LLM 구조화 출력에는 findingId가 없다
      counterArgument: item.counterArgument,
      supportingEvidenceIds: item.supportingEvidenceIds,
      counterEvidenceIds: item.counterEvidenceIds,
    });
  }

  return challenges;
}
