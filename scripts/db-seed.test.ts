import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { afterEach, describe, expect, it } from "vitest";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const migrateScriptPath = path.join(scriptDir, "db-migrate.ts");
const seedScriptPath = path.join(scriptDir, "db-seed.ts");
const tsxCliPath = fileURLToPath(import.meta.resolve("tsx/cli"));
const seedJsonPath = path.join(projectRoot, "db", "seed", "evidence.json");
const tmpDir = path.join(projectRoot, ".tmp");

interface EvidenceSeedRecord {
  id: string;
  category: string;
  title: string;
  content: string;
  sourceUrl: string | null;
}

const SEED_RECORDS: EvidenceSeedRecord[] = JSON.parse(readFileSync(seedJsonPath, "utf-8"));

function runCli(scriptPath: string, dbFile: string): string {
  // NODE_ENV=test → loadEnvConfig가 .env.local을 로드 목록에서 제외한다
  // (db-migrate.test.ts와 동일한 실측 근거).
  return execFileSync(process.execPath, [tsxCliPath, scriptPath], {
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

function runMigrateCli(dbFile: string): string {
  return runCli(migrateScriptPath, dbFile);
}

function runSeedCli(dbFile: string): string {
  return runCli(seedScriptPath, dbFile);
}

interface EvidenceRow {
  id: string;
  category: string;
  title: string;
  content: string;
}

async function listEvidenceRows(dbFile: string): Promise<EvidenceRow[]> {
  const client = createClient({ url: `file:${dbFile}` });
  try {
    const result = await client.execute(
      "SELECT id, category, title, content FROM evidence ORDER BY id"
    );
    return result.rows.map((row) => ({
      id: String(row.id),
      category: String(row.category),
      title: String(row.title),
      content: String(row.content),
    }));
  } finally {
    client.close();
  }
}

// Windows에서는 libsql 네이티브 바인딩이 close() 반환 후에도 OS 파일 잠금을
// 한 틱 정도 늦게 해제한다(db-migrate.test.ts와 동일한 실측) — rmSync가 즉시
// EPERM을 낼 수 있어 짧은 재시도로 흡수한다.
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

describe("scripts/db-seed — 실제 CLI 실행 (AC-RUNTIME-004, AC-RUNTIME-005)", () => {
  const dbFile = path.join(tmpDir, `db-seed-cli-${Date.now()}-${process.pid}.db`);

  afterEach(async () => {
    await cleanupDbFile(dbFile);
  });

  it("[AC-RUNTIME-004] pnpm db:seed 실행 시 evidence.json의 모든 레코드가 적재된다", async () => {
    mkdirSync(tmpDir, { recursive: true });
    runMigrateCli(dbFile);

    runSeedCli(dbFile);

    const rows = await listEvidenceRows(dbFile);
    expect(rows).toHaveLength(SEED_RECORDS.length);

    const expected = [...SEED_RECORDS]
      .map(({ id, category, title, content }) => ({ id, category, title, content }))
      .sort((a, b) => a.id.localeCompare(b.id));
    expect(rows).toEqual(expected);
  });

  it("[AC-RUNTIME-005] 재실행은 에러 없이 종료하고 evidence 행 수가 1차 실행 직후와 정확히 동일하다(idempotent)", async () => {
    mkdirSync(tmpDir, { recursive: true });
    runMigrateCli(dbFile);

    runSeedCli(dbFile);
    const before = await listEvidenceRows(dbFile);

    expect(() => runSeedCli(dbFile)).not.toThrow();
    const after = await listEvidenceRows(dbFile);

    expect(after).toHaveLength(before.length);
    expect(after).toEqual(before);
  });
});

describe("scripts/db-seed — in-process 재사용 (design.md §3.3 run-e2e 재사용 대상)", () => {
  const dbFile = path.join(tmpDir, `db-seed-inprocess-${Date.now()}-${process.pid}.db`);

  afterEach(async () => {
    delete process.env.TURSO_DATABASE_URL;
    delete process.env.TURSO_AUTH_TOKEN;
    await cleanupDbFile(dbFile);
  });

  it("runSeed()를 직접 호출해도 동일하게 시드를 적재하고, 재호출해도 행 수가 불변이다", async () => {
    mkdirSync(tmpDir, { recursive: true });
    process.env.TURSO_DATABASE_URL = `file:${dbFile}`;
    process.env.TURSO_AUTH_TOKEN = "";

    const { runMigrations } = await import("./db-migrate.ts");
    await runMigrations();

    const { runSeed } = await import("./db-seed.ts");
    await runSeed();

    const rows = await listEvidenceRows(dbFile);
    expect(rows).toHaveLength(SEED_RECORDS.length);

    await runSeed();
    const afterRerun = await listEvidenceRows(dbFile);
    expect(afterRerun).toHaveLength(SEED_RECORDS.length);
  });
});

describe("scripts/db-seed — reportCliResult (CLI 결과 처리)", () => {
  it("성공 시 완료 메시지를 로그하고 exitCode를 건드리지 않는다", async () => {
    const { reportCliResult } = await import("./db-seed.ts");
    const logs: unknown[][] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args);
    };
    const originalExitCode = process.exitCode;

    try {
      await reportCliResult(Promise.resolve());
      expect(logs.some((entry) => String(entry[0]).includes("완료"))).toBe(true);
      expect(process.exitCode).toBe(originalExitCode);
    } finally {
      console.log = originalLog;
    }
  });

  it("실패 시 에러를 로그하고 exitCode를 1로 설정한다", async () => {
    const { reportCliResult } = await import("./db-seed.ts");
    const errors: unknown[][] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };
    const originalExitCode = process.exitCode;

    try {
      await reportCliResult(Promise.reject(new Error("boom")));
      expect(errors.some((entry) => String(entry[0]).includes("실패"))).toBe(true);
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = originalExitCode;
      console.error = originalError;
    }
  });
});
