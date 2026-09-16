# SPEC-SIDEBAR-NAV-001 — acceptance.md

Verification layer. Every entry is `AC-XXX`, Given-When-Then, binary-testable. Cross-referenced against spec.md §2 REQ-001~007.

## §1. AC Matrix

### Group A — 시각적 구분 (REQ-001~002)

**AC-001**: Given `/cases/case-1`을 렌더링한 상태, When 사이드바의 "전문가 피드백" nav 항목을 검사하면, Then 그 항목은 `CornerDownRight` 아이콘(lucide-react)의 svg를 포함해야 하며, `MessageSquare` 아이콘의 svg는 포함하지 않아야 한다.

**AC-002**: Given `/cases/new` 또는 `/cases/case-1`을 렌더링한 상태, When "사건 입력"(`CircleHelp`)·"리서치 리포트"(`FileText`) 두 항목과 `sidebar-nav-archive`(`Archive`)·`sidebar-nav-precedent-db`(`Library`) 두 항목의 아이콘을 확인하면, Then 이 SPEC 이전과 동일한 아이콘이 렌더링되어야 한다(변경 없음).

### Group B — 접근성 라벨 (REQ-003~004)

**AC-003**: Given `/cases/case-1`(`currentCaseId` 존재)을 렌더링한 상태, When "전문가 피드백" `<a>` 요소의 속성을 확인하면, Then 그 요소는 새 페이지 이동이 아닌 현재 페이지 내 이동임을 명시하는 `aria-label` 속성을 가져야 한다.

**AC-004**: Given `/cases/new`(`currentCaseId` 부재)를 렌더링한 상태, When "전문가 피드백" 비활성 `<span aria-disabled="true">` 요소의 속성을 확인하면, Then 그 요소는 AC-003이 요구하는 `aria-label` 속성을 갖지 않아야 한다(비활성 분기는 이 SPEC의 대상이 아님).

### Group C — 기능·동작 보존 (REQ-005~006)

**AC-005**: Given `/cases/case-1`을 렌더링한 상태, When "전문가 피드백" 링크의 `href` 속성을 확인하면, Then 값은 정확히 `/cases/case-1#expert-feedback`이어야 한다(이 SPEC 이전과 동일).

**AC-006**: Given 모바일 드로어가 열린 상태(`app-shell-chrome.test.tsx` 기존 시나리오), When "전문가 피드백" 링크를 클릭하면, Then 드로어가 닫혀야 한다(`onNavigate` 콜백 회귀 없음).

**AC-007**: Given `case-shell-nav.tsx`와 `case-shell-topbar.tsx`의 전체 소스, When URL 해시(`window.location.hash`) 감지 로직 또는 `IntersectionObserver` 사용 여부를 `grep`으로 확인하면, Then 어떤 매치도 없어야 한다(REQ-006 — 이 SPEC이 그런 로직을 도입하지 않았음을 확인).

### Group D — 테스트 계약 (REQ-007)

**AC-008**: Given 이 SPEC 구현 완료 후의 작업 트리, When `pnpm test`를 실행하면, Then 종료 코드는 0이어야 하며 `case-shell-nav.test.tsx`의 기존 5개 케이스와 이 SPEC이 신설한 3개 신규 케이스(AC-001, AC-003, AC-004에 대응)가 모두 통과해야 한다.

## §2. Edge Cases

- **아이콘 라이브러리 버전 고정**: `package.json`의 `lucide-react` 버전(`^1.33.0`)이 이 SPEC 구현으로 변경되지 않아야 한다 — 이미 설치된 버전에 `CornerDownRight`가 포함되어 있음을 사전 확인했으므로 `pnpm install` 재실행이 버전을 바꾸지 않아야 한다.
- **동일 페이지 반복 클릭**: 사용자가 이미 `#expert-feedback` 앵커로 스크롤된 상태에서 "전문가 피드백"을 다시 클릭해도 에러 없이 동일 위치로 스크롤(또는 no-op)되어야 한다 — 기존 Next.js `Link` 해시 이동 동작을 그대로 사용하므로 이 SPEC이 새로운 실패 모드를 도입하지 않는다.
- **`aria-label`과 시각 라벨의 불일치 없음**: `aria-label`이 시각적으로 보이는 "전문가 피드백" 텍스트를 완전히 대체하지 않고 보완하는 형태여야 하며(스크린 리더가 "전문가 피드백"이라는 단어 자체를 여전히 전달해야 함), 시각 라벨과 완전히 무관한 텍스트가 되어서는 안 된다.

## §3. Quality Gate Criteria

- `pnpm test` 종료 코드 0
- `pnpm lint` 종료 코드 0(이 SPEC이 신규로 도입하는 lint 위반 0건)
- `pnpm build` 종료 코드 0
- `git diff`로 확인한 변경 파일이 정확히 `app/cases/case-shell-nav.tsx`, `app/cases/case-shell-nav.test.tsx` 2개 파일(+ `.moai/specs/SPEC-SIDEBAR-NAV-001/**`)로 한정됨

## §4. Definition of Done

- [ ] REQ-001~007 전부 PASS(AC-001~AC-008 전부 통과)
- [ ] 기존 `case-shell-nav.test.tsx` 5개 케이스 + `app-shell-chrome.test.tsx` 드로어 닫힘 케이스 회귀 없음
- [ ] `pnpm test`/`pnpm lint`/`pnpm build` 전부 종료 코드 0
- [ ] "사건 입력"/"리서치 리포트"/`ComingSoonNavLink` 2항목에 diff 없음(git diff로 확인)
- [ ] 신규 npm 의존성 추가 없음(`package.json`/`pnpm-lock.yaml` diff 없음)
