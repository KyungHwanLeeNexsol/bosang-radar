---
id: SPEC-PILOT-UX-001
title: "파일럿 사용성 개선 — 사건 입력→분석 대기→리포트 검토→피드백 제출 흐름"
version: "0.1.1"
status: draft
created: 2026-09-01
updated: 2026-09-01
author: Nexsol
priority: P1
phase: "v0.9.0 target"
module: "app/cases/new/, app/cases/[caseId]/, lib/cases/, lib/feedback/, lib/db/schema.ts"
lifecycle: spec-anchored
tags: "usability, ux, pilot, idempotency, loading-state, evidence-display, feedback-form, error-boundary"
tier: M
depends_on: [SPEC-RESEARCH-001, SPEC-GEMINI-RUNTIME-001, SPEC-EVIDENCE-001, SPEC-FEEDBACK-001]
---

## HISTORY

- 2026-09-01 (iteration 2, plan-auditor FAIL 대응): plan-auditor 1차 감사 FAIL(D1/MP-7 must-pass 위반 1건 + blocking-class 결함 2건, 종합 점수 0.875)에 대응한 수정. (1) plan.md §A decision 1의 `[NEEDS CLARIFICATION: exact unique-index syntax for Drizzle Kit on SQLite]` 마커를 SQLite 공식 문서("For the purposes of UNIQUE constraints, NULL values are considered distinct from all other values, including other NULLs" — sqlite.org/lang_createtable.html, WebFetch로 검증) 근거로 해소 — 이 프로젝트의 `drizzle.config.ts` dialect가 `turso`(libSQL, SQLite 호환 포크)이므로 동일 NULL 처리 의미론이 적용됨을 확인. (2) 원래의 REQ-PILOT-UX-014가 두 개의 서로 다른 의무(사건 생성 fetch 실패 처리 — When형 + `error.tsx` 오류 경계 제공 — Ubiquitous형)를 하나의 When 요구사항에 묶고 있던 것을 분리하고, 이로 인해 REQ 총량이 16→17이 되어 Tier M 상한(16)을 초과하는 것을 상쇄하기 위해 원래의 REQ-PILOT-UX-003과 REQ-PILOT-UX-004(둘 다 idempotency nonce 범위를 다루는 인접 요구사항, plan-auditor가 지목한 병합 후보 REQ-003/009/011 중 하나)를 "And" 복합절로 병합했다. 순 개수 변화가 없도록(병합 -1, 분리 +1) 전체 REQ ID를 001~016으로 연속 재넘버링: 원래 005~016 항목이 004~015로 한 칸씩 당겨지고, 분리된 신규 항목(error.tsx 오류 경계)이 새 REQ-PILOT-UX-014로 배정되어 Group F(명시적 UI 상태)에 3개 항목(012 빈 상태, 013 fetch 실패, 014 오류 경계)이 위치하며, 이어지는 Group G(비기능 제약)는 우연히 기존과 동일한 015/016 번호를 유지한다. plan.md/acceptance.md/progress.md의 모든 REQ ID 참조를 새 번호 체계로 일괄 갱신했으며, REQ↔AC 1:1 추적성은 acceptance.md에서 그대로 유지된다. (3) 새 번호 기준 REQ-PILOT-UX-001/004/007(원래 001/005/008)의 Type 열이 실제로는 조건부(While) 서술임에도 "Ubiquitous"로 오기재되어 있던 것을 "While"로 정정(요구사항 본문은 변경하지 않음).
- 2026-09-01: 최초 작성 (Nexsol) — 이미 구현이 완료된 `사건 입력 → Gemini 분석 대기 → ResearchReport 검토 → 구조화 피드백 제출` 흐름(SPEC-RESEARCH-001/SPEC-GEMINI-RUNTIME-001/SPEC-EVIDENCE-001/SPEC-FEEDBACK-001의 산출물)을, 신규 비즈니스 기능 없이 UI/UX 계층에서만 다듬어 소수의 전문 손해사정사가 비공개 파일럿에서 일상적으로 실사용 가능하게 만든다. 사용자가 오케스트레이터 세션에서 직접 지정한 7개 영역(대기 상태, 중복 제출 방지, 리포트 정보 위계, 근거자료 표시, 피드백 폼 사용성, 명시적 UI 상태, 데스크톱 우선)을 이 SPEC의 범위로 고정하며, 실제 코드베이스 조사(read-only)로 확인된 구체적 결함만을 근거 삼는다.

## §1. 개요 (Overview)

### WHY — 배경 및 동기

`app/cases/new/case-input-form.tsx`(사건 입력) → `lib/cases/create-case.ts`(파이프라인 동기 실행) → `app/cases/[caseId]/page.tsx`(리포트 표시) → `app/cases/[caseId]/feedback-form.tsx`(구조화 피드백 제출)로 이어지는 핵심 흐름은 SPEC-RESEARCH-001·SPEC-GEMINI-RUNTIME-001·SPEC-EVIDENCE-001·SPEC-FEEDBACK-001을 거치며 기능적으로는 이미 완성되어 있다. 그러나 실제 코드를 읽어보면, 소수 전문가가 일상적으로 반복 사용하기에는 다음과 같은 구체적인 사용성 결함이 남아 있다:

- 사건 입력 제출 시 버튼 텍스트("제출 중...") 외에는 진행 표시가 없고, 나머지 입력 필드는 제출 중에도 계속 활성 상태다(`case-input-form.tsx:134-136`).
- 사건 생성(`app/api/cases/route.ts` → `lib/cases/create-case.ts`)과 피드백 제출(`lib/feedback/submit-feedback.ts`)은 서버측 중복 제출 방지 장치가 전혀 없다 — 클라이언트의 `disabled={isSubmitting}`만이 유일한 방어선이다.
- 리포트 화면(`app/cases/[caseId]/page.tsx:81-262`)은 5개의 개별 카드를 순서대로 렌더링할 뿐, 스크롤 없이 핵심 결론(진단명·전체 검증 상태)을 한눈에 파악할 수 있는 최상단 요약이 없다.
- `EvidenceCandidate`(`lib/pipeline/types.ts:62-75`)와 `evidence` 테이블(`lib/db/schema.ts:80-98`)에는 `evidenceType`·`issueTypes`가 이미 존재하지만, 화면의 `EvidenceDisplay` 타입(`page.tsx:19-22`, `feedback-form.tsx:16-19`)은 `title`·`sourceUrl`만 SELECT·렌더링하며 두 필드를 전혀 노출하지 않는다.
- 피드백 제출 성공 시 아무 시각적 확인도 없다(`feedback-form.tsx:109-115` — 성공 분기에 UI 변화가 없음). 실패 시에는 `Object.values(result.fieldErrors).flat().join(" ")`(`feedback-form.tsx:111`)로 여러 필드 오류가 한 문자열로 뭉쳐 표시된다.
- 저장소 전체에 `error.tsx`/`loading.tsx`/`not-found.tsx`가 하나도 없으며, `case-input-form.tsx`의 `fetch` 호출(`:30-39`)에는 `.catch()`가 없어 네트워크 수준 실패가 처리되지 않은 프라미스 거부로 전파된다.

### WHAT — 이번 SPEC 범위

사용자가 직접 지정한 7개 영역 중 6개를 GEARS 요구사항으로 고정한다(7번째 "데스크톱 우선"은 신규 기능이 아니라 범위 제외 선언이므로 §Out of Scope에서 다룬다):

1. 사건 입력 → 분석 대기 상태의 시각적 표시 강화
2. 사건 중복 제출 방지(서버측 idempotency)
3. 리포트 정보 위계 개선(최상단 요약/검증 상태 배너)
4. 근거자료(evidence) 표시 개선(`evidenceType`/`issueTypes`/클릭 가능한 링크)
5. 구조화 피드백 폼 사용성(제출 대기·중복 방지, 성공 확인, 필드별 오류, 섹션 그룹핑)
6. 명시적 빈 상태/오류 상태 UI

기존 API·DB·파이프라인 계약은 최대한 보존하며, 이번 SPEC이 요구하는 유일한 스키마 변경은 `cases`/`feedback` 테이블에 각각 추가하는 nullable idempotency-nonce 컬럼(REQ-PILOT-UX-003/008)과 `evidence` SELECT 프로젝션 확장(REQ-PILOT-UX-006)뿐이다 — 둘 다 가산적(additive)이고 하위 호환이다.

### 핵심 판단 근거 — Tier M

영향 파일은 `app/cases/new/{case-input-form.tsx,loading.tsx(신규)}`, `app/cases/[caseId]/{page.tsx,feedback-form.tsx,actions.ts,error.tsx(신규)}`, `lib/cases/{create-case.ts,get-case-for-owner.ts}`, `lib/feedback/{submit-feedback.ts,schema.ts}`, `lib/db/schema.ts`(신규 마이그레이션), 그리고 대응 테스트 파일들로 약 10-14개, 예상 변경량 300-1000 LOC 범위다. UI 계층 다듬기가 중심이며 파이프라인 알고리즘이나 인증 구조를 건드리는 아키텍처 전반 결정은 없으므로 15개 파일·1000 LOC를 넘는 Tier L에는 해당하지 않는다. 다만 5개 파일을 넘고 스키마 마이그레이션(nullable 컬럼 2개)을 동반하므로 Tier S가 아닌 Tier M으로 분류한다.

## §2. 요구사항 (Requirements — GEARS 표기법)

### A. 사건 입력 — 대기 상태 (Pending UX)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-UX-001 | While | While `/api/cases` POST 요청이 진행 중인 상태이면, 사건 입력 폼(`case-input-form.tsx`)은 제출 버튼 텍스트 변경만이 아니라 진행 중임을 나타내는 시각적 진행 표시(스피너 또는 이에 준하는 인디케이터)를 렌더링해야 한다 — 파이프라인(`lib/pipeline/index.ts`의 `withPipelineLock` 프로세스 전역 뮤텍스로 순차 실행)이 완료될 때까지 수 초 이상 걸릴 수 있는 구간 동안 이 표시가 지속되어야 한다. | 사용자 지시 §1(대기 UX), `case-input-form.tsx:134-136` 조사 결과 |
| REQ-PILOT-UX-002 | While | While `/api/cases` POST 요청이 진행 중인 상태이면, 사건 입력 폼의 모든 입력 필드(`incidentDescription`, `diagnosisName`, `disabilityBodyPart`, `incidentDate`)는 제출 버튼과 함께 비활성화되어야 한다 — 현재는 제출 버튼만 `disabled={isSubmitting}`이고 나머지 필드는 제출 중에도 계속 편집 가능한 상태다. | `case-input-form.tsx:16-22, 62-136` 조사 결과 |

### B. 사건 중복 제출 방지 (Idempotency)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-UX-003 | When(이벤트 감지) | 사건 입력 폼은 폼이 마운트될 때 클라이언트측 idempotency 토큰(`submissionNonce`, 재렌더링 간 동일 값 유지)을 1회 생성해 `/api/cases` POST 요청 본문에 포함해야 하며, When 동일 `submissionNonce`를 가진 재요청이 감지되면(더블클릭·네트워크 재시도 포함), 사건 생성 write-path(`lib/cases/create-case.ts`)는 새 파이프라인 실행이나 신규 `cases`/`reports` 행 생성을 다시 수행하지 않고 최초 성공 결과(`caseId`)를 그대로 반환해야 한다. And 사건 입력 폼은 이 `submissionNonce`를 폼이 언마운트(페이지 이동/새로고침)되기 전까지 재사용해야 하며, 성공적인 제출로 다른 화면으로 라우팅된 이후 사용자가 새로 사건 입력 화면에 진입하면 새 `submissionNonce`가 생성되어야 한다 — 이는 idempotency 범위를 "동일 폼 세션 내 반복 요청"으로 한정하며, 서로 다른 두 건의 정당한 사건 제출을 병합하지 않는다. | 사용자 지시 §2(중복 제출 방지, 최소 변경 원칙 — request-scoped debounce token), `create-case.ts` 조사 결과(서버측 dedup 부재 확인) |

### C. 리포트 정보 위계 (Report Hierarchy)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-UX-004 | While | 사건 상세 화면(`page.tsx`)은 리포트가 존재할 때, 기존 5개 카드(사건 요약/검토할 담보 목록/추가로 검토할 담보·근거자료·반대 논리/추가 필요 자료/판단 불충분 사유)보다 먼저 렌더링되는 최상단 요약 배너를 제공해야 하며, 이 배너는 진단명과 장해 부위를 스크롤 없이 노출해야 한다. | 사용자 지시 §3(정보 위계), `page.tsx:81-92` 조사 결과 |
| REQ-PILOT-UX-005 | Ubiquitous | 최상단 요약 배너는 리포트의 `verifiedClaims` 배열을 집계한 전체 검증 상태 신호(예: "N건 중 M건 근거 확인, K건 판단 불충분")를 표시해야 한다 — 이 요구사항은 집계 신호를 추가하는 것이며, 개별 주장(claim)마다 이미 존재하는 `VERIFIED`/`INSUFFICIENT` 상태 표시(`page.tsx:127-137`의 `claim-status` pill)를 제거하거나 대체해서는 안 된다. | 사용자 지시 §3(VERIFIED/INSUFFICIENT 상태 가시성), `page.tsx:116-138` 조사 결과 |

### D. 근거자료 표시 (Evidence Display)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-UX-006 | Ubiquitous | 사건 상세 화면과 피드백 폼이 각각 사용하는 `EvidenceDisplay` 조회(`page.tsx:45-58`의 Drizzle SELECT)는 현재 `title`·`sourceUrl`만 프로젝션하는데, `evidence` 테이블(`lib/db/schema.ts:80-98`)의 `evidenceType`·`issueTypes` 컬럼도 함께 조회하도록 확장되어야 하며, 두 화면 모두 각 근거자료 참조마다 `evidenceType`(예: PRECEDENT/STATUTE/POLICY/DISPUTE_CASE/OTHER)과 `issueTypes`를 함께 렌더링해야 한다. | 사용자 지시 §4(근거자료 표시), `page.tsx:19-22,45-58`·`feedback-form.tsx:16-19`·`lib/pipeline/types.ts:59-75` 조사 결과 |
| REQ-PILOT-UX-007 | While | 근거자료의 `sourceUrl`이 존재하는 경우, 원시 텍스트(현재 `page.tsx:147-149`의 `<span>{item.sourceUrl}</span>` 패턴)가 아니라 클릭 가능한 링크(`<a href={sourceUrl} target="_blank" rel="noopener noreferrer">`)로 렌더링되어야 한다. | 사용자 지시 §4(근거자료 표시), `page.tsx:147-149,176-181,196-203` 조사 결과 |

### E. 피드백 폼 사용성 (Feedback Form Usability)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-UX-008 | When(이벤트 감지) | 피드백 제출 write-path(`submitReportFeedback`)는 클라이언트가 함께 전달하는 요청-scope idempotency 토큰(`submissionNonce`)을 받아, When 동일 `(reportId, userId, submissionNonce)` 조합의 반복 요청이 감지되면(더블클릭·네트워크 재시도) 새 `feedback` 행을 다시 삽입하지 않고 최초 삽입 결과(`{ success: true, feedbackId, caseId }`)를 그대로 반환해야 한다. 이 idempotency는 SPEC-FEEDBACK-001이 명시적으로 확정한 append-only 정책(동일 `(reportId, userId)` 조합에 유일성 제약을 두지 않으며, 최초 리뷰와 이후 실제 결과 확인처럼 서로 다른 논리적 제출이 여러 번 허용됨, `SPEC-FEEDBACK-001` HISTORY 참조)을 절대 훼손해서는 안 되며, 오직 동일 nonce(동일 폼 렌더링 세션에서의 반복 클릭/재시도)로만 범위가 한정되어야 한다 — 폼이 새로고침되거나 다시 렌더링되어 새 `submissionNonce`가 생성되면, 이는 항상 새로운 논리적 제출로 처리(append)되어야 한다. | 사용자 지시 §5(중복 제출 방지), `submit-feedback.ts:104-113`(append-only 확인) 및 `SPEC-FEEDBACK-001` HISTORY(append-only 정책 원문) |
| REQ-PILOT-UX-009 | When(이벤트 감지) | When 피드백 제출이 성공으로 감지되면, 피드백 폼(`feedback-form.tsx`)은 사용자에게 눈에 띄는 성공 확인 표시(성공 메시지 요소, 또는 이에 준하는 시각적 확인)를 렌더링해야 한다 — 현재는 `handleSubmit`(`feedback-form.tsx:78-116`)의 성공 분기(`if (!result.success)`가 거짓인 경로)에 아무 UI 변화도 없다. | 사용자 지시 §5(성공 확인), `feedback-form.tsx:109-115` 조사 결과 |
| REQ-PILOT-UX-010 | When(이벤트 감지) | When 피드백 제출이 실패로 감지되면, 피드백 폼은 `result.fieldErrors`(`Record<string, string[]>`)를 필드별로 분리해 각 필드 근처에 표시해야 하며, `Object.values(result.fieldErrors).flat().join(" ")`(`feedback-form.tsx:111`)처럼 여러 필드의 오류 메시지를 하나의 문자열로 뭉쳐 표시해서는 안 된다 — `case-input-form.tsx`의 기존 필드별 오류 표시 패턴(`fieldErrors.x?.map(...)`, `:73-77,90-94,107-111,125-129`)을 재사용해야 한다. | 사용자 지시 §5(필드별 검증 오류), `feedback-form.tsx:110-112`·`case-input-form.tsx:73-77` 조사 결과 |
| REQ-PILOT-UX-011 | Ubiquitous | 피드백 폼은 전체 평가/누락 쟁점/개별 주장 평가/개별 근거자료 평가/실제 결과의 다섯 섹션(현재 `feedback-form.tsx:119-320`에 시각적 구분 없이 순서대로 나열됨)을 시각적으로 구분된 그룹(구획선, 섹션 제목, 또는 카드)으로 표시해야 한다. | 사용자 지시 §5(섹션 그룹핑), `feedback-form.tsx:118-320` 조사 결과 |

### F. 명시적 UI 상태 (Empty / Error States)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-UX-012 | While | While 리포트의 `verifiedClaims`가 0개이거나 인용된 distinct evidence ID가 0개인 상태이면, 사건 상세 화면은 각각에 대해 명시적인 빈 상태 안내 문구를 표시해야 한다 — 이미 동일한 방식으로 처리된 `reviewTargets`(`page.tsx:105-107`)/`missingMaterials`(`page.tsx:230-234`)/`uncertainty`(`page.tsx:252-256`) 빈 배열 케이스와 동일한 관례를 따라야 한다. | 사용자 지시 §6(빈 상태), `page.tsx:99-217` 조사 결과(claims/evidence 블록에 빈 상태 문구 부재 확인) |
| REQ-PILOT-UX-013 | When(이벤트 감지) | When 사건 생성 요청이 실패로 감지되면(HTTP 비-201 응답 또는 네트워크 수준 fetch 예외 포함), 사건 입력 폼은 사용자에게 사람이 읽을 수 있는 오류 메시지를 표시해야 하며 어떤 예외도 unhandled promise rejection으로 전파되어서는 안 된다(현재 `case-input-form.tsx:30-39`의 `fetch` 호출에 `.catch()`가 없음). | 사용자 지시 §6(API/분석 실패), `case-input-form.tsx:30-39` 조사 결과 |
| REQ-PILOT-UX-014 | Ubiquitous | 사건 상세 경로(`app/cases/[caseId]/`)는 Next.js App Router `error.tsx` 오류 경계를 제공해야 하며, 렌더링/데이터 조회 중 발생하는 예외가 빈 화면이 아닌 복구 안내 화면으로 노출되도록 해야 한다(현재 저장소 전체에 `error.tsx`가 하나도 존재하지 않음). | 사용자 지시 §6(API/분석 실패), 저장소 전체 `error.tsx` 부재 조사 결과 |

### G. 비기능 제약 — 안전 문구·개인정보 보존 (Non-Functional Constraints)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-UX-015 | Unwanted | 이 SPEC이 도입·수정하는 어떤 UI 문구(요약 배너, 성공 확인, 오류 메시지, 빈 상태 안내 포함)도 보험금 지급 가능성을 확정적/단정적으로 서술해서는 안 된다 — "검토 필요", "관련성이 높은 근거", "전문가 확인 필요", "현재 정보만으로 판단 불충분" 계열의 기존 안전 문구 원칙을 그대로 유지해야 한다. | 사용자 지시 §HARD constraints(안전 문구 보존) |
| REQ-PILOT-UX-016 | Unwanted | 이 SPEC이 도입·수정하는 어떤 폼·스키마·컬럼(idempotency nonce 컬럼 포함)도 신규 개인정보 수집 필드(주민등록번호, 전화번호, 상세주소, 의료기록·보험증권 원본 파일 업로드 등)를 추가해서는 안 되며, `lib/validation/case-input.ts`/`lib/feedback/schema.ts`의 기존 PII 차단 검증(`piiFreeText` 등)을 약화시켜서도 안 된다. | 사용자 지시 §HARD constraints(개인정보 정책) |

## Out of Scope

### Out of Scope — Gold Dataset 추출/집계

- 축적된 구조화 피드백 행을 실제 Gold Dataset으로 추출·가공·내보내는 도구는 이 SPEC의 범위가 아니다(SPEC-FEEDBACK-001에서 이미 후속 SPEC으로 명시적으로 미뤄진 항목).

### Out of Scope — 관리자 분석/대시보드

- 관리자용 분석 대시보드, 집계 통계, 피드백 분석 UI/API는 이 SPEC에서 다루지 않는다.

### Out of Scope — 근거자료 코퍼스 확장

- 대규모 evidence corpus 확장(신규 판례·약관 대량 추가)은 이 SPEC의 범위가 아니다 — 기존 seed 데이터 규모를 그대로 사용한다.

### Out of Scope — 신규 담보·청구 유형 도메인

- 현재 지원되는 담보/청구 유형 이외의 신규 도메인 확장은 이 SPEC에서 다루지 않는다.

### Out of Scope — 검색 인프라

- Vector DB, 별도 검색 엔진 등 신규 검색 인프라 도입은 이 SPEC의 범위가 아니다(`tech.md`의 "무료 tier 우선, 불필요한 overengineering 금지" 원칙과 일치 — 현재 evidence 검색은 Drizzle ORM 쿼리로 충분하다는 기존 판단을 유지).

### Out of Scope — 모바일 앱 및 반응형 재설계

- 모바일 네이티브 앱, 모바일 우선 반응형 재설계는 이 SPEC에서 다루지 않는다 — 이 도구는 데스크톱 우선 전문가용 업무 도구로 유지하며, 별도의 모바일 지원 작업을 이 SPEC에 포함하지 않는다.

### Out of Scope — 디자인 시스템 재작성

- shadcn/ui + Tailwind CSS 조합을 대체하는 신규 디자인 시스템 도입이나 기존 컴포넌트 아키텍처의 재작성은 이 SPEC의 범위가 아니다 — 필요한 신규 UI 요소는 기존 손으로 작성한 상태-표시 패턴(예: `page.tsx:127-137`의 status pill)을 재사용하거나, 최소한의 shadcn/ui 프리미티브 추가로 해결한다.

### Out of Scope — AI 파이프라인 알고리즘 변경

- `lib/pipeline/*`, `lib/ai/*`의 런타임 계약(`ResearchReport`/`VerifiedClaim`/`EvidenceCandidate` 등)이나 파이프라인 알고리즘(CaseNormalizer→QueryPlanner→EvidenceRetriever→Researcher→Skeptic→Verifier)은 이 SPEC에서 수정하지 않는다 — 오직 기존 산출물을 UI에서 더 잘 보여주는 것만 다룬다.

### Out of Scope — 프로덕션 배포

- Vercel 프로덕션 배포 설정, CI/CD 자동화는 이 SPEC의 범위가 아니다.

## §3. 인수 조건 요약

인수 조건 전체(Given-When-Then 시나리오)는 `.moai/specs/SPEC-PILOT-UX-001/acceptance.md`에 정의한다(Tier M — 별도 파일).

## §4. 교차 참조

- `SPEC-RESEARCH-001` — `ResearchReport`/`VerifiedClaim`/`EvidenceCandidate` 타입 계약과 리포트 렌더링 구조의 출처
- `SPEC-GEMINI-RUNTIME-001` — Gemini 파이프라인 실행 런타임(`withPipelineLock`, 재시도/백오프)의 출처 — REQ-PILOT-UX-001의 대기 시간 근거
- `SPEC-EVIDENCE-001` — `evidenceType`/`issueTypes`/`QUERY_ISSUE_TYPES` SSOT의 출처 — REQ-PILOT-UX-006의 데이터 출처
- `SPEC-FEEDBACK-001` — 구조화 피드백 스키마·write-path·append-only 정책의 출처 — REQ-PILOT-UX-008~011이 그 위에 UI 사용성만 추가
