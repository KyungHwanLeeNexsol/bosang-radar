// 대조 단언 A1~A4, 정상 쌍, 음성 대조 표(ADR D8, rev2 3.5·4.1). 순수 모듈이다.
//
// 이 모듈은 "의도적 취약 예제를 필수대로 탐지했는가"를 판정한다. 보안 판정이 아니다. 그래서 진단 합계가
// 0인지 아닌지는 읽지도 않는다(`wholeBundleTotal`은 입력이 서로 모순되는지 보는 데만 쓴다). 취약 예제를
// 탐지한 control 실행은 합계가 양수여도 control_assertions가 PASS일 수 있고, 그 합계는 target의
// `value == 0` 판정과 섞이지 않는다(ADR D5).
//
// 단언은 서로 바꿔 쓰지 않는다:
//   A1 양성(·nosource)의 필수 ID가 게시 code에 있다 — 없으면 FAIL. 이것이 "대상 규칙의 탐지 여부"다.
//   A2 필수·허용·금지 밖의 ID는 REVIEW — 자동 FAIL이 아니다(전체는 REVIEW_REQUIRED).
//   A3 정상 파일은 게시 code가 0건 — 아니면 FAIL이고 design_errors에 "대조 설계의 오류"로 기록한다
//      (그 실행을 정상 기준으로 채택하지 않는다). 이것이 "전체 묶음의 진단 0건"이다.
//   A4 금지 ID가 있으면 FAIL.
//   PAIR 같은 계열의 양성이 A1을, 그 정상이 A3을 통과해야 쌍이 통과한다.
// eval.nosource는 A1(필수 eval-detected)과 A4(금지 detect-eval-with-expression)로 판정한다: 0건이면 FAIL이다.
//
// 결과가 없는 사례는 PASS가 될 수 없다: 해당 검사는 NOT_RUN이고, 전체는 모든 사례가 비었으면 NOT_RUN, 일부만
// 비었으면 FAIL(불완전한 대조는 참조가 될 수 없다)이다.
//
// 공개 API:
//   evaluateControlAssertions(expectations, observed, { applicable, negativeControls? }): ControlAssertions
//   NEGATIVE_CONTROL_TABLE: R1~R9 자료(기대 상태·사전 검사 사유)
//   defaultNegativeControls(): NegativeControlResult[]     엔진 9 + 사전 검사 7 = 16개, 전부 observed=null, NOT_RUN, 결합 null
//   markPreflightNegativeControls(base, produced, binding) 사전 검사 층만, 사전 검사가 실제로 낸 사유가 있을 때만 PASS
//   summarizeControlAssertions(parts): 세부 결과(검사·음성 대조·설계 오류)가 정하는 전체 상태. evaluateControlAssertions가
//                                      쓰고, 저장된 기록의 요약이 세부 결과와 모순인지 보는 reference-record.ts도 같은 함수를 쓴다
//   hasCaseChecks(checks): 사례 검사(A1·A3)가 하나라도 있는가
//
// 음성 대조는 "층"을 가진다: preflight(서버 없는 사전 검사의 거부)와 engine(실제 엔진을 띄운 진단 실행). 사전 검사 PASS는 엔진
// 항목을 바꾸지 않으며, 엔진 항목을 PASS로 표시하는 운영 함수는 없다(엔진 실행은 이 변경의 범위 밖이다). 각 PASS에는 그 결과를
// 얻은 결합(binding_sha256)이 찍혀 다른 실행의 PASS를 빌려 쓸 수 없다.

import {
  REASON_STATUS,
  representativeStatus,
  type MeasurementStatus,
  type Reason,
  type ReasonCode,
} from "./status";
import type {
  ControlAssertions,
  ControlCase,
  ControlCheck,
  ControlExpectations,
  NegativeControlResult,
} from "./types";

/** 사례별로 게시된 최종 규칙 ID(code) 전체와, 전체 묶음의 진단 합계(정보). */
export interface ControlObserved {
  /** 스캔 트리 기준 경로(예: `cases/eval.pos.js`) → 그 파일에 게시된 최종 규칙 ID 목록. 키가 없으면 결과 없음. */
  cases: Readonly<Record<string, readonly string[]>>;
  /** 전체 묶음의 진단 합계. 판정 기준이 아니다. 알 수 없으면 null. */
  wholeBundleTotal: number | null;
}

export interface ControlOptions {
  /** false(target 모드)면 NOT_APPLICABLE과 빈 검사만 돌려준다. */
  applicable: boolean;
  /** 음성 대조 기록. 주지 않으면 전부 NOT_RUN이다. */
  negativeControls?: readonly NegativeControlResult[];
}

// ── 음성 대조 표 (rev2 4.1) ──────────────────────────────────────

export interface NegativeControlSpec {
  id: string;
  description: string;
  /** rev2 4.1 "기대 상태" 열. 엔진을 띄운 실행에서 기대하는 대표 상태다. */
  expected: MeasurementStatus;
  /**
   * 서버 없이 사전 검사(PH0·설정 검사)가 낼 사유. null이면 엔진이 필요해 이 변경에서는 실행할 수 없다.
   * 사전 검사가 이 사유를 냈다는 것은 "엔진 없이 거부했다"만 증명한다(엔진 실행 결과는 증명하지 않는다).
   */
  preflight: { reason: ReasonCode; status: MeasurementStatus } | null;
}

function pre(reason: ReasonCode): NegativeControlSpec["preflight"] {
  return { reason, status: REASON_STATUS[reason] };
}

export const NEGATIVE_CONTROL_TABLE: readonly NegativeControlSpec[] = [
  {
    id: "R1",
    description: "필요한 유효 규칙 파일 제거",
    expected: "MANIFEST_MISMATCH",
    preflight: pre("RULES_FILE_REMOVED"),
  },
  {
    id: "R2",
    description: "규칙 파일의 YAML 구문 손상",
    expected: "MANIFEST_MISMATCH",
    preflight: pre("RULES_FILE_CHANGED"),
  },
  {
    id: "R3",
    description: "기존 파일은 그대로 두고 깨진 YAML 파일 추가(규칙 수 그대로)",
    expected: "MANIFEST_MISMATCH",
    preflight: pre("RULES_FILE_ADDED"),
  },
  {
    id: "R4",
    description: "기존 파일은 그대로 두고 유효한 새 규칙 파일 추가",
    expected: "MANIFEST_MISMATCH",
    preflight: pre("RULES_FILE_ADDED"),
  },
  {
    id: "R5",
    description: "기존 파일의 규칙 본문 변경(Got 0 errors로는 못 잡는다)",
    expected: "MANIFEST_MISMATCH",
    preflight: pre("RULES_FILE_CHANGED"),
  },
  {
    id: "R6",
    description: "없는 규칙 경로(엔진 필요)",
    expected: "RULES_NOT_LOADED",
    preflight: null,
  },
  {
    id: "R7",
    description: "scan에 알 수 없는 키 1개",
    expected: "SETTINGS_MISMATCH",
    preflight: pre("SETTINGS_KEY_NOT_ALLOWED"),
  },
  {
    id: "R8",
    description: "구성 경로를 cwd 밖 절대경로로 지정(엔진 필요)",
    expected: "PREFIX_MISSING",
    preflight: null,
  },
  {
    id: "R9",
    description: "metrics에 알 수 없는 키 1개(루프백 수신기 작동 증명은 엔진 필요)",
    expected: "ISOLATION_VIOLATION",
    preflight: pre("SETTINGS_KEY_NOT_ALLOWED"),
  },
];

/** 기본 기록: 모든 id의 엔진 항목 + 사전 검사가 있는 id의 사전 검사 항목. 아무것도 실행하지 않았으므로 전부 관측 없음·NOT_RUN·결합 null. */
export function defaultNegativeControls(): NegativeControlResult[] {
  const out: NegativeControlResult[] = [];
  for (const spec of NEGATIVE_CONTROL_TABLE) {
    out.push({
      id: spec.id,
      layer: "engine",
      expected: spec.expected,
      observed: null,
      status: "NOT_RUN",
      binding_sha256: null,
    });
    if (spec.preflight !== null) {
      out.push({
        id: spec.id,
        layer: "preflight",
        expected: spec.preflight.status,
        observed: null,
        status: "NOT_RUN",
        binding_sha256: null,
      });
    }
  }
  return out;
}

/**
 * 단위 시험이 사전 검사·설정 검사를 실제로 돌려 얻은 사유를 넘기면, 그 id만 PASS/FAIL로 표시한다.
 * · PASS: 넘긴 사유 목록에 그 id의 사전 검사 사유가 들어 있다. `expected`·`observed`는 사전 검사가 가리키는 상태다
 *   (R9에서 PASS는 "보내기 전에 거부했다"만 뜻한다 — ISOLATION_VIOLATION 관측은 엔진이 필요해 여전히 미실행이다).
 * · FAIL: 사유 목록에 그 사유가 없다(막아야 할 것을 못 막았다). observed는 넘긴 사유의 대표 상태(없으면 COMPLETE).
 * · 표시한 항목에는 bindingSha256을 찍는다(그 결과를 얻은 결합).
 * · 넘기지 않은 id와 모든 엔진 항목은 기록을 그대로 둔다. 엔진이 필요한 id(R6·R8)나 알 수 없는 id는 던진다 — 사전 검사로
 *   PASS를 표시할 수 없다. 원본 배열은 바꾸지 않는다.
 */
export function markPreflightNegativeControls(
  base: readonly NegativeControlResult[],
  produced: Readonly<Record<string, readonly Reason[]>>,
  bindingSha256: string
): NegativeControlResult[] {
  const specs = new Map(NEGATIVE_CONTROL_TABLE.map((s) => [s.id, s]));
  for (const id of Object.keys(produced)) {
    const spec = specs.get(id);
    if (!spec) throw new Error(`알 수 없는 음성 대조 id: ${id}`);
    if (spec.preflight === null)
      throw new Error(`${id}는 엔진이 필요해 사전 검사로 표시할 수 없다`);
  }
  return base.map((entry) => {
    const reasons = produced[entry.id];
    if (entry.layer !== "preflight" || reasons === undefined) return { ...entry };
    const preflight = (specs.get(entry.id) as NegativeControlSpec).preflight as NonNullable<
      NegativeControlSpec["preflight"]
    >;
    if (reasons.some((r) => r.code === preflight.reason)) {
      return {
        id: entry.id,
        layer: "preflight" as const,
        expected: preflight.status,
        observed: preflight.status,
        status: "PASS" as const,
        binding_sha256: bindingSha256,
      };
    }
    return {
      id: entry.id,
      layer: "preflight" as const,
      expected: preflight.status,
      observed: representativeStatus(reasons),
      status: "FAIL" as const,
      binding_sha256: bindingSha256,
    };
  });
}

// ── 단언 ─────────────────────────────────────────────────────────

function check(
  id: string,
  kind: ControlCheck["kind"],
  file: string | null,
  status: ControlCheck["status"],
  detail: string
): ControlCheck {
  return { id, kind, file, status, detail };
}

function listText(ids: readonly string[]): string {
  return ids.join(", ");
}

/** 사례 검사(A1·A3): 기대 사례마다 정확히 하나가 만들어진다. 하나도 없으면 아무 사례도 검사하지 않은 기록이다. */
export function hasCaseChecks(checks: readonly Pick<ControlCheck, "kind">[]): boolean {
  return checks.some((c) => c.kind === "A1" || c.kind === "A3");
}

/**
 * 세부 결과가 정하는 전체 상태. 우선순위: FAIL(검사·음성 대조·설계 오류) > 결과 없는 검사(사례 검사가 전부 비었으면
 * NOT_RUN, 일부만 비었으면 FAIL — 불완전한 대조는 참조가 될 수 없다) > REVIEW > PASS.
 * NOT_RUN인 음성 대조는 막지 않는다(엔진이 필요한 것은 이 변경에서 실행하지 않는다) — FAIL인 음성 대조만 막는다.
 * 검사가 비어 있으면 PASS가 계산되므로, 기록을 읽는 쪽은 hasCaseChecks로 따로 막는다.
 */
export function summarizeControlAssertions(parts: {
  checks: readonly Pick<ControlCheck, "kind" | "status">[];
  negatives: readonly Pick<NegativeControlResult, "status">[];
  designErrorCount: number;
}): ControlAssertions["status"] {
  const { checks, negatives, designErrorCount } = parts;
  if (
    checks.some((c) => c.status === "FAIL") ||
    negatives.some((n) => n.status === "FAIL") ||
    designErrorCount > 0
  ) {
    return "FAIL";
  }
  if (checks.some((c) => c.status === "NOT_RUN")) {
    const cases = checks.filter((c) => c.kind === "A1" || c.kind === "A3");
    return cases.length > 0 && cases.every((c) => c.status === "NOT_RUN") ? "NOT_RUN" : "FAIL";
  }
  return checks.some((c) => c.status === "REVIEW") ? "REVIEW_REQUIRED" : "PASS";
}

// ── 필요한 검사 목록 ─────────────────────────────────────────────
// 어떤 검사가 있어야 하는지는 기대 사례(data/control-expectations.json)가 정한다. 생성(evaluateControlAssertions)은 이 계획을
// 순회하며 검사를 만들고, 기록을 읽는 쪽은 같은 계획에서 도출한 식별 목록과 기록의 검사 목록을 대조한다. 기록이 스스로
// 주장하는 목록이나 개수는 기준이 아니다.

/** 검사 하나의 식별. 결과(status·detail)는 관측이 정하며 이 식별에는 들어 있지 않다. */
export interface ControlCheckIdentity {
  id: string;
  kind: ControlCheck["kind"];
  file: string;
}

interface PlannedCheck {
  id: string;
  kind: Exclude<ControlCheck["kind"], "NEGATIVE">;
  file: string;
  source: ControlCase;
}

/** 정상 사례는 A3 하나다. 양성·nosource는 A1·A2이고 금지 ID가 있으면 A4가 더해진다. */
const isNormalCase = (c: Pick<ControlCase, "kind" | "expect_zero">): boolean =>
  c.kind === "normal" || c.expect_zero;

/** 사례별 검사(기대 사례 순서), 이어서 짝이 있는 양성마다 PAIR 하나. PAIR는 A1·A3 결과를 쓰므로 항상 뒤에 온다. */
function planControlChecks(cases: readonly ControlCase[]): PlannedCheck[] {
  const plan: PlannedCheck[] = [];
  for (const c of cases) {
    const kinds: PlannedCheck["kind"][] = isNormalCase(c)
      ? ["A3"]
      : c.forbidden.length > 0
        ? ["A1", "A2", "A4"]
        : ["A1", "A2"];
    for (const kind of kinds) plan.push({ id: `${kind}:${c.path}`, kind, file: c.path, source: c });
  }
  for (const c of cases) {
    if (c.kind === "positive" && c.pair !== null) {
      plan.push({ id: `PAIR:${c.family}`, kind: "PAIR", file: c.path, source: c });
    }
  }
  return plan;
}

/** 기대 사례에서 도출한 필요한 검사의 식별 목록. 입력을 바꾸지 않고, 결과를 채우지 않는다. */
export function requiredControlChecks(
  expectations: Pick<ControlExpectations, "cases">
): ControlCheckIdentity[] {
  return planControlChecks(expectations.cases).map(({ id, kind, file }) => ({ id, kind, file }));
}

const MAX_LISTED = 6;

function listed(items: readonly string[]): string {
  const shown = items.slice(0, MAX_LISTED);
  const more = items.length - shown.length;
  return `${shown.join(", ")}${more > 0 ? `, +${more}` : ""}`;
}

/**
 * 기록의 검사 목록을 기대에서 도출한 목록과 (id, kind, file)의 다중집합으로 대조한다. 순서는 보지 않고, 개수만 같다고
 * 통과시키지 않는다. 어긋난 곳을 토큰으로 돌려준다(비어 있으면 같은 목록이다):
 *   CHECKS_MISSING(필수 id…)   CHECKS_DUPLICATE(id…)   CHECK_IDENTITY_MISMATCH(id…: id는 필수인데 kind·file이 다르다)
 *   CHECKS_UNEXPECTED(checks[i]…: 필수가 아닌 id)
 * 기록이 주장한 문자열은 사유에 옮기지 않는다: 알려진(필수) id만 적고, 모르는 항목은 위치만 적는다.
 */
export function controlCheckListProblems(
  recorded: readonly Pick<ControlCheck, "id" | "kind" | "file">[],
  expectations: Pick<ControlExpectations, "cases">
): string[] {
  const required = requiredControlChecks(expectations);
  const keyOf = (c: { id: string; kind: string; file: string | null }): string =>
    JSON.stringify([c.id, c.kind, c.file]);
  const need = new Map<string, number>();
  for (const r of required) need.set(keyOf(r), (need.get(keyOf(r)) ?? 0) + 1);
  const have = new Map<string, number>();
  const requiredIds = new Set(required.map((r) => r.id));
  const mismatched: string[] = [];
  const unexpected: string[] = [];
  recorded.forEach((c, i) => {
    have.set(keyOf(c), (have.get(keyOf(c)) ?? 0) + 1);
    if (need.has(keyOf(c))) return;
    if (!requiredIds.has(c.id)) unexpected.push(`checks[${i}]`);
    else if (!mismatched.includes(c.id)) mismatched.push(c.id);
  });
  const missing: string[] = [];
  const duplicate: string[] = [];
  for (const r of required) {
    const key = keyOf(r);
    const wanted = need.get(key) ?? 0;
    const got = have.get(key) ?? 0;
    need.delete(key); // 같은 식별은 한 번만 본다
    if (got < wanted) missing.push(r.id);
    else if (got > wanted && wanted > 0) duplicate.push(r.id);
  }
  const tokens: string[] = [];
  if (missing.length > 0) tokens.push(`CHECKS_MISSING(${listed(missing)})`);
  if (duplicate.length > 0) tokens.push(`CHECKS_DUPLICATE(${listed(duplicate)})`);
  if (mismatched.length > 0) tokens.push(`CHECK_IDENTITY_MISMATCH(${listed(mismatched)})`);
  if (unexpected.length > 0) tokens.push(`CHECKS_UNEXPECTED(${listed(unexpected)})`);
  return tokens;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const CASE_KINDS: readonly string[] = ["positive", "normal", "nosource"];

/**
 * 검사 목록을 도출하는 데 쓰는 기대 사례 필드를 검증한다(path·kind·family·pair·forbidden·expect_zero, path는 서로 달라야 한다).
 * 읽은 기대를 믿고 도출하지 않도록 기록을 읽는 쪽이 먼저 부른다. 문제 토큰이 없으면 도출이 의미 있는 입력이다.
 */
export function controlCaseProblems(expectations: unknown): string[] {
  const cases = isRecord(expectations) ? expectations.cases : undefined;
  if (!Array.isArray(cases)) return ["cases(type)"];
  if (cases.length === 0) return ["cases(empty)"];
  const problems: string[] = [];
  const paths = new Set<string>();
  cases.forEach((entry: unknown, i) => {
    const at = `cases[${i}]`;
    if (!isRecord(entry)) return void problems.push(`${at}(type)`);
    const field = (key: string, ok: (v: unknown) => boolean): boolean => {
      if (entry[key] === undefined) problems.push(`${at}.${key}(missing)`);
      else if (!ok(entry[key])) problems.push(`${at}.${key}(type)`);
      else return true;
      return false;
    };
    if (field("path", (v) => typeof v === "string")) {
      const path = entry.path as string;
      if (path === "") problems.push(`${at}.path(value)`);
      else if (paths.has(path)) problems.push(`${at}.path(duplicate)`);
      else paths.add(path);
    }
    if (field("kind", (v) => typeof v === "string") && !CASE_KINDS.includes(entry.kind as string)) {
      problems.push(`${at}.kind(value)`);
    }
    field("family", (v) => typeof v === "string");
    field("pair", (v) => v === null || typeof v === "string");
    if (field("forbidden", Array.isArray)) {
      (entry.forbidden as unknown[]).forEach((id, j) => {
        if (typeof id !== "string") problems.push(`${at}.forbidden[${j}](type)`);
      });
    }
    field("expect_zero", (v) => typeof v === "boolean");
  });
  return problems;
}

function validateObserved(observed: ControlObserved): void {
  const total = observed.wholeBundleTotal;
  if (total !== null && (!Number.isInteger(total) || total < 0)) {
    throw new Error("wholeBundleTotal은 null이거나 0 이상의 정수여야 한다");
  }
  for (const [path, codes] of Object.entries(observed.cases)) {
    if (!Array.isArray(codes) || codes.some((c) => typeof c !== "string")) {
      throw new Error(`사례 결과는 문자열 배열이어야 한다: ${path}`);
    }
  }
}

export function evaluateControlAssertions(
  expectations: ControlExpectations,
  observed: ControlObserved,
  options: ControlOptions
): ControlAssertions {
  if (!options.applicable) {
    return {
      applicable: false,
      status: "NOT_APPLICABLE",
      checks: [],
      negative_controls: [],
      design_errors: [],
    };
  }
  validateObserved(observed);

  const checks: ControlCheck[] = [];
  const designErrors: string[] = [];
  const byPath = new Map(expectations.cases.map((c) => [c.path, c]));
  const codesOf = (c: ControlCase): Set<string> | undefined => {
    const list = observed.cases[c.path];
    return list === undefined ? undefined : new Set(list);
  };

  for (const path of Object.keys(observed.cases).sort()) {
    if (!byPath.has(path)) {
      designErrors.push(`기대에 없는 경로의 결과가 있다: ${path}`);
    }
  }

  // 사례별 단언. 어떤 검사를 만드는지는 planControlChecks가 정한다(기록을 읽는 쪽이 같은 계획에서 도출한 목록과 대조한다).
  // PAIR가 쓸 수 있게 A1·A3 결과를 기억한다. 계획에서 PAIR는 항상 사례 검사 뒤에 온다.
  const a1: Record<string, ControlCheck["status"]> = {};
  const a3: Record<string, ControlCheck["status"]> = {};

  for (const p of planControlChecks(expectations.cases)) {
    const c = p.source;
    const codes = codesOf(c);
    const put = (status: ControlCheck["status"], detail: string): void => {
      checks.push(check(p.id, p.kind, p.file, status, detail));
    };

    switch (p.kind) {
      case "A3": {
        // 정상 파일: 게시된 code가 0건이어야 한다.
        if (codes === undefined) {
          a3[c.path] = "NOT_RUN";
          put("NOT_RUN", "결과가 없다");
        } else if (codes.size === 0) {
          a3[c.path] = "PASS";
          put("PASS", "게시된 code가 0건이다");
        } else {
          a3[c.path] = "FAIL";
          const found = [...codes].sort();
          put("FAIL", `정상 파일에 code가 ${found.length}건: ${listText(found)}`);
          designErrors.push(
            `${c.path}: 정상 파일의 게시 code가 0건이 아니다(대조 설계의 오류, 이 실행을 정상 기준으로 채택하지 않는다)`
          );
        }
        break;
      }
      case "A1": {
        if (codes === undefined) {
          a1[c.path] = "NOT_RUN";
          put("NOT_RUN", "결과가 없다");
          break;
        }
        const missing = c.required.filter((id) => !codes.has(id));
        a1[c.path] = missing.length === 0 ? "PASS" : "FAIL";
        put(
          a1[c.path],
          missing.length === 0
            ? `필수 ${c.required.length}개가 모두 게시됐다`
            : `필수 ID가 게시되지 않았다: ${listText(missing)}${codes.size === 0 ? " (이 파일의 진단이 0건이다)" : ""}`
        );
        break;
      }
      case "A2": {
        if (codes === undefined) {
          put("NOT_RUN", "결과가 없다");
          break;
        }
        const known = new Set([...c.required, ...c.allowed, ...c.forbidden]);
        const unexpected = [...codes].filter((id) => !known.has(id)).sort();
        put(
          unexpected.length === 0 ? "PASS" : "REVIEW",
          unexpected.length === 0
            ? "허용 밖의 ID가 없다"
            : `허용 밖의 ID(검토 필요): ${listText(unexpected)}`
        );
        break;
      }
      case "A4": {
        if (codes === undefined) {
          put("NOT_RUN", "결과가 없다");
          break;
        }
        const present = c.forbidden.filter((id) => codes.has(id));
        put(
          present.length === 0 ? "PASS" : "FAIL",
          present.length === 0 ? "금지 ID가 없다" : `금지 ID가 게시됐다: ${listText(present)}`
        );
        break;
      }
      case "PAIR": {
        // 정상 쌍: 양성이 A1을, 정상이 A3을 통과해야 한다. 쌍은 양성 쪽에서 한 번만 만든다.
        const partner = c.pair === null ? undefined : byPath.get(c.pair);
        if (!partner) {
          designErrors.push(`${c.path}: 짝 ${c.pair}가 기대 목록에 없다`);
          put("FAIL", `짝 ${c.pair}가 기대 목록에 없다`);
          break;
        }
        const positive = a1[c.path];
        const normal = a3[partner.path];
        if (positive === "PASS" && normal === "PASS") {
          put("PASS", "양성은 탐지됐고 정상은 0건이다");
        } else if (positive === "FAIL" || normal === "FAIL") {
          put("FAIL", `양성 A1 ${positive ?? "없음"}, 정상 A3 ${normal ?? "없음"}`);
        } else {
          put("NOT_RUN", `양성 A1 ${positive ?? "없음"}, 정상 A3 ${normal ?? "없음"}`);
        }
        break;
      }
    }
  }

  // 입력의 모순: 사례에서 센 code 수가 전체 묶음 합계를 넘을 수는 없다. 합계의 크기를 판정에 쓰지는 않는다.
  const counted = Object.values(observed.cases).reduce((sum, list) => sum + list.length, 0);
  if (observed.wholeBundleTotal !== null && counted > observed.wholeBundleTotal) {
    designErrors.push(
      `wholeBundleTotal(${observed.wholeBundleTotal})이 사례에서 센 code 수(${counted})보다 작다: 입력이 모순된다`
    );
  }

  const negatives = options.negativeControls
    ? options.negativeControls.map((n) => ({ ...n }))
    : defaultNegativeControls();

  return {
    applicable: true,
    status: summarizeControlAssertions({
      checks,
      negatives,
      designErrorCount: designErrors.length,
    }),
    checks,
    negative_controls: negatives,
    design_errors: designErrors,
  };
}
