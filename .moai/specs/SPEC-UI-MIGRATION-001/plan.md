# SPEC-UI-MIGRATION-001 — plan.md

## §A. Context

- 작업 위치: 프로젝트 루트, 기존 `main` 기반
- Tier: L (5개 아티팩트: spec.md + plan.md + acceptance.md + design.md + research.md)
- 선행 SPEC: SPEC-PILOT-VISUAL-001(`status: in-progress`, 3개 화면 App Shell·토큰·타이포그래피가 이미 `main`에 기능적으로 반영됨) — `depends_on: [SPEC-PILOT-VISUAL-001]`로 명시. 이 SPEC은 그 위에 로그인·공통 예외·반응형·콘텐츠 정합성을 확장하는 계층이며, 선행 SPEC의 파일을 수정하지 않는다(historical, PRESERVE).
- **depends_on 상태 불일치 주의**: SPEC-PILOT-VISUAL-001의 `progress.md`는 `run_status: audit-ready`, 6/6 마일스톤 완료, 전체 품질 게이트 + 시각적 스모크 테스트 통과, `main`에 직접 머지 완료(사용자 명시 요청에 따른 no-PR 머지)를 기록하고 있어 실질적으로 완료된 작업이다. 그러나 그 SPEC의 frontmatter `status:`는 `in-progress`로 남아 있고 `completed`로 행정적으로 전환된 적이 없다 — `.claude/rules/moai/workflow/spec-workflow.md` § Depends_on Pre-flight Check의 "충족 정의(엄격)"는 `status: completed`만을 충족으로 간주하므로, 이 SPEC(`SPEC-UI-MIGRATION-001`)의 `/moai run` 진입 시 Phase 1 sub-step 0(Depends_on Pre-flight Check)이 `AskUserQuestion`(wait/override/abort) 블로커를 발생시킨다. SPEC-PILOT-VISUAL-001의 frontmatter를 이 SPEC 범위에서 직접 수정하는 것은 관리 경계 밖이므로(사용자 지시: 해당 SPEC은 historical이며 수정·삭제 금지), 이 SPEC의 run-phase 진입은 오케스트레이터가 `/moai run --ignore-deps`를 위 근거와 함께 호출하고, 미충족 의존성 ID(`SPEC-PILOT-VISUAL-001`) + override 근거를 `.moai/logs/depends-on-override.log`에 기록하는 절차를 요구한다.
- 이 SPEC은 `app/login/`에 신규 UI surface(로그인 셸)를 도입하고 `app/cases/**`의 기존 UI surface를 확장하므로 `.claude/rules/moai/workflow/spec-workflow.md` § Conditional Design Route의 UI-surface heuristic을 충족한다. 단, 대상 디자인은 이미 확정된 동일 Pencil 파일(`design/claimradar-ui.pen`)로 존재하며 design.md에 전량 문서화되어 있으므로, `manager-design` D1-D5 파이프라인의 신규 실행 여부는 오케스트레이터의 run-phase 진입 판단에 맡긴다.
- PRESERVE 대상(§D 참고): `lib/db/schema.ts`, `lib/validation/case-input.ts`, `lib/feedback/schema.ts`, `lib/cases/create-case.ts`, `lib/feedback/submit-feedback.ts`, `lib/pipeline/**`, `lib/ai/**`, `db/**`, 모든 마이그레이션, `app/layout.tsx`(zero-diff), SPEC-PILOT-VISUAL-001이 만든 기존 파일 구조(대체가 아닌 확장만).
- 유일한 예외(신규 파일 허용): REQ-013의 read-only 조회 함수(`lib/cases/` 신규 파일), `app/login/layout.tsx`(신규 파일).

## §B. Key Decisions (결정-가역성 순 — 변경 가능성 높은 것부터)

가장 되돌리기 어렵거나 리뷰가 필요한 결정을 먼저 배치했다. 나머지 기계적/리팩터링 단계는 §C 마일스톤 하단으로 미룬다.

1. **로그인 폰트 격리 구조 결정 (최고 리스크 — 신규 레이아웃 파일, `app/layout.tsx` zero-diff와 직결)**: `/login`만 감싸는 신규 `app/login/layout.tsx`를 만들어 그 내부에서 `next/font/local`(Pretendard)+`next/font/google`(Manrope)을 호출한다. `app/layout.tsx`는 SPEC-PILOT-VISUAL-001과 동일하게 완전한 PRESERVE 대상이며, `app/cases/layout.tsx`와 `app/login/layout.tsx`는 서로 독립적인 형제 레이아웃으로 각자의 라우트 세그먼트만 감싼다(교차 감쌈 금지). 대안(`app/layout.tsx`에서 전역 폰트 교체)은 `/` 홈 화면의 계산된 폰트까지 바꾸는 것이어서 기각.
2. **Claim 카드 "추가 확인 필요" 데이터 소스 결정 (신규 AI 필드 vs 기존 데이터 재사용 — 코드 직접 조사로 확정됨)**: `lib/pipeline/types.ts`를 직접 읽어 `VerifiedClaim` 인터페이스(summary/supportingEvidenceIds/counterArguments/status)에 claim 단위 근거 부족 사유 필드가 없음을 확인했다. 따라서 이 섹션은 신규 AI 파이프라인 출력 필드 없이, INSUFFICIENT 상태 claim에 한해 이미 존재하는 리포트 레벨 `missingMaterials`/`uncertainty`(기존 `missing-materials`/`uncertainty` testid)에서 파생하거나 시각적으로 연결하는 방식으로 구현한다. 대안(claim 단위 신규 필드 추가)은 AI 파이프라인 스키마 변경을 요구해 이 SPEC의 "AI 파이프라인 무변경" 하드 제약을 위반하므로 기각.
3. **사이드바 신규 2항목 및 사용자 블록 범위 결정**: "리포트 보관함"/"판례·약관 자료실"은 영구 비활성 nav 항목(href 없음, `aria-disabled`, "준비 중" Chip)으로만 추가한다 — 실제 페이지·목록 뷰는 만들지 않는다. 사이드바 사용자 블록은 세션의 실제 `user.name`을 표시하되, DB에 없는 소속 필드는 만들지 않는다. 두 결정 모두 "신규 페이지/필드 생성 없음" 원칙에서 도출된다.
4. **"최근 리서치" 신규 read-only 조회 함수 도입 결정**: 신규 스키마 없이 기존 `cases` 테이블만 조회하는 소형 함수를 `lib/cases/`에 추가한다 — `getCaseForOwner`와 동일한 owner-scope 신뢰 경계를 재사용한다. 이는 §A에서 명시한 PRESERVE 목록의 유일한 예외이며(기존 파일 수정이 아닌 신규 파일 추가), 되돌릴 경우 REQ-013 전체가 무효화된다.
5. **공통 예외 화면 구현 방식 — 일반화 vs 신규 파일 (아키텍처 결정)**: 기존 `app/cases/[caseId]/error.tsx`(이미 404/사건 없음 변형 보유)를 완전히 새로 만드는 대신, 공유 프레젠테이션 컴포넌트(아이콘/타이틀/설명/에러코드 레이아웃)를 추출해 6종 변형이 그 컴포넌트를 재사용하도록 일반화한다. 대안(6개 독립 파일 중복 작성)은 유지보수 비용이 높아 기각.
6. **반응형 구현 방식 — CSS 유틸리티 클래스만 사용 (라이브러리 도입 없음)**: 태블릿/모바일 규칙은 Tailwind v4 반응형 유틸리티(`md:`/`sm:` 등 프로젝트 기존 브레이크포인트 관례 확인 후 적용)와 CSS `transition`만으로 구현하며, 별도 반응형/애니메이션 라이브러리를 도입하지 않는다.
7. **Enum 한글 라벨 매핑 위치 — 기존 패턴 확장 (신규 아키텍처 아님)**: `feedback-form.tsx`가 이미 보유한 `{value,label}` 배열 패턴(`OVERALL_RATINGS` 등)을 `EvidenceType`/`QueryIssueType`에도 동일하게 적용한다 — 공유 유틸 모듈로 추출할지 각 렌더 위치에 인라인할지는 run-phase 구현 재량(신규 아키텍처 결정 아님). 이하 §C 마일스톤 순서 및 §F 열린 판단은 결정 재검토 우선순위가 낮은 기계적 실행 세부사항이다.

## §C. 마일스톤 (실행 순서 — 의존성 기반)

로그인 셸(독립 라우트, 낮은 결합)을 먼저 정리하고, App Shell 확장(공유 컴포넌트에 영향)을 다음에, 이후 3개 기존 화면의 콘텐츠 정합성 수정, 우측 레일 신규 기능, 공통 예외 화면, 마지막으로 반응형+품질 게이트 순으로 배치한다.

### M1 — 로그인 화면 폰트 격리 셸 + 재스타일 (REQ-002~003)

- 신규 `app/login/layout.tsx` 작성 — `app/cases/layout.tsx`와 동일한 방식으로 Pretendard/Manrope를 이 파일 내부에서만 로드
- `login-form.tsx`를 design.md §4(로그인) 구조로 재스타일 — 필드/토글/버튼/푸터 링크, `authClient.signIn.email` 로직과 5개 testid 100% 보존
- `app/layout.tsx` diff가 완전히 비어 있음을 확인(REQ-003)

### M2 — App Shell 확장: Sidebar 신규 2항목 + 사용자 블록 + Topbar 브레드크럼 (REQ-004~006)

- `case-shell-nav.tsx`에 2개 비활성 nav 항목(`sidebar-nav-archive`, `sidebar-nav-precedent-db`) 추가 — SPEC-PILOT-VISUAL-001의 pathname 전용 3항목 규칙은 무변경
- `app/cases/layout.tsx` 사용자 블록을 세션 `user.name` 기반으로 교체
- App Topbar에 브레드크럼 + 동적 페이지 타이틀 추가(비고정 유지)

### M3 — Enum 한글 라벨 매핑 (REQ-007~008)

- `EvidenceType`/`QueryIssueType`용 `{value,label}` 한글 매핑 추가, `evidence-item.tsx`/`page.tsx`/`feedback-form.tsx`의 모든 렌더 위치 교체

### M4 — 비확정성 안내 문구 추가 (REQ-009~010)

- Aggregate Status 패널에 리포트 레벨 비확정 문구 추가
- "검토할 담보"(`review-targets`) 패널에 담보 검토 비확정 문구 추가

### M5 — Claim 카드 "추가 확인 필요" 스코프 적용 (REQ-011)

- INSUFFICIENT 상태 claim 카드에 §B 결정 2의 방식(기존 `missingMaterials`/`uncertainty` 파생·연결)으로 "추가 확인 필요" 섹션 추가 — `VerifiedClaim` 인터페이스 무변경

### M6 — 사건 입력 우측 레일 확장 (REQ-012~014)

- "분석 상태" 정적 4단계 목록 추가(가짜 진행률 없음)
- 신규 read-only 조회 함수(`lib/cases/`) 작성 + "최근 리서치" 패널(`case-recent-research`) 연결(≤3건, owner-scope)
- "임시 저장" 버튼(`case-input-draft-save`) 비활성 렌더링

### M7 — 공통 예외 화면 6종 (REQ-015)

- 공유 예외 화면 프레젠테이션 컴포넌트 추출(§B 결정 5)
- 기존 `error.tsx`를 이 컴포넌트로 리팩터링(404/사건 없음 변형 유지, `case-error-retry` testid 보존)
- 나머지 5종 변형(권한없음/세션만료/일시오류/네트워크불가/준비중) 추가, 각 `common-error-<variant>` testid 부여

### M8 — 반응형 + 테스트 셀렉터 갱신 + 품질 게이트 (REQ-016~024)

- 1024px 태블릿 규칙(사이드바 유지, 우측 레일 본문 아래 이동) 구현
- 390px 모바일 규칙(오프캔버스 드로어 + 스크림) 구현
- 1280px 비붕괴 확인(5개 화면 전체)
- 접근성 속성(label 연관, `role="status"`, `aria-live`, focus, 신규 `aria-disabled`) 보존 확인(REQ-023)
- 영향받는 모든 기존 테스트 파일(`login-form.test.tsx` 신규 또는 기존, `case-input-form.test.tsx`, `page.test.tsx`, `feedback-form.test.tsx`, `error.test.tsx`)의 셀렉터를 재스타일 후 구조에 맞춰 최소 수정 — spec.md §3의 testid 값 자체는 변경하지 않는다
- `pnpm test`, `pnpm test:e2e`, `pnpm lint`, `pnpm build`, `pnpm format:check` 실행 및 통과(REQ-024)

## §D. 제약 (DO NOT VIOLATE)

- PRESERVE 목록(§A): `lib/db/schema.ts`, `lib/validation/case-input.ts`, `lib/feedback/schema.ts`, `lib/cases/create-case.ts`, `lib/feedback/submit-feedback.ts`, `lib/pipeline/**`, `lib/ai/**`, `db/**`, 모든 마이그레이션, `app/layout.tsx` — 절대 수정 금지(REQ-013의 신규 파일 추가는 예외이나 기존 파일 수정은 아님)
- SPEC-PILOT-VISUAL-001이 이미 만든 파일 구조를 대체하지 않고 확장만 함 — 그 SPEC의 REQ-004~006(App Shell), REQ-007~018(3개 화면 구조)의 기존 결정은 무변경
- 기존 testid 값(spec.md §3 "보존 대상") 이름 변경/제거 금지
- "리포트 보관함"/"판례·약관 DB" 페이지 자체(목록 뷰, 라우트, API) 신규 구현 금지
- Claim 단위 근거 부족 사유의 AI 파이프라인 신규 필드화 금지(`VerifiedClaim` 인터페이스 무변경)
- 초안 저장(draft-save) 백엔드 로직 신규 구현 금지
- "분석 상태" 단계별 실시간 진행률 데이터 생성 금지(정적 안내만)
- `--no-verify` 사용 금지, force-push 금지

## §E. 리스크

| 리스크 | 완화책 |
|--------|--------|
| M1(로그인 레이아웃)이 `app/layout.tsx`/`/`에 의도치 않게 영향 | M1 완료 시 `git diff app/layout.tsx app/page.tsx` 명시적 확인, 출력이 완전히 비어 있음을 검증 |
| M2(사이드바 확장)이 SPEC-PILOT-VISUAL-001의 기존 3항목 pathname 규칙을 깨뜨림 | M2 완료 시 SPEC-PILOT-VISUAL-001 AC-004에 해당하는 기존 테스트를 재실행해 회귀 없음을 확인 |
| M6(신규 read-only 조회)이 owner-scope 신뢰 경계를 잘못 구현해 다른 사용자의 사건이 노출됨 | `getCaseForOwner`와 동일한 세션 기반 필터링 패턴을 그대로 복사·재사용, 단위 테스트로 타 owner 사건이 결과에 포함되지 않음을 검증 |
| M7(공통 예외 화면 일반화)이 기존 `case-error-retry`/404 변형 동작을 회귀시킴 | 리팩터링 직후 `error.test.tsx` 즉시 재실행, `reset()` 호출 동작 재검증 |
| M8(반응형)이 데스크톱 1440px/1280px 레이아웃을 깨뜨림 | 태블릿/모바일 CSS를 `min-width` 방향 미디어 쿼리로 격리해 데스크톱 스타일이 기본값으로 유지되도록 구현, M8 완료 시 4개 브레이크포인트(390/1024/1280/1440) 순차 수동 확인 |
| Enum 한글 라벨 매핑(M3)이 기존 테스트가 참조하는 영문 값 비교 assertion을 깨뜨림 | 매핑은 렌더링 레이어에서만 적용하고 내부 데이터 값(영문 enum)은 변경하지 않음 — 테스트가 `data-status`/`data-*` 속성이 아닌 화면 텍스트를 assertion하는 경우에만 갱신 필요, research.md §8에서 사전 확인 |

## §F. 열린 판단 (구현 시점 결정, `[NEEDS CLARIFICATION]` 아님 — 재량 범위 명시)

- **F1**: 공통 예외 화면(REQ-015)의 공유 컴포넌트 이름/파일 위치(`components/`, `app/cases/` 하위 등)는 run-phase 구현 재량. 기존 프로젝트 컨벤션(`components/ui/`, `components/evidence-item.tsx` 등)을 참고해 일관되게 배치.
- **F2**: Enum 한글 라벨 매핑을 공유 유틸 모듈로 추출할지, 각 파일에 인라인할지는 §B 결정 7에 따라 재량. 3개 이상 파일에서 재사용되므로 공유 모듈을 권장하나 강제하지 않는다.
- **F3**: 사이드바 신규 비활성 2항목의 아이콘 선택은 Pencil 디자인의 시각적 대응 아이콘을 참고하되, `lucide-react`(기존 설치 아이콘 라이브러리) 내에서 근접한 아이콘으로 대체 가능.

## §G. Cross-references

- spec.md §2 REQ-001~024 — 이 계획이 구현하는 요구사항
- design.md §1~5 — 이 계획의 각 마일스톤이 참조하는 정확한 시각 스펙
- research.md §1~8 — M1~M8이 보존해야 할 기준선 및 REQ-011/013의 스코프 축소 근거
- acceptance.md — 각 마일스톤 완료 판정 기준(Given-When-Then)
