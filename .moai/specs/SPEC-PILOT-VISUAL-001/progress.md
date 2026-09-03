# SPEC-PILOT-VISUAL-001 — progress.md

## §E.1 Plan-phase Audit-Ready Signal

- plan_status: audit-ready
- plan_complete_at: 2026-09-03
- tier: L
- artifact_set: spec.md, plan.md, acceptance.md, design.md, research.md, progress.md
- req_count: 24 (ceiling 25, unchanged since iteration 2 — iteration 3 fixes rewrote existing REQs in place, no additions/removals)
- ac_count: 25 (ceiling 25; includes sub-ID entries AC-006b/AC-020b/AC-021b; AC-013 intentionally consolidated into AC-012; unchanged since iteration 2)
- plan_audit_iteration: 3 (iteration 1 verdict FAIL score 0.63 — D1/D2/D7 critical, D3-D6/D8 major, D9/D10 minor; iteration 2 verdict PASS score 0.92; iteration 3 addresses 6 blockers raised by a pre-run external independent review — REQ-006 DB-query removal, REQ-002/003/005 root-layout font isolation, REQ-022/AC-021b contradiction fix, REQ-014 client-mandate removal, HISTORY factual-error cleanup, full cross-reference re-verification; see spec.md HISTORY)
- plan_audit_iteration_3_verdict: PASS
- plan_audit_iteration_3_score: 0.92 (Tier L threshold 0.85; no regression vs iteration 2's 0.92; all 6 externally-raised blockers independently re-verified resolved against live artifacts + codebase, not summary-trusted; this is the final iteration under the 3-iteration Retry Loop Contract cap)

## §E.2 Run-phase Evidence

### M1 — 디자인 토큰 및 폰트 패키지 준비 (REQ-001~003)

**Claim**: `app/globals.css`의 기존 `@theme inline` 블록에 design.md §1의 색상 토큰(33개, `--color-bora-*`/`--color-app-*` 네임스페이스) 및 §2 타이포그래피 스케일(H1/H2/H3/Body/Body S/Meta/Label S)을 추가했고, `pretendard` npm 패키지를 설치했다. 기존 shadcn 베이스 토큰은 변경 없이 유지된다(REQ-001). `app/layout.tsx`/`app/page.tsx`/`app/login/**`은 완전한 zero-diff PRESERVE 상태다(REQ-005). 실제 `next/font/local` 호출은 M2(`app/cases/layout.tsx` 생성 시)로 유예됨(REQ-002/003).

**Evidence**:
```
$ pnpm add pretendard
+ pretendard 1.3.9
Done in 24.6s using pnpm v11.23.0

$ pnpm build   (BUILD_EXIT=0)
✓ Compiled successfully in 1685ms
✓ Generating static pages using 10 workers (6/6) in 1057ms
Route (app): / , /_not-found, /api/auth/[...all], /api/cases, /cases/[caseId], /cases/new, /login
(1 pre-existing Turbopack warning in instrumentation.ts:33 — process.exit in Edge Runtime — unrelated to this milestone, not newly introduced)

$ git diff --stat -- app/layout.tsx app/page.tsx app/login/
(no output — zero diff, confirms REQ-005 PRESERVE)

$ git diff --stat -- app/globals.css package.json pnpm-lock.yaml
 app/globals.css | 50 ++++++++++++++++++++++++++++++++++++++++++++++++++
 package.json    |  1 +
 pnpm-lock.yaml  |  8 ++++++++
 3 files changed, 59 insertions(+)
```

New CSS custom properties added to `@theme inline` (verbatim names, 33 color tokens + 8 typography tokens):
```
--color-app-bg, --color-app-surface, --color-app-surface-sub, --color-app-surface-inset,
--color-app-line, --color-app-line-strong, --color-bora-ink, --color-bora-ink-2,
--color-bora-ink-3, --color-bora-ink-4, --color-bora-accent, --color-bora-accent-deep,
--color-bora-accent-soft, --color-bora-accent-line, --color-bora-ok, --color-bora-ok-soft,
--color-bora-ok-line, --color-bora-warn, --color-bora-warn-soft, --color-bora-warn-line,
--color-bora-danger, --color-bora-danger-soft, --color-bora-danger-line, --color-app-sidebar,
--color-app-sidebar-line, --color-app-sidebar-ink, --color-bora-700, --color-bora-600,
--color-bora-500, --color-bora-400, --color-bora-300, --color-bora-200, --color-bora-050,
--text-h1, --text-h2, --text-h3, --text-body, --text-body--line-height, --text-body-s,
--text-meta, --text-label-s
```
(font-weight uses existing Tailwind utilities font-semibold/font-medium/font-normal — no new tokens, per design.md §2 "H1/H2/H3→600, Body/Body S/Meta→400, Label S→500")

Commit: `<pending — recorded after commit lands>` on branch `plan/SPEC-PILOT-VISUAL-001` (pushed via worktree `worktree-agent-a63b93f48ed5136a9`, fast-forwarded to `b4ac995` before this milestone).

**Baseline-attribution**: this run, this tree — worktree HEAD `b4ac995` (fast-forwarded from the isolated worktree's initial `1da37a9` to match `origin/plan/SPEC-PILOT-VISUAL-001` before any M1 edits; `git merge --ff-only` used, no divergent history).

**Gaps**: (1) `pnpm lint` / `pnpm test` / `pnpm test:e2e` NOT run this milestone — M1 touches only CSS custom-property declarations and a package.json dependency addition, neither of which lint/test suites exercise; full quality-gate run is REQ-024/AC-022, deferred to M6. (2) Visual smoke check (§3 acceptance.md checklist) not applicable yet — no screen consumes these tokens until M4-M6. (3) `pnpm format:check` not run — no formatting-sensitive change beyond the CSS block this milestone's Edit tool already formatted consistently with the file's existing 2-space style.

**Residual-risk**: One CSS-comment authoring defect was caught and fixed during this milestone (a stray `*/` sequence inside an explanatory comment closed the `@theme inline` block early, corrupting subsequent token declarations — detected via the first `pnpm build` failure, root-caused via `CssSyntaxError: Unknown word --color-app-bg`, and fixed by rewording the comment). No other syntax anomalies observed in the second build run. The Tailwind v4 `--text-h1` etc. namespace choice (vs an alternative naming scheme) is a design.md-silent convention decision made at implementation time (design.md §2 states px/weight/line-height values but not the exact CSS custom-property mechanism) — flagging for downstream milestones (M4-M6) that will consume these tokens, in case a different naming convention was implicitly expected.

## §E.3 Run-phase Audit-Ready Signal

_<pending run-phase>_

## §E.4 Sync-phase Audit-Ready Signal

_<pending sync-phase>_
