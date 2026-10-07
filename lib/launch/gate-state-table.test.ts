import { describe, expect, it } from "vitest";

import {
  BOOT_COLUMNS,
  CONSULT_COLUMNS,
  DIAGNOSIS_COLUMNS,
  compareGateStateTables,
  parseGateStateTables,
  type GateStateTables,
} from "./gate-state-table";
import { GATE_STATE_FIXTURE } from "./gate-state-table.fixture";

// SPEC-B2C-LAUNCH-001 M3a — 게이트 상태 표 파서와 대조 함수의 단위 시험. 런북 실물과의 대조는
// lib/diagnosis/flags.gate-table.test.ts가 하고, 여기서는 합성한 마크다운으로 거부 규칙을 고정한다.

const bit = (value: boolean) => (value ? "1" : "0");
const truth = (value: boolean) => (value ? "참" : "거짓");

function table(columns: readonly string[], rows: string[][]): string[] {
  return [
    `| ${columns.join(" | ")} |`,
    `|${columns.map(() => "---").join("|")}|`,
    ...rows.map((cells) => `| ${cells.join(" | ")} |`),
    "",
  ];
}

function diagnosisRows(tables: GateStateTables): string[][] {
  return tables.diagnosis.map((r) => [
    bit(r.f),
    bit(r.e),
    bit(r.d),
    truth(r.productionReady),
    truth(r.reviewEnabled),
    r.gate,
    r.home,
    r.result,
    r.mark,
  ]);
}

function consultRows(tables: GateStateTables): string[][] {
  return tables.consult.map((r) => [bit(r.c), bit(r.p), r.screen, r.intake, r.consult, r.post]);
}

function bootRows(tables: GateStateTables): string[][] {
  return tables.boot.map((r) => [bit(r.p), bit(r.s), r.boot]);
}

function markdown(
  edit: (rows: { diagnosis: string[][]; consult: string[][]; boot: string[][] }) => void = () => {}
): string {
  const rows = {
    diagnosis: diagnosisRows(GATE_STATE_FIXTURE),
    consult: consultRows(GATE_STATE_FIXTURE),
    boot: bootRows(GATE_STATE_FIXTURE),
  };
  edit(rows);
  return [
    "앞 문단",
    "",
    ...table(DIAGNOSIS_COLUMNS, rows.diagnosis),
    ...table(CONSULT_COLUMNS, rows.consult),
    ...table(BOOT_COLUMNS, rows.boot),
    "뒤 문단",
  ].join("\n");
}

function errorsOf(md: string): string[] {
  const result = parseGateStateTables(md);
  expect(result.ok, "오류가 있어야 하는 표가 통과했다").toBe(false);
  return result.ok ? [] : result.errors;
}

describe("parseGateStateTables", () => {
  it("합성한 표를 읽어 기대값과 같은 행을 돌려준다", () => {
    const result = parseGateStateTables(markdown());

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.tables).toEqual(GATE_STATE_FIXTURE);
  });

  it("CRLF 줄바꿈도 같은 결과로 읽는다", () => {
    const result = parseGateStateTables(markdown().replace(/\n/g, "\r\n"));

    expect(result.ok).toBe(true);
  });

  it("표 하나가 없으면 그 표의 헤더를 적어 거부한다", () => {
    const md = markdown()
      .split("\n")
      .filter((line) => !line.startsWith("| P | S |"))
      .join("\n");

    const errors = errorsOf(md);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("부팅");
    expect(errors[0]).toContain("찾지 못했다");
  });

  it("칸 수가 맞지 않는 행은 행 번호를 적어 거부한다", () => {
    const errors = errorsOf(
      markdown((rows) => {
        rows.diagnosis[2] = rows.diagnosis[2].slice(0, 5);
      })
    );

    expect(errors).toEqual([expect.stringContaining("진단 게이트 표 3번째 행")]);
  });

  it("플래그 칸이 0·1이 아니면 칸 이름을 적고 값을 되풀이하지 않는다", () => {
    const errors = errorsOf(
      markdown((rows) => {
        rows.diagnosis[0][0] = "TRUE";
      })
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"F"');
    expect(errors.join("|")).not.toContain("TRUE");
  });

  it("참·거짓 칸이 그 밖의 값이면 거부한다", () => {
    const errors = errorsOf(
      markdown((rows) => {
        rows.diagnosis[0][3] = "아마도";
      })
    );

    expect(errors[0]).toContain('"productionReady"');
    expect(errors.join("|")).not.toContain("아마도");
  });

  it("비어 있는 문자 칸은 거부한다", () => {
    const errors = errorsOf(
      markdown((rows) => {
        rows.consult[0][4] = "";
      })
    );

    expect(errors[0]).toContain('"`/consult`"');
    expect(errors[0]).toContain("비어 있다");
  });

  it("조합이 빠진 표는 빠진 조합을 적어 거부한다", () => {
    const errors = errorsOf(
      markdown((rows) => {
        rows.diagnosis.splice(6, 1);
      })
    );

    expect(errors).toEqual([expect.stringContaining("F1E1D0")]);
  });

  it("같은 조합이 두 번 나오면 거부한다", () => {
    const errors = errorsOf(
      markdown((rows) => {
        rows.boot.push([...rows.boot[0]]);
      })
    );

    expect(errors).toEqual([expect.stringContaining("P0S0")]);
    expect(errors[0]).toContain("2번");
  });
});

describe("compareGateStateTables", () => {
  it("같은 표끼리는 불일치가 없다", () => {
    expect(compareGateStateTables(GATE_STATE_FIXTURE, GATE_STATE_FIXTURE)).toEqual([]);
  });

  it("칸이 다르면 표 이름·조합·칸 이름을 적고 값은 되풀이하지 않는다", () => {
    const altered = structuredClone(GATE_STATE_FIXTURE);
    altered.boot[2].boot = "가능";

    const mismatches = compareGateStateTables(altered, GATE_STATE_FIXTURE);

    expect(mismatches).toEqual(['부팅 표 P1S0 행의 "부팅" 칸이 기대와 다르다']);
  });

  it("실제 표에 없는 조합과 기대 목록에 없는 조합을 모두 적는다", () => {
    const altered = structuredClone(GATE_STATE_FIXTURE);
    altered.consult = altered.consult.slice(0, 3);

    const missing = compareGateStateTables(altered, GATE_STATE_FIXTURE);
    const extra = compareGateStateTables(GATE_STATE_FIXTURE, altered);

    expect(missing).toEqual([expect.stringContaining("C1P1 행이 없다")]);
    expect(extra).toEqual([expect.stringContaining("C1P1 행은 기대 목록에 없다")]);
  });
});
