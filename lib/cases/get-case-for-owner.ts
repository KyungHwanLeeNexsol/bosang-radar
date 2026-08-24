import { and, eq } from "drizzle-orm";
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

  const reportRows = await db.select().from(reports).where(eq(reports.caseId, caseId)).limit(1);

  return {
    id: caseRow.id,
    input: caseRow.input,
    status: caseRow.status,
    createdAt: caseRow.createdAt,
    report: (reportRows[0]?.content as ResearchReport | undefined) ?? null,
  };
}
