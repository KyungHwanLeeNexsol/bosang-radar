// LSP-SCAN-1 실시간 감시기(순수 모듈): stderr 줄·stdout 메시지를 먹으면 (a) 중단 사유(A1~A6)를 찾고, (b) 규칙 로딩 장벽이 끝났는지,
// (c) 두 묶음(진단 알림, 엔진 로그)이 언제 완성됐고 settle 창이 언제 끝나는지를 알려 준다. 파일·프로세스·시계·네트워크를 만지지 않는다.
//
// 이 파일이 맡는 것은 **일정을 잡고 위험을 끊는 일**뿐이다. 판정은 lsp-scan-record.ts 가 원문 바이트에서 다시 만든다(deriveScanEvidence).
// 감시기의 보기는 같은 함수를 먹인 것이라 사후 재해석과 어긋날 수 없고, 어긋나면 기록이 TRACKER_DISAGREEMENT 로 남긴다.
//
// 계약 정정(브리프 4절)이 이 파일에서 지켜지는 방식:
//  · 스트림 사이의 도착 순서는 어떤 판단에도 쓰지 않는다. 장벽 완료·묶음 완성·settle 창은 스트림별 바이트 위치와 청크 도착 시각으로만 정해진다.
//  · 중단 결정은 "무엇이 왔는가"로만 정해진다. 어느 스트림이 먼저 왔는가는 영향이 없다(동시에 여러 위반이 오면 먼저 본 것이 사유가 될 뿐 중단 자체는 같다).
//
// 실시간 중단과 판정의 분담(브리프 5절, 계획 5.2절):
//  · 중단(kill)은 격리를 위협하거나 관측을 무의미하게 만드는 신호에만 건다: 작업 영역 스캔(A1), 사전 신호(A1), 레지스트리·내려받기·토큰·설정 파일(A2),
//    허용 밖 서버 요청과 didOpen 뒤의 서버 요청(A6), 모양이나 건수가 다른 외부 명령 시도 줄(A1).
//  · ERROR 머리말·두 번째 스캔 줄·두 번째 진단 알림·다른 URI·필드 불일치는 중단하지 않는다. 서버를 끝까지 지켜본 뒤 판정이
//    SCAN_FAILED:ENGINE_ERROR / NOT_CONFIRMED:EXTRA_SCAN / DUPLICATE_DIAGNOSTICS 같은 각자의 사유로 가른다(그래서 사유가 가려지지 않는다).
//  · didOpen 전의 스캔 증거 모양(줄·진단 프레임)도 중단하지 않는다 — 기록이 PRE_OPEN_EVIDENCE 로 가르고, 실행기는 그때 didOpen 을 보내지 않는다.
//
// 결합 감시기(ScanLiveWatch)는 순수 JSON 대본(runScanWatchScript)으로도 돌릴 수 있다: 이벤트 = {stream, 바이트(hex), tMs}와 표시. PowerShell 러너의 같은
// 구현과 골든 대조를 하려는 용도다.

import { FrameDecoder, type FrameDecodeError } from "./framing";
import {
  ABORT_NETWORK_PATTERNS,
  INIT_ERROR_LOG_PATTERN,
  classifyServerMessage,
  type WatchedRole,
} from "./lsp-min";
import {
  LSP_RULES_PROBE_FILE,
  MAX_PROGRESS_CREATE,
  PUBLISH_DIAGNOSTICS_METHOD,
  RULES_REFRESHED_METHOD,
  absorbStdoutMessage,
  emptyStdoutAnalysis,
  isValidProgressCreate,
  rulesRootViolation,
  type RulesStdoutAnalysis,
} from "./lsp-rules";
import { LSP_SCAN_INIT_ID, LSP_SCAN_SHUTDOWN_ID, LSP_SCAN_TARGET_FILE } from "./lsp-scan";
import type { ScanAbortCondition } from "./lsp-scan";
import {
  ScanProgressTracker,
  type ScanProgressAnalysis,
  type ScanProgressState,
} from "./lsp-scan-progress";
import {
  ScanEvidenceTracker,
  type ScanEvidenceInput,
  type ScanLiveView,
  type ScanTrackerSnapshot,
} from "./lsp-scan-record";
import { FORBIDDEN_NETWORK_KEYS, PRE_INITIALIZED_KEYS, comparableLoadingPath } from "./rules-log";
import { analyzeScanLog, type ScanLogAnalysis, type ScanLogKey } from "./scan-log";
import type { JsonRpcMessage } from "./types";

// ── 공통 ──────────────────────────────────────────────────────────

export interface ScanAbort {
  condition: ScanAbortCondition;
  detail: string;
}

function tokenOf(text: string): string {
  return text.replace(/[^A-Za-z0-9_.:/$ -]/g, "?").slice(0, 80);
}

/** 작업 영역 스캔을 말하는 키: 이 관측은 작업 영역 전체를 스캔시키지 않는다(`didOpen` 한 파일만). */
const WORKSPACE_SCAN_KEYS: readonly ScanLogKey[] = Object.freeze([
  "scanningWorkspace",
  "scannedWorkspace",
  "scanningWorkspaceComplete",
  "fullScan",
]);

/**
 * 감시 폴더 안의 한 파일이 금지된 변경인가(A5′). RULES 와 달리 작업 영역에는 **합성 대상 파일 하나**가 있어야 하고(이름 일치, 대소문자 무시: Windows)
 * 그 밖의 파일은 모두 위반이다. 규칙 폴더에는 프로브 한 개만, 홈은 지문 폴더 아래만 허용한다.
 */
export function scanWatchedViolation(role: WatchedRole, relativePath: string): boolean {
  if (role === "WORKSPACE")
    return relativePath.replace(/\\/g, "/").toLowerCase() !== LSP_SCAN_TARGET_FILE;
  return rulesRootViolation(role, relativePath);
}

export {
  LSP_RULES_PROBE_FILE as SCAN_WATCH_PROBE_FILE,
  LSP_SCAN_TARGET_FILE as SCAN_WATCH_TARGET_FILE,
};

// ── stdout 추적기 ──────────────────────────────────────────────────

/**
 * stdout 실시간 감시: 메시지마다 중단 사유를 판단한다.
 * 응답은 이 관측의 id(`lsp-scan-init-1`, `lsp-scan-shutdown-1`)로만 알아본다(RULES 추적기는 RULES 의 id 로 알아본다).
 */
export class ScanStdoutTracker {
  readonly analysis: RulesStdoutAnalysis = emptyStdoutAnalysis();
  initializedSent = false;
  didOpenSent = false;
  /** initialized 뒤 didOpen 전에 온 진단 알림 수. 중단하지 않고 사전 증거로 센다. */
  preOpenDiagnostics = 0;
  private allowedRequests = 0;

  onMessage(message: JsonRpcMessage): ScanAbort | null {
    const kind = classifyServerMessage(message);
    if (kind === "response") {
      const a = this.analysis;
      a.frames += 1;
      if (message.id === LSP_SCAN_INIT_ID) {
        if (a.initMessage === null) a.initMessage = message;
        else a.initDuplicate = true;
      } else if (message.id === LSP_SCAN_SHUTDOWN_ID) a.shutdownResponseSeen = true;
      else a.unmatchedResponses += 1;
      return null;
    }
    absorbStdoutMessage(this.analysis, message);
    if (kind === "notification") {
      const method = String(message.method);
      if (method === PUBLISH_DIAGNOSTICS_METHOD) {
        if (!this.initializedSent)
          return { condition: "A1", detail: `PRE_INITIALIZED:${method.split("/")[1]}` };
        if (!this.didOpenSent) this.preOpenDiagnostics += 1;
        return null;
      }
      if (method === RULES_REFRESHED_METHOD && !this.initializedSent) {
        return { condition: "A1", detail: "PRE_INITIALIZED:rulesRefreshed" };
      }
      return null;
    }
    if (kind === "server-request") {
      if (!isValidProgressCreate(message)) {
        return { condition: "A6", detail: tokenOf(String(message.method)) };
      }
      this.allowedRequests += 1;
      if (this.didOpenSent) return { condition: "A6", detail: "REQUEST_AFTER_DID_OPEN" };
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

// ── 장벽 평가 ──────────────────────────────────────────────────────

export interface ScanBarrierStatus {
  /** stdout `semgrep/rulesRefreshed` 알림을 한 번 이상 받았다. */
  rulesRefreshedSeen: boolean;
  /** 맨줄 `Scanned open documents` 가 정상 모양으로 줄 끝까지 왔다. */
  scannedOpenDocumentsSeen: boolean;
  /**
   * 초기 진행 메시지(규칙 새로고침·열린 문서 스캔의 create·begin·end)의 상태(lsp-scan-progress.ts). stdout 에서 완전한 프레임으로 읽힌 것만 센다.
   * COMPLETE 만 `didOpen` 을 허용한다. INCOMPLETE 는 더 기다릴 수 있는 상태, INVALID 는 이미 계약을 어긴 상태다.
   */
  progressState: ScanProgressState;
  /** 장벽의 양쪽 절반이 모두 왔고 초기 진행 메시지의 상태가 더 기다려서 달라질 수 없는 쪽(COMPLETE·INVALID)이다(기다림의 종료 조건). */
  ready: boolean;
  /** ready 이고 사전 구간의 모든 신호가 계약대로다 — `didOpen` 을 보내도 되는 장벽. */
  clean: boolean;
  /** clean 이 아닌 사유 토큰(값은 싣지 않는다). */
  problems: string[];
}

const BARE_KEYS: readonly ScanLogKey[] = [
  "refreshingRules",
  "rulesRefreshed",
  "scanningOpenDocuments",
  "scannedOpenDocuments",
];

function upperKey(key: string): string {
  return key.replace(/([A-Z])/g, "_$1").toUpperCase();
}

/** stderr 절반만 평가한다(맨줄 4개의 수와 순서, 프로브 로딩 쌍, Got 0 errors, No targets 1회, 사전 구간의 다른 신호가 없음). */
function stderrBarrierProblems(
  log: ScanLogAnalysis,
  probePath: string | null
): { scannedSeen: boolean; problems: string[] } {
  const problems: string[] = [];
  const pre = log.lines.filter((l) => l.segment === "PRE_OPEN" && l.terminated);
  const linesOf = (key: ScanLogKey) => pre.filter((l) => l.key === key);
  const okOf = (key: ScanLogKey) => linesOf(key).filter((l) => l.shape === "OK");
  const okAt: (number | null)[] = BARE_KEYS.map((key) => {
    const ok = okOf(key);
    if (ok.length !== 1 || linesOf(key).length !== 1) problems.push(`${key}_COUNT_${ok.length}`);
    return ok.length === 1 ? ok[0].startByte : null;
  });
  const scannedSeen = okOf("scannedOpenDocuments").length >= 1;
  if (okAt.every((x) => x !== null)) {
    const at = okAt as number[];
    for (let i = 1; i < at.length; i += 1) if (at[i] <= at[i - 1]) problems.push("ORDER");
  }
  const loading = okOf("loading");
  const done = okOf("doneLoading");
  if (loading.length !== 1) problems.push(`LOADING_COUNT_${loading.length}`);
  if (done.length !== 1) problems.push(`DONE_LOADING_COUNT_${done.length}`);
  const want = probePath === null ? null : comparableLoadingPath(probePath);
  if (want === null) problems.push("LOADING_PATH_UNVERIFIABLE");
  for (const line of [...loading, ...done]) {
    if (want !== null && comparableLoadingPath(String(line.params.path)) !== want) {
      problems.push("LOADING_PATH_UNEXPECTED");
      break;
    }
  }
  if (loading.length === 1 && done.length === 1) {
    if (loading[0].startByte >= done[0].startByte) problems.push("ORDER");
    if (okAt[0] !== null && okAt[1] !== null) {
      for (const line of [loading[0], done[0]]) {
        if (line.startByte < okAt[0] || line.startByte > okAt[1]) problems.push("ORDER");
      }
    }
  }
  const got = okOf("gotErrors");
  if (got.length !== 1) problems.push(`GOT_ERRORS_COUNT_${got.length}`);
  else if (got[0].params.count !== 0) problems.push("GOT_ERRORS_NONZERO");
  const noTargets = okOf("noTargets");
  if (noTargets.length !== 1) problems.push(`NO_TARGETS_COUNT_${noTargets.length}`);
  else if (okAt[2] !== null && okAt[3] !== null) {
    if (noTargets[0].startByte < okAt[2] || noTargets[0].startByte > okAt[3])
      problems.push("ORDER");
  }
  if (okOf("ciDisabled").length < 1) problems.push("CI_DISABLED_ABSENT");
  if (log.pre.scanEvidence.length > 0) problems.push("PRE_OPEN_EVIDENCE");
  for (const [key, count] of Object.entries(log.pre.counts)) {
    if (count.mismatch > 0 && key !== "externalCommand")
      problems.push(`SHAPE_MISMATCH_${upperKey(key)}`);
  }
  for (const e of log.pre.extras) problems.push(`PRE_${e.kind}`);
  const c = log.counters;
  if (c.malformedHeaders > 0 || c.orphanBareLines > 0 || log.openBlockAtEnd) {
    problems.push("LOG_SHAPE_UNRECOGNIZED");
  }
  return { scannedSeen, problems: [...new Set(problems)] };
}

/**
 * 규칙 로딩 장벽을 평가한다(순수). `ready` 는 기다림의 종료 조건이고, `clean` 은 `didOpen` 을 보내도 되는 조건이다.
 * 이 평가는 판정(lsp-scan-record 의 4번 조건)과 같은 것을 본다. 어긋나면 didOpen 을 보내지 않을 뿐이고 판정은 건드리지 않는다.
 */
export function evaluateScanBarrier(
  log: ScanLogAnalysis,
  rulesRefreshedCount: number,
  probePath: string | null,
  progress: ScanProgressAnalysis
): ScanBarrierStatus {
  const half = stderrBarrierProblems(log, probePath);
  const rulesRefreshedSeen = rulesRefreshedCount >= 1;
  const problems = [...half.problems];
  if (rulesRefreshedCount !== 1) problems.push(`RULES_REFRESHED_COUNT_${rulesRefreshedCount}`);
  // 초기 진행 메시지: stderr 신호가 다 왔어도 stdout 에서 두 수명주기가 완전한 프레임으로 읽히기 전에는 장벽이 열리지 않는다.
  for (const token of progress.problems) problems.push(token);
  const ready = rulesRefreshedSeen && half.scannedSeen && progress.state !== "INCOMPLETE";
  return {
    rulesRefreshedSeen,
    scannedOpenDocumentsSeen: half.scannedSeen,
    progressState: progress.state,
    ready,
    clean: ready && problems.length === 0,
    problems: [...new Set(problems)],
  };
}

// ── stderr 감시기 ──────────────────────────────────────────────────

export interface ScanStderrConfig {
  /** 설정된 작업 영역 폴더(외부 명령 시도 줄의 경로 비교용). */
  workspace: string | null;
  /** 프로브 파일의 전체 경로(로딩 줄의 경로 비교용). */
  probePath: string | null;
}

/** 청크 경계에 걸친 문구를 찾으려고 남기는 꼬리 길이: 감시하는 모든 부분 문자열 중 가장 긴 것보다 하나 짧다. */
const TAIL_KEEP =
  Math.max(...ABORT_NETWORK_PATTERNS.map((p) => p.length), INIT_ERROR_LOG_PATTERN.length) - 1;

function joinParts(parts: readonly Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out;
}

/**
 * stderr 실시간 감시. 줄 끝(LF)이 올 때마다 지금까지의 **완성된 줄**을 사후 해석과 같은 함수(analyzeScanLog)로 다시 읽어 중단 사유를 찾는다.
 * 부분 줄은 신호로 읽지 않는다(스트림이 끝나는 end() 에서만 마지막 줄을 본다). 레지스트리·내려받기 문구는 줄이 아직 덜 왔어도 청크 꼬리까지 이어 붙여 찾는다.
 */
export class ScanStderrWatcher {
  private parts: Uint8Array[] = [];
  private total = 0;
  private readonly decoder = new TextDecoder("utf-8", { fatal: false, ignoreBOM: true });
  private tail = "";
  private _hit: ScanAbort | null = null;
  private _initErrorLogged = false;
  private initializedOffset: number | null = null;
  private didOpenOffset: number | null = null;
  private _log: ScanLogAnalysis;
  private _scannedSeen = false;

  constructor(private readonly config: ScanStderrConfig) {
    this._log = analyzeScanLog(new Uint8Array(0), {
      workspace: config.workspace,
      didOpenOffset: null,
    });
  }

  get hit(): ScanAbort | null {
    return this._hit;
  }
  get initErrorLogged(): boolean {
    return this._initErrorLogged;
  }
  get checkedBytes(): number {
    return this.total;
  }
  /** 지금까지 받은 완성된 줄의 해석. */
  get log(): ScanLogAnalysis {
    return this._log;
  }
  /** 장벽의 stderr 쪽 절반이 왔다: 맨줄 `Scanned open documents` 가 사전 구간에 정상 모양으로 줄 끝까지 왔다(싼 값; 줄이 끝날 때만 다시 계산한다). */
  get scannedOpenDocumentsSeen(): boolean {
    return this._scannedSeen;
  }
  /** 장벽의 stderr 쪽 절반(stdout 쪽은 결합 감시기가 더한다). */
  get barrier(): { scannedOpenDocumentsSeen: boolean; clean: boolean; problems: string[] } {
    const half = stderrBarrierProblems(this._log, this.config.probePath);
    return {
      scannedOpenDocumentsSeen: half.scannedSeen,
      clean: half.scannedSeen && half.problems.length === 0,
      problems: half.problems,
    };
  }

  /** `initialized` 를 쓰기 직전에 부른다: 이 위치 앞에 나온 새로고침·열린 문서 스캔 줄만 "initialized 이전"이다. */
  markInitializedSent(): void {
    this.initializedOffset ??= this.total;
  }
  /** `didOpen` 을 쓰기 직전에 부른다: 이 위치부터가 사후 구간이다(외부 명령 시도 줄의 구간 분류에 쓴다). */
  markDidOpenSent(): void {
    if (this.didOpenOffset !== null) return;
    this.didOpenOffset = this.total;
    this.reanalyze(false);
  }

  private reanalyze(includeTail: boolean): void {
    const all = joinParts(this.parts, this.total);
    let end = all.byteLength;
    if (!includeTail) {
      end = all.lastIndexOf(0x0a) + 1;
    }
    this._log = analyzeScanLog(all.subarray(0, end), {
      workspace: this.config.workspace,
      didOpenOffset: this.didOpenOffset,
    });
    this._scannedSeen = this._log.lines.some(
      (l) =>
        l.segment === "PRE_OPEN" &&
        l.terminated &&
        l.key === "scannedOpenDocuments" &&
        l.shape === "OK"
    );
  }

  /** 새 청크를 먹이고, 이번에 처음 찾은 중단 사유가 있으면 돌려준다(이미 찾았다면 null). */
  push(chunk: Uint8Array): ScanAbort | null {
    if (chunk.byteLength === 0) return null;
    this.total += chunk.byteLength;
    this.parts.push(Uint8Array.from(chunk));
    const text = this.decoder.decode(chunk, { stream: true });
    const window = (this.tail + text).toLowerCase();
    if (window.includes(INIT_ERROR_LOG_PATTERN)) this._initErrorLogged = true;
    this.tail = window.slice(Math.max(0, window.length - TAIL_KEEP));
    let found: ScanAbort | null = null;
    if (chunk.includes(0x0a)) {
      this.reanalyze(false);
      found = this.violationOf(this._log);
    }
    if (found === null) {
      for (const pattern of ABORT_NETWORK_PATTERNS) {
        if (window.includes(pattern)) {
          found = { condition: "A2", detail: pattern };
          break;
        }
      }
    }
    return this.record(found);
  }

  /** 스트림이 끝났다: 개행 없는 마지막 줄도 본다. */
  end(): ScanAbort | null {
    this.reanalyze(true);
    return this.record(this.violationOf(this._log));
  }

  private record(found: ScanAbort | null): ScanAbort | null {
    if (found !== null && this._hit === null) {
      this._hit = found;
      return found;
    }
    return null;
  }

  /** 줄 위치(첫 바이트)가 가장 앞선 위반 하나. */
  private violationOf(log: ScanLogAnalysis): ScanAbort | null {
    const found: { at: number; abort: ScanAbort }[] = [];
    for (const l of log.lines) {
      if ((FORBIDDEN_NETWORK_KEYS as readonly string[]).includes(l.key)) {
        found.push({ at: l.startByte, abort: { condition: "A2", detail: l.key } });
      } else if (WORKSPACE_SCAN_KEYS.includes(l.key)) {
        found.push({ at: l.startByte, abort: { condition: "A1", detail: l.key } });
      } else if (
        (PRE_INITIALIZED_KEYS as readonly string[]).includes(l.key) &&
        (this.initializedOffset === null || l.startByte < this.initializedOffset)
      ) {
        found.push({
          at: l.startByte,
          abort: { condition: "A1", detail: `PRE_INITIALIZED:${l.key}` },
        });
      }
    }
    const seen = new Map<string, number>();
    for (const a of [...log.externalCommand.attempts].sort((x, y) => x.startByte - y.startByte)) {
      if (a.shape !== "OK") {
        found.push({
          at: a.startByte,
          abort: { condition: "A1", detail: `EXTERNAL_COMMAND_SHAPE:${a.shape}` },
        });
        continue;
      }
      const slot = `${a.segment}:${a.window}`;
      const n = (seen.get(slot) ?? 0) + 1;
      seen.set(slot, n);
      if (a.window === "OTHER" || n > 1) {
        found.push({
          at: a.startByte,
          abort: { condition: "A1", detail: "EXTERNAL_COMMAND_COUNT" },
        });
      }
    }
    if (found.length === 0) return null;
    found.sort((x, y) => x.at - y.at);
    return found[0].abort;
  }
}

// ── 결합 감시기 ────────────────────────────────────────────────────

export interface ScanWatchConfigJson {
  workspace: string | null;
  expectedTargetUri: string | null;
  probePath: string | null;
  scanMs: number;
  settleMs: number;
  maxStdoutBytes: number;
}

export interface ScanFeedResult {
  abort: ScanAbort | null;
  frameError: FrameDecodeError | null;
  /** 이번 청크로 완성된 stdout 메시지 수. */
  messages: number;
  /** 이번 청크로 초기화 응답이 처음 도착했다. */
  initArrived: boolean;
}

export interface ScanLiveSnapshot extends ScanTrackerSnapshot {
  rulesRefreshedSeen: boolean;
  scannedOpenDocumentsSeen: boolean;
}

/**
 * 실행기가 쓰는 결합 감시기. 원문 바이트·청크 시간표·표시는 증거 추적기(ScanEvidenceTracker)가 쌓고, 중단은 stdout 추적기·stderr 감시기가 정한다.
 * 보기(스냅샷)는 줄 끝이 온 청크나 프레임이 완성된 청크에서만 다시 만든다: 부분 줄·부분 프레임은 어떤 묶음도 완성시킬 수 없으므로 결과가 같다.
 */
export class ScanLiveWatch {
  readonly tracker: ScanEvidenceTracker;
  readonly stdoutTracker = new ScanStdoutTracker();
  /** 초기 진행 메시지 장벽(lsp-scan-progress.ts): 완전한 프레임으로 읽힌 stdout 메시지만 받는다. `didOpen` 직전에 얼린다. */
  readonly progress = new ScanProgressTracker();
  readonly stderrWatcher: ScanStderrWatcher;
  private readonly decoder: FrameDecoder;
  private broken = false;
  private _frameError: FrameDecodeError | null = null;
  private _framesChecked = 0;
  private stdoutLen = 0;
  private stderrLen = 0;
  private memo: ScanTrackerSnapshot | null = null;

  constructor(private readonly config: ScanWatchConfigJson) {
    this.tracker = new ScanEvidenceTracker({
      workspace: config.workspace,
      expectedTargetUri: config.expectedTargetUri,
      scanMs: config.scanMs,
      settleMs: config.settleMs,
    });
    this.stderrWatcher = new ScanStderrWatcher({
      workspace: config.workspace,
      probePath: config.probePath,
    });
    this.decoder = new FrameDecoder({ maxMessageBytes: config.maxStdoutBytes });
  }

  get stdoutBytes(): number {
    return this.stdoutLen;
  }
  get stderrBytes(): number {
    return this.stderrLen;
  }
  get framesChecked(): number {
    return this._framesChecked;
  }
  get frameError(): FrameDecodeError | null {
    return this._frameError;
  }

  feedStdout(bytes: Uint8Array, tMs: number): ScanFeedResult {
    if (bytes.byteLength === 0)
      return { abort: null, frameError: null, messages: 0, initArrived: false };
    this.tracker.feedStdout(bytes, tMs);
    this.stdoutLen += bytes.byteLength;
    let abort: ScanAbort | null = null;
    let frameError: FrameDecodeError | null = null;
    let messages = 0;
    let initArrived = false;
    if (!this.broken) {
      const hadInit = this.stdoutTracker.analysis.initMessage !== null;
      const pushed = this.decoder.push(bytes);
      for (const message of pushed.messages) {
        messages += 1;
        this._framesChecked += 1;
        this.progress.absorb(message);
        abort ??= this.stdoutTracker.onMessage(message);
      }
      initArrived = !hadInit && this.stdoutTracker.analysis.initMessage !== null;
      if (pushed.error) {
        this.broken = true;
        this._frameError = pushed.error;
        frameError = pushed.error;
      }
      if (messages > 0) this.memo = null;
    }
    return { abort, frameError, messages, initArrived };
  }

  /** stdout 이 끝났다: 덜 온 프레임이 있으면 TRUNCATED 오류를 한 번 돌려준다. */
  endStdout(): FrameDecodeError | null {
    if (this.broken) return null;
    const tail = this.decoder.end();
    if (tail.error) {
      this.broken = true;
      this._frameError = tail.error;
      return tail.error;
    }
    return null;
  }

  feedStderr(bytes: Uint8Array, tMs: number): ScanAbort | null {
    if (bytes.byteLength === 0) return null;
    this.tracker.feedStderr(bytes, tMs);
    this.stderrLen += bytes.byteLength;
    if (bytes.includes(0x0a)) this.memo = null;
    return this.stderrWatcher.push(bytes);
  }

  endStderr(): ScanAbort | null {
    return this.stderrWatcher.end();
  }

  markInitializedSent(): void {
    this.stdoutTracker.initializedSent = true;
    this.stderrWatcher.markInitializedSent();
  }

  markBarrierDone(tMs: number): void {
    this.tracker.markBarrierDone(tMs);
    this.memo = null;
  }

  /** `didOpen` 을 쓰기 직전에 부른다: 두 스트림에서 이미 읽은 바이트 수가 사전/사후의 경계가 된다. */
  markDidOpenSent(tMs: number): void {
    this.tracker.markDidOpenSent(tMs);
    this.stdoutTracker.didOpenSent = true;
    this.stderrWatcher.markDidOpenSent();
    // 이 순간까지 완전히 읽은 stdout 프레임만 사전 장벽의 증거다. 이후에 도착하는 프레임은 장벽을 바꾸지 못한다.
    this.progress.freeze();
    this.memo = null;
  }

  /**
   * 장벽의 양쪽 절반(stdout rulesRefreshed, stderr Scanned open documents)이 모두 왔고 초기 진행 메시지가 더 기다려서 달라질 수 없는 상태다 —
   * 기다림의 종료 조건(싼 값). `didOpen` 을 보내도 되는지(clean)는 barrierStatus() 가 따로 평가한다.
   */
  barrierReady(): boolean {
    return (
      this.stdoutTracker.rulesRefreshedSeen &&
      this.stderrWatcher.scannedOpenDocumentsSeen &&
      this.progress.analysis().state !== "INCOMPLETE"
    );
  }

  /** 초기 진행 메시지가 stdout 에서 모두 완전한 프레임으로 읽혔다(송신 방어선이 확인하는 값). */
  progressComplete(): boolean {
    return this.progress.analysis().complete;
  }

  barrierStatus(): ScanBarrierStatus {
    const status = evaluateScanBarrier(
      this.stderrWatcher.log,
      this.stdoutTracker.analysis.rulesRefreshedCount,
      this.config.probePath,
      this.progress.analysis()
    );
    if (
      this.stdoutTracker.preOpenDiagnostics > 0 &&
      !status.problems.includes("PRE_OPEN_EVIDENCE")
    ) {
      status.problems.push("PRE_OPEN_EVIDENCE");
      status.clean = false;
    }
    return status;
  }

  private base(): ScanTrackerSnapshot {
    this.memo ??= this.tracker.snapshot(null);
    return this.memo;
  }

  /** 지금까지의 증거 보기. nowMs 를 주면 마감 만료·settle 만료를 그 시각으로 따진다. */
  snapshot(nowMs: number | null = null): ScanLiveSnapshot {
    const b = this.base();
    const known = typeof nowMs === "number" && Number.isFinite(nowMs);
    return {
      ...b,
      deadlineExpired:
        known && b.deadlineAtMs !== null && nowMs > b.deadlineAtMs && b.bothCompleteAtMs === null,
      settleElapsed: known && b.settleEndMs !== null && nowMs >= b.settleEndMs,
      rulesRefreshedSeen: this.stdoutTracker.rulesRefreshedSeen,
      scannedOpenDocumentsSeen: this.stderrWatcher.scannedOpenDocumentsSeen,
    };
  }

  /** 사실(ScanFacts.liveView)에 싣는 마지막 보기. */
  liveView(): ScanLiveView {
    const b = this.base();
    return {
      preOpenEvidence: b.preOpenEvidence,
      diagnosticsState: b.diagnosticsState,
      diagnosticsCompleteAtMs: b.diagnosticsCompleteAtMs,
      logState: b.logState,
      logCompleteAtMs: b.logCompleteAtMs,
      bothCompleteAtMs: b.bothCompleteAtMs,
    };
  }

  toEvidenceInput(): ScanEvidenceInput {
    return this.tracker.toEvidenceInput();
  }
}

// ── JSON 대본 ──────────────────────────────────────────────────────

export type ScanWatchEvent =
  | { op: "stdout" | "stderr"; hex: string; tMs: number }
  | { op: "initializedSent" }
  | { op: "barrierDone"; tMs: number }
  | { op: "didOpenSent"; tMs: number }
  | { op: "stdoutEnd" | "stderrEnd" };

export interface ScanWatchScript {
  config: ScanWatchConfigJson;
  events: ScanWatchEvent[];
}

export function scanHexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) throw new Error("hex 조각이 올바르지 않다");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export interface ScanWatchSnapshotJson {
  preOpenEvidence: boolean;
  diagnosticsState: string;
  diagnosticsCompleteAtMs: number | null;
  logState: string;
  logCompleteAtMs: number | null;
  bothCompleteAtMs: number | null;
  deadlineAtMs: number | null;
  settleStartMs: number | null;
  settleEndMs: number | null;
  violations: string[];
}

export interface ScanWatchStep {
  i: number;
  op: string;
  abort: ScanAbort | null;
  frameError: { kind: string; detail: string; atByte: number } | null;
  initArrived: boolean;
  barrier: Pick<
    ScanBarrierStatus,
    | "rulesRefreshedSeen"
    | "scannedOpenDocumentsSeen"
    | "progressState"
    | "ready"
    | "clean"
    | "problems"
  >;
  snapshot: ScanWatchSnapshotJson;
}

export interface ScanWatchTranscript {
  steps: ScanWatchStep[];
  final: {
    snapshot: ScanWatchSnapshotJson;
    extras: {
      source: string;
      kind: string;
      key: string | null;
      atMs: number | null;
      phase: string;
    }[];
    stdoutBytes: number;
    stderrBytes: number;
    initErrorLogged: boolean;
  };
}

function snapshotJson(watch: ScanLiveWatch): ScanWatchSnapshotJson {
  const s = watch.snapshot(null);
  return {
    preOpenEvidence: s.preOpenEvidence,
    diagnosticsState: s.diagnosticsState,
    diagnosticsCompleteAtMs: s.diagnosticsCompleteAtMs,
    logState: s.logState,
    logCompleteAtMs: s.logCompleteAtMs,
    bothCompleteAtMs: s.bothCompleteAtMs,
    deadlineAtMs: s.deadlineAtMs,
    settleStartMs: s.settleStartMs,
    settleEndMs: s.settleEndMs,
    violations: [...s.violations],
  };
}

/**
 * 대본을 순서대로 결합 감시기에 먹이고 단계마다의 보기를 돌려준다(순수, 시계·무작위 없음). 출력은 평범한 JSON 값이다.
 * 각 이벤트가 같은 단계 번호의 `steps[i]` 를 만든다.
 */
export function runScanWatchScript(script: ScanWatchScript): ScanWatchTranscript {
  const watch = new ScanLiveWatch(script.config);
  const steps: ScanWatchStep[] = [];
  script.events.forEach((event, i) => {
    let abort: ScanAbort | null = null;
    let frameError: FrameDecodeError | null = null;
    let initArrived = false;
    switch (event.op) {
      case "stdout": {
        const r = watch.feedStdout(scanHexToBytes(event.hex), event.tMs);
        abort = r.abort;
        frameError = r.frameError;
        initArrived = r.initArrived;
        break;
      }
      case "stderr":
        abort = watch.feedStderr(scanHexToBytes(event.hex), event.tMs);
        break;
      case "initializedSent":
        watch.markInitializedSent();
        break;
      case "barrierDone":
        watch.markBarrierDone(event.tMs);
        break;
      case "didOpenSent":
        watch.markDidOpenSent(event.tMs);
        break;
      case "stdoutEnd":
        frameError = watch.endStdout();
        break;
      case "stderrEnd":
        abort = watch.endStderr();
        break;
    }
    const b = watch.barrierStatus();
    steps.push({
      i,
      op: event.op,
      abort,
      frameError:
        frameError === null
          ? null
          : { kind: frameError.kind, detail: frameError.detail, atByte: frameError.atByte },
      initArrived,
      barrier: {
        rulesRefreshedSeen: b.rulesRefreshedSeen,
        scannedOpenDocumentsSeen: b.scannedOpenDocumentsSeen,
        progressState: b.progressState,
        ready: b.ready,
        clean: b.clean,
        problems: [...b.problems],
      },
      snapshot: snapshotJson(watch),
    });
  });
  const ev = watch.tracker.evidence();
  return {
    steps,
    final: {
      snapshot: snapshotJson(watch),
      extras: ev.extras.map((e) => ({
        source: e.source,
        kind: e.kind,
        key: e.key,
        atMs: e.atMs,
        phase: e.phase,
      })),
      stdoutBytes: watch.stdoutBytes,
      stderrBytes: watch.stderrBytes,
      initErrorLogged: watch.stderrWatcher.initErrorLogged,
    },
  };
}
