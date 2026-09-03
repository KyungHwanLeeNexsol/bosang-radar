"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// SPEC-PILOT-VISUAL-001 M2 (REQ-006) — 사이드바 nav 3개 항목의 target을
// 현재 pathname만으로 결정론적으로 계산한다(DB/API 조회 없음). "사건 입력"은
// 항상 /cases/new. "리서치 리포트"/"전문가 피드백"은 현재 pathname이
// /cases/[caseId] 패턴과 일치할 때만 활성 링크이며, 그렇지 않으면(예:
// /cases/new) href 없이 aria-disabled="true"로 비활성 렌더링한다.
//
// usePathname()이 필요해 이 파일만 "use client" 경계를 갖는다 — 나머지
// app/cases/layout.tsx(서버 컴포넌트)는 이 파일을 렌더링만 한다(REQ-014
// 선호 — 불필요한 신규 client 경계 도입 지양).

const NAV_LABELS = {
  input: "사건 입력",
  report: "리서치 리포트",
  feedback: "전문가 피드백",
} as const;

// "/cases/new"는 문자열 형태상 "/cases/[caseId]"와 동일한 패턴과 매칭되므로
// 명시적으로 제외해야 한다 — 그렇지 않으면 "new"를 caseId로 오인한다.
function resolveCurrentCaseId(pathname: string): string | null {
  const match = pathname.match(/^\/cases\/([^/]+)$/);
  if (!match) return null;
  return match[1] === "new" ? null : match[1];
}

export function SidebarNavItems() {
  const pathname = usePathname();
  const currentCaseId = resolveCurrentCaseId(pathname);

  return (
    <>
      <NavLink href="/cases/new" label={NAV_LABELS.input} active={pathname === "/cases/new"} />
      {currentCaseId ? (
        <NavLink
          href={`/cases/${currentCaseId}`}
          label={NAV_LABELS.report}
          active={pathname === `/cases/${currentCaseId}`}
        />
      ) : (
        <NavLink label={NAV_LABELS.report} disabled />
      )}
      {currentCaseId ? (
        <NavLink href={`/cases/${currentCaseId}#expert-feedback`} label={NAV_LABELS.feedback} />
      ) : (
        <NavLink label={NAV_LABELS.feedback} disabled />
      )}
    </>
  );
}

interface NavLinkProps {
  href?: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
}

function NavLink({ href, label, active, disabled }: NavLinkProps) {
  const base = "flex items-center rounded px-3 py-2.5 text-[13px] font-medium transition-colors";

  if (disabled || !href) {
    return (
      <span aria-disabled="true" className={`${base} cursor-not-allowed text-app-sidebar-ink opacity-40`}>
        {label}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className={`${base} ${
        active
          ? "bg-app-sidebar-line text-white"
          : "text-app-sidebar-ink hover:bg-app-sidebar-line hover:text-white"
      }`}
    >
      {label}
    </Link>
  );
}
