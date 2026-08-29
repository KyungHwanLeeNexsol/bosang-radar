import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import type { EvidenceSeedRecord } from "../db/seed/evidence-seed-schema.ts";
import { evidenceSeedFileSchema } from "../db/seed/evidence-seed-schema.ts";
import { evidence } from "../lib/db/schema.ts";
import { bootstrapCli } from "./cli-bootstrap.ts";

export type { EvidenceSeedRecord };

// @MX:ANCHOR: [AUTO] db 스코프 시드 진입점 — pnpm db:seed 및 향후
// scripts/run-e2e.ts(M5)의 in-process 재사용 대상
// @MX:REASON: design.md §3.3에서 run-e2e.ts가 이 함수를 db-migrate.ts의
// runMigrations()와 동일한 방식으로 in-process 재사용할 것을 전제하므로
// (plan.md §C M5 4단계), 시그니처 변경은 M5까지 파급된다.
export async function runSeed(): Promise<void> {
  const env = bootstrapCli("db");
  const client = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });

  try {
    const db = drizzle(client);
    const records = loadSeedRecords();
    const now = new Date();

    for (const record of records) {
      // 안정적 id 기준 upsert — 재실행 시 행 수 불변(REQ-RUNTIME-005)을
      // Drizzle의 __drizzle_migrations 위임 방식과 동일하게 DB 제약에 위임한다.
      await db
        .insert(evidence)
        .values({
          id: record.id,
          category: record.category,
          evidenceType: record.evidenceType,
          scope: record.scope,
          title: record.title,
          content: record.content,
          sourceUrl: record.sourceUrl,
          issueTypes: record.issueTypes,
          createdAt: now,
        })
        .onConflictDoUpdate({
          target: evidence.id,
          set: {
            category: record.category,
            evidenceType: record.evidenceType,
            scope: record.scope,
            title: record.title,
            content: record.content,
            sourceUrl: record.sourceUrl,
            issueTypes: record.issueTypes,
          },
        });
    }
  } finally {
    client.close();
  }
}

// 실행 시점 cwd가 아니라 이 스크립트 파일의 위치를 기준으로 시드 JSON 경로를
// 확정한다 — cli-bootstrap.ts의 resolveProjectRoot()와 같은 이유(design.md §3.2.2).
//
// SPEC-EVIDENCE-001 M1(design.md §1.5, REQ-EVIDENCE-007) — 이전에는
// `JSON.parse(...) as EvidenceSeedRecord[]`로 타입 단언만 해서, JSON 파일에
// 잘못된 값이 들어가도 조용히 통과시켰다. evidenceSeedFileSchema.parse()로
// 대체해, 검증 실패 시 ZodError를 던져 파일 전체 로딩을 fail-fast한다 —
// 잘못된 레코드만 건너뛰고 나머지를 부분 삽입(partial insert)하지 않는다.
function loadSeedRecords(): EvidenceSeedRecord[] {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const seedPath = path.resolve(currentDir, "..", "db", "seed", "evidence.json");
  const raw: unknown = JSON.parse(readFileSync(seedPath, "utf-8"));
  return evidenceSeedFileSchema.parse(raw);
}

// CLI 결과 처리를 별도 함수로 분리 — runSeed() 자체는 in-process 재사용
// 대상(design.md §3.3)이라 성공/실패 로그·exit code 부여를 섞지 않는다.
export function reportCliResult(result: Promise<void>): Promise<void> {
  return result
    .then(() => {
      console.log("✅ 시드 완료");
    })
    .catch((error: unknown) => {
      console.error("❌ 시드 실패:", error);
      process.exitCode = 1;
    });
}

const isDirectExecution =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  void reportCliResult(runSeed());
}
