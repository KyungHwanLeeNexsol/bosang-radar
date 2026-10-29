// 시험 전용: LSP-MIN-1 실행기를 위한 스크립트형 가짜 서버. 실제 Semgrep이 아니다 — 여기서 얻은 결과는 실행기 로직이 합성 입력에서
// 의도대로 동작한다는 것만 보여 줄 뿐, 실제 Semgrep의 동작 증거가 아니다. 기존 stub-lsp.ts(정상 시작 경로용)와 달리 `initialized`를
// 받지 않는 최소 경로의 서버 동작(초기화 실패, 무응답, shutdown 무시, EOF 반응 등)을 흉내 낸다.

import { encodeFrame, FrameDecoder } from "../framing";
import type { Clock, JsonRpcMessage, SpawnSpec } from "../types";
import { FakeChild, FakePort, type FakeChildOptions } from "./fake-process";

export const STUB_VERSION = "9.9.9"; // 실제 핀(1.180.0)과 헷갈리지 않도록 일부러 다른 값을 쓴다.

export const GOOD_RESULT = {
  capabilities: { textDocumentSync: 1 },
  serverInfo: { name: "Semgrep", version: STUB_VERSION },
} as const;

export type InitBehavior =
  /** 정해진 result로 응답한다. */
  | {
      kind: "result";
      result?: unknown;
      delayMs?: number;
      byteByByte?: boolean;
      logBefore?: boolean;
      id?: unknown;
    }
  /** JSON-RPC error 응답. */
  | { kind: "error"; delayMs?: number }
  /** 공개 소스가 초기화 예외 때 보내는 모양: 오류 로그 알림을 먼저 보내고 result에 `{retry:false}`를 담는다. */
  | { kind: "initialize-error"; delayMs?: number }
  /** 임의의 프레임들을 차례로 보낸다. */
  | { kind: "frames"; frames: JsonRpcMessage[]; delayMs?: number }
  /** 원문 바이트를 그대로 보낸다(깨진 프레임 시험). */
  | { kind: "raw"; bytes: Uint8Array | string; delayMs?: number }
  /** 응답하지 않는다. */
  | { kind: "silent" }
  /** 응답 없이 곧바로 끝난다. */
  | { kind: "exit"; code?: number | null };

export interface MinScript {
  init: InitBehavior;
  /** shutdown 요청에 대한 반응. 실제 서버는 응답하지 않는다. */
  shutdown?: "silent" | "reply";
  /** exit 알림에 대한 반응. 기본 exit0. ignore는 초기화되지 않은 서버처럼 무시한다. */
  exit?: "exit0" | "exit1" | "ignore";
  /** stdin이 닫혔을 때의 반응. 기본 exit(EOF로 루프가 끝난다). */
  stdinEnd?: "exit" | "ignore";
  /** 시작 후 해당 시각(ms)에 stderr로 내보낼 텍스트(개행은 직접 넣는다). */
  stderrAt?: { atMs: number; text: string }[];
  /** 시작 후 해당 시각(ms)에 stdout으로 내보낼 프레임. */
  stdoutAt?: { atMs: number; frame: JsonRpcMessage }[];
  /** N번째 stdin 쓰기(1부터)를 거부한다(EPIPE 흉내). */
  failWriteNumber?: number;
  /** N번째 stdin 쓰기가 끝나지 않는다(꽉 찬 파이프 흉내). */
  hangWriteNumber?: number;
  /** dispose가 거부된다. */
  disposeFails?: boolean;
  /** 끝나도 stdout·stderr를 닫지 않는다(손자가 파이프를 쥔 경우). */
  exitKeepsStreamsOpen?: boolean;
  /** initialize에 응답한 직후 스스로 끝난다(shutdown·exit를 받지 못한 채). */
  exitAfterInit?: boolean;
  /** kill()을 받고 이 시간(ms) 뒤에 끝난다(종료 확인이 늦게 오는 운영체제 흉내). 없으면 곧바로 끝난다. */
  killExitDelayMs?: number;
}

function encodeText(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export class LspMinChild extends FakeChild {
  /** 하네스가 보낸 메시지(해석한 것). */
  readonly received: JsonRpcMessage[] = [];
  /** 허용된 셋(initialize·shutdown·exit) 밖의 메서드. 비어 있어야 한다. */
  readonly unexpected: string[] = [];
  endStdinCalls = 0;

  private readonly decoder = new FrameDecoder();

  constructor(
    private readonly script: MinScript,
    private readonly clock: Clock,
    options: FakeChildOptions = {}
  ) {
    super(options);
    this.onStdinWrite((data) => this.onWrite(data));
    for (const item of script.stderrAt ?? []) {
      this.clock.setTimer(() => this.emitStderr(item.text), item.atMs);
    }
    for (const item of script.stdoutAt ?? []) {
      this.clock.setTimer(() => this.emitStdoutFrame(item.frame), item.atMs);
    }
  }

  private writeCalls = 0;

  /** 스크립트에 따라 스스로 끝난다(필요하면 출력 스트림을 열어 둔다). */
  private finish(code: number | null): void {
    this.exit(code, null, { closeStreams: this.script.exitKeepsStreamsOpen !== true });
  }

  override async writeStdin(data: Uint8Array): Promise<void> {
    this.writeCalls += 1;
    if (this.script.failWriteNumber === this.writeCalls) throw new Error("write EPIPE");
    if (this.script.hangWriteNumber === this.writeCalls) {
      await new Promise<void>(() => {}); // 영원히 끝나지 않는다
    }
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

  private after(ms: number | undefined, fn: () => void): void {
    if (!ms) fn();
    else this.clock.setTimer(fn, ms);
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
    if (method === "shutdown") {
      if (this.script.shutdown === "reply") {
        this.emitStdoutFrame({ jsonrpc: "2.0", id: message.id as string, result: null });
      }
      return;
    }
    if (method === "exit") {
      const mode = this.script.exit ?? "exit0";
      if (mode === "exit0") queueMicrotask(() => this.finish(0));
      else if (mode === "exit1") queueMicrotask(() => this.finish(1));
      return;
    }
    this.unexpected.push(String(method));
  }

  /** 응답을 내보낸 바로 그 순간 끝난다 — 하네스가 응답을 읽고 다음 메시지를 쓰기 전에 stdin이 닫힌다. */
  private afterEmit(): void {
    if (this.script.exitAfterInit) queueMicrotask(() => this.finish(0));
  }

  private reactInit(message: JsonRpcMessage): void {
    const b = this.script.init;
    const id = message.id as string;
    switch (b.kind) {
      case "silent":
        return;
      case "exit":
        queueMicrotask(() => this.finish(b.code ?? 0));
        return;
      case "result":
        this.after(b.delayMs, () => {
          if (b.logBefore) {
            this.emitStdoutFrame({
              jsonrpc: "2.0",
              method: "window/logMessage",
              params: { type: 1, message: "stub" },
            });
          }
          const frame = {
            jsonrpc: "2.0",
            id: ("id" in b ? (b.id as string) : id) as string,
            result: "result" in b ? b.result : GOOD_RESULT,
          } as JsonRpcMessage;
          if (b.byteByByte) {
            for (const byte of encodeFrame(frame)) this.emitStdout(Uint8Array.of(byte));
          } else {
            this.emitStdoutFrame(frame);
          }
          this.afterEmit();
        });
        return;
      case "error":
        this.after(b.delayMs, () =>
          this.emitStdoutFrame({
            jsonrpc: "2.0",
            id,
            error: { code: -32602, message: "stub invalid params" },
          })
        );
        return;
      case "initialize-error":
        this.after(b.delayMs, () => {
          this.emitStdoutFrame({
            jsonrpc: "2.0",
            method: "window/logMessage",
            params: { type: 1, message: "Error initializing server" },
          });
          this.emitStdoutFrame({ jsonrpc: "2.0", id, result: { retry: false } });
        });
        return;
      case "frames":
        this.after(b.delayMs, () => {
          for (const frame of b.frames) this.emitStdoutFrame(frame);
        });
        return;
      case "raw":
        this.after(b.delayMs, () =>
          this.emitStdout(typeof b.bytes === "string" ? encodeText(b.bytes) : b.bytes)
        );
        return;
    }
  }
}

export interface LspMinPortOptions {
  child?: FakeChildOptions;
  /** 자식을 직접 바꾸고 싶을 때(스트림 교체 등). */
  decorate?: (child: LspMinChild, spec: SpawnSpec) => void;
}

/** spawn마다 스크립트형 가짜 서버가 붙은 자식을 만드는 포트. children[i]가 i번째 자식이다. */
export function lspMinPort(
  script: MinScript,
  clock: Clock,
  options: LspMinPortOptions = {}
): { port: FakePort; children: LspMinChild[] } {
  const children: LspMinChild[] = [];
  const port = new FakePort({
    childFactory: (spec) => {
      const child = new LspMinChild(script, clock, options.child ?? {});
      options.decorate?.(child, spec);
      children.push(child);
      return child;
    },
  });
  return { port, children };
}
