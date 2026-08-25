import { defineConfig, devices } from "@playwright/test";

// design.md §3.3 — Playwright 러너는 scripts/run-e2e.ts가 자식 프로세스로
// spawn한다(이 config 자체를 진입점으로 삼지 않는다). webServer는 그 러너가
// pnpm build && pnpm start를 자동 기동/종료한다.
//
// [HARD] webServer.env에 BETTER_AUTH_SECRET·TESTER_PASSWORD·
// TURSO_DATABASE_URL·BETTER_AUTH_URL을 재선언하지 않는다 — 이 네 값은
// scripts/run-e2e.ts가 조립해 자기 자신의 process.env에 설정한 뒤 자식으로
// 상속시키며, 여기서 재선언하면 SSOT가 두 곳으로 갈라진다(design.md §3.4).
// `env` 필드 자체를 생략해 상속만으로 충분하게 한다.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm build && pnpm start",
    url: "http://localhost:3000",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
