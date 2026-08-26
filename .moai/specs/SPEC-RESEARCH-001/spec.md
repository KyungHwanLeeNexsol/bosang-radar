---
id: SPEC-RESEARCH-001
title: "보상레이더 6단계 리서치 파이프라인 evidence-first Gemini 전환"
version: "0.3.0"
status: in-progress
created: 2026-08-26
updated: 2026-08-26
author: Nexsol
priority: P1
phase: "v0.6.0 target"
module: "lib/pipeline/, lib/ai/, db/"
lifecycle: spec-anchored
tags: "research-pipeline, gemini, structured-output, evidence-retrieval, zod, drizzle"
tier: L
depends_on: [SPEC-SCAFFOLD-001, SPEC-RUNTIME-001]
---

## HISTORY

- 2026-08-26: 최초 작성 (Nexsol) — SPEC-SCAFFOLD-001(completed)이 구축한 6단계 mock 파이프라인 타입 계약과 SPEC-RUNTIME-001(completed)이 활성화한 실제 런타임(DB 연결·시드·env 검증·E2E 하네스) 위에서, 각 단계의 mock/trivial 로직을 실제 evidence-first Gemini 기반 리서치 로직으로 교체한다. 현행 코드베이스 실측(`lib/pipeline/*.ts`, `lib/ai/provider.ts`, `lib/ai/providers/gemini.ts`, `lib/env.ts`, `lib/db/schema.ts`, `lib/validation/case-input.ts`, `app/cases/[caseId]/page.tsx`, `scripts/run-e2e.ts`) 기반으로 작성. 근거: `research.md`.
- 2026-08-26: 2차 plan revision (Nexsol 지시, 8개 항목) — ① Gemini 구조화 출력을 `responseSchema`가 아닌 `responseJsonSchema` 필드로 전달하도록 전환(응답은 여전히 Zod `safeParse`로 재검증, Gemini 세부사항은 adapter 내부에만 격리); ② `research()`/`challenge()`/`verify()` 세 함수 모두에서 provider를 선택적 기본값에서 필수(required) 인자로 전환 — deterministic provider는 `getLLMProvider()` 팩토리(정상 앱 경로)와 테스트/E2E의 명시적 주입에서만 사용되고, provider 생략은 컴파일 오류가 된다; ③ QueryPlanner의 최소 6-쿼리(2도메인×3issueType) 설계를 기준으로 AC-RESEARCH-002의 Then-절을 정합(4issueType×2도메인=8 요구와의 모순 해소); ④ CaseNormalizer의 담보 스코프 검증 책임을 제거하고, MVP 담보 제한을 QueryPlanner의 `CoverageDomain` 타입(2개 리터럴)이 구조적으로 보장하도록 REQ/AC-RESEARCH-001·002를 재작성; ⑤ Skeptic의 반론에 실제 Retriever evidence(evidenceMap)를 연결하고 `Challenge.supportingEvidenceIds`/`counterEvidenceIds`를 evidence 부분집합으로 강제, Verifier가 Skeptic evidence도 재검증하도록 REQ-RESEARCH-005/006/018/019 및 관련 AC를 확장; ⑥ EvidenceRetriever의 관련성 판정을 "담보 일치 AND 키워드 매칭"으로 강화하고 `scope`(DOMAIN_SPECIFIC|UNIVERSAL) 축을 신설; ⑦ seed 데이터를 4→10개 curated 레코드로 확장하기로 결정(design.md §6). 신규 REQ/AC 없이 기존 REQ/AC의 Then-절·scope 확장으로 8개 항목 전부를 흡수해 Tier L 상한(REQ 25/AC 25)을 유지. 근거: 사용자 지시(2차 plan revision, 8개 항목).
- 2026-08-26: 3차 plan revision (Nexsol 지시, 4개 항목) — ① Verifier의 반환 계약을 `VerificationResult`(`{ verifiedClaims, missingMaterials, uncertainty }`)로 명시화하고 `runPipeline()`이 이 구조체로부터 `ResearchReport`를 조립하도록 design.md §3/§8을 갱신(REQ-RESEARCH-019 확장); ② Skeptic이 제시한 evidence 연결이 최종 리포트까지 보존되도록 `VerifiedClaim.counterArguments`를 `string[]`에서 `VerifiedCounterArgument[]`(`{ summary, supportingEvidenceIds, counterEvidenceIds }`)로 구조화하고, Verifier의 재검증 통과 evidence ID가 소실되지 않고 보존됨을 REQ-RESEARCH-018/019 및 AC-RESEARCH-017에 반영; ③ plan.md M2/M5에 남아 있던 "researcher/skeptic/verifier 세 파일이 `deterministic.ts`를 직접 import한다"는 낡은(2차 revision 이전 설계를 반영한) 서술을 제거·정정 — 세 파일은 `LLMProvider` 추상화에만 의존하며 provider 선택은 오직 `provider-factory.ts`에서만 이루어진다(2차 revision 항목 2와 정합); ④ `getLLMProvider(env)`가 provider 선택과 `GeminiProvider` 생성 양쪽에 동일한 `env` 파라미터를 사용하도록 design.md §1을 명시(테스트 주입 env가 전역 `process.env`와 조용히 섞이지 않도록 함), 그리고 design.md §6에 프로덕션 curated seed(PRECEDENT/STATUTE/DISPUTE_CASE/POLICY)는 실제 검증 가능한 출처만 사용하고 합성/테스트 전용 레코드는 `db/seed/` 범위 밖의 별도 테스트 픽스처로 분리한다는 소싱 규율을 추가. 신규 REQ/AC 없이 기존 REQ-RESEARCH-018/019 및 AC-RESEARCH-017/018의 Then-절/scope 확장으로 4개 항목 전부를 흡수해 Tier L 상한(REQ 25/AC 25)을 유지. 근거: 사용자 지시(3차 plan revision, 4개 항목).
- 2026-08-26: 4차 plan revision (Nexsol 지시, 3개 항목) — ① Challenge↔DraftFinding 연결 무결성 — `buildChallengeSchema()`에서 `findingId` 필드 제거, `challenge()`가 `finding.queryId`를 코드에서 직접 부여하도록 design.md §7 정정(REQ-RESEARCH-018 AC-RESEARCH-016 Then-절 확장으로 흡수, 신규 REQ/AC 번호 없음). ② evidence 부족/구조화 실패 → INSUFFICIENT 경로 — `verify()`에 `queries` 인자 추가, Verifier의 query↔finding 대조 및 `missingMaterials.relatedIssueType` 산출 로직을 design.md §7에 신설, REQ-RESEARCH-019 Then-절 확장, AC-RESEARCH-019a/019b(011a/011b와 동일한 서브레터 관례) 신규 추가. ③ ResearchReport counterArguments 계약 정합화 — REQ-RESEARCH-023 및 spec.md §1 WHAT 서술에서 counterArguments를 top-level 필드처럼 표현한 오류 정정, verifiedClaims[].counterArguments 중첩 구조와 일치시킴; AC-RESEARCH-021 Then-절에 nested-shape 검사 보강. 신규 REQ/AC 번호 없이 기존 REQ-RESEARCH-018/019/023 및 AC-RESEARCH-016/019/021의 Then-절 확장(+ 019a/019b 서브레터 추가)으로 3개 항목 전부를 흡수해 Tier L 상한(REQ 25/AC 25)을 유지. 근거: 사용자 지시(4차 plan revision, 3개 항목).

## §1. 개요 (Overview)

### WHY — 배경 및 동기

SPEC-SCAFFOLD-001은 6단계 리서치 파이프라인(CaseNormalizer → QueryPlanner → EvidenceRetriever → Researcher → Skeptic → Verifier → ResearchReport)의 **타입 계약 스텁**을 목업 구현으로 만들었고, SPEC-RUNTIME-001은 그 위에서 DB/인증/E2E를 실제로 동작하게 만들었다. 그러나 파이프라인의 핵심 가치 — "AI가 지급 여부를 단정하지 않고, 모든 판단을 evidence와 연결하는 리서치 보조" — 는 아직 증명되지 않았다: QueryPlanner는 사건 내용과 무관하게 항상 고정된 2개 쿼리만 만들고, EvidenceRetriever는 쿼리를 완전히 무시한 채 seed 데이터 전체를 반환하며, Researcher/Skeptic/Verifier는 실제 Gemini를 한 번도 호출하지 않고 `[mock] ...` 문자열만 되돌려준다. `lib/env.ts`는 코드 주석으로 스스로 "GEMINI_API_KEY는 파이프라인이 mock 구현을 유지하는 동안만 요구하지 않는다"고 예고해 두었다 — 이 SPEC이 바로 그 예고가 가리키는 후속 작업이다.

### WHAT — 이번 SPEC 범위

이번 SPEC은 **6단계 파이프라인의 구조와 순차 실행 원칙은 그대로 유지하면서, 각 단계 내부의 mock/trivial 로직만 실제 evidence-first 로직으로 교체**한다. 구체적으로:

- QueryPlanner를 고정 2개 쿼리에서, 장해 부위·진단명·사고 경위 등 8개 검토 쟁점 유형에 기반한 구조화된 쿼리 생성으로 교체하고, `CoverageDomain` 타입(INJURY_DISABILITY|DISEASE_DISABILITY 2개 값만 허용)으로 상해후유장해·질병후유장해 두 담보 영역으로 MVP 범위를 구조적으로 한정한다(CaseNormalizer는 담보 스코프를 판별하지 않는다 — 2차 revision).
- EvidenceRetriever를 `db/seed/evidence.json` 전체 반환에서 Drizzle 기반 DB 조회 + 쿼리별 필터링/스코어링으로 교체하고, evidence 자료 유형(POLICY/PRECEDENT/DISPUTE_CASE/STATUTE/OTHER) 확장을 구조적으로 수용한다.
- Researcher/Skeptic/Verifier가 `createMockLLMProvider()` 기본값 대신 실제 `GeminiProvider`를 애플리케이션 런타임 기본값으로 사용하도록 전환하되, `LLMProvider` 추상화 경계와 Gemini SDK confinement(`lib/ai/providers/gemini.ts` 밖에서 `@google/genai` import 금지)는 그대로 유지한다.
- `LLMProvider`에 Zod 스키마 기반 구조화 출력 검증 메서드를 추가하고, evidence ID 위조를 구조적으로 차단한다.
- `ResearchReport` 타입을 `reviewTargets`/`verifiedClaims`(구조화된 counterArguments 포함)/`missingMaterials`/`uncertainty` 필드로 확장하고, UI에서 evidence title/source를 확인할 수 있게 한다.
- 테스트(Vitest, E2E)는 실제 Gemini API를 호출하지 않고 결정론적 fake/mock provider로 실행되어야 한다.

대규모 판례/약관 수집, Vector DB, 새 담보 영역 확장, 보험금 지급 확률/예상액 계산은 이번 SPEC의 범위가 아니다(§4 참고).

## §2. 요구사항 (Requirements — GEARS 표기법)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-RESEARCH-001 | Ubiquitous | CaseNormalizer는 CaseInput의 incidentDescription·diagnosisName·disabilityBodyPart·incidentDate 4개 필드를 정규화(trim)하여 표준화된 NormalizedCase로 변환해야 한다. | 사용자 지시 §핵심 구현 목표 1, [REF: research.md §1] |
| REQ-RESEARCH-002 | Ubiquitous | QueryPlanner는 고정 2개 쿼리 대신, 장해 부위·진단명·사고 경위·상해질병 관련성·장해 평가 기준 검토·기왕증/퇴행성 가능성·인과관계 쟁점·추가 확인 필요 조건을 포함한 구조화된 검토 쟁점 집합으로부터 ResearchQuery 목록을 생성해야 한다. ResearchQuery.domain(CoverageDomain 타입)은 INJURY_DISABILITY와 DISEASE_DISABILITY 두 값만 허용해야 하며, 이를 통해 이번 SPEC의 담보 영역을 두 도메인으로 구조적으로 제한한다. | 사용자 지시 §핵심 구현 목표 2, product.md §MVP 범위 경계 |
| REQ-RESEARCH-003 | Unwanted | QueryPlanner는 보험금 지급 여부·확률을 확정하는 쿼리나 문구를 생성해서는 안 된다. | product.md §핵심 원칙 1, 사용자 지시 §핵심 구현 목표 2 |
| REQ-RESEARCH-004 | Ubiquitous | EvidenceRetriever는 `db/seed/evidence.json` 전체를 무조건 반환하는 대신, Drizzle ORM을 통해 `evidence` 테이블을 조회해야 한다. | 사용자 지시 §핵심 구현 목표 3, tech.md §Turso/libSQL + Drizzle ORM |
| REQ-RESEARCH-005 | Event-driven | 개별 ResearchQuery가 전달되면, EvidenceRetriever는 해당 쿼리의 담보 영역·키워드와 관련된 evidence만 선택해 반환해야 한다. evidence.scope가 DOMAIN_SPECIFIC인 경우 담보 영역 일치와 키워드 관련성을 모두 만족해야 선택되며(담보 영역 일치만으로는 선택되지 않는다), evidence.scope가 UNIVERSAL인 경우 담보 영역과 무관하게 키워드 관련성만 만족하면 선택된다. | 사용자 지시 §핵심 구현 목표 3 |
| REQ-RESEARCH-006 | Where(capability gate) | Where evidence 레코드가 자료 유형 분류값을 갖는 경우, EvidenceRetriever와 관련 타입은 POLICY/PRECEDENT/DISPUTE_CASE/STATUTE/OTHER 중 하나로 분류된 값을 구조적으로 수용해야 한다. 또한 evidence 레코드는 scope 분류값(DOMAIN_SPECIFIC|UNIVERSAL)을 가져야 하며, EvidenceRetriever는 REQ-RESEARCH-005에 정의된 관련성 판정 규칙에 이 값을 반영해야 한다. | 사용자 지시 §핵심 구현 목표 3 |
| REQ-RESEARCH-007 | Unwanted | 이번 SPEC은 vector DB, 임베딩 기반 검색, 대규모 판례/약관 크롤링·수집 시스템을 도입해서는 안 된다. | tech.md §Turso/libSQL + Drizzle ORM, product.md §핵심 원칙 8 |
| REQ-RESEARCH-008 | Ubiquitous | Researcher, Skeptic, Verifier는 애플리케이션 런타임에서 기본적으로 GeminiProvider를 사용해야 하며, `createMockLLMProvider()`를 기본값으로 사용하는 구조를 제거해야 한다. | 사용자 지시 §핵심 구현 목표 4 |
| REQ-RESEARCH-009 | Unwanted | `lib/pipeline/*.ts` 파이프라인 단계 모듈은 `lib/ai/providers/gemini.ts` 외부에서 `@google/genai`를 직접 import해서는 안 된다. | 사용자 지시 §핵심 구현 목표 4, structure.md §설계 메모, [REF: research.md §8] |
| REQ-RESEARCH-010 | Ubiquitous | 파이프라인 단계는 `lib/ai/provider.ts`의 LLMProvider 추상화에만 의존해야 하며, 오케스트레이터(`runPipeline`)는 단일 지점에서 LLMProvider를 주입받아 Researcher/Skeptic/Verifier에 전달해야 한다. | 사용자 지시 §핵심 구현 목표 4, structure.md §lib/ai/ |
| REQ-RESEARCH-011 | Ubiquitous | 자동화 테스트(Vitest, E2E)는 결정론적(deterministic) fake/mock LLMProvider를 주입해 실행되어야 하며, 실제 Gemini API를 호출해서는 안 된다. | 사용자 지시 §테스트 요구사항, tech.md §비용 태도 |
| REQ-RESEARCH-012 | Where(capability gate) | Where 애플리케이션이 LLM_PROVIDER_MODE를 deterministic으로 설정하지 않은 상태로 app 스코프에서 기동하는 경우, `lib/env.ts`의 app 스코프 환경변수 검증은 GEMINI_API_KEY를 필수 항목으로 요구해야 한다. | 사용자 지시 §핵심 구현 목표 4, SPEC-RUNTIME-001 §5 잔여 위험 |
| REQ-RESEARCH-013 | Ubiquitous | LLMProvider 인터페이스는 Zod 스키마 기반 구조화 출력을 생성하는 `generateStructured()` 메서드(또는 동등한 최소 확장)를 제공해야 한다. | 사용자 지시 §핵심 구현 목표 5 |
| REQ-RESEARCH-014 | When(event-detected) | 구조화 출력 생성 시 잘못된 JSON 또는 Zod 스키마 검증 실패가 감지되면, `generateStructured()` 호출부는 명확한 실패 결과를 반환하거나 안전한 fallback(판단불충분 처리)을 사용해야 한다. | 사용자 지시 §핵심 구현 목표 5 |
| REQ-RESEARCH-015 | Unwanted | 파이프라인 단계 모듈은 `@google/genai`의 JSON/schema 관련 타입이나 호출 세부사항을 `lib/ai/providers/gemini.ts` 밖에서 직접 다루어서는 안 된다. | 사용자 지시 §핵심 구현 목표 5 |
| REQ-RESEARCH-016 | Ubiquitous | Researcher는 EvidenceRetriever가 반환한 evidence만을 근거로 검토 소견 후보를 생성해야 하며, 각 substantive finding은 supportingEvidenceIds로 최소 1개 이상의 evidence와 연결되어야 한다. | 사용자 지시 §핵심 구현 목표 6, product.md §핵심 원칙 2 |
| REQ-RESEARCH-017 | Unwanted | Researcher는 전달받지 않은 판례·약관·규정이나 존재하지 않는 evidence ID를 새로 만들어내서는 안 되며, '보험금 지급 확정', '반드시 지급', 구체적 지급 확률, 근거 없는 구체적 보험금 액수를 표현해서는 안 된다. | 사용자 지시 §핵심 구현 목표 6 |
| REQ-RESEARCH-018 | Ubiquitous | Skeptic은 Researcher의 소견에 대해 기왕증·퇴행성 변화·인과관계 부족·약관상 기준 미충족·자료 부족·사고 이전 증상 등 보험사 관점에서 실제로 제기될 수 있는 반론을 생성해야 하며, EvidenceRetriever가 반환한 evidence(evidenceMap)를 프롬프트에서 함께 참조해 가능한 경우 반론을 evidence와 연결해야 한다. 반론이 evidence ID를 인용하는 경우(supportingEvidenceIds 또는 counterEvidenceIds), 그 ID는 반드시 해당 쿼리에 대해 EvidenceRetriever가 실제로 반환한 evidence 집합의 부분집합이어야 하며, 빈 배열은 허용된다(이 evidence-ID 연결을 Verifier가 최종 리포트까지 구조적으로 보존하는 방식은 REQ-RESEARCH-019가 규정한다). | 사용자 지시 §핵심 구현 목표 7 |
| REQ-RESEARCH-019 | Ubiquitous | Verifier는 Researcher의 claim과 Skeptic이 제시한 evidence ID(supportingEvidenceIds/counterEvidenceIds)를 모두 evidence 대비 재검증해, 최종 리포트에 포함되는 substantive claim과 반론 근거가 실제로 존재하는 evidence ID만을 근거로 갖도록 해야 한다. 재검증을 통과한 반론 근거는 VerifiedClaim.counterArguments에 { summary, supportingEvidenceIds, counterEvidenceIds } 구조(VerifiedCounterArgument)로 보존되어야 하며, 위조된 것으로 판정된 evidence ID만 제거되고 유효한 ID는 소실되지 않아야 한다. Verifier는 이 결과를 verifiedClaims·missingMaterials·uncertainty를 포함하는 VerificationResult로 반환해야 한다. Verifier는 원본 ResearchQuery 목록을 명시적 인자로 전달받아, evidence 부재 또는 Researcher structured validation 실패로 인해 대응하는 DraftFinding이 생성되지 않은 query를 이 목록과 대조해 식별해야 하며, 그런 query마다 relatedIssueType이 해당 ResearchQuery.issueType과 정확히 일치하는 MissingMaterial 항목을 생성하고 그 사유를 uncertainty에 기록해야 한다. | 사용자 지시 §핵심 구현 목표 8, product.md §핵심 원칙 2 |
| REQ-RESEARCH-020 | When(event-detected) | 근거 없는 claim이 감지되면, Verifier는 해당 claim을 제거하거나 판단불충분(INSUFFICIENT) 상태로 명확히 낮춰야 한다. | 사용자 지시 §핵심 구현 목표 8 |
| REQ-RESEARCH-021 | Unwanted | Verifier는 새로운 사실이나 출처를 만들어내거나 숫자 기반 지급 확률을 생성해서는 안 된다. | 사용자 지시 §핵심 구현 목표 8 |
| REQ-RESEARCH-022 | When(event-detected) | 최종 리포트에 포함되려는 evidence ID가 EvidenceRetriever가 실제로 반환한 evidence 집합에 존재하지 않는 것이 감지되면, structured output validation 또는 Verifier가 해당 claim을 리포트에서 차단해야 한다. | 사용자 지시 §핵심 구현 목표 10 |
| REQ-RESEARCH-023 | Ubiquitous | ResearchReport 타입은 최소한 caseSummary, reviewTargets, verifiedClaims, missingMaterials, uncertainty, generatedAt 6개 top-level 필드를 표현할 수 있어야 하며, verifiedClaims의 각 원소는 evidence 연결(supportingEvidenceIds)과 구조화된 counterArguments(VerifiedCounterArgument[] — summary/supportingEvidenceIds/counterEvidenceIds)를 포함해야 한다. | 사용자 지시 §핵심 구현 목표 9, product.md §4 |
| REQ-RESEARCH-024 | Ubiquitous | 사건 상세 화면(`app/cases/[caseId]/page.tsx`)은 리포트에 포함된 evidence의 title과 source(sourceUrl 등)를 사용자가 확인할 수 있도록 표시해야 한다. | 사용자 지시 §핵심 구현 목표 9 |
| REQ-RESEARCH-025 | Ubiquitous | 이 SPEC의 모든 변경 이후에도 `pnpm test`, `pnpm lint`, `pnpm format:check`, `pnpm build`, `pnpm test:e2e`는 계속 통과(exit 0)해야 하며, 기존 authentication·runtime E2E 시나리오는 회귀되지 않아야 한다. | 사용자 지시 §테스트 요구사항, SPEC-RUNTIME-001 REQ-RUNTIME-018 |

REQ 개수: 25개 (Tier L 상한 25개 — 상한에 맞춰 의도적으로 타이트하게 구성).

## §3. 비기능 제약 (Constraints)

- **기존 아키텍처 경계 보존**: 6단계 파이프라인 순차 실행 구조, 파이프라인 단계 모듈 간 형제-import 금지(`lib/pipeline/boundary.test.ts`), Gemini SDK confinement(`lib/pipeline-gemini-boundary.test.ts`)는 그대로 유지한다(SPEC-SCAFFOLD-001 REQ-SCAFFOLD-018, SPEC-RUNTIME-001 REQ-RUNTIME-019).
- **DB 접근 경로**: 애플리케이션 코드는 Drizzle ORM API만 사용하고 libSQL 고유 문법에 직접 의존하지 않는다(structure.md §설계 메모).
- **버전 고정 유지**: `drizzle-orm` 0.45.2, `@libsql/client` 0.17.4, `@google/genai` `2.18.0`(`<3.0.0` 고정), `better-auth` 1.7.1, `zod` 4.4.3, `@next/env`/`next` 16.3.2 — 기존 고정을 변경하지 않는다.
- **신규 런타임 의존성 금지**: zod 4.4.3의 네이티브 `z.toJSONSchema()` 변환 기능으로 Gemini `responseJsonSchema` 요구를 충족할 수 있으므로, 이번 SPEC은 새로운 npm 의존성을 추가하지 않는다.
- **무료 tier 우선 / overengineering 금지**: microservice, Kubernetes, 별도 vector DB를 도입하지 않는다(product.md §핵심 원칙 8).
- **실제 원격 Gemini API 무접근 (테스트)**: 이 SPEC의 어떤 자동 검증(Vitest 단위 테스트, E2E)도 실제 Gemini API를 호출해서는 안 된다 — 결정론적 fake/mock provider만 사용한다.
- **PII 검증 계층 무변경**: `lib/validation/case-input.ts`의 Zod PII 차단 스키마는 이번 SPEC에서 수정하지 않는다.
- **MVP 담보 영역 고정**: 상해후유장해·질병후유장해 두 영역으로 한정하며, 다른 담보 영역으로 확장하지 않는다(product.md §MVP 범위 경계).
- **Node.js/패키지 매니저**: Node.js 20.x LTS 이상, pnpm(tech.md §개발 환경 요구사항) — 기존 고정 유지.

## §4. 제외 범위 (Out of Scope)

이번 SPEC의 out of scope 항목은 다음과 같다 — 아래 항목들은 이번 파이프라인 고도화 SPEC에서 다루지 않으며, `product.md` §Roadmap 및 사용자 지시에 나열된 후속 검토 대상으로 이연한다.

### Out of Scope — 대규모 근거자료 데이터 수집
- 실제 판례·약관 등 대규모 근거자료 크롤링·정제·수집 시스템은 이번 SPEC에서 다루지 않는다. `db/seed/evidence.json`을 이번 SPEC에서 4개 → 10개 curated 레코드로 소규모 확장(2차 revision, design.md §6 seed 확장 결정 참고)한 데이터셋을 대상으로 검색/필터링/스코어링 로직만 구현한다.

### Out of Scope — Vector DB / 임베딩 기반 검색
- Vector DB, Elasticsearch, Pinecone 등 임베딩 기반 검색 인프라 도입은 이번 SPEC에서 다루지 않는다. evidence 검색은 Drizzle ORM 쿼리 + 키워드/카테고리 매칭 기반의 단순하고 테스트 가능한 방식으로 구현한다.

### Out of Scope — 별도 인프라 / 아키텍처 확장
- 별도 Python 서비스, microservices 분리는 이번 SPEC에서 다루지 않는다. 단일 Next.js 애플리케이션 내에서 모든 것을 처리한다.

### Out of Scope — 담보(coverage) 영역 확장
- 상해후유장해·질병후유장해 외 담보 영역(질병사망, 실손의료비 등) 추가는 이번 SPEC에서 다루지 않는다.

### Out of Scope — 보험금 지급 판단 자동화
- 보험금 지급 확률 계산, 보험금 예상액 자동 계산은 이번 SPEC에서 다루지 않는다. Researcher/Skeptic/Verifier는 "검토 필요"/"관련 가능성 있음"/"현재 정보만으로 판단 불충분" 형태의 표현만 사용하며, 지급 여부·확률·구체적 액수를 확정하는 어떤 출력도 생성하지 않는다.

### Out of Scope — 품질 평가 데이터 구조 고도화
- Gold Dataset(실제 지급결과 학습 구조) 도입, 전문가 feedback 데이터 모델 고도화는 이번 SPEC에서 다루지 않는다.

### Out of Scope — UI/UX 전면 개선 및 B2C 기능
- 사건 입력 폼·리포트 뷰의 UI/UX 전면 리디자인은 이번 SPEC에서 다루지 않는다 — evidence title/source 표시(REQ-RESEARCH-024)와 리포트 신규 필드 노출에 필요한 최소한의 마크업 변경만 수행한다. B2C(개인 보험 가입자 대상) 기능은 이번 SPEC의 범위가 아니다.

## §5. 잔여 위험 (Residual Risks)

- **EvidenceRetriever 필터링 임계값의 초기 정확도**: 이번 SPEC에서 4→10개로 확장된(2차 revision, design.md §6) curated seed 데이터셋에서도, 담보 일치 AND 키워드 매칭을 모두 요구하는 강화된 관련성 술어가 실제로 의도한 대로 동작하는지는 소규모 데이터에서만 검증된다 — 실제 evidence 데이터가 더 늘어나면 스코어링 파라미터(가중치, top-N cutoff)와 키워드 사전 재조정이 필요할 수 있다.
- **QueryPlanner의 결정론적(rule-based) 설계 결정**: 이번 SPEC은 QueryPlanner를 LLM 호출 없는 규칙 기반 구조화로 설계한다(design.md §5 참고) — 향후 사건 유형이 다양해지면 규칙 기반으로는 쟁점 도출 품질이 한계에 부딪힐 수 있으며, 그 시점에 LLM 기반 QueryPlanner로 전환하는 후속 SPEC이 필요할 수 있다.
- **Gemini 무료 tier 요청 한도**: 사건 하나당 Researcher/Skeptic/Verifier가 쿼리 개수만큼 여러 번 Gemini를 호출하므로(구조화 쿼리 도입으로 쿼리 개수가 기존 2개에서 늘어날 수 있음), 무료 tier 한도 소진이 이전보다 빨라질 수 있다 — `GeminiProvider`의 기존 429 재시도 로직이 완화하지만, 실사용 중 한도 문제가 확인되면 추가 검토가 필요하다(SPEC-SCAFFOLD-001 §5에서 이미 인지된 위험의 연장).
- **evidence 자료 유형(POLICY/PRECEDENT/DISPUTE_CASE/STATUTE/OTHER) 필드는 검색/스코어링에 여전히 미활용**: 이번 SPEC은 evidenceType 필드를 스키마 수준에서 구조적으로 수용하고 확장된 seed 레코드에 실제 유형을 명시하지만(REQ-RESEARCH-006, design.md §6 seed 확장 결정), 검색/스코어링 로직에는 활용하지 않는다 — 반면 2차 revision에서 신설한 scope(DOMAIN_SPECIFIC|UNIVERSAL) 필드는 관련성 판정에 실제로 사용된다(REQ-RESEARCH-005). evidenceType 기반 검색 고도화는 후속 SPEC 과제로 남는다.

## §6. 참고 문서

- `.moai/project/product.md`, `.moai/project/structure.md`, `.moai/project/tech.md`
- `.moai/specs/SPEC-SCAFFOLD-001/{spec,plan,acceptance,design,research}.md` (선행 SPEC, status: completed)
- `.moai/specs/SPEC-RUNTIME-001/{spec,plan,acceptance,design,research}.md` (선행 SPEC, status: completed)
- 이 SPEC의 `research.md`(현행 코드베이스 실측), `design.md`(신규 타입 계약·구조화 출력·evidence 검색 설계)
