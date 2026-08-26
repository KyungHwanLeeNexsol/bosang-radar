# SPEC-RESEARCH-001 — 구현 계획 (plan.md)

## §A. 접근 방식 (Approach)

이 SPEC은 **재작성이 아니라 대체(replacement)**다 — 6단계 파이프라인의 순차 실행 골격, 형제-import 금지 경계, Gemini SDK confinement, Drizzle-only DB 접근, PII 검증 계층은 SPEC-SCAFFOLD-001/SPEC-RUNTIME-001이 이미 확립한 그대로 유지하고(§A.5 PRESERVE), 각 단계 "내부의" mock/trivial 로직만 evidence-first 실제 로직으로 교체한다.

마일스톤은 **변경 가능성이 가장 높은 결정(신규 타입 계약·인터페이스 확장·데이터 모델 변경)을 먼저 배치**하고, 그 결정이 확정된 뒤에야 각 파이프라인 단계의 구체 구현(기계적으로 그 계약을 소비하는 작업)을 진행하는 순서로 배열했다 — 리뷰가 가장 바뀔 가능성이 큰 결정에 먼저 집중하도록 하기 위함이다.

## §A.5 PRESERVE 목록 (변경 금지 대상)

design.md §9의 "무변경" 표시 항목과 research.md §8의 경계 목록을 종합한 최종 PRESERVE 목록:

1. **파이프라인 순차 실행 구조** — `runPipeline()`이 6단계를 `await` 체인으로 순차 실행하는 구조(`lib/pipeline/index.ts`) 그대로 유지. 병렬화하지 않는다.
2. **형제-import 금지 경계** — `lib/pipeline/boundary.test.ts`가 검증하는 "index.ts만 6개 단계 모듈을 import" 규칙. 이 테스트 파일 자체는 수정하지 않는다(신규 파일 `lib/ai/providers/deterministic.ts` import는 이 규칙의 대상이 아님 — 단계 모듈 간 import가 아니라 `lib/ai/` 하위 파일을 참조하는 것이므로 boundary.test.ts의 STAGE_MODULES 검사 범위 밖).
3. **Gemini SDK confinement** — `lib/pipeline-gemini-boundary.test.ts`가 검증하는 "`lib/pipeline/*.ts`는 `@google/genai`를 직접 import하지 않는다" 규칙. `generateStructured()`가 추가돼도 파이프라인 단계 모듈은 여전히 `@google/genai` 문자열을 포함하지 않아야 한다.
4. **Drizzle-only DB 접근** — `lib/db/client.ts`를 통한 DB 클라이언트 초기화 경로 그대로. EvidenceRetriever의 신규 DB 조회도 이 경로를 통해서만 이루어진다.
5. **PII 검증 계층** — `lib/validation/case-input.ts`의 `caseInputSchema`/`validateCaseInput()`은 수정하지 않는다.
6. **Better Auth / 인증 계층** — `lib/auth/`, `proxy.ts`, `user`/`session`/`account`/`verification`/`allowed_testers` 테이블은 이 SPEC의 스코프 밖.
7. **버전 고정** — `drizzle-orm` 0.45.2, `@libsql/client` 0.17.4, `@google/genai` 2.18.0(`<3.0.0`), `better-auth` 1.7.1, `zod` 4.4.3, `@next/env`/`next` 16.3.2. **신규 런타임 의존성 없음**(zod 4의 네이티브 `z.toJSONSchema()`로 충분 — design.md §4).
8. **E2E 프로세스 계보 설계** — `scripts/run-e2e.ts`의 "e2e/global-setup.ts를 만들지 않고 프로세스 계보로 시크릿을 상속시킨다"는 SPEC-RUNTIME-001의 설계 결정. `LLM_PROVIDER_MODE` 주입도 이 계보를 그대로 탄다(신규 상속 경로를 만들지 않는다 — design.md §1).
9. **`NormalizedCase`/`CaseInput` 필드 구조** — 4개 필드(`incidentDescription`/`diagnosisName`/`disabilityBodyPart`/`incidentDate`) 자체는 바꾸지 않는다. CaseNormalizer는 여전히 이 4필드를 trim만 한다 — 2차 revision(항목 4)에서 REQ-RESEARCH-001이 담보 스코프 검증 책임을 제거했으므로, `lib/pipeline/case-normalizer.ts`는 이번 SPEC에서 **전혀 수정되지 않는다**(§B M3 참고). MVP 담보 제한은 QueryPlanner의 `CoverageDomain` 타입(INJURY_DISABILITY/DISEASE_DISABILITY 2개 리터럴만 허용 — design.md §5)이 구조적으로 보장한다.

## §B. 마일스톤

### M1 — 타입 계약 확정 (신규 타입 인터페이스, 변경 가능성 최상위)

가장 되돌리기 어렵고 이후 모든 마일스톤이 의존하는 결정을 먼저 확정한다.

- `lib/pipeline/types.ts`: `ResearchQuery`(domain/issueType/keywords 추가), `EvidenceCandidate`(evidenceType, scope 추가 — 2차 revision, 항목 6), `Challenge`(supportingEvidenceIds/counterEvidenceIds 추가 — 2차 revision, 항목 5), `ResearchReport`/`VerifiedClaim` 재정의, 신규 `ReviewTarget`/`MissingMaterial`/`QueryIssueType`/`CoverageDomain`/`EvidenceType`/`EvidenceScope`/`VerificationResult`(3차 revision, design.md §3)/`VerifiedCounterArgument`(3차 revision, design.md §7·§8) 타입 정의(design.md §5, §6, §7, §8).
- `lib/db/schema.ts`: `evidence` 테이블에 `evidenceType`/`scope` 컬럼 추가(design.md §6) + `drizzle-kit generate`로 마이그레이션 파일 생성.
- REQ 커버리지: REQ-RESEARCH-006, REQ-RESEARCH-023.

### M2 — LLMProvider 구조화 출력 인터페이스 + Gemini/결정론적 provider 구현 (신규 인터페이스, 변경 가능성 상위)

- `lib/ai/provider.ts`: `generateStructured()` + `GenerateStructuredRequest`/`StructuredResult` 타입 추가(design.md §4). 기존 `generate()`/`GenerateRequest`/`GenerateResponse`는 무변경.
- `lib/ai/providers/gemini.ts`: `generateStructured()` 구현(`z.toJSONSchema()` → Gemini `responseJsonSchema`, 2차 revision — `responseSchema`가 아닌 순수 JSON Schema를 받는 필드 사용; 응답은 `safeParse()`로 재검증. JSON 파싱 실패/스키마 검증 실패를 `StructuredResult`의 `ok:false` 분기로 반환). 기존 429 재시도 로직을 `generate()`/`generateStructured()`가 공유하도록 내부 헬퍼로 추출(외부 계약 무변경).
- `lib/ai/providers/deterministic.ts`(신규): `createDeterministicLLMProvider()` — `generate()`+`generateStructured()` 둘 다 구현, 스키마 shape 기반 고정 픽스처 반환(design.md §1).
- `lib/ai/provider-factory.ts`(신규): `getLLMProvider(env?)` — `LLM_PROVIDER_MODE` 기반 Gemini/결정론적 provider 선택(design.md §1).
- `lib/pipeline/mock-llm.ts` 폐지(M5에서 각 단계 재작성과 함께 처리) — researcher/skeptic/verifier 세 파일은 `mock-llm.ts`를 더 이상 import하지 않으며, `deterministic.ts`도 직접 import하지 않는다(3차 revision, 항목 3 — 이전 revision까지 이 문서에 남아 있던 "세 파일이 deterministic.ts를 import한다"는 서술은 2차 revision(항목 2)에서 provider가 세 함수 모두 필수 인자로 바뀐 설계와 모순되어 정정한다). 2차 revision(항목 2)에서 provider가 세 함수 모두 필수 인자로 바뀌었으므로, 세 파일은 `LLMProvider` 추상화에만 의존한다 — provider 선택 로직(`deterministic.ts` 참조 포함)은 오직 `provider-factory.ts`(정상 앱 경로의 `getLLMProvider()`)와 각 단위 테스트/E2E(명시적 주입)에만 존재한다.
- `lib/env.ts`: app 스코프 `GEMINI_API_KEY` 조건부 게이트 추가(design.md §2), `VAR_INFO`에 항목 추가.
- REQ 커버리지: REQ-RESEARCH-008, REQ-RESEARCH-009, REQ-RESEARCH-012, REQ-RESEARCH-013, REQ-RESEARCH-014, REQ-RESEARCH-015.

### M3 — 오케스트레이터 provider 주입 + QueryPlanner 구조화 (사용자-대면 흐름에 가까운 결정)

- `lib/pipeline/index.ts`: `RunPipelineOptions` 도입, `getLLMProvider()`를 기본값으로 세 LLM 호출 단계에 명시적으로 전달(design.md §3). `research()`/`challenge()`/`verify()` 세 함수 모두 provider가 필수 인자(기본값 없음)로 바뀌었으므로, 호출부(오케스트레이터 + 각 단위 테스트)가 반드시 명시적으로 provider를 전달하도록 갱신한다. `challenge()` 시그니처에 `evidenceMap` 인자 추가(2차 revision, 항목 5), `verify()` 시그니처에 `evidence` 인자 추가에 맞춰 호출부 갱신. `verify()`의 반환 타입이 `VerificationResult`(`{ verifiedClaims, missingMaterials, uncertainty }`)로 바뀌므로(3차 revision, design.md §3), `runPipeline()`의 `ResearchReport` 조립 로직도 이 세 필드를 그대로 옮겨 담도록 갱신한다 — 개별 `VerifiedClaim[]`을 별도로 재구성하거나 `missingMaterials`/`uncertainty`를 오케스트레이터가 따로 계산하지 않는다.
- `lib/pipeline/query-planner.ts`: 고정 2개 쿼리 생성 로직을 규칙 기반 8-issueType 구조화 생성으로 재작성(design.md §5). LLM 호출 없음. 두 담보 도메인 각각 최소 3개(도메인에 맞는 위치/진단 이슈타입 1 + DISABILITY_GRADE_CRITERIA + CAUSATION) — 합산 최소 6개 기준선(2차 revision에서 acceptance.md AC-RESEARCH-002를 이 기준에 맞춰 정합, design.md §5).
- `lib/pipeline/case-normalizer.ts`: **변경 없음(2차 revision)** — REQ-RESEARCH-001이 담보 스코프 검증 책임을 제거했으므로, 기존 4필드 trim 로직이 이미 REQ-RESEARCH-001을 satisfy한다. AC-RESEARCH-001을 검증하는 단위 테스트만 (없으면) 추가하고, 프로덕션 코드는 변경하지 않는다.
- REQ 커버리지: REQ-RESEARCH-001(기존 코드로 이미 satisfy — 테스트만 확인/추가), REQ-RESEARCH-002, REQ-RESEARCH-003, REQ-RESEARCH-010.

### M4 — EvidenceRetriever DB 기반 필터링/스코어링 (evidence 검색 로직)

- `lib/pipeline/evidence-retriever.ts`: `db/seed/evidence.json` 직접 import 제거, Drizzle 조회 + domain AND keyword 관련성 필터(scope 축 포함 — design.md §6, 2차 revision), 반환 타입을 `Map<queryId, EvidenceCandidate[]>`로 변경.
- `db/seed/evidence.json`: 4개 → 10개 curated 레코드로 확장(design.md §6 seed 확장 결정, 2차 revision 항목 7) — 도메인별 issueType 키워드 커버리지 + scope: UNIVERSAL 레코드 1건 포함.
- `scripts/db-seed.ts`: `evidenceType`/`scope` 컬럼 기본값(`.default("OTHER")`/`.default("DOMAIN_SPECIFIC")`)이 자동 적용되는지 확인(재실행 안전성 회귀 없음 — REQ-RUNTIME-005 계승).
- REQ 커버리지: REQ-RESEARCH-004, REQ-RESEARCH-005, REQ-RESEARCH-006, REQ-RESEARCH-007.

### M5 — Researcher/Skeptic/Verifier evidence-first 재작성 + evidence-ID 무결성 시행

- `lib/pipeline/researcher.ts`: `evidence.get(query.id) ?? []`로 쿼리별 evidence만 사용, `generateStructured()` + `buildFindingSchema(validEvidenceIds)` 1차 방어선(design.md §7), 금지 표현 제약을 프롬프트/스키마 수준에서 반영. provider는 필수 인자(design.md §3, 2차 revision).
- `lib/pipeline/skeptic.ts`: 반론 생성 계약(기왕증/퇴행성/인과관계 부족 등 프롬프트 지시), `generateStructured()` 적용. `evidenceMap` 인자 추가(2차 revision, 항목 5) — Skeptic이 finding 텍스트뿐 아니라 실제 evidence를 프롬프트에 받고, `Challenge.supportingEvidenceIds`/`counterEvidenceIds`를 `buildChallengeSchema(validEvidenceIds)`(design.md §7)로 1차 방어선을 적용한다. provider는 필수 인자. `Challenge.findingId`는 LLM의 구조화 출력에 포함되지 않으며, `challenge()`가 `findings` 배열을 순회하는 과정에서 `finding.queryId`를 코드에서 직접 부여한다(4차 revision, design.md §7).
- `lib/pipeline/verifier.ts`: `evidence` 인자 추가, 2차 방어선(existing evidence ID 재검증 — Researcher claim **및** Skeptic evidence 양쪽 모두, design.md §7) + `VerifiedClaim.status`(`VERIFIED`|`INSUFFICIENT`) 산출, `missingMaterials` 생성 로직. provider는 필수 인자. 반환 타입을 `VerificationResult`(`{ verifiedClaims, missingMaterials, uncertainty }` — 3차 revision, design.md §3)로 바꾸고, 2차 방어선을 통과한 유효 evidence ID는 `VerifiedClaim.counterArguments`를 `VerifiedCounterArgument[]`(`{ summary, supportingEvidenceIds, counterEvidenceIds }` — 3차 revision, design.md §7·§8)로 구조화해 보존한다. `queries: ResearchQuery[]` 인자도 함께 받아(4차 revision, design.md §3·§7), `queries`와 `findings`를 `queryId` 기준으로 대조해 대응하는 finding이 없는 query마다 `relatedIssueType`이 그 query의 `issueType`과 정확히 일치하는 `MissingMaterial` 항목을 생성하고 사유를 `uncertainty`에 기록하는 로직을 추가한다.
- 이 시점에 M2의 `mock-llm.ts` 폐지를 완료한다 — 세 파일(researcher/skeptic/verifier) 모두에서 `mock-llm.ts` import를 제거하고, `LLMProvider` 추상화(필수 인자로 전달받는 provider)에만 의존하도록 정리한다(`deterministic.ts`를 직접 import하지 않음 — provider-factory.ts와 테스트/E2E에서만 참조됨, 3차 revision 항목 3, design.md §3 근거).
- 기존 단위 테스트(`researcher.test.ts`/`evidence-retriever.test.ts` 등)의 stub provider 객체에 `generateStructured()` 구현을 추가해야 컴파일이 통과한다 — 이 갱신도 이번 마일스톤에서 함께 처리.
- `verifier.test.ts`의 기존 호출은 **5인자 필수 형태**(`verify(queries, findings, challenges, evidenceMap, provider)`)로 재작성해야 한다(design.md §3 — `queries`가 1번째 인자로 신규 추가되고(4차 revision), `evidence`가 4번째, `provider`가 5번째 **필수** 인자가 됨, 기본값 없음) — stub provider 객체의 형태만 바꾸는 것이 아니라, 컴파일을 깨는 시그니처 변경이므로 모든 호출부를 함께 고친다. `verify()`의 반환 타입도 `VerifiedClaim[]`에서 `VerificationResult`(3차 revision)로 바뀌므로, 기존에 `verify(...)`의 반환값을 배열로 직접 순회하던 단언(assertion)은 `result.verifiedClaims`를 통해 순회하도록, `missingMaterials`/`uncertainty` 관련 단언은 `result.missingMaterials`/`result.uncertainty`를 읽도록 함께 갱신한다.
- `skeptic.test.ts`의 호출은 **3인자 필수 형태**(`challenge(findings, evidenceMap, provider)`)로 재작성해야 한다(design.md §3 — 2차 revision에서 `evidenceMap` 인자가 신규 추가되고 `provider`가 3번째 필수 인자가 됨) — stub provider 객체(`verifier.test.ts`와 동일한 형태)도 `LLMProvider.generateStructured()` 추가에 맞춰 함께 갱신해야 한다.
- `researcher.test.ts`의 호출도 provider가 이제 필수 인자임을 반영해 모든 호출부가 명시적으로 provider를 전달하는지 재확인한다(기존에도 3인자였으므로 형태 변화는 없으나, 기본값 제거로 인해 provider 생략 호출이 있었다면 컴파일 오류로 드러난다 — 있다면 함께 고친다).
- REQ 커버리지: REQ-RESEARCH-016, REQ-RESEARCH-017, REQ-RESEARCH-018, REQ-RESEARCH-019, REQ-RESEARCH-020, REQ-RESEARCH-021, REQ-RESEARCH-022.

### M6 — ResearchReport/UI 반영 + E2E 결정론적 provider 전략 + 전체 회귀 검증 (마무리, 변경 가능성 최하위)

- `app/cases/[caseId]/page.tsx`: `verifiedClaims`/`reviewTargets`/`missingMaterials` 렌더링, evidence title/source 표시(design.md §8).
- `scripts/run-e2e.ts`: `assembleE2EEnv()`에 `LLM_PROVIDER_MODE=deterministic` 한 줄 추가(design.md §1).
- `e2e/*.spec.ts`: 기존 시나리오(로그인/사건입력/피드백/테넌트 격리)가 신규 리포트 shape에 대해 깨지지 않는지 확인, 6단계 파이프라인 end-to-end 시나리오 추가(신규 리포트 필드 노출 확인).
- 전체 회귀: `pnpm test`, `pnpm lint`, `pnpm format:check`, `pnpm build`, `pnpm test:e2e` 5종 게이트 통과 확인.
- REQ 커버리지: REQ-RESEARCH-011, REQ-RESEARCH-024, REQ-RESEARCH-025.

## §C. 사전 점검 (Pre-flight)

```bash
# 1. 현재 브랜치/베이스라인 확인
git branch --show-current
git rev-parse HEAD

# 2. 크로스플랫폼 빌드 사전 확인
pnpm build

# 3. 기존 lint 베이스라인 측정 (NEW 이슈와 기존 이슈 구분용)
pnpm lint

# 4. PRESERVE 대상 파일 목록 확인
git ls-files lib/pipeline/boundary.test.ts lib/pipeline-gemini-boundary.test.ts lib/validation/case-input.ts lib/auth/ proxy.ts

# 5. zod v4 z.toJSONSchema() 가용성 확인 (design.md §4 전제 조건)
node -e "const {z}=require('zod'); console.log(typeof z.toJSONSchema)"
```

## §D. 위험 (Risks)

- **인터페이스 확장의 파급 범위**: `LLMProvider`에 `generateStructured()`를 추가하면 이를 구현하는 모든 provider(Gemini/deterministic)와 이를 stub하는 모든 테스트 파일이 함께 갱신되어야 한다 — M2/M5에서 컴파일 실패를 즉시 감지할 수 있도록 TypeScript strict 모드(`pnpm build`)를 마일스톤마다 재확인한다.
- **evidence-retriever 반환 타입 변경의 하위 호환성**: `EvidenceCandidate[]` → `Map<queryId, EvidenceCandidate[]>` 변경은 breaking change다 — `evidence-retriever.test.ts`의 기존 두 테스트 케이스(둘 다 배열 반환을 가정)가 이 변경과 함께 재작성되어야 한다(M4).
- **QueryPlanner 규칙 기반 설계의 리뷰 반전 가능성**: design.md §5의 "LLM 미호출" 결정은 이번 SPEC에서 가장 재고 가능성이 높은 판단이다 — Approach-First 리뷰에서 사용자가 QueryPlanner도 LLM 기반으로 요구할 경우, M3 단독으로 재설계가 가능하도록 다른 마일스톤과 결합도를 낮게 유지했다(`ResearchQuery`의 `issueType`/`domain`/`keywords` 필드 구조는 LLM 기반으로 바뀌어도 동일하게 재사용 가능).
- **Gemini 무료 tier 한도**: 쿼리 개수 증가(2개 → 최대 16개)로 호출 빈도가 늘어난다 — M5에서 429 재시도 경로가 여전히 유효한지 확인.
- **관련성 필터 강화(2차 revision, 항목 6)로 인한 recall 저하 위험**: domain AND keyword를 모두 요구하는 필터는 키워드가 충분히 커버되지 않은 evidence를 이전보다 더 많이 배제할 수 있다 — 이를 완화하기 위해 seed를 4→10개로 확장했으나(항목 7, design.md §6), 실사용 데이터가 늘어나는 시점에 키워드 사전·스코어링 파라미터 재조정이 추가로 필요할 수 있다(spec.md §5 잔여 위험과 연계).
