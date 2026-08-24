---
id: SPEC-SCAFFOLD-001
title: "보상레이더 MVP 최초 프로젝트 scaffold 및 핵심 아키텍처 구축"
version: "0.1.0"
status: completed
created: 2026-08-24
updated: 2026-08-24
author: Nexsol
priority: P1
phase: "v0.1.0 target"
module: "app/, lib/, db/"
lifecycle: spec-anchored
tags: "scaffold, nextjs, drizzle, turso, gemini, better-auth, mvp, pipeline"
tier: L
---

## HISTORY

- 2026-08-24: 최초 작성 (Nexsol) — 보상레이더(bosang-radar) MVP 최초 scaffold SPEC. `.moai/project/{product,structure,tech}.md` + `research.md`(2026년 스택 현황 조사) 기반.
- 2026-08-24: plan-auditor review-1 피드백 반영 (Nexsol) — acceptance.md 기존 16개 AC 전체에 `REQ-SCAFFOLD-XXX` 추적 라인 추가(D1), REQ-SCAFFOLD-004 Turso/libSQL 실제 연결 동작을 독립 검증하는 AC-SCAFFOLD-004 신설로 17개 AC 확정(D2), §1 개요를 WHY/WHAT 하위 섹션으로 분리(D5), AC-SCAFFOLD-011/013(신규 번호 기준 AC-SCAFFOLD-012/014) 판단형 문구를 기계적 검증 가능 문구로 재작성(D6). D3(버전 고정 REQ 텍스트 이동)·D4(복합 REQ 분리)는 auditor가 "orchestrator discretion"으로 명시한 optional 항목이며, 재넘버링에 따른 파급 범위 대비 이득이 낮다고 판단하여 이번 개정에서는 보류. 참고: `.moai/reports/plan-audit/SPEC-SCAFFOLD-001-review-1.md`.

## §1. 개요 (Overview)

### WHY — 배경 및 동기

보상레이더는 보험설계사·손해사정사가 비식별 보험 사건 정보를 입력하면 상해후유장해·질병후유장해 관점에서 추가 검토할 담보·근거자료·반대 논리·추가 필요자료를 조사하는 B2B AI Research Assistant다(`product.md` 참고). 그러나 아직 실행 가능한 코드베이스가 존재하지 않아, 서비스의 핵심 가치인 6단계 리서치 파이프라인을 end-to-end로 검증할 수 있는 최소한의 아키텍처 기반이 선행되어야 한다.

### WHAT — 이번 SPEC 범위

이번 SPEC은 **전체 서비스 완성이 아니라, 최초 실행 가능한 프로젝트 scaffold와 MVP 핵심 아키텍처 구축**에만 집중한다. 구체적으로:

- Next.js App Router 프로젝트 초기화(TypeScript strict, Tailwind CSS, shadcn/ui 기본 설정)
- Drizzle ORM 스키마(cases, evidence, reports, feedback, allowed_testers) + Turso/libSQL 클라이언트 배선
- AI provider abstraction 인터페이스 + Gemini adapter 구현
- Better Auth 초대 전용(allowlist) 인증 + `proxy.ts` 라우트 가드
- 사건 입력 PII 차단 Zod 검증 스키마
- 6단계 리서치 파이프라인(CaseNormalizer → QueryPlanner → Evidence Retriever → Researcher → Skeptic → Verifier)의 **타입 계약 스텁** — 목업 구현으로 end-to-end 배선 검증
- 파이프라인을 수동 시연할 수 있는 최소 UI(사건 입력 + 리포트 뷰)
- ESLint 9 flat config + Prettier + Vitest 테스트 하네스

파이프라인 각 단계의 실제 LLM 기반 소견 생성 로직, 폴리시된 UI, 대규모 근거자료 수집은 이번 SPEC의 범위가 아니다(§4 참고).

## §2. 요구사항 (Requirements — GEARS 표기법)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-SCAFFOLD-001 | Ubiquitous | 프로젝트 scaffold는 Next.js 16.3.2 이상(최신 안정 버전) + App Router + TypeScript strict + Tailwind CSS + shadcn/ui 기본 설정으로 초기화되어야 한다. | [REF: research.md §1] |
| REQ-SCAFFOLD-002 | Event-driven | 개발자가 `pnpm build`를 실행하면, scaffold는 TypeScript strict 모드 하에서 컴파일 오류 없이 빌드되어야 한다. | tech.md §TypeScript strict |
| REQ-SCAFFOLD-003 | Ubiquitous | 애플리케이션 코드의 모든 DB 접근은 Drizzle ORM(`lib/db/client.ts` + `lib/db/schema.ts`)을 통해서만 이루어져야 하며, `schema.ts`는 최소 `cases`, `evidence`, `reports`, `feedback`, `allowed_testers` 5개 테이블을 정의해야 한다. | structure.md §lib/db/ |
| REQ-SCAFFOLD-004 | Where(capability gate) | Where `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` 환경변수가 설정된 경우, DB 클라이언트는 stable `drizzle-orm` 0.45.x 계열(`@rc` 프리릴리스 제외) + `@libsql/client` stable을 통해 Turso/libSQL에 연결되어야 한다. | [REF: research.md §2, §6-4] |
| REQ-SCAFFOLD-005 | Event-driven | 개발자가 `drizzle-kit generate`를 실행하면, `db/migrations/`에 스키마 기반 SQL 마이그레이션 파일이 생성되어야 한다. | [REF: research.md §5] |
| REQ-SCAFFOLD-006 | Ubiquitous | `lib/ai/provider.ts`는 파이프라인 단계가 실제로 필요로 하는 최소 메서드(예: `generate()`)만을 포함하는 공통 AI provider 인터페이스(`LLMProvider`)를 정의해야 한다. | structure.md §lib/ai/ |
| REQ-SCAFFOLD-007 | Ubiquitous | `lib/ai/providers/gemini.ts`는 `lib/ai/provider.ts` 인터페이스를 구현하며, `@google/genai` 패키지(버전 `<3.0.0` 명시 고정)를 사용해야 한다. | [REF: research.md §3, §6-5] |
| REQ-SCAFFOLD-008 | When(event-detected) | Gemini API가 429(rate limit) 응답을 반환한 것이 감지되면, Gemini adapter는 지수 백오프 재시도를 적용하고, 재시도가 소진되면 파이프라인 실행을 실패로 표시해야 한다. | tech.md §Gemini API 무료 tier 대응, [REF: research.md §3] |
| REQ-SCAFFOLD-009 | Ubiquitous | 인증 계층(`lib/auth/config.ts`)은 Better Auth를 사용하여 초대 전용(allowlist) 접근 제어를 구현해야 하며, 셀프 가입(self sign-up) 경로를 제공하지 않아야 한다. | [REF: research.md §4, §6-3] |
| REQ-SCAFFOLD-010 | Event-driven | 비로그인 사용자가 `cases/*` 또는 `api/cases/*` 경로에 접근하면, `proxy.ts`는 해당 요청을 `/login`으로 리다이렉트해야 한다. | [REF: research.md §1, §6-2] |
| REQ-SCAFFOLD-011 | Ubiquitous | 사건(case) 조회·수정 쿼리는 항상 `owner_user_id` 컬럼으로 필터링되어, 로그인한 사용자가 자신이 생성하지 않은 사건 데이터에 접근할 수 없어야 한다. | structure.md §lib/auth/ |
| REQ-SCAFFOLD-012 | When(event-detected) | 사건 입력 요청의 필드 값이 주민등록번호·전화번호·상세주소·의료기록 원본 형식 패턴과 일치하는 것이 감지되면, `lib/validation/case-input.ts`의 Zod 스키마는 해당 요청을 `CaseNormalizer` 호출 이전 단계에서 거부해야 한다. | product.md §핵심 원칙 3 |
| REQ-SCAFFOLD-013 | Ubiquitous | `lib/pipeline/`의 6개 파이프라인 단계 모듈(CaseNormalizer, QueryPlanner, EvidenceRetriever, Researcher, Skeptic, Verifier)은 각각 독립적으로 호출 가능한 타입 입출력 계약(TypeScript interface/type)을 가져야 한다. | structure.md §lib/pipeline/ |
| REQ-SCAFFOLD-014 | Event-driven | 파이프라인 오케스트레이터가 목업(mock)/trivial 단계 구현체로 사건 입력을 처리하면, 6단계를 순차 실행하여 seed evidence 데이터와 연결된 Research Report 객체를 end-to-end로 생성해야 한다. | product.md §핵심 원칙 5 |
| REQ-SCAFFOLD-015 | Ubiquitous | `db/seed/`는 end-to-end 파이프라인 검증에 충분한 소규모 seed evidence 데이터셋을 제공해야 한다. | product.md §핵심 원칙 5 |
| REQ-SCAFFOLD-016 | Ubiquitous | 사건 입력 폼(`app/cases/new/`)과 사건 상세/리포트 뷰(`app/cases/[caseId]/`)는 파이프라인을 수동으로 시연할 수 있는 최소 UI로 존재해야 한다. | 사용자 범위 경계 지시 |
| REQ-SCAFFOLD-017 | Ubiquitous | 프로젝트는 ESLint 9 flat config + Prettier + Vitest 테스트 하네스를 제공하며, `pnpm lint` / `pnpm format` / `pnpm test` 명령으로 각각 실행 가능해야 한다. | [REF: research.md §6-1] |
| REQ-SCAFFOLD-018 | Unwanted | 파이프라인 단계 모듈(`lib/pipeline/*.ts`)은 `lib/ai/providers/gemini.ts` 외부에서 Gemini SDK(`@google/genai`)를 직접 import해서는 안 된다. | structure.md §설계 메모 |

REQ 개수: 18개 (Tier L 상한 25개 대비 여유를 두어, scaffold+아키텍처 범위에 맞게 의도적으로 타이트하게 유지).

## §3. 비기능 제약 (Constraints)

- **무료 tier 우선**: Vercel/Turso 무료 tier에서 동작 가능해야 한다(tech.md §비용 태도).
- **overengineering 금지**: microservice, Kubernetes, 별도 vector DB를 도입하지 않는다(product.md §핵심 원칙 8).
- **DB 이식성**: 애플리케이션 코드는 Drizzle ORM API만 사용하고 libSQL 고유 문법에 직접 의존하지 않는다(structure.md §설계 메모).
- **AI provider 경계**: 파이프라인 코드는 `lib/ai/provider.ts` 인터페이스에만 의존하며 Gemini 전용 SDK를 직접 호출하지 않는다.
- **버전 고정**: `drizzle-orm`은 stable 0.45.x 계열(`@rc` 제외), `@google/genai`는 `<3.0.0`으로 명시 고정한다(research.md §6).
- **Node.js/패키지 매니저**: Node.js 20.x LTS 이상, pnpm(tech.md §개발 환경 요구사항).

## §4. 제외 범위 (Out of Scope)

이번 SPEC의 out of scope 항목은 다음과 같다 — 아래 항목들은 이번 scaffold+아키텍처 SPEC에서 다루지 않으며, `product.md` §Roadmap에 나열된 후속 SPEC 후보로 이연한다.

### Out of Scope — 파이프라인 로직 고도화
- Researcher/Skeptic/Verifier 단계의 실제 LLM 프롬프트 엔지니어링, 근거자료 품질 튜닝, 반대 논리 생성 정교화는 이번 SPEC에서 다루지 않는다. 이번 SPEC은 목업/trivial 구현으로 타입 계약과 end-to-end 배선만 검증한다.

### Out of Scope — UI/UX 고도화
- 사건 입력 폼과 리포트 뷰의 폴리시된(polished) UI/UX 디자인은 이번 SPEC에서 다루지 않는다. 이번 SPEC은 파이프라인을 수동으로 시연 가능한 최소(bare) UI만 제공한다.

### Out of Scope — 대규모 근거자료 데이터 수집
- 실제 대규모 evidence 데이터 수집·정제는 이번 SPEC에서 다루지 않는다. `db/seed/`에는 end-to-end 검증에 필요한 소규모 seed 데이터셋만 포함한다.

### Out of Scope — PostgreSQL 마이그레이션 실행
- Drizzle ORM 뒤에서 향후 PostgreSQL로 이전 가능한 구조는 유지하지만(REQ-SCAFFOLD-003), 실제 PostgreSQL 마이그레이션 실행은 이번 SPEC에서 다루지 않는다.

### Out of Scope — 담보 영역 확장
- 상해후유장해·질병후유장해 외의 담보 영역(질병사망, 실손의료비 등) 지원 확장은 이번 SPEC에서 다루지 않는다.

### Out of Scope — 인증 하드닝
- 로그인 시도 rate-limiting 등 프로덕션 수준의 인증 하드닝은 이번 SPEC에서 다루지 않는다. 초대 전용 allowlist 메커니즘만 제공하며, rate-limiting 부재는 §5 잔여 위험으로 명시한다.

## §5. 잔여 위험 (Residual Risks)

- 로그인 시도 rate-limiting 미구현 — 실사용(테스터 10명) 규모에서는 낮은 리스크로 판단하나, 추후 프로덕션 하드닝 SPEC에서 검토 필요.
- Gemini 무료 tier 요청 한도가 공식 고정 표 없이 대시보드 확인 방식으로 변경됨 — 구현 시점에 `aistudio.google.com/rate-limit`에서 재확인 필요([REF: research.md §3]).
- shadcn/ui의 Next.js 16.3.x 공식 검증 여부 미확인 — 구현 시 주의([REF: research.md §6-7]).

## §6. 참고 문서

- `.moai/project/product.md`, `.moai/project/structure.md`, `.moai/project/tech.md`
- `.moai/specs/SPEC-SCAFFOLD-001/research.md` (2026년 스택 현황 조사)
