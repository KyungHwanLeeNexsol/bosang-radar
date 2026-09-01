import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { cases, reports } from "../db/schema";
import type { ResearchReport } from "../pipeline/types";

// AC-SCAFFOLD-010: owner_user_id 필터링 — 조회 쿼리에 항상 ownerUserId
// 조건을 함께 걸어, 다른 사용자가 소유한 사건은 (존재하더라도) 조회 결과에
// 나타나지 않는다. app/cases/[caseId]/page.tsx(M5)가 이 함수를 호출하고,
// null이면 notFound()로 처리한다(design.md §3).
//
// @MX:ANCHOR: [AUTO] 사건 상세/리포트 조회의 유일한 접근 통제 지점
// @MX:REASON: 이 함수를 우회해 cases/reports를 직접 조회하는 코드가 생기면
// owner_user_id 격리가 깨진다(REQ-SCAFFOLD-011).

export interface CaseWithReport {
  id: string;
  input: unknown;
  status: string;
  createdAt: Date;
  report: ResearchReport | null;
  // SPEC-FEEDBACK-001 M3 — 피드백 제출(lib/feedback/submit-feedback.ts)이
  // 참조할 reportId. 표시되는 report와 반드시 동일한 조회 행에서 도출되어야
  // 하므로(REQ-FEEDBACK-009 표시-제출 값 불일치 방지), 아래 단일 reports
  // 쿼리 행에서 함께 추출한다. 리포트가 없으면 null.
  reportId: string | null;
}

export async function getCaseForOwner(
  caseId: string,
  ownerUserId: string
): Promise<CaseWithReport | null> {
  const db = getDb();

  const caseRows = await db
    .select()
    .from(cases)
    .where(and(eq(cases.id, caseId), eq(cases.ownerUserId, ownerUserId)))
    .limit(1);

  const caseRow = caseRows[0];
  if (!caseRow) {
    return null;
  }

  // REQ-FEEDBACK-009 — 사건에 리포트가 2개 이상 존재할 수 있으므로,
  // createdAt DESC(동일 시각이면 id DESC로 tie-break) 정렬로 항상 가장
  // 최근 리포트 하나만 결정론적으로 선택한다. 화면 표시(report)와 피드백
  // 제출 대상(reportId)이 이 동일한 단일 쿼리 행에서 함께 도출되므로
  // 표시-제출 값 불일치가 구조적으로 발생하지 않는다.
  const reportRows = await db
    .select()
    .from(reports)
    .where(eq(reports.caseId, caseId))
    .orderBy(desc(reports.createdAt), desc(reports.id))
    .limit(1);

  const reportRow = reportRows[0];

  return {
    id: caseRow.id,
    input: caseRow.input,
    status: caseRow.status,
    createdAt: caseRow.createdAt,
    report: (reportRow?.content as ResearchReport | undefined) ?? null,
    reportId: reportRow?.id ?? null,
  };
}
