import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withSafeEnvLocal } from "./env-local-safety.ts";

// design.md §3.6 B4 요구 — throwaway fake 값으로 실제 프로젝트 루트 .env.local을
// 대상으로 왕복 검증한다. 이 테스트 시작 시점에 실제 .env.local이 존재하지
// 않음(오케스트레이터 사전 확인 완료)을 전제하며, 테스트 자신이 그 "부재" 상태를
// 명시적으로 확인·복원하고 마지막에도 재확인한다 — 잔존 시 이 테스트가 실패한다.

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const realEnvLocalPath = path.join(projectRoot, ".env.local");

describe("withSafeEnvLocal — 실제 프로젝트 루트 왕복 (throwaway 값)", () => {
  beforeAll(() => {
    // 사전 조건: 실제 .env.local이 이미 존재하면 이 테스트는 실행하지 않는다
    // (개발자의 실제 파일을 이 테스트가 건드릴 근거가 없다).
    if (existsSync(realEnvLocalPath)) {
      throw new Error(
        "실제 .env.local이 이미 존재합니다 — 이 테스트는 부재 상태에서만 실행해야 합니다."
      );
    }
  });

  afterAll(() => {
    // 최종 방어선: 이 describe 블록의 모든 테스트가 끝난 뒤 실제 .env.local이
    // 여전히 부재 상태인지 재확인한다.
    expect(existsSync(realEnvLocalPath)).toBe(false);
  });

  it("(a) 정상 종료 — 실행 후 실제 .env.local이 부재 상태로 복원된다", async () => {
    await withSafeEnvLocal(
      "TURSO_DATABASE_URL=libsql://throwaway-fake-value.invalid\n",
      async () => {
        expect(existsSync(realEnvLocalPath)).toBe(true);
        expect(readFileSync(realEnvLocalPath, "utf-8")).toContain("throwaway-fake-value");
      },
      realEnvLocalPath
    );

    expect(existsSync(realEnvLocalPath)).toBe(false);
  });

  it("(b) 실행 중 에러 발생 — 에러가 전파되어도 실제 .env.local이 부재 상태로 복원된다", async () => {
    await expect(
      withSafeEnvLocal(
        "TURSO_DATABASE_URL=libsql://throwaway-fake-value-2.invalid\n",
        async () => {
          expect(existsSync(realEnvLocalPath)).toBe(true);
          throw new Error("시뮬레이션된 실행 중 실패");
        },
        realEnvLocalPath
      )
    ).rejects.toThrow("시뮬레이션된 실행 중 실패");

    expect(existsSync(realEnvLocalPath)).toBe(false);
  });

  it("(c) 시뮬레이션된 SIGINT — 시그널 핸들러 직접 호출 시에도 부재 상태로 복원된다", async () => {
    const originalOn = process.on.bind(process);
    const originalExit = process.exit.bind(process);
    let sigintHandler: (() => void) | undefined;

    process.exit = (() => undefined as never) as typeof process.exit;
    process.on = ((event: string, listener: (...args: unknown[]) => void) => {
      if (event === "SIGINT" && !sigintHandler) {
        sigintHandler = listener as () => void;
      }
      return originalOn(event as never, listener as never);
    }) as typeof process.on;

    try {
      await withSafeEnvLocal(
        "TURSO_DATABASE_URL=libsql://throwaway-fake-value-3.invalid\n",
        async () => {
          expect(existsSync(realEnvLocalPath)).toBe(true);
          sigintHandler?.();
        },
        realEnvLocalPath
      );
    } finally {
      process.on = originalOn;
      process.exit = originalExit;
    }

    expect(existsSync(realEnvLocalPath)).toBe(false);
  });
});
