// SPEC-B2C-CONSULT-001 Group 3a — 원장 기반 정확 정리(cleanup)와 0009 마이그레이션 되돌리기.
//
// 두 명령 모두 "무엇을 지우는지"를 미리 좁게 못 박는다:
//  - cleanup: 원장이 가리키는 행만, id/키/(window_start, ip_hmac)와 서명(name·ip_hmac 접두)이
//    모두 맞을 때만 지운다. 하나라도 어긋나면 아무것도 지우지 않고 멈춘다. 패턴 삭제 없음.
//  - revert-schema: 두 상담 테이블이 비어 있고 0009 마이그레이션 행이 정확히 하나로 식별될 때만
//    두 테이블과 그 한 행을 지운다.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Client, InStatement, Transaction } from "@libsql/client";
import {
  TRIGGER_NAME_PATTERN,
  readLedger,
  type Ledger,
  type LedgerConsultation,
  type LedgerRateLimit,
} from "./verify-remote-consult-ledger.ts";

const CONSULT_TABLES = ["consultations", "consultation_rate_limits"] as const;

export interface TableStatus {
  readonly consultations: boolean;
  readonly consultation_rate_limits: boolean;
}

export async function readTableStatus(client: Client): Promise<TableStatus> {
  const result = await client.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('consultations', 'consultation_rate_limits')"
  );
  const names = new Set(result.rows.map((row) => String(row.name)));
  return {
    consultations: names.has("consultations"),
    consultation_rate_limits: names.has("consultation_rate_limits"),
  };
}

export async function countTable(
  client: Client,
  table: (typeof CONSULT_TABLES)[number]
): Promise<number> {
  const result = await client.execute(`SELECT COUNT(*) AS c FROM ${table}`);
  return Number(result.rows[0]?.c ?? 0);
}

const toSeconds = (ms: number): number => Math.floor(ms / 1000);

const BUSY_RETRY_LIMIT_MS = 10_000;

/**
 * 쓰기 트랜잭션을 연다. 로컬 file: DB에서 다른 연결의 잠금이 아직 풀리지 않았으면(SQLITE_BUSY)
 * 잠깐 기다렸다 다시 시도한다. 원격(HTTP)에서는 첫 시도에 성공하므로 기다림이 생기지 않는다.
 */
async function openWriteTransaction(client: Client): Promise<Transaction> {
  const startedAt = Date.now();
  for (;;) {
    try {
      return await client.transaction("write");
    } catch (error) {
      const code = (error as { code?: unknown }).code;
      if (code !== "SQLITE_BUSY" || Date.now() - startedAt > BUSY_RETRY_LIMIT_MS) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

// --- 원장 대응 행 수집 -------------------------------------------------------------

interface MatchedConsultation {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly name: string;
}

interface MatchedRateLimit {
  readonly windowStartSeconds: number;
  readonly ipHmac: string;
}

interface LedgerRows {
  readonly consultations: MatchedConsultation[];
  readonly rateLimits: MatchedRateLimit[];
  /** 서명 검증에서 걸린 문제들 — 하나라도 있으면 정리를 시작하지 않는다. */
  readonly problems: string[];
}

function ledgerEntryProblems(ledger: Ledger): string[] {
  const problems: string[] = [];
  const prefix = `vt-${ledger.runId}-`;
  for (const entry of ledger.consultations) {
    if (!entry.idempotencyKey.startsWith(prefix) || !entry.resultId.startsWith(prefix)) {
      problems.push(`원장 상담 항목의 키 접두가 서명과 다릅니다(${entry.caseId}).`);
    }
    if (!/^0100000\d{4}$/.test(entry.contactNormalized)) {
      problems.push(
        `원장 상담 항목의 연락처가 가상 대역(010-0000-NNNN)이 아닙니다(${entry.caseId}).`
      );
    }
  }
  for (const entry of ledger.rateLimits) {
    const okMarker = entry.kind !== "route" && entry.ipHmac.startsWith(prefix);
    const okRoute = entry.kind === "route" && /^[0-9a-f]{64}$/.test(entry.ipHmac);
    if (!okMarker && !okRoute) {
      problems.push(`원장 rate-limit 항목의 ip_hmac 형식이 종류(${entry.kind})와 맞지 않습니다.`);
    }
    if (!Number.isInteger(entry.windowStartMs) || entry.windowStartMs % 1000 !== 0) {
      problems.push("원장 rate-limit 항목의 windowStartMs가 초 단위 정수가 아닙니다.");
    }
  }
  return problems;
}

async function collectLedgerRows(client: Client, ledger: Ledger): Promise<LedgerRows> {
  const problems = ledgerEntryProblems(ledger);
  const consultations: MatchedConsultation[] = [];

  if (ledger.consultations.length > 0) {
    const keys = ledger.consultations.map((c) => c.idempotencyKey);
    const placeholders = keys.map(() => "?").join(", ");
    const result = await client.execute({
      sql: `SELECT id, idempotency_key, result_id, name, contact_normalized FROM consultations WHERE idempotency_key IN (${placeholders})`,
      args: keys,
    });
    const byKey = new Map<string, LedgerConsultation>(
      ledger.consultations.map((c) => [c.idempotencyKey, c])
    );
    for (const row of result.rows) {
      const key = String(row.idempotency_key);
      const entry = byKey.get(key);
      const name = String(row.name);
      const signatureOk =
        entry !== undefined &&
        name === ledger.name &&
        String(row.result_id) === entry.resultId &&
        String(row.contact_normalized) === entry.contactNormalized;
      if (!signatureOk) {
        problems.push(
          `키가 원장과 같지만 서명(name/result_id/연락처)이 다른 행이 있습니다(id ${String(row.id)}).`
        );
        continue;
      }
      consultations.push({ id: String(row.id), idempotencyKey: key, name });
    }
  }

  // 원장에 없는데 우리 서명(name)을 단 행 — 있어서는 안 된다.
  const signed = await client.execute({
    sql: "SELECT COUNT(*) AS c FROM consultations WHERE name = ?",
    args: [ledger.name],
  });
  const signedCount = Number(signed.rows[0]?.c ?? 0);
  if (signedCount !== consultations.length) {
    problems.push(
      `서명(name) 행 ${signedCount}개 중 원장으로 확인되는 행은 ${consultations.length}개입니다(원장에 없는 서명 행 존재).`
    );
  }

  const rateLimits: MatchedRateLimit[] = [];
  if (ledger.rateLimits.length > 0) {
    const statements: InStatement[] = ledger.rateLimits.map((entry: LedgerRateLimit) => ({
      sql: "SELECT window_start, ip_hmac FROM consultation_rate_limits WHERE window_start = ? AND ip_hmac = ?",
      args: [toSeconds(entry.windowStartMs), entry.ipHmac],
    }));
    const results = await client.batch(statements, "read");
    for (const result of results) {
      for (const row of result.rows) {
        rateLimits.push({
          windowStartSeconds: Number(row.window_start),
          ipHmac: String(row.ip_hmac),
        });
      }
    }
  }

  return { consultations, rateLimits, problems };
}

// --- cleanup -----------------------------------------------------------------------

export interface CleanupOptions {
  readonly client: Client;
  readonly runDir: string;
  readonly runId: string;
  readonly fingerprint: string;
  readonly log: (line: string) => void;
}

interface TableReport {
  totalBefore: number;
  matchingBefore: number;
  deleted: number;
  totalAfter: number;
  matchingAfter: number;
  baseline: number;
}

function writeReport(runDir: string, report: unknown): void {
  writeFileSync(path.join(runDir, "cleanup.json"), JSON.stringify(report, null, 2));
}

export async function runCleanup(opts: CleanupOptions): Promise<number> {
  const { client, runDir, runId, log } = opts;
  const read = readLedger(runDir, runId);
  if (!read.ok) {
    log(`[cleanup] 중단: ${read.reason}`);
    return 1;
  }
  const ledger = read.ledger;
  if (ledger.fingerprint !== opts.fingerprint) {
    log("[cleanup] 거부: 원장의 대상 지문이 현재 TURSO_DATABASE_URL과 다릅니다(다른 DB).");
    return 2;
  }

  const status = await readTableStatus(client);
  if (!status.consultations || !status.consultation_rate_limits) {
    log("[cleanup] 중단: 상담 테이블이 없습니다.");
    return 1;
  }

  const totalBefore = {
    consultations: await countTable(client, "consultations"),
    consultation_rate_limits: await countTable(client, "consultation_rate_limits"),
  };
  const rows = await collectLedgerRows(client, ledger);
  if (rows.problems.length > 0) {
    for (const problem of rows.problems) log(`[cleanup] 불일치: ${problem}`);
    log("[cleanup] 중단: 아무 행도 지우지 않았습니다.");
    writeReport(runDir, { runId, ok: false, abortedReason: rows.problems, deletedAnything: false });
    return 1;
  }

  // 검증이 끝난 뒤에야 쓴다 — 트리거는 하네스가 만든 이름 그대로만 지운다.
  let triggerName: string | null = null;
  if (ledger.trigger !== null) {
    if (!TRIGGER_NAME_PATTERN.test(ledger.trigger.name)) {
      log("[cleanup] 중단: 원장의 트리거 이름 형식이 올바르지 않습니다.");
      return 1;
    }
    triggerName = ledger.trigger.name;
    await client.execute(`DROP TRIGGER IF EXISTS ${triggerName}`);
  }

  const tx = await openWriteTransaction(client);
  let deletedConsultations = 0;
  let deletedRateLimits = 0;
  try {
    for (const row of rows.consultations) {
      const result = await tx.execute({
        sql: "DELETE FROM consultations WHERE id = ? AND idempotency_key = ? AND name = ?",
        args: [row.id, row.idempotencyKey, row.name],
      });
      if (result.rowsAffected !== 1) {
        throw new Error(`상담 행 삭제 건수 불일치(기대 1, 실제 ${result.rowsAffected})`);
      }
      deletedConsultations += result.rowsAffected;
    }
    for (const row of rows.rateLimits) {
      const result = await tx.execute({
        sql: "DELETE FROM consultation_rate_limits WHERE window_start = ? AND ip_hmac = ?",
        args: [row.windowStartSeconds, row.ipHmac],
      });
      if (result.rowsAffected !== 1) {
        throw new Error(`rate-limit 행 삭제 건수 불일치(기대 1, 실제 ${result.rowsAffected})`);
      }
      deletedRateLimits += result.rowsAffected;
    }
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    log(
      `[cleanup] 중단: ${error instanceof Error ? error.message : String(error)} — 트랜잭션을 롤백했습니다.`
    );
    writeReport(runDir, {
      runId,
      ok: false,
      abortedReason: ["삭제 건수 불일치"],
      deletedAnything: false,
    });
    return 1;
  } finally {
    tx.close();
  }

  const after = await collectLedgerRows(client, ledger);
  const totalAfter = {
    consultations: await countTable(client, "consultations"),
    consultation_rate_limits: await countTable(client, "consultation_rate_limits"),
  };
  const triggerPresentAfter =
    triggerName === null
      ? false
      : Number(
          (
            await client.execute({
              sql: "SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'trigger' AND name = ?",
              args: [triggerName],
            })
          ).rows[0]?.c ?? 0
        ) > 0;

  const tables: Record<(typeof CONSULT_TABLES)[number], TableReport> = {
    consultations: {
      totalBefore: totalBefore.consultations,
      matchingBefore: rows.consultations.length,
      deleted: deletedConsultations,
      totalAfter: totalAfter.consultations,
      matchingAfter: after.consultations.length,
      baseline: ledger.baseline.consultations,
    },
    consultation_rate_limits: {
      totalBefore: totalBefore.consultation_rate_limits,
      matchingBefore: rows.rateLimits.length,
      deleted: deletedRateLimits,
      totalAfter: totalAfter.consultation_rate_limits,
      matchingAfter: after.rateLimits.length,
      baseline: ledger.baseline.consultation_rate_limits,
    },
  };

  const equalsBaseline =
    tables.consultations.totalAfter === tables.consultations.baseline &&
    tables.consultation_rate_limits.totalAfter === tables.consultation_rate_limits.baseline;
  const ledgerClean =
    tables.consultations.matchingAfter === 0 && tables.consultation_rate_limits.matchingAfter === 0;

  log(
    [
      "table",
      "total_before",
      "matching_before",
      "deleted",
      "total_after",
      "matching_after",
      "baseline",
    ].join("\t")
  );
  for (const name of CONSULT_TABLES) {
    const t = tables[name];
    log(
      [
        name,
        t.totalBefore,
        t.matchingBefore,
        t.deleted,
        t.totalAfter,
        t.matchingAfter,
        t.baseline,
      ].join("\t")
    );
  }
  log(`trigger present after: ${triggerPresentAfter ? "yes" : "no"}`);

  const report = {
    runId,
    fingerprint: ledger.fingerprint,
    finishedAt: new Date().toISOString(),
    ok: ledgerClean && !triggerPresentAfter,
    equalsBaseline,
    tables,
    triggerPresentAfter,
  };
  writeReport(runDir, report);

  if (!ledgerClean || triggerPresentAfter) {
    log("[cleanup] 실패: 원장 행 또는 트리거가 남아 있습니다.");
    return 1;
  }
  if (!equalsBaseline) {
    log(
      "[cleanup] 원장 행은 모두 지웠지만 총계가 baseline과 다릅니다 — 원장에 없는 행이 있습니다(건드리지 않았습니다). 직접 확인하세요."
    );
    return 3;
  }
  log("[cleanup] 완료: 총계가 baseline과 같고 원장 행이 남지 않았습니다.");
  return 0;
}

// --- revert-schema -----------------------------------------------------------------

export interface RevertOptions {
  readonly client: Client;
  readonly migrationsDir: string;
  readonly log: (line: string) => void;
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** drizzle migrator는 SQL 파일 문자열의 sha256을 hash로 저장한다 — 줄바꿈 변형도 함께 허용한다. */
function migrationHashCandidates(sqlText: string): Set<string> {
  const lf = sqlText.replace(/\r\n/g, "\n");
  return new Set([sha256(sqlText), sha256(lf), sha256(lf.replace(/\n/g, "\r\n"))]);
}

export async function runRevertSchema(opts: RevertOptions): Promise<number> {
  const { client, log } = opts;
  const refuse = (reason: string): number => {
    log(`[revert-schema] 거부: ${reason}`);
    return 1;
  };

  const status = await readTableStatus(client);
  if (!status.consultations || !status.consultation_rate_limits) {
    return refuse("두 상담 테이블이 모두 있어야 합니다.");
  }
  for (const table of CONSULT_TABLES) {
    const rows = await countTable(client, table);
    if (rows !== 0) return refuse(`${table}에 행이 ${rows}개 있습니다(빈 테이블만 되돌립니다).`);
  }

  const triggers = await client.execute(
    "SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name IN ('consultations', 'consultation_rate_limits')"
  );
  const foreign = triggers.rows
    .map((r) => String(r.name))
    .filter((n) => !TRIGGER_NAME_PATTERN.test(n));
  if (foreign.length > 0) {
    return refuse(`하네스 것이 아닌 트리거가 ${foreign.length}개 있습니다.`);
  }

  // 0009 항목 식별 — 저널의 when이 created_at, SQL 파일 해시가 hash와 같아야 한다.
  const journal = JSON.parse(
    readFileSync(path.join(opts.migrationsDir, "meta", "_journal.json"), "utf8")
  ) as { entries: { tag: string; when: number }[] };
  const entries = journal.entries.filter((e) => e.tag.startsWith("0009_"));
  if (entries.length !== 1) return refuse("저널에서 0009 항목을 유일하게 찾지 못했습니다.");
  const entry = entries[0];
  const sqlText = readFileSync(path.join(opts.migrationsDir, `${entry.tag}.sql`), "utf8");
  const candidates = migrationHashCandidates(sqlText);

  const tableExists = await client.execute(
    "SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'"
  );
  if (Number(tableExists.rows[0]?.c ?? 0) === 0)
    return refuse("__drizzle_migrations 테이블이 없습니다.");

  const migrationRows = await client.execute({
    sql: "SELECT rowid AS rid, hash, created_at FROM __drizzle_migrations WHERE created_at = ?",
    args: [entry.when],
  });
  const matching = migrationRows.rows.filter((row) => candidates.has(String(row.hash)));
  if (migrationRows.rows.length !== 1 || matching.length !== 1) {
    return refuse(
      `0009 마이그레이션 행을 유일하게 식별하지 못했습니다(created_at 일치 ${migrationRows.rows.length}개, 해시까지 일치 ${matching.length}개).`
    );
  }
  const target = matching[0];

  const tx = await openWriteTransaction(client);
  try {
    await tx.execute("DROP TABLE consultations");
    await tx.execute("DROP TABLE consultation_rate_limits");
    const removed = await tx.execute({
      sql: "DELETE FROM __drizzle_migrations WHERE rowid = ? AND hash = ? AND created_at = ?",
      args: [Number(target.rid), String(target.hash), entry.when],
    });
    if (removed.rowsAffected !== 1) {
      throw new Error(
        `__drizzle_migrations 삭제 건수 불일치(기대 1, 실제 ${removed.rowsAffected})`
      );
    }
    const leftovers = await tx.execute(
      "SELECT name FROM sqlite_master WHERE name IN ('consultations', 'consultation_rate_limits') OR tbl_name IN ('consultations', 'consultation_rate_limits')"
    );
    if (leftovers.rows.length > 0) {
      throw new Error(
        `되돌린 뒤에도 ${leftovers.rows.length}개 객체(테이블/인덱스/트리거)가 남았습니다.`
      );
    }
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    return refuse(
      `${error instanceof Error ? error.message : String(error)} — 트랜잭션을 롤백했습니다.`
    );
  } finally {
    tx.close();
  }

  // 커밋 뒤에도 sqlite_master에서 두 테이블·인덱스·트리거가 모두 사라졌는지 다시 확인한다.
  const remaining = await client.execute(
    "SELECT name FROM sqlite_master WHERE name IN ('consultations', 'consultation_rate_limits') OR tbl_name IN ('consultations', 'consultation_rate_limits')"
  );
  if (remaining.rows.length > 0) {
    return refuse(`커밋 뒤에도 ${remaining.rows.length}개 객체가 남아 있습니다.`);
  }

  log(
    "[revert-schema] 완료: consultations, consultation_rate_limits 테이블(과 인덱스·트리거)과 " +
      `0009 마이그레이션 행 1개(created_at ${entry.when})를 지웠습니다.`
  );
  return 0;
}
