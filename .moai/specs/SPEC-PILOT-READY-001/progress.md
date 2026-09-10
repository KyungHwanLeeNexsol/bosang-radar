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
  AC-PILOT-READY-016b bodies; AC 16/16 unchanged)

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
