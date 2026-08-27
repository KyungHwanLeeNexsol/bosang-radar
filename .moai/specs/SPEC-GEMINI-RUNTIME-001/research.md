# SPEC-GEMINI-RUNTIME-001 — 조사 근거 (research.md)

plan-phase에서 수집한 원시 증거를 그대로 기록한다. 해석·설계 결정은 `design.md`에 있다.

## §1. 현행 코드베이스 실측 (파일별)

| 파일 | 실측 내용 |
|---|---|
| `lib/ai/providers/gemini.ts` (119줄) | `DEFAULT_MODEL = "gemini-2.5-flash"`(11행) 하드코딩, 오버라이드 경로 없음. `GeminiProviderOptions`(15-20행)는 `model?` 필드 없음. `isRateLimitError()`(22-29행)는 `error.status === 429`만 검사, 503은 즉시 전파. `withRetry()`(61-80행)는 `while(true)` + `isLastAttempt = attempt >= maxRetries`(기본 3) + `initialDelayMs * 2**attempt`(기본 1000ms → 1s/2s/4s) 지수 백오프뿐, Retry-After/RetryInfo 힌트를 읽지 않음. `generate()`/`generateStructured()` 둘 다 `request.model ?? this.model`을 SDK 호출에 전달 — **요청 단위 model 오버라이드 경로가 이미 존재함**(85행, 100행). |
| `lib/ai/provider.ts` (38줄) | `GenerateRequest`/`GenerateStructuredRequest` 둘 다 이미 `model?: string` 필드를 가짐(13행, 27행) — provider 인스턴스 재구성 없이 호출 단위로 model을 지정할 수 있는 계약이 이미 있다. |
| `lib/ai/provider-factory.ts` (19줄) | `getLLMProvider(env)`가 `LLM_PROVIDER_MODE !== "deterministic"`일 때 `new GeminiProvider({ apiKey: env.GEMINI_API_KEY })` **1개**만 반환. `model` 옵션 전달 안 함. |
| `lib/pipeline/researcher.ts` (91줄) | `for (const query of queries)` 루프, 쿼리마다 `provider.generateStructured()` 개별 호출(1쿼리=1호출). `buildFindingSchema(validEvidenceIds)`는 그 쿼리 자신의 유효 evidence ID로만 매개변수화된 단일-object 스키마. evidence 0건 쿼리는 `continue`(호출 안 함). `findSafetyViolations(summary)` 위반 시 `continue`. |
| `lib/pipeline/skeptic.ts` (75줄) | 동일 패턴, finding마다 개별 호출. `buildChallengeSchema()`는 `supportingEvidenceIds`/`counterEvidenceIds` 둘 다 같은 evidence 집합에 대한 부분집합 `.refine()`만 적용 — 두 배열이 서로 다른 "관점"을 가진다는 지시는 프롬프트(`buildChallengePrompt`, 23-33행)에 없음. `Challenge.findingId`는 LLM 출력이 아니라 루프에서 `finding.queryId`를 코드로 직접 부여. |
| `lib/pipeline/verifier.ts` (500줄) | 이미 **사건당 1회** 배치 구조화 호출(`buildSemanticVerificationSchema`/`buildSemanticVerificationPrompt`). claim/counterArgument candidate 각각 안정적 식별자(`queryId` / `(queryId, counterArgumentIndex)`)를 가짐. 스키마는 **배열 전체 `.refine()`** 3종(candidate 소속 확인 / 정확히 1:1 대응(누락·중복 금지) / evidence 부분집합) — `ok:false`(구조적 실패) 시 관련된 모든 candidate를 한꺼번에 INSUFFICIENT로 강등(전체-호출 fail-closed, 명시적 코드 리뷰 요구사항 — 의도된 동작). |
| `lib/pipeline/index.ts` (71줄) | `runPipeline(input, {provider})`가 `research()`/`challenge()`/`verify()` 세 곳에 **동일한 provider 인스턴스**를 순차 주입. `getLLMProvider()`가 단일 지점. |
| `lib/pipeline/types.ts` | `Challenge.supportingEvidenceIds`/`counterEvidenceIds` 문서 주석이 두 역할을 구분하지 않음(현재: `// 반론을 뒷받침하는 evidence` / `// 반론이 반박 근거로 지목하는 evidence`). `DraftFinding`/`ResearchReport`/`VerifiedClaim` 등 report shape 정의. |
| `lib/pipeline/boundary.test.ts` | `STAGE_MODULES` 6개 파일 간 형제-import 0건을 grep 기반으로 강제 — Researcher/Skeptic 배치 재작성이 각 파일 내부에 국한되면 이 테스트는 수정 없이 통과. |
| `lib/pipeline/safety-validator.ts` | `findSafetyViolations()`는 순수·동기·의존성 없는 leaf 함수, Researcher/Skeptic/Verifier 3곳에서 재사용(fan_in≥3, `@MX:ANCHOR`). |
| `lib/ai/providers/deterministic.ts` (206줄) | Verifier의 배치 프롬프트를 `/^쿼리 ID: /m` / `/^반론 쿼리 ID: /m` 마커로 인식(`isSemanticPrompt`), `parseSemanticPrompt()`가 블록 단위로 candidate 식별자·evidence ID를 정규식 추출해 happy-path 픽스처 생성. Researcher/Skeptic의 기존 단건 프롬프트는 `structuredFixturesForPrompt()`(evidence ID 1개 추출 폴백)로 처리 — N-쿼리 배치를 인식하는 로직은 없음. |
| `lib/env.ts` (139줄) | `GEMINI_API_KEY`는 `REQUIRED_BY_SCOPE` 표 밖에서 `app` 스코프 + `LLM_PROVIDER_MODE !== "deterministic"` 조건부 게이트로만 처리(119-125행). `VAR_INFO`는 `missing[]`에 실제로 담기는 변수만 조회됨(66행 `EnvValidationError` 생성자). |
| `.env.local.example` | `GEMINI_API_KEY` 항목만 있음(21-34행), model 관련 변수 없음. |
| `.moai/docs/runtime-runbook.md` | "GEMINI_API_KEY는 실제 Gemini 호출로 앱을 기동할 때만 필요" 원칙을 여러 곳에서 반복 서술하는 관례 — model/rate 관련 신규 변수 추가 시 같은 관례를 따를 것. |
| `lib/validation/case-input.ts` (51줄) | `caseInputSchema`는 `.strict()`로 `incidentDescription`/`diagnosisName`/`disabilityBodyPart`/`incidentDate` 4개 필드만 허용 — 스키마에 없는 키(주소, 진료기록 원문 등)는 구조적으로 거부. `piiFreeText()`가 주민등록번호 패턴(`\d{6}-?\d{7}`)과 전화번호 패턴(`01[016789]-?\d{3,4}-?\d{4}`)을 정규식으로 차단. 상세주소·진료기록 원문은 필드 자체를 정의하지 않는 방식(field-omission)으로 배제(SPEC-SCAFFOLD-001 근거 주석 참고). |

## §2. 설치된 `@google/genai@2.18.0` SDK 소스 코드 실측

WebSearch/WebFetch가 아니라 `node_modules/@google/genai/dist/{genai.d.ts,node/index.cjs}`를 직접 Read/Grep한 결과다(이 프로젝트가 실제로 실행하는 코드 자체).

- `ApiError extends Error`(`node/index.cjs:7759-7766`): `constructor(options) { super(options.message); this.status = options.status; }` — `.status`는 실제 HTTP 상태 코드를 담은 1급 프로퍼티, `.message`는 아래 `errorMessage` 문자열.
- `throwErrorIfNotOK(response)`(`node/index.cjs:14189-14219`): 실패 응답의 JSON 본문 전체를 `errorBody`로 파싱한 뒤 `JSON.stringify(errorBody)`를 `ApiError.message`로 사용 — 즉 `error.details[]`(RetryInfo 포함)는 `JSON.parse(error.message)`로만 접근 가능하고, `ApiError`/`ApiErrorInfo`(`genai.d.ts:479-498`) 어디에도 `.details`가 1급 필드로 노출되지 않는다.
- SDK 내장 재시도 기본값(`node/index.cjs:13611-13626`, 주석 원문 그대로): `// Default retry options. // The config is based on https://cloud.google.com/storage/docs/retry-strategy.` — `DEFAULT_RETRY_ATTEMPTS=5`, `DEFAULT_RETRY_INITIAL_DELAY=1.0초`, `DEFAULT_RETRY_MAX_DELAY=60.0초`, `DEFAULT_RETRY_EXP_BASE=2`, `DEFAULT_RETRY_JITTER=1`, `DEFAULT_RETRY_HTTP_STATUS_CODES=[408,429,500,502,503,504]`.
- 이 내장 재시도는 `p-retry` 기반 순수 지수 백오프이며 `RetryInfo.retryDelay` 힌트를 읽지 않는다(`node/index.cjs:14027-14046`). 그리고 현재 `new GoogleGenAI({apiKey})` 생성자 호출은 `httpOptions.retryOptions`를 전달하지 않으므로 이 내장 재시도는 이미 **비활성 상태**다 — 오늘의 모든 재시도 동작은 100% `GeminiProvider.withRetry()`(자체 구현)에서 나온다.
- `HttpRetryOptions`(`genai.d.ts:7115-7131`)는 `httpOptions.retryOptions`로 요청/클라이언트 단위 설정 가능하지만, 이번 SPEC은 이를 채택하지 않는다(design.md §5) — `retryDelay` 힌트를 못 읽기 때문.

## §3. 외부 공식 문서 실시간 검증 (WebFetch, 이번 세션에서 직접 fetch — WebSearch는 세션에서 비활성화되어 있어 사용하지 않았고, 아래는 URL을 직접 fetch해 얻은 결과다)

### §3.1 모델 ID 검증 — `https://ai.google.dev/gemini-api/docs/models`

fetch 결과(요약, 2026-08-27 실측):

| 모델 ID | 상태 |
|---|---|
| `gemini-3.7-flash` | Stable("최신·가장 강력한 Flash") |
| **`gemini-3.6-flash`** | **Stable**("이전 세대 Flash, 속도와 멀티모달 능력의 균형") |
| `gemini-3.5-flash` | Stable("legacy Flash, 일상 작업용 기본 성능") |
| **`gemini-3.5-flash-lite`** | **Stable**("3.5 계열 중 가장 빠르고 비용 효율적") |
| `gemini-3.1-flash-lite` | Stable |
| `gemini-2.5-flash` | Stable("저지연·고처리량 reasoning 작업의 최적 가성비") |
| `gemini-2.5-flash-lite` | Stable |
| `gemini-3-flash`/`gemini-3-pro` | **Preview**(Stable 아님) |

**결론**: 사용자가 제안한 두 후보 `gemini-3.6-flash`(Research 역할)와 `gemini-3.5-flash-lite`(Fast 역할) 모두 공식 문서 기준 **Stable**로 확인됨 — 오타·존재하지 않는 ID가 아니다. 두 값을 그대로 코드 기본값으로 채택한다(design.md §1).

### §3.2 Rate limit 구조 — `https://ai.google.dev/gemini-api/docs/rate-limits`

fetch 결과(요약): rate limit은 **프로젝트 단위**(API 키 단위 아님)로 RPM/TPM/RPD 세 축에 걸쳐 적용되며, Free/Tier1/Tier2/Tier3로 등급화돼 있다. 모델마다 한도가 다르고(일부 모델은 IPM 등 별도 지표도 가짐), Free tier 한도도 모델 능력별로 다르다. 문서는 고정 숫자를 하드코딩하지 말고 **AI Studio의 Rate Limit 대시보드에서 실제 한도를 확인**하라고 권고한다. 초과 시 `429 RESOURCE_EXHAUSTED`가 반환되며, 권장 대응은 "짧게 대기 후 재시도" 또는 "요청 빈도/크기를 줄이기"다.

### §3.3 429/503 재시도 공식 권고 — `https://ai.google.dev/gemini-api/docs/troubleshooting`

fetch 결과(원문 인용): "If you receive an error indicating that you should retry your request (such as a `429 RESOURCE_EXHAUSTED` or `503 UNAVAILABLE`)..." 그리고 "Only retry on transient errors (like `429`, `408`, or `5xx`)" — **503을 429와 함께 명시적으로 일시적(transient)·재시도 가능 오류로 분류**하고 있다. 권장 백오프: "1초 대기 → 지수적으로 증가(2s, 4s, 8s) → 무작위 지터(jitter) 추가". 공식 SDK들은 기본으로 지수 백오프 재시도를 내장하고 있다고 명시(Python SDK는 "최대 4회, 초기 지연 약 1초, 최대 지연 60초"). Retry-After 헤더나 RetryInfo 메타데이터에 대한 별도 언급은 이 문서 자체에는 없었다 — 그 근거는 §2의 SDK 소스 코드 실측(오류 JSON 본문의 `details[]`)에서 얻었다.

**결론(design.md §4/§5로 이어짐)**: 503을 429와 같은 재시도 경로에 포함시키는 것은 Google 공식 문서의 명시적 권고와 정합한다 — "일반적인 API 클라이언트 관행"이라는 추정이 아니라 1차 문서 인용이다.

## §4. 이번 조사가 답하지 못한 것 (design.md에서 보수적으로 처리)

- Retry-After HTTP 헤더 자체(응답 헤더, JSON 본문이 아닌)가 Gemini API 응답에 실제로 포함되는지는 이번 조사에서 직접 확인하지 못했다 — SDK 소스 코드에는 이를 읽는 경로가 보이지 않았고(§2), troubleshooting 문서도 헤더를 언급하지 않았다. 따라서 이번 설계는 **JSON 본문의 `RetryInfo.retryDelay`**(스모크에서 실제로 관측된 필드)만 파싱 대상으로 삼고, HTTP 헤더 파싱은 범위에 넣지 않는다.
- 모델별 정확한 RPM 한도 수치는 계정/tier마다 다르며 공개 문서에도 고정 표로 제시되지 않는다(§3.2) — 이는 설계상 의도된 결과다: 이번 SPEC의 rate scheduler는 애초에 Google의 실제 한도를 알아내려 하지 않고, 운영자가 자신의 AI Studio 대시보드를 보고 설정하는 자체 예산(budget)만 다룬다(design.md §2).
