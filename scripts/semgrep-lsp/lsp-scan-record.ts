// LSP-SCAN-1 증거 추적·판정·기록(순수 모듈). 사실(ScanFacts)에서 16개 성공 조건을 평가해 판정을 정하고 기록을 만든다.
// 같은 사실이면 같은 기록이다(시계·무작위 없음). 옛 평가기(evaluate.ts)와 LSP-RULES-1 판정(lsp-rules-record.ts)은 건드리지 않고 이어지지도 않는다.
//
// 계약 정정(브리프 4절): stdout 과 stderr 는 독립된 파이프라 수신 시각이 서버 내부 순서를 말해 주지 않는다. 그래서
//   · 두 스트림 사이의 순서 주장이 없다. 진단 알림이 로그보다 먼저 오든 나중에 오든, 청크가 어떻게 쪼개져 오든, 동시에 오든 완전하고 일관된 증거면 같은 성공이다.
//   · 순서는 각 스트림 **안에서만** 본다(stdout 프레임의 바이트 구간, stderr 로그 묶음의 줄 순서).
//   · `didOpen` 송신 시점의 스트림별 바이트 위치로 사전/사후를 나눈다. 사전 구간의 스캔 증거는 이번 스캔의 증거가 아니다(PRE_OPEN_EVIDENCE).
//   · 성공은 두 묶음(진단 알림 정확히 한 건 + 엔진 로그 묶음)이 **둘 다** `didOpen + scanMs` 안에 완성돼야 한다.
//   · settle 은 늦은 묶음이 완성된 시각(bothCompleteAtMs)에서 시작해 settleMs 동안이다. 이른 쪽에서 거꾸로 세지 않는다.
//
// 증거의 권위는 원문이다: 판정은 원문 바이트 + 청크 시간표 + 표시(didOpen 송신 위치, 장벽 끝)에서 모든 묶음·플래그를 **다시 만든다**(deriveScanEvidence).
// 실행 중 일정을 잡는 용도의 실시간 추적기(ScanEvidenceTracker)는 같은 함수를 먹인 만큼 다시 돌릴 뿐이다. 실행기가 기록한 실시간 보기가 재해석과 다르면
// TRACKER_DISAGREEMENT 이고 성공이 아니다.
//
// 판정의 우선순위(후속 사유가 판정을 뒤집지 않는다):
//   1. 서버를 띄우지 않았다 → NOT_ATTEMPTED
//   2. 실시간 감시가 중단시켰다 → ABORTED:<이름> (SEND_REFUSED · FORBIDDEN_SIGNAL · UNEXPECTED_IMAGE …)
//   3. 관측을 믿을 수 없다(무결성) → NOT_OBSERVED:<사유>
//   4. 관측된 부정적 증거(엔진 오류, 다른 규칙, 필드 불일치, 매치 0건) → SCAN_FAILED:<사유>
//   5. 종료 단계의 사유 → NOT_OBSERVED:<사유>;  5b. settle 감시를 마쳤다는 증거가 없음 → NOT_OBSERVED:SETTLE_WATCH_NOT_CONFIRMED
//   6. 신호 부족·모양 불일치 → NOT_CONFIRMED:<사유>  7. 16개 조건이 모두 PASS → SCAN_RESPONSE_OBSERVED
//
// 성공이 말하는 것의 한계(D10): 합성 입력 한 건의 반응 한 번, 엔진이 받은 규칙 수(부분 관측), 확인된 진단 필드뿐이다. 규칙 일반의 탐지 성능, 실제 저장소 스캔의
// 안전, 음성 대조, 대조 참조 자격, 격리 전체의 효과, 소스↔바이너리 대응, 핀·로그 형식 검증은 계속 NOT_ESTABLISHED 다. 스텁(합성) 결과는 실제 바이너리 검증으로
// 승격하지 않는다.

import type { FrameDecodeError } from "./framing";
import {
  analyzeInitResponse,
  type ArtifactFacts,
  type DescendantResult,
  type InitAnalysis,
  type StreamFacts,
  type WatchedRole,
  type WatchedRootFacts,
} from "./lsp-min";
import {
  MAX_PROGRESS_CREATE,
  PROGRESS_METHOD,
  PUBLISH_DIAGNOSTICS_METHOD,
  RULES_REFRESHED_METHOD,
  rulesRootViolation,
} from "./lsp-rules";
import {
  LSP_SCAN_ARGS,
  LSP_SCAN_DID_OPEN_LANGUAGE_ID,
  LSP_SCAN_DID_OPEN_VERSION,
  LSP_SCAN_LIMITS,
  LSP_SCAN_PROBE_FILE,
  LSP_SCAN_PROBE_SHA256,
  LSP_SCAN_SCHEMA,
  LSP_SCAN_SEND_ORDER,
  LSP_SCAN_TARGET_FILE,
  LSP_SCAN_TARGET_SHA256,
  SCAN_ABORT_NAME,
  SCAN_UNOBSERVED_ALWAYS,
  analyzeScanStdout,
  evaluateScanDiagnostic,
  type ScanAbortCondition,
  type ScanDiagnosticEvaluation,
  type ScanDiagnosticFrame,
  type ScanLimits,
  type ScanSendLabel,
  type ScanStdoutAnalysis,
  type ScanTrigger,
} from "./lsp-scan";
import { PRE_INITIALIZED_KEYS, comparableLoadingPath } from "./rules-log";
import {
  analyzeScanLog,
  type ScanLogAnalysis,
  type ScanLogKey,
  type ScanLogLine,
} from "./scan-log";
import { compareScanUri, type ScanUriComparison } from "./scan-uri";
import { sha256Hex } from "./sha";
import type { Provenance } from "./types";

// ── 사실 ──────────────────────────────────────────────────────────

export type ScanStream = "stdout" | "stderr";

/** 청크 시간표의 한 항목: 그 스트림에서 `offset`부터 `length` 바이트가 `tMs`(하니스 단조 시계)에 도착했다. */
export interface ScanChunk {
  stream: ScanStream;
  offset: number;
  length: number;
  tMs: number;
}

/** `didOpen`을 쓰기 직전의 시각과 스트림별로 이미 읽은 바이트 수. 사전/사후를 나누는 기준이다. */
export interface ScanDidOpenMarker {
  tMs: number;
  stdoutOffset: number;
  stderrOffset: number;
}

export interface ScanSendFact {
  label: ScanSendLabel;
  tMs: number;
  ok: boolean;
  /** 쓰기 직전까지 읽은 stderr·stdout 바이트 수. 모르면 null. */
  stderrBytesAtSend: number | null;
  stdoutBytesAtSend: number | null;
  /** `didOpen`만: 실제로 보낸 내용의 요약(본문은 sha256 만). */
  didOpen?: {
    uri: string | null;
    languageId: string | null;
    version: number | null;
    textSha256: string | null;
  } | null;
}

export interface ScanTargetFacts {
  /** 러너에 전달된 원본 바이트의 sha256. */
  sourceSha256: string | null;
  /** 작업 영역에 쓴 직후 그 파일의 sha256. */
  afterWriteSha256: string | null;
  /** 실행이 끝난 뒤 그 파일의 sha256. */
  afterRunSha256: string | null;
}

export interface ScanProbeFacts {
  sourceSha256: string | null;
  afterCopySha256: string | null;
  afterRunSha256: string | null;
}

/** 실행기가 기록한 실시간 추적기의 마지막 보기(재해석과 대조한다). */
export interface ScanLiveView {
  preOpenEvidence: boolean;
  diagnosticsState: ScanDiagnosticsState;
  diagnosticsCompleteAtMs: number | null;
  logState: ScanLogState;
  logCompleteAtMs: number | null;
  bothCompleteAtMs: number | null;
}

export interface ScanRecoveryFacts {
  status: string;
  detail: string[];
}

export interface ScanFacts {
  runId: string;
  provenance: Provenance | null;
  refusals: string[];
  limits: ScanLimits;
  expectedVersion: string | null;
  /** 로딩 줄의 경로와 비교할 프로브 파일의 전체 경로. */
  probePath: string | null;
  /** 설정된 작업 영역 폴더(외부 명령 줄의 경로 비교용). */
  workspace: string | null;
  /** 진단 URI 비교의 기대값(= didOpen 의 uri). */
  expectedTargetUri: string | null;
  spawn: { attempted: boolean; ok: boolean; pid: number | null };
  sends: ScanSendFact[];
  stdout: StreamFacts;
  stderr: StreamFacts;
  /** 청크 시간표. 없으면(null) 시각 판단을 하지 않는다. */
  chunks: ScanChunk[] | null;
  markers: { barrierDoneAtMs: number | null; didOpenSent: ScanDidOpenMarker | null };
  liveView: ScanLiveView | null;
  frameError: FrameDecodeError | null;
  initResponseAtMs: number | null;
  /** settle 감시를 마친 시각. 두 묶음 완성 시각 + settleMs 이후여야 한다. */
  settle: { endedAtMs: number | null };
  exit: { observed: boolean; code: number | null; signal: string | null; tMs: number | null };
  stdinClosed: { byHarness: boolean; ok: boolean | null; tMs: number | null };
  kill: { count: number; firstTMs: number | null; confirmed: boolean | null };
  trigger: ScanTrigger | null;
  also: ScanTrigger[];
  abort: { condition: ScanAbortCondition; detail: string; tMs: number } | null;
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
  probe: ScanProbeFacts;
  target: ScanTargetFacts;
  artifacts: ArtifactFacts[];
  /** 자식에게 준 PATH **값**과 작업 폴더(계획 3.6절의 빈틈). 모르면 null. */
  childEnv: { path: string | null; workingDirectory: string | null };
  /** 이 모듈 밖에서 정한, 관측 성립을 막는 사유 토큰(관리자 쪽 신원·결합·OS 차단·러너 결과 형식 등). */
  externalReasons?: readonly string[];
  /** 시스템 복구 결과(기록에 따로 싣는다; 관측 판정에 영향을 주지 않는다). 모르면 null. */
  recovery: ScanRecoveryFacts | null;
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

// ── 공통 작은 도구 ────────────────────────────────────────────────

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
/** 바이트 수로 쓸 수 있는 값인가(유한한 0 이상의 정수). null·NaN·무한·음수·소수는 "모름"이다. */
function isByteOffset(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
/** 읽은 해시가 비교할 수 있는 값인가. null·빈 문자열은 "읽지 못함"이다. */
function hashUsable(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
function tokenOf(text: string): string {
  return String(text)
    .replace(/[^A-Za-z0-9_.:/ -]/g, "?")
    .slice(0, 80);
}
function upperKey(key: string): string {
  return key.replace(/([A-Z])/g, "_$1").toUpperCase();
}
const MAX_LISTED = 50;
function capped(items: readonly string[]): string[] {
  return items.length <= MAX_LISTED
    ? [...items]
    : [...items.slice(0, MAX_LISTED), `+${items.length - MAX_LISTED}`];
}

function validDidOpen(marker: unknown): ScanDidOpenMarker | null {
  if (typeof marker !== "object" || marker === null) return null;
  const m = marker as Record<string, unknown>;
  if (!isFiniteNumber(m.tMs) || !isByteOffset(m.stdoutOffset) || !isByteOffset(m.stderrOffset)) {
    return null;
  }
  return { tMs: m.tMs, stdoutOffset: m.stdoutOffset, stderrOffset: m.stderrOffset };
}

// ── 청크 시간표 ───────────────────────────────────────────────────

/** 시간표가 두 스트림의 원문 전체를 빈틈·겹침 없이 덮고 시각이 스트림 안에서 줄지 않는지. 문제 토큰의 목록(빈 배열이면 유효). */
function validateChunks(chunks: unknown, stdoutLen: number, stderrLen: number): string[] {
  if (!Array.isArray(chunks)) return ["CHUNKS_MISSING"];
  const problems: string[] = [];
  const next: Record<ScanStream, number> = { stdout: 0, stderr: 0 };
  const lastT: Record<ScanStream, number> = { stdout: -Infinity, stderr: -Infinity };
  for (const raw of chunks as unknown[]) {
    if (typeof raw !== "object" || raw === null) {
      problems.push("CHUNK_MALFORMED");
      continue;
    }
    const c = raw as Record<string, unknown>;
    if (c.stream !== "stdout" && c.stream !== "stderr") {
      problems.push("CHUNK_STREAM_UNKNOWN");
      continue;
    }
    const stream = c.stream;
    if (!isByteOffset(c.offset) || !isByteOffset(c.length) || c.length === 0) {
      problems.push("CHUNK_SIZE_INVALID");
      continue;
    }
    if (c.offset !== next[stream]) problems.push("CHUNK_NOT_CONTIGUOUS");
    next[stream] = c.offset + c.length;
    if (!isFiniteNumber(c.tMs) || c.tMs < 0) problems.push("CHUNK_TIME_INVALID");
    else if (c.tMs < lastT[stream]) problems.push("CHUNK_TIME_DECREASING");
    else lastT[stream] = c.tMs;
  }
  if (next.stdout !== stdoutLen) problems.push("CHUNK_TOTAL_MISMATCH:stdout");
  if (next.stderr !== stderrLen) problems.push("CHUNK_TOTAL_MISMATCH:stderr");
  return [...new Set(problems)];
}

/** 그 스트림의 앞 `endExclusive` 바이트가 모두 도착한 시각(= 그 바이트를 담은 청크의 시각). 아직 다 안 왔으면 null. */
function timeOfEnd(
  chunks: readonly ScanChunk[],
  stream: ScanStream,
  endExclusive: number
): number | null {
  for (const c of chunks) {
    if (c.stream === stream && c.offset + c.length >= endExclusive) return c.tMs;
  }
  return null;
}

// ── 증거 다시 만들기 ──────────────────────────────────────────────

export type ScanDiagnosticsState = "NONE" | "ONE" | "MULTIPLE";
export type ScanLogState = "INCOMPLETE" | "COMPLETE" | "VIOLATED";
export type ScanExtraPhase = "BEFORE_BOTH" | "SETTLE" | "AFTER_SETTLE" | "UNKNOWN";

export interface ScanEvidenceInput {
  stdout: Uint8Array;
  stderr: Uint8Array;
  chunks: readonly ScanChunk[] | null;
  didOpen: ScanDidOpenMarker | null;
  barrierDoneAtMs: number | null;
  workspace: string | null;
  expectedTargetUri: string | null;
  scanMs: number;
  settleMs: number;
  stdoutEof: boolean;
}

export interface ScanExtraEvent {
  source: ScanStream;
  kind: string;
  key: string | null;
  atMs: number | null;
  phase: ScanExtraPhase;
}

export interface ScanEvidence {
  timeline: { valid: boolean; problems: string[] };
  didOpen: ScanDidOpenMarker | null;
  barrierDoneAtMs: number | null;
  deadlineAtMs: number | null;
  stdout: ScanStdoutAnalysis;
  log: ScanLogAnalysis;
  preOpen: { evidence: boolean; logKeys: ScanLogKey[]; stdoutDiagnosticFrames: number };
  frames: {
    post: ScanDiagnosticFrame[];
    validPost: ScanDiagnosticFrame[];
    malformedPost: ScanDiagnosticFrame[];
  };
  diagnostics: {
    state: ScanDiagnosticsState;
    count: number;
    completeAtMs: number | null;
    late: boolean;
  };
  logBundle: {
    state: ScanLogState;
    seenAll: boolean;
    complete: boolean;
    completeAtMs: number | null;
    completeEndByte: number | null;
    late: boolean;
  };
  bothCompleteAtMs: number | null;
  settle: { startMs: number | null; endMs: number | null };
  extras: ScanExtraEvent[];
  postOpenServerRequests: number;
  postOpenProgressNotifications: number;
}

/**
 * 원문 바이트 + 청크 시간표 + 표시에서 모든 묶음·플래그를 다시 만든다(권위 있는 경로). 시계·무작위 없음.
 * 시간표가 유효하지 않으면 모든 시각이 null 이다 — 시각을 지어내지 않는다.
 */
export function deriveScanEvidence(input: ScanEvidenceInput): ScanEvidence {
  const didOpen = validDidOpen(input.didOpen);
  const stdout = analyzeScanStdout(input.stdout, input.stdoutEof === true);
  const log = analyzeScanLog(input.stderr, {
    workspace: input.workspace,
    didOpenOffset: didOpen === null ? null : didOpen.stderrOffset,
  });
  const timelineProblems = validateChunks(
    input.chunks,
    input.stdout.byteLength,
    input.stderr.byteLength
  );
  const timelineValid = timelineProblems.length === 0;
  const chunks = (timelineValid ? input.chunks : null) as readonly ScanChunk[] | null;
  const at = (stream: ScanStream, endExclusive: number | null): number | null =>
    chunks === null || endExclusive === null ? null : timeOfEnd(chunks, stream, endExclusive);

  const deadlineAtMs =
    didOpen !== null && isFiniteNumber(input.scanMs) ? didOpen.tMs + input.scanMs : null;
  const settleMs = isFiniteNumber(input.settleMs) ? input.settleMs : null;

  // stdout 프레임: 첫 바이트가 didOpen 의 stdout 위치 이후이면 사후다.
  const stdoutOffset = didOpen === null ? null : didOpen.stdoutOffset;
  const isPost = (frame: { startByte: number }): boolean =>
    stdoutOffset !== null && frame.startByte >= stdoutOffset;
  const preDiag = stdout.diagnosticFrames.filter((f) => !isPost(f));
  const post = stdout.diagnosticFrames.filter(isPost);
  const validPost = post.filter((f) => f.shapeOk);
  const malformedPost = post.filter((f) => !f.shapeOk);

  const diagCompleteAtMs = validPost.length > 0 ? at("stdout", validPost[0].endByte) : null;
  const diagState: ScanDiagnosticsState =
    validPost.length === 0 ? "NONE" : validPost.length === 1 ? "ONE" : "MULTIPLE";

  const bundle = log.post.bundle;
  const logState: ScanLogState = !bundle.seenAll
    ? "INCOMPLETE"
    : bundle.complete
      ? "COMPLETE"
      : "VIOLATED";
  const logCompleteAtMs =
    bundle.completeEndByte !== null ? at("stderr", bundle.completeEndByte) : null;

  const both =
    diagCompleteAtMs !== null && logCompleteAtMs !== null
      ? Math.max(diagCompleteAtMs, logCompleteAtMs)
      : null;
  const settle =
    both === null || settleMs === null
      ? { startMs: null, endMs: null }
      : { startMs: both, endMs: both + settleMs };
  const late = (t: number | null): boolean =>
    t !== null && deadlineAtMs !== null && t > deadlineAtMs;

  const phaseOf = (atMs: number | null): ScanExtraPhase => {
    if (atMs === null || settle.startMs === null || settle.endMs === null) return "UNKNOWN";
    if (atMs <= settle.startMs) return "BEFORE_BOTH";
    return atMs <= settle.endMs ? "SETTLE" : "AFTER_SETTLE";
  };
  const extras: ScanExtraEvent[] = [];
  const addExtra = (
    source: ScanStream,
    kind: string,
    key: string | null,
    atMs: number | null
  ): void => {
    extras.push({ source, kind, key, atMs, phase: phaseOf(atMs) });
  };
  validPost
    .slice(1)
    .forEach((f) => addExtra("stdout", "DUPLICATE_DIAGNOSTICS", null, at("stdout", f.endByte)));
  malformedPost.forEach((f) =>
    addExtra("stdout", "DIAGNOSTIC_FRAME_MALFORMED", null, at("stdout", f.endByte))
  );
  const postFrames = stdout.frameList.filter(isPost);
  const requestsAfter = postFrames.filter((f) => f.kind === "server-request");
  requestsAfter.forEach((f) =>
    addExtra("stdout", "SERVER_REQUEST_AFTER_DID_OPEN", f.method, at("stdout", f.endByte))
  );
  let progressAfter = 0;
  for (const f of postFrames) {
    if (f.kind !== "notification") continue;
    if (f.method === PROGRESS_METHOD) progressAfter += 1;
    else if (f.method !== PUBLISH_DIAGNOSTICS_METHOD) {
      addExtra(
        "stdout",
        "UNEXPECTED_NOTIFICATION_AFTER_DID_OPEN",
        f.method,
        at("stdout", f.endByte)
      );
    }
  }
  for (const e of [...log.pre.extras, ...log.post.extras]) {
    addExtra("stderr", e.kind, e.key, at("stderr", e.endByte));
  }

  const preKeys = log.pre.scanEvidence;
  return {
    timeline: { valid: timelineValid, problems: timelineProblems },
    didOpen,
    barrierDoneAtMs: isFiniteNumber(input.barrierDoneAtMs) ? input.barrierDoneAtMs : null,
    deadlineAtMs,
    stdout,
    log,
    preOpen: {
      evidence: preKeys.length > 0 || preDiag.length > 0,
      logKeys: [...preKeys],
      stdoutDiagnosticFrames: preDiag.length,
    },
    frames: { post, validPost, malformedPost },
    diagnostics: {
      state: diagState,
      count: validPost.length,
      completeAtMs: diagCompleteAtMs,
      late: late(diagCompleteAtMs),
    },
    logBundle: {
      state: logState,
      seenAll: bundle.seenAll,
      complete: bundle.complete,
      completeAtMs: logCompleteAtMs,
      completeEndByte: bundle.completeEndByte,
      late: late(logCompleteAtMs),
    },
    bothCompleteAtMs: both,
    settle,
    extras,
    postOpenServerRequests: requestsAfter.length,
    postOpenProgressNotifications: progressAfter,
  };
}

// ── 실시간 추적기 ─────────────────────────────────────────────────

export interface ScanEvidenceConfig {
  workspace: string | null;
  expectedTargetUri: string | null;
  scanMs: number;
  settleMs: number;
}

export interface ScanTrackerSnapshot extends ScanLiveView {
  deadlineAtMs: number | null;
  /** nowMs 가 마감을 넘었고 두 묶음이 아직 완성되지 않았다. nowMs 를 모르면 false. */
  deadlineExpired: boolean;
  settleStartMs: number | null;
  settleEndMs: number | null;
  /** nowMs 가 settle 창의 끝에 닿았다. */
  settleElapsed: boolean;
  extras: ScanExtraEvent[];
  /** 실시간에 알 수 있는 위반 토큰(정렬됨). 실행기가 중단 여부를 정하는 데 쓴다. */
  violations: string[];
}

const VIOLATION_OF_EXTRA: Readonly<Record<string, string>> = Object.freeze({
  DUPLICATE_LINE: "EXTRA_SCAN",
  OPEN_DOCUMENTS_SCAN: "EXTRA_SCAN",
  RULES_REFRESH: "EXTRA_SCAN",
  DUPLICATE_DIAGNOSTICS: "EXTRA_SCAN",
  WORKSPACE_SCAN: "FORBIDDEN_SIGNAL",
  FORBIDDEN_NETWORK: "FORBIDDEN_SIGNAL",
  SERVER_REQUEST_AFTER_DID_OPEN: "SERVER_REQUEST_AFTER_DID_OPEN",
  UNEXPECTED_NOTIFICATION_AFTER_DID_OPEN: "UNEXPECTED_NOTIFICATION",
  DIAGNOSTIC_FRAME_MALFORMED: "DIAGNOSTIC_FRAME_MALFORMED",
  ERROR_RECORD: "ENGINE_ERROR",
  ENGINE_ERRORS_NONEMPTY: "ENGINE_ERROR",
  SKIPPED_RULES_NONZERO: "ENGINE_ERROR",
  SKIPPING_RULE: "ENGINE_ERROR",
  NO_TARGETS: "NO_TARGET",
  FILE_NOT_IN_TARGETS: "NO_TARGET",
  NO_RULES: "NO_RULES",
  RULES_NOT_LOADED: "RULES_NOT_LOADED",
  UNEXPECTED_WARNING: "UNEXPECTED_WARNING",
  ERROR_OUTPUT: "EXTERNAL_COMMAND_OUTPUT",
});

function liveViolations(ev: ScanEvidence): string[] {
  const out = new Set<string>();
  if (ev.preOpen.evidence) out.add("PRE_OPEN_EVIDENCE");
  for (const e of ev.extras) {
    const v = VIOLATION_OF_EXTRA[e.kind];
    if (v !== undefined) out.add(v);
  }
  if (ev.log.post.bundle.orderViolations.length > 0) out.add("ORDER_VIOLATION");
  for (const p of ev.log.externalCommand.problems) {
    if (p === "EXTERNAL_COMMAND_SHAPE" || p === "EXTERNAL_COMMAND_COUNT") out.add(p);
  }
  return [...out].sort();
}

/**
 * 청크를 먹이는 대로 같은 순간에 같은 상태가 되는 증분 추적기. 상태는 deriveScanEvidence 와 **같은 함수**로 만든다(원문 + 시간표 + 표시).
 * 실행 중에는 일정(settle·shutdown)을 잡는 데만 쓰고, 판정은 사후 재해석이 한다.
 */
export class ScanEvidenceTracker {
  private stdoutParts: Uint8Array[] = [];
  private stderrParts: Uint8Array[] = [];
  private stdoutLen = 0;
  private stderrLen = 0;
  private readonly chunks: ScanChunk[] = [];
  private didOpen: ScanDidOpenMarker | null = null;
  private barrierDoneAtMs: number | null = null;
  private cache: ScanEvidence | null = null;

  constructor(private readonly config: ScanEvidenceConfig) {}

  feedStdout(bytes: Uint8Array, tMs: number): void {
    this.feed("stdout", bytes, tMs);
  }
  feedStderr(bytes: Uint8Array, tMs: number): void {
    this.feed("stderr", bytes, tMs);
  }

  private feed(stream: ScanStream, bytes: Uint8Array, tMs: number): void {
    if (bytes.byteLength === 0) return;
    const copy = Uint8Array.from(bytes);
    if (stream === "stdout") {
      this.chunks.push({ stream, offset: this.stdoutLen, length: copy.byteLength, tMs });
      this.stdoutParts.push(copy);
      this.stdoutLen += copy.byteLength;
    } else {
      this.chunks.push({ stream, offset: this.stderrLen, length: copy.byteLength, tMs });
      this.stderrParts.push(copy);
      this.stderrLen += copy.byteLength;
    }
    this.cache = null;
  }

  /** 규칙 로딩 장벽을 넘은 시각을 적는다. */
  markBarrierDone(tMs: number): void {
    this.barrierDoneAtMs = tMs;
    this.cache = null;
  }

  /** `didOpen`을 쓰기 직전에 부른다: 그 순간 두 스트림에서 이미 읽은 바이트 수를 위치로 기록한다. 처음 한 번만 기록한다. */
  markDidOpenSent(tMs: number): void {
    if (this.didOpen !== null) return;
    this.didOpen = { tMs, stdoutOffset: this.stdoutLen, stderrOffset: this.stderrLen };
    this.cache = null;
  }

  /** 지금까지의 원문·시간표·표시(= 사실에 그대로 싣는 값). */
  toEvidenceInput(): ScanEvidenceInput {
    const join = (parts: Uint8Array[], len: number): Uint8Array => {
      const out = new Uint8Array(len);
      let at = 0;
      for (const p of parts) {
        out.set(p, at);
        at += p.byteLength;
      }
      return out;
    };
    return {
      stdout: join(this.stdoutParts, this.stdoutLen),
      stderr: join(this.stderrParts, this.stderrLen),
      chunks: this.chunks.map((c) => ({ ...c })),
      didOpen: this.didOpen === null ? null : { ...this.didOpen },
      barrierDoneAtMs: this.barrierDoneAtMs,
      workspace: this.config.workspace,
      expectedTargetUri: this.config.expectedTargetUri,
      scanMs: this.config.scanMs,
      settleMs: this.config.settleMs,
      stdoutEof: false,
    };
  }

  /** 지금까지의 증거(재해석과 같은 함수의 결과). */
  evidence(): ScanEvidence {
    this.cache ??= deriveScanEvidence(this.toEvidenceInput());
    return this.cache;
  }

  snapshot(nowMs: number | null = null): ScanTrackerSnapshot {
    const ev = this.evidence();
    const known = isFiniteNumber(nowMs);
    return {
      preOpenEvidence: ev.preOpen.evidence,
      diagnosticsState: ev.diagnostics.state,
      diagnosticsCompleteAtMs: ev.diagnostics.completeAtMs,
      logState: ev.logBundle.state,
      logCompleteAtMs: ev.logBundle.completeAtMs,
      bothCompleteAtMs: ev.bothCompleteAtMs,
      deadlineAtMs: ev.deadlineAtMs,
      deadlineExpired:
        known &&
        ev.deadlineAtMs !== null &&
        nowMs > ev.deadlineAtMs &&
        ev.bothCompleteAtMs === null,
      settleStartMs: ev.settle.startMs,
      settleEndMs: ev.settle.endMs,
      settleElapsed: known && ev.settle.endMs !== null && nowMs >= ev.settle.endMs,
      extras: ev.extras.map((e) => ({ ...e })),
      violations: liveViolations(ev),
    };
  }
}

// ── 해석 ──────────────────────────────────────────────────────────

export interface ScanFrameVerdict {
  frame: ScanDiagnosticFrame;
  uri: ScanUriComparison;
  diagnosticsCount: number;
}

export interface ScanParsed {
  stdout: ScanStdoutAnalysis;
  log: ScanLogAnalysis;
  evidence: ScanEvidence;
  init: InitAnalysis | null;
  initErrorLogged: boolean;
  networkWordSeen: boolean;
  frames: ScanFrameVerdict[];
  matchFrames: ScanFrameVerdict[];
  differentFrames: ScanFrameVerdict[];
  rejectedFrames: ScanFrameVerdict[];
  /** 대상 URI 알림이 정확히 한 건이고 진단이 정확히 한 개일 때만 그 대조 결과. */
  single: ScanDiagnosticEvaluation | null;
  /** 모든 사후 알림의 진단 수 합(대상 URI 와 무관). */
  totalPostDiagnostics: number;
  limitsProblems: string[];
  tracker: { provided: boolean; disagreements: string[] };
}

const NETWORK_WORDS = ["download", "registry"];

function limitsProblemsOf(limits: unknown): string[] {
  if (typeof limits !== "object" || limits === null) return ["LIMITS_MISSING"];
  const out: string[] = [];
  const rec = limits as Record<string, unknown>;
  for (const key of Object.keys(LSP_SCAN_LIMITS) as (keyof ScanLimits)[]) {
    const v = rec[key];
    if (!isFiniteNumber(v) || v <= 0 || v > LSP_SCAN_LIMITS[key]) out.push(`LIMIT_INVALID:${key}`);
  }
  return out;
}

function trackerDisagreements(live: ScanLiveView, ev: ScanEvidence): string[] {
  const derived: ScanLiveView = {
    preOpenEvidence: ev.preOpen.evidence,
    diagnosticsState: ev.diagnostics.state,
    diagnosticsCompleteAtMs: ev.diagnostics.completeAtMs,
    logState: ev.logBundle.state,
    logCompleteAtMs: ev.logBundle.completeAtMs,
    bothCompleteAtMs: ev.bothCompleteAtMs,
  };
  const out: string[] = [];
  const rec = live as unknown as Record<string, unknown>;
  for (const key of Object.keys(derived) as (keyof ScanLiveView)[]) {
    if (rec[key] !== derived[key]) out.push(`TRACKER_DISAGREEMENT:${key}`);
  }
  return out;
}

export function parseScanFacts(f: ScanFacts): ScanParsed {
  const evidence = deriveScanEvidence({
    stdout: f.stdout.bytes,
    stderr: f.stderr.bytes,
    chunks: f.chunks,
    didOpen: f.markers?.didOpenSent ?? null,
    barrierDoneAtMs: f.markers?.barrierDoneAtMs ?? null,
    workspace: f.workspace,
    expectedTargetUri: f.expectedTargetUri,
    scanMs: f.limits?.scanMs,
    settleMs: f.limits?.settleMs,
    stdoutEof: f.stdout.eof,
  });
  const lower = new TextDecoder("utf-8", { fatal: false, ignoreBOM: true })
    .decode(f.stderr.bytes)
    .toLowerCase();
  const expected = typeof f.expectedTargetUri === "string" ? f.expectedTargetUri : "";
  const frames: ScanFrameVerdict[] = evidence.frames.validPost.map((frame) => ({
    frame,
    uri: compareScanUri(frame.uri, expected),
    diagnosticsCount: frame.diagnostics === null ? 0 : frame.diagnostics.length,
  }));
  const matchFrames = frames.filter((x) => x.uri.result === "MATCH");
  const single =
    matchFrames.length === 1 && matchFrames[0].diagnosticsCount === 1
      ? evaluateScanDiagnostic((matchFrames[0].frame.diagnostics as unknown[])[0])
      : null;
  const live = f.liveView;
  return {
    stdout: evidence.stdout,
    log: evidence.log,
    evidence,
    init:
      evidence.stdout.initMessage === null
        ? null
        : analyzeInitResponse(evidence.stdout.initMessage),
    initErrorLogged: lower.includes("error initializing server"),
    networkWordSeen: NETWORK_WORDS.some((w) => lower.includes(w)),
    frames,
    matchFrames,
    differentFrames: frames.filter((x) => x.uri.result === "DIFFERENT"),
    rejectedFrames: frames.filter((x) => x.uri.result === "REJECTED"),
    single,
    totalPostDiagnostics: frames.reduce((n, x) => n + x.diagnosticsCount, 0),
    limitsProblems: limitsProblemsOf(f.limits),
    tracker:
      live === null || live === undefined
        ? { provided: false, disagreements: [] }
        : { provided: true, disagreements: trackerDisagreements(live, evidence) },
  };
}

// ── 판정 ──────────────────────────────────────────────────────────

export type ScanStatus =
  "OBSERVED" | "SCAN_FAILED" | "NOT_CONFIRMED" | "ABORTED" | "NOT_OBSERVED" | "NOT_ATTEMPTED";

export interface ConditionResult {
  id: number;
  name: string;
  result: "PASS" | "FAIL" | "NOT_EVALUATED";
  /** 실패·평가 불가 사유 토큰. 값(경로·내용)은 싣지 않는다. */
  detail: string[];
}

export interface ScanJudgement {
  status: ScanStatus;
  /** `SCAN_RESPONSE_OBSERVED` 또는 `<STATUS>:<사유>`. */
  verdict: string;
  reasons: string[];
  conditions: ConditionResult[];
}

export const SCAN_CONDITION_NAMES: readonly string[] = Object.freeze([
  "PRECONDITIONS_AND_HASHES",
  "INITIALIZE_VALID_AND_VERSION_MATCH",
  "INITIALIZED_SENT_ONCE_AFTER_VALID_INIT",
  "RULES_BARRIER_BEFORE_DID_OPEN",
  "DID_OPEN_ONCE_AFTER_BARRIER_EXACT_CONTENT",
  "SINGLE_FILE_SCAN_STARTED_ONCE",
  "ENGINE_LOG_BUNDLE_COMPLETE_IN_ORDER",
  "ONE_DIAGNOSTIC_NOTIFICATION",
  "DIAGNOSTIC_FIELDS_MATCH",
  "LOG_AND_NOTIFICATION_CONSISTENT",
  "NO_OTHER_NOTIFICATIONS_REQUESTS_OR_ERRORS",
  "BOTH_BUNDLES_WITHIN_SCAN_MS",
  "SETTLE_WATCH_FROM_LATER_BUNDLE",
  "FILES_UNCHANGED_AS_EXPECTED",
  "NO_NETWORK_FORBIDDEN_IMAGE_OR_EXTERNAL_COMMAND_VIOLATION",
  "SHUTDOWN_EXIT_SELF_EXIT_ZERO",
]);

const RECEIVER_OS_PREFIX = "ADMIN_OS_BLOCK_";

function versionComparison(
  expected: string | null,
  init: InitAnalysis | null
): "MATCH" | "MISMATCH" | "NOT_OBSERVED" | "NOT_GIVEN" {
  if (expected === null) return "NOT_GIVEN";
  const version = init?.serverInfo?.version ?? null;
  if (version === null) return "NOT_OBSERVED";
  return version === expected ? "MATCH" : "MISMATCH";
}

function initVerdict(p: ScanParsed): "VALID" | "INVALID" | "NONE" {
  if (p.init === null) return "NONE";
  return p.init.reasons.length === 0 && !p.initErrorLogged ? "VALID" : "INVALID";
}

function hashToken(
  actual: unknown,
  expected: string,
  changed: string,
  unknown: string
): string | null {
  if (!hashUsable(actual)) return unknown;
  return actual === expected ? null : changed;
}

const isChangedFileToken = (t: string): boolean =>
  CHANGED_FILE_TOKENS.has(t) || t.startsWith("ARTIFACT_HASH_CHANGED");

const CHANGED_FILE_TOKENS = new Set([
  "TARGET_SOURCE_HASH_CHANGED",
  "TARGET_WRITE_HASH_CHANGED",
  "TARGET_CHANGED_DURING_RUN",
  "PROBE_SOURCE_HASH_CHANGED",
  "PROBE_COPY_HASH_CHANGED",
  "PROBE_CHANGED_DURING_RUN",
  "WORKSPACE_NOT_EXACTLY_TARGET",
  "RULES_DIR_NOT_EXACTLY_PROBE",
  "HOME_UNEXPECTED_WRITE",
]);

function logLines(p: ScanParsed, segment: ScanLogLine["segment"], key: ScanLogKey): ScanLogLine[] {
  return p.log.lines.filter((l) => l.segment === segment && l.key === key);
}

function evaluate(f: ScanFacts, p: ScanParsed): ConditionResult[] {
  const ev = p.evidence;
  const log = p.log;
  const results: ConditionResult[] = SCAN_CONDITION_NAMES.map((name, i) => ({
    id: i + 1,
    name,
    result: "NOT_EVALUATED",
    detail: [],
  }));
  const set = (id: number, ok: boolean, detail: string[] = []): void => {
    const r = results[id - 1];
    r.result = ok ? "PASS" : "FAIL";
    r.detail = ok ? [] : detail.length > 0 ? [...new Set(detail)] : ["FAILED"];
  };
  if (!f.spawn.ok) return results;
  const didOpen = ev.didOpen;
  const sendsOf = (label: ScanSendLabel): ScanSendFact[] =>
    f.sends.filter((s) => s.label === label);

  // 1. 사전 조건·설치물·전달된 파일의 해시
  {
    const d: string[] = [];
    for (const r of f.externalReasons ?? []) if (!r.startsWith(RECEIVER_OS_PREFIX)) d.push(r);
    for (const a of f.artifacts) {
      if (!hashUsable(a.before) || !hashUsable(a.after))
        d.push(`ARTIFACT_NOT_COMPARED:${tokenOf(a.label)}`);
      else if (a.before !== a.after) d.push(`ARTIFACT_HASH_CHANGED:${tokenOf(a.label)}`);
    }
    if (f.refusals.length > 0) d.push("REFUSED");
    for (const t of [
      hashToken(
        f.target?.sourceSha256,
        LSP_SCAN_TARGET_SHA256,
        "TARGET_SOURCE_HASH_CHANGED",
        "TARGET_SOURCE_HASH_UNKNOWN"
      ),
      hashToken(
        f.target?.afterWriteSha256,
        LSP_SCAN_TARGET_SHA256,
        "TARGET_WRITE_HASH_CHANGED",
        "TARGET_WRITE_HASH_UNKNOWN"
      ),
      hashToken(
        f.probe?.sourceSha256,
        LSP_SCAN_PROBE_SHA256,
        "PROBE_SOURCE_HASH_CHANGED",
        "PROBE_SOURCE_HASH_UNKNOWN"
      ),
      hashToken(
        f.probe?.afterCopySha256,
        LSP_SCAN_PROBE_SHA256,
        "PROBE_COPY_HASH_CHANGED",
        "PROBE_COPY_HASH_UNKNOWN"
      ),
    ]) {
      if (t !== null) d.push(t);
    }
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
  const initializedSends = sendsOf("initialized");
  const initializeSend = sendsOf("initialize")[0];
  {
    const d: string[] = [];
    if (initializedSends.length !== 1) d.push(`INITIALIZED_SENDS_${initializedSends.length}`);
    else {
      const s = initializedSends[0];
      if (!s.ok) d.push("INITIALIZED_WRITE_FAILED");
      if (initializeSend === undefined || initializeSend.tMs > s.tMs)
        d.push("INITIALIZED_BEFORE_INITIALIZE");
      if (!isFiniteNumber(f.initResponseAtMs) || f.initResponseAtMs > s.tMs) {
        d.push("INITIALIZED_BEFORE_INIT_RESPONSE");
      }
      if (s.ok && (!isByteOffset(s.stderrBytesAtSend) || !isByteOffset(s.stdoutBytesAtSend))) {
        d.push("INITIALIZED_OFFSET_UNKNOWN");
      }
      if (isByteOffset(s.stdoutBytesAtSend)) {
        const prefix = f.stdout.bytes.subarray(0, s.stdoutBytesAtSend);
        if (prefix.byteLength > 0) {
          const before = analyzeScanStdout(prefix, true);
          if (before.frames !== 1 || before.initMessage === null || before.frameError !== null) {
            d.push("PRE_INITIALIZED_STDOUT_MESSAGE");
          }
        }
      }
    }
    if (init !== "VALID" || version !== "MATCH") d.push("INITIALIZED_WITHOUT_VALID_INIT_AND_MATCH");
    set(3, d.length === 0, d);
  }

  // 4. 규칙 로딩 장벽(사전 구간): 새로고침 알림 1회, 맨줄 4개 순서, 프로브 로딩 쌍, Got 0 errors, No targets 1회, 네트워크·토큰 없음
  {
    const d: string[] = [];
    const refreshed = ev.stdout.frameList.filter((x) => x.method === RULES_REFRESHED_METHOD);
    if (ev.stdout.rulesRefreshedCount !== 1)
      d.push(`RULES_REFRESHED_COUNT_${ev.stdout.rulesRefreshedCount}`);
    const bare = (
      [
        "refreshingRules",
        "rulesRefreshed",
        "scanningOpenDocuments",
        "scannedOpenDocuments",
      ] as ScanLogKey[]
    ).map((key) => logLines(p, "PRE_OPEN", key));
    const names = [
      "refreshingRules",
      "rulesRefreshed",
      "scanningOpenDocuments",
      "scannedOpenDocuments",
    ];
    bare.forEach((lines, i) => {
      const ok = lines.filter((l) => l.shape === "OK" && l.terminated);
      if (ok.length !== 1 || lines.length !== 1) d.push(`${names[i]}_COUNT_${ok.length}`);
    });
    const okAt = bare.map(
      (lines) => lines.find((l) => l.shape === "OK" && l.terminated)?.startByte ?? null
    );
    if (okAt.every((x) => x !== null)) {
      const at = okAt as number[];
      for (let i = 1; i < at.length; i += 1) if (at[i] <= at[i - 1]) d.push("ORDER");
    }
    const loading = logLines(p, "PRE_OPEN", "loading").filter((l) => l.shape === "OK");
    const done = logLines(p, "PRE_OPEN", "doneLoading").filter((l) => l.shape === "OK");
    const wantPath = f.probePath === null ? null : comparableLoadingPath(f.probePath);
    if (loading.length !== 1) d.push(`LOADING_COUNT_${loading.length}`);
    if (done.length !== 1) d.push(`DONE_LOADING_COUNT_${done.length}`);
    for (const s of [...loading, ...done]) {
      if (wantPath === null || comparableLoadingPath(String(s.params.path)) !== wantPath) {
        d.push("LOADING_PATH_UNEXPECTED");
        break;
      }
    }
    if (loading.length === 1 && done.length === 1) {
      if (loading[0].startByte >= done[0].startByte) d.push("ORDER");
      if (okAt[0] !== null && okAt[1] !== null) {
        for (const s of [loading[0], done[0]]) {
          if (s.startByte < (okAt[0] as number) || s.startByte > (okAt[1] as number))
            d.push("ORDER");
        }
      }
    }
    const got = logLines(p, "PRE_OPEN", "gotErrors").filter((l) => l.shape === "OK");
    if (got.length !== 1) d.push(`GOT_ERRORS_COUNT_${got.length}`);
    else if (got[0].params.count !== 0) d.push("GOT_ERRORS_NONZERO");
    const noTargets = logLines(p, "PRE_OPEN", "noTargets").filter((l) => l.shape === "OK");
    if (noTargets.length !== 1) d.push(`NO_TARGETS_COUNT_${noTargets.length}`);
    else if (okAt[2] !== null && okAt[3] !== null) {
      if (
        noTargets[0].startByte < (okAt[2] as number) ||
        noTargets[0].startByte > (okAt[3] as number)
      ) {
        d.push("ORDER");
      }
    }
    if (logLines(p, "PRE_OPEN", "ciDisabled").filter((l) => l.shape === "OK").length < 1)
      d.push("CI_DISABLED_ABSENT");
    for (const [key, count] of Object.entries(log.pre.counts)) {
      if (count.mismatch > 0 && key !== "externalCommand")
        d.push(`SHAPE_MISMATCH_${upperKey(key)}`);
    }
    for (const e of log.pre.extras) d.push(`PRE_${e.kind}`);
    if (p.networkWordSeen) d.push("NETWORK_WORD_SEEN");
    // 장벽 줄이 모두 오고 나서야 didOpen 을 쓸 수 있다
    if (didOpen !== null) {
      const scanned = bare[3].find((l) => l.shape === "OK");
      if (scanned !== undefined && scanned.endByte > didOpen.stderrOffset)
        d.push("DID_OPEN_BEFORE_BARRIER_LINE");
      if (refreshed.length >= 1 && refreshed[0].endByte > didOpen.stdoutOffset)
        d.push("DID_OPEN_BEFORE_BARRIER_FRAME");
    }
    set(4, d.length === 0, d);
  }

  // 5. didOpen 정확히 1회, 장벽 뒤, 내용이 기대와 정확히 같다
  {
    const d: string[] = [];
    const labels = f.sends.map((s) => s.label);
    const known = labels.every((l) => (LSP_SCAN_SEND_ORDER as readonly string[]).includes(l));
    const monotonic = labels.every(
      (l, i) =>
        i === 0 || LSP_SCAN_SEND_ORDER.indexOf(l) > LSP_SCAN_SEND_ORDER.indexOf(labels[i - 1])
    );
    if (!known || !monotonic) d.push("SEND_ORDER_UNEXPECTED");
    const opens = sendsOf("didOpen");
    if (opens.length !== 1) d.push(`DID_OPEN_SENDS_${opens.length}`);
    else {
      const s = opens[0];
      if (!s.ok) d.push("DID_OPEN_WRITE_FAILED");
      const marker = validDidOpen(f.markers?.didOpenSent);
      if (
        marker === null ||
        !isByteOffset(s.stderrBytesAtSend) ||
        !isByteOffset(s.stdoutBytesAtSend)
      ) {
        d.push("DID_OPEN_OFFSET_UNKNOWN");
      } else if (
        s.stderrBytesAtSend !== marker.stderrOffset ||
        s.stdoutBytesAtSend !== marker.stdoutOffset ||
        s.tMs !== marker.tMs
      ) {
        d.push("DID_OPEN_MARKER_MISMATCH");
      }
      const barrier = f.markers?.barrierDoneAtMs;
      if (!isFiniteNumber(barrier)) d.push("BARRIER_NOT_MARKED");
      else if (!isFiniteNumber(s.tMs) || s.tMs < barrier) d.push("DID_OPEN_BEFORE_BARRIER");
      const c = s.didOpen;
      if (typeof c !== "object" || c === null) d.push("DID_OPEN_PARAMS_UNEXPECTED");
      else {
        if (typeof f.expectedTargetUri !== "string" || c.uri !== f.expectedTargetUri)
          d.push("DID_OPEN_URI_UNEXPECTED");
        if (c.textSha256 !== LSP_SCAN_TARGET_SHA256) d.push("DID_OPEN_TEXT_UNEXPECTED");
        if (
          c.languageId !== LSP_SCAN_DID_OPEN_LANGUAGE_ID ||
          c.version !== LSP_SCAN_DID_OPEN_VERSION
        ) {
          d.push("DID_OPEN_PARAMS_UNEXPECTED");
        }
      }
    }
    set(5, d.length === 0, d);
  }

  const bundle = log.post.bundle;
  const post = log.post;

  // 6. 단일 파일 스캔 시작: 맨줄 Scanning single file 정확히 1회
  {
    const c = post.counts.scanningSingleFile ?? { ok: 0, mismatch: 0 };
    set(6, c.ok === 1 && c.mismatch === 0, [`SCANNING_SINGLE_FILE_COUNT_${c.ok}`]);
  }

  // 7. 엔진 로그 묶음: 아홉 줄 각 정확히 한 번, 스트림 안의 순서, 숫자
  {
    const d: string[] = [];
    for (const key of bundle.missing) d.push(`BUNDLE_LINE_MISSING:${key}`);
    for (const e of post.extras)
      if (e.kind === "DUPLICATE_LINE") d.push(`BUNDLE_LINE_DUPLICATED:${e.key}`);
    if (bundle.orderViolations.length > 0) d.push("ORDER");
    for (const key of post.shapeMismatch)
      if (key !== "externalCommand") d.push(`SHAPE_MISMATCH_${upperKey(key)}`);
    for (const e of post.extras) {
      if (e.kind === "NO_TARGETS") d.push("NO_TARGETS_AFTER_OPEN");
      if (e.kind === "NO_RULES") d.push("NO_RULES_AFTER_OPEN");
      if (e.kind === "RULES_NOT_LOADED") d.push("RULES_NOT_LOADED_AFTER_OPEN");
    }
    const n = bundle.numbers;
    if (bundle.seenAll) {
      if (n.rules !== 1) d.push("RULE_COUNT_UNEXPECTED");
      if (n.targets !== 1) d.push("ENGINE_COUNTS_UNEXPECTED:targets");
      if (n.scanned !== 1) d.push("ENGINE_COUNTS_UNEXPECTED:scanned");
      if (n.matchesBefore !== n.matches) d.push("ENGINE_COUNTS_UNEXPECTED:before_after");
      if (n.skipped !== 0) d.push("SEMGREP_SKIPPED_NONZERO");
      if (n.errorsText !== "") d.push("SEMGREP_ERRORS_NONEMPTY");
    }
    set(7, d.length === 0 && bundle.complete, d);
  }

  // 8. 진단 알림 정확히 한 건, 진단 정확히 한 개
  {
    const d: string[] = [];
    if (ev.frames.malformedPost.length > 0) d.push("DIAGNOSTIC_FRAME_MALFORMED");
    if (p.frames.length === 0 && ev.frames.malformedPost.length === 0)
      d.push("NO_DIAGNOSTIC_FRAME");
    if (p.rejectedFrames.length > 0) d.push("URI_REJECTED");
    if (p.matchFrames.length >= 2) d.push("DUPLICATE_DIAGNOSTICS");
    if (p.matchFrames.length === 1) {
      const n = p.matchFrames[0].diagnosticsCount;
      if (n === 0) d.push("EMPTY_DIAGNOSTICS");
      if (n >= 2) d.push("DUPLICATE_DIAGNOSTICS");
    }
    if (p.differentFrames.length > 0) d.push(p.matchFrames.length >= 1 ? "EXTRA_URI" : "WRONG_URI");
    if (
      p.frames.length > 1 &&
      p.rejectedFrames.length === 0 &&
      p.differentFrames.length === 0 &&
      p.matchFrames.length < 2
    ) {
      d.push("DUPLICATE_DIAGNOSTICS");
    }
    set(8, d.length === 0 && p.frames.length === 1, d);
  }

  // 9. 진단 필드 전부 일치 (대상 URI 알림 한 건에 진단 한 개일 때만 평가한다)
  {
    if (p.single === null) set(9, false, ["NO_SINGLE_TARGET_DIAGNOSTIC"]);
    else {
      const d = p.single.mismatches.map((m) => `FIELD_${m}`);
      if (p.single.fields.range.class === "END_SHIFTED_BY_ONE")
        d.push("RANGE_CONVENTION_UNCERTAIN");
      set(9, p.single.ok, d);
    }
  }

  // 10. 로그와 알림의 교차: Found N matches = 대상 알림의 진단 수, 대상 URI 가 맞다
  {
    const d: string[] = [];
    const matches = bundle.numbers.matches;
    const diagCount = p.matchFrames.reduce((n, x) => n + x.diagnosticsCount, 0);
    if (matches === null) d.push("LOG_MATCHES_UNKNOWN");
    else if (matches !== diagCount) d.push("COUNT_MISMATCH");
    if (p.matchFrames.length === 0) d.push("TARGET_URI_NOT_MATCHED");
    set(10, d.length === 0, d);
  }

  // 11. 다른 알림·서버 요청·오류 없음
  {
    const d: string[] = [];
    const s = p.stdout;
    if (s.errorNotifications > 0) d.push("ERROR_NOTIFICATION_SEEN");
    if (Object.keys(s.otherNotifications).length > 0) d.push("UNEXPECTED_NOTIFICATION");
    if (s.serverRequests.some((r) => !r.allowed)) d.push("SERVER_REQUEST_NOT_ALLOWED");
    if (s.serverRequestCount > MAX_PROGRESS_CREATE) d.push("SERVER_REQUESTS_TOO_MANY");
    if (ev.postOpenServerRequests > 0) d.push("SERVER_REQUEST_AFTER_DID_OPEN");
    for (const e of ev.extras) {
      if (e.kind === "UNEXPECTED_NOTIFICATION_AFTER_DID_OPEN") d.push("UNEXPECTED_NOTIFICATION");
    }
    if (s.unmatchedResponses > 0 || s.messagesWithoutMethodOrId > 0)
      d.push("UNEXPECTED_STDOUT_MESSAGE");
    if (ev.frames.malformedPost.length > 0) d.push("DIAGNOSTIC_FRAME_MALFORMED");
    const allExtras = [...log.pre.extras, ...post.extras];
    if (allExtras.some((e) => e.kind === "UNEXPECTED_WARNING")) d.push("UNEXPECTED_WARNING");
    if (allExtras.some((e) => e.kind === "ERROR_RECORD")) d.push("ERROR_RECORD_SEEN");
    if (log.counters.malformedHeaders > 0) d.push("HEADER_UNREADABLE");
    if (log.counters.orphanBareLines > 0) d.push("ORPHAN_LINES");
    if (log.openBlockAtEnd) d.push("UNTERMINATED_BLOCK");
    set(11, d.length === 0, d);
  }

  // 12. 두 묶음이 didOpen + scanMs 안에 완성된다 (스트림 사이의 순서는 보지 않는다)
  {
    const d: string[] = [];
    if (!ev.timeline.valid) d.push("TIMELINE_INVALID");
    if (didOpen === null) d.push("DID_OPEN_MARKER_MISSING");
    if (ev.diagnostics.completeAtMs === null) d.push("DIAGNOSTICS_NOT_COMPLETE");
    if (ev.logBundle.completeAtMs === null) d.push("LOG_NOT_COMPLETE");
    if (ev.diagnostics.late) d.push("DIAGNOSTICS_LATE");
    if (ev.logBundle.late) d.push("LOG_BUNDLE_LATE");
    set(12, d.length === 0, d);
  }

  // 13. settle 감시: 늦은 묶음의 완성 시각에서 settleMs 동안 감시했고, 그 뒤에야 shutdown 을 보냈고, 그동안 프로세스가 끝나지 않았다
  {
    const d: string[] = [];
    if (ev.bothCompleteAtMs === null || ev.settle.endMs === null) d.push("SETTLE_NOT_STARTED");
    else {
      const shutdown = sendsOf("shutdown")[0];
      const ended = f.settle?.endedAtMs;
      const confirmed =
        isFiniteNumber(ended) &&
        shutdown !== undefined &&
        isFiniteNumber(shutdown.tMs) &&
        ended >= ev.settle.endMs &&
        shutdown.tMs >= ended;
      if (!confirmed) d.push("SETTLE_WATCH_NOT_CONFIRMED");
      if (f.exit.observed) {
        if (!isFiniteNumber(f.exit.tMs)) d.push("EXIT_TIME_UNKNOWN");
        else if (f.exit.tMs < ev.settle.endMs) d.push("EXIT_DURING_SETTLE");
      }
    }
    for (const e of ev.extras) if (e.phase === "SETTLE") d.push(`EXTRA_DURING_SETTLE:${e.kind}`);
    set(13, d.length === 0, d);
  }

  // 14. 파일 변화: 대상 파일 해시 불변, 작업 영역 1→1(그 파일뿐), 규칙 폴더 1→1(프로브뿐), 홈은 예상 쓰기만, 설치물 해시 불변
  {
    const d: string[] = [];
    const root = (role: WatchedRole): WatchedRootFacts | undefined =>
      f.roots?.find((r) => r.role === role);
    const ws = root("WORKSPACE");
    const rules = root("RULES_DIR");
    const home = root("HOME_DIR");
    const unknownCount = (r: WatchedRootFacts | undefined, role: string): boolean => {
      if (r === undefined || !isByteOffset(r.filesBefore) || !isByteOffset(r.filesAfter)) {
        d.push(`ROOT_FILE_COUNT_UNKNOWN:${role}`);
        return true;
      }
      return false;
    };
    if (!unknownCount(ws, "WORKSPACE")) {
      const w = ws as WatchedRootFacts;
      if (w.filesBefore !== 1 || w.filesAfter !== 1 || w.added.length > 0 || w.removed.length > 0) {
        d.push("WORKSPACE_NOT_EXACTLY_TARGET");
      }
    }
    if (!unknownCount(rules, "RULES_DIR")) {
      const r = rules as WatchedRootFacts;
      if (r.filesBefore !== 1 || r.filesAfter !== 1 || r.added.length > 0 || r.removed.length > 0) {
        d.push("RULES_DIR_NOT_EXACTLY_PROBE");
      }
    }
    if (home === undefined || !isByteOffset(home.filesAfter))
      d.push("ROOT_FILE_COUNT_UNKNOWN:HOME_DIR");
    else if (home.added.some((path) => rulesRootViolation("HOME_DIR", path)))
      d.push("HOME_UNEXPECTED_WRITE");
    const t1 = hashToken(
      f.target?.afterRunSha256,
      LSP_SCAN_TARGET_SHA256,
      "TARGET_CHANGED_DURING_RUN",
      "TARGET_RUN_HASH_UNKNOWN"
    );
    if (t1 !== null) d.push(t1);
    const t2 = hashToken(
      f.probe?.afterRunSha256,
      LSP_SCAN_PROBE_SHA256,
      "PROBE_CHANGED_DURING_RUN",
      "PROBE_RUN_HASH_UNKNOWN"
    );
    if (t2 !== null) d.push(t2);
    for (const a of f.artifacts) {
      if (!hashUsable(a.before) || !hashUsable(a.after) || a.before !== a.after) {
        d.push("ARTIFACT_HASH_UNCHANGED_NOT_CONFIRMED");
      }
    }
    set(14, d.length === 0, d);
  }

  // 15. 네트워크·프로세스·외부 명령
  {
    const d: string[] = [];
    const { baselineHits, finalHits } = f.live.receiver;
    if (!isByteOffset(baselineHits) || !isByteOffset(finalHits)) d.push("RECEIVER_UNOBSERVABLE");
    else if (finalHits > baselineHits) d.push("RECEIVER_HITS_INCREASED");
    for (const r of f.externalReasons ?? []) if (r.startsWith(RECEIVER_OS_PREFIX)) d.push(r);
    if (f.live.processes.disallowed.length > 0) d.push("DISALLOWED_IMAGE_SEEN");
    const ext = log.externalCommand;
    if (ext.problems.includes("EXTERNAL_COMMAND_SHAPE")) d.push("EXTERNAL_COMMAND_SHAPE");
    let countBad = ext.problems.includes("EXTERNAL_COMMAND_COUNT");
    if (didOpen !== null) {
      const preBarrier = ext.attempts.filter(
        (a) => a.segment === "PRE_OPEN" && a.window === "BARRIER"
      ).length;
      if (preBarrier !== 1) countBad = true;
      // 사후 묶음이 완성됐으면 시도 줄은 이미 와 있어야 한다(줄은 `Scanning N targets` 앞에 찍힌다). 완성되지 않았으면 부족을 말하지 않는다.
      if (bundle.complete) {
        const inScan = ext.attempts.filter(
          (a) => a.segment === "POST_OPEN" && a.window === "SCAN"
        ).length;
        if (inScan !== 1) countBad = true;
      }
    }
    if (countBad) d.push("EXTERNAL_COMMAND_COUNT");
    if ([...log.pre.extras, ...post.extras].some((e) => e.kind === "ERROR_OUTPUT"))
      d.push("EXTERNAL_COMMAND_OUTPUT");
    set(15, d.length === 0, d);
  }

  // 16. shutdown·exit 송신, 스스로 종료, 종료 코드 0, 강제 종료 없음
  {
    const d: string[] = [];
    const sentOk = (label: ScanSendLabel): boolean =>
      f.sends.some((s) => s.label === label && s.ok);
    if (!sentOk("shutdown") || !sentOk("exit")) d.push("SHUTDOWN_EXIT_NOT_SENT");
    if (!f.exit.observed) d.push("EXIT_NOT_OBSERVED");
    else {
      if (f.exit.code !== 0) d.push("EXIT_CODE_NOT_ZERO");
      if (f.exit.signal !== null) d.push("EXIT_BY_SIGNAL");
    }
    if (f.kill.count > 0) d.push("FORCE_KILLED");
    if (f.stdinClosed.byHarness) d.push("STDIN_CLOSED_BY_HARNESS");
    set(16, d.length === 0, d);
  }
  return results;
}

function raisedSet(f: ScanFacts): Set<ScanTrigger> {
  const raised = new Set<ScanTrigger>(f.also ?? []);
  if (f.trigger !== null) raised.add(f.trigger);
  return raised;
}

const FORBIDDEN_BLOCK_KEYS: readonly ScanLogKey[] = [
  "scanningWorkspace",
  "scannedWorkspace",
  "scanningWorkspaceComplete",
  "fullScan",
  "usingAuto",
  "download",
  "tokenFound",
  "settingsFileFound",
];

/** 관측을 믿을 수 없게 하는 사유(무결성). 하나라도 있으면 로그 내용으로 판정하지 않는다. */
function integrityBlockers(f: ScanFacts, p: ScanParsed, conditions: ConditionResult[]): string[] {
  const out: string[] = [];
  const raised = raisedSet(f);
  const c = (id: number): ConditionResult => conditions[id - 1];
  out.push(...(f.externalReasons ?? []));
  if (!f.spawn.ok) out.push("SPAWN_FAILED");
  if (p.limitsProblems.length > 0) out.push("LIMITS_INVALID", ...p.limitsProblems);
  const frameError = f.frameError ?? p.stdout.frameError;
  if (frameError !== null) out.push(`FRAME_ERROR:${frameError.kind}`);
  else if (raised.has("FRAME_ERROR")) out.push("FRAME_ERROR");
  if (f.stdout.overflow || f.stderr.overflow || raised.has("OUTPUT_LIMIT"))
    out.push("OUTPUT_LIMIT");
  if (f.stdout.readFailed || f.stderr.readFailed || raised.has("STREAM_READ_FAILED")) {
    out.push("STREAM_READ_FAILED");
  }
  const timedOut = ["INIT_TIMEOUT", "RULES_TIMEOUT", "TOTAL_TIMEOUT", "EXIT_TIMEOUT"].some((t) =>
    raised.has(t as ScanTrigger)
  );
  if (f.exit.observed && f.kill.count === 0 && !timedOut && f.abort?.condition !== "A9") {
    if (!f.stdout.overflow && !f.stdout.readFailed && f.stdout.eof !== true)
      out.push("STREAM_NOT_CLOSED:stdout");
    if (!f.stderr.overflow && !f.stderr.readFailed && f.stderr.eof !== true)
      out.push("STREAM_NOT_CLOSED:stderr");
  }
  if (raised.has("STDIN_ERROR")) out.push("STDIN_ERROR");
  if (!p.evidence.timeline.valid)
    out.push("CHUNK_TIMELINE_INVALID", ...p.evidence.timeline.problems);
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
  // didOpen 송신 사실(순서·내용·위치·장벽): 쓰기 직전 방어선이 놓쳤거나 우회됐다
  for (const t of c(5).detail) if (t !== "DID_OPEN_SENDS_0") out.push(t);
  for (const t of c(4).detail) if (t.startsWith("DID_OPEN_BEFORE_BARRIER")) out.push(t);
  // initialized 이전의 새로고침·열린 문서 스캔 신호: 실시간 감시가 놓쳤다
  const initSend = initializedSends[0];
  if (initSend !== undefined && isByteOffset(initSend.stderrBytesAtSend)) {
    for (const l of p.log.lines) {
      if (
        (PRE_INITIALIZED_KEYS as readonly string[]).includes(l.key) &&
        l.startByte < initSend.stderrBytesAtSend
      ) {
        out.push("PRE_INITIALIZED_SIGNAL_NOT_CAUGHT_LIVE");
        break;
      }
    }
  }
  // 금지 신호(작업 영역 스캔, 네트워크·토큰·설정 파일)가 사후에 드러났다
  for (const e of [...p.log.pre.extras, ...p.log.post.extras]) {
    if (e.kind === "WORKSPACE_SCAN") out.push("FORBIDDEN_WORKSPACE_SCAN_NOT_CAUGHT_LIVE");
    if (e.kind === "FORBIDDEN_NETWORK") out.push("FORBIDDEN_NETWORK_NOT_CAUGHT_LIVE");
  }
  if (p.networkWordSeen) out.push("NETWORK_WORD_SEEN_NOT_CAUGHT_LIVE");
  // 끝까지 닫히지 않은 블록이 삼킨 줄이 금지 신호 문구다: 실제로 일어난 일을 가렸을 수 있다
  for (const key of p.log.openBlockEmbeddedKeys) {
    if (FORBIDDEN_BLOCK_KEYS.includes(key)) out.push(`FORBIDDEN_${upperKey(key)}_IN_BLOCK`);
  }
  for (const t of c(11).detail) {
    if (
      t === "SERVER_REQUEST_NOT_ALLOWED" ||
      t === "SERVER_REQUESTS_TOO_MANY" ||
      t === "SERVER_REQUEST_AFTER_DID_OPEN"
    ) {
      out.push(`${t}_NOT_CAUGHT_LIVE`);
    }
  }
  // 파일 변화: 바뀐 것이 있으면 FILES_CHANGED, 읽지 못했을 뿐이면 FILE_STATE_NOT_CONFIRMED
  const fileTokens = [...c(1).detail, ...c(14).detail].filter(
    (t) =>
      isChangedFileToken(t) ||
      t.endsWith("_HASH_UNKNOWN") ||
      t.startsWith("ROOT_FILE_COUNT_UNKNOWN") ||
      t.startsWith("ARTIFACT_") ||
      t === "TARGET_RUN_HASH_UNKNOWN" ||
      t === "PROBE_RUN_HASH_UNKNOWN"
  );
  if (fileTokens.length > 0) {
    out.push(
      fileTokens.some(isChangedFileToken) ? "FILES_CHANGED" : "FILE_STATE_NOT_CONFIRMED",
      ...fileTokens
    );
  }
  for (const t of c(15).detail) {
    if (t === "RECEIVER_UNOBSERVABLE" || t === "RECEIVER_HITS_INCREASED") out.push(t);
  }
  if (f.live.processes.disallowed.length > 0) out.push("DISALLOWED_IMAGE_SEEN");
  if (p.tracker.disagreements.length > 0)
    out.push("TRACKER_DISAGREEMENT", ...p.tracker.disagreements);
  return [...new Set(out)];
}

/** 로그에 관측된 부정적 증거. 우선순위 순서대로 돌려준다. */
function negativeEvidence(p: ScanParsed): string[] {
  const out: string[] = [];
  const log = p.log;
  const all = [...log.pre.extras, ...log.post.extras];
  const has = (kind: string): boolean => all.some((e) => e.kind === kind);
  const engine: string[] = [];
  if (has("ERROR_RECORD")) engine.push("SERVER_ERROR_LOGGED");
  if (p.stdout.errorNotifications > 0) engine.push("SERVER_ERROR_NOTIFIED");
  if (log.post.extras.some((e) => e.kind === "ENGINE_ERRORS_NONEMPTY"))
    engine.push("SEMGREP_ERRORS_NONEMPTY");
  if (log.post.extras.some((e) => e.kind === "SKIPPED_RULES_NONZERO"))
    engine.push("SEMGREP_SKIPPED_NONZERO");
  if (log.post.extras.some((e) => e.kind === "SKIPPING_RULE")) engine.push("RULE_SKIPPED");
  if (engine.length > 0) out.push("ENGINE_ERROR", ...engine);
  // 규칙 로딩 장벽의 부정적 증거(사전 구간)
  const got = logLines(p, "PRE_OPEN", "gotErrors");
  if (got.some((l) => l.params.count !== 0)) out.push("LOCAL_CONFIG_ERRORS");
  if (log.pre.extras.some((e) => e.kind === "SKIPPING_RULE")) out.push("INVALID_RULE_SKIPPED");
  if (log.pre.extras.some((e) => e.kind === "NO_RULES")) out.push("NO_RULES_TO_RUN");
  if (log.pre.extras.some((e) => e.kind === "RULES_NOT_LOADED")) out.push("RULES_NOT_LOADED");
  if (p.single !== null) {
    if (p.single.mismatches.includes("CODE")) out.push("WRONG_RULE", ...p.single.mismatches);
    else if (
      p.single.mismatches.some((m) =>
        ["SOURCE", "MESSAGE", "SEVERITY", "CODE_DESCRIPTION_PRESENT"].includes(m)
      )
    ) {
      out.push("DIAGNOSTIC_FIELD_MISMATCH", ...p.single.mismatches);
    }
  }
  // 엔진이 돌았고 매치 0건이며 알림에 진단이 없다: 음성 결과는 성공이 아니다
  const n = log.post.bundle.numbers;
  if (
    log.post.bundle.seenAll &&
    n.scanned === 1 &&
    n.matches === 0 &&
    p.totalPostDiagnostics === 0 &&
    p.evidence.frames.malformedPost.length === 0 &&
    !out.includes("ENGINE_ERROR")
  ) {
    out.push("NO_MATCH");
  }
  return [...new Set(out)];
}

/** 종료 단계의 사유: 관측 자체는 믿을 수 있지만 끝맺음이 정상이 아니다. */
function terminationBlockers(f: ScanFacts, conditions: ConditionResult[]): string[] {
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
  for (const t of conditions[15].detail) out.push(t);
  return [...new Set(out)];
}

/**
 * settle 감시를 마쳤다는 시각 증거. 두 묶음이 완성된 경우에만 요구한다(완성되지 않았으면 NOT_CONFIRMED 사유가 말한다).
 *
 * 계약 보정(완화 아님): 묶음이 마감(didOpen + scanMs) 뒤에 완성됐다면(`late`) 실행기는 마감에서 기다림을 끝내고 shutdown 을 보내므로
 * settle 감시 종료 시각이 원래 없다. 이때 "감시 미확인"(SETTLE_WATCH_NOT_CONFIRMED)이 늦음을 가리면 "늦은 로그"와 "감시 미확인"이 구별되지 않는다.
 * 그래서 늦은 경우에 한해 감시 미확인만 판정 자리를 양보한다(조건 13 에는 사실대로 남는다). 늦은 묶음은 어차피 성공이 될 수 없다
 * (NOT_CONFIRMED:EVIDENCE_AFTER_DEADLINE).
 *
 * 같은 이유로 늦은 경우의 EXIT_DURING_SETTLE 은 "shutdown 을 보내기 전에" 끝난 경우에만 사유로 남긴다: 마감에서 우리가 shutdown 을 보낸 뒤의 정상 종료가
 * 이름뿐인 settle 창(늦은 묶음 완성 시각 + settleMs) 안에 들어온다는 이유로 늦음을 가리면 안 된다. 보내기 전의 종료(조기 종료)와
 * 종료 시각을 모르는 경우(EXIT_TIME_UNKNOWN)는 늦음과 무관하게 그대로 NOT_OBSERVED 다.
 */
function settleBlockers(f: ScanFacts, conditions: ConditionResult[], ev: ScanEvidence): string[] {
  const late = ev.diagnostics.late || ev.logBundle.late;
  const shutdown = f.sends.find((s) => s.label === "shutdown");
  const exitAfterOwnShutdown =
    f.exit.observed &&
    isFiniteNumber(f.exit.tMs) &&
    shutdown !== undefined &&
    isFiniteNumber(shutdown.tMs) &&
    f.exit.tMs >= shutdown.tMs;
  return conditions[12].detail.filter((t) => {
    if (t === "SETTLE_WATCH_NOT_CONFIRMED") return !late;
    if (t === "EXIT_DURING_SETTLE") return !(late && exitAfterOwnShutdown);
    return t === "EXIT_TIME_UNKNOWN";
  });
}

/** 필요한 신호가 안 보이거나 모양을 읽지 못하는 등, 성공도 실패도 말할 수 없는 사유. 우선순위 순서. */
function confirmationGaps(f: ScanFacts, p: ScanParsed, conditions: ConditionResult[]): string[] {
  const out: string[] = [];
  const ev = p.evidence;
  const log = p.log;
  const all = [...log.pre.extras, ...log.post.extras];
  const postKinds = new Set(log.post.extras.map((e) => e.kind));
  const details = conditions.flatMap((c) => c.detail);
  const bundle = log.post.bundle;
  const has = (t: string): boolean => details.includes(t);
  // 외부 명령 줄의 머리말 수준은 외부 명령 모양(BAD_LEVEL)으로 따로 판정한다: 로그 모양 불일치로 이중 계산하지 않는다.
  const preShape = Object.entries(log.pre.counts).some(
    ([key, c]) => key !== "externalCommand" && c.mismatch > 0
  );
  const postShape = log.post.shapeMismatch.filter((k) => k !== "externalCommand");
  if (ev.preOpen.evidence) out.push("PRE_OPEN_EVIDENCE");
  if (
    log.counters.malformedHeaders > 0 ||
    log.counters.orphanBareLines > 0 ||
    log.openBlockAtEnd ||
    postShape.length > 0 ||
    preShape
  ) {
    out.push("LOG_SHAPE_UNRECOGNIZED");
  }
  if (log.openBlockAtEnd) out.push("UNTERMINATED_BLOCK");
  if (postKinds.has("NO_TARGETS") || postKinds.has("FILE_NOT_IN_TARGETS")) out.push("NO_TARGET");
  if (postKinds.has("NO_RULES")) out.push("NO_RULES");
  if (postKinds.has("RULES_NOT_LOADED")) out.push("RULES_NOT_LOADED");
  if (
    [...postKinds].some((k) =>
      ["DUPLICATE_LINE", "OPEN_DOCUMENTS_SCAN", "RULES_REFRESH"].includes(k)
    )
  ) {
    out.push("EXTRA_SCAN");
  }
  if (has("EXTERNAL_COMMAND_SHAPE")) out.push("EXTERNAL_COMMAND_SHAPE");
  if (has("EXTERNAL_COMMAND_COUNT")) out.push("EXTERNAL_COMMAND_COUNT");
  if (has("EXTERNAL_COMMAND_OUTPUT")) out.push("EXTERNAL_COMMAND_OUTPUT");
  if (has("URI_REJECTED")) out.push("URI_REJECTED");
  if (has("DIAGNOSTIC_FRAME_MALFORMED")) out.push("DIAGNOSTIC_FRAME_MALFORMED");
  if (has("DUPLICATE_DIAGNOSTICS")) out.push("DUPLICATE_DIAGNOSTICS");
  if (has("EXTRA_URI")) out.push("EXTRA_URI");
  if (has("WRONG_URI")) out.push("WRONG_URI");
  if (p.single !== null && p.single.mismatches.includes("RANGE")) {
    out.push("RANGE_MISMATCH");
    if (p.single.fields.range.class === "END_SHIFTED_BY_ONE")
      out.push("RANGE_CONVENTION_UNCERTAIN");
  }
  if (bundle.orderViolations.length > 0 || has("ORDER")) out.push("ORDER_VIOLATION");
  const nothing = ev.frames.post.length === 0 && !hasPostEvidenceLine(p);
  if (nothing && ev.didOpen !== null) out.push("SCAN_TIMEOUT");
  if (ev.diagnostics.late || ev.logBundle.late) out.push("EVIDENCE_AFTER_DEADLINE");
  if (!nothing && !bundle.seenAll) out.push("ENGINE_LOG_MISSING");
  if (!nothing && p.frames.length === 0 && ev.frames.malformedPost.length === 0 && bundle.seenAll) {
    out.push("NO_DIAGNOSTIC_NOTIFICATION");
  }
  if (has("COUNT_MISMATCH")) out.push("COUNT_MISMATCH");
  if (has("EMPTY_DIAGNOSTICS")) out.push("EMPTY_DIAGNOSTICS");
  if (has("RULE_COUNT_UNEXPECTED")) out.push("RULE_COUNT_UNEXPECTED");
  if (details.some((t) => t.startsWith("ENGINE_COUNTS_UNEXPECTED")))
    out.push("ENGINE_COUNTS_UNEXPECTED");
  if (has("UNEXPECTED_WARNING") || all.some((e) => e.kind === "UNEXPECTED_WARNING"))
    out.push("UNEXPECTED_WARNING");
  if (has("UNEXPECTED_NOTIFICATION")) out.push("UNEXPECTED_NOTIFICATION");
  if (has("UNEXPECTED_STDOUT_MESSAGE")) out.push("UNEXPECTED_STDOUT_MESSAGE");
  // 장벽 신호의 부족·중복(RULES 판정과 같은 이름)
  const barrier = conditions[3].detail;
  if (barrier.some((t) => /_COUNT_0$/.test(t) || t === "CI_DISABLED_ABSENT"))
    out.push("SIGNAL_ABSENT");
  if (barrier.some((t) => /_COUNT_([2-9]|[1-9]\d+)$/.test(t))) out.push("SIGNAL_DUPLICATED");
  if (barrier.includes("LOADING_PATH_UNEXPECTED")) out.push("LOADING_PATH_UNEXPECTED");
  if (ev.didOpen !== null && has("DID_OPEN_SENDS_0")) out.push("DID_OPEN_NOT_SENT");
  if (f.markers?.didOpenSent === null && f.sends.every((s) => s.label !== "didOpen"))
    out.push("DID_OPEN_NOT_SENT");
  return [...new Set(out)];
}

/** 사후 구간에 스캔과 관련된 인식된 줄이 하나라도 있는가(아무것도 도착하지 않았는지 가르는 기준). */
function hasPostEvidenceLine(p: ScanParsed): boolean {
  return p.log.lines.some(
    (l) =>
      l.segment === "POST_OPEN" &&
      (l.key === "scanningSingleFile" ||
        l.key === "scannedSingleFile" ||
        l.key === "scanningTargets" ||
        l.key === "runningRules" ||
        l.key === "foundMatchesBefore" ||
        l.key === "engineErrors" ||
        l.key === "skippedRules" ||
        l.key === "scannedFiles" ||
        l.key === "foundMatches" ||
        l.key === "noTargets" ||
        l.key === "noRules" ||
        l.key === "rulesNotLoaded")
  );
}

export function judgeScanResponse(f: ScanFacts, parsed?: ScanParsed): ScanJudgement {
  const p = parsed ?? parseScanFacts(f);
  const conditions = evaluate(f, p);
  const verdictOf = (status: ScanStatus, reasons: string[]): ScanJudgement => ({
    status,
    verdict: `${status}:${reasons[0]}`,
    reasons: [...new Set(reasons)],
    conditions,
  });

  // 1. 서버를 띄우지 않았다
  if (f.refusals.length > 0 && !f.spawn.attempted) return verdictOf("NOT_ATTEMPTED", f.refusals);
  // 2. 실시간 중단(장벽 한도 초과 A9는 시간 초과로 따로 본다)
  if (f.abort !== null && f.abort !== undefined && f.abort.condition !== "A9") {
    const name = SCAN_ABORT_NAME[f.abort.condition] ?? tokenOf(f.abort.condition);
    const followers = [
      ...integrityBlockers(f, p, conditions),
      ...terminationBlockers(f, conditions),
    ];
    return {
      status: "ABORTED",
      verdict: `ABORTED:${name}`,
      reasons: [`ABORT:${f.abort.condition}`, ...new Set(followers)],
      conditions,
    };
  }
  // 3. 무결성
  const integrity = integrityBlockers(f, p, conditions);
  if (f.refusals.length > 0) integrity.unshift("REFUSAL_AFTER_START");
  if (integrity.length > 0) return verdictOf("NOT_OBSERVED", integrity);
  // 4. 관측된 부정적 증거
  const negative = negativeEvidence(p);
  if (negative.length > 0) {
    return {
      status: "SCAN_FAILED",
      verdict: `SCAN_FAILED:${negative[0]}`,
      reasons: [...negative, ...terminationBlockers(f, conditions)],
      conditions,
    };
  }
  // 5. 종료 단계
  const ending = terminationBlockers(f, conditions);
  if (ending.length > 0) return verdictOf("NOT_OBSERVED", ending);
  // 5b. 두 묶음이 완성됐는데 settle 감시를 마쳤다는 시각 증거가 없다
  const settle = settleBlockers(f, conditions, p.evidence);
  if (settle.length > 0) return verdictOf("NOT_OBSERVED", settle);
  // 6. 확인 불가
  const gaps = confirmationGaps(f, p, conditions);
  const failing = conditions.filter((c) => c.result !== "PASS");
  if (gaps.length > 0) return verdictOf("NOT_CONFIRMED", gaps);
  if (failing.length > 0) {
    return verdictOf(
      "NOT_CONFIRMED",
      failing.flatMap((c) => (c.detail.length > 0 ? c.detail : [`CONDITION_${c.id}`]))
    );
  }
  // 7. 성공
  return { status: "OBSERVED", verdict: "SCAN_RESPONSE_OBSERVED", reasons: [], conditions };
}

// ── 기록 ──────────────────────────────────────────────────────────

export interface ScanFrameRecord {
  raw_uri: unknown;
  uri_comparison: ScanUriComparison["result"];
  uri_reject_reason: string | null;
  diagnostics_count: number;
  start_byte: number;
  end_byte: number;
  params_keys: string[];
}

export interface ScanObservation {
  schema: typeof LSP_SCAN_SCHEMA;
  run_id: string;
  provenance: Provenance | null;
  status: ScanStatus;
  verdict: string;
  verdict_reasons: string[];
  conditions: ConditionResult[];
  /** 세 결과는 서로 독립이다: 관측 판정, 프로세스 정리, 시스템 복구. 어느 하나에서 다른 것을 추론하지 않는다. */
  outcomes: {
    observation: { status: ScanStatus; verdict: string };
    process_cleanup: { ok: boolean; problems: string[] };
    system_recovery: { status: string; detail: string[] };
  };
  request: {
    process_role: "lsp-scan";
    command_base: string;
    args: string[];
    limits: Record<string, number>;
    messages_allowed: ScanSendLabel[];
    initialized_sent_at_most: 1;
    did_open_sent_at_most: 1;
    refusals: string[];
  };
  sent: ScanSendFact[];
  initialize: {
    response: "VALID" | "INVALID" | "NONE";
    reasons: string[];
    latency_ms: number | null;
    server_info: { name: string | null; version: string | null } | null;
    pin_version_comparison: "MATCH" | "MISMATCH" | "NOT_OBSERVED" | "NOT_GIVEN";
    capabilities_sha256: string | null;
  };
  child_env: { path_value: string | null; working_directory: string | null };
  evidence: {
    timeline_valid: boolean;
    timeline_problems: string[];
    did_open_marker: { t_ms: number; stdout_offset: number; stderr_offset: number } | null;
    barrier_done_at_ms: number | null;
    deadline_at_ms: number | null;
    pre_open: { evidence: boolean; log_keys: string[]; stdout_diagnostic_frames: number };
    diagnostics: {
      state: ScanDiagnosticsState;
      count: number;
      complete_at_ms: number | null;
      late: boolean;
    };
    log_bundle: {
      state: ScanLogState;
      complete_at_ms: number | null;
      late: boolean;
      missing: string[];
      order_violations: string[];
      complete_end_byte: number | null;
    };
    both_complete_at_ms: number | null;
    settle: { start_ms: number | null; end_ms: number | null };
    extras: {
      source: ScanStream;
      kind: string;
      key: string | null;
      at_ms: number | null;
      phase: ScanExtraPhase;
    }[];
    tracker_comparison: "MATCH" | "DISAGREE" | "NOT_PROVIDED";
    tracker_disagreements: string[];
  };
  diagnostic: {
    /** 성공(SCAN_RESPONSE_OBSERVED)일 때만 true. */
    confirmed: boolean;
    post_open_frames: number;
    frames: ScanFrameRecord[];
    /** 대상 URI 알림 한 건에 진단이 한 개일 때만. 원문 그대로의 실제 값이다(기대에 맞춰 고치지 않는다). */
    fields: {
      raw_uri: unknown;
      uri_comparison: ScanUriComparison["result"];
      uri_reject_reason: string | null;
      code_actual: unknown;
      code_match: boolean;
      source_actual: unknown;
      source_match: boolean;
      message_actual: unknown;
      message_match: boolean;
      severity_actual: unknown;
      severity_match: boolean;
      range_actual: unknown;
      range_class: ScanDiagnosticEvaluation["fields"]["range"]["class"];
      code_description_absent: boolean;
      unknown_fields: string[];
    } | null;
  };
  /** 로그 `Running Semgrep with N rules` 의 N: 엔진이 받은 규칙 수의 **부분 관측**. 로딩된 규칙 전체를 뜻하지 않는다. 못 읽었으면 null. */
  engine_rule_count_passed: number | null;
  engine: {
    targets: number | null;
    matches_before: number | null;
    scanned_files: number | null;
    matches: number | null;
    skipped: number | null;
    errors_text: string | null;
  };
  external_command: {
    /** 로그 줄(시도 직전의 흔적)에 대한 사실. 프로세스 생성의 증거가 아니다. */
    attempt_lines: {
      pre: number;
      post: number;
      shape_ok: boolean;
      attempts: { segment: string; window: string; shape: string }[];
      problems: string[];
    };
    /** 프로세스 생성에 대한 사실. git 이미지가 관측됐을 때만 established 다. 표본에서 못 본 것을 "생성되지 않았다"로 쓰지 않는다. */
    git_process_creation: {
      established: boolean;
      basis: "GIT_IMAGE_OBSERVED" | "NOT_ESTABLISHED_NO_GIT_IMAGE_SAMPLED";
      observed_images: string[];
      sampling: { samples: number; failures: number };
    };
  };
  server_messages: {
    frames: number;
    server_requests: { count: number; allowed: number; methods: string[]; after_did_open: number };
    progress_notifications: number;
    post_open_progress_notifications: number;
    diagnostics_frames: number;
    unexpected_notifications: Record<string, number>;
    error_notifications: number;
    shutdown_response_seen: boolean;
  };
  log: {
    lines: number;
    records: number;
    headed_records: number;
    bare_records: number;
    malformed_headers: number;
    orphan_bare_lines: number;
    embedded_signal_text: number;
    unclassified_info: number;
    pre_open_counts: Record<string, { ok: number; shape_mismatch: number }>;
    post_open_counts: Record<string, { ok: number; shape_mismatch: number }>;
    loading_paths_match_probe: boolean | null;
  };
  target: {
    file: typeof LSP_SCAN_TARGET_FILE;
    expected_sha256: string;
    source_sha256: string | null;
    after_write_sha256: string | null;
    after_run_sha256: string | null;
  };
  probe: {
    file: typeof LSP_SCAN_PROBE_FILE;
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
    trigger: ScanTrigger | null;
    also: ScanTrigger[];
    abort: { condition: ScanAbortCondition; detail: string; t_ms: number } | null;
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
  /** 성공일 때만 세우는 것. 성공이 아니면 빈 목록이다. */
  established: string[];
  /** 성공이어도 세우지 않는 것(D10). */
  not_established: {
    rule_detection_performance_in_general: "NOT_ESTABLISHED";
    real_repository_scan_security: "NOT_ESTABLISHED";
    negative_controls: "NOT_ESTABLISHED";
    control_reference_qualification: "NOT_ESTABLISHED";
    whole_isolation_effect: "NOT_ESTABLISHED";
    binary_source_correspondence: "NOT_ESTABLISHED";
    pin_and_log_format_verification: "NOT_ESTABLISHED";
    loaded_rule_count: "PARTIAL_OBSERVATION_ONLY";
    git_process_creation: "NOT_ESTABLISHED";
  };
  /** 합성(스텁·출처 모름) 결과는 실제 바이너리 검증으로 승격하지 않는다. 실제 출처의 성공도 합성 입력 한 건의 반응일 뿐이다. */
  real_binary_verified: false;
  evidence_scope: "SYNTHETIC_STUB_ONLY" | "ONE_SYNTHETIC_INPUT_REACTION" | "NONE_ESTABLISHED";
}

function compareArtifact(item: ArtifactFacts): "SAME" | "CHANGED" | "NOT_COMPARED" {
  if (!hashUsable(item.before) || !hashUsable(item.after)) return "NOT_COMPARED";
  return item.before === item.after ? "SAME" : "CHANGED";
}

function gitImagesOf(f: ScanFacts): string[] {
  const names = [...f.live.processes.imagesSeen, ...f.live.processes.disallowed].map((x) =>
    tokenOf(x)
  );
  return [
    ...new Set(
      names.filter((n) =>
        n
          .toLowerCase()
          .replace(/^.*[\\/]/, "")
          .startsWith("git")
      )
    ),
  ];
}

function countsRecord(
  counts: Record<string, { ok: number; mismatch: number }>
): Record<string, { ok: number; shape_mismatch: number }> {
  const out: Record<string, { ok: number; shape_mismatch: number }> = {};
  for (const [key, c] of Object.entries(counts))
    out[key] = { ok: c.ok, shape_mismatch: c.mismatch };
  return out;
}

export function buildScanRecord(f: ScanFacts): ScanObservation {
  const p = parseScanFacts(f);
  const judgement = judgeScanResponse(f, p);
  const ev = p.evidence;
  const init = initVerdict(p);
  const version = versionComparison(f.expectedVersion, p.init);
  const initSentAt = f.sends.find((s) => s.label === "initialize" && s.ok)?.tMs ?? null;
  const latency =
    p.stdout.initMessage !== null &&
    isFiniteNumber(initSentAt) &&
    isFiniteNumber(f.initResponseAtMs)
      ? Math.max(0, f.initResponseAtMs - initSentAt)
      : null;
  const observed = judgement.status === "OBSERVED";
  const wantPath = f.probePath === null ? null : comparableLoadingPath(f.probePath);
  const loadingSignals = p.log.lines.filter((l) => l.key === "loading" || l.key === "doneLoading");
  const pathsMatch =
    loadingSignals.length === 0 || wantPath === null
      ? null
      : loadingSignals.every((l) => comparableLoadingPath(String(l.params.path)) === wantPath);

  const cleanupProblems = [...f.cleanup.problems];
  const cleanupOk = f.spawn.ok
    ? f.cleanup.childExitConfirmed &&
      f.cleanup.streamsClosed === true &&
      f.cleanup.descendantsAliveAfter === 0 &&
      f.cleanup.dispose === "OK" &&
      f.cleanup.timersCancelled &&
      cleanupProblems.length === 0
    : cleanupProblems.length === 0;

  const unobserved = [...SCAN_UNOBSERVED_ALWAYS];
  if (f.provenance !== "real") unobserved.unshift("PROVENANCE_STUB_NOT_REAL_SEMGREP");

  const engineNumbers = p.log.post.bundle.numbers;
  const gitImages = gitImagesOf(f);
  const fieldsOf = (): ScanObservation["diagnostic"]["fields"] => {
    if (p.single === null) return null;
    const frame = p.matchFrames[0];
    const e = p.single;
    return {
      raw_uri: frame.uri.raw,
      uri_comparison: frame.uri.result,
      uri_reject_reason: frame.uri.reason,
      code_actual: e.fields.code.actual,
      code_match: e.fields.code.match,
      source_actual: e.fields.source.actual,
      source_match: e.fields.source.match,
      message_actual: e.fields.message.actual,
      message_match: e.fields.message.match,
      severity_actual: e.fields.severity.actual,
      severity_match: e.fields.severity.match,
      range_actual: e.fields.range.actual,
      range_class: e.fields.range.class,
      code_description_absent: e.codeDescriptionAbsent,
      unknown_fields: [...e.unknownFields],
    };
  };

  return {
    schema: LSP_SCAN_SCHEMA,
    run_id: f.runId,
    provenance: f.provenance,
    status: judgement.status,
    verdict: judgement.verdict,
    verdict_reasons: judgement.reasons,
    conditions: judgement.conditions,
    outcomes: {
      observation: { status: judgement.status, verdict: judgement.verdict },
      process_cleanup: { ok: cleanupOk, problems: cleanupProblems },
      system_recovery:
        f.recovery === null || f.recovery === undefined
          ? { status: "NOT_OBSERVED", detail: [] }
          : { status: f.recovery.status, detail: [...f.recovery.detail] },
    },
    request: {
      process_role: "lsp-scan",
      command_base: "semgrep.exe",
      args: [...LSP_SCAN_ARGS],
      limits: {
        total_ms: f.limits.totalMs,
        init_ms: f.limits.initMs,
        rules_ms: f.limits.rulesMs,
        scan_ms: f.limits.scanMs,
        settle_ms: f.limits.settleMs,
        exit_ms: f.limits.exitMs,
        stdin_close_grace_ms: f.limits.stdinCloseGraceMs,
        kill_confirm_ms: f.limits.killConfirmMs,
        max_stdout_bytes: f.limits.maxStdoutBytes,
        max_stderr_bytes: f.limits.maxStderrBytes,
        sample_interval_ms: f.limits.sampleIntervalMs,
      },
      messages_allowed: [...LSP_SCAN_SEND_ORDER],
      initialized_sent_at_most: 1,
      did_open_sent_at_most: 1,
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
    child_env: {
      path_value: typeof f.childEnv?.path === "string" ? f.childEnv.path : null,
      working_directory:
        typeof f.childEnv?.workingDirectory === "string" ? f.childEnv.workingDirectory : null,
    },
    evidence: {
      timeline_valid: ev.timeline.valid,
      timeline_problems: ev.timeline.problems,
      did_open_marker:
        ev.didOpen === null
          ? null
          : {
              t_ms: ev.didOpen.tMs,
              stdout_offset: ev.didOpen.stdoutOffset,
              stderr_offset: ev.didOpen.stderrOffset,
            },
      barrier_done_at_ms: ev.barrierDoneAtMs,
      deadline_at_ms: ev.deadlineAtMs,
      pre_open: {
        evidence: ev.preOpen.evidence,
        log_keys: [...ev.preOpen.logKeys],
        stdout_diagnostic_frames: ev.preOpen.stdoutDiagnosticFrames,
      },
      diagnostics: {
        state: ev.diagnostics.state,
        count: ev.diagnostics.count,
        complete_at_ms: ev.diagnostics.completeAtMs,
        late: ev.diagnostics.late,
      },
      log_bundle: {
        state: ev.logBundle.state,
        complete_at_ms: ev.logBundle.completeAtMs,
        late: ev.logBundle.late,
        missing: [...p.log.post.bundle.missing],
        order_violations: [...p.log.post.bundle.orderViolations],
        complete_end_byte: ev.logBundle.completeEndByte,
      },
      both_complete_at_ms: ev.bothCompleteAtMs,
      settle: { start_ms: ev.settle.startMs, end_ms: ev.settle.endMs },
      extras: ev.extras.map((e) => ({
        source: e.source,
        kind: e.kind,
        key: e.key,
        at_ms: e.atMs,
        phase: e.phase,
      })),
      tracker_comparison: !p.tracker.provided
        ? "NOT_PROVIDED"
        : p.tracker.disagreements.length > 0
          ? "DISAGREE"
          : "MATCH",
      tracker_disagreements: [...p.tracker.disagreements],
    },
    diagnostic: {
      confirmed: observed,
      post_open_frames: ev.frames.post.length,
      frames: ev.frames.post.map((frame) => {
        const verdict = p.frames.find((x) => x.frame === frame);
        return {
          raw_uri: frame.uri,
          uri_comparison: verdict === undefined ? "REJECTED" : verdict.uri.result,
          uri_reject_reason: verdict === undefined ? "FRAME_MALFORMED" : verdict.uri.reason,
          diagnostics_count: frame.diagnostics === null ? 0 : frame.diagnostics.length,
          start_byte: frame.startByte,
          end_byte: frame.endByte,
          params_keys: [...frame.paramsKeys],
        };
      }),
      fields: fieldsOf(),
    },
    engine_rule_count_passed: engineNumbers.rules,
    engine: {
      targets: engineNumbers.targets,
      matches_before: engineNumbers.matchesBefore,
      scanned_files: engineNumbers.scanned,
      matches: engineNumbers.matches,
      skipped: engineNumbers.skipped,
      errors_text: engineNumbers.errorsText,
    },
    external_command: {
      attempt_lines: {
        pre: p.log.externalCommand.preCount,
        post: p.log.externalCommand.postCount,
        shape_ok: p.log.externalCommand.shapeOk,
        attempts: p.log.externalCommand.attempts.map((a) => ({
          segment: a.segment,
          window: a.window,
          shape: a.shape,
        })),
        problems: [...p.log.externalCommand.problems],
      },
      git_process_creation: {
        established: gitImages.length > 0,
        basis: gitImages.length > 0 ? "GIT_IMAGE_OBSERVED" : "NOT_ESTABLISHED_NO_GIT_IMAGE_SAMPLED",
        observed_images: gitImages,
        sampling: { samples: f.live.processes.samples, failures: f.live.processes.failures },
      },
    },
    server_messages: {
      frames: p.stdout.frames,
      server_requests: {
        count: p.stdout.serverRequestCount,
        allowed: p.stdout.serverRequests.filter((r) => r.allowed).length,
        methods: p.stdout.serverRequests.map((r) => r.method),
        after_did_open: ev.postOpenServerRequests,
      },
      progress_notifications: p.stdout.progressNotifications,
      post_open_progress_notifications: ev.postOpenProgressNotifications,
      diagnostics_frames: p.stdout.diagnosticsCount,
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
      pre_open_counts: countsRecord(p.log.pre.counts),
      post_open_counts: countsRecord(p.log.post.counts),
      loading_paths_match_probe: pathsMatch,
    },
    target: {
      file: LSP_SCAN_TARGET_FILE,
      expected_sha256: LSP_SCAN_TARGET_SHA256,
      source_sha256: f.target?.sourceSha256 ?? null,
      after_write_sha256: f.target?.afterWriteSha256 ?? null,
      after_run_sha256: f.target?.afterRunSha256 ?? null,
    },
    probe: {
      file: LSP_SCAN_PROBE_FILE,
      expected_sha256: LSP_SCAN_PROBE_SHA256,
      source_sha256: f.probe?.sourceSha256 ?? null,
      after_copy_sha256: f.probe?.afterCopySha256 ?? null,
      after_run_sha256: f.probe?.afterRunSha256 ?? null,
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
      also: [...(f.also ?? [])],
      abort:
        f.abort === null || f.abort === undefined
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
    // 세워 주는 것은 "실제 출처의 성공"뿐이다. 스텁·null 출처의 성공은 evidence_scope 가 SYNTHETIC_STUB_ONLY 이므로 아무것도 세우지 않는다.
    established:
      observed && f.provenance === "real"
        ? [
            "ONE_SYNTHETIC_INPUT_DIAGNOSTIC_REACTION",
            "ENGINE_GIVEN_RULE_COUNT_PARTIAL_OBSERVATION",
            "DIAGNOSTIC_FIELDS_CONFIRMED",
          ]
        : [],
    not_established: {
      rule_detection_performance_in_general: "NOT_ESTABLISHED",
      real_repository_scan_security: "NOT_ESTABLISHED",
      negative_controls: "NOT_ESTABLISHED",
      control_reference_qualification: "NOT_ESTABLISHED",
      whole_isolation_effect: "NOT_ESTABLISHED",
      binary_source_correspondence: "NOT_ESTABLISHED",
      pin_and_log_format_verification: "NOT_ESTABLISHED",
      loaded_rule_count: "PARTIAL_OBSERVATION_ONLY",
      git_process_creation: "NOT_ESTABLISHED",
    },
    real_binary_verified: false,
    evidence_scope:
      f.provenance !== "real"
        ? "SYNTHETIC_STUB_ONLY"
        : observed
          ? "ONE_SYNTHETIC_INPUT_REACTION"
          : "NONE_ESTABLISHED",
  };
}
