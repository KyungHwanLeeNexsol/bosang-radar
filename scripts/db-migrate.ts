import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { bootstrapCli } from "./cli-bootstrap.ts";

// @MX:ANCHOR: [AUTO] db 스코프 마이그레이션 진입점 — pnpm db:migrate 및 향후
// scripts/run-e2e.ts(M5)의 in-process 재사용 대상
// @MX:REASON: design.md §3.3에서 run-e2e.ts가 이 함수를 in-process로 재사용할
// 것을 전제하므로(§E.2.4 단계), 시그니처 변경은 M5까지 파급된다.
export async function runMigrations(): Promise<void> {
  const env = bootstrapCli("db");
  const client = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });

  try {
    const db = drizzle(client);
    // 재실행 안전성은 Drizzle migrator의 __drizzle_migrations 추적 테이블에
    // 위임한다(REQ-RUNTIME-002) — 자체 상태 추적을 새로 만들지 않는다.
    await migrate(db, { migrationsFolder: resolveMigrationsFolder() });
  } finally {
    client.close();
  }
}

// 실행 시점 cwd가 아니라 이 스크립트 파일의 위치를 기준으로 migrations 폴더를
// 확정한다 — cli-bootstrap.ts의 resolveProjectRoot()와 같은 이유(design.md §3.2.2).
function resolveMigrationsFolder(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "..", "db", "migrations");
}

// CLI 결과 처리를 별도 함수로 분리 — runMigrations() 자체는 in-process 재사용
// 대상(design.md §3.3)이라 성공/실패 로그·exit code 부여를 섞지 않는다.
export function reportCliResult(result: Promise<void>): Promise<void> {
  return result
    .then(() => {
      console.log("✅ 마이그레이션 완료");
    })
    .catch((error: unknown) => {
      console.error("❌ 마이그레이션 실패:", error);
      process.exitCode = 1;
    });
}

const isDirectExecution =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  void reportCliResult(runMigrations());
}
