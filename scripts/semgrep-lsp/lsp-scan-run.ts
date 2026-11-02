// LSP-SCAN-1 실행기: 포트로 받은 프로세스·시계·파일·수신기·프로세스 목록·해시 어댑터만으로 `semgrep.exe lsp --debug`를 한 번 띄워
//   initialize → initialized(1회) → 규칙 로딩 장벽 → didOpen(1회) → 두 묶음 완성 대기 → settle 감시 → shutdown → exit
// 로 끝낸다. 계약은 lsp-scan.ts, 일정을 잡는 실시간 감시는 lsp-scan-watch.ts, 판정과 기록은 lsp-scan-record.ts가 정한다(이 파일은 시간과 순서를 맡는다).
//
// lsp-rules-run.ts 의 구조를 따르되 별도 파일로 둔다: 그쪽은 `didOpen` 을 보내지 않는 계약이라 옵션을 달아 바꾸지 않는다.
// 이 파일은 child_process·fs·net·process.env 를 가져오지 않는다.
//
// 불변식:
//  · 요청 검사(checkScanRequest)에서 거절되면 폴더도 파일도 프로세스도 만들지 않는다. 쓰는 모든 경로(작업 영역, 합성 파일, 규칙 폴더, 홈, 임시)는
//    쓰기 전에 작업 폴더의 **실제** 안쪽(링크·junction·`..` 해소 뒤)인지 확인한다.
//  · 합성 파일과 규칙 복사본은 배타 쓰기 → 곧바로 해시 → 고정값과 대조 → (어긋나면 띄우지 않는다) 순서이고, 실행 뒤와 장벽에서 다시 잰다.
//  · stdin 에 쓰는 것은 initialize → initialized → didOpen → shutdown → exit 다섯뿐이고 쓰기 직전 방어선(assertAllowedScanOutbound)을 거친다.
//    거절되면 쓰지 않고 A10(SEND_REFUSED)으로 곧바로 강제 종료한다. didOpen 은 장벽 뒤에 정확히 한 번, 서버 요청에는 응답하지 않는다.
//  · didOpen 은 장벽의 stderr 쪽 신호가 계약대로 갖춰졌고(clean) 사전 증거가 없을 때만 보낸다. 그렇지 않으면 보내지 않고 정상 종료한다.
//  · 두 묶음은 didOpen 송신부터 scanMs 안에 완성돼야 한다. 연장도 재시도도 없다: 마감에서 기다림을 끝내고 정상 종료(shutdown → exit)로 간다.
//    settle 창은 **늦은 묶음**이 완성된 하니스 시각에서 settleMs 다.
//  · 중단 조건(A1~A7·A10)·전체 상한·출력 상한·프레임 오류·stdin 쓰기 오류·읽기 오류는 stdin 닫기 없이 곧바로 프로세스 트리를 강제 종료한다.
//  · 장벽·초기화 한도를 넘기면 shutdown·exit·didOpen 을 보내지 않고 stdin 을 닫은 뒤 유예 안에 안 끝나면 강제 종료한다. 한도나 유예를 늘리지 않는다.
//  · 함수는 던지지 않는다. 운영상의 실패는 전부 기록이 된다. 관측 판정(verdict)·프로세스 정리(cleanup.ok)·시스템 복구는 서로 다른 결과다.
//  · 시간은 주입된 Clock 뿐이다(Date.now·setTimeout 을 쓰지 않는다). 쓴 타이머는 끝에 모두 취소한다.

import { encodeFrame } from "./framing";
import {
  ALLOWED_IMAGES,
  WATCHED_ROLES,
  analyzeInitResponse,
  descendantsOf,
  imageNameOf,
  type ArtifactFacts,
  type DescendantResult,
  type StreamFacts,
  type WatchedRootFacts,
} from "./lsp-min";
import { LSP_RULES_PROBE_FILE, probePathOf } from "./lsp-rules";
import {
  LSP_SCAN_ARGS,
  LSP_SCAN_PROBE_SHA256,
  LSP_SCAN_SEND_ORDER,
  LSP_SCAN_TARGET_FILE,
  LSP_SCAN_TARGET_SHA256,
  assertAllowedScanOutbound,
  buildScanDidOpenMessage,
  buildScanExitMessage,
  buildScanInitializeMessage,
  buildScanInitializedMessage,
  buildScanShutdownMessage,
  checkScanRequest,
  resolveScanLimits,
  scanRootPath,
  scanTargetUri,
  type ScanLimits,
  type ScanRequestShape,
  type ScanSendLabel,
  type ScanTrigger,
} from "./lsp-scan";
import {
  buildScanRecord,
  type ScanChunk,
  type ScanFacts,
  type ScanObservation,
  type ScanSendFact,
} from "./lsp-scan-record";
import { ScanLiveWatch, scanWatchedViolation, type ScanAbort } from "./lsp-scan-watch";
import { keyIsSameOrInside } from "./path-containment";
import { sha256Hex } from "./sha";
import { DEFAULT_WHEEL_MAX_BYTES, type ArtifactHashPort } from "./tool-observation";
import type {
  ChildHandle,
  Clock,
  ExitInfo,
  FsPort,
  JsonRpcMessage,
  MetricsObserver,
  ProcessLister,
  ProcessPort,
  Provenance,
  TimerHandle,
} from "./types";

export interface ScanPorts {
  process: ProcessPort;
  clock: Clock;
  fs: Pick<FsPort, "mkdirp" | "listFilesRecursive" | "writeFileExclusive" | "physicalKey">;
  /** 필수: 읽을 수 없으면 실행하지 않는다. */
  receiver: MetricsObserver;
  /** 필수: 읽을 수 없으면 실행하지 않는다. */
  lister: ProcessLister;
  /** 필수: 합성 파일·프로브와 설치물의 해시를 같은 어댑터로 잰다. */
  hasher: ArtifactHashPort;
}

export interface ScanRequest extends ScanRequestShape {
  /** 핀의 서버 버전. 초기화 응답의 serverInfo.version 과 같아야만 `initialized` 를 보낸다. */
  expectedVersion?: string | null;
  signal?: AbortSignal;
}

/**
 * 시험 전용 이음새: 정해진 시점에 **허용되지 않아야 할** 송신을 시도해 쓰기 직전 방어선을 끝까지 시험한다.
 * 실제 진입 스크립트는 넘기지 않는다(넘기지 않으면 아무 일도 없다). 시도는 방어선을 거치므로 거절되면 쓰이지 않는다.
 */
export interface ScanAttemptedSend {
  after: "initialized" | "barrier" | "didOpen";
  label: ScanSendLabel;
  message: JsonRpcMessage;
}
export interface ScanRunOptions {
  attemptSends?: readonly ScanAttemptedSend[];
}

export interface ScanResult {
  record: ScanObservation;
  facts: ScanFacts;
  /** 원문 바이트(상한 안). 호출자가 저장소 밖 증거 폴더에 둔다. */
  raw: { stdout: Uint8Array; stderr: Uint8Array };
}

/** 이 이유들은 stdin 닫기 없이 곧바로 강제 종료한다. */
const IMMEDIATE: ReadonlySet<ScanTrigger> = new Set<ScanTrigger>([
  "LIVE_ABORT",
  "TOTAL_TIMEOUT",
  "OUTPUT_LIMIT",
  "FRAME_ERROR",
  "STDIN_ERROR",
  "STREAM_READ_FAILED",
  "CHILD_EXITED_EARLY",
]);

const CONSECUTIVE_FAILURES_TO_ABORT = 3;
const HOME_ROLE = "HOME_DIR" as const;

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return `${typeof error}: ${String(error)}`;
}

function emptyStream(): StreamFacts {
  return { bytes: new Uint8Array(0), total: 0, overflow: false, eof: false, readFailed: false };
}

function joinChunks(chunks: readonly Uint8Array[]): Uint8Array {
  let size = 0;
  for (const chunk of chunks) size += chunk.byteLength;
  const out = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}

type WaitResult = "ok" | "timeout" | "aborted";

class Run {
  private readonly clock: Clock;
  private readonly limits: ScanLimits;
  private readonly signal: AbortSignal | undefined;
  private t0 = 0;

  private child: ChildHandle | null = null;
  private provenance: Provenance | null = null;
  private spawnOk = false;
  private spawnAttempted = false;

  private readonly timers = new Set<TimerHandle>();
  private timerProblems = 0;
  private readonly waiters = new Set<() => void>();

  private readonly stdoutChunks: Uint8Array[] = [];
  private readonly stderrChunks: Uint8Array[] = [];
  private stdout: StreamFacts = emptyStream();
  private stderr: StreamFacts = emptyStream();
  private stdoutDone = false;
  private stderrDone = false;
  private readonly live: ScanLiveWatch;
  private frameError: ScanFacts["frameError"] = null;

  private initAtMs: number | null = null;
  private barrierReachedAtMs: number | null = null;
  private didOpenSentAtMs: number | null = null;
  private settleEndedAtMs: number | null = null;

  private exitInfo: ExitInfo | null = null;
  private exitAtMs: number | null = null;
  private stdinClosed = {
    byHarness: false,
    ok: null as boolean | null,
    tMs: null as number | null,
  };
  private killCount = 0;
  private firstKillMs: number | null = null;
  private killProblem = false;

  private trigger: ScanTrigger | null = null;
  private readonly also: ScanTrigger[] = [];
  private abortInfo: { condition: ScanAbort["condition"]; detail: string; tMs: number } | null =
    null;
  private immediate = false;

  private readonly sends: ScanSendFact[] = [];
  private expectedDidOpen: { uri: string; text: string } | null = null;

  private samplerStop = false;
  private samplerDone: Promise<void> = Promise.resolve();
  private sleepTimer: TimerHandle | null = null;
  private sleepResolve: (() => void) | null = null;
  private readonly samplerAbort = new AbortController();
  private receiverBaseline: number | null = null;
  private receiverFinal: number | null = null;
  private receiverSamples = 0;
  private receiverFailures = 0;
  private procSamples = 0;
  private procFailures = 0;
  private procConsecutiveFailures = 0;
  private maxDescendants = 0;
  private readonly imagesSeen = new Set<string>();
  private readonly disallowed = new Set<string>();
  private fileSamples = 0;
  private fileFailures = 0;
  private fileConsecutiveFailures = 0;

  private readonly roots: WatchedRootFacts[] = [];
  private artifacts: ArtifactFacts[] = [];
  private probe = {
    sourceSha256: null as string | null,
    afterCopySha256: null as string | null,
    afterRunSha256: null as string | null,
  };
  private target = {
    sourceSha256: null as string | null,
    afterWriteSha256: null as string | null,
    afterRunSha256: null as string | null,
  };

  constructor(
    private readonly ports: ScanPorts,
    private readonly request: ScanRequest,
    limits: ScanLimits,
    private readonly options: ScanRunOptions
  ) {
    this.clock = ports.clock;
    this.limits = limits;
    this.signal = request.signal;
    this.live = new ScanLiveWatch({
      workspace: request.layout.workspace,
      expectedTargetUri: scanTargetUri(request.layout),
      probePath: probePathOf(request.layout),
      scanMs: limits.scanMs,
      settleMs: limits.settleMs,
      maxStdoutBytes: limits.maxStdoutBytes,
    });
  }

  // ── 시간 ─────────────────────────────────────────────────────

  private rel(): number {
    return Math.max(0, Math.round(this.clock.now() - this.t0));
  }

  private startTimer(fn: () => void, ms: number): TimerHandle {
    const handle = this.clock.setTimer(() => {
      this.timers.delete(handle);
      fn();
    }, ms);
    this.timers.add(handle);
    return handle;
  }

  private stopTimer(handle: TimerHandle): void {
    this.timers.delete(handle);
    try {
      handle.cancel();
    } catch {
      this.timerProblems += 1;
    }
  }

  private notify(): void {
    for (const waiter of [...this.waiters]) waiter();
  }

  /** 남은 전체 시간을 넘지 않는 단계 한도(ms). 단계 한도의 합이 전체 상한을 넘어도 전체 상한을 늘리지 않는다. */
  private clamp(ms: number): number {
    return Math.max(0, Math.min(ms, this.limits.totalMs - this.rel()));
  }

  private waitUntil(pred: () => boolean, ms: number, ignoreAbort = false): Promise<WaitResult> {
    return new Promise<WaitResult>((resolve) => {
      let settled = false;
      let timer: TimerHandle | null = null;
      const finish = (result: WaitResult): void => {
        if (settled) return;
        settled = true;
        this.waiters.delete(check);
        if (timer) this.stopTimer(timer);
        resolve(result);
      };
      const check = (): void => {
        if (settled) return;
        if (!ignoreAbort && this.immediate) finish("aborted");
        else if (pred()) finish("ok");
      };
      this.waiters.add(check);
      timer = this.startTimer(() => finish("timeout"), Math.max(0, ms));
      check();
    });
  }

  // ── 이유 ─────────────────────────────────────────────────────

  private raise(trigger: ScanTrigger, abort?: ScanAbort): void {
    if (this.trigger === null) this.trigger = trigger;
    else if (trigger !== this.trigger && !this.also.includes(trigger)) this.also.push(trigger);
    if (abort !== undefined && this.abortInfo === null) {
      this.abortInfo = { condition: abort.condition, detail: abort.detail, tMs: this.rel() };
    }
    if (IMMEDIATE.has(trigger)) this.immediate = true;
    this.notify();
  }

  private readonly onAbortSignal = (): void => {
    this.raise("LIVE_ABORT", { condition: "A7", detail: "CANCELLED" });
  };

  // ── 스트림 읽기 ──────────────────────────────────────────────

  private attach(child: ChildHandle): void {
    child.exited.then(
      (info) => this.onExit(info),
      () => this.onExit({ code: null, signal: null })
    );
    void this.readStdout(child.stdout);
    void this.readStderr(child.stderr);
  }

  private onExit(info: ExitInfo): void {
    if (this.exitInfo !== null) return;
    this.exitInfo = info;
    this.exitAtMs = this.rel();
    this.notify();
  }

  private async readStdout(stream: AsyncIterable<Uint8Array>): Promise<void> {
    try {
      for await (const chunk of stream) {
        if (this.stdout.total + chunk.byteLength > this.limits.maxStdoutBytes) {
          this.stdout.total += chunk.byteLength;
          this.stdout.overflow = true;
          this.raise("OUTPUT_LIMIT");
          break;
        }
        this.stdout.total += chunk.byteLength;
        this.stdoutChunks.push(chunk);
        const fed = this.live.feedStdout(chunk, this.rel());
        if (fed.initArrived) this.initAtMs = this.rel();
        if (fed.abort !== null) this.raise("LIVE_ABORT", fed.abort);
        if (fed.frameError !== null) {
          this.frameError = fed.frameError;
          this.raise("FRAME_ERROR");
        }
        this.notify();
      }
      if (!this.stdout.overflow) {
        const tail = this.live.endStdout();
        if (tail !== null) {
          this.frameError = tail;
          this.raise("FRAME_ERROR");
        }
      }
    } catch (error) {
      this.stdout.readFailed = true;
      this.stdout.readError = describeError(error);
      this.raise("STREAM_READ_FAILED");
    }
    this.stdout.eof = !this.stdout.overflow && !this.stdout.readFailed;
    this.stdoutDone = true;
    this.notify();
  }

  private async readStderr(stream: AsyncIterable<Uint8Array>): Promise<void> {
    try {
      for await (const chunk of stream) {
        if (this.stderr.total + chunk.byteLength > this.limits.maxStderrBytes) {
          this.stderr.total += chunk.byteLength;
          this.stderr.overflow = true;
          this.raise("OUTPUT_LIMIT");
          break;
        }
        this.stderr.total += chunk.byteLength;
        this.stderrChunks.push(chunk);
        const hit = this.live.feedStderr(chunk, this.rel());
        if (hit !== null) this.raise("LIVE_ABORT", hit);
        this.notify(); // 장벽의 stderr 쪽 절반이나 로그 묶음이 완성됐을 수 있다
      }
      if (!this.stderr.overflow) {
        const tailHit = this.live.endStderr();
        if (tailHit !== null) this.raise("LIVE_ABORT", tailHit);
      }
    } catch (error) {
      this.stderr.readFailed = true;
      this.stderr.readError = describeError(error);
      this.raise("STREAM_READ_FAILED");
    }
    this.stderr.eof = !this.stderr.overflow && !this.stderr.readFailed;
    this.stderrDone = true;
    this.notify();
  }

  // ── 송신 ─────────────────────────────────────────────────────

  /** 방어선이 거절한 이유의 짧은 코드(진단용; 판단은 방어선이 한다). */
  private refusalCode(label: ScanSendLabel): string {
    if (!(LSP_SCAN_SEND_ORDER as readonly string[]).includes(label)) return "LABEL_NOT_ALLOWED";
    if (this.sends.some((s) => s.label === label)) return "DUPLICATE_SEND";
    if (label === "didOpen" && this.barrierReachedAtMs === null) return "DID_OPEN_BEFORE_BARRIER";
    return "GUARD_REFUSED";
  }

  /** 정해진 메시지를 stdin 에 쓴다. 방어선이 거절하면 쓰지 않고 A10 으로 중단한다. 쓰기가 끝나지 않으면 단계 한도(ms)에서 STDIN_ERROR 로 본다. 보냈으면 true. */
  private async send(
    label: ScanSendLabel,
    message: JsonRpcMessage,
    stageMs: number
  ): Promise<boolean> {
    try {
      assertAllowedScanOutbound(label, message, {
        barrierDone: this.barrierReachedAtMs !== null,
        sent: this.sends.map((s) => s.label),
        expectedDidOpen: this.expectedDidOpen ?? { uri: "", text: "" },
      });
    } catch {
      this.raise("LIVE_ABORT", { condition: "A10", detail: `${label}:${this.refusalCode(label)}` });
      return false;
    }
    // 즉시 종료 사유가 이미 걸렸으면 새 메시지를 쓰지 않는다.
    if (this.immediate) return false;
    const child = this.child as ChildHandle;
    const record: ScanSendFact = {
      label,
      tMs: this.rel(),
      ok: false,
      stderrBytesAtSend: this.live.stderrBytes,
      stdoutBytesAtSend: this.live.stdoutBytes,
    };
    if (label === "didOpen") {
      // 사전/사후의 경계: 쓰기 직전에 두 스트림에서 이미 읽은 바이트 수.
      this.live.markDidOpenSent(record.tMs);
      this.didOpenSentAtMs = record.tMs;
      const doc = ((message.params as Record<string, unknown>).textDocument ?? {}) as Record<
        string,
        unknown
      >;
      record.didOpen = {
        uri: typeof doc.uri === "string" ? doc.uri : null,
        languageId: typeof doc.languageId === "string" ? doc.languageId : null,
        version: typeof doc.version === "number" ? doc.version : null,
        textSha256:
          typeof doc.text === "string" ? sha256Hex(new TextEncoder().encode(doc.text)) : null,
      };
    }
    this.sends.push(record);
    let outcome: boolean | null = null;
    child.writeStdin(encodeFrame(message)).then(
      () => {
        outcome = true;
        this.notify();
      },
      () => {
        outcome = false;
        this.notify();
      }
    );
    const waited = await this.waitUntil(() => outcome !== null, this.clamp(stageMs));
    if (waited === "aborted") return false;
    if (waited === "timeout" || outcome === false) {
      this.raise("STDIN_ERROR");
      return false;
    }
    record.ok = true;
    return true;
  }

  /** 시험 전용 이음새: 이 시점에 시도할 송신을 방어선에 통과시킨다. 멈춰야 하면 true. */
  private async runAttempts(point: ScanAttemptedSend["after"]): Promise<boolean> {
    for (const attempt of this.options.attemptSends ?? []) {
      if (attempt.after !== point) continue;
      if (!(await this.send(attempt.label, attempt.message, this.limits.initMs))) return true;
    }
    return false;
  }

  // ── 표본(실시간 감시) ────────────────────────────────────────

  private sleepCancelable(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      this.sleepResolve = resolve;
      this.sleepTimer = this.startTimer(() => {
        this.sleepTimer = null;
        this.sleepResolve = null;
        resolve();
      }, ms);
    });
  }

  private stopSampler(): void {
    this.samplerStop = true;
    this.samplerAbort.abort();
    if (this.sleepTimer !== null) {
      this.stopTimer(this.sleepTimer);
      this.sleepTimer = null;
    }
    const resolve = this.sleepResolve;
    this.sleepResolve = null;
    resolve?.();
  }

  private startSampler(): void {
    this.samplerDone = (async () => {
      while (!this.samplerStop) {
        await this.sleepCancelable(this.limits.sampleIntervalMs);
        if (this.samplerStop) break;
        this.sampleReceiver();
        if (this.samplerStop) break;
        await this.sampleProcesses();
        if (this.samplerStop) break;
        await this.sampleFiles();
      }
    })().catch(() => {});
  }

  /** A3: 수신기에 요청이 도착했거나 수신기를 읽을 수 없으면 중단한다. */
  private sampleReceiver(): void {
    this.receiverSamples += 1;
    let hits: number | null = null;
    try {
      hits = this.ports.receiver.observe().hits;
    } catch {
      hits = null;
    }
    if (hits === null) {
      this.receiverFailures += 1;
      this.raise("LIVE_ABORT", { condition: "A3", detail: "RECEIVER_UNOBSERVABLE" });
      return;
    }
    this.receiverFinal = hits;
    if (this.receiverBaseline !== null && hits > this.receiverBaseline) {
      this.raise("LIVE_ABORT", { condition: "A3", detail: "HITS_INCREASED" });
    }
  }

  /** A4: 자식 트리에 허용 이미지 밖의 프로세스(git 포함)가 있거나 목록 조회가 연속으로 실패하면 중단한다. */
  private async sampleProcesses(): Promise<void> {
    this.procSamples += 1;
    let result;
    try {
      result = await this.ports.lister.list({ signal: this.samplerAbort.signal });
    } catch {
      result = { ok: false as const, failure: "UNEXPECTED_ERROR" as const };
    }
    if (this.samplerStop) return;
    const pid = this.child?.pid ?? null;
    if (!result.ok || pid === null) {
      this.procFailures += 1;
      this.procConsecutiveFailures += 1;
      if (this.procConsecutiveFailures >= CONSECUTIVE_FAILURES_TO_ABORT) {
        this.raise("LIVE_ABORT", { condition: "A4", detail: "LIST_FAILED" });
      }
      return;
    }
    this.procConsecutiveFailures = 0;
    const found = descendantsOf(result.snapshot, pid);
    this.maxDescendants = Math.max(this.maxDescendants, found.rows.length);
    const rows = [...found.rows];
    const root = result.snapshot.rows.find((row) => row.pid === pid && !row.vanished);
    if (root !== undefined) rows.push(root);
    for (const row of rows) {
      const image = imageNameOf(row);
      if (image === null) {
        this.disallowed.add("UNKNOWN_IMAGE");
        this.raise("LIVE_ABORT", { condition: "A4", detail: "UNKNOWN_IMAGE" });
      } else {
        this.imagesSeen.add(image);
        if (!ALLOWED_IMAGES.includes(image)) {
          this.disallowed.add(image);
          this.raise("LIVE_ABORT", { condition: "A4", detail: image });
        }
      }
    }
  }

  /**
   * A5′: 감시 폴더 셋 안의 금지된 변경 — 작업 영역에는 합성 파일 하나만(없어져도 위반), 규칙 폴더에는 프로브 한 개만(없어져도 위반),
   * 홈은 지문 폴더 아래만. 폴더 목록을 읽지 못하는 표본이 연속으로 이어지면 감시 불능으로 중단한다.
   */
  private async sampleFiles(): Promise<void> {
    this.fileSamples += 1;
    let failedThisSample = false;
    for (const role of WATCHED_ROLES) {
      let list: string[];
      try {
        list = await this.ports.fs.listFilesRecursive(scanRootPath(this.request.layout, role));
      } catch {
        failedThisSample = true;
        this.fileFailures += 1;
        continue;
      }
      if (this.samplerStop) return;
      if (list.some((path) => scanWatchedViolation(role, path))) {
        this.raise("LIVE_ABORT", { condition: "A5", detail: role });
      }
      if (role === "RULES_DIR" && !list.some((p) => p.toLowerCase() === LSP_RULES_PROBE_FILE)) {
        this.raise("LIVE_ABORT", { condition: "A5", detail: "PROBE_MISSING" });
      }
      if (role === "WORKSPACE" && !list.some((p) => p.toLowerCase() === LSP_SCAN_TARGET_FILE)) {
        this.raise("LIVE_ABORT", { condition: "A5", detail: "TARGET_MISSING" });
      }
    }
    this.fileConsecutiveFailures = failedThisSample ? this.fileConsecutiveFailures + 1 : 0;
    if (this.fileConsecutiveFailures >= CONSECUTIVE_FAILURES_TO_ABORT) {
      this.raise("LIVE_ABORT", { condition: "A5", detail: "LIST_FAILED" });
    }
  }

  // ── 종료 ─────────────────────────────────────────────────────

  /** 프로세스 트리를 강제 종료한다. **한 번만** 보낸다(종료 확인은 늦게 올 수 있다). */
  private killTree(): void {
    const child = this.child;
    if (child === null || this.killCount > 0) return;
    this.killCount += 1;
    this.firstKillMs ??= this.rel();
    try {
      child.kill("SIGKILL");
    } catch {
      this.killProblem = true;
    }
  }

  /** stdin 을 닫고 유예 안에 끝나지 않으면 강제 종료한다. */
  private async closeStdinThenKill(): Promise<void> {
    const child = this.child as ChildHandle;
    this.stdinClosed.byHarness = true;
    this.stdinClosed.tMs = this.rel();
    let closed: boolean | null = null;
    child.endStdin().then(
      () => {
        closed = true;
        this.notify();
      },
      () => {
        closed = false;
        this.notify();
      }
    );
    const graceMs = this.clamp(this.limits.stdinCloseGraceMs);
    const closedWait = await this.waitUntil(
      () => closed !== null || this.exitInfo !== null,
      graceMs
    );
    this.stdinClosed.ok = closed;
    if (closedWait === "aborted") return;
    const remaining = this.clamp(graceMs - (this.rel() - (this.stdinClosed.tMs ?? 0)));
    const exitWait = await this.waitUntil(() => this.exitInfo !== null, remaining);
    if (exitWait === "timeout") this.killTree();
  }

  /** 초기화 응답이 완전히 VALID 이고 서버 버전이 핀과 같은가. 이때만 `initialized` 를 보낸다. */
  private initGate(): { ok: boolean } {
    const message = this.live.stdoutTracker.analysis.initMessage;
    if (message === null) return { ok: false };
    const analysis = analyzeInitResponse(message);
    if (!analysis.valid || this.live.stderrWatcher.initErrorLogged) return { ok: false };
    const expected = this.request.expectedVersion ?? null;
    return { ok: expected !== null && analysis.serverInfo?.version === expected };
  }

  /** 관측 구간: 상태 흐름. 끝나면 자식이 끝났거나 killTree 가 불렸거나 곧 불릴 상태다. */
  private async observe(): Promise<void> {
    const L = this.limits;
    const initDeadline = this.rel() + L.initMs;
    const sent = await this.send(
      "initialize",
      buildScanInitializeMessage(this.request.layout),
      L.initMs
    );
    if (!sent) return;

    const initWait = await this.waitUntil(
      () => this.live.stdoutTracker.analysis.initMessage !== null || this.stdoutDone,
      this.clamp(initDeadline - this.rel())
    );
    if (initWait === "aborted") return;
    if (this.live.stdoutTracker.analysis.initMessage === null) {
      if (initWait === "timeout") {
        this.raise("INIT_TIMEOUT");
        await this.closeStdinThenKill();
      } else {
        this.raise("CHILD_EXITED_EARLY");
      }
      return;
    }
    if (!this.initGate().ok) {
      this.raise("INIT_INVALID");
      await this.closeStdinThenKill();
      return;
    }

    // `initialized`: 정확히 한 번. 쓰기 직전에 감시기에 알려 이 시점 이후의 새로고침·스캔 줄을 정상 신호로 읽게 한다.
    this.live.markInitializedSent();
    if (!(await this.send("initialized", buildScanInitializedMessage(), L.initMs))) return;
    if (await this.runAttempts("initialized")) return;

    // 장벽: stdout `rulesRefreshed` 와 맨줄 `Scanned open documents` 가 모두 나올 때까지.
    const barrier = await this.waitUntil(
      () => this.live.barrierReady() || this.exitInfo !== null,
      this.clamp(L.rulesMs)
    );
    if (barrier === "aborted") return;
    if (barrier === "timeout") {
      this.raise("RULES_TIMEOUT", { condition: "A9", detail: "BARRIER_LIMIT" });
      await this.closeStdinThenKill();
      return;
    }
    if (this.exitInfo !== null) {
      this.raise("CHILD_EXITED_EARLY");
      return;
    }
    this.barrierReachedAtMs = this.rel();
    this.live.markBarrierDone(this.barrierReachedAtMs);
    await this.checkFilesAtBarrier();
    if (this.immediate) return;
    if (await this.runAttempts("barrier")) return;

    // didOpen: 장벽이 계약대로이고 사전 증거가 없을 때만 보낸다. 아니면 보내지 않고 짧은 감시 뒤 정상 종료한다.
    if (this.live.barrierStatus().clean) {
      if (!(await this.openAndWatch())) return;
    } else {
      const quiet = await this.waitUntil(() => this.exitInfo !== null, this.clamp(L.settleMs));
      if (quiet === "aborted") return;
      if (quiet === "ok") {
        this.raise("CHILD_EXITED_EARLY");
        return;
      }
    }
    await this.shutdownAndExit();
  }

  /** didOpen 을 보내고 두 묶음과 settle 창을 지켜본다. 정상 종료 단계로 이어가도 되면 true. */
  private async openAndWatch(): Promise<boolean> {
    const L = this.limits;
    const message = buildScanDidOpenMessage(
      this.request.layout,
      this.request.targetBytes as Uint8Array
    );
    if (!(await this.send("didOpen", message, L.initMs))) return false;
    if (await this.runAttempts("didOpen")) return false;
    const openedAt = this.didOpenSentAtMs as number;
    const deadline = openedAt + L.scanMs;

    // 두 묶음: didOpen 송신부터 scanMs 안에. 연장도 재시도도 없다.
    const reaction = await this.waitUntil(
      () => this.live.snapshot(this.rel()).bothCompleteAtMs !== null || this.exitInfo !== null,
      this.clamp(deadline - this.rel())
    );
    if (reaction === "aborted") return false;
    const both = this.live.snapshot(this.rel());
    if (both.bothCompleteAtMs === null) {
      if (this.exitInfo !== null) {
        this.raise("CHILD_EXITED_EARLY");
        return false;
      }
      // 마감: 기다림을 끝내고 정상 종료로 간다. 늦게 오는 증거는 원문에 남고 판정이 늦은 증거로 가른다.
      this.raise("SCAN_TIMEOUT");
      return true;
    }

    // settle 창: 늦은 묶음이 완성된 하니스 시각에서 settleMs. 그 안에 자식이 끝나면 이상이다.
    const windowEnd = both.settleEndMs as number;
    while (this.rel() < windowEnd) {
      const watch = await this.waitUntil(
        () => this.exitInfo !== null,
        this.clamp(windowEnd - this.rel())
      );
      if (watch === "aborted") return false;
      if (watch === "ok") {
        this.raise("CHILD_EXITED_EARLY");
        return false;
      }
    }
    this.settleEndedAtMs = this.rel();
    return true;
  }

  /** 정상: shutdown(응답을 기다리지 않는다) → exit → 종료 대기. */
  private async shutdownAndExit(): Promise<void> {
    const L = this.limits;
    const exitDeadline = this.rel() + L.exitMs;
    if (
      !(await this.send(
        "shutdown",
        buildScanShutdownMessage(),
        this.clamp(exitDeadline - this.rel())
      ))
    )
      return;
    if (!(await this.send("exit", buildScanExitMessage(), this.clamp(exitDeadline - this.rel()))))
      return;
    const exitWait = await this.waitUntil(
      () => this.exitInfo !== null,
      this.clamp(exitDeadline - this.rel())
    );
    if (exitWait === "timeout") {
      this.raise("EXIT_TIMEOUT");
      await this.closeStdinThenKill();
    }
  }

  /** 장벽에서 프로브와 합성 파일의 해시를 한 번 더 본다(A5′의 "해시 불변"). didOpen 은 이 확인 뒤에만 나간다. */
  private async checkFilesAtBarrier(): Promise<void> {
    if ((await this.hashFile(probePathOf(this.request.layout))) !== LSP_SCAN_PROBE_SHA256) {
      this.raise("LIVE_ABORT", { condition: "A5", detail: "PROBE_CHANGED" });
    }
    if ((await this.hashFile(this.request.layout.targetPath)) !== LSP_SCAN_TARGET_SHA256) {
      this.raise("LIVE_ABORT", { condition: "A5", detail: "TARGET_CHANGED" });
    }
  }

  private async hashFile(path: string): Promise<string | null> {
    try {
      return (await this.ports.hasher.hashFile(path, { maxBytes: DEFAULT_WHEEL_MAX_BYTES })).sha256;
    } catch {
      return null;
    }
  }

  // ── 실행 ─────────────────────────────────────────────────────

  async execute(): Promise<ScanResult> {
    const refusals = checkScanRequest(this.request, sha256Hex);
    if (this.signal?.aborted) refusals.push("CANCELLED_BEFORE_START");
    if (refusals.length > 0) return this.refused(refusals);

    const layout = this.request.layout;
    const targetBytes = this.request.targetBytes as Uint8Array;
    this.expectedDidOpen = {
      uri: scanTargetUri(layout),
      text: new TextDecoder("utf-8", { fatal: false, ignoreBOM: true }).decode(targetBytes),
    };
    const dirs = [
      layout.workspace,
      layout.stateDir,
      layout.rulesDir,
      layout.homeDir,
      layout.tmpDir,
    ];

    // 링크 탈출 검사(만들기 전): 모든 쓰기 경로와 합성 파일·프로브가 작업 폴더의 **실제** 안쪽에 있어야 한다. physicalKey 가 링크·junction·`..` 를 풀어 준다.
    try {
      const workKey = await this.ports.fs.physicalKey(layout.work);
      for (const path of [...dirs, probePathOf(layout), layout.targetPath]) {
        const key = await this.ports.fs.physicalKey(path);
        if (!keyIsSameOrInside(key, workKey)) return this.refused(["PATH_ESCAPES_WORK"]);
      }
    } catch {
      return this.refused(["PATH_RESOLVE_FAILED"]);
    }

    try {
      for (const path of dirs) await this.ports.fs.mkdirp(path);
    } catch {
      return this.refused(["STATE_DIR_NOT_CREATED"]);
    }

    // 사전 확인 1: 세 감시 폴더가 모두 비어 있어야 한다(아무것도 쓰기 전).
    const preRefusals: string[] = [];
    for (const role of WATCHED_ROLES) {
      let before: string[] | null = null;
      try {
        before = await this.ports.fs.listFilesRecursive(scanRootPath(layout, role));
      } catch {
        preRefusals.push(`WATCHED_ROOT_UNREADABLE:${role}`);
      }
      if (before !== null && before.length > 0) preRefusals.push(`WATCHED_ROOT_NOT_EMPTY:${role}`);
    }
    if (preRefusals.length > 0) return this.refused(preRefusals);

    // 프로브 복사: 배타 쓰기 → 곧바로 해시 → 고정값과 대조.
    this.probe.sourceSha256 = sha256Hex(this.request.probeBytes as Uint8Array);
    try {
      await this.ports.fs.writeFileExclusive(
        probePathOf(layout),
        this.request.probeBytes as Uint8Array
      );
    } catch {
      return this.refused(["PROBE_NOT_WRITTEN"]);
    }
    this.probe.afterCopySha256 = await this.hashFile(probePathOf(layout));
    if (this.probe.afterCopySha256 !== LSP_SCAN_PROBE_SHA256) {
      return this.refused(["PROBE_COPY_HASH_MISMATCH"]);
    }
    // 합성 파일: 같은 방식. 서버를 띄우기 전에 작업 영역에 있어야 한다.
    this.target.sourceSha256 = sha256Hex(targetBytes);
    try {
      await this.ports.fs.writeFileExclusive(layout.targetPath, targetBytes);
    } catch {
      return this.refused(["TARGET_NOT_WRITTEN"]);
    }
    this.target.afterWriteSha256 = await this.hashFile(layout.targetPath);
    if (this.target.afterWriteSha256 !== LSP_SCAN_TARGET_SHA256) {
      return this.refused(["TARGET_COPY_HASH_MISMATCH"]);
    }
    // 실행 전 파일 수: 작업 영역 1(합성 파일뿐), 규칙 폴더 1(프로브뿐), 홈 0.
    for (const role of WATCHED_ROLES) {
      let now: string[] | null = null;
      try {
        now = await this.ports.fs.listFilesRecursive(scanRootPath(layout, role));
      } catch {
        preRefusals.push(`WATCHED_ROOT_UNREADABLE:${role}`);
      }
      const expectedCount = role === HOME_ROLE ? 0 : 1;
      if (now !== null && now.length !== expectedCount) {
        preRefusals.push(`WATCHED_ROOT_UNEXPECTED:${role}`);
      }
      this.roots.push({
        role,
        filesBefore: now === null ? null : now.length,
        filesAfter: null,
        added: [],
        removed: [],
        samples: 0,
        failures: 0,
      });
    }

    // 사전 확인 2: 수신기와 프로세스 목록을 읽을 수 있어야 하고 설치물 해시를 잴 수 있어야 한다.
    try {
      this.receiverBaseline = this.ports.receiver.observe().hits;
    } catch {
      this.receiverBaseline = null;
    }
    if (this.receiverBaseline === null) preRefusals.push("RECEIVER_UNOBSERVABLE");
    try {
      const probe = await this.ports.lister.list({ signal: this.samplerAbort.signal });
      if (!probe.ok) preRefusals.push("PROCESS_LISTER_UNAVAILABLE");
    } catch {
      preRefusals.push("PROCESS_LISTER_UNAVAILABLE");
    }
    this.artifacts = await this.hashArtifacts("before");
    if (this.signal?.aborted) preRefusals.push("CANCELLED_BEFORE_START");
    if (preRefusals.length > 0) return this.refused(preRefusals);

    // 시작
    this.t0 = this.clock.now();
    this.signal?.addEventListener("abort", this.onAbortSignal, { once: true });
    const totalTimer = this.startTimer(() => this.raise("TOTAL_TIMEOUT"), this.limits.totalMs);
    try {
      await this.spawnChild();
      if (this.spawnOk) {
        this.startSampler();
        await this.observe();
      }
    } catch {
      this.cleanupProblems.push("UNEXPECTED_ERROR");
      if (this.trigger === null) this.raise("STDIN_ERROR");
    }
    if (this.spawnOk && this.exitInfo === null) this.killTree();
    this.stopTimer(totalTimer);
    const observationEndMs = this.firstKillMs ?? this.exitAtMs ?? this.rel();

    await this.cleanup();
    return this.finish(observationEndMs);
  }

  private async spawnChild(): Promise<void> {
    this.spawnAttempted = true;
    this.provenance = this.ports.process.provenance;
    try {
      const child = await this.ports.process.spawn({
        command: this.request.command,
        args: [...LSP_SCAN_ARGS],
        cwd: this.request.layout.stateDir,
        env: this.request.env,
      });
      this.child = child;
      this.spawnOk = true;
      this.attach(child);
    } catch {
      this.raise("SPAWN_FAILED");
    }
  }

  // ── 정리 ─────────────────────────────────────────────────────

  private readonly cleanupProblems: string[] = [];
  private childExitConfirmed = false;
  private streamsClosed: boolean | null = null;
  private descendantsAlive: number | null = null;
  private descendantTracking: DescendantResult["tracking"] | null = null;
  private disposeState: "OK" | "FAILED" | "NOT_CALLED" = "NOT_CALLED";
  private killConfirmed: boolean | null = null;
  private cleanupMs: number | null = null;

  /** 정리 구간. 종료 확인 창은 한 번, 고정이다. 같은 창을 다시 열지 않는다. */
  private async cleanup(): Promise<void> {
    const startedAt = this.rel();
    const windowEnd = startedAt + this.limits.killConfirmMs;
    const remaining = (): number => Math.max(0, windowEnd - this.rel());
    this.stopSampler();
    this.signal?.removeEventListener("abort", this.onAbortSignal);

    if (this.spawnOk) {
      const exited = await this.waitUntil(() => this.exitInfo !== null, remaining(), true);
      this.childExitConfirmed = exited === "ok";
      if (this.killCount > 0) this.killConfirmed = this.childExitConfirmed;
      if (!this.childExitConfirmed) this.cleanupProblems.push("KILL_NOT_OBSERVED");
      if (this.killProblem) this.cleanupProblems.push("KILL_SIGNAL_FAILED");

      this.sampleReceiverFinal();
      await this.finalProcessSample(remaining());

      const closed = await this.waitUntil(
        () => this.stdoutDone && this.stderrDone,
        remaining(),
        true
      );
      this.streamsClosed = closed === "ok" && this.stdout.eof && this.stderr.eof;
      if (closed !== "ok") this.cleanupProblems.push("STREAMS_NOT_CLOSED");

      try {
        await (this.child as ChildHandle).dispose();
        this.disposeState = "OK";
      } catch {
        this.disposeState = "FAILED";
        this.cleanupProblems.push("DISPOSE_FAILED");
      }
    }
    await this.samplerDone;

    // 사후 비교(종료 확인 창과 별개의 읽기): 감시 폴더 목록, 프로브·합성 파일·설치물 해시.
    await this.snapshotRootsAfter();
    this.probe.afterRunSha256 = await this.hashFile(probePathOf(this.request.layout));
    this.target.afterRunSha256 = await this.hashFile(this.request.layout.targetPath);
    const after = await this.hashArtifacts("after");
    this.artifacts = this.artifacts.map((item, index) => ({
      ...item,
      after: after[index]?.after ?? null,
    }));

    for (const timer of [...this.timers]) this.stopTimer(timer);
    if (this.timerProblems > 0) this.cleanupProblems.push("TIMER_CANCEL_FAILED");
    this.cleanupMs = this.rel() - startedAt;
  }

  private sampleReceiverFinal(): void {
    try {
      this.receiverFinal = this.ports.receiver.observe().hits;
    } catch {
      this.receiverFinal = null;
    }
  }

  private async finalProcessSample(budgetMs: number): Promise<void> {
    const pid = this.child?.pid ?? null;
    if (pid === null) return;
    let done = false;
    let value: DescendantResult | null = null;
    this.ports.lister
      .list({})
      .then((result) => {
        if (result.ok) value = descendantsOf(result.snapshot, pid);
      })
      .catch(() => {})
      .finally(() => {
        done = true;
        this.notify();
      });
    await this.waitUntil(() => done, budgetMs, true);
    const found = value as DescendantResult | null;
    if (found !== null) {
      this.descendantsAlive = found.rows.length;
      this.descendantTracking = found.tracking;
    } else {
      this.cleanupProblems.push("FINAL_PROCESS_LIST_UNAVAILABLE");
    }
  }

  private async snapshotRootsAfter(): Promise<void> {
    for (const root of this.roots) {
      try {
        const now = await this.ports.fs.listFilesRecursive(
          scanRootPath(this.request.layout, root.role)
        );
        root.filesAfter = now.length;
        if (root.role === "RULES_DIR" || root.role === "WORKSPACE") {
          // 실행 전에는 파일 하나(프로브 또는 합성 파일)였다: 그것 말고 늘어난 것이 added, 그것이 없어졌으면 removed 다.
          const keep = root.role === "RULES_DIR" ? LSP_RULES_PROBE_FILE : LSP_SCAN_TARGET_FILE;
          root.added = now.filter((p) => p.toLowerCase() !== keep);
          root.removed = now.some((p) => p.toLowerCase() === keep) ? [] : [keep];
        } else {
          root.added = now;
          root.removed = [];
        }
      } catch {
        root.filesAfter = null;
      }
    }
  }

  private async hashArtifacts(phase: "before" | "after"): Promise<ArtifactFacts[]> {
    const out: ArtifactFacts[] = [];
    for (const item of this.request.artifacts ?? []) {
      const sha = await this.hashFile(item.path);
      out.push({
        label: item.label,
        before: phase === "before" ? sha : null,
        after: phase === "after" ? sha : null,
      });
    }
    return out;
  }

  // ── 기록 ─────────────────────────────────────────────────────

  private refused(refusals: string[]): ScanResult {
    return this.build(refusals, null);
  }

  private finish(observationEndMs: number): ScanResult {
    if (this.trigger === null) this.trigger = this.spawnOk ? "NORMAL" : "SPAWN_FAILED";
    return this.build([], observationEndMs);
  }

  private build(refusals: string[], observationEndMs: number | null): ScanResult {
    const stdoutBytes = joinChunks(this.stdoutChunks);
    const stderrBytes = joinChunks(this.stderrChunks);
    const input = this.live.toEvidenceInput();
    const layout = this.request.layout;
    const pathValue = this.request.env?.PATH;
    const facts: ScanFacts = {
      runId: this.request.runId,
      provenance: this.spawnAttempted ? this.provenance : null,
      refusals,
      limits: this.limits,
      expectedVersion: this.request.expectedVersion ?? null,
      probePath: probePathOf(layout),
      workspace: layout.workspace,
      expectedTargetUri: scanTargetUri(layout),
      spawn: { attempted: this.spawnAttempted, ok: this.spawnOk, pid: this.child?.pid ?? null },
      sends: this.sends,
      stdout: { ...this.stdout, bytes: stdoutBytes },
      stderr: { ...this.stderr, bytes: stderrBytes },
      chunks: (input.chunks ?? []).map((c): ScanChunk => ({ ...c })),
      markers: { barrierDoneAtMs: this.barrierReachedAtMs, didOpenSent: input.didOpen },
      liveView: this.live.liveView(),
      frameError: this.frameError,
      initResponseAtMs: this.initAtMs,
      settle: { endedAtMs: this.settleEndedAtMs },
      exit: {
        observed: this.exitInfo !== null,
        code: this.exitInfo?.code ?? null,
        signal: this.exitInfo?.signal ?? null,
        tMs: this.exitAtMs,
      },
      stdinClosed: { ...this.stdinClosed },
      kill: { count: this.killCount, firstTMs: this.firstKillMs, confirmed: this.killConfirmed },
      trigger: refusals.length > 0 ? null : this.trigger,
      also: [...this.also],
      abort: this.abortInfo,
      live: {
        stderrCheckedBytes: this.live.stderrWatcher.checkedBytes,
        stdoutFramesChecked: this.live.framesChecked,
        receiver: {
          baselineHits: this.receiverBaseline,
          finalHits: this.receiverFinal,
          samples: this.receiverSamples,
          failures: this.receiverFailures,
        },
        processes: {
          samples: this.procSamples,
          failures: this.procFailures,
          maxDescendants: this.maxDescendants,
          imagesSeen: [...this.imagesSeen].sort(),
          disallowed: [...this.disallowed].sort(),
        },
        files: { samples: this.fileSamples, failures: this.fileFailures },
      },
      roots: this.roots,
      probe: { ...this.probe },
      target: { ...this.target },
      artifacts: this.artifacts,
      childEnv: {
        path: this.spawnAttempted && typeof pathValue === "string" ? pathValue : null,
        workingDirectory: this.spawnAttempted ? layout.stateDir : null,
      },
      recovery: null,
      timeline: { observationMs: observationEndMs, cleanupMs: this.cleanupMs },
      cleanup: {
        childExitConfirmed: this.childExitConfirmed,
        streamsClosed: this.streamsClosed,
        descendantsAliveAfter: this.descendantsAlive,
        descendantTracking: this.descendantTracking,
        dispose: this.disposeState,
        timersCancelled: this.timerProblems === 0,
        problems: this.cleanupProblems,
      },
    };
    return {
      record: buildScanRecord(facts),
      facts,
      raw: { stdout: stdoutBytes, stderr: stderrBytes },
    };
  }
}

// @MX:ANCHOR: [AUTO] LSP-SCAN-1 합성 파일 반응 관측의 유일한 진입점 — 시험과 (앞으로의) 실제 실행 진입 스크립트가 모두 이 함수로 기록을 얻는다.
// @MX:REASON: "요청 검사 전에는 아무것도 만들지 않는다", "didOpen 은 장벽 뒤 정확히 한 번(방어선 통과)", "서버 요청에는 응답하지 않는다",
// "마감(scanMs)은 늘리지 않는다", "settle 은 늦은 묶음에서 시작한다", "관측 결과·정리 결과·복구 결과를 섞지 않는다"가 이 함수 한 곳에서 지켜진다.
export async function runScanObservation(
  ports: ScanPorts,
  request: ScanRequest,
  options: ScanRunOptions = {}
): Promise<ScanResult> {
  const resolved = resolveScanLimits(request.limits);
  const run = new Run(ports, request, resolved.limits, options);
  return run.execute();
}
