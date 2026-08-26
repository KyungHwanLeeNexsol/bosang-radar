import { randomBytes } from "node:crypto";
import { execFileSync, spawn as nodeSpawn, type ChildProcess } from "node:child_process";
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

// progress.md M7이 확정한 근본 원인(Windows): Playwright가 webServer로 띄운
// `next start`가 테스트 종료 후에도 종료되지 않고 고아 프로세스로 남아,
// pnpm test:e2e 전체가 무기한 hang한다 — 해당 PID만 수동으로 죽이면 즉시
// exit 0으로 풀리는 것까지 실측 확인됐다(design.md §3.3/§3.4의 프로세스
// 계보·시크릿 상속 구조는 그대로 두는 최소 개입). 이 함수는 그 PID를
// 찾아 강제 종료하는 감시망의 마지막 조치다.
//
// [실측, 2026-08-26] 이 프로젝트를 실행하는 셸 환경의 PATH에
// `C:\Windows\System32`가 빠져 있어(Git Bash 기본 PATH의 알려진 특성),
// `execFileSync("netstat"/"taskkill"/"powershell.exe", …)`처럼 이름만으로
// 찾는 호출이 전부 ENOENT로 조용히 실패했다 — try/catch가 그 실패를 삼켜
// 겉으로는 "성공했지만 아무 효과가 없는" 상태로 보였다. 그래서 PowerShell
// 실행 파일은 `%SystemRoot%` 기준 절대 경로로 지정하고, 포트 조회·프로세스
// 종료는 외부 exe(`netstat`/`taskkill`) 대신 PowerShell 내장 명령
// (`Get-NetTCPConnection`/`Stop-Process`)만으로 스크립트 하나에서 처리한다
// — 부모 셸의 PATH 구성에 좌우되지 않는다. 포트 기반 탐색에 더해, 이미
// 자식을 잃고 빈 채로 남는 부모 셸(`cmd.exe /c next start`)까지 잡기 위해
// 명령줄 패턴 탐색도 같은 스크립트에서 함께 수행한다. 패턴은 "next" 바로
// 뒤에 "start"/"build"가 오는 형태만 매칭한다(`next" start` 형태 —
// Windows CommandLine 필드는 실행 파일 경로를 따옴표로 감싸므로 실제로는
// 사이에 큰따옴표가 낀다) — 단순히 단어 경계로만 검사하면 이 세션과
// 무관한 다른 프로젝트의 "next dev" 내부 파일명(`start-server.js`)까지
// 걸려 그 프로세스를 잘못 죽일 뻔했다(실측, scope discipline 위반 방지).
// "next" 바로 뒤에 오는 토큰만 보는 이 형태는 그 오탐을 만들지 않는다.
function resolveWindowsPowerShellPath(): string {
  const systemRoot = process.env.SystemRoot || process.env.WINDIR || "C:\\Windows";
  return path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

function killOrphanedWebServer(port: number): void {
  if (process.platform !== "win32") return;
  // [실측, 2026-08-26] 배열 항목을 "; "로 이어붙이되 각 항목이 파이프(`|`)로
  // 끝나면 "...| ; Select-Object..." 형태가 되어 PowerShell이 빈 파이프라인
  // 요소로 파싱에 실패했다(EmptyPipeElement) — 그래서 이 킬 로직은 지금까지
  // 한 번도 실제로 실행된 적이 없었다. 각 배열 항목을 파이프 없이 끝나는
  // 완결된 한 문장으로 작성해 이 문제를 없앤다.
  const script = [
    `$byPort = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess`,
    `$byCmd = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'next["'']?\\s+(start|build)\\b' } | Select-Object -ExpandProperty ProcessId`,
    "$targets = @($byPort) + @($byCmd) | Where-Object { $_ } | Sort-Object -Unique",
    "foreach ($procId in $targets) { try { Stop-Process -Id $procId -Force -ErrorAction Stop } catch {} }",
  ].join("; ");
  try {
    execFileSync(resolveWindowsPowerShellPath(), [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      script,
    ]);
  } catch {
    // best-effort — 정리 실패가 이미 관측된 테스트 결과를 가리면 안 된다.
  }
}

// list 리포터의 "Running N tests using M workers" 줄에서 기대 테스트 수를,
// 개별 결과 줄("✓ 1 [chromium] › ...", "✘ 2 ...")에서 완료 수를 센다.
// [실측, M7 재확인] Playwright의 최종 요약 줄("N passed" 등)은 teardown이
// hang하는 바로 그 상황에서는 아예 출력되지 않는다 — 결과 줄까지만 찍히고
// 로그가 멈춘다. "새 출력이 없으면"(idle) 방식도 시도했으나, hang 중에도
// Playwright가 화면 갱신용 제어 문자를 계속 흘려보내 idle 타이머가 끝없이
// 재시작되는 것이 실측됐다(2026-08-26 재확인 — 이전 시도의 idle 방식은
// 폐기). 그래서 "기대한 결과 수만큼 다 보였다"는 사실 자체를 신호로 삼고,
// 그 뒤로는 재시작되지 않는 고정 타이머 하나만 건다.
const PLAYWRIGHT_RUNNING_RE = /^Running (\d+) tests?/;
const PLAYWRIGHT_RESULT_MARK_RE = /[✓✔✘✗]/;
// 기대한 결과 수를 다 본 뒤 이만큼 기다렸다가 hang 여부를 판단한다(재시작 없음).
const RESULTS_COMPLETE_GRACE_MS = 10_000;
// "Running N tests" 파싱이 실패하는 경우를 위한 절대 안전판(spawn 시점부터).
const ABSOLUTE_FALLBACK_MS = 5 * 60_000;
// 포트를 점유한 고아 프로세스를 죽인 뒤에도 Playwright 자신의 정상 close
// 이벤트가 이 시간 안에 오지 않으면 최후 수단으로 실패 처리한다(관측 없는
// 성공 주장 금지 — verification-claim-integrity §1).
const LAST_RESORT_MS = 90_000;

// @MX:ANCHOR: [AUTO] Playwright 러너를 spawn하는 유일한 지점 — AC-RUNTIME-022의
// 관측 대상(주입 가능한 spawn 경계)
// @MX:REASON: 이 함수 시그니처(spawnFn 인자)를 바꾸면 단위 테스트의 기록용
// 대역 주입 지점이 깨진다(design.md §3.5, acceptance.md AC-RUNTIME-022).
// port 인자는 M7 teardown-hang 감시망 전용이며 spawn 호출 자체(명령/인자/env)에는
// 영향을 주지 않는다 — AC-RUNTIME-022가 관측하는 것은 그대로 유지된다.
function spawnPlaywrightRunner(spawnFn: SpawnFn, port: number): Promise<RunPlaywrightResult> {
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
      stdio: ["inherit", "pipe", "inherit"],
      shell: true,
    }) as ChildProcess;

    let settled = false;
    let orphanKillAttempted = false;
    let stdoutBuffer = "";
    let expectedResultCount: number | null = null;
    let seenResultCount = 0;
    let resultsCompleteTimerArmed = false;
    const timers: NodeJS.Timeout[] = [];

    function finish(result: RunPlaywrightResult): void {
      if (settled) return;
      settled = true;
      for (const t of timers) clearTimeout(t);
      resolve(result);
    }

    function onHangSuspected(): void {
      if (settled || orphanKillAttempted) return;
      orphanKillAttempted = true;
      // 고아 webServer 프로세스만 죽인다 — 우리 자신의 child(Playwright 러너)는
      // 건드리지 않는다. [실측, M7] 그 PID 하나만 죽이면 Playwright가 스스로
      // teardown을 마치고 실제 결과가 담긴 정상 close 이벤트를 낸다 — 그
      // 자연스러운 close가 여전히 최종 판정의 근거다(아래에서 계속 대기).
      killOrphanedWebServer(port);
      const lastResortTimer = setTimeout(() => {
        // 고아 프로세스를 죽였는데도 close가 오지 않는 최후의 경우 — 통과
        // 했다는 근거를 확보하지 못했으므로 실패로 처리한다(관측 없는 성공
        // 주장 금지, verification-claim-integrity §1).
        finish({ exitCode: 1 });
      }, LAST_RESORT_MS);
      lastResortTimer.unref?.();
      timers.push(lastResortTimer);
    }

    // "Running N tests" 파싱이 실패해도 언젠가는 정리되도록 하는 절대 안전판.
    // 재시작되지 않는 고정 타이머다.
    const fallbackTimer = setTimeout(onHangSuspected, ABSOLUTE_FALLBACK_MS);
    fallbackTimer.unref?.();
    timers.push(fallbackTimer);

    child.stdout?.on("data", (chunk: Buffer) => {
      process.stdout.write(chunk);
      stdoutBuffer += chunk.toString("utf-8");
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        if (expectedResultCount === null) {
          const match = PLAYWRIGHT_RUNNING_RE.exec(line);
          if (match) expectedResultCount = Number(match[1]);
        }
        if (PLAYWRIGHT_RESULT_MARK_RE.test(line)) seenResultCount += 1;
      }
      if (
        !resultsCompleteTimerArmed &&
        expectedResultCount !== null &&
        seenResultCount >= expectedResultCount
      ) {
        // 기대한 결과 수를 다 봤다 — 이후 어떤 추가 출력이 와도 이 타이머는
        // 다시 걸지 않는다(재시작 없음이 hang 상황에서도 반드시 도달하는 것을
        // 보장하는 핵심 장치).
        resultsCompleteTimerArmed = true;
        const graceTimer = setTimeout(onHangSuspected, RESULTS_COMPLETE_GRACE_MS);
        graceTimer.unref?.();
        timers.push(graceTimer);
      }
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      for (const t of timers) clearTimeout(t);
      reject(err);
    });
    child.on("close", (code) => finish({ exitCode: code ?? 1 }));
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
  const port = Number(process.env.E2E_PORT);
  const { exitCode } = await spawnPlaywrightRunner(spawnFn, port);
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
