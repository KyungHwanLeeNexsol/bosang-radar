import type { z } from "zod";

// @MX:ANCHOR: [AUTO] 파이프라인의 모든 LLM 호출 지점이 의존하는 공통 인터페이스
// @MX:REASON: Researcher/Skeptic/Verifier 등 다수 파이프라인 단계(M4 예정)가
// 이 인터페이스에만 의존하므로, 시그니처 변경은 전체 파이프라인에 영향을 준다
// (plan.md §F, structure.md §lib/ai/).
//
// embed() 등 파이프라인이 실제로 사용하지 않는 메서드는 의도적으로 포함하지
// 않는다 — 현재 MVP는 vector DB/embedding 기반 검색을 도입하지 않는다
// (research.md §6-4, tech.md 참고).
export interface GenerateRequest {
  prompt: string;
  model?: string;
}

export interface GenerateResponse {
  text: string;
}

// SPEC-RESEARCH-001 M2: Zod 스키마 기반 구조화 출력 확장(design.md §4).
// zod는 이미 프로젝트 전역 의존성이고 Gemini 전용 SDK가 아니므로, 이 확장은
// REQ-RESEARCH-009/015가 금지하는 "Gemini SDK를 provider.ts 밖으로 노출"에
// 해당하지 않는다.
export interface GenerateStructuredRequest<T> {
  prompt: string;
  schema: z.ZodType<T>;
  model?: string;
}

export type StructuredResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "invalid_json" | "schema_validation_failed"; raw: string };

export interface LLMProvider {
  generate(request: GenerateRequest): Promise<GenerateResponse>;
  generateStructured<T>(request: GenerateStructuredRequest<T>): Promise<StructuredResult<T>>;
}
