# Changelog

이 프로젝트의 모든 주요 변경사항을 이 파일에 기록합니다.
형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/)를 따릅니다.

## [Unreleased]

### Added — SPEC-RUNTIME-001 실제 런타임 활성화 (DB 연결·시드·테스터 프로비저닝·E2E 검증)

SPEC-SCAFFOLD-001이 구축한 scaffold를 실제로 로컬에서 기동 가능한 상태로 전환했습니다(M1/M3/M4/M2/M5/M6 완료). 이번 SPEC은 새 기능이 아니라 "코드는 있지만 실행 경로가 검증된 적 없는" 상태를 "실제로 DB에 붙어 로그인하고 E2E가 통과하는" 상태로 바꾸는 활성화 계층입니다.

- **목적별 환경변수 검증 계약**: `lib/env.ts`가 `db`/`provision`/`app`/`e2e` 4개 실행 목적별로 필요한 환경변수만 검증(스코프 매트릭스는 `.env.local.example`과 `.moai/docs/runtime-runbook.md` §2 참고) — 불필요한 변수까지 요구하지 않음
- **명시적 로드 부트스트랩**: `scripts/cli-bootstrap.ts` — 마이그레이션/시드/테스터 생성 CLI가 셸 `export` 없이 `.env.local` 파일을 직접 로드
- **부팅 시점 fail-fast**: `instrumentation.ts` — Next.js 서버 부팅 시 환경변수 검증을 즉시 실행해 잘못된 설정으로 앱이 조용히 뜨는 것을 방지
- **마이그레이션 적용 CLI**: `pnpm db:migrate`(`scripts/db-migrate.ts`) — 재실행 안전(이미 적용된 마이그레이션은 추적 테이블 기준으로 스킵)
- **시드 적재 CLI**: `pnpm db:seed`(`scripts/db-seed.ts`) — `id` 기준 onConflict로 재실행해도 중복 없음
- **테스터 계정 프로비저닝 CLI**: `pnpm tester:add`(`scripts/provision-tester.ts`) — Better Auth 공식 API(`auth.api.signUpEmail()`)로 초대 전용 테스터 계정 생성, 이미 존재하는 이메일은 스킵
- **실제 Playwright E2E 스위트**: `pnpm test:e2e`(`scripts/run-e2e.ts` + `e2e/*.spec.ts`, `playwright.config.ts`) — 로그인·사건입력·피드백·테넌트 격리 4개 시나리오를 실제 Chromium으로 검증. 매 실행마다 로컬 파일 DB를 초기화하고 마이그레이션·시드·테스터 A/B 프로비저닝을 자동 수행해, 원격 인스턴스나 개발자의 `.env.local` 데이터에 영향을 주지 않음. 실행 포트는 하드코딩 대신 실행 시점에 빈 포트를 동적으로 탐색(`findFreePort()`)
- **운영자용 런북**: `.moai/docs/runtime-runbook.md` — 준비물부터 E2E 실행까지 순서대로 따라갈 수 있는 절차 문서
- **SPEC-SCAFFOLD-001 스키마/마이그레이션 드리프트 보정**: M2 실행 중 발견된 `account.issuer` 컬럼 누락(Better Auth 1.7.1 요구)을 보정 마이그레이션 1건(`db/migrations/0001_bitter_talon.sql`)으로 해소

**검증**: `pnpm test`(33 files, 139 tests)/`pnpm lint`/`pnpm build`/`pnpm format:check` 전체 통과. 22개 인수 기준(AC-RUNTIME-001~022) 전체 PASS. 독립 보안 리뷰에서 CRITICAL/HIGH 등급 발견 없음.

**참고**: `.moai/specs/SPEC-RUNTIME-001/`, `.moai/docs/runtime-runbook.md`

### Added — SPEC-SCAFFOLD-001 최초 프로젝트 scaffold 및 핵심 아키텍처

보상레이더 MVP의 최초 실행 가능한 프로젝트 scaffold와 핵심 아키텍처를 구축했습니다(M6, M1-M5 완료).

- **프로젝트 초기화**: Next.js App Router + TypeScript strict + Tailwind CSS + shadcn/ui 기본 설정
- **DB 스키마**: Drizzle ORM 스키마(`cases`, `evidence`, `reports`, `feedback`, `allowed_testers`) + Turso/libSQL 클라이언트 배선(`lib/db/`), `drizzle-kit generate` 마이그레이션 생성 확인
- **AI provider abstraction**: 공통 `LLMProvider` 인터페이스(`lib/ai/provider.ts`) + Gemini adapter(`lib/ai/providers/gemini.ts`, `@google/genai@2.18.0`), 429 rate-limit 지수 백오프 재시도 처리
- **인증**: Better Auth 기반 초대 전용(allowlist) 접근 제어(`lib/auth/config.ts`), `proxy.ts` 라우트 가드로 비로그인 사용자를 `/login`으로 리다이렉트, `owner_user_id` 컬럼 기반 사건 데이터 접근 제어
- **PII 입력 검증**: `lib/validation/case-input.ts` Zod 스키마 — 주민등록번호·전화번호·상세주소·의료기록 원본 형식 패턴을 `CaseNormalizer` 호출 이전 단계에서 구조적으로 거부
- **6단계 리서치 파이프라인**: CaseNormalizer → QueryPlanner → Evidence Retriever → Researcher → Skeptic → Verifier의 독립 호출 가능한 타입 계약(`lib/pipeline/`), 목업 구현으로 seed evidence 데이터와 연결된 Research Report end-to-end 생성 검증
- **최소 UI**: 사건 입력 폼(`app/cases/new/`), 사건 상세 + 리포트 뷰 + 전문가 피드백 폼(`app/cases/[caseId]/`), 사건 생성 API route handler(`app/api/cases/`)
- **테스트/린트/포맷 하네스**: ESLint 9 flat config + Prettier + Vitest, `pnpm lint` / `pnpm format` / `pnpm test` 명령 지원

**검증**: `pnpm build`/`pnpm lint`/`pnpm test`(22 files, 71 tests)/`pnpm format:check` 전체 통과. 17개 인수 기준(AC-SCAFFOLD-001~017) 전체 PASS.

**참고**: `.moai/specs/SPEC-SCAFFOLD-001/`
