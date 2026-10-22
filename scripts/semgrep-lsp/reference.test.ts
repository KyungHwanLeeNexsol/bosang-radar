import { describe, expect, it } from "vitest";
import { NEGATIVE_CONTROL_TABLE } from "./control";
import { canonicalJson } from "./evidence";
import {
  checkControlReferenceFacts,
  qualifyControlRun,
  requiredNegativeControlKeys,
} from "./reference";
import { sha256Hex } from "./sha";
import type {
  NegativeControlResult,
  ReferenceFingerprints,
  ReferenceQualification,
  RunRecord,
} from "./types";

// PR #28 외부 검토(발견 2·3) 회귀 시험: 음성 대조를 요구하는 대조 참조 자격(qualifyControlRun)과
// target 판정이 사실로 다시 확인하는 검사(checkControlReferenceFacts). 순수 모듈 reference.ts를 대상으로 쓴
// 시험이며 모듈이 아직 없으므로 지금은 모두 실패한다([RED]). 기대값은 설계 명세(§3, §7)에서 가져왔다.
// provenance "real"은 분기 논리를 시험하기 위한 가정일 뿐 실제 Semgrep 실행의 증거가 아니다.

type QualifyArgs = Parameters<typeof qualifyControlRun>[0];
type Ref = NonNullable<RunRecord["control_reference"]>;

const PIN_SHA = sha256Hex("pin-fixture");
const RULES_LIST = sha256Hex("rules-list");
const RULES_EXPECTED = sha256Hex("rules-expected");

/** 시험 안에서 따로 구현한 결합 공식(§4). 운영 buildBinding과 독립이다. */
function specBinding(c: {
  tool_version: string;
  wheel_sha256: string;
  pin_sha256: string;
  rules_list_sha256: string;
  rules_expected_sha256: string;
  harness_sha256: string;
  control_sha256: string;
}): string {
  return sha256Hex(
    canonicalJson({
      schema: "semgrep-lsp-binding/1",
      tool: { version: c.tool_version, wheel_sha256: c.wheel_sha256 },
      pin_sha256: c.pin_sha256,
      rules: { list_sha256: c.rules_list_sha256, expected_sha256: c.rules_expected_sha256 },
      harness_sha256: c.harness_sha256,
      control_sha256: c.control_sha256,
    })
  );
}

/** 모든 값이 채워지고 결합이 구성 요소와 맞는 지문. */
function fullFingerprints(over: Partial<ReferenceFingerprints> = {}): ReferenceFingerprints {
  const base = {
    harness_sha256: sha256Hex("harness"),
    control_sha256: sha256Hex("control"),
    rules_list_sha256: RULES_LIST,
    rules_expected_sha256: RULES_EXPECTED,
    tool_version: "1.180.0",
    wheel_sha256: sha256Hex("wheel"),
  };
  const merged = { ...base, ...over };
  const binding =
    over.binding_sha256 !== undefined
      ? over.binding_sha256
      : specBinding({
          tool_version: merged.tool_version as string,
          wheel_sha256: merged.wheel_sha256 as string,
          pin_sha256: PIN_SHA,
          rules_list_sha256: merged.rules_list_sha256,
          rules_expected_sha256: merged.rules_expected_sha256,
          harness_sha256: merged.harness_sha256 as string,
          control_sha256: merged.control_sha256 as string,
        });
  return { ...merged, binding_sha256: binding } as ReferenceFingerprints;
}

/** 필요한 (id, layer) 16쌍이 모두 PASS이고 같은 결합을 가진 음성 대조 기록. */
function qualifiedNegatives(binding: string | null): NegativeControlResult[] {
  const out: Record<string, unknown>[] = [];
  for (const spec of NEGATIVE_CONTROL_TABLE) {
    out.push({
      id: spec.id,
      layer: "engine",
      expected: spec.expected,
      observed: spec.expected,
      status: "PASS",
      binding_sha256: binding,
    });
    if (spec.preflight !== null) {
      out.push({
        id: spec.id,
        layer: "preflight",
        expected: spec.preflight.status,
        observed: spec.preflight.status,
        status: "PASS",
        binding_sha256: binding,
      });
    }
  }
  return out as unknown as NegativeControlResult[];
}

type Entry = Record<string, unknown> & { id: string; layer: string };
const asEntries = (list: readonly NegativeControlResult[]): Entry[] =>
  list.map((n) => ({ ...n }) as unknown as Entry);
const find = (list: Entry[], id: string, layer: string): Entry => {
  const found = list.find((e) => e.id === id && e.layer === layer);
  if (!found) throw new Error(`시험 오류: ${id}:${layer} 항목이 없다`);
  return found;
};

function qualifiedInputs(f = fullFingerprints()): RunRecord["inputs"] {
  return {
    target_sha: null,
    pin_sha256: PIN_SHA,
    scope_sha256: null,
    rules_list_sha256: f.rules_list_sha256,
    rules_expected_sha256: f.rules_expected_sha256,
    control_tree_sha256: sha256Hex("control-tree"),
    harness_sha256: f.harness_sha256,
    control_sha256: f.control_sha256,
    tool_version_observed: f.tool_version,
    wheel_sha256_observed: f.wheel_sha256,
    binding_sha256: f.binding_sha256,
  } as unknown as RunRecord["inputs"];
}

function qualifyArgs(over: Partial<QualifyArgs> = {}): QualifyArgs {
  const f = fullFingerprints();
  return {
    mode: "control",
    provenance: "real",
    measurementStatus: "COMPLETE",
    controlAssertionsStatus: "PASS",
    n0Confirmed: true,
    inputs: qualifiedInputs(f),
    negativeControls: qualifiedNegatives(f.binding_sha256),
    ...over,
  };
}

const REQUIREMENT_IDS = [
  "CONTROL_ASSERTIONS_PASS",
  "FINGERPRINTS_COMPLETE",
  "MEASUREMENT_COMPLETE",
  "N0_CONFIRMED",
  "NEGATIVE_BINDING_MATCH",
  "NEGATIVE_ENGINE_PASS",
  "NEGATIVE_PREFLIGHT_PASS",
  "PROVENANCE_REAL",
] as const;

type ReqId = (typeof REQUIREMENT_IDS)[number];

function satisfied(q: ReferenceQualification, id: ReqId): boolean | undefined {
  return q.requirements.find((r) => (r.id as string) === id)?.satisfied;
}

/** 지정한 요구만 불충족이고 나머지는 충족인지 확인한다. */
function expectOnlyUnsatisfied(q: ReferenceQualification, ids: readonly ReqId[]): void {
  expect(q.applicable).toBe(true);
  expect(q.eligible).toBe(false);
  for (const id of REQUIREMENT_IDS) {
    expect(satisfied(q, id), `${id}`).toBe(!ids.includes(id));
  }
}

// ── requiredNegativeControlKeys ─────────────────────────────────

describe("requiredNegativeControlKeys", () => {
  it("[RED] 엔진 9개(R1~R9) + 사전 검사 7개(R1~R5, R7, R9) = 16쌍이다", () => {
    const keys = requiredNegativeControlKeys();
    expect(keys).toHaveLength(16);
    const engine = keys
      .filter((k) => k.layer === "engine")
      .map((k) => k.id)
      .sort();
    const preflight = keys
      .filter((k) => k.layer === "preflight")
      .map((k) => k.id)
      .sort();
    expect(engine).toEqual(["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9"]);
    expect(preflight).toEqual(["R1", "R2", "R3", "R4", "R5", "R7", "R9"]);
  });

  it("[RED] R6·R8은 엔진 전용이다(사전 검사 쌍이 없다). 중복 쌍도 없다", () => {
    const keys = requiredNegativeControlKeys();
    expect(keys.filter((k) => k.layer === "preflight" && (k.id === "R6" || k.id === "R8"))).toEqual(
      []
    );
    expect(new Set(keys.map((k) => `${k.id}:${k.layer}`)).size).toBe(keys.length);
  });

  it("[RED] NEGATIVE_CONTROL_TABLE과 일치한다(엔진은 전부, 사전 검사는 preflight가 있는 id만)", () => {
    const fromTable = NEGATIVE_CONTROL_TABLE.flatMap((spec) => [
      { id: spec.id, layer: "engine" },
      ...(spec.preflight === null ? [] : [{ id: spec.id, layer: "preflight" }]),
    ]);
    const norm = (list: { id: string; layer: string }[]) =>
      list.map((k) => `${k.id}:${k.layer}`).sort();
    expect(norm(requiredNegativeControlKeys())).toEqual(norm(fromTable));
  });
});

// ── qualifyControlRun ───────────────────────────────────────────

describe("qualifyControlRun: 대조 실행의 참조 자격", () => {
  it("[RED] 모든 요구가 충족되면 applicable·eligible이고 여덟 요구 모두 satisfied다", () => {
    const q = qualifyControlRun(qualifyArgs());
    expect(q.applicable).toBe(true);
    expect(q.eligible).toBe(true);
    for (const id of REQUIREMENT_IDS) expect(satisfied(q, id), id).toBe(true);
    for (const r of q.requirements) expect(typeof r.detail).toBe("string");
  });

  it("[RED] target 모드는 applicable false, eligible false, 요구 목록이 비어 있다", () => {
    const q = qualifyControlRun(qualifyArgs({ mode: "target" }));
    expect(q).toEqual({ applicable: false, eligible: false, requirements: [] });
  });

  it("[RED] 스텁 provenance는 다른 요구가 모두 충족돼도 절대 eligible이 아니다(PROVENANCE_REAL)", () => {
    const q = qualifyControlRun(qualifyArgs({ provenance: "stub" }));
    expectOnlyUnsatisfied(q, ["PROVENANCE_REAL"]);
  });

  it("[RED] 측정이 COMPLETE가 아니면 불충족이다(MEASUREMENT_COMPLETE)", () => {
    for (const status of ["PARTIAL", "RULES_NOT_LOADED", "ENGINE_FAILED", "NOT_RUN"] as const) {
      const q = qualifyControlRun(qualifyArgs({ measurementStatus: status }));
      expectOnlyUnsatisfied(q, ["MEASUREMENT_COMPLETE"]);
    }
  });

  it("[RED] 대조 단언이 PASS가 아니면 불충족이다(CONTROL_ASSERTIONS_PASS)", () => {
    for (const status of ["FAIL", "REVIEW_REQUIRED", "NOT_RUN", "NOT_APPLICABLE"] as const) {
      const q = qualifyControlRun(qualifyArgs({ controlAssertionsStatus: status }));
      expectOnlyUnsatisfied(q, ["CONTROL_ASSERTIONS_PASS"]);
    }
  });

  it("[RED] N0가 확정되지 않았으면 불충족이다(N0_CONFIRMED)", () => {
    const q = qualifyControlRun(qualifyArgs({ n0Confirmed: false }));
    expectOnlyUnsatisfied(q, ["N0_CONFIRMED"]);
  });

  it("[RED] 지문·결합이 하나라도 null이면 FINGERPRINTS_COMPLETE가 불충족이고 eligible이 아니다", () => {
    for (const key of [
      "harness_sha256",
      "control_sha256",
      "tool_version_observed",
      "wheel_sha256_observed",
      "binding_sha256",
    ]) {
      const inputs = { ...(qualifiedInputs() as unknown as Record<string, unknown>), [key]: null };
      const q = qualifyControlRun(
        qualifyArgs({ inputs: inputs as unknown as RunRecord["inputs"] })
      );
      expect(q.eligible, key).toBe(false);
      expect(satisfied(q, "FINGERPRINTS_COMPLETE"), key).toBe(false);
    }
  });

  it("[RED] 사전 검사 항목이 NOT_RUN·FAIL·누락·중복이면 NEGATIVE_PREFLIGHT_PASS만 불충족이다", () => {
    const mutations: Record<string, (list: Entry[]) => Entry[]> = {
      NOT_RUN: (list) => {
        const e = find(list, "R3", "preflight");
        e.status = "NOT_RUN";
        e.binding_sha256 = null;
        return list;
      },
      FAIL: (list) => {
        find(list, "R3", "preflight").status = "FAIL";
        return list;
      },
      누락: (list) => list.filter((e) => !(e.id === "R3" && e.layer === "preflight")),
      중복: (list) => [...list, { ...find(list, "R3", "preflight") }],
    };
    for (const [name, mutate] of Object.entries(mutations)) {
      const negatives = mutate(asEntries(qualifiedNegatives(fullFingerprints().binding_sha256)));
      const q = qualifyControlRun(
        qualifyArgs({ negativeControls: negatives as unknown as NegativeControlResult[] })
      );
      expect(satisfied(q, "NEGATIVE_PREFLIGHT_PASS"), name).toBe(false);
      expect(satisfied(q, "NEGATIVE_ENGINE_PASS"), name).toBe(true);
      expect(q.eligible, name).toBe(false);
    }
  });

  it("[RED] 엔진 항목이 NOT_RUN·FAIL·누락·중복이면 NEGATIVE_ENGINE_PASS만 불충족이다", () => {
    const mutations: Record<string, (list: Entry[]) => Entry[]> = {
      NOT_RUN: (list) => {
        const e = find(list, "R6", "engine");
        e.status = "NOT_RUN";
        e.binding_sha256 = null;
        return list;
      },
      FAIL: (list) => {
        find(list, "R1", "engine").status = "FAIL";
        return list;
      },
      누락: (list) => list.filter((e) => !(e.id === "R8" && e.layer === "engine")),
      중복: (list) => [...list, { ...find(list, "R9", "engine") }],
    };
    for (const [name, mutate] of Object.entries(mutations)) {
      const negatives = mutate(asEntries(qualifiedNegatives(fullFingerprints().binding_sha256)));
      const q = qualifyControlRun(
        qualifyArgs({ negativeControls: negatives as unknown as NegativeControlResult[] })
      );
      expect(satisfied(q, "NEGATIVE_ENGINE_PASS"), name).toBe(false);
      expect(satisfied(q, "NEGATIVE_PREFLIGHT_PASS"), name).toBe(true);
      expect(q.eligible, name).toBe(false);
    }
  });

  it("[RED] 기본 기록(16개 전부 NOT_RUN, 검토의 재현 조건)은 두 음성 요구가 모두 불충족이고 나머지는 충족이다", () => {
    const notRun = asEntries(qualifiedNegatives(null)).map((e) => ({
      ...e,
      observed: null,
      status: "NOT_RUN",
      binding_sha256: null,
    }));
    const q = qualifyControlRun(
      qualifyArgs({ negativeControls: notRun as unknown as NegativeControlResult[] })
    );
    expect(q.eligible).toBe(false);
    expect(satisfied(q, "NEGATIVE_PREFLIGHT_PASS")).toBe(false);
    expect(satisfied(q, "NEGATIVE_ENGINE_PASS")).toBe(false);
    for (const id of [
      "PROVENANCE_REAL",
      "MEASUREMENT_COMPLETE",
      "CONTROL_ASSERTIONS_PASS",
      "N0_CONFIRMED",
      "FINGERPRINTS_COMPLETE",
    ] as const) {
      expect(satisfied(q, id), id).toBe(true);
    }
  });

  it("[RED] 사전 검사 7개만 PASS이고 엔진이 없으면 사전 검사가 엔진을 대신하지 못한다(반대도 같다)", () => {
    const all = asEntries(qualifiedNegatives(fullFingerprints().binding_sha256));
    const onlyPreflight = all.filter((e) => e.layer === "preflight");
    const onlyEngine = all.filter((e) => e.layer === "engine");
    const a = qualifyControlRun(
      qualifyArgs({ negativeControls: onlyPreflight as unknown as NegativeControlResult[] })
    );
    expect(satisfied(a, "NEGATIVE_PREFLIGHT_PASS")).toBe(true);
    expect(satisfied(a, "NEGATIVE_ENGINE_PASS")).toBe(false);
    expect(a.eligible).toBe(false);
    const b = qualifyControlRun(
      qualifyArgs({ negativeControls: onlyEngine as unknown as NegativeControlResult[] })
    );
    expect(satisfied(b, "NEGATIVE_ENGINE_PASS")).toBe(true);
    expect(satisfied(b, "NEGATIVE_PREFLIGHT_PASS")).toBe(false);
    expect(b.eligible).toBe(false);
  });

  it("[RED] 엔진 R3 자리에 사전 검사 R3를 한 번 더 넣어도 엔진 요구는 충족되지 않는다(층이 서로 대신하지 않는다)", () => {
    const all = asEntries(qualifiedNegatives(fullFingerprints().binding_sha256));
    const swapped = all.map((e) =>
      e.id === "R3" && e.layer === "engine" ? { ...e, layer: "preflight" } : e
    );
    const q = qualifyControlRun(
      qualifyArgs({ negativeControls: swapped as unknown as NegativeControlResult[] })
    );
    expect(satisfied(q, "NEGATIVE_ENGINE_PASS")).toBe(false); // 엔진 R3가 없다
    expect(satisfied(q, "NEGATIVE_PREFLIGHT_PASS")).toBe(false); // 사전 검사 R3가 두 번이다
    expect(q.eligible).toBe(false);
  });

  it("[RED] PASS 항목의 결합이 이 실행의 결합과 다르거나 null이면 NEGATIVE_BINDING_MATCH만 불충족이다", () => {
    for (const binding of [sha256Hex("another-binding"), null]) {
      const negatives = asEntries(qualifiedNegatives(fullFingerprints().binding_sha256));
      find(negatives, "R2", "preflight").binding_sha256 = binding;
      const q = qualifyControlRun(
        qualifyArgs({ negativeControls: negatives as unknown as NegativeControlResult[] })
      );
      // PASS 항목은 모두 있으므로 두 층의 요구는 충족이고, 결합 일치만 불충족이다.
      expectOnlyUnsatisfied(q, ["NEGATIVE_BINDING_MATCH"]);
    }
  });

  it("[RED] 엔진 PASS 항목의 결합이 다르면 NEGATIVE_BINDING_MATCH가 불충족이다(사전 검사 결합이 맞아도)", () => {
    const negatives = asEntries(qualifiedNegatives(fullFingerprints().binding_sha256));
    find(negatives, "R5", "engine").binding_sha256 = sha256Hex("old-run-binding");
    const q = qualifyControlRun(
      qualifyArgs({ negativeControls: negatives as unknown as NegativeControlResult[] })
    );
    expectOnlyUnsatisfied(q, ["NEGATIVE_BINDING_MATCH"]);
  });

  it("[RED] 입력을 바꾸지 않는다", () => {
    const args = qualifyArgs();
    const copy = structuredClone(args);
    qualifyControlRun(args);
    expect(args).toEqual(copy);
  });

  // PR #29 외부 검토 발견 1: PASS 항목은 observed가 있고 현재 표(NEGATIVE_CONTROL_TABLE)의 기대 상태와 같아야 한다.
  // 두 층의 기대 상태는 서로 다를 수 있다(R9). 기대 상태는 이 시험이 표에서 따로 읽는다.
  const REQUIRED_PAIRS = NEGATIVE_CONTROL_TABLE.flatMap((spec) => [
    { id: spec.id, layer: "engine" as const, expected: spec.expected },
    ...(spec.preflight === null
      ? []
      : [{ id: spec.id, layer: "preflight" as const, expected: spec.preflight.status }]),
  ]);
  const requirementOf = (layer: "engine" | "preflight"): ReqId =>
    layer === "engine" ? "NEGATIVE_ENGINE_PASS" : "NEGATIVE_PREFLIGHT_PASS";
  const detailOf = (q: ReferenceQualification, id: ReqId): string =>
    q.requirements.find((r) => (r.id as string) === id)?.detail ?? "";

  function qualifyWith(mutate: (list: Entry[]) => void) {
    const negatives = asEntries(qualifiedNegatives(fullFingerprints().binding_sha256));
    mutate(negatives);
    return qualifyControlRun(
      qualifyArgs({ negativeControls: negatives as unknown as NegativeControlResult[] })
    );
  }

  it("[RED] 필수 16쌍 각각에서 observed=null인 PASS는 그 층의 요구만 불충족으로 만든다", () => {
    expect(REQUIRED_PAIRS).toHaveLength(16);
    for (const p of REQUIRED_PAIRS) {
      const q = qualifyWith((list) => (find(list, p.id, p.layer).observed = null));
      expectOnlyUnsatisfied(q, [requirementOf(p.layer)]);
      expect(detailOf(q, requirementOf(p.layer)), `${p.id}:${p.layer}`).toContain(
        `${p.id}:${p.layer}(observed-null)`
      );
    }
  });

  it("[RED] 필수 16쌍 각각에서 observed가 기대와 다른 PASS는 불충족이다", () => {
    for (const p of REQUIRED_PAIRS) {
      const q = qualifyWith((list) => (find(list, p.id, p.layer).observed = "COMPLETE"));
      expectOnlyUnsatisfied(q, [requirementOf(p.layer)]);
      expect(detailOf(q, requirementOf(p.layer))).toContain(`${p.id}:${p.layer}(observed)`);
    }
  });

  it("[RED] 필수 16쌍 각각에서 expected가 표의 기준과 다른 PASS는 불충족이다(observed가 같아도)", () => {
    for (const p of REQUIRED_PAIRS) {
      const q = qualifyWith((list) => {
        const e = find(list, p.id, p.layer);
        e.expected = "COMPLETE";
        e.observed = "COMPLETE";
      });
      expectOnlyUnsatisfied(q, [requirementOf(p.layer)]);
      expect(detailOf(q, requirementOf(p.layer))).toContain(`${p.id}:${p.layer}(expected)`);
    }
  });

  it("[RED] 두 층의 기대 상태를 같다고 가정하지 않는다(R9: engine ≠ preflight)", () => {
    const engine = REQUIRED_PAIRS.find((p) => p.id === "R9" && p.layer === "engine")!;
    const preflight = REQUIRED_PAIRS.find((p) => p.id === "R9" && p.layer === "preflight")!;
    expect(engine.expected).not.toBe(preflight.expected); // 시험 전제
    const pre = qualifyWith((list) =>
      Object.assign(find(list, "R9", "preflight"), {
        expected: engine.expected,
        observed: engine.expected,
      })
    );
    expectOnlyUnsatisfied(pre, ["NEGATIVE_PREFLIGHT_PASS"]);
    const eng = qualifyWith((list) =>
      Object.assign(find(list, "R9", "engine"), {
        expected: preflight.expected,
        observed: preflight.expected,
      })
    );
    expectOnlyUnsatisfied(eng, ["NEGATIVE_ENGINE_PASS"]);
  });

  it("[RED] 기존 검사는 유지된다: 기준과 맞는 16쌍 PASS는 충족이고, NOT_RUN·FAIL 항목은 observed 검사와 별개로 불충족이다", () => {
    expect(qualifyControlRun(qualifyArgs()).eligible).toBe(true);
    // 기본 기록(observed=null, NOT_RUN)은 기대·관측 토큰이 아니라 기존 NOT_RUN 사유로 불충족이다.
    const q = qualifyWith((list) => {
      for (const e of list) Object.assign(e, { observed: null, status: "NOT_RUN" });
    });
    expect(detailOf(q, "NEGATIVE_ENGINE_PASS")).toContain("R1:engine(NOT_RUN)");
    expect(detailOf(q, "NEGATIVE_ENGINE_PASS")).not.toContain("(observed");
  });
});

// ── checkControlReferenceFacts ──────────────────────────────────

/** 완전히 자격을 갖춘 대조 참조 요약(평범한 객체). 시험이 이것을 복제해 한 곳씩 망가뜨린다. */
function qualifiedRef(f = fullFingerprints()): Record<string, unknown> {
  return {
    run_id: "control-run-1",
    provenance: "real",
    status: "COMPLETE",
    control_assertions_status: "PASS",
    pin_sha256: PIN_SHA,
    n0_confirmed: true,
    eligible: true,
    fingerprints: { ...f },
    negative_controls: qualifiedNegatives(f.binding_sha256).map((n) => ({
      id: n.id,
      layer: (n as unknown as { layer: string }).layer,
      status: n.status,
      binding_sha256: n.binding_sha256,
    })),
  };
}

function facts(ref: Record<string, unknown>, current = fullFingerprints()): string[] {
  return checkControlReferenceFacts(ref as unknown as Ref, current).map((r) => r.code as string);
}

function factReasons(ref: Record<string, unknown>, current = fullFingerprints()) {
  return checkControlReferenceFacts(ref as unknown as Ref, current);
}

const withFp = (f: ReferenceFingerprints, patch: Record<string, unknown>) => ({
  ...qualifiedRef(f),
  ...patch,
});

describe("checkControlReferenceFacts: target 판정이 사실로 다시 확인하는 검사", () => {
  it("[RED] 완전히 자격을 갖춘 참조와 같은 현재 지문이면 빈 목록이다", () => {
    expect(
      checkControlReferenceFacts(qualifiedRef() as unknown as Ref, fullFingerprints())
    ).toEqual([]);
  });

  it("참조 요약은 expected·observed를 싣지 않는다(toControlReference가 버린다): 사실 확인은 id·층·status·결합만 본다", () => {
    // 기대·관측 상태의 근거 검사는 전체 기록이 있는 qualifyControlRun(과 어댑터)에서 한다. 요약에서는 그 필드가 없다는 이유로
    // 거절하지 않는다 — 그러면 수락된 요약이 모두 거절된다.
    const ref = qualifiedRef();
    for (const n of ref.negative_controls as Record<string, unknown>[]) {
      expect(Object.keys(n).sort()).toEqual(["binding_sha256", "id", "layer", "status"]);
    }
    expect(facts(ref)).toEqual([]);
  });

  it("[RED] 새 검사만 한다: 기존 검사 대상(provenance·상태·단언·N0)이 틀려도 이 함수는 사유를 내지 않는다", () => {
    // 핀 해시(pin_sha256)는 참조 자신의 결합 재계산에 들어가는 구성 요소라 여기서는 건드리지 않는다.
    const ref = {
      ...qualifiedRef(),
      provenance: "stub",
      status: "PARTIAL",
      control_assertions_status: "FAIL",
      n0_confirmed: false,
    };
    expect(facts(ref)).toEqual([]);
  });

  it("[RED] 입력을 바꾸지 않는다", () => {
    const ref = qualifiedRef();
    const current = fullFingerprints();
    const refCopy = structuredClone(ref);
    const curCopy = structuredClone(current);
    checkControlReferenceFacts(ref as unknown as Ref, current);
    expect(ref).toEqual(refCopy);
    expect(current).toEqual(curCopy);
  });

  describe("CONTROL_REFERENCE_FINGERPRINT_MISSING", () => {
    const FIELDS = [
      "harness_sha256",
      "control_sha256",
      "binding_sha256",
      "tool_version",
      "wheel_sha256",
    ] as const;

    it("[RED] 참조에 fingerprints가 아예 없으면 던지지 않고 이 사유를 낸다", () => {
      const ref = qualifiedRef();
      delete ref.fingerprints;
      expect(facts(ref)).toContain("CONTROL_REFERENCE_FINGERPRINT_MISSING");
    });

    for (const field of FIELDS) {
      it(`[RED] 참조의 ${field}가 null이면 이 사유를 낸다(상세는 필드 이름만 담는다)`, () => {
        const ref = qualifiedRef();
        (ref.fingerprints as Record<string, unknown>)[field] = null;
        const reasons = factReasons(ref);
        const missing = reasons.find((r) => r.code === "CONTROL_REFERENCE_FINGERPRINT_MISSING");
        expect(missing, field).toBeDefined();
        expect(missing?.detail ?? "").toContain(field);
        expect(missing?.detail ?? "").not.toMatch(/[0-9a-f]{64}/); // 값(해시)을 적지 않는다
      });

      it(`[RED] 현재 실행의 ${field}가 null이면 이 사유를 낸다`, () => {
        const current = {
          ...fullFingerprints(),
          [field]: null,
        } as unknown as ReferenceFingerprints;
        const missing = factReasons(qualifiedRef(), current).find(
          (r) => r.code === "CONTROL_REFERENCE_FINGERPRINT_MISSING"
        );
        expect(missing, field).toBeDefined();
        expect(missing?.detail ?? "").toContain(field);
        expect(missing?.detail ?? "").not.toMatch(/[0-9a-f]{64}/);
      });
    }

    it("[RED] 참조와 현재가 둘 다 null이어도 '일치'로 보지 않는다(여전히 이 사유)", () => {
      for (const field of FIELDS) {
        const ref = qualifiedRef();
        (ref.fingerprints as Record<string, unknown>)[field] = null;
        const current = {
          ...fullFingerprints(),
          [field]: null,
        } as unknown as ReferenceFingerprints;
        expect(facts(ref, current), field).toContain("CONTROL_REFERENCE_FINGERPRINT_MISSING");
      }
    });
  });

  describe("지문 불일치 사유(참조는 자기 안에서 일관되고 핀 해시는 같다)", () => {
    const other = (label: string) => sha256Hex(`other-${label}`);

    it("[RED] harness_sha256이 다르면 HARNESS_MISMATCH", () => {
      const ref = qualifiedRef(fullFingerprints());
      const current = fullFingerprints({ harness_sha256: other("harness") });
      expect(facts(ref, current)).toContain("CONTROL_REFERENCE_HARNESS_MISMATCH");
    });

    it("[RED] control_sha256이 다르면 CONTROL_MISMATCH", () => {
      const ref = qualifiedRef(fullFingerprints());
      const current = fullFingerprints({ control_sha256: other("control") });
      expect(facts(ref, current)).toContain("CONTROL_REFERENCE_CONTROL_MISMATCH");
    });

    for (const [field, value] of [
      ["tool_version", "9.9.9"],
      ["wheel_sha256", other("wheel")],
      ["rules_list_sha256", other("rules-list")],
      ["rules_expected_sha256", other("rules-expected")],
    ] as const) {
      it(`[RED] ${field}가 다르면 TOOL_MISMATCH`, () => {
        const ref = qualifiedRef(fullFingerprints());
        const current = fullFingerprints({ [field]: value });
        expect(facts(ref, current)).toContain("CONTROL_REFERENCE_TOOL_MISMATCH");
      });
    }

    it("[RED] 구성 요소는 같고 binding_sha256만 다르면 BINDING_MISMATCH이고 다른 불일치 사유는 없다", () => {
      const ref = qualifiedRef(fullFingerprints());
      const current = fullFingerprints({ binding_sha256: other("binding") });
      const codes = facts(ref, current);
      expect(codes).toContain("CONTROL_REFERENCE_BINDING_MISMATCH");
      expect(codes).not.toContain("CONTROL_REFERENCE_HARNESS_MISMATCH");
      expect(codes).not.toContain("CONTROL_REFERENCE_CONTROL_MISMATCH");
      expect(codes).not.toContain("CONTROL_REFERENCE_TOOL_MISMATCH");
    });

    it("[RED] 참조 자신의 결합이 자기 구성 요소로 만든 값이 아니면(현재와 같은 위조값이어도) BINDING_MISMATCH", () => {
      const forged = other("forged-binding");
      const ref = withFp(fullFingerprints({ binding_sha256: forged }), {});
      const current = fullFingerprints({ binding_sha256: forged }); // 참조와 현재의 결합 문자열은 같다
      expect(facts(ref, current)).toContain("CONTROL_REFERENCE_BINDING_MISMATCH");
    });

    it("[RED] 불일치가 있는데 참조가 eligible:true라고 선언하면 NOT_ELIGIBLE도 낸다(자기 선언이 사실과 모순)", () => {
      const ref = qualifiedRef(fullFingerprints());
      const current = fullFingerprints({ harness_sha256: other("harness") });
      expect((ref as { eligible: boolean }).eligible).toBe(true);
      const codes = facts(ref, current);
      expect(codes).toContain("CONTROL_REFERENCE_HARNESS_MISMATCH");
      expect(codes).toContain("CONTROL_REFERENCE_NOT_ELIGIBLE");
    });
  });

  describe("CONTROL_REFERENCE_NEGATIVE_INCOMPLETE", () => {
    const incomplete = (mutate: (list: Entry[]) => Entry[]): Record<string, unknown> => {
      const ref = qualifiedRef();
      ref.negative_controls = mutate(ref.negative_controls as Entry[]);
      return ref;
    };

    it("[RED] 사전 검사 7개만 PASS이고 엔진이 모두 NOT_RUN이면 이 사유다(엔진 자리를 대신하지 못한다)", () => {
      const ref = incomplete((list) =>
        list.map((e) =>
          e.layer === "engine" ? { ...e, status: "NOT_RUN", binding_sha256: null } : e
        )
      );
      const reasons = factReasons(ref);
      const hit = reasons.find((r) => r.code === "CONTROL_REFERENCE_NEGATIVE_INCOMPLETE");
      expect(hit).toBeDefined();
      expect(hit?.detail ?? "").toContain("R3:engine(NOT_RUN)");
      expect(hit?.detail ?? "").not.toMatch(/[0-9a-f]{64}/);
    });

    it("[RED] 엔진 9개만 PASS이고 사전 검사가 모두 NOT_RUN이면 이 사유다(반대 방향도 대신하지 못한다)", () => {
      const ref = incomplete((list) =>
        list.map((e) =>
          e.layer === "preflight" ? { ...e, status: "NOT_RUN", binding_sha256: null } : e
        )
      );
      const hit = factReasons(ref).find((r) => r.code === "CONTROL_REFERENCE_NEGATIVE_INCOMPLETE");
      expect(hit).toBeDefined();
      expect(hit?.detail ?? "").toContain("R3:preflight(NOT_RUN)");
    });

    it("[RED] 엔진 항목 하나가 FAIL이면 이 사유다", () => {
      const ref = incomplete((list) => {
        find(list, "R3", "engine").status = "FAIL";
        return list;
      });
      const hit = factReasons(ref).find((r) => r.code === "CONTROL_REFERENCE_NEGATIVE_INCOMPLETE");
      expect(hit).toBeDefined();
      expect(hit?.detail ?? "").toContain("R3:engine(FAIL)");
    });

    it("[RED] 필요한 항목 하나가 아예 없으면 이 사유다", () => {
      const ref = incomplete((list) =>
        list.filter((e) => !(e.id === "R6" && e.layer === "engine"))
      );
      expect(facts(ref)).toContain("CONTROL_REFERENCE_NEGATIVE_INCOMPLETE");
    });

    it("[RED] 같은 (id, 층) 항목이 두 번 있으면(둘 다 PASS여도) 이 사유다", () => {
      const ref = incomplete((list) => [...list, { ...find(list, "R1", "engine") }]);
      expect(facts(ref)).toContain("CONTROL_REFERENCE_NEGATIVE_INCOMPLETE");
    });

    it("[RED] PASS 항목의 결합이 참조의 결합과 다르거나 null이면 이 사유다", () => {
      for (const binding of [sha256Hex("old-run"), null]) {
        const ref = incomplete((list) => {
          find(list, "R2", "preflight").binding_sha256 = binding;
          return list;
        });
        expect(facts(ref), String(binding)).toContain("CONTROL_REFERENCE_NEGATIVE_INCOMPLETE");
      }
    });

    it("[RED] negative_controls가 빈 배열이면 이 사유다(던지지 않는다)", () => {
      const ref = qualifiedRef();
      ref.negative_controls = [];
      expect(facts(ref)).toContain("CONTROL_REFERENCE_NEGATIVE_INCOMPLETE");
    });

    it("[RED] 참조가 eligible:true라고 선언해도 음성 대조가 불완전하면 NOT_ELIGIBLE도 낸다(위조 선언)", () => {
      const ref = incomplete((list) => {
        const e = find(list, "R4", "engine");
        e.status = "NOT_RUN";
        e.binding_sha256 = null;
        return list;
      });
      expect(ref.eligible).toBe(true);
      const codes = facts(ref);
      expect(codes).toContain("CONTROL_REFERENCE_NEGATIVE_INCOMPLETE");
      expect(codes).toContain("CONTROL_REFERENCE_NOT_ELIGIBLE");
    });
  });

  describe("CONTROL_REFERENCE_NOT_ELIGIBLE", () => {
    it("[RED] 사실이 모두 맞아도 참조가 eligible:false를 선언하면 이 사유다(다른 새 사유는 없다)", () => {
      const ref = { ...qualifiedRef(), eligible: false };
      expect(facts(ref)).toEqual(["CONTROL_REFERENCE_NOT_ELIGIBLE"]);
    });

    it("[RED] eligible이 없거나 true가 아닌 값이면(`!== true`) 이 사유다", () => {
      for (const value of [undefined, null, "true", 1, 0]) {
        const ref = { ...qualifiedRef(), eligible: value };
        expect(facts(ref), String(value)).toContain("CONTROL_REFERENCE_NOT_ELIGIBLE");
      }
    });
  });
});
