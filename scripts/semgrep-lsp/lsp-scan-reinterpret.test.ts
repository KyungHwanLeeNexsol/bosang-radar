import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { VirtualClock } from "./clock";
import { buildLspMinEnv } from "./lsp-min";
import {
  SCAN_ADMIN_CONTEXT_KIND,
  SCAN_ADMIN_CONTEXT_SCHEMA,
  SCAN_REINTERPRETATION_SCHEMA,
  reinterpretScanRun,
  runScanReinterpretCli,
  type ScanReinterpretIo,
} from "./lsp-scan-reinterpret";
import type { ScanFacts } from "./lsp-scan-record";
import { runScanObservation, type ScanRequest } from "./lsp-scan-run";
import { FakeMetricsReceiver } from "./testing/fake-metrics";
import { MemoryArtifactHasher } from "./testing/memory-artifact";
import { MemoryFs } from "./testing/memory-fs";
import { CORE, EXE, STUB_VERSION, URL as METRICS_URL } from "./testing/rules-facts";
import { crlf } from "./testing/rules-fixtures";
import { SCAN_WORK, goodNotification, scanLay as layout } from "./testing/scan-fixtures";
import { adminContextFor, runnerJsonFromFacts as runnerJsonBase } from "./testing/scan-runner-json";
import { drive } from "./testing/stub-lsp";
import { FsBackedHasher } from "./testing/stub-lsp-rules";
import {
  happyAfterDidOpen,
  scanPort,
  type ScanScript,
  type ScanStep,
} from "./testing/stub-lsp-scan";
import { SyntheticLister, row, snapshotOf } from "./testing/synthetic-processes";

const PROBE_BYTES = new Uint8Array(
  readFileSync(new URL("./data/lsp-rules-1-probe.yaml", import.meta.url))
);
const TARGET_BYTES = new Uint8Array(
  readFileSync(new URL("./data/lsp-scan-1-target.txt", import.meta.url))
);
const HOME_FINGERPRINT = `${layout.homeDir}/.semgrep/cache/fingerprinted_ignored_findings/ws.txt`;
const OK = "SCAN_RESPONSE_OBSERVED";
const ENV_NAMES = Object.keys(buildLspMinEnv(layout, "C:/Windows", METRICS_URL));
const runnerJsonFromFacts = (f: ScanFacts, withBytes = true): Record<string, unknown> =>
  runnerJsonBase(f, { envNames: ENV_NAMES, withBytes });

/** 가상 시계 위에서 정말로 실행기를 돌려 사실을 얻는다 (재해석 입력은 실행기가 남긴 원문이다). */
async function runInProcess(script: Partial<ScanScript> = {}) {
  const clock = new VirtualClock();
  const fs = new MemoryFs();
  const hasher = new FsBackedHasher(fs, new MemoryArtifactHasher({ [CORE]: "core-binary-v1" }));
  const { port, children } = scanPort(
    {
      lay: layout,
      init: { kind: "result" },
      onShutdown: () => void fs.writeFileExclusive(HOME_FINGERPRINT, new Uint8Array()),
      ...script,
    },
    clock
  );
  const lister = new SyntheticLister(async () => ({
    ok: true as const,
    snapshot: snapshotOf(
      children[0] && !children[0].hasExitedNow
        ? [
            row({ pid: 4242, ppid: 100, name: "semgrep.exe" }),
            row({ pid: 5000, ppid: 4242, name: "python.exe" }),
          ]
        : []
    ),
  }));
  const request: ScanRequest = {
    runId: "run-1",
    command: EXE,
    args: ["lsp", "--debug"],
    layout,
    env: buildLspMinEnv(layout, "C:/Windows", METRICS_URL),
    expectedVersion: STUB_VERSION,
    artifacts: [{ label: "semgrep-core", path: CORE }],
    probeBytes: PROBE_BYTES,
    targetBytes: TARGET_BYTES,
  };
  return drive(
    clock,
    runScanObservation(
      { process: port, clock, fs, receiver: new FakeMetricsReceiver({ hits: 0 }), lister, hasher },
      request
    )
  );
}

const asRec = (v: unknown): Record<string, unknown> => v as Record<string, unknown>;

describe("재해석은 실행기가 남긴 원문에서 같은 판정을 다시 만든다", () => {
  const scenarios: [string, Partial<ScanScript>][] = [
    ["정상 성공", {}],
    ["마감까지 아무것도 오지 않음(SCAN_TIMEOUT)", { afterDidOpen: [] }],
    ["진단만 있고 로그가 없음", { afterDidOpen: [{ atMs: 45, stdout: goodNotification() }] }],
    [
      "중복 알림",
      { afterDidOpen: happyAfterDidOpen({ messages: [goodNotification(), goodNotification()] }) },
    ],
    [
      "금지 신호로 실시간 중단",
      {
        afterDidOpen: [
          ...happyAfterDidOpen(),
          { atMs: 1_000, stderr: crlf(["Scanning workspace"]) } as ScanStep,
        ],
      },
    ],
    ["서버가 settle 중에 끝남", { exitAfterDidOpenMs: 1_000 }],
  ];
  for (const [name, script] of scenarios) {
    it(`${name}: 재해석 판정 = 실행기 판정, 세 결과가 서로 독립이다`, async () => {
      const { record, facts } = await runInProcess(script);
      const re = reinterpretScanRun(runnerJsonFromFacts(facts), adminContextFor(facts, SCAN_WORK));
      expect(re.schema).toBe(SCAN_REINTERPRETATION_SCHEMA);
      expect(re.admin.contextProblems).toEqual([]);
      expect(re.admin.externalReasons).toEqual([]);
      expect(re.record.verdict).toBe(record.verdict);
      expect(re.record.status).toBe(record.status);
      expect(re.record.evidence.both_complete_at_ms).toBe(record.evidence.both_complete_at_ms);
      expect(re.record.evidence.tracker_comparison).toBe("MATCH");
      expect(re.record.outcomes.system_recovery).toEqual({ status: "EQUAL", detail: [] });
      expect(re.record.outcomes.process_cleanup.ok).toBe(record.outcomes.process_cleanup.ok);
    });
  }

  it("원문을 .bin 으로 따로 둔 경우에도 같은 판정이 나오고, 바이트가 바뀌면 해시 불일치로 관측 불성립이다", async () => {
    const { record, facts } = await runInProcess();
    const json = runnerJsonFromFacts(facts, false);
    const raw = { stdout: facts.stdout.bytes, stderr: facts.stderr.bytes };
    const re = reinterpretScanRun(json, adminContextFor(facts, SCAN_WORK), raw);
    expect(re.record.verdict).toBe(record.verdict);
    const altered = facts.stderr.bytes.slice();
    altered[10] ^= 1;
    const bad = reinterpretScanRun(json, adminContextFor(facts, SCAN_WORK), {
      stdout: raw.stdout,
      stderr: altered,
    });
    expect(bad.record.status).toBe("NOT_OBSERVED");
    expect(bad.record.verdict).toMatch(/^NOT_OBSERVED:RUNNER_RESULT_MALFORMED:stderr\.sha256/);
  });

  it("합성(스텁) 출처는 재해석을 거쳐도 실제 바이너리 검증으로 승격되지 않는다", async () => {
    const { facts } = await runInProcess();
    const re = reinterpretScanRun(runnerJsonFromFacts(facts), adminContextFor(facts, SCAN_WORK));
    expect(re.record.verdict).toBe(OK);
    expect(re.record.provenance).toBe("stub");
    expect(re.record.evidence_scope).toBe("SYNTHETIC_STUB_ONLY");
    expect(re.record.real_binary_verified).toBe(false);
    // 실제 출처로 표시해도 실제 바이너리 검증으로 쓰지 않는다: 성공이 말하는 것은 합성 입력 한 건의 반응뿐이다
    // 관리자 문맥도 같은 실행 종류(semgrep-lsp)를 알릴 때만 실제 출처로 읽는다 (아래 mode 교차 확인 절)
    const real = { ...runnerJsonFromFacts(facts), mode: "semgrep-lsp" };
    const r2 = reinterpretScanRun(real, adminContextFor(facts, SCAN_WORK, { mode: "semgrep-lsp" }));
    expect(r2.record.evidence_scope).toBe("ONE_SYNTHETIC_INPUT_REACTION");
    expect(r2.record.real_binary_verified).toBe(false);
    expect(r2.record.not_established.rule_detection_performance_in_general).toBe("NOT_ESTABLISHED");
  });
});

describe("관리자 쪽 사실이 틀리면 관측이 성립하지 않는다", () => {
  async function base() {
    const { facts } = await runInProcess();
    return { json: runnerJsonFromFacts(facts), facts };
  }
  const reasonOf = async (over: Record<string, unknown>): Promise<string[]> => {
    const { json, facts } = await base();
    return reinterpretScanRun(json, adminContextFor(facts, SCAN_WORK, over)).admin.externalReasons;
  };
  const verdictOf = async (over: Record<string, unknown>): Promise<string> => {
    const { json, facts } = await base();
    return reinterpretScanRun(json, adminContextFor(facts, SCAN_WORK, over)).record.verdict;
  };

  it("러너가 되돌려 쓴 토큰이 다르면 ADMIN_TOKEN_MISMATCH", async () => {
    expect(await reasonOf({ runToken: "other" })).toContain("ADMIN_TOKEN_MISMATCH");
  });

  it("신원·결합이 확인되지 않았으면 성립하지 않는다", async () => {
    expect(await reasonOf({ identity: { ok: false } })).toContain("ADMIN_IDENTITY_UNVERIFIED");
    expect(await reasonOf({ binding: { ok: false } })).toContain("ADMIN_BINDING_FAILED");
    expect(await reasonOf({ identity: undefined, binding: undefined })).toEqual(
      expect.arrayContaining(["ADMIN_IDENTITY_UNVERIFIED", "ADMIN_BINDING_FAILED"])
    );
  });

  it("감독자가 강제 종료했거나 마감에 닿았거나 중단 전달에 실패했거나 결과가 없었다", async () => {
    const sup = (over: Record<string, unknown>) => ({
      forcedKill: false,
      deadlineReached: false,
      abortRequested: false,
      abortDelivered: false,
      resultMissing: false,
      ...over,
    });
    expect(await reasonOf({ supervisor: sup({ forcedKill: true }) })).toContain(
      "ADMIN_SUPERVISOR_FORCED_KILL"
    );
    expect(await reasonOf({ supervisor: sup({ deadlineReached: true }) })).toContain(
      "ADMIN_SUPERVISOR_DEADLINE"
    );
    expect(
      await reasonOf({ supervisor: sup({ abortRequested: true, abortDelivered: false }) })
    ).toContain("ADMIN_ABORT_DELIVERY_FAILED");
    expect(await reasonOf({ supervisor: sup({ resultMissing: true }) })).toContain(
      "ADMIN_RESULT_MISSING"
    );
  });

  it("감독자 필드가 불리언이 아니면(문자열 'false' 포함) '그런 일이 없었다'로 읽지 않는다", async () => {
    const { json, facts } = await base();
    const re = reinterpretScanRun(
      json,
      adminContextFor(facts, SCAN_WORK, {
        supervisor: {
          forcedKill: "false",
          deadlineReached: false,
          abortRequested: false,
          resultMissing: false,
        },
      })
    );
    expect(re.admin.contextProblems).toContain("supervisor.forcedKill");
    expect(re.record.status).toBe("NOT_OBSERVED");
  });

  it("자식 트리의 경로 이탈, 설치물·파일 해시 변경이 있으면 성립하지 않는다", async () => {
    expect(await reasonOf({ descendantPathViolations: ["C:\\x\\y.exe"] })).toContain(
      "ADMIN_DESCENDANT_PATH_UNEXPECTED"
    );
    expect(await reasonOf({ hashesUnchanged: false })).toContain("ADMIN_HASH_CHANGED");
    expect(await reasonOf({ hashesUnchanged: "true" })).toContain("ADMIN_HASH_CHANGED");
  });

  it("OS 차단 이벤트(5157) 수집이 불확실하거나 귀속된 이벤트가 있으면 성립하지 않는다", async () => {
    expect(await reasonOf({ osBlock: { usable: false, attributedCount: 0 } })).toContain(
      "ADMIN_OS_BLOCK_UNCONFIRMED"
    );
    expect(await reasonOf({ osBlock: { usable: true, attributedCount: null } })).toContain(
      "ADMIN_OS_BLOCK_UNCONFIRMED"
    );
    expect(await reasonOf({ osBlock: undefined })).toContain("ADMIN_OS_BLOCK_UNCONFIRMED");
    expect(await reasonOf({ osBlock: { usable: true, attributedCount: 2 } })).toContain(
      "ADMIN_OS_BLOCK_ATTRIBUTED"
    );
    for (const osBlock of [
      { usable: false, attributedCount: 0 },
      { usable: true, attributedCount: 1 },
    ]) {
      const v = await verdictOf({ osBlock });
      expect(v).not.toBe(OK);
    }
  });

  it("관리자가 잰 합성 파일·프로브 해시가 고정값과 다르면 FILES_CHANGED 로 성립하지 않는다", async () => {
    expect(
      await verdictOf({
        target: {
          sourceSha256: "a".repeat(64),
          afterWriteSha256: "a".repeat(64),
          afterRunSha256: "a".repeat(64),
        },
      })
    ).toBe("NOT_OBSERVED:FILES_CHANGED");
    const unknown = await verdictOf({
      probe: { sourceSha256: null, afterCopySha256: null, afterRunSha256: null },
    });
    expect(unknown).toMatch(/^NOT_OBSERVED:/);
  });

  it("관리자가 알린 PATH 값과 러너가 보고한 값이 다르면 성립하지 않는다", async () => {
    // 러너 결과를 풀 때 드러나는 사유라 어댑터의 externalReasons(= 판정의 NOT_OBSERVED 사유)에 실린다.
    expect(await verdictOf({ expectedPath: "C:\\Windows;C:\\Git\\bin" })).toBe(
      "NOT_OBSERVED:RUNNER_PATH_UNEXPECTED"
    );
    expect(await verdictOf({ expectedPath: null })).toBe(OK); // 알려 주지 않으면 대조하지 않는다 (기록에는 PATH 값이 남는다)
  });

  it("문맥 형식이 틀리면(스키마·한도·runId·토큰·작업 폴더·수신기) ADMIN_CONTEXT_MALFORMED 로 성립하지 않는다", async () => {
    const { json, facts } = await base();
    const good = adminContextFor(facts, SCAN_WORK);
    const cases: [string, Record<string, unknown>, string][] = [
      ["스키마", { ...good, schema: "x" }, "schema"],
      ["한도 없음", { ...good, limits: undefined }, "limits"],
      [
        "한도가 상한 초과",
        { ...good, limits: { ...asRec(good.limits), scanMs: 60_000 } },
        "limits",
      ],
      ["scanMs 없음", { ...good, limits: { ...asRec(good.limits), scanMs: undefined } }, "limits"],
      ["runId 없음", { ...good, runId: "" }, "runId"],
      ["토큰 없음", { ...good, runToken: "" }, "runToken"],
      ["작업 폴더 없음", { ...good, work: null }, "work"],
      ["수신기 없음", { ...good, receiver: undefined }, "receiver"],
      ["프로브 해시 없음", { ...good, probe: undefined }, "probe"],
      ["합성 파일 해시 없음", { ...good, target: undefined }, "target"],
      ["runnerLaunched 가 불리언이 아님", { ...good, runnerLaunched: "yes" }, "runnerLaunched"],
    ];
    for (const [name, ctx, field] of cases) {
      const re = reinterpretScanRun(json, ctx);
      expect(re.admin.contextProblems, name).toContain(field);
      expect(re.record.verdict, name).not.toBe(OK);
    }
  });

  it("문맥이 null·문자열이어도 던지지 않고 관측 불성립이다", async () => {
    const { json } = await base();
    for (const bad of [null, "x", 7, []]) {
      const re = reinterpretScanRun(json, bad);
      expect(re.record.verdict).not.toBe(OK);
    }
    expect(reinterpretScanRun(null, null).record.verdict).not.toBe(OK);
  });
});

describe("관리자 문맥의 mode 와 러너 결과의 mode 를 교차 확인한다 (F6a)", () => {
  async function base() {
    const { facts } = await runInProcess();
    return { json: runnerJsonFromFacts(facts), facts };
  }
  /** 승격되지 않았음: 출처 null 이고, 아무것도 세우지 않으며, 실제 바이너리 검증이 아니다. 실행 사실과 원문 증거는 그대로 남는다. */
  const expectNotPromoted = (re: ReturnType<typeof reinterpretScanRun>): void => {
    expect(re.record.status).toBe("NOT_OBSERVED");
    expect(re.record.verdict).toMatch(/^NOT_OBSERVED:/);
    expect(re.record.provenance).toBeNull();
    expect(re.record.established).toEqual([]);
    expect(re.record.evidence_scope).toBe("SYNTHETIC_STUB_ONLY");
    expect(re.record.real_binary_verified).toBe(false);
    expect(re.record.sent.length).toBeGreaterThan(0);
    expect(re.record.evidence.both_complete_at_ms).not.toBeNull();
  };

  it("정상 두 종류: stub/stub 은 스텁 출처로, semgrep-lsp/semgrep-lsp 는 실제 출처로 읽는다 (스텁은 아무것도 세우지 않는다)", async () => {
    const { json, facts } = await base();
    const stub = reinterpretScanRun(json, adminContextFor(facts, SCAN_WORK, { mode: "stub" }));
    expect(stub.record.verdict).toBe(OK);
    expect(stub.record.provenance).toBe("stub");
    expect(stub.record.established).toEqual([]);
    expect(stub.record.evidence_scope).toBe("SYNTHETIC_STUB_ONLY");
    expect(stub.admin.externalReasons).toEqual([]);
    expect(stub.admin.contextProblems).toEqual([]);

    const real = reinterpretScanRun(
      { ...json, mode: "semgrep-lsp" },
      adminContextFor(facts, SCAN_WORK, { mode: "semgrep-lsp" })
    );
    expect(real.record.verdict).toBe(OK);
    expect(real.record.provenance).toBe("real");
    expect(real.record.evidence_scope).toBe("ONE_SYNTHETIC_INPUT_REACTION");
    expect(real.record.real_binary_verified).toBe(false);
    expect(real.admin.externalReasons).toEqual([]);
  });

  it("관리자는 stub 인데 러너가 semgrep-lsp 라고 보고하면 실제 출처로 승격하지 않고 관측 불성립이다", async () => {
    const { json, facts } = await base();
    const re = reinterpretScanRun(
      { ...json, mode: "semgrep-lsp" },
      adminContextFor(facts, SCAN_WORK, { mode: "stub" })
    );
    expect(re.admin.externalReasons).toContain("ADMIN_MODE_MISMATCH:admin_stub_runner_real");
    expectNotPromoted(re);
  });

  it("관리자는 semgrep-lsp 인데 러너가 stub 이라고 보고해도 관측 불성립이다 (관리자 mode 로 출처를 채우지 않는다)", async () => {
    const { json, facts } = await base();
    const re = reinterpretScanRun(
      { ...json, mode: "stub" },
      adminContextFor(facts, SCAN_WORK, { mode: "semgrep-lsp" })
    );
    expect(re.admin.externalReasons).toContain("ADMIN_MODE_MISMATCH:admin_real_runner_stub");
    expectNotPromoted(re);
  });

  it("관리자 mode 가 없거나 모르는 값이면 러너가 무엇을 보고하든 승격하지 않고 ADMIN_CONTEXT_MALFORMED:mode 이다", async () => {
    const { json, facts } = await base();
    const badModes: [string, unknown][] = [
      ["없음", undefined],
      ["null", null],
      ["빈 문자열", ""],
      ["대소문자 다름", "Stub"],
      ["공백 포함", "semgrep-lsp "],
      ["소프트 하이픈", "stu­b"],
      ["숫자", 1],
      ["객체", { mode: "stub" }],
      ["모르는 이름", "real"],
    ];
    for (const runnerMode of ["stub", "semgrep-lsp"]) {
      for (const [name, bad] of badModes) {
        const re = reinterpretScanRun(
          { ...json, mode: runnerMode },
          adminContextFor(facts, SCAN_WORK, { mode: bad })
        );
        expect(re.admin.contextProblems, `${name}/${runnerMode}`).toContain("mode");
        expect(re.admin.externalReasons, `${name}/${runnerMode}`).toContain(
          "ADMIN_CONTEXT_MALFORMED:mode"
        );
        expectNotPromoted(re);
      }
    }
  });

  it("러너 결과의 mode 가 없거나 모르는 값이면 관리자 mode 만으로 출처를 채우지 않고 관측 불성립이다", async () => {
    const { json, facts } = await base();
    const badModes: [string, unknown][] = [
      ["없음", undefined],
      ["null", null],
      ["빈 문자열", ""],
      ["대소문자 다름", "STUB"],
      ["소프트 하이픈", "semgrep-lsp­"],
      ["숫자", 7],
      ["모르는 이름", "other"],
    ];
    for (const adminMode of ["stub", "semgrep-lsp"]) {
      for (const [name, bad] of badModes) {
        const runner = { ...json, mode: bad };
        if (bad === undefined) delete (runner as Record<string, unknown>).mode;
        const re = reinterpretScanRun(
          runner,
          adminContextFor(facts, SCAN_WORK, { mode: adminMode })
        );
        expect(re.admin.externalReasons, `${name}/${adminMode}`).toContain(
          "ADMIN_RUNNER_MODE_INVALID"
        );
        expect(re.record.provenance, `${name}/${adminMode}`).toBeNull();
        expect(re.record.status, `${name}/${adminMode}`).toBe("NOT_OBSERVED");
        expect(re.record.established, `${name}/${adminMode}`).toEqual([]);
        expect(re.record.verdict, `${name}/${adminMode}`).not.toBe(OK);
      }
    }
  });

  it("러너를 띄우지 않았다고 알린 경우에도 출처는 채우지 않고, 관리자 mode 가 틀렸으면 문맥 문제로 남는다", async () => {
    const { facts } = await runInProcess();
    const ok = reinterpretScanRun(
      null,
      adminContextFor(facts, SCAN_WORK, {
        runnerLaunched: false,
        refusals: [],
        mode: "semgrep-lsp",
      })
    );
    expect(ok.record.verdict).toBe("NOT_ATTEMPTED:ADMIN_RUNNER_NOT_LAUNCHED");
    expect(ok.record.provenance).toBeNull();
    expect(ok.admin.externalReasons).not.toContain("ADMIN_MODE_MISMATCH:admin_real_runner_stub");
    const bad = reinterpretScanRun(
      null,
      adminContextFor(facts, SCAN_WORK, { runnerLaunched: false, refusals: [], mode: "x" })
    );
    expect(bad.admin.contextProblems).toContain("mode");
  });

  it("러너가 띄워지지 않았다고 했는데 러너 결과가 남아 있어도 그 결과의 mode 로 출처를 정하지 않는다", async () => {
    const { json, facts } = await base();
    const re = reinterpretScanRun(
      { ...json, mode: "semgrep-lsp" },
      adminContextFor(facts, SCAN_WORK, {
        runnerLaunched: false,
        refusals: [],
        mode: "semgrep-lsp",
      })
    );
    expect(re.record.provenance).toBeNull();
    expect(re.record.established).toEqual([]);
  });
});

describe("서버를 띄우지 않았다 / 시스템 복구는 따로다", () => {
  it("관리자가 러너를 띄우지 않았다고 알리면 NOT_ATTEMPTED 이고 러너 결과가 없어도 그렇다", async () => {
    const { facts } = await runInProcess();
    const ctx = adminContextFor(facts, SCAN_WORK, {
      runnerLaunched: false,
      refusals: ["ADMIN_PRECONDITION_FAILED"],
    });
    const re = reinterpretScanRun(null, ctx);
    expect(re.record.verdict).toBe("NOT_ATTEMPTED:ADMIN_PRECONDITION_FAILED");
    const none = reinterpretScanRun(
      null,
      adminContextFor(facts, SCAN_WORK, { runnerLaunched: false, refusals: [] })
    );
    expect(none.record.verdict).toBe("NOT_ATTEMPTED:ADMIN_RUNNER_NOT_LAUNCHED");
  });

  it("러너를 띄운 뒤의 신원·해시 실패는 실행 사실을 지우지 않고 NOT_OBSERVED 로 남는다", async () => {
    const { facts } = await runInProcess();
    const re = reinterpretScanRun(
      runnerJsonFromFacts(facts),
      adminContextFor(facts, SCAN_WORK, { identity: { ok: false } })
    );
    expect(re.record.status).toBe("NOT_OBSERVED");
    expect(re.record.sent.length).toBeGreaterThan(0);
  });

  it("시스템 복구 결과는 문맥에서 기록되고, 복구가 달라도 관측 판정은 그대로다 (서로 추론하지 않는다)", async () => {
    const { facts } = await runInProcess();
    const json = runnerJsonFromFacts(facts);
    const equal = reinterpretScanRun(json, adminContextFor(facts, SCAN_WORK));
    const different = reinterpretScanRun(
      json,
      adminContextFor(facts, SCAN_WORK, {
        recovery: { status: "DIFFERENT", detail: ["FIREWALL_RULE_REMAINS"] },
      })
    );
    const missing = reinterpretScanRun(
      json,
      adminContextFor(facts, SCAN_WORK, { recovery: undefined })
    );
    expect(equal.record.verdict).toBe(OK);
    expect(different.record.verdict).toBe(OK);
    expect(different.record.outcomes.system_recovery).toEqual({
      status: "DIFFERENT",
      detail: ["FIREWALL_RULE_REMAINS"],
    });
    expect(missing.record.verdict).toBe(OK);
    expect(missing.record.outcomes.system_recovery.status).toBe("NOT_OBSERVED");
  });
});

describe("CLI 래퍼의 순수 부분 — runScanReinterpretCli", () => {
  function io(files: Record<string, string | Uint8Array>): {
    io: ScanReinterpretIo;
    written: Record<string, string>;
  } {
    const written: Record<string, string> = {};
    return {
      written,
      io: {
        read: (path) => {
          const v = files[path];
          if (typeof v !== "string") throw new Error("ENOENT");
          return v;
        },
        readBytes: (path) => {
          const v = files[path];
          if (!(v instanceof Uint8Array)) throw new Error("ENOENT");
          return v;
        },
        write: (path, text) => {
          if (path.startsWith("/denied")) throw new Error("EACCES");
          written[path] = text;
        },
      },
    };
  }

  it("인자가 틀리면 종료 코드 2 와 사용법만 돌려준다 (경로를 싣지 않는다)", () => {
    const { io: x } = io({});
    expect(runScanReinterpretCli(["--runner-result", "a"], x).exitCode).toBe(2);
    expect(runScanReinterpretCli([], x).exitCode).toBe(2);
    const r = runScanReinterpretCli(["--bogus", "a"], x);
    expect(r.exitCode).toBe(2);
    expect(r.message).toContain("USAGE");
  });

  it("문맥을 읽지 못하면 종료 코드 3, 러너 결과를 읽지 못하면 기록이 RUNNER_RESULT_MALFORMED 로 관측 불성립이다", async () => {
    const { facts } = await runInProcess();
    const ctxText = JSON.stringify(adminContextFor(facts, SCAN_WORK));
    const a = io({ "/c.json": "{bad" });
    expect(
      runScanReinterpretCli(
        ["--runner-result", "/r.json", "--context", "/c.json", "--out", "/o.json"],
        a.io
      )
    ).toEqual({
      exitCode: 3,
      message: "CONTEXT_UNREADABLE",
    });
    const b = io({ "/c.json": ctxText });
    const r = runScanReinterpretCli(
      ["--runner-result", "/missing.json", "--context", "/c.json", "--out", "/o.json"],
      b.io
    );
    expect(r.exitCode).toBe(0);
    const out = JSON.parse(b.written["/o.json"]);
    expect(out.record.status).toBe("NOT_OBSERVED");
  });

  it("정상: 기록을 쓰고 종료 코드 0, 메시지에는 판정만 싣는다", async () => {
    const { facts } = await runInProcess();
    const files = {
      "/r.json": JSON.stringify(runnerJsonFromFacts(facts)),
      "/c.json": JSON.stringify(adminContextFor(facts, SCAN_WORK)),
    };
    const { io: x, written } = io(files);
    const res = runScanReinterpretCli(
      ["--runner-result", "/r.json", "--context", "/c.json", "--out", "/o.json"],
      x
    );
    expect(res).toEqual({ exitCode: 0, message: `RECORD_WRITTEN verdict=${OK}` });
    expect(JSON.parse(written["/o.json"]).record.verdict).toBe(OK);
  });

  it(".bin 파일 인자(--stdout-bin, --stderr-bin)를 주면 b64 대신 그 바이트로 해석한다", async () => {
    const { facts } = await runInProcess();
    const files = {
      "/r.json": JSON.stringify(runnerJsonFromFacts(facts, false)),
      "/c.json": JSON.stringify(adminContextFor(facts, SCAN_WORK)),
      "/out.bin": facts.stdout.bytes,
      "/err.bin": facts.stderr.bytes,
    };
    const { io: x, written } = io(files);
    const res = runScanReinterpretCli(
      [
        "--runner-result",
        "/r.json",
        "--context",
        "/c.json",
        "--out",
        "/o.json",
        "--stdout-bin",
        "/out.bin",
        "--stderr-bin",
        "/err.bin",
      ],
      x
    );
    expect(res.exitCode).toBe(0);
    expect(JSON.parse(written["/o.json"]).record.verdict).toBe(OK);
    // 하나만 주면 사용법 오류, .bin 을 읽지 못하면 원문이 없는 것이라 관측 불성립
    expect(
      runScanReinterpretCli(
        [
          "--runner-result",
          "/r.json",
          "--context",
          "/c.json",
          "--out",
          "/o.json",
          "--stdout-bin",
          "/out.bin",
        ],
        x
      ).exitCode
    ).toBe(2);
    const gone = io({ ...files, "/err.bin": "text-not-bytes" });
    const r = runScanReinterpretCli(
      [
        "--runner-result",
        "/r.json",
        "--context",
        "/c.json",
        "--out",
        "/o2.json",
        "--stdout-bin",
        "/out.bin",
        "--stderr-bin",
        "/err.bin",
      ],
      gone.io
    );
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(gone.written["/o2.json"]).record.status).toBe("NOT_OBSERVED");
  });

  it("출력을 쓰지 못하면 종료 코드 3", async () => {
    const { facts } = await runInProcess();
    const { io: x } = io({
      "/r.json": JSON.stringify(runnerJsonFromFacts(facts)),
      "/c.json": JSON.stringify(adminContextFor(facts, SCAN_WORK)),
    });
    expect(
      runScanReinterpretCli(
        ["--runner-result", "/r.json", "--context", "/c.json", "--out", "/denied/o.json"],
        x
      )
    ).toEqual({ exitCode: 3, message: "OUTPUT_NOT_WRITTEN" });
  });

  it("스키마·종류 상수가 고정이다", () => {
    expect(SCAN_ADMIN_CONTEXT_SCHEMA).toBe("lsp-scan-admin-context/1");
    expect(SCAN_ADMIN_CONTEXT_KIND).toBe("lsp-scan-admin-context");
    expect(SCAN_REINTERPRETATION_SCHEMA).toBe("lsp-scan-reinterpretation/1");
  });
});
