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
});
