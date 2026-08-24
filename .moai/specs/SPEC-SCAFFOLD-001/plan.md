# Plan — SPEC-SCAFFOLD-001

## §A. Context

- **프로젝트 상태**: 그린필드(greenfield). `bosang-radar` 저장소에 코드가 아직 존재하지 않는다. 이번 SPEC이 최초 코드 커밋이다.
- **작업 위치**: `C:/Users/Nexsol/Documents/bosang-radar` (main checkout, 브랜치 정보 없음 — 최초 커밋).
- **SPEC 아티팩트**: `.moai/specs/SPEC-SCAFFOLD-001/{spec,plan,acceptance,design,research,progress}.md`.
- **Tier**: L (5개 아티팩트) — 최초 프로젝트라 아키텍처 결정 폭이 넓고(DB/AI/Auth 경계 확정), 향후 모든 SPEC의 기반이 되므로 L로 분류.
- **선행 자료**: `research.md`에 2026년 8월 시점 스택 현황 조사 완료(Next.js 16.3.2, drizzle-orm stable 0.45.x, `@google/genai`, Better Auth 결정 근거). `tech.md`는 이 조사를 반영해 이미 개정됨(Better Auth 채택, `proxy.ts` 명명 등).

## §B. 순서 안내 (결정 가역성 기준 정렬)

아래 §C 마일스톤은 **검토 우선순위**(decision-reversibility) 기준으로 정렬한다 — 변경 가능성이 높은 결정(데이터 모델, 새 타입 인터페이스, 사용자 흐름)을 먼저 제시하고, 기계적/반복 작업(프로젝트 초기화 툴링)을 마지막에 배치한다. 이는 **문서상 검토 순서**이며, **실제 구현 실행 순서와는 다르다** — 물리적으로는 M6(Next.js 프로젝트 초기화)이 코드가 존재하기 위한 선행 조건이므로 가장 먼저 실행되어야 한다. manager-develop은 M6을 먼저 실행한 뒤 M1→M5 순서로 진행하되, 이 plan.md의 마일스톤 검토 순서(M1이 가장 변경 가능성 높은 결정)는 그대로 유지한다.

## §C. 마일스톤 (검토 우선순위 순, 실행 시 M6 선행)

### M1 — 핵심 데이터 모델 + AI Provider 추상화 (Priority: High, 결정 가역성: 높음)
- `lib/db/schema.ts`: Drizzle ORM 스키마 정의 — `cases`(owner_user_id 포함), `evidence`, `reports`, `feedback`, `allowed_testers` 5개 테이블.
- `lib/db/client.ts`: Turso/libSQL 클라이언트 초기화 (stable `drizzle-orm` 0.45.x + `@libsql/client`, `TURSO_SYNC_URL` 미설정 — research.md §2 서버리스 주의사항 준수).
- `lib/ai/provider.ts`: `LLMProvider` 공통 인터페이스 정의 (파이프라인이 실제로 필요로 하는 최소 메서드만 — `embed()` 등 미사용 메서드 배제).
- `lib/ai/providers/gemini.ts`: `@google/genai` (`<3.0.0` 고정) 기반 Gemini adapter, 429 지수 백오프 재시도 포함.
- `drizzle.config.ts`: `dialect: 'turso'` 설정.
- 이 마일스톤이 가장 먼저인 이유: 스키마 shape와 AI provider 인터페이스 shape는 이후 모든 파이프라인/UI 코드가 의존하는 계약이며, 변경 시 파급 범위가 가장 크다.

### M2 — 인증/접근 제어 설계 (Priority: High, 결정 가역성: 높음)
- `lib/auth/config.ts`: Better Auth 설정 + `allowed_testers` 테이블 대조 allowlist 검증 (셀프 가입 차단).
- `lib/auth/session.ts`: 현재 로그인 사용자 조회 헬퍼.
- `app/api/auth/[...all]/route.ts`: Better Auth 라우트 핸들러.
- `app/login/`: 초대받은 테스터 로그인 화면.
- `proxy.ts`: `cases/*`, `api/cases/*` 보호 대상 경로 가드 (Next.js 16 — `middleware.ts`가 아닌 `proxy.ts`, edge 런타임 미지원, nodejs 런타임에서만 동작 — research.md §1).
- 인증 흐름/allowlist 메커니즘은 사용자 흐름에 직접 영향을 미치는 결정이므로 M1 다음으로 우선.

### M3 — PII 입력 차단 검증 스키마 (Priority: High, 결정 가역성: 중간)
- `lib/validation/case-input.ts`: 사건 입력 Zod 스키마 — 주민등록번호/전화번호/상세주소/의료기록 원본 형식 패턴을 구조적으로 거부.
- `CaseNormalizer` 호출 이전, `app/api/cases/` route handler 진입점에서 검증 실행.
- 보안/개인정보 원칙(product.md 핵심 원칙 3)을 코드로 강제하는 지점이므로 별도 마일스톤으로 분리.

### M4 — 파이프라인 스텁 + 오케스트레이터 + seed 데이터 (Priority: Medium, 결정 가역성: 중간)
- `lib/pipeline/{case-normalizer,query-planner,evidence-retriever,researcher,skeptic,verifier}.ts`: 각 단계의 타입 입출력 계약(interface/type) + trivial/mock 구현체.
- `lib/pipeline/index.ts`: 6단계를 순차 실행하는 오케스트레이터.
- `db/seed/`: 소규모 seed evidence 데이터셋(JSON 또는 시드 스크립트).
- 이 마일스톤은 각 단계의 타입 계약이 향후 실제 LLM 로직으로 교체될 확장 지점이므로 M1-M3보다는 변경 가능성이 낮지만, 여전히 아키텍처 결정에 해당.

### M5 — 최소 UI 라우트 (Priority: Medium, 결정 가역성: 낮음 — 이후 폴리시 예정)
- `app/cases/new/`: 사건 입력 폼(bare UI, `lib/validation/case-input.ts` 스키마 사용).
- `app/cases/[caseId]/`: 사건 상세 + 리서치 리포트 뷰 (owner_user_id 스코핑 적용).
- `app/page.tsx`, `app/layout.tsx`: 랜딩/진입점.
- shadcn/ui 기본 컴포넌트(Button, Card, Form, Input) 사용.
- 이번 SPEC에서는 시연 목적의 bare UI이며, 폴리시된 UI/UX는 후속 SPEC(product.md §Roadmap)으로 이연되므로 결정 가역성이 낮다(변경돼도 파급 범위가 작음).

### M6 — 프로젝트 초기화 및 툴링 (Priority: High for execution order, 기계적 작업 — 실제로는 최우선 실행)
- `pnpm create next-app` 또는 동등한 방식으로 Next.js 16.3.2+ App Router + TypeScript strict 초기화.
- Tailwind CSS + shadcn/ui 기본 설정(`components.json`, `components/ui/`).
- ESLint 9 flat config(`eslint.config.mjs`, `eslint-config-next` 기반) + Prettier(`.prettierrc`).
- Vitest 설정(`vitest.config.ts`) + `package.json` scripts(`dev`, `build`, `lint`, `format`, `test`).
- `tsconfig.json` strict 모드, `.env.local`(커밋 금지) 템플릿(`.env.local.example`).
- **실행 순서 참고**: 이 마일스톤은 문서상 마지막에 배치했으나(기계적 작업이므로), 실제로는 M1의 코드를 작성하려면 프로젝트가 먼저 존재해야 하므로 manager-develop은 M6을 첫 실행 단계로 삼는다.

## §D. 기술적 접근 (Technical Approach)

- **아키텍처 경계 우선**: DB(Drizzle 뒤), AI(provider 인터페이스 뒤), 인증(session 헬퍼 뒤)의 3개 경계를 코드 구조로 강제한다(structure.md §설계 메모).
- **목업 우선 파이프라인**: 6단계는 실제 LLM 호출 없이 trivial한 pass-through 또는 seed 데이터 기반 목업으로 구현하여, end-to-end 배선을 먼저 검증한다(product.md §핵심 원칙 5).
- **버전 고정 전략**: `drizzle-orm` stable 0.45.x, `@google/genai` `<3.0.0` — 공식 퀵스타트가 안내하는 프리릴리스(`@rc`)를 의도적으로 회피(research.md §6).
- **Route handler 계층**: `app/api/cases/`가 파이프라인 오케스트레이터를 트리거하며, `lib/validation/`을 항상 첫 단계로 통과시킨다.

## §E. 위험 (Risks)

| 위험 | 영향 | 완화 |
|------|------|------|
| shadcn/ui의 Next.js 16.3.x 공식 미검증 | 컴포넌트 설치/렌더링 오류 가능 | 구현 시 `shadcn init` 실행 결과를 직접 확인, 문제 발생 시 수동 컴포넌트 이식 |
| Gemini 무료 tier 한도 불명확 | 파이프라인 통합 테스트 중 rate-limit 조우 가능 | 429 백오프 로직(M1)을 먼저 구현하고, 통합 테스트는 최소 호출 횟수로 설계 |
| `proxy.ts` nodejs 런타임 제약 | Edge 배포 환경에서 예상치 못한 동작 가능 | Vercel 기본 nodejs 런타임 사용, edge 런타임 강제 설정 회피 |
| Better Auth Drizzle 어댑터 스키마 요구사항 | Better Auth가 요구하는 자체 테이블(session, account 등)과 `schema.ts`의 충돌 가능 | M1에서 Drizzle 스키마 작성 시 Better Auth 공식 어댑터 요구 스키마를 함께 반영 |

## §F. MX 태그 계획 (Phase 14)

### @MX:ANCHOR 후보 (높은 fan-in 예상)
- `lib/ai/provider.ts` — `LLMProvider` 인터페이스: Researcher/Skeptic/Verifier 등 모든 LLM 호출 지점이 의존.
- `lib/db/client.ts` — DB 클라이언트 싱글턴: 모든 DB 접근 지점이 의존.
- `lib/auth/session.ts` — 세션 조회 헬퍼: `app/api/cases/`, `lib/pipeline/`, `proxy.ts` 등 다수 지점이 의존.

### @MX:WARN 후보 (비동기/동시성 코드)
- `lib/pipeline/evidence-retriever.ts` — 근거자료 후보 수집 시 비동기 I/O(추후 외부 소스 확장 시 동시 요청 가능).
- `lib/ai/providers/gemini.ts` — 429 재시도 백오프 로직(비동기 재시도 루프).
- `lib/pipeline/index.ts` — 파이프라인 오케스트레이터의 순차 async 실행 체인.

### @MX:TODO 후보 (미완성/스텁 표시)
- `lib/pipeline/{researcher,skeptic,verifier}.ts` — 목업 구현이며 실제 LLM 로직은 후속 SPEC에서 대체 예정임을 명시.

## §G. Out of Scope 재확인

spec.md §4에 정의된 6개 제외 범위(파이프라인 로직 고도화, UI/UX 고도화, 대규모 데이터 수집, PostgreSQL 마이그레이션 실행, 담보 영역 확장, 인증 하드닝)를 이 plan.md의 모든 마일스톤 범위 밖으로 유지한다.
