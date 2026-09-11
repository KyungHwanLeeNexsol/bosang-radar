import { beforeEach, describe, expect, it, vi } from "vitest";

const { headersMock, getAuthMock, getSessionMock } = vi.hoisted(() => ({
  headersMock: vi.fn(),
  getAuthMock: vi.fn(),
  getSessionMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: headersMock,
}));

vi.mock("./config", () => ({
  getAuth: getAuthMock,
}));

describe("lib/auth/session", () => {
  beforeEach(() => {
    headersMock.mockReset();
    getAuthMock.mockReset();
    getSessionMock.mockReset();
    getAuthMock.mockReturnValue({ api: { getSession: getSessionMock } });
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
