// 시험 지원: `negative-control` 명령과 `run --negative-controls`를 CLI(main) 경로로 돌리는 합성 세계. 프로세스는 하나도 띄우지 않는다 —
// 포트는 항상 주입된 가짜이고, 버전 확인은 가짜 자식이, LSP 서버는 스크립트된 스텁이 대신한다(provenance "stub"). 실제 Semgrep도, 실제
// 규칙 YAML도 아니며 여기서 얻은 결과는 CLI → 실행기 → 하네스 → 기록 연결이 합성 입력에서 의도대로 동작한다는 뜻일 뿐이다.
//
// 공개 API:
//   makeCliWorld(fixtureBytes, options)    메모리 세계 + 주입 포트 + 호출 기록(대조 예제 바이트는 호출자가 읽어 넘긴다)
//   argvNegativeControl(extra?)            negative-control 명령 인자
//   argvControlRun(runId, extra?)          control 모드 run 인자

import { VirtualClock } from "../clock";
import type { CliDeps } from "../cli";
import type { RunKey } from "../negative-control";
import type {
  ChildHandle,
  GitPort,
  ProcessLister,
  ProcessPort,
  Provenance,
  SpawnSpec,
} from "../types";
import { buildControlWorld, type ControlWorld } from "./control-world";
import { FakeChild } from "./fake-process";
import { FakeMetricsReceiver } from "./fake-metrics";
import { MemoryArtifactHasher } from "./memory-artifact";
import { MemoryFs } from "./memory-fs";
import { MemoryRunLock } from "./memory-run-lock";
import { assumedEngine, type Reaction } from "./negative-control-rig";
import { stubPort } from "./stub-lsp";
import { OWN_PID, listerOf, ownRow, parentRow } from "./synthetic-processes";
import {
  SYNTHETIC_CACHE_DIR,
  SYNTHETIC_HARNESS_ROOT,
  SYNTHETIC_WHEEL,
  harnessFilesAt,
} from "./synthetic-data";

export const BIN = "/opt/semgrep/bin/semgrep";
export const FLAG = "--allow-real-semgrep";
export const ENV_NAME = "MOAI_SEMGREP_LSP_ALLOW_REAL";
export const WHEEL_PATH = "/artifacts/semgrep-test-only.whl";
export const FIXTURES_ROOT = "/ctl-repo";
/** 잠글 트리는 부모 폴더가 있어야 한다(메모리 잠금은 루트 바로 아래 한 단계 경로를 TREE_UNRESOLVABLE로 거절한다). */
export const CONTROL_TREE = "/ctl/tree";
export const WORK_ROOT = "/work";
export const EVIDENCE_ROOT = "/evidence";
export const SUITE_ID = "nc-cli-1";

export interface CliWorldOptions {
  /** 방지 장치 환경변수. 기본은 통과(1). */
  env?: Record<string, string>;
  /** 사례 작업 공간(`<work-root>/<run-id>`)의 엔진 반응. 생략하면 R6·R8만 가정 반응이고 나머지는 기준(깨끗한) 반응이다. */
  engine?: (key: RunKey) => Reaction | undefined;
  /** 버전 확인이 낸 문자열. 생략하면 핀의 버전이다. null이면 버전 확인 자식을 띄우지 못한다. */
  versionOutput?: string | null;
  /** 휠 해시 결과. 생략하면 핀과 같은 합성 값이다. */
  wheelSha256?: string;
  /** 프로세스 목록 조회 어댑터(합성). 생략하면 우리 프로세스와 부모뿐인 목록이다. */
  lister?: ProcessLister;
  receiver?: () => FakeMetricsReceiver;
  /** 포트가 알리는 출처. 생략하면 "stub"이다. */
  portProvenance?: Provenance;
  /** 사례 작업 공간 밖(제어 대조 실행)의 LSP 서버가 쓸 스캔 트리. 생략하면 CONTROL_TREE다. */
  controlTree?: string;
  /** true를 돌려주면 그 사례의 서버 기동이 던진다(실행 실패 재현). */
  failServer?: (key: RunKey) => boolean;
}

export interface CliWorld {
  deps: CliDeps;
  fs: MemoryFs;
  clock: VirtualClock;
  lock: MemoryRunLock;
  hasher: MemoryArtifactHasher;
  control: ControlWorld;
  out: string[];
  err: string[];
  portCalls: Provenance[];
  /** 버전 확인(`--version`) 호출. */
  versionCalls: SpawnSpec[];
  /** LSP 서버 호출(사례 작업 공간과 control 실행 모두). */
  serverCalls: SpawnSpec[];
  receivers: FakeMetricsReceiver[];
  /** 읽기·쓰기가 닿은 경로(원본 규칙·대조 예제가 쓰이지 않았는지 보는 데 쓴다). */
  writes: string[];
}

const WORK_CASE = /^(.*)\/([^/]+)$/;

/** 작업 공간 이름 `<suite>-<id 소문자>-<layer>` 또는 `<suite>-baseline`에서 사례 키를 읽는다. 읽을 수 없으면 null. */
function keyOfWorkspace(cwd: string): RunKey | null {
  const m = WORK_CASE.exec(cwd);
  if (!m || m[1] !== WORK_ROOT) return null;
  const runId = m[2];
  const base = { runId, root: cwd, treeRoot: `${cwd}/tree` };
  const parts = /^.+-(r[1-9])-(preflight|engine)$/.exec(runId);
  if (parts) return { ...base, id: parts[1].toUpperCase(), layer: parts[2] as RunKey["layer"] };
  return { ...base, id: "baseline", layer: "engine" };
}

/** 대조 예제(.in) 바이트는 이 파일이 읽지 않는다(노드 fs를 쓰지 않는다) — 시험 파일이 읽어서 넘긴다. */
export function makeCliWorld(
  fixtureBytes: (fixture: string) => Uint8Array,
  options: CliWorldOptions = {}
): CliWorld {
  const control = buildControlWorld(fixtureBytes);
  const data = control.data;
  const files: Record<string, string | Uint8Array> = {};
  for (const [name, text] of Object.entries(data.dataFiles)) {
    files[`${SYNTHETIC_HARNESS_ROOT}/data/${name}`] = text;
  }
  Object.assign(files, harnessFilesAt(SYNTHETIC_HARNESS_ROOT));
  for (const [rel, text] of Object.entries(data.cacheFiles)) {
    files[`/cache/${SYNTHETIC_CACHE_DIR}/${rel}`] = text;
  }
  for (const c of data.controlExpectations.cases) {
    files[`${FIXTURES_ROOT}/${c.fixture}`] = fixtureBytes(c.fixture);
  }
  files[BIN] = "placeholder, not a binary\n";

  const memory = new MemoryFs(files);
  const writes: string[] = [];
  const fs = {
    readFile: (p: string) => memory.readFile(p),
    writeFileExclusive: async (p: string, d: Uint8Array) => {
      writes.push(p);
      return memory.writeFileExclusive(p, d);
    },
    mkdirp: async (p: string) => {
      writes.push(p);
      return memory.mkdirp(p);
    },
    listFilesRecursive: (r: string) => memory.listFilesRecursive(r),
    exists: (p: string) => memory.exists(p),
    physicalKey: (p: string) => memory.physicalKey(p),
  };

  const clock = new VirtualClock();
  const lock = new MemoryRunLock();
  const hasher = new MemoryArtifactHasher();
  hasher.forcedResult = { sha256: options.wheelSha256 ?? SYNTHETIC_WHEEL, sizeBytes: 31 };
  const out: string[] = [];
  const err: string[] = [];
  const portCalls: Provenance[] = [];
  const versionCalls: SpawnSpec[] = [];
  const serverCalls: SpawnSpec[] = [];
  const receivers: FakeMetricsReceiver[] = [];
  const versionText =
    options.versionOutput === undefined ? `${data.pin.semgrep.version}\n` : options.versionOutput;
  const env = options.env ?? { [ENV_NAME]: "1" };

  const versionChild = (): ChildHandle => {
    const child = new FakeChild();
    child.emitStdout(versionText ?? "");
    child.exit(0, null);
    return child;
  };

  const deps: CliDeps = {
    fs,
    makeGit: (): GitPort => {
      throw new Error("시험: control 모드와 negative-control은 git을 쓰지 않는다");
    },
    makeProcessPort: (provenance): ProcessPort => {
      portCalls.push(provenance);
      return {
        provenance: options.portProvenance ?? "stub",
        async spawn(spec) {
          if (spec.args.length === 1 && spec.args[0] === "--version") {
            versionCalls.push(spec);
            if (versionText === null) throw new Error("시험: 버전 확인 실행 파일을 띄우지 못한다");
            return versionChild();
          }
          serverCalls.push(spec);
          const cwd = spec.cwd ?? "";
          const key = keyOfWorkspace(cwd);
          if (key && options.failServer?.(key)) throw new Error("시험: 서버를 띄우지 못한다");
          const treeRoot = key ? key.treeRoot : (options.controlTree ?? CONTROL_TREE);
          const reaction = key
            ? options.engine
              ? options.engine(key)
              : assumedEngine(control, key)
            : undefined;
          const { port } = stubPort(
            control.scriptFor(treeRoot, reaction?.patch ?? {}, reaction?.spec ?? {}),
            clock
          );
          return port.spawn(spec);
        },
      };
    },
    clock,
    runLock: lock,
    startMetricsReceiver: async () => {
      const receiver = options.receiver ? options.receiver() : new FakeMetricsReceiver();
      receivers.push(receiver);
      return receiver;
    },
    hashArtifact: hasher,
    makeProcessLister: (): ProcessLister => options.lister ?? listerOf([ownRow(), parentRow()]),
    ownPid: OWN_PID,
    stdout: (text) => void out.push(text),
    stderr: (text) => void err.push(text),
    getEnv: (name) => env[name],
    dataDir: `${SYNTHETIC_HARNESS_ROOT}/data`,
    platform: "linux",
  };
  return {
    deps,
    fs: memory,
    clock,
    lock,
    hasher,
    control,
    out,
    err,
    portCalls,
    versionCalls,
    serverCalls,
    receivers,
    writes,
  };
}

export const argvNegativeControl = (extra: readonly string[] = []): string[] => [
  "negative-control",
  "--suite-id",
  SUITE_ID,
  "--rules-cache",
  `/cache/${SYNTHETIC_CACHE_DIR}`,
  "--evidence-root",
  EVIDENCE_ROOT,
  "--work-root",
  WORK_ROOT,
  "--control-fixtures-root",
  FIXTURES_ROOT,
  "--wheel-artifact",
  WHEEL_PATH,
  FLAG,
  "--semgrep-bin",
  BIN,
  ...extra,
];

export const argvControlRun = (runId: string, extra: readonly string[] = []): string[] => [
  "run",
  "--mode",
  "control",
  "--run-id",
  runId,
  "--rules-cache",
  `/cache/${SYNTHETIC_CACHE_DIR}`,
  "--evidence-root",
  EVIDENCE_ROOT,
  "--control-fixtures-root",
  FIXTURES_ROOT,
  "--control-tree-root",
  CONTROL_TREE,
  "--wheel-artifact",
  WHEEL_PATH,
  ...extra,
  FLAG,
  "--semgrep-bin",
  BIN,
];
