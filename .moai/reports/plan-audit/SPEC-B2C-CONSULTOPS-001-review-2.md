# SPEC Review Report: SPEC-B2C-CONSULTOPS-001
Iteration: 2/3
Verdict: FAIL
Overall Score: 0.76 (Tier M threshold 0.80). Improvement over iteration 1 (0.7245): +0.035, no regression, so no STOP signal.

Reasoning context ignored per M1 Context Isolation (none was supplied beyond the task brief; `progress.md` §G dispositions were treated as claims and re-verified).
Audit mode: Claude-only. No `mcp__moai__*` tools were available in this session, so no cross-model convergence was run or claimed. The `moai` CLI was not run.
Tag legend: (a) = text defect the author can fix; (b) = consequence of an undecided user decision no revision can resolve.

## Score computation (harmonic mean)
| Dimension | Score | Band | Basis |
|---|---|---|---|
| Clarity | 0.72 | between 0.50 and 0.75 | G-column gate point undefined (R4); REQ-013 defers its own terms to AC-013 (spec.md:167); "롤백 시점까지" since-when ambiguity (spec.md:154,173) |
| Completeness | 0.78 | 0.75 to 1.0 | all sections and 12 fields present; AC-001 self-application impossible (R2); plan.md:40 stale (R6) |
| Testability | 0.72 | between 0.50 and 0.75 | AC-012 oracle matches the SPEC's own literals (R1); AC-001 self-check fails (R2); AC-013 (바), AC-016 secret check under-specified (R8, R13) |
| Traceability | 0.82 | between 0.75 and 1.0 | REQ/AC 1:1 holds (16/16); AC-001 (4)(5), AC-009 (3)(4), AC-011 s2 carry clauses absent from their REQs (R5) |

H = 4 / (1/0.72 + 1/0.78 + 1/0.72 + 1/0.82) = 4 / (1.3889 + 1.2821 + 1.3889 + 1.2195) = 4 / 5.2794 = 0.7576 -> 0.76 < 0.80.
Sensitivity: giving the author the most generous band in every dimension (0.75/0.80/0.75/0.85) still yields 0.78, so the FAIL does not hinge on rounding.

## Must-Pass Results
- [PASS] MP-1: spec.md REQ-B2CCONSULTOPS-001..016 sequential, no gaps/duplicates (grep `001 ... 016`). AC-001..016 each cite the same-numbered REQ (grep `001->001 ... 016->016`). 16/16, at the Tier M ceiling, not over (spec-workflow.md ceiling table).
- [PASS] MP-2 (judged on the REQ layer in spec.md; ACs are Given-When-Then and were graded under Testability only): Ubiquitous 001/003/012/013, While 002, When 006/014/015/016, Where 004/005/007-011. REQ-013 and REQ-012 are the shall-not form. Compoundness noted at R5/R8, not a MP-2 failure.
- [PASS] MP-3: frontmatter spec.md:1-16, all 12 fields with correct types, quoted semver, `tier: M`. Observations unchanged from iteration 1: `id` fails the literal SSOT regex exactly like the precedent `SPEC-B2C-CONSULT-001`; `related_specs` is an extra field; `§G` is outside the section map.
- [N/A] MP-4: single-project SPEC.
- [PASS] MP-5: D7 verb output: `SPEC-B2C-CONSULT-001 status: in-progress`, `SPEC-B2C-ENGINE-001 status: draft`, `SHOULD: SPEC-B2C-LAUNCH-001 not found` (framed as planned, spec.md:77,82). No BLOCKING (no retired/superseded/archived reference).
- [PASS] MP-6: `grep -c syscall` = 0 in spec.md, plan.md, acceptance.md. progress.md has 1 hit, in the author's own self-check sentence ("`syscall` 0건", progress.md:83), not a use. D8 auto-pass.
- [PASS] MP-7: `grep -n '\[NEEDS CLARIFICATION' plan.md` empty; no research.md (Tier M). Markers exist only in spec.md N1..N8 (8, expected). The `progress.md` hit is a prose mention, not a marker.

## Disposition of iteration-1 defects (verified against current text)
| ID | Disposition | Evidence |
|---|---|---|
| D1 | FIXED | I parsed spec.md:112-131 with awk (`-F'|'`, 8 fields per row). I/G values: 필수/필수 x8 (E-01..07, E-09), 필수/해당 없음 x1 (E-08), D-OPS-12/필수 x8 (E-10..16, E-18), 해당 없음/필수 x1 (E-17). Nothing outside the enum. AC-001 now rejects `필수(처분 결과)`. (But see R2: the same table cannot satisfy AC-001 (1).) |
| D2 | FIXED | I opened `design/exports/03-D-상담-신청-실패.png` myself: contact row `010-****-1234`, four rows (상담 방식/연락처/연락 희망 시간/입력 내용), footer links "개인정보처리방침 / 이용약관 / 고객 문의". F-09, N1 (spec.md:179) and the D-OPS-05 recommendation (spec.md:283) now state (b) = same as export, (a)/(c) differ. `consult-failure.tsx:123` `notSent ? maskContact(contact) : contact` and CONSULT-001 progress.md:4017/4235 confirmed. |
| D3 | FIXED | ENGINE spec.md:52 (resultId only if D-ENGINE-05 picks server verification), :61-64 (blocks "03 상담의 일반 사용자 대상 사용"; LAUNCH takes REQ-B2CENGINE-023), :82, progress.md:158-164 option (a), design.md §9.3 (i)-(iv) all match F-20, §2.3 and the E-17 paragraph (spec.md:135). E-17 no longer pre-empts D-ENGINE-05. New small residue: R7. |
| D4 | FIXED | Both AC-008 commands run exactly as written. Command 1 printed 4 lines (`consult-channel-selector.tsx:43`, `consult-success.tsx:50`, `scripts/visual-verify.ts:2128`, `:2133`); command 2 printed 2 lines (the two product lines). Matches acceptance.md:75. "Does not see" sentence present (acceptance.md:76). |
| D5 | PARTIALLY FIXED | Per-item target and EV-1..EV-7 (spec.md:94-104, table col 6) answer the "no freshness for non-code evidence" defect, and the checker limit is honestly disclosed (spec.md:103, acceptance.md:26). But the commit-SHA target is self-invalidating when the evidence record lives in a tracked file (R3), and the reversion duty has no REQ (R5). |
| D6 | FIXED | Fail-closed rule at spec.md:110, REQ-002 (spec.md:144), AC-002 fixtures (바)(사) (acceptance.md:23-25). |
| D7 | FIXED | REQ-013 is now unconditional (spec.md:167); AC-013 requires equivalence fields on both environments (acceptance.md:112-114). Residue (definition delegated to the AC; field list not exhaustive): R8. |
| D8 | FIXED | AC header (acceptance.md:12), AC-013 preface (:110), AC-014 (:125), DoD (:146) and spec.md Out of Scope (:305) now agree that observation on any host is an operational act outside the AC/DoD. |
| D9 | FIXED | "롤백 사유" and "처분" defined (spec.md:108-109), REQ-006 gains the rollback trigger (:154), REQ-016 records the identification set (:173), AC-006/016 follow. New optional residue R13, R14. |
| D10 | PARTIALLY FIXED | REQ-012 widened to desk/signer contacts and legal detail (spec.md:166) and AC-012 canary set widened to six. But the AC-012 oracle matches the SPEC's own text (R1), and D-OPS-11 option (c) is incoherent with REQ-012 (R9). |
| D11 | FIXED | E-01 is now "테이블 존재" only (spec.md:114); the 0-row baseline moved to E-05 (:118). |
| D12 | FIXED | REQ-003 limits the point to executable/config artifacts and exempts runbook prose (spec.md:145). |
| D13 | FIXED | I re-ran RE on 16 sample lines (output below). Blind spots are listed (acceptance.md:33). Only one uncovered form remains unlisted (R11). |
| D14 | REBUTTAL ACCEPTED | REQ-014 reduced to one obligation (spec.md:168); REQ-001/008/016 stay compound but every AC enumerates the branches. My iteration-1 view ("optional") stands. |
| D15 | FIXED | `route.ts:283-296` read: 503 at 284-289, 409 at 290-295, both before the DB comment at :298. Step 1 validation (:262-) precedes both. AC-015 now says so (acceptance.md:133) and names the `GET /consult` `isPolicyReady` read (`verify-flag-runtime.ts:100-101` confirmed). |
| D16 | FIXED | `deploy.yml:61` plain `pm2 restart "$PM2_APP"` confirmed; trigger is every push to `main`, no paths filter (deploy.yml:3-7). REQ-013 and E-03 cover deploy-triggered restarts; AC-013 (D) fixture. |
| D17 | FIXED | D-OPS-04 option (4) now records the permitted stage, "no record means not allowed at G" (spec.md:219); E-15 and AC-009 follow. |
| D18 | FIXED | REQ-016 now includes "시크릿 설정은 지우지 않고 (회전은 D-OPS-07)" (spec.md:173), matching AC-016. Residue (how "secret still set" is observed): R13. |
| D19 | FIXED | N2 now names D-OPS-01 Q2 (iii) (spec.md:180). |
| D20 | FIXED | REQ-007 drops "새로" and says the five fields are this SPEC's choice (spec.md:158); I checked the five against `lib/db/schema.ts:200-224` (`name`, `channel`, `contactNormalized`, `preferredCallTime`, `createdAt`): all existing columns, nothing invented. AC-007 uses two rows with different times. |
| D21 | FIXED | "처분" defined including 보존 (spec.md:108); AC-006 uses "삭제·표식·보존 중 기록된 방식" (acceptance.md:59). |

Counts: FIXED 18 (D1, D2, D3, D4, D6, D7, D8, D9, D11, D12, D13, D15, D16, D17, D18, D19, D20, D21), PARTIALLY FIXED 2 (D5, D10), REBUTTAL ACCEPTED 1 (D14), NOT FIXED 0, REBUTTAL REJECTED 0. Total 21.
Where I changed my iteration-1 view: none of D1-D21 was wrong. I did not previously notice that E-08's `해당 없음` for G has no stated reason (R10).

## Defects Found
(Line numbers are in the file named. Blocking = correctness or internal consistency of the SPEC's own stated criteria.)

### Blocking
R1. AC-012 oracle matches the SPEC's own text — acceptance.md:104 — The fixed canaries `010-9999-0000`, `010-7777-0000`, `표지이름`, `표지서명자` are written literally in acceptance.md:104 (I ran `grep -rnF` over the repo excluding node_modules: its only hit is acceptance.md:104; `git grep -nF` returns 0 only because the file is still untracked). Once this SPEC is committed (all Tier M plan artifacts are), step (2) "추적 파일 전체에서 `git grep -nF`" matches acceptance.md:104 and AC-012 fails by construction. Test files that embed the fixed canaries would match too. — Severity: major — Class: blocking (a) — Required fix: generate all six canaries at run time like `CANARY-SECRET-<난수>` (do not write fixed literals in the AC), or add an explicit pathspec exclusion for the SPEC directory and the fixture files and say so under "보지 못하는 것".

R2. AC-001 requires a self-application the §2.4 table cannot pass — acceptance.md:19 vs spec.md:112-131 — AC-001 (1) demands that every row has 증명 대상, 보관 위치, 서명 또는 관측 역할, 대상, 무효화 사건 non-empty, and the last sentence says the spec.md §2.4 table "(1)·(2)를 통과해야 한다". The table has columns ID / 증거 항목 / I / G / 근거 / 대상·무효화 사건 only: no 보관 위치 and no 서명·관측 역할 column, and 대상 and 무효화 사건 are merged into one. The author's self-check (progress.md:42, §G D1) verified only the I/G enum. — Severity: major — Class: blocking (a) (the 보관 위치 values themselves depend on D-OPS-11, (b)) — Required fix: restrict the self-application sentence to clause (2) plus the 대상/무효화 사건 column (and say the split of the merged column is by " / "), or add the two columns with their values left as "D-OPS-11 결정 전" / role names taken from the D-OPS 결정 주체 lists.

R3. READY target = commit SHA is self-invalidating — spec.md:96, :119-121, :126-129, :131 with `deploy.yml:3-7` — EV-1 ("활성화 대상 커밋이 달라짐, `main` push마다 배포") applies to E-06, E-07, E-08, E-13, E-14, E-15, E-16, E-18. The evidence table is a tracked runbook (acceptance.md:17) and under D-OPS-11 (a) or (c) its status stays in a tracked file. Recording READY is itself a commit to `main`, `deploy.yml` has no `paths` filter, so that commit is deployed, EV-1 fires, and the item reverts to UNVERIFIED. The same circularity the SSOT calls the SHA-placeholder hazard. AC-002 (마) would then fail every legitimately recorded table. — Severity: major — Class: blocking (a) — Required fix: define the code-type target as the content the item actually covers (for example the file set or content hash of the covered product paths) so a records-only commit does not change it, or state which commits do not count as EV-1.

R4. The G column has no enforcement point — spec.md:144, :106, :185 — REQ-002 blocks only the step that sets `CONSULT_POLICY_READY=true`. If the internal test runs on the production host (D-OPS-12 (a)/(b)) that step has already run, and G has no `true`-setting step left. The API is open to anyone as soon as the flag is true (F-03, spec.md:43), so I and G differ only in who is told. N7 asks whether the I/G labels suffice but never says G is un-gated. REQ-002 "대상 단계(I 또는 G)" therefore only means something when the first activation is for G. — Severity: major — Class: blocking (a) for the wording, (b) for the real answer (LAUNCH owns stage definition) — Required fix: state in §2.4/REQ-002 that REQ-002 gates the flag-setting step only and that the I-to-G transition gate belongs to LAUNCH, and add that to N7. Do not invent a mechanism.

R5. Obligations that live only in a definition or an AC — spec.md:103 and :110 vs :143; acceptance.md:19 (4)(5), :81, :100 — (i) The "procedure steps revert items to UNVERIFIED" duty is stated in the §2.4 definition and checked by AC-001 (5), but no REQ says it, yet it is what keeps the READY model alive (AC-002 admits the checker cannot do it: acceptance.md:26). AC-001 (4) ("D-OPS-12 칸은 필수로 취급") likewise is a runbook sentence not in REQ-001. (ii) AC-009 checks removed/kept elements and the permitted stage for option (4), while REQ-009 covers only elements resolved to a destination (spec.md:160). (iii) AC-011 s2 accepts the secret step "같은 재시작 안에 있거나 그보다 먼저", REQ-011 says "같은 재시작에 함께" (spec.md:165). — Severity: major for (i), minor for (ii)(iii) — Class: blocking (a) for (i); optional for (ii)(iii) — Required fix: add the reversion duty to REQ-001 or REQ-002; align AC-011 s2 with REQ-011.

### Optional / minor (surfaced, left to the orchestrator)
R6. Stale cross-references — plan.md:40 vs acceptance.md:20 and progress.md:42-47 — plan §B still says D-OPS-12 blocks AC-001, though §G D6 says that was removed. spec.md:275 lists E-08 as blocked by D-OPS-12, but E-08's I cell is a fixed `필수` (spec.md:121). spec.md:274 option (a) "G와 같은 항목" is false for E-08 and E-17. — minor — optional (a).

R7. E-17 invalidation delegated to events ENGINE-001 does not define — spec.md:130 — `grep 무효화` over the ENGINE-001 files finds only `resultId`-rotation text, no READY-invalidation events. E-17 is therefore governed by EV-6 only. — minor — optional (a): say it is invalidated when the data/engine/gold-set versions recorded in design.md §9.3 differ from current.

R8. REQ-013 / AC-013 details — spec.md:167; acceptance.md:112-119 — (i) REQ-013 hands the definition of "동등" to AC-013 (requirement layer depends on the verification layer). (ii) The five equivalence fields are not exhaustive (Node version, standalone vs `next start`, OS user are absent) and the "does not see" list does not say so. (iii) Fixture (바) has no stated exit code, and the required "경고 처리 단계" has no content a reviewer can test. (iv) It is undefined whether E-03 can be READY when (D) is `소실`. — minor — optional (a).

R9. D-OPS-11 option (c) vs REQ-012 / AC-012 (3) — spec.md:166, :268; acceptance.md:106 — REQ-012 puts forbidden-value records "저장소 밖 또는 비추적 위치" and AC-012 (3) checks that location. Option (c) "저장소 안에 전부 (공개 가능 내용만)" names no such location. — minor — optional (a)/(b).

R10. Author-set exemptions outside D-OPS-12 — spec.md:121, :130 — E-08 G = `해당 없음` has no stated reason (the rationale column explains only why I needs it); E-17 I = `해당 없음` is justified by F-20. Both are waivers the user did not decide. — minor — optional (a): add a reason or route E-08 G through D-OPS-12.

R11. AC-003 / AC-008 blind spots — acceptance.md:33, :76 — I tested `CONSULT_POLICY_READY = \`true\`` (backtick template literal): NO MATCH, not listed among blind spots. AC-008 does not say that tracked docs also carry the promise (`.moai/docs/runtime-runbook.md`, CONSULT-001 `design.md:438-441`). — minor — optional (a).

R12. AC-014 wording — acceptance.md:124; spec.md:254 — "값 노출 명령 0개" is a judgement: the cited runbook §12.4 line is `pm2 jlist | node -e ...` that filters fields (runbook:412-424) and would fail a literal grep for `pm2 jlist`. "`progress.md` Claim 11" is unqualified (it is CONSULT-001 progress.md:2172, not this SPEC's). — minor — optional (a).

R13. AC-016 and REQ-006 residue — acceptance.md:138; spec.md:154,173 — "효과적 시크릿은 여전히 설정 상태" has no stated non-leaking observation method (with the flag false the app never reads the secret, so only the harness env shows it). "롤백 시점까지 접수된 행" does not say since when (since activation or all rows ever, E-05 baseline). REQ-006 says the procedure "바꾸고" rows, §2.4 says 보존 leaves them unchanged. — minor — optional (a).

R14. Rollback minimum kinds are an author policy — spec.md:109, :262 — D-OPS-10 Q3 lets the user add kinds and choose the declaring role, but the four minimum kinds (esp. (ii) "REQ-014 전제 변경 확인") are not offered as an option to accept. No invented value; it is a policy choice. — minor — optional (b): list the four as the baseline in D-OPS-10 for confirmation.

R15. REQ-002 wording overstates — spec.md:144, :103 — READY includes "no invalidating event since observation", but the checker (acceptance.md:26) reads only status and the supplied target value. The SPEC says so honestly; the gate is procedural. State it in REQ-002 rather than only in the AC. — minor — optional (a).

## Soundness of the READY model (answering the brief)
- Honest? Yes. spec.md:103 and acceptance.md:26 both state the checker cannot detect events and that reversion is a procedural duty; I found no overclaim in the ACs.
- Sufficient? Partly. For code-type targets the checker does catch a changed target (AC-002 (마)); for the other six target kinds it cannot, so staleness protection rests on a runbook sentence verified only by document presence (AC-001 (5)). That is acceptable for a plan-phase procedure gate provided the sentence has a REQ (R5) and the code target does not defeat itself (R3). The model is falsifiable per fixture, but only on status and target value, not on events.
- Unresolvable by revision (b): who actually performs the reversion in practice, and the I-to-G gate (R4), depend on LAUNCH/process decisions.

## Oracles re-run (output quoted)
- AC-003 (`99993bf..HEAD`, exact command): `0` lines. Range `f7ef4ec..99993bf`: one line, the `lib/env.ts` secret-description string (matches acceptance.md:32). Sample test with the exact RE, 16 lines: MATCH `CONSULT_POLICY_READY=true`, `="true"`, `process.env.… = "true"`, `process.env["…"] = "true"`, `"ENABLE_CONSULT_FLOW": "true"`, `ENABLE_CONSULT_FLOW: "true"`, `export …=true`, `: 'true'`, `{CONSULT_POLICY_READY:true}` (boolean, harmless false positive); NO MATCH `=false`, `= TRUE`, `??= "true"`, `ENV … true`, backtick `true` (unlisted, R11), `"True"`, `=1`. Claims at acceptance.md:33 hold.
- AC-004 s2: grep 1 -> `components/consult/consult-consent-group.tsx:68`; grep 2 -> 0 lines. Matches.
- AC-008: command 1 -> 4 lines; command 2 -> 2 lines. Matches acceptance.md:75. Files holding the phrase (non-ts): `.pen`, runbook, MERGE-CHECKLIST, APPROVAL-PACK, CONSULT-001 spec/design/progress (R11).
- Structure: 16 REQ, 16 AC 1:1, every AC block has 검증/통과 판정/선결 (16/16 `YYY`). All E-01..18, F-01..22, EV-1..7, D-OPS-01..12, N1..8, AC/REQ ids referenced are defined; no dangling id. `spec.md` `## 설계 대안` option labels vs progress.md Open Decisions (D-OPS-01..12): no divergence found at label or recommendation level.
- Binding constraints: `git status --short` -> only the two untracked SPEC dirs; HEAD `99993bf`. HISTORY (spec.md:20-21) makes no commit/audit/test claim. `grep https?://` and time-estimate patterns: none. No real desk, SLA, status name, wording, retention, URL or number found. "배포 완료" vs "일반 사용자 공개 가능" kept distinct (spec.md:29-33, REQ-001). I/G separation uses only D-OPS-12 and two author-set exemptions (R10). LAUNCH/CONSULTOPS boundary coherent (spec.md:76-83; `deploy.yml:96-101` still tests "서비스 준비 중입니다"; F-14 `app/page.tsx` uses `computeDiagnosisFlags` only; deploy.yml untouched). No production access claimed.

## Citations verified (opened and compared; about 40 groups, new or changed this iteration unless noted)
`scripts/visual-verify.ts:2128-2133, 2199-2201, 2299-2306, 2509-2513`; `components/consult/consult-footer.tsx:10-13, 25, 30-39` (footer `hidden … md:flex`, 3 `role="link"` `aria-disabled` spans with "준비 중"); `consult-outcome-frame.tsx:84`; `consult-view.tsx:376, 413, 418, 435, 609`; `consult-failure.tsx:12-23, 41-42, 51-58, 123`; `scripts/verify-flag-runtime.ts:100-101`; `.github/workflows/deploy.yml:3-7, 58-62, 74-78, 94-102`; `app/api/consultations/route.ts:178-190, 255-300, 360-369`; `lib/env.ts:136-147`; `instrumentation.ts:19-38`; `lib/consult/schema.ts:23`; `lib/consult/consent-policy.ts:8, 10-15`; `lib/diagnosis/flags.ts:22-24, 63-70`; `components/consult/consult-success.tsx:76-78`; `consult-duplicate.tsx:25-32, 102-104`; `consult-consent-group.tsx:65-72, 127, 168`; `app/consult/page.tsx:42-48`; `lib/db/schema.ts:198-226`; `scripts/verify-remote-consult-cleanup.ts:250`; ENGINE-001 `spec.md:52, 59-64, 80-83, 138`, `progress.md:156-165`, `design.md:167-182`; CONSULT-001 `progress.md:4017, 4233, 4235`, `design.md:149, 412, 418, 438-441, 449`, `spec.md:113, 135-136, 142, 149-151`; `.moai/docs/runtime-runbook.md:317-324, 388-392, 412-424, 427-435, 591-594`; Next.js `environment-variables.md:266-276`; design export PNG `03-D-상담-신청-실패.png`; `.gitignore` (`.moai/state/` ignored at :203).
Not verifiable by me: production state after the merge; `.pen` internals; `moai` CLI outputs; PM2 `restart` behaviour on any host; "repository is public"; `route.ts:159-173` stale-comment claim and the PM2 doc sentence were verified in iteration 1 and not re-fetched.

## [NEEDS CLARIFICATION] markers (N1..N8): which must be answered before Implementation Kickoff
Per the MP-7 convention every marker needs an explicit disposition before kickoff. Of the eight, these shape run-phase M1 regardless of the D-OPS answers and should be answered first: N7 (who owns the I/G stage definition, directly tied to R4 and AC-001), N6 (ownership and order of changes against ENGINE-001's `route.ts`/`schema.ts`), N8 (does the internal test accept the open API, E-08). N1, N2, N3, N4, N5 are conditional on D-OPS-05, 01/02/03/10, 03(a)/04(1), 03(b), 03(c) respectively; they can be dispositioned as "decide when that D-OPS is chosen". D-OPS-11 and D-OPS-12 must be decided before M1 (plan.md:60), and they are not markers.

## Commands run (read-only)
`git status --short`, `git rev-parse`, `git diff -U0` (AC-003 exact), awk table parse, grep/awk structural checks (REQ/AC mapping, id scan, 검증 fields), AC-004/008 greps, the AC-003 RE on 16 samples, D7 and D8 verbs, `grep -rnF` and `git grep -nF` for the canaries, `sed -n` on the cited files, Read of the four SPEC files, the iteration-1 report, and the 03-D export PNG. No SPEC, code or config file was edited; the only file written is this report.

## Recommendation
Needs one more revision (iteration 3 is the last allowed). Fix R1-R5 (all text-fixable by manager-spec): make the AC-012 canaries run-time values, reconcile AC-001 with the §2.4 table columns, define a non-self-invalidating target for code-type evidence, state the REQ-002/G gate scope and add it to N7, and move the reversion duty into a REQ. R6-R15 may be taken or left. A confirming re-audit can be scoped to R1-R5 plus the regression of D5/D10. The D-OPS-01..12 decisions and the eight markers remain user decisions, not defects.
