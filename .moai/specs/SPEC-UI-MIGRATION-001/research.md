# SPEC-UI-MIGRATION-001 — research.md

Tier L research artifact. Deep codebase analysis (read-only) performed before spec.md/plan.md authoring, establishing the exact baseline that REQ-019~022 (기능·데이터 보존) must not regress, and the direct-code-verification basis for the scope decisions in REQ-005/REQ-011/REQ-013/REQ-015.

> **개정 이력**: 외부 독립 리뷰(2026-09-03)가 이 문서 초판의 §7(공통 예외 화면)이 실제 코드와 일치하지 않음을 지적했다 — `app/cases/[caseId]/error.tsx`에 "K02Nyo 사건을 찾을 수 없습니다"류 404/사건 없음 변형이 이미 존재한다는 서술은 **직접 재조사 결과 사실이 아니었다**(초판 작성 시 조사 오류). 이 개정판은 `error.tsx` 전체 소스, `app/`/`app/cases/` 전체에 대한 `not-found.tsx` glob 검색, `app/cases/layout.tsx`, `lib/cases/get-case-for-owner.ts`, `lib/auth/client.ts`/`lib/auth/session.ts`, `next.config.ts`, `app/login/login-form.tsx`, `app/login/page.tsx`를 다시 직접 읽어 확정한 사실로 §5·§6·§7을 전면 재작성했다. §9b/§9c는 신규 조사다.

## §1. 파일 인벤토리 (SPEC-PILOT-VISUAL-001 대비 신규/확장 대상)

| 경로 | 상태 | 역할 |
|------|------|------|
| `app/login/page.tsx`, `app/login/login-form.tsx` | 기존, 미스타일(현재 plain HTML input 수준) | 재스타일 대상(REQ-002) |
| `app/login/layout.tsx` | **신규** | 로그인 전용 폰트 격리 레이아웃(REQ-003) |
| `app/cases/layout.tsx`, `app/cases/case-shell-nav.tsx` | 기존(SPEC-PILOT-VISUAL-001이 구현) | 확장 대상(REQ-004~006) |
| `app/cases/[caseId]/page.tsx` | 기존(SPEC-PILOT-VISUAL-001이 재스타일) | 콘텐츠 정합성 확장(REQ-007, 009, 010, 011) |
| `app/cases/new/case-input-form.tsx` | 기존(SPEC-PILOT-VISUAL-001이 재스타일) | 우측 레일 확장(REQ-012~014) |
| `app/cases/[caseId]/feedback-form.tsx` | 기존(SPEC-PILOT-VISUAL-001이 재스타일) | Enum 라벨 확장(REQ-007, 008) |
| `app/cases/[caseId]/error.tsx` | 기존, **일반 런타임 오류 경계만 보유**(§7 정정 참고) | REQ-015 범위에서는 재검증만, 변경 최소화 |
| `app/not-found.tsx` | **신규** | 전역 404(REQ-015) |
| `app/cases/[caseId]/not-found.tsx` | **신규** | 사건-없음/미소유 통합 처리(REQ-015) |
| `components/evidence-item.tsx` | 기존 | Enum 라벨 확장 대상(REQ-007) |
| `lib/cases/` | 기존 디렉토리 | **신규 파일** 1개 추가(REQ-013) |
| `app/cases/sidebar-user-block.tsx`(가칭) | **신규(선택적 파일 분리)** | 세션 실사용자명 클라이언트 컴포넌트(REQ-005, 파일명/경로는 run-phase 재량) |

## §2. EvidenceType/QueryIssueType 영문 raw 노출 확인 (REQ-007~008 근거)

`lib/pipeline/types.ts:59` — `export type EvidenceType = "POLICY" | "PRECEDENT" | "DISPUTE_CASE" | "STATUTE" | "OTHER";`
`lib/pipeline/types.ts:33-42` — `QUERY_ISSUE_TYPES`(8개 값, 단일 SSOT const, `db/seed/evidence-seed-schema.ts`의 zod enum이 이 const를 import — SPEC-EVIDENCE-001 M1에서 확정된 패턴).

렌더 위치(영문 raw 값이 화면 텍스트로 그대로 노출되는 지점, 직접 확인):
- `components/evidence-item.tsx:34,36` — `<Chip>{evidenceType}</Chip>`, `<Chip key={issueType}>{issueType}</Chip>` — Chip 자식으로 raw 값을 그대로 출력
- `app/cases/[caseId]/page.tsx:314,506-507` — claim 카드 issue Chip(314), "수집 근거 유형" 우 레일의 `{type}`(506) — 동일 패턴
- `app/cases/[caseId]/feedback-form.tsx:313-317`(누락 쟁점 `<select>` 옵션 라벨), `433-434`(근거자료 평가 표의 `[{item.evidenceType}, {item.issueTypes.join(", ")}]`) — 동일 패턴

기존 해결 패턴(이미 프로젝트에 존재, 확장만 하면 됨): `feedback-form.tsx:60-76`의 `OVERALL_RATINGS`/`CLAIM_VERDICTS`/`EVIDENCE_VERDICTS` — `{value, label}` 형태의 배열로 영문 enum 값과 한글 라벨을 페어링한다. 이 SPEC은 동일 패턴을 `EvidenceType`(REQ-007)과 `QueryIssueType`(REQ-008)에도 적용한다. `<select>` 옵션의 `value` 속성과 `data-status` 등 내부 데이터 속성은 영문 enum 값을 그대로 유지하고, 화면에 보이는 옵션 라벨/Chip 텍스트만 한글로 치환한다(§8 회귀 방지 원칙 참고).

## §3. `VerifiedClaim`/`MissingMaterial` 인터페이스 직접 조사 (REQ-011 스코프 축소 및 결정론적 연결 규칙 근거)

`lib/pipeline/types.ts:106-122`를 직접 읽어 확인:

```
export interface VerifiedClaim {
  summary: string;
  supportingEvidenceIds: string[];
  counterArguments: VerifiedCounterArgument[];
  status: "VERIFIED" | "INSUFFICIENT";
}

export interface MissingMaterial {
  description: string;
  relatedIssueType: QueryIssueType;
}

export interface VerificationResult {
  verifiedClaims: VerifiedClaim[];
  missingMaterials: MissingMaterial[];
  uncertainty: string[];
}
```

**결론 1 (스코프 축소, REQ-011 승계)**: `VerifiedClaim`은 claim 단위의 근거 부족 사유 필드를 보유하지 않는다 — `missingMaterials`/`uncertainty`는 `VerificationResult`/`ResearchReport` **레벨**에 존재하며 개별 claim에 연결되어 있지 않다. claim 카드별 "추가 확인 필요" 섹션은 신규 AI 파이프라인 필드 없이 구현해야 한다.

**결론 2 (결정론적 연결 규칙, 이번 개정에서 확정)**: `MissingMaterial`은 `relatedIssueType: QueryIssueType` 필드를 보유한다. `app/cases/[caseId]/page.tsx:63-72`의 기존 `getClaimIssueTypes(claim, evidenceById)` 헬퍼가 이미 각 claim의 issueType 집합을 파생하고 있으므로(evidence의 `issueTypes`를 claim의 `supportingEvidenceIds`를 통해 역참조), `missingMaterials` 배열 중 `relatedIssueType`이 그 claim의 `getClaimIssueTypes()` 결과 집합에 포함되는 항목만 claim 카드 내부에 직접 표시할 수 있는 유일하게 검증 가능한 연결이다. 이 매칭이 없는 경우 claim 카드는 리포트 레벨 섹션으로의 앵커 링크만 표시해야 한다(추측 기반 연결 금지). §9. 결론 참고.

## §4. `getCaseForOwner` 신뢰 경계 확인 (REQ-013 근거)

`lib/cases/get-case-for-owner.ts`를 직접 확인했다. `and(eq(cases.id, caseId), eq(cases.ownerUserId, ownerUserId))` 단일 조건절로 `cases` 테이블을 조회하며, 조건에 맞는 행이 없으면(사건이 존재하지 않거나, 존재하지만 다른 사용자 소유인 경우 모두) `null`을 반환한다 — **존재-없음과 소유권-없음을 하나의 결과(`null`)로 통합해 구분 불가능하게 만드는 정보 은닉(info-hiding) 패턴**이다(§7에서 REQ-015의 통합 예외 화면 결정 근거로 재사용). `app/cases/[caseId]/page.tsx:121-124`가 `null`을 받으면 `notFound()`를 호출한다. REQ-013의 신규 "최근 리서치" 조회 함수는 이 owner-scope 필터링 패턴(`eq(cases.ownerUserId, ownerUserId)` 조건)을 재사용해야 하며, 별도의 인증/인가 로직을 새로 설계하지 않는다.

## §5. 현재 사이드바/Topbar 구조 및 세션 조회 안전성 분석 (REQ-004~006 근거)

### §5a. 사이드바/Topbar 구조 (기존)

SPEC-PILOT-VISUAL-001이 구현한 `case-shell-nav.tsx`는 정확히 3개 항목(사건 입력/리서치 리포트/전문가 피드백)만 렌더링하며, pathname 전용 결정론적 규칙(DB/API 조회 없음)으로 target을 계산한다 — 이 규칙은 REQ-004에서 무변경으로 명시된다. `app/cases/layout.tsx:52-59`의 사이드바 하단 사용자 블록은 현재 "담당 손해사정사"/"BORA 리서치" 하드코딩 문자열이다(REQ-005 근거). App Topbar는 현재 정적 타이틀만 렌더링하며(브레드크럼 없음), `grep -r "fixed\|sticky"`가 `app/`/`components/`에서 0건임을 재확인 — 현재도 비고정(non-fixed) 동작이며 REQ-006은 이 동작을 유지하면서 브레드크럼만 추가한다.

### §5b. 세션 실사용자명 표시의 정적 생성 위험 — 직접 조사 (REQ-005 결정 근거)

`app/cases/layout.tsx:24-29` 코드 주석이 명시적으로 경고한다: "이 레이아웃에서 세션 조회를 도입하면 이전까지 정적으로 생성되던 `/cases/new`가 빌드 시점 DB 연결을 시도하다 실패한다." 이 위험을 확정하기 위해 다음을 직접 조사했다:

1. **`next.config.ts` 확인** — Partial Prerendering(PPR) 활성화 플래그(`experimental.ppr`)가 설정되어 있지 않다(빈 `NextConfig` 객체). PPR 없이는 라우트 트리 어디에서든(Suspense로 감싼 자식이라도) 요청 시점 동적 API를 호출하면 **라우트 전체**가 동적 렌더링으로 전환된다 — Suspense 경계는 스트리밍 로딩 UI 경계일 뿐, PPR 없이는 정적/동적 경계가 아니다. 따라서 "Suspense로 감싼 서버 컴포넌트에서만 세션 조회" 방식은 이 프로젝트에서 `/cases/new` 정적 생성을 보존하지 못한다(REQ-005 안전 전략 후보에서 기각 — §9 결론).
2. **`lib/auth/session.ts` 확인** — `getCurrentSession()`은 `next/headers`의 `headers()`를 호출한다. `headers()`는 Next.js의 동적 API이며, 서버 컴포넌트(레이아웃 포함)에서 호출되면 그 라우트를 무조건 동적 렌더링으로 전환한다. `app/cases/layout.tsx`(서버 컴포넌트)가 직접 `getCurrentSession()`을 호출하면 `/cases/new`를 포함한 `app/cases/**` 전체가 매 요청 DB 조회를 수반하게 된다.
3. **`lib/auth/client.ts` 확인** — `authClient = createAuthClient()`(`better-auth/react`)가 이미 `app/login/login-form.tsx`에서 클라이언트 컴포넌트 내부 `authClient.signIn.email(...)` 호출로 사용 중이다. Better Auth의 React 클라이언트는 세션 상태를 구독하는 클라이언트 훅을 제공한다(설치된 `better-auth@1.7.1`의 React 클라이언트 API — 정확한 훅 이름은 run-phase에서 설치된 패키지의 타입 정의로 확정). 클라이언트 컴포넌트 내부의 세션 조회는 `next build`의 정적 HTML 생성 단계(서버 렌더링)와 무관하게 브라우저 하이드레이션 이후에만 실행되므로, **어떤 라우트도 빌드 시점 DB 연결을 시도하지 않는다** — 이것이 유일하게 직접 조사로 안전성이 확인된 경로다.

**결론(REQ-005 결정)**: 사이드바 사용자 블록을 별도의 작은 **클라이언트 컴포넌트**(예: `sidebar-user-block.tsx`)로 분리하고, 그 내부에서만 Better Auth 클라이언트의 세션 훅을 호출한다. `app/cases/layout.tsx`(서버 컴포넌트) 자신은 어떤 세션 조회도 하지 않으며, 이 클라이언트 컴포넌트를 렌더링만 한다. `/cases/new`를 포함한 `app/cases/**`의 정적 생성 특성은 완전히 보존된다. 로딩/비로그인 상태의 폴백은 §9 결론 및 spec.md REQ-005에서 확정한다.

## §6. 로그인 화면 현재 구조 — 확장 재조사 (REQ-002~003 근거)

`app/login/page.tsx`/`login-form.tsx`를 직접 다시 읽어 확인:

- **구조**: `LoginPage`는 `<h1>테스터 로그인</h1>` + `<LoginForm />`만 렌더링한다. `LoginForm`은 이메일/비밀번호 필드, 오류 영역, 제출 버튼으로 구성된 미스타일 plain HTML 폼이다(shadcn 미적용) — SPEC-PILOT-VISUAL-001이 명시적으로 범위 외로 남긴 영역이다.
- **testid/로직**: 5개 testid(`login-form`, `login-email`, `login-password`, `login-error`, `login-submit`)와 `authClient.signIn.email(...)` 호출 로직(Better Auth)이 존재하며, `e2e/auth.spec.ts`가 이 셀렉터들을 참조한다.
- **비밀번호 표시/숨김 토글 — 부재 확인**: `login-form.tsx`의 `<input type="password">`는 고정 `type="password"`이며, 표시/숨김을 전환하는 어떤 상태·버튼도 존재하지 않는다. 이 SPEC이 신규로 추가하는 기능이다(REQ-002).
- **이용약관/개인정보처리방침/고객지원 링크 — 실제 라우트 부재 확인**: `app/` 전체를 대상으로 "이용약관|개인정보처리방침|고객지원|terms|privacy|support" 패턴을 검색한 결과, `app/cases/[caseId]/page.tsx`류 파일에서의 우연한 문자열 매치(무관한 문맥)만 발견되었고, `/terms`, `/privacy`, `/support` 같은 실제 라우트나 페이지 파일은 존재하지 않는다. Pencil 디자인의 로그인 푸터 3종 링크는 실제 대상이 없다(REQ-002 결정 근거).
- **"랜딩으로 돌아가기" 링크 — 실재 확인**: `/`(홈)는 실제 존재하는 라우트이며, 이 링크만 활성 링크로 구현 가능하다.

## §7. 공통 예외 화면 현재 구조 — 재조사로 전면 정정 (REQ-015 근거)

> **정정 안내**: 이 섹션의 초판은 `app/cases/[caseId]/error.tsx`에 "K02Nyo 사건을 찾을 수 없습니다"류 404/사건 없음 변형과 `"CASE-2024-0999" · "ERR_CASE_NOT_FOUND"` 형식의 메타 텍스트가 이미 존재한다고 서술했다 — **이는 직접 재조사 결과 사실이 아니다.** 아래는 `error.tsx` 전체 소스 및 `app/`/`app/cases/` 전체에 대한 `**/not-found.tsx` glob 검색으로 확정한 실제 baseline이다.

### §7a. `error.tsx` — 실제 내용 (일반 런타임 오류 경계, 404 아님)

`app/cases/[caseId]/error.tsx`는 Next.js App Router의 **일반 런타임 오류 경계**다. 실제 내용은:
- 제목: "문제가 발생했습니다"
- 본문: "사건 상세 화면을 표시하는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."
- 버튼: `data-testid="case-error-retry"`, `onClick={() => reset()}` — Next.js가 제공하는 `reset()` 콜백을 호출해 오류 경계 아래의 세그먼트를 재렌더링 시도한다.

이 파일에는 404/사건 없음 관련 텍스트, "CASE-2024-0999" 같은 사건 번호 패턴, `ERR_CASE_NOT_FOUND` 같은 오류 코드 텍스트가 **전혀 존재하지 않는다**. SPEC-PILOT-VISUAL-001 M6에서 이미 App Shell 토큰(`bg-app-surface`/`border-app-line`/`text-bora-ink` 계열)으로 재스타일되어 있다.

`error.tsx`는 `app/cases/[caseId]/` 세그먼트의 렌더링/데이터 조회 중 예외가 발생했을 때만 트리거된다(예: DB 쿼리 자체가 throw하는 경우) — `page.tsx`가 명시적으로 호출하는 `notFound()`와는 다른 경로다.

### §7b. `notFound()` 호출과 Next.js `not-found.tsx` 컨벤션 — 현재 미해결

`app/cases/[caseId]/page.tsx:121-124`는 `getCaseForOwner(caseId, session.user.id)`가 `null`을 반환하면 `notFound()`를 호출한다(§4 참고 — 사건이 존재하지 않거나 다른 사용자 소유인 경우 모두). Next.js App Router 컨벤션에서 `notFound()`는 가장 가까운 `not-found.tsx` 경계로 렌더링을 위임한다.

`app/`(루트)와 `app/cases/`(및 그 하위) 전체를 `**/not-found.tsx` 패턴으로 검색한 결과 **일치하는 파일이 0개**다. 즉, 현재 `notFound()` 호출은 **Next.js의 기본 내장 404 UI로 폴백**한다 — 앱 브랜딩·App Shell·디자인 토큰이 전혀 적용되지 않은 최소 텍스트 화면이다. 이는 이 SPEC이 반드시 채워야 할 실질적 갭이다(REQ-015).

### §7c. 통합 처리(정보 은닉) 및 App Shell 자동 래핑 확인

- **정보 은닉**: §4에서 확인했듯 `getCaseForOwner`는 "존재하지 않음"과 "존재하지만 소유하지 않음"을 동일한 `null`로 통합한다. 따라서 사건-없음과 무단-접근이 자연스럽게 **동일한 `notFound()` 경로**로 수렴하며, 별도의 403/권한없음 UI를 만들면 오히려 "이 ID는 존재하지만 당신 소유가 아닙니다"라는 정보를 역으로 노출해 기존 보안 설계를 약화시킨다. 이 SPEC은 별도 403 화면을 만들지 않는다(REQ-015).
- **App Shell 자동 래핑**: `app/cases/[caseId]/not-found.tsx`(신규)를 만들면, Next.js App Router의 레이아웃 중첩 규칙에 따라 이 파일은 `app/cases/layout.tsx`(사이드바+Topbar를 렌더링하는 App Shell) **안쪽**에서 렌더링된다 — `error.tsx`가 이미 그러하듯, 별도 작업 없이 App Shell 컨텍스트가 자동으로 유지된다.
- **전역 404는 App Shell 밖**: 반대로 `app/not-found.tsx`(루트, 신규)는 `app/cases/layout.tsx`의 하위가 아니므로 App Shell(사이드바+Topbar)이 적용되지 않는다 — 루트 `app/layout.tsx`(완전한 PRESERVE 대상, zero-diff)만 감싼다. 이는 사건 컨텍스트가 없는 완전히 임의의 잘못된 URL(예: `/foobar`)에 대한 진짜 전역 404이므로 App Shell 부재가 정상이다.

### §7d. 재확정된 REQ-015 범위 — 실재하는 진입 경로만

위 조사에 따라 이 SPEC이 다루는 예외 UI는 **정확히 3개**이며, 각각 실제 프로덕션 진입 경로를 가진다:

| 예외 UI | 파일 | 상태 | 트리거 | App Shell |
|---|---|---|---|---|
| 전역 404 | `app/not-found.tsx` | 신규 | 앱 어디서도 매칭되지 않는 URL | 아님(루트 레이아웃만) |
| 사건-없음/무단-접근(통합) | `app/cases/[caseId]/not-found.tsx` | 신규 | `page.tsx`의 `notFound()` 호출(§7b/§7c) | 적용됨(자동 중첩) |
| 일시적 런타임 오류 | `app/cases/[caseId]/error.tsx` | 기존, 최소 검증만 | 세그먼트 렌더링/데이터 조회 중 throw | 적용됨(기존과 동일) |

Pencil 디자인(`design/claimradar-ui.pen`)의 프레임 `11`은 6개 변형(404/권한없음/세션만료/일시오류/네트워크불가/준비중)을 카탈로그 형태로 정의하지만, 이 코드베이스에는 그 6개 각각에 대응하는 실제 트리거 경로가 존재하지 않는다:

- **세션만료**: `page.tsx:117-119`가 이미 `if (!session?.user) redirect("/login")`로 처리한다 — 별도 "세션 만료" 안내 화면 없이 조용히 리다이렉트하는 기존 동작이며, 이를 감지해 다른 문구를 보여주려면 신규 세션-만료 감지 로직(예: 리다이렉트 쿼리 파라미터)이 필요해 REQ-019(기존 인증 로직 무변경)와 충돌한다 — 범위 밖(spec.md §5 Out of Scope).
- **네트워크불가**: `case-input-form.tsx`(72행 부근)와 `feedback-form.tsx`(193행 부근)가 이미 `catch` 블록에서 "네트워크 오류로 요청을 완료하지 못했습니다. 다시 시도해 주세요." 문구를 폼 내부 인라인 오류로 렌더링하고 있다(`text-sm text-bora-danger` 스타일 기적용) — 독립된 페이지가 아니라 이 기존 인라인 상태를 그대로 유지한다. 범위 밖 신규 페이지.
- **준비중**: REQ-004의 사이드바 비활성 nav 2항목("준비 중" Chip)이 이미 이 개념을 커버한다 — 독립 페이지 불필요.

## §8. 테스트 요약 (보존해야 할 제약, SPEC-PILOT-VISUAL-001 §8 계승 + 신규 항목)

| 파일 | 검증 대상 동작 | 반드시 생존해야 할 셀렉터 |
|------|----------------|---------------------------|
| `e2e/auth.spec.ts` | 로그인 성공/실패 플로우 | `login-form`, `login-email`, `login-password`, `login-error`, `login-submit` |
| `case-input-form.test.tsx` | 대기 인디케이터, 단일 흐름 가드 등(SPEC-PILOT-VISUAL-001 §8 계승) | `case-submit`, `case-pending-indicator`, 4개 필드 testid |
| `page.test.tsx` | 요약 배너 DOM 순서, `claim-status`, evidence 렌더링(REQ-007로 텍스트만 변경, `data-status` 등 속성은 무변경) | `summary-banner`, `verified-claims`, `claim-status`(+`data-status`), `cited-evidence-empty`, `missing-materials`, `uncertainty` |
| `feedback-form.test.tsx` | 단일 흐름 가드, `<select>` 상호작용, 필드 오류 분리 `<p>`(REQ-007/008로 라벨 텍스트만 변경, `<select>` value는 영문 enum 유지) | `feedback-overall-rating`(id), `feedback-submit`, `feedback-success`, `feedback-section`(×≥5) 외 |
| `error.test.tsx` | 재시도 버튼이 `reset()` 호출(REQ-015 범위에서 최소 검증만 — 이 SPEC은 `error.tsx`를 일반화 리팩터링하지 않는다, §7d) | `case-error-retry` — **404/사건-없음 테스트와 절대 혼동 금지**. 이 testid는 오직 런타임 오류 경계의 `reset()` 계약만 검증한다 |
| `not-found.test.tsx`(신규 ×2, 전역/사건별) | 각 404 경계가 올바른 App Shell 유무로 렌더링되는지, `global-not-found`/`case-not-found` testid 존재 | `global-not-found`, `case-not-found`(신규) |
| `e2e/case-flow.spec.ts`, `e2e/tenant-isolation.spec.ts` | 전체 플로우, owner-scope 격리(REQ-013 신규 조회도 동일 격리 원칙 적용) | 기존 셀렉터 전체 |

**중요 — Enum 라벨 회귀 방지 원칙**: REQ-007/008의 한글 라벨 매핑은 렌더링(화면 텍스트) 레이어에만 적용되고, `<select>` 요소의 `value`, `data-status` 등 내부 데이터 속성은 영문 enum 값을 그대로 유지해야 한다.

## §9. 최근 리서치 데이터 파생 규칙 (REQ-013 근거)

`lib/db/schema.ts:65-78`의 `cases` 테이블을 직접 확인 — **`title` 컬럼이 존재하지 않는다.** 컬럼은 `id`, `ownerUserId`, `input`(JSON), `status`, `createdAt`, `updatedAt`뿐이다. `input` JSON의 실제 구조는 `case-input-form.tsx:44-52`의 제출 payload(`incidentDescription`, `diagnosisName`, `disabilityBodyPart`, `incidentDate`)와 `lib/validation/case-input.ts`의 `caseInputSchema`로 확정된다. 따라서 "최근 리서치" 위젯이 표시할 제목/보조정보는 `input` JSON에서 파생해야 하며, 신규 컬럼을 추가하지 않는다(§5 결정 4, plan.md에서 확정하는 정확한 필드 매핑은 spec.md REQ-013 참고).

`input` 컬럼은 Drizzle `mode: "json"`으로 선언되어 있어 직렬화/역직렬화 자체는 Drizzle이 담당한다(수동 `JSON.parse` 불필요) — 그러나 컬럼 타입은 `unknown`이므로, 스키마가 보장하지 않는 필드 누락(예: 과거 스키마 버전의 잔존 행)에 대비한 방어적 타입 가드와 폴백 문자열이 필요하다.

## §10. 모바일 드로어 접근성 구현 자원 조사 (REQ-017 근거)

`package.json`의 `dependencies`를 직접 확인했다. 포커스 트랩 전용 라이브러리(예: `focus-trap-react`)는 설치되어 있지 않다. 이미 설치된 `@base-ui/react`(`components/ui/input.tsx`가 `@base-ui/react/input`을 사용 중 — 서브패스 임포트 구조 확인)는 Base UI 프로젝트로, 포커스 관리가 내장된 언스타일 Dialog/Popover 프리미티브를 제공하는 것으로 알려져 있으나, 이 워크트리에는 `node_modules`가 설치되어 있지 않아 해당 서브패스(`@base-ui/react/dialog` 등)의 실제 존재 여부를 타입 정의로 직접 확인하지 못했다 — run-phase에서 `pnpm install` 이후 확인이 필요한 **잔여 위험**이다. `lucide-react`(아이콘)는 이미 설치되어 있다. 신규 대형 의존성 없이 네이티브 React state(`useState`/`useRef`) + 표준 DOM 이벤트(keydown, focus/blur) + 기존 설치된 프리미티브 조합만으로 REQ-017의 접근성 계약(포커스 이동/복귀, ESC, 스크림 클릭, 스크롤 잠금, tab order)을 구현하는 것이 가능하다고 판단하되, run-phase에서 `@base-ui/react`의 Dialog 계열 서브패스가 실제로 존재하면 그것을 우선 재사용해 직접 구현량을 줄인다(plan.md §B 결정 6 참고).

## §11. 결론 — 이 SPEC이 반드시 보존해야 할 기준선

REQ-019~022(spec.md §2 Group J)가 참조하는 정확한 기준선은 위 §1~§10이며, 특히:

- SPEC-PILOT-VISUAL-001이 확립한 App Shell·토큰·타이포그래피·3개 화면 구조(대체가 아닌 확장만)
- 로그인 화면의 Better Auth 로직 및 5개 testid
- `<select>`/`data-status` 등 내부 데이터 속성의 영문 enum 값(REQ-007/008 한글 라벨은 표시 레이어만)
- `VerifiedClaim`/`VerificationResult`/`MissingMaterial` 타입 계약(REQ-011은 이 계약을 확장하지 않음, 기존 `relatedIssueType` 필드만 재사용)
- `getCaseForOwner`의 owner-scope 신뢰 경계 패턴 및 정보 은닉(존재-없음=소유권-없음) 설계(REQ-013 신규 조회가 재사용, REQ-015가 존중)
- 사이드바 3항목 pathname 전용 링크 규칙(REQ-004는 항목 2개 추가만, 기존 3항목 로직 무변경)
- `error.tsx`의 `reset()` 재시도 동작 — **404/사건-없음과는 별개의 계약**(REQ-015 범위에서 최소 검증만, 일반화 리팩터링 없음)
- `page.tsx`의 `if (!session?.user) redirect("/login")` 세션 만료 처리(변경 없이 유지, REQ-015 범위에서 별도 화면 미신설)
- `case-input-form.tsx`/`feedback-form.tsx`의 기존 인라인 네트워크 오류 문구(변경 없이 유지, REQ-015 범위에서 별도 페이지 미신설)
- `next.config.ts`에 PPR 미설정, `app/cases/layout.tsx`가 서버 컴포넌트로서 직접 세션 조회를 하지 않는 현재 구조(REQ-005가 클라이언트 컴포넌트 분리로 보존)

이 기준선을 변경하는 어떤 구현도 이 SPEC의 범위를 벗어난다.

## §12. Cross-references

- spec.md §3(보존·신규 테스트 계약) — 이 문서 §8의 testid 목록을 REQ-020 검증 근거로 인용
- design.md §2~§4(화면별 구조 매핑) — 이 문서의 현재 구조를 신규 시각 구조로 매핑하는 대상
- acceptance.md §기능·데이터 보존 그룹(Group J) — 이 문서 §11의 보존 항목을 검증 가능한 AC로 전환
- SPEC-PILOT-VISUAL-001/research.md — 3개 화면의 상위 기준선 조사 문서(이 SPEC이 계승·재확인)
