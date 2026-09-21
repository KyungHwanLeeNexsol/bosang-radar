---
id: SPEC-B2C-DIAGNOSIS-001
title: "01 진단 플로우 — 질문 입력 · 동의 · 추가 질문 · 진단 중 (Plan-Phase)"
version: "0.1.2"
status: implemented
created: 2026-09-18
updated: 2026-09-21
author: Nexsol
priority: P1
phase: "v0.17.0 target"
module: "app/, components/, lib/validation/"
lifecycle: spec-anchored
tags: "b2c-diagnosis, consent-flow, state-machine, funnel-01, accessibility, plan-only"
tier: L
related_specs: [SPEC-B2C-FOUNDATION-001]
---

## HISTORY

- 2026-09-18: 최초 작성 (Nexsol) — SPEC-B2C-FOUNDATION-001이 B2B 코드를 정리하고 `app/`을 B2C 최소 공개 진입점(placeholder)으로 전환했다. 이 SPEC은 그 다음 단계로, B2C 3단계 퍼널(01 질문 입력 → 02 보상 진단 결과 → 03 상담 신청) 중 **① 질문 입력 및 진단** 흐름(01/01-A2/01-B/01-C/01-D/01-E, 모바일 M01/M01-A2/M01-B/M01-C)의 **plan-phase 문서만** 작성한다. 실제 화면·컴포넌트·API 구현은 후속 `/moai run SPEC-B2C-DIAGNOSIS-001`의 범위이며, 이번 커밋에는 코드 변경이 포함되지 않는다. 디자인 SSOT는 `design/MIGRATION-PLAN.md`(2026-09-18 최종 갱신)이다.
- 2026-09-18: plan-phase 문서 9건 보정 (운영자 검토) — 프로덕션 mock 결과 자동 노출 방지를 위한 `ENABLE_DIAGNOSIS_FLOW` 게이트 신설(REQ-025), 동의 상세 6개 placeholder 문구 확정 전 출시 차단 명시, `useSearchParams()` Suspense 경계 요구사항 추가, PII 검증을 2단계(자동 차단: 전화번호·주민등록번호 / 안내만: 이름 등)로 재정의, `devStep` 가드를 `NODE_ENV` 단독 판정에서 전용 서버 플래그 `ENABLE_DIAGNOSIS_DEV_STATES`로 교체, M01-D/M01-E 반응형 재사용 및 768px 브레이크포인트 분기를 최종 확정, `plan.md` §D 범위 제약을 4갈래(프로덕션 코드/테스트/문서/배포)로 명확화. 이 개정은 plan-phase 문서 보정이며, 이 세션 이전에 디스크에 영속된 plan-auditor 검토 결과는 없다 — 독립 plan-auditor 재검토가 여전히 필요하다(`progress.md` §G 참고).
- 2026-09-18: plan-auditor iteration 1(FAIL, 종합 0.80, must-pass 7/7 PASS, `.moai/reports/plan-audit/SPEC-B2C-DIAGNOSIS-001-review-1.md`) 지적사항 D1-D5 반영 — (D2, 최우선) `ENABLE_DIAGNOSIS_FLOW`의 조기 전환에 대한 기계적 가드가 없던 문제를 해소하기 위해 서버 전용 플래그 `DIAGNOSIS_ENGINE_READY`(기본값 `false`)를 신설하고, 프로덕션 활성화를 `ENABLE_DIAGNOSIS_FLOW === true && DIAGNOSIS_ENGINE_READY === true`라는 단일 AND 게이트(REQ-025, `design.md` §19)로 재정의했다 — 실제 매칭 엔진 연결은 이 SPEC의 Out of Scope이므로 이 SPEC이 전달하는 코드에는 `DIAGNOSIS_ENGINE_READY`를 `true`로 설정하는 지점이 없다. (D1) `acceptance.md` AC-B2CDIAG-021의 Given절을 두 플래그 모두 기계적으로 테스트 가능한 조건으로 재작성. (D3) `plan.md` Milestone 11을 문서 동기화(블로킹)와 배포 smoke check 교체(비블로킹, sync-phase 완료 조건 아님)로 분리 명시, `acceptance.md`에 AC-024 조건부 검증 안내 추가. (D4) `acceptance.md` AC-022/AC-023에 REQ 인용 추가(REQ-020, REQ-005), REQ-020에 1~200자 길이 제한 명시. (D5) `acceptance.md` AC-B2CDIAG-025b(프로덕션 빌드 검증)를 "Quality Gate 기준" 섹션으로 이관하고 AC-B2CDIAG-025a를 AC-B2CDIAG-025로 정리해 Tier L 상한(25)에 맞춤. D6(REQ 본문의 구현 세부사항 완화)은 다른 문서의 교차 참조 안정성 리스크 대비 이익이 작다고 판단해 미착수. 실제 plan-auditor 재검토는 이 세션 이후 별도로 필요하다(`progress.md` §G 참고).
- 2026-09-18: plan-auditor iteration 3(PASS, 종합 0.92, Tier L 임계값 0.85 충족, must-pass 7/7 PASS, `.moai/reports/plan-audit/SPEC-B2C-DIAGNOSIS-001-review-3.md`) — iteration 2 D4-b 해소 확인. 감사 대상 커밋 `a2d6c69`. 이 결과로 위 두 HISTORY 항목의 "독립 재검토가 여전히 필요하다"는 문구는 해소된 것으로 갱신한다(`progress.md` §G 참고).
- 2026-09-18: 마지막 정합성 보정 — (1) 위 iteration 3 PASS 결과를 progress.md/plan.md/acceptance.md에 영속 반영, (2) 렌더링 게이트 결함 수정: `app/page.tsx`의 렌더링 조건을 `productionReady = ENABLE_DIAGNOSIS_FLOW && DIAGNOSIS_ENGINE_READY`와 `reviewEnabled = ENABLE_DIAGNOSIS_DEV_STATES`로 분리하고 `shouldRenderDiagnosis = productionReady || reviewEnabled`로 재정의(REQ-B2CDIAG-025 개정, `design.md` §19, `plan.md` M2, `acceptance.md` AC-015/016/021) — 기존 단일 AND 게이트로는 review 환경에서 `ENABLE_DIAGNOSIS_DEV_STATES=true`여도 `DiagnosisFlow` 자체가 렌더링되지 않아 `?devStep=` 경로가 무력화되는 결함을 해소, (3) plan.md §A의 오래된 배포 문구("run-phase 완료 시 placeholder를 실제 01 화면으로 교체") 제거 및 정정. 이 개정은 렌더링 게이트의 실질 변경이므로 plan-auditor iteration 4 재감사를 진행한다(표준 3회 한도를 넘는 재감사, 사용자 명시 승인 — `progress.md` §G 참고).
- 2026-09-18: plan-auditor iteration 4 실행 결과 — **FAIL(종합 0.91, STOP 신호)**. must-pass 7/7 PASS, Tier L 임계값(0.85) 이상이지만 blocking 결함 2건(major) + 1건(minor)이 design.md에서 발견되어 FAIL 판정. 세부: (1) design.md §8/§11/§19가 productionReady/reviewEnabled OR 합성 도입 후에도 mock 노출 차단을 여전히 절대적 구조적 보장인 것처럼 서술해 같은 문서의 배포 설정 의존 인정과 모순, (2) design.md §2 Suspense 문단이 구 단일 AND 게이트를 렌더링 조건으로 잘못 서술한 채 남아 있어 find-and-replace 누락, (3) design.md §18.1 loading 상태표의 조건 서술 불완전. 세 결함 모두 design.md 국소 수정으로 해소 가능하다고 plan-auditor가 명시했으나, 표준 3회 재시도 한도를 이미 초과했으므로 수정 및 재감사(iteration 5)는 별도의 명시적 사용자 승인 없이는 진행하지 않는다. 상세: `progress.md` §G, `.moai/reports/plan-audit/SPEC-B2C-DIAGNOSIS-001-review-4.md`(로컬, `.gitignore` 대상).
- 2026-09-18: design.md의 plan-auditor iteration 4 blocking 결함 D1(§8/§11/§19.1의 mock 노출 차단 절대 단정)/D2(§2 Suspense 문단의 구 AND 게이트 잔존)/D3(§18.1 loading 상태표의 조건 서술 불완전) 3건을 커밋 `700f9e7`로 수정 — 렌더링 게이트 로직(`shouldRenderDiagnosis = productionReady || reviewEnabled`) 자체는 변경 없이 문구만 정정. plan-auditor iteration 5 재감사 결과 **PASS(종합 0.95, Tier L 임계값 0.85 이상, must-pass 7/7 PASS)** — 감사 대상 커밋 `700f9e7`. 표준 3회 재시도 한도를 iteration 4·5에서 2회 초과했으며 모두 사용자 명시 승인 하에 진행했다. optional 결함 3건은 재감사 없이 run-phase 문서 touch-up으로 이연한다(`progress.md` §G 참고). 이 SPEC은 plan-audit 게이트를 최종 통과했다.

---

## 1. 배경 (Why)

`design/MIGRATION-PLAN.md`가 정의한 B2C 3단계 퍼널 중 사용자가 가장 먼저 만나는 진입점이 01 흐름이다. 회원가입 없이 사고·질병 경위를 한 줄로 입력하면, 건강정보 등 민감정보 처리 동의를 받은 뒤 몇 가지 추가 질문으로 정확도를 높이고, 분석이 끝나면 (미구현 상태인) 02 보상 진단 결과 화면으로 이어진다. 이 흐름은 로그인 없는 완전 공개 플로우이므로, 회원가입/PII 수집을 요구하는 순간 이탈이 발생한다 — `product.md`의 "이것도 되고 저것도 되고, 이만큼이나 나온다"는 핵심 메시지에 도달하기 전에 사용자를 잃지 않는 것이 이 SPEC의 존재 이유다.

SPEC-B2C-FOUNDATION-001은 `app/page.tsx`를 "서비스 준비 중입니다" placeholder로 남겨 두었다(PR #16 배포·검증 완료, `f7bdae7`). 이 SPEC의 후속 run-phase는 01 화면 UI 코드를 feature gate(`ENABLE_DIAGNOSIS_FLOW`/`DIAGNOSIS_ENGINE_READY`) 뒤에 추가하는 단계이며, run-phase 완료 자체가 프로덕션 placeholder 교체를 의미하지 않는다. 프로덕션 placeholder가 실제로 교체되는 시점은 다음 조건을 모두 충족한 뒤다 — (1) 동의 상세 6개 문구 확정, (2) `ENABLE_DIAGNOSIS_FLOW=true`, (3) 실제 매칭 엔진 연결 완료, (4) `DIAGNOSIS_ENGINE_READY=true`.

## 2. 범위 (Scope)

### 포함 화면 (Desktop 6 + Mobile 4 = 10개, `design/exports/` 기준)

| 화면 | 노드 ID | Export 파일 |
|---|---|---|
| 01 · 질문 입력 | `l8dM0b` | `01-보상-진단-질문-입력.png` |
| 01-A2 · 진단 시작 동의 | `XwmcG` | `01-A2-진단-시작-동의.png` |
| 01-B · 추가 질문 | `brnkd` | `01-B-추가-질문.png` |
| 01-C · 진단 중 | `m9I9F` | `01-C-진단-중.png` |
| 01-D · 결과 없음 | `gr6yg` | `01-D-결과-없음.png` |
| 01-E · 분석 오류 | `ypguY` | `01-E-분석-오류.png` |
| M01 · 질문 입력 | `O0vcB2` | `M01-질문-입력.png` |
| M01-A2 · 진단 시작 동의 | `il8qG` | `M01-A2-진단-시작-동의.png` |
| M01-B · 추가 질문 | `hUhRy` | `M01-B-추가-질문.png` |
| M01-C · 진단 중 | `f3GSmO` | `M01-C-진단-중.png` |

DEV ONLY 참고 자료(구현 대상 아님, 자리표시자 상태로 보존): `design/internal/DEV-ONLY-01-A3-건강정보-동의-상세-Desktop.png`, `design/internal/DEV-ONLY-M01-A3-건강정보-동의-상세-Mobile.png`.

### 산출물 (이번 plan-phase)

`spec.md`(본 문서) · `plan.md` · `acceptance.md` · `design.md` · `research.md` · `progress.md`. 코드, 스키마, API, E2E 테스트는 포함하지 않는다 — 모두 후속 run-phase 산출물이다.

후속 run-phase의 산출물 범위는 4갈래로 나뉜다 — ① 프로덕션 애플리케이션 코드(`app/`, `components/`, `lib/validation/`), ② 테스트(단위·컴포넌트 테스트 및 `e2e/`), ③ 문서(`.moai/` SPEC 산출물 및 프로젝트 문서), ④ 배포(`.github/workflows/deploy.yml`, `ENABLE_DIAGNOSIS_FLOW` 전환 시점에만 수정). 아래 `module:` frontmatter 필드는 이 중 ①(프로덕션 코드) 범위만을 가리키며, 전체 4갈래 범위는 `plan.md` §D를 참고한다.

## 3. 요구사항 (GEARS)

### 3.1 제품 원칙 (Ubiquitous)

- **REQ-B2CDIAG-001**: 시스템은 01 진단 플로우 전체에서 로그인, 회원가입, Better Auth 세션 복구를 요구하지 않는다.
- **REQ-B2CDIAG-002**: 시스템은 01 진단 플로우에서 이름, 전화번호, 상담 신청 정보, 마케팅 수신 동의를 수집하지 않는다.
- **REQ-B2CDIAG-003**: 시스템은 진단 단계에서 일반 개인정보 수집·이용 동의를 별도로 요구하지 않으며, 건강정보 등 민감정보 처리 동의 1건만 필수로 요구한다.
- **REQ-B2CDIAG-004**: 시스템은 진단 단계의 입력·응답 데이터를 상담 신청 데이터처럼 서버에 영구 저장하지 않는다.

### 3.2 동의 플로우 — 01-A2 / M01-A2 (Event-driven / State-driven)

- **REQ-B2CDIAG-005** (When): 사용자가 01 화면에서 검색창에 검색어를 직접 입력하거나 "많이 찾는 사례" 칩을 클릭해 검색창을 채운 뒤 "보상 진단" 버튼을 클릭할 때, 시스템은 민감정보 처리 동의 화면(01-A2/M01-A2)을 표시한다. 두 입력 경로(직접 입력 / 칩 클릭)는 검색창을 채우는 동등한 대체 수단이며, 그 이후의 "보상 진단" 클릭 → 동의 화면 표시 흐름은 입력 경로와 무관하게 동일하다.
- **REQ-B2CDIAG-006** (While): 필수 동의 체크박스가 선택되지 않은 동안, 시스템은 "동의하고 진단하기" CTA를 비활성화 상태로 유지한다.
- **REQ-B2CDIAG-007** (When): 사용자가 "내용 보기"를 클릭할 때, 시스템은 Desktop에서는 Modal을, Mobile에서는 Bottom Sheet를 열어 동의 상세 내용을 표시하며, 이 동작만으로 동의 체크박스를 자동 선택하지 않는다.
- **REQ-B2CDIAG-008** (When): 사용자가 동의 상세 보기에서 닫기 버튼, ESC 키, 배경(Dim) 클릭 중 하나를 수행할 때, 시스템은 상세 보기를 닫고 포커스를 "내용 보기" 트리거로 되돌린다.
- **REQ-B2CDIAG-009** (Ubiquitous): 시스템은 동의 체크박스와 그 설명 텍스트를 스크린리더가 하나의 항목으로 인식하도록 접근성 속성으로 연결한다.

### 3.3 추가 질문 · 상태 전이 — 01-B/M01-B, 01-C/M01-C, 01-D, 01-E (Event-driven)

- **REQ-B2CDIAG-010** (When): 사용자가 필수 동의를 완료하고 "동의하고 진단하기"를 클릭할 때, 시스템은 추가 질문(01-B/M01-B) 화면으로 전환하고 질문을 하나씩 순서대로 표시한다.
- **REQ-B2CDIAG-011** (When): 사용자가 추가 질문 화면에서 "건너뛰고 결과 보기"를 클릭할 때, 시스템은 남은 질문에 응답 없이 즉시 진단 중(01-C/M01-C) 상태로 전환한다.
- **REQ-B2CDIAG-012** (When): 추가 질문 응답이 모두 끝나거나 스킵될 때, 시스템은 진단 중 상태로 전환하고 단계별 분석 진행 표시를 렌더링한다.
- **REQ-B2CDIAG-013** (When): 매칭되는 담보가 없는 것으로 판정될 때, 시스템은 결과 없음(01-D) 상태를 표시하고 입력 내용 수정 경로를 제공한다.
- **REQ-B2CDIAG-014** (When): 분석 처리 자체가 실패할 때, 시스템은 분석 오류(01-E) 상태를 표시하며 입력 내용을 보존한 채로 "다시 시도"와 "입력 내용으로 돌아가기" 두 가지 복구 경로를 제공한다.

### 3.4 새로고침 · 직접 URL 접근 · 동의 철회 · 뒤로 가기 (Event-driven / Where)

- **REQ-B2CDIAG-015** (When): 사용자가 진단 플로우 화면을 새로고침할 때, 시스템은 입력값·동의 상태·추가 질문 응답을 모두 초기화하고 01 초기 입력 화면으로 되돌린다.
- **REQ-B2CDIAG-016** (When): 프로덕션 환경에서 중간 상태(동의 완료 이후·추가 질문·진단 중·결과)에 해당하는 URL로 직접 접근할 때, 시스템은 선행 상태가 클라이언트 메모리에 없으면 01 초기 입력 화면으로 되돌린다.
- **REQ-B2CDIAG-017** (Where): `ENABLE_DIAGNOSIS_DEV_STATES` 서버 전용 환경 변수(기본값 `false`)가 `true`로 설정된 비프로덕션 환경에서, 시스템은 `?devStep=` 쿼리 파라미터를 통해 선행 상태 없이도 지정된 상태(동의 상세/진단 중/결과 없음/오류)를 강제로 렌더링한다. `app/page.tsx`(Server Component)가 이 플래그를 서버 측에서 읽어 `enableDevStates` boolean prop으로 `<DiagnosisFlow />`에 전달하며, 클라이언트 컴포넌트는 `process.env`를 직접 읽지 않는다. Oracle 프로덕션에서는 이 플래그를 설정하지 않거나 명시적으로 `false`로 유지한다. `ENABLE_DIAGNOSIS_DEV_STATES`는 REQ-B2CDIAG-025의 `ENABLE_DIAGNOSIS_FLOW`(01 플로우 전체의 프로덕션 활성화 게이트)와는 별개의 플래그다 — 전자는 devStep 강제 진입 여부를, 후자는 01 플로우 자체가 프로덕션에 존재하는지를 결정한다. `ENABLE_DIAGNOSIS_DEV_STATES`는 REQ-B2CDIAG-025가 정의하는 `reviewEnabled` 경로를 구성하는 유일한 입력이다.
- **REQ-B2CDIAG-018** (When): 사용자가 동의 완료 이후 필수 동의를 철회할 때, 시스템은 다음 단계로의 진행을 차단하고 그 시점까지 입력된 데이터를 다음 단계로 전달하지 않는다.
- **REQ-B2CDIAG-019** (When): 사용자가 추가 질문 화면에서 이전 단계(동의 화면)로 돌아갈 때, 시스템은 이미 완료된 필수 동의 상태를 같은 세션 내에서는 유지한다.

### 3.5 기술 원칙 (Ubiquitous)

- **REQ-B2CDIAG-020**: 시스템은 01 진단 입력을 스키마 기반으로 검증한다 — 검색어 필드는 1~200자 길이 제한을 가지며(200자 초과 입력은 차단), 그 범위 안에서 PII 검증을 2단계로 적용한다: (자동 차단) 휴대전화번호 형식과 주민등록번호(RRN) 형식처럼 구조적으로 신뢰성 있게 식별 가능한 패턴은 정규식으로 구조적으로 거부한다. (안내만 제공) 이름·주소 등 그 외 개인식별정보는 구조적으로 거부하지 않으며, 기존 경고 배너(`notice.tsx`)를 통한 안내만 제공한다 — 이름 형식은 정규식으로 신뢰성 있게 판별할 수 없고 오탐(false positive)이 불가피하므로 자동 거부 대상에서 제외한다.
- **REQ-B2CDIAG-021**: 시스템은 진단 플로우 상태를 클라이언트 메모리(컴포넌트 상태) 안에서만 관리하며, 서버 세션이나 DB에 상태를 저장하지 않는다.
- **REQ-B2CDIAG-022**: 시스템은 Desktop(1440px 기준)과 Mobile(390px 기준) 두 반응형 레이아웃을 제공하며, 동일한 상태 머신과 데이터 모델을 공유한다.
- **REQ-B2CDIAG-023**: 시스템은 `ENABLE_DIAGNOSIS_FLOW`와 `DIAGNOSIS_ENGINE_READY`가 프로덕션에서 실제로 모두 `true`로 전환되는 시점에 맞춰 배포 스모크 체크를 갱신해야 한다 — 이 전환 시점은 "01 화면 코드가 merge됨" 또는 "run-phase 마일스톤 완료" 시점과 다르다(REQ-B2CDIAG-025 참고). 갱신 작업 자체는 이 SPEC의 run-phase 마일스톤(`plan.md` M11)에 문서화되어 있으나, 실제 워크플로 파일(`.github/workflows/deploy.yml`) 수정은 두 플래그가 실제로 모두 `true`로 전환되는 시점에만 이뤄지는 비블로킹 후속 작업이며 — 이 SPEC의 sync-phase `completed` 전환 조건이 아니다(`plan.md` M11, `acceptance.md` AC-B2CDIAG-024 참고).

### 3.6 금지 사항 및 프로덕션 활성화 게이트 (Unwanted — shall not)

- **REQ-B2CDIAG-024**: 시스템은 실제 담보 매칭 엔진이 연결되지 않은 현재 상태에서, mock 진단 결과를 실제 진단 결과처럼 사용자에게 제시해서는 안 된다.
- **REQ-B2CDIAG-025**: 시스템은 `<DiagnosisFlow />` 렌더링 여부를 두 개의 독립된 경로의 논리합(OR)으로 결정한다. **경로 1 — `productionReady`**: `ENABLE_DIAGNOSIS_FLOW`(01 플로우 자체의 노출 여부, 기본값 `false`)와 `DIAGNOSIS_ENGINE_READY`(실제 담보 매칭 엔진 연결 여부, 기본값 `false`) 두 서버 전용 환경 변수의 논리곱(AND) — `productionReady = ENABLE_DIAGNOSIS_FLOW === true && DIAGNOSIS_ENGINE_READY === true`. **경로 2 — `reviewEnabled`**: REQ-B2CDIAG-017의 `ENABLE_DIAGNOSIS_DEV_STATES` 서버 전용 환경 변수(기본값 `false`) 그대로 — `reviewEnabled = ENABLE_DIAGNOSIS_DEV_STATES === true`. `app/page.tsx`는 `shouldRenderDiagnosis = productionReady || reviewEnabled`를 **한 곳에서만** 계산하며, 이 값이 거짓인 동안 실제 사용자에게 `<DiagnosisFlow />`를 전혀 렌더링해서는 안 되고 현재의 "서비스 준비 중입니다" placeholder를 계속 렌더링한다. `reviewEnabled` 경로는 UI 검증과 Playwright 시각 회귀 테스트 전용이며, 실제 담보 매칭 엔진이 준비되었다는 뜻이 아니다 — `DIAGNOSIS_ENGINE_READY`를 테스트 편의를 위해 거짓으로 `true` 설정해서는 안 된다. Oracle 프로덕션에서는 `ENABLE_DIAGNOSIS_DEV_STATES`를 unset이거나 명시적으로 `false`로 유지한다. 실제 담보 매칭 엔진 연결은 이 SPEC의 명시적 Out of Scope이므로(§4), 이 SPEC이 전달하는 코드 자체에는 `DIAGNOSIS_ENGINE_READY`를 `true`로 설정하는 지점이 존재하지 않는다 — 따라서 `productionReady`는 이 SPEC이 전달한 코드 범위 안에서는 구조적으로 항상 거짓이며, 프로덕션에서 mock 노출이 발생할 수 있는 유일한 경로는 `reviewEnabled`(비프로덕션 전용)뿐이다. `DIAGNOSIS_ENGINE_READY`를 `true`로 전환하는 것은 실제 매칭 엔진을 연결하는 후속 SPEC의 몫이다. 이와 별개로, `ENABLE_DIAGNOSIS_FLOW`를 `true`로 전환하려면 동의 상세 화면의 6개 placeholder 문구(§4 참고)가 모두 실제 확정 문구로 교체된 상태여야 한다. 이 SPEC의 run-phase가 01 화면 UI 구현을 완료하더라도 `productionReady`가 프로덕션에서 거짓으로 유지되는 것은 정상적인 결과이며 실패가 아니다 — "코드가 구현됨"과 "프로덕션에서 활성화해도 안전함"은 서로 다른 상태다.

## 4. Out of Scope

### Out of Scope — 후속 퍼널 단계

- 02 보상 진단 결과 화면(및 M02 계열)의 실제 구현
- 03 상담 신청 · 손해사정사 연결 화면(및 M03 계열)의 실제 구현, 이름·전화번호 수집, 상담 접수 처리

### Out of Scope — 인증·기존 B2B 자산

- 로그인·회원가입·Better Auth 복구 (SPEC-B2C-FOUNDATION-001에서 이미 삭제 완료)
- 기존 B2B 사건 관리 화면·로그인 E2E 시나리오 복원

### Out of Scope — 매칭·AI·데이터

- 보험 가입 여부의 실제 외부 조회
- 보상 가능성 매칭 엔진의 실제 구현(정적 규칙 vs AI, `tech.md` § 담보 매칭 로직 — 미결정 사항 참고)
- Gemini 등 외부 AI의 실제 호출
- `lib/pipeline/` 재사용 여부 결정 (REQ-B2CFOUND-007, 담보 매칭 로직 결정과 함께 판단할 후속 SPEC의 몫 — 이 SPEC은 그 결정에 관여하지 않는다)
- 신규 DB 영구 저장 구조 설계·마이그레이션

### Out of Scope — 법률·확정 문구

- 법률·보험 자문처럼 보이는 확정적 결과 문구
- `design/internal/`의 6개 placeholder 항목(처리 목적 / 처리하는 건강정보 항목 / 서버 저장 여부 / 보유·이용 기간 / 외부 AI 서비스 전송 여부 / 동의 거부 권리 및 진단 이용 제한)의 실제 문구 확정 — 전체 목록은 `plan.md` §B "미결정 사항" 참고. 동의 상세 UI 컨테이너(Modal/Bottom Sheet 셸) 구현은 이 6개 문구의 법무 확정과 별개이며, `ENABLE_DIAGNOSIS_FLOW`는 6개 문구가 모두 확정되기 전까지 프로덕션에서 `true`로 전환할 수 없다(REQ-B2CDIAG-025)
- Pencil 디자인 원본(`design/claimradar-ui.pen`, `design/exports/`, `design/internal/`) 수정

### Out of Scope — 디자인 신규 제작

- `M01-D`/`M01-E`(모바일 결과없음/분석오류) 디자인 신규 제작 — 현재 디자인에 부재하며, 이 SPEC은 Desktop `01-D`/`01-E` 컴포넌트를 반응형으로 재사용하기로 확정했다(`design.md` §1, §13) — 신규 Pencil/Figma 산출물은 제작하지 않는다

### Out of Scope — 테스트

- 02 결과 화면 테스트, 03 상담 신청 테스트, 01→02→03 전체 E2E, 실제 매칭 엔진 검증, 실제 상담 접수 검증
- 현재 0개인 `pnpm test:e2e`를 이 plan-phase에서 강제로 통과시키거나 placeholder 테스트를 추가하는 것

## 5. 참고 문서

- `design/MIGRATION-PLAN.md` — 디자인 SSOT (2026-09-18 최종 갱신)
- `.moai/specs/SPEC-B2C-FOUNDATION-001/` — 선행 SPEC (B2B 삭제 · B2C 최소 셸 전환, 완료)
- `.moai/project/structure.md` § 목표 구조 (제안, B2C 방향, 미구현)
- `.moai/project/tech.md` § PII 정책 예외 및 리드 폼 검증 스키마, § 담보 매칭 로직 — 미결정 사항
