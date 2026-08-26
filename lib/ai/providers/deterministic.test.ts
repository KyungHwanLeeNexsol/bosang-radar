import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createDeterministicLLMProvider } from "./deterministic";

describe("lib/ai/providers/deterministic createDeterministicLLMProvider (SPEC-RESEARCH-001 M2, design.md §1)", () => {
  it("generate()는 기존 mock과 동일하게 [deterministic] 접두사를 붙여 반환한다", async () => {
    const provider = createDeterministicLLMProvider();

    const result = await provider.generate({ prompt: "질의" });

    expect(result.text).toBe("[deterministic] 질의");
  });

  it("generateStructured()는 DraftFinding 형태(summary + supportingEvidenceIds)의 스키마를 satisfy하는 픽스처를 반환한다", async () => {
    const provider = createDeterministicLLMProvider();
    const findingSchema = z.object({
      summary: z.string().min(1),
      supportingEvidenceIds: z.array(z.string()).min(1),
    });

    const result = await provider.generateStructured({ prompt: "질의", schema: findingSchema });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.summary.length).toBeGreaterThan(0);
      expect(result.data.supportingEvidenceIds.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("generateStructured()는 Challenge 형태(counterArgument + 두 evidence ID 배열)의 스키마를 satisfy하는 픽스처를 반환한다", async () => {
    const provider = createDeterministicLLMProvider();
    const challengeSchema = z.object({
      counterArgument: z.string().min(1),
      supportingEvidenceIds: z.array(z.string()).optional().default([]),
      counterEvidenceIds: z.array(z.string()).optional().default([]),
    });

    const result = await provider.generateStructured({ prompt: "질의", schema: challengeSchema });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.counterArgument.length).toBeGreaterThan(0);
    }
  });

  it("어떤 후보 픽스처도 스키마를 satisfy하지 못하면 schema_validation_failed를 반환한다", async () => {
    const provider = createDeterministicLLMProvider();
    const impossibleSchema = z.object({
      thisFieldDoesNotExistInAnyFixture: z.string(),
    });

    const result = await provider.generateStructured({ prompt: "질의", schema: impossibleSchema });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("schema_validation_failed");
    }
  });

  // M5: researcher.ts/skeptic.ts는 프롬프트에 "- [id] title: content" 형태로
  // 실제 evidence ID를 임베딩한다(design.md §7 buildFindingSchema/
  // buildChallengeSchema). M2 시점에는 호출 시점에만 알 수 있는
  // validEvidenceIds 집합을 미리 알 수 없어 고정 후보만 시도했으나, M5부터는
  // 프롬프트에서 실제 ID를 추출해 그 ID로 채운 픽스처를 우선 시도한다.
  it("프롬프트에 임베딩된 실제 evidence ID를 추출해 그 ID로 스키마의 .refine() 검증을 통과한다", async () => {
    const provider = createDeterministicLLMProvider();
    const validIds = ["ev-real-123"];
    const validSet = new Set(validIds);
    const findingSchema = z.object({
      summary: z.string().min(1),
      supportingEvidenceIds: z
        .array(z.string())
        .min(1)
        .refine((ids) => ids.every((id) => validSet.has(id)), {
          message: "존재하지 않는 evidence ID가 포함되었습니다.",
        }),
    });
    const prompt = "쟁점: 테스트\n다음 evidence만 근거로 사용할 것:\n- [ev-real-123] 제목: 내용";

    const result = await provider.generateStructured({ prompt, schema: findingSchema });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.supportingEvidenceIds).toEqual(["ev-real-123"]);
    }
  });

  it("프롬프트에 evidence ID가 없으면 기존 고정 후보 픽스처로 폴백한다", async () => {
    const provider = createDeterministicLLMProvider();
    const schema = z.object({
      summary: z.string().min(1),
      supportingEvidenceIds: z.array(z.string()).min(1),
    });

    const result = await provider.generateStructured({
      prompt: "브래킷이 없는 질의",
      schema,
    });

    expect(result.ok).toBe(true);
  });
});
