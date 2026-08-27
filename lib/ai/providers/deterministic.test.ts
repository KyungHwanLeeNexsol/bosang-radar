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

  // Fix-B + item 1: verifier.ts의 의미 검증 스키마는 DraftFinding/Challenge
  // 형태와 다르다 — { claims: [...], counterArguments: [...] } 형태이고,
  // 프롬프트에 임베딩된 "쿼리 ID: <id>" 줄에서 claim candidate를,
  // "반론 쿼리 ID: <id>" + "반론 번호: <n>" 줄에서 counterArgument
  // candidate를 각각 추출해, 실제로 전달된 evidence ID로 채운 happy-path
  // 항목을 만들어야 한다(item 1: supportedEvidenceIds가 실제 후보 evidence
  // ID의 부분집합이어야 한다는 .refine() 요구사항 만족).
  it("프롬프트에 임베딩된 claim/counterArgument candidate를 추출해 { claims, counterArguments } 스키마를 satisfy하는 happy-path를 반환한다", async () => {
    const provider = createDeterministicLLMProvider();
    const claimQueryIds = new Set(["q1", "q2"]);
    const caKeys = new Set(["q1::0"]);
    const semanticSchema = z.object({
      claims: z
        .array(
          z.object({
            queryId: z.string(),
            supportedEvidenceIds: z.array(z.string()),
            reason: z.string().min(1),
          })
        )
        .refine((items) => items.every((item) => claimQueryIds.has(item.queryId)), {
          message: "후보 목록에 없는 queryId가 포함되었습니다.",
        })
        .refine(
          (items) =>
            items.length === claimQueryIds.size &&
            new Set(items.map((item) => item.queryId)).size === claimQueryIds.size,
          { message: "candidate 개수와 정확히 1:1로 대응해야 합니다." }
        ),
      counterArguments: z
        .array(
          z.object({
            queryId: z.string(),
            counterArgumentIndex: z.number().int().nonnegative(),
            supportedEvidenceIds: z.array(z.string()),
            counterEvidenceIds: z.array(z.string()),
            reason: z.string().min(1),
          })
        )
        .refine(
          (items) =>
            items.every((item) => caKeys.has(`${item.queryId}::${item.counterArgumentIndex}`)),
          { message: "후보 목록에 없는 반론이 포함되었습니다." }
        ),
    });
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
      "",
      "반론 쿼리 ID: q1",
      "반론 번호: 0",
      "반론 내용: 반론입니다",
      "뒷받침 근거자료(supportingEvidence):",
      "  - [e1] title-e1: content-e1",
      "반박 근거자료(counterEvidence):",
      "  (없음)",
    ].join("\n");

    const result = await provider.generateStructured({ prompt, schema: semanticSchema });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.claims).toHaveLength(2);
      expect(result.data.claims.map((item) => item.queryId).sort()).toEqual(["q1", "q2"]);
      expect(result.data.claims.every((item) => item.reason.length > 0)).toBe(true);
      const q1Claim = result.data.claims.find((item) => item.queryId === "q1");
      expect(q1Claim?.supportedEvidenceIds).toEqual(["e1"]);

      expect(result.data.counterArguments).toHaveLength(1);
      expect(result.data.counterArguments[0].queryId).toBe("q1");
      expect(result.data.counterArguments[0].supportedEvidenceIds).toEqual(["e1"]);
      expect(result.data.counterArguments[0].counterEvidenceIds).toEqual([]);
    }
  });

  it("의미 검증 candidate 추출에 성공했더라도 스키마를 satisfy하지 못하면(candidate 집합 불일치) 기존 폴백 경로로 진행한다", async () => {
    const provider = createDeterministicLLMProvider();
    // schema가 요구하는 candidate 집합("q-other")과 프롬프트에서 추출되는
    // queryId("q1")가 불일치하도록 구성 — happy-path 픽스처가 .refine()을
    // 통과하지 못하는 경우, 기존 small-candidate-set 폴백으로 진행해도
    // 정상적으로 schema_validation_failed를 반환해야 한다(크래시 없음).
    const mismatchedSchema = z.object({
      claims: z
        .array(
          z.object({
            queryId: z.string(),
            supportedEvidenceIds: z.array(z.string()),
            reason: z.string().min(1),
          })
        )
        .refine((items) => items.every((item) => item.queryId === "q-other"), {
          message: "불일치",
        }),
      counterArguments: z.array(z.unknown()),
    });
    const prompt = "쿼리 ID: q1\n소견: s1\n근거자료:\n  - [e1] title-e1: content-e1";

    const result = await provider.generateStructured({ prompt, schema: mismatchedSchema });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("schema_validation_failed");
    }
  });
});
