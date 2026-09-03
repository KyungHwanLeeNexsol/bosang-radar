import type { ReactNode } from "react";
import localFont from "next/font/local";
import { Manrope } from "next/font/google";
import { SidebarNavItems } from "./case-shell-nav";

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
// 하단 사용자 블록은 정적 라벨을 사용한다 — 이 레이아웃에서 세션 조회를
// 도입하면 이전까지 정적으로 생성되던 /cases/new가 빌드 시점 DB 연결을
// 시도하다 실패한다(REQ-014 "신규 I/O 없음" 원칙과도 부합).
export default function CasesLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${pretendard.variable} ${manrope.variable} flex min-h-full [font-family:var(--font-pretendard)]`}
    >
      <aside className="flex w-58 shrink-0 flex-col justify-between bg-app-sidebar px-3.5 pt-5.5 pb-4.5">
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-2 px-1">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-[7.5px] bg-bora-accent">
              <span className="text-[14.6px] font-extrabold text-white">B</span>
            </div>
            <span className="text-[17px] font-extrabold text-white [font-family:var(--font-manrope)]">
              BORA
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <p className="px-3 text-[10px] font-medium text-[#5D6875]">작업 공간</p>
            <nav aria-label="사건 관리 내비게이션" className="flex flex-col gap-1">
              <SidebarNavItems />
            </nav>
          </div>
        </div>
        <div className="flex items-center gap-2.5 border-t border-app-sidebar-line pt-4">
          <div className="flex size-7.5 shrink-0 items-center justify-center rounded bg-[#242D38] text-sm font-semibold text-white">
            손
          </div>
          <div className="flex min-w-0 flex-col">
            <p className="truncate text-[12.5px] font-semibold text-white">담당 손해사정사</p>
            <p className="truncate text-[11px] font-medium text-app-sidebar-ink">BORA 리서치</p>
          </div>
        </div>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex h-15.5 shrink-0 items-center justify-between border-b border-app-line bg-app-surface px-8">
          <div className="flex flex-col justify-center">
            <p className="text-meta font-normal text-bora-ink-4">BORA</p>
            <h2 className="text-h3 font-semibold text-bora-ink">사건 관리</h2>
          </div>
        </header>
        <main className="flex flex-1 flex-col bg-app-bg">{children}</main>
      </div>
    </div>
  );
}
