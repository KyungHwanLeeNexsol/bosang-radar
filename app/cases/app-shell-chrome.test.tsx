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
});
