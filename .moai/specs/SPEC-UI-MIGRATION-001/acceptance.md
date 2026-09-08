# SPEC-UI-MIGRATION-001 — acceptance.md

Verification layer. Every entry is `AC-XXX`, Given-When-Then, binary-testable. Cross-referenced against spec.md §2 REQ-001~024. Letter-suffixed sub-entries (`AC-XXXa`, `AC-XXXb`, ...) pair sub-criteria within one logical AC per the AC sub-ID convention.

## §1. AC Matrix

### Group A — 디자인 토큰 재사용 (REQ-001)

**AC-001**: Given `app/globals.css`를 연 상태, When 이 SPEC이 신규 추가한 토큰이 있는지 확인하면, Then 신규 토큰이 있는 경우 모두 `--color-bora-*` 또는 `--color-app-*` 네임스페이스를 따르며, SPEC-PILOT-VISUAL-001이 이미 추가한 기존 토큰의 이름·값은 단 하나도 변경되지 않아야 한다.

### Group B — 로그인 화면 재스타일 (REQ-002~003)

**AC-002**: Given `/login` 페이지를 렌더링한 상태, When DOM을 검사하면, Then 이메일 필드(`login-email`)·비밀번호 필드(`login-password`)·제출 버튼(`login-submit`)·오류 영역(`login-error`)·폼 컨테이너(`login-form`)가 모두 존재하고, `authClient.signIn.email` 호출 로직이 SPEC-PILOT-UX-001/PILOT-VISUAL-001 이전과 동일하게 동작해야 한다(잘못된 자격증명 시 `login-error`에 오류 메시지 표시).

**AC-002a**: Given 로그인 폼의 비밀번호 필드, When 표시/숨김 토글 버튼(`login-password-toggle`)을 클릭하면, Then 입력의 `type` 속성이 `"password"`↔`"text"`로 전환되어야 한다.

**AC-002b**: Given 로그인 폼의 비밀번호 표시/숨김 토글 버튼, When 접근성 속성을 확인하면, Then 접근 가능한 이름(`aria-label` 등)이 존재하고, Tab 키로 포커스 이동 및 Enter/Space 키로 활성화가 가능해야 한다(마우스 전용 아님).

**AC-002c**: Given 비밀번호 토글을 여러 번 클릭한 상태, When 폼을 제출하면, Then 제출되는 비밀번호 값은 토글 클릭 여부와 무관하게 사용자가 입력한 원본 값과 동일해야 한다.

**AC-002d**: Given `/login` 페이지, When 푸터 링크 영역을 확인하면, Then 이용약관/개인정보처리방침/고객지원 3개 링크는 `href` 속성이 없는 비활성 텍스트(`aria-disabled="true"`)로 렌더링되어야 하고, "랜딩으로 돌아가기" 링크만 `/`를 가리키는 실제 활성 링크(`<a href="/">` 또는 Next `Link`)여야 한다.

**AC-003**: Given `git diff`로 이 SPEC의 전체 변경 파일 목록을 확인한 상태, When `app/layout.tsx`, `app/page.tsx`의 diff를 개별 확인하면, Then 두 대상 모두 diff가 완전히 비어 있어야 한다. And When `app/login/**` 트리를 렌더링한 상태에서 본문 텍스트의 계산된 `font-family`를 확인하면, Then Pretendard(또는 그 fallback 체인)가 적용되어야 하며, 이 폰트 로딩이 `app/login/layout.tsx` 내부에서만 이루어졌음을 소스 확인으로 검증한다.

### Group C — App Shell 확장 (REQ-004~006)

**AC-004**: Given `/cases/new` 또는 `/cases/[caseId]`를 렌더링한 상태, When 사이드바 nav 항목을 세면, Then 정확히 5개이며(사건 입력/리서치 리포트/전문가 피드백 + 리포트 보관함/판례·약관 자료실), 신규 2개 항목(`sidebar-nav-archive`, `sidebar-nav-precedent-db`)은 `href` 속성이 없고 `aria-disabled="true"`이며 "준비 중" Chip을 시각적으로 포함해야 한다. And 기존 3개 항목의 pathname 전용 링크 규칙(SPEC-PILOT-VISUAL-001 AC-004)이 회귀 없이 동일하게 동작해야 한다.

**AC-005**: Given 로그인한 세션으로 App Shell을 렌더링한 상태, When 사이드바 하단 사용자 블록을 확인하면, Then "담당 손해사정사"/"BORA 리서치" 같은 하드코딩 문자열이 아니라 현재 세션 `user.name` 값이 표시되어야 하며, DB에 존재하지 않는 소속/직함 필드가 새로 렌더링되지 않아야 한다.

**AC-005a**: Given 사이드바 사용자 블록을 렌더링하는 컴포넌트, When 그 컴포넌트가 세션을 조회하는 방식을 소스로 확인하면, Then `app/cases/layout.tsx`(서버 컴포넌트) 자신은 `getCurrentSession()` 등 동적 API를 직접 호출하지 않아야 하며, 조회는 별도의 클라이언트 컴포넌트로 분리되어 있어야 한다. And Given `/cases/new`의 서버 페이지 컴포넌트(`NewCasePage`)가 세션을 조회하는 방식을 소스로 확인한 상태, When 그 컴포넌트의 세션 조회 지점을 확인하면, Then 세션 확인은 `NewCasePage` 자신(페이지 최상위, `getCurrentSession()` 호출)에서 수행되어야 한다(신규 API 라우트 없음). And When `pnpm build`를 실행하면, Then 빌드가 종료 코드 0으로 성공해야 하고, 빌드 로그가 `/cases/new`를 Dynamic(요청 시점 렌더링) 세그먼트로 표시해야 하며(REQ-013의 서버측 세션 확인으로 인한 의도된 전환 — "정적 생성 유지"는 더 이상 이 SPEC의 요구사항이 아니다), 빌드 프로세스 자체는 실제 DB 연결을 시도하지 않아야 한다(사용자별 데이터가 빌드 시점에 평가되거나 정적 HTML에 구워지지 않음).

**AC-005b**: Given 세션이 아직 로딩 중이거나 로그아웃 상태인 경우, When 사이드바 사용자 블록을 렌더링하면, Then 크래시하지 않고 정의된 중립 폴백(예: 이니셜 아이콘 + "사용자")이 표시되어야 하며, 하드코딩된 가짜 이름이나 이전 사용자의 잔존 값이 표시되어서는 안 된다.

**AC-006**: Given App Shell 안의 임의 화면, When App Topbar를 확인하면, Then 브레드크럼 텍스트와 현재 화면에 대응하는 페이지 타이틀이 표시되어야 하며, 스크롤 시 탑바가 뷰포트에 고정되지 않고 본문과 함께 스크롤되어야 한다(computed style에 `position: fixed`/`sticky`가 없음을 확인).

**AC-006a**: Given `/cases/new`와 `/cases/[caseId]`(URL에 `#expert-feedback` 프래그먼트가 있는 경우와 없는 경우 각각) 화면을 렌더링한 상태, When Topbar 브레드크럼/타이틀 텍스트를 확인하면, Then `/cases/new`는 브레드크럼 "작업 공간 / 사건 입력"과 타이틀 "신규 사건 리서치 요청"을 표시해야 하고, `/cases/[caseId]`는 URL에 `#expert-feedback`이 포함되어 있는지 여부와 무관하게 항상 브레드크럼 "작업 공간 / 리서치 리포트"와 타이틀 "리서치 리포트"를 표시해야 한다(전문가 피드백은 별도 화면이 아닌 인페이지 앵커이므로 프래그먼트 존재가 Topbar 상태를 변경해서는 안 된다). [Round3: WORKSPACE → 작업 공간, "사건 입력" 타이틀 → "신규 사건 리서치 요청" — case-shell-topbar.tsx 실제 구현 정합]

### Group D — Enum 한글 라벨 (REQ-007~008)

**AC-007**: Given 근거자료 유형이 노출되는 임의 화면(리포트/피드백), When 렌더링된 텍스트를 확인하면, Then "PRECEDENT"/"POLICY"/"STATUTE"/"DISPUTE_CASE"/"OTHER" 같은 영문 raw 값이 화면 텍스트로 노출되지 않고, 각각 판례/약관/법령/분쟁조정례/기타로 표시되어야 한다. And 내부 `data-*` 속성 값(예: `data-status`)은 영문 enum 값을 그대로 유지해야 한다(기존 테스트 회귀 방지).

**AC-008**: Given 쟁점 유형(QueryIssueType)이 노출되는 임의 화면, When 렌더링된 텍스트를 확인하면, Then 8종 영문 raw 값이 화면 텍스트로 노출되지 않고, spec.md REQ-008이 정의한 8개 한글 라벨 중 해당하는 값으로 표시되어야 한다.

### Group E — 비확정성 안내 문구 (REQ-009~010)

**AC-009**: Given 리포트가 존재하는 사건 상세 페이지의 Aggregate Status 패널, When 텍스트를 검색하면, Then spec.md REQ-009에 정의된 문구가 정확히(글자 단위로) 존재해야 한다.

**AC-010**: Given "검토할 담보"(`review-targets`) 패널, When 텍스트를 검색하면, Then spec.md REQ-010에 정의된 문구가 정확히 존재해야 한다.

### Group F — Claim 카드 정합성 (REQ-011)

**AC-011**: Given `status: "INSUFFICIENT"`인 claim이 1개 이상 존재하는 리포트, When 해당 claim 카드를 확인하면, Then "추가 확인 필요" 안내가 존재하고, 리포트 레벨 `missingMaterials`/`uncertainty` 섹션(기존 `missing-materials`/`uncertainty` testid)으로 이동하는 앵커 링크를 항상 포함해야 한다.

**AC-011a**: Given 어떤 `missingMaterial.relatedIssueType`이 특정 INSUFFICIENT claim의 기존 `getClaimIssueTypes()` 파생 결과 집합에 포함되는 경우, When 그 claim 카드를 확인하면, Then 해당 `missingMaterial` 항목이 카드 내부에 직접 나열되어야 한다.

**AC-011b**: Given 어떤 `missingMaterial.relatedIssueType`도 특정 INSUFFICIENT claim의 `getClaimIssueTypes()` 결과와 일치하지 않는 경우, When 그 claim 카드를 확인하면, Then 카드는 앵커 링크만 표시해야 하며 리포트 레벨의 무관한 `missingMaterial` 항목을 임의로 나열해서는 안 된다.

**AC-011c**: Given `git diff lib/pipeline/types.ts`를 실행한 상태, When `VerifiedClaim`/`MissingMaterial` 인터페이스 부분을 확인하면, Then diff가 완전히 비어 있어야 한다(REQ-011이 명시하는 신규 필드 미도입 확인).

### Group G — 사건 입력 우측 레일 확장 (REQ-012~014)

**AC-012**: Given `/cases/new`의 우측 레일, When "분석 상태" 패널을 확인하면, Then 4단계 텍스트(쟁점 자동 추출/판례·결정례 검색/약관·법령 대조/근거 검증 및 반대 논리 생성)가 정적으로 존재하고, 각 단계에 대해 개별 완료/진행 상태 표시(체크마크, 진행률 바 등 단계별 동적 UI)가 존재하지 않아야 한다.

**AC-013**: Given 로그인 사용자가 3건 이상의 기존 사건을 소유한 상태, When `/cases/new`의 "최근 리서치" 패널(`case-recent-research`)을 확인하면, Then 최대 3건(`case-recent-research-item`)이 `createdAt` 내림차순으로 표시되어야 한다.

**AC-013a**: Given "최근 리서치" 패널의 개별 항목, When 표시되는 필드를 확인하면, Then 사건 번호는 `cases.id`, 제목은 `input.diagnosisName`, 보조 정보는 `input.disabilityBodyPart`, 상태는 `cases.status`의 한글 번역 라벨과 정확히 일치해야 한다.

**AC-013b**: Given 이 조회에서 발생하는 쿼리, When 다른 owner의 사건으로 로그인해 재확인하면, Then 현재 세션 사용자가 소유하지 않은 사건이 결과에 포함되지 않아야 한다(owner-scope 단위 테스트 필수).

**AC-013c**: Given `input` JSON에 `diagnosisName` 또는 `disabilityBodyPart` 필드가 누락된 사건 행이 존재하는 상태, When "최근 리서치" 패널을 렌더링하면, Then 해당 항목은 정의된 폴백 텍스트로 표시되어야 하며 예외가 발생하거나 패널 전체가 렌더링되지 않는 일이 없어야 한다.

**AC-013d**: Given 인증된 세션이 없는 상태, When `/cases/new`에 접근하면, Then 이 화면은 다른 App Shell 보호 라우트(예: `/cases/[caseId]`)와 동일한 기존 인증-리다이렉트 흐름(`redirect("/login")`)을 따라야 하며, 이 SPEC이 신규로 도입하는 별개의 인증 처리 패턴이 존재해서는 안 된다.

**AC-013e**: Given "최근 리서치" 조회 함수가 예외를 던지거나 실패하는 상태, When `/cases/new`를 렌더링하면, Then "최근 리서치" 패널(`case-recent-research`)만 안전한 빈/오류 상태로 대체되어야 하며, 사건 입력 폼의 좌측 컬럼(필드/제출 버튼)을 포함한 페이지의 나머지 부분은 정상적으로 렌더링되고 상호작용 가능해야 한다(페이지 전체 크래시 금지).

**AC-014**: Given 사건 입력 폼 Footer, When 버튼 목록을 확인하면, Then "임시 저장" 버튼(`case-input-draft-save`)이 `disabled` 속성과 "준비 중" 시각 Chip을 가진 채로 존재해야 하며, 클릭해도 어떤 네트워크 요청도 발생하지 않아야 한다.

### Group H — 실재하는 예외 화면 (REQ-015)

**AC-015**: Given 존재하지 않는 임의 URL(예: `/foobar`)로 접근한 상태, When 렌더링된 화면을 확인하면, Then `app/not-found.tsx`가 렌더링되고 `global-not-found` testid가 존재해야 하며, App Shell(사이드바/Topbar)이 렌더링되지 않아야 한다(루트 레이아웃만 적용).

**AC-015a**: Given (a) 존재하지 않는 `caseId`로 `/cases/[caseId]`에 접근한 경우와 (b) 다른 사용자가 소유한 실제 존재하는 `caseId`로 접근한 경우 각각, When 렌더링된 화면을 확인하면, Then 두 경우 모두 동일하게 `app/cases/[caseId]/not-found.tsx`가 렌더링되고 `case-not-found` testid가 존재해야 하며, App Shell(사이드바/Topbar)이 렌더링되어야 한다(레이아웃 자동 중첩). And 두 경우의 화면 텍스트/구조는 완전히 동일해야 하며, 사용자가 (a)와 (b)를 구분할 수 있는 어떤 단서(예: "권한 없음"이라는 별도 문구)도 존재해서는 안 된다(정보 은닉).

**AC-015b**: Given `app/cases/[caseId]/error.tsx`(런타임 오류 경계), When 강제로 예외를 발생시킨 뒤 `case-error-retry` 버튼을 클릭하면, Then `reset()`이 호출되어야 하며, 이 화면과 동작은 SPEC-PILOT-VISUAL-001 이전과 회귀 없이 동일해야 한다(REQ-015 범위에서 이 파일은 최소 검증만 수행하며 리팩터링되지 않았음을 `git diff`로 함께 확인한다).

### Group I — 반응형 (REQ-016~018)

**AC-016**: Given 브라우저 뷰포트 너비를 1024px로 설정한 상태에서 App Shell을 사용하는 화면을 렌더링하면, When 레이아웃을 확인하면, Then 사이드바는 고정 폭을 유지하고, 우측 레일이 존재하는 화면에서는 우측 레일이 본문 아래로 이동한 세로 배치로 렌더링되어야 한다.

**AC-017**: Given 브라우저 뷰포트 너비를 390px로 설정한 상태, When 초기 렌더링을 확인하면, Then 사이드바가 기본적으로 숨겨져 있고 탑바에 햄버거 버튼(`mobile-nav-toggle`)이 존재해야 한다.

**AC-017a**: Given 390px 뷰포트, When 햄버거 버튼(`mobile-nav-toggle`)을 클릭하면, Then 드로어(`mobile-nav-drawer`)가 어두운 스크림(`mobile-nav-scrim`)과 함께 슬라이드인으로 나타나야 한다.

**AC-017b**: Given 드로어가 열린 상태, When 드로어 내부의 닫기 버튼을 클릭하면, Then 드로어와 스크림이 모두 사라져야 한다.

**AC-017c**: Given 드로어가 열린 상태, When ESC 키를 누르면, Then 드로어가 닫혀야 한다.

**AC-017d**: Given 드로어가 열린 상태, When 스크림(`mobile-nav-scrim`)을 클릭하면, Then 드로어가 닫혀야 한다.

**AC-017e**: Given 드로어를 여는 시점과 닫는 시점, When 포커스 위치를 확인하면, Then 열릴 때 포커스가 드로어 내부(첫 포커스 가능 요소 또는 드로어 컨테이너)로 이동하고, 닫힐 때 포커스가 햄버거 버튼으로 복귀해야 한다.

**AC-017f**: Given 드로어가 열려 있는 동안, When 배경 콘텐츠를 스크롤 시도하면, Then 스크롤이 발생하지 않아야 한다(스크롤 잠금).

**AC-017g**: Given 드로어가 닫혀 있는 상태, When Tab 키로 포커스를 순회하면, Then 드로어 내부의 링크/버튼이 tab 순서에 포함되지 않아야 한다.

**AC-017h**: Given 390px에서 드로어가 열린 상태, When 뷰포트를 1024px 이상으로 리사이즈하면, Then 드로어/스크림이 자동으로 닫히고 데스크톱 사이드바 레이아웃으로 정상 전환되어야 한다(고정 열림 상태로 남지 않음).

**AC-017i**: Given 드로어가 열린 상태, When 드로어 내부의 마지막 포커스 가능 요소에서 Tab 키를 누르면, Then 포커스가 드로어 내부의 첫 번째 포커스 가능 요소로 순환해야 한다(닫힌 루프) — 드로어 밖 배경 콘텐츠의 요소로 포커스가 이동해서는 안 된다.

**AC-017j**: Given 드로어가 열린 상태, When 드로어 내부의 첫 번째 포커스 가능 요소에서 Shift+Tab 키를 누르면, Then 포커스가 드로어 내부의 마지막 포커스 가능 요소로 순환해야 한다(역방향 닫힌 루프).

**AC-017k**: Given 드로어가 열린 상태, When 배경 콘텐츠(드로어 외부의 페이지 본문) 요소에 포커스를 프로그래밍적으로 이동시키거나 클릭/키보드 상호작용을 시도하면, Then 그 요소는 포커스를 받지 않거나 상호작용이 무시되어야 한다(예: `inert` 속성 또는 동등한 메커니즘으로 배경이 비활성화됨을 확인).

**AC-017l**: Given 드로어 접근성 계약을 검증하는 자동화 테스트, When 구현이 기존 Dialog 프리미티브(`@base-ui/react` 등)를 재사용하는 경우, Then 테스트는 그 프리미티브의 존재 여부만으로 통과 처리해서는 안 되며 AC-017i~AC-017k가 기술하는 실제 동작(포커스 순환, 배경 비활성화)을 직접 관찰해 검증해야 한다.

**AC-018**: Given 브라우저 뷰포트 너비를 1280px로 설정한 상태에서 5개 화면(로그인/사건 입력/리포트/피드백/이 SPEC이 다루는 실재하는 예외 화면 중 택1)을 각각 렌더링하면, When 레이아웃을 수동 검사하면, Then 가로 오버플로, 사이드바-콘텐츠 겹침, 텍스트/컨트롤 잘림, 클릭 불가 겹침이 어느 화면에서도 발생하지 않아야 한다.

### Group J — 기능·데이터 보존 및 품질 게이트 (REQ-019~024)

**AC-019**: Given `lib/db/schema.ts`, `lib/validation/case-input.ts`, `lib/feedback/schema.ts`, `lib/cases/create-case.ts`, `lib/feedback/submit-feedback.ts`, `lib/pipeline/**`, `lib/ai/**`, `db/**`, 모든 마이그레이션, `app/layout.tsx`의 이 SPEC 시작 시점 대비 diff, When `git diff <base>...HEAD -- <위 경로들>`를 실행하면, Then 출력이 완전히 비어 있어야 한다(REQ-019, REQ-003과 부분 중복 확인).

**AC-020**: Given spec.md §3(보존 대상 목록)에 열거된 모든 기존 `data-testid` 값, When 각 값을 `grep -rn '"<testid-값>"' app/` 등으로 코드베이스 전체에서 검색하면, Then 열거된 모든 testid가 정확히 동일한 문자열로 여전히 존재해야 한다(REQ-020).

**AC-021**: Given 사이드바의 신규 2개 nav 항목, When 페이지 소스와 라우트 정의를 확인하면, Then "리포트 보관함"/"판례·약관 DB"에 대응하는 실제 페이지, 라우트 파일, API 엔드포인트가 존재하지 않아야 한다(REQ-021).

**AC-022**: Given 사건 입력 폼 제출 중(pending) 상태 및 피드백 폼 제출 중 상태, When 동일 폼을 다시 제출 시도하면(더블클릭 시뮬레이션), Then 두 번째 요청이 발생하지 않아야 한다(단일 흐름 가드 유지, REQ-022).

**AC-023**: Given 재스타일되었거나 신규 추가된 임의의 인터랙티브 요소, When 접근성 속성을 확인하면, Then label 연관, `role="status"`/`aria-live`(대기 인디케이터), focus 가능 여부가 기존과 동일하게 유지되고, 신규 비활성 nav/링크 항목에는 `aria-disabled="true"`가 존재해야 하며, 모바일 드로어는 AC-017a~AC-017l(포커스 트랩/배경 비활성화 포함)을 모두 만족해야 한다(REQ-023).

**AC-024**: Given 이 SPEC의 구현이 완료된 상태, When `pnpm test`, `pnpm test:e2e`, `pnpm lint`, `pnpm build`을 각각 실행하면, Then 모두 종료 코드 0을 반환해야 한다. And `pnpm format:check` 실행 결과를 기존 베이스라인 경고와 대조하면, Then 이 SPEC이 신규로 도입한 포맷 위반이 0건이어야 한다(REQ-024).

## §2. Edge Cases

- 로그인 사용자가 소유한 사건이 0건인 경우, "최근 리서치" 패널(`case-recent-research`)은 빈 상태(빈 리스트 또는 안내 텍스트)를 렌더링해야 하며, 오류를 던지거나 패널 자체가 비정상적으로 사라져서는 안 된다.
- claim에 대응하는 `missingMaterials`/`uncertainty`가 모두 0건인 INSUFFICIENT claim의 경우, "추가 확인 필요" 안내는 앵커 링크만 표시하는 빈 상태를 우아하게 처리해야 한다(빈 배열 렌더링으로 인한 레이아웃 깨짐 없음).
- 모바일(390px) 드로어가 열린 상태에서 뷰포트를 1024px 이상으로 리사이즈하면, 드로어/스크림이 자동으로 해제되고 데스크톱 사이드바 레이아웃으로 정상 전환되어야 한다(AC-017h와 동일 시나리오).
- 존재하지 않는 사건 ID로 접근한 경우와 다른 사용자가 소유한 사건 ID로 접근한 경우 모두, 렌더링되는 화면(`case-not-found`)과 그 텍스트/구조가 완전히 동일해야 하며, 사용자가 이 두 경우를 시각적으로 구분할 수 있는 어떤 단서도 제공되어서는 안 된다(AC-015a와 동일 원칙 — 정보 은닉).
- "최근 리서치" 패널의 항목 중 `input` JSON 필드가 부분적으로 누락된 사건이 섞여 있는 경우, 정상 항목과 폴백 텍스트 항목이 같은 목록 안에서 함께 렌더링되어야 하며 목록 전체가 실패해서는 안 된다.

## §3. 시각 스모크 체크리스트 (수동, 각 화면 1회 — Pencil 라이브 파일 대조)

- [ ] 로그인 화면: design.md §4(로그인) 구조와 브랜드 패널·필드·비밀번호 토글·비활성 푸터 링크가 육안으로 대응하는가
- [ ] App Shell 사이드바: 5개 nav 항목(3개 실제 + 2개 비활성)과 사용자 블록(로그인 상태/로딩 상태 각각)이 Pencil 스펙과 육안으로 대응하는가
- [ ] App Topbar: `/cases/new`(브레드크럼 "작업 공간 / 사건 입력" · 타이틀 "신규 사건 리서치 요청")와 `/cases/[caseId]`(브레드크럼 "작업 공간 / 리서치 리포트" · 타이틀 "리서치 리포트", `#expert-feedback` 프래그먼트 유무와 무관하게 고정)가 spec.md REQ-006의 정확한 매핑대로 렌더링되는가
- [ ] 실재하는 예외 화면 3종(전역 404 / 사건-없음·미소유 통합 / 기존 일시 런타임 오류): 각각의 아이콘·문구·에러코드 패턴이 Pencil 프레임 `11`의 대응 변형과 육안으로 정합하며, App Shell 유무(전역 404만 미적용)가 의도대로 렌더링되는가
- [ ] 태블릿(1024px)/모바일(390px): 사이드바 유지+우측 레일 이동, 오프캔버스 드로어+스크림(열기/닫기/ESC/스크림클릭 각각)이 육안으로 확인되는가
- [ ] 6개 화면(로그인/사건 입력/리포트/피드백/예외 화면/App Shell 전반) 모두 전문 손해사정사에게 보여줄 때 "미완성"으로 보이지 않는 B2B 완성도 수준인가

## §4. Definition of Done

> **2026-09-08 재분류 (correction pass)**: 아래 6개 항목은 Round 5까지의 누적 실측(§E.2 M1~M8, Round 3/4/5 각 Gap Matrix, Round 5 최종 검증 §)을 근거로 체크한다. 3건의 잔여 논쟁 항목(로그인 우측 폼 간격/모바일 리포트·피드백 IA 분리/Pencil 모바일 프레임 동일폭 비교)의 재분류 근거는 `progress.md` "Round 5 — 3건 재분류 (correction pass)" 섹션 참조 — 요약: 항목1은 구현 완료, 항목2는 애초에 이 acceptance.md의 어떤 AC에도 대응하지 않는 항목(사용자 승인된 편차 + 후속 SPEC 후보), 항목3은 Pencil 원본(`13-Mobile-390.png`)이 3-패널 합성이라 방법론적으로 성립하지 않는 비교였고 개별 실화면 캡처로 대체 검증됨(낮은 잔여 위험으로 기록, DoD를 막지 않음).

- [x] §1에 나열된 모든 최상위 AC(AC-001~AC-024, 24개 라벨) 및 모든 letter-suffixed sub-AC 전부 PASS
- [x] §2 Edge Cases 전부 확인
- [x] §3 시각 스모크 체크리스트 전부 확인
- [x] `git diff`로 §D(plan.md) PRESERVE 목록의 파일들이 완전히 미변경임을 확인(AC-019와 중복 확인)
- [x] spec.md §3(보존 대상 목록)의 모든 testid가 grep으로 코드베이스에 여전히 존재함을 확인(AC-020과 중복 확인)
- [x] spec.md §3(신규 도입 testid 목록)의 모든 신규 testid가 정확한 이름으로 존재함을 확인(`error.tsx`는 신규 testid를 도입하지 않고 기존 `case-error-retry`만 재검증함에 유의)

## §5. Cross-references

- spec.md §2 REQ-001~024 — 각 AC가 검증하는 요구사항
- design.md §1~5 — AC-001~AC-006, AC-015~AC-018이 참조하는 정확한 시각 스펙
- research.md §2~§12 — AC-005a·AC-006a·AC-007~AC-014·AC-015~AC-015b·AC-017i~AC-017l·AC-019~AC-023이 재검증하는 기존 구현 기준선 및 스코프·결정 근거(§5b 세션 조회 안전성, §5c `/cases/new` 동적 렌더링 메커니즘, §7 정정된 예외 화면 baseline, §9 최근 리서치 파생 규칙, §10 드로어 접근성 자원)
