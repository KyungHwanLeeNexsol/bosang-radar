import type { ReactNode } from "react";
import localFont from "next/font/local";
import { Manrope } from "next/font/google";
import { AppShellChrome } from "./app-shell-chrome";

// SPEC-PILOT-VISUAL-001 M2 (REQ-002/003/005) — Pretendard/Manrope 폰트 로딩은
// 전량 이 파일 내부에서만 이루어진다. app/layout.tsx(루트)는 폰트 목적으로
// 전혀 수정되지 않으며, 결과 폰트-변수 클래스는 아래 래퍼 엘리먼트에만
// 적용된다 — `/`, `/login` 등 이 SPEC 범위 밖 라우트는 영향받지 않는다.
const pretendard = localFont({
  src: "../../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  display: "swap",
  weight: "45 920",
  variable: "--font-pretendard",
});

// BORA 워드마크(텍스트로 렌더링)에만 적용되는 Manrope ExtraBold(REQ-003).
const manrope = Manrope({
  subsets: ["latin"],
  weight: "800",
  variable: "--font-manrope",
});

// bare UI — 신규 앱 셸(다크 Sidebar + Topbar), app/cases/new와
// app/cases/[caseId]에만 적용된다(REQ-004/005). 사이드바 nav 링크 로직은
// pathname 전용이며 신규 DB/API 호출이 없다(REQ-006, case-shell-nav.tsx).
// SPEC-UI-MIGRATION-001 M2(REQ-005) — 하단 사용자 블록은 별도 클라이언트
// 컴포넌트(sidebar-user-block.tsx)로 분리했다. 이 레이아웃(서버 컴포넌트)
// 자신은 getCurrentSession() 등 어떤 세션 동적 API도 직접 호출하지 않는다
// — 그렇게 하면 이 레이아웃이 감싸는 모든 라우트의 렌더링 모드가 레이아웃
// 자신의 선택이 되어버려, 개별 페이지(예: /cases/new)가 자신의 렌더링
// 모드를 스스로 결정할 수 없게 된다.
// SPEC-UI-MIGRATION-001 M8(REQ-016/017) — 반응형 셸(고정 사이드바 ↔
// 오프캔버스 드로어)은 클라이언트 컴포넌트(app-shell-chrome.tsx)로
// 분리했다. 이 레이아웃은 폰트 변수만 제공하고 그 컴포넌트를 렌더링만
// 한다 — 세션 조회 경계는 무변경이다.
export default function CasesLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${pretendard.variable} ${manrope.variable} contents`}>
      <AppShellChrome>{children}</AppShellChrome>
    </div>
  );
}
