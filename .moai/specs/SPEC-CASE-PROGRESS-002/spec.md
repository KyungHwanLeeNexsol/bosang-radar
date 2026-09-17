---
id: SPEC-CASE-PROGRESS-002
title: "AI 리서치 대기 화면 — 실 백엔드 진행 신호 기반 퍼센트 진행률 바"
version: "0.1.0"
status: draft
created: 2026-09-17
updated: 2026-09-17
author: Nexsol
priority: P2
phase: "v1.2.0 target"
module: "lib/pipeline/index.ts, lib/db/schema.ts, lib/cases/create-case.ts, app/api/cases/status/route.ts, app/cases/new/case-input-form.tsx"
lifecycle: spec-anchored
tags: "ux, progress-indicator, real-progress, percentage-bar, case-input, pipeline-instrumentation"
tier: L
depends_on: [SPEC-CASE-PROGRESS-001, SPEC-PILOT-READY-001]
related_specs: [SPEC-GEMINI-RUNTIME-001, SPEC-RESEARCH-001, SPEC-UI-MIGRATION-001]
---

## HISTORY

- 2026-09-17: 최초 작성 (manager-spec) — SPEC-CASE-PROGRESS-001이 확정한 "가짜 진행률 금지" 원칙(REQ-CASE-PROGRESS-002/003)을 **명시적으로 반전**하는 SPEC이다. SPEC-CASE-PROGRESS-001은 작성 당시 `app/api/cases/status/route.ts`가 단계별 진행 데이터를 전혀 반환하지 않는다는 사실(직접 소스 확인)을 근거로, 숫자 퍼센트·`role="progressbar"`·애니메이션 진행률 바·개별 단계 완료 표시를 전부 금지했다(REQ-CASE-PROGRESS-003, Unwanted 요구사항). 이번 세션에서 사용자는 이 원칙을 알고 있는 상태로 "진짜 움직이는 퍼센트바"를 명시적으로 요청했으며(AskUserQuestion으로 확인), 이는 SPEC-CASE-PROGRESS-001 당시에는 존재하지 않던 **신규 백엔드 계측**(`lib/pipeline/index.ts`의 `onStageProgress` 콜백 + `case_jobs.progress_stage` 컬럼)을 이번 SPEC이 도입함으로써 가능해진다 — 즉 "실제 데이터가 없어 표시할 수 없다"던 전제 자체가 이번 SPEC의 구현으로 사라진다. `lib/pipeline/index.ts`(6단계 순차 실행: CaseNormalizer→QueryPlanner→EvidenceRetriever→Researcher→Skeptic→Verifier, 에스컬레이션 시 Researcher/Skeptic/Verifier 재실행 가능), `lib/db/schema.ts`(`case_jobs` 테이블에 단계 필드 없음), `lib/cases/create-case.ts`(`processCaseJob`이 `runPipeline`을 단일 opaque await 호출로 실행), `app/api/cases/status/route.ts`(`{status, caseId}` 또는 `{status, error}` 또는 `{status: "processing"}` 3가지 응답 형태만 존재), `lib/cases/job-timing.ts`, `app/cases/new/case-input-form.tsx`, `app/cases/new/analysis-status-panel.tsx`, `lib/cases/analysis-stages.ts`를 직접 조사해 확정했다. SPEC-CASE-PROGRESS-001은 `status: completed`를 유지하되(그 시점의 제약 아래 올바른 결정이었음) `partially_superseded_by: [SPEC-CASE-PROGRESS-002]`를 프런트매터에 추가한다 — REQ-CASE-PROGRESS-001(공유 상수 단일 소스)·REQ-CASE-PROGRESS-004(접근성 배치 원칙)·REQ-CASE-PROGRESS-005(무관 범위 보존)는 그대로 유효하며 이번 SPEC이 확장해 계승하지만, REQ-CASE-PROGRESS-002(개별 단계 완료/진행 표시 금지)와 REQ-CASE-PROGRESS-003(숫자 퍼센트/progressbar/애니메이션 금지)은 이번 SPEC의 구현 범위 안에서 명시적으로 반전된다.

## §1. 개요 (Overview)

### WHY — 배경 및 동기

`case-input-form.tsx`의 대기 Footer는 현재 고정 문구 1줄 + 정적 4단계 안내 목록(`ANALYSIS_STAGES`, 개별 완료/진행 표시 없음)만 보여준다(SPEC-CASE-PROGRESS-001). 이는 `app/api/cases/status/route.ts`가 단계별 진행 데이터를 전혀 반환하지 않는다는 제약 아래서는 올바른 설계였다 — 근거 없는 퍼센트를 보여주는 것은 "가짜 진행률"이기 때문이다.

그러나 `lib/pipeline/index.ts`의 `runPipeline()`은 내부적으로 CaseNormalizer→QueryPlanner→EvidenceRetriever→Researcher→Skeptic→Verifier 6단계를 순차 실행하며(직접 소스 확인, `withStageLogging`/`withAsyncStageLogging`로 각 단계를 감싸 로깅함), 이 실행 경계는 실제로 관측 가능한 진행 신호다. 지금까지 이 신호가 `case_jobs` 테이블이나 `/api/cases/status` 응답으로 전혀 전파되지 않았을 뿐이다. 사용자는 이 신호를 계측해 **진짜로 움직이는** 퍼센트 진행률 바를 명시적으로 요청했다(이번 세션 AskUserQuestion 확정).

### WHAT — 이번 SPEC 범위

1. `lib/pipeline/index.ts`에 선택적 콜백 `onStageProgress`를 추가해, 6개 기술 단계를 사용자 대면 4단계(`ANALYSIS_STAGES`)에 대응하는 **3개의 구분 가능한 체크포인트**(QueryPlanner 완료 / EvidenceRetriever 완료 / Researcher 최초 실행 완료)에서 호출한다.
2. `case_jobs` 테이블에 정수 컬럼 `progress_stage`(기본값 0)를 추가하고, `lib/cases/create-case.ts`의 `processCaseJob()`이 `onStageProgress` 콜백에서 이 컬럼을 펜싱된(leaseId 일치) UPDATE로 갱신한다.
3. `/api/cases/status`가 `progressStage` 필드를 응답에 추가하되, `status === "completed"`인 경우 저장값과 무관하게 항상 `ANALYSIS_STAGES.length`(4)를 반환한다(계측 누락에 대한 안전장치).
4. `case-input-form.tsx` 대기 Footer에 실제 `role="progressbar"` 요소와, `case-pending-stages` 각 항목의 완료/진행 중/대기 상태 표시를 추가한다 — 두 요소 모두 서버가 실제로 반환한 `progressStage` 값에서만 계산되며, 관측값 사이를 보간하거나 시간 경과만으로 자동 증가하는 로직은 포함하지 않는다.

이 SPEC은 SPEC-CASE-PROGRESS-001의 REQ-CASE-PROGRESS-002(개별 단계 완료 표시 금지)와 REQ-CASE-PROGRESS-003(퍼센트/progressbar/애니메이션 금지)을 실제 신호가 존재하는 범위 안에서 반전한다. REQ-CASE-PROGRESS-001(공유 상수 단일 소스)·REQ-CASE-PROGRESS-004(접근성 배치)·REQ-CASE-PROGRESS-005(무관 범위 보존) 원칙은 그대로 계승·확장한다.

### 핵심 판단 근거 — Tier L

영향 파일은 `lib/pipeline/index.ts`(신규 콜백 파라미터 + 3개 호출 지점), `lib/db/schema.ts`(신규 컬럼 + 마이그레이션), `lib/cases/create-case.ts`(job 실행부 콜백 배선 + 펜싱 UPDATE), `app/api/cases/status/route.ts`(응답 필드 확장 + completed 클램프), `app/cases/new/case-input-form.tsx`(진행률 바 + 단계별 상태 렌더링), 그리고 각각의 대응 테스트 파일(`lib/pipeline/hybrid-pipeline.test.ts` 또는 인접 신규 테스트, `lib/cases/create-case.test.ts`, 신규 status route 테스트, `app/cases/new/case-input-form.test.tsx`)로 최소 5개 소스 + 4개 이상 테스트 파일이 관여해 Tier M 상한(15개 파일)에 근접하거나 초과할 수 있다. 더 결정적으로, 이 SPEC은 (a) DB 스키마 마이그레이션(되돌리기 어려운 외부 상태 변경)을 수반하고, (b) `@MX:ANCHOR`로 표시된 `runPipeline()`의 공개 계약(`RunPipelineOptions`)을 변경하며 — 이 계약은 SPEC-GEMINI-RUNTIME-001(provider 주입 설계)과 SPEC-RESEARCH-001(6단계 자체의 설계 근거)이 앵커로 삼는 지점이다 — (c) SPEC-UI-MIGRATION-001이 확정하고 SPEC-CASE-PROGRESS-001이 재확인한 "가짜 진행률 금지"라는 컨스티튜션 성격의 원칙을 명시적으로 반전한다. 이 세 가지(스키마 변경, 공개 계약 변경, 컨스티튜션 반전)는 `.claude/rules/moai/workflow/spec-workflow.md` § SPEC Complexity Tier의 "> 1000 LOC or constitutional" 기준 중 constitutional 조건에 해당해 Tier L로 분류한다.

## §2. 요구사항 (Requirements — GEARS 표기법)

### A. 백엔드 실 진행 신호 계측 (Pipeline Instrumentation)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-CASE-PROGRESS-002-001 | Ubiquitous | `lib/pipeline/index.ts`의 `RunPipelineOptions`는 선택적 필드 `onStageProgress`(인자로 `1`\|`2`\|`3` 중 하나의 정수를 받고 `void` 또는 `Promise<void>`를 반환하는 함수)를 가져야 한다. | `lib/pipeline/index.ts:42-44` 기존 `RunPipelineOptions` 인터페이스 직접 확인(현재 `providers` 필드만 존재) |
| REQ-CASE-PROGRESS-002-002 | When | When 파이프라인 내부에서 "① 쟁점 자동 추출"에 해당하는 처리 단계가 완료되면, `runPipeline()`은 `onStageProgress`가 제공된 경우 이를 인자 `1`로 호출해야 한다. | `lib/pipeline/index.ts:105` `withStageLogging("QueryPlanner", ...)` 호출 지점(사용자 대면 "① 쟁점 자동 추출"에 대응) 직접 확인 |
| REQ-CASE-PROGRESS-002-003 | When | When 파이프라인 내부에서 "② 판례·결정례 검색" 및 "③ 약관·법령 대조"의 근거가 되는 자료 수집 단계가 완료되면, `runPipeline()`은 `onStageProgress`가 제공된 경우 이를 인자 `2`로 호출해야 한다. | `lib/pipeline/index.ts:106-108` `withAsyncStageLogging("EvidenceRetriever", ...)` 호출 지점(사용자 대면 "②"·"③" 라벨의 공통 근거 자료 수집에 대응 — design.md §3 매핑 근거) 직접 확인 |
| REQ-CASE-PROGRESS-002-004 | When | When 파이프라인 내부에서 "③ 약관·법령 대조"의 실질 조사·분석 단계가 완료되면 — 최초 실행과 에스컬레이션에 의한 재실행 모두 포함해 매 완료마다 — `runPipeline()`은 `onStageProgress`가 제공된 경우 이를 인자 `3`으로 호출해야 한다. 동일 값 `3`을 두 번 호출하는 것은 멱등적이며 허용된다. | `lib/pipeline/index.ts:121-132` `runReview()` 내부 `research()` 호출 지점(사용자 대면 "③"에 대응 — design.md §3 매핑 근거) 및 `:134,152` 최초/에스컬레이션 2회 호출 가능성 직접 확인 |
| REQ-CASE-PROGRESS-002-005 | When | When `onStageProgress` 콜백이 예외를 던지거나 reject된 Promise를 반환하면, `runPipeline()`은 그 실패를 `console.error`로 로그(기존 `withStageLogging`/`toSafeErrorMeta` 패턴과 동일한 화이트리스트 메타데이터만 기록)하고, 파이프라인의 나머지 단계 실행과 최종 반환값에는 영향을 주지 않아야 한다. | `lib/pipeline/index.ts:76-96` 기존 `withStageLogging`/`withAsyncStageLogging`의 로깅 패턴 직접 확인(단, 이들은 실패 시 재throw하는 반면, 진행률 계측 실패는 재throw하지 않아야 함이 이 요구사항의 핵심 차이) |

### B. DB 스키마 및 잡 실행 연동 (Schema + Job Wiring)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-CASE-PROGRESS-002-006 | Ubiquitous | `case_jobs` 테이블은 정수 컬럼 `progress_stage`(기본값 `0`, NOT NULL)를 가져야 하며, 이 값은 `lib/cases/analysis-stages.ts`의 `ANALYSIS_STAGES` 배열 기준 몇 번째 단계까지 완료되었는지를 나타낸다(`0`=시작 전, `1`~`3`=해당 단계까지 완료). | `lib/db/schema.ts:156-167` 기존 `caseJobs` 테이블 정의 직접 확인(단계/진행 필드 전무) |
| REQ-CASE-PROGRESS-002-007 | While | While `processCaseJob()`이 `runPipeline()`에 전달하는 `onStageProgress` 콜백이 호출되는 동안, 이 콜백은 해당 job의 `id`와 `leaseId`가 모두 일치하고 `status`가 `"processing"`인 행에 한해서만 `progress_stage` 값을 갱신해야 한다 — 기존 완료 트랜잭션이 사용하는 것과 동일한 펜싱 조건(`eq(caseJobs.id, jobId)`, `eq(caseJobs.leaseId, job.leaseId)`, `eq(caseJobs.status, "processing")`)을 재사용한다. | `lib/cases/create-case.ts:445-455` 기존 완료 UPDATE의 3중 펜싱 조건(`caseJobs.id`/`caseJobs.leaseId`/`caseJobs.status`) 직접 확인 |
| REQ-CASE-PROGRESS-002-008 | When | When `progress_stage` 갱신 UPDATE 쿼리 자체가 실패하거나 매칭되는 행이 0개이면, `processCaseJob()`은 이를 `console.error`로 로그(`toSafeErrorMeta` 화이트리스트 메타데이터만 기록)하고 예외를 전파하지 않아야 한다. | REQ-CASE-PROGRESS-002-005와 동일한 안전성 원칙을 저장 계층에 적용; `lib/cases/create-case.ts:474-478` `case_job_status_update_failed` 로깅 패턴과 동일한 스타일 |

### C. API 계약 확장 (`/api/cases/status`)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-CASE-PROGRESS-002-009 | Ubiquitous | `/api/cases/status` 응답은 기존 `status`/`caseId`/`error` 필드에 더해 정수 필드 `progressStage`(범위 `0`~`ANALYSIS_STAGES.length`)를 포함해야 한다. | `app/api/cases/status/route.ts:47-53` 기존 3가지 응답 형태(`{status:"completed",caseId}`/`{status:"failed",error}`/`{status:"processing"}`) 직접 확인 — 어디에도 단계 필드 없음 |
| REQ-CASE-PROGRESS-002-010 | Where | Where 조회된 job의 `status`가 `"completed"`이면, 응답의 `progressStage`는 DB에 저장된 `progress_stage` 값과 무관하게 항상 `ANALYSIS_STAGES.length`(4)로 고정되어야 한다. | 계측 write 누락(REQ-CASE-PROGRESS-002-008 실패 경로 등)이 있어도 완료된 job은 항상 100% 완료로 표시되어야 한다는 안전장치 — 사용자 요구사항("진짜 움직이는 퍼센트바")과 완료 상태의 정합성을 보장 |
| REQ-CASE-PROGRESS-002-011 | Where | Where 조회된 job의 `status`가 `"queued"` 또는 `"processing"`이면, 응답의 `progressStage`는 DB에 저장된 `progress_stage` 값을 그대로 반환해야 한다(재계산이나 보정 없음). | REQ-CASE-PROGRESS-002-013(보간 금지)과의 정합 — 서버는 관측값을 그대로 전달하기만 한다 |

### D. 프런트엔드 실 퍼센트 진행률 바 (UI)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-CASE-PROGRESS-002-012 | While | While `case-input-form.tsx`의 `isSubmitting`이 true인 동안, 대기 Footer는 `role="progressbar"`, `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-valuenow`(최근 폴링 응답의 `progressStage`를 `ANALYSIS_STAGES.length`로 나눈 0~100 정수 백분율)를 가진 시각적 진행률 바 요소를 렌더링해야 한다. | 사용자 요구사항("진짜 움직이는 퍼센트바") — 이제 REQ-CASE-PROGRESS-002-009~011로 실제 데이터가 존재하므로 SPEC-CASE-PROGRESS-001 REQ-CASE-PROGRESS-003(progressbar role 금지)을 반전 |
| REQ-CASE-PROGRESS-002-013 | Ubiquitous | 진행률 바의 `aria-valuenow`와 시각적 너비는 언제나 서버로부터 실제로 관측된 가장 최근 `progressStage` 응답 값에서만 계산되어야 하며, 관측된 두 값 사이를 보간하거나 시간 경과만으로 자동 증가시키는 어떤 로직도 포함해서는 안 된다. | "진짜(REAL, non-fake)" 요구사항의 핵심 — 매 2초 폴링 틱마다 서버가 반환한 값만 반영, 그 사이 시간에는 값을 고정 |
| REQ-CASE-PROGRESS-002-014 | Ubiquitous | `case-pending-stages` 정적 목록의 각 항목은 현재 `progressStage` 값을 기준으로 "완료"(항목 인덱스 `< progressStage`) / "진행 중"(항목 인덱스 `=== progressStage`) / "대기"(항목 인덱스 `> progressStage`) 중 하나의 상태 라벨을 표시해야 한다. | SPEC-CASE-PROGRESS-001 REQ-CASE-PROGRESS-002(개별 완료/진행 표시 금지)를 실제 신호 존재 범위 안에서 반전 |
| REQ-CASE-PROGRESS-002-015 | Unwanted | 진행률 바는 관측값이 갱신되지 않는 동안 스스로 움직이는 어떤 루프·인디터미닛(indeterminate) 애니메이션(예: 무한 반복 셔플/펄스/스트라이프 애니메이션)도 포함해서는 안 된다 — CSS `transition`은 서로 다른 두 실제 관측 값 사이의 시각적 이동(예: 300ms ease-out 너비 전환)에만 사용할 수 있으며, 이는 데이터 조작이 아니라 렌더링 방식의 선택이다. | REQ-CASE-PROGRESS-002-013과 함께 "실제 데이터 없이 스스로 움직이는 진행률"(가짜 진행률의 정의, SPEC-UI-MIGRATION-001 AC-012 원 취지)을 명시적으로 금지 — 관측값 사이의 CSS 전환 자체는 이 금지 대상이 아님을 명확히 구분 |

### E. 접근성 보존 (Accessibility)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-CASE-PROGRESS-002-016 | Ubiquitous | `case-pending-indicator`(기존 testid, `role="status"` `aria-live="polite"`)의 이름·속성·역할은 그대로 유지되어야 하며, REQ-CASE-PROGRESS-002-012의 진행률 바 요소는 이 `aria-live` 영역 내부에 배치되어서는 안 된다. | `app/cases/new/case-input-form.tsx:347-354` 기존 `role="status" aria-live="polite"` 마크업 직접 확인; SPEC-CASE-PROGRESS-001 REQ-CASE-PROGRESS-004(당시 번호)의 접근성 배치 원칙 계승 — 폴링 틱(2초)마다 퍼센트 값이 반복 안내되는 것을 방지 |

### F. 범위 보존 (Preservation)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-CASE-PROGRESS-002-017 | Unwanted | 이 SPEC의 구현은 `lib/cases/job-timing.ts`의 폴링 간격·상한·리스 TTL 상수(`CLIENT_POLL_INTERVAL_MS`/`CLIENT_POLL_MAX_ATTEMPTS`/`BACKGROUND_LEASE_TTL_SECONDS`), `lib/pipeline/**`의 6단계 실행 순서 및 각 단계 함수(`normalizeCase`/`planQueries`/`retrieveEvidence`/`research`/`challenge`/`verify`)의 기존 시그니처(REQ-CASE-PROGRESS-002-001의 콜백 파라미터 추가 제외), `app/cases/new/analysis-status-panel.tsx`의 렌더링 결과를 변경해서는 안 된다. | 사용자 지시(요청 범위는 "AI 리서치 시작" 대기 화면(`case-input-form.tsx`)에 한정, 우측 레일 `AnalysisStatusPanel`은 언급되지 않음); `lib/cases/job-timing.ts` 전체 소스 확인(SPEC-PILOT-READY-001 소유 상수) |
| REQ-CASE-PROGRESS-002-018 | Unwanted | `runPipeline()`의 기존 필수 파라미터(`input`)와 `options.providers`의 의미·하위 호환성은 깨져서는 안 된다 — `onStageProgress`는 선택적(optional) 필드로만 추가되어, 이를 전달하지 않는 기존 호출부(`createCase()` 경로 및 기존 테스트 코드)는 수정 없이 그대로 동작해야 한다. | `lib/pipeline/index.ts:98-103` `runPipeline(input, options = {})` 시그니처 및 `createCase()`(동기 경로, `lib/cases/create-case.ts:146`)가 `options` 없이 `runPipeline(parsed.data)`를 호출하는 기존 호출 지점 직접 확인 |

## §3. 인수 조건 요약

인수 조건 전체(Given-When-Then 시나리오)는 `.moai/specs/SPEC-CASE-PROGRESS-002/acceptance.md`에 정의한다(Tier L — 별도 파일).

## §4. 요구사항 교차 참조

`design.md` §1-§3은 REQ-CASE-PROGRESS-002-001~005(파이프라인 계측)의 콜백 주입 패턴과 6→3 체크포인트 매핑 근거를 다룬다. `design.md` §4는 REQ-CASE-PROGRESS-002-006~008(스키마+잡 연동)의 펜싱 UPDATE 재사용 설계를 다룬다. `design.md` §5는 REQ-CASE-PROGRESS-002-009~011(API)의 completed 클램프 규칙을 다룬다. `design.md` §6은 REQ-CASE-PROGRESS-002-012~016(UI+접근성)의 렌더링 원칙을 다룬다. `research.md`는 이 SPEC이 인용한 모든 기존 소스 확인 근거의 원문 발췌를 담는다. `plan.md` §A는 8개 결정 사항(D1~D8)을, §B는 M1~M6 마일스톤을 다룬다. `acceptance.md`는 REQ-CASE-PROGRESS-002-001~018 각각에 대한 검증 가능한 Given-When-Then 시나리오를 제공한다.

## §5. Out of Scope

### Out of Scope — 6단계 기술적 파이프라인 이름의 전면 노출

- `CaseNormalizer`/`QueryPlanner`/`EvidenceRetriever`/`Researcher`/`Skeptic`/`Verifier`라는 내부 기술 단계 이름을 사용자 화면에 그대로 노출하지 않는다. 사용자 대면 라벨은 기존 `ANALYSIS_STAGES`의 4개 한국어 라벨을 그대로 유지한다.

### Out of Scope — Skeptic/Verifier 단계의 별도 시각적 구분

- `Skeptic`(반대 논리 생성)과 `Verifier`(최종 검증)는 코드상 항상 `Researcher` 완료(체크포인트 3, 75%) 이후 `완료`(체크포인트 4, 100%) 사이에서 순차 실행되지만, 이 둘 사이를 구분하는 별도의 체크포인트나 퍼센트 값(예: 87.5%)을 도입하지 않는다 — 실제로 구분 가능한 신호가 코드에 존재하지 않는 두 단계 사이에 인위적인 중간값을 만드는 것은 이 SPEC이 금지하는 것과 동일한 종류의 가짜 정밀도다.

### Out of Scope — 에스컬레이션(경량→프리미엄 승급) 진행 상태 노출

- `selectEscalation()`에 의한 경량(lite) 조사에서 프리미엄(premium) 조사로의 재실행 여부나 진행 상태를 사용자에게 별도로 안내(예: "재조사 중입니다" 문구)하지 않는다. 에스컬레이션이 발생해도 사용자가 보는 값은 계속 체크포인트 3(75%)에 머물다 완료 시 100%로 전환될 뿐이다.

### Out of Scope — `AnalysisStatusPanel`(우측 레일) 갱신

- `app/cases/new/analysis-status-panel.tsx`(우측 레일, 서버 컴포넌트, `isSubmitting`을 알지 못하는 별도 형제 컴포넌트)는 이 SPEC의 범위가 아니다. 이 SPEC은 사용자가 명시적으로 지정한 "AI 리서치 시작" 대기 화면(`case-input-form.tsx`)의 대기 Footer만을 대상으로 한다.

### Out of Scope — 폴링 메커니즘 자체의 실시간 푸시 전환

- 2초 간격 폴링(`CLIENT_POLL_INTERVAL_MS`)을 Server-Sent Events나 WebSocket 등 실시간 푸시 방식으로 전환하는 작업은 이 SPEC의 범위가 아니다. `progressStage`는 기존 `/api/cases/status` 폴링 응답에 필드를 추가하는 방식으로만 전달된다.

### Out of Scope — DB 스키마 변경 외의 신규 관측 인프라

- `gemini_request_observations`와 같은 별도 관측 테이블 신설이나, 단계별 소요 시간·재시도 횟수 등 `progress_stage` 이외의 추가 메트릭 수집은 이 SPEC의 범위가 아니다.
