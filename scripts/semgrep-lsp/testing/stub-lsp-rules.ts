// 시험 전용: LSP-RULES-1 실행기를 위한 스크립트형 가짜 서버. 실제 Semgrep이 아니다 — 여기서 얻은 결과는 실행기 로직이 합성 입력에서 의도대로 동작한다는
// 것만 보여 줄 뿐, 실제 Semgrep의 동작 증거가 아니다. stub-lsp-min.ts와 달리 `initialized`를 받고 그에 반응하는 단계(로그 줄, 알림, 진행 요청, 파일 쓰기)를
// 시나리오로 정한다. `initialized` 이후의 로그 줄은 소스에서 도출한 예측이다.

import { FrameDecoder } from "../framing";
import type { ArtifactHashPort } from "../tool-observation";
import type { Clock, FsPort, JsonRpcMessage, SpawnSpec } from "../types";
import { FakeChild, FakePort, type FakeChildOptions } from "./fake-process";
import { MemoryArtifactHasher } from "./memory-artifact";
import {
  crlf,
  preambleLines,
  progressCreate,
  progressNotification,
  refreshLines,
  RULES_REFRESHED,
  SHUTDOWN_LINES,
} from "./rules-fixtures";
import { GOOD_RESULT, type InitBehavior } from "./stub-lsp-min";
import { sha256Hex } from "../sha";
import { ArtifactHashError } from "../tool-observation";

export { GOOD_RESULT };

export interface RulesStep {
  /** `initialized`를 받은 시각(또는 beforeInitialized이면 시작)부터의 지연(ms). */
  atMs: number;
  stderr?: string;
  stdout?: JsonRpcMessage;
  /** 파일 쓰기 같은 부수 효과(시험이 메모리 파일 시스템을 만진다). */
  run?: () => void;
}

export const lineSteps = (lines: readonly string[], startMs = 5, gapMs = 5): RulesStep[] =>
  lines.map((l, i) => ({ atMs: startMs + i * gapMs, stderr: `${l}\r\n` }));

/** 정상 경로의 stdout 단계: 진행 요청 → rulesRefreshed → 진행 요청 (기본 줄 간격과 맞춘 시각). */
export function happyStdoutSteps(): RulesStep[] {
  return [
    { atMs: 12, stdout: progressCreate(1, "refresh-token") },
    { atMs: 13, stdout: progressNotification("refresh-token", "begin") },
    { atMs: 52, stdout: RULES_REFRESHED },
    { atMs: 53, stdout: progressNotification("refresh-token", "end") },
    { atMs: 58, stdout: progressCreate(2, "scan-token") },
    { atMs: 59, stdout: progressNotification("scan-token", "begin") },
    { atMs: 66, stdout: progressNotification("scan-token", "end") },
  ];
}

/** 예측한 정상 경로(줄 13개 + 알림·진행 요청). lines를 주면 stderr 줄만 바꾼다. */
export function happyAfterInitialized(rulesDir: string, lines?: readonly string[]): RulesStep[] {
  return [...lineSteps(lines ?? refreshLines({ rulesDir })), ...happyStdoutSteps()];
}

export interface RulesScript {
  rulesDir: string;
  init: InitBehavior;
  /** 시작할 때 stderr로 내는 서두. 기본은 실제 관측을 본뜬 서두. */
  preamble?: readonly string[];
  /** `initialized`를 받기 전, 시작부터의 단계(initialized 이전 신호 시험). */
  beforeInitialized?: RulesStep[];
  /** `initialized`를 받은 뒤의 단계. 기본은 정상 경로. */
  afterInitialized?: RulesStep[];
  /** shutdown을 받았을 때의 부수 효과(홈에 지문 파일 쓰기 등). */
  onShutdown?: () => void;
  exit?: "exit0" | "exit1" | "ignore";
  stdinEnd?: "exit" | "ignore";
  failWriteNumber?: number;
  hangWriteNumber?: number;
  disposeFails?: boolean;
  exitKeepsStreamsOpen?: boolean;
  /** 응답 직후 스스로 끝난다. */
  exitAfterInit?: boolean;
  /** `initialized`를 받은 뒤 이 시각(ms)에 스스로 끝난다(새로고침 도중 종료 흉내). */
  exitAfterInitializedMs?: number;
  killExitDelayMs?: number;
}

function encodeText(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export class RulesChild extends FakeChild {
  /** 하네스가 보낸 메시지(해석한 것). */
  readonly received: JsonRpcMessage[] = [];
  /** 허용된 넷(initialize·initialized·shutdown·exit) 밖의 메서드나 id만 있는 응답. 비어 있어야 한다. */
  readonly unexpected: string[] = [];
  endStdinCalls = 0;
  initializedAtMs: number | null = null;

  private readonly decoder = new FrameDecoder();
  private writeCalls = 0;

  constructor(
    private readonly script: RulesScript,
    private readonly clock: Clock,
    options: FakeChildOptions = {}
  ) {
    super(options);
    this.onStdinWrite((data) => this.onWrite(data));
    // 서두는 시작과 함께 나온다.
    const preamble = script.preamble ?? preambleLines(script.rulesDir);
    if (preamble.length > 0) this.emitStderr(crlf(preamble));
    this.schedule(script.beforeInitialized ?? []);
  }

  private schedule(steps: readonly RulesStep[]): void {
    for (const step of steps) {
      this.clock.setTimer(() => {
        if (this.hasExitedNow) return;
        step.run?.();
        if (step.stderr !== undefined) this.emitStderr(step.stderr);
        if (step.stdout !== undefined) this.emitStdoutFrame(step.stdout);
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
      this.schedule(this.script.afterInitialized ?? happyAfterInitialized(this.script.rulesDir));
      const exitAt = this.script.exitAfterInitializedMs;
      if (exitAt !== undefined) this.clock.setTimer(() => this.finish(1), exitAt);
      return;
    }
    if (method === "shutdown") {
      this.emitStderr(crlf(SHUTDOWN_LINES.slice(0, 3)));
      this.script.onShutdown?.();
      return;
    }
    if (method === "exit") {
      this.emitStderr(crlf(SHUTDOWN_LINES.slice(3)));
      const mode = this.script.exit ?? "exit0";
      if (mode === "exit0") queueMicrotask(() => this.finish(0));
      else if (mode === "exit1") queueMicrotask(() => this.finish(1));
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
          const frame = {
            jsonrpc: "2.0",
            id: ("id" in b ? (b.id as string) : id) as string,
            result: "result" in b ? b.result : GOOD_RESULT,
          } as JsonRpcMessage;
          this.emitStdoutFrame(frame);
          if (this.script.exitAfterInit) queueMicrotask(() => this.finish(0));
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
          this.emitStdout(typeof b.bytes === "string" ? encodeText(b.bytes) : b.bytes)
        );
        return;
    }
  }
}

export interface RulesPortOptions {
  child?: FakeChildOptions;
  decorate?: (child: RulesChild, spec: SpawnSpec) => void;
}

/** spawn마다 스크립트형 가짜 서버가 붙은 자식을 만드는 포트. children[i]가 i번째 자식이다. */
export function rulesPort(
  script: RulesScript,
  clock: Clock,
  options: RulesPortOptions = {}
): { port: FakePort; children: RulesChild[] } {
  const children: RulesChild[] = [];
  const port = new FakePort({
    childFactory: (spec) => {
      const child = new RulesChild(script, clock, options.child ?? {});
      options.decorate?.(child, spec);
      children.push(child);
      return child;
    },
  });
  return { port, children };
}

/**
 * 메모리 파일 시스템에 **실제로 쓴** 파일은 그 내용으로 해시하고, 그 밖의 경로(설치물)는 미리 정해 둔 값으로 해시하는 해시 어댑터.
 * 실행기가 프로브를 쓴 뒤 그 파일을 다시 읽어 대조하는 경로를 시험하려면 파일 시스템에 묶인 해시가 필요하다.
 */
export class FsBackedHasher implements ArtifactHashPort {
  readonly calls: string[] = [];
  /** 이 경로의 해시를 강제로 바꾼다(변조 흉내). */
  readonly overrides = new Map<string, string>();

  constructor(
    private readonly fs: Pick<FsPort, "readFile" | "exists">,
    readonly inner: MemoryArtifactHasher
  ) {}

  async hashFile(
    path: string,
    options: { maxBytes: number; signal?: AbortSignal }
  ): Promise<{ sha256: string; sizeBytes: number }> {
    this.calls.push(path);
    const forced = this.overrides.get(path);
    if (forced !== undefined) return { sha256: forced, sizeBytes: 0 };
    if (await this.fs.exists(path)) {
      let bytes: Uint8Array | null = null;
      try {
        bytes = await this.fs.readFile(path);
      } catch {
        bytes = null; // 디렉터리 등
      }
      if (bytes !== null) {
        if (bytes.byteLength > options.maxBytes) throw new ArtifactHashError("TOO_LARGE", "크다");
        return { sha256: sha256Hex(bytes), sizeBytes: bytes.byteLength };
      }
    }
    return this.inner.hashFile(path, options);
  }
}
