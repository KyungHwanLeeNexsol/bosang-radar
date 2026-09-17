# SPEC-CASE-PROGRESS-002 구현 계획

## §A. 결정 사항 (변경 가능성 높은 순)

결정은 데이터 모델·신규 타입 인터페이스·사용자 대면 UX 흐름 변경 가능성이 높은 순으로 먼저 나열하고, 기계적 배선 작업은 뒤에 배치한다.

### D1 — 6개 기술 단계 → 4개 사용자 라벨 매핑 (UX 흐름, 변경 가능성 최고)

`runPipeline()`의 6개 기술 단계(CaseNormalizer/QueryPlanner/EvidenceRetriever/Researcher/Skeptic/Verifier)를 `ANALYSIS_STAGES`의 4개 라벨(쟁점 자동 추출/판례·결정례 검색/약관·법령 대조/근거 검증 및 반대 논리 생성)에 대응하는 **3개의 구분 가능한 체크포인트**로 매핑한다:

| 체크포인트 | 값 | 실제 신호 | 대응 사용자 라벨 |
|---|---|---|---|
| 시작 전 | `0` | job 생성 직후, 아직 `"processing"`으로 전이 전 | (모든 단계 "대기") |
| 1 | `1` | `planQueries()`(QueryPlanner) 완료 | "① 쟁점 자동 추출" 완료 |
| 2 | `2` | `retrieveEvidence()`(EvidenceRetriever) 완료 | "① 쟁점 자동 추출", "② 판례·결정례 검색" 완료 — ※ "③ 약관·법령 대조"는 코드상 EvidenceRetriever와 별도 신호가 없으므로 체크포인트 2에서 함께 "진행 중"으로 전이됨 |
| 3 | `3` | `research()`(Researcher, 최초 실행) 완료 | "③ 약관·법령 대조" 완료(체크포인트 2에서 "진행 중"이던 상태가 완료로 전환) |
| (완료) | `4`(파생, DB에 저장하지 않음) | job `status === "completed"` | "④ 근거 검증 및 반대 논리 생성" 완료 |

**근거**: `research()`는 QueryPlanner가 산출한 쟁점(도메인/이슈타입)에 대해 실제 조사를 수행하므로 "약관·법령 대조"의 실질에 가장 가깝다. `challenge()`(Skeptic, "반대 논리")와 `verify()`(Verifier, "근거 검증")는 라벨 문구("근거 검증 및 반대 논리 생성")와 직접 대응하며, 코드상 항상 함께 마지막에 실행되므로 하나의 완료 신호(=job 완료)로 묶는다.

**변경 가능성**: 이 매핑은 plan-auditor 검토 또는 사용자 확인 과정에서 재조정될 수 있는 가장 해석 여지가 큰 결정이다 — 예를 들어 "② 판례·결정례 검색"과 "③ 약관·법령 대조"를 아예 하나의 라벨로 합쳐 3단계 목록으로 줄이는 대안도 검토했으나, 사용자가 "extending the current static 4-stage list"라고 명시했으므로 기존 4개 라벨의 개수는 보존하고 체크포인트만 3개로 두는 이 매핑을 채택했다.

### D2 — `RunPipelineOptions.onStageProgress` 콜백 시그니처 (신규 타입 인터페이스)

```ts
export interface RunPipelineOptions {
  providers?: RoleProviders;
  onStageProgress?: (stage: 1 | 2 | 3) => void | Promise<void>;
}
```

- 리터럴 유니언 타입(`1 | 2 | 3`)으로 제한해 잘못된 값 전달을 컴파일 타임에 방지한다.
- 콜백 내부 예외는 `runPipeline()`이 흡수한다(D8). 호출부(`processCaseJob`)는 콜백 안에서 별도로 try/catch를 중복할 필요가 없지만, 방어적으로 자체 catch를 두는 것도 금지하지 않는다.
- 호출 지점에서의 실행 순서 보장: `await notifyStageProgress(1, options.onStageProgress)` 형태로 각 단계 완료 직후 `await`한다 — fire-and-forget(await 없이 호출)하면 DB write가 다음 단계 실행과 경합할 수 있으므로 반드시 `await` 후 다음 단계로 진행한다(단, 콜백 실패 자체는 파이프라인을 막지 않는다 — D8과 모순되지 않음: "완료를 기다린다"와 "실패해도 무시한다"는 별개의 축이다).

### D3 — `case_jobs.progress_stage` 컬럼 (데이터 모델)

```ts
progressStage: integer("progress_stage").notNull().default(0),
```

`lib/db/schema.ts`의 `caseJobs` 정의(157-167행) 안에 추가한다. 기존 행은 마이그레이션 시 `DEFAULT 0`으로 채워진다(모두 이미 `completed`/`failed` 상태이므로 UI에서 이 값이 참조될 일이 없다 — REQ-CASE-PROGRESS-002-010의 completed 클램프가 적용되기 때문).

### D4 — `/api/cases/status` 응답 필드명 (`progressStage`, camelCase)

기존 응답 필드(`status`, `caseId`, `error`)가 모두 camelCase이므로 일관성을 위해 `progressStage`(camelCase)를 사용한다. DB 컬럼명(`progress_stage`, snake_case)은 Drizzle의 기존 컬럼 네이밍 관례(`caseId`↔`case_id` 등)를 그대로 따른다.

### D5 — 퍼센트 계산 책임 소재 (서버 vs 클라이언트)

**결정**: 서버는 `progressStage`(정수, 0~3, 또는 completed 시 4)만 반환하고, 퍼센트(0~100 정수) 계산은 클라이언트(`case-input-form.tsx`)가 `Math.round((progressStage / ANALYSIS_STAGES.length) * 100)`로 수행한다.

**근거**: `ANALYSIS_STAGES.length`(총 단계 수)는 이미 클라이언트 번들에 포함된 `lib/cases/analysis-stages.ts`(DB/Node 의존성 없는 순수 상수 모듈)에서 가져올 수 있다. 서버가 퍼센트를 미리 계산해 반환하면 "총 단계 수"라는 동일한 상수를 서버·클라이언트 양쪽에서 별도로 알아야 하는 이중 관리가 생긴다. 정수 단계값만 전달하고 퍼센트는 단일 소스(`ANALYSIS_STAGES.length`)에서 파생시키는 쪽이 Enforce Simplicity 원칙에 부합한다.

### D6 — completed 상태의 progressStage 클램프 규칙 (안전장치)

REQ-CASE-PROGRESS-002-010: `status === "completed"`이면 DB에 저장된 `progress_stage` 값과 무관하게 `/api/cases/status`가 항상 `ANALYSIS_STAGES.length`(4)를 반환한다. 이는 REQ-CASE-PROGRESS-002-008(계측 write 실패는 무시)의 필연적 귀결이다 — 계측 write가 어느 한 체크포인트에서 실패해도, 실제 분석 자체는 정상 완료될 수 있으므로 완료된 job이 영원히 75%로 멈춰 보이는 UX 결함을 방지한다.

### D7 — 에스컬레이션 시 체크포인트 3의 중복 호출 (멱등성)

`runReview()`가 초기 조사(lite 또는 premium)와 에스컬레이션에 의한 프리미엄 재조사, 최대 2번 호출될 수 있다(`lib/pipeline/index.ts:134,152`). 두 번째 호출에서도 `research()` 완료 시 `onStageProgress(3)`을 다시 호출하도록 설계했다 — "최초 호출에서만 발화"하도록 특수 처리하는 대신, 매번 동일한 값을 멱등적으로 쓰는 쪽이 더 단순하다(값이 감소하지 않고 동일 값을 두 번 써도 사용자에게 보이는 차이가 없음).

### D8 — 진행률 계측 실패의 격리 원칙 (안전성)

진행률 계측(콜백 호출 실패, DB UPDATE 실패)은 어떤 경우에도 실제 분석 파이프라인의 성공/실패에 영향을 주어서는 안 된다. `runPipeline()` 내부와 `processCaseJob()` 내부 양쪽에서 각각 독립적으로 이 원칙을 적용한다(REQ-CASE-PROGRESS-002-005, -008) — 계측은 부가 기능(nice-to-have)이고, 실제 사건 분석 완료는 핵심 기능(must-have)이기 때문이다.

## §B. 마일스톤 (실행 순서)

의존 관계상 스키마 → 백엔드 계측 → 잡 배선 → API → UI 순으로 실행한다(각 마일스톤은 이전 마일스톤이 만든 계약 위에서 동작한다).

### M1 — DB 스키마 마이그레이션

- `lib/db/schema.ts`의 `caseJobs`에 `progressStage: integer("progress_stage").notNull().default(0)` 추가(D3).
- `npm run db:generate`로 `db/migrations/`에 마이그레이션 파일 생성.
- 로컬 turso DB에 `npm run db:migrate` 적용, 기존 행에 기본값 `0`이 채워지는지 확인.

### M2 — 파이프라인 콜백 계측

- `lib/pipeline/index.ts`의 `RunPipelineOptions`에 `onStageProgress` 필드 추가(D2).
- 내부 헬퍼 `notifyStageProgress(stage, onStageProgress)`를 정의해 콜백 호출을 감싸고 실패를 흡수(D8) — 기존 `withStageLogging`/`toSafeErrorMeta` 스타일을 따른다.
- `planQueries()` 직후(REQ-002), `retrieveEvidence()` 직후(REQ-003), `runReview()` 내부 `research()` 직후(REQ-004)에 각각 `await notifyStageProgress(...)` 호출을 삽입.
- 기존 `runPipeline()` 호출부(`createCase()` 등, `options` 생략)가 그대로 동작하는지 확인(REQ-018).

### M3 — `processCaseJob()` 배선

- `processCaseJob()`이 `runPipeline(job.input, { onStageProgress: async (stage) => { ... } })` 형태로 호출하도록 수정.
- 콜백 내부에서 `db.update(caseJobs).set({ progressStage: stage }).where(and(eq(caseJobs.id, jobId), eq(caseJobs.leaseId, job.leaseId), eq(caseJobs.status, "processing")))`를 실행(D-펜싱, REQ-007).
- UPDATE 실패 또는 0행 매치 시 로그만 남기고 예외를 삼킨다(REQ-008).
- `createCase()`(동기 경로)는 이 콜백을 전달하지 않는다 — 동기 경로는 `case_jobs` 테이블 자체를 사용하지 않으므로 계측 대상이 아니다(REQ-017 preservation 범위 확인).

### M4 — `/api/cases/status` 응답 확장

- `select` 절에 `caseJobs.progressStage` 추가.
- `status === "completed"`이면 `progressStage`를 `ANALYSIS_STAGES.length`로 강제(D6, REQ-010).
- `status === "queued" | "processing"`이면 DB 값을 그대로 반환(REQ-011).
- `status === "failed"`인 기존 분기는 `progressStage`를 응답에 포함하지 않거나 무의미한 값을 포함하지 않도록 주의(실패 후 재제출 유도 문구만 유지, 기존 동작 보존).

### M5 — `case-input-form.tsx` UI

- `waitForCaseJob()`의 폴링 응답 파싱에 `progressStage: number` 필드 추가, 컴포넌트 state로 보관.
- 대기 Footer에 `role="progressbar"` 요소 추가(REQ-012, -013, -015) — `aria-valuenow`/너비는 오직 state의 `progressStage`에서만 계산.
- `case-pending-stages` `<ol>`의 각 `<li>`에 완료/진행 중/대기 상태 라벨 렌더링(REQ-014).
- `case-pending-indicator`(`aria-live="polite"`) 내부에 진행률 바나 단계별 상태 요소를 배치하지 않는다(REQ-016).

### M6 — 테스트 및 검증

- `lib/pipeline/`: `onStageProgress`가 올바른 순서(1→2→3)로, 콜백 실패 시에도 파이프라인이 계속되는지 검증하는 단위 테스트 추가.
- `lib/cases/create-case.test.ts`: `processCaseJob()`이 콜백을 통해 `progress_stage`를 펜싱 조건과 함께 갱신하는지, UPDATE 실패 시 예외가 전파되지 않는지 검증.
- 신규 `app/api/cases/status/route.test.ts`(또는 기존 테스트 확장): completed 클램프 규칙, queued/processing 그대로 반환 규칙 검증.
- `app/cases/new/case-input-form.test.tsx`: `role="progressbar"` 렌더링, `aria-valuenow` 값, `aria-live` 영역 밖 배치, 단계별 완료/진행 중/대기 라벨 검증.
- 전체 `npm test` + `npm run lint` + `npx tsc --noEmit` 통과 확인.

## §C. 위험 (Risks)

- **스키마 마이그레이션 되돌리기 비용**: `progress_stage` 컬럼 추가는 되돌리기 어려운 외부 상태 변경이다(다른 SPEC이 이후 이 컬럼을 참조할 수 있음). 완화: NOT NULL + DEFAULT 0으로 기존 행과의 하위 호환을 보장하고, 컬럼 제거가 필요해지면 별도 SPEC으로 처리.
- **`RunPipelineOptions` 계약 변경의 파급 범위**: `@MX:ANCHOR`로 표시된 이 인터페이스는 SPEC-GEMINI-RUNTIME-001/SPEC-RESEARCH-001이 앵커로 삼는다. 완화: 신규 필드는 선택적(optional)이므로 기존 호출부는 전혀 수정할 필요가 없다(REQ-018).
- **6→3 체크포인트 매핑의 주관성**(D1): "약관·법령 대조"를 `research()` 완료에 대응시키는 것은 라벨 문구와 코드 사이의 완벽한 1:1 대응이 아니다. 완화: 이 매핑 근거를 spec.md/design.md에 명시적으로 기록해 plan-auditor와 사용자가 검토·재조정할 수 있게 한다.

## §D. 피해야 할 안티패턴

- 관측되지 않은 시간 경과만으로 퍼센트를 자동 증가시키는 로직(REQ-013 위반).
- `progress_stage` UPDATE 실패를 파이프라인 예외로 전파(REQ-008 위반).
- `case-pending-indicator`의 `aria-live` 영역 안에 진행률 바를 중첩(REQ-016 위반).
- `runPipeline()` 기존 호출부에 `onStageProgress` 전달을 강제하는 필수 파라미터로 설계(REQ-018 위반 — 반드시 선택적이어야 함).
