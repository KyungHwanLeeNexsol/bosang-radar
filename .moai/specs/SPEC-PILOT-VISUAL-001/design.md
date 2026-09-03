# SPEC-PILOT-VISUAL-001 — design.md

Tier L design artifact. Source of truth for the confirmed Pencil design (`design/claimradar-ui.pen`), reproduced here so implementation and review do not need Pencil MCP access. Read alongside spec.md §2 (REQ table references this file by section) and research.md (current-implementation baseline).

> plan-auditor iteration-1 감사(FAIL, 0.63) 대응: §1의 신규 커스텀 속성 이름을 `--color-bora-*`/`--color-app-*` 네임스페이스로 변경했다(D8 — 기존 shadcn 커스텀 속성 `--color-accent`/`--color-sidebar` 등과의 충돌을 회피; 헥스값 자체는 변경 없음). 이 문서 전반의 REQ-ID 참조는 spec.md의 신 번호 체계(001~024)로 갱신되었다.

## §1. 디자인 토큰 (Design Tokens)

Pencil `GetVariables()` 조사 결과. `app/globals.css`의 기존 `@theme inline` 블록에 추가되는 값(REQ-001). 아래 좌측 열은 Pencil 원시 변수명, 우측 열은 이 SPEC이 `app/globals.css`에 실제로 추가하는 Tailwind v4 커스텀 속성 이름이다.

| Pencil 변수 | 헥스값 | Tailwind 커스텀 속성 이름 (plan-auditor D8 대응 — 충돌 회피) |
|---|---|---|
| font | "Noto Sans KR" (raw — 실제 적용은 §2 폰트 결정 참고, Pretendard로 대체) | n/a (폰트는 CSS 변수가 아닌 `next/font` 로더로 적용) |
| font-brand | "Poppins" | n/a (이 SPEC 범위에서 미사용) |
| font-mark | "Manrope" (BORA 워드마크 전용, weight 800) | n/a (`next/font/google` 로더로 적용) |
| bg | #F4F6F8 | `--color-app-bg` |
| surface | #FFFFFF | `--color-app-surface` |
| surface-sub | #F8FAFB | `--color-app-surface-sub` |
| surface-inset | #EFF2F5 | `--color-app-surface-inset` |
| line | #E2E7EC | `--color-app-line` |
| line-strong | #CBD3DB | `--color-app-line-strong` |
| ink | #111820 | `--color-bora-ink` |
| ink-2 | #39424E | `--color-bora-ink-2` |
| ink-3 | #6B7684 | `--color-bora-ink-3` |
| ink-4 | #95A0AD | `--color-bora-ink-4` |
| accent | #6C47FF | `--color-bora-accent` |
| accent-deep | #5227D6 | `--color-bora-accent-deep` |
| accent-soft | #EDE7FF | `--color-bora-accent-soft` |
| accent-line | #B7A1FF | `--color-bora-accent-line` |
| ok | #17694A | `--color-bora-ok` |
| ok-soft | #EAF3EE | `--color-bora-ok-soft` |
| ok-line | #BFDCCD | `--color-bora-ok-line` |
| warn | #8A5A12 | `--color-bora-warn` |
| warn-soft | #FBF3E3 | `--color-bora-warn-soft` |
| warn-line | #E8D4A8 | `--color-bora-warn-line` |
| danger | #A32C2C | `--color-bora-danger` |
| danger-soft | #FBEDED | `--color-bora-danger-soft` |
| danger-line | #EDC9C9 | `--color-bora-danger-line` |
| sidebar | #141A21 | `--color-app-sidebar` |
| sidebar-line | #28313C | `--color-app-sidebar-line` |
| sidebar-ink | #9AA5B2 | `--color-app-sidebar-ink` |
| bora-700 | #3B1E9E | `--color-bora-700` |
| bora-600 | #5227D6 | `--color-bora-600` |
| bora-500 | #6C47FF | `--color-bora-500` |
| bora-400 | #8B6BFF | `--color-bora-400` |
| bora-300 | #B7A1FF | `--color-bora-300` |
| bora-200 | #EDE7FF | `--color-bora-200` |
| bora-050 | #F7F4FF | `--color-bora-050` |

**D8 충돌 회피 근거**: `app/globals.css`의 기존 shadcn 베이스 테마는 이미 `--color-accent: var(--accent);`와 `--color-sidebar: var(--sidebar);` 등의 커스텀 속성을 정의하고 있다(OKLCH neutral, `/`·`/login` 등 이 SPEC이 건드리지 않는 라우트에서 사용). 원래 초안에서 예시로 든 `--color-accent`/`--color-sidebar` 같은 이름을 그대로 썼다면 이 기존 shadcn 속성을 암묵적으로 재정의(silent redefinition)하여 REQ-005(앱 셸이 `app/cases/` 외부에 영향을 주어서는 안 됨)의 라우트 격리 의도를 위반했을 것이다. 위 표의 우측 열처럼 `--color-bora-*`(주로 색상/잉크 계열)와 `--color-app-*`(주로 표면/구조 계열) 네임스페이스로 이름을 바꾸면, 헥스값은 완전히 동일하게 유지하면서도 이름 충돌을 원천 차단한다.

Tailwind v4 mapping approach: add the right-column custom properties inside the existing `@theme inline { ... }` block in `app/globals.css`. The existing shadcn OKLCH neutral tokens (`--background`, `--foreground`, `--primary`, `--color-accent`, `--color-sidebar`, ...) are NOT removed and NOT redefined — routes outside `app/cases/` (e.g. `/`, `/login`) continue to use them unchanged.

## §2. 타이포그래피 스케일

| 이름 | 크기 | 굵기 | line-height | 용도 |
|------|------|------|-------------|------|
| H1 | 26px | 600 | — | 화면 타이틀 |
| H2 | 19px | 600 | — | 섹션 타이틀 |
| H3 | 15px | 600 | — | 사건/카드 타이틀 |
| Body | 14px | 400 | 1.7 | 본문 |
| Body S | 13px | 400 | — | 보조 본문 |
| Meta | 12px | 400 | — | 메타 정보(출처 라벨 등) |
| Label S | 11px | 500 | — | 상태 라벨, 식별자(배지·메타 키) |

### 폰트 결정 (사용자 확정)

Pencil 원시 변수는 "Noto Sans KR"이나, 실제 적용은 **Pretendard**를 본문 폰트로 사용한다(Design System 캡션 텍스트와 시각적으로 일치). Pretendard는 Google Fonts에 없으므로 `pretendard` npm 패키지(static/variable woff2 포함) + `next/font/local`로 로드하며, `app/layout.tsx`의 기존 Geist Sans/Mono 설정을 대체한다. BORA 브랜드 워드마크가 텍스트로 렌더링될 경우(이미지가 아닌 경우) Manrope ExtraBold 800을 `next/font/google`로 로드해 그 텍스트에만 적용한다(REQ-002, REQ-003).

## §3. 재사용 프레젠테이션 컴포넌트

각 컴포넌트는 Pencil 노드 구조를 기술한 것이며, 실제 구현은 기존 shadcn 프리미티브를 우선 재사용하고(REQ-008, 이미 표현 가능한 경우 신규 컴포넌트 도입 금지 — REQ-009), 표현 불가능한 경우에만 신규 컴포넌트를 만든다.

| 컴포넌트 | 구조 | 매핑 대상 |
|----------|------|-----------|
| Badge / Status | pill, `padding [5,9]`, `radius 3`, `gap 6`, 6×6 dot + label(11/600) | `claim-status` pill(REQ-007) — VERIFIED→ok 토큰, INSUFFICIENT→warn 토큰. 기존 프리미티브로 표현 불가 → 신규 컴포넌트 필요(REQ-008) |
| Chip / Tag | `padding [4,8]`, `radius 3`, `fill: surface-inset`, text 11/500 `ink-3` | evidence type/issue 태그(예: "판례"). 기존 프리미티브로 표현 불가 → 신규 컴포넌트 필요(REQ-008) |
| Button / Primary | `padding [12,20]`, `radius 4`, `fill: accent`, icon + white 14/600 | 기존 shadcn `Button` variant로 매핑, 신규 컴포넌트 불필요(REQ-009) |
| Button / Secondary | `padding [12,18]`, `radius 4`, outlined, icon + 14/500 `ink-2` | 기존 shadcn `Button` variant로 매핑, 신규 컴포넌트 불필요(REQ-009) |
| Field / Input | label row(13/600 `ink-2` + 선택적 필수 `*` + 선택적 hint 11/500 `ink-4`) + input box(`padding [12,13]`, `radius 4`, `fill: surface`, 14/400 `ink`) + 선택적 helper(11.5/400 `ink-4`) | 기존 shadcn `Input`/`Textarea`/`Label` 조합으로 매핑, 신규 컴포넌트 불필요(REQ-009) |
| Meta Item | key(11/500 `ink-4`) + value(15/600 `ink`) | 리포트 요약 메타 스트립 4셀(진단명/장해부위/사고일/담당) |
| Evidence Item | `padding [13,0,13,16]`, 태그 행 + 타이틀(14/600) + 출처 행(11.5/500 `ink-4` + "원문 보기" 링크 `accent` + 외부링크 아이콘) | `renderEvidenceReference()` 헬퍼 출력(REQ-013) |
| Notice | `padding [13,14]`, `radius 4`, `fill: warn-soft`, 아이콘 + 타이틀(12.5/600 `warn`) + 본문(12/400 `ink-2`) | PII/주의 문구 배너(기존 카피 재사용). 기존 프리미티브로 표현 불가 → 신규 컴포넌트 필요(REQ-008) |
| Radio Option | `padding [10,14]`, `radius 4`, `fill: surface`, 원형 마크(반경 8, 선택 시 내부 dot) + label(13/500 `ink-2`) | 전체 평가/실제 결과 선택지 스타일 참고(단, native `<select>` 유지 결정과 충돌하지 않는 범위 — §5 참고) |
| Check Row | `gap 10`, 16×16 box(radius 3) + checkmark + label(13/400 `ink-2`) | 개인정보 확인 체크박스(사건 입력) |
| Nav Item(사이드바) | `padding [10,12]`, `radius 4`, 기본 투명, 아이콘 + label(13/500 `sidebar-ink`) | REQ-006 3개 항목(D7 결정론적 링크 규칙 포함) |
| App Sidebar | 다크(`fill: sidebar`), 폭 232, `padding [22,14,18,14]` — 브랜드 마크(28×28, radius 7.5, `fill: accent`, 흰 "B" 14.6/800) + "BORA" 워드마크(17/800) + nav 그룹 라벨("작업 공간", 10/500, `#5D6875`) + nav 항목들; 하단: divider + 사용자 블록(아바타 30×30, radius 4, `fill:#242D38` + 이니셜, 이름 12.5/600, 소속 11/500) | REQ-004 |
| App Topbar | `fill: surface`, height 62, `padding [0,32]` — 좌: 브레드크럼(11/500 `ink-4`) + 타이틀(15/600 `ink`); 우: 컨텍스트 메타 텍스트(예: 사건 ID) | REQ-004 |

## §4. 화면별 구조 매핑

### 화면 01 · 사건 입력 (REQ-010, REQ-011)

Sidebar + Topbar 셸. 콘텐츠 `padding [28,32,36,32]`, 2컬럼 gap 24:

- **좌 컬럼(w780)**: Panel "사건 개요"(`fill: surface`) — Header(단계 표시 텍스트), Form Body(`padding 24`, `gap 24`): 사고 경위 필드, 진단명+장해 부위 행, 사고일 행, divider, 비식별 확인 Check Row. Panel Footer(`fill: surface-sub`, `padding [16,24]`): 좌측 메타 텍스트 + 우측 Actions(버튼).
- **우 레일(w340, gap 16)**: Notice/비식별(기존 PII 안내 카피 재사용). "분석 상태" 및 "최근 리서치" 패널은 **REQ-011에 따라 생략** — 현재 데이터 모델에 대응 기능이 없으므로 빈 패널/placeholder를 만들지 않는다. 우 레일이 Notice만 남아 2컬럼 균형이 깨지는 경우, 좌 컬럼 폭을 확장하거나 레일 폭을 조정하는 것은 구현 재량(시각적 판단, 기능 변경 아님).

### 화면 02 · 사건 Research Report (REQ-012~015)

Sidebar + Topbar. 콘텐츠 세로, `padding [24,32,40,32]`, `gap 20`:

- **Panel 사건 요약**(`fill: surface`, w1144): Header(eyebrow "사건 요약 · <id>" + 타이틀 22/600 + 우측 status Badge + 생성 시각). Meta Strip(4개 Meta Item, 1px 세로 구분선). 사고 경위 행. Aggregate Status 블록(`fill: surface-sub`, `padding [18,24]`): 세그먼트 진행률 바 + 3개 stat 블록(근거 확인/판단 불충분/수집 근거) + 비확정성 문구(11.5/400 `ink-3` — 기존 안전 문구 재사용, REQ-012).
- **좌 컬럼(w824)**: Section Header("개별 주장 및 근거 검토" + 선택적 필터 칩 — 신규 상호작용, 이미 렌더링된 데이터에 대한 클라이언트 필터로만 구현 가능할 때만 추가, 아니면 생략). Claims list(`gap 16`), 각 claim 카드: 헤더(인덱스 배지 + 타이틀 + issue 칩 + status Badge + 카운트 텍스트), 결론/이유/반대 논리/근거자료 행(REQ-013). INSUFFICIENT 상태는 warn-soft 헤더 배경 + Footer Note. "그 외 검토 항목" 패널 — 기존 "검토할 담보 목록"/"추가 필요 자료" 섹션과 형태가 맞으면 매핑, 아니면 독립 리스트 섹션 유지.
- **우 레일(w300, gap 16)**: "검토 항목"(claim 제목 앵커 목록, 클라이언트 파생 — REQ-014), "수집 근거 유형"(evidenceType 카운트 막대 차트, 클라이언트 파생 — REQ-014), Notice "활용 유의"(기존 리포트 비확정 문구 재사용). 이 우 레일 두 패널을 위해서든, 그 어떤 목적을 위해서든 신규 DB/API 호출은 금지된다(REQ-015).

### 화면 03 · 전문가 피드백 (REQ-016~018)

Sidebar + Topbar. 콘텐츠 수평(`padding [24,32,40,32]`, `gap 20`):

- **폼 컬럼(w804, gap 16)**: Context Bar(사건 정보 + 리서치 결과 카운트). 5개 번호 섹션(각 `fill: surface`, Header: 번호+타이틀+선택적 "필수" Chip):
  1. 전체 평가 — Radio Option 스타일 참고(기존 `<select>` 유지, §5 참고) + 코멘트 Textarea
  2. 누락된 쟁점 — **기존 동적 배열 UI 유지**(REQ-017), Check Row는 시각 참고만
  3. 개별 주장 평가 — 기존 native `<select>` 유지, 행 컨테이너만 Pencil 행 형태로 재스타일
  4. 개별 근거자료 평가 — 테이블 형태(Table Head 2컬럼), verdict는 native `<select>` 유지
  5. 실제 결과 — Radio Option 스타일 참고(기존 필드 구조 유지, 신규 enum 필드 추가 금지), 비확정 문구 재사용
  - Form Footer: 좌측 PII notice, 우측 Actions — "임시 저장"은 **REQ-018에 따라 생략**, "제출" 버튼 유지.
- **우 레일(w320, gap 16)**: Notice "개인정보"(재사용), "작성 진행률"(현재 폼 상태로부터 클라이언트 파생 — REQ-014와 동일한 원칙, 신규 데이터 불필요), "제출 상태"(기존 `isSubmitting`/필드 오류/`feedback-success` 조건부 UI의 재스타일 — 신규 상태 아님).

## §5. 결정 사항 요약 (Locked Decisions)

이 표는 spec.md REQ와 1:1 대응하는 확정 결정을 요약한다 — plan.md §키 결정에서 결정-가역성 순으로 재배열되어 검토 우선순위를 안내한다.

| 결정 | 확정 내용 | 근거 REQ |
|------|-----------|----------|
| 사이드바 nav 범위 및 링크 규칙 | 3개 실제 링크만(사건 입력/리서치 리포트/전문가 피드백), 비활성 placeholder 없음; "리서치 리포트"는 최근 사건 존재 시 그 리포트로, 없으면 `/cases/new`로 연결하는 결정론적 규칙(D7) | REQ-006 |
| 폰트 | 본문 Pretendard(`next/font/local`), 워드마크 텍스트일 경우만 Manrope | REQ-002, REQ-003 |
| 우 레일 축소(사건 입력) | 분석 상태/최근 리서치 패널 생략(신규 인프라 없음) | REQ-011 |
| 우 레일 확장(리포트) | 검토 항목/근거 유형 차트는 클라이언트 파생으로 반드시 구현(신규 API 없음) | REQ-014 |
| 피드백 동적 배열 UI | `missedIssues` 배열 유지, 정적 체크리스트로 대체 금지 | REQ-017 |
| 피드백 select 컴포넌트 | native `<select>` 유지, 커스텀 리스트박스로 교체 금지 | 기존 테스트 상호작용 패턴 보존(사용자 확정) |
| 임시 저장 버튼 | 생략(신규 초안 저장 기능 없음) | REQ-018 |
| Sidebar 다크 셸 | `app/cases/layout.tsx` 신규, `app/layout.tsx`/`/`/`login` 미변경 | REQ-004, REQ-005 |
| 디자인 토큰 네임스페이스 | 신규 커스텀 속성은 `--color-bora-*`/`--color-app-*`(기존 shadcn `--color-accent`/`--color-sidebar` 등과 충돌 회피, plan-auditor D8) | REQ-001 |

## §6. Cross-references

- spec.md §2 REQ-001~024 — 이 문서가 뒷받침하는 요구사항 전체
- research.md §현재 구현 사실 — 이 문서의 매핑 대상이 되는 기존 코드 구조
- plan.md §마일스톤 — 이 문서의 §3(공유 컴포넌트) → §4(화면별) 순서를 실행 계획으로 전환
- acceptance.md §시각 스모크 체크리스트 — 이 문서의 화면별 구조를 검증 기준으로 전환
