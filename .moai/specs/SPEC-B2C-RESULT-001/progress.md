# Progress — SPEC-B2C-RESULT-001

## §E.1 Plan-phase Audit-Ready Signal

- `plan_status: audit-ready` (plan-auditor iteration 6/3, PASS 종합 0.96, must-pass 5/7 PASS + 2/7 N/A(0 FAIL), 감사 대상 커밋 `3dc7ae7` — 4차 amendment(`DiagnosisResultSchema` 의미 검증 강화·`reasonNote?: never` 금지·sessionStorage stale 문구 정정·`schema.ts` 파일 트리 보완) 이후 재확인 완료. 신규 결함 1건(D1, plan.md §E 체크박스가 이미 stale화된 iteration 5 claim을 인용하던 것 — 같은 커밋에서 iteration 6 참조로 정정, non-blocking)을 제외하고 blocking 결함 없음. 상세: `.moai/reports/plan-audit/SPEC-B2C-RESULT-001-review-6.md`, §G.)
- `plan_complete_at: 2026-09-22`
- `amended_at: 2026-09-22` (총 4차례 amendment — ① review 피드백 6항목 반영: spec.md/plan.md/acceptance.md/design.md 본문 수정, ② 디자인 화면(02/M02/M02-B/M02-C/M02-D) 재대조: `DiagnosisResult`/`CoverageItem` 계약을 badges/benefit/priorityChecks/inputSummary/FactChip 구조로 확장, ③ strict Zod 전체 스키마 설계 + `readDiagnosisHandoff()` 3갈래 handoff 계약 재설계(대상 커밋 `ad31b24`) — `design.md` §1b `DiagnosisResultSchema` 전체(모든 분기 `z.strictObject`)를 신설하고 스키마 경로를 `lib/diagnosis/schema.ts`로 통일했으며, `DiagnosisHandoffReadResult`(`"empty"`/`"valid"`/`"invalid"` 3갈래 판별 유니언)를 도입했다, ④ 스키마 의미 검증 강화(대상 커밋 `3dc7ae7`) — `DiagnosisResultSchema`에 `resultId`/`rawInput` 등 문자열 필드의 `.min(1)` 의미 검증, `schemaVersion`(`DIAGNOSIS_SCHEMA_VERSION`) 리터럴 검증, `generatedAt`의 ISO-8601 형식 검증(`z.iso.datetime({ offset: true })`)을 추가하고, `CoverageItem.reasonNote`의 `"review"`/`"needs-info"` 분기 취급을 "선택(optional)"에서 `reasonNote?: never`(명시적 금지)로 정정했으며, `design.md` §3 인계 채널 대안 비교표의 stale한 "새로고침 후 재방문 시 재사용 불가" 문구를 현행 탭 세션 유지 정책과 일치하도록 정정하고, `lib/diagnosis/` 파일 트리에 누락돼 있던 `schema.ts` 항목을 추가했다. 네 amendment 모두 기존 REQ/AC ID의 본문만 수정, 신규 ID 없음.)
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

**Iteration 3 — 완료(이전에 본 §G에 기록되지 않았던 결과를 사후 보정)**: PASS, 종합 점수 **0.96**, must-pass 7/7, 감사 대상 커밋 `d274161`(위 재감사 대기 항목 1~4를 포함해 전체 구조 재감사). 보고서: `.moai/reports/plan-audit/SPEC-B2C-RESULT-001-review-3.md`. LEAN 회귀 신호(0.97→0.96, D1 신규 발견 — `design.md`가 존재하지 않는 REQ 번호에 알파벳 접미사가 붙은 형태의 잘못된 참조를 인용) 기록됨; 표준 3회 재시도 상한(iteration 3/3)에 도달했으므로 PASS-with-debt 권고. **D1 수정** — 커밋 `0d10516`(`design.md:213`의 해당 잘못된 하위-문자 접미사 참조를 상위 REQ 본번호를 가리키도록 정정). D2(REQ-023 Unwanted 어투)/D3(REQ 본문 내 구현 세부사항)/D4(REQ-019 "적절한" 약한 표현)는 optional/informational로 남음(수정 불요). **이 iteration 3 결과는 이 progress.md에 이제야 기록된다** — 완료 당시(커밋 `0d10516`) progress.md §G가 갱신되지 않은 채 방치되어 있었음을 git 이력(`git show --stat 0d10516`, `.moai/reports/plan-audit/SPEC-B2C-RESULT-001-review-3.md` 파일 존재)으로 직접 확인 후 사후 보정한다.

**재감사 필요(iteration 4 대기, 2026-09-22 두 번째 amendment)** — iteration 3(PASS 0.96, 대상 커밋 `d274161`)이 감사한 artifact 내용을, 이번 디자인 화면(02/M02/M02-B/M02-C/M02-D) 5종 재대조 amendment가 다시 실질적으로 대체했다 — `DiagnosisResult`/`CoverageItem` 계약이 `AccidentSummaryFact`/`PriorityCheck`/`CoverageBadge`/`BenefitDisplay`로 확장되고 `FactChip`이 결합 문자열에서 `{questionId, label, value}` 구조로 바뀌었다(spec.md HISTORY 2번째 bullet 참고). 따라서 iteration 3의 PASS 0.96 verdict는 이 시점 기준 **stale**이다.

**Iteration 4 — 완료(표준 3-iteration 예산을 넘는 예외적 재검토, orchestrator/user 명시적 승인 하에 실행)**: PASS, 종합 점수 **0.857**(Tier L 임계값 0.85 대비 근소하게 상회, margin 0.007), must-pass 7/7, 감사 대상 커밋 `c364f82`(위 우선 확인 항목 5~7을 포함해 전체 구조 재감사). 보고서: `.moai/reports/plan-audit/SPEC-B2C-RESULT-001-review-4.md`. LEAN 회귀 신호(0.96→0.857)가 기록되었으나, 새로 깨진 구조적 내용은 없다 — must-pass 7/7 PASS/N-A, Completeness/Traceability는 iteration 3과 동일하게 1.0. 회귀는 (a) iteration 2/3부터 이월되어 두 차례 독립 감사자가 이미 non-blocking debt로 수용한 D2~D4(문구·표현 수준)에 이번 iteration이 Clarity/Testability 루브릭을 더 엄격히 적용한 결과, (b) 신규 D5(아래) 하나의 조합이다. 권고는 5차 재시도가 아니라 **PASS-with-debt**.

**D5 (신규, `UNDESIGNED-ZOD-SCHEMA-FOR-TESTED-BEHAVIOR`, severity: minor, class: optional)** — `acceptance.md:82-85`(AC-B2CRESULT-006의 zod `safeParse` 추가 시나리오)는 `BenefitDisplay`의 kind-조건부 필드 강제를 검증하는 zod 스키마의 존재를 전제하지만, 감사 시점의 `design.md` §1은 `BenefitDisplay`를 TypeScript 타입으로만 정의하고 그 스키마의 이름·모듈·형태를 전혀 명시하지 않았다 — AC가 전제하는 설계 산출물이 design.md에 없는 간극. Kickoff Approval을 막지 않는 optional 등급.

**D5 수정** — 커밋 `b2252f9`(`design.md` §1에 `BenefitDisplaySchema`의 소재(`lib/validation/diagnosis-result.ts`)를 명시하는 한 문장 보완).

**이번 라운드(D5 수정 이후 추가 amendment) — 재감사 필요**: iteration 4(대상 커밋 `c364f82`) 및 D5 수정(`b2252f9`) 이후, 다음 변경이 추가로 도입되었다:

1. D5가 가리켰던 한 문장짜리 스키마 참조를 `DiagnosisResult` 전체 계약(모든 하위 타입 미러링)을 아우르는 `design.md` §1b 전체 zod 설계 섹션으로 확장했다 — 모든 분기 `z.strictObject`(알 수 없는 키 거부)로 선언.
2. 스키마 파일 경로를 D5 수정이 가리켰던 `lib/validation/diagnosis-result.ts`에서 `lib/diagnosis/schema.ts`로 통일했다(`lib/validation/`은 01 전용 입력 스키마가 이미 점유).
3. `readDiagnosisHandoff()`의 반환 타입을 `DiagnosisResult | null`에서 `DiagnosisHandoffReadResult`(`"empty"`/`"valid"`/`"invalid"` 3갈래 판별 유니언, `DiagnosisResultSchema.safeParse`로 판정)로 재설계했다(`design.md` §3, `plan.md` Milestone 2/4).
4. `acceptance.md` AC-B2CRESULT-014에 "구문은 유효하나 스키마와 불일치하는 JSON" 추가 시나리오를 병합했다(신규 AC ID 없음, AC 개수 25건 불변).
5. `plan.md` §B의 stale "마운트 시 1회 읽고 즉시 제거" 문구를 REQ-B2CRESULT-016 현행 정책(탭 세션 유지)과 일치하도록 정정했다.
6. `plan.md` §B의 fixture 판정 순서 서술에 `reviewEnabled &&` boolean 표현을 명시적으로 반영했다(REQ-B2CRESULT-009 defense-in-depth와의 일치).
7. `design.md` §1의 `generatedAt` 주석("표시 전용, 저장되지 않음")을 정정했다 — `DiagnosisResult` 전체가 `sessionStorage`에 저장되는 객체이므로 `generatedAt`도 그 왕복에 포함된다.

이 변경들은 iteration 4가 감사한 `design.md` §1/§3 및 `acceptance.md` AC-014의 상당 부분을 대체하므로, iteration 4의 PASS 0.857 verdict는 이 시점 기준 **stale**이다.

> **아래 문단은 iteration 5 실행 전 — 즉 바로 다음 "Iteration 5 — 완료" 항목이 기록되기 전 — 작성된 대기 상태 서술이며, 과거 시점을 기술한다.** 이후 orchestrator/user가 명시적으로 iteration 5 실행을 승인했고, iteration 5는 실제로 실행·완료됐다(상세는 아래 "Iteration 5 — 완료" 항목 참고). 이 문단을 현재 상태로 읽어서는 안 된다.
>
> plan-auditor는 이미 표준 3-iteration 예산(iteration 1/2/3)에 더해 명시적으로 승인된 iteration 4까지 소진했다. 이 SPEC에 대한 추가 재검토(iteration 5)는 plan-auditor Retry Loop Contract상 표준 상한을 다시 넘는 예외적 선택이며, orchestrator/user의 명시적 승인 없이 자동으로 실행되어서는 안 된다 — 이는 orchestrator가 판단할 사안이지 manager-spec이 임의로 결정할 사안이 아니다. 그 승인이 나기 전까지 `plan_status`는 `audit-ready`로 설정하지 않는다.

**Iteration 5 — 완료(표준 3-iteration 예산을 다시 넘는 예외적 재검토, orchestrator/user 명시적 승인 하에 실행)**: PASS, 종합 점수 **0.95**, must-pass 7/7, 감사 대상 커밋 `ad31b24`(위 3차 amendment의 7개 변경사항 전체를 포함해 전체 구조 재감사). 보고서: `.moai/reports/plan-audit/SPEC-B2C-RESULT-001-review-5.md`. 신규 blocking 결함 없음 — D1(REQ-019 "적절한" 약한 표현)/D2(REQ-023 Unwanted/Ubiquitous 혼합 어투)는 iteration 3/4부터 이월된 non-blocking·optional 문구 debt로, 이번 iteration도 수정을 요구하지 않고 재확인만 됐다. 점수 추이: 0.92 → 0.97 → 0.96 → 0.857 → **0.95**(직전 iteration 4 대비 상승 — 회귀 아님). 이 verdict를 근거로 `plan_status`는 `audit-ready`로 확인됐다(확인 커밋 `c9da103`).

**재감사 필요(iteration 6 대기, 2026-09-22 4차 amendment)** — iteration 5(대상 커밋 `ad31b24`, PASS 0.95)가 감사한 `design.md` §1/§1b 내용을, 이번 스키마 의미 검증 강화 라운드가 다시 실질적으로 변경했다: `DiagnosisResultSchema`에 `.min(1)` 의미 검증(`resultId`/`rawInput`/사고 요약·배지·확인 우선순위·담보 카드·보장 방식 표시 등의 문자열 필드)과 `schemaVersion` 리터럴 강제(`DIAGNOSIS_SCHEMA_VERSION`), `generatedAt` ISO-8601 형식 검증(`z.iso.datetime({ offset: true })`)을 추가했고(REQ-B2CRESULT-001/014, AC-B2CRESULT-014 추가 시나리오), `CoverageItem`의 `reasonNote`를 `"review"`/`"needs-info"` 분기에서 "선택(optional)"이 아니라 `reasonNote?: never`로 명시적으로 금지하도록 타입·zod 서술을 정정했다(REQ-B2CRESULT-005, AC-B2CRESULT-005 추가 시나리오). 이 외에 `design.md` §3 인계 채널 대안 비교표의 stale한 "새로고침 후 재방문 시 재사용 불가" 문구를 현행 탭 세션 유지 정책과 일치하도록 정정했고, `lib/diagnosis/` 파일 트리에 누락돼 있던 `schema.ts` 항목을 추가했다. REQ/AC 개수는 25/25로 불변(신규 ID 없음). 따라서 iteration 5의 PASS 0.95 verdict는 이 시점 기준 **stale**이며, `plan_status`는 다시 `amended-pending-reaudit`로 되돌아간다(위 §E.1 참고) — 새로운 plan-auditor 재검토(iteration 6)가 완료되기 전까지 `audit-ready`로 재확인되지 않는다.

> **위 문단은 iteration 6 실행 전 — 즉 바로 다음 "Iteration 6 — 완료" 항목이 기록되기 전 — 작성된 대기 상태 서술이며, 과거 시점을 기술한다.** 이후 plan-auditor iteration 6이 실제로 실행·완료됐다(상세는 아래 "Iteration 6 — 완료" 항목 참고). 이 문단을 현재 상태로 읽어서는 안 된다.

**Iteration 6 — 완료**: PASS, 종합 점수 **0.96**, must-pass 5/7 PASS + 2/7 N/A(0 FAIL), 감사 대상 커밋 `3dc7ae7`(위 4차 amendment 전체를 포함해 전체 구조 재감사). 보고서: `.moai/reports/plan-audit/SPEC-B2C-RESULT-001-review-6.md`. 신규 결함 D1(non-blocking, documentation-consistency) — `plan.md` §E 자기검증 체크박스가 이미 stale화된 iteration 5 claim("iteration 5 PASS 0.95, must-pass 7/7")을 그대로 인용하고 있던 것을 발견. **D1 수정/확인 커밋** — 커밋 `a3a0fcb`(같은 커밋에서 `plan.md` §E 체크박스를 iteration 6 참조로 정정). 그 외 blocking 결함 없음. 이 verdict를 근거로 `plan_status`는 `audit-ready`로 최종 확인됐다(확인 커밋 `a3a0fcb`, 위 §E.1 참고).

## §E.2 Run-phase Evidence

### Milestone 1 — `DiagnosisResult` 데이터 타입 SSOT (2026-09-22)

- **Claim**: `lib/diagnosis/types.ts` · `schema.ts` · `aggregate.ts`(신규) 및 `schema.test.ts` · `aggregate.test.ts`(신규)를 `design.md` §1/§1b/§2, `plan.md` §F Milestone 1대로 작성했다.
- **Evidence**: `npx vitest run lib/diagnosis` → `Test Files 2 passed (2)` / `Tests 28 passed (28)`(커밋 `2dccd9d` 기준, plan/SPEC-B2C-RESULT-001 브랜치에서 재실행 확인); `npx tsc --noEmit -p tsconfig.json` → `lib/diagnosis/`에는 0 errors(기존 무관 파일 `app/layout.tsx`의 1건 pre-existing 오류는 이 마일스톤 범위 밖); `npx eslint lib/diagnosis` → 0 errors, 0 warnings.
- **Baseline-attribution**: 커밋 `2dccd9d`(plan/SPEC-B2C-RESULT-001, cherry-pick from `d4eedb8`), 이 커밋의 `lib/diagnosis/` 트리에 대해 `npx vitest run lib/diagnosis` 재실행으로 확인.
- **Gaps**: `handoff.ts`/`flags.ts`/`fixtures/`/`app/result/`/`components/result/`/`e2e/diagnosis-flow-02.spec.ts`는 범위 밖(Milestone 2-6). 라인/브랜치 커버리지 %는 별도 측정하지 않음 — 28개 테스트가 모든 스키마 분기와 두 집계 함수를 실행하나 커버리지 도구는 미실행.
- **Residual-risk**: `reasonNote?: never`는 TS 컴파일 타임 강제일 뿐이며, 런타임 강제(strictObject 미지 키 거부)는 `review`/`needs-info` 두 분기 각각에 대해 개별 테스트됨. `z.iso.datetime({ offset: true })`는 대표 포맷 2종(`+09:00`, `Z`)만 테스트했고 전체 RFC 3339 오프셋 공간은 다루지 않음.

### Milestone 2 — 01→02 인계 채널 + 01 최소 확장 (2026-09-22)

- **Claim**: `lib/diagnosis/handoff.ts`(writeDiagnosisHandoff/readDiagnosisHandoff 3갈래 판별 유니언/clearDiagnosisHandoff) · `lib/diagnosis/fixtures/fracture-case.ts`(FRACTURE_FIXTURE_INPUT + buildFractureResult) 신규 작성. `step-loading.tsx`의 `mockJudge`를 `reviewEnabled` boolean 매개변수 기반 3갈래(`result-none`/`error`/`result`)로 확장하고, `diagnosis-flow.tsx`에 `"result"` 수신 시 `buildFractureResult → writeDiagnosisHandoff → router.push('/result')` 콜백 및 새 진단 시작 시 `clearDiagnosisHandoff()` 호출을 추가했다(REQ-B2CRESULT-007~012/016/017).
- **Evidence**: `npx vitest run`(전체 스위트) → `Test Files 57 passed (57)` / `Tests 448 passed (448)`(커밋 `b342df5`, plan/SPEC-B2C-RESULT-001 브랜치 기준 재실행 확인, 기존 420개 전부 회귀 없음 포함); `npx tsc --noEmit -p tsconfig.json` → 0 errors; sessionStorage 키는 `"bosang-radar:diagnosis-handoff-v1"`(코드 주석에 기록).
- **Baseline-attribution**: 커밋 `b342df5`(plan/SPEC-B2C-RESULT-001, cherry-pick from `c7a5102`), 이 커밋 기준 `npx vitest run` 전체 재실행 + `npx tsc --noEmit` 재실행으로 확인.
- **Gaps**: `flags.ts`/`app/result/`/`components/result/`/`e2e/diagnosis-flow-02.spec.ts`는 범위 밖(Milestone 3-6). eslint/prettier는 격리 워크트리에서만 실행됨(clean 보고) — plan 브랜치 cherry-pick 후 재실행하지 않음(코드 diff 자체는 변경 없이 그대로 적용됨).
- **Residual-risk**: `mockJudge`의 exact-match fixture 게이팅은 단일 고정 문자열(`FRACTURE_FIXTURE_INPUT`)에 대해서만 테스트됨 — 향후 fixture가 늘어나면 각각 개별 exact-match 테스트가 필요. `reviewEnabled` prop은 `diagnosis-flow.tsx`에서 `ENABLE_DIAGNOSIS_DEV_STATES` 서버 전용 env로부터 파생되는 `enableDevStates`를 그대로 전달하는데, 이 파생 경로 자체(`lib/diagnosis/flags.ts`)는 Milestone 3에서 아직 존재하지 않아 현재는 diagnosis-flow.tsx 자체 로컬 계산에 의존 — Milestone 3에서 `flags.ts` 공유 헬퍼로 전환 시 회귀 테스트 필요.

### Milestone 3 — 게이트 공유 리팩터 + `/result` 라우트 셸 (2026-09-22)

- **Claim**: `lib/diagnosis/flags.ts`(신규, `computeDiagnosisFlags(env)`)로 `app/page.tsx`의 인라인 게이트 계산(`productionReady`/`reviewEnabled`/`shouldRenderDiagnosis`)을 동작 무변경으로 추출·리팩터했다(REQ-B2CRESULT-012). `app/result/page.tsx`(Server Component) 신설 — 동일 헬퍼로 게이트 계산, 거짓이면 `app/page.tsx`와 동일한 placeholder, 참이면 `<Suspense fallback={<ResultSkeleton />}><ResultView /></Suspense>`(REQ-B2CRESULT-013~015 대비 최소 셸). `components/result/result-skeleton.tsx`·`result-view.tsx`(최소 placeholder, Milestone 4에서 실제 구현으로 교체 예정)도 함께 신설.
- **Evidence**: `npx vitest run`(전체 스위트) → `Test Files 59 passed (59)` / `Tests 464 passed (464)`(커밋 `8843714`, plan/SPEC-B2C-RESULT-001 브랜치 기준 재실행 확인); `npx tsc --noEmit -p tsconfig.json` → 0 errors(clean). `app/page.test.tsx`의 기존 5행 동작 행렬은 한 글자도 수정되지 않았고 전체 스위트 통과에 포함되어 회귀 없음을 확인.
- **Baseline-attribution**: 커밋 `8843714`(plan/SPEC-B2C-RESULT-001, cherry-pick from `8350d81`), 이 커밋 기준 `npx vitest run` 전체 재실행 + `npx tsc --noEmit` 재실행으로 확인.
- **Gaps**: `components/result/`의 나머지 8개 컴포넌트(`result-input-summary`/`result-priority-checklist`/`coverage-category-section`/`coverage-item-card`/`result-aggregate-banner`/`result-category-tabs`/`result-cta-bar`/`result-no-data`/`result-error`)는 Milestone 4 범위. `app/result/page.tsx`용 Next.js Server Component 전용 테스트 컨벤션이 이 저장소에 없어, 기존 `app/page.test.tsx`의 순수 함수 컴포넌트 렌더링 패턴을 재사용했다 — async 데이터 페칭이 추가되는 Milestone 4 이후에는 이 패턴의 한계를 재검토 필요.
- **Residual-risk**: 게이트 계산이 `app/page.tsx`와 `app/result/page.tsx` 양쪽에서 동일 `computeDiagnosisFlags(process.env)` 호출로 이뤄지는지는 코드 리뷰로 확인했으나, 두 라우트를 동시에 렌더링하는 통합 테스트는 없음(각 라우트가 독립적으로 테스트됨).

### Milestone 4 — Desktop/Mobile 결과 컴포넌트 (2026-09-22)

- **Claim**: `components/result/`에 `result-view.tsx`(M3 stub 교체, 3갈래 분기 + Desktop/Mobile 미디어쿼리 분기) 및 `result-input-summary`/`result-priority-checklist`/`coverage-category-section`/`coverage-item-card`/`result-aggregate-banner`/`result-category-tabs`/`result-cta-bar`/`result-no-data`/`result-error`(전부 신규) + 케이스 무관 고정 문구를 모으는 `labels.ts`(신규, plan.md §F 목록엔 없으나 design.md의 하드코딩 금지 조항 충족을 위해 추가)를 작성했다(REQ-B2CRESULT-001~006/019~023).
- **Evidence**: `npx vitest run`(전체 스위트) → cherry-pick 직후 1차 실행에서 `app/result/page.test.tsx`의 2개 테스트가 실패(아래 Gap 참고) → 수정 커밋 `3cc5766` 이후 재실행 → `Test Files 64 passed (64)` / `Tests 486 passed (486)`(커밋 `3cc5766`, plan/SPEC-B2C-RESULT-001 브랜치 기준); `npx tsc --noEmit -p tsconfig.json` → 0 errors; `npx eslint components/result app/result` → 0 errors, 0 warnings.
- **Baseline-attribution**: 커밋 `3cc5766`(plan/SPEC-B2C-RESULT-001, M4 cherry-pick `2b5ef0e` + 경계 수정 커밋), 이 커밋 기준 `npx vitest run` 전체 재실행 + `npx tsc --noEmit` + `npx eslint` 재실행으로 확인.
- **Gaps (M3/M4 경계 회귀 — orchestrator가 직접 수정)**: M4 cherry-pick 직후 `app/result/page.test.tsx`(M3 산출물)의 2개 테스트가 실패했다 — 원인은 (a) M3 시점엔 `result-view.tsx`가 정적 placeholder였으나 M4가 실제 구현으로 교체하면서 게이트-참 분기가 `sessionStorage`에 handoff 데이터가 없는 테스트 환경에서 `<ResultNoData/>`까지 렌더링하게 됐고, `ResultNoData`가 `next/navigation`의 `useRouter()`를 쓰는데 이 테스트 파일엔 App Router 컨텍스트가 없어 예외가 발생(`diagnosis-flow.test.tsx`가 이미 쓰는 `next/navigation` 모킹 관례를 적용해 해결), (b) 더 이상 존재하지 않는 `data-testid="result-view-placeholder"` 어서션을 실제 렌더 결과인 `data-testid="result-no-data"`로 정정. `components/result/*`의 M4 자체 테스트(22건)는 cherry-pick 전부터 이미 통과 상태였음. `app/result/page.tsx`용 Server Component 전용 테스트 컨벤션은 여전히 이 저장소에 없음(M3부터 이어지는 Gap). Design DNA/Figma `.pen` 원본 대비 픽셀 단위 검증은 하지 않았고 스크린샷 3/5장만 열람함(M02-B/M02-D 미열람) — 시각 정합성 검증은 Milestone 6의 `pnpm visual:verify` 확장 범위.
- **Residual-risk**: reduced-motion/정확한 포커스 순서 접근성 폴리시는 Milestone 5로 의도적으로 이연됨(현재 `scrollIntoView`/`.focus()` 호출은 `prefers-reduced-motion` 미확인). "왜 확인해야 하나요?" 접힘 UI는 네이티브 `<details>/<summary>`로 구현됐는데 디자인 목업과 픽셀 단위 상호작용 일치는 미검증. 모바일 탭 전환 시 포커스 이동 로직이 `result-view.tsx`에 중앙화되어 있어 `result-category-tabs.tsx` 자체 테스트만으로는 이 이동을 완전히 커버하지 못할 수 있음 — Milestone 5의 접근성 테스트에서 통합 시나리오로 재검증 필요.

### Milestone 5 — 접근성·반응형·unit/component 테스트 보강 (2026-09-22)

- **Claim**: Milestone 4의 3개 residual-risk 항목을 검증·해소했다 — ① `scrollIntoView` 호출부(우선순위 카드 Desktop anchor-scroll, Mobile 탭 전환)에 기존 `components/diagnosis/use-media-query.ts`의 `useMediaQuery` 훅 패턴을 재사용해 `REDUCED_MOTION_MEDIA_QUERY` 기반 `prefers-reduced-motion` 가드를 추가(`behavior: prefersReducedMotion ? "auto" : "smooth"`), ② "왜 확인해야 하나요?" 접힘 UI는 동작 검증만 유지(픽셀 검증은 Milestone 6 시각 정합성 범위로 확정), ③ 모바일 탭 전환 포커스 이동(`result-view.tsx` 중앙화 로직)을 `ResultView` 전체를 마운트하는 통합 테스트로 커버(`ArrowRight` 키보드 이동 + 우선순위 카드 선택 양쪽 경로 모두 새 패널 `<h2>`로 포커스 이동함을 검증). 추가로 `result-category-tabs.tsx`에 `ArrowLeft`/`ArrowRight`(랩어라운드)/`Home`/`End` 키보드 탐색을 구현(REQ-B2CRESULT-019/021), `result-no-data.test.tsx`/`result-error.test.tsx` 신규 작성(CTA → `router.push("/")` 검증), status pill 3톤 텍스트 라벨 및 mockJudge 3갈래 회귀는 기존 M4/M2 테스트로 이미 충분히 커버됨을 확인(중복 테스트 미추가).
- **Evidence**: `npx vitest run`(전체 스위트) → `Test Files 66 passed (66)` / `Tests 501 passed (501)`(커밋 `1de06e6`, plan/SPEC-B2C-RESULT-001 브랜치 기준 재실행 확인, M4 대비 +2 파일/+15건); `npx tsc --noEmit -p tsconfig.json` → 0 errors; `npx eslint components/result app/result components/diagnosis` → 0 errors, 0 warnings.
- **Baseline-attribution**: 커밋 `1de06e6`(plan/SPEC-B2C-RESULT-001, M5 cherry-pick `e1dcd4d` — `result-category-tabs.{tsx,test.tsx}`/`result-view.{tsx,test.tsx}` 4개 파일은 M4 버전과의 add/add 충돌을 M5 버전으로 해소), 이 커밋 기준 `npx vitest run` 전체 재실행 + `npx tsc --noEmit` + `npx eslint` 재실행으로 확인.
- **Gaps**: `app/result/page.tsx`용 Server Component 전용 테스트 컨벤션은 여전히 부재(M3부터 이어지는 Gap, Milestone 6까지 미해결 예정). "왜 확인해야 하나요?" 접힘 UI의 디자인 목업 대비 픽셀 단위 검증은 Milestone 6의 `pnpm visual:verify` 확장으로 이연.
- **Residual-risk**: 키보드 탐색(`ArrowLeft`/`ArrowRight`/`Home`/`End`)이 WAI-ARIA Tabs 패턴을 따르는지는 코드 리뷰와 유닛 테스트로 확인했으나 실제 스크린리더(NVDA/VoiceOver)로 수동 검증하지는 않음 — 이 SPEC 범위에서 자동화된 스크린리더 테스트 도구는 사용하지 않기로 함(design.md에 명시된 범위 밖).

### Milestone 6 — E2E + 시각 정합성 확장 + 문서 동기화 (2026-09-22, SPEC 최종 마일스톤)

- **Claim**: `e2e/diagnosis-flow-02.spec.ts` 신규(01→02 전체 플로우, Mobile 탭 전환, 직접 접근 no-data, `?devFixture=fracture` review 전용 직접 진입 — REQ-B2CRESULT-002/003/007/008/009/010/012/013). `scripts/visual-verify.ts`에 5개 신규 화면(`02`/`M02`/`M02-B`/`M02-C`/`M02-D`) 등록(기존 10개 배열 항목은 수정 없이 그대로 유지 확인됨 — 아래 검증 참고). `product.md`/`structure.md` Roadmap을 02 완료로 갱신. 부수적으로 `result-view.tsx`에서 배경색 누락 실버그(`bg-app-bg` 부재로 흰 배경 렌더링)를 시각 검증 과정에서 발견·수정.
- **Evidence**:
  - `npx vitest run`(전체 스위트) → `Test Files 66 passed (66)` / `Tests 504 passed (504)`(커밋 `83d39a8`, plan/SPEC-B2C-RESULT-001 브랜치 기준 재실행 확인, M5 대비 +3건 devFixture 테스트); `npx tsc --noEmit` → 0 errors; `npx eslint` → 0 errors, 0 warnings.
  - `npx tsx scripts/run-e2e.ts`(Playwright, 01+02 전체) → **20 passed, 0 failed**(agent 보고, 브랜치 재실행은 하지 않음 — 아래 Gaps 참고). 기존 `diagnosis-flow-01.spec.ts`의 16개 테스트 전부 수정 없이 통과 포함(REQ-B2CRESULT-011 회귀 없음).
  - `pnpm visual:verify`(15화면 전체, agent 보고) → **기존 10화면 전부 PASS(회귀 없음, REQ-B2CRESULT-025의 "기존 10화면 유지" 절 충족)**. **신규 5화면(02/M02/M02-B/M02-C/M02-D)은 전부 FAIL**(maxΔ 45px~281px, 허용 오차 4~8px 초과) — 화면은 정상 등록·렌더링되고 스크린샷/오버레이/diff 산출물은 생성되나 픽셀 위치 허용치에 수렴하지 못함. 이 저장소의 `scripts/visual-verify.ts` SCREENS 배열에 15개 id(01/01-A2/01-B/01-C/01-D/01-E/M01/M01-A2/M01-B/M01-C/02/M02/M02-B/M02-C/M02-D) 전부 존재함을 orchestrator가 직접 grep으로 재확인함(기존 10개 미삭제 확인).
- **Baseline-attribution**: 커밋 `83d39a8`(plan/SPEC-B2C-RESULT-001, cherry-pick from `93c38a4`, 충돌 없음). `npx vitest run`/`npx tsc`/`npx eslint`/SCREENS id grep은 이 커밋 기준 orchestrator가 직접 재실행·확인. `npx tsx scripts/run-e2e.ts`(20/20)와 `pnpm visual:verify`(10 PASS + 5 FAIL) 수치는 agent가 자신의 워크트리(동일 diff, 커밋 `93c38a4`)에서 실행한 결과를 인용한 것이며, orchestrator가 plan 브랜치에서 재실행하지는 않았다(각각 ~5분/`next build` 소요로 비용이 커서 diff가 byte-identical함을 cherry-pick 무충돌로 확인하는 선에서 갈음함) — 이는 완전한 attribution이 아니라 **Gap**으로 명시한다.
- **Gaps**:
  1. **REQ-B2CRESULT-025는 부분 충족이다** — "기존 10화면 PASS 유지" 절은 충족되었으나 "신규 5화면 PASS" 절은 미충족(5/5 FAIL, 허용 오차 초과). AC-B2CRESULT-025의 Given-When-Then은 두 절 모두를 요구하므로, 이 AC는 **미완료(open)** 상태로 남는다 — 후속 조치가 필요하다(디자인 픽셀 좌표 재측정을 통한 `designTopHint` 정밀 튜닝, 또는 카드 그리드 요소를 측정 범위에 포함하는 로직 보강, 또는 시각 정합성 허용 기준을 담당자가 명시적으로 재검토).
  2. e2e(20/20)와 visual-verify(10 PASS/5 FAIL) 수치는 orchestrator가 plan 브랜치에서 직접 재실행하지 않고 agent 워크트리 실행 결과를 인용했다(위 baseline-attribution 참고) — `npx tsc`/`npx vitest`/`npx eslint`/SCREENS 배열 구조만 plan 브랜치에서 직접 재확인함.
  3. `app/result/page.tsx`용 Server Component 전용 테스트 컨벤션은 SPEC 전체에 걸쳐 끝내 도입되지 않음(M3부터 이어진 Gap, 기존 `react-dom/client` 직접 렌더링 패턴 재사용으로 갈음).
  4. 이 브랜치는 main의 `SPEC-B2C-DIAGNOSIS-001` 문서 동기화 커밋(`ad4e2de`)이 랜딩되기 전에 분기되었다는 점을 agent가 지적함 — `product.md`/`structure.md`의 병합 시점 충돌 가능성은 sync-phase(또는 병합 전)에서 별도 확인이 필요하다.
- **Residual-risk**: 신규 5화면의 시각 검증 실패가 실제 UI 결함(레이아웃이 디자인과 다름)인지, 아니면 `visual-verify.ts` 도구의 measurement 튜닝 부족(카드 그리드 요소 미포함, `designTopHint` 추정치 부정확)인지는 완전히 분리되지 않았다 — agent는 후자로 진단했으나(배경색 버그 1건은 실제 발견·수정됨), 사람의 눈으로 실제 브라우저에서 `/result` 화면을 직접 열어 디자인과 육안 대조하는 확인이 아직 없다.

### Milestone 6 후속 — visual-verify.ts 픽셀 정합성 튜닝 (2026-09-22)

- **Claim**: `designTopHint` 추정치를 눈대중이 아니라 `segmentBands()`/`dominantColor()` 실제 측정 로직을 그대로 실행하는 디버그 스크립트(커밋에는 미포함)로 직접 측정해 M02/M02-B/M02-C/M02-D의 4개 요소(`inputSummary`/`aggregateBanner`/`priorityChecklist`/`categoryTabs`) 값을 참값으로 정정했다. `BOX_LIKE_KEYS` 편입 시도는 M02 maxΔ를 45px→1916px로 악화시켜 되돌렸다(전체 페이지가 하나의 band로 병합되는 부작용 확인). `02`(Desktop)는 기존 값이 이미 정확해 변경 없음.
- **Evidence**: `pnpm visual:verify`(전체 15화면, agent 보고) → 기존 10화면 byte-identical maxΔ로 PASS 유지(회귀 없음, `git diff`로 기존 항목 미변경 확인됨). 신규 5화면은 여전히 전부 FAIL이나 수치가 "정직해졌다" — 튜닝 전 M02-B(76px)/M02-D(78px)는 4개 요소 중 3개가 `design: null`(band 미탐지)로 조용히 maxΔ 계산에서 빠진 결과였고, 튜닝 후 4개 전부가 실제 band에 매칭되면서 진짜 최대 편차(182px, priorityChecklist)가 드러남. `npx vitest run` → 504/504 유지(orchestrator가 plan 브랜치에서 직접 재실행 확인); `npx tsc --noEmit` → 0 errors(orchestrator 직접 재확인).
- **Baseline-attribution**: 커밋 `a1d2e30`(plan/SPEC-B2C-RESULT-001, cherry-pick from `a795d0f`, 충돌 없음). `npx vitest run`/`npx tsc --noEmit`은 이 커밋 기준 orchestrator가 plan 브랜치에서 직접 재실행. `pnpm visual:verify`의 per-screen maxΔ 수치는 agent가 자신의 워크트리(동일 diff)에서 실행한 결과를 인용(전체 `next build` 소요 비용 고려, cherry-pick 무충돌로 diff 동일성 확인하는 선에서 갈음 — M6 본체와 동일한 attribution 한계).
- **핵심 발견 — 이것은 도구 버그가 아니라 디자인·데이터 불일치다**: overlay/diff 이미지와 소스를 직접 대조한 결과, 잔여 편차의 원인은 (1) **집계 총계 불일치** — `design/exports/M02-*.png` 목업은 "15개 담보 분석"(검토대상8·정보필요6·낮음1)을 보여주는데 `lib/diagnosis/fixtures/fracture-case.ts`의 `buildItems()`는 실제로 7개 항목(4·2·1)만 반환한다. (2) **priorityChecklist 스타일 불일치** — 디자인 목업은 "먼저 확인할 항목"을 번호 원 + 제목 + 화살표만 있는 한 줄짜리 컴팩트 리스트로 그리는데, `result-priority-checklist.tsx`는 Desktop/Mobile 모두 설명 문구가 포함된 테두리 카드로 렌더링하며 Mobile은 1열 그리드라 3개 카드가 세로로 쌓여 이 편차의 최대 기여 요소(182px)가 된다.
- **Gaps**: 이 발견에 따른 후속 결정은 이 milestone의 범위 밖이다(fixture 데이터를 15개 항목 시나리오로 확장할지, 디자인 export를 7개 항목 기준으로 갱신할지, priorityChecklist에 Mobile 전용 컴팩트 variant를 추가할지는 design/product 판단이 필요 — orchestrator가 사용자에게 별도로 묻는다). REQ-B2CRESULT-025의 "신규 5화면 PASS" 절은 이 결정이 내려지고 반영되기 전까지 계속 미충족 상태로 남는다.
- **Residual-risk**: 도구 튜닝 자체는 완료되어 더 이상 신뢰할 수 없는 측정치(누락된 band로 인한 인위적으로 낮은 maxΔ)는 없다 — 남은 FAIL은 전부 실제 콘텐츠/컴포넌트 차이를 정확히 반영한다.

### 사용자 결정 — REQ-B2CRESULT-025 PASS-WITH-DEBT 확정 (2026-09-22)

위 두 항목(집계 총계 불일치·priorityChecklist 카드 스타일)에 대해 orchestrator가 AskUserQuestion으로 확인한 결과, 사용자는 **둘 다 현재 상태 그대로 두고 보류**하기로 결정했다:

- 담보 개수 불일치: 이 SPEC은 계약상 골절 사례 1종만 다루므로(spec.md Out of Scope) 7개 항목이 자연스러울 수 있다는 근거로 보류 — fixture를 15개로 확장하지 않는다.
- priorityChecklist 카드 스타일: 설명 문구가 있는 카드 형태를 유지 — Mobile 전용 컴팩트 variant를 만들지 않는다.

**결론**: REQ-B2CRESULT-025의 "신규 5화면 PASS" 절은 사용자 승인 하에 **PASS-WITH-DEBT**로 확정한다 — 기존 10화면 PASS 유지(충족) + 신규 5화면은 시각 정합성 허용 오차 미충족(사용자 승인 보류, 결함 아님 — 실제 UI/기능 결함이 아니라 디자인 시안과의 의도적 불일치로 확인됨). 이 결정을 뒤집으려면 이 항목을 다시 열어 fixture 또는 컴포넌트를 수정해야 한다.

## §E.3 Run-phase Audit-Ready Signal

- `run_status: review-fixes-pending` — **직전의 `audit-ready-with-debt` 주장은 철회한다.** 독립 검토(2026-09-22)에서 실제 결함(D1 Fact Chip questionId 불일치)과 계약 위반(D4 use-media-query.ts 범위 위반) 및 디자인 대비 UI 누락(D2, 사용자 미승인)이 확인됐다. 이 신호는 D1~D6 수정이 전부 완료되고 재검증될 때까지 `audit-ready-with-debt`로 재전환되지 않는다.
- 허용되는 debt는 사용자가 명시적으로 승인한 다음 2건뿐이다: ① fixture 담보 7개 유지(15개로 확장 안 함), ② `priorityChecklist` 카드형 유지(컴팩트 목록으로 되돌리지 않음). 그 외 모든 누락·위반은 debt가 아니라 수정 대상이다.
- **재확인(2026-09-23)**: 위 철회 이후 D1~D6 전 항목이 수정·재검증 완료됐다(아래 "후속 수정 — D1(Fact Chip questionId) + D4", "D2", "D3", "D5", "D6" 5개 하위 섹션 참고 — 모두 orchestrator가 이 세션에서 직접 또는 manager-git 위임을 통해 재확인). 이 재검증 라운드의 증거를 근거로 `run_status`를 **`audit-ready-with-debt`로 재확인**한다(재확인 대상 커밋 `b0ba9a1`, 이 워크트리 기준). 허용되는 debt는 여전히 위에서 사용자가 명시적으로 승인한 정확히 2건(① fixture 담보 7개 유지, ② `priorityChecklist` 카드형 유지)으로 한정되며, 이번 재검증 라운드에서 이 2건에 명확히 귀속되지 않는 다른 편차는 발견되지 않았다. D5에서 확인된 커버리지 재측정 불가(Windows v8 coverage 0/0 버그)는 이 승인된 debt 범위에 포함되지 않는 별도의 **Gap**이다 — debt로 편입하지 않고 아래 D5 섹션에 Gap으로 명시한다.

### 후속 수정 — D1(Fact Chip questionId) + D4(use-media-query.ts 범위 위반) (2026-09-22)

- **Claim**: `lib/diagnosis/fixtures/fracture-case.ts`의 잘못된 질문 ID(`surgery`→`surgery-status`, `accidentLocation`→`accident-location`)를 실제 01-B ID(`step-questions.tsx`에서 직접 확인)와 일치시켰다 — 이 버그로 인해 실제 01→02 플로우에서 수술 여부·사고 장소 응답이 있어도 Fact Chip이 표시되지 않고 있었다. `use-media-query.ts`/`use-media-query.test.ts`(M5가 범위를 벗어나 수정했던 기존 01 파일)를 pre-M5 상태로 완전히 원복하고, `REDUCED_MOTION_MEDIA_QUERY` 상수는 `components/result/result-view.tsx` 내부 지역 상수로 이동했다(기존 제네릭 `useMediaQuery` 훅은 그대로 재사용, 새 훅 미생성).
- **Evidence**: `npx vitest run`(전체 스위트) → `Test Files 66 passed (66)` / `Tests 503 passed (503)`(커밋 `3b031d1`, plan/SPEC-B2C-RESULT-001 브랜치 기준 재실행 확인, 504→503은 relocate된 회귀 테스트 1건 제외분); `npx tsc --noEmit` → 0 errors; `npx eslint components/diagnosis lib/diagnosis components/result e2e` → 0 errors, 0 warnings(orchestrator 직접 재확인). `git diff 2c53ace -- components/diagnosis/use-media-query.ts components/diagnosis/use-media-query.test.ts` → 빈 출력(pre-M5 baseline과 완전 동일 확인, orchestrator 직접 재확인). e2e `diagnosis-flow-02.spec.ts` 4/4 통과(agent 보고, 실제 01→02 플로우에서 3개 응답 질문 전부 Fact Chip 노출 확인 — 이 수정의 핵심 증거).
- **Baseline-attribution**: 커밋 `3b031d1`(plan/SPEC-B2C-RESULT-001, cherry-pick from `a8d26c1`, 충돌 없음). `npx vitest run`/`npx tsc --noEmit`/`npx eslint`/`git diff` zero-diff 확인은 이 커밋 기준 orchestrator가 직접 재실행. e2e 4/4는 agent 워크트리 실행 결과 인용(동일 diff, cherry-pick 무충돌로 동일성 확인).
- **Gaps**: D2(디자인 UI 누락 8종)/D3(visual-verify semantic gate)/D5(커버리지·포맷)/D6(main 병합·PR 갱신)는 아직 미착수 — 후속 커밋에서 순차 진행.

### 후속 수정 — D2(디자인 대비 누락 UI 8종) (2026-09-22)

- **Claim**: 8개 항목 전부 신규 구현(기존 부분 구현 없음) — ① 실손 가입세대 선택 위젯(`result-generation-selector.tsx`, 로컬 state만, `DiagnosisResult` 미변경), ② 필수 면책 안내(`result-disclaimer.tsx`, 항상 노출·아이콘+텍스트, 조건부 표현), ③ 결과 Footer(`result-footer.tsx`, 신규 파일, 기존 01 Footer 미수정), ④ 입력 조건 `<details>` 공개(`result-input-condition-disclosure.tsx`), ⑤ 카테고리 한 줄 설명(`labels.ts`의 `CATEGORY_DESCRIPTION` 4종 + `coverage-category-section.tsx` 렌더링), ⑥ 최종 CTA sticky를 Mobile 전용으로 정정(`sticky bottom-0 md:static`, orchestrator가 직접 grep으로 확인), ⑦ 카카오톡 상담 버튼에 `aria-label="카카오톡 상담"` 추가(Mobile에서 텍스트 숨김에도 접근 가능한 이름 확보, orchestrator가 직접 grep으로 확인), ⑧ `/result` metadata를 `generateMetadata()`로 전환해 게이트 열림 시 "보상 진단 결과", 닫힘 시 "서비스 준비 중"으로 분기(orchestrator가 직접 grep으로 확인).
- **Evidence**: `npx vitest run`(전체 스위트) → `Test Files 71 passed (71)` / `Tests 527 passed (527)`(커밋 `4be0469`, plan/SPEC-B2C-RESULT-001 브랜치 기준 재실행 확인, D2 대비 +5파일/+24건); `npx tsc --noEmit` → 0 errors; `npx eslint components/result app/result` → 0 errors, 0 warnings(모두 orchestrator 직접 재확인). 핵심 수정 3건(sticky 클래스, aria-label, generateMetadata 분기)은 orchestrator가 grep으로 코드 자체를 직접 열람해 재확인함.
- **Baseline-attribution**: 커밋 `4be0469`(plan/SPEC-B2C-RESULT-001, cherry-pick from `c38c438`, 충돌 없음). 전체 검증(vitest/tsc/eslint) + 3건 grep 재확인 모두 orchestrator가 이 커밋 기준 직접 실행.
- **Gaps**: `result-view.tsx`는 이번 수정 허용 범위 밖이었으므로, 항목 ②③④(면책·Footer·입력조건 공개)는 자연스러운 삽입 지점이 없어 `ResultFinalCta` 호출부(Fragment로 확장) 안에 함께 묶여 배치됐다 — 구조적으로는 `result-input-summary.tsx` 인접이 더 적합할 수 있어 후속 milestone에서 재배치 검토가 필요하다. 항목 ④(입력 조건 공개)는 `readDiagnosisHandoff()`를 독립적으로 재호출하며(읽기 전용, 여러 번 호출해도 안전), `?devFixture=fracture` review 전용 진입 경로에서는 sessionStorage가 채워지지 않아 조용히 렌더링되지 않는다 — review 전용 진입에서도 입력 조건을 보여줄지는 별도 판단이 필요하다. D3(visual-verify semantic gate)/D5(커버리지·포맷)/D6(main 병합·PR 갱신)는 아직 미착수.
- **Residual-risk**: 위 Gaps의 배치 구조는 기능적으로는 동작하나(테스트로 확인됨) UI 계층 구조상 이상적이지 않을 수 있다 — 실제 브라우저 렌더링 결과의 시각적 순서는 아직 육안 확인되지 않았다.

### 후속 수정 — D3(visual-verify semantic gate 확장) (2026-09-22)

- **Claim**: `scripts/visual-verify.ts`의 신규 5화면(`02`/`M02`/`M02-B`/`M02-C`/`M02-D`)에 존재/부재 기반 `semanticChecks`를 추가했다(기존 픽셀 좌표 측정 3~4개 요소만으로는 하단 위젯이 통째로 사라져도 통과하던 사각지대 해소). Desktop `02` 12건(입력요약·집계배너·우선순위체크리스트·4개 카테고리 섹션·가입세대 위젯·면책안내·후유장해 중간 CTA·최종CTA·Footer), Mobile 각 화면 8~9건(활성 탭·해당 카테고리 섹션과 카드·비활성 카테고리 섹션의 DOM 실제 부재·면책안내·Footer·sticky 최종CTA와 그 `position: sticky` 계산값). 신규 컴포넌트에는 D2에서 이미 testid가 부여돼 있어 추가 테스트id 삽입 불필요.
- **Evidence**: `npx vitest run`(전체 스위트) → `Test Files 71 passed (71)` / `Tests 527 passed (527)`(커밋 `328648d`, plan/SPEC-B2C-RESULT-001 브랜치 기준 재실행 확인); `npx tsc --noEmit` → 0 errors; `npx eslint scripts/visual-verify.ts` → 0 errors, 0 warnings(모두 orchestrator 직접 재확인). `pnpm visual:verify` 4분리 보고(agent 실행 결과 인용): ① 기존 10화면 회귀 — PASS(maxΔ byte-identical); ② 신규 화면 필수 요소 semantic gate — **PASS 45/45**(0 fail); ③ 사용자 승인 시각 부채 — fixture 7개 vs 목업 15개 집계 불일치, priorityChecklist 카드형 유지, 이 커밋으로 새로 발생한 편차 없음; ④ 종합 — **PASS-WITH-DEBT**(부채 2건 제외 미추적 편차 없음).
- **Baseline-attribution**: 커밋 `328648d`(plan/SPEC-B2C-RESULT-001, cherry-pick from `7d2c6c6`, 충돌 없음). `git show 328648d --stat` + 제거 라인 수 grep으로 `scripts/visual-verify.ts`가 순수 추가(307 insertions, 0 deletions)임을 orchestrator가 직접 확인 — 기존 10화면 항목이 정말 손대지 않았음을 재확인.
- **핵심 발견**: 리뷰가 언급한 "후유장해 중간 페이지 CTA"는 실제로 존재하는 컴포넌트(`result-cta-disability`, D2에서 이미 구현)로 확인돼 체크에 포함됐다. "입력 조건 공개"(`result-input-condition-disclosure`)는 review 전용 `?devFixture=fracture` 진입 경로에서 sessionStorage를 읽지 않아 이 시각 검증 5화면 전부에서 항상 렌더링되지 않는다는 사실이 재확인됐다(D2 Gaps에 이미 기록) — 이번 요청 범위 밖이라 semantic check는 추가하지 않았다(존재하지 않는 이유로 항상 실패하는 체크를 만드는 안티패턴 회피).
- **Gaps**: D5(커버리지 85%+·prettier·build)/D6(main 병합·PR 갱신)는 아직 미착수.

- 다음 단계(2026-09-22 작성 당시 기준 — 이후 아래와 같이 갱신됨): D5(품질 게이트 보완)로 계속 진행. `/moai sync`로 넘어가지 않는다(사용자 명시적 지시). **2026-09-23 갱신**: D5·D6 모두 완료됐다(아래 두 하위 섹션 참고). `/moai sync`는 사용자 명시적 지시에 따라 여전히 미실행 상태이며, PR #19는 병합하지 않고 OPEN 상태로 유지한다.

### 후속 수정 — D5(품질 게이트 재측정: 타입체크·린트·포맷·테스트·빌드·E2E·visual-verify) (2026-09-23)

- **Claim**: 이 워크트리(`C:/Users/Nexsol/Documents/bosang-radar/.claude/worktrees/spec-b2c-result-001-d6-merge`)에서 `pnpm install --frozen-lockfile`로 의존성을 정식 설치한 뒤, 커밋 `b0ba9a1` 기준으로 D5(품질 게이트) 전체 항목을 새로 측정했다. 이전에 있었던, 정식 `pnpm install` 이전 애드혹 `npx` 실행에서 `app/layout.tsx`의 `LayoutProps` 오류 1건이 오탐(false positive)으로 보고된 바 있으나, 이는 의존성이 제대로 해석되지 않은 상태에서 나온 결과였고 이번 정식 측정에는 재현되지 않는다.
- **Evidence**:
  - `pnpm exec tsc --noEmit -p tsconfig.json` → exit 0, 0 errors.
  - `pnpm lint`(eslint) → exit 0, 0 errors.
  - `pnpm format:check`(prettier) → exit 1이나, 실패 대상은 이 SPEC과 무관한 기존 파일 3개뿐(`db/migrations/meta/_journal.json`, `db/migrations/meta/0008_snapshot.json`, `design/MIGRATION-PLAN.md`) — 이 SPEC이 변경한 파일 중 포맷 실패는 0건.
  - `pnpm test`(vitest, 전체 스위트) → exit 0, **527/527 passed**, 71개 테스트 파일.
  - `pnpm build` → exit 0. 사전 존재 경고 1건(`instrumentation.ts:33:7`, Edge Runtime 컨텍스트에서의 `process.exit`) — `git diff origin/main -- instrumentation.ts`가 빈 출력임을 확인해 이 파일이 이 SPEC의 변경 대상이 아니며 이 경고가 이 작업으로 새로 발생한 것이 아님을 orchestrator가 직접 확인했다.
  - `pnpm test:e2e`(Playwright) → exit 0, **20/20 passed**(01-flow 16건 + 02-flow 4건, 01→02 전체 핸드오프 및 `?devFixture=fracture` review 전용 직접 진입 경로 포함).
  - `pnpm visual:verify` → `.moai/reports/visual-check/SPEC-B2C-DIAGNOSIS-001/measurements.json`(generatedAt 2026-09-23T00:49:46Z)에 기록. semantic gate **45/45 PASS**(신규 5화면 전체, element 존재·탭 aria-selected 상태·비활성 카테고리 섹션 DOM 실제 제거·sticky CTA 포지셔닝 검증 포함, 0 fail). 픽셀/배경 지표 체크는 신규 5화면 전부 FAIL(maxΔ 45~182px, 허용 오차 4~8px 초과)이나 기존 10화면은 전부 PASS(허용 오차 내). 45건의 violation은 전부 `(metric)` 또는 `(background)` 라벨이며 `(semantic)` 라벨은 0건 — 즉 누락된 UI 요소로 인한 실패는 없다. 이 픽셀 편차는 §E.2 "사용자 결정 — REQ-B2CRESULT-025 PASS-WITH-DEBT 확정" 섹션에서 이미 사용자 승인을 받은 2건(fixture 담보 7개 유지, priorityChecklist 카드형 유지)으로 전량 귀속됨을 그 섹션에서 이미 확인한 바 있다.
  - `grep -rn "DIAGNOSIS_ENGINE_READY=true"` — `app/`, `lib/`, `components/`, env 파일 전체 스캔 결과 실제 프로덕션 할당/설정 지점 0건(모두 `@MX:UPGRADE` 코드 주석 내부 언급뿐).
  - `git diff --check origin/main HEAD` → exit 0, `origin/main` 대비 이 브랜치 diff 전체에서 공백/잔여 충돌 마커 이슈 없음.
- **Baseline-attribution**: 커밋 `b0ba9a1`(plan/SPEC-B2C-RESULT-001, 이 워크트리 HEAD), 위 전 항목을 이 커밋 기준으로 orchestrator가 이 세션에서 직접 재실행해 확인했다.
- **Gaps**: **커버리지를 이 커밋에 대해 직접 재측정하지 못했다.** 이 Windows 환경 체크아웃은 `vitest.config.ts` 자체 코드 주석에 기록된 기존 알려진 도구 버그를 재현한다 — v8 coverage가 include/exclude 설정과 무관하게 OS 자체 사유로 0/0을 반환하며, 해당 주석은 Linux/Mac에서는 정상 측정됨을 명시한다. 이 세션에서 3회(범위 제한 실행, 전체 스위트 실행, `.vite` 캐시 삭제 후 재실행) 재현을 확인했고 WSL 등 Linux 대체 환경은 가용하지 않았다. 가장 최근의 실제 측정치는 이 D6 병합 이전(사전 조사 단계, 커밋 `d63d821`)에 얻어진 것이며 — `lib/diagnosis/`, `components/result/`, `app/result/` 아래 코드는 D6 병합에서 변경되지 않았으므로(D6은 `.moai/project/product.md`/`README.md`/`design/MIGRATION-PLAN.md`만 변경) 이 수치가 여전히 유효할 가능성이 높으나, **이것은 `b0ba9a1`에 대한 직접 재측정이 아니라 이전 커밋에서의 carry-over 수치이므로 Claim이 아닌 Gap으로 명시한다**(참고용 수치: Statements 96.98% / Branches 85.03% / Functions 91.3% / Lines 96.91%, 모두 ≥85%, Branches가 1.56pp 여유로 가장 타이트).
- **Residual-risk**: 커버리지 Gap은 CI(Linux 환경으로 추정)에서 재측정 시 해소될 가능성이 높으나, 이 워크트리 세션에서는 독립적으로 확인되지 않은 채 남아 있다. `pnpm format:check`의 3개 무관 파일 실패는 이 SPEC 범위 밖이며 이번 작업으로 새로 발생하지 않았음을 확인했으나, 별도로 정리되지 않는 한 계속 실패로 남는다.

### 후속 수정 — D6(main 동기화 + PR 갱신) (2026-09-23)

- **Claim**: 이 SPEC의 격리 워크트리 내에서 manager-git 위임을 통해 `origin/main`(커밋 `ad4e2de`)을 `plan/SPEC-B2C-RESULT-001` 브랜치에 병합했다 — Main-Checkout Branch Guard 원칙에 따라 primary checkout의 브랜치 상태는 전혀 건드리지 않았다. 병합 커밋 `b0ba9a1`. `.moai/project/product.md`에서만 2개 블록이 충돌했다: ① "최종 수정" 헤더 노트, ② §Roadmap A 섹션 — 양쪽 내용을 보존하는 방식으로 해결했다(이 브랜치의 SPEC-B2C-RESULT-001 구현 완료 서사를 주 스레드로 유지하고, origin/main의 SPEC-B2C-DIAGNOSIS-001 문서 동기화 내용을 "이후 main에 별도로 반영된 내용"으로 뒤에 추가; §Roadmap A는 HEAD의 더 최신인 "① + ② 모두 구현 완료" 상태를 origin/main의 stale한 "② plan-phase 진입" 상태보다 우선했다). `README.md`/`design/MIGRATION-PLAN.md`는 충돌 없이 자동 병합됐다. PR #19의 제목/본문을 실제 범위(plan+run-phase 결합, 프로세스 결함을 투명하게 공개, 사용자 승인 debt 2건을 원문 그대로 명시)에 맞춰 갱신했다.
- **Evidence**: `gh pr view 19`(gh 전체 경로 `"/c/Program Files/GitHub CLI/gh.exe"`) → `state: OPEN`, `mergeable: MERGEABLE`, `mergeStateStatus: CLEAN` — 아직 병합되지 않았음을 확인. `git log`/`git show --stat b0ba9a1`로 병합 커밋과 충돌 해결 diff를 직접 확인했다.
- **Baseline-attribution**: 커밋 `b0ba9a1`(plan/SPEC-B2C-RESULT-001, 이 워크트리 HEAD), `gh pr view 19` 및 `git log`/`git show`는 orchestrator가 이 세션에서 직접 재실행해 확인했다.
- **Gaps**: 없음 — 이 항목에 대해 별도로 남은 미검증 사항은 확인되지 않았다.
- **Residual-risk**: PR #19는 사용자의 명시적 지시에 따라 OPEN 상태로 유지되며 병합하지 않는다. 병합 전까지 이 브랜치와 `origin/main`이 다시 벌어질 가능성은 향후 세션에서 지속적으로 모니터링이 필요한 잔여 위험이다.

## §E.4 Sync-phase Audit-Ready Signal

_<pending sync-phase>_

## §F Phase 4 Mode Selection

- **Input parameters**: tier=L, scope≈20+ new files across `lib/diagnosis/`·`app/result/`·`components/result/`·`e2e/` + 3 minimal-touch existing files, domain count=1(frontend UI, no cross-domain fan-out), concurrency benefit=LOW(coding-heavy, milestones are sequentially dependent — M2 consumes M1's types, M3 consumes M2's flags/handoff, M4 consumes M3's route shell, etc.)
- **Mode evaluation**:
  | Mode | Selected? | Rationale |
  |------|-----------|-----------|
  | direct | No | Non-trivial multi-file, multi-milestone scope |
  | serial | **Selected** | Coding-heavy + strictly sequential milestone dependency chain — each milestone's code imports/consumes the previous milestone's output |
  | fanout | No | Not research-heavy; not multi-domain (single frontend domain) |
  | sweep | No | Not a uniform mechanical transform; semantic new-code work |
  | agent-team / manager-lead | No | Milestones are serially dependent, not independently parallelizable across domains — the manager-lead Tier L threshold (≥3 milestones AND ≥10 files AND cross-domain fan-out) is met on file/milestone count but fails the cross-domain fan-out condition (single frontend domain, sequential chain) |
- **Decision**: serial
- **Justification**: Per Anthropic's coding-task parallelism caveat, coding-heavy work is not well-suited to parallel fan-out. This SPEC's 6 milestones form a strict dependency chain (types → handoff → route shell → components → a11y/tests → e2e), so sequential `manager-develop` (cycle_type=tdd) delegation per milestone, with progress folded into `progress.md` §E.2 between milestones, is the correct mode.
