---
id: SPEC-FEEDBACK-001
title: "리포트 단위 전문가 구조화 피드백 (Gold Dataset 축적 기반)"
version: "0.1.0"
status: draft
created: 2026-09-01
updated: 2026-09-01
author: Nexsol
priority: P1
phase: "v0.9.0 target"
module: "lib/feedback/, lib/db/schema.ts, lib/cases/get-case-for-owner.ts, lib/validation/case-input.ts, app/cases/[caseId]/"
lifecycle: spec-anchored
tags: "feedback, expert-review, gold-dataset, insurance-claims, drizzle-migration"
tier: M
depends_on: [SPEC-RESEARCH-001, SPEC-SCAFFOLD-001]
---

## HISTORY

- 2026-09-01: 최초 작성 (Nexsol) — 손해사정사/보험 전문가가 특정 사건의 AI 리서치 리포트(`reports` 테이블, `SPEC-RESEARCH-001`의 `ResearchReport` 산출물)에 구조화된 피드백을 남길 수 있도록 기존 `feedback` 테이블(전체 사건에 대한 자유 텍스트 코멘트 1개 필드, `SPEC-SCAFFOLD-001` 도입)을 리포트 단위 구조화 스키마로 확장한다. `case → report → expert feedback` 흐름 중 마지막 단계만을 다루며, Gold Dataset 자체의 집계·추출은 후속 SPEC으로 명시적으로 미룬다(§ Out of Scope). 사용자와의 사전 Socratic 라운드(오케스트레이터 세션)에서 데이터 모델·검증 분리·소유권 검사·append-only 정책이 이미 확정되었으므로, 이 SPEC은 그 결정을 GEARS 요구사항으로 고정한다.

## §1. 개요 (Overview)

### WHY — 배경 및 동기

현재 `feedback` 테이블(`lib/db/schema.ts`)은 `caseId`/`userId`/`content`(자유 텍스트)/`createdAt`만 가지며, `app/cases/[caseId]/actions.ts`의 `submitFeedback()`이 이를 소비한다. 이 구현에는 두 가지 실질적 한계가 있다: (1) Zod 검증이 전혀 없어 PII 형식 텍스트가 그대로 저장될 수 있고, (2) `caseId`가 클라이언트 입력을 그대로 신뢰해 소유권 검사(`getCaseForOwner()`가 다른 모든 조회 경로에서 강제하는 `ownerUserId` 스코핑, `@MX:ANCHOR`)를 우회한다. 또한 피드백이 "사건 전체"에 대한 자유 텍스트 한 줄일 뿐이라, 리포트의 어느 부분(주장/근거/누락 쟁점)에 대한 의견인지 구조적으로 구분할 수 없어 향후 Gold Dataset 구축에 재사용하기 어렵다.

### WHAT — 이번 SPEC 범위

- `feedback` 테이블을 `reportId`(NOT NULL, `reports.id` FK, cascade) + `payload`(JSON, 구조화 스키마) 중심으로 확장하고, 기존 `content` 자유 텍스트 필드는 제거한다.
- 리포트에 대한 구조화 피드백 payload(전체 평가, 누락 쟁점, 개별 주장(claim) 평가, 개별 근거자료(evidence) 평가, 선택적 실제 결과 기록)를 Zod로 정적 검증하고, 참조 무결성(주장 인덱스·근거자료 ID의 실존 여부)을 write-path 함수에서 동적 검증한다.
- 소유권 검사는 기존 `getCaseForOwner()`의 `ownerUserId` 앵커 패턴과 동일한 원칙(사건 소유자만 제출 가능)을 리포트 기반 write-path에 적용하며, `caseId`는 절대 클라이언트 입력을 신뢰하지 않고 서버에서 `reportId → caseId`로 항상 재도출한다.
- 사건 상세 화면(`app/cases/[caseId]/page.tsx`)의 기존 자유 텍스트 피드백 폼을 위 구조화 payload를 입력하는 최소 UI로 완전히 대체한다.
- 제출은 append-only이며(`reportId`, `userId`) 쌍에 대한 유일성 제약이 없다 — 동일 사용자가 동일 리포트에 여러 번(예: 최초 리뷰 + 이후 실제 결과 확인) 제출할 수 있고, 매 제출은 새 행으로 누적된다.

### 핵심 판단 근거 — Tier M

`lib/db/schema.ts`(기존 테이블 컬럼 변경 + Drizzle migration), `lib/feedback/`(신규 타입·검증·write-path 3개 파일), `lib/cases/get-case-for-owner.ts`(리포트 ID 노출을 위한 최소 확장), `lib/validation/case-input.ts`(`piiFreeText` export 전환), `app/cases/[caseId]/{page.tsx,actions.ts,actions.test.ts}`, `e2e/case-flow.spec.ts` 등 약 9-10개 파일에 걸치며 예상 변경량이 300-1000 LOC 범위다. 신규 데이터 모델(`ReportFeedbackPayload`)과 신규 write-path 함수라는 단일 서브시스템 확장이지만, 파일 수가 5개를 넘고 스키마 마이그레이션을 동반하므로 Tier S가 아닌 Tier M으로 분류한다. 15개 파일 또는 1000 LOC를 넘지 않고, 아키텍처 전반에 걸친 신규 알고리즘 결정이 없으므로 Tier L에는 해당하지 않는다.

## §2. 요구사항 (Requirements — GEARS 표기법)

### A. 데이터 모델 (Data Model)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-FEEDBACK-001 | Ubiquitous | `feedback` 테이블은 `id`(text PK), `caseId`(text NOT NULL, `cases.id` FK, cascade), `reportId`(text NOT NULL, `reports.id` FK, cascade), `userId`(text NOT NULL, `user.id` FK, cascade), `payload`(json mode text, NOT NULL), `createdAt`(timestamp, NOT NULL) 컬럼을 가져야 하며, 기존 자유 텍스트 `content` 컬럼은 스키마에서 제거되어야 한다. | 사용자 지시 §데이터 모델, 오케스트레이터 사전 확정 |
| REQ-FEEDBACK-002 | Ubiquitous + Unwanted | 피드백 제출은 append-only여야 한다 — 동일 `(reportId, userId)` 조합에 대해 유일성 제약을 두어서는 안 되며, 기존 피드백 행을 수정(update)하거나 삭제(delete)하는 API/Server Action을 제공해서는 안 된다. | 사용자 지시 §user-confirmed design decisions #4 |

### B. 피드백 Payload 정적 검증 (Zod)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-FEEDBACK-003 | Ubiquitous | 피드백 payload 검증 스키마는 `overallRating` 필드를 필수로 요구해야 하며, 그 값은 `"ACCURATE"`, `"PARTIALLY_ACCURATE"`, `"INACCURATE"` 중 하나로 제한되어야 한다. | 사용자 지시 §데이터 모델 |
| REQ-FEEDBACK-004 | Ubiquitous | 피드백 payload 검증 스키마는 선택적 `missedIssues` 배열(기본값 빈 배열)을 허용해야 하며, 각 항목의 `issueType`은 `lib/pipeline/types.ts`가 export하는 `QUERY_ISSUE_TYPES` 상수를 그대로 import해 8개 값의 부분집합으로 제한해야 한다 — 8개 값을 별도 리터럴 배열로 재선언해서는 안 된다(drift 방지, `db/seed/evidence-seed-schema.ts`와 동일한 SSOT 재사용 관례). | 사용자 지시 §Codebase facts (QueryIssueType SSOT), §payload shape |
| REQ-FEEDBACK-005 | Ubiquitous | 피드백 payload 검증 스키마는 선택적 `claimAssessments` 배열(기본값 빈 배열)을 허용해야 하며, 각 항목은 정수 `claimIndex`, `verdict`(`"CORRECT"` \| `"INCORRECT"` \| `"NEEDS_MORE_EVIDENCE"`), 선택적 `correctedReasoning`을 가져야 한다. `correctedReasoning`은 `verdict` 값과 무관하게 항상 선택 입력이어야 한다(특정 verdict일 때만 필수로 요구해서는 안 된다). | 사용자 지시 §payload shape ("자유롭게 선택 입력") |
| REQ-FEEDBACK-006 | Ubiquitous | 피드백 payload 검증 스키마는 선택적 `evidenceAssessments` 배열(기본값 빈 배열)을 허용해야 하며, 각 항목은 `evidenceId`(문자열)와 `verdict`(`"USEFUL"` \| `"WEAK"` \| `"IRRELEVANT"`)를 가져야 한다. | 사용자 지시 §payload shape |
| REQ-FEEDBACK-007 | Ubiquitous | 피드백 payload 검증 스키마는 선택적 `outcome` 객체를 허용해야 하며, 존재할 경우 `description`(문자열)과 `confirmedAt`(ISO 날짜 문자열)을 모두 가져야 한다. 별도의 결과 분류 taxonomy(enum)를 새로 만들어서는 안 된다 — `description`은 자유 텍스트다. | 사용자 지시 §payload shape ("선택적 결과 기록", "발명된 taxonomy 없음") |
| REQ-FEEDBACK-008 | Unwanted | 피드백 payload 검증 스키마는 (a) `overallComment`, `missedIssues[].description`, `claimAssessments[].correctedReasoning`, `outcome.description` 등 모든 자유 텍스트 필드에 대해 `lib/validation/case-input.ts`의 `piiFreeText` 헬퍼(주민등록번호·전화번호 형식 정규식 거부)를 재사용해야 하며 정규식을 별도로 재구현해서는 안 되고, (b) 스키마에 정의되지 않은 최상위 키(예: 클라이언트가 임의로 끼워 넣은 `caseId`)를 구조적으로 거부(`.strict()`)해야 하며, (c) 상세주소·의료기록 원본·주민등록번호·전화번호에 해당하는 필드를 이번 SPEC이 신설하는 어떤 필드에도 정의해서는 안 된다. | 사용자 지시 §Codebase facts (`piiFreeText`), §Explicit scope boundaries (PII 금지) |

### C. 참조 무결성 검증 및 소유권 (Write-Path, 동적 검증)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-FEEDBACK-009 | When(이벤트 감지) | 피드백 제출 요청의 호출자가 `reportId`가 속한 사건의 `ownerUserId`와 일치하지 않는 사용자로 감지되면(When-detected), 피드백 write-path 함수는 요청을 거부하고 어떤 행도 삽입하지 않아야 한다 — `lib/cases/get-case-for-owner.ts`가 다른 모든 사건 조회 경로에서 강제하는 것과 동일한 `ownerUserId` 앵커 원칙을 따라야 한다. | 사용자 지시 §user-confirmed design decisions #3, `get-case-for-owner.ts` `@MX:ANCHOR` |
| REQ-FEEDBACK-010 | Ubiquitous + Unwanted | 피드백 write-path 함수는 영속화에 사용할 `caseId`를 오직 `reportId`로 조회한 `reports` 행의 `caseId` 컬럼에서만 도출해야 하며, 함수의 공개 시그니처는 `caseId`를 별도 입력 파라미터로 받아서는 안 된다 — 클라이언트가 어떤 경로로든 제시하는 `caseId` 값을 영속화에 신뢰하거나 사용해서는 안 된다(cross-case spoofing 방지). | 사용자 지시 §payload shape 주석 ("server-derived from the report row, NEVER trust client-supplied caseId") |
| REQ-FEEDBACK-011 | When(이벤트 감지) | `claimAssessments[].claimIndex` 중 하나 이상이 해당 `reportId`가 가리키는 실제 저장된 리포트의 `content.verifiedClaims` 배열 길이 범위(`0 <= claimIndex < length`)를 벗어난 것으로 감지되면, 피드백 write-path 함수는 요청을 거부하고 어떤 행도 삽입하지 않아야 한다. | 사용자 지시 §payload shape ("bounds-checked server-side against the actual stored report") |
| REQ-FEEDBACK-012 | When(이벤트 감지) | `evidenceAssessments[].evidenceId` 중 하나 이상이 `evidence` 테이블에 실제로 존재하는 `id` 값이 아닌 것으로 감지되면, 피드백 write-path 함수는 요청을 거부하고 어떤 행도 삽입하지 않아야 한다. 이 검사는 단순 존재 여부(existence-only) 확인이며, 해당 `evidenceId`가 그 리포트의 주장들이 실제로 인용한 근거자료 ID 집합에 포함되는지까지 추가로 교차검증해서는 안 된다(사용자 명시적 단순화 결정). | 사용자 지시 §user-confirmed design decisions #2 |
| REQ-FEEDBACK-013 | Ubiquitous | 피드백 write-path 함수는 정적 검증(§B) 또는 동적 검증(REQ-FEEDBACK-009~012) 실패 시 `{ success: false, fieldErrors: Record<string, string[]> }` 형태의 구조화된 결과를 반환해야 하며, 예외를 던지는 방식으로 실패를 전파해서는 안 된다 — `lib/cases/create-case.ts`의 `CreateCaseResult` 판별 유니온 패턴과 동일한 형태를 따라야 한다. | 사용자 지시 §Design note (`createCase()` 패턴 재사용) |

### D. UI

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-FEEDBACK-014 | Ubiquitous | 사건 상세 화면은 전체 평가 선택, 누락 쟁점 추가, 개별 주장(claim)별 verdict 선택, 개별 근거자료(evidence)별 verdict 선택, 선택적 실제 결과 입력을 위한 컨트롤을 제공해야 하며, 각 신규 상호작용 요소는 `data-testid` 관례를 유지해야 한다. | 사용자 지시 §Deliverables #4 |
| REQ-FEEDBACK-015 | Unwanted | 사건 상세 화면은 REQ-FEEDBACK-014의 구조화 피드백 폼과 별개로, 옛 자유 텍스트 전용 피드백 입력 경로(기존 `feedback-content`/`feedback-submit` 자유 텍스트 필드)를 병행 유지해서는 안 된다 — 옛 경로는 신규 구조화 폼으로 완전히 대체되어야 한다. | 사용자 지시 §user-confirmed design decisions #1 ("완전히 대체") |

## Out of Scope

### Out of Scope — AI 학습/파인튜닝

- 수집된 피드백을 사용한 AI 자동 학습·파인튜닝은 이 SPEC의 범위가 아니다.

### Out of Scope — Gold Dataset 추출/집계

- 축적된 구조화 피드백 행을 실제 Gold Dataset으로 추출·가공·내보내는 도구 자체는 이 SPEC의 범위가 아니다 — 이 SPEC은 원시 구조화 행을 누적하는 것까지만 다루며, 추출/집계는 후속 SPEC에서 다룬다.

### Out of Scope — 관리자 대시보드/통계

- 피드백에 대한 관리자 대시보드, 집계 통계, 또는 어떤 형태의 피드백 분석 UI/API도 이 SPEC의 범위가 아니다.

### Out of Scope — 역할/권한 체계

- "리뷰어(reviewer)"라는 사건 소유자와 구분되는 별도 역할이나, 그 어떤 역할/권한 관리 시스템도 이 SPEC에서 도입하지 않는다. 제출 권한은 오직 사건 소유자(`ownerUserId` 일치) 여부로만 판정한다.

### Out of Scope — 피드백 수정/삭제/이력 조회

- 기존에 제출된 피드백 행을 수정하거나 삭제하는 기능은 이 SPEC의 범위가 아니다(REQ-FEEDBACK-002).
- 특정 리포트에 대해 과거 제출된 모든 피드백을 나열하는 이력/목록 조회 화면·API도 이 SPEC의 범위가 아니다 — MVP는 제출(submission)까지만 다룬다.

### Out of Scope — 파이프라인/리포트 생성 로직 변경

- `lib/pipeline/*`, `lib/ai/*`의 어떤 런타임 계약(`ResearchReport`/`VerifiedClaim`/`EvidenceCandidate` 등)이나 `reports`/`evidence` 테이블 스키마도 이 SPEC에서 수정하지 않는다 — 이 SPEC은 그 산출물을 오직 읽기 전용으로만 참조한다.

### Out of Scope — 신규 PII 필드

- 주민등록번호, 전화번호, 상세주소, 원본 의료·보험 문서에 해당하는 어떤 신규 필드도 이 SPEC이 신설하는 스키마·payload에 정의하지 않는다(REQ-FEEDBACK-008).

## §3. 인수 조건 요약

인수 조건 전체(Given-When-Then 시나리오)는 `.moai/specs/SPEC-FEEDBACK-001/acceptance.md`에 정의한다(Tier M — 별도 파일).

## §4. 교차 참조

- `SPEC-RESEARCH-001` — `ResearchReport`/`VerifiedClaim` 타입 계약의 출처(§8 design.md)
- `SPEC-SCAFFOLD-001` — 기존 `feedback` 테이블과 `getCaseForOwner()` 앵커 패턴의 출처
- `SPEC-EVIDENCE-001` — `QUERY_ISSUE_TYPES` SSOT 상수 및 zod-import-SSOT 관례의 출처
