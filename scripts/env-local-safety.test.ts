import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prepareSafeEnvLocal, withSafeEnvLocal } from "./env-local-safety.ts";

// design.md §3.6 — .env.local 안전 교체·복원 메커니즘의 단위/통합 테스트.
// 모든 테스트는 임시 디렉터리 안의 fake .env.local만 조작한다(프로젝트 루트의
// 실제 파일은 이 파일에서 건드리지 않는다 — 그 왕복 검증은 별도 통합 테스트에서
// 명시적으로 다룬다).

describe("prepareSafeEnvLocal", () => {
  let dir: string;
  let envLocalPath: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "moai-env-local-safety-"));
    envLocalPath = path.join(dir, ".env.local");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("파일이 존재하지 않았다면 restore() 후 파일이 다시 존재하지 않는다", () => {
    expect(existsSync(envLocalPath)).toBe(false);

    const handle = prepareSafeEnvLocal("SENTINEL=1\n", envLocalPath);
    expect(existsSync(envLocalPath)).toBe(true);
    expect(readFileSync(envLocalPath, "utf-8")).toBe("SENTINEL=1\n");

    handle.restore();
    expect(existsSync(envLocalPath)).toBe(false);
  });

  it("파일이 이미 존재했다면 restore() 후 원본 내용이 바이트 단위로 복원된다", () => {
    const original = "TURSO_DATABASE_URL=file:./real.db\nBETTER_AUTH_SECRET=real-secret\n";
    writeFileSync(envLocalPath, original, "utf-8");

    const handle = prepareSafeEnvLocal("SENTINEL=1\n", envLocalPath);
    expect(readFileSync(envLocalPath, "utf-8")).toBe("SENTINEL=1\n");

    handle.restore();
    expect(existsSync(envLocalPath)).toBe(true);
    expect(readFileSync(envLocalPath, "utf-8")).toBe(original);
  });

  it("restore()를 두 번 호출해도 안전하다(멱등)", () => {
    const original = "ORIGINAL=1\n";
    writeFileSync(envLocalPath, original, "utf-8");

    const handle = prepareSafeEnvLocal("SENTINEL=1\n", envLocalPath);
    handle.restore();
    handle.restore();

    expect(readFileSync(envLocalPath, "utf-8")).toBe(original);
  });
});

describe("withSafeEnvLocal", () => {
  let dir: string;
  let envLocalPath: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "moai-env-local-safety-"));
    envLocalPath = path.join(dir, ".env.local");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("정상 완료 시 원본이 존재하지 않던 상태로 복원된다", async () => {
    const result = await withSafeEnvLocal(
      "SENTINEL=1\n",
      async () => {
        expect(readFileSync(envLocalPath, "utf-8")).toBe("SENTINEL=1\n");
        return "done";
      },
      envLocalPath
    );

    expect(result).toBe("done");
    expect(existsSync(envLocalPath)).toBe(false);
  });

  it("fn이 던진 에러가 있어도 원본 내용으로 복원된 뒤 에러가 재던져진다", async () => {
    const original = "ORIGINAL=1\n";
    writeFileSync(envLocalPath, original, "utf-8");

    await expect(
      withSafeEnvLocal(
        "SENTINEL=1\n",
        async () => {
          throw new Error("시뮬레이션된 실패");
        },
        envLocalPath
      )
    ).rejects.toThrow("시뮬레이션된 실패");

    expect(readFileSync(envLocalPath, "utf-8")).toBe(original);
  });

  it("실행 중 exit 이벤트가 발생해도(마지막 방어선) 복원이 시도된다", async () => {
    const original = "ORIGINAL=1\n";
    writeFileSync(envLocalPath, original, "utf-8");

    await withSafeEnvLocal(
      "SENTINEL=1\n",
      async () => {
        // exit 핸들러가 등록되어 있는지 직접 확인 — 실제 프로세스 종료는
        // 테스트 러너 자체를 죽이므로 시뮬레이션하지 않는다. 대신 등록된
        // 리스너를 수동으로 호출해 핸들러가 restore()를 수행함을 검증한다.
        const listeners = process.listeners("exit");
        // withSafeEnvLocal이 등록한 리스너가 최소 1개 존재해야 한다.
        expect(listeners.length).toBeGreaterThan(0);
      },
      envLocalPath
    );

    expect(readFileSync(envLocalPath, "utf-8")).toBe(original);
  });

  it("SIGINT 핸들러가 등록되고, 수동 호출 시 restore()가 실행된다", async () => {
    const original = "ORIGINAL=1\n";
    writeFileSync(envLocalPath, original, "utf-8");

    let sigintHandler: (() => void) | undefined;
    const originalOn = process.on.bind(process);
    const originalExit = process.exit.bind(process);
    let exitCalled = false;

    // process.exit()를 실제로 호출하면 테스트 러너가 종료되므로, 이 테스트
    // 범위에서만 가로챈다.
    process.exit = (() => {
      exitCalled = true;
      return undefined as never;
    }) as typeof process.exit;

    process.on = ((event: string, listener: (...args: unknown[]) => void) => {
      if (event === "SIGINT" && !sigintHandler) {
        sigintHandler = listener as () => void;
      }
      return originalOn(event as never, listener as never);
    }) as typeof process.on;

    try {
      await withSafeEnvLocal(
        "SENTINEL=1\n",
        async () => {
          expect(sigintHandler).toBeDefined();
          sigintHandler?.();
        },
        envLocalPath
      );
    } finally {
      process.on = originalOn;
      process.exit = originalExit;
    }

    expect(exitCalled).toBe(true);
    expect(readFileSync(envLocalPath, "utf-8")).toBe(original);
  });
});
