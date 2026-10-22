import { describe, expect, it } from "vitest";
import { VirtualClock } from "../clock";
import { encodeFrame } from "../framing";
import { makeNotification, makeRequest } from "../jsonrpc";
import { StreamCollector } from "../streams";
import { expectedUri } from "../uri";
import type { JsonRpcMessage } from "../types";
import { IDS, happyTranscript, notification, type HappySpec } from "./transcript-builder";
import { TARGET_PATHS, TARGET_SCAN_ROOT, targetSpec, happyTarget } from "./evaluate-fixtures";
import { FakeChild } from "./fake-process";
import {
  StubLsp,
  drive,
  happyScript,
  mergeScript,
  settle,
  stubPort,
  type StubScript,
} from "./stub-lsp";

// 시험용 스텁 자체의 시험. 여기서 얻는 어떤 결과도 실제 Semgrep의 동작을 증명하지 않는다.

interface Seen {
  stdout: { t: number; message: JsonRpcMessage }[];
  stderr: { t: number; text: string }[];
  frameErrors: string[];
  stdoutEof: boolean;
  stderrEof: boolean;
  done: Promise<void>;
}

function watch(child: FakeChild, clock: VirtualClock): Seen {
  const seen: Seen = {
    stdout: [],
    stderr: [],
    frameErrors: [],
    stdoutEof: false,
    stderrEof: false,
    done: Promise.resolve(),
  };
  const collector = new StreamCollector({
    onStdoutMessage: (_i, message) => seen.stdout.push({ t: clock.now(), message }),
    onStdoutFrameError: (e) => seen.frameErrors.push(e.kind),
    onStdoutEof: () => {
      seen.stdoutEof = true;
    },
    onStderrLine: (_i, text) => seen.stderr.push({ t: clock.now(), text }),
    onStderrEof: () => {
      seen.stderrEof = true;
    },
  });
  seen.done = collector.attach(child);
  return seen;
}

function setup(script: StubScript) {
  const clock = new VirtualClock();
  const child = new FakeChild();
  const stub = new StubLsp(child, clock, script);
  const seen = watch(child, clock);
  const write = (message: JsonRpcMessage) => child.writeStdin(encodeFrame(message));
  return { clock, child, stub, seen, write };
}

const SPEC: HappySpec = targetSpec();

/** 세션이 보내는 순서 그대로의 대화를 손으로 재현한다. */
async function converse(
  env: ReturnType<typeof setup>,
  options: { exit?: boolean } = {}
): Promise<void> {
  const { write, clock } = env;
  await write(
    makeRequest(IDS.initialize, "initialize", { processId: null, rootUri: null, capabilities: {} })
  );
  await write(makeNotification("initialized", {}));
  await settle(clock);
  await write(makeRequest(IDS.echoPre, "debug/echo", { phase: "pre-scan" }));
  await write(makeNotification("semgrep/scanWorkspace", { full: true }));
  await settle(clock);
  await write(makeRequest(IDS.echoPost, "debug/echo", { phase: "post-barrier" }));
  await write(makeRequest(IDS.shutdown, "shutdown"));
  if (options.exit !== false) await write(makeNotification("exit"));
  await settle(clock);
}

describe("happyScript — 기준 대화", () => {
  it("스텁의 stderr 줄과 stdout 메시지가 happyTranscript와 정확히 같다(스텁과 평가기가 같은 재료를 본다)", async () => {
    const env = setup(happyScript(SPEC));
    await converse(env);
    await env.seen.done;

    const reference = happyTarget();
    const refStderr = reference.events.flatMap((e) => (e.kind === "stderr-line" ? [e.text] : []));
    const refStdout = reference.events.flatMap((e) =>
      e.kind === "stdout-message" ? [e.message] : []
    );
    expect(env.seen.stderr.map((l) => l.text)).toEqual(refStderr);
    expect(env.seen.stdout.map((m) => m.message)).toEqual(refStdout);
    expect(env.seen.stdoutEof && env.seen.stderrEof).toBe(true);
    await expect(env.child.exited).resolves.toEqual({ code: 0, signal: null });
  });

  it("받은 메시지를 순서대로 기록하고 method별 개수를 센다", async () => {
    const env = setup(happyScript(SPEC));
    await converse(env);
    expect(env.stub.received.map((m) => m.method)).toEqual([
      "initialize",
      "initialized",
      "debug/echo",
      "semgrep/scanWorkspace",
      "debug/echo",
      "shutdown",
      "exit",
    ]);
    expect(env.stub.count("debug/echo")).toBe(2);
    expect(env.stub.count("semgrep/scanWorkspace")).toBe(1);
    expect(env.stub.frameProblem).toBeNull();
  });

  it("지연이 0이면 시계 없이 같은 호출 안에서 곧바로 내보낸다(타이머를 만들지 않는다)", async () => {
    const env = setup(happyScript(SPEC));
    await env.write(makeRequest(IDS.initialize, "initialize", {}));
    expect(env.clock.pendingTimers).toBe(0);
    await settle(env.clock);
    expect(env.seen.stdout).toHaveLength(1);
    expect(env.seen.stdout[0].message.id).toBe(IDS.initialize);
  });

  it("shutdown에는 응답하지 않는다", async () => {
    const env = setup(happyScript(SPEC));
    await env.write(makeRequest("shutdown-9", "shutdown"));
    await settle(env.clock);
    expect(env.seen.stdout).toEqual([]);
    expect(env.child.hasExitedNow).toBe(false);
  });

  it("engineErrorsText가 비어 있으면 `Semgrep errors:` 줄(공백 없음)을 낸다", async () => {
    const env = setup(happyScript(SPEC));
    await converse(env);
    expect(env.seen.stderr.map((l) => l.text)).toContain("Semgrep errors:");
    const filled = setup(happyScript(SPEC, { scan: { engineErrorsText: "timeout" } }));
    await converse(filled);
    expect(filled.seen.stderr.map((l) => l.text)).toContain("Semgrep errors: timeout");
  });

  it("게시 URI는 scanRoot와 상대 경로로 만든다", async () => {
    const env = setup(happyScript(SPEC));
    await converse(env);
    const uris = env.seen.stdout
      .map((m) => m.message)
      .filter((m) => m.method === "textDocument/publishDiagnostics")
      .map((m) => (m.params as { uri: string }).uri);
    expect(uris).toEqual(TARGET_PATHS.map((p) => expectedUri(TARGET_SCAN_ROOT, p)));
  });
});

describe("StubScript 조절 장치", () => {
  it("init: serverVersion null이면 serverInfo가 없고, error는 오류 응답, none은 응답 없음", async () => {
    const noInfo = setup(happyScript(SPEC, { serverVersion: null }));
    await noInfo.write(makeRequest("i-1", "initialize", {}));
    await settle(noInfo.clock);
    expect(
      (noInfo.seen.stdout[0].message.result as Record<string, unknown>).serverInfo
    ).toBeUndefined();

    const err = setup(happyScript(SPEC, { init: { reply: "error" } }));
    await err.write(makeRequest("i-1", "initialize", {}));
    await settle(err.clock);
    expect(err.seen.stdout[0].message.error?.code).toBe(-32603);

    const none = setup(happyScript(SPEC, { init: { reply: "none" } }));
    await none.write(makeRequest("i-1", "initialize", {}));
    await settle(none.clock);
    expect(none.seen.stdout).toEqual([]);
  });

  it("지연은 시계를 보내야 나온다: 응답이 delayMs 뒤에 도착한다", async () => {
    const env = setup(happyScript(SPEC, { init: { delayMs: 30 } }));
    await env.write(makeRequest("i-1", "initialize", {}));
    await settle(env.clock);
    expect(env.seen.stdout).toEqual([]);
    expect(env.clock.pendingTimers).toBe(1);
    await env.clock.advance(29);
    await settle(env.clock);
    expect(env.seen.stdout).toEqual([]);
    await env.clock.advance(1);
    await settle(env.clock);
    expect(env.seen.stdout).toHaveLength(1);
    expect(env.seen.stdout[0].t).toBe(30);
    expect(env.clock.pendingTimers).toBe(0);
  });

  it("rules: 로그 줄과 stdout 알림의 시각을 따로 정하고, 각각 생략할 수 있다", async () => {
    const env = setup(
      happyScript(SPEC, { rules: { logAtMs: 5, notifyAtMs: 9, omitScannedOpen: true } })
    );
    await env.write(makeNotification("initialized", {}));
    await env.clock.advance(20);
    await settle(env.clock);
    expect(env.seen.stderr.every((l) => l.t === 5)).toBe(true);
    expect(env.seen.stderr.map((l) => l.text)).not.toContain("Scanned open documents");
    expect(env.seen.stderr.map((l) => l.text)).toContain("Rules refreshed");
    expect(env.seen.stdout.map((m) => [m.t, m.message.method])).toEqual([
      [9, "semgrep/rulesRefreshed"],
    ]);

    const omit = setup(happyScript(SPEC, { rules: { omitRulesRefreshed: true } }));
    await omit.write(makeNotification("initialized", {}));
    await settle(omit.clock);
    expect(omit.seen.stdout).toEqual([]);
    expect(omit.seen.stderr.map((l) => l.text)).toContain("Scanned open documents");
  });

  it("echo: 첫 요청은 pre, 그 뒤는 post로 센다 — 응답은 요청 params를 되돌려 준다", async () => {
    const env = setup(
      happyScript(SPEC, { echoPre: { reply: "none" }, echoPost: { reply: "error" } })
    );
    await env.write(makeRequest("e-1", "debug/echo", { n: 1 }));
    await env.write(makeRequest("e-2", "debug/echo", { n: 2 }));
    await settle(env.clock);
    expect(env.seen.stdout).toHaveLength(1);
    expect(env.seen.stdout[0].message.id).toBe("e-2");
    expect(env.seen.stdout[0].message.error?.message).toBe("echo failed");

    const ok = setup(happyScript(SPEC));
    await ok.write(makeRequest("e-1", "debug/echo", { n: 1 }));
    await settle(ok.clock);
    expect(ok.seen.stdout[0].message.result).toEqual({ n: 1 });
  });

  it("scan: 장벽을 null로 두면 영원히 보내지 않고, 시각을 주면 그때 낸다", async () => {
    const never = setup(happyScript(SPEC, { scan: { barrierAtMs: null } }));
    await never.write(makeNotification("semgrep/scanWorkspace", { full: true }));
    await never.clock.advance(1_000_000);
    await settle(never.clock);
    expect(never.seen.stderr.map((l) => l.text)).not.toContain("Scanning workspace complete");
    expect(never.seen.stderr.map((l) => l.text)).toContain("Scanned workspace");

    const at = setup(happyScript(SPEC, { scan: { barrierAtMs: 40 } }));
    await at.write(makeNotification("semgrep/scanWorkspace", { full: true }));
    await at.clock.advance(39);
    await settle(at.clock);
    expect(at.seen.stderr.map((l) => l.text)).not.toContain("Scanning workspace complete");
    await at.clock.advance(1);
    await settle(at.clock);
    const barrier = at.seen.stderr.find((l) => l.text === "Scanning workspace complete");
    expect(barrier?.t).toBe(40);
  });

  it("scan 로그 줄은 README 표의 본문 그대로이고 장벽이 마지막이다", async () => {
    const env = setup(happyScript(SPEC));
    await env.write(makeNotification("semgrep/scanWorkspace", { full: true }));
    await settle(env.clock);
    expect(env.seen.stderr.map((l) => l.text)).toEqual([
      "Scanning workspace, full: true",
      "Scanning workspace",
      `Running Semgrep with ${SPEC.n} rules`,
      "Semgrep errors:",
      `Semgrep skipped ${SPEC.s} rules`,
      `Scanned ${SPEC.k} files`,
      `Found ${SPEC.m} matches`,
      "Scanned workspace",
      "Scanning workspace complete",
    ]);
  });

  it("늦은 진단은 echo-post 응답 뒤에 오고, 자식이 먼저 끝나면 나오지 않는다", async () => {
    const late = [{ path: TARGET_PATHS[0] }];
    const env = setup(
      happyScript(SPEC, {
        scan: { latePublishes: late, lateAfterEchoMs: 4 },
        exit: { afterMs: 50 },
      })
    );
    await converse(env, { exit: false });
    await env.clock.advance(10);
    await settle(env.clock);
    const methods = env.seen.stdout.map((m) => m.message.method ?? "response");
    expect(methods[methods.length - 1]).toBe("textDocument/publishDiagnostics");
    const echoIndex = env.seen.stdout.findIndex((m) => m.message.id === IDS.echoPost);
    expect(echoIndex).toBeGreaterThan(-1);
    expect(echoIndex).toBeLessThan(env.seen.stdout.length - 1);

    // 자식이 끝난 뒤로 미뤄진 늦은 진단은 취소된다.
    const dead = setup(
      happyScript(SPEC, {
        scan: { latePublishes: late, lateAfterEchoMs: 100 },
        exit: { afterMs: 1 },
      })
    );
    await converse(dead);
    await dead.clock.advance(1000);
    await settle(dead.clock);
    const lateSeen = dead.seen.stdout.filter(
      (m) => m.message.method === "textDocument/publishDiagnostics"
    );
    expect(lateSeen).toHaveLength(SPEC.expectedPaths.length);
    expect(dead.clock.pendingTimers).toBe(0);
  });

  it("exit: 알림을 받고 afterMs 뒤에 지정한 코드로 끝난다. never면 끝나지 않는다", async () => {
    const env = setup(happyScript(SPEC, { exit: { code: 9, afterMs: 12 } }));
    await env.write(makeNotification("exit"));
    await env.clock.advance(11);
    await settle(env.clock);
    expect(env.child.hasExitedNow).toBe(false);
    await env.clock.advance(1);
    await settle(env.clock);
    await expect(env.child.exited).resolves.toEqual({ code: 9, signal: null });

    const stay = setup(happyScript(SPEC, { exit: { never: true } }));
    await stay.write(makeNotification("exit"));
    await stay.clock.advance(1_000_000);
    await settle(stay.clock);
    expect(stay.child.hasExitedNow).toBe(false);
  });

  it("crash: 트리거 뒤 afterMs에 EOF로 끝나고, 그 뒤로 예정된 출력·타이머는 모두 취소된다", async () => {
    const env = setup(
      happyScript(SPEC, {
        scan: { barrierAtMs: 100 },
        crash: { on: "scan", afterMs: 3, code: 1, signal: null },
      })
    );
    await env.write(makeNotification("semgrep/scanWorkspace", { full: true }));
    await env.clock.advance(500);
    await settle(env.clock);
    await expect(env.child.exited).resolves.toEqual({ code: 1, signal: null });
    expect(env.seen.stderr.map((l) => l.text)).not.toContain("Scanning workspace complete");
    expect(env.seen.stdoutEof && env.seen.stderrEof).toBe(true);
    expect(env.clock.pendingTimers).toBe(0);
  });

  it("crash가 afterMs 0이면 정상 반응보다 먼저 끝나 응답이 나가지 않는다", async () => {
    const env = setup(
      happyScript(SPEC, { crash: { on: "initialize", afterMs: 0, code: 2, signal: null } })
    );
    await env.write(makeRequest("i-1", "initialize", {}));
    await settle(env.clock);
    expect(env.seen.stdout).toEqual([]);
    await expect(env.child.exited).resolves.toEqual({ code: 2, signal: null });
  });

  it("fault: MALFORMED는 프레임 오류를, TRUNCATED는 프레임 오류와 EOF를 낸다(프로세스는 살아 있다)", async () => {
    const bad = setup(
      happyScript(SPEC, { fault: { on: "initialize", kind: "MALFORMED", atMs: 0 } })
    );
    await bad.write(makeRequest("i-1", "initialize", {}));
    await settle(bad.clock);
    expect(bad.seen.frameErrors).toEqual(["MALFORMED"]);
    expect(bad.child.hasExitedNow).toBe(false);

    const cut = setup(happyScript(SPEC, { fault: { on: "scan", kind: "TRUNCATED", atMs: 2 } }));
    await cut.write(makeNotification("semgrep/scanWorkspace", { full: true }));
    await cut.clock.advance(5);
    await settle(cut.clock);
    expect(cut.seen.frameErrors).toEqual(["TRUNCATED"]);
    expect(cut.seen.stdoutEof).toBe(true);
    expect(cut.child.hasExitedNow).toBe(false);
  });

  it("fault는 정상 처리 뒤에 주입된다: 그 앞의 완성된 메시지는 읽힌다", async () => {
    const env = setup(happyScript(SPEC, { fault: { on: "scan", kind: "MALFORMED", atMs: 0 } }));
    await env.write(makeNotification("semgrep/scanWorkspace", { full: true }));
    await settle(env.clock);
    expect(
      env.seen.stdout.filter((m) => m.message.method === "textDocument/publishDiagnostics")
    ).toHaveLength(SPEC.expectedPaths.length);
    expect(env.seen.frameErrors).toEqual(["MALFORMED"]);
  });

  it("stdinFault: 트리거를 받은 뒤 다음 쓰기 한 번만 거부된다", async () => {
    const env = setup(happyScript(SPEC, { stdinFault: { after: "initialize" } }));
    await env.write(makeRequest("i-1", "initialize", {}));
    await expect(env.write(makeNotification("initialized", {}))).rejects.toThrow("EPIPE");
    await expect(env.write(makeNotification("initialized", {}))).resolves.toBeUndefined();
  });

  it("lag: 한 스트림의 모든 출력을 늦추되 스트림 안의 순서는 보존한다(echo 응답은 앞선 진단 뒤)", async () => {
    const env = setup(happyScript(SPEC, { lag: { stdoutMs: 8 } }));
    await env.write(makeNotification("semgrep/scanWorkspace", { full: true }));
    await env.write(makeRequest(IDS.echoPost, "debug/echo", {}));
    await settle(env.clock);
    // stderr(장벽 포함)는 이미 도착했고 stdout은 아직이다 — 읽는 순서가 뒤집힌 상태.
    expect(env.seen.stderr.map((l) => l.text)).toContain("Scanning workspace complete");
    expect(env.seen.stdout).toEqual([]);
    await env.clock.advance(8);
    await settle(env.clock);
    const methods = env.seen.stdout.map((m) => m.message.method ?? "response");
    expect(methods).toEqual([
      ...SPEC.expectedPaths.map(() => "textDocument/publishDiagnostics"),
      "response",
    ]);
    expect(env.seen.stdout.every((m) => m.t === 8)).toBe(true);
  });

  it("지연이 다른 두 출력도 서로를 앞지르지 못한다(같은 스트림 안)", async () => {
    // 첫 응답이 20ms 뒤, 둘째 요청 응답이 0ms 뒤여도 둘째는 첫째 뒤에 나간다.
    const env = setup(happyScript(SPEC, { echoPre: { delayMs: 20 }, echoPost: { delayMs: 0 } }));
    await env.write(makeRequest("e-1", "debug/echo", {}));
    await env.write(makeRequest("e-2", "debug/echo", {}));
    await settle(env.clock);
    expect(env.seen.stdout).toEqual([]);
    await env.clock.advance(20);
    await settle(env.clock);
    expect(env.seen.stdout.map((m) => m.message.id)).toEqual(["e-1", "e-2"]);
  });
});

describe("StubLsp — 입력 해석과 정리", () => {
  it("깨진 바이트를 받으면 frameProblem을 남긴다", async () => {
    const env = setup(happyScript(SPEC));
    await env.child.writeStdin(new TextEncoder().encode("not a header at all"));
    expect(env.stub.frameProblem).toBe("MALFORMED");
    expect(env.stub.received).toEqual([]);
  });

  it("한 번의 쓰기에 여러 프레임이 와도 나눠 해석한다", async () => {
    const env = setup(happyScript(SPEC));
    const a = encodeFrame(makeRequest("i-1", "initialize", {}));
    const b = encodeFrame(makeNotification("initialized", {}));
    const joined = new Uint8Array(a.length + b.length);
    joined.set(a, 0);
    joined.set(b, a.length);
    await env.child.writeStdin(joined);
    expect(env.stub.received.map((m) => m.method)).toEqual(["initialize", "initialized"]);
  });

  it("자식이 끝나면 대기 중인 모든 타이머를 거둔다", async () => {
    const env = setup(happyScript(SPEC, { init: { delayMs: 500 }, scan: { barrierAtMs: 900 } }));
    await env.write(makeRequest("i-1", "initialize", {}));
    await env.write(makeNotification("semgrep/scanWorkspace", { full: true }));
    expect(env.clock.pendingTimers).toBeGreaterThan(0);
    env.child.exit(0);
    await settle(env.clock);
    expect(env.clock.pendingTimers).toBe(0);
  });

  it("같은 스캔 요청을 두 번 받으면 두 번 반응한다(스텁은 중복을 감추지 않는다 — 세션이 한 번만 보내야 한다)", async () => {
    const env = setup(happyScript(SPEC));
    await env.write(makeNotification("semgrep/scanWorkspace", { full: true }));
    await env.write(makeNotification("semgrep/scanWorkspace", { full: true }));
    await settle(env.clock);
    expect(env.stub.count("semgrep/scanWorkspace")).toBe(2);
    expect(env.seen.stderr.filter((l) => l.text === "Scanning workspace complete")).toHaveLength(2);
  });
});

describe("mergeScript · stubPort · drive", () => {
  it("mergeScript는 입력을 바꾸지 않고, 객체 섹션은 필드별로 합치며, null·원시값은 통째로 바꾼다", () => {
    const base = happyScript(SPEC);
    const snapshot = structuredClone(base);
    const merged = mergeScript(base, {
      rules: { gotErrors: 2 },
      serverVersion: "9.9.9",
      crash: { on: "scan", afterMs: 1, code: 1, signal: null },
    });
    expect(base).toEqual(snapshot);
    expect(merged.rules.gotErrors).toBe(2);
    expect(merged.rules.loadingPaths).toEqual(base.rules.loadingPaths);
    expect(merged.serverVersion).toBe("9.9.9");
    expect(merged.crash).toEqual({ on: "scan", afterMs: 1, code: 1, signal: null });
    // 다시 null로 되돌릴 수 있다.
    expect(mergeScript(merged, { crash: null }).crash).toBeNull();
    // 섹션이 복사본이라 서로 영향이 없다.
    merged.rules.loadingPaths = [];
    expect(base.rules.loadingPaths.length).toBeGreaterThan(0);
  });

  it("happyScript: mode와 무관하게 HappySpec에서 만든다(진단·n·k·m이 그대로 간다)", () => {
    const spec: HappySpec = {
      ...targetSpec({ n: 7, k: 3, m: 2, s: 1 }),
      diagnostics: {
        [TARGET_PATHS[0]]: [{ severity: 2, code: "x.y", message: "m" }],
      },
    };
    const script = happyScript(spec);
    expect([script.scan.n, script.scan.k, script.scan.m, script.scan.s]).toEqual([7, 3, 2, 1]);
    expect(script.scan.publishes[0].diagnostics).toHaveLength(1);
    expect(script.scan.publishes.map((p) => p.path)).toEqual(spec.expectedPaths);
    // happyTranscript와 같은 입력으로 만든 트랜스크립트가 존재한다는 것만 확인(소스 일치 시험은 위에서 한다).
    expect(happyTranscript(spec).events.length).toBeGreaterThan(0);
  });

  it("stubPort는 spawn마다 스텁이 붙은 새 자식을 만든다", async () => {
    const clock = new VirtualClock();
    const { port, stubs } = stubPort(happyScript(SPEC), clock, { child: { pid: 77 } });
    const a = await port.spawn({ command: "x", args: [], cwd: "/", env: {} });
    const b = await port.spawn({ command: "x", args: [], cwd: "/", env: {} });
    expect(stubs).toHaveLength(2);
    expect(stubs[0].child).toBe(a);
    expect(stubs[1].child).toBe(b);
    expect(a).not.toBe(b);
    expect(a.pid).toBe(77);
    expect(port.provenance).toBe("stub");
  });

  it("drive는 멈춘 약속을 매달리지 않고 던지며, 이미 끝난 약속은 시계를 움직이지 않는다", async () => {
    const clock = new VirtualClock();
    await expect(drive(clock, new Promise<void>(() => {}))).rejects.toThrow("끝나지 않았다");
    const done = await drive(clock, Promise.resolve(5));
    expect(done).toBe(5);
    expect(clock.now()).toBe(3_600_000); // 첫 시험이 시계를 끝까지 보냈다
    const fresh = new VirtualClock();
    await drive(fresh, Promise.resolve());
    expect(fresh.now()).toBe(0);
  });

  it("notification 도우미를 가져다 써도 JSON-RPC 알림 모양이다", () => {
    expect(notification("x")).toEqual({ jsonrpc: "2.0", method: "x" });
  });
});
