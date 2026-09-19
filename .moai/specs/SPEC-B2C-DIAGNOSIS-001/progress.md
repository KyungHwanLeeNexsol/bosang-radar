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
- 프로덕션 빌드 검증(Quality Gate 기준): `next build`를 기본 env(플래그 미설정, `/` → `○ Static`)와 `ENABLE_DIAGNOSIS_DEV_STATES=true`(`/` → `○ Static`, DiagnosisFlow 포함) 두 조합으로 각각 실행 — 둘 다 Suspense 경계 관련 오류·경고 0건(사전 존재하던 `instrumentation.ts` Edge Runtime 무관 경고 1건만 공통 출력, M10 변경과 무관).
- Vitest 전체 스위트 재확인: `pnpm test` → 52 files / 361 tests 전부 PASS(회귀 없음).
- 변경 범위: `playwright.config.ts`(webServer.env 1줄 추가 + 주석), `e2e/diagnosis-flow-01.spec.ts`(신규), `.moai/reports/visual-check/SPEC-B2C-DIAGNOSIS-001/**`(신규). `app/`/`components/`/`lib/validation/`은 이 마일스톤에서 손대지 않음(plan.md §D ① 범위 밖 — e2e는 ② 범위).

## §E.3 Run-phase Audit-Ready Signal

- run_status: audit-ready
- run_complete_at: 2026-09-19
- 전체 10개 마일스톤(M1~M10) 완료, 최종 커밋 `f84672e`, 브랜치 `plan/SPEC-B2C-DIAGNOSIS-001`, 미push
- 프로덕션 안전 불변식 재확인 완료(manager-lead 독립 재검증): `ENABLE_DIAGNOSIS_FLOW`/`DIAGNOSIS_ENGINE_READY` 둘 다 코드 어디에서도 `"true"`로 대입되지 않음, `app/page.tsx` 기본 출력(플래그 unset)은 기존 placeholder와 동일, 범위 밖 디렉터리(`lib/pipeline/`, `lib/ai/`, `lib/db/`, `db/`, `.github/workflows/deploy.yml`, `design/`) 전혀 미변경, Vitest 52/52 파일·361/361 테스트 통과, `next build` 기본 env에서 `/` Static prerender 성공
- Milestone 11(문서 동기화 + 배포 smoke check 갱신)은 이 run-phase의 범위 밖이며 sync-phase(manager-docs)의 몫이다 — 특히 11(b) 배포 smoke check 교체는 이 SPEC의 sync-phase `completed` 전환 조건이 아니다(plan.md §F 11, acceptance.md AC-024)

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
