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

  // 사례별 단언. PAIR가 쓸 수 있게 A1·A3 결과를 기억한다.
  const a1: Record<string, ControlCheck["status"]> = {};
  const a3: Record<string, ControlCheck["status"]> = {};

  for (const c of expectations.cases) {
    const codes = codesOf(c);
    const isNormal = c.kind === "normal" || c.expect_zero;

    if (isNormal) {
      if (codes === undefined) {
        a3[c.path] = "NOT_RUN";
        checks.push(check(`A3:${c.path}`, "A3", c.path, "NOT_RUN", "결과가 없다"));
      } else if (codes.size === 0) {
        a3[c.path] = "PASS";
        checks.push(check(`A3:${c.path}`, "A3", c.path, "PASS", "게시된 code가 0건이다"));
      } else {
        a3[c.path] = "FAIL";
        const found = [...codes].sort();
        checks.push(
          check(
            `A3:${c.path}`,
            "A3",
            c.path,
            "FAIL",
            `정상 파일에 code가 ${found.length}건: ${listText(found)}`
          )
        );
        designErrors.push(
          `${c.path}: 정상 파일의 게시 code가 0건이 아니다(대조 설계의 오류, 이 실행을 정상 기준으로 채택하지 않는다)`
        );
      }
      continue;
    }

    // 양성·nosource: A1(필수), A2(허용 밖), A4(금지).
    if (codes === undefined) {
      a1[c.path] = "NOT_RUN";
      checks.push(check(`A1:${c.path}`, "A1", c.path, "NOT_RUN", "결과가 없다"));
      checks.push(check(`A2:${c.path}`, "A2", c.path, "NOT_RUN", "결과가 없다"));
      if (c.forbidden.length > 0)
        checks.push(check(`A4:${c.path}`, "A4", c.path, "NOT_RUN", "결과가 없다"));
      continue;
    }
    const missing = c.required.filter((id) => !codes.has(id));
    a1[c.path] = missing.length === 0 ? "PASS" : "FAIL";
    checks.push(
      check(
        `A1:${c.path}`,
        "A1",
        c.path,
        a1[c.path],
        missing.length === 0
          ? `필수 ${c.required.length}개가 모두 게시됐다`
          : `필수 ID가 게시되지 않았다: ${listText(missing)}${codes.size === 0 ? " (이 파일의 진단이 0건이다)" : ""}`
      )
    );
    const known = new Set([...c.required, ...c.allowed, ...c.forbidden]);
    const unexpected = [...codes].filter((id) => !known.has(id)).sort();
    checks.push(
      check(
        `A2:${c.path}`,
        "A2",
        c.path,
        unexpected.length === 0 ? "PASS" : "REVIEW",
        unexpected.length === 0
          ? "허용 밖의 ID가 없다"
          : `허용 밖의 ID(검토 필요): ${listText(unexpected)}`
      )
    );
    if (c.forbidden.length > 0) {
      const present = c.forbidden.filter((id) => codes.has(id));
      checks.push(
        check(
          `A4:${c.path}`,
          "A4",
          c.path,
          present.length === 0 ? "PASS" : "FAIL",
          present.length === 0 ? "금지 ID가 없다" : `금지 ID가 게시됐다: ${listText(present)}`
        )
      );
    }
  }

  // 정상 쌍: 양성이 A1을, 정상이 A3을 통과해야 한다. 쌍은 양성 쪽에서 한 번만 만든다.
  for (const c of expectations.cases) {
    if (c.kind !== "positive" || c.pair === null) continue;
    const partner = byPath.get(c.pair);
    if (!partner) {
      designErrors.push(`${c.path}: 짝 ${c.pair}가 기대 목록에 없다`);
      checks.push(
        check(`PAIR:${c.family}`, "PAIR", c.path, "FAIL", `짝 ${c.pair}가 기대 목록에 없다`)
      );
      continue;
    }
    const positive = a1[c.path];
    const normal = a3[partner.path];
    let status: ControlCheck["status"];
    let detail: string;
    if (positive === "PASS" && normal === "PASS") {
      status = "PASS";
      detail = "양성은 탐지됐고 정상은 0건이다";
    } else if (positive === "FAIL" || normal === "FAIL") {
      status = "FAIL";
      detail = `양성 A1 ${positive ?? "없음"}, 정상 A3 ${normal ?? "없음"}`;
    } else {
      status = "NOT_RUN";
      detail = `양성 A1 ${positive ?? "없음"}, 정상 A3 ${normal ?? "없음"}`;
    }
    checks.push(check(`PAIR:${c.family}`, "PAIR", c.path, status, detail));
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

  // 전체 상태: FAIL(검사·음성 대조·설계 오류) > 일부 결과 없음 > REVIEW > 전부 결과 없음 > PASS.
  // NOT_RUN인 음성 대조는 막지 않는다(엔진이 필요한 것은 이 변경에서 실행하지 않는다) — FAIL인 음성 대조만 막는다.
  const noResultCount = expectations.cases.filter(
    (c) => observed.cases[c.path] === undefined
  ).length;
  let status: ControlAssertions["status"];
  if (
    checks.some((c) => c.status === "FAIL") ||
    negatives.some((n) => n.status === "FAIL") ||
    designErrors.length > 0
  ) {
    status = "FAIL";
  } else if (noResultCount > 0) {
    status = noResultCount === expectations.cases.length ? "NOT_RUN" : "FAIL";
  } else if (checks.some((c) => c.status === "REVIEW")) {
    status = "REVIEW_REQUIRED";
  } else {
    status = "PASS";
  }

  return {
    applicable: true,
    status,
    checks,
    negative_controls: negatives,
    design_errors: designErrors,
  };
}
