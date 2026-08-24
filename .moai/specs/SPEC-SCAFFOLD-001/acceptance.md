# Acceptance Criteria — SPEC-SCAFFOLD-001

모든 AC는 Given-When-Then 형식으로 이진(binary) 검증 가능하게 작성한다. 각 AC는 검증 대상 요구사항(REQ-SCAFFOLD-XXX)을 **Traces** 라인으로 명시적으로 추적한다. AC 개수: 17개 (Tier L 상한 25개 이내).

## §A. AC 매트릭스

### AC-SCAFFOLD-001 — 프로젝트 초기화 + strict 빌드
**Traces**: REQ-SCAFFOLD-001, REQ-SCAFFOLD-002
- **Given** `bosang-radar` 저장소가 Next.js 16.3.2+ App Router + TypeScript strict + Tailwind CSS + shadcn/ui로 초기화되어 있을 때
- **When** `pnpm build`를 실행하면
- **Then** TypeScript strict 모드 컴파일 오류 없이 빌드가 성공(exit 0)한다.

### AC-SCAFFOLD-002 — Drizzle 스키마 5개 테이블
**Traces**: REQ-SCAFFOLD-003
- **Given** `lib/db/schema.ts` 파일이 존재할 때
- **When** 스키마 정의를 검사하면
- **Then** `cases`(owner_user_id 컬럼 포함), `evidence`, `reports`, `feedback`, `allowed_testers` 5개 테이블이 모두 정의되어 있다.

### AC-SCAFFOLD-003 — Drizzle/libSQL 버전 고정
**Traces**: REQ-SCAFFOLD-004
- **Given** `package.json`의 의존성 목록이 있을 때
- **When** `drizzle-orm` 및 `@libsql/client` 버전을 확인하면
- **Then** `drizzle-orm`은 `0.45.x` stable 계열(`@rc` 프리릴리스가 아님)이고, `@libsql/client`는 stable 버전으로 고정되어 있다.

### AC-SCAFFOLD-004 — Turso/libSQL 실제 연결 동작 검증 (신설 — D2)
**Traces**: REQ-SCAFFOLD-004
- **Given** `TURSO_DATABASE_URL`과 `TURSO_AUTH_TOKEN` 환경변수가 유효한 값으로 설정되어 있을 때
- **When** `lib/db/client.ts`의 DB 클라이언트 초기화 함수를 호출하면
- **Then** `@libsql/client`의 `createClient()`가 해당 환경변수 값(`url`/`authToken`)으로 정확히 호출되고, 그 결과로 반환된 libSQL 커넥션 위에 Drizzle ORM 클라이언트가 정상적으로 구성된다. 검증은 단위 테스트에서 `createClient`를 모킹(mock)하여 호출 인자를 assert하는 방식으로 수행하며(예: Vitest `vi.mock('@libsql/client')` + `expect(createClient).toHaveBeenCalledWith({ url: ..., authToken: ... })`), 이는 AC-SCAFFOLD-003(패키지 버전 고정 확인)과는 독립적으로 실제 연결 배선(capability-gate 분기)을 검증한다.

### AC-SCAFFOLD-005 — 마이그레이션 생성
**Traces**: REQ-SCAFFOLD-005
- **Given** `drizzle.config.ts`가 `dialect: 'turso'`로 설정되어 있을 때
- **When** `drizzle-kit generate`를 실행하면
- **Then** `db/migrations/`에 SQL 마이그레이션 파일이 생성된다.

### AC-SCAFFOLD-006 — AI provider 인터페이스 + Gemini adapter
**Traces**: REQ-SCAFFOLD-006, REQ-SCAFFOLD-007
- **Given** `lib/ai/provider.ts`가 `LLMProvider` 인터페이스를 정의하고 있을 때
- **When** `lib/ai/providers/gemini.ts`를 검사하면
- **Then** Gemini adapter가 `LLMProvider` 인터페이스를 구현(implements)하고 있으며, `@google/genai` 패키지를 `<3.0.0`으로 고정 사용한다.

### AC-SCAFFOLD-007 — Gemini rate-limit 처리 (edge case)
**Traces**: REQ-SCAFFOLD-008
- **Given** Gemini API 호출이 429(rate limit) 응답을 반환하는 상황일 때
- **When** Gemini adapter가 해당 응답을 수신하면
- **Then** 지수 백오프 재시도를 수행하고, 재시도가 모두 소진되면 파이프라인 실행 결과를 실패로 표시한다(예외를 삼키지 않는다).

### AC-SCAFFOLD-008 — Better Auth allowlist 미등록 이메일 로그인 거부 (edge case)
**Traces**: REQ-SCAFFOLD-009
- **Given** `allowed_testers` 테이블에 등록되지 않은 이메일 주소를 사용하는 사용자가 있을 때
- **When** 해당 사용자가 로그인을 시도하면
- **Then** 로그인이 거부되고 세션이 생성되지 않는다.

### AC-SCAFFOLD-009 — proxy.ts 보호 경로 리다이렉트
**Traces**: REQ-SCAFFOLD-010
- **Given** 비로그인 상태의 요청이 있을 때
- **When** `cases/*` 또는 `api/cases/*` 경로에 접근하면
- **Then** `proxy.ts`가 해당 요청을 `/login`으로 리다이렉트한다.

### AC-SCAFFOLD-010 — owner_user_id 데이터 격리
**Traces**: REQ-SCAFFOLD-011
- **Given** 사용자 A가 소유한 사건(case) 레코드와, 사용자 B가 로그인한 세션이 있을 때
- **When** 사용자 B가 사용자 A의 사건 상세(`cases/[caseId]`)에 접근을 시도하면
- **Then** `owner_user_id` 필터링에 의해 해당 데이터에 접근할 수 없다(404 또는 접근 거부).

### AC-SCAFFOLD-011 — PII 형식 입력 거부 (핵심 edge case, 필수 시나리오)
**Traces**: REQ-SCAFFOLD-012
- **Given** 사건 입력 폼/API 요청에 주민등록번호 형식(예: `901231-1234567`) 또는 전화번호 형식(예: `010-1234-5678`) 값이 포함되어 있을 때
- **When** `lib/validation/case-input.ts`의 Zod 스키마가 해당 요청을 검증하면
- **Then** 검증이 실패하고, 요청은 `CaseNormalizer` 호출 이전 단계에서 거부되며, DB나 Gemini API에 도달하지 않는다.

### AC-SCAFFOLD-012 — 파이프라인 6단계 타입 계약 (재작성 — D6)
**Traces**: REQ-SCAFFOLD-013
- **Given** `lib/pipeline/`의 6개 모듈(case-normalizer, query-planner, evidence-retriever, researcher, skeptic, verifier)이 있을 때
- **When** 각 모듈을 개별적으로 import하여 단위 테스트를 실행하고, 정적 검사로 `lib/pipeline/*.ts` 파일(`index.ts` 제외) 내부의 import 문을 grep하면
- **Then** (1) 각 모듈은 독립적으로 호출 가능한 타입 입출력 계약(TypeScript interface/type)을 가지며, (2) `index.ts`를 제외한 어떤 `lib/pipeline/*.ts` 파일도 다른 형제 단계 모듈 파일(예: `researcher.ts`가 `skeptic.ts`를)을 직접 상대 경로로 import하지 않는다(0 matches) — 오직 `lib/pipeline/index.ts` 오케스트레이터만 각 단계 모듈을 import한다.

### AC-SCAFFOLD-013 — E2E 파이프라인 mock 실행 (필수 시나리오)
**Traces**: REQ-SCAFFOLD-014
- **Given** 목업/trivial 단계 구현체로 구성된 파이프라인 오케스트레이터와 `db/seed/`의 seed evidence 데이터가 있을 때
- **When** 유효한(PII 없는) 사건 입력으로 파이프라인을 실행하면
- **Then** CaseNormalizer → QueryPlanner → Evidence Retriever → Researcher → Skeptic → Verifier 6단계가 순차 실행되고, seed evidence와 연결된 Research Report 객체가 생성된다.

### AC-SCAFFOLD-014 — seed evidence 데이터셋 존재 (재작성 — D6)
**Traces**: REQ-SCAFFOLD-015
- **Given** `db/seed/` 디렉터리가 있을 때
- **When** 시드 데이터를 검사하면
- **Then** 최소 3건 이상의 evidence 레코드가 존재하며, 그 레코드들은 최소 2개 이상의 서로 다른 담보(coverage) 카테고리(예: 상해후유장해, 질병후유장해)에 걸쳐 있어, end-to-end 파이프라인 테스트(AC-SCAFFOLD-013)를 통과시키기에 충분하다.

### AC-SCAFFOLD-015 — 최소 UI 라우트 동작
**Traces**: REQ-SCAFFOLD-016
- **Given** 로그인된 테스터 세션이 있을 때
- **When** `/cases/new`에서 사건을 입력하고 제출한 뒤 `/cases/[caseId]`로 이동하면
- **Then** 입력 폼과 리포트 뷰가 렌더링되며, 생성된 사건의 리서치 리포트를 조회할 수 있다.

### AC-SCAFFOLD-016 — Gemini SDK import 경계 (unwanted 검증)
**Traces**: REQ-SCAFFOLD-018
- **Given** `lib/pipeline/` 디렉터리의 소스 파일이 있을 때
- **When** `@google/genai` import 문을 grep 검색하면
- **Then** `lib/ai/providers/gemini.ts` 외부에서 해당 import가 발견되지 않는다(0 matches).

### AC-SCAFFOLD-017 — 품질 게이트 (Quality Gate)
**Traces**: REQ-SCAFFOLD-002, REQ-SCAFFOLD-017
- **Given** 전체 scaffold 구현이 완료된 상태일 때
- **When** `pnpm test`, `pnpm lint`, `pnpm build`(TypeScript strict)를 실행하면
- **Then** Vitest 테스트 스위트가 통과(exit 0)하고, ESLint 9 flat config 검사가 clean(오류 0건)하며, TypeScript strict 컴파일이 오류 없이 완료된다.

## §B. 정의된 완료 기준 (Definition of Done)

- [ ] AC-SCAFFOLD-001 ~ 017 전체 PASS
- [ ] `pnpm build`, `pnpm lint`, `pnpm test` 모두 exit 0
- [ ] TypeScript strict 모드 컴파일 오류 0건
- [ ] `grep -rn "@google/genai" lib/pipeline/` 결과가 0건 (Gemini SDK 경계 준수)
- [ ] spec.md §4 Out of Scope 항목이 구현 범위에 포함되지 않았음을 확인
- [ ] `.env.local`이 `.gitignore`에 포함되어 커밋되지 않음을 확인

## §C. 검증되지 않는 항목 (참고)

- 실제 Gemini 무료 tier rate-limit 수치는 구현 시점에 `aistudio.google.com/rate-limit`에서 재확인 필요(research.md §3) — 이 SPEC의 AC는 429 응답 "처리 로직"만 검증하며, 실제 한도 수치는 검증 대상이 아니다.
- shadcn/ui의 Next.js 16.3.x 공식 지원 여부는 미검증 상태로 남으며, AC-SCAFFOLD-001의 빌드 성공 여부로 간접 확인한다.
- AC-SCAFFOLD-004의 Turso 실연결 검증은 모킹된 `createClient` 호출 인자 assert 방식이 기본이며, 실제 Turso 무료 tier 인스턴스에 대한 통합 테스트는 CI 환경의 시크릿 가용성에 따라 선택적으로 추가한다(구현 시점 판단).
