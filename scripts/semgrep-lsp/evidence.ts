// 증거 레코드(run.json)와 증거 파일 작성(ADR D5·D10). 순수 모듈이다: 파일은 FsPort로만 쓰고,
// 이미 있는 파일은 덮어쓰지 않으며, 환경변수 값·토큰을 기록하지 않는다.
//
// run.json은 서로 섞이지 않는 다섯 덩어리를 따로 둔다: measurement(측정이 끝났는가) /
// control_assertions(대조 단언) / candidate_gate(제안 기준으로 계산한 가상 평가) / existing_gates(바뀌지 않음) /
// not_executed(아직 실행해 확인하지 못한 값). candidate_gate는 Verdict에 들어 있는 값을 믿지 않고
// 여기서 다시 계산한다 — 이 모듈이 "WOULD_PASS가 나올 수 있는 유일한 조건"을 한 곳에 가둔다:
// provenance=real, mode=target, status=COMPLETE, 합계=0.
//
// 공개 API:
//   canonicalJson(value): string / canonicalJsonLine(value): string / toJsonl(values): string
//   buildRunRecord(args): RunRecord
//   writeEvidence(fs, dir, bundle, opts?): Promise<WriteEvidenceResult>
//   DEFAULT_NOT_EXECUTED / EVIDENCE_FILE_NAMES / EvidenceWriteError

import { sha256Hex } from "./sha";
import { representativeStatus, sortReasons, type Reason } from "./status";
import {
  SCHEMAS,
  type CandidateGate,
  type FsPort,
  type Mode,
  type NotExecutedValue,
  type Phase,
  type Provenance,
  type RunRecord,
  type Verdict,
} from "./types";

// ── 정규 JSON ────────────────────────────────────────────────────

function compareBytes(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

function serialize(
  value: unknown,
  pretty: boolean,
  level: number,
  stack: object[],
  where: string
): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) throw new Error(`정규 JSON에 쓸 수 없는 숫자다: ${where}`);
      return JSON.stringify(value);
    case "object":
      break;
    default:
      // undefined, function, symbol, bigint
      throw new Error(`정규 JSON에 쓸 수 없는 값(${typeof value})이다: ${where}`);
  }

  const obj = value as object;
  if (stack.includes(obj)) throw new Error(`순환 참조다: ${where}`);
  const pad = (n: number) => (pretty ? "  ".repeat(n) : "");
  const nl = pretty ? "\n" : "";
  const sep = pretty ? ": " : ":";

  if (Array.isArray(obj)) {
    if (obj.length === 0) return "[]";
    const next = [...stack, obj];
    const items: string[] = [];
    for (let i = 0; i < obj.length; i++) {
      items.push(
        `${pad(level + 1)}${serialize(obj[i], pretty, level + 1, next, `${where}[${i}]`)}`
      );
    }
    return `[${nl}${items.join(`,${nl}`)}${nl}${pad(level)}]`;
  }

  const proto = Object.getPrototypeOf(obj);
  if (
    (proto !== Object.prototype && proto !== null) ||
    Object.getOwnPropertySymbols(obj).length > 0
  ) {
    throw new Error(`평범한 객체가 아니다: ${where}`);
  }
  const keys = Object.keys(obj).sort(compareBytes);
  if (keys.length === 0) return "{}";
  const next = [...stack, obj];
  const items = keys.map(
    (key) =>
      `${pad(level + 1)}${JSON.stringify(key)}${sep}${serialize(
        (obj as Record<string, unknown>)[key],
        pretty,
        level + 1,
        next,
        `${where}.${key}`
      )}`
  );
  return `{${nl}${items.join(`,${nl}`)}${nl}${pad(level)}}`;
}

/** 키 정렬, 2칸 들여쓰기, LF, 끝 줄바꿈. undefined·NaN·Infinity·함수 등은 던진다(fail-closed). */
export function canonicalJson(value: unknown): string {
  return `${serialize(value, true, 0, [], "$")}\n`;
}

/** JSONL 한 줄용: 키 정렬, 들여쓰기·끝 줄바꿈 없음. */
export function canonicalJsonLine(value: unknown): string {
  return serialize(value, false, 0, [], "$");
}

/** 값마다 한 줄. 빈 목록은 빈 문자열. */
export function toJsonl(values: readonly unknown[]): string {
  return values.map((v) => `${canonicalJsonLine(v)}\n`).join("");
}

// ── RunRecord ────────────────────────────────────────────────────

/** 아직 실행해 확인하지 못한 값. 스텁 결과로 채우지 않는다. */
export const DEFAULT_NOT_EXECUTED: Readonly<Record<string, NotExecutedValue>> = Object.freeze({
  debug_echo_behavior: "UNVERIFIED",
  exit_code_after_exit: "UNVERIFIED",
  log_format: "UNVERIFIED",
  metrics_receiver_observation: "NOT_RUN",
  negative_controls_engine: "NOT_RUN",
  positive_detection: "UNVERIFIED",
  reproducibility: "NOT_RUN",
  rule_count_n: null,
  rules_skipped_s: null,
  semgrep_version: null,
  wheel_sha256: null,
  windows_uri_form: "UNVERIFIED",
} satisfies Record<string, NotExecutedValue>);

export interface BuildRunRecordArgs {
  runId: string;
  mode: Mode;
  provenance: Provenance;
  verdict: Verdict;
  inputs: RunRecord["inputs"];
  phasesReached: readonly Phase[];
  /** target 모드에서 쓴 대조 실행의 요약. control 모드에서는 null이어야 한다. */
  controlReference: RunRecord["control_reference"];
  /** 기본 집합에 덮어쓰거나 더할 항목. 값은 null·NOT_RUN·UNVERIFIED만 허용한다. */
  notExecuted?: Readonly<Record<string, NotExecutedValue>>;
}

function checkVerdict(v: Verdict, mode: Mode): void {
  if (v.complete !== (v.status === "COMPLETE")) {
    throw new Error("Verdict가 모순된다: complete 플래그와 status(COMPLETE)가 맞지 않는다");
  }
  if (v.status === "COMPLETE" || v.status === "NOT_RUN") {
    if (v.reasons.length > 0) throw new Error(`Verdict가 모순된다: ${v.status}인데 사유가 있다`);
  } else if (v.reasons.length === 0) {
    throw new Error(`Verdict가 모순된다: ${v.status}인데 사유가 없다`);
  } else if (representativeStatus(v.reasons) !== v.status) {
    throw new Error(
      `Verdict가 모순된다: status(${v.status})가 사유의 대표 상태(${String(representativeStatus(v.reasons))})와 다르다`
    );
  }
  const t = v.observed.totals;
  if (t !== null) {
    const parts = [t.error, t.warning, t.information, t.total];
    if (
      parts.some((n) => !Number.isInteger(n) || n < 0) ||
      t.total !== t.error + t.warning + t.information
    ) {
      throw new Error("Verdict가 모순된다: 진단 합계가 소계의 합과 맞지 않는다");
    }
  }
  if (v.control_assertions.applicable !== (mode === "control")) {
    throw new Error(
      "Verdict가 모순된다: control_assertions.applicable은 control 모드에서만 true다"
    );
  }
}

function candidateGate(mode: Mode, provenance: Provenance, v: Verdict): CandidateGate {
  const sealed = {
    policy_accepted: false,
    counts_as_lsp_security_warnings: false,
    threshold: "== 0",
  } as const;
  if (mode !== "target") {
    // 스텁이면 어느 모드든 평가는 UNVERIFIED다(ADR D5).
    return {
      applicable: false,
      ...sealed,
      value: null,
      subtotals: null,
      evaluation: provenance === "stub" ? "UNVERIFIED" : "NOT_APPLICABLE",
    };
  }
  if (v.status !== "COMPLETE") {
    return { applicable: true, ...sealed, value: null, subtotals: null, evaluation: "UNVERIFIED" };
  }
  const t = v.observed.totals;
  if (t === null) throw new Error("Verdict가 모순된다: COMPLETE인데 진단 합계가 없다");
  return {
    applicable: true,
    ...sealed,
    value: t.total,
    subtotals: { error: t.error, warning: t.warning, information: t.information },
    evaluation: provenance === "stub" ? "UNVERIFIED" : t.total === 0 ? "WOULD_PASS" : "WOULD_FAIL",
  };
}

function mergeNotExecuted(extra: Readonly<Record<string, NotExecutedValue>> | undefined) {
  const merged: Record<string, NotExecutedValue> = { ...DEFAULT_NOT_EXECUTED, ...(extra ?? {}) };
  const out: Record<string, NotExecutedValue> = {};
  for (const key of Object.keys(merged).sort(compareBytes)) {
    const value = merged[key] as unknown;
    if (value !== null && value !== "NOT_RUN" && value !== "UNVERIFIED") {
      throw new Error(`not_executed.${key}에는 null·NOT_RUN·UNVERIFIED만 쓸 수 있다`);
    }
    out[key] = value;
  }
  return out;
}

export function buildRunRecord(args: BuildRunRecordArgs): RunRecord {
  const { mode, provenance, verdict } = args;
  if (mode !== "control" && mode !== "target") throw new Error(`알 수 없는 mode: ${String(mode)}`);
  if (provenance !== "real" && provenance !== "stub") {
    throw new Error(`알 수 없는 provenance: ${String(provenance)}`);
  }
  if (mode === "control" && args.controlReference !== null) {
    throw new Error("control 모드는 대조 참조를 가질 수 없다");
  }
  checkVerdict(verdict, mode);

  const reasons: Reason[] = sortReasons(structuredClone(verdict.reasons));
  return {
    schema: SCHEMAS.run,
    run_id: args.runId,
    mode,
    provenance,
    trust: provenance === "stub" ? "SYNTHETIC" : "REAL_UNREVIEWED",
    inputs: { ...args.inputs },
    measurement: {
      status: verdict.status,
      complete: verdict.complete,
      reasons,
      phases_reached: [...args.phasesReached],
    },
    observed: structuredClone(verdict.observed),
    control_assertions: structuredClone(verdict.control_assertions),
    control_reference: args.controlReference === null ? null : { ...args.controlReference },
    candidate_gate: candidateGate(mode, provenance, verdict),
    existing_gates: {
      builtin_collector: { status: "UNVERIFIED", changed: false },
      official_gate: { effect: "NONE", changed: false },
    },
    not_executed: mergeNotExecuted(args.notExecuted),
  };
}

// ── 증거 파일 ────────────────────────────────────────────────────

/** 쓰는 순서. run.json이 마지막이라 run.json이 있으면 나머지도 있다. */
export const EVIDENCE_FILE_NAMES = [
  "diagnostics.jsonl",
  "lsp-transcript.jsonl",
  "stderr.log",
  "files.expected.txt",
  "files.published.txt",
  "files.missing.txt",
  "scope.tsv",
  "run.json",
] as const;

export interface EvidenceBundle {
  run: RunRecord;
  /** 받은 publishDiagnostics 원문(JSONL). */
  diagnosticsJsonl: string;
  transcriptJsonl: string;
  stderrLog: string;
  /** 줄 목록. 바이트순으로 정렬해 한 줄씩 쓴다. */
  filesExpected: readonly string[];
  filesPublished: readonly string[];
  filesMissing: readonly string[];
  scopeTsv: string;
}

export interface WriteEvidenceOptions {
  /** 어느 파일에도 있으면 안 되는 값(환경변수 값·토큰). 빈 문자열은 무시한다. 값은 오류 메시지에도 쓰지 않는다. */
  secrets?: readonly string[];
}

export interface WriteEvidenceResult {
  dir: string;
  files: { name: string; sha256: string }[];
  /** progress.md에 한 줄로 연결할 해시. */
  runJsonSha256: string;
}

export class EvidenceWriteError extends Error {
  /** 이미 쓴 파일 이름(쓴 순서). */
  readonly written: string[];
  /** 실패한 파일 이름. 쓰기 전에 거부했으면 문제가 된 파일, 특정할 수 없으면 null. */
  readonly failed: string | null;
  constructor(message: string, written: string[], failed: string | null) {
    super(message);
    this.name = "EvidenceWriteError";
    this.written = written;
    this.failed = failed;
  }
}

function lines(name: string, list: readonly string[]): string {
  const sorted = [...list].sort(compareBytes);
  for (const line of sorted) {
    if (/[\r\n]/.test(line)) throw new Error(`${name}: 줄 안에 줄바꿈이 있다`);
  }
  return sorted.map((line) => `${line}\n`).join("");
}

function joinDir(dir: string, name: string): string {
  return `${dir.replace(/[\\/]+$/, "")}/${name}`;
}

export async function writeEvidence(
  fs: FsPort,
  dir: string,
  bundle: EvidenceBundle,
  opts: WriteEvidenceOptions = {}
): Promise<WriteEvidenceResult> {
  const text: Record<(typeof EVIDENCE_FILE_NAMES)[number], string> = {
    "diagnostics.jsonl": bundle.diagnosticsJsonl,
    "lsp-transcript.jsonl": bundle.transcriptJsonl,
    "stderr.log": bundle.stderrLog,
    "files.expected.txt": lines("files.expected.txt", bundle.filesExpected),
    "files.published.txt": lines("files.published.txt", bundle.filesPublished),
    "files.missing.txt": lines("files.missing.txt", bundle.filesMissing),
    "scope.tsv": bundle.scopeTsv,
    "run.json": canonicalJson(bundle.run),
  };

  // 쓰기 전에 모두 확인한다: 기밀 값, 그리고 이미 있는 파일.
  const secrets = (opts.secrets ?? []).filter((s) => s.length > 0);
  for (const name of EVIDENCE_FILE_NAMES) {
    if (secrets.some((s) => text[name].includes(s))) {
      throw new EvidenceWriteError(`${name}에 기밀 값이 들어 있어 쓰지 않았다`, [], name);
    }
  }
  for (const name of EVIDENCE_FILE_NAMES) {
    if (await fs.exists(joinDir(dir, name))) {
      throw new EvidenceWriteError(`이미 있는 증거 파일은 덮어쓰지 않는다: ${name}`, [], name);
    }
  }

  await fs.mkdirp(dir);
  const written: string[] = [];
  const files: { name: string; sha256: string }[] = [];
  const encoder = new TextEncoder();
  for (const name of EVIDENCE_FILE_NAMES) {
    const bytes = encoder.encode(text[name]);
    try {
      await fs.writeFileExclusive(joinDir(dir, name), bytes);
    } catch (error) {
      throw new EvidenceWriteError(
        `${name}를 쓰지 못했다(쓴 파일: ${written.length ? written.join(", ") : "없음"}): ${
          (error as Error).message
        }`,
        written,
        name
      );
    }
    written.push(name);
    files.push({ name, sha256: sha256Hex(bytes) });
  }
  const runJsonSha256 = files[files.length - 1].sha256;
  return { dir, files, runJsonSha256 };
}
