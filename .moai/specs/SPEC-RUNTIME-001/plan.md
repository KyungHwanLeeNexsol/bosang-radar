# Plan — SPEC-RUNTIME-001

## §A. Context

- **프로젝트 상태**: 브라운필드. SPEC-SCAFFOLD-001(status: completed)이 구축한 코드베이스가 이미 존재하며 `pnpm test`/`lint`/`build`/`format:check`가 통과하는 상태다. 이번 SPEC은 그 위에 런타임 활성화 계층만 추가한다.
- **작업 위치**: `C:/Users/Nexsol/Documents/bosang-radar` (main checkout).
- **Tier**: L (5개 아티팩트 + progress.md). 판단 근거는 §A.1.
- **라우트**: Tier L이므로 Route B(PR 라우트) — `spec-workflow.md` § SPEC Phase Discipline에 따라 phase별 브랜치 + PR로 진행한다.
- **개발 방법론**: TDD (`.moai/config/sections/quality.yaml` → `constitution.development_mode: "tdd"`).
- **SPEC 아티팩트**: `.moai/specs/SPEC-RUNTIME-001/{spec,plan,acceptance,design,research,progress}.md`.

### §A.1 Tier 판정 근거 (L)

| 신호 | 실측/추정 | Tier 함의 |
|------|-----------|-----------|
| 영향 파일 수 | 약 18-21개 (env 모듈 2 + **CLI 부트스트랩 1 + 그 테스트 1** + 스크립트 4 + 스크립트 테스트 3-4 + **구조적 env 공유 테스트 1** + E2E 설정/스펙 4 + `package.json` + `.env.local.example` + `lib/db/client.ts` 수정 + `instrumentation.ts` + 런북 문서) — v0.3.0에서 부트스트랩·구조적 검증 추가로 +2~3 | > 15 → **L** |
| 신규 LOC | 약 900-1,350 (v0.3.0에서 +100~150) | 경계 (M/L) |
| 도메인 수 | DB 마이그레이션 · 시드 · 인증/시크릿 프로비저닝 · 환경 로드/검증 · E2E 하네스 = 5 | 다중 도메인 |
| 보안 경계 | 인증 계정 생성 + 시크릿 취급 경로 신설 | L 쪽으로 기울임 |

파일 수가 Tier M 밴드(5-15)를 초과하고, 인증 계정 생성이라는 보안 경계를 신설하므로 **Tier L**로 분류한다. 다만 아키텍처 변경이 없는 활성화 SPEC이므로 REQ 20 / AC 20으로 상한(25/25) 대비 여유를 두고 타이트하게 유지한다.

### §A.2 플랜 개정 v0.2.0 (구현 착수 승인 전)

사용자 설계 검토 결과 **구현 접근 방식 3건**을 개정했다. SPEC의 목표(WHY/WHAT)와 `spec.md` §4 제외 범위 6개 항목은 변경하지 않는다 — 세 건 모두 기존 범위 안에서 "어떻게 만드는가"를 바꾸는 개정이다.

| # | 대상 | 개정 전 | 개정 후 | 영향 마일스톤 |
|---|------|---------|---------|---------------|
| 1 | E2E 시크릿 수명주기 | `e2e/global-setup.ts`가 생성 → Playwright `webServer`로의 환경 상속을 **가정** | `scripts/run-e2e.ts` 단일 진입점이 생성·DB 준비·Playwright spawn을 모두 소유 → 프로세스 계보로 일치 **보장** | M5 |
| 2 | 테스터 계정 생성 | `better-auth/crypto` 내부 해시 + `user`/`account` 직접 INSERT | 프로비저닝 전용 `betterAuth` 인스턴스의 공식 `auth.api.signUpEmail` 호출 (비마운트) | M2 |
| 3 | 환경변수 검증 | 모든 명령·프로세스에 동일한 평면 필수 집합 | 목적별 스코프(`db`/`provision`/`app`/`e2e`) 검증 + `GEMINI_API_KEY` 앱 부팅 요구 해제 | M1 |

개정 2의 기술적 성립 여부는 설치된 `better-auth@1.7.1` 소스 직접 읽기로 확인했다(`research.md` §0.1). 개정 3은 REQ-RUNTIME-010의 fail-fast 요구를 완화하지 않는다 — 바꾸는 것은 "무엇이 부팅인가"와 "어떤 변수가 어떤 목적을 막는가"다.

### §A.3 플랜 개정 v0.3.0 (구현 착수 승인 전, 3차 설계 검토)

사용자 설계 재검토 결과 **구현 접근 방식 3건**을 추가 개정했다. SPEC의 목표(WHY/WHAT)와 `spec.md` §4 제외 범위 6개 항목은 **변경하지 않는다** — 세 건 모두 기존 범위 안에서 "어떻게 만드는가" 또는 "어떻게 검증하는가"를 바꾸는 개정이다.

| # | 대상 | 개정 전 | 개정 후 | 영향 마일스톤 |
|---|------|---------|---------|---------------|
| 1 | 독립 CLI의 환경 로드 | Next.js 자동 `.env.local` 로딩이 `tsx`/`node` 실행 스크립트에도 적용된다는 **암묵적 가정** | `scripts/cli-bootstrap.ts` 공용 모듈이 `@next/env`의 `loadEnvConfig`로 **명시적 로드 → 검증** 순서를 소유 (REQ-RUNTIME-021 신설) | M1 (+ M2/M3/M4 경유) |
| 2 | 우선순위 시험의 자격증명 | AC-RUNTIME-015 Given이 **실제 원격 Turso 자격증명**을 요구 | **비라우팅 sentinel 값**(`libsql://sentinel-nonexistent-host.invalid`) — 우선순위 가정이 틀려도 실제 DB 도달 불가 | M5 |
| 3 | 시크릿 공유의 검증 | "로그인 성공이 `BETTER_AUTH_SECRET` 동일성을 **입증한다**" (간접 역추론) | 구조적 검증(AC-RUNTIME-022, 전달된 env 객체 직접 관측)과 기능적 검증(AC-RUNTIME-015)으로 **분리** | M5 |

개정 1의 기술적 성립 여부는 설치된 패키지 트리와 `@next/env` 번들 소스 직접 읽기로 확인했다(`research.md` §0.2) — `loadEnvConfig`는 **존재하나 pnpm strict 레이아웃에서 프로젝트 코드가 import할 수 없는 상태**이므로, 직접 devDependency 선언이 M1의 선행 조건이다. 개정 2는 검증 대상 성질을 축소하지 않는다(우선순위는 그대로 시험된다). 개정 3은 검증을 **넓힌다** — 간접 추론뿐이던 구조적 성질에 직접 관측이 추가된다.

**어떤 AC의 판정 기준도 낮추지 않았다.**

### §A.4 PRESERVE 목록 (수정 금지)

- `lib/pipeline/**` — 6단계 mock 구현 및 타입 계약 (REQ-RUNTIME-019)
- `lib/ai/provider.ts`, `lib/ai/providers/gemini.ts` — AI provider 경계
- `lib/validation/case-input.ts` — PII 차단 계층
- `lib/db/schema.ts` — 스키마 정의 (마이그레이션이 이미 생성되어 있으므로 변경 시 재생성 필요 → 이번 SPEC에서는 변경하지 않는다)
- `lib/cases/**`, `app/**` — 단, E2E 안정 셀렉터(`data-testid`) 부착은 최소 범위로 허용
- `.moai/specs/SPEC-SCAFFOLD-001/**` — 완료된 선행 SPEC 아티팩트

## §B. 순서 안내 (결정 가역성 기준 정렬)

아래 §C 마일스톤은 **검토 우선순위**(decision-reversibility) 기준으로 정렬한다 — 변경 가능성이 높은 결정(새 타입 인터페이스, 운영자 흐름, 보안 결정)을 먼저 제시하고, 기계적 작업(문서화)을 마지막에 배치한다.

**실행 순서는 검토 순서와 다르다**: 프로비저닝(M2)은 마이그레이션이 적용된 DB를 전제하므로, manager-develop은 **M1 → M3 → M4 → M2 → M5 → M6** 순서로 실행한다.

## §C. 마일스톤 (검토 우선순위 순)

### M1 — 목적별 환경변수 검증 계약 + 명시적 로드 부트스트랩 (Priority: High, 결정 가역성: 높음) *(개정 v0.2.0 / v0.3.0)*

**대상**: REQ-RUNTIME-003, REQ-RUNTIME-010, REQ-RUNTIME-011, REQ-RUNTIME-021

#### M1-a. `@next/env` 직접 의존성 선언 (선행 조건, 개정 v0.3.0)

- **가장 먼저 수행한다.** 실측상 `@next/env@16.3.2`는 pnpm 가상 스토어에만 존재하고 프로젝트 루트 `node_modules/@next/`는 **부재**하며 `.npmrc` hoisting 설정도 없다(`research.md` §0.2). 이 상태에서 `scripts/`의 `import { loadEnvConfig } from "@next/env"`는 `MODULE_NOT_FOUND`로 실패한다.
- `pnpm add -D @next/env@16.3.2` — **`next`와 동일 버전으로 고정**한다. 버전이 어긋나면 앱 부팅 경로와 스크립트 경로가 서로 다른 로더를 쓰게 되어, 같은 `.env.local`이 두 경로에서 다르게 해석될 수 있다.
- 이는 신규 패키지 도입이 아니라 **이미 트리에 있는 전이 의존성의 명시화**이며(설치 그래프에 새 패키지가 추가되지 않는다), `spec.md` §3 "의존성 추가의 허용 범위"가 허용하는 형태다.
- **실측 확인 의무**: 선언 후 실제 import가 성공하는지 확인한 뒤 M1-b로 진행한다. 이 확인 없이 스크립트를 작성하면 M2/M3/M4 세 마일스톤이 모두 기동 불가 상태로 완성된다.
- 함께 `node --version`을 실측해 독립 스크립트의 TypeScript 실행 방식을 확정한다 — `tsx`가 `node_modules/.bin/`에 없고 `--experimental-strip-types`는 Node 22.6+ 기능이므로, Node 20.x LTS에서는 `tsx` 직접 devDependency 선언이 필요하다(`design.md` §6).

#### M1-b. `scripts/cli-bootstrap.ts` — 명시적 로드 관문 (신규, 개정 v0.3.0)

- `scripts/cli-bootstrap.ts` (신규): 독립 실행 스크립트의 **첫 동작**으로 `loadEnvConfig(projectRoot)`를 호출해 `.env.local`을 명시 로드한 뒤, 그 다음에 `validateEnv(scope)`를 호출한다. 상세 설계는 `design.md` §3.2.2.
- **왜 필요한가**: Next.js의 자동 `.env.local` 로딩은 `next build`/`start`/`dev` 경로의 동작이다. `tsx scripts/db-migrate.ts`는 Next.js를 거치지 않는 별개 프로세스이므로 그 로딩이 일어날 이유가 없다 — 프레임워크가 하는 일을 프레임워크 밖에서도 해줄 것으로 기대한 착오다. 남겨두면 증상은 **"`.env.local`에 분명히 적었는데 없다고 한다"** 로 나타나 원인을 검증 모듈 결함으로 오진하게 만든다.
- **[HARD] 순서 불변 (로드 → 검증)**: 검증은 값의 존재를 판정하는데 로드 전에는 판정할 값이 없다. 순서가 뒤집히면 검증은 항상 "누락"을 보고하고 프로세스는 그 시점에 종료된다.
- **[HARD] 단일 정의**: 로드 호출은 이 파일 **한 곳에만** 존재한다. 스크립트마다 재구현하면 로드 경로가 갈라지며, 이는 `lib/env.ts`를 단일 검증 관문으로 두는 것과 같은 이유다.
- `dir` 인자는 **프로젝트 루트**로 확정한다(스크립트 파일 위치 기준). 실행 시점 cwd에 의존하면 하위 디렉터리 실행 시 조용히 아무것도 로드하지 않는다.
- `NODE_ENV === "test"`일 때 `loadEnvConfig`가 `.env.local`을 로드 목록에서 **제외**함을 실측 확인했으므로(`research.md` §0.2), 각 스크립트의 실제 `NODE_ENV` 값을 확인하고 필요 시 명시 고정한다.
- 검증: AC-RUNTIME-021 (셸 환경변수 전무 + `.env.local`만 존재 상태에서 `db:migrate`/`db:seed` exit 0).

#### M1-c. `lib/env.ts` — 목적별 검증 관문

- `lib/env.ts` (신규): Zod 스키마 기반 환경변수 검증 모듈. **실행 목적(scope)을 인자로 받아** 그 목적이 실제로 소비하는 변수만 검증한다. 스코프는 `db`(마이그레이션/시드) · `provision`(테스터 생성) · `app`(Next.js 런타임 부팅) · `e2e`(E2E 진입점) 네 가지이며, 스코프 × 변수 매트릭스의 SSOT는 `design.md` §3.1이다.
- **평면 집합에서 목적별 스코프로 (개정 이유)**: 초판은 모든 명령에 동일한 필수 집합을 적용해, DB 주소만 있으면 성립하는 `pnpm db:migrate`를 `BETTER_AUTH_SECRET` 부재로 거부했다. 소비하지 않는 변수를 진입 조건으로 두면 운영자는 "아무 값이나 채우는" 우회를 학습하고, 그 습관은 해당 변수가 진짜로 필요해지는 시점까지 남아 검증을 무력화한다.
- **`GEMINI_API_KEY`의 `app` 스코프 제외**: 파이프라인이 mock 구현을 유지하므로(`spec.md` §4) 이번 SPEC의 어떤 실행 경로도 이 값을 소비하지 않는다 — 앱 부팅 요구사항에서 제외한다. **전방 설계 노트**: 실제 Gemini 호출을 활성화하는 후속 SPEC이 이 변수를 `app` 스코프 필수로 승격해야 한다(`design.md` §3.1 각주). 이번 SPEC은 그 후속 SPEC을 정의하거나 전제하지 않는다.
- **fail-fast 요구는 완화되지 않는다**: 각 스코프는 진입 시점에 자기 변수를 **전량** 검증하고 즉시 실패한다. 개정이 바꾸는 것은 "무엇이 부팅인가"와 "어떤 변수가 어떤 목적을 막는가"이지, 검증이 일어나는 시점이 아니다.
- **`file:` 스킴 capability gate (REQ-RUNTIME-003)**: 전 스코프 공통. `TURSO_DATABASE_URL`이 `file:`로 시작하면 `TURSO_AUTH_TOKEN`을 선택(optional)으로, `libsql://`/`https://`로 시작하면 필수로 판정한다. 현행 `lib/db/client.ts`는 두 변수를 무조건 요구하므로 로컬 파일 DB 사용이 불가능하다 — 이 게이트가 E2E(M5)의 전제 조건이다.
- 오류 메시지는 **스코프 + 변수명 + 필요 이유 + 획득 경로**를 담고, **값은 절대 포함하지 않는다**(REQ-RUNTIME-011). 누락 변수는 첫 항목에서 중단하지 않고 전부 열거한다.
- `app` 스코프 부팅 fail-fast 지점: Next.js `instrumentation.ts`(신규)의 `register()` 훅에서 검증 함수를 호출한다. 지연 실패(첫 DB 접근 시점)를 부팅 실패로 앞당기는 것이 이 마일스톤의 목적이다.
- `lib/db/client.ts`는 자체 인라인 검사 대신 `lib/env.ts`를 경유하도록 최소 수정한다. **기존 `getDb()` 싱글턴 지연 생성 패턴은 유지**한다 — `lib/auth/config.ts` §@MX:ANCHOR가 설명하듯, 모듈 최상위 즉시 생성은 `pnpm build`와 단위 테스트를 깨뜨린다.
- **가장 먼저 검토하는 이유**: 스코프 열거형과 스코프 × 변수 매트릭스는 이후 모든 스크립트·E2E·부팅 경로가 의존하는 계약이며, 변경 시 파급 범위가 가장 크다.

### M2 — 테스터 프로비저닝 (Priority: High, 결정 가역성: 높음) *(개정 v0.2.0)*

**대상**: REQ-RUNTIME-006, REQ-RUNTIME-007, REQ-RUNTIME-008, REQ-RUNTIME-009

- `scripts/provision-tester.ts` (신규): 운영자용 CLI. `pnpm tester:add -- --email <이메일>` 형태로 실행. **첫 동작으로 M1-b의 `cli-bootstrap`을 경유**해 `.env.local`을 명시 로드한 뒤(개정 v0.3.0, REQ-RUNTIME-021) `provision` 스코프로 검증한다 — 로드를 이 파일에서 재구현하지 않는다.
- **비밀번호 수령 경로 (REQ-RUNTIME-008)**: 다음 두 경로만 허용한다.
  1. 대화형 프롬프트(TTY, 입력 에코 없음) — 기본 경로
  2. 환경변수 `TESTER_PASSWORD` — 비대화형(CI/E2E 진입점) 경로
  CLI 인자로 비밀번호를 받는 경로는 **제공하지 않는다**(셸 히스토리·프로세스 목록에 남기 때문). 값은 Better Auth의 `minPasswordLength`(기본 8자)를 만족해야 한다.
- **계정 생성 방식 (개정)**: 스크립트 안에서 프로덕션과 **동일한 Drizzle 어댑터·DB 연결**을 재사용하되 `disableSignUp`을 기본값(false)으로 둔 **별도 `betterAuth` 인스턴스**를 구성하고, 그 인스턴스의 공식 서버 API `auth.api.signUpEmail({ body })`를 호출한다. 인스턴스는 `autoSignIn: false`로 구성한다. 상세 설계는 `design.md` §3.2.1, 경로 비교는 `research.md` §3.
  - **개정 이유**: 초판(`better-auth/crypto` 해시 + 직접 INSERT)은 `providerId`·`accountId`·`issuer`·해시 포맷이라는 라이브러리 **내부 규약을 스크립트가 추정**해야 했다. 공식 API는 이 값들을 스스로 채우므로(`research.md` §0.1 실측) 추정 대상이 사라지고, 업그레이드 시 호출 측이 규약 변경을 따라갈 일도 없어진다.
  - **셀프 가입 표면 불변**: `disableSignUp` 판정은 호출된 인스턴스 자신의 옵션을 읽는다. 프로덕션 `lib/auth/config.ts`는 변경하지 않으므로 `/api/auth/sign-up/email`은 계속 거부하며, 새 인스턴스는 **어떤 라우트에도 마운트되지 않아** 네트워크로 도달할 경로가 없다(REQ-RUNTIME-007).
  - **설계 제약 2건 (고정)**: (a) 인스턴스를 `scripts/` 밖으로 export하지 않는다, (b) 어떤 `route.ts`·핸들러·미들웨어에도 전달하지 않는다. AC-RUNTIME-017이 이를 정적으로 검증한다.
- **동작 순서 (불변)**: `allowed_testers` 등록(REQ-RUNTIME-006) → 계정 생성. allowlist 등록이 선행되어야 `lib/auth/config.ts`의 `databaseHooks.session.create.before`가 이후 로그인 시 세션 생성을 허용한다.
- **재실행 안전성 (REQ-RUNTIME-009)**: 이메일 기준 사전 조회 후 존재하면 계정을 새로 만들지 않는다. 조회를 통과하더라도 라이브러리가 기존 사용자를 발견하면 행을 만들지 않으며, `allowed_testers.email`/`user.email`의 `unique` 제약이 DB 레벨 방어로 남는다.
- **폴백 (트리거 개정)**: `signUpEmail`을 비마운트 인스턴스에서 호출하는 것이 **기술적으로 불가능함이 확인된 경우에만** `research.md` §3의 경로 B → C 순으로 폴백한다. 초판의 "AC-RUNTIME-007 연속 2회 실패" 트리거는 폐기한다 — 올바르게 구현된 공식 API 경로는 확률적으로 실패하는 성질의 것이 아니므로, 런타임 실패 횟수는 경로 전환의 근거가 될 수 없다(실패가 보이면 구현 결함으로 다루고 수정한다). 폴백을 택하는 경우 불가능성을 확정한 관측을 `progress.md` §E.2에 기록한다.
- **보안 결정이 운영자 흐름에 직접 노출되므로 M1 다음 우선순위**로 검토한다.

### M3 — 마이그레이션 적용 절차 (Priority: High, 결정 가역성: 중간)

**대상**: REQ-RUNTIME-001, REQ-RUNTIME-002

- `scripts/db-migrate.ts` (신규): **첫 동작으로 M1-b의 `cli-bootstrap`을 경유**해 `.env.local`을 명시 로드한 뒤(개정 v0.3.0, REQ-RUNTIME-021) `db` 스코프로 검증한다. 이어서 `drizzle-orm/libsql/migrator`의 `migrate()`를 사용해 `db/migrations/`를 적용한다. 해당 모듈은 `node_modules/drizzle-orm/libsql/migrator.js`에 존재함을 실측 확인했다(`research.md` §2).
- `package.json`에 `db:migrate` 스크립트 추가. 기존 `db:generate`는 그대로 둔다.
- **idempotency (REQ-RUNTIME-002)**: Drizzle migrator는 `__drizzle_migrations` 추적 테이블로 적용 이력을 관리하므로 재실행이 no-op이 된다. 이 동작을 코드로 재구현하지 않고 라이브러리 보장에 의존하되, AC로 실제 재실행 결과를 검증한다.
- 프로그래매틱 러너를 선택한 이유(대안: `drizzle-kit migrate` CLI)는 `research.md` §2에 기록한다 — 요지는 M1의 `lib/env.ts` 검증을 동일하게 통과시키고 `file:` 스킴을 동일 경로로 지원하기 위함이다.

### M4 — 시드 절차 (Priority: Medium, 결정 가역성: 중간)

**대상**: REQ-RUNTIME-004, REQ-RUNTIME-005

- `scripts/db-seed.ts` (신규): **첫 동작으로 M1-b의 `cli-bootstrap`을 경유**해 `.env.local`을 명시 로드한 뒤(개정 v0.3.0, REQ-RUNTIME-021) `db` 스코프로 검증한다. 이어서 `db/seed/evidence.json`을 읽어 `evidence` 테이블에 적재. `package.json`에 `db:seed` 추가.
- **idempotency (REQ-RUNTIME-005)**: seed 레코드는 안정적 `id`(`seed-evidence-001` 등)를 이미 가지고 있으므로, Drizzle의 `onConflictDoUpdate`(또는 `onConflictDoNothing`)를 `id` 기준으로 적용한다. 재실행 시 행 수가 불변이어야 한다.
- `createdAt`은 스키마상 `notNull`이므로 시드 시점 타임스탬프를 채운다. 재실행 시 `createdAt`을 덮어쓸지 여부는 구현 판단에 맡기되, 행 수 불변 조건은 반드시 만족해야 한다.
- **범위 경계**: `lib/pipeline/evidence-retriever.ts`가 JSON을 직접 읽는 현행 동작은 **변경하지 않는다**(REQ-RUNTIME-019). 이번 SPEC은 DB에 데이터를 넣는 절차를 제공할 뿐, 파이프라인의 조회 경로를 DB로 전환하지 않는다 — 그 전환은 후속 SPEC 사안이다.

### M5 — E2E 하네스 + 시나리오 (Priority: High, 결정 가역성: 중간) *(개정 v0.2.0)*

**대상**: REQ-RUNTIME-012 ~ REQ-RUNTIME-017

- **도구 선택: Playwright** (사용자가 plan.md 판단에 위임한 항목, 개정으로 변경 없음). 근거: 검증 대상 시나리오가 로그인 폼 제출·페이지 렌더링·서버 액션(feedback) 등 브라우저 경유 흐름을 포함하므로, HTTP 레벨 통합 테스트로는 실제 사용자 경로를 재현할 수 없다. 대안 비교는 `research.md` §4.
- **`scripts/run-e2e.ts` (신규) — `pnpm test:e2e`의 실제 진입점**. 다음 순서를 이 스크립트가 **전부 소유**한다:
  1. 임시 시크릿 생성(`BETTER_AUTH_SECRET`, `TESTER_PASSWORD` — 후자는 8자 이상)
  2. E2E 환경 집합을 자기 자신의 `process.env`에 조립(`TURSO_DATABASE_URL=file:./.tmp/e2e.db`, `BETTER_AUTH_URL=http://localhost:3000` 등)
  3. `lib/env.ts`의 `e2e` 스코프 검증 통과
  4. `.tmp/e2e.db` 초기화 → 마이그레이션(M3 함수) → 시드(M4 함수) → 테스터 A·B 프로비저닝(M2 함수)
  5. 위 환경 그대로 Playwright를 **자식 프로세스로 spawn**
- **개정 이유 — 라이프사이클 가정 제거**: 초판은 `e2e/global-setup.ts`가 시크릿을 생성하고 그 값이 Playwright `webServer`가 띄우는 Next.js 프로세스까지 상속된다고 **가정**했다. `globalSetup`과 `webServer`는 서로 다른 훅이며 실행 순서·환경 전파는 프레임워크 내부 동작이다. 가정이 깨지면 서버는 시크릿 A로 세션을 서명하고 테스트는 시크릿 B로 로그인하므로, 원인이 드러나지 않는 인증 실패로만 나타난다. 개정 설계에서는 Playwright 러너와 Next.js 서버가 **같은 조상 프로세스의 환경을 상속**하므로 서로 다른 값을 볼 경로가 존재하지 않는다(REQ-RUNTIME-016의 "보장" 요구). DB 준비도 Playwright 기동 **전에** 끝나므로 "서버가 먼저 떠서 빈 DB를 본다"는 실패 양상이 구조적으로 제거된다.
- **`e2e/global-setup.ts`는 만들지 않는다** — 훅을 하나 없애는 것이 곧 순서 가정을 하나 없애는 것이다.
- `playwright.config.ts` (신규): `webServer` 옵션으로 `pnpm build && pnpm start`를 자동 기동/종료한다. **`webServer.env`에 시크릿을 다시 적지 않는다** — 자식은 부모 환경을 상속하므로 재기재는 중복이며, 두 곳에 값이 존재하면 어느 쪽이 실효인지 모호해진다.
- **E2E 전용 DB (REQ-RUNTIME-017)**: `TURSO_DATABASE_URL=file:./.tmp/e2e.db`. M1의 `file:` capability gate가 이를 가능하게 한다. `.tmp/`가 이미 무시되는지 확인하고, 덮이지 않는 경우에만 `.gitignore`에 추가한다 — 실측상 기존 `*.tmp` 글롭(`.gitignore:108`)이 `.tmp/e2e.db`를 이미 덮으므로 추가는 불필요할 가능성이 높다(`research.md` §0).
- **구조적 env 공유 검증 (신규 v0.3.0, REQ-RUNTIME-016 / AC-RUNTIME-022)**: `scripts/run-e2e.ts`의 자식 프로세스 생성 지점을 **주입 가능한 형태**로 분리하고(예: spawn 함수를 인자로 받는 실행 함수), Vitest 단위 테스트가 **기록용 대역**을 주입해 각 호출에 전달된 env 객체를 수집·단언한다. 단언 대상: Playwright 러너와 앱 서버에 전달된 env가 `BETTER_AUTH_SECRET`·`TESTER_PASSWORD`·`TURSO_DATABASE_URL`·`BETTER_AUTH_URL`에 대해 동일 값이고, 진입점이 조립한 값과 일치하며, DB URL이 `file:` 스킴일 것.
  - **개정 이유 — 과잉주장 제거**: 초판·v0.2.0은 "로그인 시나리오가 통과한다는 사실 자체가 시크릿 일치를 **입증한다**"고 기술했다. 이는 논리적 과잉이다 — 로그인 성공은 인증 흐름이 동작한다는 증거이지 특정 환경변수 **값의 동일성**에 대한 직접 증거가 아니며, "불일치했다면 실패했을 것"이라는 역추론은 로그인을 성공시킬 다른 경로(세션 쿠키 재사용, 캐시된 세션, 재시도)가 모두 배제되었을 때만 성립하는데 이 SPEC은 그 배제를 확보하지 않았다. 근본 문제는 **관측 지점과 주장 지점의 불일치**이므로, 주장이 "전달된 env가 같다"라면 관측도 전달된 env여야 한다(`design.md` §3.5).
  - **[HARD] Playwright 불필요**: 이 검증은 브라우저·앱 기동 없이 `pnpm test`에서 통과해야 한다(REQ-RUNTIME-018 유지). 로그인 성공 여부를 이 검증의 증거로 사용하는 것은 금지한다.
  - **검증 범위는 넓어진다**: 기존에 간접 추론뿐이던 구조적 성질에 직접 관측이 추가되고, Playwright 시험은 자신이 실제로 증명하는 것(인증 흐름의 동작)만 주장하게 된다.
- **`.env.local` 우선순위 시험의 sentinel 고정 (신규 v0.3.0, AC-RUNTIME-015)**: AC-RUNTIME-015 검증 시 `.env.local`에 넣는 원격 자격증명은 **반드시 sentinel 값**이어야 한다 — `TURSO_DATABASE_URL=libsql://sentinel-nonexistent-host.invalid` + 형태만 갖춘 더미 토큰.
  - **[HARD] 실제 자격증명 금지**: 검증 대상 명제가 "상속된 값이 `.env.local`을 이긴다"인데, 그 명제가 거짓이면 시험 자체가 **실제 프로덕션 Turso에 연결·기록**한다 — 검증 절차가 REQ-RUNTIME-017이 막으려는 사고를 스스로 유발하는 구조다. `.invalid` TLD는 RFC 2606 §2가 예약하고 RFC 6761 §6.4가 즉시 부정 응답을 규정하므로 실패가 규격상 보장된다(`research.md` §0.2 결론 3).
  - **가정 붕괴 시의 해석**: sentinel 호스트에 대한 연결/DNS 실패는 네트워크 장애가 아니라 **우선순위 역전의 진단 신호**다 — `design.md` §6의 명시적 조치(로드 이후 재덮어쓰기 또는 `.env.local` 로드 회피)를 도입하라는 신호로 다룬다.
- **시나리오 파일**:
  - `e2e/auth.spec.ts` — 등록 테스터 로그인 성공 + 미등록 이메일 로그인 거부 (REQ-RUNTIME-012). **주장 범위**: 인증 흐름의 동작만 주장하며 시크릿 값 동일성은 주장하지 않는다(그것은 위 구조적 검증의 몫).
  - `e2e/case-flow.spec.ts` — 사건 입력 → `/api/cases` → DB 저장 → 리포트 조회 (REQ-RUNTIME-013), 피드백 저장 (REQ-RUNTIME-014)
  - `e2e/tenant-isolation.spec.ts` — 사용자 B의 사용자 A 사건 접근 차단 (REQ-RUNTIME-015)
- **셀렉터 정책**: 현행 마크업 의존을 최소화하기 위해 `data-testid`를 필요한 지점에만 부착한다. UI 구조·스타일 변경은 금지(§A.4 PRESERVE).
- `package.json`에 `test:e2e` 추가(→ `scripts/run-e2e.ts` 실행). `pnpm test`(Vitest)는 E2E를 포함하지 않도록 분리한다 — Vitest가 `e2e/**`를 수집하지 않게 `vitest.config.ts`의 exclude를 확인/조정한다.

### M6 — 런북 문서화 (Priority: Medium, 기계적 작업)

**대상**: REQ-RUNTIME-020

- `.moai/docs/runtime-runbook.md` (신규) 또는 `README.md` 확장: 연결 → 마이그레이션 → 시드 → 테스터 생성 → E2E 실행 절차를 순서대로 기술한다.
- `.env.local.example` 갱신: `file:` 스킴 로컬 모드 예시 주석 추가, `TESTER_PASSWORD`(선택, 비대화형 프로비저닝용) 항목 추가, **각 변수가 어떤 실행 목적(스코프)에 필요한지 표기**(M1 개정 반영 — `design.md` §3.1 매트릭스와 일치시킨다). `GEMINI_API_KEY`에는 "이번 SPEC의 앱 기동에는 요구되지 않음(파이프라인 mock)"을 주석으로 명시한다. **모든 값은 플레이스홀더**(REQ-RUNTIME-008).
- **`.env.local`만 채우면 된다는 사실 명시 (개정 v0.3.0)**: 런북은 마이그레이션·시드·테스터 생성 단계에서 운영자가 **셸에 환경변수를 export할 필요가 없고 `.env.local` 기입만으로 충분하다**는 점을 명시한다 — 세 스크립트가 `cli-bootstrap`을 통해 파일을 명시 로드하기 때문이다(`design.md` §3.2.2). 이 설명이 없으면 운영자는 "스크립트니까 셸 export가 필요하겠지"라고 추측해 불필요한 절차를 만들고, 그 과정에서 시크릿이 셸 히스토리에 남는다.
- 실제 시크릿은 문서 어디에도 기재하지 않으며, 운영자가 Turso 대시보드·Google AI Studio에서 직접 발급받는 경로만 안내한다.

## §D. 기술적 접근 (Technical Approach)

- **활성화 계층 추가, 기존 계층 불변**: 신규 코드는 `lib/env.ts`, `scripts/`, `e2e/`, `instrumentation.ts`에 집중된다. 기존 `lib/`·`app/` 코드는 `lib/db/client.ts`의 검증 위임과 E2E `data-testid` 부착 외에는 손대지 않는다.
- **환경변수 검증 단일 모듈 · 목적별 스코프**: `lib/env.ts`가 앱 부팅·스크립트·E2E 진입점 모두의 공통 관문이 된다. 검증 로직이 여러 파일로 분기하면 한쪽만 갱신됐을 때 우회 경로가 생기므로 **모듈은 하나**로 두되, 그 안에서 **목적별 스코프**로 요구 집합을 나눈다(개정 v0.2.0). 단일 모듈과 목적별 스코프는 상충하지 않는다 — 전자는 로직의 소재지, 후자는 요구 집합의 범위에 관한 결정이다.
- **라이브러리 내부 규약보다 공식 API 우선**: 프로비저닝은 Better Auth의 공식 서버 API를 경유한다(개정 v0.2.0). 내부 스키마·해시 규약을 호출 측이 추정하면 그 추정은 라이브러리 업그레이드마다 재검증 대상이 된다.
- **프레임워크 라이프사이클 가정보다 프로세스 계보 우선**: E2E 시크릿 일치는 테스트 프레임워크의 훅 실행 순서가 아니라, 자식 프로세스가 부모 환경을 상속한다는 성질로 보장한다(개정 v0.2.0).
- **프레임워크가 해주는 일에 프레임워크 밖에서 기대지 않는다** *(개정 v0.3.0)*: Next.js의 자동 `.env.local` 로딩은 `next build`/`start`/`dev` 경로의 동작이므로, 독립 실행 스크립트는 로드를 **스스로 명시 호출**한다(`design.md` §3.2.2). 이는 바로 위 항목과 **같은 원칙의 다른 적용**이다 — 통제하지 않는 동작을 전제로 삼지 않는다.
- **관측 지점과 주장 지점을 일치시킨다** *(개정 v0.3.0)*: 어떤 성질을 주장하려면 그 성질 자체를 관측한다. "전달된 env가 같다"를 주장하려면 전달된 env를 관측해야 하며, 하류 효과(로그인 성공)로부터의 역추론은 다른 원인이 모두 배제되었을 때만 증거가 된다 — 이 SPEC은 그 배제를 확보하지 않았다(`design.md` §3.5).
- **검증 절차가 검증 대상 위험을 유발하지 않는다** *(개정 v0.3.0)*: 우선순위 시험은 가정이 틀렸을 때 실제 원격 DB에 도달하지 못하도록 sentinel 값으로만 수행한다. 가정이 참일 때만 안전한 시험은 그 가정을 검증하는 데 쓸 수 없다(`design.md` §3.4).
- **시크릿 취급 원칙**: 값은 프로세스 환경 또는 대화형 입력으로만 들어오고, 디스크에 남는 곳은 gitignore된 `.env.local`뿐이다. 로그·오류 메시지·커밋 파일에는 값이 나타나지 않는다.
- **TDD 적용**: `lib/env.ts`, `scripts/*.ts`는 Vitest 단위 테스트로 RED→GREEN을 밟는다. E2E 스펙 자체는 검증 수단이므로 TDD 사이클 대상이 아니라 결과물이다.
- **idempotency는 라이브러리/DB 제약에 위임**: 마이그레이션은 `__drizzle_migrations`, 시드는 `onConflict`, 프로비저닝은 사전 조회 + 라이브러리 중복 차단 + `unique` 제약. 자체 상태 추적 테이블을 새로 만들지 않는다.

## §E. 위험 (Risks)

| 위험 | 영향 | 완화 |
|------|------|------|
| `auth.api.signUpEmail`이 libSQL/Drizzle 어댑터 조합에서 기대대로 동작하지 않음 (내부 트랜잭션 등) | 프로비저닝 실패 또는 계정은 생기나 로그인 미성립 | **탐지**: AC-RUNTIME-007을 "행이 생성됨"이 아니라 "실제 로그인 성공"으로 정의해 이 위험을 검증 대상으로 끌어올린다(개정 후에도 불변). **폴백 트리거(개정)**: 비마운트 인스턴스에서의 `signUpEmail` 호출이 **기술적으로 불가능함이 확인된 경우에만** 폴백한다 — 런타임 실패 횟수는 트리거가 아니다(공식 API 경로는 확률적으로 실패하는 성질이 아니므로, 실패는 구현 결함 신호로 다루고 수정한다). **사전 승인된 폴백**: `research.md` §3의 경로 B(admin 플러그인 `createUser`) → 경로 C(내부 crypto + 직접 INSERT) 순. 둘 다 **스크립트 전용 인스턴스에 한정**하며 프로덕션 `lib/auth/config.ts`는 손대지 않는다. 이 제약이 지켜지는 한 폴백은 아키텍처 경계(REQ-RUNTIME-019)를 침범하지 않으므로 재-plan 없이 진행할 수 있다. 폴백 선택 시 불가능성을 확정한 관측을 `progress.md` §E.2에 기록한다 |
| 프로비저닝 전용 인증 인스턴스가 실수로 HTTP 라우트에 마운트되거나 `scripts/` 밖으로 export됨 | 공개 셀프 가입 표면이 열림 — 초대 전용 접근 제어(REQ-SCAFFOLD-009 계보)가 무력화 | **정적 검증**: AC-RUNTIME-017 (4)항이 인스턴스의 비노출을 검사한다. **표식**: 스크립트에 `@MX:WARN` 부착(§F). **설계 고정**: `design.md` §3.2.1이 export 금지·라우트 전달 금지를 설계 제약으로 명시 |
| `file:` 스킴에서 통과한 E2E가 원격 Turso에서 실패 | 로컬 그린 ≠ 실환경 그린 | 런북(M6)에 원격 Turso 대상 수동 확인 절차를 명시하고, `spec.md` §5 잔여 위험으로 기록 |
| Playwright 도입에 따른 CI/로컬 브라우저 바이너리 설치 부담 | `pnpm test:e2e` 최초 실행 실패 | 런북에 `pnpm exec playwright install --with-deps chromium` 선행 단계 명시, 브라우저는 chromium 단일로 제한 |
| Vitest가 `e2e/**`를 수집해 `pnpm test`가 깨짐 | REQ-RUNTIME-018 위반 | M5에서 `vitest.config.ts` exclude를 명시적으로 확인/조정하고, `pnpm test` 통과를 M5 완료 조건에 포함 |
| `instrumentation.ts` 부팅 검증이 `pnpm build` 단계에서 환경변수 없이 실행되어 빌드를 깨뜨림 | REQ-RUNTIME-018 위반 | 빌드 타임과 런타임 부팅을 구분한다 — M1에서 실측 확인 후, 충돌 시 **빌드 단계에서만 검증을 건너뛰고 런타임 부팅 훅에서는 항상 검증**한다. 검증 시점을 런타임 첫 요청 경계로 미루는 조정은 금지(REQ-RUNTIME-010이 요구하는 부팅 시점 fail-fast를 무효화). 상세: `design.md` §6. 목적별 스코프 개정은 이 완화를 바꾸지 않는다 — `app` 스코프의 요구 집합이 줄었을 뿐 검증 시점은 동일하다 |
| 독립 실행 스크립트(4개 전부)를 현행 Node.js에서 TypeScript로 실행하는 수단이 마땅치 않음 *(v0.3.0에서 범위 확장 — E2E 진입점만의 문제가 아님)* | `db:migrate`/`db:seed`/`tester:add`/`test:e2e` 최초 실행 실패 | **M1-a에서 `node --version`을 먼저 실측**한다. 실측상 `node_modules/.bin/tsx`가 없고 `--experimental-strip-types`는 Node 22.6+ 기능이라 `tech.md`의 Node 20.x LTS 하한에서는 성립하지 않는다(`research.md` §0.2). (a) 타입 스트리핑 직접 실행 또는 (b) `tsx` 직접 devDependency 선언 중 하나로 확정하되, **새 런타임 의존성 추가는 다른 경로가 없을 때만** 허용한다(`spec.md` §3). (b)를 택해도 `tsx@4.23.12`는 이미 스토어에 존재하므로 §3 "의존성 추가의 허용 범위"를 벗어나지 않는다. 상세: `design.md` §6 |
| **`@next/env`가 pnpm strict 레이아웃에서 프로젝트 코드로 import 불가** *(v0.3.0 신설, 최우선)* | 세 CLI 스크립트(M2/M3/M4)가 전부 `MODULE_NOT_FOUND`로 기동 불가 — 부트스트랩 설계 전체가 무효 | **탐지**: 실측 완료 — 루트 `node_modules/@next/` 부재 + `.npmrc` hoisting 설정 부재를 확인했다(`research.md` §0.2). **완화**: M1-a에서 `pnpm add -D @next/env@16.3.2`(`next`와 동일 버전 고정)를 **가장 먼저** 수행하고 실제 import 성공을 실측한 뒤 M1-b로 진행한다. 이 순서를 지키지 않으면 M2/M3/M4가 모두 기동 불가 상태로 "완성"된다. **버전 어긋남 금지**: 버전이 `next`와 다르면 앱 부팅 경로와 스크립트 경로가 서로 다른 로더를 쓰게 되어 같은 `.env.local`이 다르게 해석될 수 있다 |
| **우선순위 시험이 개발자의 실제 Turso 인스턴스를 오염** *(v0.3.0에서 해소)* | 검증 절차 자체가 REQ-RUNTIME-017이 막으려는 사고를 유발 | **해소됨**: AC-RUNTIME-015의 `.env.local` Given을 실제 자격증명 → **비라우팅 sentinel**(`.invalid` TLD, RFC 2606 §2 예약 + RFC 6761 §6.4 즉시 부정 응답)로 교체해 실제 DB 도달 경로 자체를 제거했다. **잔여 위험은 오진**이다 — 우선순위 역전 시 증상이 "sentinel 호스트 연결 실패"로 나타나 네트워크 장애로 오해할 수 있다. AC-RUNTIME-015 Then이 이 실패를 **진단 신호로 해석하라**고 명시해 완화 |

## §F. MX 태그 계획

### @MX:ANCHOR 후보 (높은 fan-in 예상)
- `lib/env.ts` — 목적별 환경설정 검증 관문: 앱 부팅(`instrumentation.ts`), 3개 운영 스크립트, E2E 진입점이 모두 의존. 스코프 열거형 변경은 전 호출부에 파급된다.
- `scripts/cli-bootstrap.ts` *(신규 v0.3.0)* — 독립 실행 스크립트 4개가 모두 경유하는 **환경 로드 단일 진입점**. `@MX:REASON`으로 두 가지를 명시한다: (1) **로드 → 검증 순서는 뒤집을 수 없다**(검증은 로드된 값을 판정하므로), (2) **로드 호출을 다른 파일로 복제하면 로드 경로가 갈라진다**(REQ-RUNTIME-021의 단일 정의 요건).

### @MX:WARN 후보
- `scripts/provision-tester.ts` — **셀프 가입이 허용된 전용 Better Auth 인스턴스**를 생성하는 지점. 이 인스턴스를 HTTP 라우트에 마운트하거나 `scripts/` 밖으로 export하면 공개 가입 표면이 열린다는 점을 `@MX:REASON`으로 명시한다(`design.md` §3.2.1).
- `scripts/run-e2e.ts` — 실행 시점 시크릿을 생성해 자식 프로세스로 상속시키는 지점. 이 값들을 로그·리포터·아티팩트로 출력하면 REQ-RUNTIME-008을 위반한다는 점을 명시한다.

### @MX:NOTE 후보
- `scripts/db-seed.ts` — `evidence-retriever.ts`가 여전히 JSON을 직접 읽는다는 사실(현행 유지 결정)과 그 이유를 기록.

## §G. Anti-Patterns (이번 SPEC에서 금지)

- 파이프라인 mock 구현을 "이왕 하는 김에" 실제 LLM 호출로 교체하기 — `spec.md` §4 위반.
- `lib/db/schema.ts`를 수정해 마이그레이션 재생성을 유발하기 — PRESERVE 위반이며 기존 마이그레이션 적용 절차 검증을 무의미하게 만든다.
- 비밀번호를 CLI 인자·설정 파일·픽스처 파일에 기록하기 — REQ-RUNTIME-008 위반.
- E2E를 위해 UI를 재작성하기 — `data-testid` 부착 외 변경은 out of scope.
- 자체 마이그레이션 상태 추적 테이블 신설 — Drizzle이 이미 제공하는 기능의 재구현.
- **프로덕션 `lib/auth/config.ts`의 `disableSignUp`를 끄거나 일시 토글하기** — 프로비저닝은 전용 인스턴스로 해결한다(`research.md` §3 경로 A는 폴백에서도 제외).
- **프로비저닝 인스턴스를 라우트·핸들러에 연결하거나 `scripts/` 밖으로 export하기** — 공개 가입 표면이 열린다(AC-RUNTIME-017).
- **E2E 시크릿을 `playwright.config.ts`의 `webServer.env`에 다시 적기** — 상속으로 이미 전달되며, 두 곳에 값이 존재하면 어느 쪽이 실효인지 모호해진다(`design.md` §3.4).
- **`e2e/global-setup.ts`를 되살려 시크릿 생성이나 DB 준비를 옮기기** — 개정이 제거한 라이프사이클 순서 가정을 재도입한다(`research.md` §4).
- **소비하지 않는 변수를 스코프의 필수 항목으로 넣기** — 특히 `GEMINI_API_KEY`를 `app` 스코프 필수로 되돌리는 것. 형식적 관문은 검증이 아니다(`design.md` §3.1 각주).
- **독립 실행 스크립트가 `.env.local` 로딩을 프레임워크에 기대기** *(신설 v0.3.0)* — Next.js의 자동 로딩은 `next build`/`start`/`dev` 경로의 동작이며 `tsx`/`node` 실행 스크립트에는 적용되지 않는다. 반드시 `cli-bootstrap`을 경유해 명시 로드한다(REQ-RUNTIME-021).
- **`cli-bootstrap` 밖에서 `.env.local` 로드를 재구현하기** *(신설 v0.3.0)* — 스크립트마다 로드를 복제하면 한쪽만 갱신됐을 때 경로가 갈라진다. `lib/env.ts`를 단일 검증 관문으로 두는 것과 같은 이유다.
- **자체 dotenv 파서 작성하기** *(신설 v0.3.0)* — 따옴표·이스케이프·다중행·변수 치환 규칙을 재구현하는 일이며, 프레임워크와 **의미가 갈라질 수 있는 두 번째 파서**를 만든다(`spec.md` §3 overengineering 금지). 이미 트리에 있는 `@next/env`를 명시 선언해 재사용한다.
- **검증(`validateEnv`)을 로드보다 먼저 호출하기** *(신설 v0.3.0)* — 검증은 로드된 값을 판정하므로, 순서가 뒤집히면 항상 "누락"을 보고하고 프로세스가 그 시점에 종료된다.
- **AC 검증에 실제로 동작하는 원격 Turso 자격증명 사용하기** *(신설 v0.3.0)* — 특히 AC-RUNTIME-015의 우선순위 시험. 가정이 틀렸을 때 실제 프로덕션 인스턴스에 기록하게 되며, 이는 REQ-RUNTIME-017이 막으려는 사고 그 자체다. sentinel 값만 사용한다(`spec.md` §3).
- **로그인 성공을 `BETTER_AUTH_SECRET` 동일성의 증거로 삼기** *(신설 v0.3.0)* — 관측 대상(인증 흐름의 결과)과 주장 대상(env 값의 동일성)이 다르다. 시크릿 공유는 전달된 env 객체를 직접 관측해 검증한다(AC-RUNTIME-022).

## §H. Cross-References

- `spec.md` §2 (REQ-RUNTIME-001 ~ 021), §4 (Out of Scope — 개정 v0.2.0/v0.3.0에서 변경 없음)
- `acceptance.md` (AC-RUNTIME-001 ~ 022)
- `design.md` (신규 계층 경계 및 데이터 흐름)
- `research.md` (현행 코드베이스 실측 근거 + 절차별 대안 비교)
- `.claude/rules/moai/workflow/spec-workflow.md` § SPEC Complexity Tier (Tier L 판정 기준), § SPEC Phase Discipline (Route B)
