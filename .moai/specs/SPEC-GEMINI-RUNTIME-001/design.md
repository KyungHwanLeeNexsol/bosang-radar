# SPEC-GEMINI-RUNTIME-001 — 설계 근거 (design.md)

원시 증거(코드 실측 + 공식 문서 fetch 결과)는 `research.md`에 있다. 이 문서는 그 증거로부터 내린 **설계 결정**만 다룬다.

> **개정 이력**: 이 버전은 외부 독립 리뷰가 지적한 6개 blocking 결함(D1~D5, D5가 데이터 사용 정책 재검증까지 포함) 반영판이다 — spec.md HISTORY 참고. §1(D1/D3 반영 전면 재작성), §3(D2 참조 추가), §4(D4 관련 상호참조 추가), §5(D2 반영 — 스케줄러가 매 재시도 시도에도 적용), §6(D5 반영 — 개인정보 과잉주장 정정 + 파일럿 데이터 계약 + Google 무료 tier 데이터 사용 정책)이 바뀌었다. §2/§7/§8은 이전 버전과 실질적으로 동일하다(사소한 상호참조만 추가).
>
> **개정 이력(5차)**: §2에 외부 독립 리뷰가 지적한 그라운딩 계약 회귀 결함(D-NEW2)을 반영 — 사후-파싱 업무 규칙 검증 순서에 Researcher 항목 한정 `supportingEvidenceIds.length >= 1` 단계를 명시적으로 추가했다. spec.md HISTORY 5차 개정 참고.

## §0. 이 SPEC의 핵심 프레이밍

이번 SPEC은 **quota 우회가 아니라 quota 절약 + 복원력**이다. 여러 API 키/Google 계정을 돌려쓰는 방식은 명시적으로 범위 밖이다(§8). 대신 세 가지 독립적인 방어선을 쌓는다 — ① 호출 수 자체를 줄인다(사건당 N+N+1 → 3, §2), ② 남은 호출을 스스로 페이싱한다(rate scheduler, **1차 방어선**, §3), ③ 그래도 429/503이 발생하면 근거 있는 방식으로 재시도한다(bounded retry, **2차 안전장치**, §5). 세 방어선은 서로 배타적이지 않고 겹겹이 쌓인다 — 특히 ②와 ③은 **같은 재시도 루프 안에서 매 시도마다 함께 작동**해야 한다는 점이 이번 개정에서 명확해졌다(§5의 D2 반영).

## §1. Requirement A — 역할별 Gemini 모델 분리 (D1/D3 반영 전면 재작성)

### 검증된 모델 ID — 재확인 완료(research.md §3.1)

이번 개정 세션에서 `https://ai.google.dev/gemini-api/docs/models`를 **다시** WebFetch해 재확인한 결과, 이전 세션의 확인이 여전히 유효하다:

| 역할 | 환경변수 | 코드 기본값 | 공식 문서 상태(재확인) |
|---|---|---|---|
| Research(가장 복잡한 보험/판례/evidence 종합 reasoning) | `GEMINI_RESEARCH_MODEL` | `gemini-3.6-flash` | Stable |
| Fast(Skeptic + Verifier) | `GEMINI_FAST_MODEL` | `gemini-3.5-flash-lite` | Stable |

두 값 모두 여전히 Stable — 오타·존재하지 않는 ID가 아님이 두 세션 연속으로 확인됐다.

### D1 — 기본값 계약 모순의 정정: "model 문자열은 `provider-factory.ts`에서 확정한다, `GeminiProvider` 자신의 내부 폴백에 정상 경로가 의존하지 않는다"

**이전 버전의 결함(외부 리뷰 지적, 그대로 인정)**: 이전 설계는 REQ/AC에서 "env 미설정 시 Research는 `gemini-3.6-flash`, Fast는 `gemini-3.5-flash-lite`로 기본 동작한다"고 약속했지만, `provider-factory.ts` 의사코드는 `env.GEMINI_RESEARCH_MODEL`(값이 없으면 `undefined`)을 **그대로** `GeminiProvider` 생성자에 넘기고, `GeminiProvider` 자신의 `this.model = options.model ?? DEFAULT_MODEL`(`DEFAULT_MODEL = "gemini-2.5-flash"`)이 그 `undefined`를 받아 최종적으로 `gemini-2.5-flash`로 폴백하는 구조였다. `gemini-2.5-flash`는 스모크에서 실제로 404가 난 바로 그 모델이다 — 문서화된 기본값(`gemini-3.6-flash`)과 코드가 실제로 도달하는 값(`gemini-2.5-flash`)이 서로 다른, 실질적 모순이었다.

**정정된 아키텍처**: model 문자열 확정은 **`provider-factory.ts`가 `GeminiProvider`를 생성하기 전에** 끝낸다. `GeminiProvider` 자신의 내부 `??` 폴백에 정상 앱 경로가 의존하는 일은 구조적으로 없다.

```ts
// lib/ai/provider-factory.ts (재작성 — D1/D3 반영)
const DEFAULT_RESEARCH_MODEL = "gemini-3.6-flash";
const DEFAULT_FAST_MODEL = "gemini-3.5-flash-lite";
const DEFAULT_RPM_BUDGET = 4; // 보수적 self-imposed 기본값(§3) — Google이 보장하는 값이 아님

export interface RoleProviders {
  research: LLMProvider;
  fast: LLMProvider;
}

export function getLLMProviders(env: NodeJS.ProcessEnv = process.env): RoleProviders {
  if (env.LLM_PROVIDER_MODE === "deterministic") {
    const shared = createDeterministicLLMProvider();
    return { research: shared, fast: shared }; // 결정론적 모드는 역할 구분이 무의미 — 실제 model 문자열 불필요.
  }

  const apiKey = env.GEMINI_API_KEY;

  // (D1) model 문자열은 여기서 확정한다 — GeminiProvider 생성자에는 항상 명시적 문자열을
  // 전달하며, GeminiProvider 자신의 내부 DEFAULT_MODEL 폴백에 의존하지 않는다.
  const researchModel = env.GEMINI_RESEARCH_MODEL ?? DEFAULT_RESEARCH_MODEL;
  const fastModel = env.GEMINI_FAST_MODEL ?? DEFAULT_FAST_MODEL;
  const researchBudget = parseRpmBudget(env.GEMINI_RESEARCH_RPM_BUDGET) ?? DEFAULT_RPM_BUDGET;
  const fastBudget = parseRpmBudget(env.GEMINI_FAST_RPM_BUDGET) ?? DEFAULT_RPM_BUDGET;

  // (D3) 스케줄러는 "역할"이 아니라 "실제로 확정된 model ID"를 기준으로 공유 여부를 결정한다.
  // 역할이 정확히 2개뿐이므로, 일반적인 registry/Map을 만들 필요 없이 단순 동등성 비교로 충분하다
  // (registry/프레임워크를 만들지 않는다는 최소-수정 원칙 — 역할이 3개 이상으로 늘어나면 그때
  // Map 기반으로 승격하면 되고, 그 변경은 이 함수 내부에 국한된다).
  let researchScheduler: RateScheduler;
  let fastScheduler: RateScheduler;
  if (researchModel === fastModel) {
    // 두 역할이 같은 실제 model을 가리키면, 그 model의 진짜 quota는 하나뿐이다 —
    // 독립된 두 스케줄러를 쓰면 합산 요청률이 어느 한쪽의 budget도 넘어설 수 있으므로,
    // 하나의 스케줄러를 공유하고 더 보수적인(작은) budget을 적용한다.
    const shared = new RateScheduler({ rpmBudget: Math.min(researchBudget, fastBudget) });
    researchScheduler = shared;
    fastScheduler = shared;
  } else {
    researchScheduler = new RateScheduler({ rpmBudget: researchBudget });
    fastScheduler = new RateScheduler({ rpmBudget: fastBudget });
  }

  return {
    research: new GeminiProvider({ apiKey, model: researchModel, scheduler: researchScheduler }),
    fast: new GeminiProvider({ apiKey, model: fastModel, scheduler: fastScheduler }),
  };
}
```

`GeminiProviderOptions`는 이제 `rpmBudget?: number`가 아니라 **이미 구성된 `scheduler?: RateScheduler` 인스턴스**를 받는다(주입 방식) — 이것이 D3의 "동일 model ID일 때 인스턴스를 공유한다"는 요구를 가능하게 하는 핵심 변경이다. `GeminiProviderOptions`에 `model?: string`도 추가하고(REQ-GEMINI-RUNTIME-001), 생성자는 여전히 `this.model = options.model ?? DEFAULT_MODEL`로 초기화한다.

### `GeminiProvider` 자신의 `DEFAULT_MODEL` — 값 변경 + 도달 불가능성 명시 (D1 후반부)

**결정**: `DEFAULT_MODEL`을 `"gemini-2.5-flash"`에서 **`"gemini-3.5-flash-lite"`**(Fast 역할의 기본값과 동일한 값)로 바꾼다.

**근거**: `GeminiProvider`를 `provider-factory.ts` 경로(정상 앱 부팅)로 생성하면 `model` 옵션은 **항상** 명시적으로 채워져 있으므로(위 pseudocode), 이 내부 폴백은 정상 경로에서 **구조적으로 도달할 수 없다** — 도달하는 경우는 오직 (a) 단위 테스트가 `new GeminiProvider({ apiKey })`처럼 `model`을 생략하고 직접 생성하는 경우, (b) 향후 누군가 임시 디버그 스크립트에서 factory를 거치지 않고 직접 생성하는 경우뿐이다. 두 경우 모두 "정상 앱 부팅"이 아니므로, 이 상수가 실제로 쓰일 상황에서 `gemini-2.5-flash`처럼 이미 한 번 404가 관측된 값을 다시 고르는 것은 근거 없는 선택이다 — 검증된 Stable 값(`gemini-3.5-flash-lite`, Fast 역할과 동일)으로 바꾸는 것이 더 안전하며, 별도의 세 번째 매직 문자열을 만들지 않는다는 점에서도 간결하다. `gemini.ts`는 `provider-factory.ts`의 상수를 import하지 않는다(순환 의존 방지) — 값이 우연히 일치하도록 독립적으로 리터럴을 유지하며, 이 사실을 코드 주석에 남긴다.

**중요**: 이 변경은 `provider-factory.ts`가 만드는 정상 provider의 동작을 전혀 바꾸지 않는다 — Fast 역할이 이미 `"gemini-3.5-flash-lite"`를 명시적으로 쓰고 있으므로, `DEFAULT_MODEL`이 같은 값으로 바뀌어도 정상 경로의 관측 가능한 동작은 동일하다. 바뀌는 것은 "폴백이 실제로 발동했을 때 무엇이 선택되는가"라는, 정상 경로에서는 결코 관측되지 않는 방어적 안전망뿐이다.

### D-NEW1 — `RateScheduler` 상태는 사건 경계를 넘어 프로세스 생애주기 동안 보존되어야 한다 (외부 독립 리뷰 4차 지적)

**결함**: 위 pseudocode의 `getLLMProviders(env)`는 호출할 때마다 새 `GeminiProvider`(+ 그 안에 새 `RateScheduler`)를 만든다. `runPipeline()`의 정상 앱 경로는 `options.providers ?? getLLMProviders()`로 매 사건마다 이 함수를 다시 호출하므로, 사건 A가 끝나고 사건 B가 시작될 때마다 **새로운** `RateScheduler`가 만들어진다 — `lastStartedAt`이 초기화된 상태로 시작하므로, 사건 B의 페이싱은 사건 A의 가장 최근 요청 시각을 전혀 기억하지 못한다. §4의 프로세스 로컬 동시성 락은 "사건 A와 사건 B가 동시에 실행되지 않는다"만 보장할 뿐, "A가 끝난 뒤 B가 시작될 때 페이싱 상태가 이어진다"는 전혀 다른 성질이며 그 락은 이를 전혀 다루지 않는다. 결과적으로 자체 부과 RPM 페이싱이 "사건 하나 내에서만" 유효한 범위로 축소되고 만다 — 이는 self-imposed rate budget의 존재 이유(Google의 실제 quota 윈도우는 사건이 바뀐다고 리셋되지 않는다)를 무력화한다.

**정정 — 프로세스 생애주기 지연 초기화 싱글턴**: `provider-factory.ts`는 `getLLMProviders(env)`(순수 함수, 매 호출마다 새로 구성 — 테스트 주입 경로가 계속 사용) 옆에 신규 함수 `getDefaultLLMProviders()`(인자 없음, 항상 `process.env`를 읽음)를 추가한다:

```ts
// lib/ai/provider-factory.ts (추가 — 기존 getLLMProviders(env)는 무변경)
let defaultProviders: RoleProviders | undefined;

// 정상 앱 경로 전용 — 프로세스 생애주기 동안 단 1회만 getLLMProviders()를 호출하고,
// 그 결과(내부의 GeminiProvider + RateScheduler 인스턴스 포함)를 재사용한다.
export function getDefaultLLMProviders(): RoleProviders {
  if (!defaultProviders) {
    defaultProviders = getLLMProviders(process.env);
  }
  return defaultProviders;
}
```

`lib/pipeline/index.ts`의 `runPipeline()`은 `options.providers ?? getLLMProviders()`를 `options.providers ?? getDefaultLLMProviders()`로 바꾼다. `options.providers`가 명시적으로 주어지는 경로(단위 테스트, deterministic 픽스처 조합 테스트)는 이 싱글턴을 전혀 거치지 않으므로 — 각 테스트는 여전히 자신만의 격리된 `RoleProviders`를 직접 구성해 전달하며, 전역 싱글턴 상태에 결합되지 않는다(한 테스트가 싱글턴을 건드리면 다른 테스트나 실제 프로덕션 상태로 상태가 새어나가는 위험을 그대로 차단).

**D3와의 관계(변경 없음)**: `getDefaultLLMProviders()`는 `getLLMProviders()`를 그대로 감싸는 얇은 래퍼일 뿐이다 — model ID 동일 시 스케줄러 공유 + `min(researchBudget, fastBudget)` 로직(§1 D3, REQ-GEMINI-RUNTIME-022)은 `getLLMProviders()` 내부에 그대로 남아 있으며 손대지 않는다. 이 싱글턴 수정이 보장하는 것은 오직 "`getLLMProviders()`가 만들어낸 provider(들)가 — 그 안에 스케줄러가 1개든 2개든 — 첫 호출 이후 프로세스 생애주기 동안 재사용된다"는 것뿐이다.

**최소 구현 원칙 재확인**: 이것은 Redis도, Map 기반 registry도, 새 프레임워크도 아니다 — 정확히 "역할 2개(Research, Fast) + 프로세스 전역 default-providers 싱글턴 1개(내부에 스케줄러 1개 또는 2개를 보유할 수 있음)"라는 최소 형태다. `defaultProviders` 모듈 스코프 변수는 §4의 `pipelineChain`과 동일한 패턴(Node.js 모듈 스코프 인메모리 상태)이며, 신규 의존성이 없다.

**분산 범위 재확인 — 여전히 프로세스 로컬**: 이 싱글턴은 **하나의 Node.js 프로세스** 안에서만 유효하다. Vercel의 서로 다른 serverless 인스턴스(별도 프로세스)는 각자 자신의 모듈 스코프를 가지므로 이 싱글턴을 공유하지 않는다 — 여러 인스턴스를 아우르는 분산 페이싱이라고 주장하지 않으며, 그 분산 시나리오는 §8/spec.md §4와 동일하게 범위 밖으로 남는다.

### `lib/env.ts` 변경 범위 (D1 이전 결정, 변경 없음)

Requirement A의 4개 신규 환경변수(`GEMINI_RESEARCH_MODEL`/`GEMINI_FAST_MODEL`/`GEMINI_RESEARCH_RPM_BUDGET`/`GEMINI_FAST_RPM_BUDGET`)는 전부 **코드 기본값을 가진 선택적 변수**이며, 그 어떤 스코프에서도 "필수"가 될 수 없다 — `REQUIRED_BY_SCOPE` 표에 추가하지 않고, `validateEnv()`의 조건부 게이트 대상에도 넣지 않는다. `VAR_INFO`에 항목을 추가하는 것도 실익이 없다(`VAR_INFO`는 `missing[]`에 담긴 변수의 오류 메시지에만 쓰이는데, 이 4개 변수는 애초에 `missing[]`에 들어갈 수 없다). 유일한 변경은 파일 상단 근처에 "이 4개 변수는 코드 기본값이 있어 검증 대상이 아니다"라는 한 줄 문서 주석 추가뿐이다.

## §2. Requirement B — Gemini 호출 배치 (Researcher/Skeptic N→1, Verifier 1 유지) — 이전 버전과 동일

### 부분 배치 실패 설계 긴장과 해소 (양자택일 결정 — 근거 명시)

Verifier의 기존 배치 검증은 **배열 전체에 대한 `.refine()`**을 쓴다(candidate 소속 확인 / 정확히 1:1 대응(누락·중복 금지) / evidence 부분집합, research.md §1). 이걸 Researcher/Skeptic 배치에 그대로 복사하면, candidate 하나(query 하나 또는 finding 하나)가 위조 evidence ID를 인용하거나 응답에서 누락되기만 해도 `schema.safeParse()`가 배열 전체를 실패시켜 **그 배치의 모든 candidate 결과가 함께 사라진다** — 이는 사용자가 명시적으로 요구한 "일부 query에 finding이 없어도 전체 batch를 자동 실패시키지 않는다"와 정면 충돌한다.

**기술적으로 확인된 함정**: "`z.array(itemSchema)`의 item 스키마 안에 `.refine()`을 넣어 항목별로 스코프하면 부분 수용이 가능하다"는 아이디어는 **작동하지 않는다**. Zod의 `safeParse()`는 원자적(atomic)이다 — 배열 원소 하나라도 `.refine()`을 통과하지 못하면 Zod는 그 원소만 실패로 표시하는 게 아니라 **`result.success` 전체를 `false`**로 만든다. `.refine()`을 배열 레벨에 두든 item 레벨에 두든 최종 결과(`generateStructured()`의 `ok: false`)는 동일하다 — item-레벨 refine은 Verifier의 배열-레벨 refine과 똑같은 all-or-nothing 실패로 귀결된다.

**채택한 방식(옵션 2, 올바르게 구현) — "구조는 스키마로, 업무 규칙은 파싱 후 코드로"**: `generateStructured()`에 넘기는 Zod 스키마를 **구조(shape/타입)만** 검증하도록 좁히고("candidate 소속 확인"·"evidence 부분집합"·"1:1 대응"과 같은 업무 규칙은 스키마의 `.refine()`으로 넣지 않는다), `ok: true`가 반환된 뒤 Researcher/Skeptic 자신의 코드가 각 응답 항목에 대해 **그 항목에 귀속된** 검사를 개별 적용해, 실패한 항목만 "그 query/finding에 대한 결과 없음"으로 폐기한다(오늘의 per-query `continue`와 동일한 효과). 검사 순서는 (1) candidate 소속 확인 → (2) 중복 응답 처리(첫 응답만 채택) → (3) **Researcher 항목에 한해** `supportingEvidenceIds.length >= 1` 검증 → (4) evidence 부분집합 검증 → (5) safety-validator이다(D-NEW2, 아래 상세). 배치 응답 자체가 최상위에서 파싱 불가능한 경우(진짜 구조적 실패)만 그 호출 전체를 fail-closed 처리한다.

**D-NEW2 — Researcher 그라운딩 계약이 스키마에서 빠지면서 사후-검증 순서에 재배치되지 않았던 결함(외부 독립 리뷰 5차 지적)**: 현행 `lib/pipeline/researcher.ts`의 per-query `buildFindingSchema(validEvidenceIds)`는 `supportingEvidenceIds: z.array(z.string()).min(1).refine(...)`로 각 finding이 최소 1개의 실제 evidence ID를 인용하도록 스키마 레벨에서 이미 보증하고 있다. 이 SPEC의 배치 설계(위 옵션 2)가 이 `.refine()`을 배열 스키마에서 제거하면서, 그 그라운딩 보증이 사후-파싱 검사 순서 어디에 재배치되는지가 이전 버전에서 명시적으로 서술되지 않았다 — `findingItemSchema`가 "구조만 검증 — refine 없음"이라고만 적혀 있어, 구현 시 이 검사를 그냥 누락시킬 위험이 있었다. 정정: 사후-검증 순서의 (3)단계로 **Researcher 항목에 한해** `supportingEvidenceIds.length >= 1`을 명시적으로 추가한다 — 위반한 항목(빈 배열)만 그 query에 대한 결과 없음으로 폐기되고, 같은 배치의 다른 정상 항목은 영향받지 않는다(부분 배치 실패 설계, 위 옵션 2와 정합). **Skeptic은 이 단계를 건너뛴다** — Skeptic의 `supportingEvidenceIds`/`counterEvidenceIds`는 기존 계약대로 빈 배열을 허용한다(아래 "Skeptic 배치의 추가 규칙" 참고, `counterEvidenceIds`가 빈 배열이라는 사실 자체가 corpus 부족의 자동 증거로 취급되지 않는다는 REQ-GEMINI-RUNTIME-010과 정합). 이 비대칭은 Researcher(evidence를 요약해 finding을 만드는 역할 — finding 자체가 근거 없이는 존재할 이유가 없음)와 Skeptic(반론을 제기하되 반박 근거가 없을 수도 있는 역할)의 서로 다른 의미론에서 비롯된다.

```ts
// lib/pipeline/researcher.ts (개념 — 정확한 필드명은 run-phase 확정)
const findingItemSchema = z.object({
  queryId: z.string(),
  summary: z.string().min(1),
  supportingEvidenceIds: z.array(z.string()),
}); // 구조만 검증 — refine 없음(그라운딩 길이 검사는 파싱 후 코드에서 수행, 아래 참고)
const findingBatchSchema = z.object({ findings: z.array(findingItemSchema) });

// ok:true 이후, 각 응답 항목에 대해 순서대로 적용(D-NEW2):
//   1. candidate(queryId) 소속 확인
//   2. 중복 응답 처리 — 같은 queryId가 두 번 이상 나오면 첫 항목만 채택
//   3. supportingEvidenceIds.length >= 1 — 위반 시 그 항목만 폐기(Researcher 그라운딩 계약)
//   4. 그 query 자신의 validEvidenceIds Set을 조회해 부분집합 검증
//      (Verifier의 claimEvidenceById/caSupportingById와 동일한 per-candidate Map 조회 기법 재사용)
//   5. findSafetyViolations() 안전 검사
// 5단계 중 어느 하나라도 실패하면 그 항목만 결과 없음으로 폐기하고, 나머지 정상 항목은 그대로 유지한다.
```

**세 가지가 이 결정으로 약화되지 않음을 확인**: (a) 위조 ID 방어 — 스키마 refine이든 코드 필터든 검사의 엄격함은 정확히 동일한 Set 멤버십 검사다. 차이는 실패 시 "무엇이 폐기되는가"(배열 전체 vs 그 항목 하나)뿐이다. (b) query별 evidence 격리(REQ-GEMINI-RUNTIME-008) — per-candidate Map 조회는 오히려 오늘 검증되지 않던 "같은 배치 내 다른 query/finding 소속 evidence 교차 인용"까지 정확히 같은 엄격함으로 새로 검증한다. (c) Researcher 그라운딩 계약(D-NEW2) — 현행 per-query 스키마의 `.min(1)`이 보증하던 "finding은 최소 1개의 실제 evidence ID를 인용해야 한다"는 요구는, 사후-검증 순서 (3)단계로 정확히 동일한 엄격함(길이 ≥ 1)으로 이어진다. 차이는 실패 시 배열 전체가 아니라 그 항목 하나만 폐기된다는 점뿐이며, 이는 오히려 오늘의 per-query 동작(evidence가 없으면 애초에 그 query가 candidate로 전달되지 않음, REQ-GEMINI-RUNTIME-004)과 더 가까운 결과를 낸다.

**Verifier와의 의도적 차이**: 이번 배치는 Verifier의 "정확히 1:1 대응(누락·중복 금지)" 요구를 채택하지 않는다 — 오늘의 per-query 독립 루프도 이미 "LLM이 특정 query에 응답하지 못하면 그냥 건너뛴다"는 관대한 계약이었기 때문이다. 누락된 query/finding은 결과 없음(오늘과 동일, Verifier의 기존 query↔finding 대조 로직이 `missingMaterials`로 흡수), 중복 응답은 첫 번째만 채택한다.

### Skeptic 배치의 추가 규칙 — 두 evidence 배열의 의미론 (Requirement C 원문)

`buildChallengePrompt()`(또는 그 배치 버전)와 `Challenge` 타입 문서 주석에 다음 두 역할을 명시적으로 서술한다:

- `supportingEvidenceIds` — **보험사(반론을 제기하는 쪽) 관점**에서 그 반론 자체를 뒷받침하는 근거.
- `counterEvidenceIds` — **피보험자/청구인 측**이 그 반론에 대해 반박 근거로 제시할 수 있는 근거.

두 배열 모두 여전히 "그 finding에 대해 EvidenceRetriever가 실제로 반환한 evidence 집합"의 부분집합이어야 한다. **`counterEvidenceIds`가 빈 배열이라는 사실 자체를 corpus 부족의 자동 증거로 취급하지 않는다** — 코드 주석이나 문서 어디에도 "0건 = corpus 부족"이라는 단정을 남기지 않는다(§7의 스모크 리포트 정정과 정합).

**Researcher와의 비대칭(D-NEW2, 명시)**: Researcher의 `supportingEvidenceIds`는 사후-검증에서 `length >= 1`을 강제받지만(위 옵션 2), Skeptic의 `supportingEvidenceIds`/`counterEvidenceIds` 두 배열 모두 이 길이 강제를 받지 않는다 — 둘 다 빈 배열이 허용되는 기존 계약이 그대로 유지된다. 이 비대칭의 근거는 두 역할의 의미론이 다르기 때문이다: Researcher의 finding은 evidence를 요약해 만든 결과물이므로 evidence 없이 존재할 이유가 없지만(finding 자체가 근거의 산물), Skeptic의 반론은 근거가 빈약하더라도 "반론을 제기했다"는 사실 자체가 유의미한 신호일 수 있고, 특히 `counterEvidenceIds`가 빈 배열인 것은 (위 문단이 명시하듯) corpus 부족을 포함한 여러 가설 중 하나일 뿐 반론 자체가 무효라는 뜻이 아니다.

### Verifier — 변경 없음, model만 교체

`verify()`의 배치 구조·스키마·프롬프트는 이번 SPEC에서 수정하지 않는다. `runPipeline()`이 `fastProvider`(`GEMINI_FAST_MODEL`)를 넘겨주는 것으로 model만 바뀐다.

## §3. Requirement C — Free-tier rate scheduler (1차 방어선)

Google 문서(research.md §3.2, 재확인 완료)는 실제 quota를 하드코딩하지 말고 AI Studio 대시보드를 확인하라고 명시한다. 따라서 이번 스케줄러는 "Google이 보장하는 값"을 절대 주장하지 않고, **보상레이더가 스스로 부과하는 요청 예산(self-imposed budget)**만 다룬다.

```ts
// lib/ai/rate-scheduler.ts (신규, 프레임워크 없음 — 순수 인메모리 min-interval 게이트)
export interface RateSchedulerOptions {
  rpmBudget: number;                 // ex) 4 → 요청 시작 간 최소 간격 = 60000/4 = 15000ms
  nowFn?: () => number;              // 테스트 주입용 fake clock (기본 Date.now)
  sleepFn?: (ms: number) => Promise<void>; // 테스트 주입용 (기본 setTimeout 래핑)
}

export class RateScheduler {
  readonly rpmBudget: number;
  private lastStartedAt: number | null = null;
  constructor(private readonly opts: RateSchedulerOptions) {
    this.rpmBudget = opts.rpmBudget;
  }

  async waitForSlot(): Promise<void> {
    const minIntervalMs = Math.ceil(60_000 / this.rpmBudget);
    const now = (this.opts.nowFn ?? Date.now)();
    if (this.lastStartedAt !== null) {
      const remaining = minIntervalMs - (now - this.lastStartedAt);
      if (remaining > 0) await (this.opts.sleepFn ?? defaultSleep)(remaining);
    }
    this.lastStartedAt = (this.opts.nowFn ?? Date.now)();
  }
}
```

`GeminiProvider`는 생성자 옵션으로 **이미 구성된 `scheduler?: RateScheduler` 인스턴스**를 주입받는다(§1의 D3 변경 — 더 이상 `rpmBudget` 숫자를 직접 받아 스스로 인스턴스를 만들지 않는다. 이렇게 해야 `provider-factory.ts`가 두 역할에 **동일 인스턴스**를 넘겨 공유시킬 수 있다). `researchProvider`와 `fastProvider`가 서로 다른 model을 가리키면 각자 독립된 `RateScheduler` 인스턴스를, 같은 model을 가리키면 하나의 공유 인스턴스를 갖는다(§1) — 어느 쪽이든 "실제 model 단위 독립 페이싱"이라는 목표는 정확히 지켜진다.

**D2 — 언제 `waitForSlot()`을 호출하는가(중요, §5에서 상세)**: 이전 버전은 "실제 SDK 호출(`withRetry()` 내부) 직전에" 딱 한 번 호출한다고 서술했는데, 이는 **최초 시도에만** 적용되고 429/503으로 인한 재시도 시도는 스케줄러를 완전히 우회한다는 결함이 있었다. 정정된 계약: `waitForSlot()`은 `withRetry()`의 **매 시도(최초 시도 + 모든 재시도 시도) 직전**에 호출된다 — 정확한 메커니즘과 pseudocode는 §5로 이동했다(재시도 로직과 분리해서 설명할 수 없는 결합된 동작이기 때문).

`GEMINI_RESEARCH_RPM_BUDGET`/`GEMINI_FAST_RPM_BUDGET`이 설정되지 않으면 보수적인 코드 기본값(`DEFAULT_RPM_BUDGET = 4`, §1)을 사용한다 — 이 기본값은 "Google이 보장하는 한도"가 아니라 "우리가 안전하다고 판단해 자체적으로 부과하는 상한"이라고 코드 주석과 runbook에 명시한다. `runtime-runbook.md`에는 "AI Studio Rate Limit 대시보드에서 실제 한도를 확인하고, 그 값의 약 70~80% 이하로 `*_RPM_BUDGET`을 설정하라"는 안내 문단을 추가한다.

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

**명시적 한계(문서화 필수, REQ-GEMINI-RUNTIME-014)**: 이것은 **프로세스 로컬** 보호일 뿐이다 — Node.js 모듈 스코프의 인메모리 변수이므로, Vercel의 서로 다른 serverless 인스턴스(별도 프로세스) 사이에서는 전혀 공유되지 않는다. "여러 인스턴스를 아우르는 분산 락"이라고 주장하지 않으며, 이번 SPEC은 Redis나 다른 durable 분산 큐를 도입하지 않는다. 실제 동시 사용자가 늘어나 여러 인스턴스에 걸친 조율이 필요해지면 별도 SPEC으로 다룬다 — 이번 SPEC은 단일 사용자/소수 파일럿 환경을 전제한다.

**D4 — 대기 시간에 대한 정확한 서술(중요 정정)**: 이 락이 대기 중인 사건을 얼마나 오래 막아둘 수 있는지에는 **참된 상한이 없다**. 락 보유자(앞선 사건)가 Gemini를 호출하는 동안 걸리는 시간은 (a) 실제 Gemini 네트워크/응답 지연(이 SPEC이 통제할 수 없는 외부 요인), (b) `RateScheduler.waitForSlot()`이 강제하는 페이싱 대기(§3 — 자체 부과 예산이 낮을수록 대기가 길어질 수 있음), (c) `GeminiProvider.withRetry()`의 재시도 대기(§5)를 모두 합친 것이며, 이 중 (a)와 (b)는 `maxTotalWaitMs`(재시도 대기 시간 상한)로 전혀 유계화되지 않는다 — `maxTotalWaitMs`는 §5의 **재시도 sleep 구간에만** 적용되는 상한이지, 스케줄러 대기나 순수 네트워크 지연에는 적용되지 않는다. 따라서 "락 대기 시간이 대략 몇 배의 `maxTotalWaitMs`로 유계"라는 식의 서술은 부정확하다 — 이번 SPEC은 명시적인 락 타임아웃을 도입하지 않으며, 이는 의도된 스코프 결정이다(spec.md §5 잔여 위험에 정확한 문구로 기록).

## §5. Requirement E — 429/503 재시도 복원력 + 스케줄러 통합 (2차 안전장치, D2 전면 반영)

### D2 — "스케줄러는 최초 시도뿐 아니라 매 실제 시도 전에 작동해야 한다"

**이전 버전의 결함(외부 리뷰 지적)**: `waitForSlot()`을 `generateStructured()`/`generate()`가 `withRetry()`를 호출하기 **전에 딱 한 번** 호출하는 것으로 서술했다. 그런데 429/503으로 재시도가 발생하면, 재시도 시도는 `withRetry()`의 내부 루프 안에서 일어나므로 이 "한 번만 호출" 구조에서는 재시도 시도가 스케줄러를 완전히 건너뛴다 — "스케줄러가 1차 방어선, 재시도가 2차 안전장치"라는 계약이 최초 시도 이후의 모든 시도에서 무너진다.

**정정**: `waitForSlot()` 호출을 `withRetry()`의 **루프 최상단**으로 옮긴다 — 매 시도(최초 시도 포함, 모든 재시도 시도 포함)가 실제 Gemini HTTP 호출을 하기 직전에 반드시 스케줄러를 거친다.

```ts
private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
  let attempt = 0;
  let cumulativeWaitMs = 0;
  while (true) {
    await this.scheduler?.waitForSlot(); // (D2) 최초 시도 + 모든 재시도 시도 각각에 적용
    try {
      return await operation();
    } catch (error) {
      const retryable = isRetryableStatus(error); // 429 또는 503만
      const isLastAttempt = attempt >= this.maxRetries;
      if (!retryable || isLastAttempt) throw error;

      const hinted = parseRetryDelayMs(error);
      const backoffDelay = hinted ?? (this.initialDelayMs * 2 ** attempt);
      const delayMs = Math.min(backoffDelay, MAX_SINGLE_DELAY_MS);
      if (cumulativeWaitMs + delayMs > this.maxTotalWaitMs) throw error;

      cumulativeWaitMs += delayMs;
      await this.sleepFn(delayMs);
      attempt += 1;
      // 루프 최상단으로 돌아가 scheduler.waitForSlot()을 다시 거친다.
    }
  }
}
```

**왜 이것이 "실제 다음 시도 시각 = max(백오프/retryDelay 유도 지연, 스케줄러의 다음 가용 슬롯)"을 만드는가**: 재시도 분기는 `sleepFn(delayMs)`(백오프/`retryDelay` 유도 대기)를 먼저 기다린 뒤 루프 최상단으로 돌아가 `scheduler.waitForSlot()`을 다시 호출한다. 이 시점에 스케줄러의 최소 간격이 이미 충족돼 있으면(예: 백오프 대기가 스케줄러 간격보다 길었던 경우) `waitForSlot()`은 즉시 반환한다 — 순수하게 `sleepFn`의 대기 시간만 소요된다. 반대로 백오프 대기가 스케줄러 간격보다 짧았다면(예: `rpmBudget=4`라 최소 간격이 15초인데 `retryDelay`가 2초뿐인 경우), `waitForSlot()`이 부족한 나머지 시간만큼 추가로 대기시킨다 — 두 대기의 합이 자연스럽게 "둘 중 더 긴 쪽"과 사실상 같아진다. 별도의 `max()` 계산 로직을 코드에 명시적으로 넣을 필요 없이, 두 메커니즘을 순서대로 실행하는 것만으로 이 성질이 성립한다.

### `retryDelay` 파싱 (research.md §2 SDK 소스 근거, 이전 버전과 동일)

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

### 503(UNAVAILABLE) 재시도 포함 — 공식 문서 근거, 재확인 완료

`https://ai.google.dev/gemini-api/docs/troubleshooting`(research.md §3.3, 이번 개정 세션에서 재확인 fetch): "재시도해야 함을 나타내는 오류(예: `429 RESOURCE_EXHAUSTED` 또는 `503 UNAVAILABLE`)"를 받으면 재시도하라고 명시하고, "일시적 오류(예: `429`, `408`, `5xx`)에만 재시도하라"고 규정한다 — **503을 429와 함께 공식적으로 일시적(transient)·재시도 가능으로 분류**한다. 재확인 결과 이전 세션과 동일한 문구가 그대로 유지되고 있음을 확인했다. 인증 오류(401/403), 잘못된 요청(400), 스키마 검증 실패 등은 이 문서의 "transient" 분류에 들지 않으므로 재시도 대상에 포함하지 않는다.

### 총 재시도/대기 시간 상한 (이전 버전과 동일한 값 근거)

`maxRetries`(기존, 기본 3)와 신규 `maxTotalWaitMs`(기본값 예: 120_000ms)를 `GeminiProviderOptions`에 추가해 테스트에서 주입 가능하게 한다. `MAX_SINGLE_DELAY_MS`(예: 60_000ms)는 SDK 자체 `DEFAULT_RETRY_MAX_DELAY=60s`(research.md §2)와 동일한 근거를 쓴다. 이 상한들은 **재시도 sleep 구간에만** 적용된다는 점을 §4의 D4 정정과 일관되게 유지한다 — 스케줄러 대기(§3)나 순수 네트워크 지연은 이 상한의 대상이 아니다. 테스트는 전부 fake error 객체 + 기존 `sleepFn`/`nowFn` 주입 지점을 사용하며 실제 Gemini 호출을 하지 않는다.

## §6. Requirement F — 개인정보/데이터 최소화 (D5 전면 재작성 — 과잉주장 정정 + 파일럿 데이터 계약 + Google 무료 tier 데이터 사용 정책)

### D5-a — 정정: `caseInputSchema`는 "비식별을 보증"하지 않는다

**이전 버전의 결함(외부 리뷰 지적, 그대로 인정)**: 이전 버전은 `caseInputSchema`가 강제하는 4개 필드를 "비식별 구조적 필드"라고 서술했는데, 이는 과잉 주장이다. `lib/validation/case-input.ts`(research.md §1) 실측 결과, `caseInputSchema`가 실제로 하는 일은 두 가지뿐이다:

1. `.strict()`로 스키마에 정의되지 않은 키(상세주소, 진료기록 원문 등)를 구조적으로 거부한다(field-omission 전략).
2. `piiFreeText()`가 `incidentDescription`/`diagnosisName`/`disabilityBodyPart` 세 필드에 대해 **정규식 패턴**(주민등록번호 형식 `\d{6}-?\d{7}`, 전화번호 형식 `01[016789]-?\d{3,4}-?\d{4}`)만 차단한다.

이 두 방어선은 **형식이 명확한 패턴**만 차단할 수 있다 — `incidentDescription`처럼 자유 형식 텍스트인 필드에 청구인이 실명, 소속 회사명, 상세 주소, 병원명 같은 재식별 정보를 직접 타이핑해 넣는 것을 스키마가 막을 방법은 없다(정규식으로 "이 문장에 사람 이름이 들어있는가"를 판별할 수 없기 때문 — NER/DLP 수준의 기능이 필요하며, 이는 이번 SPEC 범위 밖이다). 따라서 "caseInputSchema가 비식별을 보증한다"는 서술은 정확하지 않으며, "caseInputSchema가 정의된 필드 집합으로 입력을 제한하고 형식이 명확한 PII 패턴(주민등록번호·전화번호)만 구조적으로 차단하지만, 자유 텍스트 필드의 완전한 비식별화까지 보증하지는 않는다"로 정정한다.

### D5-b — Google 무료 tier 데이터 사용 정책 (신규 재검증, WebFetch 직접 확인)

이번 개정 세션에서 다음 두 공식 문서를 직접 WebFetch해 확인했다:

- **`https://ai.google.dev/gemini-api/docs/pricing`**: Free tier 행에 "Used to improve our products[*]"가 명시돼 있고, 각주는 `/gemini-api/terms`로 연결된다. Paid tier 행은 동일 항목이 "No"로 표시된다.
- **`https://ai.google.dev/gemini-api/terms`** (Unpaid Services 섹션, 원문 인용): "To help with quality and improve our products, human reviewers may read, annotate, and process your API input and output." 그리고 "Google uses the content you submit to the Services and any generated responses to provide, improve, and develop Google products and services and machine learning technologies." 같은 문서는 명시적으로 경고한다: "Do not submit sensitive, confidential, or personal information to the Unpaid Services." (대조: Paid Services 섹션은 "Google doesn't use your prompts...or responses to improve our products"라고 명시하며 별도의 Data Processor 계약으로 처리한다.)

**결론**: 이번 SPEC이 사용하는 것은 Gemini API의 **무료(Unpaid) tier**다 — 제출되는 프롬프트/응답이 사람 검토자에 의해 읽히고 주석이 달릴 수 있으며, Google 제품·ML 기술 개선에 사용될 수 있다는 것이 Google 자신의 공식 약관에 명시된 사실이다. 이는 이번 SPEC이 새로 만드는 위험이 아니라(SPEC-RESEARCH-001부터 이미 무료 tier를 사용해 왔다), 이번 개정에서 **문서화되지 않았던 기존 위험을 명시적으로 드러내는 것**이다.

### D5-c — 파일럿 단계 데이터 취급 운영 계약 (문서·운영 계약 — 신규 코드 없음)

위 두 발견(D5-a: 스키마가 비식별을 보증하지 않음, D5-b: 무료 tier는 사람 검토 + 제품 개선에 쓰일 수 있음)을 종합해, 이번 SPEC은 다음을 **문서·운영 계약으로만** 명시한다(DLP/NER/PII 스크러빙 같은 신규 코드는 이번 SPEC에서 만들지 않는다 — spec.md §4 제외 범위와 정합):

1. 이번 파일럿 단계에서는 **합성(synthetic) 사건 또는 운영자가 사전에 비식별화한 사건만** 입력해야 한다.
2. 실명·주민등록번호·전화번호·상세 주소가 포함된 실 고객 사건, 원본 진료기록, 원본 보험증권 문서는 입력을 금지한다.
3. `caseInputSchema`가 완전한 비식별화를 보증하지 않는다는 사실(D5-a)을 `runtime-runbook.md`에 명시한다.
4. 실 고객 사건을 사용하는 외부 파일럿으로 확장하려면, 그 확장 이전에 **별도의 데이터 처리/정책 적합성 검토**(개인정보 처리방침, Google과의 계약 조건 재검토, 필요시 paid tier 전환 등)가 선행되어야 하며, 그 검토 자체는 이번 SPEC의 범위 밖이다.
5. Google 무료 tier의 사람 검토·제품 개선 사용 사실(D5-b)을 `runtime-runbook.md`에 출처(정확한 URL)와 함께 명시한다.

Researcher/Skeptic/Verifier의 프롬프트는 여전히 이 4개 필드로부터 파생된 `NormalizedCase`와 curated evidence(제목/본문/출처)만 참조하며, 이번 SPEC은 이 계약에 **어떤 신규 필드도 추가하지 않는다** — Requirement A~E의 변경은 모두 model 선택/호출 배치/재시도/페이싱/동시성 계층에 국한되며 프롬프트가 참조하는 입력 데이터의 종류를 넓히지 않는다. acceptance.md에는 "기존 caseInputSchema PII 차단 테스트가 회귀 없이 통과"를 검증 조건으로 포함한다.

## §7. `.moai/reports/gemini-smoke-20260827.md` 정정 대상 (run-phase에서 정확히 이 문구로 교체) — 이전 버전과 동일, 변경 없음

**정정 대상 ①** (파일 19-20행 부근) — 원문: `404 NOT_FOUND` — `models/gemini-2.5-flash`가 신규 유저 계정에서는 더 이상 제공되지 않음.
정정문: "이번 smoke에 사용한 신규 API key/project에서 `gemini-2.5-flash` 호출 시 404 NOT_FOUND를 관측함. 전체 Gemini 사용자에 대한 서비스 종료로 단정하지 않는다."

**정정 대상 ②** (파일 56-60행 부근, "핵심 발견") — 원문: 파이프라인 구조 문제가 아니라 근거자료 corpus의 양과 다양성 부족이 원인으로 보인다.
정정문: "`counterEvidenceIds` 0은 실측 사실이다. 가능한 원인은 corpus 부족, retriever 후보 부족, Skeptic prompt semantics, 모델 선택 behavior 등이며, corpus 부족은 그 중 하나의 가설일 뿐 확정된 원인이 아니다."

## §8. Out of Scope와의 경계 재확인 — 이전 버전과 동일, 변경 없음

이번 SPEC은 여러 API 키/Google 계정을 돌려 quota를 우회하는 방식(multi-key rotation pool)을 다루지 않는다 — 그 대신 호출 수 감소(§2) + 자체 페이싱(§3) + 근거 있는 bounded retry(§5)로 안정성을 확보한다. Vector DB/임베딩/크롤러/Elasticsearch, Redis/BullMQ/분산 큐, Vercel 전역 semaphore, feedback 구조 개선, UI 폴리싱, 지급확률/예상보험금 계산 기능, DLP/NER 기반 PII 스크러빙(§6 D5-c — 문서·운영 계약으로 대체)도 범위 밖이다(spec.md §4).
