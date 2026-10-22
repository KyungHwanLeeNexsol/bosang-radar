// 비동기 바이트 큐, 줄 조립기, stdout·stderr 독립 수집기.
// 핵심 불변식: 두 스트림은 서로를 기다리지 않는다. 한쪽이 가득 차거나 멈춰도 다른 쪽은 계속
// 읽혀야 하고, 프레임 오류가 난 뒤에도 자식이 가득 찬 파이프에 막히지 않도록 끝까지 비운다.

import { FrameDecoder, type FrameDecodeError } from "./framing";
import type { ChildHandle, Cursor, JsonRpcMessage } from "./types";

// ── AsyncByteQueue ──────────────────────────────────────────────

interface Waiter {
  resolve: (result: IteratorResult<Uint8Array>) => void;
  reject: (error: Error) => void;
}

/**
 * 생산자(push/end/fail)와 소비자(for await)를 잇는 큐. 소비자는 하나라고 가정한다.
 * 반복 시작 전에 push한 조각은 순서대로 보존된다. end/fail 이후의 push는 조용히 무시한다
 * (종료된 프로세스의 늦은 출력이 시험 상태를 흔들지 않게 하려는 의도다).
 * fail은 이미 쌓인 조각을 모두 내준 뒤 반복자가 오류를 한 번 던지게 한다.
 */
export class AsyncByteQueue implements AsyncIterable<Uint8Array> {
  private readonly chunks: Uint8Array[] = [];
  private readonly waiters: Waiter[] = [];
  private closed = false;
  private failure: Error | null = null;

  push(chunk: Uint8Array): void {
    if (this.closed) return;
    const waiter = this.waiters.shift();
    if (waiter) waiter.resolve({ value: chunk, done: false });
    else this.chunks.push(chunk);
  }

  end(): void {
    if (this.closed) return;
    this.closed = true;
    this.flushWaiters();
  }

  fail(error: Error): void {
    if (this.closed) return;
    this.closed = true;
    this.failure = error;
    this.flushWaiters();
  }

  [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
    return {
      next: () => this.take(),
      return: async () => {
        // 소비자가 중간에 떠나면 남은 조각은 버린다.
        this.chunks.length = 0;
        return { value: undefined, done: true };
      },
    };
  }

  private take(): Promise<IteratorResult<Uint8Array>> {
    const chunk = this.chunks.shift();
    if (chunk) return Promise.resolve({ value: chunk, done: false });
    if (this.failure) {
      const error = this.failure;
      this.failure = null;
      return Promise.reject(error);
    }
    if (this.closed) return Promise.resolve({ value: undefined, done: true });
    return new Promise((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }

  /** 닫힌 뒤 대기 중이던 next() 호출들을 정리한다(첫 대기자만 오류를 받는다). */
  private flushWaiters(): void {
    for (const waiter of this.waiters.splice(0)) {
      if (this.failure) {
        const error = this.failure;
        this.failure = null;
        waiter.reject(error);
      } else {
        waiter.resolve({ value: undefined, done: true });
      }
    }
  }
}

// ── LineAssembler ───────────────────────────────────────────────

/**
 * 바이트 조각을 줄로 조립한다. UTF-8은 스트리밍으로 디코딩하므로 조각 경계에 걸친 멀티바이트
 * 문자가 복원된다. 잘못된 바이트는 U+FFFD로 바뀌며 실패하지 않는다. 줄 끝의 "\r"은 지우고
 * 빈 줄은 유지한다.
 */
export class LineAssembler {
  private readonly decoder = new TextDecoder("utf-8", { fatal: false, ignoreBOM: true });
  private pending = "";

  push(chunk: Uint8Array): string[] {
    this.pending += this.decoder.decode(chunk, { stream: true });
    const parts = this.pending.split("\n");
    this.pending = parts.pop() ?? "";
    return parts.map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
  }

  /** 개행으로 끝나지 않은 꼬리가 있으면 partial로 표시해 돌려준다. */
  end(): { text: string; partial: true } | null {
    this.pending += this.decoder.decode();
    const text = this.pending;
    this.pending = "";
    return text.length > 0 ? { text, partial: true } : null;
  }
}

// ── StreamCollector ─────────────────────────────────────────────

export interface CollectorHandlers {
  onStdoutMessage(index: number, message: JsonRpcMessage): void;
  onStdoutFrameError(error: FrameDecodeError): void;
  onStdoutEof(): void;
  onStderrLine(index: number, text: string, partial: boolean): void;
  onStderrEof(): void;
  onStreamError?(stream: "stdout" | "stderr", message: string): void;
}

function describeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// @MX:ANCHOR: [AUTO] 자식 프로세스의 stdout·stderr를 트랜스크립트 사건으로 바꾸는 유일한 경로
// @MX:REASON: 인덱스(= Cursor)는 두 스트림의 도착 순서에 기대지 않는 위치 표지다. 두 루프를
// 직렬화하거나 인덱스 의미를 바꾸면 판정의 구간 나누기가 모두 틀어진다.
export class StreamCollector {
  private readonly maxMessageBytes: number | undefined;
  private attached = false;
  private outCount = 0;
  private errCount = 0;
  private handlerFailure: unknown = null;

  constructor(
    private readonly handlers: CollectorHandlers,
    options: { maxMessageBytes?: number } = {}
  ) {
    this.maxMessageBytes = options.maxMessageBytes;
  }

  get stdoutCount(): number {
    return this.outCount;
  }

  get stderrCount(): number {
    return this.errCount;
  }

  get cursor(): Cursor {
    return { stdout: this.outCount, stderr: this.errCount };
  }

  /**
   * 두 스트림을 서로 기다리지 않는 독립 루프로 소비하고 둘 다 끝나면 이행한다.
   * 두 번째 호출은 동기적으로 던진다. 핸들러가 던져도 소비는 멈추지 않고(자식이 파이프에 막히면
   * 안 된다) 마지막에 첫 오류로 거부한다.
   */
  attach(child: Pick<ChildHandle, "stdout" | "stderr">): Promise<void> {
    if (this.attached) throw new Error("StreamCollector.attach는 한 번만 호출할 수 있다");
    this.attached = true;
    return Promise.all([this.consumeStdout(child.stdout), this.consumeStderr(child.stderr)]).then(
      () => {
        if (this.handlerFailure !== null) throw this.handlerFailure;
      }
    );
  }

  private guard(fn: () => void): void {
    try {
      fn();
    } catch (e) {
      if (this.handlerFailure === null) this.handlerFailure = e;
    }
  }

  private async consumeStdout(stream: AsyncIterable<Uint8Array>): Promise<void> {
    const decoder = new FrameDecoder(
      this.maxMessageBytes === undefined ? {} : { maxMessageBytes: this.maxMessageBytes }
    );
    let reported = false;
    const report = (error: FrameDecodeError): void => {
      if (reported) return;
      reported = true;
      this.guard(() => this.handlers.onStdoutFrameError(error));
    };

    try {
      for await (const chunk of stream) {
        // 실패 뒤에도 끝까지 읽어 비우되(파이프 보호) 바이트는 버린다.
        const result = decoder.push(chunk);
        if (reported) continue;
        for (const message of result.messages) {
          const index = this.outCount++;
          this.guard(() => this.handlers.onStdoutMessage(index, message));
        }
        if (result.error) report(result.error);
      }
    } catch (e) {
      this.guard(() => this.handlers.onStreamError?.("stdout", describeError(e)));
    }

    if (!reported) {
      const tail = decoder.end();
      if (tail.error) report(tail.error);
    }
    this.guard(() => this.handlers.onStdoutEof());
  }

  private async consumeStderr(stream: AsyncIterable<Uint8Array>): Promise<void> {
    const assembler = new LineAssembler();
    const deliver = (text: string, partial: boolean): void => {
      const index = this.errCount++;
      this.guard(() => this.handlers.onStderrLine(index, text, partial));
    };

    try {
      for await (const chunk of stream) {
        for (const line of assembler.push(chunk)) deliver(line, false);
      }
    } catch (e) {
      this.guard(() => this.handlers.onStreamError?.("stderr", describeError(e)));
    }

    const tail = assembler.end();
    if (tail) deliver(tail.text, tail.partial);
    this.guard(() => this.handlers.onStderrEof());
  }
}
