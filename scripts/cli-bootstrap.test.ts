import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { loadEnvConfigMock, validateEnvMock } = vi.hoisted(() => ({
  loadEnvConfigMock: vi.fn(),
  validateEnvMock: vi.fn(
    (scope: string) => ({ scope, TURSO_DATABASE_URL: "file:./x.db" }) as Record<string, unknown>
  ),
}));

vi.mock("@next/env", () => ({
  default: { loadEnvConfig: loadEnvConfigMock },
}));

vi.mock("../lib/env", () => ({
  validateEnv: validateEnvMock,
}));

describe("scripts/cli-bootstrap — bootstrapCli (REQ-RUNTIME-021, AC-RUNTIME-021)", () => {
  beforeEach(() => {
    vi.resetModules();
    loadEnvConfigMock.mockReset();
    loadEnvConfigMock.mockReturnValue({
      combinedEnv: process.env,
      parsedEnv: {},
      loadedEnvFiles: [],
    });
    validateEnvMock.mockReset();
    validateEnvMock.mockReturnValue({ scope: "db", TURSO_DATABASE_URL: "file:./x.db" });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("[HARD] 순서 불변 — loadEnvConfig를 validateEnv보다 먼저 호출한다", async () => {
    const callOrder: string[] = [];
    loadEnvConfigMock.mockImplementation(() => {
      callOrder.push("load");
      return { combinedEnv: process.env, parsedEnv: {}, loadedEnvFiles: [] };
    });
    validateEnvMock.mockImplementation((scope: string) => {
      callOrder.push("validate");
      return { scope, TURSO_DATABASE_URL: "file:./x.db" } as Record<string, unknown>;
    });

    const { bootstrapCli } = await import("./cli-bootstrap");
    bootstrapCli("db");

    expect(callOrder).toEqual(["load", "validate"]);
  });

  it("loadEnvConfig를 프로젝트 루트(cwd 비의존) 경로 문자열로 정확히 1회 호출한다", async () => {
    const { bootstrapCli } = await import("./cli-bootstrap");
    bootstrapCli("db");

    expect(loadEnvConfigMock).toHaveBeenCalledTimes(1);
    const calledWith = loadEnvConfigMock.mock.calls[0]?.[0];
    expect(typeof calledWith).toBe("string");
    expect(String(calledWith).length).toBeGreaterThan(0);
  });

  it("validateEnv를 전달받은 scope 그대로 호출한다", async () => {
    const { bootstrapCli } = await import("./cli-bootstrap");
    bootstrapCli("provision");

    expect(validateEnvMock).toHaveBeenCalledWith("provision");
  });

  it("validateEnv의 반환값을 그대로 반환한다", async () => {
    validateEnvMock.mockReturnValue({
      scope: "e2e",
      TURSO_DATABASE_URL: "file:./e2e.db",
      TESTER_PASSWORD: "password123",
    });

    const { bootstrapCli } = await import("./cli-bootstrap");
    const result = bootstrapCli("e2e");

    expect(result).toEqual({
      scope: "e2e",
      TURSO_DATABASE_URL: "file:./e2e.db",
      TESTER_PASSWORD: "password123",
    });
  });
});
