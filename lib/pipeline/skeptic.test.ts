import { describe, expect, it } from "vitest";
import type {
  GenerateResponse,
  GenerateStructuredRequest,
  LLMProvider,
  StructuredResult,
} from "../ai/provider";
import { challenge } from "./skeptic";
import type { DraftFinding, EvidenceCandidate } from "./types";

// M2: challenge()는 모든 finding을 하나의 논리적 배치 generateStructured()
// 호출로 묶어 처리한다(REQ-GEMINI-RUNTIME-005/007/008/009). Challenge.findingId는
// LLM 구조화 출력에 포함되지 않고 배치 응답의 queryId를 code가 candidate
// finding.queryId와 매칭시켜 직접 부여한다(design.md §2/§7). Researcher와
// 달리 supportingEvidenceIds/counterEvidenceIds.length>=1 재검증은 적용하지
// 않는다 — 빈 evidence 배열을 그대로 허용하는 기존 계약을 유지한다.

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

interface QueryBlock {
  queryId: string;
  evidenceIds: string[];
}

// buildChallengeBatchPrompt()가 방출하는 "[SKEPTIC] 쿼리 ID: <id>" 마커로
// 구분된 각 블록을 파싱해, 그 블록에 실제로 전달된 evidence ID 목록을
// 되돌려주는 테스트 헬퍼(design.md §6 마커 규칙).
function extractQueryBlocks(prompt: string): QueryBlock[] {
  const sections = prompt.split("[SKEPTIC] 쿼리 ID: ").slice(1);
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

describe("lib/pipeline/skeptic challenge — batch schema (REQ-GEMINI-RUNTIME-005/007/008/009)", () => {
  it("모든 finding을 하나의 배치 호출로 묶어 처리하고 Challenge.findingId는 항상 finding.queryId와 정확히 일치한다", async () => {
    const findings = [makeFinding("q1"), makeFinding("q2")];
    const evidenceMap = new Map<string, EvidenceCandidate[]>([
      ["q1", [makeEvidence("e1")]],
      ["q2", [makeEvidence("e2")]],
    ]);

    const { provider, callCount } = makeBatchProvider((blocks) => ({
      challenges: blocks.map((block) => ({
        queryId: block.queryId,
        counterArgument: `반론-${block.queryId}`,
        supportingEvidenceIds: [],
        counterEvidenceIds: [],
      })),
    }));

    const challenges = await challenge(findings, evidenceMap, provider);

    expect(callCount()).toBe(1);
    expect(challenges).toHaveLength(2);
    expect(challenges.find((item) => item.findingId === "q1")).toBeDefined();
    expect(challenges.find((item) => item.findingId === "q2")).toBeDefined();
  });

  it("LLM 응답에 findingId 필드가 포함되어도 무시되고 finding.queryId가 사용된다(스키마에 findingId 없음)", async () => {
    const findings = [makeFinding("q1")];
    const evidenceMap = new Map<string, EvidenceCandidate[]>([["q1", [makeEvidence("e1")]]]);

    const maliciousProvider: LLMProvider = {
      async generate(): Promise<GenerateResponse> {
        return { text: "stub" };
      },
      async generateStructured<T>(
        request: GenerateStructuredRequest<T>
      ): Promise<StructuredResult<T>> {
        const candidate = {
          challenges: [
            {
              queryId: "q1",
              findingId: "malicious-injected-id",
              counterArgument: "반론",
              supportingEvidenceIds: [],
              counterEvidenceIds: [],
            },
          ],
        };
        const result = request.schema.safeParse(candidate);
        return result.success
          ? { ok: true, data: result.data }
          : { ok: false, reason: "schema_validation_failed", raw: "{}" };
      },
    };

    const challenges = await challenge(findings, evidenceMap, maliciousProvider);

    expect(challenges).toHaveLength(1);
    expect(challenges[0].findingId).toBe("q1");
    expect(challenges[0]).not.toHaveProperty("queryId");
  });

  it("evidenceMap에 없는 evidence ID를 supportingEvidenceIds에 인용하면 그 항목만 개별 폐기된다", async () => {
    const findings = [makeFinding("q1")];
    const evidenceMap = new Map<string, EvidenceCandidate[]>([["q1", [makeEvidence("e1")]]]);

    const { provider } = makeBatchProvider(() => ({
      challenges: [
        {
          queryId: "q1",
          counterArgument: "반론",
          supportingEvidenceIds: ["forged-id"],
          counterEvidenceIds: [],
        },
      ],
    }));

    const challenges = await challenge(findings, evidenceMap, provider);

    expect(challenges).toHaveLength(0);
  });

  it("evidenceMap에 없는 evidence ID를 counterEvidenceIds에 인용해도 그 항목만 개별 폐기된다", async () => {
    const findings = [makeFinding("q1")];
    const evidenceMap = new Map<string, EvidenceCandidate[]>([["q1", [makeEvidence("e1")]]]);

    const { provider } = makeBatchProvider(() => ({
      challenges: [
        {
          queryId: "q1",
          counterArgument: "반론",
          supportingEvidenceIds: [],
          counterEvidenceIds: ["forged-id"],
        },
      ],
    }));

    const challenges = await challenge(findings, evidenceMap, provider);

    expect(challenges).toHaveLength(0);
  });

  it("다른 finding에게 전달된 evidence ID를 인용하면 개별 폐기된다(query별 evidence 격리)", async () => {
    const findings = [makeFinding("q1"), makeFinding("q2")];
    const evidenceMap = new Map<string, EvidenceCandidate[]>([
      ["q1", [makeEvidence("e1")]],
      ["q2", [makeEvidence("e2")]],
    ]);

    const { provider } = makeBatchProvider(() => ({
      challenges: [
        { queryId: "q1", counterArgument: "반론1", supportingEvidenceIds: ["e2"], counterEvidenceIds: [] },
        { queryId: "q2", counterArgument: "반론2", supportingEvidenceIds: ["e2"], counterEvidenceIds: [] },
      ],
    }));

    const challenges = await challenge(findings, evidenceMap, provider);

    expect(challenges).toHaveLength(1);
    expect(challenges[0].findingId).toBe("q2");
  });

  it("candidate에 없는 queryId를 반환한 항목은 폐기된다(forged queryId)", async () => {
    const findings = [makeFinding("q1")];
    const evidenceMap = new Map<string, EvidenceCandidate[]>([["q1", [makeEvidence("e1")]]]);

    const { provider } = makeBatchProvider(() => ({
      challenges: [
        {
          queryId: "forged-query-id",
          counterArgument: "반론",
          supportingEvidenceIds: [],
          counterEvidenceIds: [],
        },
      ],
    }));

    const challenges = await challenge(findings, evidenceMap, provider);

    expect(challenges).toHaveLength(0);
  });

  it("같은 queryId가 중복 응답되면 첫 항목만 채택한다", async () => {
    const findings = [makeFinding("q1")];
    const evidenceMap = new Map<string, EvidenceCandidate[]>([["q1", [makeEvidence("e1")]]]);

    const { provider } = makeBatchProvider(() => ({
      challenges: [
        { queryId: "q1", counterArgument: "첫번째", supportingEvidenceIds: [], counterEvidenceIds: [] },
        { queryId: "q1", counterArgument: "두번째", supportingEvidenceIds: [], counterEvidenceIds: [] },
      ],
    }));

    const challenges = await challenge(findings, evidenceMap, provider);

    expect(challenges).toHaveLength(1);
    expect(challenges[0].counterArgument).toBe("첫번째");
  });

  it("evidence ID가 evidenceMap의 부분집합이면 challenge가 그대로 생성된다", async () => {
    const findings = [makeFinding("q1")];
    const evidenceMap = new Map<string, EvidenceCandidate[]>([["q1", [makeEvidence("e1")]]]);

    const { provider } = makeBatchProvider(() => ({
      challenges: [
        { queryId: "q1", counterArgument: "반론", supportingEvidenceIds: ["e1"], counterEvidenceIds: [] },
      ],
    }));

    const challenges = await challenge(findings, evidenceMap, provider);

    expect(challenges).toHaveLength(1);
    expect(challenges[0].supportingEvidenceIds).toEqual(["e1"]);
  });

  it("Skeptic은 Researcher와 달리 빈 supportingEvidenceIds/counterEvidenceIds를 허용한다(비대칭 계약)", async () => {
    const findings = [makeFinding("q1")];
    const evidenceMap = new Map<string, EvidenceCandidate[]>([["q1", [makeEvidence("e1")]]]);

    const { provider } = makeBatchProvider(() => ({
      challenges: [
        { queryId: "q1", counterArgument: "반론", supportingEvidenceIds: [], counterEvidenceIds: [] },
      ],
    }));

    const challenges = await challenge(findings, evidenceMap, provider);

    expect(challenges).toHaveLength(1);
    expect(challenges[0].supportingEvidenceIds).toEqual([]);
    expect(challenges[0].counterEvidenceIds).toEqual([]);
  });

  // --- item 2: Skeptic 생성 결과에도 safety-validator를 적용한다 ------------

  it("counterArgument에 금지된 확정성 표현이 있으면 그 항목만 폐기되고 같은 배치의 다른 정상 항목은 보존된다", async () => {
    const findings = [makeFinding("q1"), makeFinding("q2")];
    const evidenceMap = new Map<string, EvidenceCandidate[]>([
      ["q1", [makeEvidence("e1")]],
      ["q2", [makeEvidence("e2")]],
    ]);

    const { provider } = makeBatchProvider(() => ({
      challenges: [
        {
          queryId: "q1",
          counterArgument: "보험금을 반드시 지급합니다.",
          supportingEvidenceIds: [],
          counterEvidenceIds: [],
        },
        {
          queryId: "q2",
          counterArgument: "기왕증 가능성이 있어 추가 확인이 필요합니다.",
          supportingEvidenceIds: [],
          counterEvidenceIds: [],
        },
      ],
    }));

    const challenges = await challenge(findings, evidenceMap, provider);

    expect(challenges).toHaveLength(1);
    expect(challenges[0].findingId).toBe("q2");
  });

  it("counterArgument가 안전하면 Challenge가 정상적으로 생성된다(회귀 확인)", async () => {
    const findings = [makeFinding("q1")];
    const evidenceMap = new Map<string, EvidenceCandidate[]>([["q1", [makeEvidence("e1")]]]);

    const { provider } = makeBatchProvider(() => ({
      challenges: [
        {
          queryId: "q1",
          counterArgument: "기왕증 가능성이 있어 추가 확인이 필요합니다.",
          supportingEvidenceIds: [],
          counterEvidenceIds: [],
        },
      ],
    }));

    const challenges = await challenge(findings, evidenceMap, provider);

    expect(challenges).toHaveLength(1);
  });

  it("findings가 비어 있으면 provider를 호출하지 않는다", async () => {
    const { provider, callCount } = makeBatchProvider(() => ({ challenges: [] }));

    const challenges = await challenge([], new Map(), provider);

    expect(callCount()).toBe(0);
    expect(challenges).toHaveLength(0);
  });

  it("배치 응답 전체가 최상위에서 파싱 불가능하면 이번 호출의 challenges는 비어 있다", async () => {
    const findings = [makeFinding("q1")];
    const evidenceMap = new Map<string, EvidenceCandidate[]>([["q1", [makeEvidence("e1")]]]);
    const provider: LLMProvider = {
      async generate(): Promise<GenerateResponse> {
        return { text: "stub" };
      },
      async generateStructured<T>(): Promise<StructuredResult<T>> {
        return { ok: false, reason: "invalid_json", raw: "not json" };
      },
    };

    const challenges = await challenge(findings, evidenceMap, provider);

    expect(challenges).toHaveLength(0);
  });
});
