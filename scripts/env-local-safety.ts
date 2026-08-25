import { existsSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
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
 * `envLocalPath`(기본값: 프로젝트 루트 `.env.local`)에 `newContent`를 쓰기 전,
 * 파일이 이미 존재하면 OS 임시 디렉터리(프로젝트 트리 밖)에 백업한다.
 * 반환된 핸들의 `restore()`는 원본이 있었다면 원본으로, 없었다면 파일 자체를
 * 삭제해 "존재하지 않던 상태"로 되돌린다.
 */
export function prepareSafeEnvLocal(
  newContent: string,
  envLocalPath: string = defaultEnvLocalPath()
): SafeEnvLocalHandle {
  const existed = existsSync(envLocalPath);
  let backupPath: string | undefined;

  if (existed) {
    const original = readFileSync(envLocalPath, "utf-8");
    const backupDir = mkdtempSync(path.join(tmpdir(), "moai-env-local-backup-"));
    backupPath = path.join(backupDir, ".env.local.bak");
    writeFileSync(backupPath, original, "utf-8");
  }

  writeFileSync(envLocalPath, newContent, "utf-8");

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
