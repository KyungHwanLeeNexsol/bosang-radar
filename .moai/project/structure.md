# 프로젝트 구조

> 최종 수정: 2026-09-18 (문서 정합성 보정 — "3화면"으로 남아 있던 표현을
> 실제 디자인 현황에 맞게 정정. 큰 제품 흐름은 01/02/03 3단계 퍼널이
> 맞지만, 실제 사용자용 디자인은 상태 변형을 포함해 Desktop 12개 +
> Mobile 12개 = 24개이며, 사용자 화면이 아닌 DEV ONLY 내부 자료가
> 4개 별도로 존재한다 — 상세: `design/MIGRATION-PLAN.md`. 이전 개정:
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
├── app/                        # Next.js App Router 라우트 (B2B 흐름)
│   ├── layout.tsx
│   ├── page.tsx                # 랜딩/사건 입력 진입점
│   ├── login/                  # 초대받은 테스터 로그인 화면
│   ├── cases/
│   │   ├── new/                # 사건 입력 폼
│   │   └── [caseId]/           # 사건 상세 + 리서치 리포트 뷰
│   └── api/
│       ├── auth/                # 인증 콜백/세션 관련 route handler
│       └── cases/              # 사건 생성/파이프라인 트리거 route handler
├── proxy.ts                    # 비로그인 사용자를 /login으로 리다이렉트하는 인증 가드
│
├── components/
│   └── ui/                     # shadcn/ui 기반 컴포넌트
│
├── lib/
│   ├── auth/                   # 인증/세션/allowlist 로직 (Better Auth)
│   ├── validation/              # 입력 검증 스키마 (PII 차단 강제 지점, B2B 전용)
│   ├── ai/
│   │   └── providers/           # AI provider abstraction + Gemini adapter
│   ├── db/                     # Turso/libSQL 클라이언트 + Drizzle 스키마
│   ├── pipeline/                # 리서치 파이프라인 6단계 (B2B 전용)
│   ├── cases/                  # 사건 상태·진행 표시 관련 헬퍼(analysis-stages.ts 등)
│   ├── feedback/                # 전문가 피드백 저장 로직
│   ├── logging/                 # 구조적 로깅
│   └── observability/           # 운영 관측(장애 대응 등)
│
├── db/
│   ├── migrations/              # Drizzle Kit 마이그레이션 (meta/ 포함)
│   └── seed/                    # seed evidence 데이터
│
├── scripts/                     # 런타임 활성화 CLI
│   ├── cli-bootstrap.ts
│   ├── db-migrate.ts / db-seed.ts / provision-tester.ts / run-e2e.ts
│   └── measure/                 # 운영 측정용 스크립트
│
├── e2e/                         # Playwright E2E 시나리오
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
├── package.json
└── .env.local                    # Turso/Gemini/Auth 시크릿 (커밋 금지)
```

## § 디렉터리별 목적 (현재 구조)

### `app/` + `proxy.ts` — B2B 라우트
Next.js App Router 기반 라우트 트리. 사건 입력 폼(`cases/new`), 사건 상세
및 리서치 리포트 조회(`cases/[caseId]`), 파이프라인을 트리거하는 API route
handler(`api/cases`), 로그인 화면(`login/`)으로 구성된다. `proxy.ts`가
모든 `cases/*` 및 `api/cases/*` 요청에 대해 로그인 세션을 확인하고,
비로그인 요청은 `/login`으로 리다이렉트한다.

### `lib/auth/` — 접근 제어 (B2B 전용, 삭제 결정됨)
비공개 파일럿(테스터 10명 내외) 규모에 맞춘 초대 전용 인증. Better Auth +
allowlist 검증. 모든 사건 레코드는 `owner_user_id`로 생성 사용자에게
귀속된다. **B2C 흐름은 로그인을 요구하지 않으므로, 이 모듈은 B2C 새
화면과 직접 관련이 없다** — **삭제 결정됨**(2026-09-17, § 공존 관계 요약
참고). 실행은 `SPEC-B2C-FOUNDATION-001`.

### `lib/validation/` — PII 입력 차단 (B2B 전용, 그대로 유지)
사건 입력 폼/`app/api/cases/` 공용 Zod 스키마가 주민등록번호·전화번호·
상세주소·의료기록 원본 형식을 구조적으로 거부한다. B2C 03 화면(상담
신청)은 의도적으로 연락처를 수집하므로, 이 스키마를 그대로 재사용할 수
없다 — 새 스키마가 필요하다(§ 목표 구조, `tech.md` 참고).

### `lib/ai/` — AI Provider Abstraction
`lib/ai/provider.ts`에 공통 인터페이스, `lib/ai/providers/gemini.ts`가
구현체. B2C 02 화면의 담보 매칭 로직이 이 인터페이스를 재사용할지는
미결정(`tech.md` § 담보 매칭 로직 — 미결정 사항 참고).

### `lib/db/` + `db/` — DB 계층
Drizzle ORM을 유일한 DB 접근 경로로 둔다. Turso/libSQL 클라이언트
초기화(`lib/db/client.ts`)와 스키마 정의(`lib/db/schema.ts`). B2C
흐름(리드 데이터, 담보 매칭 데이터)이 새 테이블을 필요로 할 가능성이
높으나, 스키마 설계는 후속 SPEC 범위다.

### `lib/pipeline/` — 리서치 파이프라인 (B2B 전용, 그대로 유지)
사건 입력 → CaseNormalizer → QueryPlanner → Evidence Retriever →
Researcher → Skeptic → Verifier → Research Report의 6단계. B2C 02 화면의
"담보 매칭"은 이 파이프라인과 성격이 다르다(사건 리서치가 아니라 규칙/AI
매칭) — 직접 재사용을 가정하지 않는다.

### `scripts/` + `e2e/` — 런타임 활성화 계층
`scripts/`는 Next.js 서버 프로세스 바깥에서 독립 실행되는 CLI(DB
마이그레이션/시드/테스터 프로비저닝/E2E 구동). `e2e/`는 Playwright
시나리오. B2C 새 화면이 구현되면 이 계층에 신규 시나리오가 추가될
것으로 예상되나, 현재는 B2B 시나리오만 존재한다.

### `design/` — B2C 디자인 소스 (신규, 이번 피벗에서 추가)
`design/claimradar-ui.pen`이 새 B2C 3단계 퍼널(01/02/03)과 그 24개
디자인 상태(Desktop 12 + Mobile 12)의 디자인 SSOT다(Pencil MCP 도구로만
열람 가능 — Read/Grep 대상 아님). `design/exports/*.png`는 그 24개
사용자 화면을 Pencil에서 내보낸 정적 캡처로, 코드 구현 전 시각적 참고
자료다. `design/internal/*.png`(4개)는 사용자 화면이 아닌 DEV ONLY
내부 자료(운영 전 확정 필요 항목, 동의 상세 구조)이며 구현 대상이
아니다. `design/MIGRATION-PLAN.md`가 디자인 언어·레이아웃·컴포넌트
토큰·폐기 이력을 담은 문서 SSOT다.

## § 목표 구조 (제안, B2C 방향, 미구현)

> **주의**: 이 절은 코드가 아니라 **문서 수준 제안**이다. 실제 구현 시
> 라우트 그룹 이름, 파일 위치는 담당 SPEC에서 재조정될 수 있다.
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
| 상태 | 구현 완료, 15개 SPEC | 디자인만 확정, 코드 없음 |
| 인증 | Better Auth 필수(`proxy.ts` 가드) | 불필요(공개 접근 전제) |
| PII | 전면 차단(`lib/validation/case-input.ts`) | 01/02 차단, 03만 예외 허용 |
| 핵심 로직 | `lib/pipeline/` 6단계 리서치 | [미결정] `lib/coverage/` 담보 매칭 |
| DB | 기존 Turso/Drizzle 스키마(cases 등) | [미결정] 신규 테이블 필요 여부 |
| 재사용/폐기 | **삭제 결정됨** (2026-09-17) — 실사용 테스터 없음 확인, B2C 완전 대체. 실행은 별도 SPEC | — |

## 설계 메모 (B2B, 유지)

- **AI provider abstraction은 필수 경계다.** `lib/ai/provider.ts`의
  인터페이스를 벗어나 Gemini 전용 SDK를 직접 import하는 것을 금지한다.
- **DB 이식성.** 파이프라인·API route 코드는 Drizzle ORM의 쿼리 빌더만
  사용한다.
- **overengineering 방지.** microservice, Kubernetes, 별도 vector DB를
  도입하지 않는다.
- **접근 제어는 `proxy.ts` + `lib/auth/`로 일원화한다** (B2B 흐름 한정).
- **PII 검증은 파이프라인 진입 이전 단계에서 종료한다** (B2B 흐름 한정).
