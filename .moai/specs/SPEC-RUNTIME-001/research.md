# Research — SPEC-RUNTIME-001

플랜 단계 조사 기록. 모든 절차는 **실제 시크릿 값 없이 플레이스홀더**로만 기술한다.

## §0. 조사 방법 및 증거 귀속

이 문서의 "현행 상태" 주장은 모두 2026-08-24 기준 작업 트리(HEAD `72db921`)에 대해 직접 실행한 파일 읽기·디렉터리 조회 결과에 귀속된다. 추론만으로 세운 주장은 §6에 **미검증(Gap)** 으로 분리해 기록한다.

| 조사 항목 | 실행한 확인 | 관측 결과 |
|-----------|-------------|-----------|
| 마이그레이션 러너 가용성 | `ls node_modules/drizzle-orm/libsql/migrator.{d.ts,js}` | 두 파일 모두 존재 |
| 마이그레이션 이력 | `cat db/migrations/meta/_journal.json` | `entries` 1건 (`0000_broad_big_bertha`, dialect `sqlite`) |
| 비밀번호 해시 API | `ls node_modules/better-auth/dist/crypto/` + `grep hashPassword ...index.d.mts` | `password.mjs`/`password.d.mts` 존재, `hashPassword`/`verifyPassword` export 확인 |
| Better Auth 플러그인 목록 | `ls node_modules/better-auth/dist/plugins/` | `admin` 플러그인 존재(대안 경로, §3에서 비교) |
| DB 클라이언트 현행 동작 | `lib/db/client.ts` 전문 읽기 | `url`과 `authToken` **둘 다** 없으면 예외 — `file:` 스킴 사용 불가 |
| 시드 소비 경로 | `lib/pipeline/evidence-retriever.ts` 전문 읽기 | `db/seed/evidence.json`을 **디스크에서 직접 import**, DB 조회 아님 |
| 스크립트 목록 | `cat package.json` | `db:generate` 존재, `db:migrate`/`db:seed`/`test:e2e` **부재** |
| account 스키마 제약 | `lib/db/schema.ts` 읽기 | `account.issuer`가 `notNull` (코드 주석: Better Auth 1.7.1 요구사항) |
| E2E DB 파일의 gitignore 적용 여부 | `git check-ignore -v .tmp/e2e.db` | exit 0, 출력 `.gitignore:108:*.tmp	.tmp/e2e.db` — **기존 `*.tmp` 글롭이 이미 덮고 있어 `.tmp/` 항목 추가는 불필요** |
| evidence JSON 직접 읽기 경로 | `grep -rn "evidence.json" app lib` | 프로덕션 코드 2곳: `lib/pipeline/evidence-retriever.ts:1`, `app/cases/[caseId]/page.tsx:5` (둘 다 `import ... from ".../db/seed/evidence.json"`) |

## §1. 현행 런타임 간극 (5개)

1. **마이그레이션 적용 경로 부재** — SQL 파일은 생성되어 있으나 적용 명령이 없다.
2. **시드 DB 적재 경로 부재** — JSON은 있으나 `evidence` 테이블은 실행 시 비어 있다.
3. **로그인 가능한 계정 생성 수단 부재** — `disableSignUp: true`(`lib/auth/config.ts`)로 셀프 가입이 막혀 있고 운영자 프로비저닝 경로도 없다. 현 상태에서는 아무도 로그인할 수 없다.
4. **부팅 시점 환경변수 검증 부재** — `lib/db/client.ts`가 첫 DB 접근 시점에 예외를 던질 뿐이며, 어떤 변수가 왜 필요한지 설명하지 않는다.
5. **end-to-end 재현 검증 수단 부재** — 현행 테스트는 전부 단위/모킹 수준이다.

## §2. Turso/libSQL 연결 + 마이그레이션 적용 절차

### 연결

`lib/db/client.ts`는 이미 `createClient({ url, authToken })` → `drizzle(client, { schema })` 배선을 갖추고 있다. 변경이 필요한 지점은 **조건부 필수 판정**뿐이다:

- `libsql://<database>-<org>.turso.io` 형태의 원격 URL → `TURSO_AUTH_TOKEN` **필수**
- `file:./.tmp/e2e.db` 형태의 로컬 파일 URL → `TURSO_AUTH_TOKEN` **불필요**

현행 코드는 두 변수를 무조건 요구하므로 로컬 파일 DB 경로가 막혀 있다. 이것이 E2E 격리(REQ-RUNTIME-017)의 선행 조건이다.

### 마이그레이션 적용 — 두 가지 경로 비교

| 경로 | 형태 | 장점 | 단점 | 채택 |
|------|------|------|------|------|
| A. `drizzle-kit migrate` CLI | `package.json` 스크립트에 CLI 호출 추가 | 추가 코드 0줄 | `drizzle.config.ts`의 `dbCredentials`를 별도로 읽어 `lib/env.ts` 검증을 우회함. `file:` 스킴 처리 경로가 앱과 분기됨 | ✕ |
| B. 프로그래매틱 러너 (`drizzle-orm/libsql/migrator`의 `migrate()`) | `scripts/db-migrate.ts` 신규 | `lib/env.ts` 검증과 `getDb()` 경로를 앱과 공유. `file:`/원격 처리가 단일 분기 | 스크립트 파일 1개 추가 | ✓ |

**경로 B 채택.** 근거: 환경변수 검증 분기가 두 곳으로 갈라지면 한쪽만 갱신됐을 때 우회 경로가 생긴다(`lib/auth/config.ts`의 `isAllowedTesterEmail` @MX:ANCHOR가 같은 이유로 단일 진입점을 강제하고 있으며, 그 전례를 따른다).

### 재실행 안전성

Drizzle migrator는 적용 이력을 자체 추적 테이블(`__drizzle_migrations`)로 관리하므로 재실행이 no-op이 된다. 자체 상태 추적을 새로 만들지 않는다. 다만 이 동작은 **라이브러리 보장에 대한 의존**이므로, AC-RUNTIME-002에서 실제 2회 실행 결과로 검증한다.

### 절차 (런북 초안 — 플레이스홀더만)

```
1. Turso 대시보드에서 DB 생성 → 접속 URL과 인증 토큰 발급
2. .env.local.example 을 .env.local 로 복사
3. .env.local 에 TURSO_DATABASE_URL / TURSO_AUTH_TOKEN 기입 (실제 값은 대시보드에서 복사)
4. pnpm db:migrate      # db/migrations/ 의 미적용 마이그레이션 적용
5. pnpm db:migrate      # 재실행해도 exit 0 (idempotent 확인)
```

## §3. 초대 전용 테스터 프로비저닝 절차

### 제약 재확인

- `lib/auth/config.ts`는 `emailAndPassword.enabled: true` + `disableSignUp: true` — 가입 라우트 자체가 비활성.
- 이중 방어가 걸려 있다: `user.validateUserInfo`(가입 시점)와 `databaseHooks.session.create.before`(로그인 시점)가 **둘 다** `allowed_testers`를 대조한다. 따라서 `allowed_testers` 등록이 없으면 계정이 있어도 세션이 생성되지 않는다.
- **결론**: 프로비저닝은 반드시 `allowed_testers` 등록 → 계정 생성 순서여야 하며, 두 단계 모두 필요하다.

### 계정 생성 — 세 가지 경로 비교

| 경로 | 형태 | 장점 | 단점 | 채택 |
|------|------|------|------|------|
| A. `disableSignUp`를 일시적으로 끄고 가입 API 호출 | 설정 토글 후 원복 | 라이브러리 공식 경로 사용 | 실행 중 셀프 가입 창구가 열리는 시간 구간이 생김. 스크립트 중단 시 원복 실패 위험 | ✕ |
| B. `admin` 플러그인 도입 후 `createUser` 사용 | `better-auth/plugins/admin` 활성화 | 라이브러리 공식 관리자 API. 내부 행 규약에 의존하지 않음 | 플러그인을 프로덕션 인증 설정에 추가하면 권한 모델까지 딸려와 활성화 SPEC 범위를 넘는 구조 변경이 됨 — **단, 스크립트 전용 인스턴스에 한정하면 이 단점이 소멸한다** | △ (경로 C 실패 시 조건부 폴백) |
| C. `better-auth/crypto`의 `hashPassword()`로 해시 후 `user` + credential `account` 행을 Drizzle로 직접 삽입 | `scripts/provision-tester.ts` | 프로덕션 인증 설정 불변. 셀프 가입 창구가 열리지 않음. 코드가 스크립트 1개에 격리됨 | Better Auth의 내부 행 규약(`providerId`, `issuer`, 해시 포맷)에 의존 — 업그레이드 시 재검증 필요 | ✓ |

**경로 C 채택.** `disableSignUp: true`를 유지한 채 계정을 만들 수 있는 유일한 경로이며, 프로덕션 인증 설정에 아무 변경도 가하지 않는다.

**의존 위험의 처리 — 탐지 + 폴백**: 경로 C는 라이브러리 내부 규약에 의존한다. 이 위험을 문서 경고로 남기는 대신 **검증 대상으로 승격**했다 — AC-RUNTIME-007은 "행이 삽입되었다"가 아니라 "실제로 로그인에 성공한다"를 Then으로 삼는다. 규약이 어긋나면 AC가 실패한다. 스크립트에는 `@MX:WARN`으로 업그레이드 시 재검증 필요성을 명시한다(plan.md §F).

탐지만으로는 부족하다 — 실패했을 때 갈 곳이 없으면 run-phase에서 재-plan이 필요해진다. 따라서 **경로 B를 사전 승인된 폴백으로 남겨둔다**(위 표의 `△`):

- **트리거**: AC-RUNTIME-007 연속 2회 실패(컬럼 집합 추정을 1회 수정한 뒤에도 로그인 미성립).
- **폴백 형태**: `scripts/provision-tester.ts` 안에서 admin 플러그인을 활성화한 **별도 `betterAuth` 인스턴스**를 만들어 `createUser`를 호출한다. 프로덕션 `lib/auth/config.ts`는 수정하지 않는다.
- **경로 B의 원래 단점이 소멸하는 이유**: 표의 `✕` 판정 근거는 "프로덕션 인증 설정에 플러그인·권한 모델이 추가된다"였다. 인스턴스를 스크립트 전용으로 격리하면 프로덕션 설정은 불변이고 셀프 가입 창구도 열리지 않으므로, 이 근거가 성립하지 않는다. 따라서 폴백은 REQ-RUNTIME-019(아키텍처 경계 보존)를 침범하지 않으며 이번 SPEC 범위 안에서 실행 가능하다.
- **경로 A는 폴백에서 제외**한다. `disableSignUp`를 일시적으로 끄는 구간은 스크립트 중단 시 원복 실패로 셀프 가입 창구가 열린 채 남을 수 있어, 실패 경로에서 선택하기에 특히 부적절하다.

**알려진 스키마 제약**: `lib/db/schema.ts`의 `account.issuer`는 `notNull`이다(코드 주석에 따르면 Better Auth 1.7.1의 `accountSchema` 요구사항이며 M1 초안 시점에는 없던 요구). credential 계정 삽입 시 이 필드를 포함한 필수 컬럼 집합을 채워야 한다.

### 비밀번호 취급 (REQ-RUNTIME-008)

허용되는 수령 경로는 두 가지뿐이다:

1. **대화형 프롬프트** — TTY 입력, 에코 없음. 운영자 기본 경로.
2. **환경변수 `TESTER_PASSWORD`** — 비대화형(E2E 글로벌 셋업, CI) 경로.

**금지**: CLI 인자(`--password <값>`)로 받는 경로는 제공하지 않는다. 셸 히스토리와 프로세스 목록(`ps`)에 값이 남기 때문이다. AC-RUNTIME-008이 이 경로의 부재를 정적으로 검증한다.

값이 디스크에 남는 유일한 지점은 gitignore된 `.env.local`이다. 커밋되는 파일(`.env.local.example`, 런북, 스크립트, SPEC 아티팩트)에는 플레이스홀더만 기재한다.

### 절차 (런북 초안 — 플레이스홀더만)

```
1. pnpm db:migrate                                  # allowed_testers / user / account 테이블 준비
2. pnpm tester:add -- --email <tester@example.com>  # 비밀번호는 프롬프트로 입력 (화면에 표시되지 않음)
3. 로그인 확인: /login 에서 위 이메일 + 입력한 비밀번호로 접속
4. 재실행 안전: 동일 이메일로 2회 실행해도 중복 계정이 생기지 않음
```

## §4. E2E 도구 선택

### 검증해야 하는 시나리오의 성질

사용자가 명시한 7개 시나리오 중 로그인·사건 입력 폼 제출·리포트 뷰 렌더링·피드백 제출(서버 액션)은 **브라우저 경유 흐름**이다. 특히 `app/cases/[caseId]/actions.ts`의 `submitFeedback`은 `"use server"` 서버 액션이라 HTTP 클라이언트로 직접 호출하기 어렵다.

### 비교

| 도구 | 커버 범위 | 비용 | 채택 |
|------|-----------|------|------|
| Vitest 통합 테스트 (HTTP 레벨) | API 라우트·DB 검증은 가능. 폼 제출·서버 액션·페이지 렌더링은 재현 곤란 | 추가 의존성 0 | ✕ (시나리오 미달) |
| Playwright | 7개 시나리오 전부 커버. `webServer` 옵션으로 앱 기동/종료 자동화 | 브라우저 바이너리 설치 필요 | ✓ |

**Playwright 채택.** 브라우저는 chromium 단일로 제한해 설치 부담을 줄이고, 런북에 `pnpm exec playwright install --with-deps chromium` 선행 단계를 명시한다.

### 격리 전략

`TURSO_DATABASE_URL=file:./.tmp/e2e.db`를 E2E 환경에 주입한다(§2의 `file:` capability gate가 전제). 글로벌 셋업에서 DB 파일 초기화 → 마이그레이션 → 시드 → 테스터 A/B 프로비저닝(`TESTER_PASSWORD` 경로)을 수행한다. 개발자의 실제 Turso 인스턴스에는 접근하지 않는다. `.tmp/`가 이미 무시되는지 확인하고, 덮이지 않는 경우에만 `.gitignore`에 추가한다 — §0 실측상 기존 `*.tmp` 글롭(`.gitignore:108`)이 `.tmp/e2e.db`를 이미 덮으므로 추가 항목은 불필요하다(재확인 실패 시에만 추가).

`pnpm test`(Vitest)와 `pnpm test:e2e`(Playwright)는 분리한다 — `pnpm test`가 `e2e/**`를 수집하면 브라우저 없는 환경에서 깨져 REQ-RUNTIME-018을 위반한다.

## §5. 환경변수 검증 설계 근거

프로젝트에 Zod(`zod@4.4.3`)가 이미 의존성으로 존재하며 `lib/validation/case-input.ts`에서 사용 중이다. 새 의존성 없이 동일 도구로 환경변수 스키마를 표현한다(Simplicity ladder: 이미 설치된 의존성 재사용).

검증 메시지 설계 원칙:

- **변수명 + 필요 이유 + 획득 경로**를 담는다. "환경변수가 없습니다" 같은 메시지는 요구사항 미달이다(REQ-RUNTIME-010).
- **누락 변수를 전부 열거**한다. 첫 번째에서 중단하면 운영자가 수정→재시도를 N번 반복하게 된다.
- **값은 절대 포함하지 않는다**(REQ-RUNTIME-011). Zod의 기본 오류 포맷은 입력값을 포함할 수 있으므로, 메시지 생성 시 값을 제거하는 처리가 필요하다 — 이것이 AC-RUNTIME-010이 존재하는 이유다.

## §6. 미검증 사항 (Gaps)

verification-claim-integrity 원칙에 따라, 이 문서에서 **직접 확인하지 않은** 항목을 명시한다. 아래는 구현 시점에 실측으로 확정해야 한다.

- **`node`/`pnpm` 실행 확인 없음**: 조사에 사용한 셸에서 `node`가 PATH에 없어(`node: command not found`) 실제 명령 실행 결과는 관측하지 못했다. 파일 존재 여부와 소스 내용만으로 조사했다. `pnpm db:migrate` 등의 실제 exit code는 run-phase에서 최초로 관측된다.
- **`migrate()` 함수 시그니처 미확인**: `drizzle-orm/libsql/migrator` 모듈의 **존재**만 확인했고, export 시그니처(`migrate(db, { migrationsFolder })` 형태 여부)는 확인하지 않았다. 구현 시 `migrator.d.ts`를 읽어 확정한다.
- **`hashPassword()` 시그니처·해시 포맷 미확인**: export 이름만 확인했다. 인자 형태와 Better Auth가 로그인 시 기대하는 저장 포맷의 일치 여부는 AC-RUNTIME-007(실제 로그인 성공)로 검증된다.
- **credential `account` 행의 정확한 필수 컬럼 집합 미확인**: `providerId` 값(`"credential"` 추정), `accountId` 값(`user.id` 추정), `issuer` 값이 무엇이어야 하는지는 확인하지 않았다. 추정이며, AC-RUNTIME-007이 이 추정을 검증한다.
- **`instrumentation.ts` 부팅 훅과 `pnpm build`의 상호작용 미확인**: `register()` 훅이 빌드 중 라우트 데이터 수집 단계에서 실행되는지 확인하지 않았다. `lib/auth/config.ts`의 @MX:ANCHOR 주석이 "모듈 최상위 즉시 생성은 `pnpm build`를 깨뜨린다"고 기록하고 있으므로 동일 위험이 있다 — plan.md §E 위험표에 등재했다.
- **Turso 무료 tier 실제 한도 미확인**: 대시보드 확인이 필요하다.
- **`vitest.config.ts`의 현행 include/exclude 미확인**: `e2e/**` 수집 여부는 M5에서 확인·조정한다.

## §7. 참고

- 선행 SPEC: `.moai/specs/SPEC-SCAFFOLD-001/{spec,plan,acceptance,design,research}.md`
- 프로젝트 문서: `.moai/project/{product,structure,tech}.md`
- 실측 대상 소스: `lib/db/client.ts`, `lib/auth/config.ts`, `lib/db/schema.ts`, `lib/pipeline/evidence-retriever.ts`, `lib/cases/create-case.ts`, `app/api/cases/route.ts`, `app/cases/[caseId]/actions.ts`, `drizzle.config.ts`, `package.json`, `.env.local.example`, `db/migrations/meta/_journal.json`, `db/seed/evidence.json`
