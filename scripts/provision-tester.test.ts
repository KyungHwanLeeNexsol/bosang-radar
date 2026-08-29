import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { afterEach, describe, expect, it } from "vitest";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const migrateScriptPath = path.join(scriptDir, "db-migrate.ts");
const provisionScriptPath = path.join(scriptDir, "provision-tester.ts");
const tmpDir = path.join(projectRoot, ".tmp");

const BETTER_AUTH_SECRET = "test-secret-not-a-real-secret-value";

function baseEnv(dbFile: string): Record<string, string | undefined> {
  // NODE_ENV=test → loadEnvConfig가 .env.local을 로드 목록에서 제외한다
  // (db-migrate.test.ts / db-seed.test.ts와 동일한 실측 근거).
  return {
    ...process.env,
    NODE_ENV: "test",
    TURSO_DATABASE_URL: `file:${dbFile}`,
    TURSO_AUTH_TOKEN: "",
    BETTER_AUTH_SECRET,
  };
}

function runMigrateCli(dbFile: string): void {
  execFileSync(process.execPath, [migrateScriptPath], {
    cwd: projectRoot,
    env: baseEnv(dbFile) as NodeJS.ProcessEnv,
    encoding: "utf-8",
  });
}

function runProvisionCli(
  dbFile: string,
  args: string[],
  extraEnv: Record<string, string | undefined> = {}
): string {
  return execFileSync(process.execPath, [provisionScriptPath, ...args], {
    cwd: projectRoot,
    env: { ...baseEnv(dbFile), ...extraEnv } as NodeJS.ProcessEnv,
    encoding: "utf-8",
  });
}

interface CountRow {
  n: number;
}

async function countRows(dbFile: string, table: string, whereEmail?: string): Promise<number> {
  const client = createClient({ url: `file:${dbFile}` });
  try {
    const sql = whereEmail
      ? `SELECT COUNT(*) as n FROM ${table} WHERE email = ?`
      : `SELECT COUNT(*) as n FROM ${table}`;
    const result = await client.execute({ sql, args: whereEmail ? [whereEmail] : [] });
    return Number((result.rows[0] as unknown as CountRow).n);
  } finally {
    client.close();
  }
}

async function countAccountRowsForEmail(dbFile: string, email: string): Promise<number> {
  const client = createClient({ url: `file:${dbFile}` });
  try {
    const result = await client.execute({
      sql: "SELECT COUNT(*) as n FROM account a JOIN user u ON a.user_id = u.id WHERE u.email = ?",
      args: [email],
    });
    return Number((result.rows[0] as unknown as CountRow).n);
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

describe("scripts/provision-tester — 실제 CLI 실행 (AC-RUNTIME-006, AC-RUNTIME-009)", () => {
  const dbFile = path.join(tmpDir, `provision-cli-${Date.now()}-${process.pid}.db`);
  const email = "tester-cli@example.com";

  afterEach(async () => {
    await cleanupDbFile(dbFile);
  });

  it("[AC-RUNTIME-006] 첫 실행 후 allowed_testers에 이메일 행이 정확히 1건 존재한다", async () => {
    mkdirSync(tmpDir, { recursive: true });
    runMigrateCli(dbFile);

    runProvisionCli(dbFile, ["--email", email], { TESTER_PASSWORD: "TestPass123" });

    expect(await countRows(dbFile, "allowed_testers", email)).toBe(1);
    expect(await countRows(dbFile, "user", email)).toBe(1);
    expect(await countAccountRowsForEmail(dbFile, email)).toBe(1);
  });

  it("[AC-RUNTIME-006/009] 동일 이메일로 재실행해도 각 테이블 행 수가 여전히 1건이다(중복 생성 0건)", async () => {
    mkdirSync(tmpDir, { recursive: true });
    runMigrateCli(dbFile);

    runProvisionCli(dbFile, ["--email", email], { TESTER_PASSWORD: "TestPass123" });
    runProvisionCli(dbFile, ["--email", email], { TESTER_PASSWORD: "TestPass123" });

    expect(await countRows(dbFile, "allowed_testers", email)).toBe(1);
    expect(await countRows(dbFile, "user", email)).toBe(1);
    expect(await countAccountRowsForEmail(dbFile, email)).toBe(1);
  });

  it("[AC-RUNTIME-008] --email 없이 실행하면 사용법 오류로 실패한다(--password CLI 인자 경로는 존재하지 않는다)", () => {
    mkdirSync(tmpDir, { recursive: true });
    runMigrateCli(dbFile);

    expect(() => runProvisionCli(dbFile, [], { TESTER_PASSWORD: "TestPass123" })).toThrow();
  });
});

describe("scripts/provision-tester — in-process 재사용 (design.md §3.3 run-e2e 재사용 대상)", () => {
  const dbFile = path.join(tmpDir, `provision-inprocess-${Date.now()}-${process.pid}.db`);
  const email = "tester-inprocess@example.com";

  afterEach(async () => {
    delete process.env.TURSO_DATABASE_URL;
    delete process.env.TURSO_AUTH_TOKEN;
    delete process.env.BETTER_AUTH_SECRET;
    await cleanupDbFile(dbFile);
  });

  it("provisionTester()를 직접 호출해도 계정이 생성되고, 재호출해도 행 수가 불변이다", async () => {
    mkdirSync(tmpDir, { recursive: true });
    process.env.TURSO_DATABASE_URL = `file:${dbFile}`;
    process.env.TURSO_AUTH_TOKEN = "";
    process.env.BETTER_AUTH_SECRET = BETTER_AUTH_SECRET;

    const { runMigrations } = await import("./db-migrate.ts");
    await runMigrations();

    const { provisionTester } = await import("./provision-tester.ts");
    await provisionTester({ email, password: "TestPass123" });

    expect(await countRows(dbFile, "allowed_testers", email)).toBe(1);
    expect(await countRows(dbFile, "user", email)).toBe(1);
    expect(await countAccountRowsForEmail(dbFile, email)).toBe(1);

    await provisionTester({ email, password: "TestPass123" });

    expect(await countRows(dbFile, "allowed_testers", email)).toBe(1);
    expect(await countRows(dbFile, "user", email)).toBe(1);
    expect(await countAccountRowsForEmail(dbFile, email)).toBe(1);
  });
});

describe("scripts/provision-tester — runCli() in-process (TESTER_PASSWORD 비대화형 경로)", () => {
  const dbFile = path.join(tmpDir, `provision-runcli-${Date.now()}-${process.pid}.db`);
  const email = "tester-runcli@example.com";

  afterEach(async () => {
    delete process.env.TURSO_DATABASE_URL;
    delete process.env.TURSO_AUTH_TOKEN;
    delete process.env.BETTER_AUTH_SECRET;
    delete process.env.TESTER_PASSWORD;
    await cleanupDbFile(dbFile);
  });

  it("--email 인자 + TESTER_PASSWORD 환경변수만으로 프롬프트 없이 계정을 생성한다", async () => {
    mkdirSync(tmpDir, { recursive: true });
    process.env.TURSO_DATABASE_URL = `file:${dbFile}`;
    process.env.TURSO_AUTH_TOKEN = "";
    process.env.BETTER_AUTH_SECRET = BETTER_AUTH_SECRET;
    process.env.TESTER_PASSWORD = "TestPass123";

    const { runMigrations } = await import("./db-migrate.ts");
    await runMigrations();

    const { runCli } = await import("./provision-tester.ts");
    await runCli(["--email", email]);

    expect(await countRows(dbFile, "allowed_testers", email)).toBe(1);
    expect(await countRows(dbFile, "user", email)).toBe(1);
    expect(await countAccountRowsForEmail(dbFile, email)).toBe(1);
  });

  it("TESTER_PASSWORD가 없고 비-TTY 환경(vitest 프로세스)이면 대화형 프롬프트 없이 즉시 실패한다", async () => {
    // vitest 테스트 프로세스의 stdin은 실제 TTY가 아니므로, 대화형 프롬프트 진입 시
    // 무한 대기하지 않고 즉시 명시적 에러로 거부되어야 한다(TTY 없이 CI가 멈추는
    // 사고를 방지). 이 경로는 실제 TTY 상호작용을 요구하지 않으므로 단위 테스트로
    // 직접 검증 가능하다.
    const { runCli } = await import("./provision-tester.ts");
    await expect(runCli(["--email", "no-password@example.com"])).rejects.toThrow(/TESTER_PASSWORD/);
  });
});

describe("scripts/provision-tester — parseEmailArg", () => {
  it("--email 다음 값을 반환한다", async () => {
    const { parseEmailArg } = await import("./provision-tester.ts");
    expect(parseEmailArg(["--email", "a@example.com"])).toBe("a@example.com");
  });

  it("--email이 없으면 에러를 던진다", async () => {
    const { parseEmailArg } = await import("./provision-tester.ts");
    expect(() => parseEmailArg([])).toThrow();
  });

  it("--email 뒤에 값이 없으면 에러를 던진다", async () => {
    const { parseEmailArg } = await import("./provision-tester.ts");
    expect(() => parseEmailArg(["--email"])).toThrow();
  });
});

describe("scripts/provision-tester — resolvePasswordFromEnv (REQ-RUNTIME-008 비대화형 경로)", () => {
  it("TESTER_PASSWORD가 있으면 그 값을 반환한다", async () => {
    const { resolvePasswordFromEnv } = await import("./provision-tester.ts");
    expect(resolvePasswordFromEnv({ TESTER_PASSWORD: "TestPass123" })).toBe("TestPass123");
  });

  it("TESTER_PASSWORD가 없으면 undefined를 반환한다", async () => {
    const { resolvePasswordFromEnv } = await import("./provision-tester.ts");
    expect(resolvePasswordFromEnv({})).toBeUndefined();
  });
});

describe("scripts/provision-tester — AC-RUNTIME-017 비노출 정적 확인 (모듈 표면)", () => {
  it("프로비저닝 전용 betterAuth 인스턴스 생성 함수를 export하지 않는다", async () => {
    const mod = await import("./provision-tester.ts");
    expect(Object.keys(mod)).not.toContain("createProvisioningAuth");
    expect(Object.keys(mod)).not.toContain("provisioningAuth");
  });
});

describe("db/migrations — AC-RUNTIME-017 (3) 스키마 드리프트 보정 마이그레이션 예외 (개정 v0.5.1)", () => {
  const migrationsDir = path.join(projectRoot, "db", "migrations");
  const BASELINE_MIGRATION = "0000_broad_big_bertha.sql";
  // SPEC-RUNTIME-001 보정 마이그레이션 (account.issuer 컬럼 추가).
  const ACCOUNT_ISSUER_MIGRATION = "0001_bitter_talon.sql";
  // SPEC-RESEARCH-001 M1 (REQ-RESEARCH-XXX)에서 추가된 evidence 스키마 확장 마이그레이션
  // (evidence_type/scope 컬럼 추가). account.issuer 보정 마이그레이션과는 별개의,
  // 정상적인 신규 스키마 변경 마이그레이션이다.
  const EVIDENCE_SCHEMA_MIGRATION = "0002_outstanding_khan.sql";
  // SPEC-EVIDENCE-001 M1(design.md §1.1, REQ-EVIDENCE-006)에서 추가된
  // evidence.issueTypes 컬럼 마이그레이션. 위 두 마이그레이션과 마찬가지로
  // 정상적인 신규 스키마 변경 마이그레이션이다(sourceIdentifier/sourceDate는
  // 이 마이그레이션에 포함하지 않는다 — design.md §1.2).
  const EVIDENCE_ISSUE_TYPES_MIGRATION = "0003_sad_hitman.sql";

  it("db/migrations/에 존재하는 .sql 파일은 baseline 1개 + account.issuer 보정 마이그레이션 1개 + evidence 스키마 확장 마이그레이션 1개 + evidence.issueTypes 마이그레이션 1개, 총 4개뿐이다", () => {
    const sqlFiles = readdirSync(migrationsDir)
      .filter((name) => name.endsWith(".sql"))
      .sort();

    expect(sqlFiles).toContain(BASELINE_MIGRATION);
    expect(sqlFiles).toContain(ACCOUNT_ISSUER_MIGRATION);
    expect(sqlFiles).toContain(EVIDENCE_SCHEMA_MIGRATION);
    expect(sqlFiles).toContain(EVIDENCE_ISSUE_TYPES_MIGRATION);
    expect(sqlFiles).toHaveLength(4);
  });

  it("account.issuer 보정 마이그레이션의 내용은 account.issuer 컬럼 추가뿐이다(다른 스키마 변경 없음)", () => {
    const content = readFileSync(path.join(migrationsDir, ACCOUNT_ISSUER_MIGRATION), "utf-8");
    const statements = content
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatch(
      /^ALTER TABLE\s+`account`\s+ADD\s+`issuer`\s+text\s+NOT NULL;?$/i
    );
    // CREATE/DROP TABLE 등 다른 DDL이 섞여 있지 않음을 재확인한다.
    expect(content).not.toMatch(/CREATE TABLE|DROP TABLE|CREATE INDEX|DROP INDEX/i);
  });

  it("evidence 스키마 확장 마이그레이션의 내용은 evidence_type/scope 컬럼 추가뿐이다(다른 스키마 변경 없음)", () => {
    const content = readFileSync(path.join(migrationsDir, EVIDENCE_SCHEMA_MIGRATION), "utf-8");
    const statements = content
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    expect(statements).toHaveLength(2);
    expect(statements[0]).toMatch(
      /^ALTER TABLE\s+`evidence`\s+ADD\s+`evidence_type`\s+text\s+DEFAULT\s+'OTHER'\s+NOT NULL;?$/i
    );
    expect(statements[1]).toMatch(
      /^ALTER TABLE\s+`evidence`\s+ADD\s+`scope`\s+text\s+DEFAULT\s+'DOMAIN_SPECIFIC'\s+NOT NULL;?$/i
    );
    // CREATE/DROP TABLE 등 다른 DDL이 섞여 있지 않음을 재확인한다.
    expect(content).not.toMatch(/CREATE TABLE|DROP TABLE|CREATE INDEX|DROP INDEX/i);
  });

  it("evidence.issueTypes 마이그레이션의 내용은 issue_types 컬럼 추가뿐이다(sourceIdentifier/sourceDate 미포함, 다른 스키마 변경 없음)", () => {
    const content = readFileSync(path.join(migrationsDir, EVIDENCE_ISSUE_TYPES_MIGRATION), "utf-8");
    const statements = content
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatch(
      /^ALTER TABLE\s+`evidence`\s+ADD\s+`issue_types`\s+text\s+DEFAULT\s+'\[\]'\s+NOT NULL;?$/i
    );
    // sourceIdentifier/sourceDate는 이 마이그레이션에 포함되지 않는다(design.md §1.2).
    expect(content).not.toMatch(/source_identifier|source_date/i);
    // CREATE/DROP TABLE 등 다른 DDL이 섞여 있지 않음을 재확인한다.
    expect(content).not.toMatch(/CREATE TABLE|DROP TABLE|CREATE INDEX|DROP INDEX/i);
  });
});

describe("scripts/provision-tester — reportCliResult (CLI 결과 처리)", () => {
  it("성공 시 완료 메시지를 로그하고 exitCode를 건드리지 않는다", async () => {
    const { reportCliResult } = await import("./provision-tester.ts");
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
    const { reportCliResult } = await import("./provision-tester.ts");
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
