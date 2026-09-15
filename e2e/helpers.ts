import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import type { Page } from "@playwright/test";
import * as schema from "../lib/db/schema.ts";

// e2e/*.spec.ts 공용 헬퍼 — scripts/run-e2e.ts가 조립해 Playwright 러너에
// 상속시킨 TURSO_DATABASE_URL(file: 로컬 DB)로 직접 접속해 AC의 DB 단언을
// 수행한다(design.md §3.4). 브라우저를 경유하지 않는 검증 지점이므로 Node
// 컨텍스트에서 실행되는 Playwright 테스트 러너 프로세스 안에서만 유효하다.

// 반환값은 Drizzle 래퍼(`db`)와 하부 libsql 클라이언트를 닫는 `close`의 쌍이다.
// 래퍼만 돌려주면 호출부가 client 참조를 잃어 연결을 닫을 수 없고, 그 열린
// 핸들이 Playwright 러너 프로세스를 살려 두어 pnpm test:e2e가 스스로 종료하지
// 못한다(Windows에서는 file: DB 핸들이 남아 다음 실행의 .tmp 초기화까지
// EPERM으로 막는다). 호출부는 성공·실패 경로 모두에서 close()가 실행되도록
// test.afterEach에 등록한다.
export function connectE2EDb() {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TURSO_DATABASE_URL 환경변수가 없습니다 — scripts/run-e2e.ts를 경유해(pnpm test:e2e) 실행하세요."
    );
  }
  const client = createClient({ url });
  return { db: drizzle(client, { schema }), close: () => client.close() };
}

export function requireTesterPassword(): string {
  const password = process.env.TESTER_PASSWORD;
  if (!password) {
    throw new Error(
      "TESTER_PASSWORD 환경변수가 없습니다 — scripts/run-e2e.ts를 경유해(pnpm test:e2e) 실행하세요."
    );
  }
  return password;
}

export async function loginAsTester(page: Page, email: string): Promise<void> {
  const password = requireTesterPassword();
  await page.goto("/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL("/");
}
