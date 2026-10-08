// SPEC-B2C-LAUNCH-001 M2: L-08 표면별 G 점검기 (REQ-B2CLAUNCH-015, AC-B2CLAUNCH-015 시나리오 2).

import type { FooterElementState } from "./footer-element-state";
import { SURFACES } from "./item-table";

export const S1_ELEMENT_IDS = [
  "01-footer-privacy",
  "01-footer-terms",
  "01-footer-contact",
  "02-footer-privacy",
  "02-footer-terms",
  "02-footer-contact",
] as const;

export const S2_ELEMENT_IDS = [
  "03-C",
  "03-B",
  "03-D",
  "03-footer-contact",
  "03-footer-privacy",
  "03-footer-terms",
] as const;

export type S2Confirmation = "확정" | "미확정";

export const ALLOWED_STATES = {
  I: ["목적지 있음", "비활성 표시"],
  G: ["목적지 있음"],
} as const satisfies Record<"I" | "G", readonly FooterElementState[]>;

export type GateProblem =
  | "empty-target"
  | "unknown-target"
  | "no-applicable-surface"
  | "unknown-s1-element"
  | "unknown-s2-element";

export interface LegalNoticeInput {
  s1: Readonly<Record<string, FooterElementState>>;
  s2: Readonly<Record<string, S2Confirmation>>;
  target: readonly string[];
}

export interface LegalNoticeResult {
  verdict: "READY" | "BLOCKED";
  blocking: string[];
  problems: GateProblem[];
}

const includes = (list: readonly string[], value: unknown): boolean =>
  typeof value === "string" && list.includes(value);

/**
 * L-08 G 판정. 목적 벡터가 여는 표면의 요소만 읽는다.
 * - S1: 여섯 요소가 모두 G 허용 상태(`목적지 있음`)여야 한다. D-LAUNCH-09와 이 SPEC의 요소별 기록만으로 판정하며
 *   S2 입력은 읽지 않는다.
 * - S2: 여섯 요소가 모두 `확정`이어야 한다. 확정 여부는 CONSULTOPS-001 D-OPS-04 기록을 입력으로 받을 뿐이며
 *   이 점검기가 D-OPS-04를 대신 판정하지 않는다.
 * 알 수 없는 입력(빈 벡터, 알 수 없는 표면·요소, 빠진 요소, 알 수 없는 값)은 모두 통과가 아니다(fail-closed).
 * 출력은 차단 요소의 식별자와 문제 종류만 담고 입력 값을 되풀이하지 않는다.
 */
export function evaluateLegalNoticeGate(input: LegalNoticeInput): LegalNoticeResult {
  const target = Array.isArray(input.target) ? input.target : [];
  const problems: GateProblem[] = [];
  const blocking: string[] = [];

  if (target.length === 0) problems.push("empty-target");
  if (target.some((surface) => !includes(SURFACES, surface))) problems.push("unknown-target");

  const judgesS1 = target.includes("S1");
  const judgesS2 = target.includes("S2");
  if (target.length > 0 && !problems.includes("unknown-target") && !judgesS1 && !judgesS2) {
    problems.push("no-applicable-surface");
  }

  if (judgesS1) {
    const states = input.s1 ?? {};
    if (Object.keys(states).some((id) => !includes(S1_ELEMENT_IDS, id))) {
      problems.push("unknown-s1-element");
    }
    for (const id of S1_ELEMENT_IDS) {
      if (!includes(ALLOWED_STATES.G, states[id])) blocking.push(id);
    }
  }

  if (judgesS2) {
    const confirmations = input.s2 ?? {};
    if (Object.keys(confirmations).some((id) => !includes(S2_ELEMENT_IDS, id))) {
      problems.push("unknown-s2-element");
    }
    for (const id of S2_ELEMENT_IDS) {
      if (confirmations[id] !== "확정") blocking.push(id);
    }
  }

  return {
    verdict: problems.length === 0 && blocking.length === 0 ? "READY" : "BLOCKED",
    blocking,
    problems,
  };
}
