import { headers } from "next/headers";
import { getSessionCookie } from "better-auth/cookies";
import { getAuth } from "./config";

// @MX:ANCHOR: [AUTO] app/api/cases/(M4), app/cases/(M5), proxy.ts가 의존하는
// 현재 로그인 사용자 세션 조회 헬퍼
// @MX:REASON: 세션 조회 방식이 바뀌면(예: 쿠키 캐시 전략 변경) 다수 지점이
// 영향을 받는다(plan.md §F).
export async function getCurrentSession() {
  return getAuth().api.getSession({ headers: await headers() });
}

// proxy.ts에서 사용하는 경량 세션 쿠키 존재 확인 — DB 왕복 없이 쿠키 존재
// 여부만 확인한다(better-auth가 미들웨어/proxy용으로 권장하는 패턴). 실제
// 세션 유효성(서명, 만료, allowlist 재검증)은 getCurrentSession()이 라우트
// 핸들러/서버 컴포넌트에서 수행한다.
export function hasSessionCookie(request: Request): boolean {
  return getSessionCookie(request) !== null;
}
