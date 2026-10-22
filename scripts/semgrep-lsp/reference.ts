// 대조 참조의 자격(PR #28 검토 발견 2·3). 순수 모듈이다: 입력만 읽고 아무것도 바꾸지 않으며, 던지지 않는다.
//
// 두 얼굴이 있다:
//  · qualifyControlRun    control 실행이 target의 대조 참조가 될 자격이 있는가(실행 쪽의 자기 계산, run.json에 기록).
//  · checkControlReferenceFacts   target 판정이 참조 요약의 "사실"(지문·음성 대조)을 이번 실행과 다시 맞춰 보는 검사.
//    참조의 eligible 필드는 자기 선언일 뿐이라 믿지 않는다 — 사실이 선언과 모순되면 NOT_ELIGIBLE도 낸다.
//
// 음성 대조는 두 층(preflight·engine)이 서로 대신하지 못하고, PASS마다 이 실행과 같은 결합(binding_sha256)이 찍혀 있어야 한다.
// 실행 쪽 자격(qualifyControlRun)은 여기에 더해 PASS의 근거도 본다: 기록의 expected가 현재 NEGATIVE_CONTROL_TABLE의 기준
// (엔진은 spec.expected, 사전 검사는 spec.preflight.status — 두 층의 기대는 같다고 가정하지 않는다)과 같고, observed가
// null이 아니며 그 기대와 같아야 한다. target 쪽 사실 확인(checkControlReferenceFacts)은 이 검사를 하지 못한다: 참조 요약
// (toControlReference)은 id·층·status·결합만 싣고 expected·observed를 버리기 때문이다. 그 근거는 전체 기록을 보는 쪽(자격
// 계산과 reference-record.ts 어댑터)에서 확인한다. 잘못된 관측을 보정하거나 PASS로 덮어쓰지 않는다.
// 사유의 상세에는 필드 이름과 "R3:engine(NOT_RUN)" 같은 토큰만 쓴다(해시 값을 적지 않는다).
//
// 공개 API:
//   requiredNegativeControlKeys()
//   negativeControlProblems(list): string[]     전체 기록 기준으로 어긋난 (id, 층) 토큰(어댑터가 거절 사유에 싣는다)
//   qualifyControlRun(args): ReferenceQualification
//   checkControlReferenceFacts(ref, current): Reason[]     새 검사만(기존 MISSING·SYNTHETIC·NOT_PASS·PIN·N0는 evaluate.ts의 몫)

import { NEGATIVE_CONTROL_TABLE } from "./control";
import { buildBinding } from "./fingerprint";
import type { MeasurementStatus, Reason } from "./status";
import type {
  ControlAssertions,
  Mode,
  NegativeControlResult,
  Provenance,
  ReferenceFingerprints,
  ReferenceQualification,
  RunRecord,
} from "./types";

type Layer = "preflight" | "engine";

/** 필수 (id, 층) 쌍과 그 층의 기대 상태. 엔진은 spec.expected, 사전 검사는 spec.preflight.status다(서로 다를 수 있다). */
function requiredNegatives(): { id: string; layer: Layer; expected: MeasurementStatus }[] {
  const out: { id: string; layer: Layer; expected: MeasurementStatus }[] = [];
  for (const spec of NEGATIVE_CONTROL_TABLE) {
    out.push({ id: spec.id, layer: "engine", expected: spec.expected });
    if (spec.preflight !== null) {
      out.push({ id: spec.id, layer: "preflight", expected: spec.preflight.status });
    }
  }
  return out;
}

/** NEGATIVE_CONTROL_TABLE이 요구하는 (id, 층) 쌍: 엔진은 전부(9), 사전 검사는 preflight가 있는 id만(7). */
export function requiredNegativeControlKeys(): { id: string; layer: Layer }[] {
  return requiredNegatives().map(({ id, layer }) => ({ id, layer }));
}

const isStr = (value: unknown): value is string => typeof value === "string";

interface NegativeLike {
  id: unknown;
  layer: unknown;
  status: unknown;
  binding_sha256?: unknown;
  expected?: unknown;
  observed?: unknown;
}

const asList = (value: unknown): NegativeLike[] =>
  Array.isArray(value)
    ? (value as NegativeLike[]).filter((e) => typeof e === "object" && e !== null)
    : [];

/**
 * 한 층에서 요구되는 쌍마다 "정확히 하나이고 PASS"인지 본다. 어긋난 쌍은 토큰으로 돌려준다.
 * verifyObservation이면 PASS 항목의 근거도 본다: expected가 현재 표의 기준과 같고, observed가 null이 아니며 그 기준과 같다.
 * (참조 요약처럼 expected·observed가 없는 목록에는 켜지 않는다.) NOT_RUN·FAIL 항목은 상태 사유만 낸다.
 */
function layerProblems(
  list: readonly NegativeLike[],
  layer: Layer,
  verifyObservation: boolean
): string[] {
  const problems: string[] = [];
  for (const req of requiredNegatives().filter((k) => k.layer === layer)) {
    const found = list.filter((e) => e.id === req.id && e.layer === req.layer);
    const label = `${req.id}:${req.layer}`;
    if (found.length === 0) problems.push(`${label}(missing)`);
    else if (found.length > 1) problems.push(`${label}(duplicate)`);
    else if (found[0].status !== "PASS") {
      const status =
        found[0].status === "NOT_RUN" || found[0].status === "FAIL" ? found[0].status : "invalid";
      problems.push(`${label}(${status})`);
    } else if (verifyObservation) {
      const { expected, observed } = found[0];
      if (expected !== req.expected) problems.push(`${label}(expected)`);
      if (observed === null || observed === undefined) problems.push(`${label}(observed-null)`);
      else if (observed !== req.expected) problems.push(`${label}(observed)`);
    }
  }
  return problems;
}

/** 전체 기록(expected·observed 포함)에서 어긋난 필수 (id, 층) 토큰. 비어 있으면 두 층의 음성 대조가 모두 근거와 맞다. */
export function negativeControlProblems(list: readonly NegativeControlResult[]): string[] {
  const entries = asList(list);
  return [...layerProblems(entries, "preflight", true), ...layerProblems(entries, "engine", true)];
}

const listText = (items: readonly string[]): string =>
  items.length === 0 ? "없음" : items.join(", ");

// ── 실행 쪽 자격 ────────────────────────────────────────────────

export function qualifyControlRun(args: {
  mode: Mode;
  provenance: Provenance;
  measurementStatus: MeasurementStatus;
  controlAssertionsStatus: ControlAssertions["status"];
  n0Confirmed: boolean;
  inputs: RunRecord["inputs"];
  negativeControls: readonly NegativeControlResult[];
}): ReferenceQualification {
  if (args.mode !== "control") return { applicable: false, eligible: false, requirements: [] };

  const { inputs } = args;
  const negatives = asList(args.negativeControls);
  const requirements: ReferenceQualification["requirements"] = [];
  const add = (
    id: ReferenceQualification["requirements"][number]["id"],
    ok: boolean,
    detail: string
  ) => requirements.push({ id, satisfied: ok, detail });

  add(
    "PROVENANCE_REAL",
    args.provenance === "real",
    args.provenance === "real"
      ? "실제 도구 실행이다"
      : `출처가 ${args.provenance}라 참조가 될 수 없다`
  );
  add(
    "MEASUREMENT_COMPLETE",
    args.measurementStatus === "COMPLETE",
    `측정 상태 ${args.measurementStatus}`
  );
  add(
    "CONTROL_ASSERTIONS_PASS",
    args.controlAssertionsStatus === "PASS",
    `대조 단언 ${args.controlAssertionsStatus}`
  );
  add(
    "N0_CONFIRMED",
    args.n0Confirmed,
    args.n0Confirmed ? "N0가 확정됐다" : "N0가 확정되지 않았다"
  );

  // 지문: 다섯 값이 모두 있고, 결합이 구성 요소로 다시 만든 값과 같다.
  const missing = (
    [
      ["harness_sha256", inputs.harness_sha256],
      ["control_sha256", inputs.control_sha256],
      ["tool_version_observed", inputs.tool_version_observed],
      ["wheel_sha256_observed", inputs.wheel_sha256_observed],
      ["binding_sha256", inputs.binding_sha256],
    ] as const
  )
    .filter(([, value]) => !isStr(value))
    .map(([name]) => name);
  const rebuilt =
    missing.length === 0
      ? buildBinding({
          tool_version: inputs.tool_version_observed,
          wheel_sha256: inputs.wheel_sha256_observed,
          pin_sha256: inputs.pin_sha256,
          rules_list_sha256: inputs.rules_list_sha256,
          rules_expected_sha256: inputs.rules_expected_sha256,
          harness_sha256: inputs.harness_sha256,
          control_sha256: inputs.control_sha256,
        })
      : null;
  const bindingConsistent = rebuilt !== null && rebuilt === inputs.binding_sha256;
  add(
    "FINGERPRINTS_COMPLETE",
    missing.length === 0 && bindingConsistent,
    missing.length > 0
      ? `확인하지 못한 값: ${listText(missing)}`
      : bindingConsistent
        ? "지문 다섯 값이 모두 있고 결합이 구성 요소와 맞는다"
        : "결합(binding_sha256)이 구성 요소로 다시 만든 값과 다르다"
  );

  const preflightProblems = layerProblems(negatives, "preflight", true);
  const engineProblems = layerProblems(negatives, "engine", true);
  add(
    "NEGATIVE_PREFLIGHT_PASS",
    preflightProblems.length === 0,
    preflightProblems.length === 0
      ? "사전 검사 음성 대조가 모두 PASS다"
      : `미충족: ${listText(preflightProblems)}`
  );
  add(
    "NEGATIVE_ENGINE_PASS",
    engineProblems.length === 0,
    engineProblems.length === 0
      ? "엔진 음성 대조가 모두 PASS다"
      : `미충족: ${listText(engineProblems)}`
  );

  const bindingMismatch = negatives
    .filter((e) => e.status === "PASS")
    .filter((e) => !isStr(e.binding_sha256) || e.binding_sha256 !== inputs.binding_sha256)
    .map((e) => `${String(e.id)}:${String(e.layer)}`);
  const bindingOk = isStr(inputs.binding_sha256) && bindingMismatch.length === 0;
  add(
    "NEGATIVE_BINDING_MATCH",
    bindingOk,
    !isStr(inputs.binding_sha256)
      ? "이 실행의 결합을 알 수 없다"
      : bindingMismatch.length === 0
        ? "PASS 항목의 결합이 모두 이 실행과 같다"
        : `결합이 다른 PASS 항목: ${listText(bindingMismatch)}`
  );

  return { applicable: true, eligible: requirements.every((r) => r.satisfied), requirements };
}

// ── target 쪽 사실 확인 ─────────────────────────────────────────

const REQUIRED_FIELDS = [
  "harness_sha256",
  "control_sha256",
  "binding_sha256",
  "tool_version",
  "wheel_sha256",
] as const;

export function checkControlReferenceFacts(
  ref: NonNullable<RunRecord["control_reference"]>,
  current: ReferenceFingerprints | null
): Reason[] {
  const reasons: Reason[] = [];
  const refFp = (
    typeof ref?.fingerprints === "object" && ref.fingerprints !== null ? ref.fingerprints : {}
  ) as Partial<Record<keyof ReferenceFingerprints, unknown>>;
  const curFp = (current ?? {}) as Partial<Record<keyof ReferenceFingerprints, unknown>>;

  // 1. 값이 없는 지문: 없는 값은 없는 값과도 일치하지 않는다.
  const refMissing = REQUIRED_FIELDS.filter((f) => !isStr(refFp[f]));
  const curMissing = REQUIRED_FIELDS.filter((f) => !isStr(curFp[f]));
  if (refMissing.length > 0 || curMissing.length > 0) {
    reasons.push({
      code: "CONTROL_REFERENCE_FINGERPRINT_MISSING",
      detail: `참조: ${listText(refMissing)}; 이번 실행: ${listText(curMissing)}`,
    });
  }

  // 2. 값이 양쪽에 있는 필드끼리의 비교(없는 값은 위에서 이미 사유가 됐다).
  const differs = (field: keyof ReferenceFingerprints): boolean =>
    isStr(refFp[field]) && isStr(curFp[field]) && refFp[field] !== curFp[field];
  if (differs("harness_sha256")) reasons.push({ code: "CONTROL_REFERENCE_HARNESS_MISMATCH" });
  if (differs("control_sha256")) reasons.push({ code: "CONTROL_REFERENCE_CONTROL_MISMATCH" });
  const toolDiff = (
    ["tool_version", "wheel_sha256", "rules_list_sha256", "rules_expected_sha256"] as const
  ).filter((f) =>
    f === "rules_list_sha256" || f === "rules_expected_sha256"
      ? current !== null && refFp[f] !== curFp[f] // 이번 실행의 지문 묶음이 통째로 없으면 위 FINGERPRINT_MISSING이 다룬다
      : differs(f)
  );
  if (toolDiff.length > 0) {
    reasons.push({ code: "CONTROL_REFERENCE_TOOL_MISMATCH", detail: listText(toolDiff) });
  }

  // 3. 결합: 참조와 이번 실행이 같고, 참조의 결합이 자기 구성 요소(자기 pin_sha256 포함)로 만든 값과 같다.
  const bindingProblems: string[] = [];
  if (differs("binding_sha256")) bindingProblems.push("참조와 이번 실행의 결합이 다르다");
  if (
    [
      refFp.tool_version,
      refFp.wheel_sha256,
      refFp.rules_list_sha256,
      refFp.rules_expected_sha256,
      refFp.harness_sha256,
      refFp.control_sha256,
      ref?.pin_sha256,
    ].every(isStr) &&
    isStr(refFp.binding_sha256)
  ) {
    const rebuilt = buildBinding({
      tool_version: refFp.tool_version as string,
      wheel_sha256: refFp.wheel_sha256 as string,
      pin_sha256: ref.pin_sha256,
      rules_list_sha256: refFp.rules_list_sha256 as string,
      rules_expected_sha256: refFp.rules_expected_sha256 as string,
      harness_sha256: refFp.harness_sha256 as string,
      control_sha256: refFp.control_sha256 as string,
    });
    if (rebuilt !== refFp.binding_sha256)
      bindingProblems.push("참조의 결합이 자기 구성 요소와 맞지 않는다");
  }
  if (bindingProblems.length > 0) {
    reasons.push({
      code: "CONTROL_REFERENCE_BINDING_MISMATCH",
      detail: bindingProblems.join("; "),
    });
  }

  // 4. 음성 대조: 요구된 (id, 층)마다 정확히 하나, PASS, 참조의 결합과 같은 결합.
  const list = asList(ref?.negative_controls);
  const refBinding = isStr(refFp.binding_sha256) ? refFp.binding_sha256 : null;
  // 참조 요약은 expected·observed를 싣지 않으므로 상태·결합만 본다(근거 검사는 qualifyControlRun·어댑터 몫).
  const problems = [
    ...layerProblems(list, "preflight", false),
    ...layerProblems(list, "engine", false),
  ];
  for (const key of requiredNegativeControlKeys()) {
    const found = list.filter((e) => e.id === key.id && e.layer === key.layer);
    if (found.length === 1 && found[0].status === "PASS") {
      if (refBinding === null || found[0].binding_sha256 !== refBinding) {
        problems.push(`${key.id}:${key.layer}(binding)`);
      }
    }
  }
  if (problems.length > 0) {
    reasons.push({ code: "CONTROL_REFERENCE_NEGATIVE_INCOMPLETE", detail: listText(problems) });
  }

  // 5. 자기 선언: eligible이 true가 아니거나, true라고 하면서 위 사실 확인이 하나라도 실패했다.
  if (ref?.eligible !== true) {
    reasons.push({
      code: "CONTROL_REFERENCE_NOT_ELIGIBLE",
      detail: "참조가 eligible:true를 선언하지 않았다",
    });
  } else if (reasons.length > 0) {
    reasons.push({
      code: "CONTROL_REFERENCE_NOT_ELIGIBLE",
      detail: "eligible:true 선언이 다시 계산한 사실과 모순된다",
    });
  }
  return reasons;
}
