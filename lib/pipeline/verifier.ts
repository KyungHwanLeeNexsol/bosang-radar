import type { LLMProvider } from "../ai/provider";
import { createMockLLMProvider } from "./mock-llm";
import type { Challenge, DraftFinding, VerifiedClaim } from "./types";

// Verifier (6/6) — 초안 소견과 반대 논리를 교차 검증해, 근거자료와 연결된
// 최종 VerifiedClaim을 생성한다(REQ-SCAFFOLD-013, REQ-SCAFFOLD-014).
// product.md §핵심 원칙 — "AI 판단은 evidence와 연결" — 을 satisfy하기 위해
// 각 claim은 supportingEvidenceIds를 유지한다. LLMProvider 인터페이스에만
// 의존하며 gemini.ts를 직접 import하지 않는다(REQ-SCAFFOLD-018).
//
// @MX:TODO: [AUTO] 이번 마일스톤은 mock LLMProvider를 사용하는 trivial
// 구현체다 — 실제 교차 검증 로직 고도화는 후속 SPEC에서 대체 예정
// (spec.md §4 파이프라인 로직 고도화, plan.md §F).
export async function verify(
  findings: DraftFinding[],
  challenges: Challenge[],
  provider: LLMProvider = createMockLLMProvider()
): Promise<VerifiedClaim[]> {
  const claims: VerifiedClaim[] = [];

  for (let index = 0; index < findings.length; index += 1) {
    const finding = findings[index];
    const counterArguments = challenges
      .filter((item) => item.findingIndex === index)
      .map((item) => item.counterArgument);

    const verification = await provider.generate({
      prompt: `${finding.summary}`,
    });

    claims.push({
      summary: `${finding.summary} (검증: ${verification.text})`,
      supportingEvidenceIds: finding.supportingEvidenceIds,
      counterArguments,
    });
  }

  return claims;
}
