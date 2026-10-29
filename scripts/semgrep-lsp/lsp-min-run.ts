// LSP-MIN-1 실행기: 포트로 받은 프로세스·시계·파일·수신기·프로세스 목록·해시 어댑터만으로 `semgrep.exe lsp --debug`를 한 번 띄워
// initialize → shutdown → exit 만 주고받고 끝낸다. 계약과 기록 형식은 lsp-min.ts가 정한다(이 파일은 시간과 순서를 맡는다).
//
// 기존 세션 제어기(session.ts)와 평가기(evaluate.ts)를 쓰지 않는다. 그쪽은 initialize 뒤에 항상 `initialized`를 보내고 그 부재를
// 실패로 보는 계약이라, "검사 생략" 옵션을 달아 바꾸지 않고 별도 실행기로 둔다. 순수 프레이밍(framing.ts)·JSON-RPC 도구(jsonrpc.ts)·
// 설정 생성(settings.ts)만 재사용한다. 이 파일은 child_process·fs·net·process.env를 가져오지 않는다.
//
// 불변식:
//  · 요청 검사(checkLspMinRequest)에서 거절되면 폴더도 프로세스도 만들지 않는다. 그 뒤의 사전 확인(감시 폴더가 비어 있는가, 수신기와
//    프로세스 목록을 읽을 수 있는가)에서 거절되면 프로세스를 띄우지 않는다.
//  · stdin에 쓰는 것은 initialize → shutdown → exit 셋뿐이다(assertAllowedOutbound). `initialized`는 보내지 않는다.
//  · 초기화 응답이 핵심 규칙(classifyInitResponseCore)을 통과해야만 shutdown·exit를 보낸다. 통과하지 못하면 바로 stdin을 닫는다.
//  · 중단 조건(A1~A5·A7·A8)·전체 상한·출력 상한·프레임 오류·stdin 쓰기 오류·stdout/stderr 읽기 오류는 stdin 닫기 없이 곧바로 프로세스 트리를
//    강제 종료한다. 즉시 종료 사유가 걸린 뒤에는 새 메시지를 쓰지 않고, 이미 받은 바이트와 오류는 기록에 남긴다.
//  · 전체 상한(관측 구간)에 닿으면 새 유예를 붙이지 않는다. 정리 구간의 종료 확인 창은 고정 한 번이다.
//  · 함수는 던지지 않는다. 운영상의 실패는 전부 기록(LspMinObservation)이 된다. 관측 결과(status)와 정리 결과(cleanup.ok)는 따로다.
//  · 시간은 주입된 Clock뿐이다(Date.now·setTimeout을 쓰지 않는다). 쓴 타이머는 끝에 모두 취소한다.

import { encodeFrame, FrameDecoder, type FrameDecodeError } from "./framing";
import {
  ALLOWED_IMAGES,
  ABORT_STDOUT_METHODS,
  LSP_MIN_ARGS,
  LSP_MIN_INIT_ID,
  StderrWatcher,
  WATCHED_ROLES,
  assertAllowedOutbound,
  buildExitMessage,
  buildInitializeMessage,
  buildObservationRecord,
  buildShutdownMessage,
  checkLspMinRequest,
  classifyInitResponseCore,
  classifyServerMessage,
  descendantsOf,
  imageNameOf,
  resolveLimits,
  rootPathOf,
  rootViolation,
  type AbortCondition,
  type ArtifactFacts,
  type DescendantResult,
  type InitCoreResult,
  type LspMinFacts,
  type LspMinLimits,
  type LspMinObservation,
  type LspMinRequestShape,
  type LspMinSendLabel,
  type LspMinTrigger,
  type StreamFacts,
  type WatchedRootFacts,
} from "./lsp-min";
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

export interface LspMinPorts {
  process: ProcessPort;
  clock: Clock;
  fs: Pick<FsPort, "mkdirp" | "listFilesRecursive">;
  /** 필수: 읽을 수 없으면 실행하지 않는다. */
  receiver: MetricsObserver;
  /** 필수: 읽을 수 없으면 실행하지 않는다. */
  lister: ProcessLister;
  /** 필수(설치물 목록은 비어 있을 수 있다). */
  hasher: ArtifactHashPort;
}

export interface LspMinRequest extends LspMinRequestShape {
  /** 핀의 서버 버전. 응답의 serverInfo.version과 비교한 결과를 기록만 한다. */
  expectedVersion?: string | null;
  signal?: AbortSignal;
}

export interface LspMinResult {
  record: LspMinObservation;
  /** 원문 바이트(상한 안). 호출자가 저장소 밖 증거 폴더에 둔다. 기록에는 해시와 크기만 들어 있다. */
  raw: { stdout: Uint8Array; stderr: Uint8Array };
}

/** 이 이유들은 stdin 닫기 없이 곧바로 강제 종료한다. */
const IMMEDIATE: ReadonlySet<LspMinTrigger> = new Set<LspMinTrigger>([
  "LIVE_ABORT",
  "TOTAL_TIMEOUT",
  "OUTPUT_LIMIT",
  "FRAME_ERROR",
  "STDIN_ERROR",
  "STREAM_READ_FAILED",
  "CHILD_EXITED_EARLY",
]);

const CONSECUTIVE_FAILURES_TO_ABORT = 3;

/** 읽기 실패의 오류를 "형식: 메시지" 한 줄로 만든다(PowerShell 러너의 Format-StreamError와 같은 모양). 걸러서 싣는 일은 기록 쪽이 한다. */
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
  private readonly limits: LspMinLimits;
  private readonly signal: AbortSignal | undefined;
  private t0 = 0;

  private child: ChildHandle | null = null;
  private provenance: Provenance | null = null;
  private spawnOk = false;
  private spawnAttempted = false;

  // 타이머
  private readonly timers = new Set<TimerHandle>();
  private timerProblems = 0;
  private readonly waiters = new Set<() => void>();

  // 스트림
  private readonly stdoutChunks: Uint8Array[] = [];
  private readonly stderrChunks: Uint8Array[] = [];
  private stdout: StreamFacts = emptyStream();
  private stderr: StreamFacts = emptyStream();
  private stdoutDone = false;
  private stderrDone = false;
  private readonly stderrWatcher = new StderrWatcher();
  private frameError: FrameDecodeError | null = null;
  private framesChecked = 0;
  private collectorsDone: Promise<void> = Promise.resolve();

  // 초기화 응답
  private initMessage: JsonRpcMessage | null = null;
  private initCore: InitCoreResult | null = null;
  private initAtMs: number | null = null;

  // 종료
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

  // 이유
  private trigger: LspMinTrigger | null = null;
  private readonly also: LspMinTrigger[] = [];
  private abortInfo: { condition: AbortCondition; detail: string; tMs: number } | null = null;
  private immediate = false;

  // 송신
  private readonly sends: LspMinFacts["sends"] = [];

  // 표본
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

  constructor(
    private readonly ports: LspMinPorts,
    private readonly request: LspMinRequest,
    limits: LspMinLimits
  ) {
    this.clock = ports.clock;
    this.limits = limits;
    this.signal = request.signal;
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

  /** 남은 전체 시간을 넘지 않는 단계 한도(ms). */
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

  private raise(
    trigger: LspMinTrigger,
    abort?: { condition: AbortCondition; detail: string }
  ): void {
    if (this.trigger === null) {
      this.trigger = trigger;
    } else if (trigger !== this.trigger && !this.also.includes(trigger)) {
      this.also.push(trigger);
    }
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
    const out = this.readStdout(child.stdout);
    const err = this.readStderr(child.stderr);
    this.collectorsDone = Promise.all([out, err]).then(() => {});
  }

  private onExit(info: ExitInfo): void {
    if (this.exitInfo !== null) return;
    this.exitInfo = info;
    this.exitAtMs = this.rel();
    this.notify();
  }

  private async readStdout(stream: AsyncIterable<Uint8Array>): Promise<void> {
    const decoder = new FrameDecoder({ maxMessageBytes: this.limits.maxStdoutBytes });
    let broken = false;
    try {
      for await (const chunk of stream) {
        if (this.stdout.total + chunk.byteLength > this.limits.maxStdoutBytes) {
          this.stdout.total += chunk.byteLength;
          this.stdout.overflow = true;
          this.raise("OUTPUT_LIMIT");
          break; // 넘친 덩어리는 쓰지 않는다. 자식은 곧 강제 종료된다.
        }
        this.stdout.total += chunk.byteLength;
        this.stdoutChunks.push(chunk);
        if (broken) continue;
        const pushed = decoder.push(chunk);
        for (const message of pushed.messages) this.onMessage(message);
        if (pushed.error) {
          broken = true;
          this.frameError = pushed.error;
          this.raise("FRAME_ERROR");
        }
      }
      if (!broken && !this.stdout.overflow) {
        const tail = decoder.end();
        if (tail.error) {
          this.frameError = tail.error;
          this.raise("FRAME_ERROR");
        }
      }
    } catch (error) {
      // 이미 받은 바이트(stdoutChunks)와 앞서 올라온 이유·프레임 오류는 그대로 둔다. 정상 EOF(아래 eof)로 치지 않고 즉시 종료 사유로 올린다.
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
        const hit = this.stderrWatcher.push(chunk);
        if (hit !== null)
          this.raise("LIVE_ABORT", { condition: hit.condition, detail: hit.pattern });
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

  private onMessage(message: JsonRpcMessage): void {
    this.framesChecked += 1;
    const kind = classifyServerMessage(message);
    if (kind === "response" && message.id === LSP_MIN_INIT_ID && this.initMessage === null) {
      this.initMessage = message;
      this.initCore = classifyInitResponseCore(message);
      this.initAtMs = this.rel();
    } else if (kind === "notification" && ABORT_STDOUT_METHODS.includes(String(message.method))) {
      this.raise("LIVE_ABORT", { condition: "A8", detail: String(message.method) });
    }
    this.notify();
  }

  // ── 송신 ─────────────────────────────────────────────────────

  /** 정해진 메시지를 stdin에 쓴다. 쓰기가 끝나지 않으면 단계 한도(ms)에서 STDIN_ERROR로 본다. 보냈으면 true. */
  private async send(
    label: LspMinSendLabel,
    message: JsonRpcMessage,
    stageMs: number
  ): Promise<boolean> {
    assertAllowedOutbound(label, message);
    // 즉시 종료 사유가 이미 걸렸으면 새 메시지를 쓰지 않는다. 대기를 마친 흐름이 이어서 다음 메시지를 쓰러 오는 사이에 사유가 걸릴 수 있다.
    if (this.immediate) return false;
    const child = this.child as ChildHandle;
    const record = { label, tMs: this.rel(), ok: false };
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

  /** A4: 자식 트리에 허용 이미지 밖의 프로세스가 있거나 목록 조회가 연속으로 실패하면 중단한다. */
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

  /** A5: 감시 폴더 셋 안의 금지된 변경. 폴더 목록을 읽지 못하는 표본이 연속으로 이어지면 감시 불능으로 중단한다. */
  private async sampleFiles(): Promise<void> {
    this.fileSamples += 1;
    let failedThisSample = false;
    for (const role of WATCHED_ROLES) {
      let list: string[];
      try {
        list = await this.ports.fs.listFilesRecursive(rootPathOf(this.request.layout, role));
      } catch {
        failedThisSample = true;
        this.fileFailures += 1;
        continue;
      }
      if (this.samplerStop) return;
      const violation = list.find((path) => rootViolation(role, path));
      if (violation !== undefined) {
        this.raise("LIVE_ABORT", { condition: "A5", detail: role });
      }
    }
    this.fileConsecutiveFailures = failedThisSample ? this.fileConsecutiveFailures + 1 : 0;
    if (this.fileConsecutiveFailures >= CONSECUTIVE_FAILURES_TO_ABORT) {
      this.raise("LIVE_ABORT", { condition: "A5", detail: "LIST_FAILED" });
    }
  }

  // ── 종료 ─────────────────────────────────────────────────────

  /**
   * 프로세스 트리를 강제 종료한다. **한 번만** 보낸다: 종료 확인은 늦게 올 수 있으므로(Windows에서 taskkill은 확인이 한참 뒤에 온다)
   * "아직 안 죽었다"는 이유로 다시 보내지 않는다. 확인하지 못하면 정리 구간이 KILL_NOT_OBSERVED로 기록한다.
   */
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

  /** stdin을 닫고 유예 안에 끝나지 않으면 강제 종료한다. 끝났으면 true. */
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

  /** 관측 구간: 상태 흐름(lsp-min 보고서 4.1절). 끝나면 자식이 끝났거나 killTree가 불렸거나 곧 불릴 상태다. */
  private async observe(): Promise<void> {
    const L = this.limits;
    const initDeadline = this.rel() + L.initMs;
    const sent = await this.send(
      "initialize",
      buildInitializeMessage(this.request.layout),
      L.initMs
    );
    if (!sent) return;

    const stageMs = this.clamp(initDeadline - this.rel());
    const waited = await this.waitUntil(() => this.initCore !== null || this.stdoutDone, stageMs);
    if (waited === "aborted") return;
    if (this.initCore === null) {
      if (waited === "timeout") {
        this.raise("INIT_TIMEOUT");
        await this.closeStdinThenKill();
      } else {
        // 응답 없이 stdout이 닫혔다(자식이 끝났거나 출력을 닫았다). 더 기다릴 것이 없다.
        this.raise("CHILD_EXITED_EARLY");
      }
      return;
    }
    if (!this.initCore.ok) {
      this.raise("INIT_INVALID");
      await this.closeStdinThenKill();
      return;
    }

    // 정상: shutdown(응답을 기다리지 않는다) → exit → 종료 대기.
    const exitDeadline = this.rel() + L.exitMs;
    if (
      !(await this.send("shutdown", buildShutdownMessage(), this.clamp(exitDeadline - this.rel())))
    )
      return;
    if (!(await this.send("exit", buildExitMessage(), this.clamp(exitDeadline - this.rel()))))
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

  // ── 실행 ─────────────────────────────────────────────────────

  async execute(): Promise<LspMinResult> {
    const refusals = checkLspMinRequest(this.request);
    if (this.signal?.aborted) refusals.push("CANCELLED_BEFORE_START");
    if (refusals.length > 0) return this.refused(refusals);

    // 폴더 준비: 감시 폴더 셋 + 상태·임시 폴더. 전용 홈은 실제 폴더로 만든다.
    const layout = this.request.layout;
    try {
      for (const path of [
        layout.workspace,
        layout.stateDir,
        layout.rulesDir,
        layout.homeDir,
        layout.tmpDir,
      ]) {
        await this.ports.fs.mkdirp(path);
      }
    } catch {
      return this.refused(["STATE_DIR_NOT_CREATED"]);
    }

    // 사전 확인(프로세스를 띄우기 전): 감시 폴더가 비어 있고, 수신기와 프로세스 목록을 읽을 수 있어야 한다.
    const preRefusals: string[] = [];
    for (const role of WATCHED_ROLES) {
      let before: string[] | null = null;
      try {
        before = await this.ports.fs.listFilesRecursive(rootPathOf(layout, role));
      } catch {
        preRefusals.push(`WATCHED_ROOT_UNREADABLE:${role}`);
      }
      if (before !== null && before.length > 0) preRefusals.push(`WATCHED_ROOT_NOT_EMPTY:${role}`);
      this.roots.push({
        role,
        filesBefore: before === null ? null : before.length,
        filesAfter: null,
        added: [],
        removed: [],
        samples: 0,
        failures: 0,
      });
    }
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
    // 사전 확인이 도는 동안 취소됐다면 띄우지 않는다. 이 확인과 아래 리스너 등록 사이에는 await가 없어 취소를 놓칠 틈이 없다.
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
    // 아직 살아 있으면 끝낸다(즉시 이유, 흐름 중 예외, 정상인데 끝나지 않은 경우 모두).
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
        args: [...LSP_MIN_ARGS],
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

      // 최종 표본: 수신기, 남은 자손.
      this.sampleReceiverFinal();
      await this.finalProcessSample(remaining());

      // 출력 스트림이 닫힐 때까지(같은 창 안에서).
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

    // 사후 비교(종료 확인 창과 별개의 읽기): 감시 폴더 목록, 설치물 해시.
    await this.snapshotRootsAfter();
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
          rootPathOf(this.request.layout, root.role)
        );
        root.filesAfter = now.length;
        // 실행 전에는 비어 있었으므로 전부 추가된 파일이다(실행 전 목록이 비어 있지 않으면 시작하지 않는다).
        root.added = now;
        root.removed = [];
      } catch {
        root.filesAfter = null;
      }
    }
  }

  private async hashArtifacts(phase: "before" | "after"): Promise<ArtifactFacts[]> {
    const out: ArtifactFacts[] = [];
    for (const item of this.request.artifacts ?? []) {
      let sha: string | null = null;
      try {
        sha = (await this.ports.hasher.hashFile(item.path, { maxBytes: DEFAULT_WHEEL_MAX_BYTES }))
          .sha256;
      } catch {
        sha = null;
      }
      out.push({
        label: item.label,
        before: phase === "before" ? sha : null,
        after: phase === "after" ? sha : null,
      });
    }
    return out;
  }

  // ── 기록 ─────────────────────────────────────────────────────

  private refused(refusals: string[]): LspMinResult {
    return this.build(refusals, null);
  }

  private finish(observationEndMs: number): LspMinResult {
    if (this.trigger === null) this.trigger = this.spawnOk ? "NORMAL" : "SPAWN_FAILED";
    return this.build([], observationEndMs);
  }

  private build(refusals: string[], observationEndMs: number | null): LspMinResult {
    const stdoutBytes = joinChunks(this.stdoutChunks);
    const stderrBytes = joinChunks(this.stderrChunks);
    const facts: LspMinFacts = {
      runId: this.request.runId,
      provenance: this.spawnAttempted ? this.provenance : null,
      refusals,
      limits: this.limits,
      expectedVersion: this.request.expectedVersion ?? null,
      spawn: { attempted: this.spawnAttempted, ok: this.spawnOk, pid: this.child?.pid ?? null },
      sends: this.sends,
      stdout: { ...this.stdout, bytes: stdoutBytes },
      stderr: { ...this.stderr, bytes: stderrBytes },
      frameError: this.frameError,
      initResponseAtMs: this.initAtMs,
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
        stderrCheckedBytes: this.stderrWatcher.checkedBytes,
        stdoutFramesChecked: this.framesChecked,
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
      artifacts: this.artifacts,
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
      record: buildObservationRecord(facts),
      raw: { stdout: stdoutBytes, stderr: stderrBytes },
    };
  }
}

// @MX:ANCHOR: [AUTO] LSP-MIN-1 최소 기동 관측의 유일한 진입점 — 시험과 (앞으로의) 실제 실행 진입 스크립트가 모두 이 함수로 기록을 얻는다.
// @MX:REASON: "요청 검사 전에는 아무것도 만들지 않는다", "initialized를 보내지 않는다", "전체 상한 뒤에 유예를 붙이지 않는다",
// "관측 결과와 정리 결과를 섞지 않는다"가 이 함수 한 곳에서 지켜진다.
export async function runLspMinObservation(
  ports: LspMinPorts,
  request: LspMinRequest
): Promise<LspMinResult> {
  const resolved = resolveLimits(request.limits);
  const run = new Run(ports, request, resolved.limits);
  return run.execute();
}
