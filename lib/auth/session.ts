import { headers } from "next/headers";
import { getAuth } from "./config";

// @MX:ANCHOR: [AUTO] app/api/cases/(M4), app/cases/(M5)가 의존하는 현재 로그인
// 사용자 세션 조회 헬퍼
// @MX:REASON: 세션 조회 방식이 바뀌면(예: 쿠키 캐시 전략 변경) 다수 지점이
// 영향을 받는다(plan.md §F).
// NOTE: proxy.ts(Next.js 16 Middleware)는 이 파일이 아니라
// lib/auth/session-cookie.ts의 hasSessionCookie를 사용한다 — 이 파일은
// getAuth()를 통해 DB 접근 코드(lib/db/client -> @libsql/client, 네이티브
// 애드온)를 정적으로 참조하므로 Middleware 번들에 포함되면 안 된다.
export async function getCurrentSession() {
  return getAuth().api.getSession({ headers: await headers() });
}
