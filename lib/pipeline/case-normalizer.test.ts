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

  it("AC-RESEARCH-001: 담보 영역 판별·검증 로직을 포함하지 않는다 — 사전에 정의되지 않은 임의의 진단명/장해 부위 값도 예외 없이 그대로 통과시킨다", () => {
    // MVP 담보 제한은 QueryPlanner의 CoverageDomain 타입 제약(AC-RESEARCH-002)이
    // 구조적으로 보장하며, CaseNormalizer 계층에서는 별도로 검증하지 않는다
    // (design.md §5, acceptance.md AC-RESEARCH-001).
    expect(() =>
      normalizeCase({
        incidentDescription: "임의의 사건 설명",
        diagnosisName: "정의되지 않은 임의의 진단명 XYZ",
        disabilityBodyPart: "정의되지 않은 임의의 부위 XYZ",
        incidentDate: "2024-01-01",
      })
    ).not.toThrow();
  });
});
