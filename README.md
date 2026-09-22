# 보상레이더 (bosang-radar)

> **2026-09-18 B2B 코드 정리 완료(SPEC-B2C-FOUNDATION-001)**: 보상레이더는 사고·질병 당사자 **본인**이 검색 한 줄로 놓치고 있는 보험 담보를 진단받고 손해사정사 상담으로 연결되는 **B2C 보상 진단 퍼널**로 방향을 전환했습니다(`design/MIGRATION-PLAN.md` 기준). 이 SPEC에서 이전 B2B 전용 코드(`app/cases/*`, `app/login/*`, `lib/auth/`(Better Auth), `lib/cases/`, `lib/feedback/`, `proxy.ts`, 관련 E2E·스크립트)를 전부 삭제했습니다 — **현재 `app/`의 기본 출력은 여전히 "서비스 준비 중" 정적 placeholder이지만, B2C 01 진단 플로우는 SPEC-B2C-DIAGNOSIS-001에서 기능 플래그(`ENABLE_DIAGNOSIS_FLOW` + `DIAGNOSIS_ENGINE_READY`, 또는 리뷰 전용 `ENABLE_DIAGNOSIS_DEV_STATES`) 뒤에 구현되어 있습니다**(아래 "현재 구현 상태" 참고). 02 보상 진단 결과·03 상담 신청 화면의 구현은 아직 없습니다(후속 SPEC 범위). `lib/pipeline/`(6단계 리서치 파이프라인)·`lib/validation/case-input.ts`·`lib/ai/`·`lib/db/`·기존 마이그레이션 이력은 재사용 여부 미결정 상태로 그대로 보존되어 있습니다. 아래 "현재 구현 상태" 절 이후의 SPEC 이력(SPEC-SCAFFOLD-001 ~ SPEC-CASE-PROGRESS-002)은 **삭제 이전 B2B 버전의 개발 기록**이며, 서술된 기능·테스트 수치는 더 이상 현재 코드 상태와 일치하지 않습니다 — 과거 구현 과정의 참고 자료로만 유지합니다.

보상레이더(B2B 버전, **코드 삭제됨 — 아래는 과거 기록**)는 보험설계사와 손해사정사가 비식별 보험 사건 정보를 입력하면, 상해후유장해·질병후유장해 관점에서 추가로 검토할 담보·근거자료·반대 논리·추가 필요자료를 조사해 주는 AI Research Assistant였습니다. 사전에 지정한 실무자 10명 내외를 대상으로 하는 비공개 파일럿이었으며, 회원가입은 없고 운영자가 등록한 테스터 계정만 초대 전용(allowlist)으로 로그인했습니다.

새 B2C 방향의 제품 정의·화면 구성·B2B 코드 정리 상세 분류는 [`.moai/project/product.md`](.moai/project/product.md)와 [`.moai/project/structure.md`](.moai/project/structure.md)를 참고하세요.

## 기술 스택

- **프레임워크**: Next.js (App Router) + TypeScript strict
- **UI**: Tailwind CSS + shadcn/ui
- **DB**: Turso/libSQL + Drizzle ORM (stable 0.45.x 계열)
- **인증**: 없음 — B2C 진단·상담 플로우는 로그인 없이 완전 공개로 동작합니다. Better Auth 기반 초대 전용 인증은 B2B 방향과 함께 SPEC-B2C-FOUNDATION-001에서 삭제 완료됐습니다(레거시 기록: [`.moai/project/tech.md`](.moai/project/tech.md) § Better Auth)
- **AI**: `lib/ai/provider.ts` 공통 인터페이스 뒤에 Gemini adapter(`@google/genai`)를 배치 — 특정 LLM에 종속되지 않는 구조
- **검증**: Zod (PII 형식 입력 구조적 차단)
- **테스트/린트/포맷**: Vitest / ESLint 9 flat config / Prettier

기술 선택 근거는 [`.moai/project/tech.md`](.moai/project/tech.md), 디렉터리 구조는 [`.moai/project/structure.md`](.moai/project/structure.md)를 참고하세요.

## 현재 구현 상태 (18개 SPEC 완료)

### B2C 방향 (현행)

B2B 전용 코드를 정리하고 `app/`을 B2C 최소 공개 진입점으로 전환한 **SPEC-B2C-FOUNDATION-001**이 완료됐습니다(PR #15 main 병합).

이어서 **SPEC-B2C-DIAGNOSIS-001**이 B2C 3단계 퍼널의 첫 진입점인 **01 진단 플로우**를 구현했습니다 — 로그인·회원가입 없이 검색 한 줄을 입력하면 민감정보 처리 동의 1건을 받고, 추가 질문으로 정확도를 높인 뒤 분석 상태를 보여 주는 경로이며, 화면은 Desktop 6개(01 질문 입력 / 01-A2 동의 / 01-B 추가 질문 / 01-C 진단 중 / 01-D 결과 없음 / 01-E 분석 오류) + Mobile 4개(M01 / M01-A2 / M01-B / M01-C) 총 10개입니다. 주요 특성:

- **기본 차단**: 렌더링 조건은 `productionReady = ENABLE_DIAGNOSIS_FLOW && DIAGNOSIS_ENGINE_READY`와 리뷰 전용 `reviewEnabled = ENABLE_DIAGNOSIS_DEV_STATES`의 OR 합성입니다. 코드 어디에도 두 서버 전용 플래그를 `"true"`로 대입하는 지점이 없어, 플래그 미설정 기본 빌드의 `/` 출력은 기존 placeholder와 동일합니다. 실제 담보 매칭 엔진 연결은 이 SPEC의 범위 밖입니다.
- **PII 미수집**: 일반 개인정보 수집·이용 동의를 요구하지 않고 민감정보 처리 동의 1건만 필수이며, `lib/validation/diagnosis-input.ts`가 전화번호·주민등록번호는 자동 차단하고 이름 등은 안내만 하는 2단계 Zod 검증을 수행합니다.
- **반응형·접근성**: 768px 기준으로 동의 상세가 Desktop Modal / Mobile Bottom Sheet로 분기하고, 닫기·ESC·배경 클릭 어느 경로로 닫아도 포커스가 트리거로 복귀하며, 동의 체크박스와 설명이 스크린리더에 한 항목으로 읽힙니다.
- **시각 정합성 게이트**: `pnpm visual:verify`가 `design/exports/`의 2배 PNG를 1배로 정규화한 프레임과 실제 렌더를 대조합니다 — 배경색·글자 크기·요소 폭에 더해 줄바꿈 지점까지 검사하며, 측정값이 없으면 통과시키지 않고 exit 1로 실패합니다. 결과물은 [`.moai/reports/visual-check/SPEC-B2C-DIAGNOSIS-001/`](.moai/reports/visual-check/SPEC-B2C-DIAGNOSIS-001/)에 있습니다.

검증 기준: `pnpm test` 53 files / 394 tests PASS, `pnpm lint`·`pnpm exec tsc --noEmit` 무출력, Playwright 16/16, `pnpm visual:verify` 10/10 화면 exit 0, acceptance 기준 AC 25/25.

### B2B 버전 개발 기록 (코드 삭제됨 — 과거 참고용)

최초 프로젝트 scaffold와 MVP 핵심 아키텍처(SPEC-SCAFFOLD-001)에 이어, 실제 로컬 환경에서 DB 연결·마이그레이션·시드·테스터 계정 생성·E2E 검증까지 전 과정을 실행할 수 있는 런타임 활성화 계층(SPEC-RUNTIME-001)이 구축되었고, 여기에 더해 6단계 리서치 파이프라인이 목업이 아니라 evidence-first Gemini 구조화 출력 기반으로 실제 동작하도록 전환한 SPEC-RESEARCH-001, 역할별 모델 분리·호출 배치·rate 페이싱·동시성 제한·재시도 복원력으로 무료 티어 파일럿 안정성을 확보한 SPEC-GEMINI-RUNTIME-001까지 완료되어 있습니다. 이후 근거자료 corpus를 담보×쟁점 기준으로 21건까지 확장하고 쟁점 중심 ranking을 도입한 SPEC-EVIDENCE-001, 리포트 단위 구조화 전문가 피드백 축적 경로를 추가한 SPEC-FEEDBACK-001, 신규 기능 없이 대기 상태 표시·중복 제출 방지·리포트 요약 배너·근거자료 표시·피드백 폼 사용성·명시적 UI 상태를 UI 계층에서만 다듬어 실사용성을 높인 SPEC-PILOT-UX-001, 당시(B2B 기준) 확정됐던 Pencil 디자인(`design/claimradar-ui.pen` — 이 파일은 이후 B2C 피벗으로 내용이 완전히 교체되었으며, 현재는 B2C 사용자 화면 24개(Desktop 12 + Mobile 12) + DEV ONLY 내부 자료 4개를 담고 있습니다. 상세: `design/MIGRATION-PLAN.md`)을 신규 기능·데이터 변경 없이 사건 입력/Research Report/전문가 피드백 3개 화면에 순수 시각 계층에서만 재현한 SPEC-PILOT-VISUAL-001, 그 당시 B2B 디자인 전체 화면 확장을 재현한 SPEC-UI-MIGRATION-001, 그리고 Better Auth rate-limit로 인한 flaky를 제거하기 위해 E2E storageState 인증 재사용을 도입한 SPEC-E2E-AUTH-STATE-001까지 완료되었습니다.

파일럿(외부 전문가 10명 내외) 실제 착수 전 운영 배포 검증(호스팅 결정, 원격 DB/인증 도메인 검증, 사용자별 동시 실행 가드, 구조적 로깅, 데이터 취급 고지 정직성)을 다루는 SPEC-PILOT-READY-001도 완료됐습니다 — **호스팅은 Netlify Free로 확정**했고, 구현(M1-M6, Netlify Background Function 비동기 전환 및 Researcher 하이브리드 모델 라우팅 포함)과 PR #10의 자동 Deploy Preview 번들링 문제 수정을 마친 뒤, 실제 Deploy Preview·원격 Turso 대상 재검증으로 readiness 7개 항목이 모두 `READY`로 전환되어 **전체 판정은 `GO`**입니다(최종 검증 68/68 test files, 477/477 tests, `tsc`/`eslint`/`format:check`/`build` 모두 PASS 기준, `.moai/specs/SPEC-PILOT-READY-001/`). PR #10은 main에 병합 완료(merge commit `d74ece4`)됐습니다 — 다만 이 `GO` 판정은 이 SPEC이 요구하는 배포 준비 기준(readiness criteria) 충족을 뜻할 뿐이며, 연결된 사이트를 실제 장기 프로덕션 사이트로 채택하고 자동 배포를 사용할지는 아직 별도로 결정되지 않았습니다(아래 "다음 단계" 참고).

프로덕션 사용자 노출 문구를 정상 서비스 수준으로 정리하고 최초 운영 계정 발급 절차를 문서화한 SPEC-PILOT-LAUNCH-001도 완료됐습니다 — PR #11이 main에 squash 병합(커밋 `bc289ad`)된 뒤 3-phase close(`14a6394`)로 종결됐습니다.

문서 현행화, 최초 운영 계정 발급 계획, 프로덕션 단일 계정 스모크 체크리스트 + 테넌트 격리 게이트, 파일럿 3단계 롤아웃 + 성공지표 집계 계약, Gemini 하이브리드 라우팅 쿼터 운영 계획을 담은 신규 운영 문서(`.moai/docs/pilot-ops-launch-plan.md`)를 작성한 SPEC-PILOT-OPS-001도 완료됐습니다 — 코드 변경 없는 문서 전용(documentation-only) SPEC이며, 실제 계정 발급·실 DB 쓰기·실 Gemini 호출·실 배포·실 테스터 초대는 수행하지 않았습니다.

사건 입력 대기 화면에 4단계 정적 분석 진행 안내를 추가한 SPEC-CASE-PROGRESS-001도 완료됐습니다 — `AnalysisStatusPanel`과 라벨을 공유하는 단일 소스(`lib/cases/analysis-stages.ts`)로 추출했을 뿐, 당시에는 백엔드가 단계별 진행 데이터를 전혀 반환하지 않아 개별 단계 완료/진행 표시(가짜 진행률)를 의도적으로 배제했습니다(이 제약은 SPEC-CASE-PROGRESS-002로 해소되었습니다 — 아래 참고).

`runPipeline()`(6단계 리서치 파이프라인) 내부 실행 경계를 실제로 계측해 `case_jobs.progress_stage` 컬럼과 `/api/cases/status`의 `progressStage` 필드로 전파하고, 사건 입력 대기 화면에 서버가 실제로 반환한 값에서만 계산되는 진짜 퍼센트 `role="progressbar"`와 단계별 완료/진행 중/대기 표시를 추가한 SPEC-CASE-PROGRESS-002도 완료됐습니다 — SPEC-CASE-PROGRESS-001이 확정한 "가짜 진행률 금지" 원칙을 신규 계측이 존재하는 범위 안에서 명시적으로 반전하며, 관측값 사이를 보간하거나 시간 경과만으로 자동 증가하는 로직은 포함하지 않습니다.

사이드바 "전문가 피드백" 항목의 아이콘을 인페이지 앵커 이동을 암시하는 `CornerDownRight`로 교체하고 활성 링크에 접근성 `aria-label`을 추가한 SPEC-SIDEBAR-NAV-001도 완료됐습니다 — 이 항목은 별도 페이지가 아닌 리서치 리포트 내부 섹션(`#expert-feedback`)으로의 인페이지 이동일 뿐이라 시각적으로 구분했으며, `href` 계산 로직·실제 이동 대상·"사건 입력"/"리서치 리포트" 두 실 항목은 전혀 수정하지 않은 순수 프레젠테이션 전용 변경입니다.

- Drizzle ORM 스키마(`cases`, `evidence`, `reports`, `feedback`, `allowed_testers`, `reservations`, `case_jobs`) + Turso/libSQL 클라이언트 배선
- AI provider abstraction(`LLMProvider`) + Gemini adapter(429 지수 백오프 재시도, `responseJsonSchema` 기반 구조화 출력) — 결정론적(deterministic) provider는 테스트/E2E 전용, 프로덕션 경로는 `provider-factory.ts`가 실제 Gemini 호출을 선택
- Better Auth 초대 전용 인증 + `proxy.ts` 라우트 가드(`cases/*`, `api/cases/*` 보호) + 실제 계정 생성 CLI(`pnpm tester:add`)
- 사건 입력 PII 차단 Zod 검증 스키마(`lib/validation/case-input.ts`)
- 6단계 evidence-first 리서치 파이프라인(CaseNormalizer → QueryPlanner(담보 영역별 규칙 기반 쿼리 생성) → EvidenceRetriever(Drizzle DB 관련성 필터링) → Researcher/Skeptic(실제 Gemini 구조화 출력, 근거자료 없이는 소견을 만들지 않음) → Verifier(evidence 내용이 claim/반론을 실제로 뒷받침하는지까지 의미 검증, 불충분 시 INSUFFICIENT 처리)
- 파이프라인 결과를 확인할 수 있는 UI(사건 입력 폼 `app/cases/new/`, VERIFIED/INSUFFICIENT 배지가 붙은 리포트 뷰 `app/cases/[caseId]/`) — 다크 사이드바+탑바 앱 셸과 브랜드 토큰(Pretendard/Manrope, `app/cases/` 라우트 그룹 한정)으로 재스타일됨
- **목적별 환경변수 검증**(`lib/env.ts`) + 부팅 시점 fail-fast(`instrumentation.ts`) — `db`/`provision`/`app`/`e2e` 각 실행 목적이 필요로 하는 변수만 검증
- **DB 마이그레이션·시드 CLI**(`pnpm db:migrate`, `pnpm db:seed`) — 재실행 안전
- **테스터 계정 프로비저닝 CLI**(`pnpm tester:add`) — Better Auth 공식 API(`signUpEmail`) 기반
- **실제 Playwright E2E 스위트**(`pnpm test:e2e`) — 로그인·사건입력·피드백·테넌트 격리 4개 시나리오를 실제 Chromium으로 검증
- **Netlify Background Function 비동기 분석 경로** — `POST /api/cases`는 `202`와 jobId를 즉시 반환하고, 최대 15분 백그라운드 실행 후 상태 조회로 결과 페이지에 이동
- `pnpm test`(68 files, 477 tests)/`pnpm test:e2e`(11 passed, 11 expected skips — 로컬 하네스가 Netlify Background Functions를 흉내내지 않는 async case-flow 경로는 스킵, 원격 Preview 스모크로 대체 검증)/`pnpm lint`/`pnpm build`/`pnpm format:check` PASS

로컬 환경에서 DB 연결부터 E2E 실행까지 처음 시작하는 절차는 [`.moai/docs/runtime-runbook.md`](.moai/docs/runtime-runbook.md)를 참고하세요.

대규모 근거자료 수집, 프로덕션 배포는 아직 구현되지 않았습니다 — 아래 "다음 단계" 참고.

## 개발 환경 설정

### 요구사항

- Node.js 20.x LTS 이상
- pnpm

### 설치 및 환경변수

```bash
pnpm install
cp .env.local.example .env.local
```

`.env.local`에 아래 값을 채워 넣으세요. 각 변수가 어떤 실행 목적(`db`/`provision`/`app`/`e2e`)에 실제로 필요한지는 `.env.local.example`의 스코프 주석과 [`.moai/docs/runtime-runbook.md`](.moai/docs/runtime-runbook.md) §2를 참고하세요 — 로컬 파일 DB(`file:` 스킴)로 시작하면 별도 발급 없이 바로 진행할 수 있습니다.

- `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` — Turso/libSQL 연결 정보
- `GEMINI_API_KEY` — Gemini API 키 (`LLM_PROVIDER_MODE`가 `deterministic`이 아닌 정상 앱 기동 시 필수 — 테스트/E2E처럼 결정론적 provider로 돌릴 때는 필요 없음)
- `GEMINI_RESEARCH_MODEL`, `GEMINI_FAST_MODEL`, `GEMINI_RESEARCH_RPM_BUDGET`, `GEMINI_FAST_RPM_BUDGET` — 전부 선택 사항(코드 기본값 존재). Researcher/Skeptic·Verifier 역할별 모델과 자체 부과 RPM 페이싱 예산을 각각 오버라이드할 때만 설정 — 자세한 기본값과 근거는 `.env.local.example` 주석 참고

### DB 마이그레이션·시드

```bash
pnpm db:migrate                                   # 스키마 적용 (재실행 안전)
pnpm db:seed                                       # 초기 evidence 데이터 적재
```

셸에 환경변수를 `export`할 필요 없이 `.env.local` 파일만 채워두면 위 두 명령이 직접 읽어 들입니다. 전체 절차는 [`.moai/docs/runtime-runbook.md`](.moai/docs/runtime-runbook.md)를 참고하세요. (`pnpm tester:add`는 Better Auth 테스터 프로비저닝용이었으나 SPEC-B2C-FOUNDATION-001에서 대상 스크립트와 함께 삭제됐습니다 — B2C 플로우는 로그인이 없어 테스터 계정이 필요 없습니다.)

### 개발 서버 실행

```bash
pnpm dev
```

[http://localhost:3000](http://localhost:3000)에서 확인할 수 있습니다.

### E2E 테스트 실행

```bash
pnpm exec playwright install --with-deps chromium   # 최초 1회
pnpm test:e2e
```

> **2026-09-21 현재**: SPEC-B2C-FOUNDATION-001에서 B2B 전용 E2E 시나리오(로그인·사건입력·피드백·테넌트 격리)를 `e2e/` 디렉터리째 삭제한 뒤, SPEC-B2C-DIAGNOSIS-001이 01 진단 플로우 전용 시나리오 `e2e/diagnosis-flow-01.spec.ts`(16건)를 새로 작성했습니다. 특정 스위트만 실행하려면 `pnpm test:e2e -- --spec=diagnosis-flow-01`을 사용하세요. 02/03 화면은 아직 미구현이라 해당 시나리오는 없습니다.

## 사용 가능한 스크립트

| 명령어               | 설명                                         |
| -------------------- | -------------------------------------------- |
| `pnpm dev`           | 개발 서버 실행                               |
| `pnpm build`         | 프로덕션 빌드(TypeScript strict 컴파일 포함) |
| `pnpm lint`          | ESLint 9 flat config 검사                    |
| `pnpm format`        | Prettier로 코드 포맷 적용                    |
| `pnpm format:check`  | Prettier 포맷 준수 여부만 확인               |
| `pnpm test`          | Vitest 테스트 스위트 실행                    |
| `pnpm test:e2e`      | Playwright E2E 스위트 실행 (실제 Chromium)   |
| `pnpm visual:verify` | 디자인 export 대비 시각 정합성 검증 (10화면) |
| `pnpm db:generate`   | Drizzle Kit 마이그레이션 파일 생성           |
| `pnpm db:migrate`    | 마이그레이션 실제 적용 (재실행 안전)         |
| `pnpm db:seed`       | 초기 evidence 데이터 적재 (재실행 안전)      |

## 프로젝트 구조

```
bosang-radar/
├── app/                 # Next.js App Router 라우트 (사건 입력, 리포트 뷰, API)
├── proxy.ts             # 비로그인 사용자를 /login으로 리다이렉트하는 인증 가드
├── instrumentation.ts   # Next.js 부팅 시점 환경변수 fail-fast 훅
├── components/ui/       # shadcn/ui 기반 UI 컴포넌트
├── lib/
│   ├── auth/            # 인증/세션/allowlist 로직
│   ├── validation/       # PII 차단 Zod 스키마
│   ├── ai/               # AI provider abstraction + Gemini adapter
│   ├── db/               # Drizzle ORM 클라이언트 + 스키마
│   ├── cases/            # 사건 생성/조회 (owner_user_id 필터링)
│   ├── env.ts             # 목적별(db/provision/app/e2e) 환경변수 검증 계약
│   └── pipeline/          # 6단계 evidence-first 리서치 파이프라인
├── scripts/               # 런타임 활성화 CLI (마이그레이션·시드·테스터 프로비저닝·E2E 하네스)
├── e2e/                   # Playwright E2E 시나리오 (로그인·사건입력·피드백·테넌트 격리)
├── db/
│   ├── migrations/        # Drizzle Kit 마이그레이션
│   └── seed/               # end-to-end 검증용 소규모 seed evidence 데이터
└── .moai/                  # MoAI-ADK 프로젝트 메타 (SPEC, 설정, 문서)
```

전체 구조와 각 디렉터리의 설계 의도는 [`.moai/project/structure.md`](.moai/project/structure.md)를 참고하세요.

## 다음 단계

전체 서비스 완성이 아니라 근거자료 기반으로 실제 동작하는 상태를 만드는 데 집중해 왔습니다. 남은 작업은 3단계로 분류합니다.

### 구현 완료 (완료 18개 SPEC)

SPEC-SCAFFOLD-001(scaffold + 핵심 아키텍처) · SPEC-RUNTIME-001(런타임 활성화) · SPEC-RESEARCH-001(evidence-first 파이프라인 전환) · SPEC-GEMINI-RUNTIME-001(무료 티어 파일럿 안정화 — 역할별 모델 분리·rate 페이싱·재시도 복원력) · SPEC-EVIDENCE-001(근거자료 21건 확장 + 쟁점 ranking) · SPEC-FEEDBACK-001(구조화 전문가 피드백 축적) · SPEC-PILOT-UX-001(UI 사용성 다듬기) · SPEC-PILOT-VISUAL-001(Pencil 디자인 시각 재현) · SPEC-UI-MIGRATION-001(전체 화면 확장 재현) · SPEC-E2E-AUTH-STATE-001(E2E 인증 flaky 제거) · SPEC-PILOT-READY-001(파일럿 배포 준비 — Netlify Free 호스팅 확정, Background Function 비동기 전환, Gemini 하이브리드 라우팅, 사용자별 동시 실행 가드, 데이터 취급 고지 정직성 개선; readiness 7개 항목 전부 `READY`·전체 판정 `GO`, PR #10 main 병합 완료) · SPEC-PILOT-LAUNCH-001(프로덕션 사용자 노출 문구 정리, 최초 운영 계정 발급 절차 문서화 — PR #11 main 병합 완료(squash 커밋 `bc289ad`), 3-phase close(`14a6394`)) · SPEC-PILOT-OPS-001(README/product.md 문서 현행화, 최초 운영 계정 발급 계획, 프로덕션 단일 계정 스모크 체크리스트 + 테넌트 격리 게이트, 파일럿 3단계 롤아웃 + 성공지표 집계 계약, Gemini 하이브리드 라우팅 쿼터 운영 계획을 담은 신규 운영 문서 `pilot-ops-launch-plan.md` 작성 — 코드 변경 없음) · SPEC-CASE-PROGRESS-001(사건 입력 대기 화면에 정적 4단계 분석 진행 안내 추가 — 백엔드/폴링 상수 무변경) · SPEC-SIDEBAR-NAV-001(사이드바 "전문가 피드백" 항목 아이콘을 `CornerDownRight`로 교체 + 활성 링크 `aria-label` 추가 — 인페이지 앵커 이동임을 시각적으로 구분, 순수 프레젠테이션 전용) — 모두 `.moai/specs/<SPEC-ID>/spec.md`의 `status: completed`로 확인 가능합니다.

B2C 전환 이후로는 SPEC-B2C-FOUNDATION-001(B2B 코드 정리 + `app/`을 B2C 최소 공개 진입점으로 전환 — PR #15 main 병합, `status: completed`)과 SPEC-B2C-DIAGNOSIS-001(01 진단 플로우 10화면 구현 + 결정론적 시각 정합성 게이트 — 플래그 뒤 구현, 기본 출력은 placeholder 유지 — PR #17 구현 병합 + PR #18 3-phase close, `status: completed`)이 모두 완료됐습니다.

### 후속 개발 (파일럿 데이터 확보 이후)

- **Netlify 프로덕션 배포 확정**: 프로덕션 배포 URL은 `https://musical-macaron-82feb3.netlify.app`, 배포 SHA는 `381e38d`(이 시점 기준 — 사용자가 Netlify 대시보드에서 직접 확인한 값이며, main에 새 커밋이 push되면 전진합니다)로 확정됐습니다. 다만 GitHub commit-status/deployments API로는 이 배포를 여전히 독립 검증할 수 없습니다(사용자 직접 확인과 API 독립 검증은 별개 사실입니다). PR #10은 main에 병합됐지만(merge commit `d74ece4`), 연결된 사이트(`musical-macaron-82feb3`)를 장기 프로덕션 사이트로 채택하고 main 병합 시 프로덕션 자동 배포를 사용할지는 아직 결정되지 않았습니다.
- **로그인 rate-limiting 하드닝**: 프로덕션 수준의 인증 하드닝
- **Gold Dataset 추출·집계 도구**: SPEC-FEEDBACK-001로 마련된 `feedback` 테이블(전체 평가·누락 쟁점·주장별/근거자료별 verdict·선택적 실제 결과)의 원시 행을 실제 골드 데이터셋으로 추출·가공하는 도구와 관리자 통계 뷰
- **PostgreSQL 마이그레이션 실행**: Drizzle ORM 뒤에서 이전 가능한 구조는 유지하되, 실제 마이그레이션은 미실행
- **대규모 evidence corpus 확장**: 실제 판례·법령·분쟁사례 대량 수집(현재 21건은 프로덕션 규모 대비 소규모)
- **담보 영역 확장**: 상해후유장해·질병후유장해 외 담보 영역(질병사망, 실손의료비 등)

이 4가지(정식 배포 자동화·rate-limiting·Gold Dataset·PostgreSQL/evidence/담보 확장)는 SPEC-PILOT-READY-001이 남기는 **파일럿 실측 데이터가 존재해야 다음 우선순위를 판단할 수 있는** 순서로 이어집니다 — ①대표 사례 표본에 대한 실 Gemini 기반 코퍼스 품질 평가(`counterEvidenceIds`가 항상 빈 배열인 현상의 원인 규명 등) → ②사용자별 완료/피드백 집계 → ③Gold Dataset 추출, 순으로 각 단계는 이전 단계의 파일럿 데이터를 전제로 합니다.

자세한 배경과 로드맵은 [`.moai/project/product.md`](.moai/project/product.md) §Roadmap과 [`.moai/specs/SPEC-SCAFFOLD-001/spec.md`](.moai/specs/SPEC-SCAFFOLD-001/spec.md) §4를 참고하세요.
