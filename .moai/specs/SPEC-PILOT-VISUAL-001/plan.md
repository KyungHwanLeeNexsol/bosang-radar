# SPEC-PILOT-VISUAL-001 — plan.md

## §A. Context

- 작업 위치: 프로젝트 루트, 기존 `main` 기반
- Tier: L (5개 아티팩트: spec.md + plan.md + acceptance.md + design.md + research.md)
- 이 SPEC은 `app/cases/new/`·`app/cases/[caseId]/` 화면에 신규 UI surface(공유 앱 셸, 프레젠테이션 컴포넌트)를 도입하므로 `.claude/rules/moai/workflow/spec-workflow.md` § Conditional Design Route의 UI-surface heuristic을 충족한다. 단, 대상 디자인은 이미 사용자가 확정한 Pencil 파일(`design/claimradar-ui.pen`)로 존재하며 이 SPEC의 design.md에 전량 문서화되어 있으므로, `manager-design` D1-D5 파이프라인의 신규 실행 여부는 오케스트레이터의 run-phase 진입 판단에 맡긴다(디자인 결정 자체는 이미 완료·문서화됨).
- 선행 SPEC: SPEC-PILOT-UX-001(완료) — 이 SPEC이 보존해야 할 기능 기준선을 확립했다.
- PRESERVE 대상(§D 참고): `lib/db/schema.ts`, `lib/validation/case-input.ts`, `lib/feedback/schema.ts`, `lib/cases/create-case.ts`, `lib/feedback/submit-feedback.ts`, `lib/pipeline/**`, `lib/ai/**`, `db/**`, `app/page.tsx`, `app/login/**`, 모든 마이그레이션.
- plan-auditor iteration-1 감사(종합 점수 0.63, FAIL) 대응 수정이 이 버전에 반영되어 있다 — spec.md HISTORY 참고.

## §B. Key Decisions (결정-가역성 순 — 변경 가능성 높은 것부터)

가장 되돌리기 어렵거나 리뷰가 필요한 결정을 먼저 배치했다. 나머지 기계적/리팩터링 단계는 §C 마일스톤 하단으로 미룬다.

1. **App Shell 구조 결정 (최고 리스크 — 신규 구조, restyle 아님)**: 신규 라우트 그룹 레이아웃 `app/cases/layout.tsx`를 만들어 `app/cases/new/`와 `app/cases/[caseId]/`만 감싼다. `app/layout.tsx`는 폰트 import 교체 외 변경하지 않으며, `/`·`/login`은 전혀 건드리지 않는다. 대안(예: `app/layout.tsx`를 직접 확장)은 기각 — 범위 밖 라우트 오염 위험이 크다.
2. **사이드바 nav 범위 및 "리서치 리포트" 링크 규칙 (사용자 확정 — plan-auditor D7 대응으로 확정 완료, 더 이상 열린 판단 아님)**: 실재하는 라우트로 연결되는 3개 링크만(사건 입력/리서치 리포트/전문가 피드백), 비활성 placeholder 없음(REQ-006). "리서치 리포트" nav 항목은 **항상 활성 상태의 실제 링크**여야 하며, 다음 결정론적 규칙으로 target을 계산한다: 사용자에게 기존 사건이 1건 이상 있으면 가장 최근에 생성된 사건의 리포트 페이지(`/cases/[caseId]`)로 연결하고, 사건이 없으면 `/cases/new`로 연결한다 — 신규 스키마·API 없이 기존 `cases` 테이블에 대한 `created_at DESC LIMIT 1` 단순 조회로 구현하며, 이는 기존 `getCaseForOwner`와 동일한 인증 신뢰 경계를 사용한다. "비활성 label로 처리"라는 대안은 REQ-006이 금지하는 비활성 placeholder와 사실상 동일하므로 완전히 폐기했다(구 §F1 삭제 — 아래 §F 참고).
3. **우 레일 축소/확장 판단 (화면별 데이터 가용성 결정)**: 사건 입력 화면의 "분석 상태"/"최근 리서치" 패널은 생략(신규 인프라 없음, REQ-011). 리포트 화면의 "검토 항목"/"수집 근거 유형" 패널은 이미 렌더링된 props의 클라이언트 집계로 반드시 구현한다(신규 API 없음, REQ-014). 피드백의 "임시 저장" 버튼은 생략(REQ-018). 세 판단 모두 "새 DB/API 호출 금지"라는 동일 원칙에서 도출되며, 향후 별도 SPEC으로 뒤집힐 수 있는 스코프 결정이다.
4. **피드백 폼 상호작용 컴포넌트 유지 결정 (사용자 확정, 회귀 위험 직결)**: native `<select>` 유지(커스텀 리스트박스 도입 안 함), "누락된 쟁점"의 동적 배열 UI 유지(정적 체크리스트로 대체 안 함). 두 결정 모두 기존 테스트 상호작용 패턴(`select.value=...`+`dispatchEvent`, `missedIssues` 배열)을 깨뜨리지 않기 위함이며, 되돌릴 경우 2개 이상 테스트 파일 재작성이 필요하다.
5. **디자인 토큰 확장 방식 (타입 인터페이스에 준하는 결정 — plan-auditor D8 대응으로 네이밍 확정)**: 기존 shadcn OKLCH 토큰을 대체하지 않고 `@theme inline`에 신규 Pencil 토큰을 추가한다. 신규 커스텀 속성은 `--color-accent`/`--color-sidebar`처럼 **이미 shadcn이 사용 중인 이름과 충돌하지 않는** `--color-bora-*`/`--color-app-*` 네임스페이스를 사용한다(예: `--color-bora-accent`, `--color-bora-ok`, `--color-bora-warn`, `--color-bora-danger`, `--color-app-sidebar`, `--color-bora-ink`; 헥스값 자체는 변경 없음 — design.md §1 참고). 대체 방식(전체 테마 교체)은 `/`·`/login` 등 이 SPEC이 건드리지 않는 라우트의 시각 회귀 위험이 있어 기각.
6. **폰트 로딩 방식**: Pretendard는 `pretendard` npm 패키지 + `next/font/local`(Google Fonts에 없음), Manrope는 `next/font/google`. 이하 §C 마일스톤 순서 및 §F 열린 판단은 결정 재검토 우선순위가 낮은 기계적 실행 세부사항이다.

## §C. 마일스톤 (실행 순서 — 의존성 기반)

App Shell을 먼저 세워야 이후 화면 작업이 그 안에서 진행되므로, 토큰/폰트 → 앱 셸 → 공유 컴포넌트 → 화면별(입력→리포트→피드백) → 테스트 셀렉터 갱신 순으로 배치한다.

### M1 — 디자인 토큰 및 폰트 (REQ-001~003)

- `app/globals.css`의 `@theme inline` 블록에 design.md §1 색상 토큰 + §2 타이포그래피 스케일 추가(기존 shadcn 토큰 유지, `--color-bora-*`/`--color-app-*` 신규 네임스페이스로 확장 — 기존 shadcn 커스텀 속성과 이름 충돌 없음을 확인)
- `pretendard` npm 패키지 설치, `app/layout.tsx`에서 `next/font/local`로 로드, 기존 Geist Sans/Mono import 교체(루트 레이아웃의 다른 동작은 불변)
- BORA 워드마크가 텍스트로 구현될 경우 Manrope(`next/font/google`, weight 800) 추가 — 이미지/SVG로 구현 시 이 단계 생략 가능(구현 시점 판단)

### M2 — App Shell: Sidebar + Topbar (REQ-004~006) — 최고 리스크

- 신규 `app/cases/layout.tsx` 작성 — 다크 사이드바(고정 폭, design.md §3 App Sidebar 스펙) + 탑바(design.md §3 App Topbar 스펙)
- 사이드바 nav 3개 항목 구현(§B 결정 2) — "리서치 리포트" 항목은 최근 사건 존재 여부에 따라 `/cases/[가장 최근 caseId]` 또는 `/cases/new`로 연결하는 D7 결정론적 규칙을 구현(단순 `created_at DESC LIMIT 1` 조회, 신규 API 없음)
- `app/cases/new/page.tsx`, `app/cases/[caseId]/page.tsx`가 이 레이아웃 안에서 정상 렌더링되는지 확인(레이아웃 도입만으로는 기존 서버 컴포넌트 로직 변경 없음)
- `app/layout.tsx`, `app/page.tsx`, `app/login/**`이 전혀 변경되지 않았음을 diff로 확인

### M3 — 공유 프레젠테이션 컴포넌트 (REQ-007~009)

- Badge/Status 컴포넌트(design.md §3) — 기존 `claim-status` pill을 이 컴포넌트로 교체하되 testid/`data-status` 보존
- Chip/Notice 등 design.md §3에서 신규가 필요하다고 판단된 컴포넌트만 최소 추가(기존 shadcn 프리미티브 우선 재사용 원칙 — REQ-008/REQ-009 쌍)

### M4 — 화면 01 사건 입력 재스타일 (REQ-010~011)

- `case-input-form.tsx`를 design.md §4(화면 01) 구조로 재스타일 — 4개 필드/검증/제출 가드/대기 상태 로직 100% 보존, 시각만 변경
- 우 레일: Notice만 렌더링, "분석 상태"/"최근 리서치" 패널 생략(§B 결정 3)

### M5 — 화면 02 Research Report 재스타일 (REQ-012~015)

- `app/cases/[caseId]/page.tsx`를 design.md §4(화면 02) 구조로 재스타일 — `summary-banner` DOM 순서, `claim-status`/`data-status`, `sourceUrl` 링크 속성, `cited-evidence-empty` 등 §3(Preserved Test Contracts) 전량 보존
- 우 레일 "검토 항목"/"수집 근거 유형"은 클라이언트 집계로 구현(신규 API 없음, §B 결정 3, REQ-014 mandatory)

### M6 — 화면 03 전문가 피드백 재스타일 + 테스트 셀렉터 갱신 (REQ-016~021, REQ-022~024)

- `feedback-form.tsx`를 design.md §4(화면 03) 구조로 재스타일 — native `<select>`, 동적 `missedIssues` 배열 UI 유지(§B 결정 4), "임시 저장" 버튼 생략(§B 결정 3)
- `error.tsx` 최소 재스타일(위험 낮음)
- 4개 기존 테스트 파일(`case-input-form.test.tsx`, `page.test.tsx`, `feedback-form.test.tsx`, `error.test.tsx`)의 셀렉터를 재스타일 후 구조에 맞춰 최소 수정 — §3(Preserved Test Contracts)에 열거된 testid 값 자체는 변경하지 않는다
- 필요 시 신규 시각/UI 테스트를 최소 추가(기존 검증 약화 금지)
- 데스크톱 1440px 기준 확인, 1280px까지 명백한 붕괴 없음 확인(REQ-022)
- 접근성 속성(label 연관, `role="status"`, `aria-live`, focus) 보존 확인(REQ-023)
- `pnpm test`, `pnpm test:e2e`, `pnpm lint`, `pnpm build` 실행 및 통과(REQ-024)

## §D. 제약 (DO NOT VIOLATE)

- PRESERVE 목록(§A): `lib/db/schema.ts`, `lib/validation/case-input.ts`, `lib/feedback/schema.ts`, `lib/cases/create-case.ts`, `lib/feedback/submit-feedback.ts`, `lib/pipeline/**`, `lib/ai/**`, `db/**`, 모든 마이그레이션 — 절대 수정 금지
- `app/page.tsx`, `app/login/**` — 시각적으로도 건드리지 않음
- 기존 testid 값(spec.md §3) 이름 변경/제거 금지
- 신규 DB/API 호출, 신규 SELECT 프로젝션 확장 금지 — "리서치 리포트" nav 링크의 최근 사건 조회(§B 결정 2)는 기존 `cases` 테이블에 대한 단순 SELECT이며 이 제약의 예외가 아니라 그 범위 내의 조회다
- native `<select>` → 커스텀 컴포넌트 교체 금지(피드백 폼)
- `missedIssues` 동적 배열 UI → 정적 체크리스트 대체 금지
- 신규 디자인 토큰 커스텀 속성 이름은 기존 shadcn 커스텀 속성과 충돌 금지(§B 결정 5, `--color-bora-*`/`--color-app-*` 네임스페이스 사용)
- `--no-verify` 사용 금지, force-push 금지

## §E. 리스크

| 리스크 | 완화책 |
|--------|--------|
| App Shell(M2)이 `app/layout.tsx`/`/`/`/login`에 의도치 않게 영향 | M2 완료 시 `git diff app/layout.tsx app/page.tsx app/login/` 명시적 확인, 신규 파일만 추가되었는지 검증 |
| Pretendard 폰트 도입이 번들 크기/로딩 성능에 영향 | `next/font/local`의 자동 서브셋/preload 활용, variable font 우선 검토 |
| 재스타일 중 testid 누락 또는 DOM 구조 변경으로 기존 테스트 깨짐 | 각 마일스톤 완료 시 대응 테스트 파일 즉시 실행, §3 목록 대조 |
| 우 레일 축소 판단(§B 결정 3)이 시각적으로 어색한 레이아웃 초래 | 구현 재량으로 컬럼 폭 조정 허용(design.md §4 명시), 기능 추가 없이 시각적 균형만 조정 |
| native `<select>` 스타일링이 Pencil의 커스텀 리스트박스 룩과 시각적 격차 | Tailwind 클래스로 시각 근접, 완전 동일은 목표 아님(기능 우선) |
| "리서치 리포트" nav 링크(§B 결정 2)의 최근 사건 조회가 사용자당 사건 0건인 신규 계정에서 오동작 | `/cases/new`로 폴백하는 분기를 명시적으로 구현·테스트 |

## §F. 열린 판단 (구현 시점 결정, `[NEEDS CLARIFICATION]` 아님 — 재량 범위 명시)

- **F1 (삭제됨 — plan-auditor D7 대응)**: 사이드바 "리서치 리포트" nav 항목의 target은 더 이상 열린 판단이 아니다. §B 결정 2에서 사용자가 결정론적 규칙으로 확정했다.
- **F2**: 리포트 화면 좌 컬럼 필터 칩(전체/근거 확인/판단 불충분) — 이미 렌더링된 claims 배열에 대한 client-side filter로 trivial하게 구현 가능하면 추가, 아니면 생략. 신규 데이터 페칭은 금지.

## §G. Cross-references

- spec.md §2 REQ-001~024 — 이 계획이 구현하는 요구사항
- design.md §1~5 — 이 계획의 각 마일스톤이 참조하는 정확한 시각 스펙(§1 토큰 네이밍은 plan-auditor D8 대응으로 `--color-bora-*`/`--color-app-*`로 갱신됨)
- research.md §2~8 — M4~M6가 보존해야 할 기준선
- acceptance.md — 각 마일스톤 완료 판정 기준(Given-When-Then)
