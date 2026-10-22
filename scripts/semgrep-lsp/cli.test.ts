import { describe, expect, it } from "vitest";
import { VirtualClock } from "./clock";
import { EXIT, main, type CliDeps } from "./cli";
import {
  controlFingerprintOf,
  harnessFingerprintOf,
  isHarnessImplementationFile,
} from "./fingerprint";
import { buildScanTree, computeScope } from "./scope";
import { sha256Hex } from "./sha";
import { MemoryFs } from "./testing/memory-fs";
import { MemoryGit } from "./testing/memory-git";
import {
  SYNTHETIC_CACHE_DIR,
  SYNTHETIC_HARNESS_ROOT,
  SYNTHETIC_HARNESS_FILES,
  buildSyntheticData,
  harnessFilesAt,
} from "./testing/synthetic-data";
import type { GitPort, ProcessPort, Provenance, SpawnSpec } from "./types";

// 이 시험은 아무 프로세스도 띄우지 않는다. `makeProcessPort`는 항상 주입된 가짜이고, 그 가짜의 spawn은 불리면 던진다.
// 실행 방지 장치를 통과하는 경로도 가짜 포트로만 시험한다.

const SHA = "a".repeat(40);
const SHA_UNKNOWN = "c".repeat(40);
const ENV_NAME = "MOAI_SEMGREP_LSP_ALLOW_REAL";

const data = buildSyntheticData();
const HARNESS_ROOT = SYNTHETIC_HARNESS_ROOT;

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
  // 고정 입력 폴더(data/)의 부모가 하네스 루트다: cli는 부모를 하네스 지문 계산에 넘긴다.
  for (const [name, text] of Object.entries(data.dataFiles)) {
    files[`${HARNESS_ROOT}/data/${name}`] = text;
  }
  Object.assign(files, harnessFilesAt(HARNESS_ROOT)); // 하네스 지문이 읽는 합성 구현 파일
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
    dataDir: `${HARNESS_ROOT}/data`,
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

  it("run은 고정 입력 폴더(data/)의 부모를 하네스 루트로 넘겨 하네스 지문을 계산한다", async () => {
    const w = makeWorld({ env: passEnv });
    await main(withGuard({}), w.deps);
    const decoder = new TextDecoder();
    const run = JSON.parse(decoder.decode(await w.fs.readFile("/evidence/run-cli-1/run.json"))) as {
      inputs: Record<string, unknown>;
    };
    const expected = harnessFingerprintOf(
      Object.entries(SYNTHETIC_HARNESS_FILES)
        .filter(([rel]) => isHarnessImplementationFile(rel))
        .map(([rel, text]) => ({ path: rel, sha256: sha256Hex(text) }))
    );
    expect(run.inputs.harness_sha256).toBe(expected);
    // 관측하지 못한 도구 사실이 있으므로 결합은 null이고, 대조 고정 입력이 이 세계에 없어 대조 지문도 null이다.
    expect(run.inputs.binding_sha256).toBeNull();
    expect(run.inputs.control_sha256).toBeNull();
    const text = decoder.decode(await w.fs.readFile("/evidence/run-cli-1/fingerprints.txt"));
    expect(text).toContain(`harness_sha256	${expected}`);
    expect(text).toContain("binding_sha256	(확인하지 못함)");
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
      expect(path).toMatch(/^\/(harness|cache|evidence|scan|opt\/semgrep|repo|ctl)(\/|$)/);
      expect(path).not.toMatch(/quality\.yaml|lsp\.yaml|\.moai\/config|hooks/);
    }
  });
});

// ── run: 대조 예제 경로(--control-fixtures-root) ─────────────────
// target 모드도 대조 지문을 계산하므로(harness.ts) 대조 예제의 실제 위치가 필요하다. 이 위치는 검사 대상 저장소(--repo)와
// 별개다: 대상 SHA에는 예제가 없을 수 있다. 모든 시험은 CLI(main) → 하네스 → 증거 파일(run.json)의 실제 경로로 확인한다.

describe("main — run: 대조 예제 경로", () => {
  const passEnv = { [ENV_NAME]: "1" };
  const EXPECTATIONS_TEXT = data.dataFiles["control-expectations.json"];
  const cases = data.controlExpectations.cases;
  /** --repo(/r)와 다른 경로. 대상 SHA의 트리에는 이 예제들이 없다. */
  const FIXTURES_REPO = "/ctl-repo";
  const decoder = new TextDecoder();

  function fixtureText(tag: string, path: string): string {
    return `// 합성 대조 예제 ${tag}: ${path}\n`;
  }
  function fixtureFiles(root: string, tag: string): Record<string, string> {
    return Object.fromEntries(cases.map((c) => [`${root}/${c.fixture}`, fixtureText(tag, c.path)]));
  }
  /** CLI·하네스를 거치지 않고, 같은 파일의 바이트로 직접 계산한 대조 지문. */
  function directFingerprint(tag: string): string {
    return controlFingerprintOf(
      sha256Hex(EXPECTATIONS_TEXT),
      cases.map((c) => ({
        path: c.path,
        fixture: c.fixture,
        sha256: sha256Hex(fixtureText(tag, c.path)),
      }))
    );
  }
  const targetArgv = (fixturesRoot: string | null): string[] => [
    ...withGuard({}),
    ...(fixturesRoot === null ? [] : ["--control-fixtures-root", fixturesRoot]),
  ];
  async function runJson(
    w: World,
    runId = "run-cli-1"
  ): Promise<{ inputs: Record<string, unknown> }> {
    return JSON.parse(decoder.decode(await w.fs.readFile(`/evidence/${runId}/run.json`)));
  }
  async function fingerprintsTxt(w: World, runId = "run-cli-1"): Promise<string> {
    return decoder.decode(await w.fs.readFile(`/evidence/${runId}/fingerprints.txt`));
  }
  function reasonCodes(w: World): string[] {
    const body = jsonOut(w) as { record: { measurement: { reasons: { code: string }[] } } };
    return body.record.measurement.reasons.map((r) => r.code);
  }

  it("target: --repo와 다른 경로의 대조 예제로 지문을 계산하고, run.json 값이 같은 파일의 직접 계산과 같다", async () => {
    const w = makeWorld({ env: passEnv, extraFiles: fixtureFiles(FIXTURES_REPO, "v1") });
    const touched: string[] = [];
    const inner = w.deps.fs;
    w.deps.fs = {
      readFile: async (p) => (touched.push(p), inner.readFile(p)),
      writeFileExclusive: (p, d) => inner.writeFileExclusive(p, d),
      mkdirp: (p) => inner.mkdirp(p),
      listFilesRecursive: (p) => inner.listFilesRecursive(p),
      exists: (p) => inner.exists(p),
    };
    expect(await main(targetArgv(FIXTURES_REPO), w.deps)).toBe(EXIT.failed);

    const direct = directFingerprint("v1");
    const run = await runJson(w);
    expect(run.inputs.control_sha256).toBe(direct);
    expect(await fingerprintsTxt(w)).toContain(`control_sha256\t${direct}`);
    // 전달한 위치의 파일을 실제로 읽었다. 자리표시 경로에서는 예제를 읽으려 하지 않았다.
    expect(touched).toContain(`${FIXTURES_REPO}/${cases[0].fixture}`);
    expect(
      touched.filter((p) => p.includes("UNUSED-IN-THIS-MODE") && p.includes(".moai/fixtures"))
    ).toEqual([]);
    // 검사 대상 저장소는 git으로만 열리고, 예제 위치와 섞이지 않는다.
    expect(w.gitCalls).toEqual(["/r"]);
    // 프로세스는 여전히 뜨지 않고, 대조 참조(CLI는 연결하지 않는다)는 계속 거절된다.
    expect(w.spawnCalls).toEqual([]);
    expect(reasonCodes(w)).toContain("CONTROL_REFERENCE_MISSING");
    expect((jsonOut(w) as { complete: boolean }).complete).toBe(false);
  });

  it("target: 예제가 바뀌면 대조 지문이 달라지고 각각 직접 계산과 같다", async () => {
    const hashes: string[] = [];
    for (const tag of ["v1", "v2"]) {
      const w = makeWorld({ env: passEnv, extraFiles: fixtureFiles(FIXTURES_REPO, tag) });
      await main(targetArgv(FIXTURES_REPO), w.deps);
      const hash = (await runJson(w)).inputs.control_sha256;
      expect(hash).toBe(directFingerprint(tag));
      hashes.push(hash as string);
    }
    expect(hashes[0]).not.toBe(hashes[1]);

    // 한 사례의 예제만 바꿔도 달라진다.
    const files = fixtureFiles(FIXTURES_REPO, "v1");
    files[`${FIXTURES_REPO}/${cases[0].fixture}`] += "// 한 줄 추가\n";
    const w = makeWorld({ env: passEnv, extraFiles: files });
    await main(targetArgv(FIXTURES_REPO), w.deps);
    const changed = (await runJson(w)).inputs.control_sha256;
    expect(changed).not.toBe(hashes[0]);
    expect(changed).not.toBeNull();
  });

  it("target: --control-fixtures-root를 주지 않으면 지문은 null이고 대조 참조는 거절된다(참조 값을 만들어 내지 않는다)", async () => {
    const w = makeWorld({ env: passEnv, extraFiles: fixtureFiles(FIXTURES_REPO, "v1") });
    expect(await main(targetArgv(null), w.deps)).toBe(EXIT.failed);
    const run = await runJson(w);
    expect(run.inputs.control_sha256).toBeNull();
    expect(run.inputs.binding_sha256).toBeNull();
    expect(await fingerprintsTxt(w)).toContain("control_sha256\t(확인하지 못함)");
    expect(reasonCodes(w)).toContain("CONTROL_REFERENCE_MISSING");
    expect(w.spawnCalls).toEqual([]);
    expect((jsonOut(w) as { complete: boolean }).complete).toBe(false);
  });

  it("target: 예제 위치가 없거나 일부를 읽을 수 없으면 지문은 null이다", async () => {
    // (a) 존재하지 않는 위치
    const missing = makeWorld({ env: passEnv });
    await main(targetArgv("/no-such-fixtures"), missing.deps);
    expect((await runJson(missing)).inputs.control_sha256).toBeNull();
    expect(reasonCodes(missing)).toContain("CONTROL_REFERENCE_MISSING");

    // (b) 한 사례의 예제 파일이 없다
    const files = fixtureFiles(FIXTURES_REPO, "v1");
    delete files[`${FIXTURES_REPO}/${cases[1].fixture}`];
    const partial = makeWorld({ env: passEnv, extraFiles: files });
    await main(targetArgv(FIXTURES_REPO), partial.deps);
    expect((await runJson(partial)).inputs.control_sha256).toBeNull();

    // (c) 파일은 있으나 읽기가 실패한다
    const unreadable = makeWorld({ env: passEnv, extraFiles: fixtureFiles(FIXTURES_REPO, "v1") });
    const inner = unreadable.deps.fs;
    const bad = `${FIXTURES_REPO}/${cases[0].fixture}`;
    unreadable.deps.fs = {
      readFile: async (p) => {
        if (p === bad) throw new Error("EACCES: 시험용 읽기 실패");
        return inner.readFile(p);
      },
      writeFileExclusive: (p, d) => inner.writeFileExclusive(p, d),
      mkdirp: (p) => inner.mkdirp(p),
      listFilesRecursive: (p) => inner.listFilesRecursive(p),
      exists: (p) => inner.exists(p),
    };
    await main(targetArgv(FIXTURES_REPO), unreadable.deps);
    const run = await runJson(unreadable);
    expect(run.inputs.control_sha256).toBeNull();
    expect(run.inputs.binding_sha256).toBeNull();
    expect(reasonCodes(unreadable)).toContain("CONTROL_REFERENCE_MISSING");
    for (const w of [missing, partial, unreadable]) {
      expect(w.spawnCalls).toEqual([]);
      expect((jsonOut(w) as { complete: boolean }).complete).toBe(false);
    }
  });

  it("target: 쓰이지 않는 대조 트리 위치는 자리표시 경로로 남고 아무것도 만들지 않는다", async () => {
    const w = makeWorld({ env: passEnv, extraFiles: fixtureFiles(FIXTURES_REPO, "v1") });
    await main(targetArgv(FIXTURES_REPO), w.deps);
    expect(await w.fs.exists("/evidence/run-cli-1/UNUSED-IN-THIS-MODE")).toBe(false);
    expect(await w.fs.exists("/ctl")).toBe(false);
  });

  it("control: 기존 경로 처리 유지 — 같은 옵션으로 대조 예제를 읽어 지문을 계산한다", async () => {
    const w = makeWorld({ env: passEnv, extraFiles: fixtureFiles(FIXTURES_REPO, "v1") });
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
      FIXTURES_REPO,
      "--control-tree-root",
      "/ctl",
      FLAG,
      "--semgrep-bin",
      BIN,
    ];
    expect(await main(argv, w.deps)).toBe(EXIT.failed);
    expect(w.gitCalls).toEqual([]);
    expect(w.spawnCalls).toEqual([]);
    expect((await runJson(w, "run-cli-ctl")).inputs.control_sha256).toBe(directFingerprint("v1"));
  });

  it("control: 두 경로 중 하나라도 없으면 여전히 사용법 오류(2)이고 포트를 만들지 않는다", async () => {
    for (const omit of ["--control-fixtures-root", "--control-tree-root"]) {
      const w = makeWorld({ env: passEnv });
      const given: Record<string, string> = {
        "--control-fixtures-root": FIXTURES_REPO,
        "--control-tree-root": "/ctl",
      };
      delete given[omit];
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
        ...Object.entries(given).flat(),
        FLAG,
        "--semgrep-bin",
        BIN,
      ];
      expect(await main(argv, w.deps), omit).toBe(EXIT.usage);
      expect(w.portCalls, omit).toEqual([]);
    }
  });

  it("도움말: target의 경로 계약 — 대조 예제 위치는 --repo와 별개이고 생략하면 지문이 null이다", async () => {
    const w = makeWorld();
    await main(["--help"], w.deps);
    const help = w.out.join("");
    expect(help).toMatch(/--control-fixtures-root[^\n]*\(target\)/);
    expect(help).toMatch(/--control-fixtures-root[^\n]*\(control\)/);
    expect(help).toContain("--repo와 별개");
    expect(help).toContain("null");
  });
});
