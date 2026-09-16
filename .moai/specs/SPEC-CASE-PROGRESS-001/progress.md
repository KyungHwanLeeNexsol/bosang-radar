# SPEC-CASE-PROGRESS-001 진행 기록

## §E.1 Plan-phase Audit-Ready Signal

plan_status: audit-ready
plan_complete_at: 2026-09-16
tier: M
artifacts: spec.md, plan.md, acceptance.md (progress.md — 본 파일, Tier 카운트 제외)
depends_on 상태 확인: SPEC-UI-MIGRATION-001(status: completed), SPEC-PILOT-READY-001(status: completed) — 둘 다 충족됨(run-phase pre-flight 자동 통과 예상)

### Plan Audit Verdict (Iteration 1)

verdict: FAIL
overall_score: 0.75 (Tier M threshold: 0.80)
audited_at: 2026-09-16
report: .moai/reports/plan-audit/SPEC-CASE-PROGRESS-001-review-1.md

Category scores: Clarity 0.75, Completeness 1.0, Testability 0.50, Traceability 1.0.

Key finding (blocking, critical): REQ-CASE-PROGRESS-004 and AC-CASE-PROGRESS-005 assume `/api/cases/status` can return `{"status": "queued"}`, but direct inspection of `app/api/cases/status/route.ts:47-53` shows the endpoint's non-terminal fallback is a hardcoded literal `{ status: "processing" }` — `"queued"` is never emitted in the JSON response. This also contradicts REQ-CASE-PROGRESS-006's Out-of-Scope prohibition on API/schema changes, since satisfying REQ-004 as written would require modifying that fallback. Must be resolved (narrow REQ-004/AC-005, or scope in a route.ts change) before re-audit. See the report for the full defect list (D1-D4) and remediation options.

depends_on re-verification: confirmed directly from frontmatter — SPEC-UI-MIGRATION-001 (status: completed), SPEC-PILOT-READY-001 (status: completed), SPEC-RESEARCH-001 (status: completed, referenced in Out-of-Scope prose). No D7 BLOCKING finding.

### Iteration 1 → Iteration 2 개정 (manager-spec)

revised_at: 2026-09-16
resolution: 사용자 확정(AskUserQuestion) — REQ-CASE-PROGRESS-004(queued/processing 구분 표시) 및 AC-CASE-PROGRESS-004/AC-CASE-PROGRESS-005 제거. 백엔드(`app/api/cases/status/route.ts`)는 변경하지 않음(원 제약 그대로 유지).
verified_directly: `app/api/cases/status/route.ts:47-53`를 직접 재읽음 — 비종료 상태는 항상 고정 리터럴 `{"status": "processing"}`을 반환하며, `"queued"`는 어떤 내부 DB 상태에서도 JSON 응답으로 노출되지 않음. D1/D2 결함 확인.
changes:
  - spec.md: HISTORY에 개정 경위 기록. WHY 3문단 및 WHAT 범위 목록의 "4개 상태값 반환" 오기술을 "3가지 응답 형태(completed/failed/고정 processing)"로 정정. §2 Group B(REQ-CASE-PROGRESS-004) 제거(결번 처리). §4 교차 참조 및 Out of Scope에 제거 근거 추가.
  - plan.md: 결정 2(jobPhase state 도입안) 제거, 구 결정 3 → 결정 2로 재번호. M3(waitForCaseJob 상태 전달) 제거, 구 M4~M6 → M3~M5로 재번호. §D 리스크 2(queued 관측 희소성) 제거, 구 리스크 3 → 리스크 2로 재번호. §E 교차참조의 "4개 상태값" 오기술 정정.
  - acceptance.md: Group B 헤더를 "회귀 방지(기존 폴링 종료 분기)"로 변경. AC-CASE-PROGRESS-004/AC-CASE-PROGRESS-005 제거. AC-CASE-PROGRESS-006은 REQ 미결부 일반 회귀 가드로 재태깅(ID는 유지). 엣지 케이스에서 queued 관련 항목 제거. §C Definition of Done의 AC 목록에서 004/005 제외.
  - ID 정책: REQ-CASE-PROGRESS-004 / AC-CASE-PROGRESS-004 / AC-CASE-PROGRESS-005는 결번으로 남기고 재사용하지 않음. REQ-CASE-PROGRESS-005/006, AC-CASE-PROGRESS-006 ID는 변경 없이 유지.
previously_confirmed_clean_unaffected: `analysis-status-panel.tsx` 공유 상수 리팩터 범위(AC-CASE-PROGRESS-008 회귀 가드) 및 depends_on(SPEC-UI-MIGRATION-001, SPEC-PILOT-READY-001, 둘 다 status: completed)은 이번 개정으로 영향받지 않음 — 그대로 유지.
next_step: plan-auditor iteration 2 재감사 대기 (Retry Loop Contract, max 3).

## §E.2 Run-phase Evidence

_<pending run-phase>_

## §E.3 Run-phase Audit-Ready Signal

_<pending run-phase>_

## §E.4 Sync-phase Audit-Ready Signal

_<pending sync-phase>_
