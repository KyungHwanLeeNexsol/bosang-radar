import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical";
import { NEGATIVE_CONTROL_TABLE } from "./control";
import { checkControlReferenceFacts } from "./reference";
import { toControlReference } from "./harness";
import { loadControlReference, controlReferenceFromValue } from "./reference-record";
import { MemoryFs } from "./testing/memory-fs";
import {
  syntheticControlRunRecord,
  syntheticTargetRunRecord,
  type SyntheticControlRecordOptions,
} from "./testing/control-record-fixtures";
import {
  CONTROL_EXPECTATIONS,
  PIN_SHA256,
  fullFingerprints,
  qualifiedNegativeControls,
} from "./testing/evaluate-fixtures";
import { dataFileText } from "./testing/synthetic-data";
import type { FsPort, RunRecord } from "./types";

// 이 시험의 기록은 전부 시험이 손으로 구성한 합성 기록이다(testing/control-record-fixtures.ts). provenance를 "real"로
// 선언한 기록도 실제 Semgrep 실행에서 나온 것이 아니다. 어댑터가 재확인하는 것은 기록의 자기 일관성이지 출처의 진위가 아니다.

// 시험 전용: 파일에서 읽은 JSON을 마음대로 변조하는 시험이라 느슨한 타입을 쓴다(운영 코드는 unknown으로만 다룬다).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Plain = Record<string, any>;

const FP = fullFingerprints();
const PATH = "/records/control/run.json";
// 하네스가 쓰는 기대 입력과 같은 파일(data/control-expectations.json)을 같은 파일시스템의 DATA_DIR 아래에 둔다.
const DATA_DIR = "/data";
const EXPECTATIONS_PATH = `${DATA_DIR}/control-expectations.json`;
const EXPECTATIONS_TEXT = dataFileText("control-expectations.json");

function record(over: Partial<SyntheticControlRecordOptions> = {}): RunRecord {
  return syntheticControlRunRecord({ fingerprints: FP, pinSha256: PIN_SHA256, ...over });
}

/** 직렬화·역직렬화를 거친 평범한 객체(어댑터가 파일에서 받는 모양). 시험이 필드를 마음대로 바꿀 수 있다. */
function plain(r: RunRecord = record()): Plain {
  return JSON.parse(canonicalJson(r)) as Plain;
}

/** 기록 파일(없으면 null)과 기대 입력 파일(기본: 실제 data/control-expectations.json, 없으면 null)을 가진 파일시스템. */
function fsWith(
  content: string | Uint8Array | null,
  expectations: string | Uint8Array | null = EXPECTATIONS_TEXT
): MemoryFs {
  const files: Record<string, string | Uint8Array> = {};
  if (content !== null) files[PATH] = content;
  if (expectations !== null) files[EXPECTATIONS_PATH] = expectations;
  return new MemoryFs(files);
}

async function load(content: unknown) {
  const text = typeof content === "string" ? content : JSON.stringify(content);
  return loadControlReference(fsWith(text), PATH, DATA_DIR);
}

function expectRejected(
  result: { reference: unknown; rejection: string | null },
  ...tokens: string[]
) {
  expect(result.reference).toBeNull();
  expect(result.rejection).not.toBeNull();
  for (const token of tokens) expect(result.rejection, token).toContain(token);
  // 사유의 상세에는 필드 이름과 토큰만 쓴다: 해시 값을 적지 않는다.
  expect(result.rejection).not.toMatch(/[0-9a-f]{64}/);
}

describe("loadControlReference — 수락", () => {
  it("자격을 갖춘 합성 기록은 기존 toControlReference와 같은 요약으로 수락된다", async () => {
    const r = record();
    expect(r.reference_qualification.eligible).toBe(true); // 시험 전제
    const result = await load(plain(r));
    expect(result.rejection).toBeNull();
    expect(result.reference).toEqual(toControlReference(r, true));
    const ref = result.reference!;
    expect(ref.eligible).toBe(true);
    expect(ref.provenance).toBe("real");
    expect(ref.fingerprints).toEqual(FP);
    expect(ref.negative_controls).toHaveLength(16);
  });

  it("수락된 요약은 기존 사실 확인(checkControlReferenceFacts)을 같은 지문에서 사유 없이 통과한다", async () => {
    const result = await load(plain());
    expect(checkControlReferenceFacts(result.reference!, FP)).toEqual([]);
  });

  it("수락된 요약은 기록과 별개의 복사본이다(요약을 바꿔도 다음 읽기가 영향받지 않는다)", async () => {
    const fs = fsWith(canonicalJson(record()));
    const first = await loadControlReference(fs, PATH, DATA_DIR);
    first.reference!.fingerprints.harness_sha256 = "x";
    const second = await loadControlReference(fs, PATH, DATA_DIR);
    expect(second.reference!.fingerprints.harness_sha256).toBe(FP.harness_sha256);
  });
});

describe("loadControlReference — 읽기·파싱 실패는 던지지 않고 거절한다", () => {
  it("파일이 없다", async () => {
    expectRejected(await loadControlReference(fsWith(null), PATH, DATA_DIR), "FILE_NOT_FOUND");
  });

  it("파일은 있으나 읽기가 실패한다", async () => {
    const inner = fsWith("{}");
    const failing: FsPort = {
      readFile: async (p) => {
        if (p === PATH) throw new Error("EACCES: 시험용 읽기 실패"); // 기록 파일만 실패한다(기대 입력은 읽힌다)
        return inner.readFile(p);
      },
      writeFileExclusive: (p, d) => inner.writeFileExclusive(p, d),
      mkdirp: (p) => inner.mkdirp(p),
      listFilesRecursive: (p) => inner.listFilesRecursive(p),
      exists: (p) => inner.exists(p),
    };
    expectRejected(await loadControlReference(failing, PATH, DATA_DIR), "READ_FAILED");
  });

  it("존재 확인 자체가 던져도 던지지 않는다", async () => {
    const inner = fsWith("{}");
    const failing: FsPort = {
      readFile: (p) => inner.readFile(p),
      writeFileExclusive: (p, d) => inner.writeFileExclusive(p, d),
      mkdirp: (p) => inner.mkdirp(p),
      listFilesRecursive: (p) => inner.listFilesRecursive(p),
      exists: async () => {
        throw new Error("EIO");
      },
    };
    const result = await loadControlReference(failing, PATH, DATA_DIR);
    expect(result.reference).toBeNull();
    expect(result.rejection).not.toBeNull();
  });

  it.each([
    ["빈 파일", "", "INVALID_JSON"],
    ["깨진 JSON", '{"schema": ', "INVALID_JSON"],
    ["잘린 JSON", canonicalJson(record()).slice(0, 200), "INVALID_JSON"],
    ["JSON이 아닌 텍스트", "not json", "INVALID_JSON"],
    ["null", "null", "NOT_AN_OBJECT"],
    ["배열", "[]", "NOT_AN_OBJECT"],
    ["문자열", '"run"', "NOT_AN_OBJECT"],
    ["숫자", "1", "NOT_AN_OBJECT"],
  ])("%s", async (_name, text, token) => {
    expectRejected(await load(text), token);
  });

  it("UTF-8이 아닌 바이트", async () => {
    const bad = new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]);
    expectRejected(await loadControlReference(fsWith(bad), PATH, DATA_DIR), "INVALID_ENCODING");
  });

  it("너무 큰 파일은 파싱하기 전에 거절한다", async () => {
    const big = new Uint8Array(17 * 1024 * 1024).fill(0x20);
    expectRejected(await loadControlReference(fsWith(big), PATH, DATA_DIR), "TOO_LARGE");
  });
});

describe("loadControlReference — 스키마와 필드 구조", () => {
  it("스키마 필드가 없거나 다른 값이거나 문자열이 아니면 거절한다", async () => {
    const missing = plain();
    delete missing.schema;
    expectRejected(await load(missing), "schema");
    expectRejected(await load({ ...plain(), schema: "semgrep-lsp-run/999" }), "SCHEMA_UNSUPPORTED");
    expectRejected(await load({ ...plain(), schema: 1 }), "schema");
  });

  const mutations: [string, (r: Plain) => void, string][] = [
    ["run_id 없음", (r) => delete r.run_id, "run_id"],
    ["run_id가 숫자", (r) => (r.run_id = 7), "run_id"],
    ["run_id에 허용 밖 문자", (r) => (r.run_id = "../escape"), "run_id"],
    ["provenance가 알 수 없는 값", (r) => (r.provenance = "fake"), "provenance"],
    ["trust 없음", (r) => delete r.trust, "trust"],
    ["mode 없음", (r) => delete r.mode, "mode"],
    ["inputs 없음", (r) => delete r.inputs, "inputs"],
    ["inputs가 배열", (r) => (r.inputs = []), "inputs"],
    ["inputs.pin_sha256이 16진수가 아님", (r) => (r.inputs.pin_sha256 = "zz"), "inputs.pin_sha256"],
    [
      "inputs.harness_sha256 키 없음",
      (r) => delete r.inputs.harness_sha256,
      "inputs.harness_sha256",
    ],
    ["inputs.control_sha256이 숫자", (r) => (r.inputs.control_sha256 = 1), "inputs.control_sha256"],
    [
      "inputs.tool_version_observed가 숫자",
      (r) => (r.inputs.tool_version_observed = 1),
      "inputs.tool_version_observed",
    ],
    [
      "inputs.binding_sha256이 짧음",
      (r) => (r.inputs.binding_sha256 = "abc"),
      "inputs.binding_sha256",
    ],
    ["measurement 없음", (r) => delete r.measurement, "measurement"],
    [
      "measurement.status가 알 수 없는 값",
      (r) => (r.measurement.status = "WHAT"),
      "measurement.status",
    ],
    [
      "measurement.complete가 문자열",
      (r) => (r.measurement.complete = "yes"),
      "measurement.complete",
    ],
    [
      "measurement.reasons가 배열이 아님",
      (r) => (r.measurement.reasons = {}),
      "measurement.reasons",
    ],
    ["control_assertions 없음", (r) => delete r.control_assertions, "control_assertions"],
    [
      "control_assertions.status가 알 수 없는 값",
      (r) => (r.control_assertions.status = "OK"),
      "control_assertions.status",
    ],
    [
      "negative_controls가 배열이 아님",
      (r) => (r.control_assertions.negative_controls = "none"),
      "negative_controls",
    ],
    [
      "음성 대조 항목의 layer가 알 수 없는 값",
      (r) => (r.control_assertions.negative_controls[0].layer = "x"),
      "negative_controls[0].layer",
    ],
    [
      "음성 대조 항목의 status가 알 수 없는 값",
      (r) => (r.control_assertions.negative_controls[0].status = "OK"),
      "negative_controls[0].status",
    ],
    [
      "음성 대조 항목이 객체가 아님",
      (r) => (r.control_assertions.negative_controls[0] = 5),
      "negative_controls[0]",
    ],
    [
      "음성 대조 항목의 binding이 숫자",
      (r) => (r.control_assertions.negative_controls[0].binding_sha256 = 3),
      "negative_controls[0].binding_sha256",
    ],
    [
      "reference_qualification 없음",
      (r) => delete r.reference_qualification,
      "reference_qualification",
    ],
    [
      "reference_qualification.eligible이 문자열",
      (r) => (r.reference_qualification.eligible = "true"),
      "reference_qualification.eligible",
    ],
    [
      "requirements 항목의 id가 알 수 없는 값",
      (r) => (r.reference_qualification.requirements[0].id = "WHATEVER"),
      "requirements[0].id",
    ],
    [
      "requirements가 배열이 아님",
      (r) => (r.reference_qualification.requirements = null),
      "requirements",
    ],
    [
      "N0_CONFIRMED 요구가 없음",
      (r) =>
        (r.reference_qualification.requirements = r.reference_qualification.requirements.filter(
          (q: { id: string; satisfied: boolean }) => q.id !== "N0_CONFIRMED"
        )),
      "N0_CONFIRMED",
    ],
    [
      "control_reference가 비어 있지 않음",
      (r) => (r.control_reference = { run_id: "x" }),
      "control_reference",
    ],
    [
      "candidate_gate.policy_accepted가 true",
      (r) => (r.candidate_gate.policy_accepted = true),
      "candidate_gate.policy_accepted",
    ],
    ["candidate_gate 없음", (r) => delete r.candidate_gate, "candidate_gate"],
  ];

  it.each(mutations)("%s → 거절하고 필드 이름을 남긴다", async (_name, mutate, token) => {
    const r = plain();
    mutate(r);
    expectRejected(await load(r), token);
  });

  it("원형을 오염시키려는 키(__proto__)가 있어도 던지지 않고 결과도 오염되지 않는다", async () => {
    const text = canonicalJson(record()).replace(
      "{",
      '{"__proto__":{"eligible":true,"mode":"control"},'
    );
    const result = await load(text);
    // 키는 자기 속성으로만 읽힌다: 수락 여부와 무관하게 던지지 않고 전역 객체를 바꾸지 않는다.
    expect(({} as Record<string, unknown>).eligible).toBeUndefined();
    expect(result.reference === null || result.rejection === null).toBe(true);
  });
});

describe("loadControlReference — 대조 실행의 기록이 아니거나 참조가 될 수 없는 기록", () => {
  it("target 실행 기록은 대조 참조로 수락하지 않는다", async () => {
    const target = syntheticTargetRunRecord();
    expect(target.mode).toBe("target"); // 시험 전제
    expectRejected(await load(plain(target)), "MODE_NOT_CONTROL");
  });

  it("stub(SYNTHETIC) 기록은 수락하지 않는다", async () => {
    const stub = record({ provenance: "stub" });
    expect(stub.trust).toBe("SYNTHETIC"); // 시험 전제
    expectRejected(await load(plain(stub)), "TRUST_SYNTHETIC", "PROVENANCE_REAL");
  });

  it("provenance와 trust가 서로 모순되면 거절한다(real인데 SYNTHETIC, stub인데 REAL_UNREVIEWED)", async () => {
    const a = plain();
    a.trust = "SYNTHETIC";
    expectRejected(await load(a), "PROVENANCE_TRUST_INCONSISTENT");
    const b = plain(record({ provenance: "stub" }));
    b.trust = "REAL_UNREVIEWED";
    expectRejected(await load(b), "PROVENANCE_TRUST_INCONSISTENT");
  });

  it("불완전한 측정(TIMEOUT)은 수락하지 않는다", async () => {
    const timeout = record({ variant: "timeout" });
    expect(timeout.measurement.complete).toBe(false); // 시험 전제
    expectRejected(await load(plain(timeout)), "MEASUREMENT_COMPLETE");
  });

  it("measurement.complete와 status가 모순되면 거절한다", async () => {
    const r = plain();
    r.measurement.complete = false;
    expectRejected(await load(r), "MEASUREMENT_FIELDS_INCONSISTENT");
  });

  it("대조 단언이 FAIL인 기록은 수락하지 않는다", async () => {
    const failed = record({ variant: "assertion-fail" });
    expect(failed.control_assertions.status).toBe("FAIL"); // 시험 전제
    expectRejected(await load(plain(failed)), "CONTROL_ASSERTIONS_PASS");
  });

  it("N0가 확정되지 않은 기록은 수락하지 않는다", async () => {
    expectRejected(await load(plain(record({ n0Confirmed: false }))), "N0_CONFIRMED");
  });

  it("음성 대조가 모두 NOT_RUN인 기록은 수락하지 않는다(단언 PASS·측정 COMPLETE여도)", async () => {
    const r = record({ negatives: "not-run" });
    expect(r.control_assertions.status).toBe("PASS");
    expect(r.measurement.complete).toBe(true);
    expect(r.reference_qualification.eligible).toBe(false);
    expectRejected(await load(plain(r)), "NOT_QUALIFIED", "NEGATIVE_ENGINE_PASS");
  });

  it("음성 대조 한 쌍이 빠졌거나 중복됐거나 FAIL이면 수락하지 않는다", async () => {
    const dropped = plain();
    dropped.control_assertions.negative_controls.pop();
    expectRejected(await load(dropped), "NOT_QUALIFIED");
    const duplicated = plain();
    duplicated.control_assertions.negative_controls.push({
      ...duplicated.control_assertions.negative_controls[0],
    });
    expectRejected(await load(duplicated), "NOT_QUALIFIED");
    const failing = plain();
    failing.control_assertions.negative_controls[0].status = "FAIL";
    expectRejected(await load(failing), "NOT_QUALIFIED");
  });
});

describe("loadControlReference — 저장된 eligible 선언은 믿지 않는다", () => {
  it("음성 대조가 NOT_RUN인데 eligible:true와 모든 요구 충족을 선언한 기록을 거절한다", async () => {
    const r = plain(record({ negatives: "not-run" }));
    r.reference_qualification.eligible = true;
    for (const q of r.reference_qualification.requirements) q.satisfied = true;
    expectRejected(await load(r), "QUALIFICATION_DECLARATION_MISMATCH", "NOT_QUALIFIED");
  });

  it("PASS 항목의 결합이 이 기록의 결합과 다른데 eligible:true를 선언한 기록을 거절한다", async () => {
    const r = plain();
    r.control_assertions.negative_controls[0].binding_sha256 = "f".repeat(64);
    expect(r.reference_qualification.eligible).toBe(true); // 선언은 그대로
    expectRejected(await load(r), "QUALIFICATION_DECLARATION_MISMATCH", "NEGATIVE_BINDING_MATCH");
  });

  it("결합(binding_sha256)이 구성 요소와 맞지 않는데 eligible:true를 선언한 기록을 거절한다", async () => {
    const r = plain();
    r.inputs.binding_sha256 = "e".repeat(64);
    expectRejected(await load(r), "FINGERPRINTS_COMPLETE");
  });

  it("지문 값이 null인데 eligible:true를 선언한 기록을 거절한다", async () => {
    for (const field of [
      "harness_sha256",
      "control_sha256",
      "tool_version_observed",
      "wheel_sha256_observed",
      "binding_sha256",
    ]) {
      const r = plain();
      r.inputs[field] = null;
      expectRejected(await load(r), "FINGERPRINTS_COMPLETE");
    }
  });

  it("측정은 COMPLETE·단언은 PASS인데 자격 없음(eligible:false)을 선언한 기록도 모순으로 거절한다", async () => {
    const r = plain();
    r.reference_qualification.eligible = false;
    expectRejected(await load(r), "QUALIFICATION_DECLARATION_MISMATCH");
  });

  it("개별 요구의 충족 표시가 재계산과 다르면 거절한다", async () => {
    const r = plain();
    r.reference_qualification.requirements.find(
      (q: { id: string; satisfied: boolean }) => q.id === "NEGATIVE_BINDING_MATCH"
    ).satisfied = false;
    expectRejected(await load(r), "QUALIFICATION_DECLARATION_MISMATCH", "NEGATIVE_BINDING_MATCH");
  });
});

// ── PR #29 외부 검토 발견 1: 음성 대조 PASS의 근거 ────────────────
// 이전에는 status=PASS와 결합만 봐서, observed가 null이거나 기대와 다른 PASS 항목도 수락됐다. 필수 (id, layer)의 기대
// 상태는 현재 NEGATIVE_CONTROL_TABLE에서 오며 두 층은 서로 다를 수 있다(R9: engine ISOLATION_VIOLATION, preflight
// SETTINGS_MISMATCH). 기대값은 운영 코드가 아니라 이 시험이 표에서 따로 읽는다.

interface RequiredPair {
  id: string;
  layer: "engine" | "preflight";
  expected: string;
}

const REQUIRED_PAIRS: RequiredPair[] = NEGATIVE_CONTROL_TABLE.flatMap((spec) => [
  { id: spec.id, layer: "engine" as const, expected: spec.expected },
  ...(spec.preflight === null
    ? []
    : [{ id: spec.id, layer: "preflight" as const, expected: spec.preflight.status }]),
]);

const entryOf = (r: Plain, id: string, layer: string): Plain => {
  const found = r.control_assertions.negative_controls.find(
    (n: Plain) => n.id === id && n.layer === layer
  );
  if (!found) throw new Error(`시험 오류: ${id}:${layer} 항목이 없다`);
  return found as Plain;
};

/** 기대와 다른 상태 하나(어느 쌍이든 COMPLETE는 기대가 아니다 — 시험 전제로 확인한다). */
const WRONG = "COMPLETE";

describe("loadControlReference — 음성 대조 PASS는 기대·관측이 기준과 맞아야 한다", () => {
  it("시험 전제: 필수는 16쌍이고, 기대 상태는 COMPLETE가 아니며, 두 층의 기대가 다른 id가 있다", () => {
    expect(REQUIRED_PAIRS).toHaveLength(16);
    expect(REQUIRED_PAIRS.every((p) => p.expected !== WRONG)).toBe(true);
    const r9 = REQUIRED_PAIRS.filter((p) => p.id === "R9");
    expect(new Set(r9.map((p) => p.expected)).size).toBe(2);
    // 정상 기록은 16쌍 전부 기준과 일치한다.
    const ok = plain();
    for (const p of REQUIRED_PAIRS) {
      const e = entryOf(ok, p.id, p.layer);
      expect([e.expected, e.observed, e.status]).toEqual([p.expected, p.expected, "PASS"]);
    }
  });

  // 외부 검토가 보고한 재현 세 가지(엔진 항목 하나).
  const reported: [string, (e: Plain) => void, string][] = [
    ["status=PASS, observed=null", (e) => (e.observed = null), "R1:engine(observed-null)"],
    [
      "status=PASS, observed=COMPLETE, expected는 원래 값",
      (e) => (e.observed = WRONG),
      "R1:engine(observed)",
    ],
    [
      "status=PASS, expected=COMPLETE, observed=COMPLETE",
      (e) => {
        e.expected = WRONG;
        e.observed = WRONG;
      },
      "R1:engine(expected)",
    ],
  ];
  it.each(reported)("검토 재현: %s → 거절", async (_name, mutate, token) => {
    const r = plain();
    mutate(entryOf(r, "R1", "engine"));
    expectRejected(await load(r), "NOT_QUALIFIED", "NEGATIVE_ENGINE_PASS", token);
  });

  // 필수 16쌍 모두에서: 관측 없음 / 관측이 기대와 다름 / 기대가 기준과 다름.
  const everyPair = REQUIRED_PAIRS.flatMap((p) => [
    [
      `${p.id}:${p.layer} observed=null`,
      p,
      (e: Plain) => (e.observed = null),
      `${p.id}:${p.layer}(observed-null)`,
    ],
    [
      `${p.id}:${p.layer} observed가 기대와 다름`,
      p,
      (e: Plain) => (e.observed = WRONG),
      `${p.id}:${p.layer}(observed)`,
    ],
    [
      `${p.id}:${p.layer} expected가 기준과 다름`,
      p,
      (e: Plain) => (e.expected = WRONG),
      `${p.id}:${p.layer}(expected)`,
    ],
  ]) as [string, RequiredPair, (e: Plain) => void, string][];
  it.each(everyPair)("%s → 거절하고 그 쌍을 토큰으로 남긴다", async (_name, p, mutate, token) => {
    const r = plain();
    mutate(entryOf(r, p.id, p.layer));
    const requirement = p.layer === "engine" ? "NEGATIVE_ENGINE_PASS" : "NEGATIVE_PREFLIGHT_PASS";
    expectRejected(await load(r), "NOT_QUALIFIED", requirement, token);
  });

  it("두 층의 기대 상태는 같다고 가정하지 않는다: R9 사전 검사에 엔진의 기대를 쓰거나 그 반대면 거절한다", async () => {
    const engine = REQUIRED_PAIRS.find((p) => p.id === "R9" && p.layer === "engine")!;
    const preflight = REQUIRED_PAIRS.find((p) => p.id === "R9" && p.layer === "preflight")!;
    const swappedPre = plain();
    Object.assign(entryOf(swappedPre, "R9", "preflight"), {
      expected: engine.expected,
      observed: engine.expected,
    });
    expectRejected(await load(swappedPre), "R9:preflight(expected)", "R9:preflight(observed)");
    const swappedEng = plain();
    Object.assign(entryOf(swappedEng, "R9", "engine"), {
      expected: preflight.expected,
      observed: preflight.expected,
    });
    expectRejected(await load(swappedEng), "R9:engine(expected)", "R9:engine(observed)");
  });

  it("관측이 기대와 같아도 기대가 기준과 다르면(둘 다 같은 잘못된 값) 거절한다", async () => {
    const r = plain();
    Object.assign(entryOf(r, "R6", "engine"), { expected: "TIMEOUT", observed: "TIMEOUT" });
    expectRejected(await load(r), "R6:engine(expected)", "R6:engine(observed)");
  });

  it("잘못된 관측을 보정하지 않는다: 입력 값을 바꾸지 않고, 수락하지 않으며, 같은 입력은 같은 결과를 낸다", () => {
    const r = plain();
    entryOf(r, "R2", "preflight").observed = null;
    const before = structuredClone(r);
    const first = controlReferenceFromValue(r, CONTROL_EXPECTATIONS);
    const second = controlReferenceFromValue(r, CONTROL_EXPECTATIONS);
    expect(r).toEqual(before); // observed를 채우거나 status를 덮어쓰지 않았다
    expect(entryOf(r, "R2", "preflight").status).toBe("PASS");
    expect(first.reference).toBeNull();
    expect(first).toEqual(second);
  });

  it("이미 NOT_RUN·FAIL인 항목은 기존 사유 그대로다(기대·관측 토큰으로 가리지 않는다)", async () => {
    const r = plain();
    const e = entryOf(r, "R3", "engine");
    e.status = "FAIL";
    expectRejected(await load(r), "R3:engine(FAIL)");
    expect((await load(r)).rejection).not.toContain("R3:engine(observed");
  });

  it("기존 검사는 그대로다: 16쌍 필수·중복 거절·결합 일치는 기대·관측 검사와 함께 동작한다", async () => {
    const dropped = plain();
    dropped.control_assertions.negative_controls =
      dropped.control_assertions.negative_controls.filter(
        (n: Plain) => !(n.id === "R5" && n.layer === "engine")
      );
    expectRejected(await load(dropped), "R5:engine(missing)");
    const duplicated = plain();
    duplicated.control_assertions.negative_controls.push({
      ...entryOf(duplicated, "R5", "engine"),
    });
    expectRejected(await load(duplicated), "R5:engine(duplicate)");
    const unbound = plain();
    entryOf(unbound, "R5", "engine").binding_sha256 = "f".repeat(64);
    expectRejected(await load(unbound), "NEGATIVE_BINDING_MATCH");
  });
});

// ── PR #29 외부 검토 발견 2: 세부 결과와 요약 상태의 모순 ───────────
// 이전에는 control_assertions.checks·design_errors·measurement.reasons를 배열이라는 사실만 확인하고 버려서, 세부 결과가
// 요약과 모순되는 기록도 수락됐다. 이 검사는 기록의 자기 일관성이며 서명·출처 인증이나 원시 트랜스크립트 재검증이 아니다.

describe("loadControlReference — 세부 결과와 요약 상태의 모순을 거절한다", () => {
  it("시험 전제: 정상 합성 기록은 검사가 있고 전부 PASS이며, design_errors·reasons가 비어 있다", () => {
    const r = plain();
    expect(r.control_assertions.status).toBe("PASS");
    expect(r.control_assertions.checks.length).toBeGreaterThan(0);
    expect(r.control_assertions.checks.every((c: Plain) => c.status === "PASS")).toBe(true);
    expect(r.control_assertions.checks.some((c: Plain) => c.kind === "A1" || c.kind === "A3")).toBe(
      true
    );
    expect(r.control_assertions.design_errors).toEqual([]);
    expect(r.measurement.status).toBe("COMPLETE");
    expect(r.measurement.complete).toBe(true);
    expect(r.measurement.reasons).toEqual([]);
  });

  // 외부 검토가 보고한 재현 다섯 가지.
  const reported: [string, (r: Plain) => void, string][] = [
    [
      "control_assertions.checks[0].status = FAIL",
      (r) => (r.control_assertions.checks[0].status = "FAIL"),
      "ASSERTION_SUMMARY_MISMATCH(stored=PASS, derived=FAIL)",
    ],
    [
      "control_assertions.design_errors에 오류 추가",
      (r) => r.control_assertions.design_errors.push("대조 설계의 오류"),
      "ASSERTION_DESIGN_ERRORS(1)",
    ],
    [
      "measurement COMPLETE·complete=true인데 reasons에 ENGINE_EXCEPTION_LOG",
      (r) => r.measurement.reasons.push({ code: "ENGINE_EXCEPTION_LOG" }),
      "MEASUREMENT_REASONS_INCONSISTENT",
    ],
    [
      "control_assertions.checks = [null]",
      (r) => (r.control_assertions.checks = [null]),
      "control_assertions.checks[0](type)",
    ],
    [
      "control_assertions.checks = []",
      (r) => (r.control_assertions.checks = []),
      "ASSERTION_CHECKS_EMPTY",
    ],
  ];
  it.each(reported)("검토 재현: %s → 거절", async (_name, mutate, token) => {
    const r = plain();
    mutate(r);
    expectRejected(await load(r), token);
  });

  it("FAIL·REVIEW·NOT_RUN인 세부 검사를 전체 PASS로 인정하지 않는다(어느 종류의 검사든)", async () => {
    const base = plain();
    const kinds = new Set<string>(base.control_assertions.checks.map((c: Plain) => c.kind));
    expect([...kinds].sort()).toEqual(["A1", "A2", "A3", "A4", "PAIR"]); // 시험 전제
    for (const kind of kinds) {
      for (const status of ["FAIL", "REVIEW", "NOT_RUN"]) {
        const r = plain();
        const index = r.control_assertions.checks.findIndex((c: Plain) => c.kind === kind);
        r.control_assertions.checks[index].status = status;
        const result = await load(r);
        expectRejected(result, "ASSERTION_SUMMARY_MISMATCH(stored=PASS");
      }
    }
  });

  it("전체 요약이 세부 결과가 정하는 값과 다르면(FAIL·REVIEW_REQUIRED로 적었는데 세부는 전부 PASS) 거절한다", async () => {
    for (const status of ["FAIL", "REVIEW_REQUIRED", "NOT_RUN"]) {
      const r = plain();
      r.control_assertions.status = status;
      expectRejected(await load(r), `ASSERTION_SUMMARY_MISMATCH(stored=${status}, derived=PASS)`);
    }
  });

  it("FAIL인 음성 대조 항목이 하나라도 있으면(필수가 아닌 id여도) 요약 PASS는 모순이다", async () => {
    const r = plain();
    r.control_assertions.negative_controls.push({
      id: "R99",
      layer: "engine",
      expected: "COMPLETE",
      observed: null,
      status: "FAIL",
      binding_sha256: null,
    });
    expectRejected(await load(r), "ASSERTION_SUMMARY_MISMATCH(stored=PASS, derived=FAIL)");
  });

  it("사례 검사(A1·A3)가 하나도 없으면(PAIR 등만 남아도) PASS의 근거로 인정하지 않는다", async () => {
    const r = plain();
    r.control_assertions.checks = r.control_assertions.checks.filter(
      (c: Plain) => c.kind !== "A1" && c.kind !== "A3"
    );
    expect(r.control_assertions.checks.length).toBeGreaterThan(0); // 시험 전제
    expectRejected(await load(r), "ASSERTION_CHECKS_EMPTY");
  });

  it("NOT_RUN 검사 일부가 PASS로 위장된 요약도 거절한다(결과 없는 사례가 하나라도 있으면 PASS가 아니다)", async () => {
    const r = plain();
    const a3 = r.control_assertions.checks.find((c: Plain) => c.kind === "A3");
    a3.status = "NOT_RUN";
    expectRejected(await load(r), "ASSERTION_SUMMARY_MISMATCH(stored=PASS, derived=FAIL)");
  });

  it("COMPLETE가 아닌 측정은 reasons가 있는 것이 정상이라 이 검사의 대상이 아니다(기존 사유 그대로)", async () => {
    const timeout = plain(record({ variant: "timeout" }));
    expect(timeout.measurement.reasons.length).toBeGreaterThan(0); // 시험 전제
    const result = await load(timeout);
    expectRejected(result, "MEASUREMENT_COMPLETE");
    expect(result.rejection).not.toContain("MEASUREMENT_REASONS_INCONSISTENT");
  });

  it("NOT_RUN 측정인데 reasons가 있으면 모순이다(기록 생성 계약: COMPLETE·NOT_RUN은 사유가 없다)", async () => {
    const r = plain();
    r.measurement.status = "NOT_RUN";
    r.measurement.complete = false;
    r.measurement.reasons.push({ code: "ENGINE_EXCEPTION_LOG" });
    expectRejected(await load(r), "MEASUREMENT_REASONS_INCONSISTENT");
  });

  // checks 항목의 소비 필드를 항목별로 검사한다.
  const badChecks: [string, (c: unknown[]) => void, string][] = [
    ["항목이 문자열", (c) => (c[1] = "PASS"), "control_assertions.checks[1](type)"],
    ["항목이 배열", (c) => (c[1] = []), "control_assertions.checks[1](type)"],
    ["항목이 숫자", (c) => (c[1] = 7), "control_assertions.checks[1](type)"],
    ["id 없음", (c) => delete (c[1] as Plain).id, "control_assertions.checks[1].id(missing)"],
    ["id가 숫자", (c) => ((c[1] as Plain).id = 5), "control_assertions.checks[1].id(type)"],
    [
      "kind가 알 수 없는 값",
      (c) => ((c[1] as Plain).kind = "A9"),
      "control_assertions.checks[1].kind(value)",
    ],
    ["kind 없음", (c) => delete (c[1] as Plain).kind, "control_assertions.checks[1].kind(missing)"],
    ["file이 숫자", (c) => ((c[1] as Plain).file = 1), "control_assertions.checks[1].file(type)"],
    [
      "file 키 없음",
      (c) => delete (c[1] as Plain).file,
      "control_assertions.checks[1].file(missing)",
    ],
    [
      "status가 알 수 없는 값",
      (c) => ((c[1] as Plain).status = "OK"),
      "control_assertions.checks[1].status(value)",
    ],
    [
      "status 없음",
      (c) => delete (c[1] as Plain).status,
      "control_assertions.checks[1].status(missing)",
    ],
    [
      "status가 불리언",
      (c) => ((c[1] as Plain).status = true),
      "control_assertions.checks[1].status(type)",
    ],
    [
      "detail이 객체",
      (c) => ((c[1] as Plain).detail = {}),
      "control_assertions.checks[1].detail(type)",
    ],
    [
      "detail 없음",
      (c) => delete (c[1] as Plain).detail,
      "control_assertions.checks[1].detail(missing)",
    ],
  ];
  it.each(badChecks)("checks %s → 거절하고 필드 경로를 남긴다", async (_name, mutate, token) => {
    const r = plain();
    mutate(r.control_assertions.checks);
    expectRejected(await load(r), token);
  });

  it("checks가 배열이 아니거나 너무 길면 거절한다", async () => {
    const notArray = plain();
    notArray.control_assertions.checks = {};
    expectRejected(await load(notArray), "control_assertions.checks(type)");
    const tooLong = plain();
    tooLong.control_assertions.checks = Array.from({ length: 1001 }, () => ({
      ...tooLong.control_assertions.checks[0],
    }));
    expectRejected(await load(tooLong), "control_assertions.checks(too-long)");
  });

  const badDesignErrors: [string, unknown, string][] = [
    ["항목이 문자열이 아님(null)", [null], "control_assertions.design_errors[0](type)"],
    ["항목이 문자열이 아님(객체)", [{ message: "x" }], "control_assertions.design_errors[0](type)"],
    ["배열이 아님", "none", "control_assertions.design_errors(type)"],
    ["키 없음", undefined, "control_assertions.design_errors(missing)"],
  ];
  it.each(badDesignErrors)("design_errors %s → 거절한다", async (_name, value, token) => {
    const r = plain();
    if (value === undefined) delete r.control_assertions.design_errors;
    else r.control_assertions.design_errors = value;
    expectRejected(await load(r), token);
  });

  it("design_errors의 내용은 사유에 옮기지 않는다(개수만 남긴다)", async () => {
    const r = plain();
    r.control_assertions.design_errors = ["/secret/path/설계 오류 원문"];
    const result = await load(r);
    expectRejected(result, "ASSERTION_DESIGN_ERRORS(1)");
    expect(result.rejection).not.toContain("secret");
  });

  it("정합성 검사는 값을 보정하지 않는다: 입력을 바꾸지 않고 거절한다", () => {
    const r = plain();
    r.control_assertions.checks[0].status = "FAIL";
    const before = structuredClone(r);
    const result = controlReferenceFromValue(r, CONTROL_EXPECTATIONS);
    expect(r).toEqual(before);
    expect(result.reference).toBeNull();
  });

  it("정상 기록은 계속 수락된다(검사·사유·design_errors가 일관됨)", async () => {
    const result = await load(plain());
    expect(result.rejection).toBeNull();
    expect(result.reference).not.toBeNull();
  });
});

describe("loadControlReference — 검사 목록은 기대 사례에서 도출한 목록과 같아야 한다", () => {
  const checksOf = (r: Plain): Plain[] => r.control_assertions.checks;
  const MISSING = (...ids: string[]) => `CHECKS_MISSING(${ids.join(", ")})`;

  /** 기대 입력 파일(data/control-expectations.json)을 시험이 바꾼 사본. */
  function expectationsWith(mutate: (e: Plain) => void): string {
    const e = JSON.parse(EXPECTATIONS_TEXT) as Plain;
    mutate(e);
    return JSON.stringify(e);
  }
  async function loadWith(r: Plain, expectations: string | Uint8Array | null) {
    return loadControlReference(fsWith(JSON.stringify(r), expectations), PATH, DATA_DIR);
  }
  /** 검사 한 항목(결과는 PASS). 기대 구성을 바꾼 시험이 "그 구성에 맞는 기록"을 만들 때 쓴다. */
  const passCheck = (kind: string, file: string, id = `${kind}:${file}`): Plain => ({
    id,
    kind,
    file,
    status: "PASS",
    detail: "시험용 합성 검사",
  });

  it("시험 전제: 실제 기대 입력에서 만든 정상 합성 기록은 검사 20개(A1 5·A2 5·A3 4·A4 2·PAIR 4)이고 id가 모두 다르다", () => {
    const checks = checksOf(plain());
    const count = (kind: string) => checks.filter((c) => c.kind === kind).length;
    expect(checks).toHaveLength(20);
    expect(["A1", "A2", "A3", "A4", "PAIR"].map(count)).toEqual([5, 5, 4, 2, 4]);
    expect(new Set(checks.map((c) => c.id)).size).toBe(20);
    // id·kind·file의 관계: 사례 검사는 `<kind>:<file>`, PAIR는 `PAIR:<계열>`이고 file이 양성 사례다.
    for (const c of checks.filter((x) => x.kind !== "PAIR"))
      expect(c.id).toBe(`${c.kind}:${c.file}`);
    for (const c of checks.filter((x) => x.kind === "PAIR")) expect(c.file).toMatch(/\.pos\./);
  });

  it("정상 기록은 수락된다(검사 목록이 기대 사례에서 도출한 목록과 같다)", async () => {
    const result = await loadWith(plain(), EXPECTATIONS_TEXT);
    expect(result.rejection).toBeNull();
    expect(result.reference).not.toBeNull();
  });

  // 외부 검토가 재현한 네 가지: 요약은 PASS로 일관되지만 검사 목록이 불완전하다.
  const reported: [string, (checks: Plain[]) => Plain[], string[]][] = [
    [
      "검사 20개 중 첫 1개만 유지",
      (c) => c.slice(0, 1),
      [
        `${MISSING(
          "A2:cases/child-process.pos.ts",
          "A4:cases/child-process.pos.ts",
          "A3:cases/child-process.ok.ts",
          "A1:cases/eval.pos.js",
          "A2:cases/eval.pos.js",
          "A3:cases/eval.ok.js"
        ).slice(0, -1)}, +13)`,
      ],
    ],
    [
      "한 사례의 검사 전체 삭제(A1·A2·A4와 그 사례가 양성인 PAIR)",
      (c) => c.filter((x) => x.file !== "cases/child-process.pos.ts"),
      [
        MISSING(
          "A1:cases/child-process.pos.ts",
          "A2:cases/child-process.pos.ts",
          "A4:cases/child-process.pos.ts",
          "PAIR:child-process"
        ),
      ],
    ],
    [
      "A4 검사 전체 삭제",
      (c) => c.filter((x) => x.kind !== "A4"),
      [MISSING("A4:cases/child-process.pos.ts", "A4:cases/eval.nosource.js")],
    ],
    [
      "첫 검사만 20번 복제(개수는 20 그대로)",
      (c) => Array.from({ length: c.length }, () => ({ ...c[0] })),
      ["CHECKS_MISSING(", "CHECKS_DUPLICATE(A1:cases/child-process.pos.ts)"],
    ],
  ];
  it.each(reported)("검토 재현: %s → 거절", async (_name, mutate, tokens) => {
    const r = plain();
    r.control_assertions.checks = mutate(checksOf(r));
    // 시험 전제: 요약은 여전히 PASS로 일관된다(이전 검사가 잡는 모순이 아니다).
    expect(r.control_assertions.status).toBe("PASS");
    const result = await loadWith(r, EXPECTATIONS_TEXT);
    expectRejected(result, ...tokens);
    expect(result.rejection).not.toContain("ASSERTION_");
  });

  it("'첫 검사만 20번 복제'는 개수가 20 그대로다(개수만 같다고 수락하지 않는다는 시험 전제)", () => {
    const [, mutate] = reported[3];
    expect(mutate(checksOf(plain()))).toHaveLength(20);
  });

  // 필수 검사 각각을 하나씩 제거한다(20개 전수).
  const everyCheck = plain().control_assertions.checks.map((c: Plain, i: number) => [
    `${i}: ${c.id}`,
    i,
    c.id as string,
  ]) as [string, number, string][];
  it.each(everyCheck)("필수 검사 제거 %s → 그 검사만 누락으로 거절", async (_name, index, id) => {
    const r = plain();
    checksOf(r).splice(index, 1);
    expect(checksOf(r)).toHaveLength(19);
    const result = await loadWith(r, EXPECTATIONS_TEXT);
    expectRejected(result);
    expect(result.rejection).toBe(MISSING(id));
  });

  it.each(everyCheck)(
    "같은 개수를 유지하며 중복 검사로 대체 %s → 누락과 중복을 모두 남긴다",
    async (_name, index, id) => {
      const r = plain();
      const checks = checksOf(r);
      const other = checks[(index + 1) % checks.length];
      checks[index] = { ...other };
      expect(checks).toHaveLength(20); // 개수는 그대로
      const result = await loadWith(r, EXPECTATIONS_TEXT);
      expectRejected(result);
      expect(result.rejection).toBe(`${MISSING(id)}; CHECKS_DUPLICATE(${other.id})`);
    }
  );

  // 존재하지 않는 사례, 잘못된 id·kind·file 조합. 첫 검사는 A1:cases/child-process.pos.ts다.
  const FIRST = "A1:cases/child-process.pos.ts";
  const wrong: [string, (c: Plain) => void, string][] = [
    [
      "존재하지 않는 사례",
      (c) => Object.assign(c, { id: "A1:cases/ghost.js", file: "cases/ghost.js" }),
      `${MISSING(FIRST)}; CHECKS_UNEXPECTED(checks[0])`,
    ],
    [
      "id가 비슷하지만 다름(끝에 공백)",
      (c) => (c.id = `${FIRST} `),
      `${MISSING(FIRST)}; CHECKS_UNEXPECTED(checks[0])`,
    ],
    [
      "id는 맞는데 kind가 다름(A3)",
      (c) => (c.kind = "A3"),
      `${MISSING(FIRST)}; CHECK_IDENTITY_MISMATCH(${FIRST})`,
    ],
    [
      "id는 맞는데 kind가 NEGATIVE",
      (c) => (c.kind = "NEGATIVE"),
      `${MISSING(FIRST)}; CHECK_IDENTITY_MISMATCH(${FIRST})`,
    ],
    [
      "id는 맞는데 file이 다른 사례",
      (c) => (c.file = "cases/eval.pos.js"),
      `${MISSING(FIRST)}; CHECK_IDENTITY_MISMATCH(${FIRST})`,
    ],
    [
      "id는 맞는데 file이 null",
      (c) => (c.file = null),
      `${MISSING(FIRST)}; CHECK_IDENTITY_MISMATCH(${FIRST})`,
    ],
    [
      "다른 필수 검사의 id를 가져옴(kind·file은 그대로)",
      (c) => (c.id = "A2:cases/child-process.pos.ts"),
      `${MISSING(FIRST)}; CHECK_IDENTITY_MISMATCH(A2:cases/child-process.pos.ts)`,
    ],
  ];
  it.each(wrong)("잘못된 검사: %s → 거절", async (_name, mutate, expected) => {
    const r = plain();
    mutate(checksOf(r)[0]);
    const result = await loadWith(r, EXPECTATIONS_TEXT);
    expectRejected(result);
    expect(result.rejection).toBe(expected);
    // 기록이 주장한 문자열은 사유에 옮기지 않는다(알려진 id만 적는다).
    expect(result.rejection).not.toContain("ghost");
  });

  it("PAIR의 file이 양성 사례가 아니면(정상 쪽을 가리키면) 잘못된 조합이다", async () => {
    const r = plain();
    const pair = checksOf(r).find((c) => c.id === "PAIR:eval");
    pair!.file = "cases/eval.ok.js";
    const result = await loadWith(r, EXPECTATIONS_TEXT);
    expect(result.rejection).toBe(`${MISSING("PAIR:eval")}; CHECK_IDENTITY_MISMATCH(PAIR:eval)`);
  });

  it("예상 밖 검사가 더해진 기록은 거절한다(요약이 PASS여도)", async () => {
    const r = plain();
    checksOf(r).push(passCheck("A1", "cases/extra.pos.js"));
    expect(r.control_assertions.status).toBe("PASS");
    const result = await loadWith(r, EXPECTATIONS_TEXT);
    expect(result.rejection).toBe("CHECKS_UNEXPECTED(checks[20])");
  });

  it("같은 검사를 한 번 더 더한 기록(21개)도 중복으로 거절한다", async () => {
    const r = plain();
    checksOf(r).push({ ...checksOf(r)[7] });
    const result = await loadWith(r, EXPECTATIONS_TEXT);
    expect(result.rejection).toBe(`CHECKS_DUPLICATE(${checksOf(r)[7].id})`);
  });

  it("검사 순서만 다른 정상 기록은 수락한다(역순·교차 배치)", async () => {
    const base = plain();
    const reversed = plain();
    checksOf(reversed).reverse();
    const interleaved = plain();
    const list = checksOf(base);
    interleaved.control_assertions.checks = [
      ...list.filter((_c, i) => i % 2 === 1),
      ...list.filter((_c, i) => i % 2 === 0),
    ];
    for (const r of [reversed, interleaved]) {
      expect(checksOf(r).map((c) => c.id)).not.toEqual(list.map((c) => c.id)); // 시험 전제: 순서가 다르다
      const result = await loadWith(r, EXPECTATIONS_TEXT);
      expect(result.rejection).toBeNull();
      expect(result.reference).toEqual(toControlReference(record(), true));
    }
  });

  it("거절해도 값을 보정하지 않는다: 입력 기록을 바꾸지 않고, 같은 입력은 같은 결과를 낸다", () => {
    const r = plain();
    r.control_assertions.checks = r.control_assertions.checks.slice(0, 1);
    const before = structuredClone(r);
    const first = controlReferenceFromValue(r, CONTROL_EXPECTATIONS);
    const second = controlReferenceFromValue(r, CONTROL_EXPECTATIONS);
    expect(r).toEqual(before);
    expect(first.reference).toBeNull();
    expect(second).toEqual(first);
  });

  // 기대 사례 구성이 바뀌면 필요한 검사 목록도 따라 바뀐다. 개수를 상수로 쓰지 않는다는 증거다.
  describe("기대 사례 구성이 바뀌면 필요한 검사 목록도 따라 바뀐다", () => {
    it("사례(양성·정상 쌍)를 빼면 그 사례의 검사가 예상 밖이 되고, 그 검사를 뺀 기록은 수락된다", async () => {
      const smaller = expectationsWith((e) => {
        e.cases = e.cases.filter((c: Plain) => !c.path.startsWith("cases/dangerously."));
      });
      const r = plain();
      const dangerous = checksOf(r)
        .map((c, i) => [c, i] as const)
        .filter(([c]) => c.file.startsWith("cases/dangerously."))
        .map(([, i]) => i);
      expect(dangerous).toHaveLength(4); // A1·A2·A3·PAIR
      const rejected = await loadWith(r, smaller);
      expect(rejected.rejection).toBe(
        `CHECKS_UNEXPECTED(${dangerous.map((i) => `checks[${i}]`).join(", ")})`
      );
      r.control_assertions.checks = checksOf(r).filter((_c, i) => !dangerous.includes(i));
      expect(checksOf(r)).toHaveLength(16);
      expect((await loadWith(r, smaller)).rejection).toBeNull();
    });

    it("사례를 더하면 그 사례의 검사(A1·A2, 금지가 있으면 A4)가 필수가 되고, 더한 기록은 수락된다", async () => {
      const larger = expectationsWith((e) => {
        e.cases.push({
          path: "cases/extra.pos.js",
          fixture: ".moai/fixtures/semgrep-control/cases/extra.pos.js.in",
          sha256: "0".repeat(64),
          kind: "positive",
          family: "extra",
          pair: null,
          required: ["semgrep-rules.javascript.extra"],
          allowed: [],
          forbidden: ["semgrep-rules.javascript.extra-forbidden"],
          expect_zero: false,
          official_backing: "시험용 합성 사례",
        });
      });
      const r = plain();
      const rejected = await loadWith(r, larger);
      expect(rejected.rejection).toBe(
        MISSING("A1:cases/extra.pos.js", "A2:cases/extra.pos.js", "A4:cases/extra.pos.js")
      );
      checksOf(r).push(
        passCheck("A1", "cases/extra.pos.js"),
        passCheck("A2", "cases/extra.pos.js"),
        passCheck("A4", "cases/extra.pos.js")
      );
      expect((await loadWith(r, larger)).rejection).toBeNull();
    });

    it("금지 ID가 생기면 A4가 필수가 되고, 없어지면 A4가 예상 밖이 된다", async () => {
      const withForbidden = expectationsWith((e) => {
        e.cases.find((c: Plain) => c.path === "cases/eval.pos.js").forbidden = ["x.y"];
      });
      expect((await loadWith(plain(), withForbidden)).rejection).toBe(
        MISSING("A4:cases/eval.pos.js")
      );
      const withoutForbidden = expectationsWith((e) => {
        e.cases.find((c: Plain) => c.path === "cases/child-process.pos.ts").forbidden = [];
      });
      const r = plain();
      const index = checksOf(r).findIndex((c) => c.id === "A4:cases/child-process.pos.ts");
      expect((await loadWith(r, withoutForbidden)).rejection).toBe(
        `CHECKS_UNEXPECTED(checks[${index}])`
      );
    });

    it("짝(pair)이 없어지면 PAIR 검사가 예상 밖이 된다", async () => {
      const noPair = expectationsWith((e) => {
        e.cases.find((c: Plain) => c.path === "cases/child-process.pos.ts").pair = null;
      });
      const r = plain();
      const index = checksOf(r).findIndex((c) => c.id === "PAIR:child-process");
      expect((await loadWith(r, noPair)).rejection).toBe(`CHECKS_UNEXPECTED(checks[${index}])`);
    });

    it("정상 사례로 바뀌면(expect_zero) A1·A2 대신 A3이 필수가 된다", async () => {
      const asNormal = expectationsWith((e) => {
        e.cases.find((c: Plain) => c.path === "cases/eval.nosource.js").expect_zero = true;
      });
      const result = await loadWith(plain(), asNormal);
      expect(result.rejection).toContain(MISSING("A3:cases/eval.nosource.js"));
      expect(result.rejection).toContain("CHECKS_UNEXPECTED(");
    });
  });

  // 기대 입력을 읽거나 검증하지 못하면 불완전한 검증으로 수락하지 않고 명시적으로 실패한다.
  describe("기대 입력을 읽거나 검증하지 못하면 수락하지 않고 명시적으로 실패한다", () => {
    const unavailable = (why: string) => `EXPECTATIONS_UNAVAILABLE(${why})`;

    it("기대 입력 파일이 없다", async () => {
      const result = await loadWith(plain(), null);
      expectRejected(result, unavailable("READ_FAILED"));
    });

    it("기대 입력 파일 읽기가 실패한다", async () => {
      const inner = fsWith(JSON.stringify(plain()));
      const failing: FsPort = {
        readFile: async (p) => {
          if (p === EXPECTATIONS_PATH) throw new Error("EACCES: 시험용 읽기 실패");
          return inner.readFile(p);
        },
        writeFileExclusive: (p, d) => inner.writeFileExclusive(p, d),
        mkdirp: (p) => inner.mkdirp(p),
        listFilesRecursive: (p) => inner.listFilesRecursive(p),
        exists: (p) => inner.exists(p),
      };
      const result = await loadControlReference(failing, PATH, DATA_DIR);
      expectRejected(result, unavailable("READ_FAILED"));
      expect(result.rejection).not.toContain("EACCES"); // 오류 메시지는 사유에 옮기지 않는다
    });

    it("기록 파일이 정상이어도 기대 입력이 없으면 수락하지 않는다(다른 검사를 모두 통과하는 기록)", async () => {
      expect((await loadWith(plain(), EXPECTATIONS_TEXT)).rejection).toBeNull(); // 시험 전제
      expect((await loadWith(plain(), null)).reference).toBeNull();
    });

    it.each([
      ["JSON이 아님", "not json", "INVALID_JSON"],
      ["빈 파일", "", "INVALID_JSON"],
      ["최상위가 배열", "[]", "NOT_AN_OBJECT"],
      ["스키마가 다름", JSON.stringify({ schema: "x", cases: [] }), "SCHEMA_UNSUPPORTED"],
      [
        "cases가 배열이 아님",
        JSON.stringify({ schema: "semgrep-lsp-control-expectations/1", cases: {} }),
        "SCHEMA_UNSUPPORTED",
      ],
    ])("기대 입력이 %s → 명시적으로 실패", async (_name, text, why) => {
      const result = await loadWith(plain(), text);
      expectRejected(result, unavailable(why));
    });

    // 검사 목록 도출에 쓰는 필드를 사례마다 검증한다.
    const badCases: [string, (cases: Plain[]) => void, string][] = [
      ["사례가 하나도 없음", (c) => void c.splice(0, c.length), "cases(empty)"],
      ["사례가 객체가 아님", (c) => (c[2] = "x" as unknown as Plain), "cases[2](type)"],
      ["path가 비어 있음", (c) => (c[1].path = ""), "cases[1].path(value)"],
      ["path가 숫자", (c) => (c[1].path = 5), "cases[1].path(type)"],
      ["path가 중복", (c) => (c[1].path = c[0].path), "cases[1].path(duplicate)"],
      ["kind가 알 수 없는 값", (c) => (c[3].kind = "weird"), "cases[3].kind(value)"],
      ["family가 숫자", (c) => (c[3].family = 1), "cases[3].family(type)"],
      ["pair가 숫자", (c) => (c[0].pair = 1), "cases[0].pair(type)"],
      ["forbidden이 배열이 아님", (c) => (c[0].forbidden = "x"), "cases[0].forbidden(type)"],
      [
        "forbidden에 문자열이 아닌 항목",
        (c) => (c[0].forbidden = [1]),
        "cases[0].forbidden[0](type)",
      ],
      ["forbidden 키 없음", (c) => delete c[0].forbidden, "cases[0].forbidden(missing)"],
      [
        "expect_zero가 불리언이 아님",
        (c) => (c[4].expect_zero = "no"),
        "cases[4].expect_zero(type)",
      ],
    ];
    it.each(badCases)("기대 사례가 %s → 명시적으로 실패", async (_name, mutate, token) => {
      const text = expectationsWith((e) => mutate(e.cases));
      const result = await loadWith(plain(), text);
      expectRejected(result, "EXPECTATIONS_UNAVAILABLE(INVALID_CASES(", token);
    });

    it("controlReferenceFromValue도 검증하지 못한 기대로는 수락하지 않는다(호출자가 검증을 빼먹어도)", () => {
      const bad = { ...CONTROL_EXPECTATIONS, cases: [] };
      const result = controlReferenceFromValue(plain(), bad);
      expectRejected(result, "EXPECTATIONS_UNAVAILABLE(INVALID_CASES(cases(empty))");
    });

    it("기록 파일 자체의 실패는 기존 이유 그대로다(기대 입력은 있다)", async () => {
      expectRejected(await loadControlReference(fsWith(null), PATH, DATA_DIR), "FILE_NOT_FOUND");
    });
  });
});

describe("controlReferenceFromValue — 던지지 않는다", () => {
  it.each([
    undefined,
    null,
    0,
    "",
    true,
    [],
    [[]],
    {},
    { schema: {} },
    { mode: "control" },
    Object.create(null),
  ])("평범하지 않은 값 %#도 거절로 끝난다", (value) => {
    const result = controlReferenceFromValue(value, CONTROL_EXPECTATIONS);
    expect(result.reference).toBeNull();
    expect(result.rejection).not.toBeNull();
  });

  it("정상 기록은 같은 결과를 낸다(파일 읽기 없이)", () => {
    const direct = controlReferenceFromValue(plain(), CONTROL_EXPECTATIONS);
    expect(direct.rejection).toBeNull();
    expect(direct.reference).toEqual(toControlReference(record(), true));
  });

  it("음성 대조를 시험이 직접 만든 명시 목록으로 줘도 같은 규칙으로 재계산한다", () => {
    const r = record({ negatives: qualifiedNegativeControls(String(FP.binding_sha256)) });
    expect(controlReferenceFromValue(plain(r), CONTROL_EXPECTATIONS).rejection).toBeNull();
  });
});
