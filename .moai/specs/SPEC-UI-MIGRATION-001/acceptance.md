# SPEC-UI-MIGRATION-001 — acceptance.md

Verification layer. Every entry is `AC-XXX`, Given-When-Then, binary-testable. Cross-referenced against spec.md §2 REQ-001~024.

## §1. AC Matrix

### Group A — 디자인 토큰 재사용 (REQ-001)

**AC-001**: Given `app/globals.css`를 연 상태, When 이 SPEC이 신규 추가한 토큰이 있는지 확인하면, Then 신규 토큰이 있는 경우 모두 `--color-bora-*` 또는 `--color-app-*` 네임스페이스를 따르며, SPEC-PILOT-VISUAL-001이 이미 추가한 기존 토큰의 이름·값은 단 하나도 변경되지 않아야 한다.

### Group B — 로그인 화면 재스타일 (REQ-002~003)

**AC-002**: Given `/login` 페이지를 렌더링한 상태, When DOM을 검사하면, Then 이메일 필드(`login-email`)·비밀번호 필드(`login-password`)·제출 버튼(`login-submit`)·오류 영역(`login-error`)·폼 컨테이너(`login-form`)가 모두 존재하고, `authClient.signIn.email` 호출 로직이 SPEC-PILOT-UX-001/PILOT-VISUAL-001 이전과 동일하게 동작해야 한다(잘못된 자격증명 시 `login-error`에 오류 메시지 표시).

**AC-003**: Given `git diff`로 이 SPEC의 전체 변경 파일 목록을 확인한 상태, When `app/layout.tsx`, `app/page.tsx`의 diff를 개별 확인하면, Then 두 대상 모두 diff가 완전히 비어 있어야 한다. And When `app/login/**` 트리를 렌더링한 상태에서 본문 텍스트의 계산된 `font-family`를 확인하면, Then Pretendard(또는 그 fallback 체인)가 적용되어야 하며, 이 폰트 로딩이 `app/login/layout.tsx` 내부에서만 이루어졌음을 소스 확인으로 검증한다.

### Group C — App Shell 확장 (REQ-004~006)

**AC-004**: Given `/cases/new` 또는 `/cases/[caseId]`를 렌더링한 상태, When 사이드바 nav 항목을 세면, Then 정확히 5개이며(사건 입력/리서치 리포트/전문가 피드백 + 리포트 보관함/판례·약관 자료실), 신규 2개 항목(`sidebar-nav-archive`, `sidebar-nav-precedent-db`)은 `href` 속성이 없고 `aria-disabled="true"`이며 "준비 중" Chip을 시각적으로 포함해야 한다. And 기존 3개 항목의 pathname 전용 링크 규칙(SPEC-PILOT-VISUAL-001 AC-004)이 회귀 없이 동일하게 동작해야 한다.

**AC-005**: Given 로그인한 세션으로 App Shell을 렌더링한 상태, When 사이드바 하단 사용자 블록을 확인하면, Then "담당 손해사정사"/"BORA 리서치" 같은 하드코딩 문자열이 아니라 현재 세션 `user.name` 값이 표시되어야 하며, DB에 존재하지 않는 소속/직함 필드가 새로 렌더링되지 않아야 한다.

**AC-006**: Given App Shell 안의 임의 화면, When App Topbar를 확인하면, Then 브레드크럼 텍스트와 현재 화면에 대응하는 페이지 타이틀이 표시되어야 하며, 스크롤 시 탑바가 뷰포트에 고정되지 않고 본문과 함께 스크롤되어야 한다(computed style에 `position: fixed`/`sticky`가 없음을 확인).

### Group D — Enum 한글 라벨 (REQ-007~008)

**AC-007**: Given 근거자료 유형이 노출되는 임의 화면(리포트/피드백), When 렌더링된 텍스트를 확인하면, Then "PRECEDENT"/"POLICY"/"STATUTE"/"DISPUTE_CASE"/"OTHER" 같은 영문 raw 값이 화면 텍스트로 노출되지 않고, 각각 판례/약관/법령/분쟁조정례/기타로 표시되어야 한다. And 내부 `data-*` 속성 값(예: `data-status`)은 영문 enum 값을 그대로 유지해야 한다(기존 테스트 회귀 방지).

**AC-008**: Given 쟁점 유형(QueryIssueType)이 노출되는 임의 화면, When 렌더링된 텍스트를 확인하면, Then 8종 영문 raw 값이 화면 텍스트로 노출되지 않고, spec.md REQ-008이 정의한 8개 한글 라벨 중 해당하는 값으로 표시되어야 한다.

### Group E — 비확정성 안내 문구 (REQ-009~010)

**AC-009**: Given 리포트가 존재하는 사건 상세 페이지의 Aggregate Status 패널, When 텍스트를 검색하면, Then spec.md REQ-009에 정의된 문구가 정확히(글자 단위로) 존재해야 한다.

**AC-010**: Given "검토할 담보"(`review-targets`) 패널, When 텍스트를 검색하면, Then spec.md REQ-010에 정의된 문구가 정확히 존재해야 한다.

### Group F — Claim 카드 정합성 (REQ-011)

**AC-011**: Given `status: "INSUFFICIENT"`인 claim이 1개 이상 존재하는 리포트, When 해당 claim 카드를 확인하면, Then "추가 확인 필요" 시각 섹션이 존재하고, 그 내용은 리포트 레벨 `missingMaterials`/`uncertainty`(기존 `missing-materials`/`uncertainty` testid) 데이터에서 파생되거나 그 두 섹션으로의 명확한 시각적 연결(앵커/근접 배치)로 구현되어야 한다. And `lib/pipeline/types.ts`의 `VerifiedClaim` 인터페이스에 이 SPEC이 신규 필드를 추가하지 않았음을 `git diff lib/pipeline/types.ts`로 확인하면, Then diff가 완전히 비어 있어야 한다.

### Group G — 사건 입력 우측 레일 확장 (REQ-012~014)

**AC-012**: Given `/cases/new`의 우측 레일, When "분석 상태" 패널을 확인하면, Then 4단계 텍스트(쟁점 자동 추출/판례·결정례 검색/약관·법령 대조/근거 검증 및 반대 논리 생성)가 정적으로 존재하고, 각 단계에 대해 개별 완료/진행 상태 표시(체크마크, 진행률 바 등 단계별 동적 UI)가 존재하지 않아야 한다.

**AC-013**: Given 로그인 사용자가 3건 이상의 기존 사건을 소유한 상태, When `/cases/new`의 "최근 리서치" 패널(`case-recent-research`)을 확인하면, Then 최대 3건(`case-recent-research-item`)이 최근 순으로 표시되며, 각 항목은 사건 번호·상태·타이틀을 포함해야 한다. And 이 조회에서 발생하는 쿼리가 현재 세션 사용자가 소유하지 않은 사건을 포함하지 않아야 한다(다른 owner의 사건으로 로그인해 재확인).

**AC-014**: Given 사건 입력 폼 Footer, When 버튼 목록을 확인하면, Then "임시 저장" 버튼(`case-input-draft-save`)이 `disabled` 속성과 "준비 중" 시각 Chip을 가진 채로 존재해야 하며, 클릭해도 어떤 네트워크 요청도 발생하지 않아야 한다.

### Group H — 공통 예외 화면 (REQ-015)

**AC-015**: Given 6개 예외 상황(404/권한없음/세션만료/일시오류/네트워크불가/준비중)을 각각 트리거한 상태, When 각 화면을 확인하면, Then App Shell(사이드바+탑바) 안에서 중앙 정렬 아이콘/타이틀/설명과 `{컨텍스트} · {ERROR_CODE}` 패턴이 렌더링되고, 각 화면에 `common-error-<variant>` testid가 부여되어 있어야 한다. And 기존 404/사건 없음 변형에서 `case-error-retry` 버튼과 `reset()` 호출 동작이 회귀 없이 유지되어야 한다.

### Group I — 반응형 (REQ-016~018)

**AC-016**: Given 브라우저 뷰포트 너비를 1024px로 설정한 상태에서 App Shell을 사용하는 화면을 렌더링하면, When 레이아웃을 확인하면, Then 사이드바는 고정 폭을 유지하고, 우측 레일이 존재하는 화면에서는 우측 레일이 본문 아래로 이동한 세로 배치로 렌더링되어야 한다.

**AC-017**: Given 브라우저 뷰포트 너비를 390px로 설정한 상태, When 초기 렌더링을 확인하면, Then 사이드바가 기본적으로 숨겨져 있고 탑바에 햄버거 아이콘이 존재해야 한다. When 햄버거 아이콘을 클릭하면, Then 사이드바가 어두운 스크림 오버레이와 함께 슬라이드인으로 나타나야 한다.

**AC-018**: Given 브라우저 뷰포트 너비를 1280px로 설정한 상태에서 5개 화면(로그인/사건 입력/리포트/피드백/공통 예외 화면 중 1개)을 각각 렌더링하면, When 레이아웃을 수동 검사하면, Then 가로 오버플로, 사이드바-콘텐츠 겹침, 텍스트/컨트롤 잘림, 클릭 불가 겹침이 어느 화면에서도 발생하지 않아야 한다.

### Group J — 기능·데이터 보존 및 품질 게이트 (REQ-019~024)

**AC-019**: Given `lib/db/schema.ts`, `lib/validation/case-input.ts`, `lib/feedback/schema.ts`, `lib/cases/create-case.ts`, `lib/feedback/submit-feedback.ts`, `lib/pipeline/**`, `lib/ai/**`, `db/**`, 모든 마이그레이션, `app/layout.tsx`의 이 SPEC 시작 시점 대비 diff, When `git diff <base>...HEAD -- <위 경로들>`를 실행하면, Then 출력이 완전히 비어 있어야 한다(REQ-019, REQ-003과 부분 중복 확인).

**AC-020**: Given spec.md §3(보존 대상 목록)에 열거된 모든 기존 `data-testid` 값, When 각 값을 `grep -rn '"<testid-값>"' app/` 등으로 코드베이스 전체에서 검색하면, Then 열거된 모든 testid가 정확히 동일한 문자열로 여전히 존재해야 한다(REQ-020).

**AC-021**: Given 사이드바의 신규 2개 nav 항목, When 페이지 소스와 라우트 정의를 확인하면, Then "리포트 보관함"/"판례·약관 DB"에 대응하는 실제 페이지, 라우트 파일, API 엔드포인트가 존재하지 않아야 한다(REQ-021).

**AC-022**: Given 사건 입력 폼 제출 중(pending) 상태 및 피드백 폼 제출 중 상태, When 동일 폼을 다시 제출 시도하면(더블클릭 시뮬레이션), Then 두 번째 요청이 발생하지 않아야 한다(단일 흐름 가드 유지, REQ-022).

**AC-023**: Given 재스타일되었거나 신규 추가된 임의의 인터랙티브 요소, When 접근성 속성을 확인하면, Then label 연관, `role="status"`/`aria-live`(대기 인디케이터), focus 가능 여부가 기존과 동일하게 유지되고, 신규 비활성 nav 항목에는 `aria-disabled="true"`가 존재해야 한다(REQ-023).

**AC-024**: Given 이 SPEC의 구현이 완료된 상태, When `pnpm test`, `pnpm test:e2e`, `pnpm lint`, `pnpm build`을 각각 실행하면, Then 모두 종료 코드 0을 반환해야 한다. And `pnpm format:check` 실행 결과를 기존 베이스라인 경고와 대조하면, Then 이 SPEC이 신규로 도입한 포맷 위반이 0건이어야 한다(REQ-024).

## §2. Edge Cases

- 로그인 사용자가 소유한 사건이 0건인 경우, "최근 리서치" 패널(`case-recent-research`)은 빈 상태(빈 리스트 또는 안내 텍스트)를 렌더링해야 하며, 오류를 던지거나 패널 자체가 비정상적으로 사라져서는 안 된다.
- claim에 대응하는 `missingMaterials`/`uncertainty`가 모두 0건인 INSUFFICIENT claim의 경우, "추가 확인 필요" 섹션은 빈 상태를 우아하게 처리해야 한다(빈 배열 렌더링으로 인한 레이아웃 깨짐 없음).
- 모바일(390px) 드로어가 열린 상태에서 뷰포트를 1024px 이상으로 리사이즈하면, 드로어/스크림이 자동으로 해제되고 데스크톱 사이드바 레이아웃으로 정상 전환되어야 한다.
- 공통 예외 화면 중 "네트워크에 연결할 수 없습니다" 변형은 실제 네트워크 재시도 로직 없이 순수 프레젠테이션으로 구현되어도 무방하다(REQ-015는 시각 재현만 요구, 네트워크 감지 인프라 신규 구축은 범위 외).

## §3. 시각 스모크 체크리스트 (수동, 각 화면 1회 — Pencil 라이브 파일 대조)

- [ ] 로그인 화면: design.md §4(로그인) 구조와 브랜드 패널·필드·푸터 링크가 육안으로 대응하는가
- [ ] App Shell 사이드바: 5개 nav 항목(3개 실제 + 2개 비활성)과 사용자 블록이 Pencil 스펙과 육안으로 대응하는가
- [ ] App Topbar: 브레드크럼 + 동적 타이틀이 3개 기존 화면 각각에서 올바르게 렌더링되는가
- [ ] 공통 예외 화면 6종: 각 변형의 아이콘·문구·에러코드 패턴이 Pencil 프레임 `11`과 육안으로 대응하는가
- [ ] 태블릿(1024px)/모바일(390px): 사이드바 유지+우측 레일 이동, 오프캔버스 드로어+스크림이 각각 육안으로 확인되는가
- [ ] 6개 화면(로그인/사건 입력/리포트/피드백/공통 예외/App Shell 전반) 모두 전문 손해사정사에게 보여줄 때 "미완성"으로 보이지 않는 B2B 완성도 수준인가

## §4. Definition of Done

- [ ] §1에 나열된 모든 AC(AC-001~AC-024, 총 24개 라벨) 전부 PASS
- [ ] §2 Edge Cases 전부 확인
- [ ] §3 시각 스모크 체크리스트 전부 확인
- [ ] `git diff`로 §D(plan.md) PRESERVE 목록의 파일들이 완전히 미변경임을 확인(AC-019와 중복 확인)
- [ ] spec.md §3(보존 대상 목록)의 모든 testid가 grep으로 코드베이스에 여전히 존재함을 확인(AC-020과 중복 확인)
- [ ] spec.md §3(신규 도입 testid 목록)의 모든 신규 testid가 정확한 이름으로 존재함을 확인

## §5. Cross-references

- spec.md §2 REQ-001~024 — 각 AC가 검증하는 요구사항
- design.md §1~5 — AC-001~AC-006, AC-015~AC-018이 참조하는 정확한 시각 스펙
- research.md §2~§8 — AC-007~AC-014, AC-019~AC-023이 재검증하는 기존 구현 기준선 및 스코프 축소 근거
