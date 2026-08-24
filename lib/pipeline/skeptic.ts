import type { LLMProvider } from "../ai/provider";
import { createMockLLMProvider } from "./mock-llm";
import type { Challenge, DraftFinding } from "./types";

// Skeptic (5/6) — 초안 소견마다 반대 논리(counter-argument)를 생성한다
// (REQ-SCAFFOLD-013, REQ-SCAFFOLD-014). Researcher와 마찬가지로
// LLMProvider 인터페이스에만 의존하며 gemini.ts를 직접 import하지 않는다
// (REQ-SCAFFOLD-018).
//
// @MX:TODO: [AUTO] 이번 마일스톤은 mock LLMProvider를 사용하는 trivial
// 구현체다 — 실제 반대 논리 생성 정교화는 후속 SPEC에서 대체 예정
// (spec.md §4 파이프라인 로직 고도화, plan.md §F).
export async function challenge(
  findings: DraftFinding[],
  provider: LLMProvider = createMockLLMProvider()
): Promise<Challenge[]> {
  const challenges: Challenge[] = [];

  for (let index = 0; index < findings.length; index += 1) {
    const finding = findings[index];
    const response = await provider.generate({
      prompt: `${finding.summary}`,
    });
    challenges.push({ findingIndex: index, counterArgument: response.text });
  }

  return challenges;
}
