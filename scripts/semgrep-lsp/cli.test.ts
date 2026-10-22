import { describe, expect, it } from "vitest";
import { VirtualClock } from "./clock";
import { EXIT, main, type CliDeps } from "./cli";
import { buildScanTree, computeScope } from "./scope";
import { MemoryFs } from "./testing/memory-fs";
import { MemoryGit } from "./testing/memory-git";
import { SYNTHETIC_CACHE_DIR, buildSyntheticData } from "./testing/synthetic-data";
import type { GitPort, ProcessPort, Provenance, SpawnSpec } from "./types";

// 이 시험은 아무 프로세스도 띄우지 않는다. `makeProcessPort`는 항상 주입된 가짜이고, 그 가짜의 spawn은 불리면 던진다.
// 실행 방지 장치를 통과하는 경로도 가짜 포트로만 시험한다.

const SHA = "a".repeat(40);
const SHA_UNKNOWN = "c".repeat(40);
const ENV_NAME = "MOAI_SEMGREP_LSP_ALLOW_REAL";

const data = buildSyntheticData();

interface World {
  deps: CliDeps;
  fs: MemoryFs;
  git: MemoryGit;
  out: string[];
  err: string[];
  portCalls: Provenance[];
  gitCalls: string[];
  envCalls: string[];
  spawnCalls: SpawnSpec[];
}

function makeWorld(
  options: {
    env?: Record<string, string>;
    platform?: string;
    extraFiles?: Record<string, string>;
    withBin?: boolean;
  } = {}
): World {
  const files: Record<string, string> = {};
  for (const [name, text] of Object.entries(data.dataFiles)) files[`/data/${name}`] = text;
  for (const [rel, text] of Object.entries(data.cacheFiles)) {
    files[`/cache/${SYNTHETIC_CACHE_DIR}/${rel}`] = text;
  }
  if (options.withBin !== false) files["/opt/semgrep/bin/semgrep"] = "placeholder, not a binary\n";
  Object.assign(files, options.extraFiles ?? {}); // 마지막에 덮어쓴다
  const fs = new MemoryFs(files);
  const git = new MemoryGit({
    [SHA]: {
      "src/a.ts": "export const a = 1;\n",
      "src/b.tsx": "export const b = 2;\n",
      "README.md": "# readme\n",
      "assets/logo.png": "not source\n",
    },
  });
  const out: string[] = [];
  const err: string[] = [];
  const portCalls: Provenance[] = [];
  const gitCalls: string[] = [];
  const envCalls: string[] = [];
  const spawnCalls: SpawnSpec[] = [];
  const env = options.env ?? {};
  const deps: CliDeps = {
    fs,
    makeGit: (dir): GitPort => {
      gitCalls.push(dir);
      return git;
    },
    makeProcessPort: (provenance): ProcessPort => {
      portCalls.push(provenance);
      return {
        provenance,
        async spawn(spec) {
          spawnCalls.push(spec);
          throw new Error("시험: 이 경로에서 프로세스를 띄우면 안 된다");
        },
      };
    },
    clock: new VirtualClock(),
    stdout: (text) => void out.push(text),
    stderr: (text) => void err.push(text),
    getEnv: (name) => {
      envCalls.push(name);
      return env[name];
    },
    dataDir: "/data",
    platform: options.platform ?? "linux",
  };
  return { deps, fs, git, out, err, portCalls, gitCalls, envCalls, spawnCalls };
}

function jsonOut(w: World): Record<string, unknown> {
  return JSON.parse(w.out.join("")) as Record<string, unknown>;
}

// ── 사용법 ──────────────────────────────────────────────────────

describe("main — 사용법", () => {
  it("--help·help는 사용법을 출력하고 0이다", async () => {
    for (const argv of [["--help"], ["help"], ["run", "--help"], ["scope", "-h"]]) {
      const w = makeWorld();
      expect(await main(argv, w.deps), argv.join(" ")).toBe(EXIT.ok);
      expect(w.out.join("")).toContain("사용법");
      expect(w.portCalls).toEqual([]);
    }
  });

  it("명령이 없거나 알 수 없으면 사용법과 2다", async () => {
    for (const argv of [[], ["frobnicate"], ["--rules-cache", "/x"]]) {
      const w = makeWorld();
      expect(await main(argv, w.deps), argv.join(" ")).toBe(EXIT.usage);
      expect(w.err.join("")).toContain("사용법");
      expect(w.portCalls).toEqual([]);
      expect(w.gitCalls).toEqual([]);
    }
  });

  it("필수 인자 누락·모르는 옵션·값 없는 옵션·중복·짝 없는 묶음은 2다", async () => {
    const cases: string[][] = [
      ["precheck"],
      ["precheck", "--rules-cache"],
      ["precheck", "--rules-cache", "/c", "--bogus", "1"],
      ["precheck", "--rules-cache", "/c", "--rules-cache", "/d"],
      ["precheck", "--rules-cache", "/c", "--scan-tree", "/s"],
      ["precheck", "--rules-cache", "/c", "--repo", "/r", "--target-sha", SHA],
      ["scope"],
      ["scope", "--repo", "/r"],
      ["scope", "--target-sha", SHA],
      ["scope", "positional"],
      ["scope", "--repo", "/r", "--target-sha", SHA, "--allow-real-semgrep"],
    ];
    for (const argv of cases) {
      const w = makeWorld();
      expect(await main(argv, w.deps), argv.join(" ")).toBe(EXIT.usage);
      expect(w.portCalls).toEqual([]);
    }
  });
});

// ── scope ───────────────────────────────────────────────────────

describe("main — scope", () => {
  it("짧거나 16진수가 아니거나 대문자인 SHA는 2이고 git을 만들지도 부르지도 않는다", async () => {
    for (const sha of [
      "abc1234",
      "main",
      "HEAD",
      "A".repeat(40),
      `${"a".repeat(39)}g`,
      `${SHA}0`,
    ]) {
      const w = makeWorld();
      expect(await main(["scope", "--repo", "/r", "--target-sha", sha], w.deps), sha).toBe(
        EXIT.usage
      );
      expect(w.gitCalls, sha).toEqual([]);
      expect(w.err.join("")).toContain("40자");
    }
  });

  it("json: E의 경로·blob·결정·사유와 scopeSha256·제외 개수를 출력한다", async () => {
    const w = makeWorld();
    expect(await main(["scope", "--repo", "/r", "--target-sha", SHA], w.deps)).toBe(EXIT.ok);
    expect(w.gitCalls).toEqual(["/r"]);
    const expected = await computeScope(w.git, SHA, data.scopeConfig);
    const body = jsonOut(w);
    expect(body.target_sha).toBe(SHA);
    expect(body.scope_sha256).toBe(expected.scopeSha256);
    expect(body.included).toBe(expected.included.length);
    expect(body.excluded_counts).toEqual(expected.excludedCounts);
    expect(body.files).toEqual(
      expected.entries.map((e) => ({
        path: e.path,
        blob: e.blobSha,
        decision: e.decision,
        reason: e.reason,
      }))
    );
    expect((body.files as { path: string }[]).map((f) => f.path)).toContain("src/a.ts");
  });

  it("tsv: 요약 주석 줄 뒤에 경로·blob·결정·사유 줄이 온다", async () => {
    const w = makeWorld();
    expect(
      await main(["scope", "--repo", "/r", "--target-sha", SHA, "--format", "tsv"], w.deps)
    ).toBe(EXIT.ok);
    const expected = await computeScope(w.git, SHA, data.scopeConfig);
    const lines = w.out.join("").replace(/\n$/, "").split("\n");
    expect(lines[0]).toBe(`# target_sha\t${SHA}`);
    expect(lines[1]).toBe(`# scope_sha256\t${expected.scopeSha256}`);
    expect(lines[2]).toBe(`# included\t${expected.included.length}`);
    const rows = lines.filter((l) => !l.startsWith("#"));
    expect(rows).toHaveLength(expected.entries.length);
    for (const e of expected.entries) {
      expect(rows).toContain(`${e.path}\t${e.blobSha}\t${e.decision}\t${e.reason ?? ""}`);
    }
  });

  it("커밋으로 해석되지 않는 SHA는 1이다", async () => {
    const w = makeWorld();
    expect(await main(["scope", "--repo", "/r", "--target-sha", SHA_UNKNOWN], w.deps)).toBe(
      EXIT.failed
    );
    expect(w.out).toEqual([]);
  });

  it("--format이 json·tsv가 아니면 2이고 git을 부르지 않는다", async () => {
    const w = makeWorld();
    expect(
      await main(["scope", "--repo", "/r", "--target-sha", SHA, "--format", "xml"], w.deps)
    ).toBe(EXIT.usage);
    expect(w.gitCalls).toEqual([]);
  });
});

// ── precheck ────────────────────────────────────────────────────

describe("main — precheck", () => {
  const rulesCache = `/cache/${SYNTHETIC_CACHE_DIR}`;

  it("규칙 캐시가 고정 목록과 같으면 0이고 환경은 건드리지 않는다", async () => {
    const w = makeWorld();
    expect(await main(["precheck", "--rules-cache", rulesCache], w.deps)).toBe(EXIT.ok);
    const body = jsonOut(w);
    expect(body).toMatchObject({
      command: "precheck",
      ok: true,
      representative_status: null,
      reasons: [],
      checked: { rules_pin: true, rules_tree: true, scan_tree: false },
    });
    expect(w.envCalls).toEqual([]);
    expect(w.portCalls).toEqual([]);
    expect(w.gitCalls).toEqual([]);
  });

  it("규칙 파일이 바뀌었거나 없으면 1이고 사유를 낸다", async () => {
    const first = data.ruleModel[0].file;
    const changed = makeWorld({
      extraFiles: { [`${rulesCache}/${first}`]: "# tampered\n" },
    });
    expect(await main(["precheck", "--rules-cache", rulesCache], changed.deps)).toBe(EXIT.failed);
    const body = jsonOut(changed) as { ok: boolean; reasons: { code: string }[] };
    expect(body.ok).toBe(false);
    expect(body.reasons.length).toBeGreaterThan(0);

    const missing = makeWorld();
    expect(await main(["precheck", "--rules-cache", "/cache/nowhere"], missing.deps)).toBe(
      EXIT.failed
    );
    expect((jsonOut(missing) as { reasons: unknown[] }).reasons.length).toBeGreaterThan(0);
  });

  it("스캔 트리가 E와 같으면 0, 파일이 바뀌면 1", async () => {
    const w = makeWorld();
    const scope = await computeScope(w.git, SHA, data.scopeConfig);
    await buildScanTree(w.fs, w.git, scope, "/scan/x");
    const argv = [
      "precheck",
      "--rules-cache",
      rulesCache,
      "--scan-tree",
      "/scan/x",
      "--repo",
      "/r",
      "--target-sha",
      SHA,
    ];
    expect(await main(argv, w.deps)).toBe(EXIT.ok);
    const body = jsonOut(w) as {
      details: Record<string, unknown>;
      checked: { scan_tree: boolean };
    };
    expect(body.checked.scan_tree).toBe(true);
    expect(body.details.scope_sha256).toBe(scope.scopeSha256);

    // 파일 하나의 내용이 바뀐 스캔 트리(나머지는 E와 같다)
    const bad = makeWorld({
      extraFiles: {
        "/scan/x/src/a.ts": "export const a = 999;\n",
        "/scan/x/src/b.tsx": "export const b = 2;\n",
      },
    });
    expect(await main(argv, bad.deps)).toBe(EXIT.failed);
    const codes = (jsonOut(bad) as { reasons: { code: string }[] }).reasons.map((r) => r.code);
    expect(codes).toContain("SCAN_TREE_FILE_CHANGED");
  });

  it("해석되지 않는 대상 SHA는 1이다", async () => {
    const w = makeWorld();
    const argv = [
      "precheck",
      "--rules-cache",
      rulesCache,
      "--scan-tree",
      "/scan/none",
      "--repo",
      "/r",
      "--target-sha",
      SHA_UNKNOWN,
    ];
    expect(await main(argv, w.deps)).toBe(EXIT.failed);
    const codes = (jsonOut(w) as { reasons: { code: string }[] }).reasons.map((r) => r.code);
    expect(codes).toContain("TARGET_SHA_UNRESOLVED");
  });

  it("고정 입력을 읽지 못하면 1이다", async () => {
    const w = makeWorld();
    w.deps.dataDir = "/no-such-data";
    expect(await main(["precheck", "--rules-cache", rulesCache], w.deps)).toBe(EXIT.failed);
    expect(w.err.join("")).toContain("pin.json");
  });
});

// ── run: 실제 실행 방지 장치 ────────────────────────────────────

const RUN_ARGS = [
  "run",
  "--mode",
  "target",
  "--run-id",
  "run-cli-1",
  "--rules-cache",
  `/cache/${SYNTHETIC_CACHE_DIR}`,
  "--evidence-root",
  "/evidence",
  "--repo",
  "/r",
  "--target-sha",
  SHA,
  "--scan-root",
  "/scan/run-1",
];
const BIN = "/opt/semgrep/bin/semgrep";
const FLAG = "--allow-real-semgrep";

function withGuard(parts: { flag?: boolean; bin?: string | null }): string[] {
  const argv = [...RUN_ARGS];
  if (parts.flag !== false) argv.push(FLAG);
  if (parts.bin !== null) argv.push("--semgrep-bin", parts.bin ?? BIN);
  return argv;
}

describe("main — run: 방지 장치", () => {
  const combos: { name: string; flag: boolean; env: boolean; bin: boolean }[] = [];
  for (const flag of [true, false]) {
    for (const env of [true, false]) {
      for (const bin of [true, false]) {
        if (flag && env && bin) continue;
        combos.push({
          name: `플래그 ${flag ? "있음" : "없음"} / 환경 ${env ? "있음" : "없음"} / 실행 파일 ${bin ? "있음" : "없음"}`,
          flag,
          env,
          bin,
        });
      }
    }
  }

  it.each(combos)("$name → NOT_RUN, 종료 코드 3, 어떤 포트도 만들지 않는다", async (c) => {
    const w = makeWorld({ env: c.env ? { [ENV_NAME]: "1" } : {} });
    const code = await main(withGuard({ flag: c.flag, bin: c.bin ? BIN : null }), w.deps);
    expect(code).toBe(EXIT.notRun);
    expect(w.portCalls).toEqual([]);
    expect(w.gitCalls).toEqual([]);
    expect(w.spawnCalls).toEqual([]);
    const body = jsonOut(w) as { status: string; missing_conditions: string[] };
    expect(body.status).toBe("NOT_RUN");
    const missing = body.missing_conditions.join(" ");
    expect(missing.includes("--allow-real-semgrep")).toBe(!c.flag);
    expect(missing.includes(ENV_NAME)).toBe(!c.env);
    expect(missing.includes("--semgrep-bin")).toBe(!c.bin);
    // 아무것도 쓰지 않는다(잠금·증거 폴더 모두).
    expect(await w.fs.exists("/evidence")).toBe(false);
  });

  it("실행 파일이 상대 경로이거나 없는 경로이면 거부한다(PATH 탐색 없음)", async () => {
    for (const bin of ["semgrep", "./semgrep", "bin/semgrep", "/opt/none/semgrep"]) {
      const w = makeWorld({ env: { [ENV_NAME]: "1" } });
      expect(await main(withGuard({ bin }), w.deps), bin).toBe(EXIT.notRun);
      expect(w.portCalls, bin).toEqual([]);
      const missing = (jsonOut(w) as { missing_conditions: string[] }).missing_conditions;
      expect(missing.join(" "), bin).toContain("--semgrep-bin");
    }
  });

  it("환경변수 값이 정확히 1이 아니면 없는 것으로 본다", async () => {
    for (const value of ["", "0", "true", "yes", "11", " 1"]) {
      const w = makeWorld({ env: { [ENV_NAME]: value } });
      expect(await main(withGuard({}), w.deps), value).toBe(EXIT.notRun);
      expect(w.portCalls, value).toEqual([]);
    }
  });

  it("방지 장치를 통과하지 못하면 필수 인자가 없어도 3이다(포트는 만들지 않는다)", async () => {
    const w = makeWorld();
    expect(await main(["run"], w.deps)).toBe(EXIT.notRun);
    expect(w.portCalls).toEqual([]);
  });

  it("방지 장치를 통과해도 필수 인자가 빠지면 2이고 포트를 만들지 않는다", async () => {
    const w = makeWorld({ env: { [ENV_NAME]: "1" } });
    const argv = ["run", FLAG, "--semgrep-bin", BIN, "--mode", "target"];
    expect(await main(argv, w.deps)).toBe(EXIT.usage);
    expect(w.portCalls).toEqual([]);
    const bad = makeWorld({ env: { [ENV_NAME]: "1" } });
    const argv2 = ["run", FLAG, "--semgrep-bin", BIN, "--mode", "bogus", "--run-id", "r"];
    expect(await main(argv2, bad.deps)).toBe(EXIT.usage);
    expect(bad.portCalls).toEqual([]);
  });
});

describe("main — run: 방지 장치를 통과한 뒤", () => {
  const passEnv = { [ENV_NAME]: "1" };

  it('"real" 포트를 정확히 한 번 만들지만 아무것도 띄우지 못한다(관측하지 못한 사실이 사전 검사에서 거부된다)', async () => {
    const w = makeWorld({
      env: {
        ...passEnv,
        SEMGREP_APP_TOKEN: "secret-token-value",
        PATH: "/usr/bin",
        HOME: "/home/x",
      },
    });
    const code = await main(withGuard({}), w.deps);
    expect(code).toBe(EXIT.failed);
    expect(w.portCalls).toEqual(["real"]);
    expect(w.spawnCalls).toEqual([]);
    const body = jsonOut(w) as {
      status: string;
      ok: boolean;
      started: boolean;
      complete: boolean;
      record: {
        provenance: string;
        measurement: { reasons: { code: string }[]; complete: boolean };
      };
      not_implemented_or_not_verified: string[];
    };
    expect(body.ok).toBe(true);
    expect(body.started).toBe(false);
    expect(body.complete).toBe(false);
    expect(body.status).not.toBe("COMPLETE");
    expect(body.record.provenance).toBe("real");
    expect(body.record.measurement.complete).toBe(false);
    const codes = body.record.measurement.reasons.map((r) => r.code);
    expect(codes).toEqual(
      expect.arrayContaining(["TOOL_VERSION_UNVERIFIED", "FOREIGN_SERVER_PROCESS"])
    );
    // 자식 환경 검사에 걸린 것은 없다: 허용 목록·루프백 URL·증거 폴더 안의 경로만 보냈다.
    for (const code of codes) {
      expect(code).not.toMatch(/^(ENV_|APP_TOKEN)/);
    }
    expect(codes).not.toContain("LOCK_NOT_ACQUIRED");
    // 미구현·미확인 목록을 출력에 싣는다.
    expect(body.not_implemented_or_not_verified.length).toBeGreaterThanOrEqual(5);
    const listed = body.not_implemented_or_not_verified.join("\n");
    for (const word of [
      "toolVersionObserved",
      "wheelSha256Observed",
      "foreignServerProcesses",
      "metricsReceiverHits",
      "controlReference",
    ]) {
      expect(listed).toContain(word);
    }
    // 출력 어디에도 기밀 값이 없다.
    expect(w.out.join("")).not.toContain("secret-token-value");
  });

  it("환경은 허용 목록의 이름만 조회한다(토큰·기타 변수는 읽지도 않는다)", async () => {
    const w = makeWorld({
      env: { ...passEnv, SEMGREP_APP_TOKEN: "t", AWS_SECRET_ACCESS_KEY: "k" },
    });
    await main(withGuard({}), w.deps);
    expect([...new Set(w.envCalls)].sort()).toEqual([ENV_NAME, "HOME", "PATH"].sort());
    const win = makeWorld({ env: passEnv, platform: "win32" });
    await main(withGuard({}), win.deps);
    expect([...new Set(win.envCalls)].sort()).toEqual(
      [ENV_NAME, "PATH", "SYSTEMROOT", "TEMP", "TMP"].sort()
    );
  });

  it("실행 잠금 파일을 만들고, 같은 run-id를 다시 쓰면 LOCK_NOT_ACQUIRED로 거부된다", async () => {
    const w = makeWorld({ env: passEnv });
    await main(withGuard({}), w.deps);
    expect(await w.fs.exists("/evidence/run-cli-1/run.lock")).toBe(true);
    const first = jsonOut(w) as { record: { measurement: { reasons: { code: string }[] } } };
    expect(first.record.measurement.reasons.map((r) => r.code)).not.toContain("LOCK_NOT_ACQUIRED");

    w.out.length = 0;
    expect(await main(withGuard({}), w.deps)).toBe(EXIT.failed);
    const second = jsonOut(w) as {
      ok: boolean;
      failure: { stage: string } | null;
      record: { measurement: { reasons: { code: string }[] } } | null;
    };
    // 첫 실행이 증거를 썼으므로 두 번째는 "이미 있는 증거는 덮어쓰지 않는다"로 하드 실패한다(서버는 띄우지 않는다).
    expect(second.ok).toBe(false);
    expect(second.failure?.stage).toBe("evidence");
    expect(w.spawnCalls).toEqual([]);
  });

  it("control 모드도 같은 방지 장치 뒤에서만 포트를 만들고 아무것도 띄우지 않는다", async () => {
    const w = makeWorld({ env: passEnv });
    const argv = [
      "run",
      "--mode",
      "control",
      "--run-id",
      "run-cli-ctl",
      "--rules-cache",
      `/cache/${SYNTHETIC_CACHE_DIR}`,
      "--evidence-root",
      "/evidence",
      "--control-fixtures-root",
      "/repo",
      "--control-tree-root",
      "/ctl",
      FLAG,
      "--semgrep-bin",
      BIN,
    ];
    expect(await main(argv, w.deps)).toBe(EXIT.failed);
    expect(w.portCalls).toEqual(["real"]);
    expect(w.gitCalls).toEqual([]);
    expect(w.spawnCalls).toEqual([]);
    expect((jsonOut(w) as { complete: boolean }).complete).toBe(false);
  });

  it("run은 어떤 입력으로도 0이 될 수 없다: 관측 불가 사실이 모두 null이라 COMPLETE에 이르지 못한다", async () => {
    // 규칙 캐시·스캔 트리까지 모두 맞는 완전한 환경에서도 마찬가지다.
    const w = makeWorld({ env: passEnv });
    const scope = await computeScope(w.git, SHA, data.scopeConfig);
    await buildScanTree(w.fs, w.git, scope, "/scan/run-1");
    expect(await main(withGuard({}), w.deps)).toBe(EXIT.failed);
    const body = jsonOut(w) as { started: boolean; complete: boolean; status: string };
    expect(body.started).toBe(false);
    expect(body.complete).toBe(false);
    expect(w.spawnCalls).toEqual([]);
  });

  it("다른 파일(설정·임계값·훅)은 읽거나 쓰지 않는다: 접근한 곳은 고정 입력·지정한 경로뿐이다", async () => {
    const w = makeWorld({ env: passEnv });
    const touched: string[] = [];
    const inner = w.deps.fs;
    w.deps.fs = {
      readFile: async (p) => (touched.push(p), inner.readFile(p)),
      writeFileExclusive: async (p, d) => (touched.push(p), inner.writeFileExclusive(p, d)),
      mkdirp: async (p) => (touched.push(p), inner.mkdirp(p)),
      listFilesRecursive: async (p) => (touched.push(p), inner.listFilesRecursive(p)),
      exists: async (p) => (touched.push(p), inner.exists(p)),
    };
    await main(withGuard({}), w.deps);
    for (const path of touched) {
      expect(path).toMatch(/^\/(data|cache|evidence|scan|opt\/semgrep|repo|ctl)(\/|$)/);
      expect(path).not.toMatch(/quality\.yaml|lsp\.yaml|\.moai\/config|hooks/);
    }
  });
});
