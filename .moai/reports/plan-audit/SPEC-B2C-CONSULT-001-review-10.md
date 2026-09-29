# SPEC Review Report: SPEC-B2C-CONSULT-001

Iteration: 10 (mechanically-triggered re-audit; plan-artifact hash changed since review-9; the nominal 3-iteration ceiling does not apply, as in review-6..9)
Audited tree: HEAD `f6106a2` (branch `feat/SPEC-B2C-CONSULT-001`) PLUS uncommitted working-tree changes (`git status --short`: M spec.md, acceptance.md, design.md, plan.md, consult-submit-bar.tsx, consult-view.tsx, consult-view.test.tsx; `git diff --stat`: 7 files, 203 insertions, 33 deletions)
Verdict: **PASS** (no blocking defect; margin over threshold is unchanged and thin, see Score note)
Overall Score: 0.857 (Tier L PASS threshold 0.85)

**Reasoning context ignored per M1 Context Isolation.** The caller's description was used only to locate files; every claim below was re-derived from `git diff`, direct reads and greps.

**Cross-model limitation.** `mcp__moai__audit_multi` / `codex_audit` / `glm_audit` were not used. Claude-only audit; no second-backend opinion.

## Delta re-derived (`git diff`)

- spec.md: HISTORY bullet (iteration 9 follow-up, 3 items); REQ-B2CCONSULT-006 gains an exception (isPolicyReady false => no draft write by any path; existing draft neither updated nor cleared; form state and draft READ unchanged); REQ-022 gains the prefix "제출이 가능한 정책 준비 상태에서".
- acceptance.md: AC-005 added scenario reworded (no "Enter to submit"; a factual "참고" paragraph added); AC-006 Given made explicit (policy-ready) + 2 added scenarios (no draft write; read unchanged/byte-identical); AC-022 Given scoped to the ready state.
- design.md: section 2.3 bullets (save timing scoped to ready; "정책 미준비 상태 — draft 쓰기 없음" with rationale/known residual); section 4 paragraph reworded and cross-refs 2.3, names `lib/consult/consent-policy.ts`; section 5 tree lists `consent-policy.ts`.
- plan.md L81 (milestone 4): mentions the notice branch of `consult-submit-bar.tsx` and the not-ready draft-write guard of `consult-view.tsx`.
- Code: `consult-view.tsx` `persistDraft` early-returns when `!isPolicyReady` (deps `[isPolicyReady]`); `consult-submit-bar.tsx` comment-only; `consult-view.test.tsx` +152 lines.

## Must-Pass Results

- [PASS] MP-1 REQ number consistency: `grep -c '^- \*\*REQ-B2CCONSULT-' spec.md` = 25; `grep -c '^\*\*AC-B2CCONSULT-' acceptance.md` = 25. Extracted ids: REQ 001..025 and AC 001..025, contiguous, no duplicates (command output "001 002 ... 025" for both). REQ-006's exception is prose inside the existing entry, no new REQ id.
- [PASS] MP-2 GEARS/EARS compliance, judged on the requirement layer (`spec.md` REQ entries only; the Given-When-Then entries in acceptance.md are graded under Group 4, not here). REQ-006 remains a "시스템은 ... 저장하되 ..." entry; its exception reads as a canonical negative ("시스템은 draft를 어떤 경로로도 쓰지 않는다"). No "should/may". It sits under the heading "3.3 ... (Event-driven)" but is stated ubiquitously, unchanged in kind from prior audits. Verbosity noted as D4 (optional).
- [PASS] MP-3 frontmatter (`spec.md` L1-16 read): id, title, version "0.1.0", status in-progress, created 2026-09-25, updated 2026-09-29, author, priority P1, phase, module, lifecycle spec-anchored, tags string; optional tier L, related_specs. No rejected aliases.
- [N/A] MP-4: single-language (TypeScript/Next.js) feature.
- [PASS] MP-5 D7: D7 verb executed. `SPEC-B2C-CONSULT-001 in-progress` (self), `SPEC-B2C-DIAGNOSIS-001 completed`, `SPEC-B2C-RESULT-001 completed`. None retired/superseded/archived; no new SPEC id introduced by the diff.
- [PASS] MP-6 D8: `grep -c syscall spec.md` = 0.
- [PASS] MP-7: `grep -n "NEEDS CLARIFICATION" plan.md research.md` -> no output (exit 1). `tasks.md` does not exist in the SPEC dir (`ls`: acceptance, design, plan, progress, research, spec).

## Required checks

### 1. Prior D1 (inaccurate "Enter to submit") — RESOLVED

- AC-005 added scenario (acceptance.md L49-54) now says "제출 영역(안내 영역 포함)을 클릭·탭하고, 키보드 포커스를 페이지 전체에 걸쳐 이동하며 제출을 시도하면"; design.md section 4 says "제출 영역을 클릭·탭하거나 키보드로 조작해도"; both add an explicit factual note that the 03 form has no `<form>` and no Enter handler.
- Verified against code: `grep -nE "<form|onKeyDown|onKeyPress|onKeyUp|onSubmit=" components/consult/*.tsx` (non-test) -> only a comment line in `consult-submit-bar.tsx:27` and `consult-view.tsx:548` `onSubmit={handleSubmit}` (this is the `ConsultSubmitBar` prop, not a form). The claim "no `<form>`, no Enter submit handler" is TRUE.
- Remaining "Enter" mentions in the artifacts (`grep -n Enter` over spec/acceptance/design/plan): spec.md L23 (HISTORY, explains the fix), spec.md L89 (REQ-015 "동일 클릭·Enter 반복 입력"), acceptance.md L53 (the note), L147 (AC-015 "제출 버튼을 다시 클릭하거나 Enter를 반복 입력"), L362 (AC-024 keyboard-only "Tab/방향키/Space/Enter만으로 ... 제출까지"), design.md L115 (the note) and L412 ("제출은 Enter"). Checked `consult-submit-bar.tsx` L89-92: the submit control is `<Button type="button" data-testid="consult-submit-button" ... onClick={handleClick}>`, a native button, so Enter/Space on the focused button natively dispatches click. REQ-015/AC-015/AC-024/design L412 therefore refer to native activation of a rendered button and are factually accurate. Slight residual ambiguity: "Enter를 반복 입력" (REQ-015/AC-015) could be misread as Enter in a text field; harmless, since no such path exists. Not scored down further.

### 2. Prior D2 and D3 — RESOLVED

- D2: design.md L173 (section 5 tree) now lists `consent-policy.ts [신규] ... CONSENT_POLICY_VERSION ... CONSULT_POLICY_NOT_READY_NOTICE`; design section 4 names `lib/consult/consent-policy.ts`. `ls lib/consult/` shows `consent-policy.ts` and `consent-policy.test.ts` present.
- D3: plan.md L81 item 4 now says `consult-submit-bar.tsx`(이중 제출 방지, `aria-busy`; `isPolicyReady=false`면 제출 버튼 대신 안내 영역 `role="status"`, `design.md` §4) and `consult-view.tsx`(... 정책 미준비 ... draft를 어떤 경로로도 쓰지 않는 쓰기 가드).

### 3. New REQ-006 exception — coherent, one imprecision

Code enumeration of write paths (all verified by grep and full read of `consult-view.tsx` L160-419):
- `grep -rn "writeConsultationDraft" --include=*.ts --include=*.tsx` (non-test): only `consult-view.tsx:253` (inside `persistDraft`) and the definition `lib/consult/draft.ts:19`. `persistDraft` has exactly four callers (mount effect L276, blur L285, channel change L291, marketing change L297), all now behind the `!isPolicyReady` guard. So "어떤 경로로도" is literally true of the code. `clearConsultationDraft()` is called only on success in `handleSubmit`, itself unreachable when not ready (guard L316), matching "neither updated nor cleared".

Cross-statement consistency:
- REQ-022 / AC-022: prefixed to the ready state; their draft-preservation and re-entry restore only make sense where submission is possible. Consistent.
- REQ-025 (draft cleared on success, DiagnosisResult kept): success only occurs when ready; consistent. AC-025's "draft만 정리" scenario is likewise a ready-state event.
- design 2.2 (new-diagnosis clears draft) is stated to remain independent of the policy state (design 2.3 "알려진 잔여"); consistent, and no contradiction with design 4/4.1/8/9.1/10. design 2.3 L71 correctly scopes `idempotencyKey` persistence to the ready state; design L75 states the not-ready key lives only in component state.
- AC-006 original scenario now has an explicit ready-state Given; the two new scenarios are mutually consistent with it and with `design.md` 2.3.

Decision-basis challenge (the docs say no artifact ever reviewed or approved persisting PII when the policy is not ready):
- `grep` of research.md / plan.md for policy-not-ready + draft: no artifact approves it. However `progress.md` L2573 and L2625 record exactly this behavior as an OPEN finding: "정책 미준비 검토 모드에서도 이름·연락처를 입력하고 blur하면 sessionStorage draft에 저장된다(제출은 불가능하지만 PII가 브라우저에 남는다)" and item 16 "(신규, D-NEW-6) ... 제품 판단 필요(미조치) ... 원하면 `CONSULT_POLICY_READY=false`일 때 draft 저장을 끄는 별도 작업이 필요하다". So it was NOT approved (the approval claim is not contradicted), but it WAS noted in a review-type record, so design.md L73's "검토하거나 승인한 기록은 어떤 plan-phase 산출물에도 없었다" is imprecise: strictly true only if progress.md (a run-phase log) is excluded from "plan-phase artifacts". The user decision that closes item 16 is recorded in the spec.md HISTORY (user decision 2026-09-29), which is the correct place. Not a counterexample to the decision; the exception is coherent. Recorded as D1 (optional): progress.md is now stale on this point.

Are the new AC-006 scenarios binary, verifiable, and matched by tests?
- Scenario 1 (no draft key after mount/blur/channel/marketing): binary (`sessionStorage.getItem(key) === null`). Matched by describe "정책 미준비 상태에서는 draft를 쓰지 않는다" tests (a) mount, (b) name/contact blur + values still displayed, (c) channel change + marketing toggle + form state reflected.
- Scenario 2 (existing draft): binary (byte-equality of `sessionStorage` value before/after; form restored). Matched by test (d): seeds a valid draft, mounts with `isPolicyReady={false}`, asserts restored values, edits name + blur + channel click, then `expect(getItem(DRAFT_KEY)).toBe(before)`.
- Discrimination: (a)-(d) would each fail if the guard were removed (mount effect writes; blur/channel/marketing write; (d) `before` would change because name/channel changed). So none is vacuous. The pre-existing ready-state AC-006 tests now pass `isPolicyReady` (per the diff) so the positive scenario is still asserted, and the vitest run is green.
- One caveat, not scored: AC-005's added scenario When clause is imprecise (D2).

### 4. Traceability / regression

- REQ 25, AC 25 (greps above); no `\uXXXX` in artifacts (`grep -nE '\\u[0-9a-fA-F]{4}' spec/plan/acceptance/design/research.md` -> no output, exit 1); frontmatter valid (MP-3).
- HISTORY (spec.md L23) matches the diff item by item: (A) Enter wording -> acceptance.md L49-54 + design 4; (B) REQ-006 exception + AC-006 scenarios + design 2.3/4 + REQ-022/AC-022 scoping; (C) design tree + plan L81. It explicitly disclaims code/commit/test claims ("문서 수정만"), which is consistent with an uncommitted tree that also contains code; no unverified success claim.
- Plan-artifact hash subjects (spec, plan, acceptance, design, research, tasks): spec.md, plan.md, acceptance.md, design.md changed (all four appear in `git status --short`); research.md unchanged; `tasks.md` does not exist. The cached PASS is therefore invalid. I did not compute or write a hash.

### 5. Carried items D4 (AC-024), D5, D6 from review-9

Re-evaluated honestly, scored the same way as review-9:
- Review-9 D4 (AC-024 does not name Desktop-Modal focus trap/ESC/return, `aria-describedby`, `aria-live`): STILL UNRESOLVED. `grep -n "aria-describedby|focus trap|포커스 트랩|ESC|Escape" acceptance.md` -> only L358 (Mobile Bottom Sheet ESC); REQ-024 (spec.md L113) still enumerates focus trap, ESC, `aria-describedby`, `aria-live`. Kept as optional and Traceability held at 1.0 for consistency with review-9 (not silently forgiven: it remains the knife-edge, see Score note).
- Review-9 D5 (env->prop wiring `app/consult/page.tsx` -> `isPolicyReady` not page-tested): not re-examined this iteration (page.tsx and `app/consult/page.test.tsx` are not touched by the diff); UNRESOLVED as far as this delta goes. Optional.
- Review-9 D6 (AC-021 concurrency scope, 03-D wording drift, progress.md status staleness, AC-025 pinned SHA): not re-examined; unresolved, optional. Not silently forgiven and not penalized differently than in review-9.

### 6. Verification run

`pnpm exec vitest run components/consult app/consult lib/consult > .moai/state/verify/consult-followup/review10-vitest.log 2>&1` -> `exit=0`. Verbatim tail (log: `.moai/state/verify/consult-followup/review10-vitest.log`):
```
 RUN  v4.1.11 C:/Users/Nexsol/Documents/bosang-radar/.claude/worktrees/consult-followup

Not implemented: Window's scrollTo() method

 Test Files  17 passed (17)
      Tests  116 passed (116)
   Start at  12:01:59
   Duration  5.48s (transform 2.51s, setup 0ms, import 10.43s, tests 2.39s, environment 27.41s)
```
(112 -> 116 tests, matching the 4 new not-ready draft tests. A Vite config-loader deprecation warning precedes it; unrelated.)

## Category Scores

| Dimension | Score | Rubric band | Evidence |
|-----------|-------|-------------|----------|
| Clarity | 0.75 | Minor ambiguity in one or two requirements | Enter-wording defect (review-9 D1) is fixed, but I do not raise the score: REQ-006 is now a long entry that embeds rationale and cross-references (spec.md L69-ish), AC-005 When "키보드 포커스를 페이지 전체에 걸쳐 이동하며 제출을 시도하면" is imprecise (D2), and the carried review-9 drivers (design 03-D wording drift, REQ-018 bloat) are unchanged |
| Completeness | 1.0 | All sections + frontmatter + Out-of-Scope | Sections/frontmatter intact; five `### Out of Scope — <topic>` H3s at spec.md L121/127/134/139/144 (grep) |
| Testability | 0.75 | One AC not precisely binary-testable | New AC-006 scenarios binary and discriminating (tests a-d); AC-005 added scenario's When is vague though its Then is binary; carried AC-021 concurrency scope and AC-025 pinned SHA unchanged |
| Traceability | 1.0 | Every REQ has an AC; no orphans | REQ-006 exception -> AC-006 two new scenarios -> tests; REQ-022 scoping mirrored in AC-022; 25/25; REQ-024 sub-clauses still thin (review-9 D4), same reading as review-9 |

Overall = harmonic mean 4 / (1/0.75 + 1/1.0 + 1/0.75 + 1/1.0) = 4 / 4.667 = **0.857** >= 0.85 -> PASS.

**Score note (M2 honesty).** Scoring is unchanged from review-9, on purpose. The fixed Enter wording removes one Clarity/Testability irritant but new imprecision (AC-005 When, REQ-006 length) replaces it, so the bands do not move. The margin is 0.007 and still rests on Traceability = 1.0 while AC-024 lacks REQ-024's Desktop-Modal focus-trap/ESC and `aria-describedby`/`aria-live`; a stricter reader scoring Traceability 0.75 would produce 0.80 (FAIL). I keep the review-8/9 reading (principal REQ-024 behaviours are covered; sub-clauses are a refinement gap) and per M6 do not use optional findings to manufacture a FAIL. The D4 fix is one sentence per sub-clause and would remove the knife-edge.

## Defects Found

D1. progress.md is now stale relative to the new REQ-006 exception; design.md L73 wording is imprecise — `.moai/specs/SPEC-B2C-CONSULT-001/progress.md`:L2573, L2625; `design.md`:L73 — progress.md still records "정책 미준비 검토 모드에서도 ... blur하면 sessionStorage draft에 저장된다" and item 16 "제품 판단 필요(미조치) ... 별도 작업이 필요하다", which the diff now contradicts (progress.md is unmodified in the working tree). design.md L73 says no artifact ever "검토하거나 승인한" this; progress.md L2625 is a review-type record of it (unapproved, flagged open), so the sentence is accurate only if progress.md is excluded. — Severity: minor — Class: optional — Required fix: mark progress.md item 16 / L2573 as resolved by the user decision recorded in spec.md HISTORY (2026-09-29) and REQ-006 exception; optionally soften design.md L73 to "승인한 기록은 없었다(progress.md D-NEW-6은 미결 항목으로만 기록)".

D2. AC-005 added scenario When clause is imprecise — `acceptance.md`:L51 — "키보드 포커스를 페이지 전체에 걸쳐 이동하며 제출을 시도하면": focus movement cannot submit in any state, so the trigger is not a real operation; the discriminating checks live in the Then (no `consult-submit-button`, `role="status"` notice, 0 POST) and in the test's structural assertions (no `form`, no submit control in the bar). — Severity: minor — Class: optional — Required fix: reword the When to "제출 영역(안내 영역 포함)을 클릭·탭하거나 폼 전체를 Tab으로 순회하면" and state the observable Then as "제출 컨트롤(`button[type=submit]`, `consult-submit-button`)이 DOM에 없다".

D3. design 2.3 says draft is written "필드 blur 또는 제출 시도 시" but no submit-time write exists in code — `design.md`:L69; `components/consult/consult-view.tsx`:L311-383 (no `persistDraft` call inside `handleSubmit`; only the four callers at L276/285/291/297) — pre-existing, not introduced by this delta; effect is benign (clicking a button blurs the field first, so blur already persists) and REQ-006's exception enumerates only the four real paths correctly. — Severity: minor — Class: optional — Required fix: drop "또는 제출 시도 시" from design.md L69 or add a submit-time write (not recommended; would add a fifth path to the exception).

D4. REQ-006 is over-long and embeds rationale/cross-refs in the requirement layer — `spec.md`:REQ-B2CCONSULT-006 (L69 area) — the exception sentence carries WHY ("제출이 불가능한 상태에서는 draft의 존재 이유 ... 근거도 없기 때문이다") and pointers to design/AC. Behavior is unambiguous; readability only. — Severity: minor — Class: optional — Required fix: keep the normative sentence ("정책 미준비 상태에서 시스템은 draft를 어떤 경로로도 쓰지 않는다 ... 읽기와 폼 화면 상태는 불변") and leave rationale to design.md 2.3.

D5. (carried, review-9 D4) REQ-024 sub-clauses not named in AC-024 — `acceptance.md`:L355-362 vs `spec.md`:L113 — Desktop Modal focus trap/ESC/return, `aria-describedby`, `aria-live` absent. Unresolved. — Severity: minor — Class: optional (knife-edge for the Traceability score, see Score note) — Required fix: one sentence each in AC-024.

D6. (carried, review-9 D5/D6, not re-examined) env->prop wiring `app/consult/page.tsx` not page-tested; AC-021 concurrency scope; design 03-D wording drift; progress.md status-block staleness; AC-025 pinned SHA. — Severity: minor — Class: optional — Required fix: as in review-9 (unchanged).

No blocking defects. No must-pass failures.

## Regression Check (prior iteration)

- Review-9 D1 (Enter wording): **RESOLVED** (acceptance.md L49-54, design L115, code comments; facts verified against components).
- Review-9 D2 (design tree omits consent-policy.ts): **RESOLVED** (design.md L173; section 4 names the file).
- Review-9 D3 (plan L81 stale): **RESOLVED** (plan.md L81).
- Review-9 D4 (AC-024 sub-clauses): UNRESOLVED, optional, carried as D5.
- Review-9 D5/D6: UNRESOLVED, optional, carried as D6 (not re-examined).
- New scope this iteration (REQ-006 exception, AC-006 scenarios, code guard, tests): audited above; no blocking finding.

## Gaps (what I did NOT verify)

- `progress.md` (2600+ lines) was read only at L2573 and L2625 plus greps; other content (status block, whether it records the iteration-9 follow-up) not read.
- `design.md`, `research.md`, `plan.md` read only at diff hunks and greps (design L62-77, L113-116, L170-175, idempotencyKey lines; plan L81); the rest relies on review-8/9 evidence.
- Not re-verified: Out-of-Scope H3 content beyond the heading grep (headings at L121/127/134/139/144); D7 verb was run, but SPEC statuses are only the `status:` line.
- `app/consult/page.tsx` -> `isPolicyReady` wiring and its tests were not read this iteration (review-9 D5).
- No lint/typecheck/prettier/build/e2e (Playwright)/visual-verify run; only the scoped vitest command. Playwright and `scripts/visual-verify.ts` set `CONSULT_POLICY_READY: "true"` (greps: `playwright.config.ts:70`, `scripts/visual-verify.ts:2519`) so draft-dependent e2e flows run in the ready state and should be unaffected, but I did not execute them.
- Runtime rendering of the notice and the not-ready draft behavior in a real browser was not observed (jsdom tests only).
- No plan-audit PASS-cache hash computed or written. No cross-model second opinion.

## Residual risk

- Margin is 0.007; a reviewer weighting D5 as a Traceability 0.75 would flip this to FAIL. Cheapest mitigation: fix D5 (and D2) in one manager-spec pass; that changes the plan-artifact hash again and the re-audit can be scoped to D2/D5.
- Changes are uncommitted; this verdict applies to the working-tree state. If the committed state differs, it does not transfer.
- Accepted residual documented in design.md 2.3: a draft written in the ready state and left in the same tab remains untouched (not updated or cleared) when the policy later flips to not-ready.
- Notice copy remains provisional and legal/ops-unconfirmed.
- Fail-closed default `isPolicyReady = false` in `ConsultView` means any future consumer that forgets the prop silently gets no draft persistence and no submit button (safe direction, but surprising).

## Recommendation

PASS. Proceed with the orchestrator's normal next step. Optionally re-delegate to manager-spec for D5 and D2 (one-sentence edits) and to update progress.md (D1) before commit; any edit to spec/plan/acceptance/design changes the cached-PASS hash, so the confirming re-audit can be scoped to those defects only.
