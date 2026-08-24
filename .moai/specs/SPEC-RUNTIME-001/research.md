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

### §0.1 플랜 개정 v0.2.0 추가 실측 (2026-08-24)

개정 3건 중 **Change 2(공식 `signUpEmail` 경로)** 의 기술적 성립 여부는 추정이 아니라 설치된 `better-auth@1.7.1` 소스 직접 읽기로 확인했다. 아래는 관측된 사실이며, 각 행에 파일·행 번호를 귀속한다.

| 조사 항목 | 실행한 확인 | 관측 결과 |
|-----------|-------------|-----------|
| `signUpEmail`의 서버 사이드 호출 가능성 | `node_modules/better-auth/dist/test-utils/test-instance.mjs:99-102` 읽기 | 라이브러리 자체 테스트 유틸이 `await auth.api.signUpEmail({ body: testUser, headers })`를 **HTTP 서버 없이 인스턴스에 직접** 호출한다. `headers`는 조건부로만 전달되어 **선택 인자**임이 확인된다 — 즉 HTTP 요청 컨텍스트는 필수가 아니다 |
| `disableSignUp` 판정의 참조원 | `dist/api/routes/sign-up.mjs:145-148` 읽기 | 핸들러가 `ctx.context.options.emailAndPassword?.disableSignUp`를 읽어 `EMAIL_PASSWORD_SIGN_UP_DISABLED`로 거부한다. 판정 대상은 **해당 인스턴스 자신의 옵션**이므로, 별도 인스턴스가 기본값(false)을 쓰면 통과하고 프로덕션 인스턴스는 영향받지 않는다 |
| credential `account` 행의 실제 컬럼 값 | `dist/api/routes/sign-up.mjs:243-249` 읽기 | 라이브러리가 `linkAccount({ userId, providerId: "credential", issuer: createLocalAccountIssuer("credential"), accountId: createdUser.id, password: hash })`를 채운다 — 기존 경로 C가 **추정**하려던 `providerId`/`accountId`/`issuer` 3개 값이 모두 라이브러리 내부에서 결정된다 |
| `autoSignIn: false`의 효과 | `dist/api/routes/sign-up.mjs:163-164, 260-266` 읽기 | `shouldSkipAutoSignIn`이 참이면 `createSession`/`setSessionCookie` 이전에 반환한다(조기 반환 260-263행, 세션 생성 264-266행) — 프로비저닝이 세션 행을 만들지 않고, 쿠키/헤더 컨텍스트에도 의존하지 않는다 |
| 중복 이메일 재실행 시 동작 | `dist/api/routes/sign-up.mjs:200-213` 읽기 | 기존 사용자 발견 시 `autoSignIn: false` 조합에서는 행 생성 없이 generic 응답으로 조기 반환하고(210행), 그 외에는 `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`로 던진다(212행) — **어느 쪽도 중복 행을 만들지 않는다** |
| 비밀번호 길이 제약 | `dist/api/routes/sign-up.mjs:154-159` + `dist/context/create-context.mjs:185` 읽기 | `sign-up.mjs`는 `ctx.context.password.config.minPasswordLength`/`maxPasswordLength`로 **검증만** 수행하고, 기본값 자체는 컨텍스트 생성부에 있다 — `minPasswordLength: options.emailAndPassword?.minPasswordLength \|\| 8`(`create-context.mjs:185`). 즉 기본 최소 8자의 귀속처는 `create-context.mjs:185`다. E2E가 생성하는 임시 비밀번호는 이 하한을 만족해야 한다 |
| 현행 파일 부재 확인 | `ls instrumentation.ts scripts/ e2e/` | 세 경로 모두 부재 — 이번 SPEC이 신규 생성한다 |

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

### 계정 생성 — 네 가지 경로 비교

> **개정 이력(v0.2.0)**: 초판은 경로 C(내부 crypto + 직접 INSERT)를 채택했다. 사용자 설계 검토에서 "Better Auth의 내부 스키마·해시 규약에 대한 의존이 과하다"는 지적을 받아, **경로 D를 신설하고 1순위로 채택**했다. 경로 C는 폐기되지 않고 폴백으로 강등된다. 경로 라벨 A/B/C는 감사 이력과의 대조를 위해 유지한다.

| 순위 | 경로 | 형태 | 장점 | 단점 | 채택 |
|------|------|------|------|------|------|
| **1** | **D. 프로비저닝 전용 `betterAuth` 인스턴스 + 공식 `auth.api.signUpEmail`** | `scripts/provision-tester.ts` 안에서 프로덕션과 **동일한 Drizzle 어댑터/DB 연결**을 재사용하되 `disableSignUp`을 기본값(false)으로 둔 별도 인스턴스를 구성하고, 그 인스턴스의 `auth.api.signUpEmail({ body })`를 호출 | 라이브러리 공식 서버 API. 해시 포맷·`user`/`account` 행 형태·`issuer` 값을 **라이브러리가 채운다**(§0.1 실측). 프로덕션 `lib/auth/config.ts` 불변. 인스턴스를 어디에도 마운트하지 않으므로 공개 셀프 가입 표면이 생기지 않음 | 프로비저닝 전용 인스턴스라는 개념이 하나 늘어남(스크립트 내부에 국한). 내부적으로 어댑터 트랜잭션을 사용하므로 libSQL/Drizzle 조합에서의 동작이 미검증(§6) | ✓ |
| 2 | B. `admin` 플러그인 도입 후 `createUser` 사용 | 스크립트 전용 인스턴스에 `better-auth/plugins/admin` 활성화 | 라이브러리 공식 관리자 API. 내부 행 규약에 의존하지 않음 | 플러그인을 **프로덕션** 인증 설정에 추가하면 권한 모델까지 딸려와 범위를 넘는 구조 변경이 됨 — 스크립트 전용 인스턴스에 한정하면 이 단점은 소멸하나, 경로 D가 이미 공식 API를 쓰므로 플러그인 도입이라는 추가 표면이 정당화되지 않음 | △ (폴백 2) |
| 3 | C. `better-auth/crypto`의 `hashPassword()`로 해시 후 `user` + credential `account` 행을 Drizzle로 직접 삽입 | `scripts/provision-tester.ts` | 프로덕션 인증 설정 불변. 추가 인스턴스·플러그인 없이 코드가 스크립트 1개에 격리됨 | Better Auth의 **내부 행 규약**(`providerId`, `accountId`, `issuer`, 해시 포맷)을 스크립트가 추정해야 함 — 업그레이드 시 재검증 필요. 이 의존이 개정의 직접적 동기다 | △ (폴백 3) |
| — | A. `disableSignUp`를 일시적으로 끄고 가입 API 호출 | 프로덕션 설정 토글 후 원복 | 라이브러리 공식 경로 사용 | 실행 중 **프로덕션 설정에** 셀프 가입 창구가 열리는 시간 구간이 생김. 스크립트 중단 시 원복 실패 위험 | ✕ (폴백에서도 제외) |

**경로 D 채택 근거 (실측 귀속 — §0.1)**:

1. **HTTP 컨텍스트 불필요** — 라이브러리 자체 테스트 유틸이 마운트되지 않은 인스턴스에 `auth.api.signUpEmail({ body, headers })`를 직접 호출하며, `headers`는 선택 인자다(`test-instance.mjs:99-102`). 즉 "서버 API"는 HTTP 라우트가 아니라 함수 호출 표면이다.
2. **`disableSignUp` 판정은 인스턴스 로컬** — 핸들러가 `ctx.context.options.emailAndPassword?.disableSignUp`를 읽는다(`sign-up.mjs:145-148`). 별도 인스턴스가 기본값을 쓰면 통과하며, 프로덕션 인스턴스의 `disableSignUp: true`는 **어느 시점에도 변경되지 않는다**.
3. **내부 규약 의존이 제거됨** — `providerId: "credential"`, `issuer: createLocalAccountIssuer("credential")`, `accountId: createdUser.id`, `password: hash`를 라이브러리가 채운다(`sign-up.mjs:243-249`). 경로 C가 추정하려던 값 전부가 여기서 사라진다. `lib/db/schema.ts`의 `account.issuer` `notNull` 제약도 라이브러리가 스스로 만족시킨다.
4. **`autoSignIn: false` 권장** — 프로비저닝 인스턴스는 `autoSignIn: false`로 구성한다. `shouldSkipAutoSignIn` 경로가 `createSession`/`setSessionCookie` 이전에 반환하므로(`sign-up.mjs:260-266`), 프로비저닝이 세션 행을 만들지 않고 쿠키/헤더 컨텍스트에도 의존하지 않는다.

**공개 표면 불변식**: 경로 D의 인스턴스는 `scripts/` 내부에서 생성되고 그 안에서만 소비된다 — 어떤 `route.ts`/핸들러에도 연결하지 않으며 `scripts/` 밖으로 export하지 않는다. 이 불변식이 "셀프 가입 창구가 열리지 않는다"는 주장을 성립시키는 유일한 근거이므로, AC-RUNTIME-017이 이를 정적으로 검증하고 스크립트에 `@MX:WARN`을 부착한다(plan.md §F).

**프로비저닝 순서(불변)**: `allowed_testers` 등록 → 계정 생성. 순서는 개정 전후로 동일하다. `lib/auth/config.ts`의 `user.validateUserInfo`가 가입 시점에 allowlist를 대조하므로, 프로비저닝 인스턴스가 같은 훅을 구성하더라도 allowlist 선행 등록 덕분에 통과한다(훅 구성 여부는 구현 판단 — `design.md` §6).

**재실행 안전성**: 이메일 사전 조회로 기존 계정을 건너뛴다. 라이브러리 레벨에서도 중복 행은 생기지 않는다 — 기존 사용자 발견 시 `autoSignIn: false` 조합에서는 행 생성 없이 조기 반환하고, 그 외에는 `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`로 던진다(`sign-up.mjs:200-213`, throw는 212행). 여기에 `allowed_testers.email`/`user.email`의 `unique` 제약이 DB 레벨 방어로 남는다.

**폴백 트리거 — 실패 횟수가 아니라 실현 가능성 판정**:

- **트리거**: 구현 중 `signUpEmail`을 **마운트되지 않은 인스턴스에서 호출하는 것이 기술적으로 불가능함이 확인된 경우에만** 폴백한다(예: 숨은 요구사항이 실제 HTTP 요청 컨텍스트를 강제하는 경우). 초판의 "AC-RUNTIME-007 연속 2회 실패" 트리거는 **폐기**한다 — 올바르게 구현된 공식 API 경로는 확률적으로 실패하는 성질의 것이 아니므로, 런타임 실패 횟수는 경로 전환의 근거가 될 수 없다. 실패가 관측되면 그것은 경로 문제가 아니라 구현 결함 신호이며, 폴백이 아니라 수정으로 대응한다.
- **판정 기록 의무**: 폴백을 선택하는 경우, "무엇을 시도했고 어떤 관측이 불가능성을 확정했는지"를 `progress.md` §E.2에 명시한다. 관측 없는 폴백 전환은 금지한다.
- **폴백 순서**: D → B → C. 공식 API 경로(B)를 내부 규약 의존 경로(C)보다 앞에 둔다 — 개정의 동기 자체가 내부 규약 의존 축소이므로, 폴백에서도 같은 축을 우선한다.
- **경로 A는 폴백에서도 제외**한다. 프로덕션 `disableSignUp`를 일시적으로 끄는 구간은 스크립트 중단 시 원복 실패로 셀프 가입 창구가 열린 채 남을 수 있다.

**검증 대상으로의 승격(불변)**: 경로가 무엇이든 AC-RUNTIME-007은 "행이 삽입되었다"가 아니라 **"실제로 로그인에 성공한다"** 를 Then으로 삼는다. 이 기준은 개정으로 완화되지 않는다.

### 비밀번호 취급 (REQ-RUNTIME-008)

허용되는 수령 경로는 두 가지뿐이다:

1. **대화형 프롬프트** — TTY 입력, 에코 없음. 운영자 기본 경로.
2. **환경변수 `TESTER_PASSWORD`** — 비대화형(E2E 진입점 스크립트, CI) 경로. 값은 Better Auth의 `minPasswordLength`(기본 8자, §0.1) 하한을 만족해야 한다.

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

### 시크릿 수명주기 — 왜 `globalSetup`이 아니라 진입점 스크립트인가 (개정 v0.2.0)

> **개정 이력**: 초판은 `e2e/global-setup.ts`가 `BETTER_AUTH_SECRET`/`TESTER_PASSWORD`를 생성하고, 그 값이 Playwright의 `webServer`가 띄우는 Next.js 프로세스까지 환경 상속으로 전달된다고 **가정**했다. 사용자 검토에서 이 가정 자체가 배제 대상으로 지목되어 설계를 교체했다.

문제의 성질은 "Playwright가 실제로 어떻게 동작하는가"가 아니라 **"SPEC이 무엇에 의존해도 되는가"** 다. `globalSetup`과 `webServer`는 서로 다른 라이프사이클 훅이며, 어느 쪽이 먼저 실행되는지·`globalSetup`이 `process.env`에 쓴 값이 별도로 spawn되는 `webServer` 자식 프로세스에 반영되는지는 **프레임워크 내부 순서에 대한 가정**이다. 그 가정이 깨지면 증상은 "서버는 시크릿 A로 세션을 서명하고 테스트는 시크릿 B로 로그인한다" — 즉 원인이 시크릿 불일치임이 드러나지 않는 인증 실패로 나타난다.

**채택 설계 — 단일 진입점이 두 프로세스의 공통 부모가 된다.**

| 축 | 초판 (globalSetup 상속 가정) | 개정 (진입점 스크립트 소유) |
|----|------------------------------|------------------------------|
| 시크릿 생성 위치 | Playwright 프로세스 **내부**의 `globalSetup` | Playwright를 **spawn하는 부모** 프로세스 |
| 서버 프로세스로의 전달 | `globalSetup` → `webServer`(별도 spawn) 환경 반영 가정 | 부모 → Playwright → `webServer` 로 이어지는 **OS 프로세스 환경 상속** |
| DB 준비 시점 | `webServer` 기동과의 상대 순서가 훅 순서에 종속 | Playwright를 띄우기 **전에** 완료 |
| 일치 보장의 근거 | 프레임워크 내부 동작 | 자식 프로세스는 부모 환경을 그대로 물려받는다는 운영체제 수준 성질 |

`scripts/run-e2e.ts`가 (1) 시크릿 생성 → (2) 전체 E2E 환경 조립 → (3) DB 초기화·마이그레이션·시드·테스터 2명 프로비저닝 → (4) 동일 환경으로 Playwright spawn 순으로 진행한다. Playwright 프로세스와 그 자식인 Next.js 서버는 같은 부모의 환경을 물려받으므로 **동일한 값을 볼 수밖에 없다**. `e2e/global-setup.ts`는 이 설계에서 불필요해지므로 아티팩트 목록에서 제거한다 — 훅을 하나 없애는 것이 곧 순서 가정을 하나 없애는 것이다.

`playwright.config.ts`의 `webServer`는 유지하되, 시크릿을 `webServer.env`에 **다시 적지 않는다**. 자식 프로세스는 부모 환경을 기본 상속하므로 재기재는 중복이며, 두 곳에 값이 존재하면 어느 쪽이 실효인지 모호해진다.

### 격리 전략

`TURSO_DATABASE_URL=file:./.tmp/e2e.db`를 진입점 스크립트가 자신의 환경에 설정한다(§2의 `file:` capability gate가 전제). 이 값 역시 상속으로 Playwright·Next.js 서버에 동일하게 전달된다. DB 파일 초기화 → 마이그레이션 → 시드 → 테스터 A/B 프로비저닝은 Playwright 기동 **전에** 진입점 스크립트가 수행한다. 개발자의 실제 Turso 인스턴스에는 접근하지 않는다. `.tmp/`가 이미 무시되는지 확인하고, 덮이지 않는 경우에만 `.gitignore`에 추가한다 — §0 실측상 기존 `*.tmp` 글롭(`.gitignore:108`)이 `.tmp/e2e.db`를 이미 덮으므로 추가 항목은 불필요하다(재확인 실패 시에만 추가).

`pnpm test`(Vitest)와 `pnpm test:e2e`(Playwright)는 분리한다 — `pnpm test`가 `e2e/**`를 수집하면 브라우저 없는 환경에서 깨져 REQ-RUNTIME-018을 위반한다.

## §5. 환경변수 검증 설계 근거

프로젝트에 Zod(`zod@4.4.3`)가 이미 의존성으로 존재하며 `lib/validation/case-input.ts`에서 사용 중이다. 새 의존성 없이 동일 도구로 환경변수 스키마를 표현한다(Simplicity ladder: 이미 설치된 의존성 재사용).

### 목적별 스코프 검증 (개정 v0.2.0)

> **개정 이력**: 초판은 "항상 필수" 변수 하나의 평면 집합을 모든 명령·프로세스에 동일하게 적용했다. 사용자 검토에서 이 획일성이 지적되어 **목적별 스코프**로 교체했다.

평면 집합의 실제 손해는 두 방향으로 나타난다:

- **거짓 차단** — `pnpm db:migrate`는 DB 주소만 있으면 성립하는 작업인데, 평면 집합은 `BETTER_AUTH_SECRET`·`BETTER_AUTH_URL`이 없다는 이유로 마이그레이션을 거부한다. 운영자는 "왜 마이그레이션에 인증 시크릿이 필요한가"라는 답 없는 질문을 받는다.
- **의미 없는 요구** — `GEMINI_API_KEY`는 이번 SPEC 범위에서 **어떤 코드 경로도 소비하지 않는다**. 파이프라인이 mock 구현을 유지하므로(`spec.md` §4) 실호출이 발생하지 않기 때문이다. 그럼에도 부팅 필수로 두면, 값의 유효성과 무관하게 "무언가 채워져 있을 것"만 요구하는 형식적 관문이 된다 — 운영자는 더미 값을 넣는 법을 배우고, 그 습관은 이 변수가 진짜로 필요해지는 시점에 그대로 남는다.

따라서 검증 함수는 **목적(scope)을 인자로 받아** 그 목적이 실제로 소비하는 변수만 요구한다. 스코프별 변수 집합은 `design.md` §3.1이 SSOT다.

**`GEMINI_API_KEY`에 대한 전방 설계 노트**: 이번 SPEC의 앱 런타임 스코프는 이 변수를 요구하지 않는다. 파이프라인 단계가 실제 Gemini 호출을 활성화하는 후속 SPEC이 도입되는 시점에, 그 SPEC이 이 변수를 앱 런타임 스코프의 필수 항목으로 **승격**해야 한다. 승격 없이 실호출만 도입되면 실패 지점이 부팅에서 첫 호출 시점으로 밀려 REQ-RUNTIME-010이 닫으려던 지연 실패가 재도입된다. 이는 후속 작업에 대한 설계 메모이며, 이번 SPEC이 그 후속 SPEC을 정의하거나 전제하지는 않는다.

검증 메시지 설계 원칙:

- **변수명 + 필요 이유 + 획득 경로**를 담는다. "환경변수가 없습니다" 같은 메시지는 요구사항 미달이다(REQ-RUNTIME-010).
- **누락 변수를 전부 열거**한다. 첫 번째에서 중단하면 운영자가 수정→재시도를 N번 반복하게 된다.
- **값은 절대 포함하지 않는다**(REQ-RUNTIME-011). Zod의 기본 오류 포맷은 입력값을 포함할 수 있으므로, 메시지 생성 시 값을 제거하는 처리가 필요하다 — 이것이 AC-RUNTIME-010이 존재하는 이유다.

## §6. 미검증 사항 (Gaps)

verification-claim-integrity 원칙에 따라, 이 문서에서 **직접 확인하지 않은** 항목을 명시한다. 아래는 구현 시점에 실측으로 확정해야 한다.

- **`node`/`pnpm` 실행 확인 없음**: 조사에 사용한 셸에서 `node`가 PATH에 없어(`node: command not found`) 실제 명령 실행 결과는 관측하지 못했다. 파일 존재 여부와 소스 내용만으로 조사했다. `pnpm db:migrate` 등의 실제 exit code는 run-phase에서 최초로 관측된다.
- **`migrate()` 함수 시그니처 미확인**: `drizzle-orm/libsql/migrator` 모듈의 **존재**만 확인했고, export 시그니처(`migrate(db, { migrationsFolder })` 형태 여부)는 확인하지 않았다. 구현 시 `migrator.d.ts`를 읽어 확정한다.
- **`hashPassword()` 시그니처·해시 포맷 미확인** *(경로 D 채택으로 영향 축소)*: 경로 D는 이 API를 직접 호출하지 않으므로 이 Gap은 폴백 경로 C를 선택하는 경우에만 재활성화된다.
- **credential `account` 행의 정확한 필수 컬럼 집합** *(경로 D 채택으로 해소)*: §0.1에서 라이브러리가 `providerId: "credential"` / `accountId: createdUser.id` / `issuer: createLocalAccountIssuer("credential")`를 채운다는 사실을 소스로 확인했다. 더 이상 스크립트의 추정 대상이 아니다.
- **`signUpEmail`의 어댑터 트랜잭션 동작 미검증**: 핸들러 전체가 `runWithTransaction(ctx.context.adapter, ...)`로 감싸여 있음은 소스에서 확인했으나(`sign-up.mjs:144`), 이 트랜잭션이 libSQL/Drizzle 어댑터 조합에서 실제로 어떻게 실행되는지는 **명령을 실행해 관측하지 않았다**. run-phase에서 최초로 관측된다 — AC-RUNTIME-007이 이 경로를 검증한다.
- **`auth.api.signUpEmail`의 실호출 미관측**: 소스 읽기로 호출 형태와 옵션 판정 지점을 확인했을 뿐, 이 프로젝트의 스키마·어댑터 구성에서 실제로 호출해 성공하는지는 관측하지 않았다. 경로 D의 실현 가능성 판정(§3 폴백 트리거)은 이 관측을 근거로 삼아야 하며, 관측 없는 폴백 전환은 금지한다.
- **`instrumentation.ts` 부팅 훅과 `pnpm build`의 상호작용 미확인**: `register()` 훅이 빌드 중 라우트 데이터 수집 단계에서 실행되는지 확인하지 않았다(§0.1 실측상 `instrumentation.ts`는 아직 부재하며 이번 SPEC이 신규 생성한다). `lib/auth/config.ts`의 @MX:ANCHOR 주석이 "모듈 최상위 즉시 생성은 `pnpm build`를 깨뜨린다"고 기록하고 있으므로 동일 위험이 있다 — plan.md §E 위험표에 등재했다.
- **Next.js(`@next/env`)의 `process.env` ↔ `.env.local` 우선순위 — 문서 확인, 실행 미관측**: `webServer`가 기동하는 Next.js 서버 프로세스는 진입점 스크립트로부터 상속받은 `process.env` 외에 **`.env.local`을 디스크에서 독립적으로 로드**한다. 이 문서 §2의 런북이 `.env.local.example`을 `.env.local`로 복사해 **실제 원격 Turso 자격증명**을 기입하도록 지시하므로(`.env.local.example`은 `libsql://<database-name>-<org>.turso.io` 형태의 원격 URL 플레이스홀더를 담고 있음 — 실측 확인), 런북을 따른 개발자가 `pnpm test:e2e`를 실행하는 **현실적 상태**에서는 상속된 `file:./.tmp/e2e.db`와 디스크의 원격 URL이 **동시에 존재**한다. 어느 쪽이 이기는지가 REQ-RUNTIME-017(개발자의 실제 Turso 인스턴스 무접근)의 성립 여부를 좌우한다. **조사 결과 — 문서 근거는 확보, 소스·실행 근거는 미확보**: 설치된 패키지에 동봉된 Next.js 문서(`node_modules/next/dist/docs/01-app/02-guides/environment-variables.md` §Environment Variable Load Order, 266-276행)는 조회 순서를 `process.env` → `.env.$(NODE_ENV).local` → `.env.local` → `.env.$(NODE_ENV)` → `.env`로 명시하고 "*stopping once the variable is found*"이라고 기술한다 — 문서상으로는 상속된 `process.env` 값이 이긴다. 그러나 실제 로더 구현(`loadEnvConfig`)은 번들·미니파이된 `next/dist/compiled/next-server/server.runtime.prod.js` 안에 있어 **소스로 확인할 수 없었고**, 이 프로젝트 구성에서 명령을 실행해 관측하지도 않았다(§6 첫 항목의 `node` 부재와 동일 사유). 따라서 이 우선순위는 **문서상의 주장이며 관측된 사실이 아니다** — run-phase M5(E2E 구현) 시점에 실측으로 확정한 뒤 의존해야 한다. 검증 지점: AC-RUNTIME-015(`.env.local`에 원격 자격증명이 존재하는 상태에서 통과할 것). 설계상 대응: `design.md` §3.4 "세 번째 공급원" + §6.
- **Playwright의 `webServer` 환경 상속 동작 미검증** *(개정으로 의존 제거)*: 자식 프로세스가 부모 환경을 상속한다는 성질에 의존하도록 설계를 교체했으므로(§4), Playwright 내부의 `globalSetup`↔`webServer` 순서·환경 전파 동작은 **더 이상 이 SPEC의 검증 대상도 의존 대상도 아니다**. 다만 `webServer`가 부모 환경을 상속한다는 것 자체는 실행으로 관측하지 않았으며, AC-RUNTIME-015(단일 명령 재현성)가 실행 경로 전체로 이를 검증한다.
- **Turso 무료 tier 실제 한도 미확인**: 대시보드 확인이 필요하다.
- **`vitest.config.ts`의 현행 include/exclude 미확인**: `e2e/**` 수집 여부는 M5에서 확인·조정한다.

## §7. 참고

- 선행 SPEC: `.moai/specs/SPEC-SCAFFOLD-001/{spec,plan,acceptance,design,research}.md`
- 프로젝트 문서: `.moai/project/{product,structure,tech}.md`
- 실측 대상 소스: `lib/db/client.ts`, `lib/auth/config.ts`, `lib/db/schema.ts`, `lib/pipeline/evidence-retriever.ts`, `lib/cases/create-case.ts`, `app/api/cases/route.ts`, `app/cases/[caseId]/actions.ts`, `drizzle.config.ts`, `package.json`, `.env.local.example`, `db/migrations/meta/_journal.json`, `db/seed/evidence.json`
