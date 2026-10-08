// SPEC-B2C-LAUNCH-001 M3c: 교차 조합 세 가지의 기대 도달 상태 선택과 관측 대조 (REQ-B2CLAUNCH-010,
// AC-B2CLAUNCH-010 시나리오 3).
//
// `pnpm verify:flag-runtime`이 보지 못하는 교차 조합(진단 게이트 × 상담 플래그)을 로컬 서버로 시작해 `/`, `/result`,
// `/consult`와 접수 API의 도달 상태를 읽고 spec.md §2.3의 경로별 도달 규칙과 대조한다. 이 모듈은 서버를 시작하지
// 않는 순수 로직이다. 기대값은 호출하는 쪽이 넘기는 표(독립된 fixture)에서만 고르며 두 게이트 함수를 호출해 만들지
// 않는다 — 표와 함수 출력이 어긋나는 것을 이 대조가 잡아야 하기 때문이다.

import type { ConsultGateRow, DiagnosisGateRow, GateStateTables } from "./gate-state-table";

/** 경로가 본 화면(open)인지 placeholder인지. */
export type ReachState = "open" | "placeholder";
/** 관측에서 읽은 도달 상태. 신호가 모호하면 unknown이고 어떤 기대와도 같지 않다. */
export type ObservedReach = ReachState | "unknown";

export interface CrossCombination {
  /** 출력에 쓰는 이름(AC 문구). */
  label: string;
  /** 진단 표의 조합 키(F·E·D). */
  diagnosisKey: string;
  /** 조합이 말하는 진단 게이트 표지 — 키가 엉뚱한 행을 가리키는 실수를 막는다. */
  diagnosisGate: string;
  /** 상담 표의 조합 키(C·P). */
  consultKey: string;
}

/** AC-B2CLAUNCH-010 시나리오 3이 적은 교차 조합 세 가지(현재 8개 시작 조합에 없다, LF-11). */
export const CROSS_COMBINATIONS: readonly CrossCombination[] = [
  {
    label: "진단 production 경로 열림 × 상담 C=참·P=참",
    diagnosisKey: "F1E1D0",
    diagnosisGate: "열림(production 경로)",
    consultKey: "C1P1",
  },
  {
    label: "진단 닫힘 × 상담 C=참·P=참",
    diagnosisKey: "F0E0D0",
    diagnosisGate: "닫힘",
    consultKey: "C1P1",
  },
  {
    label: "진단 닫힘 × 상담 C=거짓·P=참",
    diagnosisKey: "F0E0D0",
    diagnosisGate: "닫힘",
    consultKey: "C0P1",
  },
];

export interface CrossCombinationPlan {
  label: string;
  diagnosisKey: string;
  consultKey: string;
  /** 서버 시작에 쓰는 플래그 값(표의 조합 키에서 읽은 것). */
  flags: {
    diag: { flow: boolean; engine: boolean; dev: boolean };
    consult: boolean;
    policy: boolean;
  };
  /** 표에서 읽은 경로별 기대 도달 상태. */
  expected: {
    home: ReachState;
    result: ReachState;
    consult: ReachState;
    /** 접수 API가 503(정책 미준비)이어야 하는가. */
    intakeUnavailable: boolean;
  };
}

export type CrossPlanResult =
  { ok: true; plans: CrossCombinationPlan[] } | { ok: false; errors: string[] };

export interface CrossObservation {
  home: ObservedReach;
  result: ObservedReach;
  consult: ObservedReach;
  apiStatus: number;
  apiCode: string | null;
  rowsBefore: number;
  rowsAfter: number;
}

export interface PathCheck {
  path: string;
  expected: string;
  observed: string;
  ok: boolean;
}

const DIAGNOSIS_KEY = /^F([01])E([01])D([01])$/;
const CONSULT_KEY = /^C([01])P([01])$/;

// 표 칸의 어휘(spec.md §2.3 경로별 도달 칸)와 도달 상태의 대응. 어휘 밖의 값은 읽지 않고 거부한다.
const REACH_WORDS: ReadonlyMap<string, ReachState> = new Map<string, ReachState>([
  ["본 화면", "open"],
  ["placeholder", "placeholder"],
]);
// 접수 칸의 어휘와 "503이어야 하는가"의 대응.
const INTAKE_WORDS: ReadonlyMap<string, boolean> = new Map<string, boolean>([
  ["503", true],
  ["503 아님", false],
]);

const REACH_LABEL: Readonly<Record<ObservedReach, string>> = {
  open: "본 화면",
  placeholder: "placeholder",
  unknown: "unknown",
};

function findDiagnosisRow(
  tables: GateStateTables,
  key: string
): DiagnosisGateRow | null | undefined {
  const match = DIAGNOSIS_KEY.exec(key);
  if (match === null) return undefined;
  const [f, e, d] = [match[1] === "1", match[2] === "1", match[3] === "1"];
  return tables.diagnosis.find((row) => row.f === f && row.e === e && row.d === d) ?? null;
}

function findConsultRow(tables: GateStateTables, key: string): ConsultGateRow | null | undefined {
  const match = CONSULT_KEY.exec(key);
  if (match === null) return undefined;
  const [c, p] = [match[1] === "1", match[2] === "1"];
  return tables.consult.find((row) => row.c === c && row.p === p) ?? null;
}

function planOne(
  tables: GateStateTables,
  combination: CrossCombination,
  errors: string[]
): CrossCombinationPlan | null {
  const where = combination.label;
  const diagnosisRow = findDiagnosisRow(tables, combination.diagnosisKey);
  const consultRow = findConsultRow(tables, combination.consultKey);
  const before = errors.length;

  if (diagnosisRow === undefined) errors.push(`${where}: 진단 조합 키 형식이 아니다`);
  else if (diagnosisRow === null) {
    errors.push(`${where}: 진단 표에 ${combination.diagnosisKey} 행이 없다`);
  } else if (diagnosisRow.gate !== combination.diagnosisGate) {
    errors.push(
      `${where}: 진단 ${combination.diagnosisKey} 행의 게이트 표지가 조합이 말한 값과 다르다`
    );
  }
  if (consultRow === undefined) errors.push(`${where}: 상담 조합 키 형식이 아니다`);
  else if (consultRow === null)
    errors.push(`${where}: 상담 표에 ${combination.consultKey} 행이 없다`);

  if (!diagnosisRow || !consultRow) return null;

  const home = REACH_WORDS.get(diagnosisRow.home);
  const result = REACH_WORDS.get(diagnosisRow.result);
  const consult = REACH_WORDS.get(consultRow.consult);
  const post = INTAKE_WORDS.get(consultRow.post);
  if (home === undefined) errors.push(`${where}: 진단 표 "/" 칸이 알려진 어휘가 아니다`);
  if (result === undefined) errors.push(`${where}: 진단 표 "/result" 칸이 알려진 어휘가 아니다`);
  if (consult === undefined) errors.push(`${where}: 상담 표 "/consult" 칸이 알려진 어휘가 아니다`);
  if (post === undefined) {
    errors.push(`${where}: 상담 표 "POST /api/consultations" 칸이 알려진 어휘가 아니다`);
  }
  if (
    errors.length > before ||
    home === undefined ||
    result === undefined ||
    consult === undefined ||
    post === undefined
  ) {
    return null;
  }

  return {
    label: combination.label,
    diagnosisKey: combination.diagnosisKey,
    consultKey: combination.consultKey,
    flags: {
      diag: { flow: diagnosisRow.f, engine: diagnosisRow.e, dev: diagnosisRow.d },
      consult: consultRow.c,
      policy: consultRow.p,
    },
    expected: { home, result, consult, intakeUnavailable: post },
  };
}

/**
 * 조합마다 표(독립된 기대값)에서 시작 플래그와 경로별 기대 도달 상태를 고른다. 키 형식 오류·없는 행·게이트 표지
 * 불일치·알려진 어휘 밖의 칸은 모두 오류로 알리고 계획을 만들지 않는다(fail-closed). 오류는 칸의 값을 되풀이하지
 * 않는다.
 */
export function planCrossCombinations(
  tables: GateStateTables,
  combinations: readonly CrossCombination[] = CROSS_COMBINATIONS
): CrossPlanResult {
  const errors: string[] = [];
  const plans: CrossCombinationPlan[] = [];
  for (const combination of combinations) {
    const plan = planOne(tables, combination, errors);
    if (plan !== null) plans.push(plan);
  }
  return errors.length === 0 ? { ok: true, plans } : { ok: false, errors };
}

/** 게이트 판독(open·closed·unknown)을 도달 상태로 옮긴다. 그 밖의 값은 unknown이다. */
export function reachFromGate(gate: string): ObservedReach {
  if (gate === "open") return "open";
  if (gate === "closed") return "placeholder";
  return "unknown";
}

const CONSULT_OPEN_TITLE = "상담 신청";
const CONSULT_CLOSED_TITLE = "서비스 준비 중";

/** `/consult`는 제목과 placeholder 문구가 서로 반대로 맞을 때만 확정한다. */
export function readConsultReach(title: string | null, hasPlaceholder: boolean): ObservedReach {
  if (title === CONSULT_OPEN_TITLE && !hasPlaceholder) return "open";
  if (title === CONSULT_CLOSED_TITLE && hasPlaceholder) return "placeholder";
  return "unknown";
}

function intakeObservedLabel(status: number): string {
  if (status === 503) return "503";
  // 503이 아닌 서버 오류는 접수가 열려 있다는 증거가 아니다(SPEC은 이 경우를 말하지 않아 fail-closed로 닫았다).
  if (status >= 500) return `서버 오류(${status})`;
  return "503 아님";
}

/** 한 조합의 네 경로를 기대와 비교한 결과. */
export function checkCrossObservation(
  plan: CrossCombinationPlan,
  observed: CrossObservation
): PathCheck[] {
  const reach = (path: string, expected: ReachState, got: ObservedReach): PathCheck => ({
    path,
    expected: REACH_LABEL[expected],
    observed: REACH_LABEL[got],
    ok: got === expected,
  });
  const intakeOk = plan.expected.intakeUnavailable
    ? observed.apiStatus === 503
    : observed.apiStatus !== 503 && observed.apiStatus < 500;
  return [
    reach("/", plan.expected.home, observed.home),
    reach("/result", plan.expected.result, observed.result),
    reach("/consult", plan.expected.consult, observed.consult),
    {
      path: "POST /api/consultations",
      expected: plan.expected.intakeUnavailable ? "503" : "503 아님",
      observed: intakeObservedLabel(observed.apiStatus),
      ok: intakeOk,
    },
  ];
}

/** 기대와 다른 경로를 한국어 한 줄씩 돌려준다. 빈 배열이면 네 경로가 모두 기대와 같다. */
export function crossMismatches(checks: readonly PathCheck[]): string[] {
  return checks
    .filter((check) => !check.ok)
    .map((check) => `${check.path}: 기대 ${check.expected} / 관측 ${check.observed}`);
}

/** 관측과 기대를 경로마다 한 줄씩 보여 주는 출력. 시크릿·DB 경로는 적지 않는다. */
export function formatCrossReport(
  plan: CrossCombinationPlan,
  observed: CrossObservation
): string[] {
  const verdict = (ok: boolean) => (ok ? "OK" : "MISMATCH");
  return [
    `### ${plan.label}`,
    `시작 조합: 진단 ${plan.diagnosisKey} · 상담 ${plan.consultKey}`,
    ...checkCrossObservation(plan, observed).map(
      (check) =>
        `- ${check.path}: 기대 ${check.expected} / 관측 ${check.observed} ${verdict(check.ok)}`
    ),
    `- 접수 응답 상세(참고, 판정 아님): 상태 ${observed.apiStatus}, 오류 코드 ${observed.apiCode ?? "(없음)"}, ` +
      `consultations 행 수 전 ${observed.rowsBefore} 후 ${observed.rowsAfter}`,
  ];
}
