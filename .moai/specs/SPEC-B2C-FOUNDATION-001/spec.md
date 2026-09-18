---
id: SPEC-B2C-FOUNDATION-001
title: "B2B 코드 정리 및 B2C 공개 퍼널 기반 전환"
version: "0.1.0"
status: draft
created: 2026-09-18
updated: 2026-09-18
author: Nexsol
priority: P1
phase: "v0.16.0 target"
module: "app/, app/api/, components/, lib/auth/, lib/pipeline/, lib/ai/, lib/db/, lib/validation/, db/, e2e/, scripts/, proxy.ts, instrumentation.ts"
lifecycle: spec-anchored
tags: "b2c-pivot, b2b-cleanup, migration-safety, route-foundation, decision-gate, reproduction-first"
tier: L
---

## HISTORY

- 2026-09-18: 최초 작성 (Nexsol) — `.moai/project/product.md` §구조·공존 관계(2026-09-17 재확인)가 이미 "B2C가 유일한 제품, B2B 코드는 삭제한다"고 결정했으나, 실제 삭제·마이그레이션 실행은 "별도 SPEC에서 Reproduction-First 절차를 거쳐 진행"하도록 유보해 두었다. 이 SPEC이 그 유보된 별도 SPEC이다 — **plan-phase만 수행**하며, 실제 코드 삭제·DB 변경·배포는 하지 않는다. `design/MIGRATION-PLAN.md`(2026-09-18 갱신, 사용자용 24개+DEV ONLY 4개 기준)가 목표 B2C 화면 구조의 SSOT다.

## 1. WHY (배경)

보상레이더는 두 번의 방향 전환을 거쳤다. 최초 기획(B2B, 15개 SPEC 완료)은 보험설계사·손해사정사를 위한 비공개 사건 리서치 어시스턴트였다. 2026-09-17 재인터뷰에서 제품 방향이 B2C 보상 진단 퍼널(사고·질병 당사자 본인이 검색 한 줄로 놓치고 있는 담보를 진단받고 손해사정사 상담으로 연결되는 흐름)로 전환되었고, 같은 날 재확인에서 "B2C가 유일한 제품이며 B2B 코드는 삭제 대상"이라는 결정까지 내려졌다(`product.md` §구조·공존 관계).

그러나 이 결정은 문서 수준에서만 내려졌을 뿐, 실제 저장소 코드는 다음과 같은 상태로 남아 있다:

- **기존 코드**: `app/cases/*`, `app/login/*`, `lib/auth/`(Better Auth), `lib/pipeline/`(6단계 리서치 파이프라인), `lib/cases/`, `lib/feedback/`, 관련 E2E·스크립트가 모두 실제로 동작하는 B2B 구현체로 저장소에 남아 있다.
- **신규 코드**: B2C 3단계 퍼널(01 질문 입력 → 02 보상 진단 결과 → 03 상담 신청)에 대응하는 코드는 **전혀 없다**. `design/claimradar-ui.pen` + `design/exports/`(24개) + `design/MIGRATION-PLAN.md`로 디자인만 확정되어 있다.
- **배포**: `.github/workflows/deploy.yml`이 `main` 브랜치 push마다 Oracle Cloud VM에 자동으로 `pnpm run db:migrate` + 빌드 + PM2 재시작을 트리거한다(SPEC-ORACLE-HOSTING-001 M1/M2는 "미실행"으로 기록되어 있으나, 워크플로 파일 자체는 이미 저장소에 존재하며 `main` push 즉시 활성화된다 — §3 Non-Functional Constraints 참고). 즉 이 전환 작업 중 어떤 커밋이든 `main`에 병합되는 순간 실제 운영 서버에 반영될 수 있다.

이 SPEC은 "무엇을 지우고, 무엇을 남기고, 무엇을 아직 결정하지 않을 것인가"를 실측 근거와 함께 확정하고, 서비스 공백·데이터 손실 없이 전환할 수 있는 milestone 계획을 세우는 **계획 문서**다. 실제 삭제·구현은 이 SPEC이 완료된 뒤 별도 `/moai run` 실행(들)에서 Reproduction-First 절차(CLAUDE.md §7 Rule 4)를 거쳐 진행한다.

### WHAT (Scope 요약)

이 SPEC이 만드는 것은 실행 가능한 코드가 아니라 **문서(spec.md/plan.md/acceptance.md/design.md/research.md/progress.md)**다. 구체적으로: (1) 저장소 전체 파일을 DELETE/REUSE/REUSE-MOD/PRESERVE 4가지로 분류한 매트릭스(design.md §1), (2) 그 분류를 안전하게 실행할 milestone 순서(plan.md §D), (3) 아직 결정하지 않기로 한 항목들의 명시적 목록(design.md §3-§4). "무엇을 삭제할지"만큼 "무엇을 아직 결정하지 않을지"를 정확히 남기는 것이 이 SPEC의 핵심 산출물이다.

## 2. Requirements (GEARS)

### REQ-B2CFOUND-001 (Ubiquitous)
The SPEC document shall classify every directory and file under `app/`, `app/api/`, `components/`, `lib/`, `db/`, `e2e/`, `scripts/`, `proxy.ts`, `instrumentation.ts` into exactly one of three categories — DELETE(B2B 전용) / REUSE(B2C에서도 재사용) / PRESERVE-UNDECIDED(재사용 여부 미결정, 이번 SPEC에서는 보존) — with file-level import/dependency evidence, per `design.md` §1의 매트릭스.

### REQ-B2CFOUND-002 (Ubiquitous)
plan.md의 milestone 계획은 각 milestone 경계에서 `pnpm build`가 항상 성공하는 상태를 유지해야 한다 — 어느 시점에도 애플리케이션이 빈 화면이거나 빌드 실패 상태에 머무르지 않는다.

### REQ-B2CFOUND-003 (Event-driven)
When 어떤 milestone이 B2B 전용 라우트(`app/cases/*`, `app/login/*`) 또는 그 인증 의존성(`proxy.ts`의 보호 경로 가드, `lib/auth/`)을 제거하는 경우, the plan shall 그 milestone 이전에 최소 B2C 공개 진입점(placeholder 라우트 또는 임시 foundation)이 먼저 존재하도록 요구한다 — 라우트 제거와 신규 진입점 마련의 순서가 뒤바뀌지 않는다.

### REQ-B2CFOUND-004 (Ubiquitous)
plan.md는 "B2B 코드 제거"와 "기존 운영 DB 데이터 삭제"를 서로 다른, 독립적으로 승인이 필요한 milestone으로 분리해야 한다 — 코드 삭제 milestone은 어떤 DB 테이블도 DROP하지 않는다.

### REQ-B2CFOUND-005 (Unwanted — shall not)
Authoring this SPEC(spec.md/plan.md/acceptance.md/design.md/research.md/progress.md 작성)은 실제 코드 삭제, DB 마이그레이션 실행, 배포 액션을 수행하지 않는다.

### REQ-B2CFOUND-006 (Ubiquitous)
plan.md는 기존 마이그레이션 이력(`db/migrations/*.sql`, `db/migrations/meta/*`)을 그대로 보존해야 한다 — 어떤 milestone도 기존 마이그레이션 파일을 수정·삭제하거나 11개 기존 테이블(user/session/account/verification/cases/evidence/reports/feedback/allowedTesters/reservations/caseJobs/geminiRequestObservations) 중 하나라도 DROP하는 마이그레이션을 포함하지 않는다.

### REQ-B2CFOUND-007 (State-driven)
While `lib/pipeline/`(6단계 리서치 파이프라인)의 B2C 02 화면 담보 매칭 재사용 여부가 `tech.md` § 담보 매칭 로직에서 여전히 미결정 상태인 동안, the plan shall `lib/pipeline/`을 삭제·추출·수정하지 않고 있는 그대로 보존한다.

### REQ-B2CFOUND-008 (Ubiquitous)
plan.md와 design.md는 `design/MIGRATION-PLAN.md` §2의 노드 ID·화면 인벤토리(01/01-A2/01-B/01-C/01-D/01-E, 02, 03/03-A2/03-B/03-C/03-D, Desktop+Mobile 반응형 공유)와 일치하는 목표 B2C 공개 라우트 구조를 정의해야 한다.

### REQ-B2CFOUND-009 (Event-driven)
When 어떤 milestone이 B2B 전용 E2E 시나리오(`e2e/auth.*`, `e2e/case-flow.spec.ts` 등)를 삭제하는 경우, the plan shall 각 시나리오에 대해 "삭제 사유 + 대체 검증(있다면)"을 milestone 기록에 남기도록 요구한다 — 근거 없이 테스트 수만 줄이는 방식을 금지한다.

### REQ-B2CFOUND-010 (Ubiquitous)
plan.md는 git 이력과 보존된(DROP되지 않은) 기존 DB 테이블을 이용해 B2B 상태를 복구할 수 있는 롤백 전략을 기록해야 한다.

### REQ-B2CFOUND-011 (Where — capability gate)
Where `.github/workflows/deploy.yml`이 `main` 브랜치 push마다 실제 Oracle Cloud VM에 `pnpm run db:migrate` + 재배포를 자동 트리거하는 상태가 유지되는 동안, the plan shall 이 전환 작업의 모든 milestone을 `main`이 아닌 별도 브랜치에서 수행하고, `main` 병합 전 리뷰를 거치도록 명시한다.

### REQ-B2CFOUND-012 (Ubiquitous)
spec.md/plan.md/design.md는 이번 라운드에서 해결하지 않는 미결정 사항을 `[NEEDS CLARIFICATION: <주제>]` 마커로 명시적으로 남겨야 한다 — 임의로 판단해 결정하지 않는다.

### REQ-B2CFOUND-013 (Unwanted — shall not)
목표 B2C 라우트 구조(design.md §2)의 01/02 단계는 이름·연락처 등 PII 필드를 수집하지 않는다 — PII 수집은 03 상담 신청 단계로만 국한된다(`design/MIGRATION-PLAN.md` §6, `tech.md` § PII 정책 예외).

## 3. Non-Functional Constraints

- **브랜치 안전**: REQ-B2CFOUND-011에 따라, 이 SPEC의 실제 run-phase 실행(별도 세션)은 `main`이 아닌 작업 브랜치(예: `feat/SPEC-B2C-FOUNDATION-001-mN`)에서 진행하고 PR/리뷰를 거쳐 병합한다. `main-checkout-branch-guard.md`의 원칙(주 checkout에서 브랜치 상태를 바꾸지 않음)을 그대로 따른다.
- **데이터 안전**: 어떤 milestone도 실제 운영 DB에 쓰기·삭제를 수행하지 않는다(REQ-B2CFOUND-006). 로컬 개발/CI 환경의 `file:` 스킴 SQLite DB만 대상으로 검증한다.
- **Reproduction-First**: 이 SPEC이 완료된 뒤 실제 코드 삭제를 수행하는 run-phase는 CLAUDE.md §7 Rule 4(Reproduction-First Bug Fixing)에 준하는 절차 — 삭제 전 참조 관계를 실측 재확인 → 삭제 → 빌드/테스트로 회귀 확인 — 를 milestone마다 반복한다.
- **문서 정합성**: `product.md`/`structure.md`/`tech.md`가 이미 기록한 결정(B2C 유일 제품, B2B 삭제 확정, 담보 매칭 미결정 등)과 이 SPEC의 내용이 모순되지 않아야 한다. 이 SPEC은 그 문서들이 이미 내린 결정을 실행 계획으로 구체화하는 것이지, 다시 뒤집는 것이 아니다.

## Out of Scope

### Out of Scope — 24개 화면 실제 구현
`01`/`02`/`03` 및 Desktop+Mobile 24개 화면의 실제 라우트/컴포넌트 구현. 이 SPEC은 목표 구조(빈 골격)만 계획하며, 실제 페이지 구현은 후속 SPEC(§9 후속 SPEC 권장 순서 참고) 범위다.

### Out of Scope — 담보 매칭 알고리즘 및 리드 폼 API 구현
02 화면의 담보 매칭 로직(정적 규칙 vs AI, §4 decision gate)의 확정, 03 화면의 리드 폼 API(`app/api/leads/` 등) 구현, `lib/validation/lead-input.ts` 등 신규 검증 스키마 구현.

### Out of Scope — 신규 DB 테이블 및 마이그레이션 구현
B2C 전용 신규 테이블(진단 결과, 담보 매칭 데이터, 리드 레코드 등)의 스키마 설계·마이그레이션 작성·실행. `db/(신규 테이블 후보)`는 후속 SPEC 범위다(`structure.md` § 목표 구조).

### Out of Scope — 기존 운영 DB 테이블·데이터 삭제
`cases`/`evidence`/`reports`/`feedback`/`user`/`session`/`account`/`verification`/`allowedTesters`/`reservations`/`caseJobs`/`geminiRequestObservations` 등 기존 테이블의 DROP, 또는 그 안의 실제 사용자 데이터 삭제. REQ-B2CFOUND-006/010에 따라 이 SPEC은 물론 이 SPEC이 계획하는 코드-삭제 milestone에서도 수행하지 않는다.

### Out of Scope — 법무 문구·디자인 확정
`design/internal/`의 `{처리 목적 확정 문구}` 등 자리표시자 확정, `M01-D`/`M01-E` 모바일 디자인 제작, `design/claimradar-ui.pen`·`design/exports/`·`design/internal/` 파일 수정.

### Out of Scope — 실제 배포·외부 호출
Oracle 서버 실제 배포(`main` 병합·GitHub Actions 트리거), 실 Gemini API 호출, 실제 상담 신청 전송(카톡/전화 연동).

---

`git log .moai/specs/SPEC-B2C-FOUNDATION-001/` 참고.
