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
// ── 시작 전 관문(실행기와 기록 읽기가 같은 함수를 쓴다) ──────────────
//  · 도구 관측 격리(toolIsolationBlock): 도구 버전 확인 단계에서 루프백 수신기가 본 요청이 0건으로 확인되지 않으면(1건 이상이거나, 관측하지
//    못했거나, 요약이 없으면) 기준·변형 실행을 하나도 시작하지 않고 16개 모두 NOT_RUN(TOOL_OBSERVATION_BLOCKED)이다. 사례마다 수신기를 새로
//    열어도 이 단계의 관측은 버리지 않는다. null을 0으로 보정하지 않고, 관측값(metrics_hits_during)도 바꾸지 않는다.
//  · 출력 경로(outputPathProblem): 실제로 쓰게 될 경로 — 사례별 증거 폴더와 그 안의 증거 파일·표지·상태 폴더, 사례별 작업 공간·밖 사본·
//    대조 트리, 그리고 규칙 사본·밖 사본·대조 트리 안의 파일 경로 하나하나 — 가 원본(규칙 캐시·대조 예제·고정 데이터·하네스) 안에
//    들어가는지 쓰기 전에 본다. 사례 폴더 루트만이 아니라 그 아래(캐시 루트·하위 폴더)의 링크도 걸러진다. 링크·별칭·`..`는
//    FsPort.physicalKey가 푼 자리 기준이고, 검사할 경로와 실제로 쓰는 경로는 같은 조립 함수(runKeyOf·planRulesCopy·treeTarget)에서 나온다.
//
// ── 엔진 층의 관측 계약(선택지 B) ────────────────────────────────
//  엔진 층 PASS는 "엔진이 떴고 대표 상태가 기대와 같다"만으로 만들지 않는다.
//  · 관측 단계: 모든 엔진 사례의 입력 변형(규칙 사본·구성 경로·서버 옵션)은 규칙 로딩(PH2)에서 엔진에 닿는다. PH2에 이르기 전(PH0·PH1)의
//    초기화·전송·프로세스 실패, 전송 무결성 실패, 또는 PH2 안에서 서버가 죽거나 프레임이 깨지거나 취소된 경우는 관측이 성립하지 않은 것이라
//    NOT_RUN이다 — 사전 검사 사유(또는 RULES_NOT_LOADED)가 대표 상태를 정해 그 실패를 가려도 마찬가지다(ENGINE_EXECUTION_FAILED /
//    ENGINE_STAGE_NOT_REACHED). 규칙 로딩에 대한 반응과 그 단계의 대기 시간 초과(TIMEOUT_RULES)는 사례가 의도한 관측일 수 있어 실행
//    실패로 보지 않는다. 관측 단계 뒤(스캔·종료)의 실패는 이 사례의 관측과 무관해 막지 않는다.
//  · 엔진 고유 관측: 사전 검사 사유가 있는 id(R1~R5·R7·R9)는 사전 검사 사유가 이미 대표 상태를 정하므로 상태 일치는 엔진이 변형을 따로 잡았다는
//    증거가 아니다. 그 id의 엔진 PASS에는 엔진이 낸 반응 사유(규칙 로딩 로그·진단 집합 변화 등)가 필요한데, 그 로그·진단 형식의 계약이
//    확정되지 않았다(ADR U3·U11). 확정된 계약이 없는 동안(ENGINE_OBSERVATION_CONTRACTS가 비어 있다) 이 id들의 엔진 항목은 실행해도
//    NOT_RUN(ENGINE_OBSERVATION_UNCONFIRMED)이다. 사전 검사 사유가 없는 id(R6·R8)는 아무것도 상태를 가리지 않아 대표 상태가 곧 엔진의 반응이다.
//  기대 상태·상태 우선순위는 바꾸지 않았다.
//
// 공개 API:
//   engineLayerConflicts(table?): EngineLayerConflict[]
//   deriveNegativeControlEntry(spec, layer, obs, expectedBinding, conflicts?, contracts?): DerivedEntry   순수 판정(실행기와 기록 읽기가 같은 함수를 쓴다)
//   toolIsolationBlock(observation): ToolIsolationCause | null                              도구 관측 격리 관문(순수)
//   engineExecutionProblem(obs): ... | null                                                 관측 단계 전의 실행 실패(순수)
//   caseRunId(suiteId, id, layer) / plannedRunIds(suiteId)                                 사례 run id(실행기와 기록 읽기가 같은 규칙)
//   outputPathProblem(fs, inputs): Promise<string | null>                                   원본 보호(inputs.plan이 있으면 파일 경로까지)
//   writePlanFor(fs, inputs): Promise<WritePlan | null>                                     쓰기 계획(읽기만) — CLI가 쓰기 전에 outputPathProblem에 넘긴다
//   plannedRuns(suiteId) / SUITE_RECORD_FILE                                                스위트가 돌릴 실행 목록 / 스위트 기록 파일 이름
//   NEGATIVE_MUTATIONS                                                                      표의 id마다 입력 변형(표와 같은 id 집합)
//   runNegativeControls(deps, inputs): Promise<NegativeControlSuite>
//   SUITE_SCHEMA / 스위트 타입들

import { canonicalJson } from "./canonical";
import {
  NEGATIVE_CONTROL_TABLE,
  defaultNegativeControls,
  type NegativeControlSpec,
} from "./control";
import { readControlExpectations } from "./control-expectations";
import {
  CHILD_HOME_DIR,
  EVIDENCE_FILE_NAMES,
  RUN_MARKER_FILE,
  SERVER_STATE_DIR,
  VERSION_STATE_DIR,
} from "./evidence";
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
  REASON_STATUS,
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
  NegativeControlCaseIdentity,
  NegativeControlOutcome,
  NegativeControlResult,
  Phase,
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

// ── 도구 관측 격리 관문 ──────────────────────────────────────────

/** 스위트를 시작하지 못하게 하는 도구 관측 단계의 사유 토큰. */
export type ToolIsolationCause =
  /** 도구 관측 요약이 없다(버전 확인 단계의 격리를 확인한 근거가 없다). */
  | "TOOL_OBSERVATION_ABSENT"
  /** 버전 확인 중 수신기가 본 요청 건수를 관측하지 못했다(null·형식 오류). 0건으로 보정하지 않는다. */
  | "METRICS_HITS_UNOBSERVED"
  /** 버전 확인 중 루프백 수신기가 요청을 받았다. */
  | "METRICS_RECEIVER_HIT";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** 버전 확인 중 관측한 요청 건수(음이 아닌 정수). 관측하지 못했거나 형식이 맞지 않으면 null이다(0이 아니다). */
export function toolMetricsHits(observation: unknown): number | null {
  if (!isRecord(observation) || !isRecord(observation.version_check)) return null;
  const hits = observation.version_check.metrics_hits_during;
  return typeof hits === "number" && Number.isSafeInteger(hits) && hits >= 0 ? hits : null;
}

/**
 * 도구 관측 요약(`resources.tool_observation`과 같은 모양)이 스위트를 시작해도 되는 격리 상태인가. 사유를 돌려주면 시작할 수 없다.
 * 실행기는 입력의 요약으로, 기록 읽기는 기준 증거의 resources.tool_observation으로 같은 함수를 부른다.
 */
export function toolIsolationBlock(observation: unknown): ToolIsolationCause | null {
  if (!isRecord(observation) || !isRecord(observation.version_check)) {
    return "TOOL_OBSERVATION_ABSENT";
  }
  const hits = toolMetricsHits(observation);
  if (hits === null) return "METRICS_HITS_UNOBSERVED";
  return hits > 0 ? "METRICS_RECEIVER_HIT" : null;
}

// ── 엔진 층의 관측 계약 ──────────────────────────────────────────

/** 모든 엔진 사례의 입력 변형이 엔진에 닿는 단계: initialize·initialized 뒤의 규칙 로딩. */
export const OBSERVATION_STAGE: Phase = "PH2";

/**
 * 사례의 반응을 관측하지 못하게 한 실행 실패를 뜻하는 사유: (a) 프로세스·초기화(INIT_FAILED로 매핑된 모든 사유 — 표에서 도출한다),
 * (b) 단계를 가리지 않는 전송 무결성 실패, (c) 관측 단계 안에서 일어난 프로세스·전송 실패(서버가 죽음·프레임 오류·취소). (c)는 입력
 * 변형에 대한 엔진의 반응이 아니다 — 서버가 죽어 대표 상태가 RULES_NOT_LOADED가 되어도 그것이 없는 경로에 대한 반응이라는 증거는 아니다.
 * 이 사유가 하나라도 있으면 어떤 사례의 반응도 관측했다고 할 수 없다.
 * 여기에 **없는** 것: 규칙 로딩에 대한 반응과 그 단계의 대기 시간 초과(TIMEOUT_RULES — 반응하지 않음이 드러나는 모양이다), 관측 단계 뒤(스캔·종료)의 실패.
 */
const PRE_OBSERVATION_FAILURES: ReadonlySet<ReasonCode> = new Set<ReasonCode>([
  ...(Object.keys(REASON_STATUS) as ReasonCode[]).filter((c) => REASON_STATUS[c] === "INIT_FAILED"),
  "STDIN_WRITE_FAILED",
  "RESPONSE_ID_UNMATCHED",
  "RESPONSE_ID_DUPLICATE",
  "EXIT_DURING_RULES",
  "FRAME_ERROR_DURING_RULES",
  "CANCELLED_DURING_RULES",
]);

export type EngineExecutionProblem = "ENGINE_EXECUTION_FAILED" | "ENGINE_STAGE_NOT_REACHED";

/**
 * 엔진 층 관측이 성립하지 않는 실행인가(순수). 관측 단계 전의 초기화·전송·프로세스 실패가 있으면 ENGINE_EXECUTION_FAILED, 실패 사유는
 * 없지만 관측 단계에 이르지 못했으면 ENGINE_STAGE_NOT_REACHED, 아니면 null이다. 대표 상태는 보지 않는다 — 우선순위가 앞선 사전 검사
 * 사유가 대표 상태를 정해도 이 판정은 달라지지 않는다.
 */
export function engineExecutionProblem(
  obs: Pick<LayerObservation, "reasonCodes" | "phases">
): EngineExecutionProblem | null {
  if (obs.reasonCodes.some((c) => PRE_OBSERVATION_FAILURES.has(c))) {
    return "ENGINE_EXECUTION_FAILED";
  }
  return obs.phases.includes(OBSERVATION_STAGE) ? null : "ENGINE_STAGE_NOT_REACHED";
}

/** 확정된 엔진 고유 관측 계약: 엔진 PASS에는 이 사유 중 하나 이상이 판정에 있어야 한다(엔진이 변형을 따로 잡았다는 증거). */
export interface ConfirmedEngineContract {
  reactionReasons: readonly ReasonCode[];
}

/**
 * 확정된 엔진 고유 관측 계약(id → 계약). **비어 있다**: 규칙 로딩 로그·진단 형식(ADR U3·U11)이 실제 Semgrep으로 확정되지 않아 어떤
 * 사유가 엔진의 반응인지 말할 수 없다. 추측으로 채우지 않는다 — 형식이 확정되면 근거와 함께 여기에 넣는다.
 */
export const ENGINE_OBSERVATION_CONTRACTS: Readonly<Record<string, ConfirmedEngineContract>> = {};

export type EngineObservationContract =
  /** 사전 검사 사유가 없어 아무것도 대표 상태를 가리지 않는다. 대표 상태가 곧 엔진의 반응이다. */
  | { state: "STATUS_IS_REACTION" }
  /** 사전 검사 사유가 상태를 가리는데 엔진 고유 관측의 계약이 확정되지 않았다. PASS를 만들 수 없다. */
  | { state: "UNCONFIRMED" }
  | { state: "CONFIRMED"; reactionReasons: readonly ReasonCode[] };

export function engineObservationContract(
  spec: NegativeControlSpec,
  contracts: Readonly<Record<string, ConfirmedEngineContract>> = ENGINE_OBSERVATION_CONTRACTS
): EngineObservationContract {
  if (spec.preflight === null) return { state: "STATUS_IS_REACTION" };
  const confirmed = contracts[spec.id];
  return confirmed === undefined
    ? { state: "UNCONFIRMED" }
    : { state: "CONFIRMED", reactionReasons: confirmed.reactionReasons };
}

// ── 사례 run id ──────────────────────────────────────────────────

/** 사례 실행의 run id. 실행기가 만들고 기록 읽기가 같은 규칙으로 기대값을 계산한다("baseline"은 기준 실행). */
export function caseRunId(suiteId: string, id: string, layer: Layer): string {
  return id === "baseline" ? `${suiteId}-baseline` : `${suiteId}-${id.toLowerCase()}-${layer}`;
}

/** 스위트가 돌릴 수 있는 모든 실행(기준 + 표의 (id, 층)). 쓰기 경로 검사와 실행기가 같은 목록을 쓴다. */
export function plannedRuns(suiteId: string): { id: string; layer: Layer; runId: string }[] {
  const out = [
    { id: "baseline", layer: "engine" as Layer, runId: caseRunId(suiteId, "baseline", "engine") },
  ];
  for (const spec of NEGATIVE_CONTROL_TABLE) {
    for (const layer of ["preflight", "engine"] as const) {
      if (layer === "preflight" && spec.preflight === null) continue;
      out.push({ id: spec.id, layer, runId: caseRunId(suiteId, spec.id, layer) });
    }
  }
  return out;
}

/** 스위트가 만들 수 있는 모든 run id(기준 + 표의 (id, 층)). */
export function plannedRunIds(suiteId: string): string[] {
  return plannedRuns(suiteId).map((run) => run.runId);
}

/**
 * 사례 실행이 run.json에 남길 신원. mutation_sha256은 스위트 기록의 변형 추적(MutationTrace)을 canonical JSON으로 만든 해시라서, 읽는
 * 쪽이 스위트 파일에 적힌 추적에서 같은 값을 다시 계산해 맞춰 볼 수 있다(변형 종류만이 아니라 변형이 바꾼 해시까지 묶인다).
 */
export function caseIdentity(
  suiteId: string,
  id: string,
  layer: Layer,
  mutation: { kind: MutationKind } | null,
  trace: unknown
): NegativeControlCaseIdentity {
  return {
    suite_id: suiteId,
    case_id: id,
    layer,
    mutation_kind: mutation?.kind ?? null,
    mutation_sha256: trace === null ? null : sha256Hex(canonicalJson(trace)),
  };
}

// ── 출력 경로 보호 ───────────────────────────────────────────────

/** 스위트 기록 파일 이름(스위트 증거 폴더 안). CLI가 쓰고, 쓰기 경로 검사가 같은 이름을 본다. */
export const SUITE_RECORD_FILE = "negative-controls.json";

/** 한 실행이 만들 규칙 사본 파일(캐시 기준 상대 경로). 실제 쓰기(execute)와 같은 함수(planRulesCopy)에서 나온다. */
export interface RunWritePlan {
  runId: string;
  /** 캐시 사본(변형을 적용한 뒤). */
  rules: readonly string[];
  /** 캐시 밖 사본(R8만, 변형하지 않은 원본 전부). 없으면 빈 목록. */
  outside: readonly string[];
}

/**
 * 폴더 이름만으로는 알 수 없는, 실제 쓰기 경로의 계획. 사례 폴더 루트가 정상 디렉터리여도 그 아래의 캐시 루트·하위 폴더·파일이 원본을
 * 가리키는 링크일 수 있어, 쓰기 전에 **쓰게 될 파일 경로마다** 푼 자리를 본다(경로 한 곳에서 모든 상위 링크가 풀린다).
 */
export interface WritePlan {
  cacheDir: string;
  runs: readonly RunWritePlan[];
  /** 대조 트리에 만들어질 파일(트리 기준 상대 경로, control-expectations.json의 사례 경로). 읽지 못하면 비어 있다. */
  controlCasePaths: readonly string[];
}

export interface OutputPathInputs {
  suiteId: string;
  workRoot: string;
  evidenceRoot: string;
  rulesCacheRoot: string;
  controlFixturesRoot: string;
  dataDir: string;
  harnessRoot: string;
  /** 규칙 사본·대조 트리 안의 파일까지 보려면 계획을 준다. 없으면 폴더와 고정 이름(증거 파일·표지·상태 폴더)까지만 본다. */
  plan?: WritePlan;
}

/** 한 실행의 신원과 경로. 실행기와 쓰기 경로 검사가 같은 함수로 경로를 만든다. */
function runKeyOf(suiteId: string, workRoot: string, id: string, layer: Layer): RunKey {
  const runId = caseRunId(suiteId, id, layer);
  const root = joinPath(workRoot, runId);
  return { id, layer, runId, root, treeRoot: joinPath(root, "tree") };
}

/** 사례 작업 공간 안의 규칙 캐시 사본 루트. */
const rulesCopyRoot = (root: string, cacheDir: string): string => joinPath(root, cacheDir);
/** R8의 캐시 밖 사본 루트(사례 작업 공간 옆). */
const outsideCopyRoot = (root: string, cacheDir: string): string =>
  joinPath(`${root}-outside`, cacheDir);
/** 트리 안 파일의 쓰기 경로. writeTree와 쓰기 경로 검사가 같은 조립을 쓴다. */
const treeTarget = (root: string, rel: string): string => joinPath(root, rel);

/**
 * 사례 한 번의 규칙 사본(캐시 기준 상대 경로 → 바이트): 원본에 변형을 적용한 결과. 실행기가 쓰는 것과 쓰기 경로 검사가 보는 것이
 * 같은 함수에서 나온다. 변형 입력을 만들 수 없으면 던진다(실행기는 쓰기 전에 WORKSPACE_FAILED로 끝낸다).
 */
function planRulesCopy(
  fixed: FixedInputs,
  mutation: Mutation | null
): { patch: RulesPatch; copy: Map<string, Uint8Array> } {
  let patch = noPatch();
  const copy = new Map(fixed.originalBytes);
  if (mutation?.rules) {
    patch = mutation.rules(fixed.rulesFiles, fixed.originalBytes);
    for (const path of patch.omit) copy.delete(path);
    for (const [path, bytes] of Object.entries(patch.replace)) copy.set(path, bytes);
    for (const [path, bytes] of Object.entries(patch.add)) copy.set(path, bytes);
  }
  return { patch, copy };
}

function buildWritePlan(
  suiteId: string,
  fixed: FixedInputs,
  controlCasePaths: readonly string[]
): WritePlan {
  const runs = plannedRuns(suiteId).map((run): RunWritePlan => {
    const mutation = run.id === "baseline" ? null : (NEGATIVE_MUTATIONS[run.id] ?? null);
    try {
      return {
        runId: run.runId,
        rules: [...planRulesCopy(fixed, mutation).copy.keys()],
        outside: mutation?.outsideCopy === true ? [...fixed.originalBytes.keys()] : [],
      };
    } catch {
      // 변형 입력을 만들 수 없는 사례는 execute가 아무것도 쓰기 전에 WORKSPACE_FAILED로 끝낸다 — 쓸 규칙 사본이 없다.
      return { runId: run.runId, rules: [], outside: [] };
    }
  });
  return { cacheDir: fixed.pin.rules.cache_dir_name, runs, controlCasePaths };
}

/** 대조 트리에 만들어질 파일 경로. 기대 입력을 읽지 못하면 비어 있다(하네스가 같은 이유로 트리를 만들지 못한다). */
async function controlCasePathsOf(fs: FsPort, dataDir: string): Promise<string[]> {
  const parsed = await readControlExpectations(fs, dataDir);
  return parsed.ok ? parsed.expectations.cases.map((c) => c.path) : [];
}

/**
 * 쓰기 계획을 세운다(읽기만 한다). CLI가 포트·잠금·표지·상태 폴더·수신기보다 먼저 `outputPathProblem`에 넘기고, `runNegativeControls`는
 * 자신이 읽은 고정 입력으로 같은 계획을 직접 만든다. 고정 입력을 읽지 못하면 null — 그때는 폴더와 고정 이름까지만 본다(이어지는
 * runNegativeControls가 FIXED_INPUTS_UNREADABLE로 어떤 사례도 쓰지 않는다).
 */
export async function writePlanFor(
  fs: FsPort,
  inputs: Pick<NegativeControlInputs, "suiteId" | "dataDir" | "rulesCacheRoot">
): Promise<WritePlan | null> {
  try {
    const fixed = await readFixedInputs(fs, inputs);
    return buildWritePlan(inputs.suiteId, fixed, await controlCasePathsOf(fs, inputs.dataDir));
  } catch {
    return null;
  }
}

/**
 * 스위트가 쓰게 될 경로 전부(디렉터리 포함). 고정 이름은 실제로 쓰는 쪽과 같은 상수를 쓰고, 규칙 사본·대조 트리 파일은 계획에서 온다.
 * 파일 경로 하나의 푼 자리에서 그 위의 모든 링크가 풀리므로, 하위 폴더 링크는 이 경로들에서 걸러진다.
 */
function plannedOutputs(inputs: OutputPathInputs): string[] {
  const out: string[] = [];
  const suiteDir = joinPath(inputs.evidenceRoot, inputs.suiteId);
  out.push(
    suiteDir,
    ...[SUITE_RECORD_FILE, RUN_MARKER_FILE, SERVER_STATE_DIR, VERSION_STATE_DIR].map((name) =>
      joinPath(suiteDir, name)
    ),
    // Windows 에서 상태 폴더 안에 만드는 전용 홈 폴더(다른 플랫폼에서는 만들지 않지만 검사는 항상 한다 — 검사 대상이 더 넓은 쪽이 안전하다).
    ...[SERVER_STATE_DIR, VERSION_STATE_DIR].map((name) =>
      joinPath(joinPath(suiteDir, name), CHILD_HOME_DIR)
    )
  );
  for (const run of plannedRuns(inputs.suiteId)) {
    const key = runKeyOf(inputs.suiteId, inputs.workRoot, run.id, run.layer);
    const evidenceDir = joinPath(inputs.evidenceRoot, run.runId);
    out.push(
      evidenceDir,
      ...[...EVIDENCE_FILE_NAMES, RUN_MARKER_FILE, SERVER_STATE_DIR].map((name) =>
        joinPath(evidenceDir, name)
      ),
      joinPath(joinPath(evidenceDir, SERVER_STATE_DIR), CHILD_HOME_DIR),
      key.root,
      `${key.root}-outside`,
      key.treeRoot
    );
    const plan = inputs.plan;
    if (plan === undefined) continue;
    const planned = plan.runs.find((r) => r.runId === run.runId);
    const cacheRoot = rulesCopyRoot(key.root, plan.cacheDir);
    out.push(cacheRoot, ...(planned?.rules ?? []).map((rel) => treeTarget(cacheRoot, rel)));
    if ((planned?.outside.length ?? 0) > 0) {
      const outsideRoot = outsideCopyRoot(key.root, plan.cacheDir);
      out.push(outsideRoot, ...(planned?.outside ?? []).map((rel) => treeTarget(outsideRoot, rel)));
    }
    out.push(...plan.controlCasePaths.map((rel) => treeTarget(key.treeRoot, rel)));
  }
  return [...new Set(out)];
}

/**
 * 스위트가 **쓰게 될** 경로가 원본 안에 들어가는지 본다(읽기만 한다 — 아무것도 만들지 않는다). 사유 토큰을 돌려주면 쓰면 안 된다.
 *  · 작업 공간 루트와 증거 루트는 서로 겹치면 안 되고, 작업 공간 루트는 원본과 겹치면 안 된다(원본이 그 안에 있어도 거절한다).
 *  · 계산된 출력 경로 전부는 원본 안이면 안 된다: 스위트·사례별 증거 폴더와 그 안의 증거 파일·표지·상태 폴더, 사례별 작업 공간·밖 사본·
 *    대조 트리, 그리고 계획(plan)이 있으면 규칙 사본·밖 사본·대조 트리 안의 **파일 경로 하나하나**. 사례 폴더 이름이든 그 아래의
 *    캐시 루트·하위 폴더든 원본을 가리키는 링크이면 푼 자리로 판단한다.
 * 모든 경로는 쓰기에 쓸 그 포트의 physicalKey로 푼다. 풀 수 없으면 쓰기 전에 거절한다(fail-closed). 검사 뒤에 링크를 바꾸는
 * 경쟁 상태(검사-사용 간격)는 다루지 않는다.
 */
export async function outputPathProblem(
  fs: Pick<FsPort, "physicalKey">,
  inputs: OutputPathInputs
): Promise<string | null> {
  try {
    const work = await fs.physicalKey(inputs.workRoot);
    const evidence = await fs.physicalKey(inputs.evidenceRoot);
    if (keyIsSameOrInside(work, evidence) || keyIsSameOrInside(evidence, work)) {
      return "WORK_ROOT_OVERLAPS_EVIDENCE";
    }
    const originals: { name: string; key: string }[] = [];
    for (const [name, path] of [
      ["rules-cache", inputs.rulesCacheRoot],
      ["fixtures", inputs.controlFixturesRoot],
      ["data", inputs.dataDir],
      ["harness", inputs.harnessRoot],
    ] as const) {
      const key = await fs.physicalKey(path);
      if (keyIsSameOrInside(work, key) || keyIsSameOrInside(key, work)) {
        return `WORK_ROOT_OVERLAPS_${name.toUpperCase()}`;
      }
      originals.push({ name, key });
    }
    for (const output of plannedOutputs(inputs)) {
      const key = await fs.physicalKey(output);
      for (const original of originals) {
        if (keyIsSameOrInside(key, original.key)) {
          return `OUTPUT_INSIDE_${original.name.toUpperCase()}`;
        }
      }
    }
    return null;
  } catch {
    return "OUTPUT_PATH_UNRESOLVABLE";
  }
}

// ── 순수 판정: 관측 → 항목 ───────────────────────────────────────

/** 한 실행에서 읽은 사실. 실행기는 HarnessResult에서, 기록 읽기는 디스크의 run.json에서 만든다. */
export interface LayerObservation {
  /** 증거 9개가 쓰인 실행이 있었는가(하드 실패·예외가 아니다). */
  recorded: boolean;
  /** 도달한 단계(measurement.phases_reached). 엔진 층은 관측 단계에 이르렀는지 본다. */
  phases: readonly Phase[];
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
 * 순서가 곧 계약이다: 충돌 → 취소 → 실행 근거 → 결합 → 층별 시작 조건 → (엔진 층) 관측 단계 전의 실행 실패 → 엔진 고유 관측 계약 → 기대 대조.
 * contracts는 확정된 엔진 고유 관측 계약이다(기본은 비어 있는 ENGINE_OBSERVATION_CONTRACTS — 시험이 확정된 경우를 주입해 본다).
 */
export function deriveNegativeControlEntry(
  spec: NegativeControlSpec,
  layer: Layer,
  obs: LayerObservation,
  expectedBinding: string | null,
  conflicts: readonly EngineLayerConflict[] = engineLayerConflicts(),
  contracts: Readonly<Record<string, ConfirmedEngineContract>> = ENGINE_OBSERVATION_CONTRACTS
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

  // 엔진 층: 이 사례를 관측하는 데 필요한 단계 전에 실행이 깨졌으면 대표 상태가 기대와 같아도(사전 검사 사유가 가려도) 관측이 성립하지
  // 않았다. 엔진 고유 관측의 계약이 없으면 상태 일치는 엔진이 변형을 따로 잡았다는 증거가 아니다.
  let reactionReasons: readonly ReasonCode[] | null = null;
  if (layer === "engine") {
    const problem = engineExecutionProblem(obs);
    if (problem !== null) return notRunEntry(spec, layer, problem);
    const contract = engineObservationContract(spec, contracts);
    if (contract.state === "UNCONFIRMED") {
      return notRunEntry(spec, layer, "ENGINE_OBSERVATION_UNCONFIRMED");
    }
    if (contract.state === "CONFIRMED") reactionReasons = contract.reactionReasons;
  }

  const expected =
    layer === "preflight"
      ? (spec.preflight as NonNullable<NegativeControlSpec["preflight"]>).status
      : spec.expected;
  const causeSeen = spec.preflight === null || obs.reasonCodes.includes(spec.preflight.reason);
  // 확정된 계약이 있으면 엔진이 낸 반응 사유가 있어야 한다(없으면 엔진이 변형을 잡지 못한 것 → FAIL).
  const reacted =
    reactionReasons === null || obs.reasonCodes.some((c) => reactionReasons.includes(c));
  // 사전 검사 층은 엔진을 띄우려 한 시도가 있으면 안 된다(막아야 할 것을 못 막았다 → FAIL).
  const passes =
    obs.status === expected && causeSeen && reacted && (layer === "engine" || !obs.attempted);
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
  /**
   * 사례를 하나도 시작하지 못하게 막은 사유(없으면 null). TOOL_OBSERVATION: 도구 관측 단계의 격리(버전 확인 중 수신기가 본 요청 건수 —
   * 관측값 그대로, null이면 null). WORKSPACE: 작업 공간·출력 경로를 쓸 수 없다(원본과 겹침·풀 수 없음 등). 막히면 기준·변형 실행이 없다.
   */
  blocked:
    | { stage: "TOOL_OBSERVATION"; cause: ToolIsolationCause; metrics_hits_during: number | null }
    | { stage: "WORKSPACE"; cause: string }
    | null;
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
    phases: record?.measurement.phases_reached ?? [],
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
    const target = treeTarget(root, path);
    await fs.mkdirp(target.slice(0, target.lastIndexOf("/")));
    await fs.writeFileExclusive(target, bytes);
  }
}

interface FixedInputs {
  pin: Pin;
  scopeConfig: ScopeConfig;
  rulesFiles: RuleFileEntry[];
  originalBytes: Map<string, Uint8Array>;
}

async function readFixedInputs(
  fs: FsPort,
  inputs: Pick<NegativeControlInputs, "dataDir" | "rulesCacheRoot">
): Promise<FixedInputs> {
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
  const baselineRunId = caseRunId(inputs.suiteId, "baseline", "engine");

  const finish = (
    provenance: Provenance | null,
    binding: string | null,
    clean: boolean,
    baselineEvidence: CaseEvidenceRef | null,
    blocked: NegativeControlSuite["blocked"] = null
  ): NegativeControlSuite => ({
    schema: SUITE_SCHEMA,
    suite_id: inputs.suiteId,
    provenance,
    binding_sha256: binding,
    baseline: { run_id: baselineRunId, clean, evidence: baselineEvidence },
    entries,
    cases,
    conflicts,
    blocked,
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
    return finish(null, null, false, null, { stage: "WORKSPACE", cause: "RUN_ID_INVALID" });
  }
  // 쓰기 전에: 계산된 출력 경로가 원본(규칙 캐시·대조 예제·고정 데이터·하네스) 안에 들어가지 않는지. 직접 호출도 같은 보호를 받는다.
  const overlap = await outputPathProblem(deps.fs, inputs);
  if (overlap !== null) {
    notRunAll("WORKSPACE_FAILED");
    return finish(null, null, false, null, { stage: "WORKSPACE", cause: overlap });
  }
  // 도구 관측 단계의 격리: 사례마다 수신기를 새로 열어도 버전 확인 중에 본 요청은 버리지 않는다. 0건으로 확인되지 않으면 아무것도 시작하지 않는다.
  const isolation = toolIsolationBlock(inputs.toolObservation);
  if (isolation !== null) {
    notRunAll("TOOL_OBSERVATION_BLOCKED");
    return finish(null, null, false, null, {
      stage: "TOOL_OBSERVATION",
      cause: isolation,
      metrics_hits_during: toolMetricsHits(inputs.toolObservation),
    });
  }
  let fixed: FixedInputs;
  try {
    fixed = await readFixedInputs(deps.fs, inputs);
  } catch {
    notRunAll("WORKSPACE_FAILED");
    return finish(null, null, false, null, {
      stage: "WORKSPACE",
      cause: "FIXED_INPUTS_UNREADABLE",
    });
  }
  const cacheDir = fixed.pin.rules.cache_dir_name;
  // 쓰기 전에: 규칙 사본·밖 사본·대조 트리 안의 파일 경로까지 — 사례 폴더 루트는 정상이어도 그 아래(캐시 루트·하위 폴더)가 원본을 가리키는
  // 링크일 수 있다. 실제로 쓸 파일 목록과 같은 함수(planRulesCopy)에서 계획을 만들고, 기준 실행을 포함해 무엇이든 쓰기 전에 거절한다.
  const writeProblem = await outputPathProblem(deps.fs, {
    ...inputs,
    plan: buildWritePlan(inputs.suiteId, fixed, await controlCasePathsOf(deps.fs, inputs.dataDir)),
  });
  if (writeProblem !== null) {
    notRunAll("WORKSPACE_FAILED");
    return finish(null, null, false, null, { stage: "WORKSPACE", cause: writeProblem });
  }

  /** 한 실행: 사례별 작업 공간을 만들고(원본은 읽기만), 층에 맞는 진입점으로 돌린다. 던지지 않는다. */
  const execute = async (
    id: string,
    layer: Layer,
    mutation: Mutation | null
  ): Promise<ExecutedRun> => {
    const key = runKeyOf(inputs.suiteId, inputs.workRoot, id, layer);
    const { runId, root } = key;
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
      const planned = planRulesCopy(fixed, mutation);
      patch = planned.patch;
      await writeTree(deps.fs, rulesCopyRoot(root, cacheDir), planned.copy);
      const outsideRoot = `${root}-outside`;
      if (mutation?.outsideCopy) {
        await writeTree(deps.fs, outsideCopyRoot(root, cacheDir), fixed.originalBytes);
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
          rulesCacheRoot: rulesCopyRoot(root, cacheDir),
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
          negativeControlCase: caseIdentity(inputs.suiteId, id, layer, mutation, trace),
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
