# SPEC-CASE-PROGRESS-001 인수 조건

## §A. Given-When-Then 시나리오

### Group A — 정적 4단계 진행 안내

**AC-CASE-PROGRESS-001** (REQ-CASE-PROGRESS-001/002)
- **Given** 사건 입력 폼(`case-input-form.tsx`)의 모든 필수 필드가 채워진 상태
- **When** 사용자가 제출해 `isSubmitting`이 `true`가 됨
- **Then** 대기 Footer 안에 `lib/cases/analysis-stages.ts`가 export하는 4개 라벨(쟁점 자동 추출/판례·결정례 검색/약관·법령 대조/근거 검증 및 반대 논리 생성)이 순서대로 렌더링된 목록이 존재한다
- **And** 각 라벨 항목에는 개별 완료 상태를 나타내는 체크마크/색상 배지/`data-status` 속성이 존재하지 않는다

**AC-CASE-PROGRESS-002** (REQ-CASE-PROGRESS-003)
- **Given** AC-CASE-PROGRESS-001과 동일한 대기 상태
- **When** 대기 Footer의 DOM을 검사함
- **Then** `role="progressbar"` 요소가 존재하지 않는다
- **And** 숫자 퍼센트 텍스트(`\d+%` 패턴)가 대기 Footer 안 어디에도 존재하지 않는다
- **And** 4단계 목록 중 어느 항목도 "현재 단계"임을 시각적으로 강조하는 클래스/속성을 갖지 않는다

**AC-CASE-PROGRESS-003** (REQ-CASE-PROGRESS-001 — 단일 소스 회귀 방지)
- **Given** `analysis-status-panel.tsx`와 `case-input-form.tsx` 양쪽의 4단계 라벨 렌더링 결과
- **When** 두 화면에서 렌더링된 라벨 문자열 배열을 비교함
- **Then** 두 배열은 순서와 내용이 완전히 동일하다(동일한 `lib/cases/analysis-stages.ts` import 결과이므로)

### Group B — 회귀 방지 (기존 폴링 종료 분기)

舊 REQ-CASE-PROGRESS-004(queued/processing 구분 표시)는 plan-audit iteration 1 D1/D2 결함 반영으로 제거되었다 — `app/api/cases/status/route.ts:47-53`가 `"queued"`를 JSON으로 노출하지 않아 애초에 충족 불가능했다. AC-CASE-PROGRESS-004/AC-CASE-PROGRESS-005도 함께 제거되었다(HISTORY 및 `.moai/reports/plan-audit/SPEC-CASE-PROGRESS-001-review-1.md` 참고). **주의**: iteration 3에서 결번 해소를 위해 REQ ID가 재번호되어, 현재의 REQ-CASE-PROGRESS-004(§A 아래 AC-CASE-PROGRESS-007 참고)는 접근성 요구사항을 가리키며 이 舊 REQ-CASE-PROGRESS-004(queued/processing 구분 표시)와는 무관하다. 아래 AC-CASE-PROGRESS-006만 기존 종료 분기 회귀 방지 목적으로 유지한다(특정 REQ에 결부되지 않은 일반 회귀 가드 — AC-CASE-PROGRESS-009와 동일한 성격).

**AC-CASE-PROGRESS-006** (기존 종료 분기 회귀 방지 — REQ 미결부, 일반 회귀 가드)
- **Given** 사건 입력 폼이 제출되어 `/api/cases`가 `202`+`jobId`를 반환하고, `waitForCaseJob`이 폴링을 시작함
- **When** `/api/cases/status`가 `{"status": "completed", "caseId": "..."}`를 반환함
- **Then** 기존과 동일하게 `router.push(`/cases/${caseId}`)`가 호출되며, 이 SPEC이 추가한 어떤 신규 로직도 이 라우팅을 지연시키거나 변경하지 않는다
- **And When** 대신 `{"status": "failed", "error": "..."}`를 반환하면
- **Then** 기존과 동일하게 `formError`가 설정되고 제출 가드가 리셋되어 재제출이 허용된다

### Group C — 접근성

**AC-CASE-PROGRESS-007** (REQ-CASE-PROGRESS-004)
- **Given** AC-CASE-PROGRESS-001과 동일한 대기 상태
- **When** `case-pending-indicator` 요소의 속성을 검사함
- **Then** `role="status"`와 `aria-live="polite"`가 그대로 존재한다(기존 SPEC-PILOT-UX-001 계약 보존)
- **And** REQ-CASE-PROGRESS-001의 4단계 목록 컨테이너에는 `aria-live` 속성이 부여되어 있지 않다(즉 `case-pending-indicator`가 감싸는 `aria-live` 서브트리 밖에 위치한다)

### Group D — 범위 보존 (회귀 방지)

**AC-CASE-PROGRESS-008** (REQ-CASE-PROGRESS-005, SPEC-PILOT-UX-001 계승)
- **Given** 사건 입력 폼이 제출 전(idle) 상태
- **When** `AnalysisStatusPanel`을 렌더링함
- **Then** "대기 중" 배지, 모든 4단계 항목의 "대기" 라벨, `data-testid="analysis-status-static-bar"`의 `w-0` 정적 바가 기존과 동일하게 렌더링된다(REQ-CASE-PROGRESS-001의 상수 추출로 인한 import 경로 변경 외에는 시각적 차이가 없다)

**AC-CASE-PROGRESS-009** (기존 테스트 회귀 방지)
- **Given** 기존 `case-input-form.test.tsx`의 AC-001("대기 표시 존재")·AC-002("네 필드 disabled")
- **When** 이 SPEC의 구현 이후 동일 테스트를 재실행함
- **Then** 두 테스트 모두 여전히 PASS한다(테스트 파일 자체는 이 SPEC이 추가하는 신규 AC 테스트로 확장될 수 있으나 기존 테스트 코드/셀렉터는 변경하지 않는다)

## §B. 엣지 케이스

- **폴링 응답 전 구간을 포함해 모든 비종료 상태**: `case-pending-indicator`의 기존 고정 문구("처리 중입니다...")는 이 SPEC에서 변경하지 않는다 — `/api/cases/status`가 `queued`를 노출하지 않으므로 구분해 표시할 실데이터 자체가 없다(舊 REQ-CASE-PROGRESS-004 제거, plan-audit iteration 1 D1/D2).
- **네트워크 예외로 `waitForCaseJob`이 reject되는 경우**: 기존 `catch` 분기(REQ-PILOT-UX-014 계승)가 그대로 동작해야 하며, 이 SPEC이 추가하는 4단계 정적 목록이 이 예외 처리 경로를 방해해서는 안 된다.

## §C. 품질 게이트 / Definition of Done

- `pnpm test` — 종료 코드 0 (신규 AC 테스트 포함, 기존 테스트 회귀 없음)
- `pnpm lint` — 종료 코드 0
- `pnpm build` — 종료 코드 0
- `pnpm format:check` — 이 SPEC이 신규로 도입한 포맷 위반 0건
- `grep -rn "role=\"progressbar\"" app/cases/new/case-input-form.tsx` — 매치 0건 (REQ-CASE-PROGRESS-003 기계적 검증)
- 위 §A의 AC-CASE-PROGRESS-001, 002, 003, 006, 007, 008, 009 전항목 PASS(AC-CASE-PROGRESS-004/005는 이 개정에서 제거됨 — HISTORY 참고)
