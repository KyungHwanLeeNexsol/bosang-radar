"use client";

import { usePathname } from "next/navigation";

// SPEC-UI-MIGRATION-001 M2 (REQ-006, design.md §4) — 정확한 라우트→
// 브레드크럼/타이틀 매핑. usePathname()은 URL 프래그먼트를 포함하지 않으므로
// "#expert-feedback" 존재 여부와 무관하게 /cases/[caseId]는 항상 동일한
// 결과를 낸다(별도 화면이 아닌 인페이지 앵커). 기존과 동일하게
// position: fixed/sticky를 적용하지 않아 본문과 함께 스크롤된다.
//
// SPEC-UI-MIGRATION-001 Post-M8 Round2 (D3.1) — 사건 입력 화면의 굵은 H2
// 타이틀만 "신규 사건 리서치 요청"으로 변경한다. 작은 브레드크럼 라벨
// ("작업 공간 / 사건 입력")은 그대로 유지한다(design.md 대비 시각 정합성
// 보정 — Pencil 05-사건-입력.png).
function resolveTopbar(pathname: string): { breadcrumb: string; title: string } {
  if (pathname === "/cases/new") {
    return { breadcrumb: "작업 공간 / 사건 입력", title: "신규 사건 리서치 요청" };
  }
  return { breadcrumb: "작업 공간 / 리서치 리포트", title: "리서치 리포트" };
}

export function CaseShellTopbar() {
  const pathname = usePathname();
  const { breadcrumb, title } = resolveTopbar(pathname);
  const isCaseInput = pathname === "/cases/new";

  return (
    <div className="flex flex-1 items-center justify-between gap-3">
      <div className="flex flex-col justify-center">
        <p className="text-meta font-normal text-bora-ink-4">{breadcrumb}</p>
        <h2 className="text-h3 font-semibold text-bora-ink">{title}</h2>
      </div>
      {/* SPEC-UI-MIGRATION-001 Post-M8 Round2 (D3.9) — "임시저장" 상태 표시.
          실제 저장 시각을 알 수 없으므로 상대 시간 문구는 넣지 않는다.
          백엔드 호출·상태 없는 순수 시각 placeholder다. */}
      {isCaseInput ? (
        <span
          aria-disabled="true"
          data-testid="case-input-topbar-draft-indicator"
          className="shrink-0 cursor-not-allowed text-body-s text-bora-ink-4 opacity-40"
        >
          임시저장
        </span>
      ) : null}
    </div>
  );
}
