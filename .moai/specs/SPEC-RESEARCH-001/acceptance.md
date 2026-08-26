# SPEC-RESEARCH-001 — 인수 기준 (acceptance.md)

## §A. 개요

각 AC는 정확히 1개의 `REQ-RESEARCH-XXX`를 검증한다(1:1 추적성 — §D 커버리지 매트릭스 참고). 모든 AC는 이진(binary) 판정 가능하도록 작성했으며, "판단형" 문구(예: "적절히", "충분히") 대신 관측 가능한 명령/출력/타입 조건으로 표현했다.

## §B. AC 매트릭스 (Given-When-Then)

**AC-RESEARCH-001** (REQ-RESEARCH-001)
- Given: `incidentDescription`/`diagnosisName`/`disabilityBodyPart`/`incidentDate`가 모두 채워진 `CaseInput`
- When: `normalizeCase(input)`을 호출한다
- Then: 반환된 `NormalizedCase`가 4개 필드를 모두 trim된 상태로 포함하고, 상해후유장해·질병후유장해 두 담보 영역 외의 값을 스코프 밖으로 표시하는 검증 로직이 단위 테스트로 존재한다(범위 밖 입력에 대한 명시적 케이스 최소 1건).

**AC-RESEARCH-002** (REQ-RESEARCH-002)
- Given: `diagnosisName`과 `disabilityBodyPart`가 모두 채워진 `NormalizedCase`
- When: `planQueries(normalizedCase)`를 호출한다
- Then: 반환된 `ResearchQuery[]`가 최소 6개 이상이며, `issueType` 필드값이 `DISABILITY_LOCATION`/`DIAGNOSIS`/`DISABILITY_GRADE_CRITERIA`/`CAUSATION` 4종을 각 담보 도메인(`domain`)에 대해 최소 1개씩 포함한다.

**AC-RESEARCH-003** (REQ-RESEARCH-003)
- Given: 임의의 `NormalizedCase`
- When: `planQueries()`가 생성한 모든 `ResearchQuery`의 `topic`/`focus` 문자열을 검사한다
- Then: "지급", "확정", "확률" 등 지급 여부·확률을 단정하는 어휘가 하나도 포함되지 않는다(고정 금칙어 리스트 기반 단위 테스트).

**AC-RESEARCH-004** (REQ-RESEARCH-004)
- Given: `evidence` 테이블에 시드 데이터가 적재된 테스트 DB
- When: `retrieveEvidence(queries)`를 호출한다
- Then: `db/seed/evidence.json`을 직접 import하는 코드 경로 없이 Drizzle `db.select().from(evidenceTable)` 호출을 거쳐 결과가 반환된다(`lib/pipeline/evidence-retriever.ts`에 `evidence.json` import 문이 존재하지 않음을 grep으로 확인).

**AC-RESEARCH-005** (REQ-RESEARCH-005)
- Given: 서로 다른 `keywords`를 가진 두 개의 `ResearchQuery`(A, B)와 A/B 각각의 키워드에만 매칭되는 evidence 레코드가 섞인 DB
- When: `retrieveEvidence([A, B])`를 호출한다
- Then: 반환된 `Map`에서 `result.get(A.id)`와 `result.get(B.id)`가 서로 다른 evidence 부분집합을 반환하며, 어느 쪽에도 매칭되지 않는 evidence는 두 결과 모두에 포함되지 않는다.

**AC-RESEARCH-006** (REQ-RESEARCH-006)
- Given: `evidenceType`이 `"PRECEDENT"`로 설정된 evidence 레코드
- When: 해당 레코드를 `retrieveEvidence()`로 조회한다
- Then: 반환된 `EvidenceCandidate.evidenceType`이 타입 오류 없이 `"PRECEDENT"`로 유지되며, `EvidenceType` 타입이 `POLICY`/`PRECEDENT`/`DISPUTE_CASE`/`STATUTE`/`OTHER` 5개 리터럴을 모두 허용하는 유니온으로 정의되어 있다(TypeScript 컴파일 통과로 검증).

**AC-RESEARCH-007** (REQ-RESEARCH-007)
- Given: 이 SPEC이 완료된 시점의 `package.json`
- When: `dependencies`/`devDependencies`를 SPEC-RUNTIME-001 완료 시점과 비교한다
- Then: vector DB, 임베딩, ANN 검색 관련 신규 패키지가 추가되지 않았다(패키지 목록 diff로 확인).

**AC-RESEARCH-008** (REQ-RESEARCH-008)
- Given: `LLM_PROVIDER_MODE`가 설정되지 않고 `GEMINI_API_KEY`가 유효한 애플리케이션 런타임
- When: `getLLMProvider()`를 인자 없이 호출한다
- Then: 반환된 인스턴스가 `GeminiProvider`이며(`instanceof` 확인), `researcher.ts`/`skeptic.ts`/`verifier.ts` 소스에 `createMockLLMProvider` 참조가 더 이상 존재하지 않는다(grep 0건).

**AC-RESEARCH-009** (REQ-RESEARCH-009)
- Given: 이번 SPEC 완료 후의 `lib/pipeline/*.ts` 전체
- When: `lib/pipeline-gemini-boundary.test.ts`를 실행한다
- Then: `@google/genai` 문자열이 `lib/pipeline/*.ts` 어디에도 등장하지 않음을 확인하는 기존 테스트가 그대로 통과한다(0건 유지).

**AC-RESEARCH-010** (REQ-RESEARCH-010)
- Given: `RunPipelineOptions`를 생략하고 `runPipeline(input)`을 호출하는 시나리오
- When: 내부적으로 `research()`/`challenge()`/`verify()`가 호출되는 시점을 계측한다
- Then: 세 함수 모두 `runPipeline()` 내부에서 계산된 동일한 provider 인스턴스를 3번째(또는 해당) 인자로 전달받는다(동일 인스턴스인지 참조 동등성으로 확인하는 단위 테스트).

**AC-RESEARCH-011a** (REQ-RESEARCH-012, 필수 경로)
- Given: `LLM_PROVIDER_MODE`가 설정되지 않고 `GEMINI_API_KEY`도 없는 환경변수 소스
- When: `validateEnv("app", source)`를 호출한다
- Then: `EnvValidationError`가 던져지고, `missing` 배열에 `"GEMINI_API_KEY"`가 포함된다.

**AC-RESEARCH-011b** (REQ-RESEARCH-012, 면제 경로)
- Given: `LLM_PROVIDER_MODE = "deterministic"`이고 `GEMINI_API_KEY`는 없는 환경변수 소스(그 외 app 스코프 필수값은 모두 존재)
- When: `validateEnv("app", source)`를 호출한다
- Then: 예외 없이 정상적으로 `ValidatedEnv`를 반환한다(E2E가 띄우는 앱 서버의 기동 시나리오를 재현).

**AC-RESEARCH-012** (REQ-RESEARCH-013)
- Given: 유효한 Zod 스키마와 결정론적 provider가 그 스키마를 satisfy하는 응답을 생성하도록 설정된 상황
- When: `provider.generateStructured({ prompt, schema })`를 호출한다
- Then: 반환값이 `{ ok: true, data: T }` 형태이며 `data`가 `schema.parse()`를 재적용해도 오류 없이 통과한다.

**AC-RESEARCH-013** (REQ-RESEARCH-014)
- Given: 스키마 검증에 실패하도록 조작된 원시 텍스트(JSON 파싱은 성공하지만 필수 필드가 누락된 값)를 반환하는 fake provider
- When: `provider.generateStructured({ prompt, schema })`를 호출한다
- Then: 반환값이 `{ ok: false, reason: "schema_validation_failed", raw: <원본 텍스트> }`이며, 호출부(Researcher)는 이 경우 예외를 던지지 않고 해당 finding을 판단불충분으로 처리한다(단위 테스트로 양쪽 모두 확인).

**AC-RESEARCH-014** (REQ-RESEARCH-016)
- Given: 2개의 evidence만 전달된 상황에서 실행되는 `research(queries, evidenceMap, provider)`
- When: 반환된 `DraftFinding[]`을 검사한다
- Then: 모든 finding의 `supportingEvidenceIds`가 비어 있지 않으며, 그 안의 모든 ID가 전달받은 2개 evidence의 ID 집합의 부분집합이다(전달되지 않은 임의 ID는 하나도 등장하지 않음).

**AC-RESEARCH-015** (REQ-RESEARCH-017)
- Given: 전달된 evidence 집합에 존재하지 않는 evidence ID를 포함한 구조화 응답을 반환하도록 설정된 fake provider
- When: `research()`를 호출한다
- Then: `buildFindingSchema()`의 `.refine()` 검증이 실패해 `generateStructured()`가 `{ ok: false, reason: "schema_validation_failed" }`를 반환하고, 해당 finding이 최종 결과에 위조된 ID를 포함한 채로 나타나지 않는다.

**AC-RESEARCH-016** (REQ-RESEARCH-018)
- Given: 특정 요양급여내역상 기왕증을 시사하는 `incidentDescription`을 가진 사건에 대해 생성된 `DraftFinding[]`
- When: `challenge(findings, provider)`를 호출한다
- Then: 반환된 `Challenge[]`의 `counterArgument` 문자열 중 최소 1건이 finding의 `summary`와 다른 텍스트이며(단순 재진술이 아님을 문자열 비교로 확인), 반론이 다루는 화제 키워드(기왕증/퇴행성/인과관계/약관/자료부족/사고이전 6종 중 하나)가 포함된다.

**AC-RESEARCH-017** (REQ-RESEARCH-019)
- Given: 하나는 evidence로 뒷받침되고 하나는 evidence 없이 생성된 두 개의 `DraftFinding`
- When: `verify(findings, challenges, evidenceMap, provider)`를 호출한다
- Then: evidence로 뒷받침된 claim은 `status: "VERIFIED"`, 뒷받침되지 않는 claim은 `status: "INSUFFICIENT"`로 반환된다.

**AC-RESEARCH-018** (REQ-RESEARCH-020)
- Given: `finding.supportingEvidenceIds`에 존재하지 않는 evidence ID가 섞여 있는 입력
- When: `verify()`를 호출한다
- Then: 반환된 `VerifiedClaim.supportingEvidenceIds`에서 위조된 ID가 제거되어 있고, 제거 후 빈 배열이 되면 `status`가 `"INSUFFICIENT"`로 설정되며 해당 사유가 `uncertainty` 배열에 기록된다.

**AC-RESEARCH-019** (REQ-RESEARCH-021)
- Given: 임의의 `finding`/`challenge` 입력 집합
- When: `verify()`의 출력 전체(`VerifiedClaim[]` + `uncertainty`)를 검사한다
- Then: 숫자 뒤에 "%" 또는 "확률"이 붙는 패턴이 어떤 문자열 필드에도 등장하지 않는다(정규식 기반 단위 테스트).

**AC-RESEARCH-020** (REQ-RESEARCH-022)
- Given: EvidenceRetriever가 실제로 반환한 evidence 집합에 없는 evidence ID `"fake-id-999"`를 finding에 강제로 주입한 시나리오
- When: 파이프라인 전체(`research` → `verify`)를 실행한다
- Then: `"fake-id-999"`가 1차 방어선(structured validation) 또는 2차 방어선(Verifier) 중 최소 하나에서 차단되어 최종 `ResearchReport`의 어떤 `supportingEvidenceIds`에도 등장하지 않는다(end-to-end 단위/통합 테스트로 확인).

**AC-RESEARCH-021** (REQ-RESEARCH-023)
- Given: `runPipeline()`이 반환한 임의의 `ResearchReport`
- When: 반환값의 타입과 키를 검사한다
- Then: `caseSummary`/`reviewTargets`/`verifiedClaims`/`missingMaterials`/`uncertainty`/`generatedAt` 6개 키가 모두 존재하며, TypeScript 컴파일이 이 구조에 대해 오류 없이 통과한다.

**AC-RESEARCH-022** (REQ-RESEARCH-024)
- Given: `sourceUrl`이 존재하는 evidence를 근거로 갖는 `VerifiedClaim`을 포함한 리포트를 렌더링하는 사건 상세 화면
- When: 페이지를 렌더링한다
- Then: 해당 evidence의 `title`과 `sourceUrl`이 모두 DOM에 나타나며, `sourceUrl`이 `null`인 evidence는 출처 표시 없이 title만 나타난다(두 경로 모두 확인).

**AC-RESEARCH-023** (REQ-RESEARCH-025, 정적 게이트)
- Given: 이번 SPEC의 모든 변경이 완료된 워킹 트리
- When: `pnpm test && pnpm lint && pnpm format:check && pnpm build`를 순차 실행한다
- Then: 4개 명령 모두 exit 0으로 종료한다.

**AC-RESEARCH-024** (REQ-RESEARCH-011 + REQ-RESEARCH-025, E2E 게이트)
- Given: `LLM_PROVIDER_MODE=deterministic`이 자동 주입되는 `pnpm test:e2e` 실행 환경
- When: `pnpm test:e2e`를 실행한다
- Then: exit 0으로 종료하고, 실행 로그 어디에도 실제 Gemini API 엔드포인트(`generativelanguage.googleapis.com`)로의 아웃바운드 호출 흔적이 없으며(네트워크 모킹 또는 provider-level 계측으로 확인), 기존 `auth.spec.ts`/`case-flow.spec.ts`/`tenant-isolation.spec.ts` 3개 시나리오가 모두 통과한다.

**AC-RESEARCH-025** (REQ-RESEARCH-025, 전체 6단계 통합)
- Given: 상해후유장해 담보에 해당하는 완전한 `CaseInput` 하나
- When: `runPipeline(input)`을 결정론적 provider로 실행한다
- Then: 6단계가 모두 예외 없이 순차 완료되고, 최종 `ResearchReport`가 §21의 6개 키를 모두 포함하며 `verifiedClaims`가 최소 1건 이상 존재한다(end-to-end 성공 경로 통합 테스트).

## §C. 엣지 케이스

- 모든 `ResearchQuery`에 대해 매칭되는 evidence가 0건인 사건(빈 evidence DB) — Researcher가 예외 없이 전 쿼리를 `INSUFFICIENT`로 처리하고, `missingMaterials`가 채워지는지 확인.
- `generateStructured()`가 JSON 파싱조차 실패하는 완전히 깨진 응답을 반환하는 경우 — `{ ok: false, reason: "invalid_json" }` 분기가 예외를 던지지 않고 안전하게 처리되는지 확인.
- Gemini 429 응답이 `generateStructured()` 호출 중 발생하는 경우 — 기존 `generate()`의 지수 백오프 재시도가 동일하게 적용되는지 확인.
- `NormalizedCase`가 상해/질병 두 도메인 중 한쪽 정보만 강하게 시사하는 사건(예: `diagnosisName`이 명확하지 않은 순수 외상 사건) — QueryPlanner가 두 도메인 모두에 대해 여전히 최소 쿼리를 생성하는지, 아니면 한쪽만 생성하는지가 REQ-RESEARCH-002 범위 내에서 명확히 테스트로 고정되어 있는지 확인.

## §D. REQ ↔ AC 커버리지 매트릭스

| REQ | AC |
|---|---|
| REQ-RESEARCH-001 | AC-RESEARCH-001 |
| REQ-RESEARCH-002 | AC-RESEARCH-002 |
| REQ-RESEARCH-003 | AC-RESEARCH-003 |
| REQ-RESEARCH-004 | AC-RESEARCH-004 |
| REQ-RESEARCH-005 | AC-RESEARCH-005 |
| REQ-RESEARCH-006 | AC-RESEARCH-006 |
| REQ-RESEARCH-007 | AC-RESEARCH-007 |
| REQ-RESEARCH-008 | AC-RESEARCH-008 |
| REQ-RESEARCH-009 | AC-RESEARCH-009 |
| REQ-RESEARCH-010 | AC-RESEARCH-010 |
| REQ-RESEARCH-012 | AC-RESEARCH-011a, AC-RESEARCH-011b |
| REQ-RESEARCH-013 | AC-RESEARCH-012 |
| REQ-RESEARCH-014 | AC-RESEARCH-013 |
| REQ-RESEARCH-016 | AC-RESEARCH-014 |
| REQ-RESEARCH-017 | AC-RESEARCH-015 |
| REQ-RESEARCH-018 | AC-RESEARCH-016 |
| REQ-RESEARCH-019 | AC-RESEARCH-017 |
| REQ-RESEARCH-020 | AC-RESEARCH-018 |
| REQ-RESEARCH-021 | AC-RESEARCH-019 |
| REQ-RESEARCH-022 | AC-RESEARCH-020 |
| REQ-RESEARCH-023 | AC-RESEARCH-021 |
| REQ-RESEARCH-024 | AC-RESEARCH-022 |
| REQ-RESEARCH-025 | AC-RESEARCH-023, AC-RESEARCH-024, AC-RESEARCH-025 |
| REQ-RESEARCH-011 | AC-RESEARCH-024 |

REQ-RESEARCH-009와 REQ-RESEARCH-015(둘 다 Gemini SDK confinement 계열)는 AC-RESEARCH-009 하나로 함께 검증된다 — 두 REQ가 "파이프라인 단계 모듈 밖에서 Gemini SDK 세부사항을 다루지 않는다"는 동일한 경계를 서로 다른 각도(REQ-009: import 자체 금지, REQ-015: JSON/schema 타입 노출 금지)에서 진술하기 때문이며, 기존 `lib/pipeline-gemini-boundary.test.ts`의 문자열 grep 검사가 두 조건 모두를 동시에 충족한다.

## §E. Definition of Done

- [ ] §D의 25개 REQ 전부가 최소 1개의 AC로 커버됨
- [ ] `pnpm test` — 신규/수정된 모든 단위 테스트 포함 100% 통과
- [ ] `pnpm lint` / `pnpm format:check` — 신규 경고 0건 (기존 베이스라인 대비)
- [ ] `pnpm build` — TypeScript strict 모드 컴파일 오류 0건
- [ ] `pnpm test:e2e` — `LLM_PROVIDER_MODE=deterministic` 자동 주입 상태로 exit 0, 실제 Gemini 호출 0건
- [ ] `lib/pipeline/boundary.test.ts`, `lib/pipeline-gemini-boundary.test.ts` 무수정 상태로 통과
- [ ] `app/cases/[caseId]/page.tsx`의 하드코딩 플레이스홀더("추가 확보 자료 식별은... 후속 SPEC에서 지원할 예정") 문구가 실제 데이터 렌더링으로 교체됨
- [ ] `.moai/specs/SPEC-RESEARCH-001/progress.md` §E.1이 `plan_status: audit-ready`로 기록됨

## §F. 품질 게이트 기준

- **TRUST 5 — Tested**: 신규/재작성 파일(researcher.ts, skeptic.ts, verifier.ts, evidence-retriever.ts, query-planner.ts, gemini.ts, deterministic.ts, provider-factory.ts)에 대한 단위 테스트 커버리지 85% 이상.
- **TRUST 5 — Secured**: Gemini 응답의 JSON 파싱 실패/스키마 검증 실패가 항상 안전하게 처리되어 예외가 파이프라인 밖으로 누출되지 않음(AC-RESEARCH-013).
- **TRUST 5 — Trackable**: 이번 SPEC의 모든 커밋 메시지가 `feat(SPEC-RESEARCH-001): M{N} ...` Conventional Commits 형식을 따름.
