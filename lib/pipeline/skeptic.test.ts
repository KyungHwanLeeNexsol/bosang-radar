import { describe, expect, it } from "vitest";
import type { z } from "zod";
import type {
  GenerateResponse,
  GenerateStructuredRequest,
  LLMProvider,
  StructuredResult,
} from "../ai/provider";
import { challenge } from "./skeptic";
import type { DraftFinding, EvidenceCandidate } from "./types";

// M5: challenge()는 3인자 필수 형태 challenge(findings, evidenceMap, provider)로
// 재작성된다(design.md §3). Challenge.findingId는 LLM 구조화 출력에 포함되지
// 않고 challenge() 루프가 finding.queryId를 코드로 직접 부여한다(4차 revision,
// design.md §7). (REQ-RESEARCH-018, AC-RESEARCH-016)

function makeEvidence(id: string): EvidenceCandidate {
  return {
    id,
    category: "cat",
    evidenceType: "PRECEDENT",
    scope: "UNIVERSAL",
    title: `title-${id}`,
    content: `content-${id}`,
    sourceUrl: null,
  };
}

function makeFinding(queryId: string): DraftFinding {
  return { queryId, summary: `summary-${queryId}`, supportingEvidenceIds: ["e-any"] };
}

function stubProviderCiting(id: string | null): LLMProvider {
  return {
    async generate(): Promise<GenerateResponse> {
      return { text: "stub" };
    },
    async generateStructured<T>(
      request: GenerateStructuredRequest<T>
    ): Promise<StructuredResult<T>> {
      const candidate = {
        counterArgument: "기왕증 가능성이 있어 추가 확인이 필요합니다.",
        supportingEvidenceIds: id ? [id] : [],
        counterEvidenceIds: [],
      };
      const result = request.schema.safeParse(candidate);
      return result.success
        ? { ok: true, data: result.data }
        : { ok: false, reason: "schema_validation_failed", raw: JSON.stringify(candidate) };
    },
  };
}

describe("lib/pipeline/skeptic challenge (REQ-RESEARCH-018)", () => {
  it("AC-RESEARCH-016: Challenge.findingId는 항상 finding.queryId와 정확히 일치한다(코드로 부여)", async () => {
    const findings = [makeFinding("q1"), makeFinding("q2")];
    const evidenceMap = new Map<string, EvidenceCandidate[]>([
      ["q1", [makeEvidence("e1")]],
      ["q2", [makeEvidence("e2")]],
    ]);

    const challenges = await challenge(findings, evidenceMap, stubProviderCiting(null));

    expect(challenges).toHaveLength(2);
    expect(challenges[0].findingId).toBe(findings[0].queryId);
    expect(challenges[1].findingId).toBe(findings[1].queryId);
  });

  it("buildChallengeSchema()의 구조화 출력 스키마에는 findingId 필드가 없다", async () => {
    let capturedSchema: z.ZodTypeAny | undefined;
    const capturingProvider: LLMProvider = {
      async generate(): Promise<GenerateResponse> {
        return { text: "stub" };
      },
      async generateStructured<T>(
        request: GenerateStructuredRequest<T>
      ): Promise<StructuredResult<T>> {
        capturedSchema = request.schema as unknown as z.ZodTypeAny;
        const candidate = {
          counterArgument: "반론",
          supportingEvidenceIds: [],
          counterEvidenceIds: [],
        };
        const result = request.schema.safeParse(candidate);
        return result.success
          ? { ok: true, data: result.data }
          : { ok: false, reason: "schema_validation_failed", raw: "{}" };
      },
    };

    await challenge(
      [makeFinding("q1")],
      new Map<string, EvidenceCandidate[]>([["q1", [makeEvidence("e1")]]]),
      capturingProvider
    );

    expect(capturedSchema).toBeDefined();
    const shape = (capturedSchema as unknown as z.ZodObject<z.ZodRawShape>).shape;
    expect(Object.keys(shape)).not.toContain("findingId");
    expect(Object.keys(shape).sort()).toEqual(
      ["counterArgument", "counterEvidenceIds", "supportingEvidenceIds"].sort()
    );
  });

  it("evidenceMap에 없는 evidence ID를 인용하면 schema 검증이 실패해 challenge가 생략된다", async () => {
    const findings = [makeFinding("q1")];
    const evidenceMap = new Map<string, EvidenceCandidate[]>([["q1", [makeEvidence("e1")]]]);

    const challenges = await challenge(findings, evidenceMap, stubProviderCiting("forged-id"));

    expect(challenges).toHaveLength(0);
  });

  it("evidence ID가 evidenceMap의 부분집합이면 challenge가 그대로 생성된다", async () => {
    const findings = [makeFinding("q1")];
    const evidenceMap = new Map<string, EvidenceCandidate[]>([["q1", [makeEvidence("e1")]]]);

    const challenges = await challenge(findings, evidenceMap, stubProviderCiting("e1"));

    expect(challenges).toHaveLength(1);
    expect(challenges[0].supportingEvidenceIds).toEqual(["e1"]);
  });

  // --- item 2: Skeptic 생성 결과에도 safety-validator를 적용한다 ------------

  it("counterArgument에 금지된 확정성 표현이 있으면 Challenge가 생성되지 않는다", async () => {
    const findings = [makeFinding("q1")];
    const evidenceMap = new Map<string, EvidenceCandidate[]>([["q1", [makeEvidence("e1")]]]);
    const unsafeProvider: LLMProvider = {
      async generate(): Promise<GenerateResponse> {
        return { text: "stub" };
      },
      async generateStructured<T>(
        request: GenerateStructuredRequest<T>
      ): Promise<StructuredResult<T>> {
        const candidate = {
          counterArgument: "보험금을 반드시 지급합니다.",
          supportingEvidenceIds: [],
          counterEvidenceIds: [],
        };
        const result = request.schema.safeParse(candidate);
        return result.success
          ? { ok: true, data: result.data }
          : { ok: false, reason: "schema_validation_failed", raw: JSON.stringify(candidate) };
      },
    };

    const challenges = await challenge(findings, evidenceMap, unsafeProvider);

    expect(challenges).toHaveLength(0);
  });

  it("counterArgument가 안전하면 Challenge가 정상적으로 생성된다(회귀 확인)", async () => {
    const findings = [makeFinding("q1")];
    const evidenceMap = new Map<string, EvidenceCandidate[]>([["q1", [makeEvidence("e1")]]]);

    const challenges = await challenge(findings, evidenceMap, stubProviderCiting(null));

    expect(challenges).toHaveLength(1);
  });
});
