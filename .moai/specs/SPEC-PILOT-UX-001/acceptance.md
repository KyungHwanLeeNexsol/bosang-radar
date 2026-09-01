# SPEC-PILOT-UX-001 — Acceptance Criteria

Given-When-Then scenarios, grouped by REQ family. Each criterion is binary-testable (PASS/FAIL against an observable command output, DB row, or rendered element) per the verification-layer contract — GEARS requirement wording lives in `spec.md` §2; this file never restates a requirement as a scenario.

## AC Group A — 사건 입력 대기 상태 (REQ-PILOT-UX-001, REQ-PILOT-UX-002)

**AC-PILOT-UX-001**
- Given the case-input form (`case-input-form.tsx`) rendered with valid field values
- When the user submits the form and the `/api/cases` POST response has not yet resolved
- Then a visible progress indicator (distinct from the button's text-only change) is present in the DOM, and it remains present until the response resolves.

**AC-PILOT-UX-002**
- Given the case-input form in the pending state (submit in flight)
- When any of the four input fields (`incidentDescription`, `diagnosisName`, `disabilityBodyPart`, `incidentDate`) is inspected
- Then each field's `disabled` attribute is `true` — not only the submit button.

## AC Group B — 사건 중복 제출 방지 (REQ-PILOT-UX-003 — merged scope; a since-renumbered adjacent requirement on nonce reuse/regeneration was folded in via an And clause, iteration-2 fix-up)

**AC-PILOT-UX-003**
- Given a valid case-input payload with `submissionNonce = "nonce-A"`
- When `createCase(ownerUserId, rawInput)` is called twice in sequence with the identical `submissionNonce`
- Then the second call does NOT invoke `runPipeline` again (mocked call-count assertion) and returns `{ success: true, caseId }` with the SAME `caseId` as the first call, and exactly one row exists in `cases` for that nonce.

**AC-PILOT-UX-004**
- Given two valid case-input payloads that are otherwise identical but carry `submissionNonce = "nonce-A"` and `submissionNonce = "nonce-B"` respectively
- When `createCase` is called once for each
- Then BOTH calls succeed, `runPipeline` is invoked exactly twice, and two distinct rows exist in `cases` (idempotency scope does not merge two legitimately distinct submissions).

## AC Group C — 리포트 정보 위계 (REQ-PILOT-UX-004, REQ-PILOT-UX-005)

**AC-PILOT-UX-005**
- Given a case detail page (`page.tsx`) rendered for a case with an existing report
- When the DOM is inspected
- Then a summary-banner element appears BEFORE (precedes in document order) the existing "사건 요약" card, and it contains the report's `caseSummary.diagnosisName` and `caseSummary.disabilityBodyPart` text.

**AC-PILOT-UX-006**
- Given a report whose `verifiedClaims` array has 3 entries, 2 with `status: "VERIFIED"` and 1 with `status: "INSUFFICIENT"`
- When the case detail page renders
- Then the summary banner displays an aggregate count reflecting `2`/`3` verified and `1`/`3` insufficient (or equivalent phrasing carrying both numbers), AND the existing per-claim `data-testid="claim-status"` pills (one per claim, 3 total) are still individually present and unchanged in behavior.

## AC Group D — 근거자료 표시 (REQ-PILOT-UX-006, REQ-PILOT-UX-007)

**AC-PILOT-UX-007**
- Given an evidence row in the `evidence` table with `evidenceType = "PRECEDENT"` and `issueTypes = ["DISABILITY_GRADE"]` that is cited by a claim in the rendered report
- When the case detail page renders that claim's supporting-evidence list
- Then the rendered evidence entry includes visible text or markup identifying `evidenceType` (e.g. "PRECEDENT") and `issueTypes` (e.g. "DISABILITY_GRADE") alongside the existing `title`.
- And (parity check, REQ-PILOT-UX-006) given the same evidence row cited in the feedback form's per-evidence verdict list, when the feedback form renders, then the same `evidenceType`/`issueTypes` information is present there too (both surfaces stay in parity — plan.md §D Risk 3).

**AC-PILOT-UX-008**
- Given an evidence row with a non-null `sourceUrl` (e.g. `"https://example.com/case"`)
- When the case detail page renders that evidence's reference
- Then the rendered `sourceUrl` is inside an `<a>` element with `href="https://example.com/case"`, `target="_blank"`, and `rel="noopener noreferrer"` — not a plain text node.

## AC Group E — 피드백 폼 사용성 (REQ-PILOT-UX-008 ~ REQ-PILOT-UX-011)

**AC-PILOT-UX-009**
- Given a valid feedback payload with `submissionNonce = "fb-nonce-A"` for a given `(reportId, userId)`
- When `submitReportFeedback(reportId, userId, payload)` is called twice in sequence with the identical `submissionNonce`
- Then the second call does NOT insert a second row, and returns `{ success: true, feedbackId, caseId }` with the SAME `feedbackId` as the first call.
- And (append-only non-regression, REQ-PILOT-UX-008 — the highest-priority regression check in this SPEC) given the SAME `(reportId, userId)` but TWO DIFFERENT nonces (`"fb-nonce-A"` and `"fb-nonce-B"`), when `submitReportFeedback` is called once per nonce, then BOTH calls succeed and insert TWO SEPARATE rows in `feedback` — SPEC-FEEDBACK-001's append-only guarantee (no uniqueness on `(reportId, userId)` alone) is preserved.

**AC-PILOT-UX-010**
- Given the feedback form with a mocked `action` prop that resolves to `{ success: true, feedbackId: "x", caseId: "y" }`
- When the user submits the form
- Then a visible success-confirmation element appears in the DOM after the submission resolves.

**AC-PILOT-UX-011**
- Given the feedback form with a mocked `action` prop that resolves to `{ success: false, fieldErrors: { overallRating: ["필수 항목입니다."], "missedIssues.0.description": ["개인정보 형식이 감지되었습니다."] } }`
- When the user submits the form
- Then BOTH error messages are rendered as SEPARATE, individually-attributable DOM elements near their respective fields/sections — no single joined-string element containing both messages concatenated by a space is rendered.

**AC-PILOT-UX-012**
- Given the feedback form rendered with at least one entry in each of `missedIssues`, `verifiedClaims`, and cited evidence
- When the DOM is inspected
- Then the five content areas (overall rating+comment, missed issues, claim verdicts, evidence verdicts, outcome) are each wrapped in a distinct, visually-separated container element (distinguishable by a section boundary — border, heading, or card — not merely sequential `<div>`s with no visual grouping).

## AC Group F — 명시적 UI 상태 (REQ-PILOT-UX-012, REQ-PILOT-UX-013, REQ-PILOT-UX-014)

**AC-PILOT-UX-013**
- Given a report whose `verifiedClaims` array is empty (`[]`)
- When the case detail page renders
- Then an explicit empty-state text element is present in the claims section (not a blank/absent block), consistent with the existing pattern for `reviewTargets`/`missingMaterials`/`uncertainty`.
- And (evidence empty state, REQ-PILOT-UX-012) given a report whose claims cite zero distinct evidence IDs, when the case detail page renders, then an explicit empty-state text element is present in the evidence section.

**AC-PILOT-UX-014**
- Given the case-input form, with the `/api/cases` fetch mocked to reject (simulating a network-level failure, not an HTTP error response)
- When the user submits the form
- Then a human-readable error message is displayed to the user (via the existing `formError` state or equivalent), AND no unhandled promise rejection is recorded in the test run's console/error output.
- And (error boundary, REQ-PILOT-UX-014) given `app/cases/[caseId]/error.tsx` exists, when a rendering/data-fetch exception is thrown within the `app/cases/[caseId]/` route segment, then Next.js renders `error.tsx`'s recovery UI (containing a retry action wired to `reset()`) instead of an unhandled blank page.

## AC Group G — 비기능 제약 (REQ-PILOT-UX-015, REQ-PILOT-UX-016)

**AC-PILOT-UX-015**
- Given every new or modified UI string introduced by this SPEC (summary banner, success confirmation, error messages, empty-state text)
- When each string is reviewed against the prohibited-language check
- Then none contains a definitive/certain claim about insurance payout likelihood (e.g. no phrasing equivalent to "지급됩니다"/"보상 확정" without a qualifying "검토 필요"/"전문가 확인 필요"-class hedge), and the existing safety-phrase family used elsewhere in the app remains textually unchanged.

**AC-PILOT-UX-016**
- Given the final `lib/db/schema.ts` after M1, and the final `lib/validation/case-input.ts` / `lib/feedback/schema.ts` after M2
- When the diff introduced by this SPEC is inspected
- Then it adds ONLY the two nullable `submissionNonce` columns (plus their indexes) and the two optional `submissionNonce` schema fields — no field resembling 주민등록번호/전화번호/상세주소/의료기록·보험증권 원본 업로드 is added anywhere, and no existing `piiFreeText`/format-validation call site is removed or weakened.

## Definition of Done

- All 16 REQ-PILOT-UX items above have a corresponding AC entry marked PASS with cited command/test output.
- `pnpm test` (Vitest unit suite) exits 0, including the new/extended tests listed in `plan.md` §B M6.
- `pnpm test:e2e` case-flow scenario (including the new idempotency assertion) exits 0.
- `pnpm lint` and `pnpm format --check` (or equivalent) report no new violations introduced by this SPEC's diff.
- Manual smoke check: a full case-input → report view → feedback submission cycle, performed once in a real browser session, shows the pending indicator, the summary banner, evidenceType/issueTypes text, the feedback success confirmation, and no console errors.
