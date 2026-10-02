# SPEC Review Report: SPEC-B2C-CONSULT-001

Iteration: 12 (mechanically triggered re-audit: design.md hash changed since review-11; the nominal 3-iteration ceiling does not apply, as in review-6..11)
Audited tree: local HEAD `fe49bf8` PLUS uncommitted edits (`git status --short`: M design.md, M scripts/visual-verify.ts; `git diff HEAD --stat`: design.md 4 changed lines, visual-verify.ts 1 changed line). spec.md / plan.md / acceptance.md / research.md / progress.md are unmodified vs HEAD.
Verdict: **PASS** (no must-pass failure, no blocking defect; margin over threshold is thin, see Residual risk)
Overall Score: 0.857 (Tier L PASS threshold 0.85)
STOP-on-regression: NOT triggered (0.857 -> 0.857, not lower than review-11).

**Reasoning context ignored per M1 Context Isolation.** The caller's change summary was used only to locate files; every claim below was re-derived from direct reads of spec/plan/acceptance/design/research, `git diff`, greps, and one inspection of the design mock image.

**Cross-model limitation.** `mcp__moai__audit_multi` / `codex_audit` / `glm_audit` / `audit_cache` are unavailable in this session. Claude-only audit. No cross-model convergence was produced and no plan-audit cache entry was computed or written.

## Must-Pass Results

- [PASS] MP-1 REQ numbers. Requirement layer, `spec.md`. `grep -cE '^- \*\*REQ-B2CCONSULT-' spec.md` = 25 (001..025 contiguous, read in full). AC ids in acceptance.md: 25 (`grep -cE '^\*\*AC-B2CCONSULT-'`). The diff touches design.md only, so no numbering change.
- [PASS] MP-2 GEARS/EARS. Judged on the requirement layer (`spec.md` REQ entries) only. Given-When-Then entries in `acceptance.md` are the verification layer and were graded under Group 4. spec.md is byte-unchanged since review-11; the earlier judgment stands (REQ-006 L72 remains long, carried optional).
- [PASS] MP-3 frontmatter. spec.md L1-16: 12 canonical fields (id, title, version "0.1.0", status in-progress, created, updated 2026-09-29, author, priority P1, phase "v0.19.0 target" (release label), module, lifecycle spec-anchored, tags string) plus optional `tier: L`, `related_specs`. No rejected snake_case aliases.
- [N/A] MP-4 language neutrality: single-language (TypeScript/Next.js) feature.
- [PASS] MP-5 D7. Executed: `grep '^status:'` on the two referenced SPECs -> `SPEC-B2C-DIAGNOSIS-001 status: completed`, `SPEC-B2C-RESULT-001 status: completed`. Neither retired/superseded/archived; no BLOCKING finding.
- [PASS] MP-6 D8. `grep -c syscall` = 0 in all five artifacts.
- [PASS] MP-7. `grep -c 'NEEDS CLARIFICATION' plan.md research.md` = 0 / 0.

## Commands run (outputs summarized faithfully)

1. `git status --short && git log --oneline -3 && git diff HEAD --stat && git diff HEAD -- design.md` -> two modified files (design.md, scripts/visual-verify.ts); design.md hunks at L427 (§11 bullet), L445 (§12 M03 row), L480 (§12.2 table row), L484 (§12.2 "의미" bullet). Diff of visual-verify.ts is a single `skipReason` string at L2296 (`git diff HEAD -- scripts/visual-verify.ts`).
2. Grep `필수` across the five artifacts; Grep `CHANNEL_NOTICE|안내...필수|필수...안내` across the five artifacts; Grep `필수|CHANNEL_NOTICE|skipReason` in scripts/visual-verify.ts.
3. Read (full) spec.md, plan.md, acceptance.md, research.md, design.md, review-11; progress.md read at L2645-2655, L2679, L2683-2777 and by grep.
4. `Read scripts/visual-verify.ts` L596-645 (helper) and L2255-2331 (M03 entry); `Read e2e/consult-flow-03.spec.ts` L660-835; Grep for `id: "03-A2"`, `consult-channel-selector`, `role=status`.
5. `grep -c 'skipMetrics:' scripts/visual-verify.ts` -> **32**.
6. Read `components/consult/consult-channel-selector.tsx` L28-58, `consult-submit-bar.tsx` L100-122.
7. `grep` of `.moai/state/verify/consult-followup/followup/layout-ready/rects-ready-{kakao,phone}.json` -> `"noticeToNameLabel": 20, "noticeToForm": 20, allowed min 16`.
8. Read `design/exports/M03-상담-신청.png` (image inspection).
9. D7/D8/MP-7/format greps as listed above; `grep -cE '\\u[0-9a-fA-F]{4}'` = 0 in all five artifacts; `grep -c '^### Out of Scope' spec.md` = 5.

Not run: Playwright e2e, `pnpm visual:verify`, vitest, eslint/tsc/prettier (see Gaps).

## Required checks

### 1. review-11 D1 resolved: no remaining "필수" justification via acceptance/semantic checks

- Old text removed. Old design.md L427 / L480 and the old `skipReason` (visual-verify.ts) said the notice is "필수(acceptance 의미 검사·CHANNEL_NOTICE)". `git diff HEAD` shows all three replaced.
- Command evidence: grep for `CHANNEL_NOTICE|안내[^\n]{0,60}필수|필수[^\n]{0,60}안내` across spec/plan/acceptance/design/research returned only benign hits: plan.md L81 ("조건부 필수; 모바일에서 채널 안내와 겹치지 않도록" = "conditionally required" for the phone time field, unrelated), design.md L132 ("필수 동의 체크" unrelated), design.md L427 and L480 (now NEGATING: "안내 표시를 필수로 규정하지는 않으며", "필수 사항이 아니다"), acceptance.md L112 (unrelated). `CHANNEL_NOTICE` no longer appears in any of the five artifacts. In scripts/visual-verify.ts the only "필수" hit near the notice is the new skipReason L2296 ("...M03 semanticChecks가 요구하는 필수 사항은 아니다"), a negation.
- **Residual leftovers outside the five artifacts (not in the caller's stated scope, none normative):**
  - `.moai/specs/SPEC-B2C-CONSULT-001/progress.md` L2651 (Claim 34): "모바일 안내 문구가 필수라 폼이 약 62px 내려가고" still carries the old justification; L2769 (open item 21) still lists review-11 D1 as un-addressed ("미조치"); L7 and L2712 still say "이후 plan 산출물 변경 없음" (now false for design.md). progress.md is context-only here.
  - `components/consult/consult-channel-selector.tsx` L34-37 (code comment) says "acceptance.md §12 semanticChecks가 이 화면에서도 같은 문구를 요구한다" — acceptance.md has no §12 (the reference is design.md §12), and the requirement it describes is the desktop 03-A2 check only.
  - Git history (commit `ef205d3` message / `2d89815`) is immutable.
- Verdict on D1: **RESOLVED** in the plan artifacts and in scripts/visual-verify.ts.

### 2. Factual accuracy of every new claim in the reworded passages

| Claim (design.md) | Evidence | Result |
|---|---|---|
| M03 semanticChecks has 4 items: kakao radio, sticky bar, two gap checks | visual-verify.ts L2299-2330: radioChecked(/카카오톡 상담/), elementPosition("consult-submit-bar") expected "sticky", `gapBetweenWithinRange` x2 (notice bottom -> `label[for="consult-name-input"]`, notice bottom -> `[data-testid="consult-form"]`) | TRUE |
| gap helper returns "missing" when an element is absent | L626-635: `if (!upperEl \|\| !lowerEl) return null;` -> `if (gap === null) return "missing";`; expected string is `16~24px`, so "missing" fails the exact string compare (L617-618 comment) | TRUE |
| range 16~24px, base = parent gap-5 20px +/- 4, measured 20px | `M03_NOTICE_TO_FORM_GAP = { min: 16, max: 24 }` L613; comment L609-612; local evidence `rects-ready-kakao.json` / `-phone.json` `noticeToNameLabel: 20, noticeToForm: 20` | TRUE (the 20px figure lives only in a gitignored `.moai/state/verify/` file and progress.md, not in a committed artifact; see D3) |
| e2e (a)(b)(d) test with NOTICE_TO_FORM_GAP_PX 16~24 | e2e/consult-flow-03.spec.ts L675 (`{min:16,max:24}`), L728 test title starts `(a)(b)(d) ${channel} 채널 — ...`, L812-823 two `expectGapWithin` calls (name label, form container) | TRUE |
| AC-B2CCONSULT-010 additional scenario lists only (a)(b)(c), no gap assertion | acceptance.md L126-129: Then (a) order, (b) zero intersection, (c) sticky/hit-test; no 16~24px or "간격" assertion | TRUE (design.md L484 says exactly this and says the test is stricter than the AC) |
| Only desktop `03-A2` semanticChecks name the notice text; `M03`'s "existing" checks are kakao + sticky | Grep: `role=status` locator with `hasText: "접수 내용을 확인한 뒤"` only at visual-verify.ts L2042-2048 (id `03-A2` starts L1998); `03` entry has no notice check; M03 L2299-2309 kakao + sticky | TRUE |
| REQ/AC do not require the notice on mobile | spec.md: `채널 안내` occurs only in HISTORY; REQ-005 `role="status"` refers to the policy-not-ready submit-area notice, REQ-024 `aria-live` is satisfied independently by the sr-only `consult-submit-status` live region (consult-submit-bar.tsx L106-118). AC-010 scenario measures the notice but was added after the decision | TRUE, with one nuance (D2) |
| Original mock has no mobile notice | Opened `design/exports/M03-상담-신청.png`: channel cards -> "이름" label directly; no `role=status` notice text between | TRUE |
| notice ~37px, form shifts ~62px, coordinates 591.6~628.1 / 648.1~662.1 / 670.1~726.1 | Only in design.md (`grep -rIl "591\.6"` -> design.md and review-11 only); arithmetic consistent (gap 20 confirmed by rects json) | UNATTRIBUTED, carried (D3) |
| `skipMetrics` count 32 (31 before `ef205d3`) | `grep -c 'skipMetrics:'` = 32 | TRUE (breakdown re-verified in review-11; unchanged) |
| M03 max deviation 4px PASS (L482) | Not re-run; progress.md L2698 states "M03 4/4" | UNVERIFIED by this audit (Gaps) |

### 3. No approval claimed for the M03 deviation or the notice decision

- design.md L427: "이 편차와 안내 표시 결정에 대한 디자인 승인 기록은 없다(미기록). 안내를 `md` 미만에서 숨겨 목업과 맞추는 대안을 검토한 기록도 없다."; L480: "이 편차에 대한 디자인 승인 기록은 없다(미기록)."; visual-verify.ts L2296: "이 편차에 대한 디자인 승인 기록은 없다."
- Grep `승인` in design.md: hits at L90 (draft PII decision, pre-existing, softened in iteration 11), L201/L206/L452/L454/L456/L458/L470/L488 (02-series §12.1 recalibration and the RESULT-001 debts, none about M03). "의도된 편차" wording (L427 heading, L474-484) is a description of intent, not an approval claim; spec.md HISTORY likewise says "의도된 편차" only. progress.md L2651/L2679/L2708/L2726/L2768 all say no approval exists.
- Result: **no approval is claimed anywhere.** This also resolves the "honest labeling" half of review-11 D1. The owner-acceptance gap is now recorded honestly as 미기록.

### 4. Cross-document consistency; unresolved items not marked resolved

- design §12 M03 row (L445) = §12.2 table (L480) = §12.2 bullet (L484) = visual-verify.ts M03 code: 4 semantic items, `form.top` skipped, left/width/height gated, relative-gap gate 16~24px. Consistent.
- spec.md HISTORY (L24 (B)) states only the `ef205d3` deviation, `skipMetrics` handling and the AC-010 390px scenario; plan.md L84 says `top` alone is skipped and mentions the AC-010 scenario. Neither mentions the relative-gap gate from `7f54edc` (omission, not contradiction). Neither claims approval or "필수".
- progress.md: L2708/L2710 already say the AC-010 sentence lists (a)(b)(c) only and the tests are stricter than the AC, consistent with design.md L484. progress.md L2651 retains the old "필수" phrase and L2712 "이후 plan 산출물 변경 없음" is now stale (design.md changed) — staleness, not a contradiction of the SPEC docs (D4).
- Nginx `X-Forwarded-For` production verification: nothing in the changed passages touches it. progress.md L2712 and L2759 say "미확인/미완료". design.md L158 is a checklist item, not a resolved claim. **Not marked resolved.**
- Summary-card height (progress Claim 6): progress.md L2712, L2758 say unresolved. Not touched by the diff and not marked resolved anywhere I read.

### 5. Regression / format

- REQ 25, AC 25; `\uXXXX` escapes 0 in all five artifacts; 5 `### Out of Scope —` H3s (spec.md); NEEDS CLARIFICATION 0; syscall 0; the diff contains no new SPEC id.
- Tier L input contract: spec, plan, acceptance, design and research were all read in full this iteration.
- Plan-artifact hash subject (design.md) changed: any cached PASS for this SPEC is invalid for this tree. I computed no hash and wrote no cache entry.

## Category Scores (re-derived from scratch on this tree, then compared)

| Dimension | Score | Rubric Band | Evidence |
|-----------|-------|-------------|----------|
| Clarity | 0.75 | Minor ambiguity in one or two items | REQ-006 (spec.md L72) still very long with embedded rationale (carried). AC-009's not-ready sentence "저장되지도 복원되지도 않고" (acceptance.md L112) vs AC-006 second added scenario (L69-72, existing draft restored) reconcilable only via an unstated precondition (carried). The D1 overstated-rationale defect is fixed (design.md L427, L480), which removes one ambiguity source but does not move the band. |
| Completeness | 1.0 | All sections and frontmatter present | HISTORY (spec.md L18-24), WHY (§1), WHAT (§2), REQUIREMENTS (§3), ACCEPTANCE (acceptance.md), Out of Scope (5 H3s, spec.md L122/128/135/140/145), HOW (design.md, plan.md); 12 frontmatter fields (L1-16). The new design text explicitly records the missing approval and the unconsidered hide-below-md alternative rather than leaving them implicit. |
| Testability | 0.75 | One criterion not precisely binary-testable | AC-010(c) (acceptance.md L129) still says measurement at "최대 스크롤 상태", while the test scrolls each target into view (e2e L830+) (carried). AC-010's cited test title `(a)(b) {kakao\|phone} 채널 — …위치한다` (L129) no longer matches the real title `(a)(b)(d) ${channel} 채널 — …간격이 gap-5 부근이다` (e2e L728). New design claims about semanticChecks/e2e are all binary and verified (check 2). |
| Traceability | 1.0 | Every REQ has an AC; no orphans | 25/25 mapping intact; no REQ/AC id changed. The design.md-only diff introduces no orphan. REQ-024 sub-clauses (Desktop modal focus trap/ESC/return, `aria-describedby`, `aria-live`) are still thinly named in AC-024 (acceptance.md L370-385): the carried knife-edge, judged exactly as in review-8..11. |

Overall = harmonic mean = 4 / (1/0.75 + 1/1.0 + 1/0.75 + 1/1.0) = 4 / 4.6667 = **0.857** >= 0.85 -> PASS.

## Comparison with review-11 (after scoring)

review-11: PASS 0.857 (Clarity 0.75 / Completeness 1.0 / Testability 0.75 / Traceability 1.0). This iteration: identical scores, identical aggregate. No regression; STOP does not fire. Movement: review-11 D1 resolved (rationale corrected, approval status disclosed); no defect from the reword; no dimension band changes.

## Defects Found

D1. (review-11 D1) — RESOLVED, no action. Old "필수(acceptance 의미 검사·CHANNEL_NOTICE)" justification gone from design.md and visual-verify.ts; replaced by an accurate "설계 선택, REQ/AC/M03 semanticChecks가 요구하지 않음, 승인 미기록" statement. Evidence in checks 1-3. (Listed for traceability; not an open defect.)

D2. Nuance in the new "REQ/AC do not require the notice" wording — `design.md`:L427 vs `acceptance.md`:L126-129 and `e2e/consult-flow-03.spec.ts`:L735 — the AC-010 additional scenario (and its test, `await expect(notice).toBeVisible()`) presupposes a visible mobile notice: its (a)/(b) assertions name the notice, so the "hide below md" alternative mentioned as unexamined would also require changing AC-010. The design text says only that the scenario "measured the notice after the choice". Accurate, but incomplete about the coupling. — Severity: minor — Class: optional — Required fix: add one clause to design.md §11: "이 시나리오는 안내가 모바일에서 표시됨을 전제로 하므로 안내를 숨기는 대안을 택하면 AC-010 추가 시나리오도 바꿔야 한다."

D3. Unattributed measurement figures — `design.md`:L427 — "약 37px / 약 62px, 실측 안내 591.6~628.1 · 이름 라벨 648.1~662.1 · 입력창 670.1~726.1" and L480/L445's "실측 20px" are cited without a committed evidence path. The 20px is reproducible only from the gitignored `.moai/state/verify/consult-followup/followup/layout-ready/rects-ready-*.json` (I read them: 20/20); the decimals appear nowhere else in the tree (carried review-11 D4). — Severity: minor — Class: optional — Required fix: cite the evidence path/command (`LAYOUT_EVIDENCE_DIR=... pnpm test:e2e`, `rects-*.json`) or drop the decimals and keep "약 37px / 약 62px / 20px".

D4. Non-normative artifacts stale relative to this fix — `.moai/specs/SPEC-B2C-CONSULT-001/progress.md`:L2651 (old "필수" justification), L2769 (D1 listed as "미조치"), L7 and L2712 ("이후 plan 산출물 변경 없음", now false since design.md changed); `components/consult/consult-channel-selector.tsx`:L36 (comment cites nonexistent "acceptance.md §12 semanticChecks"). None is a spec/plan/acceptance/design/research contradiction. — Severity: minor — Class: optional — Required fix: on the next orchestrator/manager-spec pass, update progress.md open item 21 and the canonical block for iteration 12; correct the comment to "design.md §12".

D5. spec.md HISTORY and plan.md do not record this change or the relative-gap gate — `spec.md`:L24 and `plan.md`:L84 — the iteration-11-D1 fix (design §11/§12.2 reword) and the `7f54edc` relative-gap gate are described only in design.md. Omission, not contradiction. — Severity: minor — Class: optional — Required fix: append one HISTORY bullet and one plan.md sentence when spec.md is next touched.

D6. AC-010's cited test title is stale — `acceptance.md`:L129 vs `e2e/consult-flow-03.spec.ts`:L728 — AC cites `(a)(b) {kakao|phone} 채널 — … 위치한다`; the real title is `(a)(b)(d) … 위치하며, … 간격이 gap-5 부근이다`. (design.md L484 correctly says the AC does not mention the gap assertion.) — Severity: minor — Class: optional — Required fix: update the pointer to the (a)(b)(d) title or state that the gap assertion (d) is a stricter, non-AC check.

D7. (carried, review-11 D3) AC-010(c) "최대 스크롤 상태" vs per-target `scrollIntoViewIfNeeded` — `acceptance.md`:L129. — minor / optional / reword to the scroll-into-view procedure.

D8. (carried, review-11 D2) AC-009 "저장되지도 복원되지도" needs the "no pre-existing draft" precondition — `acceptance.md`:L112 vs L69-72. — minor / optional.

D9. (carried, review-11 D8) REQ-006 over-long with embedded rationale — `spec.md`:L72. — minor / optional.

D10. (carried, review-11 D9) AC-024 does not name REQ-024's focus-trap/ESC, `aria-describedby`, `aria-live` sub-clauses — `acceptance.md`:L370-385 vs `spec.md`:L114. This is the Traceability knife-edge. — minor / optional (a stricter reading of Traceability = 0.75 gives 0.80 -> FAIL; I keep 1.0 for consistency with review-8..11 and per M6 do not use optional findings to manufacture a FAIL).

D11. (carried, review-11 D4/D5/D6/D7/D10 remainder) design §11 coordinates (see D3), design §5 tree omits `consult-header.tsx`, back-navigation not tested/acknowledged (AC-009), POSIX-only `E2E_CONSULT_POLICY_READY=false` invocation and Quality-Gate bullet omitting the two-invocation requirement, `page.test.tsx` lacks an `isPolicyReady` assertion, AC-025 pins SHA `a106ac9` and lacks the "M03 form.top exempt, 설정된 검증 게이트 기준" qualifier — all unchanged, minor / optional.

No blocking defects. No must-pass failures.

## Regression Check (previous iteration = review-11)

- review-11 D1 (overstated "필수" rationale; no owner acceptance recorded): RESOLVED (design.md L427, L480, visual-verify.ts L2296; approval status now disclosed as 미기록).
- review-11 D2, D3, D4, D5, D6, D7, D8, D9, D10: UNRESOLVED, optional, unchanged (carried above as D8, D7, D3/D11, D11, D11, D11, D9, D10, D11).
- Nothing from review-11 got worse; one item improved.

## Gaps (what I did NOT verify)

- Playwright e2e was NOT executed (needs production build + start). The gap test's assertions were read, not run; the "mutation gap-12 fails the new assertion" result is from progress.md, not observed by me.
- `pnpm visual:verify` was NOT executed. "M03 max deviation 4px PASS" (design.md L482) and "24/24 PASS" (progress.md) are unverified by this audit; only the static entries, helper and semanticChecks were verified.
- vitest, eslint, tsc, prettier, coverage, `next build` not run. No code was changed by this iteration except the one `skipReason` string.
- Design-mock pixel coordinates (591.6 etc.) were not re-measured; I only confirmed visually that the mock has no notice between the channel cards and the name field.
- Real-device / iOS behavior and screen-reader announcement not verified.
- No plan-audit cache hash computed; no cross-model opinion (MCP tools unavailable).
- Nginx `X-Forwarded-For` production settings and the summary-card height question are outside plan-artifact verification and remain open; I confirmed only that no artifact marks them resolved.

## Residual risk

- Margin over threshold is 0.007 (< 0.02): FRAGILE. A reviewer weighting the carried REQ-024/AC-024 sub-clause gap (D10) as Traceability 0.75 would compute 0.80 (FAIL). Cheapest mitigation: one manager-spec pass covering D10 (three short sentences), D7/D8 (one clause each), D6 and D2; a scoped re-audit of that delta would suffice.
- The M03 mobile form sits ~62px below the design mock and its `top` axis is excluded from the visual gate; the vertical relation is protected only by the e2e (16~24px + non-overlap) and M03 semantic gap checks, none of which I executed. No design owner accepted the deviation (now honestly recorded as 미기록).
- The verdict applies to the current working-tree state (uncommitted design.md and visual-verify.ts on top of `fe49bf8`); it does not transfer if the committed state differs.

## Recommendation

PASS (0.857 >= 0.85, Tier L). No must-pass failure and no blocking defect; review-11 D1 is resolved and the reworded design passages are factually accurate against the code and tests (checks 1-4). Optional follow-ups for the orchestrator, not required for the verdict: (1) commit design.md and scripts/visual-verify.ts, (2) refresh progress.md open item 21 / canonical block and the stale comment (D4), (3) if the knife-edge should be removed before the plan-to-run gate, re-delegate to manager-spec for D10, D7, D8, D6, D2 and re-audit only that delta (any further edit to spec/plan/acceptance/design changes the plan-artifact hash again). Before relying on layout and visual claims, run Playwright in both modes and `pnpm visual:verify`.
