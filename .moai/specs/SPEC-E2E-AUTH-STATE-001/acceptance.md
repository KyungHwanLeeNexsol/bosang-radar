# Acceptance Criteria — SPEC-E2E-AUTH-STATE-001

모든 AC는 Given-When-Then 형식으로 이진(binary) 검증 가능하게 작성한다. 각 AC는 검증 대상 요구사항(REQ-E2EAUTH-XXX)을 **Traces** 라인으로 명시적으로 추적한다. AC 개수: 15개(AC-E2EAUTH-015는 a/b 두 하위 시나리오를 갖는 하나의 논리적 AC — Tier M 상한 16개 이내). REQ 10개 전체가 최소 1개의 AC에 의해 추적된다(§C 추적 매트릭스 참고).

> **개정 v0.1.2 (external reviewer 심층 기술 리뷰 대응)**: (1) AC-005/007/009/011/012의 "무변경" 검증을 인자 없는 `git diff`(작업 트리 대 HEAD 비교 — 이미 커밋된 변경은 빈 결과로 나타나 거짓 PASS를 만드는 결함)에서 `$SPEC_START_SHA` vs `$IMPL_COMPLETE_HEAD` 커밋 diff + `git status --short` 작업 트리 확인 2단계로 교체(§A.0). (2) AC-003을 setup 단계 자신까지 포함하는 3항목 × 5회 세분화 기록으로 확장 — setup의 재시도-후-통과를 "flakiness 해소" PASS로 오인정하지 않도록 명시. (3) AC-006을 유지하고 AC-E2EAUTH-015a/015b(leftover storageState 재생성 실측)를 신설 — "유효한 JSON + gitignore 커버리지"만으로는 재생성을 증명하지 못함을 반영. (4) AC-E2EAUTH-013(scripts/ 무변경), AC-E2EAUTH-014(`/sign-in` 네트워크 요청 횟수 검증)를 신설. (5) AC-004에 capture-evidence 2개 파일의 EXPECTED-SKIP 상태를 명시. (6) AC-007에 `webServer` 블록 무변경의 블록 단위 diff 검증을 추가.
>
> **개정 v0.1.3 (외부 구현 검토 누락 보완, HEAD `e97dac2` 대상)**: (1) AC-E2EAUTH-014를 실제 구현(`page.on("request", ...)`을 로그인 트리거 **이전**에 등록 — 실패 요청도 계수)에 맞춰 정정. 이전 문구(`page.on("requestfinished", ...)`)는 구현과 어긋나 있었다. (2) AC-E2EAUTH-015a/015b를 재구성 — 계정 검증이 더 이상 이 AC 전용의 별도 실행 절차가 아니라 `e2e/auth.setup.ts`에 영구히 심어진 상시 코드(저장 직후 새 컨텍스트로 `GET /api/auth/get-session` 호출 + `user.email` 단언)임을 반영. leftover 재실행 절차는 해시·mtime 변경만 별도로 측정하고, 계정 일치는 그 재실행이 (재시도를 포함해) 최종적으로 exit 0에 도달했다는 사실이 증거다. 해시·mtime 비교 절차 자체는 변경 없이 유지.
>
> **개정 v0.1.4 (외부 구현 검토 2차 누락 보완, HEAD `009dd0e` 대상, sync-phase)**: (1) `plan.md` M3(3)의 코드 예제가 여전히 `requestfinished`를 쓰고 있던 것을 실제 구현(`request`, 로그인 트리거 이전 등록)에 맞춰 정정 — AC-E2EAUTH-014 본문은 이미 v0.1.3에서 정정되어 있었으나 plan.md 코드 예제가 정정 대상에서 누락되어 있었다. (2) **[HARD] `retries: 2` 정합성 정정**: v0.1.3이 AC-E2EAUTH-015a/015b에 남긴 "setup 내장 단언이 실패하면 exit 0에 도달할 수 없다"는 표현은 `playwright.config.ts`의 `retries: 2`와 맞지 않는다 — 단언이 **첫 시도에서** 실패해도 재시도가 성공하면 그 실행은 여전히 exit 0으로 종료한다. 아래 AC-E2EAUTH-015a/015b 본문을 "exit 0(최종, 재시도 포함)은 그 실행에서 계정 검증이 **결국** 통과했다는 근거이며, **최초 시도부터** 문제가 없었다는 근거가 아니다 — 최초 시도(무재시도) 여부는 reporter의 재시도 표시로 별도 확인한다"로 정정한다. (3) DoD·spec.md·progress.md를 이번 sync-phase 재검증 결과에 맞춰 동기화하고, `case-flow.spec.ts`의 5회 연속 retry와 사전 존재하던 format 위반 3건을 명시적으로 기록한다(전체 스위트가 무재시도로 통과했다는 뜻으로 오독되지 않도록, 무재시도는 항상 setup A/B + 대상 2개 파일 3항목에 한정됨을 재확인).

## §A.0 검증 기준선(baseline) 표기법

- `$SPEC_START_SHA` = `1d480eaac2e0b53e0a5f0080baf14a596f09f533`(이 SPEC 작업 시작 직전 main HEAD)
- `$IMPL_COMPLETE_HEAD` = run-phase 구현이 커밋된 시점의 HEAD SHA(`git rev-parse HEAD`로 그때그때 확정)
- 이하 "무변경(커밋 기준)"이라 표기된 모든 AC는 다음 2개 명령 모두가 빈 출력이어야 PASS다:
  1. `git diff --stat "$SPEC_START_SHA" "$IMPL_COMPLETE_HEAD" -- <path>` (커밋된 변경 비교)
  2. `git status --short -- <path>` (스테이지/미스테이지/미추적 잔여 변경 확인)
- **[HARD]** 인자 없는 `git diff --stat -- <path>`만으로 판정하는 것은 금지한다 — 그 형태는 작업 트리를 HEAD/인덱스와만 비교하므로, 이미 커밋된 변경은 빈 결과로 나타나 거짓 PASS를 만든다.

## §A. AC 매트릭스

### AC-E2EAUTH-001 — setup 프로젝트의 storageState 생성
**Traces**: REQ-E2EAUTH-001
- **Given** 클린 트리(DB 초기화 직후)에서 `pnpm test:e2e`를 실행할 때
- **When** Playwright 실행이 `setup` 프로젝트를 통해 TESTER_A/TESTER_B 로그인을 수행하면
- **Then** `.tmp/storageState-tester-a.json`과 `.tmp/storageState-tester-b.json` 두 파일이 존재하고, 각각 유효한 Playwright storageState 형식(`cookies`, `origins` 키를 포함하는 JSON)이며, 해당 테스터의 인증 세션 쿠키를 담고 있다.

### AC-E2EAUTH-002 — 대상 스펙 파일이 loginAsTester 없이 인증된 세션으로 시작
**Traces**: REQ-E2EAUTH-002, REQ-E2EAUTH-008
- **Given** AC-E2EAUTH-001이 성공한 상태에서
- **When** `e2e/case-input-mobile-layout.spec.ts`와 `e2e/tenant-isolation.spec.ts`가 실행되면
- **Then** 두 파일 모두 `loginAsTester`를 import하거나 호출하지 않으며(정적 확인: `grep -n "loginAsTester" e2e/case-input-mobile-layout.spec.ts e2e/tenant-isolation.spec.ts`가 빈 결과), 각 테스트의 첫 페이지 이동이 `/login`으로 리다이렉트되지 않고 인증된 화면으로 바로 진입한다.

### AC-E2EAUTH-003 — 반복 실행 무재시도 (setup 단계 포함, flakiness 해소 증거)
**Traces**: REQ-E2EAUTH-001, REQ-E2EAUTH-002
- **Given** 클린 트리 상태에서
- **When** `pnpm test:e2e`를 5회 연속 실행하면(매 회 DB가 초기화되고 테스터가 재프로비저닝됨)
- **Then** 5회 각각에 대해, **`auth.setup.ts`(setup 단계 자신) / `case-input-mobile-layout.spec.ts` / `tenant-isolation.spec.ts`** 세 항목을 각각 독립적으로 다음 4개 상태 중 하나로 분류해 기록한 표(3항목 × 5회 = 15칸)를 증거로 첨부해야 한다 — 단일 pass/fail 집계는 인정하지 않는다:

  | 상태 | 의미 |
  |------|------|
  | 1차 시도 통과 | 재시도 표시(`(retry #1)`, `(retry #2)`) 없이 `✓` |
  | 재시도 후 통과 | 1회 이상 재시도 후 `✓` |
  | 실패 | `retries: 2` 소진 후에도 `✗` |
  | 예상된 스킵 | 대상 3항목에는 해당 없음(capture-evidence 계열은 AC-E2EAUTH-004가 별도로 다룸) — 참고용으로만 존재 |

  **[HARD] PASS 판정 기준**: 3항목(setup/`case-input-mobile-layout`/`tenant-isolation`) 모두가 5회 전부 "1차 시도 통과"여야 이 AC가 PASS다. **setup이 어느 한 회차에서라도 "재시도 후 통과"로 기록되면, 그 회차는 대상 2개 파일이 1차 시도로 통과했더라도 이 AC 전체를 FAIL로 판정한다** — setup 단계 안에 남아 있는 rate-limit 미해결 문제를 대상 파일의 성공으로 가려서는 안 되기 때문이다. 이 판정은 5회 실행 각각의 실제 리포터 출력을 관측 증거로 첨부해야 하며, 주장만으로는 PASS로 인정하지 않는다(`verification-claim-integrity.md` §1 — 관측 없는 성공 주장 금지). **재시도가 최종적으로 성공했다는 사실이 최초 실패가 무해했음을 증명하지는 않는다** — 이 AC가 setup의 재시도-후-통과조차 FAIL로 취급하는 이유다.

### AC-E2EAUTH-004 — 전체 스위트 회귀 없음 + capture-evidence 예상 스킵
**Traces**: REQ-E2EAUTH-003
- **Given** storageState 전환이 적용된 상태에서, `CAPTURE_EVIDENCE` 환경변수가 설정되지 않은 상태일 때
- **When** `pnpm test:e2e`(전체 스위트, 필터 없음)를 실행하면
- **Then** 명령이 exit 0으로 종료하고, `auth.spec.ts`·`case-flow.spec.ts`·`mobile-drawer-focus.spec.ts`·`sidebar-sticky.spec.ts`·`comparison-docs-images.spec.ts` 5개 파일은 모두 통과하며(기존과 동일하게 `retries: 2` 안전망 사용은 허용 — 이 AC는 "무재시도"가 아니라 "통과"만을 요구한다), `capture-evidence.spec.ts`와 `capture-evidence-round5.spec.ts` 2개 파일은 각 파일의 `test.skip(!process.env.CAPTURE_EVIDENCE, ...)` 가드(실측 확인 — `capture-evidence.spec.ts` 56번째 줄, `capture-evidence-round5.spec.ts` 52번째 줄)로 인해 **EXPECTED-SKIP**으로 리포터에 나타난다 — "통과"가 아니라 "스킵"이 이 두 파일의 기대 결과이며, 스킵이 아닌 실행·실패로 나타나면 FAIL이다.
- **비고**: `CAPTURE_EVIDENCE=1`로 이 두 파일을 실제 활성화해 검증하는 것은 별도의 실행 조건(`CAPTURE_EVIDENCE=1 pnpm test:e2e -- --spec=e2e/capture-evidence.spec.ts` 등)이며, 이 AC(기본 실행)에 섞지 않는다. 이 SPEC은 그 별도 실행 조건에 대한 검증 의무를 지지 않는다(`spec.md` §4 Out of Scope).

### AC-E2EAUTH-005 — `e2e/helpers.ts` 무변경(커밋 기준)
**Traces**: REQ-E2EAUTH-004
- **Given** `$SPEC_START_SHA`와 `$IMPL_COMPLETE_HEAD`(§A.0)가 있을 때
- **When** `git diff --stat "$SPEC_START_SHA" "$IMPL_COMPLETE_HEAD" -- e2e/helpers.ts`와 `git status --short -- e2e/helpers.ts`를 실행하면
- **Then** 두 명령 모두 출력이 완전히 비어 있다.

### AC-E2EAUTH-006 — storageState 미커밋 + gitignore 커버리지
**Traces**: REQ-E2EAUTH-006
- **Given** `pnpm test:e2e` 실행 직후 `.tmp/storageState-tester-a.json`·`.tmp/storageState-tester-b.json`이 디스크에 존재할 때
- **When** `git status --porcelain -- .tmp/`와 `git check-ignore -v .tmp/storageState-tester-a.json .tmp/storageState-tester-b.json`을 실행하면
- **Then** `git status --porcelain`에 두 파일이 추적 대상으로 나타나지 않으며, `git check-ignore -v`가 두 파일 모두에 대해 매칭되는 gitignore 규칙(`*.tmp`)을 exit 0으로 보고한다. 또한 `git log --stat "$SPEC_START_SHA"..`(SPEC 구현 커밋 이력) 어디에도 `storageState-*.json`가 추가된 적이 없다.
- **[HARD] 범위 제약**: 이 AC는 "커밋되지 않고 gitignore로 잡힌다"만을 증명한다 — "매 실행마다 실제로 새로 생성된다"(재생성)는 이 AC의 증명 대상이 아니다. 유효한 JSON 형식과 gitignore 커버리지만으로 재생성을 주장하는 것은 금지한다. 재생성 자체의 실측 증명은 AC-E2EAUTH-015a/015b가 담당한다.

### AC-E2EAUTH-007 — 기존 안전망 무변경(커밋 기준, `webServer` 블록 포함)
**Traces**: REQ-E2EAUTH-005
- **Given** `$SPEC_START_SHA`와 `$IMPL_COMPLETE_HEAD`가 있을 때
- **When** 다음 4개 명령을 실행하면:
  1. `git diff --stat "$SPEC_START_SHA" "$IMPL_COMPLETE_HEAD" -- e2e/mobile-drawer-focus.spec.ts` + `git status --short -- e2e/mobile-drawer-focus.spec.ts`
  2. `grep -c "retries: 2" playwright.config.ts`
  3. `grep -c "workers: 1" playwright.config.ts`
  4. `diff <(git show "$SPEC_START_SHA:playwright.config.ts" | sed -n '/^  webServer: {/,/^  },$/p') <(git show "$IMPL_COMPLETE_HEAD:playwright.config.ts" | sed -n '/^  webServer: {/,/^  },$/p')`
- **Then** (1)의 두 명령이 모두 빈 출력, (2)와 (3)이 각각 정확히 `1`, (4)의 `diff`가 빈 출력(exit 0)이다 — `webServer` 블록이 `$SPEC_START_SHA`와 `$IMPL_COMPLETE_HEAD` 사이에서 한 글자도 바뀌지 않았음을 블록 단위로 직접 증명한다(목측 대조가 아닌 기계적 확인).
- **잔여 위험**: (4)의 `sed` 추출은 현재 `playwright.config.ts`의 들여쓰기/구조에 맞춰져 있다 — 이 SPEC의 구현이 `webServer` 블록 자체를 건드리지 않으므로 구조 변경은 없을 것으로 예상되나, 향후 이 파일 구조가 바뀌면 추출 명령도 함께 갱신해야 한다(`plan.md` §E).

### AC-E2EAUTH-008 — `--spec` 필터링 시에도 setup 의존성 실행(실제 진입점)
**Traces**: REQ-E2EAUTH-007
- **Given** `pnpm test:e2e -- --spec=tenant-isolation`처럼 대상 파일 중 하나만 선택하는 필터를 사용할 때(project-dependency가 이 SPEC의 유일한 base 설계이며, `--spec` 필터와의 호환성은 외부 리뷰어가 Playwright 공식 문서 + `1.62.1` 재현으로 이미 확인함 — `plan.md` §C M1)
- **When** 실제 진입점(`scripts/run-e2e.ts`)을 통한 필터링된 Playwright 실행이 수행되면
- **Then** `tenant-isolation.spec.ts`가 여전히 인증된 세션으로 성공적으로 실행되며(로그인 실패나 storageState 파일 부재 오류가 발생하지 않음), 명령이 exit 0으로 종료한다 — 이것이 `scripts/run-e2e.ts`가 조립하는 env가 setup 프로젝트에도 정상 상속됨을 실제 진입점을 통해 확인하는 지점이다(`plan.md` §C M1이 위임한 확인 항목).

### AC-E2EAUTH-009 — 프로덕션/애플리케이션 코드 무변경(커밋 기준)
**Traces**: REQ-E2EAUTH-009
- **Given** `$SPEC_START_SHA`와 `$IMPL_COMPLETE_HEAD`가 있을 때
- **When** `git diff --stat "$SPEC_START_SHA" "$IMPL_COMPLETE_HEAD" -- . ':!e2e' ':!playwright.config.ts' ':!scripts' ':!.moai'`와 `git status --short -- . ':!e2e' ':!playwright.config.ts' ':!scripts' ':!.moai'`를 실행하면
- **Then** 두 명령 모두 출력이 완전히 비어 있다 — `e2e/`, `playwright.config.ts`, `scripts/`, `.moai/`(SPEC 아티팩트 자신) 외부에는 어떤 변경도 없다. **참고**: 이 AC의 pathspec은 `scripts/`를 diff 대상에서 제외한다 — `scripts/` 디렉터리 자체의 무변경은 AC-E2EAUTH-013이 별도로 검증한다(이 AC의 제외 범위가 곧 "무변경 확인 없음"을 의미하지 않도록 분리).

### AC-E2EAUTH-010 — 경로 상수 leaf 모듈 규율 준수
**Traces**: REQ-E2EAUTH-010
- **Given** 신규 leaf 모듈(예: `e2e/storage-state-paths.ts`)이 있을 때
- **When** 그 파일과 그 파일이 import하는 모든 모듈을 검사하면(`grep -n "import.meta" e2e/storage-state-paths.ts`)
- **Then** `import.meta`를 직접적으로도 간접적으로도 사용하지 않으며, `pnpm test:e2e`가 이 모듈을 import하는 두 대상 스펙 파일 및 `e2e/auth.setup.ts`를 포함해 CJS 번들 오류(`SyntaxError: Cannot use 'import.meta' outside a module`) 없이 정상 실행된다.

### AC-E2EAUTH-011 — `e2e/auth.spec.ts` 전환 대상 제외 확인(커밋 기준)
**Traces**: REQ-E2EAUTH-003 (제외 근거)
- **Given** `e2e/auth.spec.ts`가 로그인 성공/실패 메커니즘 자체를 검증하는 스펙이고, `$SPEC_START_SHA`와 `$IMPL_COMPLETE_HEAD`가 있을 때
- **When** `git diff --stat "$SPEC_START_SHA" "$IMPL_COMPLETE_HEAD" -- e2e/auth.spec.ts`와 `git status --short -- e2e/auth.spec.ts`를 실행하면
- **Then** 두 명령 모두 출력이 완전히 비어 있다 — `e2e/auth.spec.ts`는 어떤 형태로도 사전 인증 storageState 전제조건으로 전환되지 않으며, 여전히 `loginAsTester()`를 통한 실제 UI 로그인 흐름을 그대로 검증한다.

### AC-E2EAUTH-012 — 나머지 5개 out-of-scope 스펙 파일 소스 무변경(커밋 기준)
**Traces**: REQ-E2EAUTH-003
- **Given** `$SPEC_START_SHA`와 `$IMPL_COMPLETE_HEAD`가 있을 때
- **When** `git diff --stat "$SPEC_START_SHA" "$IMPL_COMPLETE_HEAD" -- e2e/case-flow.spec.ts e2e/sidebar-sticky.spec.ts e2e/capture-evidence.spec.ts e2e/capture-evidence-round5.spec.ts e2e/comparison-docs-images.spec.ts`와 `git status --short -- e2e/case-flow.spec.ts e2e/sidebar-sticky.spec.ts e2e/capture-evidence.spec.ts e2e/capture-evidence-round5.spec.ts e2e/comparison-docs-images.spec.ts`를 실행하면
- **Then** 두 명령 모두 출력이 완전히 비어 있다 — AC-E2EAUTH-004("여전히 통과/스킵한다"는 동작 수준 확인)와 별개로, 이 AC는 5개 파일 각각의 소스 자체가 한 글자도 변경되지 않았음을 커밋 기준으로 직접 확인한다.

### AC-E2EAUTH-013 — `scripts/` 디렉터리 전체 무변경(커밋 기준, PRESERVE 정합)
**Traces**: REQ-E2EAUTH-009 (PRESERVE 목록 정합)
- **Given** `plan.md` §A.2가 `scripts/run-e2e.ts`·`scripts/e2e-tester-emails.ts`·`scripts/provision-tester.ts`를 포함해 `scripts/` 디렉터리 전체를 PRESERVE 대상으로 선언하고, AC-E2EAUTH-009의 diff pathspec이 `scripts/`를 제외 대상으로 두어 그 디렉터리 자체의 무변경을 별도로 검증하지 않는 갭이 있을 때
- **When** `git diff --stat "$SPEC_START_SHA" "$IMPL_COMPLETE_HEAD" -- scripts/`와 `git status --short -- scripts/`를 실행하면
- **Then** 두 명령 모두 출력이 완전히 비어 있다 — 이번 SPEC의 어떤 구현도 `scripts/` 디렉터리 안의 어떤 파일도 만들거나 수정하지 않는다.

### AC-E2EAUTH-014 — `/sign-in` 네트워크 요청 횟수 검증(테스터당 정확히 1회)
**Traces**: REQ-E2EAUTH-001 (정밀화)
- **Given** `e2e/auth.setup.ts`가 TESTER_A/TESTER_B 각각에 대해 독립된 `test()` 블록(또는 독립된 브라우저 컨텍스트)에서 로그인을 수행하고, 이 프로젝트의 Better Auth 설치본(`1.7.1`)이 이메일 로그인을 정확히 `POST /api/auth/sign-in/email`로 노출함(`node_modules/better-auth/dist/api/routes/sign-in.mjs`, `basePath`/`rateLimit` 커스터마이즈 없음 — `lib/auth/config.ts` 실측 확인)이 확인되었을 때
- **When** 각 테스터의 로그인 블록이 **로그인을 트리거하기 전에**(`page.goto("/login")` 호출 이전에) `page.on("request", ...)`(**[개정 v0.1.3]** `requestfinished`가 아니라 `request` — 실패·네트워크 오류로 끝난 요청도 놓치지 않기 위함)로 `POST` 메서드이면서 URL pathname이 정확히 `/api/auth/sign-in/email`인 요청 수를 계수하면
- **Then** TESTER_A 블록과 TESTER_B 블록 각각에서 그 계수(`signInHits`)가 정확히 `1`이다 — UI 리다이렉트 성공 여부가 아니라 실제 네트워크 요청 수로 "테스터당 로그인 1회"를 직접 증명한다. 이 카운트는 정수이며 쿠키·토큰을 포함하지 않으므로 검증 증거로 그대로 로그에 남겨도 안전하다.

### AC-E2EAUTH-015a — storageState 재생성 실측: leftover 파일 + 전체 스위트
**Traces**: REQ-E2EAUTH-006 (재생성 실측 증명)

**[개정 v0.1.3]** 계정 검증(과거: 이 AC 전용의 별도 실행 절차로 `GET /api/auth/get-session`을 호출)은 더 이상 이 AC만을 위한 임시 절차가 아니다 — `e2e/auth.setup.ts`가 storageState 저장 직후 새 브라우저 컨텍스트로 그 파일을 로드해 동일한 `GET /api/auth/get-session` 호출과 `user.email` 단언을 **매 실행마다 상시** 수행하도록 영구 코드로 구현되어 있다(`plan.md` §C M3(3)). 따라서 이 AC의 증명 대상은 (1) 재생성(해시·mtime 변경)과 (2) setup 내장 계정 검증이 2차(leftover) 실행에서도 (최종적으로) 통과했다는 사실 두 가지로 재구성된다.

**[개정 v0.1.4 — `retries: 2` 정합성 정정]** exit 0은 **최종** 결과(재시도 포함)가 통과였다는 근거다 — `playwright.config.ts`의 `retries: 2`로 인해, setup의 `expect(body.user?.email).toBe(email)`이 첫 시도에서 실패해도 재시도가 성공하면 그 실행은 여전히 exit 0으로 끝난다. 따라서 "exit 0 = 한 번도 실패하지 않았다"는 뜻이 아니다. 다만 계정 교차오염처럼 **결정론적으로 재현되는** 오류는 재시도해도 같은 이메일이 나오므로, `retries: 2`를 모두 소진한 뒤에도 실패가 남으면 exit 0에 도달하지 못한다 — 즉 exit 0(최종)은 "이 실행에서 계정 검증이 **결국** 통과했다"는 근거이고, "**최초 시도부터** 문제가 없었다"는 근거는 별도다. **최초 시도(무재시도) 여부는 reporter의 재시도 표시(`(retry #N)` 유무)로 setup A/B·대상 테스트 각각에 대해 독립적으로 확인한다** — AC-E2EAUTH-003이 이 확인을 전담하며, 이 AC(015a)는 재생성·계정 검증의 **최종** 성공 여부만을 증명 대상으로 한다.

- **Given** `pnpm test:e2e` 1차 실행 직후 `.tmp/storageState-tester-{a,b}.json`의 SHA-256 해시(`sha256sum`)와 mtime(`stat`)을 기록해 두었고(파일 원문 내용은 어떤 로그에도 남기지 않음), 그 파일들을 삭제하지 않은 채(leftover 상태) `pnpm test:e2e`를 2차 실행할 때(DB 초기화 + 테스터 재프로비저닝이 자동 발생 — 이 2차 실행의 `setup` project가 `auth.setup.ts`의 상시 계정 검증을 다시 수행한다)
- **When** 2차 실행이 (재시도를 포함해) 최종적으로 exit 0으로 종료한 직후 같은 두 파일의 SHA-256 해시와 mtime을 재측정하면
- **Then** (1) 2차 실행이 최종적으로 exit 0으로 종료했다(= setup 내장 `GET /api/auth/get-session` + `user.email` 단언이 TESTER_A/TESTER_B 양쪽 모두 최종적으로 통과했다는 증거 — 교차 오염처럼 결정론적인 오류라면 재시도로도 가려지지 않으므로 여전히 유효한 증거다), (2) 2차 실행 후 mtime이 1차보다 최신이고, (3) SHA-256 해시가 1차와 다르다(leftover 파일이 실제로 덮어써졌음을 증명 — "유효한 JSON"만으로는 부족). **증거 기록 제약**: 해시값·mtime·exit code(및 최초 시도 여부를 밝힐 때는 reporter의 재시도 표시)만 로그에 남기며, 세션 쿠키 원문·응답 전체 바디·비밀번호는 어떤 증거 파일에도 기록하지 않는다.

### AC-E2EAUTH-015b — storageState 재생성 실측: leftover 파일 + `--spec` 필터 개별 실행
**Traces**: REQ-E2EAUTH-006 (재생성 실측 증명, 필터링된 실행 경로)
- **Given** AC-E2EAUTH-015a와 동일한 leftover 절차를, `pnpm test:e2e -- --spec=case-input-mobile-layout`(TESTER_A) 및 `pnpm test:e2e -- --spec=tenant-isolation`(TESTER_B) 각각의 개별 `--spec` 필터 실행에 대해 독립적으로 수행할 때(전체 스위트 실행과는 별개의 실행 경로임을 확인하기 위함 — `--spec` 필터 실행에서도 `setup` project는 project-dependency에 의해 실행되므로, 대상 project와 함께 setup의 상시 계정 검증도 함께 수행된다)
- **When** 각 필터링된 실행에서 AC-E2EAUTH-015a와 동일한 확인(exit 0[최종, 재시도 포함] = setup 내장 계정 검증 통과, mtime 갱신, 해시 변경)을 수행하면
- **Then** 두 필터 실행 각각에서 세 조건이 모두 성립한다 — 전체 스위트 경로에서만 재생성·계정 검증이 보장되고 `--spec` 필터 경로에서는 보장되지 않는 회귀가 없음을 증명한다. 증거 기록 제약은 AC-E2EAUTH-015a와 동일하다.

## §B. Definition of Done

> **[v0.1.4, sync-phase]** 아래 체크박스는 `009dd0e`(run-phase 최종 커밋) 기준 실측 증거(`progress.md` §E.2)와 대조해 갱신했다. **무재시도(1차 시도 통과)는 항상 setup A/B + 대상 2개 파일(`case-input-mobile-layout.spec.ts`/`tenant-isolation.spec.ts`) 3항목에 한정된다** — "전체 스위트가 무재시도로 통과했다"는 뜻이 아니다. `case-flow.spec.ts`는 5회 연속 실행 전부에서 1차 시도 실패 → retry #1로만 회복했다(out-of-scope, 기존 잔여 위험, `progress.md` § 잔여 부채 참고). `pnpm format:check`의 사전 위반 3건(`app/globals.css`/`CHANGELOG.md`/`docs/evidence/SPEC-UI-MIGRATION-001/comparison-login.html`)은 이 SPEC 시작 이전부터 존재했으며 이 SPEC의 정리 대상이 아니다 — 신규 위반 0건과는 별개로 명시한다.

- [x] AC-E2EAUTH-001 ~ 015(a/b 포함) 전체 PASS(`progress.md` §E.2 AC 전체 매트릭스)
- [x] `pnpm test:e2e`(전체 스위트) 5회 연속 실행 각각 exit 0(재시도 포함 최종 결과) — setup A/B·대상 2개 파일 3항목은 5회 전부 1차 시도 통과, `case-flow.spec.ts`는 5회 전부 retry #1로 회복(위 잔여 부채 고지 참고)(AC-E2EAUTH-003)
- [x] `capture-evidence.spec.ts`·`capture-evidence-round5.spec.ts`가 기본 실행 5회 전부에서 EXPECTED-SKIP(10개 테스트)으로 나타남(AC-E2EAUTH-004)
- [x] `e2e/helpers.ts` 무변경 — 커밋 diff + 작업 트리 상태 모두 빈 결과(AC-E2EAUTH-005)
- [x] `e2e/mobile-drawer-focus.spec.ts` 무변경, `workers`/`retries` grep 각각 `1`, `webServer` 블록 diff 빈 결과(AC-E2EAUTH-007)
- [x] `e2e/auth.spec.ts` 무변경 — 커밋 diff + 작업 트리 상태 모두 빈 결과(AC-E2EAUTH-011)
- [x] 나머지 5개 out-of-scope 파일 무변경 — 커밋 diff + 작업 트리 상태 모두 빈 결과(AC-E2EAUTH-012)
- [x] `scripts/` 디렉터리 전체 무변경 — 커밋 diff + 작업 트리 상태 모두 빈 결과(AC-E2EAUTH-013)
- [x] `.tmp/storageState-*.json`이 추적되지 않고 `git check-ignore -v`로 무시 규칙이 확인됨(AC-E2EAUTH-006)
- [x] `/sign-in` 네트워크 요청 횟수가 테스터당 정확히 1(AC-E2EAUTH-014) — `page.on("request", ...)`를 로그인 트리거 이전에 등록, 실패 요청도 계수
- [x] leftover storageState가 전체 스위트·`--spec` 필터 양쪽에서 실제로 재생성되고, `auth.setup.ts`의 상시 계정 검증(최종 exit 0)으로 계정 일치가 확인됨(AC-E2EAUTH-015a/015b)
- [x] `git diff --stat "$SPEC_START_SHA" "$IMPL_COMPLETE_HEAD" -- . ':!e2e' ':!playwright.config.ts' ':!scripts' ':!.moai'`와 대응 `git status --short`가 모두 빈 결과(AC-E2EAUTH-009)
- [x] `pnpm lint` exit 0(사전 위반 0건 베이스라인 대비 신규 위반 0건); `pnpm format:check` — 이 SPEC이 변경·추가한 파일에서 신규 위반 0건(사전 위반 3건은 위 고지 참고, `plan.md` §D 베이스라인 인용); `pnpm build` exit 0
- [x] spec.md §4 Out of Scope 5개 항목이 구현 범위에 포함되지 않았음을 확인

## §C. REQ ↔ AC 추적 매트릭스

| REQ | 추적 AC |
|-----|---------|
| REQ-E2EAUTH-001 | AC-E2EAUTH-001, AC-E2EAUTH-003, AC-E2EAUTH-014 |
| REQ-E2EAUTH-002 | AC-E2EAUTH-002, AC-E2EAUTH-003 |
| REQ-E2EAUTH-003 | AC-E2EAUTH-004, AC-E2EAUTH-011, AC-E2EAUTH-012 |
| REQ-E2EAUTH-004 | AC-E2EAUTH-005 |
| REQ-E2EAUTH-005 | AC-E2EAUTH-007 |
| REQ-E2EAUTH-006 | AC-E2EAUTH-006, AC-E2EAUTH-015a, AC-E2EAUTH-015b |
| REQ-E2EAUTH-007 | AC-E2EAUTH-008 |
| REQ-E2EAUTH-008 | AC-E2EAUTH-002 |
| REQ-E2EAUTH-009 | AC-E2EAUTH-009, AC-E2EAUTH-013 |
| REQ-E2EAUTH-010 | AC-E2EAUTH-010 |

## §D. 검증되지 않는 항목 (참고)

- **다른 5개 스펙 파일의 flaky 위험 정량 측정**: AC-E2EAUTH-004는 "통과/스킵 여부"만 확인하며, `capture-evidence-round5.spec.ts`(`CAPTURE_EVIDENCE=1` 활성 실행 시에만 실제 위험이 현실화됨, `spec.md` §4) 등 기존에도 잠재적으로 rate-limit에 취약할 수 있는 파일들의 flaky 발생률을 정량적으로 측정하지 않는다. `spec.md` §4 Out of Scope에 명시된 대로 이번 SPEC의 대상이 아니다.
- **CI 환경에서의 재현**: 이 SPEC의 검증은 로컬 `pnpm test:e2e` 실행을 전제로 한다. CI 파이프라인(신설되지 않음, `spec.md` §4)에서의 동일 안정성은 이 SPEC의 자동 검증 대상이 아니다.
- **Better Auth 버전 업그레이드 시 엔드포인트/응답 스키마 회귀**: AC-E2EAUTH-014(`/api/auth/sign-in/email`)와 AC-E2EAUTH-015a/015b(`/api/auth/get-session`, 응답 스키마 `{ session, user }`)는 현재 설치된 `better-auth@1.7.1` 소스 실측을 근거로 한다. 향후 Better Auth 버전이 올라가면 이 엔드포인트/스키마가 재검증 없이 계속 유효하다고 가정하지 않는다.
- **`webServer` 블록 `sed` 추출(AC-E2EAUTH-007)의 구조 의존성**: 현재 `playwright.config.ts`의 들여쓰기/블록 구조를 전제로 한 추출 명령이다. 이 SPEC의 구현이 그 블록 자체를 건드리지 않는 한 유효하나, 무관한 후속 변경이 그 구조를 바꾸면 이 검증 명령도 함께 갱신이 필요하다.
