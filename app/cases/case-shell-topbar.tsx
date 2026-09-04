"use client";

import { usePathname } from "next/navigation";

// SPEC-UI-MIGRATION-001 M2 (REQ-006, design.md §4) — 정확한 라우트→
// 브레드크럼/타이틀 매핑. usePathname()은 URL 프래그먼트를 포함하지 않으므로
// "#expert-feedback" 존재 여부와 무관하게 /cases/[caseId]는 항상 동일한
// 결과를 낸다(별도 화면이 아닌 인페이지 앵커). 기존과 동일하게
// position: fixed/sticky를 적용하지 않아 본문과 함께 스크롤된다.
function resolveTopbar(pathname: string): { breadcrumb: string; title: string } {
  if (pathname === "/cases/new") {
    return { breadcrumb: "작업 공간 / 사건 입력", title: "사건 입력" };
  }
  return { breadcrumb: "작업 공간 / 리서치 리포트", title: "리서치 리포트" };
}

export function CaseShellTopbar() {
  const pathname = usePathname();
  const { breadcrumb, title } = resolveTopbar(pathname);

  return (
    <div className="flex flex-col justify-center">
      <p className="text-meta font-normal text-bora-ink-4">{breadcrumb}</p>
      <h2 className="text-h3 font-semibold text-bora-ink">{title}</h2>
    </div>
  );
}
