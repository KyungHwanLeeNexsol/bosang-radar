import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withSafeEnvLocal } from "./env-local-safety.ts";

// design.md §3.6 B4 요구 — throwaway fake 값으로 .env.local 왕복(백업 → sentinel
// 쓰기 → 복원)을 정상 종료·예외·시뮬레이션된 SIGINT 세 경로에서 검증한다.
//
// 검증 대상 경로는 OS 임시 디렉터리에 매 실행마다 새로 만드는 격리된 픽스처다.
// 프로젝트 루트의 실제 .env.local은 읽지도 쓰지도 않는다 — README의 정상 개발
// 설정이 .env.local 생성을 요구하므로, 실제 루트를 대상으로 삼으면 설정을 마친
// 개발자에게서 이 테스트가(따라서 pnpm test 전체가) 실패한다. withSafeEnvLocal/
// prepareSafeEnvLocal이 명시적 경로 인자를 받으므로(env-local-safety.ts) 검증의
// 왕복 범위는 그대로 유지하면서 대상 경로만 격리한다.

const fixtureDir = mkdtempSync(path.join(tmpdir(), "moai-env-local-realroot-"));
const fixtureEnvLocalPath = path.join(fixtureDir, ".env.local");

describe("withSafeEnvLocal — 격리된 임시 루트 왕복 (throwaway 값)", () => {
  beforeAll(() => {
    // 사전 조건: 픽스처는 방금 만든 빈 디렉터리이므로 .env.local이 없어야 한다.
    expect(existsSync(fixtureEnvLocalPath)).toBe(false);
  });

  afterAll(() => {
    // 최종 방어선: 모든 테스트가 끝난 뒤 픽스처 .env.local이 부재 상태인지
    // 재확인한 뒤 임시 디렉터리 자체를 제거한다.
    expect(existsSync(fixtureEnvLocalPath)).toBe(false);
    rmSync(fixtureDir, { recursive: true, force: true });
  });

  it("(a) 정상 종료 — 실행 후 .env.local이 부재 상태로 복원된다", async () => {
    await withSafeEnvLocal(
      "TURSO_DATABASE_URL=libsql://throwaway-fake-value.invalid\n",
      async () => {
        expect(existsSync(fixtureEnvLocalPath)).toBe(true);
        expect(readFileSync(fixtureEnvLocalPath, "utf-8")).toContain("throwaway-fake-value");
      },
      fixtureEnvLocalPath
    );

    expect(existsSync(fixtureEnvLocalPath)).toBe(false);
  });

  it("(b) 실행 중 에러 발생 — 에러가 전파되어도 .env.local이 부재 상태로 복원된다", async () => {
    await expect(
      withSafeEnvLocal(
        "TURSO_DATABASE_URL=libsql://throwaway-fake-value-2.invalid\n",
        async () => {
          expect(existsSync(fixtureEnvLocalPath)).toBe(true);
          throw new Error("시뮬레이션된 실행 중 실패");
        },
        fixtureEnvLocalPath
      )
    ).rejects.toThrow("시뮬레이션된 실행 중 실패");

    expect(existsSync(fixtureEnvLocalPath)).toBe(false);
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
          expect(existsSync(fixtureEnvLocalPath)).toBe(true);
          sigintHandler?.();
        },
        fixtureEnvLocalPath
      );
    } finally {
      process.on = originalOn;
      process.exit = originalExit;
    }

    expect(existsSync(fixtureEnvLocalPath)).toBe(false);
  });
});
