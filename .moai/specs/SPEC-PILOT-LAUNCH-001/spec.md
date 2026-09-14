---
id: SPEC-PILOT-LAUNCH-001
title: "프로덕션 사용자 문구 정리 및 계정 운영 준비"
version: "0.1.0"
status: draft
created: 2026-09-14
updated: 2026-09-14
author: Nexsol
priority: P2
phase: "v1.1.0 target"
module: "app/login/, app/cases/new/, .moai/docs/"
lifecycle: spec-anchored
tags: "pilot, copy-cleanup, account-provisioning, data-handling"
tier: S
depends_on: [SPEC-PILOT-READY-001]
---

## HISTORY

- 2026-09-14: 최초 작성 (Nexsol) — SPEC-PILOT-READY-001이 `status: completed`,
  readiness 7개 항목 전부 READY, 전체 판정 GO, PR #10 병합(`d74ece4`)으로 종결된
  이후, 실제 프로덕션 사용을 준비하기 위한 후속 SPEC. Netlify 프로덕션 배포는
  사용자가 이미 완료했다고 확인했다(이 SPEC 범위 밖 사실로 전제). 신규 비즈니스
  기능은 도입하지 않으며, ①사용자 노출 "테스터"/"파일럿" 문구를 정상 서비스
  문구로 교정, ②내부 구현 식별자(DB 테이블·CLI 스크립트·환경변수·E2E 픽스처)는
  명시적으로 보존, ③사건 입력 화면의 비식별 안내 문구 중 남아 있는 과대 주장
  1건을 정정, ④실 계정 발급 절차 문서화(스크립트 변경 없음), ⑤비밀번호
  재설정·계정 비활성화·계정 목록 조회는 최소 설계 스케치만 남기고 구현하지
  않음, ⑥SPEC-PILOT-READY-001 문서 동기화 상태 회귀 확인으로 범위를 고정한다.
  plan-phase 조사는 오케스트레이터 세션에서 Grep/Read로 실제 코드베이스를
  read-only로 조사해 확인한 구체적 문구·파일 위치만을 근거로 삼았다.

## §1. 개요 (Overview)

### WHY — 배경 및 동기

SPEC-PILOT-READY-001은 파일럿을 외부 테스터에게 안전하게 열기 위한 **운영
준비**(호스팅 타임아웃, 동시성 가드, 로깅, 런북, 비식별 고지 정직성)를 완료했다.
그러나 그 SPEC은 "테스터"라는 명칭 자체나 로그인 화면의 파일럿 특유 문구를
교정 대상으로 다루지 않았다 — REQ-PILOT-READY-012/013/014는 사건 입력 화면의
비식별 고지 정직성에 집중했을 뿐, 로그인 화면의 "TESTER LOGIN" 캡션이나
"테스터 로그인" 헤딩은 범위 밖이었다. 사용자가 이제 프로덕션 배포를 완료하고
정식 서비스로 전환을 준비하면서, 화면에 남아 있는 파일럿 단계 문구가 실제
사용자에게 노출되는 것을 정리하고자 한다.

### WHAT — 이번 SPEC 범위

- 로그인 화면(`app/login/page.tsx`, `app/login/login-form.tsx`)의 사용자 노출
  "테스터"/"파일럿" 문구를 정상 서비스 문구로 교체한다.
- `allowed_testers` DB 테이블, `pnpm tester:add` CLI, `TESTER_PASSWORD` 환경변수,
  E2E 테스터 A/B 픽스처 등 **내부 구현 식별자는 변경하지 않는다** — 사용자 노출
  문구와 내부 식별자는 서로 다른 층위이며, 이 SPEC은 전자만 다룬다.
- 사건 입력 화면 폼 하단(`app/cases/new/case-input-form.tsx`)에 남아 있는 비식별
  "처리 보장" 과대 주장 1건을 정정한다 — 우측 Notice(`app/cases/new/page.tsx`)는
  SPEC-PILOT-READY-001에서 이미 교정됐으나, 같은 화면의 폼 하단 문구는 교정
  대상에서 누락됐었다.
- 실 계정 발급 절차(`pnpm tester:add` 실행법 + 알려진 제약)를 신규 문서로
  기록한다 — 스크립트 코드 자체는 변경하지 않는다.
- 비밀번호 재설정·계정 비활성화·계정 목록 조회는 이 SPEC에서 구현하지 않으며,
  최소 설계 스케치만 Out of Scope 절에 남긴다.
- SPEC-PILOT-READY-001의 README.md/product.md 문서 동기화 상태(status:
  completed, GO, PR #10 `d74ece4`)가 회귀하지 않았음을 재확인한다.

### 핵심 판단 근거 — Tier S

영향 파일은 `app/login/page.tsx`, `app/login/login-form.tsx`,
`app/cases/new/case-input-form.tsx`(문구 교체, 각 파일 1~2줄), 신규 문서
`.moai/docs/account-provisioning.md` 1개로 총 4개이며, 변경 LOC은 300줄을
크게 밑돈다(대부분 문자열 치환). 스키마 변경, 아키텍처 결정, 신규 컴포넌트가
없으므로 Tier S(< 300 LOC, < 5 files)로 분류한다 — plan.md §Tier 판단 참고.

## §2. 요구사항 (Requirements — GEARS 표기법)

### A. 로그인 화면 테스터 문구 제거 (Login Screen Tester-Language Removal)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-LAUNCH-001 | Unwanted | 로그인 화면은 파일럿 테스트 단계를 연상시키는 사용자 노출 문구를 표시해서는 안 된다. 구체적으로: (a) 캡션 "TESTER LOGIN"(`app/login/page.tsx:110`)은 제거한다; (b) 헤딩 "테스터 로그인"(`app/login/page.tsx:112`)은 "로그인"으로 교체한다; (c) 부제 "운영자가 승인한 테스터 계정으로만 로그인할 수 있습니다."(`app/login/page.tsx:114`)는 "승인된 계정으로만 로그인할 수 있습니다."로 교체한다; (d) 폼 하단 안내 "테스터 계정은 운영자가 직접 발급합니다. 계정 문의는 담당자에게 연락해 주세요."(`app/login/login-form.tsx:143`)는 "계정은 운영자가 직접 발급합니다. 발급 및 로그인 문의는 담당자에게 연락해 주세요."로 교체한다. | Grep 조사 확인(`app/login/page.tsx:110,112,114`, `app/login/login-form.tsx:143`) |

### B. 내부 구현 식별자 보존 (Internal Identifier Preservation)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-LAUNCH-002 | Unwanted | REQ-PILOT-LAUNCH-001의 사용자 노출 문구 교체는 다음 내부 구현 식별자를 변경해서는 안 된다: `allowed_testers` DB 테이블(`lib/db/schema.ts`의 `allowedTesters`), `pnpm tester:add` CLI 스크립트명과 그 내부 함수(`scripts/provision-tester.ts`의 `provisionTester`/`runCli`/`parseEmailArg`), `TESTER_PASSWORD` 환경변수명, E2E 테스터 A/B 픽스처(`scripts/e2e-tester-emails.ts`의 `TESTER_A_EMAIL`/`TESTER_B_EMAIL`, `e2e/*.spec.ts`), 그리고 이미 완료된 SPEC 본문(SPEC-PILOT-READY-001 등)의 HISTORY 서술. 스키마 변경·마이그레이션·식별자 rename 리팩터는 이 SPEC의 범위가 아니다. | Read 조사 확인(`lib/db/schema.ts`, `scripts/provision-tester.ts`, `scripts/e2e-tester-emails.ts`, `package.json:17`) |

### C. 사건 입력 화면 비식별 안내 문구 정정 (Case-Input De-identification Notice Correction)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-LAUNCH-003 | Unwanted | `app/cases/new/case-input-form.tsx`의 폼 하단 안내 문구(현재: "입력 내용은 비식별 상태로 처리되며 리서치 목적 외에 사용되지 않습니다.", `case-input-form.tsx:352`)는 시스템이 입력 내용을 비식별 상태로 "처리한다"는 수동태 보장 표현을 사용해서는 안 된다 — `lib/validation/case-input.ts`의 스키마는 자유 텍스트 3개 필드(`incidentDescription`/`diagnosisName`/`disabilityBodyPart`)에 입력된 임의의 식별정보를 탐지·비식별화하지 않는다(SPEC-PILOT-READY-001 REQ-PILOT-READY-011에서 이미 코드로 확인된 사실과 동일). 이 문구는 사용자에게 합성이거나 이미 비식별화된 사례만 입력하도록 요구하는 능동 지시 표현으로 교체되어야 하며, 같은 화면 우측 Notice(`app/cases/new/page.tsx:66`)가 이미 채택한 "합성이거나 이미 비식별화된 사례만 입력해 주세요." 표현과 통일해야 한다. "리서치 목적 외에 사용되지 않습니다"라는 이용 목적 제한 진술 자체는 비식별화 보장 주장이 아니므로 유지할 수 있다. | Grep 조사 확인(`app/cases/new/case-input-form.tsx:352` vs `app/cases/new/page.tsx:66` — 같은 화면 안에서 두 문구가 서로 다른 정직성 수준을 갖고 있음을 확인) |
| REQ-PILOT-LAUNCH-004 | Ubiquitous | REQ-PILOT-LAUNCH-003의 교정된 문구는 SPEC-PILOT-READY-001 REQ-PILOT-READY-011(과대 주장 금지, HARD constraint — "보장"·"확실히 차단" 등 표현 사용 금지)을 그대로 재확인해야 하며, 새로운 예외나 완화된 표현을 만들지 않는다. | SPEC-PILOT-READY-001 REQ-PILOT-READY-011 상속 |

### D. 계정 프로비저닝 절차 문서화 (Account Provisioning Documentation)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-LAUNCH-005 | Ubiquitous | 운영자가 `pnpm tester:add`로 실제 원격 Turso 프로덕션 대상에 실 계정을 발급하는 절차를 신규 문서 `.moai/docs/account-provisioning.md`에 기록해야 한다. 문서는 최소한 다음을 포함해야 한다: (a) 이 스크립트가 로컬 `file:` DB가 아니라 프로덕션 원격 DB(`TURSO_DATABASE_URL`)를 직접 대상으로 함을 명시; (b) 이미 존재하는 이메일로 재실행하면 계정을 건드리지 않고 조용히 스킵한다는 알려진 제약(`scripts/provision-tester.ts`의 existing-user 조기 `return` 경로에서 확인됨 — 비밀번호는 재설정되지 않는다) — 재발급이 필요한 경우 이 스크립트만으로는 처리할 수 없음을 명시; (c) 실제 비밀번호나 발급된 계정의 비밀값을 이 문서에 절대 기록하지 않는다는 경고. 이 문서는 `.moai/docs/pilot-incident-runbook.md`(파일럿 **운영 중** 장애 대응 절차, 이미 별도 문서로 확립된 관례 — 그 문서 자신도 "이 문서는 파일럿 운영 중 장애 대응 절차다", "`runtime-runbook.md`와는 서로 다른 문서" 라고 명시함)와 관심사가 다른(계정 **사전** 발급 절차 vs **사후** 장애 대응) 별개 신규 문서여야 한다. `scripts/provision-tester.ts` 코드 자체는 변경하지 않는다. | Read 조사 확인(`scripts/provision-tester.ts:139-147` existing-user 조기 반환, `.moai/docs/pilot-incident-runbook.md:1-5` 기존 문서 분리 관례) |

### F. SPEC-PILOT-READY-001 문서 동기화 확인 (Doc-Sync Regression Confirmation)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-PILOT-LAUNCH-006 | Ubiquitous | README.md와 `.moai/project/product.md`는 SPEC-PILOT-READY-001의 `status: completed`, readiness 7개 항목 전부 READY, 전체 판정 GO, PR #10 병합 커밋 `d74ece4`를 정확히 반영해야 한다. 이 SPEC의 plan-phase 조사에서 이미 일치를 확인했다(README.md:19,142, product.md:3-5,82,101,104). 이 REQ는 회귀 방지를 위한 확인 항목이며, run-phase 착수 시점에 동일한 Grep으로 재확인해 그 결과를 progress.md에 기록해야 한다 — 이미 확인된 사실을 다시 "구현"하지 않는다. | Grep 조사 확인(README.md:19,142; product.md:3-5,82,101,104 — 모두 일치, 불일치 없음) |

## Out of Scope

### Out of Scope — 비밀번호 재설정 (Password Reset)

- 로그인 화면 또는 계정 관리 화면에 비밀번호 재설정 기능을 추가하는 것은 이
  SPEC의 범위가 아니다. **최소 설계 스케치**: better-auth가 이미 제공하는
  이메일 기반 비밀번호 재설정 흐름(`emailAndPassword.sendResetPassword`
  콜백)을 `lib/auth/config.ts`에 연결하고, 재설정 요청 페이지 1개를
  `app/login/` 하위에 추가하는 방향이 유력한 후보다 — 이메일 발송 인프라
  구성(발신 도메인/전송 서비스 선택)이 선행 결정으로 필요하다.

### Out of Scope — 계정 비활성화 (Account Deactivation)

- 특정 계정을 로그인 불가 상태로 전환하는 기능은 이 SPEC의 범위가 아니다.
  **최소 설계 스케치**: `user` 테이블에 `disabled: boolean`(기본값 `false`)
  컬럼을 추가하고, 로그인 처리 경로에서 이 값을 확인해 `true`면 거부하는
  가드를 추가하는 방향이 유력한 후보다 — 마이그레이션 1개가 필요하다.

### Out of Scope — 계정 목록 조회 (Account Listing)

- 발급된 계정 목록을 조회하는 기능(UI 또는 CLI)은 이 SPEC의 범위가 아니다.
  **최소 설계 스케치**: `pnpm tester:add`와 대칭되는 `pnpm tester:list`
  스크립트를 `scripts/`에 추가해 `allowed_testers`와 `user` 테이블을 이메일
  기준으로 조인해 콘솔에 출력하는 간단한 CLI가 유력한 후보다 — 신규 UI 화면은
  필요하지 않다.

### Out of Scope — 스키마 변경 및 내부 식별자 rename

- REQ-PILOT-LAUNCH-002가 명시하는 대로, `allowed_testers` 테이블·`tester:add`
  스크립트명·`TESTER_PASSWORD` 환경변수·E2E 테스터 A/B 픽스처의 rename이나
  마이그레이션은 이 SPEC의 범위가 아니다.

### Out of Scope — 실 계정 생성·이메일 발송·Gemini 재호출·배포

- 이 SPEC의 plan-phase 및 run-phase 모두 실 계정을 생성하거나, 이메일을
  발송하거나, Gemini API를 호출하거나, 원격 DB에 쓰거나, 배포를 수행하지
  않는다 — REQ-PILOT-LAUNCH-005는 기존 절차를 **문서화**하는 것만 요구하며
  그 절차를 실행하는 것을 요구하지 않는다.

## §3. 인수 조건 (Acceptance Criteria — Given-When-Then)

| AC | 연결 REQ | 시나리오 |
|----|----------|----------|
| AC-PILOT-LAUNCH-001 | REQ-PILOT-LAUNCH-001 | **Given** `app/login/page.tsx`와 `app/login/login-form.tsx`가 수정된 상태, **When** 두 파일의 렌더링된 텍스트를 확인하면, **Then** "TESTER LOGIN" 문자열은 존재하지 않고, 헤딩은 "로그인"이며, 부제는 "승인된 계정으로만 로그인할 수 있습니다."이고, 폼 하단 안내는 "계정은 운영자가 직접 발급합니다. 발급 및 로그인 문의는 담당자에게 연락해 주세요."이다. |
| AC-PILOT-LAUNCH-002 | REQ-PILOT-LAUNCH-002 | **Given** REQ-PILOT-LAUNCH-001 적용 이후의 코드베이스, **When** `grep -rn "allowedTesters\|tester:add\|TESTER_PASSWORD\|TESTER_A_EMAIL\|TESTER_B_EMAIL" lib/ scripts/ package.json e2e/`를 실행하면, **Then** 이 SPEC 착수 이전과 동일한 결과(파일·라인 단위로 무변경)가 나온다. |
| AC-PILOT-LAUNCH-003 | REQ-PILOT-LAUNCH-003, REQ-PILOT-LAUNCH-004 | **Given** `app/cases/new/case-input-form.tsx`가 수정된 상태, **When** 폼 하단 안내 텍스트를 확인하면, **Then** "비식별 상태로 처리되며"라는 수동태 보장 표현은 존재하지 않고, "합성이거나 이미 비식별화된 사례만 입력"이라는 능동 지시 표현이 포함되어 있으며, "보장"·"확실히 차단" 등 REQ-PILOT-READY-011이 금지하는 과대 주장 표현이 새로 추가되지 않았다. |
| AC-PILOT-LAUNCH-004 | REQ-PILOT-LAUNCH-005 | **Given** `.moai/docs/account-provisioning.md`가 신규 작성된 상태, **When** 문서 내용을 확인하면, **Then** (a)~(c) 3가지 필수 내용(원격 프로덕션 대상 명시, 재실행 시 비밀번호 미변경 제약, 비밀값 미기록 경고)이 모두 포함되어 있고, 실제 비밀번호나 발급된 계정의 값은 어디에도 기록되어 있지 않으며, `scripts/provision-tester.ts`는 `git diff`상 무변경이다. |
| AC-PILOT-LAUNCH-005 | REQ-PILOT-LAUNCH-006 | **Given** run-phase 착수 시점의 README.md와 `.moai/project/product.md`, **When** SPEC-PILOT-READY-001 관련 문구(`status: completed`, 7개 항목 READY, 전체 GO, PR #10 `d74ece4`)를 Grep으로 재확인하면, **Then** plan-phase에서 확인한 것과 동일하게 일치하며, 불일치가 발견되면 이 SPEC의 REQ-PILOT-LAUNCH-006 하위 항목으로 정정 내용을 기록한다. |
| AC-PILOT-LAUNCH-006 | Out of Scope 절 전체 | **Given** run-phase 완료 시점의 diff, **When** 변경된 파일 목록을 확인하면, **Then** 비밀번호 재설정·계정 비활성화·계정 목록 조회 기능에 해당하는 신규 코드(라우트, DB 컬럼, CLI 스크립트)가 존재하지 않는다. |

## §4. 교차 참조

- SPEC-PILOT-READY-001 — 이 SPEC이 이어받는 파일럿 배포 준비 SPEC (REQ-PILOT-READY-011/012/013/014의 데이터 취급 고지 정직성 원칙을 상속)
- `.moai/docs/pilot-incident-runbook.md` — 파일럿 운영 중 장애 대응 절차 (관심사가 다른 별개 문서, REQ-PILOT-LAUNCH-005가 신규 문서를 그 옆에 별도로 두는 근거)
- `.moai/docs/runtime-runbook.md` — 로컬 개발 환경 설정 절차
