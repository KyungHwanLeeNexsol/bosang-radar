import { describe, expect, it } from "vitest";
import { runPipeline } from "./index";

const validInput = {
  incidentDescription: "2024년 3월, 계단에서 미끄러져 우측 발목을 다쳤습니다.",
  diagnosisName: "우측 발목 인대 파열",
  disabilityBodyPart: "우측 발목",
  incidentDate: "2024-03-15",
};

describe("lib/pipeline/index runPipeline end-to-end (AC-SCAFFOLD-013, REQ-SCAFFOLD-014)", () => {
  it("6단계(CaseNormalizer→QueryPlanner→EvidenceRetriever→Researcher→Skeptic→Verifier)를 순차 실행해 seed evidence와 연결된 Research Report를 생성한다", async () => {
    const report = await runPipeline(validInput);

    expect(report.caseSummary.incidentDescription).toBe(validInput.incidentDescription);
    expect(report.claims.length).toBeGreaterThan(0);
    for (const claim of report.claims) {
      expect(claim.supportingEvidenceIds.length).toBeGreaterThan(0);
    }
    expect(() => new Date(report.generatedAt).toISOString()).not.toThrow();
  });
});
