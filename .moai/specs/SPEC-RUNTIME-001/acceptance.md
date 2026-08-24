# Acceptance Criteria — SPEC-RUNTIME-001

모든 AC는 Given-When-Then 형식으로 이진(binary) 검증 가능하게 작성한다. 각 AC는 검증 대상 요구사항(REQ-RUNTIME-XXX)을 **Traces** 라인으로 명시적으로 추적한다. AC 개수: 20개 (Tier L 상한 25개 이내). REQ 20개 전체가 최소 1개의 AC에 의해 추적된다(§C 추적 매트릭스 참고).

> **개정 v0.2.0**: 구현 접근 방식 3건 개정(`plan.md` §A.2)에 따라 AC-RUNTIME-007/008/009/015/017/018/019를 갱신하고 AC-RUNTIME-020을 신설했다. **어떤 AC의 판정 기준도 낮추지 않았다** — 특히 AC-RUNTIME-007의 "실제 로그인 성공" 기준은 그대로다.

## §A. AC 매트릭스

### AC-RUNTIME-001 — 마이그레이션 실제 적용
**Traces**: REQ-RUNTIME-001
- **Given** 스키마가 적용되지 않은 빈 libSQL 인스턴스를 `TURSO_DATABASE_URL`이 가리키고 있을 때
- **When** `pnpm db:migrate`를 실행하면
- **Then** 명령이 exit 0으로 종료하고, 해당 인스턴스에 `lib/db/schema.ts`가 정의한 9개 테이블(`user`, `session`, `account`, `verification`, `cases`, `evidence`, `reports`, `feedback`, `allowed_testers`)이 모두 존재한다.

### AC-RUNTIME-002 — 마이그레이션 재실행 안전성 (idempotent)
**Traces**: REQ-RUNTIME-002
- **Given** AC-RUNTIME-001이 이미 성공적으로 적용된 DB가 있을 때
- **When** `pnpm db:migrate`를 한 번 더 실행하면
- **Then** 명령이 exit 0으로 종료하고, 오류 없이 "적용할 마이그레이션 없음"에 해당하는 결과가 되며, 테이블 정의가 1차 실행 직후와 동일하다.

### AC-RUNTIME-003 — `file:` 스킴 capability gate
**Traces**: REQ-RUNTIME-003
- **Given** `TURSO_DATABASE_URL`이 `file:./.tmp/e2e.db`로 설정되고 `TURSO_AUTH_TOKEN`이 설정되지 않았을 때
- **When** 환경변수 검증 모듈(`lib/env.ts`)과 DB 클라이언트 생성 함수를 호출하면
- **Then** 검증이 통과하고 DB 연결이 성공한다. 반대로 `TURSO_DATABASE_URL`이 `libsql://`로 시작하고 `TURSO_AUTH_TOKEN`이 없으면 검증이 실패한다(두 방향 모두 검증).

### AC-RUNTIME-004 — 시드 데이터 DB 적재
**Traces**: REQ-RUNTIME-004
- **Given** 마이그레이션이 적용되고 `evidence` 테이블이 비어 있는 DB가 있을 때
- **When** `pnpm db:seed`를 실행하면
- **Then** 명령이 exit 0으로 종료하고, `evidence` 테이블의 행 수가 `db/seed/evidence.json`의 레코드 수와 일치하며, 각 행의 `id`/`category`/`title`/`content`가 JSON 값과 일치한다.

### AC-RUNTIME-005 — 시드 재실행 안전성 (idempotent)
**Traces**: REQ-RUNTIME-005
- **Given** AC-RUNTIME-004이 이미 성공한 DB가 있을 때
- **When** `pnpm db:seed`를 한 번 더 실행하면
- **Then** 명령이 exit 0으로 종료하고, `evidence` 테이블의 행 수가 1차 실행 직후와 정확히 동일하다(중복 행 0건).

### AC-RUNTIME-006 — allowed_testers 등록 및 재실행 안전성
**Traces**: REQ-RUNTIME-006, REQ-RUNTIME-009
- **Given** 마이그레이션이 적용된 DB와 아직 등록되지 않은 테스터 이메일이 있을 때
- **When** 테스터 프로비저닝 명령을 해당 이메일로 실행하고, 이어서 동일 이메일로 한 번 더 실행하면
- **Then** 1차 실행 후 `allowed_testers`에 해당 이메일 행이 정확히 1건 존재하고, 2차 실행 후에도 `allowed_testers`·`user`·`account` 각 테이블의 해당 이메일 관련 행 수가 여전히 각각 1건이다(중복 생성 0건).

### AC-RUNTIME-007 — 프로비저닝된 계정의 실제 로그인 성공
**Traces**: REQ-RUNTIME-007
- **Given** 테스터 프로비저닝 명령으로 이메일과 비밀번호가 등록된 계정이 있고, 프로덕션 `lib/auth/config.ts`의 `disableSignUp: true` 설정이 그대로 유지되어 있을 때
- **When** 해당 이메일과 비밀번호로 `/login`을 통해 로그인을 시도하면
- **Then** 로그인이 성공하여 세션이 생성되고 보호된 경로(`/cases/new`)에 접근할 수 있다. 이 AC는 "행이 삽입되었다"가 아니라 "실제로 로그인된다"를 검증 대상으로 삼는다(plan.md §E 위험 대응). **이 판정 기준은 개정 v0.2.0에서 완화되지 않는다.**
- **폴백 트리거 (개정 v0.2.0)**: 이 AC의 실패는 **경로 전환의 근거가 아니다**. 프로비저닝 경로를 `research.md` §3의 폴백(B → C)으로 전환하는 것은 **비마운트 인스턴스에서의 `auth.api.signUpEmail` 호출이 기술적으로 불가능함이 확인된 경우에만** 허용된다. 초판의 "AC-RUNTIME-007 연속 2회 실패 시 전환" 트리거는 폐기한다 — 올바르게 구현된 공식 API 경로는 확률적으로 실패하는 성질의 것이 아니므로, 런타임 실패는 경로 문제가 아니라 구현 결함 신호로 다루고 수정으로 대응한다. 폴백을 택하는 경우 불가능성을 확정한 관측(무엇을 시도했고 무엇이 관측됐는지)을 `progress.md` §E.2에 기록해야 하며, 관측 없는 전환은 금지한다.

### AC-RUNTIME-008 — 커밋 대상 파일 내 평문 시크릿 부재
**Traces**: REQ-RUNTIME-008
- **Given** 이 SPEC이 추가·수정한 모든 커밋 대상 파일(`scripts/**`, `e2e/**`, `lib/env.ts`, `package.json`, `.env.local.example`, 런북 문서, SPEC 아티팩트)이 있을 때
- **When** 해당 파일들에 대해 시크릿 패턴을 정적 검사하면
- **Then** (1) 실제 비밀번호·API 키·인증 토큰 값이 0건 발견되고, (2) `.env.local.example`과 런북의 모든 시크릿 항목이 `<...>` 형태의 플레이스홀더이며, (3) 프로비저닝 스크립트에 비밀번호를 CLI 인자로 받는 경로가 존재하지 않고, (4) **E2E가 실행 시점에 생성하는 임시 자격증명(테스터 비밀번호, E2E 전용 `BETTER_AUTH_SECRET`)이 어떤 커밋 대상 파일에도 리터럴 문자열로 존재하지 않는다** — 두 값은 `scripts/run-e2e.ts`가 생성해 프로세스 환경으로만 전달하며(`design.md` §3.4), 픽스처·설정·스냅샷 파일에 기록된 흔적이 0건이어야 한다. 특히 `playwright.config.ts`의 `webServer.env`에 두 값이 기재되어 있지 않아야 한다(상속으로 전달되므로 재기재는 불필요하며, 재기재 자체가 시크릿의 설정 파일 유입 경로가 된다).

### AC-RUNTIME-009 — 환경변수 누락 시 **앱 런타임 부팅 시점** fail-fast
**Traces**: REQ-RUNTIME-010
- **Given** `app` 스코프(`design.md` §3.1)가 요구하는 환경변수 중 하나 이상(예: `BETTER_AUTH_SECRET`)이 설정되지 않은 환경일 때
- **When** 애플리케이션을 실제로 기동하면(빌드 산출물을 `pnpm start`로 기동)
- **Then** (1) 기동이 즉시 실패하여 프로세스가 요청 수신 가능 상태에 **도달하지 못하고**, (2) 그 실패 출력에 누락된 변수의 정확한 이름과 그 변수가 왜 필요한지에 대한 설명 문구가 모두 포함된다. **이 AC는 부팅 경로로만 검증한다** — 검증 함수를 직접 호출해 얻은 결과는 이 AC의 증거가 될 수 없다. 기동이 성공한 뒤 첫 요청에서야 실패가 드러나는 형태는 FAIL이다(지연 실패는 REQ-RUNTIME-010이 닫으려는 대상이며, `design.md` §6이 이 경로로의 후퇴를 금지한다).
- **비고 (개정 v0.2.0)**: 목적별 스코프 도입은 이 AC를 완화하지 않는다. 검증 **시점**(부팅)은 그대로이며, 바뀐 것은 `app` 스코프가 요구하는 **변수 집합**이다. 어떤 변수가 어떤 스코프에 속하는지는 AC-RUNTIME-020이 별도로 검증한다.

### AC-RUNTIME-010 — 오류 메시지의 시크릿 미노출
**Traces**: REQ-RUNTIME-011
- **Given** `BETTER_AUTH_SECRET` 등 일부 환경변수가 잘못된 형식의 **값이 설정된** 상태일 때
- **When** 환경변수 검증이 실패하여 오류 메시지를 생성하면
- **Then** 오류 메시지 문자열에 해당 환경변수의 실제 값이 부분 문자열로도 포함되지 않는다.

### AC-RUNTIME-011 — E2E: 로그인 성공 및 미등록 이메일 거부
**Traces**: REQ-RUNTIME-012
- **Given** E2E 글로벌 셋업으로 테스터 A가 프로비저닝된 로컬 파일 DB가 있을 때
- **When** E2E 스위트가 (1) 테스터 A의 자격증명으로 로그인하고, (2) `allowed_testers`에 없는 이메일로 로그인을 시도하면
- **Then** (1)은 로그인에 성공해 보호 경로로 진입하고, (2)는 로그인이 거부되어 세션이 생성되지 않는다.

### AC-RUNTIME-012 — E2E: 사건 입력 → 처리 → 저장 → 리포트 조회
**Traces**: REQ-RUNTIME-013
- **Given** 로그인된 테스터 A 세션과 마이그레이션·시드가 완료된 DB가 있을 때
- **When** E2E 스위트가 `/cases/new`에서 PII를 포함하지 않는 유효한 사건을 입력해 제출하면
- **Then** `/api/cases`가 201을 반환하고, `cases` 테이블에 `owner_user_id`가 테스터 A인 행이, `reports` 테이블에 해당 `case_id`를 가진 행이 각각 생성되며, `/cases/[caseId]` 페이지에서 생성된 리서치 리포트 내용이 렌더링된다.

### AC-RUNTIME-013 — E2E: 전문가 피드백 저장
**Traces**: REQ-RUNTIME-014
- **Given** AC-RUNTIME-012으로 생성된 사건 상세 화면에 테스터 A가 접근해 있을 때
- **When** E2E 스위트가 피드백 내용을 입력해 제출하면
- **Then** `feedback` 테이블에 해당 `case_id` + 테스터 A의 `user_id` + 입력한 `content`를 가진 행이 1건 생성된다.

### AC-RUNTIME-014 — E2E: tenant isolation (타 사용자 사건 접근 차단)
**Traces**: REQ-RUNTIME-015
- **Given** 테스터 A가 소유한 사건과, 별도로 프로비저닝된 테스터 B의 로그인 세션이 있을 때
- **When** E2E 스위트가 테스터 B 세션으로 테스터 A의 `/cases/[caseId]`에 접근하면
- **Then** 사건 내용이 렌더링되지 않고 접근이 거부된다(404 또는 접근 거부 응답).

### AC-RUNTIME-015 — E2E: 단일 명령 재현성 + 시크릿 공유 보장 + 로컬 파일 DB 격리
**Traces**: REQ-RUNTIME-016, REQ-RUNTIME-017
- **Given** `.tmp/e2e.db`가 존재하지 않는 깨끗한 작업 트리와, **테스터 비밀번호를 포함해 어떤 시크릿도 셸에 미리 설정되어 있지 않은** 상태(개발자의 실제 Turso 자격증명·`BETTER_AUTH_SECRET`·`TESTER_PASSWORD` 모두 미설정)일 때
- **Given (현실적 상태 — 필수)** 그와 **동시에** `.env.local`이 디스크에 존재하고 그 안에 **실제 원격 Turso 자격증명**(`TURSO_DATABASE_URL=libsql://...`, `TURSO_AUTH_TOKEN=...`)이 기입되어 있을 때 — 이는 이 SPEC 자신의 런북(`research.md` §2: `.env.local.example` → `.env.local` 복사 후 실제 값 기입)을 따른 개발자에게 **정상적인** 머신 상태다. "셸에 export된 시크릿이 없다"와 "`.env.local`이 없다"는 서로 **다른 조건**이며, 런북을 따른 개발자에게 현실적인 것은 전자뿐이다. 따라서 `.env.local` 부재 상태만으로 얻은 결과는 이 AC의 증거로 인정하지 않는다
- **When** 개발자가 `pnpm test:e2e` 단일 명령을 실행하면
- **Then** (1) 사람의 수동 조작 없이 시크릿 생성·DB 초기화·마이그레이션·시드·테스터 프로비저닝·앱 기동·전체 시나리오 실행·앱 종료가 자동 수행되어 exit 0으로 종료하고, (2) 실행 중 접근한 DB는 `file:` 스킴 로컬 파일이며 원격 Turso 인스턴스에 대한 쓰기가 발생하지 않으며, (3) **로그인 시나리오(AC-RUNTIME-011)가 통과한다는 사실 자체가 서버 프로세스와 테스트 프로세스의 시크릿 일치를 입증한다** — 두 프로세스가 서로 다른 `BETTER_AUTH_SECRET`을 보면 세션 서명이 검증되지 않아 로그인이 성립할 수 없고, 서로 다른 `TESTER_PASSWORD`를 보면 자격증명이 일치하지 않는다.
- **`.env.local` 무관 불변식 (REQ-RUNTIME-017의 유일한 검증 지점)**: 위 (2)는 `.env.local`의 **내용과 무관하게** 성립해야 한다 — `.env.local`에 실제 원격 Turso URL·토큰이 기입되어 있어도 E2E 실행은 로컬 파일 DB(`file:./.tmp/e2e.db`)만 접근하며, 개발자의 실제 Turso 인스턴스에는 **쓰기도 읽기도 발생시키지 않는다**. Next.js 서버 프로세스는 상속받은 `process.env` 외에 `.env.local`을 디스크에서 독립적으로 로드하므로, 이 불변식은 두 공급원 사이의 우선순위가 진입점 스크립트 쪽으로 확정되어야만 성립한다(`design.md` §3.4 "세 번째 공급원"). 그 우선순위는 플랜 단계에서 **문서로만 확인되었고 실행으로 관측되지 않았다**(`research.md` §6) — 따라서 이 항목은 M5에서 실측으로 닫아야 하는 항목이며, 위 Given의 현실적 상태(원격 자격증명이 담긴 `.env.local` 존재)에서 실행해 검증한다.
- **구조적 요건 (개정 v0.2.0)**: 위 (3)의 일치는 **프로세스 계보로 보장**되어야 한다 — `scripts/run-e2e.ts`가 시크릿을 생성한 뒤 Playwright를 자식으로 spawn하고, Playwright가 Next.js 서버를 자식으로 spawn하는 형태(`design.md` §3.4). `e2e/global-setup.ts`가 시크릿을 생성해 `webServer`로 전파되기를 기대하는 형태는 이 AC를 만족하지 못한다(프레임워크 훅 실행 순서에 대한 가정이므로 "보장"이 아니다). 검증: 저장소에 `e2e/global-setup.ts`가 존재하지 않고, 시크릿 생성 지점이 Playwright를 spawn하는 스크립트 안에 있음을 정적으로 확인한다.

### AC-RUNTIME-016 — 기존 품질 게이트 유지
**Traces**: REQ-RUNTIME-018
- **Given** 이 SPEC의 모든 변경이 반영된 작업 트리가 있을 때
- **When** `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm format:check`를 각각 실행하면
- **Then** 4개 명령이 모두 exit 0으로 종료한다. 특히 `pnpm test`(Vitest)는 `e2e/**`를 수집하지 않아 브라우저 없이도 통과한다.

### AC-RUNTIME-017 — 아키텍처 경계 보존
**Traces**: REQ-RUNTIME-019, REQ-RUNTIME-007 (항목 4 — 프로비저닝 전용 인스턴스 비노출)
- **Given** 이 SPEC의 모든 변경이 반영된 작업 트리가 있을 때
- **When** SPEC-SCAFFOLD-001이 확립한 경계를 정적 검사하면
- **Then** (1) `git diff`상 `lib/pipeline/**`, `lib/ai/**`, `lib/validation/**`, `lib/db/schema.ts`에 대한 동작 변경이 0건이고, (2) `lib/pipeline/`에서 `@google/genai` import가 여전히 0건이며, (3) `db/migrations/`에 새 마이그레이션 파일이 추가되지 않았고(스키마 불변), (4) **프로비저닝 전용 Better Auth 인스턴스가 어디에도 노출되지 않는다** — 구체적으로 (4a) `lib/auth/config.ts`의 `disableSignUp: true`가 `git diff`상 변경되지 않았고, (4b) `scripts/` 밖의 어떤 파일도 프로비저닝 인스턴스 생성 함수를 import하지 않으며, (4c) `app/**`의 어떤 라우트 핸들러·미들웨어도 그 인스턴스를 참조하지 않는다.
- **(4)항의 근거 (개정 v0.2.0)**: 프로비저닝 인스턴스는 셀프 가입이 허용된 설정을 갖는다(`design.md` §3.2.1). "공개 가입 표면이 열리지 않는다"는 주장은 **그 인스턴스에 네트워크로 도달할 경로가 없다**는 사실에만 근거하므로, 비노출이 깨지는 순간 주장 자체가 무효가 된다 — 따라서 이 불변식은 문서 경고가 아니라 정적 검증 대상이다.

### AC-RUNTIME-018 — 런북 문서 완결성
**Traces**: REQ-RUNTIME-020
- **Given** 프로젝트를 처음 접하는 운영자와 이 SPEC이 생성한 런북 문서가 있을 때
- **When** 운영자가 문서에 기재된 절차만을 순서대로 따라가면
- **Then** (1) 환경변수 설정 → 마이그레이션 적용 → 시드 → 테스터 계정 생성 → **E2E 사전 준비** → E2E 실행의 6개 단계가 모두 실행 가능한 구체적 명령으로 기재되어 있고, (2) 문서 내 모든 시크릿 항목이 플레이스홀더이며 실제 값이 0건이고, (3) 각 시크릿의 발급처(Turso 대시보드, Google AI Studio 등)가 명시되어 있으며, (4) **각 단계가 요구하는 환경변수가 그 단계에 한정해 기재**되어 있다 — 예컨대 마이그레이션 단계에 `BETTER_AUTH_SECRET`을 요구 항목으로 적지 않는다(`design.md` §3.1 스코프 매트릭스와 일치).
- **E2E 사전 준비 단계의 필수 내용**: (a) 브라우저 바이너리 설치(`pnpm exec playwright install --with-deps chromium`), (b) **E2E 실행에 필요한 시크릿을 운영자가 미리 설정할 필요가 없다는 사실과 그 이유** — 테스터 비밀번호와 E2E 전용 `BETTER_AUTH_SECRET`은 `scripts/run-e2e.ts`가 실행 시점에 생성해 프로세스 환경으로만 전달하므로(`design.md` §3.4), 운영자가 `.env.local`이나 셸에 별도 값을 넣는 절차가 없다. 이 설명이 없으면 운영자는 앞 단계에서 익힌 "시크릿은 직접 발급해 넣는다"는 패턴을 E2E에도 적용하려다 막힌다.
- **`GEMINI_API_KEY`에 대한 기재 (개정 v0.2.0)**: 런북은 이 변수가 **이번 SPEC의 앱 기동에는 요구되지 않는다**는 사실을 명시한다(파이프라인이 mock 구현을 유지하므로 소비 지점이 없다 — `design.md` §3.1 각주). 이 설명이 없으면 운영자는 발급받은 키를 넣어야 앱이 뜬다고 오해하고, 키가 없으면 진행을 멈춘다.

### AC-RUNTIME-019 — 검증 함수 단위: 누락 변수 전량 열거
**Traces**: REQ-RUNTIME-010
- **Given** 특정 스코프가 요구하는 환경변수가 **2개 이상** 동시에 누락된 상태를 구성했을 때
- **When** `lib/env.ts`의 환경변수 검증 함수를 해당 스코프로 단위 테스트에서 직접 호출하면
- **Then** 그 스코프에서 누락된 변수가 **전부** 열거되며(첫 번째에서 중단하지 않는다), 각 항목에 변수명과 필요 이유가 함께 담기고, 오류 메시지에 어떤 스코프의 검증인지가 포함된다.
- **비고**: AC-RUNTIME-009(부팅 경로)와 검증 대상이 다르다 — 009는 "언제 실패하는가"(부팅 시점)를, 이 AC는 "무엇을 알려주는가"(전량 열거 + 설명)를 검증한다. 단위 호출로 부팅 시점 요구를 대신 만족시킬 수 없도록 분리했다.

### AC-RUNTIME-020 — 검증 함수 단위: 목적별 스코프 좁힘 (양방향)
**Traces**: REQ-RUNTIME-010
- **Given** `design.md` §3.1 스코프 매트릭스가 정의한 네 스코프(`db` / `provision` / `app` / `e2e`)와, 변수 하나만 누락된 여러 환경 조합이 있을 때
- **When** 각 스코프로 `lib/env.ts`의 검증 함수를 단위 테스트에서 직접 호출하면
- **Then** 두 방향이 모두 성립한다:
  - **(양성)** 해당 스코프가 요구하는 변수가 누락되면 그 스코프의 검증이 **실패**한다. 최소한 다음 3건을 포함한다 — `db` 스코프에서 `TURSO_DATABASE_URL` 누락 시 실패, `provision` 스코프에서 `BETTER_AUTH_SECRET` 누락 시 실패, `app` 스코프에서 `BETTER_AUTH_URL` 누락 시 실패.
  - **(음성)** 해당 스코프가 요구하지 **않는** 변수가 누락되어도 그 스코프의 검증은 **통과**한다. 최소한 다음 3건을 포함한다 — `db` 스코프는 `BETTER_AUTH_SECRET`·`BETTER_AUTH_URL`이 모두 없어도 통과, `app` 스코프는 `GEMINI_API_KEY`가 없어도 통과, `provision` 스코프는 `BETTER_AUTH_URL`이 없어도 통과.
- **비고**: 음성 방향이 이 AC의 핵심이다. 양성만 검증하면 "모든 변수를 모든 스코프에서 요구하는" 구현(= 개정 이전 평면 집합)도 통과하므로, 스코프가 실제로 좁혀졌음은 음성 방향으로만 드러난다. `app` 스코프의 `GEMINI_API_KEY` 통과 항목은 파이프라인이 mock 구현을 유지하는 동안에만 유효하며, 실호출을 도입하는 후속 SPEC이 이 항목을 뒤집어야 한다(`design.md` §3.1 각주).

## §B. Definition of Done

- [ ] AC-RUNTIME-001 ~ 020 전체 PASS
- [ ] `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm format:check` 모두 exit 0
- [ ] `pnpm test:e2e` exit 0 (깨끗한 작업 트리 + 원격 Turso 자격증명 없는 상태에서)
- [ ] 커밋 대상 파일 내 평문 시크릿 0건 (AC-RUNTIME-008)
- [ ] `db/migrations/`에 신규 마이그레이션 파일 추가 없음 (스키마 불변, AC-RUNTIME-017)
- [ ] E2E DB 파일이 커밋되지 않음 — `git check-ignore -v .tmp/e2e.db`가 성공(exit 0)으로 무시 규칙을 보고한다. 기존 `*.tmp` 글롭이 이미 이를 덮으므로 `.gitignore` 항목 추가는 이 확인이 실패할 때만 수행한다
- [ ] spec.md §4 Out of Scope 6개 항목이 구현 범위에 포함되지 않았음을 확인
- [ ] 프로덕션 `lib/auth/config.ts`가 변경되지 않았음을 확인 — `git diff --exit-code lib/auth/config.ts`가 exit 0 (AC-RUNTIME-017 (4a))
- [ ] `e2e/global-setup.ts`가 존재하지 않음을 확인 (AC-RUNTIME-015 구조적 요건)

## §C. REQ ↔ AC 추적 매트릭스

| REQ | 추적 AC |
|-----|---------|
| REQ-RUNTIME-001 | AC-RUNTIME-001 |
| REQ-RUNTIME-002 | AC-RUNTIME-002 |
| REQ-RUNTIME-003 | AC-RUNTIME-003 |
| REQ-RUNTIME-004 | AC-RUNTIME-004 |
| REQ-RUNTIME-005 | AC-RUNTIME-005 |
| REQ-RUNTIME-006 | AC-RUNTIME-006 |
| REQ-RUNTIME-007 | AC-RUNTIME-007 (실제 로그인 성공), AC-RUNTIME-017 (4) (전용 인스턴스 비노출) |
| REQ-RUNTIME-008 | AC-RUNTIME-008 |
| REQ-RUNTIME-009 | AC-RUNTIME-006 |
| REQ-RUNTIME-010 | AC-RUNTIME-009 (앱 부팅 경로), AC-RUNTIME-019 (전량 열거), AC-RUNTIME-020 (스코프 좁힘) |
| REQ-RUNTIME-011 | AC-RUNTIME-010 |
| REQ-RUNTIME-012 | AC-RUNTIME-011 |
| REQ-RUNTIME-013 | AC-RUNTIME-012 |
| REQ-RUNTIME-014 | AC-RUNTIME-013 |
| REQ-RUNTIME-015 | AC-RUNTIME-014 |
| REQ-RUNTIME-016 | AC-RUNTIME-015 |
| REQ-RUNTIME-017 | AC-RUNTIME-015 |
| REQ-RUNTIME-018 | AC-RUNTIME-016 |
| REQ-RUNTIME-019 | AC-RUNTIME-017 |
| REQ-RUNTIME-020 | AC-RUNTIME-018 |

## §D. 검증되지 않는 항목 (참고)

- **원격 Turso 인스턴스에 대한 자동 검증**: AC-RUNTIME-015가 로컬 `file:` DB 격리를 요구하므로, 원격 Turso 연결의 네트워크·인증 실패 경로는 자동 E2E 대상이 아니다. AC-RUNTIME-001/002는 로컬·원격 어느 인스턴스에서도 성립하지만, 원격 확인은 런북(AC-RUNTIME-018)의 수동 절차로 보완한다.
- **로그인 시도 rate-limiting**: spec.md §5 잔여 위험으로 남으며 이 SPEC의 AC 대상이 아니다.
- **Gemini API 실호출**: 파이프라인이 mock 구현을 유지하므로(REQ-RUNTIME-019) E2E 흐름에서 실제 Gemini 호출은 발생하지 않는다. **개정 v0.2.0에서 `GEMINI_API_KEY`는 `app` 스코프의 요구 항목에서도 제외**되었으므로(`design.md` §3.1 각주), 이 변수는 이번 SPEC에서 실호출 검증 대상도 부팅 검증 대상도 아니다 — AC-RUNTIME-020이 검증하는 것은 그 **부재가 앱 스코프 검증을 막지 않는다**는 사실뿐이다. 실호출을 활성화하는 후속 SPEC이 이 변수를 `app` 스코프 필수로 승격하고 그에 맞는 AC를 정의해야 한다.
- **프로비저닝 인스턴스의 런타임 도달 불가능성**: AC-RUNTIME-017 (4)는 import·참조 관계에 대한 **정적** 검사다. 런타임에 동적 로딩으로 인스턴스에 도달하는 경로가 없음까지 실행으로 확인하지는 않는다 — 이 프로젝트에 동적 모듈 로딩 패턴이 없다는 관측에 근거한 판단이며, 그 전제가 바뀌면 재검토 대상이다.
