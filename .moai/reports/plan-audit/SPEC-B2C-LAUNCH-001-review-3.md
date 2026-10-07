# SPEC Review Report: SPEC-B2C-LAUNCH-001
Iteration: 3/3 (FINAL)
Verdict: PASS
Overall Score: 0.81 (Tier M threshold 0.80; iteration 2 = 0.75, iteration 1 = 0.88)

Reasoning context ignored per M1 Context Isolation. The delegation prompt's description of the author's corrections was treated as a claim. Every status below comes from the artifacts.

- Audited commit: `ba4602e0520bd19e8d6c1c61e6b9002995d4c930` (branch `plan/b2c-launch-readiness`). `git rev-parse HEAD` matched.
- Blob SHAs: verified with both `git rev-parse HEAD:<path>` and `git hash-object` (the working tree equals the commit).
  - spec.md `6fba2af8…`
  - plan.md `99cda75e…`
  - acceptance.md `e67a8d24…`
- Tier M inputs: spec.md (367 lines), plan.md (158), acceptance.md (147). progress.md (271) and RESUME.md §11-§12 were read as context only and are not audit subjects. design.md and research.md are absent, as expected for Tier M.
- Audit mode: Claude-only. `audit_multi`, `codex_audit` and `glm_audit` were not called, and no audit cache was stored.
- Scope: iteration-3 contract. This covers the D-01..D-15 delta, a regression check of the 5th/6th/7th corrections, and the user-selected scope reduction. No score is carried over from earlier iterations; all four dimensions were re-scored on the current text.

## Score computation (harmonic mean)

| Dimension | Score | Rubric Band | Evidence |
|---|---|---|---|
| Clarity | 0.70 | 0.50–0.75 | Both iteration-2 divergent-reading areas are gone. The stage table has 3 host states (spec.md:137-139) and L-08's per-surface rule is consistent (spec.md:174, :319). Remaining issues: one start-condition clause with two readings (N-01, spec.md:142); S2 G governance between D-LAUNCH-09 and D-OPS-04 is unstated (N-04); §2.5 vs §2.4 wording (N-03); REQ-002 is now longer (D-11, spec.md:197). None of these makes core implementation unpredictable, but N-01 can yield a divergent checker on an off-policy input. |
| Completeness | 0.90 | 0.75–1.0 | All sections are present: HISTORY spec.md:18-26, Why §1, Scope §2, GEARS REQs §3 spec.md:190-220, and the ACs in acceptance.md. There are five `### Out of Scope —` H3s, each with a `-` bullet (spec.md:338-356). All 12 frontmatter fields are present. Deductions: the I-column judgment rule for L-08 and L-02 under the local judgment is undefined (N-02), and an unapproved proposal sits in the normative body (spec.md:306, D-01 residual). |
| Testability | 0.80 | 0.75 | All 16 ACs carry 검증/통과 판정/선결. Weasel-word grep: 0 hits. Fixture counts match their claims: AC-002 has 19, verified as 4 exit-0 + 15 non-zero; AC-008 has 10, verified as 2 pass + 8 reject. Deductions: no fixture covers the N-01 case or `production` + an out-of-enum stage (N-06). AC-015 scenario 2's S2 expectation depends on an undefined meaning of "확정" vs D-LAUNCH-09 G (1) (N-04). Iteration-1 D1 is still open (D-14). |
| Traceability | 0.85 | 0.75–1.0 | REQ↔AC is 1:1 (16/16). All 25 sampled sibling `path:line` citations resolve to the cited content (check 4). The D-LAUNCH-07 provenance is restored. Deductions: the D-LAUNCH-09 I (2) decision has no consuming rule after the local reframing (N-02). The REQ-level hook for local start conditions (1)-(4) is indirect (D-03 residual). Stale citations remain in the non-audited progress.md (D-07 residual). |

H = 4 / (1/0.70 + 1/0.90 + 1/0.80 + 1/0.85) = 4 / (1.4286 + 1.1111 + 1.2500 + 1.1765) = 4 / 4.9662 = 0.8054 → **0.81**

Sensitivity: the result is close to the threshold. A Clarity of 0.65 would give 0.79 (FAIL). 0.70 was chosen because the remaining ambiguities, unlike iteration 2's D-03 and D-04, are either resolved consistently by a reasonable engineer or affect only off-policy inputs (see N-01).

Score trend: 0.88 (pre-decision draft) → 0.75 → 0.81. This is not a regression versus iteration 2, so no STOP signal is emitted.

## Must-Pass Results
- **[PASS] MP-1 REQ number consistency.** `grep -oE '^- \*\*REQ-B2CLAUNCH-[0-9]{3}\*\*' spec.md` returns `001 … 016`: sequential, no gaps or duplicates, 3-digit padding. AC headers map 1:1 (`001->001 … 016->016`, acceptance.md).
- **[PASS] MP-2 GEARS format.** Judged on the requirement layer only (spec.md REQ-XXX).
  - While: REQ-002, 008 and 012 (spec.md:197, 203, 210).
  - When: REQ-009 and 014 (:207, :215).
  - Where: REQ-011, 013 and 016 (:209, :214, :220).
  - The rest use the ubiquitous "<artifact>은/는 …한다" form.
  - REQ-002 and REQ-008 are compound but each clause keeps a GEARS shape (clarity note D-11).
  - Given-When-Then entries in acceptance.md are ACs and were not graded here.
- **[PASS] MP-3 YAML frontmatter** (spec.md:1-16).
  - All 12 canonical fields are present: `id`, `title` (quoted), `version: "0.1.0"`, `status: draft`, `created: 2026-10-02`, `updated: 2026-10-04`, `author`, `priority: P1`, `phase: "v0.20.0 target"`, `module`, `lifecycle: spec-anchored`, `tags` (string).
  - Optional fields: `tier: M`, `related_specs`. No rejected aliases are used.
  - Carried note: the `id` regex is the project-wide precedent (D-15).
- **[N/A] MP-4 Language neutrality.** The SPEC covers a single project (Next.js/TS).
- **[PASS] MP-5 D7 cross-SPEC reconciliation.** No referenced SPEC is retired, superseded or archived, so there is no D7 BLOCKING finding. Statuses per `grep -m1 '^status:'`:
  - CONSULT-001: in-progress
  - CONSULTOPS-001: draft
  - DIAGNOSIS-001: completed
  - ENGINE-001: draft
  - RESULT-001: completed
  - PILOT-OPS-001: completed
  - PILOT-READY-001: completed
- **[PASS] MP-6 D8 cross-platform.** `grep -c syscall` → 0 in spec.md, plan.md and acceptance.md.
- **[PASS] MP-7 Clarification gate.**
  - `grep -c 'NEEDS CLARIFICATION'` → plan.md 0; research.md does not exist (Tier M).
  - spec.md holds 11 markers (N1-N11, spec.md:226-236). They are outside MP-7's binding scope but must be surfaced to the user before Implementation Kickoff Approval (see the status table below).

## Per-defect status (review-2 D-01..D-15)

| ID | Prior class | Status | Evidence (current artifacts) |
|---|---|---|---|
| D-01 decision-record reversal | blocking | **RESOLVED** (blocking substance). The literal (a)/(b) fix was not executed; the residual is optional. | **Decision record:** `diff` of the nine `D-LAUNCH-0N` decision lines at `c89dae7` vs HEAD returns IDENTICAL. progress.md:66 again reads "진단 표면 전용 사유는 추가하지 않는다", and spec.md:305 restates it verbatim. **Normative scope:** (e)(f) appear on no normative surface. The L-06 row (spec.md:172) lists only roles and reasons per D-LAUNCH-07. acceptance.md:118 says "L-06 사유 목록에 넣지 않으며 이 AC의 판정 대상이 아니다", and plan.md:127 says the same. **False "unchanged" claims:** plan.md:40 now discloses the 2nd-correction change. spec.md:25 (5th HISTORY) declares the 2nd/3rd/4th-entry claims inaccurate for D-LAUNCH-07, so past entries are preserved and corrected in a new entry. **Residual:** a labelled "후속 변경안(확인 대기 — 결정이 아니다)" remains in the body (spec.md:306). See check 4 below. |
| D-02 D-OPS-04 scope misattribution | blocking | **RESOLVED** | **CONSULTOPS side:** CONSULTOPS spec.md:225 defines (d)(e)(f) as "03 계열 데스크톱 푸터의 고객 문의 / 같은 푸터의 개인정보처리방침 / 이용약관". **LAUNCH L-08 (spec.md:174):** "S1의 G 판정은 D-LAUNCH-09 결정 … 과 이 요소별 기록으로만 … D-OPS-04의 확정 여부와 무관" and "S2 … D-OPS-04의 6개 요소로 판정". **Same rule elsewhere:** spec.md:319, plan.md:102 and acceptance.md:130-133 (S1 BLOCKED only on (나); S2 BLOCKED only on (가)(다)). **Consistency:** this agrees with LF-13 (spec.md:60), N5 (:230) and plan.md:51. |
| D-03 local form vs stage model | blocking | **RESOLVED**, with an optional residual | **Stage table:** 3 rows with no `local` form (spec.md:137-139). The independent `awk` parse shows NF=7 and 0 empty cells for each row, and all 3 vector cells match the AC-001 regex. **Definitions:** "운영 호스트의 세 상태만 정의" (spec.md:133); separate "로컬 시험 판정" with 5 start conditions and an I-signature rule (spec.md:141-145). **Requirements:** REQ-001 (spec.md:196) separates the two. REQ-008 (spec.md:203) now has a local consumer: "참여자에게 로컬 시험의 시작을 안내해서는 안 된다". **Fixtures:** AC-008 [로컬] (마)(바)(사)(차) and AC-002 [로컬] (차)(타)(너)(더). **Residual:** REQ-008's local prohibition triggers only on a missing or invalidated signature. Start conditions (1)-(4) bind through the §2.4 definition, AC-001 (4) and AC-002, not through a REQ prohibition. Optional, following the review-2 D-06 precedent (a necessary condition, not an authorization). |
| D-04 L-08 G statement conflict | blocking | **RESOLVED** | spec.md:319 now says S1 G is judged "D-LAUNCH-09 결정과 … 요소별 목적지 기록(L-08)으로만 … D-OPS-04의 확정 여부와 무관" and S2 G is "BLOCKED … S2를 열 때만". acceptance.md:133 선결 is now a single statement: S1 is judged by D-LAUNCH-09 plus element records; S2 is additionally BLOCKED by D-OPS-04 and "S1에는 적용되지 않는다". The `grep '01·02·03 공유'` hits are only the historical HISTORY line (spec.md:23) and the correction note itself (spec.md:319). |
| D-05 local output token | optional | **RESOLVED** | spec.md:128: "출력 결과에만 나타나는 표지 … 기록 상태(READY / BLOCKED / UNVERIFIED)도 표의 I·G 칸 값 … 도 아니며 … 기록의 상태 칸에 이 표지가 있으면 열거 밖 값으로 거부". AC-003 fixture (바) tests this (acceptance.md:29-31). |
| D-06 production-I not tied to D-LAUNCH-01 | optional | **PARTIALLY RESOLVED** | spec.md:138: "현재 결정(D-LAUNCH-01 (e))에서는 이 단계가 일어나지 않는다 … (e) 밖의 옵션으로 바뀔 때만 이 단계가 쓰인다". The checker contract still accepts `production` + `I` with no decision input (REQ-002, AC-002 (카)). No sentence says this is enforced by procedure (N11) rather than by the checker. |
| D-07 stale sibling citations | optional | **RESOLVED** in the audited artifacts; residual in progress.md | Verified by `sed -n`, 25 citations in total. **ENGINE spec.md:** :63 (막는 것 ①), :67 (처리하지 않는 것 — smoke), :68, :132 (REQ-B2CENGINE-023), :144 (N5). **ENGINE design.md:** :184 (`reviewEnabled`), :242 (legal review). **CONSULTOPS spec.md:** :58 (F-14), :66 (F-22), :80 (§2.2), :87, :117-118 (I/G definition and limit), :129 (E-08), :193 (N7), :225 (D-OPS-04), :281/:285 (D-OPS-12 timing). **DIAGNOSIS spec.md:** :90, :99, :104. **DIAGNOSIS acceptance.md:** :55. **DIAGNOSIS plan.md:** :26, :69. plan.md:15 now says "커밋된 draft", and `grep '미추적' plan.md` returns 0. Residual (non-audited): progress.md:221 (CONSULTOPS ":112,274-278") and :227 (ENGINE ":61") are still stale. |
| D-08 AC-001 vocabulary rule | optional | **RESOLVED**, with a minor residual | acceptance.md:19 (2) defines the regex `^(진단 게이트: (닫힘\|열림), 상담 화면: … \|D-LAUNCH-03 Q[12] 집합)$`, and the independent parse shows 3/3 MATCH. Residual: REQ-001 (spec.md:196) still requires vectors written "§2.3의 어휘로", while AC-001 accepts reference tokens (minor, optional). |
| D-09 HISTORY integrity | optional | **PARTIALLY RESOLVED** | The 3rd HISTORY line is byte-identical to `9a586eb`, and the 1st/2nd/4th lines are identical to `3c56b47`; corrections live only in the new entries (spec.md:25-26). The grep claim at spec.md:22 ("사고 유형 … grep 0건") is still literally false: `grep -c '사고 유형' spec.md` → 1, which is the line itself. It was kept unchanged as past HISTORY; this is consistent with the first half of the review-2 fix, but the reworded claim was not added to the new entry. |
| D-10 undisclosed local consequence | optional | **RESOLVED** (author side; user confirmation pending) | spec.md:144 states explicitly that R-02/R-03 and L-02, L-03, L-04, L-06, L-07, L-08 (S1) and L-09 are required for the S1 local test, and recommends user confirmation (unconfirmed decision #4). |
| D-11 REQ-002 compound subjects | optional | **UNRESOLVED** (optional; worse) | spec.md:197 now also carries the request-form contract (6th correction): three subjects, nested conditionals and a 4-way rejection list. |
| D-12 ENGINE matrix column label | optional | **RESOLVED** | spec.md:306 "(a) 규칙 근거 또는 (f) 정확도 기준 충족" matches ENGINE acceptance.md:193. |
| D-13 dangling section reference | optional | **RESOLVED** | plan.md:110 cites "로컬 시험 판정" and "로컬 시험 판정과 운영 단계의 구분"; both exist (spec.md:141, :145). `grep '첫 내부 시험과 운영 노출의 구분'` → 0. |
| D-14 (carried iteration-1 D1) | optional | **UNRESOLVED** (optional) | acceptance.md:104 is unchanged: "`//` 주석 줄은 일치하지 않는다" without stating that this depends on the separate comment-line filter. |
| D-15 (carried iteration-1 D2) | optional | **UNRESOLVED**, N/A | The SPEC-ID regex is the project-wide precedent; the fix belongs to the SSOT. |

Summary: all 4 blocking defects (D-01..D-04) are resolved. Of the 11 optional defects, 6 are resolved (D-05, D-07 audited part, D-08, D-10, D-12, D-13), 2 are partially resolved (D-06, D-09) and 3 are unresolved (D-11, D-14, D-15). Per the review-2 precedent (carried optional items do not cause FAIL), the unresolved optional items do not trigger the auto-FAIL clause, which applies to blocking defects.

## Directed checks

### 1. Regression check: 5th/6th/7th corrections
- **Local judgment vs production stage model — consistent.**
  - Stages are host states only (spec.md:133).
  - The request form is fixed by the execution environment (spec.md:129-132).
  - The rejection set is (i) missing or out-of-enum environment, (ii) `local` + `I`, (iii) `local` + `G`, (iv) `production` + no stage or an out-of-enum stage. This matches REQ-002 (spec.md:197) and AC-002 (파)(하)(거)(러)(머).
  - The signature environment must match the request form: REQ-008 (spec.md:203), AC-008 (자)(차).
  - New ambiguity: N-01. Undisclosed applicability consequences: N-02.
- **S1/S2 D-OPS-04 ownership — consistent** across L-08, the D-LAUNCH-09 cross-reference, N5, LF-13, plan M2 and AC-015 (see D-02 and D-04). The remaining gap is S2 G governance (N-04).
- **L-06 / D-LAUNCH-07 reasons — consistent.** L-06 (spec.md:172), REQ-014 ("L-06이 기록한 목록", spec.md:215), AC-014 (acceptance.md:118-119: four default reasons, "BLOCKED가 아니다") and plan M5 (plan.md:127) agree, and none includes (e)(f).
- **REQ/AC counts — 16/16** (MP-1).
- **AC-002 has 19 fixtures.**
  - Unique Given labels: 19.
  - Then partition: exit 0 = (가)(바)(사)(차) = 4. Non-zero = (나)(다)(라)(마)(아)(자)(카)(타)(파)(하)(거)(러)(머)(너)(더) = 15.
  - The Then sentence "열다섯 … 넷 … 열아홉" (acceptance.md:25) is correct.
  - (차) and (러) use the same record and differ only in the stage field.
  - Fail-closed handling of R-02 and R-03 (I = 결정 대기) is consistent with (너)(더) and spec.md:144.
- **AC-008 has 10 fixtures.** Unique labels: 10; 2 pass, (가) and (마), and 8 reject (acceptance.md:63).
- **Approval ordering / Pre-flight — no contradiction in the audited artifacts.** plan.md:63 is a run-start checklist item ("plan-auditor PASS와 Implementation Kickoff Approval 완료"). plan.md:22 and :63 place the N9 and progression-mode choice "승인 때". RESUME §11 [K-전]/[K-시]/[K-후] (RESUME.md:195-202) is a non-normative reading of the same wording and does not conflict with plan.md. plan.md was unchanged by the 7th correction.
- **Stale counts and references.** The "열다섯" and "열일곱" hits are only in historical HISTORY lines (spec.md:24, :26) and the correct AC-002 sum sentence. No dangling section titles remain in the audited artifacts.
- **Pre-existing, newly reported.** N-05: the N2 status prose contradicts the R-01 row.

### 2. Independent parses (claims verified)
```
stage table: 137/138/139 NF=7 empty=0, vectors MATCH AC-001 regex 3/3
definition table: rows=14, NF9=14, I/G out-of-enum=0
combos 필수/필수=8, 결정대기/필수=2, 필수/해당없음=1, 필수/결정대기=1, 해당없음/결정대기=1, 결정대기/결정대기=1
```
These are identical to acceptance.md:20, acceptance.md:26 and progress.md:140-141.

### 3. [NEEDS CLARIFICATION] N1..N11 and the 5 unconfirmed user decisions (not resolved — open)

| Item | Where in the artifacts | Status per artifacts |
|---|---|---|
| N1 stage-definition ownership transfer | spec.md:226, :242 | open |
| N2 three usages of "내부 시험" | spec.md:227, :243 | partially resolved (LAUNCH side); stale prose (N-05) |
| N3 E-08 G / E-17 I | spec.md:228, :244 | partially resolved (value); ownership open |
| N4 DIAGNOSIS-001 smoke trigger | spec.md:229, :245 | open |
| N5 01·02 footer ownership | spec.md:230, :246 | open ("확인 대기"); now carries unconfirmed decision #2 |
| N6 ENGINE runtime gate vs table | spec.md:231, :247 | open |
| N7 REQ-B2CCONSULTOPS-013 scope | spec.md:232, :248 | open (handled neutrally via R-04) |
| N8 partial rollback | spec.md:233, :249 | open |
| N9 run-phase commit route | spec.md:234, :250 | open by design (decided at Kickoff) |
| N10 Tier ceiling | spec.md:235, :251 | open; 16/16 still at the ceiling |
| N11 enforcement limit | spec.md:236, :252 | open |
| U1 (e)(f) confirm or discard | spec.md:306, plan.md:36/127, acceptance.md:118 | 확인 대기; not blocking L-06, M5 or AC-014 |
| U2 LAUNCH owns 01·02 footer element records | spec.md:230, :246 | 확인 대기 (M2 prerequisite) |
| U3 local I signature and signer set | spec.md:143, acceptance.md:64 | 확인 대기; AC-008 (마)(바)(사) signer part BLOCKED |
| U4 local test requires R-02/R-03 and L-06/L-07/L-09 | spec.md:144 | confirmation recommended; also see N-02 |
| U5 `local` + stage rejection; extra items for non-first surfaces | spec.md:132, :142 (pointer :141) | confirmation recommended; see N-01 |

None of these are resolved by the artifacts. They are not MP-7 failures, because the markers live in spec.md and MP-7 binds only plan.md and research.md. They must go to the user through the orchestrator before Implementation Kickoff Approval.

### 4. Scope-reduction caveat (c): does "kept as unapproved proposal outside L-06" satisfy D-01?
- **Substantively, yes** for the blocking defect. The harm D-01 named was threefold:
  1. a recorded user decision was rewritten;
  2. the change had no deciding role or date;
  3. four statements claimed nothing changed.
  
  (1) is reverted byte-for-byte. (2) is now honestly disclosed as unconfirmed (spec.md:306) instead of being presented as a decision. (3) is corrected in new entries. No normative surface (L-06, REQ-014, AC-014, M5) depends on (e)(f).
- **Literally, no.** Review-2's required fix offered exactly two routes: (a) a separate dated decision entry naming the deciding role, or (b) removal of (e)(f) from spec/plan/acceptance/progress. Neither was executed. The labelled proposal text, including a drafted "확인 방법 초안", still sits in the D-LAUNCH-07 section of the normative spec.md body (spec.md:306), with pointers in plan.md:36/127 and acceptance.md:118. This is now an optional scope-hygiene residual, not a fidelity defect.
- **Fidelity caution (outside the audited artifacts, advisory).** progress.md:187 and RESUME.md:230 restate review-2 proposal (c) as "D-LAUNCH-07 원 결정 복원·추가 2종은 미승인 제안으로 유지". Review-2 (c) actually reads "Restore the D-LAUNCH-07 decision text, and either obtain a recorded deciding role for (e)(f) or remove them" (review-2:240).
  - progress.md:181 records that the user adopted review-2 (a)(b)(c) "그대로".
  - progress.md:189 then attributes the "keep as unapproved proposal" route to a user instruction ("사용자가 … 지시했으므로").
  - That attribution cannot be verified from any artifact; only the choice "① 범위 축소 확정 후 재감사" is recorded (progress.md:177).
  - The audited spec/plan/acceptance do not repeat the attribution, so this is not a SPEC defect. The orchestrator should nonetheless settle U1 with the user via AskUserQuestion (confirm with a decision record, or discard), rather than treat "keep as proposal" as a user decision. This is the same failure class as the original D-01.

## Defects Found (structured defect-list)
Prior-iteration carry-overs (see the table above): D-06, D-09, D-11, D-14 and D-15 remain (all optional). The D-01, D-03, D-07 and D-08 residuals are optional. New findings from the regression check follow.

D-16 (N-01). local-start-condition-2-dual-reading — spec.md:142
- **Description**: Start condition (2) requires "여는 표면이 D-LAUNCH-03 Q2 (4)가 기록한 첫 표면 집합 … 안이다", under "전부 충족해야 `로컬 시험 가능`". It then adds "그 밖의 표면을 로컬에서 열 때는 그 표면에 적용되는 항목 … 이 같은 판정에 더해진다". This supports two readings:
  - Reading A: opening a non-first surface locally is allowed with extra items. This conflicts with (2), and it is the reading the 5th-correction record U5 describes.
  - Reading B: if the recorded set itself includes other surfaces, the surface-column rule adds their items. This is consistent but redundant with spec.md:147.
- No AC-002 [로컬] fixture opens S2, so the AC does not arbitrate. The impact is limited to an off-policy input under the current Q2 (4).
- **Severity**: minor. **Class**: optional. It is tied to the open user decision U5.
- **Required fix**: After U5 is answered, either delete the dash clause (reading B is already covered by spec.md:147), or rewrite (2) as an explicit exception. In the second case, add one AC-002 [로컬] fixture with an S2-opening vector.

D-17 (N-02). local-judgment-item-applicability-undefined — spec.md:144, :174, :207; progress U4
- **Description**: spec.md:144 makes L-02 and L-08 (S1) I-required for the S1 local test, but neither has a rule for what makes it READY in that judgment:
  - **L-08:** it defines only the G judgment (spec.md:174). D-LAUNCH-09 I = (2) allows only "준비 중" disabled display, while the 01/02 footers are `# 앵커` and `텍스트만` (LF-13). After the local reframing, the I-stage decision has no consumer. Under a strict reading, the local test waits for footer changes that touch completed-SPEC visual baselines (N5).
  - **L-02:** it requires an exposure record, but REQ-009 (spec.md:207) defines that record only "노출 확대 단계 앞에", and a local test is not an exposure step.
- **Severity**: minor. **Class**: optional. It should be surfaced to the user together with U4, as D-10 was.
- **Required fix**: Add one sentence to §2.4 "로컬 시험 판정" stating, for L-02 and L-08 (S1), what READY means in the local judgment. One option is "record exists and is current" (generic READY). Another is "element states within the D-LAUNCH-09 I-allowed set". Alternatively, exclude them from the local judgment by recorded decision.

D-18 (N-03). section-2.5-vs-local-dependency — spec.md:187 vs :144
- **Description**: §2.5 says "일반 사용자 공개는 형제 증거에 의존한다 … 내부 시험은 이 의존이 없다". §2.4 (spec.md:144) says the S1 local internal test requires R-02 (ENGINE readiness evidence) and R-03 (D-ENGINE-07). Read in context, "이 의존" means the consult→ENGINE-results dependency, but a reader can take it as "internal testing needs no sibling evidence".
- **Severity**: minor. **Class**: optional.
- **Required fix**: Qualify the sentence, e.g. "상담의 내부 시험은 이 의존이 없다. 진단 표면의 로컬 시험은 R-02·R-03에 의존한다(§2.4)".

D-19 (N-04). s2-g-governance-unstated — spec.md:174, :316-322; acceptance.md:130-133
- **Description**: D-LAUNCH-09 (G = (1), destination required) covers 01·02·03. L-08 says "S2 … D-OPS-04의 6개 요소로 판정한다". acceptance.md:133 says S2 is BLOCKED "추가로" until D-OPS-04 is confirmed, which implies both rules apply. AC-015 scenario 2 nevertheless expects S2 not BLOCKED whenever all six D-OPS-04 elements are "확정", without fixing the 03 footer destination state. It is unstated whether "확정" implies `목적지 있음`, and which rule governs if D-OPS-04 confirms a disabled display.
- **Severity**: minor. **Class**: optional.
- **Required fix**: State in L-08 whether the S2 G judgment is (D-OPS-04 confirmed) AND (D-LAUNCH-09 G (1) satisfied for the 03 footer elements), and make AC-015 scenario 2's S2 fixtures specify the 03 footer element states accordingly.

D-20 (N-05). stale-n2-status-vs-r01 — spec.md:243 vs :176
- **Description**: The N2 status prose says "CONSULTOPS-001 D-OPS-12(Q1)의 사용자 결정은 이 세션이 확인하지 못했다". The R-01 row says D-OPS-12 is "'면제 없음'으로 결정됨, CONSULTOPS-001 2026-10-03 2차 정밀 교정". This is pre-existing; the author acknowledges it at progress.md:109. It is reported here for the first time.
- **Severity**: minor. **Class**: optional.
- **Required fix**: Update the N2 (and N3) status prose to match R-01's citation, or qualify R-01.

D-21 (N-06). fixture-coverage-gaps — acceptance.md:23-25, :64
- **Description**: §2.4 rejection (iv) includes `production` + a stage value outside I/G. Only the "no stage" sub-case has a fixture, (머). AC-008 선결 lists (바), which has no signature, among the "서명자 부분" that are BLOCKED.
- **Severity**: minor. **Class**: optional.
- **Required fix**: Add a `production` + out-of-enum stage variant to (머) or a new fixture, and drop (바) from the 선결 signer-part list.

D-22 (N-07). proposal-c-paraphrase — progress.md:181-189; RESUME.md:230 (non-audited, advisory)
- **Description**: See check 4. Review-2 (c) is restated with different content, and the "keep as unapproved proposal" route is attributed to a user instruction that is not recorded. The audited artifacts do not repeat the attribution.
- **Severity**: minor. **Class**: optional. It is routed to the orchestrator, not to manager-spec.
- **Required fix**: The orchestrator resolves U1 with the user (record a dated decision with the deciding role for (e)(f), or remove them) and corrects the progress.md and RESUME.md paraphrase.

Blocking: none open. Optional: D-06, D-09, D-11, D-14, D-15, D-16..D-22, plus the residuals of D-01 (spec.md:306 proposal text), D-03 (REQ-level local hook), D-07 (progress.md citations) and D-08 (REQ-001 vocabulary). No must-pass failure.

## Regression Check (Iteration 3)
Defects from iteration 2:
- D-01: RESOLVED. The decision lines are identical to `c89dae7`, L-06 and AC-014 exclude (e)(f), and the false claims are corrected in new entries. The literal fix route is unexecuted (optional residual).
- D-02: RESOLVED. CONSULTOPS spec.md:225 versus LAUNCH spec.md:174, :319, plan.md:102 and acceptance.md:130-133 are aligned.
- D-03: RESOLVED. The stage table has 3 host rows, the local judgment is separate, and REQ-008 has a local consumer. The REQ-level start-condition hook remains optional.
- D-04: RESOLVED (spec.md:319, acceptance.md:133).
- D-05: RESOLVED (spec.md:128, AC-003 (바)).
- D-06: PARTIALLY RESOLVED, optional (spec.md:138 prose only).
- D-07: RESOLVED in the audited artifacts (25 citations verified); progress.md residual.
- D-08: RESOLVED (regex, 3/3 MATCH); REQ-001 vocabulary residual.
- D-09: PARTIALLY RESOLVED (HISTORY preserved; the grep claim is still literally false).
- D-10: RESOLVED (spec.md:144); user confirmation pending (U4).
- D-11: UNRESOLVED, optional (REQ-002 longer).
- D-12: RESOLVED.
- D-13: RESOLVED.
- D-14: UNRESOLVED, optional (acceptance.md:104).
- D-15: UNRESOLVED, N/A (SSOT).

Stagnation: D-14 and D-15 (iteration-1 D1/D2) have now appeared in all three iterations unchanged. Both are optional, and D-15 is out of this SPEC's scope. D-14 is flagged per the contract as "no progress", but it is a deliberate deferral (progress.md §G row 1), not a misunderstanding.

## Recommendation
**PASS at 0.81** (Tier M threshold 0.80).

Rationale:
- All seven must-pass criteria clear: MP-1/2/3/5/6/7 PASS, MP-4 N/A.
- All four iteration-2 blocking defects are resolved with evidence.
- The 5th/6th/7th corrections introduced no blocking contradiction:
  - stage model vs local judgment, D-OPS-04 ownership, L-06 reasons and fixture counts are consistent;
  - the 16/16 counts hold;
  - plan.md §C and the RESUME §11 ordering do not conflict.
- The margin is thin (Clarity 0.65 would give 0.79). The new findings are all optional.

Iteration cap: this is the final iteration. Escalation and next steps belong to the orchestrator and user; no 4th iteration is proposed.

Before Implementation Kickoff Approval, the orchestrator should surface the following to the user via AskUserQuestion. These are open items, not resolved by this PASS:
1. **U1 — D-LAUNCH-07 (e)(f).** Confirm with a dated decision record and deciding role, or discard. Do not treat "keep as proposal" as a user decision (D-22).
2. **U2 / N5 — 01·02 footer ownership.**
3. **U3 — local I signature and signer set.**
4. **U4 together with D-17.** Applicability of R-02/R-03, L-02/L-08 and L-06/L-07/L-09 to the S1 local test. Under the current decisions, the local first test needs full ENGINE readiness evidence, finalized consent texts and possibly footer changes.
5. **U5 together with D-16.**
6. **The 11 spec.md markers N1–N11** (N9 is decided at Kickoff by design).

Optional cleanups that manager-spec may apply at the orchestrator's discretion, in priority order:
1. D-16 and D-17, after U4/U5 are answered, because they feed M1 RED fixtures.
2. D-19 and D-18.
3. D-20 and D-21.
4. D-11, D-06, D-09 and D-14.
5. Moving the D-LAUNCH-07 proposal text out of the normative body once U1 is decided.

Key commands run (all read-only):
- `git rev-parse HEAD`, `git rev-parse HEAD:<path>` and `git hash-object` (commit and blob match).
- REQ/AC extraction (16/16, 1:1) and `grep -c 'NEEDS CLARIFICATION'` (spec 11, plan 0, acceptance 0).
- `grep -c syscall` (0) and the weasel-word grep (0).
- The per-referenced-SPEC `grep -m1 '^status:'` loop.
- `diff` of the D-LAUNCH decision lines, `c89dae7` vs HEAD → IDENTICAL.
- HISTORY line comparisons vs `3c56b47` and `9a586eb` (3rd line identical to `9a586eb`; the other past lines identical).
- `sed -n` reads of 25 sibling citations across ENGINE, CONSULTOPS and DIAGNOSIS.
- Two `awk -F'|'` table parses (stage table 3/3 regex MATCH; definition table 14 rows, 0 out-of-enum).
- Fixture label counts: AC-002 = 19, AC-008 = 10.
- Residual greps: "판정 근거", the old heading, "01·02·03 공유", "미추적", "사고 유형", and the fixture-count words.
