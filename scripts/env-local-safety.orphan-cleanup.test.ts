import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// design.md §3.6 하드닝(B1) — prepareSafeEnvLocal() 자신의 본문(백업 생성 →
// sentinel 쓰기)이 도중에 실패하는 경로를 검증한다. withSafeEnvLocal의
// SIGINT/SIGTERM/exit 복원 핸들러는 prepareSafeEnvLocal()이 "성공적으로
// 반환한 뒤"에야 등록되므로, 그 이전에 던져지는 실패는 별도의 방어선이
// 필요하다 — 그 방어선을 이 파일에서 검증한다.
//
// node:fs를 이 파일 범위로만 부분 목킹한다(writeFileSync 호출 횟수를 세어
// 지정한 호출에서만 실패를 시뮬레이션하고 나머지는 실제 구현에 위임, +
// mkdtempSync가 만든 백업 디렉터리 경로를 기록). vi.mock은 파일 단위로만
// 적용되므로 env-local-safety.test.ts 등 다른 테스트 파일에는 영향이 없다.
const state = vi.hoisted(() => ({
  writeCallCount: 0,
  failOnCall: undefined as number | undefined,
  lastBackupDir: undefined as string | undefined,
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    mkdtempSync: (...args: Parameters<typeof actual.mkdtempSync>) => {
      const result = actual.mkdtempSync(...args);
      state.lastBackupDir = result;
      return result;
    },
    writeFileSync: (...args: Parameters<typeof actual.writeFileSync>) => {
      state.writeCallCount += 1;
      if (state.writeCallCount === state.failOnCall) {
        throw new Error("디스크 풀 시뮬레이션");
      }
      return actual.writeFileSync(...args);
    },
  };
});

const { prepareSafeEnvLocal } = await import("./env-local-safety.ts");

describe("prepareSafeEnvLocal — 본문 실행 도중 실패 시 orphan 정리(B1)", () => {
  let dir: string;
  let envLocalPath: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "moai-env-local-safety-orphan-"));
    envLocalPath = path.join(dir, ".env.local");
    state.writeCallCount = 0;
    state.failOnCall = undefined;
    state.lastBackupDir = undefined;
  });

  afterEach(() => {
    state.failOnCall = undefined;
    rmSync(dir, { recursive: true, force: true });
  });

  it("백업 생성 후 sentinel 쓰기(2번째 writeFileSync)가 실패하면 원본이 복원되고 백업이 orphan으로 남지 않으며 원래 에러가 재던져진다", () => {
    const original = "TURSO_DATABASE_URL=file:./real.db\nBETTER_AUTH_SECRET=real-secret\n";
    writeFileSync(envLocalPath, original, "utf-8");

    // 위 fixture 쓰기도 목킹된 writeFileSync를 거치므로, prepareSafeEnvLocal
    // 호출 직전에 카운터를 리셋해 "1번째 = 백업 쓰기, 2번째 = sentinel 쓰기"
    // 기준을 prepareSafeEnvLocal 본문 기준으로 맞춘다.
    state.writeCallCount = 0;
    state.failOnCall = 2;

    expect(() => prepareSafeEnvLocal("SENTINEL=1\n", envLocalPath)).toThrow("디스크 풀 시뮬레이션");

    // (a) 원래 에러가 가려지지 않고 그대로 전파된다 — 위 toThrow가 이미 검증.
    // (b) 실제 .env.local은 원본 그대로다(sentinel로 치환된 채 남지 않는다).
    expect(readFileSync(envLocalPath, "utf-8")).toBe(original);
    // (c) 백업이 만들어졌던 디렉터리가 orphan으로 남지 않는다.
    expect(state.lastBackupDir).toBeDefined();
    expect(existsSync(state.lastBackupDir as string)).toBe(false);
  });

  it("백업 쓰기(1번째 writeFileSync) 자체가 실패하면 만들어진 백업 디렉터리가 orphan으로 남지 않고 원래 에러가 재던져진다", () => {
    const original = "TURSO_DATABASE_URL=file:./real.db\nBETTER_AUTH_SECRET=real-secret\n";
    writeFileSync(envLocalPath, original, "utf-8");

    state.writeCallCount = 0;
    state.failOnCall = 1;

    expect(() => prepareSafeEnvLocal("SENTINEL=1\n", envLocalPath)).toThrow("디스크 풀 시뮬레이션");

    // sentinel 쓰기(2번째 호출)까지 도달하지 않았으므로 실제 .env.local은
    // 원본 그대로 남아 있어야 한다.
    expect(readFileSync(envLocalPath, "utf-8")).toBe(original);
    expect(state.lastBackupDir).toBeDefined();
    expect(existsSync(state.lastBackupDir as string)).toBe(false);
  });
});
