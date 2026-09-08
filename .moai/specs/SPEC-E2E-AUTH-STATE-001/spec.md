---
id: SPEC-E2E-AUTH-STATE-001
title: "E2E storageState 인증 재사용 — Better Auth /sign-in rate limit로 인한 flaky 테스트 제거"
version: "0.1.1"
status: draft
created: 2026-09-08
updated: 2026-09-08
author: Nexsol
priority: P2
phase: "v1.0.0 target"
module: "e2e/, playwright.config.ts"
lifecycle: spec-anchored
tags: "e2e, playwright, authentication, storagestate, flaky-test, rate-limiting, test-infra"
tier: M
depends_on: [SPEC-RUNTIME-001]
related_specs: [SPEC-PILOT-UX-001, SPEC-PILOT-VISUAL-001]
---

## HISTORY

- 2026-09-08: 플랜 개정 v0.1.1 (plan-auditor iteration-1 FAIL, 종합 점수 0.71 → Tier M 기준 0.80 대응) — D2(blocking, major)/D3(blocking, major)/D4(blocking, minor) 3건과 선택 항목 D1/D5 2건을 반영했다. (1) **D2**: `plan.md` §C M1 FAIL 경로의 지연 생성 대안이 "파일 없으면 생성"만으로는 REQ-E2EAUTH-006(매 실행마다 새로 생성)을 충족하지 못함 — 이전 실행이 비정상 종료해 남은 storageState가 재프로비저닝된 새 DB와 불일치한 채 재사용될 수 있는 결함을 발견해, 무조건 삭제 후 재생성(권장) 또는 실행-스코프 식별자 게이팅을 명시적으로 추가하고 `acceptance.md` AC-E2EAUTH-006이 채택된 경로를 검증하도록 연결했다. (2) **D3**: REQ-E2EAUTH-003(대상 2개 파일 외 로그인 무변경)이 `capture-evidence.spec.ts` 등 나머지 5개 파일에 대해 동작 수준(AC-004 "여전히 통과")으로만 검증되던 갭을 신규 AC-E2EAUTH-012(소스 레벨 `git diff --stat` 무변경)로 메웠다. (3) **D4**: AC-E2EAUTH-007의 "목측 대조"를 `grep -c "retries: 2"`/`grep -c "workers: 1"` 기계적 확인으로 교체했다. (4) **D1**(선택, 반영): REQ-E2EAUTH-002·007을 "Where(capability gate)"에서 "Event-driven"으로 재분류(캐패빌리티 게이트가 아니라 실행 트리거를 서술하므로). (5) **D5**(선택, 반영): `spec.md` §5에 CI 아티팩트를 통한 storageState 노출이 이번 SPEC의 검증 대상이 아님을 명시하는 문장을 추가했다. `spec.md` §1 WHY/WHAT과 §4 Out of Scope 5개 항목은 변경하지 않으며, REQ 10개 개수는 불변, AC는 11개 → 12개로 증가(신규 AC-E2EAUTH-012 1건 추가)했다. 어떤 기존 AC의 판정 기준도 완화하지 않았다.
- 2026-09-08: 최초 작성 (manager-spec) — `e2e/case-input-mobile-layout.spec.ts`와 `e2e/tenant-isolation.spec.ts`가 첫 실행에서 간헐적으로 실패하고 Playwright retry에서 통과하는 현상을 오케스트레이터 세션의 사전 조사(실측: Better Auth 기본 rate limit — `/sign-in` 경로에 10초 창 내 최대 3회, IP+경로 기준으로 이메일과 무관)를 근거로 고정했다. Playwright `storageState` 재사용으로 실제 UI 로그인 횟수 자체를 줄이는 접근을 범위로 확정했으며, `e2e/helpers.ts` 무변경·`workers: 1`/`retries: 2` 무변경·narrow scope(대상 2개 스펙 파일만) 3가지 구속 조건은 사용자와 사전 합의된 제약으로 고정한다.

## §1. 개요 (Overview)

### WHY — 배경 및 동기

SPEC-RUNTIME-001이 확립한 E2E 하네스(`scripts/run-e2e.ts` 단일 진입점 → Playwright 러너 spawn → `e2e/helpers.ts`의 `loginAsTester()`를 통한 실 UI 로그인)는 `workers: 1` 직렬 실행과 `retries: 2`로 대부분의 rate-limit 충돌을 흡수해 왔다. 그러나 두 스펙 파일은 여전히 첫 시도에서 간헐적으로 실패한다:

- `e2e/case-input-mobile-layout.spec.ts` — TESTER_A로 1회 로그인 후 여러 뷰포트 검증을 같은 세션에서 수행
- `e2e/tenant-isolation.spec.ts` — TESTER_B로 1회 로그인(TESTER_A는 DB 직접 조회로만 참조, 브라우저 로그인 없음)

두 파일 모두 이미 "세션당 로그인 1회" 관례(`capture-evidence.spec.ts`와 동일)를 따르고 있음에도 실패가 재현된다 — 원인은 전체 스위트를 `workers: 1`로 순서대로 실행할 때, 인접한 다른 스펙 파일들의 로그인이 10초 rate-limit 창에 누적되어 이 두 파일의 로그인 시도가 그 창에 걸리기 때문이다(`playwright.config.ts`의 기존 주석이 이미 이 메커니즘을 문서화하고 있다 — `retries: 2`는 결함을 가리지 않는 재시도로 이미 의도적으로 유지되는 안전망이다).

재시도로 결국 통과하므로 CI를 막지는 않지만, 매 실행마다 결과가 달라지는 테스트는 신뢰도를 갉아먹고 재시도 대기 시간만큼 전체 실행 시간을 늘린다. 근본적인 해법은 재시도 횟수를 늘리는 것이 아니라, 이 두 파일이 애초에 실제 `/sign-in` 호출 자체를 하지 않도록 만드는 것이다.

### WHAT — 이번 SPEC 범위

Playwright의 project-dependency 기반 "setup 프로젝트" 패턴을 도입해, TESTER_A/TESTER_B 각각에 대해 **테스트 스위트 전체에서 단 1회씩만** 실제 UI 로그인을 수행하고 그 결과 브라우저 컨텍스트(`storageState`)를 파일로 저장한다. `e2e/case-input-mobile-layout.spec.ts`와 `e2e/tenant-isolation.spec.ts`는 이후 그 저장된 `storageState`를 재사용해 인증된 상태로 테스트를 시작하며, 자신의 `/sign-in` 호출을 만들지 않는다.

범위는 다음으로 좁힌다:

- 신규 파일 `e2e/auth.setup.ts` — TESTER_A/TESTER_B 각 1회 로그인 후 `storageState`를 `.tmp/` 하위 파일로 저장하는 Playwright "setup" 테스트
- 신규 leaf 모듈(경로 상수 전용, `import.meta` 미사용) — setup 파일과 두 대상 스펙 파일이 `storageState` 파일 경로를 공유하기 위함
- `playwright.config.ts` — setup 프로젝트 + 두 대상 파일 전용 project 추가(`dependencies: ["setup"]`), 기존 `chromium` 프로젝트에서는 두 대상 파일을 제외
- `e2e/case-input-mobile-layout.spec.ts`, `e2e/tenant-isolation.spec.ts`의 로그인 호출부만 `test.use({ storageState })` 방식으로 교체(테스트 본문의 단언·시나리오는 무변경)

이 SPEC은 순수 테스트 인프라 변경이며, `e2e/helpers.ts`를 포함해 애플리케이션/프로덕션 코드는 어떤 것도 변경하지 않는다(§4 참고).

## §2. 요구사항 (Requirements — GEARS 표기법)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-E2EAUTH-001 | Event-driven | 개발자가 `pnpm test:e2e`를 실행하면, Playwright 실행 환경은 `setup` 프로젝트를 통해 TESTER_A와 TESTER_B 각각에 대해 정확히 1회의 UI 로그인(`/login` 경유)을 수행하고, 그 결과 브라우저 컨텍스트의 `storageState`를 `.tmp/` 하위의 테스터별 JSON 파일로 저장해야 한다. | 사용자 요구사항 — flaky 테스트 근본 원인 제거 |
| REQ-E2EAUTH-002 | Event-driven | When `e2e/case-input-mobile-layout.spec.ts` 또는 `e2e/tenant-isolation.spec.ts`가 실행되면, 각 스펙은 `loginAsTester()`를 호출하는 대신 REQ-E2EAUTH-001이 저장한 `storageState`를 재사용해 인증된 브라우저 컨텍스트로 테스트를 시작해야 한다. | 사용자 요구사항 — 대상 2개 파일만 전환 |
| REQ-E2EAUTH-003 | Unwanted | `storageState` 재사용 메커니즘은 `e2e/case-input-mobile-layout.spec.ts`와 `e2e/tenant-isolation.spec.ts`를 제외한 어떤 기존 `e2e/*.spec.ts` 파일의 로그인 동작도 변경해서는 안 된다. | 사용자 요구사항 — narrow scope, 안전망 무변경 |
| REQ-E2EAUTH-004 | Unwanted | 이 SPEC의 어떤 구현 산출물도 `e2e/helpers.ts`를 수정해서는 안 된다. | 사용자 요구사항 — helpers.ts는 이전 라운드의 PRESERVE 대상(`SPEC-UI-MIGRATION-001/progress.md` Round 4) |
| REQ-E2EAUTH-005 | Unwanted | 이 SPEC의 어떤 구현 산출물도 `playwright.config.ts`의 `workers: 1`·`retries: 2` 설정값 또는 `e2e/mobile-drawer-focus.spec.ts`의 인라인 재시도 로그인 헬퍼(`loginForDrawerTest`)를 변경해서는 안 된다. | 사용자 요구사항 — 기존 안전망은 순수 추가적으로만 보강 |
| REQ-E2EAUTH-006 | Ubiquitous | `storageState` JSON 파일은 매 `pnpm test:e2e` 실행마다 새로 생성되어야 하며, 어떤 커밋에도 포함되어서는 안 된다. | 사용자 요구사항 — DB가 매 실행마다 초기화되므로(`resetE2EDatabase()`) 테스터 계정도 매번 재생성됨 |
| REQ-E2EAUTH-007 | Event-driven | When 개발자가 `pnpm test:e2e -- --spec=<filter>`로 두 대상 스펙 파일 중 하나만 선택해 실행하면, `storageState` 준비 절차(setup 의존성)는 그 필터링된 실행에서도 여전히 수행되어야 한다. | 사용자 요구사항 — `run-e2e.ts`의 기존 `--spec=` 패스스루와의 호환 |
| REQ-E2EAUTH-008 | Ubiquitous | `e2e/case-input-mobile-layout.spec.ts`와 `e2e/tenant-isolation.spec.ts`의 기존 테스트 단언과 시나리오 의미는 `storageState` 전환 전후로 동일하게 유지되어야 한다(로그인 진입 방식만 대체). | 사용자 요구사항 — 검증 대상 동작 무변경 |
| REQ-E2EAUTH-009 | Unwanted | 이 SPEC의 어떤 커밋도 `e2e/`, `playwright.config.ts`, `scripts/` 디렉터리 외부의 애플리케이션/프로덕션 코드를 변경해서는 안 된다. | 사용자 요구사항 — 순수 테스트 인프라 SPEC |
| REQ-E2EAUTH-010 | Where(capability gate) | Where `storageState` 파일 경로 상수를 `e2e/auth.setup.ts`와 두 대상 스펙 파일이 공유해야 하는 경우, 그 경로 상수는 `import.meta`를 사용하지 않는 leaf 모듈에 정의되어야 한다. | 실측: Playwright spec 번들러가 `e2e/*.spec.ts`를 CommonJS로 변환하므로 `import.meta`를 사용하는 모듈(또는 그런 모듈을 간접 import하는 모듈)을 spec 파일이 import하면 `SyntaxError`로 실패(`scripts/e2e-tester-emails.ts` 상단 주석에 이미 문서화된 동일 제약) |

## §3. 비기능 제약 (Constraints)

- **격리**: 신규 로직은 `e2e/`, `playwright.config.ts` 범위 안에 머문다. `scripts/run-e2e.ts`의 프로세스 계보(진입점 → Playwright 러너 → Next.js 서버, `design.md §3.3`에서 확립)와 env 상속 경로는 변경하지 않는다 — setup 프로젝트도 동일한 Playwright 러너 프로세스 안에서 실행되므로 별도 env 전파 경로가 필요 없다.
- **재현성**: `storageState` 생성은 매 실행마다 새로 프로비저닝된 테스터 계정을 대상으로 하므로, 이전 실행의 파일이 남아 있어도(정리 실패 시) 이번 실행의 setup이 항상 새 파일로 덮어써야 한다.
- **동시성/순서**: `workers: 1`이 유지되므로 setup 프로젝트의 로그인도 다른 모든 로그인과 마찬가지로 직렬 실행된다 — 이 SPEC은 setup의 2회 로그인이 인접한 다른 스펙 파일의 로그인과 겹쳐 새로운 rate-limit 충돌을 유발할 가능성을 완전히 제거하지 않으며, 그 잔여 위험은 기존 `retries: 2` 안전망으로 흡수됨을 §5에 명시한다.
- **플랫폼**: Windows 개발 환경(`scripts/run-e2e.ts`의 기존 Windows 전용 정리 로직)과 무관한 변경이며, 이 SPEC은 그 로직을 건드리지 않는다.

## §4. 제외 범위 (Out of Scope)

이번 SPEC의 out of scope 항목은 다음과 같다 — 아래 항목들은 narrow scope 범위 밖이며, 필요 시 별도 후속 SPEC의 후보로 이연한다.

### Out of Scope — 다른 e2e 스펙 파일의 storageState 전환
- `e2e/case-flow.spec.ts`, `e2e/sidebar-sticky.spec.ts`, `e2e/capture-evidence.spec.ts`, `e2e/capture-evidence-round5.spec.ts`, `e2e/comparison-docs-images.spec.ts`는 이번 SPEC에서 다루지 않는다. 이들 중 일부(특히 `capture-evidence-round5.spec.ts`— 테스트당 1회씩 총 6회 `loginAsTester` 호출)는 이론적으로 같은 rate-limit 부류의 flaky 위험을 공유할 수 있으나, 사용자와 합의된 narrow scope 결정에 따라 이번 SPEC은 오직 실측으로 flaky가 재현된 2개 파일만 전환한다. 필요성이 재확인되면 후속 SPEC에서 동일 패턴을 확장한다.
- `e2e/auth.spec.ts`는 로그인 메커니즘 자체(성공/실패)를 검증하는 스펙이므로, 이 SPEC의 narrow scope 결정과 무관하게 원천적으로 사전 인증된 storageState 전제조건으로 전환될 수 없다 — 이 파일이 검증하는 대상 자체가 "로그인이 실제로 동작하는가"이기 때문이다.

### Out of Scope — `e2e/helpers.ts` 수정
- `loginAsTester()`, `requireTesterPassword()`, `connectE2EDb()`의 시그니처나 구현을 변경하는 것은 이번 SPEC에서 다루지 않는다. 신규 로직은 새 파일(`e2e/auth.setup.ts` 및 경로 상수 leaf 모듈)에만 추가한다.

### Out of Scope — `workers`/`retries` 정책 변경
- `playwright.config.ts`의 `workers: 1`(SQLite/세션 공유 충돌 방지)과 `retries: 2`(결함을 가리지 않는 재시도 안전망)를 조정하거나 제거하는 것은 이번 SPEC에서 다루지 않는다.

### Out of Scope — 프로덕션 인증 코드 변경
- `lib/auth/` 및 그 외 애플리케이션 코드의 어떤 변경도 이번 SPEC에서 다루지 않는다. Better Auth의 기본 rate limit 설정 자체를 완화·비활성화하는 접근은 명시적으로 배제한다(테스트 인프라 레벨 해법만 채택).

### Out of Scope — CI 파이프라인 신설
- 이번 SPEC은 로컬 `pnpm test:e2e` 실행을 대상으로 하며, 신규 CI 워크플로 파일 추가나 CI 실행 트리거 변경은 다루지 않는다.

## §5. 잔여 위험 (Residual Risks)

- **setup 프로젝트 실행이 인접 스펙 파일의 rate-limit 예산을 소비할 가능성**: `chromium`과 setup 의존성을 갖는 신규 project는 서로 다른 Playwright project이므로, `workers: 1`이 보장하는 것은 "동시에 두 요청이 나가지 않는다"이지 "setup의 2회 로그인이 항상 다른 스펙 파일의 로그인과 10초 이상 떨어져 실행된다"가 아니다. 독립적인(의존 관계 없는) project 간 실행 순서는 Playwright 내부 스케줄링에 따르며 이 SPEC이 강제하지 않는다. 이 잔여 위험은 새로 도입되는 것이 아니라 기존에도 존재했던 것과 동일한 종류이며, 기존 `retries: 2` 안전망(§4 "workers/retries 정책 변경" — 무변경 유지)이 그대로 흡수한다. AC-E2EAUTH-004(전체 스위트 회귀 없음)가 이 위험이 실제로 문제를 일으키지 않음을 실행으로 확인한다.
- **Playwright project-dependency와 `--spec=<filter>` CLI 패스스루의 상호작용**: `scripts/run-e2e.ts`의 `--spec=<filter>` 인자가 `playwright test <filter>` 형태로 전달될 때, 필터에 매칭되지 않는 setup 프로젝트의 테스트 파일(`auth.setup.ts`)이 의존 관계 때문에 강제 실행되는지는 Playwright 버전(`1.62.1`)에서의 실측 확인이 필요하다. `plan.md` §C M1에서 구현 착수 시 가장 먼저 검증하며, 예상과 다를 경우 `plan.md` §D에 기록된 대안(공유 헬퍼 기반 `test.beforeAll`)으로 전환한다 — 이 전환은 REQ-E2EAUTH-001·002·007의 판정 기준을 낮추지 않는다.
- **storageState 파일의 재사용 불가 인지 실패**: setup 실행이 실패해 `storageState` 파일이 생성되지 않은 채로 대상 스펙 파일이 그 경로를 읽으려 시도하면 Playwright는 파일 부재 오류로 명확히 실패한다(무음 통과가 아님) — 이는 의도된 fail-fast 동작이며 별도 방어 로직을 추가하지 않는다.
- **CI 아티팩트를 통한 storageState 노출**: `spec.md` §4 "CI 파이프라인 신설"이 배제하는 바와 같이 이번 SPEC은 CI 파이프라인을 신설하지 않으므로, `storageState` JSON(인증 세션 쿠키 포함)이 CI 아티팩트(예: Playwright trace/report 업로드)로 노출될 가능성은 이번 SPEC의 검증·완화 대상이 아니다. 향후 CI를 도입하는 SPEC이 `.tmp/`를 아티팩트 업로드 범위에서 제외하는 책임을 진다.

## §6. 참고 문서

- `.moai/specs/SPEC-RUNTIME-001/` — `scripts/run-e2e.ts` 단일 진입점, `playwright.config.ts`의 `workers`/`retries` 정책, `e2e/helpers.ts`의 기원
- `.moai/specs/SPEC-PILOT-UX-001/`, `.moai/specs/SPEC-PILOT-VISUAL-001/` — `case-input-mobile-layout.spec.ts`(Round5), `tenant-isolation.spec.ts`(AC-RUNTIME-014)의 기원
- Playwright 공식 문서 — Authentication recipe (project dependencies 기반 setup project 패턴)
