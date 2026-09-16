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

### Plan Audit Verdict (Iteration 2)

verdict: FAIL
overall_score: 0.92 (computed for record only — overridden to FAIL by M5 Must-Pass Firewall)
audited_at: 2026-09-16
report: .moai/reports/plan-audit/SPEC-CASE-PROGRESS-001-review-2.md

Category scores: Clarity 0.75, Completeness 1.0, Testability 1.0 (improved from 0.50), Traceability 1.0.

Regression check: D1(critical)/D2(major) RESOLVED — direct re-read of `app/api/cases/status/route.ts:47-53` confirms 3 response shapes, `"queued"` never emitted; `git show fc0ca6d --stat` confirms route.ts NOT modified. D3 RESOLVED (moot, AC deleted). D4 UNRESOLVED as expected (was non-blocking, no fix required).

New must-pass failure (MP-1, critical, blocking): removing REQ-CASE-PROGRESS-004 (correctly, per D1/D2) left the REQ sequence with a gap — 001,002,003,[004 missing],005,006 — violating MP-1's unconditional "no gaps" rule. This is a NEW defect introduced by the iteration-1→2 revision, not a carryover. Verdict is FAIL despite the improved 0.92 aggregate score (well above the 0.80 Tier M threshold) because a must-pass failure cannot be compensated by category scores. Required fix: renumber REQ-005→004 and REQ-006→005 (and propagate through acceptance.md/plan.md cross-references), or obtain an explicit user-approved exception to MP-1's no-gap rule. See the full report for details.

next_step: manager-spec to close the REQ-ID gap (D5) before plan-auditor iteration 3 (final iteration per the 3-iteration ceiling).

### Iteration 2 → Iteration 3 개정 (manager-spec)

revised_at: 2026-09-16
resolution: 사용자 확정(AskUserQuestion) — MP-1(요구사항 번호 연속성) 위반을 해소하기 위해, 결번을 예외 처리하지 않고 **재번호**한다. REQ-CASE-PROGRESS-005(접근성) → REQ-CASE-PROGRESS-004, REQ-CASE-PROGRESS-006(범위 보존) → REQ-CASE-PROGRESS-005. 최종 REQ 번호열: 001, 002, 003, 004, 005 (결번 없음).
changes:
  - spec.md: HISTORY에 iteration 2→3 개정 경위 기록. §2.C(접근성) 표의 REQ-CASE-PROGRESS-005 → REQ-CASE-PROGRESS-004로 변경. §2.D(범위 보존) 표의 REQ-CASE-PROGRESS-006 → REQ-CASE-PROGRESS-005로 변경. §2.B(REMOVED 섹션) 설명문을 갱신해 舊 REQ-CASE-PROGRESS-004(queued/processing 구분 표시, iteration 1에서 제거)와 현재 REQ-CASE-PROGRESS-004(접근성, 이번 재번호로 재사용된 ID)가 서로 다른 대상임을 명시. §4 교차 참조의 REQ 번호열을 "001, 002, 003, 005, 006" → "001, 002, 003, 004, 005"로 정정. Out of Scope §의 REQ-CASE-PROGRESS-006 참조를 REQ-CASE-PROGRESS-005로 변경.
  - plan.md: 결정 2 본문 및 (구)결정 2 제거 안내의 REQ-CASE-PROGRESS-005 참조를 REQ-CASE-PROGRESS-004로 변경. M1의 REQ-CASE-PROGRESS-006 참조를 REQ-CASE-PROGRESS-005로 변경. 舊 REQ-CASE-PROGRESS-004(queued/processing 구분 표시)를 가리키는 기존 문구는 "舊" 표기 및 서술형 설명으로 대체해 재번호된 현재 REQ-CASE-PROGRESS-004(접근성)와의 혼동을 제거.
  - acceptance.md: AC-CASE-PROGRESS-007의 REQ 결부를 REQ-CASE-PROGRESS-005 → REQ-CASE-PROGRESS-004로 변경. AC-CASE-PROGRESS-008의 REQ 결부를 REQ-CASE-PROGRESS-006 → REQ-CASE-PROGRESS-005로 변경. Group B 헤더 및 엣지 케이스 항목의 舊 REQ-CASE-PROGRESS-004(queued/processing 구분 표시) 참조에 "舊" 표기 및 재번호 안내를 추가해 혼동을 제거. AC-CASE-PROGRESS-004/005(舊, queued/processing 계열) 결번은 이번 개정에서 다루지 않음 — plan-audit iteration 2 review §D6에서 non-blocking으로 확인된 별개 이슈이며, AC 네임스페이스 재번호는 REQ 재번호보다 얽힌 교차 참조가 많아(AC-007/008/009 순번 밀림) 이번 iteration의 PASS 요건이 아닌 것으로 판단해 범위에서 제외함(팀 리드 위임 재량 행사).
  - ID 정책: REQ-CASE-PROGRESS-004(접근성)/REQ-CASE-PROGRESS-005(범위 보존)는 iteration 2 이전에 존재했던 舊 REQ-CASE-PROGRESS-004(queued/processing 구분 표시, iteration 1에서 결번 처리)와 무관한, 재번호로 새로 배정된 내용이다 — 舊 요구사항의 원 내용은 재도입하지 않았다.
verified_directly: 재번호 완료 후 `grep -n "REQ-CASE-PROGRESS-00[3456]"` 를 spec.md/plan.md/acceptance.md/progress.md 전체에 대해 재실행 — 활성 본문(HISTORY 제외)에 잔여 REQ-CASE-PROGRESS-005/006 참조 없음을 확인. spec.md §2 표 헤딩(001~005) 직접 재확인 — 결번 없이 연속.
next_step: plan-auditor iteration 3 재감사 대기 (Retry Loop Contract, max 3 — 최종 iteration).

## §E.2 Run-phase Evidence

_<pending run-phase>_

## §E.3 Run-phase Audit-Ready Signal

_<pending run-phase>_

## §E.4 Sync-phase Audit-Ready Signal

_<pending sync-phase>_
