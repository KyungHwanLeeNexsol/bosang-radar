# SPEC-RESEARCH-001 — Progress Log

## §E.1 Plan-phase Audit-Ready Signal

- plan_status: revision-complete, re-audit-pending
- plan_complete_at: 2026-08-26 (최초 작성)
- last_revision_at: 2026-08-26 (2차 plan revision — 사용자 지시 8개 항목)
- tier: L
- artifacts: spec.md, plan.md, acceptance.md, design.md, research.md (5/5, Tier L set complete)
- REQ count: 25 / 25 (Tier L ceiling — 이번 revision에서 신규 REQ 추가 없음; 항목 4는 REQ-RESEARCH-001/002 Then-절 재작성, 항목 5/6은 REQ-RESEARCH-005/006/018/019 scope 확장으로 흡수)
- AC count: 25 / 25 (Tier L ceiling — 이번 revision에서 신규 AC 추가 없음; 항목 3은 AC-RESEARCH-002 Then-절 재작성, 항목 5/6은 AC-RESEARCH-005/006/016/017 Then-절 확장으로 흡수; AC-RESEARCH-011은 011a/011b 서브-기준으로 분할, 여전히 1개 top-level 슬롯으로 집계)
- depends_on: SPEC-SCAFFOLD-001 (completed), SPEC-RUNTIME-001 (completed) — both fulfilled

### 이력

1. **최초 작성** (커밋 `3e51044`) — spec/plan/acceptance/design/research 5종 산출물 작성. 커밋 메시지 기록: plan-audit PASS (0.857/0.85). 로컬 audit 리포트 아티팩트(`.moai/reports/plan-audit/`)는 gitignore 정책상 현재 워킹 트리에 남아 있지 않음(관측 결과 재확인 — SPEC-RUNTIME-001과 동일한 정책).
2. **1차 revision** (커밋 `3e51044`에 포함, 별도 커밋 없음) — D1/D2 결함 수정: `verify()`에 `evidence` 인자 추가(3번째) + `provider`를 4번째 인자로 이동(당시에는 선택적 기본값 유지).
3. **2차 revision** (이번 작업, 아직 미커밋) — 사용자 지시 8개 항목 반영: ① Gemini `responseJsonSchema` 전환, ② `research`/`challenge`/`verify` provider 필수 인자화, ③ QueryPlanner 6-쿼리 기준 acceptance 정합, ④ CaseNormalizer 책임 분리(QueryPlanner CoverageDomain 타입으로 이관), ⑤ Skeptic evidence 연결 강화(`Challenge.supportingEvidenceIds`/`counterEvidenceIds`), ⑥ EvidenceRetriever universal 관련성 규칙(`scope` 축 신설), ⑦ seed 4→10 curated 레코드 확장 결정. 신규 REQ/AC 없이 기존 항목의 Then-절/scope 확장으로 8개 항목 전부 처리(Tier L 상한 유지). 상세 변경 근거는 spec.md HISTORY 참고.

- Prepared by: manager-spec (plan-phase revision)
- Next step: **재감사 대기(re-audit pending)**. 이번 revision 작업 자체는 완료됨 — 사용자가 별도로 plan-auditor를 재실행해 새 verdict를 반영할 예정이며, 이 progress.md는 그 결과가 반영되기 전 "audit-ready 직전" 상태를 기록한다(과거 PASS 점수를 재사용하지 않고, 새 audit이 이미 실행되었다고도 주장하지 않음).

## §E.2 Run-phase Evidence

_<pending run-phase>_

## §E.3 Run-phase Audit-Ready Signal

_<pending run-phase>_

## §E.4 Sync-phase Audit-Ready Signal

_<pending sync-phase>_
