---
id: SPEC-CASE-PROGRESS-001
title: "사건 입력 제출 대기 화면 — 정적 4단계 진행 안내 + 실제 관측 상태(대기열/진행 중) 반영"
version: "0.1.0"
status: draft
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
---

## HISTORY

- 2026-09-16: 최초 작성 (manager-spec) — 백로그 항목(`.moai/state/kanban/backlog.json` id "t1", 2026-09-16T02:15:00+09:00)에서 파생. "AI 리서치 시작" 시 진행 상태를 프로그레스바 또는 단계 표시로 보여달라는 요청을, `AC-012`(SPEC-UI-MIGRATION-001)가 확정한 가짜 진행률 금지 원칙과 정합시켜 범위를 확정한다. `app/cases/new/case-input-form.tsx:333-341`(대기 Footer가 단일 텍스트 "처리 중입니다..."만 렌더링), `app/api/cases/status/route.ts`(백엔드가 `queued`/`processing`/`completed`/`failed` 4개 값만 반환하며 단계별 필드나 퍼센트 필드가 전혀 없음), `app/cases/new/analysis-status-panel.tsx`(동일한 가짜 진행률 금지 제약 아래 이미 정적 4단계 목록을 렌더링 중인 선례), `app/cases/new/page.tsx:49-77`(두 컴포넌트가 서버 페이지에서 형제로 조립될 뿐 상태를 공유하지 않음)를 직접 조사해 확정했다.

## §1. 개요 (Overview)

### WHY — 배경 및 동기

`case-input-form.tsx`의 `handleSubmit`은 `/api/cases`에 POST한 뒤 `waitForCaseJob`으로 `/api/cases/status`를 최대 `CLIENT_POLL_MAX_ATTEMPTS`회(`lib/cases/job-timing.ts` — 리스 TTL 960초 + 안전 여유 60초 기준 약 510회, 최대 약 17분) 2초 간격으로 폴링하는 동안, Footer에는 `case-pending-indicator`(`role="status" aria-live="polite"`) 안에 "처리 중입니다. 잠시만 기다려 주세요..." 한 줄만 고정 표시된다(`case-input-form.tsx:333-341`). 이 최대 17분에 달할 수 있는 대기 구간 동안 화면에는 어떤 진행 신호도 추가되지 않는다.

같은 화면 우측 레일의 `AnalysisStatusPanel`(`analysis-status-panel.tsx`)은 이미 4단계(쟁점 자동 추출/판례·결정례 검색/약관·법령 대조/근거 검증 및 반대 논리 생성)를 정적 목록으로 렌더링하지만, `cases` 테이블에 단계별 진행 데이터가 없다는 이유로(SPEC-UI-MIGRATION-001 REQ-012 근거) 모든 단계에 항상 "대기"만 표시하며, `isSubmitting` 상태를 전혀 알지 못하는 별도의 서버 컴포넌트(`page.tsx:75`에서 `CaseInputForm`과 형제로 조립됨)라 제출이 실제로 진행 중이어도 시각적으로 변하지 않는다.

한편 `app/api/cases/status/route.ts`는 `queued`/`processing`/`completed`/`failed` 4개의 실제 관측 가능한 상태를 반환하지만(단계별 필드 없음), `waitForCaseJob`(`case-input-form.tsx:43-78`)은 `completed`/`failed`만 분기하고 그 외(즉 `queued`와 `processing`을 구분하지 않고)는 동일하게 침묵한 채 다음 폴링을 기다린다 — 실제로 관측되는 데이터임에도 화면에 전혀 반영되지 않는다.

### WHAT — 이번 SPEC 범위

1. `case-input-form.tsx` 대기 Footer에, 개별 단계 완료/진행률을 주장하지 않는 정적 4단계 안내 목록을 추가한다 — `AnalysisStatusPanel`이 이미 사용 중인 동일한 4단계 라벨을 단일 소스(신규 공유 상수 모듈)에서 가져와 두 화면이 서로 다른 문구로 갈라지지 않게 한다.
2. `/api/cases/status`가 실제로 반환하는 `queued`/`processing` 두 상태(가짜가 아닌 관측된 데이터)를 대기 안내 문구에 구분 반영한다 — `completed`/`failed`는 기존과 동일하게 폴링을 종료시킨다.
3. `case-pending-indicator`의 기존 `role="status" aria-live="polite"` 계약과 testid는 그대로 보존하며, 신규로 추가되는 정적 4단계 목록이 폴링 틱마다 반복 안내되어 스크린리더 소음을 유발하지 않도록 배치한다.
4. `AnalysisStatusPanel`의 기존 대기(idle, 제출 전) 상태 렌더링은 시각적으로 전혀 변경하지 않는다 — 이번 SPEC은 공유 상수 추출로 인한 import 경로 변경만 허용하며, 렌더링 결과물은 회귀 없이 동일해야 한다.

기존 `/api/cases/status` 응답 스키마, `lib/cases/job-timing.ts`의 폴링 상수, AI 파이프라인 내부 단계 자체는 이 SPEC에서 전혀 수정하지 않는다 — 신규 단계별 백엔드 데이터를 만들지 않고, 이미 존재하는 관측 가능한 4개 상태값만 UI 레이어에서 더 잘 보여주는 것이 범위다.

### 핵심 판단 근거 — Tier M

영향 파일은 `case-input-form.tsx`(대기 Footer 로직 확장 + `waitForCaseJob`의 queued/processing 상태 전달), `analysis-status-panel.tsx`(단계 라벨을 신규 공유 상수로 교체, 시각 결과 불변), 신규 공유 상수 모듈(`lib/cases/analysis-stages.ts` 또는 동등 위치), 대응 테스트 파일(`case-input-form.test.tsx` 확장)로 4개이며, 서로 다른 요구사항 그룹(정적 단계 표시/실관측 상태 반영/접근성/범위 보존) 간 정합성 검토가 필요해 Tier S 기준(5개 미만 파일이라는 수치 자체는 근접하지만 검토 축이 여러 개)보다는 Tier M으로 분류한다. 서버측 API·스키마·파이프라인 변경은 전혀 없다.

## §2. 요구사항 (Requirements — GEARS 표기법)

### A. 정적 4단계 진행 안내 (Static Stage Display)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-CASE-PROGRESS-001 | Ubiquitous | 4단계 안내 라벨 집합(쟁점 자동 추출/판례·결정례 검색/약관·법령 대조/근거 검증 및 반대 논리 생성)은 단일 소스(신규 공유 상수 모듈, 예: `lib/cases/analysis-stages.ts`)에 정의되어야 하며, `app/cases/new/analysis-status-panel.tsx`와 `app/cases/new/case-input-form.tsx` 양쪽 모두 이 단일 소스를 import해서 사용해야 한다 — 두 화면에 동일한 라벨 배열을 중복 정의해서는 안 된다. | `analysis-status-panel.tsx:5-10`의 기존 `ANALYSIS_STAGES` 상수 직접 확인(현재 이 파일 내부에만 정의됨), `case-input-form.tsx` 조사 결과(동일 개념의 상수가 존재하지 않음) |
| REQ-CASE-PROGRESS-002 | While | While `case-input-form.tsx`의 `isSubmitting`이 true인 동안, 대기 Footer(`case-pending-indicator`가 위치한 영역)는 기존 단일 텍스트에 더해 REQ-CASE-PROGRESS-001의 4단계 라벨을 순서가 있는 정적 목록으로 함께 표시해야 하며, 각 단계에 개별 완료/진행/체크마크 상태를 부여해서는 안 된다(가짜 진행률 금지, SPEC-UI-MIGRATION-001 REQ-012/AC-012 원칙 승계). | 백로그 항목 요구("4단계 분석 중 어디 단계인지 정도의 정적 표시"), `case-input-form.tsx:333-341` 조사 결과(현재 단일 텍스트만 존재), SPEC-UI-MIGRATION-001 REQ-012(가짜 진행률 금지 원칙의 최초 확정) |
| REQ-CASE-PROGRESS-003 | Unwanted | 이 SPEC이 추가하는 어떤 UI 요소도 숫자 퍼센트, `role="progressbar"`(또는 동등한 측정된 진행률을 암시하는 ARIA 역할), 애니메이션 진행률 바, 또는 "현재 어느 단계인지"를 특정해 강조하는 하이라이트를 렌더링해서는 안 된다 — `app/api/cases/status/route.ts`가 단계별 데이터를 전혀 반환하지 않으므로 그런 특정은 근거 없는 주장이 된다. | `app/api/cases/status/route.ts` 전체 소스 직접 확인(반환 필드가 `status`/`caseId`/`error` 3개뿐, 단계 필드 없음), `analysis-status-panel.tsx:22-26`의 기존 가짜 진행률 금지 주석(AC-012 회귀 방지) 선례 |

### B. 실제 관측 상태 반영 (queued/processing — 실데이터)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-CASE-PROGRESS-004 | While | While `waitForCaseJob`(`case-input-form.tsx`)이 `/api/cases/status`를 폴링하는 동안, 응답의 `status` 값이 `"queued"`인 경우와 `"processing"`인 경우를 사건 입력 폼의 대기 상태 문구에서 서로 다른 텍스트로 구분해 표시해야 한다(예: 대기열 순서 대기 안내 vs 분석 진행 안내) — 두 값 모두 백엔드가 실제로 반환하는 관측된 상태이므로 이 구분은 가짜 진행률에 해당하지 않는다. `"completed"`/`"failed"` 수신 시의 기존 분기(라우팅/오류 처리)는 변경하지 않는다. | `app/api/cases/status/route.ts:47-53`(4개 상태값 반환 확인), `case-input-form.tsx:56-69`(`waitForCaseJob`이 현재 `completed`/`failed` 외 값을 구분하지 않고 동일하게 다음 루프로 넘어감을 확인) |

### C. 접근성 (Accessibility)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-CASE-PROGRESS-005 | Ubiquitous | `case-pending-indicator`(기존 testid, `role="status"` `aria-live="polite"`)는 이름·속성·역할을 그대로 유지해야 하며, REQ-CASE-PROGRESS-001의 4단계 정적 목록은 이 `aria-live` 영역 내부에 배치되어 매 폴링 틱마다 전체 목록이 반복 안내되게 해서는 안 된다 — `aria-live` 영역에는 REQ-CASE-PROGRESS-004의 상태 구분 문구(대기열/진행 중)처럼 실제로 변할 수 있는 요약 텍스트만 남기고, 정적 4단계 목록은 그 영역 밖에 배치하거나 스크린리더 반복 안내를 유발하지 않는 방식으로 구성해야 한다. | `case-input-form.tsx:334-341`의 기존 `role="status" aria-live="polite"` 마크업 직접 확인, SPEC-UI-MIGRATION-001 §3 보존 대상 목록(`case-pending-indicator`+`role="status" aria-live="polite"` 명시) |

### D. 범위 보존 (Preservation)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-CASE-PROGRESS-006 | Unwanted | 이 SPEC의 구현은 `app/api/cases/status/route.ts`의 응답 스키마, `lib/cases/job-timing.ts`의 폴링 상수(`CLIENT_POLL_INTERVAL_MS`/`CLIENT_POLL_MAX_ATTEMPTS`/`BACKGROUND_LEASE_TTL_SECONDS`), `lib/pipeline/**`, `lib/db/schema.ts`, 어떤 마이그레이션도 수정해서는 안 되며, `analysis-status-panel.tsx`의 제출 전(idle) 상태 시각적 렌더링 결과(모든 단계 "대기" 표시, 정적 진행 바 `w-0`)를 REQ-CASE-PROGRESS-001의 상수 추출 이외의 이유로 변경해서는 안 된다. | 사용자 지시(백엔드 변경 없이 UI 레이어만 개선), `analysis-status-panel.tsx` 전체 소스 확인(현재 렌더링 계약), SPEC-PILOT-READY-001 §Z/§R(폴링 상수의 소유 근거 — 리스 TTL 기반 산정) |

## §3. 인수 조건 요약

인수 조건 전체(Given-When-Then 시나리오)는 `.moai/specs/SPEC-CASE-PROGRESS-001/acceptance.md`에 정의한다(Tier M — 별도 파일).

## §4. 요구사항 교차 참조

plan.md §B(결정 사항)는 REQ-CASE-PROGRESS-001의 공유 상수 추출 방식과 REQ-CASE-PROGRESS-004의 상태 구분 문구 확정 근거를 다룬다. plan.md §C(마일스톤)는 REQ 그룹 A~D를 실행 순서로 분해한다. acceptance.md는 REQ-CASE-PROGRESS-001~006 각각에 대한 검증 가능한 Given-When-Then 시나리오를 제공한다.

## §5. Out of Scope

### Out of Scope — 실제 단계별 진행률 노출

- `cases`/`caseJobs` 테이블에 단계별 진행 컬럼을 추가하거나 AI 파이프라인(`lib/pipeline/*`, SPEC-RESEARCH-001 소유의 6개 내부 단계)이 단계별 완료 신호를 방출하도록 계측하는 작업은 이 SPEC의 범위가 아니다 — SPEC-UI-MIGRATION-001 REQ-012/AC-012가 확정한 가짜 진행률 금지 원칙에 따라, 실제 데이터가 없는 한 UI는 정적 안내 이상을 표시하지 않는다.

### Out of Scope — 숫자 퍼센트·애니메이션 진행률 바

- 측정되지 않은 진행률을 암시하는 어떤 숫자 퍼센트, `role="progressbar"`, 애니메이션 진행률 바도 신규 도입하지 않는다(REQ-CASE-PROGRESS-003).

### Out of Scope — API/스키마/폴링 상수 변경

- `/api/cases/status`의 응답 스키마 변경, `lib/cases/job-timing.ts`의 폴링 간격·상한·리스 TTL 상수 변경, 신규 폴링 API 라우트 추가는 이 SPEC의 범위가 아니다(REQ-CASE-PROGRESS-006). 이 값들은 SPEC-PILOT-READY-001이 소유한다.

### Out of Scope — AnalysisStatusPanel 대기(idle) 상태 재설계

- `AnalysisStatusPanel`이 제출 전(idle) 상태에서 렌더링하는 "대기 중" 배지, 모든 단계 "대기" 라벨, 정적 진행 바(`w-0`)의 시각적 결과를 재설계하지 않는다 — REQ-CASE-PROGRESS-001이 요구하는 공유 상수로의 import 경로 교체만 허용되며, 그 결과물은 기존과 동일해야 한다.
