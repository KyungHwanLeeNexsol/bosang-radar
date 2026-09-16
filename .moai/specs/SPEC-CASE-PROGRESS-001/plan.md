# SPEC-CASE-PROGRESS-001 구현 계획

## §A. 결정 사항 (변경 가능성 높은 순)

### 결정 1 — 4단계 라벨 공유 상수의 위치와 형태

현재 `ANALYSIS_STAGES`는 `app/cases/new/analysis-status-panel.tsx` 파일 내부의 지역 상수(`as const` 문자열 배열)다. 이를 `lib/cases/analysis-stages.ts`(신규 파일)로 추출해 `readonly string[]`(또는 `as const` 튜플) 형태로 export한다.

- **왜 파일 위치가 `lib/cases/`인가**: `case-input-form.tsx`(client component)와 `analysis-status-panel.tsx`(server component) 양쪽에서 import 가능해야 하며, `lib/cases/job-timing.ts`가 이미 동일한 "클라이언트·서버 겸용 순수 상수" 패턴으로 존재한다(파일 상단 주석: "DB/Node 전용 의존성이 전혀 없어 클라이언트 번들에 서버 코드가 섞여 들어가지 않는다") — 동일 컨벤션을 재사용한다.
- **왜 이 결정이 먼저인가**: M2(case-input-form.tsx 수정)와 M3(analysis-status-panel.tsx 수정) 둘 다 이 상수의 export 형태(단순 문자열 배열 vs `{id, label}` 객체 배열)에 의존한다. 여기서 단순 `readonly string[]`로 정하면 이후 두 마일스톤의 렌더링 코드가 결정된다.
- **대안 기각**: `{id, label}` 객체 배열은 향후 실제 단계별 데이터 연결을 준비하는 것처럼 보이지만, REQ-CASE-PROGRESS-003/Out of Scope가 명시적으로 단계별 실데이터 연결을 범위 밖으로 뒀으므로 불필요한 선제적 확장이다(Enforce Simplicity — YAGNI). 단순 문자열 배열로 충분하다.

### 결정 2 — queued/processing 구분 문구의 전달 경로

`waitForCaseJob`은 현재 `void` 반환 함수로, 폴링 루프 내부 상태를 컴포넌트 렌더링에 노출하지 않는다. 이 SPEC은 `CaseInputForm`에 신규 `useState<"queued" | "processing" | null>`(예: `jobPhase`)를 추가하고, `waitForCaseJob`이 매 폴링 응답을 받을 때마다 이 state를 갱신하도록 콜백(또는 `waitForCaseJob`을 컴포넌트 내부 클로저로 유지하는 기존 구조를 살려 `setJobPhase` 직접 호출)으로 연결한다.

- **왜 신규 state가 필요한가**: `waitForCaseJob`은 이미 `router`(클로저)에 접근하는 컴포넌트 내부 함수이므로, `setJobPhase`도 동일하게 클로저로 호출하면 된다 — 별도의 Context나 상위 상태 관리 도입은 과설계다.
- **초기값**: `null`(아직 첫 폴링 응답 전 — `/api/cases`가 `202`를 반환한 직후 첫 poll 간격 2초 동안). 이 구간에는 REQ-CASE-PROGRESS-002의 정적 4단계 목록만 표시되고 REQ-CASE-PROGRESS-004의 구분 문구는 아직 노출되지 않는다(실데이터가 아직 없으므로 이 침묵은 가짜 진행률 금지 원칙과 정합적이다).
- **대안 기각**: `AnalysisStatusPanel`(서버 컴포넌트, 형제 컴포넌트)로 이 상태를 끌어올리는 것은 `page.tsx`의 서버/클라이언트 컴포넌트 경계를 넘는 대규모 리팩터(공유 client wrapper 신설 등)를 요구해 SPEC 범위(REQ-CASE-PROGRESS-006 — AnalysisStatusPanel 재설계 금지)와 충돌한다 — 상태는 `case-input-form.tsx` 로컬에만 존재한다.

### 결정 3 — aria-live 영역과 정적 목록의 DOM 분리 방식

REQ-CASE-PROGRESS-005는 `case-pending-indicator`(`role="status" aria-live="polite"`) 내부에 반복 안내를 유발하는 목록을 넣지 말라고 요구한다. 구현은 기존 `case-pending-indicator` `<span>`은 요약 텍스트(고정 문구 또는 REQ-CASE-PROGRESS-004 구분 문구)만 담고, REQ-CASE-PROGRESS-001의 4단계 목록은 `case-pending-indicator` 형제 요소로 `case-input-footer` 안에 별도 렌더링하며 `aria-live` 속성을 부여하지 않는다.

- **왜 형제 요소인가**: `aria-live="polite"` 영역 내부의 DOM 변경(또는 최초 마운트 시 텍스트 삽입)은 스크린리더가 전체 서브트리를 다시 읽게 만들 수 있다 — 4단계 목록을 그 바깥에 두면 목록은 마운트 시 한 번만 읽히고, 이후 `aria-live` 영역은 요약 문구 변경분(대기열→진행 중)만 안내한다.

## §B. 마일스톤 (실행 순서)

### M1 — 공유 상수 모듈 신설

- `lib/cases/analysis-stages.ts` 생성 — `ANALYSIS_STAGES`(4개 라벨, `readonly string[]`) export.
- `analysis-status-panel.tsx`가 지역 정의 대신 이 모듈을 import하도록 수정 — 렌더링 결과는 기존과 100% 동일해야 한다(REQ-CASE-PROGRESS-006).

### M2 — case-input-form.tsx 대기 Footer 확장

- `case-pending-indicator` 요약 문구 로직 추가(초기 상태 "처리 중입니다..." 유지 또는 REQ-CASE-PROGRESS-004 구분 문구로 교체 — 결정 2 참고).
- `case-pending-indicator` 형제로 4단계 정적 목록 렌더링(결정 3 참고), M1의 `ANALYSIS_STAGES` import.
- 개별 단계에 완료/체크마크/하이라이트를 부여하지 않음(REQ-CASE-PROGRESS-003).

### M3 — waitForCaseJob queued/processing 상태 전달

- `waitForCaseJob` 내부에서 `data.status`가 `"queued"` 또는 `"processing"`일 때 `setJobPhase(data.status)` 호출 추가.
- `completed`/`failed` 분기 로직은 변경하지 않는다(기존 라우팅/오류 처리 그대로).

### M4 — 접근성 검증

- `case-pending-indicator`의 `role="status" aria-live="polite"` 속성이 그대로인지, 4단계 목록이 그 영역 밖에 있는지 마크업 재확인.
- 4단계 목록에 과도한 ARIA 속성을 추가하지 않는다(순수 정보성 `<ol>`/`<ul>` + 텍스트로 충분 — `analysis-status-panel.tsx`의 기존 패턴과 동일).

### M5 — 테스트

- `case-input-form.test.tsx`에 신규 AC 테스트 추가: 4단계 목록 존재 확인, queued/processing 문구 전환 확인(모킹된 `/api/cases/status` 응답 시퀀스로 검증), 기존 AC-001/AC-002(대기 인디케이터 존재, 필드 disabled)가 회귀하지 않는지 재확인.
- `analysis-status-panel.tsx`에 대한 기존 렌더링 회귀가 없는지 확인(테스트 파일이 없다면 최소 스냅샷/DOM 확인 1건 추가 검토 — 과설계 방지를 위해 필요 최소한으로).

### M6 — 품질 게이트

- `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm format:check` 실행 및 종료 코드 0 확인.

## §C. PRESERVE 목록 (건드리지 않음)

- `app/api/cases/status/route.ts` (응답 스키마)
- `lib/cases/job-timing.ts` (폴링 상수)
- `lib/pipeline/**`, `lib/db/schema.ts`, `db/**`, 모든 마이그레이션
- `case-input-form.tsx`의 기존 testid(`case-input-form`, `case-incident-description`, `case-diagnosis-name`, `case-disability-body-part`, `case-incident-date`, `case-submit`, `case-pending-indicator`) — 이름·의미 변경 금지
- `analysis-status-panel.tsx`의 idle(제출 전) 상태 시각 렌더링 결과

## §D. 리스크

- **리스크 1 — DOM 구조 변경이 기존 스냅샷/셀렉터 테스트를 깨뜨릴 가능성**: `case-pending-indicator`를 감싸는 컨테이너 구조가 바뀌면 `container.querySelector('[data-testid="case-pending-indicator"]')`가 여전히 통과하는지 M5에서 반드시 재확인한다. testid 자체는 이동하지 않고 속성도 그대로 유지하므로 위험은 낮다.
- **리스크 2 — queued 상태가 실제로 거의 관측되지 않을 가능성**: `app/api/cases/route.ts`가 `202`를 반환하는 시점에 이미 `caseJobs` 행이 `queued`로 생성되지만, Background Function이 매우 빠르게 `processing`으로 전이하면 클라이언트가 `queued`를 폴링으로 관측할 기회가 첫 2초 창 안으로 좁을 수 있다 — 이는 UX 결함이 아니라 실제 타이밍의 반영이므로, 짧게 보이거나 아예 안 보이는 것도 정상 동작으로 간주한다(가짜로 늘리지 않는다).
- **리스크 3 — 접근성 회귀**: `aria-live` 영역 밖에 목록을 두는 결정(결정 3)이 스크린리더 사용자에게 목록이 아예 안내되지 않는 것으로 오인될 수 있다 — 목록은 최초 마운트 시 일반 DOM 순서대로 읽히므로(별도 `aria-hidden` 없음), 완전히 무음이 되지는 않는다. M4에서 이 가정을 마크업으로 재확인한다.

## §E. 교차 참조

- SPEC-UI-MIGRATION-001 REQ-012/AC-012 — 가짜 진행률 금지 원칙의 최초 확정 SPEC, `analysis-status-panel.tsx`의 최초 도입 SPEC.
- SPEC-PILOT-READY-001 §Z/§R — `job-timing.ts` 폴링 상수 및 `/api/cases/status`의 4개 상태값 계약 소유 SPEC.
- SPEC-PILOT-UX-001 REQ-PILOT-UX-001 — 기존 `case-pending-indicator`(`role="status" aria-live="polite"`) 도입 SPEC.
