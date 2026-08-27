# 런타임 활성화 런북 (SPEC-RUNTIME-001)

> 이 문서를 처음 접하는 운영자가, 여기 적힌 절차만 순서대로 따라가면 로컬
> 환경에서 DB 연결부터 E2E 실행까지 전 과정을 완료할 수 있도록 작성했다.
> 관련 SPEC: `.moai/specs/SPEC-RUNTIME-001/`(요구사항은 `spec.md`, 설계 근거는
> `design.md` 참고).

## 0. 준비물

- Node.js가 설치되어 있어야 한다(하한: `tech.md`의 Node 20.x LTS. `tsx`/`node
  --experimental-strip-types` 실행 방식은 설치된 버전에 따라 달라질 수
  있으므로 자세한 내용은 `design.md` §6을 참고).
- `pnpm install`로 의존성을 설치해 둔다.
- 아래 세 종류의 값 중 사용할 조합을 미리 확보한다:
  - **로컬 파일 DB로 시작하는 경우**(가장 빠른 시작 경로): 별도 발급 없이
    바로 진행 가능 — 아래 1단계의 `file:` 예시를 그대로 쓴다.
  - **원격 Turso 인스턴스를 쓰는 경우**: Turso 대시보드(https://turso.tech)에서
    데이터베이스를 만들고 `TURSO_DATABASE_URL`·`TURSO_AUTH_TOKEN`을 발급받는다.
  - Gemini API 키는 **실제 Gemini를 호출하는 정상 앱 기동에서만 필요하다** — 테스트/E2E처럼 결정론적 provider로 돌릴 때는 필요 없다(3단계 참고).

## 1. 환경변수 설정 (연결)

`.env.local.example`을 `.env.local`로 복사한 뒤 값을 채운다.

```bash
cp .env.local.example .env.local
```

**가장 빠른 시작 — 로컬 파일 DB**: 원격 Turso 없이 로컬에서 바로 시작하려면
`TURSO_DATABASE_URL`을 `file:` 스킴으로 지정한다.

```
TURSO_DATABASE_URL="file:./.tmp/local-dev.db"
```

`file:` 스킴을 쓸 때는 `TURSO_AUTH_TOKEN`이 필요 없다(아래 2단계 스코프
매트릭스의 "조건부" 참고 — 원격 인스턴스(`libsql://`/`https://`)를 쓸 때만
요구된다).

`BETTER_AUTH_SECRET`은 32바이트 이상의 무작위 문자열이면 된다. 예:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

`GEMINI_API_KEY`는 **실제 Gemini 호출로 앱을 기동할 때만 필요하다** —
`LLM_PROVIDER_MODE=deterministic`으로 돌리는 테스트/E2E에서는 필요 없다.
자세한 조건은 3단계에서 설명한다.

**중요 — 셸에 export할 필요가 없다**: 아래 마이그레이션·시드·테스터 생성
세 단계는 셸 환경변수를 전혀 읽지 않는다. `scripts/cli-bootstrap.ts`가 각
스크립트의 첫 동작으로 `.env.local` 파일을 직접 로드하기 때문이다(자세한
근거는 `design.md` §3.2.2). 즉 `.env.local` 파일에 값을 채워 넣기만 하면
충분하고, `export TURSO_DATABASE_URL=...`처럼 셸에 값을 노출시키는 절차는
필요 없다. 이 사실을 모르면 "스크립트니까 셸 export가 필요하겠지"라고 짐작해
불필요하게 셸 히스토리에 시크릿을 남기게 되므로, 굳이 여기 명시해 둔다.

## 2. 각 단계가 필요로 하는 환경변수 (스코프 매트릭스)

아래 표는 어떤 명령이 어떤 변수를 실제로 요구하는지 보여준다(SSOT:
`design.md` §3.1). 필요 없는 변수까지 채워 넣을 필요는 없다 — 각 명령은
자신의 열에서 "필수"로 표시된 항목만 검증한다.

| 변수 | `db`(마이그레이션·시드) | `provision`(테스터 생성) | `app`(Next.js 부팅) | `e2e`(`pnpm test:e2e`) |
|------|:---:|:---:|:---:|:---:|
| `TURSO_DATABASE_URL` | 필수 | 필수 | 필수 | 필수(자동 조립) |
| `TURSO_AUTH_TOKEN` | 조건부* | 조건부* | 조건부* | 조건부* |
| `BETTER_AUTH_SECRET` | — | 필수 | 필수 | 필수(자동 생성) |
| `BETTER_AUTH_URL` | — | — | 필수 | 필수(자동 조립) |
| `TESTER_PASSWORD` | — | 조건부** | — | 필수(자동 생성) |
| `GEMINI_API_KEY` | — | — | 조건부*** | 요구하지 않음(자동 면제) |

\* `TURSO_DATABASE_URL`이 `libsql://` 또는 `https://`로 시작하는 원격
인스턴스를 가리킬 때만 필요하다. `file:` 로컬 파일을 쓰면 필요 없다.

\*\* `pnpm tester:add`를 대화형 프롬프트 없이 비대화형으로 실행할 때만
필요하다(4단계 참고).

\*\*\* **`GEMINI_API_KEY`는 `app` 스코프에서 조건부 필수다.**
`LLM_PROVIDER_MODE` 환경변수가 `deterministic`으로 설정되지 않은 정상 앱
부팅 경로에서만 요구된다(`lib/env.ts`, SPEC-RESEARCH-001 design.md §2).
`e2e`는 `scripts/run-e2e.ts`가 내부적으로 `LLM_PROVIDER_MODE=deterministic`을
자동 주입해 이 검증에서 면제되므로, 이 값이 없어도 `pnpm test:e2e`는 정상
동작한다.

`e2e` 열의 "자동 생성/자동 조립" 항목은 5단계에서 설명한다.

## 3. 마이그레이션 적용

```bash
pnpm db:migrate
```

Drizzle 마이그레이션을 적용한다. 이미 적용된 마이그레이션은 추적 테이블
기준으로 건너뛰므로 여러 번 실행해도 안전하다(REQ-RUNTIME-002).

## 4. 시드 데이터 적재

```bash
pnpm db:seed
```

`evidence` 등 초기 데이터를 적재한다. `id` 기준 `onConflict`로 처리되므로
재실행해도 중복 행이 생기지 않는다.

## 5. 테스터 계정 생성

```bash
pnpm tester:add -- --email <이메일>
```

인자 없이 실행하면 이메일·비밀번호를 대화형으로 입력받는다. CI 등
비대화형 환경에서 자동화하려면 `.env.local`에 `TESTER_PASSWORD`를 채워
두고 이메일만 인자로 전달한다.

이미 존재하는 이메일로 재실행하면 새 계정을 만들지 않고 건너뛴다
(재실행 안전성 — `design.md` §3.2.1).

## 6. E2E 사전 준비

E2E는 실제 chromium 브라우저를 구동하므로, 최초 1회 브라우저 바이너리를
설치해야 한다:

```bash
pnpm exec playwright install --with-deps chromium
```

이 프로젝트는 chromium 하나만 사용한다(다른 브라우저 설치는 불필요).

**시크릿을 미리 준비할 필요가 없다**: 위 1~5단계와 달리, E2E 실행에
필요한 `BETTER_AUTH_SECRET`과 `TESTER_PASSWORD`는 운영자가 `.env.local`이나
셸에 채워 넣는 값이 **아니다**. `scripts/run-e2e.ts`(즉 `pnpm test:e2e`의
실제 진입점)가 실행될 때마다 이 두 값을 자체적으로 새로 생성해 프로세스
환경에만 전달하고, 자식 프로세스(Playwright → Next.js 서버)는 이를
상속받는다(`design.md` §3.4). 디스크에도, `.env.local`에도 이 값이
기록되지 않는다.

이 사실을 모르면 앞 단계에서 익힌 "시크릿은 직접 발급해서 채워 넣는다"는
패턴을 E2E에도 그대로 적용하려다가, 어디에 무엇을 채워야 할지 몰라
막히게 된다 — E2E 단계는 준비물이 다르다는 점을 기억해 둔다.

E2E는 매 실행마다 로컬 파일 DB(`.tmp/e2e.db`)를 초기화하고 마이그레이션·
시드·테스터 A/B 프로비저닝을 자동으로 다시 수행하므로, 원격 Turso 인스턴스나
1~5단계에서 준비한 데이터에 전혀 손대지 않는다(`design.md` §3.3).

## 7. E2E 실행

```bash
pnpm test:e2e
```

로그인·사건입력·피드백·테넌트 격리 시나리오가 순서대로 실행된다.

### 알아두어야 할 것 — Windows에서 종료가 자동으로 정리된다

Windows 환경에서는 테스트가 전부 통과한 뒤에도 Playwright가 자신의
`webServer`(Next.js `next start`) 프로세스를 teardown 단계에서 스스로
종료하지 못하고 남기는 경우가 있다(pnpm의 셸 래핑과 Windows 프로세스 트리
종료 방식이 겹쳐 발생 — 자세한 재현 기록은
`.moai/specs/SPEC-RUNTIME-001/progress.md` §E.2 M5/M7 절 참고). 예전에는
이 경우 운영자가 `Ctrl+C`로 직접 정리해야 했다.

**지금은 `scripts/run-e2e.ts`의 감시(watchdog) 로직이 이를 자동으로
정리한다** — 기대한 테스트 결과가 전부 나온 뒤 일정 시간 안에 프로세스가
스스로 끝나지 않으면, E2E가 사용한 포트를 점유한 그 고아 프로세스 하나만
찾아 강제 종료하고 정상적으로 `exit 0`을 반환한다(다른 프로젝트의 서버는
건드리지 않는다 — 이 포트를 점유한 프로세스만 대상이다). 즉 **운영자가
`Ctrl+C`를 누를 필요가 이제 없다** — `pnpm test:e2e`를 실행하고 결과를
기다리기만 하면 된다(격리된 hands-off 실행으로 재확인 완료, 자세한 근거는
`progress.md` §E.2 M7 후속 절 참고).

만약 그럼에도 터미널이 오래(수 분 이상) 반환되지 않는다면, 그때는 감시
로직 자체가 예상과 다르게 동작하는 상황이므로 `Ctrl+C`로 직접 정리하고
이 상황을 이슈로 보고해 달라 — 자동 정리가 실패하는 경우로 새로 관측된
사례는 감시 로직 개선의 근거가 된다.

## 8. 요약 — 전체 절차

```bash
cp .env.local.example .env.local     # 값 채우기 (1단계)
pnpm db:migrate                       # 3단계
pnpm db:seed                          # 4단계
pnpm tester:add -- --email tester@example.com   # 5단계
pnpm exec playwright install --with-deps chromium   # 6단계 (최초 1회)
pnpm test:e2e                         # 7단계
```

## 9. 시크릿 취급 원칙

- 이 문서와 `.env.local.example`에는 어떤 실제 시크릿 값도 기재하지 않는다
  — 전부 플레이스홀더다.
- 발급처만 안내한다: DB 자격증명은 Turso 대시보드(https://turso.tech),
  Gemini API 키는 Google AI Studio(https://aistudio.google.com)에서 받는다
  (다만 앞서 설명했듯 `LLM_PROVIDER_MODE=deterministic`으로 돌리는 테스트/E2E에는
  필요 없고, `LLM_PROVIDER_MODE`를 설정하지 않는 정상 앱 기동에는 필요하다).
- 값이 디스크에 남는 곳은 gitignore된 `.env.local`뿐이다. 로그·오류
  메시지·커밋 파일에는 값이 나타나지 않는다.
