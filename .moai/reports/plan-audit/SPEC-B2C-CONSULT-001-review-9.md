# SPEC Review Report: SPEC-B2C-CONSULT-001

Iteration: 9 (mechanically-triggered re-audit; plan-artifact hash changed since review-8; the nominal 3-iteration ceiling does not apply, as in review-6/7/8)
Audited tree: HEAD `eb5f3eecee417de974f219138615930538c4f9d6` (2026-09-29 11:04:31 +0900, branch `feat/SPEC-B2C-CONSULT-001`) PLUS uncommitted working-tree changes (`git status --short`: M spec.md, acceptance.md, design.md, consult-submit-bar.tsx/.test.tsx, consult-view.tsx/.test.tsx, consent-policy.ts/.test.ts; `git diff --stat`: 9 files, 328 insertions, 29 deletions)
Verdict: **PASS** (no blocking defect; margin over threshold is thin, see Score note)
Overall Score: 0.857 (Tier L PASS threshold 0.85)

**Reasoning context ignored per M1 Context Isolation.** The caller's description of what was changed was used only to locate files; every claim below was re-derived from `git diff`, direct reads and greps. The caller's remark that review-8's "the code already implements it" was wrong is consistent with what I observed (HEAD had no policy-notice branch; the branch exists only in the uncommitted diff).

**Cross-model limitation.** `mcp__moai__audit_multi` / `codex_audit` / `glm_audit` were not used. Claude-only audit; no second-backend opinion.

## Delta re-derived (`git diff -- .moai/specs/SPEC-B2C-CONSULT-001/ components lib`)

- spec.md: HISTORY row (new bullet after the 2026-09-29 iteration-7 bullet) and REQ-B2CCONSULT-005 second clause reworded ("실제 제출 CTA를 안내 영역으로 대체해 클라이언트에서 제출을 불가능하게 하고 서버도 독립적으로 저장을 거부한다(`design.md` §4, AC-B2CCONSULT-005 추가 시나리오)").
- acceptance.md: AC-B2CCONSULT-005 gains one "추가 시나리오" (Given/When/Then + 회귀 짝 + 서버 독립성), acceptance.md L49-54. AC id set unchanged.
- design.md: §4 new paragraph (L109) specifying prop path, notice, PROVISIONAL copy, UX-only principle; §5 tree line for `consult-submit-bar.tsx` (L154) gets a clause.
- Code: `consult-submit-bar.tsx` (new required prop `isPolicyReady`; `if (!isPolicyReady)` renders `<p role="status" aria-live="polite" data-testid="consult-submit-policy-notice">` instead of the button), `consult-view.tsx` (passes `isPolicyReady` to `ConsultSubmitBar`; `handleSubmit` early-returns when not ready), `lib/consult/consent-policy.ts` (`CONSULT_POLICY_NOT_READY_NOTICE`, literal equals design.md §4 text). Tests added in submit-bar, view, consent-policy test files.

## Must-Pass Results

- [PASS] MP-1 REQ number consistency: `grep -c '^- \*\*REQ-B2CCONSULT-' spec.md` = 25; `grep -c '^\*\*AC-B2CCONSULT-' acceptance.md` = 25. Numbering 001..025 unchanged by the diff (no REQ/AC heading added or removed in the diff). Tier L ceiling (25/25) met.
- [PASS] MP-2 GEARS/EARS compliance, judged on the requirement layer (`spec.md` REQ entries; acceptance.md Given-When-Then entries graded under Group 4). REQ-005 remains a Where-pattern entry: "`ENABLE_CONSULT_FLOW` 환경 변수 … `"true"`가 아닐 때, 시스템은 …" with the second clause chained via "`ENABLE_CONSULT_FLOW=true`이고 `CONSULT_POLICY_READY=false`일 때 시스템은 …". The reword removed the vague "비활성화" (an improvement in precision). No "should/may".
- [PASS] MP-3 frontmatter: `spec.md` L1-16 read: id, title, version "0.1.0", status in-progress, created 2026-09-25, updated 2026-09-29, author, priority P1, phase "v0.19.0 target", module, lifecycle spec-anchored, tags string; optional tier L, related_specs. No rejected aliases. `updated` was NOT bumped beyond 2026-09-29 (same day; acceptable).
- [N/A] MP-4: single-language (TypeScript/Next.js) feature.
- [PASS] MP-5 D7: no new SPEC-ID introduced by the diff (HISTORY bullet references only review files and this SPEC). Review-8 established referenced SPECs are `completed`; not re-executed in full, delta-only (see Gaps).
- [PASS] MP-6 D8: `grep -c syscall spec.md` = 0; diff adds no `syscall`.
- [PASS] MP-7: `grep -n "NEEDS CLARIFICATION" plan.md research.md` → no output (grep exit 1).

## Required checks

### 1. D1' resolved? — YES (with one wording defect)

REQ-005 has two obligations. (a) flag off → stub: AC-005 original scenario (acceptance.md L44-47). (b) flag on + policy not ready → notice instead of submit CTA + server rejects: now AC-005 additional scenario (L49-54). Server half is covered by AC-018 "활성 동의 정책 없음" (acceptance.md L198-201, L231) which the new scenario cites correctly (verified those lines exist).

Implementation vs AC text, observed:
- "제출 CTA(`consult-submit-button`)는 렌더링되지 않고 … 안내 영역(role=status, aria-live=polite)" → `consult-submit-bar.tsx` `if (!isPolicyReady)` branch; tests `consult-view.test.tsx` "isPolicyReady=false면 제출 버튼이 렌더링되지 않고 role=status aria-live=polite 안내 영역이 표시된다" and the submit-bar unit test. Notice text literal-pinned in tests and equals design.md §4 text.
- "채널 선택기·입력 필드·동의 그룹은 그대로 표시" → test "isPolicyReady=false여도 채널 선택기·입력 필드·동의 그룹은 그대로 표시되고 조작할 수 있다" (toggles channel, types in the input, toggles a checkbox).
- "회귀 짝" → both test files carry an `isPolicyReady=true` regression pair.
- "네트워크 요청 0건" → `expect(fetchMock).toHaveBeenCalledTimes(0)` after clicks/Enter events; plus defense-in-depth `handleSubmit` guard (consult-view.tsx L304).
- Fail-closed default: `ConsultView({ isPolicyReady = false })` (consult-view.tsx L160) and a test ("prop을 생략해도 … 안내 영역이 표시된다").
- Consent-group "자세히 보기" gating by `isPolicyReady` (consult-consent-group.tsx L119) matches the design.md §4 parenthetical.

**Vacuous-satisfaction finding (D1 below).** The AC's When and design.md §4 say "그 영역을 클릭하거나 **입력 필드에서 Enter를 눌러 제출을 시도**". `grep -nE "<form" components/consult/*.tsx` (non-test) → no match; the only `onKeyDown|onKeyPress|Enter` hits in non-test source are comments (consult-submit-bar.tsx L14, L28, L59). `consult-form.tsx` inputs have only `onChange`. There is NO Enter-to-submit path in the components in ANY policy state. Consequently the Enter half of the When is vacuous, and the test's dispatched Enter `KeyboardEvent`s (consult-view.test.tsx, "안내 영역 클릭과 입력 필드 Enter는 POST를 발생시키지 않는다") do not discriminate: they would also pass with `isPolicyReady=true`. The discriminating assertions are the absence of `consult-submit-button` and the presence of the notice; the no-POST property still holds structurally (no submit element, guarded handler). Severity: minor, class: optional (over-specified AC text; not a coverage gap of REQ-005).

### 2. New inconsistencies among spec.md / acceptance.md / design.md / plan.md

- spec.md REQ-005 ↔ acceptance.md AC-005 ↔ design.md §4: consistent (notice `role=status`, `aria-live=polite`, provisional copy, server independence, 25/25 unchanged). Cross-refs verified: design.md §4 refers to "§1 D4" (result-footer "준비 중" precedent; §1a D4 exists, and `components/result/result-footer.tsx` L39 has "고객 문의: 준비 중"), "§1 D5" (consent-detail placeholder gating; §1a D5 exists), "§1b … Open Decisions" (exists, design.md L22).
- design.md §5 (L154) vs plan.md L81 item 4: plan.md still describes `consult-submit-bar.tsx` as "(이중 제출 방지, `aria-busy`)". Not contradictory (omits, does not deny), but plan is now stale on this file (D3, optional).
- design.md §5 `lib/consult/` tree (L162-170) lists types/schema/draft/phone/dedupe only; `consent-policy.ts` (added at M4, commit `4883d25`) is not in the tree, and design §4 now says the copy lives in "`lib/consult/` 공용 상수 모듈" without naming it (D2, optional).
- HISTORY: new spec.md bullet is consistent with the acceptance/design/REQ diffs (says AC 25 and REQ 25 unchanged: verified). It says "요구사항 25건 불변" — correct.
- progress.md is unmodified in the working tree; it was NOT updated to record D1'. Not a SPEC-artifact contradiction, listed in Gaps.

### 3. "`lib/consult/` 공용 상수 모듈" vs `lib/consult/consent-policy.ts`

Location is consistent with the design phrase (the constant is in `lib/consult/`, a shared module also used for `CONSENT_POLICY_VERSION`, with a client-safe literal per its header comment). The phrase is loose rather than wrong; and the file is missing from the §5 tree. Judgement: minor naming/documentation drift, non-blocking (D2). No implementation defect: the notice constant is a client-bundle-safe string literal, not read from `process.env`.

### 4. Regression re-confirmation

- REQ 25 / AC 25 (counts above). No `\uXXXX` in artifacts: `grep -nE '\\u[0-9a-fA-F]{4}' *.md` (excluding progress.md) → no output.
- Frontmatter valid (MP-3).
- HISTORY consistent (spec.md new bullet).
- Plan-artifact hash subjects: `spec.md`, `plan.md`, `acceptance.md`, `design.md`, `research.md`, and `tasks.md` (no `tasks.md` exists in the SPEC dir: `ls` shows acceptance, design, plan, progress, research, spec). Content changed in spec.md, acceptance.md, design.md; plan.md and research.md unchanged. The cached PASS hash is therefore invalidated by this delta; a fresh PASS entry must be stored only if the orchestrator accepts this verdict, and the artifacts are currently uncommitted, so the hash will change again on commit if anything else is touched. (I did not compute or write the hash.)
- Read-only verification run:
  `pnpm exec vitest run components/consult app/consult lib/consult > .moai/state/verify/consult-followup/review9-vitest.log 2>&1` → `exit=0`. Verbatim tail (log path `.moai/state/verify/consult-followup/review9-vitest.log`):
  ```
   RUN  v4.1.11 C:/Users/Nexsol/Documents/bosang-radar/.claude/worktrees/consult-followup
  Not implemented: Window's scrollTo() method
   Test Files  17 passed (17)
        Tests  112 passed (112)
     Start at  11:28:48
     Duration  5.66s (transform 2.29s, setup 0ms, import 9.79s, tests 2.43s, environment 29.08s)
  ```
  (A Vite config-loader deprecation warning precedes it; unrelated.)

## Category Scores

| Dimension | Score | Rubric band | Evidence |
|-----------|-------|-------------|----------|
| Clarity | 0.75 | Minor ambiguity in one or two requirements | AC-005/design §4 "Enter" wording describes a nonexistent path (D1); "취지" phrasing at acceptance.md L52; carried: design.md 03-D wording drift (review-8 D4) and REQ-018 bloat |
| Completeness | 1.0 | All sections + frontmatter + Out-of-Scope | Sections/frontmatter unchanged; five `### Out of Scope — <topic>` H3s (verified in review-8 at spec.md L119/125/132/137/142; not re-verified line-by-line here, the diff does not touch them) |
| Testability | 0.75 | One AC not precisely binary-testable | New AC-005 scenario is binary and backed by discriminating tests except the Enter clause (non-discriminating); carried: AC-021 "병렬 처리" scope, AC-025 pinned SHA |
| Traceability | 1.0 | Every REQ has an AC; no orphans | REQ-005 second clause now mapped (acceptance.md L49-54); AC ids all reference existing REQs, 25/25. REQ-024 sub-clauses remain thinly covered (D4, optional; if a stricter reader scored this 0.75 the aggregate would be 0.80 = FAIL, so this score is the knife-edge of the verdict) |

Overall = harmonic mean 4 / (1/0.75 [Clarity] + 1/1.0 [Completeness] + 1/0.75 [Testability] + 1/1.0 [Traceability]) = 4 / (1.333 + 1.000 + 1.333 + 1.000) = 4 / 4.667 = **0.857** >= 0.85 -> PASS.

**Score note (M2 honesty).** The margin is 0.007 and rests on Traceability = 1.0 while REQ-024 sub-clauses (focus trap, Desktop Modal ESC/focus return, `aria-describedby`, `aria-live`) are still absent from AC-024 (`grep -n "aria-describedby\|focus trap\|포커스 트랩" acceptance.md` → no hits; `ESC` hits only L347 for the Mobile Bottom Sheet). Review-8 knowingly classified this as an optional refinement gap (D2) and computed its sensitivity on the same reading; I keep that reading for consistency. The principal REQ-024 behaviours (720px, error summary/first-error focus, keyboard-only, Bottom Sheet ESC/return) are covered, so I do not treat REQ-024 as uncovered. Per M6 a list of optional findings must not manufacture a FAIL.

## Defects Found

D1. AC-005 additional scenario and design.md §4 cite an Enter-to-submit path that does not exist — acceptance.md:L51, design.md:L109 — the When clause says "그 영역을 클릭하거나 입력 필드에서 Enter를 눌러 제출을 시도하면" and design.md §4 says "어떤 클릭·Enter 입력으로도"; no `<form>` and no key handler exist in `components/consult/*.tsx` (non-test grep above), so Enter never submits in any policy state. The related Enter events in `consult-view.test.tsx` are non-discriminating (they pass identically with `isPolicyReady=true`); the no-POST guarantee actually rests on the absent button + `handleSubmit` guard, which are tested (button absent, notice present, `fetchMock` 0 calls). — Severity: minor — Class: optional — Required fix: drop "또는 입력 필드에서 Enter를 눌러" from acceptance.md L51 and "·Enter" from design.md L109 (or state that the form has no implicit-submit path); optionally drop the Enter dispatches from the test or add a comment that they are guard rails for a future `<form>`.

D2. design.md §5 tree omits `lib/consult/consent-policy.ts`, and §4 refers to it only as "`lib/consult/` 공용 상수 모듈" — design.md:L162-170, L109 — file exists (`git ls-files` → tracked; `4883d25`), holds both `CONSENT_POLICY_VERSION` and the new notice constant. — Severity: minor — Class: optional — Required fix: add `consent-policy.ts [신규] 동의 정책 버전·정책 미준비 안내 문구 상수` to the §5 `lib/consult/` tree and name the file in §4.

D3. plan.md still describes `consult-submit-bar.tsx` as "(이중 제출 방지, `aria-busy`)" — plan.md:L81 (item 4) — omits the new `isPolicyReady` notice branch now in REQ-005/design §5. Not contradictory. — Severity: minor — Class: optional — Required fix: append "`isPolicyReady`가 거짓이면 제출 CTA 대신 안내 영역" to that item (plan.md is a hash subject, so this re-triggers the plan audit hash; weigh against the value).

D4. REQ-024 sub-clauses not named in AC-024 (carried from review-8 D2, unresolved) — spec.md REQ-024, acceptance.md:L332-347 — see Score note. — Severity: minor — Class: optional — Required fix: add one sentence each for Desktop Modal focus trap/ESC/return and `aria-describedby`/`aria-live="polite"` to AC-024.

D5. Env→prop wiring `app/consult/page.tsx` → `<ConsultView isPolicyReady=... />` is not test-covered — `app/consult/page.test.tsx` (read L1-70) asserts only the `ENABLE_CONSULT_FLOW` gate and placeholder; nothing asserts `CONSULT_POLICY_READY` env value reaches the view (e.g. `ENABLE_CONSULT_FLOW=true` + `CONSULT_POLICY_READY=false` shows the notice, `=true` shows the button), and Playwright runs with `CONSULT_POLICY_READY="true"` only (per review-8 `playwright.config.ts` evidence). The AC's Given ("app/consult/page.tsx가 isPolicyReady=false를 … 전달했고") assumes the wiring; page.tsx L27/L42 wiring is a two-line read and correct by inspection. — Severity: minor — Class: optional — Required fix: add two page-level tests (env false → notice; env true → button) or state that the wiring is verified by inspection.

D6. Carried optional items from review-8 unchanged and not re-examined (AC-021 concurrency scope; design.md 03-D wording drift D4; progress.md status block staleness D5; AC-025 pinned SHA / new-entry `skipMetrics` D6) — Severity: minor — Class: optional — Required fix: as in review-8 (unchanged). progress.md was not updated for D1' either (working tree shows it unmodified).

No blocking defects. No must-pass failures.

## Regression Check (prior iteration)

- Review-8 D1' (REQ-005 client-gating clause without AC): **RESOLVED** — acceptance.md L49-54, implemented and tested (evidence above), vitest 112/112.
- Review-8 D2 (REQ-024 sub-clauses): UNRESOLVED, optional, carried as D4.
- Review-8 D3 (AC-021/serialization), D4 (03-D wording), D5 (progress.md status), D6 (AC-025 SHA): UNRESOLVED, optional, carried as D6.
- Review-7 D1-D3: previously confirmed resolved; not re-audited (delta scope), and the diff does not touch those areas.

## Gaps (what I did NOT verify)

- `progress.md` (2584 lines) not read at all this iteration; whether it records D1' or the current status block is unknown.
- `design.md` was read only at the diff hunks plus L10-24 and L158-192; the remaining sections, and `research.md`, `plan.md` (only L44-50, L81 and greps), were not re-read line-by-line. Review-8 covered them at commit `eb5f3ee`.
- MP-5 D7 status of referenced SPECs and Out-of-Scope H3s were not re-executed; they rely on review-8 evidence plus "the diff touches neither".
- No lint/typecheck/prettier/e2e/visual-verify run, only the scoped vitest command. Whether the visual-verify screens for 03 are affected by the notice branch (they use `CONSULT_POLICY_READY` env in Playwright) was not checked; runtime rendering of the notice in a real browser was not observed.
- Hash computation for the plan-audit PASS cache was not performed.
- No cross-model (codex/GLM) second opinion.

## Residual risk

- Verdict margin is 0.007; a reviewer weighting D4 as a Traceability 0.75 would flip this to FAIL. Cheap mitigation: fix D4 (one sentence) and D1 before or with the next artifact touch, though that changes the plan-artifact hash again.
- Notice copy is provisional and legal/ops-unconfirmed (design.md §4 says so, and it points to Open Decisions).
- Changes are uncommitted; the artifacts audited are working-tree state. If the committed state differs, this verdict does not transfer.

## Recommendation

PASS. Proceed with the orchestrator's normal next step; optionally re-delegate to manager-spec for D1 and D4 (one-sentence edits) before commit. If those edits are made, the plan hash changes again and the re-audit can be scoped to D1/D4 only.
