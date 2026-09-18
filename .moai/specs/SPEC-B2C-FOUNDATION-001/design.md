# SPEC-B2C-FOUNDATION-001 — Design (삭제/재사용/보존 매트릭스 + 목표 구조)

증거 출처는 `research.md`를 인용한다. 이 문서는 그 증거로부터 내린 **분류 결정**과 **목표 구조 스케치**를 담는다.

## §1. 삭제/재사용/보존 매트릭스

범례: **DELETE** = B2B 전용, 삭제 대상 / **REUSE** = B2C에서도 그대로 재사용 / **REUSE-MOD** = 재사용하되 내용 수정 필요(패턴은 유지) / **PRESERVE** = 재사용 여부 미결정, 이번 SPEC에서는 손대지 않고 보존.

### `app/`

| 경로 | 분류 | 근거 |
|---|---|---|
| `app/page.tsx`(+test) | DELETE | 세션 유무로 `/cases/new`↔`/login` 리다이렉트만 수행(research.md §3) — B2C 01 화면(질문 입력)이 이 경로를 대체. `app/page.test.tsx` 공존 확인(Bash `ls`) |
| `app/login/*` (layout, page, login-form + test) | DELETE | Better Auth 로그인 UI. B2C는 로그인 없음(research.md §6) |
| `app/cases/**` (전체 — `[caseId]/*`, `new/*`, `app-shell-chrome.tsx`, `case-shell-nav.tsx`, `case-shell-topbar.tsx`, `sidebar-user-block.tsx`, `layout.tsx` 등, 하위 모두) | DELETE | B2B 사건 입력/리서치 리포트/사이드바 UI. `research.md` §3/§4의 인증·파이프라인 결합이 이 트리 전체에 스며 있음 |
| `app/not-found.tsx` (+test) | REUSE | `components/exception-panel.tsx`를 사용하는 일반 404 — B2B 문구 없음(범용). 단 표시 문구는 후속 SPEC에서 검토 |
| `app/layout.tsx` | REUSE-MOD | 구조(Geist 폰트, html/body 래퍼)는 범용이나, `metadata.title`/`description`이 "리서치 어시스턴트" 문구로 B2B 지향적(research.md §"app/layout.tsx" Read 결과) — 문구만 교체 |
| `app/favicon.ico` | REUSE | 실측(Bash `file`): MS Windows 아이콘 리소스(16×16/32×32, 32bpp) — B2B 도메인 로직이나 텍스트를 담지 않는 정적 바이너리 자산. 브랜드 파비콘 교체가 필요하면 후속 SPEC에서 별도 판단(이 SPEC은 자산 내용을 바꾸지 않음) |
| `app/globals.css` | REUSE | 실측(Read): Tailwind 베이스(`@import "tailwindcss"`)+`tw-animate-css`+`shadcn/tailwind.css`+디자인 토큰(`@theme inline` 블록, sidebar 색상 변수 등) — `app/layout.tsx`(REUSE-MOD)가 import하는 전역 스타일시트. 사이드바 색상 변수처럼 B2B 전용 컴포넌트만 쓰는 토큰이 섞여 있을 수 있으나 파일 전체가 B2B 전용은 아님 — 불필요해진 토큰 정리는 후속 SPEC 범위 |
| `app/api/auth/[...all]/route.ts` | DELETE | Better Auth catch-all. `lib/auth/` DELETE 결정에 종속 |
| `app/api/cases/**` (`route.ts`, `status/route.ts` + test) | DELETE | B2B 파이프라인 트리거/상태 폴링 API. `after()` 백그라운드 처리(research.md §4)가 `lib/cases/create-case.ts`에 결합 |

### `components/`

| 경로 | 분류 | 근거 |
|---|---|---|
| `components/evidence-item.tsx` (+test) | DELETE | B2B 근거자료 표시 전용 컴포넌트, `evidence` 테이블 형태에 결합 |
| `components/exception-panel.tsx` | REUSE | `app/not-found.tsx`(REUSE)가 소비, `app/cases/[caseId]/not-found.tsx`(DELETE)에서도 쓰이지만 컴포넌트 자체는 범용 예외 패널(research.md §"exception-panel 사용처" grep 결과) |
| `components/ui/*` (button, calendar, card, chip, date-picker, input, label, notice, popover, status-badge, textarea) | REUSE | shadcn/ui 프리미티브. B2B 도메인 로직 없음(`tech.md` "Tailwind+shadcn 재사용 가능" 전제와 일치) |

### `lib/auth/`

| 경로 | 분류 | 근거 |
|---|---|---|
| `client.ts`, `config.ts`(+test), `session.ts`(+test), `session-cookie.ts`(+test) | DELETE | `research.md` §3 — 전체가 `/cases`·`/api/cases` 보호에만 결합. B2C는 "회원가입·로그인 없이 접근"이 확정 설계 원칙(`design/MIGRATION-PLAN.md`). `structure.md`는 "재사용 여부 미결정"이라 적었으나, B2C 어떤 화면도 로그인을 요구하지 않으므로 실제 소비처가 없다 — DELETE로 확정하되, 향후 운영자 대시보드 등 신규 요구가 생기면 그때 새로 설계한다(재사용이 아니라 재설계) |

### `lib/validation/`

| 경로 | 분류 | 근거 |
|---|---|---|
| `case-input.ts`(+test) | DELETE(패턴은 참고) | B2B 사건 입력 필드(`incidentDescription`/`diagnosisName`/`disabilityBodyPart`/`incidentDate`) 형태에 결합. PII 차단 정규식(주민등록번호·전화번호 형식 거부) 자체는 03 리드 폼을 제외한 01/02 신규 검증 스키마 작성 시 **참고 패턴**으로 재사용할 가치가 있다(`tech.md` § PII 정책 예외가 이미 이렇게 명시) — 코드 재사용이 아니라 패턴 참고이므로 매트릭스는 DELETE로 분류하고 후속 SPEC 작성 시 이 파일의 git 이력을 참고하도록 plan.md에 기록 |

### `lib/ai/`

| 경로 | 분류 | 근거 |
|---|---|---|
| `provider.ts`(+test), `provider-factory.ts`(+test), `providers/gemini.ts`(+test), `providers/deterministic.ts`(+test), `rate-scheduler.ts`(+test) | REUSE | `research.md` §4 — `LLMProvider` 인터페이스가 파이프라인 전용 타입을 참조하지 않는 순수 추상화. 담보 매칭이 AI 경로를 택하든(미결정) 택하지 않든, 이 계층 자체는 손상 없이 재사용 가능 |

### `lib/cases/`

| 경로 | 분류 | 근거 |
|---|---|---|
| `analysis-stages.ts`, `create-case.ts`(+test), `get-case-for-owner.ts`(+test), `get-recent-cases-for-owner.ts`(+test), `job-timing.ts`(+test) | DELETE | `ownerUserId`(인증 종속) + `cases`/`caseJobs`/`reservations` 스키마(B2B 전용) + `lib/pipeline`(PRESERVE, §4 decision gate) 호출에 전부 결합 |

### `lib/db/`

| 경로 | 분류 | 근거 |
|---|---|---|
| `client.ts`(+test) | REUSE | Turso/libSQL 클라이언트 초기화 — 테이블 무관 범용 |
| `schema.ts`(+test) | PRESERVE(파일 자체 불변) | `research.md` §2 — 11개 테이블 전부 FK로 얽혀 있어 개별 DROP 불가. 이 SPEC은 스키마 파일을 수정하지 않는다(REQ-B2CFOUND-006). B2C 신규 테이블은 **이 파일에 추가하는 형태**(같은 Drizzle 모듈)로 후속 SPEC이 확장하되, 기존 export는 건드리지 않는다 |

### `lib/pipeline/` (+ `lib/pipeline-gemini-boundary.test.ts`)

| 경로 | 분류 | 근거 |
|---|---|---|
| 전체(`index.ts`, `case-normalizer.ts`, `query-planner.ts`, `evidence-retriever.ts`, `researcher.ts`, `skeptic.ts`, `verifier.ts`, `hybrid-research-router.ts`, `boundary.ts`, `labels.ts`, `types.ts` 등, 모든 test 포함) | **PRESERVE — §4 Decision Gate** | REQ-B2CFOUND-007. `research.md` §4 — 타입 계약(`CoverageDomain`, `QueryIssueType`)이 B2B "상해/질병 후유장해 2영역" 도메인에 결합돼 있어 그대로 재사용 불가하지만, Researcher/Skeptic/Verifier의 AI 호출·검증 로직 자체는 담보 매칭에 재활용될 여지가 `tech.md`에 이미 기록돼 있다. 삭제·추출 어느 쪽도 이 SPEC에서 결정하지 않는다 |

### `lib/feedback/`, `lib/logging/`, `lib/observability/`

| 경로 | 분류 | 근거 |
|---|---|---|
| `feedback/schema.ts`(+test), `feedback/submit-feedback.ts`(+test) | DELETE | B2B 전문가 피드백 저장, `feedback` 테이블(reportId FK)에 결합, B2C에 대응 화면 없음 |
| `logging/safe-error.ts`(+test) | REUSE | 화이트리스트 메타데이터만 추출하는 범용 안전 로깅 유틸 — 도메인 결합 없음 |
| `observability/gemini-fetch-observer.ts`(+test), `observability/gemini-observation-store.ts` | PRESERVE — `lib/pipeline/` decision gate에 결합 | Gemini 호출 자체를 관측하는 계층이라 `lib/ai/`(REUSE)와도 맞닿아 있지만, 현재 유일한 소비처가 `app/api/cases/route.ts`(DELETE)다. 02 화면이 AI 경로를 택하면 재사용, 정적 규칙을 택하면 불필요 — §4 decision gate와 함께 판단 |

### `lib/env.ts`(+test), `lib/utils.ts`

| 경로 | 분류 | 근거 |
|---|---|---|
| `env.ts` | REUSE-MOD | `research.md` §5 — 스코프 기반 검증 패턴은 범용이나 `REQUIRED_BY_SCOPE` 매트릭스의 `BETTER_AUTH_*` 요구가 `lib/auth/` DELETE 결정과 함께 갱신돼야 한다. 이 SPEC은 내용을 바꾸지 않는다 — 후속 삭제 milestone의 영향 범위로만 기록 |
| `utils.ts` | REUSE | Tailwind `cn()` 등 범용 헬퍼(추정 — 파일명·프로젝트 관례 기준. 내용 상세 Read는 수행하지 않음, 신뢰도 중간) |

### `db/`

| 경로 | 분류 | 근거 |
|---|---|---|
| `migrations/*.sql`, `migrations/meta/*` | PRESERVE(불변) | REQ-B2CFOUND-006 — 마이그레이션 이력은 어떤 milestone에서도 수정·삭제하지 않는다. 근거는 `lib/db/` 행과 동일하다: 11개 테이블 전부가 FK로 얽혀 있어(research.md §2) 개별 DROP이 불가능하므로, 그 이력을 만든 마이그레이션 파일 자체도 보존 대상이다 |
| `seed/evidence*.json`, `seed/evidence-seed-schema.ts`(+test), `seed/evidence.test.ts`, `seed/evidence-fabrication-guard.test.ts` | PRESERVE — `lib/pipeline/` decision gate에 결합 | `evidence` 테이블 seed 데이터. `lib/pipeline/`의 evidence-retriever가 유일한 소비처 — 파이프라인 운명이 결정되기 전까지 함께 보존 |

### `e2e/`

| 경로 | 분류 | 근거 |
|---|---|---|
| `auth.setup.ts`, `auth.spec.ts` | DELETE | Better Auth 전용(`lib/auth/` DELETE에 종속) |
| `case-flow.spec.ts`, `case-input-mobile-layout.spec.ts`, `capture-evidence.spec.ts`, `capture-evidence-round5.spec.ts`, `mobile-drawer-focus.spec.ts`, `sidebar-sticky.spec.ts`, `tenant-isolation.spec.ts` | DELETE | 전부 `app/cases/*`(DELETE) 화면·컴포넌트를 대상으로 하는 시나리오 |
| `comparison-docs-images.spec.ts` | DELETE(중신뢰도) | `research.md` §4 — SPEC-UI-MIGRATION-001의 비교 HTML(`docs/evidence/SPEC-UI-MIGRATION-001/*.html`, 구 B2B Pencil 디자인 비교 증거)을 검증하는 회귀 테스트. 대상 HTML 파일 존재 자체는 재확인하지 않음(research.md §8 Gap) |
| `helpers.ts` | DELETE(패턴은 참고) | `lib/db/schema.ts`에 직접 접속해 DB 단언을 수행하는 공용 헬퍼(research.md §4 Read 결과). 소비처(위 시나리오들)가 전부 DELETE되므로 그 자체로는 죽은 코드가 되나, "Playwright 테스트에서 직접 DB 접속해 단언" 패턴은 B2C E2E 작성 시 참고할 가치가 있음 |
| `sidebar-assertions.ts`, `storage-state-paths.ts` | DELETE | 사이드바(B2B UI)·인증 storageState(Better Auth) 전용 |

### `scripts/`

| 경로 | 분류 | 근거 |
|---|---|---|
| `cli-bootstrap.ts`(+test) | REUSE | `.env.local` 로더 패턴, `lib/env.ts`의 scope 검증과 함께 쓰이는 범용 부트스트랩 |
| `db-migrate.ts`(+test) | REUSE | 마이그레이션 실행기 자체는 테이블 무관 |
| `db-seed.ts`(+test) | PRESERVE — evidence seed에 결합 | 현재는 `evidence` 테이블만 시딩. `lib/pipeline/` decision gate와 함께 판단 |
| `e2e-tester-emails.ts` | DELETE | Better Auth 테스터 프로비저닝 지원 |
| `env-local-safety.ts`(+3 test 파일) | REUSE | `.env.local` 오염 방지 가드, 도메인 무관 |
| `measure/capture-login.mjs`, `measure/login-pixel-compare.mjs` | DELETE | 로그인 화면 시각 회귀 측정(Better Auth `login/` 전용) |
| `playwright-config-static.test.ts` | REUSE | `research.md` §4 — `playwright.config.ts` 구조를 정적 검사(파일 존재/문자열)하는 범용 테스트. 주석의 AC-RUNTIME 참조는 낡아지지만 검사 로직 자체는 유효 |
| `provision-tester.ts`(+test) | DELETE | `allowedTesters` 프로비저닝(Better Auth 전용) |
| `run-e2e.ts`(+test) | REUSE-MOD | E2E 러너 패턴은 범용이나, `LLM_PROVIDER_MODE=deterministic` 주입 등 일부 환경 설정이 B2B 시나리오 가정을 담고 있어 후속 milestone에서 재검토 필요 |

### 루트 파일

| 경로 | 분류 | 근거 |
|---|---|---|
| `proxy.ts`(+`proxy.test.ts`+`proxy.import-graph.test.ts`) | DELETE(내용) | `PROTECTED_PATH_PATTERNS`가 `/cases`·`/api/cases`만 가드(research.md §3). B2C에 보호 대상 경로가 없으면 Next.js 16에서 `proxy.ts` 자체가 불필요 — M4에서 제거 여부를 재확인(§3 decision gate로 별도 유지, 완전 제거 vs 빈 가드로 대기는 milestone 시점에 결정) |
| `instrumentation.ts`(+test) | REUSE-MOD | 부팅 시점 `validateEnv("app")` fail-fast 패턴은 범용이나, `lib/env.ts`(REUSE-MOD)의 `app` 스코프 매트릭스가 바뀌면 함께 영향받는다 |

## §2. 목표 B2C 라우트·모듈 구조 (제안 — 후속 SPEC에서 확정)

`design/MIGRATION-PLAN.md` §2/§4(Desktop/Mobile은 별도 라우트가 아니라 반응형 UI 공유)와 `structure.md` § 목표 구조 제안을 통합한다. B2B 라우트가 삭제되므로(§1) 별도 라우트 그룹 없이 `app/` 루트를 그대로 사용한다(Enforce Simplicity — 불필요한 `(diagnosis)` 그룹 신설 회피, `structure.md`도 동일하게 제안):

```
app/
├── layout.tsx                # [REUSE-MOD] metadata만 교체
├── page.tsx                  # [신규, 후속 SPEC] 01 질문 입력 — 검색창 + 자주 찾는 사례 칩
│                              #   내부 상태: idle → (진단 시작 동의 모달/시트) → 추가 질문 → 진단 중 → (결과 없음 | 분석 오류 | 02로 전환)
├── result/
│   └── page.tsx               # [신규, 후속 SPEC] 02 보상 진단 결과 — 4카테고리 그리드(Desktop 전체 펼침/Mobile 단일 탭)
└── consult/
    └── page.tsx               # [신규, 후속 SPEC] 03 상담 신청 — 카톡/전화 선택 → 상담 동의 → (접수 성공|중복|실패)

app/api/
├── diagnosis/                 # [신규, 후속 SPEC] 담보 매칭 트리거 API — §4 decision gate 이후 구현
└── leads/                     # [신규, 후속 SPEC] 03 리드 폼 제출 API

lib/
├── coverage/                  # [신규, 후속 SPEC] 담보 매칭 로직 — lib/pipeline/과 별도 모듈(입출력 형태가 다름)
└── validation/
    └── lead-input.ts          # [신규, 후속 SPEC] 03 전용 PII 예외 스키마 — case-input.ts 삭제 전 정규식 패턴 참고(§1)

db/
└── (신규 테이블 후보)          # [미결정, 후속 SPEC] 진단 결과/담보 매칭 데이터/리드 레코드 — lib/db/schema.ts에 추가(기존 export 불변)
```

이 구조는 `structure.md` § 목표 구조가 이미 제안한 스케치를 그대로 채택하되, 라우트 그룹(`(diagnosis)`) 없이 `app/` 루트로 단순화한 점만 다르다 — B2B가 완전 대체(병존 아님)로 확정됐으므로 이름 충돌을 피할 그룹이 불필요하기 때문이다.

## §3. 02→03 연결 및 모바일 결여 화면 — Decision Gate

두 항목은 이번 SPEC에서 결정하지 않고 `[NEEDS CLARIFICATION]`으로 남긴다(REQ-B2CFOUND-012):

- **[NEEDS CLARIFICATION: 02→03 진단 결과 ID 연결 방식]** — `design/MIGRATION-PLAN.md` §7이 "동일 진단 결과 ID 또는 동일 연락처"로 서버가 중복을 판정한다고 명시하므로 "진단 결과 ID"라는 개념 자체는 필요하다. URL param(`/result/[diagnosisId]` → `/consult?ref=[diagnosisId]`) vs 서버 세션/쿠키 중 어느 방식을 쓸지는 신규 DB 테이블 설계(Out of Scope)와 함께 후속 SPEC에서 결정한다.
- **[NEEDS CLARIFICATION: 모바일 M01-D/M01-E 부재 처리]** — Desktop `01-D`(결과 없음)/`01-E`(분석 오류)에 대응하는 모바일 디자인이 아직 없다(`design/MIGRATION-PLAN.md` §9). 01/02/03 구현 SPEC 착수 전 디자인 완성을 기다릴지, Desktop 레이아웃을 반응형으로 임시 재사용할지는 디자인 담당자 확인이 필요하다 — 이 SPEC의 범위 밖이다.

## §4. `lib/pipeline/` 처리 — Decision Gate 상세 (REQ-B2CFOUND-007)

- **폐기 확정**: `lib/pipeline/index.ts`의 오케스트레이션 자체(6단계 순차 실행, B2B 사건 리서치 리포트 생성 흐름)와 `app/api/cases/route.ts`가 이를 트리거하는 경로는 `app/cases/*` 삭제와 함께 폐기된다 — 이 부분은 decision gate가 아니라 §1 DELETE로 이미 확정됨(진입점인 `app/api/cases/`와 `lib/cases/create-case.ts`가 DELETE이므로 오케스트레이터의 유일한 정상 호출부가 사라짐).
- **보존 확정 후 재검토 대상**: `lib/pipeline/researcher.ts`/`skeptic.ts`/`verifier.ts`가 구현하는 "AI 호출 + 구조화 출력 검증 + 반론 생성" 로직 자체는 `lib/ai/provider.ts` 인터페이스(REUSE)에만 의존하며 `CaseInput` 특정 필드에 직접 결합돼 있지 않다(design.md 작성 시점 코드 형태 관찰 기준) — 담보 매칭이 AI 경로를 택할 경우(`tech.md` 옵션 2) 이 세 모듈의 검증 패턴을 참고해 새 모듈(`lib/coverage/`)로 재작성할 여지가 있다. **재사용이 아니라 "참고해 새로 작성"** — 그대로 import하는 것은 타입 계약(§1 근거)이 다르므로 불가능하다.
- **삭제 시점**: `lib/pipeline/` 전체(및 `db/seed/evidence*`)의 실제 삭제 여부·시점은 담보 매칭 로직 결정(`tech.md` § 담보 매칭 로직 — 미결정 사항)이 후속 SPEC에서 내려진 뒤에만 판단한다 — 이 SPEC의 plan.md는 어떤 milestone에서도 `lib/pipeline/`을 건드리지 않는다.
