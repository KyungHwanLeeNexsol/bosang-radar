import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { SystemClock } from "./clock";
import { evaluateTranscript } from "./evaluate";
import { EVIDENCE_FILE_NAMES } from "./evidence";
import { runHarness, type HarnessOptions } from "./harness";
import { createNodeProcessPort } from "./process-node";
import { computeScope } from "./scope";
import { runSession, type SessionLimits, type SessionRun } from "./session";
import type { ReasonCode } from "./status";
import {
  SCOPE,
  assertConsistent,
  buildRecord,
  codesOf,
  qualifiedReference,
  targetInputs,
  targetSpec,
} from "./testing/evaluate-fixtures";
import { MemoryFs } from "./testing/memory-fs";
import { MemoryGit } from "./testing/memory-git";
import {
  SYNTHETIC_CACHE_DIR,
  SYNTHETIC_HARNESS_ROOT,
  SYNTHETIC_WHEEL,
  buildSyntheticData,
  harnessFilesAt,
  syntheticFingerprints,
} from "./testing/synthetic-data";
import { happyScript, type StubPatch, type StubScript } from "./testing/stub-lsp";
import { validateTranscript } from "./testing/transcript-builder";
import { expectedUri } from "./uri";
import type {
  ChildHandle,
  Clock,
  ProcessPort,
  SpawnSpec,
  TimerHandle,
  Transcript,
  TranscriptEvent,
} from "./types";

// 이 시험은 실제 Node 자식 프로세스(testing/stub-child.mjs)를 띄우지만, 그 자식은 Semgrep이 아니다: 스크립트대로
// 프로토콜을 흉내 낼 뿐이다. 포트의 provenance는 항상 "stub"이므로 얻은 기록은 SYNTHETIC·UNVERIFIED다.
// 이 시험이 증명하는 것은 어댑터·세션·정리 경로가 진짜 파이프 위에서도 동작한다는 점뿐이며, 실제 Semgrep의 동작과
// Windows 호환성에 대한 증거가 아니다. 모든 자식은 스스로 끝나는 감시(20초)가 있고 시험이 끝나면 정리된다.

const STUB_CHILD = fileURLToPath(new URL("./testing/stub-child.mjs", import.meta.url));

// 실제 시계를 쓰므로 정상 경로의 한도는 넉넉하게, 의도적 시간 초과 시험에서만 짧게 잡는다.
const GENEROUS: SessionLimits = {
  init: 10_000,
  rules: 10_000,
  scan: 10_000,
  echo: 10_000,
  exit: 10_000,
  killGrace: 5_000,
};

// ── 도구 ────────────────────────────────────────────────────────

const pids: number[] = [];
const nodePort = createNodeProcessPort({ provenance: "stub" });

/** 띄운 자식의 pid를 모두 기록하는 포트(시험이 끝날 때 남은 것이 없는지 확인·정리하려는 것이다). */
const recordingPort: ProcessPort = {
  provenance: nodePort.provenance,
  async spawn(spec: SpawnSpec): Promise<ChildHandle> {
    const child = await nodePort.spawn(spec);
    if (child.pid !== null) pids.push(child.pid);
    return child;
  },
};

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as { code?: string }).code === "EPERM";
  }
}

afterEach(() => {
  // 안전망: 시험이 중간에 실패해도 자식이 남지 않게 한다.
  for (const pid of pids.splice(0)) {
    if (alive(pid)) {
      try {
        process.kill(pid);
      } catch {
        // 이미 끝났다
      }
    }
  }
});

function childScript(script: StubScript, extra: Record<string, unknown> = {}): string {
  const publishes = script.scan.publishes.map((p) => ({
    uri: expectedUri(script.scanRoot, p.path),
    diagnostics: p.diagnostics ?? [],
  }));
  const body = {
    serverVersion: script.serverVersion,
    loadingPaths: script.rules.loadingPaths,
    gotErrors: script.rules.gotErrors,
    n: script.scan.n,
    s: script.scan.s,
    k: script.scan.k,
    m: script.scan.m,
    engineErrorsText: script.scan.engineErrorsText,
    publishes,
    noBarrier: script.scan.barrierAtMs === null,
    ...extra,
  };
  return Buffer.from(JSON.stringify(body), "utf8").toString("base64");
}

function spawnSpec(script: StubScript, extra: Record<string, unknown> = {}): SpawnSpec {
  return {
    command: process.execPath,
    args: [STUB_CHILD, childScript(script, extra)],
    cwd: tmpdir(),
    env: {},
  };
}

interface Outcome {
  transcript: Transcript;
  spawnedPid: number | null;
}

async function runStub(options: {
  patch?: StubPatch;
  extra?: Record<string, unknown>;
  limits?: Partial<SessionLimits>;
  signal?: AbortSignal;
  clock?: Clock;
  spec?: SpawnSpec;
}): Promise<Outcome> {
  const script = happyScript(targetSpec(), options.patch ?? {});
  const run: SessionRun = {
    runId: "run-integration-1",
    mode: "target",
    targetSha: SCOPE.targetSha,
    initializeParams: { processId: null, rootUri: null, capabilities: {} },
    ...(options.signal ? { signal: options.signal } : {}),
  };
  const transcript = await runSession(
    { process: recordingPort, clock: options.clock ?? new SystemClock() },
    options.spec ?? spawnSpec(script, options.extra),
    { limits: { ...GENEROUS, ...options.limits } },
    run
  );
  const spawned = transcript.events.find((e) => e.kind === "spawn");
  return { transcript, spawnedPid: spawned?.kind === "spawn" ? spawned.pid : null };
}

function ofKind<K extends TranscriptEvent["kind"]>(
  t: Transcript,
  kind: K
): Extract<TranscriptEvent, { kind: K }>[] {
  return t.events.filter((e): e is Extract<TranscriptEvent, { kind: K }> => e.kind === kind);
}

/** 어떤 결과든 지켜져야 하는 자원 규칙: 기록이 일관되고, 자식이 정리됐고, cleanup이 정확히 한 건이며 마지막이다. */
function expectCleanEnd(o: Outcome): void {
  const t = o.transcript;
  expect(validateTranscript(t)).toEqual([]);
  expect(typeof o.spawnedPid).toBe("number");
  expect(alive(o.spawnedPid as number)).toBe(false);
  const cleanups = ofKind(t, "cleanup");
  expect(cleanups).toHaveLength(1);
  expect(cleanups[0].ok).toBe(true);
  expect(t.events[t.events.length - 1].kind).toBe("cleanup");
  expect(ofKind(t, "exit")).toHaveLength(1);
  expect(ofKind(t, "stdout-eof")).toHaveLength(1);
  expect(ofKind(t, "stderr-eof")).toHaveLength(1);
}

function verdictOf(t: Transcript) {
  const v = evaluateTranscript(t, targetInputs());
  assertConsistent(v);
  return v;
}

function reasons(t: Transcript): ReasonCode[] {
  return codesOf(verdictOf(t));
}

// ── (a) 정상 경로 ───────────────────────────────────────────────

describe("process-node + 스텁 자식 — 정상 경로", () => {
  it("(a) 진짜 파이프 위에서 세션이 끝까지 돌고 evaluate가 COMPLETE로 판정한다(기록은 stub·SYNTHETIC·UNVERIFIED)", async () => {
    const o = await runStub({});
    const t = o.transcript;
    expectCleanEnd(o);
    expect(t.meta.provenance).toBe("stub");
    expect(ofKind(t, "timeout")).toEqual([]);
    expect(ofKind(t, "kill")).toEqual([]);
    expect(ofKind(t, "exit")[0]).toMatchObject({ code: 0, byHarness: false });
    expect(ofKind(t, "send").map((e) => e.label)).toEqual([
      "initialize",
      "initialized",
      "echo-pre-scan",
      "scan-workspace",
      "echo-post-barrier",
      "shutdown",
      "exit",
    ]);
    const v = verdictOf(t);
    expect(v.reasons).toEqual([]);
    expect(v.status).toBe("COMPLETE");
    const record = buildRecord(v, t, targetInputs());
    expect(record.provenance).toBe("stub");
    expect(record.trust).toBe("SYNTHETIC");
    expect(record.candidate_gate.evaluation).toBe("UNVERIFIED");
  });

  it("(d) stderr 1MB가 쏟아져도 stdout 응답이 막히지 않는다(두 스트림은 독립으로 비워진다)", async () => {
    const o = await runStub({ extra: { largeStderrBytes: 1_000_000 } });
    const t = o.transcript;
    expectCleanEnd(o);
    expect(ofKind(t, "timeout")).toEqual([]);
    const lines = ofKind(t, "stderr-line").filter((e) => e.text.startsWith("padding-line"));
    expect(lines.length).toBeGreaterThanOrEqual(10_000);
    // 채움 줄은 인식되지 않는 줄이지만 그 자체가 판정을 바꾸지는 않는다.
    expect(ofKind(t, "stdout-message").length).toBeGreaterThan(0);
    expect(verdictOf(t).status).toBe("COMPLETE");
  });
});

// ── (b)(c) 시간 초과와 종료 ─────────────────────────────────────

describe("process-node + 스텁 자식 — 시간 초과와 강제 종료", () => {
  it("(b) 장벽을 보내지 않으면 TIMEOUT 경로를 타고 자식은 실제로 사라진다", async () => {
    const o = await runStub({ patch: { scan: { barrierAtMs: null } }, limits: { scan: 600 } });
    const t = o.transcript;
    expectCleanEnd(o);
    expect(ofKind(t, "timeout")).toEqual([
      expect.objectContaining({ phase: "PH3", waitingFor: "barrier" }),
    ]);
    expect(ofKind(t, "kill").length).toBeGreaterThan(0);
    expect(ofKind(t, "exit")[0].byHarness).toBe(true);
    expect(ofKind(t, "send").some((e) => e.label === "echo-post-barrier")).toBe(false);
    const v = verdictOf(t);
    expect(v.complete).toBe(false);
    expect(v.status).toBe("TIMEOUT");
    expect(codesOf(v)).toEqual(expect.arrayContaining(["NO_BARRIER", "TIMEOUT_SCAN"]));
  });

  it("(c) exit를 무시하는 자식은 종료 신호로 끝나고 기록에 남는다", async () => {
    const o = await runStub({ extra: { ignoreExit: true }, limits: { exit: 600 } });
    const t = o.transcript;
    expectCleanEnd(o);
    expect(ofKind(t, "timeout")).toEqual([expect.objectContaining({ waitingFor: "process-exit" })]);
    const kills = ofKind(t, "kill");
    expect(kills.length).toBeGreaterThan(0);
    expect(kills[0].signal).toBe("SIGTERM");
    expect(ofKind(t, "exit")[0].byHarness).toBe(true);
    // 정상 경로의 나머지는 끝까지 갔다: 장벽·echo까지 정상이므로 남는 사유는 종료 한도뿐이다.
    expect(reasons(t)).toContain("TIMEOUT_EXIT");
    expect(verdictOf(t).complete).toBe(false);
  });

  it("initialize 직후 죽는 자식은 EXIT_DURING_RULES 계열로 끝나고 정리된다", async () => {
    const o = await runStub({ extra: { crashAfterInit: true } });
    expectCleanEnd(o);
    expect(ofKind(o.transcript, "exit")[0]).toMatchObject({ code: 7, byHarness: false });
    const v = verdictOf(o.transcript);
    expect(v.complete).toBe(false);
  });
});

// ── (e) 띄우기 실패 ─────────────────────────────────────────────

describe("process-node + 스텁 자식 — 띄우기 실패", () => {
  it("(e) 없는 실행 파일은 spawn-failed만 남기고 cleanup 없이 곧바로 끝난다", async () => {
    const started = Date.now();
    const o = await runStub({
      spec: {
        command: join(tmpdir(), "semgrep-lsp-no-such-binary-xyz"),
        args: [],
        cwd: tmpdir(),
        env: {},
      },
    });
    expect(Date.now() - started).toBeLessThan(5_000);
    const kinds = o.transcript.events.map((e) => e.kind);
    expect(kinds).toEqual(["spawn-failed"]);
    expect(ofKind(o.transcript, "cleanup")).toEqual([]);
    expect(o.spawnedPid).toBeNull();
    expect(verdictOf(o.transcript).complete).toBe(false);
  });
});

// ── (f) 취소 ────────────────────────────────────────────────────

/** 지정한 한도의 타이머가 열리는 순간(= 그 대기가 시작된 순간) AbortController를 중단시키는 시계. */
class AbortOnLimitClock implements Clock {
  private readonly inner = new SystemClock();
  private fired = false;
  constructor(
    private readonly limitMs: number,
    private readonly controller: AbortController
  ) {}
  now(): number {
    return this.inner.now();
  }
  setTimer(fn: () => void, ms: number): TimerHandle {
    if (ms === this.limitMs && !this.fired) {
      this.fired = true;
      queueMicrotask(() => this.controller.abort());
    }
    return this.inner.setTimer(fn, ms);
  }
  sleep(ms: number): Promise<void> {
    return this.inner.sleep(ms);
  }
}

describe("process-node + 스텁 자식 — 취소", () => {
  it("(f) 스캔 대기 중 AbortSignal로 중단하면 cancelled 사건 → 종료·정리, 자식은 사라진다", async () => {
    const controller = new AbortController();
    const SCAN_LIMIT = 14_321; // 다른 한도와 겹치지 않는 값: 스캔 대기가 열리는 순간을 알려 준다.
    const o = await runStub({
      patch: { scan: { barrierAtMs: null } },
      limits: { scan: SCAN_LIMIT },
      signal: controller.signal,
      clock: new AbortOnLimitClock(SCAN_LIMIT, controller),
    });
    const t = o.transcript;
    expectCleanEnd(o);
    expect(ofKind(t, "cancelled")).toEqual([expect.objectContaining({ phase: "PH3" })]);
    expect(ofKind(t, "timeout")).toEqual([]);
    expect(ofKind(t, "kill").length).toBeGreaterThan(0);
    const v = verdictOf(t);
    expect(v.complete).toBe(false);
    expect(codesOf(v)).toContain("CANCELLED_DURING_SCAN");
  });
});

// ── 하네스 끝에서 끝까지(MemoryFs·MemoryGit 위, 자식만 진짜) ─────

describe("process-node + 스텁 자식 — 하네스", () => {
  it("runHarness(target)가 스텁 자식으로 증거 9개를 쓰고 레코드는 stub·SYNTHETIC·UNVERIFIED다", async () => {
    const data = buildSyntheticData();
    const { pin, ruleModel, rulesFiles, scopeConfig } = data;
    const SHA = "a".repeat(40);
    const files: Record<string, string> = {};
    for (const [name, text] of Object.entries(data.dataFiles)) files[`/data/${name}`] = text;
    for (const [rel, text] of Object.entries(data.cacheFiles)) {
      files[`/cache/${SYNTHETIC_CACHE_DIR}/${rel}`] = text;
    }
    Object.assign(files, harnessFilesAt()); // 하네스 지문이 읽는 합성 구현 파일
    // 대조 고정 입력(.in)은 대조 지문 계산에 읽힌다 — 저장소의 정적 입력 바이트를 그대로 둔다.
    const fixtureBytes = (fixture: string): Uint8Array =>
      readFileSync(fileURLToPath(new URL(`../../${fixture}`, import.meta.url)));
    const bytesFiles: Record<string, string | Uint8Array> = { ...files };
    for (const c of data.controlExpectations.cases)
      bytesFiles[`/repo/${c.fixture}`] = fixtureBytes(c.fixture);
    const fs = new MemoryFs(bytesFiles);
    const git = new MemoryGit({
      [SHA]: {
        "src/a.ts": "export const a = 1;\n",
        "src/b.tsx": "export const b = 2;\n",
        "README.md": "# readme\n",
      },
    });
    const scanRoot = "/scan/aaaaaaa";
    const included = (await computeScope(git, SHA, scopeConfig)).included.map((e) => e.path);
    const spec = targetSpec({
      scanRoot,
      expectedPaths: included,
      loadingPaths: rulesFiles.map((f) => `${SYNTHETIC_CACHE_DIR}/${f.path}`),
      serverVersion: pin.semgrep.version,
      n: ruleModel.length,
      k: included.length,
    });
    const script = happyScript(spec);

    const options: HarnessOptions = {
      mode: "target",
      targetSha: SHA,
      runId: "run-integration-harness",
      dataDir: "/data",
      harnessRoot: SYNTHETIC_HARNESS_ROOT,
      evidenceRoot: "/evidence",
      rulesCacheRoot: `/cache/${SYNTHETIC_CACHE_DIR}`,
      scanRoot,
      controlFixturesRoot: "/repo",
      controlTreeRoot: "/ctl",
      spawn: spawnSpec(script),
      limits: GENEROUS,
      settings: { timeout: 5, timeoutThreshold: 3 },
      // 음성 대조 16개가 PASS이고 지문이 일치하는 "가정"의 real 참조(실제 실행으로 얻은 것이 아니다).
      controlReference: qualifiedReference(
        syntheticFingerprints({
          toolVersion: pin.semgrep.version,
          wheelSha256: SYNTHETIC_WHEEL,
          pinSha256: data.pinSha256,
          rulesListSha256: pin.rules.yaml_list_sha256,
          rulesExpectedSha256: pin.rules.expected_rules_sha256,
          expectationsText: data.dataFiles["control-expectations.json"],
          controlExpectations: data.controlExpectations,
          fixtureBytes,
        }),
        { run_id: "control-ref-synthetic", pin_sha256: data.pinSha256 }
      ),
      toolVersionObserved: pin.semgrep.version,
      wheelSha256Observed: SYNTHETIC_WHEEL,
      lockHeld: true,
      foreignServerProcesses: 0,
      metricsReceiverHits: 0,
    };
    const result = await runHarness(
      { fs, git, process: recordingPort, clock: new SystemClock() },
      options
    );
    expect(result.failure).toBeUndefined();
    expect(result.ok).toBe(true);
    expect(result.started).toBe(true);
    const record = result.record;
    expect(record?.provenance).toBe("stub");
    expect(record?.trust).toBe("SYNTHETIC");
    expect(record?.candidate_gate.evaluation).toBe("UNVERIFIED");
    expect(record?.measurement.reasons).toEqual([]);
    expect(record?.measurement.status).toBe("COMPLETE");
    for (const name of EVIDENCE_FILE_NAMES) {
      expect(await fs.exists(`/evidence/run-integration-harness/${name}`), name).toBe(true);
    }
    const pid = pids[pids.length - 1];
    expect(alive(pid)).toBe(false);
  });
});
