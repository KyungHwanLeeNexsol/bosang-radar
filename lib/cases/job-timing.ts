// 클라이언트(app/cases/new/case-input-form.tsx)와 서버(lib/cases/create-case.ts)가
// 함께 참조하는 순수 상수 모듈이다. DB/Node 전용 의존성이 전혀 없어 클라이언트
// 번들에 서버 코드(@libsql/client 등)가 섞여 들어가지 않는다.
//
// SPEC-PILOT-READY-001 §Z(2026-09-14, 외부 검토 반영) — 클라이언트 polling
// 종료(기존 180회×2초=6분 고정값)가 실제 backend 리스 TTL(960초=16분)보다
// 먼저 끝나던 불일치를 해소한다. 클라이언트가 backend보다 먼저 "실패"를
// 선언하면, 실제로는 계속 처리 중인 job에 대해 사용자가 재제출을 시도하고
// (그 시점엔 리스가 아직 유효해 409로 막히긴 하지만) 혼란스러운 상태에
// 빠질 수 있다 — polling 상한을 리스 TTL에 안전 여유를 두고 맞춰 이 창을
// 최대한 좁힌다.
export const BACKGROUND_LEASE_TTL_SECONDS = 960;

// Background Function 콜드스타트·네트워크 오버헤드를 흡수하는 안전 여유.
const CLIENT_POLL_SAFETY_MARGIN_SECONDS = 60;

export const CLIENT_POLL_INTERVAL_MS = 2000;
export const CLIENT_POLL_MAX_ATTEMPTS = Math.floor(
  ((BACKGROUND_LEASE_TTL_SECONDS - CLIENT_POLL_SAFETY_MARGIN_SECONDS) * 1000) /
    CLIENT_POLL_INTERVAL_MS
);
