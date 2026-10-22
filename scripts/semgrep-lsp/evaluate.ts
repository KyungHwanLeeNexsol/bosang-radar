// 트랜스크립트 → Verdict 순수 판정 (ADR D1~D5, D7, README "순수 판정의 규칙").
//
// 이 모듈은 프로세스·시계·파일·git·네트워크를 만지지 않고, 난수도 쓰지 않는다. 같은 입력이면 같은 출력이고
// 입력을 바꾸지 않는다. 트랜스크립트 *내용*이 깨져 있어도 던지지 않는다(깨진 내용은 사유가 된다).
// 던지는 경우는 호출자 계약 위반뿐이다: inputs.mode와 transcript.meta.mode가 다르거나, target 모드에
// scope가 없거나, control 모드에 controlExpectations가 없을 때(이 오류는 보고할 ReasonCode가 없다).
//
// 공개 API:
//   evaluateTranscript(transcript, inputs): Verdict
//   EvaluateInputs
//   REASON_EMITTERS      모든 ReasonCode가 어디서 나오는지 분류한 표(status.ts의 키와 일치해야 한다)
//
// 판정 원칙(스트림 내부 순서만 신뢰한다):
//  · stdout 구간은 메시지 인덱스로 가른다. 스캔 송신 사건의 cursor.stdout 이전 = 스캔 전, 그 이후부터 echo-post
//    응답 이전 = 이번 스캔의 게시 P, 응답 이후 = 늦은 진단. initialize 응답 이전의 게시는 DIAGNOSTIC_BEFORE_INIT.
//  · stderr는 줄 키(log-matcher)와 줄 인덱스로 가른다. `Scanned open documents`가 PH1~PH2의 끝 표지이고,
//    PH3 전용 줄(Scanning workspace … 장벽)이 스캔 송신보다 먼저 도착했으면(seq 비교) 서버가 스스로 스캔한
//    것이라 EXTRA_SCAN_TRIGGER_LOG다. 줄이 PH3 구간 밖에 한 번 더 나타나면 MULTI_SCAN_LOG다.
//  · stdout의 첫 프레임 오류(MALFORMED/TRUNCATED) 뒤의 메시지는 신뢰하지 않는다(무시한다).
//  · 필수 증거가 *관측되지 않은 것*은 사유다. 다만 앞 단계가 끝나지 않아 뒤 단계 증거가 있을 수 없는 경우
//    (예: initialize 응답 없이 종료 → 규칙 로딩 줄 부재)는 앞 단계의 사유가 이미 설명하므로 뒤 단계의
//    "부재" 사유를 쌓지 않는다(ADR D4의 겹침 표). 이미 관측된 *양의 증거*(로딩 오류, 중복, 스캔 전 진단 …)는
//    단계와 무관하게 항상 사유가 된다. COMPLETE는 사유가 하나도 없을 때뿐이다.
//  · 자식 프로세스 정리는 필수 최종 증거다: spawn 사건이 있으면 ok:true인 cleanup 사건이 정확히 한 건 있어야 하고,
//    아니면 CLEANUP_FAILED다(누락·실패·중복). spawn 사건이 없으면(띄우지 못함) 요구하지 않는다.
//  · 가정(실제 실행으로 확인하지 못함, ADR U3·U10): 에코 응답이 stdout에 id로 되돌아오고, `Rules refreshed`
//    알림이 `semgrep/rulesRefreshed` 메서드이며, "still loading rules" 안내와 경로 오류가 window/showMessage
//    계열로 온다는 것, 서버 버전이 initialize 결과의 serverInfo.version에 있다는 것.

import { aggregateDiagnostics, type AggregateResult, type LspDiagnostic } from "./aggregate";
import { evaluateControlAssertions, type ControlObserved } from "./control";
import {
  classifyStderrLine,
  defaultLogFormat,
  normalizeLoadingPath,
  type ClassifiedLine,
  type LogFormat,
  type LogKey,
} from "./log-matcher";
import { checkControlReferenceFacts } from "./reference";
import { representativeStatus, sortReasons, type Reason, type ReasonCode } from "./status";
import type {
  CandidateGate,
  ControlAssertions,
  ControlExpectations,
  ExpectedRule,
  Mode,
  NegativeControlResult,
  ObservedFacts,
  Pin,
  ReferenceFingerprints,
  RuleFileEntry,
  RunRecord,
  ScopeResult,
  Totals,
  Transcript,
  Verdict,
} from "./types";
import { normalizePublishedUri } from "./uri";

// ── 공개 타입 ───────────────────────────────────────────────────

export interface EvaluateInputs {
  mode: Mode;
  pin: Pin;
  /** 기대 규칙(최종 ID 포함). 규칙 수 N0·고유 원문 ID 수는 여기서 센다(상수를 쓰지 않는다). */
  expectedRules: readonly ExpectedRule[];
  /** 기대 규칙 YAML 파일 목록. 로딩 쌍의 기대 경로를 여기서 만든다. */
  rulesFiles: readonly RuleFileEntry[];
  /** target 모드의 E. control 모드에서는 null. */
  scope: ScopeResult | null;
  /** control 모드의 사례 목록(E는 사례 경로). target 모드에서는 null이어도 된다. */
  controlExpectations: ControlExpectations | null;
  /** 스캔 트리의 절대 경로. 게시 URI를 상대 경로로 정규화하는 기준이다. */
  scanRoot: string;
  /** 기본값: 줄 전체. */
  logFormat?: LogFormat;
  /** PH0 사전 검사·설정 검사가 낸 사유. 그대로 합친다. */
  precheckReasons?: readonly Reason[];
  /** 이번 실행의 pin 해시. target 모드에서 대조 참조의 pin_sha256과 비교한다. */
  pinSha256: string;
  /** target 모드의 대조 참조(control_reference 모양). 없으면 null. control 모드에서는 무시한다. */
  controlReference: RunRecord["control_reference"];
  /**
   * 이번 실행의 지문(하네스·대조·도구·결합). target 모드에서 대조 참조의 지문과 맞춰 본다. null이면 모든 값을 확인하지
   * 못한 것이라 CONTROL_REFERENCE_FINGERPRINT_MISSING이다. control 모드에서는 무시한다.
   */
  currentFingerprints: ReferenceFingerprints | null;
  /** 하네스가 연 루프백 수신기가 받은 요청 수. null이면 수신기가 관찰 중임을 증명하지 못한 것이다. */
  metricsReceiverHits: number | null;
  /** control 모드의 음성 대조 기록(기본: 전부 NOT_RUN). */
  negativeControls?: readonly NegativeControlResult[];
}

export type ReasonEmitter = "precheck" | "settings" | "evaluate" | "session";

/**
 * 모든 ReasonCode가 어느 계층에서 나오는지의 표. `satisfies`가 키 누락·초과를 타입으로 막고, 시험이 런타임에서도
 * Object.keys(REASON_STATUS)와 같은 키 집합인지 확인한다 — 새 사유는 분류 없이는 추가할 수 없다.
 *  · precheck: runPrecheck(PH0)와 그 하위 검사(규칙 트리·스캔 트리·대조 트리·환경).
 *  · settings: initializationOptions 검사(보내기 전).
 *  · evaluate: 이 모듈이 트랜스크립트·입력에서 만든다.
 *  · session: 실제 세션 제어기만 알 수 있는 사유(지금은 없다 — 모든 사건이 트랜스크립트로 기록되기 때문).
 */
export const REASON_EMITTERS = {
  RULES_FILE_ADDED: "precheck",
  RULES_FILE_REMOVED: "precheck",
  RULES_FILE_CHANGED: "precheck",
  RULES_LIST_HASH_MISMATCH: "precheck",
  RULES_PIN_INCONSISTENT: "precheck",
  SCAN_TREE_FILE_ADDED: "precheck",
  SCAN_TREE_FILE_MISSING: "precheck",
  SCAN_TREE_FILE_CHANGED: "precheck",
  SCAN_TREE_IGNORED_DIR_NAME: "precheck",
  TARGET_SHA_UNRESOLVED: "precheck",
  CONTROL_TREE_MISMATCH: "precheck",

  TOOL_VERSION_MISMATCH: "precheck",
  TOOL_VERSION_UNVERIFIED: "precheck",
  WHEEL_HASH_MISMATCH: "precheck",
  WHEEL_HASH_UNVERIFIED: "precheck",
  ENV_VAR_NOT_ALLOWED: "precheck",
  ENV_URL_NOT_LOOPBACK: "precheck",
  ENV_PATH_OUTSIDE_EVIDENCE: "precheck",
  APP_TOKEN_PRESENT: "precheck",
  LOCK_NOT_ACQUIRED: "precheck",
  FOREIGN_SERVER_PROCESS: "precheck",

  SPAWN_FAILED: "evaluate",
  INIT_RESPONSE_MISSING: "evaluate",
  INITIALIZED_NOT_SENT: "evaluate",
  INITIALIZED_REPEATED: "evaluate",
  INIT_ERROR_RESPONSE: "evaluate",
  SERVER_VERSION_MISMATCH: "evaluate",
  SERVER_VERSION_UNREPORTED: "evaluate",
  EXIT_DURING_INIT: "evaluate",
  FRAME_ERROR_DURING_INIT: "evaluate",
  TIMEOUT_INIT: "evaluate",
  CANCELLED_DURING_INIT: "evaluate",

  SETTINGS_KEY_NOT_ALLOWED: "settings",
  AUTO_RULES_FALLBACK: "evaluate",
  REGISTRY_DOWNLOAD_ATTEMPT: "evaluate",
  CI_DISABLED_LOG_MISSING: "evaluate",
  FULL_SCAN_LOG_MISSING: "evaluate",
  LOADING_PATH_OUTSIDE_CONFIG: "evaluate",

  RULE_FILE_ERRORS_REPORTED: "evaluate",
  LOADING_WITHOUT_DONE: "evaluate",
  LOADING_PAIR_MISSING: "evaluate",
  LOADING_PAIR_UNEXPECTED: "evaluate",
  LOADING_PAIR_DUPLICATE: "evaluate",
  SKIPPING_RULE_LOGGED: "evaluate",

  RULES_REFRESHED_MISSING: "evaluate",
  CONFIG_PATH_ERROR: "evaluate",
  STILL_LOADING_NOTICE: "evaluate",
  OPEN_DOCS_MARKER_MISSING: "evaluate",
  ERRORS_COUNT_LOG_MISSING: "evaluate",
  ECHO_PRE_SCAN_MISSING: "evaluate",
  EXIT_DURING_RULES: "evaluate",
  FRAME_ERROR_DURING_RULES: "evaluate",
  TIMEOUT_RULES: "evaluate",
  CANCELLED_DURING_RULES: "evaluate",

  RULE_COUNT_IS_DISTINCT_ID_COUNT: "evaluate",
  PUBLISHED_CODE_UNPREFIXED: "evaluate",
  RULE_COUNT_N_MISMATCH: "evaluate",
  RULE_COUNT_LOG_MISSING: "evaluate",

  PRE_SCAN_DIAGNOSTIC: "evaluate",
  MULTI_SCAN_LOG: "evaluate",
  EXTRA_SCAN_TRIGGER_LOG: "evaluate",
  MULTIPLE_RULES_REFRESHED: "evaluate",
  SCAN_REQUEST_REPEATED: "evaluate",
  DIAGNOSTIC_BEFORE_INIT: "evaluate",

  EXIT_BEFORE_BARRIER: "evaluate",
  EXIT_NONZERO: "evaluate",
  MALFORMED_FRAME: "evaluate",
  TRUNCATED_FRAME: "evaluate",
  ENGINE_EXCEPTION_LOG: "evaluate",
  CANCELLED_DURING_SCAN: "evaluate",
  STDIN_WRITE_FAILED: "evaluate",
  RESPONSE_ID_UNMATCHED: "evaluate",
  RESPONSE_ID_DUPLICATE: "evaluate",
  CLEANUP_FAILED: "evaluate",

  NO_BARRIER: "evaluate",
  ECHO_MISSING: "evaluate",
  TIMEOUT_SCAN: "evaluate",
  TIMEOUT_EXIT: "evaluate",

  DIAGNOSTIC_AFTER_ECHO: "evaluate",
  DUPLICATE_URI: "evaluate",
  URI_EXPECTED_NOT_PUBLISHED: "evaluate",
  URI_PUBLISHED_NOT_EXPECTED: "evaluate",
  K_NE_PUBLISHED: "evaluate",
  K_NE_EXPECTED: "evaluate",
  URI_UNNORMALIZABLE: "evaluate",
  UNKNOWN_RULE_CODE: "evaluate",

  ENGINE_ERRORS_NONEMPTY: "evaluate",
  ENGINE_REPORT_LOG_MISSING: "evaluate",
  ENGINE_SKIPPED_RULES_UNEXPLAINED: "evaluate",
  SKIPPED_RULES_S0_MISMATCH: "evaluate",
  MATCH_COUNT_DIAGNOSTICS_MISSING: "evaluate",
  MATCH_COUNT_DIAGNOSTICS_EXCESS: "evaluate",

  CONTROL_REFERENCE_MISSING: "evaluate",
  CONTROL_REFERENCE_NOT_PASS: "evaluate",
  CONTROL_REFERENCE_PIN_MISMATCH: "evaluate",
  CONTROL_REFERENCE_SYNTHETIC: "evaluate",
  N0_UNCONFIRMED: "evaluate",
  CONTROL_REFERENCE_FINGERPRINT_MISSING: "evaluate",
  CONTROL_REFERENCE_HARNESS_MISMATCH: "evaluate",
  CONTROL_REFERENCE_CONTROL_MISMATCH: "evaluate",
  CONTROL_REFERENCE_TOOL_MISMATCH: "evaluate",
  CONTROL_REFERENCE_BINDING_MISMATCH: "evaluate",
  CONTROL_REFERENCE_NEGATIVE_INCOMPLETE: "evaluate",
  CONTROL_REFERENCE_NOT_ELIGIBLE: "evaluate",

  METRICS_RECEIVER_HIT: "evaluate",
  METRICS_RECEIVER_NOT_OBSERVING: "evaluate",
} as const satisfies Record<ReasonCode, ReasonEmitter>;

// ── 내부 도구 ───────────────────────────────────────────────────

type Obj = Record<string, unknown>;

function isObj(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function compareBytes(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

function listDetail(items: readonly string[], limit = 3): string {
  const sorted = [...items].sort(compareBytes);
  const head = sorted.slice(0, limit).join(", ");
  return `${items.length}개: ${head}${items.length > limit ? " …" : ""}`;
}

class ReasonSink {
  readonly list: Reason[] = [];
  private readonly seen = new Set<string>();

  add(code: ReasonCode, detail?: string): void {
    const key = `${code}\u0000${detail ?? ""}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.list.push(detail === undefined ? { code } : { code, detail });
  }

  /** 입력으로 받은 사유는 그대로(코드와 설명을 바꾸지 않고) 복사해 합친다. */
  addVerbatim(reason: Reason): void {
    this.add(reason.code, reason.detail);
  }
}

interface SendRec {
  seq: number;
  label: string;
  message: Obj;
  cursorStdout: number;
}

interface StderrRec {
  seq: number;
  index: number;
  text: string;
  partial: boolean;
  cls: ClassifiedLine | null;
}

interface StdoutRec {
  seq: number;
  index: number;
  msg: Obj;
}

interface ExitRec {
  seq: number;
  code: number | null;
  signal: string | null;
  byHarness: boolean;
}

type StdoutEvent =
  | { seq: number; kind: "msg"; rec: StdoutRec }
  | { seq: number; kind: "frame-error"; error: string };

function validCursor(cursor: unknown): number {
  // 알 수 없는 위치는 "스캔 전 전부"(∞)로 읽는다 — 진단을 이번 스캔 몫으로 세지 않는 쪽이 fail-closed다.
  return isObj(cursor) && isInt(cursor.stdout) ? cursor.stdout : Infinity;
}

function responseLike(msg: Obj): boolean {
  return msg.method === undefined && (msg.result !== undefined || msg.error !== undefined);
}

function idOf(msg: Obj): string | number | null {
  const id = msg.id;
  return typeof id === "string" || typeof id === "number" ? id : null;
}

function methodOf(msg: Obj): string | null {
  return typeof msg.method === "string" ? msg.method : null;
}

/** LSP 진단 한 건의 모양이 aggregateDiagnostics에 넘겨도 안전한가(내용은 읽지 않고 모양만 본다). */
function validPosition(value: unknown): boolean {
  return isObj(value) && typeof value.line === "number" && typeof value.character === "number";
}

function validDiagnostic(value: unknown): value is LspDiagnostic {
  if (!isObj(value)) return false;
  const range = value.range;
  if (range === undefined) return true;
  return isObj(range) && validPosition(range.start) && validPosition(range.end);
}

function validPublishParams(
  params: unknown
): params is { uri: string; diagnostics: LspDiagnostic[] } {
  return (
    isObj(params) &&
    typeof params.uri === "string" &&
    params.uri.length > 0 &&
    Array.isArray(params.diagnostics) &&
    params.diagnostics.every(validDiagnostic)
  );
}

const EXCEPTION_LINE =
  /\b(fatal error|uncaught exception|stack overflow|out of memory)\b|\bexception\s+[A-Z][\w.]*/i;

/** PH3 구간에서 정확히 한 번씩 나와야 하는 줄. */
const PH3_KEYS = [
  "scanningWorkspace",
  "fullScan",
  "runningRules",
  "engineErrors",
  "skippedRules",
  "scannedFiles",
  "foundMatches",
  "scannedWorkspace",
  "barrier",
] as const satisfies readonly LogKey[];

/** 엔진 보고 줄(Running Semgrep with N rules 제외 — 그 부재는 RULE_COUNT_LOG_MISSING이다). */
const ENGINE_REPORT_KEYS = [
  "scanningWorkspace",
  "engineErrors",
  "skippedRules",
  "scannedFiles",
  "foundMatches",
  "scannedWorkspace",
] as const satisfies readonly LogKey[];

const EMPTY_EXPECTATIONS: ControlExpectations = {
  schema: "semgrep-lsp-control-expectations/1",
  note: "",
  detection_status: "UNVERIFIED",
  cases: [],
};

// ── 진입점 ──────────────────────────────────────────────────────

export function evaluateTranscript(transcript: Transcript, inputs: EvaluateInputs): Verdict {
  if (inputs.mode !== "control" && inputs.mode !== "target") {
    throw new TypeError(`알 수 없는 mode: ${String(inputs.mode)}`);
  }
  if (transcript?.meta?.mode !== inputs.mode) {
    throw new TypeError("transcript.meta.mode와 inputs.mode가 다르다");
  }
  if (inputs.mode === "target" && inputs.scope === null) {
    throw new TypeError("target 모드에는 scope(E)가 필요하다");
  }
  if (inputs.mode === "control" && inputs.controlExpectations === null) {
    throw new TypeError("control 모드에는 controlExpectations가 필요하다");
  }
  try {
    return evaluateCore(transcript, inputs);
  } catch {
    // 트랜스크립트 해석 중 예상하지 못한 예외: 던지지 않고 실패로 닫는다(내용은 기록하지 않는다).
    return internalFailure(transcript, inputs);
  }
}

function emptyObserved(): ObservedFacts {
  return {
    rules: {
      loadingPairsOk: [],
      fileErrorsReported: null,
      runningRulesN: null,
      skippedRulesS: null,
      skippingRuleLogs: [],
    },
    scan: {
      scannedFilesK: null,
      foundMatchesM: null,
      matchesDeduplicated: null,
      engineErrorsText: null,
      barrierSeen: false,
      preScanEchoSeen: false,
      postBarrierEchoSeen: false,
    },
    published: { diagnosticCount: null, uris: [], duplicates: [], missing: [], unexpected: [] },
    totals: null,
    perFile: {},
    perRule: {},
  };
}

function provenanceOf(transcript: Transcript): "real" | "stub" {
  return transcript?.meta?.provenance === "real" ? "real" : "stub";
}

function candidateGateFor(
  mode: Mode,
  provenance: "real" | "stub",
  status: Verdict["status"],
  totals: Totals | null
): CandidateGate {
  const sealed = {
    policy_accepted: false,
    counts_as_lsp_security_warnings: false,
    threshold: "== 0",
  } as const;
  if (mode !== "target") {
    return {
      applicable: false,
      ...sealed,
      value: null,
      subtotals: null,
      evaluation: provenance === "stub" ? "UNVERIFIED" : "NOT_APPLICABLE",
    };
  }
  if (status !== "COMPLETE" || totals === null) {
    return { applicable: true, ...sealed, value: null, subtotals: null, evaluation: "UNVERIFIED" };
  }
  return {
    applicable: true,
    ...sealed,
    value: totals.total,
    subtotals: { error: totals.error, warning: totals.warning, information: totals.information },
    evaluation:
      provenance === "stub" ? "UNVERIFIED" : totals.total === 0 ? "WOULD_PASS" : "WOULD_FAIL",
  };
}

function notApplicableControl(): ControlAssertions {
  return evaluateControlAssertions(
    EMPTY_EXPECTATIONS,
    { cases: {}, wholeBundleTotal: null },
    { applicable: false }
  );
}

function internalFailure(transcript: Transcript, inputs: EvaluateInputs): Verdict {
  const sink = new ReasonSink();
  for (const reason of inputs.precheckReasons ?? []) sink.addVerbatim(reason);
  sink.add("MALFORMED_FRAME", "internal: 트랜스크립트를 해석하지 못했다(내용은 기록하지 않는다)");
  const reasons = sortReasons(sink.list);
  const status = representativeStatus(reasons);
  return {
    status,
    reasons,
    complete: false,
    observed: emptyObserved(),
    control_assertions:
      inputs.mode === "control" && inputs.controlExpectations !== null
        ? evaluateControlAssertions(
            inputs.controlExpectations,
            { cases: {}, wholeBundleTotal: null },
            { applicable: true, negativeControls: inputs.negativeControls }
          )
        : notApplicableControl(),
    candidate_gate: candidateGateFor(inputs.mode, provenanceOf(transcript), status, null),
  };
}

// ── 본체 ────────────────────────────────────────────────────────

function evaluateCore(transcript: Transcript, inputs: EvaluateInputs): Verdict {
  const sink = new ReasonSink();
  const { pin, mode } = inputs;
  const fmt = inputs.logFormat ?? defaultLogFormat;
  const cacheDir = pin.rules.cache_dir_name;
  const prefix = `${cacheDir}.`;

  for (const reason of inputs.precheckReasons ?? []) sink.addVerbatim(reason);

  // ── 1. 사건 분류 (모양이 깨진 사건은 건너뛰고, 건너뛴 개수는 MALFORMED_FRAME으로 남긴다) ──
  const events: unknown[] = Array.isArray(transcript.events) ? transcript.events : [];
  let junkEvents = 0;
  let spawned = false;
  let spawnFailed = 0;
  let stdinErrors = 0;
  let killCount = 0;
  const sends: SendRec[] = [];
  const stderrRaw: StderrRec[] = [];
  const stdoutEvents: StdoutEvent[] = [];
  const timeouts: { phase: unknown; waitingFor: unknown }[] = [];
  const cancels: { phase: unknown }[] = [];
  const exits: ExitRec[] = [];
  const cleanups: { ok: boolean }[] = [];

  for (const raw of events) {
    if (!isObj(raw) || typeof raw.kind !== "string" || typeof raw.seq !== "number") {
      junkEvents++;
      continue;
    }
    const seq = raw.seq;
    switch (raw.kind) {
      case "spawn":
        spawned = true;
        break;
      case "spawn-failed":
        spawnFailed++;
        break;
      case "send":
        if (isObj(raw.message) && typeof raw.label === "string") {
          sends.push({
            seq,
            label: raw.label,
            message: raw.message,
            cursorStdout: validCursor(raw.cursor),
          });
        } else junkEvents++;
        break;
      case "stdout-message":
        if (isObj(raw.message) && isInt(raw.index)) {
          stdoutEvents.push({
            seq,
            kind: "msg",
            rec: { seq, index: raw.index, msg: raw.message },
          });
        } else junkEvents++;
        break;
      case "stdout-frame-error":
        stdoutEvents.push({
          seq,
          kind: "frame-error",
          error: typeof raw.error === "string" ? raw.error : "MALFORMED",
        });
        break;
      case "stderr-line":
        if (typeof raw.text === "string" && isInt(raw.index)) {
          const partial = raw.partial === true;
          stderrRaw.push({
            seq,
            index: raw.index,
            text: raw.text,
            partial,
            // 줄이 끝나지 않은 채 끊긴 마지막 줄은 인식하지 않는다(잘린 줄이 우연히 다른 완전한 줄과 같을 수 있다).
            cls: partial ? null : classifyStderrLine(raw.text, fmt),
          });
        } else junkEvents++;
        break;
      case "stdin-error":
        stdinErrors++;
        break;
      case "timeout":
        timeouts.push({ phase: raw.phase, waitingFor: raw.waitingFor });
        break;
      case "cancelled":
        cancels.push({ phase: raw.phase });
        break;
      case "kill":
        killCount++;
        break;
      case "exit":
        exits.push({
          seq,
          code: typeof raw.code === "number" ? raw.code : null,
          signal: typeof raw.signal === "string" ? raw.signal : null,
          byHarness: raw.byHarness === true,
        });
        break;
      case "cleanup":
        // ok:true만 성공이다(다른 값·누락은 실패로 읽는다). detail은 기밀이 섞일 수 있어 읽지 않는다.
        cleanups.push({ ok: raw.ok === true });
        break;
      default:
        break; // phase, stdout-eof, stderr-eof: 판정에 쓰지 않는다
    }
  }
  if (junkEvents > 0) {
    sink.add("MALFORMED_FRAME", `모양이 깨진 사건 ${junkEvents}건(내용은 기록하지 않는다)`);
  }

  // stdout: 스트림 내부 순서(seq)로 첫 프레임 오류를 찾고, 그 뒤의 메시지는 신뢰하지 않는다.
  stdoutEvents.sort((a, b) => a.seq - b.seq);
  const firstFrameError = stdoutEvents.findIndex((e) => e.kind === "frame-error");
  const trustedEvents =
    firstFrameError === -1 ? stdoutEvents : stdoutEvents.slice(0, firstFrameError);
  const frameError =
    firstFrameError === -1 ? null : (stdoutEvents[firstFrameError] as { error: string });
  const trusted: StdoutRec[] = trustedEvents
    .flatMap((e) => (e.kind === "msg" ? [e.rec] : []))
    .sort((a, b) => a.index - b.index || a.seq - b.seq);

  const stderrLines = [...stderrRaw].sort((a, b) => a.index - b.index || a.seq - b.seq);
  const byKey = new Map<LogKey, StderrRec[]>();
  for (const line of stderrLines) {
    if (line.cls === null) continue;
    const list = byKey.get(line.cls.key) ?? [];
    list.push(line);
    byKey.set(line.cls.key, list);
  }
  const all = (key: LogKey): StderrRec[] => byKey.get(key) ?? [];
  const params = <K extends LogKey>(rec: StderrRec) =>
    (rec.cls as unknown as { params: Extract<ClassifiedLine, { key: K }>["params"] }).params;

  // ── 2. 송신·응답 ──
  const firstSend = (label: string): SendRec | undefined =>
    sends.filter((s) => s.label === label).sort((a, b) => a.seq - b.seq)[0];
  const sendCount = (label: string): number => sends.filter((s) => s.label === label).length;

  const sentIds = new Set<string | number>();
  for (const s of sends) {
    const id = idOf(s.message);
    if (methodOf(s.message) !== null && id !== null) sentIds.add(id);
  }
  const answered = new Map<string | number, StdoutRec>();
  let unmatched = 0;
  let duplicated = 0;
  for (const rec of trusted) {
    if (!responseLike(rec.msg)) continue;
    const id = idOf(rec.msg);
    if (id === null || !sentIds.has(id)) unmatched++;
    else if (answered.has(id)) duplicated++;
    else answered.set(id, rec);
  }
  if (unmatched > 0) sink.add("RESPONSE_ID_UNMATCHED", `${unmatched}건`);
  if (duplicated > 0) sink.add("RESPONSE_ID_DUPLICATE", `${duplicated}건`);

  const responseTo = (label: string): StdoutRec | undefined => {
    const send = firstSend(label);
    const id = send ? idOf(send.message) : null;
    return id === null ? undefined : answered.get(id);
  };

  // ── 3. PH1: 프로세스·초기화 ──
  if (spawnFailed > 0) sink.add("SPAWN_FAILED", `${spawnFailed}회`);
  const initRec = responseTo("initialize");
  const initOk = initRec !== undefined && initRec.msg.error === undefined;
  if (initRec === undefined) {
    if (spawnFailed === 0) sink.add("INIT_RESPONSE_MISSING", "initialize 응답이 관측되지 않았다");
  } else if (initRec.msg.error !== undefined) {
    sink.add("INIT_ERROR_RESPONSE", "initialize가 오류 응답을 받았다");
  } else {
    const result = initRec.msg.result;
    const info = isObj(result) && isObj(result.serverInfo) ? result.serverInfo : null;
    const version = info !== null && typeof info.version === "string" ? info.version : null;
    if (version === null) {
      sink.add("SERVER_VERSION_UNREPORTED", "serverInfo.version을 받지 못했다");
    } else if (version !== pin.semgrep.version) {
      sink.add("SERVER_VERSION_MISMATCH", "서버가 보고한 버전이 핀과 다르다");
    }
  }
  const initializedCount = sendCount("initialized");
  if (initOk && initializedCount === 0) {
    // initialize 응답까지 받았는데 initialized를 보내지 않았다면 PH1이 끝나지 않았다(앞 단계에 도달했을 때만 부재 사유).
    sink.add("INITIALIZED_NOT_SENT", "initialized 송신 기록이 없다");
  } else if (initializedCount > 1) {
    // 관측된 양의 증거(여러 번 보냄)는 단계와 무관하게 사유다.
    sink.add("INITIALIZED_REPEATED", `initialized를 ${initializedCount}회 보냈다`);
  }

  // ── 4. PH2: 규칙 로딩 ──
  const scanSend = firstSend("scan-workspace");
  const scanSent = scanSend !== undefined;
  const scanSeq = scanSend ? scanSend.seq : Infinity;
  const scanCursor = scanSend ? scanSend.cursorStdout : Infinity;

  const refreshedNotices = trusted.filter(
    (r) => methodOf(r.msg) === "semgrep/rulesRefreshed" && r.msg.id === undefined
  );
  const rulesOk = initOk && refreshedNotices.length >= 1;
  if (initOk && refreshedNotices.length === 0) sink.add("RULES_REFRESHED_MISSING");

  const refreshExtra =
    refreshedNotices.length > 1 ||
    all("refreshingRules").length > 1 ||
    all("rulesRefreshed").length > 1 ||
    [...all("refreshingRules"), ...all("rulesRefreshed")].some((l) => l.seq > scanSeq);
  if (refreshExtra) sink.add("MULTIPLE_RULES_REFRESHED", "규칙 갱신이 한 번을 넘었다");

  // 로딩 쌍
  const expectedLoad = new Map<string, number>();
  for (const file of inputs.rulesFiles) {
    expectedLoad.set(normalizeLoadingPath(`${cacheDir}/${file.path}`), 0);
  }
  const configPrefixes = pin.rules.config_dirs.map(
    (d) => `${normalizeLoadingPath(d).replace(/\/+$/, "")}/`
  );
  const loadIdx = new Map<string, number[]>();
  const doneIdx = new Map<string, number[]>();
  for (const [key, store] of [
    ["loading", loadIdx],
    ["doneLoading", doneIdx],
  ] as const) {
    for (const line of all(key)) {
      const path = normalizeLoadingPath(params<"loading" | "doneLoading">(line).path);
      const list = store.get(path) ?? [];
      list.push(line.index);
      store.set(path, list);
    }
  }
  const unexpectedPaths: string[] = [];
  const outsidePaths: string[] = [];
  for (const path of new Set([...loadIdx.keys(), ...doneIdx.keys()])) {
    if (expectedLoad.has(path)) continue;
    if (configPrefixes.some((p) => path.startsWith(p))) unexpectedPaths.push(path);
    else outsidePaths.push(path);
  }
  const okPairs: string[] = [];
  const pairMissing: string[] = [];
  const pairMissingBoth: string[] = [];
  const withoutDone: string[] = [];
  const pairDuplicate: string[] = [];
  for (const path of expectedLoad.keys()) {
    const l = loadIdx.get(path) ?? [];
    const d = doneIdx.get(path) ?? [];
    if (l.length === 1 && d.length === 1) {
      if (d[0] > l[0]) okPairs.push(path);
      else pairMissing.push(path); // 완료가 시작보다 앞선 쌍은 쌍으로 인정하지 않는다
    } else if (l.length === 0 && d.length === 0) pairMissingBoth.push(path);
    else if (l.length === 0) pairMissing.push(path);
    else if (d.length === 0) {
      withoutDone.push(path);
      if (l.length > 1) pairDuplicate.push(path);
    } else pairDuplicate.push(path);
  }
  if (withoutDone.length > 0) sink.add("LOADING_WITHOUT_DONE", listDetail(withoutDone));
  if (pairMissing.length > 0) sink.add("LOADING_PAIR_MISSING", listDetail(pairMissing));
  if (rulesOk && pairMissingBoth.length > 0) {
    sink.add("LOADING_PAIR_MISSING", listDetail(pairMissingBoth));
  }
  if (unexpectedPaths.length > 0) sink.add("LOADING_PAIR_UNEXPECTED", listDetail(unexpectedPaths));
  if (pairDuplicate.length > 0) sink.add("LOADING_PAIR_DUPLICATE", listDetail(pairDuplicate));
  if (outsidePaths.length > 0) {
    sink.add("LOADING_PATH_OUTSIDE_CONFIG", `${outsidePaths.length}개 경로가 구성 디렉터리 밖이다`);
  }

  // Got N errors
  const got = all("gotErrors");
  const gotCount = got.length > 0 ? params<"gotErrors">(got[0]).count : null;
  if (got.length === 0) {
    if (rulesOk) sink.add("ERRORS_COUNT_LOG_MISSING");
  } else if (got.length > 1) {
    sink.add("MULTIPLE_RULES_REFRESHED", `Got N errors 줄이 ${got.length}회 나왔다`);
  }
  if (got.some((g) => params<"gotErrors">(g).count > 0)) {
    sink.add("RULE_FILE_ERRORS_REPORTED", `N=${gotCount}`);
  }

  const skipping = all("skippingRule");
  if (skipping.length > 0) sink.add("SKIPPING_RULE_LOGGED", `${skipping.length}개`);
  if (all("download").length > 0) {
    sink.add("REGISTRY_DOWNLOAD_ATTEMPT", `${all("download").length}회`);
  }
  if (all("usingAuto").length > 0) sink.add("AUTO_RULES_FALLBACK", `${all("usingAuto").length}회`);

  const ciCount = all("ciDisabled").length;
  if (rulesOk && ciCount !== 1) sink.add("CI_DISABLED_LOG_MISSING", `${ciCount}회`);

  // 안내·오류 알림 (window/showMessage 계열)
  let stillLoading = 0;
  let configError = 0;
  for (const rec of trusted) {
    const method = methodOf(rec.msg);
    if (
      method !== "window/showMessage" &&
      method !== "window/showMessageRequest" &&
      method !== "window/logMessage"
    ) {
      continue;
    }
    const p = rec.msg.params;
    const message = isObj(p) && typeof p.message === "string" ? p.message : "";
    if (/still loading/i.test(message)) stillLoading++;
    else if (isObj(p) && p.type === 1 && rec.index < scanCursor) configError++;
  }
  if (stillLoading > 0) sink.add("STILL_LOADING_NOTICE", `${stillLoading}건`);
  if (configError > 0) sink.add("CONFIG_PATH_ERROR", `${configError}건`);

  // Scanned open documents 표지와 PH2 끝의 echo
  const scannedOpen = all("scannedOpenDocuments");
  if (rulesOk && scannedOpen.length === 0) sink.add("OPEN_DOCS_MARKER_MISSING");
  const scanningOpen = all("scanningOpenDocuments");
  const markerIdx = scannedOpen.length > 0 ? scannedOpen[0].index : Infinity;
  if (
    scanningOpen.length > 1 ||
    scannedOpen.length > 1 ||
    scanningOpen.some((l) => l.index > markerIdx) ||
    all("scanningSingleFile").length > 0
  ) {
    sink.add("EXTRA_SCAN_TRIGGER_LOG", "열린 문서·단일 파일 스캔 흔적이 있다");
  }

  const preSend = firstSend("echo-pre-scan");
  const preRec = responseTo("echo-pre-scan");
  const preEchoOk =
    preRec !== undefined && preRec.msg.error === undefined && preRec.index < scanCursor;
  if (rulesOk && !preEchoOk) {
    sink.add(
      "ECHO_PRE_SCAN_MISSING",
      preSend === undefined
        ? "echo-pre-scan 송신 기록이 없다"
        : preRec === undefined
          ? "echo-pre-scan 응답이 관측되지 않았다"
          : "echo-pre-scan 응답이 오류이거나 스캔 송신보다 늦다"
    );
  }

  // ── 5. PH3: 스캔 ──
  const scanSends = sends.filter((s) => methodOf(s.message) === "semgrep/scanWorkspace");
  if (scanSends.length > 1)
    sink.add("SCAN_REQUEST_REPEATED", `scanWorkspace ${scanSends.length}회`);
  if (
    sends.some((s) => {
      const m = methodOf(s.message);
      return (
        m === "textDocument/didOpen" || m === "textDocument/didSave" || m === "semgrep/refreshRules"
      );
    })
  ) {
    sink.add("EXTRA_SCAN_TRIGGER_LOG", "스캔을 일으키는 다른 요청을 보냈다");
  }

  const earlyScanLogs = PH3_KEYS.filter((key) => all(key).some((l) => l.seq < scanSeq));
  if (earlyScanLogs.length > 0) {
    sink.add(
      "EXTRA_SCAN_TRIGGER_LOG",
      `스캔 송신보다 먼저 도착한 스캔 로그: ${[...earlyScanLogs].sort(compareBytes).join(", ")}`
    );
  }
  const repeatedKeys = PH3_KEYS.filter((key) => all(key).length > 1);
  if (repeatedKeys.length > 0) {
    sink.add("MULTI_SCAN_LOG", `${[...repeatedKeys].sort(compareBytes).join(", ")}`);
  }

  const fullCount = all("fullScan").length;
  if (scanSent && fullCount === 0) sink.add("FULL_SCAN_LOG_MISSING");

  const missingReport = ENGINE_REPORT_KEYS.filter((key) => all(key).length === 0);
  if (scanSent && missingReport.length > 0) {
    sink.add("ENGINE_REPORT_LOG_MISSING", `${[...missingReport].sort(compareBytes).join(", ")}`);
  }

  const expectedN = inputs.expectedRules.length;
  const distinctOriginal = new Set(inputs.expectedRules.map((r) => r.originalId)).size;
  const running = all("runningRules");
  const runningN = running.length > 0 ? params<"runningRules">(running[0]).n : null;
  if (scanSent && runningN === null) {
    sink.add("RULE_COUNT_LOG_MISSING");
  } else if (runningN !== null && runningN !== expectedN) {
    if (runningN === distinctOriginal) {
      sink.add(
        "RULE_COUNT_IS_DISTINCT_ID_COUNT",
        "N이 고유 원문 ID 수와 같다(접두어 없는 ID의 징후)"
      );
    } else {
      sink.add("RULE_COUNT_N_MISMATCH", `N=${runningN}, 기대=${expectedN}`);
    }
  }

  const engineErrs = all("engineErrors");
  const engineErrorsText =
    engineErrs.length > 0 ? params<"engineErrors">(engineErrs[0]).text : null;
  if (engineErrorsText !== null && engineErrorsText.trim().length > 0) {
    sink.add("ENGINE_ERRORS_NONEMPTY", `${engineErrorsText.length}자(본문은 기록하지 않는다)`);
  }
  const skipped = all("skippedRules");
  const skippedS = skipped.length > 0 ? params<"skippedRules">(skipped[0]).s : null;
  // S0 비교: 확정된 S0(관측 값이 있고 설명됨)이면 S = 0을 포함해 S와 정확히 같아야 한다. 확정되지 않았으면 S = 0은 괜찮고
  // S > 0은 설명되지 않은 건너뜀이다. S를 알 수 없으면(null) 로그 부재 쪽 사유가 다룬다.
  const s0Observed = typeof pin.s0.observed === "number" ? pin.s0.observed : null;
  const s0Confirmed = pin.s0.explained === true && s0Observed !== null;
  if (skippedS !== null) {
    if (s0Confirmed) {
      if (skippedS !== s0Observed) {
        sink.add("SKIPPED_RULES_S0_MISMATCH", `S=${skippedS}, S0=${s0Observed}`);
      }
    } else if (skippedS > 0) {
      sink.add("ENGINE_SKIPPED_RULES_UNEXPLAINED", `S=${skippedS}`);
    }
  }
  const scannedFiles = all("scannedFiles");
  const scannedK = scannedFiles.length > 0 ? params<"scannedFiles">(scannedFiles[0]).k : null;
  const found = all("foundMatches");
  const foundM = found.length > 0 ? params<"foundMatches">(found[0]).m : null;

  // 장벽: 스캔 송신보다 뒤에 도착한 첫 줄만 이번 스캔의 장벽이다.
  const barrier = all("barrier")
    .filter((l) => l.seq > scanSeq)
    .sort((a, b) => a.index - b.index)[0];
  const barrierValid = barrier !== undefined;
  if (scanSent && !barrierValid) sink.add("NO_BARRIER");

  // ── 6. PH4: echo 응답과 종료 ──
  const postSend = firstSend("echo-post-barrier");
  const postRec = responseTo("echo-post-barrier");
  let echoDone = false;
  if (barrier !== undefined) {
    if (postSend === undefined) sink.add("ECHO_MISSING", "echo-post-barrier 송신 기록이 없다");
    else if (postRec === undefined) sink.add("ECHO_MISSING", "echo 응답이 관측되지 않았다");
    else if (postRec.msg.error !== undefined) sink.add("ECHO_MISSING", "echo가 오류 응답이다");
    else if (postSend.seq < barrier.seq) sink.add("ECHO_MISSING", "echo가 장벽보다 먼저 송신됐다");
    else echoDone = true;
  }
  const postIdx = postRec ? postRec.index : Infinity;

  // ── 7. 게시 진단의 구간 분류 ──
  const initIdx = initRec ? initRec.index : -1;
  let beforeInit = 0;
  let preScan = 0;
  let late = 0;
  let badPublish = 0;
  // 스캔 송신 이후 게시된 진단의 원시 개수 D(스캔 구간 + 늦은 게시, 하네스 집계·중복 제거 전). 스캔 전·초기화 전 게시는 오염이라 뺀다.
  let rawDiagnosticsD = 0;
  const scanPubs: { key: string; rel: string | null; diagnostics: LspDiagnostic[] }[] = [];
  for (const rec of trusted) {
    if (methodOf(rec.msg) !== "textDocument/publishDiagnostics") continue;
    if (!validPublishParams(rec.msg.params)) {
      badPublish++;
      continue;
    }
    const { uri, diagnostics } = rec.msg.params;
    if (initRec === undefined || rec.index < initIdx) beforeInit++;
    else if (rec.index < scanCursor) preScan++;
    else if (postRec !== undefined && rec.index > postIdx) {
      late++;
      rawDiagnosticsD += diagnostics.length;
    } else {
      rawDiagnosticsD += diagnostics.length;
      let rel: string | null = null;
      try {
        rel = normalizePublishedUri(uri, inputs.scanRoot);
      } catch {
        rel = null; // 스캔 루트가 해석되지 않으면 어떤 URI도 정규화할 수 없다(fail-closed)
      }
      scanPubs.push({ key: rel ?? uri, rel, diagnostics });
    }
  }
  if (badPublish > 0) {
    sink.add("MALFORMED_FRAME", `publishDiagnostics 페이로드 ${badPublish}건의 모양이 깨졌다`);
  }
  if (beforeInit > 0) sink.add("DIAGNOSTIC_BEFORE_INIT", `${beforeInit}건`);
  if (preScan > 0) sink.add("PRE_SCAN_DIAGNOSTIC", `${preScan}건`);
  if (late > 0) sink.add("DIAGNOSTIC_AFTER_ECHO", `${late}건`);

  // Found M matches(필터 뒤의 개수)와 게시 진단 D의 관계(Semgrep v1.180.0 소스 기준): D ≤ M이고 M > 0이면 D ≥ 1이다.
  // D < M은 서버가 JSON이 같은 진단을 합친 정상 경우라 M = D를 요구하지 않는다. 하네스 집계 키(파일·code·범위)는 서버 키와
  // 다르므로 totals가 아니라 원시 D와 비교한다. 스캔 증거를 평가할 수 없으면(장벽·echo 응답·M 부재, 프레임 오류) 더하지 않는다.
  const matchCountEvaluable =
    barrierValid && echoDone && frameError === null && foundM !== null && initOk;
  let diagnosticCountD: number | null = null;
  let matchesDeduplicated: number | null = null;
  if (matchCountEvaluable && foundM !== null) {
    diagnosticCountD = rawDiagnosticsD;
    if (rawDiagnosticsD > foundM) {
      sink.add("MATCH_COUNT_DIAGNOSTICS_EXCESS", `M=${foundM}, D=${rawDiagnosticsD}`);
    } else if (foundM > 0 && rawDiagnosticsD === 0) {
      sink.add("MATCH_COUNT_DIAGNOSTICS_MISSING", `M=${foundM}, D=0`);
    } else {
      matchesDeduplicated = foundM - rawDiagnosticsD;
    }
  }

  // 기대 집합 E
  const expectedPaths: string[] =
    mode === "target"
      ? (inputs.scope as ScopeResult).included.map((e) => e.path)
      : (inputs.controlExpectations as ControlExpectations).cases.map((c) => c.path);
  const expectedSet = new Set(expectedPaths);

  const pubCount = new Map<string, number>();
  for (const p of scanPubs) pubCount.set(p.key, (pubCount.get(p.key) ?? 0) + 1);
  const publishedKeys = [...pubCount.keys()].sort(compareBytes);
  const duplicates = publishedKeys.filter((k) => (pubCount.get(k) as number) > 1);
  const unnormalizable = [
    ...new Set(scanPubs.filter((p) => p.rel === null).map((p) => p.key)),
  ].sort(compareBytes);
  const normalizedKeys = new Set(scanPubs.filter((p) => p.rel !== null).map((p) => p.key));
  const unexpected = [...normalizedKeys].filter((k) => !expectedSet.has(k)).sort(compareBytes);
  const missing = expectedPaths.filter((p) => !normalizedKeys.has(p)).sort(compareBytes);

  if (duplicates.length > 0) sink.add("DUPLICATE_URI", `${duplicates.length}개 URI`);
  if (unnormalizable.length > 0) {
    sink.add("URI_UNNORMALIZABLE", `${unnormalizable.length}개 URI(스캔 루트 밖이거나 해석 불가)`);
  }
  if (unexpected.length > 0) sink.add("URI_PUBLISHED_NOT_EXPECTED", listDetail(unexpected));
  if (echoDone && missing.length > 0) sink.add("URI_EXPECTED_NOT_PUBLISHED", listDetail(missing));
  if (echoDone && missing.length === 0 && unexpected.length === 0 && unnormalizable.length === 0) {
    // 집합이 같을 때만 K를 대조한다(집합 불일치는 같은 상태의 사유가 이미 있어 중복으로 쌓지 않는다).
    if (scannedK !== null && scannedK !== normalizedKeys.size) {
      sink.add("K_NE_PUBLISHED", `K=${scannedK}, 게시 ${normalizedKeys.size}`);
    }
    if (scannedK !== null && scannedK !== expectedPaths.length) {
      sink.add("K_NE_EXPECTED", `K=${scannedK}, E=${expectedPaths.length}`);
    }
  }

  // 집계
  let agg: AggregateResult | null = null;
  if (scanPubs.length > 0 || echoDone) {
    agg = aggregateDiagnostics(
      scanPubs.map((p) => ({ uri: p.key, diagnostics: p.diagnostics })),
      inputs.expectedRules.map((r) => r.finalId),
      { prefix }
    );
    for (const reason of agg.reasons) sink.addVerbatim(reason);
  }

  // ── 8. 프레임 오류·프로세스 종료·한도 ──
  if (frameError !== null) {
    if (initRec === undefined) sink.add("FRAME_ERROR_DURING_INIT", frameError.error);
    else if (preRec === undefined) sink.add("FRAME_ERROR_DURING_RULES", frameError.error);
    else if (frameError.error === "TRUNCATED") sink.add("TRUNCATED_FRAME", "잘린 프레임");
    else sink.add("MALFORMED_FRAME", "깨진 프레임");
  }
  if (stdinErrors > 0) sink.add("STDIN_WRITE_FAILED", `${stdinErrors}회`);

  const timeoutPhaseCode = (phase: unknown, waitingFor: unknown): ReasonCode => {
    if (phase === "PH0" || phase === "PH1") return "TIMEOUT_INIT";
    if (phase === "PH2") return "TIMEOUT_RULES";
    if (phase === "PH4" && typeof waitingFor === "string" && /exit|종료/i.test(waitingFor)) {
      return "TIMEOUT_EXIT";
    }
    return "TIMEOUT_SCAN";
  };
  for (const t of timeouts) {
    sink.add(timeoutPhaseCode(t.phase, t.waitingFor), `대기 대상: ${String(t.waitingFor)}`);
  }
  for (const c of cancels) {
    const code: ReasonCode =
      c.phase === "PH0" || c.phase === "PH1"
        ? "CANCELLED_DURING_INIT"
        : c.phase === "PH2"
          ? "CANCELLED_DURING_RULES"
          : "CANCELLED_DURING_SCAN";
    sink.add(code, String(c.phase));
  }

  const exitEvent = [...exits].sort((a, b) => a.seq - b.seq)[0];
  const exitSendSeq = firstSend("exit")?.seq ?? Infinity;
  if (exitEvent === undefined) {
    if (spawned && spawnFailed === 0) {
      sink.add(
        "TIMEOUT_EXIT",
        timeouts.length > 0
          ? "exit 사건이 없다"
          : "exit 사건도 timeout 사건도 없다(종료를 관측하지 못했다)"
      );
    }
  } else if (exitEvent.byHarness) {
    // 하네스가 끝낸 프로세스: 원인(한도·취소·프레임 오류·stdin 쓰기 실패)이 기록돼 있어야 한다.
    if (timeouts.length === 0 && cancels.length === 0 && frameError === null && stdinErrors === 0) {
      sink.add("TIMEOUT_EXIT", `하네스가 종료시켰는데 원인 사건이 없다(kill ${killCount}회)`);
    }
  } else {
    const detail = `code=${exitEvent.code === null ? "null" : exitEvent.code}, signal=${exitEvent.signal ?? "null"}`;
    const early = exitEvent.seq < exitSendSeq; // 하네스가 exit를 보내기 전에 서버가 스스로 끝났다
    if (early && !initOk) sink.add("EXIT_DURING_INIT", detail);
    else if (early && (!preEchoOk || !scanSent)) sink.add("EXIT_DURING_RULES", detail);
    else {
      if (early && scanSent && !barrierValid) sink.add("EXIT_BEFORE_BARRIER", detail);
      if (exitEvent.code !== 0) sink.add("EXIT_NONZERO", detail);
    }
  }

  // 자식 프로세스 정리: 프로세스를 띄웠다면 정리 성공(ok:true) 기록이 정확히 한 건 있어야 증거가 끝난다.
  // 띄우지 못했으면(spawn 사건 없음) 정리할 자식이 없어 요구하지 않는다. detail 본문은 기록하지 않는다.
  if (spawned) {
    if (cleanups.length === 0) {
      sink.add("CLEANUP_FAILED", "cleanup 기록이 없다");
    } else if (cleanups.length > 1) {
      const failedCount = cleanups.filter((c) => !c.ok).length;
      sink.add(
        "CLEANUP_FAILED",
        `cleanup 기록이 ${cleanups.length}건이다(정확히 한 건이어야 한다, 그중 실패 ${failedCount}건)`
      );
    } else if (!cleanups[0].ok) {
      sink.add("CLEANUP_FAILED", "cleanup이 실패로 보고됐다");
    }
  }

  // stderr 예외 흔적(인식되지 않은 줄만 본다 — 인식된 줄의 본문은 예외 흔적이 아니다)
  const exceptionLines = stderrLines.filter((l) => l.cls === null && EXCEPTION_LINE.test(l.text));
  if (exceptionLines.length > 0) {
    sink.add("ENGINE_EXCEPTION_LOG", `${exceptionLines.length}줄(본문은 기록하지 않는다)`);
  }

  // ── 9. 대조 참조(C8, target 전용)와 격리(C9) ──
  if (mode === "target") {
    const ref = inputs.controlReference;
    if (ref === null) {
      sink.add("CONTROL_REFERENCE_MISSING");
    } else {
      if (ref.provenance !== "real") sink.add("CONTROL_REFERENCE_SYNTHETIC", ref.run_id);
      if (ref.status !== "COMPLETE" || ref.control_assertions_status !== "PASS") {
        sink.add(
          "CONTROL_REFERENCE_NOT_PASS",
          `status=${ref.status}, 단언=${ref.control_assertions_status}`
        );
      }
      if (ref.pin_sha256 !== inputs.pinSha256)
        sink.add("CONTROL_REFERENCE_PIN_MISMATCH", ref.run_id);
      if (!ref.n0_confirmed || !pin.n0.confirmed) sink.add("N0_UNCONFIRMED");
      // 참조의 자기 선언(eligible)은 믿지 않는다: 지문·결합·음성 대조를 이번 실행과 다시 맞춰 본다.
      for (const reason of checkControlReferenceFacts(ref, inputs.currentFingerprints ?? null)) {
        sink.addVerbatim(reason);
      }
    }
  }
  if (inputs.metricsReceiverHits === null) {
    sink.add("METRICS_RECEIVER_NOT_OBSERVING");
  } else if (!Number.isInteger(inputs.metricsReceiverHits) || inputs.metricsReceiverHits !== 0) {
    sink.add("METRICS_RECEIVER_HIT", `${String(inputs.metricsReceiverHits)}건`);
  }

  // ── 10. 판정 조립 ──
  const reasons = sortReasons(sink.list);
  const status = representativeStatus(reasons);
  const provenance = provenanceOf(transcript);

  const totals: Totals | null = agg === null ? null : { ...agg.totals };
  const observed: ObservedFacts = {
    rules: {
      loadingPairsOk: [...okPairs].sort(compareBytes),
      fileErrorsReported: gotCount,
      runningRulesN: runningN,
      skippedRulesS: skippedS,
      skippingRuleLogs: skipping.map((l) => params<"skippingRule">(l).ruleId),
    },
    scan: {
      scannedFilesK: scannedK,
      foundMatchesM: foundM,
      matchesDeduplicated,
      engineErrorsText,
      barrierSeen: barrierValid,
      preScanEchoSeen: preEchoOk,
      postBarrierEchoSeen: echoDone,
    },
    published: {
      diagnosticCount: diagnosticCountD,
      uris: publishedKeys,
      duplicates,
      missing,
      unexpected: [...unexpected, ...unnormalizable],
    },
    totals,
    perFile: agg === null ? {} : structuredClone(agg.perFile),
    perRule: agg === null ? {} : { ...agg.perRule },
  };

  let controlAssertions: ControlAssertions;
  if (mode === "control") {
    const cases: Record<string, string[]> = {};
    for (const c of (inputs.controlExpectations as ControlExpectations).cases) {
      const file = observed.perFile[c.path];
      if (file === undefined || !normalizedKeys.has(c.path)) continue;
      const codes = [...file.codes];
      // code 없는 진단은 코드 목록에 없으므로 표지로 남겨 "정상 파일 0건" 단언이 속지 않게 한다.
      if (file.error + file.warning + file.information > 0 && codes.length === 0) {
        codes.push("(code 없는 진단)");
      }
      cases[c.path] = codes;
    }
    const controlObserved: ControlObserved = {
      cases,
      wholeBundleTotal: totals === null ? null : totals.total,
    };
    controlAssertions = evaluateControlAssertions(
      inputs.controlExpectations as ControlExpectations,
      controlObserved,
      { applicable: true, negativeControls: inputs.negativeControls }
    );
  } else {
    controlAssertions = notApplicableControl();
  }

  return {
    status,
    reasons,
    complete: status === "COMPLETE",
    observed,
    control_assertions: controlAssertions,
    candidate_gate: candidateGateFor(mode, provenance, status, totals),
  };
}
