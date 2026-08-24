import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

// @MX:ANCHOR: [AUTO] 모든 DB 접근 지점이 의존하는 단일 클라이언트 생성 함수
// @MX:REASON: lib/pipeline/, app/api/cases/, lib/auth/ 등 다수 지점이 이 함수를
// 통해서만 DB에 접근하므로, 시그니처 변경은 파급 범위가 크다 (plan.md §F).
// NOTE: TURSO_SYNC_URL은 의도적으로 사용하지 않는다 — Vercel 서버리스 환경에서는
// 로컬 복제본을 유지할 수 없어 콜드스타트마다 sync 비용만 발생한다 (research.md §2).
export function createDbClient() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    throw new Error("TURSO_DATABASE_URL과 TURSO_AUTH_TOKEN 환경변수가 설정되어야 합니다.");
  }

  const client = createClient({ url, authToken });
  return drizzle(client, { schema });
}

let cachedDb: ReturnType<typeof createDbClient> | undefined;

export function getDb() {
  if (!cachedDb) {
    cachedDb = createDbClient();
  }
  return cachedDb;
}
