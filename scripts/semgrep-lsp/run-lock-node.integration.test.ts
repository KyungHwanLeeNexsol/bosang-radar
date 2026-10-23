import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createNodeProcessPort } from "./process-node";
import type { ChildHandle } from "./types";

// 실제 디스크와 서로 다른 운영체제 프로세스 사이의 공유 실행 잠금 경쟁. 자식은 무해한 Node 프로세스(testing/lock-child.mjs)이고
// 운영 코드(run-lock.ts·run-lock-node.ts)를 그대로 실행한다 — 파일을 읽고 쓸 뿐 네트워크도 Semgrep도 다른 프로세스도 쓰지 않는다.
// 모든 자식은 스스로 끝나는 감시(20초)가 있고 시험이 끝나면 정리된다. 포트의 provenance는 "stub"이다.

const CHILD = fileURLToPath(new URL("./testing/lock-child.mjs", import.meta.url));
const port = createNodeProcessPort({ provenance: "stub" });

let base: string;
const children: ChildHandle[] = [];

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), "semgrep-lsp-lock-race-"));
});

afterEach(async () => {
  await Promise.all(children.splice(0).map((child) => child.dispose()));
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

/** 자식에게 줄 최소 환경(부모 환경을 통째로 물려주지 않는다). */
function childEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of ["PATH", "SystemRoot", "windir", "TEMP", "TMP", "HOME"]) {
    const value = process.env[name];
    if (value !== undefined && value !== "") env[name] = value;
  }
  return env;
}

interface Outcome {
  pid: number;
  runId: string;
  state: "ACQUIRED" | "REFUSED" | "ERROR";
  reason: string | null;
  holder: { run_id: string; pid: number } | null;
  keySha256: string;
  lockPath: string | null;
  token: string | null;
}

interface Racer {
  child: ChildHandle;
  runId: string;
  ready: string;
  result: string;
  release: string;
  released: string;
}

async function waitForFile(path: string, timeoutMs = 25_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await readFile(path);
      return;
    } catch {
      if (Date.now() > deadline) throw new Error(`시간 안에 파일이 생기지 않았다: ${path}`);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

async function readJson<T>(path: string): Promise<T> {
  await waitForFile(path);
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function startRacer(
  dir: string,
  name: string,
  goFile: string,
  config: { tree: string; runId: string; mode?: string; crashAfterAcquire?: boolean }
): Promise<Racer> {
  const racer = {
    ready: join(dir, `${name}.ready`),
    result: join(dir, `${name}.result.json`),
    release: join(dir, `${name}.release`),
    released: join(dir, `${name}.released.json`),
  };
  const payload = {
    tree: config.tree,
    runId: config.runId,
    mode: config.mode ?? "target",
    crashAfterAcquire: config.crashAfterAcquire === true,
    goFile,
    readyFile: racer.ready,
    resultFile: racer.result,
    releaseFile: racer.release,
    releasedFile: racer.released,
    watchdogMs: 20_000,
  };
  const child = await port.spawn({
    command: process.execPath,
    args: [
      "--no-warnings",
      "--experimental-strip-types",
      CHILD,
      Buffer.from(JSON.stringify(payload), "utf8").toString("base64"),
    ],
    cwd: dir,
    env: childEnv(),
  });
  children.push(child);
  return { child, runId: config.runId, ...racer };
}

/** 자식 하나를 띄워 바로 출발시키고 결과를 받는다. */
async function runOne(
  dir: string,
  name: string,
  config: Parameters<typeof startRacer>[3]
): Promise<{ racer: Racer; outcome: Outcome }> {
  const go = join(dir, `${name}.go`);
  const racer = await startRacer(dir, name, go, config);
  await writeFile(go, "go");
  return { racer, outcome: await readJson<Outcome>(racer.result) };
}

const lockFilesIn = async (dir: string): Promise<string[]> =>
  (await readdir(dir)).filter((n) => /^semgrep-lsp-tree-[0-9a-f]{32}\.lock$/.test(n));

describe("공유 실행 잠금 — 서로 다른 프로세스의 동시 경쟁(실제 디스크)", () => {
  it.each([1, 2, 3])(
    "라운드 %i: 실행 식별자·mode·경로 표기가 다른 6개 프로세스가 같은 트리에 동시에 덤벼도 정확히 하나만 얻는다",
    async (round) => {
      const dir = await mkdtemp(join(base, `race-${round}-`));
      const realParent = join(dir, "real");
      const tree = join(realParent, "scan");
      await mkdir(tree, { recursive: true });
      // 같은 트리를 가리키는 서로 다른 표기들.
      const spellings = [
        tree,
        `${tree}/`,
        join(realParent, "elsewhere", "..", "scan"),
        join(realParent, ".", "scan"),
      ];
      try {
        await symlink(realParent, join(dir, "alias"), "junction"); // POSIX에서는 폴더 링크
        spellings.push(join(dir, "alias", "scan"));
      } catch {
        // 링크를 만들 수 없는 환경: 별칭 표기는 이번 라운드에서 빠진다.
      }
      if (process.platform === "win32") spellings.push(join(dir, "REAL", "SCAN")); // 대소문자만 다른 표기

      const go = join(dir, "go");
      const racers: Racer[] = [];
      for (let i = 0; i < 6; i += 1) {
        racers.push(
          await startRacer(dir, `c${i}`, go, {
            tree: spellings[i % spellings.length],
            runId: `run-r${round}-${i}`,
            mode: i % 2 === 0 ? "target" : "control",
          })
        );
      }
      // 모두 준비된 뒤 한꺼번에 출발시킨다.
      await Promise.all(racers.map((r) => waitForFile(r.ready)));
      await writeFile(go, "go");
      const outcomes = await Promise.all(racers.map((r) => readJson<Outcome>(r.result)));

      // 경쟁자는 서로 다른 운영체제 프로세스이며 시험 프로세스도 아니다.
      expect(new Set(outcomes.map((o) => o.pid)).size).toBe(6);
      expect(outcomes.some((o) => o.pid === process.pid)).toBe(false);

      const winners = outcomes.filter((o) => o.state === "ACQUIRED");
      expect(winners).toHaveLength(1);
      const winner = winners[0];
      // 표기가 달라도 모두 같은 트리의 키다.
      expect(new Set(outcomes.map((o) => o.keySha256)).size).toBe(1);
      for (const o of outcomes) {
        if (o.state === "ACQUIRED") continue;
        expect(o.state).toBe("REFUSED");
        expect(["HELD_BY_OTHER", "OWNER_UNREADABLE"]).toContain(o.reason);
        // 소유자를 읽을 수 있었던 거절은 승자를 가리킨다.
        if (o.holder !== null) {
          expect(o.holder.run_id).toBe(winner.runId);
          expect(o.holder.pid).toBe(winner.pid);
        }
      }
      // 잠금 파일은 트리의 부모에 단 하나이고 승자의 토큰을 담고 있다.
      const locks = await lockFilesIn(realParent);
      expect(locks).toHaveLength(1);
      const doc = JSON.parse(await readFile(join(realParent, locks[0]), "utf8")) as {
        token: string;
        run_id: string;
        pid: number;
      };
      expect(doc.token).toBe(winner.token);
      expect(doc.run_id).toBe(winner.runId);
      expect(doc.pid).toBe(winner.pid);

      // 승자가 해제하면 잠금이 사라진다. 패자들은 이미 끝났다.
      const winnerRacer = racers[outcomes.indexOf(winner)];
      await writeFile(winnerRacer.release, "release");
      expect(await readJson<{ state: string }>(winnerRacer.released)).toEqual({
        state: "RELEASED",
      });
      expect(await lockFilesIn(realParent)).toHaveLength(0);
      for (const racer of racers) {
        expect(await racer.child.exited).toMatchObject({ code: 0 });
      }

      // 해제된 잠금은 다시 얻을 수 있다.
      const next = await runOne(dir, "after", { tree, runId: `run-r${round}-after` });
      expect(next.outcome.state).toBe("ACQUIRED");
      await writeFile(next.racer.release, "release");
      expect(await readJson<{ state: string }>(next.racer.released)).toEqual({ state: "RELEASED" });
      expect(await next.racer.child.exited).toMatchObject({ code: 0 });
      expect(await lockFilesIn(realParent)).toHaveLength(0);
    },
    90_000
  );

  it("해제하지 않고 끝난 프로세스의 잠금은 오래된 잠금으로 남아 새 프로세스를 계속 거절하고, 자동으로 지워지지 않는다", async () => {
    const dir = await mkdtemp(join(base, "crash-"));
    const tree = join(dir, "scan");
    const crashed = await runOne(dir, "crashed", {
      tree,
      runId: "run-crashed",
      crashAfterAcquire: true,
    });
    expect(crashed.outcome.state).toBe("ACQUIRED");
    expect(await crashed.racer.child.exited).toMatchObject({ code: 0 }); // 해제 없이 끝났다
    const locks = await lockFilesIn(dir);
    expect(locks).toHaveLength(1);
    const lockPath = join(dir, locks[0]);
    const before = await readFile(lockPath, "utf8");

    // 소유자 프로세스는 이미 없다. 그래도 새 프로세스는 거절되고, 잠금 파일은 한 번도 지워지지 않는다.
    for (const attempt of [1, 2]) {
      const retry = await runOne(dir, `retry-${attempt}`, { tree, runId: `run-retry-${attempt}` });
      expect(retry.outcome).toMatchObject({
        state: "REFUSED",
        reason: "HELD_BY_OTHER",
        holder: { run_id: "run-crashed", pid: crashed.outcome.pid },
      });
      expect(await retry.racer.child.exited).toMatchObject({ code: 0 });
      expect(await readFile(lockPath, "utf8")).toBe(before);
    }

    // README의 복구 절차: 소유자가 끝났음을 확인한 뒤 운영자가 잠금 파일을 직접 지운다.
    await rm(lockPath);
    const recovered = await runOne(dir, "recovered", { tree, runId: "run-recovered" });
    expect(recovered.outcome.state).toBe("ACQUIRED");
    await writeFile(recovered.racer.release, "release");
    expect(await readJson<{ state: string }>(recovered.racer.released)).toEqual({
      state: "RELEASED",
    });
    expect(await lockFilesIn(dir)).toHaveLength(0);
  }, 60_000);

  it("잠금을 쥔 프로세스를 강제로 끝내면(취소·중단) 잠금이 남고, 새 프로세스는 거절된다 — 소유자 상태를 보고 지우지 않는다", async () => {
    const dir = await mkdtemp(join(base, "killed-"));
    const tree = join(dir, "scan");
    const holder = await runOne(dir, "holder", { tree, runId: "run-holder" });
    expect(holder.outcome.state).toBe("ACQUIRED");
    holder.racer.child.kill("SIGKILL");
    await holder.racer.child.exited;
    expect(await lockFilesIn(dir)).toHaveLength(1);

    const after = await runOne(dir, "after-kill", { tree, runId: "run-after-kill" });
    expect(after.outcome).toMatchObject({
      state: "REFUSED",
      reason: "HELD_BY_OTHER",
      holder: { run_id: "run-holder", pid: holder.outcome.pid },
    });
    expect(await lockFilesIn(dir)).toHaveLength(1);
  }, 60_000);

  it("서로 다른 트리는 동시에 각각 얻는다(상호 배제는 같은 트리에만 적용된다)", async () => {
    const dir = await mkdtemp(join(base, "twotrees-"));
    const go = join(dir, "go");
    const a = await startRacer(dir, "a", go, { tree: join(dir, "scan-a"), runId: "run-a" });
    const b = await startRacer(dir, "b", go, { tree: join(dir, "scan-b"), runId: "run-b" });
    await Promise.all([waitForFile(a.ready), waitForFile(b.ready)]);
    await writeFile(go, "go");
    const [oa, ob] = await Promise.all([readJson<Outcome>(a.result), readJson<Outcome>(b.result)]);
    expect([oa.state, ob.state]).toEqual(["ACQUIRED", "ACQUIRED"]);
    expect(oa.keySha256).not.toBe(ob.keySha256);
    expect(await lockFilesIn(dir)).toHaveLength(2);
    await writeFile(a.release, "release");
    await writeFile(b.release, "release");
    await Promise.all([readJson(a.released), readJson(b.released)]);
    expect(await lockFilesIn(dir)).toHaveLength(0);
  }, 60_000);
});
