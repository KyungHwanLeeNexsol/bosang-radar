import type { LLMProvider } from "../ai/provider";
import { createMockLLMProvider } from "./mock-llm";
import type { DraftFinding, EvidenceCandidate, ResearchQuery } from "./types";

// Researcher (4/6) — 리서치 쿼리 + 근거자료로부터 초안 소견을 생성한다
// (REQ-SCAFFOLD-013, REQ-SCAFFOLD-014). 실제 LLM 호출 대신 lib/ai/provider.ts
// 의 LLMProvider 인터페이스를 통해서만 소견을 생성하며, gemini.ts를 직접
// import하지 않는다(REQ-SCAFFOLD-018).
//
// @MX:TODO: [AUTO] 이번 마일스톤은 mock LLMProvider를 사용하는 trivial
// 구현체다 — 실제 LLM 기반 소견 생성/프롬프트 엔지니어링은 후속 SPEC에서
// 대체 예정(spec.md §4 파이프라인 로직 고도화, plan.md §F).
export async function research(
  queries: ResearchQuery[],
  evidence: EvidenceCandidate[],
  provider: LLMProvider = createMockLLMProvider()
): Promise<DraftFinding[]> {
  const supportingEvidenceIds = evidence.map((item) => item.id);
  const findings: DraftFinding[] = [];

  for (const query of queries) {
    const response = await provider.generate({ prompt: query.topic });
    findings.push({
      queryId: query.id,
      summary: response.text,
      supportingEvidenceIds,
    });
  }

  return findings;
}
