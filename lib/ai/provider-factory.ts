import type { LLMProvider } from "./provider";
import { createDeterministicLLMProvider } from "./providers/deterministic";
import { GeminiProvider } from "./providers/gemini";

// SPEC-RESEARCH-001 M2: 오케스트레이터 수준 단일 provider 선택 지점
// (design.md §1). LLM_PROVIDER_MODE=deterministic이면 결정론적 provider를,
// 그 외에는 GeminiProvider를 반환한다.
//
// @MX:NOTE: provider 선택 조건(env.LLM_PROVIDER_MODE)과 GeminiProvider 생성자의
// apiKey(env.GEMINI_API_KEY)가 동일한 env 파라미터를 공유한다(design.md §1,
// 3차 revision) — 테스트가 주입한 env가 전역 process.env와 조용히 섞이는
// 경로를 구조적으로 차단하기 위함이다.
export function getLLMProvider(env: NodeJS.ProcessEnv = process.env): LLMProvider {
  if (env.LLM_PROVIDER_MODE === "deterministic") {
    return createDeterministicLLMProvider();
  }
  return new GeminiProvider({ apiKey: env.GEMINI_API_KEY });
}
