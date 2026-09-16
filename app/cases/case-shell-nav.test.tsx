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

  // SPEC-UI-MIGRATION-001 Post-M8 Round2 (D1) — design/exports/04-App-Shell.png는
  // 사이드바 5항목 모두 아이콘을 갖는다. 기존 3개 실재 nav 항목(NavLink)에는
  // 아이콘이 전혀 렌더링되지 않던 결함(ComingSoonNavLink만 아이콘 보유)의 회귀 방지.
  it("D1: 실재 3항목(NavLink) 각각이 svg 아이콘을 포함한다", () => {
    ({ container, root } = render("/cases/new"));
    const inputLink = container.querySelector('a[href="/cases/new"]');
    expect(inputLink?.querySelector("svg")).not.toBeNull();

    const disabledReport = Array.from(
      container.querySelectorAll('span[aria-disabled="true"]')
    ).find((el) => el.textContent?.includes("리서치 리포트"));
    expect(disabledReport?.querySelector("svg")).not.toBeNull();

    const disabledFeedback = Array.from(
      container.querySelectorAll('span[aria-disabled="true"]')
    ).find((el) => el.textContent?.includes("전문가 피드백"));
    expect(disabledFeedback?.querySelector("svg")).not.toBeNull();
  });

  // SPEC-SIDEBAR-NAV-001 M1 (REQ-001~002, AC-001) — "전문가 피드백"은 별도
  // 라우트가 아니라 인페이지 앵커 이동이므로, 페이지형 아이콘(MessageSquare)이
  // 아닌 인페이지 이동을 암시하는 아이콘(CornerDownRight)을 사용해야 한다.
  it("AC-001: '전문가 피드백' 링크는 CornerDownRight 아이콘을 포함하고 MessageSquare 아이콘은 포함하지 않는다", () => {
    ({ container, root } = render("/cases/case-1"));
    const feedbackLink = container.querySelector<HTMLAnchorElement>(
      'a[href="/cases/case-1#expert-feedback"]'
    )!;
    expect(feedbackLink).not.toBeNull();

    const icon = feedbackLink.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute("class")).toContain("lucide-corner-down-right");
    expect(icon?.getAttribute("class")).not.toContain("lucide-message-square");
  });

  // SPEC-SIDEBAR-NAV-001 M2 (REQ-003, AC-003) — 활성 "전문가 피드백" 링크는
  // 새 페이지 이동이 아닌 현재 페이지 내 이동임을 스크린 리더 사용자에게
  // 전달하는 aria-label을 가져야 한다.
  it("AC-003: 활성 '전문가 피드백' 링크는 인페이지 이동을 명시하는 aria-label을 가진다", () => {
    ({ container, root } = render("/cases/case-1"));
    const feedbackLink = container.querySelector<HTMLAnchorElement>(
      'a[href="/cases/case-1#expert-feedback"]'
    )!;
    expect(feedbackLink).not.toBeNull();

    const ariaLabel = feedbackLink.getAttribute("aria-label");
    expect(ariaLabel).not.toBeNull();
    expect(ariaLabel).toContain("전문가 피드백");
  });

  // SPEC-SIDEBAR-NAV-001 M2 (REQ-004, AC-004) — 비활성(currentCaseId 부재)
  // "전문가 피드백" <span>에는 REQ-003이 신설하는 aria-label을 추가하지 않는다.
  it("AC-004: 비활성 '전문가 피드백' <span>에는 aria-label이 존재하지 않는다", () => {
    ({ container, root } = render("/cases/new"));
    const disabledFeedback = Array.from(
      container.querySelectorAll('span[aria-disabled="true"]')
    ).find((el) => el.textContent?.includes("전문가 피드백"));
    expect(disabledFeedback).not.toBeUndefined();
    expect(disabledFeedback?.getAttribute("aria-label")).toBeNull();
  });
});
