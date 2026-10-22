import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical";
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
  PIN_SHA256,
  fullFingerprints,
  qualifiedNegativeControls,
} from "./testing/evaluate-fixtures";
import type { FsPort, RunRecord } from "./types";

// 이 시험의 기록은 전부 시험이 손으로 구성한 합성 기록이다(testing/control-record-fixtures.ts). provenance를 "real"로
// 선언한 기록도 실제 Semgrep 실행에서 나온 것이 아니다. 어댑터가 재확인하는 것은 기록의 자기 일관성이지 출처의 진위가 아니다.

// 시험 전용: 파일에서 읽은 JSON을 마음대로 변조하는 시험이라 느슨한 타입을 쓴다(운영 코드는 unknown으로만 다룬다).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Plain = Record<string, any>;

const FP = fullFingerprints();
const PATH = "/records/control/run.json";

function record(over: Partial<SyntheticControlRecordOptions> = {}): RunRecord {
  return syntheticControlRunRecord({ fingerprints: FP, pinSha256: PIN_SHA256, ...over });
}

/** 직렬화·역직렬화를 거친 평범한 객체(어댑터가 파일에서 받는 모양). 시험이 필드를 마음대로 바꿀 수 있다. */
function plain(r: RunRecord = record()): Plain {
  return JSON.parse(canonicalJson(r)) as Plain;
}

function fsWith(content: string | Uint8Array | null): MemoryFs {
  return new MemoryFs(content === null ? {} : { [PATH]: content });
}

async function load(content: unknown) {
  const text = typeof content === "string" ? content : JSON.stringify(content);
  return loadControlReference(fsWith(text), PATH);
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
    const first = await loadControlReference(fs, PATH);
    first.reference!.fingerprints.harness_sha256 = "x";
    const second = await loadControlReference(fs, PATH);
    expect(second.reference!.fingerprints.harness_sha256).toBe(FP.harness_sha256);
  });
});

describe("loadControlReference — 읽기·파싱 실패는 던지지 않고 거절한다", () => {
  it("파일이 없다", async () => {
    expectRejected(await loadControlReference(fsWith(null), PATH), "FILE_NOT_FOUND");
  });

  it("파일은 있으나 읽기가 실패한다", async () => {
    const inner = fsWith("{}");
    const failing: FsPort = {
      readFile: async () => {
        throw new Error("EACCES: 시험용 읽기 실패");
      },
      writeFileExclusive: (p, d) => inner.writeFileExclusive(p, d),
      mkdirp: (p) => inner.mkdirp(p),
      listFilesRecursive: (p) => inner.listFilesRecursive(p),
      exists: (p) => inner.exists(p),
    };
    expectRejected(await loadControlReference(failing, PATH), "READ_FAILED");
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
    const result = await loadControlReference(failing, PATH);
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
    expectRejected(await loadControlReference(fsWith(bad), PATH), "INVALID_ENCODING");
  });

  it("너무 큰 파일은 파싱하기 전에 거절한다", async () => {
    const big = new Uint8Array(17 * 1024 * 1024).fill(0x20);
    expectRejected(await loadControlReference(fsWith(big), PATH), "TOO_LARGE");
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
    const result = controlReferenceFromValue(value);
    expect(result.reference).toBeNull();
    expect(result.rejection).not.toBeNull();
  });

  it("정상 기록은 같은 결과를 낸다(파일 읽기 없이)", () => {
    const direct = controlReferenceFromValue(plain());
    expect(direct.rejection).toBeNull();
    expect(direct.reference).toEqual(toControlReference(record(), true));
  });

  it("음성 대조를 시험이 직접 만든 명시 목록으로 줘도 같은 규칙으로 재계산한다", () => {
    const r = record({ negatives: qualifiedNegativeControls(String(FP.binding_sha256)) });
    expect(controlReferenceFromValue(plain(r)).rejection).toBeNull();
  });
});
