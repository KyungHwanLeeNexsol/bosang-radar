import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical";
import {
  NEGATIVE_CONTROL_TABLE,
  defaultNegativeControls,
  type NegativeControlSpec,
} from "./control";
import { EVIDENCE_FILE_NAMES } from "./evidence";
import {
  ENGINE_OBSERVATION_CONTRACTS,
  NEGATIVE_MUTATIONS,
  SUITE_SCHEMA,
  caseRunId,
  deriveNegativeControlEntry,
  engineExecutionProblem,
  engineLayerConflicts,
  engineObservationContract,
  plannedRunIds,
  toolIsolationBlock,
  type LayerObservation,
  type RunKey,
} from "./negative-control";
import { REASON_STATUS, type ReasonCode } from "./status";
import { summaryOf } from "./testing/observation-fixtures";
import { buildControlWorld } from "./testing/control-world";
import {
  SUITE,
  assumedEngine,
  caseOf,
  entryOf,
  makeRig,
  statuses,
} from "./testing/negative-control-rig";
import type { StubPatch } from "./testing/stub-lsp";

// 이 시험의 모든 실행은 메모리 파일 시스템과 스텁 엔진 위에서 돈다. 규칙 YAML·대조 트리·엔진 반응은 전부 합성이며 실제 Semgrep의
// 동작이나 탐지의 증거가 아니다. "가정한 엔진 반응"이라고 적힌 시험은 스크립트가 정한 반응에 대한 판정 논리의 결과일 뿐이다.

function fixtureBytes(fixture: string): Uint8Array {
  return readFileSync(fileURLToPath(new URL(`../../${fixture}`, import.meta.url)));
}

const world = buildControlWorld(fixtureBytes);
const BINDING = "a".repeat(64);

const spec = (id: string): NegativeControlSpec => {
  const found = NEGATIVE_CONTROL_TABLE.find((s) => s.id === id);
  if (!found) throw new Error(`표에 없는 id: ${id}`);
  return found;
};

// ── 순수 판정 ────────────────────────────────────────────────────

/** 표가 정한 기대와 사유를 그대로 관측한 "이상적인" 관측(시험의 출발점). 실행기는 이 값을 만들지 않고 하네스의 판정에서 읽는다. */
function idealObservation(s: NegativeControlSpec, layer: "preflight" | "engine"): LayerObservation {
  return {
    recorded: true,
    phases: layer === "engine" ? ["PH0", "PH1", "PH2", "PH3", "PH4"] : ["PH0"],
    spawned: layer === "engine",
    attempted: layer === "engine",
    status: layer === "preflight" ? (s.preflight?.status ?? null) : s.expected,
    reasonCodes: s.preflight === null ? [] : [s.preflight.reason],
    binding: BINDING,
    provenance: "stub",
    cancelled: false,
    diagnostic: layer === "engine",
  };
}

describe("engineLayerConflicts — 표에서 도출한 계약 충돌", () => {
  it("실제 표에서는 R9의 엔진 층 하나뿐이다: 알 수 없는 키가 반드시 내는 SETTINGS_MISMATCH가 ISOLATION_VIOLATION보다 앞선다", () => {
    expect(engineLayerConflicts()).toEqual([
      {
        id: "R9",
        expected: "ISOLATION_VIOLATION",
        outranked_by: { reason: "SETTINGS_KEY_NOT_ALLOWED", status: "SETTINGS_MISMATCH" },
      },
    ]);
  });

  it("id를 적어 둔 목록이 아니라 표에서 도출한다: 표를 바꾸면 결과가 따라 바뀐다", () => {
    const edited = NEGATIVE_CONTROL_TABLE.map((s) =>
      s.id === "R5"
        ? { ...s, expected: "ISOLATION_VIOLATION" as const }
        : s.id === "R9"
          ? { ...s, expected: "SETTINGS_MISMATCH" as const }
          : s
    );
    expect(engineLayerConflicts(edited).map((c) => c.id)).toEqual(["R5"]);
    // 사전 검사가 없는 id(엔진에서만 나오는 사유)는 충돌을 도출할 수 없다 — 표의 사전 검사 사유가 근거이기 때문이다.
    expect(
      engineLayerConflicts(NEGATIVE_CONTROL_TABLE.filter((s) => s.preflight === null))
    ).toEqual([]);
  });
});

describe("NEGATIVE_MUTATIONS — 입력 변형 목록", () => {
  it("표의 id 집합과 정확히 같다(표를 복제하지 않고 id로만 잇는다)", () => {
    expect(Object.keys(NEGATIVE_MUTATIONS).sort()).toEqual(
      NEGATIVE_CONTROL_TABLE.map((s) => s.id).sort()
    );
  });

  it("변형은 규칙 사본이나 서버 옵션 중 하나 이상을 바꾸고, 종류가 서로 다르다", () => {
    for (const [id, m] of Object.entries(NEGATIVE_MUTATIONS)) {
      expect(m.rules !== null || m.options !== null, id).toBe(true);
    }
    expect(new Set(Object.values(NEGATIVE_MUTATIONS).map((m) => m.kind)).size).toBe(9);
  });

  it("기대 상태·사례 목록은 변형 목록에 없다", () => {
    for (const m of Object.values(NEGATIVE_MUTATIONS)) {
      expect(Object.keys(m).sort()).toEqual(["kind", "options", "outsideCopy", "rules"]);
    }
  });
});

describe("deriveNegativeControlEntry — 관측에서 항목을 정한다", () => {
  const conflicts = engineLayerConflicts();
  const derive = (
    id: string,
    layer: "preflight" | "engine",
    over: Partial<LayerObservation> = {}
  ) =>
    deriveNegativeControlEntry(
      spec(id),
      layer,
      { ...idealObservation(spec(id), layer), ...over },
      BINDING,
      conflicts
    );

  it("표의 모든 (id, 층)에서: 이상적인 관측이면 사전 검사 7개와 엔진 R6·R8만 PASS다 — 사전 검사 사유가 상태를 가리는 엔진 항목(R1~R5·R7)은 엔진 고유 관측의 계약이 없어 NOT_RUN, R9 엔진은 계약 충돌 NOT_RUN", () => {
    let pass = 0;
    for (const s of NEGATIVE_CONTROL_TABLE) {
      for (const layer of ["preflight", "engine"] as const) {
        if (layer === "preflight" && s.preflight === null) continue;
        const { entry, outcome } = derive(s.id, layer);
        if (s.id === "R9" && layer === "engine") {
          expect(entry.status).toBe("NOT_RUN");
          expect(outcome).toBe("BLOCKED_CONTRACT_CONFLICT");
          expect(entry.observed).toBeNull();
          expect(entry.binding_sha256).toBeNull();
        } else if (layer === "engine" && s.preflight !== null) {
          // 이상적인 관측(상태가 기대와 같고 사전 검사 사유가 있음)이어도 엔진이 변형을 따로 잡았다는 증거가 아니다.
          expect(entry.status, `${s.id}:${layer}`).toBe("NOT_RUN");
          expect(outcome).toBe("ENGINE_OBSERVATION_UNCONFIRMED");
          expect(entry.observed).toBeNull();
          expect(entry.binding_sha256).toBeNull();
        } else {
          expect(entry.status, `${s.id}:${layer}`).toBe("PASS");
          expect(outcome).toBe("EXECUTED");
          expect(entry.binding_sha256).toBe(BINDING);
          pass++;
        }
      }
    }
    expect(pass).toBe(9); // 사전 검사 7 + 엔진 R6·R8
  });

  it("observed는 관측한 상태다: 기대와 다르면 FAIL이고 observed는 기대가 아니라 관측값이다", () => {
    const { entry } = derive("R5", "preflight", { status: "COMPLETE", reasonCodes: [] });
    expect(entry).toMatchObject({
      id: "R5",
      layer: "preflight",
      expected: "MANIFEST_MISMATCH",
      observed: "COMPLETE",
      status: "FAIL",
      binding_sha256: BINDING,
    });
    const other = derive("R6", "engine", { status: "RULE_LOAD_ERROR" }).entry;
    expect(other).toMatchObject({
      expected: "RULES_NOT_LOADED",
      observed: "RULE_LOAD_ERROR",
      status: "FAIL",
    });
  });

  it("층의 기대는 서로 다를 수 있다: R9 사전 검사의 기대는 SETTINGS_MISMATCH이고 엔진 항목의 기대는 따로다", () => {
    expect(derive("R9", "preflight").entry.expected).toBe("SETTINGS_MISMATCH");
    expect(derive("R9", "engine").entry.expected).toBe("ISOLATION_VIOLATION");
  });

  it("표가 정한 사전 검사 사유가 판정에 없으면 상태가 같아도 PASS가 아니다(우연한 일치를 막는다)", () => {
    expect(derive("R1", "preflight", { reasonCodes: ["RULES_FILE_ADDED"] }).entry.status).toBe(
      "FAIL"
    );
    // 사전 검사 사유가 없는 id(R6)는 사유 조건이 없다.
    expect(derive("R6", "engine", { reasonCodes: [] }).entry.status).toBe("PASS");
  });

  it("엔진 층 R1~R5·R7: 대표 상태가 기대와 같아도 사전 검사 사유가 있는지와 무관하게 엔진 고유 관측의 계약이 없으면 PASS가 아니다 (ENGINE_OBSERVATION_UNCONFIRMED)", () => {
    for (const id of ["R1", "R2", "R3", "R4", "R5", "R7"]) {
      const withCause = derive(id, "engine");
      const withoutCause = derive(id, "engine", { reasonCodes: [] });
      for (const e of [withCause, withoutCause]) {
        expect(e.entry.status, id).toBe("NOT_RUN");
        expect(e.outcome, id).toBe("ENGINE_OBSERVATION_UNCONFIRMED");
      }
    }
    // 아무것도 상태를 가리지 않는 id(R6·R8)는 대표 상태가 곧 엔진의 반응이다.
    expect(engineObservationContract(spec("R6"))).toEqual({ state: "STATUS_IS_REACTION" });
    expect(engineObservationContract(spec("R8"))).toEqual({ state: "STATUS_IS_REACTION" });
    for (const id of ["R1", "R2", "R3", "R4", "R5", "R7", "R9"]) {
      expect(engineObservationContract(spec(id)), id).toEqual({ state: "UNCONFIRMED" });
    }
    // 확정된 계약은 비어 있다(추측으로 채우지 않는다).
    expect(ENGINE_OBSERVATION_CONTRACTS).toEqual({});
  });

  it("[가정한 계약 — 기전 시험] 확정된 계약이 있으면 엔진이 낸 반응 사유가 있어야 PASS다: 사전 검사 사유만 있으면 FAIL, 반응 사유가 함께 있으면 PASS", () => {
    // 실제 로그·진단 형식은 확정되지 않았다. 아래 계약은 판정 기전을 보이려는 가정이며 실제 엔진이 이 사유를 낸다는 뜻이 아니다.
    const assumed = { R1: { reactionReasons: ["RULE_FILE_ERRORS_REPORTED" as const] } };
    const run = (reasonCodes: LayerObservation["reasonCodes"]) =>
      deriveNegativeControlEntry(
        spec("R1"),
        "engine",
        { ...idealObservation(spec("R1"), "engine"), reasonCodes },
        BINDING,
        conflicts,
        assumed
      );
    expect(engineObservationContract(spec("R1"), assumed)).toEqual({
      state: "CONFIRMED",
      reactionReasons: ["RULE_FILE_ERRORS_REPORTED"],
    });
    const masked = run(["RULES_FILE_REMOVED"]);
    expect(masked.entry).toMatchObject({ status: "FAIL", observed: "MANIFEST_MISMATCH" });
    expect(masked.outcome).toBe("EXECUTED");
    expect(run(["RULES_FILE_REMOVED", "RULE_FILE_ERRORS_REPORTED"]).entry.status).toBe("PASS");
  });

  it("엔진 미기동은 PASS가 아니다 — 관측된 상태가 기대와 같아도 NOT_RUN(ENGINE_NOT_STARTED)이다", () => {
    for (const id of ["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8"]) {
      const { entry, outcome } = derive(id, "engine", { spawned: false, attempted: false });
      expect(entry.status, id).toBe("NOT_RUN");
      expect(outcome, id).toBe("ENGINE_NOT_STARTED");
      expect(entry.observed, id).toBeNull();
    }
  });

  it("사전 검사 층: 엔진을 띄우려 한 시도가 있으면 막아야 할 것을 못 막은 것이라 FAIL이다", () => {
    expect(derive("R3", "preflight", { attempted: true }).entry.status).toBe("FAIL");
    expect(derive("R3", "preflight", { attempted: true, spawned: true }).entry.status).toBe("FAIL");
  });

  it("층에 맞지 않는 실행(엔진 항목에 일반 실행, 사전 검사 항목에 진단 실행)은 쓰지 않는다 — 두 층은 서로 대신하지 못한다", () => {
    expect(derive("R1", "engine", { diagnostic: false }).outcome).toBe("RUN_FAILED");
    expect(derive("R1", "preflight", { diagnostic: true }).outcome).toBe("RUN_FAILED");
    expect(derive("R1", "engine", { diagnostic: false }).entry.status).toBe("NOT_RUN");
  });

  it("취소·증거 누락·결합 불명·결합 불일치는 모두 NOT_RUN이고 각자 다른 이유를 남긴다", () => {
    expect(derive("R1", "preflight", { cancelled: true }).outcome).toBe("CANCELLED");
    expect(derive("R1", "preflight", { recorded: false }).outcome).toBe("RUN_FAILED");
    expect(derive("R1", "preflight", { status: null }).outcome).toBe("RUN_FAILED");
    expect(derive("R1", "preflight", { binding: null }).outcome).toBe("BINDING_UNAVAILABLE");
    expect(derive("R1", "preflight", { binding: "b".repeat(64) }).outcome).toBe("BINDING_DRIFT");
    const unknownBase = deriveNegativeControlEntry(
      spec("R1"),
      "preflight",
      idealObservation(spec("R1"), "preflight"),
      null,
      conflicts
    );
    expect(unknownBase.outcome).toBe("BINDING_UNAVAILABLE");
    for (const over of [
      { cancelled: true },
      { recorded: false },
      { binding: null },
      { binding: "b".repeat(64) },
    ]) {
      const e = derive("R1", "preflight", over).entry;
      expect(e).toMatchObject({ status: "NOT_RUN", observed: null, binding_sha256: null });
    }
  });

  it("사전 검사가 없는 id의 사전 검사 층은 없다(NO_SUCH_LAYER)", () => {
    const { entry, outcome } = deriveNegativeControlEntry(
      spec("R6"),
      "preflight",
      idealObservation(spec("R6"), "engine"),
      BINDING,
      conflicts
    );
    expect(outcome).toBe("NO_SUCH_LAYER");
    expect(entry.status).toBe("NOT_RUN");
  });
});

describe("엔진 층: 관측 단계 전의 실행 실패는 사전 검사 사유가 상태를 가려도 관측이 아니다", () => {
  const conflicts = engineLayerConflicts();
  const derive = (id: string, over: Partial<LayerObservation>) =>
    deriveNegativeControlEntry(
      spec(id),
      "engine",
      { ...idealObservation(spec(id), "engine"), ...over },
      BINDING,
      conflicts
    );

  it("INIT_FAILED로 매핑된 모든 사유(표에서 도출)와 전송 무결성 실패는 관측 단계 전의 실패다 — 모든 엔진 사례에서 NOT_RUN(ENGINE_EXECUTION_FAILED)", () => {
    const initCodes = (Object.keys(REASON_STATUS) as ReasonCode[]).filter(
      (c) => REASON_STATUS[c] === "INIT_FAILED"
    );
    expect(initCodes.length).toBeGreaterThanOrEqual(11);
    const failures: ReasonCode[] = [
      ...initCodes,
      "STDIN_WRITE_FAILED",
      "RESPONSE_ID_UNMATCHED",
      "RESPONSE_ID_DUPLICATE",
    ];
    for (const code of failures) {
      for (const id of ["R1", "R6", "R7", "R8"]) {
        const cause = spec(id).preflight?.reason;
        const e = derive(id, { reasonCodes: [...(cause ? [cause] : []), code] });
        expect(e.entry.status, `${id}+${code}`).toBe("NOT_RUN");
        expect(e.outcome, `${id}+${code}`).toBe("ENGINE_EXECUTION_FAILED");
        expect(e.entry.observed).toBeNull();
      }
    }
  });

  it("대표 상태는 판정에 쓰이지 않는다: 상태가 기대와 같든 INIT_FAILED든 사유가 같으면 같은 결과다", () => {
    const same = derive("R1", {
      status: "MANIFEST_MISMATCH",
      reasonCodes: ["INIT_ERROR_RESPONSE"],
    });
    const other = derive("R1", { status: "INIT_FAILED", reasonCodes: ["INIT_ERROR_RESPONSE"] });
    expect(same.outcome).toBe("ENGINE_EXECUTION_FAILED");
    expect(other.outcome).toBe("ENGINE_EXECUTION_FAILED");
  });

  it("사유는 없지만 관측 단계(PH2)에 이르지 못했으면 NOT_RUN(ENGINE_STAGE_NOT_REACHED)이다", () => {
    for (const phases of [["PH0"], ["PH0", "PH1"]] as const) {
      const e = derive("R6", { phases: [...phases], status: "RULES_NOT_LOADED" });
      expect(e.entry.status).toBe("NOT_RUN");
      expect(e.outcome).toBe("ENGINE_STAGE_NOT_REACHED");
    }
    expect(engineExecutionProblem({ reasonCodes: [], phases: ["PH0", "PH1", "PH2"] })).toBeNull();
  });

  it("일괄 차단이 아니다: 관측 단계 안·뒤의 사유(규칙 로딩 반응, 스캔·종료 실패)는 이 사례의 관측을 무너뜨리지 않는다", () => {
    // R6의 의도한 관측은 규칙 로딩(PH2)에서 일어난다 — 그 반응(과 그 단계의 대기 시간 초과)은 실행 실패로 보지 않는다.
    const reaction = derive("R6", {
      phases: ["PH0", "PH1", "PH2"],
      reasonCodes: ["RULES_REFRESHED_MISSING", "TIMEOUT_RULES"],
    });
    expect(reaction.entry.status).toBe("PASS");
    // 관측 단계 뒤(PH3·PH4)의 프로세스·전송 실패는 PH2의 관측과 무관하다.
    for (const code of [
      "EXIT_BEFORE_BARRIER",
      "EXIT_NONZERO",
      "MALFORMED_FRAME",
      "TRUNCATED_FRAME",
      "CLEANUP_FAILED",
      "TIMEOUT_SCAN",
      "NO_BARRIER",
    ] as const) {
      expect(derive("R6", { reasonCodes: [code] }).entry.status, code).toBe("PASS");
    }
  });

  it("사전 검사 층에는 적용되지 않는다(엔진을 띄우지 않으므로 단계가 없다)", () => {
    const e = deriveNegativeControlEntry(
      spec("R1"),
      "preflight",
      {
        ...idealObservation(spec("R1"), "preflight"),
        reasonCodes: ["RULES_FILE_REMOVED", "SPAWN_FAILED"],
      },
      BINDING,
      conflicts
    );
    expect(e.outcome).toBe("EXECUTED"); // 판단은 attempted/기대 대조로 한다(이 합성 관측은 attempted=false)
  });
});

describe("toolIsolationBlock — 도구 관측 단계의 격리", () => {
  const withHits = (hits: number | null) =>
    summaryOf({ version: "1.0.0", wheel: "a".repeat(64), hitsDuring: hits });

  it("0건일 때만 막지 않는다. 1건 이상·관측 실패(null)·형식 오류·요약 없음은 막는다", () => {
    expect(toolIsolationBlock(withHits(0))).toBeNull();
    expect(toolIsolationBlock(withHits(1))).toBe("METRICS_RECEIVER_HIT");
    expect(toolIsolationBlock(withHits(7))).toBe("METRICS_RECEIVER_HIT");
    expect(toolIsolationBlock(withHits(null))).toBe("METRICS_HITS_UNOBSERVED");
    for (const bad of [-1, 1.5, Number.NaN, "0", undefined, {}]) {
      expect(toolIsolationBlock({ version_check: { metrics_hits_during: bad } }), String(bad)).toBe(
        "METRICS_HITS_UNOBSERVED"
      );
    }
    for (const absent of [undefined, null, "x", 3, [], {}, { version_check: null }]) {
      expect(toolIsolationBlock(absent), JSON.stringify(absent)).toBe("TOOL_OBSERVATION_ABSENT");
    }
  });
});

describe("사례 run id", () => {
  it("실행기가 만드는 규칙과 같다: 기준은 <suite>-baseline, 사례는 <suite>-<id 소문자>-<층>이고 서로 다르다", () => {
    expect(caseRunId("s", "baseline", "engine")).toBe("s-baseline");
    expect(caseRunId("s", "R5", "engine")).toBe("s-r5-engine");
    expect(caseRunId("s", "R5", "preflight")).toBe("s-r5-preflight");
    const planned = plannedRunIds("s");
    expect(planned).toHaveLength(1 + 16);
    expect(new Set(planned).size).toBe(planned.length);
  });
});

// ── 실행기: 합성 세계 끝에서 끝까지 ──────────────────────────────

describe("runNegativeControls — 합성 세계 끝에서 끝까지", () => {
  it("표의 16개 (id, 층)를 모두 다룬다: 사전 검사 7 + 엔진 9, 순서는 기본 기록과 같다", async () => {
    const suite = await makeRig(world).run();
    expect(suite.schema).toBe(SUITE_SCHEMA);
    expect(suite.entries.map((e) => `${e.id}:${e.layer}`)).toEqual(
      defaultNegativeControls().map((e) => `${e.id}:${e.layer}`)
    );
    expect(suite.entries).toHaveLength(16);
    expect(suite.cases).toHaveLength(16);
  });

  it("가정한 엔진 반응에서: 사전 검사 7개와 엔진 R6·R8이 PASS, 엔진 R1~R5·R7은 실행했어도 엔진 고유 관측의 계약이 없어 NOT_RUN, R9 엔진은 충돌로 NOT_RUN이다", async () => {
    const suite = await makeRig(world).run();
    expect(statuses(suite)).toEqual({
      "R1:engine": "NOT_RUN",
      "R1:preflight": "PASS",
      "R2:engine": "NOT_RUN",
      "R2:preflight": "PASS",
      "R3:engine": "NOT_RUN",
      "R3:preflight": "PASS",
      "R4:engine": "NOT_RUN",
      "R4:preflight": "PASS",
      "R5:engine": "NOT_RUN",
      "R5:preflight": "PASS",
      "R6:engine": "PASS",
      "R7:engine": "NOT_RUN",
      "R7:preflight": "PASS",
      "R8:engine": "PASS",
      "R9:engine": "NOT_RUN",
      "R9:preflight": "PASS",
    });
    for (const id of ["R1", "R2", "R3", "R4", "R5", "R7"]) {
      expect(caseOf(suite, id, "engine").outcome, id).toBe("ENGINE_OBSERVATION_UNCONFIRMED");
      // 실행은 했다: 증거가 남는다(계약이 확정되면 같은 증거로 판정할 수 있다).
      expect(caseOf(suite, id, "engine").evidence, id).not.toBeNull();
    }
    expect(caseOf(suite, "R9", "engine").outcome).toBe("BLOCKED_CONTRACT_CONFLICT");
    expect(suite.conflicts.map((c) => c.id)).toEqual(["R9"]);
    expect(suite.baseline.clean).toBe(true);
    expect(suite.provenance).toBe("stub");
  });

  it("관측값은 하네스의 판정이다: 층별 observed가 표의 기대와 같지만 기대에서 복사하지 않고 각 실행의 대표 상태를 읽는다", async () => {
    const suite = await makeRig(world).run();
    expect(entryOf(suite, "R1", "preflight")).toMatchObject({
      expected: "MANIFEST_MISMATCH",
      observed: "MANIFEST_MISMATCH",
    });
    expect(entryOf(suite, "R6", "engine")).toMatchObject({
      expected: "RULES_NOT_LOADED",
      observed: "RULES_NOT_LOADED",
    });
    expect(entryOf(suite, "R8", "engine")).toMatchObject({
      expected: "PREFIX_MISSING",
      observed: "PREFIX_MISSING",
    });
    expect(entryOf(suite, "R9", "preflight")).toMatchObject({
      expected: "SETTINGS_MISMATCH",
      observed: "SETTINGS_MISMATCH",
    });
  });

  it("[가정한 엔진 반응] R8: 엔진이 cwd 밖 경로를 로딩 줄에 찍으면 대표 상태가 PREFIX_MISSING이 아니라 SETTINGS_MISMATCH다 — FAIL로 드러난다(충돌 후보, 미확인)", async () => {
    const loggedOutside = (key: RunKey) =>
      key.id === "R8"
        ? {
            patch: {
              rules: {
                loadingPaths: world.data.rulesFiles.map(
                  (f) => `/elsewhere/${world.cacheDir}/${f.path}`
                ),
              } as StubPatch["rules"],
            },
          }
        : assumedEngine(world, key);
    const suite = await makeRig(world, { engine: loggedOutside }).run();
    expect(entryOf(suite, "R8", "engine")).toMatchObject({
      expected: "PREFIX_MISSING",
      observed: "SETTINGS_MISMATCH",
      status: "FAIL",
    });
    // 이 한 항목의 어긋남이 다른 항목을 바꾸지 않는다.
    expect(entryOf(suite, "R6", "engine").status).toBe("PASS");
  });

  it("R9 엔진은 실행하지 않는다: 그 사례의 엔진 포트도 자원도 만들지 않았고 증거 폴더도 없다", async () => {
    const rig = makeRig(world);
    await rig.run();
    expect(rig.processKeys.map((k) => k.runId)).not.toContain(`${SUITE}-r9-engine`);
    expect(rig.resourceKeys.map((k) => k.runId)).not.toContain(`${SUITE}-r9-engine`);
    expect(await rig.memory.exists(`/evidence/${SUITE}-r9-engine`)).toBe(false);
    expect(await rig.memory.exists(`/work/${SUITE}-r9-engine`)).toBe(false);
  });

  it("사전 검사 층은 엔진을 띄우지 않는다: 띄울 수 없는 포트로 돌고, 시도가 한 번도 없다", async () => {
    const rig = makeRig(world);
    const suite = await rig.run();
    for (const s of NEGATIVE_CONTROL_TABLE.filter((x) => x.preflight !== null)) {
      const runId = `${SUITE}-${s.id.toLowerCase()}-preflight`;
      expect(rig.ports.get(runId)?.spawnCalls, runId).toEqual([]);
      // 증거로도 같다: 엔진 단계(PH1~)에 이르지 않았고 진단 표시가 없다.
      const run = JSON.parse(
        new TextDecoder().decode(await rig.memory.readFile(`/evidence/${runId}/run.json`))
      );
      expect(run.measurement.phases_reached, runId).toEqual(["PH0"]);
      expect(run.resources?.engine_diagnostic, runId).toBeUndefined();
    }
    expect(
      suite.entries.filter((e) => e.layer === "preflight" && e.status === "PASS")
    ).toHaveLength(7);
  });

  it("엔진 층은 엔진을 실제로 띄운 진단 실행이다: 모든 실행이 스폰했고 진단 표시와 사전 검사 사유가 증거에 남는다", async () => {
    const rig = makeRig(world);
    await rig.run();
    const read = async (runId: string) =>
      JSON.parse(
        new TextDecoder().decode(await rig.memory.readFile(`/evidence/${runId}/run.json`))
      );
    for (const id of ["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8"]) {
      const runId = `${SUITE}-${id.toLowerCase()}-engine`;
      expect(rig.ports.get(runId)?.spawnCalls.length, runId).toBe(1);
      const run = await read(runId);
      expect(run.resources.engine_diagnostic.policy, runId).toBe("ENGINE_DIAGNOSTIC");
      expect(run.measurement.phases_reached, runId).toContain("PH1");
    }
    // R1~R5·R7: 사전 검사 사유가 있었는데도 시작했다. R6·R8·기준: 사유가 없었다.
    expect(
      (await read(`${SUITE}-r1-engine`)).resources.engine_diagnostic.started_despite_refusals
    ).toBe(true);
    expect(
      (await read(`${SUITE}-r7-engine`)).resources.engine_diagnostic.started_despite_refusals
    ).toBe(true);
    expect(
      (await read(`${SUITE}-r6-engine`)).resources.engine_diagnostic.started_despite_refusals
    ).toBe(false);
    expect(
      (await read(`${SUITE}-baseline`)).resources.engine_diagnostic.started_despite_refusals
    ).toBe(false);
  });

  it("사례별 작업 공간과 증거가 분리된다: 사례마다 자기 폴더에 증거 9개가 있고 서로 겹치지 않는다", async () => {
    const rig = makeRig(world);
    const suite = await rig.run();
    const runIds = [
      `${SUITE}-baseline`,
      ...suite.cases.filter((c) => c.evidence !== null).map((c) => c.evidence?.run_id as string),
    ];
    expect(new Set(runIds).size).toBe(runIds.length); // 증거 폴더가 사례마다 다르다
    expect(runIds).toHaveLength(1 + 15);
    for (const runId of runIds) {
      for (const name of EVIDENCE_FILE_NAMES) {
        expect(await rig.memory.exists(`/evidence/${runId}/${name}`), `${runId}/${name}`).toBe(
          true
        );
      }
      expect(await rig.memory.exists(`/work/${runId}/tree`), runId).toBe(true);
    }
  });

  it("원본 규칙 캐시·대조 예제·데이터는 바뀌지 않고, 쓰기는 작업 공간과 증거 폴더에만 있다", async () => {
    const rig = makeRig(world);
    await rig.run();
    for (const [path, data] of Object.entries(world.files)) {
      const expected = typeof data === "string" ? new TextEncoder().encode(data) : data;
      expect(await rig.memory.readFile(path), path).toEqual(expected);
    }
    // 원본 캐시 폴더에는 새 파일도 없다.
    const cacheNow = await rig.memory.listFilesRecursive(world.paths.rulesCacheRoot);
    expect(cacheNow).toEqual(world.data.rulesFiles.map((f) => f.path));
    const outside = rig.writes.filter(
      (p) => !p.startsWith("/work/") && !p.startsWith("/evidence/")
    );
    expect(outside).toEqual([]);
  });

  it("변형 추적: 변형한 사본과 기준의 관계가 해시로 남는다(원본 바이트의 해시 → 변형 후 해시)", async () => {
    const suite = await makeRig(world).run();
    const first = world.data.rulesFiles[0].path;
    const r1 = caseOf(suite, "R1", "preflight").mutation;
    expect(r1).toMatchObject({ kind: "RULES_REMOVE_FILE", baseline_run_id: `${SUITE}-baseline` });
    expect(r1?.rules?.omitted).toEqual([first]);
    const r5 = caseOf(suite, "R5", "preflight").mutation;
    expect(r5?.rules?.replaced).toHaveLength(1);
    expect(r5?.rules?.replaced[0].path).toBe(first);
    expect(r5?.rules?.replaced[0].before_sha256).not.toBe(r5?.rules?.replaced[0].after_sha256);
    const r4 = caseOf(suite, "R4", "engine").mutation;
    expect(r4?.rules?.added).toHaveLength(1);
    expect(r4?.rules?.added[0].path).toMatch(/\/zz-negative-control-added\.yaml$/);
    const r7 = caseOf(suite, "R7", "preflight").mutation;
    expect(r7?.options?.before_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(r7?.options?.after_sha256).not.toBe(r7?.options?.before_sha256);
    // 사전 검사가 없는 id의 사전 검사 사례는 없다.
    expect(suite.cases.find((c) => c.id === "R6" && c.layer === "preflight")).toBeUndefined();
  });

  it("사례별 증거에 신원이 남는다: 스위트·사례·층·변형 종류와, 스위트 기록의 변형 추적에서 다시 계산되는 해시", async () => {
    const rig = makeRig(world);
    const suite = await rig.run();
    const read = async (runId: string) =>
      JSON.parse(
        new TextDecoder().decode(await rig.memory.readFile(`/evidence/${runId}/run.json`))
      );
    const r5 = (await read(`${SUITE}-r5-preflight`)).resources.negative_control_case;
    expect(r5).toEqual({
      suite_id: SUITE,
      case_id: "R5",
      layer: "preflight",
      mutation_kind: "RULES_CHANGE_BODY",
      mutation_sha256: createHash("sha256")
        .update(canonicalJson(caseOf(suite, "R5", "preflight").mutation))
        .digest("hex"),
    });
    // 같은 변형을 가해도 사례(id·층)가 다르면 변형 추적이 달라 해시가 다르다 — 어느 사례의 증거인지 서로 바꿔 쓸 수 없다.
    const r5engine = (await read(`${SUITE}-r5-engine`)).resources.negative_control_case;
    expect(r5engine.layer).toBe("engine");
    // 기준 실행은 변형이 없다.
    expect((await read(`${SUITE}-baseline`)).resources.negative_control_case).toEqual({
      suite_id: SUITE,
      case_id: "baseline",
      layer: "engine",
      mutation_kind: null,
      mutation_sha256: null,
    });
  });

  it("결합: 모든 실행이 기준과 같은 결합으로 묶이고 PASS 항목에 그 결합이 찍힌다", async () => {
    const suite = await makeRig(world).run();
    expect(suite.binding_sha256).toMatch(/^[0-9a-f]{64}$/);
    for (const e of suite.entries.filter((x) => x.status === "PASS")) {
      expect(e.binding_sha256, `${e.id}:${e.layer}`).toBe(suite.binding_sha256);
    }
    for (const e of suite.entries.filter((x) => x.status === "NOT_RUN")) {
      expect(e.binding_sha256).toBeNull();
      expect(e.observed).toBeNull();
    }
  });

  it("스위트 기록은 스텁 출처이고 실제 엔진 반응과 변형 YAML의 유효성은 미확인으로 남긴다", async () => {
    const suite = await makeRig(world).run();
    expect(suite.provenance).toBe("stub");
    expect(suite.not_established).toEqual({
      actual_engine_behavior: "UNVERIFIED",
      mutated_yaml_validity: "UNVERIFIED",
    });
  });
});
