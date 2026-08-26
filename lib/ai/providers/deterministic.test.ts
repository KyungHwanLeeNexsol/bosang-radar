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

  // Fix-B: verifier.ts의 의미 검증 스키마(SemanticVerificationItem[])는
  // DraftFinding/Challenge 형태와 다르다 — 프롬프트에 임베딩된
  // "쿼리 ID: <id>" 줄에서 candidate queryId를 추출해, 각 후보에 대해
  // supported: true인 happy-path 항목 하나씩을 만든 배열을 반환해야 한다.
  it("프롬프트에 임베딩된 '쿼리 ID: <id>' 줄에서 candidate를 추출해 SemanticVerificationItem[] 스키마를 satisfy하는 happy-path 배열을 반환한다", async () => {
    const provider = createDeterministicLLMProvider();
    const candidateIds = new Set(["q1", "q2"]);
    const semanticSchema = z
      .array(
        z.object({
          queryId: z.string(),
          supported: z.boolean(),
          reason: z.string().min(1),
        })
      )
      .refine((items) => items.every((item) => candidateIds.has(item.queryId)), {
        message: "후보 목록에 없는 queryId가 포함되었습니다.",
      })
      .refine(
        (items) =>
          items.length === candidateIds.size &&
          new Set(items.map((item) => item.queryId)).size === candidateIds.size,
        { message: "candidate 개수와 정확히 1:1로 대응해야 합니다." }
      );
    const prompt = [
      "쿼리 ID: q1",
      "소견: s1",
      "근거자료:",
      "  - [e1] title-e1: content-e1",
      "",
      "쿼리 ID: q2",
      "소견: s2",
      "근거자료:",
      "  - [e2] title-e2: content-e2",
    ].join("\n");

    const result = await provider.generateStructured({ prompt, schema: semanticSchema });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(2);
      expect(result.data.map((item) => item.queryId).sort()).toEqual(["q1", "q2"]);
      expect(result.data.every((item) => item.supported === true)).toBe(true);
      expect(result.data.every((item) => item.reason.length > 0)).toBe(true);
    }
  });

  it("의미 검증 candidate 추출에 성공했더라도 스키마를 satisfy하지 못하면(candidate 집합 불일치) 기존 폴백 경로로 진행한다", async () => {
    const provider = createDeterministicLLMProvider();
    // schema가 요구하는 candidate 집합("q-other")과 프롬프트에서 추출되는
    // queryId("q1")가 불일치하도록 구성 — happy-path 픽스처가 .refine()을
    // 통과하지 못하는 경우, 기존 small-candidate-set 폴백으로 진행해도
    // 정상적으로 schema_validation_failed를 반환해야 한다(크래시 없음).
    const mismatchedSchema = z
      .array(z.object({ queryId: z.string(), supported: z.boolean(), reason: z.string().min(1) }))
      .refine((items) => items.every((item) => item.queryId === "q-other"), {
        message: "불일치",
      });
    const prompt = "쿼리 ID: q1\n소견: s1\n근거자료:\n  - [e1] title-e1: content-e1";

    const result = await provider.generateStructured({ prompt, schema: mismatchedSchema });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("schema_validation_failed");
    }
  });
});
