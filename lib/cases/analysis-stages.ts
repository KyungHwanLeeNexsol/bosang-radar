// SPEC-CASE-PROGRESS-001 REQ-CASE-PROGRESS-001 — app/cases/new/analysis-status-panel.tsx와
// app/cases/new/case-input-form.tsx가 공유하는 4단계 안내 라벨 단일 소스.
// lib/cases/job-timing.ts와 동일한 패턴(DB/Node 전용 의존성 없음)이라
// 클라이언트 번들에 서버 코드가 섞여 들어가지 않는다.
export const ANALYSIS_STAGES = [
  "쟁점 자동 추출",
  "판례·결정례 검색",
  "약관·법령 대조",
  "근거 검증 및 반대 논리 생성",
] as const;
