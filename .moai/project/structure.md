# 프로젝트 구조

> 최종 수정: 2026-09-22 (SPEC-B2C-RESULT-001 M6 — ② 보상 진단 결과(02)
> 구현 완료 반영. `app/result/page.tsx`·`components/result/*`(11개
> 컴포넌트)·`lib/diagnosis/`(types·schema·aggregate·handoff·flags·
> fixtures/fracture-case)가 신설됐다 — 아래 § 목표 구조가 제안했던
> `app/(diagnosis)/result/page.tsx`·`lib/coverage/` 경로는 채택되지
> 않았고, SPEC-B2C-DIAGNOSIS-001(01)이 먼저 확정한 `app/page.tsx`
> 루트 직속 배치(별도 라우트 그룹 없음) + `lib/diagnosis/` 네이밍을
> 02가 그대로 이어받았다. § 현재 구조(실측) 트리 자체의 전면 재작성은
> 이 개정에 포함하지 않는다(잔여 위험 — main 브랜치의
> SPEC-B2C-DIAGNOSIS-001 문서 동기화와 함께 후속 정리 필요). 이전
> 개정: 2026-09-18 (SPEC-B2C-FOUNDATION-001 M6) — § 현재 구조를
> M1-M5 삭제 실행 결과에 맞춰 재작성. `app/cases/*`·`app/login/*`·
> `app/api/**`·`lib/auth/`·`lib/cases/`·`lib/feedback/`·
> `components/evidence-item.*`·`proxy.ts`·`e2e/`는 삭제되어 트리에서
> 제거했고, `lib/pipeline/`(+observability/seed)은 decision gate 보존,
> `lib/validation/case-input.ts`는 편차로 보존 상태임을 명시했다. §
> 목표 구조(제안, 미구현)와 § 공존 관계 요약 표도 함께 갱신했다. 이전
> 개정: 2026-09-18 문서 정합성 보정 — "3화면"으로 남아 있던 표현을
> 실제 디자인 현황에 맞게 정정. 큰 제품 흐름은 01/02/03 3단계 퍼널이
> 맞지만, 실제 사용자용 디자인은 상태 변형을 포함해 Desktop 12개 +
> Mobile 12개 = 24개이며, 사용자 화면이 아닌 DEV ONLY 내부 자료가
> 4개 별도로 존재한다 — 상세: `design/MIGRATION-PLAN.md`. 그 이전 개정:
> 2026-09-17 디자인 피벗 반영 — 이 문서는 더 이상 "제안 — Greenfield
> Plan"이 아니다. 아래 § 현재 구조(실측)는 실제 코드베이스를 Glob/Read로
> 관찰한 결과다. B2C 새 화면(01/02/03)에 해당하는 코드는 아직 존재하지
> 않으며, 그 부분은 § 목표 구조(제안, 미구현)에 별도 표시했다. 이전
> 개정: 2026-08-25 SPEC-RUNTIME-001 후속)

## 이 문서의 구조

이번 피벗으로 "현재 구현된 것"과 "목표로 하는 것"이 갈라졌기 때문에, 이
문서는 두 절로 나눈다.

- **§ 현재 구조 (실측, B2B 방향)** — 실제로 존재하고 동작하는 코드.
  `git status` 기준 clean 상태의 실제 디렉터리 트리를 반영한다.
- **§ 목표 구조 (제안, B2C 방향, 미구현)** — `design/MIGRATION-PLAN.md`가
  정의한 3단계 퍼널(01 질문 입력 → 02 보상 진단 결과 → 03 상담 신청)과
  그 24개 디자인 상태(Desktop 12 + Mobile 12; DEV ONLY 내부 자료 4개는
  별도이며 구현 대상이 아님)를 구현할 때 어디에 위치할 가능성이 높은지의
  **문서 수준 스케치**다. 코드가 아직 없으므로 **as-built 주장이
  아니다** — 확정이 아니라 제안이다.

## § 현재 구조 (실측)

```
bosang-radar/
├── app/                        # Next.js App Router — B2C 최소 공개 진입점(placeholder)
│   ├── layout.tsx
│   ├── page.tsx                # B2C 정적 placeholder("서비스 준비 중") — 로그인/세션 의존성 없음
│   ├── page.test.tsx
│   ├── not-found.tsx
│   ├── not-found.test.tsx
│   ├── globals.css
│   ├── favicon.ico
│   └── api/                    # 라우트 핸들러 전부 삭제 — 빈 디렉터리로만 남음
│
├── components/
│   ├── exception-panel.tsx
│   └── ui/                     # shadcn/ui 기반 컴포넌트
│
├── lib/
│   ├── validation/              # case-input.ts — 계획 대비 편차로 보존(§lib/validation/ 참고)
│   ├── ai/
│   │   └── providers/           # AI provider abstraction + Gemini adapter
│   ├── db/                     # Turso/libSQL 클라이언트 + Drizzle 스키마
│   ├── pipeline/                # 리서치 파이프라인 6단계 — decision gate로 보존
│   ├── logging/                 # 구조적 로깅
│   ├── observability/           # gemini-fetch-observer·gemini-observation-store — 보존
│   ├── env.ts                   # 환경변수 검증(BETTER_AUTH_* 요구 제거)
│   └── utils.ts
│
├── db/
│   ├── migrations/              # Drizzle Kit 마이그레이션 (meta/ 포함) — 변경 없음
│   └── seed/                    # seed evidence 데이터 — 보존
│
├── scripts/                     # 런타임 활성화 CLI (B2B 전용 스크립트 삭제됨)
│   ├── cli-bootstrap.ts
│   ├── db-migrate.ts / db-seed.ts / run-e2e.ts
│   └── env-local-safety.ts
│
├── public/                      # 정적 자산
│
├── design/                      # 신규 B2C 디자인 소스 (코드 아님, § 목표 구조 참고)
│   ├── claimradar-ui.pen        # Pencil 디자인 파일 (SSOT)
│   ├── exports/                 # 화면별 PNG 내보내기(01/02/03)
│   └── MIGRATION-PLAN.md        # B2C 피벗 디자인 문서
│
├── .moai/                       # MoAI-ADK 프로젝트 메타 (SPEC, 설정, 문서)
│
├── instrumentation.ts            # Next.js 부팅 시점 환경변수 fail-fast 훅
├── playwright.config.ts
├── drizzle.config.ts
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json                 # strict 모드
├── package.json                  # better-auth 의존성·tester:add 스크립트 제거됨
└── .env.local                    # Turso/Gemini 시크릿 (커밋 금지)
```

> `app/cases/`·`app/login/`·`app/api/auth/`·`app/api/cases/`·`lib/auth/`·
> `lib/cases/`·`lib/feedback/`·`components/evidence-item.*`·`proxy.ts`·
> `e2e/`는 SPEC-B2C-FOUNDATION-001 M1-M5에서 삭제되어 이 트리에 더 이상
> 없다 — 상세는 § 삭제된 디렉터리·파일 참고.

## § 디렉터리별 목적 (현재 구조)

### `app/` — B2C 최소 공개 진입점 (placeholder)
Next.js App Router 라우트 트리. 현재 실질적인 라우트는 `app/page.tsx`
하나뿐이며, SPEC-B2C-FOUNDATION-001 M2에서 기존 B2B 세션 리다이렉트를
정적 placeholder("서비스 준비 중")로 교체했다 — 세션/인증 의존성이 없는
서버 컴포넌트다. `app/api/`는 라우트 핸들러가 전부 삭제되어 빈
디렉터리로만 남아 있다. `app/layout.tsx`·`app/not-found.tsx`는
B2B/B2C 어느 쪽에도 종속되지 않는 공통 골격이라 이번 SPEC에서 변경하지
않았다.

### `lib/validation/` — PII 입력 차단 (계획 대비 편차로 보존)
`case-input.ts`는 design.md §1에서 삭제 대상으로 분류됐으나,
`lib/pipeline/types.ts`가 이 파일의 `CaseInput` 타입을 import하는
실제 의존성이 M4 실행 중 발견되어 — `lib/pipeline/` 보존 결정
(REQ-B2CFOUND-007)을 위반하지 않기 위해 함께 보존됐다(상세:
`.moai/specs/SPEC-B2C-FOUNDATION-001/progress.md` M4). B2C 03
화면(상담 신청)은 이 스키마를 그대로 재사용할 수 없으므로 새 스키마가
필요하다(§ 목표 구조, `tech.md` 참고).

### `lib/ai/` — AI Provider Abstraction
`lib/ai/provider.ts`에 공통 인터페이스, `lib/ai/providers/gemini.ts`가
구현체. B2C 02 화면의 담보 매칭 로직이 이 인터페이스를 재사용할지는
미결정(`tech.md` § 담보 매칭 로직 — 미결정 사항 참고). 변경 없음.

### `lib/db/` + `db/` — DB 계층
Drizzle ORM을 유일한 DB 접근 경로로 둔다. Turso/libSQL 클라이언트
초기화(`lib/db/client.ts`)와 스키마 정의(`lib/db/schema.ts`). 이번
SPEC은 스키마를 전혀 변경하지 않았다(REQ-B2CFOUND-006). B2C
흐름(리드 데이터, 담보 매칭 데이터)이 새 테이블을 필요로 할 가능성이
높으나, 스키마 설계는 후속 SPEC 범위다.

### `lib/pipeline/` + `lib/observability/` + `db/seed/` — 보존 (decision gate)
사건 입력 → CaseNormalizer → QueryPlanner → Evidence Retriever →
Researcher → Skeptic → Verifier → Research Report의 6단계 리서치
파이프라인과 그 관측(`gemini-fetch-observer.*`,
`gemini-observation-store.ts`), seed evidence 데이터(`db/seed/evidence*`)는
담보 매칭 알고리즘이 정적 규칙 기반인지 이 파이프라인/Gemini
재활용인지 결정되기 전까지 의도적으로 손대지 않는다(REQ-B2CFOUND-007,
design.md §4 decision gate) — 후속 SPEC이 재검토한다. B2C 02 화면의
"담보 매칭"은 사건 리서치가 아니라 규칙/AI 매칭이라 성격이 다르므로,
직접 재사용을 가정하지 않는다.

### `scripts/` — 런타임 활성화 계층 (B2B 전용 스크립트 삭제됨)
`scripts/`는 Next.js 서버 프로세스 바깥에서 독립 실행되는 CLI(DB
마이그레이션/시드/E2E 구동)만 남았다. Better Auth 테스터 프로비저닝
스크립트(`provision-tester.ts`, `e2e-tester-emails.ts`)와 로그인 화면
시각 측정 스크립트(`measure/`)는 M5에서 삭제됐다(대상 기능인 Better
Auth·로그인 화면이 이미 삭제됐기 때문) — `scripts/run-e2e.ts`에 남아
있던 이 스크립트들에 대한 참조(import·`provisionTester(...)` 호출)도
함께 제거했다. `e2e/` 디렉터리는 Playwright 시나리오 13개 전체가
삭제되어 더 이상 존재하지 않는다. B2C 새 화면이 구현되면 신규
시나리오가 추가될 것으로 예상되나, 현재는 아무 시나리오도 없다.

### `design/` — B2C 디자인 소스 (신규, 이번 피벗에서 추가)
`design/claimradar-ui.pen`이 새 B2C 3단계 퍼널(01/02/03)과 그 24개
디자인 상태(Desktop 12 + Mobile 12)의 디자인 SSOT다(Pencil MCP 도구로만
열람 가능 — Read/Grep 대상 아님). `design/exports/*.png`는 그 24개
사용자 화면을 Pencil에서 내보낸 정적 캡처로, 코드 구현 전 시각적 참고
자료다. `design/internal/*.png`(4개)는 사용자 화면이 아닌 DEV ONLY
내부 자료(운영 전 확정 필요 항목, 동의 상세 구조)이며 구현 대상이
아니다. `design/MIGRATION-PLAN.md`가 디자인 언어·레이아웃·컴포넌트
토큰·폐기 이력을 담은 문서 SSOT다. 변경 없음.

### 삭제된 디렉터리·파일 (SPEC-B2C-FOUNDATION-001 M1-M5 완료)
`app/cases/**`, `app/login/*`, `app/api/auth/[...all]/route.ts`,
`app/api/cases/**`, `lib/auth/**`(Better Auth 기반 접근 제어),
`lib/cases/**`, `lib/feedback/**`, `components/evidence-item.*`,
`proxy.ts`(인증 가드), `e2e/`(Playwright B2B 시나리오 13개 전체),
`scripts/provision-tester.ts`·`scripts/e2e-tester-emails.ts`·
`scripts/measure/`는 전부 삭제 완료됐다. `package.json`의
`better-auth` 의존성과 `tester:add` 스크립트도 함께 제거됐다.
삭제 사유·대체 검증 상세는
`.moai/specs/SPEC-B2C-FOUNDATION-001/progress.md` M3-M5를 참고한다.

## § 목표 구조 (제안, B2C 방향, 미구현)

> **주의**: 이 절은 코드가 아니라 **문서 수준 제안**이다. 실제 구현 시
> 라우트 그룹 이름, 파일 위치는 담당 SPEC에서 재조정될 수 있다.
> **① 01(질문 입력)·② 02(보상 진단 결과)는 이 제안과 다른 실제 경로로
> 이미 구현이 완료됐다** — `app/(diagnosis)/` 그룹 없이 `app/page.tsx`·
> `app/result/page.tsx`를 루트에 직접 두고, `lib/coverage/` 대신
> `lib/diagnosis/`를 썼다(SPEC-B2C-DIAGNOSIS-001, SPEC-B2C-RESULT-001).
> 아래 트리는 ③ 03(상담 신청)이 아직 미구현인 부분에 대해서만 유효한
> 제안으로 남는다.
> 2026-09-17 재확인으로 기존 B2B 코드(`app/cases/*` 등)는 **삭제(완전
> 대체)**로 방향이 확정됐다 — 아래는 삭제 이후를 가정한 스케치이며,
> `(diagnosis)` 같은 별도 라우트 그룹 신설도 삭제 후에는 굳이 필요 없이
> `app/` 루트를 B2C 흐름이 그대로 쓸 수 있다(최종 구조는 담당 SPEC에서
> 확정).

새 B2C 3단계 퍼널(01 질문 입력 → 02 보상 진단 결과 → 03 상담 신청)에
대응하는 코드가 들어갈 가능성이 높은 위치다. 아래 예시는 각 단계의
대표 화면 하나씩만 보여주며, 실제 디자인은 상태 변형을 포함해 각
단계마다 여러 화면(Desktop+Mobile 합쳐 24개)으로 나뉜다 — 전체 목록은
`design/MIGRATION-PLAN.md` §2 참고:

```
app/
└── (diagnosis)/                 # [미구현] 신규 공개 라우트 그룹 — 로그인 불필요
    ├── page.tsx                 # [미구현] 01 질문 입력 (검색창 + 자주 찾는 사례 칩)
    ├── result/
    │   └── page.tsx             # [미구현] 02 보상 진단 결과 (4카테고리 담보 그리드)
    └── consult/
        └── page.tsx             # [미구현] 03 상담 신청 (카톡/전화 선택 + 리드 폼)

app/api/
├── diagnosis/                   # [미구현] 담보 매칭 트리거 API (정적 규칙 vs Gemini 미결정)
└── leads/                       # [미구현] 03 리드 폼 제출 API (이름·연락처 수집)

lib/
├── coverage/                    # [미구현] 담보 매칭 로직 — 4카테고리 규칙/데이터
│   └── categories.ts            # [미구현] 실손의료비/정액담보/후유장해/특별보상 카테고리 정의
└── validation/
    └── lead-input.ts            # [미구현] 03 리드 폼 전용 Zod 스키마 — PII 예외 반영,
                                  #          case-input.ts와 별도로 신설 필요

db/
└── (신규 테이블 후보)            # [미결정] 담보 매칭 데이터, 리드 레코드 — 스키마 설계는 후속 SPEC
```

이 스케치가 반영하는 설계 판단:

- **로그인 불필요 공개 라우트**: B2C 사용자는 회원가입/로그인 없이
  바로 진단을 받는다 (기존 B2B `proxy.ts` 인증 가드 대상이 아니다).
- **`lib/validation/`은 파일을 나누되 디렉터리는 공유**: PII
  최소화(01/02)와 PII 예외(03)가 같은 검증 계층 안에서 스키마별로
  분리되는 편이 원칙의 일관성을 유지하기 쉽다 — 이는 제안이며 최종
  판단은 담당 SPEC의 몫이다.
- **`lib/coverage/`는 `lib/pipeline/`과 별도 모듈**: 리서치 리포트
  생성(B2B)과 담보 매칭(B2C)은 입출력 형태가 다르므로, 같은 디렉터리를
  공유하기보다 새 모듈로 분리하는 편을 제안한다.

## § 공존 관계 요약

| 구분 | B2B (현재 구조) | B2C (목표 구조) |
|---|---|---|
| 상태 | 대부분 삭제 완료(§ 삭제된 디렉터리·파일 참고), `lib/pipeline/`만 decision gate로 보존 | 디자인만 확정, 코드 없음 |
| 인증 | 삭제 완료(Better Auth·`proxy.ts` 가드 모두 제거) | 불필요(공개 접근 전제) |
| PII | `lib/validation/case-input.ts` — 계획 대비 편차로 보존(§lib/validation/ 참고) | 01/02 차단, 03만 예외 허용 |
| 핵심 로직 | `lib/pipeline/` 6단계 리서치 — decision gate로 보존 | [미결정] `lib/coverage/` 담보 매칭 |
| DB | 기존 Turso/Drizzle 스키마(cases 등) — 변경 없음(REQ-B2CFOUND-006) | [미결정] 신규 테이블 필요 여부 |
| 재사용/폐기 | **대부분 삭제 완료**(SPEC-B2C-FOUNDATION-001 M1-M5, 2026-09-18) — `lib/pipeline/`은 담보 매칭 알고리즘 결정 전까지 decision gate로 보존 | — |

## 설계 메모 (보존 중인 B2B 코드에 한정)

- **AI provider abstraction은 필수 경계다.** `lib/ai/provider.ts`의
  인터페이스를 벗어나 Gemini 전용 SDK를 직접 import하는 것을 금지한다.
- **DB 이식성.** 파이프라인·API route 코드는 Drizzle ORM의 쿼리 빌더만
  사용한다.
- **overengineering 방지.** microservice, Kubernetes, 별도 vector DB를
  도입하지 않는다.
- **PII 검증은 파이프라인 진입 이전 단계에서 종료한다** (`lib/pipeline/`
  decision gate가 유지되는 동안 한정).
- ~~접근 제어는 `proxy.ts` + `lib/auth/`로 일원화한다~~ — 두 파일 모두
  SPEC-B2C-FOUNDATION-001 M3에서 삭제됐다(§ 삭제된 디렉터리·파일 참고).
