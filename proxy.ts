import { NextResponse, type NextRequest } from "next/server";
import { hasSessionCookie } from "@/lib/auth/session-cookie";

// Next.js 16: middleware.ts → proxy.ts로 이름 변경, edge 런타임 미지원, nodejs
// 런타임에서만 동작한다(research.md §1). middleware.ts를 별도로 생성하지 않는다.
// proxy.ts는 항상 nodejs 런타임에서 실행되므로 `export const runtime`
// segment config는 허용되지 않는다(선언 시 빌드 오류) — 별도 런타임 선언이
// 필요 없다.

const PROTECTED_PATH_PATTERNS = [/^\/cases(\/|$)/, /^\/api\/cases(\/|$)/];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATH_PATTERNS.some((pattern) => pattern.test(pathname));
}

// @MX:ANCHOR: [AUTO] REQ-SCAFFOLD-010 — cases/*, api/cases/* 보호 경로 가드
// @MX:REASON: 인증 미들웨어의 리다이렉트 대상/보호 경로 목록이 바뀌면 모든
// 비로그인 접근 제어에 영향을 준다.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isProtectedPath(pathname) || hasSessionCookie(request)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/cases/:path*", "/api/cases/:path*"],
};
