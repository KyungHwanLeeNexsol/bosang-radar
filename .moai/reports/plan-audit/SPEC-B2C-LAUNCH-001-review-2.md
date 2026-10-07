# SPEC Review Report: SPEC-B2C-LAUNCH-001
Iteration: 2/3
Verdict: FAIL — STOP (score regression vs iteration 1; see Recommendation)
Overall Score: 0.75 (Tier M threshold 0.80; iteration 1 = 0.88)

Reasoning context ignored per M1 Context Isolation. Inputs: `spec.md` (356 lines), `plan.md` (158), `acceptance.md` (147), `progress.md` (147) at HEAD `3c56b47` (== `origin/plan/b2c-launch-readiness`), plus direct reads of sibling SPEC files and git history. Tier M artifact set; `design.md`/`research.md` absent as expected.

Audit mode: Claude-only (per invocation). `audit_multi` / `codex_audit` / `glm_audit` were NOT called; no content left the machine.

Scope note: iteration 1 audited a pre-decision state (see check 6). The whole current SPEC was audited as new content; `git diff e174359..3c56b47` was used only to locate changes.

## Score computation (harmonic mean)
| Dimension | Score | Band | Basis |
|---|---|---|---|
| Clarity | 0.60 | 0.50-0.75 | Two requirement areas now have more than one reasonable reading. (1) REQ-001/REQ-002 vs the `local` form of the stage table: is the local first test gated or not (D-03)? (2) L-08's G gating for S1: spec.md:164 and spec.md:308 say different things (D-02, D-04). Everything else stays at iteration-1 quality (dense but resolvable). |
| Completeness | 0.90 | 0.75-1.0 | All sections are present: HISTORY spec.md:18-24, Why §1, Scope §2, GEARS REQs §3 spec.md:180-210, ACs in acceptance.md, five `### Out of Scope —` H3s at spec.md:327/331/335/339/343, each with `-` bullets. All 12 frontmatter fields are present. Deduction: the D-LAUNCH-07 decision record lacks a deciding role and date for its changed sub-decision (D-01). §2.4 L153 requires decision records to carry "어느 옵션이 선택됐는지, 결정한 역할, 날짜". |
| Testability | 0.80 | 0.75 | All 16 ACs keep 검증/통과 판정/선결. AC-002's 15 fixtures each have exactly one expected result (verified below). Weasel-word grep returned 0. Deductions: AC-015 scenario 2's fixture premise depends on a mis-sourced sibling scope (D-02). AC-001 (2)/(5) "only §2.3 vocabulary" has no defined token set, and the evidence cited for (5) is structural only (D-08). AC-008 has no `local` fixture (part of D-03). |
| Traceability | 0.75 | 0.75 | REQ↔AC is 1:1 (16/16), and every cited sibling identifier exists (check 4). Deductions: the D-LAUNCH-07 decision provenance was rewritten (D-01). The D-OPS-04 scope is traced to the wrong surfaces (D-02). Many sibling `path:line` citations are stale after sibling edits (D-07). plan.md:110 points to a renamed heading (D-09). |

H = 4 / (1/0.60 + 1/0.90 + 1/0.80 + 1/0.75) = 4 / (1.6667 + 1.1111 + 1.2500 + 1.3333) = 4 / 5.3611 = 0.7461 → **0.75**

## Must-Pass Results
- **[PASS] MP-1 REQ number consistency**: `grep -oE '^\- \*\*REQ-B2CLAUNCH-[0-9]{3}\*\*' spec.md` → `001 002 … 016`. Sequential, no gaps, no duplicates, 3-digit padding. The ACs map 1:1: `001->001 … 016->016` from the acceptance.md headers.
- **[PASS] MP-2 GEARS format (judged on the requirement layer: spec.md REQ-XXX only)**: The modality tags are unchanged from iteration 1. While: REQ-002/008/012 (spec.md:187,193,200). When: REQ-009/014 (:197,:205). Where: REQ-011/013/016 (:199,:204,:210). The untagged REQs use the ubiquitous form "<artifact>은/는 …한다". The 4th correction appended to REQ-002 a second ubiquitous obligation with a different subject ("점검기는 … 입력받고 … 거부한다", spec.md:187); the grep shows the subjects `출시 절차는`, `점검은` and `점검기는` in one REQ. This is a compound REQ, not a non-GEARS one. It remains PASS-equivalent, with a clarity note in D-11. The Given-When-Then entries in acceptance.md are ACs (the verification layer) and were not penalized here.
- **[PASS] MP-3 YAML frontmatter**: spec.md:1-16 has `id`, `title` (quoted), `version: "0.1.0"`, `status: draft`, `created: 2026-10-02`, `updated: 2026-10-04`, `author: Nexsol`, `priority: P1`, `phase: "v0.20.0 target"` (a release label, not a prohibited value), `module`, `lifecycle: spec-anchored`, `tags` (string), plus the optional `tier: M` and `related_specs`. No rejected aliases are used. `id` still fails the SSOT regex: `echo SPEC-B2C-LAUNCH-001 | grep -cE '^SPEC-[A-Z][A-Z0-9]+-[0-9]{3}$'` → `0`. This is the project-wide precedent, carried as iteration-1 D2 and non-blocking.
- **[N/A] MP-4 Language neutrality**: the SPEC targets one project (Next.js/TS). No multi-language tooling.
- **[PASS] MP-5 D7 cross-SPEC reconciliation**: referenced IDs: CONSULT-001, CONSULTOPS-001, DIAGNOSIS-001, ENGINE-001, RESULT-001, PILOT-OPS-001, PILOT-READY-001. Their statuses are `draft, draft, in-progress, completed, completed, completed, completed` (per-file `grep -m1 '^status:'`). None is retired, superseded or archived, so there is no D7 BLOCKING finding. Content-level reconciliation defects are listed separately (D-02, D-07).
- **[PASS] MP-6 D8 cross-platform**: `grep -c syscall` → `0` in all four files.
- **[PASS] MP-7 Clarification gate**: `grep -rn 'NEEDS CLARIFICATION' plan.md acceptance.md progress.md` → no output (exit 1). `research.md` does not exist (Tier M). spec.md holds 11 markers (spec.md:216-226). They are outside MP-7's binding scope, but the user must still resolve them before Implementation Kickoff Approval.

## Directed Verification Checklist

### 1. 4th-correction internal consistency — FAIL (D-03, plus D-05/D-08/D-10 optional)
- **AC-002 fixtures vs contract — PASS.** All 15 fixtures have exactly one expected result, and none contradicts REQ-002 or §2.4:
  - Exit 0: (가)(바)(사), plus (차).
  - Non-zero: (나)(다)(라)(마)(아)(자), plus (카)(타)(파)(하)(거).
  - Total: 3+6+1+1+1+2+1 = 15.
  - (가)~(자) are pinned to `production` (acceptance.md:23).
  - "local + G rejected" (fixture (거)) follows from spec.md:126,133 ("`일반 사용자 공개`는 운영 호스트에서만 성립"). It is coherent.
- **`local` + I with `결정 대기` items — coherent but under-disclosed (D-10).** In `local`, only L-01/L-05/R-04 are exempted (spec.md:126). L-08 I, R-02 I and R-03 I are `결정 대기`; D-LAUNCH-05 (a) "면제 없음" resolves them to 필수 (fail-closed rule, spec.md:137). So under the current decisions, the local first diagnostic test requires R-02 (full ENGINE readiness evidence REQ-B2CENGINE-023 (i)~(iv), including the 6×6 AND matrix) and R-03 (all six consent texts finalized). This follows mechanically from the decisions, but no section of the SPEC states it.
- **`해당 없음(local)` vs the closed enumerations — no table violation, but under-specified (D-05).** The token is checker output only. The I/G cells parse clean: 14 rows, 0 values outside the enumeration (see the parse below). However:
  - spec.md:126 says the output is "`READY`도 `BLOCKED`도 아니다", which omits `UNVERIFIED`.
  - REQ-003 (spec.md:188) limits record items to three states.
  - The token lexically overlaps the I/G cell value `해당 없음`.
  - Nothing states whether an I signature record (REQ-008) made for `local` lists L-01/L-05/R-04, or with which status.
- **Stage model vs `local` form — FAIL (D-03).**
  - spec.md:127 defines "단계는 운영 호스트의 상태이고 (로컬 실행은 … 단계를 바꾸지 않는다)", and spec.md:126 says that during the local test "운영 상태는 계속 배포 완료(dark)다".
  - Yet the stage table row "내부 시험 공개" (spec.md:132) contains a `local` form whose vector cell reads "운영 호스트의 게이트 상태 벡터(§2.3)는 배포 완료(dark)와 같다". That vector is identical to row 131.
  - REQ-001 (spec.md:186) requires "서로 다른 세 상태".
  - REQ-002 and REQ-008 (spec.md:187,193) bind only "노출 확대 단계", and spec.md:126 states the local test "노출 확대 단계가 아니고". So no requirement makes the local test conditional on the `local` verdict, while spec.md:132 (판정 cell) and spec.md:135 imply it is.
  - Two readings follow: (a) the local test is gated by the local check and an I signature; (b) the local check gates nothing.
- **AC-001 vocabulary rule after the edit — optional (D-08).** acceptance.md:19 (2) requires the vector cells to use only §2.3 vocabulary (`닫힘`/`열림` of 진단 게이트·상담 화면·상담 접수). The edited `local` cell uses "배포 완료(dark)와 같다 — 노출 확대 단계가 전혀 일어나지 않는다", and the `production` cell uses "표면 집합이 열리고 그 밖은 닫히며, … `D`는 `true`가 아니어야 한다". Neither stays inside the stated vocabulary. The evidence cited for (5) at acceptance.md:20 is structural only (rows/NF/empty). The (2)/(5) claim is therefore unverified, and under a strict reading the SPEC's own table fails it. This partly pre-existed (the original cell already had "표면 집합").
- **plan.md M1 — PASS.** plan.md:94-95 lists the `local`/`production` input, the op-only items, and the "열다섯 fixture(… 실행 환경 입력 오류 포함)". This matches AC-002.

### 2. Independent table parses — PASS (claims match)
```
$ awk -F'|' '/^\| (배포 완료\(dark\)|내부 시험 공개|일반 사용자 공개) \|/{...}' spec.md
131: NF=7 empty=0 / 132: NF=7 empty=0 / 133: NF=7 empty=0 / rows=3
$ awk -F'|' '/^\| (L|R)-0[0-9] \|/{ I=$5; G=$6; last=$8 ... }' spec.md
L-01..R-05: NF=9 ×14, bad_total=0, empty_total=0, exactly_one_slash=14
combo 필수/필수=8, 결정 대기/필수=2, 필수/해당 없음=1, 필수/결정 대기=1, 해당 없음/결정 대기=1, 결정 대기/결정 대기=1
```
These are identical to acceptance.md:20, acceptance.md:26 and progress.md:140.

### 3. 2nd/3rd-correction content — FAIL (D-01, D-02, D-04)
- **D-LAUNCH-07 (e)(f) — referenced artifacts exist, but the decision was reversed (D-01).**
  - The ENGINE `acceptance.md:189` AC-B2CENGINE-023 matrix exists. Its columns are `(a) 규칙 근거 … (f) 정확도 기준 충족`, and "현재 결정은 (d) 6개 유형 전부" holds.
  - LAUNCH spec.md:295 calls column (a) "판정 근거"; it is actually "규칙 근거" (minor, D-12).
  - The original user decision at commit `c89dae7` (progress.md) read: "사유 목록은 CONSULTOPS-001 §2.4의 작성자 기본 목록(최소 4종)을 그대로 쓰고, **진단 표면 전용 사유는 추가하지 않는다**."
  - Commit `7916728` added two diagnosis-surface reasons. The current progress.md:62 replaced the original sentence and attributes the change only to "2차 정밀 교정", with no deciding role.
  - `diff` of the nine decision lines (c89dae7 vs HEAD) shows D-LAUNCH-07 as the only changed record.
- **L-08 per-surface G vs D-OPS-04 — FAIL (D-02, D-04).**
  - CONSULTOPS `spec.md:225` defines D-OPS-04 (d)(e)(f) as "03 계열 데스크톱 푸터의 "고객 문의" … 같은 푸터의 "개인정보처리방침" … 같은 푸터의 "이용약관"", and CONSULTOPS `spec.md:229` calls them "상담 표면 (c)~(f)".
  - So all six D-OPS-04 elements are 03/S2 elements. None is a "01·02·03 공유" element.
  - LAUNCH L-08 (spec.md:164), D-LAUNCH-09 (spec.md:308), AC-015 scenario 2 (acceptance.md:130-132) and plan.md:102 claim the opposite. This also contradicts LAUNCH's own LF-13 (spec.md:58, "D-OPS-04 (d)는 03 푸터만 다룬다"), N5 (spec.md:220,236) and the plan risk at plan.md:51 ("03만 형제가 다룬다").
  - Separately, spec.md:308 still says "01·02·03의 일반 공개 준비 상태(L-08의 G 칸)는 D-OPS-04의 6개 요소가 모두 확정되기 전까지 BLOCKED다". That contradicts the 3rd-correction per-surface rule at spec.md:164 and AC-015 scenario 2 fixture (나) at acceptance.md:132.
- **AC-015 scenario 2 — internally consistent with L-08 (8 expected cells).** Its premise inherits D-02.

### 4. Cross-SPEC identifier existence — PASS (identifiers); stale line citations (D-07)
```
CONSULTOPS-001: E-03 spec=4, E-06 spec=2, E-08 spec=4, E-17 spec=6, EV-1 spec=11 (EV-1..EV-7 defined), N7 spec=8,
  D-OPS-04/07/10/11/12 spec=9/6/10/5/22, REQ-B2CCONSULTOPS-002/006/011/013/016 defined (spec.md:152,162,173,175,181),
  AC-B2CCONSULTOPS-011 (acceptance.md:92, "시나리오 1 — 부팅 동작."), AC-B2CCONSULTOPS-015 (acceptance.md:129), E-01..E-18 rows all present
ENGINE-001: REQ-B2CENGINE-023 (spec.md:132), AC-B2CENGINE-023 (acceptance.md:189), D-ENGINE-03/04/05/07/09/10 present
  (D-ENGINE-10 in design.md/progress.md only), N5 (spec.md:144), N7, design §9.2 (:160) §9.3 (:169) §10.1 (:188) §10.5 (:235)
DIAGNOSIS-001 REQ-B2CDIAG-017/023/024/025, AC-B2CDIAG-024; CONSULT-001 REQ-B2CCONSULT-005/025; RESULT-001 REQ-B2CRESULT-025;
  PILOT-READY REQ-PILOT-READY-016; PILOT-OPS REQ-PILOT-OPS-006 — all found
Statuses: ENGINE draft, CONSULTOPS draft, CONSULT in-progress, DIAGNOSIS completed, RESULT completed, PILOT-READY completed, PILOT-OPS completed
```
- Post-edit wording checks:
  - CONSULTOPS E-06 now reads "롤백 시험 수행 기록(롤백 직후 행 보존 확인과, 롤백과 분리된 시험 행 정리 시험 수행 기록을 함께 담는다)" (CONSULTOPS spec.md:127). It is still compatible with LAUNCH L-07 (spec.md:163).
  - REQ-B2CCONSULTOPS-016 (spec.md:181) still keeps rows and the secret on rollback, so it is compatible with AC-014 (acceptance.md:118).
  - The D-OPS-12 application-timing clause exists (CONSULTOPS spec.md:285) and matches R-01 (spec.md:166).
- Stale line numbers (D-07). Examples:
  - ENGINE `spec.md:61`: now the table header `| 관계 | 내용 |`; the content is at :63.
  - ENGINE `:65`: now "의존하지 않는 것"; the content is at :67.
  - ENGINE `:130`: now an empty line.
  - ENGINE `:142`: now N3; N5 is at :144.
  - CONSULTOPS `:55`: now F-11.
  - CONSULTOPS `:63`: now F-19; F-22 is at :66.
  - CONSULTOPS `:112`: now the "시험 수행" definition; the I column definition is at :117.
  - CONSULTOPS `:124`: now the E-03 row.
  - CONSULTOPS `:188`: now N2; N7 is at :193.
  - CONSULTOPS `:220`: now D-OPS-03 (c); D-OPS-04 starts at :223.
  - CONSULTOPS `:274-278`: D-OPS-12 is now around :283-285.

### 5. Decision fidelity — FAIL (D-01; D-06 optional)
- D-LAUNCH-01..06 and 08..09: the record lines are byte-identical to `c89dae7` (diff shows only line 7 changed). No REQ/AC/§2.4 text contradicts them, with one exception: the `production` I form (spec.md:132) is conditioned only in prose ("D-LAUNCH-01의 다른 옵션으로 결정이 바뀐 경우"). The checker contract (REQ-002, AC-002 (카)) never ties `production`+I to D-LAUNCH-01 ≠ (e) (D-06, optional, because REQ-002 is a necessary condition, not an authorization).
- D-LAUNCH-07: the recorded user sub-decision "진단 표면 전용 사유는 추가하지 않는다" was reversed and erased (D-01). Four places say no decision changed:
  - plan.md:40: "9건 결정의 선택(옵션)은 바꾸지 않았다"
  - spec.md:24: "D-LAUNCH-01~09의 기존 사용자 결정은 바꾸지 않았고"
  - progress.md:72
  - spec.md:295: "그대로 쓴다(2026-10-03 사용자 인터뷰 결정, 유지)", which applies only to the consult part
  
  The git record contradicts all four.
- The "local + G rejected" rule is presented as derived, not decided (progress.md:74), and it is derivable from spec.md:133. Not a pre-emption.

### 6. Audit-scope statements — PASS
```
$ git merge-base --is-ancestor 643dec1 c89dae7 → exit=0
643dec1 2026-10-03 10:28:25 +0900 docs(SPEC-B2C-LAUNCH-001): plan-audit 1회차 PASS(0.88/0.80) 보고서 커밋
c89dae7 2026-10-03 12:04:51 +0900 docs(SPEC-B2C-LAUNCH-001): 사용자 인터뷰로 Open Decisions 9/9 결정 반영
$ git diff --stat e174359 643dec1 -- .moai/specs/SPEC-B2C-LAUNCH-001 → (empty: SPEC content at 643dec1 == initial draft e174359)
```
- review-1 itself says "undecided D-LAUNCH-NN options" (review-1:17) and "the 9 `D-LAUNCH-01..09` decisions" still to be routed to the user (review-1:58).
- progress.md:10, progress.md:34, spec.md:23 and RESUME.md:30,57 are all consistent with "pre-decision state, exact SHA unconfirmed".
- No remaining "`c89dae7`까지 감사" claim exists. The only hits are historical mentions in progress.md:75 and RESUME.md:79.
- Side note (D-09): the 4th correction silently rewrote the 2026-10-03 3rd-correction HISTORY line. At `9a586eb` it read "결정 기록 전 커밋 기준"; it now reads "(정확한 피감사 SHA는 미확인 …)". The 4th-correction entry (spec.md:24) discloses only the progress.md change.

### 7. Must-pass and hygiene scans
- MP-1..MP-7: see above.
- Out of Scope: five `### Out of Scope —` H3s, each with a `-` bullet (spec.md:327-345).
- Weasel words (`적절|합리적|적당|충분히|appropriate|reasonable`): 0 hits.
- Time-estimate regex: 0 hits.
- URLs: one hit, spec.md:60 `https://api.github.com/repos/KyungHwanLeeNexsol/bosang-radar` (LF-15 evidence, not a product value; acceptable).
- Phone, email, long-hex and `sk-` secret patterns: 0 hits.

### 8. Iteration-1 D1/D2 — see Regression Check.

## Defects Found (structured defect-list)
D-01. decision-record-reversal — progress.md:62; plan.md:36,40; spec.md:22,24,295; acceptance.md:118
- **Description**: The user decision recorded at `c89dae7` for D-LAUNCH-07 read "진단 표면 전용 사유는 추가하지 않는다". The 2nd correction (`7916728`) reversed it by adding reasons (e)(f). It also overwrote the decision line, so the original text is gone, and gave no deciding role or date for the change. §2.4 (spec.md:153) requires decision records to carry 역할·날짜. Four statements (plan.md:40, spec.md:24, spec.md:295, progress.md:72) claim no decision changed, which git contradicts.
- **Severity**: major. **Class**: blocking.
- **Required fix**: Restore the original decision text verbatim. Then do one of the following:
  - (a) add a separate dated decision entry that names the deciding role(s) who approved adding (e)(f); or
  - (b) remove (e)(f) from spec.md:295, plan.md:36/127, acceptance.md:118 and progress.md:62.
  
  Then correct the "결정은 바꾸지 않았다" claims at plan.md:40, spec.md:24 and progress.md:72.

D-02. d-ops-04-scope-misattribution — spec.md:164 (L-08), :308; acceptance.md:130-133; plan.md:102
- **Description**: CONSULTOPS-001 defines all six D-OPS-04 elements as 03 elements: (d)(e)(f) are "03 계열 데스크톱 푸터의 …" (CONSULTOPS spec.md:225) and "상담 표면 (c)~(f)" (:229). LAUNCH nevertheless calls (d)(e)(f) "01·02·03 세 표면에 걸친 공유 3개" and makes S1 (01·02) G readiness wait on D-OPS-04. This contradicts LAUNCH's own LF-13 (spec.md:58), N5 (spec.md:220,236) and plan.md:51, and it leaves no defined decision source for "확정" of the 01·02 footer elements. As a result, AC-015 scenario 2's S1 fixtures test a coupling that the sibling does not provide.
- **Severity**: major. **Class**: blocking.
- **Required fix**: Re-base the S1 part of L-08 on LAUNCH's own records: D-LAUNCH-09 plus per-element destination records for the 01/02 footers, as N5 already frames it. Keep D-OPS-04 as the source for the S2 elements (all six). Then rewrite spec.md:164, spec.md:308, plan.md:102 and AC-015 scenario 2's fixtures/expectations to match. If the intent is "same label → same destination as D-OPS-04", state that as a LAUNCH-owned rule with its own decision source rather than as a D-OPS-04 consequence.

D-03. local-form-vs-stage-model — spec.md:126,127,132,135,186,187,193; acceptance.md:19,23-25,61-63
- **Description**: The stage definition says "단계는 운영 호스트의 상태" (spec.md:127), and the local test leaves the host in dark (spec.md:126). Yet row 132 defines a `local` form of "내부 시험 공개" whose host vector equals the dark row (spec.md:131). This breaks REQ-001's "서로 다른 세 상태" (spec.md:186). In addition, REQ-002 and REQ-008 bind only 노출 확대 단계, which spec.md:126 says cannot occur in `local`. So the `local` checker verdict, its fixtures (차)(타)(거), and any local I signature have no normative consumer, while spec.md:132/135 imply they gate the local test. AC-008 (acceptance.md:61) has no `local` fixture saying whether a local I signature must list L-01/L-05/R-04.
- **Severity**: major. **Class**: blocking.
- **Required fix**: Choose one model and state it in one place.
  - (a) Take `local` out of the stage table and define a separate non-stage judgment, e.g. "로컬 시험 판정". Add one sentence to REQ-002 (or a §2.4 rule cited by REQ-002) stating that participants may run the local test only while that judgment holds, with an I-signature rule for `local` and a matching AC-008 fixture.
  - (b) If the local test is intentionally ungated, delete the 판정 wording for `local` (spec.md:132,135) and state that the `local` check is advisory.

D-04. l08-g-statement-conflict — spec.md:308 vs spec.md:164 and acceptance.md:132; acceptance.md:133 (선결)
- **Description**: The D-LAUNCH-09 cross-reference says "01·02·03의 일반 공개 준비 상태(L-08의 G 칸)는 D-OPS-04의 6개 요소가 모두 확정되기 전까지 BLOCKED다". This was not updated by the 3rd correction. It contradicts L-08's per-surface rule (spec.md:164) and AC-015 scenario 2 fixture (나): S1 is not BLOCKED when the shared three are decided and the S2-only three are not.
- **Severity**: major. **Class**: blocking. It can be fixed together with D-02.
- **Required fix**: Rewrite spec.md:308 so it agrees with whatever L-08 rule survives D-02. Collapse acceptance.md:133's 2nd-correction sentence and its 3rd-correction qualifier into one statement.

D-05. local-output-token-underspecified — spec.md:126; acceptance.md:25
- **Description**: `해당 없음(local)` is checker output. It is not an I/G cell value and not a record state, but the text never says so explicitly. spec.md:126 says only "READY도 BLOCKED도 아니다" (omitting UNVERIFIED), and the token lexically overlaps the I/G value `해당 없음`.
- **Severity**: minor. **Class**: optional.
- **Required fix**: In spec.md:126, declare it as an output-only applicability label, outside both the I/G cell enumeration and REQ-003's record states, and add "UNVERIFIED도 아니다".

D-06. production-I-not-tied-to-decision — spec.md:132; acceptance.md:25 (카)
- **Description**: Under D-LAUNCH-01 = (e), an operational-host internal test is excluded only in prose. The checker contract lets `production`+I pass once the op-only items are READY.
- **Severity**: minor. **Class**: optional.
- **Required fix**: Add one sentence, e.g. "D-LAUNCH-01이 (e)인 동안 production+I 점검 입력은 거부" or "결정 기록 요구". Alternatively, state explicitly that the decision is enforced by procedure (N11), not by the checker.

D-07. stale-sibling-line-citations — spec.md:38,55,58,63,88,167,177,216-220,263,264,317; progress.md:98,104; plan.md:15,52
- **Description**: The sibling `path:line` citations now point to unrelated lines after the sibling edits (full list in check 4). plan.md:15/52 still describe the siblings as "미추적/커밋되지 않은 초안", but they are committed on this branch (last CONSULTOPS commit `dc72040`, 2026-10-04).
- **Severity**: minor. **Class**: optional.
- **Required fix**: Re-anchor the citations to identifiers (REQ/E/N/section IDs) rather than line numbers, or refresh the numbers. Update the "미추적" wording.

D-08. ac001-vocabulary-rule-undefined — acceptance.md:19-20; spec.md:132-133
- **Description**: AC-001 (2) "only §2.3 vocabulary" has no defined token set. The edited vector cells use non-§2.3 phrasing ("배포 완료(dark)와 같다", "표면 집합", "`D`는 `true`가 아니어야"). The (5) self-application evidence covers structure only.
- **Severity**: minor. **Class**: optional.
- **Required fix**: Define the allowed tokens, or allowed references such as "= 배포 완료 벡터", and re-run (5) for vocabulary as well. Otherwise narrow (2) to "contains §2.3 tokens for each named gate".

D-09. history-integrity — spec.md:22-24
- **Description**: The 4th correction rewrote the dated 2026-10-03 3rd-correction HISTORY line (at `9a586eb`: "결정 기록 전 커밋 기준") without disclosing it in spec.md:24. Separately, spec.md:22 claims the "사고 유형" grep returns 0, but the sentence itself now produces 1 hit (`grep -c '사고 유형' spec.md` → 1).
- **Severity**: minor. **Class**: optional.
- **Required fix**: Leave past HISTORY entries unchanged and record corrections in the new entry. Reword the grep claim to "본문 사용 0건(이 문장 제외)".

D-10. undisclosed-local-consequence — spec.md:126,132,167-168; acceptance.md:23 (차)
- **Description**: Under D-LAUNCH-05 (a) "면제 없음", R-02 I and R-03 I (and L-08 I) are 필수 even for the `local` first diagnostic test. That means the full ENGINE readiness evidence (the AC-B2CENGINE-023 6×6 AND matrix) and the finalized consent texts are required before an internal test. This follows from the decisions but is stated nowhere, and the user may not have intended it.
- **Severity**: minor. **Class**: optional. It should be surfaced to the user by the orchestrator, not fixed by the author.
- **Required fix**: Add one explicit sentence to §2.4 "실행 환경" listing which non-op-only items apply in `local` under current decisions, so the user can confirm or revisit D-LAUNCH-05.

D-11. req002-compound-subjects — spec.md:187
- **Description**: REQ-002 now carries three subjects (출시 절차 / 점검 / 점검기) and nested conditionals (입력이 없거나 … 이면; `local`이면 … `production`이면).
- **Severity**: minor. **Class**: optional.
- **Required fix**: Move the checker-input contract into the §2.4 "실행 환경" definition and keep REQ-002 as the single While-prohibition that cites it. The REQ count stays 16.

D-12. engine-matrix-column-label — spec.md:295; plan.md:127
- **Description**: The text calls column (a) "판정 근거"; ENGINE acceptance.md:189 labels it "(a) 규칙 근거".
- **Severity**: minor. **Class**: optional.
- **Required fix**: Use the sibling's label.

D-13. dangling-section-reference — plan.md:110
- **Description**: The text cites `spec.md` §2.4 "첫 내부 시험과 운영 노출의 구분", but that heading no longer exists (`grep -rn` finds only plan.md:110). The current bullet is "로컬 시험과 운영 상태의 구분" (spec.md:135).
- **Severity**: minor. **Class**: optional.
- **Required fix**: Update the reference.

D-14. (carried) iteration-1 D1 — acceptance.md:104
- **Description**: Still unresolved; see Regression Check.
- **Severity**: minor. **Class**: optional.

D-15. (carried) iteration-1 D2 — spec.md:2
- **Description**: Still present; project-wide precedent; see Regression Check.
- **Severity**: minor. **Class**: optional (n/a for this SPEC).

Blocking: D-01, D-02, D-03, D-04 (4). Optional: D-05..D-15 (11). No must-pass failure.

## Regression Check (Iteration 2)
Defects from iteration 1:
- **D1 (AC-012 comment-filter wording) — UNRESOLVED (optional).** acceptance.md:104 still says "`//` 주석 줄은 일치하지 않는다" without stating that this holds only after the separate comment-prefix filter. progress.md:34 records the deferral.
- **D2 (SPEC-ID regex vs SSOT) — UNRESOLVED, N/A for this SPEC.** `echo SPEC-B2C-LAUNCH-001 | grep -cE '^SPEC-[A-Z][A-Z0-9]+-[0-9]{3}$'` → `0`. This is the project-wide precedent; the fix belongs to the SSOT.

Neither carried item is blocking, and neither caused this FAIL. The FAIL comes from defects in content added after iteration 1 (D-01..D-04).

## Recommendation
**FAIL at 0.75** (Tier M threshold 0.80). All seven must-pass criteria clear (MP-1/2/3/5/6/7 PASS, MP-4 N/A), so the FAIL is score-based. It is driven by four blocking consistency and decision-fidelity defects introduced by the post-iteration-1 corrections.

**STOP signal (Retry Loop Contract — score regression 0.88 → 0.75).** Caveat: iteration 1 audited the pre-decision draft, so the two scores measure different content. The contract still forbids unconditional further iteration. The orchestrator should present three options to the user:
1. Reduce scope (proposal below).
2. Accept the current state as PASS-with-debt. Not recommended while D-01 (a rewritten user decision) is open.
3. Explicitly override and run iteration 3.

**Scope-reduction proposal** (it shrinks the stage model rather than adding requirements, and needs no new REQ/AC; the count stays 16/16):
- (a) Remove the `local` form from the stage table. Keep the stage model as three host states, and define the local first test as a single non-stage "로컬 시험 판정" in §2.4. REQ-002 gets one sentence or reference saying whether that judgment gates participants (D-03, D-05, D-08).
- (b) Drop the S1 dependence on CONSULTOPS D-OPS-04. L-08 S1 G is then judged from D-LAUNCH-09 plus LAUNCH-owned per-element records for the 01/02 footers, and D-OPS-04 stays S2-only (D-02, D-04).
- (c) Restore the D-LAUNCH-07 decision text, and either obtain a recorded deciding role for (e)(f) or remove them (D-01).

The user decision in (c) must come through the orchestrator (`AskUserQuestion`), not be authored by manager-spec.

Fix instructions for manager-spec, in priority order:
1. D-01: restore progress.md:62's original decision sentence verbatim. Add a separate dated entry with the deciding role for (e)(f), or remove (e)(f) everywhere. Correct plan.md:40, spec.md:24 and progress.md:72.
2. D-02 + D-04: rewrite spec.md:164 (L-08), spec.md:308, plan.md:102, and acceptance.md:130-133 (scenario 2 premise/fixtures plus the 선결 sentence) so the D-OPS-04 scope matches CONSULTOPS spec.md:225/229 and LAUNCH's own LF-13/N5.
3. D-03: apply option (a) or (b) from the D-03 fix, and add the matching AC-008 `local` fixture if (a).
4. Optional cleanups D-05..D-13, and D-14 if convenient.
5. Before Implementation Kickoff Approval, the orchestrator should also surface D-10 (local test requires full ENGINE readiness and final consent texts under D-LAUNCH-05 (a)) and the 11 spec.md `[NEEDS CLARIFICATION]` markers to the user.

Key commands run (all read-only): both `awk -F'|'` table parses (outputs above); the fixture letter extraction on acceptance.md:23 → 15 unique; the REQ/AC header extraction → 16/16 1:1; the per-sibling `grep -m1 '^status:'`; the identifier `grep -cF` loops over the CONSULTOPS and ENGINE files; `git merge-base --is-ancestor 643dec1 c89dae7` → 0; the `diff` of the decision lines `c89dae7` vs HEAD → only D-LAUNCH-07 changed; and `sed -n` reads of CONSULTOPS spec.md:223-229/285 and ENGINE acceptance.md:189-200.
