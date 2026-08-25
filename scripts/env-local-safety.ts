import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// @MX:ANCHOR: [AUTO] .env.local 안전 교체·복원 메커니즘 — AC-RUNTIME-015·021의
// sentinel/테스트 .env.local Given을 만들고 검증 종료 후 개발자의 원본 파일을
// 되돌리는 유일한 경로.
// @MX:REASON: design.md §3.6 — 이 메커니즘 없이 검증 목적 파일을 직접 덮어쓰면
// 개발자가 이미 보유한 실제 .env.local(실 자격증명 포함 가능)을 파괴한다.

export interface SafeEnvLocalHandle {
  /** 원본 상태(부재 또는 원본 내용)로 되돌린다. 여러 번 호출해도 안전하다(멱등). */
  restore(): void;
}

// 실행 시점 cwd가 아니라 이 스크립트 파일의 위치를 기준으로 프로젝트 루트를
// 확정한다 — cli-bootstrap.ts의 resolveProjectRoot()와 같은 이유.
function resolveProjectRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "..");
}

function defaultEnvLocalPath(): string {
  return path.join(resolveProjectRoot(), ".env.local");
}

/**
 * prepareSafeEnvLocal() 본문(백업 생성 → sentinel 쓰기)이 도중에 실패하면
 * (예: 디스크 풀) 원래 에러를 재던지기 전에 남겨진 상태를 best-effort로
 * 되돌린다 — 백업이 이미 온전히 쓰였다면 그 내용을 `envLocalPath`에 되돌리고,
 * 백업 디렉터리가 만들어졌다면(내용물 유무와 무관) 항상 제거해 개발자의 실
 * 자격증명이 담긴 백업이 OS 임시 디렉터리에 orphan으로 남지 않게 한다.
 * 정리 자체가 실패해도 원래 에러를 가리지 않는다 — 로그만 남기고 원래 에러를
 * 그대로 던진다(호출부에서 `throw error;`로 재던짐).
 */
function cleanupAfterPrepareFailure(params: {
  existed: boolean;
  backupDir: string | undefined;
  backupPath: string | undefined;
  backupWritten: boolean;
  envLocalPath: string;
}): void {
  const { existed, backupDir, backupPath, backupWritten, envLocalPath } = params;
  try {
    if (backupWritten && backupPath) {
      const original = readFileSync(backupPath, "utf-8");
      writeFileSync(envLocalPath, original, "utf-8");
    } else if (!existed && existsSync(envLocalPath)) {
      unlinkSync(envLocalPath);
    }
    if (backupDir && existsSync(backupDir)) {
      rmSync(backupDir, { recursive: true, force: true });
    }
  } catch (cleanupError) {
    console.error(
      "prepareSafeEnvLocal: 실패 후 orphan 정리 중 추가 오류 발생(원래 오류는 계속 전파됨)",
      cleanupError
    );
  }
}

/**
 * `envLocalPath`(기본값: 프로젝트 루트 `.env.local`)에 `newContent`를 쓰기 전,
 * 파일이 이미 존재하면 OS 임시 디렉터리(프로젝트 트리 밖)에 백업한다.
 * 반환된 핸들의 `restore()`는 원본이 있었다면 원본으로, 없었다면 파일 자체를
 * 삭제해 "존재하지 않던 상태"로 되돌린다.
 *
 * 이 함수 자신의 실행 도중(백업 생성 또는 sentinel 쓰기 중) 실패하면
 * `cleanupAfterPrepareFailure()`가 orphan 백업/부분 쓰기를 정리한 뒤 원래
 * 에러를 재던진다 — 호출부(`withSafeEnvLocal`)가 등록하는 SIGINT/SIGTERM/
 * exit 복원 핸들러는 이 함수가 성공적으로 반환한 "이후"에만 존재하므로,
 * 반환 전 실패는 이 함수 자신이 닫아야 하는 별도의 방어선이다.
 */
export function prepareSafeEnvLocal(
  newContent: string,
  envLocalPath: string = defaultEnvLocalPath()
): SafeEnvLocalHandle {
  const existed = existsSync(envLocalPath);
  let backupDir: string | undefined;
  let backupPath: string | undefined;
  let backupWritten = false;

  try {
    if (existed) {
      const original = readFileSync(envLocalPath, "utf-8");
      backupDir = mkdtempSync(path.join(tmpdir(), "moai-env-local-backup-"));
      backupPath = path.join(backupDir, ".env.local.bak");
      writeFileSync(backupPath, original, "utf-8");
      backupWritten = true;
    }

    writeFileSync(envLocalPath, newContent, "utf-8");
  } catch (error) {
    cleanupAfterPrepareFailure({ existed, backupDir, backupPath, backupWritten, envLocalPath });
    throw error;
  }

  let restored = false;
  const restore = (): void => {
    if (restored) {
      return;
    }
    restored = true;

    if (existed && backupPath) {
      const original = readFileSync(backupPath, "utf-8");
      writeFileSync(envLocalPath, original, "utf-8");
      unlinkSync(backupPath);
    } else if (existsSync(envLocalPath)) {
      unlinkSync(envLocalPath);
    }
  };

  return { restore };
}

/**
 * `fn` 실행 동안 `envLocalPath`를 `newContent`로 안전하게 교체하고, 정상 종료·
 * 예외·`SIGINT`/`SIGTERM`·프로세스 `exit` 중 어느 경로로 끝나더라도 원본 상태를
 * 복원한다(design.md §3.6 기본 메커니즘). `kill -9`(SIGKILL)처럼 인-프로세스
 * 시그널 핸들러 자체를 우회하는 강제 종료는 이 설계로 닫을 수 없는 잔여
 * 위험으로 명시적으로 남긴다(spec.md §5).
 */
export async function withSafeEnvLocal<T>(
  newContent: string,
  fn: () => Promise<T>,
  envLocalPath: string = defaultEnvLocalPath()
): Promise<T> {
  const handle = prepareSafeEnvLocal(newContent, envLocalPath);

  // @MX:WARN: [AUTO] 프로세스 전역 상태(process 리스너)를 등록해 실 자격증명이
  // 담길 수 있는 .env.local 복원을 보장하는 지점 — 정상/예외 종료를 커버하는
  // try/finally와 달리, 시그널로 죽는 종료 경로는 이 리스너들이 없으면 전혀
  // 커버되지 않는다.
  // @MX:REASON: 이 리스너들을 제거하거나 등록 순서를 바꾸면 fn() 실행 중
  // Ctrl+C(SIGINT)/kill(SIGTERM)로 프로세스가 종료될 때 개발자의 원본
  // .env.local이 sentinel 내용으로 영구 치환된 채 남는다 — finally 블록은
  // 정상/예외 종료 경로만 커버하고 시그널 종료 경로는 커버하지 않기 때문이다.
  // kill -9(SIGKILL)처럼 시그널 핸들러 자체를 우회하는 강제 종료는 이 설계로
  // 닫을 수 없는 잔여 위험으로 명시적으로 남겨둔다(spec.md §5, 함수 상단
  // JSDoc과 동일한 전제 — 이 WARN이 그 전제를 재확인한다).
  const onExit = (): void => {
    handle.restore();
  };
  const onSignal = (): void => {
    handle.restore();
    process.exit(1);
  };

  process.on("exit", onExit);
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  try {
    return await fn();
  } finally {
    handle.restore();
    process.removeListener("exit", onExit);
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
  }
}
