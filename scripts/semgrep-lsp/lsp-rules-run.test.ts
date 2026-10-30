import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { VirtualClock } from "./clock";
import { FrameDecoder } from "./framing";
import { buildLspMinEnv } from "./lsp-min";
import { LSP_RULES_PROBE_FILE, LSP_RULES_PROBE_SHA256, probePathOf } from "./lsp-rules";
import type { RulesObservation } from "./lsp-rules-record";
import { runRulesObservation, type RulesPorts, type RulesRequest } from "./lsp-rules-run";
import { FakeMetricsReceiver } from "./testing/fake-metrics";
import { MemoryArtifactHasher } from "./testing/memory-artifact";
import { MemoryFs } from "./testing/memory-fs";
import { crlf, progressCreate, refreshLines } from "./testing/rules-fixtures";
import { CORE, EXE, STUB_VERSION, URL as METRICS_URL, layout } from "./testing/rules-facts";
import { drive } from "./testing/stub-lsp";
import {
  FsBackedHasher,
  happyAfterInitialized,
  happyStdoutSteps,
  lineSteps,
  rulesPort,
  type RulesChild,
  type RulesScript,
  type RulesStep,
} from "./testing/stub-lsp-rules";
import { SyntheticLister, row, snapshotOf } from "./testing/synthetic-processes";
import type { JsonRpcMessage, ProcessRow } from "./types";

// ── 시험 장치 ───────────────────────────────────────────────────

const PROBE_BYTES = new Uint8Array(
  readFileSync(new URL("./data/lsp-rules-1-probe.yaml", import.meta.url))
);
const HOME_FINGERPRINT = `${layout.homeDir}/.semgrep/cache/fingerprinted_ignored_findings/ws.txt`;

function tree(): ProcessRow[] {
  return [
    row({ pid: 4242, ppid: 100, name: "semgrep.exe" }),
    row({ pid: 5000, ppid: 4242, name: "python.exe" }),
    row({ pid: 5001, ppid: 5000, name: "semgrep-core.exe" }),
  ];
}

/** 읽기 도중 오류로 끊을 수 있는 스트림(기존 LSP-MIN-1 시험과 같은 방식). */
function breakableStream(source: AsyncIterable<Uint8Array>): {
  stream: AsyncIterable<Uint8Array>;
  fail: (error: Error) => void;
} {
  const inner = source[Symbol.asyncIterator]();
  let failure: Error | null = null;
  let wake: ((error: Error) => void) | null = null;
  const stream: AsyncIterable<Uint8Array> = {
    [Symbol.asyncIterator]() {
      return {
        next: () =>
          new Promise<IteratorResult<Uint8Array>>((resolve, reject) => {
            if (failure) return reject(failure);
            wake = reject;
            inner.next().then(resolve, reject);
          }),
      };
    },
  };
  return {
    stream,
    fail: (error) => {
      failure = error;
      wake?.(error);
    },
  };
}

interface RigOptions {
  script?: (ctx: { fs: MemoryFs; hasher: FsBackedHasher }) => Partial<RulesScript>;
  request?: Partial<RulesRequest>;
  child?: { onKill?: "exit" | "ignore-sigterm" | "ignore-all" };
  decorate?: (child: RulesChild, clock: VirtualClock) => void;
  prepare?: (fs: MemoryFs) => Promise<void>;
}

function makeRig(options: RigOptions = {}) {
  const clock = new VirtualClock();
  const fs = new MemoryFs();
  const events: string[] = [];
  const originalMkdirp = fs.mkdirp.bind(fs);
  fs.mkdirp = async (path: string) => {
    events.push(`mkdirp:${path}`);
    return originalMkdirp(path);
  };
  const originalWrite = fs.writeFileExclusive.bind(fs);
  fs.writeFileExclusive = async (path: string, data: Uint8Array) => {
    events.push(`write:${path}`);
    return originalWrite(path, data);
  };
  const inner = new MemoryArtifactHasher({ [CORE]: "core-binary-v1" });
  const hasher = new FsBackedHasher(fs, inner);
  const script: RulesScript = {
    rulesDir: layout.rulesDir,
    init: { kind: "result" },
    ...options.script?.({ fs, hasher }),
  };
  const { port, children } = rulesPort(script, clock, {
    ...(options.child ? { child: options.child } : {}),
    ...(options.decorate ? { decorate: (child) => options.decorate?.(child, clock) } : {}),
  });
  const originalSpawn = port.spawn.bind(port);
  port.spawn = async (spec) => {
    events.push("spawn");
    return originalSpawn(spec);
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
  const ports: RulesPorts = { process: port, clock, fs, receiver, lister, hasher };
  const request: RulesRequest = {
    runId: "run-1",
    command: EXE,
    args: ["lsp", "--debug"],
    layout,
    env: buildLspMinEnv(layout, "C:/Windows", METRICS_URL),
    expectedVersion: STUB_VERSION,
    artifacts: [{ label: "semgrep-core", path: CORE }],
    probeBytes: PROBE_BYTES,
    ...options.request,
  };
  return {
    clock,
    fs,
    port,
    children,
    receiver,
    lister,
    hasher,
    ports,
    request,
    events,
    state,
    script,
  };
}
type Rig = ReturnType<typeof makeRig>;

async function run(
  rig: Rig
): Promise<{ record: RulesObservation; raw: { stdout: Uint8Array; stderr: Uint8Array } }> {
  if (rig.script.rulesDir !== layout.rulesDir) throw new Error("rig");
  return drive(rig.clock, runRulesObservation(rig.ports, rig.request));
}

function sentOf(child: RulesChild): JsonRpcMessage[] {
  const decoder = new FrameDecoder();
  const out: JsonRpcMessage[] = [];
  for (const chunk of child.stdinWrites) out.push(...decoder.push(chunk).messages);
  return out;
}
const methodsOf = (child: RulesChild): string[] => sentOf(child).map((m) => String(m.method));

/** 어느 경로로 끝났든 stdin에는 허용된 메시지만, 허용된 순서의 앞부분만 썼다. 서버 요청에는 응답하지 않았다. */
function expectOnlyAllowedSends(child: RulesChild): void {
  const methods = methodsOf(child);
  const allowed = ["initialize", "initialized", "shutdown", "exit"];
  expect(child.unexpected).toEqual([]);
  expect(methods).toEqual(allowed.slice(0, methods.length));
  for (const m of sentOf(child)) {
    expect(m.method, "id만 있는 응답이 없다").toBeDefined();
    if (m.method === "initialized") expect(m.params).toEqual({});
    if (m.method === "shutdown" || m.method === "exit") expect(m.params).toBeUndefined();
  }
}

const stderrLine = (atMs: number, text: string): RulesStep => ({ atMs, stderr: `${text}\r\n` });
const withExtra = (rulesDir: string, ...extra: RulesStep[]): RulesStep[] => [
  ...happyAfterInitialized(rulesDir),
  ...extra,
];
const edited = (fn: (l: string[]) => string[]): RulesStep[] => [
  ...lineSteps(fn(refreshLines({ rulesDir: layout.rulesDir }))),
  ...happyStdoutSteps(),
];

// ── 정상 경로 ───────────────────────────────────────────────────

describe("정상 경로", () => {
  it("initialize → initialized(1회) → 장벽 → 2초 감시 → shutdown → exit, 스스로 종료 코드 0, RULES_LOAD_OBSERVED", async () => {
    const rig = makeRig({
      script: ({ fs }) => ({
        onShutdown: () => void fs.writeFileExclusive(HOME_FINGERPRINT, new Uint8Array()),
      }),
    });
    const { record, raw } = await run(rig);
    expect(record.verdict).toBe("RULES_LOAD_OBSERVED");
    expect(record.conditions.map((c) => c.result)).toEqual(Array(13).fill("PASS"));
    expect(methodsOf(rig.children[0])).toEqual(["initialize", "initialized", "shutdown", "exit"]);
    expectOnlyAllowedSends(rig.children[0]);
    expect(record.sent.every((s) => s.ok)).toBe(true);
    expect(record.termination.exit).toEqual({ code: 0, signal: null });
    expect(record.termination.kill_count).toBe(0);
    expect(record.termination.stdin_closed_by_harness).toBe(false);
    expect(record.cleanup.ok).toBe(true);
    expect(record.provenance).toBe("stub");
    expect(record.probe.after_run_sha256).toBe(LSP_RULES_PROBE_SHA256);
    expect(raw.stderr.byteLength).toBe(record.streams.stderr.bytes);
    // 장벽 뒤 2초 감시가 지켜졌다: shutdown은 장벽 도달 + settleMs 이후에 나갔다.
    const shutdown = record.sent.find((s) => s.label === "shutdown");
    expect((shutdown?.tMs ?? 0) - (record.barrier.reached_at_ms ?? 0)).toBeGreaterThanOrEqual(2000);
    expect(record.barrier.settled_at_ms).toBeGreaterThanOrEqual(
      (record.barrier.reached_at_ms ?? 0) + 2000
    );
  });

  it("서버 진행 요청 2건에는 응답하지 않는다 (stdin에 id만 있는 메시지가 없다)", async () => {
    const rig = makeRig();
    const { record } = await run(rig);
    expect(record.server_messages.server_requests.allowed).toBe(2);
    expect(sentOf(rig.children[0]).filter((m) => m.method === undefined)).toEqual([]);
  });

  it("프로브를 만들기 전에 폴더를 만들고, 프로세스는 프로브를 쓴 뒤에 띄운다", async () => {
    const rig = makeRig();
    await run(rig);
    const write = rig.events.indexOf(`write:${probePathOf(layout)}`);
    const spawn = rig.events.indexOf("spawn");
    expect(write).toBeGreaterThan(-1);
    expect(rig.events.filter((e) => e.startsWith("mkdirp:")).length).toBe(5);
    expect(rig.events.slice(0, write).every((e) => e.startsWith("mkdirp:"))).toBe(true);
    expect(spawn).toBeGreaterThan(write);
    expect(await rig.fs.listFilesRecursive(layout.rulesDir)).toEqual([LSP_RULES_PROBE_FILE]);
  });
});

// ── initialize 응답 검증: 통과해야만 initialized ───────────────

describe("initialized는 응답이 VALID이고 버전이 MATCH일 때만 보낸다", () => {
  const goodResult = { capabilities: {}, serverInfo: { name: "Semgrep", version: STUB_VERSION } };

  const cases: [string, Partial<RulesScript>, Partial<RulesRequest>][] = [
    ["오류 응답", { init: { kind: "error" } }, {}],
    ["result 안의 InitializeError", { init: { kind: "initialize-error" } }, {}],
    ["capabilities 없는 result", { init: { kind: "result", result: {} } }, {}],
    [
      "서버 버전이 핀과 다르다",
      {
        init: {
          kind: "result",
          result: { capabilities: {}, serverInfo: { name: "Semgrep", version: "1.0.0" } },
        },
      },
      {},
    ],
    [
      "serverInfo가 없어 버전을 알 수 없다",
      { init: { kind: "result", result: { capabilities: {} } } },
      {},
    ],
    [
      "핀 버전을 받지 못했다",
      { init: { kind: "result", result: goodResult } },
      { expectedVersion: null },
    ],
    ["id가 다른 응답", { init: { kind: "result", result: goodResult, id: "someone-else" } }, {}],
  ];
  for (const [name, script, request] of cases) {
    it(`${name} → initialized를 보내지 않고 NOT_OBSERVED`, async () => {
      const rig = makeRig({ script: () => script, request });
      const { record } = await run(rig);
      expect(methodsOf(rig.children[0])).toEqual(["initialize"]);
      expect(record.sent.map((s) => s.label)).toEqual(["initialize"]);
      expect(record.status).toBe("NOT_OBSERVED");
      expect(record.verdict).not.toBe("RULES_LOAD_OBSERVED");
      expect(rig.children[0].endStdinCalls).toBeGreaterThanOrEqual(1);
      expectOnlyAllowedSends(rig.children[0]);
    });
  }

  it("응답이 모양은 멀쩡한데 서버가 초기화 오류를 stderr에 남겼으면 initialized를 보내지 않는다", async () => {
    const rig = makeRig({
      script: () => ({
        init: { kind: "result", result: goodResult, delayMs: 30 },
        beforeInitialized: [stderrLine(10, "[00.2][ERROR]: Error initializing server: boom")],
      }),
    });
    const { record } = await run(rig);
    expect(methodsOf(rig.children[0])).toEqual(["initialize"]);
    expect(record.verdict).toBe("NOT_OBSERVED:INIT_INVALID");
  });

  it("응답이 오지 않으면 초기화 한도(60초)에서 stdin을 닫고 NOT_OBSERVED, initialized는 보내지 않는다", async () => {
    const rig = makeRig({ script: () => ({ init: { kind: "silent" } }) });
    const { record } = await run(rig);
    expect(record.termination.trigger).toBe("INIT_TIMEOUT");
    expect(record.verdict).toBe("NOT_OBSERVED:INIT_NO_RESPONSE");
    expect(methodsOf(rig.children[0])).toEqual(["initialize"]);
    expect(record.termination.stdin_closed_by_harness).toBe(true);
  });

  it("initialize 직후 서버가 사라지면 CHILD_EXITED_EARLY, initialized는 보내지 않는다", async () => {
    const rig = makeRig({ script: () => ({ init: { kind: "exit", code: 1 } }) });
    const { record } = await run(rig);
    expect(methodsOf(rig.children[0])).toEqual(["initialize"]);
    expect(record.termination.trigger).toBe("CHILD_EXITED_EARLY");
    expect(record.status).toBe("NOT_OBSERVED");
  });
});

// ── 로딩 결과의 구분 ────────────────────────────────────────────

describe("로딩 결과의 구분 (정상 종료까지 가는 경우)", () => {
  const noRules = "[00.83][WARNING]: No rules to run! Not scanning anything.";
  const NO_TARGETS = "[00.83][WARNING]: No targets to scan! Not scanning anything.";

  it("규칙 0개 → LOAD_FAILED:NO_RULES_TO_RUN", async () => {
    const rig = makeRig({
      script: () => ({
        afterInitialized: edited((l) => l.map((x) => (x === NO_TARGETS ? noRules : x))),
      }),
    });
    const { record } = await run(rig);
    expect(record.verdict).toBe("LOAD_FAILED:NO_RULES_TO_RUN");
    expect(methodsOf(rig.children[0])).toEqual(["initialize", "initialized", "shutdown", "exit"]);
  });

  it("YAML 오류(로딩 시작·Got 1 errors·No rules) → LOAD_FAILED:LOCAL_CONFIG_ERRORS", async () => {
    const rig = makeRig({
      script: () => ({
        afterInitialized: edited((l) =>
          l
            .filter((x) => !x.includes("Done loading"))
            .map((x) =>
              x === NO_TARGETS
                ? noRules
                : x.includes("Got 0 errors")
                  ? x.replace("Got 0", "Got 1")
                  : x
            )
        ),
      }),
    });
    expect((await run(rig)).record.verdict).toBe("LOAD_FAILED:LOCAL_CONFIG_ERRORS");
  });

  it("다른 파일을 로딩했다 → NOT_CONFIRMED:LOADING_PATH_UNEXPECTED", async () => {
    const rig = makeRig({
      script: () => ({
        afterInitialized: edited((l) =>
          l.map((x) => x.replace("lsp-rules-1-probe.yaml", "somewhere-else.yaml"))
        ),
      }),
    });
    expect((await run(rig)).record.verdict).toBe("NOT_CONFIRMED:LOADING_PATH_UNEXPECTED");
  });

  it("stdout 알림이 두 번 → NOT_CONFIRMED:SIGNAL_DUPLICATED (실행은 정상 종료까지 간다)", async () => {
    const rig = makeRig({
      script: () => ({
        afterInitialized: withExtra(layout.rulesDir, {
          atMs: 100,
          stdout: { jsonrpc: "2.0", method: "semgrep/rulesRefreshed", params: {} },
        }),
      }),
    });
    const { record } = await run(rig);
    expect(record.verdict).toBe("NOT_CONFIRMED:SIGNAL_DUPLICATED");
    expect(methodsOf(rig.children[0])).toEqual(["initialize", "initialized", "shutdown", "exit"]);
  });

  it("맨줄이 두 번 → SIGNAL_DUPLICATED, 순서가 바뀌면 ORDER_VIOLATION", async () => {
    const dup = makeRig({
      script: () => ({
        afterInitialized: withExtra(layout.rulesDir, stderrLine(120, "Rules refreshed")),
      }),
    });
    expect((await run(dup)).record.verdict).toBe("NOT_CONFIRMED:SIGNAL_DUPLICATED");
    const swapped = makeRig({
      script: () => ({
        afterInitialized: edited((l) =>
          l.map((x) =>
            x === "Refreshing rules"
              ? "Rules refreshed"
              : x === "Rules refreshed"
                ? "Refreshing rules"
                : x
          )
        ),
      }),
    });
    expect((await run(swapped)).record.verdict).toBe("NOT_CONFIRMED:ORDER_VIOLATION");
  });

  it("머리말 모양을 읽지 못하거나 수준이 다르면 NOT_CONFIRMED:LOG_SHAPE_UNRECOGNIZED", async () => {
    const rig = makeRig({
      script: () => ({
        afterInitialized: edited((l) =>
          l.map((x) => (x === NO_TARGETS ? NO_TARGETS.replace("[WARNING]", "[INFO]") : x))
        ),
      }),
    });
    expect((await run(rig)).record.verdict).toBe("NOT_CONFIRMED:LOG_SHAPE_UNRECOGNIZED");
  });

  it("서버가 새로고침 도중 스스로 끝났다 → LOAD_FAILED:RULES_REFRESH_INCOMPLETE", async () => {
    const rig = makeRig({ script: () => ({ exitAfterInitializedMs: 30 }) });
    const { record } = await run(rig);
    expect(record.verdict).toBe("LOAD_FAILED:RULES_REFRESH_INCOMPLETE");
    expect(record.termination.kill_count).toBe(0);
    expect(methodsOf(rig.children[0])).toEqual(["initialize", "initialized"]);
  });
});

// ── 장벽과 시간 한도 ────────────────────────────────────────────

describe("장벽 한도와 전체 상한", () => {
  it("알림만 있고 나머지 신호가 없으면 장벽에 닿지 못한다: 60초에서 NOT_OBSERVED:RULES_TIMEOUT, 성공이 아니다", async () => {
    const rig = makeRig({
      script: () => ({ afterInitialized: [{ atMs: 20, stdout: happyStdoutSteps()[2].stdout }] }),
    });
    const { record } = await run(rig);
    expect(record.verdict).toBe("NOT_OBSERVED:RULES_TIMEOUT");
    expect(record.termination.trigger).toBe("RULES_TIMEOUT");
    expect(record.termination.abort?.condition).toBe("A9");
    expect(methodsOf(rig.children[0])).toEqual(["initialize", "initialized"]); // shutdown·exit는 보내지 않는다
    expect(record.termination.stdin_closed_by_harness).toBe(true);
    expect(record.timeline.observation_ms).toBeGreaterThanOrEqual(60_000);
    expect(record.timeline.observation_ms).toBeLessThan(75_000);
  });

  it("장벽 한도는 늘어나지 않는다: 요청이 한도를 올리면 거절한다", async () => {
    const rig = makeRig({ request: { limits: { rulesMs: 120_000 } } });
    const { record } = await run(rig);
    expect(record.verdict).toBe("NOT_ATTEMPTED:LIMIT_ABOVE_CAP:rulesMs");
    expect(rig.events).toEqual([]);
  });

  it("한도를 낮추는 것은 되고, 전체 상한이 단계 한도보다 먼저 닿으면 TOTAL_TIMEOUT (유예를 붙이지 않는다)", async () => {
    const rig = makeRig({
      script: () => ({ afterInitialized: [] }),
      request: { limits: { totalMs: 1_000 } },
    });
    const { record } = await run(rig);
    expect(record.termination.trigger).toBe("TOTAL_TIMEOUT");
    expect(record.verdict).toBe("NOT_OBSERVED:TOTAL_TIMEOUT");
    expect(record.timeline.observation_ms).toBeLessThanOrEqual(1_000 + 10_000); // 강제 종료 확인 창까지
  });

  it("종료 단계 시간 초과(exit를 무시하는 서버) → EXIT_TIMEOUT, stdin을 닫고 끝나지 않으면 강제 종료", async () => {
    const rig = makeRig({
      script: () => ({ exit: "ignore", stdinEnd: "ignore" }),
      child: { onKill: "exit" },
    });
    const { record } = await run(rig);
    expect(record.termination.trigger).toBe("EXIT_TIMEOUT");
    expect(record.termination.kill_count).toBe(1);
    expect(record.verdict).toBe("NOT_OBSERVED:EXIT_TIMEOUT");
  });

  it("종료 코드가 0이 아니면 성공이 아니다", async () => {
    const rig = makeRig({ script: () => ({ exit: "exit1" }) });
    expect((await run(rig)).record.verdict).toBe("NOT_OBSERVED:EXIT_CODE_NOT_ZERO");
  });
});

// ── 실시간 중단 ─────────────────────────────────────────────────

describe("실시간 중단 (stdin 닫기 없이 강제 종료, 판정은 ABORTED로 남는다)", () => {
  const abortCases: [string, RulesStep[], "A1" | "A2"][] = [
    ["엔진 실행", [stderrLine(100, "Running Semgrep with 1 rules")], "A1"],
    ["엔진 오류 줄", [stderrLine(100, "Semgrep errors: ")], "A1"],
    ["스캔 파일 수", [stderrLine(100, "Scanned 3 files")], "A1"],
    ["작업 영역 스캔", [stderrLine(100, "Scanning workspace")], "A1"],
    ["단일 파일 스캔", [stderrLine(100, "Scanning single file")], "A1"],
    [
      "진단 알림",
      [
        {
          atMs: 100,
          stdout: { jsonrpc: "2.0", method: "textDocument/publishDiagnostics", params: {} },
        },
      ],
      "A1",
    ],
    ["레지스트리", [stderrLine(100, "[00.9][INFO]: No rules source specified, using auto")], "A2"],
    [
      "내려받기",
      [stderrLine(100, "[00.9][INFO]: trying to download from https://example.invalid/x")],
      "A2",
    ],
    [
      "토큰 발견",
      [stderrLine(100, "[00.9][INFO]: Found API token in environment variables")],
      "A2",
    ],
    ["설정 파일 발견", [stderrLine(100, "[00.9][INFO]: Settings file found at C:\\x")], "A2"],
    ["download 문구", [stderrLine(100, "[00.9][DEBUG](default): download of x")], "A2"],
  ];
  for (const [name, extra, condition] of abortCases) {
    it(`${name} → ABORTED:${condition}`, async () => {
      const rig = makeRig({
        script: () => ({ afterInitialized: withExtra(layout.rulesDir, ...extra) }),
      });
      const { record } = await run(rig);
      expect(record.verdict).toBe(`ABORTED:${condition}`);
      expect(record.termination.kill_count).toBe(1);
      expect(record.termination.stdin_closed_by_harness).toBe(false);
      expectOnlyAllowedSends(rig.children[0]);
    });
  }

  it("장벽 뒤 2초 감시 안에 늦게 온 금지 신호도 잡는다", async () => {
    const rig = makeRig({
      script: () => ({
        afterInitialized: withExtra(
          layout.rulesDir,
          stderrLine(1_500, "Running Semgrep with 1 rules")
        ),
      }),
    });
    const { record } = await run(rig);
    expect(record.verdict).toBe("ABORTED:A1");
    expect(
      (record.termination.abort?.t_ms ?? 0) - (record.barrier.reached_at_ms ?? 0)
    ).toBeGreaterThan(1_000);
    expect(methodsOf(rig.children[0])).toEqual(["initialize", "initialized"]); // shutdown 전에 잡았다
  });

  it("initialized 이전에 나온 새로고침 줄·알림은 정상 신호가 아니다 → ABORTED:A1", async () => {
    const line = makeRig({
      script: () => ({
        init: { kind: "result", delayMs: 100 },
        beforeInitialized: [stderrLine(50, "Refreshing rules")],
      }),
    });
    const a = await run(line);
    expect(a.record.verdict).toBe("ABORTED:A1");
    expect(a.record.termination.abort?.detail).toBe("PRE_INITIALIZED:refreshingRules");
    expect(methodsOf(line.children[0])).toEqual(["initialize"]);
    const notification = makeRig({
      script: () => ({
        init: { kind: "result", delayMs: 100 },
        beforeInitialized: [{ atMs: 50, stdout: happyStdoutSteps()[2].stdout }],
      }),
    });
    expect((await run(notification)).record.termination.abort?.detail).toBe(
      "PRE_INITIALIZED:rulesRefreshed"
    );
  });

  it("서버 요청: 3건째, 허용 밖 메서드, 모양이 틀린 진행 요청은 모두 A6이고 응답하지 않는다", async () => {
    const third = makeRig({
      script: () => ({
        afterInitialized: withExtra(layout.rulesDir, {
          atMs: 62,
          stdout: progressCreate(3, "third"),
        }),
      }),
    });
    const a = await run(third);
    expect(a.record.verdict).toBe("ABORTED:A6");
    expect(a.record.termination.abort?.detail).toBe("TOO_MANY_PROGRESS_REQUESTS");
    const other = makeRig({
      script: () => ({
        afterInitialized: withExtra(layout.rulesDir, {
          atMs: 14,
          stdout: {
            jsonrpc: "2.0",
            id: 9,
            method: "workspace/configuration",
            params: { items: [] },
          },
        }),
      }),
    });
    expect((await run(other)).record.verdict).toBe("ABORTED:A6");
    const malformed = makeRig({
      script: () => ({
        afterInitialized: withExtra(layout.rulesDir, {
          atMs: 14,
          stdout: { jsonrpc: "2.0", id: 9, method: "window/workDoneProgress/create", params: {} },
        }),
      }),
    });
    const m = await run(malformed);
    expect(m.record.verdict).toBe("ABORTED:A6");
    for (const rig of [third, other, malformed]) expectOnlyAllowedSends(rig.children[0]);
  });

  it("작업 영역에 파일이 생기거나 규칙 폴더에 다른 파일이 생기면 A5", async () => {
    const workspace = makeRig({
      script: ({ fs }) => ({
        afterInitialized: withExtra(layout.rulesDir, {
          atMs: 20,
          run: () => void fs.writeFileExclusive(`${layout.workspace}/x.txt`, new Uint8Array()),
        }),
      }),
    });
    expect((await run(workspace)).record.verdict).toBe("ABORTED:A5");
    const rules = makeRig({
      script: ({ fs }) => ({
        afterInitialized: withExtra(layout.rulesDir, {
          atMs: 20,
          run: () => void fs.writeFileExclusive(`${layout.rulesDir}/second.yaml`, new Uint8Array()),
        }),
      }),
    });
    expect((await run(rules)).record.verdict).toBe("ABORTED:A5");
  });

  it("장벽에서 프로브 해시가 달라졌으면 A5", async () => {
    const rig = makeRig({
      script: ({ hasher }) => ({
        afterInitialized: withExtra(layout.rulesDir, {
          atMs: 30,
          run: () => hasher.overrides.set(probePathOf(layout), "f".repeat(64)),
        }),
      }),
    });
    const { record } = await run(rig);
    expect(record.verdict).toBe("ABORTED:A5");
    expect(record.termination.abort?.detail).toBe("PROBE_CHANGED");
  });

  it("실행 중 수신기 건수가 늘면 A3, 허용 밖 이미지가 보이면 A4", async () => {
    const hit = makeRig();
    hit.clock.setTimer(() => (hit.receiver.hits = 1), 200);
    expect((await run(hit)).record.verdict).toBe("ABORTED:A3");
    const image = makeRig();
    image.state.rows = () => [...tree(), row({ pid: 6000, ppid: 4242, name: "curl.exe" })];
    expect((await run(image)).record.verdict).toBe("ABORTED:A4");
  });

  it("취소 신호는 A7이다. 시작 전 취소는 NOT_ATTEMPTED, 실행 중 취소 뒤의 후속 사유는 판정을 바꾸지 않는다", async () => {
    const early = new AbortController();
    early.abort();
    const before = makeRig({ request: { signal: early.signal } });
    const b = await run(before);
    expect(b.record.verdict).toBe("NOT_ATTEMPTED:CANCELLED_BEFORE_START");
    expect(before.events).toEqual([]);
    const controller = new AbortController();
    const rig = makeRig({ request: { signal: controller.signal } });
    rig.clock.setTimer(() => controller.abort(), 20);
    const { record } = await run(rig);
    expect(record.verdict).toBe("ABORTED:A7");
    expect(record.termination.kill_count).toBe(1);
  });

  it("중단 뒤에 읽기 실패·강제 종료가 이어져도 ABORTED로 남는다 (후속 사유가 판정을 뒤집지 않는다)", async () => {
    const rig = makeRig({
      script: () => ({
        afterInitialized: withExtra(
          layout.rulesDir,
          stderrLine(100, "Running Semgrep with 1 rules")
        ),
      }),
      child: { onKill: "ignore-all" },
    });
    const { record } = await run(rig);
    expect(record.verdict).toBe("ABORTED:A1");
    expect(record.cleanup.ok).toBe(false); // 정리는 따로 실패로 기록된다
  });
});

// ── 읽기 실패와 쓰기 실패 ───────────────────────────────────────

describe("스트림 읽기·쓰기 실패는 판정을 성공으로 두지 않는다", () => {
  const breakAt =
    (which: "stdout" | "stderr", ms: number) =>
    (child: RulesChild, clock: VirtualClock): void => {
      const broken = breakableStream(child[which]);
      Object.defineProperty(child, which, { value: broken.stream });
      clock.setTimer(() => broken.fail(new Error("pipe broken")), ms);
    };

  it("로딩 도중 stderr 읽기 실패 → NOT_OBSERVED:STREAM_READ_FAILED", async () => {
    const rig = makeRig({ decorate: breakAt("stderr", 20) });
    const { record } = await run(rig);
    expect(record.verdict).toBe("NOT_OBSERVED:STREAM_READ_FAILED");
    expect(record.streams.stderr.read_failed).toBe(true);
  });

  it("장벽 뒤 감시 구간에서 stdout 읽기가 실패해도 이미 본 신호로 성공이 되지 않는다", async () => {
    const rig = makeRig({ decorate: breakAt("stdout", 500) });
    const { record } = await run(rig);
    expect(record.verdict).toBe("NOT_OBSERVED:STREAM_READ_FAILED");
    expect(record.barrier.reached_at_ms).not.toBeNull();
  });

  it("initialized 쓰기가 실패하면 NOT_OBSERVED:STDIN_ERROR, shutdown·exit는 보내지 않는다", async () => {
    const rig = makeRig({ script: () => ({ failWriteNumber: 2 }) });
    const { record } = await run(rig);
    expect(record.verdict).toBe("NOT_OBSERVED:STDIN_ERROR");
    expect(record.sent.map((s) => [s.label, s.ok])).toEqual([
      ["initialize", true],
      ["initialized", false],
    ]);
  });

  it("출력 상한을 넘기면 OUTPUT_LIMIT", async () => {
    const rig = makeRig({
      script: () => ({
        afterInitialized: withExtra(layout.rulesDir, stderrLine(100, "x".repeat(300_000))),
      }),
    });
    expect((await run(rig)).record.verdict).toBe("NOT_OBSERVED:OUTPUT_LIMIT");
  });
});

// ── 거절: 아무것도 만들지 않는다 ────────────────────────────────

describe("요청 검사와 준비 단계 거절 — 서버를 띄우지 않으면 NOT_ATTEMPTED", () => {
  async function refused(rig: Rig, reason: string): Promise<RulesObservation> {
    const { record } = await run(rig);
    expect(record.verdict).toBe(`NOT_ATTEMPTED:${reason}`);
    expect(rig.events.includes("spawn")).toBe(false);
    return record;
  }

  it("프로브 해시가 다르면 아무 폴더도 만들지 않는다", async () => {
    const wrong = PROBE_BYTES.slice();
    wrong[0] ^= 1;
    const rig = makeRig({ request: { probeBytes: wrong } });
    await refused(rig, "PROBE_HASH_MISMATCH");
    expect(rig.events).toEqual([]);
  });

  it("허용 목록 밖 환경 이름(SEMGREP_LOG_SRCS, 토큰)과 인자·명령 이름 불일치", async () => {
    const env = {
      ...buildLspMinEnv(layout, "C:/Windows", METRICS_URL),
      SEMGREP_LOG_SRCS: "semgrep.parsing",
    };
    const a = makeRig({ request: { env } });
    await refused(a, "ENV_NAME_NOT_ALLOWED:SEMGREP_LOG_SRCS");
    expect(a.events).toEqual([]);
    const token = makeRig({
      request: {
        env: { ...buildLspMinEnv(layout, "C:/Windows", METRICS_URL), SEMGREP_APP_TOKEN: "x" },
      },
    });
    await refused(token, "ENV_NAME_NOT_ALLOWED:SEMGREP_APP_TOKEN");
    const args = makeRig({ request: { args: ["lsp", "--debug", "--x-eio-ls"] } });
    await refused(args, "ARGS_NOT_FIXED");
    const name = makeRig({ request: { command: "C:/venv/Scripts/python.exe" } });
    await refused(name, "COMMAND_NAME_NOT_ALLOWED");
  });

  it("드라이브 문자로 시작하지 않는 절대 경로·상대 경로는 이 경계에서 거절한다", async () => {
    const rel = makeRig({ request: { command: "semgrep.exe" } });
    await refused(rel, "COMMAND_NOT_ABSOLUTE");
    const unix = makeRig({ request: { command: "/usr/bin/semgrep.exe" } });
    await refused(unix, "COMMAND_NOT_ABSOLUTE");
  });

  it("한도를 올리거나 알 수 없는 한도를 주면 거절한다", async () => {
    const rig = makeRig({ request: { limits: { settleMs: 5_000 } } });
    await refused(rig, "LIMIT_ABOVE_CAP:settleMs");
    const unknown = makeRig({
      request: { limits: { nope: 1 } as unknown as RulesRequest["limits"] },
    });
    await refused(unknown, "LIMIT_UNKNOWN:nope");
  });

  it("감시 폴더가 비어 있지 않으면(작업 영역·규칙 폴더) 프로브를 쓰지 않고 거절한다", async () => {
    const a = makeRig();
    await a.fs.writeFileExclusive(`${layout.workspace}/old.txt`, new Uint8Array());
    await refused(a, "WATCHED_ROOT_NOT_EMPTY:WORKSPACE");
    expect(a.events.includes(`write:${probePathOf(layout)}`)).toBe(false);
    const b = makeRig();
    await b.fs.writeFileExclusive(`${layout.rulesDir}/stale.yaml`, new Uint8Array());
    await refused(b, "WATCHED_ROOT_NOT_EMPTY:RULES_DIR");
    expect(b.events.includes(`write:${probePathOf(layout)}`)).toBe(false);
  });

  it("링크·junction으로 쓰기 경로가 작업 폴더 밖으로 새면 만들기 전에 거절한다", async () => {
    const rig = makeRig();
    const original = rig.fs.physicalKey.bind(rig.fs);
    rig.fs.physicalKey = async (path: string) =>
      path === layout.rulesDir || path.startsWith(`${layout.rulesDir}/`)
        ? "c:/elsewhere/outside"
        : original(path);
    await refused(rig, "PATH_ESCAPES_WORK");
    expect(rig.events).toEqual([]);
  });

  it("경로를 풀 수 없으면(안전하게 풀 수 없는 링크) 거절한다", async () => {
    const rig = makeRig();
    rig.fs.physicalKey = async () => {
      throw new Error("ELOOP");
    };
    await refused(rig, "PATH_RESOLVE_FAILED");
    expect(rig.events).toEqual([]);
  });

  it("복사한 프로브의 해시가 고정값과 다르면 프로세스를 띄우지 않는다", async () => {
    const rig = makeRig({
      script: ({ hasher }) => {
        hasher.overrides.set(probePathOf(layout), "e".repeat(64));
        return {};
      },
    });
    await refused(rig, "PROBE_COPY_HASH_MISMATCH");
  });

  it("수신기·프로세스 목록을 읽을 수 없으면 띄우지 않는다", async () => {
    const receiver = makeRig();
    receiver.receiver.observe = () => {
      throw new Error("down");
    };
    await refused(receiver, "RECEIVER_UNOBSERVABLE");
    const lister = makeRig();
    lister.state.failList = true;
    await refused(lister, "PROCESS_LISTER_UNAVAILABLE");
  });
});

// ── 파일 변화 ───────────────────────────────────────────────────

describe("실행 뒤 파일 확인", () => {
  it("shutdown에서 프로브가 바뀌면 NOT_OBSERVED:PROBE_CHANGED_DURING_RUN", async () => {
    const rig = makeRig({
      script: ({ hasher }) => ({
        onShutdown: () => hasher.overrides.set(probePathOf(layout), "d".repeat(64)),
      }),
    });
    expect((await run(rig)).record.verdict).toBe("NOT_OBSERVED:PROBE_CHANGED_DURING_RUN");
  });

  it("홈의 허용 위치 밖에 쓰면 성공이 아니다", async () => {
    const rig = makeRig({
      script: ({ fs }) => ({
        onShutdown: () =>
          void fs.writeFileExclusive(`${layout.homeDir}/settings.yml`, new Uint8Array()),
      }),
    });
    const { record } = await run(rig);
    expect(record.verdict).toMatch(/^(ABORTED:A5|NOT_OBSERVED:HOME_UNEXPECTED_WRITE)$/);
  });

  it("설치물 해시가 실행 중 바뀌면 성공이 아니다", async () => {
    const rig = makeRig({
      script: ({ hasher }) => ({
        onShutdown: () => hasher.inner.set(CORE, "core-binary-v2"),
      }),
    });
    const { record } = await run(rig);
    expect(record.status).toBe("NOT_OBSERVED");
    expect(record.coverage.post_hoc.artifact_hashes[0].comparison).toBe("CHANGED");
  });
});

describe("원문 바이트 보존", () => {
  it("raw.stderr는 CRLF를 포함한 원문 그대로다 (머리말·본문을 고치지 않는다)", async () => {
    const { raw } = await run(makeRig());
    const text = new TextDecoder().decode(raw.stderr);
    expect(text).toContain("[00.11][DEBUG](default): Executed as: osemgrep lsp --debug\r\n");
    expect(text).toContain(crlf(["Refreshing rules"]));
    expect(text).toContain("[00.83][WARNING]: No targets to scan! Not scanning anything.\r\n");
  });
});
