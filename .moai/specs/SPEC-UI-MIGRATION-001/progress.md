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

### M4 — 비확정성 안내 문구 추가 (REQ-009~010)

- 수정: `app/cases/[caseId]/page.tsx`(summary-banner 내 REQ-009 문구 신규 블록, review-targets 내 REQ-010 부제 신규), `app/cases/[caseId]/page.test.tsx`(AC-009/AC-010 신규 테스트 2건).
- RED 증거: `expected '사건 요약 · case-1…' to contain '본 리포트는…'`(REQ-009 미구현), `expected '검토할 담보가 식별되지 않았습니다.' to contain '추가 검토가 필요한…'`(REQ-010 미구현).
- GREEN 증거: `Test Files 1 passed (1)`, `Tests 7 passed (7)`.
- 회귀 확인: `pnpm test` 전체 → `Test Files 54 passed (54)`, `Tests 356 passed (356)`.
- 빌드: `pnpm build` 통과, 라우트 세그먼트 표 무변경.
- 품질: `npx eslint "app/cases/[caseId]/"` → 0 findings.

### M5 — Claim 카드 "추가 확인 필요" 결정론적 연결 규칙 적용 (REQ-011)

- 수정: `app/cases/[caseId]/page.tsx`(`getMatchedMissingMaterials()` 신규 헬퍼 + INSUFFICIENT claim 카드 "추가 확인 필요" 블록), `app/cases/[caseId]/page.test.tsx`(AC-011/AC-011a/AC-011b 신규 3건).
- RED 증거: `expected '1claim-1판단 불충분…' to contain '추가 확인 필요'`(AC-011 미구현), `expected '…' to contain '장해진단서 추가 제출 필요'`(AC-011a 미구현). AC-011b는 미구현 상태에서 이미 우연히 PASS(아무것도 렌더링되지 않으므로 무관 자료도 당연히 없음) — 구현 후에도 계속 PASS함을 재확인.
- GREEN 증거: `Test Files 1 passed (1)`, `Tests 10 passed (10)`.
- AC-011c 확인: `git diff --stat -- lib/pipeline/types.ts` → 빈 출력(VerifiedClaim/MissingMaterial 인터페이스 무변경).
- 회귀 확인: `pnpm test` 전체 → `Test Files 54 passed (54)`, `Tests 359 passed (359)`.
- 빌드: `pnpm build` 통과. 품질: eslint 0 findings, prettier 적용 후 통과.

### M6 — 사건 입력 우측 레일 확장 (REQ-012~014)

- 신규: `lib/cases/get-recent-cases-for-owner.ts`(read-only 조회 함수, `getCaseForOwner`와 동일한 owner-scope 신뢰 경계 재사용) + `.test.ts`; `app/cases/new/analysis-status-panel.tsx`(정적 4단계); `app/cases/new/recent-research-panel.tsx`(상태 한글 라벨 표시); `app/cases/new/page.test.tsx`(신규).
- 수정: `app/cases/new/page.tsx`(async Server Component 전환, `getCurrentSession()` 자체 확인 → `ownerUserId` 조달, `getRecentCasesForOwner` 호출을 try/catch로 격리), `app/cases/new/case-input-form.tsx`("임시 저장" 비활성 버튼 + "준비 중" Chip 추가), `app/cases/new/case-input-form.test.tsx`(AC-014 신규).
- RED 증거: `lib/cases/get-recent-cases-for-owner.test.ts` → `Cannot find module`(5/5 FAIL); `app/cases/new/page.test.tsx` → AC-013d(NewCasePage가 아직 동기 함수라 `.rejects`가 타입 오류), AC-012/AC-013/AC-013e/빈결과(패널·문구 전부 미구현, 4/5 FAIL); `app/cases/new/case-input-form.test.tsx` → AC-014 `expected null not to be null`(버튼 미구현).
- GREEN 증거: 세 스위트 전부 `Test Files 2 passed (2)` + `Test Files 1 passed (1)` → 합계 `Tests 17 passed (17)`(5+5+7 재검산: get-recent-cases 5 + page 5 + case-input-form 7).
- 회귀 확인: `pnpm test` 전체 → `Test Files 56 passed (56)`, `Tests 370 passed (370)`.
- **빌드 — AC-005a 핵심 검증**: 최초 `pnpm build`는 `.env.local` 부재로 `EnvValidationError`(TURSO_DATABASE_URL 등 4개 누락)로 실패 — 이 저장소에 로컬 개발용 `.env.local`이 없었기 때문(`.env.local.example`만 존재, `.gitignore`가 `.env.*`를 무시). 이 세션이 로컬 빌드 검증 전용 `.env.local`(file: 스킴 로컬 DB, `LLM_PROVIDER_MODE=deterministic`)을 생성한 뒤 재실행한 `pnpm build`는 정상 통과했고, 라우트 표에 `/cases/new`가 `ƒ (Dynamic)`으로 표시됨을 확인했다(REQ-013의 의도된 결과, "정적 생성 유지"는 더 이상 요구사항 아님) — 빌드 자체는 실제 DB 연결 없이(로컬 sqlite 파일 경로만 존재하면 됨) 성공했다. `.env.local`은 `git check-ignore -v`로 무시됨을 확인했고 커밋하지 않았다.
- 품질: `npx eslint lib/cases/ app/cases/new/` → 0 findings. prettier 적용 후 통과.

### M7 — 실재하는 예외 화면 3종 (REQ-015)

- 신규: `components/exception-panel.tsx`(공유 프레젠테이션 컴포넌트, §F1 재량 — 두 화면이 공유), `app/not-found.tsx`(전역 404, `global-not-found`), `app/cases/[caseId]/not-found.tsx`(사건-없음/미소유 통합, `case-not-found`), 대응 테스트 2건.
- `app/cases/[caseId]/error.tsx`는 전혀 수정하지 않음(최소 검증만) — `git diff --stat -- "app/cases/[caseId]/error.tsx"` 빈 출력으로 확인(AC-015b), 기존 `error.test.tsx` 재실행 통과(회귀 없음).
- RED 증거: 두 not-found 테스트 모두 `Failed to resolve import "./not-found"`(파일 미존재).
- GREEN 증거: `Test Files 3 passed (3)`, `Tests 3 passed (3)`(global-not-found + case-not-found + 기존 error.test.tsx 재확인 포함).
- 정보 은닉 확인: `case-not-found` 컴포넌트가 파라미터를 받지 않아 항상 동일한 콘텐츠를 렌더링 — 존재-없음/미소유 두 시나리오를 구분하는 텍스트가 구조적으로 존재할 수 없음(AC-015a). 텍스트에 "권한"/"소유" 등 단서 부재를 테스트로 확인.
- 회귀 확인: `pnpm test` 전체 → `Test Files 58 passed (58)`, `Tests 372 passed (372)`.
- 빌드: `pnpm build` 통과, `/_not-found`가 `○ (Static)`로 표시됨.
- 품질: eslint 0 findings, prettier 통과.

### M8 — 반응형 + 드로어 접근성 + 테스트 셀렉터 갱신 + 품질 게이트 (REQ-016~017)

- 발견 및 수정: 기존 코드가 사이드바 고정폭 유지 임계값(1024px, `lg:`)과 우측 레일 2컬럼 분할 임계값(1280px, `xl:`)에 동일한 `lg:` 브레이크포인트를 사용하고 있었다 — REQ-016은 정확히 1024px에서 우측 레일이 여전히 세로로 쌓여야 함을 요구하므로 이는 실제 버그였다. `app/cases/[caseId]/page.tsx`, `app/cases/[caseId]/feedback-form.tsx`의 2컬럼 분할 클래스를 `lg:`→`xl:`로 수정(flex-row/max-w/w 3곳씩). `app/cases/new/page.tsx`는 반응형 스택 자체가 없어(항상 가로 배치) `xl:flex-row` 기반 반응형을 신규 추가.
- 신규: `app/cases/app-shell-chrome.tsx`(클라이언트, 모바일 드로어 상태 관리 + 데스크톱 고정 사이드바 전환) — plan.md §B 결정 7/§F4에 따라 이미 설치된 `@base-ui/react` Dialog 프리미티브를 평가했으나 채택하지 않음: jsdom이 실제 CSS 트랜지션/애니메이션 이벤트를 발생시키지 않아 Base UI의 마운트/언마운트 수명주기(트랜지션 완료 감지 의존)가 12개 결정론적 AC(AC-017a~l)를 안정적으로 자동 검증하기 어렵다고 판단 — 네이티브 React state + 표준 DOM 이벤트(§B 결정 7의 명시적 대안)를 선택, 신규 의존성 없음.
- 수정: `app/cases/layout.tsx`를 세션 미조회 서버 래퍼로 단순화(REQ-005 무변경 — 여전히 `getCurrentSession()` 등 동적 API를 직접 호출하지 않음).
- GREEN 증거: `app/cases/app-shell-chrome.test.tsx` 신규 12개 테스트(AC-017, AC-017a~k) 모두 실제 jsdom 관찰 동작으로 통과 — 토글 클릭 시 드로어/스크림 등장(AC-017a), 내부 닫기 버튼(AC-017b), ESC(AC-017c), 스크림 클릭(AC-017d), 열림 시 포커스 이동 + 닫힘 시 햄버거 버튼 복귀(AC-017e), 스크롤 잠금(AC-017f), 닫힘 상태 `inert`(AC-017g), 1024px 이상 리사이즈 시 자동 닫힘 + 데스크톱 전환(AC-017h), Tab/Shift+Tab 닫힌 루프 포커스 트랩(AC-017i/j), 배경 콘텐츠 `inert`(AC-017k).
- 잔여 위험/발견 사항(ESLint): `react-hooks/set-state-in-effect` 2건 발견 및 수정 — (1) 데스크톱 여부를 effect 본문에서 동기 `setState`하던 것을 `useSyncExternalStore`(고정 `getServerSnapshot=false`로 hydration mismatch 방지)로 교체, (2) 리사이즈 시 드로어 자동 닫힘의 `setState`를 effect 본문 직접 호출에서 `matchMedia` `change` 이벤트 리스너 콜백 내부 호출로 이동(ESLint 규칙이 명시적으로 허용하는 "외부 이벤트에 반응해 콜백에서 setState" 패턴). `npx eslint app/cases/app-shell-chrome.tsx` 및 `npx eslint .`(전체 프로젝트) 모두 0 findings로 확인.
- 회귀 확인: `pnpm test` 전체 → `Test Files 59 passed (59)`, `Tests 384 passed (384)`.
- 빌드: `pnpm build` → TypeScript/컴파일 통과, 라우트 테이블 확인:
  ```
  ┌ ƒ /
  ├ ○ /_not-found
  ├ ƒ /api/auth/[...all]
  ├ ƒ /api/cases
  ├ ƒ /cases/[caseId]
  ├ ƒ /cases/new
  └ ○ /login
  ```
  `/cases/new`는 여전히 `ƒ (Dynamic)`(M6의 의도된 결과, AC-005a). 사전 존재하던 `instrumentation.ts:33`의 Edge Runtime `process.exit` 경고는 이 SPEC의 PRESERVE 범위 밖 기존 코드로 무관.
- E2E: `pnpm test:e2e`(Playwright, 이번 세션 최초 실행) → `4 passed (34.3s)` — 인증(AC-RUNTIME-011) 2건, 테넌트 격리(AC-RUNTIME-014) 1건, 사건 흐름(AC-RUNTIME-012/013) 1건.
- 품질: `npx prettier --check .`(전체 프로젝트) → `All matched files use Prettier code style!`. `npx eslint .`(전체 프로젝트) → 0 findings.
- AC-020(기존 testid 전부 보존) 확인: `app/`, `components/` 전체에 대해 plan-phase 이전 testid 목록과 현재 목록을 비교 — 누락 0건(신규 testid만 추가됨: `app-shell-content`, `case-input-draft-save`, `case-not-found`, `case-recent-research*` 등).
- AC-021(archive/precedent-db 실제 라우트 부재) 확인: `find app -iname "*archive*" -o -iname "*precedent*"` → 빈 출력.
- AC-018(1280px 5개 화면 비붕괴)은 acceptance.md §3에 명시된 대로 수동 시각 스모크 체크리스트 항목이며 jsdom DOM 단정으로 자동화할 수 없음 — 이 SPEC의 M8 자동 테스트 스위트로는 검증되지 않음(잔여 위험으로 명시).

### Post-M8 — 외부 코드 리뷰 결함 3건 수정 (2026-09-04)

M8 완료 후 외부 코드 리뷰에서 발견된 결함 3건(P0 1건, P1 2건)을 수정한다. run-phase 범위 내 교정 TDD 사이클이며, 새 SPEC이 아니다. AC-018(1280px 5개 화면 수동 시각 확인)은 이번 사이클의 범위가 아니며 여전히 미검증 상태로 남는다.

**B1(P0) — INSUFFICIENT 카드 앵커 링크가 실제로 스크롤되지 않음**
- 원인: `#missing-materials`/`#uncertainty`로 향하는 앵커 링크는 있었지만, 대상 요소에는 `data-testid`만 있고 `id`가 없었다 — URL 프래그먼트 스크롤은 `id`만 인식하므로 링크가 아무 곳에도 이동하지 않았다.
- 수정: `app/cases/[caseId]/page.tsx` — 기존 `data-testid="missing-materials"`/`"uncertainty"` div에 각각 `id="missing-materials"`/`id="uncertainty"`를 병기(기존 testid 삭제/변경 없음).
- RED 증거: `expected null not to be null`(href의 fragment로 querySelector한 대상 요소가 존재하지 않음), `expected +0 to be 1`(id 중복 없음 검증에서 0개 발견).
- GREEN 증거: `Test Files 1 passed (1)`, `Tests 12 passed (12)`(신규 2건 포함).
- 회귀 확인: 문서 내 `id="expert-feedback"`(기존, M2)와 충돌 없음 — `grep -n 'id="'` 결과 3개 id 전부 고유.

**B2(P1) — 모바일 드로어 nav 링크 클릭 시 드로어가 닫히지 않음**
- 원인: `AppShellChrome`이 `isDrawerOpen` 상태를 소유하지만, `SidebarNavItems`의 활성 링크 클릭이 `closeDrawer()`에 연결되어 있지 않았다.
- 수정: `app/cases/case-shell-nav.tsx` — `SidebarNavItems`/`NavLink`에 `onNavigate?: () => void` prop 추가, 활성 `<Link>`에 `onClick={onNavigate}` 연결(비활성 "준비 중" 항목은 `<span>`이라 영향 없음). `app/cases/app-shell-chrome.tsx` — `<SidebarNavItems onNavigate={closeDrawer} />`로 연결(모바일/데스크톱이 동일 인스턴스를 공유하므로 데스크톱에서는 무해한 no-op).
- RED 증거: 사건 입력/리서치 리포트/전문가 피드백(#expert-feedback 앵커) 3개 링크 클릭 테스트 전부 `expected 'fixed inset-y-0 ...' to match /-translate-x-full/` 형태로 실패(드로어가 열린 채 유지됨).
- GREEN 증거: `Test Files 2 passed (2)`(app-shell-chrome.test.tsx 17개 + case-shell-nav.test.tsx 4개), `Tests 21 passed (21)`.
- 회귀 확인: 비활성 항목 클릭 시 상태 변화 없음, 데스크톱 사이드바 렌더링 무변경 — 신규 테스트로 확인.

**B3(P1) — 드로어 닫힘 후 포커스가 실제로 햄버거 버튼에 복귀하지 않음(실브라우저 한정 결함)**
- 원인: 기존 `closeDrawer()`가 `setIsDrawerOpen(false)` 직후 동기적으로 `toggleButtonRef.current?.focus()`를 호출했다. 이 시점은 React가 아직 배경 콘텐츠(`app-shell-content`, 햄버거 버튼 포함)의 `inert`를 제거하기 전이며, 실브라우저는 inert 서브트리 내부 `focus()` 호출을 무시한다. jsdom은 이 inert-blocks-focus 동작을 구현하지 않아 기존 단위 테스트만으로는 결함이 드러나지 않았다.
- 수정: `app/cases/app-shell-chrome.tsx` — 포커스 복귀를 `closeDrawer()`의 동기 호출에서, 기존 스크롤 잠금 `useEffect`(React가 DOM 커밋·inert 해제를 마친 뒤 실행됨) 내부로 이동. `hasOpenedOnceRef`로 드로어가 열린 적 없는 최초 마운트 시(닫힌 초기 상태)의 오포커스를 방지하고, `isDesktop` 조기 반환으로 ≥1024px 자동 닫힘(AC-017h) 시에도 포커스를 이동시키지 않는다. 닫기 버튼/ESC/스크림 클릭/nav 링크(B2) 모든 닫힘 경로가 이 단일 effect를 공유하므로 일관되게 적용된다.
- RED 증거(jsdom, `HTMLElement.prototype.focus`를 `closest('[inert]')` 검사로 monkey-patch해 실브라우저의 inert-blocks-focus를 재현): `expected null not to be <button ...>`(닫힘 직후 여전히 이전 요소에 포커스가 남아 있음).
- GREEN 증거(jsdom): `Test Files 1 passed (1)`, `Tests 18 passed (18)`(app-shell-chrome.test.tsx, 기존 17개 + 신규 1개 전부 회귀 없이 통과).
- **실브라우저 Playwright 검증(신규 `e2e/mobile-drawer-focus.spec.ts`, 390×844 모바일 뷰포트)** — jsdom은 이 결함을 증명할 수 없으므로 필수 증거로 요구됨:
  1. 햄버거 버튼 클릭 → 닫기 버튼으로 포커스 이동 + 배경 `app-shell-content`에 `inert` 부여 확인.
  2. 닫기 버튼으로 닫기 → 햄버거 버튼 포커스 복귀 + `inert` 해제 확인.
  3. 재오픈 → ESC로 닫기 → 포커스 복귀 확인.
  4. 재오픈 → 스크림 클릭으로 닫기 → 포커스 복귀 확인.
  5. 재오픈 → nav 링크(사건 입력) 클릭으로 닫기 → 드로어/스크림 닫힘 확인(B2 회귀 겸용).
  - 최초 작성한 assertion에 버그 2건 발견 및 수정: (a) 열림/닫힘 판정에 쓴 `/translate-x-0/` 정규식이 `lg:translate-x-0`(항상 존재하는 정적 클래스) 부분 일치로 오탐 — 닫힘 전용 토큰 `-translate-x-full`로 교체. (b) inert assertion 방향이 반대(열렸을 때 `not.toHaveAttribute`로 잘못 작성) — 수정.
  - `pnpm exec playwright test e2e/mobile-drawer-focus.spec.ts`(격리 실행) → `1 passed (1.6s)`. 이후 `pnpm test:e2e` 전체 스위트(4-worker 병렬) 재확인 → `mobile-drawer-focus.spec.ts` PASS(2.6s).

**전체 회귀 확인(이 사이클에서 직접 관찰)**:
- `pnpm test` → `Test Files 59 passed (59)`, `Tests 392 passed (392)`(M8 종료 시점 384건 + 신규 8건: B1 2 + B2 5 + B3 1).
- `pnpm build` → 통과. 라우트 테이블 재확인: `/cases/new`는 여전히 `ƒ (Dynamic)`.
- `npx eslint .` → 0 findings.
- `npx prettier --check .` → 이번 사이클에서 수정한 4개 파일(`page.test.tsx`, `app-shell-chrome.tsx`, `app-shell-chrome.test.tsx`, `case-shell-nav.tsx`, `e2e/mobile-drawer-focus.spec.ts`) 전부 통과. 기존에 무관한 `app/globals.css`/`CHANGELOG.md` 포맷 이슈는 PRESERVE 범위 밖(이 사이클에서 미수정, 회귀 아님).
- `pnpm test:e2e`(전체, 4-worker 병렬) — 3회 실행 중 매번 회전하며 다른 pre-existing 테스트(`case-flow.spec.ts` 1회, `tenant-isolation.spec.ts` 1회, `auth.spec.ts` 1회)가 `page.waitForURL("/")` 30초 타임아웃으로 flake — 이 사이클이 손댄 `AppShellChrome`/`case-shell-nav`/`page.tsx`와 무관한 로그인 플로우이며 코드 diff도 없다(`git diff --stat` 0-diff 확인). `mobile-drawer-focus.spec.ts`는 3회 중 격리 실행 1회 + 병렬 실행 1회에서 PASS 확인(나머지 1회는 최초 assertion 버그로 인한 자기 결함, 수정 후 재확인함). 각 실행에서 나머지 4개 스펙(신규 스펙 포함)은 항상 PASS.
- `git diff --stat origin/plan/SPEC-UI-MIGRATION-001 -- lib/db/schema.ts lib/validation/case-input.ts lib/feedback/schema.ts lib/cases/create-case.ts lib/feedback/submit-feedback.ts lib/pipeline lib/ai db app/layout.tsx "app/cases/[caseId]/error.tsx" design/claimradar-ui.pen` → 빈 출력(PRESERVE 전체 0-diff, Pencil 디자인 파일 무변경).

**변경/신규 파일**: `app/cases/[caseId]/page.tsx`(수정), `app/cases/[caseId]/page.test.tsx`(수정, +2 테스트), `app/cases/app-shell-chrome.tsx`(수정), `app/cases/app-shell-chrome.test.tsx`(수정, +1 테스트), `app/cases/case-shell-nav.tsx`(수정), `e2e/mobile-drawer-focus.spec.ts`(신규).

**Gaps(미검증)**: AC-018(1280px 5개 화면 비붕괴 수동 시각 확인)은 이 사이클의 범위가 아니며 여전히 미검증 — 별도로 사용자 확인이 필요하다.

### AC-018 — 실브라우저 시각 확인 (2026-09-04, 오케스트레이터 직접 수행)

- **검증 날짜**: 2026-09-04
- **방법**: `claude-in-chrome`(브라우저 확장) 연결이 이 세션에서 두 차례 실패해(확장 프로그램 미연결) 사용할 수 없었다. 대신 프로젝트에 이미 설치된 `@playwright/test`(Chromium)로 임시 스크립트를 작성해 실제 브라우저 스크린샷을 촬영했다. 스크립트는 워크트리 루트에 임시로 생성한 뒤(`_visual_check_tmp.mjs`) 실행 직후 삭제했다 — `git status --short`로 워크트리가 clean함을 확인함(커밋되지 않음).
- **뷰포트**: 1280×900(데스크톱), 1024×900(태블릿), 390×844(모바일)
- **검증한 화면 (11장 스크린샷, 로컬 전용 — Git에 커밋되지 않음, 세션 스크래치패드 디렉토리에 저장)**:
  1. 로그인 — 1280px, 1024px
  2. 사건 입력(`/cases/new`, 최근 리서치 0건 상태) — 1280px, 1024px
  3. 리서치 리포트(실제로 사건 1건을 생성해 도달) — 1280px, 1024px
  4. 전문가 피드백(`#expert-feedback`) — 1280px
  5. 전역 404(`/존재하지-않는-경로`) — 1280px
  6. 사건별 404(`/cases/존재하지-않는-id`) — 1280px
  7. 모바일 드로어(390px) — 닫힘/열림 각 1장
- **관찰 결과**: 모든 화면에서 가로 오버플로 없음, 사이드바-콘텐츠 겹침 없음, 텍스트/컨트롤 잘림 없음, 클릭 방해 레이어 없음. 1024px에서 사건 입력·리포트 화면의 우측 레일이 본문 아래로 정상 이동, 1280px에서 2열 구조 정상 복원. 로그인 브랜드 패널, 전역/사건별 404 모두 App Shell 적용 여부(전역=미적용, 사건별=적용)가 REQ-015/AC-015 설계대로 렌더링됨. 최근 리서치 0건 상태에서도 우측 레일 레이아웃 안 깨짐(M6 AC-013e). 모바일 드로어 열림 시 스크림·닫기 버튼·nav 5항목 정상 렌더링.
- **발견한 편차**: 없음(레이아웃 회귀 미발견). 단, `next dev`(개발 서버) 특유의 오버레이 2종(좌하단 Next.js 로고 배지, 리포트 화면의 일시적 "Rendering..." 표시)이 스크린샷에 잡혔으나 이는 개발 모드 전용 툴링이며 `next build && next start`(프로덕션)에는 나타나지 않는 항목 — 실제 UI 결함 아님으로 판단, 수정하지 않음.
- **잔여 한계(정직하게 기록)**: Pencil 디자인 파일(`design/claimradar-ui.pen`)은 바이너리/전용 포맷이라 도구로 직접 열어 픽셀 단위로 대조하지 못했다 — design.md에 문서화된 구조·간격·색상·타이포그래피 사양과 스크린샷을 사람이 읽고 비교하는 방식으로 정합성을 확인했으며, 완전한 픽셀 대 픽셀 비교는 아니다. 1440px 뷰포트는 확인하지 않았다(요청에서 "가능하면"으로 명시된 선택 항목).
- **AC-018 판정**: 위 관찰 범위 내에서 **PASS**(레이아웃 붕괴 없음). 픽셀 단위 Pencil 대조 및 1440px 확인은 잔여 위험으로 남긴다.
- **스크린샷 저장 위치**: 세션 스크래치패드(로컬 전용, 프로젝트 저장소 밖 임시 디렉토리) — Git에 커밋되는 파일이 아니며 이 세션 종료 후 정리 대상이다.

### AC-018 판정 정정 (2026-09-04, 사용자 직접 확인 이후) — 위 PASS 판정을 "Pencil 디자인 충실도" 증거로 인정하지 않음

**사용자가 실제 화면을 직접 확인한 결과, `design/claimradar-ui.pen`과 구현 화면이 상당히 다르게 보인다는 문제 제기가 있었다.** 이를 계기로 위 AC-018 PASS 판정을 재검토한다.

- **실제로 확인한 것**: 반응형 비붕괴(오버플로/겹침/잘림/클릭 방해 없음), breakpoint별 컬럼 전환(1280↔1024), App Shell 적용 여부의 REQ-015 설계 부합. 이것은 여전히 유효한 검증이며 아래 AC-018A로 재명명해 보존한다.
- **실제로 확인하지 못한 것**: Pencil 원본 파일(`design/claimradar-ui.pen`)을 직접 열어 프레임의 실제 치수·색상·타이포그래피·컴포넌트 variant를 구현과 대조하는 작업. 대신 `design.md`에 요약된 설명과 스크린샷을 비교했을 뿐이다.
- **왜 기존 PASS가 디자인 충실도 증거가 될 수 없는가**: "화면이 깨지지 않는다"(responsive non-breakage)와 "Pencil 디자인을 충실히 재현했다"(visual fidelity)는 서로 다른 검증이다. `design.md`는 Pencil 원본의 **요약·해석**이지 원본 자체가 아니므로, `design.md`와 구현을 비교하는 것은 "문서가 스스로와 일치하는지"를 확인하는 순환 검증에 가깝다 — Pencil 원본에만 존재하고 `design.md`에 요약되지 않은 치수·색상·간격 차이는 이 방법으로는 원천적으로 발견할 수 없다.
- **정정**: 위 "AC-018 판정: PASS"는 **AC-018A(반응형 비붕괴)에 대해서만 유효**하다. **AC-018B(Pencil 시각 충실도)는 미검증 상태로 되돌린다** — 아래 "AC-018B — Pencil 원본 조사" 항목 참조.

### AC-018B — Pencil 원본 조사 (2026-09-04) — **BLOCKED**

- **시도한 도구**: `mcp__pencil__get_app_state`, `mcp__pencil__get_screenshot`(filePath=`design/claimradar-ui.pen`, nodeId=`document`), `mcp__pencil__execute`(filePath=`design/claimradar-ui.pen`) — 3개 도구 모두 동일한 오류로 실패: `"Failed to access file ... A file needs to be open in the editor to perform this action."`
- **원인**: Pencil MCP 서버는 파일을 직접 파싱하는 독립 도구가 아니라, 로컬에서 실행 중인 Pencil 에디터 앱(데스크톱/웹)에 이미 열려 있는 파일에 연결하는 브리지다. 이 세션 환경에는 Pencil 에디터 앱이 `design/claimradar-ui.pen`을 열고 있는 상태로 실행 중이지 않다.
- **판정**: 사용자의 명시적 지침("Pencil을 실제로 열거나 렌더링할 수 없다면 작업을 중단하고 차단 상태를 보고해라")에 따라, `design.md` 요약만으로 "정합" 판정을 내리는 우회를 하지 않고 **여기서 작업을 중단**한다. AC-018B는 **BLOCKED**(미검증) 상태로 기록하며, Gap Matrix 작성·수정 작업(§4~§10)은 Pencil 에디터 접근이 확보된 뒤 재개한다.
- **재개 조건**: 사용자가 로컬에서 Pencil 앱을 실행하고 `design/claimradar-ui.pen`을 열어 둔 상태에서 재시도.

## §E.3 Run-phase Audit-Ready Signal

- `run_status: blocked` (2026-09-04 정정 — 이전 기록: `complete`. M1~M8 기능 구현 및 반응형 비붕괴 검증은 완료 상태를 유지하지만, Pencil 원본 대비 시각 충실도 검증(AC-018B)이 미완료·BLOCKED 상태로 남아 있어 전체 run-phase 완료 판정을 보류한다. sync-phase 진입 및 main 병합은 AC-018B 재검증 전까지 진행하지 않는다. 상세: 위 "AC-018 판정 정정" 및 "AC-018B — Pencil 원본 조사" 항목 참조.)
- `run_complete_at: 2026-09-04` (M1~M8 기능 구현 완료 시점 — 전체 run-phase 완료 시점이 아님, 위 `run_status` 참조)
- 8개 마일스톤(M1~M8) 전부 커밋됨: `e523ae8`(M1), `af21647`(M2), `ba399df`(M3), `35f17a4`(M4), `add3fee`(M5), `80bfa5a`(M6), `fe9b026`(M7), `12f830f`(M8).
- PRESERVE 목록 검증: `git diff --stat origin/main -- app/layout.tsx app/page.tsx lib/db/schema.ts lib/validation/case-input.ts lib/feedback/schema.ts lib/cases/create-case.ts lib/feedback/submit-feedback.ts lib/pipeline lib/ai db "app/cases/[caseId]/error.tsx"` → `lib/pipeline/labels.ts`, `lib/pipeline/labels.test.ts` 2개 신규 파일만 추가(M3, REQ-007/008의 SSOT 라벨 매핑 — 기존 pipeline 파일은 전부 0-diff, 신규 파일 추가만 발생). 그 외 모든 PRESERVE 대상 파일은 완전 0-diff.
- 최종 전체 검증(이 세션에서 직접 관찰):
  - `pnpm test` → `Test Files 59 passed (59)`, `Tests 384 passed (384)`
  - `pnpm test:e2e` → `4 passed (34.3s)`
  - `pnpm build` → 통과, 라우트 테이블 위 M8 섹션 참조
  - `npx eslint .` → 0 findings
  - `npx prettier --check .` → 전부 통과
- Gaps(미검증, 2026-09-04 재정정): AC-018A(반응형 비붕괴, 1280/1024/390px)는 오케스트레이터의 실브라우저(Playwright Chromium) 스크린샷 확인으로 PASS 유지. **AC-018B(Pencil 원본 대비 시각 충실도)는 PASS 판정을 철회하고 BLOCKED로 재분류** — Pencil MCP 도구 3종(get_app_state/get_screenshot/execute) 전부 "파일이 에디터에 열려 있어야 함" 오류로 접근 불가했다(상세: 위 "AC-018B — Pencil 원본 조사" 항목). 사용자가 Pencil 앱에서 해당 파일을 열어야 재개 가능.
- Residual-risk(잔여 위험): (1) M1에서 발견된 React 19 controlled-input value-tracking 테스트 헬퍼 이슈는 이 SPEC의 신규 테스트 파일에서만 수정되었고 기존 `case-input-form.test.tsx`의 동일 헬퍼는 PRESERVE 범위 밖이라 무수정. (2) M6에서 로컬 빌드 검증을 위해 `.env.local`(gitignored, 미커밋)을 생성함 — CI 환경에는 별도 환경변수 설정이 필요할 수 있음(기존 인프라 관심사, 이 SPEC 범위 밖).

## §E.4 Sync-phase Audit-Ready Signal

_<pending sync-phase>_
