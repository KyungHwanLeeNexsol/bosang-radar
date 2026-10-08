import { describe, expect, it } from "vitest";

import {
  CROSS_COMBINATIONS,
  checkCrossObservation,
  crossMismatches,
  formatCrossReport,
  planCrossCombinations,
  readConsultReach,
  reachFromGate,
  type CrossCombinationPlan,
  type CrossObservation,
} from "./cross-combination";
import { GATE_STATE_FIXTURE } from "./gate-state-table.fixture";
import type { GateStateTables } from "./gate-state-table";

// SPEC-B2C-LAUNCH-001 M3c (AC-B2CLAUNCH-010 시나리오 3) — 교차 조합 세 가지의 기대 도달 상태를 고르고 관측과 대조하는
// 순수 로직 시험. 기대값은 spec.md §2.3 표를 옮긴 독립 fixture에서 오며 시험의 리터럴은 AC 문구와 §2.3에서 직접 옮겼다.

function planOrThrow(
  tables: GateStateTables = GATE_STATE_FIXTURE,
  combinations = CROSS_COMBINATIONS
): CrossCombinationPlan[] {
  const result = planCrossCombinations(tables, combinations);
  if (!result.ok) throw new Error(result.errors.join("; "));
  return result.plans;
}

const MATCHING_OPEN: CrossObservation = {
  home: "open",
  result: "open",
  consult: "open",
  apiStatus: 409,
  apiCode: "consent_version_mismatch",
  rowsBefore: 0,
  rowsAfter: 0,
};

describe("CROSS_COMBINATIONS — AC가 적은 교차 조합 세 가지", () => {
  it("세 조합이 AC 문구의 순서로 있다", () => {
    expect(CROSS_COMBINATIONS.map((c) => [c.diagnosisKey, c.consultKey])).toEqual([
      ["F1E1D0", "C1P1"],
      ["F0E0D0", "C1P1"],
      ["F0E0D0", "C0P1"],
    ]);
  });

  it("진단 쪽 게이트 표지는 production 경로 열림 하나와 닫힘 둘이다", () => {
    expect(CROSS_COMBINATIONS.map((c) => c.diagnosisGate)).toEqual([
      "열림(production 경로)",
      "닫힘",
      "닫힘",
    ]);
  });
});

describe("planCrossCombinations — 기대 도달 상태 (spec.md §2.3 경로별 도달 규칙)", () => {
  it("진단 production 경로 열림 × C=참·P=참: /·/result·/consult는 본 화면이고 접수는 503이 아니다", () => {
    const plan = planOrThrow()[0];

    expect(plan.flags).toEqual({
      diag: { flow: true, engine: true, dev: false },
      consult: true,
      policy: true,
    });
    expect(plan.expected).toEqual({
      home: "open",
      result: "open",
      consult: "open",
      intakeUnavailable: false,
    });
  });

  it("진단 닫힘 × C=참·P=참: /consult는 열려 있고 /·/result는 placeholder이며 접수는 503이 아니다", () => {
    const plan = planOrThrow()[1];

    expect(plan.flags).toEqual({
      diag: { flow: false, engine: false, dev: false },
      consult: true,
      policy: true,
    });
    expect(plan.expected).toEqual({
      home: "placeholder",
      result: "placeholder",
      consult: "open",
      intakeUnavailable: false,
    });
  });

  it("진단 닫힘 × C=거짓·P=참: /consult도 placeholder이지만 접수는 503이 아니다", () => {
    const plan = planOrThrow()[2];

    expect(plan.flags).toEqual({
      diag: { flow: false, engine: false, dev: false },
      consult: false,
      policy: true,
    });
    expect(plan.expected).toEqual({
      home: "placeholder",
      result: "placeholder",
      consult: "placeholder",
      intakeUnavailable: false,
    });
  });

  it("시작 플래그의 모양은 조합 키와 같고 라벨은 조합마다 다르다", () => {
    const plans = planOrThrow();

    expect(plans).toHaveLength(3);
    expect(new Set(plans.map((p) => p.label)).size).toBe(3);
    expect(plans.map((p) => [p.diagnosisKey, p.consultKey])).toEqual([
      ["F1E1D0", "C1P1"],
      ["F0E0D0", "C1P1"],
      ["F0E0D0", "C0P1"],
    ]);
  });

  it("기대값은 fixture에서만 온다 — fixture의 칸을 바꾸면 계획의 기대값이 따라 바뀐다", () => {
    const altered: GateStateTables = {
      ...GATE_STATE_FIXTURE,
      consult: GATE_STATE_FIXTURE.consult.map((row) =>
        row.c && row.p ? { ...row, consult: "placeholder", post: "503" } : row
      ),
    };

    const plan = planOrThrow(altered)[0];

    expect(plan.expected.consult).toBe("placeholder");
    expect(plan.expected.intakeUnavailable).toBe(true);
  });

  it("fixture에 조합 행이 없으면 오류로 알리고 계획을 만들지 않는다(fail-closed)", () => {
    const missing: GateStateTables = {
      ...GATE_STATE_FIXTURE,
      diagnosis: GATE_STATE_FIXTURE.diagnosis.filter((row) => !(row.f && row.e && !row.d)),
    };

    const result = planCrossCombinations(missing);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join("|")).toContain("F1E1D0");
  });

  it("상담 표에 조합 행이 없어도 오류로 알리고 계획을 만들지 않는다(fail-closed)", () => {
    const missing: GateStateTables = {
      ...GATE_STATE_FIXTURE,
      consult: GATE_STATE_FIXTURE.consult.filter((row) => !(row.c && !row.p)),
    };

    const result = planCrossCombinations(missing, [
      {
        label: "상담 행 없음",
        diagnosisKey: "F0E0D0",
        diagnosisGate: "닫힘",
        consultKey: "C1P0",
      },
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toEqual(["상담 행 없음: 상담 표에 C1P0 행이 없다"]);
  });

  it("조합이 가리키는 진단 행의 게이트 표지가 조합이 말한 것과 다르면 거부한다", () => {
    const result = planCrossCombinations(GATE_STATE_FIXTURE, [
      {
        label: "표지 불일치",
        diagnosisKey: "F0E0D0",
        diagnosisGate: "열림(production 경로)",
        consultKey: "C1P1",
      },
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join("|")).toContain("F0E0D0");
  });

  it("조합 키 형식이 아니면 거부한다", () => {
    const result = planCrossCombinations(GATE_STATE_FIXTURE, [
      { label: "형식 오류", diagnosisKey: "F9", diagnosisGate: "닫힘", consultKey: "C1P1" },
      { label: "형식 오류", diagnosisKey: "F0E0D0", diagnosisGate: "닫힘", consultKey: "X" },
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toHaveLength(2);
  });

  it("fixture 칸의 값이 알려진 어휘가 아니면 거부한다(값은 되풀이하지 않는다)", () => {
    const broken: GateStateTables = {
      ...GATE_STATE_FIXTURE,
      diagnosis: GATE_STATE_FIXTURE.diagnosis.map((row) =>
        row.f && row.e && !row.d ? { ...row, home: "synthetic-unknown-word" } : row
      ),
      consult: GATE_STATE_FIXTURE.consult.map((row) =>
        row.c && row.p ? { ...row, post: "synthetic-other-word" } : row
      ),
    };

    const result = planCrossCombinations(broken);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
      expect(result.errors.join("|")).not.toContain("synthetic-");
    }
  });
});

describe("reachFromGate / readConsultReach — 응답에서 읽은 신호를 도달 상태로", () => {
  it("게이트 판독 open은 본 화면, closed는 placeholder, 그 밖은 unknown이다", () => {
    expect(reachFromGate("open")).toBe("open");
    expect(reachFromGate("closed")).toBe("placeholder");
    expect(reachFromGate("unknown")).toBe("unknown");
    expect(reachFromGate("anything-else")).toBe("unknown");
  });

  it("/consult는 제목과 placeholder 문구가 서로 반대로 맞을 때만 확정한다", () => {
    expect(readConsultReach("상담 신청", false)).toBe("open");
    expect(readConsultReach("서비스 준비 중", true)).toBe("placeholder");
    expect(readConsultReach("상담 신청", true)).toBe("unknown");
    expect(readConsultReach("서비스 준비 중", false)).toBe("unknown");
    expect(readConsultReach(null, true)).toBe("unknown");
    expect(readConsultReach(null, false)).toBe("unknown");
    expect(readConsultReach("다른 제목", false)).toBe("unknown");
  });
});

describe("checkCrossObservation / crossMismatches", () => {
  const [open, closedBoth, closedConsultFalse] = planOrThrow();

  it("관측이 기대와 같으면 네 경로가 모두 OK이고 불일치가 없다", () => {
    const checks = checkCrossObservation(open, MATCHING_OPEN);

    expect(checks.map((c) => c.path)).toEqual([
      "/",
      "/result",
      "/consult",
      "POST /api/consultations",
    ]);
    expect(checks.every((c) => c.ok)).toBe(true);
    expect(crossMismatches(checks)).toEqual([]);
  });

  it("진단 닫힘 × C·P 참: / 와 /result가 placeholder, /consult가 본 화면이면 같다", () => {
    const observed: CrossObservation = {
      ...MATCHING_OPEN,
      home: "placeholder",
      result: "placeholder",
      consult: "open",
    };

    expect(crossMismatches(checkCrossObservation(closedBoth, observed))).toEqual([]);
  });

  it("진단 닫힘 × C 거짓·P 참: /consult가 본 화면으로 관측되면 그 경로만 불일치다", () => {
    const observed: CrossObservation = {
      ...MATCHING_OPEN,
      home: "placeholder",
      result: "placeholder",
      consult: "open",
    };

    const mismatches = crossMismatches(checkCrossObservation(closedConsultFalse, observed));

    expect(mismatches).toEqual(["/consult: 기대 placeholder / 관측 본 화면"]);
  });

  it("경로마다 어긋난 곳만 불일치로 알린다", () => {
    const mismatches = crossMismatches(
      checkCrossObservation(open, { ...MATCHING_OPEN, home: "placeholder", result: "placeholder" })
    );

    expect(mismatches).toEqual([
      "/: 기대 본 화면 / 관측 placeholder",
      "/result: 기대 본 화면 / 관측 placeholder",
    ]);
  });

  it("확정하지 못한 관측(unknown)은 기대가 무엇이든 불일치다", () => {
    const mismatches = crossMismatches(
      checkCrossObservation(open, { ...MATCHING_OPEN, home: "unknown", consult: "unknown" })
    );

    expect(mismatches).toEqual([
      "/: 기대 본 화면 / 관측 unknown",
      "/consult: 기대 본 화면 / 관측 unknown",
    ]);
  });

  it("접수가 503이 아니어야 하는데 503이면 불일치다", () => {
    const mismatches = crossMismatches(
      checkCrossObservation(open, {
        ...MATCHING_OPEN,
        apiStatus: 503,
        apiCode: "policy_unavailable",
      })
    );

    expect(mismatches).toEqual(["POST /api/consultations: 기대 503 아님 / 관측 503"]);
  });

  it("접수가 503이 아니어야 하는데 다른 서버 오류(5xx)이면 열려 있다고 읽지 않고 불일치다(fail-closed)", () => {
    for (const status of [500, 502, 504]) {
      const mismatches = crossMismatches(
        checkCrossObservation(open, { ...MATCHING_OPEN, apiStatus: status, apiCode: null })
      );

      expect(mismatches).toEqual([expect.stringContaining("POST /api/consultations")]);
    }
  });

  it("접수가 503이 아닌 응답은 409·201·400 어느 것이든 503 아님으로 통과한다", () => {
    for (const status of [409, 201, 400, 429]) {
      expect(
        crossMismatches(checkCrossObservation(open, { ...MATCHING_OPEN, apiStatus: status }))
      ).toEqual([]);
    }
  });

  it("접수가 503이어야 하는 계획에서는 503만 통과한다", () => {
    const closedIntake: CrossCombinationPlan = {
      ...open,
      expected: { ...open.expected, intakeUnavailable: true },
    };

    expect(
      crossMismatches(checkCrossObservation(closedIntake, { ...MATCHING_OPEN, apiStatus: 503 }))
    ).toEqual([]);
    expect(
      crossMismatches(checkCrossObservation(closedIntake, { ...MATCHING_OPEN, apiStatus: 409 }))
    ).toEqual([expect.stringContaining("POST /api/consultations")]);
  });
});

describe("formatCrossReport — 조합별 기대·관측 출력", () => {
  const [open] = planOrThrow();

  it("라벨과 시작 플래그 요약, 네 경로의 기대·관측, 접수 응답 상세를 적는다", () => {
    const report = formatCrossReport(open, MATCHING_OPEN).join("\n");

    expect(report).toContain(open.label);
    expect(report).toContain("진단 F1E1D0");
    expect(report).toContain("상담 C1P1");
    for (const path of ["/", "/result", "/consult", "POST /api/consultations"]) {
      expect(report).toContain(`- ${path}: 기대`);
    }
    expect(report).toContain("409");
    expect(report).toContain("consent_version_mismatch");
    expect(report).toContain("전 0 후 0");
    expect(report).not.toContain("MISMATCH");
  });

  it("어긋난 경로의 줄에만 MISMATCH를 붙인다", () => {
    const lines = formatCrossReport(open, { ...MATCHING_OPEN, consult: "placeholder" });

    expect(lines.filter((line) => line.endsWith("MISMATCH"))).toEqual([
      expect.stringContaining("- /consult: 기대 본 화면 / 관측 placeholder"),
    ]);
    expect(lines.filter((line) => line.endsWith(" OK"))).toHaveLength(3);
  });

  it("시크릿·DB 경로를 적지 않는다", () => {
    const report = formatCrossReport(open, MATCHING_OPEN).join("\n");

    expect(report).not.toMatch(/file:|secret|시크릿/i);
  });
});
