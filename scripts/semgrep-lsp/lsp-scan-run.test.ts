import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { VirtualClock } from "./clock";
import { FrameDecoder } from "./framing";
import { buildLspMinEnv } from "./lsp-min";
import { LSP_RULES_PROBE_FILE, LSP_RULES_PROBE_SHA256, probePathOf } from "./lsp-rules";
import {
  LSP_SCAN_TARGET_FILE,
  LSP_SCAN_TARGET_SHA256,
  buildScanDidOpenMessage,
  scanTargetUri,
} from "./lsp-scan";
import type { ScanObservation } from "./lsp-scan-record";
import {
  runScanObservation,
  type ScanPorts,
  type ScanRequest,
  type ScanRunOptions,
} from "./lsp-scan-run";
import { FakeMetricsReceiver } from "./testing/fake-metrics";
import { MemoryArtifactHasher } from "./testing/memory-artifact";
import { MemoryFs } from "./testing/memory-fs";
import { CORE, EXE, STUB_VERSION, URL as METRICS_URL } from "./testing/rules-facts";
import { crlf, progressCreate } from "./testing/rules-fixtures";
import {
  GOOD_DIAGNOSTIC,
  externalCommandLine,
  goodNotification,
  publishDiagnostics,
  scanLay as layout,
  scanPostOpenLines,
  scanPreOpenLines,
  TARGET_URI,
} from "./testing/scan-fixtures";
import { drive } from "./testing/stub-lsp";
import { FsBackedHasher } from "./testing/stub-lsp-rules";
import {
  barrierLines,
  bytesSteps,
  happyAfterDidOpen,
  happyAfterInitialized,
  scanLineSteps,
  scanPort,
  type ScanChild,
  type ScanScript,
  type ScanStep,
} from "./testing/stub-lsp-scan";
import { SyntheticLister, row, snapshotOf } from "./testing/synthetic-processes";
import type { JsonRpcMessage, ProcessRow } from "./types";

// ── 시험 장치 ───────────────────────────────────────────────────

const PROBE_BYTES = new Uint8Array(
  readFileSync(new URL("./data/lsp-rules-1-probe.yaml", import.meta.url))
);
const TARGET_FILE_BYTES = new Uint8Array(
  readFileSync(new URL("./data/lsp-scan-1-target.txt", import.meta.url))
);
const HOME_FINGERPRINT = `${layout.homeDir}/.semgrep/cache/fingerprinted_ignored_findings/ws.txt`;
const enc = (text: string): Uint8Array => new TextEncoder().encode(text);

function tree(): ProcessRow[] {
  return [
    row({ pid: 4242, ppid: 100, name: "semgrep.exe" }),
    row({ pid: 5000, ppid: 4242, name: "python.exe" }),
    row({ pid: 5001, ppid: 5000, name: "semgrep-core.exe" }),
  ];
}

/** 읽기 도중 오류로 끊을 수 있는 스트림. */
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
  script?: (ctx: { fs: MemoryFs; hasher: FsBackedHasher }) => Partial<ScanScript>;
  request?: Partial<ScanRequest>;
  child?: { onKill?: "exit" | "ignore-sigterm" | "ignore-all" };
  decorate?: (child: ScanChild, clock: VirtualClock) => void;
  options?: ScanRunOptions;
}

function makeRig(o: RigOptions = {}) {
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
  const originalHash = hasher.hashFile.bind(hasher);
  hasher.hashFile = async (path, opt) => {
    events.push(`hash:${path}`);
    return originalHash(path, opt);
  };
  const script: ScanScript = {
    lay: layout,
    init: { kind: "result" },
    onShutdown: () => void fs.writeFileExclusive(HOME_FINGERPRINT, new Uint8Array()),
    ...o.script?.({ fs, hasher }),
  };
  const { port, children } = scanPort(script, clock, {
    ...(o.child ? { child: o.child } : {}),
    ...(o.decorate ? { decorate: (child) => o.decorate?.(child, clock) } : {}),
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
  const ports: ScanPorts = { process: port, clock, fs, receiver, lister, hasher };
  const request: ScanRequest = {
    runId: "run-1",
    command: EXE,
    args: ["lsp", "--debug"],
    layout,
    env: buildLspMinEnv(layout, "C:/Windows", METRICS_URL),
    expectedVersion: STUB_VERSION,
    artifacts: [{ label: "semgrep-core", path: CORE }],
    probeBytes: PROBE_BYTES,
    targetBytes: TARGET_FILE_BYTES,
    ...o.request,
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
    options: o.options,
  };
}
type Rig = ReturnType<typeof makeRig>;

async function run(rig: Rig) {
  return drive(rig.clock, runScanObservation(rig.ports, rig.request, rig.options));
}

function sentOf(child: ScanChild): JsonRpcMessage[] {
  const decoder = new FrameDecoder();
  const out: JsonRpcMessage[] = [];
  for (const chunk of child.stdinWrites) out.push(...decoder.push(chunk).messages);
  return out;
}
const methodsOf = (child: ScanChild): string[] => sentOf(child).map((m) => String(m.method));
const ALLOWED_ORDER = ["initialize", "initialized", "textDocument/didOpen", "shutdown", "exit"];

/** 어느 경로로 끝났든 stdin 에는 허용된 메시지만, 허용된 순서의 앞부분만 썼다. 서버 요청에는 응답하지 않았다. */
function expectOnlyAllowedSends(child: ScanChild): void {
  const methods = methodsOf(child);
  expect(child.unexpected).toEqual([]);
  let last = -1;
  for (const m of methods) {
    const at = ALLOWED_ORDER.indexOf(m);
    expect(at, m).toBeGreaterThan(last);
    last = at;
  }
  expect(child.didOpenCount).toBeLessThanOrEqual(1);
  for (const m of sentOf(child)) expect(m.method, "id만 있는 응답이 없다").toBeDefined();
}

const verdictOf = async (rig: Rig): Promise<string> => (await run(rig)).record.verdict;
const OK = "SCAN_RESPONSE_OBSERVED";
const after = (...steps: ScanStep[]): ScanStep[] => [...happyAfterDidOpen(), ...steps];
const stderrAt = (atMs: number, ...lines: string[]): ScanStep => ({
  atMs,
  stderr: crlf(lines),
});
const withBarrierExtra = (...extra: ScanStep[]): ScanStep[] => [
  ...happyAfterInitialized(),
  ...extra,
];
const postLines = (edit: (l: string[]) => string[]): string[] => edit(scanPostOpenLines());
const postWith = (
  lines: string[],
  over: { logAtMs?: number; diagAtMs?: number } = {}
): ScanStep[] => happyAfterDidOpen({ lines, ...over });

// ── 정상 경로 ───────────────────────────────────────────────────

describe("정상 경로", () => {
  it("initialize → initialized(1회) → 장벽 → didOpen(1회) → 두 묶음 → settle → shutdown → exit, 16개 조건 모두 PASS", async () => {
    const rig = makeRig();
    const { record, raw } = await run(rig);
    expect(record.verdict).toBe(OK);
    expect(record.conditions.map((c) => c.result)).toEqual(Array(16).fill("PASS"));
    expect(methodsOf(rig.children[0])).toEqual(ALLOWED_ORDER);
    expectOnlyAllowedSends(rig.children[0]);
    expect(record.sent.every((s) => s.ok)).toBe(true);
    expect(record.termination.exit).toEqual({ code: 0, signal: null });
    expect(record.termination.kill_count).toBe(0);
    expect(record.termination.stdin_closed_by_harness).toBe(false);
    expect(record.cleanup.ok).toBe(true);
    expect(record.evidence.tracker_comparison).toBe("MATCH");
    expect(raw.stderr.byteLength).toBe(record.streams.stderr.bytes);
    expect(raw.stdout.byteLength).toBe(record.streams.stdout.bytes);
  });

  it("didOpen 은 계약대로 한 번이다: uri·본문(파일의 실제 바이트)·languageId·version, 자식이 받은 것도 같다", async () => {
    const rig = makeRig();
    const { record } = await run(rig);
    const child = rig.children[0];
    expect(child.didOpenCount).toBe(1);
    expect(child.didOpenParams).toEqual({
      textDocument: {
        uri: scanTargetUri(layout),
        languageId: "plaintext",
        version: 1,
        text: new TextDecoder().decode(TARGET_FILE_BYTES),
      },
    });
    const open = record.sent.find((s) => s.label === "didOpen");
    expect(open?.didOpen).toEqual({
      uri: TARGET_URI,
      languageId: "plaintext",
      version: 1,
      textSha256: LSP_SCAN_TARGET_SHA256,
    });
  });

  it("합성 파일과 규칙 복사본은 폴더를 만든 뒤 배타 쓰기 → 곧바로 해시 → 그 다음에야 프로세스를 띄운다", async () => {
    const rig = makeRig();
    await run(rig);
    const e = rig.events;
    const writeProbe = e.indexOf(`write:${probePathOf(layout)}`);
    const hashProbe = e.indexOf(`hash:${probePathOf(layout)}`);
    const writeTarget = e.indexOf(`write:${layout.targetPath}`);
    const hashTarget = e.indexOf(`hash:${layout.targetPath}`);
    const spawn = e.indexOf("spawn");
    expect(e.filter((x) => x.startsWith("mkdirp:")).length).toBe(5);
    expect(e.slice(0, writeProbe).every((x) => x.startsWith("mkdirp:"))).toBe(true);
    expect(hashProbe).toBe(writeProbe + 1);
    expect(writeTarget).toBeGreaterThan(hashProbe);
    expect(hashTarget).toBe(writeTarget + 1);
    expect(spawn).toBeGreaterThan(hashTarget);
    expect(await rig.fs.listFilesRecursive(layout.workspace)).toEqual([LSP_SCAN_TARGET_FILE]);
    expect(await rig.fs.listFilesRecursive(layout.rulesDir)).toEqual([LSP_RULES_PROBE_FILE]);
  });

  it("자식에게는 요청의 환경만 준다. PATH 값과 작업 폴더를 기록에 남긴다 (이름만이 아니다)", async () => {
    const rig = makeRig();
    const { record } = await run(rig);
    const spawn = rig.port.spawnCalls[0];
    expect(spawn.env).toEqual(rig.request.env);
    expect(spawn.cwd).toBe(layout.stateDir);
    expect(record.child_env.path_value).toBe(rig.request.env.PATH);
    expect(record.child_env.working_directory).toBe(layout.stateDir);
  });

  it("합성 파일·규칙 복사본의 해시를 쓴 직후와 실행 뒤에 남기고, 작업 영역은 1개에서 1개다", async () => {
    const { record } = await run(makeRig());
    expect(record.target).toMatchObject({
      source_sha256: LSP_SCAN_TARGET_SHA256,
      after_write_sha256: LSP_SCAN_TARGET_SHA256,
      after_run_sha256: LSP_SCAN_TARGET_SHA256,
    });
    expect(record.probe).toMatchObject({
      source_sha256: LSP_RULES_PROBE_SHA256,
      after_copy_sha256: LSP_RULES_PROBE_SHA256,
      after_run_sha256: LSP_RULES_PROBE_SHA256,
    });
    const ws = record.coverage.post_hoc.watched_roots.find((r) => r.role === "WORKSPACE");
    expect(ws).toMatchObject({ files_before: 1, files_after: 1, added: [], removed: [] });
  });

  it("외부 명령 시도 줄은 사전 1건·사후 1건(모양 일치)이고, git 프로세스 생성은 '확정 안 됨'으로 남는다", async () => {
    const { record } = await run(makeRig());
    expect(record.external_command.attempt_lines).toMatchObject({
      pre: 1,
      post: 1,
      shape_ok: true,
    });
    expect(record.external_command.git_process_creation.established).toBe(false);
    expect(record.external_command.git_process_creation.basis).toBe(
      "NOT_ESTABLISHED_NO_GIT_IMAGE_SAMPLED"
    );
  });

  it("시간 순서: didOpen 은 장벽 뒤, settle 창은 늦은 묶음에서 settleMs, shutdown 은 창이 끝난 뒤다", async () => {
    const { record } = await run(makeRig());
    const open = record.sent.find((s) => s.label === "didOpen");
    const shutdown = record.sent.find((s) => s.label === "shutdown");
    expect(open?.tMs).toBeGreaterThanOrEqual(record.evidence.barrier_done_at_ms ?? Infinity);
    expect(record.evidence.did_open_marker?.t_ms).toBe(open?.tMs);
    const both = record.evidence.both_complete_at_ms ?? -1;
    expect(record.evidence.settle).toEqual({ start_ms: both, end_ms: both + 2000 });
    expect(shutdown?.tMs ?? 0).toBeGreaterThanOrEqual(both + 2000);
    // 마감은 didOpen + scanMs
    expect(record.evidence.deadline_at_ms).toBe((open?.tMs ?? 0) + 30_000);
  });

  it("합성(스텁) 결과는 실제 바이너리 검증으로 승격되지 않는다", async () => {
    const { record } = await run(makeRig());
    expect(record.provenance).toBe("stub");
    expect(record.real_binary_verified).toBe(false);
    expect(record.evidence_scope).toBe("SYNTHETIC_STUB_ONLY");
    expect(record.coverage.unobserved).toContain("PROVENANCE_STUB_NOT_REAL_SEMGREP");
    expect(record.not_established.negative_controls).toBe("NOT_ESTABLISHED");
    expect(record.engine_rule_count_passed).toBe(1);
  });

  it("관측 판정·프로세스 정리·시스템 복구는 따로 기록된다 (복구는 이 실행기가 모르므로 NOT_OBSERVED)", async () => {
    const { record } = await run(makeRig());
    expect(Object.keys(record.outcomes).sort()).toEqual(
      ["observation", "process_cleanup", "system_recovery"].sort()
    );
    expect(record.outcomes.observation.verdict).toBe(OK);
    expect(record.outcomes.process_cleanup.ok).toBe(true);
    expect(record.outcomes.system_recovery.status).toBe("NOT_OBSERVED");
  });
});

// ── 도착 순서 행렬 ──────────────────────────────────────────────

describe("도착 순서 행렬 — 증거가 완전하고 일관되면 같은 성공이다 (타이밍 필드만 다르다)", () => {
  const matrix: [string, ScanStep[]][] = [
    ["stdout 진단이 먼저", happyAfterDidOpen({ diagAtMs: 20, logAtMs: 60 })],
    ["stderr 로그가 먼저", happyAfterDidOpen({ logAtMs: 20, diagAtMs: 60 })],
    ["동시 도착", happyAfterDidOpen({ logAtMs: 40, diagAtMs: 40 })],
    [
      "로그 1바이트 쪼개기",
      (() => {
        const lines = scanPostOpenLines();
        const cut = lines.indexOf("Found 1 matches") + 1;
        return [
          ...bytesSteps("stderr", enc(crlf(lines.slice(0, cut))), 30, 1),
          ...bytesSteps("stderr", enc(crlf(lines.slice(cut))), 40, 1),
          { atMs: 35, stdout: goodNotification() },
        ];
      })(),
    ],
    [
      "진단 1바이트 쪼개기",
      (() => {
        const base = happyAfterDidOpen({ messages: [] });
        const frame = new TextEncoder().encode(
          `Content-Length: ${enc(JSON.stringify(goodNotification())).byteLength}\r\n\r\n${JSON.stringify(goodNotification())}`
        );
        return [...base, ...bytesSteps("stdout", frame, 30, 1)];
      })(),
    ],
    [
      "임의 청크 분할",
      (() => {
        let seed = 7;
        const rnd = (): number => {
          seed = (seed * 1103515245 + 12345) & 0x7fffffff;
          return seed;
        };
        const lines = scanPostOpenLines();
        const bytes = enc(crlf(lines));
        const steps: ScanStep[] = [];
        for (let at = 0; at < bytes.byteLength;) {
          const n = 1 + (rnd() % 37);
          // 청크 순서는 바이트 순서다: 시각은 줄어들지 않는다.
          steps.push({ atMs: 20 + Math.floor(steps.length / 9), stderr: bytes.slice(at, at + n) });
          at += n;
        }
        return [...steps, { atMs: 33, stdout: goodNotification() }];
      })(),
    ],
  ];
  for (const [name, steps] of matrix) {
    it(`${name} → SCAN_RESPONSE_OBSERVED`, async () => {
      const rig = makeRig({ script: () => ({ afterDidOpen: steps }) });
      const { record } = await run(rig);
      expect(record.verdict, name).toBe(OK);
      expect(record.conditions.every((c) => c.result === "PASS")).toBe(true);
      expect(record.evidence.tracker_comparison).toBe("MATCH");
      expect(record.evidence.diagnostics.state).toBe("ONE");
      expect(record.evidence.log_bundle.state).toBe("COMPLETE");
    });
  }

  it("진단 먼저와 로그 먼저의 기록은 완성 시각만 다르고 settle 창은 늦은 쪽에서 시작한다", async () => {
    const a = (
      await run(
        makeRig({
          script: () => ({ afterDidOpen: happyAfterDidOpen({ diagAtMs: 20, logAtMs: 60 }) }),
        })
      )
    ).record;
    const b = (
      await run(
        makeRig({
          script: () => ({ afterDidOpen: happyAfterDidOpen({ logAtMs: 20, diagAtMs: 60 }) }),
        })
      )
    ).record;
    const openA = a.sent.find((s) => s.label === "didOpen")?.tMs ?? 0;
    const openB = b.sent.find((s) => s.label === "didOpen")?.tMs ?? 0;
    expect((a.evidence.diagnostics.complete_at_ms ?? 0) - openA).toBe(20);
    expect((a.evidence.log_bundle.complete_at_ms ?? 0) - openA).toBe(60);
    expect((b.evidence.log_bundle.complete_at_ms ?? 0) - openB).toBe(20);
    expect((b.evidence.diagnostics.complete_at_ms ?? 0) - openB).toBe(60);
    expect((a.evidence.settle.start_ms ?? 0) - openA).toBe(60);
    expect((b.evidence.settle.start_ms ?? 0) - openB).toBe(60);
  });

  it("settle 은 늦은 묶음에서 시작한다: 진단 +100, 로그 +9000 → 창 [+9000, +11000], shutdown 은 그 뒤", async () => {
    const rig = makeRig({
      script: () => ({ afterDidOpen: happyAfterDidOpen({ diagAtMs: 100, logAtMs: 9000 }) }),
    });
    const { record } = await run(rig);
    expect(record.verdict).toBe(OK);
    const open = record.sent.find((s) => s.label === "didOpen")?.tMs ?? 0;
    expect(record.evidence.settle).toEqual({ start_ms: open + 9000, end_ms: open + 11_000 });
    const shutdown = record.sent.find((s) => s.label === "shutdown")?.tMs ?? 0;
    expect(shutdown).toBeGreaterThanOrEqual(open + 11_000);
  });
});

// ── 한쪽 증거·사전 증거 ──────────────────────────────────────────

describe("한쪽 증거만 있거나 사전 증거가 있으면 성공이 아니다", () => {
  it("진단만 있고 엔진 로그가 없다 → NOT_CONFIRMED:ENGINE_LOG_MISSING (마감까지 기다린 뒤 정상 종료)", async () => {
    const rig = makeRig({
      script: () => ({ afterDidOpen: [{ atMs: 45, stdout: goodNotification() }] }),
    });
    const { record } = await run(rig);
    expect(record.verdict).toBe("NOT_CONFIRMED:ENGINE_LOG_MISSING");
    expect(record.termination.trigger).toBe("SCAN_TIMEOUT");
    expect(record.termination.kill_count).toBe(0);
    expect(methodsOf(rig.children[0])).toEqual(ALLOWED_ORDER);
  });

  it("엔진 로그만 있고 진단 알림이 없다 → NOT_CONFIRMED:NO_DIAGNOSTIC_NOTIFICATION", async () => {
    const rig = makeRig({ script: () => ({ afterDidOpen: happyAfterDidOpen({ messages: [] }) }) });
    expect((await run(rig)).record.verdict).toBe("NOT_CONFIRMED:NO_DIAGNOSTIC_NOTIFICATION");
  });

  it("장벽 구간에 스캔 증거 모양의 줄이 먼저 나오면 didOpen 을 보내지 않고 NOT_CONFIRMED:PRE_OPEN_EVIDENCE", async () => {
    const rig = makeRig({
      script: () => ({ afterInitialized: withBarrierExtra(stderrAt(12, "Scanning single file")) }),
    });
    const { record } = await run(rig);
    expect(record.verdict).toBe("NOT_CONFIRMED:PRE_OPEN_EVIDENCE");
    expect(methodsOf(rig.children[0])).toEqual(["initialize", "initialized", "shutdown", "exit"]);
    expect(record.evidence.pre_open.evidence).toBe(true);
    expect(record.evidence.did_open_marker).toBeNull();
  });

  it("장벽 구간에 진단 프레임이 먼저 나와도 같다 (사전 증거는 이번 스캔의 증거로 재사용되지 않는다)", async () => {
    const rig = makeRig({
      script: () => ({
        afterInitialized: withBarrierExtra({ atMs: 14, stdout: goodNotification() }),
      }),
    });
    const { record } = await run(rig);
    expect(record.verdict).toBe("NOT_CONFIRMED:PRE_OPEN_EVIDENCE");
    expect(rig.children[0].didOpenCount).toBe(0);
    expect(record.evidence.diagnostics.state).toBe("NONE");
  });

  it("장벽이 계약과 다르면(Got 1 errors) didOpen 을 보내지 않는다", async () => {
    const lines = barrierLines().map((l) => l.replace("Got 0 errors", "Got 1 errors"));
    const rig = makeRig({
      script: () => ({
        afterInitialized: [
          ...scanLineSteps(lines),
          ...happyAfterInitialized().filter((s) => s.stdout),
        ],
      }),
    });
    const { record } = await run(rig);
    expect(rig.children[0].didOpenCount).toBe(0);
    expect(record.status).not.toBe("OBSERVED");
    expect(record.verdict).toBe("SCAN_FAILED:LOCAL_CONFIG_ERRORS");
  });
});

// ── 내용 불일치 ──────────────────────────────────────────────────

describe("진단 내용이 기대와 다르면 각자의 사유로 가른다", () => {
  const diag = (over: Record<string, unknown>) => ({ ...GOOD_DIAGNOSTIC, ...over });
  const withDiag = (...messages: JsonRpcMessage[]): Partial<ScanScript> => ({
    afterDidOpen: happyAfterDidOpen({ messages }),
  });
  const cases: [string, JsonRpcMessage[], string][] = [
    ["중복 알림", [goodNotification(), goodNotification()], "NOT_CONFIRMED:DUPLICATE_DIAGNOSTICS"],
    [
      "진단 2개",
      [publishDiagnostics(TARGET_URI, [GOOD_DIAGNOSTIC, GOOD_DIAGNOSTIC])],
      "NOT_CONFIRMED:DUPLICATE_DIAGNOSTICS",
    ],
    [
      "다른 URI 만",
      [publishDiagnostics("file:///c%3A/other/x.txt", [GOOD_DIAGNOSTIC])],
      "NOT_CONFIRMED:WRONG_URI",
    ],
    [
      "대상 + 추가 URI",
      [goodNotification(), publishDiagnostics("file:///c%3A/other/x.txt", [GOOD_DIAGNOSTIC])],
      "NOT_CONFIRMED:EXTRA_URI",
    ],
    [
      "거절되는 URI(쿼리)",
      [publishDiagnostics(`${TARGET_URI}?x=1`, [GOOD_DIAGNOSTIC])],
      "NOT_CONFIRMED:URI_REJECTED",
    ],
    [
      "다른 code",
      [publishDiagnostics(TARGET_URI, [diag({ code: "other.rule" })])],
      "SCAN_FAILED:WRONG_RULE",
    ],
    [
      "허용된 둘째 code 도 성공",
      [publishDiagnostics(TARGET_URI, [diag({ code: "lsp-rules-1-probe" })])],
      OK,
    ],
    [
      "message 불일치",
      [publishDiagnostics(TARGET_URI, [diag({ message: "x" })])],
      "SCAN_FAILED:DIAGNOSTIC_FIELD_MISMATCH",
    ],
    [
      "severity 불일치",
      [publishDiagnostics(TARGET_URI, [diag({ severity: 1 })])],
      "SCAN_FAILED:DIAGNOSTIC_FIELD_MISMATCH",
    ],
    [
      "source 불일치",
      [publishDiagnostics(TARGET_URI, [diag({ source: "Other" })])],
      "SCAN_FAILED:DIAGNOSTIC_FIELD_MISMATCH",
    ],
    [
      "codeDescription 이 있다",
      [publishDiagnostics(TARGET_URI, [diag({ codeDescription: { href: "x" } })])],
      "SCAN_FAILED:DIAGNOSTIC_FIELD_MISMATCH",
    ],
    [
      "알려지지 않은 필드는 성공을 바꾸지 않는다",
      [publishDiagnostics(TARGET_URI, [diag({ tags: [1] })])],
      OK,
    ],
    [
      "범위 시작이 한 칸 밀림",
      [
        publishDiagnostics(TARGET_URI, [
          diag({ range: { start: { line: 1, character: 9 }, end: { line: 1, character: 53 } } }),
        ]),
      ],
      "NOT_CONFIRMED:RANGE_MISMATCH",
    ],
    [
      "범위 끝 +1",
      [
        publishDiagnostics(TARGET_URI, [
          diag({ range: { start: { line: 1, character: 8 }, end: { line: 1, character: 54 } } }),
        ]),
      ],
      "NOT_CONFIRMED:RANGE_MISMATCH",
    ],
    [
      "범위 끝 -1",
      [
        publishDiagnostics(TARGET_URI, [
          diag({ range: { start: { line: 1, character: 8 }, end: { line: 1, character: 52 } } }),
        ]),
      ],
      "NOT_CONFIRMED:RANGE_MISMATCH",
    ],
  ];
  for (const [name, messages, expected] of cases) {
    it(`${name} → ${expected}`, async () => {
      const rig = makeRig({ script: () => withDiag(...messages) });
      expect(await verdictOf(rig)).toBe(expected);
    });
  }

  it("범위의 실제 값은 고치지 않고 기록한다 (끝 +1 은 성공으로 보정되지 않는다)", async () => {
    const shifted = diag({
      range: { start: { line: 1, character: 8 }, end: { line: 1, character: 54 } },
    });
    const rig = makeRig({ script: () => withDiag(publishDiagnostics(TARGET_URI, [shifted])) });
    const { record } = await run(rig);
    expect(record.diagnostic.fields?.range_actual).toEqual(shifted.range);
    expect(record.diagnostic.fields?.range_class).toBe("END_SHIFTED_BY_ONE");
  });
});

describe("엔진 로그 쪽 불일치", () => {
  it("스트림 안의 로그 순서가 틀리면 ORDER_VIOLATION", async () => {
    const lines = postLines((l) => {
      const a = l.indexOf("[01.02][INFO]: Scanning 1 targets");
      const b = l.indexOf("[01.02][DEBUG](default): Running Semgrep with 1 rules");
      const swapped = [...l];
      [swapped[a], swapped[b]] = [swapped[b], swapped[a]];
      return swapped;
    });
    const rig = makeRig({ script: () => ({ afterDidOpen: postWith(lines) }) });
    expect(await verdictOf(rig)).toBe("NOT_CONFIRMED:ORDER_VIOLATION");
  });

  it("엔진 ERROR 머리말 → 중단하지 않고 끝까지 지켜본 뒤 SCAN_FAILED:ENGINE_ERROR", async () => {
    const lines = postLines((l) => [
      ...l.slice(0, 4),
      "[01.05][ERROR]: engine exploded",
      ...l.slice(4),
    ]);
    const rig = makeRig({ script: () => ({ afterDidOpen: postWith(lines) }) });
    const { record } = await run(rig);
    expect(record.verdict).toBe("SCAN_FAILED:ENGINE_ERROR");
    expect(record.termination.kill_count).toBe(0);
    expect(methodsOf(rig.children[0])).toEqual(ALLOWED_ORDER);
  });

  it("건너뛴 규칙이 1개 이상(Semgrep skipped 1 rules) → SCAN_FAILED:ENGINE_ERROR", async () => {
    const lines = postLines((l) =>
      l.map((x) => (x === "Semgrep skipped 0 rules" ? "Semgrep skipped 1 rules" : x))
    );
    const rig = makeRig({ script: () => ({ afterDidOpen: postWith(lines) }) });
    expect(await verdictOf(rig)).toBe("SCAN_FAILED:ENGINE_ERROR");
  });

  it("매치 0건(알림에도 진단 없음) → SCAN_FAILED:NO_MATCH, 음성 결과는 성공이 아니다", async () => {
    const lines = postLines((l) =>
      l.map((x) =>
        x === "Found 1 matches"
          ? "Found 0 matches"
          : x === "[01.20][INFO]: Found 1 matches before processing"
            ? "[01.20][INFO]: Found 0 matches before processing"
            : x
      )
    );
    const rig = makeRig({
      script: () => ({
        afterDidOpen: happyAfterDidOpen({ lines, messages: [publishDiagnostics(TARGET_URI, [])] }),
      }),
    });
    expect(await verdictOf(rig)).toBe("SCAN_FAILED:NO_MATCH");
  });

  it("didOpen 뒤 No targets → NOT_CONFIRMED:NO_TARGET", async () => {
    const lines = postLines((l) => [
      ...l.slice(0, 2),
      "[01.01][WARNING]: No targets to scan! Not scanning anything.",
      ...l.slice(2),
    ]);
    const rig = makeRig({ script: () => ({ afterDidOpen: postWith(lines) }) });
    expect(await verdictOf(rig)).toBe("NOT_CONFIRMED:NO_TARGET");
  });
});

// ── 늦은 증거·없는 증거·시간 한도 ────────────────────────────────

describe("마감(scanMs)과 시간 한도", () => {
  it("아무것도 오지 않으면 didOpen + 30초에서 기다림을 끝내고 정상 종료한다: NOT_CONFIRMED:SCAN_TIMEOUT, 연장·재시도 없음", async () => {
    const rig = makeRig({ script: () => ({ afterDidOpen: [] }) });
    const { record } = await run(rig);
    expect(record.verdict).toBe("NOT_CONFIRMED:SCAN_TIMEOUT");
    expect(record.termination.trigger).toBe("SCAN_TIMEOUT");
    expect(record.termination.kill_count).toBe(0);
    const open = record.sent.find((s) => s.label === "didOpen")?.tMs ?? 0;
    const shutdown = record.sent.find((s) => s.label === "shutdown")?.tMs ?? 0;
    expect(shutdown - open).toBe(30_000);
    expect(rig.children[0].didOpenCount).toBe(1);
    expect(methodsOf(rig.children[0])).toEqual(ALLOWED_ORDER);
  });

  it("scanMs 는 낮출 수 있고 낮춘 값이 마감이 된다 (로그가 +600 에 오는데 한도가 500 이면 놓친다)", async () => {
    const rig = makeRig({
      script: () => ({
        afterDidOpen: happyAfterDidOpen({ logAtMs: 600, diagAtMs: 100 }),
        exitDelayMs: 2_000, // 서버가 shutdown 뒤에도 잠깐 살아 있어 늦은 로그를 낸다
      }),
      request: { limits: { scanMs: 500 } },
    });
    const { record } = await run(rig);
    expect(record.request.limits.scan_ms).toBe(500);
    const open = record.sent.find((s) => s.label === "didOpen")?.tMs ?? 0;
    const shutdown = record.sent.find((s) => s.label === "shutdown")?.tMs ?? 0;
    expect(shutdown - open).toBe(500);
    expect(record.verdict).toBe("NOT_CONFIRMED:EVIDENCE_AFTER_DEADLINE");
    expect(record.evidence.log_bundle.late).toBe(true);
  });

  it("마감 뒤에 로그가 완성되면(늦은 로그) 성공이 아니고, 아무것도 안 온 경우와 기록이 다르다", async () => {
    const rig = makeRig({
      script: () => ({
        afterDidOpen: happyAfterDidOpen({ diagAtMs: 45, logAtMs: 30_500 }),
        exitDelayMs: 3_000,
      }),
    });
    const { record } = await run(rig);
    // 실제 실행에서는 마감에서 기다림을 끝내고 shutdown 을 보내므로 settle 감시 종료 시각이 없다 — 그래도 늦음이 가려지면 안 된다
    expect(record.status).toBe("NOT_CONFIRMED");
    expect(record.verdict).toBe("NOT_CONFIRMED:EVIDENCE_AFTER_DEADLINE");
    expect(record.verdict_reasons).toContain("EVIDENCE_AFTER_DEADLINE");
    expect(record.evidence.log_bundle.late).toBe(true);
    expect(record.evidence.diagnostics.late).toBe(false);
    const nothing = (await run(makeRig({ script: () => ({ afterDidOpen: [] }) }))).record;
    expect(nothing.evidence.log_bundle.late).toBe(false);
    expect(nothing.verdict).toBe("NOT_CONFIRMED:SCAN_TIMEOUT");
    expect(nothing.verdict).not.toBe(record.verdict);
  });

  it("마감 뒤에 진단이 도착해도(늦은 진단) 같은 규칙이다: NOT_CONFIRMED:EVIDENCE_AFTER_DEADLINE, 아무것도 안 온 경우와 다르다", async () => {
    const rig = makeRig({
      script: () => ({
        afterDidOpen: happyAfterDidOpen({ logAtMs: 45, diagAtMs: 30_500 }),
        exitDelayMs: 3_000,
      }),
    });
    const { record } = await run(rig);
    expect(record.verdict).toBe("NOT_CONFIRMED:EVIDENCE_AFTER_DEADLINE");
    expect(record.verdict_reasons).toContain("EVIDENCE_AFTER_DEADLINE");
    expect(record.evidence.diagnostics.late).toBe(true);
    expect(record.evidence.log_bundle.late).toBe(false);
    const nothing = (await run(makeRig({ script: () => ({ afterDidOpen: [] }) }))).record;
    expect(nothing.verdict).toBe("NOT_CONFIRMED:SCAN_TIMEOUT");
    expect(nothing.verdict).not.toBe(record.verdict);
  });

  it("마감을 넘기고 서버가 shutdown 도 무시하면 EXIT_TIMEOUT 으로 stdin 을 닫고 강제 종료 → NOT_OBSERVED", async () => {
    const rig = makeRig({
      script: () => ({ afterDidOpen: [], exit: "ignore", stdinEnd: "ignore" }),
      child: { onKill: "exit" },
    });
    const { record } = await run(rig);
    expect(record.termination.kill_count).toBe(1);
    expect(record.status).toBe("NOT_OBSERVED");
    expect(record.termination.trigger).toBe("SCAN_TIMEOUT");
    expect(record.termination.also).toContain("EXIT_TIMEOUT");
  });

  it("전체 상한은 늘어나지 않는다: 낮춘 totalMs 에 닿으면 stdin 을 닫지 않고 곧바로 강제 종료한다", async () => {
    const rig = makeRig({
      script: () => ({ afterDidOpen: [] }),
      request: { limits: { totalMs: 5_000 } },
    });
    const { record } = await run(rig);
    expect(record.termination.trigger).toBe("TOTAL_TIMEOUT");
    expect(record.verdict).toBe("NOT_OBSERVED:TOTAL_TIMEOUT");
    expect(record.termination.kill_count).toBe(1);
    expect(record.termination.stdin_closed_by_harness).toBe(false);
    expect(methodsOf(rig.children[0])).toEqual([
      "initialize",
      "initialized",
      "textDocument/didOpen",
    ]);
  });

  it("장벽 한도 안에 장벽이 끝나지 않으면 shutdown·didOpen 없이 stdin 을 닫는다: NOT_OBSERVED:RULES_TIMEOUT", async () => {
    const rig = makeRig({
      script: () => ({
        afterInitialized: [
          { atMs: 20, stdout: happyAfterInitialized().filter((s) => s.stdout)[2].stdout },
        ],
      }),
    });
    const { record } = await run(rig);
    expect(record.verdict).toBe("NOT_OBSERVED:RULES_TIMEOUT");
    expect(methodsOf(rig.children[0])).toEqual(["initialize", "initialized"]);
    expect(record.termination.stdin_closed_by_harness).toBe(true);
  });

  it("settle 중에 서버가 끝나면 CHILD_EXITED_EARLY → NOT_OBSERVED, shutdown·exit 는 보내지 않는다", async () => {
    const rig = makeRig({ script: () => ({ exitAfterDidOpenMs: 1_000 }) });
    const { record } = await run(rig);
    expect(record.status).toBe("NOT_OBSERVED");
    expect(record.termination.trigger).toBe("CHILD_EXITED_EARLY");
    expect(methodsOf(rig.children[0])).toEqual([
      "initialize",
      "initialized",
      "textDocument/didOpen",
    ]);
  });
});

// ── settle 안의 추가 신호 ────────────────────────────────────────

describe("settle 감시 안의 추가 신호", () => {
  it("settle 창 안의 두 번째 스캔 줄 → NOT_CONFIRMED:EXTRA_SCAN, 창 안(SETTLE)이라고 기록한다 (중단하지 않는다)", async () => {
    const rig = makeRig({
      script: () => ({ afterDidOpen: after(stderrAt(1_000, "Scanning single file")) }),
    });
    const { record } = await run(rig);
    expect(record.verdict).toBe("NOT_CONFIRMED:EXTRA_SCAN");
    expect(record.termination.kill_count).toBe(0);
    const extra = record.evidence.extras.find((e) => e.kind === "DUPLICATE_LINE");
    expect(extra?.phase).toBe("SETTLE");
    expect(record.conditions[12].result).toBe("FAIL");
  });

  it("settle 창 안의 두 번째 진단 알림 → NOT_CONFIRMED:DUPLICATE_DIAGNOSTICS (창 안)", async () => {
    const rig = makeRig({
      script: () => ({ afterDidOpen: after({ atMs: 1_000, stdout: goodNotification() }) }),
    });
    const { record } = await run(rig);
    expect(record.verdict).toBe("NOT_CONFIRMED:DUPLICATE_DIAGNOSTICS");
    expect(record.evidence.extras.find((e) => e.kind === "DUPLICATE_DIAGNOSTICS")?.phase).toBe(
      "SETTLE"
    );
  });

  it("창이 끝난 뒤(shutdown 이후)에 온 추가 스캔 줄은 settle 조건을 소급해 깨지 않지만 기록은 된다 (AFTER_SETTLE)", async () => {
    const rig = makeRig({
      script: () => ({ afterShutdown: [stderrAt(50, "Scanning single file")], exitDelayMs: 200 }),
    });
    const { record } = await run(rig);
    const extra = record.evidence.extras.find((e) => e.kind === "DUPLICATE_LINE");
    expect(extra?.phase).toBe("AFTER_SETTLE");
    expect(record.conditions[12].result).toBe("PASS");
    expect(record.termination.kill_count).toBe(0);
    expect(record.verdict).not.toBe(OK); // 추가 스캔 자체는 판정이 가른다
  });

  it("settle 창 안의 서버 요청(올바른 진행 요청이어도)·작업 영역 스캔 신호는 실시간 중단이다", async () => {
    const request = makeRig({
      script: () => ({ afterDidOpen: after({ atMs: 1_000, stdout: progressCreate(1, "late") }) }),
    });
    const a = await run(request);
    expect(a.record.verdict).toBe("ABORTED:SERVER_REQUEST_NOT_ALLOWED");
    expect(a.record.termination.abort?.detail).toBe("REQUEST_AFTER_DID_OPEN");
    const scan = makeRig({
      script: () => ({ afterDidOpen: after(stderrAt(1_000, "Scanning workspace")) }),
    });
    const b = await run(scan);
    expect(b.record.verdict).toBe("ABORTED:FORBIDDEN_SIGNAL");
    for (const rig of [request, scan]) {
      expect(rig.children[0].killCalls).toHaveLength(1);
      expectOnlyAllowedSends(rig.children[0]);
    }
  });
});

// ── 송신 방어선 ─────────────────────────────────────────────────

describe("송신 직전 방어선 (A10 SEND_REFUSED)", () => {
  const didOpenMessage = (): JsonRpcMessage => buildScanDidOpenMessage(layout, TARGET_FILE_BYTES);

  it("장벽 앞서 didOpen 을 보내려 하면 거절하고 쓰지 않는다 → ABORTED:SEND_REFUSED", async () => {
    const rig = makeRig({
      options: {
        attemptSends: [{ after: "initialized", label: "didOpen", message: didOpenMessage() }],
      },
    });
    const { record } = await run(rig);
    expect(record.verdict).toBe("ABORTED:SEND_REFUSED");
    expect(record.termination.abort?.condition).toBe("A10");
    expect(record.termination.abort?.detail).toMatch(/^didOpen:DID_OPEN_BEFORE_BARRIER/);
    expect(methodsOf(rig.children[0])).toEqual(["initialize", "initialized"]);
    expect(rig.children[0].didOpenCount).toBe(0);
    expect(rig.children[0].killCalls).toHaveLength(1);
  });

  it("두 번째 didOpen 은 거절한다 (자식이 받은 didOpen 은 정확히 한 번)", async () => {
    const rig = makeRig({
      options: {
        attemptSends: [{ after: "didOpen", label: "didOpen", message: didOpenMessage() }],
      },
    });
    const { record } = await run(rig);
    expect(record.verdict).toBe("ABORTED:SEND_REFUSED");
    expect(record.termination.abort?.detail).toMatch(/^didOpen:DUPLICATE_SEND/);
    expect(rig.children[0].didOpenCount).toBe(1);
    expectOnlyAllowedSends(rig.children[0]);
  });

  it("허용 밖 메시지(didSave·didChange·scanWorkspace)는 이름이 달라 거절한다", async () => {
    for (const method of [
      "textDocument/didSave",
      "textDocument/didChange",
      "semgrep/scanWorkspace",
    ]) {
      const rig = makeRig({
        options: {
          attemptSends: [
            {
              after: "barrier",
              label: "didSave" as never,
              message: { jsonrpc: "2.0", method, params: {} },
            },
          ],
        },
      });
      const { record } = await run(rig);
      expect(record.verdict, method).toBe("ABORTED:SEND_REFUSED");
      expect(methodsOf(rig.children[0]), method).toEqual(["initialize", "initialized"]);
      expect(rig.children[0].unexpected, method).toEqual([]);
    }
  });

  it("initialized 를 두 번 보내려 하면 거절한다", async () => {
    const rig = makeRig({
      options: {
        attemptSends: [
          {
            after: "initialized",
            label: "initialized",
            message: { jsonrpc: "2.0", method: "initialized", params: {} },
          },
        ],
      },
    });
    const { record } = await run(rig);
    expect(record.verdict).toBe("ABORTED:SEND_REFUSED");
    expect(methodsOf(rig.children[0])).toEqual(["initialize", "initialized"]);
  });
});

// ── 실시간 중단 ─────────────────────────────────────────────────

describe("실시간 중단 (stdin 닫기 없이 프로세스 트리를 곧바로 강제 종료, 판정은 ABORTED)", () => {
  const abortCases: [string, ScanStep[], string][] = [
    ["작업 영역 스캔", [stderrAt(100, "Scanning workspace")], "ABORTED:FORBIDDEN_SIGNAL"],
    [
      "레지스트리(using auto)",
      [stderrAt(100, "[00.9][INFO]: No rules source specified, using auto")],
      "ABORTED:FORBIDDEN_SIGNAL",
    ],
    [
      "내려받기 문구",
      [stderrAt(100, "[00.9][INFO]: trying to download from https://example.invalid/x")],
      "ABORTED:FORBIDDEN_SIGNAL",
    ],
    [
      "토큰 발견",
      [stderrAt(100, "[00.9][INFO]: Found API token in environment variables")],
      "ABORTED:FORBIDDEN_SIGNAL",
    ],
  ];
  for (const [name, extra, verdict] of abortCases) {
    it(`장벽 구간의 ${name} → ${verdict}`, async () => {
      const rig = makeRig({ script: () => ({ afterInitialized: withBarrierExtra(...extra) }) });
      const { record } = await run(rig);
      expect(record.verdict).toBe(verdict);
      expect(record.termination.kill_count).toBe(1);
      expect(record.termination.stdin_closed_by_harness).toBe(false);
      expectOnlyAllowedSends(rig.children[0]);
    });
  }

  it("didOpen 뒤 settle 안의 download 문구도 잡는다", async () => {
    const rig = makeRig({
      script: () => ({
        afterDidOpen: after(stderrAt(1_200, "[01.9][DEBUG](default): download of x")),
      }),
    });
    const { record } = await run(rig);
    expect(record.verdict).toBe("ABORTED:FORBIDDEN_SIGNAL");
    expect(methodsOf(rig.children[0])).toEqual([
      "initialize",
      "initialized",
      "textDocument/didOpen",
    ]);
  });

  it("initialized 이전에 나온 새로고침 줄·알림은 정상 신호가 아니다 → ABORTED", async () => {
    const rig = makeRig({
      script: () => ({
        init: { kind: "result", delayMs: 100 },
        beforeInitialized: [{ atMs: 50, stderr: "Refreshing rules\r\n" }],
      }),
    });
    const { record } = await run(rig);
    expect(record.verdict).toBe("ABORTED:FORBIDDEN_SIGNAL");
    expect(record.termination.abort?.detail).toBe("PRE_INITIALIZED:refreshingRules");
    expect(methodsOf(rig.children[0])).toEqual(["initialize"]);
  });

  it("서버 요청: 3건째·허용 밖 메서드는 A6 이고 응답하지 않는다", async () => {
    const third = makeRig({
      script: () => ({
        afterInitialized: withBarrierExtra({ atMs: 62, stdout: progressCreate(3, "third") }),
      }),
    });
    expect((await run(third)).record.termination.abort?.detail).toBe("TOO_MANY_PROGRESS_REQUESTS");
    const other = makeRig({
      script: () => ({
        afterInitialized: withBarrierExtra({
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
    expect((await run(other)).record.verdict).toBe("ABORTED:SERVER_REQUEST_NOT_ALLOWED");
    for (const rig of [third, other]) expectOnlyAllowedSends(rig.children[0]);
  });

  it("작업 영역에 파일이 생기거나 대상 파일이 사라지거나 규칙 폴더에 다른 파일이 생기면 A5", async () => {
    const added = makeRig({
      script: ({ fs }) => ({
        afterDidOpen: after({
          atMs: 1_000,
          run: () => void fs.writeFileExclusive(`${layout.workspace}/x.txt`, new Uint8Array()),
        }),
      }),
    });
    expect((await run(added)).record.verdict).toBe("ABORTED:FILES_CHANGED");
    const rules = makeRig({
      script: ({ fs }) => ({
        afterDidOpen: after({
          atMs: 1_000,
          run: () => void fs.writeFileExclusive(`${layout.rulesDir}/second.yaml`, new Uint8Array()),
        }),
      }),
    });
    expect((await run(rules)).record.verdict).toBe("ABORTED:FILES_CHANGED");
  });

  it("작업 영역에서 합성 파일이 사라지면(1개 → 0개) A5 TARGET_MISSING", async () => {
    let gone = false;
    const rig = makeRig({
      script: () => ({
        afterDidOpen: after({
          atMs: 1_000,
          run: () => {
            gone = true;
          },
        }),
      }),
    });
    const original = rig.fs.listFilesRecursive.bind(rig.fs);
    rig.fs.listFilesRecursive = async (root: string) =>
      gone && root === layout.workspace ? [] : original(root);
    const { record } = await run(rig);
    expect(record.verdict).toBe("ABORTED:FILES_CHANGED");
    expect(record.termination.abort?.detail).toBe("TARGET_MISSING");
    expect(
      record.coverage.post_hoc.watched_roots.find((r) => r.role === "WORKSPACE")?.removed
    ).toEqual([LSP_SCAN_TARGET_FILE]);
  });

  it("장벽에서 합성 파일 또는 프로브 해시가 달라졌으면 didOpen 을 보내기 전에 A5", async () => {
    const target = makeRig({
      script: ({ hasher }) => ({
        afterInitialized: withBarrierExtra({
          atMs: 30,
          run: () => hasher.overrides.set(layout.targetPath, "f".repeat(64)),
        }),
      }),
    });
    const a = await run(target);
    expect(a.record.verdict).toBe("ABORTED:FILES_CHANGED");
    expect(a.record.termination.abort?.detail).toBe("TARGET_CHANGED");
    expect(target.children[0].didOpenCount).toBe(0);
    const probe = makeRig({
      script: ({ hasher }) => ({
        afterInitialized: withBarrierExtra({
          atMs: 30,
          run: () => hasher.overrides.set(probePathOf(layout), "f".repeat(64)),
        }),
      }),
    });
    const b = await run(probe);
    expect(b.record.termination.abort?.detail).toBe("PROBE_CHANGED");
    expect(probe.children[0].didOpenCount).toBe(0);
  });

  it("실행 중 수신기 건수가 늘면 A3, 읽을 수 없으면 A3, 허용 밖 이미지가 보이면 A4", async () => {
    const hit = makeRig();
    hit.clock.setTimer(() => (hit.receiver.hits = 1), 200);
    expect((await run(hit)).record.verdict).toBe("ABORTED:FORBIDDEN_SIGNAL");
    const image = makeRig();
    image.state.rows = () => [...tree(), row({ pid: 6000, ppid: 4242, name: "curl.exe" })];
    expect((await run(image)).record.verdict).toBe("ABORTED:UNEXPECTED_IMAGE");
  });

  it("취소 신호는 A7 이다. 시작 전 취소는 NOT_ATTEMPTED, 실행 중 취소는 ABORTED:CANCELLED", async () => {
    const early = new AbortController();
    early.abort();
    const before = makeRig({ request: { signal: early.signal } });
    expect((await run(before)).record.verdict).toBe("NOT_ATTEMPTED:CANCELLED_BEFORE_START");
    expect(before.events).toEqual([]);
    const controller = new AbortController();
    const rig = makeRig({ request: { signal: controller.signal } });
    rig.clock.setTimer(() => controller.abort(), 20);
    const { record } = await run(rig);
    expect(record.verdict).toBe("ABORTED:CANCELLED");
    expect(record.termination.kill_count).toBe(1);
  });

  it("중단 뒤에 강제 종료가 안 먹어도 ABORTED 로 남고, 정리 실패는 따로 기록된다", async () => {
    const rig = makeRig({
      script: () => ({ afterInitialized: withBarrierExtra(stderrAt(100, "Scanning workspace")) }),
      child: { onKill: "ignore-all" },
    });
    const { record } = await run(rig);
    expect(record.verdict).toBe("ABORTED:FORBIDDEN_SIGNAL");
    expect(record.cleanup.ok).toBe(false);
    expect(record.outcomes.process_cleanup.ok).toBe(false);
    expect(record.outcomes.observation.verdict).toBe("ABORTED:FORBIDDEN_SIGNAL");
  });
});

// ── 외부 명령 시도 줄 (D3) ──────────────────────────────────────

describe("외부 명령 시도 줄 (결정 D3): 정확한 모양과 정확한 건수만", () => {
  const wsLog = layout.workspace.replace(/\//g, "\\");
  const bad = (line: string): string => `[01.01][INFO]: Running external command: ${line}`;
  const swapPost = (replacement: string): string[] =>
    postLines((l) =>
      l.map((x) => (x === externalCommandLine(layout.workspace, "01.01") ? replacement : x))
    );

  it("사전 1건 + 사후 1건(모양 일치)은 성공 경로를 막지 않는다", async () => {
    expect((await run(makeRig())).record.verdict).toBe(OK);
  });

  const wrong: [string, string][] = [
    ["다른 명령", bad('"curl" "-C" "x" "rev-parse" "--show-toplevel"')],
    ["다른 인자", bad(`"git" "-C" "${wsLog}" "status" "--short"`)],
    ["다른 경로", bad('"git" "-C" "c:\\elsewhere" "rev-parse" "--show-toplevel"')],
    ["하위 폴더 경로", bad(`"git" "-C" "${wsLog}\\sub" "rev-parse" "--show-toplevel"`)],
  ];
  for (const [name, line] of wrong) {
    it(`${name} → 실시간 중단(ABORTED:FORBIDDEN_SIGNAL), 성공이 아니다`, async () => {
      const rig = makeRig({ script: () => ({ afterDidOpen: postWith(swapPost(line)) }) });
      const { record } = await run(rig);
      expect(record.verdict).toBe("ABORTED:FORBIDDEN_SIGNAL");
      expect(record.termination.abort?.detail).toMatch(/^EXTERNAL_COMMAND_SHAPE:/);
      expect(record.termination.kill_count).toBe(1);
    });
  }

  it("세 번째 시도 줄(사후에 둘) → 중단, 시도가 아니라 줄이므로 프로세스 생성은 '확정 안 됨'으로 남는다", async () => {
    const lines = postLines((l) => {
      const at = l.indexOf("[01.02][INFO]: Scanning 1 targets");
      return [...l.slice(0, at), externalCommandLine(layout.workspace, "01.015"), ...l.slice(at)];
    });
    const rig = makeRig({ script: () => ({ afterDidOpen: postWith(lines) }) });
    const { record } = await run(rig);
    expect(record.verdict).toBe("ABORTED:FORBIDDEN_SIGNAL");
    expect(record.termination.abort?.detail).toBe("EXTERNAL_COMMAND_COUNT");
    expect(record.external_command.git_process_creation.established).toBe(false);
  });

  it("사후 시도 줄이 없으면 부족이다 → 중단 없이 끝까지 가서 NOT_CONFIRMED:EXTERNAL_COMMAND_COUNT", async () => {
    const lines = postLines((l) => l.filter((x) => !x.includes("Running external command")));
    const rig = makeRig({ script: () => ({ afterDidOpen: postWith(lines) }) });
    const { record } = await run(rig);
    expect(record.verdict).toBe("NOT_CONFIRMED:EXTERNAL_COMMAND_COUNT");
    expect(record.termination.kill_count).toBe(0);
  });

  it("git 이미지가 자식 트리에 보이면 기존 정책대로 ABORTED:UNEXPECTED_IMAGE 이고 허용되지 않는다", async () => {
    const rig = makeRig();
    rig.state.rows = () => [...tree(), row({ pid: 7000, ppid: 4242, name: "git.exe" })];
    const { record } = await run(rig);
    expect(record.verdict).toBe("ABORTED:UNEXPECTED_IMAGE");
    expect(record.external_command.git_process_creation.established).toBe(true);
    expect(record.external_command.git_process_creation.basis).toBe("GIT_IMAGE_OBSERVED");
    expect(record.coverage.live.processes.disallowed).toContain("git.exe");
  });
});

// ── 읽기·쓰기 실패 ──────────────────────────────────────────────

describe("스트림 읽기·쓰기 실패는 성공으로 두지 않는다", () => {
  const breakAt =
    (which: "stdout" | "stderr", ms: number) =>
    (child: ScanChild, clock: VirtualClock): void => {
      const broken = breakableStream(child[which]);
      Object.defineProperty(child, which, { value: broken.stream });
      clock.setTimer(() => broken.fail(new Error("pipe broken")), ms);
    };

  it("로딩 도중 stderr 읽기 실패 → NOT_OBSERVED:STREAM_READ_FAILED", async () => {
    const { record } = await run(makeRig({ decorate: breakAt("stderr", 20) }));
    expect(record.verdict).toBe("NOT_OBSERVED:STREAM_READ_FAILED");
    expect(record.streams.stderr.read_failed).toBe(true);
  });

  it("didOpen 뒤 settle 중에 stdout 읽기가 실패해도 이미 본 신호로 성공이 되지 않는다", async () => {
    const { record } = await run(makeRig({ decorate: breakAt("stdout", 800) }));
    expect(record.verdict).toBe("NOT_OBSERVED:STREAM_READ_FAILED");
  });

  it("didOpen 쓰기가 실패하면 NOT_OBSERVED:STDIN_ERROR, shutdown·exit 는 보내지 않는다", async () => {
    const rig = makeRig({ script: () => ({ failWriteNumber: 3 }) });
    const { record } = await run(rig);
    expect(record.verdict).toBe("NOT_OBSERVED:STDIN_ERROR");
    expect(record.sent.map((s) => [s.label, s.ok])).toEqual([
      ["initialize", true],
      ["initialized", true],
      ["didOpen", false],
    ]);
  });

  it("출력 상한을 넘기면 OUTPUT_LIMIT", async () => {
    const rig = makeRig({
      script: () => ({ afterInitialized: withBarrierExtra(stderrAt(100, "x".repeat(300_000))) }),
    });
    expect((await run(rig)).record.verdict).toBe("NOT_OBSERVED:OUTPUT_LIMIT");
  });

  it("stdout 프레임이 깨지면 FRAME_ERROR", async () => {
    const rig = makeRig({
      script: () => ({
        afterDidOpen: [{ atMs: 20, stdout: enc("Content-Length: nope\r\n\r\n{}") }],
      }),
    });
    expect((await run(rig)).record.verdict).toMatch(/^NOT_OBSERVED:FRAME_ERROR/);
  });

  it("종료 뒤 정리: 자식 트리가 남아 있거나 dispose 가 실패해도 관측 판정은 그대로, 정리 결과만 실패로 따로 남는다", async () => {
    const alive = makeRig();
    alive.state.rows = () => {
      const c = alive.children[0];
      return c !== undefined && c.hasExitedNow
        ? [row({ pid: 5001, ppid: 4242, name: "semgrep-core.exe" })]
        : tree();
    };
    const a = (await run(alive)).record;
    expect(a.verdict).toBe(OK);
    expect(a.cleanup.ok).toBe(false);
    expect(a.outcomes.observation.status).toBe("OBSERVED");
    expect(a.outcomes.process_cleanup.ok).toBe(false);
    const dispose = makeRig({ script: () => ({ disposeFails: true }) });
    const d = (await run(dispose)).record;
    expect(d.verdict).toBe(OK);
    expect(d.cleanup.dispose).toBe("FAILED");
    expect(d.cleanup.ok).toBe(false);
  });
});

// ── 거절: 아무것도 만들지 않는다 ────────────────────────────────

describe("요청 검사와 준비 단계 거절 — 서버를 띄우지 않으면 NOT_ATTEMPTED, 아무것도 만들지 않는다", () => {
  async function refused(rig: Rig, reason: string): Promise<ScanObservation> {
    const { record } = await run(rig);
    expect(record.verdict).toBe(`NOT_ATTEMPTED:${reason}`);
    expect(rig.events.includes("spawn")).toBe(false);
    return record;
  }
  const flip = (bytes: Uint8Array): Uint8Array => {
    const out = bytes.slice();
    out[0] ^= 1;
    return out;
  };

  it("한도를 올리거나 알 수 없는 한도를 주면 거절한다 (scanMs·totalMs·settleMs 모두 낮출 수만 있다)", async () => {
    for (const [limits, reason] of [
      [{ scanMs: 60_000 }, "LIMIT_ABOVE_CAP:scanMs"],
      [{ totalMs: 200_000 }, "LIMIT_ABOVE_CAP:totalMs"],
      [{ settleMs: 5_000 }, "LIMIT_ABOVE_CAP:settleMs"],
      [{ rulesMs: 120_000 }, "LIMIT_ABOVE_CAP:rulesMs"],
      [{ nope: 1 }, "LIMIT_UNKNOWN:nope"],
      [{ scanMs: 0 }, "LIMIT_INVALID:scanMs"],
    ] as const) {
      const rig = makeRig({ request: { limits: limits as unknown as ScanRequest["limits"] } });
      await refused(rig, reason);
      expect(rig.events, reason).toEqual([]);
    }
  });

  it("initializationOptions 의 알 수 없는 scan 키·jobs 가 1 이 아닌 값은 거절한다", async () => {
    const good = {
      scan: {
        ci: false,
        configuration: [layout.rulesDir],
        maxTargetBytes: 1_000_000,
        onlyGitDirty: false,
        pro_intrafile: false,
        timeout: 30,
        timeoutThreshold: 3,
        jobs: 1,
      },
      metrics: { enabled: false },
    };
    const variants: Record<string, unknown>[] = [
      { ...good, scan: { ...good.scan, jobs: 2 } },
      { ...good, scan: { ...good.scan, jobs: "1" } },
      { ...good, scan: { ...good.scan, extraKey: 1 } },
      { ...good, scan: { ...good.scan, ci: true } },
    ];
    for (const opts of variants) {
      const rig = makeRig({ request: { initializationOptions: opts } });
      await refused(rig, "SETTINGS_KEY_NOT_ALLOWED");
      expect(rig.events).toEqual([]);
    }
    expect((await run(makeRig({ request: { initializationOptions: good } }))).record.verdict).toBe(
      OK
    );
  });

  it("합성 파일의 바이트가 없거나 크기·내용이 다르면 거절한다", async () => {
    await refused(makeRig({ request: { targetBytes: undefined } }), "TARGET_BYTES_MISSING");
    await refused(
      makeRig({ request: { targetBytes: TARGET_FILE_BYTES.slice(0, 134) } }),
      "TARGET_SIZE_MISMATCH"
    );
    const wrong = makeRig({ request: { targetBytes: flip(TARGET_FILE_BYTES) } });
    await refused(wrong, "TARGET_HASH_MISMATCH");
    expect(wrong.events).toEqual([]);
  });

  it("프로브 바이트가 다르면 거절한다", async () => {
    const rig = makeRig({ request: { probeBytes: flip(PROBE_BYTES) } });
    await refused(rig, "PROBE_HASH_MISMATCH");
    expect(rig.events).toEqual([]);
  });

  it("배치(경로)·환경 이름·PATH 값·명령·인자가 계약과 다르면 거절한다", async () => {
    const env = buildLspMinEnv(layout, "C:/Windows", METRICS_URL);
    await refused(
      makeRig({ request: { layout: { ...layout, targetPath: `${layout.workspace}/other.txt` } } }),
      "LAYOUT_MISMATCH"
    );
    await refused(
      makeRig({ request: { layout: { ...layout, workspace: "C:/elsewhere/ws" } } }),
      "LAYOUT_MISMATCH"
    );
    await refused(
      makeRig({ request: { env: { ...env, SEMGREP_LOG_SRCS: "semgrep.parsing" } } }),
      "ENV_NAME_NOT_ALLOWED:SEMGREP_LOG_SRCS"
    );
    await refused(
      makeRig({ request: { env: { ...env, PATH: "C:/Windows;C:/Git/bin" } } }),
      "ENV_VALUE_UNEXPECTED:PATH"
    );
    await refused(
      makeRig({ request: { args: ["lsp", "--debug", "--x-eio-ls"] } }),
      "ARGS_NOT_FIXED"
    );
    await refused(
      makeRig({ request: { command: "C:/venv/Scripts/python.exe" } }),
      "COMMAND_NAME_NOT_ALLOWED"
    );
    await refused(makeRig({ request: { command: "semgrep.exe" } }), "COMMAND_NOT_ABSOLUTE");
  });

  it("감시 폴더가 비어 있지 않으면 프로브도 합성 파일도 쓰지 않고 거절한다", async () => {
    const a = makeRig();
    await a.fs.writeFileExclusive(`${layout.workspace}/old.txt`, new Uint8Array());
    const aSetup = a.events.length; // 시험이 미리 둔 파일의 쓰기는 제외한다
    await refused(a, "WATCHED_ROOT_NOT_EMPTY:WORKSPACE");
    expect(a.events.slice(aSetup).some((e) => e.startsWith("write:"))).toBe(false);
    const b = makeRig();
    await b.fs.writeFileExclusive(`${layout.rulesDir}/stale.yaml`, new Uint8Array());
    const bSetup = b.events.length;
    await refused(b, "WATCHED_ROOT_NOT_EMPTY:RULES_DIR");
    expect(b.events.slice(bSetup).some((e) => e.startsWith("write:"))).toBe(false);
  });

  it("링크·junction 으로 쓰기 경로(작업 영역·합성 파일·규칙 폴더)가 작업 폴더 밖으로 새면 만들기 전에 거절한다", async () => {
    for (const leaking of [layout.workspace, layout.targetPath, layout.rulesDir, layout.homeDir]) {
      const rig = makeRig();
      const original = rig.fs.physicalKey.bind(rig.fs);
      rig.fs.physicalKey = async (path: string) =>
        path === leaking || path.startsWith(`${leaking}/`)
          ? "c:/elsewhere/outside"
          : original(path);
      await refused(rig, "PATH_ESCAPES_WORK");
      expect(rig.events, leaking).toEqual([]);
    }
  });

  it("경로를 풀 수 없으면 거절한다", async () => {
    const rig = makeRig();
    rig.fs.physicalKey = async () => {
      throw new Error("ELOOP");
    };
    await refused(rig, "PATH_RESOLVE_FAILED");
    expect(rig.events).toEqual([]);
  });

  it("쓴 직후의 해시가 고정값과 다르면 프로세스를 띄우지 않는다 (합성 파일·프로브 각각)", async () => {
    const target = makeRig({
      script: ({ hasher }) => {
        hasher.overrides.set(layout.targetPath, "e".repeat(64));
        return {};
      },
    });
    await refused(target, "TARGET_COPY_HASH_MISMATCH");
    const probe = makeRig({
      script: ({ hasher }) => {
        hasher.overrides.set(probePathOf(layout), "e".repeat(64));
        return {};
      },
    });
    await refused(probe, "PROBE_COPY_HASH_MISMATCH");
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

// ── 실행 뒤 파일 확인 ───────────────────────────────────────────

describe("실행 뒤 파일 확인", () => {
  it("shutdown 에서 합성 파일이 바뀌면 NOT_OBSERVED:FILES_CHANGED (실행 뒤 해시를 다시 잰다)", async () => {
    const rig = makeRig({
      script: ({ hasher }) => ({
        onShutdown: () => hasher.overrides.set(layout.targetPath, "d".repeat(64)),
      }),
    });
    const { record } = await run(rig);
    expect(record.verdict).toBe("NOT_OBSERVED:FILES_CHANGED");
    expect(record.target.after_run_sha256).toBe("d".repeat(64));
    expect(record.verdict_reasons).toContain("TARGET_CHANGED_DURING_RUN");
  });

  it("shutdown 에서 규칙 복사본이 바뀌면 NOT_OBSERVED:FILES_CHANGED", async () => {
    const rig = makeRig({
      script: ({ hasher }) => ({
        onShutdown: () => hasher.overrides.set(probePathOf(layout), "d".repeat(64)),
      }),
    });
    const { record } = await run(rig);
    expect(record.verdict).toBe("NOT_OBSERVED:FILES_CHANGED");
    expect(record.verdict_reasons).toContain("PROBE_CHANGED_DURING_RUN");
  });

  it("홈의 허용 위치 밖에 쓰면 성공이 아니다", async () => {
    const rig = makeRig({
      script: ({ fs }) => ({
        onShutdown: () =>
          void fs.writeFileExclusive(`${layout.homeDir}/settings.yml`, new Uint8Array()),
      }),
    });
    const { record } = await run(rig);
    expect(record.verdict).not.toBe(OK);
  });

  it("설치물 해시가 실행 중 바뀌면 성공이 아니다", async () => {
    const rig = makeRig({
      script: ({ hasher }) => ({ onShutdown: () => hasher.inner.set(CORE, "core-binary-v2") }),
    });
    const { record } = await run(rig);
    expect(record.status).toBe("NOT_OBSERVED");
    expect(record.coverage.post_hoc.artifact_hashes[0].comparison).toBe("CHANGED");
  });
});

describe("initialize 응답 검증", () => {
  const cases: [string, Partial<ScanScript>, Partial<ScanRequest>][] = [
    ["오류 응답", { init: { kind: "error" } }, {}],
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
    ["핀 버전을 받지 못했다", {}, { expectedVersion: null }],
  ];
  for (const [name, script, request] of cases) {
    it(`${name} → initialized·didOpen 을 보내지 않고 NOT_OBSERVED`, async () => {
      const rig = makeRig({ script: () => script, request });
      const { record } = await run(rig);
      expect(methodsOf(rig.children[0])).toEqual(["initialize"]);
      expect(record.status).toBe("NOT_OBSERVED");
      expect(rig.children[0].endStdinCalls).toBeGreaterThanOrEqual(1);
    });
  }
});

describe("원문 바이트 보존", () => {
  it("raw.stderr 는 CRLF 를 포함한 원문 그대로이고, 청크 시간표가 두 스트림 전체를 덮는다", async () => {
    const { raw, facts } = await run(makeRig());
    const text = new TextDecoder().decode(raw.stderr);
    expect(text).toContain("Scanning single file\r\n");
    expect(text).toContain(crlf(["Scanned single file"]));
    const chunks = facts.chunks ?? [];
    const sum = (s: "stdout" | "stderr"): number =>
      chunks.filter((c) => c.stream === s).reduce((n, c) => n + c.length, 0);
    expect(sum("stdout")).toBe(raw.stdout.byteLength);
    expect(sum("stderr")).toBe(raw.stderr.byteLength);
    expect(facts.markers.didOpenSent).not.toBeNull();
  });

  it("사전 구간의 외부 명령 줄은 장벽 구간에 있고 사후 구간의 줄과 구별된다", async () => {
    const { facts } = await run(makeRig());
    const marker = facts.markers.didOpenSent;
    const pre = new TextDecoder().decode(facts.stderr.bytes.subarray(0, marker?.stderrOffset ?? 0));
    const post = new TextDecoder().decode(facts.stderr.bytes.subarray(marker?.stderrOffset ?? 0));
    expect(pre.split("Running external command").length - 1).toBe(1);
    expect(post.split("Running external command").length - 1).toBe(1);
    expect(scanPreOpenLines().length).toBeGreaterThan(10);
  });
});
