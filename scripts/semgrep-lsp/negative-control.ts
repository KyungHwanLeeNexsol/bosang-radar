// 음성 대조 실행기(ADR D8, rev2 4.1). NEGATIVE_CONTROL_TABLE의 R1~R9를 **실제로 호출한 결과**로 NegativeControlResult에 옮긴다.
//
// 이 모듈이 하는 일: 변형하지 않은 기준 실행 하나와, 표의 (id, 층)마다 입력을 변형한 실행을 사례별 작업 공간에서 돌리고, 하네스가
// 낸 판정(대표 상태)을 관측으로 삼아 PASS/FAIL/NOT_RUN을 가른다. 하는 일이 아닌 것: 정상 target/control 실행에 붙지 않는다(스위트는
// 별도 명령이 실행하고 control 실행이 명시한 경로로만 읽는다), 실제 Semgrep을 찾거나 설치하지 않는다, NOT_RUN을 PASS로 바꾸는
// 길을 만들지 않는다.
//
// ── 층 ──────────────────────────────────────────────────────────
//  · preflight: 정상 진입점(runHarness)으로 변형한 입력을 돌린다. 사전 검사·설정 검사가 거부하고 **엔진을 띄우지 않았을 때**만 관측이
//    성립한다. 프로세스 포트는 띄우지 못하게 감싼다(띄우려는 시도가 있으면 FAIL — 막아야 할 것을 못 막았다).
//  · engine: 엔진 진단 진입점(runEngineDiagnostic)으로 같은 입력을 돌린다. 엔진이 **실제로 떴을 때**만 관측이 성립한다. 뜨지 않은
//    결과(사전 검사 사유가 시작을 막음, 띄우지 못함)는 PASS도 FAIL도 아닌 NOT_RUN(ENGINE_NOT_STARTED)이다.
//  두 층은 서로 대신하지 못한다: 사전 검사의 관측은 엔진 항목을 바꾸지 않고, 엔진 항목은 엔진 진단 실행의 관측으로만 정해진다.
//
// ── 관측과 PASS ─────────────────────────────────────────────────
//  · observed는 하네스가 낸 판정(measurement.status)이다. expected를 복사하지 않고, 사례 id만 보고 값을 만들지 않는다.
//  · PASS = 그 층의 실행 근거(증거 9개가 쓰인 실행, 층에 맞는 시작 여부) + observed가 표의 기대와 같음 + 표가 정한 사유(preflight 사유)가
//    판정에 들어 있음 + 결합이 기준 실행과 같음. 하나라도 빠지면 PASS가 아니다.
//  · 기준 실행이 깨끗하지 않으면(COMPLETE가 아니거나 엔진이 뜨지 않음) 변형의 효과를 가려낼 수 없어 모든 항목이 NOT_RUN이다.
//  · 미실행·취소·실행 실패·증거 누락·결합 불일치는 모두 NOT_RUN이고 이유를 NegativeControlOutcome 토큰으로 남긴다.
//
// ── 계약 충돌(조용히 바꾸지 않는다) ──────────────────────────────
//  표의 엔진 기대가, 같은 변형이 반드시 내는 사전 검사 사유의 상태보다 우선순위가 뒤이면(예: R9의 ISOLATION_VIOLATION은 알 수 없는 키가
//  부르는 SETTINGS_MISMATCH에 가려진다) 엔진을 띄워 봐도 그 기대 상태가 대표 상태가 될 수 없다. 이런 (id, 엔진)은 실행하지 않고
//  NOT_RUN(BLOCKED_CONTRACT_CONFLICT)으로 둔다. 충돌은 표에서 기계적으로 도출한다(engineLayerConflicts) — 기준을 바꾸지 않고, 결정은
//  사람의 몫이다(README·ADR의 결정안).
//
// 공개 API:
//   engineLayerConflicts(table?): EngineLayerConflict[]
//   deriveNegativeControlEntry(spec, layer, obs, expectedBinding): DerivedEntry            순수 판정(실행기와 기록 읽기가 같은 함수를 쓴다)
//   NEGATIVE_MUTATIONS                                                                      표의 id마다 입력 변형(표와 같은 id 집합)
//   runNegativeControls(deps, inputs): Promise<NegativeControlSuite>
//   SUITE_SCHEMA / 스위트 타입들

import { canonicalJson } from "./canonical";
import {
  NEGATIVE_CONTROL_TABLE,
  defaultNegativeControls,
  type NegativeControlSpec,
} from "./control";
import {
  defaultInitializationOptions,
  runEngineDiagnostic,
  runHarness,
  type HarnessDeps,
  type HarnessOptions,
  type HarnessResult,
} from "./harness";
import { keyIsSameOrInside } from "./path-containment";
import { parseRulesFiles } from "./rules-manifest";
import { isValidRunId } from "./run-id";
import type { SessionLimits } from "./session";
import type { InitializationOptions } from "./settings";
import { sha256Hex } from "./sha";
import {
  STATUS_PRIORITY,
  statusRank,
  type FailureStatus,
  type MeasurementStatus,
  type ReasonCode,
} from "./status";
import type {
  Clock,
  FsPort,
  GitPort,
  MetricsObserver,
  NegativeControlOutcome,
  NegativeControlResult,
  Pin,
  ProcessPort,
  Provenance,
  RuleFileEntry,
  RunLockSummary,
  ScopeConfig,
  ForeignServerObservationSummary,
  ToolObservationSummary,
} from "./types";

export const SUITE_SCHEMA = "semgrep-lsp-negative-controls/1";

type Layer = NegativeControlResult["layer"];

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// ── 계약 충돌 ────────────────────────────────────────────────────

export interface EngineLayerConflict {
  id: string;
  /** 표의 엔진 기대 상태. */
  expected: MeasurementStatus;
  /** 같은 변형이 사전 검사에서 반드시 내는 사유와 그 상태 — 기대 상태보다 우선순위가 앞선다. */
  outranked_by: { reason: ReasonCode; status: FailureStatus };
}

const isFailureStatus = (status: MeasurementStatus): status is FailureStatus =>
  (STATUS_PRIORITY as readonly string[]).includes(status);

/**
 * 엔진 층의 기대 상태가 대표 상태가 될 수 없는 (id)를 표에서 도출한다. 변형이 사전 검사 사유를 반드시 내는 id(preflight가 있는 id)는
 * 엔진을 띄워도 그 사유가 판정에 남는다(진단은 사유를 담은 채 띄운다). 그 사유의 상태가 엔진 기대보다 우선순위가 앞서면 기대는
 * 대표 상태가 되지 못한다. 표를 바꾸지 않고 읽기만 한다.
 */
export function engineLayerConflicts(
  table: readonly NegativeControlSpec[] = NEGATIVE_CONTROL_TABLE
): EngineLayerConflict[] {
  const out: EngineLayerConflict[] = [];
  for (const spec of table) {
    if (spec.preflight === null || !isFailureStatus(spec.expected)) continue;
    if (statusRank(spec.preflight.status as FailureStatus) < statusRank(spec.expected)) {
      out.push({
        id: spec.id,
        expected: spec.expected,
        outranked_by: {
          reason: spec.preflight.reason,
          status: spec.preflight.status as FailureStatus,
        },
      });
    }
  }
  return out;
}

// ── 순수 판정: 관측 → 항목 ───────────────────────────────────────

/** 한 실행에서 읽은 사실. 실행기는 HarnessResult에서, 기록 읽기는 디스크의 run.json에서 만든다. */
export interface LayerObservation {
  /** 증거 9개가 쓰인 실행이 있었는가(하드 실패·예외가 아니다). */
  recorded: boolean;
  /** 엔진 프로세스가 실제로 떴는가(PH1에 이르렀다). */
  spawned: boolean;
  /** 띄우려는 시도가 있었는가(떴거나 SPAWN_FAILED). */
  attempted: boolean;
  status: MeasurementStatus | null;
  reasonCodes: readonly ReasonCode[];
  binding: string | null;
  provenance: Provenance | null;
  cancelled: boolean;
  /** 엔진 진단 실행이었는가(resources.engine_diagnostic이 있는가). 엔진 층은 true, 사전 검사 층은 false여야 한다. */
  diagnostic: boolean;
}

export interface DerivedEntry {
  entry: NegativeControlResult;
  outcome: NegativeControlOutcome;
}

/** 실행하지 않았거나 관측이 성립하지 않은 항목: 관측 없음·NOT_RUN·결합 null. 이유는 outcome 토큰이다. */
export function notRunEntry(
  spec: NegativeControlSpec,
  layer: Layer,
  outcome: NegativeControlOutcome
): DerivedEntry {
  return {
    entry: {
      id: spec.id,
      layer,
      expected: layer === "preflight" ? (spec.preflight?.status ?? spec.expected) : spec.expected,
      observed: null,
      status: "NOT_RUN",
      binding_sha256: null,
    },
    outcome,
  };
}

/**
 * 관측으로 항목을 정한다(순수). expectedBinding은 기준 실행의 결합이며, 관측의 결합이 다르면 관측을 쓰지 않는다.
 * 순서가 곧 계약이다: 충돌 → 취소 → 실행 근거 → 결합 → 층별 시작 조건 → 기대 대조.
 */
export function deriveNegativeControlEntry(
  spec: NegativeControlSpec,
  layer: Layer,
  obs: LayerObservation,
  expectedBinding: string | null,
  conflicts: readonly EngineLayerConflict[] = engineLayerConflicts()
): DerivedEntry {
  if (layer === "preflight" && spec.preflight === null)
    return notRunEntry(spec, layer, "NO_SUCH_LAYER");
  if (layer === "engine" && conflicts.some((c) => c.id === spec.id)) {
    return notRunEntry(spec, layer, "BLOCKED_CONTRACT_CONFLICT");
  }
  if (obs.cancelled) return notRunEntry(spec, layer, "CANCELLED");
  if (!obs.recorded || obs.status === null) return notRunEntry(spec, layer, "RUN_FAILED");
  if (obs.binding === null || expectedBinding === null) {
    return notRunEntry(spec, layer, "BINDING_UNAVAILABLE");
  }
  if (obs.binding !== expectedBinding) return notRunEntry(spec, layer, "BINDING_DRIFT");
  // 엔진 층은 진단 실행이어야 하고 사전 검사 층은 진단 실행이 아니어야 한다(두 층의 실행을 서로 바꿔 쓰지 않는다).
  if ((layer === "engine") !== obs.diagnostic) return notRunEntry(spec, layer, "RUN_FAILED");
  if (layer === "engine" && !obs.spawned) return notRunEntry(spec, layer, "ENGINE_NOT_STARTED");

  const expected =
    layer === "preflight"
      ? (spec.preflight as NonNullable<NegativeControlSpec["preflight"]>).status
      : spec.expected;
  const causeSeen = spec.preflight === null || obs.reasonCodes.includes(spec.preflight.reason);
  // 사전 검사 층은 엔진을 띄우려 한 시도가 있으면 안 된다(막아야 할 것을 못 막았다 → FAIL).
  const passes = obs.status === expected && causeSeen && (layer === "engine" || !obs.attempted);
  return {
    entry: {
      id: spec.id,
      layer,
      expected,
      observed: obs.status,
      status: passes ? "PASS" : "FAIL",
      binding_sha256: obs.binding,
    },
    outcome: "EXECUTED",
  };
}

// ── 입력 변형 ────────────────────────────────────────────────────

export type MutationKind =
  | "RULES_REMOVE_FILE"
  | "RULES_BREAK_YAML"
  | "RULES_ADD_BROKEN_FILE"
  | "RULES_ADD_VALID_FILE"
  | "RULES_CHANGE_BODY"
  | "OPTIONS_NONEXISTENT_CONFIG"
  | "OPTIONS_SCAN_UNKNOWN_KEY"
  | "OPTIONS_OUTSIDE_CONFIG"
  | "OPTIONS_METRICS_UNKNOWN_KEY";

/** 규칙 캐시 사본에 가하는 변경. 경로는 캐시 기준 상대 경로('/' 구분)다. */
export interface RulesPatch {
  omit: string[];
  replace: Record<string, Uint8Array>;
  add: Record<string, Uint8Array>;
}

interface OptionsContext {
  base: InitializationOptions;
  cacheDir: string;
  /** 사본 밖(작업 디렉터리 밖) 절대 경로에 둔 규칙 구성 디렉터리. */
  outsideConfig: string;
  build(configuration: string[]): InitializationOptions;
}

export interface Mutation {
  kind: MutationKind;
  rules:
    | ((files: readonly RuleFileEntry[], original: ReadonlyMap<string, Uint8Array>) => RulesPatch)
    | null;
  options: ((ctx: OptionsContext) => unknown) | null;
  /** 변형하지 않은 규칙 사본을 캐시 밖 절대 경로에도 두는가. */
  outsideCopy: boolean;
}

const noPatch = (): RulesPatch => ({ omit: [], replace: {}, add: {} });

/** YAML로 해석되지 않도록 닫지 않은 흐름 시퀀스를 담는다. 규칙 YAML은 해석하지 않으므로(바이트 비교) 구문 유효성은 확인하지 않았다. */
const BROKEN_YAML = encoder.encode(["rules: [", "  - id: negative-control-broken", ""].join("\n"));
/** 구문을 유지하려는 의도로 쓴 새 규칙 파일. 해석하지 않으므로 유효성은 확인하지 않았다. */
const VALID_NEW_RULE = encoder.encode(
  [
    "rules:",
    "  - id: negative-control-added",
    "    message: negative control (never expected)",
    "    severity: WARNING",
    "    languages: [javascript]",
    "    pattern: negativeControlAdded($X)",
    "",
  ].join("\n")
);

function dirOf(path: string): string {
  return path.slice(0, path.lastIndexOf("/"));
}

function first(files: readonly RuleFileEntry[]): RuleFileEntry {
  if (files.length === 0) throw new Error("규칙 파일 목록이 비어 있다");
  return files[0];
}

/** 첫 규칙 파일의 본문을 바꾼다: message 줄이 있으면 그 값을 늘리고, 없으면 끝에 주석 줄을 붙인다(어느 쪽이든 바이트가 달라진다). */
function changeBody(bytes: Uint8Array): Uint8Array {
  const text = decoder.decode(bytes);
  const changed = /^(\s*message:\s*)(.+)$/m.test(text)
    ? text.replace(/^(\s*message:\s*)(.+)$/m, "$1$2 (negative control)")
    : `${text}${text.endsWith("\n") || text === "" ? "" : "\n"}# negative control: body changed\n`;
  return encoder.encode(changed);
}

function withUnknownKey(base: InitializationOptions, section: "scan" | "metrics"): unknown {
  const copy = structuredClone(base) as unknown as Record<string, Record<string, unknown>>;
  copy[section].negativeControlUnknownKey = true;
  return copy;
}

/** 표의 id마다 입력 변형 하나. 표와 같은 id 집합이어야 한다(구조 시험이 지킨다). 기대 상태·사례 목록은 여기에 두지 않는다. */
export const NEGATIVE_MUTATIONS: Readonly<Record<string, Mutation>> = {
  R1: {
    kind: "RULES_REMOVE_FILE",
    rules: (files) => ({ ...noPatch(), omit: [first(files).path] }),
    options: null,
    outsideCopy: false,
  },
  R2: {
    kind: "RULES_BREAK_YAML",
    rules: (files) => ({ ...noPatch(), replace: { [first(files).path]: BROKEN_YAML } }),
    options: null,
    outsideCopy: false,
  },
  R3: {
    kind: "RULES_ADD_BROKEN_FILE",
    rules: (files) => ({
      ...noPatch(),
      add: { [`${dirOf(first(files).path)}/zz-negative-control-broken.yaml`]: BROKEN_YAML },
    }),
    options: null,
    outsideCopy: false,
  },
  R4: {
    kind: "RULES_ADD_VALID_FILE",
    rules: (files) => ({
      ...noPatch(),
      add: { [`${dirOf(first(files).path)}/zz-negative-control-added.yaml`]: VALID_NEW_RULE },
    }),
    options: null,
    outsideCopy: false,
  },
  R5: {
    kind: "RULES_CHANGE_BODY",
    rules: (files, original) => {
      const target = first(files).path;
      const bytes = original.get(target);
      if (bytes === undefined) throw new Error("본문을 바꿀 규칙 파일의 원본을 읽지 못했다");
      return { ...noPatch(), replace: { [target]: changeBody(bytes) } };
    },
    options: null,
    outsideCopy: false,
  },
  R6: {
    kind: "OPTIONS_NONEXISTENT_CONFIG",
    rules: null,
    options: (ctx) => ctx.build([`${ctx.cacheDir}/negative-control-nonexistent`]),
    outsideCopy: false,
  },
  R7: {
    kind: "OPTIONS_SCAN_UNKNOWN_KEY",
    rules: null,
    options: (ctx) => withUnknownKey(ctx.base, "scan"),
    outsideCopy: false,
  },
  R8: {
    kind: "OPTIONS_OUTSIDE_CONFIG",
    rules: null,
    options: (ctx) => ctx.build([ctx.outsideConfig]),
    outsideCopy: true,
  },
  R9: {
    kind: "OPTIONS_METRICS_UNKNOWN_KEY",
    rules: null,
    options: (ctx) => withUnknownKey(ctx.base, "metrics"),
    outsideCopy: false,
  },
};

// ── 스위트 기록 ──────────────────────────────────────────────────

/** 변형이 무엇을 바꿨는가(해시와 규칙 경로 토큰뿐 — 환경 경로·본문은 싣지 않는다). 기준 실행과의 관계를 따라갈 수 있게 한다. */
export interface MutationTrace {
  kind: MutationKind;
  /** 변형하지 않은 기준 실행의 run id. */
  baseline_run_id: string;
  rules: {
    omitted: string[];
    replaced: { path: string; before_sha256: string; after_sha256: string }[];
    added: { path: string; after_sha256: string }[];
  } | null;
  options: { before_sha256: string; after_sha256: string } | null;
}

/** 한 실행의 증거를 가리키는 참조. 읽는 쪽은 디스크의 run.json을 다시 읽어 이 참조와 맞춰 본다. */
export interface CaseEvidenceRef {
  run_id: string;
  run_json_sha256: string;
}

export interface NegativeControlCaseTrace {
  id: string;
  layer: Layer;
  outcome: NegativeControlOutcome;
  mutation: MutationTrace | null;
  evidence: CaseEvidenceRef | null;
}

export interface NegativeControlSuite {
  schema: typeof SUITE_SCHEMA;
  suite_id: string;
  /** 기준 실행의 출처. 기준 실행이 없으면 null. stub이면 실제 엔진의 증거가 아니다. */
  provenance: Provenance | null;
  /** 기준 실행의 결합. 모든 PASS/FAIL 항목은 이 결합과 같아야 한다. 없으면 null. */
  binding_sha256: string | null;
  baseline: { run_id: string; clean: boolean; evidence: CaseEvidenceRef | null };
  /** 표의 (id, 층) 전부(엔진 9 + 사전 검사 7). 관측하지 못한 항목은 NOT_RUN이다. */
  entries: NegativeControlResult[];
  cases: NegativeControlCaseTrace[];
  /** 기준을 바꾸지 않고 남긴 계약 충돌(결정 필요). */
  conflicts: EngineLayerConflict[];
  /** 이 스위트가 **세워 주지 않는** 것. */
  not_established: {
    /** 실제 엔진이 변형에 어떻게 반응하는지(스텁 출처이면 더 말할 것이 없다). */
    actual_engine_behavior: "UNVERIFIED";
    /** 규칙 YAML의 구문 유효성은 해석하지 않으므로 확인하지 않았다(R2~R5). */
    mutated_yaml_validity: "UNVERIFIED";
  };
}

// ── 실행기 ───────────────────────────────────────────────────────

/** 실행 한 번의 신원. 포트·자원을 고르는 데 쓴다. */
export interface RunKey {
  /** "baseline" 또는 표의 id. */
  id: string;
  layer: Layer;
  runId: string;
  /** 이 실행의 작업 공간 루트(spawn 작업 폴더). */
  root: string;
  /** 이 실행의 대조 트리(서버가 스캔하는 트리). */
  treeRoot: string;
}

/** 사례 한 번 동안 쥐는 자원(공유 잠금·루프백 수신기·다른 서버 관측). 호출자가 얻고 정리한다. */
export interface CaseResources {
  lockHeld: boolean | null;
  lockRefusal?: string | null;
  lockSummary?: RunLockSummary | null;
  foreignServerProcesses: number | null;
  foreignProcessObservation?: ForeignServerObservationSummary | null;
  metricsReceiverHits: number | null;
  metricsReceiver?: MetricsObserver | null;
  /** 자식 프로세스 환경(수신기 주소·상태 폴더가 실행마다 다르다). */
  spawnEnv: Readonly<Record<string, string>>;
}

export interface NegativeControlDeps {
  fs: FsPort;
  git: GitPort;
  clock: Clock;
  /** 엔진 층에서 쓸 프로세스 포트. 사전 검사 층은 이 포트의 출처(provenance)만 읽고 띄우지 못하게 감싼다. */
  processFor(key: RunKey): ProcessPort;
  /** 사례 한 번 동안 자원을 쥐고 fn을 부른다. fn이 끝나면 어떤 경로로든 정리한다. */
  withResources<T>(key: RunKey, fn: (resources: CaseResources) => Promise<T>): Promise<T>;
}

export interface NegativeControlInputs {
  /** 실행 식별자 접두. 사례 run id는 `<suiteId>-<사례>`다(run-id 규칙을 따른다). */
  suiteId: string;
  /** 사례별 작업 공간 루트. 원본 규칙·대조 예제·증거 폴더와 겹치면 안 된다. */
  workRoot: string;
  evidenceRoot: string;
  dataDir: string;
  harnessRoot: string;
  /** 원본 규칙 캐시(읽기 전용 — 사본을 만들어 쓴다). */
  rulesCacheRoot: string;
  /** 원본 대조 예제 루트(읽기 전용). */
  controlFixturesRoot: string;
  spawn: { command: string; args: readonly string[] };
  limits: SessionLimits;
  settings: HarnessOptions["settings"];
  /** 이 스위트의 도구 관측(한 번). 결합에 들어간다. */
  toolVersionObserved: string | null;
  wheelSha256Observed: string | null;
  toolObservation?: ToolObservationSummary | null;
  logFormat?: HarnessOptions["logFormat"];
  signal?: AbortSignal;
  secrets?: readonly string[];
}

const joinPath = (root: string, name: string): string => `${root.replace(/[\\/]+$/, "")}/${name}`;

function bytesSha(bytes: Uint8Array): string {
  return sha256Hex(bytes);
}

/** 프로세스를 띄우지 못하게 감싼 포트. 시도 횟수를 센다. 출처는 감싼 포트와 같다(같은 출처의 기록이어야 비교된다). */
function refusingPort(provenance: Provenance): { port: ProcessPort; attempts: () => number } {
  let attempts = 0;
  return {
    port: {
      provenance,
      async spawn() {
        attempts++;
        throw new Error("음성 대조의 사전 검사 층은 엔진을 띄우지 않는다");
      },
    },
    attempts: () => attempts,
  };
}

interface ExecutedRun {
  key: RunKey;
  result: HarnessResult | null;
  spawnAttempts: number;
  cancelled: boolean;
  failure: NegativeControlOutcome | null;
  trace: MutationTrace | null;
}

function observationOf(run: ExecutedRun): LayerObservation {
  const record = run.result?.ok === true ? run.result.record : null;
  const reasons = record?.measurement.reasons.map((r) => r.code) ?? [];
  const spawned = run.result?.started === true;
  return {
    recorded: record !== null,
    spawned,
    attempted: spawned || run.spawnAttempts > 0 || reasons.includes("SPAWN_FAILED"),
    status: record?.measurement.status ?? null,
    reasonCodes: reasons,
    binding: record?.inputs.binding_sha256 ?? null,
    provenance: record?.provenance ?? null,
    cancelled: run.cancelled,
    diagnostic: record?.resources?.engine_diagnostic != null,
  };
}

function evidenceRefOf(run: ExecutedRun): CaseEvidenceRef | null {
  const sha = run.result?.evidence?.runJsonSha256;
  return run.result?.ok === true && sha !== undefined
    ? { run_id: run.key.runId, run_json_sha256: sha }
    : null;
}

async function readAll(
  fs: FsPort,
  root: string,
  files: readonly RuleFileEntry[]
): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  for (const file of files) out.set(file.path, await fs.readFile(joinPath(root, file.path)));
  return out;
}

async function writeTree(
  fs: FsPort,
  root: string,
  entries: ReadonlyMap<string, Uint8Array>
): Promise<void> {
  for (const [path, bytes] of entries) {
    const target = joinPath(root, path);
    await fs.mkdirp(target.slice(0, target.lastIndexOf("/")));
    await fs.writeFileExclusive(target, bytes);
  }
}

/** 사례 작업 공간이 원본·증거와 겹치지 않는지 본다(읽기만). 풀 수 없으면 겹친다고 본다(fail-closed). */
async function workRootProblems(fs: FsPort, inputs: NegativeControlInputs): Promise<string | null> {
  try {
    const work = await fs.physicalKey(inputs.workRoot);
    const evidence = await fs.physicalKey(inputs.evidenceRoot);
    if (keyIsSameOrInside(work, evidence) || keyIsSameOrInside(evidence, work)) {
      return "WORK_ROOT_OVERLAPS_EVIDENCE";
    }
    for (const [name, path] of [
      ["rules-cache", inputs.rulesCacheRoot],
      ["fixtures", inputs.controlFixturesRoot],
      ["data", inputs.dataDir],
      ["harness", inputs.harnessRoot],
    ] as const) {
      const original = await fs.physicalKey(path);
      if (keyIsSameOrInside(work, original) || keyIsSameOrInside(original, work)) {
        return `WORK_ROOT_OVERLAPS_${name.toUpperCase()}`;
      }
    }
    return null;
  } catch {
    return "WORK_ROOT_UNRESOLVABLE";
  }
}

interface FixedInputs {
  pin: Pin;
  scopeConfig: ScopeConfig;
  rulesFiles: RuleFileEntry[];
  originalBytes: Map<string, Uint8Array>;
}

async function readFixedInputs(fs: FsPort, inputs: NegativeControlInputs): Promise<FixedInputs> {
  const read = async (name: string): Promise<Uint8Array> =>
    fs.readFile(joinPath(inputs.dataDir, name));
  const pin = JSON.parse(decoder.decode(await read("pin.json"))) as Pin;
  const scopeConfig = JSON.parse(decoder.decode(await read("scope.json"))) as ScopeConfig;
  const rulesFiles = parseRulesFiles(decoder.decode(await read("rules-files.tsv")));
  const originalBytes = await readAll(fs, inputs.rulesCacheRoot, rulesFiles);
  return { pin, scopeConfig, rulesFiles, originalBytes };
}

export async function runNegativeControls(
  deps: NegativeControlDeps,
  inputs: NegativeControlInputs
): Promise<NegativeControlSuite> {
  const conflicts = engineLayerConflicts();
  const cases: NegativeControlCaseTrace[] = [];
  const entries = defaultNegativeControls();
  const setEntry = (derived: DerivedEntry): void => {
    const at = entries.findIndex(
      (e) => e.id === derived.entry.id && e.layer === derived.entry.layer
    );
    if (at >= 0) entries[at] = derived.entry;
  };
  const baselineRunId = `${inputs.suiteId}-baseline`;

  const finish = (
    provenance: Provenance | null,
    binding: string | null,
    clean: boolean,
    baselineEvidence: CaseEvidenceRef | null
  ): NegativeControlSuite => ({
    schema: SUITE_SCHEMA,
    suite_id: inputs.suiteId,
    provenance,
    binding_sha256: binding,
    baseline: { run_id: baselineRunId, clean, evidence: baselineEvidence },
    entries,
    cases,
    conflicts,
    not_established: { actual_engine_behavior: "UNVERIFIED", mutated_yaml_validity: "UNVERIFIED" },
  });

  /** 실행하지 않은 (id, 층) 전부를 같은 이유로 NOT_RUN 처리한다. 충돌 항목은 이유가 충돌로 남는다. */
  const notRunAll = (outcome: NegativeControlOutcome): void => {
    for (const spec of NEGATIVE_CONTROL_TABLE) {
      for (const layer of ["preflight", "engine"] as const) {
        if (layer === "preflight" && spec.preflight === null) continue;
        const blocked = layer === "engine" && conflicts.some((c) => c.id === spec.id);
        const derived = notRunEntry(spec, layer, blocked ? "BLOCKED_CONTRACT_CONFLICT" : outcome);
        setEntry(derived);
        cases.push({
          id: spec.id,
          layer,
          outcome: derived.outcome,
          mutation: null,
          evidence: null,
        });
      }
    }
  };

  if (!isValidRunId(baselineRunId)) {
    notRunAll("WORKSPACE_FAILED");
    return finish(null, null, false, null);
  }
  const overlap = await workRootProblems(deps.fs, inputs);
  let fixed: FixedInputs;
  try {
    if (overlap !== null) throw new Error(overlap);
    fixed = await readFixedInputs(deps.fs, inputs);
  } catch {
    notRunAll("WORKSPACE_FAILED");
    return finish(null, null, false, null);
  }
  const cacheDir = fixed.pin.rules.cache_dir_name;

  /** 한 실행: 사례별 작업 공간을 만들고(원본은 읽기만), 층에 맞는 진입점으로 돌린다. 던지지 않는다. */
  const execute = async (
    id: string,
    layer: Layer,
    mutation: Mutation | null
  ): Promise<ExecutedRun> => {
    const runId = `${inputs.suiteId}-${id === "baseline" ? "baseline" : `${id.toLowerCase()}-${layer}`}`;
    const root = joinPath(inputs.workRoot, runId);
    const key: RunKey = { id, layer, runId, root, treeRoot: joinPath(root, "tree") };
    const base: ExecutedRun = {
      key,
      result: null,
      spawnAttempts: 0,
      cancelled: false,
      failure: null,
      trace: null,
    };
    if (!isValidRunId(runId)) return { ...base, failure: "WORKSPACE_FAILED" };
    if (inputs.signal?.aborted) return { ...base, cancelled: true, failure: "CANCELLED" };

    // 작업 공간: 규칙 캐시 사본(변형 적용)과, 필요하면 캐시 밖 절대 경로의 변형하지 않은 사본.
    let patch = noPatch();
    let trace: MutationTrace | null = null;
    let initializationOptions: unknown;
    try {
      const copy = new Map(fixed.originalBytes);
      if (mutation?.rules) {
        patch = mutation.rules(fixed.rulesFiles, fixed.originalBytes);
        for (const path of patch.omit) copy.delete(path);
        for (const [path, bytes] of Object.entries(patch.replace)) copy.set(path, bytes);
        for (const [path, bytes] of Object.entries(patch.add)) copy.set(path, bytes);
      }
      await writeTree(deps.fs, joinPath(root, cacheDir), copy);
      const outsideRoot = `${root}-outside`;
      if (mutation?.outsideCopy) {
        await writeTree(deps.fs, joinPath(outsideRoot, cacheDir), fixed.originalBytes);
      }
      const baseOptions = defaultInitializationOptions(
        fixed.pin,
        fixed.scopeConfig,
        inputs.settings
      );
      if (mutation?.options) {
        initializationOptions = mutation.options({
          base: baseOptions,
          cacheDir,
          outsideConfig: joinPath(outsideRoot, fixed.pin.rules.config_dirs[0]),
          build: (configuration) =>
            defaultInitializationOptions(
              { rules: { ...fixed.pin.rules, config_dirs: configuration } },
              fixed.scopeConfig,
              inputs.settings
            ),
        });
      }
      if (mutation) {
        trace = {
          kind: mutation.kind,
          baseline_run_id: baselineRunId,
          rules: mutation.rules
            ? {
                omitted: [...patch.omit],
                replaced: Object.entries(patch.replace).map(([path, bytes]) => ({
                  path,
                  before_sha256: bytesSha(fixed.originalBytes.get(path) ?? new Uint8Array()),
                  after_sha256: bytesSha(bytes),
                })),
                added: Object.entries(patch.add).map(([path, bytes]) => ({
                  path,
                  after_sha256: bytesSha(bytes),
                })),
              }
            : null,
          options: mutation.options
            ? {
                before_sha256: sha256Hex(canonicalJson(baseOptions)),
                after_sha256: sha256Hex(canonicalJson(initializationOptions)),
              }
            : null,
        };
      }
    } catch {
      return { ...base, failure: "WORKSPACE_FAILED" };
    }

    const enginePort = deps.processFor(key);
    const guard = layer === "preflight" ? refusingPort(enginePort.provenance) : null;
    const harnessDeps: HarnessDeps = {
      fs: deps.fs,
      git: deps.git,
      process: guard?.port ?? enginePort,
      clock: deps.clock,
    };
    try {
      const result = await deps.withResources(key, async (resources) => {
        const options: HarnessOptions = {
          mode: "control",
          targetSha: null,
          runId,
          dataDir: inputs.dataDir,
          harnessRoot: inputs.harnessRoot,
          evidenceRoot: inputs.evidenceRoot,
          rulesCacheRoot: joinPath(root, cacheDir),
          scanRoot: joinPath(root, "UNUSED-IN-THIS-MODE"),
          controlFixturesRoot: inputs.controlFixturesRoot,
          controlTreeRoot: key.treeRoot,
          spawn: {
            command: inputs.spawn.command,
            args: [...inputs.spawn.args],
            cwd: root,
            env: resources.spawnEnv,
          },
          limits: inputs.limits,
          settings: inputs.settings,
          ...(initializationOptions === undefined ? {} : { initializationOptions }),
          controlReference: null,
          toolVersionObserved: inputs.toolVersionObserved,
          wheelSha256Observed: inputs.wheelSha256Observed,
          ...(inputs.toolObservation === undefined
            ? {}
            : { toolObservation: inputs.toolObservation }),
          lockHeld: resources.lockHeld,
          ...(resources.lockRefusal === undefined ? {} : { lockRefusal: resources.lockRefusal }),
          ...(resources.lockSummary === undefined ? {} : { lockSummary: resources.lockSummary }),
          foreignServerProcesses: resources.foreignServerProcesses,
          ...(resources.foreignProcessObservation === undefined
            ? {}
            : { foreignProcessObservation: resources.foreignProcessObservation }),
          metricsReceiverHits: resources.metricsReceiverHits,
          ...(resources.metricsReceiver === undefined
            ? {}
            : { metricsReceiver: resources.metricsReceiver }),
          ...(inputs.logFormat === undefined ? {} : { logFormat: inputs.logFormat }),
          ...(inputs.signal === undefined ? {} : { signal: inputs.signal }),
          ...(inputs.secrets === undefined ? {} : { secrets: inputs.secrets }),
        };
        return layer === "engine" || id === "baseline"
          ? runEngineDiagnostic(harnessDeps, options)
          : runHarness(harnessDeps, options);
      });
      return {
        ...base,
        result,
        spawnAttempts: guard?.attempts() ?? 0,
        cancelled: inputs.signal?.aborted === true,
        trace,
      };
    } catch {
      return {
        ...base,
        spawnAttempts: guard?.attempts() ?? 0,
        cancelled: inputs.signal?.aborted === true,
        failure: "RUN_FAILED",
        trace,
      };
    }
  };

  // 기준 실행: 변형하지 않은 입력을 엔진 진단 진입점으로 돌린다. 깨끗한 입력에서는 정상 실행과 같다(사유가 없어 시작을 막지 않는다).
  const baseline = await execute("baseline", "engine", null);
  const baselineObs = observationOf(baseline);
  const baselineClean =
    baselineObs.recorded &&
    baselineObs.spawned &&
    baselineObs.status === "COMPLETE" &&
    baselineObs.binding !== null &&
    !baselineObs.cancelled;
  const binding = baselineClean ? baselineObs.binding : null;
  const baselineEvidence = evidenceRefOf(baseline);

  for (const spec of NEGATIVE_CONTROL_TABLE) {
    const mutation = NEGATIVE_MUTATIONS[spec.id] ?? null;
    for (const layer of ["preflight", "engine"] as const) {
      if (layer === "preflight" && spec.preflight === null) continue;
      const blocked = layer === "engine" && conflicts.some((c) => c.id === spec.id);
      let derived: DerivedEntry;
      let evidence: CaseEvidenceRef | null = null;
      let trace: MutationTrace | null = null;
      if (blocked) {
        derived = notRunEntry(spec, layer, "BLOCKED_CONTRACT_CONFLICT");
      } else if (!baselineClean) {
        derived = notRunEntry(
          spec,
          layer,
          baselineObs.cancelled ? "CANCELLED" : "BASELINE_NOT_CLEAN"
        );
      } else if (mutation === null) {
        derived = notRunEntry(spec, layer, "WORKSPACE_FAILED");
      } else {
        const run = await execute(spec.id, layer, mutation);
        trace = run.trace;
        evidence = evidenceRefOf(run);
        if (run.failure !== null) {
          derived = notRunEntry(spec, layer, run.failure);
        } else {
          const obs = observationOf(run);
          // 출처가 기준 실행과 다른 관측은 같은 결합으로 묶을 수 없다(스텁 관측을 실제 기록에 섞지 않는다).
          derived =
            obs.provenance !== baselineObs.provenance
              ? notRunEntry(spec, layer, "BINDING_DRIFT")
              : deriveNegativeControlEntry(spec, layer, obs, binding, conflicts);
        }
      }
      setEntry(derived);
      cases.push({ id: spec.id, layer, outcome: derived.outcome, mutation: trace, evidence });
    }
  }
  return finish(baselineObs.provenance, binding, baselineClean, baselineEvidence);
}
