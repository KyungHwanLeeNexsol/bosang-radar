// SPEC-B2C-CONSULT-001 Group 3a — 원격 검증 하네스의 케이스(T1~T7)와 워커.
//
// 이 파일의 케이스는 라우트를 handleConsultationSubmit(request, db, injectedEnv)로만 부른다:
// process.env를 바꾸지 않고, 배포된 앱에는 요청을 보내지 않는다. 하네스는 실패를 "고치지"
// 않는다 — 기대값과 관측값을 나란히 기록만 한다.

import { createHmac } from "node:crypto";
import type { Client } from "@libsql/client";
import type { drizzle } from "drizzle-orm/libsql";
import { NextRequest } from "next/server";
import { CONSENT_POLICY_VERSION } from "../lib/consult/consent-policy.ts";
import type * as schema from "../lib/db/schema.ts";
import { consultationRateLimits } from "../lib/db/schema.ts";
import type { LedgerConsultation, LedgerWriter } from "./verify-remote-consult-ledger.ts";

export type Db = ReturnType<typeof drizzle<typeof schema>>;
export type InjectedEnv = Record<string, string | undefined>;
export type SubmitFn = (request: NextRequest, db: Db, env: InjectedEnv) => Promise<Response>;

export const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const DEFAULT_WINDOW_ROOM_MS = 20_000;
export { DEFAULT_WINDOW_ROOM_MS };

// --- 워커(T7) 계약 -----------------------------------------------------------------

export interface WorkerJob {
  readonly body: unknown;
  readonly ip: string;
  readonly barrierAtMs: number;
}

export interface WorkerResult {
  readonly status: number;
  readonly bodyText: string;
}

export interface WorkerHandle {
  ready(): Promise<void>;
  start(job: WorkerJob): void;
  result(): Promise<WorkerResult>;
  kill(): void;
}

export type WorkerLauncher = () => WorkerHandle;

// --- 결과 형식 ---------------------------------------------------------------------

export interface Check {
  readonly name: string;
  readonly expected: unknown;
  readonly observed: unknown;
  readonly pass: boolean;
}

export interface RequestRecord {
  readonly label: string;
  readonly ip: string;
  readonly status: number;
  readonly body: unknown;
  readonly bodyText?: string;
  readonly error?: string;
}

export interface RowCounts {
  readonly consultations: number;
  readonly consultation_rate_limits: number;
}

export interface CaseResult {
  readonly id: string;
  readonly title: string;
  readonly gate: boolean;
  readonly status: "PASS" | "FAIL" | "INFO" | "ERROR";
  readonly checks: Check[];
  readonly requests: RequestRecord[];
  readonly rowCounts: RowCounts | null;
  readonly notes: string[];
  readonly error?: string;
}

// --- 컨텍스트 ----------------------------------------------------------------------

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export interface CaseContextInit {
  readonly client: Client;
  readonly db: Db;
  readonly runId: string;
  readonly secret: string;
  readonly ledger: LedgerWriter;
  readonly submit: SubmitFn;
  readonly launchWorker: WorkerLauncher;
  readonly windowRoomMs: number;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly log?: (line: string) => void;
  /** 에러 메시지에서 가릴 문자열(URL·호스트·토큰 등). 시크릿은 자동으로 포함된다. */
  readonly redactions?: readonly string[];
}

export interface CaseContext {
  readonly client: Client;
  readonly db: Db;
  readonly runId: string;
  readonly secret: string;
  readonly ledger: LedgerWriter;
  readonly submit: SubmitFn;
  readonly launchWorker: WorkerLauncher;
  readonly windowRoomMs: number;
  readonly clock: Clock;
  readonly log: (line: string) => void;
  readonly name: string;
  readonly env: InjectedEnv;
  redact(text: string): string;
  nextSeq(): number;
}

export function createCaseContext(init: CaseContextInit): CaseContext {
  let seq = 0;
  const redactions = [init.secret, ...(init.redactions ?? [])].filter((s) => s.length > 0);
  return {
    client: init.client,
    db: init.db,
    runId: init.runId,
    secret: init.secret,
    ledger: init.ledger,
    submit: init.submit,
    launchWorker: init.launchWorker,
    windowRoomMs: init.windowRoomMs,
    clock: {
      now: init.now ?? Date.now,
      sleep: init.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    },
    log: init.log ?? (() => {}),
    name: `가상테스트-${init.runId}`,
    // 라우트에 주입하는 env — 정책 준비 + 이번 실행의 무작위 HMAC 시크릿. process.env는 건드리지 않는다.
    env: { CONSULT_POLICY_READY: "true", RATE_LIMIT_HMAC_SECRET: init.secret },
    redact: (text) => {
      let out = text;
      for (const secret of redactions) out = out.split(secret).join("***");
      return out;
    },
    nextSeq: () => ++seq,
  };
}

// --- 순수 헬퍼 ---------------------------------------------------------------------

/** 라우트와 같은 식: HMAC-SHA256(secret, trustedIp) hex. */
export function computeIpHmac(secret: string, ip: string): string {
  return createHmac("sha256", secret).update(ip).digest("hex");
}

export function windowStartOf(nowMs: number): number {
  return Math.floor(nowMs / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_WINDOW_MS;
}

/**
 * 현재 60초 윈도에 minRoomMs 이상 남을 때까지 기다린 뒤 그 윈도의 시작(ms)을 돌려준다 —
 * 한 케이스의 모든 요청이 한 윈도에 들어가게 해서 카운터 해석이 흔들리지 않게 한다.
 */
export async function waitForWindowRoom(minRoomMs: number, clock: Clock): Promise<number> {
  const room = Math.min(Math.max(minRoomMs, 0), RATE_LIMIT_WINDOW_MS - 1);
  while (RATE_LIMIT_WINDOW_MS - (clock.now() % RATE_LIMIT_WINDOW_MS) < room) {
    await clock.sleep(250);
  }
  return windowStartOf(clock.now());
}

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

function isServerError(record: RequestRecord): boolean {
  return record.status === 0 || record.status >= 500;
}

function isAccepted(record: RequestRecord): boolean {
  return record.status >= 200 && record.status < 300;
}

function bodyCode(record: RequestRecord): unknown {
  return typeof record.body === "object" && record.body !== null
    ? (record.body as { code?: unknown }).code
    : undefined;
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// --- 결과 빌더 ---------------------------------------------------------------------

class CaseBuilder {
  readonly checks: Check[] = [];
  readonly requests: RequestRecord[] = [];
  readonly notes: string[] = [];
  private failure: string | undefined;

  constructor(
    private readonly ctx: CaseContext,
    readonly id: string,
    readonly title: string,
    readonly gate: boolean
  ) {}

  check(name: string, expected: unknown, observed: unknown, pass?: boolean): void {
    this.checks.push({ name, expected, observed, pass: pass ?? sameJson(expected, observed) });
  }

  /** 기대값 없이 관측만 남긴다(특성화 케이스). */
  info(name: string, observed: unknown): void {
    this.checks.push({ name, expected: "(관찰만)", observed, pass: true });
  }

  note(text: string): void {
    this.notes.push(this.ctx.redact(text));
  }

  fail(error: unknown): void {
    this.failure = this.ctx.redact(describeError(error));
  }

  async finish(): Promise<CaseResult> {
    let rowCounts: RowCounts | null = null;
    try {
      rowCounts = await readRowCounts(this.ctx);
    } catch {
      this.note("케이스 종료 후 행 수를 읽지 못했습니다.");
    }
    let status: CaseResult["status"];
    if (this.failure !== undefined) status = "ERROR";
    else if (!this.gate) status = "INFO";
    else status = this.checks.every((c) => c.pass) ? "PASS" : "FAIL";
    return {
      id: this.id,
      title: this.title,
      gate: this.gate,
      status,
      checks: this.checks,
      requests: this.requests,
      rowCounts,
      notes: this.notes,
      ...(this.failure !== undefined ? { error: this.failure } : {}),
    };
  }
}

// --- DB 조회 -----------------------------------------------------------------------

async function scalar(
  ctx: CaseContext,
  sql: string,
  args: (string | number)[] = []
): Promise<number> {
  const result = await ctx.client.execute({ sql, args });
  return Number(result.rows[0]?.c ?? 0);
}

const SETTLE_LIMIT_MS = 10_000;

/**
 * 앞 케이스가 남긴 잠금(특히 로컬 file: DB에서 동시 트랜잭션이 실패한 뒤의 잔여 연결)이 풀릴
 * 때까지 기다린다 — 다음 케이스가 앞 케이스의 잔여물이 아니라 자기 동작만 관측하게 한다.
 * 행을 만들지 않는 빈 쓰기 트랜잭션(BEGIN IMMEDIATE → ROLLBACK)만 쓴다. 기다린 ms를 돌려준다.
 */
export async function settleDatabase(ctx: CaseContext): Promise<number> {
  const startedAt = ctx.clock.now();
  for (;;) {
    try {
      const tx = await ctx.client.transaction("write");
      await tx.rollback();
      tx.close();
      return ctx.clock.now() - startedAt;
    } catch {
      if (ctx.clock.now() - startedAt > SETTLE_LIMIT_MS) return ctx.clock.now() - startedAt;
      await ctx.clock.sleep(250);
    }
  }
}

async function settle(ctx: CaseContext, c: CaseBuilder): Promise<void> {
  const waited = await settleDatabase(ctx);
  if (waited >= 250) c.note(`직전 케이스의 잔여 쓰기 잠금이 풀리기를 ${waited}ms 기다렸다.`);
}

export async function readRowCounts(ctx: CaseContext): Promise<RowCounts> {
  return {
    consultations: await scalar(ctx, "SELECT COUNT(*) AS c FROM consultations"),
    consultation_rate_limits: await scalar(
      ctx,
      "SELECT COUNT(*) AS c FROM consultation_rate_limits"
    ),
  };
}

interface RateRow {
  readonly windowStartMs: number;
  readonly requestCount: number;
}

async function readRateRows(ctx: CaseContext, ipHmac: string): Promise<RateRow[]> {
  const result = await ctx.client.execute({
    sql: "SELECT window_start, request_count FROM consultation_rate_limits WHERE ip_hmac = ? ORDER BY window_start",
    args: [ipHmac],
  });
  return result.rows.map((row) => ({
    windowStartMs: Number(row.window_start) * 1000,
    requestCount: Number(row.request_count),
  }));
}

async function countConsultationsByKeys(
  ctx: CaseContext,
  keys: readonly string[]
): Promise<number> {
  if (keys.length === 0) return 0;
  const placeholders = keys.map(() => "?").join(", ");
  return scalar(
    ctx,
    `SELECT COUNT(*) AS c FROM consultations WHERE idempotency_key IN (${placeholders})`,
    [...keys]
  );
}

async function triggerCount(ctx: CaseContext, triggerName: string): Promise<number> {
  return scalar(
    ctx,
    "SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'trigger' AND name = ?",
    [triggerName]
  );
}

// --- 요청 조립·호출 ----------------------------------------------------------------

interface BuiltPayload {
  readonly body: Record<string, unknown>;
  readonly entry: LedgerConsultation;
}

function buildPayload(ctx: CaseContext, caseId: string, index: number): BuiltPayload {
  const digits = String(ctx.nextSeq()).padStart(4, "0");
  const resultId = `vt-${ctx.runId}-${caseId}-${index}`;
  const idempotencyKey = `${resultId}-k`;
  return {
    body: {
      resultId,
      channel: "kakao",
      name: ctx.name,
      // 가운데 그룹 0000은 실제 가입자에게 배정되지 않는 번호 대역이다.
      contact: `010-0000-${digits}`,
      consent: { piiCollection: true, healthInfoUse: true, marketing: false },
      acknowledgedConsentVersion: CONSENT_POLICY_VERSION,
      idempotencyKey,
    },
    entry: {
      caseId,
      idempotencyKey,
      resultId,
      contactNormalized: `0100000${digits}`,
    },
  };
}

function buildRequest(body: unknown, ip: string): NextRequest {
  return new NextRequest("http://localhost/api/consultations", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

/** 워커와 케이스가 함께 쓰는 단일 호출 — 예외는 status 0 기록으로 바꾼다. */
export async function performRouteCall(
  submit: SubmitFn,
  db: Db,
  env: InjectedEnv,
  body: unknown,
  ip: string
): Promise<{ status: number; bodyText: string; error?: string }> {
  try {
    const response = await submit(buildRequest(body, ip), db, env);
    return { status: response.status, bodyText: await response.text() };
  } catch (error) {
    return { status: 0, bodyText: "", error: describeError(error) };
  }
}

function toRecord(
  ctx: CaseContext,
  label: string,
  ip: string,
  outcome: { status: number; bodyText: string; error?: string }
): RequestRecord {
  let parsed: unknown = null;
  try {
    parsed = outcome.bodyText ? JSON.parse(outcome.bodyText) : null;
  } catch {
    parsed = null;
  }
  return {
    label,
    ip,
    status: outcome.status,
    body: parsed,
    bodyText: outcome.bodyText,
    ...(outcome.error ? { error: ctx.redact(outcome.error) } : {}),
  };
}

async function callRoute(
  ctx: CaseContext,
  label: string,
  body: unknown,
  ip: string
): Promise<RequestRecord> {
  return toRecord(ctx, label, ip, await performRouteCall(ctx.submit, ctx.db, ctx.env, body, ip));
}

/** 이 IP의 rate-limit 행을 원장에 미리 올린다(현재 윈도와 다음 윈도 — 경계 침범 방어). */
function registerIp(ctx: CaseContext, caseId: string, ip: string, windowStartMs: number): string {
  const ipHmac = computeIpHmac(ctx.secret, ip);
  ctx.ledger.addRateLimits([
    { caseId, kind: "route", windowStartMs, ipHmac },
    { caseId, kind: "route", windowStartMs: windowStartMs + RATE_LIMIT_WINDOW_MS, ipHmac },
  ]);
  return ipHmac;
}

function farFutureWindowMs(ctx: CaseContext): number {
  return Math.floor((ctx.clock.now() + 10 * 365 * 24 * 3600 * 1000) / 1000) * 1000;
}

const toSeconds = (ms: number): number => Math.floor(ms / 1000);

// --- 원격 왕복 지연 모사(T7 워커 전용) ----------------------------------------------

type AnyFn = (...args: unknown[]) => unknown;

// Sqlite3Client/Sqlite3Transaction의 메서드는 ES 비공개 필드를 쓰므로 Proxy를 거치면 this가 깨진다 —
// 모든 함수 프로퍼티를 실제 target에 bind해 돌려준다(route.test.ts의 직렬화 큐 Proxy와 같은 이유).
function delayMethods<T extends object>(
  target: T,
  delayedNames: readonly string[],
  pause: () => Promise<void>,
  overrides: Record<string, AnyFn> = {}
): T {
  return new Proxy(target, {
    get(t, prop) {
      if (typeof prop === "string" && prop in overrides) return overrides[prop];
      const value = Reflect.get(t, prop, t);
      if (typeof value !== "function") return value;
      const bound = (value as AnyFn).bind(t);
      if (typeof prop === "string" && delayedNames.includes(prop)) {
        return async (...args: unknown[]) => {
          await pause();
          return bound(...args);
        };
      }
      return bound;
    },
  });
}

/**
 * 클라이언트의 문장·트랜잭션 왕복마다 latencyMs만큼 지연을 둔다. 원격(HTTP)은 문장마다 네트워크
 * 왕복이 있어 두 프로세스가 둘 다 "조회만 끝낸" 상태로 겹칠 수 있지만, 로컬 file: DB는 문장이
 * 마이크로초에 끝나 먼저 온 프로세스가 전부 끝낸 뒤에야 다른 쪽이 조회하므로 그 겹침이 거의 생기지
 * 않는다(수정 전 코드로 관측). T7 워커에만 씌워 로컬에서도 같은 경쟁 구간을 열어 두는 데 쓴다.
 * 지연 0 이하면 원본을 그대로 돌려준다.
 */
export function withSimulatedLatency(client: Client, latencyMs: number): Client {
  if (!(latencyMs > 0)) return client;
  const pause = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, latencyMs));
  return delayMethods(client, ["execute", "batch", "executeMultiple"], pause, {
    transaction: async (...args: unknown[]) => {
      await pause();
      const tx = await (client.transaction as AnyFn).apply(client, args);
      return delayMethods(
        tx as object,
        ["execute", "batch", "executeMultiple", "commit", "rollback"],
        pause
      );
    },
  });
}

// --- T1: 커밋 ----------------------------------------------------------------------

export async function runCommitCase(ctx: CaseContext): Promise<CaseResult> {
  const c = new CaseBuilder(ctx, "T1", "직접 트랜잭션 커밋 → 커밋 뒤 마커 행이 보인다", true);
  try {
    const ipHmac = `vt-${ctx.runId}-t1-commit`;
    const windowStartMs = farFutureWindowMs(ctx);
    ctx.ledger.addRateLimits([{ caseId: "T1", kind: "marker", windowStartMs, ipHmac }]);

    await ctx.db.transaction(async (tx) => {
      await tx
        .insert(consultationRateLimits)
        .values({ windowStart: new Date(windowStartMs), ipHmac, requestCount: 1 });
    });

    const visible = await scalar(
      ctx,
      "SELECT COUNT(*) AS c FROM consultation_rate_limits WHERE window_start = ? AND ip_hmac = ?",
      [toSeconds(windowStartMs), ipHmac]
    );
    c.check("커밋 뒤 마커 행 수", 1, visible);
  } catch (error) {
    c.fail(error);
  }
  return c.finish();
}

// --- T2: 롤백 ----------------------------------------------------------------------

export async function runRollbackCase(ctx: CaseContext): Promise<CaseResult> {
  const c = new CaseBuilder(ctx, "T2", "직접 트랜잭션 롤백 → 예외 뒤 마커 행이 없다", true);
  try {
    const ipHmac = `vt-${ctx.runId}-t2-rollback`;
    const windowStartMs = farFutureWindowMs(ctx);
    ctx.ledger.addRateLimits([{ caseId: "T2", kind: "marker", windowStartMs, ipHmac }]);

    let thrown: unknown = null;
    try {
      await ctx.db.transaction(async (tx) => {
        await tx
          .insert(consultationRateLimits)
          .values({ windowStart: new Date(windowStartMs), ipHmac, requestCount: 1 });
        throw new Error("vt-rollback");
      });
    } catch (error) {
      thrown = error;
    }
    c.check(
      "트랜잭션이 주입한 예외로 거부됨",
      true,
      thrown instanceof Error && thrown.message.includes("vt-rollback")
    );

    const left = await scalar(
      ctx,
      "SELECT COUNT(*) AS c FROM consultation_rate_limits WHERE window_start = ? AND ip_hmac = ?",
      [toSeconds(windowStartMs), ipHmac]
    );
    c.check("롤백 뒤 마커 행 수", 0, left);
  } catch (error) {
    c.fail(error);
  }
  return c.finish();
}

// --- T3: 라우트 DB 실패 + 롤백 + 재시도 --------------------------------------------

export async function runTriggerCase(ctx: CaseContext): Promise<CaseResult> {
  const c = new CaseBuilder(
    ctx,
    "T3",
    "라우트 DB 실패 → 롤백(카운터 미소비) → 같은 요청 재시도 성공",
    true
  );
  const triggerName = `vt_${ctx.runId}_block_delete`;
  const expiredHmac = `vt-${ctx.runId}-expired`;
  const dropTrigger = () => ctx.client.execute(`DROP TRIGGER IF EXISTS ${triggerName}`);

  try {
    await settle(ctx, c);
    const windowStartMs = await waitForWindowRoom(ctx.windowRoomMs, ctx.clock);
    const ip = "198.51.100.11";
    const ipHmac = registerIp(ctx, "T3", ip, windowStartMs);
    const { body, entry } = buildPayload(ctx, "t3", 0);
    const expiredSeconds = toSeconds(ctx.clock.now() - 2 * 3600 * 1000);

    // 모든 쓰기 전에 원장에 올린다.
    ctx.ledger.addRateLimits([
      {
        caseId: "T3",
        kind: "seed-expired",
        windowStartMs: expiredSeconds * 1000,
        ipHmac: expiredHmac,
      },
    ]);
    ctx.ledger.addConsultation(entry);
    ctx.ledger.setTrigger(triggerName);

    try {
      await ctx.client.execute({
        sql: "INSERT INTO consultation_rate_limits (window_start, ip_hmac, request_count) VALUES (?, ?, 1)",
        args: [expiredSeconds, expiredHmac],
      });
      c.check(
        "만료 시드 행 삽입",
        1,
        await scalar(ctx, "SELECT COUNT(*) AS c FROM consultation_rate_limits WHERE ip_hmac = ?", [
          expiredHmac,
        ])
      );

      // WHEN 절이 시드 행 하나로만 좁혀서 다른 어떤 DELETE도 막지 않는다.
      await ctx.client.execute(
        `CREATE TRIGGER ${triggerName} BEFORE DELETE ON consultation_rate_limits ` +
          `WHEN OLD.ip_hmac LIKE '${expiredHmac}%' ` +
          `BEGIN SELECT RAISE(ABORT, 'vt-injected'); END`
      );

      const failed = await callRoute(ctx, "실패 유도 호출", body, ip);
      c.requests.push(failed);
      c.check(
        "실패 호출은 500 server_error",
        { status: 500, code: "server_error" },
        { status: failed.status, code: bodyCode(failed) }
      );
      c.check(
        "실패 뒤 rate-limit 행 수(카운터 미소비)",
        0,
        (await readRateRows(ctx, ipHmac)).length
      );
      c.check("실패 뒤 상담 행 수", 0, await countConsultationsByKeys(ctx, [entry.idempotencyKey]));

      await dropTrigger();
      c.check("재시도 전 트리거 없음", 0, await triggerCount(ctx, triggerName));

      const retried = await callRoute(ctx, "같은 요청 재시도", body, ip);
      c.requests.push(retried);
      c.check("재시도는 2xx", true, isAccepted(retried), isAccepted(retried));
      const counter = (await readRateRows(ctx, ipHmac)).reduce((sum, r) => sum + r.requestCount, 0);
      c.check("재시도 뒤 request_count(1이어야 하고 2면 이중 소비)", 1, counter);
      c.check(
        "재시도 뒤 상담 행 수",
        1,
        await countConsultationsByKeys(ctx, [entry.idempotencyKey])
      );
      c.info(
        "재시도 뒤 만료 시드 행 수(라우트의 보관기간 DELETE가 지웠으면 0)",
        await scalar(ctx, "SELECT COUNT(*) AS c FROM consultation_rate_limits WHERE ip_hmac = ?", [
          expiredHmac,
        ])
      );
    } finally {
      // 무슨 일이 있어도 트리거를 지운다 — 남으면 만료 행 정리 DELETE를 계속 막는다.
      try {
        await dropTrigger();
        c.check("최종 트리거 없음", 0, await triggerCount(ctx, triggerName));
      } catch (error) {
        c.note(`트리거 삭제 실패: ${describeError(error)} — cleanup이 원장으로 다시 시도한다.`);
        c.check("최종 트리거 없음", 0, "삭제 실패", false);
      }
    }
  } catch (error) {
    c.fail(error);
  }
  return c.finish();
}

// --- T4~T6 공통 판정 ---------------------------------------------------------------

async function observeWindows(ctx: CaseContext, ipHmac: string): Promise<number[]> {
  return (await readRateRows(ctx, ipHmac)).map((r) => r.windowStartMs);
}

async function checkFiveThenLimited(
  ctx: CaseContext,
  c: CaseBuilder,
  ipHmac: string,
  keys: readonly string[]
): Promise<void> {
  const accepted = c.requests.filter(isAccepted).length;
  const limited = c.requests.filter(
    (r) => r.status === 429 && bodyCode(r) === "rate_limited"
  ).length;
  c.check("허용(2xx) 수", RATE_LIMIT_MAX_REQUESTS, accepted);
  c.check("429 rate_limited 수", 1, limited);
  c.check("5xx/예외 수", 0, c.requests.filter(isServerError).length);
  c.check(
    "이번 키의 상담 행 수",
    RATE_LIMIT_MAX_REQUESTS,
    await countConsultationsByKeys(ctx, keys)
  );
  const rows = await readRateRows(ctx, ipHmac);
  c.check(
    "rate-limit request_count 합(6번째 시도까지 셈)",
    RATE_LIMIT_MAX_REQUESTS + 1,
    rows.reduce((sum, r) => sum + r.requestCount, 0)
  );
  const windows = await observeWindows(ctx, ipHmac);
  c.check("라우트가 본 윈도 수(1이어야 함)", 1, windows.length);
  c.note(`관측한 window_start(ms): ${JSON.stringify(windows)}`);
}

export async function runSequentialCase(ctx: CaseContext): Promise<CaseResult> {
  const c = new CaseBuilder(ctx, "T4", "같은 IP 순차 6건 → 5건 허용 뒤 429", true);
  try {
    await settle(ctx, c);
    const windowStartMs = await waitForWindowRoom(ctx.windowRoomMs, ctx.clock);
    const ip = "198.51.100.12";
    const ipHmac = registerIp(ctx, "T4", ip, windowStartMs);
    const keys: string[] = [];
    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS + 1; i++) {
      const { body, entry } = buildPayload(ctx, "t4", i);
      ctx.ledger.addConsultation(entry);
      keys.push(entry.idempotencyKey);
      c.requests.push(await callRoute(ctx, `순차 ${i + 1}`, body, ip));
    }
    const statuses = c.requests.map((r) => r.status);
    c.check(
      "앞 5건 2xx 뒤 1건 429(순서)",
      "2xx x5, 429",
      statuses,
      statuses.slice(0, 5).every((s) => s >= 200 && s < 300) && statuses[5] === 429
    );
    await checkFiveThenLimited(ctx, c, ipHmac, keys);
  } catch (error) {
    c.fail(error);
  }
  return c.finish();
}

export async function runParallelDistinctCase(ctx: CaseContext): Promise<CaseResult> {
  const c = new CaseBuilder(ctx, "T5", "같은 IP 동시 6건(서로 다른 키) → 5건 허용 + 429 1건", true);
  try {
    await settle(ctx, c);
    const windowStartMs = await waitForWindowRoom(ctx.windowRoomMs, ctx.clock);
    const ip = "198.51.100.13";
    const ipHmac = registerIp(ctx, "T5", ip, windowStartMs);
    const payloads = Array.from({ length: RATE_LIMIT_MAX_REQUESTS + 1 }, (_, i) =>
      buildPayload(ctx, "t5", i)
    );
    for (const payload of payloads) ctx.ledger.addConsultation(payload.entry);

    const records = await Promise.all(
      payloads.map((payload, i) => callRoute(ctx, `동시 ${i + 1}`, payload.body, ip))
    );
    c.requests.push(...records);
    await checkFiveThenLimited(
      ctx,
      c,
      ipHmac,
      payloads.map((p) => p.entry.idempotencyKey)
    );
  } catch (error) {
    c.fail(error);
  }
  return c.finish();
}

export async function runSameKeyConcurrentCase(ctx: CaseContext): Promise<CaseResult> {
  const c = new CaseBuilder(
    ctx,
    "T6",
    "같은 키 동시 재시도 5건(단일 프로세스) → 행 1개, 카운터 1",
    true
  );
  try {
    await settle(ctx, c);
    const windowStartMs = await waitForWindowRoom(ctx.windowRoomMs, ctx.clock);
    const ip = "198.51.100.14";
    const ipHmac = registerIp(ctx, "T6", ip, windowStartMs);
    const { body, entry } = buildPayload(ctx, "t6", 0);
    ctx.ledger.addConsultation(entry);
    const concurrency = 5;

    const records = await Promise.all(
      Array.from({ length: concurrency }, (_, i) => callRoute(ctx, `동일키 ${i + 1}`, body, ip))
    );
    c.requests.push(...records);

    const accepted = records.filter(isAccepted);
    c.check("이 키의 상담 행 수", 1, await countConsultationsByKeys(ctx, [entry.idempotencyKey]));
    c.check("2xx 응답 수(첫 201 + 나머지 200 재생)", concurrency, accepted.length);
    c.check("5xx/예외 수", 0, records.filter(isServerError).length);
    c.check(
      "2xx 응답 본문의 서로 다른 종류 수(바이트 동일이면 1)",
      1,
      new Set(accepted.map((r) => r.bodyText)).size
    );
    const rows = await readRateRows(ctx, ipHmac);
    c.check(
      "rate-limit request_count 합(재시도는 소비 안 함)",
      1,
      rows.reduce((sum, r) => sum + r.requestCount, 0)
    );
    c.check("라우트가 본 윈도 수(1이어야 함)", 1, rows.length);
    c.note(`상태 분포: ${JSON.stringify(records.map((r) => r.status))}`);
  } catch (error) {
    c.fail(error);
  }
  return c.finish();
}

// --- T7: 서로 다른 프로세스의 같은 키(게이트) --------------------------------------

// 이 케이스는 처음에는 "관찰만 하는 특성화"(게이트 아님)였다 — 프로세스 안 Map 락은 두 프로세스에
// 걸치지 않아 원격에서 [409 duplicate, 201]과 rate-limit 카운터 2(이중 소비)가 관측됐고, 그 위험을
// 기록만 했다. 라우트가 키 조회·rate limit·중복 조회·삽입을 DB 쓰기 트랜잭션 하나로 묶어 프로세스
// 간에도 원자적이 된 뒤로는 게이트다: 같은 키·같은 요청을 두 프로세스가 동시에 제출하면 상담 행
// 1개, 동일한 성공 응답(먼저 온 쪽 201 + 나머지 재생 200), rate limit 소비 1회여야 한다.
export async function runTwoProcessCase(ctx: CaseContext): Promise<CaseResult> {
  const c = new CaseBuilder(
    ctx,
    "T7",
    "같은 키를 두 프로세스가 동시에 제출 → 행 1개, 동일한 성공 응답, 카운터 1",
    true
  );
  const workers: WorkerHandle[] = [];
  try {
    await settle(ctx, c);
    const windowStartMs = await waitForWindowRoom(ctx.windowRoomMs, ctx.clock);
    const ip = "198.51.100.15";
    const ipHmac = registerIp(ctx, "T7", ip, windowStartMs);
    const { body, entry } = buildPayload(ctx, "t7", 0);
    ctx.ledger.addConsultation(entry);

    workers.push(ctx.launchWorker(), ctx.launchWorker());
    await Promise.all(workers.map((w) => w.ready()));
    // 두 워커가 준비를 마친 시각 뒤로 공통 장벽을 둔다 — 각자 이 시각까지 기다렸다 동시에 쏜다.
    const barrierAtMs = ctx.clock.now() + 1500;
    workers.forEach((w) => w.start({ body, ip, barrierAtMs }));
    const results = await Promise.all(workers.map((w) => w.result()));

    results.forEach((r, i) => {
      c.requests.push(toRecord(ctx, `프로세스 ${i + 1}`, ip, r));
    });
    const rows = await readRateRows(ctx, ipHmac);
    const accepted = c.requests.filter(isAccepted);
    c.check(
      "두 프로세스의 상태(정렬: 최초 접수 201 + 재생 200)",
      [200, 201],
      results.map((r) => r.status).sort((a, b) => a - b)
    );
    c.check("5xx/예외 수", 0, c.requests.filter(isServerError).length);
    c.check("2xx 응답 수(둘 다 성공이어야 함)", 2, accepted.length);
    c.check(
      "2xx 응답 본문의 서로 다른 종류 수(바이트 동일이면 1)",
      1,
      new Set(accepted.map((r) => r.bodyText)).size
    );
    c.check("이 키의 상담 행 수", 1, await countConsultationsByKeys(ctx, [entry.idempotencyKey]));
    c.check(
      "rate-limit request_count 합(재시도는 소비 안 함, 2면 이중 소비)",
      1,
      rows.reduce((sum, r) => sum + r.requestCount, 0)
    );
    c.check("라우트가 본 윈도 수(1이어야 함)", 1, rows.length);
    c.note(`상태 분포: ${JSON.stringify(results.map((r) => r.status))}`);
  } catch (error) {
    c.fail(error);
  } finally {
    workers.forEach((w) => w.kill());
  }
  return c.finish();
}

// --- 전체 실행 ---------------------------------------------------------------------

export const CASE_IDS: readonly string[] = ["T1", "T2", "T3", "T4", "T5", "T6", "T7"];

/** only가 있으면 그 케이스만 (원래 순서대로) 실행한다. */
export async function runAllCases(
  ctx: CaseContext,
  onCase: (result: CaseResult) => void,
  only?: readonly string[]
): Promise<CaseResult[]> {
  const allCases: { id: string; run: (ctx: CaseContext) => Promise<CaseResult> }[] = [
    { id: "T1", run: runCommitCase },
    { id: "T2", run: runRollbackCase },
    { id: "T3", run: runTriggerCase },
    { id: "T4", run: runSequentialCase },
    { id: "T5", run: runParallelDistinctCase },
    { id: "T6", run: runSameKeyConcurrentCase },
    { id: "T7", run: runTwoProcessCase },
  ];
  const cases = only ? allCases.filter((entry) => only.includes(entry.id)) : allCases;
  const results: CaseResult[] = [];
  for (const entry of cases) {
    ctx.log(`--- ${entry.id} 시작`);
    const result = await entry.run(ctx);
    results.push(result);
    onCase(result);
    ctx.log(`--- ${entry.id} ${result.status}`);
  }
  // 마지막 케이스(특히 T7)의 잔여 잠금이 cleanup을 방해하지 않게 조용해질 때까지 기다린다.
  await settleDatabase(ctx);
  return results;
}

// --- 워커 프로세스 본체 ------------------------------------------------------------

export interface WorkerIo {
  /** 메시지가 실제로 전송(flush)되면 끝나는 프로미스 — 종료 직전 결과 유실을 막는다. */
  send(message: unknown): Promise<void>;
  onMessage(handler: (message: unknown) => void): void;
}

interface StartMessage {
  type: "start";
  job: WorkerJob;
}

function isStartMessage(message: unknown): message is StartMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: unknown }).type === "start"
  );
}

/**
 * T7 워커 — 자기 DB 클라이언트로 라우트를 부른다. 부모가 준 장벽 시각까지 기다렸다가 동시에 쏜다.
 * 프로세스가 다르므로 프로세스 로컬 idempotency 락이 두 워커에 걸치지 않는다.
 */
export async function runWorker(opts: {
  client: Client;
  db: Db;
  submit: SubmitFn;
  secret: string;
  io: WorkerIo;
  clock?: Clock;
}): Promise<number> {
  const clock: Clock = opts.clock ?? {
    now: Date.now,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
  const env: InjectedEnv = { CONSULT_POLICY_READY: "true", RATE_LIMIT_HMAC_SECRET: opts.secret };

  const startPromise = new Promise<StartMessage>((resolve) => {
    opts.io.onMessage((message) => {
      if (isStartMessage(message)) resolve(message);
    });
  });
  await opts.io.send({ type: "ready" });

  try {
    const { job } = await startPromise;
    while (clock.now() < job.barrierAtMs) await clock.sleep(1);
    const outcome = await performRouteCall(opts.submit, opts.db, env, job.body, job.ip);
    await opts.io.send({ type: "result", status: outcome.status, bodyText: outcome.bodyText });
    return 0;
  } catch (error) {
    await opts.io.send({
      type: "error",
      message: describeError(error).split(opts.secret).join("***"),
    });
    return 1;
  }
}
