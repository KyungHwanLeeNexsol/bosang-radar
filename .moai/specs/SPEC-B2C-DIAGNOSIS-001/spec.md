---
id: SPEC-B2C-DIAGNOSIS-001
title: "01 진단 플로우 — 질문 입력 · 동의 · 추가 질문 · 진단 중 (Plan-Phase)"
version: "0.1.0"
status: draft
created: 2026-09-18
updated: 2026-09-18
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

---

## 1. 배경 (Why)

`design/MIGRATION-PLAN.md`가 정의한 B2C 3단계 퍼널 중 사용자가 가장 먼저 만나는 진입점이 01 흐름이다. 회원가입 없이 사고·질병 경위를 한 줄로 입력하면, 건강정보 등 민감정보 처리 동의를 받은 뒤 몇 가지 추가 질문으로 정확도를 높이고, 분석이 끝나면 (미구현 상태인) 02 보상 진단 결과 화면으로 이어진다. 이 흐름은 로그인 없는 완전 공개 플로우이므로, 회원가입/PII 수집을 요구하는 순간 이탈이 발생한다 — `product.md`의 "이것도 되고 저것도 되고, 이만큼이나 나온다"는 핵심 메시지에 도달하기 전에 사용자를 잃지 않는 것이 이 SPEC의 존재 이유다.

SPEC-B2C-FOUNDATION-001은 `app/page.tsx`를 "서비스 준비 중입니다" placeholder로 남겨 두었다(PR #16 배포·검증 완료, `f7bdae7`). 이 SPEC의 후속 run-phase가 그 placeholder를 실제 01 화면으로 교체하는 첫 SPEC이 된다.

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

## 3. 요구사항 (GEARS)

### 3.1 제품 원칙 (Ubiquitous)

- **REQ-B2CDIAG-001**: 시스템은 01 진단 플로우 전체에서 로그인, 회원가입, Better Auth 세션 복구를 요구하지 않는다.
- **REQ-B2CDIAG-002**: 시스템은 01 진단 플로우에서 이름, 전화번호, 상담 신청 정보, 마케팅 수신 동의를 수집하지 않는다.
- **REQ-B2CDIAG-003**: 시스템은 진단 단계에서 일반 개인정보 수집·이용 동의를 별도로 요구하지 않으며, 건강정보 등 민감정보 처리 동의 1건만 필수로 요구한다.
- **REQ-B2CDIAG-004**: 시스템은 진단 단계의 입력·응답 데이터를 상담 신청 데이터처럼 서버에 영구 저장하지 않는다.

### 3.2 동의 플로우 — 01-A2 / M01-A2 (Event-driven / State-driven)

- **REQ-B2CDIAG-005** (When): 사용자가 01 화면에서 검색어를 입력하고 "보상 진단" 버튼을 클릭할 때, 시스템은 민감정보 처리 동의 화면(01-A2/M01-A2)을 표시한다.
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
- **REQ-B2CDIAG-017** (Where): 개발·리뷰 목적의 지정된 쿼리 파라미터가 프로덕션이 아닌 환경에서 사용되는 경우, 시스템은 선행 상태 없이도 지정된 상태(동의 상세/진단 중/결과 없음/오류)를 강제로 렌더링한다.
- **REQ-B2CDIAG-018** (When): 사용자가 동의 완료 이후 필수 동의를 철회할 때, 시스템은 다음 단계로의 진행을 차단하고 그 시점까지 입력된 데이터를 다음 단계로 전달하지 않는다.
- **REQ-B2CDIAG-019** (When): 사용자가 추가 질문 화면에서 이전 단계(동의 화면)로 돌아갈 때, 시스템은 이미 완료된 필수 동의 상태를 같은 세션 내에서는 유지한다.

### 3.5 기술 원칙 (Ubiquitous)

- **REQ-B2CDIAG-020**: 시스템은 01 진단 입력을 스키마 기반으로 검증하며, 이름·전화번호·주민등록번호 형식에 해당하는 입력을 구조적으로 거부한다.
- **REQ-B2CDIAG-021**: 시스템은 진단 플로우 상태를 클라이언트 메모리(컴포넌트 상태) 안에서만 관리하며, 서버 세션이나 DB에 상태를 저장하지 않는다.
- **REQ-B2CDIAG-022**: 시스템은 Desktop(1440px 기준)과 Mobile(390px 기준) 두 반응형 레이아웃을 제공하며, 동일한 상태 머신과 데이터 모델을 공유한다.
- **REQ-B2CDIAG-023**: 시스템은 01 화면 구현이 배포되어 `/` 경로의 placeholder를 대체하는 시점에 배포 스모크 체크 갱신이 필요함을 후속 마일스톤으로 기록한다 — 실제 워크플로 수정은 이 SPEC의 범위 밖이다.

### 3.6 금지 사항 (Unwanted — shall not)

- **REQ-B2CDIAG-024**: 시스템은 실제 담보 매칭 엔진이 연결되지 않은 현재 상태에서, mock 진단 결과를 실제 진단 결과처럼 사용자에게 제시해서는 안 된다.

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
- `design/internal/`의 `{처리 목적 확정 문구}` 등 6개 placeholder 항목의 실제 문구 확정
- Pencil 디자인 원본(`design/claimradar-ui.pen`, `design/exports/`, `design/internal/`) 수정

### Out of Scope — 디자인 신규 제작

- `M01-D`/`M01-E`(모바일 결과없음/분석오류) 디자인 신규 제작 — 현재 디자인에 부재하며, 이 SPEC은 그 부재를 `design.md`의 미해결 질문으로 기록만 한다

### Out of Scope — 테스트

- 02 결과 화면 테스트, 03 상담 신청 테스트, 01→02→03 전체 E2E, 실제 매칭 엔진 검증, 실제 상담 접수 검증
- 현재 0개인 `pnpm test:e2e`를 이 plan-phase에서 강제로 통과시키거나 placeholder 테스트를 추가하는 것

## 5. 참고 문서

- `design/MIGRATION-PLAN.md` — 디자인 SSOT (2026-09-18 최종 갱신)
- `.moai/specs/SPEC-B2C-FOUNDATION-001/` — 선행 SPEC (B2B 삭제 · B2C 최소 셸 전환, 완료)
- `.moai/project/structure.md` § 목표 구조 (제안, B2C 방향, 미구현)
- `.moai/project/tech.md` § PII 정책 예외 및 리드 폼 검증 스키마, § 담보 매칭 로직 — 미결정 사항
