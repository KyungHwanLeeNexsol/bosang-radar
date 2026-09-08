// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShellChrome } from "./app-shell-chrome";

// SPEC-UI-MIGRATION-001 M8 (REQ-017) — 모바일 드로어 접근성 계약. 네이티브
// React state + 표준 DOM 이벤트로 구현했으므로(§B 결정 7의 폴백 경로),
// 실제 관찰된 동작(포커스 순환, 배경 비활성화, 스크롤 잠금)을 직접
// 검증한다(AC-017l — 프리미티브 존재 여부만으로 통과 처리 금지 원칙을,
// 네이티브 구현이므로 "실제 동작을 직접 관찰"하는 이 테스트 스위트
// 자체로 만족한다).

const { pathnameMock, useSessionMock } = vi.hoisted(() => ({
  pathnameMock: vi.fn(() => "/cases/new"),
  useSessionMock: vi.fn(() => ({ data: null, isPending: true })),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameMock(),
}));

vi.mock("@/lib/auth/client", () => ({
  authClient: { useSession: useSessionMock },
}));

// jsdom은 matchMedia를 구현하지 않으므로 제어 가능한 mock을 주입한다.
// 리스너를 보관해 두었다가 desktop 전환 이벤트를 테스트에서 직접 발생시킨다.
let mediaQueryListeners: ((event: MediaQueryListEvent) => void)[];
let mediaMatches: boolean;

function setupMatchMediaMock() {
  mediaQueryListeners = [];
  mediaMatches = false;
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: mediaMatches,
      media: query,
      addEventListener: (_event: string, listener: (event: MediaQueryListEvent) => void) => {
        mediaQueryListeners.push(listener);
      },
      removeEventListener: (_event: string, listener: (event: MediaQueryListEvent) => void) => {
        mediaQueryListeners = mediaQueryListeners.filter((l) => l !== listener);
      },
    }))
  );
}

function fireDesktopChange(matches: boolean) {
  mediaMatches = matches;
  const event = { matches } as MediaQueryListEvent;
  for (const listener of mediaQueryListeners) {
    listener(event);
  }
}

describe("app/cases/app-shell-chrome — 모바일 드로어 접근성 계약(REQ-017)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    setupMatchMediaMock();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <AppShellChrome>
          <div data-testid="page-content">content</div>
        </AppShellChrome>
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.style.overflow = "";
    vi.unstubAllGlobals();
  });

  function toggle() {
    return container.querySelector<HTMLButtonElement>('[data-testid="mobile-nav-toggle"]')!;
  }
  function drawer() {
    return container.querySelector<HTMLElement>('[data-testid="mobile-nav-drawer"]')!;
  }
  function scrim() {
    return container.querySelector('[data-testid="mobile-nav-scrim"]');
  }
  function openDrawer() {
    act(() => toggle().dispatchEvent(new MouseEvent("click", { bubbles: true })));
  }

  it("AC-017: 초기 렌더링에서 햄버거 버튼이 존재하고 드로어는 화면 밖으로 이동해 있다", () => {
    expect(toggle()).not.toBeNull();
    expect(drawer().className).toMatch(/-translate-x-full/);
  });

  it("AC-017a: 햄버거 버튼 클릭 시 드로어와 스크림이 나타난다", () => {
    openDrawer();
    expect(drawer().className).toMatch(/translate-x-0/);
    expect(scrim()).not.toBeNull();
  });

  it("AC-017b: 드로어 내부 닫기 버튼 클릭 시 드로어와 스크림이 사라진다", () => {
    openDrawer();
    const closeButton = drawer().querySelector<HTMLButtonElement>('[aria-label="메뉴 닫기"]')!;
    act(() => closeButton.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(drawer().className).toMatch(/-translate-x-full/);
    expect(scrim()).toBeNull();
  });

  it("AC-017c: ESC 키 입력 시 드로어가 닫힌다", () => {
    openDrawer();
    act(() => {
      drawer().dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
      );
    });

    expect(drawer().className).toMatch(/-translate-x-full/);
  });

  it("AC-017d: 스크림 클릭 시 드로어가 닫힌다", () => {
    openDrawer();
    act(() => scrim()!.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(drawer().className).toMatch(/-translate-x-full/);
  });

  it("AC-017e: 열릴 때 포커스가 드로어 내부로 이동하고, 닫힐 때 햄버거 버튼으로 복귀한다", () => {
    openDrawer();
    const closeButton = drawer().querySelector<HTMLButtonElement>('[aria-label="메뉴 닫기"]')!;
    expect(document.activeElement).toBe(closeButton);

    act(() => closeButton.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(document.activeElement).toBe(toggle());
  });

  it("AC-017f: 드로어가 열려 있는 동안 배경 스크롤이 잠긴다", () => {
    expect(document.body.style.overflow).toBe("");
    openDrawer();
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("AC-017g: 드로어가 닫혀 있는 동안 내부 요소가 tab 순서에서 제외된다(inert)", () => {
    expect(drawer().getAttribute("inert")).not.toBeNull();
    openDrawer();
    expect(drawer().getAttribute("inert")).toBeNull();
  });

  it("AC-017h: 390px에서 열린 상태로 1024px 이상으로 리사이즈하면 자동으로 닫히고 데스크톱 레이아웃으로 전환된다", () => {
    openDrawer();
    expect(drawer().className).toMatch(/translate-x-0/);

    act(() => fireDesktopChange(true));

    expect(scrim()).toBeNull();
    // 데스크톱에서는 항상 표시(translate-x-0)되고 다시는 inert가 아니다.
    expect(drawer().className).toMatch(/translate-x-0/);
    expect(drawer().getAttribute("inert")).toBeNull();
  });

  it("AC-017i: 드로어 내부 마지막 포커스 가능 요소에서 Tab 시 첫 요소로 순환한다(닫힌 루프)", () => {
    openDrawer();
    const focusable = drawer().querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    last.focus();
    expect(document.activeElement).toBe(last);

    act(() => {
      drawer().dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })
      );
    });

    expect(document.activeElement).toBe(first);
  });

  it("AC-017j: 드로어 내부 첫 포커스 가능 요소에서 Shift+Tab 시 마지막 요소로 순환한다(역방향 닫힌 루프)", () => {
    openDrawer();
    const focusable = drawer().querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first.focus();
    expect(document.activeElement).toBe(first);

    act(() => {
      drawer().dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Tab",
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        })
      );
    });

    expect(document.activeElement).toBe(last);
  });

  it("AC-017k: 드로어가 열린 동안 배경 콘텐츠는 inert로 비활성화된다", () => {
    const background = container.querySelector('[data-testid="app-shell-content"]')!;
    expect(background.getAttribute("inert")).toBeNull();

    openDrawer();

    expect(background.getAttribute("inert")).not.toBeNull();
  });

  it("B3(외부 리뷰, P1): 닫힘 직후 배경이 아직 inert인 순간에는 포커스 이동을 시도하지 않는다", () => {
    // jsdom은 실브라우저의 "inert 서브트리 내부 focus() 호출은 무시된다"는
    // 동작을 구현하지 않는다.햄버거 버튼이 배경 콘텐츠(app-shell-content)
    // 내부에 있으므로, 실브라우저 동작을 여기서 직접 시뮬레이션해 "닫힘
    // 직후 React 커밋 이전에 동기적으로 focus()를 호출하면 무시된다"는
    // 결함을 jsdom에서도 재현한다.
    const originalFocus = HTMLElement.prototype.focus;
    const focusSpy = vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (
      this: HTMLElement
    ) {
      if (this.closest("[inert]")) {
        return;
      }
      originalFocus.call(this);
    });

    try {
      openDrawer();
      const closeButton = drawer().querySelector<HTMLButtonElement>('[aria-label="메뉴 닫기"]')!;
      act(() => closeButton.dispatchEvent(new MouseEvent("click", { bubbles: true })));

      expect(document.activeElement).toBe(toggle());
    } finally {
      focusSpy.mockRestore();
    }
  });
});

// B2(외부 리뷰, P1): 모바일 드로어 nav 링크 클릭 시 닫기. 링크마다 pathname이
// 달라야 실제 href를 가진 활성 링크가 되므로(리서치 리포트/전문가 피드백은
// /cases/[caseId] 패턴일 때만 활성), 이 블록은 케이스 상세 경로로 pathname을
// 오버라이드한 별도 렌더 인스턴스를 사용한다.
describe("app/cases/app-shell-chrome — 모바일 드로어 nav 링크 클릭 시 닫기(B2, 외부 리뷰)", () => {
  let localContainer: HTMLDivElement;
  let localRoot: Root;

  beforeEach(() => {
    setupMatchMediaMock();
  });

  afterEach(() => {
    act(() => localRoot.unmount());
    localContainer.remove();
    document.body.style.overflow = "";
    vi.unstubAllGlobals();
  });

  function renderWithPathname(pathname: string) {
    pathnameMock.mockReturnValue(pathname);
    localContainer = document.createElement("div");
    document.body.appendChild(localContainer);
    localRoot = createRoot(localContainer);
    act(() => {
      localRoot.render(
        <AppShellChrome>
          <div data-testid="page-content">content</div>
        </AppShellChrome>
      );
    });
  }

  function localToggle() {
    return localContainer.querySelector<HTMLButtonElement>('[data-testid="mobile-nav-toggle"]')!;
  }
  function localDrawer() {
    return localContainer.querySelector<HTMLElement>('[data-testid="mobile-nav-drawer"]')!;
  }
  function openLocalDrawer() {
    act(() => localToggle().dispatchEvent(new MouseEvent("click", { bubbles: true })));
  }

  it("사건 입력 링크 클릭 시 드로어와 스크림이 닫힌다", () => {
    renderWithPathname("/cases/case-1");
    openLocalDrawer();
    expect(localDrawer().className).toMatch(/translate-x-0/);

    const inputLink = localDrawer().querySelector<HTMLAnchorElement>('a[href="/cases/new"]')!;
    expect(inputLink).not.toBeNull();
    act(() => inputLink.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(localDrawer().className).toMatch(/-translate-x-full/);
    expect(localContainer.querySelector('[data-testid="mobile-nav-scrim"]')).toBeNull();
    // 원래 href는 그대로 유지되어야 한다.
    expect(inputLink.getAttribute("href")).toBe("/cases/new");
  });

  it("리서치 리포트 링크 클릭 시 드로어가 닫힌다", () => {
    renderWithPathname("/cases/case-1");
    openLocalDrawer();

    const reportLink = localDrawer().querySelector<HTMLAnchorElement>('a[href="/cases/case-1"]')!;
    expect(reportLink).not.toBeNull();
    act(() => reportLink.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(localDrawer().className).toMatch(/-translate-x-full/);
    expect(reportLink.getAttribute("href")).toBe("/cases/case-1");
  });

  it("전문가 피드백(같은 페이지 #expert-feedback 앵커) 링크 클릭 시에도 드로어가 닫힌다", () => {
    renderWithPathname("/cases/case-1");
    openLocalDrawer();

    const feedbackLink = localDrawer().querySelector<HTMLAnchorElement>(
      'a[href="/cases/case-1#expert-feedback"]'
    )!;
    expect(feedbackLink).not.toBeNull();
    act(() => feedbackLink.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(localDrawer().className).toMatch(/-translate-x-full/);
    expect(feedbackLink.getAttribute("href")).toBe("/cases/case-1#expert-feedback");
  });

  it("비활성('준비 중') nav 항목 클릭은 내비게이션도 상태 변경도 일으키지 않는다", () => {
    renderWithPathname("/cases/case-1");
    openLocalDrawer();

    const archiveItem = localDrawer().querySelector<HTMLElement>(
      '[data-testid="sidebar-nav-archive"]'
    )!;
    expect(archiveItem.tagName).toBe("SPAN");
    act(() => archiveItem.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    // 드로어는 열린 채로 유지된다 — 비활성 항목은 onNavigate를 호출하지 않는다.
    expect(localDrawer().className).toMatch(/translate-x-0/);
    expect(localContainer.querySelector('[data-testid="mobile-nav-scrim"]')).not.toBeNull();
  });

  it("데스크톱 사이드바는 계속 렌더링되며(영향 없음), nav 링크 클릭 시 오류가 발생하지 않는다", () => {
    renderWithPathname("/cases/case-1");
    act(() => fireDesktopChange(true));

    const reportLink = localDrawer().querySelector<HTMLAnchorElement>('a[href="/cases/case-1"]')!;
    expect(reportLink).not.toBeNull();
    expect(() => {
      act(() => reportLink.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    }).not.toThrow();

    // 데스크톱에서는 항상 표시(translate-x-0)를 유지한다.
    expect(localDrawer().className).toMatch(/translate-x-0/);
  });
});
