# Acceptance Criteria — SPEC-E2E-AUTH-STATE-001

모든 AC는 Given-When-Then 형식으로 이진(binary) 검증 가능하게 작성한다. 각 AC는 검증 대상 요구사항(REQ-E2EAUTH-XXX)을 **Traces** 라인으로 명시적으로 추적한다. AC 개수: 11개 (Tier M 상한 16개 이내). REQ 10개 전체가 최소 1개의 AC에 의해 추적된다(§C 추적 매트릭스 참고).

## §A. AC 매트릭스

### AC-E2EAUTH-001 — setup 프로젝트의 storageState 생성
**Traces**: REQ-E2EAUTH-001
- **Given** 클린 트리(DB 초기화 직후)에서 `pnpm test:e2e`를 실행할 때
- **When** Playwright 실행이 `setup` 프로젝트(또는 M1 대안 채택 시 그에 상응하는 지연 생성 경로)를 통해 TESTER_A/TESTER_B 로그인을 수행하면
- **Then** `.tmp/storageState-tester-a.json`과 `.tmp/storageState-tester-b.json` 두 파일이 존재하고, 각각 유효한 Playwright storageState 형식(`cookies`, `origins` 키를 포함하는 JSON)이며, 해당 테스터의 인증 세션 쿠키를 담고 있다.

### AC-E2EAUTH-002 — 대상 스펙 파일이 loginAsTester 없이 인증된 세션으로 시작
**Traces**: REQ-E2EAUTH-002, REQ-E2EAUTH-008
- **Given** AC-E2EAUTH-001이 성공한 상태에서
- **When** `e2e/case-input-mobile-layout.spec.ts`와 `e2e/tenant-isolation.spec.ts`가 실행되면
- **Then** 두 파일 모두 `loginAsTester`를 import하거나 호출하지 않으며(정적 확인: `grep -n "loginAsTester" e2e/case-input-mobile-layout.spec.ts e2e/tenant-isolation.spec.ts`가 빈 결과), 각 테스트의 첫 페이지 이동이 `/login`으로 리다이렉트되지 않고 인증된 화면으로 바로 진입한다.

### AC-E2EAUTH-003 — 반복 실행 무재시도 (flakiness 해소 증거)
**Traces**: REQ-E2EAUTH-001, REQ-E2EAUTH-002
- **Given** 클린 트리 상태에서
- **When** `pnpm test:e2e`를 5회 연속 실행하면(매 회 DB가 초기화되고 테스터가 재프로비저닝됨)
- **Then** 5회 모두, Playwright `list` 리포터 출력에서 `case-input-mobile-layout.spec.ts`와 `tenant-isolation.spec.ts`의 결과 줄이 재시도 표시(`(retry #1)`, `(retry #2)`) 없이 1차 시도 `✓`로 나타난다. 이 판정은 5회 실행 각각의 실제 리포터 출력을 관측 증거로 첨부해야 하며, 주장만으로는 PASS로 인정하지 않는다(`verification-claim-integrity.md` §1 — 관측 없는 성공 주장 금지).

### AC-E2EAUTH-004 — 전체 스위트 회귀 없음
**Traces**: REQ-E2EAUTH-003
- **Given** storageState 전환이 적용된 상태에서
- **When** `pnpm test:e2e`(전체 스위트, 필터 없음)를 실행하면
- **Then** 명령이 exit 0으로 종료하고, `auth.spec.ts`·`case-flow.spec.ts`·`mobile-drawer-focus.spec.ts`·`sidebar-sticky.spec.ts`·`capture-evidence.spec.ts`·`capture-evidence-round5.spec.ts`·`comparison-docs-images.spec.ts` 7개 파일 모두 통과한다(기존과 동일하게 `retries: 2` 안전망을 사용하는 것은 허용 — 이 AC는 "무재시도"가 아니라 "통과"만을 요구한다).

### AC-E2EAUTH-005 — `e2e/helpers.ts` 무변경
**Traces**: REQ-E2EAUTH-004
- **Given** 이 SPEC의 구현이 완료된 작업 트리가 있을 때
- **When** `git diff --stat -- e2e/helpers.ts`를 실행하면
- **Then** 출력이 완전히 비어 있다(diff 0줄).

### AC-E2EAUTH-006 — storageState 미커밋 + gitignore 커버리지
**Traces**: REQ-E2EAUTH-006
- **Given** `pnpm test:e2e` 실행 직후 `.tmp/storageState-tester-a.json`·`.tmp/storageState-tester-b.json`이 디스크에 존재할 때
- **When** `git status --porcelain -- .tmp/`와 `git check-ignore -v .tmp/storageState-tester-a.json .tmp/storageState-tester-b.json`을 실행하면
- **Then** `git status --porcelain`에 두 파일이 추적 대상(`A`/`??` 등 스테이지되지 않은 무시 파일이 아닌 상태)으로 나타나지 않으며, `git check-ignore -v`가 두 파일 모두에 대해 매칭되는 gitignore 규칙(`*.tmp`)을 exit 0으로 보고한다. 또한 SPEC 구현 커밋 이력(`git log --stat`) 어디에도 `storageState-*.json`가 추가된 적이 없다.

### AC-E2EAUTH-007 — 기존 안전망 무변경
**Traces**: REQ-E2EAUTH-005
- **Given** 이 SPEC의 구현이 완료된 작업 트리가 있을 때
- **When** `git diff --stat -- e2e/mobile-drawer-focus.spec.ts`를 실행하고, `playwright.config.ts`의 `workers`/`retries` 라인을 목측 대조하면
- **Then** `e2e/mobile-drawer-focus.spec.ts`의 diff가 완전히 비어 있고, `playwright.config.ts`에 `workers: 1`과 `retries: 2`가 원래 값 그대로 남아 있다.

### AC-E2EAUTH-008 — `--spec` 필터링 시에도 setup 의존성 실행
**Traces**: REQ-E2EAUTH-007
- **Given** `pnpm test:e2e -- --spec=tenant-isolation`처럼 대상 파일 중 하나만 선택하는 필터를 사용할 때(M1 검증 결과 project-dependency 접근을 채택한 경우; 공유 헬퍼 대안 채택 시에는 이 AC가 "지연 생성 경로가 필터링된 실행에서도 트리거된다"는 동등한 성질로 대체됨을 `progress.md` §E.2에 기록)
- **When** 필터링된 Playwright 실행이 수행되면
- **Then** `tenant-isolation.spec.ts`가 여전히 인증된 세션으로 성공적으로 실행되며(로그인 실패나 storageState 파일 부재 오류가 발생하지 않음), 명령이 exit 0으로 종료한다.

### AC-E2EAUTH-009 — 프로덕션/애플리케이션 코드 무변경
**Traces**: REQ-E2EAUTH-009
- **Given** 이 SPEC의 구현이 완료된 작업 트리가 있을 때
- **When** `git diff --stat -- . ':!e2e' ':!playwright.config.ts' ':!scripts' ':!.moai'`를 실행하면
- **Then** 출력이 완전히 비어 있다 — `e2e/`, `playwright.config.ts`, `scripts/`, `.moai/`(SPEC 아티팩트 자신) 외부에는 어떤 변경도 없다.

### AC-E2EAUTH-010 — 경로 상수 leaf 모듈 규율 준수
**Traces**: REQ-E2EAUTH-010
- **Given** 신규 leaf 모듈(예: `e2e/storage-state-paths.ts`)이 있을 때
- **When** 그 파일과 그 파일이 import하는 모든 모듈을 검사하면(`grep -n "import.meta" e2e/storage-state-paths.ts`)
- **Then** `import.meta`를 직접적으로도 간접적으로도 사용하지 않으며, `pnpm test:e2e`가 이 모듈을 import하는 두 대상 스펙 파일 및 `e2e/auth.setup.ts`를 포함해 CJS 번들 오류(`SyntaxError: Cannot use 'import.meta' outside a module`) 없이 정상 실행된다.

### AC-E2EAUTH-011 — `e2e/auth.spec.ts` 전환 대상 제외 확인
**Traces**: REQ-E2EAUTH-003 (제외 근거)
- **Given** `e2e/auth.spec.ts`가 로그인 성공/실패 메커니즘 자체를 검증하는 스펙일 때
- **When** 이 SPEC의 구현 범위를 점검하면
- **Then** `e2e/auth.spec.ts`는 어떤 형태로도 사전 인증 storageState 전제조건으로 전환되지 않으며(`git diff --stat -- e2e/auth.spec.ts`가 빈 결과), 여전히 `loginAsTester()`를 통한 실제 UI 로그인 흐름을 그대로 검증한다.

## §B. Definition of Done

- [ ] AC-E2EAUTH-001 ~ 011 전체 PASS
- [ ] `pnpm test:e2e`(전체 스위트) exit 0 — 5회 연속 실행 각각의 리포터 출력이 증거로 기록됨(AC-E2EAUTH-003)
- [ ] `git diff --stat -- e2e/helpers.ts`가 빈 결과 (AC-E2EAUTH-005)
- [ ] `git diff --stat -- e2e/mobile-drawer-focus.spec.ts`가 빈 결과, `playwright.config.ts`의 `workers`/`retries` 무변경 (AC-E2EAUTH-007)
- [ ] `git diff --stat -- e2e/auth.spec.ts`가 빈 결과 (AC-E2EAUTH-011)
- [ ] `.tmp/storageState-*.json`이 추적되지 않고 `git check-ignore -v`로 무시 규칙이 확인됨 (AC-E2EAUTH-006)
- [ ] `git diff --stat -- . ':!e2e' ':!playwright.config.ts' ':!scripts' ':!.moai'`가 빈 결과 (AC-E2EAUTH-009)
- [ ] `pnpm lint`, `pnpm build`, `pnpm format:check`가 이 변경 이후에도 계속 exit 0
- [ ] spec.md §4 Out of Scope 5개 항목이 구현 범위에 포함되지 않았음을 확인

## §C. REQ ↔ AC 추적 매트릭스

| REQ | 추적 AC |
|-----|---------|
| REQ-E2EAUTH-001 | AC-E2EAUTH-001, AC-E2EAUTH-003 |
| REQ-E2EAUTH-002 | AC-E2EAUTH-002, AC-E2EAUTH-003 |
| REQ-E2EAUTH-003 | AC-E2EAUTH-004, AC-E2EAUTH-011 |
| REQ-E2EAUTH-004 | AC-E2EAUTH-005 |
| REQ-E2EAUTH-005 | AC-E2EAUTH-007 |
| REQ-E2EAUTH-006 | AC-E2EAUTH-006 |
| REQ-E2EAUTH-007 | AC-E2EAUTH-008 |
| REQ-E2EAUTH-008 | AC-E2EAUTH-002 |
| REQ-E2EAUTH-009 | AC-E2EAUTH-009 |
| REQ-E2EAUTH-010 | AC-E2EAUTH-010 |

## §D. 검증되지 않는 항목 (참고)

- **다른 7개 스펙 파일의 flaky 위험 정량 측정**: AC-E2EAUTH-004는 "통과 여부"만 확인하며, `capture-evidence-round5.spec.ts` 등 기존에도 잠재적으로 rate-limit에 취약할 수 있는 파일들의 flaky 발생률을 정량적으로 측정하지 않는다. `spec.md` §4 Out of Scope에 명시된 대로 이번 SPEC의 대상이 아니다.
- **CI 환경에서의 재현**: 이 SPEC의 검증은 로컬 `pnpm test:e2e` 실행을 전제로 한다. CI 파이프라인(신설되지 않음, `spec.md` §4)에서의 동일 안정성은 이 SPEC의 자동 검증 대상이 아니다.
- **Playwright 버전 업그레이드 시의 회귀**: AC-E2EAUTH-008(project-dependency × `--spec` 필터 상호작용)의 판정은 현재 설치된 `@playwright/test@1.62.1` 기준이다. 향후 Playwright 버전이 올라가면 이 상호작용이 재검증 없이 계속 유효하다고 가정하지 않는다.
