# Changelog

이 프로젝트의 모든 주요 변경사항을 이 파일에 기록합니다.
형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/)를 따릅니다.

## [Unreleased]

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
