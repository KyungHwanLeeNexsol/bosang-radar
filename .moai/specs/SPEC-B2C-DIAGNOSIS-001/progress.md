# Progress — SPEC-B2C-DIAGNOSIS-001

## §E.1 Plan-phase Audit-Ready Signal

- spec.md / plan.md / acceptance.md / design.md / research.md 5개 산출물(Tier L) 작성 완료
- GEARS 요구사항 25건(Tier L 상한 25 충족), Given-When-Then 수용 기준 25건(AC-001~AC-025, 상한 25 충족) 작성 — 2026-09-18 운영자 9건 검토 반영으로 24건 → 25건 상한 도달; 이후 plan-auditor iteration 1 피드백(D5)을 반영해 구 AC-025b(프로덕션 빌드 검증)를 "Quality Gate 기준" 섹션으로 이관하고 구 AC-025a를 AC-025로 정리 — 실질 26건 → 25건으로 재조정
- `### Out of Scope —` 하위 제목 6개 + bullet 작성(OutOfScopeRule lint 대비)
- 코드베이스 조사(`research.md`) 근거로 신규 의존성 없이 구현 가능함을 확인(`@base-ui/react` dialog/drawer 기존 설치분 재사용)
- 2026-09-18: 이 세션에서 운영자 9건 검토 사항(프로덕션 mock 노출 가드, 동의 상세 문구 확정 게이트, Suspense 경계, PII 2단계 검증, devStep 가드 플래그 교체, 반응형 결정 확정, 4갈래 범위 정리)을 spec.md/plan.md/acceptance.md/design.md에 반영 완료
- **plan-auditor 검토 이력**: iteration 1(2026-09-18, 0.80, FAIL) → iteration 2(0.92, FAIL — Retry Loop Contract 회귀 규칙) → iteration 3(0.92, PASS, 감사 대상 커밋 `a2d6c69`) → iteration 4(0.91, FAIL — STOP 신호, design.md blocking 결함 D1/D2/D3, 감사 대상 커밋 `022dcd5`) → iteration 5(0.95, **PASS**, D1/D2/D3 해소 확인, 감사 대상 커밋 `700f9e7`). 상세 근거는 §G 참고. 로컬 plan-audit 보고서(`.moai/reports/plan-audit/SPEC-B2C-DIAGNOSIS-001-review-{1..5}.md`)는 저장소 정책상 `.gitignore` 대상이며 참고 경로로만 기록한다. 표준 3회 한도를 iteration 4·5에서 2회 초과했으며 두 번 모두 사용자 명시 승인 하에 진행했다. 이 SPEC은 plan-audit 게이트를 최종 통과했다 — Implementation Kickoff Approval(사용자 최종 run-phase 착수 승인)은 이 PASS와 별개이며 대체되지 않는다.

## §E.2 Run-phase Evidence

### M1~M9 — 기준선 확인부터 커버리지 보강까지 (manager-lead 통합 정리)

#### Claim

Milestone 1~9(plan.md §F)이 순차 위임으로 구현 완료되었다 — 공개 라우트/진단 shell(플래그 게이트, M2), 기본 진단 입력(M3), 필수 동의 Modal/Bottom Sheet(M4), 추가 질문(M5), 진단중/결과없음/오류 상태(M6), 모바일 반응형(M7), 접근성(M8), Vitest 커버리지 보강(M9). 커밋: `4de3d41`(M2) → `6bd0220`(M3) → `11d1350`(M4) → `869dcea`(M5) → `777226b`(M6+M7) → `791c926`(M8) → `5fe7eeb`(M9), 브랜치 `plan/SPEC-B2C-DIAGNOSIS-001`.

#### Evidence

- Vitest 전체 스위트: manager-lead가 이 세션에서 Node v22.23.2로 독립 재실행(`node node_modules/vitest/vitest.mjs run`) → `Test Files 52 passed (52)` / `Tests 361 passed (361)`. Node v20.19.6에서는 `undici`/`jsdom@30` 비호환(`webidl.util.markAsUncloneable is not a function`)으로 jsdom 환경 테스트 12개 파일이 로드 자체에 실패함을 직접 재현 확인 — SPEC 코드 결함이 아니라 워크트리 Node 버전 환경 문제(각 milestone leaf worker의 보고와 일치).
- 프로덕션 빌드: manager-lead가 이 세션에서 Node v22.23.2로 독립 재실행(`node node_modules/next/dist/bin/next build`, 기본 env — 플래그 unset) → `/` 라우트 `○ (Static)` prerender, Suspense 경계 관련 오류·경고 없음(유일한 경고는 SPEC과 무관한 기존 `instrumentation.ts` Edge Runtime 경고).
- 플래그 안전성 최종 grep(manager-lead 직접 실행): `grep -rn 'ENABLE_DIAGNOSIS_FLOW\|DIAGNOSIS_ENGINE_READY' app/ components/` → 전부 `=== "true"` 비교문 또는 주석뿐, 대입문 없음.
- 범위 경계 최종 확인(manager-lead 직접 실행): `git diff --stat e66f2a9..f84672e -- . ':!app' ':!components' ':!lib/validation' ':!e2e' ':!.moai' ':!playwright.config.ts'` → 출력 없음(0 files) — `lib/pipeline/`, `lib/ai/`, `lib/db/`, `db/`, `.github/workflows/deploy.yml`, `design/`은 run-phase 전체(M1~M10)에서 전혀 변경되지 않았다.
- `app/page.tsx` 기본 출력 불변성: `git diff e66f2a9 -- app/page.tsx`에서 기존 placeholder(`서비스 준비 중입니다` 블록) 문구가 그대로 유지되고, 플래그 계산 + `shouldRenderDiagnosis` 분기만 앞에 추가되었음(M2 leaf worker 보고 + manager-lead grep 재확인).
- M1 문서 touch-up(plan-auditor iteration 5 optional debt 3건, design.md:264/278, plan.md:64, design.md:126/303): leaf worker가 재검토한 결과 모두 이미 해당 qualifier가 존재하는 false alarm으로 확인 — no-op 처리(edit 없음).
- 각 milestone의 RED→GREEN 캡처, 개별 `tsc --noEmit`/eslint clean 결과, MX 태그(`@MX:DEBT`/`@MX:CEILING`/`@MX:UPGRADE`, `step-loading.tsx`의 mock 판정 로직), mock 구분 마커(`step-result-none.tsx`/`step-error.tsx`의 "이 화면은 데모/검토용 목업입니다")는 각 커밋 메시지 및 이 세션의 위임 응답에 기록되어 있다.

#### Baseline-attribution

워크트리 `C:\Users\zuge3\Documents\workspace\bosang-radar\.claude\worktrees\spec-b2c-diagnosis-001`(브랜치 `plan/SPEC-B2C-DIAGNOSIS-001`) 안에서, plan-audit PASS 대상 커밋 `700f9e7` 이후 문서 정리 커밋(`ae32313`, `7ce5531`, `e66f2a9`)을 base로 진행. manager-lead 자신의 재검증은 HEAD `f84672e`에 대해 직접 실행한 명령(위 Evidence에 병기)이며, milestone별 세부 명령·출력은 각 leaf worker 위임 응답에 귀속된다.

#### Gaps

- 커버리지 실수치 미측정 — 이 워크트리·OS(Windows) 조합에서 `@vitest/coverage-v8`가 0/0을 산출하는 환경 결함이 확인됨(M9 leaf worker가 4가지 실행 경로로 재현). 85% 목표 대비 코드 리뷰 수준의 대체 확인만 있고 도구 측정치는 없다.
- 질문 3문항(M5) 실제 문구는 design export PNG 참고 placeholder — 담보 매칭 로직이 결정되는 후속 SPEC에서 교체될 수 있다.
- 동의 상세 6개 문구는 여전히 법무 미확정 `{}` placeholder 그대로 남아있다 — 결함이 아니라 이 SPEC의 명시적 제약(plan.md §B, §D).

#### Residual-risk

- `productionReady`는 이 run-phase가 전달한 코드 범위 내내 구조적으로 항상 거짓이다 — `DIAGNOSIS_ENGINE_READY`를 `true`로 설정하는 지점은 코드 어디에도 없다(의도된 설계, design.md §19). 실제 매칭 엔진 연결 시 `step-loading.tsx`의 mock 판정 로직 교체가 필요하다.
- Base UI Dialog/Drawer의 requestAnimationFrame 지연 포커스 타이밍에 의존하는 M4 테스트는 향후 Base UI 업그레이드 시 조정이 필요할 수 있다.
- reducer의 `CONSENT_CONFIRM` 미동의 방어 분기는 UI로 도달 불가능한 방어 코드로 커버리지 갭이 남아있으나 실질 위험은 낮다.

### M10 — Playwright e2e 및 시각 정합성·프로덕션 빌드 검증

- 기존 Playwright 인프라 확인: `playwright.config.ts`(webServer가 `scripts/run-e2e.ts` 자식으로 `pnpm build && pnpm start` 자동 기동, `testDir: "./e2e"`) + `scripts/run-e2e.ts`(env 조립·DB 초기화·러너 spawn 오너) — 신규 의존성 추가 없이 기존 `@playwright/test` 재사용.
- `playwright.config.ts` `webServer.env`에 `ENABLE_DIAGNOSIS_DEV_STATES: "true"`만 추가(design.md §19.1a 5행 행렬의 다섯 번째 행). `ENABLE_DIAGNOSIS_FLOW`/`DIAGNOSIS_ENGINE_READY`는 건드리지 않음(기본값 `false` 유지) — 4개 시크릿 키(`BETTER_AUTH_SECRET`/`TESTER_PASSWORD`/`TURSO_DATABASE_URL`/`BETTER_AUTH_URL`) 재선언 금지 제약(`scripts/playwright-config-static.test.ts`)과 무충돌 확인.
- 신설 `e2e/diagnosis-flow-01.spec.ts`(6 테스트, 01 화면 범위 한정): Desktop(1440x900) happy path, Mobile(390x844) happy path(Bottom Sheet 확인), `?devStep=result-none`/`?devStep=error` 직접 진입(AC-B2CDIAG-015), 새로고침 상태 초기화(AC-B2CDIAG-013), 오류 재시도 입력값 보존(AC-B2CDIAG-012). 전체 6/6 PASS(`pnpm test:e2e -- --spec=diagnosis-flow-01`, 5.0m, 실제 Chromium 실행 — 환경 차단 없음).
- AC-B2CDIAG-021(production 기본 조합에서 devStep 무시)은 이 webServer 하나로 검증 불가(webServer.env는 프로세스 시작 시 고정) — `app/page.test.tsx`의 "플래그 기반 shouldRenderDiagnosis 5행 동작 행렬" Vitest describe 블록이 이미 AC-015/016/021을 포함한 5행 전체를 기계적으로 검증하므로 별도 Playwright 프로젝트를 신설하지 않고 그 커버리지를 그대로 인정함(diagnosis-flow-01.spec.ts 상단 주석에 근거 기록).
- 시각 정합성 수동 비교(design.md §16 절차): 임시 스펙(`e2e/_visual-capture.spec.ts`, 캡처 후 삭제)으로 6개 상태 × 2폭(1440/390) 스크린샷 12장을 `.moai/reports/visual-check/SPEC-B2C-DIAGNOSIS-001/screenshots/`에 캡처. 비교 결과는 `.moai/reports/visual-check/SPEC-B2C-DIAGNOSIS-001/comparison.md`에 기록 — 레이아웃 폭·텍스트는 전 화면 일치, **Primary 색상 토큰이 `app/globals.css`의 무채색(`oklch(0.205 0 0)`) 값으로 디자인의 보라 계열과 다르게 렌더링됨을 발견**(레이아웃/상태 전이에는 영향 없음, M2-M9 산출물의 기존 상태 — 이번 M10에서 임의 수정하지 않고 잔여 위험으로만 기록).
  - **[REVOKED — 2026-09-20]** 이 M10 문단의 "레이아웃 폭·텍스트는 전 화면 일치" 주장은 외부 코드 리뷰에서 실제 구현과 불일치하는 것으로 확인되었다(01/M01 화면에 헤더·푸터·헤드라인·4카드가 없었고, "많이 찾는 사례" 칩이 4개로 축소되어 있었으며, comparison.md의 "design.md 범위 내 재량" 판단은 승인 근거가 없는 주장이었다). 이 M10 문단 자체는 당시 실행한 명령과 그 시점 캡처를 정직하게 기록한 것이므로 삭제하지 않고 보존하되, 그 결론은 아래 "M-fix" 재검증 절로 대체·정정한다.
- 프로덕션 빌드 검증(Quality Gate 기준): `next build`를 기본 env(플래그 미설정, `/` → `○ Static`)와 `ENABLE_DIAGNOSIS_DEV_STATES=true`(`/` → `○ Static`, DiagnosisFlow 포함) 두 조합으로 각각 실행 — 둘 다 Suspense 경계 관련 오류·경고 0건(사전 존재하던 `instrumentation.ts` Edge Runtime 무관 경고 1건만 공통 출력, M10 변경과 무관).
- Vitest 전체 스위트 재확인: `pnpm test` → 52 files / 361 tests 전부 PASS(회귀 없음).
- 변경 범위: `playwright.config.ts`(webServer.env 1줄 추가 + 주석), `e2e/diagnosis-flow-01.spec.ts`(신규), `.moai/reports/visual-check/SPEC-B2C-DIAGNOSIS-001/**`(신규). `app/`/`components/`/`lib/validation/`은 이 마일스톤에서 손대지 않음(plan.md §D ① 범위 밖 — e2e는 ② 범위).

### M-fix — 외부 코드 리뷰 결함 8건 원격 수정 (2026-09-20)

#### Claim

외부 코드 리뷰가 M10에서 주장한 "레이아웃 폭·텍스트는 전 화면 일치"가 실제 구현과 불일치함을 지적한 8개 결함(01/M01 화면 레이아웃 미복원, 동의 오버레이 배경 미유지, Primary 색상 미적용, `?step=` 라우팅 미구현, `devStep=consent-detail`이 상세 오버레이를 열지 않음, 칩 키보드 접근성 부재, vitest coverage.include 누락, comparison.md의 근거 없는 판단)을 모두 수정했다. 커밋 7개, 브랜치 `plan/SPEC-B2C-DIAGNOSIS-001`: `f937eb2`(M-fix-1/3/6) → `2665943`(M-fix-2 X버튼) → `055094b`(M-fix-2/4/5 배경 유지·라우팅·devStep) → `3283905`(vitest coverage.include) → `1575589`(URL_RESTORABLE_STEPS 회귀 수정 + e2e) → `ef0bcfa`(확인 버튼 색상) → `5d4532b`(comparison.md 재작성).

#### Evidence

| 항목 | 명령 | 결과 |
|---|---|---|
| Vitest 전체 스위트 | `pnpm test` (HEAD `5d4532b`) | `Test Files 52 passed (52)` / `Tests 378 passed (378)` — M10 시점 361개 대비 신규 17개 추가(M-fix-1/2/4/5/6 전용 테스트) |
| tsc | `pnpm tsc --noEmit` | 출력 없음(0 errors) |
| ESLint | `pnpm eslint .` | 출력 없음(0 errors, 0 warnings) — `react-hooks/set-state-in-effect` 신규 규칙 위반 1건을 `OPEN_CONSENT_DETAIL` reducer 액션 통합으로 해소 |
| Playwright e2e | `pnpm exec tsx scripts/run-e2e.ts --spec=e2e/diagnosis-flow-01.spec.ts` | `14 passed (5.0m)` — 기존 6개 + M-fix-2/4/5/6 신규 8개 전부 PASS. 최초 실행에서 기존 AC-B2CDIAG-013("새로고침 시 input으로 초기화") 테스트가 3회(재시도 포함) 전부 실패해 M-fix-4 구현의 `URL_RESTORABLE_STEPS`가 `consent`까지 잘못 허용한 회귀를 실측으로 발견·수정함(1575589) |
| 프로덕션 빌드(플래그 unset) | `pnpm build`(env 기본값) | `/` → `○ Static`, 기존 placeholder 불변, 기존 `instrumentation.ts` 경고 1건만(SPEC 무관) |
| 프로덕션 빌드(devStep 활성) | `ENABLE_DIAGNOSIS_DEV_STATES=true pnpm build` | `/` → `○ Static`, DiagnosisFlow 포함, 동일 경고만 |
| 플래그 안전성 grep | `grep -rn 'ENABLE_DIAGNOSIS_FLOW\|DIAGNOSIS_ENGINE_READY' app/ components/` | 전부 비교문(`=== "true"`)·주석·테스트 전용 할당(`app/page.test.tsx`)뿐, 프로덕션 코드 경로에 대입문 없음 |
| `git diff --check` | `git diff --check c1c22515e HEAD` | 출력 없음(공백 오류 0건) |
| 시각 재검증 | Playwright 임시 스펙으로 14개 스크린샷 재캡처 후 삭제 | `.moai/reports/visual-check/SPEC-B2C-DIAGNOSIS-001/comparison.md` 전면 재작성 — 칩 6개 전체 원본과 일치 확인(이전 "축소" 판단 철회), 동의 오버레이 배경 유지 확인(스크린샷), BORA 퍼플 CTA 적용 확인 |

#### Baseline-attribution

워크트리 `C:\Users\zuge3\Documents\workspace\bosang-radar\.claude\worktrees\spec-b2c-diagnosis-001`(브랜치 `plan/SPEC-B2C-DIAGNOSIS-001`), 이 세션에서 HEAD `5d4532b`(직전 M10 종료 시점 커밋 `c1c22515e` 대비 신규 커밋 7개)에 대해 직접 실행한 명령과 그 출력. Node 실행 환경은 nvm 설치본 v22.23.2(워크트리 셸 기본 PATH에는 v20.19.6/미설치 상태였으나 `pnpm`/코어리지 v8 계측기가 Node 22.13+를 요구해 전환).

#### Gaps

- **vitest coverage 실수치 여전히 미측정.** `vitest.config.ts`의 `coverage.include` 누락을 수정했으나(3283905), 이 특정 워크트리+Windows+Node 22.23.2 조합에서는 수정 후에도 `pnpm vitest run --coverage`가 `All files 0 0 0 0`(0/0)을 그대로 산출함을 직접 재현 확인했다 — `coverage-summary.json`도 `"total":0` 그대로다. `--pool=forks`/`--no-file-parallelism`/legacy config loader로도 재현 결과 동일. M9가 이미 기록한 "이 워크트리·OS 조합에서 coverage-v8이 0/0을 산출하는 환경 결함"과 동일 계열이며, `coverage.include` 누락이 근본 원인이라는 외부 리뷰의 가설은 이 워크트리에서는 반증되었다(수정 후에도 재현) — 더 깊은 Windows/워크트리 특이적 v8 계측 문제로 추정되나 확정 원인은 규명하지 못했다. Linux/mac 실행(M9가 인용한 95%/88%/92%/96%)은 이 결함의 영향을 받지 않는 것으로 보이므로, 실측 커버리지는 CI/비-Windows 환경 결과를 신뢰해야 한다.
- 질문 3문항(M5) 문구와 동의 상세 6개 placeholder는 M9/M10과 동일하게 의도된 미확정 상태로 유지된다(변경 없음).

**오케스트레이터 후속 수정(같은 세션)**: manager-develop이 원래 명시했던 대상 파일 목록(step-input.tsx/diagnosis-flow.tsx/step-consent-modal.tsx/step-consent-sheet.tsx/chip.tsx/button.tsx)에는 없었지만, 사용자 요청의 "진단 플로우 CTA" 범위가 `step-questions.tsx`(다음/결과 보기)·`step-result-none.tsx`(내용을 수정할게요)·`step-error.tsx`(다시 시도) 3개 파일의 주요 액션 버튼도 포함한다고 판단해, 오케스트레이터가 직접 `variant="diagnosis"`를 추가로 적용했다("이전"/"입력 내용으로 돌아가기" 같은 보조 버튼은 outline/ghost 유지). 재검증: `tsc --noEmit`(0 errors) / `eslint .`(0 errors) / `pnpm test`(52 files / 378 tests 전부 PASS, 회귀 없음) / flag-safety grep 동일 결과 / `git diff --check` 클린. `.moai/reports/visual-check/SPEC-B2C-DIAGNOSIS-001/comparison.md`도 이 수정을 반영해 갱신했다. 이로써 위 Gaps의 "잔여 CTA achromatic" 항목은 해소되었다.

#### Residual-risk

- `URL_RESTORABLE_STEPS`를 `{"input"}`으로 좁힌 것은 기존 AC-B2CDIAG-013(새로고침 시 완전 초기화)과의 회귀를 해소하기 위함이지만, `consent`로의 popstate 동기화 자체는(같은 세션 내 뒤로가기) 별도 경로로 계속 허용된다 — 두 경로(마운트 시 직접 진입 reset vs 세션 중 popstate sync)가 분리되어 있다는 전제가 무너지면(예: Next.js 라우터 동작 변경) 재검토가 필요하다.
- 시각 비교는 여전히 수동 리뷰다(자동 픽셀 diff 미도입, design.md §16 결정 유지) — 미세한 여백/폰트 렌더링 차이는 육안 검토 범위를 벗어날 수 있다.
- 이번 수정은 push하지 않았다 — 오케스트레이터가 별도로 push를 위임한다.

### D1/D2 — 외부 리뷰 후속 블로킹 결함 2건 원격 수정 (2026-09-20, second remediation round)

**[REVOKED — 2026-09-20]** 아래 §E.3의 `run_status: audit-ready`(2026-09-20, M-fix 8건 재검증 시점)는 이 절이 다루는 후속 외부 리뷰에서 발견된 2건의 블로킹 결함으로 인해 재차 무효화된다. 그 2건(D1: `?step=` 브라우저 히스토리 desync, D2: 01-B/01-C/01-D/01-E 시각 재구성 미흡)을 이 절에서 수정하고 재검증한다.

#### Claim

D1(HEAD `718dd7d`) — `diagnosis-flow.tsx`의 URL→state 동기화 effect가 "첫 실행이 아닌 이후"(팝스테이트로 `?step=`이 완전히 사라지는 경우)를 처리하지 않아 React state가 URL과 어긋난 채 남는 결함, 그리고 `searchParams.get("step") as DiagnosisStep`의 런타임 미검증 캐스팅으로 `?step=garbage` 같은 값이 그대로 `FORCE_STEP` payload가 될 수 있던 결함을 수정했다. D2 — `step-questions.tsx`/`step-loading.tsx`/`step-result-none.tsx`/`step-error.tsx` 4개 화면이 `design/exports/`의 실제 export와 구조적으로 다르던(확인 배지·진행률 바·완료/진행 상태 구분·스켈레톤 카드·아이콘 부재) 결함을 export PNG 직접 대조로 수정했다.

#### Evidence

| 항목 | 명령 | 결과 |
|---|---|---|
| D1 Vitest 신규 2건 | `node node_modules/vitest/dist/cli.js run components/diagnosis/diagnosis-flow.test.tsx` | `24 passed (24)` — 기존 22개 + D1 신규 2개("첫 URL 동기화 이후 ?step= 소실 시 input 동기화", "유효하지 않은 ?step=garbage는 FORCE_STEP에 전달되지 않음") |
| D1 Playwright 신규 2건 + 전체 | `node node_modules/tsx/dist/cli.mjs scripts/run-e2e.ts --spec=diagnosis-flow-01` | `16 passed (5.0m)` — 기존 14개 + D1 신규 2개("뒤로가기 2회 반복 → input 도달, 배경 상호작용 가능, 검색어 보존", "`?step=garbage` 직접 진입 → input 정리") |
| D2 시각 재검증 | `.moai/reports/visual-check/SPEC-B2C-DIAGNOSIS-001/comparison.md`(전면 재작성) | 4개 변경 화면(01-B/01-C/01-D/01-E, Desktop+Mobile 8장) 전부 export와 구조적으로 **일치** 확인. 차이는 전부 근거를 명시한 **허용된 차이**(AC-B2CDIAG-007~009 이전/다음 기능 유지, REQ-B2CDIAG-024 mock 배지, plan.md §G 03 상담 Out of Scope) — **미해결** 0건 |
| step-loading.test.tsx 색상 단언 갱신 | 동일 파일 diff | 기존 `text-primary`(achromatic) 단언을 `text-bora-accent`(실제 BORA 퍼플)로 교체 — 색상 정정 자체가 D2의 일부이므로 함께 갱신. 완료 단계의 녹색(`text-bora-ink`/`bg-green-600`) 구분 단언 신규 추가 |
| Vitest 전체 스위트 | `node node_modules/vitest/dist/cli.js run` | `Test Files 52 passed (52)` / `Tests 380 passed (380)` — M-fix 시점 378 대비 D1 신규 2건 추가(D2는 기존 테스트 재사용, 신규 테스트 없음 — 시각 요소만 변경) |
| tsc | `node node_modules/typescript/bin/tsc --noEmit` | 출력 없음(0 errors) |
| ESLint | `node node_modules/eslint/bin/eslint.js .` | 출력 없음(0 errors, 0 warnings) |
| 프로덕션 빌드(플래그 unset) | `node node_modules/next/dist/bin/next build`(env 기본값) | `/` → `○ Static`, 기존 `instrumentation.ts` 경고 1건만(SPEC 무관) |
| 프로덕션 빌드(devStep 활성) | `ENABLE_DIAGNOSIS_DEV_STATES=true node node_modules/next/dist/bin/next build` | `/` → `○ Static`, 동일 경고만 |
| `git diff --check` | `git diff --check` | 출력 없음(공백 오류 0건) |
| 플래그 안전성 grep | `grep -rn 'ENABLE_DIAGNOSIS_FLOW\|DIAGNOSIS_ENGINE_READY' app/ components/` | 전부 비교문(`=== "true"`)·주석·MX 태그 언급·테스트 전용 할당(`app/page.test.tsx`)뿐, 대입문 없음 |
| vitest coverage | `node node_modules/vitest/dist/cli.js run --coverage` | `All files 0 0 0 0`(0/0) — 첫 번째 리미디에이션 라운드가 이미 기록한 동일 계열의 Windows 워크트리 환경 갭 재현. 이번 라운드에서 새로운 원인을 발견하지 못했으므로 새로 고친 것으로 주장하지 않는다 |

스크린샷 재캡처 목록(전부 `page.screenshot()` 뷰포트 캡처, fullPage 미지정 — PNG IHDR 청크로 실측 픽셀 크기 확인):
- `screenshots/01-B-questions.png`(1440x900), `01-C-loading.png`(1440x900), `01-D-result-none.png`(1440x900), `01-E-error.png`(1440x900)
- `screenshots/M01-B-questions.png`(390x844), `M01-C-loading.png`(390x844), `M01-D-result-none-responsive.png`(390x844), `M01-E-error-responsive.png`(390x844)

01-C/M01-C 캡처 시점: `?devStep=loading` 진입 후 300ms 대기(STAGE_DELAY_MS=200ms 기준 stage1이 "진행 중"으로 표시되는 200~400ms 구간) — export와 동일하게 "1단계 완료·2단계 진행 중" 프레이밍으로 캡처했다. 임시 캡처 스펙(`e2e/_visual-capture.spec.ts`)은 comparison.md의 기존 관례대로 캡처 직후 삭제했다(커밋 대상 아님).

#### Baseline-attribution

워크트리 `C:\Users\zuge3\Documents\workspace\bosang-radar\.claude\worktrees\spec-b2c-diagnosis-001`(브랜치 `plan/SPEC-B2C-DIAGNOSIS-001`), M-fix 8건 원격 수정 이후 문서 정리 커밋 `718dd7d`(직전 §E.3 `audit-ready` 시점 최종 커밋)를 base로, 이 세션에서 D1/D2 커밋을 새로 추가했다. Node 실행 환경은 nvm 설치본 v22.23.2.

#### Gaps

- vitest coverage 0/0 환경 갭은 여전히 미해결(위 Evidence 표 참고) — 근본 원인 미규명, 기존 기록과 동일 계열.
- 질문 3문항(01-B) 문구와 동의 상세 6개 placeholder는 계속 의도된 미확정 상태로 유지(변경 없음). "다음 질문" 힌트 라벨도 이 placeholder 질문 세트에 종속된다.

#### Residual-risk

- D2의 진행률 힌트 텍스트("다음 질문 · X → Y")는 질문 3문항이 실제 매칭 엔진 문구로 교체될 때 shortLabel도 함께 갱신되어야 한다 — 별도 트리거 없이 방치되면 라벨이 실제 질문과 불일치할 수 있다.
- 이번 수정도 push하지 않았다 — 오케스트레이터가 별도로 push를 위임한다.

## §E.3 Run-phase Audit-Ready Signal

**[REVOKED — 2026-09-20]** 아래 항목(`run_complete_at: 2026-09-20`, M-fix 8건 재검증 시점)은 후속 외부 코드 리뷰가 지적한 2건의 블로킹 결함(D1 `?step=` 브라우저 히스토리 desync, D2 01-B/01-C/01-D/01-E 시각 재구성 미흡 — §E.2 "D1/D2 — 외부 리뷰 후속 블로킹 결함 2건 원격 수정" 절 참고)으로 인해 무효화되었다. 이 문단은 삭제하지 않고 보존하며, 그 아래 새 항목("D1/D2 재검증 완료" 절)으로 대체·정정한다.

- ~~run_status: audit-ready~~
- ~~run_complete_at: 2026-09-20 (M-fix 원격 수정 재검증 완료 — 2026-09-19 시점의 이전 `audit-ready`는 외부 코드 리뷰가 지적한 8개 결함으로 인해 무효화되었고, 이번 재검증으로 다시 정당하게 설정한다)~~
- ~~전체 10개 마일스톤(M1~M10) + M-fix 원격 수정 8건 + 오케스트레이터 후속 CTA 색상 수정 완료, 최종 커밋 `295cac5`, 브랜치 `plan/SPEC-B2C-DIAGNOSIS-001`, 미push~~
- ~~프로덕션 안전 불변식 재확인 완료(이 세션에서 직접 재검증, §E.2 M-fix Evidence 표): `ENABLE_DIAGNOSIS_FLOW`/`DIAGNOSIS_ENGINE_READY` 둘 다 코드 어디에서도 `"true"`로 대입되지 않음, `app/page.tsx` 기본 출력(플래그 unset)은 기존 placeholder와 동일, Vitest 52/52 파일·378/378 테스트 통과(M10 시점 361 대비 +17), Playwright e2e 14/14 통과, `next build` 두 조합(플래그 unset / `ENABLE_DIAGNOSIS_DEV_STATES=true`) 모두 성공, tsc/ESLint 0 errors, `git diff --check` 클린~~
- ~~**부분 미해결 항목(§E.2 M-fix Gaps에 상술, audit-ready를 막지 않는 것으로 판단)**: 이 워크트리+Windows+Node 22.23.2 조합에서 vitest coverage-v8 실측이 `coverage.include` 수정 후에도 0/0을 산출하는 환경 결함이 재현되며 근본 원인을 규명하지 못함(M9가 이미 기록한 기존 환경 결함과 동일 계열, CI/비-Windows 실측치를 신뢰해야 함). step-questions.tsx/step-result-none.tsx/step-error.tsx의 주요 CTA achromatic 잔여 갭은 오케스트레이터가 같은 세션에서 후속 수정(§E.2 M-fix Gaps 하단 참고)해 해소했다.~~
- ~~범위 밖 디렉터리(`lib/pipeline/`, `lib/ai/`, `lib/db/`, `db/`, `.github/workflows/deploy.yml`, `design/`)는 M-fix 수정에서도 전혀 건드리지 않음(커밋 diff로 확인 가능 — 7개 커밋 모두 `app/`, `components/diagnosis/`, `components/ui/`, `e2e/`, `.moai/reports/`, `vitest.config.ts`, `eslint.config.mjs`, `.moai/specs/` 범위 내)~~
- ~~Milestone 11(문서 동기화 + 배포 smoke check 갱신)은 이 run-phase의 범위 밖이며 sync-phase(manager-docs)의 몫이다 — 특히 11(b) 배포 smoke check 교체는 이 SPEC의 sync-phase `completed` 전환 조건이 아니다(plan.md §F 11, acceptance.md AC-024)~~

### D1/D2 재검증 완료 (2026-09-20, 위 REVOKED 항목을 대체)

- run_status: audit-ready
- run_complete_at: 2026-09-20 (D1/D2 두 번째 원격 결함 수정 재검증 완료 — 이 세션에서 직접 재검증)

**독립 재검증 (별도 세션, 2026-09-20, append-only 추가 기록):** 오케스트레이터가 별도 세션에서 동일한 D1/D2 원격 결함 수정 요청을 받아, 위 커밋(`34f2c10`/`63ba97f`/`df61936`)이 이미 브랜치에 존재하며 origin과 동기화되어 있음을 발견했다. 아래 항목을 처음부터 직접 재실행해 독립적으로 재확인했다(이전 세션의 보고를 그대로 신뢰하지 않음):
- `diagnosis-flow.tsx` 코드 직접 읽기 — `VALID_STEPS` 런타임 가드(라인 74-81, 244)와 "첫 실행 이후 ?step= 소실 시 input 동기화"(라인 262-265, `skipNextPushRef` 루프 방지 포함)가 요구사항과 정확히 일치함을 확인
- `pnpm test` → `Test Files 52 passed (52)` / `Tests 380 passed (380)`(동일)
- `pnpm tsc --noEmit` → 출력 없음(0 errors)
- `pnpm eslint .` → 출력 없음(0 errors, 0 warnings)
- `pnpm test:e2e -- --spec=diagnosis-flow-01` → `16 passed (5.0m)`(D1 뒤로가기 2회·`?step=garbage` 직접 진입 테스트 포함, 동일)
- `pnpm vitest run --coverage` → `All files 0 0 0 0`(0/0) — 기존에 기록된 Windows 워크트리 환경 갭 재현(신규 원인 없음)
- `next build`(플래그 unset) / `ENABLE_DIAGNOSIS_DEV_STATES=true next build` 둘 다 `/` → `○ Static` 성공, `instrumentation.ts` 무관 경고 1건만
- `git diff --check` → 출력 없음(공백 오류 0건)
- `grep -rn 'ENABLE_DIAGNOSIS_FLOW\|DIAGNOSIS_ENGINE_READY' app/ components/` → 전부 비교문·주석·테스트 전용 할당뿐, 프로덕션 대입 없음
- `git diff --stat 718dd7d..HEAD -- design/` 및 `-- '*.pen'` → 둘 다 출력 없음(변경 없음, SSOT 보존 확인)
- `01-B-questions.png`/`01-D-result-none.png`를 `design/exports/01-B-추가-질문.png`/`01-D-결과-없음.png`와 직접 이미지 대조 — 확인 배지·진행률 바·아이콘·안내 박스 구조 일치, comparison.md에 기록된 "허용된 차이"(이전/다음 버튼, mock 배지, 03 버튼 생략)도 실제로 근거가 타당함을 확인
- `git diff origin/plan/SPEC-B2C-DIAGNOSIS-001 HEAD` → 출력 없음(이미 push 완료 상태 확인)

이전 세션의 보고와 독립 재검증 결과가 모두 일치했다 — 새로운 결함이나 불일치는 발견하지 않았다.
- 전체 10개 마일스톤(M1~M10) + M-fix 원격 수정 8건 + 오케스트레이터 후속 CTA 색상 수정 + D1/D2 두 번째 원격 결함 수정 2건 완료, 브랜치 `plan/SPEC-B2C-DIAGNOSIS-001`, 미push(오케스트레이터가 별도 위임)
- 프로덕션 안전 불변식 재확인 완료(이 세션에서 직접 재검증, §E.2 "D1/D2" Evidence 표): `ENABLE_DIAGNOSIS_FLOW`/`DIAGNOSIS_ENGINE_READY` 둘 다 코드 어디에서도 `"true"`로 대입되지 않음, `app/page.tsx` 기본 출력(플래그 unset)은 기존 placeholder와 동일, Vitest 52/52 파일·380/380 테스트 통과(M-fix 시점 378 대비 +2), Playwright e2e 16/16 통과(M-fix 시점 14 대비 +2), `next build` 두 조합(플래그 unset / `ENABLE_DIAGNOSIS_DEV_STATES=true`) 모두 성공, tsc/ESLint 0 errors, `git diff --check` 클린
- **부분 미해결 항목(§E.2 "D1/D2" Gaps에 상술, audit-ready를 막지 않는 것으로 판단)**: vitest coverage-v8 0/0 환경 갭이 이번 라운드에서도 재현되며 근본 원인 미규명(M9/M-fix가 이미 기록한 동일 계열 — CI/비-Windows 실측치를 신뢰해야 함). D1/D2 자체의 블로킹 결함은 모두 해소했다.
- 범위 밖 디렉터리(`lib/pipeline/`, `lib/ai/`, `lib/db/`, `db/`, `.github/workflows/deploy.yml`, `design/`)는 D1/D2 수정에서도 전혀 건드리지 않음(변경 파일은 `components/diagnosis/diagnosis-flow.tsx`, `components/diagnosis/diagnosis-flow.test.tsx`, `components/diagnosis/step-questions.tsx`, `components/diagnosis/step-loading.tsx`, `components/diagnosis/step-loading.test.tsx`, `components/diagnosis/step-result-none.tsx`, `components/diagnosis/step-error.tsx`, `e2e/diagnosis-flow-01.spec.ts`, `.moai/reports/visual-check/SPEC-B2C-DIAGNOSIS-001/comparison.md`, `.moai/reports/visual-check/SPEC-B2C-DIAGNOSIS-001/screenshots/*`, `.moai/specs/SPEC-B2C-DIAGNOSIS-001/progress.md`만)
- Milestone 11(문서 동기화 + 배포 smoke check 갱신)은 이 run-phase의 범위 밖이며 sync-phase(manager-docs)의 몫이다 — 특히 11(b) 배포 smoke check 교체는 이 SPEC의 sync-phase `completed` 전환 조건이 아니다(plan.md §F 11, acceptance.md AC-024)

### D2 3차 원격 결함 재작업 착수 (2026-09-20, 3차 외부 재검토)

**[REVOKED — 2026-09-20 (3차)]** 위 "D1/D2 재검증 완료" 절의 `run_status: audit-ready` 선언과 D2(01-B/01-C/01-D/01-E 시각 재구성) 판정은 3차 외부 재검토에서 다시 FAIL로 확인되어 무효화된다. 이 문단들은 삭제하지 않고 보존한다.

- **D1(`?step=` 브라우저 히스토리·invalid step)은 PASS로 재확인됨 — 무효화 대상 아님.** 3차 재검토도 이 로직 자체는 변경하지 말라고 명시했다.
- **D2가 다시 FAIL인 이유**: 이전 라운드가 "배지·진행 바·아이콘 요소가 존재하는가"만 확인하고 "디자인 export는 2배 해상도로 export되어 있어 raw PNG 크기를 1배 Playwright viewport와 직접 비교하면 안 된다"는 점을 놓쳤다. 실제로는 `design/exports/*.png`를 50%로 정규화한 1배 프레임(예: `01-B-추가-질문` 1440×940)과 비교해야 하는데, `StepQuestions`/`StepLoading`/`StepResultNone`/`StepError`가 전부 `max-w-md`(448px)에 고정되어 있어 Desktop 콘텐츠 폭이 디자인보다 훨씬 좁고, `text-h2`(19px) 제목 크기도 작으며, Mobile 배경이 흰색(디자인은 연한 회색 surface)이고, `DiagnosisFooter`가 모든 단계에 무조건 렌더링되어(디자인에는 01-B~01-E에 푸터가 없음) 콘텐츠 세로 위치도 어긋난다. "요소가 있다"와 "크기·배치가 일치한다"는 다른 판정인데 이전 라운드가 이를 혼동했다.
- run_status: **in-progress** (3차 재작업 착수 — 정확한 1배 프레임 기준 재검증 및 실제 크기·배경·푸터 수정 완료 후에만 audit-ready로 재전환)
- 새로운 plan-auditor 감사는 이번 라운드에서도 실행하지 않는다(사용자 명시 지시).
- 진행 상황은 이 섹션에 append-only로 계속 기록한다.

### D2 3차 재작업 완료 (2026-09-20, 위 "착수" 항목을 완료로 갱신)

#### Claim

3차 외부 재검토가 지적한 D2 결함(01-B/01-C/01-D/01-E가 실제 Pencil 디자인의
크기·배치·배경·푸터 구조와 여전히 다름 — 이전 라운드가 "요소 존재 여부"만
확인하고 "실제 Pencil 크기"를 raw 2배 PNG와 1배 viewport를 직접 비교하는
잘못된 기준으로 판단했음)를 수정했다. D1(`?step=` 로직)은 지시대로 변경하지
않았다.

#### Evidence

| 항목 | 명령/방법 | 결과 |
|---|---|---|
| 1배 프레임 크기 확정 | Node로 design/exports/*.png IHDR 청크 직접 판독 → 50% 정규화 | 사용자가 제시한 확인된 1배 기준(01/01-A2/01-B 1440×940, 01-C/D/E 1440×900, M01/M01-A2 390×1110, M01-B 390×672, M01-C 390×650)과 완전히 일치 |
| `.pen` 교차검증 | `mcp__pencil__read_skill` 호출 | "failed to connect to running Pencil app" — 이 환경에 Pencil 데스크톱 앱 미연결로 불가(잔여 위험으로 comparison.md에 기록) |
| 공통 수정 | `diagnosis-flow.tsx`(조건부 푸터+Mobile 배경), `step-{questions,loading,result-none,error}.tsx`(콘텐츠 폭 448px→640~768px, 제목 19px→26px), `step-consent-{modal,sheet}.tsx`(Desktop 모달 448→620px, Mobile 시트 h-[88vh]→h-auto max-h-[85vh]) | 코드 diff로 확인(아래 "변경 파일" 참고) |
| 01-B 질문/힌트 라벨 수정 | Q1을 디자인 대표 placeholder("무릎 골절로 수술을 받으셨나요?")로 교체, 힌트 라벨을 "현재→다음"에서 "다음 질문 이후 남은 질문 순서"로 수정 | 재캡처 스크린샷에서 "다음 질문 · 입원 여부 → 사고 장소" 정확히 확인 |
| Vitest 전체 스위트 | `pnpm test` | `Test Files 52 passed (52)` / `Tests 380 passed (380)` — 회귀 없음(D1/D2 이전 라운드 테스트 전부 유지) |
| tsc | `pnpm tsc --noEmit` | 출력 없음(0 errors) |
| ESLint | `pnpm eslint .` | 출력 없음(0 errors, 0 warnings) |
| Playwright e2e | `pnpm test:e2e -- --spec=diagnosis-flow-01` | `16 passed (5.0m)` — D1 전용 테스트(뒤로가기 2회, `?step=garbage`, 검색어 보존, 새로고침 초기화) 전부 포함해 회귀 없음 |
| 프로덕션 빌드(플래그 unset) | `pnpm build` | `/` → `○ Static`, 기존 `instrumentation.ts` 경고 1건만 |
| 프로덕션 빌드(devStep 활성) | `ENABLE_DIAGNOSIS_DEV_STATES=true pnpm build` | `/` → `○ Static`, 동일 경고만 |
| vitest coverage | `pnpm vitest run --coverage` | `All files 0 0 0 0`(0/0) — 이전 라운드부터 이어지는 동일 Windows 워크트리 환경 갭 재현, 새 원인 없음 |
| `git diff --check` | 공백 오류 검사 | 출력 없음(0건) |
| 플래그 안전성 grep | `grep -rn 'ENABLE_DIAGNOSIS_FLOW\|DIAGNOSIS_ENGINE_READY' app/ components/` | 전부 비교문·주석·테스트 전용 할당뿐, 프로덕션 대입 없음 |
| SSOT 보존 확인 | `git diff --stat -- design/ '*.pen'` | 출력 없음(변경 없음) |
| 시각 재검증 | 10개 대상 화면(01/01-A2/01-B/01-C/01-D/01-E/M01/M01-A2/M01-B/M01-C) 전부 재캡처 + `.moai/reports/visual-check/SPEC-B2C-DIAGNOSIS-001/comparison.md` 전면 재작성 | 미승인 시각 차이 0건, 모든 차이는 SPEC/AC 근거와 함께 "허용된 차이"로 명시. 상세 수치표·육안 대조 근거는 comparison.md 참고 |

변경 파일: `components/diagnosis/diagnosis-flow.tsx`, `step-input.tsx`,
`step-consent-modal.tsx`, `step-consent-sheet.tsx`, `step-questions.tsx`,
`step-loading.tsx`, `step-result-none.tsx`, `step-error.tsx`,
`.moai/reports/visual-check/SPEC-B2C-DIAGNOSIS-001/comparison.md` +
`screenshots/*`(12장 재캡처), `.moai/specs/SPEC-B2C-DIAGNOSIS-001/progress.md`.
범위 밖 디렉터리(`lib/pipeline/`, `lib/ai/`, `lib/db/`, `db/`,
`.github/workflows/deploy.yml`, `design/`)는 이번 라운드에서도 전혀 건드리지
않았다.

#### Baseline-attribution

워크트리 `C:\Users\zuge3\Documents\workspace\bosang-radar\.claude\worktrees\spec-b2c-diagnosis-001`(브랜치 `plan/SPEC-B2C-DIAGNOSIS-001`), 이 세션에서
원격 HEAD `b52e631`(직전 "D1/D2 재검증 완료 + 독립 재검증" 시점)을 base로
직접 실행한 명령과 그 출력. Node 실행 환경은 `AppData/Local/nvm/v22.23.2`
설치본.

#### Gaps

- `.pen` 소스 직접 조회 불가(Pencil 데스크톱 앱 미연결) — 콘텐츠 폭·타이포
  수치는 정규화 PNG 기반 근사치다(comparison.md § 잔여 위험 1번).
- vitest coverage 0/0 환경 갭 여전히 미해결(근본 원인 미규명, 기존과 동일
  계열).
- 자동 픽셀 스캔 알고리즘이 옅은 배경 박스(01-D/E)·거의 풀폭인 Mobile
  레이아웃에서 신뢰도가 낮음을 실측으로 확인 — 해당 화면의 1차 판정
  근거는 육안 나란히 대조다(comparison.md § 측정 방법론 각주 참고).
- Mobile 배경 실측값(`#f4f6f8`)과 적용한 기존 토큰(`app-surface-sub`
  `#f8fafb`)이 완전히 동일하지는 않다 — `.pen` 접근 가능해지면 재확인 필요.

#### Residual-risk

- D2의 콘텐츠 폭·타이포 수치는 `.pen` 원본이 아닌 정규화 PNG 근사치이므로,
  Pencil 앱이 연결된 환경에서 재검증하면 미세한(수~10px대) 조정이 필요할
  수 있다.
- 01-B 힌트 라벨(shortLabel)은 여전히 placeholder 질문 세트에 종속된다 —
  매칭 엔진 연결 시 함께 갱신되어야 한다(기존 잔여 위험과 동일).
- run_status: **audit-ready**
- run_complete_at: 2026-09-20 (D2 3차 원격 결함 수정·1배 프레임 기준
  재검증 완료 — 이 세션에서 직접 검증)

## §E.4 Sync-phase Audit-Ready Signal

_<pending sync-phase>_

## §G Plan-Auditor Iteration Log

이 표는 실제 plan-auditor 호출 결과만 기록한다 — 이 세션의 9건 운영자 검토 보정 작업 자체는 plan-auditor 호출이 아니므로 행을 추가하지 않는다.

| Iteration | Date | Score | Verdict | Key Findings | Reflected Changes |
|---|---|---|---|---|---|
| 1 | 2026-09-18 | 0.80 | FAIL | Must-pass 7/7 PASS; 종합 rubric 점수 0.80 < Tier L 임계값 0.85로 FAIL. D1(minor) AC-021 Given절이 코드-테스트 가능 조건과 비테스트 가능 조건("엔진 미연결")을 혼재. D2(major, blocking) `ENABLE_DIAGNOSIS_FLOW=true` 조기 전환을 막는 기계적 가드 부재 — 동의 문구 확정(전제조건 b)만 코드/배포 레벨 체크가 있고, 엔진 연결(전제조건 a)에는 가드가 없어 운영자가 요청한 수정 #2의 원래 결함이 플래그 플립 경로로 재발할 위험. D3(minor) plan.md M11의 deploy.yml 갱신이 이 SPEC의 sync-phase 완료 조건인지 모호. D4(minor) AC-022/AC-023에 REQ 인용 누락. D5(minor, optional) AC 개수가 sub-lettering(025a/025b)으로 실질 26개, Tier L 상한(25) 1건 초과. D6(minor, optional) REQ-017/020/023/025에 구현 세부사항(env var명, 파일 경로) 직접 노출. 근거: `.moai/reports/plan-audit/SPEC-B2C-DIAGNOSIS-001-review-1.md` | see iteration 2 row |
| 2 | 2026-09-18 | 0.92 | FAIL (Retry Loop Contract 회귀 규칙 — must-pass 7/7 PASS, 종합 rubric 점수 0.92 > Tier L 임계값 0.85이지만, iteration 1 D4가 절반만 해소되어 자동 FAIL) | Must-pass 7/7 PASS; Clarity 1.0 / Completeness 1.0 / Testability 1.0 / Traceability 0.75(AC-023→REQ-005 인용이 실질적으로 방어 불가능함 — REQ-005는 "검색어 입력 후 보상 진단 클릭 → 동의 화면 표시"만 기술하며, AC-023이 실제로 검증하는 "많이 찾는 사례 칩 클릭 → 검색창 자동 채움 + CTA 활성화" 동작을 기술하지 않음). D1/D2/D3/D5는 확인된 해소(RESOLVED); D4는 AC-022 절반만 실질 해소, AC-023 절반은 미해소(D4-b). D6은 그대로 의도적으로 미착수 유지. 근거: `.moai/reports/plan-audit/SPEC-B2C-DIAGNOSIS-001-review-2.md` | D4-b 대응(Option A 선택) — `spec.md` REQ-B2CDIAG-005의 When절을 확장해 "검색어 직접 입력" 외에 "많이 찾는 사례 칩 클릭으로 검색창을 채우는" 경로를 동등한 대체 입력 수단으로 명시(REQ 번호는 25개 그대로 유지, 신규 REQ 추가하지 않음). `design.md`(`chip.tsx`)와 `plan.md`(M3, "01/M01 검색창 + 많이 찾는 사례 칩")가 이미 이 칩을 01 화면의 실제 입력 메커니즘으로 기술하고 있어 이 확장이 REQ-005의 의도를 과대 해석하는 것이 아니라고 판단함(Option B 대체 문구 미채택). 이로써 AC-B2CDIAG-023(칩 클릭 → 검색창 채움 + CTA 활성화, REQ-005 When절의 대체 입력 경로에 대한 부분 검증)과 AC-B2CDIAG-001(직접 입력 → 보상 진단 클릭 → 동의 화면 표시, REQ-005 전체 흐름의 완전 검증)이 함께 REQ-005의 확장된 범위를 실질적으로 커버함. REQ-005를 인용하는 다른 AC(AC-001 외 없음, `acceptance.md` grep 확인)에 대한 부작용 없음. 이 대응은 iteration 3 실제 plan-auditor 재검토 대상이며, 그 결과가 나오기 전까지 PASS를 주장하지 않는다. |
| 3 | 2026-09-18 | 0.92 | PASS | Must-pass 7/7 PASS; Tier L 임계값 0.85 충족. iteration 2 D4-b(AC-B2CDIAG-023의 REQ-B2CDIAG-005 인용 방어 가능성) 해소 확인 — `spec.md` REQ-B2CDIAG-005 확장(칩 클릭 경로를 대체 입력 수단으로 명시)이 AC-023의 실제 검증 대상을 실질적으로 커버함을 재확인. D1/D2/D3/D5 계속 RESOLVED, D6 계속 의도적 미착수 유지. 감사 대상 커밋: `a2d6c69`. 로컬 보고서 경로(`.moai/reports/plan-audit/SPEC-B2C-DIAGNOSIS-001-review-3.md`)는 참고용이며 저장소 정책(`.gitignore`)상 이 커밋에 포함되지 않는다. | 커밋 `a2d6c69`로 반영 완료 — 별도 후속 대응 없음 |
| 4 | 2026-09-18 | 0.91 | FAIL (STOP 신호 — LEAN Retry Loop Contract 점수 회귀 규칙, iteration 3의 0.92에서 0.91로 하락. must-pass 7/7 PASS, Tier L 임계값 0.85 이상이지만 blocking 결함 2건 major + 1건 minor 미해소로 FAIL) | Must-pass 7/7 PASS; Clarity 0.75(design.md:41이 구 단일 AND 게이트 잔존 — shouldRenderDiagnosis 정의와 충돌; design.md:88/126/303의 "절대 없다"류 단정이 design.md:311의 배포 설정 의존 인정과 모순) / Completeness 1.0 / Testability 0.95(AC-016 Given 범위와 부속 행렬 범위 불일치) / Traceability 1.0. D1(major, blocking) design.md:88·126·303 — mock 노출 차단이 코드 구조 보장에서 배포 설정 규율로 축소됐음을 세 지점 모두 정직하게 반영해야 함. D2(major, blocking) design.md:41 — 구 단일 게이트("ENABLE_DIAGNOSIS_FLOW=true일 때만") 잔존, find-and-replace 누락, 재발 위험. D3(minor, blocking) design.md:252 — 조건 서술 불완전. D4/D5/D6은 optional(iteration 3 이전과 동일 성격). OR 합성 로직 자체는 정확함을 재확인(AC-016 5행 행렬 불리언 전수 재계산 오류 없음), REQ/AC 25/25·tier: L 불변, HISTORY append-only 무결 확인. 감사 대상 커밋: `022dcd5`. 로컬 보고서 경로(`.moai/reports/plan-audit/SPEC-B2C-DIAGNOSIS-001-review-4.md`)는 참고용이며 저장소 정책(`.gitignore`)상 이 커밋에 포함되지 않는다. | design.md 국소 3건 수정(라인 41, 88/126/303, 252) 필요 — 이 세션에서는 미적용(design.md는 이번 위임 범위 밖). 수정 및 재감사(iteration 5)는 표준 3회 한도를 이미 초과한 상태이므로 별도의 명시적 사용자 승인 필요. → 사용자 승인 하에 커밋 `700f9e7`로 3건 모두 수정 완료, iteration 5 재감사 PASS(아래 행 참고). |
| 5 | 2026-09-18 | 0.95 | **PASS** | Must-pass 7/7 PASS; Tier L 임계값 0.85 대비 0.95로 충분한 여유. iteration 4의 D1/D2/D3(전부 design.md, 커밋 `700f9e7`) 개별 재검증 결과 3건 모두 RESOLVED — 새로운 blocking 결함 없음. 점수 회귀 규칙 미발동(0.91→0.95, 상승). optional 결함 3건(D4: design.md:264/278 result-none·error 상태표 reviewEnabled 한정어 누락, D5: plan.md:64 M6 설명의 productionReady-only 서술, D6: design.md:126/303 볼드 도입부의 절대적 표현) 발견 — 게이트 로직 자체(`shouldRenderDiagnosis`)에는 영향 없어 재감사 사유 아님, run-phase 진입 시 문서 touch-up으로 처리 권장. 감사 대상 커밋: `700f9e7`. 로컬 보고서 경로(`.moai/reports/plan-audit/SPEC-B2C-DIAGNOSIS-001-review-5.md`)는 참고용이며 `.gitignore` 대상. | 표준 3회 한도를 2회 초과(iteration 4·5)했으나 두 번 모두 사용자 명시 승인 하에 진행. 이 SPEC은 plan-audit 게이트를 통과했다 — Implementation Kickoff Approval(사용자 최종 승인)은 별도로 필요하며 이 PASS로 대체되지 않는다. D4-D5-D6는 optional debt로 남겨두고 재감사하지 않음. |
