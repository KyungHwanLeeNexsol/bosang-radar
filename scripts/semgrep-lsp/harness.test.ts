import { readFileSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { VirtualClock } from "./clock";
import { createNodeFs } from "./fs-node";
import { acquireRunLock, releaseRunLock } from "./run-lock";
import { createNodeRunLockPort } from "./run-lock-node";
import { routedFs } from "./testing/routed-fs";
import { REASON_EMITTERS } from "./evaluate";
import { DEFAULT_NOT_EXECUTED, EVIDENCE_FILE_NAMES, canonicalJson } from "./evidence";
import { buildBinding } from "./fingerprint";
import { runHarness, toControlReference, type HarnessOptions, type HarnessResult } from "./harness";
import { startMetricsReceiver, type MetricsReceiver } from "./metrics-node";
import { controlReferenceFromValue, loadControlReference } from "./reference-record";
import { buildInitializationOptions } from "./settings";
import {
  deriveFinalId,
  expectedFinalIdsSha256,
  expectedRulesSha256,
  rulesListSha256,
} from "./rules-manifest";
import { computeScope } from "./scope";
import { gitBlobSha1, sha256Hex } from "./sha";
import { representativeStatus, type ReasonCode } from "./status";
import { syntheticControlRunRecord } from "./testing/control-record-fixtures";
import { recorded } from "./testing/call-recorder";
import { FakeMetricsReceiver } from "./testing/fake-metrics";
import { FakeChild, FakePort } from "./testing/fake-process";
import { canConnectLoopback, sendLoopbackRequest } from "./testing/loopback-client";
import { MemoryFs } from "./testing/memory-fs";
import { MemoryGit } from "./testing/memory-git";
import { INVALID_RUN_IDS, VALID_RUN_IDS } from "./testing/run-id-cases";
import { summaryOf } from "./testing/observation-fixtures";
import { foreignSummaryOf } from "./testing/synthetic-processes";
import { qualifiedReference } from "./testing/evaluate-fixtures";
import {
  SYNTHETIC_HARNESS_ROOT,
  harnessFilesAt,
  syntheticFingerprints,
} from "./testing/synthetic-data";
import {
  StubLsp,
  drive,
  happyScript,
  stubPort,
  type StubPatch,
  type StubScript,
} from "./testing/stub-lsp";
import type { HappySpec } from "./testing/transcript-builder";
import type {
  ChildHandle,
  ControlExpectations,
  ExpectedRule,
  FsPort,
  Pin,
  ProcessPort,
  RuleFileEntry,
  RunRecord,
  ScopeConfig,
  SpawnSpec,
} from "./types";

// 이 시험의 모든 실행은 메모리 스텁(FakeChild + 스크립트 서버)과 MemoryFs·MemoryGit 위에서 돈다. 규칙 YAML·대상
// 저장소·대조 트리는 전부 합성이며 실제 Semgrep의 동작·탐지·Windows 호환성의 증거가 아니다.

function dataText(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./data/${name}`, import.meta.url)), "utf8");
}

const realPin = JSON.parse(dataText("pin.json")) as Pin;
const scopeConfig = JSON.parse(dataText("scope.json")) as ScopeConfig;
const controlExpectations = JSON.parse(
  dataText("control-expectations.json")
) as ControlExpectations;

const enc = new TextEncoder();
const WHEEL = "b".repeat(64);
const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const SHA_UNKNOWN = "c".repeat(40);
const CACHE_DIR = "semgrep-rules";

// ── 합성 규칙 모델: 대조 사례가 요구하는 최종 ID마다 자리표시 YAML 파일 하나 ───────────

const requiredIds = [...new Set(controlExpectations.cases.flatMap((c) => c.required))].sort();
const ruleModel: ExpectedRule[] = requiredIds
  .map((id) => {
    const rest = id.slice(`${CACHE_DIR}.`.length);
    const dot = rest.lastIndexOf(".");
    const original = rest.slice(dot + 1);
    const file = `${rest.slice(0, dot).split(".").join("/")}/${original}.yaml`;
    const rule: ExpectedRule = {
      file,
      originalId: original,
      finalId: deriveFinalId(file, original, CACHE_DIR),
      languages: ["javascript", "typescript"],
      mode: "search",
      severity: "WARNING",
    };
    return rule;
  })
  .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));

const ruleContent = (file: string): string => `# placeholder ${file}\n`;
const rulesFiles: RuleFileEntry[] = ruleModel.map((r) => ({
  path: r.file,
  blobSha: gitBlobSha1(enc.encode(ruleContent(r.file))),
}));

const syntheticPin: Pin = {
  ...realPin,
  semgrep: {
    ...realPin.semgrep,
    wheel: { ...realPin.semgrep.wheel, sha256: WHEEL, verified: true },
  },
  rules: {
    ...realPin.rules,
    yaml_files: rulesFiles.length,
    yaml_list_sha256: rulesListSha256(rulesFiles),
    expected_rules: ruleModel.length,
    expected_rules_sha256: expectedRulesSha256(ruleModel),
    expected_final_ids_sorted_sha256: expectedFinalIdsSha256(ruleModel),
    distinct_original_ids: new Set(ruleModel.map((r) => r.originalId)).size,
    duplicate_original_id_groups: 0,
  },
  n0: {
    expected: ruleModel.length,
    observed: ruleModel.length,
    confirmed: true,
    value: ruleModel.length,
  },
};
const pinText = JSON.stringify(syntheticPin, null, 2);
const PIN_SHA256 = sha256Hex(enc.encode(pinText));

const rulesFilesTsv = rulesFiles.map((f) => `${f.path}\t${f.blobSha}\n`).join("");
const rulesExpectedTsv = ruleModel
  .map(
    (r) =>
      [r.file, r.originalId, r.finalId, r.languages.join("+"), r.mode, r.severity].join("\t") + "\n"
  )
  .join("");

// ── 합성 대상 저장소: 두 커밋의 파일 집합이 다르다(추가·삭제·이름 바꿈) ─────────────────

const reposByCommit: Record<string, Record<string, string>> = {
  [SHA_A]: {
    "src/a.ts": "export const a = 1;\n",
    "src/b.tsx": "export const b = 2;\n",
    "src/d.ts": "export const d = 4;\n",
    "README.md": "# readme\n",
  },
  [SHA_B]: {
    "src/a.ts": "export const a = 1;\n",
    // src/b.tsx 삭제
    "src/c.ts": "export const c = 3;\n", // 추가
    "src/e.ts": "export const d = 4;\n", // src/d.ts의 이름 바꿈(내용 같음)
    "README.md": "# readme\n",
  },
};
const EXPECTED_E: Record<string, string[]> = {
  [SHA_A]: ["src/a.ts", "src/b.tsx", "src/d.ts"],
  [SHA_B]: ["src/a.ts", "src/c.ts", "src/e.ts"],
};

function fixtureBytes(fixture: string): Uint8Array {
  return readFileSync(fileURLToPath(new URL(`../../${fixture}`, import.meta.url)));
}

function baseFiles(): Record<string, string | Uint8Array> {
  const files: Record<string, string | Uint8Array> = {
    "/data/pin.json": pinText,
    "/data/scope.json": dataText("scope.json"),
    "/data/rules-files.tsv": rulesFilesTsv,
    "/data/rules-expected.tsv": rulesExpectedTsv,
    "/data/control-expectations.json": dataText("control-expectations.json"),
  };
  for (const r of ruleModel) files[`/cache/${CACHE_DIR}/${r.file}`] = ruleContent(r.file);
  for (const c of controlExpectations.cases) files[`/repo/${c.fixture}`] = fixtureBytes(c.fixture);
  Object.assign(files, harnessFilesAt()); // 하네스 지문이 읽는 합성 구현 파일
  return files;
}

const LIMITS = { init: 1000, rules: 2000, scan: 5000, echo: 1500, exit: 3000, killGrace: 200 };
/** 이 환경에서 하네스가 계산할 이번 실행의 지문(순수 계산). 합성 대조 참조는 이 지문과 일치하도록 만든다. */
const SYNTHETIC_FINGERPRINTS = syntheticFingerprints({
  toolVersion: syntheticPin.semgrep.version,
  wheelSha256: WHEEL,
  pinSha256: PIN_SHA256,
  rulesListSha256: syntheticPin.rules.yaml_list_sha256,
  rulesExpectedSha256: syntheticPin.rules.expected_rules_sha256,
  expectationsText: dataText("control-expectations.json"),
  controlExpectations,
  fixtureBytes,
});
// 음성 대조 16개가 모두 PASS이고 지문이 일치하는 "가정"의 real 대조 참조. 실제 실행으로 얻은 것이 아니다.
const SYNTHETIC_REAL_REFERENCE = qualifiedReference(SYNTHETIC_FINGERPRINTS, {
  run_id: "control-ref-synthetic",
  pin_sha256: PIN_SHA256,
});

interface Env {
  fs: MemoryFs;
  clock: VirtualClock;
  port: FakePort;
  stubs: StubLsp[];
  script: StubScript;
  options: HarnessOptions;
  go: () => Promise<HarnessResult>;
}

interface EnvInput {
  mode: "target" | "control";
  sha?: string;
  patch?: StubPatch;
  options?: Partial<HarnessOptions>;
  files?: Record<string, string | Uint8Array>;
  /** 이 파일들은 만들지 않는다. */
  without?: string[];
  scanRoot?: string;
  controlTreeRoot?: string;
  /** 실제 디스크 I/O가 섞인 실행이다: 가상 시계만 돌리지 않고 실제 I/O가 끝나기를 기다린다. */
  realIo?: boolean;
  wrapFs?: (inner: MemoryFs) => FsPort;
  wrapPort?: (inner: FakePort) => ProcessPort;
  gitCommits?: ConstructorParameters<typeof MemoryGit>[0];
}

async function makeEnv(input: EnvInput): Promise<Env> {
  const files = { ...baseFiles(), ...(input.files ?? {}) };
  for (const path of input.without ?? []) delete files[path];
  const memory = new MemoryFs(files);
  const git = new MemoryGit(input.gitCommits ?? reposByCommit);
  const clock = new VirtualClock();
  const sha = input.sha ?? SHA_A;
  const scanRoot = input.scanRoot ?? `/scan/${sha.slice(0, 7)}`;
  const controlTreeRoot = input.controlTreeRoot ?? "/ctl";

  let spec: HappySpec;
  if (input.mode === "target") {
    const known = (input.gitCommits ?? reposByCommit) as Record<string, unknown>;
    const paths =
      sha in known ? (await computeScope(git, sha, scopeConfig)).included.map((e) => e.path) : [];
    spec = {
      mode: "target",
      scanRoot,
      expectedPaths: paths,
      loadingPaths: rulesFiles.map((f) => `${CACHE_DIR}/${f.path}`),
      serverVersion: syntheticPin.semgrep.version,
      n: ruleModel.length,
      s: 0,
      k: paths.length,
      m: 0,
    };
  } else {
    const diagnostics: Record<string, { severity: number; code: string; message: string }[]> = {};
    let total = 0;
    for (const c of controlExpectations.cases) {
      diagnostics[c.path] = c.required.map((code) => ({ severity: 2, code, message: "m" }));
      total += c.required.length;
    }
    const paths = controlExpectations.cases.map((c) => c.path);
    spec = {
      mode: "control",
      scanRoot: controlTreeRoot,
      expectedPaths: paths,
      loadingPaths: rulesFiles.map((f) => `${CACHE_DIR}/${f.path}`),
      serverVersion: syntheticPin.semgrep.version,
      n: ruleModel.length,
      s: 0,
      k: paths.length,
      m: total,
      diagnostics,
    };
  }
  const script = happyScript(spec, input.patch ?? {});
  const { port, stubs } = stubPort(script, clock);
  const spawn: SpawnSpec = {
    command: "/stub/semgrep",
    args: ["lsp"],
    cwd: "/cache",
    env: { PATH: "/usr/bin" },
  };
  const options: HarnessOptions = {
    mode: input.mode,
    targetSha: input.mode === "target" ? sha : null,
    runId: "run-harness-1",
    dataDir: "/data",
    harnessRoot: SYNTHETIC_HARNESS_ROOT,
    evidenceRoot: "/evidence",
    rulesCacheRoot: `/cache/${CACHE_DIR}`,
    scanRoot,
    controlFixturesRoot: "/repo",
    controlTreeRoot,
    spawn,
    limits: LIMITS,
    settings: { timeout: 5, timeoutThreshold: 3 },
    controlReference: input.mode === "target" ? SYNTHETIC_REAL_REFERENCE : null,
    toolVersionObserved: syntheticPin.semgrep.version,
    wheelSha256Observed: WHEEL,
    lockHeld: true,
    foreignServerProcesses: 0,
    metricsReceiverHits: 0,
    ...(input.options ?? {}),
  };
  const fs: FsPort = input.wrapFs ? input.wrapFs(memory) : memory;
  const process: ProcessPort = input.wrapPort ? input.wrapPort(port) : port;
  return {
    fs: memory,
    clock,
    port,
    stubs,
    script,
    options,
    go: () =>
      (input.realIo ? driveWithRealIo : drive)(
        clock,
        runHarness({ fs, git, process, clock }, options)
      ),
  };
}

/**
 * drive()의 실제 I/O 판. 실제 디스크 I/O는 이벤트 루프 밖에서 끝나므로 약속 연쇄만 비워서는 기다릴 수 없다. 가상 타이머가 남아
 * 있으면(세션이 한도를 기다리는 중) 시간을 보내고, 없으면 실제로 잠깐 기다리며 I/O가 끝나기를 본다.
 */
async function driveWithRealIo<T>(clock: VirtualClock, promise: Promise<T>): Promise<T> {
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
    else await new Promise<void>((resolve) => setTimeout(resolve, 2));
  }
  if (!done) throw new Error("실행이 끝나지 않았다(실제 I/O를 기다려도 약속이 이행되지 않는다)");
  return promise;
}

async function evidenceFiles(env: Env, runId = "run-harness-1"): Promise<Record<string, string>> {
  const dec = new TextDecoder();
  const out: Record<string, string> = {};
  for (const name of EVIDENCE_FILE_NAMES) {
    const path = `/evidence/${runId}/${name}`;
    if (await env.fs.exists(path)) out[name] = dec.decode(await env.fs.readFile(path));
  }
  return out;
}

function reasonCodes(r: HarnessResult): ReasonCode[] {
  return [...new Set((r.record?.measurement.reasons ?? []).map((x) => x.code))].sort();
}

/** 어떤 결과든 지켜져야 하는 일관성: complete는 증거 9개가 모두 쓰인 뒤에만 나온다. */
async function expectNeverCompleteWithoutEvidence(env: Env, r: HarnessResult): Promise<void> {
  if (r.record?.measurement.complete === true) {
    expect(r.ok).toBe(true);
    expect(r.evidence?.files.map((f) => f.name)).toEqual([...EVIDENCE_FILE_NAMES]);
    expect(Object.keys(await evidenceFiles(env))).toEqual([...EVIDENCE_FILE_NAMES]);
  }
  if (!r.ok) {
    expect(r.record).toBeNull();
    expect(r.evidence).toBeNull();
    expect(r.failure).toBeDefined();
  }
}

// ── 대조(control) 모드 끝에서 끝까지 ────────────────────────────

describe("runHarness — control 스텁 실행", () => {
  it("대조 트리를 정적 입력으로 만들고 사전 검사 → 세션 → 판정 → 증거까지 돈다", async () => {
    const env = await makeEnv({ mode: "control" });
    const r = await env.go();
    expect(r.failure).toBeUndefined();
    expect(r.ok).toBe(true);
    expect(r.started).toBe(true);
    expect(env.port.spawnCalls).toHaveLength(1);
    const rec = r.record as RunRecord;
    expect(rec.mode).toBe("control");
    // 스텁 실행: provenance stub, trust SYNTHETIC, 후보 평가는 UNVERIFIED.
    expect(rec.provenance).toBe("stub");
    expect(rec.trust).toBe("SYNTHETIC");
    expect(rec.candidate_gate.evaluation).toBe("UNVERIFIED");
    expect(rec.candidate_gate.value).toBeNull();
    expect(rec.candidate_gate.applicable).toBe(false);
    // 단언은 PASS일 수 있고, 관측 합계는 0보다 크다(양성 사례가 탐지된 합성 세계).
    expect(rec.measurement.status).toBe("COMPLETE");
    expect(rec.control_assertions.status).toBe("PASS");
    expect((rec.observed.totals?.total ?? 0) > 0).toBe(true);
    expect(rec.control_reference).toBeNull();
    expect(rec.inputs.target_sha).toBeNull();
    expect(rec.inputs.scope_sha256).toBeNull();
    expect(rec.inputs.control_tree_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(rec.inputs.pin_sha256).toBe(PIN_SHA256);
    expect(rec.inputs.rules_list_sha256).toBe(syntheticPin.rules.yaml_list_sha256);
    expect(rec.inputs.rules_expected_sha256).toBe(syntheticPin.rules.expected_rules_sha256);
    expect(rec.measurement.phases_reached).toEqual(["PH0", "PH1", "PH2", "PH3", "PH4"]);
    await expectNeverCompleteWithoutEvidence(env, r);
  });

  it("대조 트리는 정적 입력의 바이트를 실제 확장자 이름으로 복사한 것이다(실행하지 않는다)", async () => {
    const env = await makeEnv({ mode: "control" });
    await env.go();
    for (const c of controlExpectations.cases) {
      const copied = await env.fs.readFile(`/ctl/${c.path}`);
      expect(sha256Hex(copied)).toBe(c.sha256);
    }
  });

  it("서버가 받은 initialize에는 허용 키만 든 initializationOptions와 스캔 루트가 실린다", async () => {
    const env = await makeEnv({ mode: "control" });
    await env.go();
    const init = env.stubs[0].received[0];
    expect(init.method).toBe("initialize");
    const params = init.params as {
      rootUri: string;
      initializationOptions: unknown;
      workspaceFolders: { uri: string }[];
    };
    expect(params.rootUri).toBe("file:///ctl");
    expect(params.workspaceFolders[0].uri).toBe("file:///ctl");
    expect(params.initializationOptions).toEqual(
      buildInitializationOptions({
        configuration: syntheticPin.rules.config_dirs,
        maxTargetBytes: scopeConfig.max_target_bytes,
        timeout: 5,
        timeoutThreshold: 3,
      })
    );
    const opts = params.initializationOptions as {
      scan: { ci: boolean };
      metrics: { enabled: boolean };
    };
    expect(opts.scan.ci).toBe(false);
    expect(opts.metrics.enabled).toBe(false);
    // 규칙 출처는 로컬 디렉터리뿐이다(레지스트리 auto·r/·p/ 없음).
    expect(JSON.stringify(opts)).not.toMatch(/"auto"|"r\/|"p\//);
  });

  it("control 실행 직후의 요약은 스텁이므로 target의 대조 참조로 쓸 수 없다(CONTROL_REFERENCE_SYNTHETIC)", async () => {
    const control = await makeEnv({ mode: "control" });
    const c = await control.go();
    const reference = toControlReference(c.record as RunRecord, true);
    expect(reference.provenance).toBe("stub");
    expect(reference.status).toBe("COMPLETE");
    expect(reference.control_assertions_status).toBe("PASS");

    const target = await makeEnv({ mode: "target", options: { controlReference: reference } });
    const t = await target.go();
    expect(t.ok).toBe(true);
    const rec = t.record as RunRecord;
    expect(rec.measurement.status).toBe("CONTROL_MISSING");
    expect(reasonCodes(t)).toContain("CONTROL_REFERENCE_SYNTHETIC");
    expect(rec.measurement.complete).toBe(false);
    expect(rec.candidate_gate.value).toBeNull();
    expect(rec.control_reference).toEqual(reference);
    await expectNeverCompleteWithoutEvidence(target, t);
  });

  it("toControlReference는 target 레코드를 거부한다", async () => {
    const target = await makeEnv({ mode: "target" });
    const t = await target.go();
    expect(() => toControlReference(t.record as RunRecord, true)).toThrow(TypeError);
  });
});

// ── 대상(target) 모드 ───────────────────────────────────────────

describe("runHarness — target 스텁 실행", () => {
  it("합성 대조 참조가 맞으면 value 0이지만 평가는 UNVERIFIED다(스텁)", async () => {
    const env = await makeEnv({ mode: "target" });
    const r = await env.go();
    expect(r.ok).toBe(true);
    const rec = r.record as RunRecord;
    expect(rec.mode).toBe("target");
    expect(rec.provenance).toBe("stub");
    expect(rec.trust).toBe("SYNTHETIC");
    expect(rec.measurement.status).toBe("COMPLETE");
    expect(rec.candidate_gate.applicable).toBe(true);
    expect(rec.candidate_gate.value).toBe(0);
    expect(rec.candidate_gate.evaluation).toBe("UNVERIFIED");
    expect(rec.candidate_gate.policy_accepted).toBe(false);
    expect(rec.candidate_gate.counts_as_lsp_security_warnings).toBe(false);
    expect(rec.control_assertions.applicable).toBe(false);
    expect(rec.control_reference).toEqual(SYNTHETIC_REAL_REFERENCE);
    expect(rec.inputs.target_sha).toBe(SHA_A);
    expect(rec.inputs.scope_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(rec.inputs.control_tree_sha256).toBeNull();
    await expectNeverCompleteWithoutEvidence(env, r);
  });

  it("대조 참조가 없으면(null) CONTROL_MISSING이고 value는 null이다", async () => {
    const env = await makeEnv({ mode: "target", options: { controlReference: null } });
    const r = await env.go();
    const rec = r.record as RunRecord;
    expect(rec.measurement.status).toBe("CONTROL_MISSING");
    expect(reasonCodes(r)).toContain("CONTROL_REFERENCE_MISSING");
    expect(rec.candidate_gate.value).toBeNull();
  });

  it("캘러가 관측하지 못한 사실(null)은 해당 fail-closed 사유가 되어 서버를 띄우지 않는다", async () => {
    const cases: [Partial<HarnessOptions>, ReasonCode][] = [
      [{ toolVersionObserved: null }, "TOOL_VERSION_UNVERIFIED"],
      [{ wheelSha256Observed: null }, "WHEEL_HASH_UNVERIFIED"],
      [{ lockHeld: null }, "LOCK_NOT_ACQUIRED"],
      [{ foreignServerProcesses: null }, "FOREIGN_SERVER_PROCESS"],
    ];
    for (const [patch, code] of cases) {
      const env = await makeEnv({ mode: "target", options: patch });
      const r = await env.go();
      expect(r.started, code).toBe(false);
      expect(env.port.spawnCalls, code).toHaveLength(0);
      expect(reasonCodes(r), code).toContain(code);
      expect(r.record?.measurement.status, code).toBe("ENV_MISMATCH");
    }
  });

  it("metricsReceiverHits가 null이면 서버는 뜨지만 ISOLATION_VIOLATION이고, 0이 아니면 HIT이다", async () => {
    const none = await makeEnv({ mode: "target", options: { metricsReceiverHits: null } });
    const a = await none.go();
    expect(a.started).toBe(true);
    expect(a.record?.measurement.status).toBe("ISOLATION_VIOLATION");
    expect(reasonCodes(a)).toContain("METRICS_RECEIVER_NOT_OBSERVING");

    const hit = await makeEnv({ mode: "target", options: { metricsReceiverHits: 2 } });
    const b = await hit.go();
    expect(reasonCodes(b)).toContain("METRICS_RECEIVER_HIT");
    expect(b.record?.measurement.complete).toBe(false);
  });

  it("두 대상 SHA의 파일 집합이 다르면(추가·삭제·이름 바꿈) E와 스캔 트리가 다르고 각각 정상 완료한다", async () => {
    const a = await makeEnv({ mode: "target", sha: SHA_A });
    const ra = await a.go();
    expect(ra.record?.measurement.status).toBe("COMPLETE");
    expect(await a.fs.listFilesRecursive(a.options.scanRoot)).toEqual(EXPECTED_E[SHA_A]);

    // 같은 MemoryFs 안에서 두 번째 SHA를 새 스캔 루트로 돌린다.
    const b = await makeEnv({ mode: "target", sha: SHA_B, options: { runId: "run-harness-b" } });
    const rb = await b.go();
    expect(rb.record?.measurement.status).toBe("COMPLETE");
    expect(await b.fs.listFilesRecursive(b.options.scanRoot)).toEqual(EXPECTED_E[SHA_B]);

    expect(ra.record?.inputs.scope_sha256).not.toBe(rb.record?.inputs.scope_sha256);
    const fa = await evidenceFiles(a);
    const fb = await evidenceFiles(b, "run-harness-b");
    expect(fa["files.expected.txt"]).toBe(EXPECTED_E[SHA_A].map((p) => `${p}\n`).join(""));
    expect(fb["files.expected.txt"]).toBe(EXPECTED_E[SHA_B].map((p) => `${p}\n`).join(""));
    expect(fa["files.published.txt"]).toBe(fa["files.expected.txt"]);
    expect(fb["files.published.txt"]).toBe(fb["files.expected.txt"]);
    expect(fa["files.missing.txt"]).toBe("");
    // K는 E의 크기다.
    expect(ra.record?.observed.scan.scannedFilesK).toBe(EXPECTED_E[SHA_A].length);
    expect(rb.record?.observed.scan.scannedFilesK).toBe(EXPECTED_E[SHA_B].length);
  });

  it("오래된 복사본 스캔 트리(다른 SHA의 트리)는 사전 검사에서 잡혀 서버를 띄우지 않는다", async () => {
    // SHA_A의 트리를 만들어 두고, 같은 위치로 SHA_B를 돌린다 — 새 제품 파일이 없고 지워진 파일이 남아 있다.
    const first = await makeEnv({ mode: "target", sha: SHA_A, scanRoot: "/scan/shared" });
    await first.go();
    const stale = await makeEnv({
      mode: "target",
      sha: SHA_B,
      scanRoot: "/scan/shared",
      options: { runId: "run-stale" },
      files: Object.fromEntries(
        await Promise.all(
          (await first.fs.listFilesRecursive("/scan/shared")).map(async (p) => [
            `/scan/shared/${p}`,
            await first.fs.readFile(`/scan/shared/${p}`),
          ])
        )
      ),
    });
    const r = await stale.go();
    expect(r.ok).toBe(true);
    expect(r.started).toBe(false);
    expect(stale.port.spawnCalls).toHaveLength(0);
    expect(r.record?.measurement.status).toBe("MANIFEST_MISMATCH");
    expect(reasonCodes(r)).toEqual(
      expect.arrayContaining(["SCAN_TREE_FILE_ADDED", "SCAN_TREE_FILE_MISSING"])
    );
    // 스캔 트리를 멋대로 고쳐 쓰지 않았다.
    expect(await stale.fs.listFilesRecursive("/scan/shared")).toEqual(EXPECTED_E[SHA_A]);
    await expectNeverCompleteWithoutEvidence(stale, r);
  });

  it("기존 트리가 E와 정확히 같으면 다시 만들지 않고 그대로 쓴다(검증된 재사용)", async () => {
    const first = await makeEnv({ mode: "target", sha: SHA_A, scanRoot: "/scan/shared" });
    await first.go();
    const files = Object.fromEntries(
      await Promise.all(
        (await first.fs.listFilesRecursive("/scan/shared")).map(async (p) => [
          `/scan/shared/${p}`,
          await first.fs.readFile(`/scan/shared/${p}`),
        ])
      )
    );
    const again = await makeEnv({
      mode: "target",
      sha: SHA_A,
      scanRoot: "/scan/shared",
      options: { runId: "run-reuse" },
      files,
    });
    const r = await again.go();
    expect(r.started).toBe(true);
    expect(r.record?.measurement.status).toBe("COMPLETE");
  });
});

// ── 사전 검사 거부: 서버를 띄우지 않는다 ────────────────────────

describe("runHarness — 사전 검사가 거부하면 띄우지 않는다", () => {
  const preReasons = (r: HarnessResult): ReasonCode[] =>
    reasonCodes(r).filter((c) => ["precheck", "settings"].includes(REASON_EMITTERS[c]));

  async function expectRefusal(
    env: Env,
    expectCodes: ReasonCode[],
    status: string
  ): Promise<HarnessResult> {
    const r = await env.go();
    expect(r.ok).toBe(true);
    expect(r.started).toBe(false);
    expect(env.port.spawnCalls).toHaveLength(0);
    expect(env.stubs).toHaveLength(0);
    const rec = r.record as RunRecord;
    expect(rec.measurement.status).toBe(status);
    expect(rec.measurement.complete).toBe(false);
    expect(reasonCodes(r)).toEqual(expect.arrayContaining(expectCodes));
    // 상태는 사전 검사 사유의 대표 상태와 정확히 같다(시작하지 않은 부수 사유가 앞서지 않는다).
    const pre = rec.measurement.reasons.filter((x) =>
      ["precheck", "settings"].includes(REASON_EMITTERS[x.code])
    );
    expect(pre.length).toBeGreaterThan(0);
    expect(rec.measurement.status).toBe(representativeStatus(pre));
    expect(reasonCodes(r)).not.toContain("INIT_RESPONSE_MISSING");
    expect(rec.candidate_gate.value).toBeNull();
    expect(rec.candidate_gate.evaluation).toBe("UNVERIFIED");
    // 그래도 증거는 쓴다.
    expect(r.evidence?.files.map((f) => f.name)).toEqual([...EVIDENCE_FILE_NAMES]);
    const files = await evidenceFiles(env);
    expect(Object.keys(files)).toEqual([...EVIDENCE_FILE_NAMES]);
    expect(files["stderr.log"]).toBe("");
    expect(files["diagnostics.jsonl"]).toBe("");
    expect(rec.measurement.phases_reached).toEqual(["PH0"]);
    await expectNeverCompleteWithoutEvidence(env, r);
    return r;
  }

  it("R3 꼴: 규칙 캐시에 추가된 파일 → MANIFEST_MISMATCH(RULES_FILE_ADDED)", async () => {
    const env = await makeEnv({
      mode: "target",
      files: { [`/cache/${CACHE_DIR}/javascript/extra/injected.yaml`]: "# injected\n" },
    });
    await expectRefusal(env, ["RULES_FILE_ADDED"], "MANIFEST_MISMATCH");
  });

  it("규칙 파일 변경·삭제도 거부한다", async () => {
    const first = ruleModel[0].file;
    const changed = await makeEnv({
      mode: "target",
      files: { [`/cache/${CACHE_DIR}/${first}`]: "# tampered\n" },
    });
    await expectRefusal(changed, ["RULES_FILE_CHANGED"], "MANIFEST_MISMATCH");
    const removed = await makeEnv({ mode: "target", without: [`/cache/${CACHE_DIR}/${first}`] });
    await expectRefusal(removed, ["RULES_FILE_REMOVED"], "MANIFEST_MISMATCH");
  });

  it("스캔 트리에 새 제품 파일이 빠진 목록(오래된 파일 목록) → SCAN_TREE_FILE_MISSING", async () => {
    // SHA_B의 E는 {a, c, e}인데 스캔 루트에는 a만 있다.
    const env = await makeEnv({
      mode: "target",
      sha: SHA_B,
      scanRoot: "/scan/partial",
      files: { "/scan/partial/src/a.ts": reposByCommit[SHA_B]["src/a.ts"] },
    });
    await expectRefusal(env, ["SCAN_TREE_FILE_MISSING"], "MANIFEST_MISMATCH");
  });

  it("해석되지 않는 대상 SHA → TARGET_SHA_UNRESOLVED (없는 SHA, 약식·브랜치 이름)", async () => {
    for (const rev of [SHA_UNKNOWN, "main", "abc1234"]) {
      const env = await makeEnv({
        mode: "target",
        sha: SHA_UNKNOWN,
        options: { targetSha: rev },
      });
      await expectRefusal(env, ["TARGET_SHA_UNRESOLVED"], "MANIFEST_MISMATCH");
      expect(env.fs).toBeDefined();
    }
  });

  it("target 모드인데 SHA가 없으면(null) 거부한다", async () => {
    const env = await makeEnv({ mode: "target", options: { targetSha: null } });
    await expectRefusal(env, ["TARGET_SHA_UNRESOLVED"], "MANIFEST_MISMATCH");
  });

  it("환경: 앱 토큰·허용 밖 SEMGREP_* → ENV_MISMATCH", async () => {
    const env = await makeEnv({
      mode: "target",
      options: {
        spawn: {
          command: "/stub/semgrep",
          args: ["lsp"],
          cwd: "/cache",
          env: { SEMGREP_APP_TOKEN: "tok-should-never-appear-9f3", SEMGREP_FOO: "x" },
        },
      },
    });
    const r = await expectRefusal(
      env,
      ["APP_TOKEN_PRESENT", "ENV_VAR_NOT_ALLOWED"],
      "ENV_MISMATCH"
    );
    expect(preReasons(r)).toContain("APP_TOKEN_PRESENT");
  });

  it("도구 버전이 핀과 다르면 거부한다", async () => {
    const env = await makeEnv({ mode: "target", options: { toolVersionObserved: "0.0.1" } });
    await expectRefusal(env, ["TOOL_VERSION_MISMATCH"], "ENV_MISMATCH");
  });

  it("허용되지 않는 initializationOptions 키는 SETTINGS_MISMATCH이고 INIT_FAILED가 앞서지 않는다", async () => {
    const opts = buildInitializationOptions({
      configuration: syntheticPin.rules.config_dirs,
      maxTargetBytes: 1000,
      timeout: 5,
      timeoutThreshold: 3,
    });
    const env = await makeEnv({
      mode: "target",
      options: {
        initializationOptions: { ...opts, scan: { ...opts.scan, surprise: true } },
      },
    });
    await expectRefusal(env, ["SETTINGS_KEY_NOT_ALLOWED"], "SETTINGS_MISMATCH");
  });

  it("control: 정적 입력이 바뀌었으면 CONTROL_TREE_MISMATCH로 거부하고 트리를 만들지 않는다", async () => {
    const c = controlExpectations.cases[0];
    const env = await makeEnv({
      mode: "control",
      files: { [`/repo/${c.fixture}`]: "tampered\n" },
    });
    await expectRefusal(env, ["CONTROL_TREE_MISMATCH"], "MANIFEST_MISMATCH");
    expect(await env.fs.listFilesRecursive("/ctl")).toEqual([]);
  });

  it("거부된 실행은 target의 control_reference를 레코드에 그대로 남긴다", async () => {
    const env = await makeEnv({ mode: "target", options: { toolVersionObserved: null } });
    const r = await env.go();
    expect(r.record?.control_reference).toEqual(SYNTHETIC_REAL_REFERENCE);
  });
});

// ── 하드 실패 ───────────────────────────────────────────────────

describe("runHarness — 무결성 예외는 하드 실패다(COMPLETE로 읽히지 않는다)", () => {
  async function expectHard(env: Env, stage: string): Promise<HarnessResult> {
    const r = await env.go();
    expect(r.ok).toBe(false);
    expect(r.failure?.stage).toBe(stage);
    expect(r.record).toBeNull();
    expect(r.evidence).toBeNull();
    expect(env.port.spawnCalls).toHaveLength(0);
    expect(r.started).toBe(false);
    expect(Object.keys(await evidenceFiles(env))).toEqual([]);
    return r;
  }

  it("필수 입력 파일이 없으면 inputs 단계에서 멈춘다", async () => {
    const env = await makeEnv({ mode: "target", without: ["/data/pin.json"] });
    const r = await expectHard(env, "inputs");
    expect(r.failure?.message).toContain("pin.json");
  });

  it("깨진 JSON·스키마 불일치·깨진 TSV", async () => {
    await expectHard(
      await makeEnv({ mode: "target", files: { "/data/pin.json": "{ not json" } }),
      "inputs"
    );
    await expectHard(
      await makeEnv({
        mode: "target",
        files: { "/data/scope.json": JSON.stringify({ schema: "x" }) },
      }),
      "inputs"
    );
    await expectHard(
      await makeEnv({
        mode: "target",
        files: { "/data/rules-files.tsv": "garbage-without-tabs\n" },
      }),
      "inputs"
    );
  });

  it("범위 계산 중 예외(크기를 알 수 없는 blob)는 scope 단계의 하드 실패다", async () => {
    const env = await makeEnv({ mode: "target" });
    const sabotaged = {
      resolveCommit: async (rev: string) => rev,
      lsTree: async () => [
        {
          path: "src/a.ts",
          mode: "100644",
          type: "blob" as const,
          blobSha: "1".repeat(40),
          size: null,
        },
      ],
      readBlob: async () => enc.encode("x"),
    };
    const r = await drive(
      env.clock,
      runHarness({ fs: env.fs, git: sabotaged, process: env.port, clock: env.clock }, env.options)
    );
    expect(r.ok).toBe(false);
    expect(r.failure?.stage).toBe("scope");
    expect(r.record).toBeNull();
    expect(env.port.spawnCalls).toHaveLength(0);
  });

  it("스캔 트리를 쓰다가 blob 내용이 목록과 다르면 하드 실패다(조용히 넘어가지 않는다)", async () => {
    const env = await makeEnv({ mode: "target" });
    const real = new MemoryGit(reposByCommit);
    const lying = {
      resolveCommit: real.resolveCommit.bind(real),
      lsTree: real.lsTree.bind(real),
      readBlob: async () => enc.encode("different bytes"),
    };
    const r = await drive(
      env.clock,
      runHarness({ fs: env.fs, git: lying, process: env.port, clock: env.clock }, env.options)
    );
    expect(r.ok).toBe(false);
    expect(r.failure?.stage).toBe("scope");
    expect(r.started).toBe(false);
    expect(env.port.spawnCalls).toHaveLength(0);
  });

  it("잘못된 한도·runId·모드는 파일을 만지기 전에 config 단계에서 거부한다", async () => {
    await expectHard(
      await makeEnv({ mode: "target", options: { limits: { ...LIMITS, scan: 0 } } }),
      "config"
    );
    await expectHard(await makeEnv({ mode: "target", options: { runId: "../escape" } }), "config");
    await expectHard(await makeEnv({ mode: "target", options: { runId: "" } }), "config");
    await expectHard(
      await makeEnv({ mode: "target", options: { mode: "both" as unknown as "target" } }),
      "config"
    );
  });

  // runHarness를 직접 부르는 호출자도 CLI와 같은 규칙(run-id.ts)으로 거절된다. 파일 시스템에는 아무 호출도 하지 않는다.
  for (const mode of ["target", "control"] as const) {
    for (const c of INVALID_RUN_IDS) {
      it(`${mode}: runId ${c.name}(${JSON.stringify(c.value.slice(0, 24))})은 파일 시스템을 만지기 전에 config 단계에서 거부한다`, async () => {
        const calls: string[] = [];
        const env = await makeEnv({
          mode,
          options: { runId: c.value },
          wrapFs: (inner) => recorded(inner, calls, "fs"),
        });
        const r = await env.go();
        expect(r.ok).toBe(false);
        expect(r.failure?.stage).toBe("config");
        expect(r.failure?.message).toContain("runId");
        expect(r.started).toBe(false);
        expect(r.record).toBeNull();
        expect(r.evidence).toBeNull();
        expect(calls).toEqual([]); // 읽기·존재 확인·경로 풀기·쓰기 모두 없다
        expect(env.port.spawnCalls).toHaveLength(0);
        expect(env.fs.directories.filter((d) => d.startsWith("/evidence"))).toEqual([]);
      });
    }
  }

  it("runId가 문자열이 아니어도 config 단계에서 거부한다(CLI를 거치지 않는 호출자)", async () => {
    for (const bad of [undefined, null, 7, ["run"], { toString: () => "run" }]) {
      const calls: string[] = [];
      const env = await makeEnv({
        mode: "target",
        options: { runId: bad as unknown as string },
        wrapFs: (inner) => recorded(inner, calls, "fs"),
      });
      const r = await env.go();
      expect(r.failure?.stage, String(typeof bad)).toBe("config");
      expect(calls).toEqual([]);
    }
  });

  it.each(VALID_RUN_IDS)(
    "정상 값 $name은 runId 검사를 통과한다(config 단계 거부가 아니다)",
    async ({ value }) => {
      const env = await makeEnv({ mode: "target", options: { runId: value } });
      const r = await env.go();
      expect(r.failure?.stage).not.toBe("config");
      expect(r.ok).toBe(true);
      expect(await env.fs.exists(`/evidence/${value}/run.json`)).toBe(true);
    }
  );

  it("initializationOptions를 만들 수 없는 설정(음수 시간)은 settings 단계의 하드 실패다", async () => {
    await expectHard(
      await makeEnv({
        mode: "target",
        options: { settings: { timeout: -1, timeoutThreshold: 3 } },
      }),
      "settings"
    );
  });
});

// ── 증거 ────────────────────────────────────────────────────────

describe("runHarness — 증거 파일", () => {
  it("D10의 9개 파일이 모두 쓰이고 run.json 해시가 반환값과 같다", async () => {
    const env = await makeEnv({ mode: "target" });
    const r = await env.go();
    const files = await evidenceFiles(env);
    expect(Object.keys(files)).toEqual([...EVIDENCE_FILE_NAMES]);
    expect(r.evidence?.dir).toBe("/evidence/run-harness-1");
    const runBytes = enc.encode(files["run.json"]);
    expect(r.evidence?.runJsonSha256).toBe(sha256Hex(runBytes));
    expect(JSON.parse(files["run.json"]).run_id).toBe("run-harness-1");
    // 증거 폴더 밖(저장소 어디에도)에는 아무것도 쓰지 않았다.
    const base = Object.keys(baseFiles()).length;
    const all = await env.fs.listFilesRecursive("/");
    const outside = all.filter(
      (p) =>
        !p.startsWith("evidence/") &&
        !p.startsWith("scan/") &&
        !p.startsWith("data/") &&
        !p.startsWith("cache/") &&
        !p.startsWith("repo/") &&
        !p.startsWith("harness/") // 하네스 지문이 읽는 합성 구현 파일(읽기 전용)
    );
    expect(outside).toEqual([]);
    expect(all.length).toBeGreaterThan(base);
  });

  it("내용: diagnostics는 게시 원문, transcript는 meta + 사건, stderr.log는 장벽까지의 줄, files.* · scope.tsv", async () => {
    const env = await makeEnv({ mode: "target" });
    await env.go();
    const files = await evidenceFiles(env);
    const diag = files["diagnostics.jsonl"].trimEnd().split("\n");
    expect(diag).toHaveLength(EXPECTED_E[SHA_A].length);
    for (const line of diag) {
      expect(JSON.parse(line).method).toBe("textDocument/publishDiagnostics");
    }
    const tr = files["lsp-transcript.jsonl"]
      .trimEnd()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(tr[0]).toMatchObject({
      kind: "meta",
      provenance: "stub",
      runId: "run-harness-1",
      mode: "target",
    });
    expect(tr.slice(1).map((e) => e.seq)).toEqual(tr.slice(1).map((_, i) => i));
    expect(tr[tr.length - 1]).toMatchObject({ kind: "cleanup", ok: true });
    const stderr = files["stderr.log"].trimEnd().split("\n");
    expect(stderr).toContain("Scanning workspace complete");
    expect(stderr[0]).toBe("Refreshing rules");
    expect(files["scope.tsv"]).toContain("src/a.ts\t");
    expect(files["scope.tsv"]).toContain("README.md\t");
    expect(files["scope.tsv"]).toContain("not-js-ts-extension");
    expect(files["files.expected.txt"]).toBe("src/a.ts\nsrc/b.tsx\nsrc/d.ts\n");
  });

  it("같은 runId로 두 번째 실행은 거부되고(서버도 띄우지 않고) 기존 증거는 그대로다", async () => {
    const env = await makeEnv({ mode: "target" });
    const first = await env.go();
    expect(first.ok).toBe(true);
    const before = await evidenceFiles(env);
    const second = await env.go();
    expect(second.ok).toBe(false);
    expect(second.failure?.stage).toBe("evidence");
    expect(second.started).toBe(false);
    expect(second.record).toBeNull();
    expect(env.port.spawnCalls).toHaveLength(1);
    expect(await evidenceFiles(env)).toEqual(before);
  });

  it("not_executed는 null·NOT_RUN·UNVERIFIED뿐이고 스텁 실행 뒤에도 기본값 그대로다", async () => {
    for (const mode of ["control", "target"] as const) {
      const env = await makeEnv({ mode });
      const r = await env.go();
      const rec = r.record as RunRecord;
      expect(rec.not_executed).toEqual({ ...DEFAULT_NOT_EXECUTED });
      for (const v of Object.values(rec.not_executed)) {
        expect([null, "NOT_RUN", "UNVERIFIED"]).toContain(v);
      }
      expect(rec.existing_gates).toEqual({
        builtin_collector: { status: "UNVERIFIED", changed: false },
        official_gate: { effect: "NONE", changed: false },
      });
    }
  });

  it("시간 초과 실행도 증거를 남기고 상태는 TIMEOUT이다(성공 경로가 아니다)", async () => {
    const env = await makeEnv({ mode: "target", patch: { scan: { barrierAtMs: null } } });
    const r = await env.go();
    expect(r.ok).toBe(true);
    expect(r.started).toBe(true);
    expect(r.record?.measurement.status).toBe("TIMEOUT");
    expect(r.record?.measurement.complete).toBe(false);
    expect(r.record?.candidate_gate.value).toBeNull();
    expect(reasonCodes(r)).toContain("NO_BARRIER");
    await expectNeverCompleteWithoutEvidence(env, r);
  });

  it("spawn 실패는 INIT_FAILED이고 증거 transcript에는 spawn-failed만 있다", async () => {
    const env = await makeEnv({ mode: "target" });
    env.port.failSpawnWith(new Error("ENOENT"));
    const r = await env.go();
    expect(r.ok).toBe(true);
    expect(r.started).toBe(false);
    expect(r.record?.measurement.status).toBe("INIT_FAILED");
    expect(reasonCodes(r)).toContain("SPAWN_FAILED");
    const lines = (await evidenceFiles(env))["lsp-transcript.jsonl"].trimEnd().split("\n");
    expect(lines.map((l) => JSON.parse(l).kind)).toEqual(["meta", "spawn-failed"]);
  });

  it("이미 취소된 신호: 띄우지 않고 취소를 기록한 증거를 남긴다", async () => {
    const controller = new AbortController();
    controller.abort();
    const env = await makeEnv({ mode: "target", options: { signal: controller.signal } });
    const r = await env.go();
    expect(r.ok).toBe(true);
    expect(r.started).toBe(false);
    expect(env.port.spawnCalls).toHaveLength(0);
    expect(reasonCodes(r)).toContain("CANCELLED_DURING_INIT");
    expect(r.record?.measurement.complete).toBe(false);
  });
});

// ── 증거가 모두 쓰이기 전에는 완료가 나가지 않는다 ───────────────

describe("runHarness — 증거 없이는 record.measurement.complete === true가 없다", () => {
  /** 지정한 증거 파일의 쓰기를 거부하거나, 조용히 버리거나, 다른 내용으로 바꿔 쓰는 FsPort. */
  class SabotagedFs implements FsPort {
    constructor(
      private readonly inner: MemoryFs,
      private readonly target: string,
      private readonly mode: "throw" | "drop" | "corrupt"
    ) {}
    readFile(path: string) {
      return this.inner.readFile(path);
    }
    async writeFileExclusive(path: string, data: Uint8Array): Promise<void> {
      if (path.endsWith(`/${this.target}`)) {
        if (this.mode === "throw") throw new Error("EIO: disk full");
        if (this.mode === "drop") return;
        return this.inner.writeFileExclusive(path, enc.encode("corrupted"));
      }
      return this.inner.writeFileExclusive(path, data);
    }
    mkdirp(path: string) {
      return this.inner.mkdirp(path);
    }
    listFilesRecursive(root: string) {
      return this.inner.listFilesRecursive(root);
    }
    exists(path: string) {
      return this.inner.exists(path);
    }
    physicalKey(path: string) {
      return this.inner.physicalKey(path);
    }
  }

  for (const name of EVIDENCE_FILE_NAMES) {
    it(`${name} 쓰기가 거부되면 ok:false이고 record는 null이다(완료가 나가지 않는다)`, async () => {
      const env = await makeEnv({
        mode: "target",
        wrapFs: (inner) => new SabotagedFs(inner, name, "throw"),
      });
      const r = await env.go();
      expect(r.ok).toBe(false);
      expect(r.failure?.stage).toBe("evidence");
      expect(r.record).toBeNull();
      expect(r.evidence).toBeNull();
      expect(r.started).toBe(true); // 서버는 이미 돌았다 — 그 사실은 숨기지 않는다.
      await expectNeverCompleteWithoutEvidence(env, r);
    });
  }

  it("쓰기가 성공으로 보고됐지만 파일이 없으면(조용히 버려짐) 다시 확인해서 ok:false다", async () => {
    const env = await makeEnv({
      mode: "target",
      wrapFs: (inner) => new SabotagedFs(inner, "stderr.log", "drop"),
    });
    const r = await env.go();
    expect(r.ok).toBe(false);
    expect(r.failure?.stage).toBe("evidence");
    expect(r.failure?.message).toContain("stderr.log");
    expect(r.record).toBeNull();
  });

  it("run.json이 다른 내용으로 쓰이면 해시 대조에서 걸린다", async () => {
    const env = await makeEnv({
      mode: "target",
      wrapFs: (inner) => new SabotagedFs(inner, "run.json", "corrupt"),
    });
    const r = await env.go();
    expect(r.ok).toBe(false);
    expect(r.record).toBeNull();
    expect(r.failure?.message).toContain("run.json");
  });

  it("여러 시나리오를 돌려도 complete는 항상 증거 9개와 함께만 나온다", async () => {
    const scenarios: Partial<EnvInput>[] = [
      { mode: "target" },
      { mode: "control" },
      { mode: "target", patch: { scan: { barrierAtMs: null } } },
      { mode: "target", options: { toolVersionObserved: null } },
      { mode: "target", options: { controlReference: null } },
      { mode: "control", patch: { echoPost: { reply: "none" } } },
    ];
    let completes = 0;
    for (const s of scenarios) {
      const env = await makeEnv({ mode: "target", ...s });
      const r = await env.go();
      await expectNeverCompleteWithoutEvidence(env, r);
      if (r.record?.measurement.complete) completes++;
    }
    expect(completes).toBe(2); // 두 정상 실행만 완료다
  });
});

// ── 기밀 ────────────────────────────────────────────────────────

describe("runHarness — 환경변수 값·기밀은 어디에도 나오지 않는다", () => {
  const SECRET_A = "tok-SEKRET-a8f3c1d2e4";
  const SECRET_B = "pw-SEKRET-77b0e9";

  async function everything(env: Env, r: HarnessResult): Promise<string> {
    const chunks = [JSON.stringify(r)];
    for (const p of await env.fs.listFilesRecursive("/")) {
      chunks.push(new TextDecoder().decode(await env.fs.readFile(`/${p}`)));
    }
    chunks.push(JSON.stringify(env.stubs.map((s) => s.received)));
    return chunks.join("\n");
  }

  it("사전 검사가 거부한 토큰 변수: 이름만 남고 값은 반환값·증거 어디에도 없다", async () => {
    const env = await makeEnv({
      mode: "target",
      options: {
        spawn: {
          command: "/stub/semgrep",
          args: [],
          cwd: "/cache",
          env: { SEMGREP_APP_TOKEN: SECRET_A, PATH: "/usr/bin" },
        },
      },
    });
    const r = await env.go();
    expect(r.started).toBe(false);
    expect(reasonCodes(r)).toContain("APP_TOKEN_PRESENT");
    const dump = await everything(env, r);
    expect(dump).not.toContain(SECRET_A);
    expect(dump).toContain("SEMGREP_APP_TOKEN");
  });

  it("검사 대상이 아닌 이름(MY_DB_PASSWORD)의 기밀: 서버는 뜨고 값은 어디에도 없다", async () => {
    const env = await makeEnv({
      mode: "target",
      options: {
        spawn: {
          command: "/stub/semgrep",
          args: [],
          cwd: "/cache",
          env: { MY_DB_PASSWORD: SECRET_B, PATH: "/usr/bin" },
        },
      },
    });
    const r = await env.go();
    expect(r.started).toBe(true);
    expect(r.record?.measurement.status).toBe("COMPLETE");
    expect(await everything(env, r)).not.toContain(SECRET_B);
    // 서버 사양에는 있었지만 그것은 자식에게 건네는 값이지 출력이 아니다.
    expect(env.port.spawnCalls[0].env.MY_DB_PASSWORD).toBe(SECRET_B);
  });

  it("서버가 환경을 stderr로 흘려도(기밀 이름의 값) 증거를 쓰기 전에 거부한다", async () => {
    const env = await makeEnv({
      mode: "target",
      options: {
        spawn: {
          command: "/stub/semgrep",
          args: [],
          cwd: "/cache",
          env: { MY_DB_PASSWORD: SECRET_B, PATH: "/usr/bin" },
        },
      },
      wrapPort: (inner): ProcessPort => ({
        provenance: "stub",
        spawn: async (spec: SpawnSpec): Promise<ChildHandle> => {
          const child = (await inner.spawn(spec)) as FakeChild;
          child.emitStderrLine(`debug: env dump MY_DB_PASSWORD=${SECRET_B}`);
          return child;
        },
      }),
    });
    const r = await env.go();
    expect(r.ok).toBe(false);
    expect(r.failure?.stage).toBe("evidence");
    expect(r.record).toBeNull();
    expect(r.started).toBe(true);
    expect(await evidenceFiles(env)).toEqual({});
    expect(await everything(env, r)).not.toContain(SECRET_B);
  });

  it("실패 메시지에 기밀 값이 섞여 들어오면(경로에 포함된 경우) [redacted]로 바꾼다", async () => {
    const env = await makeEnv({
      mode: "target",
      options: { dataDir: `/data-${SECRET_A}`, secrets: [SECRET_A] },
    });
    const r = await env.go();
    expect(r.ok).toBe(false);
    expect(r.failure?.stage).toBe("inputs");
    expect(r.failure?.message).toContain("[redacted]");
    expect(JSON.stringify(r)).not.toContain(SECRET_A);
  });

  it("추가 secrets 값이 증거 내용에 섞이면 쓰기 전에 거부하고, 실패 메시지에도 그 값은 없다", async () => {
    const leak = "run-harness-1"; // run.json 안에 들어가는 값이라 기밀로 지정하면 걸린다
    const env = await makeEnv({ mode: "target", options: { secrets: [leak] } });
    const r = await env.go();
    expect(r.ok).toBe(false);
    expect(r.failure?.stage).toBe("evidence");
    expect(r.failure?.message).not.toContain(leak);
    expect(r.record).toBeNull();
    expect(await evidenceFiles(env)).toEqual({});
  });
});

// ── 지문과 결합(PR #28 검토 발견 3) ─────────────────────────────

describe("runHarness — 하네스·대조 지문과 결합", () => {
  const FP = SYNTHETIC_FINGERPRINTS;

  it("control 실행은 계산한 지문 일곱 값을 inputs에 싣고 fingerprints.txt에 값과 매니페스트를 남긴다", async () => {
    const env = await makeEnv({ mode: "control" });
    const r = await env.go();
    const rec = r.record as RunRecord;
    expect(rec.inputs.harness_sha256).toBe(FP.harness_sha256);
    expect(rec.inputs.control_sha256).toBe(FP.control_sha256);
    expect(rec.inputs.tool_version_observed).toBe(FP.tool_version);
    expect(rec.inputs.wheel_sha256_observed).toBe(FP.wheel_sha256);
    expect(rec.inputs.binding_sha256).toBe(FP.binding_sha256);
    const text = (await evidenceFiles(env))["fingerprints.txt"];
    expect(text).toContain(`harness_sha256\t${FP.harness_sha256}`);
    expect(text).toContain(`binding_sha256\t${FP.binding_sha256}`);
    expect(text).toContain("[harness manifest]\nsemgrep-lsp-harness-fingerprint/1\n");
    expect(text).toContain("evaluate.ts\t"); // 포함 파일의 해시가 매니페스트에 있다
    expect(text).not.toContain("evaluate.test.ts"); // 시험 파일은 지문 범위 밖이다
    expect(text).toContain("[control manifest]\nsemgrep-lsp-control-fingerprint/1\n");
  });

  it("엔진 음성 대조를 실행하지 않은 control 실행은 reference_qualification이 불충족이고 요약은 eligible:false다", async () => {
    const env = await makeEnv({ mode: "control" });
    const r = await env.go();
    const rec = r.record as RunRecord;
    expect(rec.control_assertions.negative_controls).toHaveLength(16);
    expect(rec.control_assertions.negative_controls.every((n) => n.status === "NOT_RUN")).toBe(
      true
    );
    expect(rec.reference_qualification.applicable).toBe(true);
    expect(rec.reference_qualification.eligible).toBe(false);
    const unsatisfied = rec.reference_qualification.requirements
      .filter((q) => !q.satisfied)
      .map((q) => q.id);
    // 출처(스텁)와 음성 대조 두 층이 불충족이다. 측정·단언·N0·지문은 충족이다.
    expect(unsatisfied.sort()).toEqual(
      ["NEGATIVE_ENGINE_PASS", "NEGATIVE_PREFLIGHT_PASS", "PROVENANCE_REAL"].sort()
    );
    const ref = toControlReference(rec, true);
    expect(ref.eligible).toBe(false);
    expect(ref.fingerprints).toEqual(FP);
    expect(ref.negative_controls).toHaveLength(16);
  });

  it("target 실행의 reference_qualification은 해당 없음이다", async () => {
    const env = await makeEnv({ mode: "target" });
    const r = await env.go();
    expect((r.record as RunRecord).reference_qualification).toEqual({
      applicable: false,
      eligible: false,
      requirements: [],
    });
  });

  it("하네스 구현 파일이 하나 달라지면 같은 참조라도 HARNESS_MISMATCH·BINDING_MISMATCH로 거부한다", async () => {
    const env = await makeEnv({
      mode: "target",
      files: { [`${SYNTHETIC_HARNESS_ROOT}/evaluate.ts`]: "export const a = 2; // 수정\n" },
    });
    const r = await env.go();
    const rec = r.record as RunRecord;
    expect(rec.measurement.status).toBe("CONTROL_MISSING");
    expect(reasonCodes(r)).toEqual(
      expect.arrayContaining([
        "CONTROL_REFERENCE_HARNESS_MISMATCH",
        "CONTROL_REFERENCE_BINDING_MISMATCH",
        "CONTROL_REFERENCE_NOT_ELIGIBLE",
      ])
    );
    expect(rec.inputs.harness_sha256).not.toBe(FP.harness_sha256);
    expect(rec.candidate_gate.value).toBeNull();
  });

  it("시험·testing·문서 파일을 바꿔도 지문과 판정은 그대로다", async () => {
    const env = await makeEnv({
      mode: "target",
      files: {
        [`${SYNTHETIC_HARNESS_ROOT}/evaluate.test.ts`]: "// 다른 시험\n",
        [`${SYNTHETIC_HARNESS_ROOT}/testing/support.ts`]: "// 다른 지원\n",
        [`${SYNTHETIC_HARNESS_ROOT}/README.md`]: "# 다른 문서\n",
      },
    });
    const r = await env.go();
    const rec = r.record as RunRecord;
    expect(rec.inputs.harness_sha256).toBe(FP.harness_sha256);
    expect(rec.measurement.status).toBe("COMPLETE");
  });

  it("하네스 루트를 읽지 못해도 던지지 않고 지문은 null이며 target은 FINGERPRINT_MISSING으로 거부한다", async () => {
    const env = await makeEnv({
      mode: "target",
      options: { harnessRoot: "/no-such-harness" },
    });
    const r = await env.go();
    expect(r.ok).toBe(true);
    const rec = r.record as RunRecord;
    expect(rec.inputs.harness_sha256).toBeNull();
    expect(rec.inputs.binding_sha256).toBeNull();
    expect(rec.measurement.status).toBe("CONTROL_MISSING");
    expect(reasonCodes(r)).toEqual(
      expect.arrayContaining([
        "CONTROL_REFERENCE_FINGERPRINT_MISSING",
        "CONTROL_REFERENCE_NOT_ELIGIBLE",
      ])
    );
    const text = (await evidenceFiles(env))["fingerprints.txt"];
    expect(text).toContain("harness_sha256\t(확인하지 못함)");
    expect(text).toContain("[harness manifest]\n(계산하지 못했다)");
  });

  it("도구 버전을 관측하지 못하면 결합은 null이다(서버를 띄우지 않는 거부 실행에서도 기록한다)", async () => {
    const env = await makeEnv({ mode: "control", options: { toolVersionObserved: null } });
    const r = await env.go();
    const rec = r.record as RunRecord;
    expect(r.started).toBe(false);
    expect(rec.inputs.tool_version_observed).toBeNull();
    expect(rec.inputs.binding_sha256).toBeNull();
    expect(rec.inputs.harness_sha256).toBe(FP.harness_sha256);
  });

  it("harnessRoot가 비어 있으면 config 단계의 하드 실패다", async () => {
    const env = await makeEnv({ mode: "target", options: { harnessRoot: "" } });
    const r = await env.go();
    expect(r.ok).toBe(false);
    expect(r.failure?.stage).toBe("config");
    expect(r.failure?.message).toContain("harnessRoot");
  });
});

// ── 포트가 provenance를 정한다 ──────────────────────────────────

describe("runHarness — 저장된 대조 기록을 어댑터로 읽어 잇는다(하네스 수준 전체 연결)", () => {
  // 시험용 기록: testing/control-record-fixtures.ts가 손으로 구성한 합성 control 기록(출처를 real이라고 *주장*한다).
  // 운영 관측: 도구 버전·휠·잠금·다른 서버 프로세스·메트릭 수신기는 이 시험이 주입한 값이다. 운영 CLI(cli.ts)는 아직 이것들을
  // 관측하지 않아 항상 null을 넘기므로, 이 파일의 COMPLETE 경로는 CLI로는 닿을 수 없다 — CLI 수준 시험은 cli.test.ts에 있다.
  const RECORD = "/records/control/run.json";
  const F = SYNTHETIC_FINGERPRINTS;

  function bindingOf(f: typeof F, over: Partial<typeof F>, pinSha256: string): string | null {
    const m = { ...f, ...over };
    return buildBinding({
      tool_version: m.tool_version,
      wheel_sha256: m.wheel_sha256,
      pin_sha256: pinSha256,
      rules_list_sha256: m.rules_list_sha256,
      rules_expected_sha256: m.rules_expected_sha256,
      harness_sha256: m.harness_sha256,
      control_sha256: m.control_sha256,
    });
  }

  function recordText(over: Partial<typeof F> = {}, pinSha256 = PIN_SHA256): string {
    const fingerprints = { ...F, ...over };
    fingerprints.binding_sha256 = bindingOf(F, over, pinSha256);
    return canonicalJson(syntheticControlRunRecord({ fingerprints, pinSha256 }));
  }

  async function envWith(text: string | null, options: Partial<HarnessOptions> = {}) {
    const env = await makeEnv({ mode: "target", files: text === null ? {} : { [RECORD]: text } });
    const loaded = await loadControlReference(env.fs, RECORD, env.options.dataDir);
    env.options.controlReference = loaded.reference;
    env.options.controlReferenceRejection = loaded.rejection;
    Object.assign(env.options, options);
    return { env, loaded };
  }

  it("자격을 갖춘 기록을 읽어 잇고 모든 관측이 맞으면 target이 COMPLETE가 된다(스텁 실행이라 평가는 UNVERIFIED)", async () => {
    const { env, loaded } = await envWith(recordText());
    expect(loaded.rejection).toBeNull();
    const r = await env.go();
    expect(r.ok).toBe(true);
    const rec = r.record as RunRecord;
    expect(rec.measurement.status).toBe("COMPLETE");
    expect(reasonCodes(r)).toEqual([]);
    expect(rec.control_reference).toEqual(loaded.reference);
    expect(rec.candidate_gate.value).toBe(0);
    expect(rec.candidate_gate.evaluation).toBe("UNVERIFIED"); // provenance stub
    await expectNeverCompleteWithoutEvidence(env, r);
  });

  it("기록을 읽을 수 없으면(깨진 JSON) 참조 없이 진행하고 이유를 사유로 남긴다 — COMPLETE가 아니다", async () => {
    const { env, loaded } = await envWith('{"schema":');
    expect(loaded.reference).toBeNull();
    const r = await env.go();
    const rec = r.record as RunRecord;
    expect(rec.measurement.status).toBe("CONTROL_MISSING");
    expect(reasonCodes(r)).toEqual(
      ["CONTROL_REFERENCE_MISSING", "CONTROL_REFERENCE_RECORD_REJECTED"].sort()
    );
    expect(
      rec.measurement.reasons.find((x) => x.code === "CONTROL_REFERENCE_RECORD_REJECTED")?.detail
    ).toBe("INVALID_JSON");
    expect(rec.control_reference).toBeNull();
    expect(rec.candidate_gate.value).toBeNull();
    await expectNeverCompleteWithoutEvidence(env, r);
  });

  // PR #29 외부 검토: 기록 안의 세부 값이 서로 모순이거나 근거와 다른 기록은 어댑터가 거절한다. 도구 버전·휠·잠금 같은
  // 운영 관측은 이 시험이 주입한 값이라 정상 기록이면 위 첫 시험처럼 COMPLETE·0건이 된다 — 같은 환경에서 모순 기록은
  // 참조 없이(CONTROL_MISSING) 끝나고 0건 평가값도 만들지 않는다. 기록은 전부 시험이 손으로 구성한 합성이다.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Plain = Record<string, any>;
  const contradictory: [string, (r: Plain) => void, string][] = [
    [
      "음성 대조 PASS인데 엔진 항목의 observed가 null",
      (r) => (r.control_assertions.negative_controls[0].observed = null),
      "R1:engine(observed-null)",
    ],
    [
      "음성 대조 PASS인데 observed가 기대와 다름",
      (r) => (r.control_assertions.negative_controls[0].observed = "COMPLETE"),
      "R1:engine(observed)",
    ],
    [
      "음성 대조 PASS인데 expected가 기준과 다름",
      (r) => {
        r.control_assertions.negative_controls[0].expected = "COMPLETE";
        r.control_assertions.negative_controls[0].observed = "COMPLETE";
      },
      "R1:engine(expected)",
    ],
    [
      "세부 검사가 FAIL인데 요약은 PASS",
      (r) => (r.control_assertions.checks[0].status = "FAIL"),
      "ASSERTION_SUMMARY_MISMATCH",
    ],
    [
      "design_errors가 있는데 요약은 PASS",
      (r) => r.control_assertions.design_errors.push("대조 설계의 오류"),
      "ASSERTION_DESIGN_ERRORS(1)",
    ],
    [
      "COMPLETE인데 reasons가 있음",
      (r) => r.measurement.reasons.push({ code: "ENGINE_EXCEPTION_LOG" }),
      "MEASUREMENT_REASONS_INCONSISTENT",
    ],
    [
      "checks에 null 항목",
      (r) => (r.control_assertions.checks = [null]),
      "control_assertions.checks[0](type)",
    ],
    ["checks가 비어 있음", (r) => (r.control_assertions.checks = []), "ASSERTION_CHECKS_EMPTY"],
    // PR #29 외부 재검토: 요약은 PASS로 일관되지만 검사 목록이 기대 사례(data/control-expectations.json)에서 도출한 목록과 다르다.
    [
      "검사 20개 중 첫 1개만 유지",
      (r) => (r.control_assertions.checks = r.control_assertions.checks.slice(0, 1)),
      "CHECKS_MISSING(A2:cases/child-process.pos.ts",
    ],
    [
      "한 사례의 검사 전체 삭제",
      (r) =>
        (r.control_assertions.checks = r.control_assertions.checks.filter(
          (c: Plain) => c.file !== "cases/child-process.pos.ts"
        )),
      "CHECKS_MISSING(A1:cases/child-process.pos.ts, A2:cases/child-process.pos.ts",
    ],
    [
      "A4 검사 전체 삭제",
      (r) =>
        (r.control_assertions.checks = r.control_assertions.checks.filter(
          (c: Plain) => c.kind !== "A4"
        )),
      "CHECKS_MISSING(A4:cases/child-process.pos.ts, A4:cases/eval.nosource.js)",
    ],
    [
      "첫 검사만 20번 복제",
      (r) =>
        (r.control_assertions.checks = Array.from({ length: 20 }, () => ({
          ...r.control_assertions.checks[0],
        }))),
      "CHECKS_DUPLICATE(A1:cases/child-process.pos.ts)",
    ],
  ];
  it.each(contradictory)(
    "자기 모순 기록(%s)은 참조로 잇지 않는다 — COMPLETE도 0건도 아니다",
    async (_name, mutate, token) => {
      const record = JSON.parse(recordText()) as Plain;
      mutate(record);
      const { env, loaded } = await envWith(JSON.stringify(record));
      expect(loaded.reference).toBeNull();
      expect(loaded.rejection).toContain(token);
      const r = await env.go();
      const rec = r.record as RunRecord;
      expect(rec.measurement.status).toBe("CONTROL_MISSING");
      expect(rec.measurement.complete).toBe(false);
      expect(reasonCodes(r)).toEqual(
        ["CONTROL_REFERENCE_MISSING", "CONTROL_REFERENCE_RECORD_REJECTED"].sort()
      );
      expect(
        rec.measurement.reasons.find((x) => x.code === "CONTROL_REFERENCE_RECORD_REJECTED")?.detail
      ).toContain(token);
      expect(rec.control_reference).toBeNull();
      expect(rec.candidate_gate.value).toBeNull(); // 0건이라는 값이 만들어지지 않았다
      await expectNeverCompleteWithoutEvidence(env, r);
    }
  );

  it("기록을 명시하지 않으면(null, 거절 이유 없음) 기존대로 MISSING만 나온다", async () => {
    const env = await makeEnv({ mode: "target", options: { controlReference: null } });
    const r = await env.go();
    expect(reasonCodes(r)).toEqual(["CONTROL_REFERENCE_MISSING"]);
  });

  it("도구 버전을 관측하지 못하면 기록의 값으로 채우지 않는다: 지문 누락·미확인 사유로 거부되고 서버는 뜨지 않는다", async () => {
    const { env } = await envWith(recordText(), { toolVersionObserved: null });
    const r = await env.go();
    const rec = r.record as RunRecord;
    expect(r.started).toBe(false);
    expect(rec.inputs.tool_version_observed).toBeNull(); // 기록의 tool_version으로 채우지 않았다
    expect(rec.inputs.binding_sha256).toBeNull();
    expect(reasonCodes(r)).toEqual(
      expect.arrayContaining(["TOOL_VERSION_UNVERIFIED", "CONTROL_REFERENCE_FINGERPRINT_MISSING"])
    );
    expect(rec.control_reference?.fingerprints.tool_version).toBe(F.tool_version);
  });

  it("기록의 하네스 지문이 이번 실행과 다르면 수락된 기록도 HARNESS_MISMATCH·BINDING_MISMATCH로 거부된다", async () => {
    const other = sha256Hex("다른 하네스 구현");
    const { env, loaded } = await envWith(recordText({ harness_sha256: other }));
    expect(loaded.rejection).toBeNull(); // 기록 자체는 자기 일관성을 지킨다
    const r = await env.go();
    expect(reasonCodes(r)).toEqual(
      expect.arrayContaining([
        "CONTROL_REFERENCE_HARNESS_MISMATCH",
        "CONTROL_REFERENCE_BINDING_MISMATCH",
        "CONTROL_REFERENCE_NOT_ELIGIBLE",
      ])
    );
    expect((r.record as RunRecord).measurement.status).toBe("CONTROL_MISSING");
    expect((r.record as RunRecord).inputs.harness_sha256).toBe(F.harness_sha256); // 이번 실행의 값
  });

  it("기록의 대조 지문이 이번 실행과 다르면 CONTROL_MISMATCH로 거부된다", async () => {
    const { env } = await envWith(recordText({ control_sha256: sha256Hex("다른 예제") }));
    const r = await env.go();
    expect(reasonCodes(r)).toContain("CONTROL_REFERENCE_CONTROL_MISMATCH");
    expect((r.record as RunRecord).measurement.status).toBe("CONTROL_MISSING");
  });

  it("기록의 핀이 이번 실행의 핀과 다르면 PIN_MISMATCH로 거부된다", async () => {
    const otherPin = sha256Hex("다른 핀");
    const { env } = await envWith(recordText({}, otherPin));
    const r = await env.go();
    expect(reasonCodes(r)).toContain("CONTROL_REFERENCE_PIN_MISMATCH");
    expect((r.record as RunRecord).measurement.status).toBe("CONTROL_MISSING");
  });

  it("도구 버전이 다른 기록은 TOOL_MISMATCH로 거부된다", async () => {
    const { env } = await envWith(recordText({ tool_version: "0.0.0-other" }));
    const r = await env.go();
    expect(reasonCodes(r)).toContain("CONTROL_REFERENCE_TOOL_MISMATCH");
  });

  it("하네스가 실제로 쓴 control run.json은 구조 검증을 통과하고, stub이라는 이유로만 거절된다", async () => {
    const control = await makeEnv({ mode: "control" });
    await control.go();
    const written = (await evidenceFiles(control))["run.json"];
    expect(written).toBeDefined();
    const loaded = controlReferenceFromValue(JSON.parse(written), controlExpectations);
    expect(loaded.reference).toBeNull();
    expect(loaded.rejection).not.toContain("INVALID_FIELDS"); // 운영 형식을 구조 검증이 거절하지 않는다
    expect(loaded.rejection).toContain("TRUST_SYNTHETIC");
    expect(loaded.rejection).toContain("PROVENANCE_REAL");
  });
});

describe("runHarness — provenance", () => {
  it("하네스는 provenance를 스스로 정하지 않는다: 포트가 선언한 값을 레코드에 옮긴다", async () => {
    // 시험을 위해 스텁을 'real'이라고 선언하는 래퍼. 이것이 실제 실행이 되는 것은 아니다 — 하네스가
    // 'stub'을 하드코딩하지 않고 포트의 선언을 따르는지만 본다.
    const env = await makeEnv({
      mode: "target",
      wrapPort: (inner): ProcessPort => ({
        provenance: "real",
        spawn: (spec: SpawnSpec): Promise<ChildHandle> => inner.spawn(spec),
      }),
    });
    const r = await env.go();
    const rec = r.record as RunRecord;
    expect(rec.provenance).toBe("real");
    expect(rec.trust).toBe("REAL_UNREVIEWED");
    expect(rec.candidate_gate.evaluation).toBe("WOULD_PASS");
    expect(rec.candidate_gate.policy_accepted).toBe(false);
    expect(rec.candidate_gate.counts_as_lsp_security_warnings).toBe(false);
  });
});

// ── 구조 ────────────────────────────────────────────────────────

describe("harness.ts — 구조", () => {
  const source = readFileSync(fileURLToPath(new URL("./harness.ts", import.meta.url)), "utf8");
  const code = source
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
    .join("\n");

  it("환경변수·프로세스·파일·네트워크 모듈을 직접 쓰지 않는다(포트로만 만진다)", () => {
    expect(code).not.toMatch(/process\.env/);
    expect(code).not.toMatch(/child_process|node:fs|node:net|node:http|fetch\(|node:os/);
    expect(code).not.toMatch(/\bDate\.now\b|\bsetTimeout\b|\bsetInterval\b/);
  });

  it("runSession·buildRunRecord·writeEvidence를 거치지 않는 레코드 생성 경로가 없다", () => {
    expect(code.match(/buildRunRecord\(/g)).toHaveLength(1);
    expect(code.match(/writeEvidence\(/g)).toHaveLength(1);
    expect(code.match(/runSession\(/g)).toHaveLength(1);
  });
});

// ── 판정 시점의 루프백 수신 관측과 자원 요약(공유 잠금·수신기) ─────────────

describe("runHarness — 판정 시점의 루프백 수신 관측과 자원 요약", () => {
  /** 서버를 띄우는 순간(spawn)에 hook을 실행하는 포트. */
  const onSpawn =
    (hook: (spec: SpawnSpec) => void | Promise<void>) =>
    (inner: FakePort): ProcessPort => ({
      provenance: "stub",
      spawn: async (spec: SpawnSpec): Promise<ChildHandle> => {
        await hook(spec);
        return inner.spawn(spec);
      },
    });

  async function runJson(env: Env) {
    return JSON.parse((await evidenceFiles(env))["run.json"]) as {
      resources?: {
        run_lock: Record<string, unknown> | null;
        metrics_receiver: Record<string, unknown> | null;
      };
      not_executed: Record<string, unknown>;
    };
  }

  it("수신기를 주면 시작 시점이 아니라 판정 시점의 관측을 쓴다(서버를 띄운 뒤 늘어난 건수가 반영된다)", async () => {
    const receiver = new FakeMetricsReceiver({ hits: 0 });
    const env = await makeEnv({
      mode: "target",
      options: { metricsReceiver: receiver, metricsReceiverHits: 0 },
      wrapPort: onSpawn(() => {
        receiver.hits = 1; // 서버가 뜬 뒤, 판정 전에 들어온 요청
      }),
    });
    const r = await env.go();
    expect(r.started).toBe(true);
    expect(reasonCodes(r)).toContain("METRICS_RECEIVER_HIT");
    expect(r.record?.measurement.status).toBe("ISOLATION_VIOLATION");
    expect(
      r.record?.measurement.reasons.find((x) => x.code === "METRICS_RECEIVER_HIT")?.detail
    ).toBe("1건");
    expect(receiver.observeCalls).toBe(1); // 판정할 때 한 번 읽는다
    expect(r.record?.resources?.metrics_receiver).toMatchObject({ state: "LISTENING", hits: 1 });
    expect((await runJson(env)).resources?.metrics_receiver).toMatchObject({ hits: 1 });
  });

  it("수신기가 있으면 호출자가 정해 둔 metricsReceiverHits는 쓰지 않는다", async () => {
    const receiver = new FakeMetricsReceiver({ hits: 0 });
    const env = await makeEnv({
      mode: "target",
      options: { metricsReceiver: receiver, metricsReceiverHits: 99 }, // 99는 무시된다
    });
    const r = await env.go();
    expect(reasonCodes(r)).not.toContain("METRICS_RECEIVER_HIT");
    expect(r.record?.measurement.status).toBe("COMPLETE");
  });

  it("0건 관측: 서버가 돌았고 관측이 유효하면 COMPLETE이고, 관측은 '했으나 서버가 환경변수를 읽는지는 미확인'(UNVERIFIED)이다", async () => {
    const receiver = new FakeMetricsReceiver({ hits: 0 });
    const env = await makeEnv({ mode: "target", options: { metricsReceiver: receiver } });
    const r = await env.go();
    expect(r.started).toBe(true);
    expect(r.record?.measurement.status).toBe("COMPLETE");
    const run = await runJson(env);
    expect(run.resources?.metrics_receiver).toMatchObject({
      bind: "127.0.0.1",
      state: "LISTENING",
      failure: null,
      hits: 0,
    });
    expect(run.not_executed.metrics_receiver_observation).toBe("UNVERIFIED");
  });

  it("관측 실패(FAILED)는 0건이 아니다 — NOT_OBSERVING이고, 관측했다고 쓰지 않는다(NOT_RUN)", async () => {
    const receiver = new FakeMetricsReceiver({ state: "FAILED", failure: "SERVER_ERROR", hits: 0 });
    const env = await makeEnv({ mode: "target", options: { metricsReceiver: receiver } });
    const r = await env.go();
    expect(reasonCodes(r)).toContain("METRICS_RECEIVER_NOT_OBSERVING");
    expect(reasonCodes(r)).not.toContain("METRICS_RECEIVER_HIT");
    expect(r.record?.measurement.status).toBe("ISOLATION_VIOLATION");
    const run = await runJson(env);
    expect(run.resources?.metrics_receiver).toMatchObject({
      state: "FAILED",
      failure: "SERVER_ERROR",
      hits: null,
    });
    expect(run.not_executed.metrics_receiver_observation).toBe("NOT_RUN");
  });

  it("observe()가 던져도 0건으로 간주하지 않고 던지지도 않는다(OBSERVE_FAILED)", async () => {
    const receiver = new FakeMetricsReceiver({ hits: 0 });
    receiver.throwOnObserve = true;
    const env = await makeEnv({ mode: "target", options: { metricsReceiver: receiver } });
    const r = await env.go();
    expect(r.ok).toBe(true);
    expect(reasonCodes(r)).toContain("METRICS_RECEIVER_NOT_OBSERVING");
    expect(r.record?.resources?.metrics_receiver).toMatchObject({
      state: "FAILED",
      failure: "OBSERVE_FAILED",
      hits: null,
    });
  });

  it("사전 검사가 거부해 서버를 띄우지 않아도 수신기를 읽고, 서버가 돌지 않았으므로 관측은 NOT_RUN으로 남긴다", async () => {
    const receiver = new FakeMetricsReceiver({ hits: 0 });
    const env = await makeEnv({
      mode: "target",
      options: { metricsReceiver: receiver, lockHeld: false, lockRefusal: "HELD_BY_OTHER" },
    });
    const r = await env.go();
    expect(r.started).toBe(false);
    expect(receiver.observeCalls).toBe(1);
    expect(r.record?.resources?.metrics_receiver).toMatchObject({ state: "LISTENING", hits: 0 });
    expect((await runJson(env)).not_executed.metrics_receiver_observation).toBe("NOT_RUN");
  });

  it("공유 잠금을 얻지 못한 이유 토큰은 LOCK_NOT_ACQUIRED의 상세에만 붙는다(경로·소유자 없음)", async () => {
    const env = await makeEnv({
      mode: "target",
      options: { lockHeld: false, lockRefusal: "HELD_BY_OTHER" },
    });
    const r = await env.go();
    expect(r.started).toBe(false);
    const reason = r.record?.measurement.reasons.find((x) => x.code === "LOCK_NOT_ACQUIRED");
    expect(reason?.detail).toBe("실행 잠금을 얻지 못했다 (HELD_BY_OTHER)");
    // 이유를 주지 않으면 기존 문구 그대로다.
    const plain = await makeEnv({ mode: "target", options: { lockHeld: false } });
    expect(
      (await plain.go()).record?.measurement.reasons.find((x) => x.code === "LOCK_NOT_ACQUIRED")
        ?.detail
    ).toBe("실행 잠금을 얻지 못했다");
  });

  it("잠금 요약을 주면 증거에 남고, 수신기가 없으면 수신기 요약은 null이다", async () => {
    const lockSummary = {
      scope: "server-tree" as const,
      tree_key_sha256: "a".repeat(64),
      state: "ACQUIRED" as const,
      reason: null,
      evidence_marker: "CREATED" as const,
    };
    const env = await makeEnv({ mode: "target", options: { lockSummary } });
    const r = await env.go();
    expect(r.record?.measurement.status).toBe("COMPLETE");
    expect((await runJson(env)).resources).toEqual({
      run_lock: lockSummary,
      metrics_receiver: null,
    });
  });

  it("자원을 연결하지 않은 호출자의 레코드에는 resources 필드가 없다(기존 레코드와 같다)", async () => {
    const env = await makeEnv({ mode: "target" });
    const r = await env.go();
    expect("resources" in (r.record as object)).toBe(false);
    expect((await runJson(env)).resources).toBeUndefined();
  });

  it("control 모드에서도 같은 판정 시점 관측과 요약을 쓴다", async () => {
    const receiver = new FakeMetricsReceiver({ hits: 0 });
    const env = await makeEnv({ mode: "control", options: { metricsReceiver: receiver } });
    const r = await env.go();
    expect(receiver.observeCalls).toBe(1);
    expect(r.record?.resources?.metrics_receiver).toMatchObject({ hits: 0 });
  });

  describe("실제 루프백 수신기와 연결(로컬 HTTP 요청)", () => {
    const opened: MetricsReceiver[] = [];
    afterEach(async () => {
      await Promise.all(opened.splice(0).map((r) => r.close()));
    });
    async function openReceiver() {
      const receiver = await startMetricsReceiver();
      opened.push(receiver);
      if (receiver.url === null) throw new Error("전제: 수신기가 열려야 한다");
      return receiver as MetricsReceiver & { url: string };
    }
    const envWithUrl = (url: string): SpawnSpec => ({
      command: "/stub/semgrep",
      args: ["lsp"],
      cwd: "/cache",
      env: { PATH: "/usr/bin", SEMGREP_METRICS_URL: url },
    });

    it("서버가 환경의 주소로 요청을 보내면 실제 수신기가 세고 판정·증거에 반영된다(ISOLATION_VIOLATION)", async () => {
      const receiver = await openReceiver();
      const env = await makeEnv({
        mode: "target",
        options: { spawn: envWithUrl(receiver.url), metricsReceiver: receiver },
        wrapPort: onSpawn(async (spec) => {
          await sendLoopbackRequest(spec.env.SEMGREP_METRICS_URL, { body: "metrics-body" });
        }),
      });
      const r = await env.go();
      expect(r.started).toBe(true);
      expect(r.record?.measurement.status).toBe("ISOLATION_VIOLATION");
      expect(
        r.record?.measurement.reasons.find((x) => x.code === "METRICS_RECEIVER_HIT")?.detail
      ).toBe("1건");
      const run = await runJson(env);
      expect(run.resources?.metrics_receiver).toMatchObject({
        state: "LISTENING",
        hits: 1,
        requests: 1,
      });
      // 본문은 증거 어디에도 없다.
      expect(JSON.stringify(await evidenceFiles(env))).not.toContain("metrics-body");
    });

    it("요청이 없으면 실제 수신기에서 0건을 관측한 채 COMPLETE다", async () => {
      const receiver = await openReceiver();
      const env = await makeEnv({
        mode: "target",
        options: { spawn: envWithUrl(receiver.url), metricsReceiver: receiver },
      });
      const r = await env.go();
      expect(r.record?.measurement.status).toBe("COMPLETE");
      expect((await runJson(env)).resources?.metrics_receiver).toMatchObject({
        state: "LISTENING",
        hits: 0,
        requests: 0,
      });
      await receiver.close();
      expect(await canConnectLoopback(receiver.url)).toBe(false);
    });

    it("정상적으로 닫은 수신기는 닫기 전까지의 관측이 유효하다(CLOSED, 0건)", async () => {
      const receiver = await openReceiver();
      const env = await makeEnv({
        mode: "target",
        options: { spawn: envWithUrl(receiver.url), metricsReceiver: receiver },
        wrapPort: onSpawn(async () => {
          // 판정 전에 우리 쪽에서 정상적으로 닫는다.
          await receiver.close();
        }),
      });
      const r = await env.go();
      // 비정상 종료(CLOSED_EARLY)는 0건이 아니라 관측 실패다 — metrics-node.integration.test.ts가 확인한다.
      expect(r.record?.resources?.metrics_receiver).toMatchObject({ state: "CLOSED", hits: 0 });
    });
  });
});

// ── 잠금 없이는 서버 트리를 만들거나 바꾸지 않는다(실제 디스크) ─────────────────────
//
// 서버 트리(target은 스캔 트리, control은 대조 트리)만 실제 디스크에 두고 나머지(고정 입력·증거·규칙 캐시)는 메모리에 둔다.
// 다른 실행이 잡은 잠금은 실제 노드 포트로 얻는다. 하네스를 직접 부르므로 CLI가 아닌 호출자도 같은 보장을 받는지 확인한다.

interface DiskTree {
  exists: boolean;
  dirs: string[];
  files: Record<string, string>;
}

async function walkDisk(root: string, rel: string, out: DiskTree): Promise<void> {
  for (const entry of await readdir(join(root, rel), { withFileTypes: true })) {
    const path = rel === "" ? entry.name : `${rel}/${entry.name}`;
    if (entry.isDirectory()) {
      out.dirs.push(path);
      await walkDisk(root, path, out);
    } else {
      out.files[path] = sha256Hex(new Uint8Array(await readFile(join(root, path))));
    }
  }
}

/** 실제 디스크 트리의 스냅샷: 존재 여부·디렉터리 목록·파일별 바이트 해시. 없으면 exists:false. */
async function snapshotDisk(root: string): Promise<DiskTree> {
  try {
    await stat(root);
  } catch {
    return { exists: false, dirs: [], files: {} };
  }
  const out: DiskTree = { exists: true, dirs: [], files: {} };
  await walkDisk(root, "", out);
  out.dirs.sort();
  return out;
}

describe("runHarness — 잠금 없이는 서버 트리를 만들거나 바꾸지 않는다(실제 디스크)", () => {
  let base = "";
  afterAll(async () => {
    if (base !== "") await rm(base, { recursive: true, force: true });
  });

  async function caseDir(): Promise<string> {
    base = base || (await mkdtemp(join(tmpdir(), "semgrep-lsp-harness-lock-")));
    return (await mkdtemp(join(base, "case-"))).replace(/\\/g, "/");
  }
  const treeOf = (mode: "target" | "control", dir: string): string =>
    `${dir}/${mode === "target" ? "scan" : "ctl"}`;

  function diskEnv(mode: "target" | "control", dir: string, options: Partial<HarnessOptions>) {
    return makeEnv({
      mode,
      scanRoot: `${dir}/scan`,
      controlTreeRoot: `${dir}/ctl`,
      options,
      realIo: true,
      wrapFs: (memory) => routedFs(memory, createNodeFs(), dir),
    });
  }

  async function writeDisk(path: string, data: string | Uint8Array): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  /** 하네스가 만들었을 내용과 같은 파일로 미리 채워 둔다(이미 파일이 있는 트리). */
  async function populate(mode: "target" | "control", tree: string): Promise<void> {
    if (mode === "target") {
      for (const path of EXPECTED_E[SHA_A])
        await writeDisk(`${tree}/${path}`, reposByCommit[SHA_A][path]);
    } else {
      for (const c of controlExpectations.cases) {
        await writeDisk(`${tree}/${c.path}`, fixtureBytes(c.fixture));
      }
    }
  }

  const sortedNames = async (dir: string): Promise<string[]> => (await readdir(dir)).sort();

  for (const mode of ["target", "control"] as const) {
    for (const state of ["absent", "populated"] as const) {
      for (const lockHeld of [false, null] as const) {
        it(`${mode} 모드·트리 ${state}·lockHeld=${String(lockHeld)}: 다른 실행이 잠금을 쥐고 있으면 보호 트리를 만들거나 바꾸지 않고 LOCK_NOT_ACQUIRED로 거부한다`, async () => {
          const dir = await caseDir();
          const tree = treeOf(mode, dir);
          if (state === "populated") await populate(mode, tree);
          const owner = await acquireRunLock(createNodeRunLockPort(), {
            treePath: tree,
            runId: "owner-run",
            mode,
          });
          if (owner.state !== "ACQUIRED") throw new Error(`전제: ${owner.state}`);
          try {
            const lockBytes = await readFile(owner.handle.lockPath, "utf8");
            const treeBefore = await snapshotDisk(tree);
            const parentBefore = await sortedNames(dir);
            expect(treeBefore.exists).toBe(state === "populated");

            const env = await diskEnv(mode, dir, { lockHeld, lockRefusal: "HELD_BY_OTHER" });
            const r = await env.go();

            // 거절 사유와 자기 증거는 그대로 남는다.
            expect(r.ok).toBe(true);
            expect(r.started).toBe(false);
            expect(env.port.spawnCalls).toHaveLength(0);
            expect(r.record?.measurement.status).toBe("ENV_MISMATCH");
            expect(reasonCodes(r)).toEqual(["LOCK_NOT_ACQUIRED"]);
            expect(Object.keys(await evidenceFiles(env))).toEqual([...EVIDENCE_FILE_NAMES]);
            // 보호 트리·그 부모·소유자의 잠금 파일은 실행 전과 같다.
            expect(await snapshotDisk(tree)).toEqual(treeBefore);
            expect(await sortedNames(dir)).toEqual(parentBefore);
            expect(await readFile(owner.handle.lockPath, "utf8")).toBe(lockBytes);
          } finally {
            await releaseRunLock(createNodeRunLockPort(), owner.handle);
          }
        });
      }
    }
  }

  for (const mode of ["target", "control"] as const) {
    it(`${mode} 모드: 증거 폴더가 서버 트리 안에 있으면 하드 실패이고 잠금이 없어도 있어도 트리에 아무것도 쓰지 않는다(독립 검토 F3)`, async () => {
      for (const lockHeld of [false, true]) {
        const dir = await caseDir();
        const tree = treeOf(mode, dir);
        const env = await diskEnv(mode, dir, { lockHeld, evidenceRoot: `${tree}/ev` });
        const r = await env.go();
        expect(r.ok).toBe(false);
        expect(r.failure?.stage).toBe("config");
        expect(r.failure?.message).toContain("같거나 그 안에");
        expect(r.started).toBe(false);
        expect(await snapshotDisk(tree)).toEqual({ exists: false, dirs: [], files: {} });
      }
    });
  }

  // ── 증거 경로가 `..`·링크·상대 경로로 서버 트리 안에 돌아 들어가는 우회(외부 재검토) ──────────────
  //
  // 문자열 비교는 `<base>/outside/../tree/evidence`와 `<base>/alias/evidence`(alias → tree)를 놓친다. 증거 실행 폴더와 서버
  // 트리의 포함 관계는 실제 파일 접근과 같은 경로 의미로 판단해야 한다. 하네스를 직접 부르므로 CLI와 독립적인 보장이다.
  // 링크는 Linux에서는 심볼릭 링크, Windows에서는 junction으로 만든다(이 컴퓨터는 Windows).

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

  interface OverlapCase {
    name: string;
    /** 서버 트리에 미리 파일을 채우는가(링크는 대상이 있어야 만들 수 있다). */
    populated: boolean;
    prepare?: (ctx: { skip: () => never }, dir: string, tree: string) => Promise<void>;
    evidenceRoot: (dir: string, tree: string) => string;
    /** 증거 실행 폴더 이름. 생략하면 기본값. */
    runId?: (tree: string) => string;
  }

  const OVERLAP_CASES: OverlapCase[] = [
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
        await linkOrSkip(ctx, tree, `${dir}/evroot/run-harness-1`);
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
    for (const lockHeld of [false, null, true] as const) {
      it(`target·lockHeld=${String(lockHeld)}: 증거 경로가 ${c.name}이면 증거를 쓰기 전에 하드 실패로 거절하고 보호 트리·소유자의 잠금 파일이 그대로다`, async (ctx) => {
        const dir = await caseDir();
        const tree = treeOf("target", dir);
        if (c.populated) await populate("target", tree);
        await c.prepare?.(ctx, dir, tree);
        const owner =
          lockHeld === true
            ? null
            : await acquireRunLock(createNodeRunLockPort(), {
                treePath: tree,
                runId: "owner-run",
                mode: "target",
              });
        if (owner !== null && owner.state !== "ACQUIRED") throw new Error("전제");
        try {
          const lockBytes = owner ? await readFile(owner.handle.lockPath, "utf8") : null;
          const treeBefore = await snapshotDisk(tree);
          const parentBefore = await sortedNames(dir);

          const env = await diskEnv("target", dir, {
            lockHeld,
            evidenceRoot: c.evidenceRoot(dir, tree),
            ...(c.runId ? { runId: c.runId(tree) } : {}),
          });
          const r = await env.go();

          expect(r.ok).toBe(false);
          expect(r.failure?.stage).toBe("config");
          expect(r.failure?.message).toContain("같거나 그 안에");
          expect(r.failure?.message).not.toContain("판별하지 못했다");
          expect(r.started).toBe(false);
          expect(env.port.spawnCalls).toHaveLength(0);
          expect(await snapshotDisk(tree)).toEqual(treeBefore);
          expect(await sortedNames(dir)).toEqual(parentBefore);
          if (owner) expect(await readFile(owner.handle.lockPath, "utf8")).toBe(lockBytes);
        } finally {
          if (owner?.state === "ACQUIRED") {
            await releaseRunLock(createNodeRunLockPort(), owner.handle);
          }
        }
      });
    }
  }

  for (const mode of ["control"] as const) {
    for (const lockHeld of [false, true] as const) {
      it(`${mode}·lockHeld=${String(lockHeld)}: 대조 트리 안으로 돌아오는 증거 경로(A·B)도 거절한다`, async (ctx) => {
        const dir = await caseDir();
        const tree = treeOf(mode, dir);
        await populate(mode, tree);
        await mkdir(`${dir}/outside`, { recursive: true });
        await linkOrSkip(ctx, tree, `${dir}/alias`);
        const before = await snapshotDisk(tree);
        for (const evidenceRoot of [
          `${dir}/outside/../${basename(tree)}/evidence`,
          `${dir}/alias/evidence`,
        ]) {
          const env = await diskEnv(mode, dir, { lockHeld, evidenceRoot });
          const r = await env.go();
          expect(r.ok, evidenceRoot).toBe(false);
          expect(r.failure?.stage, evidenceRoot).toBe("config");
          expect(r.failure?.message, evidenceRoot).toContain("같거나 그 안에");
          expect(await snapshotDisk(tree), evidenceRoot).toEqual(before);
        }
      });
    }
  }

  // 링크 **뒤**의 `..`는 운영체제마다 다르게 풀린다: Linux·macOS는 링크 대상의 부모, Windows는 링크가 있는 폴더(`..`를 먼저 지운다).
  // 그래서 기대값을 어느 쪽으로 가정하지 않고 운영체제에게 묻는다(`realpath`로 `링크/..`가 어디인지). 사전식으로 접으면 Linux에서 틀린다.
  const insideReal = (candidate: string, root: string): boolean => {
    const rel = relative(root, candidate);
    return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  };

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
      const dir = await caseDir();
      const tree = treeOf("target", dir);
      await populate("target", tree);
      const target = c.target(tree, dir);
      await mkdir(target, { recursive: true });
      await linkOrSkip(ctx, target, `${dir}/l`);
      const actualDir = join(await realpath(`${dir}/l/..`), c.leaf); // 운영체제가 `l/..` 뒤를 푼 자리
      const expectInside = insideReal(actualDir, await realpath(tree));

      const owner = await acquireRunLock(createNodeRunLockPort(), {
        treePath: tree,
        runId: "owner-run",
        mode: "target",
      });
      if (owner.state !== "ACQUIRED") throw new Error("전제");
      try {
        const lockBytes = await readFile(owner.handle.lockPath, "utf8");
        const treeBefore = await snapshotDisk(tree);
        const env = await diskEnv("target", dir, {
          lockHeld: false,
          evidenceRoot: c.evidence(dir),
        });
        const r = await env.go();
        if (expectInside) {
          expect(r.ok).toBe(false);
          expect(r.failure?.message).toContain("같거나 그 안에");
        } else {
          expect(r.failure).toBeUndefined();
          expect(r.ok).toBe(true);
          // 안이 아니면 증거는 운영체제가 푼 그 자리에 실제로 쓰인다.
          expect((await readdir(join(actualDir, "run-harness-1"))).sort()).toEqual(
            [...EVIDENCE_FILE_NAMES].sort()
          );
        }
        expect(await snapshotDisk(tree)).toEqual(treeBefore);
        expect(await readFile(owner.handle.lockPath, "utf8")).toBe(lockBytes);
      } finally {
        await releaseRunLock(createNodeRunLockPort(), owner.handle);
      }
    });
  }

  for (const lockHeld of [false, true] as const) {
    it(`lockHeld=${String(lockHeld)}: 증거 경로나 서버 트리 경로를 안전하게 판별할 수 없으면(끊어진 링크) 쓰기 전에 하드 실패로 거절한다`, async (ctx) => {
      const dir = await caseDir();
      const tree = treeOf("target", dir);
      await populate("target", tree);
      const gone = `${dir}/gone`;
      await mkdir(gone, { recursive: true });
      await linkOrSkip(ctx, gone, `${dir}/dangling`);
      await rm(gone, { recursive: true }); // 링크는 남고 대상이 사라졌다
      const before = await snapshotDisk(tree);
      const parentBefore = await sortedNames(dir);
      for (const [label, options] of [
        ["증거 경로", { evidenceRoot: `${dir}/dangling/evidence` }],
        ["서버 트리 경로", { scanRoot: `${dir}/dangling/tree` }],
      ] as const) {
        const env = await diskEnv("target", dir, { lockHeld, ...options });
        const r = await env.go();
        expect(r.ok, label).toBe(false);
        expect(r.failure?.stage, label).toBe("config");
        expect(r.failure?.message, label).toContain("안전하게 판별하지 못했다");
        expect(r.started, label).toBe(false);
        expect(await snapshotDisk(tree), label).toEqual(before);
        expect(await sortedNames(dir), label).toEqual(parentBefore);
      }
    });
  }

  for (const [label, evidenceRoot] of [
    [
      "이름 접두만 비슷한 별도 폴더",
      (dir: string, tree: string) => `${dir}/${basename(tree)}-evidence`,
    ],
    ["서버 트리와 나란한 별도 폴더", (dir: string) => `${dir}/evidence-out`],
    ["링크가 가리키는 서버 트리 바깥 폴더", (dir: string) => `${dir}/alias-out/evidence`],
  ] as const) {
    it(`정상 허용: ${label}에 쓰는 증거는 기존대로 쓰이고 보호 트리는 그대로다`, async (ctx) => {
      const dir = await caseDir();
      const tree = treeOf("target", dir);
      await populate("target", tree);
      if (label.startsWith("링크")) {
        await mkdir(`${dir}/elsewhere`, { recursive: true });
        await linkOrSkip(ctx, `${dir}/elsewhere`, `${dir}/alias-out`);
      }
      const owner = await acquireRunLock(createNodeRunLockPort(), {
        treePath: tree,
        runId: "owner-run",
        mode: "target",
      });
      if (owner.state !== "ACQUIRED") throw new Error("전제");
      try {
        const lockBytes = await readFile(owner.handle.lockPath, "utf8");
        const treeBefore = await snapshotDisk(tree);
        const env = await diskEnv("target", dir, {
          lockHeld: false,
          evidenceRoot: evidenceRoot(dir, tree),
        });
        const r = await env.go();
        expect(r.failure).toBeUndefined();
        expect(r.ok).toBe(true);
        expect(reasonCodes(r)).toEqual(["LOCK_NOT_ACQUIRED"]);
        // 증거 9개가 그 별도 폴더에 실제 디스크로 쓰였다.
        const written = await readdir(join(evidenceRoot(dir, tree), "run-harness-1"));
        expect(written.sort()).toEqual([...EVIDENCE_FILE_NAMES].sort());
        expect(await snapshotDisk(tree)).toEqual(treeBefore);
        expect(await readFile(owner.handle.lockPath, "utf8")).toBe(lockBytes);
      } finally {
        await releaseRunLock(createNodeRunLockPort(), owner.handle);
      }
    });
  }

  it("이미 파일이 있는 스캔 트리는 잠금이 없어도 읽기만 한다: 어긋남은 사유로 남고 파일은 그대로다", async () => {
    const dir = await caseDir();
    const tree = treeOf("target", dir);
    await populate("target", tree);
    await writeDisk(`${tree}/src/extra.ts`, "export const extra = 0;\n");
    const before = await snapshotDisk(tree);
    const env = await diskEnv("target", dir, { lockHeld: false });
    const r = await env.go();
    expect(r.started).toBe(false);
    expect(reasonCodes(r)).toEqual(["LOCK_NOT_ACQUIRED", "SCAN_TREE_FILE_ADDED"]);
    expect(await snapshotDisk(tree)).toEqual(before);
  });

  for (const mode of ["target", "control"] as const) {
    it(`${mode} 모드: 잠금을 가진 정상 소유자(lockHeld=true)는 실제 디스크에 트리를 준비하고 COMPLETE까지 간다`, async () => {
      const dir = await caseDir();
      const tree = treeOf(mode, dir);
      const env = await diskEnv(mode, dir, { lockHeld: true });
      const r = await env.go();
      expect(r.failure).toBeUndefined();
      expect(r.started).toBe(true);
      expect(r.record?.measurement.status).toBe("COMPLETE");

      const after = await snapshotDisk(tree);
      expect(after.exists).toBe(true);
      const expected: Record<string, string> = {};
      if (mode === "target") {
        for (const p of EXPECTED_E[SHA_A]) expected[p] = sha256Hex(reposByCommit[SHA_A][p]);
      } else {
        for (const c of controlExpectations.cases)
          expected[c.path] = sha256Hex(fixtureBytes(c.fixture));
      }
      expect(after.files).toEqual(expected);
    });
  }
});

// ── 도구 버전·휠 관측 요약(toolObservation) ─────────────────────────────────────────────────────
//
// CLI가 관측한 값(toolVersionObserved·wheelSha256Observed)은 이미 사전 검사와 지문·결합에 쓰인다. toolObservation은 그 값을 어떻게
// 관측했는지의 요약이며, 하네스는 핀과의 비교를 덧붙여 run.json의 resources.tool_observation에 싣는다. 판정에는 영향이 없다.

describe("runHarness — 도구 관측 요약(toolObservation)", () => {
  interface ToolRun {
    resources?: {
      tool_observation?: {
        version_check: Record<string, unknown>;
        wheel_hash: Record<string, unknown>;
        not_established: Record<string, unknown>;
        pin: {
          version: { expected: string; observed: string | null; comparison: string };
          wheel: {
            expected_sha256: string | null;
            verified: boolean;
            observed: string | null;
            comparison: string;
          };
        };
      };
    };
    inputs: { tool_version_observed: string | null; wheel_sha256_observed: string | null };
    provenance: string;
    trust: string;
  }
  const runJson = async (env: Env): Promise<ToolRun> =>
    JSON.parse((await evidenceFiles(env))["run.json"]) as ToolRun;
  const VERSION = syntheticPin.semgrep.version;
  const codesOf = (r: HarnessResult): string[] =>
    (r.record?.measurement.reasons ?? []).map((x) => x.code);

  it("요약을 주면 run.json에 싣고, 핀과의 비교를 관측값과 따로 적는다(일치)", async () => {
    const env = await makeEnv({
      mode: "target",
      options: { toolObservation: summaryOf({ version: VERSION, wheel: WHEEL }) },
    });
    const r = await env.go();
    expect(r.ok).toBe(true);
    const run = await runJson(env);
    const t = run.resources?.tool_observation;
    expect(t?.version_check).toMatchObject({
      process_role: "version-check",
      status: "OBSERVED",
      version: VERSION,
    });
    expect(t?.pin.version).toEqual({ expected: VERSION, observed: VERSION, comparison: "MATCH" });
    expect(t?.pin.wheel).toEqual({
      expected_sha256: WHEEL,
      verified: true,
      observed: WHEEL,
      comparison: "MATCH",
    });
    expect(t?.not_established).toEqual({
      executable_provenance: "NOT_VERIFIED",
      version_output_format: "UNVERIFIED",
    });
    expect(run.inputs.tool_version_observed).toBe(VERSION);
    expect(run.inputs.wheel_sha256_observed).toBe(WHEEL);
  });

  it("요약을 주지 않으면 이 필드가 없다(기존 레코드와 같다)", async () => {
    const env = await makeEnv({ mode: "target" });
    await env.go();
    const text = (await evidenceFiles(env))["run.json"];
    expect(text).not.toContain("tool_observation");
    expect(text).not.toContain("version-check");
  });

  it("control 모드에서도 같다", async () => {
    const env = await makeEnv({
      mode: "control",
      options: { toolObservation: summaryOf({ version: VERSION, wheel: WHEEL }) },
    });
    await env.go();
    expect((await runJson(env)).resources?.tool_observation?.pin.version.comparison).toBe("MATCH");
  });

  it("판정은 요약의 영향을 받지 않는다: 같은 관측값이면 요약이 있든 없든 측정 결과가 같다", async () => {
    const plain = await makeEnv({ mode: "target" });
    const withSummary = await makeEnv({
      mode: "target",
      options: { toolObservation: summaryOf({ version: VERSION, wheel: WHEEL }) },
    });
    const a = await plain.go();
    const b = await withSummary.go();
    expect(b.record?.measurement).toEqual(a.record?.measurement);
    expect(b.record?.observed).toEqual(a.record?.observed);
    expect(b.record?.inputs).toEqual(a.record?.inputs);
  });

  it("관측한 버전이 핀과 다르면 TOOL_VERSION_MISMATCH로 거부하고 서버를 띄우지 않는다(불일치를 증거에 그대로 적는다)", async () => {
    const env = await makeEnv({
      mode: "target",
      options: {
        toolVersionObserved: "1.179.0",
        toolObservation: summaryOf({ version: "1.179.0", wheel: WHEEL }),
      },
    });
    const r = await env.go();
    expect(codesOf(r)).toContain("TOOL_VERSION_MISMATCH");
    expect(r.started).toBe(false);
    expect(env.port.spawnCalls).toHaveLength(0);
    expect((await runJson(env)).resources?.tool_observation?.pin.version).toEqual({
      expected: VERSION,
      observed: "1.179.0",
      comparison: "MISMATCH",
    });
  });

  it("관측한 휠 해시가 핀과 다르면 WHEEL_HASH_MISMATCH로 거부한다", async () => {
    const other = "c".repeat(64);
    const env = await makeEnv({
      mode: "target",
      options: {
        wheelSha256Observed: other,
        toolObservation: summaryOf({ version: VERSION, wheel: other }),
      },
    });
    const r = await env.go();
    expect(codesOf(r)).toContain("WHEEL_HASH_MISMATCH");
    expect(env.port.spawnCalls).toHaveLength(0);
    expect((await runJson(env)).resources?.tool_observation?.pin.wheel.comparison).toBe("MISMATCH");
  });

  describe("핀이 확인되지 않은 상태(실제 pin.json과 같다)", () => {
    const unverifiedPin = (): string => {
      const pin: Pin = JSON.parse(JSON.stringify(syntheticPin));
      pin.semgrep.wheel.sha256 = null;
      pin.semgrep.wheel.verified = false;
      return JSON.stringify(pin, null, 2);
    };

    it("휠 해시를 관측해도 비교할 기준이 없다: WHEEL_HASH_UNVERIFIED로 거부하고 PIN_UNVERIFIED로 적는다", async () => {
      const env = await makeEnv({
        mode: "target",
        files: { "/data/pin.json": unverifiedPin() },
        options: { toolObservation: summaryOf({ version: VERSION, wheel: WHEEL }) },
      });
      const r = await env.go();
      expect(codesOf(r)).toContain("WHEEL_HASH_UNVERIFIED");
      expect(env.port.spawnCalls).toHaveLength(0);
      const wheel = (await runJson(env)).resources?.tool_observation?.pin.wheel;
      expect(wheel).toEqual({
        expected_sha256: null,
        verified: false,
        observed: WHEEL, // 관측값은 그대로 남는다
        comparison: "PIN_UNVERIFIED",
      });
    });

    it("관측했다는 이유로 pin.json을 바꾸지 않는다: 쓰기는 증거 폴더에만 일어나고 핀 바이트는 그대로다", async () => {
      const text = unverifiedPin();
      const writes: string[] = [];
      const env = await makeEnv({
        mode: "target",
        files: { "/data/pin.json": text },
        options: { toolObservation: summaryOf({ version: VERSION, wheel: WHEEL }) },
        wrapFs: (inner) =>
          new Proxy(inner, {
            get(t, prop) {
              const value = Reflect.get(t, prop, t) as unknown;
              if (typeof value !== "function") return value;
              return (...args: unknown[]) => {
                if (prop === "writeFileExclusive" || prop === "mkdirp")
                  writes.push(String(args[0]));
                return (value as (...a: unknown[]) => unknown).apply(t, args);
              };
            },
          }),
      });
      await env.go();
      expect(writes.length).toBeGreaterThan(0);
      expect(writes.every((p) => p.startsWith("/evidence/") || p.startsWith("/scan/"))).toBe(true);
      expect(new TextDecoder().decode(await env.fs.readFile("/data/pin.json"))).toBe(text);
      expect(JSON.parse(text).semgrep.wheel).toMatchObject({ sha256: null, verified: false });
    });
  });

  it("요약이 하네스에 넘긴 관측값과 모순되면 아무것도 쓰기 전에 config 하드 실패다", async () => {
    const calls: string[] = [];
    const env = await makeEnv({
      mode: "target",
      options: { toolObservation: summaryOf({ version: "9.9.9", wheel: WHEEL }) }, // toolVersionObserved는 VERSION
      wrapFs: (inner) => recorded(inner, calls, "fs"),
    });
    const r = await env.go();
    expect(r.ok).toBe(false);
    expect(r.failure?.stage).toBe("config");
    expect(r.failure?.message).toContain("toolObservation");
    expect(calls).toEqual([]);
    expect(env.port.spawnCalls).toHaveLength(0);
  });

  it("휠 값이 모순돼도 같다", async () => {
    const env = await makeEnv({
      mode: "target",
      options: { toolObservation: summaryOf({ version: VERSION, wheel: "d".repeat(64) }) },
    });
    const r = await env.go();
    expect(r.failure?.stage).toBe("config");
  });

  it("관측하지 못한 값은 null로 남는다: 요약이 NOT_ATTEMPTED여도 핀 값이나 대조 참조 값으로 채우지 않는다", async () => {
    const env = await makeEnv({
      mode: "target",
      options: {
        toolVersionObserved: null,
        wheelSha256Observed: null,
        toolObservation: summaryOf({}),
        controlReference: SYNTHETIC_REAL_REFERENCE, // 이 참조 쪽에는 도구 버전·휠 값이 있다
      },
    });
    const r = await env.go();
    const run = await runJson(env);
    expect(run.inputs.tool_version_observed).toBeNull();
    expect(run.inputs.wheel_sha256_observed).toBeNull();
    // 대조 참조의 값은 참조 쪽 필드에만 있고, 이번 실행의 관측으로 복사되지 않는다.
    expect(r.record?.control_reference?.fingerprints.tool_version).toBe(VERSION);
    expect(r.record?.control_reference?.fingerprints.wheel_sha256).toBe(WHEEL);
    expect(codesOf(r)).toContain("TOOL_VERSION_UNVERIFIED");
    expect(codesOf(r)).toContain("WHEEL_HASH_UNVERIFIED");
    expect(r.record?.inputs.binding_sha256).toBeNull();
    expect(run.resources?.tool_observation?.pin.version.comparison).toBe("NOT_OBSERVED");
    expect(env.port.spawnCalls).toHaveLength(0);
  });

  it("결합(binding)은 관측한 도구 버전에 따라 달라지고, 관측하지 못하면 null이다", async () => {
    const binding = async (version: string | null): Promise<string | null> => {
      const env = await makeEnv({
        mode: "target",
        options: {
          toolVersionObserved: version,
          toolObservation: summaryOf({ version, wheel: WHEEL }),
        },
      });
      return (await env.go()).record?.inputs.binding_sha256 ?? null;
    };
    const a = await binding(VERSION);
    const b = await binding("1.179.0");
    const none = await binding(null);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
    expect(none).toBeNull();
  });

  it("스텁 출처는 증거에서 실제로 표시되지 않는다: provenance stub, trust SYNTHETIC이고 요약의 출처도 stub이다", async () => {
    const env = await makeEnv({
      mode: "target",
      options: {
        toolObservation: summaryOf({ version: VERSION, wheel: WHEEL, provenance: "stub" }),
      },
    });
    await env.go();
    const run = await runJson(env);
    expect(run.provenance).toBe("stub");
    expect(run.trust).toBe("SYNTHETIC");
    expect(run.resources?.tool_observation?.version_check.provenance).toBe("stub");
    expect(JSON.stringify(run)).not.toContain("REAL_UNREVIEWED");
  });

  it("도구 관측이 모두 채워져도 다른 거부 사유가 남아 있으면 서버를 띄우지 않는다(foreignServerProcesses null)", async () => {
    const env = await makeEnv({
      mode: "target",
      options: {
        foreignServerProcesses: null,
        toolObservation: summaryOf({ version: VERSION, wheel: WHEEL }),
      },
    });
    const r = await env.go();
    expect(codesOf(r)).toContain("FOREIGN_SERVER_PROCESS");
    expect(codesOf(r)).not.toContain("TOOL_VERSION_UNVERIFIED");
    expect(codesOf(r)).not.toContain("WHEEL_HASH_UNVERIFIED");
    expect(r.started).toBe(false);
    expect(env.port.spawnCalls).toHaveLength(0);
  });
});

// ── 같은 트리의 다른 서버 프로세스(foreignServerProcesses) ───────────────────────────────────────
//
// 하네스는 foreignServerProcesses가 **0으로 확정**되고 잠금을 가졌을 때만 서버 트리를 만들거나 쓴다. 1 이상이거나 null(확인하지
// 못함)이면 트리 준비 쓰기도 서버 기동도 하지 않는다. 이 보장은 CLI가 아니라 runHarness에 있다. 관측은 조회 시점의 사실이며,
// 이 시험의 건수는 호출자가 정해 넘긴 값이다(실제 운영체제 관측이 아니다).

describe("runHarness — 같은 트리의 다른 서버 프로세스", () => {
  const SCAN = "/scan/tree";
  const CTL = "/ctl";
  const treeOf = (mode: "target" | "control"): string => (mode === "target" ? SCAN : CTL);
  const codes = (r: HarnessResult): string[] =>
    (r.record?.measurement.reasons ?? []).map((x) => x.code);

  async function treeSnapshot(env: Env, tree: string): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    const files = await env.fs.listFilesRecursive(tree).catch(() => [] as string[]);
    for (const f of files) out[f] = new TextDecoder().decode(await env.fs.readFile(`${tree}/${f}`));
    return out;
  }
  const noTreeDirs = (env: Env, tree: string): string[] =>
    env.fs.directories.filter((d) => d === tree || d.startsWith(`${tree}/`));

  for (const mode of ["target", "control"] as const) {
    for (const foreign of [null, 1, 3] as const) {
      it(`${mode} 모드·잠금 있음·foreignServerProcesses=${String(foreign)}: 서버 트리를 만들지 않고 서버를 띄우지 않으며 FOREIGN_SERVER_PROCESS만 남는다`, async () => {
        const env = await makeEnv({
          mode,
          scanRoot: SCAN,
          controlTreeRoot: CTL,
          options: { lockHeld: true, foreignServerProcesses: foreign },
        });
        const r = await env.go();
        expect(r.ok).toBe(true);
        expect(r.started).toBe(false);
        expect(env.port.spawnCalls).toHaveLength(0);
        expect(r.record?.measurement.status).toBe("ENV_MISMATCH");
        expect(codes(r)).toEqual(["FOREIGN_SERVER_PROCESS"]);
        // 비어 있는 트리를 어긋남으로 판정하지 않는다 — 막는 원인은 다른 서버다.
        expect(await treeSnapshot(env, treeOf(mode))).toEqual({});
        expect(noTreeDirs(env, treeOf(mode))).toEqual([]);
        expect(Object.keys(await evidenceFiles(env))).toEqual([...EVIDENCE_FILE_NAMES]);
      });
    }
  }

  for (const mode of ["target", "control"] as const) {
    it(`${mode} 모드·잠금 있음·foreignServerProcesses=0: 트리를 준비하고 서버를 띄워 COMPLETE까지 간다(0일 때만)`, async () => {
      const env = await makeEnv({
        mode,
        scanRoot: SCAN,
        controlTreeRoot: CTL,
        options: { lockHeld: true, foreignServerProcesses: 0 },
      });
      const r = await env.go();
      expect(r.started).toBe(true);
      expect(r.record?.measurement.status).toBe("COMPLETE");
      expect(Object.keys(await treeSnapshot(env, treeOf(mode))).length).toBeGreaterThan(0);
    });
  }

  it("0이어도 잠금이 없으면 트리를 만들지 않는다(두 조건이 모두 필요하다)", async () => {
    const env = await makeEnv({
      mode: "target",
      scanRoot: SCAN,
      options: { lockHeld: false, foreignServerProcesses: 0 },
    });
    const r = await env.go();
    expect(codes(r)).toEqual(["LOCK_NOT_ACQUIRED"]);
    expect(await treeSnapshot(env, SCAN)).toEqual({});
    expect(env.port.spawnCalls).toHaveLength(0);
  });

  for (const mode of ["target", "control"] as const) {
    for (const foreign of [null, 2] as const) {
      it(`${mode} 모드·이미 파일이 있는 트리·foreignServerProcesses=${String(foreign)}: 읽기만 하고 파일은 그대로이며 어긋남은 사유로 남는다`, async () => {
        const tree = treeOf(mode);
        const populated: Record<string, string | Uint8Array> = {};
        if (mode === "target") {
          for (const p of EXPECTED_E[SHA_A]) populated[`${tree}/${p}`] = reposByCommit[SHA_A][p];
          populated[`${tree}/src/extra.ts`] = "export const extra = 0;\n"; // 기대하지 않은 파일
        } else {
          for (const c of controlExpectations.cases)
            populated[`${tree}/${c.path}`] = fixtureBytes(c.fixture);
          populated[`${tree}/extra.ts`] = "export const extra = 0;\n";
        }
        const env = await makeEnv({
          mode,
          scanRoot: SCAN,
          controlTreeRoot: CTL,
          files: populated,
          options: { lockHeld: true, foreignServerProcesses: foreign },
        });
        const before = await treeSnapshot(env, tree);
        const r = await env.go();
        expect(r.started).toBe(false);
        expect(codes(r)).toContain("FOREIGN_SERVER_PROCESS");
        expect(
          codes(r).some((c) => c === "SCAN_TREE_FILE_ADDED" || c === "CONTROL_TREE_MISMATCH")
        ).toBe(true);
        expect(await treeSnapshot(env, tree)).toEqual(before);
      });
    }
  }

  describe("관측 요약(foreignProcessObservation)", () => {
    interface ForeignRun {
      resources?: {
        foreign_server_observation?: unknown;
        run_lock?: unknown;
        tool_observation?: unknown;
      };
    }
    const runJson = async (env: Env): Promise<ForeignRun> =>
      JSON.parse((await evidenceFiles(env))["run.json"]) as ForeignRun;

    it("요약을 주면 run.json의 resources.foreign_server_observation에 그대로 싣는다(상태·건수·이유 토큰뿐)", async () => {
      const summary = foreignSummaryOf(1, {
        listing: { source: "linux-proc", provenance: "stub", rows: 7 },
      });
      const env = await makeEnv({
        mode: "target",
        scanRoot: SCAN,
        options: { foreignServerProcesses: 1, foreignProcessObservation: summary },
      });
      const r = await env.go();
      expect(codes(r)).toEqual(["FOREIGN_SERVER_PROCESS"]);
      const run = await runJson(env);
      expect(run.resources?.foreign_server_observation).toEqual(summary);
      // 요약은 판정의 입력이 아니다: 사유 상세는 건수에서 나온다.
      expect(r.record?.measurement.reasons[0].detail).toContain("1개");
    });

    it("요약을 주지 않으면 이 필드는 레코드에 없다(기존 레코드와 같다)", async () => {
      const env = await makeEnv({ mode: "target", scanRoot: SCAN, options: {} });
      const r = await env.go();
      expect(r.record?.measurement.status).toBe("COMPLETE");
      const run = await runJson(env);
      expect(JSON.stringify(run)).not.toContain("foreign_server_observation");
    });

    it("다른 자원 요약과 함께 있어도 서로 섞이지 않는다", async () => {
      const summary = foreignSummaryOf(0);
      const env = await makeEnv({
        mode: "target",
        scanRoot: SCAN,
        options: {
          foreignServerProcesses: 0,
          foreignProcessObservation: summary,
          toolObservation: summaryOf({ version: syntheticPin.semgrep.version, wheel: WHEEL }),
        },
      });
      const r = await env.go();
      expect(r.record?.measurement.status).toBe("COMPLETE");
      const run = await runJson(env);
      expect(run.resources?.foreign_server_observation).toEqual(summary);
      expect(run.resources?.tool_observation).toBeDefined();
    });

    it("요약의 건수가 넘긴 건수와 다르면 증거를 쓰기 전에 하드 실패다 — 트리도 서버도 건드리지 않는다", async () => {
      const cases: [number | null, number | null][] = [
        [0, 1], // 요약은 0인데 1을 넘김
        [1, 0], // 요약은 1인데 0을 넘김(0이면 트리를 만들게 된다)
        [null, 0], // 요약은 확정하지 못했는데 0을 넘김
        [0, null],
      ];
      for (const [inSummary, passed] of cases) {
        const env = await makeEnv({
          mode: "target",
          scanRoot: SCAN,
          options: {
            foreignServerProcesses: passed,
            foreignProcessObservation: foreignSummaryOf(inSummary),
          },
        });
        const r = await env.go();
        expect(r.ok, `${inSummary}/${passed}`).toBe(false);
        expect(r.failure?.stage).toBe("config");
        expect(r.failure?.message).toContain("foreignProcessObservation");
        expect(r.started).toBe(false);
        expect(env.port.spawnCalls).toHaveLength(0);
        expect(await env.fs.exists("/evidence/run-harness-1")).toBe(false);
        expect(await treeSnapshot(env, SCAN)).toEqual({});
      }
    });

    it("조회 시점이 아닌 요약이나 상태와 건수가 모순인 요약도 거절한다", async () => {
      for (const bad of [
        { ...foreignSummaryOf(0), scope: "ALWAYS" as unknown as "POINT_IN_TIME" },
        { ...foreignSummaryOf(0), status: "INCONCLUSIVE" as const },
        { ...foreignSummaryOf(null), count_is_lower_bound: true },
      ]) {
        const env = await makeEnv({
          mode: "target",
          scanRoot: SCAN,
          options: {
            foreignServerProcesses: bad.foreign_server_processes,
            foreignProcessObservation: bad,
          },
        });
        const r = await env.go();
        expect(r.ok).toBe(false);
        expect(r.failure?.stage).toBe("config");
      }
    });
  });
});
