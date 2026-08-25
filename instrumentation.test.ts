import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { validateEnvMock } = vi.hoisted(() => ({
  validateEnvMock: vi.fn(),
}));

vi.mock("./lib/env", () => ({
  validateEnv: validateEnvMock,
}));

describe("instrumentation — register() (REQ-RUNTIME-010, AC-RUNTIME-009 wiring)", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    vi.resetModules();
    validateEnvMock.mockReset();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.NEXT_PHASE;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.unstubAllEnvs();
  });

  it("빌드 단계(phase-production-build)에서는 검증을 건너뛴다", async () => {
    process.env.NEXT_PHASE = "phase-production-build";
    const { register } = await import("./instrumentation");
    await register();

    expect(validateEnvMock).not.toHaveBeenCalled();
  });

  it("빌드 단계가 아니면 app 스코프로 검증을 호출한다", async () => {
    const { register } = await import("./instrumentation");
    await register();

    expect(validateEnvMock).toHaveBeenCalledWith("app");
  });

  it("검증이 실패하면(누락 변수) register()도 예외를 전파한다 — fail-fast", async () => {
    validateEnvMock.mockImplementation(() => {
      throw new Error("env missing");
    });
    const { register } = await import("./instrumentation");

    await expect(register()).rejects.toThrow("env missing");
  });

  it("[실측 M1] 검증 실패 시 프로세스를 종료한다(요청 수신 가능 상태 도달 방지, AC-RUNTIME-009) — 단, 테스트 환경(NODE_ENV=test)에서는 종료하지 않는다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    validateEnvMock.mockImplementation(() => {
      throw new Error("env missing");
    });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    const { register } = await import("./instrumentation");

    await expect(register()).rejects.toThrow();
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });

  it("테스트 환경(NODE_ENV=test)에서는 검증 실패 시 process.exit을 호출하지 않는다", async () => {
    vi.stubEnv("NODE_ENV", "test");
    validateEnvMock.mockImplementation(() => {
      throw new Error("env missing");
    });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    const { register } = await import("./instrumentation");

    await expect(register()).rejects.toThrow("env missing");
    expect(exitSpy).not.toHaveBeenCalled();

    exitSpy.mockRestore();
  });
});
