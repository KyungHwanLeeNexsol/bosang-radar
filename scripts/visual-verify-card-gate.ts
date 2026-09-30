// SPEC-B2C-CONSULT-001 D-NEW-17 — 요약 카드 바깥 테두리 상자(border box) 회귀 게이트.
//
// 옛 게이트는 구현 쪽을 "DOM rect+2px 안의 잉크"로 재고 디자인 쪽은 잉크 밴드(mergeBands)
// 로 재서, 인접 버튼·밴드가 섞여 카드 크기를 믿을 수 없었다. 그래서 카드 요소에
// skipMetrics: ["height"]를 걸어 두었고, 카드가 30px 어긋나도 24/24 PASS였다.
// 이 게이트는 비교 대상을 바꾼다:
//   - 구현: getBoundingClientRect() (진짜 DOM 바깥 상자)
//   - 디자인: PNG의 카드 테두리색 가로줄 검출(visual-verify-helpers.ts findCardBorderBox)
// 이 파일은 그 두 상자를 비교하는 순수 함수만 담는다(브라우저·파일 I/O 없음).

export interface BorderBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type BorderAxis = keyof BorderBox;

const AXES: readonly BorderAxis[] = ["left", "top", "width", "height"];

export interface CardGateInput {
  design: BorderBox | null;
  impl: BorderBox | null;
  /** 축별 허용 오차(CSS px). */
  tolerance: number;
  /**
   * 게이트에서 제외할 축 → 제외 근거. 근거는 비어 있으면 안 된다(SPEC/디자인 결정을
   * 인용해야 한다). 빈 근거는 제외로 인정하지 않고 그 축을 그대로 검사한다.
   */
  skip?: Partial<Record<BorderAxis, string>>;
}

export interface CardGateViolation {
  axis: BorderAxis;
  design: number;
  impl: number;
  delta: number;
}

export interface CardGateResult {
  /** 모든 축의 |디자인 − 구현|. 한쪽이 측정되지 않았으면 null. */
  deltas: Record<BorderAxis, number> | null;
  violations: CardGateViolation[];
  /** 근거와 함께 제외된 축(측정·기록은 하되 판정하지 않는다). */
  skipped: Array<{ axis: BorderAxis; reason: string; delta: number }>;
  /** 측정하지 못한 쪽. 측정 공백은 통과가 아니다. */
  missing: Array<"design" | "impl">;
  pass: boolean;
}

const round = (value: number) => Math.round(value * 100) / 100;

export function evaluateCardBorderGate(input: CardGateInput): CardGateResult {
  const missing: CardGateResult["missing"] = [];
  if (!input.design) missing.push("design");
  if (!input.impl) missing.push("impl");
  if (!input.design || !input.impl) {
    return { deltas: null, violations: [], skipped: [], missing, pass: false };
  }

  const deltas = {} as Record<BorderAxis, number>;
  const violations: CardGateViolation[] = [];
  const skipped: CardGateResult["skipped"] = [];

  for (const axis of AXES) {
    const delta = round(Math.abs(input.design[axis] - input.impl[axis]));
    deltas[axis] = delta;

    const reason = input.skip?.[axis]?.trim();
    if (reason) {
      skipped.push({ axis, reason, delta });
      continue;
    }
    if (delta > input.tolerance) {
      violations.push({
        axis,
        design: round(input.design[axis]),
        impl: round(input.impl[axis]),
        delta,
      });
    }
  }

  return { deltas, violations, skipped, missing, pass: violations.length === 0 };
}
