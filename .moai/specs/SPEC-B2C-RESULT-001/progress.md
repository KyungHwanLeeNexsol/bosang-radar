# Progress — SPEC-B2C-RESULT-001

## §E.1 Plan-phase Audit-Ready Signal

- `plan_status: amended-pending-reaudit` (2026-09-22 디자인 화면 재대조 amendment(2차) 이후 — plan-auditor 재검토가 완료되기 전까지 `audit-ready`로 재확인되지 않는다. §G 참고.)
- `plan_complete_at: 2026-09-22`
- `amended_at: 2026-09-22` (총 2차례 amendment — ① review 피드백 6항목 반영: spec.md/plan.md/acceptance.md/design.md 본문 수정, ② 디자인 화면(02/M02/M02-B/M02-C/M02-D) 재대조: `DiagnosisResult`/`CoverageItem` 계약을 badges/benefit/priorityChecks/inputSummary/FactChip 구조로 확장. 두 amendment 모두 기존 REQ/AC ID의 본문만 수정, 신규 ID 없음)
- Tier: **L**(5-artifact set: spec.md + plan.md + acceptance.md + design.md + research.md) — LOC/파일 수 추정(신규 `app/result/page.tsx` 1 + `components/result/*` 8개 + `lib/diagnosis/*` 5개 + 기존 파일 최소 확장 3개 + 대응 테스트 다수 + `e2e/diagnosis-flow-02.spec.ts` 신규 + `scripts/visual-verify.ts` 확장, 총 영향 파일 > 15, 예상 LOC > 1000)로 Tier L 확정 — 선행 SPEC-B2C-DIAGNOSIS-001과 동일한 등급.
- 요구사항 25건(Tier L 상한 25 충족, 초과 없음) / acceptance.md AC 25건(Tier L 상한 25 충족, 초과 없음) — 4건(AC-002/003/011/013)은 부모 AC 안에 "추가 시나리오" Given/When/Then을 병합해 REQ 대비 1:1 이상 커버리지를 유지한다(plan-auditor D1 반영, 2026-09-22). 2026-09-22 review-feedback amendment 이후에도 REQ/AC 개수는 25/25로 불변 — 이번 amendment는 기존 ID(REQ-001/005/006/009/010/013/016/023, AC-001/005/006/009/010/013/016/023)의 본문을 확장하거나 "추가 시나리오"를 더 얹었을 뿐 신규 ID를 도입하지 않았다.
- Out of Scope 섹션: `### Out of Scope —` H3 하위 제목 5개(각 `-` bullet 포함) — `OutOfScopeRule` lint 요건 충족.
- 작성된 산출물 경로:
  - `.moai/specs/SPEC-B2C-RESULT-001/spec.md`
  - `.moai/specs/SPEC-B2C-RESULT-001/plan.md`
  - `.moai/specs/SPEC-B2C-RESULT-001/acceptance.md`
  - `.moai/specs/SPEC-B2C-RESULT-001/design.md`
  - `.moai/specs/SPEC-B2C-RESULT-001/research.md`
  - `.moai/specs/SPEC-B2C-RESULT-001/progress.md`(본 파일)

## §G. plan-auditor 재검토 이력

**Iteration 1** — PASS, 종합 점수 **0.92**, must-pass 7/7, 감사 대상 커밋 `7a691fb`. 보고서: `.moai/reports/plan-audit/SPEC-B2C-RESULT-001-review-1.md`. 발견 사항: D1(AC 개수 29건 — Tier L 상한 25 초과, major/blocking) + D2-D4(minor, informational).

**D1 수정** — 커밋 `6388312`. 4개 lettered AC 하위 변형(AC-002b/003b/011b/013b)을 각 부모 AC의 Given/When/Then 안으로 "추가 시나리오"로 병합해, AC 개수를 정확히 25건으로 조정했다.

**Iteration 2** — PASS, 종합 점수 **0.97**, must-pass 7/7, 감사 대상 커밋 `6388312`. 보고서: `.moai/reports/plan-audit/SPEC-B2C-RESULT-001-review-2.md`. D1 완전 해소 확인, 신규 결함 없음.

**재감사 필요(iteration 3 대기)** — 2026-09-22, iteration 2 감사 대상 커밋(`6388312`) 이후 review 피드백을 반영하는 amendment 라운드가 다음 구조적 변경을 도입했다: ① fixture 안전 게이트를 명시적 boolean 매개변수 기반으로 재정의(REQ-B2CRESULT-009, defense-in-depth), ② `DiagnosisResult`/`CoverageItem` 계약을 resultId·schemaVersion·구조화 필드·discriminated union으로 확장(REQ-B2CRESULT-001/005/006), ③ 01→02 인계 채널을 "완전히 구성된 `DiagnosisResult` 저장" 단일 흐름으로 통일(REQ-B2CRESULT-010), ④ `sessionStorage` 수명 정책을 "1회 읽고 즉시 삭제"에서 "탭 세션 유지 + 명시적 트리거 삭제"로 변경(REQ-B2CRESULT-013/016), ⑤ 상담 CTA stub 형태를 `aria-disabled` 기반으로 확정(REQ-B2CRESULT-023), ⑥ 본 §G를 재작성. 이 변경들은 iteration 2가 감사한 artifact 내용을 상당 부분 대체하므로, iteration 2의 PASS 0.97 verdict는 이 시점 기준 **stale**이다. 이 amendment 커밋 이후 plan-auditor **iteration 3**(독립 재검토)이 필요하며, 그 verdict가 나오기 전까지 `plan_status`는 `audit-ready`로 재확인되지 않는다(위 §E.1 `plan_status: amended-pending-reaudit` 참고). iteration 3에서 우선 확인이 권장되는 항목:

1. `mockJudge(input, reviewEnabled)`의 신규 2번째 인자가 `design.md` §4 명세대로 run-phase에서 정확히 구현되는지 — `reviewEnabled=false`일 때 정확 일치 입력이 주어져도 fixture 분기에 도달하지 않아야 한다(AC-B2CRESULT-009 추가 시나리오).
2. `CoverageItem`의 status별 discriminated union(§1)이 실제 `lib/diagnosis/types.ts` 구현에서 `reasonNote` 필수/선택 분기를 타입 체크 시점에 강제하는지.
3. `plan.md` §D의 "기존 파일 중 정확히 3개만 최소 확장" 제약이 run-phase에서 실제로 지켜지는지 — `step-loading.tsx`/`diagnosis-flow.tsx`/`app/page.tsx` 외 파일 변경이 발생하면 PRESERVE 위반이다.
4. `sessionStorage` 키 네이밍(`design.md` §3의 예시 `"bosang-radar:diagnosis-handoff-v1"`)은 예시일 뿐 확정 값이 아니다 — run-phase가 실제 값을 정하고 AC-B2CRESULT-017 검증에 반영해야 한다.

**Iteration 3 — 완료(이전에 본 §G에 기록되지 않았던 결과를 사후 보정)**: PASS, 종합 점수 **0.96**, must-pass 7/7, 감사 대상 커밋 `d274161`(위 재감사 대기 항목 1~4를 포함해 전체 구조 재감사). 보고서: `.moai/reports/plan-audit/SPEC-B2C-RESULT-001-review-3.md`. LEAN 회귀 신호(0.97→0.96, D1 신규 발견 — `design.md`의 존재하지 않는 `REQ-B2CRESULT-003b` 인용) 기록됨; 표준 3회 재시도 상한(iteration 3/3)에 도달했으므로 PASS-with-debt 권고. **D1 수정** — 커밋 `0d10516`(`design.md:213`의 `REQ-B2CRESULT-003b` → `REQ-B2CRESULT-003` 정정). D2(REQ-023 Unwanted 어투)/D3(REQ 본문 내 구현 세부사항)/D4(REQ-019 "적절한" 약한 표현)는 optional/informational로 남음(수정 불요). **이 iteration 3 결과는 이 progress.md에 이제야 기록된다** — 완료 당시(커밋 `0d10516`) progress.md §G가 갱신되지 않은 채 방치되어 있었음을 git 이력(`git show --stat 0d10516`, `.moai/reports/plan-audit/SPEC-B2C-RESULT-001-review-3.md` 파일 존재)으로 직접 확인 후 사후 보정한다.

**재감사 필요(iteration 4 대기, 2026-09-22 두 번째 amendment)** — iteration 3(PASS 0.96, 대상 커밋 `d274161`)이 감사한 artifact 내용을, 이번 디자인 화면(02/M02/M02-B/M02-C/M02-D) 5종 재대조 amendment가 다시 실질적으로 대체했다 — `DiagnosisResult`/`CoverageItem` 계약이 `AccidentSummaryFact`/`PriorityCheck`/`CoverageBadge`/`BenefitDisplay`로 확장되고 `FactChip`이 결합 문자열에서 `{questionId, label, value}` 구조로 바뀌었다(spec.md HISTORY 2번째 bullet 참고). 따라서 iteration 3의 PASS 0.96 verdict는 이 시점 기준 **stale**이다.

**plan-auditor는 이미 표준 3-iteration 예산(iteration 1/2/3)을 전부 소진했다.** 이 SPEC에 대한 추가 재검토(iteration 4)는 plan-auditor Retry Loop Contract상 "표준 상한을 넘는" 예외적 선택이며, orchestrator/user의 명시적 승인 없이 자동으로 실행되어서는 안 된다 — 이는 orchestrator가 판단할 사안이지 manager-spec이 임의로 결정할 사안이 아니다. 그 승인이 나기 전까지 `plan_status`는 `audit-ready`로 설정하지 않는다(위 §E.1 참고). 승인이 나면, 재검토 시 우선 확인이 권장되는 항목:

5. `benefit: BenefitDisplay`가 실제 `lib/diagnosis/types.ts` 구현에서 `status` discriminated union과 독립적인 `CoverageItemBase`의 공통 필수 필드로 선언되는지 — "가능성 낮음" 분기에서도 `benefit` 필드 자체가 optional로 후퇴하지 않아야 한다.
6. `collectAnsweredFacts(items)`가 실제로 `items[].factChips`만을 입력으로 사용하고 `answers`/`rawInput`을 직접 참조하지 않는지 — SSOT 위반(이중 데이터 경로) 여부.
7. `buildFractureResult`가 반환하는 `CoverageBadge.kind` 값이 `design.md` §7이 정의한 라벨→kind 매핑(가입 확인 필요→subscription-check/generation-check, 보험증권 확인 필요→policy-type-check, 시설 가입 여부 확인→facility-check, 단체보험 가입 여부 확인→group-insurance-check)과 실제로 일치하는지.

## §E.2 Run-phase Evidence

_<pending run-phase>_

## §E.3 Run-phase Audit-Ready Signal

_<pending run-phase>_

## §E.4 Sync-phase Audit-Ready Signal

_<pending sync-phase>_
