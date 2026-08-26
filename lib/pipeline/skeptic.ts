import { z } from "zod";
import type { LLMProvider } from "../ai/provider";
import type { Challenge, DraftFinding, EvidenceCandidate } from "./types";

// Skeptic (5/6) — 초안 소견마다 보험사 관점의 반대 논리를 생성한다
// (REQ-RESEARCH-018). Researcher와 동일한 1차 방어선 패턴을 evidence-ID
// 인용에 적용한다(design.md §7). findingId는 LLM 구조화 출력에 포함되지
// 않는다 — 아래 루프가 finding을 순회하는 과정에서 finding.queryId를
// 코드로 직접 부여한다(4차 revision).
function buildChallengeSchema(validEvidenceIds: readonly string[]) {
  const validSet = new Set(validEvidenceIds);
  const idArray = z.array(z.string()).refine((ids) => ids.every((id) => validSet.has(id)), {
    message: "존재하지 않는 evidence ID가 포함되었습니다.",
  });
  return z.object({
    counterArgument: z.string().min(1),
    supportingEvidenceIds: idArray.optional().default([]),
    counterEvidenceIds: idArray.optional().default([]),
  });
}

function buildChallengePrompt(finding: DraftFinding, evidence: EvidenceCandidate[]): string {
  const evidenceLines = evidence
    .map((item) => `- [${item.id}] ${item.title}: ${item.content}`)
    .join("\n");
  return [
    `소견: ${finding.summary}`,
    "아래 evidence 목록을 참고해 보험사 관점에서 실제로 제기될 수 있는 반론을 작성하라. 목록에 없는 evidence ID는 인용하지 말 것:",
    evidenceLines,
    "기왕증/퇴행성 변화/인과관계 부족/약관상 기준 미충족/자료 부족/사고 이전 증상 중 실제로 해당하는 관점을 반영할 것.",
  ].join("\n");
}

export async function challenge(
  findings: DraftFinding[],
  evidenceMap: Map<string, EvidenceCandidate[]>,
  provider: LLMProvider
): Promise<Challenge[]> {
  const challenges: Challenge[] = [];

  for (const finding of findings) {
    const queryEvidence = evidenceMap.get(finding.queryId) ?? [];
    const validEvidenceIds = queryEvidence.map((item) => item.id);

    const result = await provider.generateStructured({
      prompt: buildChallengePrompt(finding, queryEvidence),
      schema: buildChallengeSchema(validEvidenceIds),
    });

    // Skeptic의 반론은 finding마다 필수가 아니다(REQ-RESEARCH-018) — 구조화
    // 검증 실패 시 해당 finding에 대한 challenge를 그냥 생략한다.
    if (!result.ok) {
      continue;
    }

    challenges.push({
      findingId: finding.queryId, // 코드로 직접 부여 — LLM 구조화 출력에는 없음
      counterArgument: result.data.counterArgument,
      supportingEvidenceIds: result.data.supportingEvidenceIds,
      counterEvidenceIds: result.data.counterEvidenceIds,
    });
  }

  return challenges;
}
