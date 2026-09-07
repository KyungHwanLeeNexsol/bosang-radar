# SPEC-UI-MIGRATION-001 Visual Evidence — Round 4 (current)

> Round 4 supersedes the Round 3 "audit-ready" verdict — see `progress.md` "Current Status" for the authoritative status. Round 3 content below is kept as history, not deleted.

## Directories

- **before-round3/**: Login screenshot actually captured from commit `493356e` (a temporary git worktree was built/dev-started, captured, then removed — see progress.md Round 4 entry for the procedure). Case-input "before" state is represented by `after-round3/case-input-*.png` (the commit under external review, `b05eb5a`), since that is the actual baseline Round 4 corrects.
- **after-round3/**: Screenshots of Round 3 fixed state (commit `b05eb5a`) — kept as the Round 4 "before" baseline for case-input.
- **after-round4/**: Screenshots of the current Round 4 state (this branch's HEAD) — see the expanded list below.
- **comparison-login.html / comparison-case-input.html**: 3-column Pencil/Before/After comparison pages with a Gap Matrix table (viewport, commit SHA, data state, measured differences, intentional deviations + rationale).
- **Pencil reference**: `../../design/exports/` (20 PNGs from Pencil design tool — already committed)

## After-Round4 Screenshots (docs/evidence/SPEC-UI-MIGRATION-001/after-round4/)

| File                                        | Viewport        | Screen        | Condition                                                |
| ------------------------------------------- | --------------- | ------------- | -------------------------------------------------------- |
| login-{1440,1024,390}.png                   | 각              | Login         | Round 4 시각 정합 수정 후                                |
| global-not-found-1440.png                   | 1440px          | 전역 404      | `/존재하지-않는-경로`                                    |
| case-input-empty-recent-{1440,1024,390}.png | 각              | Case Input    | 최근 리서치 0건                                          |
| case-input-mobile-390-fullpage.png          | 390px, fullPage | Case Input    | 전체 페이지(하단까지)                                    |
| case-input-with-recent-1440.png             | 1440px          | Case Input    | 최근 리서치 2건(실 DB 데이터)                            |
| report-verified-claim-{1440,1024}.png       | 각              | 리포트        | VERIFIED claim 확보                                      |
| report-insufficient-attempt-1440.png        | 1440px          | 리포트        | INSUFFICIENT 재현 시도(결과: 미발생, 잔여 위험으로 기록) |
| report-mobile-390-fullpage.png              | 390px, fullPage | 리포트        | 전체 페이지                                              |
| expert-feedback-{1440,1024}.png             | 각              | 전문가 피드백 | `#expert-feedback` 앵커                                  |
| exception-not-found-1440.png                | 1440px          | 사건별 404    | 존재하지 않는 사건 ID                                    |
| mobile-drawer-{closed,open}-390.png         | 390px           | 모바일 드로어 | 닫힘/열림                                                |

## After-Round3 Screenshots

| File                         | Viewport | Screen        | Condition                              |
| ---------------------------- | -------- | ------------- | -------------------------------------- |
| login-1440.png               | 1440px   | Login         | B tile on LEFT panel (fixed)           |
| login-1024.png               | 1024px   | Login         | Tablet view                            |
| login-390.png                | 390px    | Login         | Mobile (brand panel hidden)            |
| case-input-1440.png          | 1440px   | Case Input    | CTA="AI 리서치 시작", progress bar=0%  |
| case-input-1024.png          | 1024px   | Case Input    | Tablet layout                          |
| case-input-390.png           | 390px    | Case Input    | 1-column grid for diagnosis/disability |
| exception-not-found-1440.png | 1440px   | Exception     | Case not found page                    |
| mobile-drawer-closed-390.png | 390px    | Mobile Drawer | Closed state                           |
| mobile-drawer-open-390.png   | 390px    | Mobile Drawer | Open state                             |

## Key Changes vs 493356e (Round 3 corrections — kept for history)

1. Login: B tile moved from RIGHT panel to LEFT panel (matches Pencil 03-테스터-로그인.png)
2. Case Input CTA: "제출" → "AI 리서치 시작" (Sparkles icon)
3. Case Input grid: grid-cols-2 → grid-cols-1 sm:grid-cols-2 (390px responsive)
4. Analysis status bar: w-[15%] → w-0 (waiting state = 0%, AC-012 compliant)

## Key Changes vs b05eb5a (Round 4 corrections — current)

See `progress.md` "Round 4 — 로그인 화면 Gap Matrix" and "Round 4 — 사건 입력 화면 Gap Matrix" for the full tables. Summary: right-rail reorder (PII notice → analysis status → recent research), required-field asterisks, taller inputs/textarea, per-step "대기" labels, footer lock icon + copy, password-toggle visible text, footer link separators + back arrow, wider headline-to-logo spacing, feature-icon background containers, and the `scripts/capture-evidence.ts` dead-code removal that was the actual `pnpm build` failure cause.

## Generation Procedure

```bash
# Capture after-round4 screenshots (current):
CAPTURE_EVIDENCE=1 npx tsx scripts/run-e2e.ts --spec=e2e/capture-evidence.spec.ts --workers=1

# Note: CAPTURE_EVIDENCE=1 env var required to activate the skip-by-default spec
```

## Commit SHA Reference

- before-round3/login-1440.png: captured live from commit `493356e7d6e5c7df1ccafca6921075cd05348993` via a temporary `git worktree add` + `pnpm dev`, then the worktree was removed (Round 4 procedure — see progress.md).
- after-round3/: 23a2031c69f189c5e53c0e1dd813ef212b042117 → later re-captured at `b05eb5a24edef19c0ef1580bdbcab15d108f5b3c` (the commit the Round 4 external review targeted); this directory is the Round 4 "before" baseline for case-input.
- after-round4/: this branch's HEAD at Round 4 completion (see progress.md for the exact commit once pushed).
- Pencil exports: already committed in design/exports/ from previous rounds
