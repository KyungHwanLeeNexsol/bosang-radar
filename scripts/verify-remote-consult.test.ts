import { spawnSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type Client, type InStatement } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { NextRequest } from "next/server";
import { afterAll, describe, expect, it } from "vitest";
import * as schema from "../lib/db/schema.ts";
import { handleConsultationSubmit } from "../app/api/consultations/route.ts";
import {
  computeIpHmac,
  createCaseContext,
  performRouteCall,
  runSequentialCase,
  runTriggerCase,
  runTwoProcessCase,
  VT_CALL_TIME,
  waitForWindowRoom,
  windowStartOf,
  withSimulatedLatency,
  type Db,
  type SubmitFn,
  type WorkerHandle,
  type WorkerJob,
  type WorkerResult,
} from "./verify-remote-consult-cases.ts";
import {
  evaluateGuard,
  fingerprintOf,
  isValidRunId,
  maskHost,
  redactText,
} from "./verify-remote-consult-guard.ts";
import {
  LedgerWriter,
  computeLedgerChecksum,
  type Ledger,
} from "./verify-remote-consult-ledger.ts";
import { main, type HarnessDeps } from "./verify-remote-consult.ts";

// SPEC-B2C-CONSULT-001 Group 3a — 원격 검증 하네스의 로컬 테스트. 이 파일의 모든 실행은
// `.tmp/` 아래 임시 file: DB만 쓴다. 원격 URL은 클라이언트 팩토리 스파이에만 물려
// "클라이언트가 만들어지지 않는다"는 것을 확인하는 데 쓰며 네트워크에 나가지 않는다.

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const tmpDir = path.join(projectRoot, ".tmp");
const migrationsFolder = path.join(projectRoot, "db", "migrations");
const stateRoot = path.join(tmpDir, `vt-state-${process.pid}-${Date.now()}`);
const CONSENT_VERSION = "2026-09-25-v1";
const REMOTE_URL = "libsql://vt-test-guard-org.invalid";
const REMOTE_FP = fingerprintOf(REMOTE_URL);
const REMOTE_TOKEN = "vt-secret-token-value";
// 실제 드라이버 오류는 URL을 메시지에 그대로 싣는 경우가 있다 — 하네스가 그 텍스트를 가리는지 본다.
const STUB_ERROR_MESSAGE = `stub: 연결 실패 ${REMOTE_URL} (token ${REMOTE_TOKEN})`;

const openClients: Client[] = [];
const createdFiles: string[] = [];
let dbCounter = 0;

async function makeMigratedDb(): Promise<{ url: string; file: string; client: Client }> {
  mkdirSync(tmpDir, { recursive: true });
  const file = path.join(tmpDir, `harness-test-${process.pid}-${Date.now()}-${dbCounter++}.db`);
  const url = `file:${file}`;
  const client = createClient({ url });
  await migrate(drizzle(client), { migrationsFolder });
  openClients.push(client);
  createdFiles.push(file);
  return { url, file, client };
}

async function removeWithRetry(target: string): Promise<void> {
  for (const suffix of ["", "-wal", "-shm"]) {
    const p = target + suffix;
    for (let attempt = 0; attempt < 5; attempt++) {
      if (!existsSync(p)) break;
      try {
        rmSync(p, { recursive: true, force: true });
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
  }
}

afterAll(async () => {
  for (const client of openClients) client.close();
  for (const file of createdFiles) await removeWithRetry(file);
  await removeWithRetry(stateRoot);
});

function makeDeps(
  env: Record<string, string | undefined>,
  overrides: Partial<HarnessDeps> = {}
): { deps: Partial<HarnessDeps>; logs: string[] } {
  const logs: string[] = [];
  const deps: Partial<HarnessDeps> = {
    env,
    stateRoot,
    log: (line) => logs.push(line),
    errorLog: (line) => logs.push(line),
    ...overrides,
  };
  return { deps, logs };
}

async function count(client: Client, sql: string, args: (string | number)[] = []) {
  const result = await client.execute({ sql, args });
  return Number(result.rows[0].c);
}

async function seedDecoyConsultation(client: Client, id = "decoy-1"): Promise<void> {
  await client.execute({
    sql: `INSERT INTO consultations (id, result_id, channel, name, contact_normalized, preferred_call_time,
      consent_pii_collection, consent_health_info_use, consent_marketing, consent_version,
      request_fingerprint, application_status, idempotency_key, created_at, updated_at)
      VALUES (?, 'decoy-result', 'kakao', '진짜고객', '01011112222', NULL, 1, 1, 0, ?, 'fp', 'received', ?, 1790000000, 1790000000)`,
    args: [id, CONSENT_VERSION, `${id}-key`],
  });
}

async function seedDecoyRateLimit(client: Client, ipHmac = "decoy-hmac"): Promise<void> {
  await client.execute({
    sql: "INSERT INTO consultation_rate_limits (window_start, ip_hmac, request_count) VALUES (1790000000, ?, 1)",
    args: [ipHmac],
  });
}

interface SpyClient {
  factory: HarnessDeps["createClient"];
  calls: unknown[];
  executed: string[];
}

function makeSpyFactory(): SpyClient {
  const calls: unknown[] = [];
  const executed: string[] = [];
  const record = (stmt: InStatement): void => {
    executed.push(typeof stmt === "string" ? stmt : stmt.sql);
  };
  const factory: HarnessDeps["createClient"] = (config) => {
    calls.push(config);
    const stub = {
      execute: async (stmt: InStatement) => {
        record(stmt);
        throw new Error(STUB_ERROR_MESSAGE);
      },
      batch: async (stmts: InStatement[]) => {
        stmts.forEach(record);
        throw new Error(STUB_ERROR_MESSAGE);
      },
      transaction: async () => {
        executed.push("TRANSACTION");
        throw new Error(STUB_ERROR_MESSAGE);
      },
      close: () => {},
    };
    return stub as unknown as Client;
  };
  return { factory, calls, executed };
}

describe("안전 가드 — 원격 URL은 지문과 쓰기 허용 플래그 없이는 클라이언트도 만들지 않는다", () => {
  const remoteEnv = { TURSO_DATABASE_URL: REMOTE_URL, TURSO_AUTH_TOKEN: REMOTE_TOKEN };

  it.each([
    ["지문 없음 + 쓰기 허용", ["run", "--run-id", "abcd1234", "--allow-write-remote"]],
    [
      "틀린 지문 + 쓰기 허용",
      ["run", "--run-id", "abcd1234", "--allow-write-remote", "--expect-fingerprint", "00000000"],
    ],
    [
      "맞는 지문 + 쓰기 허용 없음(run)",
      ["run", "--run-id", "abcd1234", "--expect-fingerprint", REMOTE_FP],
    ],
    [
      "맞는 지문 + 쓰기 허용 없음(cleanup)",
      ["cleanup", "--run-id", "abcd1234", "--expect-fingerprint", REMOTE_FP],
    ],
    [
      "맞는 지문 + 쓰기 허용 없음(revert-schema)",
      ["revert-schema", "--confirm-revert-schema", "--expect-fingerprint", REMOTE_FP],
    ],
    ["preflight도 지문이 없으면 거부", ["preflight"]],
    ["preflight도 틀린 지문이면 거부", ["preflight", "--expect-fingerprint", "ffffffff"]],
  ])("%s → 종료 코드 2, 클라이언트 미생성", async (_label, argv) => {
    const spy = makeSpyFactory();
    const { deps, logs } = makeDeps(remoteEnv, { createClient: spy.factory });

    const exitCode = await main(argv, deps);

    expect(exitCode).toBe(2);
    expect(spy.calls).toHaveLength(0);
    const output = logs.join("\n");
    // 호스트와 토큰은 어떤 출력에도 나오지 않는다.
    expect(output).not.toContain("test-guard");
    expect(output).not.toContain("vt-secret-token-value");
  });

  it("맞는 지문이면 preflight는 가드를 통과해 클라이언트를 만들고, 쓰기 문장은 실행하지 않는다", async () => {
    const spy = makeSpyFactory();
    const { deps, logs } = makeDeps(remoteEnv, { createClient: spy.factory });

    const exitCode = await main(["preflight", "--expect-fingerprint", REMOTE_FP], deps);

    expect(exitCode).toBe(1); // 스텁이 연결 실패를 흉내낸다
    expect(spy.calls).toHaveLength(1);
    expect(spy.executed.every((sql) => /^\s*(SELECT|PRAGMA)/i.test(sql))).toBe(true);
    expect(logs.join("\n")).not.toContain("test-guard");
  });

  it("지문 + 쓰기 허용이 모두 맞아도 run은 스텁에서 쓰기를 한 번도 시도하지 못한다", async () => {
    const spy = makeSpyFactory();
    const { deps, logs } = makeDeps(remoteEnv, { createClient: spy.factory });

    const exitCode = await main(
      ["run", "--run-id", "abcd1234", "--allow-write-remote", "--expect-fingerprint", REMOTE_FP],
      deps
    );

    expect(exitCode).not.toBe(0);
    expect(spy.calls).toHaveLength(1);
    expect(spy.executed.some((sql) => /^\s*(INSERT|CREATE|DELETE|DROP|UPDATE)/i.test(sql))).toBe(
      false
    );
    expect(logs.join("\n")).not.toContain("vt-secret-token-value");
  });

  it("--help는 명령과 종료 코드를 설명하고 0으로 끝난다, 모르는 명령은 2", async () => {
    const help = makeDeps({});
    expect(await main(["--help"], help.deps)).toBe(0);
    const text = help.logs.join("\n");
    for (const word of ["preflight", "run", "cleanup", "revert-schema", "--expect-fingerprint"]) {
      expect(text).toContain(word);
    }

    const unknown = makeDeps({});
    expect(await main(["explode"], unknown.deps)).toBe(2);
    expect(await main(["run", "--no-such-flag"], unknown.deps)).toBe(2);
  });

  it("file: URL은 지문·쓰기 허용 플래그 없이 통과한다", async () => {
    const db = await makeMigratedDb();
    const { deps } = makeDeps({ TURSO_DATABASE_URL: db.url, TURSO_AUTH_TOKEN: "" });

    expect(await main(["preflight"], deps)).toBe(0);
  });

  it("evaluateGuard는 file: 은 로컬로, http(s)/libsql/wss는 원격으로 분류한다", () => {
    const local = evaluateGuard(
      { TURSO_DATABASE_URL: "file:./.tmp/x.db" },
      { allowWriteRemote: false },
      { writes: true }
    );
    expect(local.ok).toBe(true);
    if (local.ok) expect(local.target.isRemote).toBe(false);

    for (const url of ["libsql://a.b.invalid", "https://a.b.invalid", "wss://a.b.invalid"]) {
      const result = evaluateGuard(
        { TURSO_DATABASE_URL: url },
        { allowWriteRemote: true },
        { writes: true }
      );
      expect(result.ok).toBe(false);
    }
    const missing = evaluateGuard({}, { allowWriteRemote: false }, { writes: false });
    expect(missing.ok).toBe(false);
  });
});

describe("baseline 중단 — 두 상담 테이블이 모두 비어 있지 않으면 run은 아무것도 쓰지 않는다", () => {
  it.each([
    ["consultations", seedDecoyConsultation],
    ["consultation_rate_limits", seedDecoyRateLimit],
  ] as const)("%s에 행이 있으면 종료 코드 2, 원장·트리거·행 변화 없음", async (_table, seed) => {
    const db = await makeMigratedDb();
    await seed(db.client);
    const { deps } = makeDeps({ TURSO_DATABASE_URL: db.url, TURSO_AUTH_TOKEN: "" });
    const runId = `base${dbCounter}x`;

    const exitCode = await main(["run", "--run-id", runId, "--window-room-ms", "0"], deps);

    expect(exitCode).toBe(2);
    expect(existsSync(path.join(stateRoot, runId))).toBe(false);
    const triggers = await count(
      db.client,
      "SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'trigger'"
    );
    expect(triggers).toBe(0);
    expect(await count(db.client, "SELECT COUNT(*) AS c FROM consultations")).toBe(
      _table === "consultations" ? 1 : 0
    );
    expect(await count(db.client, "SELECT COUNT(*) AS c FROM consultation_rate_limits")).toBe(
      _table === "consultation_rate_limits" ? 1 : 0
    );
  });

  it("이전 실행이 남긴 트리거가 있으면 종료 코드 2, 원장이 만들어지지 않고 트리거는 그대로다", async () => {
    const db = await makeMigratedDb();
    await db.client.execute(
      "CREATE TRIGGER vt_left0001_block_delete BEFORE DELETE ON consultation_rate_limits BEGIN SELECT RAISE(ABORT, 'x'); END"
    );
    const { deps } = makeDeps({ TURSO_DATABASE_URL: db.url, TURSO_AUTH_TOKEN: "" });

    expect(await main(["run", "--run-id", "trigleft1", "--window-room-ms", "0"], deps)).toBe(2);
    expect(existsSync(path.join(stateRoot, "trigleft1"))).toBe(false);
    expect(
      await count(db.client, "SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'trigger'")
    ).toBe(1);
  });

  it("이미 쓴 run-id를 다시 쓰면 종료 코드 2, 기존 원장은 그대로다", async () => {
    const db = await makeMigratedDb();
    const runDir = path.join(stateRoot, "reuse0001");
    mkdirSync(runDir, { recursive: true });
    writeFileSync(path.join(runDir, "ledger.json"), "{}");
    const { deps } = makeDeps({ TURSO_DATABASE_URL: db.url, TURSO_AUTH_TOKEN: "" });

    expect(await main(["run", "--run-id", "reuse0001", "--window-room-ms", "0"], deps)).toBe(2);
    expect(readFileSync(path.join(runDir, "ledger.json"), "utf8")).toBe("{}");
  });

  it("테이블이 없으면(마이그레이션 전) 종료 코드 2", async () => {
    mkdirSync(tmpDir, { recursive: true });
    const file = path.join(tmpDir, `harness-test-empty-${process.pid}-${Date.now()}.db`);
    createdFiles.push(file);
    const { deps } = makeDeps({ TURSO_DATABASE_URL: `file:${file}`, TURSO_AUTH_TOKEN: "" });

    expect(await main(["run", "--run-id", "empty001", "--window-room-ms", "0"], deps)).toBe(2);
    expect(existsSync(path.join(stateRoot, "empty001"))).toBe(false);
  });
});

describe("전체 로컬 수명주기 — 마이그레이션 → preflight → run → 이물 행 → cleanup", () => {
  it(
    "run이 관측을 정직하게 기록하고, cleanup은 원장 행만 정확히 지운다",
    { timeout: 240_000 },
    async () => {
      const db = await makeMigratedDb();
      const { deps, logs } = makeDeps({ TURSO_DATABASE_URL: db.url, TURSO_AUTH_TOKEN: "" });
      const runId = "life0001";
      const runDir = path.join(stateRoot, runId);
      const name = `가상테스트-${runId}`;

      // 1) preflight
      expect(await main(["preflight"], deps)).toBe(0);
      expect(logs.join("\n")).toContain("consultations");

      // 2) run — 로컬 SQLite는 병렬 부하에서 SQLITE_BUSY 5xx를 낼 수 있으므로(route.test.ts 관측)
      // T5/T6 통과를 단정하지 않는다. 하네스가 본 것을 그대로 기록하고 종료 코드가 그에 맞는지만 본다.
      // T7은 다르다 — 서로 다른 프로세스가 같은 키를 동시에 제출해도 DB가 하나로 정리해야 하는
      // 게이트이고, 워커에 원격 왕복 지연(문장당 50ms)을 모사해 경쟁 구간을 열어 둔 채 실행한다.
      // 로컬 SQLite는 문장이 마이크로초에 끝나 지연 없이는 먼저 온 프로세스가 끝낸 뒤에야 다른 쪽이
      // 조회해 결함이 드러나지 않는다(수정 전 코드로 관측).
      const runExit = await main(
        ["run", "--run-id", runId, "--window-room-ms", "0", "--simulate-latency-ms", "50"],
        deps
      );

      const results = JSON.parse(readFileSync(path.join(runDir, "results.json"), "utf8")) as {
        runId: string;
        gateFailed: boolean;
        cases: {
          id: string;
          gate: boolean;
          status: string;
          checks: { name: string; expected: unknown; observed: unknown; pass: boolean }[];
          requests: unknown[];
          error?: string;
          rowCounts: { consultations: number; consultation_rate_limits: number };
        }[];
      };
      expect(results.runId).toBe(runId);
      expect(results.cases.map((c) => c.id)).toEqual(["T1", "T2", "T3", "T4", "T5", "T6", "T7"]);
      expect(runExit).toBe(results.gateFailed ? 1 : 0);
      for (const gateCase of results.cases.filter((c) => c.gate)) {
        expect(gateCase.checks.length).toBeGreaterThan(0);
        for (const check of gateCase.checks) {
          expect(check).toHaveProperty("expected");
          expect(check).toHaveProperty("observed");
        }
        expect(gateCase.rowCounts).toHaveProperty("consultations");
      }
      // 순차·단일 연결로 결정적인 T1~T4는 로컬에서도 통과해야 한다.
      for (const id of ["T1", "T2", "T3", "T4"]) {
        const failed = results.cases.find((c) => c.id === id)?.checks.filter((c) => !c.pass);
        expect(failed, `${id} 실패 체크`).toEqual([]);
      }
      const t7 = results.cases.find((c) => c.id === "T7");
      expect(t7?.gate).toBe(true);
      // fork 경로가 실제로 동작했다 — 두 프로세스의 응답이 모두 기록되고 워커 오류가 없다.
      expect(t7?.error).toBeUndefined();
      expect(t7?.requests).toHaveLength(2);
      // T7의 통과 여부는 여기서 단정하지 않는다 — 전체 실행에서는 T5/T6이 같은 프로세스에서 남긴 로컬
      // 잠금이 풀리는 시점에 따라 T7 워커가 SQLITE_BUSY를 볼 수 있다(지연 0ms 전체 실행에서 관측,
      // T7만 단독 실행하면 같은 조건에서 3/3 통과). 통과 여부는 아래 "--only T7" 테스트가 오염 없이 본다.

      // 3) 원장 — write-ahead로 모든 제출 키와 (window_start, ip_hmac) 쌍이 남아 있다.
      const ledger = JSON.parse(readFileSync(path.join(runDir, "ledger.json"), "utf8")) as {
        name: string;
        consultations: unknown[];
        rateLimits: { kind: string }[];
        trigger: { name: string } | null;
        checksum: string;
        fingerprint: string;
      };
      expect(ledger.name).toBe(name);
      expect(ledger.consultations).toHaveLength(15); // T3 1 + T4 6 + T5 6 + T6 1 + T7 1
      expect(ledger.rateLimits.length).toBeGreaterThanOrEqual(13);
      expect(new Set(ledger.rateLimits.map((r) => r.kind))).toEqual(
        new Set(["route", "marker", "seed-expired"])
      );
      expect(ledger.trigger?.name).toBe(`vt_${runId}_block_delete`);
      expect(ledger.checksum).toBe(computeLedgerChecksum(ledger as unknown as Ledger));
      expect(ledger.fingerprint).toBe(fingerprintOf(db.url));

      // T3의 트리거는 남아 있지 않다.
      expect(
        await count(db.client, "SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'trigger'")
      ).toBe(0);

      // 4) 이물(실제 고객) 행 두 개가 도착했다고 가정한다.
      await seedDecoyConsultation(db.client);
      await seedDecoyRateLimit(db.client);
      const beforeMatch = await count(
        db.client,
        "SELECT COUNT(*) AS c FROM consultations WHERE name = ?",
        [name]
      );
      expect(beforeMatch).toBeGreaterThanOrEqual(6);

      // 5) cleanup — baseline(0)과 총계가 달라(이물 존재) 종료 코드 3, 하지만 이물은 그대로다.
      const cleanupExit = await main(["cleanup", "--run-id", runId], deps);
      expect(cleanupExit).toBe(3);
      const cleanup = JSON.parse(readFileSync(path.join(runDir, "cleanup.json"), "utf8")) as {
        triggerPresentAfter: boolean;
        tables: Record<
          string,
          {
            totalBefore: number;
            matchingBefore: number;
            deleted: number;
            totalAfter: number;
            matchingAfter: number;
            baseline: number;
          }
        >;
      };
      expect(cleanup.triggerPresentAfter).toBe(false);
      expect(cleanup.tables.consultations.matchingBefore).toBe(beforeMatch);
      expect(cleanup.tables.consultations.deleted).toBe(beforeMatch);
      expect(cleanup.tables.consultations.matchingAfter).toBe(0);
      expect(cleanup.tables.consultations.totalAfter).toBe(1);
      expect(cleanup.tables.consultation_rate_limits.matchingAfter).toBe(0);
      expect(cleanup.tables.consultation_rate_limits.totalAfter).toBe(1);
      expect(cleanup.tables.consultations.baseline).toBe(0);
      expect(
        await count(
          db.client,
          "SELECT COUNT(*) AS c FROM consultations WHERE id = 'decoy-1' AND name = '진짜고객'"
        )
      ).toBe(1);
      expect(
        await count(
          db.client,
          "SELECT COUNT(*) AS c FROM consultation_rate_limits WHERE ip_hmac = 'decoy-hmac'"
        )
      ).toBe(1);
      expect(
        await count(db.client, "SELECT COUNT(*) AS c FROM consultations WHERE name = ?", [name])
      ).toBe(0);
      expect(
        await count(
          db.client,
          "SELECT COUNT(*) AS c FROM consultation_rate_limits WHERE ip_hmac LIKE ?",
          [`vt-${runId}-%`]
        )
      ).toBe(0);
      const table = logs.join("\n");
      expect(table).toContain("total_before");
      expect(table).toContain("trigger present after: no");

      // 6) 두 번째 cleanup은 0건을 지운다(멱등).
      expect(await main(["cleanup", "--run-id", runId], deps)).toBe(3);
      const second = JSON.parse(
        readFileSync(path.join(runDir, "cleanup.json"), "utf8")
      ) as typeof cleanup;
      expect(second.tables.consultations.deleted).toBe(0);
      expect(second.tables.consultation_rate_limits.deleted).toBe(0);

      // 7) 이물을 치우면 세 번째 cleanup은 baseline과 일치해 종료 코드 0.
      await db.client.execute("DELETE FROM consultations WHERE id = 'decoy-1'");
      await db.client.execute("DELETE FROM consultation_rate_limits WHERE ip_hmac = 'decoy-hmac'");
      expect(await main(["cleanup", "--run-id", runId], deps)).toBe(0);
      expect(await main(["preflight"], deps)).toBe(0);
    }
  );
});

describe("실제 CLI(tsx) 경로 — 오케스트레이터가 쓰는 실행 방식 그대로", () => {
  it(
    "node --import tsx로 run → cleanup까지 돌고, T7 워커가 tsx 아래에서도 뜬다",
    { timeout: 240_000 },
    async () => {
      const db = await makeMigratedDb();
      const runId = "cli00001";
      const runDir = path.join(projectRoot, ".moai", "state", "verify", "remote", runId);
      const cli = (args: string[]) =>
        spawnSync(
          process.execPath,
          [
            "--import",
            import.meta.resolve("tsx"),
            path.join(scriptDir, "verify-remote-consult.ts"),
            ...args,
          ],
          {
            cwd: projectRoot,
            env: { ...process.env, TURSO_DATABASE_URL: db.url, TURSO_AUTH_TOKEN: "" },
            encoding: "utf8",
            timeout: 200_000,
          }
        );

      try {
        const fingerprint = cli(["fingerprint"]);
        expect(fingerprint.status).toBe(0);
        expect(fingerprint.stdout).toContain(fingerprintOf(db.url));

        // T5의 동시 트랜잭션은 로컬 SQLite에서 SQLITE_BUSY로 실패할 수 있다(게이트 실패 → 종료 코드 1).
        const run = cli(["run", "--run-id", runId, "--window-room-ms", "0"]);
        expect([0, 1]).toContain(run.status);
        const results = JSON.parse(readFileSync(path.join(runDir, "results.json"), "utf8")) as {
          cases: { id: string; error?: string; requests: unknown[] }[];
        };
        const t7 = results.cases.find((c) => c.id === "T7");
        expect(t7?.error).toBeUndefined();
        expect(t7?.requests).toHaveLength(2);

        expect(cli(["cleanup", "--run-id", runId]).status).toBe(0);
        expect(cli(["preflight"]).status).toBe(0);
      } finally {
        await removeWithRetry(runDir);
      }
    }
  );
});

describe("cleanup 불일치 안전장치 — 원장과 실제가 어긋나면 아무것도 지우지 않고 멈춘다", () => {
  async function setup(runId: string) {
    const db = await makeMigratedDb();
    const runDir = path.join(stateRoot, runId);
    const name = `가상테스트-${runId}`;
    const ledger = new LedgerWriter(runDir, {
      runId,
      fingerprint: fingerprintOf(db.url),
      baseline: { consultations: 0, consultation_rate_limits: 0 },
      name,
    });
    const key = `vt-${runId}-t4-0-k`;
    ledger.addConsultation({
      caseId: "T4",
      idempotencyKey: key,
      resultId: `vt-${runId}-t4-0`,
      contactNormalized: "01000000001",
    });
    ledger.addRateLimits([
      {
        caseId: "T1",
        kind: "marker",
        windowStartMs: 4_000_000_000_000,
        ipHmac: `vt-${runId}-t1-commit`,
      },
    ]);
    await db.client.execute({
      sql: `INSERT INTO consultations (id, result_id, channel, name, contact_normalized, preferred_call_time,
        consent_pii_collection, consent_health_info_use, consent_marketing, consent_version,
        request_fingerprint, application_status, idempotency_key, created_at, updated_at)
        VALUES ('own-1', ?, 'kakao', ?, '01000000001', NULL, 1, 1, 0, ?, 'fp', 'received', ?, 1790000000, 1790000000)`,
      args: [`vt-${runId}-t4-0`, name, CONSENT_VERSION, key],
    });
    await db.client.execute({
      sql: "INSERT INTO consultation_rate_limits (window_start, ip_hmac, request_count) VALUES (4000000000, ?, 1)",
      args: [`vt-${runId}-t1-commit`],
    });
    await seedDecoyConsultation(db.client);
    const { deps } = makeDeps({ TURSO_DATABASE_URL: db.url, TURSO_AUTH_TOKEN: "" });
    const ledgerFile = path.join(runDir, "ledger.json");
    return { db, deps, runDir, ledgerFile, original: readFileSync(ledgerFile, "utf8"), name, key };
  }

  async function totals(client: Client) {
    return {
      consultations: await count(client, "SELECT COUNT(*) AS c FROM consultations"),
      rateLimits: await count(client, "SELECT COUNT(*) AS c FROM consultation_rate_limits"),
    };
  }

  it("체크섬이 깨진 원장(항목만 덧붙임)이면 종료 코드 1, 아무 행도 지우지 않는다", async () => {
    const s = await setup("tamp0001");
    const before = await totals(s.db.client);
    const tampered = JSON.parse(s.original) as { consultations: unknown[] };
    tampered.consultations.push({
      caseId: "T4",
      idempotencyKey: "decoy-1-key",
      resultId: "decoy-result",
      contactNormalized: "01011112222",
    });
    writeFileSync(s.ledgerFile, JSON.stringify(tampered));

    expect(await main(["cleanup", "--run-id", "tamp0001"], s.deps)).toBe(1);
    expect(await totals(s.db.client)).toEqual(before);
  });

  it("체크섬을 다시 맞춰도 서명(이름)이 다른 행을 가리키면 종료 코드 1, 아무 행도 지우지 않는다", async () => {
    const s = await setup("tamp0002");
    const before = await totals(s.db.client);
    const tampered = JSON.parse(s.original) as Ledger;
    tampered.consultations.push({
      caseId: "T4",
      idempotencyKey: "decoy-1-key",
      resultId: "decoy-result",
      contactNormalized: "01011112222",
    });
    tampered.checksum = computeLedgerChecksum(tampered);
    writeFileSync(s.ledgerFile, JSON.stringify(tampered));

    expect(await main(["cleanup", "--run-id", "tamp0002"], s.deps)).toBe(1);
    expect(await totals(s.db.client)).toEqual(before);
  });

  it("체크섬을 맞추고 키 접두도 맞췄지만 행의 이름 서명이 다르면 종료 코드 1, 아무 행도 지우지 않는다", async () => {
    const s = await setup("tamp0006");
    await s.db.client.execute({
      sql: `INSERT INTO consultations (id, result_id, channel, name, contact_normalized, preferred_call_time,
        consent_pii_collection, consent_health_info_use, consent_marketing, consent_version,
        request_fingerprint, application_status, idempotency_key, created_at, updated_at)
        VALUES ('real-2', 'vt-tamp0006-forged', 'kakao', '진짜고객2', '01000000009', NULL, 1, 1, 0, ?, 'fp', 'received', 'vt-tamp0006-forged-k', 1790000000, 1790000000)`,
      args: [CONSENT_VERSION],
    });
    const before = await totals(s.db.client);
    const tampered = JSON.parse(s.original) as Ledger;
    tampered.consultations.push({
      caseId: "T4",
      idempotencyKey: "vt-tamp0006-forged-k",
      resultId: "vt-tamp0006-forged",
      contactNormalized: "01000000009",
    });
    tampered.checksum = computeLedgerChecksum(tampered);
    writeFileSync(s.ledgerFile, JSON.stringify(tampered));

    expect(await main(["cleanup", "--run-id", "tamp0006"], s.deps)).toBe(1);
    expect(await totals(s.db.client)).toEqual(before);
    expect(
      await count(s.db.client, "SELECT COUNT(*) AS c FROM consultations WHERE id = 'real-2'")
    ).toBe(1);
  });

  it("원장에 없는데 우리 서명(이름)을 단 행이 있으면 종료 코드 1, 아무 행도 지우지 않는다", async () => {
    const s = await setup("tamp0003");
    await s.db.client.execute({
      sql: `INSERT INTO consultations (id, result_id, channel, name, contact_normalized, preferred_call_time,
        consent_pii_collection, consent_health_info_use, consent_marketing, consent_version,
        request_fingerprint, application_status, idempotency_key, created_at, updated_at)
        VALUES ('stray-1', 'stray-result', 'kakao', ?, '01000000002', NULL, 1, 1, 0, ?, 'fp', 'received', 'stray-key', 1790000000, 1790000000)`,
      args: [s.name, CONSENT_VERSION],
    });
    const before = await totals(s.db.client);

    expect(await main(["cleanup", "--run-id", "tamp0003"], s.deps)).toBe(1);
    expect(await totals(s.db.client)).toEqual(before);
  });

  it("다른 DB(지문 불일치)에 대한 cleanup은 종료 코드 2로 거부한다", async () => {
    const s = await setup("tamp0004");
    const other = await makeMigratedDb();
    const { deps } = makeDeps({ TURSO_DATABASE_URL: other.url, TURSO_AUTH_TOKEN: "" });

    expect(await main(["cleanup", "--run-id", "tamp0004"], deps)).toBe(2);
    expect((await totals(s.db.client)).consultations).toBe(2);
  });

  it("손대지 않은 원장이면 정확히 원장 행만(consultations 1, rate 1) 지운다", async () => {
    const s = await setup("tamp0005");

    expect(await main(["cleanup", "--run-id", "tamp0005"], s.deps)).toBe(3); // 이물 1행이 baseline과 다름
    expect(await totals(s.db.client)).toEqual({ consultations: 1, rateLimits: 0 });
    expect(
      await count(s.db.client, "SELECT COUNT(*) AS c FROM consultations WHERE id = 'decoy-1'")
    ).toBe(1);
  });
});

describe("revert-schema — 0009 마이그레이션을 되돌린다(빈 테이블에서만)", () => {
  const journal = JSON.parse(
    readFileSync(path.join(migrationsFolder, "meta", "_journal.json"), "utf8")
  ) as { entries: { tag: string; when: number }[] };
  const entry0009 = journal.entries.find((e) => e.tag.startsWith("0009_"));

  async function tableNames(client: Client): Promise<string[]> {
    const result = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
    );
    return result.rows.map((r) => String(r.name));
  }

  it("확인 플래그가 없으면 종료 코드 2, 아무것도 바꾸지 않는다", async () => {
    const db = await makeMigratedDb();
    const before = await tableNames(db.client);
    const { deps } = makeDeps({ TURSO_DATABASE_URL: db.url, TURSO_AUTH_TOKEN: "" });

    expect(await main(["revert-schema"], deps)).toBe(2);
    expect(await tableNames(db.client)).toEqual(before);
  });

  it("행이 있으면 거부하고 아무것도 지우지 않는다", async () => {
    const db = await makeMigratedDb();
    await seedDecoyRateLimit(db.client);
    const before = await tableNames(db.client);
    const { deps } = makeDeps({ TURSO_DATABASE_URL: db.url, TURSO_AUTH_TOKEN: "" });

    expect(await main(["revert-schema", "--confirm-revert-schema"], deps)).toBe(1);
    expect(await tableNames(db.client)).toEqual(before);
  });

  it("0009 마이그레이션 행이 없으면 거부한다", async () => {
    const db = await makeMigratedDb();
    await db.client.execute({
      sql: "DELETE FROM __drizzle_migrations WHERE created_at = ?",
      args: [entry0009?.when ?? 0],
    });
    const before = await tableNames(db.client);
    const { deps } = makeDeps({ TURSO_DATABASE_URL: db.url, TURSO_AUTH_TOKEN: "" });

    expect(await main(["revert-schema", "--confirm-revert-schema"], deps)).toBe(1);
    expect(await tableNames(db.client)).toEqual(before);
  });

  it("0009 마이그레이션 행이 둘이면(유일 식별 불가) 거부한다", async () => {
    const db = await makeMigratedDb();
    await db.client.execute({
      sql: "INSERT INTO __drizzle_migrations (hash, created_at) SELECT hash, created_at FROM __drizzle_migrations WHERE created_at = ?",
      args: [entry0009?.when ?? 0],
    });
    const before = await tableNames(db.client);
    const { deps } = makeDeps({ TURSO_DATABASE_URL: db.url, TURSO_AUTH_TOKEN: "" });

    expect(await main(["revert-schema", "--confirm-revert-schema"], deps)).toBe(1);
    expect(await tableNames(db.client)).toEqual(before);
  });

  it("하네스 것이 아닌 트리거가 있으면 거부한다", async () => {
    const db = await makeMigratedDb();
    await db.client.execute(
      "CREATE TRIGGER foreign_trigger BEFORE DELETE ON consultation_rate_limits BEGIN SELECT RAISE(ABORT, 'x'); END"
    );
    const before = await tableNames(db.client);
    const { deps } = makeDeps({ TURSO_DATABASE_URL: db.url, TURSO_AUTH_TOKEN: "" });

    expect(await main(["revert-schema", "--confirm-revert-schema"], deps)).toBe(1);
    expect(await tableNames(db.client)).toEqual(before);
    expect(
      await count(
        db.client,
        "SELECT COUNT(*) AS c FROM sqlite_master WHERE name = 'foreign_trigger'"
      )
    ).toBe(1);
  });

  it("빈 마이그레이션 DB에서는 두 테이블과 0009 행만 정확히 지우고 나머지는 건드리지 않는다", async () => {
    const db = await makeMigratedDb();
    await db.client.execute("CREATE TABLE decoy_unrelated (id TEXT PRIMARY KEY, note TEXT)");
    await db.client.execute("INSERT INTO decoy_unrelated (id, note) VALUES ('keep', '남겨야 함')");
    const migrationRowsBefore = await count(
      db.client,
      "SELECT COUNT(*) AS c FROM __drizzle_migrations"
    );
    const tablesBefore = await tableNames(db.client);
    const { deps } = makeDeps({ TURSO_DATABASE_URL: db.url, TURSO_AUTH_TOKEN: "" });

    expect(await main(["revert-schema", "--confirm-revert-schema"], deps)).toBe(0);

    const tablesAfter = await tableNames(db.client);
    expect(tablesAfter).toEqual(
      tablesBefore.filter((t) => t !== "consultations" && t !== "consultation_rate_limits")
    );
    expect(await count(db.client, "SELECT COUNT(*) AS c FROM __drizzle_migrations")).toBe(
      migrationRowsBefore - 1
    );
    expect(
      await count(
        db.client,
        "SELECT COUNT(*) AS c FROM __drizzle_migrations WHERE created_at = ?",
        [entry0009?.when ?? 0]
      )
    ).toBe(0);
    expect(
      await count(db.client, "SELECT COUNT(*) AS c FROM decoy_unrelated WHERE id = 'keep'")
    ).toBe(1);
    expect(
      await count(
        db.client,
        "SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'trigger' OR tbl_name IN ('consultations','consultation_rate_limits')"
      )
    ).toBe(0);
  });
});

describe("트리거 안전 — T3은 라우트 호출이 던져도 트리거를 반드시 지운다", () => {
  it("submit이 예외를 던져도 finally에서 트리거를 지우고, 원장에 트리거 이름이 남는다", async () => {
    const db = await makeMigratedDb();
    const runId = "trig0001";
    const client = createClient({ url: db.url });
    openClients.push(client);
    const drizzleDb = drizzle(client, { schema });
    const ledger = new LedgerWriter(path.join(stateRoot, runId), {
      runId,
      fingerprint: fingerprintOf(db.url),
      baseline: { consultations: 0, consultation_rate_limits: 0 },
      name: `가상테스트-${runId}`,
    });
    const ctx = createCaseContext({
      client,
      db: drizzleDb,
      runId,
      secret: "unit-test-secret",
      ledger,
      windowRoomMs: 0,
      submit: async () => {
        throw new Error("simulated route failure");
      },
      launchWorker: () => {
        throw new Error("worker는 이 테스트에서 쓰지 않는다");
      },
    });

    const result = await runTriggerCase(ctx);

    expect(result.status).not.toBe("PASS");
    expect(
      await count(client, "SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'trigger'")
    ).toBe(0);
    const persisted = JSON.parse(
      readFileSync(path.join(stateRoot, runId, "ledger.json"), "utf8")
    ) as {
      trigger: { name: string } | null;
    };
    expect(persisted.trigger?.name).toBe(`vt_${runId}_block_delete`);
  });
});

describe("T7 게이트 판정 — 같은 키를 서로 다른 프로세스가 동시에 제출", () => {
  const SUCCESS_BODY = JSON.stringify({
    status: "success",
    channel: "kakao",
    maskedContact: "010-****-0001",
    preferredCallTime: VT_CALL_TIME,
  });
  const DUPLICATE_BODY = JSON.stringify({
    status: "duplicate",
    receivedAt: "2026-09-30",
    maskedContact: "010-****-0001",
    applicationStatus: "received",
  });

  // 실제 프로세스를 띄우지 않고 "워커가 이런 응답을 받았고 DB에 이런 상태가 남았다"를 흉내 낸다.
  // 판정 로직(무엇을 게이트로 보고 어떤 관측을 실패로 보는가)만 결정적으로 검증한다.
  function fakeWorker(
    response: WorkerResult,
    seed?: (job: WorkerJob) => Promise<void>
  ): WorkerHandle {
    let pending: Promise<void> = Promise.resolve();
    return {
      ready: async () => {},
      start: (job) => {
        pending = seed ? seed(job) : Promise.resolve();
      },
      result: async () => {
        await pending;
        return response;
      },
      kill: () => {},
    };
  }

  async function runT7(responses: [WorkerResult, WorkerResult], counter: number) {
    const db = await makeMigratedDb();
    const client = createClient({ url: db.url });
    openClients.push(client);
    const secret = "t7-unit-secret";
    const runId = `t7gate${dbCounter}`;
    const ledger = new LedgerWriter(path.join(stateRoot, runId), {
      runId,
      fingerprint: fingerprintOf(db.url),
      baseline: { consultations: 0, consultation_rate_limits: 0 },
      name: `가상테스트-${runId}`,
    });
    const seed = async (job: WorkerJob): Promise<void> => {
      const body = job.body as { idempotencyKey: string; resultId: string };
      await client.execute({
        sql: `INSERT INTO consultations (id, result_id, channel, name, contact_normalized, preferred_call_time,
          consent_pii_collection, consent_health_info_use, consent_marketing, consent_version,
          request_fingerprint, application_status, idempotency_key, created_at, updated_at)
          VALUES (?, ?, 'kakao', ?, '01000000001', NULL, 1, 1, 0, ?, 'fp', 'received', ?, 1790000000, 1790000000)`,
        args: [
          `${runId}-row`,
          body.resultId,
          `가상테스트-${runId}`,
          CONSENT_VERSION,
          body.idempotencyKey,
        ],
      });
      await client.execute({
        sql: "INSERT INTO consultation_rate_limits (window_start, ip_hmac, request_count) VALUES (?, ?, ?)",
        args: [
          Math.floor(windowStartOf(Date.now()) / 1000),
          computeIpHmac(secret, job.ip),
          counter,
        ],
      });
    };
    let launched = 0;
    const ctx = createCaseContext({
      client,
      db: drizzle(client, { schema }),
      runId,
      secret,
      ledger,
      windowRoomMs: 0,
      submit: async () => {
        throw new Error("submit은 이 테스트에서 쓰지 않는다");
      },
      launchWorker: () => {
        const index = launched++;
        return fakeWorker(responses[index], index === 0 ? seed : undefined);
      },
    });
    return runTwoProcessCase(ctx);
  }

  it("T7은 게이트이고, 행 1개·동일한 성공 응답(201+200)·카운터 1이면 통과한다", async () => {
    const result = await runT7(
      [
        { status: 201, bodyText: SUCCESS_BODY },
        { status: 200, bodyText: SUCCESS_BODY },
      ],
      1
    );

    expect(result.gate).toBe(true);
    expect(result.checks.filter((c) => !c.pass)).toEqual([]);
    expect(result.status).toBe("PASS");
  });

  it("원격에서 관측된 결함(409 duplicate + 201, 카운터 2)은 게이트 실패로 기록한다", async () => {
    const result = await runT7(
      [
        { status: 409, bodyText: DUPLICATE_BODY },
        { status: 201, bodyText: SUCCESS_BODY },
      ],
      2
    );

    expect(result.gate).toBe(true);
    expect(result.status).toBe("FAIL");
    const failed = result.checks.filter((c) => !c.pass).map((c) => c.name);
    expect(failed.some((name) => name.includes("request_count"))).toBe(true);
    expect(failed.some((name) => name.includes("2xx"))).toBe(true);
  });

  it("두 응답이 모두 성공이어도 본문이 서로 다르면 실패로 기록한다", async () => {
    const result = await runT7(
      [
        { status: 201, bodyText: SUCCESS_BODY },
        { status: 200, bodyText: SUCCESS_BODY.replace("0001", "9999") },
      ],
      1
    );

    expect(result.status).toBe("FAIL");
    expect(
      result.checks
        .filter((c) => !c.pass)
        .map((c) => c.name)
        .join("\n")
    ).toContain("본문");
  });

  it("워커가 보낸 처리 시간을 요청 기록과 요약 줄에 남기고, 시간이 없는 응답도 그대로 판정한다", async () => {
    const timed = await runT7(
      [
        { status: 201, bodyText: SUCCESS_BODY, durationMs: 120.5 },
        { status: 200, bodyText: SUCCESS_BODY, durationMs: 98 },
      ],
      1
    );

    expect(timed.status).toBe("PASS");
    expect(timed.requests.map((r) => r.durationMs)).toEqual([120.5, 98]);
    const summary = timed.notes.find((n) => n.includes("요청 처리 시간"));
    expect(summary).toContain("최소 98");
    expect(summary).toContain("최대 120.5");

    const untimed = await runT7(
      [
        { status: 201, bodyText: SUCCESS_BODY },
        { status: 200, bodyText: SUCCESS_BODY },
      ],
      1
    );
    expect(untimed.status).toBe("PASS");
    expect(untimed.notes.some((n) => n.includes("요청 처리 시간"))).toBe(false);
  });

  it("두 응답이 같아도 카카오 성공 응답에 보낸 연락 희망 시간이 없으면 실패로 기록한다", async () => {
    const withoutTime = JSON.stringify({
      status: "success",
      channel: "kakao",
      maskedContact: "010-****-0001",
    });

    const result = await runT7(
      [
        { status: 201, bodyText: withoutTime },
        { status: 200, bodyText: withoutTime },
      ],
      1
    );

    expect(result.status).toBe("FAIL");
    const failed = result.checks.filter((c) => !c.pass).map((c) => c.name);
    expect(failed.some((name) => name.includes("연락 희망 시간"))).toBe(true);
  });
});

describe("요청 처리 시간 기록 — 원격 잠금 경합의 지연을 결과에 남긴다", () => {
  const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  it("performRouteCall은 정상 응답과 예외 모두 걸린 시간(ms)을 돌려준다", async () => {
    const slowOk: SubmitFn = async () => {
      await pause(30);
      return new Response("{}", { status: 201 });
    };
    const slowThrow: SubmitFn = async () => {
      await pause(30);
      throw new Error("simulated failure");
    };

    const ok = await performRouteCall(slowOk, {} as Db, {}, { a: 1 }, "198.51.100.1");
    const failed = await performRouteCall(slowThrow, {} as Db, {}, { a: 1 }, "198.51.100.1");

    expect(ok.status).toBe(201);
    expect(ok.durationMs).toBeGreaterThanOrEqual(25);
    expect(failed.status).toBe(0);
    expect(failed.durationMs).toBeGreaterThanOrEqual(25);
  });

  it("실제 라우트로 돈 순차 케이스(T4)는 요청마다 처리 시간을 기록하고 요약 줄을 남긴다", async () => {
    const db = await makeMigratedDb();
    const client = createClient({ url: db.url });
    openClients.push(client);
    const runId = "tm000001";
    const ledger = new LedgerWriter(path.join(stateRoot, runId), {
      runId,
      fingerprint: fingerprintOf(db.url),
      baseline: { consultations: 0, consultation_rate_limits: 0 },
      name: `가상테스트-${runId}`,
    });
    const ctx = createCaseContext({
      client,
      db: drizzle(client, { schema }),
      runId,
      secret: "timing-unit-secret",
      ledger,
      windowRoomMs: 2000,
      submit: handleConsultationSubmit as SubmitFn,
      launchWorker: () => {
        throw new Error("worker는 이 테스트에서 쓰지 않는다");
      },
    });

    const result = await runSequentialCase(ctx);

    expect(result.status).toBe("PASS");
    expect(result.requests).toHaveLength(6);
    for (const record of result.requests) {
      expect(Number.isFinite(record.durationMs)).toBe(true);
      expect(record.durationMs).toBeGreaterThanOrEqual(0);
    }
    const summary = result.notes.find((n) => n.includes("요청 처리 시간"));
    expect(summary).toBeDefined();
    expect(summary).toContain("최대");
  });
});

describe("카카오 성공 응답의 연락 희망 시간 — 보낸 값을 그대로 돌려주고, 안 보냈으면 필드가 없다", () => {
  let seq = 0;

  async function makeRealRouteCtx(submit: SubmitFn) {
    const db = await makeMigratedDb();
    const client = createClient({ url: db.url });
    openClients.push(client);
    const runId = `ct${String(seq++).padStart(6, "0")}`;
    const ledger = new LedgerWriter(path.join(stateRoot, runId), {
      runId,
      fingerprint: fingerprintOf(db.url),
      baseline: { consultations: 0, consultation_rate_limits: 0 },
      name: `가상테스트-${runId}`,
    });
    const ctx = createCaseContext({
      client,
      db: drizzle(client, { schema }),
      runId,
      secret: "call-time-unit-secret",
      ledger,
      windowRoomMs: 0,
      submit,
      launchWorker: () => {
        throw new Error("worker는 이 테스트에서 쓰지 않는다");
      },
    });
    return { ctx, client };
  }

  // 라우트 응답에서 연락 희망 시간만 지워 "응답에서 시간이 빠진 결함"을 흉내 낸다.
  const stripCallTime: SubmitFn = async (request, db, env) => {
    const response = await handleConsultationSubmit(request, db, env);
    const parsed = JSON.parse(await response.text()) as Record<string, unknown>;
    delete parsed.preferredCallTime;
    return new Response(JSON.stringify(parsed), { status: response.status });
  };

  it("T4: 실제 라우트에서 짝수 번째 요청은 시간을 그대로 돌려받고 홀수 번째 응답에는 필드가 없다", async () => {
    const { ctx } = await makeRealRouteCtx(handleConsultationSubmit as SubmitFn);

    const result = await runSequentialCase(ctx);

    expect(result.checks.filter((c) => !c.pass)).toEqual([]);
    expect(result.status).toBe("PASS");
    const echoCheck = result.checks.find((c) => c.name.includes("연락 희망 시간"));
    expect(echoCheck).toBeDefined();
    const bodies = result.requests
      .slice(0, 5)
      .map((r) => (r.body as { preferredCallTime?: string }).preferredCallTime);
    expect(bodies).toEqual([VT_CALL_TIME, undefined, VT_CALL_TIME, undefined, VT_CALL_TIME]);
  });

  it("T4: 응답에서 연락 희망 시간이 빠지면 실패로 기록한다", async () => {
    const { ctx } = await makeRealRouteCtx(stripCallTime);

    const result = await runSequentialCase(ctx);

    expect(result.status).toBe("FAIL");
    const failed = result.checks.filter((c) => !c.pass).map((c) => c.name);
    expect(failed.some((name) => name.includes("연락 희망 시간"))).toBe(true);
  });

  it("T3: 실패 뒤 재시도한 성공 응답이 시간을 돌려주고, DB에 저장된 값도 보낸 값과 같다", async () => {
    const { ctx } = await makeRealRouteCtx(handleConsultationSubmit as SubmitFn);

    const result = await runTriggerCase(ctx);

    expect(result.checks.filter((c) => !c.pass)).toEqual([]);
    expect(result.status).toBe("PASS");
    const names = result.checks.map((c) => c.name);
    expect(names.some((n) => n.includes("재시도") && n.includes("연락 희망 시간"))).toBe(true);
    expect(names.some((n) => n.includes("저장된 연락 희망 시간"))).toBe(true);
  });

  it("T3: 재시도 성공 응답에서 시간이 빠지면 실패로 기록한다", async () => {
    const { ctx } = await makeRealRouteCtx(stripCallTime);

    const result = await runTriggerCase(ctx);

    // 첫 호출은 500(JSON 본문 {code})이라 stripCallTime이 그대로 통과시키고, 재시도 성공 응답만 바뀐다.
    expect(result.status).toBe("FAIL");
    const failed = result.checks.filter((c) => !c.pass).map((c) => c.name);
    expect(failed.some((name) => name.includes("연락 희망 시간"))).toBe(true);
  });
});

describe("withSimulatedLatency — 원격 왕복 지연을 로컬 file: 클라이언트에서 흉내 낸다", () => {
  it("execute와 트랜잭션의 문장마다 지연을 두되 결과·커밋·롤백은 그대로다", async () => {
    const db = await makeMigratedDb();
    const raw = createClient({ url: db.url, timeout: 5000 });
    openClients.push(raw);
    const slow = withSimulatedLatency(raw, 40);

    const t0 = Date.now();
    const selected = await slow.execute("SELECT COUNT(*) AS c FROM consultations");
    expect(Number(selected.rows[0].c)).toBe(0);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(35);

    const slowDb = drizzle(slow, { schema });
    const insertMarker = (ipHmac: string) =>
      slowDb.transaction(async (tx) => {
        await tx
          .insert(schema.consultationRateLimits)
          .values({ windowStart: new Date(1_790_000_000_000), ipHmac, requestCount: 1 });
        return "done";
      });

    const t1 = Date.now();
    expect(await insertMarker("lat-commit")).toBe("done");
    // BEGIN + INSERT + COMMIT — 세 번의 왕복.
    expect(Date.now() - t1).toBeGreaterThanOrEqual(3 * 35);
    expect(
      await count(raw, "SELECT COUNT(*) AS c FROM consultation_rate_limits WHERE ip_hmac = ?", [
        "lat-commit",
      ])
    ).toBe(1);

    await expect(
      slowDb.transaction(async (tx) => {
        await tx.insert(schema.consultationRateLimits).values({
          windowStart: new Date(1_790_000_000_000),
          ipHmac: "lat-rollback",
          requestCount: 1,
        });
        throw new Error("rollback-please");
      })
    ).rejects.toThrow("rollback-please");
    expect(
      await count(raw, "SELECT COUNT(*) AS c FROM consultation_rate_limits WHERE ip_hmac = ?", [
        "lat-rollback",
      ])
    ).toBe(0);
  });

  it("지연 0은 원본 클라이언트를 그대로 돌려준다", async () => {
    const db = await makeMigratedDb();
    expect(withSimulatedLatency(db.client, 0)).toBe(db.client);
  });
});

describe("--simulate-latency-ms — 로컬 file: 대상에서만, 유효한 값만", () => {
  it.each(["abc", "-5", "NaN"])("값 %s는 종료 코드 2이고 원장·행 변화가 없다", async (value) => {
    const db = await makeMigratedDb();
    const { deps } = makeDeps({ TURSO_DATABASE_URL: db.url, TURSO_AUTH_TOKEN: "" });
    const runId = `lat${dbCounter}bad`;

    const exitCode = await main(
      ["run", "--run-id", runId, "--window-room-ms", "0", `--simulate-latency-ms=${value}`],
      deps
    );

    expect(exitCode).toBe(2);
    expect(existsSync(path.join(stateRoot, runId))).toBe(false);
    expect(await count(db.client, "SELECT COUNT(*) AS c FROM consultations")).toBe(0);
  });

  it("원격 대상은 지문·쓰기 허용이 맞아도 거부(종료 코드 2)하고 클라이언트도 만들지 않는다", async () => {
    const spy = makeSpyFactory();
    const { deps } = makeDeps(
      { TURSO_DATABASE_URL: REMOTE_URL, TURSO_AUTH_TOKEN: REMOTE_TOKEN },
      { createClient: spy.factory }
    );

    const exitCode = await main(
      [
        "run",
        "--run-id",
        "abcd1234",
        "--allow-write-remote",
        "--expect-fingerprint",
        REMOTE_FP,
        "--simulate-latency-ms",
        "50",
      ],
      deps
    );

    expect(exitCode).toBe(2);
    expect(spy.calls).toHaveLength(0);
  });
});

describe("--only — 선택한 케이스만, run에서만, 알려진 케이스만", () => {
  it(
    "--only T7은 T7만 실행하고, 앞 케이스의 잔여 잠금 없이 두 프로세스 동시 제출이 통과한다",
    { timeout: 120_000 },
    async () => {
      const db = await makeMigratedDb();
      const { deps } = makeDeps({ TURSO_DATABASE_URL: db.url, TURSO_AUTH_TOKEN: "" });
      const runId = "only0007";

      const exitCode = await main(
        [
          "run",
          "--only",
          "T7",
          "--run-id",
          runId,
          "--window-room-ms",
          "0",
          "--simulate-latency-ms",
          "50",
        ],
        deps
      );

      const results = JSON.parse(
        readFileSync(path.join(stateRoot, runId, "results.json"), "utf8")
      ) as {
        gates: { total: number; passed: number };
        cases: { id: string; status: string; checks: { name: string; pass: boolean }[] }[];
      };
      expect(results.cases.map((c) => c.id)).toEqual(["T7"]);
      expect(results.cases[0]?.checks.filter((c) => !c.pass)).toEqual([]);
      expect(results.gates).toEqual({ total: 1, passed: 1 });
      expect(exitCode).toBe(0);
      expect(await main(["cleanup", "--run-id", runId], deps)).toBe(0);
    }
  );

  it.each(["T9", "T7,T0", ""])(
    "알 수 없는 케이스 값 '%s'는 종료 코드 2이고 쓰기가 없다",
    async (value) => {
      const db = await makeMigratedDb();
      const { deps } = makeDeps({ TURSO_DATABASE_URL: db.url, TURSO_AUTH_TOKEN: "" });
      const runId = `only${dbCounter}bad`;

      const exitCode = await main(["run", "--run-id", runId, `--only=${value}`], deps);

      expect(exitCode).toBe(2);
      expect(existsSync(path.join(stateRoot, runId))).toBe(false);
      expect(await count(db.client, "SELECT COUNT(*) AS c FROM consultations")).toBe(0);
    }
  );

  it("run이 아닌 명령에 --only를 주면 종료 코드 2로 거부한다", async () => {
    const db = await makeMigratedDb();
    const { deps } = makeDeps({ TURSO_DATABASE_URL: db.url, TURSO_AUTH_TOKEN: "" });

    expect(await main(["preflight", "--only", "T7"], deps)).toBe(2);
  });
});

describe("순수 헬퍼", () => {
  it("fingerprintOf는 URL sha256의 앞 8자리 hex다", () => {
    const url = "libsql://example-db-org.turso.io";
    expect(fingerprintOf(url)).toBe(createHash("sha256").update(url).digest("hex").slice(0, 8));
    expect(fingerprintOf(` ${url} `)).toBe(fingerprintOf(url));
    expect(fingerprintOf(url)).toMatch(/^[0-9a-f]{8}$/);
  });

  it("maskHost는 호스트 전체를 드러내지 않는다", () => {
    expect(maskHost("libsql://bosang-radar-org.aws-ap-northeast-1.turso.io")).toBe("bos***.aws***");
    expect(maskHost("libsql://singlelabel")).toBe("sin***");
    expect(maskHost("not a url")).toBe("(알 수 없음)");
  });

  it("redactText는 비밀·호스트를 가리고 빈 문자열은 무시한다", () => {
    const text = "fail https://x.example.invalid with tok-123 and secret-abc";
    const redacted = redactText(text, ["tok-123", "secret-abc", "x.example.invalid", ""]);
    expect(redacted).not.toContain("tok-123");
    expect(redacted).not.toContain("secret-abc");
    expect(redacted).not.toContain("x.example.invalid");
    expect(redacted).toContain("***");
  });

  it("isValidRunId는 4~12자 소문자·숫자만 허용한다", () => {
    expect(isValidRunId("abcd1234")).toBe(true);
    expect(isValidRunId("abc")).toBe(false);
    expect(isValidRunId("ABCD1234")).toBe(false);
    expect(isValidRunId("ab-cd_12")).toBe(false);
    expect(isValidRunId("a".repeat(13))).toBe(false);
  });

  it("windowStartOf는 60초 고정 윈도 시작이다", () => {
    expect(windowStartOf(1_790_000_123_456)).toBe(Math.floor(1_790_000_123_456 / 60_000) * 60_000);
    expect(windowStartOf(120_000)).toBe(120_000);
    expect(windowStartOf(179_999)).toBe(120_000);
  });

  it("waitForWindowRoom은 남은 시간이 모자라면 다음 윈도까지 기다린다", async () => {
    let clock = 59_000; // 윈도 끝 1초 전
    const slept: number[] = [];
    const windowStart = await waitForWindowRoom(20_000, {
      now: () => clock,
      sleep: async (ms) => {
        slept.push(ms);
        clock += ms;
      },
    });
    expect(windowStart).toBe(60_000);
    expect(60_000 - (clock % 60_000)).toBeGreaterThanOrEqual(20_000);
    expect(slept.length).toBeGreaterThan(0);

    const calm = await waitForWindowRoom(20_000, { now: () => 130_000, sleep: async () => {} });
    expect(calm).toBe(120_000);
  });

  it("computeIpHmac은 라우트가 저장하는 ip_hmac과 같다(실제 라우트 호출로 확인)", async () => {
    const db = await makeMigratedDb();
    const client = createClient({ url: db.url });
    openClients.push(client);
    const drizzleDb = drizzle(client, { schema });
    const secret = "unit-hmac-secret";
    const ip = "198.51.100.77";
    const request = new NextRequest("http://localhost/api/consultations", {
      method: "POST",
      headers: { "x-forwarded-for": ip },
      body: JSON.stringify({
        resultId: "vt-unit-result",
        channel: "kakao",
        name: "가상테스트-unit",
        contact: "010-0000-0001",
        consent: { piiCollection: true, healthInfoUse: true, marketing: false },
        acknowledgedConsentVersion: CONSENT_VERSION,
        idempotencyKey: "vt-unit-key",
      }),
    });

    const response = await handleConsultationSubmit(request, drizzleDb, {
      CONSULT_POLICY_READY: "true",
      RATE_LIMIT_HMAC_SECRET: secret,
    });
    expect(response.status).toBe(201);

    const rows = await client.execute("SELECT ip_hmac FROM consultation_rate_limits");
    expect(rows.rows.map((r) => String(r.ip_hmac))).toEqual([
      createHmac("sha256", secret).update(ip).digest("hex"),
    ]);
    expect(computeIpHmac(secret, ip)).toBe(String(rows.rows[0].ip_hmac));
  });
});
