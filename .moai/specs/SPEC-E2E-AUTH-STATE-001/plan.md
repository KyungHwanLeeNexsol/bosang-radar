# Plan — SPEC-E2E-AUTH-STATE-001

## §A. Context

- **프로젝트 상태**: 브라운필드. SPEC-RUNTIME-001(status: completed)이 구축한 E2E 하네스(`scripts/run-e2e.ts` 단일 진입점, `playwright.config.ts`, `e2e/helpers.ts`) 위에 순수 테스트 인프라 개선만 추가한다.
- **작업 위치**: `C:/Users/Nexsol/Documents/bosang-radar` (main checkout).
- **Tier**: M (3개 아티팩트 + progress.md). 판단 근거는 §A.1.
- **라우트**: `.moai/config/sections/git-strategy.yaml`의 `git_strategy.mode: manual` + 기존 세션 관례(`plan/SPEC-PILOT-UX-001`, `plan/SPEC-FEEDBACK-001`)에 따라 `plan/SPEC-E2E-AUTH-STATE-001` 브랜치 + PR 라우트를 따른다. `manual.push_to_remote: false`이므로 plan-phase에서는 로컬 커밋까지만 수행한다.
- **개발 방법론**: TDD (`.moai/config/sections/quality.yaml` → `constitution.development_mode: "tdd"`). Playwright 스펙 파일 자체가 사양이므로, run-phase에서는 "5회 반복 실행 시 재시도 0건"을 RED(현재 상태 재현) → GREEN(전환 후 확인) 사이클의 관측 대상으로 삼는다.
- **SPEC 아티팩트**: `.moai/specs/SPEC-E2E-AUTH-STATE-001/{spec,plan,acceptance,progress}.md`.
- **검증 기준선(baseline) 표기법** — 이하 모든 "무변경" 검증은 아래 두 참조를 사용한다(§C M6, `acceptance.md`가 공유):
  - `$SPEC_START_SHA` = `1d480eaac2e0b53e0a5f0080baf14a596f09f533` (이 SPEC 작업 시작 직전 main HEAD — `feat(SPEC-UI-MIGRATION-001): ... (#8)` 머지 커밋. 외부 리뷰어가 브랜치 히스토리에서 실측 확인).
  - `$IMPL_COMPLETE_HEAD` = run-phase 구현이 커밋된 시점의 HEAD SHA(run-phase 실행 시 `git rev-parse HEAD`로 그때그때 확정).
  - **무변경 검증은 항상 2단계**: (1) `git diff --stat "$SPEC_START_SHA" "$IMPL_COMPLETE_HEAD" -- <path>` — 커밋된 변경 비교(인자 없는 `git diff`는 작업 트리 대 HEAD/인덱스만 비교하므로, 이미 커밋된 변경은 빈 결과로 나타나 거짓 PASS를 만든다 — 외부 리뷰어 지적), (2) `git status --short -- <path>` — 스테이지/미스테이지/미추적 잔여 변경 확인. 두 결과 모두 빈 값이어야 "무변경"이 성립한다.

### §A.1 Tier 판정 근거 (M)

| 신호 | 실측/추정 | Tier 함의 |
|------|-----------|-----------|
| 영향 파일 수 | 5개 — `playwright.config.ts`(수정) + `e2e/auth.setup.ts`(신규) + 경로 상수 leaf 모듈(신규) + `e2e/case-input-mobile-layout.spec.ts`(수정) + `e2e/tenant-isolation.spec.ts`(수정) | 5-15 → **M** (S의 "< 5 files" 상한에 걸침) |
| 신규 LOC | 약 90-150 (setup 파일 ~50줄 — 네트워크 요청 카운팅 로직 포함, 경로 상수 모듈 ~10줄, config 변경 ~20줄, 스펙 파일 2개 각 5-10줄 diff) | < 300 → S 쪽이나, 파일 수가 Tier를 결정 |
| 도메인 수 | E2E 인증 하네스 1개 (단일 도메인, 아키텍처 변경 없음) | S 쪽 신호 |
| 검증 복잡도 | "5회 반복 실행 무재시도"·"leftover storageState 재생성 실측"·"네트워크 요청 횟수 검증" 같은 반복·통계적·실행 기반 증거가 필요하고, AC가 다수 요구 영역에 걸쳐 있어 acceptance.md 분리가 spec.md 인라인보다 추적성이 높음 | M 쪽 신호 |

파일 수(5개)가 Tier S의 "< 5 files" 경계에 걸리고, AC 영역이 다수라 별도 `acceptance.md`가 추적성에 유리하므로 **Tier M**으로 분류한다. REQ 10개 / AC 15개(013-015 신설, 012까지에서 이어짐 — 015는 a/b 두 하위 시나리오를 갖는 하나의 논리적 AC)로 Tier M 상한(16/16) 대비 여유를 둔다.

### §A.2 PRESERVE 목록 (수정 금지)

- `e2e/helpers.ts` — `loginAsTester`/`requireTesterPassword`/`connectE2EDb` 전체 (REQ-E2EAUTH-004)
- `e2e/mobile-drawer-focus.spec.ts` — 인라인 `loginForDrawerTest` 재시도 헬퍼 전체 (REQ-E2EAUTH-005)
- `playwright.config.ts`의 `workers: 1`, `retries: 2`, `webServer` 블록 (REQ-E2EAUTH-005) — `webServer` 블록의 PRESERVE는 `acceptance.md` AC-E2EAUTH-007이 블록 단위 diff 추출로 직접 검증한다(§C M6, §D 참고 — 이번 개정에서 검증 방법을 구체화).
- `scripts/run-e2e.ts`, `scripts/e2e-tester-emails.ts`, `scripts/provision-tester.ts` — 전체, 그리고 `scripts/` 디렉터리 자체 (REQ-E2EAUTH-009 범위 밖) — `acceptance.md` AC-E2EAUTH-013이 `scripts/` 전체에 대해 커밋된 diff + 작업 트리 상태 2단계로 직접 검증한다(이전까지는 AC-E2EAUTH-009의 pathspec 제외 목록에 `scripts/`가 포함되어 있어 그 디렉터리 자체의 무변경이 별도로 검증되지 않는 갭이 있었다 — 외부 리뷰어 지적, 이번 개정에서 폐쇄).
- `e2e/case-flow.spec.ts`, `e2e/sidebar-sticky.spec.ts`, `e2e/capture-evidence.spec.ts`, `e2e/capture-evidence-round5.spec.ts`, `e2e/comparison-docs-images.spec.ts`, `e2e/auth.spec.ts` — 전체 (REQ-E2EAUTH-003)
- `lib/`, `app/`, `db/` 이하 모든 애플리케이션/프로덕션 코드 — 전체 (REQ-E2EAUTH-009)

## §B. 순서 안내 (결정 가역성 기준 정렬)

이 SPEC은 데이터 모델이나 UX 흐름 변경이 없는 순수 테스트 인프라 작업이다. 이전 버전(v0.1.1까지)은 "Playwright project-dependency가 `--spec=<filter>` 필터와 호환되는가"를 유일한 미해결 설계 불확실성으로 보고 §C M1을 그 실측 스파이크로 배치했으나, **외부 리뷰어가 Playwright 공식 문서 + `1.62.1` 최소 재현으로 그 호환성을 이미 확인**했다(§C M1 참고) — 따라서 project-dependency는 더 이상 조건부 후보가 아니라 이 SPEC의 유일한 base 설계다. §C M1은 그 확인 사실을 기록하고, 남은 유일한 확인 항목(실제 진입점 `scripts/run-e2e.ts`를 통한 env 상속)을 M6로 명시적으로 위임하는 역할로 재정의되며, 여전히 문서 맨 앞에 남는다 — 설계가 확정되었다는 사실 자체가 이후 마일스톤 전체(M2-M6)의 전제이기 때문이다. M2-M6은 그 전제 위의 기계적 구현·전환·검증 단계이므로 뒤에 배치한다.

## §C. 마일스톤 (검토 우선순위 순)

### M1 — [설계 확정, 기록] project-dependency를 base 설계로 확정 (Priority High)

**이전 버전과의 차이(v0.1.2)**: v0.1.1까지 이 마일스톤은 "project-dependency가 `--spec` 필터와 호환되는지"를 구현 착수 시점에 실측 검증하고, 실패 시 `test.beforeAll` 공유 헬퍼 기반 지연 생성 fallback으로 전환하는 조건부 스파이크였다. 외부 리뷰어가 이 상호작용을 이미 확인함에 따라, 그 조건부 구조 전체(PASS/FAIL 분기 + fallback 설계)를 **삭제**한다 — 더 이상 유지할 이유가 있는 미해결 불확실성이 없기 때문이다.

- **확인된 사실**: Playwright 공식 문서와 `1.62.1`에서의 최소 재현에 따르면, `dependencies: ["setup"]`을 가진 project는 파일 경로 필터(예: `playwright test tenant-isolation`, `scripts/run-e2e.ts`의 `--spec=<filter>` 패스스루가 만드는 형태 포함)가 주어져도 여전히 실행된다 — 필터가 setup 프로젝트의 테스트 파일 자체에 매칭되지 않아도, 그 setup에 의존하는 대상 project가 실행 대상에 포함되는 한 setup은 실행된다.
- **base 설계**: M2-M6 전체가 project-dependency(`setup` project + 대상 2개 파일 전용 project, `dependencies: ["setup"]`)를 무조건 전제로 진행한다. 더 이상 "M1 PASS/FAIL"이라는 분기 언어를 쓰지 않는다.
- **삭제된 대안**: 이전 버전이 문서화했던 `test.beforeAll` 기반 지연 생성(lazy-create) 공유 헬퍼 fallback 설계 전체(그리고 그 설계가 필요로 했던 stale-storageState 방지 가드 — "무조건 삭제 후 재생성" 또는 "실행-스코프 식별자 게이팅")를 삭제한다. 이 가드는 "파일 존재 여부로 재사용을 판단하는" fallback 특유의 결함을 막기 위한 것이었다 — base 설계(project-dependency)의 setup `test()`는 매 실행마다 무조건 실행되어 `storageState({ path })`로 파일을 덮어쓰므로("존재하면 건너뜀" 로직이 애초에 없음), 그 결함 자체가 base 설계에는 구조적으로 발생하지 않는다.
- **[HARD] SPEC 저자가 이 대안을 그래도 유지하기로 판단하는 경우의 추가 요건(참고, 현재는 채택하지 않음)**: 만약 향후 이 fallback을 "자동 전환이 아닌 문서화된 contingency"로 재도입할 필요가 생기면, 최소한 다음 두 가지를 추가로 해결해야 한다 — (a) **워커 재시작 재실행 문제**: Playwright worker가 스위트 중간에 재시작되면 그 worker 프로세스 안에서 fallback의 지연 생성 로그인이 다시 트리거되어 rate-limit 위험이 재도입될 수 있다(재시작된 worker는 "이번 worker 프로세스에서 아직 생성하지 않음" 상태로 다시 시작하기 때문). (b) **`E2E_PORT`를 실행-고유 식별자로 쓰지 않기**: 이전 버전이 실행-스코프 식별자 후보로 제시했던 `process.env.E2E_PORT`는 실행마다 고유함이 보장되지 않는다(포트 재사용 가능성) — 실행-고유성이 필요하다면 별도의 명시적 run-id(예: `crypto.randomUUID()`를 진입점이 생성해 env로 전달)를 도입해야 한다.
- **남은 유일한 확인 항목**: `scripts/run-e2e.ts`가 조립하는 env(`TURSO_DATABASE_URL` 등)가 setup 프로젝트에도 다른 project와 동일하게 상속되는지는, 실제 컴포넌트(auth.setup.ts, config, 대상 파일)가 모두 존재해야 검증 가능하므로 별도의 사전 스파이크가 아니라 **`acceptance.md` AC-E2EAUTH-008(M6, 실제 `--spec=<filter>` 실행)이 실행으로 확인**한다 — 사전 스파이크와 달리 실제 진입점을 통한 실행이므로 더 신뢰도 높은 확인이다.

### M2 — 경로 상수 leaf 모듈 신설 (Priority High)

`e2e/storage-state-paths.ts`를 신설해 `TESTER_A_STORAGE_STATE_PATH`/`TESTER_B_STORAGE_STATE_PATH` 두 문자열 상수(예: `.tmp/storageState-tester-a.json`, `.tmp/storageState-tester-b.json`)를 export한다. `scripts/e2e-tester-emails.ts`와 동일한 leaf-module 규율(어떤 `import.meta` 사용 모듈도 직접·간접 import하지 않음)을 따른다 — 문자열 리터럴만 export하므로 이 규율은 자명하게 충족되지만, 향후 유지보수자를 위해 그 이유를 파일 상단 주석으로 명시한다(REQ-E2EAUTH-010).

### M3 — `e2e/auth.setup.ts` 작성 (Priority High)

Playwright "setup" 테스트 파일을 신설한다. `loginAsTester()`는 import하지 않고(그 함수를 재사용하면 `helpers.ts` 변경 시 이 파일의 동작이 암묵적으로 결합되므로, `helpers.ts`-무변경 제약과는 별개로 독립성을 위해 로그인 5줄을 직접 재현), `helpers.ts`의 `requireTesterPassword()`만 import해 재사용한다(읽기 전용 헬퍼 재사용은 REQ-E2EAUTH-004의 "helpers.ts 수정 금지"와 무관 — helpers.ts 자체를 건드리지 않기 때문). TESTER_A/TESTER_B 각각에 대해:

1. 새 브라우저 컨텍스트에서 `/login` 이동 → 이메일/비밀번호 입력 → 제출 → `waitForURL("/")`
2. `page.context().storageState({ path: <M2 경로 상수> })` 호출

두 테스터를 순차 처리(같은 파일 안에서 두 개의 `test()` 블록, 또는 하나의 `test()` 안에서 두 컨텍스트를 순차 생성 — 최종 형태는 자유롭게 선택 가능한 구현 세부사항이다).

**[HARD, 신규 v0.1.2] `/sign-in` 실제 네트워크 요청 횟수 검증(REQ-E2EAUTH-001 정밀화)**: "테스터당 로그인 1회"라는 요구사항은 지금까지 UI 결과(로그인 성공 후 `/`로 리다이렉트)로만 간접 확인되어 왔다 — 실제로 몇 번의 `/sign-in` 네트워크 요청이 나갔는지는 관측되지 않았다. Better Auth 설치본(`better-auth@1.7.1`, 이 프로젝트의 `app/api/auth/[...all]/route.ts` 마운트, `basePath` 커스터마이즈 없음 — `lib/auth/config.ts` 실측 확인, 커스텀 `basePath`/`rateLimit` 설정 없음)의 실제 라우트 등록을 소스에서 직접 확인한 결과, 이메일 로그인 엔드포인트는 정확히 `POST /api/auth/sign-in/email`이다(`node_modules/better-auth/dist/api/routes/sign-in.mjs`의 `createAuthEndpoint("/sign-in/email", ...)` 실측 인용). 각 테스터의 로그인 블록에 다음 형태의 카운팅 로직을 추가한다:

```ts
let signInHits = 0;
page.on("requestfinished", (req) => {
  if (req.method() === "POST" && new URL(req.url()).pathname === "/api/auth/sign-in/email") {
    signInHits += 1;
  }
});
// ... 로그인 수행 ...
expect(signInHits).toBe(1);
```

두 개의 `test()` 블록(또는 두 개의 독립된 브라우저 컨텍스트) 각각에서 이 카운터를 독립적으로 리셋해 검증한다 — 즉 "테스터당 정확히 1회"를 UI 리다이렉트가 아니라 실제 네트워크 요청 수로 직접 증명한다. 이 카운트는 순수 정수이며 쿠키·토큰·비밀번호를 전혀 포함하지 않으므로, 검증 증거로 그대로 로그에 남겨도 안전하다(§D 참고, `acceptance.md` AC-E2EAUTH-014와 연결).

### M4 — `playwright.config.ts` project 구성 (Priority High)

- `projects` 배열에 `{ name: "setup", testMatch: /.*\.setup\.ts/ }` 추가
- `projects` 배열에 두 대상 파일 전용 project(예: `name: "chromium-authed"`) 추가 — `use: { ...devices["Desktop Chrome"] }`(기존 `chromium`과 동일 디바이스 프로파일), `dependencies: ["setup"]`, `testMatch`를 `case-input-mobile-layout.spec.ts`·`tenant-isolation.spec.ts` 2개 파일로 한정
- 기존 `chromium` project에 `testIgnore`를 추가해 위 2개 파일을 제외 — 동일 파일이 두 project에서 중복 실행되는 것을 방지
- `workers: 1`, `retries: 2`, `webServer` 블록은 한 글자도 건드리지 않는다(§A.2 PRESERVE, `acceptance.md` AC-E2EAUTH-007이 `webServer` 블록을 블록 단위로 diff 추출해 직접 검증).

### M5 — 대상 스펙 파일 2개 전환 (Priority High)

`e2e/case-input-mobile-layout.spec.ts`와 `e2e/tenant-isolation.spec.ts`에서 `loginAsTester(page, ...)` 호출과 그 관련 import(`loginAsTester`)를 제거하고, 파일 상단에 `test.use({ storageState: <M2 경로 상수> })`를 추가한다. 두 파일 모두 로그인 이후의 테스트 본문·단언은 한 글자도 바꾸지 않는다(REQ-E2EAUTH-008). `tenant-isolation.spec.ts`의 DB 직접 조회(TESTER_A 조회, `connectE2EDb`)는 브라우저 인증과 무관하므로 그대로 유지한다.

### M6 — 검증 (Priority High)

모든 무변경 확인은 §A "검증 기준선" 표기법(`$SPEC_START_SHA` vs `$IMPL_COMPLETE_HEAD` 커밋 diff + `git status --short` 작업 트리 확인, 2단계)을 따른다.

1. **반복 실행 무재시도 (setup 단계 포함, 5회, 세분화 기록)** — 클린 트리에서 `pnpm test:e2e`를 5회 연속 실행한다. 매 회, Playwright `list` 리포터 출력에서 **`auth.setup.ts`(setup 단계 자신) / `case-input-mobile-layout.spec.ts` / `tenant-isolation.spec.ts` 세 항목을 각각 독립적으로** 다음 4가지 상태 중 하나로 분류해 기록한다: **1차 시도 통과** / **재시도 후 통과** / **실패** / **예상된 스킵**(대상 아님 — capture-evidence 계열 2개 파일에만 해당, 아래 4번 참고). 단일 pass/fail 집계가 아니라 위 3항목 × 5회 = 15칸의 표로 기록한다(`acceptance.md` AC-E2EAUTH-003). **setup 단계 자신이 재시도 후에만 통과한 회차는 "flakiness 해소" PASS 집계에서 제외한다** — setup의 재시도 성공을 대상 파일의 무재시도 성공과 혼동하면 setup 단계 안에 남아 있는 미해결 rate-limit 문제를 감출 수 있다.
2. **전체 스위트 회귀 없음 + capture-evidence 예상 스킵** — `pnpm test:e2e`(전체 스위트, 필터 없음, `CAPTURE_EVIDENCE` 미설정) 실행 시 exit 0 확인. 다른 5개 스펙 파일(`case-flow`/`mobile-drawer-focus`/`sidebar-sticky`/`comparison-docs-images`, 그리고 `auth.spec.ts`)은 통과, `capture-evidence.spec.ts`·`capture-evidence-round5.spec.ts` 2개는 **EXPECTED-SKIP**(자체 `test.skip(!process.env.CAPTURE_EVIDENCE, ...)` 가드로 인해 — `capture-evidence.spec.ts` 56번째 줄, `capture-evidence-round5.spec.ts` 52번째 줄에서 실측 확인됨) 상태로 리포터에 나타나야 한다(`acceptance.md` AC-E2EAUTH-004). `CAPTURE_EVIDENCE=1`로 활성화한 별도 실행이 필요하면 그것은 이 AC와 분리된 별도 실행 조건이며, 이 SPEC의 기본-실행 AC에 포함하지 않는다.
3. **`e2e/helpers.ts`, `e2e/mobile-drawer-focus.spec.ts`, `e2e/auth.spec.ts`, 나머지 5개 out-of-scope 파일, `scripts/` 전체 무변경** — 각각 §A 2단계 방법으로 확인(`acceptance.md` AC-E2EAUTH-005/007/011/012/013).
4. **`playwright.config.ts`의 `workers`/`retries`/`webServer` 블록 무변경** — `grep -c "retries: 2" playwright.config.ts`와 `grep -c "workers: 1" playwright.config.ts`가 각각 `1`; `webServer` 블록은 `$SPEC_START_SHA`/`$IMPL_COMPLETE_HEAD` 두 리비전에서 `sed -n '/^  webServer: {/,/^  },$/p'`로 블록을 추출해 `diff`로 비교, 빈 결과(`acceptance.md` AC-E2EAUTH-007).
5. **`--spec=<filter>` 필터링 시에도 setup 의존성 실행(실제 진입점 확인)** — `pnpm test:e2e -- --spec=tenant-isolation`을 실행해, `tenant-isolation.spec.ts`가 인증된 세션으로 성공적으로 실행되고 exit 0으로 종료하는지 확인(`acceptance.md` AC-E2EAUTH-008) — 이것이 §C M1이 위임한 "실제 진입점을 통한 env 상속" 확인이다.
6. **storageState 재생성 실측(leftover 파일 존재 상태에서)** — 아래 절차를 **(a) 전체 스위트**와 **(b) `--spec=<filter>` 개별 실행**(대상 2개 파일 각각) 양쪽 모두에 대해 수행한다(`acceptance.md` AC-E2EAUTH-015a/015b):
   1. 1차 실행 후 `.tmp/storageState-tester-{a,b}.json`의 SHA-256 해시(`sha256sum`)와 mtime(`stat`)을 기록한다 — **파일 내용(쿠키·토큰) 자체는 어떤 로그·증거에도 원문으로 남기지 않는다**, 해시값과 mtime만 기록한다(비밀 노출 없이 변경 여부만 증명 가능).
   2. 파일을 삭제하지 않은 채(leftover 상태) 2차 실행을 수행한다(DB 초기화 + 테스터 재프로비저닝이 자동으로 일어남).
   3. 2차 실행 직후 같은 두 값을 재측정 — mtime이 더 최신인지, SHA-256 해시가 1차와 달라졌는지 확인.
   4. 각 storageState가 실제로 **자신의** 테스터 계정으로 인증되는지, Better Auth의 세션 조회 엔드포인트 `GET /api/auth/get-session`(`node_modules/better-auth/dist/api/routes/session.mjs`의 `createAuthEndpoint("/get-session", ...)` 실측 확인, 응답 스키마 `{ session, user }`)을 그 storageState로 호출해 응답 JSON의 `user.email` 필드만 추출·비교한다(`TESTER_A_STORAGE_STATE_PATH` → `user.email === TESTER_A_EMAIL`, 그 반대는 실패). **응답 전체나 세션 쿠키 자체를 로그에 남기지 않고, 비교 결과(bool)와 비교 대상 이메일 문자열만 기록한다.**
7. **프로덕션/애플리케이션 코드 무변경** — `$SPEC_START_SHA`/`$IMPL_COMPLETE_HEAD` 사이 `e2e/`, `playwright.config.ts`, `scripts/`, `.moai/` 외부에 diff가 없는지 확인(`acceptance.md` AC-E2EAUTH-009).
8. **lint/format — 신규 위반 0건(사전 위반과 구분)** — `pnpm lint` exit 0(베이스라인 실측: 사전 위반 0건, 아래 §D 인용). `pnpm format:check`는 베이스라인에 이미 존재하는 3건(`app/globals.css`, `CHANGELOG.md`, `docs/evidence/SPEC-UI-MIGRATION-001/comparison-login.html` — 이 SPEC과 무관한 사전 부채, §D 인용)을 제외하고, 이 SPEC이 변경·추가한 파일(`e2e/auth.setup.ts`, `e2e/storage-state-paths.ts`, `e2e/case-input-mobile-layout.spec.ts`, `e2e/tenant-isolation.spec.ts`, `playwright.config.ts`) 안에서 신규 위반 0건임을 확인한다. `pnpm build` exit 0.

## §D. 기술적 접근 (Technical Approach)

- **왜 project-dependency 패턴이 base 설계인가(v0.1.2 확정)**: Playwright 공식 "Authentication" 레시피가 문서화한 표준 패턴이며, `globalSetup` 함수 방식보다 우수하다 — setup 프로젝트도 일반 테스트와 동일하게 Playwright 러너 자식 프로세스 안에서 실행되므로 `scripts/run-e2e.ts`가 조립한 env 상속 경로(`design.md §3.3`의 프로세스 계보 설계 원칙)를 그대로 따른다. 이는 `playwright.config.ts`에 `globalSetup`을 두지 않기로 한 기존 설계 결정과 일관된다. 외부 리뷰어가 `--spec=<filter>` 필터와의 호환성을 공식 문서 + `1.62.1` 재현으로 확인함에 따라, 이 설계는 더 이상 "1순위 후보"가 아니라 이 SPEC의 유일한 설계다(§C M1).
- **왜 project-wide `dependencies`가 아니라 별도 project로 범위를 좁히는가**: `chromium` project 전체에 `dependencies: ["setup"]`를 걸면 대상이 아닌 7개 스펙 파일도 setup 완료를 기다리게 되어, 그 파일들의 실행 전에 불필요한 로그인 2회가 추가된다 — REQ-E2EAUTH-003(다른 파일 로그인 동작 무변경)과 직접 충돌하지는 않지만(다른 파일은 여전히 자신의 `loginAsTester()`를 호출), 새로운 rate-limit 소비를 그 파일들 앞에 강제로 끼워 넣어 §E 잔여 위험을 불필요하게 키운다. 대상 2개 파일 전용 project로 좁히면 이 영향 범위가 최소화된다.
- **왜 `storageState`를 project 레벨 기본값이 아니라 대상 파일에 필요한 project로만 격리하는가**: TESTER_A(`case-input-mobile-layout.spec.ts`)와 TESTER_B(`tenant-isolation.spec.ts`)가 서로 다른 테스터이므로, 단일 project 기본 `storageState` 값으로는 표현할 수 없다 — 대상 파일 전용 project 자체가 이 두 파일만을 실행 스코프로 가지므로, 각 파일이 자신의 `test.use({ storageState })`로 필요한 테스터를 스스로 선택한다.
- **왜 `loginAsTester()`를 재사용하지 않고 5줄을 복제하는가**: `helpers.ts`가 PRESERVE 대상(REQ-E2EAUTH-004)이라는 제약 자체는 재사용을 막지 않는다(읽기 전용 import는 허용) — 그러나 `auth.setup.ts`가 `loginAsTester()`의 내부 구현(예: testid 이름)에 결합되면, 향후 `helpers.ts`가 변경될 때 이 setup 파일도 암묵적으로 영향을 받는 결합이 생긴다. 사용자 지시("독립적인 duplication이 허용됨")에 따라 명시적으로 분리한다.
- **`.tmp/` 커밋 방지**: `.gitignore`의 기존 `*.tmp` 글롭 패턴이 이미 `.tmp/` 디렉터리 전체(디렉터리명 `.tmp`가 `*.tmp` 패턴과 일치)를 커버함을 `git check-ignore -v .tmp/storageState-tester-a.json` 실측으로 확인했다(plan-phase 조사, 아래 결과 참고) — 신규 gitignore 항목 추가는 불필요하며, M6에서 재확인만 수행한다.

  ```
  $ git check-ignore -v .tmp/storageState-tester-a.json
  .gitignore:108:*.tmp	.tmp/storageState-tester-a.json
  ```

- **Better Auth 엔드포인트 실측 근거(신규 v0.1.2)**: `node_modules/better-auth@1.7.1`의 소스를 직접 확인한 결과 — 이메일 로그인은 `createAuthEndpoint("/sign-in/email", ...)`(`dist/api/routes/sign-in.mjs`), 세션 조회는 `createAuthEndpoint("/get-session", ...)`(`dist/api/routes/session.mjs`, 응답 스키마 `{ session, user }`). `lib/auth/config.ts`에 `basePath`/`rateLimit` 커스터마이즈가 없음을 확인했으므로 두 엔드포인트 모두 기본 마운트 경로 `/api/auth`(`app/api/auth/[...all]/route.ts`) 하위에 그대로 노출된다. 이 경로들은 M3(네트워크 요청 카운팅)와 M6(storageState 계정 검증)의 검증 메커니즘이 직접 의존하는 사실이다.
- **lint/format 베이스라인 실측 근거(신규 v0.1.2)**: plan-phase에 `pnpm lint`(exit 0, 위반 0건)와 `pnpm format:check`(exit 1, 정확히 3건 — `app/globals.css`, `CHANGELOG.md`, `docs/evidence/SPEC-UI-MIGRATION-001/comparison-login.html`)를 `$SPEC_START_SHA` 이후 최신 커밋(`d29fce9`, 이 SPEC의 plan-phase 커밋 — 코드 변경 없음이므로 `$SPEC_START_SHA`와 동일한 코드 상태)에서 직접 실행해 확인했다. 이 3건은 모두 이번 SPEC의 변경 대상 파일 밖에 있다.

  ```
  $ pnpm run format:check
  Checking formatting...
  [warn] app/globals.css
  [warn] CHANGELOG.md
  [warn] docs/evidence/SPEC-UI-MIGRATION-001/comparison-login.html
  [warn] Code style issues found in 3 files. Run Prettier with --write to fix.
  ```

## §E. 위험 (Risks)

| 위험 | 영향 | 대응 |
|------|------|------|
| setup 프로젝트의 2회 로그인이 인접 스펙 파일과 rate-limit 충돌 유발 | 전체 스위트의 새로운 flaky 지점 생성 | `spec.md` §5에 명시된 기존 `retries: 2` 안전망으로 흡수 — AC-E2EAUTH-004로 회귀 없음을 실행 확인 |
| `storageState` 파일 생성 실패 시 대상 스펙이 원인 불명 오류로 실패 | 디버깅 시간 증가 | Playwright의 기본 파일-부재 오류가 이미 명확함 — 별도 방어 로직 추가는 범위 밖(YAGNI) |
| 두 대상 파일의 `test.use({ storageState })` 적용 후 CJS 번들 시 leaf 모듈 import 실패 | REQ-E2EAUTH-010 위반, 빌드 전체 실패 | M2에서 leaf 모듈을 `scripts/e2e-tester-emails.ts`와 동일한 규율로 작성 + M6에서 실제 `pnpm test:e2e` 실행으로 확인 |
| `GET /api/auth/get-session` 응답 스키마가 향후 Better Auth 버전 업그레이드로 바뀔 가능성 | AC-E2EAUTH-015a/015b의 계정 검증 로직이 깨질 수 있음 | 현재 설치본(`1.7.1`) 소스로 직접 확인한 스키마를 사용하며, 버전 업그레이드 시 재검증이 필요함을 `acceptance.md` §D에 명시 |
| `sed`를 이용한 `webServer` 블록 추출(AC-E2EAUTH-007)이 `playwright.config.ts`의 들여쓰기/구조 변경에 취약함 | 향후 파일 구조가 바뀌면 추출 실패로 오탐(false negative) 가능 | 현재 파일 구조 기준으로 작성된 구체적 검증 명령이며, 구조가 바뀌면 명령도 함께 갱신해야 함을 명시(이 SPEC 범위에서는 M4가 `webServer` 블록 자체를 건드리지 않으므로 구조 변경 없음) |

## §F. MX 태그 계획

- `e2e/auth.setup.ts`의 로그인+저장+네트워크 카운팅 로직: fan-in이 낮으므로(Playwright 런타임이 project-dependency를 통해 암묵적으로 실행 — 직접 호출자 없음) `@MX:ANCHOR` 요건(호출자 3개 이상)에 해당하지 않는다. 향후 유지보수자를 위한 `@MX:NOTE`(context)만 추가한다 — "이 파일은 `playwright.config.ts`의 `setup` project에 의해서만 실행되며, 개별 `pnpm exec playwright test auth.setup` 직접 실행도 가능하지만 CI/로컬 표준 경로는 `pnpm test:e2e`뿐. `/api/auth/sign-in/email` 네트워크 카운팅은 REQ-E2EAUTH-001의 '테스터당 1회' 요구를 실제 요청 수로 증명하기 위함" 설명.
- `e2e/storage-state-paths.ts`: `scripts/e2e-tester-emails.ts`와 동일한 leaf-module 제약(REQ-E2EAUTH-010 근거)을 `@MX:REASON` 서브라인으로 명시.
- 신규 위험 패턴(goroutine 상당/복잡도 15 이상)이 없으므로 `@MX:WARN`은 해당 없음.

## §G. Anti-Patterns (이번 SPEC에서 금지)

- `e2e/helpers.ts`를 조금이라도 수정하는 것 — 새 로직은 항상 새 파일에만 추가
- `chromium` project 전체에 `dependencies: ["setup"]`를 거는 것 — 대상 외 7개 파일 앞에 불필요한 로그인을 끼워 넣음
- `storageState` JSON 파일을 커밋하거나 `.gitignore` 예외 처리로 추적 대상화하는 것
- 대상 2개 파일 외의 어떤 `e2e/*.spec.ts`의 로그인 방식도 함께 "정리"하려는 시도(드라이브-바이 리팩터 금지)
- `playwright.config.ts`의 `workers`/`retries`/`webServer`를 "이왕 손대는 김에" 조정하는 것
- Better Auth의 rate limit 설정을 완화하는 프로덕션 코드 변경으로 우회하는 것
- **(신규 v0.1.2)** 이미 해소된 `--spec` 필터 호환성 불확실성을 이유로 `test.beforeAll` 기반 지연 생성 fallback을 다시 도입하는 것 — §C M1에서 명시적으로 삭제된 설계다
- **(신규 v0.1.2)** `capture-evidence.spec.ts`/`capture-evidence-round5.spec.ts`의 EXPECTED-SKIP 상태를 기본 실행 AC(AC-E2EAUTH-004)의 "통과" 판정과 혼동하거나, `CAPTURE_EVIDENCE=1` 활성 실행 결과를 기본 실행 AC에 섞어 넣는 것
- **(신규 v0.1.2)** storageState 재생성 검증 증거(로그·리포트)에 쿠키 값·세션 토큰·평문 비밀번호를 원문으로 기록하는 것 — 해시·mtime·계정 이메일 비교 결과 등 구조적 사실만 기록한다

## §H. Cross-References

- `.moai/specs/SPEC-RUNTIME-001/design.md` §3.3, §3.4 — 프로세스 계보 및 env 상속 설계(이 SPEC이 보존해야 하는 전제)
- `.moai/specs/SPEC-PILOT-VISUAL-001/`, `.moai/specs/SPEC-PILOT-UX-001/` — 대상 2개 스펙 파일의 기원
- Playwright 공식 문서 — Authentication (project dependencies 기반 setup project 레시피, `--spec` 필터와의 호환성 포함)
- `node_modules/better-auth/dist/api/routes/{sign-in,session}.mjs` — `/sign-in/email`, `/get-session` 엔드포인트 실측 소스(설치본 `1.7.1`)
