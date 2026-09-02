---
id: SPEC-PILOT-UX-001
title: "파일럿 사용성 개선 — 사건 입력→분석 대기→리포트 검토→피드백 제출 흐름"
version: "0.3.3"
status: draft
created: 2026-09-01
updated: 2026-09-02
author: Nexsol
priority: P1
phase: "v0.9.0 target"
module: "app/cases/new/, app/cases/[caseId]/"
lifecycle: spec-anchored
tags: "usability, ux, pilot, single-flight-guard, loading-state, evidence-display, feedback-form, error-boundary"
tier: M
depends_on: [SPEC-RESEARCH-001, SPEC-GEMINI-RUNTIME-001, SPEC-EVIDENCE-001, SPEC-FEEDBACK-001]
---

## HISTORY

- 2026-09-02 (iteration 6, plan-auditor 5차 감사 FAIL 대응 — D1 REQ-010 응답 분기 위반 + D2 M4 커버리지 갭): plan-auditor iteration-5(pre-run coherence correction 이후) 감사가 종합 점수 0.74로 FAIL한 데 대응한 수정. D1: 구 REQ-PILOT-UX-010이 검증 실패(필드별 오류 표시)와 예외/reject(폼-레벨 오류 + unhandled-rejection 금지)라는 구조적으로 다른 두 트리거를 묶고 있었을 뿐 아니라, REQ-002(단일 응답)와 달리 두 트리거의 **응답 자체가 실제로 분기**했다(공유되는 것은 가드 리셋뿐). REQ-002가 REQ-003을 참조하는 것과 동일한 방식으로 공유 가드-리셋을 교차 참조하며 원자적 단일-When 요구사항 2개로 분리했다 — 신 REQ-PILOT-UX-010(검증 실패 분기: 가드 리셋 + fieldErrors 표시)과 신 REQ-PILOT-UX-011(예외/reject 분기: 가드 리셋 + 폼-레벨 오류 + unhandled-rejection 금지). REQ 총량이 16→17로 늘어난 것을 상쇄하기 위해, 트리거 없이 전역 적용되는 두 Unwanted 제약(구 REQ-015 안전 문구, 구 REQ-016 개인정보)을 REQ-013(사건 폼 네트워크 예외)이 이미 쓰던 단일-트리거(없음)/복합-응답("shall not A and shall not B") 병합 패턴으로 하나의 REQ(신 REQ-016)로 통합했다. 순 변화 0(+1-1), REQ 총량 16 유지. 전체 REQ ID를 001~016으로 재넘버링(매핑: 구 001~009 불변, 구 010 분리→신 010/011, 구 011(섹션 그룹핑)→신 012, 구 012(빈 상태)→신 013, 구 013(네트워크 예외)→신 014, 구 014(error.tsx)→신 015, 구 015+016 병합→신 016). D2: plan.md M4 테스트 계획에 빠져 있던 AC-001(대기 인디케이터)/AC-002(필드 비활성화)를 `case-input-form.test.tsx` 불릿에, AC-012(섹션 그룹핑 DOM 구조)를 `feedback-form.test.tsx` 불릿에 추가해 AC-001~014의 M4 커버리지 갭을 해소했으며, AC-015/016은 render 테스트가 아닌 문구·diff 검토형 기준이라 M1-M4 대상에서 의도적으로 제외했다(iteration 6·7 감사 모두 올바른 판단으로 확인). spec.md 요구사항 표(Group E/F/G)·§4 교차 참조, plan.md §B M2/M3/M4의 REQ-ID 참조, acceptance.md AC Group E/F/G 헤더·AC-011/013/014 본문의 REQ-ID 참조를 모두 새 번호 체계로 갱신했다 — AC 본문 자체(시나리오 내용)는 재작성하지 않고 REQ-ID 레이블 및 M4 커버리지 갭만 보완했다.
- 2026-09-02 (pre-run coherence correction, plan-auditor iteration-5 PASS(0.98) 이후 커밋·푸시 완료 상태에서 수행): `/moai run` 진입 전 마지막 정합성 보정. 신규 SPEC 없음, DB/서버 write-path/스키마 변경 없음, client-only single-flight 결정 유지, REQ 16개 유지. (1) 피드백 폼 single-flight 실패 복구 계약 추가 — plan.md M2가 `submitGuardRef`를 `true`로 설정하지만 `result.success === false` 또는 `action` 예외/reject 시 가드 리셋을 명시하지 않아, 첫 검증 실패 이후 동일 마운트 인스턴스에서 영구적으로 재제출이 막힐 수 있던 결함을 발견·수정. REQ-PILOT-UX-010을 확장해 실패 트리거를 "`action`이 `{success:false}`를 반환하는 경우"와 "`action` 호출이 예외/reject되는 경우" 모두로 넓히고, 두 경우 모두 제출 가드와 대기 상태를 초기화해 재제출을 허용하도록 명시했다(REQ-PILOT-UX-007/010 기존 범위 안에서 정합화, 신규 REQ ID 없음). plan.md M2 첫 불릿을 성공/검증실패/예외-reject 3분기로 재작성했고, acceptance.md AC-PILOT-UX-011에 "실패 후 수정하여 재제출하면 action이 다시 호출됨"(검증 실패 분기)과 "action 예외/reject 후 폼-레벨 오류 표시 + 재제출 허용"(네트워크 분기) 두 개의 And 회귀 시나리오를 추가했다. (2) M4 자동 검증 범위를 AC와 정합화 — 기존 M4 계획에 빠져 있던 AC-005(요약 배너 순서/내용)/AC-006(집계 검증 상태+기존 pill 유지)/AC-007(evidenceType/issueTypes 양 surface)/AC-008(sourceUrl anchor attributes)/AC-013(claims/evidence 빈 상태)/AC-014(error.tsx 복구 UI+reset() 호출)를 검증하는 최소 render/component 테스트 계획을 `page.test.tsx`(신규)·`error.test.tsx`(신규)·기존 `feedback-form.test.tsx`/`case-input-form.test.tsx` 확장으로 plan.md M4에 추가했다 — 과설계된 Next.js 통합 테스트 하네스는 도입하지 않고 현재 테스트 스택(Vitest + jsdom, `@testing-library/react` 미설치 확인됨)에서 가장 작은 단위로 검증하도록 명시했다. (3) AC-PILOT-UX-016 문구 정정 — "This SPEC's diff touches only app/..." 문구가 `.moai` SPEC 문서 자체 변경 및 향후 sync 문서(CHANGELOG/README) 변경 때문에 문자 그대로는 항상 위배되는 비현실적 조건이었던 것을, "`.moai` plan/sync artifacts와 README/CHANGELOG 같은 문서 변경을 제외한 application/runtime implementation diff" 범위로 명확히 하고, 검증 대상을 runtime 파일 5개(`lib/db/schema.ts`/`lib/validation/case-input.ts`/`lib/feedback/schema.ts`/`lib/cases/create-case.ts`/`lib/feedback/submit-feedback.ts` 모두 unchanged)로 명시했다. (4) 이 correction은 spec.md §2 REQ-010 본문·근거 열, plan.md §B M2 첫 불릿·M4 전체, acceptance.md AC-011·AC-016만 수정했으며 그 외 REQ/AC/마일스톤은 건드리지 않았다 — REQ 개수·ID·client-only 결정 모두 불변.
- 2026-09-02 (iteration 5, plan-auditor 4차 감사 FAIL 대응 — REQ-002 잔존 MP-2 위반): plan-auditor iteration-4 감사가 종합 점수 0.875(informational)에도 불구하고 must-pass MP-2가 여전히 FAIL한 데 대응한 수정. iteration-4에서 재작성한 REQ-PILOT-UX-002가 "재호출됨"(When 트리거)과 "성공적으로 제출된 이후"(별개의 이벤트)라는 서로 다른 두 트리거를 여전히 하나의 When 요구사항에 묶고 있다는 지적이었다. REQ-PILOT-UX-002를 When 패턴에서 단일 While-패턴 요구사항으로 재작성했다 — "While 제출 가드가 활성 상태(핸들러 시작 시 설정되며, REQ-PILOT-UX-003에 따라 실패 시에만 해제됨)이면 ... 즉시 반환해야 한다"는 하나의 트리거(가드 활성 상태)가 요청 진행 중(in-flight)과 성공 후 미해제(post-success) 두 상태를 모두 자연스럽게 포괄하므로 결합이 아니다. REQ 개수·ID 변화 없음(단일 REQ 재작성). 아울러 이 REQ에 대해 "성공 제출 이후 재호출 시에도 차단되는가"를 검증하는 AC가 누락되어 있던 것을 확인 — acceptance.md AC-PILOT-UX-003에 post-success 재호출 케이스를 And 하위 시나리오로 추가했다(REQ-008/009 쌍의 AC-010처럼 in-flight 케이스와 post-success 케이스를 모두 독립적으로 Given/When/Then 검증 가능하도록 함). spec.md §2 REQ-002 본문·Type·근거 열, acceptance.md AC-PILOT-UX-003만 수정했으며 그 외 파일은 건드리지 않았다.
- 2026-09-02 (iteration 4, plan-auditor 3차 감사 FAIL 대응 — MP-2 GEARS 형식 위반): plan-auditor iteration-3 감사가 종합 점수 0.82로 FAIL(must-pass MP-2: GEARS 단일 트리거 형식 위반)한 데 대응한 수정. (1) 구 REQ-PILOT-UX-003(가드 반환+실패 시 리셋+성공 시 유지, 3개 절을 하나의 ID에 묶음)을 원자적 단일-트리거 요구사항 2개로 분리 — 새 REQ-PILOT-UX-002(When 가드 반환, 성공 시 지속을 복합 응답으로 흡수)와 새 REQ-PILOT-UX-003(When 실패 시 리셋). 두 REQ 모두에서 `useRef` 기반 구현 세부사항(HOW) 서술을 제거했다 — 이는 plan.md §B M2/M3에 이미 전부 명시되어 있다. (2) 구 REQ-PILOT-UX-008에서 동일한 `useRef` 구현 세부사항 전문(preamble)을 제거했다(분리하지 않음 — 원래 단일 트리거였음). (3) 구 REQ-PILOT-UX-009(성공 확인+비활성 유지, 재진입 시 재허용 — 2개의 독립적 트리거를 하나의 ID에 묶음)를 원자적 단일-트리거 요구사항 2개로 분리 — 새 REQ-PILOT-UX-008(When 성공 감지, 확인 표시+비활성 유지)과 새 REQ-PILOT-UX-009(When 새 인스턴스 마운트, 재허용). (4) REQ 총량이 16→18로 늘어난 것을 상쇄하기 위해, plan-auditor가 지목한 대로 동일 트리거를 공유하는 인접 요구사항 2쌍을 병합했다 — 구 REQ-PILOT-UX-001(대기 표시)+구 REQ-PILOT-UX-002(필드 비활성화)를 하나의 While 요구사항(복합 응답: 표시 렌더링 and 필드 비활성화)으로, 구 REQ-PILOT-UX-004(배너 렌더링)+구 REQ-PILOT-UX-005(집계 검증 상태)를 하나의 While 요구사항(복합 응답: 배너 렌더링 and 집계 상태 표시, shall-not 개별 pill 제거)으로 병합했다. 순 개수 변화 없음(+1+1-1-1=0), REQ 총량 16 유지. 전체 REQ ID를 001~016으로 연속 재넘버링했다(매핑: 구 001/002 병합→신 001, 구 003 분리→신 002/003, 구 004/005 병합→신 004, 구 006/007→신 005/006, 구 008→신 007, 구 009 분리→신 008/009, 구 010~016→신 010~016 그대로 — Group F/G의 신 012~016은 구 012~016과 동일한 숫자 값이다. 병합/분리가 서로 상쇄되어 Group F 진입 전 항목 총량이 11개로 변동 없었기 때문). spec.md 요구사항 표·§4 교차 참조, acceptance.md의 AC Group 헤더 REQ-ID 참조, plan.md §A/§B/§D의 REQ-ID 참조를 모두 새 번호 체계로 갱신했다 — AC 본문 자체는 plan-auditor의 관찰대로 이미 원자적으로 시나리오가 분해되어 있어 재작성하지 않고 REQ-ID 레이블만 갱신했다.
- 2026-09-02 (iteration 3, 외부 독립 리뷰 반영 — DB 기반 서버측 idempotency 범위 제외): 외부 독립 리뷰가 UI/UX 방향은 승인했으나, 이 SPEC의 서버측 DB 기반 idempotency 설계(구 REQ-PILOT-UX-003/008의 `submissionNonce` 컬럼 + unique index)가 이 SPEC의 범위를 실제로 벗어나며 동작하지도 않는다고 지적한 점을 반영한 수정. `createCase`의 실제 실행 순서는 `validate → runPipeline → cases insert → reports insert`이므로, `runPipeline` 실행 전 SELECT + 실행 후 unique index 접근으로는 동일 nonce를 가진 두 동시 요청이 모두 파이프라인을 실행하는 경합을 막지 못한다. (1) `cases.submissionNonce`/`feedback.submissionNonce` 컬럼, unique index, 신규 Drizzle 마이그레이션, `caseInputSchema`/`reportFeedbackPayloadSchema`의 `submissionNonce` 필드, `create-case.ts`/`submit-feedback.ts`의 DB-nonce dedup 로직을 전부 제거했다. (2) REQ-PILOT-UX-003(사건 중복 제출 방지)을 `case-input-form.tsx`의 `useRef` 기반 클라이언트 단일 흐름(single-flight) 가드로 재정의했다 — HTTP 실패/네트워크 예외 시 가드 리셋, 성공 시 라우팅으로 인한 언마운트까지 가드 유지. (3) REQ-PILOT-UX-008(피드백 중복 제출 방지)을 `feedback-form.tsx`의 동일한 `useRef` 가드로 재정의했고, REQ-PILOT-UX-009(성공 확인)를 확장해 성공 후 해당 마운트 인스턴스에서 제출 버튼이 계속 비활성 상태로 유지되도록 했다 — 새로고침/재진입으로 새 폼 인스턴스가 마운트되면 새 논리적 제출이 다시 허용된다(SPEC-FEEDBACK-001의 append-only 정책과 완전히 일치, 서버측 write-path는 전혀 수정하지 않음). (4) REQ-PILOT-UX-010의 필드별 오류 표시 계약을 `submit-feedback.ts`의 실제 `toFieldErrors`(경로의 최상위 키만 사용) 동작에 맞춰 정정했다 — 존재하지 않는 중첩 경로(`missedIssues.0.description`)가 아니라 실제 최상위 키(`overallRating`/`overallComment`/`missedIssues`/`claimAssessments`/`evidenceAssessments`/`outcome`/`_form`) 기준으로 재작성했다. (5) AC-PILOT-UX-007의 잘못된 `QueryIssueType` fixture(`DISABILITY_GRADE`)를 실제 SSOT 값(`DISABILITY_GRADE_CRITERIA`)으로 수정했다. (6) `app/cases/new/loading.tsx`(신규) 계획 항목을 제거했다 — 이를 생성하는 마일스톤이 없었고 클라이언트측 대기 표시(REQ-PILOT-UX-001)만으로 충분하다. (7) REQ-PILOT-UX-006에 `evidenceType`/`issueTypes` 원시 enum 값에 대한 선택적 한글 표시 레이블 매핑을 추가했다(필수 아님). (8) Definition of Done의 포맷 검사 명령을 실제 `package.json` 스크립트(`pnpm format:check`)에 맞춰 정정했다. 진정한 분산 서버측 idempotency(예약/대기/완료 상태 전이 + 크래시 복구)는 이 SPEC의 범위가 아니며 후속 SPEC 후보로 명시적으로 미룬다(§Out of Scope 신규 항목 참고).
- 2026-09-01 (iteration 2, plan-auditor FAIL 대응): plan-auditor 1차 감사 FAIL(D1/MP-7 must-pass 위반 1건 + blocking-class 결함 2건, 종합 점수 0.875)에 대응한 수정. (1) plan.md §A decision 1의 `[NEEDS CLARIFICATION: exact unique-index syntax for Drizzle Kit on SQLite]` 마커를 SQLite 공식 문서("For the purposes of UNIQUE constraints, NULL values are considered distinct from all other values, including other NULLs" — sqlite.org/lang_createtable.html, WebFetch로 검증) 근거로 해소 — 이 프로젝트의 `drizzle.config.ts` dialect가 `turso`(libSQL, SQLite 호환 포크)이므로 동일 NULL 처리 의미론이 적용됨을 확인. (2) 원래의 REQ-PILOT-UX-014가 두 개의 서로 다른 의무(사건 생성 fetch 실패 처리 — When형 + `error.tsx` 오류 경계 제공 — Ubiquitous형)를 하나의 When 요구사항에 묶고 있던 것을 분리하고, 이로 인해 REQ 총량이 16→17이 되어 Tier M 상한(16)을 초과하는 것을 상쇄하기 위해 원래의 REQ-PILOT-UX-003과 REQ-PILOT-UX-004(둘 다 idempotency nonce 범위를 다루는 인접 요구사항, plan-auditor가 지목한 병합 후보 REQ-003/009/011 중 하나)를 "And" 복합절로 병합했다. 순 개수 변화가 없도록(병합 -1, 분리 +1) 전체 REQ ID를 001~016으로 연속 재넘버링: 원래 005~016 항목이 004~015로 한 칸씩 당겨지고, 분리된 신규 항목(error.tsx 오류 경계)이 새 REQ-PILOT-UX-014로 배정되어 Group F(명시적 UI 상태)에 3개 항목(012 빈 상태, 013 fetch 실패, 014 오류 경계)이 위치하며, 이어지는 Group G(비기능 제약)는 우연히 기존과 동일한 015/016 번호를 유지한다. plan.md/acceptance.md/progress.md의 모든 REQ ID 참조를 새 번호 체계로 일괄 갱신했으며, REQ↔AC 1:1 추적성은 acceptance.md에서 그대로 유지된다. (3) 새 번호 기준 REQ-PILOT-UX-001/004/007(원래 001/005/008)의 Type 열이 실제로는 조건부(While) 서술임에도 "Ubiquitous"로 오기재되어 있던 것을 "While"로 정정(요구사항 본문은 변경하지 않음).
- 2026-09-01: 최초 작성 (Nexsol) — 이미 구현이 완료된 `사건 입력 → Gemini 분석 대기 → ResearchReport 검토 → 구조화 피드백 제출` 흐름(SPEC-RESEARCH-001/SPEC-GEMINI-RUNTIME-001/SPEC-EVIDENCE-001/SPEC-FEEDBACK-001의 산출물)을, 신규 비즈니스 기능 없이 UI/UX 계층에서만 다듬어 소수의 전문 손해사정사가 비공개 파일럿에서 일상적으로 실사용 가능하게 만든다. 사용자가 오케스트레이터 세션에서 직접 지정한 7개 영역(대기 상태, 중복 제출 방지, 리포트 정보 위계, 근거자료 표시, 피드백 폼 사용성, 명시적 UI 상태, 데스크톱 우선)을 이 SPEC의 범위로 고정하며, 실제 코드베이스 조사(read-only)로 확인된 구체적 결함만을 근거 삼는다.

## §1. 개요 (Overview)

### WHY — 배경 및 동기

`app/cases/new/case-input-form.tsx`(사건 입력) → `lib/cases/create-case.ts`(파이프라인 동기 실행) → `app/cases/[caseId]/page.tsx`(리포트 표시) → `app/cases/[caseId]/feedback-form.tsx`(구조화 피드백 제출)로 이어지는 핵심 흐름은 SPEC-RESEARCH-001·SPEC-GEMINI-RUNTIME-001·SPEC-EVIDENCE-001·SPEC-FEEDBACK-001을 거치며 기능적으로는 이미 완성되어 있다. 그러나 실제 코드를 읽어보면, 소수 전문가가 일상적으로 반복 사용하기에는 다음과 같은 구체적인 사용성 결함이 남아 있다:

- 사건 입력 제출 시 버튼 텍스트("제출 중...") 외에는 진행 표시가 없고, 나머지 입력 필드는 제출 중에도 계속 활성 상태다(`case-input-form.tsx:134-136`).
- 사건 생성(`app/api/cases/route.ts` → `lib/cases/create-case.ts`)과 피드백 제출(`lib/feedback/submit-feedback.ts`)은 더블클릭이나 빠른 재클릭에 대한 클라이언트측 방어가 없다 — `disabled={isSubmitting}`만으로는 첫 클릭 직후 React 상태 갱신 이전 타이밍에 두 번째 클릭이 통과할 수 있다.
- 리포트 화면(`app/cases/[caseId]/page.tsx:81-262`)은 5개의 개별 카드를 순서대로 렌더링할 뿐, 스크롤 없이 핵심 결론(진단명·전체 검증 상태)을 한눈에 파악할 수 있는 최상단 요약이 없다.
- `EvidenceCandidate`(`lib/pipeline/types.ts:62-75`)와 `evidence` 테이블(`lib/db/schema.ts:80-98`)에는 `evidenceType`·`issueTypes`가 이미 존재하지만, 화면의 `EvidenceDisplay` 타입(`page.tsx:19-22`, `feedback-form.tsx:16-19`)은 `title`·`sourceUrl`만 SELECT·렌더링하며 두 필드를 전혀 노출하지 않는다.
- 피드백 제출 성공 시 아무 시각적 확인도 없다(`feedback-form.tsx:109-115` — 성공 분기에 UI 변화가 없음). 실패 시에는 `Object.values(result.fieldErrors).flat().join(" ")`(`feedback-form.tsx:111`)로 여러 필드 오류가 한 문자열로 뭉쳐 표시된다.
- 저장소 전체에 `error.tsx`/`loading.tsx`/`not-found.tsx`가 하나도 없으며, `case-input-form.tsx`의 `fetch` 호출(`:30-39`)에는 `.catch()`가 없어 네트워크 수준 실패가 처리되지 않은 프라미스 거부로 전파된다.

### WHAT — 이번 SPEC 범위

사용자가 직접 지정한 7개 영역 중 6개를 GEARS 요구사항으로 고정한다(7번째 "데스크톱 우선"은 신규 기능이 아니라 범위 제외 선언이므로 §Out of Scope에서 다룬다):

1. 사건 입력 → 분석 대기 상태의 시각적 표시 강화
2. 사건 중복 제출 방지(클라이언트측 단일 흐름 가드)
3. 리포트 정보 위계 개선(최상단 요약/검증 상태 배너)
4. 근거자료(evidence) 표시 개선(`evidenceType`/`issueTypes`/클릭 가능한 링크)
5. 구조화 피드백 폼 사용성(제출 대기·중복 방지, 성공 확인, 필드별 오류, 섹션 그룹핑)
6. 명시적 빈 상태/오류 상태 UI

기존 API·DB·파이프라인 계약은 전혀 수정하지 않는다 — 이번 SPEC은 신규 스키마 변경이나 마이그레이션을 전혀 요구하지 않는다. 유일하게 확장되는 조회는 `evidence` SELECT 프로젝션(REQ-PILOT-UX-005)이며, 이는 이미 SPEC-EVIDENCE-001에서 도입된 `evidenceType`/`issueTypes` 컬럼을 애플리케이션 레벨에서 추가로 조회(SELECT)하는 것뿐, DDL 변경이 아니다. 사건/피드백 중복 제출 방지는 순수 클라이언트측(`useRef` 기반 단일 흐름 가드)으로만 구현하며(REQ-PILOT-UX-002/003/007), 어떤 서버측 write-path나 요청 본문 스키마도 수정하지 않는다.

### 핵심 판단 근거 — Tier M

영향 파일은 `app/cases/new/case-input-form.tsx`, `app/cases/[caseId]/{page.tsx,feedback-form.tsx,error.tsx(신규)}`, 그리고 대응 테스트 파일들(단위 테스트 2-3개 + e2e 시나리오 확장)로 약 6-8개, 예상 변경량 200-500 LOC 범위다. 서버측 write-path(`lib/cases/create-case.ts`, `lib/feedback/submit-feedback.ts`)와 스키마(`lib/db/schema.ts`)는 전혀 수정하지 않는다 — UI 계층 다듬기와 클라이언트측 단일 흐름 가드만이 범위다. 파일 수가 Tier S 기준(5개 미만)을 넘고, 서로 다른 6개 요구사항 그룹(대기 상태/중복 제출 방지/정보 위계/근거자료 표시/피드백 사용성/명시적 UI 상태)에 걸쳐 화면 간 일관성 검토가 필요하므로, 스키마 마이그레이션이 없어졌음에도 Tier S가 아닌 Tier M으로 유지한다(15개 파일·1000 LOC를 넘는 Tier L에는 해당하지 않는다).

## §2. 요구사항 (Requirements — GEARS 표기법)

### A. 사건 입력 — 대기 상태 (Pending UX)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-UX-001 | While | While `/api/cases` POST 요청이 진행 중인 상태이면, 사건 입력 폼(`case-input-form.tsx`)은 제출 버튼 텍스트 변경만이 아니라 진행 중임을 나타내는 시각적 진행 표시(스피너 또는 이에 준하는 인디케이터)를 렌더링해야 하며, 모든 입력 필드(`incidentDescription`, `diagnosisName`, `disabilityBodyPart`, `incidentDate`)를 제출 버튼과 함께 비활성화해야 한다 — 파이프라인(`lib/pipeline/index.ts`의 `withPipelineLock` 프로세스 전역 뮤텍스로 순차 실행)이 완료될 때까지 수 초 이상 걸릴 수 있는 구간 동안 이 표시와 비활성화가 지속되어야 한다. | 사용자 지시 §1(대기 UX), `case-input-form.tsx:16-22,62-136,134-136` 조사 결과; plan-auditor iteration-3 MP-2 대응(동일 트리거를 공유하는 구 REQ-001/002 병합) |

### B. 사건 중복 제출 방지 (클라이언트 단일 흐름 가드)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-UX-002 | While | While 제출 가드가 활성 상태(핸들러 시작 시 설정되며, REQ-PILOT-UX-003에 따라 실패 시에만 해제됨)이면, 사건 입력 폼(`case-input-form.tsx`)은 `handleSubmit`이 다시 호출되더라도 새 `fetch` 요청을 보내지 않고 즉시 반환해야 한다 — 이 단일 트리거는 요청이 진행 중이라 가드가 켜져 있는 상태(in-flight, 더블클릭 등)와 성공적으로 제출되어 가드가 해제되지 않은 상태(post-success — 실패 시에만 해제되므로 언마운트 전까지 유지됨)를 모두 자연스럽게 포괄하며, 서버측 write-path나 요청 본문 스키마에 대한 어떤 변경도 요구하지 않는다. | 외부 독립 리뷰(서버측 DB 기반 idempotency가 `createCase`의 `validate → runPipeline → insert` 순서상 동시 요청 경합을 막지 못함을 지적), 사용자 지시 §2(중복 제출 방지, 최소 변경 원칙); plan-auditor iteration-4 MP-2 대응(When 복합-트리거를 REQ-003과 연동되는 단일 While-트리거로 재작성 — in-flight/post-success 두 상태를 하나의 가드-활성 조건으로 통합) |
| REQ-PILOT-UX-003 | When(이벤트 감지) | When 사건 생성 요청이 실패로 감지되면(HTTP 비-201 응답 또는 네트워크 수준 fetch 예외 포함), 사건 입력 폼은 제출 가드를 초기 상태로 리셋하여 재제출을 허용해야 한다. | 외부 독립 리뷰, 사용자 지시 §2(중복 제출 방지); plan-auditor iteration-3 MP-2 대응(구 REQ-003의 트리거를 원자적으로 분리) |

### C. 리포트 정보 위계 (Report Hierarchy)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-UX-004 | While | While 리포트가 존재할 때, 사건 상세 화면(`page.tsx`)은 기존 5개 카드(사건 요약/검토할 담보 목록/추가로 검토할 담보·근거자료·반대 논리/추가 필요 자료/판단 불충분 사유)보다 먼저 렌더링되는 최상단 요약 배너를 제공해야 하며, 이 배너는 진단명과 장해 부위를 스크롤 없이 노출해야 하고, 리포트의 `verifiedClaims` 배열을 집계한 전체 검증 상태 신호(예: "N건 중 M건 근거 확인, K건 판단 불충분")도 함께 표시해야 한다 — 이는 집계 신호를 추가하는 것이며, 개별 주장(claim)마다 이미 존재하는 `VERIFIED`/`INSUFFICIENT` 상태 표시(`page.tsx:127-137`의 `claim-status` pill)를 제거하거나 대체해서는 안 된다. | 사용자 지시 §3(정보 위계, VERIFIED/INSUFFICIENT 상태 가시성), `page.tsx:81-92,116-138` 조사 결과; plan-auditor iteration-3 MP-2 대응(동일 트리거를 공유하는 구 REQ-004/005 병합) |

### D. 근거자료 표시 (Evidence Display)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-UX-005 | Ubiquitous | 사건 상세 화면과 피드백 폼이 각각 사용하는 `EvidenceDisplay` 조회(`page.tsx:45-58`의 Drizzle SELECT)는 현재 `title`·`sourceUrl`만 프로젝션하는데, `evidence` 테이블(`lib/db/schema.ts:80-98`)의 `evidenceType`·`issueTypes` 컬럼도 함께 조회하도록 확장되어야 하며, 두 화면 모두 각 근거자료 참조마다 `evidenceType`(예: PRECEDENT/STATUTE/POLICY/DISPUTE_CASE/OTHER)과 `issueTypes`를 함께 렌더링해야 한다. (선택 사항) 원시 enum 값 대신 한글 표시 레이블 매핑(예: PRECEDENT→판례, POLICY→약관, STATUTE→법령, DISPUTE_CASE→분쟁사례, OTHER→기타, DISABILITY_GRADE_CRITERIA→장해 평가 기준)을 적용해도 무방하며, 이는 이 요구사항의 필수 충족 조건은 아니다. | 사용자 지시 §4(근거자료 표시), `page.tsx:19-22,45-58`·`feedback-form.tsx:16-19`·`lib/pipeline/types.ts:59-75` 조사 결과 |
| REQ-PILOT-UX-006 | While | 근거자료의 `sourceUrl`이 존재하는 경우, 원시 텍스트(현재 `page.tsx:147-149`의 `<span>{item.sourceUrl}</span>` 패턴)가 아니라 클릭 가능한 링크(`<a href={sourceUrl} target="_blank" rel="noopener noreferrer">`)로 렌더링되어야 한다. | 사용자 지시 §4(근거자료 표시), `page.tsx:147-149,176-181,196-203` 조사 결과 |

### E. 피드백 폼 사용성 (Feedback Form Usability)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-UX-007 | When(이벤트 감지) | When `submitReportFeedback`가 이미 진행 중인 상태에서 다시 호출되면, 새 `feedback` 행을 삽입하지 않고 즉시 반환해야 한다 — 이는 순수 클라이언트 단일 흐름 방지이며, `ReportFeedbackPayload` 스키마(`lib/feedback/schema.ts`)나 서버측 write-path(`submitReportFeedback`)에 대한 어떤 변경도 요구하지 않는다. SPEC-FEEDBACK-001이 명시적으로 확정한 append-only 정책(동일 `(reportId, userId)` 조합에 유일성 제약을 두지 않으며, 최초 리뷰와 이후 실제 결과 확인처럼 서로 다른 논리적 제출이 여러 번 허용됨, `SPEC-FEEDBACK-001` HISTORY 참조)은 이 SPEC에서 전혀 수정되지 않는다. | 외부 독립 리뷰, 사용자 지시 §5(중복 제출 방지), `submit-feedback.ts:104-113`(append-only 확인) 및 `SPEC-FEEDBACK-001` HISTORY(append-only 정책 원문) |
| REQ-PILOT-UX-008 | When(이벤트 감지) | When 피드백 제출이 성공으로 감지되면, 피드백 폼(`feedback-form.tsx`)은 눈에 띄는 성공 확인 표시(성공 메시지 요소, 또는 이에 준하는 시각적 확인)를 렌더링해야 하며, 그 마운트된 폼 인스턴스에서는 제출 버튼을 계속 비활성 상태로 유지해야 한다. 현재는 `handleSubmit`(`feedback-form.tsx:78-116`)의 성공 분기(`if (!result.success)`가 거짓인 경로)에 아무 UI 변화도 없다. | 외부 독립 리뷰, 사용자 지시 §5(성공 확인), `feedback-form.tsx:109-115` 조사 결과; plan-auditor iteration-3 MP-2 대응(구 REQ-009의 트리거를 원자적으로 분리) |
| REQ-PILOT-UX-009 | When(이벤트 감지) | When 페이지 새로고침 또는 재진입으로 피드백 폼의 새 인스턴스가 마운트되면, 새로운 논리적 제출이 다시 허용되어야 한다 — 이는 SPEC-FEEDBACK-001의 append-only 정책과 일치하며, 이전 인스턴스의 성공 상태가 새 인스턴스의 제출을 막아서는 안 된다. | 외부 독립 리뷰, 사용자 지시 §5(성공 확인 이후 재진입 시나리오); plan-auditor iteration-3 MP-2 대응(구 REQ-009의 트리거를 원자적으로 분리) |
| REQ-PILOT-UX-010 | When(이벤트 감지) | When `submitReportFeedback` action이 `{ success: false, fieldErrors }`를 반환하면, 피드백 폼은 제출 가드(REQ-PILOT-UX-007이 정의하는 가드)를 초기 상태로 리셋해 재제출을 허용해야 하며, `result.fieldErrors`(`Record<string, string[]>`)를 필드별로 분리해 각 필드 근처에 표시해야 하고, `Object.values(result.fieldErrors).flat().join(" ")`(`feedback-form.tsx:111`)처럼 여러 필드의 오류 메시지를 하나의 문자열로 뭉쳐 표시해서는 안 된다. 실제 서버측 키 집합은 `submit-feedback.ts`의 `toFieldErrors`(Zod issue의 `path[0]`만 사용, 중첩 경로 아님)가 생성하는 최상위 키 — `overallRating`/`overallComment`/`missedIssues`/`claimAssessments`/`evidenceAssessments`/`outcome`/`_form` — 이며, 피드백 폼은 각 최상위 키에 대응하는 논리적 섹션(전체 평가/전체 코멘트/누락 쟁점/개별 주장 평가/개별 근거자료 평가/실제 결과) 아래에 해당 `fieldErrors[key]`를 개별 `<p>` 요소로 렌더링해야 한다 — `case-input-form.tsx`의 기존 필드별 오류 표시 패턴(`fieldErrors.x?.map(...)`, `:73-77,90-94,107-111,125-129`)을 재사용해야 한다. | 사용자 지시 §5(필드별 검증 오류), `submit-feedback.ts:28-37`(`toFieldErrors` 실제 동작)·`feedback-form.tsx:110-112`·`case-input-form.tsx:73-77` 조사 결과; plan-auditor iteration-6 D1 대응(REQ-002가 REQ-003을 참조하는 것과 동일한 방식으로, 응답이 실제로 분기되는 구 REQ-010을 검증실패/예외 두 갈래로 원자적 분리) |
| REQ-PILOT-UX-011 | When(이벤트 감지) | When `submitReportFeedback` action 호출이 예외를 던지거나 반환한 프라미스가 reject되면, 피드백 폼은 제출 가드(REQ-PILOT-UX-007이 정의하는 가드)를 초기 상태로 리셋해 재제출을 허용해야 하며, 사람이 읽을 수 있는 폼-레벨 오류 메시지를 표시해야 하고, 어떤 예외도 unhandled promise rejection으로 전파되어서는 안 된다. | 사용자 지시 §5(오류 처리), pre-run coherence correction(피드백 single-flight 실패 복구 계약); plan-auditor iteration-6 D1 대응(구 REQ-010의 예외/reject 분기를 원자적으로 분리 — 검증실패 분기와 응답이 실제로 다르므로) |
| REQ-PILOT-UX-012 | Ubiquitous | 피드백 폼은 전체 평가/누락 쟁점/개별 주장 평가/개별 근거자료 평가/실제 결과의 다섯 섹션(현재 `feedback-form.tsx:119-320`에 시각적 구분 없이 순서대로 나열됨)을 시각적으로 구분된 그룹(구획선, 섹션 제목, 또는 카드)으로 표시해야 한다. | 사용자 지시 §5(섹션 그룹핑), `feedback-form.tsx:118-320` 조사 결과 |

### F. 명시적 UI 상태 (Empty / Error States)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-UX-013 | While | While 리포트의 `verifiedClaims`가 0개이거나 인용된 distinct evidence ID가 0개인 상태이면, 사건 상세 화면은 각각에 대해 명시적인 빈 상태 안내 문구를 표시해야 한다 — 이미 동일한 방식으로 처리된 `reviewTargets`(`page.tsx:105-107`)/`missingMaterials`(`page.tsx:230-234`)/`uncertainty`(`page.tsx:252-256`) 빈 배열 케이스와 동일한 관례를 따라야 한다. | 사용자 지시 §6(빈 상태), `page.tsx:99-217` 조사 결과(claims/evidence 블록에 빈 상태 문구 부재 확인) |
| REQ-PILOT-UX-014 | When(이벤트 감지) | When 사건 생성 요청이 실패로 감지되면(HTTP 비-201 응답 또는 네트워크 수준 fetch 예외 포함), 사건 입력 폼은 사용자에게 사람이 읽을 수 있는 오류 메시지를 표시해야 하며 어떤 예외도 unhandled promise rejection으로 전파되어서는 안 된다(현재 `case-input-form.tsx:30-39`의 `fetch` 호출에 `.catch()`가 없음). | 사용자 지시 §6(API/분석 실패), `case-input-form.tsx:30-39` 조사 결과 |
| REQ-PILOT-UX-015 | Ubiquitous | 사건 상세 경로(`app/cases/[caseId]/`)는 Next.js App Router `error.tsx` 오류 경계를 제공해야 하며, 렌더링/데이터 조회 중 발생하는 예외가 빈 화면이 아닌 복구 안내 화면으로 노출되도록 해야 한다(현재 저장소 전체에 `error.tsx`가 하나도 존재하지 않음). | 사용자 지시 §6(API/분석 실패), 저장소 전체 `error.tsx` 부재 조사 결과 |

### G. 비기능 제약 — 안전 문구·개인정보 보존 (Non-Functional Constraints)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-UX-016 | Unwanted | 이 SPEC이 도입·수정하는 어떤 UI 문구·폼·스키마·컬럼도 (a) 보험금 지급 가능성을 확정적/단정적으로 서술해서는 안 되며 — "검토 필요", "관련성이 높은 근거", "전문가 확인 필요", "현재 정보만으로 판단 불충분" 계열의 기존 안전 문구 원칙을 유지해야 하고, (b) 신규 개인정보 수집 필드(주민등록번호, 전화번호, 상세주소, 의료기록·보험증권 원본 파일 업로드 등)를 추가해서는 안 되며 `lib/validation/case-input.ts`/`lib/feedback/schema.ts`의 기존 PII 차단 검증(`piiFreeText` 등)을 약화시켜서도 안 된다 — 이 SPEC은 어떤 스키마도 수정하지 않는다. | 사용자 지시 §HARD constraints(안전 문구 보존, 개인정보 정책); plan-auditor iteration-6 D1 offset(구 REQ-010 분리로 늘어난 REQ 개수를 상쇄하기 위해, 트리거 없는 두 Unwanted 제약을 REQ-014(사건 폼 네트워크 예외)가 이미 쓰던 것과 동일한 단일-트리거(없음)/복합-응답("shall not A and shall not B") 병합 패턴으로 통합 — 구 REQ-015+016) |

## Out of Scope

### Out of Scope — 분산 서버측(DB 기반) idempotency

- 예약(pending)/완료(completed) 상태 전이, 크래시 복구, DB 트랜잭션 기반 동시성 제어를 포함하는 진정한 분산 서버측 idempotency는 이 SPEC의 범위가 아니다 — 외부 독립 리뷰에서 지적된 대로, 현재 `createCase`의 `validate → runPipeline → insert` 순서상 SELECT-후-unique-index 접근으로는 동시 요청 경합을 실제로 막을 수 없으며, 이를 올바르게 해결하려면 별도의 설계(예: 사전 예약 행 삽입 + 상태 전이)가 필요하다. 이 SPEC은 클라이언트측 단일 흐름(single-flight) 방지(REQ-PILOT-UX-002/003/007)로 범위를 한정하며, 서버측 분산 idempotency는 후속 SPEC 후보로 명시적으로 미룬다.

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
- `SPEC-EVIDENCE-001` — `evidenceType`/`issueTypes`/`QUERY_ISSUE_TYPES` SSOT의 출처 — REQ-PILOT-UX-005의 데이터 출처
- `SPEC-FEEDBACK-001` — 구조화 피드백 스키마·write-path·append-only 정책의 출처 — REQ-PILOT-UX-007~012가 그 위에 UI 사용성만 추가
