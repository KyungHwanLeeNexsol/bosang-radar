import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { VirtualClock } from "./clock";
import { evaluateTranscript } from "./evaluate";
import { runSession, type SessionConfig, type SessionLimits, type SessionRun } from "./session";
import type { ReasonCode } from "./status";
import {
  CONTROL_EXPECTATIONS,
  CONTROL_SCAN_ROOT,
  EXPECTED_RULES,
  LOADING_PATHS,
  PIN,
  SCOPE,
  TARGET_PATHS,
  assertConsistent,
  buildRecord,
  codesOf,
  controlInputs,
  happyTarget,
  targetInputs,
  targetSpec,
} from "./testing/evaluate-fixtures";
import { FakeChild, FakePort, type FakeChildOptions } from "./testing/fake-process";
import {
  StubLsp,
  drive,
  happyScript,
  settle,
  stubPort,
  type StubPatch,
  type StubScript,
} from "./testing/stub-lsp";
import { response, validateTranscript, type HappySpec } from "./testing/transcript-builder";
import type {
  Clock,
  JsonRpcMessage,
  ProcessPort,
  SpawnSpec,
  TimerHandle,
  Transcript,
  TranscriptEvent,
  Verdict,
} from "./types";

// 이 시험의 모든 트랜스크립트는 메모리 스텁(FakeChild + 스크립트 서버)에서 나온 합성 기록이다(provenance stub).
// 실제 Semgrep의 동작·로그 형식·Windows 호환성의 증거가 아니다.

const SPAWN: SpawnSpec = { command: "stub-server", args: [], cwd: "/tmp/stub", env: {} };

const LIMITS: SessionLimits = {
  init: 1000,
  rules: 2000,
  scan: 5000,
  echo: 1500,
  exit: 3000,
  killGrace: 200,
};

/** dispose 호출 횟수를 세고, 필요하면 던지는 자식. */
class CountingChild extends FakeChild {
  disposeCalls = 0;
  disposeError: Error | null = null;

  override async dispose(): Promise<void> {
    this.disposeCalls++;
    await super.dispose();
    if (this.disposeError) throw this.disposeError;
  }
}

/** dispose 뒤에도 스트림이 늦게(또는 끝내) 닫히는 자식. 실제 프로세스는 종료 뒤에 파이프가 닫히기도 한다. */
class LateCloseChild extends CountingChild {
  constructor(
    options: FakeChildOptions,
    private readonly clock: VirtualClock,
    private readonly closeAfterMs: number | null
  ) {
    super(options);
  }

  override async dispose(): Promise<void> {
    this.disposeCalls++;
    this.exit(null, "SIGKILL", { closeStreams: false });
    if (this.closeAfterMs !== null) {
      this.clock.setTimer(() => {
        this.closeStdout();
        this.closeStderr();
      }, this.closeAfterMs);
    }
  }
}

/** dispose해도 종료가 관측되지 않는 자식(exited가 이행되지 않는다). */
class NoExitChild extends CountingChild {
  override async dispose(): Promise<void> {
    this.disposeCalls++;
  }
}

/** 타이머 취소가 던지는 시계(실제 취소는 하고 나서 던진다 — 상태는 깨끗하게 남는다). */
class ThrowingCancelClock implements Clock {
  constructor(private readonly inner: VirtualClock) {}
  now(): number {
    return this.inner.now();
  }
  setTimer(fn: () => void, ms: number): TimerHandle {
    const handle = this.inner.setTimer(fn, ms);
    return {
      cancel: () => {
        handle.cancel();
        throw new Error("cancel failed");
      },
    };
  }
  sleep(ms: number): Promise<void> {
    return this.inner.sleep(ms);
  }
}

interface WorldOptions {
  childOptions?: FakeChildOptions;
  disposeError?: Error;
  limits?: Partial<SessionLimits>;
  spec?: HappySpec;
  mode?: "target" | "control";
  signal?: AbortSignal;
  wrapClock?: (clock: VirtualClock) => Clock;
  /** 기본 CountingChild 대신 쓸 자식 공장(clock은 가상 시계). */
  makeChild?: (options: FakeChildOptions, clock: VirtualClock) => CountingChild;
}

interface World {
  clock: VirtualClock;
  port: FakePort;
  stubs: StubLsp[];
  children: CountingChild[];
  script: StubScript;
  config: SessionConfig;
  run: SessionRun;
  start: () => Promise<Transcript>;
}

function controlSpec(): HappySpec {
  const diagnostics: Record<string, { severity: number; code: string; message: string }[]> = {};
  let total = 0;
  for (const c of CONTROL_EXPECTATIONS.cases) {
    diagnostics[c.path] = c.required.map((code) => ({ severity: 2, code, message: "m" }));
    total += c.required.length;
  }
  const paths = CONTROL_EXPECTATIONS.cases.map((c) => c.path);
  return {
    mode: "control",
    scanRoot: CONTROL_SCAN_ROOT,
    expectedPaths: paths,
    loadingPaths: LOADING_PATHS,
    serverVersion: PIN.semgrep.version,
    n: EXPECTED_RULES.length,
    s: 0,
    k: paths.length,
    m: total,
    diagnostics,
  };
}

function makeWorld(patch: StubPatch = {}, options: WorldOptions = {}): World {
  const clock = new VirtualClock();
  const mode = options.mode ?? "target";
  const spec = options.spec ?? (mode === "target" ? targetSpec() : controlSpec());
  const script = happyScript(spec, patch);
  const children: CountingChild[] = [];
  const { port, stubs } = stubPort(script, clock, {
    child: options.childOptions,
    makeChild: (childOptions) => {
      const child = options.makeChild
        ? options.makeChild(childOptions, clock)
        : new CountingChild(childOptions);
      if (options.disposeError) child.disposeError = options.disposeError;
      children.push(child);
      return child;
    },
  });
  const config: SessionConfig = { limits: { ...LIMITS, ...options.limits } };
  const run: SessionRun = {
    runId: "run-session-1",
    mode,
    targetSha: mode === "target" ? SCOPE.targetSha : null,
    initializeParams: { processId: null, rootUri: null, capabilities: {} },
    ...(options.signal ? { signal: options.signal } : {}),
  };
  const sessionClock = options.wrapClock ? options.wrapClock(clock) : clock;
  return {
    clock,
    port,
    stubs,
    children,
    script,
    config,
    run,
    start: () => runSession({ process: port, clock: sessionClock }, SPAWN, config, run),
  };
}

function verdictOf(t: Transcript): Verdict {
  const v = evaluateTranscript(t, t.meta.mode === "target" ? targetInputs() : controlInputs());
  assertConsistent(v);
  return v;
}

function kinds(t: Transcript): string[] {
  return t.events.map((e) => e.kind);
}

function ofKind<K extends TranscriptEvent["kind"]>(
  t: Transcript,
  kind: K
): Extract<TranscriptEvent, { kind: K }>[] {
  return t.events.filter((e): e is Extract<TranscriptEvent, { kind: K }> => e.kind === kind);
}

function sends(t: Transcript, label?: string) {
  return ofKind(t, "send").filter((e) => label === undefined || e.label === label);
}

/**
 * 모든 세션 시험이 공유하는 정리 단언. 실패 시험에서도 같은 자원 규칙이 지켜져야 한다:
 * 트랜스크립트가 일관되고, cleanup 사건이 정확히 한 건이며 마지막이고, 자식은 정확히 한 번 dispose됐고,
 * 대기 타이머가 0개이고, 두 수집기가 끝까지 읽었으며(stdout·stderr EOF 한 번씩), exit가 한 번 기록됐다.
 * 스캔 요청은 기록상 정확히 `scanSends`번(기본 1)이다.
 */
function expectCleanEnd(
  w: World,
  t: Transcript,
  options: { cleanupOk?: boolean; scanSends?: 0 | 1 } = {}
): void {
  expect(validateTranscript(t)).toEqual([]);
  expect(w.children).toHaveLength(1);
  expect(w.children[0].disposeCalls).toBe(1);
  expect(w.clock.pendingTimers).toBe(0);

  const cleanups = ofKind(t, "cleanup");
  expect(cleanups).toHaveLength(1);
  expect(t.events[t.events.length - 1].kind).toBe("cleanup");
  expect(cleanups[0].ok).toBe(options.cleanupOk ?? true);
  if (cleanups[0].ok) expect(cleanups[0].detail).toBeUndefined();

  expect(ofKind(t, "stdout-eof")).toHaveLength(1);
  expect(ofKind(t, "stderr-eof")).toHaveLength(1);
  expect(ofKind(t, "exit")).toHaveLength(1);

  expect(sends(t, "scan-workspace")).toHaveLength(options.scanSends ?? 1);
  // 서버가 실제로 받은 스캔 요청도 한 번을 넘지 않고, 기록된 송신보다 많지 않다.
  const received = w.stubs[0]?.count("semgrep/scanWorkspace") ?? 0;
  expect(received).toBeLessThanOrEqual(1);
  expect(received).toBeLessThanOrEqual(sends(t, "scan-workspace").length);
  // 스캔을 일으키는 다른 요청은 어떤 경우에도 보내지 않는다.
  for (const e of sends(t)) {
    expect(["textDocument/didOpen", "textDocument/didSave", "semgrep/refreshRules"]).not.toContain(
      e.message.method
    );
  }
  expect(sends(t, "initialized").length).toBeLessThanOrEqual(1);
}

async function run(w: World): Promise<Transcript> {
  return drive(w.clock, w.start());
}

function reasonCodes(v: Verdict): ReasonCode[] {
  return codesOf(v);
}

// ── 정상 경로 ───────────────────────────────────────────────────

describe("runSession — 정상 경로", () => {
  it("target: 트랜스크립트가 일관되고 evaluate가 COMPLETE로 판정한다", async () => {
    const w = makeWorld();
    const t = await run(w);
    expectCleanEnd(w, t);
    expect(t.meta).toEqual({
      schema: "semgrep-lsp-transcript/1",
      runId: "run-session-1",
      mode: "target",
      provenance: "stub",
      targetSha: SCOPE.targetSha,
    });
    const v = verdictOf(t);
    expect(v.status).toBe("COMPLETE");
    expect(v.reasons).toEqual([]);
    expect(v.candidate_gate.value).toBe(0);
    // 스텁 실행이므로 평가는 항상 UNVERIFIED다.
    expect(v.candidate_gate.evaluation).toBe("UNVERIFIED");
    // run.json 구성도 이 판정을 받아들인다(buildRunRecord의 일관성 검사 통과).
    expect(buildRecord(v, t, targetInputs()).provenance).toBe("stub");
  });

  it("control: PASS 가능한 합성 대조 집합에서 COMPLETE이고 단언이 PASS다", async () => {
    const w = makeWorld({}, { mode: "control" });
    const t = await run(w);
    expectCleanEnd(w, t);
    const v = verdictOf(t);
    expect(v.status).toBe("COMPLETE");
    expect(v.control_assertions.status).toBe("PASS");
    expect((v.observed.totals?.total ?? 0) > 0).toBe(true);
    expect(v.candidate_gate.value).toBeNull();
    expect(v.candidate_gate.evaluation).toBe("UNVERIFIED");
  });

  it("스텁과 평가기가 같은 재료를 본다: 세션 트랜스크립트의 관측 사실이 기준 트랜스크립트와 같다", async () => {
    const w = makeWorld();
    const t = await run(w);
    const reference = evaluateTranscript(happyTarget(), targetInputs());
    const actual = verdictOf(t);
    expect(actual.observed).toEqual(reference.observed);
    expect(actual.reasons).toEqual(reference.reasons);
  });

  it("서버가 받은 메시지 순서가 ADR D1 그대로고 scanWorkspace는 정확히 한 번이다", async () => {
    const w = makeWorld();
    const t = await run(w);
    const received = w.stubs[0].received.map((m) => m.method);
    expect(received).toEqual([
      "initialize",
      "initialized",
      "debug/echo",
      "semgrep/scanWorkspace",
      "debug/echo",
      "shutdown",
      "exit",
    ]);
    expect(w.stubs[0].count("semgrep/scanWorkspace")).toBe(1);
    expect(sends(t, "scan-workspace")).toHaveLength(1);
    expect(sends(t, "scan-workspace")[0].message.params).toEqual({ full: true });
    // 송신 라벨 순서
    expect(sends(t).map((e) => e.label)).toEqual([
      "initialize",
      "initialized",
      "echo-pre-scan",
      "scan-workspace",
      "echo-post-barrier",
      "shutdown",
      "exit",
    ]);
    // 정상 종료: 종료 신호를 보내지 않았고 exit는 하네스가 끝낸 것이 아니다.
    expect(ofKind(t, "kill")).toEqual([]);
    expect(ofKind(t, "exit")[0]).toMatchObject({ code: 0, signal: null, byHarness: false });
    expect(ofKind(t, "timeout")).toEqual([]);
    expect(ofKind(t, "cancelled")).toEqual([]);
  });

  it("scan 송신의 cursor는 그 시점까지 받은 stdout 메시지·stderr 줄 수다(initialize·rulesRefreshed·echo 응답 3건)", async () => {
    const w = makeWorld();
    const t = await run(w);
    const scan = sends(t, "scan-workspace")[0];
    expect(scan.cursor.stdout).toBe(3);
    const beforeScan = t.events.slice(0, scan.seq);
    expect(beforeScan.filter((e) => e.kind === "stdout-message")).toHaveLength(scan.cursor.stdout);
    expect(beforeScan.filter((e) => e.kind === "stderr-line")).toHaveLength(scan.cursor.stderr);
    // 단계 표지는 순서대로 PH1 → PH4다.
    expect(ofKind(t, "phase").map((e) => e.phase)).toEqual(["PH1", "PH2", "PH3", "PH4"]);
  });

  it("t는 주입된 시계의 값이다: 가상 시간 0에서 시작한 실행의 모든 t가 0 이상 단조 증가한다", async () => {
    const w = makeWorld();
    const t = await run(w);
    for (const e of t.events) expect(e.t).toBe(0);
  });

  it("stderr 소음이 많아도(수천 줄) 끝까지 읽고 COMPLETE를 유지한다 — 독립 수집기", async () => {
    // 세션이 붙기 전에 자식 stderr에 대량의 소음을 쌓아 둔다(가득 찬 파이프 흉내).
    const w = makeWorld(
      {},
      {
        makeChild: (childOptions) => {
          const child = new CountingChild(childOptions);
          for (let i = 0; i < 3000; i++) child.emitStderrLine(`noise ${i}`);
          return child;
        },
      }
    );
    const t = await run(w);
    expectCleanEnd(w, t);
    expect(ofKind(t, "stderr-line").filter((e) => e.text.startsWith("noise "))).toHaveLength(3000);
    expect(verdictOf(t).status).toBe("COMPLETE");
  });
});

// ── 시간 제한 (T1) ──────────────────────────────────────────────

describe("runSession — 시간 제한(T1, 가상 시계)", () => {
  it("T1a: 장벽을 영원히 보내지 않으면 timeout 사건 → 종료 → TIMEOUT(NO_BARRIER)", async () => {
    const w = makeWorld({ scan: { barrierAtMs: null } });
    const t = await run(w);
    expectCleanEnd(w, t);
    expect(ofKind(t, "timeout")).toEqual([
      expect.objectContaining({ phase: "PH3", waitingFor: "barrier", afterMs: LIMITS.scan }),
    ]);
    // 성공 경로가 아니다: echo-post를 보내지 않았고 종료 신호가 갔다.
    expect(sends(t, "echo-post-barrier")).toHaveLength(0);
    expect(ofKind(t, "kill").map((e) => e.signal)).toEqual(["SIGTERM"]);
    expect(ofKind(t, "exit")[0].byHarness).toBe(true);
    const v = verdictOf(t);
    expect(v.status).toBe("TIMEOUT");
    expect(reasonCodes(v)).toEqual(expect.arrayContaining(["NO_BARRIER", "TIMEOUT_SCAN"]));
    expect(v.complete).toBe(false);
  });

  it("T1b: 장벽은 오는데 echo 응답이 없으면 TIMEOUT(ECHO_MISSING)", async () => {
    const w = makeWorld({ echoPost: { reply: "none" } });
    const t = await run(w);
    expectCleanEnd(w, t);
    expect(ofKind(t, "timeout")).toEqual([
      expect.objectContaining({
        phase: "PH4",
        waitingFor: "echo-post-barrier-response",
        afterMs: LIMITS.echo,
      }),
    ]);
    // 한도 초과 뒤에는 shutdown·exit를 보내지 않고 곧바로 종료한다.
    expect(sends(t, "shutdown")).toHaveLength(0);
    const v = verdictOf(t);
    expect(v.status).toBe("TIMEOUT");
    expect(reasonCodes(v)).toContain("ECHO_MISSING");
  });

  it("T1c: 장벽이 한도 직전(W_scan − 1ms)에 오면 정상 진행해 COMPLETE다", async () => {
    const w = makeWorld({ scan: { barrierAtMs: LIMITS.scan - 1 } });
    const t = await run(w);
    expectCleanEnd(w, t);
    expect(ofKind(t, "timeout")).toEqual([]);
    const barrier = ofKind(t, "stderr-line").find((e) => e.text === "Scanning workspace complete");
    expect(barrier?.t).toBe(LIMITS.scan - 1);
    expect(verdictOf(t).status).toBe("COMPLETE");
  });

  it("T1d: 장벽이 한도 직후(W_scan + 1ms)에 오면 TIMEOUT이고 늦게 온 장벽은 기록되지 않는다", async () => {
    const w = makeWorld({ scan: { barrierAtMs: LIMITS.scan + 1 } });
    const t = await run(w);
    expectCleanEnd(w, t);
    expect(ofKind(t, "timeout")).toHaveLength(1);
    expect(ofKind(t, "stderr-line").some((e) => e.text === "Scanning workspace complete")).toBe(
      false
    );
    const v = verdictOf(t);
    expect(v.status).toBe("TIMEOUT");
    expect(reasonCodes(v)).toContain("NO_BARRIER");
  });

  it("한도는 경계에서 정확히 잰다: 장벽이 정확히 W_scan에 오면 같은 시각의 timeout이 먼저 걸린다(fail-closed)", async () => {
    // 같은 시각이면 먼저 등록된 타이머(대기 한도)가 먼저 돈다 — 경계는 한도 초과 쪽으로 닫는다.
    const w = makeWorld({ scan: { barrierAtMs: LIMITS.scan } });
    const t = await run(w);
    expectCleanEnd(w, t);
    expect(ofKind(t, "timeout")).toHaveLength(1);
    expect(verdictOf(t).status).toBe("TIMEOUT");
  });

  it("initialize 응답이 없으면 PH1 timeout → INIT_FAILED(TIMEOUT_INIT)이고 initialized를 보내지 않는다", async () => {
    const w = makeWorld({ init: { reply: "none" } });
    const t = await run(w);
    expectCleanEnd(w, t, { scanSends: 0 });
    expect(ofKind(t, "timeout")).toEqual([
      expect.objectContaining({
        phase: "PH1",
        waitingFor: "initialize-response",
        afterMs: LIMITS.init,
      }),
    ]);
    expect(sends(t, "initialized")).toHaveLength(0);
    const v = verdictOf(t);
    expect(v.status).toBe("INIT_FAILED");
    expect(reasonCodes(v)).toEqual(
      expect.arrayContaining(["TIMEOUT_INIT", "INIT_RESPONSE_MISSING"])
    );
  });

  it("rulesRefreshed 알림이 없으면 PH2 timeout → RULES_NOT_LOADED(TIMEOUT_RULES)이고 스캔하지 않는다", async () => {
    const w = makeWorld({ rules: { omitRulesRefreshed: true } });
    const t = await run(w);
    expectCleanEnd(w, t, { scanSends: 0 });
    expect(ofKind(t, "timeout")).toEqual([
      expect.objectContaining({
        phase: "PH2",
        waitingFor: "rules-refreshed+scanned-open-documents",
        afterMs: LIMITS.rules,
      }),
    ]);
    expect(sends(t, "echo-pre-scan")).toHaveLength(0);
    const v = verdictOf(t);
    expect(v.status).toBe("RULES_NOT_LOADED");
    expect(reasonCodes(v)).toContain("TIMEOUT_RULES");
  });

  it("Scanned open documents 줄이 없어도(stdout 알림만 와도) PH2 timeout이다 — 둘 다 있어야 전진한다", async () => {
    const w = makeWorld({ rules: { omitScannedOpen: true } });
    const t = await run(w);
    expectCleanEnd(w, t, { scanSends: 0 });
    expect(ofKind(t, "timeout")).toHaveLength(1);
    expect(sends(t, "echo-pre-scan")).toHaveLength(0);
    expect(verdictOf(t).status).toBe("RULES_NOT_LOADED");
  });

  it("echo-pre-scan에 응답이 없으면 PH2 timeout이고 스캔 요청을 보내지 않는다", async () => {
    const w = makeWorld({ echoPre: { reply: "none" } });
    const t = await run(w);
    expectCleanEnd(w, t, { scanSends: 0 });
    expect(ofKind(t, "timeout")).toEqual([
      expect.objectContaining({ phase: "PH2", waitingFor: "echo-pre-scan-response" }),
    ]);
    expect(w.stubs[0].count("semgrep/scanWorkspace")).toBe(0);
    expect(verdictOf(t).complete).toBe(false);
  });

  it("각 응답이 한도 직전(−1ms)에 오면 timeout 없이 진행한다", async () => {
    const w = makeWorld({
      init: { delayMs: LIMITS.init - 1 },
      echoPre: { delayMs: LIMITS.echo - 1 },
      echoPost: { delayMs: LIMITS.echo - 1 },
      rules: { logAtMs: LIMITS.rules - 1, notifyAtMs: LIMITS.rules - 1 },
    });
    const t = await run(w);
    expectCleanEnd(w, t);
    expect(ofKind(t, "timeout")).toEqual([]);
    expect(verdictOf(t).status).toBe("COMPLETE");
  });

  it("exit 알림 뒤 프로세스가 끝나지 않으면 PH4 timeout(process-exit) → 종료 → TIMEOUT_EXIT", async () => {
    const w = makeWorld({ exit: { never: true } });
    const t = await run(w);
    expectCleanEnd(w, t);
    expect(ofKind(t, "timeout")).toEqual([
      expect.objectContaining({ phase: "PH4", waitingFor: "process-exit", afterMs: LIMITS.exit }),
    ]);
    expect(ofKind(t, "kill").map((e) => e.signal)).toEqual(["SIGTERM"]);
    const v = verdictOf(t);
    expect(v.status).toBe("TIMEOUT");
    expect(reasonCodes(v)).toContain("TIMEOUT_EXIT");
  });

  it("SIGTERM을 무시하는 자식: SIGTERM → 유예(killGrace) → SIGKILL이 기록되고 정리까지 끝난다", async () => {
    const w = makeWorld({ exit: { never: true } }, { childOptions: { onKill: "ignore-sigterm" } });
    const t = await run(w);
    expectCleanEnd(w, t);
    const kills = ofKind(t, "kill");
    expect(kills.map((e) => e.signal)).toEqual(["SIGTERM", "SIGKILL"]);
    expect(kills[1].t - kills[0].t).toBe(LIMITS.killGrace);
    expect(w.children[0].killCalls).toEqual(["SIGTERM", "SIGKILL"]);
    expect(ofKind(t, "exit")[0]).toMatchObject({ signal: "SIGKILL", byHarness: true });
    expect(verdictOf(t).status).toBe("TIMEOUT");
  });

  it("모든 종료 신호를 무시하는 자식: SIGTERM·SIGKILL 뒤 dispose가 마무리하고 cleanup은 ok다", async () => {
    const w = makeWorld({ exit: { never: true } }, { childOptions: { onKill: "ignore-all" } });
    const t = await run(w);
    expectCleanEnd(w, t);
    expect(ofKind(t, "kill").map((e) => e.signal)).toEqual(["SIGTERM", "SIGKILL", "SIGKILL"]);
    expect(ofKind(t, "kill")[2].reason).toBe("dispose");
    expect(w.children[0].hasExitedNow).toBe(true);
  });
});

// ── 독립 reader (S12) ───────────────────────────────────────────

describe("runSession — reader 순서(S12)", () => {
  it("장벽 줄이 마지막 진단보다 먼저 처리돼도(stdout 지연) COMPLETE다", async () => {
    const w = makeWorld({ lag: { stdoutMs: 5 } });
    const t = await run(w);
    expectCleanEnd(w, t);
    // 실제로 뒤집혔는지 확인한다: 장벽의 seq가 마지막 게시보다 앞선다.
    const barrierSeq = ofKind(t, "stderr-line").find(
      (e) => e.text === "Scanning workspace complete"
    )?.seq as number;
    const publishes = ofKind(t, "stdout-message").filter(
      (e) => e.message.method === "textDocument/publishDiagnostics"
    );
    expect(publishes).toHaveLength(TARGET_PATHS.length);
    expect(barrierSeq).toBeLessThan(publishes[publishes.length - 1].seq);
    // echo-post 송신도 마지막 게시보다 먼저였지만 응답은 게시 뒤에 왔다.
    const echoSend = sends(t, "echo-post-barrier")[0].seq;
    const echoReply = ofKind(t, "stdout-message").find((e) => e.message.id === "echo-post-1");
    expect(echoSend).toBeLessThan(publishes[publishes.length - 1].seq);
    expect(echoReply?.seq as number).toBeGreaterThan(publishes[publishes.length - 1].seq);
    expect(verdictOf(t).status).toBe("COMPLETE");
  });

  it("반대로 stderr가 늦어도(장벽이 진단·echo 응답 대기보다 늦게 도착) COMPLETE다", async () => {
    const w = makeWorld({ lag: { stderrMs: 7 } });
    const t = await run(w);
    expectCleanEnd(w, t);
    const publishes = ofKind(t, "stdout-message").filter(
      (e) => e.message.method === "textDocument/publishDiagnostics"
    );
    const barrierSeq = ofKind(t, "stderr-line").find(
      (e) => e.text === "Scanning workspace complete"
    )?.seq as number;
    expect(publishes[publishes.length - 1].seq).toBeLessThan(barrierSeq);
    expect(verdictOf(t).status).toBe("COMPLETE");
  });

  it("양쪽이 모두 지연돼도(서로 다른 값) COMPLETE다", async () => {
    const w = makeWorld({ lag: { stdoutMs: 11, stderrMs: 3 } });
    const t = await run(w);
    expectCleanEnd(w, t);
    expect(verdictOf(t).status).toBe("COMPLETE");
  });

  it("control에서도 reader 순서를 뒤집은 실행이 COMPLETE이고 단언이 PASS다", async () => {
    const w = makeWorld({ lag: { stdoutMs: 5 } }, { mode: "control" });
    const t = await run(w);
    expectCleanEnd(w, t);
    const v = verdictOf(t);
    expect(v.status).toBe("COMPLETE");
    expect(v.control_assertions.status).toBe("PASS");
  });
});

// ── 늦은 진단, 오류 응답 ────────────────────────────────────────

describe("runSession — 기록의 충실성", () => {
  it("echo 응답 뒤에 오는 진단도 끝까지 읽어 기록하고 evaluate가 LATE_DIAGNOSTIC로 판정한다", async () => {
    const w = makeWorld({
      scan: { latePublishes: [{ path: TARGET_PATHS[0], diagnostics: [] }], lateAfterEchoMs: 2 },
      exit: { afterMs: 10 },
    });
    const t = await run(w);
    expectCleanEnd(w, t);
    const echoReply = ofKind(t, "stdout-message").find((e) => e.message.id === "echo-post-1");
    const late = ofKind(t, "stdout-message").filter(
      (e) =>
        e.message.method === "textDocument/publishDiagnostics" && e.seq > (echoReply?.seq as number)
    );
    expect(late).toHaveLength(1);
    const v = verdictOf(t);
    expect(reasonCodes(v)).toContain("DIAGNOSTIC_AFTER_ECHO");
    expect(v.status).toBe("LATE_DIAGNOSTIC");
  });

  it("응답은 id로 짝짓는다: 엉뚱한 id의 응답은 echo 응답이 되지 않고 RESPONSE_ID_UNMATCHED로 남는다", async () => {
    const w = makeWorld({ echoPost: { reply: "none" } });
    const pending = w.start();
    await settle(w.clock);
    w.children[0].emitStdoutFrame(response("stray-9", { phase: "post-barrier" }));
    const t = await drive(w.clock, pending);
    expectCleanEnd(w, t);
    expect(ofKind(t, "timeout")).toHaveLength(1);
    const v = verdictOf(t);
    expect(reasonCodes(v)).toEqual(
      expect.arrayContaining(["RESPONSE_ID_UNMATCHED", "ECHO_MISSING"])
    );
  });

  it("종료 코드가 0이 아니면 그대로 기록하고 evaluate가 ENGINE_FAILED(EXIT_NONZERO)로 판정한다", async () => {
    const w = makeWorld({ exit: { code: 7 } });
    const t = await run(w);
    expectCleanEnd(w, t);
    expect(ofKind(t, "exit")[0]).toMatchObject({ code: 7, byHarness: false });
    const v = verdictOf(t);
    expect(v.status).toBe("ENGINE_FAILED");
    expect(reasonCodes(v)).toContain("EXIT_NONZERO");
  });

  it("initialize가 오류 응답이면 initialized·스캔을 보내지 않고 정상 종료 절차(shutdown·exit)로 끝낸다", async () => {
    const w = makeWorld({ init: { reply: "error" } });
    const t = await run(w);
    expectCleanEnd(w, t, { scanSends: 0 });
    expect(sends(t, "initialized")).toHaveLength(0);
    expect(sends(t).map((e) => e.label)).toEqual(["initialize", "shutdown", "exit"]);
    expect(ofKind(t, "kill")).toEqual([]);
    const v = verdictOf(t);
    expect(v.status).toBe("INIT_FAILED");
    expect(reasonCodes(v)).toContain("INIT_ERROR_RESPONSE");
  });

  it("echo-pre-scan이 오류 응답이면 스캔을 보내지 않는다", async () => {
    const w = makeWorld({ echoPre: { reply: "error" } });
    const t = await run(w);
    expectCleanEnd(w, t, { scanSends: 0 });
    expect(w.stubs[0].count("semgrep/scanWorkspace")).toBe(0);
    const v = verdictOf(t);
    expect(v.complete).toBe(false);
    expect(reasonCodes(v)).toContain("ECHO_PRE_SCAN_MISSING");
  });

  it("echo-post가 오류 응답이면 shutdown·exit까지 가고 ECHO_MISSING으로 판정한다", async () => {
    const w = makeWorld({ echoPost: { reply: "error" } });
    const t = await run(w);
    expectCleanEnd(w, t);
    expect(sends(t, "exit")).toHaveLength(1);
    const v = verdictOf(t);
    expect(v.complete).toBe(false);
    expect(reasonCodes(v)).toContain("ECHO_MISSING");
  });

  it("규칙 파일 오류(Got N errors, N>0)를 그대로 기록하고 진행한다 — 판정은 evaluate의 몫이다", async () => {
    const w = makeWorld({ rules: { gotErrors: 3 } });
    const t = await run(w);
    expectCleanEnd(w, t);
    expect(ofKind(t, "stderr-line").some((e) => e.text.startsWith("Got 3 errors"))).toBe(true);
    const v = verdictOf(t);
    expect(v.status).toBe("RULE_LOAD_ERROR");
    expect(reasonCodes(v)).toContain("RULE_FILE_ERRORS_REPORTED");
  });
});

// ── 프레임 오류 ─────────────────────────────────────────────────

describe("runSession — 프레임 오류", () => {
  it("스캔 중 MALFORMED: 사건을 남기고 종료해 ENGINE_FAILED(MALFORMED_FRAME)로 판정된다", async () => {
    const w = makeWorld({ fault: { on: "scan", kind: "MALFORMED", atMs: 0 } });
    const t = await run(w);
    expectCleanEnd(w, t);
    const fe = ofKind(t, "stdout-frame-error");
    expect(fe).toHaveLength(1);
    expect(fe[0].error).toBe("MALFORMED");
    // 오류 앞에서 완성된 게시는 남아 있다.
    const pubs = ofKind(t, "stdout-message").filter(
      (e) => e.message.method === "textDocument/publishDiagnostics"
    );
    expect(pubs).toHaveLength(TARGET_PATHS.length);
    expect(sends(t, "echo-post-barrier")).toHaveLength(0);
    expect(ofKind(t, "kill").length).toBeGreaterThan(0);
    const v = verdictOf(t);
    expect(v.status).toBe("ENGINE_FAILED");
    expect(reasonCodes(v)).toContain("MALFORMED_FRAME");
  });

  it("스캔 중 TRUNCATED(잘린 프레임 뒤 EOF): TRUNCATED_FRAME으로 판정된다", async () => {
    const w = makeWorld({ fault: { on: "scan", kind: "TRUNCATED", atMs: 0 } });
    const t = await run(w);
    expectCleanEnd(w, t);
    expect(ofKind(t, "stdout-frame-error")[0].error).toBe("TRUNCATED");
    const v = verdictOf(t);
    expect(v.status).toBe("ENGINE_FAILED");
    expect(reasonCodes(v)).toContain("TRUNCATED_FRAME");
  });

  it("초기화 중 프레임 오류: FRAME_ERROR_DURING_INIT → INIT_FAILED", async () => {
    const w = makeWorld({
      init: { reply: "none" },
      fault: { on: "initialize", kind: "MALFORMED", atMs: 0 },
    });
    const t = await run(w);
    expectCleanEnd(w, t, { scanSends: 0 });
    const v = verdictOf(t);
    expect(v.status).toBe("INIT_FAILED");
    expect(reasonCodes(v)).toContain("FRAME_ERROR_DURING_INIT");
  });

  it("규칙 로딩 중 프레임 오류: FRAME_ERROR_DURING_RULES → RULES_NOT_LOADED", async () => {
    const w = makeWorld({
      echoPre: { reply: "none" },
      fault: { on: "echo-pre", kind: "TRUNCATED", atMs: 0 },
    });
    const t = await run(w);
    expectCleanEnd(w, t, { scanSends: 0 });
    const v = verdictOf(t);
    expect(reasonCodes(v)).toContain("FRAME_ERROR_DURING_RULES");
    expect(v.complete).toBe(false);
  });
});

// ── 프로세스 종료·stdin ─────────────────────────────────────────

describe("runSession — 프로세스 비정상 종료와 stdin 오류", () => {
  it("장벽 전에 서버가 죽으면(EOF) EXIT_BEFORE_BARRIER·ENGINE_FAILED이고 timeout 없이 끝난다", async () => {
    const w = makeWorld({
      scan: { barrierAtMs: 10 },
      crash: { on: "scan", afterMs: 1, code: 1, signal: null },
    });
    const t = await run(w);
    expectCleanEnd(w, t);
    expect(ofKind(t, "timeout")).toEqual([]);
    expect(ofKind(t, "kill")).toEqual([]);
    expect(ofKind(t, "exit")[0]).toMatchObject({ code: 1, byHarness: false });
    const v = verdictOf(t);
    expect(v.status).toBe("ENGINE_FAILED");
    expect(reasonCodes(v)).toEqual(expect.arrayContaining(["EXIT_BEFORE_BARRIER", "NO_BARRIER"]));
  });

  it("초기화 중 서버가 죽으면 EXIT_DURING_INIT → INIT_FAILED", async () => {
    const w = makeWorld({ crash: { on: "initialize", afterMs: 0, code: 2, signal: null } });
    const t = await run(w);
    expectCleanEnd(w, t, { scanSends: 0 });
    const v = verdictOf(t);
    expect(v.status).toBe("INIT_FAILED");
    expect(reasonCodes(v)).toContain("EXIT_DURING_INIT");
  });

  it("규칙 로딩 중 서버가 죽으면 EXIT_DURING_RULES", async () => {
    const w = makeWorld({
      rules: { omitRulesRefreshed: true },
      crash: { on: "initialized", afterMs: 3, code: 1, signal: null },
    });
    const t = await run(w);
    expectCleanEnd(w, t, { scanSends: 0 });
    expect(reasonCodes(verdictOf(t))).toContain("EXIT_DURING_RULES");
  });

  it("신호로 죽은 서버(code null, signal)도 그대로 기록한다", async () => {
    const w = makeWorld({
      crash: { on: "scan", afterMs: 1, code: null, signal: "SIGSEGV" },
      scan: { barrierAtMs: 10 },
    });
    const t = await run(w);
    expectCleanEnd(w, t);
    expect(ofKind(t, "exit")[0]).toMatchObject({ code: null, signal: "SIGSEGV", byHarness: false });
    expect(verdictOf(t).complete).toBe(false);
  });

  it("initialized 쓰기가 EPIPE로 거부되면 stdin-error를 남기고 종료한다(스캔 요청은 없다)", async () => {
    const w = makeWorld({ stdinFault: { after: "initialize" } });
    const t = await run(w);
    expectCleanEnd(w, t, { scanSends: 0 });
    const errs = ofKind(t, "stdin-error");
    expect(errs).toHaveLength(1);
    expect(errs[0].message).toContain("EPIPE");
    const v = verdictOf(t);
    expect(v.complete).toBe(false);
    expect(reasonCodes(v)).toContain("STDIN_WRITE_FAILED");
  });

  it("scanWorkspace 쓰기가 거부돼도 송신 기록은 한 번뿐이고 서버는 받지 못했다(재전송 없음)", async () => {
    const w = makeWorld({ stdinFault: { after: "echo-pre" } });
    const t = await run(w);
    expectCleanEnd(w, t, { scanSends: 1 });
    expect(w.stubs[0].count("semgrep/scanWorkspace")).toBe(0);
    expect(ofKind(t, "stdin-error")).toHaveLength(1);
    expect(verdictOf(t).complete).toBe(false);
  });

  it("exit 알림 쓰기가 거부되면 종료시킨다", async () => {
    const w = makeWorld({ stdinFault: { after: "echo-post" } });
    const t = await run(w);
    expectCleanEnd(w, t);
    expect(ofKind(t, "stdin-error")).toHaveLength(1);
    expect(ofKind(t, "kill").length).toBeGreaterThan(0);
    expect(verdictOf(t).complete).toBe(false);
  });
});

// ── 끝나지 않는 stdin 쓰기 ──────────────────────────────────────

/** 지정한 메시지의 writeStdin이 영원히 끝나지 않는 자식(꽉 찬 파이프 흉내). 서버에 전달할지는 고른다. */
class HangingWriteChild extends CountingChild {
  private readonly counts = new Map<string, number>();

  constructor(
    options: FakeChildOptions,
    private readonly hangOn: { method: string; nth?: number; deliver?: boolean }
  ) {
    super(options);
  }

  override writeStdin(data: Uint8Array): Promise<void> {
    const text = new TextDecoder().decode(data);
    const message = JSON.parse(text.slice(text.indexOf("\r\n\r\n") + 4)) as JsonRpcMessage;
    const method = message.method ?? "";
    const nth = (this.counts.get(method) ?? 0) + 1;
    this.counts.set(method, nth);
    if (method === this.hangOn.method && nth === (this.hangOn.nth ?? 1)) {
      if (this.hangOn.deliver) void super.writeStdin(data);
      return new Promise<void>(() => {});
    }
    return super.writeStdin(data);
  }
}

describe("runSession — 끝나지 않는 stdin 쓰기는 같은 한도로 묶인다", () => {
  const hang = (method: string, nth = 1) => ({
    makeChild: (options: FakeChildOptions): CountingChild =>
      new HangingWriteChild(options, { method, nth }),
  });

  it("initialize 쓰기가 끝나지 않으면 PH1 timeout(stdin-write) → 종료·정리 → TIMEOUT_INIT", async () => {
    const w = makeWorld({}, hang("initialize"));
    const t = await run(w);
    expectCleanEnd(w, t, { scanSends: 0 });
    expect(ofKind(t, "timeout")).toEqual([
      expect.objectContaining({ phase: "PH1", waitingFor: "stdin-write", afterMs: LIMITS.init }),
    ]);
    expect(ofKind(t, "kill").map((e) => e.signal)).toEqual(["SIGTERM"]);
    expect(ofKind(t, "exit")[0].byHarness).toBe(true);
    expect(sends(t, "initialized")).toHaveLength(0);
    const v = verdictOf(t);
    expect(v.complete).toBe(false);
    expect(reasonCodes(v)).toContain("TIMEOUT_INIT");
  });

  it("initialized 쓰기가 끝나지 않으면 PH2 timeout(stdin-write) → TIMEOUT_RULES", async () => {
    const w = makeWorld({}, hang("initialized"));
    const t = await run(w);
    expectCleanEnd(w, t, { scanSends: 0 });
    expect(ofKind(t, "timeout")).toEqual([
      expect.objectContaining({ phase: "PH2", waitingFor: "stdin-write", afterMs: LIMITS.rules }),
    ]);
    const v = verdictOf(t);
    expect(v.complete).toBe(false);
    expect(reasonCodes(v)).toContain("TIMEOUT_RULES");
  });

  it("echo-pre 쓰기가 끝나지 않으면 PH2 timeout(stdin-write) → TIMEOUT_RULES", async () => {
    const w = makeWorld({}, hang("debug/echo", 1));
    const t = await run(w);
    expectCleanEnd(w, t, { scanSends: 0 });
    expect(ofKind(t, "timeout")).toEqual([
      expect.objectContaining({ phase: "PH2", waitingFor: "stdin-write", afterMs: LIMITS.echo }),
    ]);
    expect(reasonCodes(verdictOf(t))).toContain("TIMEOUT_RULES");
  });

  it("scanWorkspace 쓰기가 끝나지 않으면 PH3 timeout(stdin-write)이고 스캔은 재전송되지 않는다", async () => {
    const w = makeWorld({}, hang("semgrep/scanWorkspace"));
    const t = await run(w);
    expectCleanEnd(w, t, { scanSends: 1 });
    expect(ofKind(t, "timeout")).toEqual([
      expect.objectContaining({ phase: "PH3", waitingFor: "stdin-write", afterMs: LIMITS.scan }),
    ]);
    expect(w.stubs[0].count("semgrep/scanWorkspace")).toBe(0);
    expect(sends(t, "echo-post-barrier")).toHaveLength(0);
    const v = verdictOf(t);
    expect(v.complete).toBe(false);
    expect(reasonCodes(v)).toContain("TIMEOUT_SCAN");
  });

  it("echo-post 쓰기가 끝나지 않으면 PH4 timeout(stdin-write)이고 shutdown·exit를 보내지 않는다", async () => {
    const w = makeWorld({}, hang("debug/echo", 2));
    const t = await run(w);
    expectCleanEnd(w, t);
    expect(ofKind(t, "timeout")).toEqual([
      expect.objectContaining({ phase: "PH4", waitingFor: "stdin-write", afterMs: LIMITS.echo }),
    ]);
    expect(sends(t, "shutdown")).toHaveLength(0);
    expect(sends(t, "exit")).toHaveLength(0);
    const v = verdictOf(t);
    expect(v.complete).toBe(false);
    expect(reasonCodes(v)).toContain("TIMEOUT_SCAN");
  });

  it("shutdown 쓰기가 끝나지 않으면 exit 한도로 끊고 TIMEOUT_EXIT, exit는 보내지 않는다", async () => {
    const w = makeWorld({}, hang("shutdown"));
    const t = await run(w);
    expectCleanEnd(w, t);
    expect(ofKind(t, "timeout")).toEqual([
      expect.objectContaining({
        phase: "PH4",
        waitingFor: "exit:stdin-write",
        afterMs: LIMITS.exit,
      }),
    ]);
    expect(sends(t, "exit")).toHaveLength(0);
    expect(reasonCodes(verdictOf(t))).toContain("TIMEOUT_EXIT");
  });

  it("exit 쓰기가 끝나지 않으면 TIMEOUT_EXIT이고 종료 신호로 끝낸다", async () => {
    const w = makeWorld({}, hang("exit"));
    const t = await run(w);
    expectCleanEnd(w, t);
    expect(ofKind(t, "timeout")).toEqual([
      expect.objectContaining({ waitingFor: "exit:stdin-write", afterMs: LIMITS.exit }),
    ]);
    expect(ofKind(t, "kill").length).toBeGreaterThan(0);
    expect(reasonCodes(verdictOf(t))).toContain("TIMEOUT_EXIT");
  });

  it("쓰기 한도는 응답을 기다리는 한도와 같은 타이머다: 쓰기가 끝나면 이후 대기는 본래 대상으로 센다", async () => {
    const w = makeWorld({ scan: { barrierAtMs: null } });
    const t = await run(w);
    expect(ofKind(t, "timeout")).toEqual([
      expect.objectContaining({ phase: "PH3", waitingFor: "barrier", afterMs: LIMITS.scan }),
    ]);
  });

  it("쓰기 완료 통지가 응답보다 늦어도(서버는 이미 받았다) 단계 전환·정상 완료에 영향이 없다", async () => {
    const w = makeWorld(
      {},
      {
        makeChild: (options) =>
          new HangingWriteChild(options, { method: "initialized", deliver: true }),
      }
    );
    const t = await run(w);
    expect(ofKind(t, "timeout")).toEqual([]);
    expect(ofKind(t, "phase").map((e) => e.phase)).toEqual(["PH1", "PH2", "PH3", "PH4"]);
    expect(verdictOf(t).status).toBe("COMPLETE");
    expectCleanEnd(w, t);
  });
});

// ── 띄우기 실패 ─────────────────────────────────────────────────

describe("runSession — spawn 실패", () => {
  it("spawn이 거부되면 spawn-failed 사건만 남고 cleanup 사건은 없다", async () => {
    const w = makeWorld();
    w.port.failSpawnWith(new Error("spawn stub-server ENOENT"));
    const t = await run(w);
    expect(kinds(t)).toEqual(["spawn-failed"]);
    expect(ofKind(t, "spawn-failed")[0].message).toContain("ENOENT");
    expect(ofKind(t, "cleanup")).toEqual([]);
    expect(validateTranscript(t)).toEqual([]);
    expect(w.port.spawnCalls).toHaveLength(1);
    expect(w.children).toHaveLength(0);
    expect(w.clock.pendingTimers).toBe(0);
    const v = verdictOf(t);
    expect(v.status).toBe("INIT_FAILED");
    expect(reasonCodes(v)).toContain("SPAWN_FAILED");
    expect(v.complete).toBe(false);
  });
});

// ── 취소 ────────────────────────────────────────────────────────

describe("runSession — 취소(AbortSignal)", () => {
  const cases: {
    name: string;
    patch: StubPatch;
    phase: "PH1" | "PH2" | "PH3" | "PH4";
    reason: ReasonCode;
    scanSends: 0 | 1;
  }[] = [
    {
      name: "PH1(initialize 응답 대기)",
      patch: { init: { reply: "none" } },
      phase: "PH1",
      reason: "CANCELLED_DURING_INIT",
      scanSends: 0,
    },
    {
      name: "PH2(규칙 로딩 대기)",
      patch: { rules: { omitRulesRefreshed: true } },
      phase: "PH2",
      reason: "CANCELLED_DURING_RULES",
      scanSends: 0,
    },
    {
      name: "PH3(장벽 대기)",
      patch: { scan: { barrierAtMs: null } },
      phase: "PH3",
      reason: "CANCELLED_DURING_SCAN",
      scanSends: 1,
    },
    {
      name: "PH4(echo 응답 대기)",
      patch: { echoPost: { reply: "none" } },
      phase: "PH4",
      reason: "CANCELLED_DURING_SCAN",
      scanSends: 1,
    },
    {
      name: "PH4(종료 대기)",
      patch: { exit: { never: true } },
      phase: "PH4",
      reason: "CANCELLED_DURING_SCAN",
      scanSends: 1,
    },
  ];

  for (const c of cases) {
    it(`${c.name}에서 취소하면 cancelled 사건 → 종료 → 정리 성공이고 성공 경로로 가지 않는다`, async () => {
      const controller = new AbortController();
      const w = makeWorld(c.patch, { signal: controller.signal });
      const pending = w.start();
      await settle(w.clock);
      // 아직 끝나지 않았다(대기 중).
      let done = false;
      void pending.then(() => {
        done = true;
      });
      await settle(w.clock);
      expect(done).toBe(false);
      controller.abort();
      const t = await drive(w.clock, pending);

      expectCleanEnd(w, t, { scanSends: c.scanSends });
      expect(ofKind(t, "cancelled")).toEqual([expect.objectContaining({ phase: c.phase })]);
      expect(ofKind(t, "timeout")).toEqual([]);
      expect(ofKind(t, "kill").map((e) => e.signal)).toEqual(["SIGTERM"]);
      expect(ofKind(t, "exit")[0].byHarness).toBe(true);
      // 취소 시각은 시계가 가리키는 시각이다(한도에 닿기 전).
      expect(ofKind(t, "cancelled")[0].t).toBeLessThan(LIMITS.exit);
      const v = verdictOf(t);
      expect(v.complete).toBe(false);
      expect(reasonCodes(v)).toContain(c.reason);
    });
  }

  it("시작 전에 이미 취소된 신호: 프로세스를 띄우지 않고 cancelled(PH0)만 남긴다", async () => {
    const controller = new AbortController();
    controller.abort();
    const w = makeWorld({}, { signal: controller.signal });
    const t = await run(w);
    expect(kinds(t)).toEqual(["cancelled"]);
    expect(ofKind(t, "cancelled")[0].phase).toBe("PH0");
    expect(w.port.spawnCalls).toHaveLength(0);
    expect(validateTranscript(t)).toEqual([]);
    expect(w.clock.pendingTimers).toBe(0);
    const v = verdictOf(t);
    expect(v.complete).toBe(false);
    expect(reasonCodes(v)).toContain("CANCELLED_DURING_INIT");
  });

  it("spawn을 기다리는 동안 취소되면 띄워진 자식을 곧바로 종료·정리한다", async () => {
    const controller = new AbortController();
    const w = makeWorld({}, { signal: controller.signal });
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slowPort: ProcessPort = {
      provenance: "stub",
      spawn: async (spec) => {
        await gate;
        return w.port.spawn(spec);
      },
    };
    const pending = runSession({ process: slowPort, clock: w.clock }, SPAWN, w.config, w.run);
    await settle(w.clock);
    controller.abort();
    release();
    const t = await drive(w.clock, pending);
    expectCleanEnd(w, t, { scanSends: 0 });
    expect(ofKind(t, "cancelled")[0].phase).toBe("PH0");
    expect(sends(t)).toEqual([]);
    expect(ofKind(t, "kill").length).toBeGreaterThan(0);
  });

  it("실행이 끝난 뒤의 abort는 아무 영향이 없다(리스너가 정리된다)", async () => {
    const controller = new AbortController();
    const w = makeWorld({}, { signal: controller.signal });
    const t = await run(w);
    const before = t.events.length;
    controller.abort();
    await settle(w.clock);
    expect(t.events).toHaveLength(before);
    expect(verdictOf(t).status).toBe("COMPLETE");
  });
});

// ── 정리 실패 ───────────────────────────────────────────────────

describe("runSession — 정리", () => {
  it("dispose가 던지면 cleanup ok:false → CLEANUP_FAILED, 그래도 한 번만 호출하고 이행한다", async () => {
    const w = makeWorld({}, { disposeError: new Error("boom") });
    const t = await run(w);
    expectCleanEnd(w, t, { cleanupOk: false });
    expect(ofKind(t, "cleanup")[0].detail).toContain("dispose");
    const v = verdictOf(t);
    expect(reasonCodes(v)).toContain("CLEANUP_FAILED");
    expect(v.status).toBe("ENGINE_FAILED");
    expect(v.complete).toBe(false);
  });

  it("타이머를 취소하지 못하면 cleanup ok:false다", async () => {
    const w = makeWorld({}, { wrapClock: (clock) => new ThrowingCancelClock(clock) });
    const t = await run(w);
    // 시계 래퍼가 실제 취소는 하므로 대기 타이머는 0개다.
    expectCleanEnd(w, t, { cleanupOk: false });
    expect(ofKind(t, "cleanup")[0].detail).toContain("타이머");
    expect(reasonCodes(verdictOf(t))).toContain("CLEANUP_FAILED");
  });

  it("cleanup detail에는 환경변수 값이 들어가지 않는다(spawn 사양의 env를 넣어도)", async () => {
    const w = makeWorld({}, { disposeError: new Error("boom") });
    const secretSpawn: SpawnSpec = {
      ...SPAWN,
      env: { SEMGREP_APP_TOKEN: "s3cr3t-token-value-xyz" },
    };
    const t = await drive(
      w.clock,
      runSession({ process: w.port, clock: w.clock }, secretSpawn, w.config, w.run)
    );
    expect(JSON.stringify(t)).not.toContain("s3cr3t-token-value-xyz");
  });

  it("dispose 뒤에 스트림이 늦게 닫혀도 EOF를 기다렸다가 cleanup을 마지막에 기록한다", async () => {
    const w = makeWorld(
      { exit: { never: true } },
      {
        childOptions: { onKill: "ignore-all" },
        makeChild: (o, clock) => new LateCloseChild(o, clock, 50),
      }
    );
    const t = await run(w);
    expectCleanEnd(w, t);
    const cleanup = ofKind(t, "cleanup")[0];
    const eofs = [...ofKind(t, "stdout-eof"), ...ofKind(t, "stderr-eof")];
    expect(eofs).toHaveLength(2);
    for (const eof of eofs) expect(eof.seq).toBeLessThan(cleanup.seq);
    expect(cleanup.t).toBeGreaterThanOrEqual(eofs[0].t);
  });

  it("스트림이 끝내 닫히지 않으면 killGrace 뒤 cleanup ok:false다", async () => {
    const w = makeWorld(
      { exit: { never: true } },
      {
        childOptions: { onKill: "ignore-all" },
        makeChild: (o, clock) => new LateCloseChild(o, clock, null),
      }
    );
    const t = await run(w);
    expect(validateTranscript(t)).toEqual([]);
    expect(w.children[0].disposeCalls).toBe(1);
    expect(w.clock.pendingTimers).toBe(0);
    const cleanup = ofKind(t, "cleanup");
    expect(cleanup).toHaveLength(1);
    expect(cleanup[0].ok).toBe(false);
    expect(cleanup[0].detail).toContain("스트림");
    expect(t.events[t.events.length - 1].kind).toBe("cleanup");
    expect(reasonCodes(verdictOf(t))).toContain("CLEANUP_FAILED");
  });

  it("dispose해도 자식의 종료가 관측되지 않으면 cleanup ok:false이고 exit 사건이 없다", async () => {
    const w = makeWorld(
      { exit: { never: true } },
      {
        childOptions: { onKill: "ignore-all" },
        makeChild: (o) => new NoExitChild(o),
      }
    );
    const t = await run(w);
    expect(validateTranscript(t)).toEqual([]);
    expect(ofKind(t, "exit")).toEqual([]);
    const cleanup = ofKind(t, "cleanup");
    expect(cleanup).toHaveLength(1);
    expect(cleanup[0].ok).toBe(false);
    expect(cleanup[0].detail).toContain("종료를 관측하지 못했다");
    expect(w.clock.pendingTimers).toBe(0);
    expect(verdictOf(t).complete).toBe(false);
  });

  it("kill()이 던져도 정리는 끝까지 간다(cleanup ok:false)", async () => {
    const w = makeWorld({ exit: { never: true } });
    const w2 = w;
    // 첫 자식의 kill을 던지게 바꾼다.
    const original = w2.port.spawn.bind(w2.port);
    w2.port.spawn = async (spec) => {
      const child = (await original(spec)) as CountingChild;
      child.kill = () => {
        throw new Error("EPERM");
      };
      return child;
    };
    const t = await run(w2);
    expectCleanEnd(w2, t, { cleanupOk: false });
    expect(ofKind(t, "cleanup")[0].detail).toContain("종료 신호");
  });
});

// ── 프로그래머 오류는 띄우기 전에 던진다 ────────────────────────

describe("runSession — 잘못된 설정", () => {
  async function expectThrowsBeforeSpawn(
    mutate: (config: SessionConfig, run: SessionRun) => void
  ): Promise<void> {
    const w = makeWorld();
    mutate(w.config, w.run);
    await expect(w.start()).rejects.toThrow(TypeError);
    expect(w.port.spawnCalls).toHaveLength(0);
    expect(w.clock.pendingTimers).toBe(0);
  }

  it("0·음수·NaN 한도", async () => {
    await expectThrowsBeforeSpawn((c) => {
      c.limits.init = 0;
    });
    await expectThrowsBeforeSpawn((c) => {
      c.limits.scan = -1;
    });
    await expectThrowsBeforeSpawn((c) => {
      c.limits.killGrace = Number.NaN;
    });
  });

  it("빈 runId·알 수 없는 mode", async () => {
    await expectThrowsBeforeSpawn((_c, r) => {
      r.runId = "";
    });
    await expectThrowsBeforeSpawn((_c, r) => {
      (r as { mode: string }).mode = "both";
    });
  });

  it("full이 true가 아닌 scanParams", async () => {
    await expectThrowsBeforeSpawn((_c, r) => {
      r.scanParams = { full: false };
    });
  });

  it("직렬화할 수 없는 initializeParams", async () => {
    await expectThrowsBeforeSpawn((_c, r) => {
      const loop: Record<string, unknown> = {};
      loop.self = loop;
      r.initializeParams = loop;
    });
  });
});

// ── 구조 ────────────────────────────────────────────────────────

describe("session.ts — 구조", () => {
  const source = readFileSync(fileURLToPath(new URL("./session.ts", import.meta.url)), "utf8");
  const code = source
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
    .join("\n");

  it("전역 시간 함수·환경변수·프로세스 모듈을 쓰지 않는다", () => {
    expect(code).not.toMatch(/\bDate\.now\b/);
    expect(code).not.toMatch(/\bsetTimeout\b|\bsetInterval\b|\bsetImmediate\b|\bperformance\./);
    expect(code).not.toMatch(/process\.env/);
    expect(code).not.toMatch(/child_process|node:fs|node:net|fetch\(|node:http/);
  });

  it("스캔을 일으키는 다른 요청 이름을 보내는 코드가 없다", () => {
    expect(code).not.toMatch(/textDocument\/didOpen|textDocument\/didSave|semgrep\/refreshRules/);
  });
});
