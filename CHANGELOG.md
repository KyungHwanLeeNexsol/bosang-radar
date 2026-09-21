# Changelog

이 프로젝트의 모든 주요 변경사항을 이 파일에 기록합니다.
형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/)를 따릅니다.

## [Unreleased]

### Added — SPEC-B2C-DIAGNOSIS-001: B2C 01 진단 플로우 (질문 입력 · 동의 · 추가 질문 · 진단 중), 플래그 게이트 뒤 구현

SPEC-B2C-FOUNDATION-001이 `app/page.tsx`를 "서비스 준비 중" placeholder로 남겨 둔 자리에, B2C 3단계 퍼널의 첫 진입점인 01 흐름을 **기능 플래그 뒤에** 구현했습니다. 로그인·회원가입 없이 검색 한 줄을 입력하면 민감정보 처리 동의 1건을 받고, 추가 질문으로 정확도를 높인 뒤 분석 상태를 보여 주는 경로이며, 화면은 Desktop 6개(01 질문 입력 / 01-A2 동의 / 01-B 추가 질문 / 01-C 진단 중 / 01-D 결과 없음 / 01-E 분석 오류) + Mobile 4개(M01 / M01-A2 / M01-B / M01-C) 총 10개입니다.

**프로덕션 노출은 기본적으로 차단됩니다.** `app/page.tsx`의 렌더링 조건은 `productionReady = ENABLE_DIAGNOSIS_FLOW && DIAGNOSIS_ENGINE_READY`와 `reviewEnabled = ENABLE_DIAGNOSIS_DEV_STATES`를 OR로 합성한 `shouldRenderDiagnosis`입니다. 이 SPEC이 전달하는 코드 어디에도 두 서버 전용 플래그를 `"true"`로 대입하는 지점이 없어(grep 확인), 플래그를 설정하지 않은 기본 빌드의 `/` 출력은 기존 placeholder와 동일합니다. 실제 담보 매칭 엔진 연결은 이 SPEC의 Out of Scope이며, `step-loading.tsx`의 `@MX:DEBT`/`@MX:CEILING`/`@MX:UPGRADE` 주석이 그 경계(결과 있음=02 화면 분기 미구현)를 코드에 명시합니다.

개인정보는 수집하지 않습니다 — 일반 개인정보 수집·이용 동의를 요구하지 않고 건강정보 등 민감정보 처리 동의 1건만 필수로 받으며, `lib/validation/diagnosis-input.ts`가 전화번호·주민등록번호를 자동 차단하고 이름 등은 안내만 하는 2단계 Zod 검증을 수행합니다. 동의 상세는 768px 브레이크포인트(`use-media-query.ts`)로 Desktop은 Modal(`step-consent-modal.tsx`), Mobile은 Bottom Sheet(`step-consent-sheet.tsx`)로 분기하며, 상세 보기를 여는 것만으로 동의 체크박스가 자동 선택되지 않고 닫기·ESC·배경 클릭 어느 경로로 닫아도 포커스가 "내용 보기" 트리거로 돌아갑니다. 동의 체크박스와 설명 텍스트는 스크린리더가 한 항목으로 읽도록 접근성 속성으로 연결했습니다. 단계 전환은 `diagnosis-flow.tsx`가 `?step=` 쿼리로 동기화하되 `VALID_STEPS` 런타임 가드로 임의 값 진입을 막고, `skipNextPushRef`로 뒤로가기 시 히스토리 desync가 생기지 않도록 했습니다.

**시각 정합성은 결정론적 도구로 게이트했습니다.** `scripts/visual-verify.ts`(+`visual-verify-helpers.ts`)를 신규 작성해 `pnpm visual:verify`로 `design/exports/`의 2배 PNG를 1배로 정규화한 프레임과 실제 렌더를 대조합니다 — 배경색·글자 크기·요소 폭뿐 아니라 줄바꿈 **지점**까지 10건 대조하며, 측정값이 없으면 조용히 통과하지 않고 exit 1로 실패합니다. 9차에 걸친 하드닝 과정에서 이 게이트가 실제 결함(M01-A2 설명이 디자인보다 한 글자 일찍 끊김, 동의 문구 가운뎃점 공백 누락, "내용 보기" 꺾쇠 누락, 배너 아이콘이 삼각형)을 잡아 exit 1을 낸 뒤 수정해 exit 0이 된 경로를 실증했습니다. 결과물(`measurements.json` `canonical: true`, 스크린샷·overlay·diff)은 `.moai/reports/visual-check/SPEC-B2C-DIAGNOSIS-001/`에 커밋되어 있습니다.

**검증**(sync-phase에서 직접 재실행): `pnpm test` → 53 files / 394 tests 전부 PASS(exit 0), `pnpm lint` → 무출력(exit 0), `pnpm exec tsc --noEmit` → 무출력(exit 0). run-phase 기록 기준 Playwright `diagnosis-flow-01.spec.ts` 16/16 PASS, `next build`는 플래그 unset / `ENABLE_DIAGNOSIS_DEV_STATES=true` 두 조합 모두 성공, `pnpm visual:verify` 10/10 화면 exit 0(findings 0). acceptance.md 기준 AC-B2CDIAG-001~025 **25/25**. 회귀 테스트는 통과만 확인하지 않고 구현을 일부러 되돌려 실패를 본 뒤 복구하는 방식으로 5건을 검증했습니다. 커버리지는 실측했습니다 — `pnpm vitest run --coverage` 기준 전체 Lines **89.35%**(865/968, Statements 88.86% · Branches 82.56% · Functions 84.52%)이고, 이 SPEC이 추가한 `components/diagnosis/` 디렉터리는 Lines **95.13%**입니다. 앞서 0/0이 산출되던 `@vitest/coverage-v8` 결함은 **그 워크트리 체크아웃에 국한된 것으로 범위를 좁힙니다** — 메인 체크아웃에서는 재현되지 않았습니다. (`coverage.include` 누락을 고친 커밋 `3283905`가 이를 해소했다고 주장하지는 않습니다. 해당 커밋 메시지 자체가 "fix를 적용한 뒤에도 이 특정 worktree에서는 여전히 0/0이 관측된다"고 기록하고 있으며, 근본 원인은 규명되지 않은 채 남아 있습니다.)

범위 밖 디렉터리(`lib/pipeline/`, `lib/ai/`, `lib/db/`, `db/`, `design/`, `.github/workflows/deploy.yml`)는 전혀 수정하지 않았고, 공유 프리미티브(`components/ui/notice.tsx`의 기본 아이콘 등)의 기본값도 보존한 채 호출부에서만 교체했습니다.

### Removed — SPEC-B2C-FOUNDATION-001: B2B 코드 정리 및 B2C 공개 퍼널 기반 전환 (M1-M7)

제품 방향이 B2C 보상 진단 퍼널로 전환됨에 따라(`.moai/project/product.md` §구조·공존 관계), 실제 동작하던 B2B 전용 구현체를 회귀 없이 순차 제거했습니다. `app/page.tsx`를 인증 세션 의존 리다이렉트에서 정적 "서비스 준비 중" placeholder로 먼저 교체한 뒤(M2, REQ-B2CFOUND-002/003/013 — 라우트 제거와 신규 진입점 마련의 순서 보장), B2B 라우트·인증 표면 `app/cases/**`(27개)·`app/login/*`(5개)·`app/api/auth/[...all]/route.ts`·`app/api/cases/**`(4개)·`lib/auth/**`(Better Auth, 7개)·`components/evidence-item.*`·`proxy.ts`(보호 경로 전부 소멸에 따라 파일 자체 삭제)를 제거했습니다(M3). 이어서 미사용 B2B 코드 `lib/cases/**`(9개)·`lib/feedback/**`(4개)를 제거했고(M4), `e2e/` 전체(13개)와 `scripts/`의 Better Auth 전용 파일(`provision-tester.ts`+test, `e2e-tester-emails.ts`, `scripts/measure/capture-login.mjs`·`login-pixel-compare.mjs`) 및 `lib/env.ts`의 `BETTER_AUTH_SECRET`/`BETTER_AUTH_URL` 요구 사항, `package.json`의 `better-auth` 의존성과 `tester:add` 스크립트를 제거했습니다(M5) — 삭제 사유·대체 검증 여부는 `progress.md` §M5에 시나리오별로 기록했습니다.

**계획 대비 편차**: `lib/validation/case-input.ts`(+test)는 design.md에서 삭제 분류였으나, 삭제 전 필수 cross-reference grep에서 `lib/pipeline/types.ts`가 이 파일의 `CaseInput` 타입을 실제로 import·재export하는 의존을 발견했습니다. 삭제를 완료하려면 `lib/pipeline/types.ts` 수정이 필요한데, 이는 REQ-B2CFOUND-007("`lib/pipeline/`을 삭제·추출·수정하지 않고 그대로 보존")을 직접 위반하므로, 이 SPEC에서는 `case-input.ts`를 삭제하지 않고 보존했습니다(후속 SPEC에서 `lib/pipeline/` decision gate와 함께 재검토 대상).

`.moai/project/product.md`/`structure.md`/`tech.md`를 M1-M5 실제 코드 상태에 맞춰 갱신했습니다(M6). `.github/workflows/deploy.yml`은 이 SPEC의 어떤 milestone에서도 수정하지 않았으며(REQ-B2CFOUND-011), 기존 11개 DB 테이블·마이그레이션 이력은 전혀 손대지 않았습니다(REQ-B2CFOUND-006). `lib/pipeline/`·`lib/ai/`·`lib/db/`는 재사용 여부 미결정 상태로 그대로 보존됩니다(REQ-B2CFOUND-007).

**검증**: M1 baseline 대비 M7 재검증 결과 회귀 0건 — `pnpm test`(41/41 files, 282/282 tests, PASS — M1에서 실패하던 `app-shell-chrome.test.tsx`는 파일 자체가 M3에서 삭제되어 소멸), `pnpm lint`(PASS), `npx tsc --noEmit`(PASS), `pnpm build`(PASS, 라우트가 `/`+`/_not-found`로 축소), `pnpm format:check`(pre-existing 3건만 잔존, PRESERVE 대상 — 오히려 3건 개선). `PROTECTED_PATH_PATTERNS`/`isProtectedPath` 잔존 0건(`proxy.ts` 삭제로 완전 해소). 총 6개 커밋(`4351f53`/`eaa4d53`/`c890d15`/`b095b09`/`b67aae4`/`05e9a13`), 93개 파일 변경(+391/-12309). acceptance.md AC 15/15 PASS — 전부 plan-phase 산출물 자체를 검증 대상으로 하며 run-phase에서 그 5개 파일을 수정하지 않아 불변.

### Added — SPEC-CASE-PROGRESS-002: 실 백엔드 진행 신호 기반 퍼센트 진행률 바

`lib/pipeline/index.ts`의 `runPipeline()`에 선택적 콜백 `onStageProgress`를
추가해, 내부 6단계 실행 중 사용자 대면 3개 체크포인트(QueryPlanner 완료=1,
EvidenceRetriever 완료=2, Researcher 완료=3 — 에스컬레이션 재실행 시
멱등적으로 2회 호출 가능)에서 발화하도록 계측했습니다. `case_jobs` 테이블에
정수 컬럼 `progress_stage`(기본값 0, NOT NULL)를 추가하는 마이그레이션을
적용했고, `lib/cases/create-case.ts`의 `processCaseJob()`이 이 콜백에서
기존 완료 트랜잭션과 동일한 3중 펜싱 조건(id/leaseId/status=processing)으로
`progress_stage`만 독립적으로 갱신하며, UPDATE 실패는 로그만 남기고 파이프라인
실행에는 영향을 주지 않습니다(부가 신호). `GET /api/cases/status`가 응답에
`progressStage` 필드를 추가하되, `status === "completed"`인 경우 저장값과
무관하게 항상 `ANALYSIS_STAGES.length`(4)를 반환해 계측 누락에 대한
안전장치를 둡니다. `app/cases/new/case-input-form.tsx` 대기 Footer에 실제
`role="progressbar"` 요소와 `case-pending-stages` 각 항목의 완료/진행
중/대기 상태 표시를 추가했으며, 두 요소 모두 서버가 실제로 반환한
`progressStage` 값에서만 계산되고 관측값 사이를 보간하거나 시간 경과만으로
자동 증가하는 로직은 포함하지 않습니다.

이 SPEC은 SPEC-CASE-PROGRESS-001이 확정한 "가짜 진행률 금지" 원칙
(REQ-CASE-PROGRESS-002/003)을 **명시적으로 반전**합니다 — 신규 백엔드
계측으로 "실제 데이터가 없어 표시할 수 없다"던 전제 자체가 사라졌기
때문입니다. SPEC-CASE-PROGRESS-001은 `status: completed`를 유지하되
`partially_superseded_by: [SPEC-CASE-PROGRESS-002]`가 프런트매터에
추가되었으며, REQ-CASE-PROGRESS-001(공유 상수 단일 소스)·
REQ-CASE-PROGRESS-004(접근성 배치)·REQ-CASE-PROGRESS-005(무관 범위 보존)는
그대로 계승됩니다.

**검증**: AC-001~018 전부 PASS(TDD, 18/18 acceptance criteria). 신규 단위
테스트는 `lib/pipeline/index.test.ts`, `lib/cases/create-case.test.ts`,
`app/api/cases/status/route.test.ts`, `app/cases/new/case-input-form.test.tsx`
4개 파일에 추가됐습니다. 이 SPEC이 신규로 추가한 테스트 실패는 0건이며,
기존에 알려진 `app-shell-chrome.test.tsx`의 `useRouter` mock 누락 실패
17건(이 SPEC과 무관, `git stash`로 무관성 확인)만 잔존합니다. 변경 파일은
`lib/db/schema.ts`, `lib/pipeline/index.ts`, `lib/cases/create-case.ts`,
`app/api/cases/status/route.ts`, `app/cases/new/case-input-form.tsx` 및
각 테스트 파일, DB 마이그레이션(`db/migrations/0008_high_zarda.sql`)으로
한정됩니다.

### Changed — SPEC-SIDEBAR-NAV-001: 사이드바 "전문가 피드백" 항목 아이콘 교체 + aria-label 추가

`app/cases/case-shell-nav.tsx`의 사이드바 "전문가 피드백" nav 항목 아이콘을
페이지형 `MessageSquare`에서 인페이지 앵커 이동을 암시하는
`CornerDownRight`(이미 설치된 `lucide-react`, 신규 의존성 없음)로
교체했습니다. "전문가 피드백"은 `/cases/[caseId]` 리서치 리포트 페이지
내부의 `#expert-feedback` 섹션으로 스크롤 이동하는 인페이지 앵커일 뿐 별도
페이지가 아닌데도 "사건 입력"/"리서치 리포트"와 아이콘·스타일이 동일해
사용자가 오인할 소지가 있어(백로그 t2), 시각적으로 구분했습니다. `NavLink`에
옵션 `ariaLabel` prop을 추가해 활성 링크 렌더링 분기에만 "전문가 피드백
섹션으로 이동 (현재 페이지 내)" 안내를 전달하며, 비활성
`<span aria-disabled>` 분기에는 전달하지 않습니다. `href` 계산 로직·실제
이동 대상(`/cases/${currentCaseId}#expert-feedback`)·`onNavigate`
콜백(모바일 드로어 닫힘)·"사건 입력"/"리서치 리포트"/`ComingSoonNavLink`
2항목은 전혀 수정하지 않은 순수 프레젠테이션 전용 변경입니다. 사이드바
제거·리포트 내부 이동·URL 해시 기반 active 상태 추적은 검토했으나 이번
SPEC 범위 밖으로 명시적으로 기각했습니다.

**검증**: AC-001~008 전부 PASS(`case-shell-nav.test.tsx` 신규 단위 테스트
3건 + 기존 5건, `app-shell-chrome.test.tsx` 드로어 닫힘 케이스 회귀 없음).
전체 Vitest 477 passed / 18 failed — 실패 18건은 SPEC-CASE-PROGRESS-001
sync 기록과 동일한 기존 결함(`app-shell-chrome.test.tsx`의 `useRouter`
mock 누락, 이 SPEC과 무관)이며 이 SPEC이 신규로 추가한 실패는 0건입니다.
`pnpm lint`/`pnpm build` 모두 exit 0, `git diff --stat`로 확인한 변경
파일은 정확히 `app/cases/case-shell-nav.tsx`, `app/cases/case-shell-nav.test.tsx`
2개(+ SPEC 아티팩트)로 한정됩니다.

### Added — SPEC-CASE-PROGRESS-001: 사건 입력 대기 화면에 정적 4단계 분석 진행 안내 추가

`app/cases/new/case-input-form.tsx`의 제출 대기 Footer에 4단계(쟁점 자동 추출/판례·결정례
검색/약관·법령 대조/근거 검증 및 반대 논리 생성) 정적 안내 목록을 추가했습니다. 라벨은
`analysis-status-panel.tsx`와 공유하는 신규 단일 소스(`lib/cases/analysis-stages.ts`)에서
가져오며, 개별 단계의 완료/진행 표시(체크마크, 퍼센트, `role="progressbar"`)는 전혀
렌더링하지 않습니다 — `/api/cases/status`가 단계별 데이터를 반환하지 않으므로 가짜
진행률을 표시하지 않는다는 SPEC-UI-MIGRATION-001 원칙을 그대로 승계합니다. 목록은 기존
`case-pending-indicator`(`role="status" aria-live="polite"`)의 형제 요소로 배치되어
`aria-live`가 부여되지 않으므로 폴링 틱마다 반복 안내되지 않습니다. 백엔드
(`app/api/cases/status/route.ts`, `lib/cases/job-timing.ts`)와 `lib/pipeline/**`, DB
스키마는 전혀 수정하지 않았습니다.

**검증**: AC-CASE-PROGRESS-001, 002, 003, 006, 007, 008, 009 전부 PASS(TDD RED-GREEN,
`case-input-form.test.tsx`/`analysis-status-panel.test.tsx` 신규 5건). 전체 Vitest
474 passed / 18 failed(492건 중) — 실패 18건은 100% 기존 결함(`app-shell-chrome.test.tsx`의
`useRouter` mock 누락, 이 SPEC과 무관, 변경 전후 동일 건수)이며 이 SPEC이 신규로 추가한
실패는 0건입니다. `tsc`/`eslint`/`format:check`/`build` 모두 exit 0,
`grep -rn 'role="progressbar"' app/cases/new/case-input-form.tsx` 0건(REQ-CASE-PROGRESS-003
기계적 검증).

### Docs — SPEC-PILOT-OPS-001: 문서 현행화 + 파일럿 운영 개시 계획 신설(코드 변경 없음)

README.md와 `.moai/project/product.md`를 12개 SPEC(SPEC-PILOT-LAUNCH-001까지)에서
13개 SPEC(이 SPEC 자신 포함) 현행으로 갱신하고, 확정된 Netlify 프로덕션 배포
URL(`https://musical-macaron-82feb3.netlify.app`)·SHA(`381e38d`, 이 시점 기준)를
반영했습니다. 신규 운영 문서 `.moai/docs/pilot-ops-launch-plan.md`(410줄)를
작성해 다음을 계획으로 담았습니다: 최초 운영 계정 발급 절차(임시 계정 대안
경로 포함), 프로덕션 단일 계정 스모크 체크리스트 + 테넌트 격리 게이트, 파일럿
3단계 롤아웃(소규모→확대→전체) + 사용자별 완료/피드백 성공지표 집계 계약,
Gemini 하이브리드 라우팅 쿼터 운영 계획 — 단일 Google Cloud 프로젝트/단일
`GEMINI_API_KEY` 아키텍처 제약(멀티 키·로테이션·페일오버 없음)을 명시적으로
유지합니다.

이 SPEC은 **문서 전용(documentation-only)**입니다 — 코드 변경 없음, 실제 계정
발급 없음, 실 DB 쓰기 없음, 실 Gemini API 호출 없음, 실 배포 없음, 실 테스터
초대 없음. `.moai/docs/pilot-incident-runbook.md`, `.moai/docs/account-provisioning.md`는
run-phase·sync-phase 동안 무변경으로 보존됐습니다.

**검증**: AC-PILOT-OPS-001a, 001b, 002, 003, 004, 005, 006, 007 전부 PASS(외부
run-phase 검토, 리뷰 대상 HEAD `26e0d8c`). sync-phase에서 `git diff --check`,
`pnpm format:check` 모두 exit 0, `git diff af6c0a1..HEAD --stat` 기준 정확히
5개 파일 변경(README.md, product.md, pilot-ops-launch-plan.md, progress.md,
spec.md) 확인, runbook 무변경 재확인.

### Fixed — 클라이언트 polling 상한(6분)이 backend 리스 TTL(960초)보다 먼저 끝나던 불일치

`app/cases/new/case-input-form.tsx`의 job 상태 polling이 고정 180회×2초(6분)에서
멈춰, 실제로는 여전히 유효한(TTL 960초) backend job에 대해 사용자에게 "실패"를
먼저 알리는 창이 있었습니다. `lib/cases/job-timing.ts`(신규, DB 의존성 없는
순수 상수 모듈)를 추가해 polling 상한을 리스 TTL 기준 안전 여유(60초)를 둔
450회×2초(15분)로 넓혔고, `create-case.ts`의 `BACKGROUND_LEASE_TTL_SECONDS`는
이 파일에서 재수출해 값 하나로 유지합니다. 타임아웃 메시지도 즉시 재제출을
유도하지 않도록("지금 다시 제출하지 말고 잠시 후 새로고침해 확인해 주세요")
정정했습니다.

**검증**: `lib/cases/job-timing.test.ts`(신규 2개), `case-input-form.test.tsx`에
예전 180회 상한을 지나도 계속 대기함을 확인하는 케이스 1개 추가. 전체
Vitest 68/68 files·466/466 tests, tsc/eslint/prettier/build 모두 exit 0.

### Verified — 실제 Deploy Preview + 원격 Turso 대상 하이브리드 라우팅·동시성·리스 복구 실측

`GITHUB_TOKEN`으로 PR #10의 최신 Deploy Preview가 `ready`이고 런타임도 살아
있음을 확인한 뒤, 사용자 승인에 따라 새 합성 전용 테스터 3계정을 원격 Turso에
직접 프로비저닝(비밀번호는 프로세스 메모리에만 존재, 기록하지 않음)해 다음을
실제 환경에서 검증했습니다: 서로 다른 사용자 3명의 동시 사건 제출(정상/복합
하이브리드 경로 각각 실측, 429/5xx 없음, 소유자별 DB 격리 확인), 동일 사용자
동시 경합(202+409), 동일 job에 대한 background 함수 중복 호출 시 정확히 1회만
실행됨(관측 테이블로 확인), 원격 DB에서 리스 만료를 직접 재현했을 때의 TTL
재획득과 지연 완료 fencing.

**남은 gap**: 완료 트랜잭션 실패 시 부분 저장 없음은 단위 테스트로만 확인(실환경
fault-injection은 위험 대비 실익이 낮아 미시도), processing 중 강제 종료 복구는
실제 재현이 불가능해 UNVERIFIED로 남기고 최소 수정안(상태 조회 시 리스 TTL
초과+리스 미보유면 `failed`로 간접 판정)만 제시했습니다.

**참고**: `.moai/specs/SPEC-PILOT-READY-001/progress.md` §AA, `.moai/reports/pilot-ready-readiness-decision-2026-09-10.md`

### Fixed — 로컬 E2E `case-flow.spec.ts` 502 회귀 (§R 비동기 전환 이후 방치)

`POST /api/cases`가 같은 origin의 `/.netlify/functions/process-case-background`를
enqueue하도록 바뀐 뒤(§R, `ff706c2`), 순수 Next.js(`pnpm build && pnpm start`)만
띄우는 로컬 E2E 하네스에는 그 Function 경로가 존재하지 않아 enqueue가 항상 실패하고
502가 반환되는 회귀가 있었습니다. `case-flow.spec.ts`가 그 전환 이전의 동기(201)
계약을 그대로 가정한 채(`1a6180f` 이후 미갱신) 3/3 결정적으로 실패하고 있었습니다.
이 경로는 원격 Netlify Preview 스모크(§T~§X, §W)가 이미 실측 검증하므로,
근본원인을 테스트에 주석으로 남기고 `test.skip()`으로 전환했습니다 — 런타임 동작은
변경하지 않았습니다.

**검증**: 최신 HEAD(`187afc2`) 기준 전체 재실행 — Vitest 67/67 files·463/463
tests, `tsc --noEmit`, ESLint, Prettier, `next build` 모두 exit 0(2회 재현).
E2E는 수정 전 12 passed/10 skipped/**1 failed**(502) → 수정 후 **11 passed/11
skipped/0 failed**. 하이브리드 라우팅(일반→Lite/복합→Premium)은 실 GEMINI_API_KEY로
로컬 2개 시나리오를 직접 호출해 설계대로 동작함을 확인했습니다(Premium 호출 0회/1회,
원격 DB는 evidence 읽기만, 쓰기 없음) — 승격(lite→premium) 경로의 실 API 실측과
원격 Preview 기준 재측정은 이번 세션에서 수행하지 못해 UNVERIFIED로 남습니다.

**참고**: 이전 CHANGELOG 항목이 기록한 "jsdom/undici worker 오류 13건, exit 1"과
"필수 환경변수 미주입으로 build가 prerender 단계에서 중단"은 작성자 본인 환경에서
실측된 사실이며, 이 세션 환경(Node v24.19.0, Windows)에서는 재현되지 않았습니다 —
환경 차이로 추정하며 "해결됨"으로 승격하지 않습니다.

**참고**: `.moai/specs/SPEC-PILOT-READY-001/progress.md` §Z, `.moai/reports/pilot-ready-readiness-decision-2026-09-10.md`

### Changed — Gemini Researcher 하이브리드 라우팅

무료 티어의 `gemini-3.6-flash` 20 RPD 병목을 줄이기 위해 일반 사건은
`gemini-3.5-flash-lite` Researcher로 시작하고, 기왕증·상해/질병 혼재·추가확인
신호가 있거나 Lite 결과가 근거 대비 누락/판단불충분인 경우에만 3.6 Flash로
승격하도록 변경했습니다. 근거자료 자체가 없는 항목은 상위 모델로 해결할 수 없으므로
승격하지 않으며, Premium 결과가 더 나쁘면 Lite 결과를 보존합니다. 라우팅 결정은
사건 원문 없는 구조화 로그로 남깁니다.

Google 쿼터가 API 키가 아닌 프로젝트 단위인 점과 공정 사용 제한의 운영 취지를 고려해,
여러 무료 계정/프로젝트의 키를 429 이후 순환시키는 쿼터 합산 기능은 도입하지 않았습니다.

**검증**: 하이브리드 라우터·파이프라인 회귀 테스트 3 files/19 tests, TypeScript
`--noEmit`, 변경 파일 ESLint 및 Prettier 검사 통과. 전체 Vitest에서는 테스트
53 files/382 tests가 통과했으나 현재 Windows/Node 환경의 기존 `jsdom`/`undici`
worker 호환 오류 13건으로 러너 exit 1. 로컬 Next build는 필수 운영 환경변수 미주입으로
prerender 단계에서 중단됐으며 컴파일과 TypeScript 단계는 통과했습니다.

**참고**: `.moai/reports/hybrid-research-routing-20260913.md`

### Added — SPEC-PILOT-READY-001 파일럿 배포 준비 — Netlify Preview 통과, 원격 readiness `NO-GO` 유지

외부 전문가 파일럿 전에 필요한 최소 운영 안전장치를 구현하고 Netlify Free 배포 적합성을 점검했습니다. 사용자별 DB 리스 기반 동시 실행 가드, 구조적 비식별 로그, 데이터 취급 고지, 장애 대응 런북을 추가했습니다. PR #10의 자동 Deploy Preview에서 `@libsql/client` 네이티브 애드온이 Middleware 번들에 포함되는 문제를 발견해 세션 쿠키 판별 코드를 DB 비의존 모듈로 분리했고, 수정 후 Preview가 통과했습니다.

- **동시 실행 가드**: `reservations.owner_user_id` 유일 제약과 330초 TTL·lease ID 펜싱으로 같은 사용자의 중복 파이프라인 실행을 차단하고, 완료 기록은 사건·리포트 저장과 동일 트랜잭션으로 처리
- **운영 안전성**: 오류명·코드·단계만 허용하는 구조적 로그와 Netlify 로그 확인·재시도 안내·triage 담당자를 담은 파일럿 장애 대응 런북 추가
- **데이터 취급 고지**: 합성 또는 사전 비식별화된 사건만 허용하고 실 PII·원본 문서 입력을 금지한다는 운영 계약을 반영하고, `SUPPORT_CONTACT_EMAIL`이 설정되면 활성 지원 링크를 렌더링하도록 구성
- **Netlify Preview 수정**: `proxy.ts`가 DB 의존 세션 모듈을 전이 import하지 않도록 `lib/auth/session-cookie.ts`를 분리하고 import-graph 회귀 테스트 추가

**검증**: `pnpm exec vitest run` 62/62 test files·431/431 tests, `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm run format:check`, `pnpm build`, `pnpm test:e2e`(13 passed·10 skipped·0 failed) 모두 exit 0. 자동 Deploy Preview와 Header/Redirect checks 통과. 실제 Netlify 함수 처리시간, AI Studio 쿼터, 원격 Turso, 실 도메인 인증, 실 Gemini 스모크, 서로 다른 사용자 동시 부하, 원격 저장소·복구 검증은 실행되지 않아 readiness 7개 항목은 모두 `UNVERIFIED`, 전체 판정은 `NO-GO`로 유지합니다.

**참고**: `.moai/specs/SPEC-PILOT-READY-001/`, `.moai/reports/pilot-ready-readiness-decision-2026-09-10.md`

### Added — SPEC-E2E-AUTH-STATE-001 E2E storageState 인증 재사용 — Better Auth `/sign-in` rate-limit flaky 제거

`e2e/case-input-mobile-layout.spec.ts`/`e2e/tenant-isolation.spec.ts`가 인접 스펙 파일의 로그인 누적으로 Better Auth 기본 rate limit(`/sign-in` 10초 창 내 최대 3회)에 걸려 간헐적으로 실패하던 문제를, 재시도 횟수를 늘리는 대신 두 파일의 실제 UI 로그인 자체를 없애는 방식으로 근본 해결했습니다. Playwright의 project-dependency 기반 "setup 프로젝트" 패턴을 도입해 `e2e/auth.setup.ts`가 TESTER_A/TESTER_B 각각 정확히 1회씩 로그인 후 `storageState`를 저장하고, 두 대상 파일은 그 `storageState`를 재사용해 인증된 세션으로 시작합니다.

- **신규 `e2e/auth.setup.ts`**: TESTER_A/TESTER_B 로그인 + `storageState` 저장. `/api/auth/sign-in/email` 네트워크 요청 횟수를 테스터당 정확히 1회로 직접 검증(`page.on("request", ...)`을 로그인 트리거 이전에 등록해 실패 요청도 계수)하고, 저장 직후 그 파일을 새 브라우저 컨텍스트로 로드해 `GET /api/auth/get-session`을 호출 + `user.email` 일치를 단언하는 상시 계정 검증을 포함합니다(쿠키·응답 전체는 로그에 남기지 않음)
- **신규 `e2e/storage-state-paths.ts`**: 두 테스터의 `storageState` 파일 경로 상수(leaf 모듈, `import.meta` 미사용)
- **`playwright.config.ts`**: `setup` project + 대상 2개 파일 전용 `chromium-authed` project(`dependencies: ["setup"]`) 추가, 기존 `chromium` project는 두 파일을 `testIgnore`로 제외. `workers: 1`/`retries: 2`/`webServer` 블록은 완전히 무변경
- **대상 2개 파일**: `loginAsTester()` 호출을 제거하고 `test.use({ storageState })`로 전환 — 로그인 이후의 테스트 본문·단언은 무변경

**검증**: 10개 요구사항(REQ-E2EAUTH-001~~010) 전부 구현, 15개 인수 기준(AC-E2EAUTH-001~~015, 015는 a/b 하위 시나리오 포함) 전부 실측으로 만족. `pnpm test:e2e`(전체 스위트) 5회 연속 실행 + `--spec` 필터 2회에서 setup(TESTER_A/B)은 각 7회, 대상 2개 파일(`case-input-mobile-layout.spec.ts`/`tenant-isolation.spec.ts`)은 각 6회(전체 5회 + 자신을 포함하는 필터 1회) 모두 1차 시도 통과, leftover storageState 파일을 남긴 채 재실행해도 해시·mtime이 실제로 갱신되고 setup 내장 계정 검증이 (전체 스위트·`--spec` 필터 양쪽에서) 최종적으로 통과함을 확인했습니다. plan-auditor 3회 실행(iteration 1 FAIL 0.71 → iteration 2 0.86 → iteration 3 PASS 0.92) + 외부 독립 리뷰 5회 라운드(플랜 심층 리뷰, run-phase 구현 검토, sync-phase 문서 검토, REQ/AC 독립 재대조 감사, PR #9 계측 기반 3차 재검토)를 거쳐 지적을 실측으로 해소했습니다. `pnpm test`(59 test files/395 tests)/`pnpm lint`/`pnpm build` exit 0, `pnpm format:check`는 exit 1(사전 위반 3건 `app/globals.css`/`CHANGELOG.md`/`docs/evidence/SPEC-UI-MIGRATION-001/comparison-login.html` — 이 SPEC과 무관, 신규 위반 0건). PRESERVE 대상(`e2e/helpers.ts`, `e2e/mobile-drawer-focus.spec.ts`, `e2e/case-flow.spec.ts`, `e2e/auth.spec.ts`, `playwright.config.ts`의 `workers`/`retries`/`webServer`, `scripts/` 전체, out-of-scope 5개 spec 파일)은 SPEC 시작 시점부터 커밋 기준 zero-diff로 확인됐습니다.

**v0.1.6 — 근본 원인 제거 + `auth.spec.ts` 거짓 통과 정정 (외부 재검토 3차 대응)**: 이전 버전이 "잔여 부채"로 기록했던 `e2e/case-flow.spec.ts` 5회 연속 1차 시도 실패 → retry로 회복 현상을, 실제 `pnpm test:e2e` 진입점에서 네트워크 응답을 직접 계측(타임스탬프+HTTP 상태+오류 코드, 비밀·쿠키·응답 본문은 미기록)해 원인을 확정했습니다 — case-flow의 로그인이 스위트 시작 이후 정확히 5번째 `/api/auth/sign-in/email` 요청이라 Better Auth 기본 rate limit(10초 창/최대 3회)에 걸립니다. 같은 계측으로 `e2e/auth.spec.ts`의 "미등록 이메일 거부" 테스트가 실제로는 인증 거부(401)가 아니라 **동일한 rate-limit(429)**로 우연히 통과하고 있던 거짓 통과(false pass)도 확정했습니다 — 로그인 폼이 원인과 무관하게 오류 메시지를 표시하고, 그 테스트는 상태 코드를 확인하지 않기 때문입니다. `playwright.config.ts`의 `workers`/`retries`/`webServer`, Better Auth 설정, `case-flow.spec.ts`/`auth.spec.ts` 소스는 전부 무변경으로 유지한 채, 이 SPEC이 신설한 유일한 수정 가능 파일인 `e2e/auth.setup.ts`의 TESTER_B 로그인 직후 10초 대기 1줄을 추가해 setup의 2건이 뒤이은 요청들과 다른 rate-limit 창에 들도록 했습니다(이 대기는 TESTER_B 테스트 자체의 timeout 예산도 함께 소비합니다 — 실측 10.5~10.6초, 기본 30초 예산 대비 여유 확인). 계측을 넣은 재실행 1회에서 `auth.spec.ts`의 거부 테스트가 진짜 401 응답을 받는 것을 직접 확인했고, 이어서 계측 없는 최종 코드로 전체 스위트 5회 연속 + 필터 2회를 전량 재실행해 `case-flow.spec.ts`를 포함한 스위트 전체가 재시도 없이 1차 시도로 통과함을 확인했습니다(이 5+2회는 테스트 PASS만 확인하며 상태 코드는 재확인하지 않습니다 — `auth.spec.ts` 자체가 오류 원인을 구분하지 않으므로, 향후 유사한 429 거짓 통과가 재발해도 이 테스트만으로는 검출되지 않는다는 것이 알려진 검증 한계로 남습니다). 상세: `.moai/specs/SPEC-E2E-AUTH-STATE-001/progress.md` §E.2c/§E.2d.

**참고**: `.moai/specs/SPEC-E2E-AUTH-STATE-001/`

### Added — SPEC-UI-MIGRATION-001 UI 마이그레이션 — Pencil 디자인 전체 화면 확장 재현(로그인·공통 예외·반응형 포함)

SPEC-PILOT-VISUAL-001이 재현한 3개 화면(사건 입력/리서치 리포트/전문가 피드백)을 넘어, 확정된 Pencil 디자인(`design/claimradar-ui.pen`)의 나머지 화면과 App Shell 확장, 콘텐츠 정합성, 반응형 규칙을 마무리했습니다. 5차례의 외부 독립 재검토(Round 1~5)를 거쳐 발견된 결함을 매 라운드 실측으로 해소했습니다.

- **로그인 화면 신규 셸**(`app/login/layout.tsx`, `login-form.tsx`, `page.tsx`): 비밀번호 표시/숨김 토글, 비활성 Footer 링크(이용약관/개인정보처리방침/고객지원) + "랜딩으로 돌아가기" 활성 링크, 좌측 다크 브랜드 패널 + 우측 흰 폼 2컬럼 레이아웃. Pretendard 폰트 로딩을 이 레이아웃 내부에만 격리해 `app/layout.tsx`/`app/page.tsx` zero-diff 유지
- **App Shell 확장**(`case-shell-nav.tsx`, `sidebar-user-block.tsx`, `case-shell-topbar.tsx`): 사이드바 5항목(기존 3개 + 비활성 "리포트 보관함"/"판례·약관 자료실" 2개), 세션 `user.name` 기반 사용자 블록(클라이언트 컴포넌트로 분리), 라우트별 브레드크럼/타이틀
- **콘텐츠 정합성**(`lib/pipeline/labels.ts` 신규): 근거자료 유형(5종)·쟁점 유형(8종) 영문 raw enum 값을 한글 라벨로 매핑해 화면에 노출 — 내부 `data-*` 속성은 영문 값 그대로 보존
- **비확정성 안내 + Claim 카드 정합성**: Aggregate Status/검토 담보 패널에 비확정성 안내 문구 추가, INSUFFICIENT claim 카드에 "추가 확인 필요" 안내 + `missingMaterials`/`uncertainty` 앵커 링크
- **사건 입력 우측 레일 확장**(`lib/cases/get-recent-cases-for-owner.ts` 신규): "최근 리서치" 패널(owner-scope 조회, 최대 3건) + "분석 상태" 4단계 정적 패널. `NewCasePage`가 자체 `getCurrentSession()`으로 async Server Component 전환 — `/cases/new`는 이 시점부터 의도적으로 Dynamic 렌더링
- **실재하는 예외 화면**(`app/not-found.tsx`, `app/cases/[caseId]/not-found.tsx` 신규): 전역 404(App Shell 미적용) + 사건-없음/미소유 통합 404(App Shell 적용, 정보 은닉 — 두 시나리오 텍스트 완전 동일)
- **반응형 + 모바일 드로어 접근성**(`app-shell-chrome.tsx` 신규): 1024px 우측 레일 세로 배치, 390px 오프캔버스 드로어(포커스 트랩 닫힌 루프, 배경 `inert`, ESC/스크림/nav 링크 닫기, 리사이즈 시 자동 닫힘)
- **전문가 피드백 화면 Pencil 구조 마이그레이션**(Round 5): native `<select>` → 카드형 버튼 그룹(`OptionButtonGroup`, `role="radiogroup"`), 사건 메타 스트립, 8종 이슈 타입 빠른 추가 체크박스, 개별 근거자료 카드 리스트, 섹션별 완료 아이콘 + 제출 상태 아이콘 추가. 사용자 승인된 의도적 편차 3건(전용 라우트 미신설, "실제 결과" 자유 텍스트 유지, "이미 제출됨" 사전확인 미도입)

**검증**: 24개 요구사항(REQ-001~~024) 전부 구현, 24개 인수 기준(AC-001~~024 + letter-suffixed sub-AC) 전부 코드 레벨/실측으로 만족. plan-auditor 2회 실행(round1 PASS 0.97 → round2-revision PASS 0.94). Round 1~5 외부 독립 재검토에서 발견된 결함(빌드 실패 dead-code, 모바일 Footer 레이아웃 붕괴, mobile-drawer-focus 회귀, 로그인/사건입력/전문가피드백 Pencil 시각 격차)을 모두 실측 Gap Matrix 기반으로 해소했으며, INSUFFICIENT claim 상태는 결정론적 fixture로 `report.content`를 직접 주입해 실제 프로덕션 렌더링 분기를 통과시킨 화면을 캡처했습니다(로컬 결정론적 AI provider 환경의 알려진 한계 — 정상 사용자 플로우로는 자연 발생하지 않음). `pnpm test`(59 test files, 395 tests)/`pnpm lint`/`pnpm build`(`/cases/new` 의도적으로 Dynamic 전환)/`pnpm format:check`(신규 위반 0건) 전부 exit 0, `pnpm test:e2e` 3회 연속 exit 0(매회 로그인 rate-limit 충돌로 1개 스펙이 1회 재시도 후 통과 — flaky debt로 기록, 근본 해결은 후속 SPEC 후보). PRESERVE 대상(`lib/db/schema.ts`, `lib/validation/case-input.ts`, `lib/feedback/schema.ts`, `lib/cases/create-case.ts`, `lib/feedback/submit-feedback.ts`, `lib/pipeline/**`, `lib/ai/**`, `db/**`, `app/layout.tsx`, `e2e/helpers.ts`)는 전체 SPEC 기간 동안 zero-diff로 확인됐습니다. 후속 SPEC 후보 2건: 모바일 리포트/피드백 정보구조(IA) 분리, E2E 인증 fixture/storageState 재사용(rate-limit flaky debt 근본 해결).

**참고**: `.moai/specs/SPEC-UI-MIGRATION-001/`

### Added — SPEC-PILOT-VISUAL-001 파일럿 비주얼 리스킨 — Pencil 디자인(claimradar-ui.pen) 재현, 기능/데이터 무변경

확정된 Pencil 디자인(`design/claimradar-ui.pen`)을 `사건 입력`/`Research Report`/`전문가 피드백` 3개 화면에 순수 시각 계층에서만 재현했습니다. 신규 기능·API·DB·AI 파이프라인 변경 없음 — SPEC-PILOT-UX-001로 사용성이 완성된 흐름의 룩앤필만 교체합니다.

- **디자인 토큰 + 타이포그래피**(`app/globals.css`): 기존 `@theme inline` 블록에 33개 색상 토큰(`--color-bora-*`/`--color-app-*` 네임스페이스, 기존 shadcn 토큰과 충돌 없음) + 타이포그래피 스케일(H1/H2/H3/Body/Body S/Meta/Label S) 추가. `pretendard` npm 패키지 도입
- **신규 앱 셸**(`app/cases/layout.tsx`, `app/cases/case-shell-nav.tsx`): 다크 사이드바 + 탑바를 `app/cases/` 라우트 그룹에만 적용 — `app/layout.tsx`/`app/page.tsx`/`app/login/**`은 폰트 import를 포함해 완전한 zero-diff PRESERVE. Pretendard(`next/font/local`)와 BORA 워드마크 전용 Manrope(`next/font/google`)를 이 레이아웃 내부에서만 로드. 사이드바 nav 3항목("사건 입력"/"리서치 리포트"/"전문가 피드백")은 DB/API 조회 없이 현재 pathname만으로 결정론적으로 활성/비활성 렌더링
- **공유 프레젠테이션 컴포넌트**(`components/ui/status-badge.tsx`, `chip.tsx`, `notice.tsx`, `components/evidence-item.tsx`): 기존 shadcn 프리미티브로 표현 불가능한 시각 패턴만 신규 도입해 `claim-status` pill과 evidence 참조 렌더링에 재사용 — 기존 testid/`data-status` 속성 전부 보존
- **3개 화면 재스타일**: 사건 입력(2컬럼 레이아웃), Research Report(사건 요약 패널 + claim 카드 + 우측 레일), 전문가 피드백(번호 매김 섹션 패턴, native `<select>`·동적 `missedIssues` 배열 UI 그대로 유지) — 각 화면의 기존 데이터 계약·테스트 셀렉터·접근성 속성(label 연관, `role="status"`, `aria-live`, focus 동작) 완전 보존

**검증**: 24개 요구사항(REQ-PILOT-VISUAL-001~~024) 전부 구현, 25개 인수 기준(AC-PILOT-VISUAL-001~~024 + 서브레터 006b/020b/021b, AC-013 의도적 결번) 전부 코드 레벨로 만족. plan-auditor 감사 3회 실행(iteration 1 FAIL(0.63, GEARS 모달리티 위반) → iteration 2 PASS(0.92) → 외부 독립 리뷰 6개 블로커 대응 후 iteration 3 PASS(0.92, 회귀 없음)). M1~~M6 전 마일스톤에서 `pnpm test`(335/335)/`pnpm test:e2e`(4/4)/`pnpm lint`/`pnpm build`/`pnpm format:check` exit 0 통과를 오케스트레이터가 매 마일스톤 최종 커밋에 대해 독립 재실행으로 재확인했으며, `app/layout.tsx`/`app/page.tsx`/`app/login/**`의 zero-diff를 전체 M1~~M6 범위(`git diff --stat`)로 재검증했습니다. 오케스트레이터가 Playwright로 실제 `pnpm dev` 인스턴스에 대해 1440px/1280px 두 뷰포트에서 3개 화면 전체를 수동 시각 확인(가로 오버플로/사이드바-콘텐츠 겹침 없음). 신규 런타임 의존성 없음(pretendard 패키지 추가 제외), 서버 write-path·DB 스키마·API 계약 변경 없음.

**참고**: `.moai/specs/SPEC-PILOT-VISUAL-001/`

### Added — SPEC-PILOT-UX-001 파일럿 사용성 개선 — 사건 입력→분석 대기→리포트 검토→피드백 제출 흐름

이미 기능적으로 완성되어 있던 `사건 입력 → Gemini 분석 대기 → ResearchReport 검토 → 구조화 피드백 제출` 흐름(SPEC-RESEARCH-001/SPEC-GEMINI-RUNTIME-001/SPEC-EVIDENCE-001/SPEC-FEEDBACK-001의 산출물)을, 신규 비즈니스 기능 없이 UI/UX 계층에서만 다듬어 소수 전문 손해사정사가 비공개 파일럿에서 일상적으로 실사용 가능하게 만들었습니다.

- **사건 입력 대기 상태 강화**(`case-input-form.tsx`): 제출 버튼 텍스트 변경뿐 아니라 별도의 시각적 진행 표시(`role="status" aria-live="polite"`)를 렌더링하고, 4개 입력 필드 전부를 제출 버튼과 함께 비활성화
- **클라이언트 단일 흐름(single-flight) 제출 가드**(`case-input-form.tsx`/`feedback-form.tsx`): `useRef` 기반으로 더블클릭·빠른 재클릭 시 중복 요청을 차단 — 서버측 DB 기반 idempotency(nonce+unique index)가 `createCase`의 `validate → runPipeline → insert` 실행 순서상 동시 요청 경합을 실제로 막지 못한다는 외부 독립 리뷰 지적에 따라 범위에서 제외하고 순수 클라이언트측 가드로 재정의(사건/피드백 모두 서버측 write-path·요청 스키마 변경 없음)
- **리포트 요약 배너**(`page.tsx`): 기존 5개 카드보다 먼저 렌더링되는 요약 배너를 추가해 진단명·장해 부위와 `verifiedClaims` 집계 검증 상태("N건 중 M건 근거 확인, K건 판단 불충분")를 스크롤 없이 노출 — 기존 개별 주장별 `claim-status` pill은 그대로 유지
- **근거자료 표시 개선**(`page.tsx`/`feedback-form.tsx`): `evidence` SELECT 프로젝션을 확장해 기존 `title`/`sourceUrl`뿐 아니라 `evidenceType`/`issueTypes`도 함께 조회·렌더링(두 컬럼 모두 SPEC-EVIDENCE-001에서 이미 존재 — 신규 마이그레이션 없음)하고, `sourceUrl`을 원시 텍스트 대신 클릭 가능한 `<a target="_blank" rel="noopener noreferrer">` 링크로 렌더링
- **피드백 폼 사용성 개선**(`feedback-form.tsx`): 성공 시 시각적 확인 메시지를 표시하고 해당 마운트 인스턴스에서 제출 버튼을 계속 비활성 유지(새 인스턴스 마운트 시에는 재허용 — SPEC-FEEDBACK-001의 append-only 정책과 일치); 검증 실패 시 `Object.values(...).flat().join(" ")`로 뭉쳐 표시하던 필드 오류를 `toFieldErrors`의 실제 최상위 키(`overallRating`/`overallComment`/`missedIssues`/`claimAssessments`/`evidenceAssessments`/`outcome`/`_form`) 기준 필드별 개별 표시로 교체하고, 이 경우 가드를 리셋해 재제출을 허용; `action` 호출 예외/reject 시에도 가드를 리셋하고 폼-레벨 오류를 표시(unhandled promise rejection 없음); 다섯 콘텐츠 영역(전체 평가/누락 쟁점/개별 주장 평가/개별 근거자료 평가/실제 결과)을 구획선으로 시각적으로 구분
- **명시적 UI 상태**: 사건 상세 화면의 `verifiedClaims`/인용 근거자료 빈 배열에 대한 명시적 빈 상태 문구 추가(기존 `reviewTargets`/`missingMaterials`/`uncertainty` 패턴과 동일); 사건 입력 폼의 `fetch` 호출에 `.catch()`를 추가해 네트워크 수준 실패를 사람이 읽을 수 있는 오류 메시지로 처리(unhandled promise rejection 없음); 저장소 전체에 하나도 없던 Next.js App Router `error.tsx` 오류 경계를 `app/cases/[caseId]/`에 신설(재시도 버튼이 `reset()` 호출)
- **안전 문구·개인정보 보존**: 이번 SPEC이 도입·수정한 UI 문구 어디에도 보험금 지급 가능성 확정 서술이 없으며, 신규 개인정보 수집 필드나 기존 PII 차단 검증(`piiFreeText`) 약화 없음 — 어떤 스키마도 수정하지 않음

**검증**: 16개 요구사항(REQ-PILOT-UX-001~~016) 전부 구현, 16개 인수 기준(AC-PILOT-UX-001~~016) 전부 코드 레벨로 만족. 사용자가 실제 브라우저에서 사건 입력→리포트 렌더링→피드백 제출 성공 메시지→콘솔 오류 없음까지 수동 스모크로 직접 확인했으며, 성공 후 제출 버튼이 계속 비활성 유지되는지는 자동 unit/e2e 테스트(`feedback-form.test.tsx` AC-010, `case-flow.spec.ts`)로 확인했습니다. plan-auditor 감사 7회 실행(iteration 3 FAIL(0.82, GEARS 단일 트리거 형식 위반) → iteration 4 FAIL(0.875, 잔존 위반) → iteration 5 PASS(0.98) → pre-run 정합성 보정 후 iteration 6 FAIL(0.74, REQ-010 응답 분기 위반 + M4 커버리지 갭) → iteration 7 PASS(0.92)), 매 결과를 축소·과장 없이 정직하게 기록. `pnpm test`(48 test files, 335 tests)/`pnpm test:e2e`(4/4)/`pnpm lint`/`pnpm build` 전체 exit 0 통과. `case-input-form.tsx`(79.5%)/`feedback-form.tsx`(61.6%)/`page.tsx`(72.7%) 3개 파일의 statement coverage가 프로젝트 목표(85%)에 미달 — 이 SPEC의 인수 기준에 요구되지 않는 기존 상호작용 분기(쟁점 추가/제거, 개별 평가 select, 실제 결과 필드)로 사용자 승인 하에 갭으로 남깁니다. 신규 런타임 의존성 없음, 서버 write-path(`lib/cases/create-case.ts`/`lib/feedback/submit-feedback.ts`)·스키마(`lib/db/schema.ts`) 변경 없음.

**참고**: `.moai/specs/SPEC-PILOT-UX-001/`

### Added — SPEC-FEEDBACK-001 리포트 단위 전문가 구조화 피드백 (Gold Dataset 축적 기반)

손해사정사/보험 전문가가 특정 사건의 AI 리서치 리포트(`reports` 테이블)에 구조화된 피드백을 남길 수 있도록, 기존 `feedback` 테이블(전체 사건 대상 자유 텍스트 1개 필드)을 리포트 단위 구조화 스키마로 확장했습니다. `case → report → expert feedback` 흐름의 마지막 단계만 다루며, Gold Dataset 자체의 추출·집계는 후속 SPEC으로 명시적으로 미룹니다.

- **⚠️ 파괴적 스키마 변경**: `feedback` 테이블의 기존 자유 텍스트 `content` 컬럼을 제거하고 `reportId`(NOT NULL, `reports.id` FK)·`payload`(JSON, 구조화 스키마) 중심으로 교체(`db/migrations/0004_calm_paladin.sql`) — 기존 `feedback` 행은 마이그레이션 과정에서 폐기됩니다. 레거시 5-컬럼 형태 데이터가 있는 DB에 대해서도 마이그레이션이 exit 0으로 성공하고 `cases`/`reports`/`user` 등 무관한 테이블은 손상 없이 보존됨을 별도 fixture로 검증
- **구조화 피드백 payload Zod 검증**(`lib/feedback/schema.ts`, `reportFeedbackPayloadSchema`): 전체 평가(`overallRating`, 필수 3값 enum) + 선택적 누락 쟁점(`missedIssues[]`, `issueType`은 `lib/pipeline/types.ts`의 `QUERY_ISSUE_TYPES`를 SSOT로 재사용) + 개별 주장(claim) verdict(`claimAssessments[]`, `claimIndex` 유일성 검사) + 개별 근거자료(evidence) verdict(`evidenceAssessments[]`, `evidenceId` 유일성 검사) + 선택적 실제 결과 기록(`outcome`, all-or-nothing 계약 — 한쪽만 채워지면 검증 실패, 둘 다 공백이면 전체 생략) — 모든 자유 텍스트 필드는 `lib/validation/case-input.ts`의 `piiFreeText`를 재사용해 주민등록번호·전화번호 형식을 구조적으로 차단하고, 스키마에 없는 최상위 키는 `.strict()`로 거부
- **write-path 동적 검증**(`lib/feedback/submit-feedback.ts`, `submitReportFeedback()`): `reportId`가 속한 사건의 `ownerUserId`와 호출자가 일치하는지 검사(`getCaseForOwner()`와 동일한 소유권 앵커 원칙) + `claimIndex`가 저장된 리포트의 `verifiedClaims` 길이 범위를 벗어나면 거부 + `evidenceId`가 `evidence` 테이블에 실존하는지 검사(existence-only — 실제 인용 여부는 교차검증하지 않는 사용자 명시적 단순화 결정). `caseId`는 오직 `reportId → reports.caseId`로 서버가 도출하며 함수 시그니처에 파라미터로 받지 않음(cross-case spoofing 방지) — 성공 결과(`{success, feedbackId, caseId}`)의 `caseId`도 이 서버 도출 값
- **한 사건에 리포트가 2개 이상 있는 경우의 결정론적 선택**(`lib/cases/get-case-for-owner.ts`): `createdAt DESC`(동일 시각이면 `id DESC`) 정렬로 항상 최근 리포트 하나만 선택하고, 화면 표시(`report`)와 피드백 제출 대상(`reportId`)을 동일한 단일 쿼리 행에서 함께 도출해 표시-제출 값 불일치를 구조적으로 방지
- **UI 완전 대체**: 사건 상세 화면(`app/cases/[caseId]/`)의 옛 자유 텍스트 피드백 폼을 전체 평가·누락 쟁점 추가·주장별/근거자료별 verdict 선택·실제 결과 입력을 지원하는 구조화 폼(`feedback-form.tsx`)으로 완전히 교체 — 주장/근거자료가 0개인 리포트에서는 해당 verdict 컨트롤이 0개 렌더링되는 것이 정상 동작이며, "실명·상세 주소·주민등록번호·전화번호·의료·보험 원본 문서 내용은 입력하지 마세요" 안내 문구를 화면에 표시
- **append-only 정책**: `(reportId, userId)` 조합에 유일성 제약을 두지 않아 동일 사용자가 동일 리포트에 여러 번(최초 리뷰 + 이후 실제 결과 확인 등) 제출 가능하며, 기존 피드백 행을 수정·삭제하는 API/Server Action은 제공하지 않음
- **post-run 버그 수정**: 외부 독립 리뷰에서 `outcomeSchema`의 preprocess가 "공백 문자열"과 "잘못된 타입(number/null/object)"을 동일하게 취급해, (a) 잘못된 타입 입력이 조용히 `outcome` 생략으로 정규화되어 검증을 통과하거나 (b) 부분 outcome(`description`만 공백, `confirmedAt`만 유효)이 `piiFreeText`의 `min(1)`이 trim 없이 길이만 검사하는 특성 때문에 통과하는 결함 2건을 발견 — RED(결함 재현 테스트 2건 실패 확인) → GREEN(타입 검사와 공백 판정을 분리하는 헬퍼 3개 추가 + `description`에 trim 기반 `.refine()` 추가) 순서로 수정하고 회귀 테스트 3건 추가

**검증**: 15개 요구사항(REQ-FEEDBACK-001~~015) 전부 구현, 16개 인수 기준(AC-FEEDBACK-001~~016) 전부 코드 레벨로 만족. plan-auditor 감사 4회 실행(iteration 1 PASS(0.92) → 외부 리뷰 11건 반영 후 iteration 2/3 PASS(0.97) → 3차 정합성 보정 후 iteration 3 FAIL(0.90, progress.md 시제 오류 1건) → 수정 후 최종 게이트 PASS(0.97)), 매 결과를 축소·과장 없이 정직하게 기록. `pnpm test`(44 test files, 316 tests)/`pnpm lint`/`pnpm format:check`/`pnpm build`/`pnpm test:e2e`(4/4) 전체 exit 0 통과(post-run 버그 수정 반영 후 재확인). 신규 런타임 의존성 없음.

**참고**: `.moai/specs/SPEC-FEEDBACK-001/`

### Added — SPEC-EVIDENCE-001 근거자료(evidence) corpus 확장 + Retriever 쟁점 중심 ranking + counterEvidenceIds=[] 원인 진단

실 Gemini smoke 2회(`gemini-smoke-20260827.md`, `gemini-runtime-smoke-20260828.md`)에서 `Skeptic.counterEvidenceIds`가 매번 빈 배열로 관측된 현상에 대응해, (축1) evidence corpus를 담보×쟁점 기준으로 검증 가능하게 확장하고 (축2) counterEvidenceIds=[] 원인을 corpus/Retriever/prompt/model behavior 네 갈래로 분해해 관측 가능하게 만들었습니다. vector DB를 도입하지 않고 현재 DB + TypeScript 규칙 기반 구조 위에서 설계했습니다.

- **Evidence 스키마 확장**: `evidence` 테이블에 `issueTypes`(8개 `QueryIssueType`의 부분집합, JSON 배열) 컬럼 1개만 추가(`db/migrations/0003_sad_hitman.sql`) — `sourceIdentifier`/`sourceDate`/`keywords`는 이 SPEC에서 도입하지 않음(dedup은 동일 `sourceUrl` + 정규화된 content 동일성 기준으로 수행). 담보(INJURY_DISABILITY/DISEASE_DISABILITY)×issueType(8개) 16칸 coverage matrix(`coverage-matrix.md`)를 신설
- **Candidate Eligibility + issueType 중심 ranking (Retriever 전략 B 채택)**: `lib/pipeline/evidence-retriever.ts`에 issueType exact match를 포함한 candidate eligibility 전략(전략 B)을 신설해 프로덕션 채택 — hard filter는 도입하지 않고 inclusion-OR/정렬 신호로만 사용. 7개 벤치마크 케이스에서 전략 B가 전략 A 대비 Recall/Hit/Precision 3개 지표 전부 우세함을 실측(비 non-regression 계약 충족)으로 확인, `retrieveEvidence()`는 strategy 값과 무관하게 항상 결정론적 `computeScore()` + `score desc || id asc` tie-break 사용(REQ-EVIDENCE-012)
- **true baseline 측정 인프라 분리**: M2는 `evidence-m2-snapshot.json`의 10건 immutable snapshot으로 eligibility-only exploratory A/B 비교를 수행하고, M4d는 최종 21건 production corpus를 freeze한 동일 입력 위에서 benchmark-only `trueBaselineRetrieveEvidence()`/`computeBaselineScore()` pure 함수(production 경로에서 호출하지 않음)와 production Strategy B를 비교한다 — "동일 corpus 위 알고리즘 개선 효과(algorithm effect)"와 "corpus 확장 효과(corpus expansion effect)"를 혼동하지 않도록 M2와 M4d를 코드/문서 양쪽에서 명확히 분리
- **counterEvidenceIds=[] 진단 harness**: `lib/pipeline/evidence-diagnostic.test.ts` — A(corpus에 counter-relevant evidence 존재)/B(Retriever가 candidate로 반환)/C-전제조건(challenge() 프롬프트에 해당 evidence 포함) 3단계 fixture self-test 신설. 2026-08-28 smoke의 실제 case 입력을 replay해 8개 쿼리 중 5개는 corpus/Retriever 단계에서 candidate가 0건(A/B와 정합), 3개는 candidate가 있었으나 Skeptic의 실제 선택 여부는 LLM 재호출 없이 확인 불가 — "corpus/Retriever/prompt/model behavior 미확정"이라는 결론을 과장 없이 유지
- **Evidence corpus 확장 + 재감사**: 기존 10건 전체 재감사(1건 문구 수정, POLICY→OTHER downgrade 1건 포함) + 신규 확장으로 corpus를 21건으로 확대(`evidence-source-audit-manifest.md`), 7개 BenchmarkCase의 ground truth를 human review로 확정(M4c freeze)
- **정직한 미충족 항목 명시 (best-effort로 공식 하향)**: DISPUTE_CASE(분쟁조정 사례) evidenceType은 FSS/KNIA/FCSC 공식 소스가 텍스트 추출 가능한 형식(HTML)으로 공개되어 있지 않아 3회 세션에 걸친 조사에도 0건 — 사용자 승인을 받아 plan.md M4b 요구를 "최소 1건 필수"에서 "best-effort(0건도 AC 충족)"로 정식 하향. 지어낸 데이터나 사례는 어디에도 추가하지 않았습니다
- **post-run 정합성 보정**: 벤치마크 baseline 배선 결함(전략 A가 일시적으로 `computeBaselineScore`/tie-break-없음 정렬을 잘못 사용해 REQ-EVIDENCE-012를 위반했던 버그)을 발견 즉시 재수정, coverage-delta 리포트를 append-correction 방식에서 단일 최종본으로 재작성

**검증**: 25개 요구사항(REQ-EVIDENCE-001~~025) 전부 구현, 25개 인수 기준(AC-EVIDENCE-001~~021/026 + AC-EVIDENCE-016 서브레터 a/b/c/d) 전부 코드 레벨로 만족. plan-auditor 감사 7회 실행(iteration 1 FAIL → iteration 2/3 PASS(0.923) → 배선 결함 발견 후 iteration 5 PASS(0.923) → iteration 6 FAIL(기존 미해결 결함) → D1/D2 수정 후 iteration 7 PASS(1.0)), 매 결과를 축소·과장 없이 정직하게 기록. `pnpm test`(42 test files, 289 tests)/`pnpm lint`/`pnpm format:check`/`pnpm build`/`pnpm test:e2e`(4/4) 전체 exit 0 통과(Node 22 + pnpm 환경 실측, 이번 세션 재확인). 신규 런타임 의존성 없음.

**참고**: `.moai/specs/SPEC-EVIDENCE-001/`, `.moai/reports/coverage-delta-m4e.md`, `.moai/reports/evidence-source-audit-manifest.md`

### Added — SPEC-GEMINI-RUNTIME-001 무료 티어 파일럿 안정화 (역할별 모델 분리·호출 배치·rate 페이싱·동시성 제한·재시도 복원력)

실 Gemini 프로덕션 스모크 테스트(`.moai/reports/gemini-smoke-20260827.md`)에서 드러난 4가지 근본 원인(모델 가용성 실패, 무료 tier RPM 쿼터 소진으로 인한 429, Skeptic 반박 근거 공백, 편협한 재시도)에 대응해 무료 티어 소수 파일럿 단계의 **안정성**을 높였습니다. 새 기능이 아니라 기존 6단계 파이프라인의 Gemini 호출 방식과 복원력을 재설계하는 작업입니다.

- **역할별 모델 분리**: Researcher는 `GEMINI_RESEARCH_MODEL`(기본값 `gemini-3.6-flash`), Skeptic·Verifier는 `GEMINI_FAST_MODEL`(기본값 `gemini-3.5-flash-lite`)을 사용 — `provider-factory.ts`가 `GeminiProvider` 생성 이전에 model 문자열을 확정하고, 정상 앱 경로는 `GeminiProvider` 자신의 내부 폴백에 의존하지 않음
- **Gemini 호출 배치**: Researcher·Skeptic이 쿼리/finding 개수만큼(N회) 호출하던 것을 사건당 1회 배치 호출로 축소 — 정상 사건 1건당 핵심 논리적 Gemini 호출이 쿼리/finding 개수와 무관하게 약 3회(Researcher×1 + Skeptic×1 + Verifier×1)로 고정. 배치 전환 이후에도 Researcher finding의 evidence 그라운딩 계약(`supportingEvidenceIds.length >= 1`, 위반 항목만 개별 폐기)은 파싱 후 항목별 업무 규칙 검증으로 그대로 유지
- **Free-tier self-imposed rate scheduler** (`lib/ai/rate-scheduler.ts` 신규): 확정된 model ID 단위로 독립적인 자체 요청 예산(RPM budget)으로 요청 시작 간격을 페이싱하며, 두 역할이 같은 model ID를 가리키면 하나의 스케줄러를 공유하고 `min(researchBudget, fastBudget)`을 적용. `waitForSlot()`은 최초 시도뿐 아니라 429/503 재시도로 인한 모든 후속 실제 호출 시도 직전에도 호출됨. 정상 앱 경로는 프로세스 생애주기 싱글턴(`getDefaultLLMProviders()`)을 통해 이 페이싱 상태를 사건과 사건 사이에도 계속 이어감
- **동시 사건 제한(프로세스 로컬)**: 순수 인메모리 Promise 체인 뮤텍스로 활성 Gemini 파이프라인을 1개로 직렬화(`pipelineChain`, `lib/pipeline/index.ts`) — 여러 서버리스 인스턴스를 아우르는 분산 락이 아님을 명시
- **429/503 재시도 복원력**: Gemini 오류 응답의 `RetryInfo.retryDelay` 힌트를 실제로 읽어 반영하고, 503도 429와 동일한 재시도 경로에 포함하되 총 재시도 횟수와 총 대기 시간 모두에 상한을 둠
- **데이터 취급 계약 재확인**: `caseInputSchema`가 "비식별을 보증"하지는 않는다는 사실을 정정 문서화하고, Google 무료 tier 데이터가 사람 검토·제품 개선에 사용될 수 있음을 명시하며, 파일럿 단계 데이터 취급 운영 계약(합성/사전 비식별화 사건만 사용, 실 PII·원본 문서 금지)을 `.moai/docs/runtime-runbook.md`에 신설
- **스모크 리포트 과잉주장 정정**: `.moai/reports/gemini-smoke-20260827.md`의 관측 범위를 넘어서는 두 문구(모델 플랫폼 전체 단종 단정, corpus 부족 확정 원인 서술)를 hedge된 정정문으로 교체

**검증**: 25개 요구사항(REQ-GEMINI-RUNTIME-001\~025) 전부 구현, 35개 인수 기준(25개 최상위 AC-GEMINI-RUNTIME-001\~025 + 10개 서브레터 AC 009a/014a/016a/016b/018a/021a/021b/022a/022b/022c) 전부 코드 레벨로 만족. `pnpm test`(250/250 tests)/`pnpm lint`/`pnpm format:check`/`pnpm build`/`pnpm test:e2e` 전체 exit 0 통과. 신규 런타임 의존성 없음(`package.json` diff 없음).

**참고**: `.moai/specs/SPEC-GEMINI-RUNTIME-001/`, `.moai/docs/runtime-runbook.md`

### Added — SPEC-RESEARCH-001 6단계 리서치 파이프라인 evidence-first Gemini 전환

SPEC-SCAFFOLD-001이 구축한 6단계 파이프라인(CaseNormalizer → QueryPlanner → EvidenceRetriever → Researcher → Skeptic → Verifier)의 mock/trivial 로직을 실제 evidence-first Gemini 구조화 출력 기반 로직으로 교체했습니다. 새 기능 추가가 아니라, "타입 계약은 있지만 실제로 근거자료를 검증하지 않는" 파이프라인을 "근거자료 없이는 소견을 만들지 않는" 파이프라인으로 바꾸는 대체(replacement) 작업입니다.

- **QueryPlanner 규칙 기반 재작성**: 사건 담보 영역(`CoverageDomain`: INJURY_DISABILITY/DISEASE_DISABILITY)당 최소 3종(장해부위/장해등급기준/인과관계 또는 진단명/장해등급기준/인과관계) 쿼리를 생성 — 이전의 고정 2개 쿼리 스텁을 대체
- **EvidenceRetriever 관련성 필터링**: 담보 영역 일치 AND 키워드 매칭으로 실제 DB 조회 필터링/스코어링 도입, seed evidence 4→10건으로 확장(웹 검증 가능한 실제 법령/판례 4건 포함)
- **`LLMProvider.generateStructured()` 확장**: Gemini adapter가 `responseJsonSchema`로 구조화 출력을 반환하고 Zod `safeParse`로 재검증 — Researcher/Skeptic/Verifier 세 단계 모두 provider를 필수 인자로 받도록 전환(결정론적 provider는 E2E/테스트 전용, 프로덕션 경로는 `provider-factory.ts`가 유일하게 선택)
- **Researcher/Skeptic evidence-first 재작성**: `findingId`를 LLM이 지어내지 않고 코드가 직접 부여, evidence가 없거나 구조화 검증에 실패하면 소견을 억지로 만들지 않고 INSUFFICIENT로 처리
- **Verifier 의미 검증 도입**: evidence-ID 존재 여부만 확인하던 기존 검증에 더해, evidence 내용이 claim/counterArgument를 실제로 뒷받침하는지 LLM 기반 의미 검증(semantic verification)을 추가 — 검증에 실패한 evidence는 최종 리포트에서 제외(fail-closed)
- **공용 safety-validator 신설** (`lib/pipeline/safety-validator.ts`): 보험금 지급확정·확률 표현 등 근거 없는 단정적 문구를 정규식으로 차단, Researcher/Skeptic 출력과 Verifier의 최종 안전 스캔 양쪽에 defense-in-depth로 적용
- **UI 반영**: `page.tsx`에 VERIFIED/INSUFFICIENT 배지, 판단 불충분 사유 섹션, 반론(counterArgument)의 뒷받침·반박 근거 표시 추가
- **post-run 코드 리뷰 3라운드**: M1~M6 구현 완료 이후 별도 SPEC을 만들지 않고 동일 SPEC에서 처리한 merge-blocking 결함 수정 — 1차(safety-validator 신설, Verifier 의미 검증 1단계, UI 배지, evidenceType 라벨 정합화), 2차(Verifier 의미 검증을 Skeptic 반론까지 확장, safety-validator를 Skeptic 출력과 status 무관 최종 스캔에 적용, 퍼센트 차단 규칙을 실제 지급확률 패턴으로 좁힘), 3차/최종(의미검증 실패 시 claim/counterArgument evidence 비우기 대칭화, 최종 safety scan의 status 게이팅 제거, 결정론적 테스트 provider의 evidence-ID 추출 정규식 부수 결함 수정)

**검증**: 25개 요구사항(REQ-RESEARCH-001~025) 전부 구현, 25개 인수 기준(+011a/b, 019a/b 서브레터) 전부 코드 레벨로 만족. `pnpm test`(36 files, 208 tests)/`pnpm lint`/`pnpm format:check`/`pnpm build`/`pnpm test:e2e`(4/4: 로그인·사건입력·테넌트 격리) 전체 exit 0 통과.

**참고**: `.moai/specs/SPEC-RESEARCH-001/`

### Added — SPEC-RUNTIME-001 실제 런타임 활성화 (DB 연결·시드·테스터 프로비저닝·E2E 검증)

SPEC-SCAFFOLD-001이 구축한 scaffold를 실제로 로컬에서 기동 가능한 상태로 전환했습니다(M1/M3/M4/M2/M5/M6 완료). 이번 SPEC은 새 기능이 아니라 "코드는 있지만 실행 경로가 검증된 적 없는" 상태를 "실제로 DB에 붙어 로그인하고 E2E가 통과하는" 상태로 바꾸는 활성화 계층입니다.

- **목적별 환경변수 검증 계약**: `lib/env.ts`가 `db`/`provision`/`app`/`e2e` 4개 실행 목적별로 필요한 환경변수만 검증(스코프 매트릭스는 `.env.local.example`과 `.moai/docs/runtime-runbook.md` §2 참고) — 불필요한 변수까지 요구하지 않음
- **명시적 로드 부트스트랩**: `scripts/cli-bootstrap.ts` — 마이그레이션/시드/테스터 생성 CLI가 셸 `export` 없이 `.env.local` 파일을 직접 로드
- **부팅 시점 fail-fast**: `instrumentation.ts` — Next.js 서버 부팅 시 환경변수 검증을 즉시 실행해 잘못된 설정으로 앱이 조용히 뜨는 것을 방지
- **마이그레이션 적용 CLI**: `pnpm db:migrate`(`scripts/db-migrate.ts`) — 재실행 안전(이미 적용된 마이그레이션은 추적 테이블 기준으로 스킵)
- **시드 적재 CLI**: `pnpm db:seed`(`scripts/db-seed.ts`) — `id` 기준 onConflict로 재실행해도 중복 없음
- **테스터 계정 프로비저닝 CLI**: `pnpm tester:add`(`scripts/provision-tester.ts`) — Better Auth 공식 API(`auth.api.signUpEmail()`)로 초대 전용 테스터 계정 생성, 이미 존재하는 이메일은 스킵
- **실제 Playwright E2E 스위트**: `pnpm test:e2e`(`scripts/run-e2e.ts` + `e2e/*.spec.ts`, `playwright.config.ts`) — 로그인·사건입력·피드백·테넌트 격리 4개 시나리오를 실제 Chromium으로 검증. 매 실행마다 로컬 파일 DB를 초기화하고 마이그레이션·시드·테스터 A/B 프로비저닝을 자동 수행해, 원격 인스턴스나 개발자의 `.env.local` 데이터에 영향을 주지 않음. 실행 포트는 하드코딩 대신 실행 시점에 빈 포트를 동적으로 탐색(`findFreePort()`)
- **운영자용 런북**: `.moai/docs/runtime-runbook.md` — 준비물부터 E2E 실행까지 순서대로 따라갈 수 있는 절차 문서
- **SPEC-SCAFFOLD-001 스키마/마이그레이션 드리프트 보정**: M2 실행 중 발견된 `account.issuer` 컬럼 누락(Better Auth 1.7.1 요구)을 보정 마이그레이션 1건(`db/migrations/0001_bitter_talon.sql`)으로 해소

**검증**: `pnpm test`(33 files, 139 tests)/`pnpm lint`/`pnpm build`/`pnpm format:check` 전체 통과. 22개 인수 기준(AC-RUNTIME-001~022) 전체 PASS. 독립 보안 리뷰에서 CRITICAL/HIGH 등급 발견 없음.

**참고**: `.moai/specs/SPEC-RUNTIME-001/`, `.moai/docs/runtime-runbook.md`

### Added — SPEC-SCAFFOLD-001 최초 프로젝트 scaffold 및 핵심 아키텍처

보상레이더 MVP의 최초 실행 가능한 프로젝트 scaffold와 핵심 아키텍처를 구축했습니다(M6, M1-M5 완료).

- **프로젝트 초기화**: Next.js App Router + TypeScript strict + Tailwind CSS + shadcn/ui 기본 설정
- **DB 스키마**: Drizzle ORM 스키마(`cases`, `evidence`, `reports`, `feedback`, `allowed_testers`) + Turso/libSQL 클라이언트 배선(`lib/db/`), `drizzle-kit generate` 마이그레이션 생성 확인
- **AI provider abstraction**: 공통 `LLMProvider` 인터페이스(`lib/ai/provider.ts`) + Gemini adapter(`lib/ai/providers/gemini.ts`, `@google/genai@2.18.0`), 429 rate-limit 지수 백오프 재시도 처리
- **인증**: Better Auth 기반 초대 전용(allowlist) 접근 제어(`lib/auth/config.ts`), `proxy.ts` 라우트 가드로 비로그인 사용자를 `/login`으로 리다이렉트, `owner_user_id` 컬럼 기반 사건 데이터 접근 제어
- **PII 입력 검증**: `lib/validation/case-input.ts` Zod 스키마 — 주민등록번호·전화번호·상세주소·의료기록 원본 형식 패턴을 `CaseNormalizer` 호출 이전 단계에서 구조적으로 거부
- **6단계 리서치 파이프라인**: CaseNormalizer → QueryPlanner → Evidence Retriever → Researcher → Skeptic → Verifier의 독립 호출 가능한 타입 계약(`lib/pipeline/`), 목업 구현으로 seed evidence 데이터와 연결된 Research Report end-to-end 생성 검증
- **최소 UI**: 사건 입력 폼(`app/cases/new/`), 사건 상세 + 리포트 뷰 + 전문가 피드백 폼(`app/cases/[caseId]/`), 사건 생성 API route handler(`app/api/cases/`)
- **테스트/린트/포맷 하네스**: ESLint 9 flat config + Prettier + Vitest, `pnpm lint` / `pnpm format` / `pnpm test` 명령 지원

**검증**: `pnpm build`/`pnpm lint`/`pnpm test`(22 files, 71 tests)/`pnpm format:check` 전체 통과. 17개 인수 기준(AC-SCAFFOLD-001~017) 전체 PASS.

**참고**: `.moai/specs/SPEC-SCAFFOLD-001/`
