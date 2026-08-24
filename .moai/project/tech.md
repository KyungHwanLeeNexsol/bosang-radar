# 기술 스택

> 최종 수정: 2026-08-24 (D1/D2 후속 개정 — Auth.js/Zod 스택 및 rate-limit 대응 추가)

## 개요

보상레이더는 "무료 tier 우선, 불필요한 overengineering 금지"라는 원칙 아래, 검증된 최신 웹 개발 스택을 채택한다. 목표는 microservice나 별도 인프라 없이, 단일 Next.js 애플리케이션으로 현직 실무자 10명이 실사용 가능한 MVP를 완성하는 것이다.

## 기술 선택과 근거

### Next.js (최신 안정 버전) + App Router
- 프런트엔드와 백엔드(API route handler)를 하나의 코드베이스로 통합해, MVP 단계에서 별도 백엔드 서버를 운영할 필요가 없다.
- Vercel과의 통합이 매끄러워 무료 tier 배포를 그대로 활용할 수 있다.
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
- **무료 tier 한도(rate limit/quota) 대응**: Gemini 무료 tier는 분당/일별 요청 한도가 존재한다. 사건 하나당 Researcher/Skeptic/Verifier 등 여러 단계가 순차적으로 LLM을 호출하므로, `lib/ai/providers/gemini.ts`에서 429(rate limit) 응답 시 지수 백오프 재시도를 적용하고, 한도 초과가 반복되면 파이프라인을 실패로 표시해 사용자에게 재시도를 안내한다(큐잉/전역 동시성 제한은 실사용 중 필요성이 확인되면 추후 검토).

### Better Auth — 초대 전용 접근 제어
- 비공개 파일럿(테스터 10명 내외) 규모에 맞춰, Vercel + Turso 무료 tier 조합에서 무리 없이 동작하는 세션 기반 인증 라이브러리로 **Better Auth**를 채택한다.
- 원래는 Auth.js(NextAuth) v5를 검토했으나, plan-phase 조사(`research.md` §4) 결과 Auth.js v5가 여전히 npm `beta` 태그로만 배포 중이고 2025년 9월부터 Better Auth 팀이 유지보수를 인수해 Auth.js는 보안 패치만 하는 유지보수 전용 모드로 전환된 사실을 확인했다. 신규 프로젝트가 유지보수 전용 라이브러리를 채택할 이유가 없으므로, 실제로 개발이 이어지고 있는 Better Auth로 결정을 바꿨다.
- Credentials(이메일+비밀번호) 또는 매직 링크 provider + 운영자가 미리 등록한 테스터 이메일 allowlist(Drizzle 스키마의 `allowed_testers` 테이블 등)를 조합해, 셀프 가입 없이 지정된 테스터만 로그인할 수 있도록 한다. Better Auth는 Drizzle ORM 어댑터를 공식 지원해 별도 스키마 브리지 없이 기존 DB 계층과 통합된다.
- 별도 SaaS형 인증 서비스(Auth0, Clerk 등)를 도입하지 않는 이유: 테스터 규모가 10명 내외로 작고, "무료 tier 우선, 불필요한 overengineering 금지" 원칙(`product.md` 원칙 8, 본 문서 개요 참고)에 더 부합하기 때문이다.
- 세션 정보는 `lib/auth/session.ts`를 통해서만 조회하며, `app/api/cases/` 및 `lib/pipeline/`은 이 세션의 사용자 ID로 사건 데이터를 스코프한다.

### Zod — 입력 검증 (PII 차단 강제)
- 사건 입력 폼/API의 입력 검증 스키마 라이브러리로 Zod를 채택한다. TypeScript strict 모드와 타입 추론이 자연스럽게 통합되고, 별도 런타임 의존성 없이 스키마 기반 검증을 표현할 수 있다.
- `lib/validation/case-input.ts`에 정의된 스키마가 주민등록번호·전화번호·상세주소·의료기록 원본에 해당하는 필드 형식(정규식/포맷 검사)을 구조적으로 거부하며, 이 검증을 통과하지 못한 요청은 `CaseNormalizer` 이전 단계에서 차단되어 DB나 Gemini API에 도달하지 않는다.

### Vercel (무료 tier 배포)
- Next.js와 가장 매끄럽게 통합되는 배포 플랫폼이며, 무료 tier로 MVP 단계의 트래픽을 충분히 감당할 수 있다.
- 별도 CI/CD 파이프라인 구축 없이 Git 연동만으로 배포 자동화가 가능하다.

## 개발 환경 요구사항

- **Node.js**: 20.x LTS 이상(현재 활성 LTS 기준 최소 버전). 프로젝트 생성 시 `package.json`의 `engines.node`에 `>=20.x`로 명시한다.
- **패키지 매니저**: pnpm. 빠른 설치 속도와 디스크 효율성을 위해 채택하며, 프로젝트 전체에서 npm/yarn 대신 pnpm 명령어로 통일한다.

## 테스트 도구

- **Vitest** — 단위/통합 테스트 프레임워크. `pnpm test` 명령으로 실행한다.
- 리서치 파이프라인의 각 단계(CaseNormalizer, QueryPlanner 등)는 독립적으로 테스트 가능하도록 설계하며, seed evidence 데이터를 활용한 end-to-end 파이프라인 테스트도 Vitest로 작성한다.

## 린트 / 포맷터

- **ESLint** — `eslint-config-next` 기반 설정으로 Next.js/React 관례 및 잠재적 버그 패턴을 검사한다.
- **Prettier** — 코드 포맷 통일. TypeScript strict 모드와 함께 사용해, 스타일 논쟁 없이 일관된 코드베이스를 유지한다(TRUST 5 "Unified" 원칙).
- `pnpm lint` / `pnpm format` 스크립트로 실행하며, 커밋 전 로컬 훅(선택)으로 연결할 수 있다.

## 비용 태도 — "무료 tier 우선"

- Vercel(호스팅), Turso(DB), 그 외 가능한 모든 인프라 구성 요소는 무료 tier를 우선적으로 검토하고 채택한다.
- 유료 tier로의 전환은 실사용 테스트(실무자 10명) 과정에서 무료 tier 한도가 실제로 문제가 될 때에만 검토한다.
- microservice, Kubernetes, 별도 vector DB처럼 운영 비용과 복잡도를 늘리는 인프라는 이번 MVP 단계에서 의도적으로 배제한다.
