# SPEC-UI-MIGRATION-001 — design.md

Tier L design artifact. Source of truth for the confirmed Pencil design (`design/claimradar-ui.pen`) deltas beyond SPEC-PILOT-VISUAL-001's already-implemented 3-screen scope. Read alongside spec.md §2 (REQ table references this file by section) and research.md (current-implementation baseline).

> **개정 안내**: §4의 "공통 예외 화면" 절이 research.md §7의 정정된 baseline(외부 독립 리뷰 대응, 2026-09-03)에 맞춰 6종 카탈로그 나열에서 3개 실재 화면으로 전면 재작성되었다. §5의 로그인/세션 결정 요약도 갱신되었다.
>
> **개정 안내(2차, 2026-09-03)**: 제2차 외부 독립 리뷰 대응으로 §4의 App Shell 확장 절에 정확한 Topbar 라우트→브레드크럼/타이틀 매핑 표와 `#expert-feedback` 인페이지 앵커 명시를 추가했고, §5의 "최근 리서치"·"모바일 드로어 접근성" 행을 갱신했으며 "App Topbar 매핑" 행을 신설했다.

## §1. 디자인 토큰 감사 (delta only)

이 SPEC은 SPEC-PILOT-VISUAL-001의 design.md §1이 이미 `app/globals.css`에 추가한 전체 토큰 세트(bg/surface/line/ink/accent/ok/warn/danger/sidebar/bora-* 계열, `--color-bora-*`/`--color-app-*` 네임스페이스)를 그대로 재사용한다(REQ-001). Pencil MCP `GetVariables()` 재조사 결과, 이 SPEC이 다루는 화면(로그인/사이드바 신규 항목/Topbar 브레드크럼/실재하는 3개 예외 화면/반응형)이 요구하는 색상·타이포그래피 값은 모두 기존 세트에 이미 존재한다 — 신규 토큰 추가는 불필요한 것으로 확인되었다:

| 필요 값 | 기존 토큰 매핑 |
|---|---|
| 로그인 브랜드 패널 배경 | `--color-app-sidebar`(다크) 또는 `--color-bora-700`(그라디언트 딥 톤) |
| "준비 중" Chip 배경/텍스트 | `--color-app-surface-inset` + `--color-bora-ink-3`(기존 Chip/Tag 컴포넌트 스펙 재사용) |
| 예외 화면 아이콘/텍스트 톤 | `--color-bora-ink-3`(설명) / `--color-bora-danger` 또는 `--color-bora-warn`(변형별 강조) |
| 모바일 드로어 스크림 | 반투명 오버레이(예: `rgb(0 0 0 / 0.5)`) — Pencil 토큰 목록에 명시적 스크림 변수 없음, 표준 다크 오버레이 관례 적용 |

새 토큰이 실제로 필요한 값이 run-phase에서 발견될 경우, 기존 `--color-bora-*`/`--color-app-*` 네임스페이스 규칙을 따라 최소 추가한다(REQ-001, `[Where]` 절 참고).

## §2. 로그인 화면 폰트 격리 + 기능 확장 (design decision)

신규 `app/login/layout.tsx`는 `app/cases/layout.tsx`가 확립한 패턴(REQ-002/003 결정)을 그대로 복제한다: `next/font/local`(Pretendard, `pretendard` npm 패키지)로 본문 폰트를, 필요 시 `next/font/google`(Manrope 800)로 BORA 워드마크 텍스트를 로드하며, 두 레이아웃은 서로 다른 라우트 세그먼트(`app/cases/**` vs `app/login/**`)만 감싸는 형제 관계다. `app/layout.tsx`는 두 레이아웃 어느 쪽으로부터도 수정되지 않는다.

`login-form.tsx`에 추가되는 두 가지 신규 기능(REQ-002, research.md §6 확인 근거):

- **비밀번호 표시/숨김 토글**: `type` state(`"password"` | `"text"`)를 추가하고, 토글 버튼(`data-testid="login-password-toggle"`, `aria-label="비밀번호 표시"`/`"비밀번호 숨기기"` — 현재 상태에 따라 전환)이 `<input>`의 `type` 속성을 전환한다. 제출되는 폼 값에는 영향을 주지 않는다(입력값 자체는 변경되지 않고 표시 방식만 바뀜).
- **푸터 링크 3종**: research.md §6 확인 결과 이용약관/개인정보처리방침/고객지원에 대응하는 실제 라우트가 존재하지 않는다. 3개 링크는 `href` 없는 비활성 텍스트(`aria-disabled="true"`, 사이드바 비활성 nav 항목과 동일한 시각 관례 — 흐림 처리 + 클릭 불가)로 렌더링하고, "랜딩으로 돌아가기"(`/`)만 실제 활성 링크로 구현한다. 실제 정책 페이지 구현은 후속 SPEC으로 명시적으로 미룬다.

## §3. 재사용/신규 프레젠테이션 컴포넌트

| 컴포넌트 | 재사용 여부 | 매핑 대상 |
|----------|------|-----------|
| Badge/Status, Chip/Tag, Notice, Button/Primary·Secondary, Field/Input | 완전 재사용(SPEC-PILOT-VISUAL-001 §3에서 이미 구현) | 로그인 폼 필드, 신규 nav 항목 Chip, 예외 화면 액션 버튼 |
| Nav Item(비활성 variant) | 완전 재사용 — SPEC-PILOT-VISUAL-001 §3이 이미 disabled 상태(`aria-disabled="true"` + opacity dimming, `href` 없음)를 스펙화함 | 신규 사이드바 2항목(REQ-004), 로그인 푸터 비활성 링크 3종(REQ-002) |
| App Topbar(브레드크럼 확장) | 기존 컴포넌트 확장(신규 컴포넌트 아님) — 좌측 브레드크럼 텍스트(11/500 `ink-4`) + 타이틀(15/600 `ink`) 슬롯 추가 | REQ-006 |
| Empty State | 신규 필요 — 아이콘 + 타이틀(H2) + 설명(Body) + 선택적 Action 버튼 조합, Pencil "Empty State" 카탈로그 항목을 **실재하는 2개 화면**(전역 404, 사건-없음/미소유 통합)에만 재현 | 신규 `app/not-found.tsx` + `app/cases/[caseId]/not-found.tsx`(REQ-015) — `error.tsx`는 대상 아님(§4 참고) |
| Icon Button | 신규 필요 — 정사각 hit area(최소 40×40), 아이콘 단독. 열림/닫힘 두 개의 명확히 구분되는 아이콘 상태(햄버거 ↔ 닫기)를 가진다 | 모바일 탑바 햄버거 버튼 + 드로어 내부 닫기 버튼(REQ-017) |
| Progress Step | 신규 필요 — 순번 마커 + 라벨 텍스트, 정적 목록(체크마크/진행 상태 없음) | "분석 상태" 4단계(REQ-012) — 반드시 정적으로만 사용, 동적 상태 전환 금지 |
| Skeleton Line | 미사용(이 SPEC 범위 없음) | — |
| Toast, User Menu, Accordion Header, Segmented Option | 이 SPEC 범위 밖 — Pencil 카탈로그에 존재하나 대응 화면 없음 | Out of Scope |

## §4. 화면별 구조 매핑

### 로그인 화면 (REQ-002~003)

Pencil "03 · 테스터 로그인" 프레임: 좌측 폼 컬럼(업무용 이메일 필드, 비밀번호 필드+표시/숨김 토글, "로그인" Primary 버튼, 푸터 링크 3종(비활성), "랜딩으로 돌아가기" 링크(활성)) + 우측 브랜드 패널(다크 배경, 헤드라인 + feature bullets + compliance note). 반응형 시 브랜드 패널은 태블릿 이하에서 생략 가능(REQ-016/017의 일반 원칙 적용, Pencil이 로그인 화면 전용 반응형 규칙을 별도로 정의하지 않으므로 프레임 `12`/`13`의 일반 원칙 준용).

### App Shell 확장 (REQ-004~006)

`03b 로그인 상태` 프레임과 별개로, App Sidebar 컴포넌트(SPEC-PILOT-VISUAL-001 §3)에 2개 nav 항목을 추가: "리포트 보관함"(아이콘: 문서함류), "판례·약관 자료실"(아이콘: 서재/북류) — 둘 다 disabled variant, "준비 중" Chip 부착. App Topbar 좌측에 브레드크럼 슬롯("작업 공간 / <현재 화면명>") 추가하며, 정확한 라우트→매핑은 다음과 같다(REQ-006, 모호한 "3개 화면 각각 동적 타이틀" 서술을 대체). [Round3: WORKSPACE → 작업 공간으로 용어 통일 — case-shell-topbar.tsx 실제 구현 정합]

| 라우트 | 브레드크럼 | 타이틀 |
|---|---|---|
| `/cases/new` | "작업 공간 / 사건 입력" | "신규 사건 리서치 요청" |
| `/cases/[caseId]` | "작업 공간 / 리서치 리포트" | "리서치 리포트" |
| `/cases/[caseId]#expert-feedback` | (위와 동일 — 변경 없음) | (위와 동일 — 변경 없음) |

`#expert-feedback`은 `/cases/[caseId]` 페이지 내부의 인페이지 앵커일 뿐 별도 라우트/화면이 아니다 — 사이드바 "전문가 피드백" nav 항목은 이 페이지 내부 섹션(`id="expert-feedback"`)으로의 앵커-스크롤일 뿐이며, Topbar 브레드크럼/타이틀은 URL 프래그먼트 존재 여부와 무관하게 "리서치 리포트"로 고정된다.

사이드바 하단 사용자 블록은 `app/cases/layout.tsx`(서버 컴포넌트)가 직접 렌더링하지 않고, 신규 클라이언트 컴포넌트(`sidebar-user-block.tsx`, 파일명/위치는 run-phase 재량)로 분리한다(REQ-005, research.md §5b 근거). 이 컴포넌트는 Better Auth 클라이언트의 세션 훅을 사용해 `user.name`을 표시하며, 로딩 중이거나 세션이 없는 순간에는 중립적인 폴백(예: 이니셜 원형 + "사용자" 텍스트, 하드코딩된 가짜 이름 아님)을 렌더링한다. 이와는 별개로 `/cases/new`의 "최근 리서치" 패널(REQ-013)이 필요로 하는 `ownerUserId`는 `NewCasePage`(서버 페이지 컴포넌트) 자신의 서버측 세션 확인에서 조달되며, 그 결과로 `/cases/new`는 동적 렌더링으로 전환된다(research.md §5c) — 사이드바 사용자 블록의 클라이언트 분리 결정과는 별개의 결정이다.

### 실재하는 예외 화면 3종 (REQ-015 — research.md §7 정정 반영)

Pencil 프레임 `11`은 6개 변형(404/권한없음/세션만료/일시오류/네트워크불가/준비중)을 카탈로그로 정의하지만, 이 SPEC은 이 코드베이스에 실제로 존재하는 진입 경로 3개에만 그 시각 언어(아이콘 → 타이틀(H2) → 설명(Body) → `{context} · {ERROR_CODE}` 메타 텍스트(Meta 스타일) → Action 버튼)를 적용한다:

| 실재 화면 | 파일 | Pencil 대응 변형 | 타이틀 | ERROR_CODE 예시 | App Shell |
|---|---|---|---|---|---|
| 전역 404 | `app/not-found.tsx`(신규) | 404 | 페이지를 찾을 수 없습니다 | `ERR_NOT_FOUND` | 아님(루트 레이아웃만, research.md §7c) |
| 사건-없음/미소유(통합) | `app/cases/[caseId]/not-found.tsx`(신규) | 404 + 권한없음(정보 은닉으로 단일화) | 사건을 찾을 수 없습니다 | `ERR_CASE_NOT_FOUND` | 적용됨(레이아웃 자동 중첩) |
| 일시 런타임 오류 | `app/cases/[caseId]/error.tsx`(기존, 최소 검증만) | 일시오류 | 문제가 발생했습니다(기존 문구 유지) | (기존에 코드 텍스트 없음, 추가하지 않음) | 적용됨(기존과 동일) |

`error.tsx`는 이미 SPEC-PILOT-VISUAL-001 M6에서 App Shell 토큰으로 재스타일되어 있으며(research.md §7a), 이 SPEC은 이를 리팩터링·일반화하지 않는다 — `case-error-retry` testid와 `reset()` 호출 계약을 그대로 보존하는지 검증만 한다.

Pencil이 정의하는 나머지 3개 변형(권한없음/세션만료/네트워크불가)과 "준비중" 변형은 각각 다음 사유로 이 SPEC에서 독립 화면으로 구현하지 않는다(research.md §7d, spec.md §5 Out of Scope):

- **권한없음**: `getCaseForOwner`의 정보 은닉 설계(존재-없음=소유권-없음, research.md §4/§7c)를 존중해 사건-없음 화면에 통합한다. 별도 403을 만들면 오히려 "존재는 함" 정보를 노출한다.
- **세션만료**: 기존 `redirect("/login")` 동작을 그대로 유지한다(신규 세션-만료 감지 로직 없음, REQ-019 무변경 원칙).
- **네트워크불가**: `case-input-form.tsx`/`feedback-form.tsx`의 기존 인라인 오류 문구를 그대로 재사용한다(독립 페이지 아님).
- **준비중**: REQ-004의 사이드바 비활성 nav Chip이 이미 이 개념을 커버한다.

### 반응형 (REQ-016~018)

Pencil 프레임 `12`(1024px, "RULE · 사이드바 유지 · 우측 레일은 본문 아래로 이동") + 프레임 `13`(390px, 오프캔버스 드로어 + 스크림 + 접근성 계약 — §4a 참고). 1280px는 별도 Pencil 프레임 없이 SPEC-PILOT-VISUAL-001의 기존 "비붕괴 확인" 방법론(수동 검증, `min-width` 방향 유지)을 그대로 적용한다.

### §4a. 모바일 드로어 접근성 계약 (REQ-017)

프레임 `13`의 오프캔버스 드로어 + 스크림 규칙에, 표준 드로어 접근성 요구사항을 추가한다(research.md §10 자원 조사 근거):

- 열기: 탑바 햄버거 버튼(`data-testid="mobile-nav-toggle"`, `aria-label="메뉴 열기"`)
- 드로어: `data-testid="mobile-nav-drawer"`. 명확히 구분되는 닫기 버튼(`aria-label="메뉴 닫기"`)을 내부에 별도로 둔다.
- 스크림: `data-testid="mobile-nav-scrim"`. 클릭 시 드로어를 닫는다.
- ESC 키 입력 시 드로어를 닫는다.
- 드로어가 열리면 포커스가 드로어 내부(첫 포커스 가능 요소 또는 드로어 컨테이너)로 이동하고, 닫히면 햄버거 버튼으로 복귀한다.
- 드로어가 열려 있는 동안 배경(`<body>` 또는 스크롤 컨테이너) 스크롤을 잠근다.
- 드로어가 닫혀 있는 동안 드로어 내부 링크/버튼은 tab 순서에서 제외된다(예: `inert` 속성 또는 조건부 렌더링).
- 뷰포트가 1024px 이상으로 리사이즈되면 드로어/스크림 상태가 자동으로 초기화되어 데스크톱 사이드바로 정상 전환된다(고정 열림 상태로 남지 않음).

네이티브 React state + 표준 DOM 이벤트 조합으로 구현 가능하며, 신규 대형 의존성 도입은 불필요하다고 판단한다(research.md §10). 이미 설치된 `@base-ui/react`의 Dialog 계열 서브패스가 run-phase에 확인되면 우선 재사용을 검토한다(잔여 위험, research.md §10).

## §5. 결정 사항 요약 (Locked Decisions)

| 결정 | 확정 내용 | 근거 REQ |
|------|-----------|----------|
| 로그인 폰트 격리 | `app/login/layout.tsx` 신규(형제 레이아웃), `app/layout.tsx` zero-diff | REQ-002, REQ-003 |
| 로그인 신규 기능 | 비밀번호 표시/숨김 토글(`login-password-toggle`), 정책 링크 3종 비활성(실제 라우트 없음), "랜딩으로 돌아가기"만 활성 | REQ-002 |
| 사이드바 실사용자명 | 서버 컴포넌트(`app/cases/layout.tsx`)는 세션 조회 없음 — 클라이언트 컴포넌트로 분리해 Better Auth 클라이언트 훅 사용, 로딩/미로그인 폴백 정의 | REQ-005 |
| Claim 카드 "추가 확인 필요" 데이터 소스 | 신규 AI 필드 없음, `MissingMaterial.relatedIssueType`이 해당 claim의 `getClaimIssueTypes()` 결과와 일치할 때만 카드 내부 직접 표시, 그 외에는 앵커 링크만 | REQ-011 |
| 사이드바 신규 2항목 | 영구 비활성, href 없음, 실제 페이지 미구현 | REQ-004, REQ-021 |
| "최근 리서치" | 신규 read-only 조회 함수, `getCaseForOwner` 동일 신뢰 경계, 제목/보조정보는 `cases.input` JSON에서 파생. `ownerUserId`는 `NewCasePage`(`/cases/new` 서버 페이지 컴포넌트) 자신의 서버측 `getCurrentSession()` 확인에서 조달(신규 API 없음) — 그 결과 `/cases/new`는 정적 생성에서 동적 렌더링으로 전환되며, 이는 의도된 결과다("반드시 정적 생성 유지"는 폐기됨, 대신 빌드-안전성 요구사항으로 대체) | REQ-013 |
| 예외 화면 범위 | **실재하는 3개**(전역 404 / 사건-없음·미소유 통합 / 기존 일시오류)만 구현 — Pencil 6종 카탈로그를 그대로 복제하지 않음 | REQ-015 |
| App Topbar 매핑 | `/cases/new`→"사건 입력", `/cases/[caseId]`→"리서치 리포트"(`#expert-feedback` 프래그먼트 유무와 무관하게 고정 — 별도 화면 아닌 인페이지 앵커) | REQ-006 |
| 모바일 드로어 접근성 | ESC/스크림클릭/포커스이동·복귀/스크롤잠금/tab순서제외/브레이크포인트 리셋 + 포커스 트랩(Tab/Shift+Tab 닫힌 루프)/배경 `inert` 비활성화(신규) — 네이티브 구현, 신규 라이브러리 없음; 프리미티브 재사용 시에도 실제 동작을 자동화 테스트로 검증 | REQ-017 |
| 반응형 구현 방식 | Tailwind CSS 유틸리티만, 별도 라이브러리 없음 | REQ-016, REQ-017 |
| 디자인 토큰 | 기존 `--color-bora-*`/`--color-app-*` 네임스페이스 재사용, 신규 추가는 최소 | REQ-001 |

## §6. Cross-references

- spec.md §2 REQ-001~024 — 이 문서가 뒷받침하는 요구사항 전체
- research.md §현재 구현 사실 — 이 문서의 매핑 대상이 되는 기존 코드 구조(§5b/§5c/§7/§9/§10이 REQ-005/REQ-011/REQ-013/REQ-015/REQ-017 결정의 직접 근거)
- plan.md §마일스톤 — 이 문서의 §2(로그인)→§3(신규 컴포넌트)→§4(화면별) 순서를 실행 계획으로 전환
- acceptance.md §시각 스모크 체크리스트 — 이 문서의 화면별 구조를 검증 기준으로 전환
- SPEC-PILOT-VISUAL-001/design.md — §1(토큰 전체 목록)·§3(App Shell/공유 컴포넌트 원 스펙)의 상위 참조 문서, 이 SPEC은 그 내용을 수정하지 않고 확장만 한다
