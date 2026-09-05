# SPEC-UI-MIGRATION-001 Visual Evidence — Round 3

## Directories
- **before-round3/**: EMPTY — "before" state is at commit `493356e`. Checkout that commit to see pre-Round3 state.
- **after-round3/**: Screenshots of Round 3 fixed state (current HEAD after 23a2031)
- **Pencil reference**: `../../design/exports/` (20 PNGs from Pencil design tool — already committed)

## After-Round3 Screenshots
| File | Viewport | Screen | Condition |
|---|---|---|---|
| login-1440.png | 1440px | Login | B tile on LEFT panel (fixed) |
| login-1024.png | 1024px | Login | Tablet view |
| login-390.png | 390px | Login | Mobile (brand panel hidden) |
| case-input-1440.png | 1440px | Case Input | CTA="AI 리서치 시작", progress bar=0% |
| case-input-1024.png | 1024px | Case Input | Tablet layout |
| case-input-390.png | 390px | Case Input | 1-column grid for diagnosis/disability |
| exception-not-found-1440.png | 1440px | Exception | Case not found page |
| mobile-drawer-closed-390.png | 390px | Mobile Drawer | Closed state |
| mobile-drawer-open-390.png | 390px | Mobile Drawer | Open state |

## Key Changes vs 493356e (Round 3 corrections)
1. Login: B tile moved from RIGHT panel to LEFT panel (matches Pencil 03-테스터-로그인.png)
2. Case Input CTA: "제출" → "AI 리서치 시작" (Sparkles icon)
3. Case Input grid: grid-cols-2 → grid-cols-1 sm:grid-cols-2 (390px responsive)
4. Analysis status bar: w-[15%] → w-0 (waiting state = 0%, AC-012 compliant)

## Generation Procedure
```bash
# Capture after-round3 screenshots:
CAPTURE_EVIDENCE=1 npx tsx scripts/run-e2e.ts --spec=e2e/capture-evidence.spec.ts --workers=1

# Note: CAPTURE_EVIDENCE=1 env var required to activate the skip-by-default spec
```

## Commit SHA Reference
- before-round3/: 493356e7d6e5c7df1ccafca6921075cd05348993 (no actual PNG files committed)
- after-round3/: 23a2031c69f189c5e53c0e1dd813ef212b042117 (PNG files committed below)
- Pencil exports: already committed in design/exports/ from previous rounds
