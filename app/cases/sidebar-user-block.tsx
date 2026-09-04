"use client";

import { authClient } from "@/lib/auth/client";

// SPEC-UI-MIGRATION-001 M2 (REQ-005, plan.md §B 결정 2) — 사이드바 하단
// 사용자 블록. app/cases/layout.tsx(서버 컴포넌트)는 이 컴포넌트를 렌더링만
// 하며 어떤 세션 동적 API도 직접 호출하지 않는다 — 세션 조회는 오직 이
// 클라이언트 컴포넌트가 Better Auth 클라이언트의 세션 훅(authClient.useSession())
// 으로만 수행한다. 로딩 중이거나 세션이 없으면 중립 폴백(이니셜 아이콘 +
// "사용자")을 표시하며, 하드코딩된 가짜 이름이나 이전 사용자의 잔존 값을
// 표시하지 않는다. `user` 테이블에 없는 소속/직함 필드는 렌더링하지 않는다.
export function SidebarUserBlock() {
  const { data, isPending } = authClient.useSession();
  const user = !isPending ? (data?.user ?? null) : null;
  const displayName = user?.name ?? "사용자";
  const initial = user?.name ? user.name.slice(0, 1) : "?";

  return (
    <div className="flex items-center gap-2.5 border-t border-app-sidebar-line pt-4">
      <div className="flex size-7.5 shrink-0 items-center justify-center rounded bg-[#242D38] text-sm font-semibold text-white">
        {initial}
      </div>
      <div className="flex min-w-0 flex-col">
        <p className="truncate text-[12.5px] font-semibold text-white">{displayName}</p>
      </div>
    </div>
  );
}
