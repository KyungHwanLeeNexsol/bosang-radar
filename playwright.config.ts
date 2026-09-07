import { defineConfig, devices } from "@playwright/test";

// design.md §3.3 — Playwright 러너는 scripts/run-e2e.ts가 자식 프로세스로
// spawn한다(이 config 자체를 진입점으로 삼지 않는다). webServer는 그 러너가
// pnpm build && pnpm start를 자동 기동/종료한다.
//
// [HARD] webServer.env에 BETTER_AUTH_SECRET·TESTER_PASSWORD·
// TURSO_DATABASE_URL·BETTER_AUTH_URL을 재선언하지 않는다 — 이 네 값은
// scripts/run-e2e.ts가 조립해 자기 자신의 process.env에 설정한 뒤 자식으로
// 상속시키며, 여기서 재선언하면 SSOT가 두 곳으로 갈라진다(design.md §3.4).
//
// 구현 시 확정 항목 — 포트(고정 3000 대신 실행 시점 빈 포트, progress.md
// §E.2 M5 참고): scripts/run-e2e.ts가 findFreePort()로 빈 포트를 확보해
// E2E_PORT로 자신의 process.env에 설정하고 그 값을 상속시킨다. 이 config는
// 별도 프로세스(Playwright 러너)에서 로드되므로 상속된 E2E_PORT를 읽어
// url/baseURL을 구성하고, webServer.env로 Next.js 서버 프로세스에도
// PORT로 전달한다(`next start`는 PORT 환경변수를 인식한다) — PORT는
// 시크릿이 아니므로 위 4개 키 재선언 금지 제약과 무관하다. E2E_PORT가
// 없으면(예: scripts/run-e2e.ts를 거치지 않고 `pnpm exec playwright test`를
// 직접 실행하는 개발 중 디버깅) 3000으로 폴백한다.
const port = process.env.E2E_PORT ? Number(process.env.E2E_PORT) : 3000;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: false,
  // Round5(외부 재검토) — workers:1 직렬 실행으로도 loginAsTester의
  // page.waitForURL("/") 타임아웃이 재현됨을 실측 확인했다(전체 suite
  // 실행 시 인접한 spec들의 로그인이 Better Auth 기본 rate limit — /sign-in
  // 경로에 10초 창 내 최대 3회 — 에 누적으로 걸림. workers:1은 DB/세션
  // "동시" 충돌만 막을 뿐, "짧은 시간 내 연속" 요청까지는 막지 못한다).
  // 프로덕션 인증 코드(lib/auth/)는 건드리지 않고, 테스트 인프라 레벨에서만
  // 대응한다 — 실패한 테스트를 처음부터 다시 실행하는 표준 Playwright
  // retry로, 실제 결함은 재시도 후에도 동일하게 재현되므로 결함을 가리지
  // 않는다.
  retries: 2,
  // Round3 E2E 격리 수정 — SQLite DB 및 세션 공유 충돌 방지: 단일 워커로 직렬 실행.
  // 4개 spec이 동시에 같은 DB(.tmp/e2e.db)와 TESTER_A 세션을 사용하면
  // loginAsTester의 page.waitForURL("/")가 타임아웃된다(AC-024 근본 원인).
  workers: 1,
  reporter: "list",
  use: {
    baseURL,
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
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { PORT: String(port) },
  },
});
