# SPEC-UI-MIGRATION-001 — progress.md

## §E.1 Plan-phase Audit-Ready Signal

### Plan-audit report persistence policy (read before citing any `.moai/reports/plan-audit/*.md` path)

Plan-audit report files under `.moai/reports/plan-audit/` are **local-only artifacts by explicit project policy** — `.gitignore` lines 207-211 (section header "Plan Audit Reports (local artifacts)") ignore `.moai/reports/plan-audit/*.md` and track only `.gitkeep`, matching `.claude/rules/moai/workflow/spec-workflow.md` § Report Persistence: "Reports in both streams are local artifacts (gitignored)." A report file existing in the current worktree right now (verifiable via `ls .moai/reports/plan-audit/`) is genuine local evidence, but its presence is **not expected to appear in git history on any remote or any other clone** — this is standard, documented policy, not an oversight. **For a reader without access to this worktree's local filesystem, the inline summary recorded below (verdict, score, iteration, findings, who ran it, when) is the durable, verifiable record — the report file's presence or absence in the repository proves nothing either way.**

### History (prior iterations, recorded honestly per verification-claim-integrity §1)

- **Iteration 1** (commit `b1a3db8`, 2026-09-03): plan-phase artifacts committed. The commit message claims "plan-auditor iteration-2 PASS(score 0.86)". **This claim is unattributed** — `.moai/reports/plan-audit/` contains no `SPEC-UI-MIGRATION-001-review-*.md` file (verified via `ls` and `git log --all --grep="UI-MIGRATION"`, both empty). No plan-auditor invocation evidence (command + observed output) exists for this SPEC. Per `verification-claim-integrity.md` §1.1 surface 2 and §2 (Baseline-Integrity Attribution), this is a claim without a baseline and MUST NOT be treated as a valid prior audit result.
- **External independent review, round 1** (2026-09-03, pre-run): identified 8 defect categories, the most significant being a factual baseline error in research.md/design.md/spec.md §7 — `app/cases/[caseId]/error.tsx` was described as already containing a 404/case-not-found variant with `"CASE-2024-0999" · "ERR_CASE_NOT_FOUND"` metadata; direct re-inspection of the file (and a `**/not-found.tsx` glob across `app/`) confirmed this was never true. All 5 revisable documents (spec/plan/acceptance/design/research; progress excluded) were revised in response — see each file's HISTORY/revision-note entry for the itemized changes.
- **Iteration 1, post-round-1-revision PASS — ⚠️ SUPERSEDED BY THE ROUND-2 REVISION BELOW, DO NOT CITE AS CURRENT**: plan-auditor (subagent, invoked by the orchestrator) re-ran on 2026-09-03 against the round-1-revised artifact set. Verdict **PASS**, overall score **0.97** (Tier L threshold: 0.85). Report (local-only, per the persistence policy above): `.moai/reports/plan-audit/SPEC-UI-MIGRATION-001-review-1.md`. The auditor independently re-verified every factual claim in the round-1 revision directly against the codebase (error.tsx content, absence of not-found.tsx files, get-case-for-owner.ts pattern, SPEC-PILOT-VISUAL-001's completed status, next.config.ts/session.ts/client.ts for the username-strategy residual, login-form.tsx, lib/pipeline/types.ts, db/schema.ts, case-shell-nav.tsx) — all confirmed accurate. 2 non-blocking optional findings: D1 (REQ-003/REQ-005 embed specific function/file names rather than staying purely behavioral — informational, not required to fix) and D2 (`plan.md:111`'s §F heading contains a negated `[NEEDS CLARIFICATION]` substring that could trip a naive future mechanical grep — informational, not required to fix). **This PASS was measured against the round-1-revised document set. It does NOT cover the round-2 revision below and MUST NOT be cited as the current plan-audit result** (per `verification-claim-integrity.md` §2 — baseline-integrity attribution never carries forward across a changed artifact set).

### External independent review, round 2 (2026-09-03) — this revision

A second external independent review found **2 BLOCKER issues** and **1 MAJOR issue**, plus a mobile-drawer focus-trap accessibility gap. All 6 documents (spec/plan/acceptance/design/research/progress) were revised in response:

- **BLOCKER 1 — `/cases/new` static-generation requirement directly contradicted REQ-013's DB-backed recent-research query.** The prior AC-005a required `/cases/new` to remain statically generated, while REQ-013 required an owner-scoped DB query that needs an authenticated `ownerUserId` — a build-time-only query cannot authenticate anyone. Resolved: the sidebar-username decision (REQ-005, client component) is unchanged; the recent-research query's `ownerUserId` is now sourced from `/cases/new`'s own server page component (`NewCasePage`) performing its own `getCurrentSession()` check (the same pattern already used by `app/cases/[caseId]/page.tsx`) — no new API route. `/cases/new` becoming dynamically rendered is accepted as the intended consequence; AC-005a/REQ-005a's "must stay static" requirement is retired and replaced by build-safety requirements. The exact Next.js 16.3.2 mechanism (`dynamic: "auto"` route segment config default, under the "previous"/non-Cache-Components model this project uses) is documented in `research.md` §5c (new).
- **BLOCKER 2 — this section's own PASS 0.97 evidence citation.** Resolved by this restructuring: the persistence-policy note above, and moving the round-1 PASS into History marked superseded, as itemized above.
- **MAJOR — vague "3 screens each get a dynamic title" Topbar mapping.** Replaced with an exact route-keyed table (`spec.md` REQ-006, `acceptance.md` AC-006a, `design.md` §4) and an explicit statement that `#expert-feedback` is an in-page anchor on `/cases/[caseId]`, not a separate screen/title.
- **Mobile drawer focus-trap gap.** Added Tab/Shift+Tab closed-loop + background-`inert` requirements to REQ-017, with new sub-criteria AC-017i~AC-017l (existing AC-017a~h preserved unchanged) and explicit implementation-responsibility assignment in `plan.md` M8/§B decision 7.

### Plan-auditor re-audit, round 2 (2026-09-03)

plan-auditor (subagent, invoked by the orchestrator) re-ran against the round-2-revised artifact set (the six documents listed above, as revised in this same commit). Verdict **PASS**, overall score **0.94** (Tier L threshold: 0.85). Report (local-only, per the persistence policy stated at the top of this file — not committed to git, not expected to be present in any other clone): `.moai/reports/plan-audit/SPEC-UI-MIGRATION-001-review-2.md`. All 6 requested verification points were independently confirmed directly against the codebase: BLOCKER 1 (the static-generation/REQ-013 DB-query conflict resolution via `NewCasePage`'s own `getCurrentSession()` call), BLOCKER 2 (this section's own audit-evidence citation — resolved by the persistence-policy restructuring above), MAJOR (the Topbar route-keyed title-mapping table), the mobile-drawer focus-trap AC-017i~l additions, cross-document consistency across all six files, and preservation of the round-1-revision decisions. 2 non-blocking informational findings carried forward from the round-1 audit (D1: REQ-003/REQ-005 naming specific function/file names; D2: a negated `[NEEDS CLARIFICATION]` substring in a `plan.md` heading) — no new defects found in this pass.

### Current status (post-round-2-revision, post-re-audit)

- `plan_status: audit-ready`
- `plan_complete_at: 2026-09-03`
- Implementation Kickoff Approval / `/moai run SPEC-UI-MIGRATION-001` is unblocked by this plan-phase artifact: the round-2-revised document set now carries a fresh plan-auditor PASS (0.94) with no unresolved BLOCKER/MAJOR findings. This does NOT mean run-phase has started — the orchestrator's own Implementation Kickoff Approval gate (a separate human-approval step) has not yet been requested or granted as of this entry.

## §E.2 Run-phase Evidence

### M1 — 로그인 화면 폰트 격리 셸 + 재스타일 + 비밀번호 토글/링크 (REQ-002~003)

- 신규: `app/login/layout.tsx`(Pretendard/Manrope 격리 로딩), `app/login/login-form.test.tsx`
- 수정: `app/login/login-form.tsx`(비밀번호 토글 + 푸터 링크 추가, 기존 5개 testid/authClient 로직 보존), `app/login/page.tsx`(2컬럼 + 브랜드 패널)
- RED 증거(수정 전 캡처, `npx vitest run app/login/login-form.test.tsx`): 6개 중 4개 FAIL —
  `AC-002a`/`AC-002b`/`AC-002c`: `TypeError: Cannot read properties of null (reading 'dispatchEvent'/'tagName')`(토글 미구현),
  `AC-002d`: `AssertionError: expected [] to deeply equal ArrayContaining […]`(푸터 링크 미구현). 2개 PASS는 기존 testid만 확인하는 케이스.
- GREEN 증거: `npx vitest run app/login/login-form.test.tsx` → `Test Files 1 passed (1)`, `Tests 6 passed (6)`.
- 회귀 확인: `pnpm test` 전체 → `Test Files 49 passed (49)`, `Tests 341 passed (341)`.
- PRESERVE 확인: `git diff --stat -- app/layout.tsx app/page.tsx` → 빈 출력(AC-003, 완전 zero-diff).
- 빌드: `pnpm build` → TypeScript 통과, `/login`이 `○ (Static)`로 표시됨(세션 조회 없음, REQ-005 사이드바 결정과 무관).
- 품질: `npx eslint app/login/` → 0 findings. `npx prettier --check app/login/` → 전부 통과(1건 자동 포맷 후).
- 잔여 위험/발견 사항: 이 코드베이스의 기존 `fillField` 테스트 헬퍼 패턴(`el.value = x` 직접 대입 + `dispatchEvent(new Event("input"))`)은 React 19의 값-트래킹 래핑 때문에 `onChange`를 전혀 트리거하지 못한다 — React가 계측한 setter를 그대로 통과시켜 "값이 실제로 바뀌었다"는 신호를 만들지 못하기 때문이다. 기존 `case-input-form.test.tsx`는 제출된 필드 *값*을 검증하지 않아(오직 disabled/pending 상태만 검증) 이 결함이 드러나지 않았을 뿐이다. 이 SPEC의 신규 테스트는 네이티브 프로퍼티 디스크립터 setter(`@testing-library/react`의 `fireEvent.change`와 동일한 기법)를 사용하도록 자체 `fillField`를 수정해 우회했다. 기존 테스트 파일은 이 SPEC의 PRESERVE 범위 밖이라 수정하지 않았다.

### M2 — App Shell 확장: Sidebar 2항목 + 사용자 블록 클라이언트 분리 + Topbar 브레드크럼 (REQ-004~006)

- 신규: `app/cases/sidebar-user-block.tsx`(클라이언트, `authClient.useSession()`), `app/cases/case-shell-topbar.tsx`(클라이언트, pathname 기반 브레드크럼/타이틀), 대응 테스트 3종.
- 수정: `app/cases/case-shell-nav.tsx`(비활성 2항목 추가), `app/cases/layout.tsx`(하드코딩 사용자 블록/헤더를 두 신규 클라이언트 컴포넌트 렌더링으로 교체).
- RED 증거(`npx vitest run app/cases/case-shell-nav.test.tsx app/cases/sidebar-user-block.test.tsx app/cases/case-shell-topbar.test.tsx`, 수정 전): case-shell-topbar/sidebar-user-block 스위트 2개는 `Failed to resolve import` — 파일 미존재; case-shell-nav 스위트는 4개 중 2개 FAIL(`expected … to have a length of 5 but got 3`, `Cannot read properties of null (reading 'getAttribute')` — 신규 nav 항목 미구현), 2개는 기존 3항목 pathname 규칙만 검증해 이미 PASS.
- GREEN 증거: 동일 명령 → `Test Files 3 passed (3)`, `Tests 10 passed (10)`.
- AC-005a 확인: `grep -n "getCurrentSession" app/cases/layout.tsx` → 주석 1건만 매치(실제 호출 없음).
- 회귀 확인: `pnpm test` 전체 → `Test Files 52 passed (52)`, `Tests 351 passed (351)`.
- 빌드: `pnpm build` → `/cases/new`가 여전히 `○ (Static)` 유지(사이드바 사용자 블록은 클라이언트 컴포넌트라 빌드 시점 렌더링에 영향 없음 — REQ-005/REQ-013 결정이 서로 독립적임을 재확인. `/cases/new`의 Dynamic 전환은 M6에서만 발생 예정).
- 품질: `npx eslint app/cases/` → 0 findings(수정 후). `npx prettier --write` 적용, 이후 통과.

### M3 — Enum 한글 라벨 매핑 (REQ-007~008)

- 신규: `lib/pipeline/labels.ts`(EVIDENCE_TYPE_LABELS 5종 + QUERY_ISSUE_TYPE_LABELS 8종 단일 SSOT, §B 결정 8 — 공유 모듈로 추출), `lib/pipeline/labels.test.ts`, `components/evidence-item.test.tsx`(신규).
- 수정: `components/evidence-item.tsx`, `app/cases/[caseId]/page.tsx`(claim 카드 issue Chip + 우 레일 "수집 근거 유형"), `app/cases/[caseId]/feedback-form.tsx`(누락 쟁점 select + 근거자료 평가 테이블 표시).
- RED 증거: `lib/pipeline/labels.test.ts` → `Cannot find module './labels'`; `components/evidence-item.test.tsx` → `expected … to contain '장해 평가 기준'` (raw "PRECEDENT"/"DISABILITY_GRADE_CRITERIA"만 렌더링됨, 라벨 매핑 미구현).
- GREEN 증거: 4개 파일 전부 `Test Files 4 passed (4)`, `Tests 15 passed (15)`.
- 기존 테스트 갱신(REQ-020 testid/의미 보존 원칙 준수, 화면 텍스트만 변경): `app/cases/[caseId]/page.test.tsx` AC-007과 `app/cases/[caseId]/feedback-form.test.tsx` AC-007(parity)의 raw 값(`"PRECEDENT"`/`"DISABILITY_GRADE_CRITERIA"`) 검증을 한글 라벨(`"판례"`/`"장해 평가 기준"`) + not.toContain(raw) 검증으로 교체 — 두 파일 모두 `data-testid`/`data-status` 등 testid 자체는 무변경.
- data-* 속성 보존 확인: `grep -rn 'data-status' "app/cases/[caseId]/"` 확인 결과 무변경(별도 커밋 diff로 확인 가능).
- 회귀 확인: `pnpm test` 전체 → `Test Files 54 passed (54)`, `Tests 354 passed (354)`.
- 빌드: `pnpm build` → 통과, 라우트 세그먼트 표 무변경.
- 품질: `npx eslint lib/pipeline/ components/ "app/cases/[caseId]/"` → 0 findings. prettier 적용 후 통과.

## §E.3 Run-phase Audit-Ready Signal

_<pending run-phase>_

## §E.4 Sync-phase Audit-Ready Signal

_<pending sync-phase>_
