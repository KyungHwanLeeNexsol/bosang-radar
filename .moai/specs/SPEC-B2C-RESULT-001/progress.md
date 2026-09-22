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

## §E.3 Run-phase Audit-Ready Signal

_<pending run-phase>_

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
