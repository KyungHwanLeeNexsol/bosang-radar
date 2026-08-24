import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(() => ({ __mockLibsqlClient: true })),
}));

vi.mock("@libsql/client", () => ({
  createClient: createClientMock,
}));

describe("lib/db/client", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    vi.resetModules();
    createClientMock.mockClear();
    process.env = {
      ...ORIGINAL_ENV,
      TURSO_DATABASE_URL: "libsql://test-db.turso.io",
      TURSO_AUTH_TOKEN: "test-token",
    };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("createClient()을 TURSO_DATABASE_URL/TURSO_AUTH_TOKEN 값으로 정확히 호출한다 (AC-SCAFFOLD-004)", async () => {
    const { createDbClient } = await import("./client");
    createDbClient();

    expect(createClientMock).toHaveBeenCalledWith({
      url: "libsql://test-db.turso.io",
      authToken: "test-token",
    });
  });

  it("환경변수가 설정되지 않으면 예외를 던진다", async () => {
    process.env.TURSO_DATABASE_URL = "";
    process.env.TURSO_AUTH_TOKEN = "";
    const { createDbClient } = await import("./client");

    expect(() => createDbClient()).toThrow();
  });

  it("getDb()는 클라이언트를 1회만 생성하고 이후 재사용한다", async () => {
    const { getDb } = await import("./client");
    const first = getDb();
    const second = getDb();

    expect(first).toBe(second);
    expect(createClientMock).toHaveBeenCalledTimes(1);
  });
});
