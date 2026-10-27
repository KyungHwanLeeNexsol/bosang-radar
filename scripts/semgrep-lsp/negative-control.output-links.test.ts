import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { VirtualClock } from "./clock";
import { EXIT, main } from "./cli";
import { RUN_MARKER_FILE, SERVER_STATE_DIR, VERSION_STATE_DIR } from "./evidence";
import { createNodeFs } from "./fs-node";
import {
  SUITE_RECORD_FILE,
  runNegativeControls,
  type NegativeControlSuite,
} from "./negative-control";
import {
  FIXTURES_ROOT,
  SUITE_ID,
  WORK_ROOT,
  EVIDENCE_ROOT,
  argvNegativeControl,
  makeCliWorld as buildCliWorld,
} from "./testing/cli-negative-control-world";
import { buildControlWorld } from "./testing/control-world";
import { linkedFs } from "./testing/linked-fs";
import { MemoryFs } from "./testing/memory-fs";
import { SUITE, makeRig, statuses } from "./testing/negative-control-rig";
import { drive } from "./testing/stub-lsp";
import { SYNTHETIC_CACHE_DIR } from "./testing/synthetic-data";
import type { FsPort } from "./types";

// 외부 검토가 PR #34 HEAD 662731a에서 재현한 한 건 — 사례 폴더 자체는 정상 디렉터리인데 **그 아래**(캐시 루트·하위 폴더·대조 트리 같은
// 실제 쓰기 경로)가 원본을 가리키는 링크인 경우 — 을 다시 만든 시험이다. 수정 전 구현에서는 outputPathProblem이 사례 폴더 루트까지만 보고,
// 실제 쓰기(writeTree·대조 트리·증거·상태 폴더)는 그 아래에서 일어나 링크를 따라 원본에 파일이 생겼다.
//
// 두 종류를 구분해 보고한다:
//  · 합성: 메모리 파일 시스템 위의 링크 모형(testing/linked-fs.ts). 링크 이름 아래의 쓰기가 대상 자리로 옮겨진다고 가정한 모형이다.
//  · 실제: 실제 임시 디스크의 symlink(POSIX)·junction(Windows). 만들 수 없는 환경에서는 건너뛴다(건너뛰었음을 보고에 적는다).
// 실제 Semgrep은 실행하지 않는다 — 엔진은 스텁이다.

function fixtureBytes(fixture: string): Uint8Array {
  return readFileSync(fileURLToPath(new URL(`../../${fixture}`, import.meta.url)));
}

const world = buildControlWorld(fixtureBytes);
const CACHE = SYNTHETIC_CACHE_DIR;
const FIRST_RULE = world.data.rulesFiles[0].path;
/** 규칙 사본의 첫 하위 디렉터리 이름(예: javascript). 캐시 루트는 정상이고 이 하위만 링크인 경우를 만든다. */
const RULE_TOP = FIRST_RULE.split("/")[0];
const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

/** 파일(경로 → 바이트 해시)과 디렉터리 목록 전체. 거절 전후가 같은지 보는 데 쓴다. */
async function memorySnapshot(
  memory: MemoryFs
): Promise<{ files: Record<string, string>; dirs: string[] }> {
  const files: Record<string, string> = {};
  for (const rel of await memory.listFilesRecursive("/")) {
    files[`/${rel}`] = sha256(await memory.readFile(`/${rel}`));
  }
  return { files, dirs: memory.directories };
}

const allNotRun = (suite: NegativeControlSuite): boolean =>
  Object.values(statuses(suite)).every((s) => s === "NOT_RUN");

// ── 합성: 러너 직접 호출 ─────────────────────────────────────────────────────

describe("하위 링크 우회 — runNegativeControls 직접 호출(합성 링크 모형)", () => {
  const originals: [string, string][] = [
    ["대조 예제", world.paths.fixturesRoot],
    ["규칙 캐시", world.paths.rulesCacheRoot],
    ["고정 데이터", world.paths.dataDir],
    ["하네스", world.paths.harnessRoot],
  ];
  const wsBaseline = `${world.paths.workRoot}/${SUITE}-baseline`;

  // 링크 이름 → 대상. 사례 폴더 자체는 정상 디렉터리이고 그 아래만 링크다.
  const cases: [string, Record<string, string>][] = [
    ["캐시 루트가 원본(대조 예제)을 가리키는 링크", { [`${wsBaseline}/${CACHE}`]: "/repo" }],
    [
      "캐시 루트는 정상이고 그 아래 하위 폴더가 원본을 가리키는 링크",
      { [`${wsBaseline}/${CACHE}/${RULE_TOP}`]: "/repo" },
    ],
    [
      "변형 사례(R4 사전 검사)의 캐시 루트 링크 — 기준 실행이 끝난 뒤가 아니라 시작 전에 막는다",
      { [`${world.paths.workRoot}/${SUITE}-r4-preflight/${CACHE}`]: "/repo" },
    ],
    [
      "R8의 밖 사본 캐시 루트 링크",
      { [`${world.paths.workRoot}/${SUITE}-r8-engine-outside/${CACHE}`]: "/repo" },
    ],
    [
      "R8의 밖 사본 하위 폴더 링크",
      { [`${world.paths.workRoot}/${SUITE}-r8-engine-outside/${CACHE}/${RULE_TOP}`]: "/repo" },
    ],
    ["대조 트리 루트 링크", { [`${wsBaseline}/tree`]: "/repo" }],
    [
      "증거 폴더 안의 증거 파일 이름 링크",
      { [`${world.paths.evidenceRoot}/${SUITE}-baseline/run.json`]: "/repo/sub-run.json" },
    ],
    [
      "증거 폴더 안의 서버 상태 폴더 링크",
      { [`${world.paths.evidenceRoot}/${SUITE}-r2-engine/semgrep-state`]: "/repo" },
    ],
    [
      "증거 폴더 안의 실행 표지 링크",
      { [`${world.paths.evidenceRoot}/${SUITE}-r3-preflight/run.marker`]: "/repo/marker" },
    ],
    [
      "스위트 폴더의 버전 확인 상태 폴더 링크",
      { [`${world.paths.evidenceRoot}/${SUITE}/version-check-state`]: "/repo" },
    ],
  ];

  for (const [name, links] of cases) {
    it(`${name}: 어떠한 쓰기도 하기 전에 거절하고 16개 모두 NOT_RUN이다`, async () => {
      const rig = makeRig(world, {
        wrapFs: (memory) => linkedFs(memory, links),
      });
      const linked = rig.fs as ReturnType<typeof linkedFs>;
      const before = await memorySnapshot(rig.memory);
      const suite = await rig.run();
      expect(linked.reached).toEqual([]);
      expect(await memorySnapshot(rig.memory)).toEqual(before);
      expect(suite.blocked).toMatchObject({ stage: "WORKSPACE" });
      expect(String((suite.blocked as { cause: string }).cause)).toMatch(/^OUTPUT_INSIDE_/);
      expect(allNotRun(suite)).toBe(true);
      expect(rig.processKeys).toEqual([]);
      expect(rig.resourceKeys).toEqual([]);
    });
  }

  for (const [name, root] of originals) {
    it(`링크가 ${name}를 가리켜도 같은 원칙이다(캐시 루트 링크)`, async () => {
      const rig = makeRig(world, {
        wrapFs: (memory) => linkedFs(memory, { [`${wsBaseline}/${CACHE}`]: root }),
      });
      const linked = rig.fs as ReturnType<typeof linkedFs>;
      const before = await memorySnapshot(rig.memory);
      const suite = await rig.run();
      expect(suite.blocked).toMatchObject({ stage: "WORKSPACE" });
      expect(linked.reached).toEqual([]);
      expect(await memorySnapshot(rig.memory)).toEqual(before);
    });
  }

  it("정상적으로 분리된 작업·증거 폴더는 계속 허용한다(대조군)", async () => {
    const rig = makeRig(world, {
      wrapFs: (memory) => linkedFs(memory, {}),
    });
    const suite = await rig.run();
    expect(suite.blocked).toBeNull();
    expect((rig.fs as ReturnType<typeof linkedFs>).reached.length).toBeGreaterThan(0);
    expect(suite.baseline.clean).toBe(true);
  });

  it("원본이 아닌 곳을 가리키는 링크는 이번 보호 범위 밖이라 막지 않는다(범위 확인)", async () => {
    const rig = makeRig(world, {
      wrapFs: (memory) => linkedFs(memory, { [`${wsBaseline}/${CACHE}`]: "/scratch-elsewhere" }),
    });
    const suite = await rig.run();
    expect(suite.blocked).toBeNull();
  });

  it("검사한 경로와 실제로 쓴 경로가 어긋나지 않는다: 쓴 모든 자리는 첫 쓰기 전에 이미 검사한 경로이거나 그 경로의 상위 폴더다", async () => {
    type Event = { kind: "check" | "write"; path: string };
    const events: Event[] = [];
    const rig = makeRig(world, {
      wrapFs: (memory): FsPort => ({
        readFile: (p) => memory.readFile(p),
        writeFileExclusive: async (p, d) => {
          events.push({ kind: "write", path: p });
          return memory.writeFileExclusive(p, d);
        },
        mkdirp: async (p) => {
          events.push({ kind: "write", path: p });
          return memory.mkdirp(p);
        },
        listFilesRecursive: (r) => memory.listFilesRecursive(r),
        exists: (p) => memory.exists(p),
        physicalKey: async (p) => {
          events.push({ kind: "check", path: p });
          return memory.physicalKey(p);
        },
      }),
    });
    const suite = await rig.run();
    expect(suite.blocked).toBeNull();
    const firstWrite = events.findIndex((e) => e.kind === "write");
    expect(firstWrite).toBeGreaterThan(0);
    // 검사는 쓰기보다 앞선다: 첫 쓰기 전의 검사만으로 이후의 모든 쓰기 자리가 덮여야 한다(실행 도중의 검사는 인정하지 않는다).
    const checkedBefore = events.slice(0, firstWrite).map((e) => e.path);
    const written = events.filter((e) => e.kind === "write").map((e) => e.path);
    expect(written.length).toBeGreaterThan(0);
    const uncovered = written.filter(
      (w) => !checkedBefore.some((c) => c === w || c.startsWith(`${w}/`))
    );
    expect(uncovered).toEqual([]);
  });
});

// ── 합성: CLI ───────────────────────────────────────────────────────────────

describe("하위 링크 우회 — CLI negative-control(합성 링크 모형)", () => {
  const wsBaseline = `${WORK_ROOT}/${SUITE_ID}-baseline`;
  const cliCases: [string, Record<string, string>][] = [
    ["사례 작업 공간의 캐시 루트 링크", { [`${wsBaseline}/${CACHE}`]: FIXTURES_ROOT }],
    [
      "캐시 루트는 정상이고 하위 폴더만 링크",
      { [`${wsBaseline}/${CACHE}/${RULE_TOP}`]: FIXTURES_ROOT },
    ],
    ["대조 트리 루트 링크", { [`${wsBaseline}/tree`]: FIXTURES_ROOT }],
    [
      "스위트 증거 폴더의 버전 확인 상태 폴더 링크(CLI가 도구 관측 단계에서 만드는 곳)",
      { [`${EVIDENCE_ROOT}/${SUITE_ID}/version-check-state`]: FIXTURES_ROOT },
    ],
    [
      "스위트 증거 폴더의 서버 상태 폴더 링크",
      { [`${EVIDENCE_ROOT}/${SUITE_ID}/semgrep-state`]: FIXTURES_ROOT },
    ],
    [
      "스위트 증거 폴더의 실행 표지 링크",
      { [`${EVIDENCE_ROOT}/${SUITE_ID}/run.marker`]: `${FIXTURES_ROOT}/marker` },
    ],
    [
      "사례 증거 폴더의 서버 상태 폴더 링크",
      { [`${EVIDENCE_ROOT}/${SUITE_ID}-r2-engine/semgrep-state`]: FIXTURES_ROOT },
    ],
  ];

  for (const [name, links] of cliCases) {
    it(`${name}: 사용법 오류(2)이고 포트·잠금·표지·상태 폴더·수신기·쓰기가 하나도 없다`, async () => {
      const w = buildCliWorld(fixtureBytes);
      const linked = linkedFs(w.fs, links);
      const deps = { ...w.deps, fs: linked };
      const before = await memorySnapshot(w.fs);
      const code = await drive(w.clock, main(argvNegativeControl(), deps), 1000 * 3_600_000);
      expect(code).toBe(EXIT.usage);
      expect(w.portCalls).toEqual([]);
      expect(w.lock.calls).toEqual([]);
      expect(w.receivers).toEqual([]);
      expect(w.versionCalls).toEqual([]);
      expect(w.serverCalls).toEqual([]);
      expect(linked.reached).toEqual([]);
      expect(await memorySnapshot(w.fs)).toEqual(before);
      expect(w.err.join("")).toContain("원본");
    });
  }

  it("CLI가 실제로 쓴 모든 자리(표지·상태 폴더·증거·규칙 사본·대조 트리)는 첫 쓰기 전에 이미 검사한 경로이거나 그 경로의 상위 폴더다", async () => {
    const w = buildCliWorld(fixtureBytes);
    type Event = { kind: "check" | "write"; path: string };
    const events: Event[] = [];
    const inner = w.deps.fs;
    const deps = {
      ...w.deps,
      fs: {
        readFile: (p: string) => inner.readFile(p),
        writeFileExclusive: async (p: string, d: Uint8Array) => {
          events.push({ kind: "write", path: p });
          return inner.writeFileExclusive(p, d);
        },
        mkdirp: async (p: string) => {
          events.push({ kind: "write", path: p });
          return inner.mkdirp(p);
        },
        listFilesRecursive: (r: string) => inner.listFilesRecursive(r),
        exists: (p: string) => inner.exists(p),
        physicalKey: async (p: string) => {
          events.push({ kind: "check", path: p });
          return inner.physicalKey(p);
        },
      },
    };
    await drive(w.clock, main(argvNegativeControl(), deps), 1000 * 3_600_000);
    const firstWrite = events.findIndex((e) => e.kind === "write");
    expect(firstWrite).toBeGreaterThan(0);
    const checkedBefore = events.slice(0, firstWrite).map((e) => e.path);
    const written = events.filter((e) => e.kind === "write").map((e) => e.path);
    // 표지·상태 폴더를 쓰는 CLI 경로와 서버 상태 폴더가 실제로 이 실행에 있었는지(시험이 빈 껍데기가 아닌지) 확인한다.
    expect(written).toContain(`${EVIDENCE_ROOT}/${SUITE_ID}/run.marker`);
    expect(written).toContain(`${EVIDENCE_ROOT}/${SUITE_ID}/version-check-state`);
    expect(written).toContain(`${EVIDENCE_ROOT}/${SUITE_ID}-baseline/semgrep-state`);
    expect(written).toContain(`${EVIDENCE_ROOT}/${SUITE_ID}/negative-controls.json`);
    const uncovered = written.filter(
      (target) => !checkedBefore.some((c) => c === target || c.startsWith(`${target}/`))
    );
    expect(uncovered).toEqual([]);
  });

  it("쓰기 경로 검사가 쓰는 고정 이름은 CLI가 실제로 쓰는 이름과 같다(한쪽만 바뀌면 여기서 드러난다)", () => {
    expect(RUN_MARKER_FILE).toBe("run.marker");
    expect(SERVER_STATE_DIR).toBe("semgrep-state");
    expect(VERSION_STATE_DIR).toBe("version-check-state");
    expect(SUITE_RECORD_FILE).toBe("negative-controls.json");
  });

  it("정상 경로(링크 없음)는 그대로 돈다(대조군)", async () => {
    const w = buildCliWorld(fixtureBytes);
    const deps = { ...w.deps, fs: linkedFs(w.fs, {}) };
    const code = await drive(w.clock, main(argvNegativeControl(), deps), 1000 * 3_600_000);
    expect(code).toBe(EXIT.failed); // R9 엔진 층 때문에 0이 될 수 없다
    expect(w.serverCalls.length).toBeGreaterThan(0);
  });
});

// ── 실제: 임시 디스크의 symlink·junction ───────────────────────────────────

function linkKind(): "junction" | "symlink" {
  return process.platform === "win32" ? "junction" : "symlink";
}

/** 이 환경에서 디렉터리 링크를 실제로 만들 수 있는가(권한이 없으면 false — 그때는 건너뛴다). */
function canMakeDirLinks(): boolean {
  const base = mkdtempSync(`${tmpdir().replace(/\\/g, "/")}/nc-link-probe-`);
  try {
    mkdirSync(`${base}/target`);
    symlinkSync(resolvePath(`${base}/target`), `${base}/link`, "junction");
    return lstatSync(`${base}/link`).isSymbolicLink();
  } catch {
    return false;
  } finally {
    rmSync(`${base}/link`, { force: true, recursive: false });
    rmSync(base, { recursive: true, force: true });
  }
}

const REAL_LINKS = canMakeDirLinks();

interface RealWorld {
  base: string;
  paths: {
    dataDir: string;
    harnessRoot: string;
    rulesCacheRoot: string;
    fixturesRoot: string;
    evidenceRoot: string;
    workRoot: string;
  };
  links: string[];
}

const created: RealWorld[] = [];

/** 합성 세계의 파일을 임시 디스크에 그대로 옮긴다(경로 앞에 임시 폴더를 붙인다). 엔진은 여전히 스텁이다. */
function materialize(): RealWorld {
  const base = mkdtempSync(`${tmpdir().replace(/\\/g, "/")}/nc-links-`).replace(/\\/g, "/");
  for (const [path, data] of Object.entries(world.files)) {
    const target = `${base}${path}`;
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, data);
  }
  mkdirSync(`${base}${world.paths.workRoot}`, { recursive: true });
  mkdirSync(`${base}${world.paths.evidenceRoot}`, { recursive: true });
  const real: RealWorld = {
    base,
    paths: {
      dataDir: `${base}${world.paths.dataDir}`,
      harnessRoot: `${base}${world.paths.harnessRoot}`,
      rulesCacheRoot: `${base}${world.paths.rulesCacheRoot}`,
      fixturesRoot: `${base}${world.paths.fixturesRoot}`,
      evidenceRoot: `${base}${world.paths.evidenceRoot}`,
      workRoot: `${base}${world.paths.workRoot}`,
    },
    links: [],
  };
  created.push(real);
  return real;
}

function makeLink(real: RealWorld, linkPath: string, target: string): void {
  mkdirSync(dirname(linkPath), { recursive: true });
  symlinkSync(resolvePath(target), linkPath, "junction");
  real.links.push(linkPath);
}

afterEach(() => {
  for (const real of created.splice(0)) {
    for (const link of real.links) rmSync(link, { force: true, recursive: false });
    rmSync(real.base, { recursive: true, force: true });
  }
});

/** 링크를 따라가지 않고 트리 전체(경로 → 종류·바이트 해시)를 읽는다. 거절 전후가 같은지 보는 데 쓴다. */
function diskSnapshot(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string, rel: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      const key = `${rel}/${entry.name}`;
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) out[key] = "link";
      else if (stat.isDirectory()) {
        out[key] = "dir";
        walk(path, key);
      } else out[key] = `file:${sha256(readFileSync(path))}`;
    }
  };
  walk(root, "");
  return out;
}

/** drive()의 실제 I/O 판(harness.test.ts와 같은 방식): 가상 타이머가 있으면 시간을 보내고, 없으면 실제로 잠깐 기다린다. */
async function driveReal<T>(clock: VirtualClock, promise: Promise<T>): Promise<T> {
  let done = false;
  void promise.then(
    () => {
      done = true;
    },
    () => {
      done = true;
    }
  );
  for (let turn = 0; turn < 5000 && !done; turn += 1) {
    await clock.flush();
    if (done) break;
    if (clock.pendingTimers > 0) await clock.advance(3_600_000);
    else await new Promise<void>((r) => setTimeout(r, 2));
  }
  if (!done) throw new Error("실행이 끝나지 않았다(실제 I/O를 기다려도 약속이 이행되지 않는다)");
  return promise;
}

function realRig(real: RealWorld) {
  return makeRig(world, {
    wrapFs: () => createNodeFs(),
    inputs: {
      workRoot: real.paths.workRoot,
      evidenceRoot: real.paths.evidenceRoot,
      dataDir: real.paths.dataDir,
      harnessRoot: real.paths.harnessRoot,
      rulesCacheRoot: real.paths.rulesCacheRoot,
      controlFixturesRoot: real.paths.fixturesRoot,
    },
  });
}

describe.skipIf(!REAL_LINKS)(
  `하위 링크 우회 — 실제 임시 디스크(${linkKind()}, 만들 수 없으면 이 묶음은 건너뛴다)`,
  () => {
    const realCases: [string, (real: RealWorld) => void][] = [
      [
        "사례 폴더 안의 캐시 루트가 원본 예제 폴더를 가리키는 링크",
        (real) => {
          makeLink(
            real,
            `${real.paths.workRoot}/${SUITE}-baseline/${CACHE}`,
            real.paths.fixturesRoot
          );
        },
      ],
      [
        "캐시 루트는 정상이고 그 아래 하위 폴더가 원본 예제 폴더를 가리키는 링크",
        (real) => {
          mkdirSync(`${real.paths.workRoot}/${SUITE}-baseline/${CACHE}`, { recursive: true });
          makeLink(
            real,
            `${real.paths.workRoot}/${SUITE}-baseline/${CACHE}/${RULE_TOP}`,
            real.paths.fixturesRoot
          );
        },
      ],
      [
        "변형 사례(R4)의 캐시 루트 링크",
        (real) => {
          makeLink(
            real,
            `${real.paths.workRoot}/${SUITE}-r4-preflight/${CACHE}`,
            real.paths.fixturesRoot
          );
        },
      ],
      [
        "R8 밖 사본의 하위 폴더 링크",
        (real) => {
          mkdirSync(`${real.paths.workRoot}/${SUITE}-r8-engine-outside/${CACHE}`, {
            recursive: true,
          });
          makeLink(
            real,
            `${real.paths.workRoot}/${SUITE}-r8-engine-outside/${CACHE}/${RULE_TOP}`,
            real.paths.fixturesRoot
          );
        },
      ],
      [
        "대조 트리 루트 링크",
        (real) => {
          makeLink(real, `${real.paths.workRoot}/${SUITE}-baseline/tree`, real.paths.fixturesRoot);
        },
      ],
      [
        "증거 폴더 안의 서버 상태 폴더 링크",
        (real) => {
          makeLink(
            real,
            `${real.paths.evidenceRoot}/${SUITE}-r2-engine/semgrep-state`,
            real.paths.fixturesRoot
          );
        },
      ],
    ];

    for (const [name, arrange] of realCases) {
      it(`${name}: 아무것도 만들지 않고 거절한다`, async () => {
        const real = materialize();
        arrange(real);
        const rig = realRig(real);
        const before = diskSnapshot(real.base);
        const suite = await driveReal(rig.clock, runNegativeControls(rig.deps, rig.inputs));
        // 원본(대조 예제·규칙 캐시·고정 데이터·하네스)과 작업·증거 폴더 모두 파일 목록·디렉터리·기존 파일 바이트가 같다.
        expect(diskSnapshot(real.base)).toEqual(before);
        expect(suite.blocked).toMatchObject({ stage: "WORKSPACE" });
        expect(String((suite.blocked as { cause: string }).cause)).toMatch(/^OUTPUT_INSIDE_/);
        expect(allNotRun(suite)).toBe(true);
        expect(rig.processKeys).toEqual([]);
        expect(rig.resourceKeys).toEqual([]);
      });
    }

    it("정상적으로 분리된 출력 경로는 실제 디스크에서도 막지 않는다(대조군)", async () => {
      const real = materialize();
      const rig = realRig(real);
      const suite = await driveReal(rig.clock, runNegativeControls(rig.deps, rig.inputs));
      expect(suite.blocked).toBeNull();
      expect(suite.baseline.clean).toBe(true);
      // 원본은 그대로다: 대조 예제 폴더에는 처음 파일만 있다.
      const fixtures = diskSnapshot(real.paths.fixturesRoot);
      for (const key of Object.keys(fixtures)) expect(key).not.toMatch(/\.yaml$/);
    });
  }
);
