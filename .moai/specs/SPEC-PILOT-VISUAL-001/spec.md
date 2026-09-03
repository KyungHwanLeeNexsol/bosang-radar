---
id: SPEC-PILOT-VISUAL-001
title: "파일럿 비주얼 리스킨 — Pencil 디자인(claimradar-ui.pen) 재현, 기능/데이터 무변경"
version: "0.1.1"
status: draft
created: 2026-09-03
updated: 2026-09-03
author: Nexsol
priority: P2
phase: "v0.2.0 target"
module: "app/cases/new/, app/cases/[caseId]/, app/globals.css, app/layout.tsx"
lifecycle: spec-anchored
tags: "visual, ui-restyle, design-system, tailwind-v4, pretendard, app-shell, no-functional-change, pencil"
tier: L
depends_on: [SPEC-PILOT-UX-001]
---

## HISTORY

- 2026-09-03 (iteration 2, plan-auditor 1차 감사 FAIL 대응 — 종합 점수 0.63): plan-auditor iteration-1 감사가 D1/D2(GEARS 모달리티 위반)/D7(사이드바 nav 링크 미확정)를 critical로, D3~D6(REQ-AC 추적성 갭)/D8(design.md 토큰 네이밍 충돌)을 major로, D9/D10을 minor로 지적한 데 대응한 수정. (1) **D7**: 사용자가 "리서치 리포트" nav 항목의 target을 확정 — 항상 활성 링크이며, 사용자에게 기존 사건이 있으면 최근 생성 사건의 리포트로, 없으면 `/cases/new`로 연결하는 결정론적 규칙(신규 스키마/API 없이 기존 `cases` 테이블 `created_at DESC LIMIT 1` 조회, `getCaseForOwner`와 동일한 신뢰 경계). REQ-006 본문에 이 규칙을 명시하고, plan.md §B 결정 2·§F1에서 "비활성 label" 대안을 완전히 제거했다. (2) **D1**: 구 REQ-008(component-reuse discipline)의 "도입할 수 있다"(허용적 모달리티)를 Where...shall 형태의 의무 요구사항으로 재작성하고, "이미 표현 가능한 경우 신규 컴포넌트를 도입해서는 안 된다"는 Unwanted 대응 요구사항(신 REQ-009)을 추가했다 — REQ 총량이 23→24로 증가. (3) **D2**: 구 REQ-013(우측 레일 클라이언트 집계)의 "렌더링할 수 있다"를 "렌더링해야 한다"는 의무 형태로 전환했다(서버 조회 금지 절반은 이미 인접 Unwanted REQ가 담당). (4) D1의 신규 REQ 삽입으로 REQ-009 이후 전체를 REQ-010~024로 재넘버링했다(총량 24, Tier L 상한 25 이내). spec.md 요구사항 표·§3·§4, plan.md 전체 REQ-ID 참조, acceptance.md 전체 REQ-ID 참조·Group 범위, design.md REQ-ID 참조를 모두 새 번호 체계로 갱신했다. (5) **D3~D6**: REQ-003(Manrope 워드마크)·신 REQ-009(컴포넌트 재사용 규율)·신 REQ-020(구 REQ-019, testid 보존)·신 REQ-022(구 REQ-021, 데스크톱 우선)에 대해 누락되어 있던 AC 추적성을 acceptance.md에서 보완했다 — REQ-003은 기존 AC-002(폰트 검증)에 Manrope And-절을 추가하는 방식으로, 나머지 셋은 신규 하위-ID AC(AC-006b/AC-020b/AC-021b, 각 Group C/G에 물리적으로 인접 배치)로 보완했다. Tier L AC 상한(25)을 지키기 위해 REQ-014/REQ-015(신규 API 호출 금지를 서로 다른 관측 지점에서 검증하던 옛 AC-012/AC-013)를 하나의 AC-012로 통합했다(번호 013은 의도적 결번). REQ-020(testid 보존)은 DoD 체크리스트 항목에서 AC-020b로 정식 승격했고, REQ-022(1280px 비붕괴)는 Edge Case 서술에서 AC-021b로 승격했다. 최종 AC 라벨 총 25개(006b/020b/021b 포함, 013 결번) — Tier L 상한 이내. (6) **D8**: design.md §1/§3의 신규 Pencil 토큰 예시 이름(`--color-accent`, `--color-sidebar` 등)이 실제로 이미 `app/globals.css`에 존재하는 shadcn CSS 커스텀 속성(`--color-accent: var(--accent);`, `--color-sidebar: var(--sidebar);`)과 충돌함을 확인 — 헥스값은 그대로 두고 커스텀 속성 이름만 `--color-bora-accent`/`--color-bora-ok`/`--color-bora-warn`/`--color-bora-danger`/`--color-app-sidebar`/`--color-bora-ink` 등으로 재네이밍했다. spec.md REQ-001의 design.md §1 교차 참조는 이름 충돌 회피 사실을 명시하도록 갱신했다. (7) **D9**: spec.md §3에 `page.tsx:131`에 존재하지만 테스트에서 참조되지 않는 `case-report` testid를 완전성을 위해 추가했다. (8) **D10**: acceptance.md Group F("REQ-015~020")·Group G("REQ-018~022")의 REQ 범위 겹침(REQ-018~020)을 새 번호 체계(Group F: REQ-016~021, Group G: REQ-022~024, 상호 배타적)로 정정했다. spec.md §1(핵심 판단 근거) 등 그 외 섹션은 REQ-ID 갱신 외에 변경하지 않았다.
- 2026-09-03: 최초 작성 (manager-spec) — 확정된 Pencil 디자인(`design/claimradar-ui.pen`)을 Next.js 앱에 순수 시각 계층에서만 재현한다. 신규 기능·API·DB·AI 변경 없음. 오케스트레이터 세션에서 Pencil 디자인 파일 직접 조사(`GetVariables`, 프레임 구조) 및 코드베이스 직접 조사(read-only)로 확인된 구체적 산출물을 근거로 요구사항을 고정했다.

## §1. 개요 (Overview)

### WHY — 배경 및 동기

SPEC-PILOT-UX-001로 사건 입력→분석 대기→리포트 검토→피드백 제출 흐름의 사용성 결함이 해소되었으나, 화면은 여전히 shadcn 기본 스타일(브랜드 액센트 컬러 없음, 공유 앱 셸 없음, Geist 폰트)로 렌더링된다. 손해사정사 대상 확정 디자인(`design/claimradar-ui.pen`)이 이미 존재하며, 다음 세 화면에 대해 다크 사이드바+탑바 셸, 브랜드 토큰(보라 계열 accent), Pretendard 타이포그래피, 카드/배지/칩 기반 정보 위계를 정의한다: 01 사건 입력, 02 사건 Research Report, 03 전문가 피드백. 이 SPEC은 순수 시각 재현 작업이며, 어떤 기능·데이터·API 계약도 변경하지 않는다.

### WHAT — 이번 SPEC 범위

1. 디자인 토큰(색상·타이포그래피) 및 Pretendard 폰트를 기존 Tailwind v4 `@theme inline` 블록에 추가
2. 신규 앱 셸(다크 사이드바 + 탑바)을 `app/cases/` 라우트 그룹에만 적용
3. 공유 프레젠테이션 컴포넌트(배지/칩/노티스 등) 정비
4. 3개 화면(사건 입력·리포트·피드백) 재스타일링 — 기존 데이터 계약·테스트 셀렉터·접근성 속성 완전 보존
5. Pencil 디자인이 보여주지만 현재 데이터 모델에 없는 항목은 새 기능을 만들지 않고 명시적으로 축소(§Out of Scope)

기존 API·DB·AI 파이프라인 계약은 전혀 수정하지 않는다. 새 스키마·마이그레이션·서버 write-path 변경은 없다.

### 핵심 판단 근거 — Tier L

영향 범위는 전역 디자인 토큰(`app/globals.css`), 신규 라우트 그룹 레이아웃(`app/cases/layout.tsx`, 신규), 폰트 설정(`app/layout.tsx`), 신규 공유 프레젠테이션 컴포넌트 다수, 그리고 기존 3개 화면 컴포넌트(`case-input-form.tsx`, `page.tsx`, `feedback-form.tsx`, `error.tsx`) 전체 재스타일링과 대응 테스트 셀렉터 갱신을 포함해 15개를 초과하는 파일에 걸치며, 예상 변경량은 1000 LOC를 상회할 것으로 판단된다(다수의 신규 프레젠테이션 컴포넌트 + 4개 기존 파일의 실질적 재작성 + 다수 테스트 파일 셀렉터 조정). 따라서 Tier L(design.md + research.md 포함 5개 아티팩트)로 분류한다.

## §2. 요구사항 (Requirements — GEARS 표기법)

### A. 디자인 토큰 및 타이포그래피

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-001 | Ubiquitous | 애플리케이션은 `app/globals.css`의 기존 `@theme inline` 블록에 design.md §디자인 토큰에 정의된 색상 토큰(bg/surface/line/ink/accent/ok/warn/danger/sidebar/bora 계열) 및 타이포그래피 스케일(H1/H2/H3/Body/Body S/Meta/Label S)을 추가해야 한다 — 기존 shadcn 베이스 토큰(OKLCH neutral)을 대체하지 않고 추가적으로 확장하며, 신규 커스텀 속성 이름은 기존 shadcn 커스텀 속성(예: `--color-accent`, `--color-sidebar`)과 충돌하지 않는 `--color-bora-*`/`--color-app-*` 네임스페이스를 사용해야 한다(design.md §1 참고, plan-auditor D8 대응). | Pencil `GetVariables()` 조사 결과, 사용자 확정 |
| REQ-002 | While | While 본문 텍스트를 렌더링할 때, 애플리케이션은 `next/font/local`과 `pretendard` npm 패키지를 통해 로드한 Pretendard 폰트를 사용해야 하며, `app/layout.tsx`의 기존 동작(루트 레이아웃 구조, `<html lang="ko">`)은 폰트 import 교체 외에는 변경되어서는 안 된다. | 사용자 확정(Pretendard, Geist 대체) |
| REQ-003 | Where | Where BORA 브랜드 워드마크가 텍스트로 렌더링되는 경우(이미지/SVG가 아닌 경우), 사이드바는 해당 텍스트에 한해 `next/font/google`로 로드한 Manrope(weight 800) 폰트를 사용해야 한다. | Pencil "00 · Design System" 프레임 Brand 스펙 |

### B. 앱 셸 (Sidebar + Topbar)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-004 | Ubiquitous | 애플리케이션은 신규 라우트 그룹 레이아웃 `app/cases/layout.tsx`를 제공해야 하며, 이 레이아웃은 다크 사이드바(고정 폭, `fill: sidebar` 토큰)와 탑바(브레드크럼 + 페이지 타이틀)를 렌더링해야 한다. | Pencil App Sidebar/Topbar 컴포넌트 스펙 |
| REQ-005 | Unwanted | 앱 셸 레이아웃은 `app/page.tsx`, `app/login/`, 또는 `app/cases/` 외부의 어떤 라우트도 감싸서는 안 되며, `app/layout.tsx`의 기존 동작(폰트 import 교체 제외)을 변경해서는 안 된다. | 사용자 명시적 범위 제한(`/`, `/login` 미변경) |
| REQ-006 | Ubiquitous | 사이드바는 정확히 3개의 내비게이션 항목을 렌더링해야 한다 — 사건 입력(`/cases/new`), 리서치 리포트, 전문가 피드백 — 이며 실재하지 않는 기능(리포트 보관함, 판례·약관 DB)에 대한 비활성 placeholder 링크를 추가해서는 안 된다. "리서치 리포트" 항목은 항상 활성 상태의 실제 링크여야 하며, 다음 결정론적 규칙으로 target을 계산해야 한다: 현재 인증된 사용자에게 하나 이상의 기존 사건이 존재하면 가장 최근에 생성된 사건의 리포트 페이지(`/cases/[caseId]`)로 연결하고(기존 `cases` 테이블에 대한 `created_at DESC LIMIT 1`의 단순 조회 — 신규 스키마·API 없이 기존 `getCaseForOwner`와 동일한 신뢰 경계), 사용자에게 사건이 없으면 `/cases/new`로 연결해야 한다. | 사용자 확정("3개 실제 링크만" + D7 결정론적 규칙) |

### C. 공유 프레젠테이션 컴포넌트

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-007 | While | While 사건 또는 개별 주장(claim)의 검증 상태가 화면 어디에든 표시될 때(리포트의 `claim-status` pill, 신규 집계 배너 포함), 애플리케이션은 공유 Badge/Status 프레젠테이션 컴포넌트를 통해 렌더링해야 하며, VERIFIED는 ok 토큰 쌍, INSUFFICIENT는 warn 토큰 쌍으로 매핑해야 하고, 기존 `claim-status` testid와 `data-status` 속성을 그대로 유지해야 한다. | Pencil Badge/Status 컴포넌트 스펙, `page.tsx:127-137` 조사 결과(P0 유지 항목) |
| REQ-008 | Where | Where 기존 설치된 shadcn 프리미티브(Button/Card/Input/Label/Textarea)가 필요한 시각 패턴을 표현할 수 없는 경우, 애플리케이션은 신규 shadcn-호환 프레젠테이션 프리미티브(Badge/Chip/Notice)를 도입해야 한다. | Simplicity 원칙, 사용자 지시("작은 프레젠테이션 컴포넌트 우선 고려"); plan-auditor D1 대응(모달리티 mandatory화) |
| REQ-009 | Unwanted | 애플리케이션은 기존 설치된 shadcn 프리미티브가 이미 필요한 시각 패턴을 표현할 수 있는 경우에는 신규 프레젠테이션 프리미티브를 도입해서는 안 된다. | Simplicity 원칙(REQ-008의 Unwanted 대응 요구사항); plan-auditor D1 대응 |

### D. 화면 01 · 사건 입력

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-010 | Ubiquitous | 사건 입력 화면은 Pencil "01 · 사건 입력" 프레임의 2컬럼 레이아웃(좌: "사건 개요" 패널, 우: 고정 Notice 레일)을 시각적으로 재현해야 하며, 기존 4개 필드(`incidentDescription`, `diagnosisName`, `disabilityBodyPart`, `incidentDate`)와 그 검증 로직을 그대로 보존해야 한다. | Pencil 화면 01 구조, `case-input-form.tsx` 조사 결과 |
| REQ-011 | Where | Where Pencil 디자인의 우측 레일이 현재 코드베이스에 대응 데이터/기능이 없는 "분석 상태" 또는 "최근 리서치" 패널을 보여주는 경우, 사건 입력 화면은 새 진행률 추적 인프라나 최근 사건 조회 기능을 만들지 않고 해당 패널을 완전히 생략해야 한다(빈 상태나 placeholder를 렌더링해서는 안 된다). | 사용자 명시("신규 DB/API 기능 없음") |

### E. 화면 02 · Research Report

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-012 | While | While 리포트가 존재할 때, 사건 상세 화면은 Pencil "사건 요약" 패널 구조(메타 스트립 + 집계 상태 블록)를 재현해야 하며, 기존 `summary-banner` testid가 DOM 순서상 "사건 요약" 텍스트보다 먼저 렌더링되는 제약(AC-005, SPEC-PILOT-UX-001에서 확립)을 그대로 유지해야 한다. | Pencil 화면 02 구조, `page.tsx:81-92` 조사 결과 |
| REQ-013 | While | While 개별 주장(claim) 카드를 렌더링할 때, 애플리케이션은 Pencil의 claim-card 구조(헤더 + 결론/이유/반대 논리/근거자료 행)를 시각적으로 재현해야 하며, `renderEvidenceReference()` 헬퍼가 생성하는 `sourceUrl` 링크의 `target="_blank" rel="noopener noreferrer"` 속성(AC-008)과 `cited-evidence-empty` 빈 상태 testid를 그대로 유지해야 한다. | Pencil Evidence Item 컴포넌트, `page.tsx` 조사 결과(P0 유지 항목) |
| REQ-014 | Where | Where Pencil의 리포트 우측 레일이 이미 렌더링된 데이터(claim 제목, `evidenceType` 카운트)만으로 클라이언트 사이드에서 파생 가능한 "검토 항목" 앵커 목록 또는 "수집 근거 유형" 막대 차트를 보여주는 경우, 애플리케이션은 새 API/DB 조회를 추가하지 않고 이미 서버에서 전달된 props를 클라이언트에서 집계하여 해당 패널을 렌더링해야 한다. | Pencil 우측 레일 구조, 클라이언트 집계로 충족 가능; plan-auditor D2 대응(모달리티 mandatory화) |
| REQ-015 | Unwanted | 사건 상세 화면은 이 SPEC의 범위 내에서 어떤 우측 레일 패널을 채우기 위해서도 새로운 DB/API 호출을 추가하거나 기존 `evidence` SELECT 프로젝션을 확장해서는 안 된다. | 신규 기능 금지 제약 |

### F. 화면 03 · 전문가 피드백

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-016 | While | While 피드백 폼을 렌더링할 때, 애플리케이션은 Pencil의 번호 매김 섹션 패턴(헤더: 번호+타이틀+필수 Chip, 본문: 필드)을 재현해야 하며, 기존 5개 이상의 `feedback-section` testid 블록(AC-014)과 모든 native `<select>` 요소(`select.value = ...; dispatchEvent(new Event("change"))` 기반 테스트 상호작용 패턴)를 그대로 유지해야 한다. | Pencil 화면 03 구조, `feedback-form.test.tsx` 조사 결과 |
| REQ-017 | Unwanted | "누락된 쟁점" 섹션의 동적 추가/삭제 배열 UI(`missedIssues` 상태, `feedback-missed-issue-add`/`-remove`/`-row` testid)는 정적 체크리스트로 대체되어서는 안 된다 — Pencil의 Check Row 시각 스타일만 참고하여 기존 동적 행의 시각적 표현을 개선하는 데 그쳐야 한다. | 사용자 명시("동적 행 유지, 정적 체크리스트로 강제 대체 금지") |
| REQ-018 | Where | Where Pencil 디자인에 "임시 저장" 버튼이 폼 푸터에 나타나지만 현재 코드베이스에 초안 저장(draft persistence) 기능이 존재하지 않는 경우, 피드백 폼 푸터는 새 초안 저장 인프라를 만들지 않고 해당 버튼을 생략해야 한다. | 사용자 명시("신규 초안 저장 기능 없음") |

### G. 기능 보존 (Unwanted, 전역)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-019 | Unwanted | 이 SPEC의 구현은 `lib/db/schema.ts`, `lib/validation/case-input.ts`, `lib/feedback/schema.ts`, `lib/cases/create-case.ts`, `lib/feedback/submit-feedback.ts`, `lib/pipeline/**`, `lib/ai/**`, `db/**`, 및 어떤 마이그레이션이나 API/DB/AI 계약도 수정해서는 안 된다. | 사용자 하드 제약 |
| REQ-020 | Unwanted | 이 SPEC의 구현은 §3(Preserved Test Contracts)에 열거된 기존 `data-testid` 값의 이름을 변경하거나 제거하거나 그 의미를 바꿔서는 안 된다. | 사용자 하드 제약, 기존 테스트 스위트 보존 |
| REQ-021 | While | While 폼 제출(사건 생성 또는 피드백 제출)이 진행 중일 때, 클라이언트 단일 흐름(single-flight) 가드, 대기 인디케이터, 필드 비활성화 동작은 재스타일링 이후에도 기능적으로 완전히 동일하게 유지되어야 한다. | SPEC-PILOT-UX-001 REQ-001~003/007~011 보존 |

### H. 비기능 요구사항

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-022 | Ubiquitous | 재스타일된 인터페이스는 1440px 이상 데스크톱 뷰포트 너비를 1차 지원 대상으로 삼아야 하며, 1280px까지의 일반 노트북 너비에서 명백한 레이아웃 붕괴(가로 스크롤, 요소 겹침)를 피해야 한다 — 전용 반응형 재설계는 이 SPEC의 범위가 아니다. | 사용자 명시("데스크톱 우선, 모바일 최적화 범위 제외") |
| REQ-023 | Ubiquitous | 재스타일된 인터페이스는 현재 구현에 이미 존재하는 모든 접근성 속성(label 연관, button semantics, `disabled` 상태, `role="status"`, `aria-live`, focus 동작)을 그대로 보존해야 한다. | moai-ref-react-patterns 접근성 체크리스트, 기존 코드 조사 결과 |
| REQ-024 | When(이벤트 감지) | When 이 SPEC의 구현 완료 후 `pnpm test`, `pnpm test:e2e`, `pnpm lint`, `pnpm build` 중 어느 것이 실행되더라도, 각 명령은 종료 코드 0을 반환해야 한다. | Definition of Done, acceptance.md §품질 게이트 |

## §3. Preserved Test Contracts (REQ-020이 참조하는 전체 목록)

이 SPEC 구현 중 이름·의미가 변경되어서는 안 되는 `data-testid`/속성 전체 목록 (research.md §테스트 요약에서 상세 근거 확인):

- `case-input-form.tsx`: `case-input-form`, `case-incident-description`, `case-diagnosis-name`, `case-disability-body-part`, `case-incident-date`, `case-submit`, `case-pending-indicator`(+ `role="status" aria-live="polite"`)
- `page.tsx`: `summary-banner`, `review-targets`, `verified-claims`, `claim-status`(+ `data-status`), `cited-evidence-empty`, `missing-materials`, `uncertainty`, `case-report`(현재 `page.tsx:131`에 존재하나 어떤 기존 테스트에서도 참조되지 않음 — 향후 테스트 커버리지 확장에 대비해 이름을 보존하며, 이 SPEC은 이 testid를 렌더링하는 요소를 제거·개명하지 않는다), 정확히 leaf 텍스트 노드 "사건 요약"
- `feedback-form.tsx`: `feedback-overall-rating`(id), `feedback-section`(≥5), `feedback-missed-issue-row`/`-add`/`-remove`, `feedback-claim-verdict`, `feedback-evidence-verdict`, `feedback-submit`, `feedback-success`
- `error.tsx`: `case-error-retry`

## §4. 요구사항 교차 참조

design.md §디자인 토큰(신규 `--color-bora-*`/`--color-app-*` 네임스페이스, plan-auditor D8 대응) 및 §화면별 컴포넌트 매핑은 REQ-001~003(토큰/폰트), REQ-004~006(앱 셸, D7 링크 규칙 포함), REQ-007~009(공유 컴포넌트), REQ-010~018(화면별 재스타일)의 시각적 명세를 담당한다. research.md §현재 구현 사실은 REQ-019~021(기능 보존)이 지켜야 할 정확한 기준선을 담당한다. plan.md §마일스톤은 REQ 그룹 A~H를 실행 순서로 분해한다. acceptance.md는 REQ-001~024 각각에 대한 검증 가능한 Given-When-Then 시나리오를 제공한다.

## §5. Out of Scope

### Out of Scope — 신규 기능

- 신규 DB 스키마 변경 또는 마이그레이션
- 신규 API 엔드포인트 또는 기존 엔드포인트의 요청/응답 스키마 변경
- AI Researcher/Skeptic/Verifier 파이프라인 로직 변경
- 근거자료(evidence) 검색/랭킹 로직 변경
- 사건 목록/보관함 페이지(case-list) 신규 구현 — "리서치 리포트" nav는 REQ-006의 결정론적 규칙(최근 사건 단순 조회)만 사용하며 별도 목록 페이지를 만들지 않는다
- 초안 저장(draft-save) 기능(REQ-018에서 명시적으로 생략)
- "분석 상태"/"최근 리서치" 진행률 추적 인프라(REQ-011에서 명시적으로 생략)

### Out of Scope — 인증 및 다른 라우트

- `app/page.tsx`(홈), `app/login/`(인증) 라우트의 시각적 변경
- 인증/인가 로직 변경
- 관리자 대시보드

### Out of Scope — 반응형 및 플랫폼

- 모바일 전용 반응형 재설계(REQ-022에서 데스크톱 우선으로 명시)
- 네이티브 모바일 앱
- 프로덕션 배포 파이프라인 변경

### Out of Scope — 도구/라이브러리 도입

- 대형 신규 UI 프레임워크(shadcn/Tailwind 외) 도입
- 애니메이션 전용 라이브러리(Framer Motion 등) 도입 — CSS `transition`으로 충분한 범위 내에서만 모션 적용(moai-ref-ui-polish 참고)
- `@base-ui/react` 대체(기존 프리미티브 라이브러리 유지)

### Out of Scope — 데이터

- Gold Dataset 관련 작업
- 통계/집계 데이터 수집 로직 변경(SPEC-FEEDBACK-001 범위)
