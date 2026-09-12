import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";

const { getCurrentSessionMock, getDbMock } = vi.hoisted(() => ({
  getCurrentSessionMock: vi.fn(),
  getDbMock: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentSession: getCurrentSessionMock,
}));

vi.mock("@/lib/db/client", () => ({
  getDb: getDbMock,
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
});
