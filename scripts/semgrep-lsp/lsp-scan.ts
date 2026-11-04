// LSP-SCAN-1 계약(순수 모듈): 규칙 로딩 장벽 뒤 `textDocument/didOpen` 한 번으로 합성 파일 하나를 스캔시키고, 그 반응을 관측한다.
// 파일·프로세스·시계·네트워크를 만지지 않는다.
//
// LSP-RULES-1(lsp-rules.ts)은 `initialize → initialized → 장벽 → shutdown → exit`까지다. 이 관측은 장벽 뒤에 **`didOpen` 정확히 한 번**을 더한다:
//   initialize → initialized(1회) → 규칙 장벽 → didOpen(1회) → 증거 완성 + settle 감시 → shutdown → exit
// 서버는 `didOpen`에 반응해 그 파일 하나만 단일 파일 스캔(`scan_file`)을 하고 `publishDiagnostics`를 보낸다(공개 소스에서 도출한 계약, 바이너리에서는 미관측).
//
// 이 파일이 맡는 것: 고정 계약(상수, 합성 대상 파일, 한도, 배치, 송신 순서), 보내는 메시지와 쓰기 직전 방어선, 이 경계의 요청·설정 검사(`scan.jobs = 1` 허용),
// 기대 진단과 필드 대조, stdout 분석(진단 프레임의 바이트 구간). 로그 해석은 scan-log.ts, 증거 추적·판정·기록은 lsp-scan-record.ts가 맡는다.
//
// 기존 모듈과의 관계: lsp-rules.ts·lsp-min.ts·settings.ts·rules-log.ts는 **읽기 전용으로 재사용**하고 바꾸지 않았다. 그쪽의 요청 검사(RULES·MIN)는 여전히 `jobs`
// 키를 거절한다. 그 모듈들은 이 파일을 가져오지 않는다.
//
// 계약 정정(브리프 4절): stdout 과 stderr 는 독립된 파이프라 수신 시각이 서버 내부 순서를 말해 주지 않는다. 그래서 스트림 사이의 순서 주장은 어디에도 없고,
// 순서는 각 스트림 안에서만 본다. 이 파일은 그 판단에 필요한 바이트 구간(프레임의 첫·끝 바이트)만 제공한다.
//
// 한계(미확인): 아래 계약 전체가 공개 소스의 읽기에서 도출한 것이며 `didOpen` 이후의 실제 바이너리 동작은 한 번도 관측하지 않았다.

import { FrameDecoder, type FrameDecodeError } from "./framing";
import { makeNotification, makeRequest } from "./jsonrpc";
import {
  LSP_MIN_ARGS,
  classifyServerMessage,
  joinLayoutPath,
  type ServerMessageKind,
} from "./lsp-min";
import {
  LSP_RULES_PROBE_BYTES,
  LSP_RULES_PROBE_FILE,
  LSP_RULES_PROBE_SHA256,
  LSP_RULES_LIMITS,
  PUBLISH_DIAGNOSTICS_METHOD,
  checkRulesRequest,
  emptyStdoutAnalysis,
  absorbStdoutMessage,
  rulesLayout,
  type RulesAbortCondition,
  type RulesLayout,
  type RulesLimits,
  type RulesRequestShape,
  type RulesStdoutAnalysis,
  type RulesTrigger,
} from "./lsp-rules";
import { isScanProgressRelevant, type ScanProgressFrame } from "./lsp-scan-progress";
import { sha256Hex } from "./sha";
import { ALLOWED_SCAN_KEYS, buildInitializationOptions, isNetworkRuleSource } from "./settings";
import type { JsonRpcMessage } from "./types";
import { expectedUri } from "./uri";

// ── 고정 계약 ─────────────────────────────────────────────────────

export const LSP_SCAN_SCHEMA = "semgrep-lsp-scan-observation/1" as const;
/** 인자는 LSP-MIN-1·RULES-1과 같다: 정확히 `["lsp","--debug"]`. 환경 이름 11개도 같다. */
export const LSP_SCAN_ARGS: readonly string[] = LSP_MIN_ARGS;
export const LSP_SCAN_INIT_ID = "lsp-scan-init-1";
export const LSP_SCAN_SHUTDOWN_ID = "lsp-scan-shutdown-1";

/** 프로브 규칙은 LSP-RULES-1과 같은 233바이트 파일이다(바뀌지 않았다). */
export const LSP_SCAN_PROBE_FILE = LSP_RULES_PROBE_FILE;
export const LSP_SCAN_PROBE_SHA256 = LSP_RULES_PROBE_SHA256;
export const LSP_SCAN_PROBE_BYTES = LSP_RULES_PROBE_BYTES;

/** 합성 대상 파일(결정 D7): 이 저장소가 직접 쓴 135바이트 일반 텍스트. 바이트가 계약이다. */
export const LSP_SCAN_TARGET_FILE = "lsp-scan-1-target.txt";
export const LSP_SCAN_TARGET_BYTES = 135;
export const LSP_SCAN_TARGET_SHA256 =
  "097b6a5ddb0f1f822b91ccebad23fa448d1970222502e4f18447479d0cd741ba";
/** 프로브 규칙의 pattern 토큰. 대상 파일 둘째 줄에 정확히 한 번 있다. */
export const LSP_SCAN_TARGET_TOKEN = "LSP_RULES_1_PROBE_TOKEN_THAT_IS_NEVER_PRESENT";

export const LSP_SCAN_DID_OPEN_METHOD = "textDocument/didOpen";
export const LSP_SCAN_DID_OPEN_LANGUAGE_ID = "plaintext";
export const LSP_SCAN_DID_OPEN_VERSION = 1;
/** `scan.jobs`는 정수 1로 고정한다(결정 D4). 이 경계에서만 허용한다. */
export const LSP_SCAN_JOBS = 1;

export type ScanSendLabel = "initialize" | "initialized" | "didOpen" | "shutdown" | "exit";
/** 보낼 수 있는 메시지는 이 다섯뿐이고, 이 순서로만 보낸다. `didOpen`은 정확히 한 번이고 규칙 장벽 뒤에만 보낸다. */
export const LSP_SCAN_SEND_ORDER: readonly ScanSendLabel[] = Object.freeze([
  "initialize",
  "initialized",
  "didOpen",
  "shutdown",
  "exit",
]);
const OUTBOUND_METHODS: Readonly<Record<ScanSendLabel, string>> = Object.freeze({
  initialize: "initialize",
  initialized: "initialized",
  didOpen: LSP_SCAN_DID_OPEN_METHOD,
  shutdown: "shutdown",
  exit: "exit",
});

export interface ScanLimits extends RulesLimits {
  /** `didOpen` 송신부터 진단 알림과 엔진 로그 묶음이 **둘 다** 완성돼야 하는 한도(결정 D4: 30초, 고정). */
  scanMs: number;
}

/**
 * 기존 한도(전체 150초, 장벽 60초, 초기화·종료 등)는 늘리지 않고 그대로 상속한다. `settleMs`는 RULES와 같은 2초다.
 * 한도는 낮출 수만 있고 늘리거나 자동 연장하지 않는다. 재시도도 없다.
 */
export const LSP_SCAN_LIMITS: Readonly<ScanLimits> = Object.freeze({
  ...LSP_RULES_LIMITS,
  scanMs: 30_000,
});

/** 요청이 한도를 바꾸려면 기본값 **이하**로만 바꿀 수 있다. 올릴 수는 없다. */
export function resolveScanLimits(over: Partial<ScanLimits> | undefined): {
  limits: ScanLimits;
  problems: string[];
} {
  const limits: ScanLimits = { ...LSP_SCAN_LIMITS };
  const problems: string[] = [];
  for (const [key, value] of Object.entries(over ?? {})) {
    const k = key as keyof ScanLimits;
    if (!(k in LSP_SCAN_LIMITS)) {
      problems.push(`LIMIT_UNKNOWN:${key}`);
    } else if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      problems.push(`LIMIT_INVALID:${k}`);
    } else if (value > LSP_SCAN_LIMITS[k]) {
      problems.push(`LIMIT_ABOVE_CAP:${k}`);
    } else {
      limits[k] = value;
    }
  }
  return { limits, problems };
}

// ── 중단·종료 사유 ────────────────────────────────────────────────

/** RULES의 A1~A9에 더해 A10(송신 직전 방어선의 거절)을 쓴다. */
export type ScanAbortCondition = RulesAbortCondition | "A10";
/** 판정에 쓰는 중단 이름(계획 5.2절). 기록의 `ABORTED:<이름>`이다. */
export const SCAN_ABORT_NAME: Readonly<Record<ScanAbortCondition, string>> = Object.freeze({
  A1: "FORBIDDEN_SIGNAL",
  A2: "FORBIDDEN_SIGNAL",
  A3: "FORBIDDEN_SIGNAL",
  A4: "UNEXPECTED_IMAGE",
  A5: "FILES_CHANGED",
  A6: "SERVER_REQUEST_NOT_ALLOWED",
  A7: "CANCELLED",
  A9: "BARRIER_TIMEOUT",
  A10: "SEND_REFUSED",
});
/** RULES의 종료 사유에 더해, 진단·엔진 로그가 하나도 없이 `scanMs`를 넘겼을 때 쓰는 `SCAN_TIMEOUT`. */
export type ScanTrigger = RulesTrigger | "SCAN_TIMEOUT";

/** 이 관측이 세워 주지 않는 것(미관측). 기록의 `not_established`/`coverage.unobserved`에 항상 싣는다. RULES의 정적 목록과 별개다(D10). */
export const SCAN_UNOBSERVED_ALWAYS: readonly string[] = Object.freeze([
  "RULE_DETECTION_PERFORMANCE_IN_GENERAL",
  "REAL_REPOSITORY_SCAN_SECURITY",
  "NEGATIVE_CONTROLS",
  "CONTROL_REFERENCE_QUALIFICATION",
  "WHOLE_ISOLATION_EFFECT",
  "BINARY_SOURCE_CORRESPONDENCE",
  "PIN_AND_LOG_FORMAT_VERIFICATION",
  "GIT_PROCESS_CREATION_AND_OUTCOME",
  "LOADED_RULE_COUNT_BEYOND_ENGINE_GIVEN_COUNT",
  "FILESYSTEM_OUTSIDE_WATCHED_ROOTS",
  "STATE_DIR_CONTENTS_OTHER_THAN_HOME",
  "PROCESSES_BETWEEN_SAMPLES",
  "ENGINE_RUN_WITHOUT_LOG_LINE",
  "NETWORK_OTHER_THAN_LOOPBACK_RECEIVER",
  "SCAN_PATH_LOG_FORMAT_OF_REAL_BINARY",
  "REAL_WINDOWS_BEHAVIOR_OF_REAL_SEMGREP",
]);

// ── 기대 진단 ─────────────────────────────────────────────────────

export const LSP_SCAN_EXPECTED_RANGE = Object.freeze({
  start: Object.freeze({ line: 1, character: 8 }),
  end: Object.freeze({ line: 1, character: 53 }),
});

/**
 * 소스에서 도출한 기대 진단(계획 4.7절). `code`는 두 문자열 중 하나(서수 비교, 접두 제거·접미 비교 없음)이고 실제 값을 기록한다.
 * `codeDescription`은 없어야 한다. 그 밖의 알려지지 않은 필드는 기록할 뿐 성공·실패를 만들지 않는다.
 */
export const LSP_SCAN_EXPECTED_DIAGNOSTIC = Object.freeze({
  codes: Object.freeze(["rules-probe.lsp-rules-1-probe", "lsp-rules-1-probe"] as const),
  source: "Semgrep",
  message: "LSP-RULES-1 probe rule. It is loaded but is not expected to match any target.",
  severity: 3,
});

// ── 경로 배치 ─────────────────────────────────────────────────────

export interface ScanLayout extends RulesLayout {
  /** 합성 대상 파일의 전체 경로(작업 영역 + 파일 이름). */
  targetPath: string;
}

/**
 * 작업 폴더 아래 배치. `work`는 이 관측 전용 잎 폴더(`<작업 폴더>\lsp-scan`)다:
 *   ws\lsp-scan-1-target.txt, lsp-state\rules-probe\lsp-rules-1-probe.yaml, lsp-state\home, lsp-state\tmp.
 * 작업 영역·규칙 폴더·홈·임시 폴더의 모양은 RULES와 같다(`rulesLayout`을 재사용한다).
 */
export function scanLayout(work: string): ScanLayout {
  const base = rulesLayout(work);
  return { ...base, targetPath: joinLayoutPath(base.workspace, LSP_SCAN_TARGET_FILE) };
}

/** 감시 폴더의 경로는 RULES와 같다. */
export {
  rulesRootPath as scanRootPath,
  rulesRootViolation as scanRootViolation,
} from "./lsp-rules";

function folderUri(path: string): string {
  return expectedUri(path, "_").slice(0, -2);
}

/** 작업 영역 폴더 URI(`initialize`의 rootUri). */
export function scanRootUri(layout: ScanLayout): string {
  return folderUri(layout.workspace);
}

/** `didOpen`의 uri이자 진단 URI 비교의 기대값: 작업 영역 URI + `/lsp-scan-1-target.txt`(같은 접두 문자열, 새 인코딩 선택 없음). */
export function scanTargetUri(layout: ScanLayout): string {
  return `${scanRootUri(layout)}/${LSP_SCAN_TARGET_FILE}`;
}

// ── 설정(initializationOptions) ──────────────────────────────────

const SCAN_SETTINGS = { maxTargetBytes: 1_000_000, timeout: 30, timeoutThreshold: 3 } as const;

export interface ScanInitializationOptions {
  scan: {
    ci: false;
    configuration: string[];
    maxTargetBytes: number;
    onlyGitDirty: false;
    pro_intrafile: boolean;
    timeout: number;
    timeoutThreshold: number;
    jobs: 1;
  };
  metrics: { enabled: false };
}

/** RULES와 같은 옵션에 `scan.jobs = 1`만 더한다. 기존 settings.ts(RULES·MIN 경계)는 바꾸지 않는다. */
export function buildScanInitializationOptions(layout: ScanLayout): ScanInitializationOptions {
  const base = buildInitializationOptions({ configuration: [layout.rulesDir], ...SCAN_SETTINGS });
  return { scan: { ...base.scan, jobs: LSP_SCAN_JOBS }, metrics: base.metrics };
}

function isPlain(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const keyToken = (key: string): string => key.replace(/[^A-Za-z0-9_]/g, "?").slice(0, 40);
const SCAN_KEYS_ALLOWED: readonly string[] = [...ALLOWED_SCAN_KEYS, "jobs"];

/**
 * 이 경계의 설정 검사. 사유 토큰의 목록을 돌려준다(빈 배열이면 통과). 키 집합은 RULES와 같고 `jobs`가 더해진다.
 * 서버는 `scan`·`metrics`에 알 수 없는 키가 하나라도 있으면 객체 전체를 기본값(ci=true 등)으로 되돌리므로 키뿐 아니라 `jobs`(정수 1)·`ci`·`onlyGitDirty`·
 * `metrics.enabled`의 값도 고정값과 대조한다. 값은 사유에 싣지 않는다.
 */
export function validateScanInitializationOptions(opts: unknown): string[] {
  if (!isPlain(opts)) return ["SETTINGS_NOT_OBJECT"];
  const out: string[] = [];
  for (const key of Object.keys(opts)) {
    if (key !== "scan" && key !== "metrics") out.push(`SETTINGS_KEY_NOT_ALLOWED:${keyToken(key)}`);
  }
  const scan = opts.scan;
  if (!("scan" in opts)) out.push("SETTINGS_SCAN_MISSING");
  else if (!isPlain(scan)) out.push("SETTINGS_SCAN_NOT_OBJECT");
  else {
    for (const key of Object.keys(scan)) {
      if (!SCAN_KEYS_ALLOWED.includes(key))
        out.push(`SETTINGS_KEY_NOT_ALLOWED:scan.${keyToken(key)}`);
      else if (isPlain(scan[key])) out.push(`SETTINGS_NESTED_OBJECT:scan.${keyToken(key)}`);
    }
    if (!("jobs" in scan)) out.push("SCAN_JOBS_MISSING");
    else if (scan.jobs !== LSP_SCAN_JOBS) out.push("SCAN_JOBS_INVALID");
    if (scan.ci !== false) out.push("SCAN_CI_NOT_FALSE");
    if (scan.onlyGitDirty !== false) out.push("SCAN_ONLY_GIT_DIRTY_NOT_FALSE");
    const cfg = scan.configuration;
    if (
      !Array.isArray(cfg) ||
      cfg.length === 0 ||
      cfg.some((entry) => typeof entry !== "string" || entry === "" || isNetworkRuleSource(entry))
    ) {
      out.push("SCAN_CONFIGURATION_INVALID");
    }
  }
  const metrics = opts.metrics;
  if (!("metrics" in opts)) out.push("SETTINGS_METRICS_MISSING");
  else if (!isPlain(metrics)) out.push("SETTINGS_METRICS_NOT_OBJECT");
  else {
    for (const key of Object.keys(metrics)) {
      if (key !== "enabled") out.push(`SETTINGS_KEY_NOT_ALLOWED:metrics.${keyToken(key)}`);
    }
    if (metrics.enabled !== false) out.push("METRICS_ENABLED_NOT_FALSE");
  }
  return out;
}

// ── 보내는 메시지 ─────────────────────────────────────────────────

export function buildScanInitializeParams(layout: ScanLayout): Record<string, unknown> {
  const initializationOptions = buildScanInitializationOptions(layout);
  if (validateScanInitializationOptions(initializationOptions).length > 0) {
    throw new Error("initializationOptions가 허용 키 검사를 통과하지 못했다");
  }
  const uri = scanRootUri(layout);
  return {
    processId: null,
    rootUri: uri,
    workspaceFolders: [{ uri, name: "ws" }],
    capabilities: {},
    initializationOptions,
  };
}

export function buildScanInitializeMessage(layout: ScanLayout): JsonRpcMessage {
  return makeRequest(LSP_SCAN_INIT_ID, "initialize", buildScanInitializeParams(layout));
}
export function buildScanInitializedMessage(): JsonRpcMessage {
  return makeNotification("initialized", {});
}
export function buildScanShutdownMessage(): JsonRpcMessage {
  return makeRequest(LSP_SCAN_SHUTDOWN_ID, "shutdown");
}
export function buildScanExitMessage(): JsonRpcMessage {
  return makeNotification("exit");
}

/** 대상 파일 바이트가 고정 계약(135바이트)과 같은지. 해시는 호출자가 주입한 함수로 잰다. */
function targetBytesProblem(
  bytes: unknown,
  sha256Of: (bytes: Uint8Array) => string
): "MISSING" | "SIZE" | "HASH" | null {
  if (!(bytes instanceof Uint8Array)) return "MISSING";
  if (bytes.byteLength !== LSP_SCAN_TARGET_BYTES) return "SIZE";
  return sha256Of(bytes) === LSP_SCAN_TARGET_SHA256 ? null : "HASH";
}

/**
 * `didOpen` 알림. 본문(`text`)은 **파일의 실제 바이트**를 UTF-8로 풀어 그대로 쓴다(uri·languageId·version 은 계약 상수).
 * 바이트가 고정 계약(135바이트, 고정 sha256)과 다르면 던진다 — 계약과 다른 파일을 읽히게 하는 호출은 프로그래머 오류다.
 */
export function buildScanDidOpenMessage(
  layout: ScanLayout,
  targetBytes: Uint8Array
): JsonRpcMessage {
  if (targetBytesProblem(targetBytes, sha256Hex) !== null) {
    throw new Error("didOpen 대상 파일이 고정 계약(135바이트, 고정 sha256)과 다르다");
  }
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(targetBytes);
  return makeNotification(LSP_SCAN_DID_OPEN_METHOD, {
    textDocument: {
      uri: scanTargetUri(layout),
      languageId: LSP_SCAN_DID_OPEN_LANGUAGE_ID,
      version: LSP_SCAN_DID_OPEN_VERSION,
      text,
    },
  });
}

export interface ScanSendGuardContext {
  /** 규칙 로딩 장벽을 넘었는가. `didOpen`은 이것이 true 일 때만 나간다. */
  barrierDone: boolean;
  /**
   * 초기 진행 메시지(규칙 새로고침·열린 문서 스캔의 create·begin·end)가 stdout 에서 완전한 프레임으로 모두 읽혔는가(lsp-scan-progress.ts).
   * `didOpen`은 이것이 true 일 때만 나간다. true 가 아닌 모든 값(undefined 포함)은 확인되지 않은 것이므로 거절한다.
   */
  progressComplete: boolean;
  /** 지금까지 보낸 라벨(순서대로). */
  sent: readonly ScanSendLabel[];
  /** 정확히 이 값이어야 하는 `didOpen`의 uri 와 본문. */
  expectedDidOpen: { uri: string; text: string };
}

function isEmptyObject(value: unknown): boolean {
  return isPlain(value) && Object.keys(value).length === 0;
}
function sameKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const have = Object.keys(value).sort();
  const want = [...keys].sort();
  return have.length === want.length && have.every((k, i) => k === want[i]);
}

/**
 * 쓰기 직전의 마지막 방어선: 이 다섯 말고는 stdin에 쓰지 않는다. 어긋나면 던진다(프로그래머 오류; 실행기는 이것을 `SEND_REFUSED`(A10)로 바꾼다).
 * `didOpen`은 정확히 한 번, `initialized` 뒤 장벽을 넘은 다음에만 나가고, uri·본문·languageId·version 이 기대와 정확히 같고 params 에 다른 키가 없어야 한다.
 * `didSave`·`didChange`·`didClose`·`semgrep/scanWorkspace`·`semgrep/refreshRules`·작업 영역 변경·파일 생성·서버 요청에 대한 응답은 메서드 이름 불일치로 막힌다.
 */
export function assertAllowedScanOutbound(
  label: ScanSendLabel,
  message: JsonRpcMessage,
  ctx: ScanSendGuardContext
): void {
  const known = Object.prototype.hasOwnProperty.call(OUTBOUND_METHODS, label);
  const allowedMethod = known ? OUTBOUND_METHODS[label] : undefined;
  if (allowedMethod === undefined || message.method !== allowedMethod) {
    throw new Error(`허용되지 않은 송신: ${String(label)}`);
  }
  if (ctx.sent.includes(label))
    throw new Error(`허용되지 않은 송신: ${label}을(를) 두 번 보낼 수 없다`);
  const at = LSP_SCAN_SEND_ORDER.indexOf(label);
  for (const earlier of ctx.sent) {
    if (LSP_SCAN_SEND_ORDER.indexOf(earlier) >= at) {
      throw new Error(`허용되지 않은 송신 순서: ${earlier} 다음에 ${label}`);
    }
  }
  const wantsId = label === "initialize" || label === "shutdown";
  if (wantsId !== (message.id !== undefined)) throw new Error(`허용되지 않은 송신 형태: ${label}`);
  if (label === "initialized" && !isEmptyObject(message.params)) {
    throw new Error("허용되지 않은 송신 형태: initialized의 params");
  }
  if ((label === "shutdown" || label === "exit") && message.params !== undefined) {
    throw new Error(`허용되지 않은 송신 형태: ${label}의 params`);
  }
  if (label === "initialized" && !ctx.sent.includes("initialize")) {
    throw new Error("허용되지 않은 송신: initialize 전의 initialized");
  }
  if (label === "didOpen") {
    if (!ctx.sent.includes("initialized")) {
      throw new Error("허용되지 않은 송신: initialized 전의 didOpen");
    }
    if (!ctx.barrierDone) throw new Error("허용되지 않은 송신: 규칙 로딩 장벽 앞의 didOpen");
    if (ctx.progressComplete !== true) {
      throw new Error("허용되지 않은 송신: 초기 진행 메시지를 다 읽기 전의 didOpen");
    }
    const params = message.params;
    if (!isPlain(params) || !sameKeys(params, ["textDocument"])) {
      throw new Error("허용되지 않은 송신 형태: didOpen의 params");
    }
    const doc = params.textDocument;
    if (!isPlain(doc) || !sameKeys(doc, ["uri", "languageId", "version", "text"])) {
      throw new Error("허용되지 않은 송신 형태: didOpen의 textDocument");
    }
    if (doc.uri !== ctx.expectedDidOpen.uri)
      throw new Error("허용되지 않은 송신: didOpen uri가 기대와 다르다");
    if (doc.text !== ctx.expectedDidOpen.text)
      throw new Error("허용되지 않은 송신: didOpen 본문이 기대와 다르다");
    if (
      doc.languageId !== LSP_SCAN_DID_OPEN_LANGUAGE_ID ||
      doc.version !== LSP_SCAN_DID_OPEN_VERSION
    ) {
      throw new Error("허용되지 않은 송신: didOpen languageId·version이 기대와 다르다");
    }
  }
}

// ── 요청 검사 ─────────────────────────────────────────────────────

export interface ScanRequestShape extends Omit<RulesRequestShape, "layout" | "limits"> {
  layout: ScanLayout;
  limits?: Partial<ScanLimits>;
  /** 작업 영역에 둘 합성 대상 파일의 바이트. 크기·해시가 고정값과 같아야 한다. */
  targetBytes?: Uint8Array;
  /** 함께 오면 SCAN 설정 검사를 거친다. 없으면 `buildScanInitializationOptions`가 만든다는 뜻이다. */
  initializationOptions?: unknown;
}

/**
 * 요청 검사. 거절 사유 토큰의 목록을 돌려준다(빈 배열이면 통과). 값(경로·환경 변수 값)은 사유에 싣지 않는다.
 * 기존 RULES 검사(checkRulesRequest)를 그대로 거치되 `scanMs`는 이쪽에서 따로 검사하고, 대상 파일과 `jobs`를 더한다.
 * 하나라도 있으면 실행기는 아무 폴더도 만들지 않고 아무 프로세스도 띄우지 않는다.
 */
export function checkScanRequest(
  request: ScanRequestShape,
  sha256Of: (bytes: Uint8Array) => string
): string[] {
  const rulesLimits: Partial<ScanLimits> = { ...(request.limits ?? {}) };
  delete rulesLimits.scanMs;
  const refusals: string[] = [
    ...checkRulesRequest(
      { ...request, layout: request.layout, limits: rulesLimits as Partial<RulesLimits> },
      sha256Of
    ),
    ...resolveScanLimits(request.limits).problems,
  ];
  const layout = request.layout;
  if (
    typeof layout.targetPath !== "string" ||
    layout.targetPath !== joinLayoutPath(layout.workspace, LSP_SCAN_TARGET_FILE)
  ) {
    refusals.push("LAYOUT_MISMATCH");
  }
  const problem = targetBytesProblem(request.targetBytes, sha256Of);
  if (problem === "MISSING") refusals.push("TARGET_BYTES_MISSING");
  else if (problem === "SIZE") refusals.push("TARGET_SIZE_MISMATCH");
  else if (problem === "HASH") refusals.push("TARGET_HASH_MISMATCH");
  if (
    request.initializationOptions !== undefined &&
    validateScanInitializationOptions(request.initializationOptions).length > 0
  ) {
    refusals.push("SETTINGS_KEY_NOT_ALLOWED");
  }
  return [...new Set(refusals)];
}

// ── 진단 평가 ─────────────────────────────────────────────────────

const KNOWN_DIAGNOSTIC_FIELDS = ["range", "severity", "code", "source", "message"] as const;

export type ScanRangeClass = "EXACT" | "END_SHIFTED_BY_ONE" | "MISMATCH";

export interface ScanDiagnosticEvaluation {
  /** 알려진 다섯 필드가 모두 기대와 같고 `codeDescription`이 없다. 알려지지 않은 필드는 여기에 영향을 주지 않는다. */
  ok: boolean;
  /** 틀린 필드의 이름: NOT_OBJECT, CODE, SOURCE, MESSAGE, SEVERITY, RANGE, CODE_DESCRIPTION_PRESENT. */
  mismatches: string[];
  /** 알려진 필드(와 codeDescription)가 아닌 키, 정렬됨. 기록할 뿐 성공·실패를 만들지 않는다. */
  unknownFields: string[];
  codeDescriptionAbsent: boolean;
  fields: {
    code: { actual: unknown; match: boolean };
    source: { actual: unknown; match: boolean };
    message: { actual: unknown; match: boolean };
    severity: { actual: unknown; match: boolean };
    range: { actual: unknown; match: boolean; class: ScanRangeClass };
  };
}

function isInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function classifyRange(range: unknown): ScanRangeClass {
  if (!isPlain(range)) return "MISMATCH";
  const { start, end } = range;
  if (!isPlain(start) || !isPlain(end)) return "MISMATCH";
  if (![start.line, start.character, end.line, end.character].every(isInt)) return "MISMATCH";
  const want = LSP_SCAN_EXPECTED_RANGE;
  const startSame = start.line === want.start.line && start.character === want.start.character;
  const endLineSame = end.line === want.end.line;
  if (startSame && endLineSame && end.character === want.end.character) return "EXACT";
  if (startSame && endLineSame && Math.abs((end.character as number) - want.end.character) === 1) {
    return "END_SHIFTED_BY_ONE";
  }
  return "MISMATCH";
}

/** 디코딩된 진단 객체 하나를 기대와 대조한다(서수 비교). 실제 값은 고치지 않고 그대로 돌려준다. */
export function evaluateScanDiagnostic(raw: unknown): ScanDiagnosticEvaluation {
  const exp = LSP_SCAN_EXPECTED_DIAGNOSTIC;
  if (!isPlain(raw)) {
    return {
      ok: false,
      mismatches: ["NOT_OBJECT"],
      unknownFields: [],
      codeDescriptionAbsent: true,
      fields: {
        code: { actual: undefined, match: false },
        source: { actual: undefined, match: false },
        message: { actual: undefined, match: false },
        severity: { actual: undefined, match: false },
        range: { actual: undefined, match: false, class: "MISMATCH" },
      },
    };
  }
  const codeMatch =
    typeof raw.code === "string" && (exp.codes as readonly string[]).includes(raw.code);
  const sourceMatch = raw.source === exp.source;
  const messageMatch = raw.message === exp.message;
  const severityMatch = raw.severity === exp.severity;
  const rangeClass = classifyRange(raw.range);
  const codeDescriptionAbsent = !Object.prototype.hasOwnProperty.call(raw, "codeDescription");
  const mismatches: string[] = [];
  if (!codeMatch) mismatches.push("CODE");
  if (!sourceMatch) mismatches.push("SOURCE");
  if (!messageMatch) mismatches.push("MESSAGE");
  if (!severityMatch) mismatches.push("SEVERITY");
  if (rangeClass !== "EXACT") mismatches.push("RANGE");
  if (!codeDescriptionAbsent) mismatches.push("CODE_DESCRIPTION_PRESENT");
  const unknownFields = Object.keys(raw)
    .filter(
      (k) => !(KNOWN_DIAGNOSTIC_FIELDS as readonly string[]).includes(k) && k !== "codeDescription"
    )
    .sort();
  return {
    ok: mismatches.length === 0,
    mismatches,
    unknownFields,
    codeDescriptionAbsent,
    fields: {
      code: { actual: raw.code, match: codeMatch },
      source: { actual: raw.source, match: sourceMatch },
      message: { actual: raw.message, match: messageMatch },
      severity: { actual: raw.severity, match: severityMatch },
      range: { actual: raw.range, match: rangeClass === "EXACT", class: rangeClass },
    },
  };
}

// ── stdout 분석 ───────────────────────────────────────────────────

export interface ScanStdoutFrame {
  /** stdout 에서 몇 번째 프레임인가(0부터). */
  index: number;
  /** 프레임 첫 바이트의 위치(스트림 처음부터). */
  startByte: number;
  /** 프레임 마지막 바이트 다음 위치(배타). 이 바이트까지 받아야 프레임이 완성된다. */
  endByte: number;
  kind: ServerMessageKind;
  method: string | null;
}

export interface ScanDiagnosticFrame {
  index: number;
  startByte: number;
  endByte: number;
  /** params.uri 원문(문자열이 아닐 수 있다). */
  uri: unknown;
  /** params.diagnostics (배열이 아니면 null). */
  diagnostics: unknown[] | null;
  /** params 가 객체이고 diagnostics 가 배열이다. uri 가 올바른지는 scan-uri.ts 의 비교가 판단한다(문자열이 아니면 거절). */
  shapeOk: boolean;
  /** params 의 키(정렬됨). */
  paramsKeys: string[];
}

export interface ScanStdoutAnalysis extends RulesStdoutAnalysis {
  frameList: ScanStdoutFrame[];
  diagnosticFrames: ScanDiagnosticFrame[];
  /**
   * 초기 진행 장벽이 보는 프레임(진행 요청 시도·`$/progress`·`rulesRefreshed`)을 원문의 바이트 구간과 함께 모은 것.
   * 사후 재해석이 `didOpen` 송신 때의 stdout 위치에서 같은 조건을 다시 확인하는 데 쓴다(lsp-scan-progress.ts).
   */
  progressFrames: ScanProgressFrame[];
}

/** 검증을 마친 프레임들의 바이트 구간. 디코더가 이미 형식을 확인했으므로 헤더만 읽는다. */
function frameSpans(bytes: Uint8Array, count: number): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  let pos = 0;
  for (let i = 0; i < count; i += 1) {
    let headerEnd = -1;
    for (let j = pos; j + 3 < bytes.length; j += 1) {
      if (
        bytes[j] === 0x0d &&
        bytes[j + 1] === 0x0a &&
        bytes[j + 2] === 0x0d &&
        bytes[j + 3] === 0x0a
      ) {
        headerEnd = j;
        break;
      }
    }
    if (headerEnd < 0) break;
    const header = new TextDecoder("latin1").decode(bytes.subarray(pos, headerEnd));
    const m = /content-length:[ \t]*(\d+)/i.exec(header);
    if (m === null) break;
    const end = headerEnd + 4 + Number(m[1]);
    spans.push({ start: pos, end });
    pos = end;
  }
  return spans;
}

/**
 * stdout 전체 바이트를 프레임으로 풀어 분석한다. 기존 RULES 분석과 같은 디코더·같은 흡수 함수를 쓰고, 여기에 프레임마다 바이트 구간과
 * 진단 프레임의 내용(uri, diagnostics 원문)을 더한다. 초기화·종료 응답은 이 관측의 id(`lsp-scan-init-1`, `lsp-scan-shutdown-1`)로만 알아본다.
 * 끝에 덜 온 프레임은 `expectEof`일 때 TRUNCATED 다. 오류가 나면 그 앞에서 완성된 프레임은 남는다.
 */
export function analyzeScanStdout(bytes: Uint8Array, expectEof: boolean): ScanStdoutAnalysis {
  const decoder = new FrameDecoder({ maxMessageBytes: Math.max(bytes.byteLength, 1) });
  const pushed = decoder.push(bytes);
  const base = emptyStdoutAnalysis();
  const frameList: ScanStdoutFrame[] = [];
  const diagnosticFrames: ScanDiagnosticFrame[] = [];
  const progressFrames: ScanProgressFrame[] = [];
  const spans = frameSpans(bytes, pushed.messages.length);
  pushed.messages.forEach((message, index) => {
    const kind = classifyServerMessage(message);
    const span = spans[index] ?? { start: -1, end: -1 };
    const method = typeof message.method === "string" ? message.method : null;
    frameList.push({ index, startByte: span.start, endByte: span.end, kind, method });
    if (isScanProgressRelevant(message)) {
      progressFrames.push({ index, startByte: span.start, endByte: span.end, message });
    }
    if (kind === "response") {
      base.frames += 1;
      if (message.id === LSP_SCAN_INIT_ID) {
        if (base.initMessage === null) base.initMessage = message;
        else base.initDuplicate = true;
      } else if (message.id === LSP_SCAN_SHUTDOWN_ID) {
        base.shutdownResponseSeen = true;
      } else {
        base.unmatchedResponses += 1;
      }
      return;
    }
    absorbStdoutMessage(base, message);
    if (kind === "notification" && method === PUBLISH_DIAGNOSTICS_METHOD) {
      const params = (message as unknown as Record<string, unknown>).params;
      const plain = isPlain(params);
      const diagnostics = plain && Array.isArray(params.diagnostics) ? params.diagnostics : null;
      diagnosticFrames.push({
        index,
        startByte: span.start,
        endByte: span.end,
        uri: plain ? params.uri : undefined,
        diagnostics,
        shapeOk: plain && diagnostics !== null,
        paramsKeys: plain ? Object.keys(params).sort() : [],
      });
    }
  });
  let frameError: FrameDecodeError | null = pushed.error;
  if (frameError === null && expectEof) frameError = decoder.end().error;
  return { ...base, frameError, frameList, diagnosticFrames, progressFrames };
}
