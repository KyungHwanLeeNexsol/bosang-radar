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
  caseRunId,
  deriveNegativeControlEntry,
  engineLayerConflicts,
  notRunEntry,
  toolIsolationBlock,
  type LayerObservation,
  type NegativeControlSuite,
} from "./negative-control";
import { requiredNegativeControlKeys } from "./reference";
import { isValidRunId } from "./run-id";
import { sha256Hex } from "./sha";
import { STATUS_PRIORITY, type MeasurementStatus, type ReasonCode } from "./status";
import {
  SCHEMAS,
  type FsPort,
  type NegativeControlCaseIdentity,
  type NegativeControlInput,
  type NegativeControlOutcome,
  type NegativeControlResult,
  type NegativeControlSuiteSummary,
  type Phase,
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
  "TOOL_OBSERVATION_BLOCKED",
  "ENGINE_EXECUTION_FAILED",
  "ENGINE_STAGE_NOT_REACHED",
  "ENGINE_OBSERVATION_UNCONFIRMED",
];
const PHASES: readonly string[] = ["PH0", "PH1", "PH2", "PH3", "PH4"];

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
  /** 스위트 파일에 적힌 변형 추적(그대로). 없으면 null. 증거의 변형 신원과 맞춰 볼 때만 쓴다 — 항목은 이 값으로 정하지 않는다. */
  mutation: unknown;
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
          mutation: Object.prototype.hasOwnProperty.call(entry, "mutation") ? entry.mutation : null,
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
  /** run.json 안에 적힌 run_id(참조의 run_id와 같아야 한다). 문자열이 아니면 null. */
  innerRunId: string | null;
  /** run.json의 resources.negative_control_case. 없거나 모양이 맞지 않으면 null. */
  identity: NegativeControlCaseIdentity | null;
  /** 이 증거의 도구 관측 격리(runner와 같은 함수). 막는 사유가 없으면 null. */
  toolIsolation: ReturnType<typeof toolIsolationBlock>;
}

const decoderStrict = new TextDecoder("utf-8", { fatal: true });

function parseIdentity(value: unknown): NegativeControlCaseIdentity | null {
  if (!isObj(value)) return null;
  const { suite_id, case_id, layer, mutation_kind, mutation_sha256 } = value;
  if (typeof suite_id !== "string" || typeof case_id !== "string") return null;
  if (layer !== "preflight" && layer !== "engine") return null;
  if (mutation_kind !== null && typeof mutation_kind !== "string") return null;
  if (
    mutation_sha256 !== null &&
    (typeof mutation_sha256 !== "string" || !HEX64.test(mutation_sha256))
  ) {
    return null;
  }
  return { suite_id, case_id, layer, mutation_kind, mutation_sha256 };
}

/**
 * 디스크의 run.json을 읽어 관측으로 옮긴다. 읽지 못하거나 구조가 맞지 않거나 스위트가 적은 해시와 다르면 이유 토큰을 돌려준다.
 * 경로는 공유 run-id 규칙(isValidRunId)을 통과한 id로만 만든다 — 규칙을 통과하지 못한 참조는 어떤 파일도 읽지 않는다.
 */
async function readEvidence(
  fs: FsPort,
  evidenceRoot: string,
  ref: { run_id: string; run_json_sha256: string }
): Promise<EvidenceRead | string> {
  if (!isValidRunId(ref.run_id)) return "EVIDENCE_REF_INVALID";
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
  if (!phases.every((p) => typeof p === "string" && PHASES.includes(p))) {
    return "EVIDENCE_INVALID_FIELDS";
  }
  const resources = json.resources;
  const diagnostic = isObj(resources) && isObj(resources.engine_diagnostic);
  const spawned = phases.includes("PH1");
  return {
    sha256,
    innerRunId: typeof json.run_id === "string" ? json.run_id : null,
    identity: isObj(resources) ? parseIdentity(resources.negative_control_case) : null,
    toolIsolation: toolIsolationBlock(isObj(resources) ? resources.tool_observation : undefined),
    observation: {
      recorded: true,
      phases: phases as Phase[],
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

// ── 증거 참조·신원 대조 ───────────────────────────────────────────

interface ExpectedCase {
  suiteId: string;
  id: string;
  layer: "preflight" | "engine";
  /** 스위트 파일에 적힌 변형 추적. 기준 실행이면 null. */
  mutation: unknown;
}

/**
 * 참조가 이 사례의 것인지 읽기 전에 본다. 공유 run-id 규칙을 통과하지 못하면 어떤 경로도 만들지 않는다. 기대 run id와 다르면 다른
 * 사례·기준 실행의 증거를 붙인 것이고, 그 증거를 여러 참조가 가리키면 중복 참조도 함께 남긴다(주인 쪽은 영향받지 않는다).
 */
function refProblems(
  ref: { run_id: string },
  expectedRunId: string,
  isShared: (runId: string) => boolean
): string[] {
  if (!isValidRunId(ref.run_id)) return ["EVIDENCE_REF_INVALID"];
  if (ref.run_id !== expectedRunId) {
    return [
      "EVIDENCE_RUN_ID_UNEXPECTED",
      ...(isShared(ref.run_id) ? ["EVIDENCE_REF_DUPLICATE"] : []),
    ];
  }
  return [];
}

/** 변형 추적(스위트 파일에 적힌 그대로)에서 증거의 변형 신원이 기대하는 해시. 추적이 없으면 null, 해시를 만들 수 없으면 맞을 수 없는 값. */
function expectedMutationSha(mutation: unknown): string | null {
  if (mutation === null || mutation === undefined) return null;
  try {
    return sha256Hex(canonicalJson(mutation));
  } catch {
    return "UNHASHABLE";
  }
}

function expectedMutationKind(mutation: unknown): string | null {
  return isObj(mutation) && typeof mutation.kind === "string" ? mutation.kind : null;
}

/**
 * 읽은 증거가 참조·스위트·사례·층과 맞는지(서명이 아니라 신원 대조). run.json 안의 run_id가 참조와 같고, 증거에 적힌 신원(스위트·사례·층·변형)이
 * 스위트가 기대하는 것과 같아야 한다. 맞으면 null, 아니면 이유 토큰.
 */
function evidenceProblem(
  read: EvidenceRead,
  ref: { run_id: string },
  expected: ExpectedCase
): string | null {
  if (read.innerRunId !== ref.run_id) return "EVIDENCE_RUN_ID_MISMATCH";
  const identity = read.identity;
  if (identity === null) return "EVIDENCE_IDENTITY_MISSING";
  if (
    identity.suite_id !== expected.suiteId ||
    identity.case_id !== expected.id ||
    identity.layer !== expected.layer
  ) {
    return "EVIDENCE_IDENTITY_MISMATCH";
  }
  if (
    identity.mutation_kind !== expectedMutationKind(expected.mutation) ||
    identity.mutation_sha256 !== expectedMutationSha(expected.mutation)
  ) {
    return "EVIDENCE_MUTATION_MISMATCH";
  }
  return null;
}

// ── 읽기 ─────────────────────────────────────────────────────────

const shown = (items: readonly string[], max = 8): string => {
  const head = items.slice(0, max);
  return `${head.join(", ")}${items.length > head.length ? `, +${items.length - head.length}` : ""}`;
};

/** 스위트가 적은 `blocked`를 거절 사유 토큰으로 옮긴다. 알려진 단계와 토큰 모양(대문자·밑줄)만 옮기고 그 밖의 값은 버린다. */
function blockedRejection(value: unknown): string | null {
  if (!isObj(value) || !isObj(value.blocked)) return null;
  const { stage, cause } = value.blocked;
  if (stage !== "TOOL_OBSERVATION" && stage !== "WORKSPACE") return null;
  if (typeof cause !== "string" || !/^[A-Z_]{1,64}$/.test(cause)) return null;
  return `SUITE_BLOCKED(${stage}:${cause})`;
}

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
    if (suite.provenance === null) {
      // 시작하지 못하게 막힌 스위트(도구 관측 격리·작업 공간)는 기준 실행이 없다. 원인은 알려진 토큰 모양일 때만 옮긴다.
      return rejected(blockedRejection(value) ?? "NO_BASELINE_PROVENANCE", suite.suiteId);
    }

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

    // 증거 참조는 스위트·사례·층이 정하는 run id와 같아야 한다(실행기와 같은 규칙 caseRunId). 같은 증거를 가리키는 참조가 둘 이상이면
    // 기대 run id와 같은 쪽(주인)만 남고 나머지는 거절한다 — 다른 사례의 증거를 붙여 재사용하는 길을 막는다.
    const refCounts = new Map<string, number>();
    for (const ref of [suite.baselineEvidence, ...suite.cases.map((c) => c.evidence)]) {
      if (ref !== null) refCounts.set(ref.run_id, (refCounts.get(ref.run_id) ?? 0) + 1);
    }
    const isShared = (runId: string): boolean => (refCounts.get(runId) ?? 0) > 1;

    // 기준 실행의 증거를 먼저 읽는다: 결합·출처의 기준이다. 스위트가 적은 결합은 이 증거와 같아야 한다.
    const problemTokens: string[] = [];
    let binding: string | null = null;
    let baselineOutcome: NegativeControlOutcome = "BASELINE_NOT_CLEAN";
    const baselineExpected = caseRunId(suite.suiteId, "baseline", "engine");
    if (suite.baselineRunId !== baselineExpected) {
      problemTokens.push("BASELINE_RUN_ID_UNEXPECTED");
    } else if (suite.baselineEvidence === null) {
      problemTokens.push("BASELINE_EVIDENCE_MISSING");
    } else {
      const refIssues = refProblems(suite.baselineEvidence, baselineExpected, isShared);
      const baseline =
        refIssues.length > 0
          ? refIssues[0]
          : await readEvidence(fs, evidenceRoot, suite.baselineEvidence);
      if (refIssues.length > 0) problemTokens.push(...refIssues.map((t) => `BASELINE_${t}`));
      else if (typeof baseline === "string") problemTokens.push(`BASELINE_${baseline}`);
      else {
        const o = baseline.observation;
        const mismatch = evidenceProblem(baseline, suite.baselineEvidence, {
          suiteId: suite.suiteId,
          id: "baseline",
          layer: "engine",
          mutation: null,
        });
        const clean = o.spawned && o.status === "COMPLETE" && o.binding !== null && o.diagnostic;
        if (mismatch !== null) problemTokens.push(`BASELINE_${mismatch}`);
        else if (baseline.toolIsolation !== null) {
          // 도구 관측 단계의 격리 위반(또는 관측 못 함)은 실행기와 같은 함수로 다시 판단한다 — 스위트가 이를 숨기고 기준을 깨끗하다고 적어도 소용없다.
          problemTokens.push(`BASELINE_${baseline.toolIsolation}`);
          baselineOutcome = "TOOL_OBSERVATION_BLOCKED";
        } else if (!clean) problemTokens.push("BASELINE_NOT_CLEAN");
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
        // 충돌은 표에서 다시 도출한 사실이라 스위트가 실행했다고 적어도, 어떤 증거를 붙여도 우선한다.
        const blocked = layer === "engine" && conflicts.some((c) => c.id === spec.id);
        if (blocked || trace.outcome !== "EXECUTED" || binding === null) {
          // 실행하지 않은 사례와 기준이 성립하지 않은 스위트는 항목을 만들지 않는다.
          derived = notRunEntry(
            spec,
            layer,
            blocked
              ? "BLOCKED_CONTRACT_CONFLICT"
              : binding === null && trace.outcome === "EXECUTED"
                ? baselineOutcome
                : trace.outcome
          );
        } else if (trace.evidence === null) {
          derived = notRunEntry(spec, layer, "RUN_FAILED");
          problemTokens.push(`${keyOf(trace)}:EVIDENCE_REF_MISSING`);
        } else {
          const refIssues = refProblems(
            trace.evidence,
            caseRunId(suite.suiteId, spec.id, layer),
            isShared
          );
          const read =
            refIssues.length > 0
              ? refIssues[0]
              : await readEvidence(fs, evidenceRoot, trace.evidence);
          if (refIssues.length > 0) {
            derived = notRunEntry(spec, layer, "RUN_FAILED");
            problemTokens.push(...refIssues.map((t) => `${keyOf(trace)}:${t}`));
          } else if (typeof read === "string") {
            derived = notRunEntry(spec, layer, "RUN_FAILED");
            problemTokens.push(`${keyOf(trace)}:${read}`);
          } else {
            const mismatch = evidenceProblem(read, trace.evidence, {
              suiteId: suite.suiteId,
              id: spec.id,
              layer,
              mutation: trace.mutation,
            });
            if (mismatch !== null) {
              derived = notRunEntry(spec, layer, "RUN_FAILED");
              problemTokens.push(`${keyOf(trace)}:${mismatch}`);
            } else if (read.toolIsolation !== null) {
              derived = notRunEntry(spec, layer, "TOOL_OBSERVATION_BLOCKED");
              problemTokens.push(`${keyOf(trace)}:${read.toolIsolation}`);
            } else if (read.observation.provenance !== suite.provenance) {
              derived = notRunEntry(spec, layer, "BINDING_DRIFT");
            } else {
              derived = deriveNegativeControlEntry(
                spec,
                layer,
                read.observation,
                binding,
                conflicts
              );
            }
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
