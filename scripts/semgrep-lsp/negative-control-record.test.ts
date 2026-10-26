import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { VirtualClock } from "./clock";
import { defaultNegativeControls } from "./control";
import { runHarness, type HarnessOptions } from "./harness";
import type { NegativeControlSuite } from "./negative-control";
import {
  MAX_SUITE_BYTES,
  loadNegativeControlSuite,
  serializeSuite,
} from "./negative-control-record";
import { controlReferenceFromValue } from "./reference-record";
import { buildControlWorld, declaredRealPort } from "./testing/control-world";
import { SUITE, makeRig, statuses } from "./testing/negative-control-rig";
import { drive, stubPort } from "./testing/stub-lsp";
import type { NegativeControlInput, ProcessPort } from "./types";

// 스위트 기록 읽기 시험. 메모리 파일 시스템과 스텁 엔진 위에서 돈다 — 실제 Semgrep의 동작이 아니다. "real이라고 선언한 포트"를 쓰는
// 시험은 기록 연결 경로(자격 계산·읽기 어댑터)를 합성 입력으로 확인하려는 것이며 실제 실행의 증거가 아니다.

function fixtureBytes(fixture: string): Uint8Array {
  return readFileSync(fileURLToPath(new URL(`../../${fixture}`, import.meta.url)));
}

const world = buildControlWorld(fixtureBytes);
const SUITE_PATH = "/suite/negative-controls.json";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

type Rig = ReturnType<typeof makeRig>;

/** 실행기를 돌리고 스위트 기록을 같은 메모리 파일 시스템에 쓴다. */
async function runAndWrite(rig: Rig): Promise<NegativeControlSuite> {
  const suite = await rig.run();
  await rig.memory.writeFileExclusive(SUITE_PATH, encoder.encode(serializeSuite(suite)));
  return suite;
}

/** 스위트 JSON을 고쳐 다른 경로에 쓰고 그 경로를 돌려준다(기존 파일은 덮어쓰지 않는다). */
async function writeTampered(
  rig: Rig,
  name: string,
  edit: (json: Record<string, any>) => void // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<string> {
  const json = JSON.parse(decoder.decode(await rig.memory.readFile(SUITE_PATH)));
  edit(json);
  const path = `/suite/${name}.json`;
  await rig.memory.writeFileExclusive(path, encoder.encode(JSON.stringify(json)));
  return path;
}

const load = (rig: Rig, path = SUITE_PATH): Promise<NegativeControlInput> =>
  loadNegativeControlSuite(rig.memory, path, "/evidence");

describe("loadNegativeControlSuite — 증거에서 항목을 다시 도출한다", () => {
  it("정상 스위트: 실행기가 낸 항목과 같은 항목을 증거에서 재도출하고 결합·출처·요약을 돌려준다", async () => {
    const rig = makeRig(world);
    const suite = await runAndWrite(rig);
    const input = await load(rig);
    expect(input.summary).toMatchObject({
      accepted: true,
      rejection: null,
      suite_id: SUITE,
      provenance: "stub",
      binding_sha256: suite.binding_sha256,
      counts: { pass: 15, fail: 0, not_run: 1 },
      problems: [],
    });
    expect(input.bindingSha256).toBe(suite.binding_sha256);
    expect(input.provenance).toBe("stub");
    expect(input.entries).toEqual(suite.entries);
    expect(input.summary.outcomes).toEqual([
      { id: "R9", layer: "engine", outcome: "BLOCKED_CONTRACT_CONFLICT" },
    ]);
  });

  it("저장된 entries를 믿지 않는다: 파일의 entries를 전부 PASS로 고쳐 써도 증거로 다시 도출한 항목이 쓰인다", async () => {
    const rig = makeRig(world);
    const suite = await runAndWrite(rig);
    const path = await writeTampered(rig, "forged-entries", (json) => {
      json.entries = json.entries.map((e: Record<string, unknown>) => ({
        ...e,
        status: "PASS",
        observed: e.expected,
        binding_sha256: suite.binding_sha256,
      }));
    });
    const input = await load(rig, path);
    expect(input.entries).toEqual(suite.entries);
    expect(input.entries.find((e) => e.id === "R9" && e.layer === "engine")?.status).toBe(
      "NOT_RUN"
    );
  });

  it("스위트가 적은 증거 해시와 디스크의 run.json이 다르면 그 사례는 쓰지 않는다(NOT_RUN, 문제 토큰)", async () => {
    const rig = makeRig(world);
    await runAndWrite(rig);
    const path = await writeTampered(rig, "bad-hash", (json) => {
      const c = json.cases.find(
        (x: Record<string, unknown>) => x.id === "R2" && x.layer === "preflight"
      );
      c.evidence.run_json_sha256 = "0".repeat(64);
    });
    const input = await load(rig, path);
    const e = input.entries.find((x) => x.id === "R2" && x.layer === "preflight");
    expect(e).toMatchObject({ status: "NOT_RUN", observed: null, binding_sha256: null });
    expect(input.summary.problems).toEqual(["R2:preflight:EVIDENCE_HASH_MISMATCH"]);
    expect(input.entries.find((x) => x.id === "R2" && x.layer === "engine")?.status).toBe("PASS");
    expect(input.summary.accepted).toBe(true);
  });

  it("증거 폴더가 없거나 증거 참조가 비어 있으면 그 사례만 NOT_RUN이다", async () => {
    const rig = makeRig(world);
    await runAndWrite(rig);
    const missing = await writeTampered(rig, "missing", (json) => {
      const c = json.cases.find(
        (x: Record<string, unknown>) => x.id === "R3" && x.layer === "engine"
      );
      c.evidence.run_id = "nc1-no-such-run";
    });
    const a = await load(rig, missing);
    expect(a.entries.find((x) => x.id === "R3" && x.layer === "engine")?.status).toBe("NOT_RUN");
    expect(a.summary.problems).toEqual(["R3:engine:EVIDENCE_MISSING"]);
    const noRef = await writeTampered(rig, "no-ref", (json) => {
      const c = json.cases.find(
        (x: Record<string, unknown>) => x.id === "R4" && x.layer === "engine"
      );
      c.evidence = null;
    });
    const b = await load(rig, noRef);
    expect(b.entries.find((x) => x.id === "R4" && x.layer === "engine")?.status).toBe("NOT_RUN");
    expect(b.summary.problems).toEqual(["R4:engine:EVIDENCE_REF_MISSING"]);
  });

  it("층이 맞지 않는 증거는 쓰지 않는다: 사전 검사 증거를 엔진 항목에 붙이면 NOT_RUN이다(두 층은 서로 대신하지 못한다)", async () => {
    const rig = makeRig(world);
    await runAndWrite(rig);
    const path = await writeTampered(rig, "swapped-layer", (json) => {
      const pre = json.cases.find(
        (x: Record<string, unknown>) => x.id === "R1" && x.layer === "preflight"
      );
      const eng = json.cases.find(
        (x: Record<string, unknown>) => x.id === "R1" && x.layer === "engine"
      );
      eng.evidence = pre.evidence;
    });
    const input = await load(rig, path);
    expect(input.entries.find((x) => x.id === "R1" && x.layer === "engine")).toMatchObject({
      status: "NOT_RUN",
      observed: null,
    });
    expect(input.entries.find((x) => x.id === "R1" && x.layer === "preflight")?.status).toBe(
      "PASS"
    );
  });

  it("다른 사례의 증거를 붙이면 관측이 달라 FAIL이 되지 PASS로 둔갑하지 않는다", async () => {
    const rig = makeRig(world);
    await runAndWrite(rig);
    // R6 엔진(RULES_NOT_LOADED)의 증거를 R7 엔진(SETTINGS_MISMATCH가 기대)에 붙인다.
    const path = await writeTampered(rig, "wrong-case", (json) => {
      const r6 = json.cases.find(
        (x: Record<string, unknown>) => x.id === "R6" && x.layer === "engine"
      );
      const r7 = json.cases.find(
        (x: Record<string, unknown>) => x.id === "R7" && x.layer === "engine"
      );
      r7.evidence = r6.evidence;
    });
    const input = await load(rig, path);
    expect(input.entries.find((x) => x.id === "R7" && x.layer === "engine")).toMatchObject({
      status: "FAIL",
      observed: "RULES_NOT_LOADED",
    });
  });

  it("충돌 항목(R9 엔진)은 스위트가 실행했다고 적어도 NOT_RUN이다 — 표에서 다시 도출한 충돌이 우선한다", async () => {
    const rig = makeRig(world);
    await runAndWrite(rig);
    const path = await writeTampered(rig, "claimed-r9", (json) => {
      const r8 = json.cases.find(
        (x: Record<string, unknown>) => x.id === "R8" && x.layer === "engine"
      );
      const r9 = json.cases.find(
        (x: Record<string, unknown>) => x.id === "R9" && x.layer === "engine"
      );
      r9.outcome = "EXECUTED";
      r9.evidence = r8.evidence;
    });
    const input = await load(rig, path);
    expect(input.entries.find((x) => x.id === "R9" && x.layer === "engine")?.status).toBe(
      "NOT_RUN"
    );
    expect(input.summary.outcomes).toContainEqual({
      id: "R9",
      layer: "engine",
      outcome: "BLOCKED_CONTRACT_CONFLICT",
    });
  });
});

describe("loadNegativeControlSuite — 기준 실행", () => {
  it("기준 증거가 없으면 실행했다고 적힌 사례도 쓰지 않는다(BASELINE_NOT_CLEAN)", async () => {
    const rig = makeRig(world);
    await runAndWrite(rig);
    const path = await writeTampered(rig, "no-baseline-evidence", (json) => {
      json.baseline.evidence = null;
    });
    const input = await load(rig, path);
    expect(input.summary.accepted).toBe(true);
    expect(input.bindingSha256).toBeNull();
    expect(input.entries.every((e) => e.status === "NOT_RUN")).toBe(true);
    expect(input.summary.problems).toContain("BASELINE_EVIDENCE_MISSING");
    expect(input.summary.outcomes.filter((o) => o.outcome === "BASELINE_NOT_CLEAN").length).toBe(
      15
    );
  });

  it("스위트가 적은 결합이 기준 증거의 결합과 다르면 쓰지 않는다", async () => {
    const rig = makeRig(world);
    await runAndWrite(rig);
    const path = await writeTampered(rig, "binding-edit", (json) => {
      json.binding_sha256 = "f".repeat(64);
    });
    const input = await load(rig, path);
    expect(input.entries.every((e) => e.status === "NOT_RUN")).toBe(true);
    expect(input.summary.problems).toContain("BASELINE_BINDING_MISMATCH");
  });

  it("스위트가 적은 출처가 기준 증거의 출처와 다르면 쓰지 않는다", async () => {
    const rig = makeRig(world);
    await runAndWrite(rig);
    const path = await writeTampered(rig, "provenance-edit", (json) => {
      json.provenance = "real";
    });
    const input = await load(rig, path);
    expect(input.entries.every((e) => e.status === "NOT_RUN")).toBe(true);
    expect(input.summary.problems).toContain("BASELINE_PROVENANCE_MISMATCH");
  });

  it("깨끗하지 않았던 스위트(기준이 COMPLETE가 아님)를 읽어도 항목은 전부 NOT_RUN이다", async () => {
    const rig = makeRig(world, { inputs: { wheelSha256Observed: null } });
    await runAndWrite(rig);
    const input = await load(rig);
    expect(input.summary.accepted).toBe(true); // 구조는 맞다 — 다만 기준이 성립하지 않아 쓸 항목이 없다
    expect(input.bindingSha256).toBeNull();
    expect(input.summary.problems).toContain("BASELINE_NOT_CLEAN");
    expect(input.entries.every((e) => e.status === "NOT_RUN")).toBe(true);
  });
});

describe("loadNegativeControlSuite — 구조 거절", () => {
  it("읽을 수 없거나 JSON이 아니거나 스키마가 다르면 거절(전부 NOT_RUN)하고 이유 토큰만 남긴다", async () => {
    const rig = makeRig(world);
    await runAndWrite(rig);
    await rig.memory.writeFileExclusive(
      "/suite/garbage.json",
      encoder.encode("{ 이건 JSON이 아니다")
    );
    await rig.memory.writeFileExclusive(
      "/suite/other-schema.json",
      encoder.encode(JSON.stringify({ schema: "x/1" }))
    );
    await rig.memory.writeFileExclusive(
      "/suite/bad-utf8.json",
      Uint8Array.from([0xff, 0xfe, 0x7b, 0x7d])
    );
    await rig.memory.writeFileExclusive("/suite/array.json", encoder.encode("[]"));
    await rig.memory.writeFileExclusive("/suite/huge.json", new Uint8Array(MAX_SUITE_BYTES + 1));
    const expectations: [string, string][] = [
      ["/suite/none.json", "FILE_NOT_FOUND"],
      ["/suite/garbage.json", "INVALID_JSON"],
      ["/suite/other-schema.json", "SCHEMA_UNSUPPORTED"],
      ["/suite/bad-utf8.json", "INVALID_JSON"],
      ["/suite/huge.json", "TOO_LARGE"],
    ];
    for (const [path, token] of expectations) {
      const input = await load(rig, path);
      expect(input.summary.accepted, path).toBe(false);
      expect(input.summary.rejection, path).toBe(token);
      expect(input.entries, path).toEqual(defaultNegativeControls());
      expect(input.bindingSha256, path).toBeNull();
    }
    const arr = await load(rig, "/suite/array.json");
    expect(arr.summary.accepted).toBe(false);
  });

  it("사례가 누락·중복되거나 예상 밖이면 스위트 전체를 거절한다(부분 수락하지 않는다)", async () => {
    const rig = makeRig(world);
    await runAndWrite(rig);
    const missing = await writeTampered(rig, "case-missing", (json) => {
      json.cases = json.cases.filter(
        (c: Record<string, unknown>) => !(c.id === "R5" && c.layer === "engine")
      );
    });
    expect((await load(rig, missing)).summary.rejection).toBe("CASES_MISSING(R5:engine)");
    const dup = await writeTampered(rig, "case-dup", (json) => {
      json.cases.push(
        json.cases.find((c: Record<string, unknown>) => c.id === "R5" && c.layer === "engine")
      );
    });
    expect((await load(rig, dup)).summary.rejection).toBe("CASES_DUPLICATE(R5:engine)");
    const extra = await writeTampered(rig, "case-extra", (json) => {
      json.cases.push({ id: "R10", layer: "engine", outcome: "EXECUTED", evidence: null });
    });
    expect((await load(rig, extra)).summary.rejection).toBe("CASES_UNEXPECTED(R10:engine)");
    for (const path of [missing, dup, extra]) {
      expect((await load(rig, path)).entries).toEqual(defaultNegativeControls());
    }
  });

  it("필드 구조가 어긋나면 어긋난 필드 경로만 적어 거절한다(값은 옮기지 않는다)", async () => {
    const rig = makeRig(world);
    await runAndWrite(rig);
    const path = await writeTampered(rig, "bad-fields", (json) => {
      json.suite_id = 5;
      json.cases[0].layer = "both";
      json.cases[1].outcome = "MAYBE";
      json.baseline = "no";
    });
    const input = await load(rig, path);
    expect(input.summary.accepted).toBe(false);
    expect(input.summary.rejection).toMatch(/^INVALID_FIELDS\(/);
    expect(input.summary.rejection).toContain("suite_id(type)");
    expect(input.summary.rejection).toContain("cases[0].layer(value)");
    expect(input.summary.rejection).toContain("cases[1].outcome(value)");
    expect(input.summary.rejection).not.toContain("MAYBE");
  });
});

// ── 실행기 출력 → control 실행 ──────────────────────────────────

const real = (_key: unknown, port: Parameters<typeof declaredRealPort>[0]): ProcessPort =>
  declaredRealPort(port);

/** 같은 메모리 파일 시스템에서 control 실행을 돌린다(실행기와 같은 도구 관측 사실 → 같은 결합). */
async function controlRun(
  rig: Rig,
  input: NegativeControlInput,
  declaredReal: boolean,
  runId: string
) {
  const clock = new VirtualClock();
  const stub = stubPort(world.scriptFor("/ctl"), clock).port;
  const process: ProcessPort = declaredReal ? declaredRealPort(stub) : stub;
  const options: HarnessOptions = {
    mode: "control",
    targetSha: null,
    runId,
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
    negativeControlSuite: input,
  };
  const git = {
    async resolveCommit(): Promise<never> {
      throw new Error("git 없음");
    },
    async lsTree(): Promise<never> {
      throw new Error("git 없음");
    },
    async readBlob(): Promise<never> {
      throw new Error("git 없음");
    },
  };
  return drive(clock, runHarness({ fs: rig.memory, git, process, clock }, options), 10 * 3_600_000);
}

describe("실행기 출력 → control 실행 → 자격 계산 → 읽기 어댑터", () => {
  it("스텁 출처: 항목이 control_assertions에 연결되고, 못 채운 요구는 PROVENANCE_REAL과 NEGATIVE_ENGINE_PASS(R9 엔진)뿐이다", async () => {
    const rig = makeRig(world);
    const suite = await runAndWrite(rig);
    const input = await load(rig);
    const r = await controlRun(rig, input, false, "ctl-stub");
    const rec = r.record;
    expect(r.ok).toBe(true);
    expect(rec?.control_assertions.negative_controls).toEqual(suite.entries);
    expect(rec?.resources?.negative_control_suite).toMatchObject({
      accepted: true,
      counts: { pass: 15, fail: 0, not_run: 1 },
    });
    expect(rec?.not_executed.negative_controls_engine).toBe("UNVERIFIED");
    expect(rec?.trust).toBe("SYNTHETIC");
    expect(
      rec?.reference_qualification.requirements.filter((q) => !q.satisfied).map((q) => q.id)
    ).toEqual(["PROVENANCE_REAL", "NEGATIVE_ENGINE_PASS"]);
    expect(rec?.reference_qualification.eligible).toBe(false);
  });

  it("[real이라고 선언한 합성 포트] 실행기 출력만으로는 R9 엔진이 NOT_RUN이라 자격이 생기지 않고, 어댑터가 어느 쌍이 모자란지 토큰으로 거절한다", async () => {
    const rig = makeRig(world, { wrapPort: real });
    await runAndWrite(rig);
    const input = await load(rig);
    expect(input.provenance).toBe("real");
    const r = await controlRun(rig, input, true, "ctl-real");
    const rec = r.record;
    expect(rec?.provenance).toBe("real"); // 선언일 뿐이다
    expect(
      rec?.reference_qualification.requirements.filter((q) => !q.satisfied).map((q) => q.id)
    ).toEqual(["NEGATIVE_ENGINE_PASS"]);
    const text = decoder.decode(await rig.memory.readFile("/evidence/ctl-real/run.json"));
    const loaded = controlReferenceFromValue(JSON.parse(text), world.expectations);
    expect(loaded.reference).toBeNull();
    expect(loaded.rejection).toContain("NOT_QUALIFIED(NEGATIVE_ENGINE_PASS)");
    expect(loaded.rejection).toContain("R9:engine(NOT_RUN)");
  });

  it("스텁으로 만든 스위트를 real 실행에 붙이면 하네스가 출처 불일치로 거절한다(항목이 쓰이지 않는다)", async () => {
    const rig = makeRig(world); // 스텁 스위트
    await runAndWrite(rig);
    const input = await load(rig);
    const r = await controlRun(rig, input, true, "ctl-mixed");
    expect(r.record?.resources?.negative_control_suite).toMatchObject({
      accepted: false,
      rejection: "PROVENANCE_MISMATCH",
    });
    expect(r.record?.control_assertions.negative_controls).toEqual(defaultNegativeControls());
  });

  it("일부만 완료된 스위트는 완료된 항목만 연결하고 나머지는 NOT_RUN으로 남는다", async () => {
    const controller = new AbortController();
    const rig = makeRig(world, {
      inputs: { signal: controller.signal },
      onResources: (key) => {
        if (key.runId === `${SUITE}-r2-engine`) controller.abort();
      },
    });
    const suite = await runAndWrite(rig);
    const input = await load(rig);
    expect(input.entries).toEqual(suite.entries);
    const r = await controlRun(rig, input, false, "ctl-partial");
    const s = statuses({ ...suite, entries: r.record?.control_assertions.negative_controls ?? [] });
    expect(s["R1:preflight"]).toBe("PASS");
    expect(s["R2:engine"]).toBe("NOT_RUN");
    expect(s["R3:preflight"]).toBe("NOT_RUN");
    expect(r.record?.control_assertions.status).toBe("PASS"); // NOT_RUN은 단언을 막지 않는다 — 자격이 막는다
    expect(r.record?.reference_qualification.eligible).toBe(false);
  });
});
