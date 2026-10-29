// LSP-MIN-1 최소 기동 관측의 계약과 해석(순수 모듈). 파일·프로세스·시계·네트워크를 만지지 않는다.
//
// 이 관측은 `semgrep.exe lsp --debug`를 한 번 띄워 initialize → shutdown → exit 세 메시지만 주고받고 끝낸다. **`initialized`를 보내지
// 않는다** — 그래서 규칙 로딩, 스캔, 정상 LSP 시작 경로를 재현하지 않는다. 결과는 별도 기록 형식(`semgrep-lsp-min-observation/1`)으로만
// 남고, 기존 평가기·하네스(evaluate.ts·harness.ts)에 이어지지 않는다(그쪽은 이 파일을 가져오지 않고, 이 파일도 그쪽을 가져오지 않는다).
// 기록은 `not_established`에 COMPLETE·보안 통과·대조 참조 자격·정상 시작을 모두 NOT_ESTABLISHED로 못 박는다.
//
// 이 파일이 맡는 것:
//   · 고정 계약: 실행 파일 이름·인자, 보내도 되는 메시지 셋, 상한, 중단 문구, 허용 이미지, 감시 폴더의 역할
//   · 요청 검사(refusals) — 하나라도 걸리면 아무것도 만들지 않고 띄우지도 않는다
//   · initialize 응답 검증: error 부재만으로 성공으로 치지 않는다(요청 id 일치, 응답 구조, InitializeResult의 capabilities,
//     result 안에 담겨 오는 InitializeError(`{retry}`) 거절)
//   · stderr 문구 감시(청크 경계에 걸친 문구 포함), stdout 메시지 분류
//   · 관측 기록(buildObservationRecord): 실시간 감시·사후 비교·미관측을 따로 싣고, 관측 결과와 정리 결과를 따로 싣는다
//
// 실행(프로세스를 띄우고 시간을 재는 일)은 lsp-min-run.ts가 한다. Windows 전용 계정에서 실제로 돌리는 쪽은
// scripts/semgrep-lsp-isolation/windows/lsp-min-runner.ps1이고, 이 파일의 핵심 규칙(classifyInitResponseCore)과 상수를
// 그대로 옮긴 LspMinContract.ps1이 같은 결과를 내는지는 그쪽 시험이 이 파일과 대조한다.
//
// 한계(미확인): 아래 계약 전체가 공개 소스의 읽기에서 도출한 것이며 실제 Semgrep 바이너리로는 확인하지 않았다.
//
// 공개 API:
//   LSP_MIN_* 상수, lspMinLayout, buildLspMinEnv / buildLspMinChildEnv, buildInitializeMessage / buildShutdownMessage / buildExitMessage
//   checkLspMinRequest(request): string[]                         거절 사유(빈 배열이면 통과)
//   classifyInitResponseCore(message): InitCoreResult             흐름을 정하는 핵심 규칙(V2~V8)
//   analyzeInitResponse(message): InitAnalysis                    분석 규칙(V9 포함)과 기록용 사실
//   findAbortPattern(textLowerCased) / StderrWatcher              A1·A2 문구 감시
//   analyzeStdoutBytes / analyzeStderrBytes                       원문 바이트에서 사후 해석
//   descendantsOf(snapshot, rootPid)                              프로세스 목록에서 자손 찾기
//   buildObservationRecord(facts): LspMinObservation              기록 만들기

import { canonicalJsonLine } from "./canonical";
import { FrameDecoder, type FrameDecodeError } from "./framing";
import { makeNotification, makeRequest } from "./jsonrpc";
import { isValidRunId } from "./run-id";
import { buildInitializationOptions, validateInitializationOptions } from "./settings";
import { sha256Hex } from "./sha";
import type { JsonRpcMessage, ProcessRow, ProcessSnapshot, Provenance } from "./types";
import { expectedUri } from "./uri";

// ── 고정 계약 ─────────────────────────────────────────────────────

export const LSP_MIN_SCHEMA = "semgrep-lsp-min-observation/1" as const;
/** 허용하는 실행 파일 이름(대소문자 무시). 이 관측은 Windows만 다룬다. */
export const LSP_MIN_EXE_NAME = "semgrep.exe";
/** 인자는 정확히 이 둘이다. 다른 인자(`--legacy`, `--x-eio-ls` 등)는 거절한다. */
export const LSP_MIN_ARGS: readonly string[] = Object.freeze(["lsp", "--debug"]);
export const LSP_MIN_INIT_ID = "lsp-min-init-1";
export const LSP_MIN_SHUTDOWN_ID = "lsp-min-shutdown-1";

/** 보낼 수 있는 메시지는 이 셋뿐이고, 이 순서로만 보낸다. `initialized`·문서 알림·스캔 요청은 보내지 않는다. */
export type LspMinSendLabel = "initialize" | "shutdown" | "exit";
export const LSP_MIN_SEND_ORDER: readonly LspMinSendLabel[] = Object.freeze([
  "initialize",
  "shutdown",
  "exit",
]);
const OUTBOUND_METHODS: Readonly<Record<LspMinSendLabel, string>> = Object.freeze({
  initialize: "initialize",
  shutdown: "shutdown",
  exit: "exit",
});

export interface LspMinLimits {
  /** 관측 구간 전체의 상한(ms). 시작부터 강제 종료 신호를 보내거나 자식이 끝날 때까지. */
  totalMs: number;
  /** initialize 응답을 기다리는 한도. */
  initMs: number;
  /** exit 송신 뒤 자식의 종료를 기다리는 한도. */
  exitMs: number;
  /** stdin을 닫은 뒤 자식의 종료를 기다리는 유예. */
  stdinCloseGraceMs: number;
  /** 정리 구간: 종료 확인 창. 한 번, 고정이다. */
  killConfirmMs: number;
  maxStdoutBytes: number;
  maxStderrBytes: number;
  /** 라이브 표본 사이의 최소 간격. */
  sampleIntervalMs: number;
}

// 새 실행기 전용 상한(소유자 결정). 기존 REAL_LIMITS(cli.ts)와 별개이며 그쪽은 바꾸지 않는다.
// UNVERIFIED: init 60초·exit 30초·유예 10초는 기존 값에서 가져왔다. stderr 256 KiB는 추정(실측 아님)에서 정한 상한이다.
export const LSP_MIN_LIMITS: Readonly<LspMinLimits> = Object.freeze({
  totalMs: 150_000,
  initMs: 60_000,
  exitMs: 30_000,
  stdinCloseGraceMs: 10_000,
  killConfirmMs: 10_000,
  maxStdoutBytes: 1_048_576,
  maxStderrBytes: 262_144,
  sampleIntervalMs: 40,
});

/** 요청이 한도를 바꾸려면 기본값 **이하**로만 바꿀 수 있다(시험이 짧게 줄이는 용도). 올릴 수는 없다. */
export function resolveLimits(over: Partial<LspMinLimits> | undefined): {
  limits: LspMinLimits;
  problems: string[];
} {
  const limits: LspMinLimits = { ...LSP_MIN_LIMITS };
  const problems: string[] = [];
  for (const [key, value] of Object.entries(over ?? {})) {
    const k = key as keyof LspMinLimits;
    if (!(k in LSP_MIN_LIMITS)) {
      problems.push(`LIMIT_UNKNOWN:${key}`);
      continue;
    }
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      problems.push(`LIMIT_INVALID:${k}`);
    } else if (value > LSP_MIN_LIMITS[k]) {
      problems.push(`LIMIT_ABOVE_CAP:${k}`);
    } else {
      limits[k] = value;
    }
  }
  return { limits, problems };
}

// 중단 문구. 소문자로 비교한다(대소문자 무시, 부분 문자열).
/** A1: 규칙 새로고침·스캔을 알리는 로그 키. `initialized` 없이는 나오면 안 된다. */
export const ABORT_SCAN_PATTERNS: readonly string[] = Object.freeze([
  "refreshing rules",
  "rules refreshed",
  "scanning workspace",
  "scanning open documents",
  "scanning single file",
  "scanned workspace",
  "scanned open documents",
]);
/** A2: 규칙 내려받기 시도의 신호(오탐은 중단 쪽으로 기우는 안전한 방향이다). */
export const ABORT_NETWORK_PATTERNS: readonly string[] = Object.freeze(["download", "registry"]);
/** A8: stdout으로 오는 알림 중 규칙·진단을 알리는 것. */
export const ABORT_STDOUT_METHODS: readonly string[] = Object.freeze([
  "semgrep/rulesRefreshed",
  "textDocument/publishDiagnostics",
]);
/** 초기화 오류가 서버 로그에 남는 문구(Legacy_request_handler.ml:82). 판정(분석 규칙 V10)에만 쓴다. */
export const INIT_ERROR_LOG_PATTERN = "error initializing server";

/** A4: 자식 트리에 있어도 되는 이미지 이름(소문자). 경로는 보지 않고 이름만 본다 — 경로는 기록에 남겨 사후 검토한다. */
export const ALLOWED_IMAGES: readonly string[] = Object.freeze([
  "semgrep.exe",
  "python.exe",
  "semgrep-core.exe",
  "pysemgrep.exe",
  "conhost.exe",
]);

export type AbortCondition = "A1" | "A2" | "A3" | "A4" | "A5" | "A7" | "A8";
export type LspMinTrigger =
  | "NORMAL"
  | "INIT_INVALID"
  | "INIT_TIMEOUT"
  | "LIVE_ABORT"
  | "TOTAL_TIMEOUT"
  | "OUTPUT_LIMIT"
  | "FRAME_ERROR"
  | "STDIN_ERROR"
  /** stdout·stderr를 읽다가 오류가 났다. 쓰기 실패(STDIN_ERROR)와 다른 사유다. */
  | "STREAM_READ_FAILED"
  | "CHILD_EXITED_EARLY"
  | "EXIT_TIMEOUT"
  | "SPAWN_FAILED";

/** 감시 폴더의 역할. 기록에는 경로 대신 이 이름만 싣는다. */
export type WatchedRole = "WORKSPACE" | "RULES_DIR" | "HOME_DIR";
export const WATCHED_ROLES: readonly WatchedRole[] = Object.freeze([
  "WORKSPACE",
  "RULES_DIR",
  "HOME_DIR",
]);
/** HOME_DIR 안에서 `shutdown`이 쓰는 것으로 예상되는 폴더(계획 O9). 그 밖에 파일이 생기면 A5다. */
export const HOME_EXPECTED_PREFIX = ".semgrep/cache/fingerprinted_ignored_findings/";

/** 이 관측이 세워 주지 않는 것(미관측). 기록의 coverage.unobserved에 항상 싣는다. */
export const UNOBSERVED_ALWAYS: readonly string[] = Object.freeze([
  "FILESYSTEM_OUTSIDE_WATCHED_ROOTS",
  "STATE_DIR_CONTENTS_OTHER_THAN_HOME",
  "FILE_CONTENT_CHANGES",
  "PROCESSES_BETWEEN_SAMPLES",
  "NETWORK_OTHER_THAN_LOOPBACK_RECEIVER",
  "BINARY_SOURCE_CORRESPONDENCE",
  "REAL_WINDOWS_BEHAVIOR_OF_REAL_SEMGREP",
]);

/** 감시 폴더 안의 한 파일이 금지된 변경인가(A5). 경로는 폴더 기준 상대 경로이고 구분자는 '/' 또는 '\'다. */
export function rootViolation(role: WatchedRole, relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  if (role === "HOME_DIR") return !normalized.startsWith(HOME_EXPECTED_PREFIX);
  return true; // WORKSPACE·RULES_DIR는 비어 있어야 한다
}

// ── 경로 배치 ─────────────────────────────────────────────────────

export interface LspMinLayout {
  work: string;
  /** 서버가 작업 영역으로 삼는 빈 폴더. */
  workspace: string;
  /** 자식의 작업 폴더이자 상태 폴더. */
  stateDir: string;
  /** `configuration`으로 주는 명시적인 빈 로컬 규칙 폴더. */
  rulesDir: string;
  /** 자식의 전용 홈(`USERPROFILE`). 실행 전에 실제 폴더로 만든다. */
  homeDir: string;
  tmpDir: string;
}

function trimTrailingSeparators(path: string): string {
  return path.replace(/[\\/]+$/, "");
}

/** 경로를 합친다. 구분자는 기준 경로가 쓰는 것을 따른다(역슬래시만 쓰면 역슬래시, 아니면 '/'). */
export function joinLayoutPath(base: string, name: string): string {
  const root = trimTrailingSeparators(base);
  const sep = root.includes("\\") && !root.includes("/") ? "\\" : "/";
  return `${root}${sep}${name}`;
}

export function lspMinLayout(work: string): LspMinLayout {
  const stateDir = joinLayoutPath(work, "lsp-state");
  return {
    work,
    workspace: joinLayoutPath(work, "ws"),
    stateDir,
    rulesDir: joinLayoutPath(stateDir, "rules-empty"),
    homeDir: joinLayoutPath(stateDir, "home"),
    tmpDir: joinLayoutPath(stateDir, "tmp"),
  };
}

export function rootPathOf(layout: LspMinLayout, role: WatchedRole): string {
  return role === "WORKSPACE"
    ? layout.workspace
    : role === "RULES_DIR"
      ? layout.rulesDir
      : layout.homeDir;
}

const WINDOWS_ABSOLUTE = /^[A-Za-z]:[\\/]/;
function isAbsoluteLike(path: string): boolean {
  return WINDOWS_ABSOLUTE.test(path) || path.startsWith("/");
}

function baseNameOf(path: string): string {
  const parts = path.split(/[\\/]+/);
  return parts[parts.length - 1] ?? "";
}

// ── 환경 ──────────────────────────────────────────────────────────

/** 자식 환경에 들어갈 수 있는 이름 전부. 이 밖의 이름은 거절한다(`SEMGREP_ENABLE_VERSION_CHECK`도 여기에 없다 — 소유자 결정). */
export const LSP_MIN_ENV_NAMES: readonly string[] = Object.freeze([
  "PATH",
  "SYSTEMROOT",
  "TEMP",
  "TMP",
  "USERPROFILE",
  "SEMGREP_APP_URL",
  "SEMGREP_METRICS_URL",
  "SEMGREP_VERSION_CHECK_URL",
  "SEMGREP_LOG_FILE",
  "SEMGREP_SETTINGS_FILE",
  "SEMGREP_VERSION_CACHE_PATH",
]);
const LOOPBACK_URL = /^http:\/\/127\.0\.0\.1:\d{1,5}$/;

/** 순수: 윈도우 폴더와 수신기 주소, 배치로 환경 전체를 만든다. PowerShell의 New-LspMinChildEnv와 같은 이름·같은 값이다. */
export function buildLspMinEnv(
  layout: LspMinLayout,
  windowsDir: string,
  metricsUrl: string
): Record<string, string> {
  const winDir = trimTrailingSeparators(windowsDir);
  return {
    PATH: `${winDir}\\System32;${winDir}`,
    SYSTEMROOT: winDir,
    TEMP: layout.tmpDir,
    TMP: layout.tmpDir,
    USERPROFILE: layout.homeDir,
    SEMGREP_APP_URL: metricsUrl,
    SEMGREP_METRICS_URL: metricsUrl,
    SEMGREP_VERSION_CHECK_URL: metricsUrl,
    SEMGREP_LOG_FILE: joinLayoutPath(layout.stateDir, "semgrep.log"),
    SEMGREP_SETTINGS_FILE: joinLayoutPath(layout.stateDir, "settings.yml"),
    SEMGREP_VERSION_CACHE_PATH: joinLayoutPath(layout.stateDir, "version-cache"),
  };
}

/** 부모 환경에서는 SYSTEMROOT 하나만 읽는다(나머지는 배치에서 정한다). Windows가 아니면 던진다. */
export function buildLspMinChildEnv(
  deps: { getEnv(name: string): string | undefined; platform: string },
  layout: LspMinLayout,
  metricsUrl: string
): Record<string, string> {
  if (deps.platform !== "win32") throw new Error("LSP-MIN-1은 Windows만 다룬다");
  const systemRoot = deps.getEnv("SYSTEMROOT");
  if (systemRoot === undefined || systemRoot === "") throw new Error("SYSTEMROOT가 없다");
  return buildLspMinEnv(layout, systemRoot, metricsUrl);
}

// ── 보내는 메시지 ─────────────────────────────────────────────────

// UNVERIFIED: 키 이름과 값은 기존 하네스(settings.ts)와 같은 것을 쓴다. 규칙은 읽히지 않을 것으로 예상하지만 읽혀도 빈 폴더다.
const LSP_MIN_SETTINGS = { maxTargetBytes: 1_000_000, timeout: 30, timeoutThreshold: 3 } as const;

function folderUri(path: string): string {
  // expectedUri는 비어 있지 않은 상대 경로가 필요하다. 하네스(harness.ts rootUri)와 같은 방법으로 자리표시 한 조각을 붙였다 뗀다.
  return expectedUri(path, "_").slice(0, -2);
}

export function buildInitializeParams(layout: LspMinLayout): Record<string, unknown> {
  const initializationOptions = buildInitializationOptions({
    configuration: [layout.rulesDir],
    ...LSP_MIN_SETTINGS,
  });
  const reasons = validateInitializationOptions(initializationOptions);
  if (reasons.length > 0) throw new Error("initializationOptions가 허용 키 검사를 통과하지 못했다");
  const uri = folderUri(layout.workspace);
  return {
    processId: null,
    rootUri: uri,
    workspaceFolders: [{ uri, name: "ws" }],
    capabilities: {},
    initializationOptions,
  };
}

export function buildInitializeMessage(layout: LspMinLayout): JsonRpcMessage {
  return makeRequest(LSP_MIN_INIT_ID, "initialize", buildInitializeParams(layout));
}

export function buildShutdownMessage(): JsonRpcMessage {
  return makeRequest(LSP_MIN_SHUTDOWN_ID, "shutdown");
}

export function buildExitMessage(): JsonRpcMessage {
  return makeNotification("exit");
}

/** 쓰기 직전의 마지막 방어선: 이 셋 말고는 stdin에 쓰지 않는다. 어긋나면 던진다(프로그래머 오류). */
export function assertAllowedOutbound(label: LspMinSendLabel, message: JsonRpcMessage): void {
  const allowedMethod = OUTBOUND_METHODS[label];
  if (allowedMethod === undefined || message.method !== allowedMethod) {
    throw new Error(`허용되지 않은 송신: ${label}`);
  }
  const wantsId = label !== "exit";
  const hasId = message.id !== undefined;
  if (wantsId !== hasId) throw new Error(`허용되지 않은 송신 형태: ${label}`);
}

// ── 요청 검사 ─────────────────────────────────────────────────────

export interface LspMinRequestShape {
  runId: string;
  command: string;
  args: readonly string[];
  layout: LspMinLayout;
  env: Readonly<Record<string, string>>;
  limits?: Partial<LspMinLimits>;
  artifacts?: readonly { label: string; path: string }[];
}

function containsAbortPattern(path: string): string | null {
  const lower = path.toLowerCase();
  for (const pattern of [
    ...ABORT_SCAN_PATTERNS,
    ...ABORT_NETWORK_PATTERNS,
    INIT_ERROR_LOG_PATTERN,
  ]) {
    if (lower.includes(pattern)) return pattern;
  }
  return null;
}

function sameEnv(
  actual: Readonly<Record<string, string>>,
  expected: Readonly<Record<string, string>>
): string[] {
  const problems: string[] = [];
  for (const name of Object.keys(actual)) {
    if (!(LSP_MIN_ENV_NAMES as readonly string[]).includes(name)) {
      // 값은 싣지 않는다. 이름만 남긴다.
      problems.push(`ENV_NAME_NOT_ALLOWED:${name.replace(/[^A-Za-z0-9_]/g, "?")}`);
    }
  }
  for (const name of LSP_MIN_ENV_NAMES) {
    if (!(name in actual)) problems.push(`ENV_NAME_MISSING:${name}`);
    else if (actual[name] !== expected[name]) problems.push(`ENV_VALUE_UNEXPECTED:${name}`);
  }
  return problems;
}

/**
 * 요청 검사. 거절 사유 토큰의 목록을 돌려준다(빈 배열이면 통과). 값(경로·환경변수 값)은 사유에 싣지 않는다.
 * 하나라도 있으면 실행기는 아무 폴더도 만들지 않고 아무 프로세스도 띄우지 않는다.
 */
export function checkLspMinRequest(request: LspMinRequestShape): string[] {
  const refusals: string[] = [];
  if (!isValidRunId(request.runId)) refusals.push("RUN_ID_INVALID");
  if (typeof request.command !== "string" || !isAbsoluteLike(request.command)) {
    refusals.push("COMMAND_NOT_ABSOLUTE");
  } else if (baseNameOf(request.command).toLowerCase() !== LSP_MIN_EXE_NAME) {
    refusals.push("COMMAND_NAME_NOT_ALLOWED");
  }
  if (
    !Array.isArray(request.args) ||
    request.args.length !== LSP_MIN_ARGS.length ||
    request.args.some((arg, i) => arg !== LSP_MIN_ARGS[i])
  ) {
    refusals.push("ARGS_NOT_FIXED");
  }
  // 실행 파일 경로가 중단 문구를 담으면 `--debug`가 argv를 찍을 때 스스로 중단될 수 있다(단 한 번의 실행을 헛되이 쓰지 않도록 시작 전에 거절한다).
  if (typeof request.command === "string" && containsAbortPattern(request.command) !== null) {
    refusals.push("PATH_CONTAINS_ABORT_PATTERN:COMMAND");
  }
  const layout = request.layout;
  if (!isAbsoluteLike(layout.work)) refusals.push("WORK_DIR_NOT_ABSOLUTE");
  else {
    // 감시 폴더 셋과 상태 폴더는 작업 폴더에서 도출한 것과 같아야 한다(요청이 다른 곳을 가리키지 못하게. PowerShell 러너의 Test-LspMinLayoutMatches와 같다).
    const want = lspMinLayout(layout.work);
    for (const key of ["workspace", "stateDir", "rulesDir", "homeDir", "tmpDir"] as const) {
      if (layout[key] !== want[key]) refusals.push("LAYOUT_MISMATCH");
    }
  }
  for (const role of WATCHED_ROLES) {
    const hit = containsAbortPattern(rootPathOf(layout, role));
    if (hit !== null) refusals.push(`PATH_CONTAINS_ABORT_PATTERN:${role}`);
  }
  const { problems } = resolveLimits(request.limits);
  refusals.push(...problems);

  // 환경: 이름 집합과 값이 전부 buildLspMinEnv가 만든 것과 같아야 한다(전용 홈, 작업 폴더 안의 TEMP·TMP, 루프백 주소).
  const url = request.env.SEMGREP_APP_URL;
  const systemRoot = request.env.SYSTEMROOT;
  if (typeof url !== "string" || !LOOPBACK_URL.test(url)) {
    refusals.push("ENV_URL_NOT_LOOPBACK");
  }
  if (typeof systemRoot !== "string" || systemRoot === "") {
    refusals.push("ENV_NAME_MISSING:SYSTEMROOT");
  }
  if (typeof url === "string" && typeof systemRoot === "string" && systemRoot !== "") {
    refusals.push(...sameEnv(request.env, buildLspMinEnv(layout, systemRoot, url)));
  } else {
    for (const name of Object.keys(request.env)) {
      if (!(LSP_MIN_ENV_NAMES as readonly string[]).includes(name)) {
        refusals.push(`ENV_NAME_NOT_ALLOWED:${name.replace(/[^A-Za-z0-9_]/g, "?")}`);
      }
    }
  }
  for (const item of request.artifacts ?? []) {
    if (typeof item.label !== "string" || item.label === "")
      refusals.push("ARTIFACT_LABEL_INVALID");
    if (typeof item.path !== "string" || !isAbsoluteLike(item.path)) {
      refusals.push("ARTIFACT_PATH_NOT_ABSOLUTE");
    } else if (containsAbortPattern(item.path) !== null) {
      refusals.push("PATH_CONTAINS_ABORT_PATTERN:ARTIFACT");
    }
  }
  return [...new Set(refusals)];
}

// ── initialize 응답 검증 ──────────────────────────────────────────

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export type InitCoreReason =
  | "INIT_MESSAGE_HAS_METHOD"
  | "INIT_ERROR_RESPONSE"
  | "INIT_RESULT_MISSING"
  | "INIT_RESULT_AND_ERROR"
  | "INIT_RESULT_NOT_OBJECT"
  | "INIT_RESULT_IS_INITIALIZE_ERROR"
  | "INIT_CAPABILITIES_MISSING"
  | "INIT_CAPABILITIES_NOT_OBJECT";

export type InitCoreResult = { ok: true } | { ok: false; reasons: InitCoreReason[] };

/**
 * 흐름을 정하는 핵심 규칙(V2·V4~V8). 호출자가 id 일치(V3)를 먼저 확인한 메시지에만 쓴다. 던지지 않는다.
 * 통과하면 shutdown·exit를 보내고, 통과하지 못하면 더 보내지 않고 stdin을 닫는다.
 * `error` 키는 값이 null이어도 있는 것으로 센다(JSON-RPC는 응답에 error와 result를 함께 두지 못하게 한다).
 */
export function classifyInitResponseCore(message: JsonRpcMessage): InitCoreResult {
  const m = message as unknown as Record<string, unknown>;
  const reasons: InitCoreReason[] = [];
  if (hasOwn(m, "method")) reasons.push("INIT_MESSAGE_HAS_METHOD");
  const hasError = hasOwn(m, "error");
  const hasResult = hasOwn(m, "result");
  if (hasError) reasons.push(hasResult ? "INIT_RESULT_AND_ERROR" : "INIT_ERROR_RESPONSE");
  if (!hasResult) {
    if (!hasError) reasons.push("INIT_RESULT_MISSING");
  } else if (!hasError) {
    const result = m.result;
    if (!isPlainObject(result)) {
      reasons.push("INIT_RESULT_NOT_OBJECT");
    } else {
      if (hasOwn(result, "retry")) reasons.push("INIT_RESULT_IS_INITIALIZE_ERROR");
      if (!hasOwn(result, "capabilities")) reasons.push("INIT_CAPABILITIES_MISSING");
      else if (!isPlainObject(result.capabilities)) reasons.push("INIT_CAPABILITIES_NOT_OBJECT");
    }
  }
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

export type InitAnalysisReason = InitCoreReason | "INIT_SERVERINFO_MALFORMED";

export interface InitAnalysis {
  valid: boolean;
  reasons: InitAnalysisReason[];
  /** 서버가 알려 준 이름과 버전(문자열일 때만). 판정에 쓰지 않고 기록한다. */
  serverInfo: { name: string | null; version: string | null } | null;
  /** capabilities의 정규 직렬화 해시. 객체가 아니면 null. */
  capabilitiesSha256: string | null;
  /** result의 키 이름(값은 싣지 않는다). */
  resultKeys: string[];
}

/** 핵심 규칙에 분석 규칙(V9)을 더해 기록용 사실을 만든다. 던지지 않는다. */
export function analyzeInitResponse(message: JsonRpcMessage): InitAnalysis {
  const core = classifyInitResponseCore(message);
  const reasons: InitAnalysisReason[] = core.ok ? [] : [...core.reasons];
  const m = message as unknown as Record<string, unknown>;
  const result = m.result;
  let serverInfo: InitAnalysis["serverInfo"] = null;
  let capabilitiesSha256: string | null = null;
  let resultKeys: string[] = [];
  if (isPlainObject(result)) {
    resultKeys = Object.keys(result).sort();
    if (isPlainObject(result.capabilities)) {
      try {
        capabilitiesSha256 = sha256Hex(canonicalJsonLine(result.capabilities));
      } catch {
        capabilitiesSha256 = null; // 정규 직렬화할 수 없는 값(예: 순환)은 해시를 만들지 않는다
      }
    }
    if (hasOwn(result, "serverInfo")) {
      const info = result.serverInfo;
      if (!isPlainObject(info) || typeof info.name !== "string") {
        reasons.push("INIT_SERVERINFO_MALFORMED");
      } else if (
        hasOwn(info, "version") &&
        info.version !== undefined &&
        typeof info.version !== "string"
      ) {
        reasons.push("INIT_SERVERINFO_MALFORMED");
        serverInfo = { name: info.name, version: null };
      } else {
        serverInfo = {
          name: info.name,
          version: typeof info.version === "string" ? info.version : null,
        };
      }
    }
  }
  return { valid: reasons.length === 0, reasons, serverInfo, capabilitiesSha256, resultKeys };
}

// ── stdout 메시지 분류 ────────────────────────────────────────────

export type ServerMessageKind = "response" | "server-request" | "notification" | "invalid";

export function classifyServerMessage(message: JsonRpcMessage): ServerMessageKind {
  const hasMethod = typeof message.method === "string";
  const hasId = message.id !== undefined && message.id !== null;
  if (hasMethod && hasId) return "server-request";
  if (hasMethod) return "notification";
  if (hasId) return "response";
  return "invalid";
}

// ── stderr 문구 감시 ──────────────────────────────────────────────

export interface AbortPatternHit {
  condition: "A1" | "A2";
  pattern: string;
}

/** 소문자로 바꾼 텍스트에서 중단 문구를 찾는다. A1이 A2보다 먼저 검사된다. */
export function findAbortPattern(textLowerCased: string): AbortPatternHit | null {
  for (const pattern of ABORT_SCAN_PATTERNS) {
    if (textLowerCased.includes(pattern)) return { condition: "A1", pattern };
  }
  for (const pattern of ABORT_NETWORK_PATTERNS) {
    if (textLowerCased.includes(pattern)) return { condition: "A2", pattern };
  }
  return null;
}

const MAX_PATTERN_LENGTH = Math.max(
  ...ABORT_SCAN_PATTERNS.map((p) => p.length),
  ...ABORT_NETWORK_PATTERNS.map((p) => p.length),
  INIT_ERROR_LOG_PATTERN.length
);

/**
 * 청크 단위로 들어오는 stderr에서 중단 문구를 실시간으로 찾는다. 문구가 청크 경계에 걸쳐도 찾도록 직전 텍스트의 꼬리를 이어 붙여 본다.
 * 개행이 없는 마지막 줄도 본다(줄 단위로 모으지 않는다). UTF-8은 스트리밍 해독이라 청크 경계의 멀티바이트 문자도 복원된다.
 */
export class StderrWatcher {
  private readonly decoder = new TextDecoder("utf-8", { fatal: false, ignoreBOM: true });
  private tail = "";
  private _hit: AbortPatternHit | null = null;
  private _initErrorLogged = false;
  private _checkedBytes = 0;

  get hit(): AbortPatternHit | null {
    return this._hit;
  }
  get initErrorLogged(): boolean {
    return this._initErrorLogged;
  }
  get checkedBytes(): number {
    return this._checkedBytes;
  }

  /** 새 청크를 먹이고, 이번에 처음 찾은 중단 문구가 있으면 돌려준다(이미 찾았다면 null). */
  push(chunk: Uint8Array): AbortPatternHit | null {
    this._checkedBytes += chunk.byteLength;
    const text = this.decoder.decode(chunk, { stream: true });
    const window = (this.tail + text).toLowerCase();
    if (window.includes(INIT_ERROR_LOG_PATTERN)) this._initErrorLogged = true;
    this.tail = window.slice(Math.max(0, window.length - (MAX_PATTERN_LENGTH - 1)));
    if (this._hit !== null) return null;
    const found = findAbortPattern(window);
    if (found !== null) this._hit = found;
    return found;
  }
}

// ── 원문 바이트의 사후 해석 ───────────────────────────────────────

export interface StdoutAnalysis {
  frames: number;
  frameError: FrameDecodeError | null;
  messages: JsonRpcMessage[];
}

/** stdout 전체 바이트를 프레임으로 풀어 본다(실시간 경로와 같은 디코더). 끝에 덜 온 프레임은 TRUNCATED로 센다. */
export function analyzeStdoutBytes(bytes: Uint8Array, expectEof: boolean): StdoutAnalysis {
  const decoder = new FrameDecoder({ maxMessageBytes: Math.max(bytes.byteLength, 1) });
  const pushed = decoder.push(bytes);
  const messages = [...pushed.messages];
  let frameError = pushed.error;
  if (frameError === null && expectEof) frameError = decoder.end().error;
  return { frames: messages.length, frameError, messages };
}

const HEADER_PREFIX = /^\[\d+\.\d+\]\[(DEBUG|INFO|WARNING|ERROR)\]/;

export interface StderrAnalysis {
  lines: number;
  linesWithHeader: number;
  linesWithoutHeader: number;
  partialTail: boolean;
  hit: AbortPatternHit | null;
  initErrorLogged: boolean;
  sha256: string;
}

/** stderr 전체 바이트의 사후 해석: 줄 수, 머리말 유무, 중단 문구, 초기화 오류 로그. 줄 원문은 기록에 싣지 않는다. */
export function analyzeStderrBytes(bytes: Uint8Array): StderrAnalysis {
  const text = new TextDecoder("utf-8", { fatal: false, ignoreBOM: true }).decode(bytes);
  const endsWithNewline = text.endsWith("\n");
  const rawLines = text.split("\n");
  if (rawLines[rawLines.length - 1] === "") rawLines.pop();
  let withHeader = 0;
  for (const line of rawLines) if (HEADER_PREFIX.test(line.replace(/\r$/, ""))) withHeader += 1;
  const lower = text.toLowerCase();
  return {
    lines: rawLines.length,
    linesWithHeader: withHeader,
    linesWithoutHeader: rawLines.length - withHeader,
    partialTail: text.length > 0 && !endsWithNewline,
    hit: findAbortPattern(lower),
    initErrorLogged: lower.includes(INIT_ERROR_LOG_PATTERN),
    sha256: sha256Hex(bytes),
  };
}

// ── 프로세스 목록에서 자손 찾기 ───────────────────────────────────

export interface DescendantResult {
  rows: ProcessRow[];
  /** ROOT_PRESENT: 루트가 목록에 있고 시작 시각으로 PID 재사용을 걸렀다. ROOT_GONE: 루트가 목록에 없어 부모 PID만으로 이었다(PID 재사용 위험). */
  tracking: "ROOT_PRESENT" | "ROOT_GONE";
}

/** 루트 PID의 자손을 부모 PID로 따라간다. Windows처럼 부모 연결이 믿기 어려운 목록은 부모가 자식보다 늦게 시작하지 않았을 때만 잇는다. */
export function descendantsOf(snapshot: ProcessSnapshot, rootPid: number): DescendantResult {
  const root = snapshot.rows.find((row) => row.pid === rootPid && !row.vanished) ?? null;
  const byParent = new Map<number, ProcessRow[]>();
  for (const row of snapshot.rows) {
    if (row.ppid === null || row.vanished) continue;
    const list = byParent.get(row.ppid) ?? [];
    list.push(row);
    byParent.set(row.ppid, list);
  }
  const found: ProcessRow[] = [];
  const seen = new Set<number>([rootPid]);
  const queue: Array<{ pid: number; startTime: number | null }> = [
    { pid: rootPid, startTime: root?.startTime ?? null },
  ];
  while (queue.length > 0) {
    const current = queue.shift() as { pid: number; startTime: number | null };
    for (const child of byParent.get(current.pid) ?? []) {
      if (seen.has(child.pid)) continue;
      if (
        snapshot.parentLinkNeedsStartTime &&
        current.startTime !== null &&
        (child.startTime === null || child.startTime < current.startTime)
      ) {
        continue;
      }
      seen.add(child.pid);
      found.push(child);
      queue.push({ pid: child.pid, startTime: child.startTime });
    }
  }
  return { rows: found, tracking: root === null ? "ROOT_GONE" : "ROOT_PRESENT" };
}

/** 행의 이미지 이름(소문자). 이름이 없으면 실행 파일 경로의 마지막 조각, 그것도 없으면 null. */
export function imageNameOf(row: ProcessRow): string | null {
  if (row.name !== null && row.name !== "") return row.name.toLowerCase();
  if (row.executable !== null && row.executable !== "")
    return baseNameOf(row.executable).toLowerCase();
  return null;
}

// ── 관측 기록 ─────────────────────────────────────────────────────

export type LspMinStatus = "OBSERVED" | "ABORTED" | "NOT_OBSERVED" | "NOT_ATTEMPTED";
export type TerminationPath =
  "SELF_EXIT" | "STDIN_CLOSED" | "FORCE_KILLED" | "NOT_SPAWNED" | "NOT_OBSERVED";

export interface StreamFacts {
  bytes: Uint8Array;
  /** 읽은 전체 바이트 수(상한 초과분 포함). */
  total: number;
  overflow: boolean;
  eof: boolean;
  readFailed: boolean;
  /** 읽기 실패의 오류 문구(형식 이름과 메시지). 기록에는 tokenOf로 걸러 짧게 싣는다. 실패하지 않았으면 없다. */
  readError?: string | null;
}

export interface WatchedRootFacts {
  role: WatchedRole;
  filesBefore: number | null;
  filesAfter: number | null;
  added: string[];
  removed: string[];
  samples: number;
  failures: number;
}

export interface ArtifactFacts {
  label: string;
  before: string | null;
  after: string | null;
}

export interface LspMinFacts {
  runId: string;
  provenance: Provenance | null;
  /** 요청을 거절한 사유. 비어 있지 않으면 아무것도 만들거나 띄우지 않았다. */
  refusals: string[];
  limits: LspMinLimits;
  expectedVersion: string | null;
  spawn: { attempted: boolean; ok: boolean; pid: number | null };
  sends: { label: LspMinSendLabel; tMs: number; ok: boolean }[];
  stdout: StreamFacts;
  stderr: StreamFacts;
  /** 실시간 경로가 본 프레임 오류. 사후 해석이 찾은 것과 합쳐 쓴다. */
  frameError: FrameDecodeError | null;
  /** 맞는 id의 첫 응답 프레임이 도착한 시각(실행기의 시계). 도착하지 않았거나 모르면 null. */
  initResponseAtMs: number | null;
  /** 이 모듈 밖(러너 결과 어댑터)에서 정한, 관측 성립을 막는 사유 토큰. 비어 있으면 아무 영향이 없다. */
  externalReasons?: readonly string[];
  exit: { observed: boolean; code: number | null; signal: string | null; tMs: number | null };
  stdinClosed: { byHarness: boolean; ok: boolean | null; tMs: number | null };
  kill: { count: number; firstTMs: number | null; confirmed: boolean | null };
  trigger: LspMinTrigger | null;
  also: LspMinTrigger[];
  abort: { condition: AbortCondition; detail: string; tMs: number } | null;
  /** 실시간 표본. */
  live: {
    stderrCheckedBytes: number;
    stdoutFramesChecked: number;
    receiver: {
      baselineHits: number | null;
      finalHits: number | null;
      samples: number;
      failures: number;
    };
    processes: {
      samples: number;
      failures: number;
      maxDescendants: number;
      imagesSeen: string[];
      disallowed: string[];
    };
    files: { samples: number; failures: number };
  };
  roots: WatchedRootFacts[];
  artifacts: ArtifactFacts[];
  timeline: { observationMs: number | null; cleanupMs: number | null };
  cleanup: {
    childExitConfirmed: boolean;
    streamsClosed: boolean | null;
    descendantsAliveAfter: number | null;
    descendantTracking: DescendantResult["tracking"] | null;
    dispose: "OK" | "FAILED" | "NOT_CALLED";
    timersCancelled: boolean;
    problems: string[];
  };
}

export interface LspMinObservation {
  schema: typeof LSP_MIN_SCHEMA;
  run_id: string;
  /** stub이면 실제 Semgrep의 증거가 아니다. null이면 띄우지 않았다. */
  provenance: Provenance | null;
  status: LspMinStatus;
  status_reasons: string[];
  request: {
    process_role: "lsp-min";
    command_base: string;
    args: string[];
    limits: {
      total_ms: number;
      init_ms: number;
      exit_ms: number;
      stdin_close_grace_ms: number;
      kill_confirm_ms: number;
      max_stdout_bytes: number;
      max_stderr_bytes: number;
      sample_interval_ms: number;
    };
    messages_allowed: LspMinSendLabel[];
    initialized_sent: false;
    refusals: string[];
  };
  sent: { label: LspMinSendLabel; t_ms: number; ok: boolean }[];
  initialize: {
    response: "VALID" | "INVALID" | "NONE";
    reasons: string[];
    latency_ms: number | null;
    server_info: { name: string | null; version: string | null } | null;
    /** 핀의 버전과 비교한 결과. 기록만 하며 status를 바꾸지 않는다. */
    pin_version_comparison: "MATCH" | "MISMATCH" | "NOT_OBSERVED" | "NOT_GIVEN";
    capabilities_sha256: string | null;
    result_keys: string[];
  };
  server_messages: {
    frames: number;
    responses_matched: number;
    responses_unmatched: number;
    server_requests: { count: number; methods: string[] };
    notifications: { count: number; methods: Record<string, number> };
    anomalies: string[];
  };
  streams: {
    stdout: {
      bytes: number;
      sha256: string;
      overflow: boolean;
      eof: boolean;
      read_failed: boolean;
      /** 읽기 실패의 오류 문구(걸러서 짧게). 실패하지 않았으면 null. 정상 EOF와 읽기 실패는 서로 다른 값이다. */
      read_error: string | null;
    };
    stderr: {
      bytes: number;
      sha256: string;
      lines: number;
      lines_with_header: number;
      lines_without_header: number;
      partial_tail: boolean;
      overflow: boolean;
      eof: boolean;
      read_failed: boolean;
      read_error: string | null;
    };
  };
  termination: {
    trigger: LspMinTrigger | null;
    also: LspMinTrigger[];
    abort: { condition: AbortCondition; detail: string; t_ms: number } | null;
    path: TerminationPath;
    exit: { code: number | null; signal: string | null } | null;
    exit_observed: boolean;
    stdin_closed_by_harness: boolean;
    kill_count: number;
  };
  timeline: { total_budget_ms: number; observation_ms: number | null; cleanup_ms: number | null };
  coverage: {
    live: {
      mode: "SAMPLING";
      interval_ms: number;
      stderr_patterns: { checked_bytes: number; hit: AbortPatternHit | null };
      stdout_notifications: { frames_checked: number };
      receiver: {
        baseline_hits: number | null;
        final_hits: number | null;
        samples: number;
        failures: number;
      };
      processes: {
        samples: number;
        failures: number;
        max_descendants: number;
        images_seen: string[];
        disallowed: string[];
      };
      files: { samples: number; failures: number };
    };
    post_hoc: {
      watched_roots: {
        role: WatchedRole;
        files_before: number | null;
        files_after: number | null;
        added: string[];
        removed: string[];
      }[];
      stderr_pattern_missed_live: boolean;
      artifact_hashes: {
        label: string;
        before: string | null;
        after: string | null;
        comparison: "SAME" | "CHANGED" | "NOT_COMPARED";
      }[];
      network_events: "COLLECTED_OUTSIDE_THIS_MODULE";
    };
    unobserved: string[];
  };
  cleanup: {
    ok: boolean;
    problems: string[];
    child_exit_confirmed: boolean;
    streams_closed: boolean | null;
    descendants_alive_after: number | null;
    descendant_tracking: DescendantResult["tracking"] | null;
    dispose: "OK" | "FAILED" | "NOT_CALLED";
    timers_cancelled: boolean;
  };
  /** 이 관측이 세워 주지 않는 것. 값은 항상 NOT_ESTABLISHED다. */
  not_established: {
    complete: "NOT_ESTABLISHED";
    security_pass: "NOT_ESTABLISHED";
    control_reference: "NOT_ESTABLISHED";
    normal_startup: "NOT_ESTABLISHED";
    rules_loading: "NOT_ESTABLISHED";
    scanning: "NOT_ESTABLISHED";
    pin_verification: "NOT_ESTABLISHED";
  };
}

const MAX_LISTED = 50;

function capped(items: readonly string[]): string[] {
  return items.length <= MAX_LISTED
    ? [...items]
    : [...items.slice(0, MAX_LISTED), `+${items.length - MAX_LISTED}`];
}

/** 기록에 싣는 짧은 식별 문자열. 제어 문자와 기호는 `?`로 바꾸고 길이를 자른다(공백은 문구를 읽을 수 있게 남긴다). */
function tokenOf(text: string): string {
  return text.replace(/[^A-Za-z0-9_.:/ -]/g, "?").slice(0, 80);
}

function compareArtifact(item: ArtifactFacts): "SAME" | "CHANGED" | "NOT_COMPARED" {
  if (item.before === null || item.after === null) return "NOT_COMPARED";
  return item.before === item.after ? "SAME" : "CHANGED";
}

/** 이 이유가 trigger나 also 어디에 있든 관측 성립을 막는다. 다른 이유는 각자의 근거(응답 판정, 스트림 사실 등)로 status에 반영된다. */
const OBSERVATION_BLOCKING_TRIGGERS: readonly LspMinTrigger[] = [
  "TOTAL_TIMEOUT",
  "STDIN_ERROR",
  "STREAM_READ_FAILED",
  "CHILD_EXITED_EARLY",
];

function readErrorOf(stream: StreamFacts): string | null {
  if (!stream.readFailed || !stream.readError) return null;
  const token = tokenOf(stream.readError);
  return token === "" ? null : token;
}

function terminationPath(facts: LspMinFacts): TerminationPath {
  if (!facts.spawn.ok) return "NOT_SPAWNED";
  if (!facts.exit.observed) return "NOT_OBSERVED";
  if (facts.kill.count > 0) return "FORCE_KILLED";
  if (facts.stdinClosed.byHarness) return "STDIN_CLOSED";
  return "SELF_EXIT";
}

/**
 * 사실(facts)에서 기록을 만든다. 같은 사실이면 같은 기록이다(시계·무작위 없음). stdout은 원문 바이트에서 다시 프레임으로 풀어
 * 응답·알림·서버 요청을 센다 — 실시간 경로가 본 것과 같은 디코더를 쓰므로, 둘이 어긋나면 사후 해석이 이긴다.
 * 관측 결과(status)와 정리 결과(cleanup.ok)는 따로 정해지고 서로를 바꾸지 않는다.
 */
export function buildObservationRecord(facts: LspMinFacts): LspMinObservation {
  const stdoutAnalysis = analyzeStdoutBytes(facts.stdout.bytes, facts.stdout.eof);
  const stderrAnalysis = analyzeStderrBytes(facts.stderr.bytes);
  const frameError = facts.frameError ?? stdoutAnalysis.frameError;

  // ── 서버 메시지 분류와 initialize 응답 ──
  let matchedResponses = 0;
  let unmatchedResponses = 0;
  let initMessage: JsonRpcMessage | null = null;
  let initMessageIndex = -1;
  const anomalies: string[] = [];
  const serverRequestMethods: string[] = [];
  let serverRequestCount = 0;
  const notificationMethods: Record<string, number> = {};
  let notificationCount = 0;
  const notificationsBeforeInit: string[] = [];
  let initDuplicate = false;
  // 실시간 감시가 놓쳤거나 러너 경로에서 종료 뒤에 도착한 stdout 알림도 원문 바이트에서 다시 찾는다(stderr 문구의 사후 확인과 짝).
  let abortMethodSeen = false;
  stdoutAnalysis.messages.forEach((message, index) => {
    const kind = classifyServerMessage(message);
    if (kind === "response") {
      if (message.id === LSP_MIN_INIT_ID) {
        if (initMessage === null) {
          initMessage = message;
          initMessageIndex = index;
          matchedResponses += 1;
        } else {
          anomalies.push("INIT_RESPONSE_DUPLICATE");
          initDuplicate = true;
        }
      } else if (message.id === LSP_MIN_SHUTDOWN_ID) {
        matchedResponses += 1;
        anomalies.push("SHUTDOWN_RESPONSE_SEEN");
      } else {
        unmatchedResponses += 1;
      }
    } else if (kind === "server-request") {
      serverRequestCount += 1;
      if (serverRequestMethods.length < 20)
        serverRequestMethods.push(tokenOf(String(message.method)));
    } else if (kind === "notification") {
      notificationCount += 1;
      if (ABORT_STDOUT_METHODS.includes(String(message.method))) abortMethodSeen = true;
      const method = tokenOf(String(message.method));
      if (Object.keys(notificationMethods).length < MAX_LISTED || method in notificationMethods) {
        notificationMethods[method] = (notificationMethods[method] ?? 0) + 1;
      }
      if (initMessageIndex < 0) notificationsBeforeInit.push(method);
    } else {
      anomalies.push("MESSAGE_WITHOUT_METHOD_OR_ID");
    }
  });
  if (unmatchedResponses > 0) anomalies.push("UNMATCHED_RESPONSES");
  if (serverRequestCount > 0) anomalies.push("SERVER_REQUESTS_SEEN");

  let initResponse: "VALID" | "INVALID" | "NONE" = "NONE";
  let initReasons: string[] = [];
  let serverInfo: InitAnalysis["serverInfo"] = null;
  let capabilitiesSha: string | null = null;
  let resultKeys: string[] = [];
  if (initMessage !== null) {
    const analysis = analyzeInitResponse(initMessage);
    initReasons = [...analysis.reasons];
    serverInfo = analysis.serverInfo;
    capabilitiesSha = analysis.capabilitiesSha256;
    resultKeys = analysis.resultKeys;
    // 서버가 초기화 오류를 로그로 남겼다면, 응답 모양이 멀쩡해도 성공으로 치지 않는다(V10).
    if (stderrAnalysis.initErrorLogged) initReasons.push("INIT_ERROR_LOGGED");
    initResponse = initReasons.length === 0 ? "VALID" : "INVALID";
  } else {
    initReasons = ["INIT_NO_RESPONSE"];
  }

  // 응답이 오기까지의 시간: initialize 송신 시각부터 맞는 응답 프레임이 도착한 시각까지. 둘 중 하나라도 모르면 null이다.
  const initSentAt = facts.sends.find((s) => s.label === "initialize" && s.ok)?.tMs ?? null;
  const latencyMs =
    initMessage !== null && initSentAt !== null && facts.initResponseAtMs !== null
      ? Math.max(0, facts.initResponseAtMs - initSentAt)
      : null;

  // ── 상태 ──
  const reasons: string[] = [];
  let status: LspMinStatus;
  const missedLive = stderrAnalysis.hit !== null && facts.abort === null;
  if (facts.refusals.length > 0) {
    status = "NOT_ATTEMPTED";
    reasons.push(...facts.refusals);
  } else if (facts.abort !== null) {
    status = "ABORTED";
    reasons.push(`ABORT:${facts.abort.condition}`);
    reasons.push(...(facts.externalReasons ?? []));
  } else {
    reasons.push(...(facts.externalReasons ?? []));
    // 첫 응답과 같은 id의 두 번째 응답은 서버가 한 번 답한 뒤 다른 말을 한 것이므로 관측으로 치지 않는다(첫 응답의 판정 자체는 initialize.response에 그대로 남는다).
    if (initDuplicate) reasons.push("INIT_RESPONSE_DUPLICATE");
    if (abortMethodSeen) reasons.push("STDOUT_ABORT_METHOD_NOT_CAUGHT_LIVE");
    if (!facts.spawn.ok) reasons.push("SPAWN_FAILED");
    if (initResponse !== "VALID") reasons.push(...initReasons);
    const sentLabels = facts.sends.filter((s) => s.ok).map((s) => s.label);
    if (
      initResponse === "VALID" &&
      !(sentLabels.includes("shutdown") && sentLabels.includes("exit"))
    ) {
      reasons.push("SHUTDOWN_EXIT_NOT_SENT");
    }
    // 먼저 일어난 이유(trigger)와 뒤따른 이유(also)를 모두 본다. 관측 성립을 막는 사유는 일어난 순서와 상관없다
    // (순서 자체는 termination.trigger·also에 그대로 남는다).
    const raised = new Set<LspMinTrigger>(facts.also);
    if (facts.trigger !== null) raised.add(facts.trigger);
    if (frameError !== null) reasons.push(`FRAME_ERROR:${frameError.kind}`);
    else if (raised.has("FRAME_ERROR")) reasons.push("FRAME_ERROR");
    if (facts.stdout.overflow || facts.stderr.overflow || raised.has("OUTPUT_LIMIT")) {
      reasons.push("OUTPUT_LIMIT");
    }
    if (facts.stdout.readFailed || facts.stderr.readFailed) reasons.push("STREAM_READ_FAILED");
    for (const token of OBSERVATION_BLOCKING_TRIGGERS) if (raised.has(token)) reasons.push(token);
    // 강제 종료가 필요했다면 서버가 스스로(또는 stdin EOF로) 끝나는 것을 관측하지 못한 것이다. 응답·송신 같은 실제 관측 사실은
    // 그대로 남기고 status만 막는다. stdin EOF로 끝난 경로는 SELF_EXIT와 구분되는 STDIN_CLOSED로 기록되고 여기서 막지 않는다.
    if (facts.kill.count > 0) reasons.push("FORCE_KILL_REQUIRED");
    if (missedLive) reasons.push("STDERR_PATTERN_NOT_CAUGHT_LIVE");
    // 실시간 표본이 놓쳤지만 사후 값에서 드러난 위반. 중단하지 못했을 뿐 일어난 일이므로 관측 성립으로 치지 않는다.
    const { baselineHits, finalHits } = facts.live.receiver;
    if (facts.spawn.ok && finalHits === null) reasons.push("RECEIVER_FINAL_UNOBSERVABLE");
    if (baselineHits !== null && finalHits !== null && finalHits > baselineHits) {
      reasons.push("RECEIVER_HITS_INCREASED");
    }
    for (const root of facts.roots) {
      if (root.added.some((path) => rootViolation(root.role, path))) {
        reasons.push(`WATCHED_ROOT_VIOLATION:${root.role}`);
      }
    }
    if (facts.live.processes.disallowed.length > 0) reasons.push("DISALLOWED_IMAGE_SEEN");
    status = reasons.length === 0 ? "OBSERVED" : "NOT_OBSERVED";
  }

  // ── 비교 값 ──
  let pinComparison: LspMinObservation["initialize"]["pin_version_comparison"] = "NOT_GIVEN";
  if (facts.expectedVersion !== null) {
    pinComparison =
      serverInfo === null || serverInfo.version === null
        ? "NOT_OBSERVED"
        : serverInfo.version === facts.expectedVersion
          ? "MATCH"
          : "MISMATCH";
  }

  const cleanupProblems = [...facts.cleanup.problems];
  const cleanupOk = facts.spawn.ok
    ? facts.cleanup.childExitConfirmed &&
      facts.cleanup.streamsClosed === true &&
      facts.cleanup.descendantsAliveAfter === 0 &&
      facts.cleanup.dispose === "OK" &&
      facts.cleanup.timersCancelled &&
      cleanupProblems.length === 0
    : cleanupProblems.length === 0;

  const unobserved = [...UNOBSERVED_ALWAYS];
  if (facts.provenance === "stub") unobserved.unshift("PROVENANCE_STUB_NOT_REAL_SEMGREP");

  return {
    schema: LSP_MIN_SCHEMA,
    run_id: facts.runId,
    provenance: facts.provenance,
    status,
    status_reasons: [...new Set(reasons)],
    request: {
      process_role: "lsp-min",
      command_base: LSP_MIN_EXE_NAME,
      args: [...LSP_MIN_ARGS],
      limits: {
        total_ms: facts.limits.totalMs,
        init_ms: facts.limits.initMs,
        exit_ms: facts.limits.exitMs,
        stdin_close_grace_ms: facts.limits.stdinCloseGraceMs,
        kill_confirm_ms: facts.limits.killConfirmMs,
        max_stdout_bytes: facts.limits.maxStdoutBytes,
        max_stderr_bytes: facts.limits.maxStderrBytes,
        sample_interval_ms: facts.limits.sampleIntervalMs,
      },
      messages_allowed: [...LSP_MIN_SEND_ORDER],
      initialized_sent: false,
      refusals: [...facts.refusals],
    },
    sent: facts.sends.map((s) => ({ label: s.label, t_ms: s.tMs, ok: s.ok })),
    initialize: {
      response: initResponse,
      reasons: initReasons,
      latency_ms: latencyMs,
      server_info: serverInfo,
      pin_version_comparison: pinComparison,
      capabilities_sha256: capabilitiesSha,
      result_keys: capped(resultKeys),
    },
    server_messages: {
      frames: stdoutAnalysis.frames,
      responses_matched: matchedResponses,
      responses_unmatched: unmatchedResponses,
      server_requests: { count: serverRequestCount, methods: serverRequestMethods },
      notifications: { count: notificationCount, methods: notificationMethods },
      anomalies: [...new Set(anomalies)],
    },
    streams: {
      stdout: {
        bytes: facts.stdout.total,
        sha256: sha256Hex(facts.stdout.bytes),
        overflow: facts.stdout.overflow,
        eof: facts.stdout.eof,
        read_failed: facts.stdout.readFailed,
        read_error: readErrorOf(facts.stdout),
      },
      stderr: {
        bytes: facts.stderr.total,
        sha256: stderrAnalysis.sha256,
        lines: stderrAnalysis.lines,
        lines_with_header: stderrAnalysis.linesWithHeader,
        lines_without_header: stderrAnalysis.linesWithoutHeader,
        partial_tail: stderrAnalysis.partialTail,
        overflow: facts.stderr.overflow,
        eof: facts.stderr.eof,
        read_failed: facts.stderr.readFailed,
        read_error: readErrorOf(facts.stderr),
      },
    },
    termination: {
      trigger: facts.trigger,
      also: [...facts.also],
      abort:
        facts.abort === null
          ? null
          : {
              condition: facts.abort.condition,
              detail: tokenOf(facts.abort.detail),
              t_ms: facts.abort.tMs,
            },
      path: terminationPath(facts),
      exit: facts.exit.observed ? { code: facts.exit.code, signal: facts.exit.signal } : null,
      exit_observed: facts.exit.observed,
      stdin_closed_by_harness: facts.stdinClosed.byHarness,
      kill_count: facts.kill.count,
    },
    timeline: {
      total_budget_ms: facts.limits.totalMs,
      observation_ms: facts.timeline.observationMs,
      cleanup_ms: facts.timeline.cleanupMs,
    },
    coverage: {
      live: {
        mode: "SAMPLING",
        interval_ms: facts.limits.sampleIntervalMs,
        stderr_patterns: { checked_bytes: facts.live.stderrCheckedBytes, hit: stderrAnalysis.hit },
        stdout_notifications: { frames_checked: facts.live.stdoutFramesChecked },
        receiver: {
          baseline_hits: facts.live.receiver.baselineHits,
          final_hits: facts.live.receiver.finalHits,
          samples: facts.live.receiver.samples,
          failures: facts.live.receiver.failures,
        },
        processes: {
          samples: facts.live.processes.samples,
          failures: facts.live.processes.failures,
          max_descendants: facts.live.processes.maxDescendants,
          images_seen: capped(facts.live.processes.imagesSeen.map(tokenOf)),
          disallowed: capped(facts.live.processes.disallowed.map(tokenOf)),
        },
        files: { samples: facts.live.files.samples, failures: facts.live.files.failures },
      },
      post_hoc: {
        watched_roots: facts.roots.map((root) => ({
          role: root.role,
          files_before: root.filesBefore,
          files_after: root.filesAfter,
          added: capped(root.added),
          removed: capped(root.removed),
        })),
        stderr_pattern_missed_live: missedLive,
        artifact_hashes: facts.artifacts.map((item) => ({
          label: tokenOf(item.label),
          before: item.before,
          after: item.after,
          comparison: compareArtifact(item),
        })),
        network_events: "COLLECTED_OUTSIDE_THIS_MODULE",
      },
      unobserved,
    },
    cleanup: {
      ok: cleanupOk,
      problems: cleanupProblems,
      child_exit_confirmed: facts.cleanup.childExitConfirmed,
      streams_closed: facts.cleanup.streamsClosed,
      descendants_alive_after: facts.cleanup.descendantsAliveAfter,
      descendant_tracking: facts.cleanup.descendantTracking,
      dispose: facts.cleanup.dispose,
      timers_cancelled: facts.cleanup.timersCancelled,
    },
    not_established: {
      complete: "NOT_ESTABLISHED",
      security_pass: "NOT_ESTABLISHED",
      control_reference: "NOT_ESTABLISHED",
      normal_startup: "NOT_ESTABLISHED",
      rules_loading: "NOT_ESTABLISHED",
      scanning: "NOT_ESTABLISHED",
      pin_verification: "NOT_ESTABLISHED",
    },
  };
}
