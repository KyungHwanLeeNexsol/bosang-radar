import { describe, expect, it } from "vitest";
import type { LLMProvider } from "../ai/provider";
import { verify } from "./verifier";
import type { Challenge, DraftFinding, EvidenceCandidate, ResearchQuery } from "./types";

// M5: verify()는 5인자 필수 형태 verify(queries, findings, challenges, evidence,
// provider)로 재작성되고 Promise<VerificationResult>를 반환한다(design.md §3).
// 2차 방어선(evidence 재검증, Researcher claim + Skeptic evidence 양쪽) +
// query↔finding 대조를 통한 missingMaterials 산출(design.md §7 4차 revision).
// (REQ-RESEARCH-019/020/021/022, AC-RESEARCH-017/018/019/019a/019b)

const stubProvider: LLMProvider = {
  async generate() {
    return { text: "stub" };
  },
  async generateStructured() {
    return { ok: false, reason: "schema_validation_failed", raw: "{}" };
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
});
