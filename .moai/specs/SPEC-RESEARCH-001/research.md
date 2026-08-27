# SPEC-RESEARCH-001 — 코드베이스 실측 (research.md)

> 이 문서는 `Agent(Explore)` read-only 정찰 결과와 관련 소스 파일 직접 실측(Read)을 결합해 작성됐다. `spec.md`/`plan.md`/`design.md`가 내리는 모든 설계 결정의 근거 실측을 여기 모은다.

## §1. 파이프라인 6단계 현행 구조 (실측)

`lib/pipeline/index.ts`의 `runPipeline(input: CaseInput): Promise<ResearchReport>`가 6단계를 순차 `await`로 실행한다: `normalizeCase → planQueries → retrieveEvidence → research → challenge → verify`. `index.ts`만 6개 단계 모듈을 import하는 유일한 파일이며, 이 경계는 `lib/pipeline/boundary.test.ts`가 각 단계 모듈이 서로 다른 형제 단계 모듈을 `from "./..."`로 직접 import하지 않는지 정규식으로 검사해 강제한다(0건 요구). 이번 SPEC은 이 순차 구조와 형제-import 금지 경계를 그대로 유지한다.

각 단계의 현재 trivial 구현:

- **CaseNormalizer** (`case-normalizer.ts`): `CaseInput`의 4개 필드(`incidentDescription`/`diagnosisName`/`disabilityBodyPart`/`incidentDate`)를 trim하고 `normalizedAt` 타임스탬프만 추가한 `NormalizedCase`를 반환한다.
- **QueryPlanner** (`query-planner.ts`): `NormalizedCase`로부터 **고정 2개** `ResearchQuery`(`q-injury-disability`, `q-disease-disability`)만 생성한다. `id`/`topic`/`focus` 3필드뿐이다.
- **EvidenceRetriever** (`evidence-retriever.ts`): `_queries` 인자를 **완전히 무시**하고 `db/seed/evidence.json`(seedEvidence, 4개 레코드) 전체를 그대로 반환하는 trivial pass-through다. `source: EvidenceCandidate[] = seedEvidence` 기본 파라미터로 테스트 시 커스텀 소스 주입이 가능한 DI 시임이 이미 존재한다.
- **Researcher** (`researcher.ts`): 쿼리마다 `provider.generate({ prompt: query.topic })`을 호출해 `summary`를 만들고, `supportingEvidenceIds`는 **전달받은 evidence 배열 전체의 id**를 그대로 매핑한다(쿼리별 필터링 없음). `provider: LLMProvider = createMockLLMProvider()` 기본 파라미터로 DI 시임 존재.
- **Skeptic** (`skeptic.ts`): finding마다 `provider.generate({ prompt: finding.summary })`를 호출해 `counterArgument`를 생성하는 trivial pass-through. 동일한 mock 기본 파라미터 DI 시임.
- **Verifier** (`verifier.ts`): finding+challenge를 조합해 `VerifiedClaim`을 만들되, evidence ID 존재 여부 재검증 로직은 **없다** — `finding.supportingEvidenceIds`를 그대로 복사한다. 동일한 mock 기본 파라미터 DI 시임.

## §2. LLMProvider / Gemini adapter 현행 상태 (실측)

- `lib/ai/provider.ts`는 `GenerateRequest { prompt, model? }` / `GenerateResponse { text }` / `LLMProvider { generate(request): Promise<GenerateResponse> }` **3개 타입만** 정의한다. 구조화 출력(JSON/schema) 관련 메서드는 전혀 없다. 파일 상단 `@MX:ANCHOR` 주석이 "Researcher/Skeptic/Verifier 등 다수 파이프라인 단계가 이 인터페이스에만 의존하므로 시그니처 변경은 전체 파이프라인에 영향을 준다"고 명시 — 인터페이스 확장은 신중하게 다뤄야 하는 고위험 변경점임을 코드 스스로 경고하고 있다.
- `lib/ai/providers/gemini.ts`의 `GeminiProvider`는 **완전히 구현되고 단위 테스트된 실제 클래스**다: `@google/genai`의 `GoogleGenAI` 클라이언트를 사용하고, `gemini-2.5-flash` 모델, 429(rate limit) 감지 시 지수 백오프 재시도(`DEFAULT_MAX_RETRIES=3`, `DEFAULT_INITIAL_DELAY_MS=1000`), 재시도 소진 시 예외 전파(swallow 안 함) 로직까지 갖췄다. `constructor`는 `options.apiKey ?? process.env.GEMINI_API_KEY`가 없으면 즉시 throw한다.
- **그러나 production 호출부가 하나도 없다.** `researcher.ts`/`skeptic.ts`/`verifier.ts` 어디에도 `GeminiProvider`를 import하거나 인스턴스화하는 코드가 없다 — 셋 다 `createMockLLMProvider()`(`lib/pipeline/mock-llm.ts`)를 기본값으로 사용한다. `mock-llm.ts`는 `[mock] ${request.prompt}`를 반환하는 trivial pass-through이며, 자신은 6개 단계 모듈에 포함되지 않으므로(파일 상단 주석에 명시) `researcher.ts` 등이 이를 import해도 형제-단계 import 금지 경계(AC-SCAFFOLD-012)를 위반하지 않는다.
- `@google/genai` import 경계는 `lib/pipeline/boundary.test.ts`와 별개로 `lib/pipeline-gemini-boundary.test.ts`(파이프라인 디렉터리 **밖**)가 담당한다 — `lib/pipeline/*.ts` 어디에도 `@google/genai` 문자열이 등장하지 않는지 grep 기반으로 검증한다(REQ-SCAFFOLD-018, AC-SCAFFOLD-016). 이 SPEC은 이 경계 테스트를 유지하며, 구조화 출력 확장이 추가되더라도 Gemini SDK 세부사항은 `gemini.ts` 내부에만 존재해야 한다.

## §3. Drizzle 스키마 / Evidence 저장소 실측

- `lib/db/schema.ts`의 `evidence` 테이블: `id`(PK), `category`(text, not null), `title`, `content`, `sourceUrl`(nullable), `createdAt`. `category` 컬럼 주석은 "담보(coverage) 카테고리 — 예: 상해후유장해, 질병후유장해"라고 명시한다 — 즉 현재 `category`는 **담보 도메인**(coverage domain)을 나타내지, 사용자가 요청한 POLICY/PRECEDENT/DISPUTE_CASE/STATUTE/OTHER 같은 **자료 유형**(evidence type)과는 다른 축이다.
- `db/seed/evidence.json`은 정확히 4개 레코드다: 2개는 `category: "상해후유장해"`(발목 인대 파열, 상해 진단서 요건), 2개는 `category: "질병후유장해"`(약관 해설, 감정 절차). 4개 모두 `sourceUrl: null`이며, 자료 유형을 구분하는 필드는 없다.
- `scripts/db-seed.ts`(SPEC-RUNTIME-001 M2 산출물, 재실행 안전)가 `evidence.json`을 `evidence` 테이블에 적재한다 — SPEC-RUNTIME-001은 이 적재 경로만 만들었을 뿐, **조회 경로는 바꾸지 않았다**(SPEC-RUNTIME-001 §1 WHY에 "이번 SPEC에서 조회 경로 자체는 바뀌지 않는다" 명시). 즉 `evidence` 테이블은 이미 채워져 있으나, `evidence-retriever.ts`도 `app/cases/[caseId]/page.tsx`도 여전히 `db/seed/evidence.json`을 직접 import해 읽는다 — 이번 SPEC이 그 간극(EvidenceRetriever를 DB 조회로 전환)을 채우는 첫 SPEC이다.
- `app/cases/[caseId]/page.tsx`도 `seedEvidence`(JSON 직접 import)로 `evidenceById` Map을 만들어 `claim.supportingEvidenceIds`를 evidence title로 역참조한다 — 이 UI 소비 패턴은 evidence "title" 조회에는 이미 대응하지만, `sourceUrl`은 화면에 렌더링하지 않는다(REQ-RESEARCH-024가 이를 채운다).

## §4. `lib/env.ts` 스코프별 환경변수 실측

- `EnvScope = "db" | "provision" | "app" | "e2e"` 4개 스코프. `REQUIRED_BY_SCOPE.app = ["TURSO_DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL"]` — **`GEMINI_API_KEY`가 어떤 스코프에도 없다.** 파일 상단 주석이 명시적으로 "GEMINI_API_KEY는 어떤 스코프에서도 요구하지 않는다(파이프라인이 mock 구현을 유지하는 동안 — 각주는 design.md §3.1 참고)"라고 적어, **이 SPEC이 그 각주가 가리키는 후속 SPEC임을 코드 스스로 예고**하고 있다. `VAR_INFO`에도 `GEMINI_API_KEY` 항목이 없다.
- `validateEnv(scope, source)`는 스코프별 필수 변수 배열을 순회해 누락분을 **전부 열거**(첫 항목에서 중단하지 않음)하고, `TURSO_DATABASE_URL`이 `file:` 스킴이 아니면 `TURSO_AUTH_TOKEN`도 요구하는 **조건부 capability gate**를 이미 하나 갖고 있다(105-111행) — 이 조건부 게이트 패턴이 이번 SPEC의 `GEMINI_API_KEY` app-scope 조건부 요구(§ design.md §2 참고)를 설계할 때 그대로 재사용할 수 있는 기존 관례다.
- `scripts/run-e2e.ts`의 `assembleE2EEnv()`는 `TURSO_DATABASE_URL`(file: 스킴 고정), `BETTER_AUTH_URL`(동적 포트), `BETTER_AUTH_SECRET`(랜덤 32바이트), `TESTER_PASSWORD`(랜덤)를 조립해 `process.env`에 쓴다. **`GEMINI_API_KEY`를 전혀 조립하지 않는다** — E2E는 `bootstrapCli("e2e")`로 `"e2e"` 스코프를 검증하며, `e2e` 스코프 배열에도 `GEMINI_API_KEY`가 없다. `runE2E()`는 `pnpm build && pnpm start`(playwright.config.ts의 `webServer`)로 실제 Next.js 앱 서버를 띄우는데, 그 앱 서버는 부팅 시 `instrumentation.ts`를 통해 **`app` 스코프**를 검증한다(SPEC-RUNTIME-001 REQ-RUNTIME-미상 — instrumentation.ts는 직접 열어보지 않았으나 SPEC-RUNTIME-001 §5 잔여 위험이 "GEMINI_API_KEY 부재 상태로의 앱 기동 가능성" 항목에서 이를 확인해준다: "앱 런타임 스코프는 GEMINI_API_KEY를 요구하지 않는다... 후속 SPEC이 실호출을 도입하는 시점에 이 변수를 앱 런타임 스코프의 필수 항목으로 승격해야 하며, 승격이 누락되면 실패 지점이 부팅에서 첫 호출 시점으로 밀린다"). **이것이 design.md에서 반드시 풀어야 하는 충돌이다**: `app` 스코프가 `GEMINI_API_KEY`를 무조건 필수로 요구하게 되면, E2E가 띄우는 그 동일한 앱 서버가 `GEMINI_API_KEY` 없이 부팅에 실패한다 — E2E는 결정론적 provider를 쓰므로 실제 키가 필요 없어야 한다.

## §5. Zod 사용 실측 (구조화 출력 검증의 선례 부재)

- `lib/validation/case-input.ts`가 프로젝트의 **유일한** Zod 사용처다: `caseInputSchema`는 4개 텍스트 필드에 `.strict()` + PII 정규식 `.refine()`을 적용해 사건 입력 폼/API 경계에서 주민등록번호·전화번호 형식을 구조적으로 거부한다. `zod: "4.4.3"`가 이미 `dependencies`에 고정되어 있다(product.md/tech.md의 "Zod — 입력 검증" 절과 정확히 일치).
- **LLM 응답을 Zod로 검증하는 선례는 프로젝트 전체에 전혀 없다** — 이번 SPEC의 구조화 출력 검증 계층은 완전한 신규(greenfield) 작업이다. 다만 zod 4.4.3은 네이티브 `z.toJSONSchema()` 변환기를 제공하므로(zod v4 신규 기능), Gemini의 구조화 출력 설정(`responseJsonSchema` 필드 — 2차 revision, JSON Schema를 직접 받는 필드를 사용)에 필요한 JSON Schema를 **신규 의존성 추가 없이** zod 스키마로부터 직접 생성할 수 있다(design.md §4에서 이 경로를 채택한다). Gemini 응답은 그렇게 생성된 값이라도 항상 `safeParse()`로 재검증된다 — Gemini의 structured-output 세부사항은 adapter 내부(`gemini.ts`)에만 위치하고 pipeline 단계 모듈에는 노출되지 않는다.

## §6. UI 소비 실측 (`app/cases/[caseId]/page.tsx`)

- 현재 `ResearchReport.claims: VerifiedClaim[]`을 순회해 `claim.summary`/`claim.supportingEvidenceIds`(제목으로 역참조)/`claim.counterArguments`를 렌더링한다.
- **"추가 필요 자료" 카드는 하드코딩된 플레이스홀더**다: "추가 확보 자료 식별은 파이프라인 고도화 이후 후속 SPEC에서 지원할 예정입니다" — 이 SPEC이 바로 그 후속 SPEC이며, `missingMaterials` 필드가 이 자리를 채운다.
- `report.caseSummary.diagnosisName`/`disabilityBodyPart`/`incidentDescription`을 그대로 렌더링하는데, `NormalizedCase` 타입이 바뀌지 않는 한(이번 SPEC은 `NormalizedCase` 필드 자체는 손대지 않는다 — CaseNormalizer는 여전히 4필드 trim만 한다) 이 부분은 무변경으로 유지 가능하다.
- `evidenceById` Map은 여전히 `seedEvidence`(JSON) 기반이다 — REQ-RESEARCH-024(evidence title/source 표시)를 만족시키려면 이 Map의 데이터 소스를 리포트에 실제로 포함된 evidence 메타데이터로 교체하거나, DB 조회로 바꿔야 한다(design.md §4에서 구체화).

## §7. 테스트 하네스 실측 — DI 시임과 E2E 갭

- 모든 파이프라인 단계 테스트(`researcher.test.ts`, `evidence-retriever.test.ts` 등 확인됨)가 이미 **"주입 가능한 provider/source 3번째·2번째 인자" 패턴**을 사용한다 — `researcher.test.ts`는 `stubProvider: LLMProvider = { async generate(request) { return { text: `stub:${request.prompt}` } } }`를 3번째 인자로 넘기고, 조사 시점에는 "주입된 provider가 없으면 기본 mock provider로 동작한다"는 두 번째 테스트 케이스로 기본값 폴백까지 검증하고 있었다. **함수가 provider를 인자로 받는다는 DI 시임 자체는 이번 SPEC이 보존한다** — 다만 design.md §3(2차 revision, 항목 2)에서 "provider 생략 시 기본값으로 폴백"하는 하위 동작은 명시적으로 제거되므로, 위 "기본값 폴백" 테스트 케이스는 그대로 통과할 수 없다(provider가 필수 인자가 되어 컴파일 오류가 나기 때문) — 해당 테스트 케이스는 run-phase에서 삭제되거나 "provider 생략 시 컴파일 오류"를 검증하는 형태로 대체되어야 한다. `generateStructured`를 추가로 요구하게 되면 `stubProvider`가 그 메서드도 구현해야 하므로 각 테스트 파일의 stub 객체는 확장이 필요하다 — 이는 새 인터페이스 멤버 추가에 따른 자연스러운 파급이다.
- `gemini.test.ts`(직접 열람하지 않았으나 Explore 보고에서 확인)는 `@google/genai`를 `vi.mock`으로 완전히 모킹해 재시도/백오프/에러 전파를 테스트한다 — 이 패턴이 `generateStructured`의 Gemini 구현체 테스트에도 재사용 가능한 선례다.
- **E2E 갭 (Explore가 명시적으로 미해결로 남긴 지점)**: `scripts/run-e2e.ts`의 `assembleE2EEnv()`는 결정론적 LLM provider를 주입하는 메커니즘을 전혀 갖고 있지 않다 — LLM provider 선택은 지금까지 전적으로 각 파이프라인 단계 함수의 기본 파라미터(`= createMockLLMProvider()`)에만 의존해왔고, 오케스트레이터(`runPipeline`) 수준에서 provider를 주입하는 지점 자체가 없다. `package.json`의 `test:e2e` 스크립트가 `pnpm build && pnpm start`로 실제 프로덕션 빌드를 띄우므로, "앱이 mock을 쓰는지 실제 Gemini를 쓰는지"는 오직 코드가 무엇을 기본값으로 삼느냐에 달려 있다 — 이번 SPEC에서 mock 기본값을 제거하고 나면, E2E가 실제 Gemini를 호출하게 되는 회귀가 설계적으로 발생할 수 있다. design.md §1이 이를 명시적으로 해결한다.

## §8. 아키텍처 경계 제약 종합 (PRESERVE 대상)

SPEC-SCAFFOLD-001(REQ-SCAFFOLD-018)과 SPEC-RUNTIME-001(REQ-RUNTIME-019)이 확립·보존해 온 경계는 다음과 같으며, 이번 SPEC도 전부 보존한다:

1. 파이프라인 단계 모듈 형제-간 직접 import 금지 — index.ts만 예외 (`lib/pipeline/boundary.test.ts`)
2. `@google/genai` 직접 import는 `lib/ai/providers/gemini.ts` 밖에서 금지 (`lib/pipeline-gemini-boundary.test.ts`)
3. DB 접근은 Drizzle ORM(`lib/db/client.ts`)을 통해서만 — libSQL 고유 문법 직접 사용 금지
4. `lib/validation/case-input.ts`의 PII 차단 Zod 스키마는 `CaseNormalizer` 호출 이전 단계에서 실행 — 이번 SPEC은 이 스키마 자체를 변경하지 않는다
5. 버전 고정: `drizzle-orm` 0.45.2(stable, `@rc` 제외), `@libsql/client` 0.17.4, `@google/genai` **2.18.0(`<3.0.0` 고정 유지)**, `better-auth` 1.7.1, `zod` 4.4.3, `@next/env`/`next` 16.3.2 — 전부 이미 설치되어 있으며 이번 SPEC은 신규 런타임 의존성을 추가할 필요가 없다(zod 4의 네이티브 `toJSONSchema()`로 충분).
6. `lib/auth/`, `proxy.ts`, Better Auth 관련 DB 테이블(`user`/`session`/`account`/`verification`/`allowed_testers`)은 무변경 — 이번 SPEC의 스코프 밖이다.

## §9. 미해결 질문 / 갭 (design.md에서 해소)

- **(해소 필요 A)** E2E가 띄우는 실제 앱 서버(`pnpm build && pnpm start`)가 `GEMINI_API_KEY` 없이도 부팅에 성공하면서, 동시에 실제 프로덕션 앱 런타임은 `GEMINI_API_KEY`를 필수로 요구해야 하는 상충 요구사항 — §4에서 실측한 조건부 capability gate 패턴(`TURSO_AUTH_TOKEN` file: 스킴 게이트)을 재사용해 해소한다.
- **(해소 필요 B)** `runPipeline`에 단일 provider 주입 지점이 없다 — 오케스트레이터 시그니처 확장이 필요하며, 각 단계 함수의 기존 DI 시임(3번째/2번째 인자 기본값)과 충돌 없이 공존해야 한다.
- **(해소 필요 C)** evidence의 "담보 도메인"(`category`, 상해/질병 2종) 축과 사용자가 요청한 "자료 유형"(POLICY/PRECEDENT/DISPUTE_CASE/STATUTE/OTHER) 축이 서로 다른 차원이라는 점 — 스키마 설계 시 두 축을 혼동하지 않고 별도 컬럼/필드로 분리해야 한다.
- 다음 파일들은 이번 조사에서 직접 열람하지 않았다(Explore 요약에만 의존): `e2e/*.spec.ts`, `playwright.config.ts`, `lib/pipeline/skeptic.test.ts`/`verifier.test.ts`/`query-planner.test.ts`, `lib/auth/config.ts`, `lib/ai/providers/gemini.test.ts`, `instrumentation.ts`, `db/migrations/` 전체, `scripts/db-seed.ts`, `CHANGELOG.md`. 이들 중 구현(run-phase)에 직접 영향을 주는 파일(`gemini.test.ts`, `instrumentation.ts`, `db-seed.ts`)은 plan.md의 각 마일스톤에서 착수 시점에 직접 열람하도록 명시했다 — plan-phase에서 실측하지 못한 세부사항이 설계 결정을 뒤집을 만큼 크지 않다고 판단했기 때문이다(이미 확보한 실측만으로 §1-§8의 경계·타입·환경변수 설계가 확정 가능).
