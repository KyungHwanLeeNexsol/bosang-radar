# SPEC-CASE-PROGRESS-001 구현 계획

## §A. 결정 사항 (변경 가능성 높은 순)

### 결정 1 — 4단계 라벨 공유 상수의 위치와 형태

현재 `ANALYSIS_STAGES`는 `app/cases/new/analysis-status-panel.tsx` 파일 내부의 지역 상수(`as const` 문자열 배열)다. 이를 `lib/cases/analysis-stages.ts`(신규 파일)로 추출해 `readonly string[]`(또는 `as const` 튜플) 형태로 export한다.

- **왜 파일 위치가 `lib/cases/`인가**: `case-input-form.tsx`(client component)와 `analysis-status-panel.tsx`(server component) 양쪽에서 import 가능해야 하며, `lib/cases/job-timing.ts`가 이미 동일한 "클라이언트·서버 겸용 순수 상수" 패턴으로 존재한다(파일 상단 주석: "DB/Node 전용 의존성이 전혀 없어 클라이언트 번들에 서버 코드가 섞여 들어가지 않는다") — 동일 컨벤션을 재사용한다.
- **왜 이 결정이 먼저인가**: M2(case-input-form.tsx 수정)와 M3(analysis-status-panel.tsx 수정) 둘 다 이 상수의 export 형태(단순 문자열 배열 vs `{id, label}` 객체 배열)에 의존한다. 여기서 단순 `readonly string[]`로 정하면 이후 두 마일스톤의 렌더링 코드가 결정된다.
- **대안 기각**: `{id, label}` 객체 배열은 향후 실제 단계별 데이터 연결을 준비하는 것처럼 보이지만, REQ-CASE-PROGRESS-003/Out of Scope가 명시적으로 단계별 실데이터 연결을 범위 밖으로 뒀으므로 불필요한 선제적 확장이다(Enforce Simplicity — YAGNI). 단순 문자열 배열로 충분하다.

### 결정 2 — aria-live 영역과 정적 목록의 DOM 분리 방식

REQ-CASE-PROGRESS-004는 `case-pending-indicator`(`role="status" aria-live="polite"`) 내부에 반복 안내를 유발하는 목록을 넣지 말라고 요구한다. 구현은 기존 `case-pending-indicator` `<span>`은 기존 고정 요약 텍스트("처리 중입니다...", 변경 없음 — iteration 1에서 제거된 舊 queued/processing 구분 요구사항으로 인해 구분 문구 자체가 없어짐)만 담고, REQ-CASE-PROGRESS-001의 4단계 목록은 `case-pending-indicator` 형제 요소로 `case-input-footer` 안에 별도 렌더링하며 `aria-live` 속성을 부여하지 않는다.

- **왜 형제 요소인가**: `aria-live="polite"` 영역 내부의 DOM 변경(또는 최초 마운트 시 텍스트 삽입)은 스크린리더가 전체 서브트리를 다시 읽게 만들 수 있다 — 4단계 목록을 그 바깥에 두면 목록은 마운트 시 한 번만 읽히고, 이후 `aria-live` 영역은 기존과 동일하게 정적으로 유지된다(구분 문구 전환이 없으므로 반복 안내될 변경분 자체가 없다).

> **(구)결정 2 제거 안내**: 최초 계획의 "결정 2 — queued/processing 구분 문구의 전달 경로"(신규 `jobPhase` state 도입안)는 plan-audit iteration 1 D1/D2 결함 반영으로 舊 REQ-CASE-PROGRESS-004(queued/processing 구분 표시, iteration 3에서 결번 해소를 위해 ID가 REQ-CASE-PROGRESS-004/005로 재번호되며 현재는 접근성·범위 보존 요구사항을 가리킴 — 이 문단의 대상과는 무관)와 함께 제거되었다 — `/api/cases/status`가 `queued`를 노출하지 않아 구분할 상태 자체가 없으므로 전달 경로도 불필요하다.

## §B. 마일스톤 (실행 순서)

### M1 — 공유 상수 모듈 신설

- `lib/cases/analysis-stages.ts` 생성 — `ANALYSIS_STAGES`(4개 라벨, `readonly string[]`) export.
- `analysis-status-panel.tsx`가 지역 정의 대신 이 모듈을 import하도록 수정 — 렌더링 결과는 기존과 100% 동일해야 한다(REQ-CASE-PROGRESS-005).

### M2 — case-input-form.tsx 대기 Footer 확장

- `case-pending-indicator` 요약 문구는 기존 고정 문구("처리 중입니다...")를 그대로 유지한다(iteration 1에서 제거된 舊 queued/processing 구분 요구사항 — 구분 문구 없음).
- `case-pending-indicator` 형제로 4단계 정적 목록 렌더링(결정 2 참고), M1의 `ANALYSIS_STAGES` import.
- 개별 단계에 완료/체크마크/하이라이트를 부여하지 않음(REQ-CASE-PROGRESS-003).

### M3 — 접근성 검증

- `case-pending-indicator`의 `role="status" aria-live="polite"` 속성이 그대로인지, 4단계 목록이 그 영역 밖에 있는지 마크업 재확인.
- 4단계 목록에 과도한 ARIA 속성을 추가하지 않는다(순수 정보성 `<ol>`/`<ul>` + 텍스트로 충분 — `analysis-status-panel.tsx`의 기존 패턴과 동일).

### M4 — 테스트

- `case-input-form.test.tsx`에 신규 AC 테스트 추가: 4단계 목록 존재 확인(AC-CASE-PROGRESS-001~003), 기존 종료 분기(completed/failed) 회귀 확인(AC-CASE-PROGRESS-006), 기존 AC-001/AC-002(대기 인디케이터 존재, 필드 disabled)가 회귀하지 않는지 재확인(AC-CASE-PROGRESS-009).
- `analysis-status-panel.tsx`에 대한 기존 렌더링 회귀가 없는지 확인(테스트 파일이 없다면 최소 스냅샷/DOM 확인 1건 추가 검토 — 과설계 방지를 위해 필요 최소한으로).

### M5 — 품질 게이트

- `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm format:check` 실행 및 종료 코드 0 확인.

## §C. PRESERVE 목록 (건드리지 않음)

- `app/api/cases/status/route.ts` (응답 스키마)
- `lib/cases/job-timing.ts` (폴링 상수)
- `lib/pipeline/**`, `lib/db/schema.ts`, `db/**`, 모든 마이그레이션
- `case-input-form.tsx`의 기존 testid(`case-input-form`, `case-incident-description`, `case-diagnosis-name`, `case-disability-body-part`, `case-incident-date`, `case-submit`, `case-pending-indicator`) — 이름·의미 변경 금지
- `analysis-status-panel.tsx`의 idle(제출 전) 상태 시각 렌더링 결과

## §D. 리스크

- **리스크 1 — DOM 구조 변경이 기존 스냅샷/셀렉터 테스트를 깨뜨릴 가능성**: `case-pending-indicator`를 감싸는 컨테이너 구조가 바뀌면 `container.querySelector('[data-testid="case-pending-indicator"]')`가 여전히 통과하는지 M4에서 반드시 재확인한다. testid 자체는 이동하지 않고 속성도 그대로 유지하므로 위험은 낮다.
- **리스크 2 — 접근성 회귀**: `aria-live` 영역 밖에 목록을 두는 결정(결정 2)이 스크린리더 사용자에게 목록이 아예 안내되지 않는 것으로 오인될 수 있다 — 목록은 최초 마운트 시 일반 DOM 순서대로 읽히므로(별도 `aria-hidden` 없음), 완전히 무음이 되지는 않는다. M3에서 이 가정을 마크업으로 재확인한다.

## §E. 교차 참조

- SPEC-UI-MIGRATION-001 REQ-012/AC-012 — 가짜 진행률 금지 원칙의 최초 확정 SPEC, `analysis-status-panel.tsx`의 최초 도입 SPEC.
- SPEC-PILOT-READY-001 §Z/§R — `job-timing.ts` 폴링 상수 및 `/api/cases/status`의 응답 계약(completed/failed/처리중 고정값, 3가지 응답 형태) 소유 SPEC.
- SPEC-PILOT-UX-001 REQ-PILOT-UX-001 — 기존 `case-pending-indicator`(`role="status" aria-live="polite"`) 도입 SPEC.
