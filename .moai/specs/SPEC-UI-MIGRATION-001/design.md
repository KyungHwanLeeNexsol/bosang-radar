# SPEC-UI-MIGRATION-001 — design.md

Tier L design artifact. Source of truth for the confirmed Pencil design (`design/claimradar-ui.pen`) deltas beyond SPEC-PILOT-VISUAL-001's already-implemented 3-screen scope. Read alongside spec.md §2 (REQ table references this file by section) and research.md (current-implementation baseline).

## §1. 디자인 토큰 감사 (delta only)

이 SPEC은 SPEC-PILOT-VISUAL-001의 design.md §1이 이미 `app/globals.css`에 추가한 전체 토큰 세트(bg/surface/line/ink/accent/ok/warn/danger/sidebar/bora-* 계열, `--color-bora-*`/`--color-app-*` 네임스페이스)를 그대로 재사용한다(REQ-001). Pencil MCP `GetVariables()` 재조사 결과, 이 SPEC이 다루는 화면(로그인/사이드바 신규 항목/Topbar 브레드크럼/공통 예외/반응형)이 요구하는 색상·타이포그래피 값은 모두 기존 세트에 이미 존재한다 — 신규 토큰 추가는 불필요한 것으로 확인되었다:

| 필요 값 | 기존 토큰 매핑 |
|---|---|
| 로그인 브랜드 패널 배경 | `--color-app-sidebar`(다크) 또는 `--color-bora-700`(그라디언트 딥 톤) |
| "준비 중" Chip 배경/텍스트 | `--color-app-surface-inset` + `--color-bora-ink-3`(기존 Chip/Tag 컴포넌트 스펙 재사용) |
| 공통 예외 화면 아이콘/텍스트 톤 | `--color-bora-ink-3`(설명) / `--color-bora-danger` 또는 `--color-bora-warn`(변형별 강조) |
| 모바일 드로어 스크림 | 반투명 오버레이(예: `rgb(0 0 0 / 0.5)`) — Pencil 토큰 목록에 명시적 스크림 변수 없음, 표준 다크 오버레이 관례 적용 |

새 토큰이 실제로 필요한 값이 run-phase에서 발견될 경우, 기존 `--color-bora-*`/`--color-app-*` 네임스페이스 규칙을 따라 최소 추가한다(REQ-001, `[Where]` 절 참고).

## §2. 로그인 화면 폰트 격리 (design decision)

신규 `app/login/layout.tsx`는 `app/cases/layout.tsx`가 확립한 패턴(REQ-002/003 결정)을 그대로 복제한다: `next/font/local`(Pretendard, `pretendard` npm 패키지)로 본문 폰트를, 필요 시 `next/font/google`(Manrope 800)로 BORA 워드마크 텍스트를 로드하며, 두 레이아웃은 서로 다른 라우트 세그먼트(`app/cases/**` vs `app/login/**`)만 감싸는 형제 관계다. `app/layout.tsx`는 두 레이아웃 어느 쪽으로부터도 수정되지 않는다.

## §3. 재사용/신규 프레젠테이션 컴포넌트

| 컴포넌트 | 재사용 여부 | 매핑 대상 |
|----------|------|-----------|
| Badge/Status, Chip/Tag, Notice, Button/Primary·Secondary, Field/Input | 완전 재사용(SPEC-PILOT-VISUAL-001 §3에서 이미 구현) | 로그인 폼 필드, 신규 nav 항목 Chip, 예외 화면 액션 버튼 |
| Nav Item(비활성 variant) | 완전 재사용 — SPEC-PILOT-VISUAL-001 §3이 이미 disabled 상태(`aria-disabled="true"` + opacity dimming, `href` 없음)를 스펙화함 | 신규 사이드바 2항목(REQ-004) |
| App Topbar(브레드크럼 확장) | 기존 컴포넌트 확장(신규 컴포넌트 아님) — 좌측 브레드크럼 텍스트(11/500 `ink-4`) + 타이틀(15/600 `ink`) 슬롯 추가 | REQ-006 |
| Empty State | 신규 필요 — 아이콘 + 타이틀(H3) + 설명(Body S) + 선택적 Action 버튼 조합, Pencil "Empty State" 카탈로그 항목 재현 | 공통 예외 화면 6종(REQ-015), "최근 리서치" 0건 Edge Case |
| Icon Button | 신규 필요 — 정사각 hit area(최소 40×40), 아이콘 단독 | 모바일 탑바 햄버거 아이콘(REQ-017) |
| Progress Step | 신규 필요 — 순번 마커 + 라벨 텍스트, 정적 목록(체크마크/진행 상태 없음) | "분석 상태" 4단계(REQ-012) — 반드시 정적으로만 사용, 동적 상태 전환 금지 |
| Skeleton Line | 미사용(이 SPEC 범위 없음) | — |
| Toast, User Menu, Accordion Header, Segmented Option | 이 SPEC 범위 밖 — Pencil 카탈로그에 존재하나 대응 화면 없음 | Out of Scope |

## §4. 화면별 구조 매핑

### 로그인 화면 (REQ-002~003)

Pencil "03 · 테스터 로그인" 프레임: 좌측 폼 컬럼(업무용 이메일 필드, 비밀번호 필드+표시/숨김 토글, "로그인" Primary 버튼, 푸터 링크 3종, "랜딩으로 돌아가기" 링크) + 우측 브랜드 패널(다크 배경, 헤드라인 + feature bullets + compliance note). 반응형 시 브랜드 패널은 태블릿 이하에서 생략 가능(REQ-016/017의 일반 원칙 적용, Pencil이 로그인 화면 전용 반응형 규칙을 별도로 정의하지 않으므로 프레임 `12`/`13`의 일반 원칙 준용).

### App Shell 확장 (REQ-004~006)

`03b 로그인 상태` 프레임과 별개로, App Sidebar 컴포넌트(SPEC-PILOT-VISUAL-001 §3)에 2개 nav 항목을 추가: "리포트 보관함"(아이콘: 문서함류), "판례·약관 자료실"(아이콘: 서재/북류) — 둘 다 disabled variant, "준비 중" Chip 부착. App Topbar 좌측에 브레드크럼 슬롯("WORKSPACE / <현재 화면명>") 추가.

### 공통 예외 화면 (REQ-015)

Pencil 프레임 `11`, App Shell 안에서 중앙 정렬: 아이콘(변형별 상이) → 타이틀(H2) → 설명(Body) → `{context} · {ERROR_CODE}` 메타 텍스트(Meta 스타일) → Action 버튼(재시도/돌아가기 등, 변형별 상이). 6개 변형과 각 ERROR_CODE 패턴 예시:

| 변형 | 타이틀 | ERROR_CODE 예시 |
|------|--------|------------------|
| 404 | 페이지를 찾을 수 없습니다 | `ERR_NOT_FOUND` |
| 권한없음 | 접근 권한이 없습니다 | `ERR_FORBIDDEN` |
| 세션만료 | 세션이 만료되었습니다 | `ERR_SESSION_EXPIRED` |
| 일시오류 | 일시적인 오류가 발생했습니다 | `ERR_TRANSIENT` |
| 네트워크불가 | 네트워크에 연결할 수 없습니다 | `ERR_NETWORK` |
| 준비중 | 준비 중인 기능입니다 | `ERR_COMING_SOON` |

기존 `error.tsx`(`ERR_CASE_NOT_FOUND` 패턴, "CASE-2024-0999" 형식의 context 접두사)는 404/사건 없음 변형에 대응하며, 공유 컴포넌트로 리팩터링 후 이 표의 나머지 5종이 동일 컴포넌트를 재사용한다.

### 반응형 (REQ-016~018)

Pencil 프레임 `12`(1024px, "RULE · 사이드바 유지 · 우측 레일은 본문 아래로 이동") + 프레임 `13`(390px, 오프캔버스 드로어 + 스크림). 1280px는 별도 Pencil 프레임 없이 SPEC-PILOT-VISUAL-001의 기존 "비붕괴 확인" 방법론(수동 검증, `min-width` 방향 유지)을 그대로 적용한다.

## §5. 결정 사항 요약 (Locked Decisions)

| 결정 | 확정 내용 | 근거 REQ |
|------|-----------|----------|
| 로그인 폰트 격리 | `app/login/layout.tsx` 신규(형제 레이아웃), `app/layout.tsx` zero-diff | REQ-002, REQ-003 |
| Claim 카드 "추가 확인 필요" 데이터 소스 | 신규 AI 필드 없음, 기존 `missingMaterials`/`uncertainty` 파생·연결 | REQ-011 |
| 사이드바 신규 2항목 | 영구 비활성, href 없음, 실제 페이지 미구현 | REQ-004, REQ-021 |
| "최근 리서치" | 신규 read-only 조회 함수, `getCaseForOwner` 동일 신뢰 경계 | REQ-013 |
| 공통 예외 화면 | 기존 `error.tsx` 일반화(공유 컴포넌트 추출), 6종 변형 | REQ-015 |
| 반응형 구현 방식 | Tailwind CSS 유틸리티만, 별도 라이브러리 없음 | REQ-016, REQ-017 |
| 디자인 토큰 | 기존 `--color-bora-*`/`--color-app-*` 네임스페이스 재사용, 신규 추가는 최소 | REQ-001 |

## §6. Cross-references

- spec.md §2 REQ-001~024 — 이 문서가 뒷받침하는 요구사항 전체
- research.md §현재 구현 사실 — 이 문서의 매핑 대상이 되는 기존 코드 구조
- plan.md §마일스톤 — 이 문서의 §2(로그인)→§3(신규 컴포넌트)→§4(화면별) 순서를 실행 계획으로 전환
- acceptance.md §시각 스모크 체크리스트 — 이 문서의 화면별 구조를 검증 기준으로 전환
- SPEC-PILOT-VISUAL-001/design.md — §1(토큰 전체 목록)·§3(App Shell/공유 컴포넌트 원 스펙)의 상위 참조 문서, 이 SPEC은 그 내용을 수정하지 않고 확장만 한다
