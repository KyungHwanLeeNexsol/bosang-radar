// SPEC-B2C-CONSULT-001 M4 (design.md §6.1) — 동의 정책 버전 단일 소스.
// M2에서 app/api/consultations/route.ts 안에 비공개(unexported)로 정의됐던
// CONSENT_POLICY_VERSION을 이 공유 파일로 추출한다(progress.md M2가 남긴
// "하드코딩 vs API로 조회" 잔여 위험 해소) — 서버(route.ts)와 클라이언트
// (consult-consent-group.tsx 등)가 이 상수 하나만 참조한다. 일반 TS 문자열
// 리터럴이므로 process.env가 아니며, 클라이언트 번들에 안전하게 포함된다
// (M3의 process.env 하이드레이션 문제와는 무관한 별개 상황).
export const CONSENT_POLICY_VERSION = "2026-09-25-v1";
