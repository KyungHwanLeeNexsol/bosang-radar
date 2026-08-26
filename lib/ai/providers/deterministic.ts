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

// M5: researcher.ts/skeptic.ts는 프롬프트에 "- [id] title: content" 형태로
// 실제 evidence ID를 임베딩한다(design.md §7). M2 시점에는 호출 시점에만
// 알 수 있는 validEvidenceIds 집합을 이 파일에서 미리 알 수 없어 고정
// 후보만 시도하는 폴백만 존재했다 — 이제 프롬프트에서 실제 ID를 추출해
// 그 ID로 채운 픽스처를 먼저 시도한다. 이렇게 하면 buildFindingSchema/
// buildChallengeSchema의 .refine() 검증(호출별 validEvidenceIds 집합)을
// 실제로 satisfy하는 응답을 만들 수 있어, E2E가 결정론적 provider로도
// 파이프라인 전 구간(구조화 검증 통과 경로)을 의미 있게 검증할 수 있다.
function extractEvidenceIdsFromPrompt(prompt: string): string[] {
  const matches = prompt.matchAll(/\[([^\]\s]+)\]/g);
  return Array.from(matches, (match) => match[1]);
}

function structuredFixturesForPrompt(prompt: string): readonly unknown[] {
  const evidenceIds = extractEvidenceIdsFromPrompt(prompt);
  if (evidenceIds.length === 0) {
    // 프롬프트에서 evidence ID를 추출하지 못한 경우(evidence-ID 기반이
    // 아닌 다른 schema 형태 등) — 기존 고정 후보 폴백으로 견고성을 유지한다.
    return candidateStructuredFixtures();
  }

  const [firstId] = evidenceIds;
  return [
    {
      summary: "[deterministic] 결정론적 고정 소견입니다.",
      supportingEvidenceIds: [firstId],
    },
    {
      counterArgument: "[deterministic] 결정론적 고정 반론입니다.",
      supportingEvidenceIds: [firstId],
      counterEvidenceIds: [],
    },
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
      const candidates = structuredFixturesForPrompt(request.prompt);
      for (const candidate of candidates) {
        const result = request.schema.safeParse(candidate);
        if (result.success) {
          return { ok: true, data: result.data };
        }
      }
      return {
        ok: false,
        reason: "schema_validation_failed",
        raw: JSON.stringify(candidates[0]),
      };
    },
  };
}
