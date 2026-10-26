import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { VirtualClock } from "./clock";
import { EVIDENCE_FILE_NAMES } from "./evidence";
import {
  runEngineDiagnostic,
  runHarness,
  type HarnessOptions,
  type HarnessResult,
} from "./harness";
import { controlReferenceFromValue } from "./reference-record";
import { buildControlWorld, declaredRealPort } from "./testing/control-world";
import { qualifiedNegativeControls } from "./testing/evaluate-fixtures";
import { FakePort } from "./testing/fake-process";
import { MemoryFs } from "./testing/memory-fs";
import { drive, stubPort } from "./testing/stub-lsp";
import type {
  NegativeControlInput,
  NegativeControlResult,
  NegativeControlSuiteSummary,
  ProcessPort,
  Provenance,
} from "./types";
import { defaultNegativeControls } from "./control";

// 하네스 수준 시험: 엔진 진단 진입점의 시작 조건, 정상 진입점의 불변, 음성 대조 스위트의 연결. 모든 실행은 메모리 파일 시스템과 스텁
// 엔진 위에서 돈다. "real이라고 선언한 포트"를 쓰는 시험은 기록 연결 경로(자격 계산·읽기 어댑터)를 합성 입력으로 확인하려는 것이며 실제
// 실행의 증거가 아니다.

function fixtureBytes(fixture: string): Uint8Array {
  return readFileSync(fileURLToPath(new URL(`../../${fixture}`, import.meta.url)));
}

const world = buildControlWorld(fixtureBytes);
const ADDED = "/cache/semgrep-rules/javascript/zz-added.yaml";

interface Build {
  files?: Record<string, string | Uint8Array>;
  options?: Partial<HarnessOptions>;
  wrapPort?: (port: FakePort) => ProcessPort;
  runId?: string;
}

function build(input: Build = {}) {
  const fs = new MemoryFs({ ...world.files, ...(input.files ?? {}) });
  const clock = new VirtualClock();
  const { port } = stubPort(world.scriptFor("/ctl"), clock);
  const process = input.wrapPort ? input.wrapPort(port) : port;
  const options: HarnessOptions = {
    mode: "control",
    targetSha: null,
    runId: input.runId ?? "run-diag-1",
    dataDir: world.paths.dataDir,
    harnessRoot: world.paths.harnessRoot,
    evidenceRoot: world.paths.evidenceRoot,
    rulesCacheRoot: world.paths.rulesCacheRoot,
    scanRoot: "/scan/unused",
    controlFixturesRoot: world.paths.fixturesRoot,
    controlTreeRoot: "/ctl",
    spawn: { command: "/stub/semgrep", args: ["lsp"], cwd: "/cache", env: { PATH: "/usr/bin" } },
    limits: world.limits,
    settings: world.settings,
    controlReference: null,
    toolVersionObserved: world.data.pin.semgrep.version,
    wheelSha256Observed: world.data.pin.semgrep.wheel.sha256,
    lockHeld: true,
    foreignServerProcesses: 0,
    metricsReceiverHits: 0,
    ...(input.options ?? {}),
  };
  const git = {
    async resolveCommit(): Promise<never> {
      throw new Error("control 모드에서는 git을 쓰지 않는다");
    },
    async lsTree(): Promise<never> {
      throw new Error("control 모드에서는 git을 쓰지 않는다");
    },
    async readBlob(): Promise<never> {
      throw new Error("control 모드에서는 git을 쓰지 않는다");
    },
  };
  const deps = { fs, git, process, clock };
  const run = (go: typeof runHarness): Promise<HarnessResult> =>
    drive(clock, go(deps, options), 10 * 3_600_000);
  return {
    fs,
    port,
    options,
    normal: () => run(runHarness),
    diagnostic: () => run(runEngineDiagnostic),
  };
}

const reasonCodes = (r: HarnessResult): string[] => [
  ...new Set((r.record?.measurement.reasons ?? []).map((x) => x.code)),
];

describe("runEngineDiagnostic — 시작 조건", () => {
  it("입력 변형이 부른 사유(규칙 파일 추가)만 있으면 사유를 판정에 담은 채 엔진을 띄운다", async () => {
    const b = build({ files: { [ADDED]: "# added\n" } });
    const r = await b.diagnostic();
    expect(r.ok).toBe(true);
    expect(r.started).toBe(true);
    expect(b.port.spawnCalls).toHaveLength(1);
    expect(r.record?.measurement.status).toBe("MANIFEST_MISMATCH");
    expect(reasonCodes(r)).toEqual(expect.arrayContaining(["RULES_FILE_ADDED"]));
    expect(r.record?.measurement.phases_reached).toContain("PH1");
    expect(r.record?.resources?.engine_diagnostic).toEqual({
      policy: "ENGINE_DIAGNOSTIC",
      started_despite_refusals: true,
      refusal_codes: ["RULES_FILE_ADDED", "RULES_LIST_HASH_MISMATCH"],
    });
    for (const name of EVIDENCE_FILE_NAMES) {
      expect(await b.fs.exists(`/evidence/run-diag-1/${name}`), name).toBe(true);
    }
  });

  it("같은 입력을 정상 진입점(runHarness)으로 돌리면 엔진을 띄우지 않는다 — 정상 경로의 검증은 그대로다", async () => {
    const b = build({ files: { [ADDED]: "# added\n" } });
    const r = await b.normal();
    expect(r.ok).toBe(true);
    expect(r.started).toBe(false);
    expect(b.port.spawnCalls).toEqual([]);
    expect(r.record?.measurement.status).toBe("MANIFEST_MISMATCH");
    expect(r.record?.measurement.phases_reached).toEqual(["PH0"]);
    expect(r.record?.resources?.engine_diagnostic).toBeUndefined();
  });

  it("설정 검사 사유(알 수 없는 키)도 변형이 부른 사유라 진단은 띄운다", async () => {
    const withUnknownKey = {
      scan: {
        ci: false,
        configuration: ["semgrep-rules/javascript", "semgrep-rules/typescript"],
        maxTargetBytes: 1000000,
        onlyGitDirty: false,
        pro_intrafile: false,
        timeout: 5,
        timeoutThreshold: 3,
      },
      metrics: { enabled: false, negativeControlUnknownKey: true },
    };
    const b = build({ options: { initializationOptions: withUnknownKey } });
    const r = await b.diagnostic();
    expect(r.started).toBe(true);
    expect(r.record?.measurement.status).toBe("SETTINGS_MISMATCH");
    expect(reasonCodes(r)).toContain("SETTINGS_KEY_NOT_ALLOWED");
  });

  it("변형이 부른 사유 말고 다른 사유가 하나라도 있으면 진단도 띄우지 않는다(도구·휠·환경변수·잠금·다른 서버·대조 입력)", async () => {
    const cases: [string, Build][] = [
      ["도구 버전 불일치", { options: { toolVersionObserved: "0.0.1" } }],
      ["휠 미관측", { options: { wheelSha256Observed: null } }],
      [
        "허용되지 않은 환경변수",
        {
          options: {
            spawn: {
              command: "/stub/semgrep",
              args: ["lsp"],
              cwd: "/cache",
              env: { PATH: "/usr/bin", SEMGREP_NOT_ALLOWED: "x" },
            },
          },
        },
      ],
      ["잠금 없음", { options: { lockHeld: false } }],
      ["잠금 불명", { options: { lockHeld: null } }],
      ["다른 서버 있음", { options: { foreignServerProcesses: 1 } }],
      ["다른 서버 불명", { options: { foreignServerProcesses: null } }],
      [
        "대조 예제 바이트 변경",
        {
          files: {
            [`/repo/${world.expectations.cases[0].fixture}`]: "바뀐 정적 입력\n",
          },
        },
      ],
    ];
    for (const [name, extra] of cases) {
      const b = build({ ...extra, files: { [ADDED]: "# added\n", ...(extra.files ?? {}) } });
      const r = await b.diagnostic();
      expect(r.started, name).toBe(false);
      expect(b.port.spawnCalls, name).toEqual([]);
      expect(r.record?.measurement.status, name).not.toBe("COMPLETE");
    }
  });

  it("사유가 없는 깨끗한 입력에서는 정상 실행과 같은 결과(COMPLETE, 같은 결합)다 — 진단 표시만 다르다", async () => {
    const normal = await build({ runId: "run-n" }).normal();
    const diag = await build({ runId: "run-d" }).diagnostic();
    expect(normal.record?.measurement.status).toBe("COMPLETE");
    expect(diag.record?.measurement.status).toBe("COMPLETE");
    expect(diag.record?.inputs).toEqual(normal.record?.inputs);
    expect(diag.record?.resources?.engine_diagnostic).toEqual({
      policy: "ENGINE_DIAGNOSTIC",
      started_despite_refusals: false,
      refusal_codes: [],
    });
    expect(normal.record?.resources?.engine_diagnostic).toBeUndefined();
  });

  it("control 모드에서만 쓰고 음성 대조 스위트를 가질 수 없다(하드 실패, 아무것도 쓰지 않는다)", async () => {
    const target = await build({
      options: { mode: "target", targetSha: "a".repeat(40) },
    }).diagnostic();
    expect(target.ok).toBe(false);
    expect(target.failure?.stage).toBe("config");
    const withSuite = build({
      options: { negativeControlSuite: suiteInput(defaultNegativeControls(), null, "stub") },
    });
    const r = await withSuite.diagnostic();
    expect(r.ok).toBe(false);
    expect(r.failure?.stage).toBe("config");
    expect(withSuite.port.spawnCalls).toEqual([]);
    expect(await withSuite.fs.exists("/evidence/run-diag-1")).toBe(false);
  });
});

// ── 스위트 연결 ──────────────────────────────────────────────────

function summaryOf(
  entries: readonly NegativeControlResult[],
  over: Partial<NegativeControlSuiteSummary> = {}
): NegativeControlSuiteSummary {
  const count = (s: NegativeControlResult["status"]) =>
    entries.filter((e) => e.status === s).length;
  return {
    accepted: true,
    rejection: null,
    suite_id: "nc-test",
    provenance: "stub",
    binding_sha256: null,
    counts: { pass: count("PASS"), fail: count("FAIL"), not_run: count("NOT_RUN") },
    outcomes: [],
    problems: [],
    ...over,
  };
}

function suiteInput(
  entries: readonly NegativeControlResult[],
  binding: string | null,
  provenance: Provenance,
  summary: Partial<NegativeControlSuiteSummary> = {}
): NegativeControlInput {
  return {
    entries,
    bindingSha256: binding,
    provenance,
    summary: summaryOf(entries, { provenance, binding_sha256: binding, ...summary }),
  };
}

/** 이 세계에서 하네스가 계산하는 결합을 한 번 돌려 알아낸다. */
async function bindingOfWorld(): Promise<string> {
  const r = await build({ runId: "run-binding" }).normal();
  const binding = r.record?.inputs.binding_sha256;
  if (!binding) throw new Error("결합을 얻지 못했다");
  return binding;
}

describe("runHarness — 음성 대조 스위트 연결", () => {
  it("주지 않으면 16개 전부 NOT_RUN이고 run.json에 스위트 요약이 없다(기존 기록과 같다)", async () => {
    const r = await build().normal();
    expect(r.record?.control_assertions.negative_controls).toEqual(defaultNegativeControls());
    expect(r.record?.resources?.negative_control_suite).toBeUndefined();
    expect(r.record?.not_executed.negative_controls_engine).toBe("NOT_RUN");
  });

  it("결합과 출처가 맞는 스위트는 항목이 control_assertions와 요약에 연결된다 — 스텁 출처이면 자격은 PROVENANCE_REAL 하나만 못 채운다", async () => {
    const binding = await bindingOfWorld();
    const entries = qualifiedNegativeControls(binding);
    const b = build({
      runId: "run-suite-stub",
      options: { negativeControlSuite: suiteInput(entries, binding, "stub") },
    });
    const r = await b.normal();
    const rec = r.record;
    expect(rec?.control_assertions.negative_controls).toEqual(entries);
    expect(rec?.control_assertions.status).toBe("PASS");
    expect(rec?.resources?.negative_control_suite).toMatchObject({
      accepted: true,
      rejection: null,
      counts: { pass: 16, fail: 0, not_run: 0 },
    });
    expect(rec?.not_executed.negative_controls_engine).toBe("UNVERIFIED");
    // 자격: 스텁 실행은 어떤 경우에도 참조가 될 수 없다. 못 채운 요구는 출처 하나뿐이다.
    expect(rec?.trust).toBe("SYNTHETIC");
    expect(rec?.reference_qualification.eligible).toBe(false);
    expect(
      rec?.reference_qualification.requirements.filter((q) => !q.satisfied).map((q) => q.id)
    ).toEqual(["PROVENANCE_REAL"]);
    // 읽기 어댑터도 스텁(SYNTHETIC) 기록을 참조로 받지 않는다.
    const loaded = controlReferenceFromValue(JSON.parse(JSON.stringify(rec)), world.expectations);
    expect(loaded.reference).toBeNull();
    expect(loaded.rejection).toContain("TRUST_SYNTHETIC");
  });

  it("[real이라고 선언한 합성 포트] 항목 → control_assertions → reference_qualification → run.json → 읽기 어댑터까지 이어진다", async () => {
    const real = (port: FakePort): ProcessPort => declaredRealPort(port);
    const bindingRun = await build({ runId: "run-binding-real", wrapPort: real }).normal();
    const binding = bindingRun.record?.inputs.binding_sha256 as string;
    const entries = qualifiedNegativeControls(binding);
    const b = build({
      runId: "run-suite-real",
      wrapPort: real,
      options: { negativeControlSuite: suiteInput(entries, binding, "real") },
    });
    const r = await b.normal();
    const rec = r.record;
    expect(rec?.provenance).toBe("real"); // 선언일 뿐이다 — 실제 Semgrep을 실행한 것이 아니다
    expect(rec?.reference_qualification.eligible).toBe(true);
    const text = new TextDecoder().decode(await b.fs.readFile("/evidence/run-suite-real/run.json"));
    const loaded = controlReferenceFromValue(JSON.parse(text), world.expectations);
    expect(loaded.rejection).toBeNull();
    expect(loaded.reference?.eligible).toBe(true);
    expect(loaded.reference?.negative_controls).toHaveLength(16);
    expect(loaded.reference?.fingerprints.binding_sha256).toBe(binding);
  });

  it("결합이 이 실행과 다르면 항목을 쓰지 않는다(전부 NOT_RUN) — 이유가 증거에 남고 자격은 음성 대조에서 막힌다", async () => {
    const binding = await bindingOfWorld();
    const other = "c".repeat(64);
    const b = build({
      runId: "run-suite-mismatch",
      options: {
        negativeControlSuite: suiteInput(qualifiedNegativeControls(other), other, "stub"),
      },
    });
    const rec = (await b.normal()).record;
    expect(rec?.control_assertions.negative_controls).toEqual(defaultNegativeControls());
    expect(rec?.resources?.negative_control_suite).toMatchObject({
      accepted: false,
      rejection: "BINDING_MISMATCH",
      counts: { pass: 16, fail: 0, not_run: 0 }, // 받은 요약의 선언이다 — 받아들이지 않았으므로 항목에는 반영되지 않는다
    });
    expect(binding).not.toBe(other);
  });

  it("출처가 이 실행과 다르면 쓰지 않는다 — 스텁 스위트를 real 실행에 붙일 수 없다", async () => {
    const real = (port: FakePort): ProcessPort => declaredRealPort(port);
    const bindingRun = await build({ runId: "run-binding-real2", wrapPort: real }).normal();
    const binding = bindingRun.record?.inputs.binding_sha256 as string;
    const b = build({
      runId: "run-suite-prov",
      wrapPort: real,
      options: {
        negativeControlSuite: suiteInput(qualifiedNegativeControls(binding), binding, "stub"),
      },
    });
    const rec = (await b.normal()).record;
    expect(rec?.control_assertions.negative_controls).toEqual(defaultNegativeControls());
    expect(rec?.resources?.negative_control_suite).toMatchObject({
      accepted: false,
      rejection: "PROVENANCE_MISMATCH",
    });
    expect(rec?.reference_qualification.eligible).toBe(false);
  });

  it("읽는 쪽이 거절한 스위트(accepted=false)나 결합을 알 수 없는 스위트는 항목을 만들지 않는다", async () => {
    const rejected = suiteInput(defaultNegativeControls(), null, "stub", {
      accepted: false,
      rejection: "FILE_NOT_FOUND",
    });
    const a = (
      await build({ runId: "run-s1", options: { negativeControlSuite: rejected } }).normal()
    ).record;
    expect(a?.resources?.negative_control_suite).toMatchObject({
      accepted: false,
      rejection: "FILE_NOT_FOUND",
    });
    expect(a?.control_assertions.negative_controls).toEqual(defaultNegativeControls());
    const noBinding = suiteInput(qualifiedNegativeControls("d".repeat(64)), null, "stub");
    const c = (
      await build({ runId: "run-s2", options: { negativeControlSuite: noBinding } }).normal()
    ).record;
    expect(c?.resources?.negative_control_suite).toMatchObject({
      accepted: false,
      rejection: "BINDING_UNAVAILABLE",
    });
  });

  it("요약의 개수 선언을 믿지 않는다: 받은 항목에서 다시 센다", async () => {
    const binding = await bindingOfWorld();
    const entries = defaultNegativeControls(); // 전부 NOT_RUN
    const lying = suiteInput(entries, binding, "stub", {
      counts: { pass: 16, fail: 0, not_run: 0 },
    });
    const rec = (
      await build({ runId: "run-s3", options: { negativeControlSuite: lying } }).normal()
    ).record;
    expect(rec?.resources?.negative_control_suite).toMatchObject({
      accepted: true,
      counts: { pass: 0, fail: 0, not_run: 16 },
    });
    expect(rec?.not_executed.negative_controls_engine).toBe("NOT_RUN");
  });

  it("항목의 결합이 스위트 결합과 달라도 자격 계산이 막는다(NEGATIVE_BINDING_MATCH)", async () => {
    const real = (port: FakePort): ProcessPort => declaredRealPort(port);
    const bindingRun = await build({ runId: "run-binding-real3", wrapPort: real }).normal();
    const binding = bindingRun.record?.inputs.binding_sha256 as string;
    const entries = qualifiedNegativeControls("e".repeat(64)); // 항목의 결합만 다르다
    const rec = (
      await build({
        runId: "run-s4",
        wrapPort: real,
        options: { negativeControlSuite: suiteInput(entries, binding, "real") },
      }).normal()
    ).record;
    expect(rec?.reference_qualification.eligible).toBe(false);
    expect(
      rec?.reference_qualification.requirements.filter((q) => !q.satisfied).map((q) => q.id)
    ).toEqual(["NEGATIVE_BINDING_MATCH"]);
  });

  it("target 모드는 스위트를 가질 수 없다(하드 실패)", async () => {
    const r = await build({
      options: {
        mode: "target",
        targetSha: "a".repeat(40),
        negativeControlSuite: suiteInput(defaultNegativeControls(), null, "stub"),
      },
    }).normal();
    expect(r.ok).toBe(false);
    expect(r.failure?.stage).toBe("config");
  });
});

describe("읽기 어댑터 — 엔진 진단 기록은 대조 참조가 아니다", () => {
  it("[real이라고 선언한 합성 포트] 사유가 없는 깨끗한 진단 기록이어도 DIAGNOSTIC_RUN으로 거절한다", async () => {
    const real = (port: FakePort): ProcessPort => declaredRealPort(port);
    const b = build({ runId: "run-diag-real", wrapPort: real });
    await b.diagnostic();
    const text = new TextDecoder().decode(await b.fs.readFile("/evidence/run-diag-real/run.json"));
    const loaded = controlReferenceFromValue(JSON.parse(text), world.expectations);
    expect(loaded.reference).toBeNull();
    expect(loaded.rejection).toContain("DIAGNOSTIC_RUN");
  });
});
