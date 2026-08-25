import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(() => ({ __mockLibsqlClient: true })),
}));

const { validateEnvMock } = vi.hoisted(() => ({
  validateEnvMock: vi.fn(),
}));

vi.mock("@libsql/client", () => ({
  createClient: createClientMock,
}));

vi.mock("../env", () => ({
  validateEnv: validateEnvMock,
}));

describe("lib/db/client", () => {
  beforeEach(() => {
    vi.resetModules();
    createClientMock.mockClear();
    validateEnvMock.mockReset();
    validateEnvMock.mockReturnValue({
      scope: "app",
      TURSO_DATABASE_URL: "libsql://test-db.turso.io",
      TURSO_AUTH_TOKEN: "test-token",
    });
  });

  it("app 스코프로 lib/env.ts의 validateEnv를 경유해 createClient()를 호출한다 (AC-SCAFFOLD-004)", async () => {
    const { createDbClient } = await import("./client");
    createDbClient();

    expect(validateEnvMock).toHaveBeenCalledWith("app");
    expect(createClientMock).toHaveBeenCalledWith({
      url: "libsql://test-db.turso.io",
      authToken: "test-token",
    });
  });

  it("validateEnv가 던지는 예외를 그대로 전파한다(자체 인라인 검사를 재구현하지 않는다)", async () => {
    validateEnvMock.mockImplementation(() => {
      throw new Error("env missing");
    });
    const { createDbClient } = await import("./client");

    expect(() => createDbClient()).toThrow("env missing");
  });

  it("file: 스킴 응답(TURSO_AUTH_TOKEN 없음)이어도 createClient()에 authToken: undefined로 정상 위임한다", async () => {
    validateEnvMock.mockReturnValue({
      scope: "app",
      TURSO_DATABASE_URL: "file:./.tmp/e2e.db",
      TURSO_AUTH_TOKEN: undefined,
    });
    const { createDbClient } = await import("./client");
    createDbClient();

    expect(createClientMock).toHaveBeenCalledWith({
      url: "file:./.tmp/e2e.db",
      authToken: undefined,
    });
  });

  it("getDb()는 클라이언트를 1회만 생성하고 이후 재사용한다", async () => {
    const { getDb } = await import("./client");
    const first = getDb();
    const second = getDb();

    expect(first).toBe(second);
    expect(createClientMock).toHaveBeenCalledTimes(1);
  });
});
