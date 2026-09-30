// SPEC-B2C-CONSULT-001 Group 3a — POST /api/consultations 원격 검증 하네스(CLI).
//
// 목적: 로컬 파일 SQLite로는 증명하지 못한 것 — 원격 Turso(HTTP)에서의 rate-limit 트랜잭션
// 원자성(커밋/롤백/라우트 실패 후 재시도)과 병렬 동작 — 을 실제 원격 DB에서 관측한다.
// 이 도구는 관측·기록만 하고 실패를 고치지 않는다(라우트 코드를 바꾸지 않는다).
//
// 안전 원칙(자세한 내용은 --help): TURSO_* 는 process.env에서만 읽고 .env* 파일은 읽지 않는다.
// 원격은 지문(--expect-fingerprint)과 쓰기 허용(--allow-write-remote)이 맞아야만 연결한다.
// 테스트 데이터는 가상(가상테스트-<run-id>, 010-0000-NNNN, TEST-NET-2 IP)이고, 모든 쓰기는
// write-ahead 원장에 먼저 적힌다. 정리는 원장이 가리키는 행만 정확히 지운다.

import { fork } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { handleConsultationSubmit } from "../app/api/consultations/route.ts";
import * as schema from "../lib/db/schema.ts";
import {
  countTable,
  readTableStatus,
  runCleanup,
  runRevertSchema,
} from "./verify-remote-consult-cleanup.ts";
import {
  CASE_IDS,
  DEFAULT_WINDOW_ROOM_MS,
  createCaseContext,
  runAllCases,
  runWorker,
  withSimulatedLatency,
  type CaseResult,
  type Db,
  type SubmitFn,
  type WorkerHandle,
  type WorkerLauncher,
  type WorkerResult,
} from "./verify-remote-consult-cases.ts";
import {
  evaluateGuard,
  fingerprintOf,
  hostOf,
  isValidRunId,
  maskHost,
  redactText,
  urlScheme,
  type GuardFlags,
  type GuardTarget,
} from "./verify-remote-consult-guard.ts";
import { LedgerWriter } from "./verify-remote-consult-ledger.ts";

export interface HarnessDeps {
  env: Record<string, string | undefined>;
  createClient: (config: { url: string; authToken?: string }) => Client;
  submit: SubmitFn;
  /** run별 디렉터리(원장·결과·로그)가 만들어지는 곳. 기본은 .moai/state/verify/remote. */
  stateRoot: string;
  migrationsDir: string;
  log: (line: string) => void;
  errorLog: (line: string) => void;
  /** 미지정이면 실제 자식 프로세스를 fork한다(T7). */
  launchWorker?: WorkerLauncher;
}

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");

function defaultDeps(): HarnessDeps {
  return {
    env: process.env,
    // 로컬 file: DB는 다른 연결이 잠근 동안 바로 SQLITE_BUSY를 내므로 짧게 기다리게 한다.
    // 원격(HTTP) 클라이언트는 이 옵션을 쓰지 않는다.
    createClient: (config) =>
      createClient(config.url.startsWith("file:") ? { ...config, timeout: 5000 } : config),
    submit: handleConsultationSubmit as SubmitFn,
    stateRoot: path.join(projectRoot, ".moai", "state", "verify", "remote"),
    migrationsDir: path.join(projectRoot, "db", "migrations"),
    log: (line) => console.log(line),
    errorLog: (line) => console.error(line),
  };
}

const USAGE = `사용법: verify-remote-consult.ts <명령> [플래그]

명령
  fingerprint                   TURSO_DATABASE_URL의 지문(sha256 앞 8자리)을 출력한다(연결 안 함)
  preflight                     쓰기 없음. 상담 테이블 존재·행 수·트리거·마이그레이션 행 수를 본다
  run [--run-id <id>]           T1~T7을 실행한다(T7은 서로 다른 두 프로세스가 같은 키를 동시에 제출하는
                                게이트). 원장·결과를 남기고 정리는 cleanup에 맡긴다
  cleanup --run-id <id>         원장이 가리키는 행만 정확히 지우고 BEFORE/AFTER 표를 출력한다
  revert-schema --confirm-revert-schema
                                0009 마이그레이션 되돌리기(빈 테이블만): 두 테이블과 0009 행 1개를 지운다

플래그
  --expect-fingerprint <8hex>   원격 URL이면 필수(모든 명령). fingerprint 명령으로 확인한다
  --allow-write-remote          원격에 쓰는 명령(run/cleanup/revert-schema)에 필수
  --run-id <id>                 소문자·숫자 4~12자(기본: 무작위 8자리)
  --window-room-ms <ms>         한 케이스의 요청을 60초 윈도 안에 몰기 위한 최소 잔여 시간(기본 ${DEFAULT_WINDOW_ROOM_MS})
  --simulate-latency-ms <ms>    run 전용, 로컬 file: 대상에서만(원격은 거부). T7 워커의 문장마다 왕복 지연을
                                모사한다(기본 0). 로컬 DB는 문장이 마이크로초에 끝나 두 프로세스의 경쟁 구간이
                                거의 생기지 않지만 원격은 실제 왕복 지연이 있어 이 옵션이 필요 없다
  --only <T7[,T3...]>           run 전용. 지정한 케이스만 실행한다(기본: T1~T7 전부). 앞 케이스가 남기는
                                로컬 잠금의 영향 없이 한 케이스만 다시 볼 때, 또는 원격에서 T7만 다시 돌릴 때 쓴다
  --confirm-revert-schema       revert-schema 확인 플래그
  -h, --help                    이 도움말

환경 변수(process.env에서만 읽는다 — .env* 파일은 읽지 않는다)
  TURSO_DATABASE_URL, TURSO_AUTH_TOKEN

종료 코드
  0 성공   1 실패(게이트 실패·정리 불일치·연결 실패 등)   2 가드/사전조건 거부(쓰기 없음)
  3 cleanup이 원장 행은 모두 지웠지만 총계가 baseline과 다름(원장에 없는 행이 있다는 뜻, 건드리지 않음)
`;

function parseCli(argv: string[]) {
  return parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      "run-id": { type: "string" },
      "expect-fingerprint": { type: "string" },
      "allow-write-remote": { type: "boolean" },
      "confirm-revert-schema": { type: "boolean" },
      "window-room-ms": { type: "string" },
      "simulate-latency-ms": { type: "string" },
      only: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
}

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function parseSimulatedLatency(raw: string | undefined): { ms: number } | { error: string } {
  if (raw === undefined) return { ms: 0 };
  const ms = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(ms) || ms < 0) {
    return { error: "--simulate-latency-ms는 0 이상의 숫자여야 합니다(쓰기 없음)." };
  }
  return { ms };
}

function parseOnly(raw: string | undefined): { ids: string[] | undefined } | { error: string } {
  if (raw === undefined) return { ids: undefined };
  const ids = raw.split(",").map((id) => id.trim().toUpperCase());
  const unknown = ids.filter((id) => !CASE_IDS.includes(id));
  if (ids.length === 0 || unknown.length > 0) {
    return {
      error: `--only는 ${CASE_IDS.join(", ")} 중에서 쉼표로 고릅니다(잘못된 값: ${unknown.join(", ") || "빈 값"}). 쓰기 없음.`,
    };
  }
  return { ids: [...new Set(ids)] };
}

function makeRedactor(target: GuardTarget, extra: readonly string[] = []) {
  const secrets = [target.url, hostOf(target.url), target.authToken ?? "", ...extra].filter(
    (s) => s.length > 0
  );
  return (text: string): string => redactText(text, secrets);
}

// --- 워커 fork ---------------------------------------------------------------------

const WORKER_TIMEOUT_MS = 120_000;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function forkWorker(opts: {
  env: Record<string, string | undefined>;
  secret: string;
  guardArgs: string[];
}): WorkerHandle {
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  for (const key of ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"] as const) {
    const value = opts.env[key];
    if (value !== undefined) childEnv[key] = value;
    else delete childEnv[key];
  }
  childEnv.VT_RATE_LIMIT_SECRET = opts.secret;

  const child = fork(scriptPath, ["worker", ...opts.guardArgs], {
    cwd: projectRoot,
    env: childEnv,
    execArgv: ["--import", pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href],
    stdio: ["ignore", "ignore", "inherit", "ipc"],
  });

  const ready = deferred<void>();
  const result = deferred<WorkerResult>();
  const fail = (error: Error): void => {
    ready.reject(error);
    result.reject(error);
  };
  // 아직 아무도 기다리지 않을 때의 unhandledRejection을 막는다.
  ready.promise.catch(() => {});
  result.promise.catch(() => {});

  child.on("message", (message: unknown) => {
    const m = message as {
      type?: string;
      status?: number;
      bodyText?: string;
      durationMs?: number;
      message?: string;
    };
    if (m.type === "ready") ready.resolve();
    else if (m.type === "result") {
      result.resolve({
        status: Number(m.status),
        bodyText: String(m.bodyText ?? ""),
        ...(typeof m.durationMs === "number" ? { durationMs: m.durationMs } : {}),
      });
    } else if (m.type === "error") fail(new Error(`워커 오류: ${m.message ?? ""}`));
  });
  child.on("error", (error) => fail(error));
  child.on("exit", (code) => fail(new Error(`워커가 결과 없이 종료했습니다(코드 ${code}).`)));

  const withTimeout = <T>(promise: Promise<T>, what: string): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`워커 ${what} 대기 시간 초과`));
      }, WORKER_TIMEOUT_MS);
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error: unknown) => {
          clearTimeout(timer);
          reject(error);
        }
      );
    });

  return {
    ready: () => withTimeout(ready.promise, "준비"),
    start: (job) => {
      child.send({ type: "start", job });
    },
    result: () => withTimeout(result.promise, "결과"),
    kill: () => {
      if (!child.killed && child.exitCode === null) child.kill();
    },
  };
}

// --- 명령 구현 ---------------------------------------------------------------------

interface Session {
  readonly deps: HarnessDeps;
  readonly target: GuardTarget;
  readonly client: Client;
  readonly redact: (text: string) => string;
}

async function withClient(
  deps: HarnessDeps,
  target: GuardTarget,
  fn: (session: Session) => Promise<number>
): Promise<number> {
  const redact = makeRedactor(target);
  let client: Client | undefined;
  try {
    client = deps.createClient({ url: target.url, authToken: target.authToken });
    return await fn({ deps, target, client, redact });
  } catch (error) {
    deps.errorLog(`[verify-remote-consult] 실패: ${redact(describeError(error))}`);
    return 1;
  } finally {
    client?.close();
  }
}

function describeTarget(target: GuardTarget): string {
  return `대상: ${target.masked} (스킴 ${target.scheme}, 지문 ${target.fingerprint})`;
}

async function preflightCommand(session: Session): Promise<number> {
  const { client, deps, target } = session;
  deps.log(describeTarget(target));
  await client.execute("SELECT 1");

  const status = await readTableStatus(client);
  let allPresent = true;
  for (const table of ["consultations", "consultation_rate_limits"] as const) {
    if (status[table]) {
      deps.log(`${table}: 존재, 행 ${await countTable(client, table)}개`);
    } else {
      allPresent = false;
      deps.log(`${table}: 없음`);
    }
  }
  const triggers = await client.execute(
    "SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'consultation_rate_limits'"
  );
  deps.log(
    `consultation_rate_limits의 트리거: ${
      triggers.rows.length === 0 ? "(없음)" : triggers.rows.map((r) => String(r.name)).join(", ")
    }`
  );
  const hasMigrations = await client.execute(
    "SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'"
  );
  if (Number(hasMigrations.rows[0]?.c ?? 0) > 0) {
    const rows = await client.execute("SELECT COUNT(*) AS c FROM __drizzle_migrations");
    deps.log(`__drizzle_migrations 행 수: ${Number(rows.rows[0]?.c ?? 0)}`);
  } else {
    deps.log("__drizzle_migrations: 없음");
  }
  return allPresent ? 0 : 1;
}

function formatValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function printCase(log: (line: string) => void, result: CaseResult): void {
  log(`${result.id} [${result.status}] ${result.title}${result.gate ? "" : " (게이트 아님)"}`);
  for (const check of result.checks) {
    log(
      `  ${check.pass ? "ok" : "NO"}  ${check.name}: 기대 ${formatValue(check.expected)} / 관측 ${formatValue(check.observed)}`
    );
  }
  for (const note of result.notes) log(`  참고: ${note}`);
  if (result.error) log(`  오류: ${result.error}`);
}

async function runCommand(
  session: Session,
  flags: GuardFlags,
  values: { "run-id"?: string; "window-room-ms"?: string },
  simulateLatencyMs: number,
  onlyCases?: string[]
): Promise<number> {
  const { client, deps, target, redact } = session;

  const runId = values["run-id"] ?? randomBytes(4).toString("hex");
  if (!isValidRunId(runId)) {
    deps.errorLog("[run] 거부: --run-id는 소문자·숫자 4~12자여야 합니다.");
    return 2;
  }
  const windowRoomMs =
    values["window-room-ms"] === undefined
      ? DEFAULT_WINDOW_ROOM_MS
      : Number(values["window-room-ms"]);
  if (!Number.isFinite(windowRoomMs) || windowRoomMs < 0) {
    deps.errorLog("[run] 거부: --window-room-ms는 0 이상의 숫자여야 합니다.");
    return 2;
  }

  // 사전조건 — 쓰기 전에 모두 확인한다.
  deps.log(describeTarget(target));
  const status = await readTableStatus(client);
  if (!status.consultations || !status.consultation_rate_limits) {
    deps.errorLog("[run] 중단: 두 상담 테이블이 모두 있어야 합니다(쓰기 없음).");
    return 2;
  }
  const baseline = {
    consultations: await countTable(client, "consultations"),
    consultation_rate_limits: await countTable(client, "consultation_rate_limits"),
  };
  if (baseline.consultations !== 0 || baseline.consultation_rate_limits !== 0) {
    deps.errorLog(
      `[run] 중단: 두 테이블이 모두 비어 있어야 합니다(consultations ${baseline.consultations}, ` +
        `consultation_rate_limits ${baseline.consultation_rate_limits}). 쓰기 없음. ` +
        `이전 실행이 남긴 행이면 그 실행의 cleanup --run-id <이전 id>를 먼저 하세요.`
    );
    return 2;
  }
  const leftoverTriggers = await client.execute(
    "SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name IN ('consultations', 'consultation_rate_limits')"
  );
  if (leftoverTriggers.rows.length > 0) {
    deps.errorLog(
      `[run] 중단: 상담 테이블에 트리거가 ${leftoverTriggers.rows.length}개 남아 있습니다. ` +
        `이전 실행의 cleanup --run-id <이전 id>로 정리한 뒤 다시 실행하세요(쓰기 없음).`
    );
    return 2;
  }
  const runDir = path.join(deps.stateRoot, runId);
  if (existsSync(path.join(runDir, "ledger.json"))) {
    deps.errorLog("[run] 거부: 이미 사용한 --run-id입니다. 새 값을 쓰세요(쓰기 없음).");
    return 2;
  }

  const secret = randomBytes(32).toString("hex");
  const redactAll = (text: string): string => redactText(redact(text), [secret]);
  mkdirSync(runDir, { recursive: true });
  const logPath = path.join(runDir, "run.log");
  const log = (line: string): void => {
    const safe = redactAll(line);
    deps.log(safe);
    appendFileSync(logPath, `${safe}\n`);
  };
  log(`run-id: ${runId}  (정리: cleanup --run-id ${runId})`);

  const ledger = new LedgerWriter(runDir, {
    runId,
    fingerprint: target.fingerprint,
    baseline,
    name: `가상테스트-${runId}`,
  });

  const guardArgs: string[] = [];
  if (flags.expectFingerprint) guardArgs.push("--expect-fingerprint", flags.expectFingerprint);
  if (flags.allowWriteRemote) guardArgs.push("--allow-write-remote");
  if (simulateLatencyMs > 0) {
    guardArgs.push("--simulate-latency-ms", String(simulateLatencyMs));
    log(`T7 워커 왕복 지연 모사: 문장당 ${simulateLatencyMs}ms (로컬 file: 전용)`);
  }

  const db = drizzle(client, { schema }) as Db;
  const ctx = createCaseContext({
    client,
    db,
    runId,
    secret,
    ledger,
    submit: deps.submit,
    launchWorker: deps.launchWorker ?? (() => forkWorker({ env: deps.env, secret, guardArgs })),
    windowRoomMs,
    log,
    redactions: [target.url, hostOf(target.url), target.authToken ?? ""],
  });

  const startedAt = new Date().toISOString();
  const cases: CaseResult[] = [];
  const writeResults = (finished: boolean): void => {
    const gateCases = cases.filter((c) => c.gate);
    const gateFailed = gateCases.some((c) => c.status !== "PASS");
    writeFileSync(
      path.join(runDir, "results.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          runId,
          finished,
          startedAt,
          finishedAt: finished ? new Date().toISOString() : null,
          target: { scheme: target.scheme, host: target.masked, fingerprint: target.fingerprint },
          baseline,
          windowRoomMs,
          cases,
          gates: {
            total: gateCases.length,
            passed: gateCases.filter((c) => c.status === "PASS").length,
          },
          gateFailed,
        },
        null,
        2
      )
    );
  };
  writeResults(false);

  if (onlyCases) log(`선택 실행: ${onlyCases.join(", ")} (나머지 케이스는 이번 실행에서 건너뜀)`);
  await runAllCases(
    ctx,
    (result) => {
      cases.push(result);
      writeResults(false);
      printCase(log, result);
    },
    onlyCases
  );
  writeResults(true);

  const gateCases = cases.filter((c) => c.gate);
  const failed = gateCases.filter((c) => c.status !== "PASS");
  log(
    `게이트 ${gateCases.length - failed.length}/${gateCases.length} 통과` +
      (failed.length > 0 ? ` — 실패: ${failed.map((c) => c.id).join(", ")}` : "")
  );
  log(`결과: ${path.join(runDir, "results.json")}`);
  log(`다음 단계: cleanup --run-id ${runId}`);
  return failed.length > 0 ? 1 : 0;
}

async function workerCommand(
  deps: HarnessDeps,
  target: GuardTarget,
  send: ((message: unknown) => Promise<void>) | undefined,
  simulateLatencyMs: number
): Promise<number> {
  const secret = deps.env.VT_RATE_LIMIT_SECRET;
  if (!secret || !send) {
    deps.errorLog("[worker] 내부 명령입니다 — run이 fork로만 띄웁니다.");
    return 2;
  }
  let client: Client | undefined;
  try {
    client = deps.createClient({ url: target.url, authToken: target.authToken });
    // 지연은 라우트가 쓰는 db에만 씌운다 — 워커의 준비·결과 전송 자체는 그대로다.
    const db = drizzle(withSimulatedLatency(client, simulateLatencyMs), { schema }) as Db;
    return await runWorker({
      client,
      db,
      submit: deps.submit,
      secret,
      io: {
        send,
        onMessage: (handler) => {
          process.on("message", handler);
        },
      },
    });
  } finally {
    client?.close();
  }
}

// --- 진입점 ------------------------------------------------------------------------

export async function main(argv: string[], overrides: Partial<HarnessDeps> = {}): Promise<number> {
  const deps: HarnessDeps = { ...defaultDeps(), ...overrides };

  let parsed: ReturnType<typeof parseCli>;
  try {
    parsed = parseCli(argv);
  } catch (error) {
    deps.errorLog(`[verify-remote-consult] ${describeError(error)}\n\n${USAGE}`);
    return 2;
  }
  const { values, positionals } = parsed;
  const command = positionals[0];

  if (values.help || command === undefined) {
    deps.log(USAGE);
    return values.help ? 0 : 2;
  }

  const flags: GuardFlags = {
    expectFingerprint: values["expect-fingerprint"],
    allowWriteRemote: values["allow-write-remote"] === true,
  };
  const writes =
    command === "run" ||
    command === "cleanup" ||
    command === "revert-schema" ||
    command === "worker";

  if (
    !["fingerprint", "preflight", "run", "cleanup", "revert-schema", "worker"].includes(command)
  ) {
    deps.errorLog(`[verify-remote-consult] 알 수 없는 명령: ${command}\n\n${USAGE}`);
    return 2;
  }

  if (command === "fingerprint") {
    const url = deps.env.TURSO_DATABASE_URL?.trim();
    if (!url) {
      deps.errorLog("[verify-remote-consult] TURSO_DATABASE_URL이 비어 있습니다.");
      return 2;
    }
    // 연결하지 않고 지문만 계산한다 — 호스트는 가려서만 보여 준다.
    const scheme = urlScheme(url);
    deps.log(
      `대상: ${scheme === "file:" ? "로컬 파일" : maskHost(url)} (스킴 ${scheme}) 지문 ${fingerprintOf(url)}`
    );
    return 0;
  }

  if (command === "revert-schema" && values["confirm-revert-schema"] !== true) {
    deps.errorLog("[revert-schema] 거부: --confirm-revert-schema 플래그가 필요합니다(쓰기 없음).");
    return 2;
  }
  if (command === "cleanup" && !values["run-id"]) {
    deps.errorLog("[cleanup] 거부: --run-id가 필요합니다(쓰기 없음).");
    return 2;
  }

  const guard = evaluateGuard(deps.env, flags, { writes });
  if (!guard.ok) {
    deps.errorLog(guard.message);
    return guard.exitCode;
  }
  const target = guard.target;

  // 지연 모사는 로컬 file: 대상의 run(과 그 워커)에서만 뜻이 있다 — 원격은 실제 왕복 지연이 있어
  // 더 얹으면 관측을 흐릴 뿐이라 클라이언트를 만들기 전에 거부한다.
  const latency = parseSimulatedLatency(values["simulate-latency-ms"]);
  if ("error" in latency) {
    deps.errorLog(`[verify-remote-consult] ${latency.error}`);
    return 2;
  }
  if (latency.ms > 0 && command !== "run" && command !== "worker") {
    deps.errorLog(
      "[verify-remote-consult] 거부: --simulate-latency-ms는 run 전용입니다(쓰기 없음)."
    );
    return 2;
  }
  if (latency.ms > 0 && target.isRemote) {
    deps.errorLog(
      "[run] 거부: --simulate-latency-ms는 로컬 file: 대상에서만 쓸 수 있습니다. 원격은 실제 왕복 지연이 있습니다(쓰기 없음)."
    );
    return 2;
  }

  const only = parseOnly(values.only);
  if ("error" in only) {
    deps.errorLog(`[verify-remote-consult] ${only.error}`);
    return 2;
  }
  if (only.ids && command !== "run") {
    deps.errorLog("[verify-remote-consult] 거부: --only는 run 전용입니다(쓰기 없음).");
    return 2;
  }

  if (command === "worker") {
    const ipcSend = process.send
      ? (message: unknown) =>
          new Promise<void>((resolve, reject) => {
            process.send?.(message, (error: Error | null) => (error ? reject(error) : resolve()));
          })
      : undefined;
    return workerCommand(deps, target, ipcSend, latency.ms);
  }

  return withClient(deps, target, async (session) => {
    switch (command) {
      case "preflight":
        return preflightCommand(session);
      case "run":
        return runCommand(session, flags, values, latency.ms, only.ids);
      case "cleanup": {
        const runId = values["run-id"] as string;
        if (!isValidRunId(runId)) {
          deps.errorLog("[cleanup] 거부: --run-id 형식이 올바르지 않습니다.");
          return 2;
        }
        return runCleanup({
          client: session.client,
          runDir: path.join(deps.stateRoot, runId),
          runId,
          fingerprint: target.fingerprint,
          log: (line) => deps.log(session.redact(line)),
        });
      }
      default:
        return runRevertSchema({
          client: session.client,
          migrationsDir: deps.migrationsDir,
          log: (line) => deps.log(session.redact(line)),
        });
    }
  });
}

const isDirectExecution =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  void main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
    // fork된 워커는 IPC 채널이 열려 있으면 종료하지 못한다.
    if (process.connected) process.disconnect();
  });
}
