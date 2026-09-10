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

## §E.2 Run-phase Evidence

_<pending run-phase>_

## §E.3 Run-phase Audit-Ready Signal

_<pending run-phase>_

## §E.4 Sync-phase Audit-Ready Signal

_<pending sync-phase>_
