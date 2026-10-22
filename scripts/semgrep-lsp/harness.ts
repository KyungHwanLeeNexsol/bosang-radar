// 하네스 파이프라인(ADR D1·D2·D10): 고정 입력 → (대상 모드) 범위 E·스캔 트리 / (대조 모드) 대조 트리 → PH0 사전 검사 →
// 세션 → 판정 → 증거. 포트(파일·git·프로세스·시계)는 전부 주입받고, 환경에 해당하는 값(경로·SHA·실행 사양·한도·
// 관측한 사실)은 옵션으로 명시한다 — process.env를 읽지 않고, 저장소 안 어디에도 쓰지 않으며, 경로는 전부 옵션에서 온다.
//
// 공개 API:
//   runHarness(deps, options): Promise<HarnessResult>
//   toControlReference(record, n0Confirmed)   control 실행 레코드 → target이 받는 대조 참조 요약
//   HarnessDeps / HarnessOptions / HarnessResult
//
// 결과의 읽는 법:
//  · ok = 파이프라인이 끝까지 돌았고 증거 파일 8개가 모두 쓰였다는 뜻이다. 측정이 완료됐다는 뜻이 아니다
//    (사전 검사 거부·시간 초과도 ok:true이며 record.measurement.status가 그 이유를 담는다).
//  · ok:false = 하드 실패(입력을 읽지 못함, 범위 계산·트리 쓰기·증거 쓰기에서 무결성 예외, 잘못된 설정,
//    이미 있는 증거). 이때 record는 null이다 — 증거가 모두 쓰이지 않은 채 측정 레코드를 내보내지 않는다.
//    하드 실패는 어떤 경우에도 COMPLETE로 읽히지 않는다.
//  · record.measurement.complete === true는 증거 8개가 모두 쓰이고 다시 읽어 확인된 뒤에만 반환된다.
//  · started = 프로세스가 실제로 떴는가(spawn 사건이 있는가).
//
// 사전 검사가 하나라도 사유를 내면 서버를 띄우지 않는다. 이때의 판정은 "아무것도 시작하지 않은" 빈 트랜스크립트를
// evaluate에 넣어 얻되, 시작하지 않아서 생기는 부수 사유(INIT_RESPONSE_MISSING)는 뺀다 — 시작하지 않은 것은 초기화
// 실패가 아니고, 그 사유가 원인(사전 검사 사유)보다 앞선 상태를 가리키면 안 된다. 결과 상태는 항상
// representativeStatus(사전 검사 사유)이며 COMPLETE가 될 수 없다.
//
// 스텁 프로세스 포트의 provenance는 "stub"이라 레코드는 trust SYNTHETIC, candidate_gate.evaluation UNVERIFIED다.
// 스텁 실행은 어느 대상의 대조 참조로도 쓸 수 없다(evaluate가 CONTROL_REFERENCE_SYNTHETIC으로 거부한다).

import { evaluateTranscript, type EvaluateInputs } from "./evaluate";
import {
  EVIDENCE_FILE_NAMES,
  buildRunRecord,
  toJsonl,
  writeEvidence,
  type WriteEvidenceResult,
} from "./evidence";
import type { LogFormat } from "./log-matcher";
import { buildControlTree, runPrecheck } from "./precheck";
import {
  expectedRulesSha256,
  parseExpectedRules,
  parseRulesFiles,
  rulesListSha256,
  rulesTreeConfigFromPin,
} from "./rules-manifest";
import { buildScanTree, computeScope, resolveTarget } from "./scope";
import { assertSessionConfig, runSession, type SessionConfig, type SessionLimits } from "./session";
import { buildInitializationOptions, validateInitializationOptions } from "./settings";
import { sha256Hex } from "./sha";
import { representativeStatus, sortReasons, type Reason } from "./status";
import {
  SCHEMAS,
  type Clock,
  type ControlExpectations,
  type ExpectedRule,
  type FsPort,
  type GitPort,
  type Mode,
  type Phase,
  type Pin,
  type ProcessPort,
  type RuleFileEntry,
  type RunRecord,
  type ScopeConfig,
  type ScopeResult,
  type SpawnSpec,
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
  /** 호출자가 관측한 사실. null은 "관측하지 못함"이며 해당 fail-closed 사유가 된다. */
  toolVersionObserved: string | null;
  wheelSha256Observed: string | null;
  lockHeld: boolean | null;
  foreignServerProcesses: number | null;
  metricsReceiverHits: number | null;
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
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
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

function checkControlExpectations(raw: Record<string, unknown>): ControlExpectations {
  if (raw.schema !== SCHEMAS.controlExpectations || !Array.isArray(raw.cases)) {
    throw new HardFailure("inputs", "control-expectations.json: 스키마·필수 필드가 맞지 않는다");
  }
  return raw as unknown as ControlExpectations;
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

function scopeTsv(mode: Mode, scope: ScopeResult | null, controls: ControlExpectations): string {
  if (mode === "target") {
    return (scope?.entries ?? [])
      .map((e) => `${e.path}\t${e.blobSha}\t${e.decision}\t${e.reason ?? ""}\n`)
      .join("");
  }
  return controls.cases.map((c) => `${c.path}\t${c.sha256}\t${c.kind}\n`).join("");
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

function checkOptions(options: HarnessOptions): void {
  if (options.mode !== "control" && options.mode !== "target") {
    throw new HardFailure("config", `알 수 없는 mode: ${String(options.mode)}`);
  }
  if (typeof options.runId !== "string" || !RUN_ID.test(options.runId)) {
    throw new HardFailure("config", "runId는 영숫자·`.`·`_`·`-`로만 이루어져야 한다");
  }
  const paths = [
    "dataDir",
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
}

async function execute(
  deps: HarnessDeps,
  options: HarnessOptions,
  secrets: readonly string[],
  state: State
): Promise<HarnessResult> {
  const { fs, git } = deps;
  checkOptions(options);
  const mode = options.mode;
  const evidenceDir = joinPath(options.evidenceRoot, options.runId);

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
    read("control-expectations.json"),
  ]);
  const pin = checkPin(parseJson(pinBytes, "pin.json"));
  const scopeConfig = checkScopeConfig(parseJson(scopeBytes, "scope.json"));
  const controlExpectations = checkControlExpectations(
    parseJson(controlBytes, "control-expectations.json")
  );
  let rulesFiles: RuleFileEntry[];
  let expectedRules: ExpectedRule[];
  try {
    rulesFiles = parseRulesFiles(decoder.decode(filesBytes));
    expectedRules = parseExpectedRules(decoder.decode(expectedBytes));
  } catch (error) {
    throw new HardFailure("inputs", errorText(error));
  }
  const pinSha256 = sha256Hex(pinBytes);

  // 2. 서버로 보낼 설정(허용 키 검사는 보내기 전에 한다)과 세션 설정 검사
  const serverRoot = mode === "target" ? options.scanRoot : options.controlTreeRoot;
  let initOptions: unknown;
  try {
    initOptions =
      options.initializationOptions ??
      buildInitializationOptions({
        configuration: pin.rules.config_dirs,
        maxTargetBytes: scopeConfig.max_target_bytes,
        timeout: options.settings.timeout,
        timeoutThreshold: options.settings.timeoutThreshold,
        proIntrafile: options.settings.proIntrafile,
      });
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
          if (!(await hasFiles(fs, options.scanRoot))) {
            await buildScanTree(fs, git, scope, options.scanRoot);
          }
        }
      }
    } else if (!(await hasFiles(fs, options.controlTreeRoot))) {
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
      foreignServerProcesses: options.foreignServerProcesses,
      evidenceRoot: evidenceDir,
    }
  );
  const refusals = sortReasons([...precheck.reasons, ...treeReasons, ...settingsReasons]);

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
    metricsReceiverHits: options.metricsReceiverHits,
  };

  // 5. 세션(사전 검사가 거부하면 띄우지 않는다) → 판정
  let transcript: Transcript;
  let verdict: Verdict;
  if (refusals.length > 0) {
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
    verdict = neverStartedVerdict(transcript, evaluateInputs);
  } else {
    transcript = await runSession(
      { process: deps.process, clock: deps.clock },
      options.spawn,
      sessionConfig,
      runSpec
    );
    state.started = transcript.events.some((e) => e.kind === "spawn");
    verdict = evaluateTranscript(transcript, evaluateInputs);
  }

  // 6. 레코드와 증거
  const controlTreeSha =
    mode === "control" && typeof precheck.details.control_tree_sha256 === "string"
      ? precheck.details.control_tree_sha256
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
      rules_list_sha256: rulesListSha256(rulesFiles),
      rules_expected_sha256: expectedRulesSha256(expectedRules),
      control_tree_sha256: controlTreeSha,
    },
    phasesReached: phasesOf(transcript),
    controlReference: mode === "target" ? options.controlReference : null,
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
      },
      { secrets }
    );
  } catch (error) {
    throw new HardFailure("evidence", errorText(error));
  }

  // 쓴 것을 다시 확인한다: 증거 8개가 모두 있고 run.json의 해시가 반환값과 같을 때만 레코드를 내보낸다.
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
  const secrets = collectSecrets(options);
  const state: State = { started: false };
  try {
    return await execute(deps, options, secrets, state);
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
 */
export function toControlReference(
  record: RunRecord,
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
  };
}
