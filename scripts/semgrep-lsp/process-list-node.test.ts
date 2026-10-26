import { getEventListeners } from "node:events";
import { describe, expect, it } from "vitest";
import { VirtualClock } from "./clock";
import {
  DEFAULT_LIST_LIMITS,
  createNodeProcessLister,
  createProcProcessLister,
  createUnsupportedProcessLister,
  createWindowsProcessLister,
} from "./process-list-node";
import { WINDOWS_EXIT_PERMISSION_DENIED, windowsListArgs } from "./process-list";
import { FakeChild, FakePort } from "./testing/fake-process";
import { MemoryProcFs, cmdlineOf, statusText } from "./testing/memory-procfs";
import { drive } from "./testing/stub-lsp";
import type { Clock, ProcessListResult } from "./types";

// 어댑터 시험: 가짜 프로세스 포트와 메모리 /proc, 가상 시계만 쓴다 — **실제 운영체제를 읽지 않는다**(합성 자료). 여기서의 통과는 어댑터가
// 실패 경로를 던지지 않고 토큰으로 바꾸며 자기 조회 자식만 정리한다는 뜻이다. 실제 운영체제를 읽는 시험은 process-list-node.integration.test.ts에 있다.

const b64 = (text: string | null): string =>
  text === null ? "-" : `=${Buffer.from(text, "utf8").toString("base64")}`;
const row = (
  pid: number,
  ppid: number,
  name: string,
  exe: string | null,
  cmd: string | null
): string => ["P", pid, ppid, 1000 + pid, b64(name), b64(exe), b64(cmd)].join("\t");
const LISTING = `${[
  row(4, 0, "System", null, null),
  row(900, 4, "semgrep.exe", "C:\\Py\\semgrep.exe", '"C:\\Py\\semgrep.exe" lsp'),
  "END\t2",
].join("\r\n")}\r\n`;

const SYSTEM_ROOT = "C:\\Windows";
const PS = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
const ENV = { SystemRoot: SYSTEM_ROOT, PATH: "C:\\Windows\\System32" };

// ── Windows 어댑터 ────────────────────────────────────────────────

describe("createWindowsProcessLister — 가짜 포트", () => {
  function setup(
    script: (child: FakeChild) => void = () => {},
    childOptions: ConstructorParameters<typeof FakeChild>[0] = {}
  ) {
    const clock = new VirtualClock();
    const child = new FakeChild(childOptions);
    const port = new FakePort({ childFactory: () => child });
    script(child);
    const lister = createWindowsProcessLister({
      process: port,
      clock,
      systemRoot: SYSTEM_ROOT,
      env: ENV,
    });
    return { clock, child, port, lister };
  }
  const list = (w: ReturnType<typeof setup>, signal?: AbortSignal): Promise<ProcessListResult> =>
    drive(w.clock, w.lister.list(signal ? { signal } : {}));
  const finishing =
    (stdout: string, code: number | null = 0, signal: string | null = null) =>
    (child: FakeChild): void => {
      child.emitStdout(stdout);
      child.exit(code, signal);
    };

  it("정상: 고정 경로의 powershell을 인자 배열로 한 번 띄우고 부모 시작 시각이 필요한 스냅샷을 돌려준다", async () => {
    const w = setup(finishing(LISTING));
    const result = await list(w);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot).toMatchObject({
      source: "windows-cim",
      parentLinkNeedsStartTime: true,
    });
    expect(result.snapshot.rows.map((r) => r.pid)).toEqual([4, 900]);
    expect(w.lister).toMatchObject({ provenance: "stub", source: "windows-cim" });
    expect(w.port.spawnCalls).toHaveLength(1);
    expect(w.port.spawnCalls[0]).toEqual({
      command: PS,
      args: windowsListArgs(),
      cwd: "C:\\Windows",
      env: ENV,
    });
    expect(w.child.disposed).toBe(true);
    expect(w.child.killCalls).toEqual([]); // 정상 종료한 자식은 끝낼 필요가 없다
  });

  it("종료 코드 5는 권한 부족, 그 밖의 0 아닌 코드와 신호 종료는 NONZERO_EXIT이다", async () => {
    expect(await list(setup(finishing("", WINDOWS_EXIT_PERMISSION_DENIED)))).toEqual({
      ok: false,
      failure: "PERMISSION_DENIED",
    });
    expect(await list(setup(finishing("", 6)))).toEqual({ ok: false, failure: "NONZERO_EXIT" });
    expect(await list(setup(finishing(LISTING, 1)))).toEqual({
      ok: false,
      failure: "NONZERO_EXIT",
    });
    expect(await list(setup(finishing(LISTING, null, "SIGKILL")))).toEqual({
      ok: false,
      failure: "NONZERO_EXIT",
    });
  });

  it("출력 파손: 잘림·건수 불일치·쓰레기는 OUTPUT_MALFORMED이고 부분 결과를 주지 않는다", async () => {
    const truncated = LISTING.slice(0, LISTING.indexOf("END"));
    for (const text of [truncated, "", "not a listing\r\n", LISTING.replace("END\t2", "END\t3")]) {
      expect(await list(setup(finishing(text))), JSON.stringify(text).slice(0, 30)).toEqual({
        ok: false,
        failure: "OUTPUT_MALFORMED",
      });
    }
  });

  it("실행 파일을 띄우지 못하면 SPAWN_FAILED, 권한 오류(EACCES·EPERM)면 PERMISSION_DENIED이다", async () => {
    const w = setup();
    w.port.failSpawnWith(Object.assign(new Error("spawn powershell ENOENT"), { code: "ENOENT" }));
    expect(await list(w)).toEqual({ ok: false, failure: "SPAWN_FAILED" });
    for (const code of ["EACCES", "EPERM"]) {
      const v = setup();
      v.port.failSpawnWith(Object.assign(new Error(code), { code }));
      expect(await list(v), code).toEqual({ ok: false, failure: "PERMISSION_DENIED" });
    }
  });

  it("시간 초과: 끝나지 않는 조회 자식을 SIGKILL로 끝내고 정리한 뒤 TIMEOUT이다", async () => {
    const w = setup();
    const result = await list(w);
    expect(result).toEqual({ ok: false, failure: "TIMEOUT" });
    expect(w.child.killCalls).toEqual(["SIGKILL"]);
    expect(w.child.disposed).toBe(true);
    expect(w.clock.pendingTimers).toBe(0); // 타이머를 남기지 않는다
  });

  it("종료 신호를 무시하는 자식이어도 매달리지 않는다(killWaitMs 뒤 dispose)", async () => {
    const w = setup(() => {}, { onKill: "ignore-all" });
    const result = await list(w);
    expect(result).toEqual({ ok: false, failure: "TIMEOUT" });
    expect(w.child.disposed).toBe(true);
    expect(w.clock.pendingTimers).toBe(0);
  });

  it("출력이 한도를 넘으면 OUTPUT_LIMIT_EXCEEDED이고 자식을 끝낸다", async () => {
    const clock = new VirtualClock();
    const child = new FakeChild();
    child.emitStdout("x".repeat(100));
    const lister = createWindowsProcessLister({
      process: new FakePort({ childFactory: () => child }),
      clock,
      systemRoot: SYSTEM_ROOT,
      env: ENV,
      limits: { maxStdoutBytes: 50 },
    });
    expect(await drive(clock, lister.list({}))).toEqual({
      ok: false,
      failure: "OUTPUT_LIMIT_EXCEEDED",
    });
    expect(child.killCalls).toEqual(["SIGKILL"]);
    expect(child.disposed).toBe(true);
  });

  it("stderr가 한도를 넘어도 OUTPUT_LIMIT_EXCEEDED다(stderr는 해석하지 않는다)", async () => {
    const clock = new VirtualClock();
    const child = new FakeChild();
    child.emitStderr("e".repeat(100));
    const lister = createWindowsProcessLister({
      process: new FakePort({ childFactory: () => child }),
      clock,
      systemRoot: SYSTEM_ROOT,
      env: ENV,
      limits: { maxStderrBytes: 10 },
    });
    expect(await drive(clock, lister.list({}))).toEqual({
      ok: false,
      failure: "OUTPUT_LIMIT_EXCEEDED",
    });
  });

  it("행 수 한도를 넘는 목록은 파손으로 본다", async () => {
    const clock = new VirtualClock();
    const child = new FakeChild();
    child.emitStdout(LISTING);
    child.exit(0, null);
    const lister = createWindowsProcessLister({
      process: new FakePort({ childFactory: () => child }),
      clock,
      systemRoot: SYSTEM_ROOT,
      env: ENV,
      limits: { maxRows: 1 },
    });
    expect(await drive(clock, lister.list({}))).toEqual({ ok: false, failure: "OUTPUT_MALFORMED" });
  });

  it("이미 취소됐으면 띄우지 않는다", async () => {
    const controller = new AbortController();
    controller.abort();
    const w = setup();
    expect(await list(w, controller.signal)).toEqual({ ok: false, failure: "CANCELLED" });
    expect(w.port.spawnCalls).toEqual([]);
  });

  it("조회 도중 취소되면 자식을 끝내고 정리한 뒤 CANCELLED이며 리스너를 남기지 않는다", async () => {
    const controller = new AbortController();
    const w = setup();
    const pending = w.lister.list({ signal: controller.signal });
    await w.clock.advance(10);
    controller.abort();
    expect(await drive(w.clock, pending)).toEqual({ ok: false, failure: "CANCELLED" });
    expect(w.child.killCalls).toEqual(["SIGKILL"]);
    expect(w.child.disposed).toBe(true);
    expect(w.clock.pendingTimers).toBe(0);
  });

  it("정상·실패·시간 초과 어느 경로로 끝나도 취소 신호에 리스너를 남기지 않는다", async () => {
    for (const script of [finishing(LISTING), finishing("", 6), () => {}]) {
      const controller = new AbortController();
      const w = setup(script);
      await list(w, controller.signal);
      expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
      expect(w.clock.pendingTimers).toBe(0);
    }
  });

  it("끝낼 수 있는 것은 이 어댑터가 띄운 조회 자식 하나뿐이다(spawn은 한 번)", async () => {
    const w = setup();
    await list(w);
    expect(w.port.spawnCalls).toHaveLength(1);
    expect(w.port.children).toHaveLength(1);
  });

  it("SystemRoot가 절대 경로가 아니면 지원하지 않는 환경이다 — 아무것도 띄우지 않는다", async () => {
    const port = new FakePort();
    const lister = createWindowsProcessLister({
      process: port,
      clock: new VirtualClock(),
      systemRoot: "Windows",
      env: ENV,
    });
    expect(lister.source).toBeNull();
    expect(await lister.list({})).toEqual({ ok: false, failure: "UNSUPPORTED_PLATFORM" });
    expect(port.spawnCalls).toEqual([]);
  });
});

// ── Linux /proc 어댑터 ────────────────────────────────────────────

describe("createProcProcessLister — 메모리 /proc", () => {
  const lister = (
    procFs: MemoryProcFs,
    over: Partial<Parameters<typeof createProcProcessLister>[0]> = {}
  ) => createProcProcessLister({ procFs, clock: new VirtualClock(), provenance: "stub", ...over });

  function sample(): MemoryProcFs {
    return new MemoryProcFs()
      .add(1, {
        status: statusText("init", 0),
        cmdline: cmdlineOf("/sbin/init"),
        exe: "/sbin/init",
        cwd: "/",
      })
      .add(900, {
        status: statusText("semgrep", 1),
        cmdline: cmdlineOf("/opt/my tools/semgrep", "lsp", "--debug"),
        exe: "/opt/my tools/semgrep",
        cwd: "/work/scan-tree",
      });
  }

  it("정상: 숫자 항목만 PID 오름차순으로 읽고 인자 경계·작업 폴더·실행 파일을 보존한다", async () => {
    const result = await lister(sample()).list({});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot).toMatchObject({
      source: "linux-proc",
      parentLinkNeedsStartTime: false,
    });
    expect(result.snapshot.rows).toEqual([
      {
        pid: 1,
        ppid: 0,
        startTime: null,
        name: "init",
        executable: "/sbin/init",
        args: ["/sbin/init"],
        cwd: "/",
        vanished: false,
      },
      {
        pid: 900,
        ppid: 1,
        startTime: null,
        name: "semgrep",
        executable: "/opt/my tools/semgrep",
        args: ["/opt/my tools/semgrep", "lsp", "--debug"],
        cwd: "/work/scan-tree",
        vanished: false,
      },
    ]);
  });

  it("출처(provenance)와 source를 그대로 알린다", () => {
    expect(lister(sample())).toMatchObject({ provenance: "stub", source: "linux-proc" });
    expect(lister(sample(), { provenance: "real" }).provenance).toBe("real");
  });

  it("다른 사용자의 프로세스: 실행 파일·작업 폴더는 권한이 없어 null이지만 인자는 읽고 사라진 것으로 보지 않는다", async () => {
    const procFs = sample().fault("/proc/900/exe", "EACCES").fault("/proc/900/cwd", "EACCES");
    const result = await lister(procFs).list({});
    expect(result.ok && result.snapshot.rows[1]).toMatchObject({
      executable: null,
      cwd: null,
      args: ["/opt/my tools/semgrep", "lsp", "--debug"],
      vanished: false,
    });
  });

  it("인자를 읽을 권한이 없으면 args는 null이다(빈 배열로 보정하지 않는다)", async () => {
    const procFs = sample().fault("/proc/900/cmdline", "EACCES");
    const result = await lister(procFs).list({});
    expect(result.ok && result.snapshot.rows[1]).toMatchObject({
      args: null,
      name: "semgrep",
      vanished: false,
    });
  });

  it("상태나 인자를 읽다가 권한 오류도 사라짐도 아닌 읽기 오류(EIO)를 만나면 빈 행으로 보정하지 않고 목록 전체가 READ_FAILED다(독립 검토 B1)", async () => {
    for (const file of ["status", "cmdline"]) {
      const procFs = sample().fault(`/proc/900/${file}`, "EIO");
      expect(await lister(procFs).list({}), file).toEqual({ ok: false, failure: "READ_FAILED" });
    }
  });

  it("권한이 없어 네 칸을 모두 못 읽은 프로세스는 이름·인자가 모두 null인 채로 남는다(판정이 판별 불가로 본다)", async () => {
    const procFs = sample()
      .fault("/proc/900/status", "EACCES")
      .fault("/proc/900/cmdline", "EACCES")
      .fault("/proc/900/exe", "EACCES")
      .fault("/proc/900/cwd", "EACCES");
    const result = await lister(procFs).list({});
    expect(result.ok && result.snapshot.rows[1]).toEqual({
      pid: 900,
      ppid: null,
      startTime: null,
      name: null,
      executable: null,
      args: null,
      cwd: null,
      vanished: false,
    });
  });

  it("그 밖의 읽기 오류(EIO)는 해당 칸만 null이고 사라진 것이 아니다", async () => {
    const procFs = sample().fault("/proc/900/cwd", "EIO");
    const result = await lister(procFs).list({});
    expect(result.ok && result.snapshot.rows[1]).toMatchObject({ cwd: null, vanished: false });
  });

  it("커널 스레드: 실행 파일 링크가 없고 인자가 비어 있어도 사라진 것이 아니다", async () => {
    const procFs = new MemoryProcFs().add(2, {
      status: statusText("kthreadd", 0),
      cmdline: "",
      exe: undefined as unknown as string, // 링크 없음(ENOENT)
      cwd: "/",
    });
    const result = await lister(procFs).list({});
    expect(result.ok && result.snapshot.rows[0]).toMatchObject({
      pid: 2,
      name: "kthreadd",
      executable: null,
      args: [],
      cwd: "/",
      vanished: false,
    });
  });

  it("읽는 도중 사라짐: 상태를 읽을 때 이미 없으면 vanished 행이다", async () => {
    // 목록에 나왔지만 읽기 전에 사라진 PID.
    const procFs = sample();
    const list = procFs.readdir.bind(procFs);
    procFs.readdir = async (path: string) => [...(await list(path)), "777"];
    const result = await lister(procFs).list({});
    expect(result.ok && result.snapshot.rows.find((r) => r.pid === 777)).toMatchObject({
      vanished: true,
      name: null,
      ppid: null,
      args: null,
      executable: null,
      cwd: null,
    });
  });

  it("읽는 도중 사라짐: 앞쪽 칸을 읽은 뒤 링크를 읽는 사이에 끝나면 vanished로 표시한다(읽은 칸은 남는다)", async () => {
    const procFs = sample().vanishWhenReading("/proc/900/exe", 900);
    const result = await lister(procFs).list({});
    const gone = result.ok ? result.snapshot.rows.find((r) => r.pid === 900) : undefined;
    expect(gone).toMatchObject({ vanished: true, name: null });
  });

  it("상태 파일이 비어 있으면(끝나는 중) vanished다", async () => {
    const procFs = sample();
    procFs.add(901, { status: "", cmdline: "", exe: "/x", cwd: "/" });
    const result = await lister(procFs).list({});
    expect(result.ok && result.snapshot.rows.find((r) => r.pid === 901)?.vanished).toBe(true);
  });

  it("상태 파일이 깨졌으면(비어 있지 않은데 Name·PPid를 못 읽음) 목록 전체가 OUTPUT_MALFORMED다", async () => {
    const procFs = sample().add(902, {
      status: "garbage without keys\n",
      cmdline: "",
      exe: "/x",
      cwd: "/",
    });
    expect(await lister(procFs).list({})).toEqual({ ok: false, failure: "OUTPUT_MALFORMED" });
  });

  it("/proc 나열 실패: 권한 없음 → PERMISSION_DENIED, /proc 없음 → UNSUPPORTED_PLATFORM, 그 밖 → READ_FAILED", async () => {
    expect(await lister(sample().failRoot("EACCES")).list({})).toEqual({
      ok: false,
      failure: "PERMISSION_DENIED",
    });
    expect(await lister(sample().failRoot("ENOENT")).list({})).toEqual({
      ok: false,
      failure: "UNSUPPORTED_PLATFORM",
    });
    expect(await lister(sample().failRoot("EIO")).list({})).toEqual({
      ok: false,
      failure: "READ_FAILED",
    });
  });

  it("행 수 한도를 넘으면 읽기 전에 OUTPUT_LIMIT_EXCEEDED다", async () => {
    const procFs = sample();
    const result = await lister(procFs, { limits: { maxRows: 1 } }).list({});
    expect(result).toEqual({ ok: false, failure: "OUTPUT_LIMIT_EXCEEDED" });
    expect(procFs.reads.filter((p) => p.endsWith("/status"))).toEqual([]);
  });

  it("이미 취소됐으면 읽지 않는다", async () => {
    const controller = new AbortController();
    controller.abort();
    const procFs = sample();
    expect(await lister(procFs).list({ signal: controller.signal })).toEqual({
      ok: false,
      failure: "CANCELLED",
    });
    expect(procFs.reads).toEqual([]);
  });

  it("읽는 도중(배치 사이) 취소되면 CANCELLED다", async () => {
    const procFs = new MemoryProcFs();
    for (let pid = 10; pid < 10 + 80; pid++) {
      procFs.add(pid, { status: statusText("p", 1), cmdline: cmdlineOf("p"), exe: "/p", cwd: "/" });
    }
    const controller = new AbortController();
    const readFile = procFs.readFile.bind(procFs);
    let reads = 0;
    procFs.readFile = async (path: string) => {
      if (++reads === 40) controller.abort();
      return readFile(path);
    };
    expect(await lister(procFs).list({ signal: controller.signal })).toEqual({
      ok: false,
      failure: "CANCELLED",
    });
    // 취소 뒤에는 다음 배치(PID 42 이후)를 읽지 않는다 — 끝까지 읽고 나서 취소로 알리지 않는다.
    expect(procFs.reads.some((p) => p.startsWith("/proc/42/"))).toBe(false);
    expect(procFs.reads.some((p) => p.startsWith("/proc/10/"))).toBe(true);
  });

  it("시간 한도를 넘으면 TIMEOUT이다", async () => {
    let now = 0;
    const clock: Clock = {
      now: () => now,
      setTimer: () => ({ cancel() {} }),
      sleep: async () => {},
    };
    const procFs = new MemoryProcFs();
    for (let pid = 10; pid < 10 + 80; pid++) {
      procFs.add(pid, { status: statusText("p", 1), cmdline: cmdlineOf("p"), exe: "/p", cwd: "/" });
    }
    const readFile = procFs.readFile.bind(procFs);
    procFs.readFile = async (path: string) => {
      now += 10_000; // 읽을 때마다 시간이 흐른다
      return readFile(path);
    };
    const result = await createProcProcessLister({
      procFs,
      clock,
      provenance: "stub",
      limits: { timeoutMs: 5000 },
    }).list({});
    expect(result).toEqual({ ok: false, failure: "TIMEOUT" });
  });

  it("읽기만 한다: 쓰기·삭제 메서드가 포트에 없다", () => {
    const procFs = sample();
    expect(
      Object.keys(Object.getPrototypeOf(procFs)).filter((k) => /write|unlink|rm|kill/i.test(k))
    ).toEqual([]);
  });
});

// ── 플랫폼 선택 ──────────────────────────────────────────────────

describe("createNodeProcessLister — 플랫폼 선택", () => {
  const base = { clock: new VirtualClock(), env: ENV };

  it("win32 + SystemRoot → windows-cim, 포트의 출처를 따른다", () => {
    const lister = createNodeProcessLister({
      ...base,
      platform: "win32",
      process: new FakePort(),
      systemRoot: SYSTEM_ROOT,
    });
    expect(lister).toMatchObject({ provenance: "stub", source: "windows-cim" });
  });

  it("win32인데 SystemRoot가 없으면 지원하지 않는다", async () => {
    const port = new FakePort();
    const lister = createNodeProcessLister({
      ...base,
      platform: "win32",
      process: port,
      systemRoot: null,
    });
    expect(lister.source).toBeNull();
    expect(await lister.list({})).toEqual({ ok: false, failure: "UNSUPPORTED_PLATFORM" });
    expect(port.spawnCalls).toEqual([]);
  });

  it("linux → linux-proc", () => {
    expect(
      createNodeProcessLister({
        ...base,
        platform: "linux",
        process: new FakePort(),
        systemRoot: null,
      }).source
    ).toBe("linux-proc");
  });

  it("그 밖(darwin·freebsd·aix)은 지원하지 않는다 — 미확인(null)로 이어진다", async () => {
    for (const platform of ["darwin", "freebsd", "aix", "sunos"]) {
      const port = new FakePort();
      const lister = createNodeProcessLister({
        ...base,
        platform,
        process: port,
        systemRoot: null,
      });
      expect(lister.source, platform).toBeNull();
      expect(await lister.list({}), platform).toEqual({
        ok: false,
        failure: "UNSUPPORTED_PLATFORM",
      });
      expect(port.spawnCalls, platform).toEqual([]);
    }
  });

  it("지원하지 않는 어댑터는 출처만 알린다", async () => {
    const lister = createUnsupportedProcessLister("real");
    expect(lister).toMatchObject({ provenance: "real", source: null });
  });

  it("기본 한도는 양수이고 서로 모순되지 않는다", () => {
    expect(DEFAULT_LIST_LIMITS.timeoutMs).toBeGreaterThan(DEFAULT_LIST_LIMITS.killWaitMs);
    expect(DEFAULT_LIST_LIMITS.maxStdoutBytes).toBeGreaterThan(DEFAULT_LIST_LIMITS.maxStderrBytes);
    expect(DEFAULT_LIST_LIMITS.maxRows).toBeGreaterThan(0);
  });
});
