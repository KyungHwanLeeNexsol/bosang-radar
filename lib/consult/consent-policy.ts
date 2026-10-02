// SPEC-B2C-CONSULT-001 M4 (design.md §6.1) — 동의 정책 버전 단일 소스.
// M2에서 app/api/consultations/route.ts 안에 비공개(unexported)로 정의됐던
// CONSENT_POLICY_VERSION을 이 공유 파일로 추출한다(progress.md M2가 남긴
// "하드코딩 vs API로 조회" 잔여 위험 해소) — 서버(route.ts)와 클라이언트
// (consult-consent-group.tsx 등)가 이 상수 하나만 참조한다. 일반 TS 문자열
// 리터럴이므로 process.env가 아니며, 클라이언트 번들에 안전하게 포함된다
// (M3의 process.env 하이드레이션 문제와는 무관한 별개 상황).
export const CONSENT_POLICY_VERSION = "2026-09-25-v1";

// design.md §4(REQ-B2CCONSULT-005, AC-B2CCONSULT-005 추가 시나리오) — 동의 정책이
// 준비되지 않은 상태(isPolicyReady=false)에서 제출 CTA 자리를 대신하는 안내
// 문구. 법무·운영이 확정한 문장이 아니라 result-footer.tsx의 "준비 중" 스텁
// 선례에 맞춘 잠정 문구다(법무 검토 전). 확정되면 이 상수의 값만 교체한다.
export const CONSULT_POLICY_NOT_READY_NOTICE =
  "상담 신청은 아직 준비 중입니다. 준비가 끝나면 이용하실 수 있어요.";
