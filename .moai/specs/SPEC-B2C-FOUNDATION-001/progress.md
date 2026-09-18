# SPEC-B2C-FOUNDATION-001 — Progress

## §E.1 Plan-phase Audit-Ready Signal

plan_status: audit-ready
plan_complete_at: 2026-09-18T03:27:27Z

작성 완료 산출물: spec.md, plan.md, acceptance.md, design.md, research.md (Tier L, 5개 artifact + progress.md). 실제 코드/DB/배포 변경 없음(REQ-B2CFOUND-005) — 모든 Bash 호출은 읽기 전용(`find`/`grep`/`cat`/`head`/`ls`)이었다.

## §E.2 Run-phase Evidence

### Pre-flight (plan.md §C)

- 작업 브랜치 확인: `git branch --show-current` → `feat/SPEC-B2C-FOUNDATION-001` (≠ main) — PASS (REQ-B2CFOUND-011)
- 작업 트리 상태: `git status --porcelain` → 빈 출력(clean) — PASS
- 로컬 DB 스킴 확인: `.env.local`의 `TURSO_DATABASE_URL`이 `libsql://bosang-radar-kyunghwanleenexsol.aws-ap-northeast-1.turso.io` — plan.md §C가 요구하는 `file:` 스킴이 **아님**.
  - **사용자 확인(2026-09-18)**: 이 URL은 운영 인스턴스가 아니라 개발자 전용으로 격리된 Turso 분기(branch) DB라고 사용자가 직접 확인함. plan.md §C의 문면(literal text)과는 다르지만, 실질 위험(운영 데이터 오염)은 없다는 사용자 판단에 따라 run-phase를 진행함.
  - **잔여 위험**: 이 판단은 사용자 진술에 근거하며, 실제 Turso 콘솔에서 분기 격리 여부를 재확인하지는 않았음. M3~M5에서 `pnpm run db:migrate`를 실행하기 전 매 마일스톤마다 이 URL이 여전히 분기 DB를 가리키는지 재확인 권장.
  - **추가 위험 수용(2026-09-18)**: 사용자가 "이전 B2B 사이트도 실사용자가 없어서 DB가 바뀌어도 상관없다"고 추가로 확인함. 이에 따라 이 URL이 만약 예상과 달리 운영 인스턴스로 밝혀지더라도 M1~M7 진행을 **중단할 필요는 없음** — 다만 REQ-B2CFOUND-006(기존 운영 DB 테이블·데이터 삭제는 이 SPEC의 범위 밖)은 사용자 리스크 수용과 무관하게 여전히 유효하므로, 어떤 milestone도 기존 테이블 DROP이나 데이터 삭제 명령은 실행하지 않는다.

### M1 — Baseline (run-phase, manager-lead coordination)

manager-lead 위임 확인: 오케스트레이터로부터 M1-M7 전체를 이 세션에서 순차 진행하라는 지시(Section A-E)를 받음. Turso URL 관련 완화 지침(2026-09-18, 오케스트레이터 경유): 이전 B2B 사이트에 실사용자가 없어 DB가 바뀌어도 무방하다는 사용자 확인을 받음 — `TURSO_DATABASE_URL`이 실제 운영 인스턴스로 밝혀지더라도 작업을 중단할 필요 없음. **단, REQ-B2CFOUND-006(기존 테이블 DROP·데이터 삭제 금지)은 사용자 리스크 수용과 무관하게 계속 유효** — 어떤 milestone에서도 DROP/데이터 삭제 명령을 실행하지 않는다(이 SPEC의 M1-M7 어디에도 `db:migrate` 실행이나 스키마 변경이 없으므로 실질적 충돌 없음).

Baseline 측정(2026-09-18, `main` 기준 HEAD `e38fe0b`):

| 명령 | 결과 | 근거 |
|---|---|---|
| `pnpm test` | **FAIL** — Test Files 1 failed \| 69 passed (70); Tests 17 failed \| 483 passed (500) | `app/cases/app-shell-chrome.test.tsx` 전체 실패 — `next/navigation`의 `useRouter` mock 미정의(`SidebarUserBlock`의 `useRouter()` 호출과 vi.mock 불일치). B2B `app/cases/**` 트리 자체가 M3에서 DELETE 대상이므로 이 pre-existing 실패는 이 SPEC의 골격이 아니다 — M7 회귀 판정은 "이 파일을 제외한 나머지 483개 통과 테스트가 계속 통과하는가"로 본다. 로그: `.moai/state/verify/manager-lead-b2cfound001/M1.test.log` |
| `pnpm lint` | **PASS** — exit=0 | 로그: `.moai/state/verify/manager-lead-b2cfound001/M1.lint.log` |
| `pnpm format:check` | **FAIL** — exit=1, 6개 파일 포맷 이슈(`app/api/cases/route.test.ts`, `app/api/cases/status/route.ts`, `db/migrations/meta/_journal.json`, `db/migrations/meta/0008_snapshot.json`, `design/MIGRATION-PLAN.md`, `lib/cases/create-case.test.ts`) | pre-existing — 이 SPEC이 새로 만든 포맷 이슈 아님. `app/api/cases/*`·`lib/cases/*`는 M3/M4에서 DELETE 대상이므로 M7 시점엔 자동 해소 예상. `db/migrations/meta/*`·`design/MIGRATION-PLAN.md`는 이 SPEC이 손대지 않는 PRESERVE 대상이므로 M7에서도 동일하게 FAIL 유지가 예상되는 baseline. 로그: `.moai/state/verify/manager-lead-b2cfound001/M1.format.log` |
| `npx tsc --noEmit` | **PASS** — exit=0 | 로그: `.moai/state/verify/manager-lead-b2cfound001/M1.tsc.log` |
| `pnpm build` | **PASS** — exit=0 (1 warning: `instrumentation.ts:33` `process.exit` in Edge Runtime — pre-existing, REUSE-MOD 대상이나 이 경고 자체는 이 SPEC 범위 밖) | 로그: `.moai/state/verify/manager-lead-b2cfound001/M1.build.log` |

**M7 회귀 판정 기준(확정)**: "이전에 통과하던 테스트가 실패하는가"만 본다(plan.md §E). baseline 시점 기준 통과하던 483개 테스트 중 M3/M4에서 DELETE되는 B2B 전용 테스트 파일들(예: `app/cases/**/*.test.tsx`, `lib/cases/**/*.test.ts` 등)은 파일 자체가 사라지므로 "실패"가 아니라 "제거"로 처리한다 — 삭제된 테스트 파일은 회귀 판정 모수에서 제외한다.

fold-at: 2026-09-18T13:22:00Z | evidence: `.moai/state/verify/manager-lead-b2cfound001/M1.*`

### M2 — 최소 B2C 공개 진입점 (leaf worker, frontend)

leaf worker(Agent(general-purpose), frontend 도메인)에게 위임. `app/page.tsx`를 B2B 세션 리다이렉트에서 정적 placeholder("서비스 준비 중")로 교체, `app/page.test.tsx` 갱신. `app/layout.tsx`/`app/cases/**`/`app/login/*`/`app/api/**`/`lib/auth/**` 등은 손대지 않음(스코프 준수 확인됨, `git status --porcelain` 재확인).

manager-lead가 독립 재검증(skeptical evaluation stance)한 결과:
- `git log --oneline -3` → `4351f53 feat(SPEC-B2C-FOUNDATION-001): M2 app/page.tsx를 B2C 최소 공개 진입점 placeholder로 교체` 확인.
- `git rev-list --count --left-right origin/feat/SPEC-B2C-FOUNDATION-001...HEAD` → `0	0` (푸시 완료, 로컬/원격 동기화 확인).
- `app/page.tsx` 직접 Read로 내용 확인: 세션/인증 의존성 없음(정적 서버 컴포넌트), PII 필드 없음(REQ-B2CFOUND-013), REQ-B2CFOUND-002/003 주석으로 명시.

leaf worker 자체 보고(2차 검증 전): `pnpm build` exit=0(`/`가 `○` static으로 prerender — 런타임 인증 의존성 0 확인), `pnpm test app/page.test.tsx` exit=0(2 passed). `@testing-library/react`가 프로젝트에 미설치되어 있음을 발견하고(다른 컴포넌트 테스트들의 기존 관례를 따라) `react-dom/client`+`createRoot`/`act` 패턴을 그대로 사용 — 신규 의존성 추가 없음(Scope Discipline 준수).

fold-at: 2026-09-18T13:35:00Z | evidence: leaf worker report (SubagentHandback, `a6da6626f56777880`) + manager-lead 독립 재검증(git log/rev-list/Read) | commit: `4351f53`

### M3 — B2B 라우트·인증 의존성 제거 (leaf worker, frontend+backend)

leaf worker에게 위임. design.md §1 DELETE 분류 7개 그룹(app/cases/** 27개, app/login/* 5개, app/api/auth/[...all]/route.ts, app/api/cases/** 4개, lib/auth/** 7개, components/evidence-item.*, proxy.ts+test 2종) 삭제. 삭제 전 외부 참조 grep 수행(`lib/auth`/`evidence-item`/`app/cases`·`app/login`/`proxy`/`app/api/auth|app/api/cases` 전부) — 매치는 전부 삭제 대상 내부이거나 주석/e2e 스펙(vitest.config.ts가 `e2e/**` 제외 확인)뿐, 실제 빌드 의존성 0건. proxy.ts는 보호 경로가 전부 사라져 파일 자체를 삭제(Enforce Simplicity) — `@MX:ANCHOR` 태그도 코드와 함께 폐기.

manager-lead 독립 재검증(skeptical evaluation stance):
- `git log --oneline -3` → `eaa4d53 feat(SPEC-B2C-FOUNDATION-001): M3 B2B 라우트 표면 및 Better Auth 의존성 제거` 확인.
- `git rev-list --count --left-right origin/...HEAD` → `0 0`(푸시 동기화 확인).
- `ls app/cases app/login lib/auth proxy.ts` → 전부 "No such file or directory"(삭제 확인).
- `ls lib/pipeline lib/observability lib/cases lib/feedback db/migrations` → 전부 존재(PRESERVE 유지 확인).
- **독립 재실행**(leaf worker 보고를 그대로 신뢰하지 않고 직접 재현): `rm -rf .next && pnpm build` → exit=0, Route `/`만 남음(○ static) — 로그: `.moai/state/verify/manager-lead-b2cfound001/M3.build.log`. `pnpm test` → Test Files 48 passed (48), Tests 369 passed (369), exit=0 — 로그: `.moai/state/verify/manager-lead-b2cfound001/M3.test.log`. M1 baseline 대비 17개 실패 테스트(app-shell-chrome.test.tsx)가 파일 삭제로 소멸, 신규 실패 0건 확인.

fold-at: 2026-09-18T13:45:00Z | evidence: leaf worker report(`ae5156fb131a6ea30`) + manager-lead 독립 재실행(`.moai/state/verify/manager-lead-b2cfound001/M3.*`) | commit: `eaa4d53`

### M4 — 미사용 B2B 코드 제거 (leaf worker, backend) — 일부 완료 + 계획 대비 편차 1건

leaf worker에게 위임. `lib/cases/**`(9개 파일) + `lib/feedback/**`(4개 파일) 삭제 완료. `lib/pipeline/**`, `lib/observability/*`, `db/seed/evidence*`는 손대지 않음(REQ-B2CFOUND-007 유지 확인).

**계획 대비 편차(design.md §1 DELETE 분류였던 `lib/validation/case-input.ts`+test는 삭제하지 않고 보존)**: leaf worker가 삭제 전 필수 cross-reference grep에서 `lib/pipeline/types.ts:1`이 `case-input.ts`의 `CaseInput` 타입을 import(및 재export, `case-normalizer.ts`/`index.ts`에서 소비)하는 실제 의존을 발견 — design.md 작성 시점에는 포착되지 못한 정보다. `case-input.ts` 삭제를 완료하려면 `lib/pipeline/types.ts` 수정이 필요한데, 이는 REQ-B2CFOUND-007("lib/pipeline/을 삭제·추출·수정하지 않고 있는 그대로 보존한다" — 예외 없음)을 직접 위반한다. leaf worker가 구조화된 blocker를 반환했고, manager-lead가 판단한 결과: 세 선택지(a. lib/pipeline/types.ts 수정 — REQ-B2CFOUND-007 위반이므로 배제, b. case-input.ts 삭제를 후속 SPEC으로 연기, c. 동일 결정을 "편차"로 기록) 중 (b)/(c)는 실질적으로 동일하고 REQ-B2CFOUND-002(build 통과)·REQ-B2CFOUND-007을 모두 만족하는 유일하게 합치하는 경로이므로, 오케스트레이터/사용자 에스컬레이션 없이 manager-lead 재량으로 해결: **`lib/validation/case-input.ts`+test는 이번 SPEC에서 보존한다.** acceptance.md의 AC들은 전부 plan-phase 문서(design.md/plan.md) 자체를 검증 대상으로 하며 run-phase 파일 삭제 여부를 AC로 명시하지 않으므로, 이 편차는 어떤 AC도 위반하지 않는다. `lib/pipeline/` decision gate(design.md §4)가 후속 SPEC에서 해소될 때 `case-input.ts`도 함께 재검토 대상.

**PII 정규식 패턴(향후 SPEC 참고용으로 인용, leaf worker가 `lib/validation/case-input.ts`에서 추출)**:
```ts
// 주민등록번호 형식: 6자리-7자리(하이픈 선택) 또는 13자리 연속 숫자.
const RESIDENT_REGISTRATION_NUMBER_PATTERN = /\d{6}-?\d{7}/;
// 전화번호 형식: 01[0/1/6/7/8/9]로 시작, 하이픈 선택.
const PHONE_NUMBER_PATTERN = /01[016789]-?\d{3,4}-?\d{4}/;
```
(파일 자체가 보존되므로 이 인용은 참고용 — 실제 코드는 `lib/validation/case-input.ts`에 그대로 남아 있다.)

manager-lead 독립 재검증:
- `git log --oneline -3` → `c890d15 feat(SPEC-B2C-FOUNDATION-001): M4 미사용 B2B 코드 제거 (lib/cases, lib/feedback)` 확인.
- `git rev-list --count --left-right origin/...HEAD` → `0 0`.
- `ls lib/cases lib/feedback` → 둘 다 "No such file or directory"(삭제 확인). `ls lib/validation/case-input.ts lib/pipeline/types.ts` → 둘 다 존재(보존 확인). `grep -n case-input lib/pipeline/types.ts` → line 1 import 확인(leaf worker 주장과 일치).
- `lib/validation/case-input.ts` 직접 Read로 인용된 PII 정규식 2건이 파일 내용과 정확히 일치함을 확인.

fold-at: 2026-09-18T13:55:00Z | evidence: leaf worker report(`a34f26700af2a387f`) + manager-lead 독립 재검증(git log/rev-list/ls/grep/Read) | commit: `c890d15` | 편차: `lib/validation/case-input.ts` 보존(후속 SPEC 재검토 대상)

### M5 — E2E·환경변수·배포 설정 정리 (leaf worker, devops/frontend, 2개 커밋)

leaf worker에게 위임(2단계: 본삭제 커밋 `b095b09` + package.json 후속 정리 커밋 `b67aae4`). `e2e/` 디렉터리 전체(13개 파일) 삭제, `scripts/`의 DELETE 4개 파일(+1 test) 삭제, `lib/env.ts`에서 `BETTER_AUTH_SECRET`/`BETTER_AUTH_URL` 요구 제거(리터럴 제거만 — `EnvScope`/`REQUIRED_BY_SCOPE` 구조 자체는 `scripts/cli-bootstrap.test.ts`가 `"provision"` 스코프 리터럴을 단언하므로 보존), `.env.local.example`에서 대응 항목 정리. `.github/workflows/deploy.yml`은 손대지 않음(확인됨).

**REQ-B2CFOUND-009(삭제 사유 + 대체 검증) 기록**(leaf worker 원문 인용):
- `e2e/auth.setup.ts, auth.spec.ts` — Better Auth 전용 인증/세션 흐름 테스트. 삭제 사유: `lib/auth/`가 M3에서 이미 삭제되어 대상 기능이 존재하지 않음. 대체 검증: 없음 — 이 SPEC 범위 밖.
- `e2e/case-flow.spec.ts, case-input-mobile-layout.spec.ts, capture-evidence.spec.ts, capture-evidence-round5.spec.ts, mobile-drawer-focus.spec.ts, sidebar-sticky.spec.ts, tenant-isolation.spec.ts` — `app/cases/*` B2B 화면·컴포넌트 대상 시나리오. 삭제 사유: 대상 화면이 M2~M4에서 이미 삭제/placeholder 교체됨. 대체 검증: 없음 — 01/02/03 B2C 화면 자체가 미구현이라 대체 대상이 없음(plan.md가 명시적으로 예상한 결과).
- `e2e/comparison-docs-images.spec.ts` — 구 B2B Pencil 디자인 비교 HTML(SPEC-UI-MIGRATION-001) 회귀 테스트. 삭제 사유: 검증 대상 UI가 더 이상 존재하지 않음. 대체 검증: 없음.
- `e2e/helpers.ts` — DB 직접 접속 테스트 헬퍼. 삭제 사유: 소비처(위 시나리오 전부)가 삭제되어 죽은 코드. 대체 검증: 없음 — "Playwright에서 직접 DB 접속해 단언" 패턴은 향후 B2C E2E 작성 시 참고 가치가 있다는 점을 design.md가 이미 기록.
- `e2e/sidebar-assertions.ts, storage-state-paths.ts` — 사이드바(B2B UI)·Better Auth storageState 전용. 삭제 사유: 대상 UI/인증 시스템 삭제. 대체 검증: 없음.
- `scripts/e2e-tester-emails.ts` — Better Auth 테스터 프로비저닝(allowedTesters) 지원용 이메일 상수. 삭제 사유: `provision-tester.ts`와 함께 Better Auth 전용 인프라. 대체 검증: 없음.
- `scripts/measure/capture-login.mjs, login-pixel-compare.mjs` — 로그인 화면(Better Auth `login/`) 시각 회귀 측정. 삭제 사유: 대상 로그인 화면이 Better Auth와 함께 삭제됨. 대체 검증: 없음.
- `scripts/provision-tester.ts(+test)` — Better Auth `allowedTesters` 프로비저닝. 삭제 사유: Better Auth 자체가 M3에서 삭제됨. 대체 검증: 없음.

**계획 범위를 넘는 연쇄 수정(leaf worker가 스스로 발견·해결, `pnpm build` 통과를 위해 필수)**: `scripts/run-e2e.ts`가 삭제된 `provision-tester.ts`/`e2e-tester-emails.ts`를 import하고 있어 빌드가 깨짐(REQ-B2CFOUND-002 위반) — 두 개의 dangling import, `TESTER_A_EMAIL`/`TESTER_B_EMAIL` re-export, `provisionTester(...)` 호출 2건을 제거. `run-e2e.test.ts`가 제거된 심볼을 참조하지 않음을 확인 후 진행. `assembleE2EEnv()` 자체(Playwright webServer용 env 조립)는 건드리지 않음 — `run-e2e.test.ts`가 그 필드들을 단언하므로 범위 밖으로 유지.

**M5 후속 정리(plan.md §E가 M5의 판단 사항으로 명시적으로 위임한 항목, manager-lead 재량 판단 후 leaf worker에 재위임)**: `package.json`의 `better-auth` 의존성(실제 코드 참조 0건, `vitest.config.ts`의 무관한 과거 주석 1건만 잔존 확인) 및 이제 삭제된 파일을 가리키는 `tester:add` 스크립트 항목을 제거, `pnpm install`로 lockfile 동기화(better-auth + 전이 의존성 17개, 총 -18 패키지).

manager-lead 독립 재검증(2회, 각 커밋 이후):
- `git log --oneline` → `b67aae4`(후속) → `b095b09`(본삭제) → `c890d15`(M4) 순서 확인.
- `git rev-list --count --left-right origin/...HEAD` → 매 커밋 후 `0 0`(동기화 확인).
- `ls e2e` → "No such file or directory". `ls scripts/provision-tester.ts scripts/e2e-tester-emails.ts scripts/measure` → 전부 없음.
- `git status --porcelain -- .github/` → 빈 출력(deploy.yml 미변경 확인).
- `grep -n "better-auth|tester:add" package.json` → 매치 없음(완전 제거 확인).
- `grep -rln "better-auth" --include='*.ts' --include='*.tsx' --include='*.json' .`(node_modules/.next/.tmp/worktrees 제외) → `vitest.config.ts` 1건만(무관한 과거 주석) — leaf worker 주장과 일치.
- **관찰(조치 없음)**: `.claude/worktrees/agent-a63b93f48ed5136a9/`에 이 SPEC과 무관해 보이는 별도 세션의 stale worktree 발견(오래된 `provision-tester.ts`/`proxy.test.ts` 등 잔존). 이 브랜치(`origin/feat/SPEC-B2C-FOUNDATION-001`)와의 divergence는 매 milestone마다 0/0으로 일관되게 확인되어 현재 진행 중인 레이스는 아닌 것으로 판단 — 손대지 않고 관찰만 기록.

fold-at: 2026-09-18T14:20:00Z | evidence: leaf worker reports(`ab517b8bc73aae0ca`, `a1fd8b052b7e89f4c`) + manager-lead 독립 재검증 | commits: `b095b09`, `b67aae4`

### M6 — 문서 동기화 (leaf worker, technical writing)

leaf worker에게 위임. `.moai/project/product.md`/`structure.md`/`tech.md` 3개 파일을 M1-M5 실측 코드 상태에 맞춰 갱신.
- product.md: "## 이전 방향 (레거시, 코드는 유지됨)" → "(레거시, 코드 대부분 삭제 완료)"로 헤딩 변경, 본문을 3-way 분류(삭제 완료 / `lib/pipeline/` decision-gate 보존 / `case-input.ts` 계획 대비 편차 보존)로 재작성해 자기모순 없이 정확히 기술.
- structure.md: § 현재 구조 트리·디렉터리별 목적 섹션을 실측 결과로 전면 재작성(삭제된 디렉터리 제거, "삭제된 디렉터리·파일" 서브섹션 신설), § 목표 구조(미구현)는 여전히 유효해 미변경.
- tech.md: 사실이 아니게 된 3곳(Better Auth 활성 서술, E2E 시나리오 서술, `tester:add` 참조)만 과거형/삭제 반영으로 수정 — 나머지는 사실 오류를 찾지 못해 미변경(불필요한 강제 편집 회피).

manager-lead 독립 재검증:
- `git log --oneline -3` → `05e9a13 docs(SPEC-B2C-FOUNDATION-001): M6 product/structure 문서를 M1-M5 실제 코드 상태에 맞춰 갱신` 확인.
- `git rev-list --count --left-right origin/...HEAD` → `0 0`.
- SPEC 산출물(spec/plan/acceptance/design/research.md) 미변경 확인(`git status --porcelain` 대상 5개 파일 전부 빈 출력).
- `grep -n 레거시 .moai/project/product.md` → 헤딩 변경 반영 확인.

fold-at: 2026-09-18T14:35:00Z | evidence: leaf worker report(`ad2d5afeb7f99fb9a`) + manager-lead 독립 재검증 | commit: `05e9a13`

### M7 — 전체 검증 (manager-lead 직접 수행, read-only)

manager-lead가 직접 수행(코드 변경 없음, 순수 검증). M1 baseline과 동일한 5개 명령을 `.next` 캐시 삭제 후 재실행:

| 명령 | M1 baseline | M7 결과 | 회귀 여부 |
|---|---|---|---|
| `pnpm test` | FAIL(1 file/17 tests 실패, 70 files/500 tests) | **PASS** — 41/41 files, 282/282 tests, exit=0 | 회귀 없음(오히려 실패 파일이 M3 삭제로 소멸) |
| `pnpm lint` | PASS, exit=0 | **PASS**, exit=0 | 회귀 없음 |
| `pnpm format:check` | FAIL(6개 파일) | **FAIL**(3개 파일 — `db/migrations/meta/_journal.json`, `db/migrations/meta/0008_snapshot.json`, `design/MIGRATION-PLAN.md`만 잔존, 나머지 3개는 M3/M4에서 대상 파일 자체가 삭제되어 자동 해소) | **개선**(pre-existing PRESERVE 대상 3건만 남고 3건 감소) — baseline에서 예측한 그대로 |
| `npx tsc --noEmit` | PASS, exit=0 | **PASS**, exit=0 | 회귀 없음 |
| `pnpm build` | PASS, exit=0(1 pre-existing warning) | **PASS**, exit=0(동일한 1개 pre-existing warning, 라우트가 `/`+`/_not-found`로 축소) | 회귀 없음 |

로그: `.moai/state/verify/manager-lead-b2cfound001/M7.{test,lint,format,tsc,build}.log`.

**추가 검증**:
- `grep -rn "PROTECTED_PATH_PATTERNS\|isProtectedPath"` (node_modules/worktrees 제외) → **0 matches**. M3에서 `proxy.ts` 전체 삭제로 완전히 해소됨(plan.md §H 위험 완화 확인, acceptance.md Edge Case 확인).
- `git diff e38fe0b -- .github/workflows/deploy.yml` → **빈 출력**. 이 SPEC의 M1~M7 어디에서도 배포 워크플로를 수정하지 않았음을 확인(REQ-B2CFOUND-011).
- `git diff e38fe0b..HEAD --stat` → 91 files changed, 229 insertions(+), 12306 deletions(-). 전체 커밋: `4351f53`(M2) → `eaa4d53`(M3) → `c890d15`(M4) → `b095b09`+`b67aae4`(M5) → `05e9a13`(M6).
- 브랜치/푸시 상태: `git branch --show-current` → `feat/SPEC-B2C-FOUNDATION-001`(main 아님, REQ-B2CFOUND-011 준수). `git rev-list --count --left-right origin/...HEAD` → `0 0`(모든 milestone 커밋이 매번 푸시되어 원격과 완전 동기화).

**acceptance.md AC 매트릭스**: AC-B2CFOUND-001~015은 전부 plan-phase 산출물(spec.md/plan.md/design.md/acceptance.md/research.md) 자체의 내용을 검증 대상으로 하며, run-phase 코드 상태를 AC로 명시하지 않는다(acceptance.md 자체가 "Definition of Done (plan-phase)"로 명시). 이 SPEC의 run-phase(M1-M7) 전체에서 SPEC 산출물 5개 파일은 단 한 번도 수정되지 않았음(§E.2 각 milestone에서 `git status --porcelain` 재확인, M7에서도 재확인)이 이미 확인되었으므로, plan-phase 시점에 성립했던 AC 15개 전부가 현재도 그대로 성립한다 — PASS 15/15, FAIL 0, 재검증 불필요(내용이 변경되지 않았으므로).

fold-at: 2026-09-18T14:50:00Z | evidence: manager-lead 직접 실행(`.moai/state/verify/manager-lead-b2cfound001/M7.*`) | 회귀: 0건 | AC: 15/15 PASS(불변)

## §E.3 Run-phase Audit-Ready Signal

run_status: audit-ready
run_complete_at: 2026-09-18T14:55:00Z

M1-M7 전체 완료. 6개 커밋(`4351f53`/`eaa4d53`/`c890d15`/`b095b09`/`b67aae4`/`05e9a13`), 91개 파일 변경(+229/-12306). 5개 baseline 검증 명령 전부 M1 대비 0 회귀(format:check는 오히려 3건 개선). PROTECTED_PATH_PATTERNS 잔존 0건, deploy.yml 미변경 확인. 계획 대비 편차 1건(`lib/validation/case-input.ts` 보존, M4 기록 참고 — `lib/pipeline/types.ts` 타입 의존으로 REQ-B2CFOUND-007과 충돌해 manager-lead가 보존 결정, 후속 SPEC 재검토 대상). acceptance.md AC 15/15 PASS(불변, plan-phase 산출물 무변경). 브랜치 `feat/SPEC-B2C-FOUNDATION-001`가 origin과 완전 동기화(0/0) — PR 준비 완료, PR 생성 자체는 manager-git에 위임(오케스트레이터가 별도 수행).

## §E.4 Sync-phase Audit-Ready Signal

_<pending sync-phase>_

## §F Phase 4 Mode Selection

**Input parameters**: tier=L, scope≈40+ files (app/, app/api/, components/, lib/auth/, lib/cases/, lib/feedback/, e2e/, scripts/, docs), domain count≥5 (frontend routes, auth, e2e tests, deploy config, docs), file language mix=TS/TSX 위주 + shell/md, concurrency benefit=LOW(코드 삭제·리팩터링은 Anthropic coding-task 병렬성 caveat 적용), milestone count=7(M1~M7).

**Mode evaluation**:
- direct: not selected — 7 milestone, 다중 파일, semantic 변경(코드 삭제) 포함
- fanout: not selected — coding-heavy 작업, Anthropic caveat에 따라 serial 우선
- sweep: not selected — 기계적 단일 변환 규칙이 아니라 milestone마다 다른 성격의 작업(삭제/정리/문서화/검증)
- serial (via manager-lead 조정): **selected** — Tier L + 7 milestones(≥3) + 40+ files(≥10) + cross-domain(app/auth/e2e/scripts/docs) fan-out 기준을 만족하여 `manager-lead`에 위임. manager-lead는 milestone 단위로 순차 진행하며 필요 시 worktree-isolated leaf worker를 depth-2 seal 하에 fan-out.

**Decision**: serial (manager-lead coordination)

**Justification**: 7개 마일스톤이 서로 의존적(M1 baseline → M2 진입점 → M3/M4 코드 삭제 → M5 정리 → M6 문서 → M7 전체 검증)이며 각 마일스톤이 `pnpm build` 통과를 게이트로 요구하므로, coding-heavy 순차 작업(Anthropic parallelism caveat)에 해당한다. CLAUDE.md §4 선택 기준(Tier L, ≥3 milestone, ≥10 file, cross-domain)을 모두 충족하여 manager-lead 조정 위임을 선택했다.
