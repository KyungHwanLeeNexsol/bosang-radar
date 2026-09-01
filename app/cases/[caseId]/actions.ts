"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth/session";
import { submitReportFeedback as submitReportFeedbackWritePath } from "@/lib/feedback/submit-feedback";
import type { SubmitFeedbackResult } from "@/lib/feedback/submit-feedback";

// 사건 상세 뷰의 구조화 리포트 피드백 제출 Server Action(REQ-FEEDBACK-014,
// REQ-FEEDBACK-015 — 옛 자유 텍스트 submitFeedback()을 완전히 대체한다).
// caseId는 write-path가 reportId로부터 도출한 서버 값만 사용한다
// (result.caseId) — 이 액션의 시그니처에도 caseId 파라미터는 없다.
export async function submitReportFeedback(
  reportId: string,
  rawPayload: unknown
): Promise<SubmitFeedbackResult> {
  const session = await getCurrentSession();
  if (!session?.user) {
    throw new Error("로그인이 필요합니다.");
  }

  const result = await submitReportFeedbackWritePath(reportId, session.user.id, rawPayload);

  if (result.success) {
    revalidatePath(`/cases/${result.caseId}`);
  }

  return result;
}
