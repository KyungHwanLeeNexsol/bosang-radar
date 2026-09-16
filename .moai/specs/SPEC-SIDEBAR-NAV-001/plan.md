# SPEC-SIDEBAR-NAV-001 — plan.md

## §A. Context

- 작업 위치: 프로젝트 루트, 기존 `main` 기반. 별도 브랜치 생성 없음(현재 브랜치 `main`에 직접 커밋).
- Tier: M(3개 아티팩트: spec.md + plan.md + acceptance.md — `progress.md`는 모든 Tier에서 별도로 생성되며 이 3개 아티팩트 개수에는 포함되지 않는다)
- 선행 SPEC: SPEC-PILOT-VISUAL-001(nav 3항목 pathname 전용 규칙·`#expert-feedback` 앵커 설계를 최초 확정, `status: completed` 직접 확인), SPEC-UI-MIGRATION-001(nav 2항목 추가·아이콘 도입·Topbar 타이틀 고정 규칙 확정, `status: completed` 직접 확인) — `depends_on: [SPEC-PILOT-VISUAL-001, SPEC-UI-MIGRATION-001]`로 명시. 이 SPEC은 두 선행 SPEC이 이미 만든 5항목 구조를 대체하지 않고, "전문가 피드백" 1개 항목의 아이콘·`aria-label`만 확장한다.
- **depends_on 상태 — 충족 확인됨**: 두 SPEC 모두 frontmatter `status: completed`를 직접 읽어 확인했다(`/moai run` 진입 시 Phase 1 sub-step 0 Depends_on Pre-flight Check는 정상 PASS하며 `--ignore-deps`는 불필요).
- 이 SPEC은 UI-surface heuristic(명시적 프론트엔드 컴포넌트 변경)을 충족하나, 변경 규모가 기존 컴포넌트의 아이콘 1개 교체 + 속성 1개 추가로 극히 작아 별도 `manager-design` D1-D5 파이프라인 실행은 필요하지 않다고 판단한다(design.md 없음, Tier M 3-아티팩트 세트로 충분).
- PRESERVE 대상(§D 참고): `case-shell-nav.tsx` 내 "사건 입력"/"리서치 리포트" 실 항목 2개, `ComingSoonNavLink` 비활성 항목 2개, `resolveCurrentCaseId` 함수, `NavLink`의 `href`/`active`/`disabled`/`onNavigate` 파라미터 계약 자체.
- 신규 파일 없음 — 기존 2개 파일(`case-shell-nav.tsx`, `case-shell-nav.test.tsx`)만 수정한다.

## §B. Key Decisions (결정-가역성 순 — 변경 가능성 높은 것부터)

1. **사이드바 위치 유지 vs 제거/이동 결정 (가장 되돌리기 어려움 — 사용자 접근 경로에 직접 영향)**: "전문가 피드백"을 사이드바에서 제거하거나 리포트 내부 탭/링크로 옮기는 대안을 검토했다. `feedback-form.tsx`가 5개 번호 매김 섹션 + 우측 레일을 가진 상당한 규모의 기능임을 확인했고, `feedback-form.tsx` Round5 HISTORY에서 이미 "전용 Topbar 미도입 — 기존 앵커 구조 유지"가 사용자 승인 하에 확정된 전례가 있다. 따라서 사이드바를 통한 지속적 접근성(discoverability)을 유지하는 편이 이동/제거보다 낫다고 판단해 **위치 유지**를 채택한다. 대안(제거)은 사용자가 피드백 섹션에 도달할 경로를 사이드바 밖으로 밀어내 discoverability를 떨어뜨리므로 기각. 대안(리포트 내부 탭)은 `page.tsx`/`feedback-form.tsx`의 레이아웃 구조 변경을 요구해 이 SPEC의 최소-변경 원칙과 충돌하므로 기각.
2. **시각적 구분 방식 결정 — 아이콘 교체 (active-state 추적 대안 기각)**: "인페이지 앵커임을 어떻게 표시할까"에 대해 두 방식을 비교했다: (a) 아이콘을 페이지형(`MessageSquare`)에서 인페이지 이동형(`CornerDownRight`)으로 교체, (b) URL 해시를 감지해 스크롤 시 `active` 강조를 표시. (a)는 `case-shell-nav.tsx` 한 줄 교체로 끝나는 반면, (b)는 `usePathname()`이 URL 프래그먼트를 포함하지 않는다는 기존 제약(`case-shell-topbar.test.tsx:8` 확인)으로 인해 `window.location.hash` 리스너 또는 `IntersectionObserver` 같은 신규 클라이언트 로직을 요구한다. Tier M 규모(< 300 LOC 지향)를 유지하기 위해 **(a) 아이콘 교체**만 채택하고 (b)는 §5 Out of Scope로 분리한다.
3. **`aria-label` 추가 범위 결정 — 활성 링크 분기에만 적용**: `NavLink`는 활성(`<Link>`)과 비활성(`<span aria-disabled>`) 두 렌더링 분기를 가진다. 새 `aria-label`은 활성 분기에만 추가한다 — 비활성 분기는 이미 `aria-disabled="true"`로 상호작용 불가 상태를 전달하고 있어 추가 라벨이 불필요하며, 두 분기를 모두 건드리면 diff가 불필요하게 커진다. 이하 §C 마일스톤은 결정 재검토 우선순위가 낮은 기계적 실행 세부사항이다.

## §C. 마일스톤 (실행 순서 — 의존성 기반)

### M1 — 아이콘 교체 (REQ-001~002)

- `case-shell-nav.tsx` 상단 `lucide-react` import에 `CornerDownRight`를 추가하고 `MessageSquare`를 제거(다른 곳에서 미사용 확인 후)
- `navIcon.feedback`을 `<CornerDownRight aria-hidden="true" className="size-4" />`로 교체
- `navIcon.input`/`navIcon.report`와 `ComingSoonNavLink` 2항목의 아이콘은 무변경 확인(`git diff` 해당 라인 없음)

### M2 — `aria-label` 추가 (REQ-003~004)

- `NavLink` 컴포넌트에 옵션 `ariaLabel?: string` prop 추가(기존 `href`/`label`/`icon`/`active`/`disabled`/`onNavigate` 시그니처는 확장만, 제거·변경 없음)
- `SidebarNavItems`에서 "전문가 피드백" 활성 `<Link>` 렌더링 분기(`currentCaseId` 존재 시)에만 `ariaLabel="전문가 피드백 섹션으로 이동 (현재 페이지 내)"`를 전달
- 비활성 `<span>` 분기(`currentCaseId` 부재 시)에는 `ariaLabel`을 전달하지 않음 — 렌더 결과에 새 `aria-label` 속성이 생기지 않음을 확인

### M3 — 테스트 갱신 + 품질 게이트 (REQ-005~007)

- `case-shell-nav.test.tsx`에 §3 "신규 테스트" 3건 추가(아이콘 svg 클래스/`MessageSquare` 부재, 활성 링크 `aria-label`, 비활성 `<span>` `aria-label` 부재)
- 기존 5개 테스트 케이스를 무변경 실행해 회귀 없음을 확인
- `app-shell-chrome.test.tsx:317-328`(드로어 닫힘 케이스)를 재실행해 `onNavigate` 동작 회귀 없음을 확인
- `pnpm test`, `pnpm lint`, `pnpm build` 실행 및 통과 확인(REQ-007)

## §D. 제약 (DO NOT VIOLATE)

- `case-shell-nav.tsx`의 "사건 입력"/"리서치 리포트" 두 실 항목, `ComingSoonNavLink` 두 비활성 항목의 아이콘·라벨·동작 변경 금지
- `resolveCurrentCaseId` 함수, `href` 계산 로직, 실제 이동 대상(`/cases/${currentCaseId}#expert-feedback`), `onNavigate` 콜백 계약 변경 금지
- URL 해시 기반 active-state 추적 로직(신규 리스너, `IntersectionObserver`) 도입 금지(REQ-006, §5 Out of Scope)
- 신규 npm 패키지 설치 금지 — `lucide-react`는 이미 설치되어 있으며 `CornerDownRight`도 이미 배포판에 포함되어 있음을 확인했다
- 기존 testid(`sidebar-nav-archive`, `sidebar-nav-precedent-db` 등) 이름 변경 금지
- `--no-verify` 사용 금지, force-push 금지

## §E. 리스크

| 리스크 | 완화책 |
|--------|--------|
| `MessageSquare` import를 제거했으나 다른 파일/컴포넌트가 동일 import 문에서 재사용 중이었음을 놓침 | M1 완료 시 `grep -rn "MessageSquare" app/cases/case-shell-nav.tsx`로 잔존 참조가 없는지, 그리고 프로젝트 전체 `grep -rn "MessageSquare"`로 다른 파일이 이 파일에서 재-export하고 있지 않은지(단일 파일 내부 import이므로 위험 낮음) 확인 |
| M2에서 `ariaLabel` prop을 비활성 분기에도 실수로 전달해 REQ-004 위반 | 단위 테스트(§3 신규 테스트 3번째 항목)로 비활성 `<span>`에 `aria-label` 속성이 존재하지 않음을 명시적으로 assert |
| `case-shell-nav.test.tsx` 기존 5개 테스트가 아이콘 교체로 인해 우발적으로 깨짐(예: 아이콘 개수를 세는 assertion이 있는 경우) | M3 착수 전 기존 테스트 전문(94행)을 재확인해 아이콘 종류를 특정하는 assertion이 없음을 확인했다(현재는 `svg` 존재 여부만 확인) — 교체 후에도 `CornerDownRight`가 svg를 렌더링하므로 D1 테스트는 무변경 통과 |

## §F. 열린 판단 (구현 시점 결정)

- **F1**: `aria-label` 문구의 정확한 한국어 표현("전문가 피드백 섹션으로 이동 (현재 페이지 내)" 등)은 run-phase 구현 재량 — REQ-003의 의도(새 페이지가 아님을 스크린 리더 사용자에게 전달)를 만족하는 범위 내에서 자연스러운 한국어 표현으로 조정 가능.
