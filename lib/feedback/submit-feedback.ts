import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client";
import { cases, evidence, feedback, reports } from "../db/schema";
import type { ResearchReport } from "../pipeline/types";
import { reportFeedbackPayloadSchema } from "./schema";

// 리포트 단위 구조화 피드백 write-path (REQ-FEEDBACK-009~013).
//
// caseId는 오직 reportId로 조회한 reports 행의 caseId에서만 도출한다 —
// 이 함수의 공개 시그니처는 caseId를 파라미터로 받지 않는다(REQ-FEEDBACK-010,
// cross-case spoofing 방지). 소유권 검사는 lib/cases/get-case-for-owner.ts의
// ownerUserId 앵커 원칙과 동일하게 적용한다(REQ-FEEDBACK-009).

export interface SubmitFeedbackSuccess {
  success: true;
  feedbackId: string;
  caseId: string;
}

export interface SubmitFeedbackValidationFailure {
  success: false;
  fieldErrors: Record<string, string[]>;
}

export type SubmitFeedbackResult = SubmitFeedbackSuccess | SubmitFeedbackValidationFailure;

function toFieldErrors(
  issues: { path: PropertyKey[]; message: string }[]
): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : "_form";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors;
}

function formError(message: string): SubmitFeedbackValidationFailure {
  return { success: false, fieldErrors: { _form: [message] } };
}

export async function submitReportFeedback(
  reportId: string,
  ownerUserId: string,
  rawPayload: unknown
): Promise<SubmitFeedbackResult> {
  const db = getDb();

  // (1) reportId → caseId 도출 + 존재 확인.
  const reportRows = await db.select().from(reports).where(eq(reports.id, reportId)).limit(1);
  const reportRow = reportRows[0];
  if (!reportRow) {
    return formError("존재하지 않는 리포트입니다.");
  }

  // (1) 소유권 검사 — reportId가 가리키는 사건의 ownerUserId가 호출자와 일치해야 한다
  // (REQ-FEEDBACK-009, get-case-for-owner.ts의 ownerUserId 앵커 원칙과 동일).
  const caseRows = await db.select().from(cases).where(eq(cases.id, reportRow.caseId)).limit(1);
  const caseRow = caseRows[0];
  if (!caseRow || caseRow.ownerUserId !== ownerUserId) {
    return formError("이 리포트에 피드백을 제출할 권한이 없습니다.");
  }

  // (2) 정적 검증(Zod, REQ-FEEDBACK-003~008).
  const parsed = reportFeedbackPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return { success: false, fieldErrors: toFieldErrors(parsed.error.issues) };
  }
  const payload = parsed.data;

  // (3) claimIndex 범위 검사 — 저장된 리포트의 verifiedClaims 길이 기준(REQ-FEEDBACK-011).
  const verifiedClaimsLength =
    (reportRow.content as ResearchReport | null)?.verifiedClaims?.length ?? 0;
  const outOfBounds = payload.claimAssessments.some(
    (assessment) => assessment.claimIndex < 0 || assessment.claimIndex >= verifiedClaimsLength
  );
  if (outOfBounds) {
    return formError("존재하지 않는 주장(claim)에 대한 평가입니다.");
  }

  // (4) evidenceId 존재 검사 — existence-only, 리포트가 실제로 인용했는지는
  // 교차검증하지 않는다(REQ-FEEDBACK-012, 사용자 명시적 단순화 결정). 빈
  // 배열이면 쿼리 자체를 생략한다(empty IN () 방지).
  if (payload.evidenceAssessments.length > 0) {
    const distinctEvidenceIds = [
      ...new Set(payload.evidenceAssessments.map((assessment) => assessment.evidenceId)),
    ];
    const existingEvidenceRows = await db
      .select()
      .from(evidence)
      .where(inArray(evidence.id, distinctEvidenceIds));
    const existingIds = new Set(existingEvidenceRows.map((row: { id: string }) => row.id));
    const hasMissingEvidence = distinctEvidenceIds.some((id) => !existingIds.has(id));
    if (hasMissingEvidence) {
      return formError("존재하지 않는 근거자료(evidence)에 대한 평가입니다.");
    }
  }

  // (5) 영속화 — append-only(REQ-FEEDBACK-002), caseId는 (1)에서 도출한 서버 값.
  const feedbackId = randomUUID();
  await db.insert(feedback).values({
    id: feedbackId,
    caseId: reportRow.caseId,
    reportId,
    userId: ownerUserId,
    payload,
    createdAt: new Date(),
  });

  // (6) 성공 결과 — caseId는 (1)에서 도출한 서버 값이며 호출자 입력에서 유래하지 않는다.
  return { success: true, feedbackId, caseId: reportRow.caseId };
}
