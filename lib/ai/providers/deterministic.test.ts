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

  // M5: researcher.ts의 buildResearchBatchPrompt()는 "[RESEARCH] 쿼리 ID: <id>"
  // 마커로 쿼리 블록을 구분하고, findFindingBatchSchema()의 { findings: [...] }
  // envelope을 기대한다(design.md §6/§7). 각 쿼리 블록마다 정확히 하나의
  // finding을 생성하고, 그 finding의 supportingEvidenceIds는 해당 쿼리
  // 고유의 evidence ID만 인용해야 한다(query별 evidence 격리,
  // REQ-GEMINI-RUNTIME-008 — 다른 쿼리의 evidence ID를 섞으면 researcher.ts의
  // 부분집합 검증에서 폐기된다).
  it("리서치 배치 프롬프트([RESEARCH] 마커)를 인식해 쿼리 블록마다 하나의 finding을, 그 쿼리 고유 evidence ID로 채워 생성한다", async () => {
    const provider = createDeterministicLLMProvider();
    const findingBatchSchema = z.object({
      findings: z.array(
        z.object({
          queryId: z.string(),
          summary: z.string(),
          supportingEvidenceIds: z.array(z.string()),
        })
      ),
    });
    const prompt = [
      "[RESEARCH] 쿼리 ID: q1",
      "쟁점: 쟁점1",
      "초점: 초점1",
      "아래 evidence 목록만을 근거로 검토 소견을 작성하라. 목록에 없는 evidence ID는 인용하지 말 것:",
      "- [e1] title-e1: content-e1",
      "",
      "[RESEARCH] 쿼리 ID: q2",
      "쟁점: 쟁점2",
      "초점: 초점2",
      "아래 evidence 목록만을 근거로 검토 소견을 작성하라. 목록에 없는 evidence ID는 인용하지 말 것:",
      "- [e2] title-e2: content-e2",
      "",
      "각 쿼리 ID에 대해 findings 배열에 정확히 한 개의 항목을 생성하라. 각 항목의 queryId 필드에는 " +
        "그 항목이 대응하는 쿼리 ID를 그대로 반환할 것.",
    ].join("\n");

    const result = await provider.generateStructured({ prompt, schema: findingBatchSchema });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.findings).toHaveLength(2);
      const q1 = result.data.findings.find((item) => item.queryId === "q1");
      const q2 = result.data.findings.find((item) => item.queryId === "q2");
      expect(q1?.supportingEvidenceIds).toEqual(["e1"]);
      expect(q2?.supportingEvidenceIds).toEqual(["e2"]);
      expect(result.data.findings.every((item) => item.summary.length > 0)).toBe(true);
    }
  });

  // M5 폴백 분기: [RESEARCH] 마커가 인식되어도, 전달된 schema가 배치
  // 픽스처의 shape과 다르면(예: 존재하지 않는 필드를 요구) safeParse가
  // 실패하고 기존 폴백 경로(semantic/candidate)로 진행해야 한다 — 크래시
  // 없이 최종적으로 schema_validation_failed를 반환한다.
  it("리서치 배치 마커가 인식되어도 findings envelope 스키마를 satisfy하지 못하면 기존 폴백 경로로 진행한다", async () => {
    const provider = createDeterministicLLMProvider();
    const mismatchedSchema = z.object({
      findings: z.array(
        z.object({
          queryId: z.string(),
          summary: z.string(),
          supportingEvidenceIds: z.array(z.string()),
          thisFieldDoesNotExistInAnyFixture: z.string(),
        })
      ),
    });
    const prompt = "[RESEARCH] 쿼리 ID: q1\n쟁점: 쟁점1\n초점: 초점1\n- [e1] title-e1: content-e1";

    const result = await provider.generateStructured({ prompt, schema: mismatchedSchema });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("schema_validation_failed");
    }
  });

  // M5: skeptic.ts의 buildChallengeBatchPrompt()는 "[SKEPTIC] 쿼리 ID: <id>"
  // 마커로 finding 블록을 구분하고, buildChallengeBatchSchema()의
  // { challenges: [...] } envelope을 기대한다. 각 블록마다 정확히 하나의
  // challenge를 생성하고, 두 evidence 배열 모두 해당 쿼리 고유 evidence ID의
  // 부분집합이어야 한다(skeptic.ts는 researcher.ts와 달리 빈 배열 허용,
  // REQ-GEMINI-RUNTIME-007 비대칭 서술).
  it("스켑틱 배치 프롬프트([SKEPTIC] 마커)를 인식해 블록마다 하나의 challenge를, 그 쿼리 고유 evidence ID로 채워 생성한다", async () => {
    const provider = createDeterministicLLMProvider();
    const challengeBatchSchema = z.object({
      challenges: z.array(
        z.object({
          queryId: z.string(),
          counterArgument: z.string(),
          supportingEvidenceIds: z.array(z.string()).optional().default([]),
          counterEvidenceIds: z.array(z.string()).optional().default([]),
        })
      ),
    });
    const prompt = [
      "[SKEPTIC] 쿼리 ID: q1",
      "소견: s1",
      "아래 evidence 목록을 참고해 보험사 관점에서 실제로 제기될 수 있는 반론을 작성하라. 목록에 없는 evidence ID는 인용하지 말 것:",
      "- [e1] title-e1: content-e1",
      "",
      "[SKEPTIC] 쿼리 ID: q2",
      "소견: s2",
      "아래 evidence 목록을 참고해 보험사 관점에서 실제로 제기될 수 있는 반론을 작성하라. 목록에 없는 evidence ID는 인용하지 말 것:",
      "- [e2] title-e2: content-e2",
      "",
      "각 쿼리 ID에 대해 challenges 배열에 정확히 한 개의 항목을 생성하라. 각 항목의 queryId 필드에는 " +
        "그 항목이 대응하는 쿼리 ID를 그대로 반환할 것.",
    ].join("\n");

    const result = await provider.generateStructured({ prompt, schema: challengeBatchSchema });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.challenges).toHaveLength(2);
      const q1 = result.data.challenges.find((item) => item.queryId === "q1");
      expect(q1?.supportingEvidenceIds).toEqual(["e1"]);
      expect(q1?.counterEvidenceIds).toEqual([]);
      expect((q1?.counterArgument ?? "").length).toBeGreaterThan(0);
    }
  });

  // M5 폴백 분기(skeptic 버전): [SKEPTIC] 마커가 인식되어도 schema가
  // 배치 픽스처 shape과 다르면 기존 폴백 경로로 진행한다.
  it("스켑틱 배치 마커가 인식되어도 challenges envelope 스키마를 satisfy하지 못하면 기존 폴백 경로로 진행한다", async () => {
    const provider = createDeterministicLLMProvider();
    const mismatchedSchema = z.object({
      challenges: z.array(
        z.object({
          queryId: z.string(),
          counterArgument: z.string(),
          thisFieldDoesNotExistInAnyFixture: z.string(),
        })
      ),
    });
    const prompt = "[SKEPTIC] 쿼리 ID: q1\n소견: s1\n- [e1] title-e1: content-e1";

    const result = await provider.generateStructured({ prompt, schema: mismatchedSchema });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("schema_validation_failed");
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

  // M5 브랜치 커버리지: parseSemanticPrompt(기존 M2 코드, 변경 없음)는
  // counterArgument 블록에 "반론 번호:"/"반박 근거자료" 마커가 없어도
  // 안전하게 기본값(counterArgumentIndex=0, counterEvidenceIds=[])으로
  // 처리하는 방어적 폴백 분기를 갖고 있다 — 기존 테스트는 두 마커가 항상
  // 존재하는 happy-path만 검증했으므로, 이 분기들이 미검증 상태였다. 동작을
  // 바꾸지 않고 이 기존 분기에 대한 테스트만 추가한다.
  it("반론 블록에 '반론 번호:'/'반박 근거자료' 마커가 없어도 기본값으로 안전하게 처리한다", async () => {
    const provider = createDeterministicLLMProvider();
    const semanticSchema = z.object({
      claims: z.array(z.unknown()),
      counterArguments: z.array(
        z.object({
          queryId: z.string(),
          counterArgumentIndex: z.number().int().nonnegative(),
          supportedEvidenceIds: z.array(z.string()),
          counterEvidenceIds: z.array(z.string()),
          reason: z.string().min(1),
        })
      ),
    });
    const prompt = "반론 쿼리 ID: q1\n반론 내용: 마커 없는 반론입니다";

    const result = await provider.generateStructured({ prompt, schema: semanticSchema });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.counterArguments).toHaveLength(1);
      expect(result.data.counterArguments[0].counterArgumentIndex).toBe(0);
      expect(result.data.counterArguments[0].supportedEvidenceIds).toEqual([]);
      expect(result.data.counterArguments[0].counterEvidenceIds).toEqual([]);
    }
  });
});
