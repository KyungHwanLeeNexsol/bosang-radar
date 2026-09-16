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

### Plan Audit Verdict (Iteration 3 — FINAL)

verdict: PASS
overall_score: 0.92 (Tier M threshold: 0.80)
audited_at: 2026-09-16
report: .moai/reports/plan-audit/SPEC-CASE-PROGRESS-001-review-3.md

Category scores: Clarity 0.75 (unchanged, carried D4 non-blocking), Completeness 1.0, Testability 1.0, Traceability 1.0.

Must-pass: all 7 criteria PASS/N/A. MP-1 RESOLVED — REQ sequence independently re-verified as 001,002,003,004,005 (no gap, no duplicate); renumber propagation into plan.md/acceptance.md cross-references and the disambiguation markers for the deleted original REQ-CASE-PROGRESS-004 (queued/processing) were independently verified directly against the files, not taken on trust. D5 (iteration 2 MP-1 defect) RESOLVED. D6 (AC-ID gap at 004/005) remains an accepted, documented non-blocking scope decision — no regression.

New finding D7 (DEFECT-TITLE-SCOPE-MISMATCH-001, minor, optional, non-blocking): frontmatter `title:` (spec.md:3) still contains "실제 관측 상태(대기열/진행 중) 반영", the exact feature removed in iteration 1 and now listed under Out of Scope. Recommended cleanup: drop that clause from the title at low cost; does not gate this PASS verdict.

next_step: SPEC is PASS and eligible for Implementation Kickoff Approval (plan→run human gate). D7 title cleanup may be applied opportunistically (e.g., at M1 commit) but is not a blocking prerequisite.

## §E.2 Run-phase Evidence

cycle_type: tdd (RED-GREEN-REFACTOR)

### AC PASS/FAIL Matrix

| AC | Status | Verification Command | Actual Output |
|----|--------|----------------------|----------------|
| AC-CASE-PROGRESS-001 | PASS | `npx vitest run app/cases/new/case-input-form.test.tsx -t "AC-CASE-PROGRESS-001"` | `1 passed` — `case-pending-stages` `<ol>`에 4개 `<li>`가 `ANALYSIS_STAGES` 순서대로 존재, `data-status` 속성 없음 |
| AC-CASE-PROGRESS-002 | PASS | `npx vitest run app/cases/new/case-input-form.test.tsx -t "AC-CASE-PROGRESS-002"` | `1 passed` — footer 내 `role="progressbar"` 없음, `/\d+%/` 매치 없음, `[data-current]` 없음 |
| AC-CASE-PROGRESS-003 | PASS | `npx vitest run app/cases/new/case-input-form.test.tsx -t "AC-CASE-PROGRESS-003"` | `1 passed` — case-input-form 렌더 라벨 배열이 `lib/cases/analysis-stages.ts`의 `ANALYSIS_STAGES`와 순서·내용 일치 |
| AC-CASE-PROGRESS-006 | PASS (기존 회귀 방지) | `npx vitest run app/cases/new/case-input-form.test.tsx -t "202 응답을 받으면"` | `1 passed` — completed/failed 종료 분기 회귀 없음 |
| AC-CASE-PROGRESS-007 | PASS | `npx vitest run app/cases/new/case-input-form.test.tsx -t "AC-CASE-PROGRESS-007"` | `1 passed` — `case-pending-indicator`의 `role="status"`/`aria-live="polite"` 유지, `case-pending-stages`에 `aria-live` 없음, `indicator.contains(stageList) === false` |
| AC-CASE-PROGRESS-008 | PASS | `npx vitest run app/cases/new/analysis-status-panel.test.tsx` | `1 passed` — "대기 중" 배지, 4단계 전부 "대기" 라벨, `analysis-status-static-bar`의 `w-0` 정적 바 렌더링 결과 회귀 없음 |
| AC-CASE-PROGRESS-009 | PASS (기존 회귀 방지) | `npx vitest run app/cases/new/case-input-form.test.tsx -t "AC-001|AC-002"` | `2 passed` — 기존 대기 인디케이터 존재/4필드 disabled 테스트 회귀 없음 |

### RED Evidence (TDD §E8 — GREEN 이전 캡처)

```
$ npx vitest run app/cases/new/case-input-form.test.tsx
...
 FAIL  app/cases/new/case-input-form.test.tsx > ... > AC-CASE-PROGRESS-001: 대기 중에는 4단계 정적 목록이 순서대로 렌더링되고 개별 완료 표시가 없다
AssertionError: expected null not to be null
 ❯ app/cases/new/case-input-form.test.tsx:368:27
    366|
    367|     const stageList = container.querySelector('[data-testid="case-pend…
    368|     expect(stageList).not.toBeNull();

 FAIL  ... AC-CASE-PROGRESS-003 ... TypeError: Cannot read properties of null (reading 'querySelectorAll')
 FAIL  ... AC-CASE-PROGRESS-007 ... TypeError: Cannot read properties of null (reading 'hasAttribute')

 Test Files  1 failed | 1 passed (2)
      Tests  3 failed | 13 passed (16)
```
(RED captured after M1 constant extraction, before M2 footer implementation — `case-pending-stages` testid did not yet exist.)

### Build / Lint / Format / Mechanical checks

```
$ pnpm build → exit 0 (pre-existing edge-runtime warning in instrumentation.ts, unrelated to this SPEC)
$ pnpm lint → exit 0 (no output)
$ pnpm format:check → exit 0, "All matched files use Prettier code style!"
$ grep -rn 'role="progressbar"' app/cases/new/case-input-form.tsx → exit 1 (0 matches, REQ-CASE-PROGRESS-003 기계적 검증 통과)
```

### Full test suite (no regression)

```
$ pnpm test
 Test Files  1 failed | 70 passed (71)
      Tests  18 failed | 474 passed (492)
```
Baseline (pre-flight, before any change): `Test Files 1 failed | 69 passed (70)` / `Tests 18 failed | 469 passed (487)`.
The 18 failing tests are 100% pre-existing (`app/cases/app-shell-chrome.test.tsx` — "No 'useRouter' export is defined on the 'next/navigation' mock", unrelated to this SPEC's scope — same failure count before and after this SPEC's changes). This SPEC added 5 new passing tests (474 − 469 = 5: 4 in case-input-form.test.tsx + 1 in analysis-status-panel.test.tsx) with zero new failures.

### PRESERVE list verification

```
$ git diff --stat -- app/api/cases/status/route.ts lib/cases/job-timing.ts lib/pipeline lib/db/schema.ts db
(no output — 0 files changed)
```

### Files changed

- `lib/cases/analysis-stages.ts` (신규) — 4단계 라벨 공유 상수
- `app/cases/new/analysis-status-panel.tsx` — 지역 상수를 공유 모듈 import로 교체(렌더링 결과 불변)
- `app/cases/new/case-input-form.tsx` — 대기 Footer에 정적 4단계 목록 추가(`case-pending-indicator` 형제 요소, `aria-live` 없음)
- `app/cases/new/case-input-form.test.tsx` — AC-CASE-PROGRESS-001/002/003/007 신규 테스트 추가
- `app/cases/new/analysis-status-panel.test.tsx` (신규) — AC-CASE-PROGRESS-008 회귀 방지 테스트 1건

## §E.3 Run-phase Audit-Ready Signal

run_complete_at: 2026-09-16
run_status: complete
ac_pass_count: 7
ac_fail_count: 0
preserve_list_post_run_count: 0 (변경 없음)
new_warnings_or_lints_introduced: 0

## §E.4 Sync-phase Audit-Ready Signal

- sync_status: sync-complete
- sync_complete_at: 2026-09-16
- sync_commit_sha: pending-backfill-self-referential — 이 §E.4를 기록하는 커밋 자신의 SHA는 커밋이 자기 해시를 알 수 없어 표준 관례상 후속 백필 커밋이 필요함(`spec-frontmatter-schema.md` § SHA placeholder backfill exemption). `git log -1 --format=%H -- .moai/specs/SPEC-CASE-PROGRESS-001`로 확인 가능
- ac_pass_count: 7 (AC-CASE-PROGRESS-001, 002, 003, 006, 007, 008, 009 — §E.2 PASS/FAIL Matrix 참고; AC-CASE-PROGRESS-004/005는 舊 queued/processing 구분 표시 요구사항과 함께 plan-audit iteration 1 D1/D2 결함 반영으로 제거됨, acceptance.md §B 참고)
- ac_fail_count: 0
- status transition: spec.md frontmatter `status: in-progress` → `status: completed`(이 sync 커밋으로 3-phase close 완료); `updated:` 2026-09-16 유지(당일 sync 커밋이라 날짜 변경 불필요)
- changelog: CHANGELOG.md `[Unreleased]` 섹션에 `### Added — SPEC-CASE-PROGRESS-001` 신규 진입 추가(사전 `grep -c 'SPEC-CASE-PROGRESS-001' CHANGELOG.md` 확인 결과 0건 — 중복 없음)
- docs: README.md(§현재 구현 상태, §구현 완료 목록 2곳) + `.moai/project/product.md`(헤더 날짜/요약, §구현 완료 목록) 갱신 — 13→14개 SPEC 완료로 카운트 반영
- mx_tags: `app/cases/new/case-input-form.tsx`에 `@MX:NOTE`(+ `@MX:SPEC: SPEC-CASE-PROGRESS-001`) 1건 추가 — case-pending-stages를 aria-live 서브트리 내부로 옮기면 안 된다는 비자명한 불변조건을 기록(§E.2 결정 2 근거)
- preserve_verification (sync-phase 재확인): `git diff --stat -- app/api/cases/status/route.ts lib/cases/job-timing.ts lib/pipeline lib/db/schema.ts db` → 무출력(0 files changed), run-phase §E.2와 동일 결과 재확인
