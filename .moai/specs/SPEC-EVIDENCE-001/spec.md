---
id: SPEC-EVIDENCE-001
title: "근거자료(evidence) corpus 확장 + Retriever 쟁점 중심 ranking + counterEvidenceIds=[] 원인 진단"
version: "0.1.0"
status: draft
created: 2026-08-28
updated: 2026-08-28
author: Nexsol
priority: P1
phase: "v0.8.0 target"
module: "db/seed/, lib/db/schema.ts, lib/pipeline/evidence-retriever.ts, lib/pipeline/query-planner.ts"
lifecycle: spec-anchored
tags: "evidence, retriever, corpus, benchmark, ranking, diagnostic, drizzle-migration"
tier: L
depends_on: [SPEC-RESEARCH-001, SPEC-GEMINI-RUNTIME-001]
---

## HISTORY

- 2026-08-28: 최초 작성 (Nexsol) — 실 Gemini smoke 2회(`.moai/reports/gemini-smoke-20260827.md`, `.moai/reports/gemini-smoke-20260828.md` 상당의 `gemini-runtime-smoke-20260828.md`)에서 `Skeptic.counterEvidenceIds`가 두 번 모두 전부 빈 배열(`[0,0,0]`)로 관측된 사실을 계기로 착수. `.moai/specs/SPEC-GEMINI-RUNTIME-001/spec.md`가 `SPEC-EVIDENCE-001`을 forward-reference했던 미해결 참조(plan-auditor Cycle 4 non-blocking 관찰 D7-5)를 이 SPEC이 실체화한다. 근거: 현행 코드베이스 실측(`db/seed/evidence.json`, `lib/db/schema.ts`, `scripts/db-seed.ts`, `lib/pipeline/{query-planner,evidence-retriever,researcher,skeptic,verifier,types}.ts`) + 두 smoke 리포트의 실측 관찰.

## §0. 이 SPEC이 다루지 않는 것 — 먼저 밝힘

이 SPEC의 목표는 **"더 많은 데이터를 넣는다"가 아니다**. 두 개의 독립적 목표를 다룬다: (1) 상해후유장해/질병후유장해 두 담보의 실제 핵심 쟁점(issueType)별 coverage를 검증 가능하게 만드는 corpus 확장, (2) `counterEvidenceIds=[]` 현상의 원인이 corpus 부족/Retriever 후보 탈락/Skeptic 선택 미채택 중 어디에 가까운지 **테스트로 구분 가능하게** 만드는 진단 장치. "모든 사건에서 counterEvidenceIds가 최소 1개 나와야 한다"는 이 SPEC의 acceptance가 아니다 — 실제로 반박 근거가 없는 사건에서는 빈 배열이 정상일 수 있다(§2 REQ-EVIDENCE-015 참고).

## §1. 개요 (Overview)

### WHY — 배경 및 동기

현재 production evidence corpus는 약 10건(`db/seed/evidence.json`)이며, `EvidenceRetriever`(`lib/pipeline/evidence-retriever.ts`)는 `category`(담보 도메인 라벨 문자열) 일치 + `title`/`content` 키워드 substring 매칭만으로 관련성을 판정한다 — `ResearchQuery.issueType`(예: `CAUSATION`, `DISABILITY_GRADE_CRITERIA`)은 쿼리 쪽에만 존재하고 evidence 쪽에는 대응 필드가 없어, 실제로는 "쟁점"이 아니라 "키워드 우연 일치"로 검색이 이루어진다. 두 번의 실 Gemini smoke에서 `counterEvidenceIds`가 매번 빈 배열이었다는 사실은(`gemini-smoke-20260827.md` §핵심 발견) 실측이지만, 그 원인이 corpus 부족인지, Retriever가 후보를 top-5 밖으로 떨어뜨리는지, 아니면 Skeptic이 실제로 전달받고도 선택하지 않는지 현재는 구분할 방법이 없다.

### WHAT — 이번 SPEC 범위

- **Corpus 확장**: 두 담보(상해후유장해/질병후유장해) × 핵심 issueType coverage matrix를 먼저 정의하고, 그 matrix가 요구하는 만큼만 실제 검증 가능한 공개 출처(대법원/법원 판례, 국가법령정보센터 법령, 금융감독원 분쟁조정·공개자료, 표준약관·장해분류표 등)로 production evidence를 확장한다(목표 약 50~100건 — 임의 균등배분이 아니라 coverage matrix가 배분을 결정). PRECEDENT/STATUTE/DISPUTE_CASE/POLICY로 분류되는 레코드는 실제로 검증 가능한 공개 출처만 허용하며, 사건번호·결정번호·법령 조문·`sourceUrl`을 지어내지 않는다. 합성(synthetic) evidence는 production seed에 넣지 않는다 — 합성 데이터는 테스트 fixture 전용이다.
- **Evidence metadata 최소 확장**: Retriever 품질 개선에 실제로 필요하다고 입증되는 최소 metadata만 스키마에 추가한다(§2 REQ-EVIDENCE-005~007). `claimant`/`insurer` stance 같은 주관적 라벨은 이번 SPEC에서 도입하지 않는다(§4 Out of Scope).
- **Retriever 쟁점 중심 ranking**: vector DB/embedding/Elasticsearch 없이, 현재 DB + TypeScript 규칙 기반 구조 위에서 issueType 일치를 1급 ranking signal로 추가해, 단순 키워드 하나 우연 일치만으로 상위에 오르는 현 구조를 개선한다. query당 top-K는 5를 기준으로 연구하고, 조정 시 벤치마크 결과를 근거로 삼는다.
- **Curated retrieval benchmark 신설**: 두 담보의 대표 issueType(CAUSATION/DISABILITY_GRADE_CRITERIA/DIAGNOSIS/DISABILITY_LOCATION/기왕증 등)별로, known-relevant evidence ID 집합을 수작업으로 정의한 고정 벤치마크를 만들고, baseline을 먼저 측정한 뒤 현실적인 acceptance threshold를 정의한다.
- **counterEvidenceIds=[] 원인 진단 장치**: 고정 synthetic/de-identified benchmark 사건을 통해 ResearchQuery → Retriever 후보 → Skeptic에게 실제 전달된 evidence → `supportingEvidenceIds`/`counterEvidenceIds`를 테스트 수준에서 관측 가능하게 만들어, "(A) corpus 자체에 반박 가능한 evidence가 없음 / (B) corpus에는 있으나 Retriever top-K에서 탈락 / (C) Skeptic에게 전달됐지만 선택되지 않음" 세 경우를 최소한 구분 가능하게 한다.

이번 SPEC은 vector DB, embeddings, Elasticsearch/OpenSearch, 외부 검색 API 기반 실시간 RAG, crawler/자동 웹 스크래핑, 별도 microservice, Redis/BullMQ, LLM 기반 ingestion pipeline, 관리자 CMS, 수천/수만 건 규모 corpus, 상해후유장해/질병후유장해 외 담보 확장을 다루지 않는다(§4).

### 핵심 판단 근거 — Tier L

DB 스키마 변경(Drizzle migration) + Retriever 알고리즘 재설계 + 신규 benchmark 인프라 + 신규 diagnostic fixture + corpus 재구성이 `db/seed/evidence.json`, `lib/db/schema.ts`, `scripts/db-seed.ts`, `lib/pipeline/{query-planner,evidence-retriever}.ts`와 그 테스트, 신규 benchmark/diagnostic 파일들에 걸쳐 있어 15개 파일을 넘어선다. 단일 서브시스템 리팩터링을 넘어 "evidence record가 issueType 정보를 갖는다"는 신규 데이터 모델 결정과 "쟁점 중심 ranking"이라는 신규 알고리즘 결정 2가지가 신설되므로 Tier L로 분류한다.

## §2. 요구사항 (Requirements — GEARS 표기법)

**용어 구분**: "production evidence"는 `db/seed/evidence.json` → `pnpm db:seed`로 적재되는 실제 서비스용 데이터를 가리키며, "benchmark/diagnostic fixture"는 테스트 전용 합성 데이터를 가리킨다 — 이 SPEC 전체에서 이 둘을 절대 혼용하지 않는다(REQ-EVIDENCE-003).

### A. Corpus 확장과 진위성 (Authenticity)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-EVIDENCE-001 | Ubiquitous | run-phase 착수 전, 두 담보(`INJURY_DISABILITY`/`DISEASE_DISABILITY`) × 8개 `QueryIssueType`(`lib/pipeline/types.ts`)를 축으로 하는 evidence coverage matrix를 문서화해야 하며, corpus 확장 개수는 이 matrix가 식별한 공백을 근거로 배분해야 한다 — evidenceType(PRECEDENT/STATUTE/DISPUTE_CASE/POLICY/OTHER)별 목표 건수를 임의 균등배분해서는 안 된다. | 사용자 지시 §1, §11 |
| REQ-EVIDENCE-002 | Ubiquitous + Unwanted | `evidenceType`이 `PRECEDENT`/`STATUTE`/`DISPUTE_CASE`/`POLICY`로 분류되는 production evidence record는 실제로 검증 가능한 공개 출처(대법원/법원 판례, 국가법령정보센터, 금융감독원 분쟁조정·공개자료, 표준약관·장해분류표, 기타 신뢰 가능한 공공기관 자료)만 허용하며, 사건번호·결정번호·법령 조문·`sourceUrl`을 지어내서는 안 된다. 검증 가능한 특정 자료로 뒷받침할 수 없는 일반적 설명은 `evidenceType: "OTHER"`로만 분류하거나 production corpus에 포함하지 않아야 한다. | 사용자 지시 §1 |
| REQ-EVIDENCE-003 | Ubiquitous + Unwanted | 합성(synthetic) 또는 사실관계를 각색한 evidence record는 `db/seed/evidence.json`(production seed)에 추가해서는 안 된다 — 합성 데이터는 §D의 benchmark/diagnostic fixture 전용이며 물리적으로 다른 파일(§3 참고)에 있어야 한다. | 사용자 지시 §1, §5 |
| REQ-EVIDENCE-004 | Ubiquitous | production evidence corpus 확장 이후에도 `pnpm db:seed`는 기존 10건을 포함해 모든 레코드에 대해 멱등(idempotent)해야 한다 — 재실행 시 행 수가 변하지 않고 `id` 기준 upsert가 유지되어야 한다(`scripts/db-seed.ts`의 기존 `onConflictDoUpdate` 계약 보존). | 사용자 지시 §9, 기존 REQ-RUNTIME-005 계약 |

### B. Evidence Metadata 최소 확장

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-EVIDENCE-005 | Ubiquitous | evidence 스키마(`lib/db/schema.ts` `evidence` 테이블)에 추가하는 모든 신규 컬럼은 Retriever ranking(§C) 또는 benchmark 채점(§D)에 실제로 소비되어야 한다 — 소비하는 코드 경로가 없는 컬럼을 "향후를 위해" 추가해서는 안 된다. | 사용자 지시 §2 |
| REQ-EVIDENCE-006 | Where(capability gate) | 신규 컬럼이 issueType 관련성을 표현해야 하는 경우, `QueryIssueType`(`lib/pipeline/types.ts`)과 동일한 8개 값의 부분집합을 갖는 배열 필드(예: `issueTypes: QueryIssueType[]`)로 표현해야 하며, evidence 자신의 담보-쟁점 분류이지 특정 사건에 대한 판정이 아니어야 한다. | 사용자 지시 §2, §3 |
| REQ-EVIDENCE-007 | Unwanted | 이번 SPEC은 evidence record에 `claimant`/`insurer` 관점(stance) 라벨이나, 판례·법령 전체를 보험사측/청구인측으로 분류하는 필드를 도입해서는 안 된다. "이 evidence record가 표현하는 proposition" 수준의 argument-role 표현이 필요한지는 research.md에서만 검토하고, 근거 없이 스키마를 확장하지 않는다. | 사용자 지시 §2 |

### C. Retriever 쟁점 중심 Ranking

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-EVIDENCE-008 | Ubiquitous | `retrieveEvidence()`(`lib/pipeline/evidence-retriever.ts`)의 관련성 판정 술어(relevant predicate)는 현행 "DOMAIN_SPECIFIC=domain 일치 AND keyword>=1 / UNIVERSAL=keyword>=1" 구조를 보존하되, 정렬용 score 계산에 issueType 일치(exact 또는 호환 가능한 관계)를 키워드 우연 일치보다 우선하는 signal로 추가해야 한다. | 사용자 지시 §3 |
| REQ-EVIDENCE-009 | Ubiquitous + Unwanted | ranking 변경 이후에도, 무관한 evidence가 단 하나의 우연한 키워드 일치만으로 실제 관련 있는 evidence보다 상위에 오르는 회귀가 없어야 한다(§D 벤치마크로 검증). | 사용자 지시 §10 |
| REQ-EVIDENCE-010 | Ubiquitous + Unwanted | query당 반환 개수(top-K, 현재 5)를 이번 SPEC에서 근거 없이 늘려서는 안 된다 — 조정하려면 §D 벤치마크의 baseline 대비 개선 측정 결과를 근거로 명시해야 한다. | 사용자 지시 §3 |
| REQ-EVIDENCE-011 | Ubiquitous | 동일 입력(evidence corpus 스냅샷 + query 집합)에 대해 `retrieveEvidence()`의 결과는 결정론적(같은 순서)이어야 한다 — score 동점 시 tie-break 규칙(예: `id` 오름차순)을 명시해야 한다. | 사용자 지시 §10 |

### D. Curated Retrieval Benchmark

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-EVIDENCE-012 | Ubiquitous | 저장소에 두 담보의 대표 issueType(최소 CAUSATION/DISABILITY_GRADE_CRITERIA/DIAGNOSIS/DISABILITY_LOCATION + 기왕증·퇴행성 관련 1건)을 포괄하는 고정 retrieval benchmark 케이스 집합을 두어야 하며, 각 케이스는 "이 query에서 검색돼야 하는 known-relevant evidence ID 집합"을 수작업으로 정의한 ground truth를 가져야 한다. | 사용자 지시 §4 |
| REQ-EVIDENCE-013 | Ubiquitous + Unwanted | benchmark의 ground truth가 참조하는 evidence ID는 §A 요건을 만족하는 실제 production evidence corpus의 부분집합이어야 하며, benchmark 전용으로 새로 지어낸 evidence를 참조해서는 안 된다. | 사용자 지시 §4 |
| REQ-EVIDENCE-014 | Ubiquitous | run-phase는 이 benchmark에서 baseline(현행 Retriever) 지표를 먼저 측정·기록한 뒤, ranking 개선(§C) 적용 후 지표를 재측정해 비교해야 한다 — 임의의 숫자 목표를 먼저 정하지 않고, 측정된 baseline을 근거로 현실적인 acceptance threshold를 정의해야 한다. 지표는 이 규모(수십~백여 건)의 curated corpus에 의미 있는 것(예: Recall@5 또는 Hit@5)을 연구해 결정해야 한다. | 사용자 지시 §4 |

### E. counterEvidenceIds=[] 원인 진단

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-EVIDENCE-015 | Unwanted | 어떤 코드·테스트·문서도 "모든 사건에서 `counterEvidenceIds`가 최소 1개 나와야 한다"를 acceptance로 강제해서는 안 된다 — 반박 근거가 실제로 없는 사건에서는 빈 배열이 정상일 수 있다. | 사용자 지시 §5 |
| REQ-EVIDENCE-016 | Ubiquitous | 최소 1개의 고정 diagnostic fixture 사건에서, `ResearchQuery` → `EvidenceRetriever`가 제공한 evidence ID → Skeptic에게 실제 전달된 evidence ID → `Challenge.supportingEvidenceIds` → `Challenge.counterEvidenceIds`의 각 단계 값을 테스트에서 관측 가능해야 하며, known counter-relevant evidence가 corpus에 존재하고 benchmark query에 relevant로 정의된 fixture에서는 Retriever가 그 evidence를 candidate로 제공하는지를 최소한 (A) corpus 자체에 없음 / (B) corpus에는 있으나 top-K 탈락 / (C) Skeptic에 전달됐지만 미선택, 세 경우를 구분 가능한 방식으로 검증해야 한다. | 사용자 지시 §5 |

### F. Evidence 품질 규율

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-EVIDENCE-017 | Ubiquitous | production evidence record는 가능한 경우 출처 URL, source identifier(사건번호/결정번호/법령 조문 번호 등), evidenceType, 과장하지 않은 요약(content)을 보유해야 하며, 판례의 결론을 보험금 지급 확정처럼 서술하거나 판례의 사실관계·법리를 현재 사건에 자동 적용된다고 서술해서는 안 된다. | 사용자 지시 §6 |
| REQ-EVIDENCE-018 | Ubiquitous + Unwanted | 하나의 source에서 여러 proposition을 별도 record로 나누는 것은 각 proposition이 서로 다른 issueType/쟁점에 대응할 때만 허용하며, 동일 proposition의 중복 record를 만들어서는 안 된다. | 사용자 지시 §6 |

### G. 기존 pipeline 계약 보존 (회귀 방지)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-EVIDENCE-019 | Ubiquitous + Unwanted | 이번 SPEC의 어떤 변경도 사건당 논리적 `generateStructured()` 호출 수(Researcher=1, Skeptic=1, Verifier=1, 총 3)를 늘려서는 안 된다 — evidence candidate 개수나 metadata 확장이 프롬프트 배치 호출 횟수에 영향을 주지 않아야 한다(SPEC-GEMINI-RUNTIME-001 REQ-GEMINI-RUNTIME-019 계약 보존). | 사용자 지시 §3, §7 |
| REQ-EVIDENCE-020 | Ubiquitous + Unwanted | 다음 기존 계약은 변경되지 않아야 한다: query별 evidence isolation(다른 query/finding에 전달된 evidence ID 인용 금지), Researcher `supportingEvidenceIds.length >= 1` 그라운딩, 위조(forged) evidence ID 차단(Verifier 조용히 제거), semantic Verifier fail-closed, `findSafetyViolations()` 3개소 적용, `pnpm test:e2e`의 결정론적 provider 경로, 프로세스 로컬 Gemini 동시성 락(`pipelineChain`)/`RateScheduler`, 실제 Gemini model/env 계약(`GEMINI_RESEARCH_MODEL`/`GEMINI_FAST_MODEL`/`GEMINI_*_RPM_BUDGET`). | 사용자 지시 §7 |

### H. DB/Schema 변경

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-EVIDENCE-021 | Ubiquitous | §B의 신규 컬럼은 Drizzle migration(`drizzle-kit generate` + 결과 SQL 커밋)으로 추가해야 하며, 기존 `evidence` 테이블의 컬럼(`id`/`category`/`evidenceType`/`scope`/`title`/`content`/`sourceUrl`/`createdAt`)과 기존 seed 재실행/idempotency 계약(REQ-EVIDENCE-004)을 깨서는 안 된다. | 사용자 지시 §9 |

## §3. 산출물 (Artifacts)

- `db/seed/evidence.json` — coverage matrix 기반 확장(§A)
- `db/seed/evidence-benchmark-fixtures.*`(신규, 파일명은 run-phase에서 확정) — synthetic/de-identified benchmark·diagnostic 전용, production seed와 물리적으로 분리(REQ-EVIDENCE-003)
- `lib/db/schema.ts` — evidence 테이블에 §B 신규 컬럼 추가
- `drizzle/` 신규 migration 파일
- `lib/pipeline/evidence-retriever.ts` — 쟁점 중심 ranking(§C)
- 신규 retrieval benchmark 테스트/스크립트(§D)
- 신규 diagnostic fixture 테스트(§E)
- `.moai/docs/` 또는 `.moai/reports/`에 coverage matrix + benchmark baseline/개선 측정 기록

## §4. 제외 범위 (Out of Scope)

### Out of Scope — 검색 인프라

vector DB, embeddings, Elasticsearch/OpenSearch, 외부 검색 API 기반 실시간 RAG를 도입하지 않는다. 현재 DB + TypeScript 규칙 기반 구조 위에서만 개선한다(design.md §2/§6).

### Out of Scope — 데이터 수집 자동화

crawler·자동 웹 스크래핑 시스템, LLM 기반 ingestion pipeline을 만들지 않는다 — corpus 큐레이션은 사람(또는 run-phase 에이전트의 개별 WebFetch)이 개별 검토하는 수작업 절차다(design.md §5).

### Out of Scope — 인프라/운영 확장

별도 microservice, Redis/BullMQ, 관리자 CMS를 신설하지 않는다 — 모든 변경은 기존 Next.js monorepo의 `lib/pipeline/`, `lib/db/` 안에 머문다.

### Out of Scope — corpus 규모/담보 확장

수천/수만 건 규모의 corpus를 만들지 않는다(목표는 약 50~100건, §A). 상해후유장해/질병후유장해 두 담보 외 다른 보험 담보로 확장하지 않는다.

### Out of Scope — 주관적 metadata

`claimant`/`insurer` stance 라벨이나 판례·법령을 보험사측/청구인측으로 분류하는 스키마를 도입하지 않는다(REQ-EVIDENCE-007).

## §5. 잔여 위험 (Residual Risks)

- **corpus 확장 규모의 실현 가능성**: plan-phase는 coverage matrix 프레임워크를 정의하지만, 실제 50~100건의 검증 가능한 공개 출처 수집은 run-phase 실행 시점의 웹 접근 도구 가용성에 의존한다 — plan-phase 시점에는 이 SPEC 저자가 WebSearch/WebFetch에 접근하지 못했다(research.md §0 명시). run-phase 착수 전 이 가용성을 재확인해야 한다.
- **counterEvidenceIds=[] 원인이 여전히 미확정으로 남을 가능성**: §E의 진단 장치는 A/B/C 세 경우를 "구분 가능하게" 만들 뿐, 반드시 하나의 원인으로 확정짓는다고 보장하지 않는다 — model behavior(D)가 실제 원인이라면 이 SPEC의 corpus/Retriever 개선만으로는 여전히 빈 배열이 재현될 수 있다.
- **issueType ranking의 부작용**: score 함수에 issueType 가중치를 추가하면 기존 키워드-only 벤치마크(있다면)의 순위가 바뀔 수 있다 — REQ-EVIDENCE-009의 회귀 벤치마크로 완화한다.
