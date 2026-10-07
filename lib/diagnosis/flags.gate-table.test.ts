import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { findTableBody } from "../launch/markdown-table";
import { splitCells } from "../launch/stage-table";
import {
  DOC_FORBIDDEN_MARK,
  NO_MARK,
  compareGateStateTables,
  parseGateStateTables,
  type ConsultGateRow,
  type DiagnosisGateRow,
  type GateStateTables,
} from "../launch/gate-state-table";
import { GATE_STATE_FIXTURE } from "../launch/gate-state-table.fixture";
import { computeConsultFlags, computeDiagnosisFlags } from "./flags";

// SPEC-B2C-LAUNCH-001 M3a (REQ-B2CLAUNCH-010, AC-B2CLAUNCH-010 시나리오 1) — 런북의 게이트 상태 표가 두 게이트
// 함수의 출력과 같은지 대조한다. 기대값은 함수를 호출해 만들지 않고 spec.md §2.3을 옮긴 독립 리터럴
// (GATE_STATE_FIXTURE)이다. 표(런북)와 함수 출력을 각각 그 기대값과 비교하므로 어느 쪽이 어긋나도 실패한다.

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RUNBOOK = readFileSync(join(REPO_ROOT, ".moai", "docs", "launch-gate-runbook.md"), "utf-8");
const SPEC = readFileSync(
  join(REPO_ROOT, ".moai", "specs", "SPEC-B2C-LAUNCH-001", "spec.md"),
  "utf-8"
);

function flag(value: boolean): string | undefined {
  return value ? "true" : undefined;
}

type ComputeDiagnosis = typeof computeDiagnosisFlags;
type ComputeConsult = typeof computeConsultFlags;

// 함수 출력(참/거짓)을 표의 칸 값으로 옮기는 규칙은 spec.md §2.3의 표 머리글과 "경로별 도달 규칙"이 정한 것이다.
function gateLabel(out: ReturnType<ComputeDiagnosis>): string {
  if (!out.shouldRenderDiagnosis) return "닫힘";
  if (out.productionReady && out.reviewEnabled) return "열림(둘 다)";
  return out.productionReady ? "열림(production 경로)" : "열림(review 경로)";
}

// 입력 조합은 기대값 리터럴이 정한 행의 F·E·D·C·P 값이고, 출력 칸은 오직 함수가 돌려준 값에서만 읽는다.
function observeFromFunctions(
  expected: GateStateTables,
  computeDiagnosis: ComputeDiagnosis,
  computeConsult: ComputeConsult
): Pick<GateStateTables, "diagnosis" | "consult"> {
  const diagnosis = expected.diagnosis.map((row): DiagnosisGateRow => {
    const out = computeDiagnosis({
      ENABLE_DIAGNOSIS_FLOW: flag(row.f),
      DIAGNOSIS_ENGINE_READY: flag(row.e),
      ENABLE_DIAGNOSIS_DEV_STATES: flag(row.d),
    });
    const reach = out.shouldRenderDiagnosis ? "본 화면" : "placeholder";
    return {
      f: row.f,
      e: row.e,
      d: row.d,
      productionReady: out.productionReady,
      reviewEnabled: out.reviewEnabled,
      gate: gateLabel(out),
      home: reach,
      result: reach,
      // 문서 금지 표시는 D가 참인 조합에 붙는다(운영 호스트에서 D는 true가 아니어야 한다 — spec.md §2.3). 이것은
      // 함수 출력이 아니라 문서 규칙이라 입력 D에서 정한다.
      mark: row.d ? DOC_FORBIDDEN_MARK : NO_MARK,
    };
  });
  const consult = expected.consult.map((row): ConsultGateRow => {
    const out = computeConsult({
      ENABLE_CONSULT_FLOW: flag(row.c),
      CONSULT_POLICY_READY: flag(row.p),
    });
    return {
      c: row.c,
      p: row.p,
      screen: out.shouldRenderConsult ? "열림" : "닫힘",
      intake: out.isPolicyReady ? "열림" : "닫힘(503)",
      consult: out.shouldRenderConsult ? "본 화면" : "placeholder",
      post: out.isPolicyReady ? "503 아님" : "503",
    };
  });
  return { diagnosis, consult };
}

function parsedRunbook(markdown: string = RUNBOOK): GateStateTables {
  const result = parseGateStateTables(markdown);
  expect(result.ok, "런북의 게이트 상태 표가 파서를 통과해야 한다").toBe(true);
  return result.ok ? result.tables : { diagnosis: [], consult: [], boot: [] };
}

describe("AC-B2CLAUNCH-010 시나리오 1 — 런북 게이트 상태 표 대 독립 기대값", () => {
  it("런북의 게이트 상태 표가 파서를 통과한다(진단 8행·상담 4행·부팅 4행)", () => {
    const tables = parsedRunbook();

    expect(tables.diagnosis).toHaveLength(8);
    expect(tables.consult).toHaveLength(4);
    expect(tables.boot).toHaveLength(4);
  });

  it("런북 표의 12행 모두 기대값과 같다(진단 8 + 상담 4)", () => {
    expect(compareGateStateTables(parsedRunbook(), GATE_STATE_FIXTURE)).toEqual([]);
  });

  it("런북 표가 부팅 불가 조합(P=1, S 없음)과 문서 금지 조합(D=1)을 표시한다", () => {
    const tables = parsedRunbook();

    expect(tables.boot.filter((row) => row.boot !== "가능").map((row) => [row.p, row.s])).toEqual([
      [true, false],
    ]);
    expect(
      tables.diagnosis.filter((row) => row.mark === DOC_FORBIDDEN_MARK).map((row) => row.d)
    ).toEqual([true, true, true, true]);
  });
});

describe("AC-B2CLAUNCH-010 시나리오 1 — 함수 출력 대 독립 기대값", () => {
  it("진단 조합 8개와 상담 조합 4개의 함수 출력이 기대값과 같다", () => {
    const observed = observeFromFunctions(
      GATE_STATE_FIXTURE,
      computeDiagnosisFlags,
      computeConsultFlags
    );

    expect(
      compareGateStateTables({ ...observed, boot: GATE_STATE_FIXTURE.boot }, GATE_STATE_FIXTURE)
    ).toEqual([]);
  });

  it("기대값 조합 표는 8개와 4개 조합을 빠짐없이 한 번씩 담는다", () => {
    const diag = new Set(GATE_STATE_FIXTURE.diagnosis.map((r) => `${+r.f}${+r.e}${+r.d}`));
    const consult = new Set(GATE_STATE_FIXTURE.consult.map((r) => `${+r.c}${+r.p}`));

    expect([...diag].sort()).toEqual(["000", "001", "010", "011", "100", "101", "110", "111"]);
    expect([...consult].sort()).toEqual(["00", "01", "10", "11"]);
  });

  it('값이 정확히 "true"가 아니면 어떤 변종이든 거짓이다(spec.md LF-05 엄격 일치)', () => {
    for (const variant of ["TRUE", "1", "yes", " true", "true ", ""]) {
      const diag = computeDiagnosisFlags({
        ENABLE_DIAGNOSIS_FLOW: variant,
        DIAGNOSIS_ENGINE_READY: variant,
        ENABLE_DIAGNOSIS_DEV_STATES: variant,
      });
      const consult = computeConsultFlags({
        ENABLE_CONSULT_FLOW: variant,
        CONSULT_POLICY_READY: variant,
      });

      expect(diag).toEqual({
        productionReady: false,
        reviewEnabled: false,
        shouldRenderDiagnosis: false,
      });
      expect(consult).toEqual({ shouldRenderConsult: false, isPolicyReady: false });
    }
  });
});

describe("기대값 리터럴은 spec.md §2.3의 옮김이다", () => {
  function bit(cell: string): boolean {
    return cell === "1";
  }

  it("진단 표 8행의 플래그·참거짓·게이트·문서 금지 표시가 spec.md §2.3과 같다", () => {
    const body = findTableBody(SPEC.split("\n"), [
      "F",
      "E",
      "D",
      "productionReady",
      "reviewEnabled",
      "진단 게이트",
      "비고",
    ]);
    expect(body).not.toBeNull();

    const fromSpec = (body ?? []).map((line) => {
      const [f, e, d, production, review, gate, note] = splitCells(line);
      return {
        f: bit(f),
        e: bit(e),
        d: bit(d),
        productionReady: production === "참",
        reviewEnabled: review === "참",
        gate,
        mark: note.startsWith("문서 금지") ? DOC_FORBIDDEN_MARK : NO_MARK,
      };
    });
    const fromFixture = GATE_STATE_FIXTURE.diagnosis.map(
      ({ f, e, d, productionReady, reviewEnabled, gate, mark }) => ({
        f,
        e,
        d,
        productionReady,
        reviewEnabled,
        gate,
        mark,
      })
    );

    expect(fromSpec).toEqual(fromFixture);
  });

  it("상담 표 4행의 플래그·화면·접수가 spec.md §2.3과 같다", () => {
    const body = findTableBody(SPEC.split("\n"), ["C", "P", "상담 화면", "상담 접수", "비고"]);
    expect(body).not.toBeNull();

    const fromSpec = (body ?? []).map((line) => {
      const [c, p, screen, intake] = splitCells(line);
      return { c: bit(c), p: bit(p), screen, intake };
    });
    const fromFixture = GATE_STATE_FIXTURE.consult.map(({ c, p, screen, intake }) => ({
      c,
      p,
      screen,
      intake,
    }));

    expect(fromSpec).toEqual(fromFixture);
  });
});

describe("변이 시험 — 일부러 바꾼 값은 대조가 잡아낸다", () => {
  function withFixtureEdit(edit: (tables: GateStateTables) => void): GateStateTables {
    const copy = structuredClone(GATE_STATE_FIXTURE);
    edit(copy);
    return copy;
  }

  it("기대값 진단 행 하나(F=1 E=1 D=0)의 productionReady를 바꾸면 런북 대조가 그 행과 칸을 적어 실패한다", () => {
    const altered = withFixtureEdit((t) => {
      t.diagnosis[6].productionReady = false;
    });

    const mismatches = compareGateStateTables(parsedRunbook(), altered);

    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]).toContain("F1E1D0");
    expect(mismatches[0]).toContain("productionReady");
  });

  it("기대값 상담 행 하나(C=0 P=1)의 접수 칸을 바꾸면 함수 출력 대조가 그 행과 칸을 적어 실패한다", () => {
    const altered = withFixtureEdit((t) => {
      t.consult[1].intake = "닫힘(503)";
    });
    const observed = observeFromFunctions(altered, computeDiagnosisFlags, computeConsultFlags);

    // 함수는 P=1이면 접수가 열림이라 바뀐 기대값과 어긋난다.
    const mismatches = compareGateStateTables({ ...observed, boot: altered.boot }, altered);

    expect(mismatches).toEqual([expect.stringContaining("C0P1")]);
    expect(mismatches[0]).toContain("상담 접수");
  });

  it("런북 표의 값을 바꾸면 기대값 대조가 실패한다(진단 게이트 칸)", () => {
    const edited = RUNBOOK.replace(/(\| 1 \| 0 \| 0 \| 거짓 \| 거짓 \| )닫힘/, "$1열림(둘 다)");
    expect(edited).not.toBe(RUNBOOK);

    const mismatches = compareGateStateTables(parsedRunbook(edited), GATE_STATE_FIXTURE);

    expect(mismatches).toEqual([expect.stringContaining("F1E0D0")]);
    expect(mismatches[0]).toContain("진단 게이트");
  });

  it("런북 표에서 문서 금지 표시를 지우면 기대값 대조가 실패한다(표시 칸)", () => {
    const edited = RUNBOOK.replace(
      /(\| 0 \| 0 \| 1 \| 거짓 \| 참 \| 열림\(review 경로\) \| 본 화면 \| 본 화면 \| )문서 금지\(D\)/,
      `$1${NO_MARK}`
    );
    expect(edited).not.toBe(RUNBOOK);

    const mismatches = compareGateStateTables(parsedRunbook(edited), GATE_STATE_FIXTURE);

    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]).toContain("표시");
  });

  it("게이트 함수가 어긋난 출력을 내면(F만으로 productionReady) 기대값 대조가 실패한다", () => {
    const brokenDiagnosis: ComputeDiagnosis = (env) => {
      const real = computeDiagnosisFlags(env);
      const productionReady = env.ENABLE_DIAGNOSIS_FLOW === "true";
      return {
        ...real,
        productionReady,
        shouldRenderDiagnosis: productionReady || real.reviewEnabled,
      };
    };
    const observed = observeFromFunctions(GATE_STATE_FIXTURE, brokenDiagnosis, computeConsultFlags);

    const mismatches = compareGateStateTables(
      { ...observed, boot: GATE_STATE_FIXTURE.boot },
      GATE_STATE_FIXTURE
    );

    // F=1이고 E=0인 두 행(D=0, D=1)이 어긋난다.
    expect(mismatches.some((m) => m.includes("F1E0D0"))).toBe(true);
    expect(mismatches.some((m) => m.includes("F1E0D1"))).toBe(true);
  });
});
