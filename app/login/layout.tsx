import type { ReactNode } from "react";
import localFont from "next/font/local";
import { Manrope } from "next/font/google";

// SPEC-UI-MIGRATION-001 M1 (REQ-002/003, plan.md §B 결정 1) — app/cases/layout.tsx와
// 동일한 방식으로 Pretendard/Manrope 폰트를 이 파일 내부에서만 로드한다.
// /login 라우트 세그먼트만 감싸는 형제 레이아웃이며, app/layout.tsx(루트)는
// 폰트 목적으로 전혀 수정되지 않는다 — `/`, `/cases/**` 등 이 SPEC 범위
// 밖 라우트는 이 레이아웃의 영향을 받지 않는다.
const pretendard = localFont({
  src: "../../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  display: "swap",
  weight: "45 920",
  variable: "--font-pretendard",
});

const manrope = Manrope({
  subsets: ["latin"],
  weight: "800",
  variable: "--font-manrope",
});

export default function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${pretendard.variable} ${manrope.variable} flex min-h-full flex-1 [font-family:var(--font-pretendard)]`}
    >
      {children}
    </div>
  );
}
