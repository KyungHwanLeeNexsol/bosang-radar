import { getSessionCookie } from "better-auth/cookies";

// @MX:ANCHOR: [AUTO] proxy.ts가 의존하는 경량 세션 쿠키 존재 확인 — DB 접근 없는
// 모듈로 분리됨(원래 lib/auth/session.ts에 있었음)
// @MX:REASON: proxy.ts(Next.js 16 Middleware, 항상 nodejs 런타임)는 정적 번들링
// 시 import 그래프에 도달 가능한 전체 모듈을 포함한다. lib/auth/session.ts는
// getCurrentSession()을 위해 lib/auth/config.ts -> lib/db/client.ts를 통해
// @libsql/client(네이티브 C++ 애드온)를 모듈 최상위에서 import하므로, proxy.ts가
// 그 파일에서 hasSessionCookie만 가져와도 @libsql/client가 Middleware 번들에
// 정적으로 포함되어 Netlify Deploy Preview 빌드가 실패한다. 이 파일은
// better-auth/cookies만 import하여 DB/인증 설정 코드와 완전히 분리한다 — 다른
// import를 추가하지 말 것(회귀 테스트: proxy.import-graph.test.ts).
//
// 실제 세션 유효성(서명, 만료, allowlist 재검증)은 getCurrentSession()이 라우트
// 핸들러/서버 컴포넌트에서 수행한다(lib/auth/session.ts).
export function hasSessionCookie(request: Request): boolean {
  return getSessionCookie(request) !== null;
}
