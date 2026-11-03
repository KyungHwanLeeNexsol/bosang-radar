// 시험 전용: LSP-SCAN-1 실행기를 위한 스크립트형 가짜 서버. 실제 Semgrep이 아니다 — 여기서 얻은 결과는 실행기 로직이 합성 입력에서 의도대로
// 동작한다는 것만 보여 줄 뿐, 실제 Semgrep의 동작 증거가 아니다. `initialized` 뒤 장벽 줄과 `didOpen` 뒤 스캔 반응은 소스에서 도출한 예측이다.
//
// 단계(Step)는 해당 메시지(`initialized`·`didOpen`)를 받은 시각부터의 지연(ms)이다. 한 단계가 stdout 과 stderr 를 각각 한 덩어리로 내며, 바이트를 직접 주면
// 청크 경계를 시험이 정한다(1바이트씩 쪼개기 등).

import { FrameDecoder } from "../framing";
import type { ScanLayout } from "../lsp-scan";
import type { Clock, JsonRpcMessage, SpawnSpec } from "../types";
import { FakeChild, FakePort, type FakeChildOptions } from "./fake-process";
import { crlf, preambleLines, SHUTDOWN_LINES } from "./rules-fixtures";
import { GOOD_RESULT, type InitBehavior } from "./stub-lsp-min";
import {
  barrierStdoutMessages,
  goodNotification,
  scanLay,
  scanPostOpenLines,
  scanPreOpenLines,
} from "./scan-fixtures";

export interface ScanStep {
  /** 메시지를 받은 시각(또는 beforeInitialized 이면 시작)부터의 지연(ms). */
  atMs: number;
  stderr?: string | Uint8Array;
  stdout?: JsonRpcMessage | Uint8Array;
  /** 부수 효과(시험이 메모리 파일 시스템을 만진다). */
  run?: () => void;
}

export interface ScanScript {
  lay: ScanLayout;
  init: InitBehavior;
  preamble?: readonly string[];
  beforeInitialized?: ScanStep[];
  /** `initialized` 를 받은 뒤의 단계. 기본은 정상 장벽(외부 명령 줄 1건 포함). */
  afterInitialized?: ScanStep[];
  /** `didOpen` 을 받은 뒤의 단계. 기본은 정상 스캔 반응. */
  afterDidOpen?: ScanStep[];
  /** `shutdown` 을 받은 뒤의 단계(시각은 shutdown 수신부터). */
  afterShutdown?: ScanStep[];
  onShutdown?: () => void;
  exit?: "exit0" | "exit1" | "ignore";
  /** `exit` 를 받은 뒤 실제 종료까지의 지연(ms). 늦게 도착하는 증거를 시험할 때 쓴다. */
  exitDelayMs?: number;
  stdinEnd?: "exit" | "ignore";
  failWriteNumber?: number;
  hangWriteNumber?: number;
  disposeFails?: boolean;
  exitKeepsStreamsOpen?: boolean;
  /** `didOpen` 을 받은 뒤 이 시각(ms)에 스스로 끝난다. */
  exitAfterDidOpenMs?: number;
  killExitDelayMs?: number;
}

const enc = (text: string): Uint8Array => new TextEncoder().encode(text);

/** 줄 목록을 `gapMs` 간격의 stderr 단계로(줄마다 CRLF). */
export const scanLineSteps = (lines: readonly string[], startMs = 5, gapMs = 5): ScanStep[] =>
  lines.map((l, i) => ({ atMs: startMs + i * gapMs, stderr: `${l}\r\n` }));

/** 바이트 덩어리를 `size` 바이트씩 같은 시각의 단계 여러 개로. */
export function bytesSteps(
  stream: "stdout" | "stderr",
  bytes: Uint8Array,
  atMs: number,
  size: number
): ScanStep[] {
  const out: ScanStep[] = [];
  for (let at = 0; at < bytes.byteLength; at += size) {
    const piece = bytes.slice(at, at + size);
    out.push(stream === "stdout" ? { atMs, stdout: piece } : { atMs, stderr: piece });
  }
  return out;
}

/** `initialized` 뒤의 정상 장벽 줄(외부 명령 시도 줄 1건 포함). */
export function barrierLines(lay: ScanLayout = scanLay): string[] {
  return scanPreOpenLines(lay).slice(preambleLines(lay.rulesDir).length);
}

/** 정상 장벽의 stdout 단계(초기화 응답 제외): 진행 요청 → rulesRefreshed → 진행 요청. */
export function barrierStdoutSteps(): ScanStep[] {
  const messages = barrierStdoutMessages().slice(1);
  const at = [12, 13, 52, 53, 58, 59, 66];
  return messages.map((stdout, i) => ({ atMs: at[i], stdout }));
}

export function happyAfterInitialized(lay: ScanLayout = scanLay): ScanStep[] {
  return [...scanLineSteps(barrierLines(lay)), ...barrierStdoutSteps()];
}

export interface HappyDidOpen {
  /** 엔진 로그 묶음(`Found 1 matches` 까지)이 도착하는 지연. 기본 50. */
  logAtMs?: number;
  /** 진단 알림이 도착하는 지연. 기본 45. */
  diagAtMs?: number;
  lines?: string[];
  messages?: JsonRpcMessage[];
}

/** `didOpen` 뒤의 정상 스캔 반응: 로그 묶음은 한 덩어리로, 나머지 덤프는 10ms 뒤에, 진단 알림은 따로. */
export function happyAfterDidOpen(o: HappyDidOpen = {}, lay: ScanLayout = scanLay): ScanStep[] {
  const lines = o.lines ?? scanPostOpenLines(lay);
  const cut = lines.indexOf("Found 1 matches") + 1;
  const logAt = o.logAtMs ?? 50;
  const steps: ScanStep[] = [{ atMs: logAt, stderr: enc(crlf(lines.slice(0, cut))) }];
  if (cut < lines.length) steps.push({ atMs: logAt + 10, stderr: enc(crlf(lines.slice(cut))) });
  for (const message of o.messages ?? [goodNotification()]) {
    steps.push({ atMs: o.diagAtMs ?? 45, stdout: message });
  }
  return steps;
}

export class ScanChild extends FakeChild {
  /** 하네스가 보낸 메시지(해석한 것). */
  readonly received: JsonRpcMessage[] = [];
  /** 허용된 다섯(initialize·initialized·didOpen·shutdown·exit) 밖의 메서드나 id만 있는 응답, 두 번째 didOpen. 비어 있어야 한다. */
  readonly unexpected: string[] = [];
  endStdinCalls = 0;
  didOpenCount = 0;
  didOpenAtMs: number | null = null;
  initializedAtMs: number | null = null;
  /** didOpen 이 실려 온 params(그대로). */
  didOpenParams: unknown = null;

  private readonly decoder = new FrameDecoder();
  private writeCalls = 0;

  constructor(
    private readonly script: ScanScript,
    private readonly clock: Clock,
    options: FakeChildOptions = {}
  ) {
    super(options);
    this.onStdinWrite((data) => this.onWrite(data));
    const preamble = script.preamble ?? preambleLines(script.lay.rulesDir);
    if (preamble.length > 0) this.emitStderr(crlf(preamble));
    this.schedule(script.beforeInitialized ?? []);
  }

  private schedule(steps: readonly ScanStep[]): void {
    for (const step of steps) {
      this.clock.setTimer(() => {
        if (this.hasExitedNow) return;
        step.run?.();
        if (typeof step.stderr === "string") this.emitStderr(step.stderr);
        else if (step.stderr !== undefined) this.emitStderrBytes(step.stderr);
        if (step.stdout !== undefined) {
          if (step.stdout instanceof Uint8Array) this.emitStdout(step.stdout);
          else this.emitStdoutFrame(step.stdout);
        }
      }, step.atMs);
    }
  }

  private finish(code: number | null): void {
    this.exit(code, null, { closeStreams: this.script.exitKeepsStreamsOpen !== true });
  }

  override async writeStdin(data: Uint8Array): Promise<void> {
    this.writeCalls += 1;
    if (this.script.failWriteNumber === this.writeCalls) throw new Error("write EPIPE");
    if (this.script.hangWriteNumber === this.writeCalls) await new Promise<void>(() => {});
    await super.writeStdin(data);
  }

  override kill(signal?: "SIGTERM" | "SIGKILL"): void {
    const delay = this.script.killExitDelayMs;
    if (delay === undefined) return super.kill(signal);
    this.killCalls.push(signal);
    this.clock.setTimer(() => this.exit(null, signal ?? "SIGTERM"), delay);
  }

  override async dispose(): Promise<void> {
    await super.dispose();
    if (this.script.disposeFails) throw new Error("dispose failed");
  }

  override async endStdin(): Promise<void> {
    this.endStdinCalls += 1;
    await super.endStdin();
    if ((this.script.stdinEnd ?? "exit") === "exit") queueMicrotask(() => this.finish(0));
  }

  private onWrite(data: Uint8Array): void {
    const pushed = this.decoder.push(data);
    for (const message of pushed.messages) {
      this.received.push(message);
      this.react(message);
    }
  }

  private react(message: JsonRpcMessage): void {
    const method = message.method;
    if (method === "initialize") return this.reactInit(message);
    if (method === "initialized") {
      this.initializedAtMs = this.clock.now();
      this.schedule(this.script.afterInitialized ?? happyAfterInitialized(this.script.lay));
      return;
    }
    if (method === "textDocument/didOpen") {
      this.didOpenCount += 1;
      if (this.didOpenCount > 1) this.unexpected.push("second didOpen");
      this.didOpenAtMs = this.clock.now();
      this.didOpenParams = message.params;
      this.schedule(this.script.afterDidOpen ?? happyAfterDidOpen({}, this.script.lay));
      const exitAt = this.script.exitAfterDidOpenMs;
      if (exitAt !== undefined) this.clock.setTimer(() => this.finish(1), exitAt);
      return;
    }
    if (method === "shutdown") {
      this.emitStderr(crlf(SHUTDOWN_LINES.slice(0, 3)));
      this.script.onShutdown?.();
      this.schedule(this.script.afterShutdown ?? []);
      return;
    }
    if (method === "exit") {
      const mode = this.script.exit ?? "exit0";
      const finishWith = (code: number): void => {
        this.emitStderr(crlf(SHUTDOWN_LINES.slice(3)));
        this.finish(code);
      };
      const run = (): void => {
        if (mode === "exit0") finishWith(0);
        else if (mode === "exit1") finishWith(1);
      };
      const delay = this.script.exitDelayMs;
      if (mode === "ignore") return;
      if (delay === undefined) queueMicrotask(run);
      else this.clock.setTimer(run, delay);
      return;
    }
    this.unexpected.push(method === undefined ? `response:${String(message.id)}` : String(method));
  }

  private reactInit(message: JsonRpcMessage): void {
    const b = this.script.init;
    const id = message.id as string;
    const after = (ms: number | undefined, fn: () => void): void => {
      if (!ms) fn();
      else this.clock.setTimer(fn, ms);
    };
    switch (b.kind) {
      case "silent":
        return;
      case "exit":
        queueMicrotask(() => this.finish(b.code ?? 0));
        return;
      case "result":
        after(b.delayMs, () => {
          this.emitStdoutFrame({
            jsonrpc: "2.0",
            id: ("id" in b ? (b.id as string) : id) as string,
            result: "result" in b ? b.result : GOOD_RESULT,
          } as JsonRpcMessage);
        });
        return;
      case "error":
        after(b.delayMs, () =>
          this.emitStdoutFrame({
            jsonrpc: "2.0",
            id,
            error: { code: -32602, message: "stub invalid params" },
          })
        );
        return;
      case "initialize-error":
        after(b.delayMs, () => {
          this.emitStdoutFrame({
            jsonrpc: "2.0",
            method: "window/logMessage",
            params: { type: 1, message: "Error initializing server" },
          });
          this.emitStdoutFrame({ jsonrpc: "2.0", id, result: { retry: false } });
        });
        return;
      case "frames":
        after(b.delayMs, () => {
          for (const frame of b.frames) this.emitStdoutFrame(frame);
        });
        return;
      case "raw":
        after(b.delayMs, () =>
          this.emitStdout(typeof b.bytes === "string" ? enc(b.bytes) : b.bytes)
        );
        return;
    }
  }
}

export interface ScanPortOptions {
  child?: FakeChildOptions;
  decorate?: (child: ScanChild, spec: SpawnSpec) => void;
}

/** spawn마다 스크립트형 가짜 서버가 붙은 자식을 만드는 포트. children[i]가 i번째 자식이다. */
export function scanPort(
  script: ScanScript,
  clock: Clock,
  options: ScanPortOptions = {}
): { port: FakePort; children: ScanChild[] } {
  const children: ScanChild[] = [];
  const port = new FakePort({
    childFactory: (spec) => {
      const child = new ScanChild(script, clock, options.child ?? {});
      options.decorate?.(child, spec);
      children.push(child);
      return child;
    },
  });
  return { port, children };
}
