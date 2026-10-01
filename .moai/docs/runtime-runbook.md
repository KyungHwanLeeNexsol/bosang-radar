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
4. **연락 기한 약속을 운영이 지킬 수 있는지 확인한다.** 상담 화면은 `.pen` 문구로 두 곳에서
   "영업일 기준 1일 이내"에 연락하겠다고 약속한다: 03-B 성공 화면 부제
   (`components/consult/consult-success.tsx`)와 전화 채널을 고르면 보이는 안내
   (`components/consult/consult-channel-selector.tsx`). 정책을 열기 전에 상담 운영 담당이
   이 기한을 실제로 지킬 수 있는지 사람이 확인한다. 이 항목은 코드나 스크립트로 검증할 수
   없고, **이 문서를 쓴 시점에는 확인되지 않았다**(SPEC-B2C-CONSULT-001 `progress.md`
   사용자 결정 5).
5. **상담 화면이 말하거나 가리키는 목적지·운영 절차가 실제로 있는지 확인한다.** 아래 항목은 모두
   **확인되지 않았고, 현재 이 앱 안에 그 목적지나 운영 절차가 존재하지 않는다**(SPEC-B2C-CONSULT-001
   `progress.md` 열린 항목 25~29, 사용자 결정 7·8). 이 점검표는 문서일 뿐 코드나 스크립트로 검증할
   수 없고, 항목마다 사람이 확인하고 결과를 기록한다.
   - (a) "기존 신청 상태 확인"(03-C 비활성 스텁)이 가리킬 목적지와 조회 기능 — 없음, 미확인(열린 항목 25).
   - (b) 신청 취소·"신청 취소 · 정보 삭제 문의"(03-B 비활성 스텁)의 목적지와 운영 절차(처리 담당, 본인 확인
     방법, 처리 기한) — 취소 수단 없음, 미확인(열린 항목 26).
   - (c) 03-D 실패 화면에서 이용자가 문의할 실제 창구 — 없음, 미확인. 03-D는 이 앱 안에 문의 목적지가 없어
     대체 문의 경로를 안내하지 않는다(열린 항목 27).
   - (d) 위 4번의 "영업일 기준 1일 이내" 연락 약속 — 운영이 지킬 수 있는지 미확인(열린 항목 28).
   - (e) 03-C 부제 "같은 진단 결과로 접수된 신청이 처리 중입니다."와 처리 상태 라벨 "상담 대기 중"이 운영
     현실과 맞는지 — 미확인(열린 항목 29).
   - (f) 03-D에서 입력한 연락처를 마스킹 없이 다시 표시하는 데 대한 개인정보 검토 — 미해결(열린 항목 13).
6. 플래그를 바꾸고 재시작한다.
7. 재시작 후 확인한다: `/consult`에서 제출 CTA가 정상이고 `POST /api/consultations`가
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
- **[과거 기록 — 수정 전 코드 기준. 현재 코드의 결과는 §12.8]** 원격 Turso에서의 API 동작은
  **`POST /api/consultations` 라우트 코드를 프로세스 안에서 직접 호출해** 관측했다(트랜잭션 커밋·롤백, 같은 IP 동시 6건 5건 허용 + 429, 같은 키
  동시 재시도의 단일 접수·동일 응답 — 단일 프로세스). 배포된 앱·HTTP 서버·Nginx·PM2를
  거친 검증은 아니다. 수정 전 코드에서는 다중 인스턴스에서 같은 키를 동시에 제출하면 응답이
  달라지고 한도가 이중 소비됐다(수정 전 코드 `57f1931`·`af66a46`, DB 쓰기 트랜잭션 `4c09426`
  이전의 기록이며 현재 코드의 동작이 아니다). 자세한 내용은 `progress.md` D-NEW-19(Claim
  63-66)와 열린 항목 24.
  하네스는 `pnpm verify:remote-consult`(안전 가드: 대상 지문·쓰기 허용 플래그·원장 기반
  정확 정리)이며 `--help`에 사용법이 있다.
- **현재 코드(`4c09426`의 DB 쓰기 트랜잭션 이후)의 원격 결과는 §12.8이 근거다**: 원격 T1~T7을
  두 번 실행해 두 번 모두 7/7 통과했다(`progress.md` Claim 82). 한계는 §12.8에서 그대로
  옮긴다 — 동시성 6건까지, 두 번의 실행, 라우트를 프로세스 안에서 직접 호출(배포 앱 미경유),
  T7의 두 프로세스는 한 머신의 워커(실제 다중 인스턴스 아님), Hrana 프로토콜 버전 직접 확인
  안 함. §12.3의 "인스턴스 증가 전 원격 T6·T7 통과" 조건은 이 하네스 기준으로만 충족됐고,
  실제 다중 인스턴스 배포를 시험한 것은 아니다.
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
다시 관측해야 한다. `deploy.yml`의 `ORACLE_HOST`가 관측한 VM과 같은 배포 대상인지는 12.6에서 배포 실행 로그와 대조해
따로 확인했다(시크릿 값 자체는 읽지 않았다).

**T7 코드 수정(D-NEW-25): 코드로 고쳤고 로컬에서 확인했다. 원격 Turso 회귀 시험은 이번에 돌리지 않았다(미수행).** *(D-NEW-25 시점의 과거 기록 — 그 원격 시험은 이후 §12.8에서 수행했다: 현재 코드의 원격 T1~T7이 두 번 모두 7/7 통과. 한계는 §12.8.)*
`POST /api/consultations`는 키 조회·rate limit·업무 키 중복 조회·삽입을 DB 쓰기 트랜잭션 하나로 실행하므로, 프로세스
수와 무관하게 같은 키·같은 요청의 동시 제출은 상담 행 1개, 동일한 성공 응답, rate limit 소비 1회가 되도록 작성했다.
아래 12.7에 수정 전후 실제 측정값과 증거 범위·한계를 적었다. 12.3의 조건은 **원격 T6·T7 회귀 시험을 통과시키기 전까지**
유효하다(로컬 증거만으로 원격 트랜잭션 대기 동작을 확인했다고 말하지 않는다). *(당시 기록 — 이후 §12.8의 원격 T1~T7이 하네스 기준으로 7/7 통과했으나 실제 다중 인스턴스 배포를 시험한 것은 아니다. 인스턴스를 늘리기 전에 확인한다는 조건 자체는 그대로 지킨다.)*

### 12.1 전제 (문서상)

- 앱은 Oracle Cloud VM 위에서 **PM2가 구동하는 단일 프로세스**이고 Nginx가 앞에 있다(`.moai/project/tech.md`,
  SPEC-B2C-CONSULT-001 `design.md` §9.3, `app/api/consultations/route.ts`의 `withIdempotencyLock` 주석).
- 저장소에는 PM2 설정 파일(`ecosystem.config.*`)이 없다. `.github/workflows/deploy.yml`은 `pm2 restart "$PM2_APP"`으로
  이름 하나의 PM2 앱을 재시작할 뿐, 모드·인스턴스 수를 정하지 않는다(코드 확인, 운영 관측 아님).

### 12.2 왜 이 전제가 중요한가 (수정 전 상태의 기록 — 수정 결과는 12.7, 원격 결과는 12.8)

수정 전 `POST /api/consultations`의 `withIdempotencyLock`은 **프로세스 안의 `Map`**이라 같은 `idempotencyKey`의 동시
요청을 한 프로세스 안에서만 직렬화한다. 원격 Turso에서 두 프로세스가 같은 키를 동시에 제출한 시험(T7,
`progress.md` D-NEW-19 Claim 66)은 응답이 `[409 duplicate, 201 success]`로 서로 다르고 상담 행은 1개지만
rate-limit `request_count`가 2가 됐다(한도 이중 소비). 같은 키 동시 재시도가 단일 프로세스에서는 하나의 접수와
동일한 성공 응답, 카운터 1(T6 통과)이었다.

### 12.3 배포 절차 조건 (반드시 지킨다)

1. **`CONSULT_POLICY_READY=true`로 켜기 전에** 아래 12.4의 읽기 전용 명령으로 실제 구성이 단일 프로세스인지 확인하고
   결과를 12.5 표와 `progress.md`에 기록한다. 확인 전에는 이 전제를 "관측됨"으로 쓰지 않는다.
2. **앱 인스턴스를 늘리기 전에**(PM2 `instances` 2 이상, `cluster` 모드, 앱 포트·Nginx upstream 추가, 다중 컨테이너,
   서버리스 전환) 같은 키의 동시 재시도가 **하나의 접수, 일관된 성공 응답, rate-limit 이중 소비 없음**이 되는지
   원격 회귀 시험(`pnpm verify:remote-consult`의 T6·T7)으로 확인한다. 코드 수정은 끝났고 로컬에서만 확인됐다(12.7).
   *(당시 기록 — 원격 T1~T7은 이후 §12.8에서 하네스 기준 7/7 ×2 통과했다. 실제 다중 인스턴스 배포를 시험한 것은 아니므로
   인스턴스를 늘리기 전의 확인은 여전히 필요하다.)* 원격 시험을 통과시키기 전에는 인스턴스를 늘리지 않는다.
3. 실제 구성이 이미 다중 프로세스로 확인되면 원격 회귀 시험이 `CONSULT_POLICY_READY`를 켜기 전의 선행 과제다.

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
- 말해 주지 않는 것: (1) 이 표만으로는 `deploy.yml`의 `ORACLE_HOST`가 이 VM을 가리키는지 알 수 없다(시크릿은 읽을 수
  없다). 그 확인은 12.6에서 배포 실행 로그와 대조해 따로 했다. (2) 이 VM 앞에 다른 로드밸런서가 없다는 것은 DNS가 이
  인스턴스 IP를 직접 가리킨다는 데서 추론한 것이다. (3) 서버의 호스트 이름 등 식별 정보는 이 문서에 적지 않는다(접속 정보
  비노출). (4) 이후 배포·재시작·설정 변경 뒤에도 단일 프로세스인지는 다시 관측해야 한다. (5) PM2가 재시작 때 바뀐 env를
  다시 읽는지는 이 관측 범위 밖이다.
- **12.3의 2번 조건은 그대로다.** 앱 인스턴스를 늘리기 전에(PM2 `instances` 2 이상, `cluster` 모드, 앱 포트·Nginx
  upstream 추가, 다중 컨테이너, 서버리스 전환) 원격 회귀 시험(T6·T7)을 통과시킨다. (이 표를 쓴 시점에는 T7이 코드로
  해결되지 않아 운영 전제로 회피하고 있었다. 이후 코드로 고쳤고 그 결과는 12.7이다. 원격 시험은 아직 돌리지 않았다.
  — 이 문장은 그 시점의 기록이며, 원격 T1~T7은 이후 12.8에서 수행했다.)

### 12.6 배포 대상 일치성 (`ORACLE_HOST` ↔ 12.5에서 관측한 VM)

**판정: 일치(간접·결정적 증거). 단, 시크릿 값 자체는 읽지 않았다.** 확인일 2026-09-30.

`deploy.yml`의 `host: ${{ secrets.ORACLE_HOST }}`가 12.5의 VM과 같은 서버인지 확인해야 했다. GitHub 시크릿은 값을 읽을 수
없고, "같은 커밋이 그 VM에 있다"는 것은 근거가 되지 않는다(수동 배포나 다른 경로로도 만들 수 있다). 그래서 **배포 실행 하나가
남긴 고유한 흔적이 그 VM에도 그대로 있는지**로 확인했다. 접속 정보와 시크릿 값은 어디에도 기록하지 않았다.

**증거 A — 최신 성공 배포 run #33(`36315061016`, `main` push `f7ef4ec`, 2026-09-27T11:13:56Z~11:15:54Z)의 Actions 로그와
VM 현재 상태(2026-09-30T05:43:44Z, NTP 동기화 yes)의 대조**

| 흔적 | 배포 로그 | VM |
|---|---|---|
| 코드 반영 | `HEAD is now at f7ef4ec` 11:14:07Z | HEAD `f7ef4ec`, reflog `reset: moving to origin/main` 11:14:06Z |
| 빌드 종료 | 라우트 표 출력 11:15:45Z | `.next/BUILD_ID` 수정 시각 11:15:45Z |
| PM2 재시작 | 표 출력 11:15:48Z — `id 0`, `fork`, **pid 165278**, **↺ 32**, `online` | `pm_uptime` 11:15:48.56Z, **pid 165278**, **`restart_time` 32**, `fork_mode` |
| 프로세스 시작(커널) | — | `etimes` 역산 11:15:48Z (PM2와 독립) |

**증거 B — VM의 `git reflog` 최근 `reset` 6건이 배포 실행 #33~#28 여섯 건의 실행 창과 하나씩 맞는다**(각각 실행 시작 후
10~14초)

| 실행 | 실행 창(UTC) | VM reflog `reset` |
|---|---|---|
| #33 | 09-27 11:13:56 ~ 11:15:54 | 09-27 11:14:06 |
| #32 | 09-27 11:04:50 ~ 11:06:55 | 09-27 11:05:02 |
| #31 | 09-25 12:25:47 ~ 12:27:58 | 09-25 12:25:58 |
| #30 | 09-25 08:19:18 ~ 08:25:12 | 09-25 08:19:32 |
| #29 | 09-22 00:43:54 ~ 00:46:07 | 09-22 00:44:08 |
| #28 | 09-21 08:31:19 ~ 08:33:27 | 09-21 08:31:30 |

**증거 C — 시크릿이 그 사이 바뀌지 않았다.** `ORACLE_HOST`의 `updated_at`은 2026-09-17T05:56:46Z(저장소 시크릿 목록의 수정
시각이며 값이 아니다)로 위 여섯 실행보다 앞선다. 배포 job에는 `environment:`가 없어 저장소 수준 시크릿이 쓰인다. 그래서
그 실행들이 쓴 값이 지금의 값이다.

**증거 D — 각 실행에서 스크립트가 실행된 흔적은 한 번뿐이다**(`== git pull ==`, `HEAD is now at`, PM2 표가 각 1회). 여러
호스트에 배포하는 구성(쉼표로 구분된 호스트 목록)이 아니다.

**결론**: 같은 PID·재시작 횟수·초 단위 시각 일치와 여섯 건의 고유한 시각 열이 다른 서버에서 우연히 같을 가능성은 무시할 수
있다. run #33이 배포한 서버는 12.5에서 관측한 VM이고, 시크릿이 그 뒤 바뀌지 않았으므로 현재 `ORACLE_HOST`는 그 VM을
가리킨다.

**배포 이후의 PM2·포트 상태(같은 관측, 05:43:44Z)**: PM2 앱 1개, `fork_mode`, `instances` 1. `pid 165278`이 배포 종료
때와 같고 `restart_time` 32, `unstable_restarts` 0이므로 run #33 이후 재시작이 없었다. 앱을 듣는 포트는 `127.0.0.1:3000`
하나이고, 전체 포트를 조회해도 node/next 프로세스가 듣는 다른 포트는 없다. 프로세스는 PM2 데몬 1개와 `next-server` 1개뿐이다.

**한계 — 이 확인이 말해 주지 않는 것**

1. 시크릿 값을 읽은 것이 아니라 배포 실행이 남긴 흔적으로 추론했다. 흔적이 일치해 결정적이지만 값 비교는 아니다.
2. 범위는 run #33까지의 배포와 2026-09-30 시점의 시크릿 상태다. `ORACLE_HOST`를 바꾸거나 배포 구성을 바꾸면 이 판정은
   무효이고 다시 대조해야 한다. #27 이전 실행은 대조하지 않았다.
3. 시크릿은 저장소 수준만 조회했다. 조직 수준 시크릿은 조회하지 않았다(job에 `environment:`가 없고 저장소 수준이 우선하므로
   영향이 없다고 본다).
4. `ecosystem.config.*`의 `instances`/`exec_mode` 선언은 확인하지 못했다(선언 줄이 없거나 파일이 없다는 것만 관측했고 둘을
   구분하지 못했다). 실효 값은 `pm2 jlist`로 확인했다.
5. **(이 확인 시점의 기록) T7 코드 결함은 그 시점 HEAD에 남아 있었다.** `idempotencyLocks`가 프로세스 안의 `Map`이라
   다중 프로세스에서는 응답 불일치와 한도 이중 소비가 발생했다. 이후 DB 쓰기 트랜잭션으로 고쳤다(12.7). 이 12.6의
   배포 대상 일치성 판정은 그 수정과 무관하게 유효하다.

증거 원본: gitignored `.moai/state/verify/d-new-24/`(`30-deploy-run-36315061016-excerpt.log`, `31-vm-observe.log`). 배포
로그는 `gh run view 36315061016 --log`로 다시 볼 수 있다.

### 12.7 T7 코드 수정 결과 (D-NEW-25, 2026-09-30) — 로컬 확인 (원격은 §12.8에서 수행)

**무엇을 바꿨나.** `app/api/consultations/route.ts`가 idempotency 키 조회 → 서버 시크릿·IP 확인 → rate limit 증가
(+만료 행 삭제) → 업무 키 중복 조회 → 삽입을 **DB 쓰기 트랜잭션 하나**(`BEGIN IMMEDIATE`)로 실행한다. 쓰기 잠금을 잡은 뒤
조회하므로 다른 프로세스가 먼저 커밋한 행을 반드시 본다. 같은 키·같은 요청은 재생(200), 같은 키·다른 요청은
409/`idempotency_conflict`(둘 다 rate limit을 건드리지 않음), 429와 409/`duplicate`는 정상 반환이라 커밋되어 카운터를
소비한다. 예외로 끝나면 카운터 증가까지 통째로 롤백된다. 프로세스 안 `Map` 락은 같은 프로세스의 더블클릭을 줄이는
최적화로만 남았고 정확성의 근거가 아니다. 스키마 변경은 없다(UNIQUE 인덱스는 마지막 방어선).

**실제 측정 — 로컬 `file:` SQLite, 서로 다른 두 프로세스, 같은 키·같은 요청 동시 제출(T7), 워커 문장마다 왕복 지연 100ms 모사,
`pnpm verify:remote-consult run --only T7`, 새 DB에서 각 5회**

| | 두 프로세스 응답 | rate limit 카운터 | T7 판정 |
|---|---|---|---|
| 수정 전(HEAD `af66a46`의 route.ts) | `[201, 409]` 5/5 | 2 (이중 소비) 5/5 | FAIL 5/5 |
| 수정 후 | `[200, 201]`(동일 성공 본문) 5/5 | 1 5/5 | PASS 5/5 |

추가로 지연 0ms·50ms에서 T7만 단독 실행해 PASS 5/5(0ms 3회, 50ms 2회). 증거: gitignored
`.moai/state/verify/d-new-25/` (`16-t7-negative-control.txt`, `11-t7-alone-summary.txt`).

**하네스 한계 (숨기지 않는다).** 전체 `run`(T1~T7)에서 T5·T6은 로컬 `file:` 드라이버가 같은 프로세스의 동시 쓰기 트랜잭션에
`SQLITE_BUSY`를 내서 **실패**한다(수정 전 코드에서도 로컬 T5는 실패했다). 그 잠금이 T7 워커에 영향을 줄 수 있어, 지연 0ms
전체 실행에서는 T7도 `[500, 500]`으로 실패했다(T7 단독 실행은 같은 조건에서 통과). 그래서 T7의 통과 판정은 `--only T7`로
본다. 원격 HTTP 클라이언트에는 이 제약이 없을 것으로 **추정**하나 이번에 확인하지 않았다.

**미검증 (원격 Turso) — D-NEW-25 시점의 기록이며 §12.8에서 수행했다.** 원격에서 두 번째 `BEGIN IMMEDIATE`가 첫 트랜잭션이 끝날 때까지 기다리는지 즉시 실패하는지,
Hrana 프로토콜 버전(3 이상이어야 중간 롤백 뒤 자동 커밋으로 실행되지 않음), 트랜잭션 잠금 유지 시간(왕복 약 6회)은 확인하지
못했다. 원격 시험은 기존 가드(지문 확인, `--expect-fingerprint`, `--allow-write-remote`, 백업, 가상 데이터, 정확 정리)를 그대로
지켜 `pnpm verify:remote-consult run [--only T7]`로 돌린다. 이 세션에는 `TURSO_*` 값이 없었고 원격 쓰기 권한도 받지 않았다.

**운영 위험 (검토에서 지적, 미해결).** 쓰기 잠금이 왕복 여러 번 동안 DB 전체에 걸린다. 트랜잭션 길이에 상한이 없어 연결이 멈추면
잠금이 오래 유지될 수 있다(드라이버에 요청 타임아웃 설정 없음). 실패가 구제되면
`consultation_write_tx_failed_resolved` 경고 로그가 남으므로 운영에서 그 빈도를 본다.

### 12.8 원격 T1~T7 재시험: 필요한 설정, 절차, 결과 (D-NEW-26, 2026-09-30) — 수행함, 7/7 통과 2회

**상태**: 현재 코드(`4c09426`의 DB 쓰기 트랜잭션 이후)의 원격 T1~T7을 2026-09-30에 실행해 **두 번 모두 7/7 통과**했다(progress.md Claim 82, 결과는 이 절 끝). 처음에는 세션 환경에 `TURSO_*`가 없어 수행하지 못했고(Claim 80), 사용자가 메인 체크아웃 `.env.local`의 값을 쓰라고 한 뒤 수행했다. progress.md Claim 64의 "필수 게이트 6/6"은 트랜잭션 도입 전 코드(`57f1931`)의 기록이라 현재 코드의 근거로 쓰지 않는다. 아래 "필요한 설정"과 "절차"는 다시 실행할 때 그대로 쓴다.

**필요한 설정** (값은 문서·로그·채팅에 적지 않는다)

| 항목 | 내용 |
|---|---|
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | 시험을 실행하는 셸의 프로세스 환경에 설정한다. 하네스는 `.env*` 파일을 읽지 않는다. 이전 시험(D-NEW-19)의 대상 지문은 `6e5256b8`이다. `pnpm verify:remote-consult fingerprint`의 출력이 같은지 먼저 확인하고, 다르면 다른 DB이므로 멈춘다 |
| 실행 위치 | 이 브랜치의 작업 트리. 작업 트리에 `.env.local`을 두지 않는다 |
| 사용자 승인 | 원격 쓰기(마이그레이션 0009 적용, 가상 데이터 쓰기, 정리, 스키마 원상 복구). D-NEW-19의 승인은 그 실행에 한한다 |
| 백업 스크립트 | 이전에 쓴 일회용 `.tmp/turso-backup.mjs`, `.tmp/turso-restore-rehearsal.mjs`가 이 작업 트리의 `.tmp/`(gitignored)에 남아 있다. 이번에는 열어 보거나 실행하지 않았으므로, 쓰기 전에 읽어서 접속 정보를 어디서 읽는지 확인한다 |

**절차** (이전과 같은 순서. `<fp>`는 위 지문 8자리)

1. `pnpm verify:remote-consult fingerprint` — 지문 확인
2. 전체 백업(단일 읽기 스냅샷)을 처음과 마이그레이션 직전에 한 번씩, 그리고 각각 로컬 임시 DB로 복원 리허설 — 13개 테이블의 행 수와 내용 SHA-256이 원본과 같은지 확인
3. `pnpm db:migrate` — 0009 적용. `scripts/cli-bootstrap.ts`가 `.env.local`을 로드하므로 어느 DB에 적용되는지 적용 전에 확인한다(Next의 환경 로더는 이미 있는 환경 변수를 덮어쓰지 않는 것으로 알려져 있으나 이번에 확인하지 않았다)
4. `pnpm verify:remote-consult preflight --expect-fingerprint <fp>` — 두 테이블 존재, 0행, 트리거 없음
5. `pnpm verify:remote-consult run --expect-fingerprint <fp> --allow-write-remote` — T1~T7 전체. `results.json`(요청별 `durationMs`, 5xx 수, 행 수, 카운터)과 콘솔의 "요청 처리 시간" 줄을 기록한다. T5·T6·T7 각각에서 응답, 상담 행 수, rate limit 카운터, 5xx, 처리 시간을 본다. FAIL이나 ERROR가 하나라도 있으면 통과로 적지 않는다. `EPERM` 같은 하네스 오류(ERROR)는 관측이 아니므로 새 run-id로 전체를 다시 실행한다
6. `pnpm verify:remote-consult cleanup --run-id <id> --expect-fingerprint <fp> --allow-write-remote` — 원장이 가리키는 행만 삭제, 정리 전후 표 기록
7. `pnpm verify:remote-consult revert-schema --confirm-revert-schema --expect-fingerprint <fp> --allow-write-remote` — 두 상담 테이블과 0009 기록 한 행만 삭제
8. 원격을 다시 읽기 전용 스냅샷으로 떠서 마이그레이션 직전 백업과 비교 — 13개 테이블의 행 수·내용 SHA-256, 스키마 SHA-256
9. 실패하면 원인을 재현해 고치고 1~8을 **전체** 다시 실행한다(부분 재실행으로 대체하지 않는다). T7만 통과하고 T5에서 잠금 경합이나 5xx가 나오면 실패다

**기록할 것**: 새 HEAD SHA, 대상 지문과 마스킹한 호스트, 케이스별 관측, 5xx 수, 처리 시간(최소·중앙값·최대), 정리 전후 표, 원상 복구 대조 결과. 비밀값과 전체 호스트는 적지 않는다.

`run`은 두 상담 테이블이 모두 비어 있고 상담 테이블에 트리거가 없을 때만 시작한다(3·4단계가 먼저여야 하는 이유).

**2026-09-30 실행 결과** (HEAD `6474869`, 라우트 코드는 `4c09426`, 대상 지문 `6e5256b8`)

| 항목 | 결과 |
|---|---|
| 접속 정보 주입 | 저장소 밖 임시 래퍼가 메인 체크아웃 `.env.local`의 `TURSO_*` 두 값만 읽어 자식 프로세스 환경에 넣고 출력의 URL·호스트·토큰을 `***`로 가렸다. 래퍼 파일에는 값이 없다 |
| 백업·복원 리허설 | 2회 모두 PASS, 두 백업과 지난 세션 백업이 서로 같음(파일럿 데이터 변동 없음) |
| T1~T7 | 실행 2회 모두 7/7 통과. T4~T7 5xx 0(전체 5xx 1건은 T3의 의도된 실패 유도) |
| T5 동시 6건 | 5건 허용 + 429 1건, 행 5, 카운터 6, 완료 시간 0.3→1.7초로 차례로 늘어남(직렬화 대기로 보임) |
| T6·T7 | 행 1, 동일 성공 응답, 카운터 1(이중 소비 없음). T7은 두 프로세스 `[201,200]` |
| 정리·원상 복구 | `cleanup`이 13행+6행만 삭제(총계 0/0), `revert-schema` 성공, 복구 후 스냅샷이 마이그레이션 직전 백업과 13개 테이블·스키마 일치 |

한계: 동시성 6건까지, 두 번의 실행, 라우트를 프로세스 안에서 직접 호출(배포 앱 미경유), T7의 두 프로세스는 한 머신의 워커(실제 다중 인스턴스 아님), Hrana 프로토콜 버전 직접 확인 안 함. §12.3의 "인스턴스 증가 전 원격 T6·T7 통과" 조건은 이 하네스 기준으로는 충족됐지만, 실제 다중 인스턴스 배포를 시험한 것은 아니다.
