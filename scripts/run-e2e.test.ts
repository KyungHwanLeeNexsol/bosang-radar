import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// AC-RUNTIME-022 — 진입점→Playwright 러너 간 env 전달의 구조적 검증. Playwright·
// 브라우저·앱 기동 없이 pnpm test(Vitest)에서 통과해야 한다(design.md §3.5).
// 실제 DB 준비(마이그레이션·시드·테스터 프로비저닝)는 수행하되, Playwright
// 러너 생성만 기록용 대역으로 가로챈다.

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const originalEnv = { ...process.env };

function clearAssembledKeys(): void {
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.BETTER_AUTH_URL;
  delete process.env.BETTER_AUTH_SECRET;
  delete process.env.TESTER_PASSWORD;
  delete process.env.TURSO_AUTH_TOKEN;
}

describe("assembleE2EEnv", () => {
  beforeEach(() => {
    clearAssembledKeys();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("file: 스킴 로컬 DB, 8자 이상 TESTER_PASSWORD, E2E 전용 BETTER_AUTH_SECRET을 조립하고 자신의 process.env에 반영한다", async () => {
    const { assembleE2EEnv } = await import("./run-e2e.ts");

    const assembled = assembleE2EEnv();

    expect(assembled.TURSO_DATABASE_URL.startsWith("file:")).toBe(true);
    expect(assembled.TESTER_PASSWORD.length).toBeGreaterThanOrEqual(8);
    expect(assembled.BETTER_AUTH_SECRET.length).toBeGreaterThan(0);
    expect(assembled.BETTER_AUTH_URL).toBe("http://localhost:3000");

    expect(process.env.TURSO_DATABASE_URL).toBe(assembled.TURSO_DATABASE_URL);
    expect(process.env.BETTER_AUTH_URL).toBe(assembled.BETTER_AUTH_URL);
    expect(process.env.BETTER_AUTH_SECRET).toBe(assembled.BETTER_AUTH_SECRET);
    expect(process.env.TESTER_PASSWORD).toBe(assembled.TESTER_PASSWORD);
  });

  it("매 호출마다 다른 시크릿을 생성한다", async () => {
    const { assembleE2EEnv } = await import("./run-e2e.ts");

    const first = assembleE2EEnv();
    const second = assembleE2EEnv();

    expect(first.BETTER_AUTH_SECRET).not.toBe(second.BETTER_AUTH_SECRET);
    expect(first.TESTER_PASSWORD).not.toBe(second.TESTER_PASSWORD);
  });
});

describe("runE2E — AC-RUNTIME-022 구조적 검증 (Playwright·브라우저·앱 기동 불필요)", () => {
  beforeEach(() => {
    clearAssembledKeys();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("Playwright 러너 spawn 호출에 전달된 env가 진입점이 조립한 값과 일치하고, TURSO_DATABASE_URL이 file: 스킴이다", async () => {
    const { runE2E } = await import("./run-e2e.ts");

    let capturedEnv: NodeJS.ProcessEnv | undefined;
    const fakeChild = new EventEmitter() as EventEmitter & {
      stdout?: unknown;
      stderr?: unknown;
    };

    const spawnFn = vi.fn(
      (_command: string, _args: readonly string[], options: { env?: NodeJS.ProcessEnv }) => {
        capturedEnv = options.env;
        // 실제 자식 프로세스 없이 즉시 종료 이벤트를 발생시켜 러너를 흉내낸다.
        queueMicrotask(() => fakeChild.emit("close", 0));
        return fakeChild;
      }
    );

    const exitCode = await runE2E(spawnFn as never);

    expect(exitCode).toBe(0);
    expect(spawnFn).toHaveBeenCalledTimes(1);
    expect(capturedEnv).toBeDefined();

    // 이 시점에 process.env는 runE2E()가 조립한 값 그대로여야 한다(중간
    // 재조립·누락·침묵 변경 없음).
    expect(capturedEnv?.BETTER_AUTH_SECRET).toBe(process.env.BETTER_AUTH_SECRET);
    expect(capturedEnv?.TESTER_PASSWORD).toBe(process.env.TESTER_PASSWORD);
    expect(capturedEnv?.TURSO_DATABASE_URL).toBe(process.env.TURSO_DATABASE_URL);
    expect(capturedEnv?.BETTER_AUTH_URL).toBe(process.env.BETTER_AUTH_URL);
    expect(capturedEnv?.TURSO_DATABASE_URL?.startsWith("file:")).toBe(true);
  }, 20000);

  it("실행 후 .tmp/e2e.db가 실제로 초기화·마이그레이션·시드·테스터 프로비저닝된 상태다", async () => {
    const { runE2E } = await import("./run-e2e.ts");

    const fakeChild = new EventEmitter();
    const spawnFn = vi.fn(() => {
      queueMicrotask(() => fakeChild.emit("close", 0));
      return fakeChild;
    });

    await runE2E(spawnFn as never);

    const dbPath = path.join(projectRoot, ".tmp", "e2e.db");
    expect(existsSync(dbPath)).toBe(true);
  }, 20000);
});
