import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  findSafePort,
  isUnsafePort,
  killProcessTree,
  startManagedServer,
  waitForServer,
} from "./visual-verify-server";

// visual:verify가 OS 임의 포트로 6668을 받아 Node fetch "bad port"로 120초를
// 헛기다린 결함의 회귀 검증. 여기서는 금지 포트와 준비 실패를 주입해 "빠른 실패 /
// 재선택 / 프로세스 정리"만 확인한다 — 실제로 120초를 기다리는 테스트는 없다.

let tmpDir: string;
const spawnedPids: number[] = [];

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function until(condition: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return condition();
}

// 자식 node가 자기 pid를 파일에 남기게 해서, shell(cmd.exe) 뒤에 숨은 손자
// 프로세스까지 살아 있는지 확인한다(child.pid는 shell의 pid다).
function fixture(name: string, body: string): string {
  const file = path.join(tmpDir, name);
  fs.writeFileSync(
    file,
    `require("node:fs").writeFileSync(process.env.PIDFILE, String(process.pid));\n${body}\n`
  );
  return file;
}

function spawnFixture(file: string, port: number, pidFile: string) {
  return spawn(`"${process.execPath}" "${file}"`, {
    env: { ...process.env, PORT: String(port), PIDFILE: pidFile },
    stdio: "ignore",
    shell: true,
    detached: process.platform !== "win32",
  });
}

function readPid(pidFile: string): number {
  const pid = Number(fs.readFileSync(pidFile, "utf8"));
  spawnedPids.push(pid);
  return pid;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vv-server-"));
});

afterEach(() => {
  // 테스트가 실패해도 프로세스가 남지 않게 마지막 안전망을 둔다.
  for (const pid of spawnedPids.splice(0)) {
    if (isAlive(pid)) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // 이미 종료됨
      }
    }
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("금지 포트 판정", () => {
  it("이번에 걸린 6668과 같은 계열의 금지 포트를 거른다", () => {
    for (const port of [6668, 6667, 6665, 6669, 4190, 10080]) {
      expect(isUnsafePort(port), `port ${port}`).toBe(true);
    }
    for (const port of [3000, 5432, 6670, 49152, 51234]) {
      expect(isUnsafePort(port), `port ${port}`).toBe(false);
    }
  });

  it("목록이 실제 Node fetch 동작과 어긋나지 않는다 — 6668은 정말로 bad port로 거부된다", async () => {
    let caught: unknown;
    try {
      await fetch("http://127.0.0.1:6668/");
    } catch (error) {
      caught = error;
    }
    const cause = (caught as { cause?: { message?: string } } | undefined)?.cause;
    expect(String(cause?.message)).toMatch(/bad port/i);
  });
});

describe("findSafePort — 금지 포트 재선택", () => {
  it("금지 포트 6668·6667을 만나면 버리고 다음 후보를 고른다", async () => {
    const candidates = [6668, 6667, 51234];
    const skipped: number[] = [];
    let calls = 0;

    const port = await findSafePort({
      listen: async () => candidates[calls++],
      onSkip: (p) => skipped.push(p),
    });

    expect(port).toBe(51234);
    expect(skipped).toEqual([6668, 6667]);
    expect(calls).toBe(3);
  });

  it("계속 금지 포트만 나오면 무한 재시도하지 않고 원인을 명시해 실패한다", async () => {
    let calls = 0;
    await expect(
      findSafePort({
        listen: async () => {
          calls += 1;
          return 6668;
        },
        maxAttempts: 3,
      })
    ).rejects.toThrow(/3번 연속[\s\S]*6668[\s\S]*ERR_UNSAFE_PORT/);
    expect(calls).toBe(3);
  });

  it("기본 경로(OS 임의 포트)는 항상 금지 포트가 아닌 값을 돌려준다", async () => {
    const port = await findSafePort();
    expect(isUnsafePort(port)).toBe(false);
  });
});

describe("waitForServer — 기다리지 않고 실패", () => {
  it("URL이 금지 포트면 fetch를 시도하지도 않고 즉시 원인을 밝힌다", async () => {
    let fetched = 0;
    const started = Date.now();

    await expect(
      waitForServer("http://localhost:6668", 60_000, {
        fetchImpl: async () => {
          fetched += 1;
          return { ok: true };
        },
      })
    ).rejects.toThrow(/포트 6668.*금지 포트/);

    expect(fetched).toBe(0);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("실제 Node fetch도 6668에서 즉시 원인을 밝히며 실패한다(60초 한도를 기다리지 않음)", async () => {
    const started = Date.now();
    await expect(waitForServer("http://127.0.0.1:6668", 60_000)).rejects.toThrow(/6668/);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("목록에 없는 포트라도 fetch가 bad port로 거부하면 재시도 루프에 들어가지 않는다", async () => {
    let attempts = 0;
    const started = Date.now();

    await expect(
      waitForServer("http://localhost:51234", 60_000, {
        fetchImpl: async () => {
          attempts += 1;
          throw Object.assign(new TypeError("fetch failed"), { cause: new Error("bad port") });
        },
      })
    ).rejects.toThrow(/금지 포트/);

    expect(attempts).toBe(1);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("서버 프로세스가 이미 죽었다면 타임아웃까지 기다리지 않는다", async () => {
    const started = Date.now();
    await expect(
      waitForServer("http://localhost:51234", 60_000, {
        intervalMs: 20,
        fetchImpl: async () => {
          throw new Error("ECONNREFUSED");
        },
        abortReason: () => "exit code=3 signal=null",
      })
    ).rejects.toThrow(/준비되기 전에 종료.*exit code=3/);
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});

describe("startManagedServer — 준비 확인 실패 시 자식 프로세스 트리 정리", () => {
  it("금지 포트가 주입되면 서버를 띄우지 않고 즉시 실패한다", async () => {
    let spawned = 0;
    const started = Date.now();

    await expect(
      startManagedServer({
        pickPort: async () => 6668,
        readyTimeoutMs: 60_000,
        spawnOnPort: () => {
          spawned += 1;
          throw new Error("호출되면 안 된다");
        },
      })
    ).rejects.toThrow(/포트 6668.*금지 포트/);

    expect(spawned).toBe(0);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("준비 확인이 타임아웃되면 예외를 던지기 전에 shell 뒤의 손자 프로세스까지 정리한다", async () => {
    const pidFile = path.join(tmpDir, "never.pid");
    const file = fixture("never-listen.js", "setInterval(() => {}, 1000);");

    await expect(
      startManagedServer({
        readyTimeoutMs: 3_000,
        pollIntervalMs: 100,
        spawnOnPort: (port) => spawnFixture(file, port, pidFile),
      })
    ).rejects.toThrow(/3000ms 안에 기동하지 않았습니다/);

    const pid = readPid(pidFile);
    expect(await until(() => !isAlive(pid), 3_000), `손자 프로세스 ${pid}가 남아 있음`).toBe(true);
  });

  it("자식이 기동 중 죽으면 60초 한도를 기다리지 않고 종료 사유와 함께 실패한다", async () => {
    const pidFile = path.join(tmpDir, "exit.pid");
    const file = fixture("exit-early.js", "process.exit(3);");
    const started = Date.now();

    await expect(
      startManagedServer({
        readyTimeoutMs: 60_000,
        pollIntervalMs: 50,
        spawnOnPort: (port) => spawnFixture(file, port, pidFile),
      })
    ).rejects.toThrow(/준비되기 전에 종료.*exit code=3/);

    expect(Date.now() - started).toBeLessThan(10_000);
  });

  it("정상 기동은 baseURL을 돌려주고, stop()이 손자 프로세스까지 종료한다", async () => {
    const pidFile = path.join(tmpDir, "ok.pid");
    const file = fixture(
      "listen.js",
      `require("node:http").createServer((_, res) => res.end("ok")).listen(Number(process.env.PORT));`
    );

    const server = await startManagedServer({
      readyTimeoutMs: 10_000,
      pollIntervalMs: 100,
      spawnOnPort: (port) => spawnFixture(file, port, pidFile),
    });

    const pid = readPid(pidFile);
    expect(server.baseURL).toMatch(/^http:\/\/localhost:\d+$/);
    // 대조군: stop() 전에는 실제로 살아 있어야 "정리됐다"는 관찰이 의미가 있다.
    expect(isAlive(pid)).toBe(true);

    server.stop();
    expect(await until(() => !isAlive(pid), 3_000), `손자 프로세스 ${pid}가 남아 있음`).toBe(true);
  });
});

describe("killProcessTree", () => {
  it("이미 종료된 자식에 다시 호출해도 예외가 없다(멱등)", async () => {
    const pidFile = path.join(tmpDir, "twice.pid");
    const file = fixture("twice.js", "setInterval(() => {}, 1000);");
    const child = spawnFixture(file, 0, pidFile);
    await until(() => fs.existsSync(pidFile) && fs.readFileSync(pidFile, "utf8") !== "", 5_000);
    const pid = readPid(pidFile);

    killProcessTree(child);
    expect(await until(() => !isAlive(pid), 3_000)).toBe(true);
    expect(() => killProcessTree(child)).not.toThrow();
  });
});
