# SPEC-SCAFFOLD-001 — Compact Reference

> 자동 생성된 압축 요약. 전체 내용은 spec.md / plan.md / acceptance.md / design.md / research.md 참고.

- **ID**: SPEC-SCAFFOLD-001
- **제목**: 보상레이더 MVP 최초 프로젝트 scaffold 및 핵심 아키텍처 구축
- **Tier**: L (5 artifacts)
- **Status**: draft
- **Priority**: P1
- **Phase target**: v0.1.0
- **Module**: app/, lib/, db/

## 범위 한 줄 요약

Next.js App Router + TypeScript strict scaffold, Drizzle/Turso DB 계층, AI provider abstraction(Gemini adapter), Better Auth 초대 전용 인증, PII 차단 Zod 검증, 6단계 리서치 파이프라인 타입 스텁 + seed 데이터 기반 E2E 배선, 최소 UI 2개 라우트, 린트/테스트 하네스 — **전체 서비스 완성이 아닌 scaffold+아키텍처 구축**.

## 요구사항 (18개, REQ-SCAFFOLD-001~018)

| ID | 요약 |
|----|------|
| 001 | Next.js 16.3.2+/App Router/TS strict/Tailwind/shadcn 초기화 |
| 002 | strict 모드 빌드 성공 |
| 003 | Drizzle ORM 유일 DB 경로, 5개 테이블(cases/evidence/reports/feedback/allowed_testers) |
| 004 | Turso/libSQL 연결, drizzle-orm stable 0.45.x 고정 |
| 005 | drizzle-kit generate → 마이그레이션 생성 |
| 006 | `lib/ai/provider.ts` 공통 LLMProvider 인터페이스 |
| 007 | Gemini adapter, `@google/genai` `<3.0.0` 고정 |
| 008 | Gemini 429 지수 백오프 재시도 |
| 009 | Better Auth 초대 전용 allowlist, 셀프가입 차단 |
| 010 | proxy.ts 보호 경로 로그인 리다이렉트 |
| 011 | owner_user_id 데이터 격리 |
| 012 | Zod PII 형식 입력 거부(CaseNormalizer 이전 차단) |
| 013 | 파이프라인 6단계 독립 타입 계약 |
| 014 | mock 구현 기반 E2E 파이프라인 → Research Report 생성 |
| 015 | seed evidence 데이터셋 |
| 016 | 최소 UI(사건 입력 + 리포트 뷰) |
| 017 | ESLint9 flat config + Prettier + Vitest 하네스 |
| 018 | (Unwanted) 파이프라인 모듈의 Gemini SDK 직접 import 금지 |

## Acceptance Criteria (16개, AC-SCAFFOLD-001~016)

001 초기화+빌드 · 002 스키마 5테이블 · 003 버전고정 · 004 마이그레이션 · 005 provider+adapter · 006 429처리(edge) · 007 allowlist 거부(edge) · 008 proxy 리다이렉트 · 009 데이터격리 · 010 PII거부(edge, 필수) · 011 파이프라인 타입계약 · 012 E2E mock 실행(필수) · 013 seed 데이터 · 014 최소UI동작 · 015 Gemini import 경계 · 016 품질게이트(test/lint/build clean)

## Out of Scope (6개 토픽)

파이프라인 로직 고도화 / UI-UX 고도화 / 대규모 데이터 수집 / PostgreSQL 마이그레이션 실행 / 담보 영역 확장 / 인증 하드닝(rate-limiting)

## 마일스톤 (plan.md §C, 검토 우선순위 순 — 실행은 M6 선행)

M1 데이터모델+AI추상화 → M2 인증/접근제어 → M3 PII검증 → M4 파이프라인스텁+오케스트레이터+seed → M5 최소UI → M6(실행상 최우선) 프로젝트초기화/툴링

## MX 태그 계획

- ANCHOR 후보: `lib/ai/provider.ts`, `lib/db/client.ts`, `lib/auth/session.ts`
- WARN 후보: `lib/pipeline/evidence-retriever.ts`, `lib/ai/providers/gemini.ts`(재시도 루프), `lib/pipeline/index.ts`(오케스트레이터)
- TODO 후보: `lib/pipeline/{researcher,skeptic,verifier}.ts` (목업 구현 명시)

## 참조

research.md §1(Next.js16), §2(Turso/Drizzle), §3(Gemini SDK), §4(Better Auth), §5(drizzle-kit), §6(상충점 7개)
