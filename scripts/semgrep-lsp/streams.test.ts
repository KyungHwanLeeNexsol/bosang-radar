import { describe, expect, it } from "vitest";
import { encodeFrame, type FrameDecodeError } from "./framing";
import { AsyncByteQueue, LineAssembler, StreamCollector, type CollectorHandlers } from "./streams";
import { FakeChild } from "./testing/fake-process";
import type { JsonRpcMessage } from "./types";

const enc = new TextEncoder();

function b(text: string): Uint8Array {
  return enc.encode(text);
}

function tick(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

/** 조건이 참이 될 때까지 이벤트 루프를 돌린다. 실제 시간에 기대지 않고 횟수로 한도를 둔다. */
async function waitFor(condition: () => boolean, maxTurns = 5000): Promise<void> {
  for (let i = 0; i < maxTurns; i++) {
    if (condition()) return;
    await tick();
  }
  throw new Error("waitFor: 조건이 충족되지 않았다");
}

async function collect(queue: AsyncByteQueue): Promise<string[]> {
  const out: string[] = [];
  for await (const chunk of queue) out.push(new TextDecoder().decode(chunk));
  return out;
}

describe("AsyncByteQueue", () => {
  it("반복 시작 전에 push한 조각을 순서대로 내준다", async () => {
    const queue = new AsyncByteQueue();
    queue.push(b("a"));
    queue.push(b("b"));
    queue.push(b("c"));
    queue.end();
    expect(await collect(queue)).toEqual(["a", "b", "c"]);
  });

  it("소비자가 기다리는 중에 push해도 순서대로 전달된다", async () => {
    const queue = new AsyncByteQueue();
    const consumed = collect(queue);
    await tick();
    queue.push(b("1"));
    await tick();
    queue.push(b("2"));
    queue.end();
    expect(await consumed).toEqual(["1", "2"]);
  });

  it("end 뒤에 기다리던 소비자는 done을 받는다", async () => {
    const queue = new AsyncByteQueue();
    const consumed = collect(queue);
    await tick();
    queue.end();
    expect(await consumed).toEqual([]);
  });

  it("end·fail 이후의 push는 무시한다", async () => {
    const queue = new AsyncByteQueue();
    queue.push(b("a"));
    queue.end();
    queue.push(b("late"));
    expect(await collect(queue)).toEqual(["a"]);

    const failed = new AsyncByteQueue();
    failed.fail(new Error("x"));
    failed.push(b("late"));
    const seen: string[] = [];
    await expect(
      (async () => {
        for await (const chunk of failed) seen.push(new TextDecoder().decode(chunk));
      })()
    ).rejects.toThrow("x");
    expect(seen).toEqual([]);
  });

  it("fail은 쌓인 조각을 모두 내준 뒤에 반복자가 던지게 한다", async () => {
    const queue = new AsyncByteQueue();
    queue.push(b("a"));
    queue.push(b("b"));
    queue.fail(new Error("스트림 오류"));
    const seen: string[] = [];
    await expect(
      (async () => {
        for await (const chunk of queue) seen.push(new TextDecoder().decode(chunk));
      })()
    ).rejects.toThrow("스트림 오류");
    expect(seen).toEqual(["a", "b"]);
  });

  it("기다리던 소비자도 fail을 받는다", async () => {
    const queue = new AsyncByteQueue();
    const consumed = collect(queue);
    await tick();
    queue.fail(new Error("중간 실패"));
    await expect(consumed).rejects.toThrow("중간 실패");
  });

  it("오류는 한 번만 던지고 이후에는 끝난 것으로 본다", async () => {
    const queue = new AsyncByteQueue();
    queue.fail(new Error("한 번"));
    await expect(collect(queue)).rejects.toThrow("한 번");
    expect(await collect(queue)).toEqual([]);
  });

  it("소비자가 break로 떠나도 던지지 않는다", async () => {
    const queue = new AsyncByteQueue();
    queue.push(b("a"));
    queue.push(b("b"));
    for await (const chunk of queue) {
      expect(new TextDecoder().decode(chunk)).toBe("a");
      break;
    }
  });
});

describe("LineAssembler", () => {
  it("LF와 CRLF로 줄을 나누고 줄 끝의 CR을 지운다", () => {
    const assembler = new LineAssembler();
    expect(assembler.push(b("one\ntwo\r\nthree\n"))).toEqual(["one", "two", "three"]);
    expect(assembler.end()).toBeNull();
  });

  it("빈 줄을 유지한다", () => {
    const assembler = new LineAssembler();
    expect(assembler.push(b("a\n\n\r\nb\n"))).toEqual(["a", "", "", "b"]);
  });

  it("조각 경계에 걸친 줄을 이어 붙인다", () => {
    const assembler = new LineAssembler();
    expect(assembler.push(b("ab"))).toEqual([]);
    expect(assembler.push(b("cd\nef"))).toEqual(["abcd"]);
    expect(assembler.push(b("gh\n"))).toEqual(["efgh"]);
  });

  it("CR과 LF가 서로 다른 조각에 있어도 한 번만 끝난다", () => {
    const assembler = new LineAssembler();
    expect(assembler.push(b("line\r"))).toEqual([]);
    expect(assembler.push(b("\nnext\n"))).toEqual(["line", "next"]);
  });

  it("개행으로 끝나지 않은 꼬리는 end()가 partial로 돌려준다", () => {
    const assembler = new LineAssembler();
    expect(assembler.push(b("done\ntail"))).toEqual(["done"]);
    expect(assembler.end()).toEqual({ text: "tail", partial: true });
    expect(assembler.end()).toBeNull();
  });

  it("조각 경계에 걸친 멀티바이트 문자를 복원한다", () => {
    const bytes = b("가나다 😀\n");
    for (let cut = 1; cut < bytes.byteLength; cut++) {
      const assembler = new LineAssembler();
      const lines = [...assembler.push(bytes.slice(0, cut)), ...assembler.push(bytes.slice(cut))];
      expect(lines, `cut=${cut}`).toEqual(["가나다 😀"]);
    }
  });

  it("한 바이트씩 넣어도 같은 결과다", () => {
    const assembler = new LineAssembler();
    const lines: string[] = [];
    for (const byte of b("한글\nabc\n")) lines.push(...assembler.push(new Uint8Array([byte])));
    expect(lines).toEqual(["한글", "abc"]);
  });

  it("잘못된 UTF-8 바이트는 U+FFFD로 바뀌고 실패하지 않는다", () => {
    const assembler = new LineAssembler();
    expect(assembler.push(new Uint8Array([0x61, 0xff, 0x62, 0x0a]))).toEqual(["a�b"]);
  });

  it("끝에서 잘린 멀티바이트 문자는 end()에서 U+FFFD로 나온다", () => {
    const assembler = new LineAssembler();
    assembler.push(b("가").slice(0, 2));
    expect(assembler.end()).toEqual({ text: "�", partial: true });
  });
});

interface Recorder {
  handlers: CollectorHandlers;
  messages: { index: number; message: JsonRpcMessage }[];
  frameErrors: FrameDecodeError[];
  lines: { index: number; text: string; partial: boolean }[];
  streamErrors: { stream: string; message: string }[];
  events: string[];
}

function recorder(): Recorder {
  const r: Recorder = {
    messages: [],
    frameErrors: [],
    lines: [],
    streamErrors: [],
    events: [],
    handlers: {
      onStdoutMessage: (index, message) => {
        r.messages.push({ index, message });
        r.events.push(`out#${index}`);
      },
      onStdoutFrameError: (error) => {
        r.frameErrors.push(error);
        r.events.push(`frame-error:${error.kind}`);
      },
      onStdoutEof: () => {
        r.events.push("out-eof");
      },
      onStderrLine: (index, text, partial) => {
        r.lines.push({ index, text, partial });
        r.events.push(`err#${index}`);
      },
      onStderrEof: () => {
        r.events.push("err-eof");
      },
      onStreamError: (stream, message) => {
        r.streamErrors.push({ stream, message });
      },
    },
  };
  return r;
}

const msg = (id: number): JsonRpcMessage => ({ jsonrpc: "2.0", id, result: id });

describe("StreamCollector", () => {
  it("stdout·stderr 인덱스는 스트림별 0부터이며 서로 독립이다", async () => {
    const r = recorder();
    const collector = new StreamCollector(r.handlers);
    const out = new AsyncByteQueue();
    const err = new AsyncByteQueue();
    const done = collector.attach({ stdout: out, stderr: err });

    out.push(encodeFrame(msg(1)));
    err.push(b("a\nb\n"));
    out.push(encodeFrame(msg(2)));
    err.push(b("c\n"));
    out.end();
    err.end();
    await done;

    expect(r.messages.map((m) => m.index)).toEqual([0, 1]);
    expect(r.lines.map((l) => l.index)).toEqual([0, 1, 2]);
    expect(collector.stdoutCount).toBe(2);
    expect(collector.stderrCount).toBe(3);
    expect(collector.cursor).toEqual({ stdout: 2, stderr: 3 });
  });

  it("stdout이 먼저 오든 stderr가 먼저 오든 각 스트림의 내용과 인덱스는 같다", async () => {
    async function run(order: "stdout-first" | "stderr-first") {
      const r = recorder();
      const collector = new StreamCollector(r.handlers);
      const out = new AsyncByteQueue();
      const err = new AsyncByteQueue();
      const done = collector.attach({ stdout: out, stderr: err });
      const sendOut = () => out.push(encodeFrame(msg(7)));
      const sendErr = () => err.push(b("line\n"));
      if (order === "stdout-first") {
        sendOut();
        await tick();
        sendErr();
      } else {
        sendErr();
        await tick();
        sendOut();
      }
      out.end();
      err.end();
      await done;
      return { messages: r.messages, lines: r.lines };
    }
    expect(await run("stdout-first")).toEqual(await run("stderr-first"));
  });

  it("부분 줄은 EOF에서 partial로 전달되고 인덱스를 소비한다", async () => {
    const r = recorder();
    const collector = new StreamCollector(r.handlers);
    const out = new AsyncByteQueue();
    const err = new AsyncByteQueue();
    const done = collector.attach({ stdout: out, stderr: err });
    err.push(b("full\npart"));
    out.end();
    err.end();
    await done;
    expect(r.lines).toEqual([
      { index: 0, text: "full", partial: false },
      { index: 1, text: "part", partial: true },
    ]);
    expect(r.events.filter((e) => e.endsWith("eof"))).toHaveLength(2);
  });

  it("stderr가 대량으로 쏟아지는 동안 stdout이 멈춰 있어도 이후 stdout 메시지를 받는다", async () => {
    const r = recorder();
    const collector = new StreamCollector(r.handlers);
    const child = new FakeChild();
    const done = collector.attach(child);

    // 약 2MB: 100바이트 줄 × 20,000개를 20조각으로 나눠 보낸다. stdout은 그동안 조용하다.
    const line = `${"x".repeat(99)}\n`;
    const perChunk = 1000;
    const chunks = 20;
    for (let i = 0; i < chunks; i++) child.emitStderr(line.repeat(perChunk));
    await waitFor(() => collector.stderrCount === perChunk * chunks);
    expect(collector.stdoutCount).toBe(0);

    child.emitStdoutFrame(msg(1));
    await waitFor(() => collector.stdoutCount === 1);
    child.emitStdoutFrame(msg(2));
    await waitFor(() => collector.stdoutCount === 2);

    child.exit(0);
    await done;
    expect(collector.stderrCount).toBe(perChunk * chunks);
    expect(r.messages.map((m) => m.index)).toEqual([0, 1]);
  });

  it("프레임 오류는 한 번만 보고하고 이후 메시지는 전달하지 않지만 끝까지 비운다", async () => {
    const r = recorder();
    const collector = new StreamCollector(r.handlers);
    const out = new AsyncByteQueue();
    const err = new AsyncByteQueue();
    const done = collector.attach({ stdout: out, stderr: err });

    out.push(encodeFrame(msg(1)));
    out.push(b("garbage\r\n\r\n"));
    out.push(encodeFrame(msg(2)));
    out.push(b("more bytes"));
    err.push(b("still reading\n"));
    await waitFor(() => collector.stderrCount === 1 && r.frameErrors.length === 1);

    // 실패 뒤에도 소비자가 큐를 계속 비우므로 늦게 온 조각도 큐에 쌓이지 않는다.
    out.push(encodeFrame(msg(3)));
    out.end();
    err.end();
    await done;

    expect(r.messages).toHaveLength(1);
    expect(r.frameErrors).toHaveLength(1);
    expect(r.frameErrors[0].kind).toBe("MALFORMED");
    expect(r.events.filter((e) => e === "out-eof")).toHaveLength(1);
    expect(r.events.indexOf("out-eof")).toBeGreaterThan(r.events.indexOf("frame-error:MALFORMED"));
    expect(collector.stdoutCount).toBe(1);
  });

  it("같은 청크에서 오류 앞의 메시지는 오류보다 먼저 전달된다", async () => {
    const r = recorder();
    const collector = new StreamCollector(r.handlers);
    const out = new AsyncByteQueue();
    const err = new AsyncByteQueue();
    const done = collector.attach({ stdout: out, stderr: err });
    const chunk = new Uint8Array([...encodeFrame(msg(1)), ...b("garbage\r\n\r\n")]);
    out.push(chunk);
    out.end();
    err.end();
    await done;
    expect(r.events.filter((e) => !e.endsWith("eof"))).toEqual(["out#0", "frame-error:MALFORMED"]);
  });

  it("프레임 도중 EOF면 TRUNCATED를 한 번 보고한다", async () => {
    const r = recorder();
    const collector = new StreamCollector(r.handlers);
    const out = new AsyncByteQueue();
    const err = new AsyncByteQueue();
    const done = collector.attach({ stdout: out, stderr: err });
    const frame = encodeFrame(msg(1));
    out.push(frame.slice(0, frame.byteLength - 2));
    out.end();
    err.end();
    await done;
    expect(r.frameErrors).toHaveLength(1);
    expect(r.frameErrors[0].kind).toBe("TRUNCATED");
    expect(r.messages).toHaveLength(0);
  });

  it("이미 MALFORMED를 보고했으면 EOF에서 TRUNCATED를 또 보고하지 않는다", async () => {
    const r = recorder();
    const collector = new StreamCollector(r.handlers);
    const out = new AsyncByteQueue();
    const err = new AsyncByteQueue();
    const done = collector.attach({ stdout: out, stderr: err });
    out.push(b("garbage\r\n\r\n"));
    out.end();
    err.end();
    await done;
    expect(r.frameErrors.map((e) => e.kind)).toEqual(["MALFORMED"]);
  });

  it("maxMessageBytes 옵션을 디코더에 전달한다", async () => {
    const r = recorder();
    const collector = new StreamCollector(r.handlers, { maxMessageBytes: 5 });
    const out = new AsyncByteQueue();
    const err = new AsyncByteQueue();
    const done = collector.attach({ stdout: out, stderr: err });
    out.push(encodeFrame(msg(1)));
    out.end();
    err.end();
    await done;
    expect(r.frameErrors).toHaveLength(1);
    expect(r.messages).toHaveLength(0);
  });

  it("스트림 반복자가 던지면 onStreamError를 부르고 EOF로 처리한다", async () => {
    const r = recorder();
    const collector = new StreamCollector(r.handlers);
    const out = new AsyncByteQueue();
    const err = new AsyncByteQueue();
    const done = collector.attach({ stdout: out, stderr: err });
    out.push(encodeFrame(msg(1)));
    out.fail(new Error("stdout 파이프 끊김"));
    err.push(b("a\n"));
    err.fail(new Error("stderr 파이프 끊김"));
    await done;

    expect(r.streamErrors).toEqual([
      { stream: "stdout", message: "stdout 파이프 끊김" },
      { stream: "stderr", message: "stderr 파이프 끊김" },
    ]);
    expect(r.messages).toHaveLength(1);
    expect(r.lines).toHaveLength(1);
    expect(r.events).toContain("out-eof");
    expect(r.events).toContain("err-eof");
  });

  it("onStreamError가 없어도 반복자 오류로 죽지 않는다", async () => {
    const r = recorder();
    const handlers: CollectorHandlers = { ...r.handlers };
    delete handlers.onStreamError;
    const collector = new StreamCollector(handlers);
    const out = new AsyncByteQueue();
    const err = new AsyncByteQueue();
    const done = collector.attach({ stdout: out, stderr: err });
    out.fail(new Error("x"));
    err.end();
    await expect(done).resolves.toBeUndefined();
  });

  it("스트림이 오류로 끝나기 전에 프레임이 잘려 있으면 TRUNCATED도 보고한다", async () => {
    const r = recorder();
    const collector = new StreamCollector(r.handlers);
    const out = new AsyncByteQueue();
    const err = new AsyncByteQueue();
    const done = collector.attach({ stdout: out, stderr: err });
    out.push(b("Content-Length: 40\r\n\r\n{"));
    out.fail(new Error("끊김"));
    err.end();
    await done;
    expect(r.streamErrors).toHaveLength(1);
    expect(r.frameErrors.map((e) => e.kind)).toEqual(["TRUNCATED"]);
  });

  it("attach를 두 번 부르면 던진다", async () => {
    const collector = new StreamCollector(recorder().handlers);
    const out = new AsyncByteQueue();
    const err = new AsyncByteQueue();
    const done = collector.attach({ stdout: out, stderr: err });
    expect(() => collector.attach({ stdout: out, stderr: err })).toThrow();
    out.end();
    err.end();
    await done;
    expect(() => collector.attach({ stdout: out, stderr: err })).toThrow();
  });

  it("핸들러가 던져도 스트림을 끝까지 비우고 마지막에 그 오류로 거부된다", async () => {
    const r = recorder();
    const collector = new StreamCollector({
      ...r.handlers,
      onStdoutMessage: () => {
        throw new Error("핸들러 실패");
      },
    });
    const out = new AsyncByteQueue();
    const err = new AsyncByteQueue();
    const done = collector.attach({ stdout: out, stderr: err });
    out.push(encodeFrame(msg(1)));
    out.push(encodeFrame(msg(2)));
    err.push(b("a\n"));
    out.end();
    err.end();
    await expect(done).rejects.toThrow("핸들러 실패");
    expect(collector.stdoutCount).toBe(2);
    expect(r.events).toContain("out-eof");
    expect(r.events).toContain("err-eof");
  });
});
