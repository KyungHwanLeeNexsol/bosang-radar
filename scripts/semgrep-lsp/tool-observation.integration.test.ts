import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { SystemClock } from "./clock";
import { createNodeProcessPort } from "./process-node";
import {
  VERSION_ARGS,
  observeToolVersion,
  type ToolVersionObservation,
  type ToolVersionRequest,
} from "./tool-observation";
import type { ChildHandle, ProcessPort, SpawnSpec } from "./types";

// 실제 자식 프로세스(Node)를 띄우는 통합 시험이다. 띄우는 것은 시험용 스텁(testing/stub-version.mjs) 하나뿐이며 실제 Semgrep이 아니다.
// 포트는 항상 provenance "stub"이다 — 이 시험의 결과는 실제 Semgrep 동작의 증거가 아니다.

const STUB = fileURLToPath(new URL("./testing/stub-version.mjs", import.meta.url));
const T = 30_000;

function childEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of ["PATH", "Path", "SYSTEMROOT", "SystemRoot", "TEMP", "TMP", "HOME"]) {
    const value = process.env[name];
    if (value !== undefined && value !== "") env[name] = value;
  }
  return env;
}

/** 띄운 자식의 pid를 기록하는 포트(실제 어댑터를 감싼다). */
function trackedPort(): { port: ProcessPort; pids: number[] } {
  const inner = createNodeProcessPort({ provenance: "stub" });
  const pids: number[] = [];
  return {
    pids,
    port: {
      provenance: inner.provenance,
      async spawn(spec: SpawnSpec): Promise<ChildHandle> {
        const child = await inner.spawn(spec);
        if (child.pid !== null) pids.push(child.pid);
        return child;
      },
    },
  };
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function expectDead(pid: number): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (!isAlive(pid)) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  expect(isAlive(pid), `pid ${pid}가 아직 살아 있다`).toBe(false);
}

let workDir = "";
afterAll(async () => {
  if (workDir !== "") await rm(workDir, { recursive: true, force: true });
});

async function observe(
  scenario: string,
  over: Partial<ToolVersionRequest> = {}
): Promise<{ result: ToolVersionObservation; pids: number[] }> {
  workDir ||= await mkdtemp(join(tmpdir(), "semgrep-lsp-toolobs-"));
  const { port, pids } = trackedPort();
  const result = await observeToolVersion(
    { process: port, clock: new SystemClock() },
    {
      command: process.execPath,
      args: [STUB, ...VERSION_ARGS, scenario],
      cwd: workDir,
      env: childEnv(),
      ...over,
    }
  );
  return { result, pids };
}

describe("버전 확인 — 실제 Node 프로세스 스텁", () => {
  it("정상 출력: 버전을 관측하고 자식은 스스로 끝난 것으로 기록된다", { timeout: T }, async () => {
    const { result, pids } = await observe("ok");
    expect(result).toMatchObject({
      status: "OBSERVED",
      version: "1.180.0",
      failure: null,
      provenance: "stub",
      args: [STUB, "--version", "ok"],
      exit: { code: 0, signal: null },
      childProcess: "EXITED",
    });
    expect(result.stdoutBytes).toBe(8);
    expect(pids).toHaveLength(1);
    await expectDead(pids[0]);
  });

  it.each([
    ["ok-crlf", "1.180.0"],
    ["ok-no-newline", "1.180.0"],
    ["other-version", "1.179.0"], // 핀과 다른 값도 그대로 관측한다(핀 값으로 채우지 않는다)
    ["noisy", "1.180.0"], // stderr 경고는 해석하지 않는다
  ])("%s → %s", { timeout: T }, async (scenario, version) => {
    const { result } = await observe(scenario);
    expect(result).toMatchObject({ status: "OBSERVED", version });
    if (scenario === "noisy") expect(result.stderrBytes).toBeGreaterThan(0);
  });

  it.each([
    ["unexpected", "OUTPUT_UNRECOGNIZED"],
    ["v-prefix", "OUTPUT_UNRECOGNIZED"],
    ["multi-line", "OUTPUT_NOT_SINGLE_LINE"],
    ["empty", "OUTPUT_EMPTY"],
    ["stderr-only", "OUTPUT_EMPTY"],
  ])("예상 밖 출력 %s → 관측 실패 %s", { timeout: T }, async (scenario, failure) => {
    const { result } = await observe(scenario);
    expect(result).toMatchObject({
      status: "FAILED",
      version: null,
      failure,
      childProcess: "EXITED",
    });
  });

  it(
    "비정상 종료: stdout이 정상처럼 보여도 종료 코드 3이면 관측 실패다",
    { timeout: T },
    async () => {
      const { result } = await observe("fail");
      expect(result).toMatchObject({
        status: "FAILED",
        version: null,
        failure: "NONZERO_EXIT",
        exit: { code: 3 },
      });
      expect(result.stderrBytes).toBeGreaterThan(0);
    }
  );

  it("알 수 없는 시나리오(스텁이 64로 끝남)도 관측 실패다", { timeout: T }, async () => {
    const { result } = await observe("no-such-scenario");
    expect(result).toMatchObject({ status: "FAILED", failure: "NONZERO_EXIT", exit: { code: 64 } });
  });

  it(
    "셸을 쓰지 않는다: 셸 메타문자가 든 인자는 한 덩어리로 전달되고 아무것도 실행되지 않는다",
    { timeout: T },
    async () => {
      workDir ||= await mkdtemp(join(tmpdir(), "semgrep-lsp-toolobs-"));
      const { result } = await observe("ok & echo pwned > pwned.txt");
      // 스텁이 이 문자열을 시나리오 이름 하나로 받아 알 수 없다고 끝난다.
      expect(result).toMatchObject({ failure: "NONZERO_EXIT", exit: { code: 64 } });
      expect(existsSync(join(workDir, "pwned.txt"))).toBe(false);
    }
  );

  it("띄울 수 없는 실행 파일은 SPAWN_FAILED이고 자식이 없다", { timeout: T }, async () => {
    workDir ||= await mkdtemp(join(tmpdir(), "semgrep-lsp-toolobs-"));
    const { result, pids } = await observe("ok", {
      command: join(workDir, "no-such-binary-xyz"),
      args: [...VERSION_ARGS],
    });
    expect(result).toMatchObject({
      status: "FAILED",
      failure: "SPAWN_FAILED",
      childProcess: "NOT_SPAWNED",
      provenance: "stub",
    });
    expect(pids).toEqual([]);
  });

  it(
    "시간 초과: 멈춘 자식을 끝내고 TIMEOUT으로 남기며 프로세스가 남지 않는다",
    { timeout: T },
    async () => {
      const started = Date.now();
      const { result, pids } = await observe("hang", { limits: { timeoutMs: 400 } });
      expect(result).toMatchObject({
        status: "FAILED",
        version: null,
        failure: "TIMEOUT",
        childProcess: "KILLED",
      });
      expect(Date.now() - started).toBeLessThan(15_000);
      expect(result.durationMs).toBeGreaterThanOrEqual(350);
      expect(pids).toHaveLength(1);
      await expectDead(pids[0]);
    }
  );

  it(
    "출력 초과(stdout): 끝없이 쓰는 자식을 끝내고 OUTPUT_LIMIT_EXCEEDED로 남긴다",
    { timeout: T },
    async () => {
      const { result, pids } = await observe("flood", { limits: { maxStdoutBytes: 4096 } });
      expect(result).toMatchObject({
        status: "FAILED",
        version: null,
        failure: "OUTPUT_LIMIT_EXCEEDED",
        childProcess: "KILLED",
      });
      expect(result.stdoutBytes).toBeGreaterThan(4096);
      await expectDead(pids[0]);
    }
  );

  it("출력 초과(stderr)도 같다", { timeout: T }, async () => {
    const { result, pids } = await observe("flood-stderr", { limits: { maxStderrBytes: 4096 } });
    expect(result).toMatchObject({ failure: "OUTPUT_LIMIT_EXCEEDED", childProcess: "KILLED" });
    await expectDead(pids[0]);
  });

  it(
    "실행 중 취소: 도는 자식을 끝내고 CANCELLED로 남기며 프로세스가 남지 않는다",
    { timeout: T },
    async () => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 200);
      const { result, pids } = await observe("hang", { signal: controller.signal });
      expect(result).toMatchObject({
        status: "FAILED",
        version: null,
        failure: "CANCELLED",
        childProcess: "KILLED",
      });
      expect(pids).toHaveLength(1);
      await expectDead(pids[0]);
    }
  );

  it(
    "출력하기 전에 취소해도 같다(늦게 출력하는 자식의 출력을 받지 않는다)",
    { timeout: T },
    async () => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 100);
      const { result, pids } = await observe("late", { signal: controller.signal });
      expect(result).toMatchObject({ status: "FAILED", version: null, failure: "CANCELLED" });
      await expectDead(pids[0]);
    }
  );

  it("이미 취소됐으면 프로세스를 띄우지 않는다", { timeout: T }, async () => {
    const { result, pids } = await observe("ok", { signal: AbortSignal.abort() });
    expect(result).toMatchObject({
      status: "NOT_ATTEMPTED",
      failure: "CANCELLED",
      provenance: null,
    });
    expect(pids).toEqual([]);
  });

  it(
    "이 시험은 아무 것도 남기지 않는다: 어느 시나리오도 작업 폴더에 파일을 만들지 않는다",
    { timeout: T },
    async () => {
      workDir ||= await mkdtemp(join(tmpdir(), "semgrep-lsp-toolobs-"));
      await observe("noisy");
      expect(existsSync(join(workDir, "pwned.txt"))).toBe(false);
    }
  );
});
