import type { CoverageCategory, CoverageStatus } from "@/lib/diagnosis/types";

// SPEC-B2C-RESULT-001 M4 (design.md "하드코딩 문구 금지" — REQ-B2CRESULT-001,
// AC-B2CRESULT-006 추가 시나리오) — 케이스와 무관한 고정 문구(상태 pill
// 라벨·카테고리 제목)는 컴포넌트마다 따로 적지 않고 이 공용 상수 모듈
// 하나에서만 가져온다. 케이스별로 달라지는 문구(설명·whyCheck·배지 라벨
// 등)는 여기 두지 않는다 — 그것은 항상 DiagnosisResult/CoverageItem 데이터
// 필드에서 온다.

/**
 * 담보 카드 3톤 상태 pill 텍스트 라벨(REQ-B2CRESULT-020 — 색상 단독 전달
 * 금지, 항상 텍스트 라벨을 함께 표기).
 */
export const STATUS_LABEL: Record<CoverageStatus, string> = {
  review: "검토 대상",
  "needs-info": "추가 정보 필요",
  "low-likelihood": "가능성 낮음",
};

/** 4개 담보 카테고리 고정 순서 + 제목(design.md §0/§6, MIGRATION-PLAN.md §4). */
export const CATEGORY_ORDER: readonly CoverageCategory[] = [
  "reimbursement",
  "fixed",
  "disability",
  "special",
];

export const CATEGORY_LABEL: Record<CoverageCategory, string> = {
  reimbursement: "실손 의료비",
  fixed: "정액 담보",
  disability: "후유장해",
  special: "특별 보상",
};

/** Mobile 진입 시 기본 활성 탭(design.md §0, REQ-B2CRESULT-003). */
export const DEFAULT_MOBILE_CATEGORY: CoverageCategory = "reimbursement";
