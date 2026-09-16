---
id: SPEC-SIDEBAR-NAV-001
title: "사이드바 '전문가 피드백' 메뉴 재검토 — 인페이지 앵커 시각적 구분"
version: "0.1.0"
status: in-progress
created: 2026-09-16
updated: 2026-09-16
author: Nexsol
priority: P3
phase: "v0.4.0 target"
module: "app/cases/case-shell-nav.tsx"
lifecycle: spec-anchored
tags: "ui, sidebar, navigation, accessibility, ux-review"
tier: M
depends_on: [SPEC-PILOT-VISUAL-001, SPEC-UI-MIGRATION-001]
---

## HISTORY

- 2026-09-16: 최초 작성 (manager-spec) — 백로그 항목(`.moai/state/kanban/backlog.json` id `t2`, 2026-09-16T02:20:00+09:00 등록)에 대응해 사이드바 "전문가 피드백" nav 항목을 재조사했다. `app/cases/case-shell-nav.tsx` 직접 확인 결과 이 항목은 별도 화면이 아니라 `/cases/[caseId]#expert-feedback` 인페이지 앵커-스크롤일 뿐이며(SPEC-PILOT-VISUAL-001 REQ-006, SPEC-UI-MIGRATION-001 REQ-006이 이미 확정한 사실 — Topbar 타이틀이 프래그먼트 유무와 무관하게 "리서치 리포트"로 고정됨), "사건 입력"/"리서치 리포트" 두 실제 페이지 이동 항목과 아이콘·스타일·레이아웃이 완전히 동일하게 렌더링됨을 확인했다. 추가로 `NavLink` 컴포넌트(`case-shell-nav.tsx` 133-163행)에 `active` prop이 이 항목에는 전혀 전달되지 않아(다른 두 실 항목과 달리) 사용자가 그 섹션을 스크롤해 보고 있는 동안에도 활성 강조가 되지 않는 기존 불일치도 함께 확인했다. `feedback-form.tsx`(29-43행)를 조사한 결과 그 섹션은 5개 번호 매김 폼 섹션 + 우측 레일을 가진 상당한 규모의 기능이며, 같은 파일 Round5 HISTORY에서 이미 "전용 Topbar 미도입 — 기존 앵커 구조(REQ-006) 유지"를 사용자 승인 하에 확정한 전례가 있다. 이를 근거로 사이드바 제거나 리포트 내부 탭 이동 대신, 기존 위치는 유지하되 아이콘을 인페이지 이동을 암시하는 형태(`CornerDownRight`, 이미 설치된 `lucide-react`에 존재 확인)로 교체하고 `aria-label`로 명시하는 최소-변경 방향을 채택했다.

## §1. 개요 (Overview)

### WHY — 배경 및 동기

사이드바의 "전문가 피드백" 항목은 코드상 별도 라우트가 아니라 `/cases/[caseId]` 리서치 리포트 페이지 내부의 한 섹션(`id="expert-feedback"`)으로 스크롤 이동하는 인페이지 앵커 링크다(`case-shell-nav.tsx:77`, `app/cases/[caseId]/page.tsx:647`). 그러나 사이드바 렌더링 결과물만 보면 "사건 입력"/"리서치 리포트"와 아이콘 크기·스타일·hover/active 클래스가 완전히 동일해, 사용자가 이를 별도 화면으로 오인할 소지가 있다(백로그 t2). 또한 `NavLink`는 이 항목에만 `active` prop을 전달받지 않아, 사용자가 실제로 그 섹션을 보고 있는 동안에도 사이드바가 그 사실을 반영하지 못하는 기존 불일치가 존재한다.

### WHAT — 이번 SPEC 범위

1. "전문가 피드백" nav 항목의 아이콘을 페이지형 아이콘(`MessageSquare`)에서 인페이지 이동을 암시하는 아이콘(`CornerDownRight`)으로 교체 — 신규 의존성 없음(기존 설치된 `lucide-react`에 존재 확인)
2. "전문가 피드백" 링크가 활성 렌더링될 때 `aria-label`을 추가해, 스크린 리더 사용자에게도 이 링크가 새 페이지가 아닌 현재 페이지 내 이동임을 명시
3. `href` 계산 로직·실제 이동 대상·모바일 드로어 닫힘(`onNavigate`) 등 기존 기능적 동작은 완전히 보존
4. "사건 입력"/"리서치 리포트" 두 실 항목과 "리포트 보관함"/"판례·약관 자료실" 두 비활성 항목은 이 SPEC에서 변경하지 않음

### 핵심 판단 근거 — Tier M

영향 범위는 `app/cases/case-shell-nav.tsx`(아이콘 교체 + `aria-label` 추가, 약 5-10 LOC diff)와 그 테스트 파일 `case-shell-nav.test.tsx`(신규 assertion 추가)로 한정되며, 2개 파일·수 LOC 규모의 순수 프레젠테이션 변경이다. Tier S 기준(< 5 files, < 300 LOC)에 부합하는 규모이나, 사이드바 nav 항목의 시각적 정체성을 다루는 UX 결정(제거/이동/구분 3가지 대안을 비교·기각한 근거를 명시적으로 남길 필요)이 있어 별도 `acceptance.md`로 검증 시나리오를 분리하는 편이 검토 가능성을 높인다고 판단해 Tier M(3개 아티팩트)으로 분류한다.

## §2. 요구사항 (Requirements — GEARS 표기법)

### A. 시각적 구분 (아이콘)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-001 | Ubiquitous | 사이드바의 "전문가 피드백" nav 항목은 렌더링될 때 현재 사용 중인 `MessageSquare` 아이콘 대신, 인페이지 이동(스크롤)을 암시하는 `CornerDownRight` 아이콘(lucide-react, 이미 설치된 패키지 — 버전 변경 없음)을 사용해야 한다. | `case-shell-nav.tsx:6,52` 직접 확인(현재 `MessageSquare` import·사용), `node_modules/lucide-react/dist/esm/icons/corner-down-right.mjs` 존재 확인(신규 의존성 없음) |
| REQ-002 | Unwanted | 이 SPEC의 아이콘 변경은 "사건 입력"(`CircleHelp`)과 "리서치 리포트"(`FileText`) 두 실 항목의 아이콘, 또는 `ComingSoonNavLink` 2항목("리포트 보관함"/"판례·약관 자료실")의 아이콘·Chip·비활성 렌더링 로직에 어떤 변경도 발생시켜서는 안 된다. | `case-shell-nav.tsx:49-53` `navIcon` 객체(3개 키가 독립적으로 정의됨) 직접 확인; CLAUDE.md §7 Rule 2(스코프 규율) |

### B. 접근성 라벨

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-003 | While | While `currentCaseId`가 존재해 "전문가 피드백" 링크가 활성(`<Link>`)으로 렌더링될 때, 그 요소는 시각 라벨("전문가 피드백")과 별개로 이 링크가 현재 페이지 내 스크롤 이동임을 명시하는 `aria-label`(예: `"전문가 피드백 섹션으로 이동 (현재 페이지 내)"`)을 가져야 한다. | `case-shell-nav.tsx` `NavLink`(133-163행) 현재 `aria-label` 미보유 확인; SPEC-UI-MIGRATION-001 REQ-023(기존 접근성 속성 보존·확장 원칙) 계승 |
| REQ-004 | Unwanted | `currentCaseId`가 없어 "전문가 피드백" 항목이 `aria-disabled="true"`인 비활성 `<span>`으로 렌더링되는 분기(`case-shell-nav.tsx:82-84`, `disabled` 렌더링 경로 137-147행)에는 REQ-003이 신설하는 `aria-label`을 추가하지 않는다 — 이 SPEC은 활성 링크 분기만을 대상으로 한다. | `case-shell-nav.tsx:75-84,137-147` 직접 확인 |

### C. 기능·동작 보존

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-005 | Unwanted | 이 SPEC의 구현은 "전문가 피드백" 링크의 `href` 계산 로직(`resolveCurrentCaseId`, `currentCaseId ? ... : ...` 분기), 실제 이동 대상(`/cases/${currentCaseId}#expert-feedback`), `onNavigate` 콜백(모바일 드로어 닫힘) 동작을 어떤 방식으로도 변경해서는 안 된다. | `case-shell-nav.tsx:75-84` 직접 확인; `app-shell-chrome.test.tsx:317-328`("전문가 피드백 링크 클릭 시에도 드로어가 닫힌다") 보존 대상 확인 |
| REQ-006 | Unwanted | 이 SPEC은 URL 해시(`#expert-feedback`)에 기반해 "전문가 피드백" nav 항목을 `active` 상태로 표시하는 신규 로직(예: `window.location.hash` 감지, `IntersectionObserver`)을 도입하지 않는다. | `usePathname()`이 URL 프래그먼트를 포함하지 않는다는 기존 제약(`case-shell-topbar.test.tsx:8` 주석 직접 확인) — §5 Out of Scope 참고 |

### D. 테스트 계약

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-007 | When | When 이 SPEC의 구현 완료 후 `pnpm test`가 실행되면, 종료 코드는 0이어야 하며 `app/cases/case-shell-nav.test.tsx`의 기존 5개 테스트("AC-004: 정확히 5개 항목이 렌더링된다" 등)와 이 SPEC이 신설하는 신규 테스트(아이콘·`aria-label` 검증)가 모두 통과해야 한다. | Definition of Done; `case-shell-nav.test.tsx` 전체(94행) 직접 확인 |

## §3. 보존·신규 테스트 계약

### 보존 대상 (이름·의미 변경 금지)

- `case-shell-nav.test.tsx`의 기존 5개 `it(...)` 케이스 전부(AC-004 5항목 렌더링, 신규 2항목 비활성 렌더링, "/cases/new"·"/cases/case-1" pathname 전용 링크 규칙 회귀 없음, D1 svg 아이콘 보유)
- `app-shell-chrome.test.tsx:317-328`의 "전문가 피드백(같은 페이지 #expert-feedback 앵커) 링크 클릭 시에도 드로어가 닫힌다" 케이스
- `case-shell-topbar.test.tsx`가 검증하는 Topbar 타이틀 고정 동작(REQ-006, SPEC-UI-MIGRATION-001 소유 — 이 SPEC은 건드리지 않음)

### 이 SPEC이 신규로 도입하는 테스트

- "전문가 피드백" 링크가 `CornerDownRight` svg를 포함하고 `MessageSquare`를 포함하지 않는지 확인하는 단위 테스트
- "전문가 피드백" 활성 링크(`currentCaseId` 존재 시)가 REQ-003이 정의하는 `aria-label`을 가지는지 확인하는 단위 테스트
- "전문가 피드백" 비활성 `<span>`(`currentCaseId` 부재 시)에는 그 `aria-label`이 존재하지 않는지 확인하는 단위 테스트(REQ-004)

## §4. 요구사항 교차 참조

plan.md §마일스톤은 REQ 그룹 A~D를 실행 순서로 분해한다. acceptance.md는 REQ-001~007 각각에 대한 검증 가능한 Given-When-Then 시나리오를 제공한다.

## §5. Out of Scope

### Out of Scope — 사이드바 제거 또는 리포트 내부 이동

- "전문가 피드백"을 사이드바에서 제거하거나 리포트 내부 탭/링크로 이동하는 방안은 검토했으나 채택하지 않는다 — `feedback-form.tsx`(1-60행 직접 확인)가 5개 번호 매김 섹션 + 우측 레일(Notice/작성 진행률/제출 상태)을 가진 상당한 규모의 기능이라, 사이드바를 통한 지속적 접근성(discoverability)을 유지하는 편이 바람직하다고 판단했다.

### Out of Scope — Hash 기반 Active State 추적

- URL 해시 감지를 통한 "전문가 피드백" 항목의 active 강조 표시는 이 SPEC 범위 밖이다(REQ-006). `usePathname()`이 URL 프래그먼트를 포함하지 않는 기존 제약과 신규 클라이언트 로직(해시 리스너 또는 `IntersectionObserver`) 도입 비용을 고려해, 필요 시 별도 SPEC으로 분리한다.

### Out of Scope — 다른 nav 항목 변경

- "사건 입력"/"리서치 리포트" 두 실 항목과 "리포트 보관함"/"판례·약관 자료실" 두 비활성 항목의 아이콘·라벨·동작은 이 SPEC에서 변경하지 않는다.

### Out of Scope — 전용 Topbar/브레드크럼 재도입

- `feedback-form.tsx` Round5 HISTORY(32-35행)에서 이미 검토·기각된 "전용 Topbar/뒤로가기 도입"(REQ-006 유지 결정)을 재론하지 않는다.
