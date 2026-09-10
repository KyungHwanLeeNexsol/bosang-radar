# SPEC-PILOT-READY-001 — Progress

## §E.1 Plan-phase Audit-Ready Signal

- `plan_status: audit-ready`
- `plan_complete_at: 2026-09-10`
- Tier: M (3 artifacts — spec.md + plan.md + acceptance.md)
- REQ count: 16 (ceiling for Tier M: 16) — **at budget ceiling** (v0.3.0, +1: REQ-PILOT-READY-016;
  v0.4.0 adds no new top-level REQ — REQ 16/16 unchanged)
- AC count: 16 top-level (ceiling for Tier M: 16) — at budget ceiling (v0.3.0 adds no new
  top-level AC number; AC-PILOT-READY-016 split into sub-clauses 016a/016b per the
  AC sub-ID pairing convention; v0.4.0 adds no new top-level AC number — new v0.4.0
  scenarios are sub-clauses (`And ...`) appended to the existing AC-PILOT-READY-007 and
  AC-PILOT-READY-016b bodies; AC 16/16 unchanged; v0.5.0 likewise adds no new
  top-level REQ or AC number — REQ 16/16, AC 16/16 unchanged)

### v0.5.0 revision (external review, fourth round — exceeds the documented 3-audit-iteration cap)

- **Cap-exceedance override recorded**: this SPEC's plan-phase has now undergone 4
  external-review revision rounds (v0.2.0, v0.3.0, v0.4.0, v0.5.0), exceeding the
  plan-auditor Retry Loop Contract's documented "Max 3 iterations cap (hard limit)"
  (`.claude/agents/moai/plan-auditor.md` § Retry Loop Contract). The orchestrator
  explicitly warned the user of this cap-exceedance before dispatching this revision,
  and the user explicitly confirmed proceeding anyway via `AskUserQuestion` — this
  confirmation is the override rationale for continuing beyond the documented cap.
- Branch: `plan/SPEC-PILOT-READY-001` (not merged; baseline
  `plan/SPEC-PILOT-READY-001@6ca56e39562499f8e2d2513c9212b9de7ff510b5`, itself the
  v0.4.0 HEAD)
- Trigger: external reviewer fourth-round correction requests (5 items)
- Decisions RESOLVED in this revision (no longer open):
  1. The actual `pilot-ready-readiness-decision-2026-09-10.md` template file had gone
     stale since v0.4.0's 6-item-to-7-item precision pass — it still carried 6 items,
     old milestone-count wording, and a bare `unfilled` state. Synced to 7 items,
     added the per-item READY criteria section mirroring AC-PILOT-READY-016b verbatim,
     and filled the template's CURRENT plan-phase state as 7×`UNVERIFIED` + overall
     `NO-GO` (an honest plan-phase determination, not a blank placeholder) — with new
     process language distinguishing "blank/unfilled" (allowed only as the initial
     plan-phase draft state) from "UNVERIFIED" (a legitimate final determination).
  2. REQ-PILOT-READY-003 (Gemini quota check) elevated from an Ubiquitous
     documentation-only checklist item ("not executed in this session") to a When
     (event-driven) run-phase execution requirement — the actual AI Studio dashboard
     check must be performed and recorded (date, performer, observed limit, chosen
     RPM budget values) during this SPEC's run-phase. Corrected an overly strict
     implication in REQ-PILOT-READY-016 item(2) / AC-PILOT-READY-016b item(2) ("RPM
     staying at the unverified default of 4" read as an automatic UNVERIFIED/FAIL
     regardless of evidence) — the correct rule is that RPM=4 is acceptable as long
     as evidence shows 4 is actually ~70-80% of the real observed quota limit; only
     an unperformed dashboard check (no evidence at all) triggers UNVERIFIED.
  3. Fixed a real design/AC error in REQ-PILOT-READY-007(3): the completion
     transaction rollback (on a `reports` INSERT failure) correctly leaves the
     `reservations` lease row present immediately post-rollback (the DELETE step
     rolls back too) — that part was already accurate and is kept. What was missing
     was the subsequent catch-path handling: added a new "(3-보충)" requirement that
     the transaction-failure catch path performs a SEPARATE fenced `DELETE`
     (`ownerUserId` AND `leaseId` match) to actually release the lease, enabling
     immediate resubmission by the same user rather than forcing a wait for TTL
     expiry (up to 330s). This does NOT weaken or replace the 4-step single
     transaction hard requirement (no fallback) — it is a distinct recovery action
     that runs only after that transaction has already failed and rolled back. Added
     a matching AC-PILOT-READY-007 sub-clause verifying the post-rollback lease
     deletion and immediate clean reacquisition.
  4. Quantified the previously vague "comfortably within maxDuration" hosting-gate
     criterion: REQ-PILOT-READY-002's measurement now requires a minimum of 3
     individual execution runs (each recorded individually); REQ-PILOT-READY-016 item
     (1) / AC-PILOT-READY-016b item(1) READY bar is now "the maximum observed
     processing time across those ≥3 runs, measured against the real deployed
     domain, is ≤270 seconds" (a ~30s safety margin below the 300s `maxDuration`, to
     absorb platform-level cold-start/overhead beyond the measured pipeline logic
     itself) — a concrete, binary-testable numeric criterion replacing "comfortably".
  5. Clarified the test methodology for the AC-PILOT-READY-007 "realistic worst-case
     duration (~200s+) guard-holds" scenario in both plan.md (M6 design note) and
     acceptance.md (the AC sub-clause itself): this test uses a fake timer/mock clock
     to simulate elapsed time, NOT a real 200+ second wall-clock wait — explicitly
     stated to prevent a run-phase implementer from writing a literal 200+ second
     sleep in the test.
- Manual 5-way cross-read findings (spec.md + plan.md + acceptance.md + progress.md +
  the actual `.moai/reports/pilot-ready-readiness-decision-2026-09-10.md` template,
  per the team-lead's verification discipline request): (a) confirmed the readiness
  template's 7 gate items now match AC-PILOT-READY-016b's 7 gate items exactly in
  name and READY-bar criteria (item-by-item cross-check performed, including the new
  270s/3-run hosting bar and the RPM=4-with-evidence correction on item 2); (b)
  confirmed the corrected AC-PILOT-READY-007 lease-release contract (post-rollback
  catch-path DELETE + immediate reacquisition) matches what plan.md §A 결정 3 and
  plan.md M1's completion-record section now describe — the same fencing pattern
  (`ownerUserId` AND `leaseId`), the same "does not weaken the 4-step transaction"
  framing, and the same double-failure/TTL-fallback edge case; (c) confirmed the
  quantified 270s/≥3-run criteria from item 4 appear consistently in spec.md
  REQ-PILOT-READY-002/016, plan.md (the timeout-measurement and readiness-decision
  M4 bullets), acceptance.md (AC-PILOT-READY-002/016b), and the readiness-decision
  template's new per-item READY criteria section — no drift found between the five
  documents on any of the five items above.
- REQ/AC count verification: REQ 16/16, AC 16/16 — unchanged from v0.4.0 (this
  revision is corrections/precision additions as sub-clauses on existing REQ/AC
  numbers only, per the Tier M budget ceiling; no new top-level REQ or AC number was
  added).

### v0.4.0 revision (external review, third round)

- Branch: `plan/SPEC-PILOT-READY-001` (not merged; baseline `plan/SPEC-PILOT-READY-001@579b20d`,
  itself branched from `plan/SPEC-PILOT-READY-001@fbcd657` → `main@7ebb3b7`)
- Trigger: external reviewer third-round correction requests (6 items) — see spec.md
  HISTORY v0.4.0 entry for full detail
- Decisions RESOLVED in this revision (no longer open):
  1. Lease TTL design flaw — TTL is no longer derived from the local happy-path
     measurement (30s → 60s). It is now anchored to the route's declared
     `maxDuration = 300` (Next.js route segment config) plus a safety margin:
     `LEASE_TTL_SECONDS >= 330`. Static-TTL vs. heartbeat-renewal alternatives are
     explicitly compared in plan.md §A 결정 1, with static TTL adopted for this
     pilot's low-frequency ~10-user scale.
  2. Completion-write transaction atomicity/fencing — confirmed implementable via
     direct source-code verification of `@libsql/client@0.17.4` (main package) and
     `drizzle-orm@0.45.2` (interactive transactions over remote `libsql://` HTTP,
     with real commit/rollback). The design is finalized as a single hard
     `db.transaction()` covering lease-ownership check + `cases` INSERT + `reports`
     INSERT + `reservations` DELETE, with NO fallback branch — a driver regression
     discovered at run-phase is now a REQ-PILOT-READY-007 FAIL / pilot NO-GO, not a
     silently-relaxed alternative.
  3. Readiness gate criteria — precise per-item READY bars added for all 7 items
     (was 6; Gemini quota promoted to its own independent gate item, distinct from
     hosting); hosting suitability now requires BOTH the tier decision AND real
     deployed-environment timeout measurement evidence.
  4. Readiness-decision template process — explicit run-phase-completion requirement
     added: all 7 rows + overall GO/NO-GO MUST be filled by the final milestone (an
     unfilled template is not an acceptable run-phase completion state; a filled-in
     NO-GO verdict IS acceptable).
  5. Stale Option-B UI-impact concern (recent-research-panel processing/failed
     labels) — reclassified as no-longer-applicable under the lease design (`cases`
     rows are only ever created on pipeline success, so `processing`/`failed` rows
     are never written).
  6. plan.md §F item-count mismatch ("위 5개 항목" vs. 6 actual table rows) — fixed;
     actual production domain value and remote Turso target value explicitly
     elevated to run-phase required-blockers (independent of the Vercel tier
     business decision, which remains unconfirmed).
- Manual cross-read findings (per team-lead's verification discipline request):
  (a) confirmed the TTL fix's rationale no longer cites the 30s local measurement
  alone as sufficient — it is now anchored to `maxDuration` + margin, with the old
  justification sentence explicitly named and rejected in HISTORY/plan.md; (b)
  confirmed no "verify lease ownership outside the transaction" fallback path
  remains — REQ-PILOT-READY-007(3) and plan.md M1's completion-record section now
  state the 4-step transaction as the sole path, with the fallback policy framed
  as "driver regression → FAIL/NO-GO", not as a design alternative; (c) confirmed
  each of the 7 readiness-gate items in AC-PILOT-READY-016b carries a precision
  clause naming the specific evidence a run-phase implementer must have before
  marking that item READY (hosting: decision+measurement; Gemini quota: dashboard
  check+recorded values; concurrent load: no unhandled failures; storage/recovery:
  remote-target-only); (d) confirmed the stale Option-B UI concern is reclassified
  (not merely reworded) in both spec.md Out of Scope and plan.md §D Risk 6, with
  the reclassification rationale (cases rows never written under the lease design)
  stated explicitly in both places.
- REQ/AC count verification: REQ 16/16, AC 16/16 — unchanged from v0.3.0 (this
  revision is wording/precision-only per the Tier M budget ceiling; no new
  top-level REQ or AC number was added).

### v0.3.0 revision (external review, second round)

- Branch: `plan/SPEC-PILOT-READY-001` (not merged; baseline `plan/SPEC-PILOT-READY-001@fbcd657`,
  itself branched from `main@7ebb3b7`)
- Trigger: external reviewer second-round correction requests (7 items) — see spec.md
  HISTORY v0.3.0 entry for full detail
- Decisions RESOLVED in this revision (no longer open):
  1. REQ-PILOT-READY-007 원자성 구현 방식 — **옵션 A(리스/lease 기반 예약 테이블)로
     단독 확정**. 옵션 B(컬럼 재사용)는 기각된 대안으로 plan.md §A 결정 1에만 기록.
  2. 완료 기록(`cases`+`reports`)의 동일 트랜잭션 원자성 — 하드 요구사항으로 격상
     (REQ-PILOT-READY-007(3)).
  3. REQ-PILOT-READY-015 4개 실패 모드 재판정 — (a)/(b)/(d) 해결됨(TTL 재획득/동일
     트랜잭션/leaseId 펜싱), (c)만 여전히 의도적 gap.
- Open/unconfirmed decisions carried forward to Implementation Kickoff Approval
  (§F 체크리스트 참고, plan.md):
  1. Vercel 프로젝트/tier/실제 프로덕션 도메인 — Pro tier 권고, 최종 확정은 미확정
     (unconfirmed).
  2. 원격 Turso 대상 — unconfirmed / required-blocker.
  3. 지원 연락처 이메일 주소 — unconfirmed / required-blocker.
  4. 장애 대응 triage 담당자 — unconfirmed / required-blocker.
  5. Gemini 쿼터 점검 담당자 + 시점 — unconfirmed.
  6. 동시성 측정용 테스터 계정 3-5개 준비 방법 — unconfirmed.
- Items resolved in this revision (no longer open): item 4 (readiness-decision 리포트
  템플릿 신규 작성, REQ-PILOT-READY-016 + AC-PILOT-READY-016b), item 5 (PII 고지 문구를
  리뷰어의 정확한 문구로 전면 교체 + 구조적 사실/잔여 위험 구분 명시), item 7
  (README.md/product.md에 누락됐던 SPEC-GEMINI-RUNTIME-001 추가, 별도 커밋 없이 이
  SPEC의 revision 커밋에 포함)

### v0.2.0 revision (external review, first round — superseded by v0.3.0 above)

- Branch: `plan/SPEC-PILOT-READY-001` (baseline `main@7ebb3b7`)
- Trigger: external reviewer correction requests (6 items) — see spec.md HISTORY
  v0.2.0 entry for full detail
- Items resolved in this revision (no longer open): item 3 (AC 세분화·로컬 대체
  증거 원칙·측정-vs-판단 분리), item 5 (PII 스캔 범위 진술 재확인 — 원래부터
  정확했음을 확인), item 6 (README.md/product.md 로드맵 갱신, 별도 커밋)

## §F Phase 4 Mode Selection

**Input parameters**:
- Tier: M
- Scope (file count): ~7 files for M1-M3+M6 (lib/db/schema.ts, lib/cases/create-case.ts, app/api/cases/route.ts, app/cases/new/page.tsx, app/login/login-form.tsx, lib/cases/create-case.test.ts, + a new Drizzle migration file)
- Domain count: 1 (single Next.js/TypeScript codebase, no cross-domain fan-out)
- File language mix: 100% TypeScript
- Concurrency benefit: LOW — coding-heavy sequential implementation (Anthropic coding-task parallelism caveat), not research-heavy
- Agent Teams prereqs: not requested

**Mode evaluation**:
| Mode | Selected? | Rationale |
|------|-----------|-----------|
| direct | No | Non-trivial: new DB table, transaction logic, multiple file edits |
| serial | **Selected** | Coding-heavy, single-domain, Tier M scope — the default fallback per Anthropic's coding-task parallelism caveat |
| fanout | No | Single domain, <3 domains and <10 files — does not meet the fanout threshold |
| sweep | No | Not genuinely-parallel mechanical work; semantic code changes |

**Decision: serial**

**Justification**: This is coding-heavy implementation work (DB schema + transaction logic + route handler + UI copy + tests) within a single domain and well under the fanout threshold (≥3 domains OR ≥10 files). Per Anthropic's coding-task parallelism caveat, sequential single-agent delegation is the correct default for coding tasks. manager-develop will proceed through M1→M2→M3→M6 sequentially within one delegation; M4 (operational measurement reports requiring real infrastructure not currently available) is explicitly out of scope for this run-phase entry per Implementation Kickoff Approval — M4 items will be returned as structured blocker reports rather than attempted, consistent with REQ-PILOT-READY-016's "SPEC implementation complete ≠ pilot external launch ready" separation. M5 (incident runbook, a doc-only milestone with no infra dependency) is included.

**Boundary case**: none — this is a clear-cut serial case (1 domain, well under both the 3-domain and 10-file fanout thresholds).

## §E.2 Run-phase Evidence

Delegation scope: M1, M2, M3, M5, M6 (M4 explicitly out of scope per Implementation
Kickoff Approval — see § M4 Consolidated Blocker Report below). cycle_type=tdd.

### AC PASS/FAIL Matrix

| AC | Status | Verification Command | Actual Output |
|----|--------|----------------------|----------------|
| AC-PILOT-READY-001 | N/A (M4-scoped) | — | Vercel tier/domain decision — operational, out of this delegation's scope |
| AC-PILOT-READY-002 | N/A (M4-scoped) | — | real-environment timeout measurement — out of scope |
| AC-PILOT-READY-003 | N/A (M4-scoped) | — | Gemini quota dashboard check — out of scope |
| AC-PILOT-READY-004 | N/A (M4-scoped) | — | remote Turso migration verification — out of scope |
| AC-PILOT-READY-005 | N/A (M4-scoped) | — | real-domain auth verification — out of scope |
| AC-PILOT-READY-006 | N/A (M4-scoped) | — | cross-user concurrent load measurement — out of scope |
| AC-PILOT-READY-007 | **PASS** | `pnpm exec vitest run lib/cases/create-case.test.ts` | 13/13 tests pass — covers: 2nd-call-blocked-while-1st-in-flight, retry-after-failure re-invokes runPipeline, completion-transaction atomicity (circular-content-forced `reports` INSERT failure leaves 0 `cases` rows), post-failure explicit lease release + immediate reacquisition (v0.5.0), worst-case 200s+ guard-hold under fake timers, TTL(330s) crash recovery with before/after contrast, delayed-result fencing (stale lease's late completion is a no-op, current lease row unchanged), genuine race condition via `Promise.all` against a real file-based SQLite engine enforcing the `reservations.owner_user_id` PK/UNIQUE constraint (exactly 1 of 2 concurrent acquires wins) |
| AC-PILOT-READY-008 | **PASS** | `pnpm exec vitest run app/api/cases/route.test.ts lib/pipeline/index.test.ts lib/cases/create-case.test.ts` | Request-start log (`case_request_received`, `route.test.ts`), per-stage pipeline failure log (`pipeline_stage_failed` with `stage` field, `pipeline/index.test.ts` — verified by spying on `query-planner.planQueries`), pipeline-level + completion-transaction DB-write failure logs (`pipeline_failed`/`completion_transaction_failed`, `create-case.test.ts`) — all 3 scenarios PASS; none of the log call args include raw `incidentDescription`/`diagnosisName`/`disabilityBodyPart` values (logs carry only `event`/`stage`/`error: String(error)` — error messages here are static strings like `"pipeline boom"`, `"query-planner boom (test-injected)"`, never the input payload) |
| AC-PILOT-READY-009 | **PASS** | `Read .moai/docs/pilot-incident-runbook.md` | Doc created with 3 distinct sections: §1 log locations/how-to-check (event-name table), §2 tester retry guidance (explicitly avoids "unlimited retry is always safe" overclaim), §3 triage owner (honestly marked "미확정 — required-blocker", not fabricated). Distinct file from `.moai/docs/runtime-runbook.md` |
| AC-PILOT-READY-010 | N/A (M4-scoped) | — | real Gemini smoke re-run — out of scope |
| AC-PILOT-READY-011 | **PASS** | `pnpm exec vitest run app/cases/new/page.test.tsx` (그리고 `grep -rn "완전히 비식별화\|확실히 차단\|보장합니다\|보장한다" app/cases/new/page.tsx` → 렌더 텍스트에는 미검출, 코드 주석에서만 1건 검출) | Rendered notice text contains no "보장"/"확실히 차단"/"완전히 비식별화" |
| AC-PILOT-READY-012 | **PASS** | `pnpm exec vitest run app/cases/new/page.test.tsx` | Notice DOM contains all 4 required items individually: (a) 주민등록번호·휴대전화번호 형식 검사 설명, (b) 주소·의료기록 원본 필드 부재(구조적 사실), (c) 자유 텍스트 필드 잔여 위험(구조적 사실과 구분해 별도 문단으로 진술), (d) 합성/비식별화 사례만 입력하라는 테스터 책임 문장 |
| AC-PILOT-READY-013 | **PASS** | `pnpm exec vitest run app/login/login-form.test.tsx` | "고객지원" is now an active `<a href="mailto:...">` (not `aria-disabled`) — default fallback uses the RFC 2606 reserved `example.com` domain as an explicit placeholder (no fabricated real address); `supportEmail` prop (env-driven via `app/login/page.tsx` → `SUPPORT_CONTACT_EMAIL`) overrides it when the operator confirms the real address |
| AC-PILOT-READY-014 | **PASS** | `pnpm exec vitest run app/cases/new/page.test.tsx` | Notice includes the full synthetic example (reused verbatim from `.moai/reports/gemini-runtime-smoke-20260828.md`) with all 4 field values: 사건 경위/진단명("좌측 발목 관절 인대 파열")/장해 부위/사고 일자 |
| AC-PILOT-READY-015 | **PASS** | `pnpm exec vitest run lib/cases/create-case.test.ts -t "동시에 시작된"` | `Promise.all([createCase(...), createCase(...)])` against the same `ownerUserId`, same file-based SQLite engine — exactly 1 success + 1 `alreadyProcessing`, `runPipeline` called exactly once. No partial/transient double-start observed |
| AC-PILOT-READY-016a | N/A (M4-scoped) | — | idempotency-scope report — out of scope |
| AC-PILOT-READY-016b | N/A (M4-scoped) | — | readiness-decision report — out of scope (template already exists from plan-phase, left untouched per delegation constraint) |

### E2. Build Result

```
$ pnpm build          → exit 0 (Next.js 16.3.2, Turbopack; pre-existing instrumentation.ts
                          Edge Runtime warning only, unrelated to this SPEC)
$ pnpm exec tsc --noEmit → exit 0
```

### E3. Test Results + Coverage (touched files)

```
$ pnpm exec vitest run   → 415/415 tests pass, 59/59 test files pass (full suite, no regressions)
$ pnpm exec vitest run --coverage <touched files>
  lib/cases/create-case.ts: 97.67% stmts, 100% branch, 100% funcs, 97.67% lines
    (uncovered: line 197, the "post-failure lease release itself also fails" double-failure
    log line — a defensive-only branch plan.md §A v0.5.0 explicitly frames as a rare
    residual risk with TTL-expiry as the final fallback; not exercised by design)
  app/login/login-form.tsx: 100% stmts/funcs/lines, 94.73% branch
  lib/pipeline/index.ts: covered by the new stage-logging test + all 6 pre-existing
    integration tests (no regression)
```

### E4. N/A — no Go subagent-boundary pattern in this TypeScript/Next.js project.

### E5. Lint Status

```
$ pnpm lint   → 0 errors, 0 warnings (baseline: 0 errors, 0 warnings — no NEW issues)
```

### E6. Branch HEAD + Push State

- Branch: `plan/SPEC-PILOT-READY-001` (per explicit user instruction — this SPEC's
  entire lifecycle stays on this branch; no merge to main performed by this delegation)
- Commit SHAs: recorded in E6 Final Commit List below (backfilled post-commit, per the
  SHA placeholder backfill exemption — a commit cannot cite its own hash)
- Push: `git push origin plan/SPEC-PILOT-READY-001` — result recorded in the completion
  report

### E7. M4 Consolidated Blocker Report

M4 (7 operational-measurement reports requiring real Vercel/Turso/domain/AI-Studio
access) is explicitly OUT OF SCOPE for this delegation per Implementation Kickoff
Approval. No local/approximate substitute was silently used in place of any M4 item.
Per-item access/credential requirement:

| M4 item | Report file | Requires |
|---|---|---|
| Deployment tier decision | `pilot-ready-deployment-tier-decision-*.md` | Cost-decision-authority confirmation (Hobby vs Pro) |
| Timeout measurement | `pilot-ready-timeout-measurement-*.md` | Real deployed production domain, ≥3 individual runs |
| Gemini quota checklist | `pilot-ready-quota-checklist-*.md` | AI Studio dashboard access + a human to perform the check |
| Remote DB verification | `pilot-ready-remote-db-verification-*.md` | Real remote Turso instance credentials |
| Auth domain verification | `pilot-ready-auth-domain-verification-*.md` | Real deployed domain + `BETTER_AUTH_URL` configured against it |
| Concurrency measurement | `pilot-ready-concurrency-measurement-*.md` | 3-5 real tester accounts + real deployed domain |
| Idempotency scope | `pilot-ready-idempotency-scope-*.md` | No new access needed, but deferred — depends on M1's final implementation, which is now complete (see AC-PILOT-READY-007/015 PASS rows above) |
| Readiness decision | `pilot-ready-readiness-decision-*.md` | All of the above; template already exists from plan-phase (unchanged by this delegation) |
| Gemini runtime smoke re-run | `gemini-runtime-smoke-*.md` | Real Gemini API access against this run-phase's HEAD |

Additionally, per plan.md §F Implementation Kickoff Decision Checklist, the following
non-M4 operational values remain unconfirmed and were NOT fabricated by this
delegation: 실제 프로덕션 도메인 값, 원격 Turso 대상, 지원 연락처 이메일 주소 (code is
ready via `SUPPORT_CONTACT_EMAIL` env var — see AC-PILOT-READY-013 row above), 장애
대응 triage 담당자 (documented as unconfirmed in the new runbook), Gemini 쿼터 점검
담당자+시점, 동시성 측정용 테스터 계정 준비 방법.

### E8. RED Failure Output (TDD — verbatim pre-GREEN evidence)

Genuine RED-GREEN cycles were run for every non-trivial behavior change (schema,
create-case.ts lease/transaction logic, route.ts 409+maxDuration, pipeline stage
logging, login-form.tsx mailto link, page.tsx notice). Representative verbatim RED
output (schema.test.ts, captured before the `reservations` table existed):

```
FAIL  lib/db/schema.test.ts > lib/db/schema > reservations 테이블은 ownerUserId/leaseId/
  expiresAt 3개 컬럼을 가지며 ownerUserId가 PK(UNIQUE)다 (REQ-PILOT-READY-007, plan.md
  §A 결정 1)
TypeError: Cannot read properties of undefined (reading 'Symbol(drizzle:Name)')
 ❯ getTableName node_modules/.../drizzle-orm/table.ts:144:14
 ❯ lib/db/schema.test.ts:39:12
Tests  1 failed | 5 passed (6)
```

The full `lib/cases/create-case.test.ts` suite (13 lease/transaction/logging tests) was
verified RED against the pre-lease implementation before restoring the new
implementation: `10 failed | 3 passed (13)` on first pass (FK-enforcement gap
discovered and fixed), `7 failed | 6 passed (13)` on the corrected re-run — then
`13/13 passed` after implementation. `app/api/cases/route.test.ts`'s 409 + maxDuration
tests were confirmed RED (`400` received instead of `409`; `maxDuration` `undefined`)
against the pre-M1 route.ts. `lib/pipeline/index.test.ts`'s stage-logging test was
confirmed RED (`expected "error" to be called at least once` — zero calls) before the
`withStageLogging`/`withAsyncStageLogging` wrappers were added. `app/login/login-form.test.tsx`'s
mailto-link test was confirmed RED against the pre-M3 disabled-span markup.

## §E.3 Run-phase Audit-Ready Signal

- `run_status: complete` (M1, M2, M3, M5, M6 — M4 explicitly deferred, see §E.2 E7)
- `run_complete_at: 2026-09-10`
- `run_commit_sha: pending-backfill-SPEC-PILOT-READY-001-M1` (backfilled in a follow-up
  commit per the SHA placeholder backfill exemption — a commit cannot cite its own hash)
- `ac_pass_count: 8` (AC-PILOT-READY-007, 008, 009, 011, 012, 013, 014, 015)
- `ac_fail_count: 0`
- `ac_na_count: 9` (M4-scoped: 001, 002, 003, 004, 005, 006, 010, 016a, 016b)
- `new_warnings_or_lints_introduced: false`
- `cross_platform_build: N/A` (TypeScript/Next.js project, not Go — no GOOS/GOARCH cross-build applicable)
- `total_run_phase_files: 19` (16 modified + 3 new: pilot-incident-runbook.md,
  0005_tidy_karen_page.sql migration + its meta/0005_snapshot.json)
- `m1_to_mN_commit_strategy: single consolidated commit for M1+M2+M3+M5+M6 (per Hybrid
  Trunk 1-person OSS default), plus one follow-up commit backfilling run_commit_sha`

## §E.4 Sync-phase Audit-Ready Signal

_<pending sync-phase>_
