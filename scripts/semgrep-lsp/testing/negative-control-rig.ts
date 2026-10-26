// 시험 지원: 음성 대조 실행기를 합성 세계(메모리 파일 시스템 + 스텁 엔진)에서 돌리는 장치. 실제 Semgrep도, 실제 규칙 YAML도 아니다.
// 엔진 반응(assumedEngine)은 시험이 **가정한** 반응이며 실제 엔진이 변형에 그렇게 반응한다는 증거가 아니다.
//
// 공개 API:
//   makeRig(world, options): Rig            메모리 세계 + 주입 포트 + 실행기 호출
//   assumedEngine(world, key)               가정한 엔진 반응(R6: 규칙 갱신 없음, R8: 접두어 없는 code 게시)
//   entryOf / caseOf / statuses             스위트 읽기 도우미

import { VirtualClock } from "../clock";
import {
  runNegativeControls,
  type CaseResources,
  type NegativeControlDeps,
  type NegativeControlInputs,
  type NegativeControlSuite,
  type RunKey,
} from "../negative-control";
import type { FsPort, NegativeControlResult, ProcessPort } from "../types";
import type { ControlWorld } from "./control-world";
import type { FakePort } from "./fake-process";
import { MemoryFs } from "./memory-fs";
import { drive, stubPort, type StubPatch } from "./stub-lsp";
import type { HappySpec } from "./transcript-builder";

export const SUITE = "nc1";

export interface Reaction {
  patch?: StubPatch;
  spec?: Partial<HappySpec>;
}

export interface RigOptions {
  /** 엔진 층 실행(기준 포함)의 스텁 반응. undefined를 돌려주면 기준(깨끗한) 반응이다. */
  engine?: (key: RunKey) => Reaction | undefined;
  resources?: (key: RunKey) => Partial<CaseResources>;
  inputs?: Partial<NegativeControlInputs>;
  wrapFs?: (fs: MemoryFs) => FsPort;
  wrapPort?: (key: RunKey, port: FakePort) => ProcessPort;
  /** 자원을 쥘 때마다 불린다(시험이 중간에 취소하거나 상태를 바꾸는 데 쓴다). */
  onResources?: (key: RunKey) => void;
}

/** 가정한 엔진 반응: R6(없는 규칙 경로)은 규칙이 갱신되지 않고, R8(cwd 밖 절대 경로)은 접두어 없는 code를 게시한다. */
export function assumedEngine(world: ControlWorld, key: RunKey): Reaction | undefined {
  if (key.id === "R6") {
    return {
      patch: { rules: { omitRulesRefreshed: true, loadingPaths: [] } as StubPatch["rules"] },
    };
  }
  if (key.id === "R8") {
    const diagnostics: Record<string, { severity: number; code: string; message: string }[]> = {};
    let total = 0;
    for (const c of world.expectations.cases) {
      diagnostics[c.path] = c.required.map((code) => ({
        severity: 2,
        code: code.slice(`${world.cacheDir}.`.length),
        message: "m",
      }));
      total += c.required.length;
    }
    return { spec: { diagnostics, m: total } };
  }
  return undefined;
}

export function makeRig(world: ControlWorld, options: RigOptions = {}) {
  const memory = new MemoryFs(world.files);
  const writes: string[] = [];
  const recordingFs: FsPort = {
    readFile: (p) => memory.readFile(p),
    writeFileExclusive: async (p, d) => {
      writes.push(p);
      return memory.writeFileExclusive(p, d);
    },
    mkdirp: async (p) => {
      writes.push(p);
      return memory.mkdirp(p);
    },
    listFilesRecursive: (r) => memory.listFilesRecursive(r),
    exists: (p) => memory.exists(p),
    physicalKey: (p) => memory.physicalKey(p),
  };
  const fs: FsPort = options.wrapFs ? options.wrapFs(memory) : recordingFs;
  const clock = new VirtualClock();
  const processKeys: RunKey[] = [];
  const resourceKeys: RunKey[] = [];
  const ports = new Map<string, FakePort>();

  const deps: NegativeControlDeps = {
    fs,
    git: {
      async resolveCommit() {
        throw new Error("control 모드에서는 git을 쓰지 않는다");
      },
      async lsTree() {
        throw new Error("control 모드에서는 git을 쓰지 않는다");
      },
      async readBlob() {
        throw new Error("control 모드에서는 git을 쓰지 않는다");
      },
    },
    clock,
    processFor: (key) => {
      processKeys.push(key);
      const reaction = (options.engine ?? ((k: RunKey) => assumedEngine(world, k)))(key);
      const { port } = stubPort(
        world.scriptFor(key.treeRoot, reaction?.patch ?? {}, reaction?.spec ?? {}),
        clock
      );
      ports.set(key.runId, port);
      return options.wrapPort ? options.wrapPort(key, port) : port;
    },
    withResources: async (key, fn) => {
      resourceKeys.push(key);
      options.onResources?.(key);
      return fn({
        lockHeld: true,
        foreignServerProcesses: 0,
        metricsReceiverHits: 0,
        spawnEnv: { PATH: "/usr/bin" },
        ...(options.resources?.(key) ?? {}),
      });
    },
  };
  const inputs: NegativeControlInputs = {
    suiteId: SUITE,
    workRoot: world.paths.workRoot,
    evidenceRoot: world.paths.evidenceRoot,
    dataDir: world.paths.dataDir,
    harnessRoot: world.paths.harnessRoot,
    rulesCacheRoot: world.paths.rulesCacheRoot,
    controlFixturesRoot: world.paths.fixturesRoot,
    spawn: world.spawn,
    limits: world.limits,
    settings: world.settings,
    toolVersionObserved: world.data.pin.semgrep.version,
    wheelSha256Observed: world.data.pin.semgrep.wheel.sha256,
    ...(options.inputs ?? {}),
  };
  return {
    memory,
    fs,
    writes,
    deps,
    inputs,
    processKeys,
    resourceKeys,
    ports,
    clock,
    run: (): Promise<NegativeControlSuite> =>
      drive(clock, runNegativeControls(deps, inputs), 100 * 3_600_000),
  };
}

export type Rig = ReturnType<typeof makeRig>;

export const entryOf = (
  suite: NegativeControlSuite,
  id: string,
  layer: "preflight" | "engine"
): NegativeControlResult => {
  const found = suite.entries.find((e) => e.id === id && e.layer === layer);
  if (!found) throw new Error(`항목이 없다: ${id}:${layer}`);
  return found;
};

export const caseOf = (suite: NegativeControlSuite, id: string, layer: "preflight" | "engine") => {
  const found = suite.cases.find((c) => c.id === id && c.layer === layer);
  if (!found) throw new Error(`사례가 없다: ${id}:${layer}`);
  return found;
};

export const statuses = (suite: NegativeControlSuite): Record<string, string> =>
  Object.fromEntries(suite.entries.map((e) => [`${e.id}:${e.layer}`, e.status]));

export const notRunOutcomes = (suite: NegativeControlSuite): Record<string, string> =>
  Object.fromEntries(
    suite.cases
      .filter((c) => c.outcome !== "EXECUTED")
      .map((c) => [`${c.id}:${c.layer}`, c.outcome])
  );
