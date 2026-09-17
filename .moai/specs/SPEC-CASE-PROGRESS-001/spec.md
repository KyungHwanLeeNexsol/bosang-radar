---
id: SPEC-CASE-PROGRESS-001
title: "사건 입력 제출 대기 화면 — 정적 4단계 진행 안내 + 실제 관측 상태(대기열/진행 중) 반영"
version: "0.1.0"
status: completed
created: 2026-09-16
updated: 2026-09-16
author: Nexsol
priority: P2
phase: "v1.1.0 target"
module: "app/cases/new/case-input-form.tsx, app/cases/new/analysis-status-panel.tsx, lib/cases/"
lifecycle: spec-anchored
tags: "ux, progress-indicator, no-fake-progress, accessibility, case-input"
tier: M
depends_on: [SPEC-UI-MIGRATION-001, SPEC-PILOT-READY-001]
partially_superseded_by: [SPEC-CASE-PROGRESS-002]
---

## HISTORY

- 2026-09-17: 부분 대체 기록 (manager-spec) — SPEC-CASE-PROGRESS-002가 사용자의 명시적 요청("진짜 움직이는 퍼센트바")에 따라 REQ-CASE-PROGRESS-002(개별 단계 완료/진행 표시 금지)와 REQ-CASE-PROGRESS-003(숫자 퍼센트·`role="progressbar"`·애니메이션 진행률 바 금지)을 반전한다. 이 반전은 SPEC-CASE-PROGRESS-002가 신규로 도입하는 백엔드 계측(`lib/pipeline/index.ts`의 `onStageProgress` 콜백 + `case_jobs.progress_stage` 컬럼)이 이 SPEC 작성 당시 존재하지 않았던 실제 단계별 진행 데이터를 만들어내기 때문에 가능해진다 — 즉 REQ-CASE-PROGRESS-003의 근거("`app/api/cases/status/route.ts`가 단계별 데이터를 전혀 반환하지 않으므로")가 더 이상 성립하지 않는다. REQ-CASE-PROGRESS-001(공유 상수 단일 소스)·REQ-CASE-PROGRESS-004(접근성 배치)·REQ-CASE-PROGRESS-005(무관 범위 보존)는 그대로 유효하며 SPEC-CASE-PROGRESS-002가 확장·계승한다. 이 SPEC의 `status`는 `completed`로 유지한다(작성 당시 제약 아래 올바른 결정이었음).
- 2026-09-16: 최초 작성 (manager-spec) — 백로그 항목(`.moai/state/kanban/backlog.json` id "t1", 2026-09-16T02:15:00+09:00)에서 파생. "AI 리서치 시작" 시 진행 상태를 프로그레스바 또는 단계 표시로 보여달라는 요청을, `AC-012`(SPEC-UI-MIGRATION-001)가 확정한 가짜 진행률 금지 원칙과 정합시켜 범위를 확정한다. `app/cases/new/case-input-form.tsx:333-341`(대기 Footer가 단일 텍스트 "처리 중입니다..."만 렌더링), `app/api/cases/status/route.ts`(백엔드가 `queued`/`processing`/`completed`/`failed` 4개 값만 반환하며 단계별 필드나 퍼센트 필드가 전혀 없음), `app/cases/new/analysis-status-panel.tsx`(동일한 가짜 진행률 금지 제약 아래 이미 정적 4단계 목록을 렌더링 중인 선례), `app/cases/new/page.tsx:49-77`(두 컴포넌트가 서버 페이지에서 형제로 조립될 뿐 상태를 공유하지 않음)를 직접 조사해 확정했다.
- 2026-09-16: plan-audit iteration 1 FAIL(overall 0.75, threshold 0.80) 반영 개정 (manager-spec) — D1/D2 결함: `app/api/cases/status/route.ts:47-53`를 재확인한 결과, 이 엔드포인트는 `completed`/`caseId`, `failed`/`error`, 그리고 그 외 모든 내부 상태(`queued` 포함)에 대해 고정 리터럴 `{"status": "processing"}`을 반환하는 **3가지 응답 형태**만 존재하며, DB 행의 실제 `status`가 `"queued"`여도 JSON 응답에는 결코 노출되지 않는다(최초 작성 시 "4개 상태값 반환"으로 기술한 것은 오류). 이로 인해 (당시) REQ-CASE-PROGRESS-004/AC-CASE-PROGRESS-005가 요구하는 queued/processing 구분 표시는 백엔드 데이터 자체가 없어 애초에 충족 불가능했고, 백엔드 미변경 제약(당시 REQ-CASE-PROGRESS-006)과도 내부 모순이었다. 사용자 확정: 백엔드(`route.ts`)는 그대로 두고, queued/processing 구분 요구사항 자체를 제거한다. 이에 따라 (당시) REQ-CASE-PROGRESS-004(Group B 전체)와 AC-CASE-PROGRESS-004/AC-CASE-PROGRESS-005를 제거하고, WHY/WHAT의 "4개 상태값" 오기술을 정정했다. (당시) REQ-CASE-PROGRESS-005(접근성)·REQ-CASE-PROGRESS-006(범위 보존)의 ID는 유지하며 REQ-CASE-PROGRESS-004는 결번으로 남긴다(iteration 3에서 재번호됨 — 아래 참고). 상세 근거: `.moai/reports/plan-audit/SPEC-CASE-PROGRESS-001-review-1.md`.
- 2026-09-16: plan-audit iteration 2 FAIL(overall 0.92, Must-Pass Firewall MP-1 위반) 반영 개정 (manager-spec) — iteration 1→2 개정으로 REQ-CASE-PROGRESS-004를 결번 처리한 결과, 요구사항 번호열이 `001,002,003,[004 결번],005,006`으로 연속성이 끊겨 MP-1(요구사항 번호 연속성)을 위반했다. 사용자 확정(AskUserQuestion): 결번을 예외 처리하지 않고 **재번호**한다 — 舊 REQ-CASE-PROGRESS-005(접근성)를 REQ-CASE-PROGRESS-004로, 舊 REQ-CASE-PROGRESS-006(범위 보존)을 REQ-CASE-PROGRESS-005로 각각 재번호했다. **주의**: 이 재번호로 ID `REQ-CASE-PROGRESS-004`는 iteration 1에서 제거된 舊 queued/processing 구분 요구사항과는 무관한, 접근성 요구사항(§2.C)을 가리키는 새 ID로 재사용된다 — 이 문서 전반의 "舊 REQ-CASE-PROGRESS-004" 표기는 iteration 1에서 제거된 원래의 요구사항을 지칭하며 현재의 REQ-CASE-PROGRESS-004(접근성)와는 다른 대상이다. plan.md/acceptance.md의 상응 교차 참조도 함께 갱신했다. 상세 근거: `.moai/reports/plan-audit/SPEC-CASE-PROGRESS-001-review-2.md`.

## §1. 개요 (Overview)

### WHY — 배경 및 동기

`case-input-form.tsx`의 `handleSubmit`은 `/api/cases`에 POST한 뒤 `waitForCaseJob`으로 `/api/cases/status`를 최대 `CLIENT_POLL_MAX_ATTEMPTS`회(`lib/cases/job-timing.ts` — 리스 TTL 960초 + 안전 여유 60초 기준 약 510회, 최대 약 17분) 2초 간격으로 폴링하는 동안, Footer에는 `case-pending-indicator`(`role="status" aria-live="polite"`) 안에 "처리 중입니다. 잠시만 기다려 주세요..." 한 줄만 고정 표시된다(`case-input-form.tsx:333-341`). 이 최대 17분에 달할 수 있는 대기 구간 동안 화면에는 어떤 진행 신호도 추가되지 않는다.

같은 화면 우측 레일의 `AnalysisStatusPanel`(`analysis-status-panel.tsx`)은 이미 4단계(쟁점 자동 추출/판례·결정례 검색/약관·법령 대조/근거 검증 및 반대 논리 생성)를 정적 목록으로 렌더링하지만, `cases` 테이블에 단계별 진행 데이터가 없다는 이유로(SPEC-UI-MIGRATION-001 REQ-012 근거) 모든 단계에 항상 "대기"만 표시하며, `isSubmitting` 상태를 전혀 알지 못하는 별도의 서버 컴포넌트(`page.tsx:75`에서 `CaseInputForm`과 형제로 조립됨)라 제출이 실제로 진행 중이어도 시각적으로 변하지 않는다.

한편 `app/api/cases/status/route.ts:47-53`를 직접 재확인한 결과, 이 엔드포인트는 `completed`/`caseId`, `failed`/`error`, 그리고 그 외 모든 내부 상태(`queued` 포함)에 대해 고정 리터럴 `{"status": "processing"}`을 반환하는 **3가지 응답 형태**만 존재하며, DB 행의 실제 `status` 값이 `"queued"`이더라도 JSON 응답에는 결코 노출되지 않는다(plan-audit iteration 1 D1/D2 결함 정정 — 최초 작성 시 "4개 상태값 반환"으로 잘못 기술했던 부분). 따라서 `waitForCaseJob`(`case-input-form.tsx:43-78`)이 `completed`/`failed` 외의 응답을 구분하지 않고 침묵하는 현재 동작은, 실제로는 구분할 수 있는 추가 데이터가 없는 상태에서의 정확한 반영이다 — 화면에 가짜 구분을 추가하지 않는 것이 올바른 동작이다.

### WHAT — 이번 SPEC 범위

1. `case-input-form.tsx` 대기 Footer에, 개별 단계 완료/진행률을 주장하지 않는 정적 4단계 안내 목록을 추가한다 — `AnalysisStatusPanel`이 이미 사용 중인 동일한 4단계 라벨을 단일 소스(신규 공유 상수 모듈)에서 가져와 두 화면이 서로 다른 문구로 갈라지지 않게 한다.
2. ~~`/api/cases/status`가 실제로 반환하는 `queued`/`processing` 두 상태를 대기 안내 문구에 구분 반영한다~~ — plan-audit iteration 1 D1/D2 결함 반영으로 제거됨(`/api/cases/status`는 `queued`를 JSON으로 노출하지 않으므로 UI에서 구분할 실데이터 자체가 없다). 기존 고정 문구("처리 중입니다...")는 변경 없이 유지하며, `completed`/`failed`는 기존과 동일하게 폴링을 종료시킨다.
3. `case-pending-indicator`의 기존 `role="status" aria-live="polite"` 계약과 testid는 그대로 보존하며, 신규로 추가되는 정적 4단계 목록이 폴링 틱마다 반복 안내되어 스크린리더 소음을 유발하지 않도록 배치한다.
4. `AnalysisStatusPanel`의 기존 대기(idle, 제출 전) 상태 렌더링은 시각적으로 전혀 변경하지 않는다 — 이번 SPEC은 공유 상수 추출로 인한 import 경로 변경만 허용하며, 렌더링 결과물은 회귀 없이 동일해야 한다.

기존 `/api/cases/status` 응답 스키마, `lib/cases/job-timing.ts`의 폴링 상수, AI 파이프라인 내부 단계 자체는 이 SPEC에서 전혀 수정하지 않는다 — 신규 백엔드 데이터를 만들지 않고, 정적 4단계 안내 추가와 기존 접근성 계약 보존만으로 이번 SPEC의 범위를 한정한다(실관측 상태 구분 표시는 API가 그런 데이터를 제공하지 않으므로 범위에서 제외).

### 핵심 판단 근거 — Tier M

영향 파일은 `case-input-form.tsx`(대기 Footer 로직 확장 + `waitForCaseJob`의 queued/processing 상태 전달), `analysis-status-panel.tsx`(단계 라벨을 신규 공유 상수로 교체, 시각 결과 불변), 신규 공유 상수 모듈(`lib/cases/analysis-stages.ts` 또는 동등 위치), 대응 테스트 파일(`case-input-form.test.tsx` 확장)로 4개이며, 서로 다른 요구사항 그룹(정적 단계 표시/실관측 상태 반영/접근성/범위 보존) 간 정합성 검토가 필요해 Tier S 기준(5개 미만 파일이라는 수치 자체는 근접하지만 검토 축이 여러 개)보다는 Tier M으로 분류한다. 서버측 API·스키마·파이프라인 변경은 전혀 없다.

## §2. 요구사항 (Requirements — GEARS 표기법)

### A. 정적 4단계 진행 안내 (Static Stage Display)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-CASE-PROGRESS-001 | Ubiquitous | 4단계 안내 라벨 집합(쟁점 자동 추출/판례·결정례 검색/약관·법령 대조/근거 검증 및 반대 논리 생성)은 단일 소스(신규 공유 상수 모듈, 예: `lib/cases/analysis-stages.ts`)에 정의되어야 하며, `app/cases/new/analysis-status-panel.tsx`와 `app/cases/new/case-input-form.tsx` 양쪽 모두 이 단일 소스를 import해서 사용해야 한다 — 두 화면에 동일한 라벨 배열을 중복 정의해서는 안 된다. | `analysis-status-panel.tsx:5-10`의 기존 `ANALYSIS_STAGES` 상수 직접 확인(현재 이 파일 내부에만 정의됨), `case-input-form.tsx` 조사 결과(동일 개념의 상수가 존재하지 않음) |
| REQ-CASE-PROGRESS-002 | While | While `case-input-form.tsx`의 `isSubmitting`이 true인 동안, 대기 Footer(`case-pending-indicator`가 위치한 영역)는 기존 단일 텍스트에 더해 REQ-CASE-PROGRESS-001의 4단계 라벨을 순서가 있는 정적 목록으로 함께 표시해야 하며, 각 단계에 개별 완료/진행/체크마크 상태를 부여해서는 안 된다(가짜 진행률 금지, SPEC-UI-MIGRATION-001 REQ-012/AC-012 원칙 승계). | 백로그 항목 요구("4단계 분석 중 어디 단계인지 정도의 정적 표시"), `case-input-form.tsx:333-341` 조사 결과(현재 단일 텍스트만 존재), SPEC-UI-MIGRATION-001 REQ-012(가짜 진행률 금지 원칙의 최초 확정) |
| REQ-CASE-PROGRESS-003 | Unwanted | 이 SPEC이 추가하는 어떤 UI 요소도 숫자 퍼센트, `role="progressbar"`(또는 동등한 측정된 진행률을 암시하는 ARIA 역할), 애니메이션 진행률 바, 또는 "현재 어느 단계인지"를 특정해 강조하는 하이라이트를 렌더링해서는 안 된다 — `app/api/cases/status/route.ts`가 단계별 데이터를 전혀 반환하지 않으므로 그런 특정은 근거 없는 주장이 된다. | `app/api/cases/status/route.ts` 전체 소스 직접 확인(반환 필드가 `status`/`caseId`/`error` 3개뿐, 단계 필드 없음), `analysis-status-panel.tsx:22-26`의 기존 가짜 진행률 금지 주석(AC-012 회귀 방지) 선례 |

### B. 실제 관측 상태 반영 (REMOVED — plan-audit iteration 1 D1/D2)

舊 REQ-CASE-PROGRESS-004(queued/processing 구분 표시)는 이 개정에서 제거되었다. `app/api/cases/status/route.ts:47-53`를 직접 재확인한 결과 `"queued"`는 어떤 내부 상태에서도 JSON 응답으로 노출되지 않으며(비종료 상태는 항상 고정 리터럴 `{"status": "processing"}`), 백엔드를 수정하지 않는다는 (당시) REQ-CASE-PROGRESS-006의 제약과 함께라면 이 요구사항은 애초에 충족 불가능했다(plan-audit report D1). iteration 1→2 개정 시점에는 ID `REQ-CASE-PROGRESS-004`를 결번으로 남기고 재사용하지 않기로 했으나, plan-audit iteration 2가 이 결번 자체를 MP-1(요구사항 번호 연속성) 위반으로 지적함에 따라 iteration 3에서 재번호를 진행했다 — **동일 ID `REQ-CASE-PROGRESS-004`는 현재 아래 §2.C(접근성) 요구사항으로 재사용되며, 이 그룹(舊 queued/processing 구분 표시)과는 무관하다.** 상세 경위는 위 HISTORY 참고.

### C. 접근성 (Accessibility)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-CASE-PROGRESS-004 | Ubiquitous | `case-pending-indicator`(기존 testid, `role="status"` `aria-live="polite"`)는 이름·속성·역할을 그대로 유지해야 하며, REQ-CASE-PROGRESS-001의 4단계 정적 목록은 이 `aria-live` 영역 내부에 배치되어 매 폴링 틱마다 전체 목록이 반복 안내되게 해서는 안 된다 — `aria-live` 영역에는 기존 고정 요약 문구("처리 중입니다...", 변경 없음)만 남기고, 정적 4단계 목록은 그 영역 밖에 배치하거나 스크린리더 반복 안내를 유발하지 않는 방식으로 구성해야 한다. | `case-input-form.tsx:334-341`의 기존 `role="status" aria-live="polite"` 마크업 직접 확인, SPEC-UI-MIGRATION-001 §3 보존 대상 목록(`case-pending-indicator`+`role="status" aria-live="polite"` 명시) |

### D. 범위 보존 (Preservation)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-CASE-PROGRESS-005 | Unwanted | 이 SPEC의 구현은 `app/api/cases/status/route.ts`의 응답 스키마, `lib/cases/job-timing.ts`의 폴링 상수(`CLIENT_POLL_INTERVAL_MS`/`CLIENT_POLL_MAX_ATTEMPTS`/`BACKGROUND_LEASE_TTL_SECONDS`), `lib/pipeline/**`, `lib/db/schema.ts`, 어떤 마이그레이션도 수정해서는 안 되며, `analysis-status-panel.tsx`의 제출 전(idle) 상태 시각적 렌더링 결과(모든 단계 "대기" 표시, 정적 진행 바 `w-0`)를 REQ-CASE-PROGRESS-001의 상수 추출 이외의 이유로 변경해서는 안 된다. | 사용자 지시(백엔드 변경 없이 UI 레이어만 개선), `analysis-status-panel.tsx` 전체 소스 확인(현재 렌더링 계약), SPEC-PILOT-READY-001 §Z/§R(폴링 상수의 소유 근거 — 리스 TTL 기반 산정) |

## §3. 인수 조건 요약

인수 조건 전체(Given-When-Then 시나리오)는 `.moai/specs/SPEC-CASE-PROGRESS-001/acceptance.md`에 정의한다(Tier M — 별도 파일).

## §4. 요구사항 교차 참조

plan.md §A(결정 사항)는 REQ-CASE-PROGRESS-001의 공유 상수 추출 방식을 다룬다(舊 REQ-CASE-PROGRESS-004는 제거되어 더 이상 결정 사항이 없음). plan.md §B(마일스톤)는 남은 REQ 그룹(A/C/D)을 실행 순서로 분해한다. acceptance.md는 REQ-CASE-PROGRESS-001, 002, 003, 004, 005 각각에 대한 검증 가능한 Given-When-Then 시나리오를 제공한다(舊 REQ-CASE-PROGRESS-004 및 그 하위 舊 AC-CASE-PROGRESS-004/005는 제거되었으며, 현재의 REQ-CASE-PROGRESS-004/005는 iteration 3 재번호로 접근성·범위 보존 요구사항에 재사용된 것으로 이와 무관함).

## §5. Out of Scope

### Out of Scope — 실제 단계별 진행률 노출

- `cases`/`caseJobs` 테이블에 단계별 진행 컬럼을 추가하거나 AI 파이프라인(`lib/pipeline/*`, SPEC-RESEARCH-001 소유의 6개 내부 단계)이 단계별 완료 신호를 방출하도록 계측하는 작업은 이 SPEC의 범위가 아니다 — SPEC-UI-MIGRATION-001 REQ-012/AC-012가 확정한 가짜 진행률 금지 원칙에 따라, 실제 데이터가 없는 한 UI는 정적 안내 이상을 표시하지 않는다.

### Out of Scope — 숫자 퍼센트·애니메이션 진행률 바

- 측정되지 않은 진행률을 암시하는 어떤 숫자 퍼센트, `role="progressbar"`, 애니메이션 진행률 바도 신규 도입하지 않는다(REQ-CASE-PROGRESS-003).

### Out of Scope — API/스키마/폴링 상수 변경

- `/api/cases/status`의 응답 스키마 변경, `lib/cases/job-timing.ts`의 폴링 간격·상한·리스 TTL 상수 변경, 신규 폴링 API 라우트 추가는 이 SPEC의 범위가 아니다(REQ-CASE-PROGRESS-005). 이 값들은 SPEC-PILOT-READY-001이 소유한다.

### Out of Scope — 대기열(queued)/진행중(processing) 상태 구분 표시

- `/api/cases/status`는 `"queued"` 상태를 어떤 경우에도 JSON 응답으로 노출하지 않는다(비종료 상태는 항상 고정 리터럴 `{"status": "processing"}`). 따라서 이 두 상태를 UI 문구로 구분해 보여주는 기능(구 REQ-CASE-PROGRESS-004)은 이 SPEC의 범위가 아니다 — plan-audit iteration 1 D1/D2 결함 반영으로 제거됨. 백엔드가 실제 상태를 노출하도록 변경하는 것 역시 위 "API/스키마/폴링 상수 변경" 항목에 이미 포함되어 범위 밖이다.

### Out of Scope — AnalysisStatusPanel 대기(idle) 상태 재설계

- `AnalysisStatusPanel`이 제출 전(idle) 상태에서 렌더링하는 "대기 중" 배지, 모든 단계 "대기" 라벨, 정적 진행 바(`w-0`)의 시각적 결과를 재설계하지 않는다 — REQ-CASE-PROGRESS-001이 요구하는 공유 상수로의 import 경로 교체만 허용되며, 그 결과물은 기존과 동일해야 한다.
