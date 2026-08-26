# 프로젝트 구조 (제안 — Greenfield Plan)

> 이 문서는 아직 코드가 존재하지 않는 상태에서 작성된 **제안 디렉터리 구조**다. 실제 코드베이스를 관찰한 결과가 아니라, `product.md`의 요구사항과 `tech.md`의 기술 스택을 바탕으로 앞으로 구현할 때 따를 계획이다. 구현이 진행되면서 세부 구조는 조정될 수 있다.
>
> 최종 수정: 2026-08-25 (SPEC-RUNTIME-001 후속 — `scripts/`, `e2e/`, `instrumentation.ts` 추가)

## 전체 트리 (제안)

```
bosang-radar/
├── app/                        # Next.js App Router 라우트
│   ├── layout.tsx
│   ├── page.tsx                # 랜딩/사건 입력 진입점
│   ├── login/                  # 초대받은 테스터 로그인 화면 (참고: Next.js 16부터 `middleware.ts`는 `proxy.ts`로 이름이 바뀌었고 edge 런타임을 지원하지 않는다 — research.md §1/§6)
│   ├── cases/
│   │   ├── new/                # 사건 입력 폼
│   │   └── [caseId]/           # 사건 상세 + 리서치 리포트 뷰 (본인 소유 사건만 접근)
│   └── api/
│       ├── auth/                # 인증 콜백/세션 관련 route handler
│       └── cases/              # 사건 생성/파이프라인 트리거용 route handler
├── proxy.ts               # 비로그인 사용자를 /login으로 리다이렉트하는 인증 가드
│
├── components/                 # UI 컴포넌트
│   └── ui/                     # shadcn/ui 기반 컴포넌트 (Button, Card, Form 등)
│
├── lib/
│   ├── auth/                   # 인증/세션/allowlist 로직
│   │   ├── config.ts           # Better Auth 설정 + 초대 전용 allowlist 검증
│   │   └── session.ts          # 세션 조회 헬퍼 (현재 로그인 사용자 식별)
│   ├── validation/              # 입력 검증 스키마 (PII 차단 강제 지점)
│   │   └── case-input.ts       # 사건 입력 Zod 스키마 — 주민번호/전화번호/상세주소/의료기록 원본 형식 거부
│   ├── ai/                     # AI provider abstraction 레이어
│   │   ├── provider.ts         # 공통 인터페이스 정의 (LLMProvider)
│   │   └── providers/
│   │       └── gemini.ts       # Gemini API 어댑터 (인터페이스 구현체)
│   ├── db/
│   │   ├── client.ts           # Turso/libSQL 클라이언트 초기화
│   │   └── schema.ts           # Drizzle ORM 스키마 정의 (cases 테이블에 owner_user_id 포함)
│   └── pipeline/                # 리서치 파이프라인 각 단계
│       ├── case-normalizer.ts
│       ├── query-planner.ts
│       ├── evidence-retriever.ts
│       ├── researcher.ts
│       ├── skeptic.ts
│       └── verifier.ts
│
├── db/
│   ├── migrations/              # Drizzle Kit이 생성하는 마이그레이션 파일
│   └── seed/                    # seed evidence 데이터 (초기에는 소규모)
│
├── scripts/                     # 런타임 활성화 CLI (SPEC-RUNTIME-001)
│   ├── cli-bootstrap.ts         # .env.local 명시적 로드 부트스트랩 (셸 export 불필요)
│   ├── db-migrate.ts            # pnpm db:migrate 진입점 (재실행 안전)
│   ├── db-seed.ts               # pnpm db:seed 진입점 (재실행 안전)
│   ├── provision-tester.ts      # pnpm tester:add 진입점 (Better Auth signUpEmail 호출)
│   └── run-e2e.ts               # pnpm test:e2e 진입점 (동적 포트 탐색 + DB 초기화 + Playwright 실행)
│
├── e2e/                         # Playwright E2E 시나리오 (SPEC-RUNTIME-001)
│   ├── auth.spec.ts             # 로그인 시나리오
│   ├── case-flow.spec.ts        # 사건입력 + 피드백 시나리오
│   ├── tenant-isolation.spec.ts # 테넌트(사용자 간) 데이터 격리 시나리오
│   └── helpers.ts                # 시나리오 공용 헬퍼
│
├── public/                      # 정적 자산
│
├── .moai/                       # MoAI-ADK 프로젝트 메타 (SPEC, 설정, 문서)
│
├── instrumentation.ts            # Next.js 부팅 시점 환경변수 fail-fast 훅 (SPEC-RUNTIME-001)
├── playwright.config.ts          # Playwright 설정 (SPEC-RUNTIME-001)
├── drizzle.config.ts             # Drizzle Kit 설정
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json                 # strict 모드 활성화
├── package.json
└── .env.local                    # Turso/Gemini/Auth 시크릿 (커밋 금지)
```

## 디렉터리별 목적

### `app/` + `proxy.ts`
Next.js App Router 기반 라우트 트리. 사건 입력 폼(`cases/new`), 사건 상세 및 리서치 리포트 조회(`cases/[caseId]`), 파이프라인을 트리거하는 API route handler(`api/cases`), 로그인 화면(`login/`)으로 구성한다. `proxy.ts`가 모든 `cases/*` 및 `api/cases/*` 요청에 대해 로그인 세션을 확인하고, 비로그인 요청은 `/login`으로 리다이렉트한다. 서버 컴포넌트를 기본으로 하고, 폼 입력 등 상호작용이 필요한 부분만 클라이언트 컴포넌트로 분리한다.

### `lib/auth/` — 접근 제어 (핵심 설계 결정)
비공개 파일럿(테스터 10명 내외) 규모에 맞춘 초대 전용 인증을 구현한다. `lib/auth/config.ts`가 Better Auth의 Credentials 또는 매직 링크 provider를 설정하고, 운영자가 사전에 등록한 테스터 이메일 allowlist를 대조해 셀프 가입을 차단한다. `lib/auth/session.ts`는 현재 로그인한 사용자를 조회하는 헬퍼를 제공하며, `lib/pipeline/`과 `app/api/cases/`는 이 헬퍼를 통해서만 사용자를 식별한다. 모든 사건(case) 레코드는 `lib/db/schema.ts`의 `owner_user_id` 컬럼으로 생성 사용자에게 귀속되고, 조회/수정 쿼리는 항상 이 컬럼으로 필터링해 다른 테스터의 데이터에 접근할 수 없도록 한다.

### `lib/validation/` — PII 입력 차단 (핵심 설계 결정)
`product.md` 원칙 3(개인정보·민감정보 저장 최소화)을 코드 수준에서 강제하는 지점이다. `lib/validation/case-input.ts`가 사건 입력 폼/`app/api/cases/` route handler 공용 Zod 스키마를 정의하며, 주민등록번호·전화번호·상세주소·의료기록 원본에 해당하는 필드 형식(정규식/포맷 검사)을 구조적으로 거부한다. 이 스키마를 통과하지 못한 입력은 DB나 LLM 파이프라인에 도달하지 않는다.

### `components/ui/`
shadcn/ui로 생성한 기본 UI 컴포넌트를 둔다. 디자인 시스템을 별도로 구축하지 않고 shadcn/ui의 기본값을 최대한 활용해 초기 개발 속도를 우선한다.

### `lib/ai/` — AI Provider Abstraction (핵심 설계 결정)
애플리케이션 로직이 Gemini API에 직접 종속되지 않도록, `lib/ai/provider.ts`에 공통 인터페이스(예: `generate()` 등 파이프라인이 실제로 필요로 하는 최소 메서드)를 정의하고, `lib/ai/providers/gemini.ts`가 이 인터페이스를 구현한다. 파이프라인 단계(`Researcher`, `Skeptic`, `Verifier` 등)는 인터페이스에만 의존하므로, 향후 다른 LLM으로 교체하거나 provider를 추가하더라도 파이프라인 코드를 수정할 필요가 없다. 현재 MVP는 vector DB/embedding 기반 검색을 도입하지 않으므로(`tech.md` 참고), 인터페이스에는 `embed()` 등 미사용 메서드를 포함하지 않는다.

### `lib/db/` + `db/`
데이터베이스 접근은 항상 Drizzle ORM을 통해서만 이루어진다. `lib/db/client.ts`가 Turso/libSQL 클라이언트를 초기화하고, `lib/db/schema.ts`가 스키마를 정의한다. 애플리케이션 코드는 Drizzle ORM API만 사용하고 libSQL 고유 문법에 직접 의존하지 않도록 하여, 향후 PostgreSQL로 이전할 때 스키마 정의와 쿼리 코드를 최대한 재사용할 수 있게 한다. `db/migrations/`는 Drizzle Kit이 생성하는 마이그레이션 파일을, `db/seed/`는 end-to-end 파이프라인 검증에 사용할 소규모 seed evidence 데이터를 보관한다.

### `scripts/` + `e2e/` — 런타임 활성화 계층 (SPEC-RUNTIME-001)
`scripts/`는 Next.js 서버 프로세스 바깥에서 독립적으로 실행되는 CLI 진입점을 모은다. `cli-bootstrap.ts`가 모든 CLI 스크립트의 공통 부트스트랩으로, `@next/env`를 사용해 `.env.local`을 직접 로드한다(셸 `export` 불필요). `db-migrate.ts`/`db-seed.ts`는 재실행 안전하게 설계되어 여러 번 실행해도 부작용이 없고, `provision-tester.ts`는 Better Auth의 공식 `signUpEmail()` API를 호출해 초대 전용 테스터 계정을 생성한다. `run-e2e.ts`는 `pnpm test:e2e`의 실제 진입점으로, 실행 시점에 빈 포트를 동적으로 탐색(`findFreePort()`)해 다른 프로세스와의 포트 충돌을 피하고, 로컬 파일 DB를 매 실행마다 초기화한 뒤 마이그레이션·시드·테스터 A/B 프로비저닝을 자동 수행한다. `e2e/`는 `run-e2e.ts`가 구동하는 Playwright 시나리오(`*.spec.ts`)와 공용 헬퍼(`helpers.ts`)를 담는다. `.moai/docs/runtime-runbook.md`가 이 계층 전체의 운영자용 절차 문서다.

### `lib/pipeline/`
핵심 사용자 흐름(사건 입력 → CaseNormalizer → QueryPlanner → Evidence Retriever → Researcher → Skeptic → Verifier → Research Report)을 구성하는 각 단계를 독립된 모듈로 분리한다. 각 단계는 명확한 입출력 타입을 가지며, 서로 직접 결합하지 않고 파이프라인 오케스트레이터(추후 `lib/pipeline/index.ts` 등에서 조립 예정)를 통해 순차 실행된다. 이렇게 분리하면 특정 단계만 교체하거나 테스트하기 쉽다.

### `public/`
정적 자산(이미지, 아이콘 등)을 둔다.

### 최상위 설정 파일
- `drizzle.config.ts` — Drizzle Kit이 마이그레이션을 생성할 때 사용하는 설정(스키마 경로, DB 접속 정보).
- `next.config.ts` — Next.js 설정.
- `tailwind.config.ts` — Tailwind CSS 설정.
- `tsconfig.json` — TypeScript strict 모드를 활성화한다.
- `package.json` — 의존성 및 스크립트(`dev`, `build`, `test` 등) 정의.
- `.env.local` — Turso 접속 정보, Gemini API 키, 인증 provider 시크릿(예: `AUTH_SECRET`) 등을 보관하며 절대 커밋하지 않는다.

## 설계 메모

- **AI provider abstraction은 필수 경계다.** `lib/ai/provider.ts`의 인터페이스를 벗어나 파이프라인 코드가 `@google/generative-ai` 등 Gemini 전용 SDK를 직접 import하는 것을 금지한다. Gemini 관련 코드는 `lib/ai/providers/gemini.ts` 안에만 존재해야 한다.
- **DB 이식성도 동일한 원칙을 따른다.** 파이프라인·API route 코드는 Drizzle ORM의 쿼리 빌더만 사용하고, `lib/db/client.ts` 바깥에서 libSQL 클라이언트를 직접 다루지 않는다. 이렇게 하면 향후 PostgreSQL 드라이버로 `lib/db/client.ts`만 교체해도 나머지 코드는 변경이 최소화된다.
- **overengineering 방지.** microservice 분리, Kubernetes, 별도 vector DB 도입 없이 단일 Next.js 애플리케이션 안에서 모든 것을 처리한다.
- **접근 제어는 `proxy.ts` + `lib/auth/`로 일원화한다.** 개별 route handler가 각자 로그인 여부를 확인하지 않고, `proxy.ts`가 보호 대상 경로(`cases/*`, `api/cases/*`)를 일괄 가드한다. 데이터 조회/수정 쿼리는 항상 `owner_user_id`로 필터링해, 인증 우회 없이도 사용자 간 데이터가 섞이지 않도록 한다.
- **PII 검증은 파이프라인 진입 이전 단계에서 종료한다.** `lib/validation/case-input.ts`의 Zod 스키마 검증은 `CaseNormalizer` 호출보다 먼저 실행되어, 민감정보 형식의 입력이 파이프라인이나 DB에 도달하지 않도록 한다.
