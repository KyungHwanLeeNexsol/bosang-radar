# SPEC-SIDEBAR-NAV-001 — progress.md

## §E.1 Plan-phase Audit-Ready Signal

- `plan_status: audit-ready`
- `plan_complete_at: 2026-09-16`
- 3개 plan-phase 아티팩트(spec.md, plan.md, acceptance.md) 작성 완료. plan-auditor 검토 대기.

### plan-auditor 검토 결과 (iteration 1/3)

- **Verdict: PASS** (Overall Score: 0.93, Tier M threshold 0.80)
- Must-Pass 7개 항목: MP-1~MP-3, MP-5, MP-7 PASS / MP-4, MP-6 N/A (단일 언어 프론트엔드 SPEC, syscall 무관) — 미해결 BLOCKING 없음
- Category Scores: Clarity 0.85 / Completeness 1.0 / Testability 1.0 / Traceability 0.90
- 독립 소스 검증: `case-shell-nav.tsx`의 5가지 핵심 팩트(앵커 링크·`active` prop 미전달·`NavLink` 133-163행·`CornerDownRight` 존재 확인·`depends_on` 2개 SPEC 모두 `status: completed`) 전부 실제 코드 대조로 확인됨. 허위 라인 인용 없음.
- 발견된 결함(D1~D3)은 모두 severity=minor, class=optional(REQ-004/006 GEARS 주어 표현 느슨함, AC 그룹 단위 추적성, `feedback-form.tsx` 경로 인용 부정확) — PASS 판정을 막지 않음
- 상세: `.moai/reports/plan-audit/SPEC-SIDEBAR-NAV-001-review-1.md`

## §E.2 Run-phase Evidence

cycle_type: tdd (RED-GREEN-REFACTOR)

### AC PASS/FAIL Matrix

| AC | Status | 근거 |
|----|--------|------|
| AC-001 | PASS | `case-shell-nav.test.tsx` 신규 테스트 — 활성 "전문가 피드백" 링크가 `CornerDownRight` svg 포함, `MessageSquare` svg 미포함 |
| AC-002 | PASS | "사건 입력"/"리서치 리포트"/`sidebar-nav-archive`/`sidebar-nav-precedent-db` 아이콘 무변경 — `git show 29a42d7`로 해당 라인 diff 없음 확인 |
| AC-003 | PASS | `case-shell-nav.test.tsx` 신규 테스트 — 활성 링크 `aria-label`이 "전문가 피드백" 포함 |
| AC-004 | PASS | `case-shell-nav.test.tsx` 신규 테스트 — 비활성 `<span aria-disabled="true">`에 `aria-label` 속성 없음 |
| AC-005 | PASS | `href` 계산 로직 무변경 — diff에 해당 라인 없음 |
| AC-006 | PASS | `app-shell-chrome.test.tsx:317-328` 드로어 닫힘 케이스 재실행, 회귀 없음 |
| AC-007 | PASS | `grep -rn 'window.location.hash\|IntersectionObserver' app/cases/case-shell-nav.tsx app/cases/case-shell-topbar.tsx` → 0 matches |
| AC-008 | PASS | `pnpm test` — 전체 스위트 실행, exit 0 계열(기존 무관 실패 18건 제외) |

### Build / Lint / Format 확인

```
$ pnpm lint  → exit 0
$ pnpm build → exit 0
```

### Full test suite (no regression)

```
$ npx vitest run app/cases/case-shell-nav.test.tsx
 Test Files  1 passed (1)
      Tests  8 passed (8)
```
전체 Vitest 477 passed / 18 failed(495건 중) — 실패 18건은 100% 기존 결함
(`app-shell-chrome.test.tsx`의 `useRouter` mock 누락, 이 SPEC과 무관, 변경
전후 동일 건수). 이 SPEC이 신규로 추가한 실패는 0건.

### PRESERVE list verification

```
$ git diff --stat 29a42d7~1..29a42d7 -- app/cases/case-shell-nav.tsx app/cases/case-shell-nav.test.tsx
```
변경 파일은 정확히 2개(`case-shell-nav.tsx`, `case-shell-nav.test.tsx`) +
`.moai/specs/SPEC-SIDEBAR-NAV-001/spec.md`(frontmatter status)로 한정.
"사건 입력"/"리서치 리포트"/`ComingSoonNavLink` 2항목, `resolveCurrentCaseId`,
`href` 계산 로직, `onNavigate` 콜백 계약에는 diff 없음.

### Files changed

- `app/cases/case-shell-nav.tsx` — `navIcon.feedback`을 `CornerDownRight`로
  교체, `NavLink`에 옵션 `ariaLabel` prop 추가, 활성 "전문가 피드백" 링크에만
  전달
- `app/cases/case-shell-nav.test.tsx` — AC-001/003/004 신규 단위 테스트 3건 추가

## §E.3 Run-phase Audit-Ready Signal

run_complete_at: 2026-09-16
run_status: complete
ac_pass_count: 8
ac_fail_count: 0
preserve_list_post_run_count: 0 (변경 없음)
new_warnings_or_lints_introduced: 0

## §E.4 Sync-phase Audit-Ready Signal

- sync_status: sync-complete
- sync_complete_at: 2026-09-16
- sync_commit_sha: ffbf4e8 (`docs(SPEC-SIDEBAR-NAV-001): sync-phase artifacts (3-phase close)`, main에 push 완료 — `spec-frontmatter-schema.md` § SHA placeholder backfill exemption에 따라 이 백필 커밋에서 채움)
- ac_pass_count: 8 (AC-001~008 — §E.2 PASS/FAIL Matrix 참고)
- ac_fail_count: 0
- status transition: spec.md frontmatter `status: in-progress` → `status: completed`(이 sync 커밋으로 3-phase close 완료); `updated:` 2026-09-16 유지(당일 sync 커밋이라 날짜 변경 불필요)
- changelog: CHANGELOG.md `[Unreleased]` 섹션에 `### Changed — SPEC-SIDEBAR-NAV-001` 신규 진입 추가(사전 `grep -c 'SPEC-SIDEBAR-NAV-001' CHANGELOG.md` 확인 결과 0건 — 중복 없음)
- docs: README.md(§현재 구현 상태, §구현 완료 목록 2곳) + `.moai/project/product.md`(헤더 날짜/요약, §구현 완료 목록) 갱신 — 14→15개 SPEC 완료로 카운트 반영
- mx_tags: `app/cases/case-shell-nav.tsx`의 `NavLink` `ariaLabel` prop 주석에 `@MX:NOTE`(+ `@MX:SPEC: SPEC-SIDEBAR-NAV-001`) 1건 추가 — 활성 링크 분기에만 전달해야 하는 비자명한 제약(REQ-004 위반 방지)을 기록
- pre-existing defect note: 전체 Vitest 스위트의 18건 기존 실패(`app-shell-chrome.test.tsx`의 `useRouter` mock 누락)를 sync-phase에서 재관측 — SPEC-CASE-PROGRESS-001 sync 기록과 동일 원인·동일 건수임을 재확인. 이 SPEC과 무관하며 수정 범위 밖(fix는 별도 SPEC 대상)
- preserve_verification (sync-phase 재확인): `git diff --stat 29a42d7~1..29a42d7`로 변경 파일이 정확히 2개(+ spec.md frontmatter)임을 재확인, run-phase §E.2와 동일 결과
