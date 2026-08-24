# 보상레이더 (bosang-radar)

보상레이더는 보험설계사와 손해사정사가 비식별 보험 사건 정보를 입력하면, 상해후유장해·질병후유장해 관점에서 추가로 검토할 담보·근거자료·반대 논리·추가 필요자료를 조사해 주는 B2B AI Research Assistant입니다. 사전에 지정한 실무자 10명 내외를 대상으로 하는 비공개 파일럿이며, 회원가입은 없고 운영자가 등록한 테스터 계정만 초대 전용(allowlist)으로 로그인합니다.

자세한 제품 설명은 [`.moai/project/product.md`](.moai/project/product.md)를 참고하세요.

## 기술 스택

- **프레임워크**: Next.js (App Router) + TypeScript strict
- **UI**: Tailwind CSS + shadcn/ui
- **DB**: Turso/libSQL + Drizzle ORM (stable 0.45.x 계열)
- **인증**: Better Auth — 초대 전용(allowlist) 접근 제어, 셀프 가입 없음
- **AI**: `lib/ai/provider.ts` 공통 인터페이스 뒤에 Gemini adapter(`@google/genai`)를 배치 — 특정 LLM에 종속되지 않는 구조
- **검증**: Zod (PII 형식 입력 구조적 차단)
- **테스트/린트/포맷**: Vitest / ESLint 9 flat config / Prettier

기술 선택 근거는 [`.moai/project/tech.md`](.moai/project/tech.md), 디렉터리 구조는 [`.moai/project/structure.md`](.moai/project/structure.md)를 참고하세요.

## 현재 구현 상태 (SPEC-SCAFFOLD-001 완료)

최초 프로젝트 scaffold와 MVP 핵심 아키텍처가 구축되어 있습니다.

- Drizzle ORM 스키마(`cases`, `evidence`, `reports`, `feedback`, `allowed_testers`) + Turso/libSQL 클라이언트 배선
- AI provider abstraction(`LLMProvider`) + Gemini adapter(429 지수 백오프 재시도 포함)
- Better Auth 초대 전용 인증 + `proxy.ts` 라우트 가드(`cases/*`, `api/cases/*` 보호)
- 사건 입력 PII 차단 Zod 검증 스키마(`lib/validation/case-input.ts`)
- 6단계 리서치 파이프라인(CaseNormalizer → QueryPlanner → Evidence Retriever → Researcher → Skeptic → Verifier) 타입 계약 스텁 — 목업 구현으로 end-to-end 배선 검증 완료
- 파이프라인을 수동으로 시연할 수 있는 최소 UI(사건 입력 폼 `app/cases/new/`, 리포트 뷰 `app/cases/[caseId]/`)
- `pnpm build` / `pnpm lint` / `pnpm test` / `pnpm format:check` 전체 통과(22 files, 71 tests)

파이프라인 각 단계의 실제 LLM 기반 소견 생성 로직, 폴리시된 UI, 대규모 근거자료 수집은 아직 구현되지 않았습니다 — 아래 "다음 단계" 참고.

## 개발 환경 설정

### 요구사항

- Node.js 20.x LTS 이상
- pnpm

### 설치 및 환경변수

```bash
pnpm install
cp .env.local.example .env.local
```

`.env.local`에 아래 값을 채워 넣으세요.

- `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` — Turso/libSQL 연결 정보
- `GEMINI_API_KEY` — Gemini API 키
- `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` — 인증 세션 서명 키 및 base URL

### 개발 서버 실행

```bash
pnpm dev
```

[http://localhost:3000](http://localhost:3000)에서 확인할 수 있습니다.

## 사용 가능한 스크립트

| 명령어              | 설명                                         |
| ------------------- | -------------------------------------------- |
| `pnpm dev`          | 개발 서버 실행                               |
| `pnpm build`        | 프로덕션 빌드(TypeScript strict 컴파일 포함) |
| `pnpm lint`         | ESLint 9 flat config 검사                    |
| `pnpm format`       | Prettier로 코드 포맷 적용                    |
| `pnpm format:check` | Prettier 포맷 준수 여부만 확인               |
| `pnpm test`         | Vitest 테스트 스위트 실행                    |
| `pnpm db:generate`  | Drizzle Kit 마이그레이션 파일 생성           |

## 프로젝트 구조

```
bosang-radar/
├── app/                 # Next.js App Router 라우트 (사건 입력, 리포트 뷰, API)
├── proxy.ts             # 비로그인 사용자를 /login으로 리다이렉트하는 인증 가드
├── components/ui/       # shadcn/ui 기반 UI 컴포넌트
├── lib/
│   ├── auth/            # 인증/세션/allowlist 로직
│   ├── validation/       # PII 차단 Zod 스키마
│   ├── ai/               # AI provider abstraction + Gemini adapter
│   ├── db/               # Drizzle ORM 클라이언트 + 스키마
│   ├── cases/            # 사건 생성/조회 (owner_user_id 필터링)
│   └── pipeline/          # 6단계 리서치 파이프라인 (타입 계약 스텁)
├── db/
│   ├── migrations/        # Drizzle Kit 마이그레이션
│   └── seed/               # end-to-end 검증용 소규모 seed evidence 데이터
└── .moai/                  # MoAI-ADK 프로젝트 메타 (SPEC, 설정, 문서)
```

전체 구조와 각 디렉터리의 설계 의도는 [`.moai/project/structure.md`](.moai/project/structure.md)를 참고하세요.

## 다음 단계 (이번 SPEC이 다루지 않은 것)

SPEC-SCAFFOLD-001은 전체 서비스 완성이 아니라 최초 scaffold + 핵심 아키텍처 구축에 집중했습니다. 다음 항목은 후속 SPEC 후보로 이연되었습니다.

- **파이프라인 로직 고도화**: Researcher/Skeptic/Verifier 단계의 실제 LLM 프롬프트 엔지니어링, 근거자료 품질 튜닝, 반대 논리 생성 정교화
- **UI/UX 고도화**: 사건 입력 폼과 리포트 뷰의 폴리시된 디자인
- **대규모 근거자료 데이터 수집**: 현재는 `db/seed/`의 소규모 seed 데이터셋만 존재
- **PostgreSQL 마이그레이션 실행**: Drizzle ORM 뒤에서 이전 가능한 구조는 유지하되, 실제 마이그레이션은 미실행
- **담보 영역 확장**: 상해후유장해·질병후유장해 외 담보 영역(질병사망, 실손의료비 등)
- **인증 하드닝**: 로그인 시도 rate-limiting 등 프로덕션 수준의 하드닝

자세한 배경과 로드맵은 [`.moai/project/product.md`](.moai/project/product.md) §Roadmap과 [`.moai/specs/SPEC-SCAFFOLD-001/spec.md`](.moai/specs/SPEC-SCAFFOLD-001/spec.md) §4를 참고하세요.
