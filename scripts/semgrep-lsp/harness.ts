// 하네스 파이프라인(ADR D1·D2·D10): 고정 입력 → (대상 모드) 범위 E·스캔 트리 / (대조 모드) 대조 트리 → PH0 사전 검사 →
// 세션 → 판정 → 증거. 포트(파일·git·프로세스·시계)는 전부 주입받고, 환경에 해당하는 값(경로·SHA·실행 사양·한도·
// 관측한 사실)은 옵션으로 명시한다 — process.env를 읽지 않고, 저장소 안 어디에도 쓰지 않으며, 경로는 전부 옵션에서 온다.
//
// 공개 API:
//   runHarness(deps, options): Promise<HarnessResult>              정상 진입점(시작 정책 "gated" 고정)
//   runEngineDiagnostic(deps, options): Promise<HarnessResult>     음성 대조 엔진 층 전용 진입점(정책 "diagnostic", control 전용)
//   toControlReference(record, n0Confirmed)   control 실행 레코드 → target이 받는 대조 참조 요약
//   HarnessDeps / HarnessOptions / HarnessResult
//
// 결과의 읽는 법:
//  · ok = 파이프라인이 끝까지 돌았고 증거 파일 9개가 모두 쓰였다는 뜻이다. 측정이 완료됐다는 뜻이 아니다
//    (사전 검사 거부·시간 초과도 ok:true이며 record.measurement.status가 그 이유를 담는다).
//  · ok:false = 하드 실패(입력을 읽지 못함, 범위 계산·트리 쓰기·증거 쓰기에서 무결성 예외, 잘못된 설정,
//    이미 있는 증거). 이때 record는 null이다 — 증거가 모두 쓰이지 않은 채 측정 레코드를 내보내지 않는다.
//    하드 실패는 어떤 경우에도 COMPLETE로 읽히지 않는다.
//  · record.measurement.complete === true는 증거 9개가 모두 쓰이고 다시 읽어 확인된 뒤에만 반환된다.
//  · started = 프로세스가 실제로 떴는가(spawn 사건이 있는가).
//
// 사전 검사가 하나라도 사유를 내면 서버를 띄우지 않는다. 이때의 판정은 "아무것도 시작하지 않은" 빈 트랜스크립트를
// evaluate에 넣어 얻되, 시작하지 않아서 생기는 부수 사유(INIT_RESPONSE_MISSING)는 뺀다 — 시작하지 않은 것은 초기화
// 실패가 아니고, 그 사유가 원인(사전 검사 사유)보다 앞선 상태를 가리키면 안 된다. 결과 상태는 항상
// representativeStatus(사전 검사 사유)이며 COMPLETE가 될 수 없다.
//
// 스텁 프로세스 포트의 provenance는 "stub"이라 레코드는 trust SYNTHETIC, candidate_gate.evaluation UNVERIFIED다.
// 스텁 실행은 어느 대상의 대조 참조로도 쓸 수 없다(evaluate가 CONTROL_REFERENCE_SYNTHETIC으로 거부한다).
//
// 엔진 진단(runEngineDiagnostic): 음성 대조의 엔진 층만을 위한 **별도 진입점**이다. 같은 파이프라인(execute)을 쓰지만 시작 정책이
// 하나 다르다 — 사전 검사가 입력 변형이 부른 사유로만 거부했다면 그 사유를 판정에 그대로 담은 채 엔진을 띄운다. 정상 진입점
// (runHarness)은 정책이 "gated"로 고정되어 있어 옵션으로 이 정책을 바꿀 수 없다. 진단은 도구·휠·환경변수·잠금·다른 서버 프로세스
// 같은 사유가 하나라도 있으면 시작하지 않고(정상 경로와 같다), 진단 기록은 resources.engine_diagnostic으로 표시되어 대조 참조가
// 될 수 없다. 진단 실행은 control 모드에서만 쓴다.
//
// 음성 대조 스위트(HarnessOptions.negativeControlSuite): control 실행이 명시한 스위트 입력은 이번 실행의 결합·출처와 같을 때만
// control_assertions의 항목이 된다(BINDING_MISMATCH / PROVENANCE_MISMATCH / BINDING_UNAVAILABLE이면 항목을 쓰지 않고 16개 모두
// NOT_RUN으로 남는다). 항목의 PASS를 이 파일이 만들지 않는다 — 읽는 쪽이 사례별 증거에서 다시 도출한 값만 받는다.

import { NEGATIVE_CONTROL_TABLE } from "./control";
import {
  CONTROL_EXPECTATIONS_FILE,
  controlExpectationsPath,
  parseControlExpectations,
} from "./control-expectations";
import { evaluateTranscript, type EvaluateInputs } from "./evaluate";
import {
  EVIDENCE_FILE_NAMES,
  buildRunRecord,
  toJsonl,
  writeEvidence,
  type WriteEvidenceResult,
} from "./evidence";
import { buildBinding, computeControlFingerprint, computeHarnessFingerprint } from "./fingerprint";
import type { LogFormat } from "./log-matcher";
import { evidenceInsideServerTree } from "./path-containment";
import { buildControlTree, runPrecheck } from "./precheck";
import {
  expectedRulesSha256,
  parseExpectedRules,
  parseRulesFiles,
  rulesListSha256,
  rulesTreeConfigFromPin,
} from "./rules-manifest";
import { RUN_ID_RULE, isValidRunId } from "./run-id";
import { buildScanTree, computeScope, resolveTarget } from "./scope";
import { assertSessionConfig, runSession, type SessionConfig, type SessionLimits } from "./session";
import { buildInitializationOptions, validateInitializationOptions } from "./settings";
import { sha256Hex } from "./sha";
import {
  representativeStatus,
  sortReasons,
  type MeasurementStatus,
  type Reason,
  type ReasonCode,
} from "./status";
import { foreignObservationConflict } from "./process-observation";
import { completeToolObservation, toolObservationConflict } from "./tool-observation";
import {
  SCHEMAS,
  type Clock,
  type ControlAssertions,
  type ControlExpectations,
  type EngineDiagnosticSummary,
  type ExpectedRule,
  type ForeignServerObservationSummary,
  type FsPort,
  type GitPort,
  type MetricsObserver,
  type MetricsReceiverSummary,
  type Mode,
  type NegativeControlCaseIdentity,
  type NegativeControlInput,
  type NegativeControlResult,
  type NegativeControlSuiteSummary,
  type Phase,
  type Pin,
  type ProcessPort,
  type Provenance,
  type ReferenceFingerprints,
  type RuleFileEntry,
  type RunLockSummary,
  type RunRecord,
  type ScopeConfig,
  type ScopeResult,
  type SpawnSpec,
  type ToolObservationSummary,
  type Transcript,
  type Verdict,
} from "./types";
import { expectedUri } from "./uri";

// ── 공개 타입 ───────────────────────────────────────────────────

export interface HarnessDeps {
  fs: FsPort;
  git: GitPort;
  process: ProcessPort;
  clock: Clock;
}

export interface HarnessOptions {
  mode: Mode;
  /** target 모드의 전체 40자 대상 커밋 SHA. control 모드에서는 쓰지 않는다. */
  targetSha: string | null;
  /** 실행 식별자. 증거 폴더 이름이므로 영숫자·`.`·`_`·`-`만 허용한다. */
  runId: string;
  /** pin.json·scope.json·rules-files.tsv·rules-expected.tsv·control-expectations.json이 있는 폴더. */
  dataDir: string;
  /** 하네스 구현 파일이 있는 폴더(scripts/semgrep-lsp). 하네스 지문을 계산할 때 읽는다. */
  harnessRoot: string;
  /** 증거를 쓸 기준 폴더. 증거는 `<evidenceRoot>/<runId>/`에 쓴다(이미 있는 파일은 덮어쓰지 않는다). */
  evidenceRoot: string;
  /** 규칙 캐시(`semgrep-rules`) 자신. */
  rulesCacheRoot: string;
  /** target 모드: 스캔 트리 위치. 비어 있으면 E로 새로 만든다. 이미 파일이 있으면 만들지 않고 사전 검사가 E와 대조한다. */
  scanRoot: string;
  /** control 모드: 정적 입력(.in)이 놓인 저장소 루트. */
  controlFixturesRoot: string;
  /** control 모드: 대조 트리 위치. 비어 있으면 정적 입력으로 새로 만든다. */
  controlTreeRoot: string;
  /** 서버 실행 사양. env는 사전 검사가 이름만 본다(값은 어디에도 기록하지 않는다). */
  spawn: SpawnSpec;
  limits: SessionLimits;
  /** initializationOptions의 파일당 시간 제한(초)과 임계. */
  settings: { timeout: number; timeoutThreshold: number; proIntrafile?: boolean };
  /** 시험용: 이 값을 주면 만든 옵션 대신 보낸다(허용 키 검사는 그대로 거친다). */
  initializationOptions?: unknown;
  /** target 모드의 대조 참조(control_reference 모양). null이면 CONTROL_REFERENCE_MISSING이다. */
  controlReference: RunRecord["control_reference"];
  /**
   * 호출자가 대조 기록을 명시했지만 참조로 수락하지 못한 이유(reference-record.ts의 거절 상세). 이 경우 controlReference는
   * null이고 판정은 MISSING과 함께 이 이유를 CONTROL_REFERENCE_RECORD_REJECTED로 남긴다. 기록을 명시하지 않았으면 생략·null.
   */
  controlReferenceRejection?: string | null;
  /** 호출자가 관측한 사실. null은 "관측하지 못함"이며 해당 fail-closed 사유가 된다. */
  toolVersionObserved: string | null;
  wheelSha256Observed: string | null;
  /**
   * 위 두 값을 어떻게 관측했는지의 요약(tool-observation.ts). 주면 run.json의 resources.tool_observation에 핀과의 비교와 함께 싣는다.
   * 요약의 값이 위 두 값과 다르면 쓰기 전에 거절한다. 주지 않으면 이 필드는 레코드에 없다(기존 레코드와 바이트 단위로 같다).
   * 이 요약은 사전 검사의 입력이 아니다 — 판정은 위 두 값만 본다.
   */
  toolObservation?: ToolObservationSummary | null;
  /**
   * 호출자가 공유 실행 잠금(과 실행별 증거 표지)을 얻었는가. null은 확인하지 못함이며 LOCK_NOT_ACQUIRED가 된다.
   * **true일 때만** 하네스가 서버 트리(스캔 트리·대조 트리)를 만들거나 쓴다. false·null이면 트리의 존재 여부·파일 목록·
   * 파일 바이트에 손대지 않고 사전 검사가 거부한다.
   */
  lockHeld: boolean | null;
  /** 잠금을 얻지 못한 이유 토큰(사전 검사 사유 상세에만 쓴다). */
  lockRefusal?: string | null;
  /** 증거(run.json의 resources.run_lock)에 남길 공유 잠금 요약. 주지 않으면 남기지 않는다. */
  lockSummary?: RunLockSummary | null;
  /**
   * 같은 서버 트리의 다른 서버 프로세스 건수(조회 시점의 관측). null은 확인하지 못함이며 FOREIGN_SERVER_PROCESS가 된다. 잠금을 얻었다는
   * 이유로 0을 넘기지 않는다. **0일 때만**(그리고 lockHeld가 true일 때만) 하네스가 서버 트리를 만들거나 쓴다 — 1 이상이거나 null이면
   * 트리 준비 쓰기도 서버 기동도 하지 않는다.
   */
  foreignServerProcesses: number | null;
  /**
   * 위 건수를 어떻게 관측했는지의 요약(process-observation.ts). 주면 run.json의 resources.foreign_server_observation에 싣는다. 요약의
   * 건수가 위 값과 다르면 쓰기 전에 거절한다. 주지 않으면 이 필드는 레코드에 없다. 사전 검사의 입력이 아니다 — 판정은 위 건수만 본다.
   */
  foreignProcessObservation?: ForeignServerObservationSummary | null;
  /**
   * 호출자가 이미 정해 둔 루프백 수신 건수(시험·수신기가 없는 호출자용). null은 관측하지 못함이다. metricsReceiver를 주면 이 값은
   * 쓰지 않는다.
   */
  metricsReceiverHits: number | null;
  /**
   * 하네스가 판정하는 **시점**에 observe()로 그때까지의 누적 관측을 읽는 수신기. 시작 시점의 스냅샷(metricsReceiverHits)이 아니라
   * 이 관측을 판정과 증거(resources.metrics_receiver)에 쓴다. 관측 실패(state FAILED·observe 오류)는 0건이 아니라 null이다.
   */
  metricsReceiver?: MetricsObserver | null;
  /**
   * control 모드의 음성 대조 스위트(negative-control.ts가 실행하고 읽는 쪽이 증거에서 다시 도출한 항목). 주지 않으면 16개 전부 NOT_RUN이다.
   * 항목은 **이 실행의 결합**(도구·규칙·하네스·대조)과 출처가 스위트의 것과 같을 때만 받아들인다 — 다르면 항목을 쓰지 않고(NOT_RUN)
   * 이유를 resources.negative_control_suite에 남긴다. target 모드에서는 쓸 수 없다. 이 옵션에서 PASS를 만들어 내는 길은 없다:
   * 항목의 PASS는 스위트를 실행한 쪽의 관측에서만 나온다.
   */
  negativeControlSuite?: NegativeControlInput | null;
  /**
   * 이 실행이 음성 대조 스위트의 어느 사례를 위한 것인지의 신원(negative-control.ts의 실행기만 준다). 주면 run.json의
   * resources.negative_control_case에 그대로 싣는다 — 읽는 쪽이 스위트가 기대하는 신원과 대조해 다른 사례의 증거 재사용을 거절한다.
   * 판정과 사전 검사에는 쓰지 않는다. 주지 않으면 이 필드는 레코드에 없다.
   */
  negativeControlCase?: NegativeControlCaseIdentity | null;
  logFormat?: LogFormat;
  signal?: AbortSignal;
  /** 어느 증거 파일에도 있으면 안 되는 값(추가분). spawn.env 중 기밀로 보이는 이름의 값은 자동으로 포함한다. */
  secrets?: readonly string[];
}

export interface HarnessResult {
  ok: boolean;
  /** 프로세스가 실제로 떴는가. */
  started: boolean;
  record: RunRecord | null;
  evidence: WriteEvidenceResult | null;
  failure?: { stage: string; message: string };
}

// ── 내부 도구 ───────────────────────────────────────────────────

class HardFailure extends Error {
  constructor(
    readonly stage: string,
    message: string
  ) {
    super(message);
    this.name = "HardFailure";
  }
}

const SECRET_NAME = /(TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|CREDENTIAL)/i;
const decoder = new TextDecoder();

function joinPath(root: string, name: string): string {
  return `${root.replace(/[\\/]+$/, "")}/${name}`;
}

function collectSecrets(options: HarnessOptions): string[] {
  const out = new Set<string>();
  for (const value of options.secrets ?? []) if (value.length > 0) out.add(value);
  const env = options.spawn?.env ?? {};
  for (const [name, value] of Object.entries(env)) {
    if (SECRET_NAME.test(name) && typeof value === "string" && value.length > 0) out.add(value);
  }
  return [...out];
}

function redact(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const secret of secrets) out = out.split(secret).join("[redacted]");
  return out;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isObj(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(bytes: Uint8Array, name: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(decoder.decode(bytes));
  } catch {
    throw new HardFailure("inputs", `${name}: JSON이 아니다`);
  }
  if (!isObj(value)) throw new HardFailure("inputs", `${name}: 최상위 값이 객체가 아니다`);
  return value;
}

function checkPin(raw: Record<string, unknown>): Pin {
  const semgrep = raw.semgrep;
  const rules = raw.rules;
  const n0 = raw.n0;
  const ok =
    raw.schema === SCHEMAS.pin &&
    isObj(semgrep) &&
    typeof semgrep.version === "string" &&
    isObj(semgrep.wheel) &&
    isObj(rules) &&
    typeof rules.cache_dir_name === "string" &&
    Array.isArray(rules.config_dirs) &&
    rules.config_dirs.every((d) => typeof d === "string") &&
    typeof rules.yaml_list_sha256 === "string" &&
    isObj(n0) &&
    typeof n0.confirmed === "boolean" &&
    isObj(raw.s0);
  if (!ok) throw new HardFailure("inputs", "pin.json: 스키마·필수 필드가 맞지 않는다");
  return raw as unknown as Pin;
}

function checkScopeConfig(raw: Record<string, unknown>): ScopeConfig {
  const ignore = raw.semgrep_default_ignore;
  const ok =
    raw.schema === SCHEMAS.scope &&
    Array.isArray(raw.extensions) &&
    Array.isArray(raw.language_excluded_suffixes) &&
    isObj(ignore) &&
    Array.isArray(ignore.dir_names) &&
    Array.isArray(ignore.file_globs) &&
    Array.isArray(raw.explicit_excludes) &&
    typeof raw.max_target_bytes === "number";
  if (!ok) throw new HardFailure("inputs", "scope.json: 스키마·필수 필드가 맞지 않는다");
  return raw as unknown as ScopeConfig;
}

/**
 * 하네스가 서버로 보내는 기본 initializationOptions. 음성 대조의 실행기도 변형하지 않은 기준 옵션을 같은 함수로 만든다 — 기준이
 * 실제 실행과 어긋나지 않도록 한 곳에 둔다.
 */
export function defaultInitializationOptions(
  pin: Pick<Pin, "rules">,
  scopeConfig: Pick<ScopeConfig, "max_target_bytes">,
  settings: HarnessOptions["settings"]
): ReturnType<typeof buildInitializationOptions> {
  return buildInitializationOptions({
    configuration: pin.rules.config_dirs,
    maxTargetBytes: scopeConfig.max_target_bytes,
    timeout: settings.timeout,
    timeoutThreshold: settings.timeoutThreshold,
    proIntrafile: settings.proIntrafile,
  });
}

async function hasFiles(fs: FsPort, root: string): Promise<boolean> {
  try {
    return (await fs.listFilesRecursive(root)).length > 0;
  } catch {
    return false; // 없는 폴더는 비어 있는 것과 같다. 만들다가 실패하면 그때 하드 실패다.
  }
}

/** 스캔 루트의 file:// URI(서버가 작업 폴더로 삼는 곳). expectedUri와 같은 인코딩을 쓴다. */
function rootUri(root: string): string {
  return expectedUri(root, "_").slice(0, -2);
}

function emptyScope(targetSha: string | null): ScopeResult {
  return {
    targetSha: targetSha ?? "",
    entries: [],
    included: [],
    excludedCounts: {},
    scopeSha256: sha256Hex(""),
  };
}

function phasesOf(transcript: Transcript): Phase[] {
  const out: Phase[] = ["PH0"];
  for (const e of transcript.events) {
    if (e.kind === "phase" && !out.includes(e.phase)) out.push(e.phase);
  }
  return out;
}

function stderrLog(transcript: Transcript): string {
  return transcript.events
    .flatMap((e) => (e.kind === "stderr-line" ? [e.partial ? e.text : `${e.text}\n`] : []))
    .join("");
}

function diagnosticsJsonl(transcript: Transcript): string {
  return toJsonl(
    transcript.events.flatMap((e) =>
      e.kind === "stdout-message" && e.message.method === "textDocument/publishDiagnostics"
        ? [e.message]
        : []
    )
  );
}

function transcriptJsonl(transcript: Transcript): string {
  return toJsonl([{ kind: "meta", ...transcript.meta }, ...transcript.events]);
}

/** 지문 불일치를 진단할 수 있게 값과 매니페스트를 남긴다. 계산하지 못한 지문은 그 사실을 적는다. */
function fingerprintsText(
  f: ReferenceFingerprints,
  harnessManifest: string | null,
  controlManifest: string | null
): string {
  const field = (name: string, value: string | null) =>
    name + "\t" + (value ?? "(확인하지 못함)") + "\n";
  const section = (title: string, manifest: string | null) =>
    "\n[" + title + "]\n" + (manifest ?? "(계산하지 못했다)\n");
  return (
    field("harness_sha256", f.harness_sha256) +
    field("control_sha256", f.control_sha256) +
    field("tool_version_observed", f.tool_version) +
    field("wheel_sha256_observed", f.wheel_sha256) +
    field("rules_list_sha256", f.rules_list_sha256) +
    field("rules_expected_sha256", f.rules_expected_sha256) +
    field("binding_sha256", f.binding_sha256) +
    section("harness manifest", harnessManifest) +
    section("control manifest", controlManifest)
  );
}

function scopeTsv(mode: Mode, scope: ScopeResult | null, controls: ControlExpectations): string {
  if (mode === "target") {
    return (scope?.entries ?? [])
      .map((e) => `${e.path}\t${e.blobSha}\t${e.decision}\t${e.reason ?? ""}\n`)
      .join("");
  }
  return controls.cases.map((c) => `${c.path}\t${c.sha256}\t${c.kind}\n`).join("");
}

interface MetricsObservation {
  /** 증거에 남길 수신기 요약. 수신기가 없으면 null. */
  summary: MetricsReceiverSummary | null;
  /** 판정에 쓰는 건수. 관측하지 못했으면 null(0건으로 보지 않는다). */
  hits: number | null;
}

/**
 * 판정 시점의 루프백 수신 관측. 수신기가 있으면 지금 observe()한 누적 관측이고, 없으면 호출자가 정해 둔 값이다.
 * 관측이 깨졌거나(state FAILED) observe()가 던지면 null이다 — 0건으로 간주하지 않는다.
 */
function observeMetrics(options: HarnessOptions): MetricsObservation {
  const receiver = options.metricsReceiver;
  if (receiver === undefined || receiver === null) {
    return { summary: null, hits: options.metricsReceiverHits };
  }
  try {
    const summary = receiver.observe();
    const hits = summary.state === "FAILED" ? null : summary.hits;
    return { summary: { ...summary, hits }, hits };
  } catch {
    return {
      summary: {
        bind: "127.0.0.1",
        state: "FAILED",
        failure: "OBSERVE_FAILED",
        hits: null,
        connections: 0,
        requests: 0,
        client_errors: 0,
      },
      hits: null,
    };
  }
}

/** 사전 검사가 거부해 서버를 띄우지 않은 실행의 판정. 사유의 대표 상태가 곧 상태다. */
function neverStartedVerdict(transcript: Transcript, inputs: EvaluateInputs): Verdict {
  const base = evaluateTranscript(transcript, inputs);
  // 시작하지 않은 것은 초기화 실패가 아니다: 원인(사전 검사 사유)보다 앞선 상태를 가리키는 부수 사유를 뺀다.
  const reasons = sortReasons(base.reasons.filter((r) => r.code !== "INIT_RESPONSE_MISSING"));
  const status = representativeStatus(reasons);
  if (status === "COMPLETE" || reasons.length === 0) {
    throw new HardFailure("internal", "사전 검사 거부인데 사유가 없다(COMPLETE가 될 수 없다)");
  }
  return { ...base, reasons, status, complete: false };
}

// ── 파이프라인 ──────────────────────────────────────────────────

interface State {
  started: boolean;
}

/**
 * 시작 정책. gated: 사전 검사가 사유를 하나라도 내면 서버를 띄우지 않는다(정상 실행). diagnostic: 음성 대조의 엔진 층 전용 — 사유가
 * 전부 입력 변형이 부른 것(ENGINE_DIAGNOSTIC_STARTABLE)이고 서버 트리를 쓸 자격(잠금·다른 서버 0건)이 있을 때만 사유를 판정에 담은
 * 채 띄운다. 정책은 진입점이 고정한다(runHarness = gated, runEngineDiagnostic = diagnostic) — 옵션으로 바꿀 수 없다.
 */
type StartPolicy = "gated" | "diagnostic";

/**
 * 엔진 진단이 사유가 있어도 시작할 수 있는 사유: NEGATIVE_CONTROL_TABLE의 사전 검사 사유(변형이 부르는 것)와, 규칙 파일이 바뀌면 항상
 * 함께 나오는 목록 해시 불일치. 도구·휠·환경변수·잠금·다른 서버·핀·대조 트리·스캔 트리 같은 사유는 여기에 없다 — 그런 사유가 있으면
 * 진단도 정상 실행처럼 띄우지 않는다.
 */
const ENGINE_DIAGNOSTIC_STARTABLE: ReadonlySet<ReasonCode> = new Set<ReasonCode>([
  ...NEGATIVE_CONTROL_TABLE.flatMap((spec) =>
    spec.preflight === null ? [] : [spec.preflight.reason]
  ),
  "RULES_LIST_HASH_MISMATCH",
]);

/** 호출자가 준 스위트를 이 실행의 결합·출처와 맞춰 본 결과. 항목을 쓰지 못하면 entries는 undefined(= 전부 NOT_RUN)다. */
function resolveNegativeControls(
  input: NegativeControlInput | null | undefined,
  binding: string | null,
  provenance: "real" | "stub"
): { entries: NegativeControlResult[] | undefined; summary: NegativeControlSuiteSummary | null } {
  if (input === undefined || input === null) return { entries: undefined, summary: null };
  const base = input.summary;
  const reject = (rejection: string) => ({
    entries: undefined,
    summary: { ...structuredClone(base), accepted: false, rejection },
  });
  if (!base.accepted) return reject(base.rejection ?? "SUITE_NOT_ACCEPTED");
  if (binding === null || input.bindingSha256 === null) return reject("BINDING_UNAVAILABLE");
  if (input.bindingSha256 !== binding) return reject("BINDING_MISMATCH");
  if (input.provenance !== provenance) return reject("PROVENANCE_MISMATCH");
  const entries = input.entries.map((e) => ({ ...e }));
  const count = (status: NegativeControlResult["status"]): number =>
    entries.filter((e) => e.status === status).length;
  return {
    entries,
    summary: {
      ...structuredClone(base),
      accepted: true,
      rejection: null,
      // 개수는 받은 항목에서 다시 센다(요약의 선언을 믿지 않는다).
      counts: { pass: count("PASS"), fail: count("FAIL"), not_run: count("NOT_RUN") },
    },
  };
}

function checkOptions(options: HarnessOptions): void {
  if (options.mode !== "control" && options.mode !== "target") {
    throw new HardFailure("config", `알 수 없는 mode: ${String(options.mode)}`);
  }
  if (!isValidRunId(options.runId)) {
    throw new HardFailure("config", `runId는 ${RUN_ID_RULE}여야 한다`);
  }
  const paths = [
    "dataDir",
    "harnessRoot",
    "evidenceRoot",
    "rulesCacheRoot",
    "scanRoot",
    "controlFixturesRoot",
    "controlTreeRoot",
  ] as const;
  for (const key of paths) {
    if (typeof options[key] !== "string" || options[key].length === 0) {
      throw new HardFailure("config", `${key}가 비어 있다`);
    }
  }
  // 관측 요약은 사전 검사·지문이 쓰는 값과 같은 사실을 말해야 한다. 어긋난 요약을 증거에 싣지 않도록 쓰기 전에 거절한다.
  if (options.toolObservation) {
    const conflict = toolObservationConflict(
      options.toolObservation,
      options.toolVersionObserved,
      options.wheelSha256Observed
    );
    if (conflict !== null) throw new HardFailure("config", `toolObservation: ${conflict}`);
  }
  if (options.foreignProcessObservation) {
    const conflict = foreignObservationConflict(
      options.foreignProcessObservation,
      options.foreignServerProcesses
    );
    if (conflict !== null) {
      throw new HardFailure("config", `foreignProcessObservation: ${conflict}`);
    }
  }
  // 음성 대조 스위트는 control 실행의 자격 계산 입력이다. target 실행은 대조 참조를 받을 뿐 음성 대조를 가지지 않는다.
  if (options.negativeControlSuite && options.mode !== "control") {
    throw new HardFailure("config", "negativeControlSuite는 control 모드에서만 쓴다");
  }
}

async function execute(
  deps: HarnessDeps,
  options: HarnessOptions,
  secrets: readonly string[],
  state: State,
  policy: StartPolicy
): Promise<HarnessResult> {
  const { fs, git } = deps;
  checkOptions(options);
  const mode = options.mode;
  // 진단은 control 모드의 음성 대조 전용이고, 자기 자신이 스위트를 가진 기록(= 참조 후보)이 되어서는 안 된다.
  if (policy === "diagnostic") {
    if (mode !== "control") throw new HardFailure("config", "엔진 진단은 control 모드에서만 쓴다");
    if (options.negativeControlSuite) {
      throw new HardFailure("config", "엔진 진단은 음성 대조 스위트를 가질 수 없다");
    }
  }
  const evidenceDir = joinPath(options.evidenceRoot, options.runId);

  // 증거는 서버 트리 밖에 쓴다: 안에 쓰면 잠금이 없는 실행도 다른 실행의 트리에 파일을 만들게 된다(서버 트리는 E에 해당하는 파일만
  // 담아야 하기도 하다). `lockHeld`와 무관하게 — 잠금을 가졌어도 증거를 트리 안에 쓰는 설정은 거절한다. 포함 관계는 문자열이 아니라
  // 증거를 쓰게 될 그 포트가 실제로 접근할 자리(링크·junction·`..`·상대 경로를 푼 자리)로 판단하고(path-containment.ts), 안전하게
  // 풀 수 없으면 쓰기 전에 거절한다. 확인은 읽기만 한다. 호출자의 "겹치지 않는다"는 주장을 받는 옵션은 없다.
  const serverTreeRoot = mode === "target" ? options.scanRoot : options.controlTreeRoot;
  let overlaps: boolean;
  try {
    overlaps = await evidenceInsideServerTree(fs, evidenceDir, serverTreeRoot);
  } catch (error) {
    throw new HardFailure(
      "config",
      `증거 폴더와 서버 트리의 위치 관계를 안전하게 판별하지 못했다: ${errorText(error)}`
    );
  }
  if (overlaps) {
    throw new HardFailure("config", "증거 폴더가 서버 트리와 같거나 그 안에 있다");
  }

  // 이미 있는 증거는 서버를 띄우기 전에 거부한다(덮어쓰지 않는다 — 쓰는 단계에서 알면 이미 늦다).
  for (const name of EVIDENCE_FILE_NAMES) {
    if (await fs.exists(joinPath(evidenceDir, name))) {
      throw new HardFailure("evidence", `이미 있는 증거는 덮어쓰지 않는다: ${name}`);
    }
  }

  // 1. 고정 입력
  const read = async (name: string): Promise<Uint8Array> => {
    try {
      return await fs.readFile(joinPath(options.dataDir, name));
    } catch (error) {
      throw new HardFailure("inputs", `${name}을(를) 읽지 못했다: ${errorText(error)}`);
    }
  };
  const [pinBytes, scopeBytes, filesBytes, expectedBytes, controlBytes] = await Promise.all([
    read("pin.json"),
    read("scope.json"),
    read("rules-files.tsv"),
    read("rules-expected.tsv"),
    read(CONTROL_EXPECTATIONS_FILE),
  ]);
  const pin = checkPin(parseJson(pinBytes, "pin.json"));
  const scopeConfig = checkScopeConfig(parseJson(scopeBytes, "scope.json"));
  const parsedExpectations = parseControlExpectations(controlBytes);
  if (!parsedExpectations.ok) throw new HardFailure("inputs", parsedExpectations.message);
  const controlExpectations = parsedExpectations.expectations;
  let rulesFiles: RuleFileEntry[];
  let expectedRules: ExpectedRule[];
  try {
    rulesFiles = parseRulesFiles(decoder.decode(filesBytes));
    expectedRules = parseExpectedRules(decoder.decode(expectedBytes));
  } catch (error) {
    throw new HardFailure("inputs", errorText(error));
  }
  const pinSha256 = sha256Hex(pinBytes);

  // 1b. 지문과 결합: 읽기 실패는 던지지 않고 null(확인하지 못함)이다. null이 섞인 결합은 null이라 어떤 참조와도 일치하지 않는다.
  const [harnessFp, controlFp] = await Promise.all([
    computeHarnessFingerprint(fs, options.harnessRoot),
    computeControlFingerprint(fs, {
      expectationsPath: controlExpectationsPath(options.dataDir),
      fixturesRoot: options.controlFixturesRoot,
      expectations: controlExpectations,
    }),
  ]);
  const listSha = rulesListSha256(rulesFiles);
  const expectedSha = expectedRulesSha256(expectedRules);
  const currentFingerprints: ReferenceFingerprints = {
    harness_sha256: harnessFp?.sha256 ?? null,
    control_sha256: controlFp?.sha256 ?? null,
    rules_list_sha256: listSha,
    rules_expected_sha256: expectedSha,
    tool_version: options.toolVersionObserved,
    wheel_sha256: options.wheelSha256Observed,
    binding_sha256: buildBinding({
      tool_version: options.toolVersionObserved,
      wheel_sha256: options.wheelSha256Observed,
      pin_sha256: pinSha256,
      rules_list_sha256: listSha,
      rules_expected_sha256: expectedSha,
      harness_sha256: harnessFp?.sha256 ?? null,
      control_sha256: controlFp?.sha256 ?? null,
    }),
  };

  // 2. 서버로 보낼 설정(허용 키 검사는 보내기 전에 한다)과 세션 설정 검사
  const serverRoot = mode === "target" ? options.scanRoot : options.controlTreeRoot;
  let initOptions: unknown;
  try {
    initOptions =
      options.initializationOptions ??
      defaultInitializationOptions(pin, scopeConfig, options.settings);
  } catch (error) {
    throw new HardFailure("settings", errorText(error));
  }
  const settingsReasons = validateInitializationOptions(initOptions);
  const initializeParams = {
    processId: null,
    rootUri: rootUri(serverRoot),
    workspaceFolders: [{ uri: rootUri(serverRoot), name: "scan" }],
    capabilities: {},
    initializationOptions: initOptions,
  };
  const sessionConfig: SessionConfig = {
    limits: options.limits,
    ...(options.logFormat ? { logFormat: options.logFormat } : {}),
  };

  // 3. 범위 E와 스캔 트리 / 대조 트리. 무결성 예외는 하드 실패로 올라간다.
  //
  // 서버 트리(target은 스캔 트리, control은 대조 트리)를 만들거나 쓰는 것은 유효한 잠금을 가졌고(lockHeld === true) 같은 트리의 다른 서버
  // 프로세스 후보가 조회 시점에 보이지 않은(foreignServerProcesses === 0, "없음의 증명"이 아니라 식별 규칙에 맞는 후보가 없다는 뜻) 호출자뿐이다. 잠금을 얻지 못했거나(false) 확인하지 못했으면(null),
  // 또는 다른 서버가 있거나(1 이상) 확인하지 못했으면(null) 트리의 존재 여부·파일 목록·파일 바이트에 손대지 않는다 — 그 트리는
  // 지금 다른 실행·다른 서버의 것일 수 있다. 이 보장은 CLI가 아니라 여기에 있어서 runHarness를 직접 부르는 호출자도 같은 보호를 받는다.
  // (조회 이후 시작되는 프로세스까지 막는다는 뜻이 아니다 — 관측은 조회 시점의 사실이다.)
  const mayWriteServerTree = options.lockHeld === true && options.foreignServerProcesses === 0;
  let scope: ScopeResult | null = null;
  let resolvedSha: string | null = null;
  const treeReasons: Reason[] = [];
  try {
    if (mode === "target") {
      if (options.targetSha !== null) {
        const resolved = await resolveTarget(git, options.targetSha);
        if (resolved.ok) {
          resolvedSha = resolved.sha;
          scope = await computeScope(git, resolved.sha, scopeConfig);
          if (mayWriteServerTree && !(await hasFiles(fs, options.scanRoot))) {
            await buildScanTree(fs, git, scope, options.scanRoot);
          }
        }
      }
    } else if (mayWriteServerTree && !(await hasFiles(fs, options.controlTreeRoot))) {
      treeReasons.push(
        ...(await buildControlTree(fs, {
          expectations: controlExpectations,
          fixturesRoot: options.controlFixturesRoot,
          treeRoot: options.controlTreeRoot,
        }))
      );
    }
  } catch (error) {
    throw new HardFailure("scope", errorText(error));
  }
  // 잠금이 없어서 준비를 보류한 빈 트리. 비어 있는 것은 어긋남이 아니라 "준비하지 않음"이므로 사전 검사가 내용을 판정하지 않는다
  // (판정하면 MANIFEST_MISMATCH가 진짜 원인인 LOCK_NOT_ACQUIRED(ENV_MISMATCH)를 대표 상태에서 밀어낸다). 이미 파일이 있는 트리는
  // 예전처럼 읽기만 하고 판정한다.
  const treeNotPrepared = !mayWriteServerTree && !(await hasFiles(fs, serverRoot));

  const targetShaForRun = mode === "target" ? (resolvedSha ?? options.targetSha) : null;
  const runSpec = {
    runId: options.runId,
    mode,
    targetSha: targetShaForRun,
    ...(options.signal ? { signal: options.signal } : {}),
    initializeParams,
  };
  try {
    assertSessionConfig(sessionConfig, runSpec);
  } catch (error) {
    throw new HardFailure("config", errorText(error));
  }

  // 4. PH0 사전 검사
  const precheck = await runPrecheck(
    { fs, git },
    {
      pin,
      rulesFiles,
      expectedRules,
      rulesTreeConfig: rulesTreeConfigFromPin(pin.rules),
      rulesCacheRoot: options.rulesCacheRoot,
      scopeConfig,
      mode,
      targetSha: mode === "target" ? options.targetSha : null,
      scanTreeRoot: options.scanRoot,
      controlExpectations,
      controlTreeRoot: options.controlTreeRoot,
      controlFixturesRoot: options.controlFixturesRoot,
      env: options.spawn.env,
      toolVersionObserved: options.toolVersionObserved,
      wheelSha256Observed: options.wheelSha256Observed,
      lockHeld: options.lockHeld,
      lockRefusal: options.lockRefusal ?? null,
      treeNotPrepared,
      foreignServerProcesses: options.foreignServerProcesses,
      evidenceRoot: evidenceDir,
    }
  );
  const refusals = sortReasons([...precheck.reasons, ...treeReasons, ...settingsReasons]);

  // 음성 대조 스위트: 이 실행의 결합·출처와 맞을 때만 항목을 쓴다(아니면 NOT_RUN, 이유는 증거에 남긴다).
  const negatives =
    mode === "control"
      ? resolveNegativeControls(
          options.negativeControlSuite,
          currentFingerprints.binding_sha256,
          deps.process.provenance
        )
      : { entries: undefined, summary: null };

  const evaluateInputs: EvaluateInputs = {
    mode,
    pin,
    expectedRules,
    rulesFiles,
    scope: mode === "target" ? (scope ?? emptyScope(options.targetSha)) : null,
    controlExpectations,
    scanRoot: serverRoot,
    ...(options.logFormat ? { logFormat: options.logFormat } : {}),
    precheckReasons: refusals,
    pinSha256,
    controlReference: mode === "target" ? options.controlReference : null,
    controlReferenceRejection:
      mode === "target" ? (options.controlReferenceRejection ?? null) : null,
    currentFingerprints,
    metricsReceiverHits: options.metricsReceiverHits,
    ...(negatives.entries === undefined ? {} : { negativeControls: negatives.entries }),
  };

  // 5. 세션(사전 검사가 거부하면 띄우지 않는다) → 판정
  //
  // 정상 실행(gated)은 사유가 하나라도 있으면 띄우지 않는다. 엔진 진단은 사유가 전부 입력 변형이 부른 것이고 서버 트리를 쓸 자격이
  // 있을 때만 사유를 판정에 담은 채 띄운다 — 그 밖의 사유(도구·휠·환경·잠금·다른 서버·핀·트리)는 진단도 막는다.
  const startsDespiteRefusals =
    policy === "diagnostic" &&
    refusals.length > 0 &&
    mayWriteServerTree &&
    refusals.every((r) => ENGINE_DIAGNOSTIC_STARTABLE.has(r.code));
  let transcript: Transcript;
  let verdict: Verdict;
  let observation: MetricsObservation;
  if (refusals.length > 0 && !startsDespiteRefusals) {
    transcript = {
      meta: {
        schema: SCHEMAS.transcript,
        runId: options.runId,
        mode,
        provenance: deps.process.provenance,
        targetSha: targetShaForRun,
      },
      events: [],
    };
    observation = observeMetrics(options);
    verdict = neverStartedVerdict(transcript, {
      ...evaluateInputs,
      metricsReceiverHits: observation.hits,
    });
  } else {
    transcript = await runSession(
      { process: deps.process, clock: deps.clock },
      options.spawn,
      sessionConfig,
      runSpec
    );
    state.started = transcript.events.some((e) => e.kind === "spawn");
    // 판정 시점의 관측: 세션이 끝난 뒤(자식 종료 뒤)까지의 누적 건수를 읽는다. 시작 시점 값을 쓰지 않는다.
    observation = observeMetrics(options);
    verdict = evaluateTranscript(transcript, {
      ...evaluateInputs,
      metricsReceiverHits: observation.hits,
    });
  }

  // 6. 레코드와 증거
  const toolObservation = options.toolObservation
    ? completeToolObservation(
        options.toolObservation,
        pin,
        options.toolVersionObserved,
        options.wheelSha256Observed
      )
    : null;
  const foreignObservation = options.foreignProcessObservation
    ? structuredClone(options.foreignProcessObservation)
    : null;
  const controlTreeSha =
    mode === "control" && typeof precheck.details.control_tree_sha256 === "string"
      ? precheck.details.control_tree_sha256
      : null;
  const notExecuted: Record<string, "UNVERIFIED"> = {};
  if (state.started && observation.summary !== null && observation.hits !== null) {
    notExecuted.metrics_receiver_observation = "UNVERIFIED";
  }
  if (
    negatives.entries !== undefined &&
    negatives.entries.some((e) => e.layer === "engine" && e.status !== "NOT_RUN")
  ) {
    notExecuted.negative_controls_engine = "UNVERIFIED";
  }
  const diagnostic: EngineDiagnosticSummary | null =
    policy === "diagnostic"
      ? {
          policy: "ENGINE_DIAGNOSTIC",
          started_despite_refusals: startsDespiteRefusals,
          refusal_codes: [...new Set(refusals.map((r) => r.code as string))].sort(),
        }
      : null;
  const record = buildRunRecord({
    runId: options.runId,
    mode,
    provenance: transcript.meta.provenance,
    verdict,
    inputs: {
      target_sha: resolvedSha,
      pin_sha256: pinSha256,
      scope_sha256: scope?.scopeSha256 ?? null,
      rules_list_sha256: listSha,
      rules_expected_sha256: expectedSha,
      control_tree_sha256: controlTreeSha,
      harness_sha256: currentFingerprints.harness_sha256,
      control_sha256: currentFingerprints.control_sha256,
      tool_version_observed: currentFingerprints.tool_version,
      wheel_sha256_observed: currentFingerprints.wheel_sha256,
      binding_sha256: currentFingerprints.binding_sha256,
    },
    phasesReached: phasesOf(transcript),
    controlReference: mode === "target" ? options.controlReference : null,
    n0Confirmed: pin.n0.confirmed,
    // 서버가 실제로 떠서 유효하게 관측했을 때만 "관측했으나 서버가 환경변수를 읽는지는 미확인"(UNVERIFIED)이다. 그 밖에는
    // 서버가 한 번도 돌지 않았으므로 기본값(NOT_RUN)을 그대로 둔다. 엔진 음성 대조도 같다: 받아들인 스위트에 실행한 엔진 항목이
    // 있어도 "관측했으나 실제 Semgrep으로 확인하지 않았다"(UNVERIFIED)일 뿐 확인(검증)이라고 쓰지 않는다.
    ...(Object.keys(notExecuted).length === 0 ? {} : { notExecuted }),
    ...(options.lockSummary !== undefined ||
    observation.summary !== null ||
    toolObservation !== null ||
    foreignObservation !== null ||
    negatives.summary !== null ||
    diagnostic !== null ||
    (options.negativeControlCase ?? null) !== null
      ? {
          resources: {
            run_lock: options.lockSummary ?? null,
            metrics_receiver: observation.summary,
            // 관측 요약과 핀과의 비교. 핀은 읽기만 했다(verified·승인 상태를 바꾸지 않는다).
            ...(toolObservation === null ? {} : { tool_observation: toolObservation }),
            // 같은 트리의 다른 서버 프로세스 관측(조회 시점). 상태·건수·이유 토큰뿐이다.
            ...(foreignObservation === null
              ? {}
              : { foreign_server_observation: foreignObservation }),
            // 음성 대조 스위트를 어떻게 받아들였는지(개수·토큰뿐). 엔진 진단 실행이면 그 표시.
            ...(negatives.summary === null ? {} : { negative_control_suite: negatives.summary }),
            ...(diagnostic === null ? {} : { engine_diagnostic: diagnostic }),
            // 음성 대조 사례의 신원(스위트 실행기만 준다). 읽는 쪽이 스위트가 기대하는 신원과 대조한다.
            ...(options.negativeControlCase == null
              ? {}
              : { negative_control_case: structuredClone(options.negativeControlCase) }),
          },
        }
      : {}),
  });

  const expectedPaths =
    mode === "target"
      ? (scope?.included ?? []).map((e) => e.path)
      : controlExpectations.cases.map((c) => c.path);
  let evidence: WriteEvidenceResult;
  try {
    evidence = await writeEvidence(
      fs,
      evidenceDir,
      {
        run: record,
        diagnosticsJsonl: diagnosticsJsonl(transcript),
        transcriptJsonl: transcriptJsonl(transcript),
        stderrLog: stderrLog(transcript),
        filesExpected: expectedPaths,
        filesPublished: verdict.observed.published.uris,
        filesMissing: verdict.observed.published.missing,
        scopeTsv: scopeTsv(mode, scope, controlExpectations),
        fingerprintsTxt: fingerprintsText(
          currentFingerprints,
          harnessFp?.manifest ?? null,
          controlFp?.manifest ?? null
        ),
      },
      { secrets }
    );
  } catch (error) {
    throw new HardFailure("evidence", errorText(error));
  }

  // 쓴 것을 다시 확인한다: 증거 9개가 모두 있고 run.json의 해시가 반환값과 같을 때만 레코드를 내보낸다.
  for (const name of EVIDENCE_FILE_NAMES) {
    if (!(await fs.exists(joinPath(evidenceDir, name)))) {
      throw new HardFailure("evidence", `쓴 증거를 다시 확인하지 못했다: ${name}`);
    }
  }
  const written = sha256Hex(await fs.readFile(joinPath(evidenceDir, "run.json")));
  if (written !== evidence.runJsonSha256 || evidence.files.length !== EVIDENCE_FILE_NAMES.length) {
    throw new HardFailure("evidence", "쓴 run.json이 반환된 해시와 다르다");
  }

  return { ok: true, started: state.started, record, evidence };
}

// @MX:ANCHOR: [AUTO] 하네스의 유일한 진입점 — 범위·사전 검사·세션·판정·증거를 잇는다.
// @MX:REASON: "증거가 모두 쓰이기 전에는 측정 레코드를 내보내지 않는다"와 "사전 검사가 거부하면 서버를 띄우지
// 않는다"는 두 불변식이 이 함수 한 곳에서만 지켜진다. 분기를 늘릴 때 둘 다 유지해야 한다.
export async function runHarness(
  deps: HarnessDeps,
  options: HarnessOptions
): Promise<HarnessResult> {
  return guarded(deps, options, "gated");
}

/**
 * 엔진 진단: 음성 대조의 엔진 층 전용 진입점(control 모드만). 정상 실행(runHarness)과 같은 파이프라인이지만, 사전 검사 사유가 전부
 * 입력 변형이 부른 것이고 서버 트리를 쓸 자격(잠금·다른 서버 0건)이 있을 때는 그 사유를 판정에 담은 채 엔진을 띄운다. 정상 실행의
 * 검증은 하나도 줄이지 않는다 — 별도 함수라 정상 호출자는 이 동작에 닿지 않고, 진단 기록은 resources.engine_diagnostic으로
 * 표시되어 대조 참조가 될 수 없다. 이 함수를 정상 control/target 실행 경로에서 부르면 안 된다(구조 시험이 지킨다).
 */
export async function runEngineDiagnostic(
  deps: HarnessDeps,
  options: HarnessOptions
): Promise<HarnessResult> {
  return guarded(deps, options, "diagnostic");
}

async function guarded(
  deps: HarnessDeps,
  options: HarnessOptions,
  policy: StartPolicy
): Promise<HarnessResult> {
  const secrets = collectSecrets(options);
  const state: State = { started: false };
  try {
    return await execute(deps, options, secrets, state, policy);
  } catch (error) {
    const stage = error instanceof HardFailure ? error.stage : "unexpected";
    const message = error instanceof HardFailure ? error.message : errorText(error);
    return {
      ok: false,
      started: state.started,
      record: null,
      evidence: null,
      failure: { stage, message: redact(message, secrets) },
    };
  }
}

/**
 * control 실행의 레코드를 target 실행이 받는 대조 참조 요약으로 바꾼다. provenance는 레코드 그대로 옮기므로
 * 스텁 실행의 요약은 "stub"이고, target 판정(evaluate)은 이를 CONTROL_REFERENCE_SYNTHETIC으로 거부한다.
 * n0Confirmed는 레코드에 없는 사실(핀의 N0 확정 여부)이라 호출자가 넘긴다.
 * 요약은 판정이 아니라 사실을 싣는다: 지문 묶음과 음성 대조(층·결합 포함). eligible은 레코드가 계산한 자격과 n0Confirmed의
 * 논리곱일 뿐 자기 선언이며, target 판정은 이 값을 믿지 않고 사실로 다시 계산한다. 자격이 없는 레코드도 던지지 않고
 * eligible:false로 그대로 요약한다.
 */
/**
 * toControlReference가 읽는 필드만 모은 구조. RunRecord는 그대로 들어가고(구조적으로 호환), 파일에서 읽은 값은 검사한 뒤
 * 이 모양의 새 객체로 옮겨 넘긴다(reference-record.ts) — 외부 JSON을 RunRecord로 단언하지 않기 위해서다.
 */
export interface ControlReferenceSource {
  mode: Mode;
  run_id: string;
  provenance: Provenance;
  inputs: RunRecord["inputs"];
  measurement: { status: MeasurementStatus };
  control_assertions: {
    status: ControlAssertions["status"];
    negative_controls: readonly NegativeControlResult[];
  };
  /** 자격은 호출자가 정한다. 외부 기록을 받을 때는 저장된 선언이 아니라 재계산한 값을 넘겨야 한다. */
  reference_qualification: { eligible: boolean };
}

export function toControlReference(
  record: ControlReferenceSource,
  n0Confirmed: boolean
): NonNullable<RunRecord["control_reference"]> {
  if (record.mode !== "control") {
    throw new TypeError("대조 참조는 control 실행의 레코드에서만 만든다");
  }
  return {
    run_id: record.run_id,
    provenance: record.provenance,
    status: record.measurement.status,
    control_assertions_status: record.control_assertions.status,
    pin_sha256: record.inputs.pin_sha256,
    n0_confirmed: n0Confirmed,
    eligible: record.reference_qualification.eligible && n0Confirmed,
    fingerprints: {
      harness_sha256: record.inputs.harness_sha256,
      control_sha256: record.inputs.control_sha256,
      rules_list_sha256: record.inputs.rules_list_sha256,
      rules_expected_sha256: record.inputs.rules_expected_sha256,
      tool_version: record.inputs.tool_version_observed,
      wheel_sha256: record.inputs.wheel_sha256_observed,
      binding_sha256: record.inputs.binding_sha256,
    },
    negative_controls: record.control_assertions.negative_controls.map((n) => ({
      id: n.id,
      layer: n.layer,
      status: n.status,
      binding_sha256: n.binding_sha256,
    })),
  };
}
