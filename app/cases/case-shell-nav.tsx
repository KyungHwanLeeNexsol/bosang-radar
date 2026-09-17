"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Archive, CircleHelp, FileText, Library } from "lucide-react";
import { Chip } from "@/components/ui/chip";

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
} as const;

// "/cases/new"는 문자열 형태상 "/cases/[caseId]"와 동일한 패턴과 매칭되므로
// 명시적으로 제외해야 한다 — 그렇지 않으면 "new"를 caseId로 오인한다.
function resolveCurrentCaseId(pathname: string): string | null {
  const match = pathname.match(/^\/cases\/([^/]+)$/);
  if (!match) return null;
  return match[1] === "new" ? null : match[1];
}

interface SidebarNavItemsProps {
  // Fix-B2(P1, 외부 리뷰): 모바일 드로어에서 활성 nav 링크를 클릭하면
  // 드로어가 닫히도록, AppShellChrome이 closeDrawer를 주입한다. 데스크톱
  // 사이드바는 같은 컴포넌트 인스턴스를 공유하므로(별도 렌더 없음) 이 콜백은
  // 항상 연결되지만, 데스크톱에서는 closeDrawer 호출이 이미 닫힌 상태를
  // 유지하는 무해한 no-op이다.
  onNavigate?: () => void;
}

export function SidebarNavItems({ onNavigate }: SidebarNavItemsProps = {}) {
  const pathname = usePathname();
  const currentCaseId = resolveCurrentCaseId(pathname);

  // SPEC-UI-MIGRATION-001 Post-M8 Round2 (D1) — Pencil design/exports/04-App-Shell.png는
  // 5개 항목 모두 아이콘을 갖는다. ComingSoonNavLink는 이미 아이콘을 렌더링하지만
  // NavLink(실재 3항목)는 아이콘이 없던 결함을 수정한다.
  const navIcon = {
    input: <CircleHelp aria-hidden="true" className="size-4" />,
    report: <FileText aria-hidden="true" className="size-4" />,
  };

  return (
    <>
      <NavLink
        href="/cases/new"
        label={NAV_LABELS.input}
        icon={navIcon.input}
        active={pathname === "/cases/new"}
        onNavigate={onNavigate}
      />
      {currentCaseId ? (
        <NavLink
          href={`/cases/${currentCaseId}`}
          label={NAV_LABELS.report}
          icon={navIcon.report}
          active={pathname === `/cases/${currentCaseId}`}
          onNavigate={onNavigate}
        />
      ) : (
        <NavLink label={NAV_LABELS.report} icon={navIcon.report} disabled />
      )}
      {/* SPEC-UI-MIGRATION-001 M2 (REQ-004) — 영구 비활성 nav 2항목. href 없음,
          DB/API 조회 없음, "준비 중" Chip만 부착한다. 실제 페이지는 만들지
          않는다(REQ-021). */}
      <ComingSoonNavLink
        testId="sidebar-nav-archive"
        icon={<Archive aria-hidden="true" className="size-4" />}
        label="리포트 보관함"
      />
      <ComingSoonNavLink
        testId="sidebar-nav-precedent-db"
        icon={<Library aria-hidden="true" className="size-4" />}
        label="판례·약관 자료실"
      />
    </>
  );
}

function ComingSoonNavLink({
  testId,
  icon,
  label,
}: {
  testId: string;
  icon: ReactNode;
  label: string;
}) {
  return (
    <span
      data-testid={testId}
      aria-disabled="true"
      className="flex cursor-not-allowed items-center gap-2 rounded px-3 py-2.5 text-[13px] font-medium text-app-sidebar-ink opacity-40"
    >
      {icon}
      <span className="flex-1">{label}</span>
      <Chip className="bg-transparent px-1.5 py-0.5 text-[10px] text-app-sidebar-ink">준비 중</Chip>
    </span>
  );
}

interface NavLinkProps {
  href?: string;
  label: string;
  icon?: ReactNode;
  active?: boolean;
  disabled?: boolean;
  // @MX:NOTE @MX:SPEC: SPEC-SIDEBAR-NAV-001 — 활성 링크 분기(아래 Link
  // 렌더링)에만 전달하는 접근성 라벨. 비활성(<span aria-disabled>) 분기에는
  // 절대 전달하지 않는다(REQ-004) — 두 분기 모두에 전달하면 AC-004가 깨진다.
  ariaLabel?: string;
  onNavigate?: () => void;
}

function NavLink({ href, label, icon, active, disabled, ariaLabel, onNavigate }: NavLinkProps) {
  const base =
    "flex items-center gap-2 rounded px-3 py-2.5 text-[13px] font-medium transition-colors";

  if (disabled || !href) {
    return (
      <span
        aria-disabled="true"
        className={`${base} cursor-not-allowed text-app-sidebar-ink opacity-40`}
      >
        {icon}
        {label}
      </span>
    );
  }

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-label={ariaLabel}
      className={`${base} ${
        active
          ? "bg-app-sidebar-line text-white"
          : "text-app-sidebar-ink hover:bg-app-sidebar-line hover:text-white"
      }`}
    >
      {icon}
      {label}
    </Link>
  );
}
