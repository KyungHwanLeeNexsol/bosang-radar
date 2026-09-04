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

describe("app/cases/case-shell-nav — 사이드바 nav 5항목", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("AC-004: 정확히 5개 항목이 렌더링된다", () => {
    ({ container, root } = render("/cases/new"));
    const links = container.querySelectorAll("a, span[aria-disabled]");
    expect(links).toHaveLength(5);
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
    expect(disabledLabels).toEqual(expect.arrayContaining(["리서치 리포트", "전문가 피드백"]));
  });

  it("기존 3항목 pathname 전용 링크 규칙 회귀 없음 — /cases/case-1", () => {
    ({ container, root } = render("/cases/case-1"));
    expect(container.querySelector('a[href="/cases/case-1"]')?.textContent).toBe("리서치 리포트");
    expect(container.querySelector('a[href="/cases/case-1#expert-feedback"]')?.textContent).toBe(
      "전문가 피드백"
    );
  });
});
