# SPEC-FEEDBACK-001 — Progress

## §E.1 Plan-phase Audit-Ready Signal

- plan_status: audit-ready
- plan_complete_at: 2026-09-01
- tier: M
- artifact_set: spec.md, plan.md, acceptance.md, progress.md (4 files — Tier M = 3 counted artifacts + progress.md per the Tier artifact-count convention)
- req_count: 15 (REQ-FEEDBACK-001..015)
- ac_count: 16 (AC-FEEDBACK-001..016)
- needs_clarification_markers: none
- plan_audit_verdict: **PASS (score 0.97) — final post-commit gate** — the TRUE final canonical state, per `.moai/reports/plan-audit/SPEC-FEEDBACK-001-review-4.md` (2026-09-01, run specifically to re-verify D7 resolution after commit `8a6c348ef2021cdd3fdd41b26d83ff1fb54391d1` landed). `git ls-files`, `git ls-tree -r HEAD`, and `git show --stat HEAD` all confirmed `review-1/2/3.md` are genuinely tracked and reachable at HEAD; spec.md/plan.md/acceptance.md were re-verified byte-identical to what iteration-3 reviewed (no content drift); REQ=15/AC=16 re-confirmed. D2-D6 (iteration 2/3) and D8/D9 (iteration 3) remain optional/non-blocking and were explicitly NOT re-opened per orchestrator instruction.
  - **Full audit trail (all prior verdicts preserved as explicit history, in order):**
    1. **Iteration 1 (2026-09-01)** — PASS (score 0.92), 1 major-but-non-blocking finding (D1) — REQ-FEEDBACK-002's negative half (no update/delete API) had no AC coverage. Fixed in-place (orchestrator re-delegation): AC-FEEDBACK-013 extended with a second `And` clause covering the negative half (static-inspection assertion, no update/delete export exists), and the AC Group 3 heading traceability line updated to include REQ-FEEDBACK-002. AC count held at 16 (ceiling-safe — no new AC added). D2-D5 (auditor's other findings) intentionally left unaddressed per orchestrator decision (optional/discretionary, avoid scope creep on a PASSed SPEC).
    2. **Iteration 2 (2026-09-01)** — PASS, score 0.97, up from 0.92. All 11 external-review coherence fixes (see "External independent review round" below) independently re-verified against actual current file content (not a self-report) and confirmed landed correctly — including an independent check of the real installed `zod@4.4.3` package confirming `z.iso.date()` exists and correctly rejects `"2026-99-99"`. REQ=15/AC=16 re-confirmed unchanged. Full report: `SPEC-FEEDBACK-001-review-2.md`. New finding D6 (REQ-FEEDBACK-009 bundles two behaviors under one ID) plus carried-over D2-D5, all optional/non-blocking.
    3. **Iteration 3 (2026-09-01)** — **FAIL, score 0.90.** Sole defect **D7**: `progress.md`'s audit-report-commit claim ("force-committed alongside this amendment") was FALSE at the time it was written — `git ls-files`, `git log --all --diff-filter=A`, and `git check-ignore -v` confirmed `SPEC-FEEDBACK-001-review-2.md` was never actually committed (still disk-only, still gitignored by `.gitignore` line ~210). This followed the third round of 7 pre-run coherence fixes (see "Third round of pre-run coherence corrections" below), which were applied cleanly with no defects of their own — D7 was purely a progress.md tense/honesty bug, not a spec/plan/acceptance defect. Full report: `SPEC-FEEDBACK-001-review-3.md`.
    4. **Remediation (2026-09-01)** — a one-sentence progress.md wording fix (reworded the false present-tense claim to honest future-tense: "will be force-added... in the upcoming commit"). No spec.md/plan.md/acceptance.md changes. Followed by the actual `git add -f` commit `8a6c348ef2021cdd3fdd41b26d83ff1fb54391d1` that force-added `review-1/2/3.md` and made the claim true.
    5. **Final post-commit gate (2026-09-01)** — **PASS, score 0.97.** D7 confirmed resolved with direct evidence (`git ls-files` / `git ls-tree -r HEAD` / `git show --stat HEAD` all confirm the three report files are genuinely tracked and reachable at HEAD). spec.md/plan.md/acceptance.md re-verified byte-identical to iteration-3's review (no content drift). REQ=15/AC=16 re-confirmed. No new blocking findings; D2-D6 (iteration 2/3) and D8/D9 (iteration 3) remain optional/non-blocking, explicitly not re-opened. Full report: `SPEC-FEEDBACK-001-review-4.md`. **This is the TRUE FINAL canonical state.**

### 2026-09-01 — External independent review round (11 coherence fixes, in-place amendment)

An external independent review of the plan-phase artifacts (spec.md/plan.md/acceptance.md) surfaced findings requiring in-place amendment. **Count note**: the review instruction header stated "12 coherence issues" / "12 fixes", but the delegation prompt enumerated exactly 11 numbered items (1-11) — all 11 were applied; no 12th item was ever specified, and none was fabricated to reconcile the discrepancy (per `verification-claim-integrity.md` — no unobserved claims). All fixes were applied by extending existing REQ-FEEDBACK-NNN / AC-FEEDBACK-NNN text (adding clauses, tightening wording, or adding `And` scenario lines) — **no new REQ or AC IDs were introduced**. Final counts verified by grep: REQ=15 (REQ-FEEDBACK-001..015), AC=16 (AC-FEEDBACK-001..016) — unchanged from the D1 fix baseline.

One-line summary per fix applied:

1. **Legacy-data migration safety** — REQ-FEEDBACK-001 extended (destructive migration must also succeed against a DB with pre-existing legacy-shape rows, not only a clean DB); AC-FEEDBACK-002 extended with a fixture-based legacy-row scenario; plan.md M1 extended with the DROP/CREATE-table technical contingency for the NOT-NULL-population failure mode.
2. **Deterministic report selection** — REQ-FEEDBACK-009 extended (multi-report case → most-recent-by-`createdAt DESC`/`id DESC` selection, single-query display/submission consistency); AC-FEEDBACK-010 extended with a multi-report determinism scenario; plan.md M3's `get-case-for-owner.ts` bullet extended with the `.orderBy()` addition.
3. **`caseId` in the write-path success result** — REQ-FEEDBACK-010 and REQ-FEEDBACK-013 both extended (success shape now `{ success: true, feedbackId, caseId }`, server-derived only); AC-FEEDBACK-010 extended; plan.md M3 extended (`SubmitFeedbackSuccess` interface + `revalidatePath(result.caseId)` wiring, no `caseId` parameter reintroduced).
4. **Payload positive shape completeness** — REQ-FEEDBACK-003 (`overallComment?`) and REQ-FEEDBACK-004 (`missedIssues[].description?`) extended to state their positive shape directly, independent of REQ-FEEDBACK-008's PII-reuse language.
5. **`outcome.confirmedAt` real ISO-date validation** — REQ-FEEDBACK-007 extended (reject `"abc"`/`"2026-99-99"`, accept `YYYY-MM-DD`); AC-FEEDBACK-003 extended with valid/invalid-date `And` clauses; plan.md M2 fixed to cite `z.iso.date()` (Zod 4.4.3, confirmed via `package.json`) instead of `z.string().min(1)`.
6. **Zero-claim/zero-evidence as a normal state** — REQ-FEEDBACK-014 and AC-FEEDBACK-014 rewritten (same IDs) to require exact-count control rendering (`verifiedClaims.length` / distinct cited evidence-ID count, including zero) rather than "at least one".
7. **PII privacy-boundary honesty** — REQ-FEEDBACK-008 extended (documents `piiFreeText` as pattern-only, accepted residual risk; new PII-detection tooling out of scope) and REQ-FEEDBACK-014 extended (visible Korean privacy notice requirement); AC-FEEDBACK-014 extended with a notice-rendering scenario; plan.md M4 extended with the notice element.
8. **Reject duplicate assessments** — REQ-FEEDBACK-005 (`claimIndex` uniqueness) and REQ-FEEDBACK-006 (`evidenceId` uniqueness) extended; AC-FEEDBACK-006 extended with two duplicate-rejection `And` clauses; plan.md M2 extended with the minimal `.superRefine()` mechanism.
9. **Existence-only evidence policy — positive-path lock-in** — REQ-FEEDBACK-012 extended (existing-but-uncited `evidenceId` submissions must succeed, not just non-existent ones must fail); AC-FEEDBACK-012 extended with the positive-path scenario.
10. **Single SSOT for the payload type** — plan.md only (no spec.md REQ change): M1's `lib/feedback/types.ts` hand-written-interface creation step removed; M2's ambiguous reconciliation language resolved definitively to one Zod schema + `z.infer`, no parallel interface file.
11. **Frontmatter `depends_on` fix** — spec.md frontmatter `depends_on:` extended from `[SPEC-RESEARCH-001, SPEC-SCAFFOLD-001]` to `[SPEC-RESEARCH-001, SPEC-SCAFFOLD-001, SPEC-EVIDENCE-001]` (the `QUERY_ISSUE_TYPES` SSOT source, already named in spec.md §4 prose but missing from the machine-checked dependency list).

- amendment_plan_audit_rerun: **PASS**, overall score **0.97** (iteration 2/3), up from 0.92 at iteration 1. All 11 fixes above were independently re-verified against the actual current file content (not a self-report) and confirmed landed correctly — including an independent check of the real installed `zod@4.4.3` package confirming `z.iso.date()` exists and correctly rejects `"2026-99-99"`. REQ=15/AC=16 counts re-confirmed unchanged. No new internal contradictions were introduced by this edit round. Full report: `.moai/reports/plan-audit/SPEC-FEEDBACK-001-review-2.md`. As of this writing, this file — along with `SPEC-FEEDBACK-001-review-1.md` and `SPEC-FEEDBACK-001-review-3.md` (the latter from the final iteration-3/3 re-audit) — exists on disk only and is excluded by `.gitignore` line ~210 (`.moai/reports/plan-audit/*.md`); none of the three is committed or reachable from the branch yet. They **will be** force-added (`git add -f`) and committed together with this progress.md update in the upcoming commit, specifically so these citations become verifiable from the branch. No claim of "already committed" is made here — only that the force-add + commit is planned to happen immediately after this edit.
  - Remaining findings (all explicitly optional/non-blocking, none required for PASS):
    - **D2** (carried over): no negative-path AC for enum/partial-outcome rejection.
    - **D3** (carried over): REQ-012/013 missing "+ Unwanted" compound label.
    - **D4** (carried over): plan.md M3 wording imprecision ("extend the select").
    - **D5** (carried over): Tier-M file-count estimate ("9-10개") undercounts plan.md's actual ~13-14 milestone items (does not change the Tier M verdict).
    - **D6** (new): REQ-FEEDBACK-009 now bundles two distinct behaviors (ownership-rejection + deterministic report selection) under one ID — auditor suggests a future split/relabel but does not require it for PASS.
  - D2-D6 intentionally left unaddressed per orchestrator decision (optional/discretionary, avoid further scope creep on a re-PASSed SPEC), matching the same deferral pattern applied to D2-D5 after the first plan-audit round.

### 2026-09-01 — Third round of pre-run coherence corrections (7 fixes, in-place amendment)

A third round of orchestrator-directed pre-run coherence corrections was applied to the plan-phase artifacts, addressing test-file impact gaps and residual wording issues discovered before run-phase entry. All 7 fixes were applied by extending existing REQ-FEEDBACK-NNN / AC-FEEDBACK-NNN text and plan.md §B milestone content — **no new REQ or AC IDs were introduced**.

One-line summary per fix applied:

1. **`scripts/provision-tester.test.ts` migration-count impact** — plan.md M5 extended with a new bullet (update `toHaveLength(4)` → `toHaveLength(5)`, add a `FEEDBACK_MIGRATION` constant, add a table-scope drift-guard assertion for the `0004_*` migration); acceptance.md Definition of Done file-scope bullet extended to recognize this file (and `get-case-for-owner.test.ts`) as in-scope M5 edits.
2. **`lib/cases/get-case-for-owner.test.ts` mock-chain + determinism-test relocation** — plan.md M5 extended with a new bullet (add `orderBy` to the mocked query-builder chain; relocate the multi-report determinism test scenarios here from `submit-feedback.test.ts`); the `submit-feedback.test.ts` M5 bullet narrowed to state it does NOT re-test report-selection determinism; AC-FEEDBACK-010 checked for file-specific wording (none found — already file-agnostic, no change needed).
3. **progress.md audit-report path + top-level verdict accuracy** — the `plan_audit_verdict` line at the top of §E.1 updated to state the current canonical verdict (PASS 0.97, iteration 2/3) with the original 0.92-round preserved as explicit history; the `review-2.md` path citation corrected to state honestly that it is force-committed alongside this amendment (overriding the normal `.gitignore` exclusion) rather than implying it was always reachable.
4. **Stale `lib/feedback/types.ts` cross-reference** — plan.md §A Key Decisions #1 corrected to name the actual current SSOT (`ReportFeedbackPayload = z.infer<typeof reportFeedbackPayloadSchema>` in `lib/feedback/schema.ts`) instead of the removed hand-written-interface file.
5. **AC-FEEDBACK-013 success-shape completeness** — both success-path assertions extended to require the full `{ success: true, feedbackId, caseId }` shape (not just `{success:true, feedbackId}`), matching the write-path contract fixed in the prior amendment round.
6. **Empty-string-omission / outcome all-or-nothing contract** — REQ-FEEDBACK-003/004/005 extended (empty-string free-text fields normalize to omitted, not `""`); REQ-FEEDBACK-007 extended (an `outcome` with both fields empty is omitted entirely; a partial `outcome` is a validation failure); AC-FEEDBACK-004 extended with an empty-string-`overallComment` scenario and a partial-`outcome`-rejection scenario; plan.md M5's `schema.test.ts` bullet extended with matching test coverage.
7. **Minimal-payload insert-success test + empty-array query-safety contract** — AC-FEEDBACK-013 extended with a minimal-payload (`{ overallRating: "ACCURATE" }` only) insert-success scenario; plan.md M3's write-path step (4) extended with an explicit implementation contract requiring the empty-array existence-check queries to be skipped entirely (no empty `IN ()` clause); plan.md M5's `submit-feedback.test.ts` bullet extended with the matching minimal-payload test.

- third_round_plan_audit_rerun: **completed — full sequence recorded** (this placeholder is now filled honestly; see the top-level `plan_audit_verdict` full audit trail above for the authoritative account). Summary of what actually happened, in order:
  1. **Iteration 3 audit** — the 7 coherence fixes immediately above were applied, then plan-auditor ran iteration 3 against the amended artifacts.
  2. **Iteration 3 result: FAIL, score 0.90.** The sole defect (**D7**) was NOT in spec.md/plan.md/acceptance.md — all 7 fixes above landed correctly. D7 was a progress.md-only defect: the `amendment_plan_audit_rerun` entry's citation of `SPEC-FEEDBACK-001-review-2.md` as "force-committed alongside this amendment" was a false present-tense claim at the moment it was written (the commit had not yet happened).
  3. **Remediation** — a single-sentence progress.md wording fix (this file only; no spec/plan/acceptance touch) reworded the claim to honest future tense.
  4. **The actual commit** — `git add -f` force-added `review-1.md`, `review-2.md`, `review-3.md`, then committed together with the progress.md wording fix, as `8a6c348ef2021cdd3fdd41b26d83ff1fb54391d1`.
  5. **Final post-commit gate** — plan-auditor re-ran specifically to verify D7 was resolved now that the commit had landed. Result: **PASS, score 0.97**, with `git ls-files` / `git ls-tree -r HEAD` / `git show --stat HEAD` cited as direct evidence that the three report files are genuinely tracked at HEAD.
  - REQ=15/AC=16 held constant across every step of this sequence — no REQ/AC IDs were added, removed, or renumbered at any point.

## §E.2 Run-phase Evidence

_<pending run-phase>_

## §E.3 Run-phase Audit-Ready Signal

_<pending run-phase>_

## §E.4 Sync-phase Audit-Ready Signal

_<pending sync-phase>_
