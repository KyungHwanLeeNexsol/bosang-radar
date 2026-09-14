import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";
import { recoverStaleCaseJob } from "@/lib/cases/create-case";
import { getDb } from "@/lib/db/client";
import { caseJobs } from "@/lib/db/schema";

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
    .select({ status: caseJobs.status, caseId: caseJobs.caseId })
    .from(caseJobs)
    .where(jobQuery);

  if (!job) {
    return NextResponse.json({ error: "분석 작업을 찾을 수 없습니다." }, { status: 404 });
  }

  let status = job.status;
  let caseId = job.caseId;

  // M1(readiness 항목 7 재정정) — queued/processing으로 멈춰 보이는 job이
  // 실제로는 리스가 사라졌거나 만료된 stale 상태일 수 있다(함수 강제 종료 등).
  // 조회 시점에 이를 감지해 failed로 정정한 뒤, 정정된 상태로 응답한다.
  if (status === "queued" || status === "processing") {
    await recoverStaleCaseJob(session.user.id, jobId);
    const [refreshed] = await getDb()
      .select({ status: caseJobs.status, caseId: caseJobs.caseId })
      .from(caseJobs)
      .where(jobQuery);
    if (refreshed) {
      status = refreshed.status;
      caseId = refreshed.caseId;
    }
  }

  if (status === "completed" && caseId) {
    return NextResponse.json({ status: "completed", caseId });
  }
  if (status === "failed") {
    return NextResponse.json({ status: "failed", error: "분석을 완료하지 못했습니다." });
  }
  return NextResponse.json({ status: "processing" });
}
