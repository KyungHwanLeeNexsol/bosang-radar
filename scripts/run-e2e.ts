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
  // LLM_PROVIDER_MODE=deterministic — E2E는 실제 Gemini API를 호출하지 않고
  // 결정론적 provider를 사용한다(SPEC-RESEARCH-001 design.md §1, AC-RESEARCH-024).
  // 시크릿이 아닌 고정 리터럴이므로 AssembledE2EEnv/webServer.env 4개 키 재선언
  // 금지 제약(design.md §3.4)과 무관하게 여기서 직접 설정한다.
  process.env.LLM_PROVIDER_MODE = "deterministic";
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
// pnpm test:e2e 전체가 무기한 hang한다 — E2E_PORT를 점유한 그 PID **하나만**
// 수동으로 죽이면 즉시 exit 0으로 풀리는 것까지 실측 확인됐다(design.md
// §3.3/§3.4의 프로세스 계보·시크릿 상속 구조는 그대로 두는 최소 개입).
// 이 함수는 그 PID를 찾아 강제 종료하는 감시망의 마지막 조치다.
//
// [실측, 2026-08-26] 이 프로젝트를 실행하는 셸 환경의 PATH에
// `C:\Windows\System32`가 빠져 있어(Git Bash 기본 PATH의 알려진 특성),
// `execFileSync("netstat"/"taskkill"/"powershell.exe", …)`처럼 이름만으로
// 찾는 호출이 전부 ENOENT로 조용히 실패했다 — try/catch가 그 실패를 삼켜
// 겉으로는 "성공했지만 아무 효과가 없는" 상태로 보였다. 그래서 PowerShell
// 실행 파일은 `%SystemRoot%` 기준 절대 경로로 지정하고, 포트 조회·프로세스
// 종료는 외부 exe(`netstat`/`taskkill`) 대신 PowerShell 내장 명령
// (`Get-NetTCPConnection`/`Stop-Process`)만으로 스크립트 하나에서 처리한다
// — 부모 셸의 PATH 구성에 좌우되지 않는다.
//
// [범위 제한, 최종 코드 리뷰 반영] 이전 버전은 포트 기반 탐색에 더해 PC
// 전체 프로세스에서 "next start"/"next build" 명령줄을 검색해 함께
// 종료했다(부모 셸이 자식을 잃고 빈 채로 남는 경우까지 잡기 위함). 하지만
// 이는 이 세션과 무관하게 동시에 실행 중인 **다른** Next.js 프로젝트의
// 서버까지 죽일 수 있는 전역 부작용이었다 — 실제로 다른 프로젝트("next
// dev")를 오탐해 죽일 뻔한 사례가 조사 중 발견됐었다(단어 경계 정규식의
// 오탐, 이전 커밋에서 패턴을 좁혀 그 특정 오탐은 막았지만, 전역 검색이라는
// 위험 자체는 여전히 남아 있었다). progress.md의 최초 실측(M7)은 애초에
// E2E_PORT를 점유한 PID 하나만 죽여도 충분했다는 사실이었으므로, 이제
// 그 범위로 되돌린다 — 전역 명령줄 검색($byCmd) 경로는 제거한다.
// 포트 PID 종료만으로 실제로 안 풀리는 경우가 재현되면, PC 전체가 아니라
// spawnPlaywrightRunner()가 spawn한 Playwright 러너 child의 PID와 그
// 자식/관련 프로세스 트리만 대상으로 하는 스코프된 cleanup으로 확장한다
// — 아직 그 경우가 재현된 적이 없으므로 지금은 구현하지 않는다(YAGNI).
function resolveWindowsPowerShellPath(): string {
  const systemRoot = process.env.SystemRoot || process.env.WINDIR || "C:\\Windows";
  return path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

function killOrphanedWebServer(port: number): void {
  if (process.platform !== "win32") return;
  // [실측, 2026-08-26] 배열 항목을 "; "로 이어붙이되 각 항목이 파이프(`|`)로
  // 끝나면 "...| ; foreach..." 형태가 되어 PowerShell이 빈 파이프라인
  // 요소로 파싱에 실패한다(EmptyPipeElement) — 각 배열 항목은 파이프 없이
  // 끝나는 완결된 한 문장으로 작성한다.
  const script = [
    `$targets = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | Sort-Object -Unique`,
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
// [정밀화, 최종 코드 리뷰 반영] 이전 정규식(`/[✓✔✘✗]/`)은 줄 안 어디든 마크
// 문자 하나만 있으면 매칭됐다 — 앱 자신의 로그(예: 성공 메시지에 체크마크를
// 쓰는 코드)가 섞여 나오면 실제 테스트 결과가 아닌데도 세어질 수 있었다.
// Playwright list 리포터의 실제 결과 줄은 고정된 모양을 갖는다:
// `  ✓  1 [chromium] › e2e\auth.spec.ts:10:7 › ... (1.0s)` — 줄 시작(공백
// 허용) 바로 뒤에 마크, 그다음 테스트 번호, 그다음 `[<project>]`가 온다.
// 이 구조 전체를 앵커링해서 그 모양이 아닌 줄(일반 앱 로그의 체크마크 등)은
// 매칭하지 않는다.
const PLAYWRIGHT_RESULT_MARK_RE = /^\s*[✓✔✘✗]\s+\d+\s+\[/;
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
        seenResultCount === expectedResultCount
      ) {
        // 기대한 테스트 수와 실제로 관측된 결과 줄 수가 정확히 일치할 때만
        // grace 타이머를 시작한다(단순 이상(>=)이 아니라 정확히 일치 —
        // 최종 코드 리뷰 반영). 결과 줄 정규식이 이제 충분히 좁혀졌으므로
        // (위 PLAYWRIGHT_RESULT_MARK_RE) seenResultCount가 expectedResultCount를
        // 초과하는 일은 정상 상황에서 없어야 한다 — 그런데도 초과가 생기면
        // (알 수 없는 원인으로 결과 줄이 중복 매칭되는 등) 이 조건은 더 이상
        // 참이 될 수 없으므로 grace 타이머가 걸리지 않고, ABSOLUTE_FALLBACK_MS
        // 안전판이 대신 처리한다 — 잘못된 이른 판정보다 늦은 안전한 판정을
        // 택한다. 이후 어떤 추가 출력이 와도 이 타이머는 다시 걸지 않는다
        // (재시작 없음이 hang 상황에서도 반드시 도달하는 것을 보장하는 핵심 장치).
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
