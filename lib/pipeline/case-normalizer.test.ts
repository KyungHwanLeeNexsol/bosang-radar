import { describe, expect, it } from "vitest";
import { normalizeCase } from "./case-normalizer";

describe("lib/pipeline/case-normalizer normalizeCase (REQ-SCAFFOLD-013)", () => {
  it("CaseInput을 받아 공백을 정리한 NormalizedCase를 반환한다", () => {
    const result = normalizeCase({
      incidentDescription: "  계단에서 미끄러짐  ",
      diagnosisName: " 발목 인대 파열 ",
      disabilityBodyPart: " 우측 발목 ",
      incidentDate: " 2024-03-15 ",
    });

    expect(result.incidentDescription).toBe("계단에서 미끄러짐");
    expect(result.diagnosisName).toBe("발목 인대 파열");
    expect(result.disabilityBodyPart).toBe("우측 발목");
    expect(result.incidentDate).toBe("2024-03-15");
  });

  it("normalizedAt에 파싱 가능한 ISO 8601 타임스탬프를 기록한다", () => {
    const result = normalizeCase({
      incidentDescription: "설명",
      diagnosisName: "진단",
      disabilityBodyPart: "부위",
      incidentDate: "2024-03-15",
    });

    expect(() => new Date(result.normalizedAt).toISOString()).not.toThrow();
  });
});
