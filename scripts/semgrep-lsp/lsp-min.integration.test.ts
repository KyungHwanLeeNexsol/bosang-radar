import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SystemClock } from "./clock";
import { createNodeArtifactHasher } from "./artifact-node";
import { createNodeFs } from "./fs-node";
import { buildLspMinEnv, lspMinLayout, type LspMinLayout, type LspMinLimits } from "./lsp-min";
import { runLspMinObservation, type LspMinRequest } from "./lsp-min-run";
import { createNodeProcessLister } from "./process-list-node";
import { createNodeProcessPort } from "./process-node";
import { FakeMetricsReceiver } from "./testing/fake-metrics";

// ── 이 시험이 확인하는 것 / 확인하지 않는 것 ─────────────────────────────────────────────────────
//
// 실제 운영체제의 자식 프로세스, 실제 stdin/stdout/stderr 파이프, 실제 폴더, 실제 프로세스 목록(Windows: PowerShell CIM, Linux: /proc)
// 위에서 LSP-MIN-1 실행기를 돌린다. 서버는 **무해한 Node 스텁**이다(실제 Semgrep이 아니다): 이름만 `semgrep.exe`인 node 실행 파일의 사본이
// `lsp --debug` 인자로 불려, cwd의 확장자 없는 스크립트 `lsp`(testing/stub-lsp-min-server.mjs의 사본)를 실행한다.
//
//   확인하는 것: 고정 실행 파일 이름·고정 인자로 실제로 뜬다 / 환경이 요청한 것뿐이다 / 전용 홈이 뜨기 전에 실제 폴더로 있다 /
//                initialize → shutdown → exit 만 실제 파이프로 간다(스텁이 받은 메서드를 파일에 적는다) / 실제 EOF로 서버가 끝난다 /
//                죽지 않는 서버는 실제로 강제 종료된다(pid가 사라진다) / stderr 문구와 작업 영역 파일 변경으로 실제 중단된다 /
//                실제 프로세스 목록의 이미지 이름(`semgrep.exe`)이 허용 이미지로 읽힌다.
//   확인하지 않는 것: 실제 Semgrep의 동작 / 자손 프로세스 트리 종료(스텁은 자손을 만들지 않는다 — 구조 시험이 child_process를 어댑터 밖에
//                서 금지하므로 스텁에서 자손을 띄우지 않았다. 트리 종료는 process-node의 기존 통합 시험이 다룬다) / 허용 밖 이미지의 실제 탐지(A4) /
//                실제 루프백 수신기(가짜 수신기를 썼다) / 격리 계정 아래에서의 동작.
//   플랫폼: Windows 11 + Node 24에서 실행해 확인했다. Linux 분기(/proc 목록, 실행 권한 사본)는 작성만 했고 이 장비에서는 실행하지 못했다.

const SUPPORTED = process.platform === "win32" || process.platform === "linux";
const STUB_SOURCE = fileURLToPath(new URL("./testing/stub-lsp-min-server.mjs", import.meta.url));
const URL_LOOPBACK = "http://127.0.0.1:41999";

interface Scenario {
  init?: "ok" | "error" | "initialize-error" | "silent";
  ignoreExit?: boolean;
  ignoreEof?: boolean;
  writeFingerprint?: boolean;
  stderrAt?: { atMs: number; text: string }[];
  writeWsAtMs?: number;
  lifetimeMs?: number;
}

describe.skipIf(!SUPPORTED)("LSP-MIN-1 실행기 — 실제 운영체제 위, 무해한 Node 스텁 서버", () => {
  const port = createNodeProcessPort({ provenance: "stub" });
  let base = "";
  let semgrepExe = "";
  let counter = 0;

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), "lspmin-"));
    const bin = join(base, "bin");
    await mkdir(bin);
    semgrepExe = join(bin, "semgrep.exe");
    await copyFile(process.execPath, semgrepExe); // 이름만 semgrep.exe인 node 사본(실행 권한도 복사된다)
  }, 60_000);

  afterAll(async () => {
    await rm(base, { recursive: true, force: true });
  });

  async function prepare(
    scenario: Scenario
  ): Promise<{ layout: LspMinLayout; request: LspMinRequest }> {
    counter += 1;
    const work = join(base, `run${counter}`);
    const layout = lspMinLayout(work);
    await mkdir(layout.stateDir, { recursive: true });
    // 확장자 없는 `lsp`를 ESM으로 읽도록 가까운 package.json에 type을 적는다(자동 감지에 기대지 않는다).
    await writeFile(join(work, "package.json"), '{"type":"module"}');
    await copyFile(STUB_SOURCE, join(layout.stateDir, "lsp"));
    await writeFile(join(layout.stateDir, "scenario.json"), JSON.stringify(scenario));
    const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT ?? "C:\\Windows";
    const request: LspMinRequest = {
      runId: `it-${counter}`,
      command: semgrepExe,
      args: ["lsp", "--debug"],
      layout,
      env: buildLspMinEnv(layout, systemRoot, URL_LOOPBACK),
      expectedVersion: "9.9.9",
    };
    return { layout, request };
  }

  function ports() {
    const clock = new SystemClock();
    return {
      process: port,
      clock,
      fs: createNodeFs(),
      receiver: new FakeMetricsReceiver({ hits: 0 }),
      lister: createNodeProcessLister({
        platform: process.platform,
        process: port,
        clock,
        systemRoot: process.env.SystemRoot ?? process.env.SYSTEMROOT ?? null,
        env: {
          PATH: process.env.PATH ?? "",
          ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
        },
      }),
      hasher: createNodeArtifactHasher(),
    };
  }

  const fast: Partial<LspMinLimits> = {
    totalMs: 20_000,
    initMs: 8_000,
    exitMs: 5_000,
    stdinCloseGraceMs: 2_000,
    killConfirmMs: 10_000, // 실제 기본값. 실제 프로세스 목록 조회가 느린 순간에도 정리 구간이 정직하게 끝나도록 줄이지 않는다
  };

  async function readText(layout: LspMinLayout, name: string): Promise<string> {
    return readFile(join(layout.stateDir, name), "utf8");
  }
  function alive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
  async function pidOf(layout: LspMinLayout): Promise<number> {
    return Number(await readText(layout, "pid.txt"));
  }

  const LONG = { timeout: 60_000 };

  it(
    "정상: 고정 실행 파일·인자로 뜨고, 실제 파이프로 initialize → shutdown → exit 만 가고, 서버가 스스로 끝난다",
    LONG,
    async () => {
      const { layout, request } = await prepare({ init: "ok", writeFingerprint: true });
      const { record } = await runLspMinObservation(ports(), { ...request, limits: fast });

      expect(record.status).toBe("OBSERVED");
      expect(record.status_reasons).toEqual([]);
      expect(record.provenance).toBe("stub");
      expect(record.initialize.response).toBe("VALID");
      expect(record.initialize.server_info).toEqual({ name: "Semgrep", version: "9.9.9" });
      expect(record.initialize.pin_version_comparison).toBe("MATCH");
      expect(record.termination).toMatchObject({
        trigger: "NORMAL",
        path: "SELF_EXIT",
        exit: { code: 0, signal: null },
        kill_count: 0,
        stdin_closed_by_harness: false,
      });
      expect(record.cleanup.ok, JSON.stringify(record.cleanup)).toBe(true);

      // 스텁이 실제로 받은 메서드: 정확히 이 셋. initialized는 한 번도 가지 않았다.
      const received = (await readText(layout, "received.log")).trim().split("\n");
      expect(received).toEqual(["initialize", "shutdown", "exit"]);

      // 스텁이 받은 인자와 환경.
      const env = JSON.parse(await readText(layout, "env.json"));
      expect(env.args).toEqual(["--debug"]); // node가 `lsp`를 스크립트 이름으로 읽고 나머지 인자는 --debug다
      expect(resolve(env.cwd).toLowerCase()).toBe(resolve(layout.stateDir).toLowerCase()); // 자식의 작업 폴더는 상태 폴더다
      expect(env.homeIsDir).toBe(true); // 전용 홈이 서버가 뜰 때 이미 실제 폴더였다
      expect(String(env.userprofile).toLowerCase()).toBe(layout.homeDir.toLowerCase());

      // 홈의 지문 파일은 예상 위치라 위반이 아니고, 사후 비교에 보인다.
      const home = record.coverage.post_hoc.watched_roots.find((r) => r.role === "HOME_DIR");
      expect(home?.added).toEqual([".semgrep/cache/fingerprinted_ignored_findings/ws.txt"]);
      expect(record.coverage.live.processes.samples).toBeGreaterThanOrEqual(0);
      expect(alive(await pidOf(layout))).toBe(false);
    }
  );

  it(
    "환경: 요청한 값이 그대로 도착하고 부모의 토큰·프록시는 없다. 단 Node 포트는 Windows에서 일곱 개 이름을 부모 값으로 채운다(알려진 한계)",
    LONG,
    async () => {
      const canary = "LSPMIN_CANARY_TOKEN";
      process.env[canary] = "must-not-leak";
      process.env.HTTPS_PROXY = "http://user:pass@127.0.0.1:9";
      try {
        const { layout, request } = await prepare({ init: "ok" });
        const { record } = await runLspMinObservation(ports(), { ...request, limits: fast });
        expect(record.status).toBe("OBSERVED");
        const env = JSON.parse(await readText(layout, "env.json"));
        const names = (env.names as string[]).map((n) => n.toUpperCase());
        expect(names).not.toContain(canary);
        expect(names).not.toContain("HTTPS_PROXY");
        expect(names).not.toContain("GITHUB_TOKEN");
        expect(names).not.toContain("SEMGREP_ENABLE_VERSION_CHECK");

        // 요청이 정한 값은 부모의 값이 아니라 우리 값 그대로 도착했다.
        for (const key of [
          "PATH",
          "SYSTEMROOT",
          "TEMP",
          "TMP",
          "SEMGREP_APP_URL",
          "SEMGREP_LOG_FILE",
        ]) {
          expect(env.values[key], key).toBe(request.env[key]);
        }

        // 한계(관측): Node(libuv)는 Windows에서 자식을 띄울 때 요청에 없는 아래 일곱 이름을 부모 값 그대로 채워 넣는다.
        // 이 시험 장비에서 node·cmd.exe·powershell.exe 자식 모두 같은 일곱 개를 받는 것을 별도 탐침으로 확인했다(원인을 libuv 소스로
        // 확인하지는 않았다). 이것은 기존 process-node.ts 어댑터의 성질이며 이번에 바꾸지 않았다. 전용 계정 실행은 ProcessStartInfo를 쓰는
        // PowerShell 러너가 맡고 그쪽은 이 일곱 개를 채우지 않는다(러너 시험이 따로 확인한다).
        const requested = Object.keys(request.env).map((n) => n.toUpperCase());
        const extra = names.filter((n) => !requested.includes(n)).sort();
        const nodeFilledOnWindows = [
          "HOMEDRIVE",
          "HOMEPATH",
          "LOGONSERVER",
          "SYSTEMDRIVE",
          "USERDOMAIN",
          "USERNAME",
          "WINDIR",
        ];
        expect(extra, extra.join(",")).toEqual(
          process.platform === "win32" ? nodeFilledOnWindows : []
        );
      } finally {
        delete process.env[canary];
        delete process.env.HTTPS_PROXY;
      }
    }
  );

  it(
    "초기화 실패(result 안의 InitializeError): shutdown·exit를 보내지 않고 stdin을 닫으면 실제 EOF로 서버가 끝난다",
    LONG,
    async () => {
      const { layout, request } = await prepare({ init: "initialize-error" });
      const { record } = await runLspMinObservation(ports(), { ...request, limits: fast });

      expect(record.status).toBe("NOT_OBSERVED");
      expect(record.status_reasons).toContain("INIT_RESULT_IS_INITIALIZE_ERROR");
      expect(record.termination).toMatchObject({
        trigger: "INIT_INVALID",
        path: "STDIN_CLOSED",
        stdin_closed_by_harness: true,
        kill_count: 0,
      });
      const received = (await readText(layout, "received.log")).trim().split("\n");
      expect(received).toEqual(["initialize", "<stdin-end>"]); // 실제 EOF가 갔고 shutdown·exit는 가지 않았다
      expect(record.cleanup.ok, JSON.stringify(record.cleanup)).toBe(true);
      expect(alive(await pidOf(layout))).toBe(false);
    }
  );

  it(
    "죽지 않는 서버(응답 없음, EOF 무시): 시간 초과 → stdin 닫기 → 유예 → 실제 강제 종료, pid가 사라진다",
    LONG,
    async () => {
      const { layout, request } = await prepare({ init: "silent", ignoreEof: true });
      const started = Date.now();
      const { record } = await runLspMinObservation(ports(), {
        ...request,
        limits: { ...fast, initMs: 1_500, stdinCloseGraceMs: 1_000 },
      });
      const elapsed = Date.now() - started;

      expect(record.termination).toMatchObject({
        trigger: "INIT_TIMEOUT",
        path: "FORCE_KILLED",
        stdin_closed_by_harness: true,
        kill_count: 1,
      });
      expect(record.status).toBe("NOT_OBSERVED");
      expect(record.cleanup.ok, JSON.stringify(record.cleanup)).toBe(true);
      expect(record.cleanup.child_exit_confirmed).toBe(true);
      expect(elapsed).toBeLessThan(15_000); // 스텁의 수명(20초)이 아니라 하네스가 끝냈다
      expect(alive(await pidOf(layout))).toBe(false);
      const received = (await readText(layout, "received.log")).trim().split("\n");
      expect(received).toEqual(["initialize", "<stdin-end>"]);
    }
  );

  it(
    "exit를 무시하는 서버: 실제로 30초 한도(여기서는 줄인 값) 뒤 stdin을 닫아 끝낸다",
    LONG,
    async () => {
      const { request, layout } = await prepare({ init: "ok", ignoreExit: true });
      const { record } = await runLspMinObservation(ports(), {
        ...request,
        limits: { ...fast, exitMs: 1_200 },
      });
      expect(record.status).toBe("OBSERVED");
      expect(record.termination).toMatchObject({ trigger: "EXIT_TIMEOUT", path: "STDIN_CLOSED" });
      const received = (await readText(layout, "received.log")).trim().split("\n");
      expect(received).toEqual(["initialize", "shutdown", "exit", "<stdin-end>"]);
    }
  );

  it(
    "A1: 실제 stderr 파이프로 두 번에 나뉘어 온 문구도 잡아 곧바로 강제 종료한다 (stdin을 닫지 않는다)",
    LONG,
    async () => {
      const { layout, request } = await prepare({
        init: "silent",
        ignoreEof: true,
        stderrAt: [
          { atMs: 300, text: "[00.04][INFO](default): Refre" },
          { atMs: 450, text: "shing rules\n" },
        ],
      });
      const { record } = await runLspMinObservation(ports(), { ...request, limits: fast });
      expect(record.status).toBe("ABORTED");
      expect(record.termination.abort).toMatchObject({
        condition: "A1",
        detail: "refreshing rules",
      });
      expect(record.termination).toMatchObject({
        trigger: "LIVE_ABORT",
        path: "FORCE_KILLED",
        stdin_closed_by_harness: false,
        kill_count: 1,
      });
      const received = (await readText(layout, "received.log")).trim().split("\n");
      expect(received).toEqual(["initialize"]); // 중단 뒤에 아무것도 가지 않았다
      expect(alive(await pidOf(layout))).toBe(false);
      expect(record.cleanup.ok, JSON.stringify(record.cleanup)).toBe(true);
    }
  );

  it(
    "A5: 서버가 실제로 작업 영역에 파일을 쓰면 실제 폴더 목록 표본이 잡아 중단한다",
    LONG,
    async () => {
      const { layout, request } = await prepare({
        init: "silent",
        ignoreEof: true,
        writeWsAtMs: 300,
      });
      const { record } = await runLspMinObservation(ports(), { ...request, limits: fast });
      expect(record.status).toBe("ABORTED");
      expect(record.termination.abort).toMatchObject({ condition: "A5", detail: "WORKSPACE" });
      expect(alive(await pidOf(layout))).toBe(false);
      const ws = record.coverage.post_hoc.watched_roots.find((r) => r.role === "WORKSPACE");
      expect(ws?.added).toEqual(["x.txt"]);
    }
  );

  it(
    "취소(A7): 서버가 실제로 뜬 뒤의 취소는 실행 도중 중단이다 (서버가 pid 파일을 쓴 것을 보고 취소한다)",
    LONG,
    async () => {
      const { layout, request } = await prepare({ init: "silent", ignoreEof: true });
      const controller = new AbortController();
      const waiter = (async () => {
        for (let i = 0; i < 400; i++) {
          try {
            await stat(join(layout.stateDir, "pid.txt"));
            break;
          } catch {
            await new Promise((r) => setTimeout(r, 25));
          }
        }
        controller.abort();
      })();
      const { record } = await runLspMinObservation(ports(), {
        ...request,
        limits: fast,
        signal: controller.signal,
      });
      await waiter;
      expect(record.status).toBe("ABORTED");
      expect(record.termination.abort?.condition).toBe("A7");
      expect(record.termination).toMatchObject({
        trigger: "LIVE_ABORT",
        stdin_closed_by_harness: false,
        kill_count: 1,
      });
      expect(alive(await pidOf(layout))).toBe(false);
      expect(record.cleanup.ok, JSON.stringify(record.cleanup)).toBe(true);
    }
  );

  it(
    "취소: 사전 확인(실제 프로세스 목록 조회) 도중의 취소는 서버를 띄우지 않는다",
    LONG,
    async () => {
      const { layout, request } = await prepare({ init: "silent", ignoreEof: true });
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 100); // 실제 목록 조회는 한 번에 1초 안팎이라 아직 사전 확인 중이다
      const { record } = await runLspMinObservation(ports(), {
        ...request,
        limits: fast,
        signal: controller.signal,
      });
      expect(record.status).toBe("NOT_ATTEMPTED");
      expect(record.status_reasons).toContain("CANCELLED_BEFORE_START");
      await expect(stat(join(layout.stateDir, "pid.txt"))).rejects.toThrow(); // 서버가 한 번도 뜨지 않았다
    }
  );

  it(
    "실제 프로세스 목록 표본: 서버(semgrep.exe 사본)가 허용 이미지로 읽혀 중단되지 않는다",
    LONG,
    async () => {
      // 표본이 한두 번 돌 시간을 주려고 서버가 exit를 무시하게 하고 exit 한도를 2.5초로 둔다(실제 목록 조회는 한 번에 1초 안팎이 든다).
      const { request } = await prepare({ init: "ok", ignoreExit: true });
      const { record } = await runLspMinObservation(ports(), {
        ...request,
        limits: { ...fast, exitMs: 2_500 },
      });
      expect(record.status).toBe("OBSERVED");
      expect(record.coverage.live.processes.samples).toBeGreaterThanOrEqual(1);
      expect(record.coverage.live.processes.disallowed).toEqual([]);
      expect(record.coverage.live.processes.images_seen).toContain("semgrep.exe");
    }
  );

  it("스텁 서버 파일이 기대한 장소에 있다 (헛도는 시험 방지)", async () => {
    const info = await stat(STUB_SOURCE);
    expect(info.isFile()).toBe(true);
  });
});
