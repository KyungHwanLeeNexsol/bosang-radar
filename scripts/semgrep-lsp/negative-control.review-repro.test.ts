import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EXIT, main } from "./cli";
import type { NegativeControlSuite } from "./negative-control";
import { loadNegativeControlSuite, serializeSuite } from "./negative-control-record";
import {
  EVIDENCE_ROOT,
  FIXTURES_ROOT,
  SUITE_ID,
  argvNegativeControl,
  makeCliWorld as buildCliWorld,
  type CliWorld,
  type CliWorldOptions,
} from "./testing/cli-negative-control-world";
import { buildControlWorld } from "./testing/control-world";
import { FakeMetricsReceiver } from "./testing/fake-metrics";
import { MemoryFs } from "./testing/memory-fs";
import {
  SUITE,
  assumedEngine,
  caseOf,
  entryOf,
  makeRig,
  statuses,
  type Rig,
} from "./testing/negative-control-rig";
import { summaryOf } from "./testing/observation-fixtures";
import { SYNTHETIC_HARNESS_ROOT, SYNTHETIC_CACHE_DIR } from "./testing/synthetic-data";
import { drive } from "./testing/stub-lsp";
import type { FsPort } from "./types";

// 외부 검토가 재현한 네 건(PR #34 HEAD 8284e07)을 합성 환경(메모리 파일 시스템·가짜 포트·스텁 엔진)에서 다시 만든 시험이다. 실제 Semgrep의
// 동작이 아니다. 수정 전 구현에서 실패하고 수정 후 통과해야 하는 시험만 모았다.

function fixtureBytes(fixture: string): Uint8Array {
  return readFileSync(fileURLToPath(new URL(`../../${fixture}`, import.meta.url)));
}

const world = buildControlWorld(fixtureBytes);
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const SUITE_PATH = "/suite/negative-controls.json";
const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

/** 파일(경로 → 바이트 해시)과 디렉터리 목록 전체. 거절 전후가 같은지 보는 데 쓴다. */
async function snapshot(
  memory: MemoryFs
): Promise<{ files: Record<string, string>; dirs: string[] }> {
  const files: Record<string, string> = {};
  for (const rel of await memory.listFilesRecursive("/")) {
    files[`/${rel}`] = sha256(await memory.readFile(`/${rel}`));
  }
  return { files, dirs: memory.directories };
}

/** 도구 관측이 격리를 확인한 요약(버전 확인 중 수신 0건). 기본 호출자(CLI)가 정상 실행에서 넘기는 모양이다. */
const cleanSummary = (hitsDuring: number | null = 0) =>
  summaryOf({
    version: world.data.pin.semgrep.version,
    wheel: world.data.pin.semgrep.wheel.sha256,
    hitsDuring,
  });

// ── 1. 버전 확인용 수신기에서 본 요청이 스위트 실행 허용에 반영되지 않았다 ──────

describe("재현 1 — 도구 관측 단계의 격리 위반", () => {
  for (const hits of [1, 3]) {
    it(`metrics_hits_during=${hits}이면 기준·변형 실행 없이 16개 모두 NOT_RUN이고 원인을 남긴다`, async () => {
      const rig = makeRig(world, { inputs: { toolObservation: cleanSummary(hits) } });
      const suite = await rig.run();
      expect(rig.processKeys).toEqual([]); // 엔진 포트를 만들지 않았다(기준·변형 LSP 기동 없음)
      expect(rig.resourceKeys).toEqual([]);
      expect(suite.baseline.clean).toBe(false);
      expect(suite.baseline.evidence).toBeNull();
      expect(Object.values(statuses(suite)).every((s) => s === "NOT_RUN")).toBe(true);
      for (const c of suite.cases) {
        if (c.id === "R9" && c.layer === "engine") continue; // 계약 충돌이 먼저다
        expect(c.outcome, `${c.id}:${c.layer}`).toBe("TOOL_OBSERVATION_BLOCKED");
      }
      expect(suite.blocked).toEqual({
        stage: "TOOL_OBSERVATION",
        cause: "METRICS_RECEIVER_HIT",
        metrics_hits_during: hits,
      });
    });
  }

  it("관측 실패(null)와 요약 없음도 0으로 보정하지 않는다 — 같은 방식으로 막힌다", async () => {
    const nullHits = makeRig(world, { inputs: { toolObservation: cleanSummary(null) } });
    const a = await nullHits.run();
    expect(nullHits.processKeys).toEqual([]);
    expect(a.blocked).toMatchObject({
      stage: "TOOL_OBSERVATION",
      cause: "METRICS_HITS_UNOBSERVED",
    });
    expect(a.blocked).toMatchObject({ metrics_hits_during: null });

    const absent = makeRig(world, { inputs: { toolObservation: undefined } });
    const b = await absent.run();
    expect(absent.processKeys).toEqual([]);
    expect(b.blocked).toMatchObject({
      stage: "TOOL_OBSERVATION",
      cause: "TOOL_OBSERVATION_ABSENT",
    });
  });

  it("0건이면 막지 않는다(대조군): 기준 실행이 돌고 사전 검사 7개가 PASS한다", async () => {
    const rig = makeRig(world, { inputs: { toolObservation: cleanSummary(0) } });
    const suite = await rig.run();
    expect(suite.blocked).toBeNull();
    expect(rig.processKeys.length).toBeGreaterThan(0);
    expect(
      suite.entries.filter((e) => e.layer === "preflight" && e.status === "PASS")
    ).toHaveLength(7);
  });

  it("읽는 쪽도 같은 기준이다: 기준 증거에 격리 위반이 남아 있는 스위트는 항목을 만들지 않는다", async () => {
    // 위반이 없는 상태로 스위트를 만들고, 기준 증거의 관측 요약만 위반으로 바꿔 쓴 세계를 읽는다.
    const rig = makeRig(world, { inputs: { toolObservation: cleanSummary(0) } });
    const suite = await rig.run();
    const edited = await cloneWithEvidenceEdit(rig, `${SUITE}-baseline`, (run) => {
      run.resources.tool_observation.version_check.metrics_hits_during = 1;
    });
    await edited.fs.writeFileExclusive(
      SUITE_PATH,
      encoder.encode(serializeSuite(withBaselineHash(suite, edited.sha256)))
    );
    const input = await loadNegativeControlSuite(edited.fs, SUITE_PATH, "/evidence");
    expect(input.entries.every((e) => e.status === "NOT_RUN")).toBe(true);
    expect(input.summary.problems).toContain("BASELINE_METRICS_RECEIVER_HIT");
  });
});

describe("재현 1 — CLI 전체 경로", () => {
  it("버전 확인용 첫 수신기만 1건을 봐도 서버 기동 없이 16개 NOT_RUN이고, 관측값은 거짓으로 바뀌지 않는다", async () => {
    const receivers: FakeMetricsReceiver[] = [];
    const w = buildCliWorld(fixtureBytes, {
      receiver: () => {
        const r = new FakeMetricsReceiver();
        if (receivers.length === 0) {
          r.onObserve = (call) => {
            if (call === 2) r.hits = 1; // before(1번째 관측) → 버전 확인 → after(2번째 관측)
          };
        }
        receivers.push(r);
        return r;
      },
    } satisfies CliWorldOptions);
    const code = await drive(w.clock, main(argvNegativeControl(), w.deps), 1000 * 3_600_000);
    const body = JSON.parse(w.out.join("")) as {
      status: string;
      counts: { pass: number; fail: number; not_run: number };
      baseline: { clean: boolean };
      blocked: { stage: string; cause: string; metrics_hits_during: number | null } | null;
      cases: { id: string; layer: string; outcome: string }[];
      tool_observation: { version_check: { version: string; metrics_hits_during: number } };
    };
    expect(code).toBe(EXIT.failed);
    expect(body.status).toBe("INCOMPLETE");
    expect(body.counts).toEqual({ pass: 0, fail: 0, not_run: 16 });
    expect(body.baseline.clean).toBe(false);
    expect(body.blocked).toEqual({
      stage: "TOOL_OBSERVATION",
      cause: "METRICS_RECEIVER_HIT",
      metrics_hits_during: 1,
    });
    expect(w.serverCalls).toEqual([]); // 기준·변형 LSP 기동 없음
    expect(body.tool_observation.version_check.metrics_hits_during).toBe(1); // 관측값을 바꾸지 않았다
    expect(body.tool_observation.version_check.version).toBe(world.data.pin.semgrep.version);
    expect(receivers).toHaveLength(1);
    expect(receivers[0].closeCalls).toBe(1);
    expect(w.lock.files.size).toBe(0);
  });
});

// ── 2. 초기화 실패가 사전 검사 사유에 가려져 엔진 PASS가 된다 ──────────────────

const engineWith =
  (id: string, reaction: ReturnType<typeof assumedEngine>) =>
  (key: { id: string; layer: "preflight" | "engine" }) =>
    key.id === id ? reaction : assumedEngine(world, key as never);

describe("재현 2 — 관측 단계 전의 초기화·전송·프로세스 실패", () => {
  it("R1 엔진의 initialize 응답이 오류이면: PH0·PH1만 이르고 사유에 RULES_FILE_REMOVED와 INIT_ERROR_RESPONSE가 함께 있어도 PASS가 아니다", async () => {
    const rig = makeRig(world, {
      engine: engineWith("R1", { patch: { init: { reply: "error", delayMs: 0 } } }),
    });
    const suite = await rig.run();
    // 재현 조건 확인: 증거에 보고된 모양이 그대로 있다.
    const run = JSON.parse(
      decoder.decode(await rig.memory.readFile(`/evidence/${SUITE}-r1-engine/run.json`))
    );
    expect(run.measurement.phases_reached).toEqual(["PH0", "PH1"]);
    const codes = run.measurement.reasons.map((r: { code: string }) => r.code);
    expect(codes).toContain("RULES_FILE_REMOVED");
    expect(codes).toContain("INIT_ERROR_RESPONSE");
    expect(run.measurement.status).toBe("MANIFEST_MISMATCH");
    // 판정
    expect(entryOf(suite, "R1", "engine")).toMatchObject({ status: "NOT_RUN", observed: null });
    expect(caseOf(suite, "R1", "engine").outcome).toBe("ENGINE_EXECUTION_FAILED");
  });

  it("관측 단계 전의 프로세스 실패(initialize 중 종료)도 가려지지 않는다: R2 엔진", async () => {
    const rig = makeRig(world, {
      engine: engineWith("R2", {
        patch: { crash: { on: "initialize", afterMs: 0, code: 1, signal: null } },
      }),
    });
    const suite = await rig.run();
    expect(entryOf(suite, "R2", "engine").status).toBe("NOT_RUN");
    expect(caseOf(suite, "R2", "engine").outcome).toBe("ENGINE_EXECUTION_FAILED");
  });

  it("사전 검사 사유가 없는 R6도 초기화 실패는 FAIL(엔진이 다르게 반응)이 아니라 NOT_RUN이다 — 관측이 성립하지 않았다", async () => {
    const rig = makeRig(world, {
      engine: engineWith("R6", { patch: { init: { reply: "error", delayMs: 0 } } }),
    });
    const suite = await rig.run();
    expect(entryOf(suite, "R6", "engine")).toMatchObject({ status: "NOT_RUN", observed: null });
    expect(caseOf(suite, "R6", "engine").outcome).toBe("ENGINE_EXECUTION_FAILED");
  });

  it("기록 읽기도 같은 기준이다: 스위트가 R1 엔진을 EXECUTED라고 속여도 증거를 다시 읽어 같은 판정으로 NOT_RUN이다", async () => {
    const rig = makeRig(world, {
      engine: engineWith("R1", { patch: { init: { reply: "error", delayMs: 0 } } }),
    });
    const suite = await rig.run();
    await rig.memory.writeFileExclusive(SUITE_PATH, encoder.encode(serializeSuite(suite)));
    const json = JSON.parse(decoder.decode(await rig.memory.readFile(SUITE_PATH))) as {
      cases: { id: string; layer: string; outcome: string }[];
    };
    const claimed = json.cases.find((c) => c.id === "R1" && c.layer === "engine");
    if (!claimed) throw new Error("사례가 없다");
    claimed.outcome = "EXECUTED";
    await rig.memory.writeFileExclusive(
      "/suite/claimed.json",
      encoder.encode(JSON.stringify(json))
    );
    const input = await loadNegativeControlSuite(rig.memory, "/suite/claimed.json", "/evidence");
    expect(input.entries.find((e) => e.id === "R1" && e.layer === "engine")).toMatchObject({
      status: "NOT_RUN",
      observed: null,
    });
    expect(input.summary.outcomes).toContainEqual({
      id: "R1",
      layer: "engine",
      outcome: "ENGINE_EXECUTION_FAILED",
    });
  });

  it("정상 반응은 막지 않는다(대조군): R6·R8 엔진은 사전 검사 사유 없이 엔진의 반응으로 PASS한다", async () => {
    const suite = await makeRig(world).run();
    expect(entryOf(suite, "R6", "engine").status).toBe("PASS");
    expect(entryOf(suite, "R8", "engine").status).toBe("PASS");
  });
});

// ── 3. 다른 사례의 증거를 재사용해도 로더가 수락한다 ───────────────────────────

type SuiteJson = {
  cases: {
    id: string;
    layer: string;
    outcome: string;
    evidence: { run_id: string; run_json_sha256: string } | null;
  }[];
};

async function writeSuiteVariant(
  rig: Rig,
  name: string,
  edit: (json: SuiteJson) => void
): Promise<string> {
  const json = JSON.parse(decoder.decode(await rig.memory.readFile(SUITE_PATH))) as SuiteJson;
  edit(json);
  const path = `/suite/${name}.json`;
  await rig.memory.writeFileExclusive(path, encoder.encode(JSON.stringify(json)));
  return path;
}
const caseJson = (json: SuiteJson, id: string, layer: string) => {
  const found = json.cases.find((c) => c.id === id && c.layer === layer);
  if (!found) throw new Error(`사례가 없다: ${id}:${layer}`);
  return found;
};

describe("재현 3 — 다른 사례·기준 실행의 증거 재사용", () => {
  async function runWritten(): Promise<Rig> {
    const rig = makeRig(world, { inputs: { toolObservation: cleanSummary(0) } });
    const suite = await rig.run();
    await rig.memory.writeFileExclusive(SUITE_PATH, encoder.encode(serializeSuite(suite)));
    return rig;
  }

  it("R4 사전 검사에 R3 사전 검사의 run_id·해시를 붙이면(기대·사유가 같아 우연히 PASS로 재도출된다) 거절한다", async () => {
    const rig = await runWritten();
    const path = await writeSuiteVariant(rig, "reuse", (json) => {
      caseJson(json, "R4", "preflight").evidence = caseJson(json, "R3", "preflight").evidence;
    });
    const input = await loadNegativeControlSuite(rig.memory, path, "/evidence");
    expect(input.entries.find((e) => e.id === "R4" && e.layer === "preflight")).toMatchObject({
      status: "NOT_RUN",
      observed: null,
      binding_sha256: null,
    });
    expect(input.summary.problems).toContain("R4:preflight:EVIDENCE_RUN_ID_UNEXPECTED");
    // 원래 사례는 그대로다.
    expect(input.entries.find((e) => e.id === "R3" && e.layer === "preflight")?.status).toBe(
      "PASS"
    );
  });

  it("R5 엔진을 NOT_RUN→EXECUTED로 고치고 R2 엔진의 증거를 가리켜도 수락하지 않는다", async () => {
    const rig = await runWritten();
    const path = await writeSuiteVariant(rig, "r5-from-r2", (json) => {
      const r5 = caseJson(json, "R5", "engine");
      r5.outcome = "EXECUTED";
      r5.evidence = caseJson(json, "R2", "engine").evidence;
    });
    const input = await loadNegativeControlSuite(rig.memory, path, "/evidence");
    expect(input.entries.find((e) => e.id === "R5" && e.layer === "engine")?.status).toBe(
      "NOT_RUN"
    );
    expect(input.summary.problems).toContain("R5:engine:EVIDENCE_RUN_ID_UNEXPECTED");
  });

  it("기준 실행의 증거를 사례에 붙이는 것도 거절한다", async () => {
    const rig = await runWritten();
    const baselineSha = sha256(await rig.memory.readFile(`/evidence/${SUITE}-baseline/run.json`));
    const path = await writeSuiteVariant(rig, "baseline-reuse", (json) => {
      caseJson(json, "R6", "engine").evidence = {
        run_id: `${SUITE}-baseline`,
        run_json_sha256: baselineSha,
      };
    });
    const input = await loadNegativeControlSuite(rig.memory, path, "/evidence");
    expect(input.entries.find((e) => e.id === "R6" && e.layer === "engine")?.status).toBe(
      "NOT_RUN"
    );
    expect(input.summary.problems).toContain("R6:engine:EVIDENCE_RUN_ID_UNEXPECTED");
  });

  it("같은 증거를 두 사례가 가리키면(중복 참조) 주인이 아닌 쪽만 거절한다 — 주인(기대 run id와 같은 쪽)은 영향받지 않는다", async () => {
    const rig = await runWritten();
    const path = await writeSuiteVariant(rig, "duplicate", (json) => {
      caseJson(json, "R4", "preflight").evidence = caseJson(json, "R3", "preflight").evidence;
    });
    const input = await loadNegativeControlSuite(rig.memory, path, "/evidence");
    const r3 = input.entries.find((e) => e.id === "R3" && e.layer === "preflight");
    const r4 = input.entries.find((e) => e.id === "R4" && e.layer === "preflight");
    expect(r3?.status).toBe("PASS");
    expect(r4?.status).toBe("NOT_RUN");
    expect(input.summary.problems).toEqual([
      "R4:preflight:EVIDENCE_RUN_ID_UNEXPECTED",
      "R4:preflight:EVIDENCE_REF_DUPLICATE",
    ]);
  });

  it("여러 사례가 한 증거를 함께 가리키면 주장자 모두 거절한다(중복 참조)", async () => {
    const rig = await runWritten();
    const path = await writeSuiteVariant(rig, "duplicate-orphan", (json) => {
      const shared = caseJson(json, "R2", "engine").evidence;
      caseJson(json, "R6", "engine").evidence = shared;
      caseJson(json, "R8", "engine").evidence = shared;
    });
    const input = await loadNegativeControlSuite(rig.memory, path, "/evidence");
    for (const id of ["R6", "R8"]) {
      expect(input.entries.find((e) => e.id === id && e.layer === "engine")?.status).toBe(
        "NOT_RUN"
      );
      expect(input.summary.problems).toContain(`${id}:engine:EVIDENCE_REF_DUPLICATE`);
    }
  });

  it("참조 run_id와 기록 내부 run_id가 다르면 거절한다(R3의 run.json 바이트를 R4 폴더에 두고 해시를 맞춘 경우)", async () => {
    const rig = await runWritten();
    const r3Bytes = await rig.memory.readFile(`/evidence/${SUITE}-r3-preflight/run.json`);
    const clone = await cloneMemory(rig.memory, {
      [`/evidence/${SUITE}-r4-preflight/run.json`]: r3Bytes,
    });
    const json = JSON.parse(decoder.decode(await rig.memory.readFile(SUITE_PATH))) as SuiteJson;
    caseJson(json, "R4", "preflight").evidence = {
      run_id: `${SUITE}-r4-preflight`,
      run_json_sha256: sha256(r3Bytes),
    };
    await clone.writeFileExclusive("/suite/inner.json", encoder.encode(JSON.stringify(json)));
    const input = await loadNegativeControlSuite(clone, "/suite/inner.json", "/evidence");
    expect(input.entries.find((e) => e.id === "R4" && e.layer === "preflight")?.status).toBe(
      "NOT_RUN"
    );
    expect(input.summary.problems).toContain("R4:preflight:EVIDENCE_RUN_ID_MISMATCH");
  });

  it("증거 경로는 공유 run-id 검증으로 만든다: ../ 가 든 run_id는 읽지 않는다", async () => {
    const rig = await runWritten();
    const path = await writeSuiteVariant(rig, "escape", (json) => {
      caseJson(json, "R6", "engine").evidence = {
        run_id: "../suite/x",
        run_json_sha256: "0".repeat(64),
      };
    });
    const reads: string[] = [];
    const spy: FsPort = {
      readFile: (p) => (reads.push(p), rig.memory.readFile(p)),
      writeFileExclusive: (p, d) => rig.memory.writeFileExclusive(p, d),
      mkdirp: (p) => rig.memory.mkdirp(p),
      listFilesRecursive: (r) => rig.memory.listFilesRecursive(r),
      exists: (p) => rig.memory.exists(p),
      physicalKey: (p) => rig.memory.physicalKey(p),
    };
    const input = await loadNegativeControlSuite(spy, path, "/evidence");
    expect(input.summary.problems).toContain("R6:engine:EVIDENCE_REF_INVALID");
    expect(reads.some((p) => p.includes(".."))).toBe(false);
  });

  it("정상 스위트는 수락한다(대조군): 문제 토큰이 없다", async () => {
    const rig = await runWritten();
    const input = await loadNegativeControlSuite(rig.memory, SUITE_PATH, "/evidence");
    expect(input.summary.accepted).toBe(true);
    expect(input.summary.problems).toEqual([]);
  });
});

// ── 4. 원본 폴더 안에 증거를 쓰는 설정 ────────────────────────────────────────

describe("재현 4 — 원본 보호 범위 안의 쓰기", () => {
  const protectedRoots: [string, string][] = [
    ["대조 예제", world.paths.fixturesRoot],
    ["규칙 캐시", world.paths.rulesCacheRoot],
    ["고정 데이터", world.paths.dataDir],
    ["하네스", world.paths.harnessRoot],
    ["대조 예제 아래 하위 폴더", `${world.paths.fixturesRoot}/sub`],
  ];

  for (const [name, root] of protectedRoots) {
    it(`runNegativeControls 직접 호출: --evidence-root가 ${name} 안이면 아무것도 쓰지 않고 16개 NOT_RUN이다`, async () => {
      const rig = makeRig(world, { inputs: { evidenceRoot: root } });
      const before = await snapshot(rig.memory);
      const suite = await rig.run();
      expect(rig.writes).toEqual([]);
      expect(rig.processKeys).toEqual([]);
      expect(await snapshot(rig.memory)).toEqual(before);
      expect(Object.values(statuses(suite)).every((s) => s === "NOT_RUN")).toBe(true);
      expect(suite.blocked).toMatchObject({ stage: "WORKSPACE" });
    });
  }

  it("링크·별칭으로 원본을 가리키는 증거 폴더도 막는다(physicalKey로 푼 자리 기준)", async () => {
    const alias = "/alias-evidence";
    const rig = makeRig(world, {
      inputs: { evidenceRoot: alias },
      wrapFs: (memory) => ({
        readFile: (p) => memory.readFile(p),
        writeFileExclusive: (p, d) => memory.writeFileExclusive(p, d),
        mkdirp: (p) => memory.mkdirp(p),
        listFilesRecursive: (r) => memory.listFilesRecursive(r),
        exists: (p) => memory.exists(p),
        physicalKey: async (p) =>
          p === alias || p.startsWith(`${alias}/`)
            ? `${world.paths.fixturesRoot}${p.slice(alias.length)}`
            : memory.physicalKey(p),
      }),
    });
    const before = await snapshot(rig.memory);
    const suite = await rig.run();
    expect(await snapshot(rig.memory)).toEqual(before);
    expect(Object.values(statuses(suite)).every((s) => s === "NOT_RUN")).toBe(true);
  });

  it("작업 공간 하위가 링크로 원본을 가리키는 경우(사례 폴더 이름의 링크)도 막는다", async () => {
    const rig = makeRig(world, {
      wrapFs: (memory) => ({
        readFile: (p) => memory.readFile(p),
        writeFileExclusive: (p, d) => memory.writeFileExclusive(p, d),
        mkdirp: (p) => memory.mkdirp(p),
        listFilesRecursive: (r) => memory.listFilesRecursive(r),
        exists: (p) => memory.exists(p),
        physicalKey: async (p) =>
          p === `/work/${SUITE}-r1-preflight` || p.startsWith(`/work/${SUITE}-r1-preflight/`)
            ? `${world.paths.rulesCacheRoot}${p.slice(`/work/${SUITE}-r1-preflight`.length)}`
            : memory.physicalKey(p),
      }),
    });
    const before = await snapshot(rig.memory);
    const suite = await rig.run();
    expect(await snapshot(rig.memory)).toEqual(before);
    expect(Object.values(statuses(suite)).every((s) => s === "NOT_RUN")).toBe(true);
  });

  it("정상적으로 분리된 작업·증거 폴더는 계속 허용한다(대조군)", async () => {
    const rig = makeRig(world, { inputs: { toolObservation: cleanSummary(0) } });
    const suite = await rig.run();
    expect(suite.blocked).toBeNull();
    expect(rig.writes.length).toBeGreaterThan(0);
  });
});

describe("재현 4 — CLI", () => {
  const cliCases: [string, string][] = [
    ["대조 예제 루트", FIXTURES_ROOT],
    ["규칙 캐시", `/cache/${SYNTHETIC_CACHE_DIR}`],
    ["고정 데이터", `${SYNTHETIC_HARNESS_ROOT}/data`],
    ["하네스", SYNTHETIC_HARNESS_ROOT],
  ];
  for (const [name, root] of cliCases) {
    it(`--evidence-root가 ${name}이면 사용법 오류 2이고 포트·잠금·표지·상태 폴더·수신기를 만들기 전에 끝난다`, async () => {
      const w: CliWorld = buildCliWorld(fixtureBytes);
      const argv = argvNegativeControl();
      argv.splice(argv.indexOf("--evidence-root") + 1, 1, root);
      const before = await snapshot(w.fs);
      const code = await drive(w.clock, main(argv, w.deps), 1000 * 3_600_000);
      expect(code).toBe(EXIT.usage);
      expect(w.portCalls).toEqual([]);
      expect(w.lock.calls).toEqual([]);
      expect(w.receivers).toEqual([]);
      expect(w.versionCalls).toEqual([]);
      expect(w.serverCalls).toEqual([]);
      expect(w.writes).toEqual([]);
      expect(await snapshot(w.fs)).toEqual(before);
      expect(w.err.join("")).toContain("원본");
    });
  }

  it("정상 경로(분리된 증거·작업 폴더)는 그대로 돈다(대조군)", async () => {
    const w: CliWorld = buildCliWorld(fixtureBytes);
    const code = await drive(w.clock, main(argvNegativeControl(), w.deps), 1000 * 3_600_000);
    expect(code).toBe(EXIT.failed); // R9 엔진 층 때문에 0이 될 수 없다
    expect(w.serverCalls.length).toBeGreaterThan(0);
    expect(await w.fs.exists(`${EVIDENCE_ROOT}/${SUITE_ID}/negative-controls.json`)).toBe(true);
  });
});

// ── 실행기 → 스위트 저장 → 다시 읽기 → control 기록 연결 ──────────────────────

describe("연결 전체(CLI): negative-control → 스위트 기록 → run --negative-controls → run.json", () => {
  const RECORD = `${EVIDENCE_ROOT}/${SUITE_ID}/negative-controls.json`;
  type Chain = {
    suite: { counts: { pass: number; not_run: number } };
    run: {
      negative_controls: { loaded?: { accepted: boolean; rejection: string | null } };
      record: {
        resources: {
          negative_control_suite?: {
            accepted: boolean;
            rejection: string | null;
            problems: string[];
            counts: { pass: number; fail: number; not_run: number };
          };
        } | null;
      } | null;
    };
    entries: { id: string; layer: string; status: string }[];
    w: CliWorld;
  };

  async function chain(
    options: CliWorldOptions,
    tamper?: (w: CliWorld, original: string) => Promise<string>
  ): Promise<Chain> {
    const w: CliWorld = buildCliWorld(fixtureBytes, options);
    await drive(w.clock, main(argvNegativeControl(), w.deps), 1000 * 3_600_000);
    const suite = JSON.parse(w.out.join("")) as Chain["suite"];
    w.out.length = 0;
    const path = tamper ? await tamper(w, RECORD) : RECORD;
    await drive(
      w.clock,
      main(
        [
          "run",
          "--mode",
          "control",
          "--run-id",
          "ctl-1",
          "--rules-cache",
          `/cache/${SYNTHETIC_CACHE_DIR}`,
          "--evidence-root",
          EVIDENCE_ROOT,
          "--control-fixtures-root",
          FIXTURES_ROOT,
          "--control-tree-root",
          "/ctl/tree",
          "--wheel-artifact",
          "/artifacts/semgrep-test-only.whl",
          "--negative-controls",
          path,
          "--allow-real-semgrep",
          "--semgrep-bin",
          "/opt/semgrep/bin/semgrep",
        ],
        w.deps
      ),
      1000 * 3_600_000
    );
    const run = JSON.parse(w.out.join("")) as Chain["run"];
    const json = JSON.parse(
      decoder.decode(await w.fs.readFile(`${EVIDENCE_ROOT}/ctl-1/run.json`))
    ) as { control_assertions: { negative_controls: Chain["entries"] } };
    return { suite, run, entries: json.control_assertions.negative_controls, w };
  }

  it("정상 연결: 사례별 증거에서 다시 도출한 9 PASS가 control_assertions까지 이어진다(문제 토큰 없음)", async () => {
    const c = await chain({});
    expect(c.suite.counts).toMatchObject({ pass: 9, not_run: 7 });
    expect(c.run.record?.resources?.negative_control_suite).toMatchObject({
      accepted: true,
      rejection: null,
      problems: [],
      counts: { pass: 9, fail: 0, not_run: 7 },
    });
    expect(c.entries.filter((e) => e.status === "PASS")).toHaveLength(9);
  });

  it("다른 사례의 증거를 가리키도록 고친 스위트 기록은 control 실행에서 그 항목만 NOT_RUN이고 문제 토큰이 run.json에 남는다", async () => {
    const c = await chain({}, async (w, original) => {
      const json = JSON.parse(decoder.decode(await w.fs.readFile(original))) as SuiteJson;
      caseJson(json, "R4", "preflight").evidence = caseJson(json, "R3", "preflight").evidence;
      const path = `${EVIDENCE_ROOT}/${SUITE_ID}/tampered.json`;
      await w.fs.writeFileExclusive(path, encoder.encode(JSON.stringify(json)));
      return path;
    });
    expect(c.entries.find((e) => e.id === "R4" && e.layer === "preflight")?.status).toBe("NOT_RUN");
    expect(c.entries.find((e) => e.id === "R3" && e.layer === "preflight")?.status).toBe("PASS");
    expect(c.run.record?.resources?.negative_control_suite?.problems).toContain(
      "R4:preflight:EVIDENCE_RUN_ID_UNEXPECTED"
    );
  });

  it("도구 관측 단계에서 막힌 스위트 기록은 control 실행이 원인과 함께 거절하고 16개 모두 NOT_RUN이다", async () => {
    let created = 0;
    const c = await chain({
      receiver: () => {
        const r = new FakeMetricsReceiver();
        if (created++ === 0) {
          r.onObserve = (call) => {
            if (call === 2) r.hits = 1;
          };
        }
        return r;
      },
    });
    expect(c.run.record?.resources?.negative_control_suite).toMatchObject({
      accepted: false,
      rejection: "SUITE_BLOCKED(TOOL_OBSERVATION:METRICS_RECEIVER_HIT)",
    });
    expect(c.entries.every((e) => e.status === "NOT_RUN")).toBe(true);
  });
});

// ── 도우미 ───────────────────────────────────────────────────────

async function cloneMemory(
  source: MemoryFs,
  overrides: Record<string, Uint8Array> = {}
): Promise<MemoryFs> {
  const initial: Record<string, Uint8Array> = {};
  for (const rel of await source.listFilesRecursive("/")) {
    initial[`/${rel}`] = await source.readFile(`/${rel}`);
  }
  return new MemoryFs({ ...initial, ...overrides });
}

/** 증거 run.json 하나를 고친 사본 세계와 그 새 해시. 해시를 스위트에 맞춰 쓰면 "해시 불일치"가 아니라 내용으로 걸러지는지 볼 수 있다. */
async function cloneWithEvidenceEdit(
  rig: Rig,
  runId: string,
  edit: (run: any) => void // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<{ fs: MemoryFs; sha256: string }> {
  const path = `/evidence/${runId}/run.json`;
  const run = JSON.parse(decoder.decode(await rig.memory.readFile(path)));
  edit(run);
  const bytes = encoder.encode(JSON.stringify(run));
  return { fs: await cloneMemory(rig.memory, { [path]: bytes }), sha256: sha256(bytes) };
}

/** 스위트 기록의 기준 증거 해시를 바꾼다. */
function withBaselineHash(suite: NegativeControlSuite, hash: string): NegativeControlSuite {
  return {
    ...suite,
    baseline: {
      ...suite.baseline,
      evidence: { run_id: suite.baseline.run_id, run_json_sha256: hash },
    },
  };
}
