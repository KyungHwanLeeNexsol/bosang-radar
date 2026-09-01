import { describe, expect, it } from "vitest";
import { reportFeedbackPayloadSchema } from "./schema";

// SPEC-FEEDBACK-001 M2 — reportFeedbackPayloadSchema 정적 검증 테스트
// (REQ-FEEDBACK-003~008, AC-FEEDBACK-003~008).

function validFullPayload() {
  return {
    overallRating: "ACCURATE",
    overallComment: "전반적으로 타당한 리서치입니다.",
    missedIssues: [{ issueType: "CAUSATION", description: "인과관계 쟁점 보강 필요" }],
    claimAssessments: [
      { claimIndex: 0, verdict: "CORRECT", correctedReasoning: "근거자료 적절함" },
    ],
    evidenceAssessments: [{ evidenceId: "ev-1", verdict: "USEFUL" }],
    outcome: { description: "합의 완료", confirmedAt: "2026-09-01" },
  };
}

describe("lib/feedback/schema reportFeedbackPayloadSchema (REQ-FEEDBACK-003~008)", () => {
  it("[AC-FEEDBACK-003] 모든 필드가 채워진 유효한 payload는 파싱에 성공한다", () => {
    const result = reportFeedbackPayloadSchema.safeParse(validFullPayload());
    expect(result.success).toBe(true);
  });

  it("[AC-FEEDBACK-003] outcome.confirmedAt이 'abc'이면 실패하고 issue path에 outcome을 포함한다", () => {
    const payload = {
      ...validFullPayload(),
      outcome: { description: "합의 완료", confirmedAt: "abc" },
    };
    const result = reportFeedbackPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes("outcome"))).toBe(true);
    }
  });

  it("[AC-FEEDBACK-003] outcome.confirmedAt이 '2026-99-99'(형식상 불가능한 날짜)이면 실패한다", () => {
    const payload = {
      ...validFullPayload(),
      outcome: { description: "합의 완료", confirmedAt: "2026-99-99" },
    };
    const result = reportFeedbackPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes("outcome"))).toBe(true);
    }
  });

  it("[AC-FEEDBACK-004] overallRating만 있는 최소 payload는 파싱에 성공하고 배열은 []로 기본값 처리된다", () => {
    const result = reportFeedbackPayloadSchema.safeParse({ overallRating: "ACCURATE" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.missedIssues).toEqual([]);
      expect(result.data.claimAssessments).toEqual([]);
      expect(result.data.evidenceAssessments).toEqual([]);
    }
  });

  it("[AC-FEEDBACK-004] overallComment가 공백만 있으면 undefined로 정규화된다", () => {
    const result = reportFeedbackPayloadSchema.safeParse({
      overallRating: "ACCURATE",
      overallComment: "   ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.overallComment).toBeUndefined();
    }
  });

  it("[AC-FEEDBACK-004] outcome.description만 채워지고 confirmedAt이 없으면 실패한다 (all-or-nothing)", () => {
    const result = reportFeedbackPayloadSchema.safeParse({
      overallRating: "ACCURATE",
      outcome: { description: "합의 완료" },
    });
    expect(result.success).toBe(false);
  });

  it("[REQ-FEEDBACK-007 회귀] description/confirmedAt이 둘 다 공백이면 outcome 전체가 생략된다", () => {
    const result = reportFeedbackPayloadSchema.safeParse({
      overallRating: "ACCURATE",
      outcome: { description: "   ", confirmedAt: "   " },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.outcome).toBeUndefined();
    }
  });

  it("[REQ-FEEDBACK-007 회귀] description이 공백이고 confirmedAt만 유효하면 실패한다 (부분 outcome)", () => {
    const result = reportFeedbackPayloadSchema.safeParse({
      overallRating: "ACCURATE",
      outcome: { description: "   ", confirmedAt: "2026-09-01" },
    });
    expect(result.success).toBe(false);
  });

  it("[REQ-FEEDBACK-007 회귀] description/confirmedAt이 문자열이 아니면(잘못된 타입) 조용히 생략되지 않고 실패한다", () => {
    const result = reportFeedbackPayloadSchema.safeParse({
      overallRating: "ACCURATE",
      outcome: { description: 123, confirmedAt: 456 },
    });
    expect(result.success).toBe(false);
  });

  it("[AC-FEEDBACK-005] overallComment에 주민등록번호 형식 문자열이 있으면 거부된다", () => {
    const result = reportFeedbackPayloadSchema.safeParse({
      overallRating: "ACCURATE",
      overallComment: "제 주민번호는 901231-1234567 입니다.",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes("overallComment"))).toBe(true);
    }
  });

  it("[AC-FEEDBACK-006] claimAssessments[].correctedReasoning에 전화번호 형식 문자열이 있으면 거부된다", () => {
    const result = reportFeedbackPayloadSchema.safeParse({
      overallRating: "ACCURATE",
      claimAssessments: [
        { claimIndex: 0, verdict: "CORRECT", correctedReasoning: "010-1234-5678로 연락주세요" },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes("claimAssessments"))).toBe(
        true
      );
    }
  });

  it("[AC-FEEDBACK-006] claimAssessments에 동일한 claimIndex가 두 번 등장하면 거부된다", () => {
    const result = reportFeedbackPayloadSchema.safeParse({
      overallRating: "ACCURATE",
      claimAssessments: [
        { claimIndex: 0, verdict: "CORRECT" },
        { claimIndex: 0, verdict: "INCORRECT" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("[AC-FEEDBACK-006] evidenceAssessments에 동일한 evidenceId가 두 번 등장하면 거부된다", () => {
    const result = reportFeedbackPayloadSchema.safeParse({
      overallRating: "ACCURATE",
      evidenceAssessments: [
        { evidenceId: "ev-1", verdict: "USEFUL" },
        { evidenceId: "ev-1", verdict: "WEAK" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("[AC-FEEDBACK-007] missedIssues[].issueType이 QUERY_ISSUE_TYPES 8개 값에 없으면 거부된다", () => {
    const result = reportFeedbackPayloadSchema.safeParse({
      overallRating: "ACCURATE",
      missedIssues: [{ issueType: "UNRELATED_TYPE" }],
    });
    expect(result.success).toBe(false);
  });

  it("[AC-FEEDBACK-008] 스키마에 정의되지 않은 최상위 키(spoofed caseId)가 있으면 .strict()에 의해 거부된다", () => {
    const result = reportFeedbackPayloadSchema.safeParse({
      overallRating: "ACCURATE",
      caseId: "spoofed-case-id",
    });
    expect(result.success).toBe(false);
  });
});
