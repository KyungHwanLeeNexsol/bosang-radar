// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidebarNavItems } from "./case-shell-nav";

// SPEC-UI-MIGRATION-001 M2 (REQ-004) — 사이드바 신규 비활성 2항목
// (sidebar-nav-archive / sidebar-nav-precedent-db) + 기존 3항목의
// pathname 전용 링크 규칙(SPEC-PILOT-VISUAL-001 AC-004) 회귀 없음 확인.

const { pathnameMock } = vi.hoisted(() => ({ pathnameMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathnameMock(),
}));

function render(pathname: string) {
  pathnameMock.mockReturnValue(pathname);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<SidebarNavItems />);
  });
  return { container, root };
}

describe("app/cases/case-shell-nav — 사이드바 nav 4항목", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  // "전문가 피드백" 메뉴 삭제(사용자 요청, SPEC-SIDEBAR-NAV-001의 인페이지
  // 앵커 유지 결정을 뒤집음) — 5항목 → 4항목.
  it("AC-004: 정확히 4개 항목이 렌더링된다", () => {
    ({ container, root } = render("/cases/new"));
    const links = container.querySelectorAll("a, span[aria-disabled]");
    expect(links).toHaveLength(4);
  });

  it("AC-004: 신규 2항목은 href 없이 aria-disabled=true이며 '준비 중' Chip을 포함한다", () => {
    ({ container, root } = render("/cases/new"));
    const archive = container.querySelector('[data-testid="sidebar-nav-archive"]')!;
    const precedentDb = container.querySelector('[data-testid="sidebar-nav-precedent-db"]')!;

    for (const el of [archive, precedentDb]) {
      expect(el.getAttribute("aria-disabled")).toBe("true");
      expect(el.getAttribute("href")).toBeNull();
      expect(el.textContent).toContain("준비 중");
    }
    expect(archive.textContent).toContain("리포트 보관함");
    expect(precedentDb.textContent).toContain("판례·약관 자료실");
  });

  it("기존 3항목 pathname 전용 링크 규칙(SPEC-PILOT-VISUAL-001 AC-004) 회귀 없음 — /cases/new", () => {
    ({ container, root } = render("/cases/new"));
    const inputLink = container.querySelector('a[href="/cases/new"]');
    expect(inputLink).not.toBeNull();
    expect(inputLink?.textContent).toBe("사건 입력");

    const disabledLabels = Array.from(container.querySelectorAll('span[aria-disabled="true"]')).map(
      (el) => el.textContent
    );
    expect(disabledLabels).toEqual(expect.arrayContaining(["리서치 리포트"]));
  });

  it("기존 3항목 pathname 전용 링크 규칙 회귀 없음 — /cases/case-1", () => {
    ({ container, root } = render("/cases/case-1"));
    expect(container.querySelector('a[href="/cases/case-1"]')?.textContent).toBe("리서치 리포트");
  });

  // SPEC-UI-MIGRATION-001 Post-M8 Round2 (D1) — design/exports/04-App-Shell.png는
  // 사이드바 항목마다 아이콘을 갖는다. 기존 실재 nav 항목(NavLink)에는
  // 아이콘이 전혀 렌더링되지 않던 결함(ComingSoonNavLink만 아이콘 보유)의 회귀 방지.
  it("D1: 실재 2항목(NavLink) 각각이 svg 아이콘을 포함한다", () => {
    ({ container, root } = render("/cases/new"));
    const inputLink = container.querySelector('a[href="/cases/new"]');
    expect(inputLink?.querySelector("svg")).not.toBeNull();

    const disabledReport = Array.from(
      container.querySelectorAll('span[aria-disabled="true"]')
    ).find((el) => el.textContent?.includes("리서치 리포트"));
    expect(disabledReport?.querySelector("svg")).not.toBeNull();
  });
});
