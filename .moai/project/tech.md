# 기술 스택

> 최종 수정: 2026-09-18 (SPEC-B2C-FOUNDATION-001 M6 — Better Auth/E2E
> 섹션을 M1-M5 삭제 실행 결과에 맞춰 갱신. Better Auth·`lib/auth/`는
> 삭제 완료로 레거시 표기, B2B 전용 E2E 시나리오 13개 삭제 반영,
> `tester:add` 스크립트 참조 제거. 그 외 스택(Next.js/TypeScript/
> Tailwind/Turso·Drizzle/Gemini/Zod)은 변경 없음. 이전 개정: 2026-09-17
> 디자인 피벗 반영 — B2C 보상 진단 퍼널 방향으로
> 문서 재작성. 아래 스택은 모두 **기존 B2B 구현에서 그대로 재사용 가능**
> 하다는 전제로 유지한다 — 이번 개정은 기술 선택을 바꾸지 않았고, PII
> 정책 예외와 담보 매칭 로직 미결정 사항만 새로 추가했다. 그 이전 개정:
> 2026-09-17 SPEC-ORACLE-HOSTING-001 — 배포 플랫폼을 Netlify Free에서
> Oracle Cloud Always Free VM으로 전환)

## 개요

보상레이더는 "무료 tier 우선, 불필요한 overengineering 금지"라는 원칙
아래, 검증된 최신 웹 개발 스택을 채택한다. 기존 B2B 방향(사건 리서치
파이프라인)에서 구축한 스택을 새 B2C 방향(보상 진단 퍼널)에서도
재사용한다는 것이 2026-09-17 재인터뷰의 전제다 — 단, 담보 매칭 로직의
구체적 구현 방식(정적 규칙 vs AI)은 아직 결정되지 않았다(§ 담보 매칭
로직 — 미결정 사항 참고).

## 기술 선택과 근거

### Next.js (최신 안정 버전) + App Router
- 프런트엔드와 백엔드(API route handler)를 하나의 코드베이스로 통합해, MVP 단계에서 별도 백엔드 서버를 운영할 필요가 없다.
- `output: "standalone"` 빌드 모드로 단일 애플리케이션을 별도 프런트엔드·백엔드 분리 없이, 표준 Linux VM 위에서 그대로 구동할 수 있다.
- App Router는 서버 컴포넌트 기반으로, 사건 입력·리포트 조회처럼 데이터 흐름이 명확한 화면에 적합하다.

### TypeScript strict
- 리서치 파이프라인(CaseNormalizer → QueryPlanner → Evidence Retriever → Researcher → Skeptic → Verifier)처럼 단계 간 데이터 타입이 명확해야 하는 구조에서, strict 모드는 단계 경계에서 발생하는 타입 오류를 컴파일 시점에 잡아준다.

### Tailwind CSS + shadcn/ui
- 별도 디자인 시스템을 구축할 여력이 없는 MVP 단계에서, 검증된 컴포넌트 세트(shadcn/ui)와 유틸리티 CSS(Tailwind)를 조합해 개발 속도를 우선한다.
- shadcn/ui는 컴포넌트 코드를 프로젝트에 직접 복사하는 방식이라 커스터마이징이 쉽고, 별도 런타임 의존성이 늘어나지 않는다.

### Turso/libSQL + Drizzle ORM
- Turso는 SQLite 호환 libSQL 기반의 서버리스 DB로, 무료 tier가 MVP 규모의 트래픽에 충분하다.
- Drizzle ORM을 DB 접근의 유일한 경로로 둠으로써, 애플리케이션 코드가 libSQL 고유 문법에 직접 의존하지 않도록 한다. 이는 향후 사용자·데이터가 늘어나 PostgreSQL로 이전해야 할 때, 스키마 정의와 쿼리 로직을 최대한 재사용할 수 있게 하기 위한 의도적 설계다.
- 별도 vector DB는 도입하지 않는다. MVP 단계의 evidence 검색은 seed 데이터 규모에서 Drizzle ORM 쿼리로 충분히 처리 가능하다고 판단한다.

### Gemini API (AI Provider Abstraction 뒤에 위치)
- Gemini를 초기 LLM으로 채택하되, 애플리케이션 로직이 Gemini API에 직접 종속되지 않도록 공통 provider 인터페이스(`lib/ai/provider.ts`) 뒤에 감싼다.
- Researcher, Skeptic, Verifier 등 파이프라인 단계는 이 인터페이스에만 의존하며, Gemini 전용 SDK를 직접 호출하지 않는다.
- 이 구조 덕분에 향후 다른 LLM provider를 추가하거나 교체하더라도, 파이프라인 로직 자체는 수정할 필요가 없다.
- **무료 tier 한도(rate limit/quota) 대응**: Gemini 무료 tier는 분당/일별 요청 한도가 존재한다. Researcher/Skeptic/Verifier 호출을 사건당 3회로 고정하고, 모델별 `RateScheduler`가 프로세스 생애주기 동안 자체 부과 RPM 간격을 유지한다. `lib/pipeline/index.ts`의 프로세스 로컬 Promise 체인이 Gemini 단계의 동시 사건 실행을 1개로 제한하며, `lib/ai/providers/gemini.ts`는 429/503 응답의 재시도 힌트를 반영해 제한된 횟수로 재시도한다. 이 보호는 여러 인스턴스 사이에서 공유되는 분산 큐가 아니라 단일 PM2 프로세스 내부 상태이므로, 실제 동시 부하는 readiness 단계에서 별도로 검증한다.

### Better Auth — 초대 전용 접근 제어 (레거시, 삭제 완료)
- **B2B 파일럿 당시 채택**: 비공개 파일럿(테스터 10명 내외) 규모에 맞춰, Oracle Cloud Always Free VM + Turso 무료 tier 조합을 대상으로 세션 기반 인증 라이브러리 **Better Auth**를 채택했다. Credentials(이메일+비밀번호) 또는 매직 링크 provider + 운영자가 미리 등록한 테스터 이메일 allowlist(Drizzle 스키마의 `allowed_testers` 테이블 등)를 조합해, 셀프 가입 없이 지정된 테스터만 로그인할 수 있도록 했다. Better Auth는 Drizzle ORM 어댑터를 공식 지원해 별도 스키마 브리지 없이 기존 DB 계층과 통합됐다.
- 원래는 Auth.js(NextAuth) v5를 검토했으나, plan-phase 조사(`research.md` §4) 결과 Auth.js v5가 여전히 npm `beta` 태그로만 배포 중이고 2025년 9월부터 Better Auth 팀이 유지보수를 인수해 Auth.js는 보안 패치만 하는 유지보수 전용 모드로 전환된 사실을 확인했다. 신규 프로젝트가 유지보수 전용 라이브러리를 채택할 이유가 없으므로, 실제로 개발이 이어지고 있는 Better Auth로 결정을 바꿨다.
- 별도 SaaS형 인증 서비스(Auth0, Clerk 등)를 도입하지 않았던 이유: 테스터 규모가 10명 내외로 작고, "무료 tier 우선, 불필요한 overengineering 금지" 원칙(`product.md` 원칙 8, 본 문서 개요 참고)에 더 부합했기 때문이다.
- **삭제 완료 (SPEC-B2C-FOUNDATION-001 M3, 2026-09-18)**: B2C 흐름은 로그인을 요구하지 않으므로, `lib/auth/**`(`session.ts` 포함), `app/login/*`, `app/api/auth/[...all]/route.ts`, `proxy.ts` 인증 가드, `package.json`의 `better-auth` 의존성을 전부 삭제했다. 이 섹션은 왜 Better Auth가 선택됐는지에 대한 역사적 기록으로만 남긴다 — 현재 코드베이스에 Better Auth 관련 파일은 존재하지 않는다.

### Zod — 입력 검증 (PII 차단 강제)
- 사건 입력 폼/API의 입력 검증 스키마 라이브러리로 Zod를 채택한다. TypeScript strict 모드와 타입 추론이 자연스럽게 통합되고, 별도 런타임 의존성 없이 스키마 기반 검증을 표현할 수 있다.
- `lib/validation/case-input.ts`에 정의된 스키마가 주민등록번호·전화번호·상세주소·의료기록 원본에 해당하는 필드 형식(정규식/포맷 검사)을 구조적으로 거부하며, 이 검증을 통과하지 못한 요청은 `CaseNormalizer` 이전 단계에서 차단되어 DB나 Gemini API에 도달하지 않는다.

### Oracle Cloud Always Free VM (배포)
- SPEC-PILOT-READY-001에서 최초 확정한 Netlify Free tier 배포는 무료 크레딧 소진으로 더 이상 사용할 수 없게 되어, SPEC-ORACLE-HOSTING-001에서 Oracle Cloud Always Free VM(`VM.Standard.E2.1.Micro`, 1GB RAM)으로 전환했다. 프레임워크 마이그레이션 없이 기존 Next.js 앱을 `output: "standalone"` 빌드로 표준 Linux VM 위에서 그대로 구동한다.
- 구성: PM2(프로세스 관리, 크래시 시 자동 재시작) + Nginx(리버스 프록시, Next.js 프로세스는 `127.0.0.1`에만 바인딩) + Certbot/Let's Encrypt(HTTPS 자동 발급·갱신). 도메인은 DuckDNS 무료 서브도메인(`bosang-radar.duckdns.org`)을 사용하며, IP 변경에 대비해 5분 주기 cron으로 자동 갱신한다.
- Netlify 시절 `POST /api/cases`가 `case_jobs`에 작업을 기록하고 202를 반환한 뒤 Netlify Background Function이 비동기로 처리하던 구조는, PM2가 상시 구동되는 단일 프로세스 서버 환경에서는 불필요해졌다. 별도 서버리스 함수 대신 Next.js `after()`(같은 프로세스 내 백그라운드 실행)로 대체했다.
- 1GB RAM 제약: TypeScript 빌드 시 V8의 힙 크기 자동 감지가 과도하게 커져 OOM이 발생한 이력이 있어, `NODE_OPTIONS=--max-old-space-size=3072` + 4GB swap 파일로 완화한다.
- main 브랜치 푸시 시 GitHub Actions(`.github/workflows/deploy.yml`)가 SSH로 접속해 자동으로 최신 코드를 받아 빌드 후 재배포한다(빌드 성공 후에만 재시작해, 빌드 실패가 운영 중인 서비스에 영향을 주지 않는다).

## 개발 환경 요구사항

- **Node.js**: 20.x LTS 이상(현재 활성 LTS 기준 최소 버전). 프로젝트 생성 시 `package.json`의 `engines.node`에 `>=20.x`로 명시한다.
- **패키지 매니저**: pnpm. 빠른 설치 속도와 디스크 효율성을 위해 채택하며, 프로젝트 전체에서 npm/yarn 대신 pnpm 명령어로 통일한다.

## 테스트 도구

- **Vitest** — 단위/통합 테스트 프레임워크. `pnpm test` 명령으로 실행한다.
- 리서치 파이프라인의 각 단계(CaseNormalizer, QueryPlanner 등)는 독립적으로 테스트 가능하도록 설계하며, seed evidence 데이터를 활용한 end-to-end 파이프라인 테스트도 Vitest로 작성한다.
- **`@playwright/test`**(SPEC-RUNTIME-001) — 실제 Chromium 브라우저 기반 E2E 테스트 프레임워크. 진입점(`pnpm test:e2e` → `scripts/run-e2e.ts`)과 `vitest.config.ts`의 `e2e/**` 제외 설정은 유지되나, 로그인·사건입력·피드백·테넌트 격리 등 B2B 전용 시나리오 13개는 대상 기능(Better Auth, `app/cases/*`)과 함께 SPEC-B2C-FOUNDATION-001 M5에서 삭제됐다 — `e2e/` 디렉터리 자체가 더 이상 존재하지 않는다. B2C 01/02/03 화면이 아직 미구현이라 대체 시나리오도 아직 없다(대체 검증 상세: `progress.md` M5).

## 런타임 활성화 도구 (SPEC-RUNTIME-001)

- **`@next/env`** — Next.js가 내부적으로 사용하는 것과 동일한 `.env.local` 로더를, `pnpm db:migrate`/`pnpm db:seed` 같은 독립 CLI 스크립트(Next.js 서버 프로세스 바깥에서 실행)에서도 재사용하기 위해 채택했다. 이 CLI들은 `scripts/cli-bootstrap.ts`를 통해 셸 `export` 없이 `.env.local` 파일을 직접 로드하며, 이는 Next.js 자체가 환경변수를 로드하는 것과 동일한 방식(우선순위·오버라이드 규칙)을 CLI 스크립트에서도 그대로 재현하기 위함이다. (`pnpm tester:add`는 Better Auth 테스터 프로비저닝용이었으나, 대상 스크립트 `scripts/provision-tester.ts`와 함께 SPEC-B2C-FOUNDATION-001 M5에서 삭제됐다.)

## 린트 / 포맷터

- **ESLint** — `eslint-config-next` 기반 설정으로 Next.js/React 관례 및 잠재적 버그 패턴을 검사한다.
- **Prettier** — 코드 포맷 통일. TypeScript strict 모드와 함께 사용해, 스타일 논쟁 없이 일관된 코드베이스를 유지한다(TRUST 5 "Unified" 원칙).
- `pnpm lint` / `pnpm format` 스크립트로 실행하며, 커밋 전 로컬 훅(선택)으로 연결할 수 있다.

## PII 정책 예외 및 리드 폼 검증 스키마 (신규, B2C 피벗)

기존 B2B 원칙("PII 저장 최소화, 전화번호 등 아예 받지 않음")은 새 B2C
흐름에서 **화면 단위로 분리**된다. 2026-09-17 재인터뷰에서 확정된 경계:

- **01 질문 입력 · 02 보상 진단 결과**: 기존 원칙 그대로 유지. 새 화면을
  구현하더라도 이름·전화번호·주민번호 등 PII 입력 필드를 두지 않는다.
  기존 `lib/validation/case-input.ts`의 Zod 정규식 차단 패턴(주민등록번호·
  휴대전화번호 형식 거부)을 그대로 참고할 수 있다.
- **03 상담 신청**: 명시적 예외. 카톡/전화 상담 연결을 위해 이름과
  연락처(전화번호 또는 카카오톡 ID)를 수집해야 한다.
- **코드 영향**: 기존 `lib/validation/case-input.ts` 스키마는 "PII
  형식을 무조건 거부"하는 것이 목적이므로, 03 화면의 리드 폼에
  그대로 재사용할 수 없다. **새로운 검증 스키마가 필요하며, 현재
  `lib/validation/` 아래에 존재하지 않는다** — 이 스키마는 이름·전화번호
  필드를 명시적으로 허용하되, 다른 임의 필드로 PII 예외 범위가 넓어지지
  않도록 스코프를 좁게 유지해야 한다(예: 자유 텍스트 필드에 PII 예외를
  적용하지 않음). 실제 스키마 설계·구현은 후속 SPEC 범위다.
- Zod를 검증 라이브러리로 계속 사용한다 — 새 스키마도 동일한 패턴
  (`lib/validation/` 아래 파일 단위 스키마)을 따를 것을 제안한다.

## 담보 매칭 로직 — 미결정 사항 (후속 SPEC 필요)

B2C 02 화면(보상 진단 결과)의 핵심은 사용자 입력(01 화면의 검색어)을
4카테고리(실손의료비/정액담보/후유장해/특별보상) 담보 목록으로
매칭하는 로직이다. 2026-09-17 재인터뷰에서 이 로직의 구현 방식은
**의도적으로 결정을 미뤘다** — 기존 스택이 "재사용 가능하다"는
전제만 문서에 남긴다.

두 방향이 모두 후보로 열려 있다:

1. **정적 규칙 기반**: 사고·질병 유형별로 사전 정의된 담보 매핑
   테이블(`lib/coverage/` 후보, `structure.md` § 목표 구조 참고)을
   조회하는 방식. 응답 속도가 빠르고 예측 가능하지만, 케이스 커버리지가
   사전 정의 범위로 제한된다.
2. **기존 AI provider abstraction 재사용**: `lib/ai/provider.ts`
   인터페이스 뒤의 Gemini adapter를 통해 자유 텍스트 검색어를 담보
   카테고리로 매칭하는 방식. 케이스 커버리지가 넓지만, 무료 tier
   rate limit(§ Gemini API 참고)과 확정성(정액담보처럼 "약관 확정" 표기가
   필요한 항목)을 함께 고려해야 한다.

두 방향을 혼합(예: 자주 나오는 사례는 정적 규칙, 나머지는 AI 보완)하는
것도 가능하다. 이 판단은 **후속 SPEC의 범위**이며, 이번 문서 재작성에서는
결정하지 않는다.

**참고 (2026-09-17 재확인)**: 기존 B2B 코드는 삭제가 결정됐지만, `lib/pipeline/`의
Researcher·Skeptic·Verifier 같은 AI 리서치 엔진 자체는 삭제 전에
"02 화면 담보 매칭에 재활용 가능한지" 후속 SPEC에서 한 번 검토해볼 가치가
있다 — 삭제는 라우트·인증(`app/cases/*`, `lib/auth/`)부터 시작하고,
파이프라인 모듈의 운명은 담보 매칭 로직 결정과 함께 판단하는 편을 제안한다.

## 비용 태도 — "무료 tier 우선"

- Vercel(호스팅), Turso(DB), 그 외 가능한 모든 인프라 구성 요소는 무료 tier를 우선적으로 검토하고 채택한다.
- 유료 tier로의 전환은 실사용 테스트(실무자 10명) 과정에서 무료 tier 한도가 실제로 문제가 될 때에만 검토한다.
- microservice, Kubernetes, 별도 vector DB처럼 운영 비용과 복잡도를 늘리는 인프라는 이번 MVP 단계에서 의도적으로 배제한다.
