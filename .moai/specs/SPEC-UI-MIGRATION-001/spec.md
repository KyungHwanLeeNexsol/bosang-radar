---
id: SPEC-UI-MIGRATION-001
title: "UI 마이그레이션 — Pencil 디자인(claimradar-ui.pen) 전체 화면 확장 재현 (로그인·공통 예외·반응형 포함)"
version: "0.1.0"
status: draft
created: 2026-09-03
updated: 2026-09-03
author: Nexsol
priority: P2
phase: "v0.3.0 target"
module: "app/login/, app/cases/layout.tsx, app/cases/new/, app/cases/[caseId]/, app/cases/[caseId]/error.tsx, app/globals.css, lib/cases/"
lifecycle: spec-anchored
tags: "visual, ui-migration, design-system, pencil, app-shell, responsive, i18n-labels, tailwind-v4"
tier: L
depends_on: [SPEC-PILOT-VISUAL-001]
---

## HISTORY

- 2026-09-03: 최초 작성 (manager-spec) — SPEC-PILOT-VISUAL-001(status: in-progress, 기능적으로 main에 반영됨)이 재현한 3개 화면(사건 입력/리서치 리포트/전문가 피드백)을 넘어, 확정된 Pencil 디자인(`design/claimradar-ui.pen`)의 나머지 화면(로그인, 공통 예외 6종)과 App Shell 확장(사이드바 2항목·사용자 블록·Topbar 브레드크럼), 콘텐츠 정합성 갭(Evidence/Issue 타입 한글 라벨, 비확정성 안내 문구, Claim 카드 "추가 확인 필요" 섹션), Case Input 우측 레일 확장(정적 분석상태 + 신규 최근 리서치 조회), 명시적 반응형 규칙(태블릿 1024px/모바일 390px/데스크톱 1280px 비붕괴)을 반영한다. 오케스트레이터 세션에서 Pencil MCP 직접 조사(`GetVariables`, 프레임 구조) 및 코드베이스 직접 조사(read-only, `lib/pipeline/types.ts` `VerifiedClaim` 인터페이스 확인·`lib/cases/get-case-for-owner.ts` 존재 확인 포함)로 확정된 사실을 근거로 요구사항을 고정했다.

## §1. 개요 (Overview)

### WHY — 배경 및 동기

SPEC-PILOT-VISUAL-001이 사건 입력·리서치 리포트·전문가 피드백 3개 화면에 Pencil 디자인의 App Shell·브랜드 토큰·타이포그래피를 성공적으로 이식했으나, 확정된 Pencil 디자인은 그보다 넓은 범위를 정의한다: 로그인 화면(`03 · 테스터 로그인`), 사이드바의 5개 nav 항목(3개 실제 + 2개 준비중), Topbar 브레드크럼, 공통 예외 화면 6종(`11`), 명시적 반응형 규칙(`12`/`13`)이 아직 반영되지 않았다. 또한 3개 화면 내부에도 콘텐츠 정합성 갭이 남아 있다 — EvidenceType/QueryIssueType이 영문 raw 값으로 노출되고(예: "PRECEDENT", "DISABILITY_LOCATION"), 손해사정사에게 필수적인 보험금 지급 비확정성 안내 문구가 시각적으로 존재하지 않으며, Case Input 우측 레일의 "분석 상태"/"최근 리서치" 패널이 완전히 생략되어 있다(SPEC-PILOT-VISUAL-001 REQ-011의 명시적 축소 결정).

### WHAT — 이번 SPEC 범위

1. 로그인 화면(`app/login/`) 재스타일 — App Shell 토큰·폰트 재사용, Better Auth 로직·testid 완전 보존, `app/layout.tsx` zero-diff 유지
2. App Shell 확장 — 사이드바 신규 비활성 2항목(리포트 보관함/판례·약관 자료실), 사이드바 하단 사용자 블록의 세션 실사용자명 반영, Topbar 브레드크럼+동적 타이틀
3. 콘텐츠 정합성 — EvidenceType/QueryIssueType 한글 라벨 매핑, 보험금 지급 비확정성 안내 문구 2건(리포트 레벨/담보 검토 패널 레벨) 신규 노출
4. Claim 카드 "추가 확인 필요" 시각 패턴의 데이터-백엔드 정합 범위 확정(신규 AI 파이프라인 필드 없이)
5. Case Input 우측 레일 확장 — "분석 상태" 정적 4단계 체크리스트 + "최근 리서치" 신규 owner-scoped read-only 조회(≤3건) + "임시 저장" 버튼 비활성 렌더링
6. 공통 예외 화면 6종(404/권한없음/세션만료/일시오류/네트워크불가/준비중) — 기존 `error.tsx` 경계 일반화
7. 명시적 반응형 규칙 — 태블릿(1024px, Pencil 프레임 `12`), 모바일(390px, Pencil 프레임 `13`), 데스크톱 1280px 비붕괴(SPEC-PILOT-VISUAL-001 선례 재확인)

기존 API·DB·AI 파이프라인 계약은 REQ-013이 명시하는 1개의 신규 read-only 조회 함수를 제외하고는 전혀 수정하지 않는다. 새 스키마·마이그레이션·서버 write-path 변경은 없다.

### 핵심 판단 근거 — Tier L

영향 범위는 신규 라우트 레이아웃(`app/login/layout.tsx`, 신규), 기존 App Shell 레이아웃 확장(`app/cases/layout.tsx`, `case-shell-nav.tsx`), 3개 기존 화면 컴포넌트의 콘텐츠 정합성 수정(`case-input-form.tsx`, `page.tsx`, `feedback-form.tsx`), 오류 경계 일반화(`error.tsx` 및 신규 예외 화면 컴포넌트 5종), 신규 read-only 조회 함수(`lib/cases/`), 다수의 테스트 파일 셀렉터·픽스처 갱신을 포함해 15개를 초과하는 파일에 걸치며, 화면 수와 정합성 수정 항목이 SPEC-PILOT-VISUAL-001(3개 화면)보다 넓어 예상 변경량은 1000 LOC를 상회할 것으로 판단된다. 따라서 Tier L(design.md + research.md 포함 5개 아티팩트)로 분류한다.

## §2. 요구사항 (Requirements — GEARS 표기법)

### A. 디자인 토큰 재사용

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-001 | Where | Where 이 SPEC이 신규 화면·컴포넌트에 색상·타이포그래피 토큰을 적용해야 하는 경우, 애플리케이션은 SPEC-PILOT-VISUAL-001이 `app/globals.css`에 이미 추가한 `--color-bora-*`/`--color-app-*` 네임스페이스를 재사용해야 하며, design.md §1(토큰 감사 결과) 검토 후 실제로 값이 부재한 경우에만 동일 네임스페이스 규칙을 따르는 신규 토큰을 최소 추가해야 한다 — 신규 네임스페이스 도입이나 기존 토큰 값 변경은 금지된다. | Pencil `GetVariables()` 재조사 결과(동일 `.pen` 파일), SPEC-PILOT-VISUAL-001 §1 토큰 표 재사용 |

### B. 로그인 화면 재스타일

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-002 | Ubiquitous | 로그인 화면(`app/login/page.tsx`, `login-form.tsx`)은 Pencil "03 · 테스터 로그인" 프레임의 구조(업무용 이메일·비밀번호 필드, 비밀번호 표시/숨김 토글, "로그인" 버튼, 이용약관/개인정보처리방침/고객지원 푸터 링크, "랜딩으로 돌아가기" 링크, 브랜드 패널)를 시각적으로 재현해야 하며, `authClient.signIn.email(...)` 호출 로직과 기존 testid(`login-form`, `login-email`, `login-password`, `login-error`, `login-submit`)를 그대로 보존해야 한다. | Pencil 화면 03 구조, `app/login/page.tsx`/`login-form.tsx` 조사 결과(현재 미스타일 상태, SPEC-PILOT-VISUAL-001 명시적 범위 외였음) |
| REQ-003 | Unwanted | `app/layout.tsx`는 이 SPEC의 범위에서도 완전한 PRESERVE 대상이다 — 폰트 import를 포함해 어떤 변경도 허용되지 않는다. 로그인 화면에 필요한 Pretendard/Manrope 폰트 로딩은 신규 `app/login/layout.tsx`(`/login` 라우트만 감싸는 레이아웃) 내부에서 `app/cases/layout.tsx`와 동일한 방식(`next/font/local`+`next/font/google`)으로 이루어져야 하며, `/`·`app/cases/**`의 다른 어떤 라우트도 이 신규 레이아웃으로 감싸서는 안 된다. | SPEC-PILOT-VISUAL-001 REQ-005의 zero-diff 원칙 계승; 사용자 명시적 범위 제한(`/` 미변경) |

### C. App Shell 확장 (Sidebar + Topbar)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-004 | Ubiquitous | 사이드바는 SPEC-PILOT-VISUAL-001 REQ-006이 확정한 3개 실제 nav 항목(사건 입력/리서치 리포트/전문가 피드백, pathname 전용 링크 규칙 무변경)에 더해, 정확히 2개의 영구 비활성 nav 항목(리포트 보관함, 판례·약관 자료실)을 렌더링해야 한다 — 두 항목은 `href` 없이 `aria-disabled="true"`로 렌더링되고 "준비 중" Chip을 부착해야 하며, 어떤 DB 조회·API 호출·라우트/페이지 생성도 수반해서는 안 된다. | Pencil 사이드바 nav 5항목 스펙(사용자 확정: 리포트 보관함·판례 DB는 화면 자체를 만들지 않고 nav 항목만 비활성 렌더링) |
| REQ-005 | While | While 사이드바 하단 사용자 블록을 렌더링할 때, 애플리케이션은 하드코딩된 "담당 손해사정사"/"BORA 리서치" 문자열 대신 현재 세션의 실제 사용자 이름(`user.name`, `lib/db/schema.ts` 기존 컬럼)을 표시해야 하며, `user` 테이블에 존재하지 않는 소속/직함 필드를 새로 만들거나 다른 값으로 대체해서는 안 된다. | `app/cases/layout.tsx:56-58` 조사 결과(하드코딩 확인), `lib/db/schema.ts` `user` 테이블 스키마 조사 결과(소속 필드 부재 확인) |
| REQ-006 | Where | Where 화면이 App Shell 안에서 렌더링되는 경우, App Topbar는 브레드크럼(예: "WORKSPACE / 사건 입력")과 현재 화면의 페이지 타이틀을 표시해야 하며, 기존과 동일하게 CSS `position: fixed`/`sticky`를 적용하지 않고 본문과 함께 스크롤되어야 한다. | Pencil App Topbar 컴포넌트 스펙; `grep`으로 확인된 현재 미고정(non-fixed) 동작 유지(회귀 아님, 신규 추가만) |

### D. Enum 한글 라벨 정합성

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-007 | While | While `EvidenceType` 값(`PRECEDENT`/`POLICY`/`STATUTE`/`DISPUTE_CASE`/`OTHER`)이 화면 어디에든 렌더링될 때(`evidence-item.tsx`, `page.tsx`, `feedback-form.tsx` 포함), 애플리케이션은 영문 raw 값 대신 한글 라벨(판례/약관/법령/분쟁조정례/기타)을 표시해야 하며, `feedback-form.tsx`의 기존 `{value,label}` 배열 패턴(`OVERALL_RATINGS` 등)과 동일한 방식으로 구현해야 한다. | `lib/pipeline/types.ts:59` `EvidenceType` 정의 조사, 렌더 위치 3곳 grep 확인(영문 raw 노출 확인) |
| REQ-008 | While | While `QueryIssueType` 값(8종: `DISABILITY_LOCATION`/`DIAGNOSIS`/`INCIDENT_CIRCUMSTANCE`/`INJURY_DISEASE_RELATION`/`DISABILITY_GRADE_CRITERIA`/`PRE_EXISTING_CONDITION`/`CAUSATION`/`ADDITIONAL_CONFIRMATION_NEEDED`)이 화면 어디에든 렌더링될 때, 애플리케이션은 영문 raw 값 대신 Pencil Design System이 정의한 한글 라벨(장해 부위/진단명/사고 경위/상해·질병 관련성/장해 평가 기준/기왕증·퇴행성/인과관계/추가 확인 필요)을 REQ-007과 동일한 패턴으로 표시해야 한다. | `lib/pipeline/types.ts:33-42` `QUERY_ISSUE_TYPES` 단일 SSOT 상수 조사, Pencil Design System "Issue tag · 8종" 섹션 |

### E. 비확정성 안내 문구

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-009 | Ubiquitous | 리서치 리포트 화면의 사건 요약(Aggregate Status) 패널은 다음 문구를 정확히 시각적으로 노출해야 한다: "본 리포트는 공개된 판례·약관·법령을 기반으로 한 참고용 AI 리서치 결과입니다. 보험금 지급 여부나 지급액을 확정하지 않으며, 최종 판단은 담당 손해사정사의 검토가 필요합니다." | Pencil Aggregate Status 패널 스펙; 현재 UI에 시각적으로 부재함을 `grep` 확인(백엔드 `lib/pipeline/safety-validator.ts`의 콘텐츠 필터와는 별개) |
| REQ-010 | Ubiquitous | "검토할 담보" 패널(`review-targets`)은 다음 부제 문구를 정확히 시각적으로 노출해야 한다: "추가 검토가 필요한 담보 항목입니다. 지급 가능 담보를 확정한 목록이 아닙니다." | Pencil 담보 검토 패널 subtitle 스펙; 현재 UI에 부재함을 확인 |

### F. Claim 카드 정합성

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-011 | Where | Where claim이 `status: "INSUFFICIENT"`인 경우, claim 카드는 Pencil의 "추가 확인 필요" 시각 패턴(원형 점선 아이콘 + 텍스트 목록)을 재현해야 하되, `lib/pipeline/types.ts` `VerifiedClaim` 인터페이스가 claim 단위의 근거 부족 사유 필드를 보유하지 않음이 직접 조사로 확인되었으므로, 신규 AI 파이프라인 출력 필드를 추가해서는 안 되고, 그 목록 내용은 기존 리포트 레벨 `missingMaterials`/`uncertainty`(이미 `missing-materials`/`uncertainty` testid로 렌더링 중)에서 파생하거나 그 두 섹션을 시각적으로 명확히 연결(예: "자세히 보기" 앵커 또는 근접 배치)하는 방식으로 구현해야 한다. | `lib/pipeline/types.ts:106-122` `VerifiedClaim`/`VerificationResult` 인터페이스 직접 조사(claim 단위 필드 부재 확정) — 추측이 아닌 코드 확인으로 스코프 축소 |

### G. 사건 입력 우측 레일 확장

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-012 | Ubiquitous | 사건 입력 화면 우측 레일의 "분석 상태" 패널은 4단계 정적 안내 목록(쟁점 자동 추출/판례·결정례 검색/약관·법령 대조/근거 검증 및 반대 논리 생성)을 순수 정보성 텍스트로 렌더링해야 하며, `cases` 테이블에 단계별 진행 데이터가 존재하지 않으므로 이 4단계 각각에 대해 개별 완료/진행 상태를 표시해서는 안 된다(가짜 진행률 금지). | `lib/db/schema.ts:75` `cases.status` 단일 텍스트 컬럼 조사(단계별 데이터 부재 확정); 사용자 확정 스코프 결정 1 |
| REQ-013 | Ubiquitous | 사건 입력 화면 우측 레일의 "최근 리서치" 패널은 현재 로그인 사용자가 소유한 사건 중 최근 3건 이하(사건 번호·상태·타이틀)를 신규 read-only 조회 함수로 표시해야 하며, 이 함수는 기존 `cases` 테이블만 조회하고(신규 테이블·스키마·마이그레이션 없음), `lib/cases/get-case-for-owner.ts`와 동일한 owner-scope 신뢰 경계를 사용해야 한다. | 사용자 확정 스코프 결정 2(범위 포함); `lib/cases/get-case-for-owner.ts` 존재 및 owner-scope 패턴 직접 확인 |
| REQ-014 | Unwanted | 사건 입력 폼 Footer의 "임시 저장" 버튼은 비활성(disabled) 상태와 "준비 중" Chip으로만 렌더링해야 하며, 어떤 초안 저장 백엔드 로직(신규 API·DB write)도 연결해서는 안 된다. | 사용자 명시("신규 초안 저장 기능 없음"); Pencil 화면 05 Form Footer 스펙 |

### H. 공통 예외 화면

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-015 | Ubiquitous | 애플리케이션은 App Shell(사이드바+탑바) 안에서 중앙 정렬 아이콘/타이틀/설명/`{컨텍스트} · {ERROR_CODE}` 패턴을 공유하는 6종의 공통 예외 화면(페이지를 찾을 수 없습니다/접근 권한이 없습니다/세션이 만료되었습니다/일시적인 오류가 발생했습니다/네트워크에 연결할 수 없습니다/준비 중인 기능입니다)을 제공해야 하며, 기존 `app/cases/[caseId]/error.tsx` 경계(404/사건 없음 변형이 이미 존재)를 중복 구현이 아닌 일반화로 확장해야 한다. | Pencil 화면 `11` 6종 변형 스펙; `app/cases/[caseId]/error.tsx` 기존 조사 결과("K02Nyo 사건을 찾을 수 없습니다" 매핑 확인) |

### I. 반응형 규칙

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-016 | Ubiquitous | 뷰포트 너비 1024px(태블릿)에서 인터페이스는 Pencil 프레임 `12`의 명시적 규칙 — 사이드바는 고정 폭을 유지하고, 우측 레일은 본문 아래로 이동해 2컬럼이 아닌 세로 배치가 되어야 한다. | Pencil 프레임 `12` 주석("RULE · 사이드바 유지 · 우측 레일은 본문 아래로 이동") |
| REQ-017 | Ubiquitous | 뷰포트 너비 390px(모바일)에서 사이드바는 오프캔버스 드로어로 전환되어야 하며, 탑바의 햄버거 아이콘 클릭 시 어두운 스크림 오버레이와 함께 슬라이드인으로 열려야 한다. | Pencil 프레임 `13` 주석(오프캔버스 드로어 + 스크림 규칙) |
| REQ-018 | Ubiquitous | 뷰포트 너비 1280px에서 재스타일된 5개 화면(로그인/사건 입력/리포트/피드백/공통 예외) 모두 가로 오버플로, 사이드바-콘텐츠 겹침, 텍스트/컨트롤 잘림, 클릭 불가 겹침 중 어느 것도 발생해서는 안 된다. | SPEC-PILOT-VISUAL-001 REQ-022/AC-021b 선례(1280px 비붕괴 기준) 재확인·확장 |

### J. 기능·데이터 보존 (Unwanted, 전역) 및 품질 게이트

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-019 | Unwanted | 이 SPEC의 구현은 `lib/db/schema.ts`, `lib/validation/case-input.ts`, `lib/feedback/schema.ts`, `lib/cases/create-case.ts`, `lib/feedback/submit-feedback.ts`, `lib/pipeline/**`, `lib/ai/**`, `db/**`, 어떤 마이그레이션도 수정해서는 안 된다 — REQ-013이 명시하는 신규 read-only 조회 함수(신규 파일, 기존 파일 수정 아님)만이 유일한 예외다. | 사용자 하드 제약; SPEC-PILOT-VISUAL-001 REQ-019 계승 |
| REQ-020 | Unwanted | 이 SPEC의 구현은 spec.md §3(보존·신규 테스트 계약)에 열거된 기존 `data-testid` 값의 이름을 변경하거나 제거하거나 그 의미를 바꿔서는 안 된다. | 기존 테스트 스위트 보존, SPEC-PILOT-VISUAL-001 §3 목록 승계 |
| REQ-021 | Unwanted | 이 SPEC의 구현은 "리포트 보관함"/"판례·약관 DB" 페이지 자체(목록 뷰, 라우트, API)를 만들어서는 안 된다 — REQ-004가 정의하는 사이드바 비활성 nav 항목만 존재해야 한다. | SPEC-PILOT-VISUAL-001 REQ-006 원칙 계승, 사용자 확정 |
| REQ-022 | While | While 폼 제출(사건 생성 또는 피드백 제출)이 진행 중일 때, 클라이언트 단일 흐름(single-flight) 가드, 대기 인디케이터, 필드 비활성화 동작은 이 SPEC의 어떤 변경 이후에도 기능적으로 완전히 동일하게 유지되어야 한다. | SPEC-PILOT-VISUAL-001 REQ-021, SPEC-PILOT-UX-001 REQ-001~003/007~011 보존 계승 |
| REQ-023 | Ubiquitous | 이 SPEC이 재스타일하거나 신규 추가하는 모든 화면·컴포넌트는 현재 구현에 이미 존재하는 접근성 속성(label 연관, button semantics, `disabled` 상태, `role="status"`, `aria-live`, focus 동작) 및 이 SPEC이 신규 추가하는 비활성 nav 항목의 `aria-disabled="true"`를 보존·적용해야 한다. | moai-ref-react-patterns 접근성 체크리스트, SPEC-PILOT-VISUAL-001 REQ-023 계승 |
| REQ-024 | When(이벤트 감지) | When 이 SPEC의 구현 완료 후 `pnpm test`, `pnpm test:e2e`, `pnpm lint`, `pnpm build`, `pnpm format:check` 중 어느 것이 실행되더라도, `pnpm test`/`pnpm test:e2e`/`pnpm lint`/`pnpm build`는 종료 코드 0을 반환해야 하고 `pnpm format:check`는 이 SPEC이 신규로 도입한 포맷 위반 0건이어야 한다. | Definition of Done, acceptance.md §품질 게이트 |

## §3. 보존·신규 테스트 계약 (REQ-020이 참조하는 전체 목록)

### 보존 대상 (SPEC-PILOT-VISUAL-001에서 승계, 이름·의미 변경 금지)

- `login-form.tsx`: `login-form`, `login-email`, `login-password`, `login-error`, `login-submit`
- `case-input-form.tsx`: `case-input-form`, `case-incident-description`, `case-diagnosis-name`, `case-disability-body-part`, `case-incident-date`, `case-submit`, `case-pending-indicator`(+ `role="status" aria-live="polite"`)
- `page.tsx`: `summary-banner`, `review-targets`, `verified-claims`, `claim-status`(+ `data-status`), `cited-evidence-empty`, `missing-materials`, `uncertainty`, `case-report`, 정확한 leaf 텍스트 노드 "사건 요약"
- `feedback-form.tsx`: `feedback-form`(컨테이너), `feedback-overall-rating`(id), `feedback-overall-comment`, `feedback-section`(≥5), `feedback-missed-issue-row`/`-add`/`-remove`, `feedback-claim-verdict`, `feedback-evidence-verdict`, `feedback-outcome-description`, `feedback-outcome-confirmed-at`, `feedback-submit`, `feedback-success`
- `error.tsx`: `case-error-retry`
- `app/cases/layout.tsx` / `case-shell-nav.tsx`: 사이드바 `aria-label="사건 관리 내비게이션"` 및 SPEC-PILOT-VISUAL-001 REQ-006 pathname 전용 링크 규칙(사건 입력/리서치 리포트/전문가 피드백)

### 이 SPEC이 신규로 도입하는 testid (run-phase에서 정확한 이름으로 부여, 이후 SPEC에서 보존 대상이 됨)

- 사이드바 비활성 nav 2항목: `sidebar-nav-archive`, `sidebar-nav-precedent-db`(각각 `aria-disabled="true"`, `href` 없음)
- Case Input 우측 레일: `case-recent-research`(목록 컨테이너), `case-recent-research-item`(항목 반복), `case-input-draft-save`(비활성 버튼)
- 공통 예외 화면: `common-error-<variant>`(variant ∈ 404/forbidden/session-expired/transient/network/coming-soon) — 기존 `case-error-retry`와 별개로, 각 변형의 최상위 컨테이너 식별용

## §4. 요구사항 교차 참조

design.md §1(토큰 감사)·§2(로그인 폰트 격리)·§3(신규/재사용 컴포넌트)·§4(화면별 구조 매핑, 로그인·App Shell 확장·공통 예외·반응형)는 REQ-001~006, REQ-015~018의 시각 명세를 담당한다. research.md §2~§7(EvidenceType/QueryIssueType 렌더 위치, `VerifiedClaim` 인터페이스 직접 조사, `getCaseForOwner` 신뢰 경계, 현재 로그인/사이드바/예외 화면 구조)은 REQ-007~014, REQ-019~022가 지켜야 할 정확한 기준선과 REQ-011/013의 스코프 축소 근거를 담당한다. plan.md §마일스톤은 REQ 그룹 A~J를 실행 순서로 분해한다. acceptance.md는 REQ-001~024 각각에 대한 검증 가능한 Given-When-Then 시나리오를 제공한다.

## §5. Out of Scope

### Out of Scope — 신규 기능

- 신규 DB 스키마 변경 또는 마이그레이션(REQ-013의 신규 read-only 조회 함수는 기존 `cases` 테이블만 조회하며 스키마를 바꾸지 않음)
- 신규 API 엔드포인트 또는 기존 엔드포인트의 요청/응답 스키마 변경
- AI Researcher/Skeptic/Verifier 파이프라인 로직 및 출력 스키마 변경(REQ-011이 명시적으로 신규 필드 추가를 금지)
- 근거자료(evidence) 검색/랭킹 로직 변경
- "리포트 보관함"/"판례·약관 DB" 페이지 자체의 신규 구현(REQ-021에서 명시적으로 생략, 사이드바 비활성 nav만 존재)
- 초안 저장(draft-save) 기능(REQ-014에서 명시적으로 생략)
- "분석 상태" 단계별 실시간 진행률 추적 인프라(REQ-012에서 명시적으로 생략, 정적 안내만)

### Out of Scope — 인증 및 다른 라우트

- Better Auth 인증/인가 로직 변경(REQ-002는 시각 재현만, `authClient.signIn.email` 로직 무변경)
- 관리자 대시보드
- `/` 홈 화면의 추가 변경(SPEC-PILOT-VISUAL-001에서 이미 미변경 확정, 이 SPEC도 계승)

### Out of Scope — 반응형 및 플랫폼

- 태블릿(1024px)·모바일(390px) 외의 추가 브레이크포인트(예: 768px, 480px) 신규 설계 — REQ-016/REQ-017이 정의하는 Pencil 명시 규칙 2종만 구현
- 네이티브 모바일 앱
- 프로덕션 배포 파이프라인 변경

### Out of Scope — 도구/라이브러리 도입

- 대형 신규 UI 프레임워크(shadcn/Tailwind 외) 도입
- 애니메이션 전용 라이브러리(Framer Motion 등) 도입 — CSS `transition`으로 충분한 범위 내에서만 모션 적용(드로어 슬라이드인 포함)
- `@base-ui/react` 대체(기존 프리미티브 라이브러리 유지)

### Out of Scope — 데이터 및 통계

- Gold Dataset 관련 작업
- 통계/집계 데이터 수집 로직 변경(SPEC-FEEDBACK-001 범위)
- Claim 단위 근거 부족 사유의 AI 파이프라인 신규 필드화(REQ-011이 근거를 들어 명시적으로 배제 — `VerifiedClaim` 인터페이스에 필드 추가 금지)
