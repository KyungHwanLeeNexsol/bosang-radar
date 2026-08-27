import { describe, expect, it } from "vitest";
import type {
  GenerateResponse,
  GenerateStructuredRequest,
  LLMProvider,
  StructuredResult,
} from "../ai/provider";
import { research } from "./researcher";
import type { EvidenceCandidate, ResearchQuery } from "./types";

// M5: research()는 evidence: Map<string, EvidenceCandidate[]> + provider(필수)를
// 받아 evidence-ID 무결성 1차 방어선(design.md §7 buildFindingSchema)을 적용한다.
// (REQ-RESEARCH-016/017, AC-RESEARCH-014/015/019a/019b)

function makeQuery(id: string, overrides: Partial<ResearchQuery> = {}): ResearchQuery {
  return {
    id,
    topic: `topic-${id}`,
    focus: `focus-${id}`,
    domain: "INJURY_DISABILITY",
    issueType: "DISABILITY_LOCATION",
    keywords: [],
    ...overrides,
  };
}

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

// 프롬프트에 임베딩된 "- [id] title: content" 형태에서 첫 evidence ID를
// 추출해, 그 ID를 인용하는 구조화 응답을 만드는 정상 동작 provider.
function stubProviderCitingFirst(): LLMProvider {
  return {
    async generate(request): Promise<GenerateResponse> {
      return { text: `stub:${request.prompt}` };
    },
    async generateStructured<T>(
      request: GenerateStructuredRequest<T>
    ): Promise<StructuredResult<T>> {
      const match = /\[([^\]]+)\]/.exec(request.prompt);
      const candidate = {
        summary: "stub summary",
        supportingEvidenceIds: match ? [match[1]] : [],
      };
      const result = request.schema.safeParse(candidate);
      return result.success
        ? { ok: true, data: result.data }
        : { ok: false, reason: "schema_validation_failed", raw: JSON.stringify(candidate) };
    },
  };
}

// 항상 프롬프트에 없는 위조 evidence ID를 인용하는 provider — 1차 방어선
// (.refine()) 검증 실패를 유발해야 한다.
function stubProviderForgingId(): LLMProvider {
  return {
    async generate(): Promise<GenerateResponse> {
      return { text: "stub" };
    },
    async generateStructured<T>(
      request: GenerateStructuredRequest<T>
    ): Promise<StructuredResult<T>> {
      const candidate = {
        summary: "forged summary",
        supportingEvidenceIds: ["forged-evidence-id-does-not-exist"],
      };
      const result = request.schema.safeParse(candidate);
      return result.success
        ? { ok: true, data: result.data }
        : { ok: false, reason: "schema_validation_failed", raw: JSON.stringify(candidate) };
    },
  };
}

describe("lib/pipeline/researcher research (REQ-RESEARCH-016/017)", () => {
  it("AC-RESEARCH-014: 전달된 evidence만으로 finding을 생성하고 supportingEvidenceIds는 그 부분집합이다", async () => {
    const query = makeQuery("q1");
    const evidence = new Map<string, EvidenceCandidate[]>([
      [query.id, [makeEvidence("e1"), makeEvidence("e2")]],
    ]);

    const findings = await research([query], evidence, stubProviderCitingFirst());

    expect(findings).toHaveLength(1);
    expect(findings[0].queryId).toBe("q1");
    expect(findings[0].supportingEvidenceIds.length).toBeGreaterThan(0);
    for (const id of findings[0].supportingEvidenceIds) {
      expect(["e1", "e2"]).toContain(id);
    }
  });

  it("AC-RESEARCH-015: 위조된 evidence ID를 반환하는 provider는 schema 검증에서 걸러져 finding이 생성되지 않는다", async () => {
    const query = makeQuery("q1");
    const evidence = new Map<string, EvidenceCandidate[]>([[query.id, [makeEvidence("e1")]]]);

    const findings = await research([query], evidence, stubProviderForgingId());

    expect(findings).toHaveLength(0);
  });

  it("AC-RESEARCH-019a: 모든 query에 대해 evidence가 0건이면 findings는 비어 있다", async () => {
    const queries = [makeQuery("q1"), makeQuery("q2")];
    const evidence = new Map<string, EvidenceCandidate[]>([
      ["q1", []],
      ["q2", []],
    ]);

    const findings = await research(queries, evidence, stubProviderCitingFirst());

    expect(findings).toHaveLength(0);
  });

  it("AC-RESEARCH-019b: 특정 query만 구조화 검증에 실패하면 그 query만 findings에서 빠진다", async () => {
    const queries = [makeQuery("q1"), makeQuery("q2")];
    const evidence = new Map<string, EvidenceCandidate[]>([
      ["q1", [makeEvidence("e1")]],
      ["q2", [makeEvidence("e2")]],
    ]);

    const failingProvider: LLMProvider = {
      async generate(): Promise<GenerateResponse> {
        return { text: "stub" };
      },
      async generateStructured<T>(
        request: GenerateStructuredRequest<T>
      ): Promise<StructuredResult<T>> {
        if (request.prompt.includes("topic-q1")) {
          return { ok: false, reason: "schema_validation_failed", raw: "{}" };
        }
        const match = /\[([^\]]+)\]/.exec(request.prompt);
        const candidate = { summary: "s", supportingEvidenceIds: match ? [match[1]] : [] };
        const result = request.schema.safeParse(candidate);
        return result.success
          ? { ok: true, data: result.data }
          : { ok: false, reason: "schema_validation_failed", raw: JSON.stringify(candidate) };
      },
    };

    const findings = await research(queries, evidence, failingProvider);

    expect(findings).toHaveLength(1);
    expect(findings[0].queryId).toBe("q2");
  });

  it("Fix-A: summary가 '보험금 지급 확률은 95%입니다.' 형태의 금지 표현이면 finding 없이 건너뛴다", async () => {
    const query = makeQuery("q1");
    const evidence = new Map<string, EvidenceCandidate[]>([[query.id, [makeEvidence("e1")]]]);

    const forbiddenProbabilityProvider: LLMProvider = {
      async generate(): Promise<GenerateResponse> {
        return { text: "stub" };
      },
      async generateStructured<T>(
        request: GenerateStructuredRequest<T>
      ): Promise<StructuredResult<T>> {
        const match = /\[([^\]]+)\]/.exec(request.prompt);
        const candidate = {
          summary: "보험금 지급 확률은 95%입니다.",
          supportingEvidenceIds: match ? [match[1]] : [],
        };
        const result = request.schema.safeParse(candidate);
        return result.success
          ? { ok: true, data: result.data }
          : { ok: false, reason: "schema_validation_failed", raw: JSON.stringify(candidate) };
      },
    };

    const findings = await research([query], evidence, forbiddenProbabilityProvider);

    expect(findings).toHaveLength(0);
  });

  it("Fix-A: summary가 '보험금 1,000만원을 반드시 지급합니다.' 형태의 금지 표현이면 finding 없이 건너뛴다", async () => {
    const query = makeQuery("q1");
    const evidence = new Map<string, EvidenceCandidate[]>([[query.id, [makeEvidence("e1")]]]);

    const forbiddenAmountProvider: LLMProvider = {
      async generate(): Promise<GenerateResponse> {
        return { text: "stub" };
      },
      async generateStructured<T>(
        request: GenerateStructuredRequest<T>
      ): Promise<StructuredResult<T>> {
        const match = /\[([^\]]+)\]/.exec(request.prompt);
        const candidate = {
          summary: "보험금 1,000만원을 반드시 지급합니다.",
          supportingEvidenceIds: match ? [match[1]] : [],
        };
        const result = request.schema.safeParse(candidate);
        return result.success
          ? { ok: true, data: result.data }
          : { ok: false, reason: "schema_validation_failed", raw: JSON.stringify(candidate) };
      },
    };

    const findings = await research([query], evidence, forbiddenAmountProvider);

    expect(findings).toHaveLength(0);
  });

  it("evidence가 없는 query는 provider를 호출하지 않는다(억지 finding 생성 금지, design.md §7 4차 revision)", async () => {
    let callCount = 0;
    const countingProvider: LLMProvider = {
      async generate(): Promise<GenerateResponse> {
        return { text: "stub" };
      },
      async generateStructured<T>(
        request: GenerateStructuredRequest<T>
      ): Promise<StructuredResult<T>> {
        callCount += 1;
        const candidate = { summary: "s", supportingEvidenceIds: ["never"] };
        const result = request.schema.safeParse(candidate);
        return result.success
          ? { ok: true, data: result.data }
          : { ok: false, reason: "schema_validation_failed", raw: "{}" };
      },
    };

    await research([makeQuery("q1")], new Map([["q1", []]]), countingProvider);

    expect(callCount).toBe(0);
  });
});
