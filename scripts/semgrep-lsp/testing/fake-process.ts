// 메모리 상의 ProcessPort·ChildHandle. 실제 프로세스를 띄우지 않으므로 provenance는 "stub"이다.
// 여기서 얻은 결과는 하네스 로직이 합성 입력에서 의도대로 동작한다는 것만 보여 줄 뿐,
// 실제 Semgrep 동작의 증거가 아니다.

import { encodeFrame } from "../framing";
import { AsyncByteQueue } from "../streams";
import type { ChildHandle, ExitInfo, JsonRpcMessage, ProcessPort, SpawnSpec } from "../types";

export type KillMode = "exit" | "ignore-sigterm" | "ignore-all";

export interface FakeChildOptions {
  pid?: number;
  /** kill()에 대한 반응. 기본 "exit". ignore-sigterm은 SIGKILL만 듣고, ignore-all은 무시한다(행 걸린 프로세스). */
  onKill?: KillMode;
}

const encoder = new TextEncoder();

function toBytes(data: Uint8Array | string): Uint8Array {
  return typeof data === "string" ? encoder.encode(data) : data;
}

export class FakeChild implements ChildHandle {
  readonly pid: number | null;
  readonly stdout: AsyncIterable<Uint8Array>;
  readonly stderr: AsyncIterable<Uint8Array>;
  readonly exited: Promise<ExitInfo>;

  /** 하네스가 stdin으로 쓴 바이트(쓴 순서대로, 복사본). */
  readonly stdinWrites: Uint8Array[] = [];
  /** kill() 호출 기록. 신호를 생략한 호출은 undefined로 남는다. */
  readonly killCalls: ("SIGTERM" | "SIGKILL" | undefined)[] = [];

  private readonly outQueue = new AsyncByteQueue();
  private readonly errQueue = new AsyncByteQueue();
  private readonly killMode: KillMode;
  private resolveExited: (info: ExitInfo) => void = () => {};
  private hasExited = false;
  private stdinClosed = false;
  private isDisposed = false;
  private writeHandler: ((data: Uint8Array) => void) | null = null;
  private armedWriteFailure: Error | null = null;

  constructor(options: FakeChildOptions = {}) {
    this.pid = options.pid ?? 4242;
    this.killMode = options.onKill ?? "exit";
    this.stdout = this.outQueue;
    this.stderr = this.errQueue;
    this.exited = new Promise<ExitInfo>((resolve) => {
      this.resolveExited = resolve;
    });
  }

  // ── 시험 쪽 제어 ──────────────────────────────────────────────

  emitStdout(data: Uint8Array | string): void {
    this.outQueue.push(toBytes(data));
  }

  emitStdoutFrame(message: JsonRpcMessage): void {
    this.outQueue.push(encodeFrame(message));
  }

  /** 개행을 붙이지 않는 원문 그대로의 stderr 출력(부분 줄 시험용). */
  emitStderr(text: string): void {
    this.errQueue.push(encoder.encode(text));
  }

  emitStderrLine(text: string): void {
    this.errQueue.push(encoder.encode(`${text}\n`));
  }

  closeStdout(): void {
    this.outQueue.end();
  }

  closeStderr(): void {
    this.errQueue.end();
  }

  /** 프로세스 종료를 흉내 낸다. 기본으로 두 출력 스트림도 닫는다. 이미 끝났으면 무시한다. */
  exit(
    code: number | null,
    signal: string | null = null,
    options: { closeStreams?: boolean } = {}
  ): void {
    if (this.hasExited) return;
    this.hasExited = true;
    this.stdinClosed = true;
    this.resolveExited({ code, signal });
    if (options.closeStreams !== false) {
      this.outQueue.end();
      this.errQueue.end();
    }
  }

  onStdinWrite(handler: (data: Uint8Array) => void): void {
    this.writeHandler = handler;
  }

  /** 다음 writeStdin 한 번을 거부시킨다(EPIPE 같은 쓰기 실패 흉내). */
  failNextStdinWrite(error: Error = new Error("write EPIPE")): void {
    this.armedWriteFailure = error;
  }

  get stdinEnded(): boolean {
    return this.stdinClosed;
  }

  get disposed(): boolean {
    return this.isDisposed;
  }

  get hasExitedNow(): boolean {
    return this.hasExited;
  }

  // ── ChildHandle ───────────────────────────────────────────────

  async writeStdin(data: Uint8Array): Promise<void> {
    if (this.armedWriteFailure) {
      const error = this.armedWriteFailure;
      this.armedWriteFailure = null;
      throw error;
    }
    if (this.stdinClosed) throw new Error("write after end: stdin이 이미 닫혔다");
    const copy = data.slice();
    this.stdinWrites.push(copy);
    this.writeHandler?.(copy);
  }

  async endStdin(): Promise<void> {
    this.stdinClosed = true;
  }

  kill(signal?: "SIGTERM" | "SIGKILL"): void {
    this.killCalls.push(signal);
    const effective = signal ?? "SIGTERM";
    const dies =
      this.killMode === "exit" || (this.killMode === "ignore-sigterm" && effective === "SIGKILL");
    if (!dies) return;
    // 실제 프로세스처럼 비동기로 끝난다 — kill() 직후 같은 틱에서는 아직 살아 있다.
    queueMicrotask(() => this.exit(null, effective));
  }

  async dispose(): Promise<void> {
    if (this.isDisposed) return;
    this.isDisposed = true;
    // 살아 있으면 종료시키고 큐를 모두 닫는다. dispose는 절대 던지지 않는다.
    this.exit(null, "SIGKILL");
    this.outQueue.end();
    this.errQueue.end();
  }
}

export interface FakePortOptions {
  /** spawn마다 FakeChild를 만드는 방법을 바꾼다(kill 모드·pid 지정 등). */
  childFactory?: (spec: SpawnSpec) => FakeChild;
}

export class FakePort implements ProcessPort {
  readonly provenance = "stub" as const;
  readonly spawnCalls: SpawnSpec[] = [];
  readonly children: FakeChild[] = [];

  private readonly childFactory: (spec: SpawnSpec) => FakeChild;
  private armedSpawnFailure: Error | null = null;

  constructor(options: FakePortOptions = {}) {
    this.childFactory = options.childFactory ?? (() => new FakeChild());
  }

  /** 다음 spawn 한 번을 거부시킨다(실행 파일을 못 띄우는 경우). */
  failSpawnWith(error: Error): void {
    this.armedSpawnFailure = error;
  }

  async spawn(spec: SpawnSpec): Promise<ChildHandle> {
    this.spawnCalls.push(spec);
    if (this.armedSpawnFailure) {
      const error = this.armedSpawnFailure;
      this.armedSpawnFailure = null;
      throw error;
    }
    const child = this.childFactory(spec);
    this.children.push(child);
    return child;
  }
}
