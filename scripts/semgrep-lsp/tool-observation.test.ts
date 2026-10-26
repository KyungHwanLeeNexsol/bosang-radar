import { createHash } from "node:crypto";
import { getEventListeners } from "node:events";
import { describe, expect, it } from "vitest";
import { VirtualClock } from "./clock";
import {
  ArtifactHashError,
  DEFAULT_VERSION_LIMITS,
  DEFAULT_WHEEL_MAX_BYTES,
  VERSION_ARGS,
  completeToolObservation,
  notAttemptedVersion,
  observeToolVersion,
  observeWheelHash,
  parseVersionStdout,
  runToolObservation,
  toolObservationConflict,
  type ToolVersionObservation,
  type ToolVersionRequest,
} from "./tool-observation";
import { AsyncByteQueue } from "./streams";
import { FakeChild, FakePort } from "./testing/fake-process";
import { MemoryArtifactHasher } from "./testing/memory-artifact";
import { drive } from "./testing/stub-lsp";
import type { ChildHandle, MetricsObserver, MetricsReceiverSummary, Pin } from "./types";

// 이 시험은 실제 프로세스를 띄우지 않는다: 가짜 포트(provenance "stub")와 가상 시계만 쓴다. 실제 Node 프로세스 스텁은
// tool-observation.integration.test.ts가 다룬다. 여기서 얻은 결과는 실제 Semgrep 동작의 증거가 아니다.

const enc = new TextEncoder();
const BIN = "/opt/semgrep/bin/semgrep";
const request = (over: Partial<ToolVersionRequest> = {}): ToolVersionRequest => ({
  command: BIN,
  args: VERSION_ARGS,
  cwd: "/evidence/run-1/version-check-state",
  env: { PATH: "/usr/bin" },
  ...over,
});

interface Run {
  clock: VirtualClock;
  port: FakePort;
  child: FakeChild;
}

function world(
  script: (child: FakeChild) => void = () => {},
  childOptions: ConstructorParameters<typeof FakeChild>[0] = {}
): Run {
  const clock = new VirtualClock();
  const child = new FakeChild(childOptions);
  const port = new FakePort({ childFactory: () => child });
  script(child);
  return { clock, port, child };
}

async function observe(
  w: Run,
  over: Partial<ToolVersionRequest> = {}
): Promise<ToolVersionObservation> {
  return drive(w.clock, observeToolVersion({ process: w.port, clock: w.clock }, request(over)));
}

/** stdout을 보내고 종료하는 자식. */
const finishing =
  (
    stdout: string | Uint8Array,
    exit: { code: number | null; signal?: string | null } = { code: 0 }
  ) =>
  (child: FakeChild): void => {
    child.emitStdout(stdout);
    child.exit(exit.code, exit.signal ?? null);
  };

// ── stdout 해석 계약 ────────────────────────────────────────────

describe("parseVersionStdout — stdout 해석 계약", () => {
  const ok = (text: string): string | null => {
    const r = parseVersionStdout(enc.encode(text));
    return r.ok ? r.version : null;
  };
  const failure = (bytes: Uint8Array): string | null => {
    const r = parseVersionStdout(bytes);
    return r.ok ? null : r.failure;
  };

  it("`숫자.숫자.숫자` 한 줄만 받는다(끝의 줄 끝 하나는 허용)", () => {
    expect(ok("1.180.0\n")).toBe("1.180.0");
    expect(ok("1.180.0\r\n")).toBe("1.180.0");
    expect(ok("1.180.0")).toBe("1.180.0");
    expect(ok("0.0.0\n")).toBe("0.0.0");
    expect(ok("10.20.30\n")).toBe("10.20.30");
  });

  it.each([
    ["", "OUTPUT_EMPTY"],
    ["\n", "OUTPUT_EMPTY"],
    ["\r\n", "OUTPUT_EMPTY"],
    ["1.180.0\n\n", "OUTPUT_NOT_SINGLE_LINE"],
    ["1.180.0\n1.180.0\n", "OUTPUT_NOT_SINGLE_LINE"],
    ["\n1.180.0\n", "OUTPUT_NOT_SINGLE_LINE"],
    ["1.180.0\r\r\n", "OUTPUT_NOT_SINGLE_LINE"],
    ["semgrep 1.180.0\n", "OUTPUT_UNRECOGNIZED"],
    ["v1.180.0\n", "OUTPUT_UNRECOGNIZED"],
    ["1.180\n", "OUTPUT_UNRECOGNIZED"],
    ["1.180.0.1\n", "OUTPUT_UNRECOGNIZED"],
    ["01.180.0\n", "OUTPUT_UNRECOGNIZED"],
    ["1.180.0-rc1\n", "OUTPUT_UNRECOGNIZED"],
    ["1.180.0+build\n", "OUTPUT_UNRECOGNIZED"],
    [" 1.180.0\n", "OUTPUT_UNRECOGNIZED"],
    ["1.180.0 \n", "OUTPUT_UNRECOGNIZED"],
    ["1.180.0 (dev)\n", "OUTPUT_UNRECOGNIZED"],
    ["１.180.0\n", "OUTPUT_UNRECOGNIZED"], // 전각 숫자
    ["﻿1.180.0\n", "OUTPUT_UNRECOGNIZED"], // BOM은 지우지 않고 거절한다
    ["1.180.0\u0000\n", "OUTPUT_UNRECOGNIZED"],
  ])("%j → %s (관측 실패로 남긴다)", (text, expected) => {
    expect(failure(enc.encode(text))).toBe(expected);
  });

  it("유효하지 않은 UTF-8은 OUTPUT_NOT_UTF8이다(대체 문자로 고쳐 읽지 않는다)", () => {
    expect(failure(new Uint8Array([0x31, 0x2e, 0xff, 0x0a]))).toBe("OUTPUT_NOT_UTF8");
    expect(failure(new Uint8Array([0xc3, 0x28]))).toBe("OUTPUT_NOT_UTF8");
  });
});

// ── 버전 확인 프로세스 ──────────────────────────────────────────

describe("observeToolVersion — 정상", () => {
  it("버전을 stdout에서 관측하고, 인자 배열·출처·종료·크기를 기록하며, 자식을 정리한다", async () => {
    const w = world(finishing("1.180.0\n"));
    const r = await observe(w);

    expect(r).toMatchObject({
      status: "OBSERVED",
      version: "1.180.0",
      failure: null,
      provenance: "stub", // 포트가 알린 출처 그대로다
      args: ["--version"],
      exit: { code: 0, signal: null },
      stdoutBytes: 8,
      stderrBytes: 0,
      childProcess: "EXITED",
    });
    // 셸 문자열이 아니라 실행 파일과 인자 배열로 한 번만 불렀다.
    expect(w.port.spawnCalls).toEqual([
      {
        command: BIN,
        args: ["--version"],
        cwd: "/evidence/run-1/version-check-state",
        env: { PATH: "/usr/bin" },
      },
    ]);
    expect(w.child.disposed).toBe(true);
    expect(w.child.killCalls).toEqual([]); // 스스로 끝난 자식은 건드리지 않는다
    expect(w.clock.pendingTimers).toBe(0); // 시간 제한 타이머를 남기지 않는다
  });

  it("stderr에 경고가 있어도 버전 해석에는 쓰지 않는다 — 바이트 수만 기록한다", async () => {
    const w = world((c) => {
      c.emitStderr("warning: noisy\n");
      c.emitStdout("1.180.0\n");
      c.exit(0);
    });
    const r = await observe(w);
    expect(r).toMatchObject({ status: "OBSERVED", version: "1.180.0", stderrBytes: 15 });
  });

  it("출력이 여러 조각으로 와도 이어 붙여 해석한다", async () => {
    const w = world((c) => {
      c.emitStdout("1.18");
      c.emitStdout("0.");
      c.emitStdout("0\n");
      c.exit(0);
    });
    expect((await observe(w)).version).toBe("1.180.0");
  });

  it("버전 값은 핀 등 다른 곳에서 가져오지 않는다 — 출력이 다르면 그 값(불일치)이 그대로 나온다", async () => {
    const r = await observe(world(finishing("1.179.0\n")));
    expect(r).toMatchObject({ status: "OBSERVED", version: "1.179.0" });
  });
});

describe("observeToolVersion — 예상 밖 출력·비정상 종료는 관측 실패다", () => {
  it.each([
    ["빈 출력", "", "OUTPUT_EMPTY"],
    ["여러 줄", "1.180.0\n1.180.0\n", "OUTPUT_NOT_SINGLE_LINE"],
    ["접두가 붙은 형식", "semgrep 1.180.0\n", "OUTPUT_UNRECOGNIZED"],
    ["v 접두", "v1.180.0\n", "OUTPUT_UNRECOGNIZED"],
  ])("%s", async (_name, stdout, failure) => {
    const r = await observe(world(finishing(stdout)));
    expect(r).toMatchObject({ status: "FAILED", version: null, failure });
    expect(r.childProcess).toBe("EXITED");
  });

  it("버전이 stderr에만 있으면 관측 실패다(stderr는 해석하지 않는다)", async () => {
    const w = world((c) => {
      c.emitStderr("1.180.0\n");
      c.exit(0);
    });
    expect(await observe(w)).toMatchObject({
      status: "FAILED",
      version: null,
      failure: "OUTPUT_EMPTY",
    });
  });

  it("유효하지 않은 UTF-8 stdout은 관측 실패다", async () => {
    const r = await observe(world(finishing(new Uint8Array([0x31, 0xff, 0x0a]))));
    expect(r).toMatchObject({ status: "FAILED", version: null, failure: "OUTPUT_NOT_UTF8" });
  });

  it("종료 코드가 0이 아니면 stdout이 정상처럼 보여도 관측 실패다(버전을 채우지 않는다)", async () => {
    const r = await observe(world(finishing("1.180.0\n", { code: 3 })));
    expect(r).toMatchObject({
      status: "FAILED",
      version: null,
      failure: "NONZERO_EXIT",
      exit: { code: 3, signal: null },
    });
  });

  it("신호로 끝난 자식은 관측 실패다", async () => {
    const r = await observe(world(finishing("1.180.0\n", { code: null, signal: "SIGSEGV" })));
    expect(r).toMatchObject({ status: "FAILED", version: null, failure: "KILLED_BY_SIGNAL" });
  });

  it("실행 파일을 띄우지 못하면 관측 실패이고 정리할 자식이 없다", async () => {
    const w = world();
    w.port.failSpawnWith(new Error("ENOENT: 비밀 경로 /secret/place"));
    const r = await observe(w);
    expect(r).toMatchObject({
      status: "FAILED",
      version: null,
      failure: "SPAWN_FAILED",
      provenance: "stub",
      childProcess: "NOT_SPAWNED",
    });
    expect(JSON.stringify(r)).not.toContain("/secret/place"); // 오류 원문은 남기지 않는다
    expect(w.port.children).toEqual([]);
  });

  it("스트림 읽기가 실패하면 관측 실패이고 자식은 정리한다", async () => {
    const clock = new VirtualClock();
    const child = new FakeChild();
    let disposeCalls = 0;
    const broken: ChildHandle = {
      pid: 1,
      stdout: {
        [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(new Error("read EIO")) }),
      },
      stderr: child.stderr,
      writeStdin: (data) => child.writeStdin(data),
      endStdin: () => child.endStdin(),
      kill: (signal) => child.kill(signal),
      exited: child.exited,
      dispose: async () => {
        disposeCalls += 1;
        await child.dispose();
      },
    };
    child.exit(0);
    const port = { provenance: "stub" as const, spawn: async (): Promise<ChildHandle> => broken };
    const r = await drive(clock, observeToolVersion({ process: port, clock }, request()));
    expect(r).toMatchObject({ status: "FAILED", version: null, failure: "STREAM_READ_FAILED" });
    expect(disposeCalls).toBe(1);
  });
});

describe("observeToolVersion — 시간 제한", () => {
  it("시간 초과: 자식을 SIGKILL로 끝내고 종료를 관찰하며 TIMEOUT으로 남긴다", async () => {
    const w = world(); // 출력도 종료도 없다
    const r = await observe(w, { limits: { timeoutMs: 1000 } });
    expect(r).toMatchObject({
      status: "FAILED",
      version: null,
      failure: "TIMEOUT",
      childProcess: "KILLED",
      exit: { code: null, signal: "SIGKILL" },
    });
    expect(r.durationMs).toBe(1000);
    expect(w.child.killCalls).toEqual(["SIGKILL"]);
    expect(w.child.disposed).toBe(true);
    expect(w.clock.pendingTimers).toBe(0);
  });

  it("기본 한도는 문서화된 값이다", () => {
    expect(DEFAULT_VERSION_LIMITS).toEqual({
      timeoutMs: 30_000,
      maxStdoutBytes: 4096,
      maxStderrBytes: 16_384,
      killWaitMs: 5000,
    });
    expect(Object.isFrozen(DEFAULT_VERSION_LIMITS)).toBe(true);
  });

  it("한도 안에서 끝나면 시간 초과가 아니다", async () => {
    const w = world();
    const p = observeToolVersion(
      { process: w.port, clock: w.clock },
      request({ limits: { timeoutMs: 1000 } })
    );
    await w.clock.advance(999);
    w.child.emitStdout("1.180.0\n");
    w.child.exit(0);
    const r = await drive(w.clock, p);
    expect(r).toMatchObject({ status: "OBSERVED", version: "1.180.0" });
  });

  it("SIGKILL에도 끝나지 않고 dispose로도 종료를 관측하지 못하는 자식은 KILL_NOT_OBSERVED로 남기고, 그래도 dispose를 부른다", async () => {
    // 종료를 알리지 않는 자식: kill·dispose를 받아도 exited가 이행되지 않는다(정리 실패를 흉내 낸다).
    const clock = new VirtualClock();
    const kills: (string | undefined)[] = [];
    let disposeCalls = 0;
    const stuck: ChildHandle = {
      pid: 7,
      stdout: new AsyncByteQueue(),
      stderr: new AsyncByteQueue(),
      writeStdin: async () => {},
      endStdin: async () => {},
      kill: (signal) => void kills.push(signal),
      exited: new Promise(() => {}),
      dispose: async () => void (disposeCalls += 1),
    };
    const port = { provenance: "stub" as const, spawn: async (): Promise<ChildHandle> => stuck };
    const r = await drive(
      clock,
      observeToolVersion(
        { process: port, clock },
        request({ limits: { timeoutMs: 100, killWaitMs: 200 } })
      )
    );
    expect(r).toMatchObject({
      status: "FAILED",
      failure: "TIMEOUT",
      childProcess: "KILL_NOT_OBSERVED",
      exit: null,
    });
    expect(kills).toEqual(["SIGKILL"]);
    expect(disposeCalls).toBe(1);
    expect(clock.pendingTimers).toBe(0);
  });

  it("SIGKILL을 무시해도 dispose가 끝내서 종료를 관측하면 KILLED다", async () => {
    const w = world(() => {}, { onKill: "ignore-all" });
    const r = await observe(w, { limits: { timeoutMs: 100, killWaitMs: 200 } });
    expect(r).toMatchObject({ status: "FAILED", failure: "TIMEOUT", childProcess: "KILLED" });
    expect(w.child.disposed).toBe(true);
  });
});

describe("observeToolVersion — 출력 크기 제한", () => {
  const limits = { maxStdoutBytes: 16, maxStderrBytes: 16 };

  it("stdout이 한도를 넘으면 끝내고 OUTPUT_LIMIT_EXCEEDED다(그 안에 버전처럼 보이는 줄이 있어도)", async () => {
    const w = world((c) => c.emitStdout(`1.180.0\n${"x".repeat(32)}`));
    const r = await observe(w, { limits });
    expect(r).toMatchObject({
      status: "FAILED",
      version: null,
      failure: "OUTPUT_LIMIT_EXCEEDED",
      childProcess: "KILLED",
    });
    expect(r.stdoutBytes).toBeGreaterThan(16);
    expect(w.child.killCalls).toEqual(["SIGKILL"]);
    expect(w.child.disposed).toBe(true);
  });

  it("stderr가 한도를 넘어도 같다", async () => {
    const w = world((c) => c.emitStderr("e".repeat(40)));
    const r = await observe(w, { limits });
    expect(r).toMatchObject({
      status: "FAILED",
      failure: "OUTPUT_LIMIT_EXCEEDED",
      childProcess: "KILLED",
    });
    expect(r.stderrBytes).toBeGreaterThan(16);
  });

  it("경계: 한도와 정확히 같은 바이트는 넘은 것이 아니고, 1바이트 넘으면 넘은 것이다", async () => {
    const exactly = await observe(world(finishing("9".repeat(16))), { limits });
    expect(exactly.failure).not.toBe("OUTPUT_LIMIT_EXCEEDED");
    expect(exactly.stdoutBytes).toBe(16);
    const over = await observe(world(finishing("9".repeat(17))), { limits });
    expect(over.failure).toBe("OUTPUT_LIMIT_EXCEEDED");
  });

  it("조각으로 나뉘어 와서 합이 한도를 넘어도 잡는다", async () => {
    const w = world((c) => {
      for (let i = 0; i < 10; i++) c.emitStdout("12345678");
    });
    expect((await observe(w, { limits })).failure).toBe("OUTPUT_LIMIT_EXCEEDED");
  });
});

describe("observeToolVersion — 취소", () => {
  it("실행 중 취소: 자식을 끝내고 CANCELLED로 남기며 리스너를 남기지 않는다", async () => {
    const w = world();
    const controller = new AbortController();
    const p = observeToolVersion(
      { process: w.port, clock: w.clock },
      request({ signal: controller.signal })
    );
    await w.clock.flush();
    expect(w.port.spawnCalls).toHaveLength(1); // 이미 띄웠다
    controller.abort();
    const r = await drive(w.clock, p);
    expect(r).toMatchObject({
      status: "FAILED",
      version: null,
      failure: "CANCELLED",
      childProcess: "KILLED",
    });
    expect(w.child.killCalls).toEqual(["SIGKILL"]);
    expect(w.child.disposed).toBe(true);
    expect(w.clock.pendingTimers).toBe(0);
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
  });

  it("시작 전에 이미 취소됐으면 아무것도 띄우지 않는다(NOT_ATTEMPTED)", async () => {
    const w = world();
    const r = await observe(w, { signal: AbortSignal.abort() });
    expect(r).toMatchObject({
      status: "NOT_ATTEMPTED",
      failure: "CANCELLED",
      provenance: null,
      childProcess: "NOT_SPAWNED",
    });
    expect(w.port.spawnCalls).toEqual([]);
  });

  it("띄우는 동안 취소돼도 자식을 남기지 않는다", async () => {
    const w = world();
    const controller = new AbortController();
    const p = observeToolVersion(
      { process: w.port, clock: w.clock },
      request({ signal: controller.signal })
    );
    controller.abort(); // spawn 약속이 이행되기 전
    const r = await drive(w.clock, p);
    expect(r).toMatchObject({ status: "FAILED", failure: "CANCELLED" });
    expect(w.child.disposed).toBe(true);
    expect(w.child.hasExitedNow).toBe(true);
  });

  it("취소가 이미 끝난 관측을 바꾸지 않는다", async () => {
    const w = world(finishing("1.180.0\n"));
    const controller = new AbortController();
    const r = await observe(w, { signal: controller.signal });
    // 끝난 직후, 취소하기 전에 센다 — 발동한 리스너는 { once: true }로 저절로 지워지므로 abort 뒤에 세면 누수를 못 잡는다.
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
    controller.abort();
    expect(r.status).toBe("OBSERVED");
  });
});

// ── 휠 해시 ─────────────────────────────────────────────────────

describe("observeWheelHash", () => {
  const sha256 = (data: Uint8Array | string): string =>
    createHash("sha256").update(data).digest("hex"); // 독립 계산: 이 구현과 겹치지 않는다

  it("경로를 주지 않으면 시도하지 않는다(기본 경로·자동 탐색 없음)", async () => {
    const hasher = new MemoryArtifactHasher({ "/default/semgrep.whl": "x" });
    const r = await observeWheelHash({ hasher }, { path: null });
    expect(r).toEqual({
      status: "NOT_ATTEMPTED",
      failure: "ARTIFACT_NOT_GIVEN",
      sha256: null,
      sizeBytes: null,
    });
    expect(hasher.calls).toEqual([]);
  });

  it("명시한 파일의 실제 바이트로 계산한 해시를 독립 계산값과 비교한다", async () => {
    const bytes = new Uint8Array(100_003).map((_, i) => (i * 31 + 7) % 256);
    const hasher = new MemoryArtifactHasher({ "/w/a.whl": bytes });
    const r = await observeWheelHash({ hasher }, { path: "/w/a.whl" });
    expect(r).toEqual({
      status: "OBSERVED",
      failure: null,
      sha256: sha256(bytes),
      sizeBytes: 100_003,
    });
    expect(hasher.calls).toEqual(["/w/a.whl"]);
  });

  it("파일 내용이 바뀌면 해시가 바뀌고, 되돌리면 같아진다", async () => {
    const hasher = new MemoryArtifactHasher({ "/w/a.whl": "wheel-bytes-v1" });
    const first = await observeWheelHash({ hasher }, { path: "/w/a.whl" });
    hasher.set("/w/a.whl", "wheel-bytes-v2");
    const second = await observeWheelHash({ hasher }, { path: "/w/a.whl" });
    hasher.set("/w/a.whl", "wheel-bytes-v1");
    const third = await observeWheelHash({ hasher }, { path: "/w/a.whl" });
    expect(first.sha256).toBe(sha256("wheel-bytes-v1"));
    expect(second.sha256).toBe(sha256("wheel-bytes-v2"));
    expect(second.sha256).not.toBe(first.sha256);
    expect(third.sha256).toBe(first.sha256);
  });

  it.each([
    "NOT_FOUND",
    "NOT_A_FILE",
    "TOO_LARGE",
    "READ_FAILED",
    "FILE_CHANGED_DURING_READ",
    "CANCELLED",
  ] as const)("어댑터가 %s로 실패하면 성공값으로 보정하지 않는다(해시 null)", async (reason) => {
    const hasher = new MemoryArtifactHasher({ "/w/a.whl": "x" });
    hasher.failWith("/w/a.whl", reason);
    const r = await observeWheelHash({ hasher }, { path: "/w/a.whl" });
    expect(r).toEqual({ status: "FAILED", failure: reason, sha256: null, sizeBytes: null });
  });

  it("없는 파일은 NOT_FOUND다", async () => {
    const r = await observeWheelHash(
      { hasher: new MemoryArtifactHasher() },
      { path: "/w/none.whl" }
    );
    expect(r).toMatchObject({ status: "FAILED", failure: "NOT_FOUND", sha256: null });
  });

  it("알 수 없는 오류는 READ_FAILED이고 오류 원문은 남기지 않는다", async () => {
    const hasher: MemoryArtifactHasher = new MemoryArtifactHasher();
    hasher.hashFile = async () => {
      throw new Error("EIO: /secret/path");
    };
    const r = await observeWheelHash({ hasher }, { path: "/w/a.whl" });
    expect(r).toEqual({ status: "FAILED", failure: "READ_FAILED", sha256: null, sizeBytes: null });
  });

  it.each([
    ["대문자 16진", { sha256: "A".repeat(64), sizeBytes: 1 }],
    ["63자", { sha256: "a".repeat(63), sizeBytes: 1 }],
    ["65자", { sha256: "a".repeat(65), sizeBytes: 1 }],
    ["16진이 아님", { sha256: "g".repeat(64), sizeBytes: 1 }],
    ["문자열이 아님", { sha256: 123, sizeBytes: 1 }],
    ["음수 크기", { sha256: "a".repeat(64), sizeBytes: -1 }],
    ["정수가 아닌 크기", { sha256: "a".repeat(64), sizeBytes: 1.5 }],
    ["크기 없음", { sha256: "a".repeat(64), sizeBytes: undefined }],
  ])(
    "어댑터가 형식이 틀린 값을 주면(%s) HASH_MALFORMED이고 해시를 돌려주지 않는다",
    async (_name, forced) => {
      const hasher = new MemoryArtifactHasher({ "/w/a.whl": "x" });
      hasher.forcedResult = forced;
      const r = await observeWheelHash({ hasher }, { path: "/w/a.whl" });
      expect(r).toEqual({
        status: "FAILED",
        failure: "HASH_MALFORMED",
        sha256: null,
        sizeBytes: null,
      });
    }
  );

  it("이미 취소됐으면 읽지 않는다", async () => {
    const hasher = new MemoryArtifactHasher({ "/w/a.whl": "x" });
    const r = await observeWheelHash({ hasher }, { path: "/w/a.whl", signal: AbortSignal.abort() });
    expect(r).toMatchObject({ status: "NOT_ATTEMPTED", failure: "CANCELLED" });
    expect(hasher.calls).toEqual([]);
  });

  it("크기 상한을 어댑터에 넘긴다(기본값 또는 호출자가 정한 값)", async () => {
    const seen: number[] = [];
    const hasher = new MemoryArtifactHasher();
    hasher.hashFile = async (_p, o) => {
      seen.push(o.maxBytes);
      throw new ArtifactHashError("TOO_LARGE", "큼");
    };
    await observeWheelHash({ hasher }, { path: "/w/a.whl" });
    await observeWheelHash({ hasher }, { path: "/w/a.whl", maxBytes: 5 });
    expect(seen).toEqual([DEFAULT_WHEEL_MAX_BYTES, 5]);
  });
});

// ── 두 관측을 잇는다 ────────────────────────────────────────────

describe("runToolObservation", () => {
  class CountingReceiver implements MetricsObserver {
    hits: number | null = 0;
    throwOnObserve = false;
    observeCalls = 0;
    observe(): MetricsReceiverSummary {
      this.observeCalls += 1;
      if (this.throwOnObserve) throw new Error("observe 실패");
      return {
        bind: "127.0.0.1",
        state: "LISTENING",
        failure: null,
        hits: this.hits,
        connections: 0,
        requests: 0,
        client_errors: 0,
      };
    }
  }

  function setup(script: (child: FakeChild) => void = finishing("1.180.0\n")) {
    const w = world(script);
    const mkdirs: string[] = [];
    const fs = {
      async mkdirp(path: string): Promise<void> {
        mkdirs.push(path);
      },
    };
    const hasher = new MemoryArtifactHasher({ "/w/a.whl": "wheel" });
    const receiver = new CountingReceiver();
    const base = {
      fs,
      process: w.port,
      clock: w.clock,
      hasher,
      lockHeld: true,
      version: {
        command: BIN,
        cwd: "/ev/version-check-state",
        stateDir: "/ev/version-check-state",
        env: { PATH: "/usr/bin" },
      },
      wheelPath: "/w/a.whl" as string | null,
      receiver: receiver as MetricsObserver | null,
    };
    return { w, base, mkdirs, hasher, receiver };
  }

  it("정상: 상태 폴더를 만든 뒤 버전을 띄우고, 두 관측값과 증거용 요약을 돌려준다", async () => {
    const s = setup();
    const r = await drive(s.w.clock, runToolObservation(s.base));

    expect(s.mkdirs).toEqual(["/ev/version-check-state"]);
    expect(s.w.port.spawnCalls[0]).toMatchObject({
      command: BIN,
      args: ["--version"],
      cwd: "/ev/version-check-state",
    });
    expect(r.toolVersionObserved).toBe("1.180.0");
    expect(r.wheelSha256Observed).toBe(createHash("sha256").update("wheel").digest("hex"));
    expect(r.versionChildProcess).toBe("EXITED");
    expect(r.summary.version_check).toMatchObject({
      process_role: "version-check",
      provenance: "stub",
      status: "OBSERVED",
      version: "1.180.0",
      args: ["--version"],
      child_process: "EXITED",
    });
    expect(r.summary.wheel_hash).toMatchObject({ status: "OBSERVED", size_bytes: 5 });
    // 이 관측이 세워 주지 않는 것은 항상 명시한다.
    expect(r.summary.not_established).toEqual({
      executable_provenance: "NOT_VERIFIED",
      version_output_format: "UNVERIFIED",
    });
  });

  it("증거용 요약에는 실행 파일·아티팩트 경로와 출력 원문이 없다", async () => {
    const s = setup((c) => {
      c.emitStderr("secret-looking-stderr-text\n");
      c.emitStdout("1.180.0\n");
      c.exit(0);
    });
    const r = await drive(s.w.clock, runToolObservation(s.base));
    const text = JSON.stringify(r.summary);
    expect(text).not.toContain(BIN);
    expect(text).not.toContain("/w/a.whl");
    expect(text).not.toContain("secret-looking");
    expect(text).not.toContain("/ev/");
  });

  it("버전 확인이 도는 동안 늘어난 수신기 요청 건수를 따로 기록한다", async () => {
    const s = setup(() => {}); // 자식이 아직 끝나지 않았다
    s.receiver.hits = 2; // 시작 전에 이미 2건(이 확인과 무관한 값)
    const p = runToolObservation(s.base);
    await s.w.clock.flush();
    expect(s.w.port.spawnCalls).toHaveLength(1); // 띄운 뒤
    s.receiver.hits = 5; // 버전 확인 도중 3건 늘어났다
    s.w.child.emitStdout("1.180.0\n");
    s.w.child.exit(0);
    const r = await drive(s.w.clock, p);
    expect(r.summary.version_check.metrics_hits_during).toBe(3);
  });

  it("수신기를 관측하지 못하면 늘어난 건수는 0이 아니라 null이다", async () => {
    const s = setup();
    s.receiver.throwOnObserve = true;
    expect(
      (await drive(s.w.clock, runToolObservation(s.base))).summary.version_check.metrics_hits_during
    ).toBeNull();
    const none = setup();
    const r = await drive(none.w.clock, runToolObservation({ ...none.base, receiver: null }));
    expect(r.summary.version_check.metrics_hits_during).toBeNull();
    expect(r.toolVersionObserved).toBe("1.180.0");
  });

  it("잠금이 없으면 아무것도 시작하지 않는다: 폴더·프로세스·파일 읽기 모두 없다", async () => {
    const s = setup();
    const r = await drive(s.w.clock, runToolObservation({ ...s.base, lockHeld: false }));
    expect(s.mkdirs).toEqual([]);
    expect(s.w.port.spawnCalls).toEqual([]);
    expect(s.hasher.calls).toEqual([]);
    expect(s.receiver.observeCalls).toBe(0);
    expect(r.toolVersionObserved).toBeNull();
    expect(r.wheelSha256Observed).toBeNull();
    expect(r.summary.version_check).toMatchObject({
      status: "NOT_ATTEMPTED",
      failure: "LOCK_NOT_HELD",
      provenance: null,
      child_process: "NOT_SPAWNED",
    });
    expect(r.summary.wheel_hash).toMatchObject({
      status: "NOT_ATTEMPTED",
      failure: "LOCK_NOT_HELD",
    });
  });

  it("이미 취소됐으면 폴더도 만들지 않고 아무것도 시작하지 않는다", async () => {
    const s = setup();
    const r = await drive(
      s.w.clock,
      runToolObservation({ ...s.base, signal: AbortSignal.abort() })
    );
    expect(s.mkdirs).toEqual([]);
    expect(s.w.port.spawnCalls).toEqual([]);
    expect(s.hasher.calls).toEqual([]);
    expect(r.summary.version_check).toMatchObject({
      status: "NOT_ATTEMPTED",
      failure: "CANCELLED",
    });
    expect(r.summary.wheel_hash).toMatchObject({ status: "NOT_ATTEMPTED", failure: "CANCELLED" });
  });

  it("상태 폴더를 만들지 못하면 프로세스를 띄우지 않고, 휠 관측은 따로 시도한다", async () => {
    const s = setup();
    const base = { ...s.base, fs: { mkdirp: () => Promise.reject(new Error("EACCES")) } };
    const r = await drive(s.w.clock, runToolObservation(base));
    expect(s.w.port.spawnCalls).toEqual([]);
    expect(r.summary.version_check).toMatchObject({
      status: "NOT_ATTEMPTED",
      failure: "STATE_DIR_NOT_CREATED",
    });
    expect(r.toolVersionObserved).toBeNull();
    expect(r.wheelSha256Observed).not.toBeNull();
  });

  it("한쪽이 실패해도 다른 쪽은 독립적으로 관측한다", async () => {
    const versionFails = setup(finishing("garbage\n"));
    const a = await drive(versionFails.w.clock, runToolObservation(versionFails.base));
    expect(a.toolVersionObserved).toBeNull();
    expect(a.wheelSha256Observed).not.toBeNull();

    const wheelFails = setup();
    wheelFails.hasher.failWith("/w/a.whl", "READ_FAILED");
    const b = await drive(wheelFails.w.clock, runToolObservation(wheelFails.base));
    expect(b.toolVersionObserved).toBe("1.180.0");
    expect(b.wheelSha256Observed).toBeNull();
    expect(b.summary.wheel_hash.failure).toBe("READ_FAILED");
  });

  it("휠 경로를 주지 않으면 휠만 관측하지 않는다(버전은 관측한다)", async () => {
    const s = setup();
    const r = await drive(s.w.clock, runToolObservation({ ...s.base, wheelPath: null }));
    expect(r.toolVersionObserved).toBe("1.180.0");
    expect(r.wheelSha256Observed).toBeNull();
    expect(r.summary.wheel_hash).toMatchObject({
      status: "NOT_ATTEMPTED",
      failure: "ARTIFACT_NOT_GIVEN",
    });
    expect(s.hasher.calls).toEqual([]);
  });

  it("던지지 않는다: 프로세스 포트나 해시 포트가 뜻밖에 던져도 관측 실패로 남는다", async () => {
    const s = setup();
    const throwingPort = {
      provenance: "stub" as const,
      spawn: (): Promise<ChildHandle> => {
        throw new Error("동기 예외");
      },
    };
    s.hasher.hashFile = () => {
      throw new Error("동기 예외");
    };
    const r = await drive(s.w.clock, runToolObservation({ ...s.base, process: throwingPort }));
    expect(r.toolVersionObserved).toBeNull();
    expect(r.wheelSha256Observed).toBeNull();
    expect(r.summary.version_check.status).toBe("FAILED");
    expect(r.summary.wheel_hash).toMatchObject({ status: "FAILED", failure: "READ_FAILED" });
  });

  it("notAttemptedVersion은 프로세스 출처를 담지 않는다", () => {
    expect(notAttemptedVersion("LOCK_NOT_HELD")).toMatchObject({
      status: "NOT_ATTEMPTED",
      provenance: null,
      args: null,
      exit: null,
    });
  });
});

// ── 핀과의 비교(증거용) ─────────────────────────────────────────

describe("completeToolObservation / toolObservationConflict", () => {
  const OBS_WHEEL = "c".repeat(64);
  const pinWith = (wheel: Partial<Pin["semgrep"]["wheel"]>): Pin =>
    ({
      semgrep: {
        version: "1.180.0",
        commit: "a".repeat(40),
        wheel: {
          filename: null,
          size_bytes_rev1_reported: 1,
          sha256: null,
          sha256_rev1_reported: "d".repeat(64),
          verified: false,
          ...wheel,
        },
      },
    }) as unknown as Pin;

  const summaryOf = (version: string | null, wheel: string | null) => {
    const base = notAttemptedVersion("LOCK_NOT_HELD");
    return {
      version_check: {
        process_role: "version-check" as const,
        provenance: version === null ? null : ("stub" as const),
        status: version === null ? ("NOT_ATTEMPTED" as const) : ("OBSERVED" as const),
        failure: version === null ? "LOCK_NOT_HELD" : null,
        version,
        args: version === null ? null : ["--version"],
        exit: version === null ? null : { code: 0, signal: null },
        stdout_bytes: version === null ? null : 8,
        stderr_bytes: version === null ? null : 0,
        duration_ms: version === null ? null : 3,
        child_process: base.childProcess,
        metrics_hits_during: null,
      },
      wheel_hash: {
        status: wheel === null ? ("NOT_ATTEMPTED" as const) : ("OBSERVED" as const),
        failure: wheel === null ? "ARTIFACT_NOT_GIVEN" : null,
        sha256: wheel,
        size_bytes: wheel === null ? null : 10,
      },
      not_established: {
        executable_provenance: "NOT_VERIFIED" as const,
        version_output_format: "UNVERIFIED" as const,
      },
    };
  };

  it("버전: 일치·불일치·미관측을 구분한다", () => {
    const pin = pinWith({});
    expect(
      completeToolObservation(summaryOf("1.180.0", null), pin, "1.180.0", null).pin.version
    ).toEqual({
      expected: "1.180.0",
      observed: "1.180.0",
      comparison: "MATCH",
    });
    expect(
      completeToolObservation(summaryOf("1.179.0", null), pin, "1.179.0", null).pin.version
        .comparison
    ).toBe("MISMATCH");
    expect(completeToolObservation(summaryOf(null, null), pin, null, null).pin.version).toEqual({
      expected: "1.180.0",
      observed: null,
      comparison: "NOT_OBSERVED",
    });
  });

  it("휠: 핀의 해시가 null이거나 verified가 아니면 관측값이 있어도 PIN_UNVERIFIED다(기준이 없다)", () => {
    for (const wheel of [
      { sha256: null, verified: false },
      { sha256: null, verified: true },
      { sha256: OBS_WHEEL, verified: false }, // 값이 같아도 확인되지 않은 핀이다
    ]) {
      const r = completeToolObservation(
        summaryOf("1.180.0", OBS_WHEEL),
        pinWith(wheel),
        "1.180.0",
        OBS_WHEEL
      );
      expect(r.pin.wheel.comparison, JSON.stringify(wheel)).toBe("PIN_UNVERIFIED");
      expect(r.pin.wheel.observed).toBe(OBS_WHEEL);
      expect(r.pin.wheel.verified).toBe(wheel.verified);
    }
  });

  it("휠: 확인된 핀과는 일치·불일치·미관측을 구분한다", () => {
    const pin = pinWith({ sha256: OBS_WHEEL, verified: true });
    expect(
      completeToolObservation(summaryOf(null, OBS_WHEEL), pin, null, OBS_WHEEL).pin.wheel
    ).toEqual({
      expected_sha256: OBS_WHEEL,
      verified: true,
      observed: OBS_WHEEL,
      comparison: "MATCH",
    });
    expect(
      completeToolObservation(summaryOf(null, "e".repeat(64)), pin, null, "e".repeat(64)).pin.wheel
        .comparison
    ).toBe("MISMATCH");
    expect(
      completeToolObservation(summaryOf(null, null), pin, null, null).pin.wheel.comparison
    ).toBe("NOT_OBSERVED");
  });

  it("핀과 요약을 바꾸지 않는다(관측했다고 verified를 올리지 않는다)", () => {
    const pin = pinWith({ sha256: null, verified: false });
    const summary = summaryOf("1.180.0", OBS_WHEEL);
    const pinBefore = JSON.stringify(pin);
    const summaryBefore = JSON.stringify(summary);
    const frozen = structuredClone(summary);
    Object.freeze(pin.semgrep.wheel);
    Object.freeze(pin.semgrep);
    const r = completeToolObservation(summary, pin, "1.180.0", OBS_WHEEL);
    expect(JSON.stringify(pin)).toBe(pinBefore);
    expect(JSON.stringify(summary)).toBe(summaryBefore);
    expect(pin.semgrep.wheel.verified).toBe(false);
    expect(pin.semgrep.wheel.sha256).toBeNull();
    expect(r.pin.wheel.verified).toBe(false);
    // 결과의 요약 부분은 입력의 복사본이다(같은 객체를 공유하지 않는다).
    expect(r.version_check).toEqual(frozen.version_check);
    expect(r.version_check).not.toBe(summary.version_check);
  });

  it("요약이 하네스에 넘긴 값과 모순되면 사유를 돌려준다", () => {
    expect(
      toolObservationConflict(summaryOf("1.180.0", OBS_WHEEL), "1.180.0", OBS_WHEEL)
    ).toBeNull();
    expect(toolObservationConflict(summaryOf(null, null), null, null)).toBeNull();
    expect(toolObservationConflict(summaryOf("1.180.0", null), "9.9.9", null)).toContain("버전");
    expect(toolObservationConflict(summaryOf("1.180.0", null), null, null)).toContain("버전");
    expect(toolObservationConflict(summaryOf(null, OBS_WHEEL), null, "f".repeat(64))).toContain(
      "휠"
    );
    expect(toolObservationConflict(summaryOf(null, null), null, OBS_WHEEL)).toContain("휠");
    // 상태와 값이 서로 모순
    const contradictory = summaryOf("1.180.0", null);
    contradictory.version_check.status = "FAILED" as never;
    expect(toolObservationConflict(contradictory, "1.180.0", null)).toContain("모순");
  });
});

// 요청 자체를 바꾸지 않는다: 호출자가 준 인자 배열을 변형하지 않고 그대로 복사해서 쓴다.
describe("요청 불변", () => {
  it("호출자의 인자 배열을 바꾸지 않고, 결과의 args는 복사본이다", async () => {
    const w = world(finishing("1.180.0\n"));
    const args = Object.freeze(["--version"]) as readonly string[];
    const r = await drive(
      w.clock,
      observeToolVersion({ process: w.port, clock: w.clock }, request({ args }))
    );
    expect(r.args).toEqual(["--version"]);
    expect(r.args).not.toBe(args);
    expect(args).toEqual(["--version"]);
  });
});
