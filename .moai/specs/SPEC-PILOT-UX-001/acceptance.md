# SPEC-PILOT-UX-001 — Acceptance Criteria

Given-When-Then scenarios, grouped by REQ family. Each criterion is binary-testable (PASS/FAIL against an observable command output, DB row, or rendered element) per the verification-layer contract — GEARS requirement wording lives in `spec.md` §2; this file never restates a requirement as a scenario.

## AC Group A — 사건 입력 대기 상태 (REQ-PILOT-UX-001 — iteration-4에서 구 REQ-001/002 병합)

**AC-PILOT-UX-001**
- Given the case-input form (`case-input-form.tsx`) rendered with valid field values
- When the user submits the form and the `/api/cases` POST response has not yet resolved
- Then a visible progress indicator (distinct from the button's text-only change) is present in the DOM, and it remains present until the response resolves.

**AC-PILOT-UX-002**
- Given the case-input form in the pending state (submit in flight)
- When any of the four input fields (`incidentDescription`, `diagnosisName`, `disabilityBodyPart`, `incidentDate`) is inspected
- Then each field's `disabled` attribute is `true` — not only the submit button.

## AC Group B — 사건 중복 제출 방지 (REQ-PILOT-UX-002, REQ-PILOT-UX-003 — 클라이언트 단일 흐름 가드로 재정의, iteration-3 외부 리뷰 반영; iteration-4에서 구 REQ-003을 원자적으로 분리)

**AC-PILOT-UX-003**
- Given the case-input form (`case-input-form.tsx`) rendered with valid field values, with `fetch` mocked to NOT resolve immediately (a pending Promise)
- When the submit handler is invoked twice in rapid succession (simulating a double-click) before the first `fetch` call resolves
- Then `fetch` is called exactly once — the second invocation returns immediately without issuing a second `fetch` call.
- And (post-success re-invocation, REQ-PILOT-UX-002's guard-active-until-failure clause) given a case was successfully submitted (the mocked `fetch` resolved with a 201 response and the guard was never reset — per REQ-PILOT-UX-003 the guard resets only on failure), when `handleSubmit` is invoked again before the component unmounts, then `fetch` is NOT called again.

**AC-PILOT-UX-004**
- Given a case-input form submission that previously failed (the mocked `fetch` rejected, OR resolved with a non-201 status)
- When the user resubmits the form after the failure
- Then `fetch` is called again — the submit guard was reset on failure, allowing resubmission.

## AC Group C — 리포트 정보 위계 (REQ-PILOT-UX-004 — iteration-4에서 구 REQ-004/005 병합)

**AC-PILOT-UX-005**
- Given a case detail page (`page.tsx`) rendered for a case with an existing report
- When the DOM is inspected
- Then a summary-banner element appears BEFORE (precedes in document order) the existing "사건 요약" card, and it contains the report's `caseSummary.diagnosisName` and `caseSummary.disabilityBodyPart` text.

**AC-PILOT-UX-006**
- Given a report whose `verifiedClaims` array has 3 entries, 2 with `status: "VERIFIED"` and 1 with `status: "INSUFFICIENT"`
- When the case detail page renders
- Then the summary banner displays an aggregate count reflecting `2`/`3` verified and `1`/`3` insufficient (or equivalent phrasing carrying both numbers), AND the existing per-claim `data-testid="claim-status"` pills (one per claim, 3 total) are still individually present and unchanged in behavior.

## AC Group D — 근거자료 표시 (REQ-PILOT-UX-005, REQ-PILOT-UX-006)

**AC-PILOT-UX-007**
- Given an evidence row in the `evidence` table with `evidenceType = "PRECEDENT"` and `issueTypes = ["DISABILITY_GRADE_CRITERIA"]` that is cited by a claim in the rendered report
- When the case detail page renders that claim's supporting-evidence list
- Then the rendered evidence entry includes visible text or markup identifying `evidenceType` (e.g. "PRECEDENT") and `issueTypes` (e.g. "DISABILITY_GRADE_CRITERIA", or its optional Korean display-label equivalent such as "장해 평가 기준") alongside the existing `title`.
- And (parity check, REQ-PILOT-UX-005) given the same evidence row cited in the feedback form's per-evidence verdict list, when the feedback form renders, then the same `evidenceType`/`issueTypes` information is present there too (both surfaces stay in parity — plan.md §D Risk 1).

**AC-PILOT-UX-008**
- Given an evidence row with a non-null `sourceUrl` (e.g. `"https://example.com/case"`)
- When the case detail page renders that evidence's reference
- Then the rendered `sourceUrl` is inside an `<a>` element with `href="https://example.com/case"`, `target="_blank"`, and `rel="noopener noreferrer"` — not a plain text node.

## AC Group E — 피드백 폼 사용성 (REQ-PILOT-UX-007 ~ REQ-PILOT-UX-011 — iteration-4에서 구 REQ-009를 원자적으로 분리)

**AC-PILOT-UX-009**
- Given the feedback form (`feedback-form.tsx`) rendered with a valid overall rating selected, with the `action` prop mocked to NOT resolve immediately (a pending Promise)
- When the submit handler is invoked twice in rapid succession (simulating a double-click) before the first `action` call resolves
- Then `action` is called exactly once — the second invocation returns immediately without calling `action` again.

**AC-PILOT-UX-010**
- Given the feedback form with a mocked `action` prop that resolves to `{ success: true, feedbackId: "x", caseId: "y" }`
- When the user submits the form
- Then a visible success-confirmation element appears in the DOM after the submission resolves, AND the submit button remains disabled on that mounted form instance from that point onward.
- And (re-entry allows a new logical submission, append-only non-regression) given a freshly re-mounted instance of the SAME feedback form (simulating a page reload or re-navigation to the report), when that new instance is submitted, then `action` is invoked again for that instance — a new logical submission is NOT blocked by the prior instance's success state (SPEC-FEEDBACK-001's append-only guarantee is preserved).

**AC-PILOT-UX-011**
- Given the feedback form with a mocked `action` prop that resolves to `{ success: false, fieldErrors: { overallRating: ["필수 항목입니다."], missedIssues: ["개인정보 형식이 감지되었습니다."] } }`
- When the user submits the form
- Then BOTH error messages are rendered as SEPARATE, individually-attributable DOM elements under their respective top-level sections (전체 평가 / 누락 쟁점) — no single joined-string element containing both messages concatenated by a space is rendered.

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
- Given the final `lib/db/schema.ts`, `lib/validation/case-input.ts`, and `lib/feedback/schema.ts` after this SPEC's implementation
- When the diff introduced by this SPEC is inspected
- Then NONE of these three files contain any change — no new column, no new field, no field resembling 주민등록번호/전화번호/상세주소/의료기록·보험증권 원본 업로드 is added anywhere, and no existing `piiFreeText`/format-validation call site is removed or weakened. This SPEC's diff touches only `app/cases/new/case-input-form.tsx`, `app/cases/[caseId]/{page.tsx,feedback-form.tsx,error.tsx}`, and their test files.

## Definition of Done

- All 16 REQ-PILOT-UX items above have a corresponding AC entry marked PASS with cited command/test output.
- `pnpm test` (Vitest unit suite) exits 0, including the new/extended tests listed in `plan.md` §B M4.
- `pnpm test:e2e` case-flow scenario (including the new single-flight-guard assertion) exits 0.
- `pnpm lint` and `pnpm format:check` report no new violations introduced by this SPEC's diff.
- Manual smoke check: a full case-input → report view → feedback submission cycle, performed once in a real browser session, shows the pending indicator, the summary banner, evidenceType/issueTypes text, the feedback success confirmation (with the submit button staying disabled), and no console errors.
