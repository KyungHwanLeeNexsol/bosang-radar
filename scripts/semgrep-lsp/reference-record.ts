// 저장된 대조(control) 실행 기록(run.json)을 읽어 target의 대조 참조(control_reference)로 잇는 어댑터.
//
// 원칙: 파일에서 나온 값은 전부 `unknown`이다. 타입 단언으로 RunRecord라고 간주하지 않는다 — 소비하는 필드를 하나씩 검사해
// 새 객체로 옮기고, 검사를 통과하지 못하면 이유를 토큰으로 돌려주며 던지지 않는다. 거절은 항상 `reference: null`이다.
//
// 수락 조건(모두 만족해야 한다):
//  1. 읽을 수 있고 UTF-8 JSON 객체이며 스키마가 `SCHEMAS.run`이다.
//  2. mode가 control이다(target 실행 기록은 대조 참조가 아니다).
//  3. 소비하는 필드의 구조가 맞다(지문은 64자 소문자 16진수 또는 null, 상태는 알려진 값, 음성 대조는 항목별 구조 등).
//  4. 출처가 real이고 trust가 REAL_UNREVIEWED다(stub·SYNTHETIC 기록은 참조가 아니다).
//  5. 저장된 `reference_qualification`(eligible 포함)을 믿지 않는다 — 기록의 사실(출처·측정·단언·N0·지문·음성 대조)로
//     `qualifyControlRun`을 다시 돌려 자격을 재계산하고, 저장된 선언과 한 치도 어긋나지 않으며 모든 요구가 충족될 때만 수락한다.
//     음성 대조 PASS의 근거(기대 상태는 현재 NEGATIVE_CONTROL_TABLE의 기준, observed는 null이 아니며 그 기대와 같다)도
//     `qualifyControlRun`이 본다 — 이 모듈에 따로 구현하지 않는다.
//  6. 세부 결과와 요약 상태가 서로 모순이 아니다(기록의 자기 일관성이다 — 서명·출처 인증이나 원시 트랜스크립트 재검증이 아니다):
//     · COMPLETE·NOT_RUN 측정에는 reasons가 없다(기록 생성 계약, evidence.ts의 checkVerdict와 같다).
//     · control_assertions.checks는 항목마다 id·kind·file·status·detail을 검사하고, 사례 검사(A1·A3)가 하나 이상 있다.
//     · design_errors는 문자열 배열이고 비어 있다.
//     · 저장된 control_assertions.status가 세부 결과(검사·음성 대조·설계 오류)로 계산한 값과 같다. 계산 규칙은
//       control.ts의 `summarizeControlAssertions`이며 evaluateControlAssertions가 쓰는 함수와 같다(두 구현이 갈라지지 않는다).
//
// 이 모듈이 하지 않는 것:
//  · 이번 실행(target)의 핀·도구·규칙·하네스·대조 지문과의 비교 — 그것은 수락된 요약을 받는 판정(evaluate, 기존
//    `checkControlReferenceFacts`)이 이번 실행의 지문으로 다시 한다. 여기서는 기록의 지문을 현재 값으로 채우거나 바꾸지 않는다.
//  · 파일의 출처 진위 증명. 파일은 서명되지 않았으므로, 위조된 파일이 자기 일관성과 현재 실행과의 지문 일치를 모두 맞추면
//    이 어댑터로는 구별할 수 없다. 남는 방어는 지문 비교(핀·하네스·대조 코드가 같아야 한다)와 운영자가 기록 경로를 명시하는 것뿐이다.
//  · 최신 기록 탐색·기본 경로·여러 기록 중 선택. 경로는 호출자가 하나만 명시한다.
//
// 거절 상세(rejection)에는 필드 경로와 토큰만 쓴다. 해시 값·도구 버전 같은 값은 적지 않는다.
//
// 공개 API:
//   loadControlReference(fs, path): Promise<ReferenceRecordResult>     파일 읽기 → 파싱 → 검증. 던지지 않는다.
//   controlReferenceFromValue(value: unknown): ReferenceRecordResult   이미 파싱한 값에서. 던지지 않는다.
//   ReferenceRecordResult / MAX_RECORD_BYTES

import { hasCaseChecks, summarizeControlAssertions } from "./control";
import { toControlReference } from "./harness";
import { negativeControlProblems, qualifyControlRun } from "./reference";
import { STATUS_PRIORITY, type MeasurementStatus } from "./status";
import {
  SCHEMAS,
  type ControlAssertions,
  type ControlCheck,
  type FsPort,
  type NegativeControlResult,
  type Provenance,
  type ReferenceRequirementId,
  type RunRecord,
} from "./types";

export interface ReferenceRecordResult {
  /** 수락한 요약(기록에서 새로 만든 복사본). 수락하지 않았으면 null. */
  reference: NonNullable<RunRecord["control_reference"]> | null;
  /** 수락하지 않은 이유(사유 상세로 쓴다). 수락했으면 null. */
  rejection: string | null;
}

/** 이보다 큰 파일은 파싱하기 전에 거절한다(control run.json은 요약이라 이보다 훨씬 작다). */
export const MAX_RECORD_BYTES = 16 * 1024 * 1024;
const MAX_REJECTION_CHARS = 600;
const MAX_LIST = 64;
const MAX_REASONS = 1000;
const MAX_NEGATIVE_TOKENS = 8;

const HEX64 = /^[0-9a-f]{64}$/;
const HEX40 = /^[0-9a-f]{40}$/;
// harness.ts의 runId 규칙과 같다(증거 폴더 이름이 될 수 있는 값만).
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

const MEASUREMENT_STATUSES: readonly MeasurementStatus[] = [
  ...STATUS_PRIORITY,
  "COMPLETE",
  "NOT_RUN",
];
const ASSERTION_STATUSES: readonly ControlAssertions["status"][] = [
  "PASS",
  "FAIL",
  "REVIEW_REQUIRED",
  "NOT_RUN",
  "NOT_APPLICABLE",
];
const CHECK_KINDS: readonly ControlCheck["kind"][] = ["A1", "A2", "A3", "A4", "PAIR", "NEGATIVE"];
const CHECK_STATUSES: readonly ControlCheck["status"][] = ["PASS", "FAIL", "REVIEW", "NOT_RUN"];
const REQUIREMENT_IDS: readonly ReferenceRequirementId[] = [
  "PROVENANCE_REAL",
  "MEASUREMENT_COMPLETE",
  "CONTROL_ASSERTIONS_PASS",
  "N0_CONFIRMED",
  "FINGERPRINTS_COMPLETE",
  "NEGATIVE_PREFLIGHT_PASS",
  "NEGATIVE_ENGINE_PASS",
  "NEGATIVE_BINDING_MATCH",
];

type Obj = Record<string, unknown>;

const isObject = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const has = (o: Obj, key: string): boolean => Object.prototype.hasOwnProperty.call(o, key);
const at = (path: string, key: string): string => (path === "" ? key : `${path}.${key}`);

/** 구조 검사에서 모은 문제(필드 경로와 종류만). */
class Problems {
  readonly list: string[] = [];
  add(problem: string): void {
    if (this.list.length < MAX_LIST) this.list.push(problem);
  }
}

function str(
  o: Obj,
  key: string,
  path: string,
  p: Problems,
  test: (s: string) => boolean = () => true
): string | undefined {
  const where = at(path, key);
  if (!has(o, key)) return void p.add(`${where}(missing)`);
  const v = o[key];
  if (typeof v !== "string") return void p.add(`${where}(type)`);
  if (!test(v)) return void p.add(`${where}(value)`);
  return v;
}

/** null 또는 검사를 통과한 문자열. undefined면 문제가 기록된 것이다. */
function nullableStr(
  o: Obj,
  key: string,
  path: string,
  p: Problems,
  test: (s: string) => boolean = () => true
): string | null | undefined {
  const where = at(path, key);
  if (!has(o, key)) return void p.add(`${where}(missing)`);
  const v = o[key];
  if (v === null) return null;
  if (typeof v !== "string") return void p.add(`${where}(type)`);
  if (!test(v)) return void p.add(`${where}(value)`);
  return v;
}

function bool(o: Obj, key: string, path: string, p: Problems): boolean | undefined {
  const where = at(path, key);
  if (!has(o, key)) return void p.add(`${where}(missing)`);
  if (typeof o[key] !== "boolean") return void p.add(`${where}(type)`);
  return o[key] as boolean;
}

function oneOf<T extends string>(
  o: Obj,
  key: string,
  path: string,
  p: Problems,
  allowed: readonly T[]
): T | undefined {
  const where = at(path, key);
  if (!has(o, key)) return void p.add(`${where}(missing)`);
  const v = o[key];
  if (typeof v !== "string") return void p.add(`${where}(type)`);
  if (!(allowed as readonly string[]).includes(v)) return void p.add(`${where}(value)`);
  return v as T;
}

function obj(o: Obj, key: string, path: string, p: Problems): Obj | undefined {
  const where = at(path, key);
  if (!has(o, key)) return void p.add(`${where}(missing)`);
  if (!isObject(o[key])) return void p.add(`${where}(type)`);
  return o[key] as Obj;
}

function arr(
  o: Obj,
  key: string,
  path: string,
  p: Problems,
  max = MAX_LIST
): unknown[] | undefined {
  const where = at(path, key);
  if (!has(o, key)) return void p.add(`${where}(missing)`);
  const v = o[key];
  if (!Array.isArray(v)) return void p.add(`${where}(type)`);
  if (v.length > max) return void p.add(`${where}(too-long)`);
  return v;
}

/** 배열 필드의 항목을 하나씩 본다: 객체가 아니면 `<경로>[i](type)`을 기록하고, 객체이면 visit이 필드를 검사한다. */
function eachObject(
  list: unknown[] | undefined,
  path: string,
  key: string,
  p: Problems,
  visit: (entry: Obj, where: string) => void
): void {
  list?.forEach((entry, i) => {
    const where = `${at(path, key)}[${i}]`;
    if (!isObject(entry)) return void p.add(`${where}(type)`);
    visit(entry, where);
  });
}

const sha256 = (s: string): boolean => HEX64.test(s);

// ── 구조 검증 ────────────────────────────────────────────────────

interface ControlRunView {
  run_id: string;
  provenance: Provenance;
  trust: RunRecord["trust"];
  inputs: RunRecord["inputs"];
  measurement: { status: MeasurementStatus; complete: boolean; reasonCount: number };
  control_assertions: {
    status: ControlAssertions["status"];
    checks: ControlCheck[];
    design_errors: string[];
    negative_controls: NegativeControlResult[];
  };
  qualification: {
    eligible: boolean;
    requirements: { id: ReferenceRequirementId; satisfied: boolean }[];
  };
}

function parseInputs(root: Obj, p: Problems): RunRecord["inputs"] | undefined {
  const o = obj(root, "inputs", "", p);
  if (o === undefined) return undefined;
  const path = "inputs";
  const target_sha = nullableStr(o, "target_sha", path, p, (s) => HEX40.test(s));
  const pin_sha256 = str(o, "pin_sha256", path, p, sha256);
  const scope_sha256 = nullableStr(o, "scope_sha256", path, p, sha256);
  const rules_list_sha256 = str(o, "rules_list_sha256", path, p, sha256);
  const rules_expected_sha256 = str(o, "rules_expected_sha256", path, p, sha256);
  const control_tree_sha256 = nullableStr(o, "control_tree_sha256", path, p, sha256);
  const harness_sha256 = nullableStr(o, "harness_sha256", path, p, sha256);
  const control_sha256 = nullableStr(o, "control_sha256", path, p, sha256);
  const tool_version_observed = nullableStr(
    o,
    "tool_version_observed",
    path,
    p,
    (s) => s.length > 0 && s.length <= 64
  );
  const wheel_sha256_observed = nullableStr(o, "wheel_sha256_observed", path, p, sha256);
  const binding_sha256 = nullableStr(o, "binding_sha256", path, p, sha256);
  if (
    target_sha === undefined ||
    pin_sha256 === undefined ||
    scope_sha256 === undefined ||
    rules_list_sha256 === undefined ||
    rules_expected_sha256 === undefined ||
    control_tree_sha256 === undefined ||
    harness_sha256 === undefined ||
    control_sha256 === undefined ||
    tool_version_observed === undefined ||
    wheel_sha256_observed === undefined ||
    binding_sha256 === undefined
  ) {
    return undefined;
  }
  return {
    target_sha,
    pin_sha256,
    scope_sha256,
    rules_list_sha256,
    rules_expected_sha256,
    control_tree_sha256,
    harness_sha256,
    control_sha256,
    tool_version_observed,
    wheel_sha256_observed,
    binding_sha256,
  };
}

function parseNegativeControls(
  o: Obj,
  path: string,
  p: Problems
): NegativeControlResult[] | undefined {
  const list = arr(o, "negative_controls", path, p);
  if (list === undefined) return undefined;
  const out: NegativeControlResult[] = [];
  const before = p.list.length;
  eachObject(list, path, "negative_controls", p, (entry, where) => {
    const id = str(entry, "id", where, p, (s) => s.length > 0 && s.length <= 16);
    const layer = oneOf(entry, "layer", where, p, ["preflight", "engine"] as const);
    const expected = oneOf(entry, "expected", where, p, MEASUREMENT_STATUSES);
    const status = oneOf(entry, "status", where, p, ["PASS", "FAIL", "NOT_RUN"] as const);
    const binding = nullableStr(entry, "binding_sha256", where, p, sha256);
    let observed: MeasurementStatus | null | undefined;
    if (!has(entry, "observed")) p.add(`${where}.observed(missing)`);
    else if (entry.observed === null) observed = null;
    else observed = oneOf(entry, "observed", where, p, MEASUREMENT_STATUSES);
    if (
      id !== undefined &&
      layer !== undefined &&
      expected !== undefined &&
      status !== undefined &&
      binding !== undefined &&
      observed !== undefined
    ) {
      out.push({ id, layer, expected, observed, status, binding_sha256: binding });
    }
  });
  return p.list.length === before ? out : undefined;
}

/** checks는 소비하는 필드(id·kind·file·status·detail)를 항목마다 검사해 새 객체로 옮긴다. */
function parseChecks(o: Obj, path: string, p: Problems): ControlCheck[] | undefined {
  const list = arr(o, "checks", path, p, MAX_REASONS);
  if (list === undefined) return undefined;
  const out: ControlCheck[] = [];
  const before = p.list.length;
  eachObject(list, path, "checks", p, (entry, where) => {
    const id = str(entry, "id", where, p);
    const kind = oneOf(entry, "kind", where, p, CHECK_KINDS);
    const file = nullableStr(entry, "file", where, p);
    const status = oneOf(entry, "status", where, p, CHECK_STATUSES);
    const detail = str(entry, "detail", where, p);
    if (
      id !== undefined &&
      kind !== undefined &&
      file !== undefined &&
      status !== undefined &&
      detail !== undefined
    ) {
      out.push({ id, kind, file, status, detail });
    }
  });
  return p.list.length === before ? out : undefined;
}

/** design_errors는 문자열 배열이다. 내용은 사유에 옮기지 않는다(개수만 쓴다). */
function parseDesignErrors(o: Obj, path: string, p: Problems): string[] | undefined {
  const list = arr(o, "design_errors", path, p);
  if (list === undefined) return undefined;
  const before = p.list.length;
  list.forEach((entry, i) => {
    if (typeof entry !== "string") p.add(`${at(path, "design_errors")}[${i}](type)`);
  });
  return p.list.length === before ? (list as string[]) : undefined;
}

function parseQualification(root: Obj, p: Problems): ControlRunView["qualification"] | undefined {
  const o = obj(root, "reference_qualification", "", p);
  if (o === undefined) return undefined;
  const path = "reference_qualification";
  const applicable = bool(o, "applicable", path, p);
  const eligible = bool(o, "eligible", path, p);
  const list = arr(o, "requirements", path, p);
  if (applicable === false) p.add(`${path}.applicable(value)`);
  const requirements: { id: ReferenceRequirementId; satisfied: boolean }[] = [];
  if (list !== undefined) {
    const before = p.list.length;
    eachObject(list, path, "requirements", p, (entry, where) => {
      const id = oneOf(entry, "id", where, p, REQUIREMENT_IDS);
      const satisfied = bool(entry, "satisfied", where, p);
      str(entry, "detail", where, p);
      if (id !== undefined && satisfied !== undefined) {
        if (requirements.some((r) => r.id === id)) p.add(`${where}.id(duplicate ${id})`);
        else requirements.push({ id, satisfied });
      }
    });
    if (p.list.length === before && !requirements.some((r) => r.id === "N0_CONFIRMED")) {
      p.add(`${path}.requirements(N0_CONFIRMED missing)`);
    }
  }
  if (eligible === undefined || list === undefined) return undefined;
  return { eligible, requirements };
}

/** 소비하는 필드를 검사해 새 객체로 옮긴다. 문제는 p에 모으며, 문제가 하나라도 있으면 undefined다. */
function parseControlRun(root: Obj, p: Problems): ControlRunView | undefined {
  const start = p.list.length;
  const run_id = str(root, "run_id", "", p, (s) => RUN_ID.test(s));
  const provenance = oneOf(root, "provenance", "", p, ["real", "stub"] as const);
  const trust = oneOf(root, "trust", "", p, ["SYNTHETIC", "REAL_UNREVIEWED"] as const);
  const inputs = parseInputs(root, p);

  let measurement: ControlRunView["measurement"] | undefined;
  const m = obj(root, "measurement", "", p);
  if (m !== undefined) {
    const status = oneOf(m, "status", "measurement", p, MEASUREMENT_STATUSES);
    const complete = bool(m, "complete", "measurement", p);
    const reasons = arr(m, "reasons", "measurement", p, MAX_REASONS);
    arr(m, "phases_reached", "measurement", p);
    eachObject(
      reasons,
      "measurement",
      "reasons",
      p,
      (reason, where) => void str(reason, "code", where, p)
    );
    if (status !== undefined && complete !== undefined && reasons !== undefined) {
      measurement = { status, complete, reasonCount: reasons.length };
    }
  }

  let assertions: ControlRunView["control_assertions"] | undefined;
  const a = obj(root, "control_assertions", "", p);
  if (a !== undefined) {
    const path = "control_assertions";
    const status = oneOf(a, "status", path, p, ASSERTION_STATUSES);
    const applicable = bool(a, "applicable", path, p);
    if (applicable === false) p.add(`${path}.applicable(value)`);
    const checks = parseChecks(a, path, p);
    const designErrors = parseDesignErrors(a, path, p);
    const negatives = parseNegativeControls(a, path, p);
    if (
      status !== undefined &&
      checks !== undefined &&
      designErrors !== undefined &&
      negatives !== undefined
    ) {
      assertions = {
        status,
        checks,
        design_errors: designErrors,
        negative_controls: negatives,
      };
    }
  }

  // 참조를 가진 기록은 target 기록이다. control 기록은 항상 null이다.
  if (!has(root, "control_reference")) p.add("control_reference(missing)");
  else if (root.control_reference !== null) p.add("control_reference(value)");

  const qualification = parseQualification(root, p);

  // 봉인된 값: 이 값이 풀려 있는 기록은 이 하네스가 만든 기록이 아니다.
  const gate = obj(root, "candidate_gate", "", p);
  if (gate !== undefined) {
    if (gate.policy_accepted !== false) p.add("candidate_gate.policy_accepted(value)");
    if (gate.counts_as_lsp_security_warnings !== false) {
      p.add("candidate_gate.counts_as_lsp_security_warnings(value)");
    }
  }
  for (const key of ["observed", "existing_gates", "not_executed"]) obj(root, key, "", p);

  if (
    p.list.length > start ||
    run_id === undefined ||
    provenance === undefined ||
    trust === undefined ||
    inputs === undefined ||
    measurement === undefined ||
    assertions === undefined ||
    qualification === undefined
  ) {
    return undefined;
  }
  return {
    run_id,
    provenance,
    trust,
    inputs,
    measurement,
    control_assertions: assertions,
    qualification,
  };
}

// ── 수락 판단 ────────────────────────────────────────────────────

const reject = (rejection: string): ReferenceRecordResult => ({
  reference: null,
  rejection: rejection.slice(0, MAX_REJECTION_CHARS),
});

export function controlReferenceFromValue(value: unknown): ReferenceRecordResult {
  try {
    if (!isObject(value)) return reject("NOT_AN_OBJECT");

    // 스키마와 모드는 나머지 구조를 볼 가치가 있는지 가른다.
    const early = new Problems();
    const schema = str(value, "schema", "", early);
    if (schema !== undefined && schema !== SCHEMAS.run) return reject("SCHEMA_UNSUPPORTED");
    if (schema === undefined) return reject(`INVALID_FIELDS(${early.list.join(", ")})`);
    if (value.mode === "target") return reject("MODE_NOT_CONTROL");
    const modeProblems = new Problems();
    if (oneOf(value, "mode", "", modeProblems, ["control", "target"] as const) !== "control") {
      return reject(`INVALID_FIELDS(${modeProblems.list.join(", ")})`);
    }

    const problems = new Problems();
    const view = parseControlRun(value, problems);
    if (view === undefined) return reject(`INVALID_FIELDS(${problems.list.join(", ")})`);

    const found: string[] = [];
    if (view.trust === "SYNTHETIC") found.push("TRUST_SYNTHETIC");
    if ((view.provenance === "real") !== (view.trust === "REAL_UNREVIEWED")) {
      found.push("PROVENANCE_TRUST_INCONSISTENT");
    }
    if (view.measurement.complete !== (view.measurement.status === "COMPLETE")) {
      found.push("MEASUREMENT_FIELDS_INCONSISTENT");
    }
    // 기록 생성 계약(evidence.ts checkVerdict): COMPLETE·NOT_RUN 측정에는 사유가 없다.
    if (
      (view.measurement.status === "COMPLETE" || view.measurement.status === "NOT_RUN") &&
      view.measurement.reasonCount > 0
    ) {
      found.push("MEASUREMENT_REASONS_INCONSISTENT");
    }

    // 세부 결과와 요약 상태의 모순: 요약은 세부 결과가 정하는 값(evaluateControlAssertions와 같은 함수)과 같아야 한다.
    const assertions = view.control_assertions;
    if (assertions.design_errors.length > 0) {
      found.push(`ASSERTION_DESIGN_ERRORS(${assertions.design_errors.length})`);
    }
    if (!hasCaseChecks(assertions.checks)) found.push("ASSERTION_CHECKS_EMPTY");
    const derivedStatus = summarizeControlAssertions({
      checks: assertions.checks,
      negatives: assertions.negative_controls,
      designErrorCount: assertions.design_errors.length,
    });
    if (derivedStatus !== assertions.status) {
      found.push(
        `ASSERTION_SUMMARY_MISMATCH(stored=${assertions.status}, derived=${derivedStatus})`
      );
    }

    // 저장된 자격 선언은 믿지 않는다: 같은 사실로 현재 로직을 다시 돌려 비교한다.
    const n0 = view.qualification.requirements.find((r) => r.id === "N0_CONFIRMED");
    const recomputed = qualifyControlRun({
      mode: "control",
      provenance: view.provenance,
      measurementStatus: view.measurement.status,
      controlAssertionsStatus: view.control_assertions.status,
      n0Confirmed: n0?.satisfied === true,
      inputs: view.inputs,
      negativeControls: view.control_assertions.negative_controls,
    });
    const declared = view.qualification;
    const mismatched: string[] = [];
    if (declared.eligible !== recomputed.eligible) mismatched.push("eligible");
    for (const req of recomputed.requirements) {
      const stored = declared.requirements.find((d) => d.id === req.id);
      if (stored === undefined || stored.satisfied !== req.satisfied) mismatched.push(req.id);
    }
    for (const stored of declared.requirements) {
      if (!recomputed.requirements.some((r) => r.id === stored.id)) mismatched.push(stored.id);
    }
    if (mismatched.length > 0) {
      found.push(`QUALIFICATION_DECLARATION_MISMATCH(${mismatched.join(", ")})`);
    }
    if (!recomputed.eligible) {
      const unsatisfied = recomputed.requirements.filter((r) => !r.satisfied).map((r) => r.id);
      found.push(`NOT_QUALIFIED(${unsatisfied.join(", ")})`);
      // 음성 대조는 어느 (id, 층)이 왜 어긋났는지(missing·상태·expected·observed)까지 토큰으로 남긴다.
      const negatives = negativeControlProblems(view.control_assertions.negative_controls);
      if (negatives.length > 0) {
        const shown = negatives.slice(0, MAX_NEGATIVE_TOKENS);
        const more = negatives.length - shown.length;
        found.push(`NEGATIVE_CONTROL_PROBLEMS(${shown.join(", ")}${more > 0 ? `, +${more}` : ""})`);
      }
    }
    if (found.length > 0) return reject(found.join("; "));

    // 수락: 기존 변환을 그대로 쓰되, 자격은 저장된 값이 아니라 재계산한 값을 넘긴다.
    const reference = toControlReference(
      {
        mode: "control",
        run_id: view.run_id,
        provenance: view.provenance,
        inputs: view.inputs,
        measurement: { status: view.measurement.status },
        control_assertions: view.control_assertions,
        reference_qualification: { eligible: recomputed.eligible },
      },
      n0?.satisfied === true
    );
    if (!reference.eligible) return reject("NOT_QUALIFIED(요약을 만들 수 없다)");
    return { reference, rejection: null };
  } catch {
    // 예기치 못한 오류도 거절로 끝낸다(오류 메시지에는 값이 섞일 수 있어 적지 않는다).
    return reject("INTERNAL_ERROR");
  }
}

// ── 파일 읽기 ────────────────────────────────────────────────────

export async function loadControlReference(
  fs: FsPort,
  path: string
): Promise<ReferenceRecordResult> {
  try {
    let present: boolean;
    try {
      present = await fs.exists(path);
    } catch {
      return reject("READ_FAILED");
    }
    if (!present) return reject("FILE_NOT_FOUND");

    let bytes: Uint8Array;
    try {
      bytes = await fs.readFile(path);
    } catch {
      return reject("READ_FAILED");
    }
    if (bytes.byteLength > MAX_RECORD_BYTES) return reject("TOO_LARGE");

    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return reject("INVALID_ENCODING");
    }

    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      return reject("INVALID_JSON");
    }
    return controlReferenceFromValue(value);
  } catch {
    return reject("INTERNAL_ERROR");
  }
}
