// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// app/login/page.tsx는 이제 이미 로그인된 사용자가 접근하면 /cases/new로
// 리다이렉트한다(app/cases/new/page.tsx의 세션 가드 패턴과 동일).
// 로그인 폼 렌더링 자체는 LoginForm이 담당하므로, 여기서는 가드 동작과
// 미로그인 시 폼이 정상 렌더링되는지만 검증한다.

const { getCurrentSessionMock, redirectMock, pushMock, refreshMock, signInEmailMock } = vi.hoisted(
  () => ({
    getCurrentSessionMock: vi.fn(),
    redirectMock: vi.fn(() => {
      throw new Error("NEXT_REDIRECT");
    }),
    pushMock: vi.fn(),
    refreshMock: vi.fn(),
    signInEmailMock: vi.fn(),
  })
);

vi.mock("@/lib/auth/session", () => ({
  getCurrentSession: getCurrentSessionMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

vi.mock("@/lib/auth/client", () => ({
  authClient: { signIn: { email: signInEmailMock } },
}));

async function renderPage(container: HTMLDivElement, root: Root) {
  const { default: LoginPage } = await import("./page");
  const element = await LoginPage();
  await act(async () => {
    root.render(element);
  });
  return container;
}

describe("app/login/page — 이미 로그인된 사용자 가드", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.resetModules();
    getCurrentSessionMock.mockReset();
    redirectMock.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("이미 로그인된 사용자가 접근하면 /cases/new로 리다이렉트한다", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    const { default: LoginPage } = await import("./page");

    await expect(LoginPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/cases/new");
  });

  it("로그인 세션이 없으면 리다이렉트하지 않고 로그인 폼을 렌더링한다", async () => {
    getCurrentSessionMock.mockResolvedValue(null);

    await renderPage(container, root);

    expect(redirectMock).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="login-form"]')).not.toBeNull();
  });

  // SPEC-PILOT-LAUNCH-001 M1(REQ-PILOT-LAUNCH-001, AC-PILOT-LAUNCH-001/007)
  // — 파일럿 출시 전 "테스터" 문구 제거. 캡션은 완전히 제거하고, 헤딩/부제는
  // 일반 로그인 문구로 교체한다.
  it("REQ-PILOT-LAUNCH-001: TESTER LOGIN 캡션이 제거되고, 헤딩/부제가 일반 로그인 문구로 교체된다", async () => {
    getCurrentSessionMock.mockResolvedValue(null);

    await renderPage(container, root);

    expect(container.textContent).not.toContain("TESTER LOGIN");
    expect(container.textContent).not.toContain("테스터 로그인");
    expect(container.textContent).not.toContain(
      "운영자가 승인한 테스터 계정으로만 로그인할 수 있습니다."
    );
    expect(container.querySelector("h1")?.textContent).toBe("로그인");
    expect(container.textContent).toContain("승인된 계정으로만 로그인할 수 있습니다.");
  });
});
