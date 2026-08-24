import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getSessionCookieMock } = vi.hoisted(() => ({
  getSessionCookieMock: vi.fn(),
}));

vi.mock("better-auth/cookies", () => ({
  getSessionCookie: getSessionCookieMock,
}));

describe("proxy (AC-SCAFFOLD-009)", () => {
  beforeEach(() => {
    getSessionCookieMock.mockReset();
  });

  it("비로그인 상태로 /cases/new에 접근하면 /login으로 리다이렉트한다", async () => {
    getSessionCookieMock.mockReturnValue(null);
    const { proxy } = await import("./proxy");
    const request = new NextRequest("http://localhost:3000/cases/new");

    const response = proxy(request);

    expect(response.headers.get("location")).toContain("/login");
  });

  it("비로그인 상태로 /api/cases에 접근하면 /login으로 리다이렉트한다", async () => {
    getSessionCookieMock.mockReturnValue(null);
    const { proxy } = await import("./proxy");
    const request = new NextRequest("http://localhost:3000/api/cases");

    const response = proxy(request);

    expect(response.headers.get("location")).toContain("/login");
  });

  it("세션 쿠키가 있으면 /cases/*를 통과시킨다 (리다이렉트하지 않는다)", async () => {
    getSessionCookieMock.mockReturnValue("session-token");
    const { proxy } = await import("./proxy");
    const request = new NextRequest("http://localhost:3000/cases/new");

    const response = proxy(request);

    expect(response.headers.get("location")).toBeNull();
  });

  it("보호 대상이 아닌 경로(/)는 세션이 없어도 통과시킨다", async () => {
    getSessionCookieMock.mockReturnValue(null);
    const { proxy } = await import("./proxy");
    const request = new NextRequest("http://localhost:3000/");

    const response = proxy(request);

    expect(response.headers.get("location")).toBeNull();
  });

  it("보호 대상이 아닌 /login 자체는 세션 없이도 통과시킨다", async () => {
    getSessionCookieMock.mockReturnValue(null);
    const { proxy } = await import("./proxy");
    const request = new NextRequest("http://localhost:3000/login");

    const response = proxy(request);

    expect(response.headers.get("location")).toBeNull();
  });
});
