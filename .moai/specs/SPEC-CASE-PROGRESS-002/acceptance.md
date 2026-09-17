# SPEC-CASE-PROGRESS-002 인수 조건

Given-When-Then 형식. 각 AC는 최소 하나의 REQ에 매핑되며, 이진 판정(binary-testable) 가능하도록 작성한다.

## A. 백엔드 실 진행 신호 계측

**AC-CASE-PROGRESS-002-001** (→ REQ-001)
Given `lib/pipeline/index.ts`의 `RunPipelineOptions` 타입 정의
When `onStageProgress` 필드를 읽으면
Then 이 필드는 선택적(`?`)이며 시그니처가 `(stage: 1 | 2 | 3) => void | Promise<void>`여야 한다.

**AC-CASE-PROGRESS-002-002** (→ REQ-002)
Given `runPipeline()`을 `onStageProgress` 스파이 함수와 함께 호출
When `planQueries()` 실행이 완료되면
Then 스파이가 인자 `1`로 정확히 1회 이상 호출되어야 한다(에스컬레이션 없이는 정확히 1회).

**AC-CASE-PROGRESS-002-003** (→ REQ-003)
Given `runPipeline()`을 `onStageProgress` 스파이 함수와 함께 호출
When `retrieveEvidence()` 실행이 완료되면
Then 스파이가 인자 `2`로 정확히 1회 호출되어야 한다.

**AC-CASE-PROGRESS-002-004** (→ REQ-004)
Given 에스컬레이션이 발생하지 않는 케이스(경량 조사로 충분히 확신 있는 결과)로 `runPipeline()` 호출
When 파이프라인이 완료되면
Then 스파이가 인자 `3`으로 정확히 1회 호출되어야 한다.

**AC-CASE-PROGRESS-002-004b** (→ REQ-004, D7)
Given `selectEscalation()`이 에스컬레이션을 반환하도록 조작한 테스트 픽스처로 `runPipeline()` 호출
When 파이프라인이 완료되면
Then 스파이가 인자 `3`으로 정확히 2회 호출되어야 하며(최초+프리미엄 재실행), 두 번째 호출이 파이프라인을 실패시키지 않아야 한다.

**AC-CASE-PROGRESS-002-005** (→ REQ-005)
Given `onStageProgress`로 항상 예외를 던지는 콜백을 전달해 `runPipeline()` 호출
When 파이프라인이 실행되면
Then `runPipeline()`은 정상적으로 `ResearchReport`를 반환해야 하며(예외가 전파되지 않음), 콜백 실패는 `console.error` 호출로만 관측되어야 한다.

## B. DB 스키마 및 잡 실행 연동

**AC-CASE-PROGRESS-002-006** (→ REQ-006)
Given 마이그레이션이 적용된 로컬 DB
When `case_jobs` 테이블 스키마를 조회하면
Then `progress_stage` 정수 컬럼이 존재하고 기본값이 `0`이며 NOT NULL 제약을 가져야 한다.

**AC-CASE-PROGRESS-002-007** (→ REQ-007)
Given `leaseId`가 `"lease-A"`인 job이 `"processing"` 상태로 존재
When 다른(만료되어 재획득된) `leaseId`를 가진 진행률 콜백이 동일 `jobId`에 대해 발화되면
Then `progress_stage` UPDATE는 0행에 적용되어야 한다(펜싱 조건 불일치로 갱신되지 않음).

**AC-CASE-PROGRESS-002-008** (→ REQ-008)
Given `progress_stage` UPDATE 쿼리가 DB 오류를 던지도록 조작한 테스트 픽스처
When `processCaseJob()`이 이 상황을 만나면
Then `processCaseJob()`은 예외를 전파하지 않고 정상적으로 파이프라인 실행을 계속해야 하며, 실패는 로그로만 관측되어야 한다.

## C. API 계약 확장

**AC-CASE-PROGRESS-002-009** (→ REQ-009)
Given `status`가 `"processing"`이고 `progress_stage`가 `2`인 job
When `/api/cases/status?jobId=...`를 호출하면
Then 응답 JSON은 `{ status: "processing", progressStage: 2 }`를 포함해야 한다.

**AC-CASE-PROGRESS-002-010** (→ REQ-010, D6)
Given `status`가 `"completed"`이고 DB에 저장된 `progress_stage`가 `1`(계측 누락 시나리오)인 job
When `/api/cases/status?jobId=...`를 호출하면
Then 응답의 `progressStage`는 저장값(`1`)이 아니라 `4`(`ANALYSIS_STAGES.length`)여야 한다.

**AC-CASE-PROGRESS-002-011** (→ REQ-011)
Given `status`가 `"queued"`이고 `progress_stage`가 `0`인 job
When `/api/cases/status?jobId=...`를 호출하면
Then 응답의 `progressStage`는 `0`이어야 한다(보정 없음).

## D. 프런트엔드 실 퍼센트 진행률 바

**AC-CASE-PROGRESS-002-012** (→ REQ-012)
Given `case-input-form.tsx`가 `isSubmitting=true`이고 최근 폴링 응답이 `progressStage: 2`
When 대기 Footer를 렌더링하면
Then `role="progressbar"` 요소가 존재하고 `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-valuenow="50"`(2/4*100)를 가져야 한다.

**AC-CASE-PROGRESS-002-013** (→ REQ-013)
Given 진행률 바가 `progressStage: 1`(25%)을 마지막으로 관측한 상태
When 다음 폴링 응답이 도착하기 전 3초가 경과해도
Then `aria-valuenow`는 여전히 `25`여야 한다(시간 경과만으로 값이 증가하지 않음).

**AC-CASE-PROGRESS-002-014** (→ REQ-014)
Given `progressStage: 2`
When `case-pending-stages` 목록을 렌더링하면
Then 인덱스 0, 1 항목은 "완료" 라벨을, 인덱스 2 항목은 "진행 중" 라벨을, 인덱스 3 항목은 "대기" 라벨을 가져야 한다.

**AC-CASE-PROGRESS-002-015** (→ REQ-015)
Given 렌더링된 진행률 바 요소의 CSS/스크립트
When 애니메이션 관련 스타일을 검사하면
Then `progressStage` 값 변경과 무관하게 스스로 반복 재생되는 `@keyframes` 기반 무한 루프 애니메이션(indeterminate 스타일)이 적용되어 있지 않아야 한다 — 너비 변경에 대한 `transition` 선언은 허용된다.

## E. 접근성 보존

**AC-CASE-PROGRESS-002-016** (→ REQ-016)
Given 렌더링된 대기 Footer의 DOM 구조
When `[data-testid="case-pending-indicator"]` 요소의 하위 트리를 검사하면
Then `role="progressbar"` 요소나 `case-pending-stages` 목록이 그 하위에 존재하지 않아야 한다(형제 요소로 배치되어야 함).

## F. 범위 보존

**AC-CASE-PROGRESS-002-017** (→ REQ-017)
Given SPEC 구현 완료 후의 diff
When `lib/cases/job-timing.ts`와 `app/cases/new/analysis-status-panel.tsx`를 확인하면
Then 두 파일 모두 이 SPEC으로 인한 변경 사항이 없어야 한다(git diff 결과 파일이 목록에 나타나지 않음).

**AC-CASE-PROGRESS-002-018** (→ REQ-018)
Given 기존 `createCase()`(동기 경로)가 `runPipeline(parsed.data)`를 `options` 없이 호출하는 기존 테스트
When 이 SPEC 구현 후 동일 테스트를 재실행하면
Then 테스트는 수정 없이 그대로 통과해야 한다(타입 오류 없음, 런타임 동작 변경 없음).

## Definition of Done

- [ ] AC-CASE-PROGRESS-002-001 ~ 018 전부 PASS (자동화된 테스트로 검증 가능한 항목은 테스트로, 정적 검사(DOM/스타일 검사)는 컴포넌트 테스트 또는 코드 리뷰로 검증)
- [ ] `npm test`, `npm run lint`, `npx tsc --noEmit` 전부 통과
- [ ] `db:generate`로 생성된 마이그레이션 파일이 `db/migrations/`에 커밋됨
- [ ] SPEC-CASE-PROGRESS-001의 `partially_superseded_by` 프런트매터 갱신 확인
