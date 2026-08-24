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
| 영향 파일 수 | 약 16-18개 (env 모듈 2 + 스크립트 3 + 스크립트 테스트 3 + E2E 설정/스펙/픽스처 5 + `package.json` + `.env.local.example` + `lib/db/client.ts` 수정 + 런북 문서 + `.gitignore`) | > 15 → **L** |
| 신규 LOC | 약 800-1,200 | 경계 (M/L) |
| 도메인 수 | DB 마이그레이션 · 시드 · 인증/시크릿 프로비저닝 · 환경 검증 · E2E 하네스 = 5 | 다중 도메인 |
| 보안 경계 | 인증 계정 생성 + 시크릿 취급 경로 신설 | L 쪽으로 기울임 |

파일 수가 Tier M 밴드(5-15)를 초과하고, 인증 계정 생성이라는 보안 경계를 신설하므로 **Tier L**로 분류한다. 다만 아키텍처 변경이 없는 활성화 SPEC이므로 REQ 20 / AC 19로 상한(25/25) 대비 여유를 두고 타이트하게 유지한다.

### §A.2 PRESERVE 목록 (수정 금지)

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

### M1 — 환경변수 검증 계약 (Priority: High, 결정 가역성: 높음)

**대상**: REQ-RUNTIME-003, REQ-RUNTIME-010, REQ-RUNTIME-011

- `lib/env.ts` (신규): Zod 스키마 기반 환경변수 검증 모듈. 필수 변수(`TURSO_DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GEMINI_API_KEY`)와 조건부 필수 변수(`TURSO_AUTH_TOKEN`)를 구분한다.
- **`file:` 스킴 capability gate (REQ-RUNTIME-003)**: `TURSO_DATABASE_URL`이 `file:`로 시작하면 `TURSO_AUTH_TOKEN`을 선택(optional)으로, `libsql://`/`https://`로 시작하면 필수로 판정한다. 현행 `lib/db/client.ts`는 두 변수를 무조건 요구하므로 로컬 파일 DB 사용이 불가능하다 — 이 게이트가 E2E(M5)의 전제 조건이다.
- 오류 메시지는 **변수명 + 필요 이유 + 획득 경로**를 담고, **값은 절대 포함하지 않는다**(REQ-RUNTIME-011). 예: `TURSO_DATABASE_URL이 없습니다 — Drizzle이 접속할 libSQL 인스턴스 주소입니다. Turso 대시보드 또는 로컬 파일 경로(file:./.tmp/dev.db)를 지정하세요.`
- 부팅 시점 fail-fast 지점: Next.js `instrumentation.ts`의 `register()` 훅에서 검증 함수를 호출한다. 지연 실패(첫 DB 접근 시점)를 부팅 실패로 앞당기는 것이 이 마일스톤의 목적이다.
- `lib/db/client.ts`는 자체 인라인 검사 대신 `lib/env.ts`를 경유하도록 최소 수정한다. **기존 `getDb()` 싱글턴 지연 생성 패턴은 유지**한다 — `lib/auth/config.ts` §@MX:ANCHOR가 설명하듯, 모듈 최상위 즉시 생성은 `pnpm build`와 단위 테스트를 깨뜨린다.
- **가장 먼저 검토하는 이유**: `EnvConfig` 타입과 필수/조건부 변수 분류는 이후 모든 스크립트·E2E·부팅 경로가 의존하는 계약이며, 변경 시 파급 범위가 가장 크다.

### M2 — 테스터 프로비저닝 (Priority: High, 결정 가역성: 높음)

**대상**: REQ-RUNTIME-006, REQ-RUNTIME-007, REQ-RUNTIME-008, REQ-RUNTIME-009

- `scripts/provision-tester.ts` (신규): 운영자용 CLI. `pnpm tester:add -- --email <이메일>` 형태로 실행.
- **비밀번호 수령 경로 (REQ-RUNTIME-008)**: 다음 두 경로만 허용한다.
  1. 대화형 프롬프트(TTY, 입력 에코 없음) — 기본 경로
  2. 환경변수 `TESTER_PASSWORD` — 비대화형(CI/E2E 픽스처) 경로
  CLI 인자로 비밀번호를 받는 경로는 **제공하지 않는다**(셸 히스토리·프로세스 목록에 남기 때문).
- **계정 생성 방식**: `better-auth/crypto`의 `hashPassword()`로 해시한 뒤 `user` + credential `account` 행을 Drizzle로 직접 삽입한다. `disableSignUp: true`는 그대로 유지되며, 셀프 가입 경로는 열리지 않는다(REQ-RUNTIME-007). 상세 근거와 대안 비교는 `research.md` §3.
- **동작 순서**: `allowed_testers` 등록(REQ-RUNTIME-006) → `user` 생성 → credential `account` 생성. allowlist 등록이 선행되어야 `lib/auth/config.ts`의 `databaseHooks.session.create.before`가 세션 생성을 허용한다.
- **재실행 안전성 (REQ-RUNTIME-009)**: 이메일 기준 조회 후 존재하면 `user`/`account` 행을 새로 만들지 않는다. `allowed_testers.email`과 `user.email`은 이미 `unique` 제약이 걸려 있어 DB 레벨 방어도 존재한다.
- **보안 결정이 운영자 흐름에 직접 노출되므로 M1 다음 우선순위**로 검토한다.

### M3 — 마이그레이션 적용 절차 (Priority: High, 결정 가역성: 중간)

**대상**: REQ-RUNTIME-001, REQ-RUNTIME-002

- `scripts/db-migrate.ts` (신규): `drizzle-orm/libsql/migrator`의 `migrate()`를 사용해 `db/migrations/`를 적용한다. 해당 모듈은 `node_modules/drizzle-orm/libsql/migrator.js`에 존재함을 실측 확인했다(`research.md` §2).
- `package.json`에 `db:migrate` 스크립트 추가. 기존 `db:generate`는 그대로 둔다.
- **idempotency (REQ-RUNTIME-002)**: Drizzle migrator는 `__drizzle_migrations` 추적 테이블로 적용 이력을 관리하므로 재실행이 no-op이 된다. 이 동작을 코드로 재구현하지 않고 라이브러리 보장에 의존하되, AC로 실제 재실행 결과를 검증한다.
- 프로그래매틱 러너를 선택한 이유(대안: `drizzle-kit migrate` CLI)는 `research.md` §2에 기록한다 — 요지는 M1의 `lib/env.ts` 검증을 동일하게 통과시키고 `file:` 스킴을 동일 경로로 지원하기 위함이다.

### M4 — 시드 절차 (Priority: Medium, 결정 가역성: 중간)

**대상**: REQ-RUNTIME-004, REQ-RUNTIME-005

- `scripts/db-seed.ts` (신규): `db/seed/evidence.json`을 읽어 `evidence` 테이블에 적재. `package.json`에 `db:seed` 추가.
- **idempotency (REQ-RUNTIME-005)**: seed 레코드는 안정적 `id`(`seed-evidence-001` 등)를 이미 가지고 있으므로, Drizzle의 `onConflictDoUpdate`(또는 `onConflictDoNothing`)를 `id` 기준으로 적용한다. 재실행 시 행 수가 불변이어야 한다.
- `createdAt`은 스키마상 `notNull`이므로 시드 시점 타임스탬프를 채운다. 재실행 시 `createdAt`을 덮어쓸지 여부는 구현 판단에 맡기되, 행 수 불변 조건은 반드시 만족해야 한다.
- **범위 경계**: `lib/pipeline/evidence-retriever.ts`가 JSON을 직접 읽는 현행 동작은 **변경하지 않는다**(REQ-RUNTIME-019). 이번 SPEC은 DB에 데이터를 넣는 절차를 제공할 뿐, 파이프라인의 조회 경로를 DB로 전환하지 않는다 — 그 전환은 후속 SPEC 사안이다.

### M5 — E2E 하네스 + 시나리오 (Priority: High, 결정 가역성: 중간)

**대상**: REQ-RUNTIME-012 ~ REQ-RUNTIME-017

- **도구 선택: Playwright** (사용자가 plan.md 판단에 위임한 항목). 근거: 검증 대상 시나리오가 로그인 폼 제출·페이지 렌더링·서버 액션(feedback) 등 브라우저 경유 흐름을 포함하므로, HTTP 레벨 통합 테스트로는 실제 사용자 경로를 재현할 수 없다. 대안 비교는 `research.md` §4.
- `playwright.config.ts` (신규): `webServer` 옵션으로 `pnpm build && pnpm start`를 자동 기동/종료하여 **단일 명령 재현성**(REQ-RUNTIME-016)을 확보한다.
- **E2E 전용 DB (REQ-RUNTIME-017)**: `TURSO_DATABASE_URL=file:./.tmp/e2e.db`를 E2E 환경에 주입한다. M1의 `file:` capability gate가 이를 가능하게 한다. 실행 전 DB 파일을 초기화하고 마이그레이션(M3) + 시드(M4) + 테스터 2명 프로비저닝(M2, 비밀번호는 글로벌 셋업이 실행 시점에 생성 — `design.md` §3.4)을 글로벌 셋업에서 수행한다. `.tmp/`가 이미 무시되는지 확인하고, 덮이지 않는 경우에만 `.gitignore`에 추가한다 — 실측상 기존 `*.tmp` 글롭(`.gitignore:108`)이 `.tmp/e2e.db`를 이미 덮으므로 추가는 불필요할 가능성이 높다(`research.md` §0).
- **시나리오 파일**:
  - `e2e/auth.spec.ts` — 등록 테스터 로그인 성공 + 미등록 이메일 로그인 거부 (REQ-RUNTIME-012)
  - `e2e/case-flow.spec.ts` — 사건 입력 → `/api/cases` → DB 저장 → 리포트 조회 (REQ-RUNTIME-013), 피드백 저장 (REQ-RUNTIME-014)
  - `e2e/tenant-isolation.spec.ts` — 사용자 B의 사용자 A 사건 접근 차단 (REQ-RUNTIME-015)
  - `e2e/global-setup.ts` — DB 초기화·마이그레이션·시드·테스터 프로비저닝
- **셀렉터 정책**: 현행 마크업 의존을 최소화하기 위해 `data-testid`를 필요한 지점에만 부착한다. UI 구조·스타일 변경은 금지(§A.2 PRESERVE).
- `package.json`에 `test:e2e` 추가. `pnpm test`(Vitest)는 E2E를 포함하지 않도록 분리한다 — Vitest가 `e2e/**`를 수집하지 않게 `vitest.config.ts`의 exclude를 확인/조정한다.

### M6 — 런북 문서화 (Priority: Medium, 기계적 작업)

**대상**: REQ-RUNTIME-020

- `.moai/docs/runtime-runbook.md` (신규) 또는 `README.md` 확장: 연결 → 마이그레이션 → 시드 → 테스터 생성 → E2E 실행 절차를 순서대로 기술한다.
- `.env.local.example` 갱신: `file:` 스킴 로컬 모드 예시 주석 추가, `TESTER_PASSWORD`(선택, 비대화형 프로비저닝용) 항목 추가. **모든 값은 플레이스홀더**(REQ-RUNTIME-008).
- 실제 시크릿은 문서 어디에도 기재하지 않으며, 운영자가 Turso 대시보드·Google AI Studio에서 직접 발급받는 경로만 안내한다.

## §D. 기술적 접근 (Technical Approach)

- **활성화 계층 추가, 기존 계층 불변**: 신규 코드는 `lib/env.ts`, `scripts/`, `e2e/` 세 곳에 집중된다. 기존 `lib/`·`app/` 코드는 `lib/db/client.ts`의 검증 위임과 E2E `data-testid` 부착 외에는 손대지 않는다.
- **환경변수 검증 단일 진입점**: `lib/env.ts`가 앱 부팅·스크립트·E2E 셋업 모두의 공통 관문이 된다. 검증 로직이 세 곳으로 분기하면 한쪽만 갱신됐을 때 우회 경로가 생긴다.
- **시크릿 취급 원칙**: 값은 프로세스 환경 또는 대화형 입력으로만 들어오고, 디스크에 남는 곳은 gitignore된 `.env.local`뿐이다. 로그·오류 메시지·커밋 파일에는 값이 나타나지 않는다.
- **TDD 적용**: `lib/env.ts`, `scripts/*.ts`는 Vitest 단위 테스트로 RED→GREEN을 밟는다. E2E 스펙 자체는 검증 수단이므로 TDD 사이클 대상이 아니라 결과물이다.
- **idempotency는 라이브러리/DB 제약에 위임**: 마이그레이션은 `__drizzle_migrations`, 시드는 `onConflict`, 프로비저닝은 `unique` 제약 + 사전 조회. 자체 상태 추적 테이블을 새로 만들지 않는다.

## §E. 위험 (Risks)

| 위험 | 영향 | 완화 |
|------|------|------|
| Better Auth credential `account` 행의 필수 컬럼 집합이 라이브러리 내부 규약과 어긋남 (`issuer` notNull 등) | 프로비저닝은 성공하나 실제 로그인이 실패 | **탐지**: AC-RUNTIME-007을 "행이 생성됨"이 아니라 "실제 로그인 성공"으로 정의해 이 위험을 검증 대상으로 끌어올린다. **폴백 트리거**: AC-RUNTIME-007이 **연속 2회 실패**하면(즉 컬럼 집합 추정을 1회 수정한 뒤에도 로그인이 성립하지 않으면) 경로 C를 포기한다. **사전 승인된 폴백**: `research.md` §3의 경로 B(`better-auth/plugins/admin`의 `createUser`)를 이 SPEC 범위 내에서 채택한다 — 단, admin 플러그인은 **프로비저닝 스크립트 전용 `betterAuth` 인스턴스에만** 활성화하고 프로덕션 `lib/auth/config.ts`는 손대지 않는다. 이 제약이 지켜지는 한 폴백은 아키텍처 경계(REQ-RUNTIME-019)를 침범하지 않으므로 재-plan 없이 진행할 수 있다 |
| `file:` 스킴에서 통과한 E2E가 원격 Turso에서 실패 | 로컬 그린 ≠ 실환경 그린 | 런북(M6)에 원격 Turso 대상 수동 확인 절차를 명시하고, `spec.md` §5 잔여 위험으로 기록 |
| Playwright 도입에 따른 CI/로컬 브라우저 바이너리 설치 부담 | `pnpm test:e2e` 최초 실행 실패 | 런북에 `pnpm exec playwright install --with-deps chromium` 선행 단계 명시, 브라우저는 chromium 단일로 제한 |
| Vitest가 `e2e/**`를 수집해 `pnpm test`가 깨짐 | REQ-RUNTIME-018 위반 | M5에서 `vitest.config.ts` exclude를 명시적으로 확인/조정하고, `pnpm test` 통과를 M5 완료 조건에 포함 |
| `instrumentation.ts` 부팅 검증이 `pnpm build` 단계에서 환경변수 없이 실행되어 빌드를 깨뜨림 | REQ-RUNTIME-018 위반 | 빌드 타임과 런타임 부팅을 구분한다 — M1에서 실측 확인 후, 충돌 시 **빌드 단계에서만 검증을 건너뛰고 런타임 부팅 훅에서는 항상 검증**한다. 검증 시점을 런타임 첫 요청 경계로 미루는 조정은 금지(REQ-RUNTIME-010이 요구하는 부팅 시점 fail-fast를 무효화). 상세: `design.md` §6 |

## §F. MX 태그 계획

### @MX:ANCHOR 후보 (높은 fan-in 예상)
- `lib/env.ts` — 검증된 환경설정 접근자: 앱 부팅, 3개 스크립트, E2E 글로벌 셋업이 모두 의존.

### @MX:WARN 후보
- `scripts/provision-tester.ts` — 비밀번호 해시 및 계정 행 직접 삽입. 라이브러리 내부 규약에 의존하는 지점이므로 Better Auth 업그레이드 시 재검증이 필요함을 명시.

### @MX:NOTE 후보
- `scripts/db-seed.ts` — `evidence-retriever.ts`가 여전히 JSON을 직접 읽는다는 사실(현행 유지 결정)과 그 이유를 기록.

## §G. Anti-Patterns (이번 SPEC에서 금지)

- 파이프라인 mock 구현을 "이왕 하는 김에" 실제 LLM 호출로 교체하기 — `spec.md` §4 위반.
- `lib/db/schema.ts`를 수정해 마이그레이션 재생성을 유발하기 — PRESERVE 위반이며 기존 마이그레이션 적용 절차 검증을 무의미하게 만든다.
- 비밀번호를 CLI 인자·설정 파일·픽스처 파일에 기록하기 — REQ-RUNTIME-008 위반.
- E2E를 위해 UI를 재작성하기 — `data-testid` 부착 외 변경은 out of scope.
- 자체 마이그레이션 상태 추적 테이블 신설 — Drizzle이 이미 제공하는 기능의 재구현.

## §H. Cross-References

- `spec.md` §2 (REQ-RUNTIME-001 ~ 020), §4 (Out of Scope)
- `acceptance.md` (AC-RUNTIME-001 ~ 019)
- `design.md` (신규 계층 경계 및 데이터 흐름)
- `research.md` (현행 코드베이스 실측 근거 + 절차별 대안 비교)
- `.claude/rules/moai/workflow/spec-workflow.md` § SPEC Complexity Tier (Tier L 판정 기준), § SPEC Phase Discipline (Route B)
