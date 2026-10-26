import { constants as fsConstants } from "node:fs";
import {
  mkdir,
  mkdtemp,
  open as openFile,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createNodeArtifactHasher, readOnlyOpenFlags } from "./artifact-node";
import { VirtualClock } from "./clock";
import { EXIT, buildChildEnv, main, type CliDeps } from "./cli";
import { canonicalJson } from "./canonical";
import {
  buildBinding,
  controlFingerprintOf,
  harnessFingerprintOf,
  isHarnessImplementationFile,
} from "./fingerprint";
import { toControlReference } from "./harness";
import { startMetricsReceiver } from "./metrics-node";
import { acquireRunLock, releaseRunLock } from "./run-lock";
import { createNodeRunLockPort } from "./run-lock-node";
import { expectedRulesSha256, rulesListSha256 } from "./rules-manifest";
import { buildScanTree, computeScope } from "./scope";
import { sha256Hex } from "./sha";
import {
  syntheticControlRunRecord,
  syntheticTargetRunRecord,
  type SyntheticControlRecordOptions,
} from "./testing/control-record-fixtures";
import { createNodeFs } from "./fs-node";
import { FakeMetricsReceiver } from "./testing/fake-metrics";
import { canConnectLoopback } from "./testing/loopback-client";
import { recorded } from "./testing/call-recorder";
import { FakeChild } from "./testing/fake-process";
import { MemoryArtifactHasher } from "./testing/memory-artifact";
import { LINUX_OPEN_CONSTANTS, PosixOpenEmulator } from "./testing/posix-open-emulator";
import { routedFs } from "./testing/routed-fs";
import { INVALID_RUN_IDS, VALID_RUN_IDS } from "./testing/run-id-cases";
import { MemoryFs } from "./testing/memory-fs";
import { MemoryRunLock } from "./testing/memory-run-lock";
import { MemoryGit } from "./testing/memory-git";
import {
  OWN_PID,
  SyntheticLister,
  listerOf,
  ownRow,
  parentRow,
  plainRow,
  serverRow,
  snapshotOf,
  versionRow,
} from "./testing/synthetic-processes";
import {
  SYNTHETIC_CACHE_DIR,
  SYNTHETIC_HARNESS_ROOT,
  SYNTHETIC_HARNESS_FILES,
  SYNTHETIC_WHEEL,
  buildSyntheticData,
  harnessFilesAt,
} from "./testing/synthetic-data";
import { drive } from "./testing/stub-lsp";
import { AsyncByteQueue } from "./streams";
import { createNodeProcessPort } from "./process-node";
import type { ArtifactHashPort } from "./tool-observation";
import type {
  ChildHandle,
  ForeignServerObservationSummary,
  GitPort,
  ProcessLister,
  ProcessPort,
  Provenance,
  ReferenceFingerprints,
  RunToolObservation,
  SpawnSpec,
  ToolObservationSummary,
} from "./types";

// 시험 전용: 파일에서 읽은 JSON을 마음대로 변조하는 시험이라 느슨한 타입을 쓴다(운영 코드는 unknown으로만 다룬다).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Plain = Record<string, any>;

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
  /** 공유 실행 잠금의 메모리 포트(파일 저장소를 직접 들여다볼 수 있다). */
  lock: MemoryRunLock;
  /** CLI가 연 수신기들(가짜). 시험이 건수·상태를 정한다. */
  receivers: FakeMetricsReceiver[];
  /** 버전 확인(`--version`) 호출. LSP 서버 호출(spawnCalls)과 따로 센다. */
  versionCalls: SpawnSpec[];
  /** 버전 확인이 띄운 가짜 자식들. */
  versionChildren: ChildHandle[];
  /** 휠 아티팩트 해시 포트(메모리). */
  hasher: MemoryArtifactHasher;
  /** 조회 어댑터를 만들 때 CLI가 넘긴 프로세스 포트들. */
  listerPorts: ProcessPort[];
}

function makeWorld(
  options: {
    env?: Record<string, string>;
    platform?: string;
    extraFiles?: Record<string, string>;
    withBin?: boolean;
    /** 수신기를 만드는 방법. 기본은 0건을 관측 중인 가짜. 던지면 열기 실패를 재현한다. */
    receiver?: () => FakeMetricsReceiver;
    /**
     * 버전 확인(`--version`)이 띄우는 자식을 만드는 방법. 생략하면 "실행 파일을 띄우지 못한다"(SPAWN_FAILED)여서 예전처럼 버전은
     * 관측되지 않는다(null). LSP 서버 호출은 어느 경우에도 던진다.
     */
    versionChild?: (spec: SpawnSpec) => ChildHandle;
    /** 포트가 알리는 출처. 생략하면 CLI가 요청한 값 그대로다. 스크립트된 가짜 자식을 쓰는 시험은 "stub"으로 정직하게 표시한다. */
    portProvenance?: Provenance;
    /**
     * 프로세스 목록 조회 어댑터(합성). 생략하면 "지원하지 않는 환경"이라 foreignServerProcesses는 예전처럼 null이다. 이 어댑터가 읽은
     * 목록은 합성 자료이며 실제 운영체제 관측이 아니다.
     */
    lister?: ProcessLister;
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
  const versionCalls: SpawnSpec[] = [];
  const versionChildren: ChildHandle[] = [];
  const hasher = new MemoryArtifactHasher();
  const env = options.env ?? {};
  const lock = new MemoryRunLock();
  const receivers: FakeMetricsReceiver[] = [];
  const listerPorts: ProcessPort[] = [];
  const deps: CliDeps = {
    fs,
    makeGit: (dir): GitPort => {
      gitCalls.push(dir);
      return git;
    },
    makeProcessPort: (provenance): ProcessPort => {
      portCalls.push(provenance);
      return {
        provenance: options.portProvenance ?? provenance,
        async spawn(spec) {
          // 버전 확인은 인자가 정확히 ["--version"]인 호출뿐이다. 그 밖(LSP 서버)은 어느 시험에서도 띄우면 안 된다.
          if (spec.args.length === 1 && spec.args[0] === "--version") {
            versionCalls.push(spec);
            if (!options.versionChild) throw new Error("시험: 버전 확인 실행 파일을 띄우지 못한다");
            const child = options.versionChild(spec);
            versionChildren.push(child);
            return child;
          }
          spawnCalls.push(spec);
          throw new Error("시험: 이 경로에서 프로세스를 띄우면 안 된다");
        },
      };
    },
    clock: new VirtualClock(),
    runLock: lock,
    startMetricsReceiver: async () => {
      const receiver = options.receiver ? options.receiver() : new FakeMetricsReceiver();
      receivers.push(receiver);
      return receiver;
    },
    hashArtifact: hasher,
    makeProcessLister: (port): ProcessLister => {
      listerPorts.push(port);
      return (
        options.lister ?? new SyntheticLister({ ok: false, failure: "UNSUPPORTED_PLATFORM" }, null)
      );
    },
    ownPid: OWN_PID,
    stdout: (text) => void out.push(text),
    stderr: (text) => void err.push(text),
    getEnv: (name) => {
      envCalls.push(name);
      return env[name];
    },
    dataDir: `${HARNESS_ROOT}/data`,
    platform: options.platform ?? "linux",
  };
  return {
    deps,
    fs,
    git,
    out,
    err,
    portCalls,
    gitCalls,
    envCalls,
    spawnCalls,
    lock,
    receivers,
    versionCalls,
    versionChildren,
    hasher,
    listerPorts,
  };
}

function jsonOut(w: World): Record<string, unknown> {
  return JSON.parse(w.out.join("")) as Record<string, unknown>;
}

/** `--version`을 흉내 내는 가짜 자식: stdout을 내보내고 곧바로 종료한다. 실제 Semgrep이 아니다. */
function versionOutput(
  stdout: string | Uint8Array,
  exit: number | null = 0,
  signal: string | null = null
): () => FakeChild {
  return () => {
    const child = new FakeChild();
    child.emitStdout(stdout);
    child.exit(exit, signal);
    return child;
  };
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

  it("실행별 증거 표지(run.marker)를 만들고, 같은 run-id를 다시 쓰면 거부된다 — 표지는 공유 잠금이 아니다", async () => {
    const w = makeWorld({ env: passEnv });
    await main(withGuard({}), w.deps);
    expect(await w.fs.exists("/evidence/run-cli-1/run.marker")).toBe(true);
    expect(await w.fs.exists("/evidence/run-cli-1/run.lock")).toBe(false); // 옛 이름은 더 만들지 않는다
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
      physicalKey: (p) => inner.physicalKey(p),
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

describe("main — run: 대조 예제 경로", () => {
  const passEnv = { [ENV_NAME]: "1" };

  it("target: --repo와 다른 경로의 대조 예제로 지문을 계산하고, run.json 값이 같은 파일의 직접 계산과 같다", async () => {
    const w = makeWorld({ env: passEnv, extraFiles: fixtureFiles(FIXTURES_REPO, "v1") });
    const touched: string[] = [];
    const inner = w.deps.fs;
    w.deps.fs = {
      readFile: async (p) => (touched.push(p), inner.readFile(p)),
      writeFileExclusive: (p, d) => inner.writeFileExclusive(p, d),
      mkdirp: (p) => inner.mkdirp(p),
      physicalKey: (p) => inner.physicalKey(p),
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
      physicalKey: (p) => inner.physicalKey(p),
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

// ── run: 저장된 대조 실행 기록(--control-record) ─────────────────
// target CLI가 명시한 control run.json을 읽어 대조 참조로 잇는 경로. 검사 대상 저장소(--repo), 대조 예제 저장소
// (--control-fixtures-root), 대조 기록(--control-record)은 서로 다른 세 경로다. 모든 시험은 CLI(main) → 파일 읽기 →
// 하네스 → 증거 파일(run.json)로 확인한다.
//
// "시험용 기록"과 "운영 관측"을 구분한다: 기록은 시험이 손으로 구성한 합성이고(testing/control-record-fixtures.ts, real이라고
// *주장하는* 기록 포함), 이 CLI의 운영 관측 중 다른 서버 프로세스는 구현되지 않아 항상 null이다. 도구 버전·휠은 이 시험 세계에서
// 관측되지 않는다(버전 확인 가짜 자식이 없고 --wheel-artifact도 주지 않는다 — 관측 시험은 아래 '도구 버전·휠 관측' 절).
// 그래서 기록이 모든 것을 맞춰도 이 CLI의 target 실행은 COMPLETE가 될 수 없고, 어댑터가 수락한 사실은 run.json의
// control_reference와 (관측하지 못한 값에 대한) FINGERPRINT_MISSING으로만 드러난다.

describe("main — run: 대조 기록(--control-record)", () => {
  const passEnv = { [ENV_NAME]: "1" };
  const RECORD_PATH = "/records/control/run.json";

  interface RunJson {
    inputs: Record<string, unknown>;
    control_reference: Record<string, unknown> | null;
    measurement: {
      status: string;
      complete: boolean;
      reasons: { code: string; detail?: string }[];
    };
  }
  interface RunStdout {
    started: boolean;
    complete: boolean;
    control_record: {
      given: boolean;
      path?: string;
      accepted?: boolean;
      run_id?: string | null;
      rejection?: string | null;
    };
  }

  const harnessSha = (): string =>
    harnessFingerprintOf(
      Object.entries(SYNTHETIC_HARNESS_FILES)
        .filter(([rel]) => isHarnessImplementationFile(rel))
        .map(([rel, text]) => ({ path: rel, sha256: sha256Hex(text) }))
    );

  /** 이 CLI 세계의 "이번 실행" 지문과 일치하도록 만든 기록 쪽 지문(도구 버전·휠은 시험이 정한 값이다). */
  function recordFingerprints(over: { pin?: string; harness?: string; control?: string } = {}): {
    fingerprints: ReferenceFingerprints;
    pinSha256: string;
  } {
    const pinSha256 = over.pin ?? data.pinSha256;
    const parts = {
      tool_version: data.pin.semgrep.version,
      wheel_sha256: SYNTHETIC_WHEEL,
      rules_list_sha256: rulesListSha256(data.rulesFiles),
      rules_expected_sha256: expectedRulesSha256(data.ruleModel),
      harness_sha256: over.harness ?? harnessSha(),
      control_sha256: over.control ?? directFingerprint("v1"),
    };
    return {
      pinSha256,
      fingerprints: {
        ...parts,
        binding_sha256: buildBinding({ ...parts, pin_sha256: pinSha256 }),
      },
    };
  }

  function control(
    over: Partial<SyntheticControlRecordOptions> = {},
    fp: Parameters<typeof recordFingerprints>[0] = {}
  ) {
    return syntheticControlRunRecord({ ...recordFingerprints(fp), ...over });
  }

  const asPlain = (value: unknown): Plain => JSON.parse(canonicalJson(value)) as Plain;

  function worldWith(content: string | null, extra: Record<string, string> = {}): World {
    return makeWorld({
      env: passEnv,
      extraFiles: {
        ...fixtureFiles(FIXTURES_REPO, "v1"),
        ...(content === null ? {} : { [RECORD_PATH]: content }),
        ...extra,
      },
    });
  }
  const argvWithRecord = (path: string | null = RECORD_PATH): string[] => [
    ...targetArgv(FIXTURES_REPO),
    ...(path === null ? [] : ["--control-record", path]),
  ];
  const readRun = async (w: World): Promise<RunJson> =>
    JSON.parse(decoder.decode(await w.fs.readFile("/evidence/run-cli-1/run.json"))) as RunJson;
  const stdout = (w: World): RunStdout => JSON.parse(w.out.join("")) as RunStdout;

  /** 던지지 않았고(stderr 비어 있음), 서버를 띄우지 않았고, COMPLETE가 아니다. 모든 시나리오가 지켜야 하는 공통 결과. */
  async function expectRefused(w: World, code: number): Promise<RunJson> {
    expect(code).toBe(EXIT.failed);
    expect(w.err.join("")).toBe("");
    expect(w.spawnCalls).toEqual([]);
    const out = stdout(w);
    expect(out.started).toBe(false);
    expect(out.complete).toBe(false);
    const run = await readRun(w);
    expect(run.measurement.complete).toBe(false);
    expect(run.measurement.status).not.toBe("COMPLETE");
    return run;
  }
  const codesOfRun = (run: RunJson): string[] => run.measurement.reasons.map((r) => r.code);

  /** 읽은 경로를 모으는 파일 포트로 감싼다. */
  function recordReads(w: World): string[] {
    const touched: string[] = [];
    const inner = w.deps.fs;
    w.deps.fs = {
      readFile: async (p) => (touched.push(p), inner.readFile(p)),
      writeFileExclusive: (p, d) => inner.writeFileExclusive(p, d),
      mkdirp: (p) => inner.mkdirp(p),
      physicalKey: (p) => inner.physicalKey(p),
      listFilesRecursive: (p) => inner.listFilesRecursive(p),
      exists: (p) => inner.exists(p),
    };
    return touched;
  }

  it("옵션을 생략하면 기존 동작 그대로다: CONTROL_REFERENCE_MISSING만 나오고 기록 파일은 읽지 않는다", async () => {
    const w = worldWith(canonicalJson(control()));
    const touched = recordReads(w);
    const run = await expectRefused(w, await main(argvWithRecord(null), w.deps));
    expect(codesOfRun(run)).toContain("CONTROL_REFERENCE_MISSING");
    expect(codesOfRun(run)).not.toContain("CONTROL_REFERENCE_RECORD_REJECTED");
    expect(run.control_reference).toBeNull();
    expect(touched.filter((p) => p.startsWith("/records"))).toEqual([]); // 자동 탐색 없음
    expect(stdout(w).control_record).toEqual({ given: false });
  });

  it("자격을 갖춘 합성 기록을 수락해 target의 control_reference로 잇는다 — 현재 실행과 다시 맞춰 보되 값을 채우거나 복사하지 않는다", async () => {
    const record = control();
    expect(record.reference_qualification.eligible).toBe(true); // 시험 전제
    const w = worldWith(canonicalJson(record));
    const run = await expectRefused(w, await main(argvWithRecord(), w.deps));

    // 연결됨: run.json의 control_reference는 기록의 요약이다(기록의 지문 그대로).
    expect(run.control_reference).toEqual(toControlReference(record, true));
    expect(stdout(w).control_record).toMatchObject({
      given: true,
      path: RECORD_PATH,
      accepted: true,
      run_id: record.run_id,
      rejection: null,
    });

    // 참조를 쓸 수 없다는 사유는 없다.
    const codes = codesOfRun(run);
    for (const gone of [
      "CONTROL_REFERENCE_MISSING",
      "CONTROL_REFERENCE_RECORD_REJECTED",
      "CONTROL_REFERENCE_SYNTHETIC",
      "CONTROL_REFERENCE_NOT_PASS",
      "CONTROL_REFERENCE_PIN_MISMATCH",
      "CONTROL_REFERENCE_HARNESS_MISMATCH",
      "CONTROL_REFERENCE_CONTROL_MISMATCH",
      "CONTROL_REFERENCE_NEGATIVE_INCOMPLETE",
      "N0_UNCONFIRMED",
    ]) {
      expect(codes, gone).not.toContain(gone);
    }

    // 남은 거절은 이 CLI가 관측하지 못한 값(도구 버전·휠·결합) 때문이다. 기록의 값으로 채우지 않는다.
    expect(codes).toContain("CONTROL_REFERENCE_FINGERPRINT_MISSING");
    const missing = run.measurement.reasons.find(
      (r) => r.code === "CONTROL_REFERENCE_FINGERPRINT_MISSING"
    );
    for (const name of ["tool_version", "wheel_sha256", "binding_sha256"]) {
      expect(missing?.detail, name).toContain(name);
    }
    expect(codes).toContain("TOOL_VERSION_UNVERIFIED");
    expect(run.inputs.tool_version_observed).toBeNull();
    expect(run.inputs.wheel_sha256_observed).toBeNull();
    expect(run.inputs.binding_sha256).toBeNull();
    // 이번 실행의 하네스·대조 지문은 이번 실행이 읽은 파일에서 계산한 값이다(기록에서 복사하지 않았다).
    expect(run.inputs.harness_sha256).toBe(harnessSha());
    expect(run.inputs.control_sha256).toBe(directFingerprint("v1"));
  });

  it("세 경로는 서로 다르다: 대상 저장소는 git으로만, 예제는 예제 저장소에서, 기록은 기록 경로에서 읽는다", async () => {
    const w = worldWith(canonicalJson(control()));
    const touched = recordReads(w);
    await main(argvWithRecord(), w.deps);
    expect(w.gitCalls).toEqual(["/r"]);
    expect(touched).toContain(RECORD_PATH);
    expect(touched).toContain(`${FIXTURES_REPO}/${cases[0].fixture}`);
    expect(RECORD_PATH.startsWith("/r/")).toBe(false);
    expect(RECORD_PATH.startsWith(FIXTURES_REPO)).toBe(false);
  });

  describe("읽기·구조 실패는 처리되지 않은 예외 없이 명확히 거절된다", () => {
    const good = (): Plain => asPlain(control());
    const failures: [string, () => string | null, string][] = [
      ["파일 없음", () => null, "FILE_NOT_FOUND"],
      ["빈 파일", () => "", "INVALID_JSON"],
      ["깨진 JSON", () => '{"schema":', "INVALID_JSON"],
      ["JSON 배열", () => "[]", "NOT_AN_OBJECT"],
      [
        "지원하지 않는 스키마",
        () => JSON.stringify({ ...good(), schema: "semgrep-lsp-run/999" }),
        "SCHEMA_UNSUPPORTED",
      ],
      [
        "필수 필드 누락(inputs.pin_sha256)",
        () => {
          const r = good();
          delete r.inputs.pin_sha256;
          return JSON.stringify(r);
        },
        "inputs.pin_sha256",
      ],
      ["잘못된 타입(run_id)", () => JSON.stringify({ ...good(), run_id: 12 }), "run_id"],
      [
        "잘못된 타입(measurement.complete)",
        () => {
          const r = good();
          r.measurement.complete = "yes";
          return JSON.stringify(r);
        },
        "measurement.complete",
      ],
    ];

    it.each(failures)("%s", async (_name, content, token) => {
      const w = worldWith(content());
      const run = await expectRefused(w, await main(argvWithRecord(), w.deps));
      expect(run.control_reference).toBeNull();
      const codes = codesOfRun(run);
      expect(codes).toContain("CONTROL_REFERENCE_RECORD_REJECTED");
      expect(codes).toContain("CONTROL_REFERENCE_MISSING");
      const detail = run.measurement.reasons.find(
        (r) => r.code === "CONTROL_REFERENCE_RECORD_REJECTED"
      )?.detail;
      expect(detail).toContain(token);
      const out = stdout(w).control_record;
      expect(out).toMatchObject({ given: true, path: RECORD_PATH, accepted: false });
      expect(out.rejection).toContain(token);
    });

    it("파일은 있으나 읽기가 실패한다(EACCES)", async () => {
      const w = worldWith(canonicalJson(control()));
      const inner = w.deps.fs;
      w.deps.fs = {
        readFile: async (p) => {
          if (p === RECORD_PATH) throw new Error("EACCES: 시험용 읽기 실패");
          return inner.readFile(p);
        },
        writeFileExclusive: (p, d) => inner.writeFileExclusive(p, d),
        mkdirp: (p) => inner.mkdirp(p),
        physicalKey: (p) => inner.physicalKey(p),
        listFilesRecursive: (p) => inner.listFilesRecursive(p),
        exists: (p) => inner.exists(p),
      };
      const run = await expectRefused(w, await main(argvWithRecord(), w.deps));
      expect(run.control_reference).toBeNull();
      expect(stdout(w).control_record.rejection).toContain("READ_FAILED");
      expect(codesOfRun(run)).toContain("CONTROL_REFERENCE_RECORD_REJECTED");
    });

    it("기대 입력(data/control-expectations.json)을 읽지 못하면 기록을 수락하지 않고 명시적으로 실패한다", async () => {
      const w = worldWith(canonicalJson(control()));
      const inner = w.deps.fs;
      const expectationsPath = `${w.deps.dataDir}/control-expectations.json`;
      w.deps.fs = {
        readFile: async (p) => {
          if (p === expectationsPath) throw new Error("EACCES: 시험용 읽기 실패");
          return inner.readFile(p);
        },
        writeFileExclusive: (p, d) => inner.writeFileExclusive(p, d),
        mkdirp: (p) => inner.mkdirp(p),
        physicalKey: (p) => inner.physicalKey(p),
        listFilesRecursive: (p) => inner.listFilesRecursive(p),
        exists: (p) => inner.exists(p),
      };
      // 하네스도 같은 파일을 읽으므로 고정 입력 단계에서 하드 실패한다: 기록은 수락되지 않고 서버도 뜨지 않는다.
      expect(await main(argvWithRecord(), w.deps)).toBe(EXIT.failed);
      const out = stdout(w);
      expect(out.started).toBe(false);
      expect(out.complete).toBe(false);
      expect(out.control_record).toMatchObject({ given: true, accepted: false, run_id: null });
      expect(out.control_record.rejection).toContain("EXPECTATIONS_UNAVAILABLE(READ_FAILED)");
      expect(out.control_record.rejection).not.toContain("EACCES");
      expect(w.spawnCalls).toEqual([]);
    });
  });

  describe("참조가 될 수 없는 기록은 수락하지 않는다", () => {
    const scenarios: [string, () => unknown, string][] = [
      ["target 실행 기록", () => syntheticTargetRunRecord(), "MODE_NOT_CONTROL"],
      ["stub(SYNTHETIC) 기록", () => control({ provenance: "stub" }), "TRUST_SYNTHETIC"],
      ["불완전한 측정(TIMEOUT)", () => control({ variant: "timeout" }), "MEASUREMENT_COMPLETE"],
      ["대조 단언 실패", () => control({ variant: "assertion-fail" }), "CONTROL_ASSERTIONS_PASS"],
      ["N0 미확정", () => control({ n0Confirmed: false }), "N0_CONFIRMED"],
      ["음성 대조 전부 NOT_RUN", () => control({ negatives: "not-run" }), "NEGATIVE_ENGINE_PASS"],
      [
        "eligible:true를 위조한 NOT_RUN 기록",
        () => {
          const r = asPlain(control({ negatives: "not-run" }));
          r.reference_qualification.eligible = true;
          for (const q of r.reference_qualification.requirements) q.satisfied = true;
          return r;
        },
        "QUALIFICATION_DECLARATION_MISMATCH",
      ],
      [
        "eligible:true인데 PASS 항목의 결합이 다른 기록",
        () => {
          const r = asPlain(control());
          r.control_assertions.negative_controls[0].binding_sha256 = "f".repeat(64);
          return r;
        },
        "NEGATIVE_BINDING_MATCH",
      ],
      [
        "eligible:true인데 결합이 구성 요소와 맞지 않는 기록",
        () => {
          const r = asPlain(control());
          r.inputs.binding_sha256 = "e".repeat(64);
          return r;
        },
        "FINGERPRINTS_COMPLETE",
      ],
      // PR #29 외부 검토 발견 1: 음성 대조 PASS는 기대·관측이 현재 표(NEGATIVE_CONTROL_TABLE)와 맞아야 한다.
      [
        "음성 대조 PASS인데 엔진 항목의 observed가 null",
        () => {
          const r = asPlain(control());
          r.control_assertions.negative_controls[0].observed = null;
          return r;
        },
        "R1:engine(observed-null)",
      ],
      [
        "음성 대조 PASS인데 observed가 기대와 다름",
        () => {
          const r = asPlain(control());
          r.control_assertions.negative_controls[0].observed = "COMPLETE";
          return r;
        },
        "R1:engine(observed)",
      ],
      [
        "음성 대조 PASS인데 expected·observed가 모두 COMPLETE",
        () => {
          const r = asPlain(control());
          r.control_assertions.negative_controls[0].expected = "COMPLETE";
          r.control_assertions.negative_controls[0].observed = "COMPLETE";
          return r;
        },
        "R1:engine(expected)",
      ],
      // PR #29 외부 검토 발견 2: 세부 결과와 요약 상태가 모순이면 거절한다.
      [
        "세부 검사가 FAIL인데 요약은 PASS",
        () => {
          const r = asPlain(control());
          r.control_assertions.checks[0].status = "FAIL";
          return r;
        },
        "ASSERTION_SUMMARY_MISMATCH",
      ],
      [
        "design_errors가 있는데 요약은 PASS",
        () => {
          const r = asPlain(control());
          r.control_assertions.design_errors.push("대조 설계의 오류");
          return r;
        },
        "ASSERTION_DESIGN_ERRORS(1)",
      ],
      [
        "COMPLETE인데 reasons에 ENGINE_EXCEPTION_LOG",
        () => {
          const r = asPlain(control());
          r.measurement.reasons.push({ code: "ENGINE_EXCEPTION_LOG" });
          return r;
        },
        "MEASUREMENT_REASONS_INCONSISTENT",
      ],
      [
        "checks에 null 항목",
        () => {
          const r = asPlain(control());
          r.control_assertions.checks = [null];
          return r;
        },
        "control_assertions.checks[0](type)",
      ],
      [
        "checks가 비어 있음",
        () => {
          const r = asPlain(control());
          r.control_assertions.checks = [];
          return r;
        },
        "ASSERTION_CHECKS_EMPTY",
      ],
      // PR #29 외부 재검토: 요약은 PASS로 일관되지만 검사 목록이 기대 사례(data/control-expectations.json)와 다르다.
      [
        "검사 20개 중 첫 1개만 유지",
        () => {
          const r = asPlain(control());
          r.control_assertions.checks = r.control_assertions.checks.slice(0, 1);
          return r;
        },
        "CHECKS_MISSING(A2:cases/child-process.pos.ts",
      ],
      [
        "한 사례의 검사 전체 삭제",
        () => {
          const r = asPlain(control());
          r.control_assertions.checks = r.control_assertions.checks.filter(
            (c: Plain) => c.file !== "cases/child-process.pos.ts"
          );
          return r;
        },
        "CHECKS_MISSING(A1:cases/child-process.pos.ts, A2:cases/child-process.pos.ts",
      ],
      [
        "A4 검사 전체 삭제",
        () => {
          const r = asPlain(control());
          r.control_assertions.checks = r.control_assertions.checks.filter(
            (c: Plain) => c.kind !== "A4"
          );
          return r;
        },
        "CHECKS_MISSING(A4:cases/child-process.pos.ts, A4:cases/eval.nosource.js)",
      ],
      [
        "첫 검사만 20번 복제",
        () => {
          const r = asPlain(control());
          r.control_assertions.checks = Array.from({ length: 20 }, () => ({
            ...r.control_assertions.checks[0],
          }));
          return r;
        },
        "CHECKS_DUPLICATE(A1:cases/child-process.pos.ts)",
      ],
    ];

    it.each(scenarios)("%s", async (_name, make, token) => {
      const w = worldWith(canonicalJson(make()));
      const run = await expectRefused(w, await main(argvWithRecord(), w.deps));
      expect(run.control_reference).toBeNull();
      const codes = codesOfRun(run);
      expect(codes).toContain("CONTROL_REFERENCE_RECORD_REJECTED");
      expect(codes).toContain("CONTROL_REFERENCE_MISSING");
      expect(stdout(w).control_record.accepted).toBe(false);
      expect(stdout(w).control_record.rejection).toContain(token);
    });
  });

  describe("기록은 유효해도 현재 실행과 다르면 거절된다(기록의 지문을 현재 값으로 덮지 않는다)", () => {
    it("핀이 다른 기록", async () => {
      const record = control({}, { pin: "d".repeat(64) });
      const w = worldWith(canonicalJson(record));
      const run = await expectRefused(w, await main(argvWithRecord(), w.deps));
      expect(codesOfRun(run)).toContain("CONTROL_REFERENCE_PIN_MISMATCH");
      expect(run.control_reference?.pin_sha256).toBe("d".repeat(64)); // 기록 그대로
    });

    it("하네스 지문이 다른 기록", async () => {
      const other = sha256Hex("다른 하네스");
      const record = control({}, { harness: other });
      const w = worldWith(canonicalJson(record));
      const run = await expectRefused(w, await main(argvWithRecord(), w.deps));
      expect(codesOfRun(run)).toContain("CONTROL_REFERENCE_HARNESS_MISMATCH");
      expect(run.inputs.harness_sha256).toBe(harnessSha()); // 이번 실행의 값
      expect((run.control_reference?.fingerprints as Record<string, unknown>).harness_sha256).toBe(
        other
      );
    });

    it("대조 지문이 다른 기록(다른 예제로 만든 대조 실행)", async () => {
      const record = control({}, { control: directFingerprint("v2") });
      const w = worldWith(canonicalJson(record));
      const run = await expectRefused(w, await main(argvWithRecord(), w.deps));
      expect(codesOfRun(run)).toContain("CONTROL_REFERENCE_CONTROL_MISMATCH");
      expect(run.inputs.control_sha256).toBe(directFingerprint("v1"));
    });

    it("이번 실행의 대조 예제를 주지 않으면 대조 지문이 null이라 같은 기록도 맞출 수 없다", async () => {
      const w = worldWith(canonicalJson(control()));
      const argv = [...targetArgv(null), "--control-record", RECORD_PATH];
      const run = await expectRefused(w, await main(argv, w.deps));
      expect(run.inputs.control_sha256).toBeNull();
      expect(codesOfRun(run)).toContain("CONTROL_REFERENCE_FINGERPRINT_MISSING");
      expect(codesOfRun(run)).not.toContain("CONTROL_REFERENCE_CONTROL_MISMATCH");
    });
  });

  it("방지 장치를 통과하지 못하면 기록 파일을 읽지도 않는다(NOT_RUN, 종료 코드 3)", async () => {
    const w = makeWorld({ env: passEnv, extraFiles: { [RECORD_PATH]: canonicalJson(control()) } });
    const reads = recordReads(w);
    const argv = [...withGuard({ flag: false }), "--control-record", RECORD_PATH];
    expect(await main(argv, w.deps)).toBe(EXIT.notRun);
    expect(reads).toEqual([]);
    expect(w.portCalls).toEqual([]);
  });

  const controlArgv = (extra: string[]): string[] => [
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
    ...extra,
    FLAG,
    "--semgrep-bin",
    BIN,
  ];

  it("control 모드에서는 쓸 수 없다(control 실행은 대조 참조를 가질 수 없다): 사용법 오류 2, 포트·증거 없음", async () => {
    const w = worldWith(canonicalJson(control()));
    expect(await main(controlArgv(["--control-record", RECORD_PATH]), w.deps)).toBe(EXIT.usage);
    expect(w.err.join("")).toContain("--control-record");
    expect(w.portCalls).toEqual([]);
    expect(await w.fs.exists("/evidence")).toBe(false);
  });

  it("control 모드는 옵션 없이 기존대로 돈다(대조 기록 필드는 given:false)", async () => {
    const w = worldWith(null);
    expect(await main(controlArgv([]), w.deps)).toBe(EXIT.failed);
    expect(w.gitCalls).toEqual([]);
    expect(stdout(w).control_record).toEqual({ given: false });
    expect(w.spawnCalls).toEqual([]);
  });

  it("값이 비어 있거나 중복이면 사용법 오류다", async () => {
    const bad = [
      ["--control-record"],
      ["--control-record", ""],
      ["--control-record", "/a", "--control-record", "/b"],
    ];
    for (const extra of bad) {
      const w = worldWith(null);
      const code = await main([...targetArgv(FIXTURES_REPO), ...extra], w.deps);
      expect(code, extra.join(" ")).toBe(EXIT.usage);
      expect(w.portCalls).toEqual([]);
    }
  });

  it("도움말: 새 옵션, 기록 수락 조건, 실패 동작", async () => {
    const w = makeWorld();
    await main(["--help"], w.deps);
    const help = w.out.join("");
    expect(help).toMatch(/--control-record[^\n]*\(target\)/);
    for (const word of ["자동 탐색", "eligible", "CONTROL_REFERENCE_RECORD_REJECTED"]) {
      expect(help, word).toContain(word);
    }
  });

  it("대조 기록의 도구 버전·휠 값은 이번 실행의 관측으로 복사되지 않는다(관측하지 못하면 null로 남는다)", async () => {
    const w = worldWith(canonicalJson(control()));
    const run = await expectRefused(w, await main(argvWithRecord(), w.deps));
    // 기록(참조) 쪽에는 도구 버전·휠 값이 있다.
    expect(run.control_reference).toMatchObject({
      fingerprints: { tool_version: data.pin.semgrep.version, wheel_sha256: SYNTHETIC_WHEEL },
    });
    // 이번 실행은 관측하지 못했다 — 기록의 같은 값을 복사해 채우지 않는다. 결합도 null이다.
    expect(run.inputs.tool_version_observed).toBeNull();
    expect(run.inputs.wheel_sha256_observed).toBeNull();
    expect(run.inputs.binding_sha256).toBeNull();
    expect(codesOfRun(run)).toEqual(
      expect.arrayContaining(["TOOL_VERSION_UNVERIFIED", "WHEEL_HASH_UNVERIFIED"])
    );
  });

  it("관측한 버전이 기록과 다르면 이번 관측이 그대로 남고 거부된다(기록 값으로 덮어쓰지 않는다)", async () => {
    const w = makeWorld({
      env: passEnv,
      portProvenance: "stub",
      versionChild: versionOutput("1.179.0\n"),
      extraFiles: {
        ...fixtureFiles(FIXTURES_REPO, "v1"),
        [RECORD_PATH]: canonicalJson(control()), // 기록의 도구 버전은 data.pin.semgrep.version
      },
    });
    const run = await expectRefused(w, await main(argvWithRecord(), w.deps));
    expect(run.inputs.tool_version_observed).toBe("1.179.0");
    expect(run.inputs.tool_version_observed).not.toBe(data.pin.semgrep.version);
    expect(codesOfRun(run)).toContain("TOOL_VERSION_MISMATCH");
    expect(run.inputs.wheel_sha256_observed).toBeNull(); // --wheel-artifact를 주지 않았다
  });
});

// ── run: 공유 실행 잠금과 루프백 수신기의 생명주기 ─────────────────────

describe("main — run: 공유 실행 잠금과 루프백 수신기의 생명주기", () => {
  const passEnv = { [ENV_NAME]: "1" };

  interface RunBody {
    ok: boolean;
    started: boolean;
    complete: boolean;
    failure: { stage: string } | null;
    record: {
      measurement: { reasons: { code: string; detail: string | null }[] };
      resources: {
        run_lock: Record<string, unknown> | null;
        metrics_receiver: Record<string, unknown> | null;
      } | null;
    } | null;
    lock: {
      state: string;
      reason: string | null;
      scope: string;
      tree_key_sha256: string | null;
      path: string | null;
      evidence_marker: string;
      holder: { run_id: string; pid: number } | null;
      error_code: string | null;
      recovery: string | null;
    };
    cleanup: {
      lock: { state: string; reason: string | null; path: string | null; recovery: string | null };
      metrics_receiver: {
        closed: boolean;
        final_hits: number | null;
        hits_after_judgment: number | null;
      };
    };
    metrics_receiver_url: string | null;
  }
  const bodyOf = (w: World): RunBody => jsonOut(w) as unknown as RunBody;
  const reasonsOf = (b: RunBody) => b.record?.measurement.reasons ?? [];
  const codesOf = (b: RunBody) => reasonsOf(b).map((r) => r.code);
  const detailOf = (b: RunBody, code: string) => reasonsOf(b).find((r) => r.code === code)?.detail;

  /** 증거 폴더에 쓰인 run.json(증거로 남은 실제 레코드). */
  async function evidenceRun(w: World, dir = "/evidence/run-cli-1") {
    return JSON.parse(decoder.decode(await w.fs.readFile(`${dir}/run.json`))) as {
      resources?: {
        run_lock: Record<string, unknown> | null;
        metrics_receiver: Record<string, unknown> | null;
      };
      not_executed: Record<string, unknown>;
    };
  }

  /** RUN_ARGS에서 옵션 값을 바꾼 인자 목록. */
  function argvWith(overrides: Record<string, string>): string[] {
    const argv = withGuard({});
    for (const [flag, value] of Object.entries(overrides)) {
      const at = argv.indexOf(flag);
      if (at < 0) throw new Error(`없는 옵션: ${flag}`);
      argv[at + 1] = value;
    }
    return argv;
  }

  it("서버가 스캔하는 트리 단위로 잠금을 얻고, 증거에는 상태만 남기며, 끝나면 해제한다", async () => {
    const w = makeWorld({ env: passEnv });
    expect(await main(withGuard({}), w.deps)).toBe(EXIT.failed); // 실제 실행 전제가 비어 있어 거부된다
    const b = bodyOf(w);
    expect(b.started).toBe(false);
    expect(w.spawnCalls).toEqual([]);
    expect(b.lock).toMatchObject({
      state: "ACQUIRED",
      reason: null,
      scope: "server-tree",
      evidence_marker: "CREATED",
      holder: null,
      error_code: null,
      recovery: null,
    });
    // 잠금 파일은 트리(/scan/run-1)의 부모에 있고, 증거 폴더(/evidence/...)와 무관하다.
    expect(b.lock.path).toMatch(/^\/scan\/semgrep-lsp-tree-[0-9a-f]{32}\.lock$/);
    // 증거(run.json)에는 요약만 있다: 경로·소유자·토큰은 없다.
    const run = await evidenceRun(w);
    expect(run.resources?.run_lock).toEqual({
      scope: "server-tree",
      tree_key_sha256: b.lock.tree_key_sha256,
      state: "ACQUIRED",
      reason: null,
      evidence_marker: "CREATED",
    });
    expect(JSON.stringify(run.resources)).not.toMatch(/semgrep-lsp-tree|\/scan\/|token|pid/);
    // 정리: 해제했고 잠금 파일이 남지 않았다.
    expect(b.cleanup.lock).toEqual({ state: "RELEASED", reason: null, path: null, recovery: null });
    expect(w.lock.files.size).toBe(0);
    expect(JSON.stringify(b)).not.toMatch(/"token"/);
  });

  it("실행별 증거 표지(run.marker)와 공유 잠금은 다르다 — 표지는 증거 폴더에, 잠금은 트리의 부모에 있다", async () => {
    const w = makeWorld({ env: passEnv });
    await main(withGuard({}), w.deps);
    expect(await w.fs.exists("/evidence/run-cli-1/run.marker")).toBe(true);
    expect(await w.fs.exists("/evidence/run-cli-1/run.lock")).toBe(false);
    expect(bodyOf(w).lock.path).not.toContain("/evidence");
  });

  it("잠금을 얻어도 foreignServerProcesses는 0으로 채우지 않는다 — 계속 null이라 실행은 거부된다", async () => {
    const w = makeWorld({ env: passEnv });
    await main(withGuard({}), w.deps);
    const b = bodyOf(w);
    expect(b.lock.state).toBe("ACQUIRED");
    expect(codesOf(b)).toContain("FOREIGN_SERVER_PROCESS");
    expect(detailOf(b, "FOREIGN_SERVER_PROCESS")).toContain("확인하지 못했다");
    // 다른 실행 전제도 그대로다.
    expect(codesOf(b)).toEqual(expect.arrayContaining(["TOOL_VERSION_UNVERIFIED"]));
    expect(codesOf(b)).not.toContain("LOCK_NOT_ACQUIRED");
    expect(codesOf(b)).not.toContain("METRICS_RECEIVER_NOT_OBSERVING");
    expect(b.complete).toBe(false);
  });

  describe("같은 트리면 runId·evidenceRoot·mode가 달라도 충돌한다", () => {
    it("다른 실행이 잡은 트리는 얻지 못하고, 그 잠금은 건드리지 않으며, 거절 사유와 복구 안내를 남긴다", async () => {
      const w = makeWorld({ env: passEnv });
      const other = await acquireRunLock(w.lock, {
        treePath: "/scan/run-1",
        runId: "other-run",
        mode: "control",
      });
      if (other.state !== "ACQUIRED") throw new Error("전제");
      const before = w.lock.files.get(other.handle.lockPath);

      const argv = argvWith({ "--run-id": "run-cli-2", "--evidence-root": "/evidence-elsewhere" });
      expect(await main(argv, w.deps)).toBe(EXIT.failed);
      const b = bodyOf(w);
      expect(b.started).toBe(false);
      expect(w.spawnCalls).toEqual([]);
      expect(b.lock).toMatchObject({
        state: "REFUSED",
        reason: "HELD_BY_OTHER",
        evidence_marker: "NOT_CREATED",
        holder: { run_id: "other-run" },
      });
      expect(b.lock.recovery).toContain("직접 지운다");
      expect(codesOf(b)).toContain("LOCK_NOT_ACQUIRED");
      expect(detailOf(b, "LOCK_NOT_ACQUIRED")).toContain("HELD_BY_OTHER");
      // 증거에도 거절 상태가 남는다(경로·소유자 없이).
      const run = await evidenceRun(w, "/evidence-elsewhere/run-cli-2");
      expect(run.resources?.run_lock).toMatchObject({ state: "REFUSED", reason: "HELD_BY_OTHER" });
      expect(JSON.stringify(run.resources)).not.toContain("other-run");
      // 남의 잠금은 그대로고, 우리는 얻지 못했으니 해제할 것도 없다. 표지도 만들지 않았다.
      expect(b.cleanup.lock.state).toBe("NOT_ACQUIRED");
      expect(w.lock.files.get(other.handle.lockPath)).toBe(before);
      expect(await w.fs.exists("/evidence-elsewhere/run-cli-2/run.marker")).toBe(false);
      expect(w.lock.calls.some((c) => c.startsWith("remove:"))).toBe(false);
    });

    it("다른 실행이 끝나 잠금을 풀면 다음 실행은 얻는다", async () => {
      const w = makeWorld({ env: passEnv });
      const other = await acquireRunLock(w.lock, {
        treePath: "/scan/run-1",
        runId: "other",
        mode: "target",
      });
      if (other.state !== "ACQUIRED") throw new Error("전제");
      await main(argvWith({ "--run-id": "run-a", "--evidence-root": "/ev-a" }), w.deps);
      expect(bodyOf(w).lock.state).toBe("REFUSED");
      await releaseRunLock(w.lock, other.handle);
      w.out.length = 0;
      await main(argvWith({ "--run-id": "run-b", "--evidence-root": "/ev-b" }), w.deps);
      expect(bodyOf(w).lock.state).toBe("ACQUIRED");
      expect(w.lock.files.size).toBe(0);
    });

    it("다른 트리를 잡은 실행은 막지 않는다", async () => {
      const w = makeWorld({ env: passEnv });
      await acquireRunLock(w.lock, {
        treePath: "/scan/another-tree",
        runId: "other",
        mode: "target",
      });
      await main(withGuard({}), w.deps);
      expect(bodyOf(w).lock.state).toBe("ACQUIRED");
      expect(w.lock.files.size).toBe(1); // 남은 것은 다른 트리의 잠금뿐이다
    });

    it("control 모드의 잠금 범위는 대조 트리다(스캔 트리가 아니다)", async () => {
      const w = makeWorld({ env: passEnv });
      const argv = [
        "run",
        "--mode",
        "control",
        "--run-id",
        "run-ctl",
        "--rules-cache",
        `/cache/${SYNTHETIC_CACHE_DIR}`,
        "--evidence-root",
        "/evidence",
        "--control-fixtures-root",
        "/repo",
        "--control-tree-root",
        "/ctl/tree-1",
        FLAG,
        "--semgrep-bin",
        BIN,
      ];
      await acquireRunLock(w.lock, {
        treePath: "/scan/run-1",
        runId: "scan-holder",
        mode: "target",
      });
      await main(argv, w.deps);
      const b = bodyOf(w);
      expect(b.lock.state).toBe("ACQUIRED"); // 스캔 트리를 잡은 실행은 대조 트리를 막지 않는다
      expect(b.lock.path).toMatch(/^\/ctl\/semgrep-lsp-tree-/);
    });
  });

  describe("획득을 얻은 것으로 보정하지 않는다", () => {
    it("잠금 파일을 만들 수 없으면 ERROR이고 LOCK_NOT_ACQUIRED로 거부된다(표지도 만들지 않는다)", async () => {
      const w = makeWorld({ env: passEnv });
      w.lock.fail.create = Object.assign(new Error("EACCES: /secret/dir"), { code: "EACCES" });
      await main(withGuard({}), w.deps);
      const b = bodyOf(w);
      expect(b.lock).toMatchObject({
        state: "ERROR",
        reason: "ACQUIRE_FAILED",
        error_code: "EACCES",
      });
      expect(detailOf(b, "LOCK_NOT_ACQUIRED")).toContain("ACQUIRE_FAILED");
      expect(await w.fs.exists("/evidence/run-cli-1/run.marker")).toBe(false);
      expect(JSON.stringify(b)).not.toContain("secret");
    });

    it("트리를 해석하지 못하면 ERROR(TREE_UNRESOLVABLE)다", async () => {
      const w = makeWorld({ env: passEnv });
      w.lock.fail.resolve = new Error("해석 실패");
      await main(withGuard({}), w.deps);
      expect(bodyOf(w).lock).toMatchObject({
        state: "ERROR",
        reason: "TREE_UNRESOLVABLE",
        path: null,
      });
      expect(codesOf(bodyOf(w))).toContain("LOCK_NOT_ACQUIRED");
    });

    it("잠금은 얻었어도 증거 표지를 만들지 못하면(같은 증거 폴더 재사용) 잠금을 얻은 것으로 치지 않는다", async () => {
      const w = makeWorld({
        env: passEnv,
        extraFiles: { "/evidence/run-cli-1/run.marker": "{}\n" },
      });
      await main(withGuard({}), w.deps);
      const b = bodyOf(w);
      expect(b.lock).toMatchObject({ state: "ACQUIRED", evidence_marker: "NOT_CREATED" });
      expect(codesOf(b)).toContain("LOCK_NOT_ACQUIRED");
      expect(detailOf(b, "LOCK_NOT_ACQUIRED")).toContain("EVIDENCE_MARKER_NOT_CREATED");
      expect(b.cleanup.lock.state).toBe("RELEASED"); // 얻은 잠금은 그래도 해제한다
      expect(w.lock.files.size).toBe(0);
    });

    it("해제하지 못하면 정리 결과에 남은 잠금의 경로와 복구 안내를 싣고, 자동으로 지우려 하지 않는다", async () => {
      const w = makeWorld({ env: passEnv });
      w.lock.fail.remove = Object.assign(new Error("EPERM"), { code: "EPERM" });
      expect(await main(withGuard({}), w.deps)).toBe(EXIT.failed);
      const b = bodyOf(w);
      expect(b.cleanup.lock).toMatchObject({ state: "NOT_RELEASED", reason: "FAILED" });
      expect(b.cleanup.lock.path).toMatch(/semgrep-lsp-tree-/);
      expect(b.cleanup.lock.recovery).toContain("직접 지운다");
      expect(w.lock.files.size).toBe(1); // 남아 있다 — 운영자가 확인하고 지운다
    });
  });

  describe("정상 종료·사전 검사 거부·예외·취소 어느 경로에서도 정리한다", () => {
    it("예외로 끝나도(포트 생성 실패) 잠금을 해제하고 수신기를 닫는다", async () => {
      const w = makeWorld({ env: passEnv });
      w.deps.makeProcessPort = () => {
        throw new Error("시험: 포트 생성 실패");
      };
      expect(await main(withGuard({}), w.deps)).toBe(EXIT.failed);
      expect(w.err.join("")).toContain("포트 생성 실패");
      expect(w.lock.files.size).toBe(0);
      expect(w.receivers).toHaveLength(1);
      expect(w.receivers[0].closeCalls).toBe(1);
    });

    it("취소 신호가 이미 와 있어도 같은 정리를 한다", async () => {
      const w = makeWorld({ env: passEnv });
      w.deps.signal = AbortSignal.abort();
      await main(withGuard({}), w.deps);
      expect(w.lock.files.size).toBe(0);
      expect(w.receivers[0].closeCalls).toBe(1);
      expect(bodyOf(w).cleanup.metrics_receiver.closed).toBe(true);
    });

    it("사전 검사가 거부해도(서버를 띄우지 않음) 해제하고 닫는다", async () => {
      const w = makeWorld({ env: passEnv });
      await main(withGuard({}), w.deps);
      expect(bodyOf(w).started).toBe(false);
      expect(w.lock.files.size).toBe(0);
      expect(w.receivers[0].closeCalls).toBe(1);
    });

    it("수신기를 닫지 못해도(CLOSE_TIMEOUT) 잠금 해제는 막히지 않고, 닫지 못했다는 사실을 알린다", async () => {
      const receiver = new FakeMetricsReceiver({ hits: 0 });
      receiver.failClose = true;
      const w = makeWorld({ env: passEnv, receiver: () => receiver });
      expect(await main(withGuard({}), w.deps)).toBe(EXIT.failed);
      const b = bodyOf(w);
      expect(b.cleanup.metrics_receiver.closed).toBe(false);
      expect(b.cleanup.lock.state).toBe("RELEASED");
      expect(w.lock.files.size).toBe(0);
    });

    it("잠금을 못 얻어 거부된 실행도 수신기는 닫는다", async () => {
      const w = makeWorld({ env: passEnv });
      await acquireRunLock(w.lock, { treePath: "/scan/run-1", runId: "other", mode: "target" });
      await main(withGuard({}), w.deps);
      expect(w.receivers[0].closeCalls).toBe(1);
    });
  });

  describe("루프백 수신기는 자식 프로세스 전에 열리고, 판정 시점의 관측이 증거에 반영된다", () => {
    it("수신기를 하네스보다 먼저 열고, 열린 주소를 출력에 알린다", async () => {
      const w = makeWorld({ env: passEnv });
      const order: string[] = [];
      const original = w.deps.startMetricsReceiver;
      w.deps.startMetricsReceiver = async () => {
        order.push("receiver");
        return original();
      };
      w.deps.makeProcessPort = (provenance) => {
        order.push("process-port");
        return { provenance, spawn: () => Promise.reject(new Error("시험: 띄우지 않는다")) };
      };
      await main(withGuard({}), w.deps);
      expect(order).toEqual(["receiver", "process-port"]);
      expect(bodyOf(w).metrics_receiver_url).toBe("http://127.0.0.1:41999");
    });

    it("0건 관측: 이유 없이 통과하고 증거에 건수 0과 상태가 남는다(0은 관측 중에 센 값이다)", async () => {
      const w = makeWorld({ env: passEnv });
      await main(withGuard({}), w.deps);
      const b = bodyOf(w);
      expect(codesOf(b)).not.toContain("METRICS_RECEIVER_HIT");
      expect(codesOf(b)).not.toContain("METRICS_RECEIVER_NOT_OBSERVING");
      expect(b.record?.resources?.metrics_receiver).toMatchObject({
        bind: "127.0.0.1",
        state: "LISTENING",
        failure: null,
        hits: 0,
      });
      const run = await evidenceRun(w);
      expect(run.resources?.metrics_receiver).toMatchObject({ state: "LISTENING", hits: 0 });
      // 서버가 한 번도 돌지 않았으므로 "관측했다"고 쓰지 않는다.
      expect(run.not_executed.metrics_receiver_observation).toBe("NOT_RUN");
    });

    it("1건 이상 관측: 판정이 METRICS_RECEIVER_HIT로 남고 증거에 건수가 반영된다", async () => {
      const w = makeWorld({ env: passEnv, receiver: () => new FakeMetricsReceiver({ hits: 2 }) });
      await main(withGuard({}), w.deps);
      const b = bodyOf(w);
      expect(codesOf(b)).toContain("METRICS_RECEIVER_HIT");
      expect(detailOf(b, "METRICS_RECEIVER_HIT")).toBe("2건");
      expect(b.record?.resources?.metrics_receiver).toMatchObject({ hits: 2 });
      expect((await evidenceRun(w)).resources?.metrics_receiver).toMatchObject({ hits: 2 });
    });

    it("시작 시점의 스냅샷이 아니라 판정 시점의 관측을 쓴다 — 열린 뒤에 늘어난 건수도 반영된다", async () => {
      const w = makeWorld({ env: passEnv });
      const original = w.deps.makeProcessPort;
      // 수신기가 열린 뒤(시작 시점에는 0건), 하네스가 판정하기 전에 요청이 들어온 상황.
      w.deps.makeProcessPort = (provenance) => {
        w.receivers[0].hits = 3;
        return original(provenance);
      };
      await main(withGuard({}), w.deps);
      const b = bodyOf(w);
      expect(w.receivers[0].observeCalls).toBeGreaterThanOrEqual(1);
      expect(detailOf(b, "METRICS_RECEIVER_HIT")).toBe("3건");
      expect(b.record?.resources?.metrics_receiver).toMatchObject({ hits: 3 });
    });

    it("판정 뒤 닫기 전에 들어온 요청은 정리 결과에 따로 알린다", async () => {
      const receiver = new FakeMetricsReceiver({ hits: 0 });
      // 하네스가 판정하는 시점(닫기 전)에는 0건이고, 닫은 뒤의 마지막 관측에서 건수가 2 늘어난다. (관측 호출 횟수에 기대지 않는다 —
      // 버전 확인 앞뒤의 관측으로 호출 횟수가 바뀌어도 이 시험의 뜻은 같다.)
      receiver.onObserve = () => {
        if (receiver.closeCalls >= 1) receiver.hits = 2;
      };
      const w2 = makeWorld({ env: passEnv, receiver: () => receiver });
      await main(withGuard({}), w2.deps);
      const b = bodyOf(w2);
      expect(b.record?.resources?.metrics_receiver).toMatchObject({ hits: 0 });
      expect(b.cleanup.metrics_receiver).toMatchObject({
        closed: true,
        final_hits: 2,
        hits_after_judgment: 2,
      });
    });

    it("수신기를 열지 못하면 0건이 아니라 관측 실패다(NOT_OBSERVING, 상태 FAILED, 건수 null)", async () => {
      const w = makeWorld({
        env: passEnv,
        receiver: () =>
          new FakeMetricsReceiver({ url: null, state: "FAILED", failure: "BIND_FAILED", hits: 0 }),
      });
      await main(withGuard({}), w.deps);
      const b = bodyOf(w);
      expect(codesOf(b)).toContain("METRICS_RECEIVER_NOT_OBSERVING");
      expect(codesOf(b)).not.toContain("METRICS_RECEIVER_HIT");
      expect(b.record?.resources?.metrics_receiver).toMatchObject({
        state: "FAILED",
        failure: "BIND_FAILED",
        hits: null,
      });
      expect(b.metrics_receiver_url).toBeNull();
      expect(w.lock.files.size).toBe(0); // 잠금은 그래도 해제한다
    });

    it("수신기 시작이 던져도 같은 관측 실패로 끝나고 던지지 않는다", async () => {
      const w = makeWorld({ env: passEnv });
      w.deps.startMetricsReceiver = async () => {
        throw new Error("시험: 시작 실패");
      };
      expect(await main(withGuard({}), w.deps)).toBe(EXIT.failed);
      const b = bodyOf(w);
      expect(codesOf(b)).toContain("METRICS_RECEIVER_NOT_OBSERVING");
      expect(b.record?.resources?.metrics_receiver).toMatchObject({ state: "FAILED", hits: null });
      expect(w.lock.files.size).toBe(0);
    });

    it("관측 중 observe()가 던져도 0건으로 간주하지 않는다(OBSERVE_FAILED)", async () => {
      const receiver = new FakeMetricsReceiver({ hits: 0 });
      receiver.throwOnObserve = true;
      const w = makeWorld({ env: passEnv, receiver: () => receiver });
      await main(withGuard({}), w.deps);
      const b = bodyOf(w);
      expect(codesOf(b)).toContain("METRICS_RECEIVER_NOT_OBSERVING");
      expect(b.record?.resources?.metrics_receiver).toMatchObject({
        state: "FAILED",
        failure: "OBSERVE_FAILED",
        hits: null,
      });
    });
  });

  describe("자식 환경은 수신기의 실제 주소를 쓴다", () => {
    const getEnv = (name: string) => (name === "PATH" ? "/usr/bin" : undefined);
    it("메트릭·버전 확인·앱 URL이 모두 같은 루프백 주소다", () => {
      const env = buildChildEnv(
        { getEnv, platform: "linux" },
        "/evidence/run-x",
        "http://127.0.0.1:43210"
      );
      expect(env.SEMGREP_METRICS_URL).toBe("http://127.0.0.1:43210");
      expect(env.SEMGREP_VERSION_CHECK_URL).toBe("http://127.0.0.1:43210");
      expect(env.SEMGREP_APP_URL).toBe("http://127.0.0.1:43210");
    });

    it("수신기가 없으면 아무것도 듣지 않는 자리표시 주소를 쓴다(이때 판정은 관측 실패다)", () => {
      const env = buildChildEnv({ getEnv, platform: "linux" }, "/evidence/run-x", null);
      expect(env.SEMGREP_METRICS_URL).toBe("http://127.0.0.1:9");
    });

    it("그 밖의 환경은 그대로다: 허용 목록·증거 폴더 안의 경로뿐", () => {
      const env = buildChildEnv(
        { getEnv, platform: "linux" },
        "/evidence/run-x",
        "http://127.0.0.1:1"
      );
      expect(Object.keys(env).sort()).toEqual([
        "PATH",
        "SEMGREP_APP_URL",
        "SEMGREP_LOG_FILE",
        "SEMGREP_METRICS_URL",
        "SEMGREP_SETTINGS_FILE",
        "SEMGREP_VERSION_CACHE_PATH",
        "SEMGREP_VERSION_CHECK_URL",
      ]);
      expect(env.SEMGREP_LOG_FILE.startsWith("/evidence/run-x/")).toBe(true);
    });
  });
});

// ── run: 실제 디스크의 잠금과 실제 루프백 수신기를 CLI에 연결한 통합 ───────────

describe("main — run: 실제 잠금(디스크)과 실제 루프백 수신기", () => {
  const passEnv = { [ENV_NAME]: "1" };
  let base = "";

  async function setup(extraFiles?: Record<string, string>) {
    base = base || (await mkdtemp(join(tmpdir(), "semgrep-lsp-cli-res-")));
    const dir = await mkdtemp(join(base, "case-"));
    await mkdir(dir, { recursive: true });
    const tree = join(dir, "scan").replace(/\\/g, "/");
    const w = makeWorld({ env: passEnv, ...(extraFiles ? { extraFiles } : {}) });
    // 증거와 규칙은 메모리 파일시스템이지만, 잠금은 실제 디스크에, 수신기는 실제 루프백에 둔다.
    w.deps.runLock = createNodeRunLockPort();
    w.deps.startMetricsReceiver = () => startMetricsReceiver();
    const argv = withGuard({});
    argv[argv.indexOf("--scan-root") + 1] = tree;
    return { w, dir, tree, argv };
  }

  const bodyOf = (w: World) =>
    jsonOut(w) as unknown as {
      lock: {
        state: string;
        reason: string | null;
        path: string | null;
        holder: { run_id: string } | null;
      };
      cleanup: { lock: { state: string }; metrics_receiver: { closed: boolean } };
      metrics_receiver_url: string | null;
      record: {
        measurement: { reasons: { code: string }[] };
        resources: { metrics_receiver: Record<string, unknown> };
      } | null;
    };

  afterAll(async () => {
    if (base !== "") await rm(base, { recursive: true, force: true });
  });

  it("실제 잠금 파일을 만들었다 해제하고, 실제 수신기를 열었다 닫는다(0건 관측)", async () => {
    const { w, dir, argv } = await setup();
    expect(await main(argv, w.deps)).toBe(EXIT.failed); // 다른 실행 전제가 비어 있어 거부된다
    const b = bodyOf(w);
    expect(b.lock.state).toBe("ACQUIRED");
    expect(b.cleanup.lock.state).toBe("RELEASED");
    expect((await readdir(dir)).filter((n) => n.endsWith(".lock"))).toEqual([]); // 디스크에 남지 않았다
    // 수신기: 판정 시점에 실제 루프백에서 LISTENING·0건이었고, 끝난 뒤에는 닫혀 접속이 거부된다.
    expect(b.metrics_receiver_url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(b.record?.resources.metrics_receiver).toMatchObject({ state: "LISTENING", hits: 0 });
    expect(b.cleanup.metrics_receiver.closed).toBe(true);
    expect(await canConnectLoopback(b.metrics_receiver_url!)).toBe(false);
    const codes = b.record?.measurement.reasons.map((r) => r.code) ?? [];
    expect(codes).not.toContain("LOCK_NOT_ACQUIRED");
    expect(codes).not.toContain("METRICS_RECEIVER_NOT_OBSERVING");
    expect(codes).toContain("FOREIGN_SERVER_PROCESS"); // 아직 구현하지 않은 검사는 그대로 거부 사유다
  });

  it("다른 실행(실제 디스크의 다른 포트 인스턴스)이 같은 트리를 잡고 있으면 증거 폴더가 달라도 거절되고, 그 잠금은 그대로다", async () => {
    const { w, dir, tree, argv } = await setup();
    const other = await acquireRunLock(createNodeRunLockPort(), {
      treePath: tree,
      runId: "other-process",
      mode: "control",
    });
    if (other.state !== "ACQUIRED") throw new Error("전제");
    const before = await readFile(other.handle.lockPath, "utf8");
    argv[argv.indexOf("--evidence-root") + 1] = "/another-evidence-root";
    await main(argv, w.deps);
    const b = bodyOf(w);
    expect(b.lock).toMatchObject({
      state: "REFUSED",
      reason: "HELD_BY_OTHER",
      holder: { run_id: "other-process" },
    });
    expect(b.record?.measurement.reasons.map((r) => r.code)).toContain("LOCK_NOT_ACQUIRED");
    expect(await readFile(other.handle.lockPath, "utf8")).toBe(before);
    expect(b.cleanup.metrics_receiver.closed).toBe(true); // 거절돼도 수신기는 닫는다
    await releaseRunLock(createNodeRunLockPort(), other.handle);
    expect((await readdir(dir)).filter((n) => n.endsWith(".lock"))).toEqual([]);
  });

  // ── 잠금을 얻지 못한 실행은 서버 트리를 만들거나 바꾸지 않는다(실제 디스크의 파일 시스템) ─────────
  //
  // 위 시험들은 잠금만 실제 디스크에 두고 파일 시스템은 메모리였다 — 그래서 하네스가 스캔 트리를 (메모리에) 만들어도 보이지 않았다.
  // 여기서는 서버가 스캔하는 트리를 실제 디스크에 두고, 다른 실행의 잠금을 실제 노드 포트로 쥐게 한다.

  /** 서버가 스캔하는 트리가 있는 폴더만 실제 디스크로 보내고, 고정 입력·증거·규칙은 메모리에 둔다. */
  function onDisk(w: World, dir: string): void {
    w.deps.fs = routedFs(w.deps.fs, createNodeFs(), dir.replace(/\\/g, "/"));
  }

  async function listing(dir: string): Promise<string[]> {
    return (await readdir(dir)).sort();
  }

  /** 디렉터리(끝에 /)와 파일(바이트 해시)의 상대 경로 목록. 트리가 없으면 null. */
  async function diskDigest(root: string): Promise<Record<string, string> | null> {
    try {
      await stat(root);
    } catch {
      return null;
    }
    const out: Record<string, string> = {};
    const walk = async (rel: string): Promise<void> => {
      for (const entry of await readdir(join(root, rel), { withFileTypes: true })) {
        const path = rel === "" ? entry.name : `${rel}/${entry.name}`;
        if (entry.isDirectory()) {
          out[`${path}/`] = "dir";
          await walk(path);
        } else {
          out[path] = sha256Hex(new Uint8Array(await readFile(join(root, path))));
        }
      }
    };
    await walk("");
    return out;
  }

  /** 기대 해시와 맞는 진짜 대조 예제(.in) 바이트를 메모리 저장소 사본으로 준다(합성 텍스트는 해시가 맞지 않는다). */
  async function realFixtureFiles(root: string): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const c of cases) {
      out[`${root}/${c.fixture}`] = await readFile(
        new URL(`../../${c.fixture}`, import.meta.url),
        "utf8"
      );
    }
    return out;
  }

  const controlArgv = (dir: string): string[] => [
    "run",
    "--mode",
    "control",
    "--run-id",
    "run-ctl",
    "--rules-cache",
    `/cache/${SYNTHETIC_CACHE_DIR}`,
    "--evidence-root",
    "/evidence",
    "--control-fixtures-root",
    FIXTURES_REPO,
    "--control-tree-root",
    `${dir.replace(/\\/g, "/")}/ctl`,
    FLAG,
    "--semgrep-bin",
    BIN,
  ];

  const statusAndCodes = (w: World) => {
    const b = jsonOut(w) as {
      status: string;
      record: { measurement: { reasons: { code: string; detail?: string }[] } } | null;
    };
    return {
      status: b.status,
      reasons: b.record?.measurement.reasons ?? [],
      codes: (b.record?.measurement.reasons ?? []).map((r) => r.code),
    };
  };

  async function exists(path: string): Promise<boolean> {
    return (await diskDigest(path)) !== null;
  }

  it("target: 다른 실행이 비어 있는 스캔 트리의 잠금을 쥐고 있으면 증거 폴더가 달라도 거절되고, 스캔 트리는 만들어지지 않는다(외부 검토 재현)", async () => {
    const { w, dir, tree, argv } = await setup();
    onDisk(w, dir);
    const other = await acquireRunLock(createNodeRunLockPort(), {
      treePath: tree,
      runId: "other-process",
      mode: "control",
    });
    if (other.state !== "ACQUIRED") throw new Error("전제");
    const lockBytes = await readFile(other.handle.lockPath, "utf8");
    const before = await listing(dir); // 소유자의 잠금 파일뿐이다
    expect(before).toHaveLength(1);
    expect(await exists(tree)).toBe(false);

    argv[argv.indexOf("--evidence-root") + 1] = "/another-evidence-root";
    await main(argv, w.deps);

    const b = bodyOf(w);
    expect(b.lock).toMatchObject({ state: "REFUSED", reason: "HELD_BY_OTHER" });
    const r = statusAndCodes(w);
    expect(r.codes).toContain("LOCK_NOT_ACQUIRED");
    expect(r.codes).not.toContain("SCAN_TREE_FILE_MISSING"); // 준비하지 않은 트리를 어긋남으로 판정하지 않는다
    expect(r.status).toBe("ENV_MISMATCH");
    expect(w.spawnCalls).toEqual([]);
    // 보호 트리와 그 부모, 소유자의 잠금은 그대로다.
    expect(await exists(tree)).toBe(false);
    expect(await listing(dir)).toEqual(before);
    expect(await readFile(other.handle.lockPath, "utf8")).toBe(lockBytes);
    await releaseRunLock(createNodeRunLockPort(), other.handle);
    expect(await listing(dir)).toEqual([]);
  });

  it("target: 이미 파일이 있는 스캔 트리도 다른 실행의 잠금 아래에서는 파일 목록·바이트가 그대로다", async () => {
    const { w, dir, tree, argv } = await setup();
    onDisk(w, dir);
    for (const [path, text] of [
      ["src/a.ts", "export const a = 1;\n"],
      ["src/b.tsx", "export const b = 2;\n"],
    ]) {
      await mkdir(dirname(join(tree, path)), { recursive: true });
      await writeFile(join(tree, path), text);
    }
    const other = await acquireRunLock(createNodeRunLockPort(), {
      treePath: tree,
      runId: "other-process",
      mode: "target",
    });
    if (other.state !== "ACQUIRED") throw new Error("전제");
    const before = await diskDigest(tree);
    expect(before).not.toBeNull();

    await main(argv, w.deps);

    expect(bodyOf(w).lock).toMatchObject({ state: "REFUSED", reason: "HELD_BY_OTHER" });
    expect(statusAndCodes(w).codes).toContain("LOCK_NOT_ACQUIRED");
    expect(await diskDigest(tree)).toEqual(before);
    await releaseRunLock(createNodeRunLockPort(), other.handle);
  });

  it("control: 다른 실행이 비어 있는 대조 트리의 잠금을 쥐고 있으면 거절되고, 대조 파일 9개가 만들어지지 않는다(외부 검토 재현)", async () => {
    const { w, dir } = await setup(await realFixtureFiles(FIXTURES_REPO));
    onDisk(w, dir);
    const ctl = `${dir.replace(/\\/g, "/")}/ctl`;
    const other = await acquireRunLock(createNodeRunLockPort(), {
      treePath: ctl,
      runId: "other-process",
      mode: "control",
    });
    if (other.state !== "ACQUIRED") throw new Error("전제");
    const before = await listing(dir);

    await main(controlArgv(dir), w.deps);

    expect(bodyOf(w).lock).toMatchObject({ state: "REFUSED", reason: "HELD_BY_OTHER" });
    const r = statusAndCodes(w);
    expect(r.codes).toContain("LOCK_NOT_ACQUIRED");
    expect(r.codes).not.toContain("CONTROL_TREE_MISMATCH");
    expect(r.status).toBe("ENV_MISMATCH");
    expect(await exists(ctl)).toBe(false);
    expect(await listing(dir)).toEqual(before);
    await releaseRunLock(createNodeRunLockPort(), other.handle);
  });

  it("잠금을 얻었지만 증거 표지를 만들 수 없으면 lockHeld가 false라 트리를 만들지 않고, 자기 잠금은 해제한다", async () => {
    const { w, dir, tree, argv } = await setup();
    onDisk(w, dir);
    const disk = w.deps.fs;
    w.deps.fs = {
      ...disk,
      writeFileExclusive: (path, data) =>
        path.endsWith("/run.marker")
          ? Promise.reject(new Error("EACCES: 시험이 막았다"))
          : disk.writeFileExclusive(path, data),
    };

    await main(argv, w.deps);

    const b = bodyOf(w) as ReturnType<typeof bodyOf> & {
      lock: { evidence_marker: string };
    };
    expect(b.lock).toMatchObject({ state: "ACQUIRED", evidence_marker: "NOT_CREATED" });
    const r = statusAndCodes(w);
    expect(r.codes).toContain("LOCK_NOT_ACQUIRED");
    expect(r.reasons.find((x) => x.code === "LOCK_NOT_ACQUIRED")?.detail).toContain(
      "EVIDENCE_MARKER_NOT_CREATED"
    );
    expect(await exists(tree)).toBe(false);
    expect(b.cleanup.lock.state).toBe("RELEASED");
    expect(await listing(dir)).toEqual([]);
  });

  it("증거 폴더가 서버 트리 안에 있으면 잠금을 얻기 전에 사용법 오류로 거절하고, 트리·잠금 파일을 만들지 않는다(독립 검토 F3)", async () => {
    const { w, dir, tree, argv } = await setup();
    onDisk(w, dir);
    argv[argv.indexOf("--evidence-root") + 1] = `${tree}/ev`;
    expect(await main(argv, w.deps)).toBe(EXIT.usage);
    expect(await exists(tree)).toBe(false);
    expect(await listing(dir)).toEqual([]);
    expect(w.spawnCalls).toEqual([]);
  });

  // ── 증거 경로가 `..`·링크·상대 경로로 서버 트리 안에 돌아 들어가는 우회(외부 재검토) ──────────────
  //
  // 다른 실행이 서버 트리(`<base>/scan`)의 잠금을 쥔 채 target CLI를 돌린다. 문자열 비교는 `<base>/outside/../scan/evidence`(A)와
  // `<base>/alias/evidence`(alias → scan, B)를 놓쳐서, 잠금이 거절돼도(`REFUSED`) 증거 9개가 보호 트리 안에 써졌다. 링크는
  // Linux에서는 심볼릭 링크, Windows에서는 junction으로 만든다(이 컴퓨터는 Windows).

  async function linkOrSkip(
    ctx: { skip: () => never },
    target: string,
    path: string
  ): Promise<void> {
    try {
      await symlink(target, path, "junction"); // POSIX에서는 type 인자가 무시되고 폴더 링크가 된다
    } catch {
      ctx.skip(); // 링크를 만들 수 없는 환경: 검증하지 못한 것으로 보고한다
    }
  }

  /** 다른 실행이 잠금을 쥔 서버 트리. populated이면 트리에 파일이 미리 있다. */
  async function protectedWorld(populated: boolean) {
    const { w, dir, tree, argv } = await setup();
    onDisk(w, dir);
    if (populated) {
      await mkdir(join(tree, "src"), { recursive: true });
      await writeFile(join(tree, "src", "a.ts"), "export const a = 1;\n");
    }
    const owner = await acquireRunLock(createNodeRunLockPort(), {
      treePath: tree,
      runId: "other-process",
      mode: "control",
    });
    if (owner.state !== "ACQUIRED") throw new Error("전제");
    const snapshot = async () => ({
      tree: await diskDigest(tree),
      parent: await listing(dir),
      lock: await readFile(owner.handle.lockPath, "utf8"),
    });
    return { w, dir, tree, argv, owner, snapshot };
  }

  const withEvidence = (argv: string[], evidenceRoot: string, runId?: string): string[] => {
    const out = [...argv];
    out[out.indexOf("--evidence-root") + 1] = evidenceRoot;
    if (runId !== undefined) out[out.indexOf("--run-id") + 1] = runId;
    return out;
  };

  const OVERLAP_CASES: {
    name: string;
    populated: boolean;
    prepare?: (ctx: { skip: () => never }, dir: string, tree: string) => Promise<void>;
    evidenceRoot: (dir: string, tree: string) => string;
    runId?: (tree: string) => string;
  }[] = [
    {
      name: "존재하는 outside를 지나 `..`로 서버 트리에 돌아오는 경로(A)",
      populated: false,
      prepare: async (_ctx, dir) => void (await mkdir(`${dir}/outside`, { recursive: true })),
      evidenceRoot: (dir, tree) => `${dir}/outside/../${basename(tree)}/evidence`,
    },
    {
      name: "존재하는 outside를 지나 `..`로 돌아오는 경로(서버 트리에 파일이 있을 때)",
      populated: true,
      prepare: async (_ctx, dir) => void (await mkdir(`${dir}/outside`, { recursive: true })),
      evidenceRoot: (dir, tree) => `${dir}/outside/../${basename(tree)}/evidence`,
    },
    {
      name: "아직 없는 폴더를 지나 `..`로 돌아오는 경로",
      populated: false,
      evidenceRoot: (dir, tree) => `${dir}/nowhere/../${basename(tree)}/evidence`,
    },
    {
      name: "서버 트리를 가리키는 링크(junction) 아래의 경로(B)",
      populated: true,
      prepare: (ctx, dir, tree) => linkOrSkip(ctx, tree, `${dir}/alias`),
      evidenceRoot: (dir) => `${dir}/alias/evidence`,
    },
    {
      name: "서버 트리를 가리키는 링크 아래의 아직 없는 하위 폴더",
      populated: true,
      prepare: (ctx, dir, tree) => linkOrSkip(ctx, tree, `${dir}/alias`),
      evidenceRoot: (dir) => `${dir}/alias/a/b/c`,
    },
    {
      name: "서버 트리 안을 상대 경로로 적은 경로(절대 경로와 같은 위치)",
      populated: true,
      prepare: async (ctx, _dir, tree) => {
        if (isAbsolute(relative(process.cwd(), tree))) ctx.skip(); // 다른 드라이브라 상대 경로가 없다
      },
      evidenceRoot: (_dir, tree) => relative(process.cwd(), `${tree}/ev`),
    },
    {
      name: "아직 없는 폴더를 지나 `..`로 돌아와 서버 트리를 가리키는 링크로 들어가는 경로",
      populated: true,
      prepare: (ctx, dir, tree) => linkOrSkip(ctx, tree, `${dir}/alias`),
      evidenceRoot: (dir) => `${dir}/nowhere/../alias/evidence`,
    },
    {
      name: "증거 실행 폴더 자체가 서버 트리를 가리키는 링크인 경로",
      populated: true,
      prepare: async (ctx, dir, tree) => {
        await mkdir(`${dir}/evroot`, { recursive: true });
        await linkOrSkip(ctx, tree, `${dir}/evroot/run-cli-1`);
      },
      evidenceRoot: (dir) => `${dir}/evroot`,
    },
    {
      name: "서버 트리 안의 아직 없는 하위 폴더",
      populated: false,
      evidenceRoot: (_dir, tree) => `${tree}/x/y/z`,
    },
    {
      name: "서버 트리와 같은 위치(증거 실행 폴더가 곧 서버 트리)",
      populated: true,
      evidenceRoot: (dir) => dir,
      runId: (tree) => basename(tree),
    },
  ];

  for (const c of OVERLAP_CASES) {
    it(`증거 경로가 ${c.name}이면 run.marker·semgrep-state를 만들기 전에 사용법 오류로 거절하고 보호 트리·소유자의 잠금 파일이 그대로다`, async (ctx) => {
      const p = await protectedWorld(c.populated);
      try {
        await c.prepare?.(ctx, p.dir, p.tree);
        const before = await p.snapshot();
        const argv = withEvidence(p.argv, c.evidenceRoot(p.dir, p.tree), c.runId?.(p.tree));

        expect(await main(argv, p.w.deps)).toBe(EXIT.usage);

        // 겹침이라서 거절한 것이어야 한다 — 경로를 풀지 못해서 거절한 것이면 이 시험이 겹침 감지를 지키지 못한다.
        expect(p.w.err.join("")).toContain("같거나 그 안에");
        expect(p.w.err.join("")).not.toContain("판별하지 못했다");
        expect(p.w.spawnCalls).toEqual([]);
        expect(await p.snapshot()).toEqual(before); // 트리·부모 폴더 목록·소유자의 잠금 파일 바이트
      } finally {
        await releaseRunLock(createNodeRunLockPort(), p.owner.handle);
      }
    });
  }

  // 링크 **뒤**의 `..`는 운영체제마다 다르게 풀린다(Linux·macOS: 링크 대상의 부모, Windows: `..`를 먼저 지움). 기대값을 어느 쪽으로
  // 가정하지 않고 운영체제에게 묻는다. 사전식으로 접으면 Linux에서 틀린다.
  for (const c of [
    {
      name: "링크가 서버 트리 안쪽 폴더를 가리킬 때 `링크/../x`",
      target: (tree: string) => `${tree}/sub`,
      evidence: (dir: string) => `${dir}/l/../x`,
      leaf: "x",
    },
    {
      name: "링크가 서버 트리 바깥 폴더를 가리킬 때 `링크/../scan/ev`",
      target: (_tree: string, dir: string) => `${dir}/elsewhere/sub`,
      evidence: (dir: string) => `${dir}/l/../scan/ev`,
      leaf: "scan/ev",
    },
  ]) {
    it(`링크 뒤 \`..\`(${c.name}): 겹침 여부가 운영체제가 푼 실제 위치와 같다(Windows·Linux가 다르게 풀어도 성립)`, async (ctx) => {
      const p = await protectedWorld(true);
      try {
        const dir = p.dir.replace(/\\/g, "/");
        const target = c.target(p.tree, dir);
        await mkdir(target, { recursive: true });
        await linkOrSkip(ctx, target, `${dir}/l`);
        const actualDir = join(await realpath(`${dir}/l/..`), c.leaf); // 운영체제가 `l/..` 뒤를 푼 자리
        const rel = relative(await realpath(p.tree), actualDir);
        const expectInside = rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
        const before = await p.snapshot();
        p.w.err.length = 0;

        const code = await main(withEvidence(p.argv, c.evidence(dir)), p.w.deps);

        if (expectInside) {
          expect(code).toBe(EXIT.usage);
          expect(p.w.err.join("")).toContain("같거나 그 안에");
        } else {
          // 안이 아니면 정상 경로다: 잠금은 다른 실행이 쥐고 있어 거절되지만 증거는 운영체제가 푼 그 자리에 쓰인다.
          expect(code).toBe(EXIT.failed);
          expect(bodyOf(p.w).lock).toMatchObject({ state: "REFUSED", reason: "HELD_BY_OTHER" });
          expect((await readdir(join(actualDir, "run-cli-1"))).sort()).toContain("run.json");
        }
        const after = await p.snapshot();
        expect(after.tree).toEqual(before.tree);
        expect(after.lock).toBe(before.lock);
      } finally {
        await releaseRunLock(createNodeRunLockPort(), p.owner.handle);
      }
    });
  }

  it("증거 경로나 서버 트리 경로를 안전하게 판별할 수 없으면(끊어진 링크) 잠금·표지보다 먼저 사용법 오류로 거절하고 아무것도 만들지 않는다", async (ctx) => {
    const p = await protectedWorld(true);
    try {
      const gone = join(p.dir, "gone");
      await mkdir(gone, { recursive: true });
      await linkOrSkip(ctx, gone, join(p.dir, "dangling"));
      await rm(gone, { recursive: true }); // 링크는 남고 대상이 사라졌다
      const before = await p.snapshot();

      const dangling = `${p.dir.replace(/\\/g, "/")}/dangling`;
      const viaEvidence = withEvidence(p.argv, `${dangling}/evidence`);
      const viaTree = [...p.argv];
      viaTree[viaTree.indexOf("--scan-root") + 1] = `${dangling}/tree`;
      for (const argv of [viaEvidence, viaTree]) {
        p.w.err.length = 0;
        expect(await main(argv, p.w.deps)).toBe(EXIT.usage);
        expect(p.w.err.join("")).toContain("안전하게 판별하지 못했다");
        expect(p.w.spawnCalls).toEqual([]);
        expect(await p.snapshot()).toEqual(before);
      }
    } finally {
      await releaseRunLock(createNodeRunLockPort(), p.owner.handle);
    }
  });

  it("A·B가 아닌 정상 경우: 이름 접두만 비슷한 별도 폴더에 쓰는 증거는 기존대로 쓰이고(잠금은 거절) 보호 트리는 그대로다", async () => {
    const p = await protectedWorld(true);
    try {
      const evidenceRoot = `${p.tree}-evidence`; // `scan-evidence`: 서버 트리 `scan`과 이름 접두만 같다
      const before = (await p.snapshot()).tree;
      const lock = (await p.snapshot()).lock;

      expect(await main(withEvidence(p.argv, evidenceRoot), p.w.deps)).toBe(EXIT.failed);

      expect(bodyOf(p.w).lock).toMatchObject({ state: "REFUSED", reason: "HELD_BY_OTHER" });
      expect(statusAndCodes(p.w).codes).toContain("LOCK_NOT_ACQUIRED");
      const written = await readdir(join(evidenceRoot, "run-cli-1"));
      expect(written).toContain("run.json");
      expect(written).toHaveLength(9); // 증거 9개가 별도 폴더에 실제 디스크로 쓰였다
      expect((await p.snapshot()).tree).toEqual(before);
      expect((await p.snapshot()).lock).toBe(lock);
    } finally {
      await releaseRunLock(createNodeRunLockPort(), p.owner.handle);
    }
  });

  for (const [name, sabotage] of [
    [
      "잠금 파일을 만들지 못하면(ACQUIRE_FAILED)",
      {
        createExclusive: async (): Promise<"CREATED" | "EXISTS"> => {
          throw Object.assign(new Error("EACCES: 시험이 막았다"), { code: "EACCES" });
        },
      },
    ],
    [
      "트리 경로를 해석하지 못하면(TREE_UNRESOLVABLE)",
      {
        resolveTree: async (): Promise<never> => {
          throw Object.assign(new Error("EACCES: 시험이 막았다"), { code: "EACCES" });
        },
      },
    ],
  ] as const) {
    it(`${name} ERROR이고 서버 트리를 만들지 않는다`, async () => {
      const { w, dir, tree, argv } = await setup();
      onDisk(w, dir);
      w.deps.runLock = { ...createNodeRunLockPort(), ...sabotage };

      await main(argv, w.deps);

      expect(bodyOf(w).lock.state).toBe("ERROR");
      const r = statusAndCodes(w);
      expect(r.codes).toContain("LOCK_NOT_ACQUIRED");
      expect(r.status).toBe("ENV_MISMATCH");
      expect(await exists(tree)).toBe(false);
      expect(await listing(dir)).toEqual([]);
    });
  }

  // ── --run-id 선검증(외부 재검토) ────────────────────────────────────────────────────────────────
  //
  // 재현: --evidence-root <base>/evidence, --run-id ../escaped. 서버 트리(<base>/scan)와 증거 폴더는 겹치지 않는다. 예전에는 CLI가
  // run-id를 경로에 그대로 붙여 <base>/escaped/run.marker와 semgrep-state를 만든 뒤에야 하네스의 형식 검사가 거절했다. 이제 CLI가
  // 인자를 받은 직후, 경로를 만들거나 자원을 얻기 전에 거절한다. 여기서는 증거 루트와 서버 트리를 모두 실제 디스크에 두고 확인한다.

  /** 증거 루트 `<dir>/evidence`와 서버 트리 `<dir>/scan`을 실제 디스크에 두고, 파일 시스템·잠금 포트의 호출과 수신기 시작을 기록한다. */
  async function runIdWorld() {
    const { w, dir, tree, argv } = await setup();
    onDisk(w, dir);
    const evidenceRoot = `${dir.replace(/\\/g, "/")}/evidence`;
    const fsCalls: string[] = [];
    const lockCalls: string[] = [];
    let receiverStarts = 0;
    w.deps.fs = recorded(w.deps.fs, fsCalls, "fs");
    w.deps.runLock = recorded(w.deps.runLock, lockCalls, "lock");
    const startReceiver = w.deps.startMetricsReceiver;
    w.deps.startMetricsReceiver = () => {
      receiverStarts++;
      return startReceiver();
    };
    return {
      w,
      dir,
      tree,
      evidenceRoot,
      fsCalls,
      lockCalls,
      receiverStarts: () => receiverStarts,
      argvFor: (runId: string) => withEvidence(argv, evidenceRoot, runId),
    };
  }

  it("재현 그대로: --run-id ../escaped는 <base>/escaped에 표지·상태 폴더·잠금을 만들기 전에 사용법 오류(2)로 거절한다", async () => {
    const x = await runIdWorld();
    const escaped = join(x.dir, "escaped");
    expect(await exists(escaped)).toBe(false);

    const code = await main(x.argvFor("../escaped"), x.w.deps);

    expect(await exists(escaped)).toBe(false); // run.marker·semgrep-state가 있던 자리
    expect(await listing(x.dir)).toEqual([]); // 증거 루트·서버 트리·잠금 파일 어느 것도 없다
    expect(code).toBe(EXIT.usage);
    expect(x.w.err.join("").startsWith("--run-id는 ")).toBe(true);
  });

  for (const c of INVALID_RUN_IDS) {
    it(`--run-id ${c.name}(${JSON.stringify(c.value.slice(0, 24))})은 사용법 오류(2)이고, 실제 디스크 어디에도 아무것도 만들지 않으며 자원을 얻지 않는다`, async () => {
      const x = await runIdWorld();
      const baseBefore = await listing(base);

      expect(await main(x.argvFor(c.value), x.w.deps)).toBe(EXIT.usage);

      // 사용법 오류 첫 줄이 --run-id 오류다(뒤에 붙는 사용법 안내에 속지 않는다).
      const firstLine = x.w.err.join("").split("\n")[0];
      expect(firstLine.startsWith("--run-id는 ")).toBe(true);
      // 입력 값은 되풀이하지 않는다(짧은 값은 규칙 설명 문구의 글자와 겹치므로 4자 이상만 본다).
      if (c.value.length >= 4) expect(firstLine).not.toContain(c.value);
      expect(x.w.out).toEqual([]); // 증거 레코드도 NOT_RUN 보고도 없다
      // 실제 디스크: 증거 루트 안(<dir>/evidence), 밖(<dir>/escaped), 서버 트리·잠금 파일(<dir>/scan, *.lock), 그 위(<base>)까지.
      expect(await listing(x.dir)).toEqual([]);
      expect(await listing(base)).toEqual(baseBefore);
      // 호출 기록: 방지 장치의 실행 파일 존재 확인(exists) 하나뿐이다. 만들기·쓰기·경로 풀기·기록 읽기가 없다.
      expect(x.fsCalls).toEqual(["fs.exists"]);
      expect(x.lockCalls).toEqual([]); // 잠금 경로 해석·획득·해제 모두 없다
      expect(x.receiverStarts()).toBe(0);
      expect(x.w.portCalls).toEqual([]); // 프로세스 포트를 만들지 않았다
      expect(x.w.spawnCalls).toEqual([]);
      expect(x.w.gitCalls).toEqual([]);
    });
  }

  for (const c of [
    VALID_RUN_IDS.find((v) => v.value === "a"),
    VALID_RUN_IDS.find((v) => v.value === "a".repeat(128)),
    VALID_RUN_IDS.find((v) => v.value === "a..b"),
  ] as { name: string; value: string }[]) {
    it(`정상 값 ${c.name}은 거절하지 않는다: 증거가 <증거 루트>/<run-id>/에 실제 디스크로 쓰이고 잠금은 해제된다`, async () => {
      const x = await runIdWorld();

      expect(await main(x.argvFor(c.value), x.w.deps)).toBe(EXIT.failed); // 다른 실행 전제가 비어 있어 거부된다(사용법 오류가 아니다)

      expect(x.w.err.join("")).toBe("");
      expect(await readdir(join(x.dir, "evidence", c.value))).toContain("run.json");
      expect((await listing(x.dir)).filter((n) => n.endsWith(".lock"))).toEqual([]);
      expect(x.lockCalls.length).toBeGreaterThan(0);
      expect(x.receiverStarts()).toBe(1);
      expect(bodyOf(x.w).cleanup.lock.state).toBe("RELEASED");
    });
  }

  // ── 도구 버전 관측: 실제 디스크·실제 잠금·실제 수신기·실제 Node 프로세스(스텁) ──────────────────────
  //
  // `--semgrep-bin`으로 Node 실행 파일 자체를 준다(`node --version`은 `v24.x.y`를 찍는다). 실제 Semgrep이 아니라 무해한 Node다. 이 출력은
  // 계약(`숫자.숫자.숫자` 한 줄)과 다르므로 관측 실패여야 하고, 서버(LSP)는 시작되지 않는다. 포트는 "stub"이라 기록은 SYNTHETIC이다.
  it("실제 Node 프로세스(node --version)로 CLI → 버전 확인 → 하네스 → run.json: 형식이 계약과 다르면 관측 실패이고 서버는 시작되지 않는다", async () => {
    const { w, dir, argv } = await setup({ [process.execPath]: "placeholder in memory fs\n" });
    onDisk(w, dir);
    w.deps.makeProcessPort = () => createNodeProcessPort({ provenance: "stub" });
    w.deps.getEnv = (name) => (name === ENV_NAME ? "1" : process.env[name]);
    w.deps.platform = process.platform;
    const evidenceRoot = `${dir.replace(/\\/g, "/")}/evidence`;
    const args = withEvidence(argv, evidenceRoot);
    args[args.indexOf("--semgrep-bin") + 1] = process.execPath;

    expect(await main(args, w.deps)).toBe(EXIT.failed);

    const b = jsonOut(w) as unknown as {
      started: boolean;
      tool_observation: ToolObservationSummary;
      cleanup: {
        lock: { state: string };
        metrics_receiver: { closed: boolean };
        version_check_process: { state: string };
      };
      record: { measurement: { reasons: { code: string }[] } } | null;
    };
    expect(b.started).toBe(false);
    expect(b.tool_observation.version_check).toMatchObject({
      process_role: "version-check",
      provenance: "stub",
      status: "FAILED",
      failure: "OUTPUT_UNRECOGNIZED",
      version: null,
      args: ["--version"],
      exit: { code: 0, signal: null },
      child_process: "EXITED",
    });
    expect(b.tool_observation.version_check.stdout_bytes).toBeGreaterThan(0);
    const codes = (b.record?.measurement.reasons ?? []).map((r) => r.code);
    expect(codes).toContain("TOOL_VERSION_UNVERIFIED");

    // 실제 디스크의 run.json: 스텁 출처로 남고, 관측하지 못한 값은 null이다.
    const run = JSON.parse(await readFile(join(evidenceRoot, "run-cli-1", "run.json"), "utf8")) as {
      provenance: string;
      trust: string;
      inputs: { tool_version_observed: string | null };
      resources?: { tool_observation?: RunToolObservation };
    };
    expect(run.provenance).toBe("stub");
    expect(run.trust).toBe("SYNTHETIC");
    expect(run.inputs.tool_version_observed).toBeNull();
    expect(run.resources?.tool_observation?.version_check.failure).toBe("OUTPUT_UNRECOGNIZED");
    expect(run.resources?.tool_observation?.pin.version.comparison).toBe("NOT_OBSERVED");
    expect(JSON.stringify(run)).not.toContain(process.execPath.replace(/\\/g, "\\\\"));

    // 버전 확인 전용 상태 폴더가 증거 폴더 안에 생겼고, 잠금·수신기·자식은 정리됐다.
    expect(await exists(join(evidenceRoot, "run-cli-1", "version-check-state"))).toBe(true);
    expect(b.cleanup.lock.state).toBe("RELEASED");
    expect(b.cleanup.metrics_receiver.closed).toBe(true);
    expect(b.cleanup.version_check_process.state).toBe("EXITED");
    expect((await listing(dir)).filter((n) => n.endsWith(".lock"))).toEqual([]);
  });
});

// ── run: --run-id 선검증(메모리 파일 시스템, 포트 호출 기록) ─────────────────────────────────────

describe("main — run: --run-id 선검증", () => {
  const passEnv = { [ENV_NAME]: "1" };

  /** 호출을 기록하도록 감싼 세계. 실행 방지 장치는 통과한다. */
  function recordedWorld(env: Record<string, string> = passEnv) {
    const w = makeWorld({ env });
    const fsCalls: string[] = [];
    w.deps.fs = recorded(w.deps.fs, fsCalls, "fs");
    return { w, fsCalls };
  }

  function argvWithRunId(runId: string, form: "pair" | "equals" = "pair"): string[] {
    const argv = withGuard({});
    const at = argv.indexOf("--run-id");
    if (form === "equals") argv.splice(at, 2, `--run-id=${runId}`);
    else argv[at + 1] = runId;
    return argv;
  }

  function expectNothingAcquired(x: ReturnType<typeof recordedWorld>, label: string): void {
    const { w, fsCalls } = x;
    expect(fsCalls, label).toEqual(["fs.exists"]); // 방지 장치의 실행 파일 확인뿐 — 만들기·쓰기·경로 풀기·기록 읽기 없음
    expect(w.lock.calls, label).toEqual([]);
    expect(w.lock.files.size, label).toBe(0);
    expect(w.receivers, label).toEqual([]);
    expect(w.portCalls, label).toEqual([]);
    expect(w.spawnCalls, label).toEqual([]);
    expect(w.gitCalls, label).toEqual([]);
    expect(w.out, label).toEqual([]);
  }

  for (const c of INVALID_RUN_IDS) {
    it(`target: ${c.name}(${JSON.stringify(c.value.slice(0, 24))})은 2이고 파일 시스템·잠금·수신기·git·프로세스 포트를 쓰지 않는다`, async () => {
      const x = recordedWorld();
      const argv = argvWithRunId(c.value);
      argv.push("--control-record", "/records/control-run.json"); // 기록 읽기도 일어나지 않아야 한다

      expect(await main(argv, x.w.deps)).toBe(EXIT.usage);

      expect(x.w.err.join("").split("\n")[0].startsWith("--run-id는 ")).toBe(true);
      expectNothingAcquired(x, c.name);
      expect(await x.w.fs.exists("/evidence")).toBe(false);
    });
  }

  it("--run-id=<값> 형식도 같은 규칙으로 거절한다", async () => {
    for (const value of ["../escaped", "a/b", "..", "a".repeat(129)]) {
      const x = recordedWorld();
      expect(await main(argvWithRunId(value, "equals"), x.w.deps), value).toBe(EXIT.usage);
      expect(x.w.err.join("").split("\n")[0].startsWith("--run-id는 "), value).toBe(true);
      expectNothingAcquired(x, value);
    }
  });

  it("control 모드도 같다: 대조 트리·대조 예제 경로를 읽거나 만들기 전에 거절한다", async () => {
    for (const value of ["../escaped", "a\\b", "."]) {
      const x = recordedWorld();
      const argv = [
        "run",
        "--mode",
        "control",
        "--run-id",
        value,
        "--rules-cache",
        `/cache/${SYNTHETIC_CACHE_DIR}`,
        "--evidence-root",
        "/evidence",
        "--control-fixtures-root",
        "/fixtures",
        "--control-tree-root",
        "/ctl",
        FLAG,
        "--semgrep-bin",
        BIN,
      ];
      expect(await main(argv, x.w.deps), value).toBe(EXIT.usage);
      expect(x.w.err.join("").split("\n")[0].startsWith("--run-id는 "), value).toBe(true);
      expectNothingAcquired(x, value);
    }
  });

  it("실행 방지 장치가 먼저다: 장치를 통과하지 못하면 잘못된 --run-id여도 NOT_RUN(3)이고 어떤 포트도 만들지 않는다", async () => {
    const guardCases: {
      name: string;
      env: Record<string, string>;
      argv: (id: string) => string[];
    }[] = [
      { name: "플래그 없음", env: passEnv, argv: (id) => withGuardId(id, { flag: false }) },
      { name: "환경변수 없음", env: {}, argv: (id) => withGuardId(id, {}) },
      { name: "실행 파일 없음", env: passEnv, argv: (id) => withGuardId(id, { bin: null }) },
      { name: "셋 다 없음", env: {}, argv: (id) => withGuardId(id, { flag: false, bin: null }) },
    ];
    function withGuardId(id: string, parts: { flag?: boolean; bin?: string | null }): string[] {
      const argv = withGuard(parts);
      argv[argv.indexOf("--run-id") + 1] = id;
      return argv;
    }
    for (const g of guardCases) {
      for (const value of ["../escaped", "a".repeat(129)]) {
        const x = recordedWorld(g.env);
        const label = `${g.name} / ${value.slice(0, 12)}`;
        expect(await main(g.argv(value), x.w.deps), label).toBe(EXIT.notRun);
        expect((jsonOut(x.w) as { status: string }).status, label).toBe("NOT_RUN");
        expect(x.w.err, label).toEqual([]);
        expect(x.w.lock.calls, label).toEqual([]);
        expect(x.w.receivers, label).toEqual([]);
        expect(x.w.portCalls, label).toEqual([]);
        expect(
          x.fsCalls.filter((c) => c !== "fs.exists"),
          label
        ).toEqual([]);
      }
    }
  });

  it.each(VALID_RUN_IDS)(
    "정상 값 $name은 받아들인다: 사용법 오류가 아니고 증거가 /evidence/<run-id>/에 쓰인다",
    async ({ value }) => {
      const x = recordedWorld();
      const code = await main(argvWithRunId(value), x.w.deps);
      expect(code).toBe(EXIT.failed); // 다른 실행 전제가 비어 있어 거부된다(검증은 통과했다)
      expect(x.w.err.join("")).toBe("");
      expect(await x.w.fs.exists(`/evidence/${value}/run.json`)).toBe(true);
      expect(x.w.lock.calls.length).toBeGreaterThan(0);
    }
  );
});

// ── run: 도구 버전·휠 sha256 관측 (CLI → 관측 → 하네스 → run.json) ───────────────────────────────
//
// 이 절의 "버전 확인 자식"은 모두 시험용 스텁이다(포트 출처 "stub"): 가짜 자식, 또는 실제 Node 프로세스(`node --version`). 실제 Semgrep을
// 설치·실행하지 않는다. 그래서 이 시험의 모든 기록은 SYNTHETIC이며 실제 Semgrep 검증의 증거가 아니다.

interface ObsBody {
  ok: boolean;
  started: boolean;
  complete: boolean;
  record: {
    provenance: string;
    trust: string;
    measurement: { status: string; reasons: { code: string; detail: string | null }[] };
    resources: { tool_observation?: RunToolObservation } | null;
  } | null;
  tool_observation: ToolObservationSummary & { wheel_artifact: string | null };
  lock: { state: string; evidence_marker: string };
  cleanup: {
    lock: { state: string };
    metrics_receiver: { closed: boolean };
    version_check_process: { state: string };
  };
}

describe("main — run: 도구 버전·휠 sha256 관측", () => {
  const passEnv = { [ENV_NAME]: "1" };
  const PIN_VERSION = data.pin.semgrep.version;
  const WHEEL_PATH = "/artifacts/semgrep-1.180.0-test-only.whl";
  const WHEEL_BYTES = new TextEncoder().encode("this is test data, not a wheel\n");
  const WHEEL_SHA = createHash("sha256").update(WHEEL_BYTES).digest("hex"); // 독립 계산

  const bodyOf = (w: World): ObsBody => jsonOut(w) as unknown as ObsBody;
  const codesOf = (b: ObsBody): string[] =>
    (b.record?.measurement.reasons ?? []).map((r) => r.code);
  const runOf = async (w: World, dir = "/evidence/run-cli-1") =>
    JSON.parse(decoder.decode(await w.fs.readFile(`${dir}/run.json`))) as {
      provenance: string;
      trust: string;
      inputs: {
        tool_version_observed: string | null;
        wheel_sha256_observed: string | null;
        binding_sha256: string | null;
      };
      measurement: { reasons: { code: string }[] };
      resources?: { tool_observation?: RunToolObservation };
    };

  const argvWheel = (extra: string[] = []): string[] => [
    ...withGuard({}),
    "--wheel-artifact",
    WHEEL_PATH,
    ...extra,
  ];

  function observeWorld(
    options: Parameters<typeof makeWorld>[0] = {},
    wheel: "none" | "match" | "bytes" = "none"
  ): World {
    const w = makeWorld({ env: passEnv, portProvenance: "stub", ...options });
    if (wheel === "match") w.hasher.forcedResult = { sha256: SYNTHETIC_WHEEL, sizeBytes: 31 };
    if (wheel === "bytes") w.hasher.set(WHEEL_PATH, WHEEL_BYTES);
    return w;
  }

  describe("정상 경로", () => {
    it("버전과 휠 해시를 관측해 하네스에 넘기고, 사전 검사가 통과시키며, run.json에 핀과 따로 남긴다", async () => {
      const w = observeWorld(
        {
          versionChild: versionOutput(`${PIN_VERSION}\n`),
          extraFiles: fixtureFiles(FIXTURES_REPO, "v1"), // 대조 지문까지 채워야 결합이 null이 아니다
        },
        "match"
      );
      // 남은 전제(다른 서버 프로세스)가 있어 실행은 거부된다 — 도구 관측은 거부 사유에서 빠진다.
      expect(await main(argvWheel(["--control-fixtures-root", FIXTURES_REPO]), w.deps)).toBe(
        EXIT.failed
      );

      const b = bodyOf(w);
      expect(b.started).toBe(false); // LSP 서버는 시작되지 않았다
      expect(w.spawnCalls).toEqual([]);
      expect(codesOf(b)).toContain("FOREIGN_SERVER_PROCESS");
      expect(codesOf(b)).not.toContain("TOOL_VERSION_UNVERIFIED");
      expect(codesOf(b)).not.toContain("TOOL_VERSION_MISMATCH");
      expect(codesOf(b)).not.toContain("WHEEL_HASH_UNVERIFIED");
      expect(codesOf(b)).not.toContain("WHEEL_HASH_MISMATCH");

      // 포트는 한 번만 만들었고, 버전 확인은 실행 파일 + 인자 배열로 한 번 불렀다.
      expect(w.portCalls).toEqual(["real"]);
      expect(w.versionCalls).toHaveLength(1);
      expect(w.versionCalls[0]).toMatchObject({ command: BIN, args: ["--version"] });

      // run.json(증거로 남은 실제 레코드)
      const run = await runOf(w);
      expect(run.inputs.tool_version_observed).toBe(PIN_VERSION);
      expect(run.inputs.wheel_sha256_observed).toBe(SYNTHETIC_WHEEL);
      expect(run.inputs.binding_sha256).toMatch(/^[0-9a-f]{64}$/);
      const t = run.resources?.tool_observation;
      expect(t?.version_check).toMatchObject({
        process_role: "version-check",
        provenance: "stub",
        status: "OBSERVED",
        version: PIN_VERSION,
        args: ["--version"],
        exit: { code: 0, signal: null },
        child_process: "EXITED",
        metrics_hits_during: 0,
      });
      expect(t?.wheel_hash).toMatchObject({ status: "OBSERVED", sha256: SYNTHETIC_WHEEL });
      expect(t?.pin.version.comparison).toBe("MATCH");
      expect(t?.pin.wheel).toMatchObject({ verified: true, comparison: "MATCH" });
      expect(t?.not_established).toEqual({
        executable_provenance: "NOT_VERIFIED",
        version_output_format: "UNVERIFIED",
      });

      // 스텁 관측은 실제 Semgrep 검증으로 표시되지 않는다.
      expect(run.provenance).toBe("stub");
      expect(run.trust).toBe("SYNTHETIC");
      expect(JSON.stringify(run)).not.toContain("REAL_UNREVIEWED");

      // 경로·출력 원문은 증거에 없고, 출력(stdout)에만 아티팩트 경로가 있다.
      expect(JSON.stringify(run)).not.toContain(WHEEL_PATH);
      expect(JSON.stringify(run)).not.toContain(BIN);
      expect(b.tool_observation.wheel_artifact).toBe(WHEEL_PATH);

      // 정리: 버전 확인 자식·잠금·수신기
      expect(b.cleanup.version_check_process.state).toBe("EXITED");
      expect((w.versionChildren[0] as FakeChild).disposed).toBe(true);
      expect(b.cleanup.lock.state).toBe("RELEASED");
      expect(b.cleanup.metrics_receiver.closed).toBe(true);
    });

    it("버전 확인 자식의 환경은 LSP 서버와 같은 규칙(루프백 주소·증거 폴더 안 경로)이되 상태 폴더는 따로 쓴다", async () => {
      const w = observeWorld({ versionChild: versionOutput(`${PIN_VERSION}\n`) }, "match");
      await main(argvWheel(), w.deps);
      const spec = w.versionCalls[0];
      expect(spec.cwd).toBe("/evidence/run-cli-1/version-check-state");
      expect(spec.env.SEMGREP_METRICS_URL).toBe("http://127.0.0.1:41999");
      expect(spec.env.SEMGREP_VERSION_CHECK_URL).toBe("http://127.0.0.1:41999");
      expect(spec.env.SEMGREP_APP_URL).toBe("http://127.0.0.1:41999");
      for (const name of [
        "SEMGREP_LOG_FILE",
        "SEMGREP_SETTINGS_FILE",
        "SEMGREP_VERSION_CACHE_PATH",
      ]) {
        expect(spec.env[name], name).toMatch(/^\/evidence\/run-cli-1\/version-check-state\//);
        expect(spec.env[name], name).not.toContain("/semgrep-state/");
      }
      // 허용 목록 밖의 SEMGREP_* 나 기밀 이름이 없다.
      expect(
        Object.keys(spec.env)
          .filter((k) => k.startsWith("SEMGREP_"))
          .sort()
      ).toEqual([
        "SEMGREP_APP_URL",
        "SEMGREP_LOG_FILE",
        "SEMGREP_METRICS_URL",
        "SEMGREP_SETTINGS_FILE",
        "SEMGREP_VERSION_CACHE_PATH",
        "SEMGREP_VERSION_CHECK_URL",
      ]);
      expect(await w.fs.exists("/evidence/run-cli-1/version-check-state")).toBe(true);
    });

    it("버전 확인 중 수신기에 들어온 요청 건수가 늘어난 만큼 증거에 따로 남고, 판정은 METRICS_RECEIVER_HIT가 된다", async () => {
      const receiver = new FakeMetricsReceiver({ hits: 0 });
      const w = observeWorld(
        {
          versionChild: () => {
            receiver.hits = 2; // 버전 확인 도중 요청이 들어왔다
            return versionOutput(`${PIN_VERSION}\n`)();
          },
          receiver: () => receiver,
        },
        "match"
      );
      await main(argvWheel(), w.deps);
      const b = bodyOf(w);
      expect(b.record?.resources?.tool_observation?.version_check.metrics_hits_during).toBe(2);
      expect(codesOf(b)).toContain("METRICS_RECEIVER_HIT");
    });
  });

  describe("관측하지 못한 값은 null이고 사전 검사가 거부한다", () => {
    it("버전 출력 형식이 계약과 다르면 관측 실패다(접두가 붙은 출력)", async () => {
      const w = observeWorld(
        {
          versionChild: versionOutput(`semgrep ${PIN_VERSION}\n`),
          extraFiles: fixtureFiles(FIXTURES_REPO, "v1"),
        },
        "match"
      );
      await main(argvWheel(["--control-fixtures-root", FIXTURES_REPO]), w.deps);
      const b = bodyOf(w);
      expect(codesOf(b)).toContain("TOOL_VERSION_UNVERIFIED");
      expect(b.tool_observation.version_check).toMatchObject({
        status: "FAILED",
        failure: "OUTPUT_UNRECOGNIZED",
        version: null,
      });
      const run = await runOf(w);
      expect(run.inputs.tool_version_observed).toBeNull(); // 핀 값으로 채우지 않는다
      expect(run.inputs.binding_sha256).toBeNull();
      expect(b.started).toBe(false);
    });

    it("버전이 핀과 다르면 관측값을 그대로 남기고 TOOL_VERSION_MISMATCH로 거부한다", async () => {
      const w = observeWorld({ versionChild: versionOutput("1.179.0\n") }, "match");
      await main(argvWheel(), w.deps);
      expect(codesOf(bodyOf(w))).toContain("TOOL_VERSION_MISMATCH");
      const run = await runOf(w);
      expect(run.inputs.tool_version_observed).toBe("1.179.0");
      expect(run.resources?.tool_observation?.pin.version).toEqual({
        expected: PIN_VERSION,
        observed: "1.179.0",
        comparison: "MISMATCH",
      });
    });

    it("비정상 종료(종료 코드 ≠ 0)는 stdout이 정상처럼 보여도 관측 실패다", async () => {
      const w = observeWorld({ versionChild: versionOutput(`${PIN_VERSION}\n`, 3) }, "match");
      await main(argvWheel(), w.deps);
      expect(bodyOf(w).tool_observation.version_check).toMatchObject({
        status: "FAILED",
        failure: "NONZERO_EXIT",
        version: null,
      });
      expect((await runOf(w)).inputs.tool_version_observed).toBeNull();
    });

    it("실행 파일을 띄우지 못하면 관측 실패다(SPAWN_FAILED) — 서버도 시작하지 않는다", async () => {
      const w = observeWorld({}, "match"); // versionChild 없음 = 띄우지 못한다
      await main(argvWheel(), w.deps);
      const b = bodyOf(w);
      expect(b.tool_observation.version_check).toMatchObject({
        status: "FAILED",
        failure: "SPAWN_FAILED",
        child_process: "NOT_SPAWNED",
      });
      expect(codesOf(b)).toContain("TOOL_VERSION_UNVERIFIED");
      expect(w.spawnCalls).toEqual([]);
    });

    it("휠 경로를 주지 않으면 휠 해시를 관측하지 않는다(읽기 없음)", async () => {
      const w = observeWorld({ versionChild: versionOutput(`${PIN_VERSION}\n`) });
      await main(withGuard({}), w.deps);
      const b = bodyOf(w);
      expect(b.tool_observation.wheel_hash).toMatchObject({
        status: "NOT_ATTEMPTED",
        failure: "ARTIFACT_NOT_GIVEN",
        sha256: null,
      });
      expect(b.tool_observation.wheel_artifact).toBeNull();
      expect(w.hasher.calls).toEqual([]);
      expect(codesOf(b)).toContain("WHEEL_HASH_UNVERIFIED");
      expect((await runOf(w)).inputs.wheel_sha256_observed).toBeNull();
    });

    it("휠 파일을 읽지 못하면 관측 실패이고 성공값으로 보정하지 않는다", async () => {
      const w = observeWorld({ versionChild: versionOutput(`${PIN_VERSION}\n`) }); // 해시 포트에 파일이 없다
      await main(argvWheel(), w.deps);
      const b = bodyOf(w);
      expect(b.tool_observation.wheel_hash).toMatchObject({
        status: "FAILED",
        failure: "NOT_FOUND",
        sha256: null,
      });
      expect(codesOf(b)).toContain("WHEEL_HASH_UNVERIFIED");
      expect((await runOf(w)).inputs.wheel_sha256_observed).toBeNull();
    });

    it("실제 바이트의 해시가 핀과 다르면 WHEEL_HASH_MISMATCH이고 관측값은 독립 계산값과 같다", async () => {
      const w = observeWorld({ versionChild: versionOutput(`${PIN_VERSION}\n`) }, "bytes");
      await main(argvWheel(), w.deps);
      const b = bodyOf(w);
      expect(codesOf(b)).toContain("WHEEL_HASH_MISMATCH");
      const run = await runOf(w);
      expect(run.inputs.wheel_sha256_observed).toBe(WHEEL_SHA);
      expect(run.resources?.tool_observation?.pin.wheel).toMatchObject({
        observed: WHEEL_SHA,
        comparison: "MISMATCH",
      });
    });

    it("파일이 바뀌면 관측 해시도 바뀐다", async () => {
      const hashes: (string | null)[] = [];
      for (const text of ["wheel-v1", "wheel-v2"]) {
        const w = observeWorld({ versionChild: versionOutput(`${PIN_VERSION}\n`) });
        w.hasher.set(WHEEL_PATH, text);
        await main(argvWheel(), w.deps);
        hashes.push((await runOf(w)).inputs.wheel_sha256_observed);
      }
      expect(hashes[0]).toBe(createHash("sha256").update("wheel-v1").digest("hex"));
      expect(hashes[1]).toBe(createHash("sha256").update("wheel-v2").digest("hex"));
      expect(hashes[0]).not.toBe(hashes[1]);
    });

    it("핀의 휠 해시가 확인되지 않았으면(실제 pin.json과 같다) 해시를 관측해도 거부되고 핀은 바뀌지 않는다", async () => {
      const unverified = JSON.parse(JSON.stringify(data.pin)) as typeof data.pin;
      unverified.semgrep.wheel.sha256 = null;
      unverified.semgrep.wheel.verified = false;
      const pinPath = `${HARNESS_ROOT}/data/pin.json`;
      const text = JSON.stringify(unverified, null, 2);
      const w = observeWorld(
        { versionChild: versionOutput(`${PIN_VERSION}\n`), extraFiles: { [pinPath]: text } },
        "bytes"
      );
      await main(argvWheel(), w.deps);
      const b = bodyOf(w);
      expect(codesOf(b)).toContain("WHEEL_HASH_UNVERIFIED");
      expect(codesOf(b)).not.toContain("WHEEL_HASH_MISMATCH");
      const run = await runOf(w);
      expect(run.inputs.wheel_sha256_observed).toBe(WHEEL_SHA); // 관측값은 남는다
      expect(run.resources?.tool_observation?.pin.wheel).toEqual({
        expected_sha256: null,
        verified: false,
        observed: WHEEL_SHA,
        comparison: "PIN_UNVERIFIED",
      });
      expect(decoder.decode(await w.fs.readFile(pinPath))).toBe(text); // pin.json 그대로
    });
  });

  describe("순서와 계약", () => {
    it("잠금을 얻지 못한 실행은 아무것도 시작하지 않는다: 버전 확인·휠 읽기 모두 없다", async () => {
      const w = observeWorld({ versionChild: versionOutput(`${PIN_VERSION}\n`) }, "bytes");
      await acquireRunLock(w.lock, { treePath: "/scan/run-1", runId: "other", mode: "target" });
      await main(argvWheel(), w.deps);
      const b = bodyOf(w);
      expect(b.lock.state).toBe("REFUSED");
      expect(w.versionCalls).toEqual([]);
      expect(w.hasher.calls).toEqual([]);
      expect(b.tool_observation.version_check).toMatchObject({
        status: "NOT_ATTEMPTED",
        failure: "LOCK_NOT_HELD",
        provenance: null,
      });
      expect(b.tool_observation.wheel_hash).toMatchObject({ status: "NOT_ATTEMPTED" });
      expect(codesOf(b)).toEqual(
        expect.arrayContaining([
          "LOCK_NOT_ACQUIRED",
          "TOOL_VERSION_UNVERIFIED",
          "WHEEL_HASH_UNVERIFIED",
        ])
      );
      expect(w.spawnCalls).toEqual([]);
    });

    it("실행 방지 장치가 먼저다: 장치를 통과하지 못하면 NOT_RUN이고 버전 확인·휠 읽기·포트가 없다", async () => {
      for (const argv of [
        [...withGuard({ flag: false }), "--wheel-artifact", WHEEL_PATH],
        [...withGuard({ bin: null }), "--wheel-artifact", WHEEL_PATH],
      ]) {
        const w = observeWorld({ versionChild: versionOutput(`${PIN_VERSION}\n`) }, "bytes");
        expect(await main(argv, w.deps)).toBe(EXIT.notRun);
        expect(w.portCalls).toEqual([]);
        expect(w.versionCalls).toEqual([]);
        expect(w.hasher.calls).toEqual([]);
      }
      const noEnv = observeWorld(
        { env: {}, versionChild: versionOutput(`${PIN_VERSION}\n`) },
        "bytes"
      );
      expect(await main(argvWheel(), noEnv.deps)).toBe(EXIT.notRun);
      expect(noEnv.versionCalls).toEqual([]);
      expect(noEnv.hasher.calls).toEqual([]);
    });

    it("run-id 검증이 먼저다: 잘못된 --run-id는 사용법 오류이고 아무것도 시작하지 않는다", async () => {
      const w = observeWorld({ versionChild: versionOutput(`${PIN_VERSION}\n`) }, "bytes");
      const argv = argvWheel();
      argv[argv.indexOf("--run-id") + 1] = "../escaped";
      expect(await main(argv, w.deps)).toBe(EXIT.usage);
      expect(w.err.join("").split("\n")[0].startsWith("--run-id는 ")).toBe(true);
      expect(w.portCalls).toEqual([]);
      expect(w.versionCalls).toEqual([]);
      expect(w.hasher.calls).toEqual([]);
      expect(w.lock.calls).toEqual([]);
    });

    it("--wheel-artifact는 절대 경로 하나만 받는다: 상대 경로·중복·빈 값은 사용법 오류이고 아무것도 시작하지 않는다", async () => {
      for (const extra of [
        ["--wheel-artifact", "relative/semgrep.whl"],
        ["--wheel-artifact", "semgrep.whl"],
        ["--wheel-artifact", "./semgrep.whl"],
        ["--wheel-artifact", WHEEL_PATH, "--wheel-artifact", WHEEL_PATH],
        ["--wheel-artifact"],
        ["--wheel-artifact", ""],
      ]) {
        const w = observeWorld({ versionChild: versionOutput(`${PIN_VERSION}\n`) }, "bytes");
        expect(await main([...withGuard({}), ...extra], w.deps), extra.join(" ")).toBe(EXIT.usage);
        expect(w.portCalls).toEqual([]);
        expect(w.versionCalls).toEqual([]);
        expect(w.hasher.calls).toEqual([]);
        expect(w.lock.files.size).toBe(0);
      }
    });

    it("기본 경로·자동 탐색이 없다: --wheel-artifact 없이는 어떤 경로도 읽지 않는다", async () => {
      const w = observeWorld({ versionChild: versionOutput(`${PIN_VERSION}\n`) }, "bytes");
      await main(withGuard({}), w.deps);
      expect(w.hasher.calls).toEqual([]);
    });

    it("도움말에 새 옵션과 관측 계약(절대 경로·--version 인자 배열·stdout 한 줄·바이트 해시 ≠ 설치 출처)이 있다", async () => {
      const w = makeWorld();
      await main(["--help"], w.deps);
      const help = w.out.join("");
      expect(help).toMatch(/--wheel-artifact <절대 경로>/);
      for (const word of [
        "도구 관측",
        '["--version"]',
        "stdout",
        "설치",
        "관측 실패",
        "pin.json",
      ]) {
        expect(help, word).toContain(word);
      }
    });

    it("run 출력의 '아직 확인하지 못한 것' 목록이 관측 범위를 정직하게 말한다", async () => {
      const w = observeWorld({ versionChild: versionOutput(`${PIN_VERSION}\n`) }, "match");
      await main(argvWheel(), w.deps);
      const notes = (jsonOut(w).not_implemented_or_not_verified as string[]).join("\n");
      expect(notes).toContain("해석 계약은 실제 Semgrep으로 확인하지 않았다");
      expect(notes).toContain("설치 출처");
      expect(notes).toContain("foreignServerProcesses=null");
      expect(notes).not.toContain("구현하지 않았다 — toolVersionObserved=null"); // 낡은 문구가 남아 있지 않다
    });
  });

  // ── 일반 파일이 아닌 휠 입력(FIFO): 열기가 막히지 않고, 거절 뒤에 잠금·수신기가 정리된다 ─────────────────────
  //
  // PR #32 외부 검토에서 재현된 결함: --wheel-artifact가 쓰기 쪽 없는 FIFO이면 해시 어댑터의 open이 운영체제 안에서 대기해, AbortSignal을
  // 취소해도 CLI가 끝나지 않고 공유 잠금과 루프백 수신기가 유지됐다. 여기서는 실제 디스크 잠금과 실제 루프백 수신기를 쓰고(증거·규칙은
  // 메모리), 실제 해시 어댑터를 통과해 CLI 전체가 시간 한도 안에 거절·정리까지 끝나는지 본다.
  // 한도는 시험 쪽 장치다(제품 코드의 대기를 끊는 것이 아니다). 한도가 지나면 매달린 열기를 풀어, 실패하는 구현도 시험 프로세스에
  // 잠금·수신기·열기 작업을 남기지 않게 한다.
  describe("일반 파일이 아닌 휠 입력(FIFO) — 열기가 막히지 않고 거절·정리까지 끝난다", () => {
    let base = "";
    afterAll(async () => {
      if (base !== "") await rm(base, { recursive: true, force: true });
    });

    /** work가 ms 안에 끝나면 true(성공·실패는 묻지 않는다), 아니면 false. */
    async function settledWithin(work: Promise<unknown>, ms: number): Promise<boolean> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), ms);
      });
      try {
        return await Promise.race([
          work.then(
            () => true,
            () => true
          ),
          timeout,
        ]);
      } finally {
        clearTimeout(timer);
      }
    }

    const linuxHasher = (emu: PosixOpenEmulator): ArtifactHashPort =>
      createNodeArtifactHasher({
        open: emu.open,
        openFlags: readOnlyOpenFlags(LINUX_OPEN_CONSTANTS, "linux"),
      });

    async function setup(wheelPath: string, hasher: ArtifactHashPort) {
      base ||= await mkdtemp(join(tmpdir(), "semgrep-lsp-cli-fifo-"));
      const dir = await mkdtemp(join(base, "case-"));
      const tree = join(dir, "scan").replace(/\\/g, "/");
      const w = observeWorld({ versionChild: versionOutput(`${PIN_VERSION}\n`) });
      w.deps.runLock = createNodeRunLockPort(); // 실제 디스크 잠금
      w.deps.startMetricsReceiver = () => startMetricsReceiver(); // 실제 루프백 수신기
      w.deps.hashArtifact = hasher; // 실제 해시 어댑터(열기만 에뮬레이트하거나 실제 파일을 연다)
      const argv = argvWheel();
      argv[argv.indexOf("--scan-root") + 1] = tree;
      argv[argv.indexOf("--wheel-artifact") + 1] = wheelPath;
      return { w, dir, argv };
    }

    /**
     * CLI를 시간 한도 안에서 돌린다. 한도 안에 끝나지 않으면 hung=true다. 어느 경우든 마지막에 release로 매달린 열기를 풀고 main이
     * 끝날 때까지 기다린다 — 그래서 실패하는 구현이어도 잠금·수신기·열기 작업이 시험 뒤에 남지 않는다.
     */
    async function runBounded(
      w: World,
      argv: string[],
      release: () => void | Promise<void>,
      ms = 5000
    ): Promise<{ hung: boolean; code: number | null }> {
      const pending = main(argv, w.deps);
      const done = settledWithin(pending, ms);
      const hung = !(await done);
      if (hung) {
        for (let i = 0; i < 20; i++) {
          await release();
          if (await settledWithin(pending, 100)) break;
        }
        await settledWithin(pending, 3000);
      }
      const code = hung ? null : await pending;
      return { hung, code };
    }

    /** 거절·정리가 끝난 뒤의 공통 사실. 휠 해시는 없고, 잠금 파일·수신기·버전 확인 자식이 남지 않는다. */
    async function expectRejectedAndCleaned(
      w: World,
      dir: string,
      failures: string[]
    ): Promise<ObsBody> {
      const b = bodyOf(w);
      expect(b.tool_observation.wheel_hash).toMatchObject({
        status: "FAILED",
        sha256: null,
        size_bytes: null,
      });
      expect(failures).toContain(b.tool_observation.wheel_hash.failure);
      const run = await runOf(w);
      expect(run.inputs.wheel_sha256_observed).toBeNull(); // 성공 해시 없음 — 핀 값으로 채우지 않는다
      expect(codesOf(b)).toContain("WHEEL_HASH_UNVERIFIED");
      expect(b.started).toBe(false); // LSP 서버는 시작되지 않았다
      expect(w.spawnCalls).toEqual([]);
      // 정리
      expect(b.cleanup.lock.state).toBe("RELEASED");
      expect(b.cleanup.metrics_receiver.closed).toBe(true);
      expect(b.cleanup.version_check_process.state).toBe("EXITED");
      expect((await readdir(dir)).filter((n) => n.endsWith(".lock"))).toEqual([]);
      const url = (jsonOut(w) as unknown as { metrics_receiver_url: string | null })
        .metrics_receiver_url;
      expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(await canConnectLoopback(url!)).toBe(false);
      return b;
    }

    it("쓰기 쪽이 없는 FIFO: CLI가 한도 안에 NOT_A_FILE로 거절하고 잠금·수신기·핸들을 남기지 않는다(에뮬레이트한 POSIX 열기)", async () => {
      const emu = new PosixOpenEmulator({ "/artifacts/fifo.whl": { kind: "fifo" } });
      const { w, dir, argv } = await setup("/artifacts/fifo.whl", linuxHasher(emu));
      const r = await runBounded(w, argv, () => emu.releasePending());
      expect(r.hung, "FIFO 열기에서 CLI가 매달렸다(쓰기 쪽을 아무도 열지 않았다)").toBe(false);
      expect(r.code).toBe(EXIT.failed);
      await expectRejectedAndCleaned(w, dir, ["NOT_A_FILE"]);
      expect(emu.pendingOpens()).toBe(0);
      expect(emu.openHandles()).toBe(0);
      expect(emu.readCalls).toBe(0);
      expect(emu.writeAttempts).toBe(0);
    });

    it("FIFO를 가리키는 링크도 같다(에뮬레이트한 POSIX 열기)", async () => {
      const emu = new PosixOpenEmulator({
        "/artifacts/fifo.whl": { kind: "fifo" },
        "/artifacts/link.whl": { kind: "symlink", target: "/artifacts/fifo.whl" },
      });
      const { w, dir, argv } = await setup("/artifacts/link.whl", linuxHasher(emu));
      const r = await runBounded(w, argv, () => emu.releasePending());
      expect(r.hung, "링크를 따라 FIFO를 열다가 CLI가 매달렸다").toBe(false);
      expect(r.code).toBe(EXIT.failed);
      await expectRejectedAndCleaned(w, dir, ["NOT_A_FILE"]);
      expect(emu.opens[0].resolvedKind).toBe("fifo");
      expect(emu.openHandles()).toBe(0);
    });

    it("진행 중 취소(리뷰가 재현한 시나리오): FIFO를 여는 순간 신호를 취소해도 CLI가 끝나고 잠금·수신기가 정리된다", async () => {
      const emu = new PosixOpenEmulator({ "/artifacts/fifo.whl": { kind: "fifo" } });
      const { w, dir, argv } = await setup("/artifacts/fifo.whl", linuxHasher(emu));
      const controller = new AbortController();
      w.deps.signal = controller.signal;
      const pending = main(argv, w.deps);
      try {
        for (let i = 0; i < 400 && emu.opens.length === 0; i++) {
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        expect(emu.opens.length, "휠 열기 단계에 이르지 못했다").toBe(1);
        controller.abort(); // 열기가 진행 중인 바로 그 순간에 취소한다 — 외부에서 FIFO 쓰기 쪽을 열어 주지 않는다
        expect(await settledWithin(pending, 5000), "취소했는데 CLI가 끝나지 않는다").toBe(true);
        expect(await pending).toBe(EXIT.failed);
        await expectRejectedAndCleaned(w, dir, ["NOT_A_FILE", "CANCELLED"]);
        expect(emu.pendingOpens()).toBe(0);
        expect(emu.openHandles()).toBe(0);
      } finally {
        emu.releasePending(); // 실패하는 구현이 남긴 대기가 있다면 풀어 main이 끝나게 한다
        await settledWithin(pending, 3000);
      }
    });

    it("진행 중 취소: 읽는 도중 신호를 취소하면 CLI가 끝나고 CANCELLED로 남기며 잠금·수신기를 정리한다", async () => {
      const emu = new PosixOpenEmulator({
        "/artifacts/big.whl": { kind: "file", data: new Uint8Array(3 * 1024 * 1024 + 5).fill(3) },
      });
      let openGate!: () => void;
      const gate = new Promise<void>((resolve) => (openGate = resolve));
      let first = true;
      emu.beforeRead = async () => {
        if (first) {
          first = false;
          await gate; // 첫 조각을 읽는 중에 멈춘다
        }
      };
      const { w, dir, argv } = await setup("/artifacts/big.whl", linuxHasher(emu));
      const controller = new AbortController();
      w.deps.signal = controller.signal;
      const pending = main(argv, w.deps);
      try {
        for (let i = 0; i < 400 && emu.readCalls === 0; i++) {
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        expect(emu.readCalls, "휠을 읽는 단계에 이르지 못했다").toBe(1);
        controller.abort();
        openGate();
        expect(await settledWithin(pending, 5000), "취소했는데 CLI가 끝나지 않는다").toBe(true);
        expect(await pending).toBe(EXIT.failed);
        await expectRejectedAndCleaned(w, dir, ["CANCELLED"]);
        expect(emu.readCalls).toBe(1); // 취소 뒤에는 더 읽지 않았다
        expect(emu.openHandles()).toBe(0);
      } finally {
        openGate();
        emu.releasePending();
        await settledWithin(pending, 3000);
      }
    });

    it("일반 파일은 그대로 읽는다: 실제 파일의 해시가 독립 계산값과 같고 run.json에 남으며 정리된다(실제 어댑터·실제 파일)", async () => {
      base ||= await mkdtemp(join(tmpdir(), "semgrep-lsp-cli-fifo-"));
      const wheel = join(base, "real-regular.whl");
      await writeFile(wheel, WHEEL_BYTES);
      const { w, dir, argv } = await setup(wheel, createNodeArtifactHasher());
      const r = await runBounded(w, argv, () => {});
      expect(r.hung).toBe(false);
      expect(r.code).toBe(EXIT.failed); // 다른 전제(다른 서버 프로세스)가 비어 있어 실행은 거부된다 — 해시는 그와 별개다
      const b = bodyOf(w);
      expect(b.tool_observation.wheel_hash).toMatchObject({
        status: "OBSERVED",
        sha256: WHEEL_SHA,
        size_bytes: WHEEL_BYTES.length,
      });
      const run = await runOf(w);
      expect(run.inputs.wheel_sha256_observed).toBe(WHEEL_SHA);
      // 실제 바이트의 해시가 합성 핀과 다르므로 비교 결과는 MISMATCH다(해시가 핀 값으로 채워지지 않았다는 뜻이다).
      expect(run.resources?.tool_observation?.pin.wheel).toMatchObject({
        observed: WHEEL_SHA,
        comparison: "MISMATCH",
      });
      expect(b.cleanup.lock.state).toBe("RELEASED");
      expect(b.cleanup.metrics_receiver.closed).toBe(true);
      expect((await readdir(dir)).filter((n) => n.endsWith(".lock"))).toEqual([]);
      expect(new Uint8Array(await readFile(wheel))).toEqual(WHEEL_BYTES); // 읽기만 했다
    });

    // 아래 두 시험은 실제 FIFO를 쓴다 — POSIX 전용이며 Windows에서는 건너뛴다. 개발 PC(Windows 11)에서는 돌리지 못했다.
    // Linux/macOS에서 확인이 필요하다.
    describe.skipIf(process.platform === "win32")("실제 POSIX FIFO", () => {
      const randomHex = (): string => randomBytes(4).toString("hex");

      async function makeFifo(dir: string, name: string): Promise<string> {
        const path = join(dir, name);
        const child = await createNodeProcessPort({ provenance: "stub" }).spawn({
          command: "mkfifo",
          args: [path],
          cwd: dir,
          env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
        });
        const exit = await child.exited;
        await child.dispose();
        if (exit.code !== 0)
          throw new Error(`시험 준비 실패: mkfifo가 종료 코드 ${exit.code}로 끝났다`);
        return path;
      }

      /** 매달린 읽기 열기가 있다면 쓰기 쪽을 비차단으로 열었다 닫아 풀어 준다(기다리는 읽기 쪽이 없으면 ENXIO — 정상). */
      async function releaseBlockedOpen(fifoPath: string): Promise<void> {
        try {
          const writer = await openFile(fifoPath, fsConstants.O_WRONLY | fsConstants.O_NONBLOCK);
          await writer.close();
        } catch {
          /* ENXIO */
        }
      }

      it("쓰기 쪽이 없는 FIFO: CLI가 한도 안에 NOT_A_FILE로 거절하고 잠금·수신기를 정리한다(외부에서 쓰기 쪽을 열어 주지 않는다)", async () => {
        base ||= await mkdtemp(join(tmpdir(), "semgrep-lsp-cli-fifo-"));
        const fifo = await makeFifo(base, `cli-${randomHex()}.fifo`);
        const { w, dir, argv } = await setup(fifo, createNodeArtifactHasher());
        const r = await runBounded(w, argv, () => releaseBlockedOpen(fifo));
        expect(r.hung, "실제 FIFO 열기에서 CLI가 매달렸다").toBe(false);
        expect(r.code).toBe(EXIT.failed);
        await expectRejectedAndCleaned(w, dir, ["NOT_A_FILE"]);
      });

      it("FIFO를 가리키는 심볼릭 링크도 같다", async () => {
        base ||= await mkdtemp(join(tmpdir(), "semgrep-lsp-cli-fifo-"));
        const fifo = await makeFifo(base, `cli-target-${randomHex()}.fifo`);
        const link = join(base, `cli-link-${randomHex()}.whl`);
        await symlink(fifo, link);
        const { w, dir, argv } = await setup(link, createNodeArtifactHasher());
        const r = await runBounded(w, argv, () => releaseBlockedOpen(fifo));
        expect(r.hung, "링크를 따라 실제 FIFO를 열다가 CLI가 매달렸다").toBe(false);
        expect(r.code).toBe(EXIT.failed);
        await expectRejectedAndCleaned(w, dir, ["NOT_A_FILE"]);
      });
    });
  });

  describe("시간 초과·취소·정리 실패 (가상 시계)", () => {
    const silent = (): FakeChild => new FakeChild();

    it("시간 초과: 멈춘 버전 확인을 끝내고 TIMEOUT으로 남기며 잠금·수신기를 정리한다", async () => {
      const w = observeWorld({ versionChild: silent }, "match");
      const clock = w.deps.clock as VirtualClock;
      const code = await drive(clock, main(argvWheel(), w.deps));
      expect(code).toBe(EXIT.failed);
      const b = bodyOf(w);
      expect(b.tool_observation.version_check).toMatchObject({
        status: "FAILED",
        failure: "TIMEOUT",
        child_process: "KILLED",
      });
      const child = w.versionChildren[0] as FakeChild;
      expect(child.killCalls).toEqual(["SIGKILL"]);
      expect(child.disposed).toBe(true);
      expect(b.cleanup.version_check_process.state).toBe("KILLED");
      expect(b.cleanup.lock.state).toBe("RELEASED");
      expect(b.cleanup.metrics_receiver.closed).toBe(true);
      expect(w.lock.files.size).toBe(0);
      expect(codesOf(b)).toContain("TOOL_VERSION_UNVERIFIED");
      expect(w.spawnCalls).toEqual([]);
    });

    it("실행 중 취소: 버전 확인 자식을 끝내고, 이어지는 하네스는 서버를 띄우지 않으며, 잠금·수신기를 정리한다", async () => {
      const w = observeWorld({ versionChild: silent }, "match");
      const clock = w.deps.clock as VirtualClock;
      const controller = new AbortController();
      w.deps.signal = controller.signal;
      const pending = main(argvWheel(), w.deps);
      for (let i = 0; i < 200 && w.versionCalls.length === 0; i++) await clock.flush();
      expect(w.versionCalls).toHaveLength(1); // 버전 확인이 돌고 있다
      controller.abort();
      const code = await drive(clock, pending);

      expect(code).toBe(EXIT.failed);
      const b = bodyOf(w);
      expect(b.tool_observation.version_check).toMatchObject({
        status: "FAILED",
        failure: "CANCELLED",
        child_process: "KILLED",
      });
      const child = w.versionChildren[0] as FakeChild;
      expect(child.killCalls).toEqual(["SIGKILL"]);
      expect(child.disposed).toBe(true);
      expect(b.started).toBe(false);
      expect(w.spawnCalls).toEqual([]);
      expect(b.cleanup.lock.state).toBe("RELEASED");
      expect(b.cleanup.metrics_receiver.closed).toBe(true);
      expect(w.lock.files.size).toBe(0);
      expect(w.receivers[0].closeCalls).toBe(1);
    });

    it("이미 취소된 신호: 버전 확인도 휠 읽기도 시작하지 않고 상태 폴더도 만들지 않는다", async () => {
      const w = observeWorld({ versionChild: silent }, "bytes");
      w.deps.signal = AbortSignal.abort();
      await main(argvWheel(), w.deps);
      expect(w.versionCalls).toEqual([]);
      expect(w.hasher.calls).toEqual([]);
      expect(await w.fs.exists("/evidence/run-cli-1/version-check-state")).toBe(false);
      expect(bodyOf(w).tool_observation.version_check).toMatchObject({
        status: "NOT_ATTEMPTED",
        failure: "CANCELLED",
      });
      expect(w.lock.files.size).toBe(0);
    });

    it("자식의 종료를 확인하지 못하면 정리 결과에 KILL_NOT_OBSERVED로 남기고 실행은 실패로 끝난다(그래도 잠금·수신기는 정리한다)", async () => {
      let disposed = 0;
      const stuck: ChildHandle = {
        pid: 9,
        stdout: new AsyncByteQueue(),
        stderr: new AsyncByteQueue(),
        writeStdin: async () => {},
        endStdin: async () => {},
        kill: () => {},
        exited: new Promise(() => {}),
        dispose: async () => void (disposed += 1),
      };
      const w = observeWorld({ versionChild: () => stuck }, "match");
      const clock = w.deps.clock as VirtualClock;
      const code = await drive(clock, main(argvWheel(), w.deps));
      expect(code).toBe(EXIT.failed);
      const b = bodyOf(w);
      expect(b.cleanup.version_check_process.state).toBe("KILL_NOT_OBSERVED");
      expect(disposed).toBe(1);
      expect(b.cleanup.lock.state).toBe("RELEASED");
      expect(b.cleanup.metrics_receiver.closed).toBe(true);
    });

    it("포트 생성이 실패해도(예외) 잠금을 해제하고 수신기를 닫는다 — 관측 앞에서 던져도 정리된다", async () => {
      const w = observeWorld({}, "bytes");
      w.deps.makeProcessPort = () => {
        throw new Error("시험: 포트 생성 실패");
      };
      expect(await main(argvWheel(), w.deps)).toBe(EXIT.failed);
      expect(w.lock.files.size).toBe(0);
      expect(w.receivers[0].closeCalls).toBe(1);
      expect(w.hasher.calls).toEqual([]);
    });
  });
});

// ── run: 같은 트리의 다른 서버 프로세스 관측 ──────────────────────────
//
// 이 구역의 프로세스 목록은 전부 **합성 자료**다(SyntheticLister, provenance "stub"). 실제 운영체제를 읽지 않으므로 여기서의 통과는
// CLI → 관측 → 하네스 → run.json 연결과 거부 경로가 의도대로라는 뜻일 뿐, 실제 Semgrep 프로세스 식별의 증거가 아니다.
// 실제 운영체제를 읽는 시험은 process-list-node.integration.test.ts에 있다.

describe("main — run: 같은 트리의 다른 서버 프로세스 관측", () => {
  const passEnv = { [ENV_NAME]: "1" };
  const PIN_VERSION = data.pin.semgrep.version;
  const SCAN_TREE = "/scan/run-1";
  const SECRET = "tok-SECRET-0123456789";
  const baseRows = [ownRow(), parentRow()];

  interface ForeignBody {
    status: string;
    started: boolean;
    foreign_server_observation: ForeignServerObservationSummary;
    record: { measurement: { reasons: { code: string; detail: string | null }[] } } | null;
  }
  const bodyOf = (w: World): ForeignBody => jsonOut(w) as unknown as ForeignBody;
  const codesOf = (b: ForeignBody): string[] =>
    (b.record?.measurement.reasons ?? []).map((r) => r.code);
  const runOf = async (w: World) =>
    JSON.parse(decoder.decode(await w.fs.readFile("/evidence/run-cli-1/run.json"))) as {
      resources?: { foreign_server_observation?: ForeignServerObservationSummary };
    };

  /** 도구 관측까지 모두 맞춘 세계: 남은 거부 사유는 오직 다른 서버 프로세스 관측뿐이다. */
  function world(
    lister: ProcessLister | undefined,
    over: Parameters<typeof makeWorld>[0] = {}
  ): World {
    const w = makeWorld({
      env: passEnv,
      portProvenance: "stub",
      versionChild: versionOutput(`${PIN_VERSION}\n`),
      extraFiles: fixtureFiles(FIXTURES_REPO, "v1"),
      ...(lister ? { lister } : {}),
      ...over,
    });
    w.hasher.forcedResult = { sha256: SYNTHETIC_WHEEL, sizeBytes: 31 };
    return w;
  }
  const argv = (): string[] => [
    ...targetArgv(FIXTURES_REPO),
    "--wheel-artifact",
    "/artifacts/semgrep-test-only.whl",
  ];

  /** 보호 대상 서버 트리에 아무것도 만들지 않았다(폴더도 파일도). */
  async function expectTreeUntouched(w: World): Promise<void> {
    const files = await w.fs.listFilesRecursive(SCAN_TREE).catch(() => []);
    expect(files).toEqual([]);
    expect(
      w.fs.directories.filter((d) => d === SCAN_TREE || d.startsWith(`${SCAN_TREE}/`))
    ).toEqual([]);
  }

  it("다른 서버가 같은 트리에 있으면: 거부되고, 서버를 띄우지 않고, 서버 트리를 만들지 않으며, 요약이 증거에 남는다", async () => {
    const lister = listerOf([
      ...baseRows,
      serverRow(601, { cwd: SCAN_TREE, extraArgs: [`--token=${SECRET}`, "/very/private/path"] }),
    ]);
    const w = world(lister);
    expect(await main(argv(), w.deps)).toBe(EXIT.failed);

    const b = bodyOf(w);
    expect(b.started).toBe(false);
    expect(w.spawnCalls).toEqual([]); // LSP 서버 기동 시도 자체가 없다
    expect(b.status).toBe("ENV_MISMATCH");
    expect(codesOf(b)).toContain("FOREIGN_SERVER_PROCESS");
    expect(
      b.record?.measurement.reasons.find((r) => r.code === "FOREIGN_SERVER_PROCESS")?.detail
    ).toContain("1개");
    // 비어 있는 트리를 어긋남으로 판정하지 않는다 — 막는 원인은 다른 서버다.
    expect(codesOf(b).filter((c) => c.startsWith("SCAN_TREE_"))).toEqual([]);
    await expectTreeUntouched(w);

    const run = await runOf(w);
    expect(run.resources?.foreign_server_observation).toEqual(b.foreign_server_observation);
    expect(b.foreign_server_observation).toMatchObject({
      scope: "POINT_IN_TIME",
      status: "OBSERVED",
      foreign_server_processes: 1,
      listing: { source: "linux-proc", provenance: "stub", rows: 3 },
      counts: { servers_same_tree: 1 },
    });
    // 명령줄·경로·토큰은 증거에도 출력에도 없다.
    const text = JSON.stringify(run) + w.out.join("");
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain("/very/private/path");
    expect(text).not.toContain("--token");
  });

  it("관측에 실패하면 null이다 — 같은 거부, 서버·트리는 건드리지 않고, 실패 토큰이 증거에 남는다", async () => {
    for (const failure of [
      "TIMEOUT",
      "PERMISSION_DENIED",
      "OUTPUT_MALFORMED",
      "UNSUPPORTED_PLATFORM",
    ] as const) {
      const lister = new SyntheticLister({ ok: false, failure });
      const w = world(lister);
      expect(await main(argv(), w.deps), failure).toBe(EXIT.failed);
      const b = bodyOf(w);
      expect(codesOf(b), failure).toContain("FOREIGN_SERVER_PROCESS");
      expect(
        b.record?.measurement.reasons.find((r) => r.code === "FOREIGN_SERVER_PROCESS")?.detail,
        failure
      ).toContain("확인하지 못했다");
      expect(b.started, failure).toBe(false);
      expect(w.spawnCalls, failure).toEqual([]);
      await expectTreeUntouched(w);
      expect(b.foreign_server_observation, failure).toMatchObject({
        status: "FAILED",
        failure,
        foreign_server_processes: null,
      });
      expect((await runOf(w)).resources?.foreign_server_observation, failure).toEqual(
        b.foreign_server_observation
      );
    }
  });

  it("후보를 판별하지 못하면(작업 폴더를 알 수 없는 서버) null이다 — 0으로 보정하지 않고 트리를 만들지 않는다", async () => {
    const w = world(listerOf([...baseRows, serverRow(601, { cwd: null })]));
    expect(await main(argv(), w.deps)).toBe(EXIT.failed);
    const b = bodyOf(w);
    expect(b.foreign_server_observation).toMatchObject({
      status: "INCONCLUSIVE",
      foreign_server_processes: null,
      undetermined_reasons: { CWD_UNAVAILABLE: 1 },
    });
    expect(codesOf(b)).toContain("FOREIGN_SERVER_PROCESS");
    expect(w.spawnCalls).toEqual([]);
    await expectTreeUntouched(w);
  });

  it("목록을 읽었지만 자기 자신이 없으면 null이다(잠금을 얻었다는 이유로 0이 되지 않는다)", async () => {
    const w = world(listerOf([plainRow(1)]));
    expect(await main(argv(), w.deps)).toBe(EXIT.failed);
    const b = bodyOf(w);
    expect(bodyOf(w).foreign_server_observation).toMatchObject({
      status: "FAILED",
      failure: "SELF_NOT_IN_LISTING",
    });
    expect(codesOf(b)).toContain("FOREIGN_SERVER_PROCESS");
    await expectTreeUntouched(w);
  });

  it("잠금을 얻지 못했으면 목록을 읽지도 않는다 — 시도하지 않은 것으로 null이다", async () => {
    const lister = listerOf(baseRows);
    const w = world(lister);
    const other = await acquireRunLock(w.lock, {
      treePath: SCAN_TREE,
      runId: "other-run",
      mode: "control",
    });
    if (other.state !== "ACQUIRED") throw new Error("전제");
    expect(await main(argv(), w.deps)).toBe(EXIT.failed);
    expect(lister.calls).toBe(0);
    const b = bodyOf(w);
    expect(b.foreign_server_observation).toMatchObject({
      status: "NOT_ATTEMPTED",
      failure: "LOCK_NOT_HELD",
      foreign_server_processes: null,
    });
    expect(codesOf(b)).toEqual(
      expect.arrayContaining(["LOCK_NOT_ACQUIRED", "FOREIGN_SERVER_PROCESS"])
    );
    await expectTreeUntouched(w);
  });

  it("보이는 서버가 같은 트리로 확인되지 않으면(실행 위치만 다름) 0이 아니라 판별 불가다 — 트리도 서버도 건드리지 않는다", async () => {
    const w = world(listerOf([...baseRows, serverRow(601, { cwd: "/elsewhere/project" })]));
    expect(await main(argv(), w.deps)).toBe(EXIT.failed);
    const b = bodyOf(w);
    expect(b.foreign_server_observation).toMatchObject({
      status: "INCONCLUSIVE",
      foreign_server_processes: null,
      undetermined_reasons: { TREE_BINDING_UNOBSERVABLE: 1 },
    });
    expect(codesOf(b)).toContain("FOREIGN_SERVER_PROCESS");
    expect(w.spawnCalls).toEqual([]);
    await expectTreeUntouched(w);
  });

  it("다른 서버 후보가 보이지 않고 0건으로 확정되면: 거부 사유에서 빠지고, 서버 트리를 준비하며, 서버 기동을 시도한다(버전 확인·검사는 서버가 아니다)", async () => {
    const lister = listerOf([
      ...baseRows,
      plainRow(601),
      versionRow(602, { cwd: SCAN_TREE }), // 버전 확인은 서버가 아니다
    ]);
    const w = world(lister);
    await main(argv(), w.deps);
    const b = bodyOf(w);
    expect(b.foreign_server_observation).toMatchObject({
      status: "OBSERVED",
      foreign_server_processes: 0,
      counts: { version_check: 1, servers_same_tree: 0, servers_undetermined: 0 },
    });
    expect(codesOf(b)).not.toContain("FOREIGN_SERVER_PROCESS");
    // 트리를 준비했다(E에 해당하는 파일이 놓였다).
    expect((await w.fs.listFilesRecursive(SCAN_TREE)).length).toBeGreaterThan(0);
    // 서버 기동을 시도했다 — 인자는 LSP 서버의 것이다(가짜 포트가 던져 시도만 기록된다).
    expect(w.spawnCalls).toHaveLength(1);
    expect(w.spawnCalls[0].args).toEqual(["lsp", "--debug"]);
  });

  it("조회는 도구 관측(버전 확인) 뒤, 서버 기동 앞에서 한 번 일어나고 같은 프로세스 포트를 쓴다", async () => {
    const log: string[] = [];
    const lister = new SyntheticLister(async () => {
      log.push("list");
      return { ok: true, snapshot: snapshotOf(baseRows) };
    });
    const w = world(lister, {
      versionChild: () => {
        log.push("version");
        return versionOutput(`${PIN_VERSION}\n`)();
      },
    });
    const real = w.deps.makeProcessPort;
    w.deps.makeProcessPort = (p) => {
      log.push("port");
      return real(p);
    };
    const spawn = w.deps.makeProcessLister;
    w.deps.makeProcessLister = (port) => {
      log.push("lister");
      return spawn(port);
    };
    await main(argv(), w.deps);
    expect(log).toEqual(["port", "version", "lister", "list"]); // 포트는 한 번만 만들었다
    expect(lister.calls).toBe(1);
    expect(w.portCalls).toEqual(["real"]);
    expect(w.listerPorts).toHaveLength(1);
  });

  it("출력(stdout)과 증거(run.json)의 요약은 같고, 미구현·미검증 목록은 '조회 시점'과 식별 규칙 미검증을 밝힌다", async () => {
    const w = world(listerOf(baseRows));
    await main(argv(), w.deps);
    const body = jsonOut(w) as unknown as { not_implemented_or_not_verified: string[] };
    const note = body.not_implemented_or_not_verified.find((n) =>
      n.startsWith("같은 트리의 다른 서버 프로세스 관측")
    );
    expect(note).toBeDefined();
    for (const phrase of [
      "조회",
      "시점",
      "끝내거나 정리하지 않는다",
      "실제 Semgrep으로 확인하지 않았",
      "foreignServerProcesses=null",
    ]) {
      expect(note, phrase).toContain(phrase);
    }
    expect(note).not.toMatch(/막는다|차단한다|보장한다/);
  });

  it("조회 도중 취소되면(신호) null이고 서버·트리는 그대로다", async () => {
    const controller = new AbortController();
    const lister = new SyntheticLister(async () => {
      controller.abort();
      return { ok: true, snapshot: snapshotOf(baseRows) };
    });
    const w = world(lister);
    w.deps.signal = controller.signal;
    await main(argv(), w.deps);
    expect(w.spawnCalls).toEqual([]);
    await expectTreeUntouched(w);
    expect(w.lock.files.size).toBe(0); // 정리: 잠금 해제
  });
});
