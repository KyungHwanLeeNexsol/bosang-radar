# SPEC-EVIDENCE-001 — 진행 기록 (progress.md)

## §E.1 Plan-phase Audit-Ready Signal

plan_status: draft-awaiting-audit
plan_complete_at: (미기록 — plan-auditor 실행 전, 아래 §G.1 참고)
tier: L
artifact_set: spec.md, plan.md, acceptance.md, design.md, research.md (5개, Tier L)
spec_version: "0.3.0"

### 자체 점검 결과 (plan-auditor 실행이 아님 — §G.1 참고)

이 세션은 `Agent` 도구가 없어 `plan-auditor` subagent를 직접 실행할 수 없었다. 아래는
plan-auditor가 통상 확인하는 항목들을 grep/카운트로 직접 재현한 **자체 점검**이며,
`plan-auditor` 자신의 판정을 대체하지 않는다(verification-claim-integrity 원칙 — 관측하지
않은 검증을 관측했다고 기록하지 않는다). v0.3.0(외부 독립 리뷰 최종 revision 반영) 기준으로
재실행했다.

| 점검 항목 | 방법 | 결과 |
|-----------|------|------|
| frontmatter 12필드 | `sed -n '1,17p' spec.md` 육안 대조 | 12개 canonical 필드 전부 존재, snake_case alias 없음, `version: "0.3.0"` |
| REQ 개수 (Tier L 상한 25) | `grep -oE '^\| REQ-EVIDENCE-[0-9]+ \|' spec.md \| sort -u \| wc -l` | 25개 — 상한 유지, v0.3.0에서 새 top-level REQ 추가 없음(이슈 1/2는 기존 REQ-EVIDENCE-014/030/006 wording 수정으로 반영) |
| AC 개수 (Tier L 상한 25) | `grep -oE '^\*\*AC-EVIDENCE-[0-9]+[a-z]?\*\*' acceptance.md \| sort -u \| wc -l` | 25개(REQ-016만 4개 서브레터 016a/b/c/d) — 상한 유지, v0.3.0에서 새 AC 추가 없음(AC-006/014 본문 확장만) |
| `[NEEDS CLARIFICATION]` 잔존 | `grep -c "NEEDS CLARIFICATION"` (spec/research/design/plan/acceptance 5개 파일) | 0건 |
| REQ→AC traceability | REQ-EVIDENCE-001~021/026/029/030/031(25개) 각각을 `acceptance.md`에서 `\b` 경계 grep | 25개 전부 ≥1건 참조, 0건 참조인 REQ 없음(v0.2.0에서 발견·수정한 슬래시 병기 버그 재발 없음 확인) |
| `## Out of Scope` h2-alone 함정 | `grep -n "^## \|^### " spec.md` | §4는 `## §4. 제외 범위 (Out of Scope)`(h2) + 5개 `### Out of Scope — <항목>`(h3) 서브섹션 — v0.3.0에서도 유지 |
| `phase:` 금지값(plan/run/sync/mx) | frontmatter `phase:` 값 확인 | `"v0.8.0 target"` — 금지값 아님 |
| "corpus 확장 효과" 잔존 mislabeling | `grep -rn "corpus 확장 효과\|Corpus 확장 효과" *.md` (6개 아티팩트) | 남은 매치는 전부 (a) HISTORY의 과거형 서술("~로 잘못 명명했다") 또는 (b) 명시적 부정문("~이 아니다"/"~를 주장하지 않는다") — 실제 설계 본문에 오분류 잔존 없음 |
| 이전 결함 문구 잔존 확인 | `grep -rn "정렬.*전용\|현행 구조를 보존\|3개 컬럼\|A와 B는 fixture"` (전체 아티팩트) | HISTORY 항목(과거형 서술) 외 매치 없음 — 실제 설계 본문에 구결함 문구 잔존 없음 |

이 표는 **기계적으로 확인 가능한 항목만** 다룬다. plan-auditor 고유의 정성적 판단(Clarity/
Completeness/Testability/Traceability 4축 가중 점수, must-pass 7개 기준 종합 판정, PASS
threshold 0.85 도달 여부)은 이 세션이 재현할 수 없다 — 아래 §G.1에서 이 gap을 명시한다.

## §G.1 plan-auditor 실행 gap (정직하게 기록, v0.3.0에도 유효)

**이 SPEC은 아직 plan-auditor를 실행하지 않았다.** 사용자 지시는(v0.1.0 최초 작성, v0.2.0
외부 독립 리뷰 반영, v0.3.0 외부 독립 리뷰 최종 revision 반영 — 세 시점 모두) "plan-auditor를
실행한다... PASS 후 멈춘다"였으나, 이 세션(작성 주체)은 `Agent` 도구가 없어 `plan-auditor`
subagent를 직접 spawn할 수 없다 — 이는 이 세션 도구 구성의 제약이지, 작업을 건너뛰어도 된다는
판단이 아니다. v0.3.0 개정 완료 시점에도 이 제약은 그대로 유지된다 — plan-auditor PASS를
관측하지 못한 채로 이 결과를 PASS로 기록하는 것은 verification-claim-integrity 원칙 위반이므로,
이 세션은 PASS를 기재하지 않고 정직하게 gap으로 남긴다.

**남은 절차**: `Agent` 도구에 접근 가능한 세션(main orchestrator 세션, 또는 그런 접근권을 가진
teammate)이 `plan-auditor` subagent를 이 5개 아티팩트(`spec.md`/`research.md`/`design.md`/
`plan.md`/`acceptance.md`, 전부 v0.3.0)에 대해 실행해야 한다. PASS(overall ≥ 0.85, Tier L 기준)
시 이 섹션에 verdict·overall score·근거를 실제 실행 결과로 채워 넣고 `plan_status`를
`audit-ready`로 갱신한다. FAIL 시 지적사항을 반영해 재개정 후 재실행한다(plan-auditor Retry Loop
Contract, 최대 3회).

**`/moai run`은 이 plan-auditor PASS 없이는 착수하지 않는다** — spec-workflow.md의 Plan Audit
Gate가 어차피 `/moai run` 진입 시 다시 이 감사를 요구하므로, 이 gap이 run-phase를 우회시키지는
않는다. 다만 사용자가 명시적으로 "plan-auditor PASS 후 멈춘다"고 지시했으므로, 그 PASS를
관측하지 못한 상태에서 이 세션이 스스로 멈추는 것이 맞다.

## §G.2 corpus 큐레이션(M4) 착수 조건 재확인 필요

plan.md M1이 명시한 대로, run-phase 착수 세션은 M4(기존 10건 재감사 + 신규 확장) 이전에
WebSearch/WebFetch 또는 등록된 `law.go.kr` OC 키 등 실제 웹 조사 도구 가용성을 재확인해야 한다.
이 plan-phase 세션은 그 도구가 없었고, 대신 `curl`로 제한적 검증(기존 seed 인용 재확인)만
수행했다(research.md §0, §4.1).

## §G.3 외부 독립 리뷰 반영 기록 (v0.1.0 → v0.2.0)

사용자가 전달한 외부 독립 리뷰에서 5개 설계 blocker(issueType eligibility, benchmark/corpus
순서, diagnostic fixture 과잉주장, metadata 최소화, 기존 corpus 재감사)와 1개 acceptance
정합성 문제(AC-018 중복 판정)를 지적받아, plan-auditor를 실행하지 않은 상태(§G.1)에서 6개
아티팩트 전체를 개정했다. 상세 변경 내역은 spec.md HISTORY(v0.2.0 항목)에 기록했으며, 여기서는
**자체 점검 과정에서 발견한 메타 결함 1건**을 별도로 남긴다:

- **REQ 병기 표기 버그**: acceptance.md의 AC 헤더에 `(REQ-EVIDENCE-002/026)`처럼 슬래시로 두
  REQ ID를 병기하면, 단순 문자열 grep(`grep "REQ-EVIDENCE-026"`)이 이 표기를 찾지 못한다 —
  `002/026` 문자열에는 `REQ-EVIDENCE-026`이라는 연속 부분문자열이 존재하지 않기 때문이다(앞에
  `002/`가 붙어 있음). 이 버그를 자체 traceability 재점검(위 표 4번째 행) 중 직접 발견해
  `(REQ-EVIDENCE-002, REQ-EVIDENCE-026)`처럼 쉼표로 완전히 분리 표기하도록 4곳(AC-002/008/014/016d)
  전부 수정했다. **교훈**: 향후 이 SPEC이나 다른 SPEC에서 AC 헤더에 복수 REQ를 병기할 때는 항상
  `REQ-A, REQ-B` 형태(부분문자열로 서로를 가리지 않는 형태)를 쓴다.
- **REQ/AC 개수 재조정**: 리뷰 반영으로 신규 REQ 6개(026/027/028/029/030/031)가 생겨 총 27개가
  됐으나 Tier L 상한(25)을 초과 — REQ-028을 REQ-008에, REQ-027을 REQ-005에 각각 통합해 25개로
  조정했다(spec.md HISTORY 참고). AC도 같은 원리로 REQ-029→AC-008, REQ-030→AC-014에 통합해
  25개를 유지했다.

## §G.4 외부 독립 리뷰 최종 revision 반영 기록 (v0.2.0 → v0.3.0)

사용자가 전달한 외부 독립 리뷰 최종 revision에서 9개 항목(algorithm/corpus effect 재분리, zod
runtime validation, issueTypes 태깅 품질 검토, Precision@5 guardrail, research.md stale text,
source 우선순위, sourceIdentifier 재단순화, 6-아티팩트 일관성 재검증, plan-auditor 실행 시도)을
지적받아, plan-auditor를 실행하지 않은 상태(§G.1)에서 소규모로 개정했다 — **새 SPEC을 만들지
않고 scope를 확대하지 않는다**는 사용자 지시를 지켰다. 상세 변경 내역은 spec.md HISTORY(v0.3.0
항목)에 기록했다.

- **새 REQ/AC 미추가 확인**: 이번 라운드는 REQ-EVIDENCE-014/030/006의 wording만 수정했고
  AC-EVIDENCE-014/006의 본문만 확장했다 — 새 top-level REQ ID나 새 AC ID를 만들지 않았다(item
  2에서 사용자가 명시적으로 요구한 제약). REQ/AC 개수는 v0.2.0과 동일하게 25/25로 유지된다(위
  자체 점검 표에서 재확인).
- **algorithm effect vs corpus expansion effect 재분리**: v0.2.0 자체 점검(§G.3)에서는 발견하지
  못했던 잔존 개념 오류(같은 corpus 위 알고리즘 비교를 "corpus 확장 효과"로 잘못 명명)를 이번
  라운드에서 사용자가 직접 지적 — design.md §3.4를 A(algorithm effect)/B(corpus expansion
  effect) 두 절로 재구성하고, plan.md M4d/M4e로 milestone을 분리했다. **교훈**: "동일 조건에서
  하나의 변수만 바꾼 비교"와 "그 변수가 아닌 다른 조건의 변화 효과"를 이름으로 구분할 때는, 실제로
  무엇이 고정되고 무엇이 변했는지 재확인해야 한다 — 이름이 그럴듯해도 측정 대상과 불일치할 수
  있다.
- **plan-auditor 실행 gap 재확인**: 이번 라운드에서도 `Agent` 도구는 여전히 이 세션에 제공되지
  않았다 — v0.1.0/v0.2.0과 동일한 제약이 v0.3.0에도 유효하며, PASS를 기재하지 않고 §G.1에
  정직하게 gap으로 기록했다(item 9의 명시적 요구사항).
