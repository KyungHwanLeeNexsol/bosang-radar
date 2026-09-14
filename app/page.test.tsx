// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";

// app/page.tsx는 이제 별도 랜딩 UI를 렌더링하지 않고, 로그인 세션 여부에
// 따라 /cases/new 또는 /login으로 즉시 리다이렉트하는 서버 컴포넌트다.
// app/cases/new/page.test.tsx와 동일한 리다이렉트 검증 패턴을 사용한다.

const { getCurrentSessionMock, redirectMock } = vi.hoisted(() => ({
  getCurrentSessionMock: vi.fn(),
  redirectMock: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentSession: getCurrentSessionMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

describe("app/page — 루트 진입점 리다이렉트", () => {
  beforeEach(() => {
    vi.resetModules();
    getCurrentSessionMock.mockReset();
    redirectMock.mockClear();
  });

  it("로그인 세션이 있으면 /cases/new로 리다이렉트한다", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { id: "user-1" } });
    const { default: Home } = await import("./page");

    await expect(Home()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/cases/new");
  });

  it("로그인 세션이 없으면 /login으로 리다이렉트한다", async () => {
    getCurrentSessionMock.mockResolvedValue(null);
    const { default: Home } = await import("./page");

    await expect(Home()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });
});
