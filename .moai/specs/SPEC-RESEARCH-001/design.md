# SPEC-RESEARCH-001 — 설계 결정 (design.md)

> 이 문서는 `research.md` §9가 남긴 3개 미해결 지점(A: env 스코프 충돌, B: 오케스트레이터 provider 주입 지점 부재, C: evidence 축 혼동)을 포함해, 이번 SPEC이 새로 도입하는 모든 타입·인터페이스·검색 로직의 설계 결정을 확정한다. 각 절은 "결정 → 근거"의 순서로 서술한다.

## §1. E2E 결정론적(deterministic) provider 전략 — research.md §9 (해소 필요 A) 정면 해결

### 결정

E2E 진입점 `scripts/run-e2e.ts`의 `assembleE2EEnv()`(SPEC-RUNTIME-001 기존 함수, `TESTER_PASSWORD`/`BETTER_AUTH_SECRET`을 매 실행마다 무작위 생성하는 동일한 함수)에 다음 한 줄을 추가한다:

```ts
process.env.LLM_PROVIDER_MODE = "deterministic";
```

이 값은 새 모듈 `lib/ai/provider-factory.ts`의 `getLLMProvider(): LLMProvider`가 읽는다:

```ts
export function getLLMProvider(env: NodeJS.ProcessEnv = process.env): LLMProvider {
  if (env.LLM_PROVIDER_MODE === "deterministic") {
    return createDeterministicLLMProvider();
  }
  return new GeminiProvider();
}
```

`runPipeline()`(§3)이 명시적 provider를 받지 않았을 때 이 팩토리를 기본값으로 사용한다. `pnpm build && pnpm start`로 뜨는 실제 Next.js 앱 서버(playwright.config.ts `webServer`)는 E2E 실행 시점에 `LLM_PROVIDER_MODE=deterministic`을 상속받은 상태로 부팅하므로, `GEMINI_API_KEY` 없이도 정상 기동하고, 파이프라인이 호출되면 실제 Gemini 대신 결정론적 fake 응답을 받는다.

### 근거 (왜 이 방식인가, 대안 대비)

- **기존 패턴과의 일관성**: `assembleE2EEnv()`는 이미 `BETTER_AUTH_SECRET`/`TESTER_PASSWORD`를 프로세스 시작 시점에 조립해 `process.env`에 쓰고, 이 값이 프로세스 계보(이 스크립트 → Playwright 러너 → Next.js 서버)를 따라 상속되는 것을 설계 원칙으로 삼는다(SPEC-RUNTIME-001 design.md §3.3 "e2e/global-setup.ts를 만들지 않기로 한 설계 결정"). `LLM_PROVIDER_MODE`도 정확히 같은 상속 경로를 탄다 — 새로운 전달 메커니즘을 발명하지 않는다.
- **`GEMINI_API_KEY` 부재로부터의 추론이 아닌 명시적 신호**: "키가 없으면 mock을 쓴다"는 암묵적 추론은 개발자가 실수로 `.env.local`에 실제 키를 넣어둔 상태로 E2E를 돌리면 조용히 실제 Gemini를 호출하는 위험한 폴백이 된다. `LLM_PROVIDER_MODE=deterministic`은 E2E가 **명시적으로 선언**하는 것이므로, 로컬 개발자의 `.env.local` 상태와 무관하게 항상 결정론적으로 동작한다(REQ-RESEARCH-011).
- **§2의 env 스코프 게이트와 자연스럽게 결합**: `LLM_PROVIDER_MODE` 하나의 신호로 (a) `lib/env.ts`의 app 스코프 GEMINI_API_KEY 요구를 면제하고, (b) `provider-factory.ts`의 provider 선택을 결정하는 두 가지 문제를 동시에 해결한다.

### `createDeterministicLLMProvider()` 고정 응답 설계

새 파일 `lib/ai/providers/deterministic.ts`가 `mock-llm.ts`를 대체한다(§9 파일 변경 맵 참고). `generate()`는 기존 mock과 동일하게 `[deterministic] ${prompt}`를 반환하고, `generateStructured()`는 **요청된 Zod 스키마를 실제로 satisfy하는 고정 픽스처 객체**를 스키마별로 반환한다 — 스키마 검증을 우회하지 않고 통과시켜, E2E가 파이프라인 전 구간을 의미 있게 검증할 수 있게 한다(빈 배열이나 오류만 도는 스텁은 E2E의 가치를 없앤다). 픽스처는 호출 순서와 무관하게 스키마 shape만으로 응답을 결정하는 단순 dispatch로 구현한다(예: 스키마가 `findingResultSchema`면 finding 픽스처, `challengeResultSchema`면 challenge 픽스처).

## §2. GEMINI_API_KEY app 스코프 조건부 요구 — research.md §9 (해소 필요 A)의 나머지 절반

### 결정

`lib/env.ts`의 `REQUIRED_BY_SCOPE.app` 정적 배열에 `GEMINI_API_KEY`를 직접 추가하지 않는다. 대신 기존에 이미 존재하는 조건부 게이트 패턴(105-111행, `TURSO_DATABASE_URL`이 `file:` 스킴이 아니면 `TURSO_AUTH_TOKEN`을 추가로 요구하는 로직)과 동일한 형태로, `validateEnv()`의 `app` 스코프 분기에 다음 조건을 추가한다:

```ts
if (scope === "app" && source.LLM_PROVIDER_MODE !== "deterministic" && !source.GEMINI_API_KEY) {
  missing.push("GEMINI_API_KEY");
}
```

`VAR_INFO`에 `GEMINI_API_KEY: { reason: "Researcher/Skeptic/Verifier가 실제 리서치 소견을 생성하는 데 필요한 Gemini API 키입니다.", howToObtain: "Google AI Studio(aistudio.google.com)에서 발급받으세요." }` 항목을 추가한다.

### 근거

- **research.md §4가 실측한 상충을 정확히 해소**: E2E가 띄우는 앱 서버는 `LLM_PROVIDER_MODE=deterministic`을 상속하므로 이 조건에서 면제되어 정상 기동하고, 일반 프로덕션/개발 기동(`LLM_PROVIDER_MODE` 미설정)은 `GEMINI_API_KEY`가 없으면 부팅 시점에 fail-fast한다 — SPEC-RUNTIME-001 §5가 명시한 "승격이 누락되면 실패 지점이 부팅에서 첫 호출 시점으로 밀린다"는 위험을 정확히 예방한다.
- **기존 관례 재사용**: 새로운 게이트 메커니즘을 발명하지 않고, 이미 코드에 존재하는 조건부 필수-변수 패턴을 그대로 확장한다 — `EnvValidationError`의 "누락 변수를 전부 열거하고 값은 절대 포함하지 않는다" 계약(REQ-RUNTIME-011)도 자동으로 유지된다.
- **`e2e` 스코프는 무변경**: `REQUIRED_BY_SCOPE.e2e` 배열은 이번 SPEC에서 건드리지 않는다 — E2E 진입점(`run-e2e.ts`)은 `bootstrapCli("e2e")`로 `"e2e"` 스코프를 검증하지, `"app"` 스코프를 검증하지 않는다(`"app"` 스코프 검증은 `instrumentation.ts`가 별도 프로세스 — 실제 Next.js 서버 — 부팅 시점에 수행한다).

## §3. 오케스트레이터 수준 단일 provider 주입 지점 — research.md §9 (해소 필요 B)

### 결정

`lib/pipeline/index.ts`의 `runPipeline()` 시그니처를 다음과 같이 확장한다:

```ts
export interface RunPipelineOptions {
  provider?: LLMProvider;
}

export async function runPipeline(
  input: CaseInput,
  options: RunPipelineOptions = {}
): Promise<ResearchReport> {
  const provider = options.provider ?? getLLMProvider();
  const caseSummary = normalizeCase(input);
  const queries = planQueries(caseSummary);
  const evidence = await retrieveEvidence(queries);
  const findings = await research(queries, evidence, provider);
  const challenges = await challenge(findings, provider);
  const claims = await verify(findings, challenges, evidence, provider);
  // ... ResearchReport 조립 (§8)
}
```

`research()`/`challenge()`의 기존 시그니처(3번째·마지막 인자 `provider?: LLMProvider`)는 그대로 유지한다 — 다만 그 기본값이 가리키는 구현체를 `createMockLLMProvider()`(`mock-llm.ts`, 폐지)에서 `createDeterministicLLMProvider()`(`lib/ai/providers/deterministic.ts`, 신규)로 교체한다. `verify()`는 시그니처 자체가 바뀐다 — 현재 `verify(findings, challenges, provider?)`(3번째 인자가 provider)에서, evidence 재검증(§7)을 위해 `evidence: EvidenceCandidate[]`가 새 3번째 인자(필수)로 추가되고 `provider`는 4번째 인자로 밀려나 `verify(findings, challenges, evidence, provider?)`가 된다. `provider`는 여전히 마지막 인자로서 선택적 기본값(`createDeterministicLLMProvider()`)을 유지한다.

### 근거

- **"replacing each stage's independent default-mock parameter" 요구를 충족하되 DI 시임을 부수지 않는다**: 오케스트레이터가 명시적으로 provider를 계산해 세 단계 모두에 전달하므로, `runPipeline()`을 통해 실행되는 정상 경로에서는 각 단계가 "독립적으로" 자신의 provider를 결정하는 구조가 사라진다(사용자 요구 그대로). 그러나 `researcher.test.ts` 등 기존 단위 테스트가 `research(queries, evidence, stubProvider)`를 **직접** 호출하는 패턴(오케스트레이터를 거치지 않음)은 함수 시그니처가 무변경이므로 그대로 통과한다 — DI 시임은 "함수가 여전히 provider를 3번째 인자로 받는다"는 계약이지, "누가 그 인자를 채우는가"가 아니다.
- **단일 소스**: `mock-llm.ts`와 `provider-factory.ts`(§1) 두 곳에서 각기 다른 fallback provider를 만드는 대신, `createDeterministicLLMProvider()` 하나가 (a) 오케스트레이터의 명시적 기본값(`getLLMProvider()` 내부)과 (b) 각 단계 함수의 파라미터 기본값 양쪽에서 재사용된다 — provider 구현체가 두 벌로 갈라지는 것을 방지한다.
- **evidence를 verify()에도 전달**: 기존 `verify(findings, challenges, provider?)` 시그니처는 evidence 집합을 받지 않아 evidence-ID 무결성을 자체 검증할 수 없었다(research.md §1). REQ-RESEARCH-019/022(Verifier의 evidence 재검증)를 만족시키기 위해 `verify()` 시그니처에 `evidence: EvidenceCandidate[]` 인자를 추가한다 — 이는 §7에서 상세히 다룬다.

## §4. `LLMProvider.generateStructured()` — Zod 스키마 기반 구조화 출력

### 결정 — 인터페이스 확장

`lib/ai/provider.ts`(파이프라인 전체가 의존하는 `@MX:ANCHOR` 파일)에 다음을 추가한다:

```ts
import type { z } from "zod";

export interface GenerateStructuredRequest<T> {
  prompt: string;
  schema: z.ZodType<T>;
  model?: string;
}

export type StructuredResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "invalid_json" | "schema_validation_failed"; raw: string };

export interface LLMProvider {
  generate(request: GenerateRequest): Promise<GenerateResponse>;
  generateStructured<T>(request: GenerateStructuredRequest<T>): Promise<StructuredResult<T>>;
}
```

`zod`는 이미 프로젝트 전역 의존성이고 Gemini 전용 SDK가 아니므로, 이 확장은 REQ-RESEARCH-009/015가 금지하는 "Gemini SDK를 provider.ts 밖으로 노출"에 해당하지 않는다.

### 결정 — Gemini adapter 구현 (`lib/ai/providers/gemini.ts`)

```ts
async generateStructured<T>(request: GenerateStructuredRequest<T>): Promise<StructuredResult<T>> {
  const jsonSchema = z.toJSONSchema(request.schema); // zod 4.4.3 네이티브 변환 — 신규 의존성 불필요
  const response = await this.client.models.generateContent({
    model: request.model ?? this.model,
    contents: request.prompt,
    config: { responseMimeType: "application/json", responseSchema: jsonSchema },
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.text ?? "");
  } catch {
    return { ok: false, reason: "invalid_json", raw: response.text ?? "" };
  }

  const result = request.schema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, reason: "schema_validation_failed", raw: response.text ?? "" };
  }
  return { ok: true, data: result.data };
}
```

429 재시도 로직(기존 `generate()`의 지수 백오프)은 `generateStructured()`에도 동일하게 적용한다 — 두 메서드가 재시도 래퍼를 공유하도록 내부 헬퍼로 리팩토링한다(순수 내부 리팩토링, 외부 계약 무변경).

### 근거

- **"Gemini SDK의 JSON/schema 세부사항은 provider adapter 내부에 격리"를 문자 그대로 만족**: `responseMimeType`/`responseSchema`는 `@google/genai`의 Gemini 전용 설정 필드이며, `generateContent()` 호출 내부에만 존재한다 — 호출부(Researcher 등)는 이 필드의 존재조차 알지 못한다.
- **zod v4 `z.toJSONSchema()` 채택으로 신규 의존성 회피**: Zod 스키마 → JSON Schema 변환은 통상 별도 라이브러리(`zod-to-json-schema` 등)가 필요하지만, 이미 고정된 `zod@4.4.3`이 이 변환을 네이티브로 제공하므로 §3(spec.md) 제약("신규 런타임 의존성 금지")을 위반하지 않는다.
- **결정론적 provider도 동일 인터페이스를 구현**: `createDeterministicLLMProvider()`(§1)의 `generateStructured()`는 Gemini를 호출하지 않고 스키마별 고정 픽스처를 `schema.parse()`(항상 성공하도록 사전 검증된 픽스처)로 감싸 반환한다 — 이 덕분에 Researcher/Skeptic/Verifier 코드는 어떤 provider가 주입됐는지 몰라도 항상 동일한 `StructuredResult<T>` 계약을 받는다.

## §5. QueryPlanner — 구조화 쟁점 도출은 규칙 기반(rule-based), LLM 호출 아님

### 결정

QueryPlanner는 **LLM을 호출하지 않는다**. `NormalizedCase`의 필드(진단명 존재, 장해 부위 존재, 사고 경위 텍스트 길이 등)를 규칙으로 검사해, 다음 8개 쟁점 유형(issueType) 중 사건에 해당하는 항목을 선택적으로 조합해 `ResearchQuery[]`를 생성한다:

```ts
export type QueryIssueType =
  | "DISABILITY_LOCATION"           // 장해 부위
  | "DIAGNOSIS"                      // 진단명
  | "INCIDENT_CIRCUMSTANCE"          // 사고 경위
  | "INJURY_DISEASE_RELATION"        // 상해·질병 관련성
  | "DISABILITY_GRADE_CRITERIA"      // 장해 평가 기준 검토
  | "PRE_EXISTING_CONDITION"         // 기왕증·퇴행성 가능성
  | "CAUSATION"                      // 인과관계 쟁점
  | "ADDITIONAL_CONFIRMATION_NEEDED"; // 추가 확인 필요 조건

export type CoverageDomain = "INJURY_DISABILITY" | "DISEASE_DISABILITY";

export interface ResearchQuery {
  id: string;
  topic: string;
  focus: string;
  domain: CoverageDomain;
  issueType: QueryIssueType;
  keywords: string[]; // EvidenceRetriever 필터링에 사용 (§6)
}
```

두 담보 도메인(`INJURY_DISABILITY`, `DISEASE_DISABILITY`)마다 최소 `DISABILITY_LOCATION`/`DIAGNOSIS`(도메인에 맞는 하나) + `DISABILITY_GRADE_CRITERIA` + `CAUSATION` 3개 쿼리를 항상 생성하고, `PRE_EXISTING_CONDITION`/`INJURY_DISEASE_RELATION`/`INCIDENT_CIRCUMSTANCE`/`ADDITIONAL_CONFIRMATION_NEEDED`는 사건 텍스트에 관련 키워드가 감지될 때 조건부로 추가한다(예: `incidentDescription`에 "이전"/"기존"/"과거" 등 기왕증을 시사하는 표현이 있으면 `PRE_EXISTING_CONDITION` 쿼리를 추가). 최종적으로 매 사건마다 최소 6개 ~ 최대 16개(2도메인 × 8쟁점) 사이의 `ResearchQuery`가 생성된다 — 기존 고정 2개 대비 명확히 사건 내용에 반응한다.

### 근거

- **"AI가 보험금 지급 여부를 확정하지 않는다"는 사용자 지시는 QueryPlanner 자체가 LLM을 호출해야 한다는 요구가 아니다** — 오히려 QueryPlanner의 출력(쿼리 목록)이 지급 판단을 내포하지 않아야 한다는 제약으로 읽힌다. `CaseInput`이 4개 고정 텍스트 필드뿐인 좁은 구조화 입력이므로, 규칙 기반 이슈 도출로도 "사건 내용에 따라 실제 검토 쟁점을 구조화"하는 요구를 충분히 만족한다.
- **비용/복잡도 절감**: QueryPlanner에 LLM 호출을 추가하면 Gemini 호출 지점이 하나 더 늘어(무료 tier 한도 소진 가속) 파이프라인 전체의 실패 지점도 늘어난다. 규칙 기반은 결정론적이라 단위 테스트가 쉽고, "AI가 쟁점 자체를 잘못 판단"하는 새로운 실패 모드를 만들지 않는다.
- **후속 확장 여지를 남겨둠**: 이 설계 결정은 §5(spec.md 잔여 위험)에 명시적으로 기록했다 — 사건 유형이 다양해지면 후속 SPEC에서 LLM 기반 QueryPlanner로 교체할 수 있으며, `ResearchQuery`가 이미 구조화된 `issueType`/`domain`/`keywords` 필드를 갖고 있으므로 그 전환은 QueryPlanner 내부 구현 교체만으로 가능하다(다른 단계에 파급되지 않는다).

## §6. EvidenceRetriever — DB 조회 + 쿼리별 필터링/스코어링 설계

### 결정 — 스키마 확장 (evidence 자료 유형 축, research.md §9 해소 필요 C)

`evidence` 테이블(`lib/db/schema.ts`)에 신규 컬럼을 추가한다:

```ts
export const evidence = sqliteTable("evidence", {
  id: text("id").primaryKey(),
  category: text("category").notNull(),          // 기존 — 담보 도메인 축 (상해후유장해/질병후유장해)
  evidenceType: text("evidence_type").notNull().default("OTHER"), // 신규 — 자료 유형 축
  title: text("title").notNull(),
  content: text("content").notNull(),
  sourceUrl: text("source_url"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
```

`EvidenceCandidate`(`lib/pipeline/types.ts`)에 대응 필드를 추가한다:

```ts
export type EvidenceType = "POLICY" | "PRECEDENT" | "DISPUTE_CASE" | "STATUTE" | "OTHER";

export interface EvidenceCandidate {
  id: string;
  category: string;
  evidenceType: EvidenceType;
  title: string;
  content: string;
  sourceUrl: string | null;
}
```

`drizzle-kit generate`로 마이그레이션 파일을 신규 생성한다(기존 4개 seed 레코드는 `.default("OTHER")`로 자동 채워지며, 재분류는 이번 SPEC의 범위가 아니다 — §4 Out of Scope). `category`(담보 도메인, 기존 값 "상해후유장해"/"질병후유장해" 유지)와 `evidenceType`(자료 유형, 신규)은 **서로 다른 독립 축**이며 어느 쪽도 다른 쪽의 값을 함의하지 않는다.

### 결정 — 조회/필터링/스코어링 알고리즘

```ts
export async function retrieveEvidence(
  queries: ResearchQuery[],
  db: DrizzleDb = getDb()
): Promise<Map<string, EvidenceCandidate[]>> {
  const all = await db.select().from(evidenceTable);
  const result = new Map<string, EvidenceCandidate[]>();

  for (const query of queries) {
    const domainCategory = domainToCategoryLabel(query.domain); // "INJURY_DISABILITY" → "상해후유장해"
    const scored = all
      .map((item) => ({
        item,
        score:
          (item.category === domainCategory ? 2 : 0) +
          query.keywords.filter((kw) => item.title.includes(kw) || item.content.includes(kw)).length,
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5); // top-N cutoff — §5(spec.md) 잔여 위험에 기록된 초기 파라미터

    result.set(query.id, scored.map((entry) => entry.item));
  }

  return result;
}
```

반환 타입을 `EvidenceCandidate[]`(전체 배열)에서 `Map<queryId, EvidenceCandidate[]>`(쿼리별 필터링 결과)로 바꾼다 — Researcher가 쿼리마다 다른 evidence 부분집합을 받도록 하기 위한 필수 변경이다(REQ-RESEARCH-005). 매칭되는 evidence가 없는 쿼리는 빈 배열을 값으로 갖는다(전체 evidence로 폴백하지 않는다 — "관련 evidence만 선택"이라는 요구를 보존).

### 근거

- **단순하고 테스트 가능한 방식 우선**: product.md/tech.md가 명시한 "seed 데이터 규모에서는 Drizzle ORM 쿼리로 충분"이라는 판단을 그대로 따른다. 카테고리 일치(가중치 2) + 키워드 부분 문자열 매칭(항목당 가중치 1)이라는 단순 합산 스코어는 4개 레코드 규모에서 결정론적으로 검증 가능하고, evidence가 늘어나도 알고리즘 자체는 선형 스캔으로 충분히 버틴다(대규모가 되면 §5 잔여 위험에 기록된 대로 후속 SPEC에서 재조정).
- **evidence-DB-query 전환의 최소 침습**: `getDb()`(`lib/db/client.ts`)를 통한 Drizzle 조회만 추가하고, 트랜잭션이나 새 인덱스는 도입하지 않는다 — SPEC-RUNTIME-001이 이미 `evidence` 테이블에 seed 데이터를 적재해 두었으므로 이번 SPEC은 그 위에서 SELECT만 추가하면 된다.
- **`Map<queryId, ...>` 반환으로 EvidenceRetriever ↔ Researcher 계약을 명확히 함**: `runPipeline()`의 `evidence` 변수는 이제 "쿼리마다 다른 근거자료 집합"을 표현하므로, Researcher는 `evidence.get(query.id) ?? []`로 자신의 쿼리에 해당하는 evidence만 받는다 — REQ-RESEARCH-016("EvidenceRetriever가 반환한 evidence만을 근거로")을 함수 시그니처 수준에서 강제한다.

## §7. evidence-ID 무결성 시행 지점 — structured validation(1차) + Verifier(2차 방어)

### 결정

**1차 방어선 = Researcher의 구조화 출력 검증(생성 시점).** Researcher가 각 쿼리에 대해 `generateStructured()`를 호출할 때, 스키마를 그 쿼리에 실제로 전달된 evidence ID 집합으로 매개변수화한다:

```ts
function buildFindingSchema(validEvidenceIds: readonly string[]) {
  const validSet = new Set(validEvidenceIds);
  return z.object({
    summary: z.string().min(1),
    supportingEvidenceIds: z
      .array(z.string())
      .min(1)
      .refine((ids) => ids.every((id) => validSet.has(id)), {
        message: "존재하지 않는 evidence ID가 포함되었습니다.",
      }),
  });
}
```

이 스키마가 `.refine()`에서 실패하면 `generateStructured()`는 `{ ok: false, reason: "schema_validation_failed" }`를 반환하고, Researcher는 해당 쿼리의 finding을 "판단불충분"으로 강등하거나 재시도한다(REQ-RESEARCH-014) — 즉 위조된 evidence ID는 Researcher 출력에서 애초에 통과하지 못한다.

**2차 방어선 = Verifier의 evidence 재검증(defense-in-depth).** §3에서 확장한 `verify(findings, challenges, evidence: Map<string, EvidenceCandidate[]>, provider)` 시그니처를 사용해, Verifier는 최종 `VerifiedClaim`을 조립하기 직전 `finding.supportingEvidenceIds`를 해당 쿼리의 실제 evidence 집합과 다시 한번 대조한다. 대조를 통과하지 못하는 ID는 조용히 제거하고, 결과적으로 `supportingEvidenceIds`가 빈 배열이 되는 claim은 `uncertainty`(REQ-RESEARCH-023)로 강등한다(제거하지 않고 "판단불충분" 사유로 리포트에 남긴다 — REQ-RESEARCH-020).

### 근거

- **"생성 시점 차단"이 "생성 후 발견"보다 저렴하다**: 1차 방어선이 대부분의 위조를 스키마 검증 단계에서 즉시 잡아내므로, Verifier가 실제로 걸러내야 하는 사례는 드물게 남는다(Skeptic이 evidence 없이 생성한 반론이 finding에 잘못 섞여 들어오는 경우 등). 두 계층을 다 두는 이유는 Skeptic의 `Challenge`가 evidence ID 필드를 갖지 않으므로(REQ-RESEARCH-018 "가능한 경우" — 의무 아님) Researcher 단계의 스키마 검증만으로는 Skeptic 경로를 커버할 수 없기 때문이다 — Verifier가 최종 관문으로서 반드시 필요하다.
- **REQ-RESEARCH-022의 문언("structured output validation 또는 Verifier가... 차단")을 정확히 만족**: 어느 한쪽만 구현하는 대신 두 계층 모두를 "또는"의 양쪽 선택지로 실제 구현하되, 1차/2차 역할을 명확히 구분해 중복 검증의 이유를 설명한다.
- **자동 테스트로 검증 가능**: 1차 방어선은 `buildFindingSchema()`에 고의로 존재하지 않는 evidence ID를 포함한 픽스처를 전달하는 단위 테스트로, 2차 방어선은 `verify()`에 조작된 `finding.supportingEvidenceIds`를 직접 주입하는 단위 테스트로 각각 독립적으로 검증한다(REQ-RESEARCH-025의 "이 조건은 자동 테스트로 검증한다" 요구를 양쪽 다 만족).

## §8. ResearchReport 스키마 확장 + UI 반영

### 결정

```ts
export interface ReviewTarget {
  domain: CoverageDomain;
  issueType: QueryIssueType;
  description: string;
}

export interface VerifiedClaim {
  summary: string;
  supportingEvidenceIds: string[];
  counterArguments: string[];
  status: "VERIFIED" | "INSUFFICIENT"; // REQ-RESEARCH-020
}

export interface MissingMaterial {
  description: string;
  relatedIssueType: QueryIssueType;
}

export interface ResearchReport {
  caseSummary: NormalizedCase;
  reviewTargets: ReviewTarget[];
  verifiedClaims: VerifiedClaim[];
  missingMaterials: MissingMaterial[];
  uncertainty: string[]; // 판단 불충분 사유 목록
  generatedAt: string;
}
```

기존 `claims` 필드명은 `verifiedClaims`로 바뀌므로, `app/cases/[caseId]/page.tsx`의 `report.claims.map(...)` 참조를 `report.verifiedClaims.map(...)`로 갱신한다. 동시에 다음을 반영한다:

- `report.reviewTargets`를 렌더링해 "검토할 담보 목록" 카드를 채운다(기존에는 evidence만으로 이 정보를 유추해야 했다).
- 각 evidence를 표시할 때 `title` 옆에 `sourceUrl`을 조건부로 렌더링한다(`sourceUrl`이 `null`이면 출처 표시를 생략) — 이를 위해 `evidenceById` Map을 `seedEvidence`(정적 JSON) 대신, 리포트에 포함된 evidence ID를 실제 Drizzle 조회 결과로 해석하도록 갱신한다(§6에서 도입한 DB 조회 경로를 UI 레이어에서도 재사용).
- `report.missingMaterials`로 기존 하드코딩된 플레이스홀더 카드("추가 확보 자료 식별은... 후속 SPEC에서 지원할 예정") 문구를 실제 데이터로 교체한다.

### 근거

- **product.md §4가 이미 문서화한 4-섹션 구조(검토할 담보 목록/근거자료/반대논리/추가 확보 자료)와 정확히 대응**: `reviewTargets`/`verifiedClaims`(근거자료+반대논리 포함)/`missingMaterials`가 그 구조를 코드 레벨에서 실현한다 — 새로 발명한 필드가 아니라 이미 계획되어 있던 리포트 형태를 채우는 것이다.
- **`reports.content` 컬럼은 스키마 변경 불필요**: `lib/db/schema.ts`의 `reports` 테이블은 `content: text("content", { mode: "json" })`로 JSON blob을 그대로 저장하므로, `ResearchReport` 타입이 확장되어도 DB 마이그레이션이 필요 없다(SPEC-RUNTIME-001 §3 비기능 제약과 일치하는 "report-shape 변경은 마이그레이션 불필요" 설계).

## §9. 파일 변경 맵 (요약)

| 파일 | 변경 종류 | 요지 |
|---|---|---|
| `lib/pipeline/types.ts` | 확장 | `ResearchQuery`(domain/issueType/keywords), `EvidenceCandidate`(evidenceType), `ResearchReport`/`VerifiedClaim`/신규 `ReviewTarget`/`MissingMaterial` |
| `lib/ai/provider.ts` | 확장 | `generateStructured()` + `GenerateStructuredRequest`/`StructuredResult` 타입 추가 |
| `lib/ai/providers/gemini.ts` | 확장 | `generateStructured()` 구현(zod→JSON Schema, 429 재시도 공유) |
| `lib/ai/providers/deterministic.ts` | 신규 | `mock-llm.ts` 대체 — `generate()`+`generateStructured()` 둘 다 구현 |
| `lib/ai/provider-factory.ts` | 신규 | `getLLMProvider()` — env 기반 Gemini/결정론적 provider 선택 |
| `lib/pipeline/mock-llm.ts` | 폐지 | `deterministic.ts`로 대체(§3 근거) |
| `lib/pipeline/case-normalizer.ts` | 소폭 수정 | 담보 영역 스코프 검증 추가(REQ-RESEARCH-001) |
| `lib/pipeline/query-planner.ts` | 재작성 | 규칙 기반 구조화 쟁점 도출(§5) |
| `lib/pipeline/evidence-retriever.ts` | 재작성 | Drizzle 조회 + 필터링/스코어링, `Map` 반환(§6) |
| `lib/pipeline/researcher.ts` | 재작성 | evidence-first + `generateStructured()` + 1차 방어선(§7) |
| `lib/pipeline/skeptic.ts` | 재작성 | 반론 생성 계약, `generateStructured()` |
| `lib/pipeline/verifier.ts` | 재작성 | evidence 인자 추가 + 2차 방어선(§7) |
| `lib/pipeline/index.ts` | 확장 | `RunPipelineOptions`, provider 단일 주입(§3) |
| `lib/db/schema.ts` | 확장 | `evidence.evidenceType` 컬럼(§6) |
| `db/migrations/` | 신규 | `evidenceType` 컬럼 마이그레이션 파일 |
| `lib/env.ts` | 확장 | app 스코프 `GEMINI_API_KEY` 조건부 게이트(§2) |
| `scripts/run-e2e.ts` | 소폭 수정 | `assembleE2EEnv()`에 `LLM_PROVIDER_MODE=deterministic` 한 줄 추가(§1) |
| `app/cases/[caseId]/page.tsx` | 수정 | `verifiedClaims`/`reviewTargets`/`missingMaterials`/evidence source 렌더링(§8) |
| `lib/pipeline/boundary.test.ts` | 무변경 | 형제-import 경계 그대로 유지(재확인만) |
| `lib/pipeline-gemini-boundary.test.ts` | 무변경 | Gemini SDK confinement 그대로 유지(재확인만) |
