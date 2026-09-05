# SPEC-UI-MIGRATION-001 Visual Evidence — Round 3

## Directory Structure
- before-round3/: Screenshots of commit 493356e (before Round 3 corrections)
- after-round3/: Screenshots after Round 3 corrections
- Pencil reference: ../../design/exports/ (20 PNG exports from Pencil design file)

## Screenshot Metadata
Each filename encodes viewport width: login-1440.png = login page at 1440px.
All screenshots captured in production mode (pnpm build && pnpm start).
Login page only (no auth required). Auth-required pages show redirect to /login.

## Generation Procedure
1. pnpm build && pnpm start &
2. EVIDENCE_OUT_DIR=docs/evidence/SPEC-UI-MIGRATION-001/after-round3 npx tsx scripts/capture-evidence.ts
3. Kill server

## Commit SHA Reference
- before-round3/: 493356e7d6e5c7df1ccafca6921075cd05348993
- after-round3/: 4645689 (Round 3 완료 커밋)

## Gap Matrix Reference
See .moai/specs/SPEC-UI-MIGRATION-001/progress.md §E.2 Round3 수정 섹션

## Round 3 수정 내용
1. E2E 격리: playwright.config.ts workers:1 + run-e2e.ts --spec/--workers 플래그
2. 로그인 B타일: 좌측 브랜드 패널에 추가, 우측 폼 패널에서 제거
3. 사건 입력 CTA: "제출" → "AI 리서치 시작" (Sparkles 아이콘 + data-testid="case-submit" 유지)
4. 사건 입력 그리드: grid-cols-2 → grid-cols-1 sm:grid-cols-2 (390px 대응)
5. 분석 상태 진행 바: w-[15%] → w-0 (대기 상태 0%)
