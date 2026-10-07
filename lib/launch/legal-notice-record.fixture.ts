// SPEC-B2C-LAUNCH-001 M2: L-08 푸터 요소 기록의 시험용 거울(AC-B2CLAUNCH-015 시나리오 1).
//
// 세 푸터 컴포넌트를 렌더링해 분류한 결과가 이 기록의 "현재 상태" 칸과 같은지, 단계별 허용 칸이 D-LAUNCH-09
// 결정 기록(G는 목적지를 갖춘 뒤에만, I는 "준비 중" 비활성 표시 허용)과 같은지 시험이 대조한다. 푸터 컴포넌트가
// 바뀌면 현재 상태 칸과 분류 결과가 어긋나 시험이 실패하고, 그때 이 기록을 고치는 것은 사람의 몫이다.
//
// 이 파일은 URL·연락처·정책 문구·법적 결론을 담지 않는다. 요소 이름과 상태 분류만 담는다(spec.md §D 값·문구 금지).

import type { FooterElementState } from "./footer-element-state";

/** 푸터에서 찾는 세 요소의 화면 라벨. 시험이 렌더링 결과에서 요소를 찾는 열쇠이며 법적 문구가 아니다. */
export type FooterElementLabel = "개인정보처리방침" | "이용약관" | "고객 문의";

export interface FooterElementRecord {
  /** 요소 식별자. 점검기(`legal-notice-gate.ts`)의 S1·S2 푸터 요소 식별자와 같다. */
  id: string;
  label: FooterElementLabel;
  /** 이 SPEC 기준 시점(HEAD)에서 렌더링 시험으로 관측한 현재 상태. */
  current: FooterElementState;
}

/** S1(01·02 진단 푸터) — 이 SPEC이 소유하는 여섯 요소(L-08). */
export const S1_FOOTER_RECORD = {
  "01": [
    { id: "01-footer-privacy", label: "개인정보처리방침", current: "# 앵커" },
    { id: "01-footer-terms", label: "이용약관", current: "# 앵커" },
    { id: "01-footer-contact", label: "고객 문의", current: "# 앵커" },
  ],
  "02": [
    { id: "02-footer-privacy", label: "개인정보처리방침", current: "# 앵커" },
    { id: "02-footer-terms", label: "이용약관", current: "# 앵커" },
    // 02의 고객 문의는 링크가 아니라 텍스트다(LF-13).
    { id: "02-footer-contact", label: "고객 문의", current: "텍스트만" },
  ],
} as const satisfies Record<string, readonly FooterElementRecord[]>;

/**
 * S2(03 상담 화면) 푸터의 현재 분류. S2의 G 판정은 이 분류가 아니라 CONSULTOPS-001 D-OPS-04의 확정 여부로
 * 내리므로(L-08) 이 기록은 현황 기록일 뿐 점검기의 입력이 아니다.
 */
export const S2_FOOTER_RECORD = [
  { id: "03-footer-privacy", label: "개인정보처리방침", current: "비활성 표시" },
  { id: "03-footer-terms", label: "이용약관", current: "비활성 표시" },
  { id: "03-footer-contact", label: "고객 문의", current: "비활성 표시" },
] as const satisfies readonly FooterElementRecord[];

/**
 * 단계별 허용 칸 — D-LAUNCH-09 결정 기록(2026-10-03)을 옮긴 것이다.
 * G: (1) 목적지를 갖춘 뒤에만. I: (2) "준비 중" 비활성 표시를 허용(`목적지 있음`은 그 자체로 충족한다고 읽는다).
 * `# 앵커`·`텍스트만`이 I에서 허용되는지는 결정 기록이 말하지 않아 허용으로 읽지 않는다.
 */
export const ALLOWANCE_RECORD = {
  I: ["목적지 있음", "비활성 표시"],
  G: ["목적지 있음"],
} as const satisfies Record<"I" | "G", readonly FooterElementState[]>;
