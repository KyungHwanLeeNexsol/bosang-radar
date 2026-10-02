import { defineConfig } from "@playwright/test";

// design.md §3.3 — Playwright 러너는 scripts/run-e2e.ts가 자식 프로세스로
// spawn한다(이 config 자체를 진입점으로 삼지 않는다). webServer는 그 러너가
// pnpm build && pnpm start를 자동 기동/종료한다.
//
// [HARD] webServer.env에 BETTER_AUTH_SECRET·TESTER_PASSWORD·
// TURSO_DATABASE_URL·BETTER_AUTH_URL을 재선언하지 않는다 — 이 네 값은
// scripts/run-e2e.ts가 조립해 자기 자신의 process.env에 설정한 뒤 자식으로
// 상속시키며, 여기서 재선언하면 SSOT가 두 곳으로 갈라진다(design.md §3.4).
//
// SPEC-B2C-DIAGNOSIS-001 M10 — ENABLE_DIAGNOSIS_DEV_STATES=true를 이
// webServer.env에만 설정한다(design.md §10/§19 — reviewEnabled 경로).
// ENABLE_DIAGNOSIS_FLOW/DIAGNOSIS_ENGINE_READY는 여기서 설정하지 않는다 —
// 두 플래그는 여전히 기본값 false이며(6개 동의 상세 문구 미확정, 실제
// 매칭 엔진 미연결), reviewEnabled 단독 경로만으로 <DiagnosisFlow />가
// 렌더링된다(design.md §19.1a 5행 행렬의 5번째 행과 일치). 이 값은 이
// Playwright 전용 webServer 프로세스에만 주입되며 .env.example 등 프로덕션
// 기본값 파일에는 반영하지 않는다.
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

// SPEC-B2C-CONSULT-001 후속(hydration #418 회귀) — CONSULT_POLICY_READY는
// 프로덕션 빌드/부팅 시점에 고정되는 서버 플래그라 한 번의 e2e 실행에서는
// 준비/미준비 두 모드를 동시에 검증할 수 없다. 그래서 모드를 별도 실행으로
// 나눈다:
//   준비 모드(기본):  pnpm test:e2e --spec=e2e/consult-flow-03.spec.ts
//   미준비 모드:      E2E_CONSULT_POLICY_READY=false pnpm test:e2e --spec=e2e/consult-flow-03.spec.ts
// test.skip 대신 제목 태그로 나눈다 — scripts/run-e2e.ts가 결과 표식 수를
// "Running N tests"와 대조하므로 skip이 섞이면 기대 수가 어긋난다. 제목에
// `@policy-not-ready`가 들어간 테스트는 미준비 모드에서만, 그 외 모든
// 테스트는 준비 모드에서만 실행한다(grep/grepInvert).
const policyReady = process.env.E2E_CONSULT_POLICY_READY !== "false";
const POLICY_NOT_READY_TAG = /@policy-not-ready/;

export default defineConfig({
  testDir: "./e2e",
  ...(policyReady ? { grepInvert: POLICY_NOT_READY_TAG } : { grep: POLICY_NOT_READY_TAG }),
  fullyParallel: false,
  forbidOnly: false,
  // SPEC-B2C-FOUNDATION-001 M5 — e2e/ 디렉터리 전체(구 B2B/Better Auth
  // 시나리오)를 삭제했다(progress.md §E.2 M5). SPEC-B2C-DIAGNOSIS-001 M10이
  // e2e/diagnosis-flow-01.spec.ts로 01 화면 범위의 첫 B2C E2E 스펙을
  // 신설한다. retries/workers는 공유 SQLite 파일(.tmp/e2e.db)을 여러 spec이
  // 동시에 쓰면 충돌할 수 있으므로 단일 워커로 직렬 실행하고, 실패한
  // 테스트는 최대 2회 재시도하는 보수적 기본값을 그대로 유지한다 — 01
  // 화면은 DB에 쓰지 않지만(design.md §7/§8), 이 config는 앞으로 DB에
  // 쓰는 스펙과도 공유된다.
  retries: 2,
  workers: 1,
  reporter: "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm build && pnpm start",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    // SPEC-B2C-CONSULT-001 M7 (design.md §4/§4.2, e2e/consult-flow-03.spec.ts
    // 상단 [SCOPE EXTENSION] 주석) — 03(상담 신청) 화면 e2e가 실제 제출까지
    // 도달하려면 ENABLE_CONSULT_FLOW/CONSULT_POLICY_READY 두 플래그가 모두
    // "true"여야 한다(computeConsultFlags). CONSULT_POLICY_READY="true"는
    // lib/env.ts의 app 스코프 조건부 게이트를 통해 RATE_LIMIT_HMAC_SECRET을
    // 요구하므로(instrumentation.ts register()가 부팅 시점에 fail-fast하며,
    // 없으면 `next start` 프로세스 자체가 종료된다) 반드시 함께 주입한다 — 값
    // 자체는 IP 해싱 전용 비시크릿 테스트 리터럴이며 실제 배포 시크릿이 아니다.
    // 01/02 스펙이 쓰는 ENABLE_DIAGNOSIS_DEV_STATES는 그대로 유지한다.
    env: {
      PORT: String(port),
      ENABLE_DIAGNOSIS_DEV_STATES: "true",
      ENABLE_CONSULT_FLOW: "true",
      CONSULT_POLICY_READY: policyReady ? "true" : "false",
      RATE_LIMIT_HMAC_SECRET: "e2e-test-rate-limit-hmac-secret",
    },
  },
});
