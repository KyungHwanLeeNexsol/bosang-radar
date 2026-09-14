import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionCookieMock } = vi.hoisted(() => ({
  getSessionCookieMock: vi.fn(),
}));

vi.mock("better-auth/cookies", () => ({
  getSessionCookie: getSessionCookieMock,
}));

describe("lib/auth/session-cookie", () => {
  beforeEach(() => {
    getSessionCookieMock.mockReset();
  });

  it("hasSessionCookie()는 세션 쿠키가 있으면 true를 반환한다", async () => {
    getSessionCookieMock.mockReturnValue("token-value");
    const { hasSessionCookie } = await import("./session-cookie");

    expect(hasSessionCookie(new Request("http://localhost/cases"))).toBe(true);
  });

  it("hasSessionCookie()는 세션 쿠키가 없으면 false를 반환한다 (proxy.ts 리다이렉트 판단 기준)", async () => {
    getSessionCookieMock.mockReturnValue(null);
    const { hasSessionCookie } = await import("./session-cookie");

    expect(hasSessionCookie(new Request("http://localhost/cases"))).toBe(false);
  });
});
