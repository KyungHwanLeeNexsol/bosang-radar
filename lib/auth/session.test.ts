import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionCookieMock, headersMock, getAuthMock, getSessionMock } = vi.hoisted(() => ({
  getSessionCookieMock: vi.fn(),
  headersMock: vi.fn(),
  getAuthMock: vi.fn(),
  getSessionMock: vi.fn(),
}));

vi.mock("better-auth/cookies", () => ({
  getSessionCookie: getSessionCookieMock,
}));

vi.mock("next/headers", () => ({
  headers: headersMock,
}));

vi.mock("./config", () => ({
  getAuth: getAuthMock,
}));

describe("lib/auth/session", () => {
  beforeEach(() => {
    getSessionCookieMock.mockReset();
    headersMock.mockReset();
    getAuthMock.mockReset();
    getSessionMock.mockReset();
    getAuthMock.mockReturnValue({ api: { getSession: getSessionMock } });
  });

  it("hasSessionCookie()는 세션 쿠키가 있으면 true를 반환한다", async () => {
    getSessionCookieMock.mockReturnValue("token-value");
    const { hasSessionCookie } = await import("./session");

    expect(hasSessionCookie(new Request("http://localhost/cases"))).toBe(true);
  });

  it("hasSessionCookie()는 세션 쿠키가 없으면 false를 반환한다 (proxy.ts 리다이렉트 판단 기준)", async () => {
    getSessionCookieMock.mockReturnValue(null);
    const { hasSessionCookie } = await import("./session");

    expect(hasSessionCookie(new Request("http://localhost/cases"))).toBe(false);
  });

  it("getCurrentSession()은 next/headers의 headers()를 better-auth getSession에 그대로 전달한다", async () => {
    const fakeHeaders = new Headers({ cookie: "session_token=abc" });
    headersMock.mockResolvedValue(fakeHeaders);
    getSessionMock.mockResolvedValue({ user: { id: "u1" }, session: { id: "s1" } });
    const { getCurrentSession } = await import("./session");

    const result = await getCurrentSession();

    expect(getSessionMock).toHaveBeenCalledWith({ headers: fakeHeaders });
    expect(result).toEqual({ user: { id: "u1" }, session: { id: "s1" } });
  });
});
