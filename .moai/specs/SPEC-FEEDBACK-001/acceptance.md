# SPEC-FEEDBACK-001 — Acceptance Criteria

Given-When-Then scenarios, grouped by deliverable. Each criterion is binary-testable (PASS/FAIL against an observable command output, DB row, or rendered element) per the verification-layer contract — GEARS requirement wording lives in `spec.md` §2; this file never restates a requirement as a scenario.

## AC Group 1 — Data Model & Migration (REQ-FEEDBACK-001)

**AC-FEEDBACK-001**
- Given `lib/db/schema.ts` after this SPEC's M1 edit
- When the `feedback` table definition is inspected
- Then it has exactly the columns `id`, `caseId`, `reportId`, `userId`, `payload`, `createdAt`, with `reportId` referencing `reports.id` with `onDelete: "cascade"`, and no `content` column exists.

**AC-FEEDBACK-002**
- Given a freshly generated migration from `pnpm db:generate` and a clean SQLite file
- When `pnpm db:migrate` (or the equivalent `runMigrations()` in-process call) runs against it
- Then it exits 0, and `scripts/db-migrate.test.ts`'s existing `EXPECTED_TABLES` assertion (9 tables, unchanged list) still passes without modification to that test's `EXPECTED_TABLES` constant.
- And (legacy-data migration safety, REQ-FEEDBACK-001) given instead a SQLite file into which a fixture has pre-loaded at least one legacy-shape `feedback` row (the OLD 5-column shape: `id`/`caseId`/`userId`/`content`/`createdAt`, no `reportId`/`payload`) alongside representative rows in `cases`, `reports`, and `user`, when the same migration runs against it, then (a) the migration process exits 0, (b) a `SELECT COUNT(*) FROM feedback` afterward returns `0` (the legacy row was intentionally discarded, not silently retained in an invalid shape), and (c) a representative row from each of `cases`, `reports`, and `user` still exists unchanged (unrelated tables/rows are preserved).

## AC Group 2 — Payload Static Validation (REQ-FEEDBACK-003~008)

**AC-FEEDBACK-003**
- Given a full valid payload object matching every field in `ReportFeedbackPayload` (all four PII-free fields populated with ordinary Korean sentences, one `missedIssues` entry, one `claimAssessments` entry, one `evidenceAssessments` entry, and an `outcome` object whose `confirmedAt` is a real ISO date string, e.g. `"2026-09-01"`)
- When `reportFeedbackPayloadSchema.safeParse(payload)` runs
- Then `result.success === true`.
- And (ISO date validation, REQ-FEEDBACK-007) given instead the same payload with `outcome.confirmedAt` set to `"abc"`, when `reportFeedbackPayloadSchema.safeParse(payload)` runs, then `result.success === false` and an issue path includes `outcome`.
- And (ISO date validation, REQ-FEEDBACK-007) given instead the same payload with `outcome.confirmedAt` set to `"2026-99-99"` (a formally-shaped but calendrically-invalid date), when `reportFeedbackPayloadSchema.safeParse(payload)` runs, then `result.success === false` and an issue path includes `outcome`.

**AC-FEEDBACK-004**
- Given a minimal payload object containing only `{ overallRating: "ACCURATE" }`
- When `reportFeedbackPayloadSchema.safeParse(payload)` runs
- Then `result.success === true` and `result.data.missedIssues`, `result.data.claimAssessments`, `result.data.evidenceAssessments` are each `[]`.

**AC-FEEDBACK-005**
- Given a payload whose `overallComment` field contains a resident-registration-number-shaped string (matching `\d{6}-?\d{7}`)
- When `reportFeedbackPayloadSchema.safeParse(payload)` runs
- Then `result.success === false` and an issue path includes `overallComment`.

**AC-FEEDBACK-006**
- Given a payload whose `claimAssessments[0].correctedReasoning` field contains a phone-number-shaped string (matching `01[016789]-?\d{3,4}-?\d{4}`)
- When `reportFeedbackPayloadSchema.safeParse(payload)` runs
- Then `result.success === false` and an issue path includes `claimAssessments`.
- And (duplicate `claimIndex` rejection, REQ-FEEDBACK-005) given instead a payload with `claimAssessments: [{ claimIndex: 0, verdict: "CORRECT" }, { claimIndex: 0, verdict: "INCORRECT" }]` (the same `claimIndex` twice), when `reportFeedbackPayloadSchema.safeParse(payload)` runs, then `result.success === false`.
- And (duplicate `evidenceId` rejection, REQ-FEEDBACK-006) given instead a payload with `evidenceAssessments: [{ evidenceId: "ev-1", verdict: "USEFUL" }, { evidenceId: "ev-1", verdict: "WEAK" }]` (the same `evidenceId` twice), when `reportFeedbackPayloadSchema.safeParse(payload)` runs, then `result.success === false`.

**AC-FEEDBACK-007**
- Given a payload whose `missedIssues[0].issueType` is the literal string `"UNRELATED_TYPE"` (not one of the 8 `QUERY_ISSUE_TYPES` values)
- When `reportFeedbackPayloadSchema.safeParse(payload)` runs
- Then `result.success === false`.

**AC-FEEDBACK-008**
- Given a payload carrying an extra top-level key `caseId: "spoofed-case-id"` alongside a valid `overallRating`
- When `reportFeedbackPayloadSchema.safeParse(payload)` runs
- Then `result.success === false` (rejected by `.strict()`).

## AC Group 3 — Write-Path (Ownership + Dynamic Validation) (REQ-FEEDBACK-002, REQ-FEEDBACK-009~013)

**AC-FEEDBACK-009**
- Given a `reportId` whose owning case has `ownerUserId = "user-A"`
- When `submitReportFeedback(reportId, "user-B", validPayload)` is called
- Then the result is `{ success: false, fieldErrors: {...} }`, and no row is inserted into `feedback`.

**AC-FEEDBACK-010**
- Given a `reportId` whose owning case has `ownerUserId = "user-A"` and `id = "case-A"`, and a valid payload
- When `submitReportFeedback(reportId, "user-A", validPayload)` is called
- Then the inserted `feedback` row's `caseId` equals `"case-A"` — the exact value read from the DB join, not any value the caller could have supplied (the function signature has no `caseId` parameter to supply one through) — AND the returned result equals `{ success: true, feedbackId: <id>, caseId: "case-A" }`, i.e. the success result's `caseId` field carries the same server-derived value, never a client-supplied one.
- And (multi-report determinism, REQ-FEEDBACK-009) given instead that `case-A` has two reports — an older `report-1` created at `T1` and a newer `report-2` created at `T2 > T1` — `getCaseForOwner("case-A", "user-A")` returns `report-2` as the displayed/selected report (ordered by `createdAt DESC`, `id DESC` tie-break on equal timestamps), and a feedback submission using that returned `reportId` inserts a row whose `reportId` equals `report-2`'s id — the displayed report and the submitted `reportId` are guaranteed to originate from the same queried row (no display/submission divergence).

**AC-FEEDBACK-011**
- Given a stored report whose `content.verifiedClaims` array has length 2, and a payload with `claimAssessments: [{ claimIndex: 5, verdict: "CORRECT" }]`
- When `submitReportFeedback(reportId, ownerUserId, payload)` is called
- Then the result is `{ success: false, fieldErrors: {...} }`, and no row is inserted.

**AC-FEEDBACK-012**
- Given a payload with `evidenceAssessments: [{ evidenceId: "does-not-exist", verdict: "USEFUL" }]` where no `evidence` row has that `id`
- When `submitReportFeedback(reportId, ownerUserId, payload)` is called
- Then the result is `{ success: false, fieldErrors: {...} }`, and no row is inserted.
- And (existence-only permissiveness — positive path, REQ-FEEDBACK-012) given instead an `evidenceId` that DOES exist as a real row in the `evidence` table but is NOT cited by any claim in the current report's `supportingEvidenceIds`/`counterEvidenceIds` (i.e., not part of the set the UI would render a verdict control for per REQ-FEEDBACK-014), when `submitReportFeedback(reportId, ownerUserId, payload)` is called with `evidenceAssessments: [{ evidenceId: <that-existing-uncited-id>, verdict: "USEFUL" }]`, then the result is `{ success: true, feedbackId: <id>, caseId: <id> }` and exactly one row is inserted — this locks in the existence-only validation policy at the write-path/validation layer as distinct from the UI's cited-only rendering scope; a user cannot reach this uncited-but-existing case through the rendered form alone, but the write-path function itself (e.g. called directly in a test, or by a future API consumer) must not reject it.

**AC-FEEDBACK-013**
- Given a valid `reportId`, a valid `ownerUserId`, and a valid payload
- When `submitReportFeedback(reportId, ownerUserId, payload)` is called twice in succession with the same three arguments
- Then both calls return `{ success: true, feedbackId: <distinct id> }`, and two distinct rows exist in `feedback` for that `(reportId, userId)` pair (append-only, no unique-constraint rejection)
- And (REQ-FEEDBACK-002, negative half) `lib/feedback/submit-feedback.ts` exports no function whose name or behavior updates or deletes an existing `feedback` row, `app/cases/[caseId]/actions.ts` exports no `"use server"` action that updates or deletes a `feedback` row, and no `app/api/**/route.ts` handler exposes an update or delete capability for `feedback` rows — verified by inspecting the exported symbols of `lib/feedback/submit-feedback.ts` and `app/cases/[caseId]/actions.ts`, and by confirming no route handler under `app/api/` references the `feedback` table with an `update`/`delete`/`set` Drizzle call.

## AC Group 4 — UI (REQ-FEEDBACK-014, REQ-FEEDBACK-015)

**AC-FEEDBACK-014**
- Given a case-detail page render (`app/cases/[caseId]/page.tsx`) for a case with a report whose `verifiedClaims.length >= 1` and whose claims cite at least one `evidence` ID
- When the page is rendered
- Then the count of elements with `data-testid="feedback-claim-verdict"` exactly equals `verifiedClaims.length`, the count of elements with `data-testid="feedback-evidence-verdict"` exactly equals the number of distinct evidence IDs cited across the report's claims, and elements with `data-testid` values `feedback-overall-rating`, `feedback-missed-issue-add`, `feedback-outcome-description`, `feedback-outcome-confirmed-at`, and `feedback-submit` are all present, AND no element with `data-testid="feedback-content"` (the old free-text field) exists.
- And (zero-claim/zero-evidence normal state, REQ-FEEDBACK-014) given instead a case-detail page render for a report whose `verifiedClaims.length === 0` and whose cited-evidence-ID set is empty, when the page is rendered, then exactly zero `feedback-claim-verdict` elements and exactly zero `feedback-evidence-verdict` elements are rendered, and this is asserted as a PASSing, valid empty state — not an error condition — while `feedback-overall-rating` and `feedback-submit` are still present.
- And (PII notice, REQ-FEEDBACK-008 / REQ-FEEDBACK-014) an element containing the plain-language privacy notice — "비식별 요약만 입력하세요. 실명, 상세 주소, 주민등록번호, 전화번호, 의료·보험 원본 문서 내용은 입력하지 마세요." or an equivalent Korean rendering — is present and visible on the feedback form.

**AC-FEEDBACK-015**
- Given a rendered case-detail page with the structured feedback form
- When a user selects an overall rating, toggles one claim's verdict, and submits
- Then a new `feedback` row is inserted whose `payload` (parsed as JSON) contains the selected `overallRating` and the toggled claim's `claimIndex`/`verdict` in its `claimAssessments` array.

## AC Group 5 — Tests (Deliverable 5)

**AC-FEEDBACK-016**
- Given the completed implementation (M1-M4) and a running test database
- When `pnpm test` (covering `lib/feedback/schema.test.ts`, `lib/feedback/submit-feedback.test.ts`, and the updated `app/cases/[caseId]/actions.test.ts`) AND `pnpm test:e2e` (covering the updated `e2e/case-flow.spec.ts`) both run
- Then both exit 0; the unit-test files exercise at minimum one PII-rejection case, one out-of-bounds-`claimIndex`-rejection case, and one non-existent-`evidenceId`-rejection case (per AC Groups 2-3 above); the e2e structured-feedback-submission scenario passes; and `e2e/tenant-isolation.spec.ts` continues to pass unmodified (it does not reference `feedback` and is unaffected by this SPEC).

## Definition of Done

- All 16 acceptance criteria above PASS with cited command output or DB-row evidence (per `verification-claim-integrity.md` — no unobserved-verification claims).
- `pnpm lint`, `pnpm format:check`, and `tsc --noEmit` (or `pnpm build`) all exit 0 with no new warnings attributable to this SPEC's files.
- No file outside the plan.md §B milestone list and §E PRESERVE-exempt scope is modified.
