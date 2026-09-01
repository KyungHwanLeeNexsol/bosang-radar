# SPEC-FEEDBACK-001 — Progress

## §E.1 Plan-phase Audit-Ready Signal

- plan_status: audit-ready
- plan_complete_at: 2026-09-01
- tier: M
- artifact_set: spec.md, plan.md, acceptance.md, progress.md (4 files — Tier M = 3 counted artifacts + progress.md per the Tier artifact-count convention)
- req_count: 15 (REQ-FEEDBACK-001..015)
- ac_count: 16 (AC-FEEDBACK-001..016)
- needs_clarification_markers: none
- plan_audit_verdict: PASS (score 0.92), 1 major-but-non-blocking finding (D1) — REQ-FEEDBACK-002's negative half (no update/delete API) had no AC coverage. Fixed in-place (2026-09-01, orchestrator re-delegation): AC-FEEDBACK-013 extended with a second `And` clause covering the negative half (static-inspection assertion, no update/delete export exists), and the AC Group 3 heading traceability line updated to include REQ-FEEDBACK-002. AC count held at 16 (ceiling-safe — no new AC added). D2-D5 (auditor's other findings) intentionally left unaddressed per orchestrator decision (optional/discretionary, avoid scope creep on a PASSed SPEC).

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

- amendment_plan_audit_rerun: **PASS**, overall score **0.97** (iteration 2/3), up from 0.92 at iteration 1. All 11 fixes above were independently re-verified against the actual current file content (not a self-report) and confirmed landed correctly — including an independent check of the real installed `zod@4.4.3` package confirming `z.iso.date()` exists and correctly rejects `"2026-99-99"`. REQ=15/AC=16 counts re-confirmed unchanged. No new internal contradictions were introduced by this edit round. Full report: `.moai/reports/plan-audit/SPEC-FEEDBACK-001-review-2.md`.
  - Remaining findings (all explicitly optional/non-blocking, none required for PASS):
    - **D2** (carried over): no negative-path AC for enum/partial-outcome rejection.
    - **D3** (carried over): REQ-012/013 missing "+ Unwanted" compound label.
    - **D4** (carried over): plan.md M3 wording imprecision ("extend the select").
    - **D5** (carried over): Tier-M file-count estimate ("9-10개") undercounts plan.md's actual ~13-14 milestone items (does not change the Tier M verdict).
    - **D6** (new): REQ-FEEDBACK-009 now bundles two distinct behaviors (ownership-rejection + deterministic report selection) under one ID — auditor suggests a future split/relabel but does not require it for PASS.
  - D2-D6 intentionally left unaddressed per orchestrator decision (optional/discretionary, avoid further scope creep on a re-PASSed SPEC), matching the same deferral pattern applied to D2-D5 after the first plan-audit round.

## §E.2 Run-phase Evidence

_<pending run-phase>_

## §E.3 Run-phase Audit-Ready Signal

_<pending run-phase>_

## §E.4 Sync-phase Audit-Ready Signal

_<pending sync-phase>_
