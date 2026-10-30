// LSP-RULES-1 판정과 기록(순수 모듈). 사실(RulesFacts)에서 13개 성공 조건을 평가해 판정을 정하고 기록을 만든다.
// 같은 사실이면 같은 기록이다(시계·무작위 없음). 이 모듈은 옛 평가기(evaluate.ts)에 이어지지 않고 그쪽의 성공 조건을 건드리지 않는다.
//
// 판정의 우선순위(후속 사유가 판정을 뒤집지 않는다):
//   1. 서버를 띄우지 않았다(요청 거절) → NOT_ATTEMPTED. **띄운 뒤의** 신원·결합·해시 실패는 실행 사실을 지우지 않고 NOT_OBSERVED로 남긴다.
//   2. 실시간 감시가 중단시켰다 → ABORTED:<조건>. 그 뒤에 따라온 시간 초과·강제 종료 같은 사유는 `reasons`에만 남고 판정을 바꾸지 않는다.
//      (장벽 한도 초과 A9는 중단이 아니라 시간 초과로 본다: NOT_OBSERVED:RULES_TIMEOUT)
//   3. 관측 자체를 믿을 수 없게 하는 사유(무결성): 해시·신원·프레임 오류·읽기 실패·출력 상한·초기화 응답·사후에 드러난 금지 신호·감시 폴더 위반 등
//      → NOT_OBSERVED:<사유>
//   4. 로그에 **관측된** 부정적 증거(오류 항목, 규칙 0개, 읽기 오류, 서버가 도중에 끝남) → LOAD_FAILED:<사유>. 종료 단계의 시간 초과·강제 종료와 겹쳐도
//      부정적 증거가 이긴다(시간 초과는 부재이고 오류 항목은 관측이다).
//   5. 종료 단계의 사유(시간 초과, 강제 종료, 종료 코드, shutdown/exit 미송신) → NOT_OBSERVED:<사유>
//   5b. 장벽 뒤 감시를 마쳤다는 시각 증거가 없음(장벽 도달·감시 종료 시각이 없거나, 구간이 settleMs보다 짧거나, shutdown이 감시 종료보다 앞섬)
//       → NOT_OBSERVED:SETTLE_WATCH_NOT_CONFIRMED
//   6. 필요한 신호가 없거나 중복이거나 순서가 어긋나거나 모양을 읽지 못함 → NOT_CONFIRMED:<사유>. **성공으로 쓰지 않는다.**
//   7. 13개 조건이 모두 PASS → RULES_LOAD_OBSERVED
//
// 원칙: 모름·없음·깨짐·모호함을 "문제 없음"으로 읽지 않는다. 송신 위치를 모르면(INITIALIZED_OFFSET_UNKNOWN), initialized 이전 stdout에 초기화 응답 말고 다른
// 프레임이 있으면(PRE_INITIALIZED_STDOUT_MESSAGE), 스스로 끝난 경로에서 스트림 EOF가 없으면(STREAM_NOT_CLOSED:<스트림>) 관측은 성립하지 않는다.
// 끝까지 닫히지 않은 괄호 블록은 뒤의 맨줄을 삼키므로 NOT_CONFIRMED:LOG_SHAPE_UNRECOGNIZED(UNTERMINATED_BLOCK)이고, 삼킨 줄이 엔진·스캔·네트워크 신호 문구면
// NOT_OBSERVED(FORBIDDEN_*_IN_BLOCK)다. 짝 없는 응답·method도 id도 없는 메시지는 NOT_CONFIRMED:UNEXPECTED_STDOUT_MESSAGE다.
//
// 성공이 말하는 것의 한계: RULES_LOAD_OBSERVED는 "프로브 파일 하나가 읽히고 로딩 단계가 오류 없이 지나갔으며 엔진·네트워크 없이 끝났다는 **간접
// 신호들**이 갖춰졌다"는 뜻이다. 로딩된 규칙의 개수, 프로브 규칙의 의미, 탐지 동작은 관측되지 않는다(`not_established`).

import { sha256Hex } from "./sha";
import {
  analyzeInitResponse,
  type ArtifactFacts,
  type InitAnalysis,
  type StreamFacts,
  type WatchedRole,
  type WatchedRootFacts,
} from "./lsp-min";
import type { DescendantResult } from "./lsp-min";
import {
  analyzeRulesStdout,
  LSP_RULES_PROBE_FILE,
  LSP_RULES_PROBE_SHA256,
  LSP_RULES_SCHEMA,
  MAX_PROGRESS_CREATE,
  RULES_UNOBSERVED_ALWAYS,
  rulesRootViolation,
  type RulesAbortCondition,
  type RulesLimits,
  type RulesSendLabel,
  type RulesStdoutAnalysis,
  type RulesTrigger,
} from "./lsp-rules";
import {
  analyzeRulesLog,
  comparableLoadingPath,
  FORBIDDEN_NETWORK_KEYS,
  FORBIDDEN_SCAN_KEYS,
  PRE_INITIALIZED_KEYS,
  REQUIRED_BARE_KEYS,
  type RulesLogAnalysis,
  type RulesLogKey,
  type RulesSignal,
} from "./rules-log";
import type { FrameDecodeError } from "./framing";
import type { Provenance } from "./types";

// ── 사실 ──────────────────────────────────────────────────────────

export interface RulesSendFact {
  label: RulesSendLabel;
  tMs: number;
  ok: boolean;
  /** 쓰기 직전까지 읽은 stderr·stdout 바이트 수. `initialized` 이전 신호를 사후에 가려내는 기준이다. 모르면 null. */
  stderrBytesAtSend: number | null;
  stdoutBytesAtSend: number | null;
}

export interface RulesProbeFacts {
  /** 복사 전 원본 바이트의 sha256(요청 검사가 이미 고정값과 대조한다). 모르면 null. */
  sourceSha256: string | null;
  /** 규칙 폴더에 복사한 직후 그 파일의 sha256. */
  afterCopySha256: string | null;
  /** 실행이 끝난 뒤 그 파일의 sha256. */
  afterRunSha256: string | null;
}

export interface RulesFacts {
  runId: string;
  provenance: Provenance | null;
  refusals: string[];
  limits: RulesLimits;
  expectedVersion: string | null;
  /** 로딩 줄의 경로와 비교할 프로브 파일의 전체 경로. */
  probePath: string | null;
  spawn: { attempted: boolean; ok: boolean; pid: number | null };
  sends: RulesSendFact[];
  stdout: StreamFacts;
  stderr: StreamFacts;
  frameError: FrameDecodeError | null;
  initResponseAtMs: number | null;
  /** 장벽(stdout rulesRefreshed + 맨줄 Scanned open documents)에 닿은 시각과 장벽 뒤 감시를 마친 시각. */
  barrier: { reachedAtMs: number | null; settledAtMs: number | null };
  exit: { observed: boolean; code: number | null; signal: string | null; tMs: number | null };
  stdinClosed: { byHarness: boolean; ok: boolean | null; tMs: number | null };
  kill: { count: number; firstTMs: number | null; confirmed: boolean | null };
  trigger: RulesTrigger | null;
  also: RulesTrigger[];
  abort: { condition: RulesAbortCondition; detail: string; tMs: number } | null;
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
  probe: RulesProbeFacts;
  artifacts: ArtifactFacts[];
  /** 이 모듈 밖에서 정한, 관측 성립을 막는 사유 토큰(관리자 쪽 신원·결합·OS 차단·러너 결과 형식 등). */
  externalReasons?: readonly string[];
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

// ── 판정 ──────────────────────────────────────────────────────────

export type RulesStatus =
  "OBSERVED" | "LOAD_FAILED" | "NOT_CONFIRMED" | "ABORTED" | "NOT_OBSERVED" | "NOT_ATTEMPTED";

export interface ConditionResult {
  id: number;
  name: string;
  result: "PASS" | "FAIL" | "NOT_EVALUATED";
  /** 실패·평가 불가 사유 토큰. 값(경로·내용)은 싣지 않는다. */
  detail: string[];
}

export interface RulesJudgement {
  status: RulesStatus;
  /** `RULES_LOAD_OBSERVED` 또는 `<STATUS>:<사유>`. */
  verdict: string;
  reasons: string[];
  conditions: ConditionResult[];
}

const CONDITION_NAMES: readonly string[] = [
  "PRECONDITIONS_AND_ARTIFACT_HASHES",
  "INITIALIZE_VALID_AND_VERSION_MATCH",
  "INITIALIZED_SENT_ONCE_AFTER_VALID_INIT",
  "STDOUT_RULES_REFRESHED_ONCE",
  "FOUR_BARE_LINES_ONCE_IN_ORDER",
  "PROBE_LOADING_PAIR_ONCE",
  "GOT_ZERO_ERRORS_ONCE",
  "NO_TARGETS_ONCE_NO_NO_RULES",
  "TOKEN_CHECK_SKIPPED_NO_NETWORK_LINES",
  "NO_ENGINE_SCAN_DIAGNOSTIC_ERROR_OR_EXTRA_REQUEST",
  "FILES_UNCHANGED_AS_EXPECTED",
  "NO_LOOPBACK_OR_OS_BLOCK",
  "SHUTDOWN_EXIT_SELF_EXIT_ZERO",
];

const RECEIVER_OS_PREFIX = "ADMIN_OS_BLOCK_";
const NETWORK_WORDS = ["download", "registry"];

/** camelCase 키를 사유 토큰용 SCREAMING_SNAKE로 바꾼다. */
function upperKey(key: string): string {
  return key.replace(/([A-Z])/g, "_$1").toUpperCase();
}

function tokenOf(text: string): string {
  return text.replace(/[^A-Za-z0-9_.:/ -]/g, "?").slice(0, 80);
}

/** 판정에 쓰는 해석 결과(원문 바이트에서 다시 만든다). */
export interface RulesParsed {
  stdout: RulesStdoutAnalysis;
  log: RulesLogAnalysis;
  init: InitAnalysis | null;
  initErrorLogged: boolean;
  networkWordSeen: boolean;
}

export function parseRulesFacts(f: RulesFacts): RulesParsed {
  const stdout = analyzeRulesStdout(f.stdout.bytes, f.stdout.eof);
  const log = analyzeRulesLog(f.stderr.bytes);
  const lower = new TextDecoder("utf-8", { fatal: false, ignoreBOM: true })
    .decode(f.stderr.bytes)
    .toLowerCase();
  return {
    stdout,
    log,
    init: stdout.initMessage === null ? null : analyzeInitResponse(stdout.initMessage),
    initErrorLogged: lower.includes("error initializing server"),
    networkWordSeen: NETWORK_WORDS.some((w) => lower.includes(w)),
  };
}

function versionComparison(
  expected: string | null,
  init: InitAnalysis | null
): "MATCH" | "MISMATCH" | "NOT_OBSERVED" | "NOT_GIVEN" {
  if (expected === null) return "NOT_GIVEN";
  const version = init?.serverInfo?.version ?? null;
  if (version === null) return "NOT_OBSERVED";
  return version === expected ? "MATCH" : "MISMATCH";
}

function initVerdict(p: RulesParsed): "VALID" | "INVALID" | "NONE" {
  if (p.init === null) return "NONE";
  return p.init.reasons.length === 0 && !p.initErrorLogged ? "VALID" : "INVALID";
}

interface Counted {
  ok: RulesSignal[];
  all: RulesSignal[];
}
function countOf(log: RulesLogAnalysis, key: RulesLogKey): Counted {
  const all = log.signals.filter((s) => s.key === key);
  return { all, ok: all.filter((s) => s.shape === "OK") };
}

const REQUIRED_KEYS_FOR_SHAPE: readonly RulesLogKey[] = [
  ...REQUIRED_BARE_KEYS,
  "loading",
  "doneLoading",
  "gotErrors",
  "noTargets",
  "ciDisabled",
];

/** 바이트 수로 쓸 수 있는 값인가(유한한 0 이상의 정수). null·NaN·무한·음수·소수는 "모름"이다. */
function isByteOffset(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** 읽은 해시가 비교할 수 있는 값인가. null·빈 문자열은 "읽지 못함"이며, 서로 같아 보여도 같은 것이 아니다. */
function hashUsable(value: string | null): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * `initialized` 송신 위치(쓰기 직전까지 읽은 stderr 바이트 수). 보내지 않았으면 null, 보냈는데 위치를 모르면 "UNKNOWN".
 * 모르는 위치를 0으로 읽으면 "이전 신호 없음"으로 통과해 버리므로 0으로 채우지 않는다.
 */
function initializedOffset(f: RulesFacts): number | null | "UNKNOWN" {
  const sent = f.sends.find((s) => s.label === "initialized");
  if (sent === undefined) return null;
  return isByteOffset(sent.stderrBytesAtSend) ? sent.stderrBytesAtSend : "UNKNOWN";
}

function evaluate(f: RulesFacts, p: RulesParsed): ConditionResult[] {
  const log = p.log;
  const results: ConditionResult[] = CONDITION_NAMES.map((name, i) => ({
    id: i + 1,
    name,
    result: "NOT_EVALUATED",
    detail: [],
  }));
  const set = (id: number, ok: boolean, detail: string[] = []): void => {
    const r = results[id - 1];
    r.result = ok ? "PASS" : "FAIL";
    r.detail = ok ? [] : detail.length > 0 ? detail : ["FAILED"];
  };
  if (!f.spawn.ok) return results;

  // 1. 사전 조건·결합·신원·설치물 해시
  {
    const d: string[] = [];
    for (const r of f.externalReasons ?? []) if (!r.startsWith(RECEIVER_OS_PREFIX)) d.push(r);
    for (const a of f.artifacts) {
      if (!hashUsable(a.before) || !hashUsable(a.after))
        d.push(`ARTIFACT_NOT_COMPARED:${tokenOf(a.label)}`);
      else if (a.before !== a.after) d.push(`ARTIFACT_HASH_CHANGED:${tokenOf(a.label)}`);
    }
    if (f.refusals.length > 0) d.push("REFUSED");
    set(1, d.length === 0, d);
  }

  // 2. initialize 응답 VALID + 서버 버전 MATCH
  const init = initVerdict(p);
  const version = versionComparison(f.expectedVersion, p.init);
  {
    const d: string[] = [];
    if (init !== "VALID") d.push(init === "NONE" ? "INIT_NO_RESPONSE" : "INIT_INVALID");
    if (p.stdout.initDuplicate) d.push("INIT_RESPONSE_DUPLICATE");
    if (version !== "MATCH") d.push(`PIN_VERSION_${version}`);
    set(2, d.length === 0, d);
  }

  // 3. initialized 정확히 1회, 2번 뒤에만
  const initializedSends = f.sends.filter((s) => s.label === "initialized");
  const initializeSend = f.sends.find((s) => s.label === "initialize");
  {
    const d: string[] = [];
    if (initializedSends.length !== 1) d.push(`INITIALIZED_SENDS_${initializedSends.length}`);
    else {
      const s = initializedSends[0];
      if (!s.ok) d.push("INITIALIZED_WRITE_FAILED");
      if (initializeSend === undefined || initializeSend.tMs > s.tMs) {
        d.push("INITIALIZED_BEFORE_INITIALIZE");
      }
      if (f.initResponseAtMs === null || f.initResponseAtMs > s.tMs) {
        d.push("INITIALIZED_BEFORE_INIT_RESPONSE");
      }
      // 송신 위치(읽은 stderr·stdout 바이트 수)를 모르면 "initialized 이전" 검사를 할 수 없다. 모르는 채로 통과시키지 않는다.
      if (s.ok && (!isByteOffset(s.stderrBytesAtSend) || !isByteOffset(s.stdoutBytesAtSend))) {
        d.push("INITIALIZED_OFFSET_UNKNOWN");
      }
      // initialized 이전의 stdout에는 초기화 응답 하나뿐이어야 한다. 그 밖의 프레임(알림·진행 요청·덜 온 조각 포함)이 있었으면 실시간 감시가 놓친 것이다.
      if (isByteOffset(s.stdoutBytesAtSend)) {
        const prefix = f.stdout.bytes.subarray(0, s.stdoutBytesAtSend);
        if (prefix.byteLength > 0) {
          const before = analyzeRulesStdout(prefix, true);
          if (before.frames !== 1 || before.initMessage === null || before.frameError !== null) {
            d.push("PRE_INITIALIZED_STDOUT_MESSAGE");
          }
        }
      }
    }
    if (init !== "VALID" || version !== "MATCH") d.push("INITIALIZED_WITHOUT_VALID_INIT_AND_MATCH");
    set(3, d.length === 0, d);
  }

  // 4. stdout rulesRefreshed 정확히 1회
  set(4, p.stdout.rulesRefreshedCount === 1, [
    `RULES_REFRESHED_COUNT_${p.stdout.rulesRefreshedCount}`,
  ]);

  // 5. 맨줄 4개, 각각 정확히 1회, 이 순서
  const bare = REQUIRED_BARE_KEYS.map((k) => countOf(log, k));
  {
    const d: string[] = [];
    REQUIRED_BARE_KEYS.forEach((key, i) => {
      if (bare[i].ok.length !== 1) d.push(`${key}_COUNT_${bare[i].ok.length}`);
    });
    if (d.length === 0) {
      const at = bare.map((c) => c.ok[0].byteOffset);
      for (let i = 1; i < at.length; i += 1) if (at[i] <= at[i - 1]) d.push("ORDER");
    }
    set(5, d.length === 0, d);
  }

  // 6. 프로브 경로의 로딩 시작·완료 각각 1회, 다른 경로의 로딩 줄 없음
  const loading = countOf(log, "loading");
  const done = countOf(log, "doneLoading");
  const wantPath = f.probePath === null ? null : comparableLoadingPath(f.probePath);
  {
    const d: string[] = [];
    if (loading.ok.length !== 1) d.push(`LOADING_COUNT_${loading.ok.length}`);
    if (done.ok.length !== 1) d.push(`DONE_LOADING_COUNT_${done.ok.length}`);
    for (const s of [...loading.ok, ...done.ok]) {
      if (wantPath === null || comparableLoadingPath(String(s.params.path)) !== wantPath) {
        d.push("LOADING_PATH_UNEXPECTED");
        break;
      }
    }
    if (d.length === 0 && loading.ok[0].byteOffset >= done.ok[0].byteOffset) d.push("ORDER");
    // 새로고침 구간(Refreshing rules ~ Rules refreshed) 안에 있어야 한다.
    if (d.length === 0 && bare[0].ok.length === 1 && bare[1].ok.length === 1) {
      const lo = bare[0].ok[0].byteOffset;
      const hi = bare[1].ok[0].byteOffset;
      for (const s of [loading.ok[0], done.ok[0]])
        if (s.byteOffset < lo || s.byteOffset > hi) d.push("ORDER");
    }
    set(6, d.length === 0, [...new Set(d)]);
  }

  // 7. Got 0 errors 정확히 1회
  const got = countOf(log, "gotErrors");
  {
    const d: string[] = [];
    if (got.ok.length !== 1) d.push(`GOT_ERRORS_COUNT_${got.ok.length}`);
    else {
      if (got.ok[0].params.count !== 0) d.push("GOT_ERRORS_NONZERO");
      if (bare[0].ok.length === 1 && bare[1].ok.length === 1) {
        const at = got.ok[0].byteOffset;
        if (at < bare[0].ok[0].byteOffset || at > bare[1].ok[0].byteOffset) d.push("ORDER");
      }
    }
    set(7, d.length === 0, d);
  }

  // 8. No targets 정확히 1회, No rules / Rules not loaded 없음
  const noTargets = countOf(log, "noTargets");
  const noRules = countOf(log, "noRules");
  const notLoaded = countOf(log, "rulesNotLoaded");
  {
    const d: string[] = [];
    if (noTargets.ok.length !== 1) d.push(`NO_TARGETS_COUNT_${noTargets.ok.length}`);
    else if (bare[2].ok.length === 1 && bare[3].ok.length === 1) {
      const at = noTargets.ok[0].byteOffset;
      if (at < bare[2].ok[0].byteOffset || at > bare[3].ok[0].byteOffset) d.push("ORDER");
    }
    if (noRules.all.length > 0) d.push("NO_RULES_TO_RUN_SEEN");
    if (notLoaded.all.length > 0) d.push("RULES_NOT_LOADED_SEEN");
    set(8, d.length === 0, d);
  }

  // 9. 토큰 확인 건너뜀, 네트워크·토큰·설정 파일 줄 없음
  const ci = countOf(log, "ciDisabled");
  {
    const d: string[] = [];
    if (ci.ok.length < 1) d.push("CI_DISABLED_ABSENT");
    for (const key of FORBIDDEN_NETWORK_KEYS) {
      if (countOf(log, key).all.length > 0) d.push(`FORBIDDEN_${upperKey(key)}`);
    }
    if (p.networkWordSeen) d.push("NETWORK_WORD_SEEN");
    set(9, d.length === 0, d);
  }

  // 10. 엔진·스캔·진단 신호 없음, 서버 요청은 허용 목록뿐, ERROR 줄 없음, 허용 밖 알림 없음
  {
    const d: string[] = [];
    for (const key of FORBIDDEN_SCAN_KEYS) {
      if (countOf(log, key).all.length > 0) d.push(`FORBIDDEN_${upperKey(key)}`);
    }
    if (p.stdout.diagnosticsCount > 0) d.push("DIAGNOSTICS_SEEN");
    if (p.stdout.serverRequests.some((r) => !r.allowed)) d.push("SERVER_REQUEST_NOT_ALLOWED");
    if (p.stdout.serverRequestCount > MAX_PROGRESS_CREATE) d.push("SERVER_REQUESTS_TOO_MANY");
    if (countOf(log, "errorRecord").all.length > 0) d.push("ERROR_RECORD_SEEN");
    if (p.stdout.errorNotifications > 0) d.push("ERROR_NOTIFICATION_SEEN");
    if (Object.keys(p.stdout.otherNotifications).length > 0) d.push("UNEXPECTED_NOTIFICATION");
    // 짝 없는 응답, method도 id도 없는 메시지(id가 null인 응답 포함)는 어떤 허용 목록에도 없다. 우리 initialize·shutdown의 응답만 예외다.
    if (p.stdout.unmatchedResponses > 0 || p.stdout.messagesWithoutMethodOrId > 0) {
      d.push("UNEXPECTED_STDOUT_MESSAGE");
    }
    if (countOf(log, "unexpectedWarning").all.length > 0) d.push("UNEXPECTED_WARNING");
    if (countOf(log, "skippingRule").all.length > 0) d.push("RULE_SKIPPED");
    if (log.counters.malformedHeaders > 0) d.push("HEADER_UNREADABLE");
    if (log.counters.orphanBareLines > 0) d.push("ORPHAN_LINES");
    // 끝까지 닫히지 않은 블록은 뒤의 맨줄을 전부 삼켜 신호로 읽히지 않게 한다: 모양을 읽지 못한 것이다.
    if (log.openBlockAtEnd) d.push("UNTERMINATED_BLOCK");
    for (const key of REQUIRED_KEYS_FOR_SHAPE) {
      if (countOf(log, key).all.some((s) => s.shape !== "OK"))
        d.push(`SHAPE_MISMATCH_${upperKey(key)}`);
    }
    // initialized 이전에 읽은 줄 중 새로고침·스캔 신호. 송신 위치를 모르면(UNKNOWN) 이 검사를 할 수 없고, 그 사실은 조건 3이 무결성 사유로 남긴다.
    const offset = initializedOffset(f);
    if (offset !== "UNKNOWN") {
      for (const s of log.signals) {
        if (!PRE_INITIALIZED_KEYS.includes(s.key)) continue;
        if (offset === null || s.byteOffset < offset) {
          d.push("PRE_INITIALIZED_SIGNAL");
          break;
        }
      }
    }
    set(10, d.length === 0, d);
  }

  // 11. 파일 변화: 작업 영역 0→0, 규칙 폴더는 프로브 1개이고 sha256 불변, 홈은 허용 위치만, 설치물 해시 불변
  {
    const d: string[] = [];
    const root = (role: WatchedRole): WatchedRootFacts | undefined =>
      f.roots.find((r) => r.role === role);
    const ws = root("WORKSPACE");
    const rules = root("RULES_DIR");
    const home = root("HOME_DIR");
    if (ws === undefined || ws.filesBefore !== 0 || ws.filesAfter !== 0 || ws.added.length > 0) {
      d.push("WORKSPACE_NOT_EMPTY_THROUGHOUT");
    }
    if (
      rules === undefined ||
      rules.filesBefore !== 1 ||
      rules.filesAfter !== 1 ||
      rules.added.length > 0 ||
      rules.removed.length > 0
    ) {
      d.push("RULES_DIR_NOT_EXACTLY_PROBE");
    }
    if (
      home === undefined ||
      home.filesAfter === null ||
      home.added.some((path) => rulesRootViolation("HOME_DIR", path))
    ) {
      d.push("HOME_UNEXPECTED_WRITE");
    }
    const { sourceSha256, afterCopySha256, afterRunSha256 } = f.probe;
    if (sourceSha256 !== LSP_RULES_PROBE_SHA256) d.push("PROBE_SOURCE_HASH_UNEXPECTED");
    if (afterCopySha256 !== LSP_RULES_PROBE_SHA256) d.push("PROBE_COPY_HASH_UNEXPECTED");
    if (afterRunSha256 !== LSP_RULES_PROBE_SHA256) d.push("PROBE_CHANGED_DURING_RUN");
    for (const a of f.artifacts) {
      if (!hashUsable(a.before) || !hashUsable(a.after) || a.before !== a.after)
        d.push("ARTIFACT_HASH_UNCHANGED_NOT_CONFIRMED");
    }
    set(11, d.length === 0, [...new Set(d)]);
  }

  // 12. 루프백 수신 0, 귀속된 OS 차단 0, 수집이 확실함
  {
    const d: string[] = [];
    const { baselineHits, finalHits } = f.live.receiver;
    if (baselineHits === null || finalHits === null) d.push("RECEIVER_UNOBSERVABLE");
    else if (finalHits > baselineHits) d.push("RECEIVER_HITS_INCREASED");
    for (const r of f.externalReasons ?? []) if (r.startsWith(RECEIVER_OS_PREFIX)) d.push(r);
    set(12, d.length === 0, d);
  }

  // 13. shutdown·exit 송신, 스스로 종료, 종료 코드 0, 강제 종료 없음
  {
    const d: string[] = [];
    const sentOk = (label: RulesSendLabel): boolean =>
      f.sends.some((s) => s.label === label && s.ok);
    if (!sentOk("shutdown") || !sentOk("exit")) d.push("SHUTDOWN_EXIT_NOT_SENT");
    if (!f.exit.observed) d.push("EXIT_NOT_OBSERVED");
    else {
      if (f.exit.code !== 0) d.push("EXIT_CODE_NOT_ZERO");
      if (f.exit.signal !== null) d.push("EXIT_BY_SIGNAL");
    }
    if (f.kill.count > 0) d.push("FORCE_KILLED");
    if (f.stdinClosed.byHarness) d.push("STDIN_CLOSED_BY_HARNESS");
    set(13, d.length === 0, d);
  }
  return results;
}

function raisedSet(f: RulesFacts): Set<RulesTrigger> {
  const raised = new Set<RulesTrigger>(f.also);
  if (f.trigger !== null) raised.add(f.trigger);
  return raised;
}

/** 관측을 믿을 수 없게 하는 사유(무결성). 하나라도 있으면 로그 내용으로 판정하지 않는다. */
function integrityBlockers(f: RulesFacts, p: RulesParsed, conditions: ConditionResult[]): string[] {
  const out: string[] = [];
  const raised = raisedSet(f);
  out.push(...(f.externalReasons ?? []));
  if (!f.spawn.ok) out.push("SPAWN_FAILED");
  const frameError = f.frameError ?? p.stdout.frameError;
  if (frameError !== null) out.push(`FRAME_ERROR:${frameError.kind}`);
  else if (raised.has("FRAME_ERROR")) out.push("FRAME_ERROR");
  if (f.stdout.overflow || f.stderr.overflow || raised.has("OUTPUT_LIMIT"))
    out.push("OUTPUT_LIMIT");
  if (f.stdout.readFailed || f.stderr.readFailed || raised.has("STREAM_READ_FAILED")) {
    out.push("STREAM_READ_FAILED");
  }
  // 서버가 스스로 끝난 경로(강제 종료도, 시간 초과도 없다)인데 스트림이 끝까지 읽혔다는 표시(EOF)가 없다: 로그가 덜 온 것일 수 있다.
  // 출력 상한·읽기 실패는 위에서 이미 따로 센다(그 사유가 우선이다).
  const timedOut = ["INIT_TIMEOUT", "RULES_TIMEOUT", "TOTAL_TIMEOUT", "EXIT_TIMEOUT"].some((t) =>
    raised.has(t as RulesTrigger)
  );
  if (f.exit.observed && f.kill.count === 0 && !timedOut && f.abort?.condition !== "A9") {
    if (!f.stdout.overflow && !f.stdout.readFailed && f.stdout.eof !== true) {
      out.push("STREAM_NOT_CLOSED:stdout");
    }
    if (!f.stderr.overflow && !f.stderr.readFailed && f.stderr.eof !== true) {
      out.push("STREAM_NOT_CLOSED:stderr");
    }
  }
  if (raised.has("STDIN_ERROR")) out.push("STDIN_ERROR");
  const init = initVerdict(p);
  const version = versionComparison(f.expectedVersion, p.init);
  if (init !== "VALID") out.push(init === "NONE" ? "INIT_NO_RESPONSE" : "INIT_INVALID");
  if (init === "VALID" && version !== "MATCH") out.push(`INIT_VERSION_${version}`);
  if (p.stdout.initDuplicate) out.push("INIT_RESPONSE_DUPLICATE");
  const initializedSends = f.sends.filter((s) => s.label === "initialized");
  if (initializedSends.length > 1) out.push("INITIALIZED_SENT_MORE_THAN_ONCE");
  if (initializedSends.length > 0 && (init !== "VALID" || version !== "MATCH")) {
    out.push("INITIALIZED_SENT_WITHOUT_VALID_INIT");
  }
  // 사후에 드러난 위반: 실시간 감시가 놓쳤다. 중단하지 못했을 뿐 일어난 일이다.
  const c = (id: number): ConditionResult => conditions[id - 1];
  for (const t of c(3).detail) {
    if (
      t.startsWith("INITIALIZED_BEFORE") ||
      t === "INITIALIZED_WRITE_FAILED" ||
      t === "INITIALIZED_OFFSET_UNKNOWN" ||
      t === "PRE_INITIALIZED_STDOUT_MESSAGE"
    ) {
      out.push(t);
    }
  }
  // 끝까지 닫히지 않은 블록이 삼킨 줄이 엔진·스캔·네트워크 신호 문구다: 실제로 일어난 일을 가렸을 수 있다.
  for (const key of p.log.openBlockEmbeddedKeys) {
    if (FORBIDDEN_SCAN_KEYS.includes(key) || FORBIDDEN_NETWORK_KEYS.includes(key)) {
      out.push(`FORBIDDEN_${upperKey(key)}_IN_BLOCK`);
    }
  }
  if (c(10).detail.includes("PRE_INITIALIZED_SIGNAL"))
    out.push("PRE_INITIALIZED_SIGNAL_NOT_CAUGHT_LIVE");
  for (const t of c(10).detail) {
    if (t.startsWith("FORBIDDEN_") || t === "DIAGNOSTICS_SEEN") out.push(`${t}_NOT_CAUGHT_LIVE`);
    if (t === "SERVER_REQUEST_NOT_ALLOWED" || t === "SERVER_REQUESTS_TOO_MANY") {
      out.push(`${t}_NOT_CAUGHT_LIVE`);
    }
  }
  for (const t of c(9).detail) {
    if (t.startsWith("FORBIDDEN_") || t === "NETWORK_WORD_SEEN") out.push(`${t}_NOT_CAUGHT_LIVE`);
  }
  for (const t of c(11).detail) out.push(t);
  for (const t of c(12).detail) if (!t.startsWith(RECEIVER_OS_PREFIX)) out.push(t);
  if (f.live.processes.disallowed.length > 0) out.push("DISALLOWED_IMAGE_SEEN");
  for (const a of f.artifacts) {
    if (hashUsable(a.before) && hashUsable(a.after) && a.before !== a.after) {
      out.push(`ARTIFACT_HASH_CHANGED:${tokenOf(a.label)}`);
    }
  }
  return [...new Set(out)];
}

/** 로그에 관측된 부정적 증거. 우선순위 순서대로 돌려준다. */
function negativeEvidence(f: RulesFacts, p: RulesParsed): string[] {
  const log = p.log;
  const out: string[] = [];
  if (countOf(log, "errorRecord").all.length > 0) out.push("SERVER_ERROR_LOGGED");
  if (p.stdout.errorNotifications > 0) out.push("SERVER_ERROR_NOTIFIED");
  const refreshing = countOf(log, "refreshingRules").ok.length > 0;
  const refreshed =
    countOf(log, "rulesRefreshed").ok.length > 0 || p.stdout.rulesRefreshedCount > 0;
  // 설정 오류는 `Got N errors`(N ≥ 1)라는 **직접 증거**가 있을 때만 단정한다. "로딩 시작만 있고 완료가 없다"는 그 자체로는 부재이거나(우리가
  // 도중에 끊었다) `Got 0 errors`와 모순되는 해석 불가 조합이라 여기서 실패로 단정하지 않는다 — 확인 불가(NOT_CONFIRMED)로 남는다.
  const gotNonZero = countOf(log, "gotErrors").all.some((s) => s.params.count !== 0);
  if (gotNonZero) out.push("LOCAL_CONFIG_ERRORS");
  if (countOf(log, "skippingRule").all.length > 0) out.push("INVALID_RULE_SKIPPED");
  if (countOf(log, "noRules").all.length > 0) out.push("NO_RULES_TO_RUN");
  if (countOf(log, "rulesNotLoaded").all.length > 0) out.push("RULES_NOT_LOADED");
  // 서버가 (우리가 죽이지 않았는데) 새로고침 도중에 끝났다: 부정적 증거다. 시간 초과는 부재일 뿐이라 여기에 넣지 않는다.
  if (raisedSet(f).has("CHILD_EXITED_EARLY") && f.kill.count === 0 && refreshing && !refreshed) {
    out.push("RULES_REFRESH_INCOMPLETE");
  }
  return out;
}

/** 종료 단계의 사유: 관측 자체는 믿을 수 있지만 끝맺음이 정상이 아니다. */
function terminationBlockers(f: RulesFacts, conditions: ConditionResult[]): string[] {
  const out: string[] = [];
  const raised = raisedSet(f);
  for (const t of [
    "INIT_TIMEOUT",
    "RULES_TIMEOUT",
    "TOTAL_TIMEOUT",
    "EXIT_TIMEOUT",
    "CHILD_EXITED_EARLY",
  ] as const) {
    if (raised.has(t)) out.push(t);
  }
  if (f.abort?.condition === "A9") out.push("RULES_TIMEOUT");
  if (raised.has("INIT_INVALID")) out.push("INIT_INVALID");
  for (const t of conditions[12].detail) out.push(t);
  return [...new Set(out)];
}

/** 필요한 신호가 안 보이거나 모양을 읽지 못하는 등, 성공도 실패도 말할 수 없는 사유. 우선순위 순서. */
function confirmationGaps(conditions: ConditionResult[], p: RulesParsed): string[] {
  const out: string[] = [];
  const all = conditions.flatMap((c) => c.detail);
  const shape =
    p.log.counters.malformedHeaders > 0 ||
    p.log.counters.orphanBareLines > 0 ||
    p.log.openBlockAtEnd ||
    all.some(
      (t) =>
        t.startsWith("SHAPE_MISMATCH_") ||
        t === "HEADER_UNREADABLE" ||
        t === "ORPHAN_LINES" ||
        t === "UNTERMINATED_BLOCK"
    );
  if (shape) out.push("LOG_SHAPE_UNRECOGNIZED");
  if (p.log.openBlockAtEnd) out.push("UNTERMINATED_BLOCK");
  if (all.some((t) => /_COUNT_0$/.test(t) || t === "CI_DISABLED_ABSENT")) out.push("SIGNAL_ABSENT");
  if (all.some((t) => /_COUNT_([2-9]|[1-9]\d+)$/.test(t))) out.push("SIGNAL_DUPLICATED");
  if (all.includes("ORDER")) out.push("ORDER_VIOLATION");
  if (all.includes("LOADING_PATH_UNEXPECTED")) out.push("LOADING_PATH_UNEXPECTED");
  if (all.includes("UNEXPECTED_WARNING")) out.push("UNEXPECTED_WARNING");
  if (all.includes("UNEXPECTED_NOTIFICATION")) out.push("UNEXPECTED_NOTIFICATION");
  if (all.includes("UNEXPECTED_STDOUT_MESSAGE")) out.push("UNEXPECTED_STDOUT_MESSAGE");
  if (all.includes("GOT_ERRORS_NONZERO")) out.push("GOT_ERRORS_NONZERO");
  return out;
}

/**
 * 성공의 마지막 전제: 장벽에 닿은 뒤 settleMs 동안 감시를 이었고, 그 감시를 마친 뒤에야 shutdown을 보냈다는 시각 증거.
 * 시각을 모르거나(null·비수) 구간이 짧거나 순서가 어긋나면 "늦게 오는 금지 신호를 볼 시간을 줬다"고 말할 수 없다.
 */
function settleBlockers(f: RulesFacts): string[] {
  const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  const { reachedAtMs, settledAtMs } = f.barrier;
  const shutdown = f.sends.find((s) => s.label === "shutdown");
  const confirmed =
    finite(reachedAtMs) &&
    finite(settledAtMs) &&
    shutdown !== undefined &&
    finite(shutdown.tMs) &&
    settledAtMs >= reachedAtMs + f.limits.settleMs &&
    shutdown.tMs >= settledAtMs;
  return confirmed ? [] : ["SETTLE_WATCH_NOT_CONFIRMED"];
}

export function judgeRulesLoad(f: RulesFacts, parsed?: RulesParsed): RulesJudgement {
  const p = parsed ?? parseRulesFacts(f);
  const conditions = evaluate(f, p);
  const verdictOf = (status: RulesStatus, reasons: string[]): RulesJudgement => ({
    status,
    verdict: `${status}:${reasons[0]}`,
    reasons: [...new Set(reasons)],
    conditions,
  });

  // 1. 서버를 띄우지 않았다
  if (f.refusals.length > 0 && !f.spawn.attempted) return verdictOf("NOT_ATTEMPTED", f.refusals);
  // 2. 실시간 중단(장벽 한도 초과 A9는 시간 초과로 따로 본다)
  if (f.abort !== null && f.abort.condition !== "A9") {
    const followers = [
      ...integrityBlockers(f, p, conditions),
      ...terminationBlockers(f, conditions),
    ];
    return {
      status: "ABORTED",
      verdict: `ABORTED:${f.abort.condition}`,
      reasons: [`ABORT:${f.abort.condition}`, ...new Set(followers)],
      conditions,
    };
  }
  // 3. 무결성
  const integrity = integrityBlockers(f, p, conditions);
  if (f.refusals.length > 0) integrity.unshift("REFUSAL_AFTER_START");
  if (integrity.length > 0) return verdictOf("NOT_OBSERVED", integrity);
  // 4. 관측된 부정적 증거
  const negative = negativeEvidence(f, p);
  if (negative.length > 0) {
    return {
      status: "LOAD_FAILED",
      verdict: `LOAD_FAILED:${negative[0]}`,
      reasons: [...negative, ...terminationBlockers(f, conditions)],
      conditions,
    };
  }
  // 5. 종료 단계
  const ending = terminationBlockers(f, conditions);
  if (ending.length > 0) return verdictOf("NOT_OBSERVED", ending);
  // 5b. 장벽 뒤 감시를 마쳤다는 시각 증거가 없다: 관측 구간이 세워지지 않았다
  const settle = settleBlockers(f);
  if (settle.length > 0) return verdictOf("NOT_OBSERVED", settle);
  // 6. 확인 불가
  const gaps = confirmationGaps(conditions, p);
  const failing = conditions.filter((c) => c.result !== "PASS");
  if (gaps.length > 0) return verdictOf("NOT_CONFIRMED", gaps);
  if (failing.length > 0) {
    return verdictOf(
      "NOT_CONFIRMED",
      failing.flatMap((c) => (c.detail.length > 0 ? c.detail : [`CONDITION_${c.id}`]))
    );
  }
  // 7. 성공
  return { status: "OBSERVED", verdict: "RULES_LOAD_OBSERVED", reasons: [], conditions };
}

// ── 기록 ──────────────────────────────────────────────────────────

const MAX_LISTED = 50;
function capped(items: readonly string[]): string[] {
  return items.length <= MAX_LISTED
    ? [...items]
    : [...items.slice(0, MAX_LISTED), `+${items.length - MAX_LISTED}`];
}

export interface RulesObservation {
  schema: typeof LSP_RULES_SCHEMA;
  run_id: string;
  provenance: Provenance | null;
  status: RulesStatus;
  verdict: string;
  verdict_reasons: string[];
  conditions: ConditionResult[];
  request: {
    process_role: "lsp-rules";
    command_base: string;
    args: string[];
    limits: Record<string, number>;
    messages_allowed: RulesSendLabel[];
    initialized_sent_at_most: 1;
    refusals: string[];
  };
  sent: RulesSendFact[];
  initialize: {
    response: "VALID" | "INVALID" | "NONE";
    reasons: string[];
    latency_ms: number | null;
    server_info: { name: string | null; version: string | null } | null;
    pin_version_comparison: "MATCH" | "MISMATCH" | "NOT_OBSERVED" | "NOT_GIVEN";
    capabilities_sha256: string | null;
  };
  barrier: {
    reached_at_ms: number | null;
    settled_at_ms: number | null;
    stdout_rules_refreshed_count: number;
    stderr_scanned_open_documents_count: number;
  };
  server_messages: {
    frames: number;
    server_requests: { count: number; allowed: number; methods: string[] };
    progress_notifications: number;
    diagnostics: number;
    unexpected_notifications: Record<string, number>;
    error_notifications: number;
    shutdown_response_seen: boolean;
  };
  log: {
    /** 로그 형태 사실. 원문 줄은 싣지 않는다(원시 바이트는 증거 폴더에 따로 있다). */
    lines: number;
    records: number;
    headed_records: number;
    bare_records: number;
    malformed_headers: number;
    orphan_bare_lines: number;
    embedded_signal_text: number;
    unclassified_info: number;
    signals: Record<string, { ok: number; shape_mismatch: number }>;
    loading_paths_match_probe: boolean | null;
  };
  probe: {
    file: typeof LSP_RULES_PROBE_FILE;
    expected_sha256: string;
    source_sha256: string | null;
    after_copy_sha256: string | null;
    after_run_sha256: string | null;
  };
  streams: {
    stdout: {
      bytes: number;
      sha256: string;
      overflow: boolean;
      eof: boolean;
      read_failed: boolean;
    };
    stderr: {
      bytes: number;
      sha256: string;
      overflow: boolean;
      eof: boolean;
      read_failed: boolean;
      partial_tail: boolean;
    };
  };
  termination: {
    trigger: RulesTrigger | null;
    also: RulesTrigger[];
    abort: { condition: RulesAbortCondition; detail: string; t_ms: number } | null;
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
      stderr_checked_bytes: number;
      stdout_frames_checked: number;
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
  /**
   * 이 관측이 세워 주지 않는 것. 성공(RULES_LOAD_OBSERVED)이어도 아래는 NOT_ESTABLISHED/NOT_OBSERVED다:
   * 로딩된 규칙의 개수, 프로브 규칙의 의미와 탐지 동작, 스캔, 보안 통과, 대조 참조 자격, 핀 검증.
   */
  not_established: {
    complete: "NOT_ESTABLISHED";
    security_pass: "NOT_ESTABLISHED";
    control_reference: "NOT_ESTABLISHED";
    scanning: "NOT_ESTABLISHED";
    pin_verification: "NOT_ESTABLISHED";
    loaded_rule_count: "NOT_OBSERVED";
    probe_rule_semantics_and_detection: "NOT_ESTABLISHED";
  };
  /** 성공의 증거 범위: 로그·알림·파일에서 읽은 간접 신호뿐이다. */
  evidence_scope: "INDIRECT_SIGNALS_ONLY";
}

function compareArtifact(item: ArtifactFacts): "SAME" | "CHANGED" | "NOT_COMPARED" {
  if (!hashUsable(item.before) || !hashUsable(item.after)) return "NOT_COMPARED";
  return item.before === item.after ? "SAME" : "CHANGED";
}

export function buildRulesRecord(f: RulesFacts): RulesObservation {
  const p = parseRulesFacts(f);
  const judgement = judgeRulesLoad(f, p);
  const init = initVerdict(p);
  const version = versionComparison(f.expectedVersion, p.init);
  const initSentAt = f.sends.find((s) => s.label === "initialize" && s.ok)?.tMs ?? null;
  const latency =
    p.stdout.initMessage !== null && initSentAt !== null && f.initResponseAtMs !== null
      ? Math.max(0, f.initResponseAtMs - initSentAt)
      : null;

  const signals: Record<string, { ok: number; shape_mismatch: number }> = {};
  for (const s of p.log.signals) {
    const entry = (signals[s.key] ??= { ok: 0, shape_mismatch: 0 });
    if (s.shape === "OK") entry.ok += 1;
    else entry.shape_mismatch += 1;
  }
  const wantPath = f.probePath === null ? null : comparableLoadingPath(f.probePath);
  const loadingSignals = p.log.signals.filter(
    (s) => s.key === "loading" || s.key === "doneLoading"
  );
  const pathsMatch =
    loadingSignals.length === 0 || wantPath === null
      ? null
      : loadingSignals.every((s) => comparableLoadingPath(String(s.params.path)) === wantPath);

  const cleanupProblems = [...f.cleanup.problems];
  const cleanupOk = f.spawn.ok
    ? f.cleanup.childExitConfirmed &&
      f.cleanup.streamsClosed === true &&
      f.cleanup.descendantsAliveAfter === 0 &&
      f.cleanup.dispose === "OK" &&
      f.cleanup.timersCancelled &&
      cleanupProblems.length === 0
    : cleanupProblems.length === 0;

  const unobserved = [...RULES_UNOBSERVED_ALWAYS];
  if (f.provenance === "stub") unobserved.unshift("PROVENANCE_STUB_NOT_REAL_SEMGREP");

  return {
    schema: LSP_RULES_SCHEMA,
    run_id: f.runId,
    provenance: f.provenance,
    status: judgement.status,
    verdict: judgement.verdict,
    verdict_reasons: judgement.reasons,
    conditions: judgement.conditions,
    request: {
      process_role: "lsp-rules",
      command_base: "semgrep.exe",
      args: ["lsp", "--debug"],
      limits: {
        total_ms: f.limits.totalMs,
        init_ms: f.limits.initMs,
        rules_ms: f.limits.rulesMs,
        settle_ms: f.limits.settleMs,
        exit_ms: f.limits.exitMs,
        stdin_close_grace_ms: f.limits.stdinCloseGraceMs,
        kill_confirm_ms: f.limits.killConfirmMs,
        max_stdout_bytes: f.limits.maxStdoutBytes,
        max_stderr_bytes: f.limits.maxStderrBytes,
        sample_interval_ms: f.limits.sampleIntervalMs,
      },
      messages_allowed: ["initialize", "initialized", "shutdown", "exit"],
      initialized_sent_at_most: 1,
      refusals: [...f.refusals],
    },
    sent: f.sends.map((s) => ({ ...s })),
    initialize: {
      response: init,
      reasons:
        p.init === null
          ? ["INIT_NO_RESPONSE"]
          : [...p.init.reasons, ...(p.initErrorLogged ? ["INIT_ERROR_LOGGED"] : [])],
      latency_ms: latency,
      server_info: p.init?.serverInfo ?? null,
      pin_version_comparison: version,
      capabilities_sha256: p.init?.capabilitiesSha256 ?? null,
    },
    barrier: {
      reached_at_ms: f.barrier.reachedAtMs,
      settled_at_ms: f.barrier.settledAtMs,
      stdout_rules_refreshed_count: p.stdout.rulesRefreshedCount,
      stderr_scanned_open_documents_count: p.log.signals.filter(
        (s) => s.key === "scannedOpenDocuments" && s.shape === "OK"
      ).length,
    },
    server_messages: {
      frames: p.stdout.frames,
      server_requests: {
        count: p.stdout.serverRequestCount,
        allowed: p.stdout.serverRequests.filter((r) => r.allowed).length,
        methods: p.stdout.serverRequests.map((r) => r.method),
      },
      progress_notifications: p.stdout.progressNotifications,
      diagnostics: p.stdout.diagnosticsCount,
      unexpected_notifications: { ...p.stdout.otherNotifications },
      error_notifications: p.stdout.errorNotifications,
      shutdown_response_seen: p.stdout.shutdownResponseSeen,
    },
    log: {
      lines: p.log.counters.lines,
      records: p.log.counters.records,
      headed_records: p.log.counters.headedRecords,
      bare_records: p.log.counters.bareRecords,
      malformed_headers: p.log.counters.malformedHeaders,
      orphan_bare_lines: p.log.counters.orphanBareLines,
      embedded_signal_text: p.log.counters.embeddedSignalText,
      unclassified_info: p.log.counters.unclassifiedInfo,
      signals,
      loading_paths_match_probe: pathsMatch,
    },
    probe: {
      file: LSP_RULES_PROBE_FILE,
      expected_sha256: LSP_RULES_PROBE_SHA256,
      source_sha256: f.probe.sourceSha256,
      after_copy_sha256: f.probe.afterCopySha256,
      after_run_sha256: f.probe.afterRunSha256,
    },
    streams: {
      stdout: {
        bytes: f.stdout.total,
        sha256: sha256Hex(f.stdout.bytes),
        overflow: f.stdout.overflow,
        eof: f.stdout.eof,
        read_failed: f.stdout.readFailed,
      },
      stderr: {
        bytes: f.stderr.total,
        sha256: sha256Hex(f.stderr.bytes),
        overflow: f.stderr.overflow,
        eof: f.stderr.eof,
        read_failed: f.stderr.readFailed,
        partial_tail: p.log.counters.partialTail,
      },
    },
    termination: {
      trigger: f.refusals.length > 0 ? null : f.trigger,
      also: [...f.also],
      abort:
        f.abort === null
          ? null
          : { condition: f.abort.condition, detail: tokenOf(f.abort.detail), t_ms: f.abort.tMs },
      exit: f.exit.observed ? { code: f.exit.code, signal: f.exit.signal } : null,
      exit_observed: f.exit.observed,
      stdin_closed_by_harness: f.stdinClosed.byHarness,
      kill_count: f.kill.count,
    },
    timeline: {
      total_budget_ms: f.limits.totalMs,
      observation_ms: f.timeline.observationMs,
      cleanup_ms: f.timeline.cleanupMs,
    },
    coverage: {
      live: {
        mode: "SAMPLING",
        interval_ms: f.limits.sampleIntervalMs,
        stderr_checked_bytes: f.live.stderrCheckedBytes,
        stdout_frames_checked: f.live.stdoutFramesChecked,
        receiver: {
          baseline_hits: f.live.receiver.baselineHits,
          final_hits: f.live.receiver.finalHits,
          samples: f.live.receiver.samples,
          failures: f.live.receiver.failures,
        },
        processes: {
          samples: f.live.processes.samples,
          failures: f.live.processes.failures,
          max_descendants: f.live.processes.maxDescendants,
          images_seen: capped(f.live.processes.imagesSeen.map(tokenOf)),
          disallowed: capped(f.live.processes.disallowed.map(tokenOf)),
        },
        files: { samples: f.live.files.samples, failures: f.live.files.failures },
      },
      post_hoc: {
        watched_roots: f.roots.map((r) => ({
          role: r.role,
          files_before: r.filesBefore,
          files_after: r.filesAfter,
          added: capped(r.added),
          removed: capped(r.removed),
        })),
        artifact_hashes: f.artifacts.map((a) => ({
          label: tokenOf(a.label),
          before: a.before,
          after: a.after,
          comparison: compareArtifact(a),
        })),
        network_events: "COLLECTED_OUTSIDE_THIS_MODULE",
      },
      unobserved,
    },
    cleanup: {
      ok: cleanupOk,
      problems: cleanupProblems,
      child_exit_confirmed: f.cleanup.childExitConfirmed,
      streams_closed: f.cleanup.streamsClosed,
      descendants_alive_after: f.cleanup.descendantsAliveAfter,
      descendant_tracking: f.cleanup.descendantTracking,
      dispose: f.cleanup.dispose,
      timers_cancelled: f.cleanup.timersCancelled,
    },
    not_established: {
      complete: "NOT_ESTABLISHED",
      security_pass: "NOT_ESTABLISHED",
      control_reference: "NOT_ESTABLISHED",
      scanning: "NOT_ESTABLISHED",
      pin_verification: "NOT_ESTABLISHED",
      loaded_rule_count: "NOT_OBSERVED",
      probe_rule_semantics_and_detection: "NOT_ESTABLISHED",
    },
    evidence_scope: "INDIRECT_SIGNALS_ONLY",
  };
}
