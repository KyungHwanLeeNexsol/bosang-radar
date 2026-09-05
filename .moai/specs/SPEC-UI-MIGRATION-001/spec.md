---
id: SPEC-UI-MIGRATION-001
title: "UI 마이그레이션 — Pencil 디자인(claimradar-ui.pen) 전체 화면 확장 재현 (로그인·공통 예외·반응형 포함)"
version: "0.3.0"
status: in-progress
created: 2026-09-03
updated: 2026-09-04
author: Nexsol
priority: P2
phase: "v0.3.0 target"
module: "app/login/, app/cases/layout.tsx, app/cases/new/, app/cases/[caseId]/, app/cases/[caseId]/error.tsx, app/not-found.tsx, app/cases/[caseId]/not-found.tsx, app/globals.css, lib/cases/"
lifecycle: spec-anchored
tags: "visual, ui-migration, design-system, pencil, app-shell, responsive, i18n-labels, tailwind-v4"
tier: L
depends_on: [SPEC-PILOT-VISUAL-001]
---

## HISTORY

- 2026-09-03: 최초 작성 (manager-spec) — SPEC-PILOT-VISUAL-001(status: in-progress 당시, 기능적으로 main에 반영됨)이 재현한 3개 화면(사건 입력/리서치 리포트/전문가 피드백)을 넘어, 확정된 Pencil 디자인(`design/claimradar-ui.pen`)의 나머지 화면(로그인, 공통 예외)과 App Shell 확장(사이드바 2항목·사용자 블록·Topbar 브레드크럼), 콘텐츠 정합성 갭, Case Input 우측 레일 확장, 명시적 반응형 규칙을 반영한다.
- 2026-09-03 (외부 독립 리뷰 대응 — plan-phase 전면 개정): 외부 독립 리뷰어가 8개 결함 범주를 지적한 데 대응해 6개 아티팩트를 전면 재작성했다. depends_on(SPEC-PILOT-VISUAL-001)이 이제 `status: completed`로 충족되었음을 재확인(직접 조사)했다. 주요 변경: (1) **공통 예외 화면 baseline 정정** — 초판 research.md/design.md/spec.md는 `app/cases/[caseId]/error.tsx`에 404/사건-없음 변형이 이미 존재한다고 서술했으나, `error.tsx` 전체 소스와 `app/**/not-found.tsx` glob 재조사 결과 이는 사실이 아니었다(`error.tsx`는 일반 런타임 오류 경계만 보유, `not-found.tsx`는 어디에도 존재하지 않음). REQ-015를 Pencil 6종 카탈로그 나열에서 이 코드베이스에 실재하는 3개 진입 경로(전역 404 / 사건-없음·미소유 통합 404 / 기존 일시 런타임 오류)로 재스코핑했다. (2) **REQ-005 사용자명 표시 전략 확정** — `next.config.ts`에 PPR 미설정임을 직접 확인해, 서버 컴포넌트 직접 세션 조회(빌드 시점 DB 연결 위험)와 Suspense-only 격리(PPR 없이는 효과 없음)를 모두 기각하고, Better Auth 클라이언트 세션 훅을 사용하는 별도 클라이언트 컴포넌트 분리를 확정했다. (3) **REQ-002 로그인 링크/토글 구체화** — 정책 페이지 실제 라우트 부재를 확인해 비활성 텍스트로 렌더링하도록 명시했고, 비밀번호 표시/숨김 토글에 대한 AC를 신설했다. (4) **REQ-013 최근 리서치 파생 규칙 확정** — `cases` 테이블에 `title` 컬럼이 없음을 재확인해 `input.diagnosisName`/`input.disabilityBodyPart` 파생 규칙과 파싱 실패 폴백을 명시했다. (5) **REQ-011 INSUFFICIENT 연결 규칙을 결정론적으로 재작성** — `MissingMaterial.relatedIssueType`과 기존 `getClaimIssueTypes()` 파생 결과의 일치 여부만을 유일한 항목-레벨 표시 조건으로 확정했다. (6) **REQ-017 모바일 드로어 접근성 계약 신설** — 열기/닫기/ESC/스크림클릭/포커스이동복귀/스크롤잠금/tab순서/브레이크포인트 리셋을 명시했다. (7) 문서 전반의 부정확한 파일/라인 인용을 재검증해 갱신했고, §3 신규 testid 목록에서 `common-error-<variant>`를 제거하고 실제 구현될 개별 testid로 교체했다. (8) `depends_on` override 관련 서술을 plan.md에서 정리했다. REQ 개수는 24개로 불변(모두 기존 REQ를 제자리에서 재작성했을 뿐 신규 REQ ID를 추가하지 않았다 — Tier L 25개 상한 이내 유지).
- 2026-09-03 (제2차 외부 독립 리뷰 대응 — BLOCKER 2건 + MAJOR 1건 + 모바일 드로어 포커스 트랩 갭 해소): 두 번째 외부 독립 리뷰가 다음을 지적해 6개 문서를 다시 개정했다. **BLOCKER 1(정적 생성 요구사항과 REQ-013 DB 조회의 정면 모순)** — 개정 전 REQ-005a는 `/cases/new`가 정적 생성을 유지해야 한다고 요구했으나, 동일 화면에 REQ-013이 요구하는 owner-scoped DB 조회("최근 리서치")는 인증된 `ownerUserId`를 필요로 하며 빌드 시점에는 실행될 수 없다 — 두 요구사항은 양립 불가능했다. 해결: 사이드바 사용자명 표시(REQ-005)는 기존 결정대로 별도 클라이언트 컴포넌트를 그대로 유지하되, "최근 리서치" 조회에 필요한 `ownerUserId`는 `/cases/new`의 서버 페이지 컴포넌트(`NewCasePage`) 자신이 기존 `getCurrentSession()` 패턴(다른 화면에서 이미 사용 중)으로 서버측에서 확인해 조달한다 — 신규 API 라우트 없음. 그 결과 `/cases/new`는 정적 생성에서 동적(요청 시점) 렌더링으로 전환되는 것을 **의도된 결과로 받아들인다** — REQ-005a("반드시 정적 생성 유지")를 폐기하고, 빌드-안전성 요구사항(사용자별 데이터가 빌드 시점에 평가/구워지지 않음, 빌드가 실제 DB 연결을 요구하지 않음, 세션/DB 조회는 요청 시점에만 발생, owner-scope는 서버측에서 강제)으로 대체했다. Next.js 16.3.2가 이 프로젝트에서 사용하는 렌더링 모델(Cache Components/`cacheComponents` 플래그 미설정 — "이전 모델")에서 Request-time API(`headers()`, `getCurrentSession()`을 통해 간접 호출) 사용이 그 라우트를 자동으로 동적 렌더링으로 전환하는 정확한 메커니즘을 research.md §5c에 신규로 기록했다. **BLOCKER 2(plan-audit PASS 0.97 증거 인용)** — `.moai/reports/plan-audit/*.md`가 프로젝트 `.gitignore` 정책(207-211행)에 따라 로컬 전용 아티팩트임을 명시하고, 그 PASS 결과가 이번 개정 이전 문서 집합에 대한 것이었으므로 History로 이동·"이번 개정으로 대체됨"으로 표시하고 `plan_status`를 재감사 대기 상태로 되돌렸다(progress.md만 수정, verification-claim-integrity.md §2 baseline-integrity 원칙 준수). **MAJOR(Topbar 타이틀/브레드크럼 매핑 모호성)** — "3개 화면 각각 동적 타이틀"이라는 모호한 서술을 정확한 라우트→브레드크럼/타이틀 매핑 표로 교체하고, `#expert-feedback`이 `/cases/[caseId]`의 인페이지 앵커일 뿐 별도 화면/타이틀이 아님을 REQ-006/AC-006a/design.md §4에 명시했다. **모바일 드로어 포커스 트랩 갭** — REQ-017에 Tab/Shift+Tab 닫힌 루프 + 배경 `inert` 요구사항을 추가하고(AC-017i~AC-017l 신설, 기존 AC-017a~h 유지), plan.md M8/§B 결정 7에 네이티브 구현 시의 구현 책임을 명시적으로 배정했다. REQ 개수는 24개로 계속 불변(모든 변경을 기존 REQ 자리에서 재작성했다).

## §1. 개요 (Overview)

### WHY — 배경 및 동기

SPEC-PILOT-VISUAL-001이 사건 입력·리서치 리포트·전문가 피드백 3개 화면에 Pencil 디자인의 App Shell·브랜드 토큰·타이포그래피를 성공적으로 이식했으나, 확정된 Pencil 디자인은 그보다 넓은 범위를 정의한다: 로그인 화면(`03 · 테스터 로그인`), 사이드바의 5개 nav 항목(3개 실제 + 2개 준비중), Topbar 브레드크럼, 이 코드베이스에 실재하는 예외 진입 경로에 대한 공통 시각 언어, 명시적 반응형 규칙(`12`/`13`)이 아직 반영되지 않았다. 또한 3개 화면 내부에도 콘텐츠 정합성 갭이 남아 있다 — EvidenceType/QueryIssueType이 영문 raw 값으로 노출되고(예: "PRECEDENT", "DISABILITY_LOCATION"), 손해사정사에게 필수적인 보험금 지급 비확정성 안내 문구가 시각적으로 존재하지 않으며, Case Input 우측 레일의 "분석 상태"/"최근 리서치" 패널이 완전히 생략되어 있다(SPEC-PILOT-VISUAL-001 REQ-011의 명시적 축소 결정).

### WHAT — 이번 SPEC 범위

1. 로그인 화면(`app/login/`) 재스타일 — App Shell 토큰·폰트 재사용, Better Auth 로직·testid 완전 보존, 비밀번호 표시/숨김 토글 신설, 실재하지 않는 정책 링크는 비활성 렌더링, `app/layout.tsx` zero-diff 유지
2. App Shell 확장 — 사이드바 신규 비활성 2항목(리포트 보관함/판례·약관 자료실), 사이드바 하단 사용자 블록의 세션 실사용자명 반영(클라이언트 컴포넌트 분리, 빌드-시점 DB 연결 위험 회피), Topbar 브레드크럼+동적 타이틀
3. 콘텐츠 정합성 — EvidenceType/QueryIssueType 한글 라벨 매핑, 보험금 지급 비확정성 안내 문구 2건(리포트 레벨/담보 검토 패널 레벨) 신규 노출
4. Claim 카드 "추가 확인 필요" 시각 패턴의 데이터-백엔드 정합 범위를 `MissingMaterial.relatedIssueType` 기반 결정론적 연결 규칙으로 확정(신규 AI 파이프라인 필드 없이)
5. Case Input 우측 레일 확장 — "분석 상태" 정적 4단계 체크리스트 + "최근 리서치" 신규 owner-scoped read-only 조회(≤3건, `cases.input` JSON 파생) + "임시 저장" 버튼 비활성 렌더링
6. 이 코드베이스에 실재하는 3개 예외 진입 경로(전역 404 / 사건-없음·미소유 통합 404 / 기존 일시 런타임 오류)에만 Pencil 예외 화면의 시각 언어를 적용 — 존재하지 않는 세션만료/네트워크불가/준비중 독립 화면은 만들지 않음
7. 명시적 반응형 규칙 — 태블릿(1024px, Pencil 프레임 `12`), 모바일(390px, Pencil 프레임 `13`, 표준 드로어 접근성 계약 포함), 데스크톱 1280px 비붕괴(SPEC-PILOT-VISUAL-001 선례 재확인)

기존 API·DB·AI 파이프라인 계약은 REQ-013이 명시하는 1개의 신규 read-only 조회 함수를 제외하고는 전혀 수정하지 않는다. 새 스키마·마이그레이션·서버 write-path 변경은 없다.

### 핵심 판단 근거 — Tier L

영향 범위는 신규 라우트 레이아웃(`app/login/layout.tsx`, 신규), 기존 App Shell 레이아웃 확장(`app/cases/layout.tsx`, `case-shell-nav.tsx`), 신규 사이드바 사용자 블록 클라이언트 컴포넌트, 3개 기존 화면 컴포넌트의 콘텐츠 정합성 수정(`case-input-form.tsx`, `page.tsx`, `feedback-form.tsx`), 신규 예외 화면 파일 2개(`app/not-found.tsx`, `app/cases/[caseId]/not-found.tsx`) + 기존 `error.tsx` 검증, 신규 read-only 조회 함수(`lib/cases/`), 다수의 테스트 파일 셀렉터·픽스처 갱신을 포함해 15개를 초과하는 파일에 걸치며, 화면 수와 정합성 수정 항목이 SPEC-PILOT-VISUAL-001(3개 화면)보다 넓어 예상 변경량은 1000 LOC를 상회할 것으로 판단된다. 따라서 Tier L(design.md + research.md 포함 5개 아티팩트)로 분류한다.

## §2. 요구사항 (Requirements — GEARS 표기법)

### A. 디자인 토큰 재사용

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-001 | Where | Where 이 SPEC이 신규 화면·컴포넌트에 색상·타이포그래피 토큰을 적용해야 하는 경우, 애플리케이션은 SPEC-PILOT-VISUAL-001이 `app/globals.css`에 이미 추가한 `--color-bora-*`/`--color-app-*` 네임스페이스를 재사용해야 하며, design.md §1(토큰 감사 결과) 검토 후 실제로 값이 부재한 경우에만 동일 네임스페이스 규칙을 따르는 신규 토큰을 최소 추가해야 한다 — 신규 네임스페이스 도입이나 기존 토큰 값 변경은 금지된다. | Pencil `GetVariables()` 재조사 결과(동일 `.pen` 파일), SPEC-PILOT-VISUAL-001 §1 토큰 표 재사용 |

### B. 로그인 화면 재스타일

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-002 | Ubiquitous | 로그인 화면(`app/login/page.tsx`, `login-form.tsx`)은 Pencil "03 · 테스터 로그인" 프레임의 구조(업무용 이메일·비밀번호 필드, 비밀번호 표시/숨김 토글, "로그인" 버튼, 푸터 링크 3종(비활성)·"랜딩으로 돌아가기" 링크(활성), 브랜드 패널)를 시각적으로 재현해야 하며, `authClient.signIn.email(...)` 호출 로직과 기존 testid(`login-form`, `login-email`, `login-password`, `login-error`, `login-submit`)를 그대로 보존해야 한다. 비밀번호 필드는 신규 표시/숨김 토글 버튼(`login-password-toggle`)을 가져야 하며, 클릭 시 입력의 `type` 속성만 `"password"`↔`"text"`로 전환하고 제출되는 폼 값에는 영향을 주지 않아야 한다. 이용약관/개인정보처리방침/고객지원 푸터 링크는 대응하는 실제 라우트가 존재하지 않으므로(research.md §6) `href` 없는 비활성 텍스트로만 렌더링해야 하며, "랜딩으로 돌아가기"(`/`)만 실제 활성 링크로 구현해야 한다. | Pencil 화면 03 구조, `login-form.tsx` 직접 재조사 결과(비밀번호 토글 부재 확인, 정책 링크 대응 라우트 부재 확인, research.md §6) |
| REQ-003 | Unwanted | `app/layout.tsx`는 이 SPEC의 범위에서도 완전한 PRESERVE 대상이다 — 폰트 import를 포함해 어떤 변경도 허용되지 않는다. 로그인 화면에 필요한 Pretendard/Manrope 폰트 로딩은 신규 `app/login/layout.tsx`(`/login` 라우트만 감싸는 레이아웃) 내부에서 `app/cases/layout.tsx`와 동일한 방식(`next/font/local`+`next/font/google`)으로 이루어져야 하며, `/`·`app/cases/**`의 다른 어떤 라우트도 이 신규 레이아웃으로 감싸서는 안 된다. | SPEC-PILOT-VISUAL-001 REQ-005의 zero-diff 원칙 계승; 사용자 명시적 범위 제한(`/` 미변경) |

### C. App Shell 확장 (Sidebar + Topbar)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-004 | Ubiquitous | 사이드바는 SPEC-PILOT-VISUAL-001 REQ-006이 확정한 3개 실제 nav 항목(사건 입력/리서치 리포트/전문가 피드백, pathname 전용 링크 규칙 무변경)에 더해, 정확히 2개의 영구 비활성 nav 항목(리포트 보관함, 판례·약관 자료실)을 렌더링해야 한다 — 두 항목은 `href` 없이 `aria-disabled="true"`로 렌더링되고 "준비 중" Chip을 부착해야 하며, 어떤 DB 조회·API 호출·라우트/페이지 생성도 수반해서는 안 된다. | Pencil 사이드바 nav 5항목 스펙(사용자 확정: 리포트 보관함·판례 DB는 화면 자체를 만들지 않고 nav 항목만 비활성 렌더링) |
| REQ-005 | While | While 사이드바 하단 사용자 블록을 렌더링할 때, 애플리케이션은 하드코딩된 "담당 손해사정사"/"BORA 리서치" 문자열 대신 현재 세션의 실제 사용자 이름(`user.name`)을 표시해야 한다. 이 조회는 `app/cases/layout.tsx`(서버 컴포넌트) 자신이 수행해서는 안 된다 — 이 파일이 직접 `getCurrentSession()` 등 동적 API를 호출하면 이 레이아웃이 감싸는 모든 라우트의 렌더링 모드가 레이아웃 자신의 선택이 되어버려, 개별 페이지(예: `/cases/new`)가 자신의 렌더링 모드를 스스로 결정할 수 없게 된다. 반드시 별도의 클라이언트 컴포넌트로 분리해 Better Auth 클라이언트의 세션 훅으로만 조회해야 한다. 세션이 아직 로딩 중이거나 부재한 순간에는 하드코딩된 가짜 이름 대신 중립적인 플레이스홀더(예: 이니셜 아이콘 + "사용자")를 표시해야 하며, 크래시하거나 이전 사용자의 값을 잔존 표시해서는 안 된다. `user` 테이블에 존재하지 않는 소속/직함 필드를 새로 만들거나 다른 값으로 대체해서는 안 된다. 이 결정은 REQ-013으로 인해 `/cases/new` 자신이 동적 렌더링으로 전환된 이후에도 유효하다 — 레이아웃이 세션을 직접 조회하지 않는 것은 특정 페이지의 정적/동적 여부와 무관한, App Shell의 관심사 분리 원칙이다(REQ-013 참고). | `app/cases/layout.tsx:52-59` 조사 결과(하드코딩 확인), `next.config.ts`/`lib/auth/session.ts`/`lib/auth/client.ts` 직접 조사 결과(PPR 미설정, `headers()` 동적 API 확인, Better Auth 클라이언트 세션 훅 존재 확인 — research.md §5b), `lib/db/schema.ts` `user` 테이블 스키마 조사 결과(소속 필드 부재 확인) |
| REQ-006 | Where | Where 화면이 App Shell 안에서 렌더링되는 경우, App Topbar는 다음의 정확한 라우트→브레드크럼/타이틀 매핑을 표시해야 한다: `/cases/new` → 브레드크럼 "작업 공간 / 사건 입력" · 타이틀 "신규 사건 리서치 요청"; `/cases/[caseId]` → 브레드크럼 "작업 공간 / 리서치 리포트" · 타이틀 "리서치 리포트". [Round3: WORKSPACE→작업 공간, 타이틀→신규 사건 리서치 요청 — case-shell-topbar.tsx 실제 구현 정합] `#expert-feedback`은 `/cases/[caseId]` 페이지 **내부의 인페이지 앵커**일 뿐 별도 라우트나 별도 화면이 아니므로, URL 프래그먼트에 `#expert-feedback`이 존재하는지 여부와 무관하게 Topbar 타이틀은 항상 "리서치 리포트"로 고정되어야 하며 바뀌어서는 안 된다(사이드바의 "전문가 피드백" nav 항목은 이 페이지 내부 섹션으로의 앵커-스크롤 액션일 뿐, 별도 화면으로의 내비게이션이 아니다). 기존과 동일하게 CSS `position: fixed`/`sticky`를 적용하지 않고 본문과 함께 스크롤되어야 한다. | Pencil App Topbar 컴포넌트 스펙; `grep`으로 확인된 현재 미고정(non-fixed) 동작 유지(회귀 아님, 신규 추가만); `case-shell-nav.tsx`(`resolveCurrentCaseId`/`#expert-feedback` href 생성 로직)와 `app/cases/[caseId]/page.tsx`(`id="expert-feedback"` 인페이지 섹션) 직접 확인 — 전문가 피드백이 별도 라우트가 아님을 재확인 |

### D. Enum 한글 라벨 정합성

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-007 | While | While `EvidenceType` 값(`PRECEDENT`/`POLICY`/`STATUTE`/`DISPUTE_CASE`/`OTHER`)이 화면 어디에든 렌더링될 때(`evidence-item.tsx`, `page.tsx`, `feedback-form.tsx` 포함), 애플리케이션은 영문 raw 값 대신 한글 라벨(판례/약관/법령/분쟁조정례/기타)을 표시해야 하며, `feedback-form.tsx`의 기존 `{value,label}` 배열 패턴(`OVERALL_RATINGS` 등)과 동일한 방식으로 구현해야 한다. | `lib/pipeline/types.ts:59` `EvidenceType` 정의 조사, 렌더 위치 3곳 직접 확인(`evidence-item.tsx:34,36`, `page.tsx:314,506-507`, `feedback-form.tsx:313-317,433-434`, 영문 raw 노출 확인) |
| REQ-008 | While | While `QueryIssueType` 값(8종: `DISABILITY_LOCATION`/`DIAGNOSIS`/`INCIDENT_CIRCUMSTANCE`/`INJURY_DISEASE_RELATION`/`DISABILITY_GRADE_CRITERIA`/`PRE_EXISTING_CONDITION`/`CAUSATION`/`ADDITIONAL_CONFIRMATION_NEEDED`)이 화면 어디에든 렌더링될 때, 애플리케이션은 영문 raw 값 대신 Pencil Design System이 정의한 한글 라벨(장해 부위/진단명/사고 경위/상해·질병 관련성/장해 평가 기준/기왕증·퇴행성/인과관계/추가 확인 필요)을 REQ-007과 동일한 패턴으로 표시해야 한다. | `lib/pipeline/types.ts:33-42` `QUERY_ISSUE_TYPES` 단일 SSOT 상수 조사, Pencil Design System "Issue tag · 8종" 섹션 |

### E. 비확정성 안내 문구

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-009 | Ubiquitous | 리서치 리포트 화면의 사건 요약(Aggregate Status) 패널은 다음 문구를 정확히 시각적으로 노출해야 한다: "본 리포트는 공개된 판례·약관·법령을 기반으로 한 참고용 AI 리서치 결과입니다. 보험금 지급 여부나 지급액을 확정하지 않으며, 최종 판단은 담당 손해사정사의 검토가 필요합니다." | Pencil Aggregate Status 패널 스펙; 현재 UI에 시각적으로 부재함을 확인(백엔드 `lib/pipeline/safety-validator.ts`의 콘텐츠 필터와는 별개) |
| REQ-010 | Ubiquitous | "검토할 담보" 패널(`review-targets`)은 다음 부제 문구를 정확히 시각적으로 노출해야 한다: "추가 검토가 필요한 담보 항목입니다. 지급 가능 담보를 확정한 목록이 아닙니다." | Pencil 담보 검토 패널 subtitle 스펙; 현재 UI에 부재함을 확인 |

### F. Claim 카드 정합성

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-011 | Where | Where claim이 `status: "INSUFFICIENT"`인 경우, claim 카드는 "추가 확인 필요" 안내(Pencil의 원형 점선 아이콘 + 텍스트 패턴)를 표시해야 하며, 그 안내는 항상 리포트 레벨 `missingMaterials`/`uncertainty` 섹션(기존 `missing-materials`/`uncertainty` testid)으로 이동하는 앵커 링크를 포함해야 한다. 특정 `missingMaterial` 항목을 claim 카드 내부에 직접 나열하는 것은, 그 항목의 `relatedIssueType`이 해당 claim에 대해 이미 존재하는 `getClaimIssueTypes()` 파생 결과 집합에 포함될 때만 허용되며, 그렇지 않은 경우 claim 카드는 앵커 링크만 표시해야 한다(임의의 리포트-레벨 데이터를 claim 카드에 복제하는 것은 금지된다). `lib/pipeline/types.ts`의 `VerifiedClaim`/`MissingMaterial` 인터페이스에는 어떤 신규 필드도 추가해서는 안 된다. | `lib/pipeline/types.ts:106-122` `VerifiedClaim`/`MissingMaterial`/`VerificationResult` 인터페이스 직접 조사(claim 단위 근거 부족 필드 부재, `MissingMaterial.relatedIssueType` 필드 존재 확인), `page.tsx:63-72` 기존 `getClaimIssueTypes()` 헬퍼 직접 확인 — 추측이 아닌 코드 확인으로 결정론적 연결 규칙 확정 |

### G. 사건 입력 우측 레일 확장

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-012 | Ubiquitous | 사건 입력 화면 우측 레일의 "분석 상태" 패널은 4단계 정적 안내 목록(쟁점 자동 추출/판례·결정례 검색/약관·법령 대조/근거 검증 및 반대 논리 생성)을 순수 정보성 텍스트로 렌더링해야 하며, `cases` 테이블에 단계별 진행 데이터가 존재하지 않으므로 이 4단계 각각에 대해 개별 완료/진행 상태를 표시해서는 안 된다(가짜 진행률 금지). | `lib/db/schema.ts:75` `cases.status` 단일 텍스트 컬럼 조사(단계별 데이터 부재 확정); 사용자 확정 스코프 결정 1 |
| REQ-013 | Ubiquitous | 사건 입력 화면 우측 레일의 "최근 리서치" 패널은 현재 로그인 사용자가 소유한 사건 중 `createdAt` 내림차순 최근 3건 이하를 신규 read-only 조회 함수로 표시해야 하며, 이 함수는 기존 `cases` 테이블만 조회하고(신규 테이블·스키마·마이그레이션 없음) `lib/cases/get-case-for-owner.ts`와 동일한 owner-scope 신뢰 경계(`eq(cases.ownerUserId, ownerUserId)`)를 사용해야 한다. 각 항목은 사건 번호(`cases.id`), 제목(`input.diagnosisName`에서 파생), 보조 정보(`input.disabilityBodyPart`에서 파생), 상태(`cases.status`를 표시 레이어에서 한글 라벨로 번역, 저장값은 영문 유지)를 표시해야 한다. `input` JSON이 예상 필드를 갖추지 못한 경우(필드 누락 등) 해당 항목은 정의된 폴백 텍스트(예: "제목 없음"/"정보 없음")로 대체되어야 하며, 예외를 던지거나 패널 전체를 비정상적으로 사라지게 해서는 안 된다. **ownerUserId 조달 경로(신규 확정)**: 이 조회가 필요로 하는 `ownerUserId`는 신규 API 라우트 없이, `/cases/new`의 서버 페이지 컴포넌트(`NewCasePage`, `app/cases/new/page.tsx`) 자신이 `app/cases/[caseId]/page.tsx`가 이미 사용 중인 것과 동일한 `getCurrentSession()`(`lib/auth/session.ts`) 패턴으로 서버측에서 확인해 조달하고, 그 결과(`session.user.id`)를 이 조회 함수에 전달한다. `proxy.ts`의 쿠키 존재 확인(`hasSessionCookie`)은 이 조회의 신뢰 경계가 아니다 — 이 조회는 `getCaseForOwner`와 동일하게 서버측에서 진짜 세션 검증 + `ownerUserId` 필터링을 스스로 수행해야 한다. **빌드-안전성 요구사항(REQ-005a를 대체)**: `NewCasePage`가 이 서버측 세션 확인을 도입하는 결과로 `/cases/new`는 정적 생성에서 동적(요청 시점) 렌더링으로 전환되며, 이 전환은 이 REQ의 의도된 결과로 받아들여진다 — "반드시 정적 생성을 유지해야 한다"는 요구사항은 존재하지 않는다. 대신 다음이 유지되어야 한다: (a) 사용자별 데이터가 빌드 시점에 평가되거나 정적 HTML에 구워지지 않아야 한다, (b) 빌드 프로세스 자체는 실제 DB 연결을 요구하지 않아야 한다(빌드가 DB에 연결을 시도하다 실패해서는 안 된다), (c) 세션 조회와 DB 조회는 오직 요청 시점에만 발생해야 한다, (d) owner-scope는 서버측에서 강제되어 어떤 사용자도 다른 사용자의 최근 사건을 볼 수 없어야 한다. **폴백 동작**: 인증된 세션이 없는 경우 이 화면은 다른 보호된 라우트와 동일한 기존 인증-리다이렉트 흐름을 따라야 하며 신규 패턴을 도입해서는 안 된다. "최근 리서치" 조회 자체가 실패하는 경우 그 패널만 안전한 빈/오류 상태로 대체되어야 하며, 사건 입력 폼의 나머지 부분(좌측 폼 컬럼)을 깨뜨리거나 페이지 전체를 실패시켜서는 안 된다. `input` JSON 필드 누락/손상에 대한 폴백은 위에 정의된 필드 단위 규칙을 그대로 따른다. | 사용자 확정 스코프 결정 2(범위 포함); `lib/cases/get-case-for-owner.ts` 존재 및 owner-scope 패턴 직접 확인; `lib/db/schema.ts:65-78` `cases` 테이블에 `title` 컬럼 부재 확인, `case-input-form.tsx:44-52` 제출 payload 필드 구조 확인; `app/cases/[caseId]/page.tsx`의 `getCurrentSession()` 사용 패턴 직접 확인(REQ-005 동일 헬퍼 재사용); Next.js 16.3.2 동적 렌더링 메커니즘 직접 확인(research.md §5c 신규) |
| REQ-014 | Unwanted | 사건 입력 폼 Footer의 "임시 저장" 버튼은 비활성(disabled) 상태와 "준비 중" Chip으로만 렌더링해야 하며, 어떤 초안 저장 백엔드 로직(신규 API·DB write)도 연결해서는 안 된다. | 사용자 명시("신규 초안 저장 기능 없음"); Pencil 화면 05 Form Footer 스펙 |

### H. 실재하는 예외 화면

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-015 | Ubiquitous | 애플리케이션은 이 코드베이스에 실재하는 3개 예외 진입 경로에 한해 공통 시각 언어(중앙 정렬 아이콘/타이틀/설명/`{컨텍스트} · {ERROR_CODE}` 패턴)를 적용해야 한다: (1) 전역 404(`app/not-found.tsx`, 신규, App Shell 밖 — 루트 레이아웃만 적용), (2) 사건-없음/미소유를 통합 처리하는 404(`app/cases/[caseId]/not-found.tsx`, 신규, App Shell 안 — `getCaseForOwner`의 정보 은닉 설계를 존중해 별도 403 화면을 만들지 않음), (3) 기존 `app/cases/[caseId]/error.tsx`의 일시 런타임 오류 경계(기존 testid `case-error-retry`와 `reset()` 계약을 그대로 보존하는지 검증만 하며 리팩터링·일반화하지 않음). 세션 만료·네트워크 불가·"준비 중"에 대응하는 독립 화면은 만들지 않는다 — 각각 기존 로그인 리다이렉트(`redirect("/login")`), 기존 폼 인라인 오류 문구(`case-input-form.tsx`/`feedback-form.tsx`), 사이드바 비활성 nav Chip으로 이미 커버된다. | `app/cases/[caseId]/error.tsx` 전체 소스 직접 재조사(일반 런타임 오류 경계만 보유, 404/사건-없음 콘텐츠 부재 확인), `app/`/`app/cases/` 전체 `**/not-found.tsx` glob 검색(일치 파일 0개 확인), `lib/cases/get-case-for-owner.ts` 정보 은닉 설계 직접 확인 — research.md §7 정정된 baseline 근거 |

### I. 반응형 규칙

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-016 | Ubiquitous | 뷰포트 너비 1024px(태블릿)에서 인터페이스는 Pencil 프레임 `12`의 명시적 규칙 — 사이드바는 고정 폭을 유지하고, 우측 레일은 본문 아래로 이동해 2컬럼이 아닌 세로 배치가 되어야 한다. | Pencil 프레임 `12` 주석("RULE · 사이드바 유지 · 우측 레일은 본문 아래로 이동") |
| REQ-017 | Ubiquitous | 뷰포트 너비 390px(모바일)에서 사이드바는 오프캔버스 드로어로 전환되어야 하며, 다음 접근성 계약을 만족해야 한다: 탑바 햄버거 버튼(`mobile-nav-toggle`)으로 열리고 드로어 내부의 명확히 구분되는 닫기 버튼으로도 닫힐 수 있어야 하며, ESC 키 입력과 스크림(`mobile-nav-scrim`) 클릭으로도 닫혀야 하고, 열릴 때 포커스가 드로어(`mobile-nav-drawer`) 내부로 이동하고 닫힐 때 햄버거 버튼으로 복귀해야 하며, 열려 있는 동안 배경 스크롤이 잠기고 드로어 내부 요소는 닫혀 있는 동안 tab 순서에서 제외되어야 하며, 뷰포트가 1024px 이상으로 리사이즈되면 드로어/스크림 상태가 자동으로 초기화되어야 한다. **포커스 트랩(신규 확정)**: 드로어가 열려 있는 동안 Tab/Shift+Tab 키 순회는 드로어 내부의 포커스 가능 요소들로만 닫힌 루프를 이루어야 하며(마지막 요소에서 Tab 시 첫 요소로, 첫 요소에서 Shift+Tab 시 마지막 요소로 순환), 배경 콘텐츠(드로어 외부)는 열려 있는 동안 포커스와 상호작용 모두에서 배제되어야 한다(예: `inert` 속성 또는 동등한 메커니즘). 기존 설치된 Dialog 프리미티브(`@base-ui/react` 등)를 재사용해 이 계약을 만족시키는 경우에도, 자동화 테스트는 그 프리미티브의 존재 여부가 아니라 이 포커스 트랩/배경 비활성화의 실제 동작을 직접 관찰해 검증해야 한다. | Pencil 프레임 `13` 주석(오프캔버스 드로어 + 스크림 규칙); 표준 드로어 접근성 요구사항, `package.json` 직접 조사(신규 대형 의존성 불필요 판단, research.md §10) |
| REQ-018 | Ubiquitous | 뷰포트 너비 1280px에서 재스타일된 5개 화면(로그인/사건 입력/리포트/피드백/예외 화면 중 1개) 모두 가로 오버플로, 사이드바-콘텐츠 겹침, 텍스트/컨트롤 잘림, 클릭 불가 겹침 중 어느 것도 발생해서는 안 된다. | SPEC-PILOT-VISUAL-001 REQ-022/AC-021b 선례(1280px 비붕괴 기준) 재확인·확장 |

### J. 기능·데이터 보존 (Unwanted, 전역) 및 품질 게이트

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-019 | Unwanted | 이 SPEC의 구현은 `lib/db/schema.ts`, `lib/validation/case-input.ts`, `lib/feedback/schema.ts`, `lib/cases/create-case.ts`, `lib/feedback/submit-feedback.ts`, `lib/pipeline/**`, `lib/ai/**`, `db/**`, 어떤 마이그레이션도 수정해서는 안 된다 — REQ-013이 명시하는 신규 read-only 조회 함수(신규 파일, 기존 파일 수정 아님)만이 유일한 예외다. | 사용자 하드 제약; SPEC-PILOT-VISUAL-001 REQ-019 계승 |
| REQ-020 | Unwanted | 이 SPEC의 구현은 spec.md §3(보존·신규 테스트 계약)에 열거된 기존 `data-testid` 값의 이름을 변경하거나 제거하거나 그 의미를 바꿔서는 안 된다. | 기존 테스트 스위트 보존, SPEC-PILOT-VISUAL-001 §3 목록 승계 |
| REQ-021 | Unwanted | 이 SPEC의 구현은 "리포트 보관함"/"판례·약관 DB" 페이지 자체(목록 뷰, 라우트, API)를 만들어서는 안 된다 — REQ-004가 정의하는 사이드바 비활성 nav 항목만 존재해야 한다. | SPEC-PILOT-VISUAL-001 REQ-006 원칙 계승, 사용자 확정 |
| REQ-022 | While | While 폼 제출(사건 생성 또는 피드백 제출)이 진행 중일 때, 클라이언트 단일 흐름(single-flight) 가드, 대기 인디케이터, 필드 비활성화 동작은 이 SPEC의 어떤 변경 이후에도 기능적으로 완전히 동일하게 유지되어야 한다. | SPEC-PILOT-VISUAL-001 REQ-021, SPEC-PILOT-UX-001 REQ-001~003/007~011 보존 계승 |
| REQ-023 | Ubiquitous | 이 SPEC이 재스타일하거나 신규 추가하는 모든 화면·컴포넌트는 현재 구현에 이미 존재하는 접근성 속성(label 연관, button semantics, `disabled` 상태, `role="status"`, `aria-live`, focus 동작) 및 이 SPEC이 신규 추가하는 비활성 nav/링크 항목의 `aria-disabled="true"`, 모바일 드로어의 REQ-017 접근성 계약을 보존·적용해야 한다. | moai-ref-react-patterns 접근성 체크리스트, SPEC-PILOT-VISUAL-001 REQ-023 계승 |
| REQ-024 | When(이벤트 감지) | When 이 SPEC의 구현 완료 후 `pnpm test`, `pnpm test:e2e`, `pnpm lint`, `pnpm build`, `pnpm format:check` 중 어느 것이 실행되더라도, `pnpm test`/`pnpm test:e2e`/`pnpm lint`/`pnpm build`는 종료 코드 0을 반환해야 하고 `pnpm format:check`는 이 SPEC이 신규로 도입한 포맷 위반 0건이어야 한다. | Definition of Done, acceptance.md §품질 게이트 |

## §3. 보존·신규 테스트 계약 (REQ-020이 참조하는 전체 목록)

### 보존 대상 (SPEC-PILOT-VISUAL-001에서 승계, 이름·의미 변경 금지)

- `login-form.tsx`: `login-form`, `login-email`, `login-password`, `login-error`, `login-submit`
- `case-input-form.tsx`: `case-input-form`, `case-incident-description`, `case-diagnosis-name`, `case-disability-body-part`, `case-incident-date`, `case-submit`, `case-pending-indicator`(+ `role="status" aria-live="polite"`)
- `page.tsx`: `summary-banner`, `review-targets`, `verified-claims`, `claim-status`(+ `data-status`), `cited-evidence-empty`, `missing-materials`, `uncertainty`, `case-report`, 정확한 leaf 텍스트 노드 "사건 요약"
- `feedback-form.tsx`: `feedback-form`(컨테이너), `feedback-overall-rating`(id), `feedback-overall-comment`, `feedback-section`(≥5), `feedback-missed-issue-row`/`-add`/`-remove`, `feedback-claim-verdict`, `feedback-evidence-verdict`, `feedback-outcome-description`, `feedback-outcome-confirmed-at`, `feedback-submit`, `feedback-success`
- `error.tsx`: `case-error-retry`(**런타임 오류 `reset()` 계약 전용 — 404/사건-없음 검증과 절대 혼동 금지**, research.md §7a/§8)
- `app/cases/layout.tsx` / `case-shell-nav.tsx`: 사이드바 `aria-label="사건 관리 내비게이션"` 및 SPEC-PILOT-VISUAL-001 REQ-006 pathname 전용 링크 규칙(사건 입력/리서치 리포트/전문가 피드백)

### 이 SPEC이 신규로 도입하는 testid (run-phase에서 정확한 이름으로 부여, 이후 SPEC에서 보존 대상이 됨)

- 사이드바 비활성 nav 2항목: `sidebar-nav-archive`, `sidebar-nav-precedent-db`(각각 `aria-disabled="true"`, `href` 없음)
- 로그인: `login-password-toggle`(표시/숨김 토글 버튼)
- Case Input 우측 레일: `case-recent-research`(목록 컨테이너), `case-recent-research-item`(항목 반복), `case-input-draft-save`(비활성 버튼)
- 실재하는 예외 화면(**정확히 2개** — `error.tsx`는 기존 `case-error-retry`를 그대로 사용하므로 신규 testid 없음): `global-not-found`(`app/not-found.tsx` 최상위 컨테이너), `case-not-found`(`app/cases/[caseId]/not-found.tsx` 최상위 컨테이너)
- 모바일 드로어(REQ-017): `mobile-nav-toggle`(햄버거 버튼), `mobile-nav-drawer`(드로어 컨테이너), `mobile-nav-scrim`(스크림/백드롭)

## §4. 요구사항 교차 참조

design.md §1(토큰 감사)·§2(로그인 폰트 격리 + 기능 확장)·§3(신규/재사용 컴포넌트)·§4(화면별 구조 매핑, 로그인·App Shell 확장·정확한 Topbar 매핑·실재하는 예외 화면 3종·반응형·드로어 접근성)는 REQ-001~006, REQ-015~018의 시각 명세를 담당한다. research.md §2~§12(EvidenceType/QueryIssueType 렌더 위치, `VerifiedClaim`/`MissingMaterial` 인터페이스 직접 조사, `getCaseForOwner` 신뢰 경계 및 정보 은닉 설계, 세션 조회 안전성 분석과 §5c의 `/cases/new` 동적 렌더링 전환 메커니즘 확정, 로그인 화면 링크/토글 재조사, **정정된** 공통 예외 화면 baseline, 최근 리서치 데이터 파생 규칙·ownerUserId 조달 경로, 모바일 드로어 접근성 구현 자원)은 REQ-005/REQ-007~015/REQ-017/REQ-019~022가 지켜야 할 정확한 기준선과 REQ-005/REQ-011/REQ-013/REQ-015의 스코프·결정 근거를 담당한다. plan.md §마일스톤은 REQ 그룹 A~J를 실행 순서로 분해한다. acceptance.md는 REQ-001~024 각각에 대한 검증 가능한 Given-When-Then 시나리오를 제공한다.

## §5. Out of Scope

### Out of Scope — 신규 기능

- 신규 DB 스키마 변경 또는 마이그레이션(REQ-013의 신규 read-only 조회 함수는 기존 `cases` 테이블만 조회하며 스키마를 바꾸지 않음)
- 신규 API 엔드포인트 또는 기존 엔드포인트의 요청/응답 스키마 변경
- AI Researcher/Skeptic/Verifier 파이프라인 로직 및 출력 스키마 변경(REQ-011이 명시적으로 신규 필드 추가를 금지)
- 근거자료(evidence) 검색/랭킹 로직 변경
- "리포트 보관함"/"판례·약관 DB" 페이지 자체의 신규 구현(REQ-021에서 명시적으로 생략, 사이드바 비활성 nav만 존재)
- 초안 저장(draft-save) 기능(REQ-014에서 명시적으로 생략)
- "분석 상태" 단계별 실시간 진행률 추적 인프라(REQ-012에서 명시적으로 생략, 정적 안내만)

### Out of Scope — 실재하지 않는 예외 화면

- **별도 "권한없음"(403) 화면**: `getCaseForOwner`의 정보 은닉 설계(존재-없음=소유권-없음을 동일한 `null`로 통합)를 보호하기 위해, REQ-015는 사건-없음/미소유를 하나의 404 화면으로 통합한다. 별도 403을 만들면 "이 ID는 존재한다"는 정보를 역으로 노출하게 된다.
- **"세션이 만료되었습니다" 독립 화면**: 기존 `page.tsx`의 `if (!session?.user) redirect("/login")` 동작을 그대로 유지한다. 이를 구분해서 안내하려면 신규 세션-만료 감지 로직(예: 리다이렉트 쿼리 파라미터)이 필요해 REQ-019(인증 로직 무변경)와 충돌하므로 범위 밖이다.
- **"네트워크에 연결할 수 없습니다" 독립 페이지**: `case-input-form.tsx`/`feedback-form.tsx`가 이미 보유한 인라인 오류 문구("네트워크 오류로 요청을 완료하지 못했습니다...")를 그대로 재사용한다.
- **"준비 중인 기능입니다" 독립 페이지**: REQ-004의 사이드바 비활성 nav "준비 중" Chip이 이미 이 개념을 커버한다.
- **Pencil 프레임 `11`의 6종 변형을 독립적인 쇼케이스 컴포넌트로 전량 구현**: 실제 프로덕션에서 도달 불가능한 컴포넌트를 만들지 않는다 — REQ-015는 이 코드베이스에 실재하는 3개 진입 경로에만 시각 언어를 적용한다.

### Out of Scope — 인증 및 다른 라우트

- Better Auth 인증/인가 로직 변경(REQ-002는 시각 재현만, `authClient.signIn.email` 로직 무변경)
- 관리자 대시보드
- `/` 홈 화면의 추가 변경(SPEC-PILOT-VISUAL-001에서 이미 미변경 확정, 이 SPEC도 계승)

### Out of Scope — 로그인 정책 페이지

- 이용약관/개인정보처리방침/고객지원 실제 페이지 구현(REQ-002는 대응하는 실제 라우트가 없음을 확인해 비활성 텍스트로만 렌더링 — 실제 정책 페이지는 후속 SPEC으로 명시적으로 미룬다)

### Out of Scope — 반응형 및 플랫폼

- 태블릿(1024px)·모바일(390px) 외의 추가 브레이크포인트(예: 768px, 480px) 신규 설계 — REQ-016/REQ-017이 정의하는 Pencil 명시 규칙 2종만 구현
- 네이티브 모바일 앱
- 프로덕션 배포 파이프라인 변경

### Out of Scope — 도구/라이브러리 도입

- 대형 신규 UI 프레임워크(shadcn/Tailwind 외) 도입
- 포커스 트랩 전용 신규 패키지(예: `focus-trap-react`) 도입 — REQ-017의 접근성 계약은 네이티브 React state + 표준 DOM 이벤트로 구현하며, 이미 설치된 `@base-ui/react`가 run-phase에 필요한 프리미티브를 제공하면 그것만 우선 재사용한다(research.md §10)
- 애니메이션 전용 라이브러리(Framer Motion 등) 도입 — CSS `transition`으로 충분한 범위 내에서만 모션 적용(드로어 슬라이드인 포함)
- `@base-ui/react` 대체(기존 프리미티브 라이브러리 유지)

### Out of Scope — 데이터 및 통계

- Gold Dataset 관련 작업
- 통계/집계 데이터 수집 로직 변경(SPEC-FEEDBACK-001 범위)
- Claim 단위 근거 부족 사유의 AI 파이프라인 신규 필드화(REQ-011이 근거를 들어 명시적으로 배제 — `VerifiedClaim`/`MissingMaterial` 인터페이스에 필드 추가 금지)
