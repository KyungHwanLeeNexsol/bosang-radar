# SPEC-GEMINI-RUNTIME-001 — 구현 계획 (plan.md)

## §A. 접근 방식 (Approach)

이 SPEC은 **대체가 아니라 계층 추가 + 국소 재작성**이다 — 6단계 파이프라인의 순차 실행 골격, evidence-first 원칙, Verifier의 기존 배치 검증 구조, Gemini SDK confinement, safety-validator 방어선은 그대로 유지한다(§A.5 PRESERVE). 새로 도입하는 것은 (1) `lib/ai/rate-scheduler.ts`(신규 파일, model ID 단위로 공유될 수 있는 `RateScheduler` 클래스), (2) provider를 역할별로 2개 준비하되 model ID가 같으면 스케줄러를 공유하는 오케스트레이션 계층, (3) Researcher/Skeptic 내부의 호출 배치 로직, (4) `runPipeline()` 내부의 프로세스 로컬 동시성 락, (5) `GeminiProvider.withRetry()`와 스케줄러가 통합된 재시도 루프다.

마일스톤은 **가장 되돌리기 어려운 아키텍처 결정(RateScheduler 클래스 + provider 구성 방식, 배치 스키마 검증 방식)을 먼저 확정**하고, 그 결정 위에서 상대적으로 독립적인 신규 메커니즘(재시도-스케줄러 통합 루프, 동시성 락)을 순서대로 쌓은 뒤, 마지막에 기계적 배선(env/문서/deterministic 픽스처)과 최종 검증을 배치한다.

> **외부 독립 리뷰 반영(3차 개정)**: M1을 "provider 아키텍처"와 "rate scheduler"로 나눴던 이전 버전을 하나로 합쳤다 — design.md §1이 model 문자열 확정과 스케줄러 공유 여부(model ID 동일성 기준)를 **같은** `provider-factory.ts` 함수 안에서 함께 결정하도록 재설계됐기 때문에, `RateScheduler` 클래스가 먼저 존재해야 `provider-factory.ts`를 작성할 수 있다는 의존 순서가 생겼다. M3(구 M5)도 "재시도"에서 "재시도+스케줄러 통합"으로 범위가 넓어졌다 — `waitForSlot()` 호출이 `withRetry()` 루프 내부로 옮겨졌기 때문에 두 로직을 분리해서 구현할 수 없다.

## §A.5 PRESERVE 목록 (변경 금지 대상)

1. **파이프라인 순차 실행 구조** — `runPipeline()`이 6단계를 순차 실행하는 구조. 병렬화하지 않는다. 동시성 제한(M4)은 "여러 사건 간" 직렬화이지, 한 사건 내부의 단계 순서를 바꾸는 것이 아니다.
2. **형제-import 금지 경계** — `lib/pipeline/boundary.test.ts` 자체는 수정하지 않는다. Researcher/Skeptic 배치 재작성은 각 파일 내부에 국한되며 신규 형제 import를 추가하지 않는다.
3. **Gemini SDK confinement** — `lib/pipeline-gemini-boundary.test.ts`가 검증하는 "`lib/pipeline/*.ts`는 `@google/genai`를 직접 import하지 않는다" 규칙. 신규 `lib/ai/rate-scheduler.ts`도 `lib/ai/` 하위이므로 이 규칙의 대상이 아니다(researcher.ts/skeptic.ts는 여전히 `LLMProvider` 추상화에만 의존).
4. **Verifier 내부 로직 전체** — `buildSemanticVerificationSchema`/`buildSemanticVerificationPrompt`/`verify()` 본문은 수정하지 않는다. 유일한 변경은 `runPipeline()`이 `verify()`에 넘기는 provider 인스턴스뿐이다.
5. **`research()`/`challenge()`/`verify()`의 함수 시그니처** — 여전히 단일 `provider: LLMProvider` 인자를 받는다(design.md §1). role 선택은 오케스트레이터(`runPipeline()`) 수준에서만 이루어진다.
6. **safety-validator 3개 적용 지점** — Researcher(요약), Skeptic(반론), Verifier(최종 status-무관 스캔). 배치 전환 후에도 항목별로 그대로 적용한다.
7. **`caseInputSchema`/`validateCaseInput()`** — `lib/validation/case-input.ts`는 이번 SPEC에서 수정하지 않는다(그 계약을 정확히 문서화하는 것은 M5의 범위다 — 코드 자체는 무변경).
8. **버전 고정** — `@google/genai` 2.18.0(`<3.0.0`), `zod` 4.4.3. 신규 런타임 의존성 없음.
9. **`ResearchReport`/`DraftFinding`/`Challenge`/`VerifiedClaim` 필드 구조** — Skeptic의 `Challenge` 문서 주석만 갱신하고(M2), 필드 자체는 추가/삭제하지 않는다.

## §B. 마일스톤

### M1 — RateScheduler 클래스 + 역할별 provider 아키텍처 확정 (D1+D3, 가장 되돌리기 어려운 결정)

- `lib/ai/rate-scheduler.ts`(신규, 먼저 작성 — provider-factory.ts가 이를 참조하므로 의존 순서상 M1 최우선): `RateScheduler` 클래스 — `waitForSlot()`, `rpmBudget`(읽기 전용 public 필드로 노출 — provider-factory.ts가 두 budget 중 min을 계산할 때 참조), `nowFn`/`sleepFn` 옵션(design.md §3). 순수 인메모리 min-interval 게이트, 신규 의존성 없음.
- `lib/ai/provider.ts`: 변경 없음(`model?` 필드가 이미 `GenerateRequest`/`GenerateStructuredRequest`에 존재함을 재확인만 함, design.md §1).
- `lib/ai/providers/gemini.ts`: `GeminiProviderOptions`에 `model?: string`, **`scheduler?: RateScheduler`**(D3 — 더 이상 `rpmBudget: number`를 직접 받지 않는다, 이미 구성된 인스턴스를 주입받는다), `maxTotalWaitMs?: number` 추가. 생성자 `this.model = options.model ?? DEFAULT_MODEL`(`DEFAULT_MODEL`을 `"gemini-2.5-flash"`에서 **`"gemini-3.5-flash-lite"`**로 교체 — D1, design.md §1의 "정상 경로가 구조적으로 도달하지 않는 방어적 최종 폴백" 근거).
- `lib/ai/provider-factory.ts`: `getLLMProvider()` 단일 함수를 `getLLMProviders(env): { research: LLMProvider; fast: LLMProvider }`로 재작성(design.md §1). **model 문자열은 `GeminiProvider` 생성 이전에 확정**한다(`env.GEMINI_RESEARCH_MODEL ?? "gemini-3.6-flash"`, `env.GEMINI_FAST_MODEL ?? "gemini-3.5-flash-lite"` — D1, `GeminiProvider` 자신의 내부 폴백에 위임하지 않음). `LLM_PROVIDER_MODE === "deterministic"`이면 `{ research: shared, fast: shared }`(동일 결정론적 인스턴스). 확정된 `researchModel`/`fastModel`이 **같으면** `RateScheduler` 인스턴스 하나를 `min(researchBudget, fastBudget)`으로 생성해 두 역할에 공유하고, **다르면** 각각 독립된 인스턴스를 생성한다(D3 — 일반 registry/Map 없이 단순 동등성 비교로 구현, 역할이 2개뿐이므로 이것으로 충분).
- `lib/ai/provider-factory.ts`(같은 파일, 추가 함수 — 외부 독립 리뷰 4차 지적 D-NEW1): `getLLMProviders(env)`(순수 함수, 매 호출마다 새로 구성 — 테스트 주입 전용으로 계속 사용) 옆에 인자 없는 `getDefaultLLMProviders()`를 추가한다. 모듈 스코프 `let defaultProviders: RoleProviders | undefined`에 최초 호출 시 `getLLMProviders(process.env)` 결과를 캐시하고, 이후 호출은 캐시된 인스턴스를 그대로 반환한다(design.md §1 D-NEW1). `RateScheduler`의 `lastStartedAt` 상태가 이 캐시된 provider(그 안의 `RateScheduler`)를 통해 사건 A→사건 B 경계를 넘어 프로세스 생애주기 동안 보존된다.
- `lib/pipeline/index.ts`: `RunPipelineOptions.provider?: LLMProvider`를 `RunPipelineOptions.providers?: { research: LLMProvider; fast: LLMProvider }`로 변경. `runPipeline()`은 `options.providers ?? getDefaultLLMProviders()`(D-NEW1 — 정상 앱 경로에서 프로세스 생애주기 싱글턴을 재사용, 사건마다 새로 구성하지 않음)로 역할별 provider를 얻어 `research()`에는 `researchProvider`, `challenge()`/`verify()`에는 `fastProvider`를 전달. `options.providers`가 명시적으로 주어지는 테스트 경로는 이 싱글턴을 전혀 거치지 않는다.
- 기존 `getLLMProvider(env)` 호출부(단위 테스트 stub 포함)를 `getLLMProviders(env)` 형태로 갱신. `provider-factory.test.ts` 전면 재작성 필요 — model-ID 동일/상이 두 경로 모두 커버 + `getDefaultLLMProviders()`의 싱글턴 캐싱(두 번째 호출이 첫 번째와 동일 참조를 반환하는지) 검증.
- `rate-scheduler.test.ts`(신규): fake clock/sleep으로 동일 스케줄러에 대한 최소 간격 검증, budget 값 검증.
- REQ 커버리지: REQ-GEMINI-RUNTIME-001, REQ-GEMINI-RUNTIME-002, REQ-GEMINI-RUNTIME-003, REQ-GEMINI-RUNTIME-011, REQ-GEMINI-RUNTIME-012, REQ-GEMINI-RUNTIME-022, REQ-GEMINI-RUNTIME-025.

### M2 — Researcher/Skeptic 배치 스키마 재설계 (design.md §2의 옵션 2 구현, 변경 없음)

- `lib/pipeline/researcher.ts`: `buildFindingSchema(validEvidenceIds)`(단건, `.refine()` 포함, `supportingEvidenceIds.min(1)` 그라운딩 보증 포함) 폐기 → `buildFindingBatchSchema()`(구조만 검증하는 `z.object({ findings: z.array(itemSchema) })`, `.refine()`/`.min()` 없음)로 교체. `buildResearchPrompt()`도 배치 버전(`buildResearchBatchPrompt(candidates)`)으로 교체 — 각 query 블록을 `[RESEARCH] 쿼리 ID: <id>`로 시작(design.md §6 마커 규칙). `research()` 본문을 "evidence 있는 query만 candidate로 모아 1회 논리적 호출 → `ok:true`면 각 응답 항목에 대해 (a) candidate 소속 확인 (b) 중복 queryId는 첫 항목만 채택 (c) `supportingEvidenceIds.length >= 1`(D-NEW2 — 위반 시 그 항목만 폐기, per-query 스키마가 하던 `.min(1)` 그라운딩 보증을 사후-검증으로 재배치) (d) evidence ID가 그 query 고유의 유효 집합의 부분집합인지 (e) `findSafetyViolations()` 순서로 개별 필터링 → 통과한 것만 `DraftFinding[]`에 push"로 재작성. `ok:false`(최상위 파싱 실패)는 이번 호출에서 findings 없음으로 처리.
- `lib/pipeline/skeptic.ts`: 동일 패턴으로 `buildChallengeBatchSchema()`/`buildChallengeBatchPrompt()`(마커 `[SKEPTIC] 쿼리 ID: <id>`) 도입. 프롬프트에 `supportingEvidenceIds`(보험사 관점 뒷받침)/`counterEvidenceIds`(피보험자·청구인 관점 반박) 두 역할을 명시적으로 지시하는 문장 추가(design.md §2 Requirement C). `challenge()` 본문을 배치 1회 호출 + 항목별 필터링(candidate 소속, 양쪽 evidence ID 부분집합, safety-validator)으로 재작성. `Challenge.findingId`는 여전히 코드에서 `finding.queryId`로 직접 부여(LLM 출력에 없음, 기존 계약 유지).
- `lib/pipeline/types.ts`: `Challenge.supportingEvidenceIds`/`counterEvidenceIds` 문서 주석을 두 역할이 명시적으로 드러나도록 갱신(필드 자체는 무변경).
- `researcher.test.ts`/`skeptic.test.ts`: 배치 호출 검증(1회 호출, query/finding association 보존, cross-candidate evidence ID 차단, forged queryId 차단, partial 실패 시 나머지 항목 보존, safety-validator 회귀 없음, **Researcher 항목의 빈 `supportingEvidenceIds`가 해당 항목만 개별 폐기시키고 같은 배치의 다른 정상 항목·배치 전체에는 영향을 주지 않음(D-NEW2, acceptance.md AC-GEMINI-RUNTIME-009a)**)으로 전면 재작성.
- REQ 커버리지: REQ-GEMINI-RUNTIME-004, REQ-GEMINI-RUNTIME-005, REQ-GEMINI-RUNTIME-007, REQ-GEMINI-RUNTIME-008, REQ-GEMINI-RUNTIME-009, REQ-GEMINI-RUNTIME-010.

### M3 — 429/503 재시도 로직 + 스케줄러 통합 루프 재설계 (D2, 2차 안전장치)

- `lib/ai/providers/gemini.ts`: `parseRetryDelayMs(error)` 헬퍼 추가(design.md §5, `JSON.parse(error.message)` → `error.details[]`의 `RetryInfo.retryDelay` 파싱, 실패 시 `null`). 재시도 대상 상태 코드를 429뿐 아니라 503도 포함하도록 판정 로직 확장. `withRetry()`를 **"루프 최상단에서 매 시도(최초 + 모든 재시도)마다 `await this.scheduler?.waitForSlot()` 호출 → 실제 호출 시도 → 실패 시 힌트 있으면 힌트, 없으면 지수 백오프 → 단일 지연 상한(`MAX_SINGLE_DELAY_MS`) 적용 → 총 재시도 횟수(`maxRetries`) 또는 총 누적 대기 시간(`maxTotalWaitMs`) 중 먼저 도달하는 쪽에서 원본 오류 전파, 아니면 `sleepFn` 대기 후 루프 최상단으로 복귀"** 구조로 재작성(design.md §5, D2 — 이전 버전은 `waitForSlot()`을 `withRetry()` 호출 전 1회만 실행해 재시도 시도가 스케줄러를 우회하는 결함이 있었다).
- `gemini.test.ts`: 기존 429 테스트(지수 백오프) 유지 + 신규(retryDelay 힌트 반영, 503 재시도, 총 대기 시간 상한 도달 시 예외 전파, 비일시적 오류(400 등) 즉시 전파 무변경 확인, **그리고 D2 — `rpmBudget`이 낮게 설정된 스케줄러가 주입된 상태에서 재시도가 스케줄러의 다음 가용 슬롯보다 먼저 발사되지 않는지**) 추가. 전부 fake error 객체 + 주입된 `sleepFn`/`nowFn` 사용, 실제 네트워크 없음.
- REQ 커버리지: REQ-GEMINI-RUNTIME-015, REQ-GEMINI-RUNTIME-016, REQ-GEMINI-RUNTIME-021.

### M4 — 동시 사건 제한 + 사건 경계 간 스케줄러 상태 보존 검증 (프로세스 로컬 락 + D-NEW1 통합 테스트)

- `lib/pipeline/index.ts`: 모듈 스코프 `pipelineChain` Promise 체인 뮤텍스(design.md §4) 추가, `runPipeline()`의 Gemini 호출 구간 전체를 `withPipelineLock()`으로 감쌈. 파일 상단에 "프로세스 로컬 보호이며 분산 락이 아니다. 대기 시간에 참된 상한은 없다(design.md §4 D4 참고)"라는 `@MX:NOTE` 문서화.
- `index.test.ts`: (a) 두 `runPipeline()` 동시 호출이 직렬화되는지(두 번째 호출의 Gemini 관련 부분이 첫 번째 완료 후 시작) fake provider의 호출 타이밍으로 검증. (b) **D-NEW1 신규** — `getDefaultLLMProviders()` 싱글턴을 통해 사건 A → 사건 B를 순차 실행할 때, Fast 역할 `RateScheduler`의 `lastStartedAt`이 사건 A의 마지막 실제 시도 시각을 유지한 채 사건 B로 이어지는지(사건 B가 새로 초기화된 스케줄러처럼 즉시 발사되지 않는지) fake clock으로 검증.
- REQ 커버리지: REQ-GEMINI-RUNTIME-013, REQ-GEMINI-RUNTIME-014, REQ-GEMINI-RUNTIME-025.

### M5 — deterministic.ts 배치 픽스처 확장 + env/문서 배선 (기계적 배선 + D5 문서화)

- `lib/ai/providers/deterministic.ts`: `isResearchBatchPrompt`/`isSkepticBatchPrompt` 판별(마커 `[RESEARCH] 쿼리 ID: `/`[SKEPTIC] 쿼리 ID: `) + 각각의 배치 파서·픽스처 생성 함수 추가(design.md §6, 기존 `parseSemanticPrompt`의 블록 분리 기법 재사용). 기존 `isSemanticPrompt`/`parseSemanticPrompt`/`structuredFixturesForPrompt`/`candidateStructuredFixtures`는 무변경(순수 추가).
- `.env.local.example`: `GEMINI_RESEARCH_MODEL`/`GEMINI_FAST_MODEL`/`GEMINI_RESEARCH_RPM_BUDGET`/`GEMINI_FAST_RPM_BUDGET` 4개 항목을 `[scope: app]` 관례로 추가, 각각 선택적이며 코드 기본값이 있음을 명시.
- `lib/env.ts`: 4개 변수 모두 검증 대상이 아니라는 한 줄 문서 주석만 추가(기능 변경 없음, design.md §1).
- `.moai/docs/runtime-runbook.md`(D5 — 신규 문단 3개): (a) 모델 선택(선택 사항, 기본값 명시) 문단 + rate budget 설정 안내 문단("AI Studio 대시보드에서 실제 한도 확인 후 약 70~80% 이하로 설정") — 기존 계획대로. (b) **개인정보 비-보증 정정 문단**: `caseInputSchema`가 주민등록번호/전화번호 정규식과 스키마 외 필드만 구조적으로 차단할 뿐, 자유 텍스트 필드의 완전한 비식별화를 보증하지 않는다는 사실(design.md §6 D5-a, REQ-GEMINI-RUNTIME-023). (c) **파일럿 데이터 취급 계약 문단**: 합성/사전 비식별화 사건만 사용, 실명·주민등록번호·전화번호·상세주소가 포함된 실 사건·원본 진료기록·원본 보험증권 문서 입력 금지, 외부 파일럿 확장 시 별도 데이터 처리/정책 적합성 검토 선행 필요, Google 무료 tier가 제출 콘텐츠를 사람 검토·제품 개선에 사용할 수 있다는 사실을 `https://ai.google.dev/gemini-api/docs/pricing`/`https://ai.google.dev/gemini-api/terms` 인용과 함께 명시(design.md §6 D5-b/D5-c, REQ-GEMINI-RUNTIME-024).
- `deterministic.test.ts`: 신규 배치 마커 인식 + N-쿼리/N-finding 픽스처 생성 검증.
- REQ 커버리지: REQ-GEMINI-RUNTIME-023, REQ-GEMINI-RUNTIME-024 (그 외 REQ-GEMINI-RUNTIME-002/003/004/005/011/012의 문서·픽스처 측면 보강, 신규 REQ 번호 부여 없음).

### M6 — 비회귀 검증 + smoke report 정정 + 수동 실 Gemini 스모크 (마무리)

- `.moai/reports/gemini-smoke-20260827.md`: design.md §7에 명시된 정확한 원문·정정문으로 두 문구 교체.
- 전체 회귀: `pnpm test`, `pnpm lint`, `pnpm format:check`, `pnpm build`, `pnpm test:e2e` 5종 게이트 통과 확인. `lib/pipeline/boundary.test.ts`, `lib/pipeline-gemini-boundary.test.ts` 무수정 통과 재확인. `lib/pipeline/types.ts`의 4개 인터페이스(`DraftFinding`/`Challenge`/`VerifiedClaim`/`ResearchReport`) 키 집합 불변 확인(acceptance.md AC-022a).
- 정상 경로 전체 파이프라인이 `LLM_PROVIDER_MODE=deterministic`에서 여전히 end-to-end 통과하는지 확인(`e2e/*.spec.ts` 기존 시나리오 무회귀).
- **수동 실 Gemini 스모크(자동화 아님)**: acceptance.md §C의 정확한 PASS 조건에 따라 1회 수행. 이 milestone은 코드 변경이 아니라 검증 절차이며, 구현 완료 후 사용자 승인 하에 별도로 수행한다.
- REQ 커버리지: REQ-GEMINI-RUNTIME-006, REQ-GEMINI-RUNTIME-017, REQ-GEMINI-RUNTIME-018, REQ-GEMINI-RUNTIME-019, REQ-GEMINI-RUNTIME-020.

## §C. 사전 점검 (Pre-flight)

```bash
# 1. 현재 브랜치/베이스라인 확인
git branch --show-current
git rev-parse HEAD

# 2. 크로스플랫폼 빌드 사전 확인
pnpm build

# 3. 기존 lint 베이스라인 측정
pnpm lint

# 4. PRESERVE 대상 파일 목록 확인
git ls-files lib/pipeline/boundary.test.ts lib/pipeline-gemini-boundary.test.ts lib/validation/case-input.ts lib/pipeline/verifier.ts

# 5. 설치된 @google/genai 버전 재확인(design.md §5 실측 근거의 전제 조건)
node -e "console.log(require('@google/genai/package.json').version)"
```

## §D. 위험 (Risks)

- **provider 2-인스턴스 아키텍처 + 스케줄러 주입 방식의 반전 가능성**: design.md §1이 "GeminiProvider가 자체적으로 rpmBudget을 받아 스케줄러를 만든다" 대신 "이미 구성된 `RateScheduler` 인스턴스를 주입받는다"로 바꾼 근거는 model ID가 같을 때 인스턴스를 공유해야 하기 때문이다(D3) — 만약 run-phase에서 실제로 구현해 보니 이 주입 방식이 테스트 작성을 복잡하게 만든다고 판명되면, "provider-factory.ts가 스케줄러를 만들고 그 참조를 GeminiProvider에 넘긴다"는 현재 구조를 유지하되 헬퍼 함수로 감싸는 정도의 조정은 가능하다 — `getLLMProviders()`의 외부 계약(`{research, fast}` 반환)은 어느 경우든 동일하게 유지된다.
- **배치 스키마의 "구조만 검증" 설계가 실제 LLM 응답 품질에 미치는 영향 미검증**: design.md §2의 옵션 2는 이론적으로는 옳지만, 구조 검증만으로 완화된 스키마가 실제 Gemini 응답에서 필드 누락·타입 오류를 늘리지는 않는지는 결정론적 테스트만으로는 완전히 검증되지 않는다 — acceptance.md §C의 수동 스모크가 이를 1차로 확인한다.
- **rate scheduler 기본 RPM 값의 보수성**: 코드 기본값(예: 4 RPM)이 실제 계정의 Free tier 한도보다 여전히 낮은지 이번 조사에서는 계정별로 확인할 수 없었다(research.md §4) — 첫 실 스모크 이후 값 조정이 필요할 수 있다.
- **재시도-스케줄러 통합 루프의 테스트 복잡도(D2 신규 위험)**: `withRetry()`가 이제 스케줄러 대기와 재시도 백오프를 한 루프 안에서 교차시키므로, fake clock(`nowFn`)과 fake sleep(`sleepFn`)을 정밀하게 제어하지 못하면 테스트가 타이밍에 취약(flaky)해질 수 있다 — M3의 테스트는 실제 `setTimeout`을 쓰지 않고 전부 결정론적 fake clock 진행(수동으로 시각을 증가시키는 방식)으로 작성해야 한다.
- **동시성 락 + 스케줄러 싱글턴이 Next.js dev server의 hot-reload/여러 워커에서 상태를 유지하는지**: 모듈 스코프 변수(`pipelineChain`, D-NEW1의 `defaultProviders`)는 Next.js dev 모드의 모듈 재평가(hot reload)로 초기화될 수 있다 — 이는 개발 환경에서만의 사소한 위험이며(락/싱글턴이 일시적으로 리셋돼도 안전 방향으로만 작동 — 최악의 경우 "직렬화가 한 번 스킵된다" 또는 "스케줄러 페이싱 기억이 한 번 리셋된다"이지 오류나 데이터 손상이 아니다), 프로덕션(`pnpm build && pnpm start`)에서는 문제되지 않는다.
- **파일럿 데이터 취급 계약은 운영 준수에 의존(D5 신규 위험)**: M5에서 문서화하는 "합성/사전 비식별화 데이터만 사용" 계약은 코드로 강제되지 않는다(DLP/NER 자동 검증은 이번 SPEC 범위 밖) — 운영자가 문서를 읽고 실제로 준수하는지는 이 SPEC이 통제할 수 없는 운영 절차의 영역이다.
