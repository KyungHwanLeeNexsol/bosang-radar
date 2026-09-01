import { z } from "zod";
import { QUERY_ISSUE_TYPES } from "../pipeline/types";
import { piiFreeText } from "../validation/case-input";

// 리포트 단위 구조화 피드백 payload 정적 검증 스키마 (REQ-FEEDBACK-003~008).
//
// 정적 검증(형태/enum/PII 형식)만 이 파일에서 다룬다 — claimIndex 범위 검사,
// evidenceId 실존 검사, 소유권 검사 등 DB 조회가 필요한 동적 검증은
// lib/feedback/submit-feedback.ts(M3)의 책임이다(plan.md §C 관심사 분리).

const trimmedOptionalPiiFreeText = (fieldLabel: string) =>
  z.preprocess((value) => {
    if (typeof value === "string" && value.trim() === "") {
      return undefined;
    }
    return value;
  }, piiFreeText(fieldLabel).optional());

// REQ-FEEDBACK-003 — overallRating 필수, overallComment 선택(빈 문자열 → undefined 정규화).
const overallRatingSchema = z.enum(["ACCURATE", "PARTIALLY_ACCURATE", "INACCURATE"]);

// REQ-FEEDBACK-004 — missedIssues[]. issueType은 QUERY_ISSUE_TYPES(lib/pipeline/types.ts)를
// 단일 SSOT로 import한다 — 8개 값을 이 파일에서 별도로 재선언하지 않는다.
const missedIssueSchema = z.object({
  issueType: z.enum(QUERY_ISSUE_TYPES),
  description: trimmedOptionalPiiFreeText("누락 쟁점 설명"),
});

// REQ-FEEDBACK-005 — claimAssessments[]. correctedReasoning은 verdict 값과 무관하게
// 항상 선택 입력이다.
const claimAssessmentSchema = z.object({
  claimIndex: z.number().int(),
  verdict: z.enum(["CORRECT", "INCORRECT", "NEEDS_MORE_EVIDENCE"]),
  correctedReasoning: trimmedOptionalPiiFreeText("주장 평가 코멘트"),
});

// REQ-FEEDBACK-006 — evidenceAssessments[].
const evidenceAssessmentSchema = z.object({
  evidenceId: z.string().min(1),
  verdict: z.enum(["USEFUL", "WEAK", "IRRELEVANT"]),
});

// REQ-FEEDBACK-007 — outcome. description/confirmedAt은 all-or-nothing이며, 둘 다
// 비어 있으면 outcome 전체가 생략(undefined)된 것으로 정규화된다.
// confirmedAt은 z.iso.date()(Zod 4 전용, YYYY-MM-DD)로 검증한다 — z.string().min(1)은
// "abc" 같은 비-날짜 문자열을 통과시켜 REQ-FEEDBACK-007 계약을 위반한다.
const outcomeSchema = z.preprocess(
  (value) => {
    if (typeof value === "object" && value !== null) {
      const v = value as { description?: unknown; confirmedAt?: unknown };
      const descriptionEmpty = typeof v.description !== "string" || v.description.trim() === "";
      const confirmedAtEmpty = typeof v.confirmedAt !== "string" || v.confirmedAt.trim() === "";
      if (descriptionEmpty && confirmedAtEmpty) {
        return undefined;
      }
    }
    return value;
  },
  z.object({ description: piiFreeText("결과 설명"), confirmedAt: z.iso.date() }).optional()
);

export const reportFeedbackPayloadSchema = z
  .object({
    overallRating: overallRatingSchema,
    overallComment: trimmedOptionalPiiFreeText("전체 코멘트"),
    missedIssues: z.array(missedIssueSchema).default([]),
    claimAssessments: z
      .array(claimAssessmentSchema)
      .default([])
      .superRefine((items, ctx) => {
        const seen = new Set<number>();
        for (const item of items) {
          if (seen.has(item.claimIndex)) {
            ctx.addIssue({
              code: "custom",
              message: `claimIndex ${item.claimIndex}가 중복되었습니다.`,
            });
            return;
          }
          seen.add(item.claimIndex);
        }
      }),
    evidenceAssessments: z
      .array(evidenceAssessmentSchema)
      .default([])
      .superRefine((items, ctx) => {
        const seen = new Set<string>();
        for (const item of items) {
          if (seen.has(item.evidenceId)) {
            ctx.addIssue({
              code: "custom",
              message: `evidenceId ${item.evidenceId}가 중복되었습니다.`,
            });
            return;
          }
          seen.add(item.evidenceId);
        }
      }),
    outcome: outcomeSchema,
  })
  .strict();

export type ReportFeedbackPayload = z.infer<typeof reportFeedbackPayloadSchema>;
