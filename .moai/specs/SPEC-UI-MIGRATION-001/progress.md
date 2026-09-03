# SPEC-UI-MIGRATION-001 — progress.md

## §E.1 Plan-phase Audit-Ready Signal

### Plan-audit report persistence policy (read before citing any `.moai/reports/plan-audit/*.md` path)

Plan-audit report files under `.moai/reports/plan-audit/` are **local-only artifacts by explicit project policy** — `.gitignore` lines 207-211 (section header "Plan Audit Reports (local artifacts)") ignore `.moai/reports/plan-audit/*.md` and track only `.gitkeep`, matching `.claude/rules/moai/workflow/spec-workflow.md` § Report Persistence: "Reports in both streams are local artifacts (gitignored)." A report file existing in the current worktree right now (verifiable via `ls .moai/reports/plan-audit/`) is genuine local evidence, but its presence is **not expected to appear in git history on any remote or any other clone** — this is standard, documented policy, not an oversight. **For a reader without access to this worktree's local filesystem, the inline summary recorded below (verdict, score, iteration, findings, who ran it, when) is the durable, verifiable record — the report file's presence or absence in the repository proves nothing either way.**

### History (prior iterations, recorded honestly per verification-claim-integrity §1)

- **Iteration 1** (commit `b1a3db8`, 2026-09-03): plan-phase artifacts committed. The commit message claims "plan-auditor iteration-2 PASS(score 0.86)". **This claim is unattributed** — `.moai/reports/plan-audit/` contains no `SPEC-UI-MIGRATION-001-review-*.md` file (verified via `ls` and `git log --all --grep="UI-MIGRATION"`, both empty). No plan-auditor invocation evidence (command + observed output) exists for this SPEC. Per `verification-claim-integrity.md` §1.1 surface 2 and §2 (Baseline-Integrity Attribution), this is a claim without a baseline and MUST NOT be treated as a valid prior audit result.
- **External independent review, round 1** (2026-09-03, pre-run): identified 8 defect categories, the most significant being a factual baseline error in research.md/design.md/spec.md §7 — `app/cases/[caseId]/error.tsx` was described as already containing a 404/case-not-found variant with `"CASE-2024-0999" · "ERR_CASE_NOT_FOUND"` metadata; direct re-inspection of the file (and a `**/not-found.tsx` glob across `app/`) confirmed this was never true. All 5 revisable documents (spec/plan/acceptance/design/research; progress excluded) were revised in response — see each file's HISTORY/revision-note entry for the itemized changes.
- **Iteration 1, post-round-1-revision PASS — ⚠️ SUPERSEDED BY THE ROUND-2 REVISION BELOW, DO NOT CITE AS CURRENT**: plan-auditor (subagent, invoked by the orchestrator) re-ran on 2026-09-03 against the round-1-revised artifact set. Verdict **PASS**, overall score **0.97** (Tier L threshold: 0.85). Report (local-only, per the persistence policy above): `.moai/reports/plan-audit/SPEC-UI-MIGRATION-001-review-1.md`. The auditor independently re-verified every factual claim in the round-1 revision directly against the codebase (error.tsx content, absence of not-found.tsx files, get-case-for-owner.ts pattern, SPEC-PILOT-VISUAL-001's completed status, next.config.ts/session.ts/client.ts for the username-strategy residual, login-form.tsx, lib/pipeline/types.ts, db/schema.ts, case-shell-nav.tsx) — all confirmed accurate. 2 non-blocking optional findings: D1 (REQ-003/REQ-005 embed specific function/file names rather than staying purely behavioral — informational, not required to fix) and D2 (`plan.md:111`'s §F heading contains a negated `[NEEDS CLARIFICATION]` substring that could trip a naive future mechanical grep — informational, not required to fix). **This PASS was measured against the round-1-revised document set. It does NOT cover the round-2 revision below and MUST NOT be cited as the current plan-audit result** (per `verification-claim-integrity.md` §2 — baseline-integrity attribution never carries forward across a changed artifact set).

### External independent review, round 2 (2026-09-03) — this revision

A second external independent review found **2 BLOCKER issues** and **1 MAJOR issue**, plus a mobile-drawer focus-trap accessibility gap. All 6 documents (spec/plan/acceptance/design/research/progress) were revised in response:

- **BLOCKER 1 — `/cases/new` static-generation requirement directly contradicted REQ-013's DB-backed recent-research query.** The prior AC-005a required `/cases/new` to remain statically generated, while REQ-013 required an owner-scoped DB query that needs an authenticated `ownerUserId` — a build-time-only query cannot authenticate anyone. Resolved: the sidebar-username decision (REQ-005, client component) is unchanged; the recent-research query's `ownerUserId` is now sourced from `/cases/new`'s own server page component (`NewCasePage`) performing its own `getCurrentSession()` check (the same pattern already used by `app/cases/[caseId]/page.tsx`) — no new API route. `/cases/new` becoming dynamically rendered is accepted as the intended consequence; AC-005a/REQ-005a's "must stay static" requirement is retired and replaced by build-safety requirements. The exact Next.js 16.3.2 mechanism (`dynamic: "auto"` route segment config default, under the "previous"/non-Cache-Components model this project uses) is documented in `research.md` §5c (new).
- **BLOCKER 2 — this section's own PASS 0.97 evidence citation.** Resolved by this restructuring: the persistence-policy note above, and moving the round-1 PASS into History marked superseded, as itemized above.
- **MAJOR — vague "3 screens each get a dynamic title" Topbar mapping.** Replaced with an exact route-keyed table (`spec.md` REQ-006, `acceptance.md` AC-006a, `design.md` §4) and an explicit statement that `#expert-feedback` is an in-page anchor on `/cases/[caseId]`, not a separate screen/title.
- **Mobile drawer focus-trap gap.** Added Tab/Shift+Tab closed-loop + background-`inert` requirements to REQ-017, with new sub-criteria AC-017i~AC-017l (existing AC-017a~h preserved unchanged) and explicit implementation-responsibility assignment in `plan.md` M8/§B decision 7.

### Plan-auditor re-audit, round 2 (2026-09-03)

plan-auditor (subagent, invoked by the orchestrator) re-ran against the round-2-revised artifact set (the six documents listed above, as revised in this same commit). Verdict **PASS**, overall score **0.94** (Tier L threshold: 0.85). Report (local-only, per the persistence policy stated at the top of this file — not committed to git, not expected to be present in any other clone): `.moai/reports/plan-audit/SPEC-UI-MIGRATION-001-review-2.md`. All 6 requested verification points were independently confirmed directly against the codebase: BLOCKER 1 (the static-generation/REQ-013 DB-query conflict resolution via `NewCasePage`'s own `getCurrentSession()` call), BLOCKER 2 (this section's own audit-evidence citation — resolved by the persistence-policy restructuring above), MAJOR (the Topbar route-keyed title-mapping table), the mobile-drawer focus-trap AC-017i~l additions, cross-document consistency across all six files, and preservation of the round-1-revision decisions. 2 non-blocking informational findings carried forward from the round-1 audit (D1: REQ-003/REQ-005 naming specific function/file names; D2: a negated `[NEEDS CLARIFICATION]` substring in a `plan.md` heading) — no new defects found in this pass.

### Current status (post-round-2-revision, post-re-audit)

- `plan_status: audit-ready`
- `plan_complete_at: 2026-09-03`
- Implementation Kickoff Approval / `/moai run SPEC-UI-MIGRATION-001` is unblocked by this plan-phase artifact: the round-2-revised document set now carries a fresh plan-auditor PASS (0.94) with no unresolved BLOCKER/MAJOR findings. This does NOT mean run-phase has started — the orchestrator's own Implementation Kickoff Approval gate (a separate human-approval step) has not yet been requested or granted as of this entry.

## §E.2 Run-phase Evidence

_<pending run-phase>_

## §E.3 Run-phase Audit-Ready Signal

_<pending run-phase>_

## §E.4 Sync-phase Audit-Ready Signal

_<pending sync-phase>_
