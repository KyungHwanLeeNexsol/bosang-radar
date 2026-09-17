import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";
import { recoverStaleCaseJob } from "@/lib/cases/create-case";
import { getDb } from "@/lib/db/client";
import { caseJobs } from "@/lib/db/schema";
import { ANALYSIS_STAGES } from "@/lib/cases/analysis-stages";

// SPEC-CASE-PROGRESS-002 REQ-CASE-PROGRESS-002-009~011 — 총 체크포인트 수
// (DB/Node 의존성 없는 순수 상수 모듈, lib/cases/job-timing.ts와 동일한
// 설계 원칙이라 서버 전용 라우트에서 그대로 import해도 안전하다, design.md §5).
const TOTAL_STAGES = ANALYSIS_STAGES.length;

export async function GET(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const jobId = new URL(request.url).searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "jobId가 필요합니다." }, { status: 400 });
  }

  const jobQuery = and(eq(caseJobs.id, jobId), eq(caseJobs.ownerUserId, session.user.id));
  const [job] = await getDb()
    .select({ status: caseJobs.status, caseId: caseJobs.caseId, progressStage: caseJobs.progressStage })
    .from(caseJobs)
    .where(jobQuery);

  if (!job) {
    return NextResponse.json({ error: "분석 작업을 찾을 수 없습니다." }, { status: 404 });
  }

  let status = job.status;
  let caseId = job.caseId;
  let progressStage = job.progressStage;

  // M1(readiness 항목 7 재정정) — queued/processing으로 멈춰 보이는 job이
  // 실제로는 리스가 사라졌거나 만료된 stale 상태일 수 있다(함수 강제 종료 등).
  // 조회 시점에 이를 감지해 failed로 정정한 뒤, 정정된 상태로 응답한다.
  if (status === "queued" || status === "processing") {
    await recoverStaleCaseJob(session.user.id, jobId);
    const [refreshed] = await getDb()
      .select({ status: caseJobs.status, caseId: caseJobs.caseId, progressStage: caseJobs.progressStage })
      .from(caseJobs)
      .where(jobQuery);
    if (refreshed) {
      status = refreshed.status;
      caseId = refreshed.caseId;
      progressStage = refreshed.progressStage;
    }
  }

  // SPEC-CASE-PROGRESS-002 REQ-CASE-PROGRESS-002-010 (D6) — completed job은
  // 계측 write 누락(REQ-008 실패 경로 등)이 있어도 저장값과 무관하게 항상
  // TOTAL_STAGES를 반환한다(완료된 job이 영원히 75%로 멈춰 보이는 UX 결함
  // 방지). REQ-CASE-PROGRESS-002-011 — queued/processing은 저장값을 보정
  // 없이 그대로 반환한다.
  if (status === "completed" && caseId) {
    return NextResponse.json({ status: "completed", caseId, progressStage: TOTAL_STAGES });
  }
  if (status === "failed") {
    return NextResponse.json({ status: "failed", error: "분석을 완료하지 못했습니다." });
  }
  return NextResponse.json({ status: "processing", progressStage });
}
