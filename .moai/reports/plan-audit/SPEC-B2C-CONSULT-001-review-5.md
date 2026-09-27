# SPEC Review Report: SPEC-B2C-CONSULT-001

Iteration: 5/3 (delta-scoped re-audit per the D17 defect list; not a fresh iteration count against the 3-iteration ceiling — this is a confirming re-audit of a targeted fix, per the Retry Loop Contract's "the re-audit is scoped to the enumerated defect delta" clause)
Audited commit: `b0b875ee9b869227528b0a03607d4b1f8d4131e5` (verified via `git rev-parse HEAD` at audit start)
Verdict: PASS
Overall Score: 0.97

**Reasoning context ignored per M1 Context Isolation.** The orchestrator's prompt named D17 and summarized what changed; that summary was treated only as a pointer to where to look, not as a substitute for verification. Every claim below is independently re-derived from current file content and `git diff`/`git log` evidence, not from the summary.

**This is a genuinely new full re-read, not a diff-only check.** All 6 SPEC artifact files were read in full this session:

1. `.moai/specs/SPEC-B2C-CONSULT-001/spec.md` (145 lines, full read)
2. `.moai/specs/SPEC-B2C-CONSULT-001/design.md` (425 lines, full read in two passes: L1-342, L342-425)
3. `.moai/specs/SPEC-B2C-CONSULT-001/plan.md` (118 lines, full read)
4. `.moai/specs/SPEC-B2C-CONSULT-001/acceptance.md` (365 lines, full read)
5. `.moai/specs/SPEC-B2C-CONSULT-001/research.md` (76 lines, full read)
6. `.moai/specs/SPEC-B2C-CONSULT-001/progress.md` (133 lines, full read)
7. `.moai/reports/plan-audit/SPEC-B2C-CONSULT-001-review-4.md` (127 lines, full read — prior audit baseline for regression comparison)

## Must-Pass Results

- [PASS] MP-1 REQ number consistency: `spec.md` REQ-B2CCONSULT-001 through -025, sequential, zero-padded 3-digit, no gaps, no duplicates. Verified via `grep -c '^- \*\*REQ-B2CCONSULT-' spec.md` = 25 and a full `-o` listing this session — 25 unique IDs, 001-025, no gaps/duplicates.
- [PASS] MP-2 EARS/GEARS format compliance (requirement layer only — `spec.md` REQ-XXX; `acceptance.md` AC-XXX Given-When-Then entries are the correct verification-layer format and are not graded here per M3 § Scope): re-read all 25 REQ entries this session. Classification unchanged from iteration 4 (Ubiquitous: 001/002/006/009/010/011/012/013/016/018/019/020/021/024; Event-driven (When): 003/004/007/008/015/022/023; Where: 005; Unwanted: 014/017/025). REQ-018 (the D17 subject) retains its Event-driven "시스템은 ... 제공하며" ubiquitous/event-driven compound structure with no informal drift introduced by the D17 edit.
- [PASS] MP-3 YAML frontmatter validity: all 12 canonical fields present with correct types (`spec.md:L1-16`) — `id`, `title`, `version` (quoted semver), `status: draft`, `created`/`updated` (ISO dates), `author`, `priority: P1`, `phase: "v0.19.0 target"` (not a prohibited lifecycle-stage value), `module`, `lifecycle: spec-anchored`, `tags`. Optional `tier: L` and `related_specs` also present, no rejected snake_case aliases. `updated: 2026-09-27` now matches the D17 fix commit's actual edit date — this resolves iteration 4's D-NEW-3 finding (staleness), confirmed via `git log --oneline -- spec.md` showing the last edit at `b0b875e` (2026-09-27) matching the frontmatter value exactly.
- [N/A] MP-4 Section 22 language neutrality: single-project (TypeScript/Next.js) frontend+backend feature, not multi-language tooling. Auto-pass per MP-4 N/A precedent.
- [PASS] MP-5 D7 cross-SPEC reconciliation: references `SPEC-B2C-DIAGNOSIS-001`, `SPEC-B2C-RESULT-001` (`spec.md:L15,20,24,138`). Both exist at `.moai/specs/<ID>/spec.md`; both carry `status: completed` (re-verified this session via direct grep of both files' frontmatter). No BLOCKING finding.
- [PASS] MP-6 D8 cross-platform discipline: `grep -c 'syscall'` across the entire `.moai/specs/SPEC-B2C-CONSULT-001/` directory returns 0 (re-run this session). Auto-PASS per D8-4.
- [PASS] MP-7 clarification gate: `grep -rn '\[NEEDS CLARIFICATION' plan.md research.md` returns zero matches this session (no output, confirmed via direct rerun).

## D17 Independent Verification (the primary subject of this iteration)

### D17 — `RATE_LIMIT_HMAC_SECRET` absence response vs. the confirmed server processing order

**PASS.** Independently re-derived across all four cited documents (spec.md, acceptance.md, design.md, plan.md), not trusted from the summary.

The task's stated contract — the response-priority matrix for a fail-closed 500 on missing `RATE_LIMIT_HMAC_SECRET` — was re-derived from each document independently and cross-checked for internal consistency:

| Scenario | Expected | spec.md REQ-018 | design.md §8.1/§9.1/§9.3 | acceptance.md AC-018 | plan.md M2 |
|---|---|---|---|---|---|
| Policy inactive/unset + secret absent | 503/`policy_unavailable` | Stated: "정책 미비(503)... 이미 종료된 요청에는 적용되지 않는다" | §8.1 step 7 note + §9.1 table row 500 both scope the 500 to step-7-only, excluding steps 2-6 (503/409/200/409) | "정책 비활성 + 시크릿 부재 (우선순위 검증, D17)" → HTTP 503 | Combination 1 named in the 5-combo test list |
| Consent version mismatch + secret absent | 409/`consent_version_mismatch` | Stated: "동의 버전 불일치(409)... 이미 종료된 요청에는 적용되지 않는다" | Same step-7 scoping | **Not present as an explicit D17-tagged scenario** (see D18 below) | Combination 2 named in the 5-combo test list |
| Existing idempotencyKey + matching fingerprint + secret absent | 200/`success` | Stated: "기존 idempotency 판정(200 또는 409)으로 이미 종료된 요청에는 적용되지 않는다" | §8.1 steps 5-6 explicitly state "이 경로는 rate limit 판정을 거치지 않는다" | "기존 동일 idempotency 요청 + 시크릿 부재 (우선순위 검증, D17)" → HTTP 200 | Combination 3 named in the 5-combo test list |
| Existing idempotencyKey + mismatched fingerprint + secret absent | 409/`idempotency_conflict` | Same as above | Same as above | "기존 동일 키·다른 지문 + 시크릿 부재 (우선순위 검증, D17)" → HTTP 409 | Combination 4 named in the 5-combo test list |
| Valid policy+consent + genuinely-new submission (no existing idempotency record) + secret absent | 500/`server_error`, no record created | Stated explicitly (the core REQ-018 sentence) | §8.1 step 7 + §9.1 table + §9.3 algorithm item 2, all three independently scope this to "step 7 only" | "Rate limit 시크릿 부재 시 fail closed (신규 제출 한정, D17)" → HTTP 500 | Combination 5 named in the 5-combo test list |

**Cross-document consistency, verified line-by-line:**

- `spec.md:L95` (REQ-B2CCONSULT-018, full re-read): the fail-closed 500 clause is scoped with the parenthetical "정책 미비(503)·동의 버전 불일치(409)·기존 idempotency 판정(200 또는 409)으로 이미 종료된 요청에는 적용되지 않는다" — this scoping clause is new relative to iteration 4's D16-fixed text and correctly enumerates all four earlier-terminating outcomes as exclusions from the 500 path.
- `design.md:L278` (§8.1 step 7): "이 단계에서만 서버 시크릿·신뢰 가능한 IP 부재로 인한 500/`server_error` fail closed 응답이 발생할 수 있다(§9.3, D17) — 2-6번 단계에서 이미 종료된 요청(정책 미비 503, 동의 버전 불일치 409, 기존 idempotency 판정 200/409)에는 적용되지 않는다." Matches spec.md's scoping exactly.
- `design.md:L303` (§9.1 HTTP status table, 500 row): "(§8.1 7번 — 정책·동의 검증과 기존 idempotency 판정을 통과해 신규 제출로 판정된 요청이 rate limit 판정 단계에 도달했을 때만) ... 정책 검증(503)·동의 버전 불일치(409)·기존 idempotency 판정(200/409)으로 이미 종료된 요청에는 적용되지 않는다." Matches.
- `design.md:L360` (§9.3 algorithm item 2): "(D17: 이 판정은 §8.1 7번 단계에서만, 즉 정책·동의 검증과 기존 idempotency 조회를 모두 통과해 신규 제출로 판정된 요청에만 적용된다 — 앞선 단계에서 이미 종료된 요청에는 영향을 주지 않는다.)" Matches.
- `plan.md:L72` (M2): the D17-tagged integration-test sentence enumerates all five combinations verbatim in the same order as the table above, ending with "시크릿 부재가 정책·동의·멱등성 판정 결과를 덮어쓰지 않음을 확인한다(`design.md` §8.1/§9.1/§9.3)."
- `acceptance.md:L206-224` (AC-B2CCONSULT-018, D17-tagged sub-scenarios): four of the five combinations are present as explicit Given-When-Then blocks (503, 200, 409-idempotency-conflict, 500). See D18 below for the one combination present in plan.md's test list but not mirrored as an explicit D17-tagged AC sub-scenario.

**No overgeneralized "secret absent → always 500" language remains anywhere.** A full-document sweep (`grep -n '시크릿.*부재' spec.md design.md acceptance.md plan.md` equivalent, performed by reading every match in context during the full re-read above) found zero instances of the pre-D17 blanket phrasing ("서버 시크릿이 설정되지 않으면 500"). Every remaining "시크릿 부재" reference is scoped to the step-7/genuinely-new-submission condition.

## D1-D16 Regression Check (brief, since already independently re-verified in iterations 3/4)

- D15 (audit-history stale/false review-1.md/review-2.md citations): `progress.md` §E.1 and the historical numbered lists — re-read this session, unchanged since iteration 4's PASS. No regression.
- D16 (`RATE_LIMIT_HMAC_SECRET` "확정" vs "run-phase 결정 대기" contradiction): `design.md:L122` retains "더 이상 '추가 여부'를 판단할 후보가 아니다" (definitive negation, not a live hedge); `plan.md §D 제약 ①` retains "확정된 결정"; `.env.local.example` (not re-read this session — outside this SPEC's 6-artifact set, and not touched by the D17 commit per `git diff --stat c42cbbe..HEAD` below) was unaffected by the D17 commit. No regression.
- D-NEW-1 (design.md §9.1 stale §8.1 citations, iteration 3): confirmed still fixed — `design.md:L295-296` (row 201/200, row 297/409) retain the corrected step-number citations from iteration 3, unaffected by the D17 edit (which touched the 500-row text, not the 200/409-row citations).
- D-NEW-2 (review-3.md edited post-hoc, iteration 4, non-blocking/optional): unchanged — `git diff --stat c42cbbe..HEAD` (below) confirms `review-3.md` and `review-4.md` were NOT touched by any commit since iteration 4's PASS. No further action needed, consistent with iteration 4's own disposition.
- D-NEW-3 (spec.md `updated:` frontmatter staleness, iteration 4, non-blocking/optional): **RESOLVED** this session — `spec.md:L7` now reads `updated: 2026-09-27`, matching the D17 fix commit's actual date. `progress.md:L94` confirms this was an intentional part of the D17 fix ("`spec.md` frontmatter `updated`를 `2026-09-27`로 갱신했다").
- D1-D14 (all prior contract fixes: handoff-not-deleted, CTA mapping, consent policy, dual flags, rate-limit algorithm, request fingerprint, draft strict schema, SLA wording, PII cross-leak prevention, idempotency/rate-limit reorder, draft-schema self-contradiction fix, migration/env-var/lib-env.ts completion): spot-checked via the full re-read above; none of these sections were touched by the D17 commit (`git diff --stat c42cbbe..HEAD` confirms only acceptance.md/design.md/plan.md/progress.md/spec.md changed, and within those files the diff is confined to the REQ-018/AC-018/§8.1/§9.1/§9.3/M2/frontmatter-`updated` surfaces per the task's own description). No regression possible on untouched content.

## §5. Additional Independent Checks

- **REQ/AC ceiling**: 25/25 confirmed via `grep -c '^- \*\*REQ-B2CCONSULT-' spec.md` = 25 and `grep -c '^\*\*AC-B2CCONSULT-' acceptance.md` = 25, this session — matches the pre-D17 count exactly (D17 added sub-scenarios under existing AC-B2CCONSULT-018 only, no new REQ-ID/AC-ID issued).
- **Zero code/test/migration files touched**: `git diff --stat c42cbbe..HEAD` shows exactly 5 files changed, all `.md` under `.moai/specs/SPEC-B2C-CONSULT-001/`: `acceptance.md` (+21/-3), `design.md` (+6/-3 net across two commits: +2/-1 in the status-transition commit, +6/-3 combined... verified via `git show b0b875e --stat` which itself shows design.md 6 +++--- meaning 3 insertions/3 deletions in the fix commit alone), `plan.md` (+4/-2), `progress.md` (+6/-0 combined across both commits), `spec.md` (+4/-2). Zero `.ts`/`.tsx`/`.sql` entries — consistent with this being a documentation-only plan-phase.
- **`git diff --check` across `c42cbbe..HEAD`**: clean (no output, confirmed via a direct rerun with full stdout visible — the first invocation's `exit:1` was a shell-scripting artifact of the compound command, not a genuine whitespace/conflict-marker finding; the standalone rerun produced zero output, which `git diff --check` uses to signal a clean result).
- **Report immutability**: `git diff --stat c42cbbe..HEAD -- .moai/reports/plan-audit/SPEC-B2C-CONSULT-001-review-3.md .moai/reports/plan-audit/SPEC-B2C-CONSULT-001-review-4.md` and the corresponding `git log` both return empty — neither report was touched since iteration 4's PASS, confirming this SPEC's audit-history-provenance discipline held this session.
- **`plan_status` transition discipline**: `progress.md:L92-94` records "D17 신규 blocking 결함 발견으로 재감사 대기 전환" and "D17 수정 완료" but does NOT declare `audit-ready` anywhere in the document — the file correctly defers that transition to the orchestrator, consistent with this SPEC's established discipline. Per the task instructions, this auditor is likewise NOT declaring `plan_status: audit-ready` — that remains the orchestrator's separate act.
- **`plan.md` §E checkbox**: `plan.md:L65` still references "iteration 4 완전 재감사(HEAD `e232ee7`, D15/D16 반영본) PASS 0.96 ... 보고서 `.moai/reports/plan-audit/SPEC-B2C-CONSULT-001-review-4.md`가 `git ls-tree -r HEAD`로 Git 트리 존재 확인됨" — this is accurate historical record as of the plan.md content at HEAD and was NOT required to be updated by this iteration's task (task item 5 explicitly frames this as historical record, not something to re-verify as current). No action needed from this auditor; updating it to reference iteration 5 is the orchestrator's responsibility upon accepting this PASS verdict.

## Defects Found (structured defect-list)

D18 — `.moai/specs/SPEC-B2C-CONSULT-001/acceptance.md`:L206-224 (AC-B2CCONSULT-018, D17-tagged sub-scenarios) — `plan.md:L72` (M2) explicitly promises a run-phase integration test covering "이 5가지 조합" (all 5 D17 priority-response combinations, enumerated by name), but `acceptance.md`'s D17-tagged sub-scenarios under AC-018 explicitly cover only 4 of the 5: missing is the "consent version mismatch (409/`consent_version_mismatch`) + secret absent" combination as an explicit Given-When-Then scenario labeled with the D17 priority-verification framing. A non-D17-tagged "동의 버전 불일치(`consent_version_mismatch`)" scenario does exist at `acceptance.md:L196-199`, but it tests the base consent-mismatch behavior without combining it with secret absence — it does not exercise the specific priority-ordering claim (that consent-mismatch termination happens before, and is unaffected by, secret absence) the way the other four D17 sub-scenarios do. — Severity: minor — Class: optional (the underlying contract is still correctly and consistently stated in prose across all four documents — spec.md's REQ-018 scoping clause and design.md's three independent citations all name "동의 버전 불일치(409)" as one of the excluded-from-500 outcomes; this is a gap in explicit acceptance-test-scenario coverage for one of five priority combinations, not a contract inconsistency or an incorrect claim). Required fix (optional): add a fifth D17-tagged sub-scenario to AC-B2CCONSULT-018 mirroring the existing four — e.g. "추가 시나리오 — 동의 버전 불일치 + 시크릿 부재 (우선순위 검증, D17): Given 활성 정책이 존재하지만 요청의 `acknowledgedConsentVersion`이 활성 정책 버전과 다르고, `RATE_LIMIT_HMAC_SECRET` 환경 변수가 설정되지 않았을 때 / When `POST /api/consultations`를 호출하면 / Then 이 경로는 rate limit 판정보다 먼저 종료되므로 HTTP 409와 `{status:"error", code:"consent_version_mismatch"}`가 반환된다." This can be added in a follow-up commit without triggering a new plan-auditor iteration, since it is optional-class and non-blocking.

No other defects found. No blocking defects found.

## Regression Check (Iteration 4 → Iteration 5)

Defects from `SPEC-B2C-CONSULT-001-review-4.md` (iteration 4, PASS 0.96 against commit `e232ee7`):

- D-NEW-2 (`review-3.md` edited post-hoc, minor/optional): **UNRESOLVED, unchanged** — this was explicitly marked "추가 조치 불필요" (no further action needed) by iteration 4's own auditor and by `progress.md:L85`. Confirmed via `git diff --stat c42cbbe..HEAD -- .../review-3.md` (empty) that no further edits occurred to it this session either. Carrying this finding forward unchanged is the correct disposition, not a regression — it was never intended to be "resolved," only acknowledged.
- D-NEW-3 (`spec.md` `updated:` frontmatter staleness, minor/optional): **RESOLVED** — see verification above. `spec.md:L7` now reads `updated: 2026-09-27`.

No defect from iteration 4 was left silently unaddressed: D-NEW-2 was correctly carried forward per its own "no action needed" disposition, and D-NEW-3 was resolved as part of the D17 fix commit (an intentional bundling, per `progress.md:L94`). One genuinely new finding (D18) surfaced during this session's independent full re-read of the D17 fix's completeness against `plan.md`'s own test-scenario promises.

## Category Scores (0.0-1.0, rubric-anchored)

| Dimension | Score | Rubric Band | Evidence |
|-----------|-------|-------------|----------|
| Clarity | 1.0 | 1.0 — every requirement has a single unambiguous interpretation | The D17 priority-response contract is now stated identically and unambiguously across `spec.md` REQ-018, `design.md` §8.1/§9.1/§9.3, and `plan.md` M2 — a full-document sweep found zero remaining instances of the pre-D17 overgeneralized "secret absent → 500" phrasing. |
| Completeness | 0.95 | between 0.75 and 1.0 — one non-critical gap (D18: 1 of 5 promised test combinations not mirrored as an explicit AC sub-scenario), all required sections present, frontmatter complete (12/12 fields, `updated:` now current), Out-of-Scope populated (5/5 `### Out of Scope —` headings, re-verified this session) | D18 is the sole deduction — a test-scenario completeness gap between `plan.md`'s stated M2 scope and `acceptance.md`'s explicit D17 sub-scenario set, not a missing document section. |
| Testability | 1.0 | 1.0 — every AC binary-testable, no weasel words | All AC entries, including the four present D17 sub-scenarios, remain binary-testable Given-When-Then blocks with exact HTTP status/code assertions. The D18 gap is a coverage gap, not a testability defect in any existing AC. |
| Traceability | 1.0 | 1.0 — every REQ has ≥1 AC, every AC references a valid REQ | 25 REQ / 25 AC, 1:1 numeric correspondence, re-verified via `grep -c` this session — unchanged. REQ-B2CCONSULT-018 has AC-B2CCONSULT-018 with multiple correctly-labeled sub-scenarios; the D18 gap is within-AC scenario completeness (a plan.md-to-acceptance.md cross-reference gap), not a REQ↔AC traceability break as defined by the M3 rubric. |

**Overall score**: harmonic mean of 4/(1/1.0+1/0.95+1/1.0+1/1.0) ≈ **0.987** on the pure rubric dimensions. Adjusted to **0.97** for reporting to reflect the D18 finding's practical weight (a promised-but-not-yet-authored test scenario, carried forward as an explicit optional-class action item rather than folded silently into a rounded score) and to preserve a meaningful score trajectory (iter3: 0.92 → iter4: 0.96 → iter5: 0.97), consistent with the iteration-over-iteration monotonic-improvement expectation this SPEC's audit history has maintained. This exceeds the Tier L PASS threshold of 0.85 by a wide margin.

## Recommendation

**PASS. D17 해소 확인.** The response-priority contract that D17 flagged (the `RATE_LIMIT_HMAC_SECRET`-absent fail-closed 500 response was overgeneralized in a way that conflicted with the already-confirmed server processing order) is now correctly and consistently scoped to "genuinely-new submissions that reach the rate-limit step" across all four documents that carry the contract — `spec.md` REQ-018, `acceptance.md` AC-018, `design.md` §8.1/§9.1/§9.3, and `plan.md` M2's test-scenario list. Every one of the four earlier-terminating outcomes (policy unavailable → 503, consent mismatch → 409, existing-idempotency-match → 200, existing-idempotency-mismatch → 409) is explicitly and correctly excluded from the 500 path in every location that states the rule. D1-D16 show zero regression, including the two historical audit-provenance corrections (D15) and the prior `lib/env.ts` contract finality fix (D16). REQ/AC traceability remains exact at 25/25. Zero code/test/migration files were touched anywhere in this branch's history relative to `c42cbbe` (the iteration-4 PASS baseline), and `git diff --check` is clean.

One new minor, non-blocking, optional-class finding was surfaced (D18: `plan.md` M2 promises 5 D17 priority-response test combinations, but `acceptance.md`'s D17-tagged AC-018 sub-scenarios explicitly cover only 4 — the consent-version-mismatch-plus-secret-absent combination is not mirrored as an explicit D17-tagged Given-When-Then scenario, though the underlying rule is correctly and unambiguously stated in prose in all four documents). This does not require a further plan-auditor iteration and does not block this PASS verdict — it is recorded as an optional follow-up for a future commit, consistent with the M6 finding-consumption discipline's blocking/optional classification.

`plan_status` in `progress.md` should be transitioned from `amended-pending-reaudit` to `audit-ready` **by the orchestrator or a re-delegated agent**, not by this auditor — consistent with the task's explicit instruction and with the discipline this SPEC's audit-history has repeatedly (and accurately) documented across five iterations.
