// SPEC-B2C-LAUNCH-001 M3b: 플래그 변경 절차 단계 모델 (REQ-B2CLAUNCH-011·012).
//
// 런북의 `## 플래그 변경 절차` 절이 담는 단계 표를 읽는다. 단계 하나는 환경을 바꾸는 재시작 한 번에 해당하며
// 대상 환경, 그 단계가 설정하는 변수(이름과 값), 재시작 횟수, 전 벡터와 후 벡터(spec.md §2.3의 어휘)를 적는다.
// 이 표는 구조만 담는다 — 변수 이름은 §2.3이 쓰는 여섯 개로 한정하고 시크릿 변수의 값은 `설정됨` 표지만
// 허용한다(값 금지, REQ-B2CLAUNCH-007). 오류 출력은 단계 번호와 칸 이름만 적고 칸의 값은 되풀이하지 않는다.

import { findTableWithExtras } from "./markdown-table";
import { splitCells } from "./stage-table";

/** 단계 표의 열. 헤더 줄과 같은 순서다. */
export const STEP_COLUMNS = [
  "단계",
  "대상 환경",
  "설정 변수",
  "재시작 횟수",
  "전 벡터",
  "후 벡터",
] as const;

/** 대상 환경: 운영 호스트, 운영과 분리된 환경(D-LAUNCH-01 (a)), 참여자의 로컬 실행(§2.4 "운영 호스트"). */
export const STEP_ENVIRONMENTS = ["운영 호스트", "별도 환경", "로컬"] as const;
export type StepEnvironment = (typeof STEP_ENVIRONMENTS)[number];

/** 결정 기록이 없어 적을 수 없는 값의 표지(spec.md §2.4의 `결정 대기`와 같은 말이다). */
export const PENDING_MARK = "결정 대기";
export const SECRET_VARIABLE = "RATE_LIMIT_HMAC_SECRET";
/** 시크릿 변수에 허용하는 유일한 값. 실제 값이 아니라 "설정함"이라는 표지다. */
export const SECRET_MARK = "설정됨";
/** §2.3의 5종 플래그. 값은 `true` 또는 `false`만 적는다(게이트는 정확히 `true`만 켜짐으로 읽는다). */
export const FLAG_VARIABLES: readonly string[] = [
  "ENABLE_DIAGNOSIS_FLOW",
  "DIAGNOSIS_ENGINE_READY",
  "ENABLE_DIAGNOSIS_DEV_STATES",
  "ENABLE_CONSULT_FLOW",
  "CONSULT_POLICY_READY",
];

const DIAGNOSIS_STATES = [
  "닫힘",
  "열림(production 경로)",
  "열림(review 경로)",
  "열림(둘 다)",
] as const;
const OPEN_STATES = ["닫힘", "열림"] as const;
const SECRET_STATES = ["설정됨", "설정되지 않음"] as const;

/** spec.md §2.3 "벡터와 전환": 진단 게이트(닫힘/열림 경로), 상담 화면, 상담 접수, 시크릿 설정 여부. */
export interface GateVector {
  diagnosis: string;
  screen: string;
  intake: string;
  secret: string;
}

export type StepVector =
  { kind: "vector"; vector: GateVector } | { kind: "pending" } | { kind: "unstated" };

export interface StepVariable {
  name: string;
  value: string;
}

export interface ProcedureStep {
  step: number;
  environment: StepEnvironment;
  variables: StepVariable[];
  restarts: number;
  before: StepVector;
  after: StepVector;
}

export type ProcedureStepsResult =
  { ok: true; steps: ProcedureStep[] } | { ok: false; errors: string[] };

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const alternatives = (words: readonly string[]) => words.map(escapeRegExp).join("|");

const VECTOR_PATTERN = new RegExp(
  `^진단 게이트: (${alternatives(DIAGNOSIS_STATES)}), ` +
    `상담 화면: (${alternatives(OPEN_STATES)}), ` +
    `상담 접수: (${alternatives(OPEN_STATES)}), ` +
    `시크릿: (${alternatives(SECRET_STATES)})$`
);

/** 네 칸을 정해진 순서로 모두 적은 벡터만 읽는다. 그 밖의 글은 벡터가 아니다(null). */
export function parseGateVector(text: string): GateVector | null {
  const match = VECTOR_PATTERN.exec(text);
  if (match === null) return null;
  return { diagnosis: match[1], screen: match[2], intake: match[3], secret: match[4] };
}

/** 벡터의 표준 글. 두 벡터가 같은지는 이 글이 같은지로 본다. */
export function vectorKey(vector: GateVector): string {
  return (
    `진단 게이트: ${vector.diagnosis}, 상담 화면: ${vector.screen}, ` +
    `상담 접수: ${vector.intake}, 시크릿: ${vector.secret}`
  );
}

function readVector(cell: string): StepVector {
  if (cell === PENDING_MARK) return { kind: "pending" };
  const vector = parseGateVector(cell);
  // 비어 있거나 어휘로 읽히지 않는 칸은 "적지 않음"이다 — 거부는 전환 점검기가 한다(AC-B2CLAUNCH-011 (라)).
  return vector === null ? { kind: "unstated" } : { kind: "vector", vector };
}

/** 설정 변수 칸을 읽는다. 오류가 있으면 errors에 적고 null을 돌려준다. */
function readVariables(cell: string, where: string, errors: string[]): StepVariable[] | null {
  const label = `${where}의 "설정 변수" 칸`;
  if (cell === "") {
    errors.push(`${label}이 비어 있다`);
    return null;
  }

  const variables: StepVariable[] = [];
  let valid = true;
  const fail = (message: string) => {
    errors.push(`${label}${message}`);
    valid = false;
  };

  for (const token of cell.split(",").map((part) => part.trim())) {
    const equals = token.indexOf("=");
    if (equals <= 0 || token.indexOf("=", equals + 1) !== -1) {
      fail("의 항목이 이름=값 형태가 아니다");
      continue;
    }
    const name = token.slice(0, equals).trim();
    const value = token.slice(equals + 1).trim();

    if (name !== SECRET_VARIABLE && !FLAG_VARIABLES.includes(name)) {
      fail("에 허용되지 않는 변수 이름이 있다");
    } else if (variables.some((variable) => variable.name === name)) {
      fail("에 같은 변수가 두 번 나온다");
    } else if (name === SECRET_VARIABLE && value !== SECRET_MARK) {
      fail(`에서 시크릿 값은 적지 않는다 — ${SECRET_MARK} 표지만 허용한다`);
    } else if (name !== SECRET_VARIABLE && value !== "true" && value !== "false") {
      fail("의 플래그 값이 true·false 중 하나가 아니다");
    } else {
      variables.push({ name, value });
    }
  }
  return valid ? variables : null;
}

export function parseProcedureSteps(markdown: string): ProcedureStepsResult {
  const table = findTableWithExtras(markdown.replace(/\r\n/g, "\n").split("\n"), STEP_COLUMNS);
  if (table === null) {
    return { ok: false, errors: [`단계 표(헤더: ${STEP_COLUMNS.join("·")})를 찾지 못했다`] };
  }
  if (table.extras.length > 0) {
    return {
      ok: false,
      errors: table.extras.map(
        (extra) =>
          `"${extra}" 칸은 허용되지 않는다 — 단계 표가 담는 칸은 ${STEP_COLUMNS.join("·")}뿐이다`
      ),
    };
  }
  if (table.body.length === 0) {
    return {
      ok: false,
      errors: ["단계가 하나도 없다 — 점검할 단계가 없는 절차를 통과로 읽지 않는다"],
    };
  }

  const errors: string[] = [];
  const steps: ProcedureStep[] = [];
  const seen = new Map<number, number>();

  table.body.forEach((line, index) => {
    const cells = splitCells(line);
    const ordinal = `${index + 1}번째 행`;
    if (cells.length !== table.width) {
      errors.push(`${ordinal}의 칸이 ${cells.length}개다(${table.width}개여야 한다)`);
      return;
    }

    const stepNumber = /^[1-9]\d*$/.test(cells[0]) ? Number(cells[0]) : null;
    const rowErrors: string[] = [];
    if (stepNumber === null) {
      rowErrors.push(`${ordinal}의 "단계" 칸이 양의 정수가 아니다`);
    } else {
      seen.set(stepNumber, (seen.get(stepNumber) ?? 0) + 1);
    }
    const where = stepNumber === null ? ordinal : `단계 ${stepNumber}`;

    const environment = cells[1];
    const environmentValid = (STEP_ENVIRONMENTS as readonly string[]).includes(environment);
    if (!environmentValid) {
      rowErrors.push(`${where}의 "대상 환경" 칸이 ${STEP_ENVIRONMENTS.join("·")} 중 하나가 아니다`);
    }

    const variables = readVariables(cells[2], where, rowErrors);

    const restarts = /^\d+$/.test(cells[3]) ? Number(cells[3]) : null;
    if (restarts === null) {
      rowErrors.push(`${where}의 "재시작 횟수" 칸이 음이 아닌 정수가 아니다`);
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      return;
    }
    steps.push({
      step: stepNumber as number,
      environment: environment as StepEnvironment,
      variables: variables as StepVariable[],
      restarts: restarts as number,
      before: readVector(cells[4]),
      after: readVector(cells[5]),
    });
  });

  for (const [stepNumber, count] of seen) {
    if (count > 1) errors.push(`단계 ${stepNumber}이 ${count}번 나온다`);
  }
  return errors.length === 0 ? { ok: true, steps } : { ok: false, errors };
}
