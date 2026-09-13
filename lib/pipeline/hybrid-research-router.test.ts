import { describe, expect, it } from "vitest";
import type { DraftFinding, EvidenceCandidate, ResearchQuery, VerificationResult } from "./types";
import {
  preferPremiumVerification,
  selectEscalation,
  selectInitialResearchTier,
} from "./hybrid-research-router";

function query(issueType: ResearchQuery["issueType"], id = `q-${issueType}`): ResearchQuery {
  return {
    id,
    issueType,
    domain: "INJURY_DISABILITY",
    topic: "테스트 쟁점",
    focus: "테스트",
    keywords: ["테스트"],
  };
}

function evidence(id: string): EvidenceCandidate {
  return {
    id,
    category: "테스트",
    evidenceType: "OTHER",
    scope: "UNIVERSAL",
    title: "테스트 근거",
    content: "테스트 근거 내용",
    sourceUrl: null,
    issueTypes: ["CAUSATION"],
  };
}

function result(
  status: "VERIFIED" | "INSUFFICIENT",
  uncertainty: string[] = []
): VerificationResult {
  return {
    verifiedClaims: [
      {
        summary: "검토 소견",
        supportingEvidenceIds: status === "VERIFIED" ? ["ev-1"] : [],
        counterArguments: [],
        status,
      },
    ],
    missingMaterials: [],
    uncertainty,
  };
}

describe("hybrid research router", () => {
  it("기본 쟁점만 있는 일반 사건은 Lite로 시작한다", () => {
    expect(selectInitialResearchTier([query("CAUSATION")])).toEqual({
      tier: "lite",
      reason: "standard_case",
    });
  });

  it.each([
    "PRE_EXISTING_CONDITION",
    "INJURY_DISEASE_RELATION",
    "ADDITIONAL_CONFIRMATION_NEEDED",
  ] as const)("%s 신호가 있으면 처음부터 Premium으로 보낸다", (issueType) => {
    expect(selectInitialResearchTier([query("CAUSATION"), query(issueType)])).toEqual({
      tier: "premium",
      reason: "complex_issue",
    });
  });

  it("근거가 있는데 Lite finding이 누락되면 Premium으로 승격한다", () => {
    const queries = [query("CAUSATION", "q-1")];
    const evidenceMap = new Map([["q-1", [evidence("ev-1")]]]);

    expect(selectEscalation(queries, evidenceMap, [], result("VERIFIED"))).toEqual({
      tier: "premium",
      reason: "lite_incomplete",
    });
  });

  it("근거 자체가 없는 쿼리의 missing material만으로는 승격하지 않는다", () => {
    const queries = [query("CAUSATION", "q-1")];
    expect(selectEscalation(queries, new Map(), [], result("VERIFIED"))).toBeNull();
  });

  it("Lite 검증 결과에 INSUFFICIENT가 있으면 Premium으로 승격한다", () => {
    const queries = [query("CAUSATION", "q-1")];
    const evidenceMap = new Map([["q-1", [evidence("ev-1")]]]);
    const findings: DraftFinding[] = [
      { queryId: "q-1", summary: "검토 소견", supportingEvidenceIds: ["ev-1"] },
    ];

    expect(
      selectEscalation(queries, evidenceMap, findings, result("INSUFFICIENT", ["검증 불충분"]))
    ).toEqual({ tier: "premium", reason: "lite_insufficient" });
  });

  it("Premium 재검토가 더 나빠지면 Lite 결과를 보존한다", () => {
    expect(preferPremiumVerification(result("VERIFIED"), result("INSUFFICIENT"))).toBe(false);
    expect(preferPremiumVerification(result("INSUFFICIENT"), result("VERIFIED"))).toBe(true);
  });
});
