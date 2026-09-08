# SPEC-UI-MIGRATION-001 Visual Evidence — Round 5 (final, correction pass applied)

> Round 5 supersedes the Round 4 `audit-ready` verdict — see `progress.md` "Current Status" for the authoritative status (`audit-ready` as of the 2026-09-08 correction pass — see `progress.md` "Round 5 — 3건 재분류 (correction pass)" for how the previously-unresolved 3 items were classified). Round 3/4 content below is kept as history, not deleted.
>
> **Correction pass (2026-09-08)**: this document, the four `comparison-*.html` files, and `progress.md`/`acceptance.md` were corrected for staleness (dev-mode login screenshots replaced with production captures, `comparison-report.html`'s image/SHA mismatch fixed, `comparison-case-input.html`'s stale INSUFFICIENT-not-secured text replaced with the actual success evidence, DoD checkbox contradiction resolved). No screen behavior changed in this pass — only evidence artifacts and documentation. Final capture/correction commit: `eb2171e`.

## Directories

- **before-round3/**: Login screenshot actually captured from commit `493356e` (a temporary git worktree was built/dev-started, captured, then removed — see progress.md Round 4 entry for the procedure). Case-input "before" state is represented by `after-round3/case-input-*.png` (the commit under external review, `b05eb5a`), since that is the actual baseline Round 4 corrects.
- **after-round3/**: Screenshots of Round 3 fixed state (commit `b05eb5a`) — kept as the Round 4 "before" baseline for case-input.
- **after-round4/**: Screenshots of the Round 4 state (commit `c210ebff732f2355d52359113762a55515680528`, pushed to `origin/plan/SPEC-UI-MIGRATION-001`) — now the Round 5 "before" baseline for the mobile footer / login headline / expert feedback fixes.
- **after-round5/**: Screenshots of the current Round 5 state (login headline/spacing fix, mobile case-input footer fix, expert-feedback structural migration) — see the file list below.
- **comparison-login.html / comparison-case-input.html / comparison-report.html / comparison-feedback.html**: 3-column (or 2-column where no "Before" applies) Pencil/Before/After comparison pages with a Gap Matrix table (viewport, commit SHA, route, scroll position, data fixture, measured differences, intentional deviations + rationale/approval status).
- **Pencil reference**: `../../../design/exports/` (repo-root `design/exports/`, resolved from this README's own location at `docs/evidence/SPEC-UI-MIGRATION-001/`; 20 PNGs from Pencil design tool — already committed). Round 4 shipped a broken `../../design/exports/` path in both comparison HTML files (one `../` short) — fixed in Round 5. **Actually verified** by an automated Playwright spec (`e2e/comparison-docs-images.spec.ts`) that opens all 4 comparison HTML files via `file://` and asserts every `<img>` element's `naturalWidth > 0` — result: 4/4 files PASS, 0 broken images (see progress.md Round 5 §E for the exact command + output).

## After-Round5 Screenshots (docs/evidence/SPEC-UI-MIGRATION-001/after-round5/)

| File                                      | Viewport        | Screen            | Condition                                                         |
| ----------------------------------------- | --------------- | ----------------- | ----------------------------------------------------------------- |
| login-{1440,1024,390}.png                 | 각              | Login             | Round 5 헤드라인 크기/위치 실측 보정 후                           |
| case-input-mobile-390-fullpage.png        | 390px, fullPage | Case Input        | Footer 레이아웃 붕괴 수정 후(재캡처)                              |
| expert-feedback-initial-{1440,1024}.png   | 각              | 전문가 피드백     | `#expert-feedback` 앵커, 초기 상태(top-of-page)                   |
| expert-feedback-initial-390-fullpage.png  | 390px, fullPage | 전문가 피드백     | 초기 상태, 전체 페이지                                            |
| expert-feedback-partial-1440.png          | 1440px          | 전문가 피드백     | 전체 평가 선택 후(일부 입력 상태)                                 |
| expert-feedback-validation-error-1440.png | 1440px          | 전문가 피드백     | 필수 항목 미선택 제출 시도 후(validation error)                   |
| report-verified-claim-1440.png            | 1440px          | 리포트            | VERIFIED claim 확보(production 재캡처, correction pass)           |
| report-insufficient-fixture-1440.png      | 1440px          | 리포트            | INSUFFICIENT 실제 성공 증빙(fixture 주입, correction pass)        |
| report-mobile-390-fullpage.png            | 390px, fullPage | 리포트            | 전체 페이지(production 재캡처, correction pass)                   |
| runtime-error-{1440,1024}.png             | 각              | 사건 상세(리포트) | 런타임 오류 경계(`error.tsx`) 실제 트리거 후(3차 correction pass) |
| case-input-sticky-sidebar-{1024,1440}.png | 각              | Case Input        | 데스크톱 사이드바 sticky 수정 후(3차 correction pass)             |

### `runtime-error-{1440,1024}.png` 상세

- **viewport**: 1440×900, 1024×768(각각 별도 파일)
- **route**: `/cases/<caseId>`(리포트 화면, 인증된 테스터 세션) — `app/cases/[caseId]/error.tsx` 오류 경계가 이 라우트 세그먼트를 감싼다
- **상태 및 fixture**: 정상 플로우로 사건 생성 후, `reports.content`에서 `verifiedClaims` 필드를 DB 레벨로 결정론적으로 제거(INSUFFICIENT fixture와 동일 기법 — 화면이 아니라 입력 데이터 조작). `page.tsx:181`의 `report ? report.verifiedClaims.flatMap(...) : []`가 `report`는 truthy이나 `verifiedClaims`가 없어 실제 TypeError를 던지며, Next.js의 진짜 오류 경계로 이어진다
- **production build 기준 여부**: 예 — `pnpm build && pnpm start`(scripts/run-e2e.ts의 webServer)
- **실제 캡처 커밋 SHA**: `16800f9`(초기 캡처) — 3차 재검토 후 `.next` 캐시를 완전히 삭제하고 fresh build로 동일 HEAD(`06098a6`)에서 재캡처해도 동일함을 재확인(2026-09-08)
- **주요 assertion**: 캡처 직전 `getByText("문제가 발생했습니다")`와 `getByTestId("case-error-retry")`의 `toBeVisible()` — 정상 리포트 화면이 아니라 실제 오류 경계가 렌더링됐음을 캡처 전에 확인

### `case-input-sticky-sidebar-{1024,1440}.png` 상세

- **viewport**: 1024×768, 1440×900(각각 별도 파일)
- **route**: `/cases/new`(사건 입력, 인증된 테스터 세션) — 폼 콘텐츠가 뷰포트보다 길어 사이드바 sticky 수정 전에는 사용자 블록이 뷰포트 밖으로 밀리던 화면
- **상태 및 fixture**: 별도 fixture 없음(신규 사건 입력 폼의 기본 렌더링 상태)
- **production build 기준 여부**: 예 — 3차 재검토 후 `.next` 캐시를 완전히 삭제하고(`rm -rf .next`) fresh `pnpm build && pnpm start`로 재캡처(2026-09-08) — 기존 빌드 캐시 재사용 의혹을 원천적으로 배제
- **실제 캡처 커밋 SHA**: `06098a6`(fresh build 재캡처 시점의 HEAD; 소스 변경은 `16800f9`에서 완료, 이후 커밋은 SHA backfill/문서만)
- **주요 assertion**(`e2e/sidebar-assertions.ts`의 `assertStickySidebarUserBlockVisible` 공통 helper — `e2e/sidebar-sticky.spec.ts` 회귀 테스트와 동일 조건 공유): `window.scrollY === 0`, aside `position: sticky` / `top: 0px` / `height`가 뷰포트와 동일(실측: 1024px→768px, 1440px→900px), 사용자 블록 bounding box 존재 + 하단 좌표가 뷰포트 높이 이하(실측: 1024px→744.375px≤768px, 1440px→876.375px≤900px), 사용자 블록 텍스트("e2e-tester-a") 실제 렌더링, 가로 오버플로 없음(`document.documentElement.scrollWidth ≤ viewport width`)

**로컬 실행 기록 명시**: 이 프로젝트에는 GitHub Actions 등 원격 CI가 구성돼 있지 않다. 위 캡처와 아래 검증 결과는 모두 이 세션에서 로컬로 실행한 기록이며, CI에서 재현된 결과가 아니다.

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
- after-round5/: Round 5 work commit `f6ea25a614782ae60c1e2c0ceaf575483d59087c` (initial Round 5 fixes) → SHA-backfill commit `be381a8476110387ff651483d441a0ec8c77b021` → **1st correction pass `eb2171e`→`9622bae`(SHA backfill)** (login/mobile-footer/expert-feedback/report screenshots re-captured against `pnpm build && pnpm start`; `report-verified-claim-1440.png`/`report-insufficient-fixture-1440.png` new) → **2nd correction pass `4ddb24d`→`30cd9b8`(SHA backfill)** (§3/§4 checklist alignment, doc-only, no new screenshots) → **3rd correction pass `16800f9`→`06098a6`(SHA backfill)** (real code fix `app/cases/app-shell-chrome.tsx` static→sticky sidebar + real `error.tsx` reproduction; new: `runtime-error-{1440,1024}.png`, `case-input-sticky-sidebar-{1024,1440}.png`) → **4th re-verification pass `acb1823`** — external review reported the 1024px sticky-sidebar image appeared to not show the user block; re-investigated with `.next` cache fully removed + fresh `pnpm build` + a shared assertion helper (`e2e/sidebar-assertions.ts`, computed `position`/`top`/`height`, bounding boxes, `window.scrollY === 0`, no horizontal overflow) gating the capture — the re-captured images at HEAD `06098a6` are byte-identical to the images already committed at `16800f9`; no code defect was found, only the missing pre-capture assertion (now added) was a real gap. A full E2E suite exit-1 encountered mid-verification was root-caused to 7 orphaned node processes from this session's own repeated build/test cycles (4 unrelated-project processes were confirmed and left untouched); after cleanup the suite passed cleanly (exit 0).
- Pencil exports: already committed in design/exports/ from previous rounds
