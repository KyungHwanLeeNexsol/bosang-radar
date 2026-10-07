import { describe, expect, it } from "vitest";

import type { FooterElementState } from "./footer-element-state";
import {
  ALLOWED_STATES,
  S1_ELEMENT_IDS,
  S2_ELEMENT_IDS,
  evaluateLegalNoticeGate,
  type LegalNoticeInput,
  type S2Confirmation,
} from "./legal-notice-gate";

// SPEC-B2C-LAUNCH-001 M2 / AC-B2CLAUNCH-015 시나리오 2: L-08 표면별 G 점검기.
// 네 fixture × 두 목적 벡터 = 여덟 칸과 fail-closed 경계 시험이다.

const s1 = (state: FooterElementState): Record<string, FooterElementState> =>
  Object.fromEntries(S1_ELEMENT_IDS.map((id) => [id, state]));

const s2 = (confirmation: S2Confirmation): Record<string, S2Confirmation> =>
  Object.fromEntries(S2_ELEMENT_IDS.map((id) => [id, confirmation]));

const S1_ALL_DESTINATION = s1("목적지 있음");
const S1_ONE_ANCHOR = { ...S1_ALL_DESTINATION, "02-footer-terms": "# 앵커" as const };
const S2_NONE_CONFIRMED = s2("미확정");
const S2_ALL_CONFIRMED = s2("확정");
const S2_PARTIAL = { ...S2_NONE_CONFIRMED, "03-C": "확정" as const, "03-B": "확정" as const };

const FIXTURES = {
  가: { s1: S1_ALL_DESTINATION, s2: S2_NONE_CONFIRMED },
  나: { s1: S1_ONE_ANCHOR, s2: S2_ALL_CONFIRMED },
  다: { s1: S1_ALL_DESTINATION, s2: S2_PARTIAL },
  라: { s1: S1_ALL_DESTINATION, s2: S2_ALL_CONFIRMED },
} as const;

type FixtureName = keyof typeof FIXTURES;

function run(name: FixtureName, target: string[]) {
  return evaluateLegalNoticeGate({ ...FIXTURES[name], target });
}

describe("lib/launch/legal-notice-gate — AC-B2CLAUNCH-015 시나리오 2 (여덟 칸)", () => {
  // [fixture, 목적 벡터, 기대 판정, 기대 차단 요소(식별자만)]
  const CELLS: ReadonlyArray<readonly [FixtureName, "S1" | "S2", "READY" | "BLOCKED", string[]]> = [
    ["가", "S1", "READY", []],
    ["나", "S1", "BLOCKED", ["02-footer-terms"]],
    ["다", "S1", "READY", []],
    ["라", "S1", "READY", []],
    ["가", "S2", "BLOCKED", [...S2_ELEMENT_IDS]],
    ["나", "S2", "READY", []],
    ["다", "S2", "BLOCKED", ["03-D", "03-footer-contact", "03-footer-privacy", "03-footer-terms"]],
    ["라", "S2", "READY", []],
  ];

  it.each(CELLS)("fixture (%s) × 목적 벡터 %s → %s", (name, vector, verdict, blocking) => {
    const result = run(name, [vector]);
    expect(result.verdict).toBe(verdict);
    expect(result.blocking).toEqual(blocking);
    expect(result.problems).toEqual([]);
  });

  it("S1 목적 벡터에서는 (나)만 BLOCKED이고 S2 미확정((가)(다))은 영향을 주지 않는다", () => {
    const blocked = (["가", "나", "다", "라"] as const).filter(
      (name) => run(name, ["S1"]).verdict === "BLOCKED"
    );
    expect(blocked).toEqual(["나"]);
  });

  it("S2 목적 벡터에서는 (가)(다)만 BLOCKED이고 S1 요소 상태((나))는 영향을 주지 않는다", () => {
    const blocked = (["가", "나", "다", "라"] as const).filter(
      (name) => run(name, ["S2"]).verdict === "BLOCKED"
    );
    expect(blocked).toEqual(["가", "다"]);
  });

  it("두 표면을 함께 여는 벡터는 두 판정의 합집합이다(S1 요소 → S2 요소 순서)", () => {
    expect(run("나", ["S1", "S2"])).toEqual({
      verdict: "BLOCKED",
      blocking: ["02-footer-terms"],
      problems: [],
    });
    expect(run("다", ["S1", "S2"]).blocking).toEqual([
      "03-D",
      "03-footer-contact",
      "03-footer-privacy",
      "03-footer-terms",
    ]);
    expect(
      evaluateLegalNoticeGate({ s1: S1_ONE_ANCHOR, s2: S2_PARTIAL, target: ["S2", "S1"] }).blocking
    ).toEqual([
      "02-footer-terms",
      "03-D",
      "03-footer-contact",
      "03-footer-privacy",
      "03-footer-terms",
    ]);
    expect(run("라", ["S1", "S2"]).verdict).toBe("READY");
  });
});

describe("lib/launch/legal-notice-gate — G 허용 규칙", () => {
  it("G는 목적지 있음만 허용한다(D-LAUNCH-09 (1))", () => {
    expect([...ALLOWED_STATES.G]).toEqual(["목적지 있음"]);
    for (const state of ["# 앵커", "비활성 표시", "텍스트만"] as const) {
      const result = evaluateLegalNoticeGate({
        s1: { ...S1_ALL_DESTINATION, "01-footer-contact": state },
        s2: S2_ALL_CONFIRMED,
        target: ["S1"],
      });
      expect(result.verdict).toBe("BLOCKED");
      expect(result.blocking).toEqual(["01-footer-contact"]);
    }
  });

  it("S2는 확정만 읽는다 — 미확정이 아닌 다른 값도 확정으로 읽지 않는다", () => {
    const result = evaluateLegalNoticeGate({
      s1: S1_ALL_DESTINATION,
      s2: { ...S2_ALL_CONFIRMED, "03-B": "확정됨" as unknown as S2Confirmation },
      target: ["S2"],
    });
    expect(result).toEqual({ verdict: "BLOCKED", blocking: ["03-B"], problems: [] });
  });

  it("알 수 없는 상태 값은 목적지 있음이 아니므로 그 요소를 차단한다", () => {
    const result = evaluateLegalNoticeGate({
      s1: {
        ...S1_ALL_DESTINATION,
        "01-footer-terms": "알 수 없음" as unknown as FooterElementState,
      },
      s2: {},
      target: ["S1"],
    });
    expect(result).toEqual({ verdict: "BLOCKED", blocking: ["01-footer-terms"], problems: [] });
  });

  it("입력을 바꾸지 않는다", () => {
    const input: LegalNoticeInput = {
      s1: Object.freeze({ ...S1_ONE_ANCHOR }),
      s2: Object.freeze({ ...S2_PARTIAL }),
      target: Object.freeze(["S1", "S2"]) as unknown as string[],
    };
    const before = JSON.stringify(input);
    evaluateLegalNoticeGate(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe("lib/launch/legal-notice-gate — fail-closed 경계", () => {
  it("S1 요소 입력이 비어 있으면 여섯 요소 전부를 차단한다", () => {
    expect(evaluateLegalNoticeGate({ s1: {}, s2: S2_ALL_CONFIRMED, target: ["S1"] })).toEqual({
      verdict: "BLOCKED",
      blocking: [...S1_ELEMENT_IDS],
      problems: [],
    });
  });

  it("S2 확정 입력이 비어 있으면 여섯 요소 전부를 차단한다", () => {
    expect(evaluateLegalNoticeGate({ s1: S1_ALL_DESTINATION, s2: {}, target: ["S2"] })).toEqual({
      verdict: "BLOCKED",
      blocking: [...S2_ELEMENT_IDS],
      problems: [],
    });
  });

  it("입력 객체 자체가 빠져도 통과하지 않는다", () => {
    const result = evaluateLegalNoticeGate({ target: ["S1", "S2"] } as unknown as LegalNoticeInput);
    expect(result.verdict).toBe("BLOCKED");
    expect(result.blocking).toEqual([...S1_ELEMENT_IDS, ...S2_ELEMENT_IDS]);
  });

  it("목적 벡터가 비어 있으면 통과하지 않는다", () => {
    expect(evaluateLegalNoticeGate({ ...FIXTURES.라, target: [] })).toEqual({
      verdict: "BLOCKED",
      blocking: [],
      problems: ["empty-target"],
    });
  });

  it("목적 벡터가 없는 입력도 통과하지 않는다", () => {
    const result = evaluateLegalNoticeGate({ ...FIXTURES.라 } as unknown as LegalNoticeInput);
    expect(result.verdict).toBe("BLOCKED");
    expect(result.problems).toEqual(["empty-target"]);
  });

  it("알 수 없는 목적 벡터 값은 거부하고 값을 출력에 되풀이하지 않는다", () => {
    const result = evaluateLegalNoticeGate({ ...FIXTURES.라, target: ["S9"] });
    expect(result.verdict).toBe("BLOCKED");
    expect(result.problems).toContain("unknown-target");
    expect(JSON.stringify(result)).not.toContain("S9");
  });

  it("알 수 없는 값이 섞인 벡터는 알려진 표면 판정이 READY여도 통과하지 않는다", () => {
    const result = evaluateLegalNoticeGate({ ...FIXTURES.라, target: ["S1", "S9"] });
    expect(result.verdict).toBe("BLOCKED");
    expect(result.problems).toEqual(["unknown-target"]);
    expect(result.blocking).toEqual([]);
  });

  it("L-08이 적용되는 표면(S1·S2)이 벡터에 없으면(S3만) 통과하지 않는다", () => {
    expect(evaluateLegalNoticeGate({ ...FIXTURES.라, target: ["S3"] })).toEqual({
      verdict: "BLOCKED",
      blocking: [],
      problems: ["no-applicable-surface"],
    });
  });

  it("S3는 S1·S2와 함께 있어도 S1·S2 판정을 바꾸지 않는다", () => {
    expect(run("나", ["S1", "S3"]).blocking).toEqual(["02-footer-terms"]);
    expect(run("라", ["S1", "S3"]).verdict).toBe("READY");
  });

  it("S1 입력의 알 수 없는 요소 식별자는 통과하지 않게 하고 식별자를 되풀이하지 않는다", () => {
    const result = evaluateLegalNoticeGate({
      s1: { ...S1_ALL_DESTINATION, "09-footer-extra": "목적지 있음" },
      s2: S2_ALL_CONFIRMED,
      target: ["S1"],
    });
    expect(result).toEqual({
      verdict: "BLOCKED",
      blocking: [],
      problems: ["unknown-s1-element"],
    });
    expect(JSON.stringify(result)).not.toContain("09-footer-extra");
  });

  it("S2 식별자를 S1 입력에 넣으면 알 수 없는 요소다", () => {
    const result = evaluateLegalNoticeGate({
      s1: { ...S1_ALL_DESTINATION, "03-C": "목적지 있음" },
      s2: S2_ALL_CONFIRMED,
      target: ["S1"],
    });
    expect(result.problems).toEqual(["unknown-s1-element"]);
    expect(result.verdict).toBe("BLOCKED");
  });

  it("S2 입력의 알 수 없는 요소 식별자는 S2를 열 때만 문제가 된다", () => {
    const s2WithExtra = { ...S2_ALL_CONFIRMED, "03-X": "확정" as const };
    expect(
      evaluateLegalNoticeGate({ s1: S1_ALL_DESTINATION, s2: s2WithExtra, target: ["S2"] })
    ).toEqual({ verdict: "BLOCKED", blocking: [], problems: ["unknown-s2-element"] });
    expect(
      evaluateLegalNoticeGate({ s1: S1_ALL_DESTINATION, s2: s2WithExtra, target: ["S1"] }).verdict
    ).toBe("READY");
  });

  it("열지 않는 표면의 입력은 읽지 않는다(S1 벡터는 S2 입력을, S2 벡터는 S1 입력을 판정하지 않는다)", () => {
    expect(evaluateLegalNoticeGate({ s1: {}, s2: S2_ALL_CONFIRMED, target: ["S2"] }).verdict).toBe(
      "READY"
    );
    expect(
      evaluateLegalNoticeGate({ s1: S1_ALL_DESTINATION, s2: {}, target: ["S1"] }).verdict
    ).toBe("READY");
  });

  it("미확정 S2는 스스로 READY가 되지 않는다 — S2를 여는 어떤 벡터에서도", () => {
    for (const target of [["S2"], ["S1", "S2"], ["S2", "S3"]]) {
      expect(
        evaluateLegalNoticeGate({ s1: S1_ALL_DESTINATION, s2: S2_NONE_CONFIRMED, target }).verdict
      ).toBe("BLOCKED");
    }
  });
});
