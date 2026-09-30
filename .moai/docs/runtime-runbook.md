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

## 10. Gemini 모델 선택 · 레이트 예산 · 데이터 취급 (SPEC-GEMINI-RUNTIME-001)

`GEMINI_RESEARCH_MODEL`/`GEMINI_FAST_MODEL`/`GEMINI_RESEARCH_RPM_BUDGET`/`GEMINI_FAST_RPM_BUDGET`
4개 변수는 전부 **선택**이며, 설정하지 않으면 코드 기본값(Research는
`gemini-3.6-flash`, Fast는 `gemini-3.5-flash-lite`, 두 역할 모두 RPM 예산
기본값은 4)이 그대로 적용된다. 이 RPM 예산은 Google이 보장하는 한도가
아니라 우리가 안전하다고 판단해 자체적으로 부과하는 상한이다 — 실제
한도는 AI Studio의 Rate Limit 대시보드(https://aistudio.google.com)에서
확인하고, `GEMINI_RESEARCH_RPM_BUDGET`/`GEMINI_FAST_RPM_BUDGET`을 그 값의
약 70~80% 이하로 설정하는 것을 권장한다.

`caseInputSchema`(`lib/validation/case-input.ts`)는 **비식별을 보증하지
않는다**. 실제로 하는 일은 두 가지뿐이다 — (1) `.strict()`로 스키마에
정의되지 않은 필드(상세주소, 진료기록 원문 등)를 구조적으로 거부하고,
(2) `incidentDescription`/`diagnosisName`/`disabilityBodyPart` 세 필드에서
주민등록번호·전화번호 형식만 정규식으로 차단한다. `incidentDescription`
같은 자유 형식 텍스트 필드에 청구인이 실명·소속 회사명·상세 주소·병원명
같은 재식별 정보를 직접 타이핑해 넣는 것을 이 스키마는 막지 못한다.

이번 파일럿 단계에서는 **합성(synthetic) 사건 또는 운영자가 사전에
비식별화한 사건만** 입력해야 한다 — 실명·주민등록번호·전화번호·상세
주소가 포함된 실 고객 사건, 원본 진료기록, 원본 보험증권 문서는 입력을
금지한다. 실 고객 사건을 사용하는 외부 파일럿으로 확장하려면 별도의
데이터 처리/정책 적합성 검토가 먼저 필요하다. 또한 이 SPEC이 사용하는
Gemini API는 **무료(Unpaid) tier**이며, Google 공식 약관
(https://ai.google.dev/gemini-api/docs/pricing,
https://ai.google.dev/gemini-api/terms)에 따르면 무료 tier에 제출된
프롬프트/응답은 사람 검토자에 의해 읽히고 주석이 달릴 수 있으며 Google
제품·ML 기술 개선에 사용될 수 있다(유료 tier는 그렇지 않다) — 이 사실을
알고 있는 채로 입력 데이터를 다뤄야 한다.

## 11. 상담 신청(03) 플래그 변경 절차 (SPEC-B2C-CONSULT-001 D-NEW-18)

`ENABLE_CONSULT_FLOW`와 `CONSULT_POLICY_READY`를 바꿀 때 무엇을 다시 빌드하고
무엇을 재시작만 하면 되는지, 어떤 순서로 켜야 하는지를 적는다. 진단 게이트 플래그
(`ENABLE_DIAGNOSIS_*`, `DIAGNOSIS_ENGINE_READY`)도 같은 표에 함께 적는다. 아래 표의
"검증됨"은 이 저장소에서 `pnpm verify:flag-runtime`(로컬 `file:` DB, 실제
`next build` 후 다른 env로 서버 시작)로 관측한 사실이고, "미검증"은 관측하지 못한
항목이다. 검증 기준은 `app/page.tsx`에 `force-dynamic`을 넣은 커밋 `2cc1511` 이후
트리다(서버 모드는 `next start`와 `output: "standalone"` 둘 다 관측했다).

### 11.1 무엇이 어디서 읽히는가

| 플래그 | 읽는 곳 | 읽는 시점 |
|--------|---------|-----------|
| `ENABLE_CONSULT_FLOW` | `app/consult/page.tsx`, `app/result/page.tsx` | 요청마다(두 라우트는 `dynamic = "force-dynamic"`) |
| `CONSULT_POLICY_READY` | `app/consult/page.tsx`(`isPolicyReady` prop), `app/api/consultations/route.ts`, `lib/env.ts`(부팅 검증) | 요청마다 + 부팅 시 1회 |
| `ENABLE_DIAGNOSIS_FLOW`·`DIAGNOSIS_ENGINE_READY`·`ENABLE_DIAGNOSIS_DEV_STATES` | `app/page.tsx`(`/`), `app/result/page.tsx` | 요청마다(두 라우트 모두 `dynamic = "force-dynamic"`) |

수정 전에는 `/consult`와 `/result`도 빌드 시점에 굳었다(`next build`의 라우트 표에서
`○ Static`). 그래서 빌드 때의 플래그 값이 페이지에 남아, 요청 시점에 읽는 API와
서로 달랐다. 수정 후에는 두 라우트가 `ƒ Dynamic`이다. `/`는 그 뒤에도 한동안 빌드
시점에 굳어 있었다가(`/result`와 진단 게이트 판정 시점이 달랐다) `2cc1511`에서
`force-dynamic`이 들어가 이제 세 페이지 라우트(`/`, `/consult`, `/result`)가 모두
`ƒ Dynamic`이고 `.next/prerender-manifest.json`의 `routes`에는 페이지 라우트가 없다
(남는 키는 `/_global-error`, `/_not-found`, `/favicon.ico`뿐).

**SPEC-B2C-FOUNDATION-001과의 편차.** 그 SPEC의 REQ-B2CFOUND-002/003은 `/`를 "빌드 시점에
완전히 정적으로 렌더링"되고 "항상 정적으로 접근 가능"한 화면으로 적었다. `/`가
`force-dynamic`이 되면서 앞 문구("정적 렌더링")는 더 이상 사실이 아니다. 유지되는
것은 세션 확인 없음, `process.env` 읽기 외 런타임 의존성 없음, PII 미수집, 게이트가
닫혀도 placeholder를 200으로 항상 응답한다는 점이다. 이 편차는 사용자가 알고
받아들인 결정이며 SPEC 본문은 고치지 않았다(`progress.md` D-NEW-21).

### 11.2 플래그별 변경 절차 (검증됨)

| 바꾸는 것 | 재빌드 | 재시작 | 근거 |
|-----------|:------:|:------:|------|
| `ENABLE_CONSULT_FLOW` | 필요 없음 | 필요 | 빌드 1회(닫힘/열림) 후 4가지 시작 조합 모두에서 `/consult` 제목과 `/result`의 `shouldRenderConsult`가 시작 env를 따랐다(불일치 0건, `.moai/state/verify/group2/7-green-final.log`) |
| `CONSULT_POLICY_READY` | 필요 없음 | 필요 | 같은 실행에서 `/consult`의 `isPolicyReady`와 API 응답(503 여부)이 시작 env를 따랐다 |
| 위 두 플래그를 함께 | 필요 없음 | 필요 | 위와 같음 |
| `ENABLE_DIAGNOSIS_FLOW`, `DIAGNOSIS_ENGINE_READY`, `ENABLE_DIAGNOSIS_DEV_STATES` | 필요 없음 | 필요 | 빌드 2종(전부 닫힘 / FLOW+ENGINE 열림) 후 시작 env를 8가지로 바꿔(DEV_STATES만, FLOW+ENGINE, FLOW만(ENGINE 없음)→닫힘 유지, 전부 열림, 전부 닫힘 등) 관측했다. 모든 조합에서 `/`와 `/result`가 같은 상태였고 그 상태가 시작 env로 계산한 `computeDiagnosisFlags`와 같았다(불일치 0건). `next start`와 `standalone` 모두 같은 결과 |

수정 전(`cb97824` 트리의 `app/page.tsx`)에는 같은 매트릭스에서 불일치가 31건이었다: `/`가 빌드 시점
값으로 굳어, 재빌드 없이 진단 플래그를 바꾸면 `/`와 `/result`가 서로 다른 상태를 보였다.
그때의 "진단 플래그는 재빌드가 필요하다"는 절차는 더 이상 맞지 않는다.

**중요 — 재시작만으로 충분한 것은 두 수정이 모두 들어간 빌드일 때다.** consult 플래그는
`d958a2b` 이후, 진단 플래그는 `2cc1511` 이후 빌드부터다. 그 이전 커밋으로 만든 빌드는
해당 라우트가 정적이라 플래그가 굳어 있다. 수정이 들어간 코드를 **한 번은 반드시
재빌드**해 배포한 뒤부터 위 표가 성립한다.

### 11.3 켜는 순서 (`CONSULT_POLICY_READY=true`)

1. 수정이 들어간 코드를 재빌드해 배포한다(위 중요 문구). 이때 플래그 값은 무엇이어도 된다.
2. 대상 DB에 `pnpm db:migrate`를 먼저 적용한다. 관측: 마이그레이션하지 않은 빈 DB에서
   `CONSULT_POLICY_READY=true`로 기동해 `POST /api/consultations`를 보내면 500
   `server_error`가 나왔다(로컬 파일 DB). 정책을 열기 전에 테이블이 있어야 한다.
3. `RATE_LIMIT_HMAC_SECRET`을 **같은 재시작에서 함께** 설정한다. 관측:
   `CONSULT_POLICY_READY=true`이고 이 시크릿이 없으면 프로세스가 부팅 중 종료 코드 1로
   죽고 포트가 열리지 않는다(`lib/env.ts` 부팅 검증). 값 자체는 이 문서에 적지 않는다.
4. 플래그를 바꾸고 재시작한다.
5. 재시작 후 확인한다: `/consult`에서 제출 CTA가 정상이고 `POST /api/consultations`가
   503이 아닌지 본다. 검증 스크립트는 로컬 전용이다(아래 11.5).

끌 때(되돌릴 때)는 `CONSULT_POLICY_READY=false`로 바꾸고 재시작한다. 관측: 재시작 직후
API가 503을 돌려주고 `/consult`의 `isPolicyReady`가 `false`가 된다. 이미 저장된
상담 행을 지우는 코드 경로는 없다(코드를 읽어 확인한 것이며 실제 DB로 관측하지는
않았다).

### 11.4 검증하지 못한 것 (미검증)

- 운영 프로세스 관리자(PM2 등)가 재시작 때 **바뀐 env를 실제로 다시 읽는지**. 이
  저장소에서는 `pnpm start`를 직접 다시 띄워 관측했을 뿐이다. 관리자가 옛 env를
  캐시하는 방식이면 재시작해도 플래그가 안 바뀔 수 있다.
- `output: "standalone"` 산출물은 **Windows 개발 머신에서만** 관측했다(`node
  .next/standalone/server.js`, `deploy.yml`과 같은 `.next/static`·`public` 복사 후). 페이지
  게이트 판정은 `next start`와 똑같았다. 이 관측에서 알게 된 사실: (1) Windows에서는 pnpm
  standalone 산출물의 디렉터리 심볼릭 링크가 파일 링크로 만들어져 `node server.js`가
  첫 require에서 EPERM으로 죽었다(검증 스크립트가 Windows에서만 junction으로 바꿔 우회,
  Linux 배포 환경에서의 동작은 관측하지 못했다). (2) standalone `server.js`는 시작하면서
  cwd를 `.next/standalone`으로 바꾼다 — 상대 경로 `file:` DB URL(`file:./.tmp/…`)은 그
  안에서 열려다 `SQLITE_CANTOPEN`(POST `/api/consultations`가 500)으로 실패했다. 절대
  경로 `file:` URL로는 통과했다. 운영이 어떤 DB URL을 쓰는지는 이 저장소에서 확인하지
  못했다.
- `.env.local` 등 서버 디스크의 env 파일을 고친 뒤 재시작했을 때의 동작(이 검증은
  프로세스 env로만 값을 줬다).
- 원격 Turso에서의 API 동작은 **`POST /api/consultations` 라우트 코드를 프로세스 안에서
  직접 호출해** 관측했다(트랜잭션 커밋·롤백, 같은 IP 동시 6건 5건 허용 + 429, 같은 키
  동시 재시도의 단일 접수·동일 응답 — 단일 프로세스). 배포된 앱·HTTP 서버·Nginx·PM2를
  거친 검증은 아니다. 다중 인스턴스에서 같은 키를 동시에 제출하면 응답이 달라지고 한도가
  이중 소비된다. 자세한 내용은 `progress.md` D-NEW-19(Claim 63-66)와 열린 항목 24.
  하네스는 `pnpm verify:remote-consult`(안전 가드: 대상 지문·쓰기 허용 플래그·원장 기반
  정확 정리)이며 `--help`에 사용법이 있다.
- Nginx `X-Forwarded-For` 운영 확인은 별도 항목(D-NEW-15).

### 11.5 재현·회귀 검사 실행

```bash
pnpm verify:flag-runtime                  # 빌드 2회(닫힘/열림) x 시작 8조합, 불일치가 있으면 종료 코드 1
pnpm verify:flag-runtime --build=closed   # 빌드 1회만
pnpm verify:flag-runtime --observe        # 불일치가 있어도 종료 코드 0(표만 확인)
pnpm verify:flag-runtime --server=standalone   # output: "standalone" 서버(node .next/standalone/server.js)로 같은 검사
```

시작 8조합은 consult 플래그 4가지와 진단 게이트 4가지(전부 닫힘 / FLOW+ENGINE / FLOW만 /
전부 열림)다. 각 조합에서 `/`와 `/result`의 게이트 상태가 같은지(`SKEW`), 그리고 시작 env로
계산한 `computeDiagnosisFlags` 결과와 같은지도 판정하고, 세 페이지 라우트가 프리렌더되지
않았는지도 본다.

이 스크립트는 로컬 `file:./.tmp/flag-runtime.db`만 쓰고, 부모 셸의 `TURSO_*`·플래그
env를 물려받지 않으며, 최종 env가 `file:`이 아니면 실행을 거부한다. 서버는 검사마다
종료한다. 빌드가 2회 들어가므로 기본 `pnpm test`에는 넣지 않았다.

## 12. 운영 구성 전제: 앱 인스턴스 수 (SPEC-B2C-CONSULT-001 D-NEW-22, T7)

**현재 상태: 단일 인스턴스로 관측됨(2026-09-30 한 시점).** 운영 Oracle VM에서 아래 12.4의 읽기 전용 명령을 SSH로
직접 실행해 PM2 `exec_mode`·`instances`·프로세스 수와 Nginx가 연결하는 앱 인스턴스 수를 관측했고, 결과는 12.5
표에 적었다. 이전 판에는 "작업자가 운영 VM에 접속할 수 없다"고 적었으나 이는 틀렸다(사용자가 접속 방법을 알려 줘
정정). 12.1의 "전제(문서상)"는 이제 이 관측으로 확인된 사실이지만, **관측은 그 시점의 스냅샷**이라 구성을 바꾸면
다시 관측해야 한다.

### 12.1 전제 (문서상)

- 앱은 Oracle Cloud VM 위에서 **PM2가 구동하는 단일 프로세스**이고 Nginx가 앞에 있다(`.moai/project/tech.md`,
  SPEC-B2C-CONSULT-001 `design.md` §9.3, `app/api/consultations/route.ts`의 `withIdempotencyLock` 주석).
- 저장소에는 PM2 설정 파일(`ecosystem.config.*`)이 없다. `.github/workflows/deploy.yml`은 `pm2 restart "$PM2_APP"`으로
  이름 하나의 PM2 앱을 재시작할 뿐, 모드·인스턴스 수를 정하지 않는다(코드 확인, 운영 관측 아님).

### 12.2 왜 이 전제가 중요한가

`POST /api/consultations`의 `withIdempotencyLock`은 **프로세스 안의 `Map`**이라 같은 `idempotencyKey`의 동시
요청을 한 프로세스 안에서만 직렬화한다. 원격 Turso에서 두 프로세스가 같은 키를 동시에 제출한 시험(T7,
`progress.md` D-NEW-19 Claim 66)은 응답이 `[409 duplicate, 201 success]`로 서로 다르고 상담 행은 1개지만
rate-limit `request_count`가 2가 됐다(한도 이중 소비). 같은 키 동시 재시도가 단일 프로세스에서는 하나의 접수와
동일한 성공 응답, 카운터 1(T6 통과)이었다.

### 12.3 배포 절차 조건 (반드시 지킨다)

1. **`CONSULT_POLICY_READY=true`로 켜기 전에** 아래 12.4의 읽기 전용 명령으로 실제 구성이 단일 프로세스인지 확인하고
   결과를 12.5 표와 `progress.md`에 기록한다. 확인 전에는 이 전제를 "관측됨"으로 쓰지 않는다.
2. **앱 인스턴스를 늘리기 전에**(PM2 `instances` 2 이상, `cluster` 모드, 앱 포트·Nginx upstream 추가, 다중 컨테이너,
   서버리스 전환) 같은 키의 동시 재시도가 **하나의 접수, 일관된 성공 응답, rate-limit 이중 소비 없음**이 되도록 코드를 먼저
   고치고, 원격 회귀 시험(`pnpm verify:remote-consult`의 T6·T7)을 통과시킨다. 그 전에는 인스턴스를 늘리지 않는다.
3. 실제 구성이 이미 다중 프로세스로 확인되면 T7 동작이 지금 운영에 적용되는 것이므로, 위 코드 수정과 원격 회귀 시험이
   `CONSULT_POLICY_READY`를 켜기 전의 선행 과제다.

### 12.4 관측 명령 (운영 VM, 읽기 전용, env 값은 출력하지 않는다)

`pm2 jlist`와 `pm2 describe`의 전체 출력에는 환경 변수 값이 들어 있어 **쓰지 않는다**. 아래는 안전한 필드만 꺼낸다.

```bash
pm2 list
pm2 jlist | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const a of JSON.parse(s)){const e=a.pm2_env||{};console.log(JSON.stringify({name:a.name,pm_id:a.pm_id,pid:a.pid,status:e.status,exec_mode:e.exec_mode,instances:e.instances,restarts:e.restart_time,exec:(e.pm_exec_path||"").split("/").slice(-2).join("/")}))}})'
sudo ss -ltnp | grep -E ':(3000|3001|3002|3003|3004)\b'
ps -eo pid,ppid,etimes,rss,args | grep -E 'standalone/server.js|next-server|next start' | grep -v grep
pgrep -fc 'God Daemon'
sudo nginx -T 2>/dev/null | grep -nE '^\s*(upstream\s|proxy_pass\s|server\s+(127\.|localhost|unix:|\[::1\]|[0-9.]+:[0-9]+)|least_conn|ip_hash|hash\s)'
```

### 12.5 관측 결과 기록

| 항목 | 관측값 | 관측일 |
|------|--------|--------|
| PM2 앱 이름·모드(`exec_mode`) | 앱 이름 `bosang-radar`, `exec_mode` = `fork_mode`(`pm2 list`의 mode `fork`) | 2026-09-30 |
| `instances` / PM2 프로세스 수 | `instances` = 1, PM2 앱 1개(`pm_id` 0, `online`, 재시작 32회, 가동 2일) | 2026-09-30 |
| 앱을 듣는 포트 수 | 1개 — 3000~3004 중 `127.0.0.1:3000`만 LISTEN | 2026-09-30 |
| 앱 프로세스 수 | 1개 — `next-server (v16.3.2)`, PID 165278(PM2가 가리키는 PID와 같음) | 2026-09-30 |
| PM2 데몬 수 | 1개(`pgrep -fc 'God Daemon'` = 1) | 2026-09-30 |
| Nginx가 연결하는 앱 인스턴스 수(upstream / `proxy_pass`) | 1개 — `proxy_pass http://127.0.0.1:3000;` 한 줄, `upstream` 블록·다른 `server` 대상 없음 | 2026-09-30 |

**관측 방법**: 위 12.4의 여섯 명령을 SSH 한 세션에서 실행(`sudo`는 비밀번호 없이 `-n`으로만). env 값이 나오는 `pm2 jlist`
전체 출력은 쓰지 않고 안전한 필드만 꺼냈다. 원본 출력은 gitignored `.moai/state/verify/d-new-23/20-t7-observe.log`.
접속 대상은 `bosang-radar.duckdns.org`가 가리키는 IP이며, `known_hosts`에 이미 저장된 서버 키로 검증했다(호스트 키
검증을 끄지 않았다).

**이 관측이 말해 주는 것과 말해 주지 않는 것**

- 말해 주는 것: 관측 시점에 이 VM에는 앱 프로세스가 하나이고 Nginx도 그 하나만 가리킨다. 그래서 T7(두 프로세스가 같은
  `idempotencyKey`를 동시에 제출)이 **현재 구성에서는 일어나지 않는다**. 위 12.3의 1번 조건(켜기 전에 관측·기록)은
  이 표로 충족했다.
- 말해 주지 않는 것: (1) `deploy.yml`의 `ORACLE_HOST` 시크릿이 이 IP와 같은지는 확인하지 못했다(시크릿은 읽을 수 없다).
  (2) 이 VM 앞에 다른 로드밸런서가 없다는 것은 DNS가 이 인스턴스 IP를 직접 가리킨다는 데서 추론한 것이다. (3) 서버의
  호스트 이름은 `bosang-radar-micro-test`다. (4) 이후 배포·재시작·설정 변경 뒤에도 단일 프로세스인지는 다시 관측해야
  한다. (5) PM2가 재시작 때 바뀐 env를 다시 읽는지는 이 관측 범위 밖이다.
- **12.3의 2번 조건은 그대로다.** 앱 인스턴스를 늘리기 전에(PM2 `instances` 2 이상, `cluster` 모드, 앱 포트·Nginx
  upstream 추가, 다중 컨테이너, 서버리스 전환) T7을 코드로 먼저 고치고 원격 회귀 시험을 통과시킨다. T7 자체는 코드로
  해결하지 않았고 운영 전제로 회피하고 있을 뿐이다.
