# SPEC-UI-MIGRATION-001 — plan.md

## §A. Context

- 작업 위치: 프로젝트 루트, 기존 `main` 기반
- Tier: L (5개 아티팩트: spec.md + plan.md + acceptance.md + design.md + research.md — `progress.md`는 모든 Tier에서 별도로 생성되며 이 5개 아티팩트 개수에는 포함되지 않는다)
- 선행 SPEC: SPEC-PILOT-VISUAL-001(3개 화면 App Shell·토큰·타이포그래피가 `main`에 반영됨) — `depends_on: [SPEC-PILOT-VISUAL-001]`로 명시. 이 SPEC은 그 위에 로그인·예외 화면·반응형·콘텐츠 정합성을 확장하는 계층이며, 선행 SPEC의 파일을 수정하지 않는다(historical, PRESERVE).
- **depends_on 상태 — 충족 확인됨**: SPEC-PILOT-VISUAL-001의 frontmatter `status:`를 직접 확인한 결과 `completed`다(리트로액티브 sync-close 커밋 `fa60631`이 `main` 최신화 시점에 반영). 이전 초판에서 기록했던 `status: in-progress` 불일치 및 `--ignore-deps` 오버라이드 요구는 더 이상 유효하지 않다 — 이 SPEC의 `/moai run` 진입 시 Phase 1 sub-step 0(Depends_on Pre-flight Check)은 정상적으로 PASS하며, `--ignore-deps` 플래그를 기본값으로 사용해서는 안 된다.
- 이 SPEC은 `app/login/`에 신규 UI surface(로그인 셸)를 도입하고 `app/cases/**`의 기존 UI surface를 확장하므로 `.claude/rules/moai/workflow/spec-workflow.md` § Conditional Design Route의 UI-surface heuristic을 충족한다. 단, 대상 디자인은 이미 확정된 동일 Pencil 파일(`design/claimradar-ui.pen`)로 존재하며 design.md에 전량 문서화되어 있으므로, `manager-design` D1-D5 파이프라인의 신규 실행 여부는 오케스트레이터의 run-phase 진입 판단에 맡긴다.
- PRESERVE 대상(§D 참고): `lib/db/schema.ts`, `lib/validation/case-input.ts`, `lib/feedback/schema.ts`, `lib/cases/create-case.ts`, `lib/feedback/submit-feedback.ts`, `lib/pipeline/**`, `lib/ai/**`, `db/**`, 모든 마이그레이션, `app/layout.tsx`(zero-diff), SPEC-PILOT-VISUAL-001이 만든 기존 파일 구조(대체가 아닌 확장만).
- 유일한 예외(신규 파일 허용): REQ-013의 read-only 조회 함수(`lib/cases/` 신규 파일), `app/login/layout.tsx`(신규 파일), `app/not-found.tsx`(신규 파일), `app/cases/[caseId]/not-found.tsx`(신규 파일), 사이드바 사용자 블록 클라이언트 컴포넌트(신규 파일, 파일명/위치는 §F1 재량).

## §B. Key Decisions (결정-가역성 순 — 변경 가능성 높은 것부터)

가장 되돌리기 어렵거나 리뷰가 필요한 결정을 먼저 배치했다. 나머지 기계적/리팩터링 단계는 §C 마일스톤 하단으로 미룬다.

1. **로그인 폰트 격리 구조 결정 (최고 리스크 — 신규 레이아웃 파일, `app/layout.tsx` zero-diff와 직결)**: `/login`만 감싸는 신규 `app/login/layout.tsx`를 만들어 그 내부에서 `next/font/local`(Pretendard)+`next/font/google`(Manrope)을 호출한다. `app/layout.tsx`는 SPEC-PILOT-VISUAL-001과 동일하게 완전한 PRESERVE 대상이며, `app/cases/layout.tsx`와 `app/login/layout.tsx`는 서로 독립적인 형제 레이아웃으로 각자의 라우트 세그먼트만 감싼다(교차 감쌈 금지). 대안(`app/layout.tsx`에서 전역 폰트 교체)은 `/` 홈 화면의 계산된 폰트까지 바꾸는 것이어서 기각.
2. **사이드바 실사용자명 조회 전략 결정 (빌드-안전성 직결 — `next.config.ts`/`lib/auth/session.ts` 직접 조사로 확정됨)**: `next.config.ts`에 Partial Prerendering(`experimental.ppr`)이 설정되어 있지 않음을 직접 확인했다. 이 상태에서는 서버 컴포넌트 어디서든(Suspense로 감싸도) 동적 API(`headers()` 등을 호출하는 `getCurrentSession()`)를 호출하면 그 라우트 전체가 정적 생성에서 동적 렌더링으로 전환된다 — `app/cases/layout.tsx`가 직접 세션을 조회하면 `/cases/new`의 정적 생성이 깨진다는 기존 코드 주석의 경고가 그대로 재현된다. 따라서 사이드바 사용자 블록은 별도 클라이언트 컴포넌트로 분리하고, 이미 프로젝트에 설치·사용 중인 `authClient`(`better-auth/react`, `lib/auth/client.ts`)의 세션 훅으로만 브라우저 하이드레이션 이후 조회한다 — 클라이언트 컴포넌트의 실행은 `next build`의 서버 렌더링 단계와 무관하므로 어떤 라우트의 정적 생성도 깨지지 않는다. 대안 1(레이아웃에서 직접 조회)은 정적 생성 파괴로 기각. 대안 2(Suspense로 감싼 서버 컴포넌트 격리)는 PPR 미설정 상태에서 효과가 없어(§C M2 참고) 기각.
3. **Claim 카드 "추가 확인 필요" 데이터 소스 및 연결 규칙 결정 (신규 AI 필드 vs 기존 데이터 재사용 — 코드 직접 조사로 결정론적 규칙까지 확정됨)**: `lib/pipeline/types.ts`를 직접 읽어 `VerifiedClaim` 인터페이스(summary/supportingEvidenceIds/counterArguments/status)에 claim 단위 근거 부족 사유 필드가 없음을 확인했다. 이 섹션은 신규 AI 파이프라인 출력 필드 없이 구현하되, `MissingMaterial.relatedIssueType` 필드와 `page.tsx`의 기존 `getClaimIssueTypes()` 헬퍼가 파생하는 claim별 issueType 집합의 일치 여부만을 유일한 항목-레벨 표시 조건으로 삼는다 — 일치하지 않으면 앵커 링크만 표시한다. 대안(claim 단위 신규 필드 추가)은 AI 파이프라인 스키마 변경을 요구해 이 SPEC의 "AI 파이프라인 무변경" 하드 제약을 위반하므로 기각. 대안(모든 missingMaterial을 무조건 카드에 복제)은 검증 불가능한 임의 연결이 되므로 기각.
4. **실재하는 예외 화면 범위 결정 (Pencil 6종 카탈로그 vs 코드베이스 실재 3개 진입 경로 — 재조사로 정정됨)**: 초판은 `error.tsx`에 이미 404/사건-없음 변형이 존재한다고 잘못 전제했다. `error.tsx` 전체 소스와 `app/**/not-found.tsx` glob 재조사 결과, `error.tsx`는 일반 런타임 오류 경계만 보유하고(§7a), `not-found.tsx`는 어디에도 존재하지 않는다(§7b). 이 SPEC은 실재하는 3개 진입 경로에만 시각 언어를 적용한다: 전역 404(`app/not-found.tsx`, 신규), 사건-없음/미소유 통합 404(`app/cases/[caseId]/not-found.tsx`, 신규 — `getCaseForOwner`의 정보 은닉 설계를 존중해 별도 403 없음), 기존 `error.tsx`(최소 검증만). 세션만료/네트워크불가/준비중은 각각 기존 로직으로 이미 커버되어 신규 화면을 만들지 않는다. 대안(Pencil 6종 전량을 독립 쇼케이스 컴포넌트로 구현)은 프로덕션에서 도달 불가능한 코드를 추가하는 것이어서 기각.
5. **사이드바 신규 2항목 범위 결정**: "리포트 보관함"/"판례·약관 자료실"은 영구 비활성 nav 항목(href 없음, `aria-disabled`, "준비 중" Chip)으로만 추가한다 — 실제 페이지·목록 뷰는 만들지 않는다. "신규 페이지/필드 생성 없음" 원칙에서 도출된다.
6. **"최근 리서치" 신규 read-only 조회 함수 도입 결정**: 신규 스키마 없이 기존 `cases` 테이블만 조회하는 소형 함수를 `lib/cases/`에 추가한다 — `getCaseForOwner`와 동일한 owner-scope 신뢰 경계를 재사용한다. `cases` 테이블에 `title` 컬럼이 없음을 확인했으므로(research.md §9), 제목/보조정보는 `input.diagnosisName`/`input.disabilityBodyPart`에서 파생하고, 필드 누락 시 정의된 폴백 문자열을 사용한다. 이는 §A에서 명시한 PRESERVE 목록의 유일한 예외이며(기존 파일 수정이 아닌 신규 파일 추가), 되돌릴 경우 REQ-013 전체가 무효화된다.
7. **반응형 및 모바일 드로어 접근성 구현 방식 — CSS 유틸리티 + 네이티브 React state (라이브러리 도입 없음, 조건부 재검토)**: 태블릿/모바일 규칙은 Tailwind v4 반응형 유틸리티(`md:`/`sm:` 등 프로젝트 기존 브레이크포인트 관례 확인 후 적용)와 CSS `transition`만으로 구현한다. 드로어 접근성 계약(ESC/스크림클릭/포커스이동복귀/스크롤잠금/tab순서/브레이크포인트 리셋)은 `useState`/`useRef` + 표준 DOM 이벤트로 구현하며, 신규 포커스 트랩 전용 패키지를 도입하지 않는다(`package.json` 직접 조사로 미설치 확인). 단, run-phase에서 `pnpm install` 후 이미 설치된 `@base-ui/react`가 포커스 관리 내장 Dialog 계열 서브패스를 실제로 제공함을 확인하면, 그것을 우선 재사용해 직접 구현량을 줄인다(잔여 위험, research.md §10, §F4).
8. **Enum 한글 라벨 매핑 위치 — 기존 패턴 확장 (신규 아키텍처 아님)**: `feedback-form.tsx`가 이미 보유한 `{value,label}` 배열 패턴(`OVERALL_RATINGS` 등)을 `EvidenceType`/`QueryIssueType`에도 동일하게 적용한다 — 공유 유틸 모듈로 추출할지 각 렌더 위치에 인라인할지는 run-phase 구현 재량(신규 아키텍처 결정 아님). 이하 §C 마일스톤 순서 및 §F 열린 판단은 결정 재검토 우선순위가 낮은 기계적 실행 세부사항이다.

## §C. 마일스톤 (실행 순서 — 의존성 기반)

로그인 셸(독립 라우트, 낮은 결합)을 먼저 정리하고, App Shell 확장(공유 컴포넌트에 영향)을 다음에, 이후 3개 기존 화면의 콘텐츠 정합성 수정, 우측 레일 신규 기능, 예외 화면, 마지막으로 반응형+품질 게이트 순으로 배치한다.

### M1 — 로그인 화면 폰트 격리 셸 + 재스타일 + 비밀번호 토글/링크 (REQ-002~003)

- 신규 `app/login/layout.tsx` 작성 — `app/cases/layout.tsx`와 동일한 방식으로 Pretendard/Manrope를 이 파일 내부에서만 로드
- `login-form.tsx`를 design.md §4(로그인) 구조로 재스타일 — 필드/버튼/브랜드 패널, `authClient.signIn.email` 로직과 5개 testid 100% 보존
- 비밀번호 표시/숨김 토글 신설(`login-password-toggle`) — `type` state 전환만, 제출값 무영향
- 푸터 링크 3종(이용약관/개인정보처리방침/고객지원)은 `aria-disabled="true"` 비활성 텍스트로, "랜딩으로 돌아가기"만 실제 활성 링크로 구현
- `app/layout.tsx` diff가 완전히 비어 있음을 확인(REQ-003)

### M2 — App Shell 확장: Sidebar 신규 2항목 + 사용자 블록 클라이언트 분리 + Topbar 브레드크럼 (REQ-004~006)

- `case-shell-nav.tsx`에 2개 비활성 nav 항목(`sidebar-nav-archive`, `sidebar-nav-precedent-db`) 추가 — SPEC-PILOT-VISUAL-001의 pathname 전용 3항목 규칙은 무변경
- 사이드바 사용자 블록을 신규 클라이언트 컴포넌트(파일명/위치는 §F1)로 분리 — `app/cases/layout.tsx`(서버 컴포넌트) 자신은 어떤 세션 동적 API도 직접 호출하지 않는다(§B 결정 2). Better Auth 클라이언트 세션 훅으로 `user.name`을 표시하고, 로딩/미로그인 순간에는 중립 폴백을 렌더링
- M2 완료 시 `pnpm build` 실행 후 `/cases/new`가 정적 생성됨을 빌드 로그로 확인(§E 리스크)
- App Topbar에 브레드크럼 + 동적 페이지 타이틀 추가(비고정 유지)

### M3 — Enum 한글 라벨 매핑 (REQ-007~008)

- `EvidenceType`/`QueryIssueType`용 `{value,label}` 한글 매핑 추가, `evidence-item.tsx`/`page.tsx`/`feedback-form.tsx`의 모든 렌더 위치 교체

### M4 — 비확정성 안내 문구 추가 (REQ-009~010)

- Aggregate Status 패널에 리포트 레벨 비확정 문구 추가
- "검토할 담보"(`review-targets`) 패널에 담보 검토 비확정 문구 추가

### M5 — Claim 카드 "추가 확인 필요" 결정론적 연결 규칙 적용 (REQ-011)

- INSUFFICIENT 상태 claim 카드에 §B 결정 3의 규칙(`MissingMaterial.relatedIssueType` ↔ `getClaimIssueTypes()` 일치 여부)으로 "추가 확인 필요" 섹션 추가 — 일치 항목은 카드 내부 직접 표시, 불일치 시 앵커 링크만 — `VerifiedClaim`/`MissingMaterial` 인터페이스 무변경

### M6 — 사건 입력 우측 레일 확장 (REQ-012~014)

- "분석 상태" 정적 4단계 목록 추가(가짜 진행률 없음)
- 신규 read-only 조회 함수(`lib/cases/`) 작성 — `createdAt DESC`, ≤3건, owner-scope, 제목/보조정보를 `input.diagnosisName`/`input.disabilityBodyPart`에서 파생, 필드 누락 시 정의된 폴백 문자열 반환
- "최근 리서치" 패널(`case-recent-research`) 연결, owner-scope 단위 테스트 작성
- "임시 저장" 버튼(`case-input-draft-save`) 비활성 렌더링

### M7 — 실재하는 예외 화면 3종 (REQ-015)

- 신규 `app/not-found.tsx` 작성(전역 404, `global-not-found` testid, App Shell 미적용 — 루트 레이아웃만)
- 신규 `app/cases/[caseId]/not-found.tsx` 작성(사건-없음/미소유 통합, `case-not-found` testid, App Shell 자동 중첩) — 존재-없음과 소유권-없음을 구분하는 어떤 텍스트/단서도 넣지 않는다(정보 은닉 보존)
- 두 신규 화면이 공유할 수 있는 프레젠테이션 컴포넌트(아이콘/타이틀/설명/에러코드 레이아웃)를 추출할지는 §F1 재량
- 기존 `app/cases/[caseId]/error.tsx`는 리팩터링하지 않는다 — `case-error-retry` testid와 `reset()` 호출 계약이 회귀 없이 유지되는지만 재검증
- 세션만료/네트워크불가/준비중용 신규 파일은 만들지 않는다(§B 결정 4)

### M8 — 반응형 + 드로어 접근성 + 테스트 셀렉터 갱신 + 품질 게이트 (REQ-016~024)

- 1024px 태블릿 규칙(사이드바 유지, 우측 레일 본문 아래 이동) 구현
- 390px 모바일 드로어 구현: 열기(`mobile-nav-toggle`)/닫기 버튼/스크림(`mobile-nav-scrim`)/ESC/포커스 이동·복귀/스크롤 잠금/닫힘 상태 tab-순서 제외/1024px 이상 리사이즈 자동 초기화 — §B 결정 7
- 1280px 비붕괴 확인(로그인/사건 입력/리포트/피드백/예외 화면 중 1개, 총 5개 화면)
- 접근성 속성(label 연관, `role="status"`, `aria-live`, focus, 신규 `aria-disabled`) 보존 확인(REQ-023)
- 영향받는 모든 기존 테스트 파일(`login-form.test.tsx` 신규 또는 기존, `case-input-form.test.tsx`, `page.test.tsx`, `feedback-form.test.tsx`, `error.test.tsx`) 및 신규 `not-found.test.tsx` ×2의 셀렉터를 재스타일 후 구조에 맞춰 최소 수정 — spec.md §3의 testid 값 자체는 변경하지 않는다
- `pnpm test`, `pnpm test:e2e`, `pnpm lint`, `pnpm build`, `pnpm format:check` 실행 및 통과(REQ-024)

## §D. 제약 (DO NOT VIOLATE)

- PRESERVE 목록(§A): `lib/db/schema.ts`, `lib/validation/case-input.ts`, `lib/feedback/schema.ts`, `lib/cases/create-case.ts`, `lib/feedback/submit-feedback.ts`, `lib/pipeline/**`, `lib/ai/**`, `db/**`, 모든 마이그레이션, `app/layout.tsx` — 절대 수정 금지(§A에 열거한 신규 파일 추가는 예외이나 기존 파일 수정은 아님)
- SPEC-PILOT-VISUAL-001이 이미 만든 파일 구조를 대체하지 않고 확장만 함 — 그 SPEC의 REQ-004~006(App Shell), REQ-007~018(3개 화면 구조)의 기존 결정은 무변경
- 기존 testid 값(spec.md §3 "보존 대상") 이름 변경/제거 금지
- "리포트 보관함"/"판례·약관 DB" 페이지 자체(목록 뷰, 라우트, API) 신규 구현 금지
- Claim 단위 근거 부족 사유의 AI 파이프라인 신규 필드화 금지(`VerifiedClaim`/`MissingMaterial` 인터페이스 무변경)
- 초안 저장(draft-save) 백엔드 로직 신규 구현 금지
- "분석 상태" 단계별 실시간 진행률 데이터 생성 금지(정적 안내만)
- `app/cases/layout.tsx`(서버 컴포넌트) 자신이 `getCurrentSession()` 등 동적 API를 직접 호출하는 것 금지(§B 결정 2, 빌드-안전성 위반)
- 별도 "권한없음"(403), "세션이 만료되었습니다", "네트워크에 연결할 수 없습니다", "준비 중인 기능입니다" 독립 화면 신규 구현 금지(§B 결정 4, spec.md §5 Out of Scope)
- `error.tsx`를 공유 컴포넌트로 리팩터링하거나 404/사건-없음 콘텐츠를 추가하는 것 금지(그 파일은 런타임 오류 경계 전용, 최소 검증만)
- `--no-verify` 사용 금지, force-push 금지

## §E. 리스크

| 리스크 | 완화책 |
|--------|--------|
| M1(로그인 레이아웃)이 `app/layout.tsx`/`/`에 의도치 않게 영향 | M1 완료 시 `git diff app/layout.tsx app/page.tsx` 명시적 확인, 출력이 완전히 비어 있음을 검증 |
| M2(사용자 블록 클라이언트 분리)를 잘못 구현해 `app/cases/layout.tsx`가 여전히 동적 API를 간접 호출(예: 클라이언트 컴포넌트를 서버 컴포넌트 안에서 잘못 조합) | M2 완료 시 `pnpm build` 실행 로그에서 `/cases/new`가 여전히 정적(Static) 생성으로 표시되는지 명시적으로 확인(AC-005a) |
| M2(사이드바 확장)이 SPEC-PILOT-VISUAL-001의 기존 3항목 pathname 규칙을 깨뜨림 | M2 완료 시 SPEC-PILOT-VISUAL-001 AC-004에 해당하는 기존 테스트를 재실행해 회귀 없음을 확인 |
| M6(신규 read-only 조회)이 owner-scope 신뢰 경계를 잘못 구현해 다른 사용자의 사건이 노출됨 | `getCaseForOwner`와 동일한 세션 기반 필터링 패턴을 그대로 복사·재사용, 단위 테스트로 타 owner 사건이 결과에 포함되지 않음을 검증 |
| M6(최근 리서치)의 `input` JSON 필드 누락 폴백을 구현하지 않아 오래된/이상 데이터 행에서 런타임 예외 발생 | 필드 접근을 방어적 타입 가드로 감싸고, 폴백 문자열 렌더링 케이스를 단위 테스트로 검증 |
| M7(예외 화면)이 정보 은닉 설계를 깨뜨려 사건-없음/미소유를 시각적으로 구분 가능하게 만듦 | M7 완료 시 두 시나리오(존재하지 않는 ID / 타인 소유 ID)를 각각 렌더링해 화면 텍스트·구조가 완전히 동일한지 diff로 확인(AC-015a) |
| M7이 실수로 `error.tsx`를 리팩터링해 `case-error-retry`/`reset()` 계약을 회귀시킴 | M7 착수 전 `error.tsx`에 대한 `git diff`가 계획상 비어 있어야 함을 재확인, 완료 후 `error.test.tsx` 즉시 재실행 |
| M8(드로어 접근성)이 포커스 트랩을 불완전하게 구현해 접근성 회귀 발생 | AC-017a~AC-017h 각각을 개별 자동화 테스트로 작성, run-phase에 `@base-ui/react` Dialog 서브패스 실존 여부를 우선 확인(§F4) |
| M8(반응형)이 데스크톱 1440px/1280px 레이아웃을 깨뜨림 | 태블릿/모바일 CSS를 `min-width` 방향 미디어 쿼리로 격리해 데스크톱 스타일이 기본값으로 유지되도록 구현, M8 완료 시 4개 브레이크포인트(390/1024/1280/1440) 순차 수동 확인 |
| Enum 한글 라벨 매핑(M3)이 기존 테스트가 참조하는 영문 값 비교 assertion을 깨뜨림 | 매핑은 렌더링 레이어에서만 적용하고 내부 데이터 값(영문 enum)은 변경하지 않음 — 테스트가 `data-status`/`data-*` 속성이 아닌 화면 텍스트를 assertion하는 경우에만 갱신 필요, research.md §8에서 사전 확인 |

## §F. 열린 판단 (구현 시점 결정, `[NEEDS CLARIFICATION]` 아님 — 재량 범위 명시)

- **F1**: (a) 사이드바 사용자 블록 클라이언트 컴포넌트, (b) 예외 화면 2종이 공유할 수 있는 프레젠테이션 컴포넌트의 이름/파일 위치(`components/`, `app/cases/` 하위 등)는 run-phase 구현 재량. 기존 프로젝트 컨벤션(`components/ui/`, `components/evidence-item.tsx` 등)을 참고해 일관되게 배치.
- **F2**: Enum 한글 라벨 매핑을 공유 유틸 모듈로 추출할지, 각 파일에 인라인할지는 §B 결정 8에 따라 재량. 3개 이상 파일에서 재사용되므로 공유 모듈을 권장하나 강제하지 않는다.
- **F3**: 사이드바 신규 비활성 2항목의 아이콘 선택은 Pencil 디자인의 시각적 대응 아이콘을 참고하되, `lucide-react`(기존 설치 아이콘 라이브러리) 내에서 근접한 아이콘으로 대체 가능.
- **F4**: `pnpm install` 이후 `@base-ui/react`의 Dialog 계열 서브패스(예: `@base-ui/react/dialog`)가 실제로 존재하고 포커스 관리를 내장하고 있는지 run-phase 착수 시 확인한다(research.md §10 잔여 위험). 존재하면 M8 드로어 구현에서 그 프리미티브를 우선 재사용해 직접 구현량을 줄인다. 존재하지 않거나 이 SPEC의 접근성 계약(REQ-017)과 맞지 않으면 §B 결정 7의 네이티브 구현으로 진행한다 — 어느 경우든 신규 패키지 설치는 하지 않는다.

## §G. Cross-references

- spec.md §2 REQ-001~024 — 이 계획이 구현하는 요구사항
- design.md §1~5 — 이 계획의 각 마일스톤이 참조하는 정확한 시각 스펙
- research.md §1~11 — M1~M8이 보존해야 할 기준선 및 REQ-005/REQ-011/REQ-013/REQ-015의 스코프·결정 근거
- acceptance.md — 각 마일스톤 완료 판정 기준(Given-When-Then)
