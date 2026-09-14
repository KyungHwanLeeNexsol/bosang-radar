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
});
