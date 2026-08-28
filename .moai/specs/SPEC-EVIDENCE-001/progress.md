# SPEC-EVIDENCE-001 — 진행 기록 (progress.md)

## §E.1 Plan-phase Audit-Ready Signal

plan_status: draft-awaiting-audit
plan_complete_at: (미기록 — plan-auditor 실행 전, 아래 §G.1 참고)
tier: L
artifact_set: spec.md, plan.md, acceptance.md, design.md, research.md (5개, Tier L)
spec_version: "0.1.0"

### 자체 점검 결과 (plan-auditor 실행이 아님 — §G.1 참고)

이 세션은 `Agent` 도구가 없어 `plan-auditor` subagent를 직접 실행할 수 없었다. 아래는
plan-auditor가 통상 확인하는 항목들을 grep/카운트로 직접 재현한 **자체 점검**이며,
`plan-auditor` 자신의 판정을 대체하지 않는다(verification-claim-integrity 원칙 — 관측하지
않은 검증을 관측했다고 기록하지 않는다).

| 점검 항목 | 방법 | 결과 |
|-----------|------|------|
| frontmatter 12필드 | `sed -n '1,17p' spec.md` 육안 대조 | 12개 canonical 필드 전부 존재, snake_case alias 없음 |
| REQ 개수 (Tier L 상한 25) | `grep -c "^\| REQ-EVIDENCE-" spec.md` | 21개 — 상한 이내 |
| AC 개수 (Tier L 상한 25) | `grep -c "^\*\*AC-EVIDENCE-" acceptance.md` | 23개(REQ-016만 3개 서브레터 016a/b/c) — 상한 이내 |
| `[NEEDS CLARIFICATION]` 잔존 | `grep -c "NEEDS CLARIFICATION"` (5개 파일) | 0건 |
| REQ→AC traceability | REQ-EVIDENCE-001~021 각각을 `acceptance.md`에서 grep | 21개 전부 ≥1건 참조(REQ-016은 5건 — 016/016a/016b/016c 헤더+본문) |
| `## Out of Scope` h2-alone 함정 | `grep -n "^## \|^### " spec.md` | §4는 `## §4. 제외 범위 (Out of Scope)`(h2) + 5개 `### Out of Scope — <항목>`(h3) 서브섹션 — SPEC-GEMINI-RUNTIME-001 관례와 일치 |
| `phase:` 금지값(plan/run/sync/mx) | frontmatter `phase:` 값 확인 | `"v0.8.0 target"` — 금지값 아님 |

이 표는 **기계적으로 확인 가능한 항목만** 다룬다. plan-auditor 고유의 정성적 판단(Clarity/
Completeness/Testability/Traceability 4축 가중 점수, must-pass 7개 기준 종합 판정, PASS
threshold 0.85 도달 여부)은 이 세션이 재현할 수 없다 — 아래 §G.1에서 이 gap을 명시한다.

## §G.1 plan-auditor 실행 gap (정직하게 기록)

**이 SPEC은 아직 plan-auditor를 실행하지 않았다.** 사용자 지시는 "plan-auditor를 실행한다...
PASS 후 멈춘다"였으나, 이 세션(작성 주체)은 `Agent` 도구가 없어 `plan-auditor` subagent를
직접 spawn할 수 없다 — 이는 이 세션 도구 구성의 제약이지, 작업을 건너뛰어도 된다는 판단이
아니다.

**남은 절차**: `Agent` 도구에 접근 가능한 세션(main orchestrator 세션, 또는 그런 접근권을 가진
teammate)이 `plan-auditor` subagent를 이 5개 아티팩트(`spec.md`/`research.md`/`design.md`/
`plan.md`/`acceptance.md`)에 대해 실행해야 한다. PASS(overall ≥ 0.85, Tier L 기준) 시 이
섹션에 verdict·overall score·근거를 실제 실행 결과로 채워 넣고 `plan_status`를 `audit-ready`로
갱신한다. FAIL 시 지적사항을 반영해 재개정 후 재실행한다(plan-auditor Retry Loop Contract,
최대 3회).

**`/moai run`은 이 plan-auditor PASS 없이는 착수하지 않는다** — spec-workflow.md의 Plan Audit
Gate가 어차피 `/moai run` 진입 시 다시 이 감사를 요구하므로, 이 gap이 run-phase를 우회시키지는
않는다. 다만 사용자가 명시적으로 "plan-auditor PASS 후 멈춘다"고 지시했으므로, 그 PASS를
관측하지 못한 상태에서 이 세션이 스스로 멈추는 것이 맞다.

## §G.2 corpus 큐레이션(M4) 착수 조건 재확인 필요

plan.md M1이 명시한 대로, run-phase 착수 세션은 M4(실제 공개 출처 조사) 이전에 WebSearch/WebFetch
또는 등록된 `law.go.kr` OC 키 등 실제 웹 조사 도구 가용성을 재확인해야 한다. 이 plan-phase
세션은 그 도구가 없었고, 대신 `curl`로 제한적 검증(기존 seed 인용 재확인)만 수행했다
(research.md §0).
