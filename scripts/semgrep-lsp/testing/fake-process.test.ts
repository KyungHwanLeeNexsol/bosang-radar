import { describe, expect, it } from "vitest";
import { encodeFrame } from "../framing";
import type { SpawnSpec } from "../types";
import { FakeChild, FakePort } from "./fake-process";

const dec = new TextDecoder();
const enc = new TextEncoder();

function tick(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

async function drain(stream: AsyncIterable<Uint8Array>): Promise<Uint8Array[]> {
  const out: Uint8Array[] = [];
  for await (const chunk of stream) out.push(chunk);
  return out;
}

function text(chunks: Uint8Array[]): string {
  return chunks.map((c) => dec.decode(c)).join("");
}

describe("FakeChild — 출력", () => {
  it("emitStdout·emitStderr·emitStderrLine·emitStdoutFrame이 각 스트림에 쌓인다", async () => {
    const child = new FakeChild();
    child.emitStdout("raw");
    child.emitStdout(new Uint8Array([0x21]));
    child.emitStdoutFrame({ jsonrpc: "2.0", method: "m" });
    child.emitStderr("no newline");
    child.emitStderrLine("with newline");
    child.closeStdout();
    child.closeStderr();
    const out = text(await drain(child.stdout));
    expect(out.startsWith("raw!")).toBe(true);
    expect(out.endsWith(dec.decode(encodeFrame({ jsonrpc: "2.0", method: "m" })))).toBe(true);
    expect(text(await drain(child.stderr))).toBe("no newlinewith newline\n");
  });

  it("stdout과 stderr는 서로 독립적으로 닫힌다", async () => {
    const child = new FakeChild();
    child.emitStderrLine("a");
    child.closeStderr();
    expect(text(await drain(child.stderr))).toBe("a\n");
    child.emitStdout("still open");
    child.closeStdout();
    expect(text(await drain(child.stdout))).toBe("still open");
  });
});

describe("FakeChild — 종료", () => {
  it("exit는 exited를 이행시키고 두 출력 스트림을 닫는다", async () => {
    const child = new FakeChild();
    child.emitStdout("x");
    child.exit(3, null);
    await expect(child.exited).resolves.toEqual({ code: 3, signal: null });
    expect(text(await drain(child.stdout))).toBe("x");
    expect(await drain(child.stderr)).toEqual([]);
  });

  it("closeStreams: false면 종료 뒤에도 출력 스트림이 열려 있다", async () => {
    const child = new FakeChild();
    child.exit(0, null, { closeStreams: false });
    await child.exited;
    let finished = false;
    const draining = drain(child.stdout).then(() => {
      finished = true;
    });
    await tick();
    expect(finished).toBe(false);
    child.closeStdout();
    await draining;
    expect(finished).toBe(true);
  });

  it("exit는 두 번째부터 무시한다", async () => {
    const child = new FakeChild();
    child.exit(1, null);
    child.exit(2, "SIGTERM");
    await expect(child.exited).resolves.toEqual({ code: 1, signal: null });
  });

  it("기본 pid와 지정한 pid", () => {
    expect(new FakeChild().pid).not.toBeNull();
    expect(new FakeChild({ pid: 77 }).pid).toBe(77);
  });
});

describe("FakeChild — kill 모드", () => {
  it("exit(기본): kill은 비동기로 프로세스를 끝내고 호출을 기록한다", async () => {
    const child = new FakeChild();
    child.kill();
    expect(child.hasExitedNow).toBe(false);
    await expect(child.exited).resolves.toEqual({ code: null, signal: "SIGTERM" });
    expect(child.killCalls).toEqual([undefined]);
  });

  it("exit: SIGKILL이면 신호 이름이 SIGKILL이다", async () => {
    const child = new FakeChild({ onKill: "exit" });
    child.kill("SIGKILL");
    await expect(child.exited).resolves.toEqual({ code: null, signal: "SIGKILL" });
  });

  it("ignore-sigterm: SIGTERM(또는 신호 생략)은 무시하고 SIGKILL만 끝낸다", async () => {
    const child = new FakeChild({ onKill: "ignore-sigterm" });
    child.kill("SIGTERM");
    child.kill();
    await tick();
    expect(child.hasExitedNow).toBe(false);
    child.kill("SIGKILL");
    await expect(child.exited).resolves.toEqual({ code: null, signal: "SIGKILL" });
    expect(child.killCalls).toEqual(["SIGTERM", undefined, "SIGKILL"]);
  });

  it("ignore-all: 어떤 kill에도 끝나지 않는다(행 걸린 프로세스)", async () => {
    const child = new FakeChild({ onKill: "ignore-all" });
    child.kill("SIGTERM");
    child.kill("SIGKILL");
    await tick();
    await tick();
    expect(child.hasExitedNow).toBe(false);
    expect(child.killCalls).toEqual(["SIGTERM", "SIGKILL"]);
  });
});

describe("FakeChild — stdin", () => {
  it("writeStdin은 복사본을 기록하고 핸들러를 부른다", async () => {
    const child = new FakeChild();
    const handled: string[] = [];
    child.onStdinWrite((data) => handled.push(dec.decode(data)));
    const payload = enc.encode("hello");
    await child.writeStdin(payload);
    payload[0] = 0x58;
    expect(child.stdinWrites.map((w) => dec.decode(w))).toEqual(["hello"]);
    expect(handled).toEqual(["hello"]);
  });

  it("endStdin 뒤의 writeStdin은 거부되고 stdinEnded가 참이 된다", async () => {
    const child = new FakeChild();
    expect(child.stdinEnded).toBe(false);
    await child.endStdin();
    expect(child.stdinEnded).toBe(true);
    await expect(child.writeStdin(enc.encode("x"))).rejects.toThrow();
    expect(child.stdinWrites).toEqual([]);
  });

  it("종료 뒤의 writeStdin은 거부된다", async () => {
    const child = new FakeChild();
    child.exit(0);
    await expect(child.writeStdin(enc.encode("x"))).rejects.toThrow();
  });

  it("failNextStdinWrite는 다음 한 번만 거부시킨다", async () => {
    const child = new FakeChild();
    child.failNextStdinWrite(new Error("EPIPE 흉내"));
    await expect(child.writeStdin(enc.encode("a"))).rejects.toThrow("EPIPE 흉내");
    await expect(child.writeStdin(enc.encode("b"))).resolves.toBeUndefined();
    expect(child.stdinWrites.map((w) => dec.decode(w))).toEqual(["b"]);
  });

  it("failNextStdinWrite의 기본 오류도 거부로 나타난다", async () => {
    const child = new FakeChild();
    child.failNextStdinWrite();
    await expect(child.writeStdin(enc.encode("a"))).rejects.toBeInstanceOf(Error);
  });
});

describe("FakeChild — dispose", () => {
  it("dispose는 멱등이며 큐를 닫고 살아 있으면 끝낸다", async () => {
    const child = new FakeChild();
    child.emitStdout("pending");
    expect(child.disposed).toBe(false);
    await child.dispose();
    await child.dispose();
    expect(child.disposed).toBe(true);
    await expect(child.exited).resolves.toEqual({ code: null, signal: "SIGKILL" });
    expect(text(await drain(child.stdout))).toBe("pending");
    expect(await drain(child.stderr)).toEqual([]);
  });

  it("이미 끝난 프로세스에 dispose해도 종료 정보를 덮어쓰지 않는다", async () => {
    const child = new FakeChild();
    child.exit(5);
    await child.dispose();
    await expect(child.exited).resolves.toEqual({ code: 5, signal: null });
  });

  it("dispose 이후의 emit은 던지지 않고 무시된다", async () => {
    const child = new FakeChild();
    await child.dispose();
    expect(() => {
      child.emitStdout("late");
      child.emitStderrLine("late");
    }).not.toThrow();
    expect(await drain(child.stdout)).toEqual([]);
  });
});

describe("FakePort", () => {
  const spec: SpawnSpec = { command: "/fake/semgrep", args: ["lsp"], cwd: "/scan", env: {} };

  it("provenance는 stub이고 spawn은 새 FakeChild를 만들어 기록한다", async () => {
    const port = new FakePort();
    expect(port.provenance).toBe("stub");
    const a = await port.spawn(spec);
    const b = await port.spawn({ ...spec, args: ["other"] });
    expect(a).not.toBe(b);
    expect(port.spawnCalls).toEqual([spec, { ...spec, args: ["other"] }]);
    expect(port.children).toEqual([a, b]);
  });

  it("failSpawnWith는 다음 spawn 한 번만 거부시키지만 호출 기록은 남긴다", async () => {
    const port = new FakePort();
    port.failSpawnWith(new Error("ENOENT"));
    await expect(port.spawn(spec)).rejects.toThrow("ENOENT");
    expect(port.children).toHaveLength(0);
    expect(port.spawnCalls).toHaveLength(1);
    await expect(port.spawn(spec)).resolves.toBeDefined();
    expect(port.children).toHaveLength(1);
  });

  it("childFactory로 FakeChild 옵션을 바꿀 수 있다", async () => {
    const port = new FakePort({
      childFactory: () => new FakeChild({ pid: 9, onKill: "ignore-all" }),
    });
    const child = await port.spawn(spec);
    expect(child.pid).toBe(9);
    child.kill("SIGKILL");
    await tick();
    expect(port.children[0].hasExitedNow).toBe(false);
  });
});
