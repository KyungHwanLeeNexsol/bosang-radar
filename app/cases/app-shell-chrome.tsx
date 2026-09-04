"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Menu, X } from "lucide-react";
import { SidebarNavItems } from "./case-shell-nav";
import { SidebarUserBlock } from "./sidebar-user-block";
import { CaseShellTopbar } from "./case-shell-topbar";

// SPEC-UI-MIGRATION-001 M8 (REQ-016/017, plan.md §B 결정 7) — App Shell의
// 반응형 셸(사이드바/헤더/드로어/스크림)을 담당하는 클라이언트 컴포넌트.
// app/cases/layout.tsx(서버 컴포넌트)는 이 컴포넌트를 렌더링만 하며 세션을
// 직접 조회하지 않는다(REQ-005 무변경). 네이티브 React state + 표준 DOM
// 이벤트로 구현하며(신규 라이브러리 도입 없음), 1024px 미만에서는 오프캔버스
// 드로어 + 스크림으로, 1024px 이상에서는 고정 사이드바로 전환된다.
//
// 잔여 위험 노트: research.md §10/plan.md §F4는 이미 설치된 @base-ui/react의
// Dialog 프리미티브(포커스 트랩/스크롤 잠금 내장)를 run-phase에 우선
// 검토하도록 안내한다. 이 구현은 그 대안(§B 결정 7의 네이티브 폴백)을
// 선택했다 — Base UI Dialog의 마운트/언마운트가 트랜지션 완료 감지에
// 의존하는데, jsdom은 실제 CSS 트랜지션/애니메이션 이벤트를 발생시키지
// 않아 12개의 결정론적 AC(AC-017a~l)를 안정적으로 자동 검증하기 어렵다는
// 판단에 따른 것이다 — 네이티브 구현은 상태 전이가 완전히 동기적이라
// 각 AC를 정확히 관찰·검증할 수 있다.
const DESKTOP_MEDIA_QUERY = "(min-width: 1024px)";
const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

// useSyncExternalStore로 matchMedia를 구독한다 — 클라이언트 첫 렌더(hydration)
// 시점에는 getServerSnapshot(고정 false)을 사용해 서버 렌더 결과와 정확히
// 일치시키고, 그 이후에만 실제 뷰포트 값으로 전환하므로 hydration mismatch가
// 발생하지 않는다. 초기값을 이펙트 안에서 동기적으로 setState하는 안티패턴
// (react-hooks/set-state-in-effect)도 피한다.
function subscribeToDesktopMediaQuery(callback: () => void) {
  const mediaQueryList = window.matchMedia(DESKTOP_MEDIA_QUERY);
  mediaQueryList.addEventListener("change", callback);
  return () => mediaQueryList.removeEventListener("change", callback);
}

function getIsDesktopSnapshot() {
  return window.matchMedia(DESKTOP_MEDIA_QUERY).matches;
}

function getIsDesktopServerSnapshot() {
  return false;
}

export function AppShellChrome({ children }: { children: ReactNode }) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const isDesktop = useSyncExternalStore(
    subscribeToDesktopMediaQuery,
    getIsDesktopSnapshot,
    getIsDesktopServerSnapshot
  );
  const drawerRef = useRef<HTMLElement>(null);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // 뷰포트가 1024px 이상으로 바뀌면 드로어/스크림 상태를 자동으로
  // 초기화한다(AC-017h). setState는 effect 본문이 아니라 change 콜백
  // 안에서만 호출된다 — "외부 시스템 이벤트에 반응해 콜백에서 setState를
  // 호출"하는 사용법으로, effect 본문에서 곧바로 동기 호출하는 패턴과는
  // 구분된다(react-hooks/set-state-in-effect가 문제 삼는 것은 후자다).
  useEffect(() => {
    const mediaQueryList = window.matchMedia(DESKTOP_MEDIA_QUERY);
    function handleChange(event: MediaQueryListEvent) {
      if (event.matches) {
        setIsDrawerOpen(false);
      }
    }
    mediaQueryList.addEventListener("change", handleChange);
    return () => mediaQueryList.removeEventListener("change", handleChange);
  }, []);

  // 스크롤 잠금(AC-017f) + 열릴 때 포커스를 드로어 내부로 이동(AC-017e).
  useEffect(() => {
    if (isDesktop) {
      return;
    }
    if (isDrawerOpen) {
      document.body.style.overflow = "hidden";
      closeButtonRef.current?.focus();
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isDrawerOpen, isDesktop]);

  function closeDrawer() {
    setIsDrawerOpen(false);
    // 닫힐 때 포커스가 햄버거 버튼으로 복귀한다(AC-017e).
    toggleButtonRef.current?.focus();
  }

  // ESC로 닫기(AC-017c) + Tab/Shift+Tab 닫힌 루프 포커스 트랩(AC-017i/j).
  function handleDrawerKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      closeDrawer();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const drawer = drawerRef.current;
    if (!drawer) {
      return;
    }
    const focusable = Array.from(drawer.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  // 모바일(비-데스크톱)에서 닫혀 있는 동안 드로어 내부는 tab 순서에서
  // 제외된다(AC-017g). 데스크톱에서는 사이드바가 항상 보이므로 절대
  // inert가 되지 않는다.
  const isDrawerInert = !isDesktop && !isDrawerOpen;
  // 모바일에서 드로어가 열려 있는 동안 배경 콘텐츠는 포커스·상호작용에서
  // 배제된다(AC-017k).
  const isBackgroundInert = !isDesktop && isDrawerOpen;

  return (
    <div className="flex min-h-full [font-family:var(--font-pretendard)]">
      {!isDesktop && isDrawerOpen ? (
        <div
          data-testid="mobile-nav-scrim"
          onClick={closeDrawer}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
        />
      ) : null}
      <aside
        ref={drawerRef}
        data-testid="mobile-nav-drawer"
        inert={isDrawerInert ? true : undefined}
        onKeyDown={handleDrawerKeyDown}
        className={`fixed inset-y-0 left-0 z-50 flex w-58 shrink-0 flex-col justify-between bg-app-sidebar px-3.5 pt-5.5 pb-4.5 transition-transform duration-200 ease-out lg:static lg:z-auto lg:translate-x-0 ${
          isDrawerOpen || isDesktop ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-[7.5px] bg-bora-accent">
                <span className="text-[14.6px] font-extrabold text-white">B</span>
              </div>
              <span className="text-[17px] font-extrabold text-white [font-family:var(--font-manrope)]">
                BORA
              </span>
            </div>
            <button
              type="button"
              ref={closeButtonRef}
              onClick={closeDrawer}
              aria-label="메뉴 닫기"
              className="flex size-8 items-center justify-center rounded text-app-sidebar-ink hover:text-white lg:hidden"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </div>
          <div className="flex flex-col gap-1">
            <p className="px-3 text-[10px] font-medium text-[#5D6875]">작업 공간</p>
            <nav aria-label="사건 관리 내비게이션" className="flex flex-col gap-1">
              <SidebarNavItems />
            </nav>
          </div>
        </div>
        <SidebarUserBlock />
      </aside>
      <div
        data-testid="app-shell-content"
        className="flex flex-1 flex-col"
        inert={isBackgroundInert ? true : undefined}
      >
        <header className="flex h-15.5 shrink-0 items-center gap-3 border-b border-app-line bg-app-surface px-4 lg:px-8">
          <button
            type="button"
            ref={toggleButtonRef}
            onClick={() => setIsDrawerOpen(true)}
            aria-label="메뉴 열기"
            data-testid="mobile-nav-toggle"
            className="flex size-9 shrink-0 items-center justify-center rounded text-bora-ink-3 hover:text-bora-ink lg:hidden"
          >
            <Menu aria-hidden="true" className="size-5" />
          </button>
          <CaseShellTopbar />
        </header>
        <main className="flex flex-1 flex-col bg-app-bg">{children}</main>
      </div>
    </div>
  );
}
