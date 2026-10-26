// 음성 대조 스위트 기록(negative-controls.json)의 쓰기와 읽기. 읽기는 `--control-record` 어댑터와 같은 원칙을 따른다.
//
//  · 파일에서 나온 값은 전부 `unknown`이다. 소비하는 필드를 하나씩 검사해 새 객체로 옮기고, 통과하지 못하면 이유를 토큰으로 돌려주며
//    던지지 않는다. 거절은 항상 "항목 없음"(16개 전부 NOT_RUN)이다.
//  · **저장된 `entries`는 읽지 않는다.** 항목은 사례별 증거(`<evidence-root>/<run_id>/run.json`)를 디스크에서 다시 읽어, 실행기가 쓰는
//    것과 같은 순수 함수(deriveNegativeControlEntry)로 재도출한다. 스위트 파일의 `entries`를 PASS로 고쳐 써도 효과가 없다.
//  · 증거는 스위트가 적어 둔 해시와 맞아야 한다(바뀐 증거는 쓰지 않는다). 결합·출처는 기준 실행의 증거에서 다시 읽는다.
//  · 파일은 서명되지 않았다 — 증거와 스위트를 함께 위조해 자기 일관성과 지문을 모두 맞추는 경우는 이 읽기로 구별할 수 없다.
//    남는 방어는 control 실행이 이번 실행의 결합과 출처를 다시 맞춰 보는 것과, 운영자가 경로를 명시하는 것뿐이다.
//
// 공개 API:
//   serializeSuite(suite): string
//   loadNegativeControlSuite(fs, path, ctx): Promise<NegativeControlInput>     던지지 않는다
//   suiteSummary(...)                                                          요약(개수·토큰)

import { canonicalJson } from "./canonical";
import { NEGATIVE_CONTROL_TABLE, defaultNegativeControls } from "./control";
import {
  SUITE_SCHEMA,
  deriveNegativeControlEntry,
  engineLayerConflicts,
  notRunEntry,
  type LayerObservation,
  type NegativeControlSuite,
} from "./negative-control";
import { requiredNegativeControlKeys } from "./reference";
import { sha256Hex } from "./sha";
import { STATUS_PRIORITY, type MeasurementStatus, type ReasonCode } from "./status";
import {
  SCHEMAS,
  type FsPort,
  type NegativeControlInput,
  type NegativeControlOutcome,
  type NegativeControlResult,
  type NegativeControlSuiteSummary,
  type Provenance,
} from "./types";

/** 이보다 큰 스위트·증거 파일은 파싱하기 전에 거절한다(요약이라 훨씬 작다). */
export const MAX_SUITE_BYTES = 16 * 1024 * 1024;
const MAX_REJECTION_CHARS = 600;
const MAX_LIST = 64;

const HEX64 = /^[0-9a-f]{64}$/;
const MEASUREMENT_STATUSES: readonly string[] = [...STATUS_PRIORITY, "COMPLETE", "NOT_RUN"];
const OUTCOMES: readonly NegativeControlOutcome[] = [
  "EXECUTED",
  "BLOCKED_CONTRACT_CONFLICT",
  "BASELINE_NOT_CLEAN",
  "ENGINE_NOT_STARTED",
  "RUN_FAILED",
  "CANCELLED",
  "BINDING_UNAVAILABLE",
  "BINDING_DRIFT",
  "WORKSPACE_FAILED",
  "NO_SUCH_LAYER",
];

export function serializeSuite(suite: NegativeControlSuite): string {
  return `${canonicalJson(suite)}\n`;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

class Problems {
  readonly list: string[] = [];
  add(problem: string): void {
    if (this.list.length < MAX_LIST) this.list.push(problem);
  }
}

function str(
  o: Obj,
  key: string,
  path: string,
  p: Problems,
  test: (s: string) => boolean = () => true
): string | undefined {
  const where = path === "" ? key : `${path}.${key}`;
  if (!Object.prototype.hasOwnProperty.call(o, key)) return void p.add(`${where}(missing)`);
  const v = o[key];
  if (typeof v !== "string") return void p.add(`${where}(type)`);
  if (!test(v)) return void p.add(`${where}(value)`);
  return v;
}

function nullableStr(
  o: Obj,
  key: string,
  path: string,
  p: Problems,
  test: (s: string) => boolean = () => true
): string | null | undefined {
  const where = path === "" ? key : `${path}.${key}`;
  if (!Object.prototype.hasOwnProperty.call(o, key)) return void p.add(`${where}(missing)`);
  const v = o[key];
  if (v === null) return null;
  if (typeof v !== "string") return void p.add(`${where}(type)`);
  if (!test(v)) return void p.add(`${where}(value)`);
  return v;
}

// ── 스위트 구조 ──────────────────────────────────────────────────

interface ParsedCase {
  id: string;
  layer: "preflight" | "engine";
  outcome: NegativeControlOutcome;
  evidence: { run_id: string; run_json_sha256: string } | null;
}

interface ParsedSuite {
  suiteId: string;
  provenance: Provenance | null;
  binding: string | null;
  baselineRunId: string;
  baselineEvidence: { run_id: string; run_json_sha256: string } | null;
  cases: ParsedCase[];
}

function parseEvidence(
  value: unknown,
  path: string,
  p: Problems
): { run_id: string; run_json_sha256: string } | null | undefined {
  if (value === null) return null;
  if (!isObj(value)) return void p.add(`${path}(type)`);
  const run_id = str(value, "run_id", path, p, (s) => s.length > 0 && s.length <= 128);
  const sha = str(value, "run_json_sha256", path, p, (s) => HEX64.test(s));
  return run_id === undefined || sha === undefined ? undefined : { run_id, run_json_sha256: sha };
}

function parseSuite(value: unknown, p: Problems): ParsedSuite | undefined {
  if (!isObj(value)) return void p.add("suite(type)");
  const suiteId = str(value, "suite_id", "", p, (s) => s.length > 0 && s.length <= 128);
  const provenanceRaw = nullableStr(
    value,
    "provenance",
    "",
    p,
    (s) => s === "real" || s === "stub"
  );
  const binding = nullableStr(value, "binding_sha256", "", p, (s) => HEX64.test(s));

  let baselineRunId: string | undefined;
  let baselineEvidence: { run_id: string; run_json_sha256: string } | null | undefined;
  const b = value.baseline;
  if (!isObj(b)) p.add("baseline(type)");
  else {
    baselineRunId = str(b, "run_id", "baseline", p, (s) => s.length > 0 && s.length <= 128);
    if (!Object.prototype.hasOwnProperty.call(b, "evidence")) p.add("baseline.evidence(missing)");
    else baselineEvidence = parseEvidence(b.evidence, "baseline.evidence", p);
  }

  const cases: ParsedCase[] = [];
  if (!Array.isArray(value.cases)) p.add("cases(type)");
  else if (value.cases.length > MAX_LIST) p.add("cases(too-long)");
  else {
    value.cases.forEach((entry: unknown, i) => {
      const where = `cases[${i}]`;
      if (!isObj(entry)) return void p.add(`${where}(type)`);
      const id = str(entry, "id", where, p, (s) => s.length > 0 && s.length <= 16);
      const layer = str(entry, "layer", where, p, (s) => s === "preflight" || s === "engine");
      const outcome = str(entry, "outcome", where, p, (s) =>
        (OUTCOMES as readonly string[]).includes(s)
      );
      const evidence = Object.prototype.hasOwnProperty.call(entry, "evidence")
        ? parseEvidence(entry.evidence, `${where}.evidence`, p)
        : void p.add(`${where}.evidence(missing)`);
      if (
        id !== undefined &&
        layer !== undefined &&
        outcome !== undefined &&
        evidence !== undefined
      ) {
        cases.push({
          id,
          layer: layer as "preflight" | "engine",
          outcome: outcome as NegativeControlOutcome,
          evidence,
        });
      }
    });
  }
  if (
    suiteId === undefined ||
    provenanceRaw === undefined ||
    binding === undefined ||
    baselineRunId === undefined ||
    baselineEvidence === undefined
  ) {
    return undefined;
  }
  return {
    suiteId,
    provenance: provenanceRaw as Provenance | null,
    binding,
    baselineRunId,
    baselineEvidence,
    cases,
  };
}

// ── 증거(run.json)에서 관측 읽기 ─────────────────────────────────

interface EvidenceRead {
  observation: LayerObservation;
  sha256: string;
}

const decoderStrict = new TextDecoder("utf-8", { fatal: true });

/** 디스크의 run.json을 읽어 관측으로 옮긴다. 읽지 못하거나 구조가 맞지 않거나 스위트가 적은 해시와 다르면 이유 토큰을 돌려준다. */
async function readEvidence(
  fs: FsPort,
  evidenceRoot: string,
  ref: { run_id: string; run_json_sha256: string }
): Promise<EvidenceRead | string> {
  const path = `${evidenceRoot.replace(/[\\/]+$/, "")}/${ref.run_id}/run.json`;
  let bytes: Uint8Array;
  try {
    if (!(await fs.exists(path))) return "EVIDENCE_MISSING";
    bytes = await fs.readFile(path);
  } catch {
    return "EVIDENCE_UNREADABLE";
  }
  if (bytes.byteLength > MAX_SUITE_BYTES) return "EVIDENCE_TOO_LARGE";
  const sha256 = sha256Hex(bytes);
  if (sha256 !== ref.run_json_sha256) return "EVIDENCE_HASH_MISMATCH";
  let json: unknown;
  try {
    json = JSON.parse(decoderStrict.decode(bytes));
  } catch {
    return "EVIDENCE_INVALID_JSON";
  }
  if (!isObj(json) || json.schema !== SCHEMAS.run || json.mode !== "control") {
    return "EVIDENCE_NOT_CONTROL_RUN";
  }
  if (json.provenance !== "real" && json.provenance !== "stub") return "EVIDENCE_INVALID_FIELDS";
  const measurement = json.measurement;
  const inputs = json.inputs;
  if (!isObj(measurement) || !isObj(inputs)) return "EVIDENCE_INVALID_FIELDS";
  const status = measurement.status;
  if (typeof status !== "string" || !MEASUREMENT_STATUSES.includes(status)) {
    return "EVIDENCE_INVALID_FIELDS";
  }
  const reasons = measurement.reasons;
  const phases = measurement.phases_reached;
  if (!Array.isArray(reasons) || !Array.isArray(phases)) return "EVIDENCE_INVALID_FIELDS";
  const reasonCodes: ReasonCode[] = [];
  for (const r of reasons) {
    if (!isObj(r) || typeof r.code !== "string") return "EVIDENCE_INVALID_FIELDS";
    reasonCodes.push(r.code as ReasonCode);
  }
  const binding = inputs.binding_sha256;
  if (binding !== null && (typeof binding !== "string" || !HEX64.test(binding))) {
    return "EVIDENCE_INVALID_FIELDS";
  }
  const resources = json.resources;
  const diagnostic = isObj(resources) && isObj(resources.engine_diagnostic);
  const spawned = phases.includes("PH1");
  return {
    sha256,
    observation: {
      recorded: true,
      spawned,
      attempted: spawned || reasonCodes.includes("SPAWN_FAILED"),
      status: status as MeasurementStatus,
      reasonCodes,
      binding,
      provenance: json.provenance,
      cancelled: false,
      diagnostic,
    },
  };
}

// ── 읽기 ─────────────────────────────────────────────────────────

const shown = (items: readonly string[], max = 8): string => {
  const head = items.slice(0, max);
  return `${head.join(", ")}${items.length > head.length ? `, +${items.length - head.length}` : ""}`;
};

function rejected(rejection: string, suiteId: string | null = null): NegativeControlInput {
  const entries = defaultNegativeControls();
  return {
    entries,
    bindingSha256: null,
    // 거절된 입력의 출처는 쓰이지 않는다(하네스가 accepted=false를 먼저 본다).
    provenance: "stub",
    summary: {
      accepted: false,
      rejection: rejection.slice(0, MAX_REJECTION_CHARS),
      suite_id: suiteId,
      provenance: null,
      binding_sha256: null,
      counts: { pass: 0, fail: 0, not_run: entries.length },
      outcomes: [],
      problems: [],
    },
  };
}

/**
 * 스위트 파일을 읽어 control 실행에 넘길 입력을 만든다. 던지지 않는다. 구조가 맞지 않으면 거절(16개 전부 NOT_RUN), 구조가 맞으면
 * 사례별 증거를 다시 읽어 항목을 재도출한다 — 증거가 없거나 달라진 사례는 그 항목만 NOT_RUN이다.
 * evidenceRoot는 control 실행이 쓰는 증거 폴더 기준이다(음성 대조 명령이 같은 증거 폴더를 썼어야 증거를 찾는다).
 */
export async function loadNegativeControlSuite(
  fs: FsPort,
  path: string,
  evidenceRoot: string
): Promise<NegativeControlInput> {
  try {
    let present: boolean;
    try {
      present = await fs.exists(path);
    } catch {
      return rejected("READ_FAILED");
    }
    if (!present) return rejected("FILE_NOT_FOUND");
    let bytes: Uint8Array;
    try {
      bytes = await fs.readFile(path);
    } catch {
      return rejected("READ_FAILED");
    }
    if (bytes.byteLength > MAX_SUITE_BYTES) return rejected("TOO_LARGE");
    let value: unknown;
    try {
      value = JSON.parse(decoderStrict.decode(bytes));
    } catch {
      return rejected("INVALID_JSON");
    }
    if (isObj(value) && value.schema !== SUITE_SCHEMA) return rejected("SCHEMA_UNSUPPORTED");
    const problems = new Problems();
    const suite = parseSuite(value, problems);
    if (suite === undefined) return rejected(`INVALID_FIELDS(${shown(problems.list)})`);
    if (suite.provenance === null) return rejected("NO_BASELINE_PROVENANCE", suite.suiteId);

    // 필요한 (id, 층)마다 정확히 하나. 누락·중복·예상 밖은 스위트 전체를 거절한다(불완전한 기록을 부분 수락하지 않는다).
    const required = requiredNegativeControlKeys();
    const keyOf = (c: { id: string; layer: string }): string => `${c.id}:${c.layer}`;
    const missing: string[] = [];
    const duplicate: string[] = [];
    for (const k of required) {
      const n = suite.cases.filter((c) => c.id === k.id && c.layer === k.layer).length;
      if (n === 0) missing.push(keyOf(k));
      else if (n > 1) duplicate.push(keyOf(k));
    }
    const unexpected = suite.cases
      .filter((c) => !required.some((k) => k.id === c.id && k.layer === c.layer))
      .map(keyOf);
    const structural = [
      ...(missing.length > 0 ? [`CASES_MISSING(${shown(missing)})`] : []),
      ...(duplicate.length > 0 ? [`CASES_DUPLICATE(${shown(duplicate)})`] : []),
      ...(unexpected.length > 0 ? [`CASES_UNEXPECTED(${shown(unexpected)})`] : []),
    ];
    if (structural.length > 0) return rejected(structural.join("; "), suite.suiteId);

    // 기준 실행의 증거를 먼저 읽는다: 결합·출처의 기준이다. 스위트가 적은 결합은 이 증거와 같아야 한다.
    const problemTokens: string[] = [];
    let binding: string | null = null;
    if (suite.baselineEvidence === null) {
      problemTokens.push("BASELINE_EVIDENCE_MISSING");
    } else {
      const baseline = await readEvidence(fs, evidenceRoot, suite.baselineEvidence);
      if (typeof baseline === "string") problemTokens.push(`BASELINE_${baseline}`);
      else {
        const o = baseline.observation;
        const clean = o.spawned && o.status === "COMPLETE" && o.binding !== null && o.diagnostic;
        if (!clean) problemTokens.push("BASELINE_NOT_CLEAN");
        else if (o.provenance !== suite.provenance)
          problemTokens.push("BASELINE_PROVENANCE_MISMATCH");
        else if (suite.binding !== o.binding) problemTokens.push("BASELINE_BINDING_MISMATCH");
        else binding = o.binding;
      }
    }

    const conflicts = engineLayerConflicts();
    const entries: NegativeControlResult[] = defaultNegativeControls();
    const outcomes: NegativeControlSuiteSummary["outcomes"] = [];
    for (const spec of NEGATIVE_CONTROL_TABLE) {
      for (const layer of ["preflight", "engine"] as const) {
        if (layer === "preflight" && spec.preflight === null) continue;
        const trace = suite.cases.find((c) => c.id === spec.id && c.layer === layer) as ParsedCase;
        let derived;
        if (trace.outcome !== "EXECUTED" || binding === null) {
          // 실행하지 않은 사례와 기준이 성립하지 않은 스위트는 항목을 만들지 않는다. 충돌은 표에서 다시 도출한 사실이 우선한다.
          const blocked = layer === "engine" && conflicts.some((c) => c.id === spec.id);
          derived = notRunEntry(
            spec,
            layer,
            blocked
              ? "BLOCKED_CONTRACT_CONFLICT"
              : binding === null && trace.outcome === "EXECUTED"
                ? "BASELINE_NOT_CLEAN"
                : trace.outcome
          );
        } else if (trace.evidence === null) {
          derived = notRunEntry(spec, layer, "RUN_FAILED");
          problemTokens.push(`${keyOf(trace)}:EVIDENCE_REF_MISSING`);
        } else {
          const read = await readEvidence(fs, evidenceRoot, trace.evidence);
          if (typeof read === "string") {
            derived = notRunEntry(spec, layer, "RUN_FAILED");
            problemTokens.push(`${keyOf(trace)}:${read}`);
          } else if (read.observation.provenance !== suite.provenance) {
            derived = notRunEntry(spec, layer, "BINDING_DRIFT");
          } else {
            derived = deriveNegativeControlEntry(spec, layer, read.observation, binding, conflicts);
          }
        }
        const at = entries.findIndex((e) => e.id === spec.id && e.layer === layer);
        if (at >= 0) entries[at] = derived.entry;
        if (derived.entry.status !== "PASS")
          outcomes.push({ id: spec.id, layer, outcome: derived.outcome });
      }
    }
    const count = (status: NegativeControlResult["status"]): number =>
      entries.filter((e) => e.status === status).length;
    return {
      entries,
      bindingSha256: binding,
      provenance: suite.provenance,
      summary: {
        accepted: true,
        rejection: null,
        suite_id: suite.suiteId,
        provenance: suite.provenance,
        binding_sha256: binding,
        counts: { pass: count("PASS"), fail: count("FAIL"), not_run: count("NOT_RUN") },
        outcomes,
        problems: problemTokens.slice(0, MAX_LIST),
      },
    };
  } catch {
    return rejected("INTERNAL_ERROR");
  }
}
