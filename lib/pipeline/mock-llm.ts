import type { GenerateRequest, GenerateResponse, LLMProvider } from "../ai/provider";

// M4 기본 mock LLM provider — 실제 Gemini 호출 없이 trivial pass-through로
// 파이프라인 end-to-end 배선만 검증한다(plan.md §D "목업 우선 파이프라인").
// 이 파일은 6개 파이프라인 "단계 모듈"에 포함되지 않으므로, researcher.ts /
// skeptic.ts / verifier.ts가 이 파일을 import해도 AC-SCAFFOLD-012의 형제
// 단계 모듈 간 import 금지 제약을 위반하지 않는다.
export function createMockLLMProvider(): LLMProvider {
  return {
    async generate(request: GenerateRequest): Promise<GenerateResponse> {
      return { text: `[mock] ${request.prompt}` };
    },
  };
}
