// SPEC-B2C-CONSULT-001 Group 3a — write-ahead 원장.
//
// 하네스가 DB에 쓰는 모든 행의 정확한 식별자(제출 idempotencyKey/resultId, (window_start,
// ip_hmac) 쌍, 마커 행, 만료 시드 행, 트리거 이름)를 "쓰기 전에" 디스크에 flush한다.
// cleanup은 오직 이 원장만으로 동작하므로 run이 중간에 죽어도 정확히 정리할 수 있다.
// 체크섬은 원장이 손으로 바뀌었는지(항목 추가 등)를 잡아낸다 — 하네스가 아닌 쪽에서
// 원장이 바뀌면 cleanup은 아무것도 지우지 않고 멈춘다.

import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeSync,
} from "node:fs";
import path from "node:path";

export interface LedgerConsultation {
  readonly caseId: string;
  readonly idempotencyKey: string;
  readonly resultId: string;
  readonly contactNormalized: string;
}

export interface LedgerRateLimit {
  readonly caseId: string;
  readonly kind: "route" | "marker" | "seed-expired";
  /** 밀리초(60초 정렬 또는 마커의 초 단위 정렬 값). DB에는 초 단위로 저장된다. */
  readonly windowStartMs: number;
  readonly ipHmac: string;
}

export interface Ledger {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly fingerprint: string;
  readonly createdAt: string;
  readonly baseline: { readonly consultations: number; readonly consultation_rate_limits: number };
  /** 모든 제출의 name — 서명이다(가상테스트-<runId>). */
  readonly name: string;
  consultations: LedgerConsultation[];
  rateLimits: LedgerRateLimit[];
  trigger: { name: string } | null;
  checksum: string;
}

export interface LedgerInit {
  readonly runId: string;
  readonly fingerprint: string;
  readonly baseline: { consultations: number; consultation_rate_limits: number };
  readonly name: string;
}

export const TRIGGER_NAME_PATTERN = /^vt_[a-z0-9]{4,12}_block_delete$/;

/** 체크섬 대상은 체크섬 자신을 뺀 모든 필드다(키 순서 고정). */
export function computeLedgerChecksum(ledger: Omit<Ledger, "checksum"> | Ledger): string {
  const canonical = JSON.stringify({
    schemaVersion: ledger.schemaVersion,
    runId: ledger.runId,
    fingerprint: ledger.fingerprint,
    createdAt: ledger.createdAt,
    baseline: ledger.baseline,
    name: ledger.name,
    consultations: ledger.consultations,
    rateLimits: ledger.rateLimits,
    trigger: ledger.trigger,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function writeDurably(file: string, content: string): void {
  const tmp = `${file}.tmp-write`;
  const fd = openSync(tmp, "w");
  try {
    writeSync(fd, content);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, file);
}

export class LedgerWriter {
  readonly dir: string;
  readonly file: string;
  private readonly ledger: Ledger;

  constructor(dir: string, init: LedgerInit) {
    this.dir = dir;
    this.file = path.join(dir, "ledger.json");
    mkdirSync(dir, { recursive: true });
    this.ledger = {
      schemaVersion: 1,
      runId: init.runId,
      fingerprint: init.fingerprint,
      createdAt: new Date().toISOString(),
      baseline: { ...init.baseline },
      name: init.name,
      consultations: [],
      rateLimits: [],
      trigger: null,
      checksum: "",
    };
    this.flush();
  }

  /** 제출을 하기 "전에" 호출한다. 이미 있는 키면 다시 넣지 않는다(동일 키 동시 재시도). */
  addConsultation(entry: LedgerConsultation): void {
    if (this.ledger.consultations.some((c) => c.idempotencyKey === entry.idempotencyKey)) return;
    this.ledger.consultations.push(entry);
    this.flush();
  }

  addRateLimits(entries: readonly LedgerRateLimit[]): void {
    for (const entry of entries) {
      const exists = this.ledger.rateLimits.some(
        (r) => r.windowStartMs === entry.windowStartMs && r.ipHmac === entry.ipHmac
      );
      if (!exists) this.ledger.rateLimits.push(entry);
    }
    this.flush();
  }

  setTrigger(name: string): void {
    this.ledger.trigger = { name };
    this.flush();
  }

  snapshot(): Ledger {
    return JSON.parse(JSON.stringify(this.ledger)) as Ledger;
  }

  private flush(): void {
    this.ledger.checksum = computeLedgerChecksum(this.ledger);
    writeDurably(this.file, JSON.stringify(this.ledger, null, 2));
  }
}

export type ReadLedgerResult =
  { readonly ok: true; readonly ledger: Ledger } | { readonly ok: false; readonly reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 원장을 읽고 구조·체크섬·식별자 형식을 검증한다. 하나라도 어긋나면 사유를 돌려준다. */
export function readLedger(dir: string, expectedRunId: string): ReadLedgerResult {
  const file = path.join(dir, "ledger.json");
  if (!existsSync(file)) return { ok: false, reason: "원장 파일이 없습니다." };

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return { ok: false, reason: "원장 JSON을 읽을 수 없습니다." };
  }
  if (!isRecord(parsed)) return { ok: false, reason: "원장 형식이 올바르지 않습니다." };

  const ledger = parsed as unknown as Ledger;
  if (
    ledger.schemaVersion !== 1 ||
    typeof ledger.runId !== "string" ||
    typeof ledger.fingerprint !== "string" ||
    typeof ledger.name !== "string" ||
    !Array.isArray(ledger.consultations) ||
    !Array.isArray(ledger.rateLimits) ||
    !isRecord(ledger.baseline)
  ) {
    return { ok: false, reason: "원장 필드가 올바르지 않습니다." };
  }
  if (ledger.runId !== expectedRunId) {
    return { ok: false, reason: "원장의 runId가 요청한 --run-id와 다릅니다." };
  }
  if (computeLedgerChecksum(ledger) !== ledger.checksum) {
    return { ok: false, reason: "원장 체크섬이 일치하지 않습니다(원장이 하네스 밖에서 바뀜)." };
  }
  if (ledger.name !== `가상테스트-${ledger.runId}`) {
    return { ok: false, reason: "원장의 서명(name)이 runId와 맞지 않습니다." };
  }
  if (ledger.trigger !== null && !TRIGGER_NAME_PATTERN.test(String(ledger.trigger?.name))) {
    return { ok: false, reason: "원장의 트리거 이름 형식이 올바르지 않습니다." };
  }
  return { ok: true, ledger };
}
