# Plan — SPEC-E2E-AUTH-STATE-001

## §A. Context

- **프로젝트 상태**: 브라운필드. SPEC-RUNTIME-001(status: completed)이 구축한 E2E 하네스(`scripts/run-e2e.ts` 단일 진입점, `playwright.config.ts`, `e2e/helpers.ts`) 위에 순수 테스트 인프라 개선만 추가한다.
- **작업 위치**: `C:/Users/Nexsol/Documents/bosang-radar` (main checkout).
- **Tier**: M (3개 아티팩트 + progress.md). 판단 근거는 §A.1.
- **라우트**: `.moai/config/sections/git-strategy.yaml`의 `git_strategy.mode: manual` + 기존 세션 관례(`plan/SPEC-PILOT-UX-001`, `plan/SPEC-FEEDBACK-001`)에 따라 `plan/SPEC-E2E-AUTH-STATE-001` 브랜치 + PR 라우트를 따른다. `manual.push_to_remote: false`이므로 plan-phase에서는 로컬 커밋까지만 수행한다.
- **개발 방법론**: TDD (`.moai/config/sections/quality.yaml` → `constitution.development_mode: "tdd"`). Playwright 스펙 파일 자체가 사양이므로, run-phase에서는 "5회 반복 실행 시 재시도 0건"을 RED(현재 상태 재현) → GREEN(전환 후 확인) 사이클의 관측 대상으로 삼는다.
- **SPEC 아티팩트**: `.moai/specs/SPEC-E2E-AUTH-STATE-001/{spec,plan,acceptance,progress}.md`.

### §A.1 Tier 판정 근거 (M)

| 신호 | 실측/추정 | Tier 함의 |
|------|-----------|-----------|
| 영향 파일 수 | 5개 — `playwright.config.ts`(수정) + `e2e/auth.setup.ts`(신규) + 경로 상수 leaf 모듈(신규) + `e2e/case-input-mobile-layout.spec.ts`(수정) + `e2e/tenant-isolation.spec.ts`(수정) | 5-15 → **M** (S의 "< 5 files" 상한에 걸침) |
| 신규 LOC | 약 80-140 (setup 파일 ~40줄, 경로 상수 모듈 ~10줄, config 변경 ~20줄, 스펙 파일 2개 각 5-10줄 diff) | < 300 → S 쪽이나, 파일 수가 Tier를 결정 |
| 도메인 수 | E2E 인증 하네스 1개 (단일 도메인, 아키텍처 변경 없음) | S 쪽 신호 |
| 검증 복잡도 | "5회 반복 실행 무재시도" 같은 반복·통계적 증거가 필요하고, AC가 6개 요구 영역(플레이키니스 해소/회귀 없음/helpers.ts 무변경/시크릿 미커밋/설정 무변경/프로덕션 코드 무변경)에 걸쳐 있어 acceptance.md 분리가 spec.md 인라인보다 추적성이 높음 | M 쪽 신호 |

파일 수(5개)가 Tier S의 "< 5 files" 경계에 걸리고, AC 영역이 다수(6개)라 별도 `acceptance.md`가 추적성에 유리하므로 **Tier M**으로 분류한다. REQ 10개 / AC 11개로 Tier M 상한(16/16) 대비 여유를 둔다.

### §A.2 PRESERVE 목록 (수정 금지)

- `e2e/helpers.ts` — `loginAsTester`/`requireTesterPassword`/`connectE2EDb` 전체 (REQ-E2EAUTH-004)
- `e2e/mobile-drawer-focus.spec.ts` — 인라인 `loginForDrawerTest` 재시도 헬퍼 전체 (REQ-E2EAUTH-005)
- `playwright.config.ts`의 `workers: 1`, `retries: 2`, `webServer` 블록 (REQ-E2EAUTH-005)
- `scripts/run-e2e.ts`, `scripts/e2e-tester-emails.ts`, `scripts/provision-tester.ts` — 전체 (REQ-E2EAUTH-009 범위 밖)
- `e2e/case-flow.spec.ts`, `e2e/sidebar-sticky.spec.ts`, `e2e/capture-evidence.spec.ts`, `e2e/capture-evidence-round5.spec.ts`, `e2e/comparison-docs-images.spec.ts`, `e2e/auth.spec.ts` — 전체 (REQ-E2EAUTH-003)
- `lib/`, `app/`, `db/` 이하 모든 애플리케이션/프로덕션 코드 — 전체 (REQ-E2EAUTH-009)

## §B. 순서 안내 (결정 가역성 기준 정렬)

이 SPEC은 데이터 모델이나 UX 흐름 변경이 없는 순수 테스트 인프라 작업이므로, "가장 되돌리기 어렵거나 가장 먼저 확인해야 할 아키텍처 불확실성"이 곧 §C M1이다 — Playwright의 project-dependency 패턴이 `run-e2e.ts`의 `--spec=<filter>` 패스스루와 실제로 호환되는지는 문서만으로 확정할 수 없는 유일한 설계 불확실성이며, 이 확인 결과에 따라 이후 마일스톤 전체의 구현 형태(project-dependency vs `test.beforeAll` 공유 헬퍼)가 갈린다. 이후 마일스톤(M2-M6)은 그 결정이 내려진 뒤의 기계적 구현·전환·검증 단계이므로 뒤에 배치한다.

## §C. 마일스톤 (검토 우선순위 순)

### M1 — [설계 확정] project-dependency × `--spec` 필터 상호작용 검증 (Priority High)

가장 변경 가능성이 높은 결정: Playwright `1.62.1`에서 `dependencies: ["setup"]`를 가진 project가 `playwright test <file-filter>` 형태의 위치 인자 필터링 아래에서도 setup 프로젝트를 강제 실행하는지 실측 확인한다.

- **확인 방법**: 최소 재현 config로 `pnpm exec playwright test tenant-isolation`(대상 파일 중 하나만 매칭하는 필터)을 실행해, setup 프로젝트의 테스트가 리포터 출력에 나타나는지 관찰한다.
- **PASS(가정대로 동작)** → M2-M6은 본 문서 §D에 서술한 project-dependency 설계를 그대로 진행한다.
- **FAIL(setup이 필터에 걸려 스킵됨)** → **대안**: project-dependency를 폐기하고, 두 대상 스펙 파일 각각에 `test.beforeAll`에서 공유 헬퍼 함수(경로 상수 leaf 모듈에 인접 배치, 또는 별도 leaf 모듈)를 호출해 "해당 storageState 파일이 없으면 직접 로그인해 생성"하는 지연 생성(lazy) 패턴으로 전환한다. 이 대안은 REQ-E2EAUTH-001·002·007의 판정 기준(테스터당 실행 전체에서 로그인 1회, 대상 파일만 재사용, `--spec` 필터와 호환)을 낮추지 않는다 — "언제 생성되는가"만 달라질 뿐 "몇 번 로그인하는가"는 동일하게 1회로 유지된다(같은 worker 프로세스 내에서 파일 존재 여부로 판단).
- 이 마일스톤은 구현 착수 시점의 재량 결정이며 사용자 재확인이 필요하지 않다(spec.md HISTORY 및 사용자 지시에 따라 이미 위임됨). 선택한 접근과 근거는 `progress.md` §E.2에 실측 기록한다.

### M2 — 경로 상수 leaf 모듈 신설 (Priority High)

`e2e/storage-state-paths.ts`를 신설해 `TESTER_A_STORAGE_STATE_PATH`/`TESTER_B_STORAGE_STATE_PATH` 두 문자열 상수(예: `.tmp/storageState-tester-a.json`, `.tmp/storageState-tester-b.json`)를 export한다. `scripts/e2e-tester-emails.ts`와 동일한 leaf-module 규율(어떤 `import.meta` 사용 모듈도 직접·간접 import하지 않음)을 따른다 — 문자열 리터럴만 export하므로 이 규율은 자명하게 충족되지만, 향후 유지보수자를 위해 그 이유를 파일 상단 주석으로 명시한다(REQ-E2EAUTH-010).

### M3 — `e2e/auth.setup.ts` 작성 (Priority High)

Playwright "setup" 테스트 파일을 신설한다. `loginAsTester()`는 import하지 않고(그 함수를 재사용하면 `helpers.ts` 변경 시 이 파일의 동작이 암묵적으로 결합되므로, `helpers.ts`-무변경 제약과는 별개로 독립성을 위해 로그인 5줄을 직접 재현), `helpers.ts`의 `requireTesterPassword()`만 import해 재사용한다(읽기 전용 헬퍼 재사용은 REQ-E2EAUTH-004의 "helpers.ts 수정 금지"와 무관 — helpers.ts 자체를 건드리지 않기 때문). TESTER_A/TESTER_B 각각에 대해:

1. 새 브라우저 컨텍스트에서 `/login` 이동 → 이메일/비밀번호 입력 → 제출 → `waitForURL("/")`
2. `page.context().storageState({ path: <M2 경로 상수> })` 호출

두 테스터를 순차 처리(같은 파일 안에서 두 개의 `test()` 블록, 또는 하나의 `test()` 안에서 두 컨텍스트를 순차 생성 — 최종 형태는 M1 결과와 무관하게 자유롭게 선택 가능한 구현 세부사항이다).

### M4 — `playwright.config.ts` project 구성 (Priority High, M1 결과에 따라 분기)

**M1 PASS(project-dependency 채택) 시**:
- `projects` 배열에 `{ name: "setup", testMatch: /.*\.setup\.ts/ }` 추가
- `projects` 배열에 두 대상 파일 전용 project(예: `name: "chromium-authed"`) 추가 — `use: { ...devices["Desktop Chrome"] }`(기존 `chromium`과 동일 디바이스 프로파일), `dependencies: ["setup"]`, `testMatch`를 `case-input-mobile-layout.spec.ts`·`tenant-isolation.spec.ts` 2개 파일로 한정
- 기존 `chromium` project에 `testIgnore`를 추가해 위 2개 파일을 제외 — 동일 파일이 두 project에서 중복 실행되는 것을 방지

**M1 FAIL(공유 헬퍼 대안 채택) 시**: `playwright.config.ts`는 변경하지 않는다(신규 project 불필요) — 이 경우 M4는 스킵되고 M3의 로그인 로직이 두 대상 스펙 파일의 `test.beforeAll` 안으로 직접 이동한다.

### M5 — 대상 스펙 파일 2개 전환 (Priority High)

`e2e/case-input-mobile-layout.spec.ts`와 `e2e/tenant-isolation.spec.ts`에서 `loginAsTester(page, ...)` 호출과 그 관련 import(`loginAsTester`)를 제거하고, 파일 상단에 `test.use({ storageState: <M2 경로 상수> })`를 추가한다(M1 PASS 경로). 두 파일 모두 로그인 이후의 테스트 본문·단언은 한 글자도 바꾸지 않는다(REQ-E2EAUTH-008). `tenant-isolation.spec.ts`의 DB 직접 조회(TESTER_A 조회, `connectE2EDb`)는 브라우저 인증과 무관하므로 그대로 유지한다.

### M6 — 검증 (Priority High)

- 클린 트리에서 `pnpm test:e2e`를 5회 연속 실행 — 매 회 대상 2개 파일이 재시도 0건(1차 시도)으로 통과하는지 리포터 출력에서 확인(AC-E2EAUTH-003)
- 전체 스위트 exit 0 확인, 다른 7개 스펙 파일 회귀 없음 확인(AC-E2EAUTH-004)
- `git diff --stat -- e2e/helpers.ts`가 빈 결과인지 확인(AC-E2EAUTH-005)
- `git diff --stat -- playwright.config.ts`에서 `workers`/`retries` 라인이 변경되지 않았는지 확인, `git diff --stat -- e2e/mobile-drawer-focus.spec.ts`가 빈 결과인지 확인(AC-E2EAUTH-007)
- `git status --porcelain`에 `.tmp/storageState-*.json`이 나타나지 않는지(untracked이며 gitignore 대상인지) `git check-ignore -v` 로 확인(AC-E2EAUTH-006)
- `git diff --stat -- . ':!e2e' ':!playwright.config.ts' ':!scripts' ':!.moai'`가 빈 결과인지 확인 — 애플리케이션 코드 무변경(AC-E2EAUTH-009)

## §D. 기술적 접근 (Technical Approach)

- **왜 project-dependency 패턴을 1순위로 채택하는가**: Playwright 공식 "Authentication" 레시피가 문서화한 표준 패턴이며, `globalSetup` 함수 방식보다 우수하다 — setup 프로젝트도 일반 테스트와 동일하게 Playwright 러너 자식 프로세스 안에서 실행되므로 `scripts/run-e2e.ts`가 조립한 env 상속 경로(`design.md §3.3`의 프로세스 계보 설계 원칙)를 그대로 따른다. 이는 `playwright.config.ts`에 `globalSetup`을 두지 않기로 한 기존 설계 결정과 일관된다.
- **왜 project-wide `dependencies`가 아니라 별도 project로 범위를 좁히는가**: `chromium` project 전체에 `dependencies: ["setup"]`를 걸면 대상이 아닌 7개 스펙 파일도 setup 완료를 기다리게 되어, 그 파일들의 실행 전에 불필요한 로그인 2회가 추가된다 — REQ-E2EAUTH-003(다른 파일 로그인 동작 무변경)과 직접 충돌하지는 않지만(다른 파일은 여전히 자신의 `loginAsTester()`를 호출), 새로운 rate-limit 소비를 그 파일들 앞에 강제로 끼워 넣어 §5 잔여 위험을 불필요하게 키운다. 대상 2개 파일 전용 project로 좁히면 이 영향 범위가 최소화된다.
- **왜 `storageState`를 project 레벨 기본값이 아니라 대상 파일에 필요한 project로만 격리하는가**: TESTER_A(`case-input-mobile-layout.spec.ts`)와 TESTER_B(`tenant-isolation.spec.ts`)가 서로 다른 테스터이므로, 단일 project 기본 `storageState` 값으로는 표현할 수 없다 — 대상 파일 전용 project 자체가 이 두 파일만을 실행 스코프로 가지므로, 각 파일이 자신의 `test.use({ storageState })`로 필요한 테스터를 스스로 선택한다.
- **왜 `loginAsTester()`를 재사용하지 않고 5줄을 복제하는가**: `helpers.ts`가 PRESERVE 대상(REQ-E2EAUTH-004)이라는 제약 자체는 재사용을 막지 않는다(읽기 전용 import는 허용) — 그러나 `auth.setup.ts`가 `loginAsTester()`의 내부 구현(예: testid 이름)에 결합되면, 향후 `helpers.ts`가 변경될 때 이 setup 파일도 암묵적으로 영향을 받는 결합이 생긴다. 사용자 지시("독립적인 duplication이 허용됨")에 따라 명시적으로 분리한다.
- **`.tmp/` 커밋 방지**: `.gitignore`의 기존 `*.tmp` 글롭 패턴이 이미 `.tmp/` 디렉터리 전체(디렉터리명 `.tmp`가 `*.tmp` 패턴과 일치)를 커버함을 `git check-ignore -v .tmp/storageState-tester-a.json` 실측으로 확인했다(plan-phase 조사, 아래 결과 참고) — 신규 gitignore 항목 추가는 불필요하며, M6에서 재확인만 수행한다.

  ```
  $ git check-ignore -v .tmp/storageState-tester-a.json
  .gitignore:108:*.tmp	.tmp/storageState-tester-a.json
  ```

## §E. 위험 (Risks)

| 위험 | 영향 | 대응 |
|------|------|------|
| M1 검증에서 project-dependency가 `--spec` 필터와 호환되지 않음 | M4-M5 설계 변경 필요 | §C M1에 대안(공유 헬퍼 `test.beforeAll`) 이미 문서화 — 재계획 불필요, 구현 중 즉시 전환 |
| setup 프로젝트의 2회 로그인이 인접 스펙 파일과 rate-limit 충돌 유발 | 전체 스위트의 새로운 flaky 지점 생성 | `spec.md` §5에 명시된 기존 `retries: 2` 안전망으로 흡수 — AC-E2EAUTH-004로 회귀 없음을 실행 확인 |
| `storageState` 파일 생성 실패 시 대상 스펙이 원인 불명 오류로 실패 | 디버깅 시간 증가 | Playwright의 기본 파일-부재 오류가 이미 명확함 — 별도 방어 로직 추가는 범위 밖(YAGNI) |
| 두 대상 파일의 `test.use({ storageState })` 적용 후 CJS 번들 시 leaf 모듈 import 실패 | REQ-E2EAUTH-010 위반, 빌드 전체 실패 | M2에서 leaf 모듈을 `scripts/e2e-tester-emails.ts`와 동일한 규율로 작성 + M6에서 실제 `pnpm test:e2e` 실행으로 확인 |

## §F. MX 태그 계획

- `e2e/auth.setup.ts`의 로그인+저장 로직: fan-in이 낮으므로(Playwright 런타임이 project-dependency를 통해 암묵적으로 실행 — 직접 호출자 없음) `@MX:ANCHOR` 요건(호출자 3개 이상)에 해당하지 않는다. 향후 유지보수자를 위한 `@MX:NOTE`(context)만 추가한다 — "이 파일은 `playwright.config.ts`의 `setup` project에 의해서만 실행되며, 개별 `pnpm exec playwright test auth.setup` 직접 실행도 가능하지만 CI/로컬 표준 경로는 `pnpm test:e2e`뿐" 설명.
- `e2e/storage-state-paths.ts`: `scripts/e2e-tester-emails.ts`와 동일한 leaf-module 제약(REQ-E2EAUTH-010 근거)을 `@MX:REASON` 서브라인으로 명시.
- 신규 위험 패턴(goroutine 상당/복잡도 15 이상)이 없으므로 `@MX:WARN`은 해당 없음.

## §G. Anti-Patterns (이번 SPEC에서 금지)

- `e2e/helpers.ts`를 조금이라도 수정하는 것 — 새 로직은 항상 새 파일에만 추가
- `chromium` project 전체에 `dependencies: ["setup"]`를 거는 것 — 대상 외 7개 파일 앞에 불필요한 로그인을 끼워 넣음
- `storageState` JSON 파일을 커밋하거나 `.gitignore` 예외 처리로 추적 대상화하는 것
- 대상 2개 파일 외의 어떤 `e2e/*.spec.ts`의 로그인 방식도 함께 "정리"하려는 시도(드라이브-바이 리팩터 금지)
- `playwright.config.ts`의 `workers`/`retries`를 "이왕 손대는 김에" 조정하는 것
- Better Auth의 rate limit 설정을 완화하는 프로덕션 코드 변경으로 우회하는 것

## §H. Cross-References

- `.moai/specs/SPEC-RUNTIME-001/design.md` §3.3, §3.4 — 프로세스 계보 및 env 상속 설계(이 SPEC이 보존해야 하는 전제)
- `.moai/specs/SPEC-PILOT-VISUAL-001/`, `.moai/specs/SPEC-PILOT-UX-001/` — 대상 2개 스펙 파일의 기원
- Playwright 공식 문서 — Authentication (project dependencies 기반 setup project 레시피)
