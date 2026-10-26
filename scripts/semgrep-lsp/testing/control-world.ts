// 시험 지원: 음성 대조 실행기를 돌리는 합성 세계(메모리 파일 시스템 + 스텁 엔진). 실제 Semgrep도, 실제 규칙 YAML도 아니다 —
// 규칙 파일은 자리표시 줄 하나짜리이고 엔진은 스크립트대로 로그를 내는 스텁이다. 여기서 얻은 결과는 실행기·판정·기록 연결이 합성
// 입력에서 의도대로 동작한다는 뜻일 뿐 실제 엔진의 반응이나 탐지의 증거가 아니다(provenance는 항상 "stub"이다).
//
// 대조 예제(.in) 바이트는 이 파일이 읽지 않는다(노드 fs·예제 경로를 쓰지 않는다) — 시험 파일이 읽어서 넘긴다.
//
// 공개 API:
//   buildControlWorld(fixtureBytes): ControlWorld
//   controlTreeSpec(world, treeRoot): HappySpec           control 모드 기준 스펙(양성 사례는 필수 code를 게시한다)

import type { SessionLimits } from "../session";
import type { ControlExpectations, ProcessPort, SpawnSpec } from "../types";
import {
  SYNTHETIC_CACHE_DIR,
  SYNTHETIC_HARNESS_ROOT,
  buildSyntheticData,
  harnessFilesAt,
  type SyntheticData,
} from "./synthetic-data";
import { happyScript, type StubPatch, type StubScript } from "./stub-lsp";
import type { HappySpec } from "./transcript-builder";

export interface ControlWorld {
  data: SyntheticData;
  /** MemoryFs 초기 내용(원본 데이터·규칙 캐시·대조 예제·하네스 구현 파일). 경로는 아래 paths 기준이다. */
  files: Record<string, string | Uint8Array>;
  paths: {
    dataDir: string;
    harnessRoot: string;
    rulesCacheRoot: string;
    fixturesRoot: string;
    evidenceRoot: string;
    workRoot: string;
  };
  limits: SessionLimits;
  settings: { timeout: number; timeoutThreshold: number };
  cacheDir: string;
  expectations: ControlExpectations;
  spawn: { command: string; args: readonly string[] };
  /** 기준(깨끗한) control 실행의 스텁 스크립트. 스크립트 패치로 엔진의 반응을, 스펙 패치로 게시 내용을 바꾼다. */
  scriptFor(treeRoot: string, patch?: StubPatch, specPatch?: Partial<HappySpec>): StubScript;
}

export function controlTreeSpec(world: ControlWorld, treeRoot: string): HappySpec {
  const diagnostics: Record<string, { severity: number; code: string; message: string }[]> = {};
  let total = 0;
  for (const c of world.expectations.cases) {
    diagnostics[c.path] = c.required.map((code) => ({ severity: 2, code, message: "m" }));
    total += c.required.length;
  }
  const paths = world.expectations.cases.map((c) => c.path);
  return {
    mode: "control",
    scanRoot: treeRoot,
    expectedPaths: paths,
    loadingPaths: world.data.rulesFiles.map((f) => `${SYNTHETIC_CACHE_DIR}/${f.path}`),
    serverVersion: world.data.pin.semgrep.version,
    n: world.data.ruleModel.length,
    s: 0,
    k: paths.length,
    m: total,
    diagnostics,
  };
}

export function buildControlWorld(fixtureBytes: (fixture: string) => Uint8Array): ControlWorld {
  const data = buildSyntheticData();
  const paths = {
    dataDir: "/data",
    harnessRoot: SYNTHETIC_HARNESS_ROOT,
    rulesCacheRoot: `/cache/${SYNTHETIC_CACHE_DIR}`,
    fixturesRoot: "/repo",
    evidenceRoot: "/evidence",
    workRoot: "/work",
  };
  const files: Record<string, string | Uint8Array> = {};
  for (const [name, text] of Object.entries(data.dataFiles))
    files[`${paths.dataDir}/${name}`] = text;
  for (const [rel, text] of Object.entries(data.cacheFiles)) {
    files[`${paths.rulesCacheRoot}/${rel}`] = text;
  }
  for (const c of data.controlExpectations.cases) {
    files[`${paths.fixturesRoot}/${c.fixture}`] = fixtureBytes(c.fixture);
  }
  Object.assign(files, harnessFilesAt(paths.harnessRoot));

  const world: ControlWorld = {
    data,
    files,
    paths,
    limits: { init: 1000, rules: 2000, scan: 5000, echo: 1500, exit: 3000, killGrace: 200 },
    settings: { timeout: 5, timeoutThreshold: 3 },
    cacheDir: SYNTHETIC_CACHE_DIR,
    expectations: data.controlExpectations,
    spawn: { command: "/stub/semgrep", args: ["lsp"] },
    scriptFor: (treeRoot, patch = {}, specPatch = {}) =>
      happyScript({ ...controlTreeSpec(world, treeRoot), ...specPatch }, patch),
  };
  return world;
}

/** 프로세스 포트를 "real이라고 주장하는" 포트로 감싼다. 합성 기록이 참조 자격 계산의 출처 조건을 통과하는 경로를 시험하려는 것뿐이다. */
export function declaredRealPort(inner: ProcessPort): ProcessPort {
  return {
    provenance: "real",
    spawn: (spec: SpawnSpec) => inner.spawn(spec),
  };
}
