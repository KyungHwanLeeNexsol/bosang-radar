# SPEC-FEEDBACK-001 — Implementation Plan

## §A. Key Decisions (highest change-likelihood — read this first)

Per decision-reversibility ordering, these are the decisions most likely to need revision during review or implementation. Everything else in this plan is comparatively mechanical derivation from these three.

1. **Payload shape** (`ReportFeedbackPayload`, `lib/feedback/types.ts`) — the JSON shape stored in `feedback.payload`. Once real feedback rows exist, changing this shape means a second migration + a data-shape versioning concern. Fixed per spec.md §2.B (REQ-FEEDBACK-003~008).
2. **`feedback` table shape** (`lib/db/schema.ts`) — dropping `content`, adding `reportId` (NOT NULL FK) + `payload` (NOT NULL JSON). This is a destructive schema change (see §D Risk 1 below) and is the one migration this SPEC ships.
3. **UI control shape** (`app/cases/[caseId]/page.tsx` + new Client Component) — a Client Component is required because "add a missed issue" needs client-side list state; a Server Component alone cannot support it without a full-page round-trip per add. This is the one architectural addition (first Client Component in this route so far — everything else in `app/cases/[caseId]/` is currently a Server Component + a `"use server"` action).

Everything below (validation schema, write-path function, ownership check, tests) is a mechanical consequence of these three decisions and is unlikely to need independent re-review once §A is approved.

## §B. Milestones

### M1 — Data model (schema + types)

- Edit `lib/db/schema.ts`: on the `feedback` table, remove `content: text("content").notNull()`; add `reportId: text("report_id").notNull().references(() => reports.id, { onDelete: "cascade" })` and `payload: text("payload", { mode: "json" }).notNull()`.
- Run `pnpm db:generate` to produce the next Drizzle Kit migration (`db/migrations/0004_*.sql` — exact auto-generated name not fixed in advance). Read the generated SQL before committing; SQLite drops/adds a NOT NULL column without a default via Drizzle Kit's table-recreate strategy, which is destructive to existing `feedback` rows (see §D Risk 1 — accepted).
- Create `lib/feedback/types.ts` with the `ReportFeedbackPayload` interface tree (`overallRating`, `overallComment?`, `missedIssues[]`, `claimAssessments[]`, `evidenceAssessments[]`, `outcome?`) per spec.md §2.B.
- Verify (no edit expected) `scripts/db-migrate.test.ts`'s `EXPECTED_TABLES` — the table *name* list (9 tables) is unaffected by a column-only change on an existing table. Confirm this assumption by reading the generated migration SQL (it must not `CREATE TABLE`/`DROP TABLE` any table outside `feedback`'s own recreate).

### M2 — Static validation (Zod)

- Edit `lib/validation/case-input.ts`: add `export` to the `piiFreeText` function so `lib/feedback/schema.ts` can import and reuse it verbatim (no regex re-implementation). This is the only edit to this ANCHOR-adjacent file — the exported regexes and function body are unchanged.
- Create `lib/feedback/schema.ts`:
  - `import { QUERY_ISSUE_TYPES } from "../pipeline/types"` (no `.ts` extension — this file is bundler-resolved, not run via `node <file>.ts` like `db/seed/evidence-seed-schema.ts`).
  - `import { piiFreeText } from "../validation/case-input"`.
  - `reportFeedbackPayloadSchema = z.object({...}).strict()` implementing REQ-FEEDBACK-003~008. Each free-text field call-sites `piiFreeText("<label>")`; each free-text field is otherwise `z.string()` without a `.min(1)` requirement where the field is genuinely optional (e.g., `overallComment`, `correctedReasoning`) — `piiFreeText`'s built-in `.min(1)` only applies where the field itself is present, so wrap optional fields as `piiFreeText(...).optional()`.
  - `missedIssues`, `claimAssessments`, `evidenceAssessments` are `z.array(...).default([])`.
  - `outcome` is `z.object({ description: piiFreeText(...), confirmedAt: z.string().min(1) }).optional()`.
- Export `ReportFeedbackPayload = z.infer<typeof reportFeedbackPayloadSchema>` (reconcile against `lib/feedback/types.ts` — prefer the Zod-inferred type as the canonical runtime type per the `case-input.ts` `CaseInput` precedent; the M1 hand-written interface becomes the pre-implementation design sketch, superseded by the inferred type once M2 lands. Keep `lib/feedback/types.ts` as the doc-facing shape reference only, or delete it in favor of the inferred type if it would otherwise drift — implementer's call, verify no drift at commit time).

### M3 — Write path (ownership + dynamic validation + persistence)

- Edit `lib/cases/get-case-for-owner.ts`: extend `CaseWithReport` with a `reportId: string | null` field, and extend the `reports` select to also project `id: reports.id`. This is a compatible, additive extension to the `@MX:ANCHOR` file — the ownership-gating `and(eq(cases.id, caseId), eq(cases.ownerUserId, ownerUserId))` predicate is unchanged; only the returned shape grows. Needed because `app/cases/[caseId]/page.tsx` currently has no way to reference the report's own `id` (the UI needs `reportId` to submit feedback against).
- Create `lib/feedback/submit-feedback.ts`:
  - `export interface SubmitFeedbackSuccess { success: true; feedbackId: string }`
  - `export interface SubmitFeedbackValidationFailure { success: false; fieldErrors: Record<string, string[]> }`
  - `export type SubmitFeedbackResult = SubmitFeedbackSuccess | SubmitFeedbackValidationFailure`
  - `export async function submitReportFeedback(reportId: string, ownerUserId: string, rawPayload: unknown): Promise<SubmitFeedbackResult>` — signature deliberately excludes `caseId` (REQ-FEEDBACK-010).
  - Steps inside: (1) query `reports` joined/followed by `cases` to resolve `{ caseId, reportOwnerUserId, verifiedClaimsLength }` from `reportId` — a report not found, or found but its case's `ownerUserId !== ownerUserId`, is a REQ-FEEDBACK-009 rejection (return a `fieldErrors: { _form: ["..."] }` shape, not a thrown exception, per REQ-FEEDBACK-013); (2) `reportFeedbackPayloadSchema.safeParse(rawPayload)` — on failure, return `toFieldErrors(parsed.error.issues)` (reuse the exact helper pattern from `lib/cases/create-case.ts`, factored into a small shared util or duplicated — implementer's call given its ~10 LOC size); (3) for each `claimAssessments[].claimIndex`, bounds-check against the report's own `content.verifiedClaims.length` (REQ-FEEDBACK-011); (4) for each distinct `evidenceAssessments[].evidenceId`, query `evidence` table for existence (REQ-FEEDBACK-012) — a single batched `IN (...)` query, not N queries; (5) insert the `feedback` row (`id: randomUUID()`, `caseId` from step 1, `reportId`, `userId: ownerUserId`, `payload: parsed.data`, `createdAt: new Date()`); (6) return `{ success: true, feedbackId }`.
- Edit `app/cases/[caseId]/actions.ts`: replace `submitFeedback(caseId, content)` with a new `"use server"` action, e.g. `submitReportFeedback(reportId: string, rawPayload: unknown)`, that (a) resolves the current session via `getCurrentSession()` (unchanged pattern), (b) calls `lib/feedback/submit-feedback.ts`'s `submitReportFeedback(reportId, session.user.id, rawPayload)`, (c) on success calls `revalidatePath` for the case page. The old free-text `submitFeedback` export is removed (REQ-FEEDBACK-015) — no dual-path.

### M4 — UI

- New Client Component, e.g. `app/cases/[caseId]/feedback-form.tsx` (`"use client"`), receiving as props: `reportId`, `verifiedClaims` (for per-claim verdict rows), `evidenceById` (already computed server-side in `page.tsx`, for per-evidence verdict rows keyed by the evidence IDs actually cited across the report's claims — not every row in the `evidence` table), and the server action reference.
  - Overall rating: a `<select>` (or shadcn/ui `Select`) bound to the three enum values, required.
  - Overall comment: optional `Textarea` (absorbs the old free-text use case).
  - Missed issues: client-state array of `{ issueType, description }` rows with an "add row" button and a remove-row control per row; each row's `issueType` is a `<select>` over `QUERY_ISSUE_TYPES`.
  - Per-claim verdict: one verdict control (radio group or 3-button toggle) rendered next to each existing claim card in `page.tsx`'s `verified-claims` block, plus an optional `correctedReasoning` textarea per claim — index derived from the claim's array position (matches `claimIndex` semantics, consistent with the existing `key={index}` convention).
  - Per-evidence verdict: one verdict control per evidence ID appearing in the report (reuse the existing `evidenceById` map already built in `page.tsx`).
  - Outcome: optional `description` textarea + `confirmedAt` date input, both empty unless the user opts in.
  - Submit assembles the structured object client-side and calls the server action (`useActionState` or a plain `onSubmit` + `FormData`/JSON — implementer's call; a JSON `fetch`-free direct server-action call via a hidden serialized field, or `useActionState`, both satisfy REQ-FEEDBACK-014).
  - `data-testid` convention: `feedback-overall-rating`, `feedback-overall-comment`, `feedback-missed-issue-add`, `feedback-missed-issue-row`, `feedback-claim-verdict` (repeated, one per claim — mirrors the existing `claim-status` pattern), `feedback-evidence-verdict` (repeated), `feedback-outcome-description`, `feedback-outcome-confirmed-at`, `feedback-submit`.
- Edit `app/cases/[caseId]/page.tsx`: replace the existing `feedback-form` Card body (lines ~255-277) with `<FeedbackForm reportId={...} verifiedClaims={report.verifiedClaims} evidenceById={evidenceById} action={submitReportFeedback} />` (rendered only when `report` is non-null — feedback requires a report to exist, per REQ-FEEDBACK-009's `reportId`-keyed design). Retire the old inline `handleFeedbackSubmit` closure and its `feedback-content`/`feedback-submit`/`feedback-form` free-text markup.

### M5 — Tests

- `lib/feedback/schema.test.ts` (Vitest, mirrors `db/seed/evidence-seed-schema.ts` testing style if one exists, or `lib/validation/case-input.ts`'s own test conventions): valid full payload parses; valid minimal payload (only `overallRating`) parses with array defaults `[]`; PII-format text in each of the four free-text fields is rejected; an `issueType` outside the 8 `QUERY_ISSUE_TYPES` values is rejected; an unrecognized top-level key (e.g. a spoofed `caseId`) is rejected by `.strict()`.
- `lib/feedback/submit-feedback.test.ts` (Vitest, mocked DB per `app/cases/[caseId]/actions.test.ts`'s `vi.hoisted` mocking pattern): non-owner submission is rejected with no insert; an out-of-bounds `claimIndex` is rejected with no insert; a non-existent `evidenceId` is rejected with no insert; a valid submission inserts exactly one row with `caseId` derived from the mocked report/case join (never from a param); two valid submissions from the same user against the same report both insert (append-only, no unique-constraint violation).
- Edit `app/cases/[caseId]/actions.test.ts`: remove the three existing `submitFeedback` free-text tests (REQ-FEEDBACK-015 removes the function they test); no new tests needed here if `submitReportFeedback`'s Server Action wrapper is thin enough to be covered by `lib/feedback/submit-feedback.test.ts` plus one thin session-guard test mirroring the existing "로그인되지 않은 상태" case.
- Edit `e2e/case-flow.spec.ts`: replace the `feedback-content`/`feedback-submit` free-text section (lines ~122-135) with a structured submission — select an overall rating, optionally toggle one claim verdict, submit, then assert the persisted `feedback` row's `payload` (parsed JSON) contains the submitted `overallRating` and the `reportId`/`caseId` FK values are correct.
- Verify (no edit expected) `e2e/tenant-isolation.spec.ts` — it seeds `cases` directly and asserts a 404 on cross-tenant access; it does not touch `feedback` at all, so REQ-FEEDBACK-009 (ownership) is exercised at the write-path unit-test level (M5 above), not duplicated here. Confirm this by reading the file (already done in plan-phase research — no `feedback` reference found).

## §C. Technical Approach Summary

- **Separation of concerns** (mirrors `lib/cases/create-case.ts` ↔ `lib/validation/case-input.ts`): static shape/enum/PII-format validation lives in `lib/feedback/schema.ts` (pure, synchronous, no DB access); reference-integrity validation (claimIndex bounds, evidenceId existence) and the ownership check live in `lib/feedback/submit-feedback.ts` (impure, DB-backed) because both require reading the specific report/case/evidence rows at write time — a static Zod schema cannot express "this integer must be less than a DB-fetched array length" or "this string must exist as a row" without a DB round-trip mid-parse, which the codebase's existing schemas (`case-input.ts`, `evidence-seed-schema.ts`) intentionally never do.
- **Response contract**: `SubmitFeedbackResult` mirrors `CreateCaseResult` exactly — a discriminated union with `success: true | false`, never a thrown exception for a validation-class failure (ownership rejection is treated the same way, as a validation-class failure with a `_form` field error, consistent with how `create-case.ts` treats `parsed.error` — not as an HTTP-layer 403 thrown from deep inside the domain function).
- **No caseId trust boundary crossing**: the public write-path signature has no `caseId` parameter at all — this is a stronger guarantee than "validate caseId matches", because there is no argument slot for a caller to populate with a wrong value in the first place.

## §D. Risks

1. **Destructive migration (schema drop of `content`)** — Existing `feedback` rows (from manual testing / the E2E fixture user) will not satisfy the new NOT NULL `reportId`/`payload` columns and Drizzle Kit's SQLite table-recreate strategy will not have data to carry over for those two new columns. Accepted risk: the product is pre-launch (pilot, ~10 testers), the old free-text feedback rows have no product value under the new schema, and REQ-FEEDBACK-001/015 explicitly call for full replacement rather than parallel operation. Mitigation: read the generated migration SQL before committing (M1) to confirm it does not silently corrupt unrelated tables; no explicit data-preservation step is planned.
2. **`getCaseForOwner()` is an `@MX:ANCHOR` file** — the extension in M3 (adding `reportId` to `CaseWithReport`) must be additive-only. Mitigation: the existing `ownerUserId` predicate and `null`-on-not-found contract are unchanged; only reviewed as part of run-phase self-verification that no caller-visible behavior regresses (existing callers destructure by name, so an added field is backward compatible).
3. **`evidenceById` scope for the UI's per-evidence verdict controls** — `page.tsx` currently loads *all* evidence rows into `evidenceById` (not scoped to the report's cited IDs). M4 reuses this map but should render per-evidence verdict controls only for evidence IDs actually cited by the report's claims (via `supportingEvidenceIds`/`counterEvidenceIds`), not the full evidence table — otherwise the UI would present verdict controls for irrelevant evidence the reviewer never saw in context. This is a UI-scoping detail for run-phase, not a schema/validation concern.
4. **Client Component boundary** — this is the first Client Component under `app/cases/[caseId]/`. Ensure `reportId`/`verifiedClaims`/`evidenceById` passed as props are JSON-serializable (they are — plain strings/arrays/objects, no functions or Dates beyond what Next.js serializes across the RSC boundary) and that the server action reference is passed per Next.js Server Actions conventions (a function reference from a `"use server"` file is directly passable as a prop).

## §E. PRESERVE List (files this SPEC MUST NOT modify beyond the stated edit)

- `lib/pipeline/**` — read-only reference (`QUERY_ISSUE_TYPES` import only)
- `lib/ai/**` — untouched
- `db/seed/**` — untouched
- `lib/db/schema.ts` `evidence`, `reports`, `cases`, `user`, `session`, `account`, `verification`, `allowedTesters` tables — untouched (only `feedback` table changes)
- `lib/cases/create-case.ts` — read-only pattern reference, not modified
- `lib/cases/get-case-for-owner.ts` — additive field only (§B M3), the `ownerUserId` gating predicate itself is untouched
