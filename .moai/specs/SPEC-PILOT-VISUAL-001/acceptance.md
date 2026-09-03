# SPEC-PILOT-VISUAL-001 — acceptance.md

Verification layer. Every entry is `AC-XXX` (or a lowercase-suffixed sub-ID pairing sub-criteria within one logical AC, e.g. `AC-006b`), Given-When-Then, binary-testable. Cross-referenced against spec.md §2 REQ-001~024.

> plan-auditor iteration-1 감사(FAIL, 0.63) 대응: AC-002/AC-004는 각각 REQ-003(Manrope)/REQ-006(D7 링크 규칙)을 추가 검증하도록 확장되었고, AC-006b/AC-020b/AC-021b가 REQ-009/REQ-020/REQ-022의 누락된 추적성을 보완하기 위해 신설되었으며, 옛 AC-013은 AC-012로 통합되었다(번호 013은 의도적 결번). 총 25개 라벨 — Tier L 상한(25) 이내.

## §1. AC Matrix

### Group A — 디자인 토큰 및 폰트 (REQ-001~003)

**AC-001**: Given `app/globals.css`를 연 상태, When `@theme inline` 블록을 확인하면, Then design.md §1에 열거된 색상 토큰(`--color-bora-*`/`--color-app-*` 네임스페이스의 accent/ok/warn/danger/sidebar/bora 계열 최소 각 1개)이 신규 custom property로 존재하고, 기존 shadcn 베이스 토큰(`--background`, `--foreground`, `--primary`, `--color-accent`, `--color-sidebar` 등)은 값·이름 모두 그대로 남아 있어야 한다(신규 토큰 이름이 기존 shadcn 토큰 이름과 충돌하지 않아야 한다 — plan-auditor D8).

**AC-002**: Given `app/cases/**` 경로의 임의 페이지를 렌더링한 상태, When 본문 텍스트의 계산된 `font-family`를 확인하면, Then Pretendard(또는 그 fallback 체인)가 적용되어야 하며, `app/layout.tsx`의 `<html lang="ko">` 및 그 외 루트 구조는 SPEC-PILOT-UX-001 이전과 동일해야 한다. And BORA 브랜드 워드마크가 텍스트로 렌더링되는 경우(이미지/SVG가 아닌 경우), When 그 텍스트 요소의 계산된 `font-family`와 `font-weight`를 확인하면, Then Manrope ExtraBold(800)가 그 텍스트 요소에만 적용되어야 하며 다른 본문 텍스트에는 적용되지 않아야 한다(REQ-003, plan-auditor D3 대응).

### Group B — App Shell (REQ-004~006)

**AC-003**: Given `/cases/new` 또는 `/cases/[caseId]` 페이지를 렌더링한 상태, When DOM을 검사하면, Then 다크 배경(`fill: sidebar` 토큰)의 사이드바와 상단 탑바가 존재해야 한다.

**AC-004**: Given 렌더링된 사이드바, When nav 항목을 세면, Then 정확히 3개이며(사건 입력/리서치 리포트/전문가 피드백), "리포트 보관함"이나 "판례·약관 DB" 같은 비활성 placeholder 링크가 존재하지 않아야 한다. And "리서치 리포트" 항목의 `href`를 확인하면, Then 항상 존재하는 실제 라우트를 가리키는 활성 링크여야 하며(비활성 `<span>`이나 `aria-disabled` 링크가 아니어야 함), 다음 결정론적 규칙을 따라야 한다 — Given 현재 인증된 사용자에게 사건이 1건 이상 존재하면 When 링크를 확인하면 Then `href`가 그 사용자의 가장 최근에 생성된 사건의 `/cases/[caseId]`를 가리켜야 하고, Given 사용자에게 사건이 0건이면 When 링크를 확인하면 Then `href`가 `/cases/new`를 가리켜야 한다(REQ-006, plan-auditor D7 대응).

**AC-005**: Given `git diff`로 이 SPEC의 전체 변경 파일 목록을 확인한 상태, When `app/layout.tsx`, `app/page.tsx`, `app/login/**`의 diff를 개별 확인하면, Then `app/layout.tsx`는 폰트 import 관련 라인 외 변경이 없어야 하고, `app/page.tsx`와 `app/login/**`는 변경이 전혀 없어야 한다.

### Group C — 공유 컴포넌트 (REQ-007~009)

**AC-006**: Given 리포트 화면에 VERIFIED와 INSUFFICIENT 상태의 claim이 각각 1개 이상 존재하는 상태, When 해당 claim의 status pill을 검사하면, Then `data-testid="claim-status"`와 `data-status` 속성이 SPEC-PILOT-UX-001 이전과 동일한 값으로 존재해야 하며, VERIFIED는 ok 토큰 계열, INSUFFICIENT는 warn 토큰 계열의 시각 스타일이 적용되어야 한다.

**AC-006b**: Given 이 SPEC이 도입한 모든 신규 프레젠테이션 컴포넌트(design.md §3에서 "신규 컴포넌트 불필요"로 표시된 항목 제외) 목록, When 각 컴포넌트가 실제로 표현하는 시각 패턴을 기존 shadcn 프리미티브(Button/Card/Input/Label/Textarea)만으로 재현 가능한지 감사하면, Then 기존 프리미티브만으로 재현 가능했던 패턴에 대해 신규 컴포넌트가 도입되지 않았어야 한다 — 즉 도입된 모든 신규 컴포넌트는 design.md §3에서 "기존 프리미티브로 매핑 불가"로 명시된 항목(Badge/Status, Chip/Tag, Notice 등)에 한정되어야 한다(REQ-008/REQ-009, plan-auditor D3 대응).

### Group D — 화면 01 사건 입력 (REQ-010~011)

**AC-007**: Given `/cases/new`를 렌더링한 상태, When 4개 필드(`case-incident-description`, `case-diagnosis-name`, `case-disability-body-part`, `case-incident-date`)를 확인하면, Then 모두 존재하고 SPEC-PILOT-UX-001의 검증 로직(필수 여부, 타입)이 동일하게 동작해야 한다.

**AC-008**: Given `/cases/new`의 우측 레일 영역을 확인한 상태, When "분석 상태" 또는 "최근 리서치"라는 제목의 패널을 찾으면, Then 존재하지 않아야 한다(빈 카드나 "준비 중" placeholder도 존재하지 않아야 한다).

### Group E — 화면 02 Research Report (REQ-012~015)

**AC-009**: Given 리포트가 존재하는 사건 상세 페이지, When DOM 순서를 `compareDocumentPosition`으로 확인하면, Then `summary-banner`가 leaf 텍스트 "사건 요약"보다 먼저 나타나야 한다(SPEC-PILOT-UX-001 AC-005 동일 검증 재사용).

**AC-010**: Given 사건 상세 페이지에 `sourceUrl`이 있는 근거자료가 존재하는 상태, When 해당 링크를 검사하면, Then `target="_blank"`와 `rel="noopener noreferrer"`가 그대로 존재해야 한다.

**AC-011**: Given claim에 대응 근거자료가 없는 상태, When 근거자료 섹션을 확인하면, Then `data-testid="cited-evidence-empty"` 빈 상태가 렌더링되어야 한다.

**AC-012**: Given 사건 상세 페이지의 우측 레일에 "검토 항목" 또는 "수집 근거 유형" 패널이 존재하는 경우, When 페이지 로드 시 네트워크 요청을 관찰하면, Then 해당 패널을 위한 신규 API 호출이 발생하지 않아야 한다(이미 서버에서 전달된 props의 클라이언트 집계만 허용, REQ-014). And When `evidence` 테이블에 대한 SELECT 쿼리(서버 컴포넌트 코드)를 확인하면, Then SPEC-PILOT-UX-001 이후 확장된 프로젝션(`evidenceType`, `issueTypes` 포함)과 동일하며 추가 컬럼이 SELECT되지 않아야 한다(REQ-015). — 옛 AC-013을 통합했다(REQ-014/REQ-015가 "새 서버 조회를 추가하지 않는다"는 동일한 불변식을 서로 다른 관측 지점에서 검증하므로 하나의 AC로 병합; 번호 013은 의도적 결번).

### Group F — 화면 03 전문가 피드백 (REQ-016~018)

**AC-014**: Given 피드백 폼이 렌더링된 상태, When `data-testid="feedback-section"` 요소를 세면, Then 5개 이상이어야 한다(SPEC-PILOT-UX-001 AC-012 재검증).

**AC-015**: Given 피드백 폼의 모든 verdict/rating 컨트롤, When 요소 타입을 확인하면, Then 모두 native `<select>` 요소여야 하며(커스텀 리스트박스 아님), `select.value = ...; dispatchEvent(new Event("change"))` 패턴으로 상호작용 가능해야 한다.

**AC-016**: Given "누락된 쟁점" 섹션, When 추가 버튼(`feedback-missed-issue-add`)을 클릭하면, Then 새 행(`feedback-missed-issue-row`)이 배열에 추가되어야 하고, 제거 버튼(`feedback-missed-issue-remove`)으로 제거 가능해야 한다 — 정적 체크리스트로 대체되지 않아야 한다.

**AC-017**: Given 피드백 폼의 Form Footer, When 버튼 목록을 확인하면, Then "제출" 버튼은 존재하되 "임시 저장" 버튼은 존재하지 않아야 한다.

**AC-018**: Given 피드백 제출이 필드 검증 실패로 거부된 상태, When 오류 메시지 영역을 확인하면, Then 필드별로 분리된 `<p>` 엘리먼트가 각각 렌더링되어야 한다(하나의 합쳐진 문자열이 아니어야 한다 — SPEC-PILOT-UX-001 AC-011 재검증).

### Group G — 기능 회귀 (REQ-019~023)

**AC-019**: Given 사건 입력 폼 제출 중(pending) 상태, When 동일 폼을 다시 제출 시도하면(더블클릭 시뮬레이션), Then 두 번째 요청이 발생하지 않아야 한다(단일 흐름 가드 유지, REQ-021).

**AC-020**: Given `lib/db/schema.ts`, `lib/validation/case-input.ts`, `lib/feedback/schema.ts`, `lib/cases/create-case.ts`, `lib/feedback/submit-feedback.ts`, `lib/pipeline/**`, `lib/ai/**`, `db/**`의 이 SPEC 시작 시점 대비 diff, When `git diff <base>...HEAD -- <위 경로들>`를 실행하면, Then 출력이 완전히 비어 있어야 한다(REQ-019).

**AC-020b**: Given spec.md §3(Preserved Test Contracts)에 열거된 모든 `data-testid` 값, When 각 값을 `grep -rn '"<testid-값>"' app/cases/` 등으로 코드베이스 전체에서 검색하면, Then 열거된 모든 testid가 정확히 동일한 문자열로(리네이밍 없이) 여전히 존재해야 한다 — 이전에는 Definition of Done의 비형식적 체크리스트 항목이었으나, 이 AC로 정식 승격되었다(REQ-020, plan-auditor D3 대응).

**AC-021**: Given 재스타일된 임의의 인터랙티브 요소(버튼, 링크, 입력 필드), When 접근성 속성을 확인하면, Then label 연관, `role="status"`/`aria-live`(대기 인디케이터), focus 가능 여부가 SPEC-PILOT-UX-001 이전과 동일하게 유지되어야 한다(REQ-023).

**AC-021b**: Given 브라우저 뷰포트 너비를 1280px로 설정한 상태에서 3개 화면(사건 입력/리포트/피드백) 각각을 렌더링하면, When 레이아웃을 수동 검사하면, Then 사이드바와 콘텐츠 영역이 서로 겹치지 않아야 하고, 텍스트가 잘리거나 버튼이 클릭 불가능한 상태로 겹쳐지지 않아야 한다 — 가로 스크롤 발생은 허용되나 콘텐츠 겹침은 허용되지 않는다. 이 AC는 수동 검증이지만(자동화된 render 테스트가 아님), Definition of Done의 필수 항목으로 정식 승격되었다(REQ-022, plan-auditor D3 대응).

### Group H — 품질 게이트 (REQ-024)

**AC-022**: Given 이 SPEC의 구현이 완료된 상태, When `pnpm test`, `pnpm test:e2e`, `pnpm lint`, `pnpm build`을 각각 실행하면, Then 모두 종료 코드 0을 반환해야 한다.

**AC-023**: Given `pnpm format:check` 실행 결과, When 출력을 기존 CHANGELOG 베이스라인 경고와 대조하면, Then 이 SPEC이 신규로 도입한 포맷 위반이 0건이어야 한다(사전 존재하던 베이스라인 경고는 별도 분류하여 이 SPEC의 실패 기준에서 제외).

## §2. Edge Cases

- 우측 레일이 Notice 하나만 남아 2컬럼 비율이 시각적으로 불균형해지는 경우 — 컬럼 폭 조정은 허용되나 신규 데이터/기능 추가는 금지(plan.md §F2 참고).
- Pretendard variable font 로딩 실패(네트워크/빌드 환경 문제) 시 시스템 폰트로 자연스럽게 fallback되어야 하며, 레이아웃이 깨지지 않아야 한다.
- 사용자에게 사건이 0건인 신규 계정에서 사이드바 "리서치 리포트" 링크가 `/cases/new`로 정확히 폴백해야 한다(AC-004의 두 번째 Given/When/Then 분기).
- 피드백 폼에서 claim 또는 cited evidence가 0건인 경우 §1 Group F의 관련 섹션(개별 주장 평가/개별 근거자료 평가)이 조건부로 생략되는 기존 동작이 재스타일 이후에도 유지되어야 한다.

> 노트북 너비(1280px) 비붕괴 검증은 더 이상 Edge Case 서술이 아니라 AC-021b(Group G)로 정식 승격되었다(plan-auditor D3 대응).

## §3. 시각 스모크 체크리스트 (수동, 각 화면 1회 — Pencil 라이브 파일 대조)

- [ ] 화면 01(사건 입력): design.md §4 화면 01 구조와 좌/우 컬럼 배치, 폰트, 색상이 육안으로 대응하는가
- [ ] 화면 02(리포트): design.md §4 화면 02 구조와 요약 패널·claim 카드·우측 레일이 육안으로 대응하는가
- [ ] 화면 03(피드백): design.md §4 화면 03 구조와 번호 매김 섹션·우측 레일이 육안으로 대응하는가
- [ ] 3개 화면 모두 전문 손해사정사에게 보여줄 때 "미완성"으로 보이지 않는 B2B 완성도 수준인가(spec.md "완료 기준" 참고)

## §4. Definition of Done

- [ ] §1에 나열된 모든 AC(AC-001~AC-023 및 하위 ID AC-006b/AC-020b/AC-021b, 총 25개 라벨 — 번호 013은 AC-012 통합에 따른 의도적 결번) 전부 PASS
- [ ] §2 Edge Cases 전부 확인
- [ ] §3 시각 스모크 체크리스트 전부 확인
- [ ] `git diff`로 §D(plan.md) PRESERVE 목록의 파일들이 완전히 미변경임을 확인(AC-020과 중복 확인)
- [ ] spec.md §3(Preserved Test Contracts) 전체 testid가 grep으로 코드베이스에 여전히 존재함을 확인(AC-020b와 중복 확인)

## §5. Cross-references

- spec.md §2 REQ-001~024 — 각 AC가 검증하는 요구사항
- design.md §1~5 — AC-001~AC-013(§1 토큰 네이밍은 `--color-bora-*`/`--color-app-*`로 갱신됨)이 참조하는 정확한 시각 스펙
- research.md §8(테스트 요약) — AC-014~AC-021(및 AC-020b)이 재검증하는 기존 테스트 기준선
