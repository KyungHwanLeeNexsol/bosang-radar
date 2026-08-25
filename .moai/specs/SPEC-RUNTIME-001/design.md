# Design — SPEC-RUNTIME-001

이 문서는 **런타임 활성화 계층**의 경계와 데이터 흐름을 기술한다. SPEC-SCAFFOLD-001이 확립한 기존 계층은 설계 변경 대상이 아니며, 이 문서는 그 위에 무엇이 **덧붙는지**만 다룬다.

## §1. 설계 원칙

1. **덧붙이되 건드리지 않는다** — 신규 코드는 `lib/env.ts`, `scripts/`, `e2e/` 세 곳에 집중된다. 기존 `lib/pipeline/`, `lib/ai/`, `lib/validation/`, `lib/db/schema.ts`는 불변이다(REQ-RUNTIME-019).
2. **환경 검증은 단일 관문** — 앱 부팅·운영 스크립트·E2E 셋업이 모두 같은 검증 모듈을 통과한다. 분기하면 한쪽만 갱신됐을 때 우회 경로가 생긴다.
3. **시크릿은 프로세스 경계를 넘지 않는다** — 값은 환경변수 또는 대화형 입력으로만 들어오고, 커밋 대상 파일·로그·오류 메시지에는 나타나지 않는다.
4. **재실행 안전성은 기존 제약에 위임한다** — 마이그레이션은 Drizzle의 추적 테이블, 시드는 `onConflict`, 프로비저닝은 `unique` 제약. 새 상태 저장소를 만들지 않는다.
5. **프레임워크가 해주는 일에 프레임워크 밖에서 기대지 않는다** *(신설 v0.3.0)* — Next.js의 자동 `.env.local` 로딩은 `next build`/`start`/`dev` 경로의 동작이다. 독립 실행 스크립트는 그 경로 밖에 있으므로 **로드를 스스로 명시 호출**한다(§3.2.2). 이는 §3.3/§3.4가 프레임워크 훅 순서 대신 프로세스 계보에 기댄 것과 **같은 원칙의 적용**이다 — 통제하지 않는 동작을 전제로 삼지 않는다.
6. **관측 지점과 주장 지점을 일치시킨다** *(신설 v0.3.0)* — 어떤 성질을 주장하려면 그 성질 자체를 관측한다. 하류 효과로부터의 역추론은 다른 원인이 모두 배제되었을 때만 증거가 되며, 이 SPEC은 그 배제를 확보하지 않는다(§3.5).

## §2. 계층 구조 (신규 부분만)

```
   [운영자 CLI]              [Next.js 앱 부팅]           [E2E 진입점]
   db-migrate/db-seed         instrumentation.ts        scripts/run-e2e.ts
   provision-tester                 │                          │
        │                           │                          │
        ▼                           │                          │
  scripts/cli-bootstrap.ts          │                          │
   ← 명시적 .env.local 로드 (신규)   │                          │
     · loadEnvConfig(projectRoot)   │   ← Next.js가 부팅 시     │
       @next/env 직접 호출          │      스스로 로드한다      │
     · 로드 완료 후에만 검증 호출    │      (프레임워크 소유)    │
        │                           │                          │
   scope: db|provision         scope: app                 scope: e2e
        │                           │                          │
        └──────────┬────────────────┴──────────────────────────┘
                   ▼
            lib/env.ts  ← 목적별 검증 관문 (신규)
              · 스코프(scope)를 인자로 받아 해당 목적의 변수만 판정
              · file: vs libsql:// capability gate (전 스코프 공통)
              · 누락 변수 전량 열거 + 값 미노출 오류 메시지 생성
                   │
                   ▼
            lib/db/client.ts  ← 자체 인라인 검사를 lib/env.ts 위임으로 교체 (최소 수정)
              · getDb() 싱글턴 지연 생성 패턴 유지 (변경 금지)
                   │
                   ▼
            Drizzle ORM ──▶ libSQL (원격 Turso 또는 로컬 file:)
```

기존 계층(`lib/auth/`, `lib/cases/`, `lib/pipeline/`, `app/`)은 이 그림에서 `getDb()` 아래에 그대로 놓여 있으며 구조가 바뀌지 않는다.

## §3. 신규 모듈 경계

### 3.1 `lib/env.ts` — 목적별 환경 검증 관문

**책임**: **실행 목적(scope)** 을 받아, 그 목적이 실제로 소비하는 환경변수만 검증하고 타입이 확정된 설정 객체를 반환한다. 실패 시 설명적 오류로 즉시 중단한다.

**책임 아님**: 값을 읽어 저장하거나 캐시하는 것 외의 부수효과. DB 연결, 파일 쓰기, 로깅은 이 모듈의 일이 아니다.

#### 왜 목적별로 나누는가 (개정 v0.2.0)

초판은 "항상 필수" 변수 하나의 평면 집합을 모든 명령·프로세스에 적용했다. 그 설계는 **소비하지 않는 변수를 진입 조건으로 요구**한다 — `pnpm db:migrate`가 `BETTER_AUTH_SECRET` 부재로 거부되고, 파이프라인이 mock인 이번 SPEC에서 `GEMINI_API_KEY`가 부팅을 막는다. 이는 fail-fast의 강화가 아니라 **관문의 오작동**이다: 운영자가 "일단 아무 값이나 채우는" 우회를 학습하게 되고, 그 습관은 해당 변수가 진짜로 필요해지는 시점까지 그대로 남아 검증을 무력화한다.

개정 설계는 fail-fast 요구(REQ-RUNTIME-010)를 **완화하지 않는다**. 바꾸는 것은 "무엇이 부팅인가"와 "어떤 변수가 어떤 목적을 막는가"이며, 각 목적은 여전히 진입 시점에 전량 검증하고 즉시 실패한다.

#### 스코프 × 변수 매트릭스 (SSOT)

| 변수 | `db` (마이그레이션/시드) | `provision` (테스터 생성) | `app` (Next.js 런타임 부팅) | `e2e` (진입점 스크립트) | 필요 이유 (오류 메시지에 포함될 내용) |
|------|:---:|:---:|:---:|:---:|--------------------------------------|
| `TURSO_DATABASE_URL` | 필수 | 필수 | 필수 | 필수 | Drizzle이 접속할 libSQL 인스턴스 주소 |
| `TURSO_AUTH_TOKEN` | 조건부 | 조건부 | 조건부 | 조건부 | 원격 Turso 인스턴스 인증 (URL이 `libsql://`/`https://`일 때만) |
| `BETTER_AUTH_SECRET` | — | 필수 | 필수 | 필수 | 세션 토큰 서명 키 |
| `BETTER_AUTH_URL` | — | — | 필수 | 필수 | 인증 콜백의 기준 오리진 |
| `TESTER_PASSWORD` | — | 조건부 | — | 필수 | 비대화형 프로비저닝 비밀번호 (대화형 프롬프트를 쓰지 않을 때) |
| `GEMINI_API_KEY` | — | — | **요구하지 않음** [^gemini-scope] | — | (이번 SPEC 범위에서 소비 지점 없음) |

각 스코프는 자신의 열에서 "필수"로 표시된 변수를 **전부** 검증한다 — 목적 내부에서의 부분 검증이나 첫 실패 시 중단은 허용하지 않는다(REQ-RUNTIME-010, AC-RUNTIME-019).

`provision` 스코프에 `BETTER_AUTH_SECRET`이 포함되는 이유: 프로비저닝이 Better Auth 인스턴스를 구성하며(§3.2), 인스턴스 생성 자체가 이 값을 요구한다. `BETTER_AUTH_URL`은 계정 생성 경로가 콜백 오리진을 사용하지 않으므로 제외한다.

[^gemini-scope]: **이번 SPEC에서 `GEMINI_API_KEY`는 앱 런타임 부팅 요구사항이 아니다.** 파이프라인이 mock 구현을 유지하므로(`spec.md` §4 제외 범위) 어떤 실행 경로도 이 값을 소비하지 않는다. 소비되지 않는 값을 부팅 조건으로 두는 것은 검증이 아니라 형식이다. **전방 설계 노트**: 실제 Gemini 호출을 활성화하는 후속 SPEC이 도입되는 시점에, 그 SPEC이 이 변수를 `app` 스코프의 필수 항목으로 승격해야 한다 — 승격 없이 실호출만 도입되면 실패 지점이 부팅에서 첫 호출 시점으로 밀려 REQ-RUNTIME-010이 닫으려던 지연 실패가 재도입된다. 이 노트는 후속 작업에 대한 메모이며, 이번 SPEC이 그 후속 SPEC을 정의하거나 전제하지는 않는다.

**조건부 판정(`file:` capability gate)** 은 모든 스코프에 공통으로 적용된다 — `file:` 스킴을 1급으로 지원해야 E2E가 개발자의 실제 Turso 인스턴스를 건드리지 않고 재현될 수 있다(REQ-RUNTIME-017).

**오류 메시지 계약**: 누락 변수를 **전부** 열거하고, 각 항목에 변수명 + 필요 이유 + 획득 경로를 담되, **값은 어떤 형태로도 포함하지 않는다**(REQ-RUNTIME-011). Zod 기본 오류가 입력값을 실을 수 있으므로 메시지 생성 단계에서 값을 제거한다. 메시지에는 **어떤 스코프의 검증인지**도 포함한다 — 같은 변수명이라도 "마이그레이션에 필요"와 "앱 기동에 필요"는 운영자가 취할 조치가 다르다.

**@MX:ANCHOR 대상** — 앱 부팅 경로 + 3개 스크립트 + E2E 진입점이 모두 의존하는 높은 fan-in 지점(plan.md §F).

### 3.2 `scripts/` — 운영자 CLI 계층

네 스크립트 모두 동일한 형태를 따른다: **`cli-bootstrap.ts` 경유로 `.env.local`을 명시 로드**(§3.2.2) → `lib/env.ts`를 **자신의 스코프로** 통과 → `getDb()` 획득 → 작업 수행 → 결과 요약 출력 → exit code 반환.

| 스크립트 | 명령 | env 스코프 | 부트스트랩 경유 | 재실행 안전성의 근거 |
|----------|------|-----------|:---------------:|---------------------|
| `scripts/cli-bootstrap.ts` | (직접 실행 아님 — 공용 모듈) | — | — | 부수효과 없음 (§3.2.2) |
| `scripts/db-migrate.ts` | `pnpm db:migrate` | `db` | ✓ | Drizzle migrator의 적용 이력 추적 테이블 |
| `scripts/db-seed.ts` | `pnpm db:seed` | `db` | ✓ | `evidence.id` 기준 `onConflict` (seed JSON이 안정적 id를 이미 보유) |
| `scripts/provision-tester.ts` | `pnpm tester:add -- --email <이메일>` | `provision` | ✓ | 이메일 사전 조회 + 라이브러리 레벨 중복 차단 + `unique` 제약 (§3.2.1) |
| `scripts/run-e2e.ts` | `pnpm test:e2e` | `e2e` | ✓ (환경 조립 **후**) | 매 실행 DB 초기화 (§3.3) |

**공통 제약**: 스크립트는 애플리케이션 코드를 import할 수 있으나(`lib/env.ts`, `lib/db/client.ts`, `lib/db/schema.ts`), 그 반대 방향은 금지한다 — `lib/`나 `app/`이 `scripts/`를 import하면 운영 도구가 런타임 번들에 섞인다.

#### 3.2.1 `scripts/provision-tester.ts` — 프로비저닝 전용 인증 인스턴스 (개정 v0.2.0)

> **개정 이력**: 초판은 `better-auth/crypto`의 `hashPassword()`로 해시한 뒤 `user`/`account` 행을 Drizzle로 직접 INSERT했다(research.md §3 경로 C). 사용자 검토에서 "라이브러리의 내부 스키마·해시 규약에 대한 의존이 과하다"는 지적을 받아 **공식 서버 API 호출**로 교체했다.

**설계**: 스크립트 내부에서 프로덕션과 **동일한 Drizzle 어댑터·DB 연결**을 재사용하되, 자신만의 옵션을 갖는 별도 `betterAuth(...)` 인스턴스를 구성하고 그 인스턴스의 `auth.api.signUpEmail({ body })`를 호출한다.

```
scripts/provision-tester.ts
  ├─ validateEnv("provision")            ← §3.1 provision 스코프
  ├─ allowed_testers 등록 (선행 — 순서 불변)
  ├─ createProvisioningAuth()            ← 이 파일 안에서만 존재
  │    · database: drizzleAdapter(getDb(), ...)   ← 프로덕션과 동일
  │    · emailAndPassword: { enabled: true, autoSignIn: false }
  │      · disableSignUp 는 기본값(false) — 이 인스턴스에 한정
  │    · 어떤 HTTP 핸들러에도 연결하지 않는다
  └─ await auth.api.signUpEmail({ body: { email, password, name } })
```

**왜 이 형태가 셀프 가입 표면을 열지 않는가**: `disableSignUp` 판정은 **호출된 인스턴스 자신의 옵션**을 읽는다(research.md §0.1). 프로덕션 `lib/auth/config.ts`는 한 글자도 바뀌지 않으므로 `/api/auth/sign-up/email` 라우트는 계속 거부한다. 새 인스턴스는 라우트에 연결되지 않으므로 네트워크로 도달할 수 있는 경로가 존재하지 않는다 — 즉 "가입이 허용된 설정"은 존재하지만 **그 설정에 도달하는 입구가 없다**.

이 불변식이 위 주장의 유일한 근거이므로, 다음 두 가지가 설계 제약으로 고정된다:

1. 인스턴스는 `scripts/` 밖으로 export되지 않는다.
2. 인스턴스는 어떤 `route.ts`·핸들러·미들웨어에도 전달되지 않는다.

AC-RUNTIME-017이 이 비노출을 정적으로 검증하고, 스크립트에는 `@MX:WARN`을 부착한다(plan.md §F).

**얻는 것**: `providerId`·`accountId`·`issuer`·해시 포맷을 **라이브러리가 채운다**(research.md §0.1). 초판 설계에서 스크립트가 추정해야 했던 값이 전부 사라지고, `lib/db/schema.ts`의 `account.issuer` `notNull` 제약도 라이브러리가 스스로 만족시킨다. Better Auth 업그레이드 시 규약이 바뀌더라도 호출 측이 따라갈 일이 없다.

**`autoSignIn: false`인 이유**: 프로비저닝은 계정을 만드는 작업이지 로그인하는 작업이 아니다. 이 값이 거짓이면 라이브러리가 세션 생성·쿠키 설정 이전에 반환하므로(research.md §0.1), 불필요한 세션 행이 남지 않고 HTTP 쿠키 컨텍스트에 대한 의존도 생기지 않는다.

**순서 불변**: `allowed_testers` 등록 → 계정 생성. 개정 전후로 동일하다. 프로덕션 인스턴스의 `user.validateUserInfo`가 가입 시점 allowlist를 대조하므로, 프로비저닝 인스턴스가 같은 훅을 구성하더라도 선행 등록 덕분에 통과한다(훅 구성 여부는 §6의 구현 확정 항목).

**재실행 안전성(REQ-RUNTIME-009)**: 이메일 사전 조회로 기존 계정을 건너뛴다. 조회를 통과하더라도 라이브러리가 기존 사용자를 발견하면 행을 만들지 않고 반환하거나 오류를 던지며(research.md §0.1), `allowed_testers.email`/`user.email`의 `unique` 제약이 DB 레벨 방어로 남는다 — 세 겹 모두 "중복 행 0건"이라는 같은 결론으로 수렴한다.

**반환된 id를 신뢰하지 않는다**: `autoSignIn: false`는 `shouldReturnGenericDuplicateResponse`를 참으로 만들며, 이 조합에서 기존 이메일로 재실행하면 라이브러리는 오류 대신 **generic 중복 응답**을 반환한다(research.md §0.1). 이 응답에 실린 user 객체는 열거 공격(enumeration attack) 방어를 위해 **DB에 존재하지 않는 합성(synthetic) id**를 담을 수 있다 — 응답 형태만으로는 신규 생성과 중복 감지를 구별할 수 없게 만드는 것이 그 목적이기 때문이다. 따라서 프로비저닝 스크립트는 **이 경로에서 반환된 id를 DB 행 식별자로 사용하지 않는다**. 후속 처리에 실제 `user.id`가 필요하면 이메일로 DB를 다시 조회해 확정한다.

**비밀번호 제약**: Better Auth가 `minPasswordLength`(기본 8자)를 검증한다. 대화형 입력과 `TESTER_PASSWORD` 경로 모두 이 하한을 만족해야 하며, E2E가 생성하는 임시 비밀번호도 마찬가지다(§3.4).

#### 3.2.2 `scripts/cli-bootstrap.ts` — 명시적 환경 로드 관문 (신규 v0.3.0)

> **개정 이력**: v0.2.0까지의 설계는 `lib/env.ts`의 **검증**만 정의하고 그 앞의 **로드**를 정의하지 않았다. 그 결과 독립 실행 스크립트가 Next.js의 자동 `.env.local` 로딩에 무임승차한다는 가정이 암묵적으로 남아 있었다. 사용자 검토에서 이 가정이 지적되어 명시적 로드 단계를 신설했다.

**책임**: 독립 실행 스크립트의 **가장 첫 동작**으로 `.env.local`을 명시적으로 로드하고, 그 다음에 스코프 검증을 호출한다. 로드 방식은 이 모듈 한 곳에만 정의된다.

**책임 아님**: DB 연결, 작업 수행, 인자 파싱. 이 모듈은 "환경을 준비된 상태로 만든다"까지만 한다.

##### 왜 명시적 로드가 필요한가 — 적용 범위의 착오

Next.js의 자동 `.env.local` 로딩은 **`next build` / `next start` / `next dev`가 부팅하면서 로더를 호출하기 때문에** 일어난다. `design.md` §3.4가 인용하는 "Environment Variable Load Order" 문서도 그 경로를 기술한 것이다. 반면 `tsx scripts/db-migrate.ts`는 **Next.js를 거치지 않는 별개의 프로세스**이므로 그 로딩이 일어날 이유가 없다 — 프레임워크가 하는 일을 프레임워크 밖에서도 해줄 것으로 기대한 셈이다.

이 착오가 남아 있을 때의 증상은 진단하기 나쁘다. `.env.local`을 정확히 채운 운영자가 `pnpm db:migrate`를 실행하면 `TURSO_DATABASE_URL` 미설정으로 거부당한다. 운영자에게는 **"파일에 분명히 적었는데 없다고 한다"** 는 모순으로 보이므로, 원인을 검증 모듈의 결함으로 오해하기 쉽다. 정작 결함은 검증이 아니라 **로드가 일어나지 않았다**는 사실에 있다.

##### 구조

```
scripts/cli-bootstrap.ts
  └─ bootstrapCli(scope): 로드 → 검증 → 확정된 설정 반환
       1. loadEnvConfig(projectRoot)      ← @next/env 직접 호출 (명시적)
       2. validateEnv(scope)              ← §3.1 스코프 검증
       3. return 확정된 설정 객체

scripts/db-migrate.ts       ─┐
scripts/db-seed.ts           ├─ 첫 줄에서 bootstrapCli(<자기 스코프>) 호출
scripts/provision-tester.ts ─┘
scripts/run-e2e.ts           └─ E2E 환경 조립 후 bootstrapCli("e2e") 호출 (§3.4)
```

**순서 불변 (1 → 2)**: 검증은 **값이 존재하는지**를 판정하는데, 로드 전에는 판정할 값 자체가 없다. 순서가 뒤집히면 검증은 항상 "누락"을 보고하고, 그 뒤에 로드가 성공하더라도 프로세스는 이미 종료된 뒤다. 이 순서는 설계 제약으로 고정한다.

**단일 정의 (REQ-RUNTIME-021)**: 로드 동작은 이 모듈에만 존재한다. 스크립트마다 재구현하면 한쪽만 갱신됐을 때 로드 경로가 갈라지며, 이는 `lib/env.ts`를 단일 검증 관문으로 두는 것과 **같은 이유**다(§1 원칙 2).

##### 로드 메커니즘 — `@next/env`의 `loadEnvConfig`

`@next/env`의 `loadEnvConfig`를 직접 호출한다. 채택 근거:

- **Next.js 자신이 쓰는 바로 그 로더**다. 앱 부팅 경로와 스크립트 경로가 **동일한 파싱 의미**를 갖게 되므로, 같은 `.env.local` 파일이 두 경로에서 다르게 해석될 여지가 없다.
- 시그니처를 실측 확인했다 — `loadEnvConfig(dir: string, dev?: boolean, log?: Log, forceReload?: boolean, onReload?): { combinedEnv, parsedEnv, loadedEnvFiles }` (`research.md` §0.2).
- 자체 dotenv 파서를 만들면 따옴표·이스케이프·다중행·변수 치환 규칙을 재구현해야 하고, **프레임워크와 의미가 갈라질 수 있는 두 번째 파서**가 생긴다(`spec.md` §3 overengineering 금지).

**[HARD] 전제 — 직접 의존성 선언이 필요하다.** 실측 결과 `@next/env@16.3.2`는 pnpm 가상 스토어에만 있고 프로젝트 루트 `node_modules/@next/`는 **존재하지 않으며**, hoisting 설정도 없다(`research.md` §0.2). 따라서 현재 상태 그대로면 이 import는 `MODULE_NOT_FOUND`로 실패한다. M1은 **`@next/env`를 `next`와 동일한 `16.3.2`로 고정해 직접 devDependency로 선언**한 뒤 실제 import 성공을 실측해야 한다. 버전을 `next`와 어긋나게 두면 두 경로의 로더가 갈라지므로 **동일 버전 고정이 필수**다.

**`dir` 인자는 프로젝트 루트로 확정한다**: `.env.local`이 놓이는 위치가 루트이기 때문이다. 실행 시점 cwd에 의존하면 하위 디렉터리에서 실행했을 때 **조용히 아무것도 로드하지 않는다**(`loadEnvConfig`는 파일 부재를 `ENOENT`로 무시한다). 루트는 스크립트 파일 위치를 기준으로 확정하며, cwd에서 유도하지 않는다.

**`NODE_ENV` 주의 (§6 구현 확정 항목)**: 실측상 `loadEnvConfig`는 `NODE_ENV === "test"`일 때 로드 파일 목록에서 `.env.local`을 **제외**한다(`research.md` §0.2). 각 스크립트가 어떤 `NODE_ENV`로 실행되는지에 따라 로드 대상이 달라지므로 구현 시 실측으로 확인한다.

**로그 노출 금지**: `loadEnvConfig`의 반환값(`combinedEnv` / `parsedEnv`)은 시크릿 값을 담는다. 이 객체를 콘솔·오류 메시지·리포터에 출력하지 않는다(REQ-RUNTIME-011).

### 3.3 E2E 계층 — 단일 진입점이 소유하는 실행 (개정 v0.2.0)

> **개정 이력**: 초판은 `e2e/global-setup.ts`가 시크릿을 생성하고, 그 값이 Playwright의 `webServer`가 띄우는 Next.js 프로세스까지 환경 상속으로 전달된다고 가정했다. 사용자 검토에서 그 라이프사이클 가정 자체가 배제 대상으로 지목되어, **진입점 스크립트가 전 과정을 소유**하는 형태로 교체했다.

```
scripts/run-e2e.ts                     ← pnpm test:e2e 의 실제 진입점
  1. 임시 시크릿 생성 (BETTER_AUTH_SECRET, TESTER_PASSWORD)
  2. E2E 환경 집합을 자기 자신의 process.env 에 조립
       TURSO_DATABASE_URL=file:./.tmp/e2e.db, BETTER_AUTH_URL=http://localhost:3000, ...
  3. validateEnv("e2e")               ← §3.1 e2e 스코프
  4. .tmp/e2e.db 초기화 → 마이그레이션 → 시드 → 테스터 A·B 프로비저닝
       (scripts/db-migrate · db-seed · provision-tester 의 함수를 in-process 재사용)
  5. Playwright 를 자식 프로세스로 spawn
       └─ playwright.config.ts (webServer: pnpm build && pnpm start)
            └─ Next.js 서버 프로세스
       두 프로세스 모두 1-2 단계에서 조립된 부모 환경을 상속한다

playwright.config.ts
  · webServer: pnpm build && pnpm start (자동 기동/종료)
  · webServer.env 에 시크릿을 다시 적지 않는다 (상속으로 충분 — 재기재는 SSOT 이중화)
  · projects: chromium 단일

e2e/auth.spec.ts             → REQ-RUNTIME-012
e2e/case-flow.spec.ts        → REQ-RUNTIME-013, REQ-RUNTIME-014
e2e/tenant-isolation.spec.ts → REQ-RUNTIME-015
```

**`e2e/global-setup.ts`는 이 설계에 존재하지 않는다.** 훅을 하나 없애는 것이 곧 실행 순서 가정을 하나 없애는 것이다.

**설계 판단 (유지)**: DB 준비는 CLI 스크립트를 서브프로세스로 호출하는 대신 **동일 로직을 함수로 재사용**한다. 서브프로세스 호출은 환경변수 전달 경계가 하나 더 생겨 `file:` 격리가 새는 지점이 된다. 따라서 각 스크립트는 "얇은 CLI 껍데기 + 재사용 가능한 함수" 형태로 작성한다.

**셀렉터 정책**: 기존 마크업 구조·스타일은 변경하지 않는다. 안정적 참조가 필요한 지점에만 `data-testid`를 부착하며, 이는 UI 고도화(out of scope)가 아니라 검증 가능성 확보를 위한 최소 조치다.

### 3.4 E2E 환경변수 공급 경로 — 누가 무엇을 채우고, 왜 일치가 보장되는가

REQ-RUNTIME-016은 `pnpm test:e2e` **단일 명령**으로 사람 개입 없이 끝까지 실행될 것을, 그리고 서버 프로세스와 테스트 프로세스가 **동일한 실행 시점 시크릿을 공유함이 보장**될 것을 요구한다. 동시에 REQ-RUNTIME-008이 커밋 대상 파일에 시크릿을 쓰는 것을 금지한다. **셸에 미리 세팅하는 경로**(사람 개입 → REQ-RUNTIME-016 위반)와 **픽스처 파일에 적어두는 경로**(REQ-RUNTIME-008 위반)가 둘 다 막혀 있으므로, 값은 **실행 시점에 생성해서 프로세스 환경으로만 전달**한다.

공급 주체는 `scripts/run-e2e.ts`이며, **이 SPEC이 작성하는 어떤 단계도** 이 값들을 채우지 않는다. 다만 SPEC 바깥에 세 번째 공급원이 하나 더 존재한다 — 프레임워크가 스스로 로드하는 `.env.local`이다(아래 "세 번째 공급원").

| 변수 | E2E에서의 값 | 공급 방식 | 디스크에 남는가 |
|------|--------------|-----------|-----------------|
| `TURSO_DATABASE_URL` | `file:./.tmp/e2e.db` | 진입점 스크립트가 자기 환경에 설정 → 상속 | **아니오** (비밀은 아니나 SSOT 단일화를 위해 설정 파일에 중복 기재하지 않는다) |
| `TURSO_AUTH_TOKEN` | (미설정) | §3.1 capability gate가 `file:` 스킴에서 불필요로 판정 | — |
| `TESTER_PASSWORD` | **실행 시점 무작위 생성** (≥ 8자) | 진입점 스크립트가 생성 → 프로비저닝 호출(같은 프로세스)과 로그인 시나리오(자식 프로세스)가 동일 값을 참조 | **아니오** |
| `BETTER_AUTH_SECRET` | **실행 시점 무작위 생성**(E2E 전용) | 동일 | **아니오** |
| `BETTER_AUTH_URL` | `http://localhost:3000` | 진입점 스크립트가 설정 — `webServer` 기동 주소와 동일 | **아니오** |
| `GEMINI_API_KEY` | (설정하지 않음) | §3.1 `e2e`/`app` 스코프 모두 요구하지 않음 | — |

#### 일치가 보장되는 근거 — 가정이 아니라 프로세스 계보

초판은 `globalSetup`이 쓴 값이 별도로 spawn되는 `webServer` 자식에 반영된다고 **가정**했다. 두 훅은 서로 다른 라이프사이클 단계이며, 실행 순서와 환경 전파는 프레임워크 내부 동작이다. 그 가정이 깨졌을 때의 증상은 진단하기 어렵다 — 서버는 시크릿 A로 세션을 서명하고 테스트는 시크릿 B로 로그인하므로, 표면적으로는 원인 불명의 인증 실패로만 보인다.

개정 설계는 그 가정을 **프로세스 계보로 대체**한다:

```
scripts/run-e2e.ts        ← 여기서 시크릿이 생성되고 환경이 조립된다
      │  (spawn — 자식은 부모 환경을 상속)
      ▼
Playwright 러너 프로세스   ← 테스트 코드가 TESTER_PASSWORD 를 읽는 곳
      │  (spawn — 자식은 부모 환경을 상속)
      ▼
Next.js 서버 프로세스      ← BETTER_AUTH_SECRET 로 세션을 서명하는 곳
```

두 소비자는 **같은 조상 프로세스의 환경**을 물려받으므로 서로 다른 값을 볼 수 있는 경로가 존재하지 않는다. 이는 특정 테스트 도구의 동작이 아니라 자식 프로세스가 부모 환경을 상속한다는 성질에 기댄 것이며, `playwright.config.ts`의 `webServer` 설정을 유지하더라도 성립한다 — 단, **`webServer.env`에 시크릿을 다시 적지 않는다**(두 곳에 값이 존재하면 어느 쪽이 실효인지 모호해지고, 재기재 자체가 초판이 제거하려던 종류의 가정을 되살린다).

DB 준비 역시 Playwright를 띄우기 **전에** 끝난다. 서버 기동과 DB 준비 사이의 상대 순서가 훅 순서에 종속되지 않으므로, "서버가 먼저 떠서 빈 DB를 본다"는 실패 양상이 구조적으로 제거된다.

#### 세 번째 공급원 — `.env.local` (프레임워크가 독립적으로 로드)

위 계보는 **상속된 값**의 일치를 보장하지만, 상속이 유일한 공급원이라는 뜻은 아니다. `webServer`가 기동하는 Next.js 서버 프로세스는 부모 환경을 물려받는 것과 **별개로** `.env.local`을 디스크에서 자체 로드한다. 따라서 이 SPEC이 통제하는 공급 경로는 셋이 아니라 **둘뿐**이고, 세 번째는 프레임워크가 소유한다:

| # | 공급원 | 이 SPEC의 통제 여부 | 채택 |
|---|--------|---------------------|------|
| 1 | `scripts/run-e2e.ts`가 조립한 환경 → 자식 프로세스 상속 | 통제함 | ✓ 유일 채택 경로 |
| 2 | `playwright.config.ts`의 `webServer.env` 재기재 | 통제함 | ✕ 금지(SSOT 이중화 — 위 표 참고) |
| 3 | **`.env.local` (Next.js가 디스크에서 자체 로드)** | **통제하지 않음** | — 존재를 전제하고 설계해야 함 |

3번이 중요한 이유는 이 SPEC 자신의 런북 때문이다. `research.md` §2 절차는 `.env.local.example`을 `.env.local`로 복사해 **실제 원격 Turso 자격증명**을 기입하라고 지시하며, `.env.local.example`은 `libsql://<database-name>-<org>.turso.io` 형태의 원격 URL 플레이스홀더를 담고 있다. 즉 **런북을 따른 개발자의 정상적인 머신 상태**에서 `pnpm test:e2e`를 실행하면, 상속된 `TURSO_DATABASE_URL=file:./.tmp/e2e.db`와 디스크의 실제 원격 URL이 **동시에 존재**한다. "셸에 시크릿이 미리 설정되어 있지 않다"는 조건은 이 상태를 배제하지 못한다 — `.env.local`은 셸이 아니라 디스크에 있기 때문이다.

**설계 요구(불변)**: `scripts/run-e2e.ts`가 조립한 값은 `.env.local`의 내용과 **무관하게 반드시 이겨야 한다**. 이 보장이 없으면 로컬 파일 DB 격리(REQ-RUNTIME-017)가 개발자 머신 상태에 따라 성립하기도 하고 깨지기도 하며, 깨지는 쪽의 증상은 "E2E가 개발자의 실제 Turso 인스턴스에 쓴다" — 즉 이 SPEC이 막으려던 바로 그 사고다.

**근거 등급: 문서 + 소스 (실행은 여전히 미관측) — v0.3.0에서 승격**. 설치된 Next.js 문서는 환경변수 조회 순서를 `process.env` → `.env.$(NODE_ENV).local` → `.env.local` → `.env.$(NODE_ENV)` → `.env`로 명시하고 "*stopping once the variable is found*"이라고 기술한다(`node_modules/next/dist/docs/01-app/02-guides/environment-variables.md` §Environment Variable Load Order). v0.3.0에서 **실제 로더 구현을 소스로 확인**했다 — `@next/env`의 `processEnv`가 파일 파싱 결과를 `if(typeof u[t]==="undefined" && typeof p[t]==="undefined")` 조건으로만 채택하며 `p`는 최초 `process.env` 스냅샷의 사본이므로, **상속된 키는 `.env.local` 값으로 덮이지 않는다**(전문 인용: `research.md` §0.2 결론 2). v0.2.0 시점에 "번들·미니파이되어 확인 불가"로 기록했던 것은 `next/dist/compiled/...` 안의 사본을 찾은 결과였고, 실제로는 `@next/env` 패키지에 읽을 수 있는 형태로 존재했다.

**그럼에도 플랜 단계에서 확정하지 않는다.** 승격된 것은 "문서가 그렇게 말한다" → "설치된 로더 소스가 그렇게 구현되어 있다"까지이며, **이 프로젝트 구성에서 실행해 관측한 결과는 아니다**(이 셸에 `node`가 없다 — `research.md` §6). 소스는 근거이지 관측이 아니다. 따라서 **구체적 보장 메커니즘의 확정은 run-phase M5로 미룬다**:

- 소스상 우선순위가 M5 실측으로 확인되면 → 추가 조치 없이 성립(현행 설계 그대로).
- 확인되지 않으면 → M5가 명시적 조치를 도입한다. 예: 프레임워크의 `.env.local` 로드 **이후** E2E 스코프 변수를 다시 덮어쓰기, 또는 E2E 실행 동안 `.env.local` 로드 자체를 회피. 어느 형태든 `lib/env.ts`의 스코프 검증(§3.1)과 `getDb()` 단일 경로(§2)는 변경하지 않는다.

#### 우선순위 시험의 blast radius 제거 — sentinel 값 (개정 v0.3.0)

**[HARD] 설계 제약**: 이 AC의 **어떤 검증 방법도 실제로 동작하는 원격 Turso 자격증명을 사용해서는 안 된다.**

v0.2.0의 AC-RUNTIME-015는 "현실적 상태"를 재현하기 위해 `.env.local`에 **실제 원격 Turso 자격증명**이 기입된 상태를 Given으로 요구했다. 그 설계에는 자기모순이 있다 — 이 시험이 검증하려는 명제는 "상속된 값이 `.env.local`을 이긴다"인데, **그 명제가 거짓일 경우 시험 자체가 개발자의 실제 프로덕션 Turso 인스턴스에 연결하고 기록한다**. 즉 검증 절차가 REQ-RUNTIME-017이 막으려는 바로 그 사고를 유발하는 경로가 된다. 가정이 참일 때만 안전한 시험은, 가정을 검증하는 시험으로 쓸 수 없다.

**채택 설계 — 형태는 실제와 같고 도달 대상은 없는 값**:

| 항목 | 값 | 성질 |
|------|-----|------|
| `TURSO_DATABASE_URL` | `libsql://sentinel-nonexistent-host.invalid` | 실제 원격 URL과 **동일한 `libsql://` 스킴** — §3.1 capability gate가 실제 원격 케이스와 같은 분기를 탄다 |
| `TURSO_AUTH_TOKEN` | 형태만 갖춘 더미 플레이스홀더 | 어떤 실제 토큰과도 무관 |

`.invalid` TLD 선택 근거는 규격 보장이다 — **RFC 2606 §2**가 이 TLD를 예약해 등록 불가로 지정하고, **RFC 6761 §6.4**가 이름 해석 API·라이브러리에 대해 **즉시 부정 응답을 반환할 것(SHOULD)** 을 규정한다. 실패가 "아마 안 될 것"이 아니라 **규격상 보장된 즉시 실패**라는 점이 핵심이다(대안 비교: `research.md` §0.2 결론 3 — `example.com`은 실제로 해석되고, RFC 5737 문서화용 IP는 타임아웃으로 늘어진다).

이 교체는 **검증 범위를 줄이지 않는다**. 우선순위 성질은 그대로 시험되며, 달라지는 것은 가정이 깨졌을 때의 결과뿐이다:

| 우선순위 판정 | v0.2.0 (실제 자격증명) | v0.3.0 (sentinel) |
|---------------|------------------------|-------------------|
| 상속된 `file:` 값이 이김 (기대) | 로컬 파일 DB 정상 동작 | 로컬 파일 DB 정상 동작 (동일) |
| `.env.local`이 이김 (가정 붕괴) | **실제 프로덕션 Turso에 연결·기록** ← 사고 | 비라우팅 호스트에 대한 **연결/DNS 실패** ← 안전한 진단 신호 |

가정이 깨진 경우의 실패는 **버려지는 정보가 아니라 진단 정보**다 — "우선순위 가정이 틀렸으므로 `design.md` §6의 명시적 조치를 도입하라"는 신호로 해석한다. AC-RUNTIME-015 Then이 이 해석을 명시해 네트워크 일시 장애로 오진하는 것을 막는다(`spec.md` §5 잔여 위험).

어느 쪽이든 **검증 기준은 동일하게 AC-RUNTIME-015**이며, 그 AC는 sentinel 원격 자격증명이 담긴 `.env.local`이 존재하는 상태에서 통과해야 한다. 플랜 단계가 이 메커니즘을 해결할 필요는 없다 — 필요한 것은 **이미 해결되어 있다고 암묵적으로 가정하지 않는 것**이다.

**무작위 생성 두 건의 설계 근거**:

- `TESTER_PASSWORD`는 프로비저닝(쓰기)과 로그인 시나리오(읽기)가 **같은 값**을 봐야 하므로 어딘가에 공유되어야 한다. 파일로 공유하면 REQ-RUNTIME-008에 걸리고, 상수로 박아두면 그 상수 자체가 커밋된 비밀번호가 된다. 실행 시점 생성 + 프로세스 환경 공유는 두 제약을 동시에 만족하는 유일한 형태다. 값은 프로세스 종료와 함께 사라지므로 매 실행이 새 자격증명을 쓴다. Better Auth의 `minPasswordLength`(기본 8자)를 만족하도록 생성한다(§3.2.1).
- `BETTER_AUTH_SECRET`은 세션 토큰 서명 키다. 개발자의 실제 시크릿을 E2E에 끌어오면 로컬 DB 격리(REQ-RUNTIME-017)를 지켜놓고 시크릿 격리를 깨는 셈이 되므로, E2E 전용 무작위 값을 쓴다. E2E는 매 실행 DB를 초기화하므로 이전 실행의 세션을 이어받을 필요가 없어 값이 매번 달라도 무방하다.

**부팅 검증과의 관계**: `webServer`는 `pnpm build && pnpm start`를 기동하므로 §3.1의 `app` 스코프 fail-fast 검증을 그대로 통과해야 한다. `app` 스코프가 요구하는 변수가 모두 채워진 상태로 서버 프로세스에 전달되는 것이 이 절의 목적이며, 하나라도 빠지면 앱이 부팅되지 않아 E2E 전체가 실패한다 — 즉 이 공급 경로의 정합성은 별도 검증 없이 E2E 실행 자체로 드러난다.

**로그 노출 금지**: 생성된 두 값은 콘솔·리포터·아티팩트에 출력하지 않는다. Playwright 실패 리포트가 환경변수를 덤프하지 않도록 하는 것을 포함한다.

### 3.5 시크릿 공유의 검증 — 구조적 검증과 기능적 검증의 분리 (신규 v0.3.0)

> **개정 이력**: v0.2.0의 AC-RUNTIME-015 (3)항은 "로그인 시나리오가 통과한다는 사실 자체가 서버 프로세스와 테스트 프로세스의 시크릿 일치를 **입증한다**"고 기술했다. 사용자 검토에서 이것이 논리적 과잉주장으로 지적되어, 검증을 두 층으로 분리했다.

##### 왜 로그인 성공이 시크릿 동일성의 증거가 아닌가

세 가지 이유로 그 추론은 성립하지 않는다:

1. **관측 대상과 주장 대상의 불일치.** 주장하려는 명제는 "두 프로세스가 같은 `BETTER_AUTH_SECRET` 값을 받았다"는 **프로세스 간 상태 일치**에 관한 것이다. 그런데 관측한 것은 로그인 흐름의 최종 결과라는 **기능적 성질**이다. 상태의 동일성을 주장하려면 상태 자체를 봐야 한다.
2. **역추론의 전제가 확보되지 않았다.** "불일치했다면 실패했을 것이다"는 **로그인을 성공시킬 다른 경로가 전혀 없을 때만** 성립한다. 세션 쿠키 재사용, 캐시된 세션, 재시도 로직 등이 배제되었음을 이 SPEC은 확인하지 않았다.
3. **두 성질을 하나의 관측에 묶으면 진단이 무너진다.** 이 추론을 유지하면 로그인 실패 시 원인이 "시크릿 불일치"인지 "인증 흐름 결함"인지 구별할 수 없다 — 하나의 관측이 두 명제를 동시에 담당하기 때문이다.

##### 채택 설계 — 두 층으로 분리

| 층 | 검증 대상 | 수단 | AC |
|----|-----------|------|-----|
| **구조적** | `run-e2e.ts`가 각 자식 프로세스 생성 호출에 **동일한 env 값 집합을 전달한다** | 단위 테스트 — 자식 프로세스 생성 호출을 가로채 **전달된 env 객체를 직접 단언**. Playwright·브라우저·앱 기동 **불필요** | AC-RUNTIME-022 |
| **기능적** | 실제 인증 흐름(폼 제출 → 세션 생성 → 보호 경로 접근)이 **동작한다** | Playwright 로그인 시나리오 | AC-RUNTIME-011 / AC-RUNTIME-015 |

**구조적 검증의 형태**: `scripts/run-e2e.ts`는 자식 프로세스 생성 로직을 **주입 가능한 형태**로 분리한다(예: spawn 함수를 인자로 받는 실행 함수). 단위 테스트는 실제 spawn 대신 **기록용 대역**을 주입해, 호출별로 전달된 env 객체를 수집한 뒤 다음을 단언한다:

- Playwright 러너 프로세스에 전달된 env와 서버 프로세스에 전달된 env가 `BETTER_AUTH_SECRET`·`TESTER_PASSWORD`·`TURSO_DATABASE_URL`·`BETTER_AUTH_URL`에 대해 **동일 값**을 갖는다.
- 그 값들이 진입점이 조립한 값과 일치한다(즉 중간에 재조립·누락되지 않는다).

이 형태를 택한 이유는 **관측 지점을 주장 지점과 일치시키기 위해서**다. 주장이 "전달된 env가 같다"이므로, 관측도 전달된 env여야 한다. 프로세스를 실제로 띄울 필요가 없어 `pnpm test`(Vitest)에서 브라우저 없이 실행되며(REQ-RUNTIME-018 유지), 실패 시 어떤 변수가 어떻게 갈라졌는지가 **즉시 드러난다** — 로그인 실패라는 간접 증상으로 나타나던 것과 대비된다.

> **프로세스 토폴로지 의존성**: 위 단언은 §3.4의 계보(`run-e2e.ts` → Playwright → Next.js 서버)를 전제한다. 구현 시 실제 토폴로지가 다르게 확정되면(예: 서버를 진입점이 직접 spawn) 단언 대상 호출 집합도 그에 맞춰 조정하되, **"각 자식에 전달된 env를 직접 관측한다"는 성질은 유지**한다(§6 구현 확정 항목).

**이 분리는 검증 범위를 넓힌다**: 기존에는 간접 추론만 존재하던 구조적 성질에 **직접 관측이 추가**되고, Playwright 시험은 자신이 실제로 증명하는 것(인증 흐름의 동작)만 주장하게 된다. 어느 쪽도 약화되지 않는다.

## §4. 데이터 흐름 — 검증 대상 시나리오

```
[운영자 준비 단계 — 1회]
  pnpm db:migrate ─▶ 9개 테이블 생성
  pnpm db:seed    ─▶ evidence 테이블 적재
  pnpm tester:add ─▶ allowed_testers 등록 → user 행 → credential account 행

[E2E 검증 흐름 — 매 실행]
  로그인 (/login)
    └─▶ Better Auth: 자격증명 검증
          └─▶ databaseHooks.session.create.before → allowed_testers 대조
                └─▶ 통과 시 세션 생성 / 미등록 이메일이면 거부   ← REQ-RUNTIME-012

  사건 입력 (/cases/new)
    └─▶ POST /api/cases
          └─▶ getCurrentSession() 재확인
                └─▶ createCase(): validateCaseInput → runPipeline(mock) → cases + reports 삽입
                      └─▶ 201 { caseId }                                  ← REQ-RUNTIME-013

  리포트 조회 (/cases/[caseId])
    └─▶ owner_user_id 스코핑 조회
          ├─▶ 소유자: 리포트 렌더링                                        ← REQ-RUNTIME-013
          └─▶ 타 사용자: 접근 거부                                         ← REQ-RUNTIME-015

  피드백 제출 (서버 액션 submitFeedback)
    └─▶ feedback 테이블 삽입                                              ← REQ-RUNTIME-014
```

이 흐름의 모든 애플리케이션 코드는 **이미 존재한다**. 이번 SPEC이 추가하는 것은 흐름을 실제로 성립시키는 전제(마이그레이션·시드·계정)와 그것을 재현 가능하게 검증하는 수단이다.

## §5. 보존되는 경계 (변경 금지)

| 경계 | 정의 위치 | 이번 SPEC에서의 취급 |
|------|-----------|---------------------|
| 6단계 mock 파이프라인 | `lib/pipeline/**` | 불변. `runPipeline`은 여전히 mock 결과를 반환한다 |
| AI provider 인터페이스 | `lib/ai/provider.ts` | 불변. Gemini SDK는 `lib/ai/providers/gemini.ts` 밖에서 import되지 않는다 |
| PII 차단 계층 | `lib/validation/case-input.ts` | 불변. E2E는 유효한(PII 없는) 입력만 사용한다 |
| Drizzle 단일 DB 접근 경로 | `lib/db/client.ts` + `schema.ts` | `schema.ts` 불변. `client.ts`는 검증 위임만 수정, `getDb()` 지연 생성 패턴 유지 |
| evidence 조회 경로 | `lib/pipeline/evidence-retriever.ts` + `app/cases/[caseId]/page.tsx` | **불변**. 시드가 DB에 들어가더라도 두 모듈 모두 계속 JSON을 직접 읽는다(각각 `evidence-retriever.ts:1`, `page.tsx:5`의 `db/seed/evidence.json` import) — DB 조회로의 전환은 후속 SPEC 사안이다. 전환 시 고쳐야 할 지점이 파이프라인 한 곳이 아니라 **뷰 레이어까지 두 곳**임을 여기 기록해 둔다 |

마지막 항목은 의도적 설계 결정이다. 시드 적재와 파이프라인 조회 경로 전환은 별개의 관심사이며, 후자를 이번 SPEC에 끌어들이면 "런타임 활성화"가 "파이프라인 개편"으로 번진다.

## §6. 설계상 열린 지점 (구현 시 확정)

아래는 설계 의도는 확정됐으나 **구체 형태를 구현 시점의 실측으로 확정**해야 하는 항목이다. `research.md` §6의 미검증 사항과 대응한다.

- `app` 스코프 부팅 검증 훅의 정확한 위치 — `instrumentation.ts`의 `register()`가 `pnpm build` 단계(환경변수 없는 라우트 데이터 수집)와 충돌하는지 실측 후 확정한다. **충돌 시의 조정 방향은 "빌드 단계에서만 검증을 건너뛰고, 런타임 부팅 훅에서는 항상 검증"으로 고정한다** — 빌드 단계 판별 방식(Next.js가 노출하는 빌드 페이즈 표시자 등)은 구현 시 실측으로 확정하되, **검증 시점을 런타임 첫 요청 경계로 미루는 조정은 허용하지 않는다**. 첫 요청 경계는 부팅 시점이 아니므로, 그 조정은 REQ-RUNTIME-010이 닫으려는 지연 실패 문제(`lib/db/client.ts`의 현행 동작)를 그대로 재도입한다 — 즉 이 SPEC의 존재 이유를 무효화하는 폴백이다. 빌드 단계 스킵은 지연 실패가 아니다: 빌드에는 검증할 런타임 환경 자체가 없고, 실제 기동 경로는 여전히 부팅 시점에 전량 검증된다. **목적별 스코프 개정(v0.2.0)은 이 판단을 완화하지 않는다** — 바뀐 것은 `app` 스코프가 요구하는 변수 집합이지, 검증이 일어나는 시점이 아니다.
- 프로비저닝 인스턴스의 `user.validateUserInfo` 훅 구성 여부 — allowlist 등록이 선행되므로 훅을 구성하든 생략하든 통과한다(§3.2.1). 방어적 이중 검증을 택할지, 스크립트를 최소로 유지할지는 구현 판단에 맡긴다. 어느 쪽이든 `disableSignUp` 기본값과 비마운트 불변식은 변경하지 않는다.
- `auth.api.signUpEmail` 호출 시 `headers` 인자 전달 여부 — 라이브러리 테스트 유틸은 조건부로만 전달한다(research.md §0.1). 이 프로젝트 구성에서 생략 가능한지는 구현 시 실측으로 확정하며, AC-RUNTIME-007이 결과를 검증한다.
- **`@next/env` 직접 devDependency 선언 및 import 성공 실측 (v0.3.0 신설, M1 최우선)** — 실측상 `@next/env@16.3.2`는 pnpm 가상 스토어에만 있고 루트 `node_modules/@next/`는 부재하며 hoisting 설정도 없다(`research.md` §0.2). M1은 `next`와 동일한 `16.3.2`로 고정해 직접 devDependency로 선언한 뒤 `scripts/`에서의 실제 import 성공을 실측한다. **선언 없이 스크립트를 작성하면 세 CLI 모두 `MODULE_NOT_FOUND`로 기동 실패**하므로, 이 항목은 §3.2.2 전체의 선행 조건이다.
- **독립 실행 스크립트 전체의 TypeScript 실행 방식 (v0.3.0 확장)** — 기존에는 E2E 진입점만의 문제로 기록했으나, `db-migrate`/`db-seed`/`provision-tester`도 동일한 독립 실행 스크립트이므로 **네 스크립트 공통 문제**다. 실측상 `node_modules/.bin/tsx`가 없어 현재 `tsx scripts/*.ts`가 불가하고, `node --experimental-strip-types`는 Node 22.6+ 기능이라 `tech.md`의 Node 20.x LTS 하한에서 성립하지 않는다. M1에서 `node --version`을 실측한 뒤 (a) 타입 스트리핑 직접 실행 또는 (b) `tsx` 직접 devDependency 선언 중 하나로 확정한다. **새 런타임 의존성 추가는 다른 경로가 없을 때만 허용**하며(§1 원칙, `spec.md` §3), (b)를 택하는 경우에도 `spec.md` §3 "의존성 추가의 허용 범위"(트리에 이미 있는 전이 의존성의 명시화)를 벗어나지 않는다 — `tsx@4.23.12`는 이미 스토어에 존재한다.
- **각 실행 경로의 `NODE_ENV` 값과 로드 대상 파일 집합 (v0.3.0 신설)** — 실측상 `loadEnvConfig`는 `NODE_ENV === "test"`일 때 로드 목록에서 `.env.local`을 **제외**한다(`research.md` §0.2). 네 스크립트가 각각 어떤 `NODE_ENV`로 실행되는지에 따라 의도한 파일이 로드되지 않을 수 있으므로, M1/M5에서 실제 값을 확인하고 필요 시 명시적으로 고정한다. AC-RUNTIME-021이 이 경로를 검증 대상으로 삼는다.
- **구조적 env 공유 검증의 대상 호출 집합 (v0.3.0 신설)** — §3.5의 단위 검증은 `run-e2e.ts` → Playwright → Next.js 서버라는 §3.4 계보를 전제한다. 구현 시 실제 프로세스 토폴로지가 다르게 확정되면 단언 대상 호출 집합을 그에 맞게 조정하되, **"각 자식 프로세스에 전달된 env 객체를 직접 관측한다"는 성질은 유지**한다. 로그인 성공을 시크릿 동일성의 증거로 되돌리는 형태는 허용하지 않는다(AC-RUNTIME-022).
- `vitest.config.ts`의 `e2e/**` 제외 방식 — 현행 include/exclude 확인 후 최소 수정.
- **진입점 환경값이 `.env.local`을 이기는 보장 메커니즘** — Next.js의 `process.env` ↔ `.env.local` 우선순위는 v0.3.0에서 **소스로 확인**되었으나(`@next/env`의 `processEnv`가 기존 `process.env` 키를 덮지 않음 — `research.md` §0.2 결론 2), **실행으로 관측되지는 않았다**(이 셸에 `node` 부재). M5에서 실측한 뒤, 소스대로면 추가 조치 없이 성립하고 아니면 명시적 덮어쓰기 또는 `.env.local` 로드 회피를 도입한다(§3.4 "세 번째 공급원"). **어느 경우에도 완화하지 않는 것**: AC-RUNTIME-015는 `.env.local`에 **sentinel 원격 자격증명**이 존재하는 상태에서 통과해야 하며, `.env.local` 부재 상태에서 얻은 PASS는 REQ-RUNTIME-017의 증거가 되지 않는다. **v0.3.0 제약**: 이 항목의 어떤 검증도 실제로 동작하는 원격 자격증명을 사용하지 않는다(§3.4 sentinel 절).
