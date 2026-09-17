# SPEC-CASE-PROGRESS-002 설계 문서

## §1. 아키텍처 개요

```
runPipeline(input, { providers, onStageProgress })
  ├─ CaseNormalizer (sync)
  ├─ QueryPlanner (sync)              ──► onStageProgress(1)
  ├─ EvidenceRetriever (async)        ──► onStageProgress(2)
  └─ withPipelineLock(async () => {
        runReview(initialProvider)
          ├─ Researcher (research())  ──► onStageProgress(3)
          ├─ Skeptic (challenge())
          └─ Verifier (verify())
        [에스컬레이션 조건 충족 시]
        runReview(premiumProvider)     // 2회차 — 동일하게 onStageProgress(3) 재발화(멱등)
          ├─ Researcher (research())  ──► onStageProgress(3)
          ├─ Skeptic (challenge())
          └─ Verifier (verify())
     })
  └─ return ResearchReport
```

`onStageProgress`는 파이프라인 오케스트레이터(`lib/pipeline/index.ts`) 내부에서만 호출되며, 파이프라인의 6개 단계 모듈(`case-normalizer.ts`, `query-planner.ts` 등)은 이 계측을 전혀 알지 못한다 — 파일 상단 주석("index.ts만 각 단계 모듈을 import하는 유일한 파일")이 명시하는 기존 아키텍처 제약을 그대로 존중한다.

## §2. 콜백 격리 설계 (D8의 구현 형태)

```ts
async function notifyStageProgress(
  stage: 1 | 2 | 3,
  onStageProgress: RunPipelineOptions["onStageProgress"]
): Promise<void> {
  if (!onStageProgress) return;
  try {
    await onStageProgress(stage);
  } catch (error) {
    console.error(
      JSON.stringify({ event: "pipeline_stage_progress_failed", stage, ...toSafeErrorMeta(error) })
    );
  }
}
```

이 헬퍼는 기존 `withStageLogging`/`withAsyncStageLogging`(76-96행)과 병렬적인 위치에 정의하되, 의도적으로 재throw하지 않는다는 점에서 그 둘과 다르다 — 진행률 계측 실패는 "이 단계 실행 자체의 실패"가 아니라 "부가 신호 전달의 실패"이기 때문이다. `toSafeErrorMeta`를 재사용해 화이트리스트 메타데이터만 로그에 남기는 기존 PII 최소화 원칙을 그대로 준수한다.

## §3. 6→3 체크포인트 매핑 근거 (D1 상세)

| 기술 단계 | 사용자 라벨과의 관계 | 체크포인트 부여 여부 |
|---|---|---|
| CaseNormalizer | 사용자 입력 정규화 — 4개 라벨 어디에도 직접 대응하지 않는 전처리 단계 | 없음(체크포인트 1과 동일 시점에 암묵적으로 완료) |
| QueryPlanner | "① 쟁점 자동 추출" — 사건 요약에서 조사할 쟁점(도메인/이슈타입) 목록을 산출 | **체크포인트 1** |
| EvidenceRetriever | "② 판례·결정례 검색" — 코드상 판례/결정례/약관/법령을 구분하지 않고 한 번에 검색 | **체크포인트 2**(②와 ③ 둘 다 "진행 중"으로 전이) |
| Researcher | "③ 약관·법령 대조" — 검색된 증거를 바탕으로 실제 조사·분석 수행 | **체크포인트 3**(②③ 모두 "완료"로 전이) |
| Skeptic | "④ 근거 검증 및 반대 논리 생성"의 "반대 논리" 부분 | 없음(체크포인트 4는 job 완료로 파생) |
| Verifier | "④ 근거 검증 및 반대 논리 생성"의 "근거 검증" 부분 | 없음(체크포인트 4는 job 완료로 파생) |

**왜 체크포인트 2에서 ②와 ③이 동시에 "진행 중"으로 전이하는가**: `EvidenceRetriever`는 `planQueries()`가 산출한 쿼리 목록 전체에 대해 단일 호출로 증거를 검색한다(`lib/pipeline/index.ts:106-108`). 판례·결정례 검색과 약관·법령 대조를 코드 수준에서 구분하는 별도 함수나 신호가 존재하지 않으므로, 이 둘을 인위적으로 분리하는 중간 퍼센트 값(예: 62.5%)을 만드는 것은 실제로 없는 정밀도를 지어내는 것과 같다 — REQ-CASE-PROGRESS-002-015 및 SPEC-UI-MIGRATION-001 AC-012의 정신에 위배된다. 대신 이 SPEC은 정직하게 "체크포인트 2가 완료되면 ②는 완료, ③은 진행 중"으로 표시하고, 체크포인트 3에서 ③이 완료로 전이하는 2단 표시를 채택한다.

## §4. DB 쓰기 경로 설계

```ts
// lib/cases/create-case.ts, processCaseJob() 내부
const report = await runPipeline(job.input as CaseInput, {
  onStageProgress: async (stage) => {
    try {
      await db
        .update(caseJobs)
        .set({ progressStage: stage })
        .where(
          and(
            eq(caseJobs.id, jobId),
            eq(caseJobs.leaseId, job.leaseId),
            eq(caseJobs.status, "processing")
          )
        );
    } catch (error) {
      console.error(
        JSON.stringify({ event: "progress_stage_update_failed", stage, ...toSafeErrorMeta(error) })
      );
    }
  },
});
```

이 UPDATE는 기존 완료 트랜잭션(444-459행)이 사용하는 것과 동일한 3중 펜싱 조건을 재사용한다 — 다른 실행이 이미 이 job의 리스를 재획득했거나 job이 이미 `"failed"`로 전환된 경우, 이 UPDATE는 조용히 0행에 적용되고 무시된다(레이스 컨디션에 안전).

**왜 이 UPDATE를 별도 트랜잭션으로 두는가(완료 트랜잭션에 포함하지 않는가)**: 완료 트랜잭션(397-460행)은 파이프라인이 끝난 **이후** 단 한 번만 실행된다. 반면 진행률 UPDATE는 파이프라인 실행 **도중** 여러 번(체크포인트 1, 2, 3) 발생해야 하므로 애초에 같은 트랜잭션에 속할 수 없다 — 각 UPDATE는 독립적인 단일 쿼리이며, `libSQL의 서버측 5초 잠금 타임아웃`(기존 주석 참고)과 무관하게 각각 즉시 커밋된다.

## §5. API 응답 설계

```ts
// app/api/cases/status/route.ts
const TOTAL_STAGES = ANALYSIS_STAGES.length; // 4

let progressStage = status === "completed" ? TOTAL_STAGES : job.progressStage;

if (status === "completed" && caseId) {
  return NextResponse.json({ status: "completed", caseId, progressStage });
}
if (status === "failed") {
  return NextResponse.json({ status: "failed", error: "..." });
}
return NextResponse.json({ status: "processing", progressStage });
```

`ANALYSIS_STAGES`를 이 서버 전용 라우트 파일에서 import해도 문제 없다(이 상수 모듈은 DB/Node 의존성이 없어 어디서든 안전하게 import 가능 — 기존 `lib/cases/job-timing.ts`와 동일한 설계 원칙). `failed` 분기는 기존과 동일하게 `progressStage`를 응답에 포함하지 않는다(실패 후에는 진행률이 의미가 없으므로).

## §6. UI 렌더링 설계

```tsx
const percent = Math.round((progressStage / ANALYSIS_STAGES.length) * 100);

<div
  role="progressbar"
  aria-valuemin={0}
  aria-valuemax={100}
  aria-valuenow={percent}
  data-testid="case-pending-progressbar"
  className="h-1.5 w-full overflow-hidden rounded-full bg-app-line"
>
  <div
    className="h-full rounded-full bg-bora-accent transition-[width] duration-300 ease-out"
    style={{ width: `${percent}%` }}
  />
</div>
```

- `role="progressbar"`와 `case-pending-stages` 목록은 `case-pending-indicator`(`aria-live="polite"`)의 **형제** 요소로 배치한다 — REQ-CASE-PROGRESS-002-016.
- `transition-[width] duration-300 ease-out`은 서버가 실제로 반환한 두 값(예: 25%→50%) 사이의 시각적 이동만을 매끄럽게 만드는 CSS 선언이다. 이는 데이터를 조작하는 것이 아니라 이미 알고 있는 목표값으로의 렌더링 방식을 선택한 것이며, `progressStage`가 갱신되지 않는 동안에는 폭이 고정된 채 정지한다(REQ-CASE-PROGRESS-002-013/015가 요구하는 "관측값 사이 보간 금지"와 상충하지 않는다 — CSS 전환은 두 관측값 "사이의 애니메이션"이 아니라 "이미 도달한 목표값으로의 전환 이펙트"다).
- `case-pending-stages` 각 `<li>`는 `progressStage`를 받아 인덱스 비교로 완료/진행 중/대기 라벨을 계산한다(순수 함수, 서버 값 외 다른 입력 없음).

## §7. 대안 검토 및 기각 사유

| 대안 | 기각 사유 |
|---|---|
| 6개 기술 단계를 그대로 6단계 사용자 라벨로 확장 | 사용자가 "extending the current static 4-stage list"라고 명시 — 라벨 개수 자체를 바꾸는 것은 범위 초과. 또한 영문 기술 이름(CaseNormalizer 등)을 그대로 노출하는 것은 UX상 부적절. |
| 시간 기반 추정 퍼센트(예: 평균 소요시간 기준 선형 보간) | REQ-CASE-PROGRESS-002-013이 명시적으로 금지 — "관측값 사이를 보간하거나 시간 경과만으로 자동 증가"는 SPEC-UI-MIGRATION-001 AC-012가 정의한 가짜 진행률과 본질적으로 같다. |
| SSE/WebSocket으로 실시간 푸시 전환 | 기존 폴링 인프라(리스 TTL·폴링 상한 조정, SPEC-PILOT-READY-001)를 건드리지 않고 필드 추가만으로 목표를 달성할 수 있어 범위를 최소화(§5 Out of Scope). |
| `progress_stage`를 `case_jobs.status`처럼 문자열 enum(`"issue_extraction"` 등)으로 정의 | 정수 인덱스가 `ANALYSIS_STAGES` 배열 인덱스와 직접 대응해 클라이언트 퍼센트 계산이 더 단순하다(D5). 문자열 enum은 오히려 배열 인덱스와의 매핑을 한 단계 더 거쳐야 한다. |
