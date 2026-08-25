import { randomBytes } from "node:crypto";
import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { bootstrapCli } from "./cli-bootstrap.ts";
import { runMigrations } from "./db-migrate.ts";
import { runSeed } from "./db-seed.ts";
import { provisionTester } from "./provision-tester.ts";
import { TESTER_A_EMAIL, TESTER_B_EMAIL } from "./e2e-tester-emails.ts";

// @MX:ANCHOR: [AUTO] pnpm test:e2e의 실제 진입점 — E2E 전 과정(시크릿 생성 →
// env 조립 → 스코프 검증 → DB 초기화·마이그레이션·시드·테스터 프로비저닝 →
// Playwright 러너 spawn)을 이 파일이 전부 소유한다.
// @MX:REASON: e2e/global-setup.ts를 만들지 않기로 한 설계 결정(design.md §3.3)의
// 직접적 결과 — 훅 순서 대신 프로세스 계보(이 스크립트 → Playwright 러너 →
// Next.js 서버, 모두 같은 조상 프로세스의 env를 상속)에 시크릿 일치를 위임한다.

export type SpawnFn = typeof nodeSpawn;

// e2e/*.spec.ts는 이 파일이 아니라 ./e2e-tester-emails.ts에서 직접
// import한다(Playwright spec 번들러가 CJS로 변환하므로, 이 파일처럼
// import.meta.url을 쓰는 모듈을 spec이 간접 import하면 실패한다 — 상세는
// e2e-tester-emails.ts 상단 주석 및 progress.md §E.2 M5 참고). 여기서는
// 진입점 자신이 쓰기 위해 재수출만 한다(SSOT는 여전히 하나).
export { TESTER_A_EMAIL, TESTER_B_EMAIL };

function resolveProjectRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "..");
}

function generateSecret(): string {
  return randomBytes(32).toString("base64url");
}

// Better Auth의 minPasswordLength 기본값(8자)을 항상 만족하도록 생성한다
// (design.md §3.2.1, §3.4).
function generateTesterPassword(): string {
  return `E2e-${randomBytes(9).toString("base64url")}`;
}

// 구현 시 확정 항목(진입점 자체 판단, SPEC 문서 미변경) — 고정 포트 3000은
// 이 세션과 무관한 다른 프로젝트의 dev 서버가 이미 점유하고 있을 수 있음이
// 실측되었다(M5 1차 실행). OS가 배정하는 임시 빈 포트를 실행 시점에 탐색해
// 사용한다 — 고정 대체 포트(예: 3100)도 언젠가 같은 문제를 재현할 수 있는
// 반면, OS 배정 포트는 그 클래스의 충돌 자체를 구조적으로 제거한다. 포트
// 번호는 시크릿이 아니므로 design.md §3.4의 "webServer.env에 4개 키를
// 재선언하지 않는다" 제약과 무관하다(progress.md §E.2 M5 참고).
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close(() => reject(new Error("빈 포트를 확정할 수 없습니다.")));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

export interface AssembledE2EEnv {
  readonly TURSO_DATABASE_URL: string;
  readonly BETTER_AUTH_URL: string;
  readonly BETTER_AUTH_SECRET: string;
  readonly TESTER_PASSWORD: string;
}

// @MX:ANCHOR: [AUTO] E2E 환경 집합 조립 — AC-RUNTIME-022가 관측하는 "진입점이
// 조립한 값"의 유일한 생성 지점
// @MX:REASON: 이 함수가 process.env에 쓴 값과, 아래 spawnPlaywrightRunner()가
// 자식에게 전달하는 값이 달라지면 AC-RUNTIME-022가 실패한다 — 두 지점을
// 하나의 process.env 상속 경로로 묶어 재조립 지점을 만들지 않는다.
export async function assembleE2EEnv(): Promise<AssembledE2EEnv> {
  const port = await findFreePort();
  const assembled: AssembledE2EEnv = {
    TURSO_DATABASE_URL: "file:./.tmp/e2e.db",
    BETTER_AUTH_URL: `http://localhost:${port}`,
    BETTER_AUTH_SECRET: generateSecret(),
    TESTER_PASSWORD: generateTesterPassword(),
  };

  process.env.TURSO_DATABASE_URL = assembled.TURSO_DATABASE_URL;
  process.env.BETTER_AUTH_URL = assembled.BETTER_AUTH_URL;
  process.env.BETTER_AUTH_SECRET = assembled.BETTER_AUTH_SECRET;
  process.env.TESTER_PASSWORD = assembled.TESTER_PASSWORD;
  // playwright.config.ts는 별도 프로세스(상속 경계 너머)에서 로드되므로
  // BETTER_AUTH_URL 문자열을 파싱하지 않고 포트 값을 직접 상속받는다.
  process.env.E2E_PORT = String(port);

  return assembled;
}

// 매 실행마다 DB를 초기화한다(design.md §3.3) — WAL/SHM 보조 파일까지 제거해
// 이전 실행의 잔여 상태가 새 실행에 섞이지 않게 한다. 삭제 실패는 best-effort로
// 무시한다 — Windows에서는 직전 libsql 클라이언트의 파일 핸들이 close() 반환
// 이후에도 즉시 해제되지 않는 경우가 실측되었다(EPERM). 마이그레이션은
// __drizzle_migrations 추적 테이블 기반으로 멱등하므로(REQ-RUNTIME-002),
// 이전 파일이 남아 있어도 이어지는 마이그레이션·시드·프로비저닝은 정상
// 동작한다 — 초기화 실패가 전체 실행을 막지 않는다.
function resetE2EDatabase(): void {
  const tmpDir = path.join(resolveProjectRoot(), ".tmp");
  for (const suffix of ["e2e.db", "e2e.db-wal", "e2e.db-shm"]) {
    try {
      rmSync(path.join(tmpDir, suffix), { force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // best-effort — 위 주석 참고.
    }
  }
  mkdirSync(tmpDir, { recursive: true });
}

async function prepareE2EDatabase(assembled: AssembledE2EEnv): Promise<void> {
  resetE2EDatabase();
  // db-migrate/db-seed/provision-tester의 함수를 in-process 재사용한다
  // (design.md §3.3 — 서브프로세스 호출은 env 전달 경계가 하나 더 생겨
  // file: 격리가 새는 지점이 된다).
  await runMigrations();
  await runSeed();
  await provisionTester({ email: TESTER_A_EMAIL, password: assembled.TESTER_PASSWORD });
  await provisionTester({ email: TESTER_B_EMAIL, password: assembled.TESTER_PASSWORD });
}

interface RunPlaywrightResult {
  exitCode: number;
}

// @MX:ANCHOR: [AUTO] Playwright 러너를 spawn하는 유일한 지점 — AC-RUNTIME-022의
// 관측 대상(주입 가능한 spawn 경계)
// @MX:REASON: 이 함수 시그니처(spawnFn 인자)를 바꾸면 단위 테스트의 기록용
// 대역 주입 지점이 깨진다(design.md §3.5, acceptance.md AC-RUNTIME-022).
function spawnPlaywrightRunner(spawnFn: SpawnFn): Promise<RunPlaywrightResult> {
  return new Promise((resolve, reject) => {
    // shell: true — Windows에서 pnpm은 .cmd/.ps1 셸 래퍼이므로 셸 없이
    // spawn하면 ENOENT로 실패한다. 인자는 고정 리터럴이라 외부/신뢰되지 않은
    // 입력이 셸 커맨드라인에 섞일 위험이 없다.
    // [실측, M5] "pnpm.cmd"를 shell:true 없이 직접 spawn하는 대안을
    // 시도했으나 Node 24(v24.19.0)에서 `spawn EINVAL`로 즉시 실패했다 —
    // Node가 .cmd/.bat 실행 파일에 대해 shell:true를 사실상 요구하도록
    // 강화된 보안 수정(관련: CVE-2024-27980 대응)의 영향으로 판단된다.
    // shell:true는 회피 대상이 아니라 이 플랫폼에서 필수 옵션이다.
    const child = spawnFn("pnpm", ["exec", "playwright", "test"], {
      env: process.env,
      stdio: "inherit",
      shell: true,
    }) as ChildProcess;

    child.on("error", reject);
    child.on("close", (code) => resolve({ exitCode: code ?? 1 }));
  });
}

// @MX:ANCHOR: [AUTO] pnpm test:e2e 실제 진입점 — plan.md §C M5 5단계 전체를
// 소유하는 최상위 함수
// @MX:REASON: e2e/global-setup.ts가 존재하지 않는 설계(design.md §3.3)에서
// 이 함수가 유일한 라이프사이클 소유자다. 시그니처(spawnFn 기본 인자)를
// 바꾸면 AC-RUNTIME-022 구조적 검증 테스트가 깨진다.
export async function runE2E(spawnFn: SpawnFn = nodeSpawn): Promise<number> {
  const assembled = await assembleE2EEnv();
  // 로드 → 검증(design.md §3.2.2). 이미 조립된 값이 process.env에 있으므로
  // .env.local이 디스크에 존재하더라도(AC-RUNTIME-015 sentinel 시나리오)
  // 상속된 값이 덮이지 않는다(research.md §0.2 결론 2).
  bootstrapCli("e2e");
  await prepareE2EDatabase(assembled);
  const { exitCode } = await spawnPlaywrightRunner(spawnFn);
  return exitCode;
}

function reportAndExit(result: Promise<number>): Promise<void> {
  return result
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      console.error("❌ E2E 실행 실패:", error);
      process.exitCode = 1;
    });
}

const isDirectExecution =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  void reportAndExit(runE2E());
}
