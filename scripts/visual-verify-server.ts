// visual-verify가 띄우는 프로덕션 서버의 포트 선정 · 준비 확인 · 프로세스 트리
// 정리를 한곳에 모은 모듈.
//
// visual-verify.ts는 import되는 순간 main()이 실행되어 단위 테스트에서 가져올 수
// 없으므로 분리했다. 이 모듈은 부작용 없이 함수만 내보낸다.

import { execFileSync, type ChildProcess } from "node:child_process";
import net from "node:net";
import path from "node:path";

// Node fetch(undici)와 Chromium은 WHATWG fetch "bad port" 목록의 포트로는 서버가
// 떠 있어도 요청 자체를 거부한다(fetch: "bad port", Chromium: ERR_UNSAFE_PORT).
// OS가 임의 포트를 골라 주는 환경에서 6668이 걸리면 서버는 정상 기동해도
// 준비 확인이 영원히 실패한다.
//
// 이 목록은 Node v24.19.0에서 1~65535 전 포트를 fetch로 두드려 "bad port"로
// 거부된 82개를 그대로 옮긴 실측값이다. Chromium 목록과의 차이는 (있다면)
// 이쪽이 상위집합이므로 안전하다 — 필요 이상으로 한 포트를 더 피할 뿐이다.
export const UNSAFE_PORTS: ReadonlySet<number> = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102,
  103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465,
  512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993,
  995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668,
  6669, 6679, 6697, 10080,
]);

export function isUnsafePort(port: number): boolean {
  return UNSAFE_PORTS.has(port);
}

function unsafePortMessage(port: number): string {
  return (
    `포트 ${port}는 Node fetch와 Chromium이 요청 자체를 거부하는 금지 포트(bad port / ` +
    `ERR_UNSAFE_PORT)입니다. 서버가 떠 있어도 준비 확인과 화면 검증을 시작할 수 없어 ` +
    `기다리지 않고 즉시 실패합니다.`
  );
}

function listenEphemeral(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(port));
    });
  });
}

/**
 * 사용 가능한 포트를 고른다. OS가 준 포트가 금지 포트면 버리고 다시 고른다.
 * 무한 재시도하지 않는다 — maxAttempts번 연속 금지 포트면 원인을 밝히고 실패한다.
 *
 * `listen`은 테스트에서 금지 포트를 주입하기 위한 자리다(기본은 OS 임의 포트).
 */
export async function findSafePort(
  options: {
    listen?: () => Promise<number>;
    maxAttempts?: number;
    onSkip?: (port: number) => void;
  } = {}
): Promise<number> {
  const { listen = listenEphemeral, maxAttempts = 20, onSkip } = options;
  const rejected: number[] = [];
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const port = await listen();
    if (!isUnsafePort(port)) return port;
    rejected.push(port);
    onSkip?.(port);
  }
  throw new Error(
    `${maxAttempts}번 연속으로 금지 포트가 선택됐습니다(${rejected.join(", ")}). ` +
      `${unsafePortMessage(rejected[rejected.length - 1])}`
  );
}

function isBadPortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const cause = (error as { cause?: unknown }).cause;
  const causeMessage = cause instanceof Error ? cause.message : String(cause ?? "");
  return /bad port/i.test(`${error.message} ${causeMessage}`);
}

// 서버가 연결은 받고 응답을 안 주는 경우에도 마감 시한이 지켜지도록 요청마다
// 상한을 둔다.
const REQUEST_TIMEOUT_MS = 5_000;

export interface WaitForServerOptions {
  intervalMs?: number;
  fetchImpl?: (url: string) => Promise<{ ok: boolean }>;
  /** 서버 프로세스가 이미 죽었다면 그 사유를 돌려준다 — 타임아웃까지 기다리지 않는다. */
  abortReason?: () => string | null;
}

export async function waitForServer(
  url: string,
  timeoutMs: number,
  options: WaitForServerOptions = {}
): Promise<void> {
  const {
    intervalMs = 500,
    fetchImpl = (target: string) =>
      fetch(target, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
    abortReason,
  } = options;

  const port = Number(new URL(url).port);
  if (isUnsafePort(port)) throw new Error(unsafePortMessage(port));

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const reason = abortReason?.();
    if (reason) throw new Error(`서버가 준비되기 전에 종료됐습니다(${reason}): ${url}`);
    try {
      const res = await fetchImpl(url);
      if (res.ok) return;
    } catch (error) {
      // 금지 포트는 재시도해도 영원히 실패한다 — 기다리지 않고 원인을 밝힌다.
      if (isBadPortError(error)) throw new Error(unsafePortMessage(port));
      // 그 외에는 아직 기동 전 — 재시도한다.
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`서버가 ${timeoutMs}ms 안에 기동하지 않았습니다: ${url}`);
}

// taskkill을 PATH에서 찾으면 안 된다 — Git Bash 등에서 띄운 셸은 PATH에 System32가
// 없어 "'taskkill'은(는) 내부 또는 외부 명령이 아닙니다"로 실패하고, 예전 코드는 그
// 실패를 catch {}로 삼켜 서버 트리가 남아도 아무 신호가 없었다. 절대 경로로 호출한다.
const TASKKILL = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe");

// taskkill은 대상 pid가 이미 없으면 128로, POSIX 시그널은 ESRCH로 실패한다 — 둘 다
// "이미 종료됨"이라 정상이다. 그 밖의 실패만 정리 실패다.
function isAlreadyGone(error: unknown): boolean {
  const { status, code } = error as { status?: number; code?: string };
  return status === 128 || code === "ESRCH";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 서버 프로세스 트리를 종료하지 못했다 — 서버가 남았을 수 있다. */
export class ProcessCleanupError extends Error {
  constructor(
    readonly pid: number,
    readonly reason: string
  ) {
    super(
      `서버 프로세스 트리 정리 실패(pid ${pid}) — 서버가 남았을 수 있어 수동 확인이 필요합니다: ${reason}`
    );
    this.name = "ProcessCleanupError";
  }
}

function defaultKill(pid: number): void {
  if (process.platform === "win32") {
    // shell:true로 띄웠기 때문에 child.pid는 cmd.exe다 — /T로 자식
    // (pnpm → next start)까지 함께 종료해야 포트가 반납된다.
    execFileSync(TASKKILL, ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    process.kill(-pid, "SIGTERM");
  }
}

/**
 * 자식 프로세스와 그 하위 트리를 종료한다. 이미 종료됐어도 안전하다(멱등).
 *
 * "이미 종료됨"이 아닌 이유로 실패하면 ProcessCleanupError를 던진다. 경고만 남기고
 * 정상 반환하면 서버가 남았는데도 호출자가 성공으로 끝낼 수 있다.
 *
 * `kill`은 정리 명령 실패를 주입하기 위한 자리다(기본은 플랫폼별 종료 명령).
 */
export function killProcessTree(
  child: ChildProcess,
  kill: (pid: number) => void = defaultKill
): void {
  const pid = child.pid;
  try {
    if (pid) {
      try {
        kill(pid);
      } catch (error) {
        if (!isAlreadyGone(error)) throw new ProcessCleanupError(pid, errorMessage(error));
      }
    }
  } finally {
    child.unref();
  }
}

/** 각 해제 단계를 독립적으로 시도하고, 실패한 단계의 메시지를 모아 돌려준다. */
export async function releaseResources(
  steps: { label: string; release: () => void | Promise<void> }[]
): Promise<string[]> {
  const failures: string[] = [];
  for (const step of steps) {
    try {
      await step.release();
    } catch (error) {
      failures.push(`${step.label}: ${errorMessage(error)}`);
    }
  }
  return failures;
}

/** 준비 실패(원래 오류)와 그 뒤 정리 실패를 함께 담는다. 원래 오류는 그대로 보존한다. */
export class StartupCleanupError extends Error {
  constructor(
    readonly originalError: unknown,
    readonly cleanupError: unknown
  ) {
    super(`${errorMessage(originalError)}\n[정리도 실패] ${errorMessage(cleanupError)}`);
    this.name = "StartupCleanupError";
  }
}

export interface ManagedServer {
  baseURL: string;
  stop: () => void;
}

export interface StartManagedServerOptions {
  /** 골라낸 포트로 서버 프로세스를 띄운다. */
  spawnOnPort: (port: number) => ChildProcess;
  readyTimeoutMs: number;
  pollIntervalMs?: number;
  /** 기본은 findSafePort(). 테스트에서 금지 포트를 주입하는 자리. */
  pickPort?: () => Promise<number>;
  log?: (message: string) => void;
  /** 기본은 killProcessTree(). 테스트에서 정리 실패를 주입하는 자리. */
  killTree?: (child: ChildProcess) => void;
}

/**
 * 서버를 띄우고 준비될 때까지 기다린다.
 *
 * spawn 이후 어떤 이유로든 준비 확인이 실패하면(타임아웃, 금지 포트, 자식 조기
 * 종료) 자식 프로세스 트리를 정리한 뒤에 원래 오류를 던진다. 정리까지 실패하면
 * 원래 오류를 보존한 StartupCleanupError로 둘을 함께 던진다.
 */
export async function startManagedServer(
  options: StartManagedServerOptions
): Promise<ManagedServer> {
  const { spawnOnPort, readyTimeoutMs, pollIntervalMs, log } = options;
  const pickPort = options.pickPort ?? (() => findSafePort({ onSkip: logSkip }));

  function logSkip(port: number) {
    log?.(`금지 포트 ${port}를 건너뛰고 다른 포트를 고릅니다.`);
  }

  const port = await pickPort();
  // 금지 포트로는 서버를 아예 띄우지 않는다 — 띄우면 정리할 프로세스만 생긴다.
  if (isUnsafePort(port)) throw new Error(unsafePortMessage(port));

  const baseURL = `http://localhost:${port}`;
  const child = spawnOnPort(port);

  let exitReason: string | null = null;
  child.once("exit", (code, signal) => {
    exitReason = `exit code=${code ?? "null"} signal=${signal ?? "null"}`;
  });
  child.once("error", (error) => {
    exitReason = `spawn 오류: ${error.message}`;
  });

  const killTree = options.killTree ?? killProcessTree;
  const stop = () => killTree(child);
  try {
    await waitForServer(baseURL, readyTimeoutMs, {
      intervalMs: pollIntervalMs,
      abortReason: () => exitReason,
    });
  } catch (error) {
    try {
      stop();
    } catch (cleanupError) {
      throw new StartupCleanupError(error, cleanupError);
    }
    throw error;
  }
  return { baseURL, stop };
}
