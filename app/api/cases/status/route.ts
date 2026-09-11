import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";
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

  const [job] = await getDb()
    .select({ status: caseJobs.status, caseId: caseJobs.caseId })
    .from(caseJobs)
    .where(and(eq(caseJobs.id, jobId), eq(caseJobs.ownerUserId, session.user.id)));

  if (!job) {
    return NextResponse.json({ error: "분석 작업을 찾을 수 없습니다." }, { status: 404 });
  }

  if (job.status === "completed" && job.caseId) {
    return NextResponse.json({ status: "completed", caseId: job.caseId });
  }
  if (job.status === "failed") {
    return NextResponse.json({ status: "failed", error: "분석을 완료하지 못했습니다." });
  }
  return NextResponse.json({ status: "processing" });
}
