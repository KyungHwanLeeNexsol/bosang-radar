import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const scriptPath = path.join(scriptDir, "db-migrate.ts");
const tmpDir = path.join(projectRoot, ".tmp");

// lib/db/schema.ts의 9개 sqliteTable() 선언과 1:1 대응 — 목록이 바뀌면 이
// 상수도 함께 갱신한다.
const EXPECTED_TABLES = [
  "account",
  "allowed_testers",
  "cases",
  "evidence",
  "feedback",
  "reports",
  "session",
  "user",
  "verification",
].sort();

function runMigrateCli(dbFile: string): string {
  // NODE_ENV=test → loadEnvConfig가 .env.local을 로드 목록에서 제외한다
  // (research.md §0.2 실측) — 여기서 명시한 env가 그대로 검증 대상이 된다.
  return execFileSync(process.execPath, [scriptPath], {
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: "test",
      TURSO_DATABASE_URL: `file:${dbFile}`,
      TURSO_AUTH_TOKEN: "",
    },
    encoding: "utf-8",
  });
}

async function listTableNames(dbFile: string): Promise<string[]> {
  const client = createClient({ url: `file:${dbFile}` });
  try {
    const result = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations'"
    );
    return result.rows.map((row) => String(row.name)).sort();
  } finally {
    client.close();
  }
}

// Windows에서는 libsql 네이티브 바인딩이 close() 반환 후에도 OS 파일 잠금을
// 한 틱 정도 늦게 해제한다(실측) — rmSync가 즉시 EPERM을 낼 수 있어 짧은
// 재시도로 흡수한다.
async function cleanupDbFile(dbFile: string): Promise<void> {
  for (const suffix of ["", "-wal", "-shm"]) {
    const p = dbFile + suffix;
    for (let attempt = 0; attempt < 5; attempt++) {
      if (!existsSync(p)) break;
      try {
        rmSync(p);
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
  }
}

describe("scripts/db-migrate — 실제 CLI 실행 (AC-RUNTIME-001, AC-RUNTIME-002)", () => {
  const dbFile = path.join(tmpDir, `db-migrate-cli-${Date.now()}-${process.pid}.db`);

  afterEach(async () => {
    await cleanupDbFile(dbFile);
  });

  it("[AC-RUNTIME-001] pnpm db:migrate 실행 시 9개 테이블이 모두 생성된다", async () => {
    mkdirSync(tmpDir, { recursive: true });

    runMigrateCli(dbFile);

    const tables = await listTableNames(dbFile);
    expect(tables).toEqual(EXPECTED_TABLES);
  });

  it("[AC-RUNTIME-002] 재실행은 에러 없이 종료하고 테이블 구성이 그대로 유지된다(idempotent)", async () => {
    mkdirSync(tmpDir, { recursive: true });

    runMigrateCli(dbFile);
    const before = await listTableNames(dbFile);

    expect(() => runMigrateCli(dbFile)).not.toThrow();
    const after = await listTableNames(dbFile);

    expect(after).toEqual(before);
    expect(after).toEqual(EXPECTED_TABLES);
  });
});

describe("scripts/db-migrate — in-process 재사용 (design.md §3.3 run-e2e 재사용 대상)", () => {
  const dbFile = path.join(tmpDir, `db-migrate-inprocess-${Date.now()}-${process.pid}.db`);

  afterEach(async () => {
    delete process.env.TURSO_DATABASE_URL;
    delete process.env.TURSO_AUTH_TOKEN;
    await cleanupDbFile(dbFile);
  });

  it("runMigrations()를 직접 호출해도 동일하게 마이그레이션을 적용한다", async () => {
    mkdirSync(tmpDir, { recursive: true });
    process.env.TURSO_DATABASE_URL = `file:${dbFile}`;
    process.env.TURSO_AUTH_TOKEN = "";

    const { runMigrations } = await import("./db-migrate.ts");
    await runMigrations();

    const tables = await listTableNames(dbFile);
    expect(tables).toEqual(EXPECTED_TABLES);
  });
});

describe("scripts/db-migrate — reportCliResult (CLI 결과 처리)", () => {
  it("성공 시 완료 메시지를 로그하고 exitCode를 건드리지 않는다", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const originalExitCode = process.exitCode;

    const { reportCliResult } = await import("./db-migrate.ts");
    await reportCliResult(Promise.resolve());

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("완료"));
    expect(process.exitCode).toBe(originalExitCode);

    logSpy.mockRestore();
  });

  it("실패 시 에러를 로그하고 exitCode를 1로 설정한다", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const originalExitCode = process.exitCode;

    const { reportCliResult } = await import("./db-migrate.ts");
    await reportCliResult(Promise.reject(new Error("boom")));

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("실패"), expect.any(Error));
    expect(process.exitCode).toBe(1);

    process.exitCode = originalExitCode;
    errorSpy.mockRestore();
  });
});
