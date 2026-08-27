import { describe, expect, it } from "vitest";
import type {
  GenerateResponse,
  GenerateStructuredRequest,
  LLMProvider,
  StructuredResult,
} from "../ai/provider";
import { research } from "./researcher";
import type { EvidenceCandidate, ResearchQuery } from "./types";

// M2: research()는 evidence가 있는 모든 query를 하나의 논리적 배치
// generateStructured() 호출로 묶어 처리한다(REQ-GEMINI-RUNTIME-004/007/008).
// Zod 스키마는 구조만 검증하고(.refine()/.min() 없음), evidence-ID 그라운딩
// 계약(Researcher 항목 한정 supportingEvidenceIds.length>=1, D-NEW2)과
// evidence 부분집합 검증은 파싱 성공 이후 항목별 업무 규칙으로 적용된다.

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

interface QueryBlock {
  queryId: string;
  evidenceIds: string[];
}

// buildResearchBatchPrompt()가 방출하는 "[RESEARCH] 쿼리 ID: <id>" 마커로
// 구분된 각 블록을 파싱해, 그 블록에 실제로 전달된 evidence ID 목록을
// 되돌려주는 테스트 헬퍼(design.md §6 마커 규칙).
function extractQueryBlocks(prompt: string): QueryBlock[] {
  const sections = prompt.split("[RESEARCH] 쿼리 ID: ").slice(1);
  return sections.map((section) => {
    const [idLine, ...rest] = section.split("\n");
    const body = rest.join("\n");
    const evidenceIds = [...body.matchAll(/^- \[([^\]]+)\]/gm)].map((match) => match[1]);
    return { queryId: idLine.trim(), evidenceIds };
  });
}

function makeBatchProvider(responder: (blocks: QueryBlock[]) => unknown): {
  provider: LLMProvider;
  callCount: () => number;
} {
  let calls = 0;
  const provider: LLMProvider = {
    async generate(): Promise<GenerateResponse> {
      return { text: "stub" };
    },
    async generateStructured<T>(
      request: GenerateStructuredRequest<T>
    ): Promise<StructuredResult<T>> {
      calls += 1;
      const blocks = extractQueryBlocks(request.prompt);
      const candidate = responder(blocks);
      const result = request.schema.safeParse(candidate);
      return result.success
        ? { ok: true, data: result.data }
        : { ok: false, reason: "schema_validation_failed", raw: JSON.stringify(candidate) };
    },
  };
  return { provider, callCount: () => calls };
}

describe("lib/pipeline/researcher research — batch schema (REQ-GEMINI-RUNTIME-004/007/008)", () => {
  it("evidence가 있는 모든 query를 하나의 배치 호출로 묶어 처리하고 query/finding 대응을 보존한다", async () => {
    const q1 = makeQuery("q1");
    const q2 = makeQuery("q2");
    const evidence = new Map<string, EvidenceCandidate[]>([
      [q1.id, [makeEvidence("e1"), makeEvidence("e2")]],
      [q2.id, [makeEvidence("e3")]],
    ]);

    const { provider, callCount } = makeBatchProvider((blocks) => ({
      findings: blocks.map((block) => ({
        queryId: block.queryId,
        summary: `summary-${block.queryId}`,
        supportingEvidenceIds: block.evidenceIds.slice(0, 1),
      })),
    }));

    const findings = await research([q1, q2], evidence, provider);

    expect(callCount()).toBe(1);
    expect(findings).toHaveLength(2);
    const byQuery = new Map(findings.map((finding) => [finding.queryId, finding]));
    expect(byQuery.get("q1")?.supportingEvidenceIds).toEqual(["e1"]);
    expect(byQuery.get("q2")?.supportingEvidenceIds).toEqual(["e3"]);
  });

  it("evidence 부분집합을 벗어난 evidence ID를 인용한 항목은 그 항목만 개별 폐기된다", async () => {
    const query = makeQuery("q1");
    const evidence = new Map<string, EvidenceCandidate[]>([[query.id, [makeEvidence("e1")]]]);

    const { provider } = makeBatchProvider(() => ({
      findings: [{ queryId: "q1", summary: "s", supportingEvidenceIds: ["forged-evidence-id"] }],
    }));

    const findings = await research([query], evidence, provider);

    expect(findings).toHaveLength(0);
  });

  it("다른 query에게 전달된 evidence ID를 인용하면 개별 폐기된다(query별 evidence 격리)", async () => {
    const q1 = makeQuery("q1");
    const q2 = makeQuery("q2");
    const evidence = new Map<string, EvidenceCandidate[]>([
      [q1.id, [makeEvidence("e1")]],
      [q2.id, [makeEvidence("e2")]],
    ]);

    const { provider } = makeBatchProvider(() => ({
      findings: [
        { queryId: "q1", summary: "s1", supportingEvidenceIds: ["e2"] },
        { queryId: "q2", summary: "s2", supportingEvidenceIds: ["e2"] },
      ],
    }));

    const findings = await research([q1, q2], evidence, provider);

    expect(findings).toHaveLength(1);
    expect(findings[0].queryId).toBe("q2");
  });

  it("candidate에 없는 queryId를 반환한 항목은 폐기된다(forged queryId)", async () => {
    const query = makeQuery("q1");
    const evidence = new Map<string, EvidenceCandidate[]>([[query.id, [makeEvidence("e1")]]]);

    const { provider } = makeBatchProvider(() => ({
      findings: [{ queryId: "forged-query-id", summary: "s", supportingEvidenceIds: ["e1"] }],
    }));

    const findings = await research([query], evidence, provider);

    expect(findings).toHaveLength(0);
  });

  it("같은 queryId가 중복 응답되면 첫 항목만 채택한다", async () => {
    const query = makeQuery("q1");
    const evidence = new Map<string, EvidenceCandidate[]>([
      [query.id, [makeEvidence("e1"), makeEvidence("e2")]],
    ]);

    const { provider } = makeBatchProvider(() => ({
      findings: [
        { queryId: "q1", summary: "first", supportingEvidenceIds: ["e1"] },
        { queryId: "q1", summary: "second", supportingEvidenceIds: ["e2"] },
      ],
    }));

    const findings = await research([query], evidence, provider);

    expect(findings).toHaveLength(1);
    expect(findings[0].summary).toBe("first");
  });

  it("AC-GEMINI-RUNTIME-009a: Researcher 항목의 빈 supportingEvidenceIds는 그 항목만 개별 폐기시키고 같은 배치의 다른 정상 항목은 보존한다", async () => {
    const q1 = makeQuery("q1");
    const q2 = makeQuery("q2");
    const evidence = new Map<string, EvidenceCandidate[]>([
      [q1.id, [makeEvidence("e1")]],
      [q2.id, [makeEvidence("e2")]],
    ]);

    const { provider } = makeBatchProvider(() => ({
      findings: [
        { queryId: "q1", summary: "empty-evidence", supportingEvidenceIds: [] },
        { queryId: "q2", summary: "normal", supportingEvidenceIds: ["e2"] },
      ],
    }));

    const findings = await research([q1, q2], evidence, provider);

    expect(findings).toHaveLength(1);
    expect(findings[0].queryId).toBe("q2");
    expect(findings[0].summary).toBe("normal");
  });

  it("Fix-A: summary가 '보험금 지급 확률은 95%입니다.' 형태의 금지 표현이면 그 항목만 폐기되고 나머지는 보존된다", async () => {
    const q1 = makeQuery("q1");
    const q2 = makeQuery("q2");
    const evidence = new Map<string, EvidenceCandidate[]>([
      [q1.id, [makeEvidence("e1")]],
      [q2.id, [makeEvidence("e2")]],
    ]);

    const { provider } = makeBatchProvider(() => ({
      findings: [
        { queryId: "q1", summary: "보험금 지급 확률은 95%입니다.", supportingEvidenceIds: ["e1"] },
        { queryId: "q2", summary: "정상 소견입니다.", supportingEvidenceIds: ["e2"] },
      ],
    }));

    const findings = await research([q1, q2], evidence, provider);

    expect(findings).toHaveLength(1);
    expect(findings[0].queryId).toBe("q2");
  });

  it("Fix-A: summary가 '보험금 1,000만원을 반드시 지급합니다.' 형태의 금지 표현이면 finding 없이 건너뛴다", async () => {
    const query = makeQuery("q1");
    const evidence = new Map<string, EvidenceCandidate[]>([[query.id, [makeEvidence("e1")]]]);

    const { provider } = makeBatchProvider(() => ({
      findings: [
        {
          queryId: "q1",
          summary: "보험금 1,000만원을 반드시 지급합니다.",
          supportingEvidenceIds: ["e1"],
        },
      ],
    }));

    const findings = await research([query], evidence, provider);

    expect(findings).toHaveLength(0);
  });

  it("모든 query에 evidence가 없으면 provider를 호출하지 않는다(억지 finding 생성 금지)", async () => {
    const { provider, callCount } = makeBatchProvider(() => ({ findings: [] }));

    const findings = await research([makeQuery("q1")], new Map([["q1", []]]), provider);

    expect(callCount()).toBe(0);
    expect(findings).toHaveLength(0);
  });

  it("evidence 없는 query는 배치 candidate에서 제외되고 evidence 있는 query만 처리된다", async () => {
    const q1 = makeQuery("q1");
    const q2 = makeQuery("q2");
    const evidence = new Map<string, EvidenceCandidate[]>([
      [q1.id, []],
      [q2.id, [makeEvidence("e2")]],
    ]);

    const { provider, callCount } = makeBatchProvider((blocks) => {
      expect(blocks.map((block) => block.queryId)).toEqual(["q2"]);
      return { findings: [{ queryId: "q2", summary: "s", supportingEvidenceIds: ["e2"] }] };
    });

    const findings = await research([q1, q2], evidence, provider);

    expect(callCount()).toBe(1);
    expect(findings).toHaveLength(1);
    expect(findings[0].queryId).toBe("q2");
  });

  it("배치 응답 전체가 최상위에서 파싱 불가능하면 이번 호출의 findings는 비어 있다", async () => {
    const query = makeQuery("q1");
    const evidence = new Map<string, EvidenceCandidate[]>([[query.id, [makeEvidence("e1")]]]);
    const provider: LLMProvider = {
      async generate(): Promise<GenerateResponse> {
        return { text: "stub" };
      },
      async generateStructured<T>(): Promise<StructuredResult<T>> {
        return { ok: false, reason: "invalid_json", raw: "not json" };
      },
    };

    const findings = await research([query], evidence, provider);

    expect(findings).toHaveLength(0);
  });
});
