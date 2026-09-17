# SPEC-CASE-PROGRESS-002 리서치 노트

이 문서는 spec.md/plan.md/design.md가 인용하는 모든 기존 소스 확인 근거의 원문 발췌를 담는다(직접 Read 도구로 확인, 추정 없음).

## 1. SPEC-CASE-PROGRESS-001의 "가짜 진행률 금지" 원칙 (반전 대상)

`.moai/specs/SPEC-CASE-PROGRESS-001/spec.md` REQ-CASE-PROGRESS-003 (Unwanted, 현재 §2.A):

> "이 SPEC이 추가하는 어떤 UI 요소도 숫자 퍼센트, `role="progressbar"`(또는 동등한 측정된 진행률을 암시하는 ARIA 역할), 애니메이션 진행률 바, 또는 "현재 어느 단계인지"를 특정해 강조하는 하이라이트를 렌더링해서는 안 된다 — `app/api/cases/status/route.ts`가 단계별 데이터를 전혀 반환하지 않으므로 그런 특정은 근거 없는 주장이 된다."

근거로 인용된 이유: "`app/api/cases/status/route.ts`가 단계별 데이터를 전혀 반환하지 않으므로." 이번 SPEC-CASE-PROGRESS-002는 정확히 이 전제(단계별 데이터의 부재)를 신규 계측(`onStageProgress` 콜백 + `progress_stage` 컬럼)으로 제거하므로, 원 REQ의 근거가 더 이상 성립하지 않는다.

同 문서 REQ-CASE-PROGRESS-002(현재 §2.A, 당시 번호):

> "While `case-input-form.tsx`의 `isSubmitting`이 true인 동안, 대기 Footer... 는 기존 단일 텍스트에 더해 REQ-CASE-PROGRESS-001의 4단계 라벨을 순서가 있는 정적 목록으로 함께 표시해야 하며, 각 단계에 개별 완료/진행/체크마크 상태를 부여해서는 안 된다(가짜 진행률 금지, SPEC-UI-MIGRATION-001 REQ-012/AC-012 원칙 승계)."

이 역시 이번 SPEC이 명시적으로 반전한다(§2.D REQ-CASE-PROGRESS-002-014).

## 2. `runPipeline()`의 6단계 구조 (`lib/pipeline/index.ts`)

98-178행 전체 확인. 핵심 발췌:

```
17	// 파이프라인 오케스트레이터 — 6단계(CaseNormalizer → QueryPlanner →
18	// EvidenceRetriever → Researcher → Skeptic → Verifier)를 순차 실행해
19	// seed evidence와 연결된 Research Report를 생성한다(REQ-SCAFFOLD-014,
20	// AC-SCAFFOLD-013). index.ts만 각 단계 모듈을 import하는 유일한 파일이다
21	// (AC-SCAFFOLD-012).
```

```
42	export interface RunPipelineOptions {
43	  providers?: RoleProviders;
44	}
```

```
98	export async function runPipeline(
99	  input: CaseInput,
100	  options: RunPipelineOptions = {}
101	): Promise<ResearchReport> {
102	  const { research: researchProvider, fast: fastProvider } =
103	    options.providers ?? getDefaultLLMProviders();
104	  const caseSummary = withStageLogging("CaseNormalizer", () => normalizeCase(input));
105	  const queries = withStageLogging("QueryPlanner", () => planQueries(caseSummary));
106	  const evidence = await withAsyncStageLogging("EvidenceRetriever", () =>
107	    retrieveEvidence(queries)
108	  );
109	  const verification = await withPipelineLock(async () => {
```

`runReview()` 내부(121-132행)와 에스컬레이션 재실행(134, 152행) — `research()` 호출은 초기 1회, 에스컬레이션 시 2회째(프리미엄 provider로) 실행될 수 있음을 확인:

```
121	    const runReview = async (provider: typeof researchProvider) => {
122	      const findings = await withAsyncStageLogging("Researcher", () =>
123	        research(queries, evidence, provider)
124	      );
125	      const challenges = await withAsyncStageLogging("Skeptic", () =>
126	        challenge(findings, evidence, fastProvider)
127	      );
128	      const result = await withAsyncStageLogging("Verifier", () =>
129	        verify(queries, findings, challenges, evidence, fastProvider)
130	      );
131	      return { findings, result };
132	    };
133	
134	    const initial = await runReview(initialResearchProvider);
135	    if (initialDecision.tier === "premium" || researchProvider === fastProvider) {
136	      return initial.result;
137	    }
138	
139	    const escalation = selectEscalation(queries, evidence, initial.findings, initial.result);
140	    if (!escalation) {
141	      return initial.result;
142	    }
143	    ...
144	    const premium = await runReview(researchProvider);
```

`@MX:ANCHOR` 마커(30-36행)가 `runPipeline()`이 `research()`/`challenge()`/`verify()`의 유일한 정상 앱 진입점임을 명시 — 이 인터페이스를 변경할 때는 이 앵커 계약(provider 인자 누락 시 컴파일 오류)을 깨서는 안 된다는 근거.

`withStageLogging`/`withAsyncStageLogging`(76-96행)의 기존 로깅 패턴 — 실패 시 `toSafeErrorMeta`로 화이트리스트 메타데이터만 기록 후 재throw:

```
76	function withStageLogging<T>(stage: string, task: () => T): T {
77	  try {
78	    return task();
79	  } catch (error) {
80	    console.error(
81	      JSON.stringify({ event: "pipeline_stage_failed", stage, ...toSafeErrorMeta(error) })
82	    );
83	    throw error;
84	  }
85	}
```

진행률 콜백 헬퍼(design.md §2)는 이 패턴을 차용하되 **재throw하지 않는다**는 점이 핵심 차이.

## 3. `case_jobs` 스키마 (`lib/db/schema.ts` 156-167행)

```
156	export const caseJobs = sqliteTable("case_jobs", {
157	  id: text("id").primaryKey(),
158	  ownerUserId: text("owner_user_id")
159	    .notNull()
160	    .references(() => user.id, { onDelete: "cascade" }),
161	  leaseId: text("lease_id").notNull(),
162	  input: text("input", { mode: "json" }).notNull(),
163	  status: text("status").notNull().default("queued"),
164	  caseId: text("case_id").references(() => cases.id, { onDelete: "set null" }),
165	  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
166	  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
167	});
```

단계/진행 관련 필드가 전혀 존재하지 않음을 확인 — `progress_stage` 컬럼 추가가 순수 ADD COLUMN(비파괴적 마이그레이션)임을 뒷받침.

## 4. `processCaseJob()`의 완료 트랜잭션 펜싱 조건 (`lib/cases/create-case.ts` 380-460행)

```
403	      const [current] = await tx
404	        .select({ leaseId: reservations.leaseId, expiresAt: reservations.expiresAt })
405	        .from(reservations)
406	        .where(eq(reservations.ownerUserId, job.ownerUserId));
...
444	      const [updatedJob] = await tx
445	        .update(caseJobs)
446	        .set({ status: "completed", caseId, updatedAt: now })
447	        .where(
448	          and(
449	            eq(caseJobs.id, jobId),
450	            eq(caseJobs.leaseId, job.leaseId),
451	            eq(caseJobs.status, "processing")
452	          )
453	        )
454	        .returning({ id: caseJobs.id });
```

이 3중 조건(`id` + `leaseId` + `status="processing"`)이 진행률 UPDATE(design.md §4)가 재사용하는 펜싱 패턴의 원본이다.

## 5. `/api/cases/status` 응답 형태 (`app/api/cases/status/route.ts` 전체 55행)

3가지 응답 형태만 존재함을 확인:

```
47	  if (status === "completed" && caseId) {
48	    return NextResponse.json({ status: "completed", caseId });
49	  }
50	  if (status === "failed") {
51	    return NextResponse.json({ status: "failed", error: "분석을 완료하지 못했습니다." });
52	  }
53	  return NextResponse.json({ status: "processing" });
```

`select` 절(20-23행)이 `status`/`caseId`만 조회함을 확인 — `progressStage`(=`progress_stage`) 추가 시 이 select 절도 함께 확장해야 함.

## 6. `job-timing.ts`의 폴링 상수 (SPEC-PILOT-READY-001 소유, 변경 금지 대상)

```
12	export const BACKGROUND_LEASE_TTL_SECONDS = 960;
15	const CLIENT_POLL_SAFETY_MARGIN_SECONDS = 60;
17	export const CLIENT_POLL_INTERVAL_MS = 2000;
23	export const CLIENT_POLL_MAX_ATTEMPTS = Math.floor(...)
```

DB/Node 의존성이 전혀 없는 순수 상수 모듈 — `lib/cases/analysis-stages.ts`와 동일한 설계 원칙(클라이언트 번들에 서버 코드가 섞이지 않음)을 이번 SPEC의 `ANALYSIS_STAGES` 재사용(design.md §5, §6)도 그대로 따른다.

## 7. `case-input-form.tsx`의 기존 대기 Footer 구조 (330-362행)

```
346	<div data-testid="case-pending-status" className="flex flex-col gap-2">
347	  <span
348	    data-testid="case-pending-indicator"
349	    role="status"
350	    aria-live="polite"
351	    className="text-body-s text-bora-ink-3"
352	  >
353	    처리 중입니다. 잠시만 기다려 주세요...
354	  </span>
355	  <ol data-testid="case-pending-stages" className="flex flex-col gap-1">
356	    {ANALYSIS_STAGES.map((stage, index) => (
357	      <li key={stage} className="text-label-s text-bora-ink-4">
358	        {index + 1}. {stage}
359	      </li>
360	    ))}
361	  </ol>
362	</div>
```

`case-pending-indicator`(`aria-live="polite"`)와 `case-pending-stages`(별도 `<ol>`, aria-live 없음)가 이미 **형제** 요소로 분리되어 있음을 확인 — 신규 `role="progressbar"` 요소를 이 구조 안에 추가할 때도 동일한 형제 배치 원칙을 유지하면 된다(REQ-CASE-PROGRESS-002-016).

## 8. `analysis-stages.ts` 공유 상수 (전체 11행)

```
5	export const ANALYSIS_STAGES = [
6	  "쟁점 자동 추출",
7	  "판례·결정례 검색",
8	  "약관·법령 대조",
9	  "근거 검증 및 반대 논리 생성",
10	] as const;
```

DB/Node 의존성 없음 — `app/api/cases/status/route.ts`(서버) 및 `lib/cases/create-case.ts`(서버)에서 import해도 번들 문제가 없음을 확인.

## 9. 마이그레이션 인프라 (`drizzle.config.ts`)

```
out: "./db/migrations",
schema: "./lib/db/schema.ts",
dialect: "turso",
```

`npm run db:generate`(= `drizzle-kit generate`)가 `./db/migrations/`에 마이그레이션 파일을 생성하는 기존 파이프라인을 그대로 사용한다 — 신규 마이그레이션 도구를 도입하지 않는다.

## 10. 기존 테스트 파일 위치 (M6 대상 확인)

- `lib/cases/create-case.test.ts` (기존 — `processCaseJob()` 테스트 확장 대상)
- `app/cases/new/case-input-form.test.tsx` (기존 — UI 테스트 확장 대상)
- `lib/pipeline/hybrid-pipeline.test.ts`, `lib/pipeline-gemini-boundary.test.ts` (기존 — 파이프라인 콜백 테스트를 여기 확장하거나 인접 신규 파일로 분리 검토)
- `app/api/cases/status/route.test.ts` — 기존 파일 존재 여부 미확인(find 결과 없음), M6에서 신규 작성 필요 가능성 높음
