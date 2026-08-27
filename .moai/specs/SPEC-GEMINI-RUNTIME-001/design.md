# SPEC-GEMINI-RUNTIME-001 — 설계 근거 (design.md)

원시 증거(코드 실측 + 공식 문서 fetch 결과)는 `research.md`에 있다. 이 문서는 그 증거로부터 내린 **설계 결정**만 다룬다.

## §0. 이 SPEC의 핵심 프레이밍

이번 SPEC은 **quota 우회가 아니라 quota 절약 + 복원력**이다. 여러 API 키/Google 계정을 돌려쓰는 방식은 명시적으로 범위 밖이다(§8). 대신 세 가지 독립적인 방어선을 쌓는다 — ① 호출 수 자체를 줄인다(사건당 N+N+1 → 3), ② 남은 호출을 스스로 페이싱한다(rate scheduler, **1차 방어선**), ③ 그래도 429/503이 발생하면 근거 있는 방식으로 재시도한다(bounded retry, **2차 안전장치**). 세 방어선은 서로 배타적이지 않고 겹겹이 쌓인다.

## §1. Requirement A — 역할별 Gemini 모델 분리

### 검증된 모델 ID (research.md §3.1)

이번 세션에서 `https://ai.google.dev/gemini-api/docs/models`를 직접 WebFetch해 확인한 결과, 사용자가 제안한 두 후보 모두 **Stable**로 확인됐다:

| 역할 | 환경변수 | 코드 기본값 | 공식 문서 상태 |
|---|---|---|---|
| Research(가장 복잡한 보험/판례/evidence 종합 reasoning) | `GEMINI_RESEARCH_MODEL` | `gemini-3.6-flash` | Stable |
| Fast(Skeptic + Verifier) | `GEMINI_FAST_MODEL` | `gemini-3.5-flash-lite` | Stable |

가공 없이 사용자가 제안한 값을 그대로 채택한다 — 오타나 존재하지 않는 ID였다면 대체값을 찾아야 했지만, 그렇지 않았다. 참고로 기존 `gemini-2.5-flash`도 여전히 Stable로 남아 있다(스모크가 관측한 404는 플랫폼 전체 폐기가 아니라 특정 신규 키/프로젝트에 국한된 현상이었다는 §7의 정정 근거와 정합).

### 아키텍처 결정 — "provider 2개 인스턴스" (provider 1개 + role 파라미터 스레딩이 아니라)

`lib/ai/provider.ts`의 `GenerateRequest`/`GenerateStructuredRequest`는 이미 `model?: string` 필드를 갖고 있고 `GeminiProvider.generate()`/`generateStructured()`는 이미 `request.model ?? this.model`을 SDK 호출에 반영한다(research.md §1) — 즉 "provider 인스턴스 1개 + 호출마다 model을 다르게 지정"하는 경로가 기술적으로는 이미 존재한다. 그럼에도 이번 설계는 **provider 인스턴스를 역할별로 2개(`researchProvider`/`fastProvider`) 만드는 쪽**을 채택한다. 이유는 Requirement C(rate scheduler)다 — "model별로 독립적으로 pacing"하려면 페이싱 상태(마지막 요청 시각)가 model별로 분리돼 있어야 하는데, provider 인스턴스가 이미 자기 자신의 재시도 상태(`maxRetries`/`initialDelayMs`)를 캡슐화하고 있는 기존 구조와 가장 자연스럽게 맞아떨어지는 것은 "이 provider 인스턴스 = 이 model + 이 model의 스케줄러"라는 1:1 대응이다. 만약 provider 1개 + 호출마다 model 지정 방식을 택하면, 스케줄러 상태를 provider 밖의 어딘가(예: 별도 맵)에 model 문자열로 keying해서 관리해야 하고, 이는 오히려 더 복잡해진다.

`research()`/`challenge()`/`verify()`의 **함수 시그니처는 전혀 바뀌지 않는다**(여전히 단일 `provider: LLMProvider` 인자) — SPEC-RESEARCH-001의 REQ-RESEARCH-010("오케스트레이터가 단일 지점에서 provider를 주입") 원칙을 그대로 지킨다. 바뀌는 것은 오케스트레이터(`runPipeline()`)가 **provider를 2개 준비해 역할에 맞게 각각 전달**한다는 점뿐이다:

```ts
// lib/ai/provider-factory.ts (재작성)
export interface RoleProviders {
  research: LLMProvider;
  fast: LLMProvider;
}

export function getLLMProviders(env: NodeJS.ProcessEnv = process.env): RoleProviders {
  if (env.LLM_PROVIDER_MODE === "deterministic") {
    const shared = createDeterministicLLMProvider();
    return { research: shared, fast: shared }; // 결정론적 모드는 역할 구분이 무의미 — 실제 model 문자열을 필요로 하지 않는다.
  }
  const apiKey = env.GEMINI_API_KEY;
  return {
    research: new GeminiProvider({
      apiKey,
      model: env.GEMINI_RESEARCH_MODEL,           // undefined면 GeminiProvider 자체 DEFAULT_MODEL로 폴백(방어적)
      rpmBudget: parseRpmBudget(env.GEMINI_RESEARCH_RPM_BUDGET),
    }),
    fast: new GeminiProvider({
      apiKey,
      model: env.GEMINI_FAST_MODEL,
      rpmBudget: parseRpmBudget(env.GEMINI_FAST_RPM_BUDGET),
    }),
  };
}
```

`lib/pipeline/index.ts`의 `RunPipelineOptions`는 `provider?: LLMProvider`(단일) 대신 `providers?: RoleProviders`로 바뀐다:

```ts
export async function runPipeline(input: CaseInput, options: RunPipelineOptions = {}): Promise<ResearchReport> {
  const { research: researchProvider, fast: fastProvider } = options.providers ?? getLLMProviders();
  return withPipelineLock(async () => {           // Requirement D, §3
    const caseSummary = normalizeCase(input);
    const queries = planQueries(caseSummary);
    const evidence = await retrieveEvidence(queries);
    const findings = await research(queries, evidence, researchProvider);
    const challenges = await challenge(findings, evidence, fastProvider);
    const verification = await verify(queries, findings, challenges, evidence, fastProvider);
    // ... 기존과 동일하게 ResearchReport 조립
  });
}
```

`GeminiProviderOptions`에 `model?: string`을 추가하고(REQ-GEMINI-RUNTIME-001), 생성자는 `this.model = options.model ?? DEFAULT_MODEL`로 바꾼다 — `DEFAULT_MODEL = "gemini-2.5-flash"`는 **role 해석이 실패했을 때의 방어적 최종 폴백**으로만 남긴다(정상 경로에서는 `provider-factory.ts`가 항상 역할별 기본값을 명시적으로 넘기므로 이 폴백이 실제로 쓰일 일은 드물다).

### `lib/env.ts` 변경 범위

Requirement A의 4개 신규 환경변수(`GEMINI_RESEARCH_MODEL`/`GEMINI_FAST_MODEL`/`GEMINI_RESEARCH_RPM_BUDGET`/`GEMINI_FAST_RPM_BUDGET`)는 전부 **코드 기본값을 가진 선택적 변수**이며, 그 어떤 스코프에서도 "필수"가 될 수 없다 — `REQUIRED_BY_SCOPE` 표에 추가하지 않고, `validateEnv()`의 조건부 게이트 대상에도 넣지 않는다(`GEMINI_API_KEY`와 다른 처리 — API 키는 값 자체가 없으면 아예 호출이 불가능하지만, model/budget은 항상 안전한 기본값으로 폴백 가능하기 때문). `VAR_INFO`에 항목을 추가하는 것도 실익이 없다(코드 실측: `VAR_INFO`는 `missing[]`에 담긴 변수의 오류 메시지에만 쓰이는데, 이 4개 변수는 애초에 `missing[]`에 들어갈 수 없다). 유일한 변경은 파일 상단 근처에 "이 4개 변수는 코드 기본값이 있어 검증 대상이 아니다"라는 한 줄 문서 주석 추가뿐이다.

## §2. Requirement B — Gemini 호출 배치 (Researcher/Skeptic N→1, Verifier 1 유지)

### 부분 배치 실패 설계 긴장과 해소 (양자택일 결정 — 근거 명시)

Verifier의 기존 배치 검증은 **배열 전체에 대한 `.refine()`**을 쓴다(candidate 소속 확인 / 정확히 1:1 대응(누락·중복 금지) / evidence 부분집합, research.md §1). 이걸 Researcher/Skeptic 배치에 그대로 복사하면, candidate 하나(query 하나 또는 finding 하나)가 위조 evidence ID를 인용하거나 응답에서 누락되기만 해도 `schema.safeParse()`가 배열 전체를 실패시켜 **그 배치의 모든 candidate 결과가 함께 사라진다** — 이는 사용자가 명시적으로 요구한 "일부 query에 finding이 없어도 전체 batch를 자동 실패시키지 않는다"와 정면 충돌한다.

**기술적으로 확인된 함정**: "`z.array(itemSchema)`의 item 스키마 안에 `.refine()`을 넣어 항목별로 스코프하면 부분 수용이 가능하다"는 아이디어는 **작동하지 않는다**. Zod의 `safeParse()`는 원자적(atomic)이다 — 배열 원소 하나라도 `.refine()`을 통과하지 못하면 Zod는 그 원소만 실패로 표시하는 게 아니라 **`result.success` 전체를 `false`**로 만든다. `.refine()`을 배열 레벨에 두든 item 레벨에 두든 최종 결과(`generateStructured()`의 `ok: false`)는 동일하다 — item-레벨 refine은 Verifier의 배열-레벨 refine과 똑같은 all-or-nothing 실패로 귀결된다.

**채택한 방식(옵션 2, 올바르게 구현) — "구조는 스키마로, 업무 규칙은 파싱 후 코드로"**: `generateStructured()`에 넘기는 Zod 스키마를 **구조(shape/타입)만** 검증하도록 좁히고("candidate 소속 확인"·"evidence 부분집합"·"1:1 대응"과 같은 업무 규칙은 스키마의 `.refine()`으로 넣지 않는다), `ok: true`가 반환된 뒤 Researcher/Skeptic 자신의 코드가 각 응답 항목에 대해 **그 항목에 귀속된** 검사(candidate 소속 → 부분집합 → safety-validator 순)를 개별 적용해, 실패한 항목만 "그 query/finding에 대한 결과 없음"으로 폐기한다(오늘의 per-query `continue`와 동일한 효과). 배치 응답 자체가 최상위에서 파싱 불가능한 경우(진짜 구조적 실패)만 그 호출 전체를 fail-closed 처리한다.

```ts
// lib/pipeline/researcher.ts (개념 — 정확한 필드명은 run-phase 확정)
const findingItemSchema = z.object({
  queryId: z.string(),
  summary: z.string().min(1),
  supportingEvidenceIds: z.array(z.string()),
}); // 구조만 검증 — refine 없음
const findingBatchSchema = z.object({ findings: z.array(findingItemSchema) });

// ok:true 이후, 각 candidate 자신의 validEvidenceIds Set을 조회해 개별 필터링
// (Verifier의 claimEvidenceById/caSupportingById와 동일한 per-candidate Map 조회 기법 재사용)
```

**두 가지가 이 결정으로 약화되지 않음을 확인**: (a) 위조 ID 방어 — 스키마 refine이든 코드 필터든 검사의 엄격함은 정확히 동일한 Set 멤버십 검사다. 차이는 실패 시 "무엇이 폐기되는가"(배열 전체 vs 그 항목 하나)뿐이다. (b) query별 evidence 격리(REQ-GEMINI-RUNTIME-008) — per-candidate Map 조회는 오히려 오늘 검증되지 않던 "같은 배치 내 다른 query/finding 소속 evidence 교차 인용"까지 정확히 같은 엄격함으로 새로 검증한다.

**Verifier와의 의도적 차이**: 이번 배치는 Verifier의 "정확히 1:1 대응(누락·중복 금지)" 요구를 채택하지 않는다 — 오늘의 per-query 독립 루프도 이미 "LLM이 특정 query에 응답하지 못하면 그냥 건너뛴다"는 관대한 계약이었기 때문이다. 누락된 query/finding은 결과 없음(오늘과 동일, Verifier의 기존 query↔finding 대조 로직이 `missingMaterials`로 흡수), 중복 응답은 첫 번째만 채택한다.

### Skeptic 배치의 추가 규칙 — 두 evidence 배열의 의미론 (Requirement C 원문)

`buildChallengePrompt()`(또는 그 배치 버전)와 `Challenge` 타입 문서 주석에 다음 두 역할을 명시적으로 서술한다:

- `supportingEvidenceIds` — **보험사(반론을 제기하는 쪽) 관점**에서 그 반론 자체를 뒷받침하는 근거.
- `counterEvidenceIds` — **피보험자/청구인 측**이 그 반론에 대해 반박 근거로 제시할 수 있는 근거.

두 배열 모두 여전히 "그 finding에 대해 EvidenceRetriever가 실제로 반환한 evidence 집합"의 부분집합이어야 한다. **`counterEvidenceIds`가 빈 배열이라는 사실 자체를 corpus 부족의 자동 증거로 취급하지 않는다** — 코드 주석이나 문서 어디에도 "0건 = corpus 부족"이라는 단정을 남기지 않는다(§7의 스모크 리포트 정정과 정합).

### Verifier — 변경 없음, model만 교체

`verify()`의 배치 구조·스키마·프롬프트는 이번 SPEC에서 수정하지 않는다. `runPipeline()`이 `fastProvider`(`GEMINI_FAST_MODEL`)를 넘겨주는 것으로 model만 바뀐다.

## §3. Requirement C — Free-tier rate scheduler (1차 방어선)

Google 문서(research.md §3.2)는 실제 quota를 하드코딩하지 말고 AI Studio 대시보드를 확인하라고 명시한다. 따라서 이번 스케줄러는 "Google이 보장하는 값"을 절대 주장하지 않고, **보상레이더가 스스로 부과하는 요청 예산(self-imposed budget)**만 다룬다.

```ts
// lib/ai/rate-scheduler.ts (신규, 프레임워크 없음 — 순수 인메모리 min-interval 게이트)
export interface RateSchedulerOptions {
  rpmBudget: number;                 // ex) 4 → 요청 시작 간 최소 간격 = 60000/4 = 15000ms
  nowFn?: () => number;              // 테스트 주입용 fake clock (기본 Date.now)
  sleepFn?: (ms: number) => Promise<void>; // 테스트 주입용 (기본 setTimeout 래핑)
}

export class RateScheduler {
  private lastStartedAt: number | null = null;
  constructor(private readonly opts: RateSchedulerOptions) {}

  async waitForSlot(): Promise<void> {
    const minIntervalMs = Math.ceil(60_000 / this.opts.rpmBudget);
    const now = (this.opts.nowFn ?? Date.now)();
    if (this.lastStartedAt !== null) {
      const remaining = minIntervalMs - (now - this.lastStartedAt);
      if (remaining > 0) await (this.opts.sleepFn ?? defaultSleep)(remaining);
    }
    this.lastStartedAt = (this.opts.nowFn ?? Date.now)();
  }
}
```

`GeminiProvider`는 생성자 옵션으로 `rpmBudget?: number`를 받아, 내부에 `RateScheduler` 인스턴스를 하나 소유한다(옵션이 없으면 스케줄러 비활성 — 예: 테스트 환경). `generate()`/`generateStructured()`는 실제 SDK 호출(`withRetry()` 내부) **직전에** `await this.scheduler?.waitForSlot()`를 호출한다. `researchProvider`와 `fastProvider`가 각각 자신만의 `RateScheduler` 인스턴스를 갖기 때문에, **모델별 독립 페이싱**이 자연스럽게 성립한다(§1의 "provider 2개 인스턴스" 결정이 여기서 값을 낸다).

`GEMINI_RESEARCH_RPM_BUDGET`/`GEMINI_FAST_RPM_BUDGET`이 설정되지 않으면 보수적인 코드 기본값(예: `4`)을 사용한다 — 이 기본값은 "Google이 보장하는 한도"가 아니라 "우리가 안전하다고 판단해 자체적으로 부과하는 상한"이라고 코드 주석과 runbook에 명시한다. `runtime-runbook.md`에는 "AI Studio Rate Limit 대시보드에서 실제 한도를 확인하고, 그 값의 약 70~80% 이하로 `*_RPM_BUDGET`을 설정하라"는 안내 문단을 추가한다(예: 실제 한도가 분당 5회면 budget=4).

## §4. Requirement D — 동시 사건 제한 (프로세스 로컬)

```ts
// lib/pipeline/index.ts 내부 (신규 헬퍼, 별도 파일 불필요할 만큼 작음)
let pipelineChain: Promise<unknown> = Promise.resolve();

function withPipelineLock<T>(task: () => Promise<T>): Promise<T> {
  const settled = pipelineChain.then(task, task); // 앞선 작업의 성공/실패와 무관하게 항상 실행
  pipelineChain = settled.then(
    () => undefined,
    () => undefined // 체인이 한번 끊기면 이후 모든 호출이 즉시 실행돼버리므로, 실패도 반드시 삼켜 체인을 이어간다
  );
  return settled;
}
```

이것은 **순수 인메모리 Promise 체인 뮤텍스**다 — 신규 의존성 없음, Redis 없음, 큐 프레임워크 없음. `runPipeline()`의 Gemini 호출 구간 전체(정확히는 `research()`→`challenge()`→`verify()`를 포함하는 본문 전체)를 이 락으로 감싸, 한 프로세스 안에서 동시에 여러 사건이 Gemini를 호출하지 않도록 직렬화한다. 두 번째 이후 호출은 예외 없이 자신의 차례를 "대기"할 뿐이다(에러로 거부되지 않는다).

**명시적 한계(문서화 필수, REQ-GEMINI-RUNTIME-013)**: 이것은 **프로세스 로컬** 보호일 뿐이다 — Node.js 모듈 스코프의 인메모리 변수이므로, Vercel의 서로 다른 serverless 인스턴스(별도 프로세스) 사이에서는 전혀 공유되지 않는다. "여러 인스턴스를 아우르는 분산 락"이라고 주장하지 않으며, 이번 SPEC은 Redis나 다른 durable 분산 큐를 도입하지 않는다. 실제 동시 사용자가 늘어나 여러 인스턴스에 걸친 조율이 필요해지면 별도 SPEC으로 다룬다 — 이번 SPEC은 단일 사용자/소수 파일럿 환경을 전제한다.

## §5. Requirement E — 429/503 재시도 복원력 (2차 안전장치)

### `retryDelay` 파싱 (research.md §2 SDK 소스 근거)

`ApiError.message`는 `throwErrorIfNotOK()`가 만든 `JSON.stringify(errorBody)` 문자열이다(원본 오류 JSON 전체를 담고 있음). `retryDelay`는 `JSON.parse(error.message)`로 다시 파싱해 `.error.details[]`에서 `"@type": "type.googleapis.com/google.rpc.RetryInfo"` 항목의 `.retryDelay`(예: `"41s"`)를 찾아야 한다 — `ApiError`/`ApiErrorInfo` 어디에도 `.details`가 1급 필드로 노출되지 않기 때문이다.

```ts
function parseRetryDelayMs(error: unknown): number | null {
  if (!(error instanceof Error)) return null;
  try {
    const parsed = JSON.parse(error.message) as {
      error?: { details?: Array<{ "@type"?: string; retryDelay?: string }> };
    };
    const info = parsed.error?.details?.find(
      (d) => d["@type"] === "type.googleapis.com/google.rpc.RetryInfo"
    );
    const match = info?.retryDelay ? /^(\d+(?:\.\d+)?)s$/.exec(info.retryDelay) : null;
    return match ? Math.round(Number(match[1]) * 1000) : null;
  } catch {
    return null; // message가 JSON이 아니거나 details가 없음 — 힌트 없음, 절대 예외를 던지지 않는다.
  }
}
```

### 503(UNAVAILABLE) 재시도 포함 — 공식 문서 근거

`https://ai.google.dev/gemini-api/docs/troubleshooting`(research.md §3.3, 이번 세션 직접 fetch): "재시도해야 함을 나타내는 오류(예: `429 RESOURCE_EXHAUSTED` 또는 `503 UNAVAILABLE`)"를 받으면 재시도하라고 명시하고, "일시적 오류(예: `429`, `408`, `5xx`)에만 재시도하라"고 규정한다 — **503을 429와 함께 공식적으로 일시적(transient)·재시도 가능으로 분류**한다. 이는 이번 SPEC이 조사한 것 중 가장 직접적인 1차 문서 근거이며(추정이 아님), REQ-GEMINI-RUNTIME-014가 이 근거를 그대로 반영한다. 인증 오류(401/403), 잘못된 요청(400), 스키마 검증 실패 등은 이 문서의 "transient" 분류에 들지 않으므로 재시도 대상에 포함하지 않는다(REQ-GEMINI-RUNTIME-015 — 이미 오늘 코드의 `isRateLimitError()`가 429 이외 오류를 즉시 전파하는 동작과 같은 원칙, 대상만 503까지 확장).

### 총 재시도/대기 시간 상한

```
delayMs = parseRetryDelayMs(error) ?? (initialDelayMs * 2 ** attempt)
delayMs = min(delayMs, MAX_SINGLE_DELAY_MS)   // 예: 60_000ms — SDK 자체 DEFAULT_RETRY_MAX_DELAY=60s와 동일 근거(research.md §2)
if attempt >= maxRetries OR cumulativeWaitMs + delayMs > maxTotalWaitMs:
    throw error   // 원본 오류 그대로 전파 — 삼키지 않는다
cumulativeWaitMs += delayMs
await sleepFn(delayMs)
attempt += 1
```
`maxRetries`(기존, 기본 3)와 신규 `maxTotalWaitMs`(기본값 예: 120_000ms)를 `GeminiProviderOptions`에 추가해 테스트에서 주입 가능하게 한다. 테스트는 전부 fake error 객체 + 기존 `sleepFn` 주입 지점을 사용하며 실제 Gemini 호출을 하지 않는다(REQ-GEMINI-RUNTIME-015, `gemini.test.ts` 기존 관례 그대로 계승).

## §6. Requirement F — 개인정보/데이터 최소화 확인

`lib/validation/case-input.ts`(research.md §1) 실측: `caseInputSchema`는 `.strict()`로 `incidentDescription`/`diagnosisName`/`disabilityBodyPart`/`incidentDate` 4개 필드만 허용하고, 그 안에서도 `piiFreeText()`가 주민등록번호·전화번호 패턴을 정규식으로 차단한다. 상세주소·진료기록/보험증권 원문은 스키마에 필드 자체가 없어 구조적으로 거부된다(field-omission 전략). Researcher/Skeptic/Verifier의 프롬프트는 이 4개 필드로부터 파생된 `NormalizedCase`와 curated evidence(제목/본문/출처)만 참조하며, 이번 SPEC은 이 계약에 **어떤 신규 필드도 추가하지 않는다** — Requirement A~E의 변경은 모두 model 선택/호출 배치/재시도/페이싱/동시성 계층에 국한되며 프롬프트가 참조하는 입력 데이터의 종류를 넓히지 않는다. 이를 spec.md의 명시적 제약으로 기록하고, acceptance.md에 "기존 caseInputSchema PII 차단 테스트가 회귀 없이 통과"를 검증 조건으로 포함한다.

## §7. `.moai/reports/gemini-smoke-20260827.md` 정정 대상 (run-phase에서 정확히 이 문구로 교체)

**정정 대상 ①** (파일 19-20행 부근) — 원문: `404 NOT_FOUND` — `models/gemini-2.5-flash`가 신규 유저 계정에서는 더 이상 제공되지 않음.
정정문: "이번 smoke에 사용한 신규 API key/project에서 `gemini-2.5-flash` 호출 시 404 NOT_FOUND를 관측함. 전체 Gemini 사용자에 대한 서비스 종료로 단정하지 않는다."

**정정 대상 ②** (파일 56-60행 부근, "핵심 발견") — 원문: 파이프라인 구조 문제가 아니라 근거자료 corpus의 양과 다양성 부족이 원인으로 보인다.
정정문: "`counterEvidenceIds` 0은 실측 사실이다. 가능한 원인은 corpus 부족, retriever 후보 부족, Skeptic prompt semantics, 모델 선택 behavior 등이며, corpus 부족은 그 중 하나의 가설일 뿐 확정된 원인이 아니다."

## §8. Out of Scope와의 경계 재확인

이번 SPEC은 여러 API 키/Google 계정을 돌려 quota를 우회하는 방식(multi-key rotation pool)을 다루지 않는다 — 그 대신 호출 수 감소(§2) + 자체 페이싱(§3) + 근거 있는 bounded retry(§5)로 안정성을 확보한다. Vector DB/임베딩/크롤러/Elasticsearch, Redis/BullMQ/분산 큐, Vercel 전역 semaphore, feedback 구조 개선, UI 폴리싱, 지급확률/예상보험금 계산 기능도 범위 밖이다(spec.md §4).
