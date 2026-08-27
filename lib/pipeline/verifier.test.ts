import { describe, expect, it } from "vitest";
import type {
  GenerateResponse,
  GenerateStructuredRequest,
  LLMProvider,
  StructuredResult,
} from "../ai/provider";
import { verify } from "./verifier";
import type { Challenge, DraftFinding, EvidenceCandidate, ResearchQuery } from "./types";

// M5: verify()는 5인자 필수 형태 verify(queries, findings, challenges, evidence,
// provider)로 재작성되고 Promise<VerificationResult>를 반환한다(design.md §3).
// 2차 방어선(evidence 재검증, Researcher claim + Skeptic evidence 양쪽) +
// query↔finding 대조를 통한 missingMaterials 산출(design.md §7 4차 revision).
// (REQ-RESEARCH-019/020/021/022, AC-RESEARCH-017/018/019/019a/019b)
//
// Fix-B + item 1: 구조적 필터링을 통과한 claim/counterArgument 양쪽에 대해
// provider가 진짜로 호출되는 의미 검증 단계가 추가되었다 — 아래 stub
// provider들은 프롬프트에 임베딩된 "쿼리 ID: <id>"(claim) /
// "반론 쿼리 ID: <id>" + "반론 번호: <n>"(counterArgument) 블록을 파싱해,
// 실제로 전달된 evidence ID를 추출한다(verifier.ts
// buildSemanticVerificationPrompt와 동일한 형식 가정). 이렇게 얻은 ID로
// 응답을 채워 request.schema.safeParse()로 스스로 검증하는 관용구를
// researcher.test.ts/skeptic.test.ts와 동일하게 따른다.

function parsePrompt(prompt: string): {
  claims: { queryId: string; evidenceIds: string[] }[];
  counterArguments: {
    queryId: string;
    counterArgumentIndex: number;
    supportingIds: string[];
    counterIds: string[];
  }[];
} {
  const claims: { queryId: string; evidenceIds: string[] }[] = [];
  const counterArguments: {
    queryId: string;
    counterArgumentIndex: number;
    supportingIds: string[];
    counterIds: string[];
  }[] = [];

  const blockStarts: { index: number; kind: "claim" | "ca" }[] = [
    ...Array.from(prompt.matchAll(/^쿼리 ID: .+$/gm), (m) => ({
      index: m.index ?? 0,
      kind: "claim" as const,
    })),
    ...Array.from(prompt.matchAll(/^반론 쿼리 ID: .+$/gm), (m) => ({
      index: m.index ?? 0,
      kind: "ca" as const,
    })),
  ].sort((a, b) => a.index - b.index);

  blockStarts.forEach((start, i) => {
    const end = i + 1 < blockStarts.length ? blockStarts[i + 1].index : prompt.length;
    const blockText = prompt.slice(start.index, end);

    if (start.kind === "claim") {
      const queryIdMatch = /^쿼리 ID: (.+)$/m.exec(blockText);
      const queryId = queryIdMatch ? queryIdMatch[1].trim() : "";
      const evidenceIds = Array.from(blockText.matchAll(/\[([^\]\s]+)\]/g), (m) => m[1]);
      claims.push({ queryId, evidenceIds });
      return;
    }

    const queryIdMatch = /^반론 쿼리 ID: (.+)$/m.exec(blockText);
    const indexMatch = /^반론 번호: (\d+)$/m.exec(blockText);
    const queryId = queryIdMatch ? queryIdMatch[1].trim() : "";
    const counterArgumentIndex = indexMatch ? Number(indexMatch[1]) : 0;
    const counterMarkerIndex = blockText.indexOf("반박 근거자료");
    const supportingText =
      counterMarkerIndex >= 0 ? blockText.slice(0, counterMarkerIndex) : blockText;
    const counterText = counterMarkerIndex >= 0 ? blockText.slice(counterMarkerIndex) : "";
    const supportingIds = Array.from(supportingText.matchAll(/\[([^\]\s]+)\]/g), (m) => m[1]);
    const counterIds = Array.from(counterText.matchAll(/\[([^\]\s]+)\]/g), (m) => m[1]);
    counterArguments.push({ queryId, counterArgumentIndex, supportingIds, counterIds });
  });

  return { claims, counterArguments };
}

// 의미 검증 단계에서 항상 "인용된 evidence 전부가 관련성 확인됨"을 반환하는
// happy-path provider. verify()가 provider를 호출하지 않는 경우(candidate가
// 0건)에는 이 provider가 아예 사용되지 않는다.
const stubProvider: LLMProvider = {
  async generate(): Promise<GenerateResponse> {
    return { text: "stub" };
  },
  async generateStructured<T>(request: GenerateStructuredRequest<T>): Promise<StructuredResult<T>> {
    const parsed = parsePrompt(request.prompt);
    const candidate = {
      claims: parsed.claims.map((c) => ({
        queryId: c.queryId,
        supportedEvidenceIds: c.evidenceIds,
        reason: "관련성 확인됨",
      })),
      counterArguments: parsed.counterArguments.map((c) => ({
        queryId: c.queryId,
        counterArgumentIndex: c.counterArgumentIndex,
        supportedEvidenceIds: c.supportingIds,
        counterEvidenceIds: c.counterIds,
        reason: "관련성 확인됨",
      })),
    };
    const result = request.schema.safeParse(candidate);
    return result.success
      ? { ok: true, data: result.data }
      : { ok: false, reason: "schema_validation_failed", raw: JSON.stringify(candidate) };
  },
};

// 의미 검증 호출이 항상 실패(ok: false)하는 provider — fail-closed 검증용.
const failingStructuredProvider: LLMProvider = {
  async generate(): Promise<GenerateResponse> {
    return { text: "stub" };
  },
  async generateStructured(): Promise<StructuredResult<never>> {
    return { ok: false, reason: "schema_validation_failed", raw: "{}" };
  },
};

// queryId마다 claim의 supportedEvidenceIds를 제어할 수 있는 provider 팩토리.
// counterArgument는 항상 인용된 evidence 전부가 관련성 확인된 것으로 처리한다.
function stubProviderWithClaimVerdicts(
  verdictFor: (queryId: string) => { supportedEvidenceIds: string[]; reason: string }
): LLMProvider {
  return {
    async generate(): Promise<GenerateResponse> {
      return { text: "stub" };
    },
    async generateStructured<T>(
      request: GenerateStructuredRequest<T>
    ): Promise<StructuredResult<T>> {
      const parsed = parsePrompt(request.prompt);
      const candidate = {
        claims: parsed.claims.map((c) => ({ queryId: c.queryId, ...verdictFor(c.queryId) })),
        counterArguments: parsed.counterArguments.map((c) => ({
          queryId: c.queryId,
          counterArgumentIndex: c.counterArgumentIndex,
          supportedEvidenceIds: c.supportingIds,
          counterEvidenceIds: c.counterIds,
          reason: "관련성 확인됨",
        })),
      };
      const result = request.schema.safeParse(candidate);
      return result.success
        ? { ok: true, data: result.data }
        : { ok: false, reason: "schema_validation_failed", raw: JSON.stringify(candidate) };
    },
  };
}

// (queryId, counterArgumentIndex)마다 counterArgument의 판단을 제어할 수
// 있는 provider 팩토리. claim은 항상 인용된 evidence 전부가 관련성
// 확인된 것으로 처리한다.
function stubProviderWithCounterArgumentVerdicts(
  verdictFor: (
    queryId: string,
    index: number
  ) => {
    supportedEvidenceIds: string[];
    counterEvidenceIds: string[];
    reason: string;
  }
): LLMProvider {
  return {
    async generate(): Promise<GenerateResponse> {
      return { text: "stub" };
    },
    async generateStructured<T>(
      request: GenerateStructuredRequest<T>
    ): Promise<StructuredResult<T>> {
      const parsed = parsePrompt(request.prompt);
      const candidate = {
        claims: parsed.claims.map((c) => ({
          queryId: c.queryId,
          supportedEvidenceIds: c.evidenceIds,
          reason: "관련성 확인됨",
        })),
        counterArguments: parsed.counterArguments.map((c) => ({
          queryId: c.queryId,
          counterArgumentIndex: c.counterArgumentIndex,
          ...verdictFor(c.queryId, c.counterArgumentIndex),
        })),
      };
      const result = request.schema.safeParse(candidate);
      return result.success
        ? { ok: true, data: result.data }
        : { ok: false, reason: "schema_validation_failed", raw: JSON.stringify(candidate) };
    },
  };
}

// 항상 candidate 집합에 없는 위조 queryId를 claim으로 인용하는 provider —
// 의미 검증 스키마의 .refine() 1:1 대응 검증 실패를 유발해야 한다
// (researcher.test.ts stubProviderForgingId와 동일한 관용구).
const stubProviderForgingQueryId: LLMProvider = {
  async generate(): Promise<GenerateResponse> {
    return { text: "stub" };
  },
  async generateStructured<T>(request: GenerateStructuredRequest<T>): Promise<StructuredResult<T>> {
    const candidate = {
      claims: [
        { queryId: "forged-query-id-does-not-exist", supportedEvidenceIds: [], reason: "x" },
      ],
      counterArguments: [],
    };
    const result = request.schema.safeParse(candidate);
    return result.success
      ? { ok: true, data: result.data }
      : { ok: false, reason: "schema_validation_failed", raw: JSON.stringify(candidate) };
  },
};

// 실제로 전달되지 않은 evidence ID를 claim의 supportedEvidenceIds로 반환하는
// provider — evidence ID 부분집합 검증(.refine())을 위반해야 한다(item 1).
const stubProviderForgingEvidenceId: LLMProvider = {
  async generate(): Promise<GenerateResponse> {
    return { text: "stub" };
  },
  async generateStructured<T>(request: GenerateStructuredRequest<T>): Promise<StructuredResult<T>> {
    const parsed = parsePrompt(request.prompt);
    const candidate = {
      claims: parsed.claims.map((c) => ({
        queryId: c.queryId,
        supportedEvidenceIds: ["forged-evidence-id-does-not-exist"],
        reason: "x",
      })),
      counterArguments: parsed.counterArguments.map((c) => ({
        queryId: c.queryId,
        counterArgumentIndex: c.counterArgumentIndex,
        supportedEvidenceIds: c.supportingIds,
        counterEvidenceIds: c.counterIds,
        reason: "관련성 확인됨",
      })),
    };
    const result = request.schema.safeParse(candidate);
    return result.success
      ? { ok: true, data: result.data }
      : { ok: false, reason: "schema_validation_failed", raw: JSON.stringify(candidate) };
  },
};

function makeQuery(
  id: string,
  issueType: ResearchQuery["issueType"] = "DISABILITY_LOCATION"
): ResearchQuery {
  return {
    id,
    topic: `topic-${id}`,
    focus: `focus-${id}`,
    domain: "INJURY_DISABILITY",
    issueType,
    keywords: [],
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

describe("lib/pipeline/verifier verify (REQ-RESEARCH-019/020/021/022)", () => {
  it("AC-RESEARCH-017: 위조된 Challenge evidence ID는 제거되고 유효 ID는 VerifiedCounterArgument에 보존된다", async () => {
    const queries = [makeQuery("q1"), makeQuery("q2")];
    const findings: DraftFinding[] = [
      { queryId: "q1", summary: "s1", supportingEvidenceIds: ["e1"] },
      { queryId: "q2", summary: "s2", supportingEvidenceIds: [] },
    ];
    const challenges: Challenge[] = [
      {
        findingId: "q1",
        counterArgument: "기왕증 가능성",
        supportingEvidenceIds: ["e1", "forged-id"],
        counterEvidenceIds: ["forged-id-2"],
      },
    ];
    const evidence = new Map<string, EvidenceCandidate[]>([
      ["q1", [makeEvidence("e1")]],
      ["q2", [makeEvidence("e2")]],
    ]);

    const result = await verify(queries, findings, challenges, evidence, stubProvider);

    expect(result.verifiedClaims).toHaveLength(2);
    const [claim1, claim2] = result.verifiedClaims;
    expect(claim1.status).toBe("VERIFIED");
    expect(claim1.supportingEvidenceIds).toEqual(["e1"]);
    expect(claim1.counterArguments).toHaveLength(1);
    expect(claim1.counterArguments[0].supportingEvidenceIds).toEqual(["e1"]);
    expect(claim1.counterArguments[0].counterEvidenceIds).toEqual([]);

    expect(claim2.status).toBe("INSUFFICIENT");
    expect(claim2.supportingEvidenceIds).toEqual([]);
    expect(result.uncertainty.length).toBeGreaterThan(0);
  });

  it("AC-RESEARCH-018: finding의 위조 evidence ID가 제거되어 빈 배열이 되면 INSUFFICIENT로 강등되고 사유가 기록된다", async () => {
    const queries = [makeQuery("q1")];
    const findings: DraftFinding[] = [
      { queryId: "q1", summary: "s1", supportingEvidenceIds: ["forged-only"] },
    ];
    const evidence = new Map<string, EvidenceCandidate[]>([["q1", [makeEvidence("e1")]]]);

    const result = await verify(queries, findings, [], evidence, stubProvider);

    expect(result.verifiedClaims[0].supportingEvidenceIds).toEqual([]);
    expect(result.verifiedClaims[0].status).toBe("INSUFFICIENT");
    expect(result.uncertainty.length).toBeGreaterThan(0);
  });

  it("AC-RESEARCH-019a: 모든 query에 대응하는 finding이 없으면 query 개수만큼 missingMaterials가 생성된다", async () => {
    const queries = [makeQuery("q1", "DISABILITY_LOCATION"), makeQuery("q2", "CAUSATION")];

    const result = await verify(queries, [], [], new Map(), stubProvider);

    expect(result.missingMaterials).toHaveLength(2);
    expect(result.missingMaterials.map((m) => m.relatedIssueType)).toEqual([
      "DISABILITY_LOCATION",
      "CAUSATION",
    ]);
    expect(result.uncertainty.length).toBeGreaterThanOrEqual(2);
  });

  it("AC-RESEARCH-019b: 특정 query에만 대응하는 finding이 없으면 그 query만 missingMaterials에 담긴다", async () => {
    const queries = [makeQuery("q1"), makeQuery("q2", "CAUSATION")];
    const findings: DraftFinding[] = [
      { queryId: "q1", summary: "s1", supportingEvidenceIds: ["e1"] },
    ];
    const evidence = new Map<string, EvidenceCandidate[]>([["q1", [makeEvidence("e1")]]]);

    const result = await verify(queries, findings, [], evidence, stubProvider);

    expect(result.missingMaterials).toHaveLength(1);
    expect(result.missingMaterials[0].relatedIssueType).toBe("CAUSATION");
    expect(result.verifiedClaims).toHaveLength(1);
    expect(result.verifiedClaims[0].status).toBe("VERIFIED");
  });

  it("AC-RESEARCH-019: 반환된 모든 문자열 필드에 숫자+% 또는 확률 패턴이 없다", async () => {
    const queries = [makeQuery("q1")];
    const findings: DraftFinding[] = [
      { queryId: "q1", summary: "s1", supportingEvidenceIds: ["e1"] },
    ];
    const challenges: Challenge[] = [
      {
        findingId: "q1",
        counterArgument: "기왕증 가능성",
        supportingEvidenceIds: ["e1"],
        counterEvidenceIds: [],
      },
    ];
    const evidence = new Map<string, EvidenceCandidate[]>([["q1", [makeEvidence("e1")]]]);

    const result = await verify(queries, findings, challenges, evidence, stubProvider);

    const forbiddenPattern = /\d+\s*(%|확률)/;
    const strings = [
      ...result.verifiedClaims.map((c) => c.summary),
      ...result.verifiedClaims.flatMap((c) => c.counterArguments.map((ca) => ca.summary)),
      ...result.missingMaterials.map((m) => m.description),
      ...result.uncertainty,
    ];
    for (const value of strings) {
      expect(value).not.toMatch(forbiddenPattern);
    }
  });

  // --- Fix-B: 의미 검증(semantic verification) 단계 — claim ----------------

  it("Fix-B: 구조적으로 유효하지만 CONTENT상 무관한 evidence만 인용된 claim은 INSUFFICIENT로 강등된다", async () => {
    const queries = [makeQuery("q1")];
    const findings: DraftFinding[] = [
      { queryId: "q1", summary: "장해평가 기준 미충족 소견", supportingEvidenceIds: ["e1"] },
    ];
    const evidence = new Map<string, EvidenceCandidate[]>([["q1", [makeEvidence("e1")]]]);
    const provider = stubProviderWithClaimVerdicts(() => ({
      supportedEvidenceIds: [],
      reason: "제시된 근거자료는 다른 쟁점을 다루고 있어 이 소견을 뒷받침하지 않습니다.",
    }));

    const result = await verify(queries, findings, [], evidence, provider);

    expect(result.verifiedClaims).toHaveLength(1);
    expect(result.verifiedClaims[0].status).toBe("INSUFFICIENT");
    expect(result.verifiedClaims[0].supportingEvidenceIds).toEqual([]);
    expect(result.uncertainty.some((u) => u.includes("q1"))).toBe(true);
  });

  it("Fix-B: 의미 검증 호출이 실패(ok:false)하면 fail-open하지 않고 배치 내 모든 candidate가 INSUFFICIENT로 처리된다", async () => {
    const queries = [makeQuery("q1"), makeQuery("q2")];
    const findings: DraftFinding[] = [
      { queryId: "q1", summary: "s1", supportingEvidenceIds: ["e1"] },
      { queryId: "q2", summary: "s2", supportingEvidenceIds: ["e2"] },
    ];
    const evidence = new Map<string, EvidenceCandidate[]>([
      ["q1", [makeEvidence("e1")]],
      ["q2", [makeEvidence("e2")]],
    ]);

    const result = await verify(queries, findings, [], evidence, failingStructuredProvider);

    expect(result.verifiedClaims).toHaveLength(2);
    expect(result.verifiedClaims.every((c) => c.status === "INSUFFICIENT")).toBe(true);
    expect(result.uncertainty.filter((u) => u.includes("의미 검증")).length).toBe(2);
  });

  it("Fix-B: 구조적/의미 검증을 모두 통과했더라도 금지된 확정성 표현이 감지되면 INSUFFICIENT로 강등된다(safety-validator defense-in-depth)", async () => {
    const queries = [makeQuery("q1"), makeQuery("q2")];
    const findings: DraftFinding[] = [
      { queryId: "q1", summary: "보험금 지급 확률은 95%입니다.", supportingEvidenceIds: ["e1"] },
      { queryId: "q2", summary: "정상 소견입니다.", supportingEvidenceIds: ["e2"] },
    ];
    const challenges: Challenge[] = [
      {
        findingId: "q2",
        counterArgument: "보험금 1,000만원을 반드시 지급합니다.",
        supportingEvidenceIds: ["e2"],
        counterEvidenceIds: [],
      },
    ];
    const evidence = new Map<string, EvidenceCandidate[]>([
      ["q1", [makeEvidence("e1")]],
      ["q2", [makeEvidence("e2")]],
    ]);

    const result = await verify(queries, findings, challenges, evidence, stubProvider);

    // q1: summary 자체에 금지 표현("95%") → INSUFFICIENT
    expect(result.verifiedClaims[0].status).toBe("INSUFFICIENT");
    // q2: summary는 안전하지만 counterArguments[0].summary에 금지 표현("반드시 지급")
    // → item 2에 따라 claim status는 그대로(VERIFIED)이되 해당 counterArgument는
    // 최종 배열에서 제거된다.
    expect(result.verifiedClaims[1].status).toBe("VERIFIED");
    expect(result.verifiedClaims[1].counterArguments).toHaveLength(0);
    expect(result.uncertainty.some((u) => u.includes("금지된"))).toBe(true);
  });

  it("Fix-B: 실제 evidence + 관련성 확인 + 금지 표현 없음이면 VERIFIED를 유지한다(회귀 확인)", async () => {
    const queries = [makeQuery("q1")];
    const findings: DraftFinding[] = [
      { queryId: "q1", summary: "장해평가 기준 검토가 필요합니다.", supportingEvidenceIds: ["e1"] },
    ];
    const challenges: Challenge[] = [
      {
        findingId: "q1",
        counterArgument: "기왕증 가능성이 있어 추가 확인이 필요합니다.",
        supportingEvidenceIds: ["e1"],
        counterEvidenceIds: [],
      },
    ];
    const evidence = new Map<string, EvidenceCandidate[]>([["q1", [makeEvidence("e1")]]]);

    const result = await verify(queries, findings, challenges, evidence, stubProvider);

    expect(result.verifiedClaims[0].status).toBe("VERIFIED");
    expect(result.verifiedClaims[0].supportingEvidenceIds).toEqual(["e1"]);
  });

  it("Fix-B: 의미 검증 schema의 .refine()은 candidate 집합에 없는 queryId를 반환하는 provider를 거부한다(fail-closed로 관찰)", async () => {
    const queries = [makeQuery("q1")];
    const findings: DraftFinding[] = [
      { queryId: "q1", summary: "s1", supportingEvidenceIds: ["e1"] },
    ];
    const evidence = new Map<string, EvidenceCandidate[]>([["q1", [makeEvidence("e1")]]]);

    const result = await verify(queries, findings, [], evidence, stubProviderForgingQueryId);

    // provider가 candidate 집합에 없는 queryId("forged-query-id-does-not-exist")를
    // 반환 → request.schema.safeParse()가 .refine()에서 실패 → provider는
    // ok:false를 반환 → verify()는 fail-closed하여 candidate를 INSUFFICIENT로
    // 처리한다. (성공했다면 q1이 candidate 집합에 없는 결과와 매칭되지 못해
    // VERIFIED로 남는 버그가 있었을 것이다.)
    expect(result.verifiedClaims[0].status).toBe("INSUFFICIENT");
    expect(result.uncertainty.some((u) => u.includes("의미 검증"))).toBe(true);
  });

  // --- item 1: Verifier semantic evidence verification을 counterArgument에도 적용 ---

  it("item 1: claim이 e1/e2를 인용하지만 e1만 실제 관련이면 최종 supportingEvidenceIds에는 e1만 남는다", async () => {
    const queries = [makeQuery("q1")];
    const findings: DraftFinding[] = [
      {
        queryId: "q1",
        summary: "장해평가 기준 검토가 필요합니다.",
        supportingEvidenceIds: ["e1", "e2"],
      },
    ];
    const evidence = new Map<string, EvidenceCandidate[]>([
      ["q1", [makeEvidence("e1"), makeEvidence("e2")]],
    ]);
    const provider = stubProviderWithClaimVerdicts(() => ({
      supportedEvidenceIds: ["e1"],
      reason: "e1만 실제로 이 소견을 다룹니다.",
    }));

    const result = await verify(queries, findings, [], evidence, provider);

    expect(result.verifiedClaims[0].status).toBe("VERIFIED");
    expect(result.verifiedClaims[0].supportingEvidenceIds).toEqual(["e1"]);
  });

  it("item 1: skeptic 반론이 실존하지만 무관한 evidence를 인용하면 그 ID는 최종 counterArguments에서 제거된다", async () => {
    const queries = [makeQuery("q1")];
    const findings: DraftFinding[] = [
      { queryId: "q1", summary: "장해평가 기준 검토가 필요합니다.", supportingEvidenceIds: ["e1"] },
    ];
    const challenges: Challenge[] = [
      {
        findingId: "q1",
        counterArgument: "기왕증 가능성이 있습니다.",
        supportingEvidenceIds: ["e1", "e2"],
        counterEvidenceIds: [],
      },
    ];
    const evidence = new Map<string, EvidenceCandidate[]>([
      ["q1", [makeEvidence("e1"), makeEvidence("e2")]],
    ]);
    const provider = stubProviderWithCounterArgumentVerdicts(() => ({
      supportedEvidenceIds: ["e1"],
      counterEvidenceIds: [],
      reason: "e2는 다른 쟁점을 다루고 있어 이 반론과 무관합니다.",
    }));

    const result = await verify(queries, findings, challenges, evidence, provider);

    expect(result.verifiedClaims[0].status).toBe("VERIFIED");
    expect(result.verifiedClaims[0].counterArguments).toHaveLength(1);
    expect(result.verifiedClaims[0].counterArguments[0].supportingEvidenceIds).toEqual(["e1"]);
  });

  it("item 1: counterArgument가 위조 evidence ID를 반환하면(구조 밖 subset 위반) 기존처럼 fail-closed로 제거된다", async () => {
    const queries = [makeQuery("q1")];
    const findings: DraftFinding[] = [
      { queryId: "q1", summary: "s1", supportingEvidenceIds: ["e1"] },
    ];
    const challenges: Challenge[] = [
      {
        findingId: "q1",
        counterArgument: "기왕증 가능성이 있습니다.",
        supportingEvidenceIds: ["e1"],
        counterEvidenceIds: [],
      },
    ];
    const evidence = new Map<string, EvidenceCandidate[]>([["q1", [makeEvidence("e1")]]]);

    const result = await verify(
      queries,
      findings,
      challenges,
      evidence,
      stubProviderForgingEvidenceId
    );

    // provider가 claim/counterArgument 양쪽에 실제로 전달되지 않은 evidence ID를
    // 반환 → .refine()의 evidence 부분집합 검증 실패 → schema 자체가 거부되어
    // provider는 ok:false 반환 → verify()는 fail-closed(claim은 INSUFFICIENT,
    // counterArgument는 evidence 연결 제거)로 처리한다.
    expect(result.verifiedClaims[0].status).toBe("INSUFFICIENT");
    expect(result.verifiedClaims[0].counterArguments[0].supportingEvidenceIds).toEqual([]);
    expect(result.uncertainty.some((u) => u.includes("의미 검증"))).toBe(true);
  });

  it("item 1: 의미검증 전체 실패(ok:false)면 counterArgument의 evidence 연결도 fail-closed로 제거된다", async () => {
    const queries = [makeQuery("q1")];
    const findings: DraftFinding[] = [
      { queryId: "q1", summary: "s1", supportingEvidenceIds: ["e1"] },
    ];
    const challenges: Challenge[] = [
      {
        findingId: "q1",
        counterArgument: "기왕증 가능성이 있습니다.",
        supportingEvidenceIds: ["e1"],
        counterEvidenceIds: [],
      },
    ];
    const evidence = new Map<string, EvidenceCandidate[]>([["q1", [makeEvidence("e1")]]]);

    const result = await verify(queries, findings, challenges, evidence, failingStructuredProvider);

    expect(result.verifiedClaims[0].status).toBe("INSUFFICIENT");
    expect(result.verifiedClaims[0].counterArguments[0].supportingEvidenceIds).toEqual([]);
    expect(result.verifiedClaims[0].counterArguments[0].counterEvidenceIds).toEqual([]);
  });

  it("item 1: counterArgument에 인용된 evidence가 없으면 semantic 후보에서 제외되고(호출 없이) 구조적 결과 그대로 유지된다", async () => {
    const queries = [makeQuery("q1")];
    const findings: DraftFinding[] = [
      { queryId: "q1", summary: "s1", supportingEvidenceIds: ["e1"] },
    ];
    const challenges: Challenge[] = [
      {
        findingId: "q1",
        counterArgument: "일반적인 반론입니다(근거 인용 없음).",
        supportingEvidenceIds: [],
        counterEvidenceIds: [],
      },
    ];
    const evidence = new Map<string, EvidenceCandidate[]>([["q1", [makeEvidence("e1")]]]);

    const result = await verify(queries, findings, challenges, evidence, stubProvider);

    expect(result.verifiedClaims[0].status).toBe("VERIFIED");
    expect(result.verifiedClaims[0].counterArguments).toHaveLength(1);
    expect(result.verifiedClaims[0].counterArguments[0].supportingEvidenceIds).toEqual([]);
    expect(result.verifiedClaims[0].counterArguments[0].counterEvidenceIds).toEqual([]);
  });
});
