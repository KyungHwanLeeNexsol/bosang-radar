import type {
  GenerateRequest,
  GenerateResponse,
  GenerateStructuredRequest,
  LLMProvider,
  StructuredResult,
} from "../provider";

// SPEC-RESEARCH-001 M2: mock-llm.ts를 대체하는 결정론적(deterministic) provider
// (design.md §1, §9 파일 변경 맵). generate()는 기존 mock과 동일한 형태를
// 유지하고, generateStructured()는 요청된 Zod 스키마를 실제로 satisfy하는
// 고정 픽스처를 반환한다 — 스키마 검증을 우회하지 않고 통과시켜 E2E가
// 파이프라인 전 구간을 의미 있게 검증할 수 있게 한다.
//
// @MX:NOTE: 픽스처는 호출 순서와 무관하게 스키마 shape만으로 응답을 결정하는
// 단순 dispatch로 구현한다(design.md §1). M5에서 도입될 buildFindingSchema/
// buildChallengeSchema(design.md §7)는 호출 시점에만 알 수 있는
// validEvidenceIds 집합으로 .refine() 검증을 매개변수화하므로, 이 시점에는
// 그 정확한 유효 ID 집합을 알 수 없다 — 아래 후보 목록은 "DraftFinding 형태"
// 및 "Challenge 형태"를 모사하는 여러 후보를 순서대로 시도해, 실제로 주어진
// schema.safeParse()를 통과하는 첫 번째 후보를 사용하는 일반화된 폴백이다.
function candidateStructuredFixtures(): readonly unknown[] {
  return [
    // DraftFinding 형태 후보 (design.md §7 buildFindingSchema — summary +
    // supportingEvidenceIds, 최소 1개 evidence ID 필요).
    {
      summary: "[deterministic] 결정론적 고정 소견입니다.",
      supportingEvidenceIds: ["evidence-placeholder-1"],
    },
    // Challenge 형태 후보 (design.md §7 buildChallengeSchema — counterArgument +
    // 두 evidence ID 배열, 둘 다 optional/기본 빈 배열 허용).
    {
      counterArgument: "[deterministic] 결정론적 고정 반론입니다.",
      supportingEvidenceIds: [],
      counterEvidenceIds: [],
    },
  ];
}

export function createDeterministicLLMProvider(): LLMProvider {
  return {
    async generate(request: GenerateRequest): Promise<GenerateResponse> {
      return { text: `[deterministic] ${request.prompt}` };
    },

    async generateStructured<T>(
      request: GenerateStructuredRequest<T>
    ): Promise<StructuredResult<T>> {
      for (const candidate of candidateStructuredFixtures()) {
        const result = request.schema.safeParse(candidate);
        if (result.success) {
          return { ok: true, data: result.data };
        }
      }
      return {
        ok: false,
        reason: "schema_validation_failed",
        raw: JSON.stringify(candidateStructuredFixtures()[0]),
      };
    },
  };
}
