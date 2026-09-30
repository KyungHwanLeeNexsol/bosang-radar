import { describe, expect, it } from "vitest";

import { evaluateCardBorderGate, type BorderBox } from "./visual-verify-card-gate";

// design/exports/M03-B(2배 export)를 findCardBorderBox로 잰 바깥 상자: 350x176.
const DESIGN: BorderBox = { left: 20, top: 248, width: 350, height: 176 };
const MOBILE_TOLERANCE = 4;

describe("evaluateCardBorderGate — 카드 바깥 테두리 상자 회귀 게이트", () => {
  it("디자인과 같은 크기면 통과한다", () => {
    const result = evaluateCardBorderGate({
      design: DESIGN,
      impl: { ...DESIGN },
      tolerance: MOBILE_TOLERANCE,
    });

    expect(result.pass).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.deltas).toEqual({ left: 0, top: 0, width: 0, height: 0 });
  });

  it("허용 오차 이내(+3px)면 통과하고, 초과(+5px)면 그 축이 위반으로 남는다", () => {
    const within = evaluateCardBorderGate({
      design: DESIGN,
      impl: { ...DESIGN, height: 179 },
      tolerance: MOBILE_TOLERANCE,
    });
    const beyond = evaluateCardBorderGate({
      design: DESIGN,
      impl: { ...DESIGN, height: 181 },
      tolerance: MOBILE_TOLERANCE,
    });

    expect(within.pass).toBe(true);
    expect(beyond.pass).toBe(false);
    expect(beyond.violations).toEqual([{ axis: "height", design: 176, impl: 181, delta: 5 }]);
  });

  // 이 게이트가 다시 조용히 통과하는 일이 없도록 하는 음성 테스트(D-NEW-17 요구):
  // 옛 잉크 측정은 카드가 30px 크게 어긋나도 skipMetrics 때문에 24/24 PASS였다.
  it("카드가 30px 더 크면(높이 +30) 실패한다", () => {
    const result = evaluateCardBorderGate({
      design: DESIGN,
      impl: { ...DESIGN, height: DESIGN.height + 30 },
      tolerance: MOBILE_TOLERANCE,
    });

    expect(result.pass).toBe(false);
    expect(result.violations.map((v) => v.axis)).toEqual(["height"]);
    expect(result.violations[0]?.delta).toBe(30);
  });

  it("카드가 30px 더 넓으면(폭 +30) 실패한다", () => {
    const result = evaluateCardBorderGate({
      design: DESIGN,
      impl: { ...DESIGN, width: DESIGN.width + 30 },
      tolerance: MOBILE_TOLERANCE,
    });

    expect(result.pass).toBe(false);
    expect(result.violations.map((v) => v.axis)).toEqual(["width"]);
  });

  it("이유를 적어 제외한 축만 게이트에서 빠지고, 나머지 축은 계속 검사한다", () => {
    const result = evaluateCardBorderGate({
      design: DESIGN,
      impl: { ...DESIGN, top: DESIGN.top - 40, height: DESIGN.height + 30 },
      tolerance: MOBILE_TOLERANCE,
      skip: { top: "design.md §10 — 03-C 계약에는 부제·안내 박스가 없다" },
    });

    expect(result.skipped).toEqual([
      { axis: "top", reason: "design.md §10 — 03-C 계약에는 부제·안내 박스가 없다", delta: 40 },
    ]);
    // top은 제외됐지만 height +30은 여전히 잡힌다.
    expect(result.violations.map((v) => v.axis)).toEqual(["height"]);
    expect(result.pass).toBe(false);
  });

  it("빈 문자열 이유로는 축을 제외할 수 없다(이유 없는 skip은 위반으로 취급)", () => {
    const result = evaluateCardBorderGate({
      design: DESIGN,
      impl: { ...DESIGN, height: DESIGN.height + 30 },
      tolerance: MOBILE_TOLERANCE,
      skip: { height: "   " },
    });

    expect(result.pass).toBe(false);
    expect(result.violations.map((v) => v.axis)).toEqual(["height"]);
    expect(result.skipped).toEqual([]);
  });

  it("디자인 또는 구현 상자를 측정하지 못하면 통과하지 않는다(측정 공백 ≠ 통과)", () => {
    const noDesign = evaluateCardBorderGate({ design: null, impl: DESIGN, tolerance: 4 });
    const noImpl = evaluateCardBorderGate({ design: DESIGN, impl: null, tolerance: 4 });

    expect(noDesign.pass).toBe(false);
    expect(noDesign.missing).toEqual(["design"]);
    expect(noImpl.pass).toBe(false);
    expect(noImpl.missing).toEqual(["impl"]);
  });
});
