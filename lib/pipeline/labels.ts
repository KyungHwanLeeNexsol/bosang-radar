import type { EvidenceType, QueryIssueType } from "./types";

// SPEC-UI-MIGRATION-001 M3 (REQ-007/008) — EvidenceType/QueryIssueType 한글
// 라벨 단일 SSOT. `feedback-form.tsx`의 기존 `{value,label}` 배열 패턴
// (OVERALL_RATINGS 등)과 동일한 방식으로 매핑값을 구성하되, 3개 이상 파일
// (evidence-item.tsx/page.tsx/feedback-form.tsx)에서 공유되므로 §B 결정 8에
// 따라 별도 모듈로 추출한다(F2). 내부 데이터 값(영문 enum, `data-*` 속성)은
// 절대 변경하지 않는다 — 이 라벨은 렌더링 레이어 전용이다.

export const EVIDENCE_TYPE_LABELS: Record<EvidenceType, string> = {
  POLICY: "약관",
  PRECEDENT: "판례",
  STATUTE: "법령",
  DISPUTE_CASE: "분쟁조정례",
  OTHER: "기타",
};

export const QUERY_ISSUE_TYPE_LABELS: Record<QueryIssueType, string> = {
  DISABILITY_LOCATION: "장해 부위",
  DIAGNOSIS: "진단명",
  INCIDENT_CIRCUMSTANCE: "사고 경위",
  INJURY_DISEASE_RELATION: "상해·질병 관련성",
  DISABILITY_GRADE_CRITERIA: "장해 평가 기준",
  PRE_EXISTING_CONDITION: "기왕증·퇴행성",
  CAUSATION: "인과관계",
  ADDITIONAL_CONFIRMATION_NEEDED: "추가 확인 필요",
};

export function evidenceTypeLabel(type: EvidenceType): string {
  return EVIDENCE_TYPE_LABELS[type];
}

export function queryIssueTypeLabel(type: QueryIssueType): string {
  return QUERY_ISSUE_TYPE_LABELS[type];
}
