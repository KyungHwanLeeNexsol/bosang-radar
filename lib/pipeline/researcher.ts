import { z } from "zod";
import type { LLMProvider } from "../ai/provider";
import type { DraftFinding, EvidenceCandidate, ResearchQuery } from "./types";

// Researcher (4/6) — 리서치 쿼리 + evidence로부터 초안 소견을 생성한다
// (REQ-RESEARCH-016/017). evidence-ID 무결성 1차 방어선(design.md §7)을
// 구조화 출력 시점에 적용한다: 각 쿼리에 실제로 전달된 evidence ID 집합으로
// 매개변수화된 Zod 스키마가 위조 ID를 .refine()에서 차단한다.
//
// @MX:ANCHOR: [AUTO] runPipeline()의 유일한 정상 앱 호출부(index.ts) 외에
// 형제 파이프라인 단계 모듈이 이 파일을 직접 import하지 않는다
// (AC-SCAFFOLD-012 — lib/pipeline/boundary.test.ts로 검증).
// @MX:REASON: 파이프라인 단계 모듈 간 형제-import를 금지하는 구조적 경계가
// evidence-ID 무결성 방어선의 위치(각 단계가 자신의 evidence만 본다)와
// 직접 맞물려 있다.
function buildFindingSchema(validEvidenceIds: readonly string[]) {
  const validSet = new Set(validEvidenceIds);
  return z.object({
    summary: z.string().min(1),
    supportingEvidenceIds: z
      .array(z.string())
      .min(1)
      .refine((ids) => ids.every((id) => validSet.has(id)), {
        message: "존재하지 않는 evidence ID가 포함되었습니다.",
      }),
  });
}

function buildResearchPrompt(query: ResearchQuery, evidence: EvidenceCandidate[]): string {
  const evidenceLines = evidence
    .map((item) => `- [${item.id}] ${item.title}: ${item.content}`)
    .join("\n");
  return [
    `쟁점: ${query.topic}`,
    `초점: ${query.focus}`,
    "아래 evidence 목록만을 근거로 검토 소견을 작성하라. 목록에 없는 evidence ID는 인용하지 말 것:",
    evidenceLines,
    "보험금 지급 확정, 반드시 지급, 구체적인 지급 확률·액수를 확정하는 표현은 사용하지 말 것 — " +
      '"검토 필요"/"관련 가능성 있음"/"현재 정보만으로 판단 불충분" 형태로만 서술할 것.',
  ].join("\n");
}

export async function research(
  queries: ResearchQuery[],
  evidence: Map<string, EvidenceCandidate[]>,
  provider: LLMProvider
): Promise<DraftFinding[]> {
  const findings: DraftFinding[] = [];

  for (const query of queries) {
    const queryEvidence = evidence.get(query.id) ?? [];

    // evidence가 없는 query는 억지 finding을 만들지 않고 그냥 건너뛴다
    // (design.md §7 4차 revision — Verifier가 원본 queries와 대조해
    // missingMaterials로 흡수한다).
    if (queryEvidence.length === 0) {
      continue;
    }

    const validEvidenceIds = queryEvidence.map((item) => item.id);
    const result = await provider.generateStructured({
      prompt: buildResearchPrompt(query, queryEvidence),
      schema: buildFindingSchema(validEvidenceIds),
    });

    // 구조화 검증 실패(위조 ID 포함 등)도 억지 finding 없이 건너뛴다 —
    // 동일하게 Verifier의 missingMaterials 경로로 흡수된다.
    if (!result.ok) {
      continue;
    }

    findings.push({
      queryId: query.id,
      summary: result.data.summary,
      supportingEvidenceIds: result.data.supportingEvidenceIds,
    });
  }

  return findings;
}
