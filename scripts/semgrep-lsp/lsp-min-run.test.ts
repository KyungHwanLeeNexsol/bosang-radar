import { describe, expect, it } from "vitest";
import { VirtualClock } from "./clock";
import { FrameDecoder } from "./framing";
import {
  LSP_MIN_LIMITS,
  buildLspMinEnv,
  lspMinLayout,
  type LspMinLimits,
  type LspMinObservation,
} from "./lsp-min";
import { runLspMinObservation, type LspMinPorts, type LspMinRequest } from "./lsp-min-run";
import { FakeMetricsReceiver } from "./testing/fake-metrics";
import { MemoryArtifactHasher } from "./testing/memory-artifact";
import { MemoryFs } from "./testing/memory-fs";
import { drive } from "./testing/stub-lsp";
import {
  GOOD_RESULT,
  STUB_VERSION,
  lspMinPort,
  type LspMinChild,
  type MinScript,
} from "./testing/stub-lsp-min";
import { SyntheticLister, row, snapshotOf } from "./testing/synthetic-processes";
import type { JsonRpcMessage, ProcessRow } from "./types";

// ── 시험 장치 ───────────────────────────────────────────────────

const WORK = "C:/work/run-1";
const layout = lspMinLayout(WORK);
const URL = "http://127.0.0.1:41999";
const EXE = "C:/venv/Scripts/semgrep.exe";
const CORE = "C:/venv/Lib/site-packages/semgrep/bin/semgrep-core.exe";
const HOME_OK = ".semgrep/cache/fingerprinted_ignored_findings/ws.txt";

function tree(): ProcessRow[] {
  return [
    row({ pid: 4242, ppid: 100, name: "semgrep.exe" }),
    row({ pid: 5000, ppid: 4242, name: "python.exe" }),
    row({ pid: 5001, ppid: 5000, name: "semgrep-core.exe" }),
  ];
}

interface RigOptions {
  child?: { onKill?: "exit" | "ignore-sigterm" | "ignore-all" };
  request?: Partial<LspMinRequest>;
  decorate?: (child: LspMinChild) => void;
}

function makeRig(script: MinScript, options: RigOptions = {}) {
  const clock = new VirtualClock();
  const fs = new MemoryFs();
  const events: string[] = [];
  const { port, children } = lspMinPort(script, clock, {
    ...(options.child ? { child: options.child } : {}),
    ...(options.decorate ? { decorate: options.decorate } : {}),
  });
  const originalSpawn = port.spawn.bind(port);
  port.spawn = async (spec) => {
    events.push("spawn");
    return originalSpawn(spec);
  };
  const originalMkdirp = fs.mkdirp.bind(fs);
  fs.mkdirp = async (path: string) => {
    events.push(`mkdirp:${path}`);
    return originalMkdirp(path);
  };
  const receiver = new FakeMetricsReceiver({ hits: 0 });
  const state = { rows: null as null | (() => ProcessRow[]), failList: false };
  const lister = new SyntheticLister(async () => {
    if (state.failList) return { ok: false as const, failure: "TIMEOUT" as const };
    const child = children[0];
    const alive = child !== undefined && !child.hasExitedNow;
    const rows = state.rows ? state.rows() : alive ? tree() : [];
    return { ok: true as const, snapshot: snapshotOf(rows) };
  });
  const hasher = new MemoryArtifactHasher({ [CORE]: "core-binary-v1" });
  const ports: LspMinPorts = { process: port, clock, fs, receiver, lister, hasher };
  const request: LspMinRequest = {
    runId: "run-1",
    command: EXE,
    args: ["lsp", "--debug"],
    layout,
    env: buildLspMinEnv(layout, "C:/Windows", URL),
    expectedVersion: STUB_VERSION,
    artifacts: [{ label: "semgrep-core", path: CORE }],
    ...options.request,
  };
  return { clock, fs, port, children, receiver, lister, hasher, ports, request, events, state };
}
type Rig = ReturnType<typeof makeRig>;

async function run(
  rig: Rig
): Promise<{ record: LspMinObservation; raw: { stdout: Uint8Array; stderr: Uint8Array } }> {
  return drive(rig.clock, runLspMinObservation(rig.ports, rig.request));
}

function sentOf(child: LspMinChild): JsonRpcMessage[] {
  const decoder = new FrameDecoder();
  const out: JsonRpcMessage[] = [];
  for (const chunk of child.stdinWrites) out.push(...decoder.push(chunk).messages);
  return out;
}
const methodsOf = (child: LspMinChild): string[] => sentOf(child).map((m) => String(m.method));

/** 어느 경로로 끝났든 stdin에는 허용된 메시지만 썼다. */
function expectOnlyAllowedSends(child: LspMinChild): void {
  const methods = methodsOf(child);
  expect(["initialize", "shutdown", "exit"]).toEqual(expect.arrayContaining(methods));
  expect(methods).not.toContain("initialized");
  expect(child.unexpected).toEqual([]);
  // 순서: initialize가 맨 앞이고, shutdown은 exit보다 앞이다.
  if (methods.length > 0) expect(methods[0]).toBe("initialize");
  if (methods.includes("exit"))
    expect(methods.indexOf("shutdown")).toBeLessThan(methods.indexOf("exit"));
}

const OK: MinScript = { init: { kind: "result" } };

// ── 요청 거절: 아무것도 만들지 않고 띄우지 않는다 ──────────────

describe("요청 거절", () => {
  const cases: [string, Partial<LspMinRequest>, string][] = [
    ["고정 인자가 아니다", { args: ["lsp", "--debug", "--legacy"] }, "ARGS_NOT_FIXED"],
    ["인자가 없다", { args: [] }, "ARGS_NOT_FIXED"],
    ["다른 실행 파일", { command: "C:/venv/Scripts/pysemgrep.exe" }, "COMMAND_NAME_NOT_ALLOWED"],
    ["상대 경로 실행 파일", { command: "Scripts/semgrep.exe" }, "COMMAND_NOT_ABSOLUTE"],
    ["runId 형식", { runId: "../x" }, "RUN_ID_INVALID"],
    [
      "환경에 토큰 이름",
      { env: { ...buildLspMinEnv(layout, "C:/Windows", URL), GITHUB_TOKEN: "t" } },
      "ENV_NAME_NOT_ALLOWED:GITHUB_TOKEN",
    ],
    [
      "환경에 SEMGREP_ENABLE_VERSION_CHECK",
      { env: { ...buildLspMinEnv(layout, "C:/Windows", URL), SEMGREP_ENABLE_VERSION_CHECK: "0" } },
      "ENV_NAME_NOT_ALLOWED:SEMGREP_ENABLE_VERSION_CHECK",
    ],
    ["한도를 올림", { limits: { totalMs: 999_999 } }, "LIMIT_ABOVE_CAP:totalMs"],
  ];
  it.each(cases)("%s → 아무 폴더도 만들지 않고 아무것도 띄우지 않는다", async (_n, over, token) => {
    const rig = makeRig(OK, { request: over });
    const { record } = await run(rig);
    expect(record.status).toBe("NOT_ATTEMPTED");
    expect(record.status_reasons).toContain(token);
    expect(rig.port.spawnCalls).toHaveLength(0);
    expect(rig.fs.directories).toEqual([]);
    expect(rig.events).toEqual([]);
    expect(rig.lister.calls).toBe(0);
    expect(rig.receiver.observeCalls).toBe(0);
    expect(rig.hasher.calls).toEqual([]);
    expect(record.provenance).toBeNull();
    expect(record.not_established.complete).toBe("NOT_ESTABLISHED");
  });

  it("이미 취소된 신호면 시작하지 않는다", async () => {
    const controller = new AbortController();
    controller.abort();
    const rig = makeRig(OK, { request: { signal: controller.signal } });
    const { record } = await run(rig);
    expect(record.status).toBe("NOT_ATTEMPTED");
    expect(record.status_reasons).toContain("CANCELLED_BEFORE_START");
    expect(rig.port.spawnCalls).toHaveLength(0);
    expect(rig.fs.directories).toEqual([]);
  });

  it("사전 확인이 도는 동안 취소되면 띄우지 않는다 (실제 Windows 통합 시험에서 취소가 무시되던 결함)", async () => {
    const controller = new AbortController();
    const rig = makeRig(OK, { request: { signal: controller.signal } });
    let calls = 0;
    rig.lister = new SyntheticLister(async () => {
      calls += 1;
      if (calls === 1) controller.abort(); // 사전 확인의 목록 조회 도중 취소된다
      return { ok: true as const, snapshot: snapshotOf([]) };
    });
    rig.ports.lister = rig.lister;
    const { record } = await run(rig);
    expect(record.status).toBe("NOT_ATTEMPTED");
    expect(record.status_reasons).toContain("CANCELLED_BEFORE_START");
    expect(rig.port.spawnCalls).toHaveLength(0);
  });

  it("사전 확인에서 걸리면 폴더는 만들었어도 프로세스는 띄우지 않는다: 작업 영역이 비어 있지 않다", async () => {
    const rig = makeRig(OK);
    await rig.fs.writeFileExclusive(`${layout.workspace}/leftover.txt`, new Uint8Array([1]));
    const { record } = await run(rig);
    expect(record.status).toBe("NOT_ATTEMPTED");
    expect(record.status_reasons).toContain("WATCHED_ROOT_NOT_EMPTY:WORKSPACE");
    expect(rig.port.spawnCalls).toHaveLength(0);
  });

  it("사전 확인: 홈과 규칙 폴더도 비어 있어야 한다", async () => {
    const rig = makeRig(OK);
    await rig.fs.writeFileExclusive(`${layout.homeDir}/.semgrep/old.txt`, new Uint8Array([1]));
    await rig.fs.writeFileExclusive(`${layout.rulesDir}/r.yaml`, new Uint8Array([1]));
    const { record } = await run(rig);
    expect(record.status_reasons).toEqual(
      expect.arrayContaining([
        "WATCHED_ROOT_NOT_EMPTY:HOME_DIR",
        "WATCHED_ROOT_NOT_EMPTY:RULES_DIR",
      ])
    );
    expect(rig.port.spawnCalls).toHaveLength(0);
  });

  it("사전 확인: 수신기를 읽을 수 없으면 띄우지 않는다", async () => {
    const rig = makeRig(OK);
    rig.receiver.throwOnObserve = true;
    const { record } = await run(rig);
    expect(record.status_reasons).toContain("RECEIVER_UNOBSERVABLE");
    expect(rig.port.spawnCalls).toHaveLength(0);
  });

  it("사전 확인: 수신기 건수가 null이면 띄우지 않는다", async () => {
    const rig = makeRig(OK);
    rig.receiver.hits = null;
    const { record } = await run(rig);
    expect(record.status_reasons).toContain("RECEIVER_UNOBSERVABLE");
    expect(rig.port.spawnCalls).toHaveLength(0);
  });

  it("사전 확인: 프로세스 목록을 읽을 수 없으면 띄우지 않는다", async () => {
    const rig = makeRig(OK);
    rig.state.failList = true;
    const { record } = await run(rig);
    expect(record.status_reasons).toContain("PROCESS_LISTER_UNAVAILABLE");
    expect(rig.port.spawnCalls).toHaveLength(0);
  });

  it("폴더를 만들지 못하면 띄우지 않는다", async () => {
    const rig = makeRig(OK);
    rig.fs.mkdirp = async () => {
      throw new Error("EACCES");
    };
    const { record } = await run(rig);
    expect(record.status_reasons).toContain("STATE_DIR_NOT_CREATED");
    expect(rig.port.spawnCalls).toHaveLength(0);
  });
});

// ── 정상 경로 ───────────────────────────────────────────────────

describe("정상 경로", () => {
  it("initialize → shutdown → exit 셋만 이 순서로 보내고 initialized는 보내지 않는다", async () => {
    const rig = makeRig({ init: { kind: "result", delayMs: 120 } });
    const { record } = await run(rig);
    const child = rig.children[0];
    expect(methodsOf(child)).toEqual(["initialize", "shutdown", "exit"]);
    expect(sentOf(child)[0].id).toBe("lsp-min-init-1");
    expect(sentOf(child)[1].id).toBe("lsp-min-shutdown-1");
    expect(sentOf(child)[2].id).toBeUndefined();
    expectOnlyAllowedSends(child);
    expect(record.sent.map((s) => s.label)).toEqual(["initialize", "shutdown", "exit"]);
    expect(record.sent.every((s) => s.ok)).toBe(true);
    expect(record.request.initialized_sent).toBe(false);
    expect(record.status).toBe("OBSERVED");
    expect(record.initialize).toMatchObject({
      response: "VALID",
      latency_ms: 120,
      pin_version_comparison: "MATCH",
      server_info: { name: "Semgrep", version: STUB_VERSION },
    });
    expect(record.termination).toMatchObject({
      trigger: "NORMAL",
      path: "SELF_EXIT",
      exit: { code: 0, signal: null },
      stdin_closed_by_harness: false,
      kill_count: 0,
    });
    expect(record.timeline.observation_ms).toBe(120);
    expect(record.cleanup.ok).toBe(true);
    expect(record.provenance).toBe("stub");
    expect(rig.clock.pendingTimers).toBe(0);
  });

  it("spawn: 고정 실행 파일·고정 인자·작업 폴더는 상태 폴더·환경은 요청의 것 그대로다", async () => {
    const rig = makeRig(OK);
    const canary = "BOSANG_LSP_MIN_CANARY";
    process.env[canary] = "must-not-leak";
    try {
      await run(rig);
    } finally {
      delete process.env[canary];
    }
    expect(rig.port.spawnCalls).toHaveLength(1);
    const spec = rig.port.spawnCalls[0];
    expect(spec.command).toBe(EXE);
    expect([...spec.args]).toEqual(["lsp", "--debug"]);
    expect(spec.cwd).toBe(layout.stateDir);
    expect(spec.env).toEqual(rig.request.env);
    expect(Object.keys(spec.env)).not.toContain(canary);
    expect(Object.keys(spec.env)).not.toContain("SEMGREP_ENABLE_VERSION_CHECK");
    expect(JSON.stringify(spec.env)).not.toContain("must-not-leak");
  });

  it("전용 홈을 포함한 폴더를 프로세스를 띄우기 전에 실제로 만든다", async () => {
    const rig = makeRig(OK);
    await run(rig);
    const spawnAt = rig.events.indexOf("spawn");
    expect(spawnAt).toBeGreaterThan(0);
    const made = rig.events.slice(0, spawnAt).filter((e) => e.startsWith("mkdirp:"));
    expect(made.map((e) => e.slice(7))).toEqual(
      expect.arrayContaining([
        layout.workspace,
        layout.stateDir,
        layout.rulesDir,
        layout.homeDir,
        layout.tmpDir,
      ])
    );
    expect(rig.fs.directories).toEqual(
      expect.arrayContaining([layout.workspace, layout.rulesDir, layout.homeDir, layout.tmpDir])
    );
  });

  it("shutdown에 서버가 응답하지 않아도 정상이다(실제 서버는 응답하지 않는다)", async () => {
    const rig = makeRig({ init: { kind: "result" }, shutdown: "silent" });
    const { record } = await run(rig);
    expect(record.status).toBe("OBSERVED");
    expect(record.server_messages.anomalies).not.toContain("SHUTDOWN_RESPONSE_SEEN");
  });

  it("shutdown에 응답이 와도 이상 징후로만 기록한다", async () => {
    const rig = makeRig({ init: { kind: "result" }, shutdown: "reply" });
    const { record } = await run(rig);
    expect(record.status).toBe("OBSERVED");
    expect(record.server_messages.anomalies).toContain("SHUTDOWN_RESPONSE_SEEN");
  });

  it("종료 코드가 0이 아니어도 관측은 성립한다(경로·코드는 그대로 기록)", async () => {
    const rig = makeRig({ init: { kind: "result" }, exit: "exit1" });
    const { record } = await run(rig);
    expect(record.status).toBe("OBSERVED");
    expect(record.termination.exit).toEqual({ code: 1, signal: null });
  });

  it("홈 폴더의 지문 파일(shutdown이 쓰는 예상 위치)은 위반이 아니다", async () => {
    const rig = makeRig({ init: { kind: "result", delayMs: 200 }, stderrAt: [] });
    rig.clock.setTimer(() => {
      void rig.fs.writeFileExclusive(`${layout.homeDir}/${HOME_OK}`, new Uint8Array([1]));
    }, 100);
    const { record } = await run(rig);
    expect(record.status).toBe("OBSERVED");
    const home = record.coverage.post_hoc.watched_roots.find((r) => r.role === "HOME_DIR");
    expect(home?.added).toEqual([HOME_OK]);
    expect(home?.files_before).toBe(0);
    expect(home?.files_after).toBe(1);
  });

  it("분할된 응답 프레임(한 바이트씩)도 같은 결과다", async () => {
    const rig = makeRig({ init: { kind: "result", byteByByte: true } });
    const { record } = await run(rig);
    expect(record.status).toBe("OBSERVED");
    expect(record.initialize.response).toBe("VALID");
  });

  it("응답 전의 서버 알림과 서버 요청은 세지만 답하지 않는다", async () => {
    const rig = makeRig({
      init: {
        kind: "frames",
        frames: [
          { jsonrpc: "2.0", method: "window/logMessage", params: {} },
          { jsonrpc: "2.0", id: 5, method: "client/registerCapability", params: {} },
          { jsonrpc: "2.0", id: "lsp-min-init-1", result: GOOD_RESULT } as JsonRpcMessage,
        ],
      },
    });
    const { record } = await run(rig);
    expect(methodsOf(rig.children[0])).toEqual(["initialize", "shutdown", "exit"]); // 서버 요청에 답하지 않았다
    expect(record.server_messages.server_requests.count).toBe(1);
    expect(record.server_messages.notifications.methods["window/logMessage"]).toBe(1);
    expect(record.status).toBe("OBSERVED");
  });

  it("설치물 해시를 실행 전후로 비교한다(같음 / 실행 중 바뀜)", async () => {
    const same = makeRig(OK);
    const a = await run(same);
    expect(a.record.coverage.post_hoc.artifact_hashes).toMatchObject([
      { label: "semgrep-core", comparison: "SAME" },
    ]);

    const changed = makeRig({ init: { kind: "result", delayMs: 50 } });
    changed.clock.setTimer(() => changed.hasher.set(CORE, "core-binary-v2"), 10);
    const b = await run(changed);
    expect(b.record.coverage.post_hoc.artifact_hashes[0].comparison).toBe("CHANGED");
    // 바뀌었다는 사실은 기록되고 관측 결과를 바꾸지는 않는다.
    expect(b.record.status).toBe("OBSERVED");
  });

  it("설치물을 읽지 못하면 NOT_COMPARED로 기록하고 진행한다", async () => {
    const rig = makeRig(OK);
    rig.hasher.failWith(CORE, "NOT_FOUND");
    const { record } = await run(rig);
    expect(record.coverage.post_hoc.artifact_hashes[0].comparison).toBe("NOT_COMPARED");
    expect(record.status).toBe("OBSERVED");
  });
});

// ── 초기화 실패: shutdown·exit를 보내지 않고 stdin을 닫는다 ─────

describe("초기화 실패", () => {
  function expectInitFailureShape(rig: Rig, record: LspMinObservation, trigger: string): void {
    const child = rig.children[0];
    expect(methodsOf(child)).toEqual(["initialize"]); // shutdown·exit를 보내지 않았다
    expectOnlyAllowedSends(child);
    expect(child.endStdinCalls).toBe(1);
    expect(record.status).toBe("NOT_OBSERVED");
    expect(record.termination).toMatchObject({
      trigger,
      path: "STDIN_CLOSED",
      stdin_closed_by_harness: true,
      kill_count: 0,
    });
    expect(record.cleanup.ok).toBe(true);
  }

  it("JSON-RPC error 응답", async () => {
    const rig = makeRig({ init: { kind: "error" } });
    const { record } = await run(rig);
    expectInitFailureShape(rig, record, "INIT_INVALID");
    expect(record.status_reasons).toContain("INIT_ERROR_RESPONSE");
  });

  it("result 안의 InitializeError({retry:false}) — 로그 알림이 먼저 오고 error 필드는 없다", async () => {
    const rig = makeRig({ init: { kind: "initialize-error" } });
    const { record } = await run(rig);
    expectInitFailureShape(rig, record, "INIT_INVALID");
    expect(record.initialize.response).toBe("INVALID");
    expect(record.status_reasons).toContain("INIT_RESULT_IS_INITIALIZE_ERROR");
    expect(record.initialize.result_keys).toEqual(["retry"]);
  });

  it.each([
    ["capabilities 없음", { serverInfo: { name: "Semgrep" } }, "INIT_CAPABILITIES_MISSING"],
    ["capabilities가 배열", { capabilities: [] }, "INIT_CAPABILITIES_NOT_OBJECT"],
    ["capabilities가 null", { capabilities: null }, "INIT_CAPABILITIES_NOT_OBJECT"],
    ["result가 null", null, "INIT_RESULT_NOT_OBJECT"],
    ["result가 배열", [], "INIT_RESULT_NOT_OBJECT"],
    ["result가 문자열", "ok", "INIT_RESULT_NOT_OBJECT"],
  ])("잘못된 구조: %s", async (_n, result, token) => {
    const rig = makeRig({ init: { kind: "result", result } });
    const { record } = await run(rig);
    expectInitFailureShape(rig, record, "INIT_INVALID");
    expect(record.status_reasons).toContain(token);
  });

  it("serverInfo가 잘못된 응답은 흐름은 정상(shutdown·exit까지)이지만 기록의 판정은 실패다", async () => {
    const rig = makeRig({
      init: { kind: "result", result: { capabilities: {}, serverInfo: "x" } },
    });
    const { record } = await run(rig);
    expect(methodsOf(rig.children[0])).toEqual(["initialize", "shutdown", "exit"]);
    expect(record.initialize.response).toBe("INVALID");
    expect(record.status).toBe("NOT_OBSERVED");
    expect(record.status_reasons).toContain("INIT_SERVERINFO_MALFORMED");
  });

  it.each([
    ["다른 문자열 id", "other"],
    ["숫자 1", 1],
    ["문자열 '1'", "1"],
    ["대소문자만 다른 id", "LSP-MIN-INIT-1"],
    ["null id", null],
  ])("잘못된 ID(%s)의 응답은 응답으로 인정하지 않는다 → 초기화 시간 초과", async (_n, id) => {
    const rig = makeRig({ init: { kind: "result", id } });
    const { record } = await run(rig);
    const child = rig.children[0];
    expect(methodsOf(child)).toEqual(["initialize"]);
    expect(record.termination.trigger).toBe("INIT_TIMEOUT");
    expect(record.initialize.response).toBe("NONE");
    expect(record.timeline.observation_ms).toBe(LSP_MIN_LIMITS.initMs); // 60초 근처, EOF로 끝남
    expect(record.termination.path).toBe("STDIN_CLOSED");
  });

  it("응답 지연이 한도 안이면 정상이고 지연이 기록된다 (20초)", async () => {
    const rig = makeRig({ init: { kind: "result", delayMs: 20_000 } });
    const { record } = await run(rig);
    expect(record.status).toBe("OBSERVED");
    expect(record.initialize.latency_ms).toBe(20_000);
  });

  it("응답 지연이 한도를 넘으면(70초) 60초에 시간 초과 — 보내지 않고 stdin을 닫는다", async () => {
    const rig = makeRig({ init: { kind: "result", delayMs: 70_000 } });
    const { record } = await run(rig);
    expect(methodsOf(rig.children[0])).toEqual(["initialize"]);
    expect(record.termination.trigger).toBe("INIT_TIMEOUT");
    expect(record.status).toBe("NOT_OBSERVED");
    expect(record.status_reasons).toContain("INIT_NO_RESPONSE");
    expect(record.termination.path).toBe("STDIN_CLOSED");
    expect(record.timeline.observation_ms).toBe(60_000);
  });

  it("무응답 + EOF도 무시하는 서버: 60초 시간 초과 → stdin 닫기 → 유예 10초 → 강제 종료 (70초)", async () => {
    const rig = makeRig({ init: { kind: "silent" }, stdinEnd: "ignore" });
    const { record } = await run(rig);
    const child = rig.children[0];
    expect(methodsOf(child)).toEqual(["initialize"]);
    expect(record.termination).toMatchObject({
      trigger: "INIT_TIMEOUT",
      path: "FORCE_KILLED",
      stdin_closed_by_harness: true,
      kill_count: 1,
    });
    expect(child.killCalls).toEqual(["SIGKILL"]);
    expect(record.timeline.observation_ms).toBe(70_000);
    expect(record.cleanup.ok).toBe(true);
  });

  it("응답 없이 서버가 먼저 끝나면(CHILD_EXITED_EARLY) 더 보내지 않고 정리만 한다", async () => {
    const rig = makeRig({ init: { kind: "exit", code: 3 } });
    const { record } = await run(rig);
    expect(record.termination.trigger).toBe("CHILD_EXITED_EARLY");
    expect(methodsOf(rig.children[0])).toEqual(["initialize"]);
    expect(record.status).toBe("NOT_OBSERVED");
    expect(record.termination.exit).toEqual({ code: 3, signal: null });
    expect(rig.children[0].endStdinCalls).toBe(0);
  });

  it("응답한 직후 곧바로 끝나는 서버: 응답은 유효하지만 shutdown·exit를 보내지 못해 관측은 성립하지 않는다", async () => {
    const rig = makeRig({ init: { kind: "result", delayMs: 100 }, exitAfterInit: true });
    const { record } = await run(rig);
    expect(record.initialize.response).toBe("VALID");
    expect(record.status).toBe("NOT_OBSERVED");
    expect(record.status_reasons).toContain("SHUTDOWN_EXIT_NOT_SENT");
    expect(record.termination.trigger).toBe("STDIN_ERROR");
    expect(methodsOf(rig.children[0])).toEqual(["initialize"]);
  });
});

// ── shutdown 이후 ───────────────────────────────────────────────

describe("exit 이후의 종료 경로", () => {
  it("exit를 무시하는(초기화되지 않은 서버 같은) 서버: 30초 시간 초과 → stdin 닫기 → EOF로 종료", async () => {
    const rig = makeRig({ init: { kind: "result" }, exit: "ignore" });
    const { record } = await run(rig);
    expect(methodsOf(rig.children[0])).toEqual(["initialize", "shutdown", "exit"]);
    expect(record.termination).toMatchObject({
      trigger: "EXIT_TIMEOUT",
      path: "STDIN_CLOSED",
      stdin_closed_by_harness: true,
      kill_count: 0,
    });
    expect(record.timeline.observation_ms).toBe(30_000);
    // 응답도 오고 shutdown·exit도 보냈으므로 관측은 성립한다. 종료 경로는 사실로만 남는다.
    expect(record.status).toBe("OBSERVED");
  });

  it("exit도 EOF도 무시하면 30초 + 10초 유예 뒤 강제 종료한다 (40초)", async () => {
    const rig = makeRig({ init: { kind: "result" }, exit: "ignore", stdinEnd: "ignore" });
    const { record } = await run(rig);
    expect(record.termination).toMatchObject({
      trigger: "EXIT_TIMEOUT",
      path: "FORCE_KILLED",
      kill_count: 1,
    });
    expect(record.timeline.observation_ms).toBe(40_000);
    expect(record.cleanup.ok).toBe(true);
  });
});

// ── 전체 상한 ───────────────────────────────────────────────────

describe("전체 상한과 유예", () => {
  const small: Partial<LspMinLimits> = { totalMs: 50_000 };

  it("전체 상한에 닿으면 stdin 닫기도 유예도 없이 곧바로 강제 종료한다", async () => {
    const rig = makeRig(
      { init: { kind: "silent" }, stdinEnd: "ignore" },
      { request: { limits: small } }
    );
    const { record } = await run(rig);
    const child = rig.children[0];
    expect(record.termination.trigger).toBe("TOTAL_TIMEOUT");
    expect(record.termination.stdin_closed_by_harness).toBe(false);
    expect(child.endStdinCalls).toBe(0);
    expect(record.termination.kill_count).toBe(1);
    expect(record.timeline.observation_ms).toBe(50_000);
    expect(record.status).toBe("NOT_OBSERVED");
    expect(record.status_reasons).toContain("TOTAL_TIMEOUT");
  });

  it("단계 한도가 전체 마감보다 늦으면 전체 마감이 이긴다 (exit 대기 30초가 남은 20초로 줄어든다)", async () => {
    const rig = makeRig(
      { init: { kind: "result", delayMs: 30_000 }, exit: "ignore", stdinEnd: "ignore" },
      { request: { limits: small } }
    );
    const { record } = await run(rig);
    expect(record.termination.trigger).toBe("TOTAL_TIMEOUT");
    expect(record.termination.stdin_closed_by_harness).toBe(false);
    expect(record.timeline.observation_ms).toBe(50_000);
    expect(methodsOf(rig.children[0])).toEqual(["initialize", "shutdown", "exit"]);
  });

  it("stdin 닫기 유예도 전체 마감을 넘기지 못한다: 초기화 20초 + 유예 10초가 25초 상한에 잘린다", async () => {
    const rig = makeRig(
      { init: { kind: "silent" }, stdinEnd: "ignore" },
      { request: { limits: { totalMs: 25_000, initMs: 20_000 } } }
    );
    const { record } = await run(rig);
    expect(record.termination.trigger).toBe("INIT_TIMEOUT"); // 먼저 일어난 이유가 trigger
    expect(record.termination.also).toContain("TOTAL_TIMEOUT");
    expect(record.timeline.observation_ms).toBe(25_000); // 20,000 + 10,000 = 30,000이 아니다
    expect(rig.children[0].killCalls).toHaveLength(1);
  });

  it("전체 상한 뒤의 종료 확인 창은 고정 한 번이다: 죽지 않는 자식이어도 10초 뒤 끝나고 다시 종료를 시도하지 않는다", async () => {
    const rig = makeRig(
      { init: { kind: "silent" }, stdinEnd: "ignore" },
      { request: { limits: small }, child: { onKill: "ignore-all" } }
    );
    const { record } = await run(rig);
    const child = rig.children[0];
    expect(record.timeline.observation_ms).toBe(50_000);
    expect(record.timeline.cleanup_ms).toBe(10_000);
    expect(record.cleanup.ok).toBe(false);
    expect(record.cleanup.problems).toContain("KILL_NOT_OBSERVED");
    expect(child.killCalls).toHaveLength(1); // 재시도 없음
    // 관측 50,000 + 정리 창 10,000. 그 밖의 유예가 더해지지 않았다.
    expect((record.timeline.observation_ms ?? 0) + (record.timeline.cleanup_ms ?? 0)).toBe(60_000);
  });

  it("종료 확인이 늦게 오는 운영체제에서도 강제 종료 신호는 한 번만 나간다 (실제 Windows 통합 시험에서 두 번 나가던 결함)", async () => {
    // 신호를 보낸 뒤 3초가 지나서야 종료가 확인된다. 그 사이 '아직 안 죽었다'며 다시 보내면 안 된다.
    const rig = makeRig({ init: { kind: "silent" }, stdinEnd: "ignore", killExitDelayMs: 3_000 });
    const { record } = await run(rig);
    expect(rig.children[0].killCalls).toEqual(["SIGKILL"]);
    expect(record.termination.kill_count).toBe(1);
    expect(record.cleanup.child_exit_confirmed).toBe(true); // 확인 창(10초) 안에 확인됐다
    expect(record.cleanup.ok).toBe(true);
  });

  it("종료 확인이 창(10초)보다 늦으면 다시 보내지 않고 KILL_NOT_OBSERVED로 남긴다", async () => {
    const rig = makeRig({ init: { kind: "silent" }, stdinEnd: "ignore", killExitDelayMs: 60_000 });
    const { record } = await run(rig);
    expect(rig.children[0].killCalls).toHaveLength(1);
    expect(record.cleanup.child_exit_confirmed).toBe(false);
    expect(record.cleanup.problems).toContain("KILL_NOT_OBSERVED");
    expect(record.timeline.cleanup_ms).toBe(10_000);
  });

  it("어떤 한도 조합에서도 관측 구간은 전체 상한을 넘지 않는다 (격자 점검)", async () => {
    const scripts: MinScript[] = [
      { init: { kind: "silent" }, stdinEnd: "ignore" },
      { init: { kind: "result", delayMs: 9_000 }, exit: "ignore", stdinEnd: "ignore" },
      { init: { kind: "error" }, stdinEnd: "ignore" },
      { init: { kind: "initialize-error", delayMs: 4_000 }, stdinEnd: "ignore" },
    ];
    const totals = [5_000, 12_000, 20_000, 33_333];
    for (const script of scripts) {
      for (const totalMs of totals) {
        const rig = makeRig(script, {
          request: {
            limits: {
              totalMs,
              initMs: 15_000,
              exitMs: 15_000,
              stdinCloseGraceMs: 7_000,
              killConfirmMs: 3_000,
            },
          },
        });
        const { record } = await run(rig);
        expect(
          record.timeline.observation_ms ?? 0,
          `${JSON.stringify(script.init)} total=${totalMs}`
        ).toBeLessThanOrEqual(totalMs);
        expect(record.timeline.cleanup_ms ?? 0).toBeLessThanOrEqual(3_000);
      }
    }
  });
});

// ── 출력·프레임·입출력 오류 ─────────────────────────────────────

describe("출력 한도·프레임 오류·입출력 오류는 곧바로 강제 종료한다", () => {
  function expectImmediate(rig: Rig, record: LspMinObservation, trigger: string): void {
    const child = rig.children[0];
    expect(record.termination.trigger).toBe(trigger);
    expect(record.termination.stdin_closed_by_harness).toBe(false);
    expect(child.endStdinCalls).toBe(0);
    expect(record.termination.kill_count).toBe(1);
    expect(record.status).not.toBe("OBSERVED");
    expectOnlyAllowedSends(child);
  }

  it("stdout 상한 초과", async () => {
    const rig = makeRig(
      { init: { kind: "raw", bytes: "x".repeat(300) } },
      { request: { limits: { maxStdoutBytes: 100 } } }
    );
    const { record, raw } = await run(rig);
    expectImmediate(rig, record, "OUTPUT_LIMIT");
    expect(record.streams.stdout.overflow).toBe(true);
    expect(raw.stdout.length).toBeLessThanOrEqual(100); // 넘친 덩어리는 쓰지 않는다
    expect(record.status_reasons).toContain("OUTPUT_LIMIT");
  });

  it("stderr 상한 초과", async () => {
    const rig = makeRig(
      { init: { kind: "silent" }, stderrAt: [{ atMs: 10, text: "a".repeat(300) }] },
      { request: { limits: { maxStderrBytes: 100 } } }
    );
    const { record, raw } = await run(rig);
    expectImmediate(rig, record, "OUTPUT_LIMIT");
    expect(record.streams.stderr.overflow).toBe(true);
    expect(raw.stderr.length).toBeLessThanOrEqual(100);
  });

  it("프레임 하나의 Content-Length가 stdout 상한을 넘으면 상한 초과가 아니라 FRAME_ERROR다 (작은 프레임이 쌓여 넘는 경우와 구분된다)", async () => {
    const rig = makeRig(
      { init: { kind: "raw", bytes: "Content-Length: 500\r\n\r\n{" } },
      { request: { limits: { maxStdoutBytes: 100 } } }
    );
    const { record } = await run(rig);
    expectImmediate(rig, record, "FRAME_ERROR");
    expect(record.streams.stdout.overflow).toBe(false);
  });

  it("작은 프레임이 쌓여 stdout 상한을 넘으면 OUTPUT_LIMIT다", async () => {
    const frames = Array.from(
      { length: 40 },
      () => ({ jsonrpc: "2.0", method: "x/flood", params: "a".repeat(10) }) as JsonRpcMessage
    );
    const rig = makeRig(
      { init: { kind: "frames", frames } },
      { request: { limits: { maxStdoutBytes: 1000 } } }
    );
    const { record } = await run(rig);
    expectImmediate(rig, record, "OUTPUT_LIMIT");
    expect(record.streams.stdout.overflow).toBe(true);
  });

  it("상한 안의 큰 출력은 통과한다(경계: 정확히 상한)", async () => {
    const rig = makeRig(
      { init: { kind: "result", delayMs: 50 }, stderrAt: [{ atMs: 10, text: "a".repeat(100) }] },
      { request: { limits: { maxStderrBytes: 100 } } }
    );
    const { record } = await run(rig);
    expect(record.streams.stderr.overflow).toBe(false);
    expect(record.streams.stderr.bytes).toBe(100);
    expect(record.status).toBe("OBSERVED");
  });

  it("깨진 프레임 → FRAME_ERROR", async () => {
    const rig = makeRig({ init: { kind: "raw", bytes: "garbage\r\n\r\n" } });
    const { record } = await run(rig);
    expectImmediate(rig, record, "FRAME_ERROR");
    expect(record.status_reasons).toContain("FRAME_ERROR:MALFORMED");
  });

  it("본문 도중에 끊긴 프레임이 EOF에 이르면 TRUNCATED", async () => {
    const rig = makeRig({ init: { kind: "raw", bytes: 'Content-Length: 50\r\n\r\n{"jsonrpc"' } });
    const { record } = await run(rig);
    // 이 시험의 자식은 스스로 끝나지 않으므로 초기화 시간 초과로 정리된다. 끊긴 프레임은 EOF 뒤에 드러난다.
    expect(["INIT_TIMEOUT", "FRAME_ERROR", "CHILD_EXITED_EARLY"]).toContain(
      record.termination.trigger
    );
    expect(record.status).toBe("NOT_OBSERVED");
  });

  it("initialize 쓰기가 거부되면 STDIN_ERROR", async () => {
    const rig = makeRig({ init: { kind: "result" }, failWriteNumber: 1 });
    const { record } = await run(rig);
    expectImmediate(rig, record, "STDIN_ERROR");
    expect(record.sent).toEqual([expect.objectContaining({ label: "initialize", ok: false })]);
  });

  it("shutdown 쓰기가 거부되면 STDIN_ERROR — exit는 보내지 않는다", async () => {
    const rig = makeRig({ init: { kind: "result" }, failWriteNumber: 2 });
    const { record } = await run(rig);
    expectImmediate(rig, record, "STDIN_ERROR");
    expect(methodsOf(rig.children[0])).toEqual(["initialize"]);
    expect(record.sent.map((s) => `${s.label}:${s.ok}`)).toEqual([
      "initialize:true",
      "shutdown:false",
    ]);
    expect(record.status_reasons).toContain("SHUTDOWN_EXIT_NOT_SENT");
  });

  it("exit 쓰기가 거부되면 STDIN_ERROR", async () => {
    const rig = makeRig({ init: { kind: "result" }, failWriteNumber: 3 });
    const { record } = await run(rig);
    expectImmediate(rig, record, "STDIN_ERROR");
    expect(methodsOf(rig.children[0])).toEqual(["initialize", "shutdown"]);
  });

  it("끝나지 않는 쓰기는 단계 한도(60초)에서 STDIN_ERROR로 끝난다 — 영원히 매달리지 않는다", async () => {
    const rig = makeRig({ init: { kind: "result" }, hangWriteNumber: 1 });
    const { record } = await run(rig);
    expectImmediate(rig, record, "STDIN_ERROR");
    expect(record.timeline.observation_ms).toBe(60_000);
    expect(record.sent).toEqual([expect.objectContaining({ label: "initialize", ok: false })]);
  });

  it("stdout 읽기가 도중에 오류로 끊기면 읽기 실패로 기록하고 정리는 스트림이 닫히지 않았다고 말한다", async () => {
    const frame = new TextEncoder().encode("");
    void frame;
    const rig = makeRig(
      { init: { kind: "silent" } },
      {
        decorate: (child) => {
          Object.defineProperty(child, "stdout", {
            value: {
              [Symbol.asyncIterator]() {
                return {
                  next: () => Promise.reject(new Error("pipe broken")),
                };
              },
            },
          });
        },
      }
    );
    const { record } = await run(rig);
    expect(record.streams.stdout.read_failed).toBe(true);
    expect(record.status).toBe("NOT_OBSERVED");
    expect(record.cleanup.streams_closed).toBe(false);
    expect(record.cleanup.ok).toBe(false);
  });
});

// ── 취소 ────────────────────────────────────────────────────────

describe("취소", () => {
  it("실행 도중 취소(A7): 곧바로 강제 종료하고 stdin을 닫지 않는다", async () => {
    const controller = new AbortController();
    const rig = makeRig(
      { init: { kind: "silent" }, stdinEnd: "ignore" },
      { request: { signal: controller.signal } }
    );
    rig.clock.setTimer(() => controller.abort(), 1_000);
    const { record } = await run(rig);
    expect(record.status).toBe("ABORTED");
    expect(record.termination.abort).toMatchObject({ condition: "A7", t_ms: 1_000 });
    expect(rig.children[0].endStdinCalls).toBe(0);
    expect(record.termination.kill_count).toBe(1);
    expect(record.timeline.observation_ms).toBe(1_000);
  });

  it("취소 리스너를 정리한다", async () => {
    const controller = new AbortController();
    const rig = makeRig(OK, { request: { signal: controller.signal } });
    await run(rig);
    controller.abort(); // 끝난 뒤의 취소는 아무 일도 하지 않는다
    expect(rig.children[0].killCalls).toHaveLength(0);
  });
});

// ── 라이브 중단 조건 ────────────────────────────────────────────

describe("라이브 중단 조건", () => {
  function expectAborted(rig: Rig, record: LspMinObservation, condition: string): void {
    const child = rig.children[0];
    expect(record.status).toBe("ABORTED");
    expect(record.termination).toMatchObject({
      trigger: "LIVE_ABORT",
      path: "FORCE_KILLED",
      stdin_closed_by_harness: false,
      kill_count: 1,
    });
    expect(record.termination.abort?.condition).toBe(condition);
    expect(child.endStdinCalls).toBe(0);
    expect(child.killCalls).toEqual(["SIGKILL"]);
    expectOnlyAllowedSends(child);
  }
  const waiting: MinScript = { init: { kind: "silent" }, stdinEnd: "ignore" };

  it("A1: stderr에 규칙 새로고침 로그", async () => {
    const rig = makeRig({
      ...waiting,
      stderrAt: [{ atMs: 500, text: "[00.04][INFO](default): Refreshing rules\n" }],
    });
    const { record } = await run(rig);
    expectAborted(rig, record, "A1");
    expect(record.termination.abort).toMatchObject({ detail: "refreshing rules", t_ms: 500 });
    expect(methodsOf(rig.children[0])).toEqual(["initialize"]);
    expect(record.timeline.observation_ms).toBe(500);
  });

  it("A1: 문구가 두 청크에 걸쳐도 잡는다", async () => {
    const rig = makeRig({
      ...waiting,
      stderrAt: [
        { atMs: 300, text: "[00.04][INFO](default): Refre" },
        { atMs: 400, text: "shing rules\n" },
      ],
    });
    const { record } = await run(rig);
    expectAborted(rig, record, "A1");
    expect(record.termination.abort?.t_ms).toBe(400);
  });

  it("A1: 개행 없이 끝나는 마지막 줄에서도 잡는다", async () => {
    const rig = makeRig({ ...waiting, stderrAt: [{ atMs: 200, text: "Scanning workspace" }] });
    const { record } = await run(rig);
    expectAborted(rig, record, "A1");
  });

  it("A1은 shutdown·exit를 보낸 뒤에도 유효하다(서버가 종료하지 않고 스캔을 시작한 경우)", async () => {
    const rig = makeRig({
      init: { kind: "result" },
      exit: "ignore",
      stderrAt: [{ atMs: 5_000, text: "Scanned open documents\n" }],
    });
    const { record } = await run(rig);
    expectAborted(rig, record, "A1");
    expect(methodsOf(rig.children[0])).toEqual(["initialize", "shutdown", "exit"]);
    expect(record.timeline.observation_ms).toBe(5_000);
  });

  it("A2: 다운로드·레지스트리 문구(대소문자 무시)", async () => {
    for (const text of ["Downloading rules from https://x\n", "using REGISTRY auto\n"]) {
      const rig = makeRig({ ...waiting, stderrAt: [{ atMs: 100, text }] });
      const { record } = await run(rig);
      expectAborted(rig, record, "A2");
    }
  });

  it("무해한 로그(시작 문구, 옵션 덤프)는 중단시키지 않는다", async () => {
    const rig = makeRig({
      init: { kind: "result", delayMs: 300 },
      stderrAt: [
        { atMs: 10, text: "Starting legacy language server\n" },
        { atMs: 20, text: '[00.02][DEBUG](default): Handling request: {"capabilities":{}}\n' },
      ],
    });
    const { record } = await run(rig);
    expect(record.status).toBe("OBSERVED");
    expect(record.coverage.live.stderr_patterns.hit).toBeNull();
  });

  it("A3: 수신기에 요청이 도착", async () => {
    const rig = makeRig(waiting);
    rig.clock.setTimer(() => {
      rig.receiver.hits = 1;
    }, 1_000);
    const { record } = await run(rig);
    expectAborted(rig, record, "A3");
    expect(record.termination.abort?.detail).toBe("HITS_INCREASED");
    expect(record.termination.abort?.t_ms).toBeGreaterThanOrEqual(1_000);
    expect(record.termination.abort?.t_ms).toBeLessThanOrEqual(
      1_000 + LSP_MIN_LIMITS.sampleIntervalMs
    );
  });

  it("A3: 실행 전부터 있던 건수는 기준선이라 중단하지 않는다 (늘어난 것만 센다)", async () => {
    const rig = makeRig({ init: { kind: "result", delayMs: 200 } });
    rig.receiver.hits = 7;
    const { record } = await run(rig);
    expect(record.status).toBe("OBSERVED");
    expect(record.coverage.live.receiver).toMatchObject({ baseline_hits: 7, final_hits: 7 });
  });

  it("A3: 수신기를 읽을 수 없게 되면 감시 불능으로 중단한다 (0건으로 치지 않는다)", async () => {
    const rig = makeRig(waiting);
    rig.clock.setTimer(() => {
      rig.receiver.throwOnObserve = true;
    }, 500);
    const { record } = await run(rig);
    expectAborted(rig, record, "A3");
    expect(record.termination.abort?.detail).toBe("RECEIVER_UNOBSERVABLE");
  });

  it("A3 사후: 마지막 표본과 종료 사이에 늘어난 건수는 중단하지 못했어도 관측 성립으로 치지 않는다", async () => {
    const rig = makeRig({ init: { kind: "result", delayMs: 10 } });
    // 첫 표본(40ms) 전에 끝난다. 끝난 뒤 최종 표본에서만 건수가 보인다.
    rig.receiver.onObserve = (call) => {
      if (call >= 2) rig.receiver.hits = 3; // 1: 기준선, 2 이후: 최종
    };
    const { record } = await run(rig);
    expect(record.status).toBe("NOT_OBSERVED");
    expect(record.status_reasons).toContain("RECEIVER_HITS_INCREASED");
  });

  describe("A4: 허용 이미지 밖의 프로세스", () => {
    it("자손에 cmd.exe", async () => {
      const rig = makeRig(waiting);
      rig.clock.setTimer(() => {
        rig.state.rows = () => [...tree(), row({ pid: 6000, ppid: 5000, name: "cmd.exe" })];
      }, 500);
      const { record } = await run(rig);
      expectAborted(rig, record, "A4");
      expect(record.termination.abort?.detail).toBe("cmd.exe");
      expect(record.coverage.live.processes.disallowed).toEqual(["cmd.exe"]);
    });

    it("루트 자신의 이미지가 허용 밖이어도 중단한다", async () => {
      const rig = makeRig(waiting);
      rig.state.rows = () => [row({ pid: 4242, ppid: 100, name: "node.exe" })];
      const { record } = await run(rig);
      expectAborted(rig, record, "A4");
    });

    it("이미지를 알 수 없는 행(이름도 경로도 없음)도 중단한다", async () => {
      const rig = makeRig(waiting);
      rig.state.rows = () => [...tree(), row({ pid: 6001, ppid: 4242 })];
      const { record } = await run(rig);
      expectAborted(rig, record, "A4");
      expect(record.termination.abort?.detail).toBe("UNKNOWN_IMAGE");
    });

    it("허용 이미지(python.exe, semgrep-core.exe, pysemgrep.exe, conhost.exe)만 있으면 중단하지 않는다", async () => {
      const rig = makeRig({ init: { kind: "result", delayMs: 400 } });
      rig.state.rows = () => [
        ...tree(),
        row({ pid: 5002, ppid: 4242, name: "pysemgrep.exe" }),
        row({ pid: 5003, ppid: 4242, name: "conhost.exe" }),
        row({ pid: 9000, ppid: 1, name: "unrelated.exe" }), // 자식 트리 밖이라 보지 않는다
      ];
      const { record } = await run(rig);
      expect(record.status).toBe("OBSERVED");
      expect(record.coverage.live.processes.images_seen).toEqual(
        expect.arrayContaining([
          "conhost.exe",
          "pysemgrep.exe",
          "python.exe",
          "semgrep-core.exe",
          "semgrep.exe",
        ])
      );
      expect(record.coverage.live.processes.max_descendants).toBe(4);
    });

    it("목록 조회가 연속 3번 실패하면 감시 불능으로 중단한다 (2번까지는 아니다)", async () => {
      const two = makeRig({ init: { kind: "result", delayMs: 1_000 } });
      let count = 0;
      two.lister = new SyntheticLister(async () => {
        count += 1;
        if (count >= 2 && count <= 3) return { ok: false as const, failure: "TIMEOUT" as const }; // 사전 확인(1) 뒤 2번 실패
        return { ok: true as const, snapshot: snapshotOf(count > 3 ? tree() : []) };
      });
      two.ports.lister = two.lister;
      const a = await run(two);
      expect(a.record.status).toBe("OBSERVED");
      expect(a.record.coverage.live.processes.failures).toBe(2);

      const three = makeRig(waiting);
      let n = 0;
      three.lister = new SyntheticLister(async () => {
        n += 1;
        return n === 1
          ? { ok: true as const, snapshot: snapshotOf([]) }
          : { ok: false as const, failure: "TIMEOUT" as const };
      });
      three.ports.lister = three.lister;
      const b = await run(three);
      expectAborted(three, b.record, "A4");
      expect(b.record.termination.abort?.detail).toBe("LIST_FAILED");
    });

    it("실패가 이어지다 한 번 성공하면 연속 횟수를 다시 센다", async () => {
      const rig = makeRig({ init: { kind: "result", delayMs: 1_000 } });
      let n = 0;
      rig.lister = new SyntheticLister(async () => {
        n += 1;
        // 1: 사전 확인(성공). 이후 표본: 실패 실패 성공 실패 실패 성공 ...
        const pattern = ["ok", "fail", "fail", "ok", "fail", "fail", "ok"];
        const kind =
          pattern[Math.min(n - 1, pattern.length - 1)] === "fail" && n - 1 < pattern.length
            ? "fail"
            : "ok";
        return kind === "fail"
          ? { ok: false as const, failure: "TIMEOUT" as const }
          : { ok: true as const, snapshot: snapshotOf(tree()) };
      });
      rig.ports.lister = rig.lister;
      const { record } = await run(rig);
      expect(record.status).not.toBe("ABORTED");
      expect(record.coverage.live.processes.failures).toBeGreaterThanOrEqual(4);
    });
  });

  describe("A5: 감시 폴더 안의 금지된 변경", () => {
    it("작업 영역에 파일이 생김", async () => {
      const rig = makeRig(waiting);
      rig.clock.setTimer(
        () => void rig.fs.writeFileExclusive(`${layout.workspace}/x.py`, new Uint8Array([1])),
        500
      );
      const { record } = await run(rig);
      expectAborted(rig, record, "A5");
      expect(record.termination.abort?.detail).toBe("WORKSPACE");
    });

    it("규칙 폴더에 파일이 생김", async () => {
      const rig = makeRig(waiting);
      rig.clock.setTimer(
        () => void rig.fs.writeFileExclusive(`${layout.rulesDir}/auto.yaml`, new Uint8Array([1])),
        500
      );
      const { record } = await run(rig);
      expectAborted(rig, record, "A5");
      expect(record.termination.abort?.detail).toBe("RULES_DIR");
    });

    it("홈에서 예상 위치 밖에 파일이 생김", async () => {
      const rig = makeRig(waiting);
      rig.clock.setTimer(
        () =>
          void rig.fs.writeFileExclusive(
            `${layout.homeDir}/.semgrep/settings.yml`,
            new Uint8Array([1])
          ),
        500
      );
      const { record } = await run(rig);
      expectAborted(rig, record, "A5");
      expect(record.termination.abort?.detail).toBe("HOME_DIR");
    });

    it("목록을 읽지 못하는 표본이 연속 3번 이어지면 감시 불능으로 중단한다", async () => {
      const rig = makeRig(waiting);
      rig.clock.setTimer(() => {
        rig.fs.listFilesRecursive = async () => {
          throw new Error("EIO");
        };
      }, 300);
      const { record } = await run(rig);
      expectAborted(rig, record, "A5");
      expect(record.termination.abort?.detail).toBe("LIST_FAILED");
    });

    it("감시 폴더 밖(상태 폴더의 로그·설정 파일)의 변화는 중단 사유가 아니고 감시한다고도 말하지 않는다", async () => {
      const rig = makeRig({ init: { kind: "result", delayMs: 300 } });
      rig.clock.setTimer(
        () =>
          void rig.fs.writeFileExclusive(`${layout.stateDir}/settings.yml`, new Uint8Array([1])),
        100
      );
      const { record } = await run(rig);
      expect(record.status).toBe("OBSERVED");
      expect(record.coverage.unobserved).toEqual(
        expect.arrayContaining([
          "FILESYSTEM_OUTSIDE_WATCHED_ROOTS",
          "STATE_DIR_CONTENTS_OTHER_THAN_HOME",
        ])
      );
      expect(JSON.stringify(record.coverage.post_hoc.watched_roots)).not.toContain("settings.yml");
    });
  });

  it("A8: stdout의 규칙 새로고침 알림 / 진단 게시 알림", async () => {
    for (const method of ["semgrep/rulesRefreshed", "textDocument/publishDiagnostics"]) {
      const rig = makeRig({
        ...waiting,
        stdoutAt: [{ atMs: 700, frame: { jsonrpc: "2.0", method, params: {} } }],
      });
      const { record } = await run(rig);
      expectAborted(rig, record, "A8");
      expect(record.termination.abort?.detail).toBe(method);
    }
  });

  it("중단이 이미 걸린 뒤의 다른 사유는 also에만 남는다", async () => {
    const rig = makeRig({
      ...waiting,
      stderrAt: [{ atMs: 100, text: "Refreshing rules\n" }],
      stdoutAt: [
        { atMs: 100, frame: { jsonrpc: "2.0", method: "textDocument/publishDiagnostics" } },
      ],
    });
    const { record } = await run(rig);
    expect(record.termination.trigger).toBe("LIVE_ABORT");
    expect(record.termination.abort?.condition).toBe("A1"); // 먼저 걸린 것
    expect(record.termination.kill_count).toBe(1);
  });
});

// ── 자손이 파이프를 쥔 경우 ─────────────────────────────────────

describe("자손의 파이프 보유", () => {
  it("자식은 끝났지만 출력 스트림이 닫히지 않고 자손이 남아 있다: 정리는 실패, 관측은 그대로", async () => {
    const rig = makeRig({ init: { kind: "result" }, exitKeepsStreamsOpen: true });
    rig.state.rows = () => [row({ pid: 7000, ppid: 4242, name: "python.exe" })]; // 부모가 끝난 뒤에도 남은 자손
    const { record } = await run(rig);
    expect(record.status).toBe("OBSERVED");
    expect(record.cleanup.ok).toBe(false);
    expect(record.cleanup.streams_closed).toBe(false);
    expect(record.cleanup.problems).toContain("STREAMS_NOT_CLOSED");
    expect(record.cleanup.descendants_alive_after).toBe(1);
    expect(record.cleanup.descendant_tracking).toBe("ROOT_GONE");
    expect(record.timeline.cleanup_ms).toBe(10_000); // 종료 확인 창 한 번
  });
});

// ── 관측 결과와 정리 결과의 분리 ────────────────────────────────

describe("관측 결과와 정리 결과를 따로 적는다", () => {
  it("관측은 성공 / dispose가 실패", async () => {
    const rig = makeRig({ init: { kind: "result" }, disposeFails: true });
    const { record } = await run(rig);
    expect(record.status).toBe("OBSERVED");
    expect(record.cleanup.ok).toBe(false);
    expect(record.cleanup.dispose).toBe("FAILED");
    expect(record.cleanup.problems).toContain("DISPOSE_FAILED");
  });

  it("라이브 중단이 일어나도 정리는 깔끔할 수 있다", async () => {
    const rig = makeRig({
      init: { kind: "silent" },
      stderrAt: [{ atMs: 100, text: "Rules refreshed\n" }],
    });
    const { record } = await run(rig);
    expect(record.status).toBe("ABORTED");
    expect(record.cleanup.ok).toBe(true);
  });

  it("중단했는데 자식이 죽지 않으면 둘 다 나쁘지만 각각 따로 기록된다", async () => {
    const rig = makeRig(
      { init: { kind: "silent" }, stderrAt: [{ atMs: 100, text: "Rules refreshed\n" }] },
      { child: { onKill: "ignore-all" } }
    );
    const { record } = await run(rig);
    expect(record.status).toBe("ABORTED");
    expect(record.cleanup.ok).toBe(false);
    // 종료 확인 창 안에서는 끝나지 않았다. 창이 지난 뒤 dispose가 끝낸 것은 확인된 종료로 치지 않는다.
    expect(record.cleanup.child_exit_confirmed).toBe(false);
    expect(record.cleanup.problems).toContain("KILL_NOT_OBSERVED");
  });

  it("띄우지 못한 경우: 정리할 것이 없어 깔끔하고 관측은 실패다", async () => {
    const rig = makeRig(OK);
    rig.port.failSpawnWith(new Error("ENOENT C:/secret/path"));
    const { record } = await run(rig);
    expect(record.status).toBe("NOT_OBSERVED");
    expect(record.status_reasons).toContain("SPAWN_FAILED");
    expect(record.termination).toMatchObject({ trigger: "SPAWN_FAILED", path: "NOT_SPAWNED" });
    expect(record.cleanup.ok).toBe(true);
    expect(JSON.stringify(record)).not.toContain("secret");
    expect(rig.clock.pendingTimers).toBe(0);
  });
});

// ── 허용 밖 메시지는 어떤 경로에서도 나가지 않는다 ──────────────

describe("허용되지 않은 메시지는 실제로 송신되지 않는다", () => {
  const scripts: [string, MinScript][] = [
    ["정상", OK],
    ["오류 응답", { init: { kind: "error" } }],
    ["InitializeError", { init: { kind: "initialize-error" } }],
    ["무응답", { init: { kind: "silent" }, stdinEnd: "ignore" }],
    ["exit 무시", { init: { kind: "result" }, exit: "ignore", stdinEnd: "ignore" }],
    [
      "서버 요청 선행",
      {
        init: {
          kind: "frames",
          frames: [
            { jsonrpc: "2.0", id: 1, method: "client/registerCapability", params: {} },
            { jsonrpc: "2.0", id: 2, method: "workspace/configuration", params: {} },
            { jsonrpc: "2.0", id: "lsp-min-init-1", result: GOOD_RESULT } as JsonRpcMessage,
          ],
        },
      },
    ],
    [
      "서버가 스캔 알림을 보냄",
      {
        init: { kind: "silent" },
        stdoutAt: [{ atMs: 10, frame: { jsonrpc: "2.0", method: "semgrep/rulesRefreshed" } }],
      },
    ],
  ];
  it.each(scripts)("%s", async (_n, script) => {
    const rig = makeRig(script);
    await run(rig);
    const child = rig.children[0];
    expectOnlyAllowedSends(child);
    const forbidden = [
      "initialized",
      "textDocument/didOpen",
      "textDocument/didSave",
      "semgrep/scanWorkspace",
      "semgrep/refreshRules",
      "debug/echo",
      "workspace/didChangeConfiguration",
    ];
    for (const method of methodsOf(child)) expect(forbidden).not.toContain(method);
    expect(child.stdinWrites.length).toBeLessThanOrEqual(3);
  });
});

// ── 타이머 정리 ─────────────────────────────────────────────────

describe("타이머", () => {
  it("끝난 뒤 이 실행기가 건 타이머는 하나도 남지 않는다", async () => {
    for (const script of [
      OK,
      { init: { kind: "error" } } as MinScript,
      { init: { kind: "silent" }, stdinEnd: "ignore" } as MinScript,
    ]) {
      const rig = makeRig(script);
      await run(rig);
      expect(rig.clock.pendingTimers).toBe(0);
    }
  });
});
