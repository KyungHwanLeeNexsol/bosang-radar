# SPEC Review Report: SPEC-B2C-CONSULT-001

Iteration: 11 (mechanically-triggered re-audit; plan-artifact hash changed since review-10; the nominal 3-iteration ceiling does not apply, as in review-6..10)
Audited tree: local HEAD `ef205d3` (code commits `2230e2b` hydration fix, `ef205d3` mobile layout fix are committed) PLUS uncommitted doc edits (`git status --short`: M spec.md, plan.md, acceptance.md, design.md; `git diff --stat`: 4 files, 64 insertions, 13 deletions). `progress.md`, `research.md` unmodified.
Verdict: **PASS** (no must-pass failure; no blocking defect; margin over threshold is thin, see Score note and Fragility)
Overall Score: 0.857 (Tier L PASS threshold 0.85)

**Reasoning context ignored per M1 Context Isolation.** The caller's change summary was used only to locate files; every claim below was re-derived from direct reads, `git diff`, greps and one test run. Scoring was done from scratch on this tree before comparing with review-10.

**Cross-model limitation.** `mcp__moai__audit_multi` / `codex_audit` / `glm_audit` were not used. Claude-only audit; no second-backend opinion.

## Must-Pass Results

- [PASS] MP-1 REQ number consistency. Requirement layer, `spec.md`. Command: grep of `^- \*\*REQ-B2CCONSULT-` ids -> `001 002 ... 025` contiguous, no duplicates (25). AC ids in `acceptance.md`: `001 ... 025` (25). No new ids introduced by the diff (REQ-007/008/009 gained one clause each).
- [PASS] MP-2 GEARS/EARS compliance. Judged on the requirement layer only (`spec.md` REQ entries). The Given-When-Then entries in `acceptance.md` are the verification layer and were graded under Group 4, not here. The three new clauses (REQ-007 L73, REQ-008 L74, REQ-009 L75) are appended sentences in existing entries ("이 안내는 ... hydration 이후에 나타나며 ... 오류를 내지 않는다"), stated in the ubiquitous/event form of their host entries, no "should/may". REQ-006 remains long (carried, optional).
- [PASS] MP-3 frontmatter. `spec.md` L1-16: id, title (quoted), version "0.1.0", status in-progress, created 2026-09-25, updated 2026-09-29, author, priority P1, phase "v0.19.0 target" (a release label, not a lifecycle stage), module, lifecycle spec-anchored, tags string; optional `tier: L`, `related_specs`. No rejected snake_case aliases.
- [N/A] MP-4 language neutrality: single-language (TypeScript/Next.js) feature.
- [PASS] MP-5 D7. Referenced SPEC ids in spec.md: SPEC-B2C-DIAGNOSIS-001 and SPEC-B2C-RESULT-001 (both `completed` per review-10's executed D7 verb; no new SPEC id introduced by this diff; not re-executed this iteration, see Gaps). None retired/superseded/archived.
- [PASS] MP-6 D8. `grep -c syscall` = 0 in spec/plan/acceptance/design/research.
- [PASS] MP-7. `grep -rn 'NEEDS CLARIFICATION' plan.md research.md` -> 0 matches.

## Verification run (required check 7)

Command: `pnpm exec vitest run components/consult app/consult lib/consult > .moai/state/verify/consult-followup/review11-vitest.log 2>&1; echo exit=$?` (this run, this tree, HEAD `ef205d3` + doc edits). Log: `.moai/state/verify/consult-followup/review11-vitest.log`. Verbatim tail:

```
 RUN  v4.1.11 C:/Users/Nexsol/Documents/bosang-radar/.claude/worktrees/consult-followup

Not implemented: Window's scrollTo() method

 Test Files  17 passed (17)
      Tests  125 passed (125)
   Start at  14:48:27
   Duration  5.62s (transform 1.82s, setup 0ms, import 8.96s, tests 2.74s, environment 29.45s)

exit=0
```
(116 in review-10 -> 125 now; consistent with the 8 hydration tests of `2230e2b` plus the 1 negative-margin guard of `ef205d3`. A Vite config-loader deprecation warning precedes the output; unrelated.)

Not run: Playwright e2e (needs `pnpm build && pnpm start`), `pnpm visual:verify`, eslint/tsc/prettier. See Gaps.

## Required checks

### 1. New/changed requirement clauses and scenarios -> observable verification; cited tests exist

Every cited test title was grepped in the tree.

- AC-007 added scenario cites e2e `(a) 진단 handoff 없이 /consult를 직접 열고 새로고침해도 empty 안내가 뜨고 오류가 없다` -> `e2e/consult-flow-03.spec.ts:476` (registered twice via `registerHydrationTests(true|false)` L615-616, not-ready copy carries the `@policy-not-ready` suffix); unit `handoff 없음(empty): 서버 마크업은 loading뿐이고, 수화 오류 없이 no-data 안내로 전환된다` -> `components/consult/consult-view.test.tsx:1149`. EXISTS.
- AC-008 cites `(b-i)` L492, `(b-ii)` L509 (e2e) and `handoff 손상(파싱 불가 JSON)` L1160 / `handoff 손상(유효 JSON이나 스키마 불일치)` L1171 (unit). EXIST.
- AC-009 cites `(c) 유효한 handoff로 ... 폼이 뜨고 ...` L525, `(c) ... ?channel=phone ...` L551, `(c) ... 입력·blur 후 새로고침하면 ...` L566 (e2e); `valid handoff(정책 준비)` L1045, `valid handoff(정책 미준비)` L1084, `draft가 없고 URL이 ?channel=phone이면 ...` L1107, `draft의 channel이 URL ?channel=보다 우선한다 ...` L1119, `draft가 없으면 수화 후 idempotencyKey가 새로 1회 생성되어 draft에 기록된다(정책 준비)` L1137 (unit). EXIST.
- AC-010 added scenario cites describe `03 화면 — 모바일(390x737) 채널 안내·폼·하단 CTA 겹침 없음 (모드)` L705, tests `(a)(b) {kakao|phone} 채널 — ...` L709 and `(c) {kakao|phone} 채널 — ...` L785, desktop describe `03 화면 — 데스크톱(1440x900) 채널 안내가 폼과 겹치지 않는다 (모드)` L877, and the jsdom guard `폼 컨테이너에는 위 요소와 겹치게 만드는 음수 상단 마진(-mt-*) 클래스가 없다` -> `consult-form.test.tsx:161`. EXIST.

Discrimination / vacuity:
- Unit hydration tests are discriminating: `renderServerHtml` stubs `window` to undefined and calls `renderToString(<ConsultView/>)`, then `expectLoadingMarkup(serverHtml)` asserts the server HTML contains `consult-loading`/`aria-busy` and NOT the no-data copy, the error copy, `consult-view`, `consult-no-data`, `consult-error` (`consult-view.test.tsx:1025-1033`); then `hydrateRoot` with `onRecoverableError` collecting errors plus a `console.error` filter for `/hydrat|418|did not match/` (L1019-1023). The pre-fix component (server snapshot = `empty`) would fail `expectLoadingMarkup`. Not vacuous.
- e2e hydration tests collect `pageerror` + `console.error` + `/hydrat|418|Minified React error/` (L435-458) and use `goto` + `reload` in a production build. Server-HTML content is NOT asserted in e2e; AC-007 correctly assigns the server-markup part to the unit test.
- e2e layout tests are numeric bounding-rect checks with strict intersection (area>0), order assertions (cards end above notice; notice ends above name label), `elementFromPoint` + trial click (L761-845). Commit message of `ef205d3` says 4 pre-fix failures were observed; I could not re-observe that (no e2e run).
- Precision mismatch (D3 below): AC-010(c) says measurement happens "페이지를 최대로 스크롤한 뒤 ... 최대 스크롤 상태에서", but the test scrolls to max only as a precondition and then calls `scrollIntoViewIfNeeded()` on each target before measuring (L789-816). The test is a reachability check per element, not a literal max-scroll-state measurement.

### 2. Doc-vs-code accuracy

- design §2.2.1 vs `consult-view.tsx`: server snapshot `{status:"loading"}` (L61-63); client snapshot computed once and cached in a ref (L73-81); `subscribe` is a no-op (L83); the `loading` branch renders `<ConsultHeader variant="form"/>` + empty `data-testid="consult-loading"` `aria-busy="true"` container and nothing else (L605-616); `ConsultViewBody` mounts only after loading (L618) and contains draft restore, channel priority (draft > URL > kakao, L217-228), `idempotencyKey`, mount `resultId` capture (L258), `persistDraft` guard (L291-307), `handleSubmit` re-reading `readDiagnosisHandoff()` (L363). "이전에는 렌더마다 다시 읽었다": `git show 2230e2b~1:components/consult/consult-view.tsx` has `const handoff = readDiagnosisHandoff();` at L161 in the render body -> TRUE. "`components/result/result-view.tsx`와 같은 패턴": `result-view.tsx:98-125` uses `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)` with a "loading" server state -> TRUE. Section 2.2.1 is ACCURATE.
- design §11 numbers: 37px notice / 62px form shift are in the `ef205d3` commit message. The finer coordinates (notice 591.6~628.1, name label 648.1~662.1, input 670.1~726.1) exist ONLY in design.md itself (`grep -rIl "591\.6"` -> only design.md); no committed measurement file (e2e writes evidence only when `LAYOUT_EVIDENCE_DIR` is set, unset by default). Internal arithmetic is consistent (notice 36.5; gap 628.1->648.1 = 20 = `gap-5`; label 14; input 56; 62px delta) but the figures are unattributed per verification-claim-integrity §2 (D4).
- design §12.2 / skipMetrics arithmetic, verified by command:
  - `grep -c 'skipMetrics:' scripts/visual-verify.ts` -> **32** (HEAD); `git show ef205d3~1:...` -> **31**; `git show a106ac9:...` -> **2**. Matches design §12.2 ("2건 -> 32건", "31건 before ef205d3").
  - Per-entry breakdown by line ranges of `id:` markers (927 in `01-D`; 1161 in `M01-B`; 1333,1343 in `02`; 1455/1469/1489/1501 `M02`; 1590/1599/1609/1618 `M02-B`; 1695/1704/1712/1721 `M02-C`; 1801/1810/1818/1827 `M02-D`; 2040/2056 `03-B`; 2108/2121 `03-C`; 2160/2172/2180 `03-D`; 2263 `M03`; 2321 `M03-B`; 2375/2384 `M03-C`; 2436 `M03-D`): 01 series 2 + 02 series (2+4+4+4+4) **18** + 03 series (2+2+3+1+1+2+1) **12** = 32. The doc's "18 counts only the 02-series" is CORRECT; the "12" and "2" are correct.
- AC-B2CCONSULT-025 "기존 15화면 정의 불변" re-checked against `a106ac9` (entries extracted by `id` with awk from `git show a106ac9:scripts/visual-verify.ts` vs HEAD): the 10 entries `01 01-A2 01-B 01-C 01-D 01-E M01 M01-A2 M01-B M01-C` md5-identical (all `SAME`); `TOLERANCE = { desktop: 8, mobile: 4 }` identical; lines deleted from the 02-series entries: `bottom: 3089,` (in `02`) and `// 참값(top=923).` (in `M02`) only (`M02-B/-C/-D` no deleted lines). The scenario text (AC-025 L395) is TRUE, and the `ef205d3` change is inside new entry `M03` only (`git diff ef205d3~1 ef205d3 -- scripts/visual-verify.ts` = one 3-line hunk at L2260-2265).
- playwright/mode-switch consistency (required check 4) — see section 4.
- HISTORY vs diff: the new spec.md HISTORY bullet lists (A) hydration -> design 2.2.1/tree/plan + one clause each REQ-007/008/009 + AC-007/008/009 scenarios + playwright mode switch (design §5 item 10 / plan); (B) mobile overlap -> design §11/§12.2 + AC-010 scenario; (C) review-10 D2/D1/D3 precision fixes -> acceptance L51, design L86/L90. All confirmed in `git diff`. It states "문서 수정만 ... 커밋·테스트·린트 결과를 주장하지 않는다" and makes no unverified success claim. It says "리뷰 D4·D5(AC-B2CCONSULT-024, REQ-B2CCONSULT-006 길이)는 이 항목에서 다루지 않았다" — true (AC-024 and REQ-006 length untouched).
- Doc-vs-code defect (D1 below): design §11 L427 and §12.2 L480 (and the `skipReason` at `visual-verify.ts:2265`) justify keeping the mobile notice by "안내 문구는 필수(acceptance 의미 검사·CHANNEL_NOTICE)". The M03 `semanticChecks` (`visual-verify.ts` ~L2267-2280) check only the kakao radio and the sticky bar, and design §12's own M03 row lists only "카카오 기본 선택, 하단 CTA position: sticky". The only semantic check that names the notice is the desktop `03-A2` row. No REQ/AC requires the notice on mobile (the AC-010 scenario measures it, but was written after the design choice). So "필수" is unsupported for the mobile display decision, and design §12 (table) and §12.2 disagree.
- Minor tree drift (D5): design §5 file tree does not list `components/consult/consult-header.tsx` (exists; added in `c0605b7`, imported by `consult-view.tsx`); `grep -n consult-header` over spec/plan/acceptance/design/research -> no match.

### 3. M03 `form.top` deviation: "intended deviation", not "user-approved"

- No approval claim: design §11 L427 ("디자인 목업과의 의도된 편차"), §12.2 L474-484 ("의도된 편차", "설정된 검증 게이트 기준" PASS), spec.md HISTORY ("의도된 편차 ... 편차는 신규 항목 안에 있어 AC-B2CCONSULT-025의 ... 영향이 없다"). grep of `승인` in design.md: hits at L90 (draft PII decision, pre-existing), L201/L206/L452/L454/L456/L458/L470/L488 — all the 02-series §12.1 recalibration or the RESULT-001 debt, none about M03. plan.md/acceptance.md likewise. Accurate: the docs do NOT claim the M03 top deviation was approved. Residual risk: also no owner acceptance is recorded (see D1).
- Mechanism: `skipMetrics: ["top"]` on the `form` element of the new `M03` entry only, with a `skipReason`; `left/width/height` remain gated; `TOLERANCE` and all 15 pre-existing entries byte-unchanged (verified). It stays inside the documented per-axis `skipMetrics` mechanism (the same mechanism §12.1 documents for the 02-series).
- Does it weaken a REQ/AC? No. AC-025 asserts 9 new screens PASS under the configured gate; §12.2 discloses the axis exemption and moves the vertical relation to an e2e non-overlap assertion (AC-010 added scenario). Note AC-025's first scenario text (L390) qualifies only the 02-series PASS as "설정된 검증 게이트 기준"; the equivalent qualifier for `M03` lives in design §12/§12.2 only (D1 fix can add one clause).
- Judgment: the deviation is honestly labeled; the accommodation is proportionate and mechanically bounded; the necessity rationale is overstated (D1). An alternative that avoids any gate exemption (hide the notice below `md`, matching the mock) is not recorded as considered.

### 4. Hydration coverage gaps; e2e mode switch consistency

- Full-load + reload are covered (unit + prod-build e2e), in both policy modes, for empty / corrupted (two shapes) / valid, plus `?channel=phone` and draft restore.
- REQ-009 also says "뒤로가기 후 재진입". The base AC-009 scenario (L104-107) names back-navigation; NO test in the tree exercises it (`grep -n "goBack\|history.back" e2e/consult-flow-03.spec.ts` -> no match; the only `AC-009` unit test is the plain valid render at `consult-view.test.tsx:85`). The docs do not claim otherwise: the new REQ-009 clause is correctly limited to "전체 로드·새로고침 때의 폼 표시" and the added AC-009 scenario says "전체 로드하고 새로고침". The gap is therefore NOT overstated, but it is also NOT acknowledged anywhere. Risk is low: a client-side back navigation mounts `ConsultView` without hydration (non-hydration path reads `getSnapshot` directly), and a full-load back is the covered path. Recorded as D6 (optional).
- Mode switch consistency (three surfaces compared):
  - `playwright.config.ts:53-57,63`: `policyReady = process.env.E2E_CONSULT_POLICY_READY !== "false"`; `grepInvert: /@policy-not-ready/` when ready, `grep: /@policy-not-ready/` when not; `CONSULT_POLICY_READY: policyReady ? "true" : "false"` in `webServer.env`.
  - design §5 item 10 (L212): same variable, same tag, same grep/grepInvert, "두 가지 호출", "미준비 모드를 단독으로 실행하면 태그 붙은 테스트만 돌고 01/02 스펙과 태그 없는 03 테스트는 돌지 않는다".
  - plan.md L84: same two invocations and the same "bare not-ready run executes only tagged tests" warning.
  - Test titles carry the tag in both describe and test (`spec.ts:470,473,476,...,701,705,...`); `POLICY_NOT_READY_TAG` used 3 times; `e2e/diagnosis-flow-0*.spec.ts` contain no tag (so a not-ready-only run does skip them, as documented).
  - The stated reason for not using `test.skip` (run-e2e.ts compares result markers to "Running N tests") is real: `scripts/run-e2e.ts:190-199,261-317` parses `^Running (\d+) tests?` and matches `seenResultCount === expectedResultCount`.
  - CONSISTENT. Two small notes: the documented invocation `E2E_CONSULT_POLICY_READY=false pnpm test:e2e` is POSIX syntax (the user's environment is Windows/PowerShell; cross-env or `$env:` is needed) — usability, optional (D7). The acceptance "Quality Gate 기준 > 회귀 게이트" bullet does not mention that full regression needs both invocations (plan.md does).

### 5. Regression / format

- REQ 25, AC 25 (ids listed above). `grep -cE '\\u[0-9a-fA-F]{4}'` -> 0 in all five artifacts. Frontmatter valid (MP-3). HISTORY consistent with the diff (section 2). `NEEDS CLARIFICATION` 0; `syscall` 0. Five `### Out of Scope —` H3 headings (`grep -c` = 5; spec.md L122/128/135/140/145), each with `-` bullets.
- Plan-artifact hash subjects (spec, plan, acceptance, design changed; research unchanged): the cached PASS from review-10 is invalid for this tree. I did not compute or write a hash.

### 6. Carried items D4/D5/D6 (numbering of review-10) — re-evaluated exactly as in review-10

- review-10 D4 (REQ-006 over-long, embeds rationale/cross-references): `spec.md` L72 unchanged by this diff -> UNRESOLVED, optional. Same effect on score as in review-10 (Clarity held at 0.75).
- review-10 D5 (REQ-024 sub-clauses not named in AC-024): AC-024 (`acceptance.md` L370-385) unchanged; REQ-024 (spec.md L114) still lists Desktop Modal focus trap/ESC/return, `aria-describedby`, `aria-live`; AC-024 names only desktop 720px + error-summary focus, mobile sticky + Bottom-Sheet ESC/return, keyboard-only. UNRESOLVED, optional. Traceability held at 1.0 for consistency with review-8/9/10; this is still the knife-edge (a stricter reading of Traceability = 0.75 gives 0.80 -> FAIL). Not silently forgiven; not penalized differently.
- review-10 D6 (env->prop wiring not page-tested; AC-021 concurrency scope; design 03-D wording drift; progress.md staleness; AC-025 pinned SHA): `app/consult/page.tsx:27,42` does pass `isPolicyReady`, but `app/consult/page.test.tsx` has no `isPolicyReady` assertion (grep: only comments) -> still UNRESOLVED; AC-025 still pins `a106ac9` (L393); progress.md is unmodified and L2573/L2625 still describe the not-ready draft write as an open finding (stale vs the REQ-006 exception). design L90 was softened this iteration ("찾지 못했다(키워드 grep 기준이며 ... 전수 확인한 것은 아니다)"), which resolves the design-side wording part of review-10 D1; the progress.md staleness part remains. AC-021 scope and 03-D wording drift not re-examined. Optional, unchanged.

## Category Scores (from scratch, then compared)

| Dimension | Score | Rubric band | Evidence |
|-----------|-------|-------------|----------|
| Clarity | 0.75 | Minor ambiguity in one or two requirements/criteria | REQ-006 (L72) and REQ-018 (L99) remain very long with rationale embedded (carried). AC-009 added scenario says for the not-ready state the draft is "저장되지도 복원되지도 않고 ... (AC-B2CCONSULT-006의 추가 시나리오와 일치)" (`acceptance.md` L112) while AC-006 second added scenario (L69-72) requires a pre-existing draft to be restored in the same state — reconcilable only via the unstated precondition "no draft was stored" (D2). design §12.2 rationale ("필수") overstated (D1). Hydration/REQ clauses themselves are unambiguous. |
| Completeness | 1.0 | All required sections, frontmatter complete | HISTORY, WHY (§1), WHAT (§2), REQUIREMENTS (§3), ACCEPTANCE (acceptance.md), Out of Scope (5 H3s, spec.md L122/128/135/140/145), HOW (design.md/plan.md), 12 frontmatter fields (L1-16). Tree omission of `consult-header.tsx` is a minor drift, not a missing section. |
| Testability | 0.75 | One criterion not precisely binary-testable / minor interpretation | New scenarios AC-007/008/009/010 are binary and backed by existing, discriminating tests (section 1). Defects: AC-009 not-ready wording (D2); AC-010(c) says "최대 스크롤 상태" but the test measures after per-target `scrollIntoViewIfNeeded` (D3); AC-010(c) also requires `elementFromPoint`/trial-click which only the e2e run proves (not run here); carried AC-021 scope and AC-025 pinned SHA. No weasel words ("온전히", "잘리지 않고" are operationalized by `toBeInViewport({ratio:1})` and scroll/client size comparison). |
| Traceability | 1.0 | Every REQ has an AC; no orphans | 25/25. New clauses REQ-007/008/009 -> AC-007/008/009 added scenarios -> named tests (all exist). REQ-005/006/022 chain from review-10 intact. `AC-B2CCONSULT-0NN` references in spec.md: 005, 006, 007, 010, 022, 024, 025 — all valid. REQ-024 sub-clauses remain thin in AC-024 (carried D5) — knife-edge as stated in check 6. |

Overall = harmonic mean = 4 / (1/0.75 + 1/1.0 + 1/0.75 + 1/1.0) = 4 / 4.6667 = **0.857** >= 0.85 -> PASS.

## Comparison with review-10 (after scoring)

review-10: PASS 0.857 (Clarity 0.75, Completeness 1.0, Testability 0.75, Traceability 1.0). This iteration: same four scores, same aggregate. No score regression (0.857 -> 0.857), so the STOP-on-regression rule does not fire.

Movement per dimension:
- Clarity 0.75 -> 0.75. Improved: review-10 D1/D2/D3 precision fixes landed (AC-005 operation wording L51-53; design L86 save timing now names the real `persistDraft` call sites, matched to code L311-341; design L90 approval wording softened). Offset by new imprecision introduced in this delta (AC-009 not-ready phrase D2; overstated "필수" rationale D1). The band does not move.
- Completeness 1.0 -> 1.0. No section change; the doc set grew by real, code-verified sections (2.2.1, §11 bullet, §12.2).
- Testability 0.75 -> 0.75. Gain: four new scenario groups with existing, discriminating tests (server-markup unit assertions, hydration-error collection, rect-based layout checks). Loss: D2/D3 discrepancies and unchanged carried AC-021/AC-025 items. Same band.
- Traceability 1.0 -> 1.0. The new REQ clauses map cleanly; the only gap remains the carried AC-024/REQ-024 sub-clause coverage, judged exactly as in review-10.

## Defects Found

D1. Overstated necessity rationale for the M03 `form.top` exemption; design.md contradicts itself — `.moai/specs/SPEC-B2C-CONSULT-001/design.md`:L427, L480 (and `scripts/visual-verify.ts`:L2265 `skipReason`) vs design.md:L445 (M03 row) and `visual-verify.ts` M03 `semanticChecks` — text says the notice is "필수(acceptance 의미 검사·CHANNEL_NOTICE)", but M03's semantic checks and design §12's M03 row contain only "카카오 기본 선택, 하단 CTA sticky"; only the desktop `03-A2` check names the notice text, and no REQ/AC mandates a mobile notice. The deviation itself (62px shift, top axis exempted, label "의도된 편차", no approval claimed) is honest and mechanically bounded; the stated reason is not. No owner acceptance of the deviation from `design/exports/M03-*.png` is recorded. — Severity: minor — Class: optional — Required fix: reword §11 L427 / §12.2 L480 to "표시하기로 한 설계 결정이며 M03 semanticChecks가 요구하지는 않는다(desktop 03-A2가 문구만 요구)"; record who accepted the ~62px deviation (or state "미기록"); optionally add to AC-B2CCONSULT-025 (L390) one clause that `M03` `form.top` is exempt under the same "설정된 검증 게이트 기준" qualifier.

D2. AC-009 added scenario overstates "restored" semantics for the not-ready state — `.moai/specs/SPEC-B2C-CONSULT-001/acceptance.md`:L112 vs L69-72 — "정책 미준비 상태에서는 draft가 저장되지도 복원되지도 않고 ... (AC-B2CCONSULT-006의 추가 시나리오와 일치)": AC-006 second added scenario says a pre-existing draft IS restored in that state (read unchanged), and unit test (d) at `consult-view.test.tsx:913` and design §2.3 L91 agree. The AC-009 sentence is only true because its flow starts with no stored draft. — Severity: minor — Class: optional — Required fix: append the precondition ("draft가 저장된 적이 없으므로 복원할 값이 없고") or drop "복원되지도".

D3. AC-010(c) describes a different measurement procedure than the test performs — `acceptance.md`:L128-129 vs `e2e/consult-flow-03.spec.ts`:L789-816 — AC: rects measured after scrolling to the maximum and "최대 스크롤 상태에서" no intersection; test: scroll to max as a precondition, then `scrollIntoViewIfNeeded()` per target and measure/hit-test at that scroll position. The test is arguably stronger for reachability but the criterion text is not literally what is executed. — Severity: minor — Class: optional — Required fix: reword to "각 입력 필드·동의 체크박스를 화면에 스크롤해 들인 상태에서 sticky 영역과 교차하지 않고 ...", or make the test measure at max scroll.

D4. Unattributed measurement figures in design §11 — `design.md`:L427 — "실측 안내 591.6~628.1 · 이름 라벨 648.1~662.1 · 입력창 670.1~726.1" appear nowhere else in the repo (no committed evidence file; `LAYOUT_EVIDENCE_DIR` unset by default; commit message gives only 37px/62px). Arithmetic is internally consistent, so risk is low, but the figures are not reproducible from the committed tree. — Severity: minor — Class: optional — Required fix: cite a command/evidence path (run the e2e with `LAYOUT_EVIDENCE_DIR=.moai/reports/...` and reference `rects-*.json`) or drop the decimals and keep "약 37px / 약 62px".

D5. design §5 file tree omits an existing component — `design.md`:L171-183 — `components/consult/consult-header.tsx` (imported by `consult-view.tsx:31`) is not listed (same class of drift as review-9 D2). Not a budget item (new directory). — Severity: minor — Class: optional — Required fix: add one tree line.

D6. Back-navigation coverage is neither tested nor acknowledged — `acceptance.md`:L104-112, `spec.md`:L75 — base AC-009 scenario ("뒤로가기 후 다시 /consult로 진입") has no named test; the new hydration scenarios cover only full-load/reload. The new REQ-009 clause is correctly limited (no overclaim). — Severity: minor — Class: optional — Required fix: add a one-line note to AC-009 (or design §2.2.1) that back-navigation is expected to follow the client non-hydration path and is not covered by the new tests, or add an e2e `page.goBack()` case.

D7. Documented e2e invocation is POSIX-only; regression-gate bullet omits the two-invocation requirement — `design.md`:L212, `plan.md`:L84, `playwright.config.ts` comment; `acceptance.md`:L421 — `E2E_CONSULT_POLICY_READY=false pnpm test:e2e` does not work in PowerShell/cmd; "회귀 게이트" bullet says the 01/02 e2e must keep passing without saying both modes are required for full coverage (plan.md does). — Severity: minor — Class: optional — Required fix: state a cross-shell form (`cross-env`/`$env:`) and add "(준비 모드 + 미준비 모드 두 호출)" to the Quality Gate bullet.

D8. (carried, review-10 D4) REQ-006 over-long — `spec.md`:L72 — unresolved. Severity: minor — Class: optional — Required fix: keep the normative sentence, move rationale to design §2.3.
D9. (carried, review-10 D5) REQ-024 sub-clauses not named in AC-024 — `acceptance.md`:L370-385 vs `spec.md`:L114 — unresolved; the knife-edge for Traceability. Severity: minor — Class: optional — Required fix: one sentence each for Desktop-Modal focus trap/ESC/return, `aria-describedby`, `aria-live`.
D10. (carried, review-10 D1/D6) progress.md stale vs REQ-006 exception (L2573, L2625); env->prop wiring not page-tested (`app/consult/page.test.tsx` has no `isPolicyReady` assertion); AC-025 pinned SHA `a106ac9`; AC-021 scope — unresolved, optional, unchanged.

No blocking defects. No must-pass failures.

## Regression Check (previous iteration = review-10)

- review-10 D1 (progress.md stale; design L73 wording): design part RESOLVED (design.md L90 now "찾지 못했다(키워드 grep 기준 ...)"), progress.md part UNRESOLVED (carried D10).
- review-10 D2 (AC-005 When imprecise): RESOLVED (`acceptance.md` L51 now "제출 영역(안내 영역 포함)을 클릭·탭하고, 키보드 Tab으로 페이지 전체의 포커스를 이동하면(제출 버튼이 없으므로 제출을 시도하는 조작은 존재하지 않는다)").
- review-10 D3 (draft save timing "제출 시도 시"): RESOLVED (design L86 now lists mount initial write, blur, channel change, marketing change and says the submit handler writes nothing; matches `consult-view.tsx` L311-341, no `persistDraft` in `handleSubmit`).
- review-10 D4/D5/D6: UNRESOLVED, optional, carried as D8/D9/D10 (evaluated in check 6).
- New scope of this iteration (hydration fix, mode switch, mobile layout fix, M03 deviation): audited; no blocking finding; seven minor/optional items D1-D7.

## Gaps (what I did NOT verify)

- Playwright e2e was NOT executed (requires production build + start). The e2e assertions were read, not run; the claim that 4 pre-fix layout tests failed and now pass rests on the commit message, not on my observation. Same for prod-build hydration behavior.
- `pnpm visual:verify` was not executed; the "M03 max deviation 4px PASS" statement (design §12.2 L482) is unverified. Only the static definition (skipMetrics/TOLERANCE/entries) was verified.
- eslint, tsc, prettier, coverage, `next build` not run (commit messages claim 0 findings; unverified here).
- `design.md` was read in full; `plan.md`, `spec.md`, `acceptance.md` in full. `research.md` NOT read (unchanged since review-10; Tier L input gap accepted because it is not in the diff); `progress.md` read only at L2573/L2625.
- D7 verb (status of referenced SPECs) was not re-executed this iteration; relies on review-10's run and the fact that the diff adds no new SPEC id.
- Not verified: the design-mock pixel values (`design/exports/M03-*.png` not opened), real-device/iOS behavior, screen-reader announcement of the `role="status"` notice.
- `backgroundProbe` "5건 (값 변경 1 + 신규 4)" in AC-025 was not re-counted this iteration (unchanged text; only skipMetrics and deletions were re-verified).
- No plan-audit cache hash computed. No cross-model opinion.

## Residual risk

- Margin is 0.007 (< 0.02): FRAGILE. One reviewer weighting the carried REQ-024/AC-024 sub-clause gap (D9) as a Traceability 0.75 would produce 0.80 (FAIL). Cheapest mitigation: a single manager-spec pass fixing D9 (three short sentences) plus D1/D2 (one clause each); a scoped re-audit of those defects would suffice. Per M6 I do not use optional findings to manufacture a FAIL.
- The verdict applies to the working-tree state (4 uncommitted doc files on top of `ef205d3`); it does not transfer if the committed state differs.
- The M03 mobile form sits ~62px lower than the design mock and its `top` axis is excluded from the visual gate; the vertical relation is protected only by the e2e non-overlap test, which was not executed by this audit. No owner acceptance is recorded.
- Hydration fix is verified in jsdom (`renderToString` + `hydrateRoot`) and asserted by prod-build e2e that I did not run; a real-browser regression would only be caught by the e2e run.
- Accepted residuals unchanged from review-10: pre-existing draft left in a tab when the policy flips to not-ready; provisional notice copy; fail-closed default `isPolicyReady=false`.

## Recommendation

PASS (0.857 >= 0.85, Tier L). No must-pass failure and no blocking defect. If the orchestrator wants to remove the knife-edge before the plan->run gate, re-delegate to manager-spec for D9 (AC-024 sub-clauses), D1 (rationale + AC-025 qualifier), D2 (AC-009 precondition) and D3 (AC-010(c) procedure); any edit to spec/plan/acceptance/design changes the plan-artifact hash again, so the confirming re-audit can be scoped to those defects. Run the Playwright e2e in both modes (`E2E_CONSULT_POLICY_READY` unset, then `false`) and `pnpm visual:verify` before relying on the hydration and layout claims.
