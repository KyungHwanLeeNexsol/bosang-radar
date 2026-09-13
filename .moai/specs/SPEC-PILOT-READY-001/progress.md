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
| AC-PILOT-READY-001 | **PASS** (v0.11.0 정정, 외부 구현 검토 9차) | `Read .moai/reports/pilot-ready-netlify-suitability-spike-20260911.md` §3 | 이 AC는 **3층위 증거의 문서화 여부만** 판정하는 문서화 AC다(호스팅의 실제 준비상태 판정이 아니다 — 그것은 readiness-decision 문서, AC-016b의 몫). acceptance.md가 v0.11.0에서 Given 근거로 스파이크 리포트를 직접 인정하도록 정정됨에 따라, 3층위 증거 — (a) 공식 게시 값 60초(`docs.netlify.com/build/functions/configuration/#default-values`, 변경 불가), (b) 상충하는 커뮤니티 관측 ~10초(Netlify 직원 미확인), (c) 이 프로젝트 실제 적용 상한 UNVERIFIED — 가 서로 혼동 없이 구분 기록되어 있음을 확인해 PASS다. 호스팅의 실제 READY/BLOCKED/UNVERIFIED 판정 자체는 readiness-decision 문서에서 여전히 UNVERIFIED로 유지된다 |
| AC-PILOT-READY-002 | **UNVERIFIED** (v0.11.0 정정, 외부 구현 검토 9차) | — | 이전 라운드는 이 항목을 "N/A(M4-scoped, out of delegation scope)"로 기록했으나, 이는 "적용되지 않음"이 아니라 "실 인프라 검증을 아직 수행하지 않음"이다 — UNVERIFIED가 정확한 상태다. 실 배포 환경에서의 타임아웃 실측이 필요하다 |
| AC-PILOT-READY-003 | **UNVERIFIED** (v0.11.0 정정, 외부 구현 검토 9차) | — | 실제 AI Studio 쿼터 대시보드 확인이 아직 수행되지 않았다(적용 불가가 아니라 미수행) |
| AC-PILOT-READY-004 | **PASS** (2026-09-12 원격 재검증) | `Read .moai/reports/pilot-ready-remote-db-verification-20260912.md` | Netlify production 컨텍스트의 실제 원격 Turso에 migration 0006까지 총 7건 적용하고 seed 21건, `case_jobs` 8개 컬럼, `users`/`allowed_testers` 각 3건을 독립 읽기 조회로 재확인했다 |
| AC-PILOT-READY-005 | **PASS** (2026-09-12 실 도메인 검증) | `Read .moai/reports/pilot-ready-auth-domain-verification-20260912.md` | 실제 Preview에서 로그인 HTTP 200, 세션 쿠키와 세션 사용자 일치, 비로그인 `/cases/new` 307 및 로그인 후 200을 각각 확인했다 |
| AC-PILOT-READY-006 | **UNVERIFIED** (v0.11.0 정정, 외부 구현 검토 9차) | — | 서로 다른 사용자 계정의 실제 동시 부하 측정이 아직 수행되지 않았다(적용 불가가 아니라 미수행) |
| AC-PILOT-READY-007 | **PASS** | `pnpm exec vitest run lib/cases/create-case.test.ts` | 13/13 tests pass — covers: 2nd-call-blocked-while-1st-in-flight, retry-after-failure re-invokes runPipeline, completion-transaction atomicity (circular-content-forced `reports` INSERT failure leaves 0 `cases` rows), post-failure explicit lease release + immediate reacquisition (v0.5.0), worst-case 200s+ guard-hold under fake timers, TTL(330s) crash recovery with before/after contrast, delayed-result fencing (stale lease's late completion is a no-op, current lease row unchanged), genuine race condition via `Promise.all` against a real file-based SQLite engine enforcing the `reservations.owner_user_id` PK/UNIQUE constraint (exactly 1 of 2 concurrent acquires wins) |
| AC-PILOT-READY-008 | **PASS** (v0.6.0 강화) | `pnpm exec vitest run app/api/cases/route.test.ts lib/pipeline/index.test.ts lib/cases/create-case.test.ts lib/logging/safe-error.test.ts` | Request-start log (`case_request_received`, `route.test.ts`), per-stage pipeline failure log (`pipeline_stage_failed` with `stage` field, `pipeline/index.test.ts`), pipeline-level + completion-transaction + 신규 `pipeline_failed_lease_release_failed`(이중 실패 대칭화, v0.6.0) DB-write failure logs (`create-case.test.ts`) — 모든 5개 호출부가 신규 `lib/logging/safe-error.ts`의 `toSafeErrorMeta()`(errorName/errorCode 화이트리스트만 추출, `.message` 절대 미참조)를 거친다. 적대적 테스트가 `incidentDescription`/`diagnosisName`/`disabilityBodyPart` 원문을 오류 `.message`에 직접 주입해 5개 로그 호출부 전부가 그 원문을 반사하지 않음을 검증(이전 리뷰 라운드의 `error: String(error)` 평가는 `.message`가 원문을 반사할 위험을 검증하지 않은 채 PASS 처리된 결함이었다) |
| AC-PILOT-READY-009 | **PASS** (v0.10.0 — 차단 해제, 외부 구현 검토 8차) | `Read .moai/docs/pilot-incident-runbook.md` | 문서는 3개 별개 절로 존재 — §1 log locations/how-to-check(event-name table, **v0.10.0에서 Vercel Logs → Netlify Functions 로그 위치로 정정됨**), §2 tester retry guidance(explicitly avoids "unlimited retry is always safe" overclaim), §3 triage owner(**v0.10.0 — 이경환(파일럿 운영 책임자), 1영업일 이내 1차 확인으로 확정됨, 더 이상 "미확정"이 아님**). Distinct file from `.moai/docs/runtime-runbook.md`. 실제 트리아지 담당자가 확정되고 로그 위치가 실제 호스팅(Netlify)과 일치하므로, "구현이 검증됨"과 "SPEC 레벨 요구사항이 충족됨"이 이제 둘 다 성립한다 |
| AC-PILOT-READY-010 | **UNVERIFIED** (v0.11.0 정정, 외부 구현 검토 9차) | — | 실 Gemini 배포환경 종단 재검증이 아직 수행되지 않았다(적용 불가가 아니라 미수행) |
| AC-PILOT-READY-011 | **PASS** | `pnpm exec vitest run app/cases/new/page.test.tsx` (그리고 `grep -rn "완전히 비식별화\|확실히 차단\|보장합니다\|보장한다" app/cases/new/page.tsx` → 렌더 텍스트에는 미검출, 코드 주석에서만 1건 검출) | Rendered notice text contains no "보장"/"확실히 차단"/"완전히 비식별화" |
| AC-PILOT-READY-012 | **PASS** | `pnpm exec vitest run app/cases/new/page.test.tsx` | Notice DOM contains all 4 required items individually: (a) 주민등록번호·휴대전화번호 형식 검사 설명, (b) 주소·의료기록 원본 필드 부재(구조적 사실), (c) 자유 텍스트 필드 잔여 위험(구조적 사실과 구분해 별도 문단으로 진술), (d) 합성/비식별화 사례만 입력하라는 테스터 책임 문장 |
| AC-PILOT-READY-013 | **PASS** (2026-09-12 Preview 렌더 검증) | `Read .moai/reports/pilot-ready-auth-domain-verification-20260912.md`; `pnpm exec vitest run app/login/login-form.test.tsx` | Netlify에 `SUPPORT_CONTACT_EMAIL`이 설정된 상태에서 실제 Preview `/login` HTML의 활성 `mailto:` 링크를 확인했다. 미설정 상태가 `aria-disabled`로 렌더되는 기존 컴포넌트 테스트와 함께 양쪽 조건을 충족한다 |
| AC-PILOT-READY-014 | **PASS** | `pnpm exec vitest run app/cases/new/page.test.tsx` | Notice includes the full synthetic example (reused verbatim from `.moai/reports/gemini-runtime-smoke-20260828.md`) with all 4 field values: 사건 경위/진단명("좌측 발목 관절 인대 파열")/장해 부위/사고 일자 |
| AC-PILOT-READY-015 | **PASS** | `pnpm exec vitest run lib/cases/create-case.test.ts -t "동시에 시작된"` | `Promise.all([createCase(...), createCase(...)])` against the same `ownerUserId`, same file-based SQLite engine — exactly 1 success + 1 `alreadyProcessing`, `runPipeline` called exactly once. No partial/transient double-start observed |
| AC-PILOT-READY-016a | **PASS** (v0.6.0 — 차단 해제) | `Read .moai/reports/pilot-ready-idempotency-scope-20260911.md` | 이전에는 M1 구현 미완료로 N/A 처리됐으나, M1이 이번 라운드 이전에 이미 완료되어 외부 접근 없이 작성 가능해졌다. 리포트는 REQ-PILOT-READY-015의 4개 실패 모드(크래시 복구/완료 원자성/응답 유실 재제출/지연 도착 충돌) 재판정과 "idempotency 가드"→"사용자별 동시 실행 가드" 명명 정정을 기록한다 |
| AC-PILOT-READY-016b | **PASS** (2026-09-12 판정 동기화) | `Read .moai/reports/pilot-ready-readiness-decision-2026-09-10.md` | 이 AC는 "템플릿이 실제 판정값으로 채워졌는가"를 판정하며, "판정이 GO인가"를 판정하지 않는다. 현재 리포트는 원격 DB 항목 (3)을 `READY`, 나머지 6개 항목을 `UNVERIFIED`, 전체를 `NO-GO`로 명시해 게이트 규칙과 일치한다 |

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

- `run_status: partial` (v0.6.0 정정, v0.7.0에서도 유지 — M1, M2, M3, M5, M6 코드
  구현은 완료됐으나 M4 파일럿 준비 상태는 여전히 NO-GO다; 이 SPEC의 run-phase는
  아직 종료되지 않는다. 상세: §G 아래)
- `implementation_subset_complete_at: 2026-09-10 (M1,M2,M3,M5,M6 서브셋만 —
  M4 제외)` (v0.7.0 정정, 외부 구현 검토 6차 — 이전 필드명 `run_complete_at`은
  `run_status: partial`과 모순되는, 한정 없는 전체 완료 주장으로 읽혔다. 이
  필드는 M1,M2,M3,M5,M6 서브셋의 구현 완료 시점만 가리키며, 전체 run-phase
  완료를 주장하지 않는다. 정정 라운드는 새 완료 시점을 주장하지 않는다; 상세는
  §G의 `correction_round_at` 참고)
- `run_commit_sha: 8d39283c0a8544c9e093dc8940c2790612998d6e` (backfilled in this
  follow-up commit per the SHA placeholder backfill exemption — the
  M1,M2,M3,M5,M6 commit itself could not cite its own hash)
- `ac_pass_count: 13` (2026-09-12 실 도메인 검증 — AC-PILOT-READY-001, 004, 005,
  007, 008, 009, 011, 012, 013, 014, 015, 016a, 016b. AC-001은 "3층위 증거 문서화 AC"이지
  "호스팅 준비상태 판정 AC"가 아니므로, 문서화가 완전하면 PASS다(호스팅의 실제
  준비상태는 readiness-decision 문서에서 별도로 UNVERIFIED 유지됨). AC-016b는
  "템플릿이 판정값으로 채워졌는가"를 판정하며 "GO인가"를 판정하지 않으므로,
  항목 3·4 READY + 나머지 5개 UNVERIFIED + 전체 NO-GO로 채워진 현재 리포트도 PASS다 —
  §E.2 참고)
- `ac_fail_count: 0`
- `ac_na_count: 0` (v0.11.0 — 더 이상 N/A 항목 없음. 이전 라운드가 "N/A(적용 불가)"로
  기록했던 002/003/004/005/006/010은 "적용되지 않음"이 아니라 "실 인프라 검증을
  아직 수행하지 않음"이었다는 지적을 반영해 UNVERIFIED로 재분류함)
- `ac_unverified_count: 4` (2026-09-12 실 도메인 검증 — AC-PILOT-READY-002, 003, 006,
  010. 배포 환경/AI Studio/실 도메인에 대한 검증이 아직 수행되지 않은 상태를
  뜻하며, "이 SPEC에 적용되지 않는다"는 뜻이 아니다)
- `ac_blocked_count: 0` (2026-09-12 — AC-PILOT-READY-013의 Netlify 설정·실제 렌더링
  검증을 완료해 차단 해제)
- `new_warnings_or_lints_introduced: false`
- `cross_platform_build: N/A` (TypeScript/Next.js project, not Go — no GOOS/GOARCH cross-build applicable)
- `total_run_phase_files: 19` (16 modified + 3 new: pilot-incident-runbook.md,
  0005_tidy_karen_page.sql migration + its meta/0005_snapshot.json) —
  M1,M2,M3,M5,M6 원본 델리게이션 기준. 정정 라운드가 추가로 건드린 파일
  목록은 §G 참고.
- `m1_to_mN_commit_strategy: single consolidated commit for M1+M2+M3+M5+M6 (per Hybrid
  Trunk 1-person OSS default), plus one follow-up commit backfilling run_commit_sha,
  plus this correction round's own commit(s) (see §G)`

## §G Run-phase Correction Round (External Implementation Review)

`correction_round_at: 2026-09-11`. 이 절은 외부 구현 검토(5차, spec.md HISTORY
v0.6.0 항목 — `.moai/specs/SPEC-PILOT-READY-001/spec.md` §HISTORY 참고)가
지적한 5개 결함(B1-B5)에 대한 정정 라운드다. M4 파일럿 준비 상태 판정은
여전히 NO-GO이며, 이 라운드는 그 사실을 바꾸지 않는다 — §E.3의
`run_status: partial`이 그 사실을 반영한다.

### 정정된 항목

- **B1 — PII 비노출 로깅 강화**: 신규 `lib/logging/safe-error.ts`
  (`toSafeErrorMeta()`)가 `create-case.ts`의 3개 호출부(`pipeline_failed`,
  `completion_transaction_failed`, `post_failure_lease_release_failed`) +
  `pipeline/index.ts`의 2개 호출부(`withStageLogging`/
  `withAsyncStageLogging`, `pipeline_stage_failed`)를 `error: String(error)`
  대신 화이트리스트 메타데이터(`errorName`/`errorCode`)로 교체한다. 적대적
  테스트(`incidentDescription`/`diagnosisName`/`disabilityBodyPart` 원문을
  오류 `.message`에 직접 주입)가 5개 호출부 전부에서 원문 미반사를 검증한다.
- **B2 — 파이프라인 실패 시 리스 해제 대칭화**: `create-case.ts`의 첫 번째
  catch(파이프라인 실행 실패)가 두 번째 catch(완료 트랜잭션 실패)와 동일한
  중첩 try/catch + 이중 실패 로깅(`pipeline_failed_lease_release_failed`,
  신규 이벤트 — `.moai/docs/pilot-incident-runbook.md` §1 표에 추가) 패턴을
  적용한다. 리스 해제 자체가 실패해도 원래 파이프라인 오류가 항상 그대로
  전파되며, TTL 경과 후 재획득이 여전히 가능함을 테스트로 검증한다.
- **B3 — 정직한 지원 연락 링크**: `login-form.tsx`의
  `DEFAULT_SUPPORT_EMAIL_PLACEHOLDER`(example.com 자리표시자 활성 링크)
  폴백을 제거했다. `supportEmail`이 설정되면 활성 `mailto:` 링크,
  미설정이면 다른 2개 정책 링크와 동일한 `aria-disabled` 정직한 비활성
  표시. `.env.local.example`에 `SUPPORT_CONTACT_EMAIL`(optional) 추가.
  `app/login/page.tsx`의 기존 주석은 이미 이 정정된 의도와 일치해 별도
  수정이 불필요했다(코드만 그 의도와 어긋나 있었다).
- **B4 — 테스트 증거 강화**: "진성 경쟁 조건" 테스트를 deferred 파이프라인
  기반으로 재작성해 파이프라인이 pending인 동안 예약 1건만 존재함과 패자가
  파이프라인을 기다리지 않고 즉시 거부됨을 `Promise.race`로 직접 관측한다.
  트랜잭션 실패 테스트 2건을 1건으로 통합해 cases/reports/reservations
  3개 테이블 모두 0행(사후 펜싱 해제 증거)과 새 leaseId가 실패한 시도의
  leaseId와 다름(즉시 재획득 증거)을 구분된 단계로 검증한다.
- **B5 — 준비 상태 미주장**: 이 라운드는 코드 결함만 수정했으며, M4(실
  배포/원격 Turso/Gemini 쿼터/실 지원 주소/실 triage 담당자)는 여전히
  미확정·NO-GO다 — 어디에서도 그 반대를 주장하지 않는다.

### 이 라운드가 건드린 파일

신규: `lib/logging/safe-error.ts`, `lib/logging/safe-error.test.ts`,
`.moai/reports/pilot-ready-idempotency-scope-20260911.md`.
수정: `lib/cases/create-case.ts`, `lib/cases/create-case.test.ts`,
`lib/pipeline/index.ts`, `lib/pipeline/index.test.ts`,
`app/login/login-form.tsx`, `app/login/login-form.test.tsx`,
`.env.local.example`, `.moai/docs/pilot-incident-runbook.md`,
`.moai/specs/SPEC-PILOT-READY-001/{spec,acceptance,progress}.md`.

### 이 라운드의 검증 증거

```
$ pnpm exec vitest run   → 426/426 tests pass, 60/60 test files pass (기준
                             415/415 대비 +11개, 회귀 없음)
$ pnpm exec tsc --noEmit → exit 0
$ pnpm lint              → 0 errors, 0 warnings
$ pnpm build             → exit 0 (동일한 사전 존재 instrumentation.ts
                             Edge Runtime 경고만, 이 SPEC과 무관)
```

TDD RED 증거(B1/B2/B3, 격리 실행 기준 — 파일 전체 실행 시 일부 테스트 간
console.error spy 상호작용으로 순서 의존 노이즈가 관측됐으나, `-t` 필터로
격리 실행하면 각 신규 테스트가 결함을 정확히 재현하는 깨끗한 RED를 보였다):

```
FAIL lib/cases/create-case.test.ts > ... > post_failure_lease_release_failed 로그는 ...
AssertionError: expected '{"event":"post_failure_lease_release_failed","error":"Error: release failed, body part: 우측 발목"}' not to contain '우측 발목'

FAIL lib/cases/create-case.test.ts > ... > 파이프라인 실패 시 리스 해제까지 실패해도(이중 실패) ...
AssertionError: expected [Function] to throw error including 'pipeline boom (original)' but got 'release also failed'

FAIL app/login/login-form.test.tsx > ... > AC-PILOT-READY-013: ...
AssertionError: expected <a href="mailto:pilot-support@example.com">고객지원</a> to be undefined
```

## §H Run-phase Correction Round 2 (External Implementation Review, 6차)

`correction_round_2_at: 2026-09-11`. 이 절은 외부 구현 검토(6차)가 지적한
3개 결함(B1-B3)에 대한 두 번째 정정 라운드다. §G(5차 정정)를 대체하지
않고 그 위에 쌓인다. M4 파일럿 준비 상태 판정은 여전히 NO-GO이며, 이
라운드도 그 사실을 바꾸지 않는다.

### 정정된 항목

- **B1 — `lib/logging/safe-error.ts` PII 경계 강화**: v0.6.0의
  `errorName`/`errorCode` 추출은 주석상 "화이트리스트"였으나 실제로는
  `typeof` 검사만으로 임의 문자열/숫자를 그대로 통과시켰다(진짜
  화이트리스트가 아니었다). v0.7.0은 `KNOWN_ERROR_NAMES`/
  `KNOWN_ERROR_CODES`라는 고정된 안전 목록을 도입했다 — 목록에 없는
  `errorName`은 `UnclassifiedError`로 대체, 목록에 없는 `errorCode`는
  필드 자체를 생략한다(그대로 통과 없음). 3개 주입 시나리오(message/
  name/code 각각에 `incidentDescription`/`diagnosisName`/
  `disabilityBodyPart` 원문 직접 주입) 테스트로 신설 검증했다 — RED
  캡처 후 GREEN 확인, TDD 준수. `lib/logging/safe-error.test.ts` 9/9 pass.
- **B2 — AC-PILOT-READY-009/013 과잉 주장 정정**: 두 AC 모두 v0.6.0에서
  PASS로 집계됐으나, "구현/컴포넌트 동작이 정직하게 구현되고 테스트로
  검증됨"과 "SPEC 레벨 요구사항(실재하는 트리아지 연락 경로 / 실재하는
  지원 연락 채널)이 충족됨"을 혼동한 결과였다. v0.7.0은 두 행을 `BLOCKED`로
  정정하고, `ac_pass_count`를 9→7로, `ac_na_count`는 8 유지, 신규
  `ac_blocked_count: 2`를 §E.3에 추가해 합계가 내적으로 일관되게 했다(§E.2/
  §E.3 참고). 가짜 주소나 가짜 담당자를 발명하지 않았다.
- **B3 — §E.3 완료 시점 필드명/문구 정정**: `run_complete_at:
  2026-09-10` 필드명이 같은 절의 `run_status: partial`과 모순되는, 한정
  없는 전체 완료 주장으로 읽혔다. v0.7.0은 필드명을
  `implementation_subset_complete_at`으로 바꾸고 "M1,M2,M3,M5,M6 서브셋만
  — M4 제외"를 명시했다. 같은 절의 "M1-M6 구현/커밋" 표현 3곳도 실제
  완료 범위(M1,M2,M3,M5,M6, M4 제외)와 일치하도록 정정했다.

### 이 라운드가 건드린 파일

수정: `lib/logging/safe-error.ts`, `lib/logging/safe-error.test.ts`,
`.moai/specs/SPEC-PILOT-READY-001/progress.md`. 신규/수정된 소스 코드는
`lib/logging/safe-error.ts` 1개 파일뿐이다(요청 범위: B1-B3는 코드 1개
파일 + progress.md만).

### 이 라운드의 검증 증거

```
$ pnpm exec vitest run lib/logging/safe-error.test.ts
  → 9/9 tests pass (v0.6.0 대비 +4: 화이트리스트 미등록 code 생략 검증
    1건 + 라이브러리 에러 이름 검증 1건 + 3개 주입 시나리오)
$ pnpm exec vitest run lib/cases/create-case.test.ts lib/pipeline/index.test.ts
  → 26/26 tests pass (safe-error.ts 화이트리스트 강화 후 회귀 없음)
$ pnpm exec vitest run  → 430/430 tests pass, 60/60 test files pass (기준
    426/426 대비 +4, 회귀 없음)
$ pnpm exec tsc --noEmit → exit 0
$ pnpm lint              → 0 errors, 0 warnings
$ pnpm build             → exit 0 (동일한 사전 존재 instrumentation.ts
    Edge Runtime 경고만, 이 SPEC과 무관)
```

TDD RED 증거(B1, 3개 주입 시나리오 신설 테스트 — 화이트리스트 도입 전
구현 기준으로 캡처):

```
FAIL lib/logging/safe-error.test.ts > ... > code 속성이 화이트리스트에 없는 값(문자열/숫자)이면 errorCode 필드 자체를 생략한다
AssertionError: expected 'SOME_UNLISTED_CODE' to be undefined
- Expected: undefined
+ Received: "SOME_UNLISTED_CODE"

FAIL lib/logging/safe-error.test.ts > ... > [주입 시나리오: name] error.name에 사건 입력 원문을 주입해도 UnclassifiedError로 대체된다
AssertionError: expected '우측 발목 인대 파열' to be 'UnclassifiedError'
Expected: "UnclassifiedError"
Received: "우측 발목 인대 파열"

FAIL lib/logging/safe-error.test.ts > ... > [주입 시나리오: code] error.code에 사건 입력 원문을 주입해도 errorCode가 생략된다
AssertionError: expected '우측 발목' to be undefined
- Expected: undefined
+ Received: "우측 발목"
```

### 여전히 BLOCKED/N/A로 남는 항목 (이 라운드가 해소하지 않음)

이 라운드는 실행-단계(run-phase) 코드 결함과 progress.md의 보고 정확성만
정정했다 — 외부 세계의 실물 전제 조건은 하나도 해소하지 않았다. §E7(M4
Consolidated Blocker Report)과 §G(5차 정정 B5)에서 이미 밝힌 미확정 항목이
실질적으로 그대로 남아 있다:

- M4 전체 7개 운영-측정 리포트(배포 티어/타임아웃/Gemini 쿼터/원격 DB/도메인
  인증/동시성/준비 상태 판정) — 실 Vercel/Turso/도메인/AI-Studio 접근 필요.
- AC-PILOT-READY-009(BLOCKED, 신규): 실제 트리아지 담당자/역할 미확정.
- AC-PILOT-READY-013(BLOCKED, 신규): `SUPPORT_CONTACT_EMAIL` 실 주소 미확정.

## §I Netlify 호스팅 결정 + 적합성 스파이크 (v0.8.0 → v0.9.0 정정)

`decision_round_at: 2026-09-11`, `correction_round_at: 2026-09-11`. 사용자가
호스팅 후보를 Vercel에서 Netlify Free로 변경 확정하고, 지원 이메일·triage 담당자를
함께 확정했다(v0.8.0). 외부 구현 검토 7차가 v0.8.0의 판정 언어와 일부 사실 주장을
정정 요청해 v0.9.0으로 갱신했다. 코드 변경은 없었다 — 이 두 라운드 모두 결정
기록 + 문서 조사 + 스파이크 리포트 작성만 수행했다(실 배포 없음).

- **확정된 값(변경 없음)**: 호스팅 Netlify Free, DB Turso Free(인스턴스 미생성), AI
  Gemini Free, `SUPPORT_CONTACT_EMAIL=zuge3927@naver.com`(`.env.local` 반영),
  triage 담당자 이경환(1영업일 이내 1차 확인, `pilot-incident-runbook.md` §3 반영).
- **판정 정정(v0.8.0 BLOCKED → v0.9.0 UNVERIFIED)**: acceptance.md
  AC-PILOT-READY-016b의 READY/BLOCKED/UNVERIFIED 3분류 중, "아직 이 환경에서
  측정하지 않았다"는 UNVERIFIED가 맞는 표현이며, v0.8.0이 기존 실측(다른 환경,
  30초)만으로 "구조적으로 BLOCKED"라 단정한 것은 과잉 주장이었다. 실 배포·Gemini
  재호출은 이번에도 수행하지 않았다(사용자 재확인).
- **미해결 사실 관계**: 사용자가 제시한 "동기 함수 60초 제한"을 이 세션이 처음
  10초로 정정했으나(v0.8.0), 외부 구현 검토 7차는 "공식 문서 기준 60초가 맞고
  10초는 낡은 정보"라고 반박했다. 이번 라운드에서 다시 독립 재조사했으나 이
  세션의 결과는 반복해서 10초(Free/Personal)/26초(Pro)를 가리켰다 — 근거 문서를
  제시받지 못해 이 불일치를 해소하지 못했다. 어느 쪽도 확정하지 않고 불일치
  상태 그대로 기록했다(스파이크 리포트 §3, 스파이크 리포트만 상세 근거 보유).
- **후속 SPEC 제안을 조건부로 재조정**: 비동기(POST 202 + 상태 조회) 재설계(가칭
  SPEC-PILOT-ASYNC-SUBMIT-001)를 "필수 선행"에서 "실측 초과 시에만 착수하는
  조건부 대안"으로 바꾸고, "리스 로직 무수정 재사용 가능" 주장을 제거해 실제
  재설계 범위(작업 상태 저장/caseId 생성 시점/리스 TTL-실행시간 관계/펜싱/
  실패재시도)를 명시했다(스파이크 리포트 §5).
- **크레딧 설명 정정**: 300크레딧 매월 갱신, 한도 도달 시 다음 주기까지 프로젝트
  중지, Free 플랜은 초과 청구 자체가 없음을 공식 문서로 확정했다. 120-140크레딧
  추정치는 4가지 가정 기반임을 명시했다(스파이크 리포트 §6).
- **AC-PILOT-READY-009/013 상태 변경 없음**: 두 항목의 실제 값은 결정됐지만
  "실 배포 환경에서의 set+verified"는 아직 수행되지 않았으므로 두 행 모두
  `BLOCKED`로 유지한다.
- **여전히 미확정**: Gemini 쿼터 점검 담당자+시점, 동시성 측정용 테스터 계정
  준비 방법. M4 전체 7개 운영-측정 리포트는 여전히 실 인프라 접근이 필요하다.

## §J Netlify 실행 시간 상한 — 3층위 증거로 정정 (v0.10.0, 외부 구현 검토 8차)

`correction_round_3_at: 2026-09-11`. 외부 구현 검토 8차가 공식 출처 URL
(`docs.netlify.com/build/functions/configuration/#default-values`)을 제시했다.
이 세션이 직접 재확인한 결과, **동기 함수 실행 시간의 공식 게시 값은 60초(변경
불가, 2026-07-06 갱신)임을 확인했다** — §I(v0.8.0/v0.9.0)에서 이 세션이 반복
주장한 "10초(Free/Personal)"는 검색엔진 요약·커뮤니티 포럼에 의존한 결과였고,
**HISTORICAL로 표시하며 이번에 정정한다**(spec.md HISTORY v0.8.0 항목에도 동일
표시).

- **3층위 증거로 재정리**: (a) 공식 게시 값 60초(변경 불가), (b) 상충하는
  커뮤니티 관측 ~10초(2026-09-08 게시, Netlify 직원의 공식 확인 없음 — 지원
  티켓만 생성됨), (c) 이 프로젝트 계정에 실제 적용되는 상한은 실 배포 전까지
  UNVERIFIED.
- **canonical 문서 동기화**: spec.md(REQ-001/002/016(1), Out of Scope, 출처),
  acceptance.md(AC-001/002/016b), plan.md(§A 결정 1/4, M4, §F, §D Risks 2/5),
  readiness-decision 템플릿, `pilot-incident-runbook.md`(로그 위치 Netlify로
  정정)를 모두 이 3층위 기준으로 갱신했다. `maxDuration=300`/`TTL=330`은 현행
  구현값으로 유지하되 "Netlify가 300초를 보장한다"는 근거로는 더 이상 쓰지
  않는다.
- **AC 재판정**: AC-001을 N/A→UNVERIFIED로(Netlify 적합성 3층위 증거 존재,
  실제 적용 상한만 미확인), AC-009를 BLOCKED→PASS로(triage 담당자 확정 +
  로그 위치 정정), AC-013을 BLOCKED 유지하되 사유를 "이메일 미확정"에서 "주소
  확정·로컬 설정 완료, Netlify 환경 설정/렌더링 미검증"으로 재작성했다(§E.2
  참고). 집계: PASS 8 / BLOCKED 1 / UNVERIFIED 1 / N/A 7 / FAIL 0(§E.3 참고).
- **코드·배포 없음**: 이번에도 코드 변경·실 배포·Gemini 재호출·테스터 초대·
  비동기 SPEC 생성·PR·main 병합을 수행하지 않았다.

## §K AC 충족 vs Readiness 판정 분리 + 로그 경로 정정 (v0.11.0, 외부 구현 검토 9차)

`correction_round_4_at: 2026-09-11`. 외부 구현 검토 9차: "문서 정합성 수정 후
PASS 가능". §J(v0.10.0)의 3층위 증거 정리는 정확했으나, 그 뒤 AC 판정에 두 가지가
섞여 있었다 — "문서가 완전한가"(AC 충족)와 "호스팅이 실제로 준비됐는가"(readiness
판정)를 구분하지 않은 것이다. 이번 라운드가 이 둘을 분리했다.

- **로그 경로 정정**: `docs.netlify.com/build/functions/logs/` 직접 재확인 —
  "사이트 선택 → Cloud compute → Functions → 대상 함수 선택"이 정확한 경로다.
  `pilot-incident-runbook.md` §1을 이 경로로 갱신했다(v0.10.0의 "Logs → Functions"
  서술은 부정확했다).
- **AC-001 PASS 전환**: 3층위 증거 문서화 AC다 — acceptance.md Given이 기존
  스파이크 리포트를 직접 인정하도록 정정됐고, 3층위가 완전·구분되게 기록되어
  있으므로 PASS. 호스팅의 실제 준비상태는 readiness-decision 문서에서 별도로
  UNVERIFIED 유지(변경 없음).
- **AC-002/003/004/005/006/010 재분류**: N/A(적용 불가) → UNVERIFIED(실 인프라
  검증 미수행)로 정정 — 이 SPEC에 적용되지 않는 항목이 아니라 아직 검증하지
  않은 항목이었다.
- **AC-016b PASS 전환**: "템플릿이 판정값으로 채워졌는가"만 판정한다.
  readiness-decision 문서는 7개 항목 전부 UNVERIFIED + 전체 NO-GO로 이미 채워져
  있고, acceptance.md 자신이 "NO-GO도 정상 완료"라고 명시하므로 PASS — 문서
  내부 7개 항목과 전체 NO-GO 자체는 이 라운드에서 변경하지 않았다.
- **집계 재계산**: PASS 10 / UNVERIFIED 6 / BLOCKED 1 / N/A 0 / FAIL 0(§E.3 참고).
- **plan.md §F triage 행 정정**: "다음 run-phase에서 갱신 필요" 문구 제거 —
  `pilot-incident-runbook.md` §3은 v0.10.0에서 이미 이경환 담당자로 갱신 완료됐다.
- **코드·배포 없음**: 이번에도 코드 변경·실 배포·Gemini 재호출·테스트 반복·
  테스터 초대·비동기 SPEC 생성·PR·main 병합을 수행하지 않았다.

## §L 최종 프로젝트 검증 + PR (외부 최종 검토: PASS, HEAD `393242e`)

`final_verification_at: 2026-09-11`. 외부 최종 검토가 v0.11.0(HEAD `393242e`)을
PASS로 확인했다 — "추가 문서 또는 구현 수정은 필요 없다". PR 생성 전 최종
프로젝트 검증을 수행했다.

```
$ pnpm exec vitest run       → 60/60 test files, 430/430 tests pass — EXIT=0
$ pnpm exec tsc --noEmit     → EXIT=0
$ pnpm lint                  → eslint . → EXIT=0
$ pnpm run format:check      → prettier --check . → EXIT=1 (최초 실행, 12개 파일
                                 포맷 불일치 — 이 SPEC에서 처음 실행됨)
```

**포맷 불일치 발견 + 정정**: `format:check`가 이 SPEC의 검증 이력에서 처음
실행되어(이전 라운드는 전부 `eslint`만 실행) 12개 파일의 포맷 불일치를
발견했다. 사용자에게 보고 후 확인을 받아 `pnpm run format` 적용(공백/따옴표/
줄바꿈만 — `git diff` 확인 결과 로직/동작 변경 없음), 5개 검증 재실행:

```
$ pnpm exec vitest run       → 60/60, 430/430 pass — EXIT=0 (회귀 없음)
$ pnpm exec tsc --noEmit     → EXIT=0
$ pnpm lint                  → EXIT=0
$ pnpm run format:check      → EXIT=0 (All matched files use Prettier code style!)
$ pnpm build                 → EXIT=0 (기존 instrumentation.ts Edge Runtime 경고만,
                                 이 SPEC과 무관)
```

포맷 수정 커밋: `990e525`(`style(SPEC-PILOT-READY-001): ...`).

## §M PR #10 검토 후속 — Deploy Preview 실패 발견, E2E 1회 실행 (v0.12.0)

`pr_review_round_at: 2026-09-11`. 외부 PR 검토: "수정 후 PASS 가능", HEAD
`6d1aa36`. PR #10은 open 유지, 병합하지 않았다.

- **Netlify 자동 Deploy Preview 실패 발견 및 기록 정정**: PR 생성 직후 Netlify가
  이미 이 저장소에 연결되어 있어 자동 Deploy Preview가 트리거되어 실패했다
  (사이트 `musical-macaron-82feb3`, 배포 `6aa366b046557f0008ceef11`) — GitHub
  `gh pr checks 10` + Check Runs/Statuses API로 직접 확인. "Netlify 배포
  미수행"이라는 이전 표현을 "수동·프로덕션 배포는 미수행, 자동 Preview 배포는
  실패"로 정정했다(스파이크 리포트 §7-b에 상세 기록).
- **최초 fatal 원인: 미확인.** Netlify 대시보드 로그는 로그인이 필요하며, 이
  세션은 Netlify CLI 인증도 브라우저 연동(claude-in-chrome 확장 미연결 확인함)도
  없어 실제 로그를 읽을 수 없었다. 원인을 모르는 채로 readiness 판정(항목 1)을
  변경하지 않았다 — 지시사항 준수.
- **사이트 신원 확인 필요**: `musical-macaron-82feb3`는 Netlify 자동 생성
  슬러그 패턴이다. 이 세션의 어떤 라운드도 Netlify 계정을 조작한 적이 없어,
  이 사이트가 이 프로젝트를 위해 의도적으로 만들어진 것인지 확인할 수 없었다
  — 사용자 확인이 필요한 open question으로 남긴다.
- **README.md/product.md 현행화**: Vercel Hobby/Pro 및 "Vercel CI/CD 자동화"
  문구를 Netlify Free 결정으로 교체하고, SPEC 상태 서술을 "plan-phase 검토
  중"에서 "구현 완료(M1/M2/M3/M5/M6) + M4 실 인프라 검증 대기 + readiness
  NO-GO"로 갱신했다. 검증 결과(60/60 files, 430/430 tests, format:check PASS)를
  반영했다.
- **`.env.local.example` 정정**: `SUPPORT_CONTACT_EMAIL` 주석을 "이메일
  미확정"에서 "주소는 확정·로컬 설정 완료, Netlify 환경 적용·렌더링은
  미검증"으로 갱신했다. 비밀값 자체는 커밋하지 않았다(`.env.local`은 계속
  gitignored).
- **`pnpm test:e2e` 1회 실행** (실제 Gemini 아님, 기존 deterministic 구성 —
  `run-e2e.ts`가 자체적으로 `LLM_PROVIDER_MODE=deterministic`을 설정):

  ```
  $ pnpm test:e2e
  → 23 tests total: 13 passed, 10 skipped, 0 failed
  → Duration: 5.0m
  → EXIT=0
  ```

  10건 skip은 이 실행이 대상으로 삼지 않은 시각 증빙 캡처(`capture-evidence*.spec.ts`)
  스펙들이다 — 실패가 아니라 이 스위트의 기존 skip 설정이다.
- **readiness 판정 불변**: 이 라운드는 readiness-decision 문서의 7개 항목이나
  전체 NO-GO를 변경하지 않았다 — Deploy Preview 실패 원인이 미확인이고, E2E는
  로컬 deterministic 환경 실행이라 Netlify 배포 적합성 증거가 아니다.

## §N Netlify Deploy Preview 수정 (v0.13.0, 실제 fatal 원인 확인 + 수정 + 재배포 성공)

`fix_round_at: 2026-09-11`. 사용자가 Netlify 대시보드에서 최초 fatal을 직접
확인해 제공했다:

```
Plugin "@netlify/plugin-nextjs" internal error
Usage of unsupported C++ Addon(s) found in Node.js Middleware:
@libsql/linux-x64-gnu/index.node
```

**원인**: `proxy.ts`(Middleware)가 `lib/auth/session.ts`의 `hasSessionCookie`만
쓰지만, 그 파일이 `getCurrentSession`용으로 `./config`→`../db/client`→
`@libsql/client`(네이티브 애드온)를 모듈 최상위에서 함께 import해 Middleware
정적 번들에 딸려 들어갔다.

**수정**(`manager-develop` 위임, TDD): `lib/auth/session-cookie.ts` 신규
분리(DB 의존성 0, `better-auth/cookies`만 import) → `proxy.ts`가 이 신규
모듈만 참조하도록 변경. `getCurrentSession`과 그 DB 의존성 체인은 무변경
(서버 페이지/API의 실제 세션 검증 로직 불변). `@libsql/client`를 web 버전으로
전역 교체하지 않음(기존 트랜잭션/리스 보장 유지). 회귀 테스트
`proxy.import-graph.test.ts` 신규 — `proxy.ts`의 전이 import 그래프에
`lib/db/client`/`@libsql/client`/`*.node`가 재유입되면 실패한다.

**검증**(이 세션이 직접 재실행, `manager-develop` 자체 보고와 독립적으로 확인):

```
$ pnpm exec vitest run       → 62/62 test files, 431/431 tests pass — EXIT=0
$ pnpm exec tsc --noEmit     → EXIT=0
$ pnpm lint                  → EXIT=0
$ pnpm run format:check      → EXIT=0
$ pnpm build                 → EXIT=0
$ pnpm test:e2e              → 23 total / 13 passed / 10 skipped / 0 failed — EXIT=0
                                 (baseline과 동일, 회귀 없음)
```

`git diff --stat`으로 변경 파일이 정확히 6개(`proxy.ts`,
`lib/auth/session{,-cookie}.ts`, `lib/auth/session{,-cookie}.test.ts`,
`proxy.import-graph.test.ts`)임을 확인했다. 커밋: `9beb3a7`, push 확인.

**Netlify Deploy Preview 재확인 결과** (`gh pr checks 10`, HEAD `9beb3a7`):

```
netlify/musical-macaron-82feb3/deploy-preview  PASS  "Deploy Preview ready!"
Header rules   PASS
Redirect rules PASS
Pages changed  skipping (실패 아님)
```

**readiness 판정 불변(사용자 지시 준수)**: Deploy Preview 성공은 빌드/번들링
결함 해소의 증거일 뿐, §3의 동기 함수 실행 시간 상한(공식 60초 vs 커뮤니티
관측 ~10초, 이 프로젝트 실제 적용값 미확인) 질문과는 별개다. readiness-decision
문서의 7개 항목과 전체 판정(`NO-GO`)은 이 라운드에서 변경하지 않았다 — 호스팅
적합성(AC-PILOT-READY-001이 다루는 3층위 문서화와는 별개로, readiness 문서의
항목 (1) 실제 판정)은 여전히 `UNVERIFIED`다.

**부분 해소 (v0.14.0)**: `musical-macaron-82feb3`가 **PR #10과 연결된 Netlify
사이트라는 사실 자체는 GitHub status check로 확인됐다**(`gh pr checks 10`,
`netlify/musical-macaron-82feb3/deploy-preview` context — GitHub 저장소
연동이 이미 이 사이트로 구성되어 있다는 객관적 증거). 다만 **이 사이트를
장기 프로덕션 사이트로 채택할지는 여전히 별도의 미확정 운영 결정**으로
남긴다(PR #10 본문에도 동일하게 명시) — "GitHub에 연결된 사이트"와 "프로덕션
사이트로 확정"은 다른 질문이다.

## §E.4 Sync-phase Audit-Ready Signal

- `sync_status: current-state-synced`
- `sync_updated_at: 2026-09-12`
- **동기화 범위**: `README.md`, `.moai/project/product.md`, `.moai/project/tech.md`,
  `CHANGELOG.md`를 v0.14.0/HEAD `11e23fe`의 실제 상태에 맞췄다. 62/62 test files·
  431/431 tests, Netlify Deploy Preview 수정 후 성공, 장기 프로덕션 사이트 채택 미결정,
  readiness 7개 항목 전부 `UNVERIFIED`와 전체 `NO-GO`를 서로 구분해 기록했다.
- **SPEC 상태 유지**: `spec.md` frontmatter의 `status: in-progress`를 변경하지 않는다.
  이 sync는 현재 상태의 문서 정합화이며, M4 원격 검증을 완료하거나 readiness를
  `GO`로 바꿨다는 뜻이 아니다. 이 워크스페이스에는 `.env.local`, Netlify/Turso/
  Gemini/Better Auth/테스터 환경변수, Netlify CLI 연결 상태가 없어 7개 원격 게이트를
  실행할 수 없다.
- **sync 검증**: 동기화 과정에서 README의 스키마 목록·전체 검증 수치와 tech.md의
  Gemini 동시성 설명, `lib/pipeline/index.ts`의 옛 Vercel 코드 주석도 현재 구현에
  맞게 정정했다. 변경 후 저장소에 설치된 실행 파일을 직접 사용해
  `prettier --check`(변경한 6개 파일), `tsc --noEmit`, `eslint .`을
  재실행했으며 모두 exit 0.
  `pnpm run format:check`는 프로젝트 코드를 읽기 전에 로컬 Corepack 런처의
  `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`로 종료되어, 동일한 저장소 설치본
  `node_modules/prettier/bin/prettier.cjs`를 Node 20.19.6으로 직접 실행했다. 런타임
  동작은 변경하지 않았고, 전체 테스트·build·E2E는 §N의 HEAD `9beb3a7` 이후 검증
  결과를 재사용한다(`lib/pipeline/index.ts` 변경은 호스트명 주석 1단어뿐이다).
- **다음 전환 조건**: 실제 배포 환경 접근이 제공되면 M4의 타임아웃 3회 실측, AI
  Studio 쿼터 확인, 원격 Turso 마이그레이션·시드·테스터 생성, 실 도메인 인증,
  실 Gemini 스모크, 서로 다른 사용자 동시 부하, 원격 리스·복구 검증을 수행하고
  readiness-decision 문서를 다시 판정한다.

## §O Netlify 환경 확인 + 원격 Turso 부분 검증 (2026-09-12)

사용자 확인에 따라 기존 Netlify 사이트 `musical-macaron-82feb3`에 CLI로 연결하고,
비밀값을 출력하지 않은 채 production/deploy-preview 컨텍스트의 환경변수 존재 여부를
확인했다. 두 컨텍스트 모두 앱 실행 필수값인 `TURSO_DATABASE_URL`,
`TURSO_AUTH_TOKEN`, `GEMINI_API_KEY`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`과
선택값 `SUPPORT_CONTACT_EMAIL`을 보유한다.

- Netlify production 환경을 주입해 `scripts/db-migrate.ts` 실행 성공(exit 0).
- 같은 환경에서 `scripts/db-seed.ts` 실행 성공(exit 0).
- 최초 독립 읽기 조회로 마이그레이션 6건, `evidence` 21건, `allowed_testers` 0건,
  `users` 0건, `reservations` 0건을 확인한 뒤, 사용자가 세 테스터 계정을 생성했다.
- 세부 증거: `.moai/reports/pilot-ready-remote-db-verification-20260912.md`.
- **AC/readiness 판정**: 세 이메일 모두 `allowed_testers=1`, `users=1`로 재확인했고,
  후속 migration 0006 적용과 스키마 조회까지 완료해 항목 (3)을 `READY`로 판정했다.
  실 도메인 인증·Gemini·부하·복구 검증이 남아 전체 판정은 아직 `NO-GO`다.
- **실 도메인 차단**: Deploy Preview는 `/`, `/login`, `/api/auth/get-session` 모두
  Netlify 방문자 접근 제어에서 HTTP 401을 반환한다. Production URL은 HTTP 404다.
  따라서 앱 레이어의 인증, 실 Gemini 스모크, 처리시간 3회, 다중 사용자 부하 및
  원격 리스/복구 검증은 아직 실행하지 못했다.
- **설정 정정 필요**: production의 `BETTER_AUTH_URL`도 Deploy Preview URL을
  가리키므로, production 배포 전 최종 Production URL로 분리해야 한다.
- **Gemini 쿼터 미확인**: 두 컨텍스트 모두 RPM budget 명시값이 없어 코드 기본값 4를
  사용한다. 실행 가능 여부와 별개로, 실제 AI Studio 한도 확인 및 그에 근거한 예산값
  기록이 없으므로 readiness 항목 (2)은 계속 `UNVERIFIED`다.

## §P Deploy Preview 공개 후 접근 재확인 (2026-09-12)

사용자가 Deploy Preview 방문자 접근을 Public으로 전환했다. 동일한 실제 배포 도메인에서
다음 응답을 확인했다.

- `/` → HTTP 200
- `/login` → HTTP 200, 로그인 페이지 콘텐츠 확인
- `/api/auth/get-session` → HTTP 200
- `/cases/new` → HTTP 307 → `/login` (비로그인 보호 라우트 정상)

이로써 Netlify 방문자 보호로 인한 검증 차단은 해소됐다. 원격 DB의
`users`/`allowed_testers`에 세 계정이 등록되어 실제 로그인과 이후 M4 검증을 시작할 수
있다. 세부 결과는 `.moai/reports/pilot-ready-remote-db-verification-20260912.md`에
추가했다. 계정별 원격 조회 결과는 세 이메일 모두 `allowlist=1`, `user=1`이다.

## §Q Preview 분석 실패 원인 진단 (2026-09-12)

사용자가 첫 분석 요청이 1분 이내에 “네트워크 오류”로 실패했다고 보고했다. 프런트
메시지는 HTTP 5xx/비정상 응답도 동일하게 표시하므로, Netlify production 환경변수를
주입한 동일 `runPipeline()`을 별도 프로세스에서 1회 측정했다.

- `gemini-3.6-flash`, `gemini-3.5-flash-lite` 단일 호출: 모두 성공.
- 전체 파이프라인: `PIPELINE_OK elapsedMs=81227` (약 81.2초).
- 결론: 키·모델·인증 실패가 아니라, 현재 동기 파이프라인이 Netlify 공식 60초
  상한을 초과해 배포 요청이 종료되는 것이 가장 직접적인 원인이다.
- 이 측정은 배포 도메인 실측이 아니므로 readiness 항목 (1)의 READY 근거로 승격하지
  않는다. 다만 호스팅 적합성의 BLOCKER를 재현하는 진단 증거로 기록한다.
- 선택지는 (a) 동기 60초 초과 실행을 지원하는 호스팅으로 이전하거나, (b) 분석을
  비동기 작업/상태 조회 구조로 바꾸는 것이다. 단순히 Netlify 환경변수 키를 다시
  입력하는 것으로는 해결되지 않는다.

## §R Netlify Free 비동기 전환 구현 (2026-09-12)

Netlify Free를 유지하면서 60초 동기 응답 제한을 피하기 위해 분석 요청을 Background
Function 작업으로 전환했다. `POST /api/cases`는 입력 검증과 사용자별 리스 획득,
`case_jobs` 저장까지만 수행하고 HTTP 202와 `jobId`를 즉시 반환한다. Background
Function(`netlify/functions/process-case-background.ts`)이 기존 6단계 파이프라인을
실행하고 `cases`/`reports`를 원자적으로 저장하며, 클라이언트는
`/api/cases/status?jobId=...`를 polling해 완료 시 결과 페이지로 이동한다.

- 새 스키마/마이그레이션: `case_jobs` 및 migration 0006
- 실패 시 job 상태를 `failed`로 기록하고 사용자 리스를 fenced release
- Background Function 최대 실행시간에 맞춰 비동기 job 리스 TTL은 960초로 분리
- 기존 동기 `createCase()`와 201 응답 호환 분기는 기존 테스트·호출자를 위해 유지
- 다음 게이트: Preview 배포 후 실제 로그인 사용자 1건 제출, 202 즉시 응답, 81초 이상
  처리 완료 및 실패/중복 제출 동작을 실제 도메인에서 확인

## §S 비동기 경로 로컬 안정화 및 회귀 테스트 보강 (2026-09-12)

§R 구현 직후 전체 품질 게이트를 재실행해 발견한 회귀와 비동기 경로의 미검증 구간을
TDD로 보강했다.

- `case_jobs` 추가 뒤 갱신되지 않았던 마이그레이션 테스트의 테이블 목록(11개)과 SQL
  파일 개수(7개)를 실제 스키마에 맞췄다.
- 네트워크 `fetch` 예외의 원시 메시지가 사건 입력 화면에 노출되던 회귀를 재현하고,
  의도적으로 생성한 분석 상태 오류와 네트워크 예외를 구분해 후자는 안전한 일반 안내로
  되돌렸다.
- Background Function enqueue가 HTTP 오류를 반환하거나 네트워크 예외로 실패하면 생성한
  job을 `failed`로 전환하고 동일 `leaseId`의 사용자 리스를 트랜잭션으로 해제하도록
  보상 경로를 추가했다.
- job 초기 상태를 `queued`로 분리하고, `queued → processing` 조건부 UPDATE를 원자적
  실행 claim으로 사용했다. 동일 job의 Background Function이 동시에 호출돼도 claim을
  획득한 한 실행만 Gemini 파이프라인을 시작한다.
- 실패 재현: 신규 route/core 테스트 5개가 수정 전 모두 실패함을 확인했다(enqueue 정리
  미호출 2건, queued 상태 부재, cancel 함수 부재, 동시 실행 시 파이프라인 2회 호출).
- 직접 검증 범위를 `startCaseJob`/`cancelCaseJob`/`processCaseJob`, 상태조회 API의 인증·
  소유권·4개 상태, Netlify Background Function 입력 계약, 클라이언트의
  `202 → polling → 결과 이동` 흐름까지 확장했다.
- 최종 검증: Vitest **64/64 files, 448/448 tests PASS**, `tsc --noEmit` PASS,
  ESLint PASS, Prettier PASS, `git diff --check` PASS.

Deploy Preview 반영과 원격 Turso migration 0006 적용은 §T에서 완료했다. 다음 게이트는
실제 로그인 계정으로 `202 → Background Function → completed → case/report 조회` 한 건을
종단 검증하는 것이다.

## §T 비동기 배포 및 원격 DB READY 전환 (2026-09-12)

비동기 경로 안정화 변경을 커밋·푸시하고 PR #10의 Deploy Preview와 원격 Turso를
순서대로 검증했다.

- 비동기 lifecycle 보강 커밋: `1d0b4ef`.
- 최초 Preview는 `netlify/functions/` 아래의 테스트 파일을 함수로 오인해 함수명 검증에
  실패했다. 테스트를 배포 함수 디렉터리 밖으로 이동한 수정 커밋 `f4bcfa3`을 푸시했다.
- 최신 Deploy Preview 배포 `6aa551276d1d0c0008bd57c3`은 commit `f4bcfa3` 기준
  `ready`다.
- Netlify production 컨텍스트로 `scripts/db-migrate.ts`를 실행해 migration 0006 적용을
  완료했다(exit 0).
- 독립 읽기 조회 결과: 마이그레이션 7건, `case_jobs` 8개 컬럼, `evidence` 21건,
  `users` 3건, `allowed_testers` 3건.
- `.moai/reports/pilot-ready-remote-db-verification-20260912.md`와 readiness-decision을
  동기화해 항목 (3)을 `READY`로 전환했다. 나머지 6개 항목은 `UNVERIFIED`이므로 전체
  판정은 `NO-GO`를 유지한다.

다음 게이트는 실제 Preview 도메인 로그인·세션·보호 페이지 접근을 확인한 뒤 비동기
happy path 한 건을 종단 검증하는 것이다. PR #10은 이 게이트와 남은 readiness 검증이
끝날 때까지 머지하지 않는다.

## §U 실 도메인 인증 및 비동기 happy path 직접 검증 (2026-09-12)

최신 Deploy Preview(`6aa5533dc973a900089fa6f3`, commit `9ae909c`, state `ready`)에서
합성 전용 테스터를 프로비저닝하고 비밀번호·세션 토큰을 출력하지 않은 채 실제 HTTP
종단 검증을 수행했다.

- `/login` HTTP 200 및 실제 `SUPPORT_CONTACT_EMAIL` 기반 활성 `mailto:` 렌더 확인.
- `POST /api/auth/sign-in/email` HTTP 200, 세션 쿠키 수립, `/api/auth/get-session` 사용자
  일치 확인.
- 비로그인 `/cases/new`는 307→`/login`, 같은 세션의 요청은 HTTP 200.
- 합성 사건 제출은 1,597ms에 HTTP 202 + jobId 반환.
- 처리 중 같은 사용자의 두 번째 제출은 HTTP 409.
- 상태는 `processing → completed`, 완료 관측은 36,528ms, 전체 검증은 40,675ms.
- 결과 페이지 HTTP 200 및 합성 진단명 렌더 확인.
- 원격 Turso 독립 조회에서 해당 job `completed`, 연결된 `cases` 1건과 `reports` 1건 확인.
- 인증 상세 증거: `.moai/reports/pilot-ready-auth-domain-verification-20260912.md`.

이 결과로 AC-PILOT-READY-005와 AC-PILOT-READY-013을 PASS, readiness 항목 (4)을
READY로 전환했다. 네트워크 관측기 기반 Gemini 3단계별 호출 성공·실제 호출 횟수와
응답/DB 필드 일치까지는 이번 검증에서 수집하지 않았으므로 AC-010/readiness 항목 (5)는
UNVERIFIED를 유지한다. 전체 readiness는 항목 (1), (2), (5), (6), (7)이 남아
`NO-GO`다.

다음 게이트는 REQ-PILOT-READY-010의 5가지 증거를 모두 수집하는 실 Gemini 스모크다.

## §V 실 Gemini 관측 영속화 로컬 준비 (2026-09-13)

실 배포 스모크에서 Gemini 호출 횟수와 단계별 성공 여부를 로그 열람에만 의존하지 않고
job 단위로 교차 검증할 수 있도록 비민감 관측값 영속화를 추가했다.

- `gemini_request_observations` 테이블과 migration 0007을 추가했다. 저장 필드는 job ID,
  HTTP method, 모델명, 상태 코드, 성공 여부, 소요시간, 관측 시각뿐이며 API key, 요청 URL,
  prompt, response 본문은 저장하지 않는다.
- Background Function의 `AsyncLocalStorage` 관측 컨텍스트에 저장 콜백을 연결했다. 관측값
  저장 실패는 별도의 안전한 구조적 오류 로그를 남기되 Gemini 응답 자체를 실패로
  바꾸지 않는다.
- Node 20에서도 스크립트 CLI 테스트가 일관되게 실행되도록 테스트 자식 프로세스가
  저장소에 고정된 `tsx` CLI를 명시적으로 사용하게 했다.
- 로컬 검증: 관련 7개 파일/64개 테스트 PASS, 전체 65개 파일/453개 테스트 PASS
  (Node 22.23.2), `tsc --noEmit`, ESLint, Prettier, `git diff --check`, sentinel 환경값과
  로컬 임시 DB를 사용한 `next build` 모두 exit 0.
- 이 단계는 실 배포 증거를 수집할 수 있는 코드 경로를 준비한 것일 뿐이다. 원격 Turso에
  migration 0007을 적용하고 최신 Preview에서 합성 사건을 실행해 AC-PILOT-READY-010의
  5개 증거를 리포트로 남기기 전까지 readiness 항목 (5)는 `UNVERIFIED`, 전체 판정은
  `NO-GO`를 유지한다.
