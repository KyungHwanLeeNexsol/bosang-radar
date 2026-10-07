// SPEC-B2C-LAUNCH-001 M3a: 게이트 상태 표 읽기·대조 (REQ-B2CLAUNCH-010, AC-B2CLAUNCH-010).
// 런북(.moai/docs/launch-gate-runbook.md)의 `## 게이트 상태 표` 절이 담는 표 셋(진단 게이트 8행, 상담 게이트
// 4행, 시크릿 설정 여부와 부팅 4행)을 읽고, 독립된 기대값 또는 함수 출력에서 만든 표와 칸 단위로 대조한다.
// 이 모듈은 기대값을 만들지 않는다 — 표를 함수 출력에서 생성하면 표와 함수가 같이 틀려도 일치하기 때문이다.

import { findTableBody } from "./markdown-table";
import { splitCells } from "./stage-table";

export const DOC_FORBIDDEN_MARK = "문서 금지(D)";
export const NO_MARK = "-";
export const BOOT_IMPOSSIBLE = "부팅 불가";
export const BOOT_POSSIBLE = "가능";

export interface DiagnosisGateRow {
  f: boolean;
  e: boolean;
  d: boolean;
  productionReady: boolean;
  reviewEnabled: boolean;
  gate: string;
  home: string;
  result: string;
  mark: string;
}

export interface ConsultGateRow {
  c: boolean;
  p: boolean;
  screen: string;
  intake: string;
  consult: string;
  post: string;
}

export interface BootRow {
  p: boolean;
  s: boolean;
  boot: string;
}

export interface GateStateTables {
  diagnosis: DiagnosisGateRow[];
  consult: ConsultGateRow[];
  boot: BootRow[];
}

export type GateStateTablesResult =
  { ok: true; tables: GateStateTables } | { ok: false; errors: string[] };

/** 칸 종류: bit는 1·0, truth는 참·거짓, text는 비어 있지 않은 문자열. */
type FieldKind = "bit" | "truth" | "text";

interface Field<Row extends object> {
  key: keyof Row & string;
  label: string;
  kind: FieldKind;
}

const DIAGNOSIS_FIELDS: ReadonlyArray<Field<DiagnosisGateRow>> = [
  { key: "f", label: "F", kind: "bit" },
  { key: "e", label: "E", kind: "bit" },
  { key: "d", label: "D", kind: "bit" },
  { key: "productionReady", label: "productionReady", kind: "truth" },
  { key: "reviewEnabled", label: "reviewEnabled", kind: "truth" },
  { key: "gate", label: "진단 게이트", kind: "text" },
  { key: "home", label: "`/`", kind: "text" },
  { key: "result", label: "`/result`", kind: "text" },
  { key: "mark", label: "표시", kind: "text" },
];

const CONSULT_FIELDS: ReadonlyArray<Field<ConsultGateRow>> = [
  { key: "c", label: "C", kind: "bit" },
  { key: "p", label: "P", kind: "bit" },
  { key: "screen", label: "상담 화면", kind: "text" },
  { key: "intake", label: "상담 접수", kind: "text" },
  { key: "consult", label: "`/consult`", kind: "text" },
  { key: "post", label: "`POST /api/consultations`", kind: "text" },
];

const BOOT_FIELDS: ReadonlyArray<Field<BootRow>> = [
  { key: "p", label: "P", kind: "bit" },
  { key: "s", label: "S", kind: "bit" },
  { key: "boot", label: "부팅", kind: "text" },
];

/** 표 머리글. 런북 `## 게이트 상태 표` 절의 세 표가 이 헤더 줄을 가진다. */
export const DIAGNOSIS_COLUMNS = DIAGNOSIS_FIELDS.map((field) => field.label);
export const CONSULT_COLUMNS = CONSULT_FIELDS.map((field) => field.label);
export const BOOT_COLUMNS = BOOT_FIELDS.map((field) => field.label);

const bit = (value: boolean) => (value ? "1" : "0");

// 조합 식별자(오류 출력에 쓴다): 칸 값이 아니라 조합 자체의 이름이다.
const diagnosisKey = (row: DiagnosisGateRow) => `F${bit(row.f)}E${bit(row.e)}D${bit(row.d)}`;
const consultKey = (row: ConsultGateRow) => `C${bit(row.c)}P${bit(row.p)}`;
const bootKey = (row: BootRow) => `P${bit(row.p)}S${bit(row.s)}`;

function combinations(names: readonly string[]): string[] {
  return names.reduce<string[]>(
    (keys, name) => keys.flatMap((key) => [`${key}${name}0`, `${key}${name}1`]),
    [""]
  );
}

function readCell(kind: FieldKind, cell: string): boolean | string | null {
  if (kind === "bit") return cell === "1" ? true : cell === "0" ? false : null;
  if (kind === "truth") return cell === "참" ? true : cell === "거짓" ? false : null;
  return cell === "" ? null : cell;
}

const KIND_HINT: Record<FieldKind, string> = {
  bit: "1·0이 아니다",
  truth: "참·거짓이 아니다",
  text: "비어 있다",
};

interface TableSpec<Row extends object> {
  title: string;
  fields: ReadonlyArray<Field<Row>>;
  keyOf: (row: Row) => string;
  /** 표가 담아야 하는 조합 이름 순서(F·E·D 등). */
  flagNames: readonly string[];
}

function parseTable<Row extends object>(
  lines: string[],
  spec: TableSpec<Row>,
  errors: string[]
): Row[] {
  const labels = spec.fields.map((field) => field.label);
  const body = findTableBody(lines, labels);
  if (body === null) {
    errors.push(`${spec.title} 표(헤더: ${labels.join("·")})를 찾지 못했다`);
    return [];
  }

  const rows: Row[] = [];
  const rowErrors: string[] = [];
  body.forEach((line, index) => {
    const cells = splitCells(line);
    const where = `${spec.title} 표 ${index + 1}번째 행`;
    if (cells.length !== spec.fields.length) {
      rowErrors.push(`${where}의 칸이 ${cells.length}개다(${spec.fields.length}개여야 한다)`);
      return;
    }
    const row: Record<string, boolean | string> = {};
    let valid = true;
    spec.fields.forEach((field, i) => {
      const value = readCell(field.kind, cells[i]);
      if (value === null) {
        rowErrors.push(`${where}의 "${field.label}" 칸이 ${KIND_HINT[field.kind]}`);
        valid = false;
      } else {
        row[field.key] = value;
      }
    });
    if (valid) rows.push(row as Row);
  });
  errors.push(...rowErrors);

  // 행 오류가 있으면 빠진 조합도 같이 알리지 않는다(같은 행이 두 번 보고되는 것을 막는다).
  if (rowErrors.length === 0) {
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(spec.keyOf(row), (counts.get(spec.keyOf(row)) ?? 0) + 1);
    for (const key of combinations(spec.flagNames)) {
      if (!counts.has(key)) errors.push(`${spec.title} 표에 ${key} 조합이 없다`);
    }
    for (const [key, count] of counts) {
      if (count > 1) errors.push(`${spec.title} 표에 ${key} 조합이 ${count}번 나온다`);
    }
  }
  return rows;
}

const DIAGNOSIS_SPEC: TableSpec<DiagnosisGateRow> = {
  title: "진단 게이트",
  fields: DIAGNOSIS_FIELDS,
  keyOf: diagnosisKey,
  flagNames: ["F", "E", "D"],
};
const CONSULT_SPEC: TableSpec<ConsultGateRow> = {
  title: "상담 게이트",
  fields: CONSULT_FIELDS,
  keyOf: consultKey,
  flagNames: ["C", "P"],
};
const BOOT_SPEC: TableSpec<BootRow> = {
  title: "부팅",
  fields: BOOT_FIELDS,
  keyOf: bootKey,
  flagNames: ["P", "S"],
};

export function parseGateStateTables(markdown: string): GateStateTablesResult {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const errors: string[] = [];
  const diagnosis = parseTable(lines, DIAGNOSIS_SPEC, errors);
  const consult = parseTable(lines, CONSULT_SPEC, errors);
  const boot = parseTable(lines, BOOT_SPEC, errors);
  return errors.length === 0
    ? { ok: true, tables: { diagnosis, consult, boot } }
    : { ok: false, errors };
}

function diffTable<Row extends object>(
  spec: TableSpec<Row>,
  actual: readonly Row[],
  expected: readonly Row[]
): string[] {
  const mismatches: string[] = [];
  const actualByKey = new Map(actual.map((row) => [spec.keyOf(row), row]));
  const expectedKeys = new Set(expected.map(spec.keyOf));

  for (const want of expected) {
    const key = spec.keyOf(want);
    const got = actualByKey.get(key);
    if (got === undefined) {
      mismatches.push(`${spec.title} 표 ${key} 행이 없다`);
      continue;
    }
    for (const field of spec.fields) {
      if (got[field.key] !== want[field.key]) {
        mismatches.push(`${spec.title} 표 ${key} 행의 "${field.label}" 칸이 기대와 다르다`);
      }
    }
  }
  for (const key of actualByKey.keys()) {
    if (!expectedKeys.has(key)) mismatches.push(`${spec.title} 표 ${key} 행은 기대 목록에 없다`);
  }
  return mismatches;
}

/**
 * 실제 표(런북에서 읽은 것 또는 함수 출력으로 관측한 것)를 기대 표와 칸 단위로 대조한다. 불일치는 표 이름·조합·
 * 칸 이름으로만 적고 칸의 값은 되풀이하지 않는다. 빈 배열이면 같다.
 */
export function compareGateStateTables(
  actual: GateStateTables,
  expected: GateStateTables
): string[] {
  return [
    ...diffTable(DIAGNOSIS_SPEC, actual.diagnosis, expected.diagnosis),
    ...diffTable(CONSULT_SPEC, actual.consult, expected.consult),
    ...diffTable(BOOT_SPEC, actual.boot, expected.boot),
  ];
}
