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

// DatePicker(components/ui/date-picker.tsx)는 타이핑을 지원하지 않는 버튼
// 트리거다 — 값은 달력을 열고, 목표 월까지 이동한 뒤, 해당 날짜 셀을
// 클릭해야만 채워진다. testId는 트리거(예: "case-incident-date")를
// 가리킨다. 달력 헤더 문구("YYYY년 M월")와 셀의
// `calendar-day-YYYY-MM-DD` testid는 components/ui/calendar.tsx와
// 같은 형식을 따른다.
export async function pickDateFromPicker(
  page: Page,
  testId: string,
  isoDate: string
): Promise<void> {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    throw new Error(`잘못된 날짜 형식입니다: ${isoDate}`);
  }
  const targetYear = Number(match[1]);
  const targetMonth = Number(match[2]) - 1;

  await page.getByTestId(testId).click();

  const monthLabel = page.getByText(/^\d{4}년 \d{1,2}월$/);
  await monthLabel.waitFor({ state: "visible" });

  for (let guard = 0; guard < 36; guard += 1) {
    const labelText = (await monthLabel.textContent())?.trim() ?? "";
    const parsed = /^(\d{4})년 (\d{1,2})월$/.exec(labelText);
    if (!parsed) {
      throw new Error(`달력 헤더를 해석하지 못했습니다: "${labelText}"`);
    }
    const shownYear = Number(parsed[1]);
    const shownMonth = Number(parsed[2]) - 1;
    if (shownYear === targetYear && shownMonth === targetMonth) {
      break;
    }
    const forward =
      shownYear < targetYear || (shownYear === targetYear && shownMonth < targetMonth);
    await page.getByRole("button", { name: forward ? "다음 달" : "이전 달" }).click();
  }

  await page.getByTestId(`calendar-day-${isoDate}`).click();
}
