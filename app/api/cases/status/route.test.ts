import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";

const { getCurrentSessionMock, getDbMock, runPipelineMock } = vi.hoisted(() => ({
  getCurrentSessionMock: vi.fn(),
  getDbMock: vi.fn(),
  runPipelineMock: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentSession: getCurrentSessionMock,
}));

vi.mock("@/lib/db/client", () => ({
  getDb: getDbMock,
}));

// M4(readiness 항목 7) 경쟁 테스트가 실제 lib/cases/create-case.ts의
// startCaseJob/processCaseJob/recoverStaleCaseJob을 그대로 호출한다 — 실제
// Gemini 호출로 이어지지 않도록 파이프라인만 mock으로 대체한다.
vi.mock("@/lib/pipeline/index", () => ({
  runPipeline: runPipelineMock,
}));

function statusRequest(jobId?: string) {
  const url = new URL("http://localhost:3000/api/cases/status");
  if (jobId) url.searchParams.set("jobId", jobId);
  return new NextRequest(url);
}

describe("app/api/cases/status GET", () => {
  let client: Client;
  let db: LibSQLDatabase<typeof schema>;
  let dir: string;

  beforeEach(async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), "bosang-radar-job-status-test-"));
    client = createClient({ url: `file:${path.join(dir, "test.db")}` });
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: path.resolve(__dirname, "../../../../db/migrations") });
    getDbMock.mockReturnValue(db);
    getCurrentSessionMock.mockReset();
    runPipelineMock.mockReset();

    const now = new Date();
    await db.insert(schema.user).values([
      {
        id: "owner-1",
        name: "owner-1",
        email: "owner-1@example.test",
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "owner-2",
        name: "owner-2",
        email: "owner-2@example.test",
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await db.insert(schema.cases).values({
      id: "case-1",
      ownerUserId: "owner-1",
      input: {},
      status: "completed",
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.caseJobs).values([
      {
        id: "job-queued",
        ownerUserId: "owner-1",
        leaseId: "lease-queued",
        input: {},
        status: "queued",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "job-processing",
        ownerUserId: "owner-1",
        leaseId: "lease-processing",
        input: {},
        status: "processing",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "job-completed",
        ownerUserId: "owner-1",
        leaseId: "lease-completed",
        input: {},
        status: "completed",
        caseId: "case-1",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "job-failed",
        ownerUserId: "owner-1",
        leaseId: "lease-failed",
        input: {},
        status: "failed",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "job-other-owner",
        ownerUserId: "owner-2",
        leaseId: "lease-other",
        input: {},
        status: "queued",
        createdAt: now,
        updatedAt: now,
      },
    ]);
  });

  afterEach(() => {
    client.close();
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      // Windows 네이티브 sqlite 핸들 정리는 best-effort다.
    }
  });

  it("세션이 없으면 401을 반환한다", async () => {
    getCurrentSessionMock.mockResolvedValue(null);
    const { GET } = await import("./route");

    const response = await GET(statusRequest("job-queued"));

    expect(response.status).toBe(401);
  });

  it("jobId가 없으면 400을 반환한다", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { id: "owner-1" } });
    const { GET } = await import("./route");

    const response = await GET(statusRequest());

    expect(response.status).toBe(400);
  });

  it("다른 사용자의 job은 존재 여부를 숨기고 404를 반환한다", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { id: "owner-1" } });
    const { GET } = await import("./route");

    const response = await GET(statusRequest("job-other-owner"));

    expect(response.status).toBe(404);
  });

  it.each(["job-queued", "job-processing"])("%s 상태는 processing으로 반환한다", async (jobId) => {
    getCurrentSessionMock.mockResolvedValue({ user: { id: "owner-1" } });
    // 여전히 정상 진행 중인 job은 대응하는 리스가 유효해야 한다 — 그래야
    // M1 stale 복구 로직이 no-op으로 넘어가고 processing이 그대로 유지된다.
    await db.insert(schema.reservations).values({
      ownerUserId: "owner-1",
      leaseId: jobId === "job-queued" ? "lease-queued" : "lease-processing",
      expiresAt: new Date(Date.now() + 300_000),
    });
    const { GET } = await import("./route");

    const response = await GET(statusRequest(jobId));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "processing" });
  });

  it("완료 job은 caseId를 반환한다", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { id: "owner-1" } });
    const { GET } = await import("./route");

    const response = await GET(statusRequest("job-completed"));

    await expect(response.json()).resolves.toEqual({ status: "completed", caseId: "case-1" });
  });

  it("실패 job은 내부 오류를 노출하지 않는 일반 메시지를 반환한다", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { id: "owner-1" } });
    const { GET } = await import("./route");

    const response = await GET(statusRequest("job-failed"));

    await expect(response.json()).resolves.toEqual({
      status: "failed",
      error: "분석을 완료하지 못했습니다.",
    });
  });

  it("processing job의 리스가 사라졌으면(stale) 조회 시점에 failed로 정정해 반환한다(M1, readiness 항목 7)", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { id: "owner-1" } });
    // job-processing이 보유한 lease-processing 리스를 제거해 stale 상태를
    // 시뮬레이션한다.
    await db.delete(schema.reservations).where(eq(schema.reservations.ownerUserId, "owner-1"));
    const { GET } = await import("./route");

    const response = await GET(statusRequest("job-processing"));

    await expect(response.json()).resolves.toEqual({
      status: "failed",
      error: "분석을 완료하지 못했습니다.",
    });
  });

  it("processing job의 리스가 만료된 채로 남아있으면(stale) 조회 시점에 failed로 정정하고 그 stale 리스를 정리한 뒤, 즉시 재제출이 성공한다(M4)", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { id: "owner-1" } });
    // job-processing이 보유한 lease-processing 리스를 만료 상태로 남겨둔다
    // (삭제되지 않고 여전히 존재하지만 expiresAt이 과거인 경우).
    await db.insert(schema.reservations).values({
      ownerUserId: "owner-1",
      leaseId: "lease-processing",
      expiresAt: new Date(Date.now() - 1000),
    });
    const { GET } = await import("./route");

    const response = await GET(statusRequest("job-processing"));

    await expect(response.json()).resolves.toEqual({
      status: "failed",
      error: "분석을 완료하지 못했습니다.",
    });

    const staleLeases = await db
      .select()
      .from(schema.reservations)
      .where(eq(schema.reservations.ownerUserId, "owner-1"));
    expect(staleLeases).toHaveLength(0);

    // 즉시 재제출이 새 leaseId로 성공해야 한다(startCaseJob은 이 테스트
    // 스위트에서 mock된 createCase 경로가 아닌 실제 create-case.ts를 쓴다).
    const { startCaseJob } = await import("@/lib/cases/create-case");
    const fresh = await startCaseJob("owner-1", {
      incidentDescription: "2024년 3월, 계단에서 미끄러져 우측 발목을 다쳤습니다.",
      diagnosisName: "우측 발목 인대 파열",
      disabilityBodyPart: "우측 발목",
      incidentDate: "2024-03-15",
    });
    expect(fresh.success).toBe(true);
  });

  it("recoverStaleCaseJob과 지연 도착한 processCaseJob 완료가 같은 stale 리스를 두고 경쟁하면, 정확히 하나의 결과만 남고 case/report는 이중 기록되거나 유실되지 않는다(M4)", async () => {
    const { processCaseJob, recoverStaleCaseJob, startCaseJob } =
      await import("@/lib/cases/create-case");

    const started = await startCaseJob("owner-2", {
      incidentDescription: "2024년 3월, 계단에서 미끄러져 우측 발목을 다쳤습니다.",
      diagnosisName: "우측 발목 인대 파열",
      disabilityBodyPart: "우측 발목",
      incidentDate: "2024-03-15",
    });
    expect(started.success).toBe(true);
    if (!started.success) return;

    let resolvePipeline!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      resolvePipeline = resolve;
    });
    runPipelineMock.mockReturnValueOnce(pending);

    // 지연 도착 완료 시도 — 파이프라인이 아직 진행 중인 동안 정지시킨다.
    const lateCompletion = processCaseJob(started.jobId);
    await vi.waitFor(() => expect(runPipelineMock).toHaveBeenCalled());

    // 그 사이 리스가 만료됐다고 가정하고 stale 복구가 먼저 개입한다 —
    // job을 failed로 전환하고 stale 리스를 정리한다.
    await db
      .update(schema.reservations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.reservations.ownerUserId, "owner-2"));
    await recoverStaleCaseJob("owner-2", started.jobId);

    // 지연 도착한 완료 시도가 뒤늦게 끝난다 — 펜싱되어 no-op이어야 한다.
    resolvePipeline({
      caseSummary: { summary: "요약" },
      reviewTargets: [],
      verifiedClaims: [],
      missingMaterials: [],
      uncertainty: [],
      generatedAt: "2024-03-15T00:00:00.000Z",
    });
    await lateCompletion;

    const [job] = await db
      .select()
      .from(schema.caseJobs)
      .where(eq(schema.caseJobs.id, started.jobId));
    expect(job.status).toBe("failed");

    const cases = await db
      .select()
      .from(schema.cases)
      .where(eq(schema.cases.ownerUserId, "owner-2"));
    expect(cases).toHaveLength(0);

    const reports = await db.select().from(schema.reports);
    expect(reports).toHaveLength(0);
  });
});
