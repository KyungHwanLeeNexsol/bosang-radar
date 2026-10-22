// PH1~PH4 세션 제어기(ADR D1). 프로세스·시계는 포트로 주입받고, 판정은 하지 않는다 — 수집하고 단계를
// 진행시킬 뿐이며, 관측한 것은 전부 트랜스크립트 사건으로 남긴다(판정은 evaluate.ts의 몫이다).
//
// 공개 API:
//   runSession(deps, spawnSpec, config, run): Promise<Transcript>
//   assertSessionConfig(config, run)   잘못된 설정이면 던진다(아무것도 띄우기 전)
//   SessionDeps / SessionConfig / SessionLimits / SessionRun
//
// 불변식:
//  · 운영상의 실패(띄우기 실패, stdin 오류, 프레임 오류, EOF·종료, 한도 초과, 취소)는 전부 사건이 되고
//    함수는 항상 트랜스크립트로 이행한다. 던지는 것은 프로그래머 오류(잘못된 설정)뿐이고, 그때는 아무것도
//    띄우기 전에 던진다.
//  · 기록자는 하나다: seq·t·cursor·인덱스를 한 곳에서 매기므로 결과가 validateTranscript를 통과한다.
//  · scanWorkspace는 정확히 한 번만 보낸다. didOpen·didSave·refreshRules는 보내지 않는다.
//  · 장벽 전에는 echo-post를 보내지 않는다. shutdown의 응답은 기다리지 않는다.
//  · stdout·stderr는 StreamCollector가 서로 독립으로 EOF까지 읽는다(결정이 난 뒤에도, 자식이 끝난 뒤에도).
//  · 한도 초과·취소·프레임 오류·stdin 오류는 성공 경로로 이어지지 않는다: 종료(SIGTERM → 유예 → SIGKILL)와
//    정리로 간다.
//  · 자식을 띄웠다면 cleanup 사건이 정확히 한 건, 마지막에 남는다. 띄우지 못했으면 spawn-failed만 남고
//    cleanup은 없다. 정리가 완벽하지 않으면(dispose 예외, 타이머 취소 실패, 종료·스트림 닫힘 미관측,
//    스트림 읽기 오류) cleanup은 ok:false다 — 그 detail에는 환경변수 값을 쓰지 않는다.
//  · 환경의 전역 시간 함수(Date.now·setTimeout)는 쓰지 않는다. 시간은 주입된 Clock뿐이다.
//
// 한도의 잰 곳(모두 해당 송신 또는 대기 시작 시각부터): init = initialize 송신, rules = initialized 송신,
// echo = 각 debug/echo 송신, scan = scanWorkspace 송신, exit = shutdown 송신(이어서 exit 송신), killGrace = 각 종료 신호 뒤.
// 쓰기(writeStdin)도 같은 한도로 묶인다: 끝나지 않는 쓰기는 waitingFor "stdin-write"의 timeout 사건이 된다.

import { encodeFrame } from "./framing";
import { IdGenerator, ResponseRouter, isResponse, makeNotification, makeRequest } from "./jsonrpc";
import { classifyStderrLine, defaultLogFormat, type LogFormat } from "./log-matcher";
import { StreamCollector } from "./streams";
import {
  SCHEMAS,
  type ChildHandle,
  type Clock,
  type Cursor,
  type ExitInfo,
  type JsonRpcId,
  type JsonRpcMessage,
  type Mode,
  type Phase,
  type ProcessPort,
  type SendLabel,
  type SpawnSpec,
  type TimerHandle,
  type Transcript,
  type TranscriptEvent,
} from "./types";

// ── 공개 타입 ───────────────────────────────────────────────────

export interface SessionLimits {
  /** initialize 응답까지(ms). */
  init: number;
  /** initialized 뒤 rulesRefreshed 알림 + `Scanned open documents` 줄까지(ms). */
  rules: number;
  /** scanWorkspace 송신 뒤 장벽 줄까지(ms). */
  scan: number;
  /** 각 debug/echo 송신 뒤 응답까지(ms). */
  echo: number;
  /** exit 송신 뒤 프로세스 종료까지(ms). */
  exit: number;
  /** 종료 신호(SIGTERM·SIGKILL) 뒤 종료를 기다리는 유예, 그리고 dispose 뒤 종료·스트림 닫힘을 기다리는 한도(ms). */
  killGrace: number;
}

export interface SessionConfig {
  limits: SessionLimits;
  /** stderr 줄에서 메시지 본문을 꺼내는 주입점. 기본: 줄 전체. */
  logFormat?: LogFormat;
}

export interface SessionRun {
  runId: string;
  mode: Mode;
  targetSha: string | null;
  signal?: AbortSignal;
  /** initialize 요청의 params(JSON으로 직렬화 가능해야 한다). */
  initializeParams: unknown;
  /** scanWorkspace 알림의 params. 기본 `{ full: true }`. full은 true여야 한다. */
  scanParams?: Record<string, unknown>;
}

export interface SessionDeps {
  process: ProcessPort;
  clock: Clock;
}

// ── 설정 검사(프로그래머 오류는 아무것도 띄우기 전에 던진다) ─────

const LIMIT_KEYS = ["init", "rules", "scan", "echo", "exit", "killGrace"] as const;

/** 설정 검사(프로그래머 오류). runSession이 아무것도 띄우기 전에 부르고, 하네스도 파일을 만지기 전에 부른다. */
export function assertSessionConfig(config: SessionConfig, run: SessionRun): void {
  if (typeof config !== "object" || config === null || typeof config.limits !== "object") {
    throw new TypeError("SessionConfig.limits가 필요하다");
  }
  for (const key of LIMIT_KEYS) {
    const value = (config.limits as unknown as Record<string, unknown>)[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      throw new TypeError(`limits.${key}는 0보다 큰 유한한 수여야 한다`);
    }
  }
  if (typeof run.runId !== "string" || run.runId.length === 0) {
    throw new TypeError("runId가 비어 있다");
  }
  if (run.mode !== "control" && run.mode !== "target") {
    throw new TypeError(`알 수 없는 mode: ${String(run.mode)}`);
  }
  if (run.scanParams !== undefined && run.scanParams.full !== true) {
    throw new TypeError("scanParams.full은 true여야 한다(전체 스캔만 보낸다)");
  }
  try {
    // 직렬화할 수 없는 params(순환·BigInt 등)는 띄우기 전에 걸러낸다.
    encodeFrame(makeRequest("check", "initialize", run.initializeParams));
    encodeFrame(makeNotification("semgrep/scanWorkspace", run.scanParams ?? { full: true }));
  } catch {
    throw new TypeError("initializeParams·scanParams를 JSON으로 직렬화할 수 없다");
  }
}

// ── 내부 도구 ───────────────────────────────────────────────────

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type Draft = DistributiveOmit<TranscriptEvent, "seq" | "t">;

type WaitResult = "ok" | "timeout" | "cancelled" | "dead";
/** 강제 종료로 이어지는 이유. null이면 정상 진행이다. */
type StopReason = "timeout" | "cancelled" | "frame-error" | "stdin-error" | "stream-closed";

interface WaitSpec {
  phase: Phase;
  waitingFor: string;
  limitMs: number;
  cond: () => boolean;
  needsStdout: boolean;
  needsStderr: boolean;
}

function describeError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

// ── 세션 ────────────────────────────────────────────────────────

class Session {
  private readonly clock: Clock;
  private readonly fmt: LogFormat;
  private readonly limits: SessionLimits;
  private readonly events: TranscriptEvent[] = [];
  private stdoutCount = 0;
  private stderrCount = 0;
  private closed = false;
  private phase: Phase = "PH0";

  private readonly timers = new Set<TimerHandle>();
  private timerProblems = 0;
  private killProblem = false;
  private streamProblems = 0;
  private internalError: string | null = null;

  private child: ChildHandle | null = null;
  private collectorsEnded: Promise<void> = Promise.resolve();
  private readonly exitSeen: Promise<void>;
  private resolveExitSeen: () => void = () => {};

  private readonly router = new ResponseRouter();
  private readonly responses = new Map<JsonRpcId, JsonRpcMessage>();
  private readonly ids = {
    init: new IdGenerator("init"),
    echoPre: new IdGenerator("echo-pre"),
    echoPost: new IdGenerator("echo-post"),
    shutdown: new IdGenerator("shutdown"),
  };

  private active: { check: () => void } | null = null;

  // 관측한 사실(전진 조건용 — 판정이 아니다)
  private rulesRefreshedSeen = false;
  private scannedOpenSeen = false;
  private scanSent = false;
  private barrierSeen = false;
  private stdoutEof = false;
  private stderrEof = false;
  private frameError = false;
  private stdinFailed = false;
  private cancelled = false;
  private exitInfo: ExitInfo | null = null;
  private killIssued = false;

  private readonly onAbort = (): void => this.cancel();

  constructor(
    private readonly deps: SessionDeps,
    config: SessionConfig,
    private readonly run: SessionRun
  ) {
    this.clock = deps.clock;
    this.fmt = config.logFormat ?? defaultLogFormat;
    this.limits = config.limits;
    this.exitSeen = new Promise<void>((resolve) => {
      this.resolveExitSeen = resolve;
    });
  }

  async execute(spec: SpawnSpec): Promise<Transcript> {
    const signal = this.run.signal;
    if (signal) {
      if (signal.aborted) this.cancel();
      else signal.addEventListener("abort", this.onAbort, { once: true });
    }
    // 이미 취소됐다면 프로세스를 띄우지 않는다(띄웠다가 곧바로 죽이는 일을 만들지 않는다).
    if (this.cancelled) return this.finishWithoutChild();

    let child: ChildHandle;
    try {
      child = await this.deps.process.spawn(spec);
    } catch (error) {
      this.rec({ kind: "spawn-failed", message: describeError(error) });
      return this.finishWithoutChild();
    }
    this.child = child;
    this.rec({ kind: "spawn", pid: child.pid });
    this.attach(child);

    let stop: StopReason | null = null;
    try {
      stop = await this.runPhases();
      if (stop !== null) await this.terminate(stop);
    } catch (error) {
      // 예상하지 못한 내부 예외: 던지지 않고 정리로 가며, 정리 기록을 실패로 남긴다.
      this.internalError = error instanceof Error ? error.name : "unknown";
      await this.terminate("cancelled").catch(() => {});
    }
    await this.cleanup();
    return this.transcript();
  }

  // ── 기록 ──────────────────────────────────────────────────────

  private cursor(): Cursor {
    return { stdout: this.stdoutCount, stderr: this.stderrCount };
  }

  private rec(draft: Draft): void {
    if (this.closed) return;
    const event = { ...draft, seq: this.events.length, t: this.clock.now() } as TranscriptEvent;
    this.events.push(event);
    this.active?.check();
  }

  private setPhase(phase: Phase): void {
    this.phase = phase;
    this.rec({ kind: "phase", phase, cursor: this.cursor() });
  }

  private transcript(): Transcript {
    return {
      meta: {
        schema: SCHEMAS.transcript,
        runId: this.run.runId,
        mode: this.run.mode,
        provenance: this.deps.process.provenance,
        targetSha: this.run.targetSha,
      },
      events: this.events,
    };
  }

  private finishWithoutChild(): Transcript {
    this.run.signal?.removeEventListener("abort", this.onAbort);
    this.closed = true;
    return this.transcript();
  }

  // ── 타이머 ────────────────────────────────────────────────────

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
      this.timerProblems++;
    }
  }

  /** promise가 이행되면 true, ms 안에 이행되지 않으면 false. 타이머는 항상 정리한다. */
  private race(promise: Promise<void>, ms: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const timer = this.startTimer(() => resolve(false), ms);
      void promise.then(() => {
        this.stopTimer(timer);
        resolve(true);
      });
    });
  }

  // ── 스트림 수집 ───────────────────────────────────────────────

  private attach(child: ChildHandle): void {
    child.exited.then(
      (info) => this.onExit(info),
      () => this.onExit({ code: null, signal: null })
    );
    const collector = new StreamCollector({
      onStdoutMessage: (_index, message) => this.onStdoutMessage(message),
      onStdoutFrameError: (error) => {
        this.frameError = true;
        this.rec({
          kind: "stdout-frame-error",
          error: error.kind,
          detail: error.detail,
          atByte: error.atByte,
        });
      },
      onStdoutEof: () => {
        this.stdoutEof = true;
        this.rec({ kind: "stdout-eof" });
      },
      onStderrLine: (_index, text, partial) => this.onStderrLine(text, partial),
      onStderrEof: () => {
        this.stderrEof = true;
        this.rec({ kind: "stderr-eof" });
      },
      onStreamError: () => {
        this.streamProblems++;
      },
    });
    try {
      this.collectorsEnded = collector.attach(child).then(
        () => {},
        () => {
          this.streamProblems++;
        }
      );
    } catch {
      this.streamProblems++;
    }
  }

  private onStdoutMessage(message: JsonRpcMessage): void {
    if (isResponse(message)) {
      const outcome = this.router.route(message);
      if (outcome.kind === "matched" && outcome.id !== null) {
        this.responses.set(outcome.id, message);
      }
    } else if (message.method === "semgrep/rulesRefreshed" && message.id === undefined) {
      this.rulesRefreshedSeen = true;
    }
    this.rec({ kind: "stdout-message", index: this.stdoutCount++, message });
  }

  private onStderrLine(text: string, partial: boolean): void {
    if (!partial) {
      const classified = classifyStderrLine(text, this.fmt);
      if (classified?.key === "scannedOpenDocuments") this.scannedOpenSeen = true;
      // 스캔 요청을 보내기 전의 장벽 줄은 이번 스캔의 장벽이 아니다.
      else if (classified?.key === "barrier" && this.scanSent) this.barrierSeen = true;
    }
    this.rec({ kind: "stderr-line", index: this.stderrCount++, text, partial });
  }

  private onExit(info: ExitInfo): void {
    if (this.exitInfo !== null) return;
    this.exitInfo = info;
    this.rec({ kind: "exit", code: info.code, signal: info.signal, byHarness: this.killIssued });
    this.resolveExitSeen();
  }

  // ── 취소 ──────────────────────────────────────────────────────

  private cancel(): void {
    if (this.cancelled || this.closed) return;
    this.cancelled = true;
    this.rec({ kind: "cancelled", phase: this.phase });
  }

  // ── 송신과 대기 ───────────────────────────────────────────────

  /** 송신 사건을 먼저 기록한 뒤 쓴다 — 원인이 결과(응답·로그)보다 반드시 앞선 seq를 갖는다. */
  private async send(label: SendLabel, message: JsonRpcMessage): Promise<boolean> {
    const child = this.child as ChildHandle;
    if (message.method !== undefined && message.id !== undefined && message.id !== null) {
      this.router.register(message.id);
    }
    this.rec({ kind: "send", label, message, cursor: this.cursor() });
    try {
      await child.writeStdin(encodeFrame(message));
      return true;
    } catch (error) {
      this.stdinFailed = true;
      this.rec({ kind: "stdin-error", message: describeError(error) });
      return false;
    }
  }

  private isDead(spec: WaitSpec): boolean {
    return (
      this.frameError ||
      this.stdinFailed ||
      (spec.needsStdout && this.stdoutEof) ||
      (spec.needsStderr && this.stderrEof)
    );
  }

  private wait(spec: WaitSpec): Promise<WaitResult> {
    return new Promise<WaitResult>((resolve) => {
      const startedAt = this.clock.now();
      let settled = false;
      let timer: TimerHandle | null = null;
      const handle = {
        check: () => {
          if (settled) return;
          if (this.cancelled) settle("cancelled");
          else if (spec.cond()) settle("ok");
          else if (this.isDead(spec)) settle("dead");
        },
      };
      const settle = (result: WaitResult): void => {
        if (settled) return;
        settled = true;
        if (timer) this.stopTimer(timer);
        if (this.active === handle) this.active = null;
        resolve(result);
      };
      this.active = handle;
      timer = this.startTimer(() => {
        if (settled) return;
        // 먼저 닫고 기록한다: 기록이 check를 불러 다른 결과로 닫는 일을 막는다.
        settled = true;
        if (this.active === handle) this.active = null;
        this.rec({
          kind: "timeout",
          phase: spec.phase,
          waitingFor: spec.waitingFor,
          afterMs: this.clock.now() - startedAt,
        });
        resolve("timeout");
      }, spec.limitMs);
      handle.check();
    });
  }

  private stopReason(): StopReason | null {
    if (this.cancelled) return "cancelled";
    if (this.frameError) return "frame-error";
    if (this.stdinFailed) return "stdin-error";
    return null;
  }

  private reasonOf(result: WaitResult): StopReason | null {
    switch (result) {
      case "ok":
        return null;
      case "timeout":
        return "timeout";
      case "cancelled":
        return "cancelled";
      case "dead":
        return this.stopReason() ?? "stream-closed";
    }
  }

  // ── 단계 ──────────────────────────────────────────────────────

  /**
   * 한도는 송신 시각부터 잰다: 대기(와 그 타이머)를 먼저 열고 보낸다. 같은 가상 시각에 도착하는 응답과 한도가 겹치면
   * 먼저 등록된 한도가 이긴다(경계는 한도 초과 쪽으로 닫는다). 쓰기가 거부되면 대기는 곧바로 닫힌다.
   * 쓰기 자체도 같은 타이머로 묶는다: 쓰기가 끝나지 않으면(꽉 찬 파이프 등) 한도가 지났을 때 waitingFor
   * "stdin-write"의 timeout 사건이 남고, 이어서 정상 종료·정리로 간다(끝나지 않는 쓰기를 기다리며 매달리지 않는다).
   */
  private async exchange(
    label: SendLabel,
    message: JsonRpcMessage,
    spec: WaitSpec,
    afterSend?: () => void
  ): Promise<WaitResult> {
    return this.exchangeAll([{ label, message }], spec, afterSend);
  }

  /** exchange의 일반형: 메시지 여러 개를 차례로 쓰고(모두 한 타이머 안), 마지막 쓰기 뒤에 본래의 대기로 이어진다. */
  private async exchangeAll(
    sends: readonly { label: SendLabel; message: JsonRpcMessage }[],
    spec: WaitSpec,
    afterSend?: () => void,
    writeWaitingFor = "stdin-write"
  ): Promise<WaitResult> {
    // 쓰기가 진행 중인 동안의 대기 대상은 "쓰기"다. 타이머는 시간 초과 시점의 waitingFor를 읽는다.
    const live: WaitSpec = { ...spec, waitingFor: writeWaitingFor };
    const waiting = this.wait(live);
    let allSent = true;
    let settledFirst = false;
    for (const item of sends) {
      const outcome = await Promise.race([
        this.send(item.label, item.message),
        waiting.then(() => null),
      ]);
      if (outcome === null) {
        settledFirst = true; // 쓰기가 끝나기 전에 대기가 닫혔다(한도·취소·응답이 먼저 옴)
        break;
      }
      if (!outcome) {
        allSent = false;
        break;
      }
    }
    if (allSent && !settledFirst) {
      live.waitingFor = spec.waitingFor;
      afterSend?.();
    }
    const result = await waiting;
    // 응답이 쓰기 완료 통지보다 먼저 온 경우: 상대가 이미 받은 것이므로 단계 전환은 해 준다.
    if (settledFirst && result === "ok") afterSend?.();
    return !allSent && result === "ok" ? "dead" : result;
  }

  /** 강제 종료가 필요하면 그 이유를, 정상으로 끝나 프로세스가 스스로 종료됐으면 null을 돌려준다. */
  private async runPhases(): Promise<StopReason | null> {
    const L = this.limits;
    let stop = this.stopReason();
    if (stop) return stop;

    // PH1: initialize → 응답 → initialized
    this.setPhase("PH1");
    const initId = this.ids.init.next();
    let result = await this.exchange(
      "initialize",
      makeRequest(initId, "initialize", this.run.initializeParams),
      {
        phase: "PH1",
        waitingFor: "initialize-response",
        limitMs: L.init,
        cond: () => this.responses.has(initId),
        needsStdout: true,
        needsStderr: false,
      }
    );
    stop = this.reasonOf(result);
    if (stop) return stop;
    // 오류 응답이면 계속 진행하지 않는다(규칙 로딩을 기다려 봐야 소용이 없다).
    if ((this.responses.get(initId) as JsonRpcMessage).error !== undefined) return this.graceful();

    // initialized를 보내면서 PH2의 대기를 연다: rulesRefreshed(stdout)와 Scanned open documents(stderr) 둘 다.
    result = await this.exchange(
      "initialized",
      makeNotification("initialized", {}),
      {
        phase: "PH2",
        waitingFor: "rules-refreshed+scanned-open-documents",
        limitMs: L.rules,
        cond: () => this.rulesRefreshedSeen && this.scannedOpenSeen,
        needsStdout: true,
        needsStderr: true,
      },
      () => this.setPhase("PH2")
    );
    stop = this.reasonOf(result);
    if (stop) return stop;

    const preId = this.ids.echoPre.next();
    result = await this.exchange(
      "echo-pre-scan",
      makeRequest(preId, "debug/echo", { phase: "pre-scan" }),
      {
        phase: "PH2",
        waitingFor: "echo-pre-scan-response",
        limitMs: L.echo,
        cond: () => this.responses.has(preId),
        needsStdout: true,
        needsStderr: false,
      }
    );
    stop = this.reasonOf(result);
    if (stop) return stop;
    // echo가 오류 응답이면 스캔하지 않는다(규칙 로딩이 끝났다는 증거가 없다).
    if ((this.responses.get(preId) as JsonRpcMessage).error !== undefined) return this.graceful();

    // PH3: scanWorkspace 정확히 한 번 → 장벽
    this.setPhase("PH3");
    this.scanSent = true;
    result = await this.exchange(
      "scan-workspace",
      makeNotification("semgrep/scanWorkspace", this.run.scanParams ?? { full: true }),
      {
        phase: "PH3",
        waitingFor: "barrier",
        limitMs: L.scan,
        cond: () => this.barrierSeen,
        needsStdout: false,
        needsStderr: true,
      }
    );
    stop = this.reasonOf(result);
    if (stop) return stop;

    // PH4: 장벽 뒤 echo → 그 응답이 올 때까지 읽는다
    this.setPhase("PH4");
    const postId = this.ids.echoPost.next();
    result = await this.exchange(
      "echo-post-barrier",
      makeRequest(postId, "debug/echo", { phase: "post-barrier" }),
      {
        phase: "PH4",
        waitingFor: "echo-post-barrier-response",
        limitMs: L.echo,
        cond: () => this.responses.has(postId),
        needsStdout: true,
        needsStderr: false,
      }
    );
    stop = this.reasonOf(result);
    if (stop) return stop;
    return this.graceful();
  }

  /** shutdown(응답을 기다리지 않는다) → exit → 종료 대기. 종료가 관측되면 null. 두 쓰기는 exit 한도 안에 있다. */
  private async graceful(): Promise<StopReason | null> {
    const early = this.stopReason();
    if (early) return early;
    const result = await this.exchangeAll(
      [
        { label: "shutdown", message: makeRequest(this.ids.shutdown.next(), "shutdown") },
        { label: "exit", message: makeNotification("exit") },
      ],
      {
        phase: this.phase,
        waitingFor: "process-exit",
        limitMs: this.limits.exit,
        cond: () => this.exitInfo !== null,
        needsStdout: false,
        needsStderr: false,
      },
      undefined,
      "exit:stdin-write"
    );
    return this.reasonOf(result);
  }

  // ── 종료와 정리 ───────────────────────────────────────────────

  private kill(signal: "SIGTERM" | "SIGKILL", reason: string): void {
    this.killIssued = true;
    this.rec({ kind: "kill", signal, reason });
    try {
      (this.child as ChildHandle).kill(signal);
    } catch {
      this.killProblem = true;
    }
  }

  /** 살아 있는 자식을 SIGTERM → 유예 → SIGKILL 순으로 끝낸다. 순수한 스트림 닫힘은 자연 종료를 먼저 기다린다. */
  private async terminate(reason: StopReason): Promise<void> {
    if (this.child === null || this.exitInfo !== null) return;
    if (reason === "stream-closed" && (await this.race(this.exitSeen, this.limits.killGrace))) {
      return;
    }
    for (const signal of ["SIGTERM", "SIGKILL"] as const) {
      this.kill(signal, reason);
      if (await this.race(this.exitSeen, this.limits.killGrace)) return;
    }
  }

  private async cleanup(): Promise<void> {
    const child = this.child as ChildHandle;
    const problems: string[] = [];

    // 아직 살아 있다면 마지막 수단은 dispose다. 그 종료도 하네스가 시킨 것으로 기록한다.
    if (this.exitInfo === null) this.kill("SIGKILL", "dispose");
    try {
      await child.dispose();
    } catch (error) {
      problems.push(`dispose 실패: ${describeError(error).slice(0, 80)}`);
    }
    if (!(await this.race(this.exitSeen, this.limits.killGrace))) {
      problems.push("자식의 종료를 관측하지 못했다");
    }
    if (!(await this.race(this.collectorsEnded, this.limits.killGrace))) {
      problems.push("출력 스트림이 닫히지 않았다");
    }

    // 남은 타이머를 모두 취소한다. 취소하지 못한 타이머가 있으면 정리는 실패다.
    for (const handle of [...this.timers]) this.stopTimer(handle);
    this.run.signal?.removeEventListener("abort", this.onAbort);

    if (this.killProblem) problems.push("종료 신호를 보내지 못했다");
    if (this.streamProblems > 0) problems.push("출력 스트림 읽기 오류");
    if (this.timerProblems > 0) problems.push("타이머를 취소하지 못했다");
    if (this.internalError !== null) problems.push(`내부 예외: ${this.internalError}`);

    this.rec(
      problems.length === 0
        ? { kind: "cleanup", ok: true }
        : { kind: "cleanup", ok: false, detail: problems.join("; ") }
    );
    this.closed = true;
  }
}

// ── 진입점 ──────────────────────────────────────────────────────

// @MX:ANCHOR: [AUTO] 세션 제어기의 유일한 진입점 — 하네스와 시험이 모두 이 함수로 트랜스크립트를 얻는다.
// @MX:REASON: 정리(cleanup 사건 정확히 한 건, 마지막)와 "운영 실패는 던지지 않고 사건이 된다"는 계약이
// 여기서 깨지면 evaluate가 불완전한 기록을 COMPLETE로 읽을 수 있다.
export async function runSession(
  deps: SessionDeps,
  spec: SpawnSpec,
  config: SessionConfig,
  run: SessionRun
): Promise<Transcript> {
  assertSessionConfig(config, run);
  return new Session(deps, config, run).execute(spec);
}
