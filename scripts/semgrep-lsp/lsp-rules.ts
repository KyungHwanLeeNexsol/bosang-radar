// LSP-RULES-1 계약(순수 모듈): `initialized` 이후, 내려받기 없는 로컬 규칙 로딩 관측. 파일·프로세스·시계·네트워크를 만지지 않는다.
//
// LSP-MIN-1(lsp-min.ts)은 `initialize → shutdown → exit`만 보내고 끝난다. 이 관측은 거기에 **`initialized`를 정확히 한 번** 더한다:
//   initialize → (응답 VALID + 서버 버전이 핀과 MATCH일 때만) initialized → 장벽 대기 → 장벽 뒤 짧은 감시 → shutdown → exit
// 서버는 `initialized`에 반응해 규칙 새로고침과 열린 문서 스캔 절차(대상 0개)를 스스로 시작한다. 이것을 막는 수단은 없고, 소스상 엔진을 돌리기
// 전에 되돌아온다는 근거만 있다. 그래서 이 관측은 "규칙 로딩만 한다"는 주장이 아니라 **그렇게 끝나는지를 관측하는 실행**이다.
//
// 이 파일이 맡는 것: 고정 계약(상수, 상한, 배치, 허용 이미지), 요청 검사, 보내는 메시지와 쓰기 직전 방어선, 서버 stdout의 분류와 허용 목록
// (진행 요청 최대 2건), 실시간 감시기(stderr 신호·stdout 메시지). 판정과 기록은 lsp-rules-record.ts, 실행은 lsp-rules-run.ts가 맡는다.
//
// 기존 모듈과의 관계: lsp-min.ts의 순수 함수·상수(환경, 응답 검증, 프로세스 목록 해석)를 **읽기 전용으로 재사용**한다. lsp-min.ts·lsp-min-run.ts·
// evaluate.ts·session.ts는 바꾸지 않았고, 이 파일은 그쪽의 성공 조건을 약화하지 않는다(그쪽은 이 파일을 가져오지 않는다).
//
// 한계(미확인): 아래 계약 전체가 공개 소스의 읽기에서 도출한 것이며 `initialized` 이후의 실제 바이너리 동작은 한 번도 관측하지 않았다.

import { FrameDecoder, type FrameDecodeError } from "./framing";
import { makeNotification, makeRequest } from "./jsonrpc";
import {
  ABORT_NETWORK_PATTERNS,
  ALLOWED_IMAGES,
  HOME_EXPECTED_PREFIX,
  INIT_ERROR_LOG_PATTERN,
  LSP_MIN_ARGS,
  LSP_MIN_ENV_NAMES,
  LSP_MIN_EXE_NAME,
  LSP_MIN_LIMITS,
  WATCHED_ROLES,
  buildLspMinEnv,
  classifyServerMessage,
  joinLayoutPath,
  type LspMinLimits,
  type WatchedRole,
} from "./lsp-min";
import {
  FORBIDDEN_NETWORK_KEYS,
  FORBIDDEN_SCAN_KEYS,
  PRE_INITIALIZED_KEYS,
  RulesLogScanner,
  type RulesSignal,
} from "./rules-log";
import { isValidRunId } from "./run-id";
import {
  buildInitializationOptions,
  isNetworkRuleSource,
  validateInitializationOptions,
} from "./settings";
import type { JsonRpcMessage } from "./types";
import { expectedUri } from "./uri";

// ── 고정 계약 ─────────────────────────────────────────────────────

export const LSP_RULES_SCHEMA = "semgrep-lsp-rules-observation/1" as const;
/** 인자는 LSP-MIN-1과 같다: 정확히 `["lsp","--debug"]`. 환경 이름 11개도 같고 `SEMGREP_LOG_SRCS`는 더하지 않는다(소유자 결정 D5). */
export const LSP_RULES_ARGS: readonly string[] = LSP_MIN_ARGS;
export const LSP_RULES_INIT_ID = "lsp-rules-init-1";
export const LSP_RULES_SHUTDOWN_ID = "lsp-rules-shutdown-1";

/** 프로브 규칙(소유자 결정 D4): 이 저장소가 직접 쓴 파일 하나. 바이트가 계약이다. */
export const LSP_RULES_PROBE_FILE = "lsp-rules-1-probe.yaml";
export const LSP_RULES_PROBE_SHA256 =
  "d5089fdeb3c83555826d0c8065b551cdcea66d5f26145821ed9e5f5a0c928145";
export const LSP_RULES_PROBE_BYTES = 233;

export type RulesSendLabel = "initialize" | "initialized" | "shutdown" | "exit";
/** 보낼 수 있는 메시지는 이 넷뿐이고, 이 순서로만 보낸다. `initialized`는 정확히 한 번이다. */
export const LSP_RULES_SEND_ORDER: readonly RulesSendLabel[] = Object.freeze([
  "initialize",
  "initialized",
  "shutdown",
  "exit",
]);
const OUTBOUND_METHODS: Readonly<Record<RulesSendLabel, string>> = Object.freeze({
  initialize: "initialize",
  initialized: "initialized",
  shutdown: "shutdown",
  exit: "exit",
});

export interface RulesLimits extends LspMinLimits {
  /** `initialized` 뒤 장벽(stdout `rulesRefreshed` + 맨줄 `Scanned open documents`)을 기다리는 한도(소유자 결정 D6: 60초). */
  rulesMs: number;
  /** 장벽 뒤에도 금지 신호가 늦게 오는지 보는 짧은 감시(소유자 결정 D6: 2초). 부재의 증명이 아니다. */
  settleMs: number;
}

/**
 * 전체 상한은 LSP-MIN-1과 같은 150초다. 단계 한도(init 60 + 장벽 60 + 감시 2 + exit 30)의 합이 이를 넘을 수 있지만 **단계 한도를 늘리거나
 * 전체 상한에 유예를 붙이지 않는다**: 각 단계는 남은 전체 시간 안에서만 기다린다(소유자 결정 D6).
 */
export const LSP_RULES_LIMITS: Readonly<RulesLimits> = Object.freeze({
  ...LSP_MIN_LIMITS,
  rulesMs: 60_000,
  settleMs: 2_000,
});

/** 요청이 한도를 바꾸려면 기본값 **이하**로만 바꿀 수 있다. 올릴 수는 없다. */
export function resolveRulesLimits(over: Partial<RulesLimits> | undefined): {
  limits: RulesLimits;
  problems: string[];
} {
  const limits: RulesLimits = { ...LSP_RULES_LIMITS };
  const problems: string[] = [];
  for (const [key, value] of Object.entries(over ?? {})) {
    const k = key as keyof RulesLimits;
    if (!(k in LSP_RULES_LIMITS)) {
      problems.push(`LIMIT_UNKNOWN:${key}`);
    } else if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      problems.push(`LIMIT_INVALID:${k}`);
    } else if (value > LSP_RULES_LIMITS[k]) {
      problems.push(`LIMIT_ABOVE_CAP:${k}`);
    } else {
      limits[k] = value;
    }
  }
  return { limits, problems };
}

/** 서버가 `initialized` 뒤 클라이언트에 보내는 진행 요청은 이것 하나뿐이고 최대 2건이다(새로고침 때, 열린 문서 스캔 때). 응답하지 않는다. */
export const PROGRESS_CREATE_METHOD = "window/workDoneProgress/create";
export const MAX_PROGRESS_CREATE = 2;
/** stdout으로 와도 되는 알림. `semgrep/rulesRefreshed`는 정확히 1회가 기대값이다. */
export const RULES_REFRESHED_METHOD = "semgrep/rulesRefreshed";
export const PROGRESS_METHOD = "$/progress";
export const PUBLISH_DIAGNOSTICS_METHOD = "textDocument/publishDiagnostics";

export type RulesAbortCondition = "A1" | "A2" | "A3" | "A4" | "A5" | "A6" | "A7" | "A9";
export type RulesTrigger =
  | "NORMAL"
  | "INIT_INVALID"
  | "INIT_TIMEOUT"
  | "RULES_TIMEOUT"
  | "LIVE_ABORT"
  | "TOTAL_TIMEOUT"
  | "OUTPUT_LIMIT"
  | "FRAME_ERROR"
  | "STDIN_ERROR"
  | "STREAM_READ_FAILED"
  | "CHILD_EXITED_EARLY"
  | "EXIT_TIMEOUT"
  | "SPAWN_FAILED";

/** 이 관측이 세워 주지 않는 것(미관측). 기록의 coverage.unobserved에 항상 싣는다. */
export const RULES_UNOBSERVED_ALWAYS: readonly string[] = Object.freeze([
  "LOADED_RULE_COUNT",
  "PROBE_RULE_SEMANTICS_AND_DETECTION",
  "FILESYSTEM_OUTSIDE_WATCHED_ROOTS",
  "STATE_DIR_CONTENTS_OTHER_THAN_HOME",
  "PROCESSES_BETWEEN_SAMPLES",
  "ENGINE_RUN_WITHOUT_LOG_LINE",
  "NETWORK_OTHER_THAN_LOOPBACK_RECEIVER",
  "BINARY_SOURCE_CORRESPONDENCE",
  "INFO_AND_WARNING_HEADER_SHAPE_OF_REAL_BINARY",
  "REAL_WINDOWS_BEHAVIOR_OF_REAL_SEMGREP",
]);

// ── 경로 배치 ─────────────────────────────────────────────────────

export interface RulesLayout {
  work: string;
  /** 서버가 작업 영역으로 삼는 빈 폴더. 끝까지 비어 있어야 한다. */
  workspace: string;
  /** 자식의 작업 폴더이자 상태 폴더. */
  stateDir: string;
  /** `configuration`으로 주는 명시적 로컬 규칙 폴더. 프로브 규칙 한 개만 있어야 한다. */
  rulesDir: string;
  /** 자식의 전용 홈(`USERPROFILE`). */
  homeDir: string;
  tmpDir: string;
}

export function rulesLayout(work: string): RulesLayout {
  const stateDir = joinLayoutPath(work, "lsp-state");
  return {
    work,
    workspace: joinLayoutPath(work, "ws"),
    stateDir,
    rulesDir: joinLayoutPath(stateDir, "rules-probe"),
    homeDir: joinLayoutPath(stateDir, "home"),
    tmpDir: joinLayoutPath(stateDir, "tmp"),
  };
}

export function rulesRootPath(layout: RulesLayout, role: WatchedRole): string {
  return role === "WORKSPACE"
    ? layout.workspace
    : role === "RULES_DIR"
      ? layout.rulesDir
      : layout.homeDir;
}

/** 프로브 파일의 전체 경로(규칙 폴더 + 파일 이름). 로딩 줄의 경로와 비교하는 기준이다. */
export function probePathOf(layout: RulesLayout): string {
  return joinLayoutPath(layout.rulesDir, LSP_RULES_PROBE_FILE);
}

/**
 * 감시 폴더 안의 한 파일이 금지된 변경인가(A5′). 작업 영역은 비어 있어야 하고, 규칙 폴더에는 프로브 한 개(이름 일치, 대소문자 무시: Windows)만
 * 있어야 하며, 홈은 `shutdown`이 쓰는 지문 폴더 아래만 허용한다.
 */
export function rulesRootViolation(role: WatchedRole, relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  if (role === "HOME_DIR") return !normalized.startsWith(HOME_EXPECTED_PREFIX);
  if (role === "RULES_DIR") return normalized.toLowerCase() !== LSP_RULES_PROBE_FILE;
  return true; // WORKSPACE는 비어 있어야 한다
}

// ── 경로 검사 ─────────────────────────────────────────────────────

/** 이 경계(Windows LSP-RULES-1)에서만 요구하는 형태: 드라이브 문자로 시작하는 절대 경로. UNC·`/`로 시작하는 경로·상대 경로는 거절한다. */
const DRIVE_ABSOLUTE = /^[A-Za-z]:[\\/]/;
export function isDriveAbsolute(path: string): boolean {
  return DRIVE_ABSOLUTE.test(path);
}

/**
 * 경로에 들어 있으면 서버 로그를 오염시킬 수 있는 문구(소문자 비교). `--debug`가 경로를 로그에 찍으므로, 이런 경로는 시작 전에 거절해서 단 한 번의
 * 실행을 헛되이 쓰지 않는다. 기존 LSP-MIN-1의 검사(L11)를 이 단계의 금지 문구로 넓힌 것이다.
 */
export const PATH_FORBIDDEN_FRAGMENTS: readonly string[] = Object.freeze([
  "download",
  "registry",
  "using auto",
  "api token",
  "settings file",
  "refreshing rules",
  "rules refreshed",
  "scanning",
  "scanned",
  "running semgrep",
  "semgrep errors",
  "no targets",
  "no rules",
  "rules not loaded",
  INIT_ERROR_LOG_PATTERN,
]);

export function forbiddenFragmentIn(path: string): string | null {
  const lower = path.toLowerCase();
  for (const fragment of PATH_FORBIDDEN_FRAGMENTS) if (lower.includes(fragment)) return fragment;
  return null;
}

function baseNameOf(path: string): string {
  const parts = path.split(/[\\/]+/);
  return parts[parts.length - 1] ?? "";
}

// ── 보내는 메시지 ─────────────────────────────────────────────────

// 키 이름과 값은 LSP-MIN-1·기존 하네스(settings.ts)와 같다. 서버가 읽는 규칙 출처는 `configuration` 한 항목(규칙 폴더 절대 경로)뿐이다.
const RULES_SETTINGS = { maxTargetBytes: 1_000_000, timeout: 30, timeoutThreshold: 3 } as const;

function folderUri(path: string): string {
  return expectedUri(path, "_").slice(0, -2);
}

export function buildRulesInitializeParams(layout: RulesLayout): Record<string, unknown> {
  const initializationOptions = buildInitializationOptions({
    configuration: [layout.rulesDir],
    ...RULES_SETTINGS,
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

export function buildRulesInitializeMessage(layout: RulesLayout): JsonRpcMessage {
  return makeRequest(LSP_RULES_INIT_ID, "initialize", buildRulesInitializeParams(layout));
}
export function buildRulesInitializedMessage(): JsonRpcMessage {
  return makeNotification("initialized", {});
}
export function buildRulesShutdownMessage(): JsonRpcMessage {
  return makeRequest(LSP_RULES_SHUTDOWN_ID, "shutdown");
}
export function buildRulesExitMessage(): JsonRpcMessage {
  return makeNotification("exit");
}

function isEmptyObject(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value as object).length === 0
  );
}

/**
 * 쓰기 직전의 마지막 방어선: 이 넷 말고는 stdin에 쓰지 않는다. 어긋나면 던진다(프로그래머 오류).
 * `initialized`는 params가 정확히 `{}`여야 하고, 문서 알림·작업 영역 변경·`semgrep/scanWorkspace`·`semgrep/refreshRules`·`debug/echo`는 메서드 이름
 * 불일치로 막힌다. 서버 요청에 대한 응답(id만 있고 method가 없는 메시지)도 막힌다.
 */
export function assertAllowedRulesOutbound(label: RulesSendLabel, message: JsonRpcMessage): void {
  const allowedMethod = OUTBOUND_METHODS[label];
  if (allowedMethod === undefined || message.method !== allowedMethod) {
    throw new Error(`허용되지 않은 송신: ${label}`);
  }
  const wantsId = label === "initialize" || label === "shutdown";
  if (wantsId !== (message.id !== undefined)) throw new Error(`허용되지 않은 송신 형태: ${label}`);
  if (label === "initialized" && !isEmptyObject(message.params)) {
    throw new Error("허용되지 않은 송신 형태: initialized의 params");
  }
  if ((label === "shutdown" || label === "exit") && message.params !== undefined) {
    throw new Error(`허용되지 않은 송신 형태: ${label}의 params`);
  }
}

// ── 요청 검사 ─────────────────────────────────────────────────────

export interface RulesRequestShape {
  runId: string;
  command: string;
  args: readonly string[];
  layout: RulesLayout;
  env: Readonly<Record<string, string>>;
  limits?: Partial<RulesLimits>;
  artifacts?: readonly { label: string; path: string }[];
  /** 규칙 폴더에 둘 프로브 파일의 바이트. 해시가 고정값과 같아야 한다. */
  probeBytes?: Uint8Array;
}

function sameEnv(
  actual: Readonly<Record<string, string>>,
  expected: Readonly<Record<string, string>>
): string[] {
  const problems: string[] = [];
  for (const name of Object.keys(actual)) {
    if (!(LSP_MIN_ENV_NAMES as readonly string[]).includes(name)) {
      problems.push(`ENV_NAME_NOT_ALLOWED:${name.replace(/[^A-Za-z0-9_]/g, "?")}`);
    }
  }
  for (const name of LSP_MIN_ENV_NAMES) {
    if (!(name in actual)) problems.push(`ENV_NAME_MISSING:${name}`);
    else if (actual[name] !== expected[name]) problems.push(`ENV_VALUE_UNEXPECTED:${name}`);
  }
  return problems;
}

const LOOPBACK_URL = /^http:\/\/127\.0\.0\.1:\d{1,5}$/;

/**
 * 요청 검사. 거절 사유 토큰의 목록을 돌려준다(빈 배열이면 통과). 값(경로·환경 변수 값)은 사유에 싣지 않는다.
 * 하나라도 있으면 실행기는 아무 폴더도 만들지 않고 아무 프로세스도 띄우지 않는다.
 * `sha256Of`는 해시 계산을 호출자가 주입한다(이 모듈은 순수하게 둔다).
 */
export function checkRulesRequest(
  request: RulesRequestShape,
  sha256Of: (bytes: Uint8Array) => string
): string[] {
  const refusals: string[] = [];
  if (!isValidRunId(request.runId)) refusals.push("RUN_ID_INVALID");
  if (typeof request.command !== "string" || !isDriveAbsolute(request.command)) {
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
  if (typeof request.command === "string" && forbiddenFragmentIn(request.command) !== null) {
    refusals.push("PATH_CONTAINS_FORBIDDEN_FRAGMENT:COMMAND");
  }

  const layout = request.layout;
  if (!isDriveAbsolute(layout.work)) refusals.push("WORK_DIR_NOT_DRIVE_ABSOLUTE");
  else {
    const want = rulesLayout(layout.work);
    for (const key of ["workspace", "stateDir", "rulesDir", "homeDir", "tmpDir"] as const) {
      if (layout[key] !== want[key]) refusals.push("LAYOUT_MISMATCH");
    }
  }
  if (!isDriveAbsolute(layout.rulesDir)) refusals.push("RULES_DIR_NOT_DRIVE_ABSOLUTE");
  // 규칙 폴더 하나만 명시하고, 그것이 레지스트리·앱·내려받기로 풀리는 특수 값이 아니어야 한다(빈 설정도 서버가 auto로 되돌린다).
  if (isNetworkRuleSource(layout.rulesDir)) refusals.push("RULES_DIR_IS_NETWORK_SOURCE");
  for (const role of WATCHED_ROLES) {
    if (forbiddenFragmentIn(rulesRootPath(layout, role)) !== null) {
      refusals.push(`PATH_CONTAINS_FORBIDDEN_FRAGMENT:${role}`);
    }
  }

  const { problems } = resolveRulesLimits(request.limits);
  refusals.push(...problems);

  // 환경: 이름 집합과 값이 전부 buildLspMinEnv가 만든 것과 같아야 한다. SEMGREP_LOG_SRCS·SEMGREP_APP_TOKEN 같은 이름은 허용 목록에 없어 거절된다(D5).
  const url = request.env.SEMGREP_APP_URL;
  const systemRoot = request.env.SYSTEMROOT;
  if (typeof url !== "string" || !LOOPBACK_URL.test(url)) refusals.push("ENV_URL_NOT_LOOPBACK");
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
    if (typeof item.label !== "string" || item.label === "") {
      refusals.push("ARTIFACT_LABEL_INVALID");
    }
    if (typeof item.path !== "string" || !isDriveAbsolute(item.path)) {
      refusals.push("ARTIFACT_PATH_NOT_DRIVE_ABSOLUTE");
    } else if (forbiddenFragmentIn(item.path) !== null) {
      refusals.push("PATH_CONTAINS_FORBIDDEN_FRAGMENT:ARTIFACT");
    }
  }

  // 프로브: 바이트 수와 해시가 고정값과 같아야 한다. 복사 전에 거절한다.
  if (!(request.probeBytes instanceof Uint8Array)) refusals.push("PROBE_BYTES_MISSING");
  else if (request.probeBytes.byteLength !== LSP_RULES_PROBE_BYTES) {
    refusals.push("PROBE_SIZE_MISMATCH");
  } else if (sha256Of(request.probeBytes) !== LSP_RULES_PROBE_SHA256) {
    refusals.push("PROBE_HASH_MISMATCH");
  }
  return [...new Set(refusals)];
}

// ── stdout 분석 ───────────────────────────────────────────────────

function isPlain(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 서버 요청이 허용된 진행 요청의 올바른 JSON-RPC 모양인가:
 * `{ jsonrpc:"2.0", id: 문자열|숫자, method:"window/workDoneProgress/create", params:{ token: 문자열|숫자 } }`. 그 밖의 키(result·error 포함)나
 * params의 다른 키가 있으면 아니다.
 */
export function isValidProgressCreate(message: JsonRpcMessage): boolean {
  const m = message as unknown as Record<string, unknown>;
  if (m.jsonrpc !== "2.0" || m.method !== PROGRESS_CREATE_METHOD) return false;
  if (typeof m.id !== "string" && typeof m.id !== "number") return false;
  for (const key of Object.keys(m)) {
    if (!["jsonrpc", "id", "method", "params"].includes(key)) return false;
  }
  const params = m.params;
  if (!isPlain(params)) return false;
  const keys = Object.keys(params);
  if (keys.length !== 1 || keys[0] !== "token") return false;
  return typeof params.token === "string" || typeof params.token === "number";
}

export interface RulesServerRequest {
  method: string;
  /** 올바른 모양의 허용된 진행 요청인가. */
  allowed: boolean;
}

export interface RulesStdoutAnalysis {
  frames: number;
  frameError: FrameDecodeError | null;
  initMessage: JsonRpcMessage | null;
  initDuplicate: boolean;
  shutdownResponseSeen: boolean;
  unmatchedResponses: number;
  rulesRefreshedCount: number;
  progressNotifications: number;
  diagnosticsCount: number;
  /** 허용 밖 알림의 메서드별 개수(`publishDiagnostics` 제외). 프로토타입 없는 객체다. */
  otherNotifications: Record<string, number>;
  /** 서버가 오류(type 1)로 알린 `window/showMessage`·`window/logMessage`의 개수. */
  errorNotifications: number;
  serverRequests: RulesServerRequest[];
  serverRequestCount: number;
  messagesWithoutMethodOrId: number;
}

function tokenOf(text: string): string {
  return text.replace(/[^A-Za-z0-9_.:/$ -]/g, "?").slice(0, 80);
}

const MAX_LISTED = 50;

/** 메시지 하나를 분석 결과에 더한다. 실시간 경로와 사후 해석이 같은 함수를 쓴다. */
export function absorbStdoutMessage(a: RulesStdoutAnalysis, message: JsonRpcMessage): void {
  a.frames += 1;
  const kind = classifyServerMessage(message);
  if (kind === "response") {
    if (message.id === LSP_RULES_INIT_ID) {
      if (a.initMessage === null) a.initMessage = message;
      else a.initDuplicate = true;
    } else if (message.id === LSP_RULES_SHUTDOWN_ID) {
      a.shutdownResponseSeen = true;
    } else {
      a.unmatchedResponses += 1;
    }
  } else if (kind === "server-request") {
    a.serverRequestCount += 1;
    if (a.serverRequests.length < 20) {
      a.serverRequests.push({
        method: tokenOf(String(message.method)),
        allowed: isValidProgressCreate(message),
      });
    }
  } else if (kind === "notification") {
    const method = String(message.method);
    if (method === RULES_REFRESHED_METHOD) a.rulesRefreshedCount += 1;
    else if (method === PROGRESS_METHOD) a.progressNotifications += 1;
    else if (method === PUBLISH_DIAGNOSTICS_METHOD) a.diagnosticsCount += 1;
    else {
      const token = tokenOf(method);
      if (Object.keys(a.otherNotifications).length < MAX_LISTED || token in a.otherNotifications) {
        a.otherNotifications[token] = (a.otherNotifications[token] ?? 0) + 1;
      }
      const params = (message as unknown as Record<string, unknown>).params;
      if (
        (method === "window/showMessage" || method === "window/logMessage") &&
        isPlain(params) &&
        params.type === 1
      ) {
        a.errorNotifications += 1;
      }
    }
  } else {
    a.messagesWithoutMethodOrId += 1;
  }
}

export function emptyStdoutAnalysis(): RulesStdoutAnalysis {
  return {
    frames: 0,
    frameError: null,
    initMessage: null,
    initDuplicate: false,
    shutdownResponseSeen: false,
    unmatchedResponses: 0,
    rulesRefreshedCount: 0,
    progressNotifications: 0,
    diagnosticsCount: 0,
    // 프로토타입이 없는 객체: 메서드 이름이 `__proto__`·`constructor` 여도 평범한 키로 센다(보통 객체에서는 `__proto__`가 사라진다).
    otherNotifications: Object.create(null) as Record<string, number>,
    errorNotifications: 0,
    serverRequests: [],
    serverRequestCount: 0,
    messagesWithoutMethodOrId: 0,
  };
}

/** stdout 전체 바이트를 프레임으로 풀어 분석한다(실시간 경로와 같은 디코더·같은 흡수 함수). 끝에 덜 온 프레임은 TRUNCATED로 센다. */
export function analyzeRulesStdout(bytes: Uint8Array, expectEof: boolean): RulesStdoutAnalysis {
  const decoder = new FrameDecoder({ maxMessageBytes: Math.max(bytes.byteLength, 1) });
  const pushed = decoder.push(bytes);
  const a = emptyStdoutAnalysis();
  for (const message of pushed.messages) absorbStdoutMessage(a, message);
  a.frameError = pushed.error;
  if (a.frameError === null && expectEof) a.frameError = decoder.end().error;
  return a;
}

// ── 실시간 감시기 ─────────────────────────────────────────────────

export interface RulesAbort {
  condition: RulesAbortCondition;
  detail: string;
}

/** 청크 경계에 걸친 문구를 찾으려고 남기는 꼬리 길이: 감시하는 모든 부분 문자열(내려받기·레지스트리·초기화 오류 로그) 중 가장 긴 것보다 하나 짧다. */
const TAIL_KEEP =
  Math.max(...ABORT_NETWORK_PATTERNS.map((p) => p.length), INIT_ERROR_LOG_PATTERN.length) - 1;

/**
 * stderr 실시간 감시. 청크를 먹이면 줄 단위 신호(rules-log.ts)로 풀어 중단 사유를 찾는다:
 *  · A1′ `initialized` 송신 **전**의 새로고침·열린 문서 스캔 신호, 그리고 언제든 엔진·작업 영역·단일 파일 스캔 신호
 *  · A2′ 레지스트리·내려받기·토큰·설정 파일 신호, 그리고 기존 LSP-MIN-1과 같은 부분 문자열 감시(`download`·`registry`, 어디에 있든)
 * 덤프 블록 안의 문자열은 신호로 보지 않는다(rules-log.ts). 모양과 상관없이 금지 키는 중단이다(fail-closed).
 */
export class RulesStderrWatcher {
  readonly scanner = new RulesLogScanner();
  private readonly decoder = new TextDecoder("utf-8", { fatal: false, ignoreBOM: true });
  private tail = "";
  private _hit: RulesAbort | null = null;
  private _initErrorLogged = false;
  private _checkedBytes = 0;
  initializedSent = false;
  /** 장벽의 stderr 쪽 절반: 모양이 맞는 맨줄 `Scanned open documents`가 `initialized` 뒤에 나왔는가. */
  scannedOpenDocumentsSeen = false;

  get hit(): RulesAbort | null {
    return this._hit;
  }
  get initErrorLogged(): boolean {
    return this._initErrorLogged;
  }
  get checkedBytes(): number {
    return this._checkedBytes;
  }

  /** 새 청크를 먹이고, 이번에 처음 찾은 중단 사유가 있으면 돌려준다(이미 찾았다면 null). */
  push(chunk: Uint8Array): RulesAbort | null {
    this._checkedBytes += chunk.byteLength;
    const text = this.decoder.decode(chunk, { stream: true });
    const window = (this.tail + text).toLowerCase();
    if (window.includes(INIT_ERROR_LOG_PATTERN)) this._initErrorLogged = true;
    const keep = TAIL_KEEP;
    this.tail = window.slice(Math.max(0, window.length - keep));
    let found: RulesAbort | null = null;
    for (const signal of this.scanner.push(chunk)) {
      if (signal.key === "scannedOpenDocuments" && signal.shape === "OK" && this.initializedSent) {
        this.scannedOpenDocumentsSeen = true;
      }
      found ??= this.abortFor(signal);
    }
    if (found === null) {
      for (const pattern of ABORT_NETWORK_PATTERNS) {
        if (window.includes(pattern)) {
          found = { condition: "A2", detail: pattern };
          break;
        }
      }
    }
    if (found !== null && this._hit === null) {
      this._hit = found;
      return found;
    }
    return null;
  }

  private abortFor(signal: RulesSignal): RulesAbort | null {
    if (!this.initializedSent && PRE_INITIALIZED_KEYS.includes(signal.key)) {
      return { condition: "A1", detail: `PRE_INITIALIZED:${signal.key}` };
    }
    if (FORBIDDEN_SCAN_KEYS.includes(signal.key)) return { condition: "A1", detail: signal.key };
    if (FORBIDDEN_NETWORK_KEYS.includes(signal.key)) return { condition: "A2", detail: signal.key };
    return null;
  }

  /** 스트림이 끝났다: 개행 없는 마지막 줄도 본다. */
  end(): RulesAbort | null {
    let found: RulesAbort | null = null;
    for (const signal of this.scanner.end()) {
      if (signal.key === "scannedOpenDocuments" && signal.shape === "OK" && this.initializedSent) {
        this.scannedOpenDocumentsSeen = true;
      }
      found ??= this.abortFor(signal);
    }
    if (found !== null && this._hit === null) {
      this._hit = found;
      return found;
    }
    return null;
  }
}

/** stdout 실시간 감시: 메시지마다 중단 사유를 판단한다. `initialized` 송신 전에 규칙 새로고침 알림이 오면 A1, 허용 밖 서버 요청은 A6. */
export class RulesStdoutTracker {
  readonly analysis = emptyStdoutAnalysis();
  initializedSent = false;
  private allowedRequests = 0;

  /** 메시지를 흡수하고, 중단 사유가 있으면 돌려준다. */
  onMessage(message: JsonRpcMessage): RulesAbort | null {
    absorbStdoutMessage(this.analysis, message);
    const kind = classifyServerMessage(message);
    if (kind === "notification") {
      const method = String(message.method);
      if (method === PUBLISH_DIAGNOSTICS_METHOD) return { condition: "A1", detail: method };
      if (method === RULES_REFRESHED_METHOD && !this.initializedSent) {
        return { condition: "A1", detail: "PRE_INITIALIZED:rulesRefreshed" };
      }
    } else if (kind === "server-request") {
      if (!isValidProgressCreate(message)) {
        return { condition: "A6", detail: tokenOf(String(message.method)) };
      }
      this.allowedRequests += 1;
      if (this.allowedRequests > MAX_PROGRESS_CREATE) {
        return { condition: "A6", detail: "TOO_MANY_PROGRESS_REQUESTS" };
      }
      if (!this.initializedSent) return { condition: "A6", detail: "REQUEST_BEFORE_INITIALIZED" };
    }
    return null;
  }

  /** 장벽의 stdout 쪽 절반. */
  get rulesRefreshedSeen(): boolean {
    return this.analysis.rulesRefreshedCount >= 1;
  }
}

/** 자식 트리에 있어도 되는 이미지는 LSP-MIN-1과 같다. */
export { ALLOWED_IMAGES };
