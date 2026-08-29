---
id: SPEC-EVIDENCE-001
title: "근거자료(evidence) corpus 확장 + Retriever 쟁점 중심 ranking + counterEvidenceIds=[] 원인 진단"
version: "0.5.0"
status: draft
created: 2026-08-28
updated: 2026-08-29
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
- 2026-08-28: 외부 독립 리뷰 지적사항 반영(v0.1.0 → v0.2.0, plan-auditor 실행 전 개정 — 5개 설계 blocker + 1개 acceptance 정합성 문제) — **이슈 1**(REQ-EVIDENCE-009): issueType이 ranking에만 쓰이고 candidate eligibility에는 영향을 주지 못해 exact-issueType evidence도 keyword 부재 시 후보 진입 자체가 불가능했던 결함 — 현행 predicate 사전 보존을 철회하고, 전략 A(현행)/B(최소 확장안: `domainMatch && (keyword || issueTypeExactMatch)`)를 §D 벤치마크로 비교해 확정하도록 재설계, hard exclusion filter 사전 도입 금지, 핵심 acceptance(REQ-EVIDENCE-013: exact-issueType-but-no-keyword case 복구 가능성 측정)를 신설. **이슈 2**(REQ-EVIDENCE-016, REQ-EVIDENCE-017): M2(10건 baseline)와 M4(50~100건 확장) 측정이 ranking 효과와 corpus 확장 효과를 혼합하던 결함 — 최종 acceptance threshold는 반드시 하나의 freeze된 최종 corpus 스냅샷 + freeze된 benchmark에서 baseline/new 알고리즘을 비교하도록 재설계, 중간 측정값은 exploratory로만 기록, 두 효과를 별도 항목으로 보고하도록 REQ-EVIDENCE-017 신설. **이슈 3**(REQ-EVIDENCE-019, REQ-EVIDENCE-020): synthetic diagnostic fixture의 A/B/C-전제조건 결과로 실제 smoke의 A/B 원인을 배제한다고 서술하던 과잉주장 — fixture는 진단 harness 자체의 정상 동작 검증 목적임을 명시하고, 실제 smoke 원인을 좁히려면 실제 사용된 snapshot을 안전하게 재현 가능할 때만 replay하도록 REQ-EVIDENCE-020 신설(재현 불가 시 미확정 유지). **이슈 4**(REQ-EVIDENCE-006/027 병합): `issueTypes`/`sourceIdentifier`/`sourceDate` 3개 컬럼을 사전 확정하던 것을 철회 — `issueTypes`만 필수 migration 대상으로 확정하고, `sourceIdentifier`/`sourceDate`는 실제 소비 코드(authenticity/dedup)가 입증될 때만 추가하도록 REQ-EVIDENCE-006에 통합. **이슈 5**(REQ-EVIDENCE-002, REQ-EVIDENCE-005): 신규 record만이 아니라 기존 production evidence 10건 전체를 예외 없이 재감사하도록 REQ-EVIDENCE-005 신설(POLICY/STATUTE/PRECEDENT도 예외 아님, 근거 미확보 시 OTHER downgrade 또는 제외를 명시적으로 결정). **이슈 6**(REQ-EVIDENCE-022): "동일 source는 issueTypes 교집합이 비어야 한다"는 과도한 중복 판정 기준을 "동일 sourceIdentifier/sourceUrl + 정규화된 proposition 동일성" 기준으로 교체(동일 source가 같은 issueType의 서로 다른 proposition을 다루는 것은 정상). **이슈 7**(REQ-EVIDENCE-001): coverage matrix 16칸에 `N/A` 허용(QueryPlanner/도메인 의미상 발생하지 않는 조합에 목표 건수 강제 배정 금지). REQ 개수 27→25(Tier L 상한 재확인, REQ-EVIDENCE-028을 009에, REQ-EVIDENCE-027을 006에 통합). design.md/plan.md/acceptance.md/research.md/progress.md 동시 개정(§8 Route 재검토는 plan.md에서 반영, 제품 로직 blocker 아님).
- 2026-08-28: 외부 독립 리뷰 최종 revision 반영(v0.2.0 → v0.3.0, plan-auditor 실행 전 개정 — v0.1 blocker는 정상 반영 확인됨, 이번엔 9개 항목만 소규모 수정, scope 확대 없음). **이슈 1**(REQ-EVIDENCE-016, REQ-EVIDENCE-017, design.md §3.4, plan.md M4c/d/e, acceptance.md AC-EVIDENCE-014): v0.2.0이 "동일 frozen corpus 위에서 알고리즘만 교체하는 비교"를 "Corpus 확장 효과"로 잘못 명명한 잔여 개념 오류 수정 — 이는 실제로 "최종 corpus에서의 algorithm effect"이며, corpus 확장 효과는 cross-corpus Recall@5 직접 비교가 아닌 coverage delta(초기→최종 corpus의 domain×issueType coverage matrix, 빈 cell 수, ground truth 존재 query 비율)로 별도 측정하도록 M4d(algorithm effect)/M4e(corpus expansion effect) 2단계로 분리. **이슈 2**(REQ-EVIDENCE-007, design.md §1.5, acceptance.md AC-EVIDENCE-006): `issueTypes` 컬럼에 대해 zod 기반 production seed runtime validation을 `scripts/db-seed.ts`에 추가(TypeScript 컴파일 타임 타입 체크만으로는 JSON 데이터 오류를 못 잡음) — 새 top-level REQ를 만들지 않고 REQ-EVIDENCE-007에 통합. **이슈 3**(design.md §5.1/§5.3, plan.md M4a): 기존 재감사 + 신규 curation 시 source 진위 검토와 별개로 issueTypes 태깅 품질 검토를 manifest에 추가 — 과도한 tagging 금지, 빈 issueTypes는 사유 기록 필수, 새 LLM tagging 시스템 없음. **이슈 4**(design.md §3.3a/§3.3b): Precision@5 지표와 hitAt5()/precisionAt5() 함수 추가, non-regression 계약(new Recall@5/Hit@5/Precision@5 모두 baseline 이상) 설계 — 결과에 맞춘 사후 threshold retrofit 금지, trade-off 발견 시 사람이 명시적으로 판단해 기록. **이슈 5**(research.md §1.2): "issueTypes/keywords/sourceDate/sourceIdentifier 컬럼 없음 — 전부 신규 추가 대상"이라는 v0.2.0/§4 결정과 모순되는 stale 문구를 "issueTypes만 필수 migration 대상으로 확정, 나머지는 §4 결정에 따름"으로 수정. **이슈 6**(design.md §5.1a): 공식 원문 > 공식기관 공개 요약 > 신뢰 가능한 2차 출처 우선순위를 명시 — 2차 출처는 공식 source 미확보 시에만 사용하고 manifest에 사유 기록. **이슈 7**(design.md §1.2): `sourceIdentifier`/`sourceDate` 기본값을 "조건부 채택"에서 "기본적으로 추가하지 않음"으로 재단순화 — §6 `isDuplicate()`가 이미 `sourceUrl`만으로 동작하므로 실제 gap이 발견될 때만 추가. **이슈 8**: 6개 아티팩트 전체 REQ/AC 개수(25/25, Tier L 상한 유지, 새 REQ/AC 미추가) + traceability + heading convention 재검증. **이슈 9**: plan-auditor 실제 실행 시도(Agent tool 부재로 이번에도 실행 불가 — progress.md에 정직하게 기록, PASS 미기재).
- 2026-08-29: 외부 독립 리뷰 잔여 정합성 반영(v0.3.0 → v0.4.0, plan-auditor 실행 전 개정 — 4개 항목, scope 확대 없음, 새 REQ/AC 미추가). **이슈 1**(REQ-EVIDENCE-016, REQ-EVIDENCE-017, acceptance.md AC-EVIDENCE-014): non-regression 계약(design.md §3.3b)이 AC 수준에서는 지표 '기록 여부'만 확인해 new 성능이 악화돼도 PASS할 수 있던 결함 — REQ-EVIDENCE-016, REQ-EVIDENCE-017과 AC-EVIDENCE-014에 기본 PASS 조건(new Recall/Hit/Precision ≥ baseline + REQ-029 target case 실제 hit)을 명시하고, trade-off 발생 시 threshold 사후 완화를 금지하며 design exception 기록 + plan-auditor 재검토를 요구하도록 개정. **이슈 2**(REQ-EVIDENCE-015, REQ-EVIDENCE-017, design.md §3.3a/§3.4A): benchmark ground truth(`knownRelevantEvidenceIds`)가 예시적 부분집합이어도 통과하던 결함 — freeze 대상 corpus 전체를 검토한 complete human-reviewed set이어야 함을 명시하고, completeness 미확보 시 Precision@5를 최종 acceptance에 쓰지 않도록 제약. `precisionAt5()`를 표준 정의(top-5 슬롯/5)로 통일해 실제 반환 개수를 분모로 쓰는 대안(Precision@Returned)과 혼용하지 않도록 확정. **이슈 3**(design.md §1.2/§6, acceptance.md AC-EVIDENCE-018): `isDuplicate()` pseudocode가 sourceIdentifier 미도입 기본안(§1.2)과 불일치하게 `EvidenceCandidate.sourceIdentifier`를 직접 참조하던 결함 — 기본 구현은 sourceUrl + 정규화 content만 사용하도록 수정, sourceIdentifier는 실제 migration 시점에 함께 추가. **이슈 4**(optional, REQ-EVIDENCE-007/AC-EVIDENCE-006, design.md §1.5): `QueryIssueType` 8개 값이 `lib/pipeline/types.ts`와 `db/seed/evidence-seed-schema.ts`에 이중 하드코딩돼 drift 위험이 있던 부분 — `QUERY_ISSUE_TYPES` 단일 const를 SSOT로 두고 zod enum이 이를 import하도록 개정(과설계 아닌 순수 타입 리팩터 범위 내에서 가능하다고 판단).
- 2026-08-29: plan-auditor 최초 실행 결과(iteration 1, FAIL) 반영 및 D1 정정(v0.4.0 → v0.5.0). 이 SPEC에 대해 이번 세션에서 처음으로 실제 `plan-auditor` subagent가 실행됐다(progress.md §G.1) — verdict는 FAIL, must-pass 기준 MP-1(REQ 번호 연속성) 실패가 원인: REQ-EVIDENCE ID가 001~021/026/029/030/031(25개)로 001~025 연속 번호가 아니었다(022~025 공백 — v0.2.0 개정 당시부터 존재했던 결함이며, 이전에는 실제 plan-auditor를 한 번도 실행한 적이 없어 발견되지 못했다). **D1(critical, blocking)**: 25개 REQ-EVIDENCE ID 전체를 문서 등장 순서 그대로 001~025 연속 번호로 재번호화(예: 구 026→005, 구 005→006, …, 구 021→025 — 상세 매핑은 progress.md §G.6 참고) — `AC-EVIDENCE-*` ID는 이번 재번호화 대상이 아니다(변경 없음). 이 재번호화로 6개 아티팩트 전체의 REQ 교차참조(과거 HISTORY 항목의 REQ 번호 언급 포함)가 현재 번호 체계로 일괄 갱신됐다. **D2(minor)**: spec.md §4의 5개 `### Out of Scope` 하위 절을 산문에서 `-` 불릿 형식으로 변경(내용은 동일). **D3(minor)**: acceptance.md §A/§D의 REQ→AC 병합 요약이 2건만 언급하고 REQ-EVIDENCE-020(구 031)→AC-016d 병합을 누락했던 것을 3건 모두 언급하도록 보강. **D4(minor)**: REQ-EVIDENCE-009(구 008)에서 boolean 수식(HOW)을 걷어내고 WHAT/WHY 서술 + design.md §2.1 교차참조로 대체. **D5(minor)**: REQ-EVIDENCE-021(구 017)의 "가능한 경우"라는 무조건부 완화 표현을 `sourceUrl` 실제 확인 가능 여부를 명시하는 조건절로 교체. 5건 모두 새 REQ/AC ID를 만들지 않고 기존 wording만 정정했다.

## §0. 이 SPEC이 다루지 않는 것 — 먼저 밝힘

이 SPEC의 목표는 **"더 많은 데이터를 넣는다"가 아니다**. 두 개의 독립적 목표를 다룬다: (1) 상해후유장해/질병후유장해 두 담보의 실제 핵심 쟁점(issueType)별 coverage를 검증 가능하게 만드는 corpus 확장, (2) `counterEvidenceIds=[]` 현상의 원인이 corpus 부족/Retriever 후보 탈락/Skeptic 선택 미채택 중 어디에 가까운지 **테스트로 구분 가능하게** 만드는 진단 장치. "모든 사건에서 counterEvidenceIds가 최소 1개 나와야 한다"는 이 SPEC의 acceptance가 아니다 — 실제로 반박 근거가 없는 사건에서는 빈 배열이 정상일 수 있다(§2 REQ-EVIDENCE-018 참고).

## §1. 개요 (Overview)

### WHY — 배경 및 동기

현재 production evidence corpus는 약 10건(`db/seed/evidence.json`)이며, `EvidenceRetriever`(`lib/pipeline/evidence-retriever.ts`)는 `category`(담보 도메인 라벨 문자열) 일치 + `title`/`content` 키워드 substring 매칭만으로 관련성을 판정한다 — `ResearchQuery.issueType`(예: `CAUSATION`, `DISABILITY_GRADE_CRITERIA`)은 쿼리 쪽에만 존재하고 evidence 쪽에는 대응 필드가 없어, 실제로는 "쟁점"이 아니라 "키워드 우연 일치"로 검색이 이루어진다. 두 번의 실 Gemini smoke에서 `counterEvidenceIds`가 매번 빈 배열이었다는 사실은(`gemini-smoke-20260827.md` §핵심 발견) 실측이지만, 그 원인이 corpus 부족인지, Retriever가 후보를 top-5 밖으로 떨어뜨리는지, 아니면 Skeptic이 실제로 전달받고도 선택하지 않는지 현재는 구분할 방법이 없다.

### WHAT — 이번 SPEC 범위

- **Corpus 확장**: 두 담보(상해후유장해/질병후유장해) × 핵심 issueType coverage matrix를 먼저 정의하고, 그 matrix가 요구하는 만큼만 실제 검증 가능한 공개 출처(대법원/법원 판례, 국가법령정보센터 법령, 금융감독원 분쟁조정·공개자료, 표준약관·장해분류표 등)로 production evidence를 확장한다(목표 약 50~100건 — 임의 균등배분이 아니라 coverage matrix가 배분을 결정). PRECEDENT/STATUTE/DISPUTE_CASE/POLICY로 분류되는 레코드는 실제로 검증 가능한 공개 출처만 허용하며, 사건번호·결정번호·법령 조문·`sourceUrl`을 지어내지 않는다. 합성(synthetic) evidence는 production seed에 넣지 않는다 — 합성 데이터는 테스트 fixture 전용이다.
- **Evidence metadata 최소 확장**: Retriever 품질 개선에 실제로 필요하다고 입증되는 최소 metadata만 스키마에 추가한다(§2 REQ-EVIDENCE-006~007). `claimant`/`insurer` stance 같은 주관적 라벨은 이번 SPEC에서 도입하지 않는다(§4 Out of Scope).
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
| REQ-EVIDENCE-001 | Ubiquitous | run-phase 착수 전, 두 담보(`INJURY_DISABILITY`/`DISEASE_DISABILITY`) × 8개 `QueryIssueType`(`lib/pipeline/types.ts`)를 축으로 하는 evidence coverage matrix(16칸 전부 표에 유지)를 문서화해야 하며, corpus 확장 개수는 이 matrix가 식별한 공백을 근거로 배분해야 한다 — evidenceType(PRECEDENT/STATUTE/DISPUTE_CASE/POLICY/OTHER)별 목표 건수를 임의 균등배분해서는 안 된다. `QueryPlanner`/도메인 의미상 실제로 발생하지 않는 조합(예: 특정 조건부 issueType이 해당 도메인에서 트리거되지 않는 경우)은 `N/A`로 명시할 수 있으며, `N/A` 셀에 억지로 목표 건수를 배정해서는 안 된다 — coverage 목표는 `QueryPlanner`가 실제로 생성할 수 있고 제품적으로 의미 있는 조합을 우선한다(외부 독립 리뷰 반영, 이슈 7). | 사용자 지시 §1, §11, §7(리뷰) |
| REQ-EVIDENCE-002 | Ubiquitous + Unwanted | `evidenceType`이 `PRECEDENT`/`STATUTE`/`DISPUTE_CASE`/`POLICY`로 분류되는 production evidence record(기존 10건 포함 — §5(리뷰) 참고, 신규 record만이 아니다)는 실제로 검증 가능한 공개 출처(대법원/법원 판례, 국가법령정보센터, 금융감독원 분쟁조정·공개자료, 표준약관·장해분류표, 기타 신뢰 가능한 공공기관 자료)만 허용하며, 사건번호·결정번호·법령 조문·`sourceUrl`을 지어내서는 안 된다. 검증 가능한 특정 자료로 뒷받침할 수 없는 일반적 설명은 `evidenceType: "OTHER"`로만 분류하거나 production corpus에 포함하지 않아야 한다. | 사용자 지시 §1, §5(리뷰) |
| REQ-EVIDENCE-003 | Ubiquitous + Unwanted | 합성(synthetic) 또는 사실관계를 각색한 evidence record는 `db/seed/evidence.json`(production seed)에 추가해서는 안 된다 — 합성 데이터는 §D의 benchmark/diagnostic fixture 전용이며 물리적으로 다른 파일(§3 참고)에 있어야 한다. | 사용자 지시 §1, §5 |
| REQ-EVIDENCE-004 | Ubiquitous | production evidence corpus 확장 이후에도 `pnpm db:seed`는 기존 10건을 포함해 모든 레코드에 대해 멱등(idempotent)해야 한다 — 재실행 시 행 수가 변하지 않고 `id` 기준 upsert가 유지되어야 한다(`scripts/db-seed.ts`의 기존 `onConflictDoUpdate` 계약 보존). | 사용자 지시 §9, 기존 REQ-RUNTIME-005 계약 |
| REQ-EVIDENCE-005 | Ubiquitous | 기존 production evidence 10건 전체를 REQ-EVIDENCE-002와 동일한 authenticity 규칙으로 예외 없이 재감사해야 한다(POLICY/STATUTE/PRECEDENT도 예외 아님) — 각 레코드에 대해 (a) `evidenceType`, (b) `sourceUrl` 실재 여부, (c) 실제 출처 접근 가능 여부, (d) `sourceIdentifier` 필요 여부, (e) `content`가 원문 취지를 과장하지 않는지를 검토하고, 공식/검증 가능한 근거를 확보하지 못한 레코드는 `evidenceType: "OTHER"`로 downgrade하거나 production corpus에서 제외하는 것 중 하나를 각 레코드마다 명시적으로 결정해야 한다. 이 재감사 결과는 §D 벤치마크의 ground truth 후보 자격의 전제조건이다(REQ-EVIDENCE-015 개정판 참고). | 외부 독립 리뷰 이슈 5 |

### B. Evidence Metadata 최소 확장

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-EVIDENCE-006 | Ubiquitous | evidence 스키마(`lib/db/schema.ts` `evidence` 테이블)에 추가하는 모든 신규 컬럼은 Retriever candidate eligibility/ranking(§C) 또는 benchmark 채점(§D) 또는 authenticity/dedup 검증(§A, §F)에 실제로 소비되어야 한다 — 소비하는 코드 경로가 없는 컬럼을 "향후를 위해" 추가해서는 안 된다. `sourceIdentifier`처럼 authenticity 목적으로 추가하는 컬럼은, 그 컬럼을 실제로 읽어 source-integrity 검증 또는 중복(dedup) 판정을 수행하는 코드 경로가 함께 있어야 한다(단순 존재 여부 구조 검증만으로는 이 REQ를 충족하지 않는다). 이번 SPEC이 plan-phase 시점에 확정하는 필수 migration 대상 컬럼은 `issueTypes` 1개뿐이다 — `sourceIdentifier`/`sourceDate`는 M1 스키마 migration에 사전 포함하지 않으며, run-phase 중 §A(REQ-EVIDENCE-002, REQ-EVIDENCE-005 authenticity 재감사) 또는 §F(REQ-EVIDENCE-022 dedup) 코드에서 실제로 소비할 필요가 입증된 시점에만 별도 migration으로 추가한다(단순히 "있으면 좋은 metadata"라는 이유만으로 `sourceDate`를 추가하지 않는다 — 외부 독립 리뷰 이슈 4). | 사용자 지시 §2, §4(리뷰) |
| REQ-EVIDENCE-007 | Where(capability gate) | 신규 컬럼이 issueType 관련성을 표현해야 하는 경우, `QueryIssueType`(`lib/pipeline/types.ts`)과 동일한 8개 값의 부분집합을 갖는 배열 필드(예: `issueTypes: QueryIssueType[]`)로 표현해야 하며, evidence 자신의 담보-쟁점 분류이지 특정 사건에 대한 판정이 아니어야 한다. production seed(`db/seed/evidence.json`) 로딩 시, `scripts/db-seed.ts`는 이 배열 필드가 8개 값의 부분집합인지 zod 스키마로 runtime validation을 수행해야 하며(design.md §1.5), 검증 실패 시 잘못된 레코드만 건너뛰지 않고 전체 로딩을 fail-fast해야 한다 — TypeScript 컴파일 타임 타입 체크만으로는 JSON 파일의 실제 데이터 오류를 잡을 수 없다(외부 독립 리뷰 v0.3.0 이슈 2). zod 스키마가 사용하는 8개 값 목록은 `lib/pipeline/types.ts`가 export하는 단일 `QUERY_ISSUE_TYPES` const(design.md §1.5)를 그대로 import해서 사용해야 하며, `db/seed/evidence-seed-schema.ts`에 동일한 8개 값을 별도 리터럴 배열로 중복 선언해서는 안 된다(drift 방지, 외부 독립 리뷰 잔여 정합성 이슈 4). | 사용자 지시 §2, §3 |
| REQ-EVIDENCE-008 | Unwanted | 이번 SPEC은 evidence record에 `claimant`/`insurer` 관점(stance) 라벨이나, 판례·법령 전체를 보험사측/청구인측으로 분류하는 필드를 도입해서는 안 된다. "이 evidence record가 표현하는 proposition" 수준의 argument-role 표현이 필요한지는 research.md에서만 검토하고, 근거 없이 스키마를 확장하지 않는다. | 사용자 지시 §2 |

### C. Retriever 쟁점 중심 Ranking

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-EVIDENCE-009 | Ubiquitous | `retrieveEvidence()`(`lib/pipeline/evidence-retriever.ts`)의 관련성 판정 술어(relevant predicate/candidate eligibility)를 현행 구조로 사전에 고정하지 않는다. run-phase는 최소 두 후보 전략 — **(A) 현행 전략**(domain 일치 + keyword 매칭만으로 후보 진입을 판정)과 **(B) 최소 확장안**(domain 일치 + keyword 매칭 또는 issueType exact match 중 하나라도 만족하면 후보 진입을 허용) — 을 동일 corpus·동일 벤치마크로 비교해야 한다. 정확한 최종 식(design.md §2.1)은 §D 벤치마크 결과를 근거로 확정하며, design.md 시점에 하나로 못박지 않는다. issueType 불일치를 이유로 evidence를 candidate 집합에서 무조건 배제하는 hard filter는 사전에 도입하지 않는다 — §D 벤치마크가 그런 필터가 실제로 필요하다고 뒷받침하지 않는 한, issueType은 배제(exclusion) 신호가 아니라 진입(inclusion-OR) 또는 정렬 신호로만 쓰인다(외부 독립 리뷰 이슈 1 — issueType이 ranking에만 쓰이고 eligibility에는 영향을 주지 못해, exact-issueType evidence라도 keyword가 없으면 애초에 후보 집합에 진입하지 못하는 결함 시정). | 사용자 지시 §3, §1(리뷰) |
| REQ-EVIDENCE-010 | Ubiquitous + Unwanted | 채택된 전략(§D 벤치마크로 확정) 적용 이후에도, 무관한 evidence가 단 하나의 우연한 키워드 일치만으로 실제 관련 있는 evidence보다 상위에 오르는 회귀가 없어야 한다(§D 벤치마크로 검증). | 사용자 지시 §10 |
| REQ-EVIDENCE-011 | Ubiquitous + Unwanted | query당 반환 개수(top-K, 현재 5)를 이번 SPEC에서 근거 없이 늘려서는 안 된다 — 조정하려면 §D 벤치마크의 baseline 대비 개선 측정 결과를 근거로 명시해야 한다. | 사용자 지시 §3 |
| REQ-EVIDENCE-012 | Ubiquitous | 동일 입력(evidence corpus 스냅샷 + query 집합)에 대해 `retrieveEvidence()`의 결과는 결정론적(같은 순서)이어야 한다 — score 동점 시 tie-break 규칙(예: `id` 오름차순)을 명시해야 한다. | 사용자 지시 §10 |
| REQ-EVIDENCE-013 | Ubiquitous | §D 벤치마크는 "known-relevant evidence가 정확한 issueType metadata를 갖고 있으나 우연히 query keyword 문자열을 포함하지 않는" 케이스를 최소 1건 포함해야 하며, 새 Retriever(전략 B 또는 그 변형)가 그 evidence를 candidate/top-K로 복구할 수 있는지 측정 가능해야 한다 — 이것이 이번 SPEC의 핵심 acceptance다. | 외부 독립 리뷰 이슈 1 |

### D. Curated Retrieval Benchmark

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-EVIDENCE-014 | Ubiquitous | 저장소에 두 담보의 대표 issueType(최소 CAUSATION/DISABILITY_GRADE_CRITERIA/DIAGNOSIS/DISABILITY_LOCATION + 기왕증·퇴행성 관련 1건)을 포괄하는 고정 retrieval benchmark 케이스 집합을 두어야 하며, 각 케이스는 "이 query에서 검색돼야 하는 known-relevant evidence ID 집합"을 수작업으로 정의한 ground truth를 가져야 한다. | 사용자 지시 §4 |
| REQ-EVIDENCE-015 | Ubiquitous + Unwanted | benchmark의 ground truth가 참조하는 evidence ID는 §A 요건(REQ-EVIDENCE-002)을 만족하고 **REQ-EVIDENCE-005 재감사를 통과한**(OTHER로 downgrade되거나 제외되지 않은) 실제 production evidence corpus의 부분집합이어야 하며, benchmark 전용으로 새로 지어낸 evidence를 참조해서는 안 된다. 또한 이 부분집합은 §D 벤치마크 각 케이스의 query에 대해, REQ-EVIDENCE-017이 정하는 freeze 절차에서 대상 production corpus 전체를 검토해 relevant로 판정된 **complete human-reviewed set**이어야 하며, 일부 예시적 evidence만 반영한 부분 집합이어서는 안 된다(외부 독립 리뷰 잔여 정합성 이슈 2) — 이 completeness가 확보되지 않으면 Precision@5(design.md §3.3a)를 최종 acceptance 판단 근거로 사용하지 않는다. | 사용자 지시 §4, §5(리뷰) |
| REQ-EVIDENCE-016 | Ubiquitous | 최종 acceptance threshold 비교(**algorithm effect**)는 **하나의 freeze된 최종 corpus 스냅샷 + 하나의 freeze된 `BenchmarkCase`/`knownRelevantEvidenceIds`** 위에서, `baselineRetriever`(현행 알고리즘)와 `newRetriever`(§C에서 확정된 candidate/ranking 알고리즘)를 **동일한 corpus·동일한 ground truth**로 실행해 비교해야 한다 — corpus는 두 실행 모두 같고 알고리즘만 바뀌므로, 이 비교가 측정하는 것은 "최종 corpus에서의 algorithm effect"이지 corpus 확장 효과가 아니다(외부 독립 리뷰 v0.3.0 이슈 1). corpus가 아직 확장 중인 중간 시점(M2, 10건 corpus)의 측정값은 **exploratory baseline**으로만 기록하며, 최종 acceptance threshold의 직접 비교값으로 사용하지 않는다(외부 독립 리뷰 이슈 2). Recall@5 / Hit@5 / Precision@5 세 지표를 함께 측정·기록해야 하며(design.md §3.3a/§3.3b), Recall@5만 보고하고 Precision@5 하락을 누락해서는 안 된다. 이 비교의 **기본 PASS 조건**은 new(전략 B) Recall@5 ≥ baseline(전략 A) Recall@5, new Hit@5 ≥ baseline Hit@5, new Precision@5 ≥ baseline Precision@5이며, REQ-EVIDENCE-013가 지정한 target case(exact issueType, no keyword)에서 baseline이 miss하고 new가 hit함이 실제로 관측되어야 한다(design.md §3.3b). 측정 결과 이 조건 중 하나라도 trade-off(예: new Precision@5 < baseline Precision@5)로 미충족되면, 그 결과에 맞춰 threshold를 낮추거나 계약을 조용히 수정해 PASS로 만들어서는 안 된다 — score 함수 파라미터 재조정 또는 trade-off를 감수하는 명시적 근거(악화된 metric과 폭, 제품적 수용 사유, 검토한 대체 전략/weight 조정 결과)를 사람이 판단해 acceptance.md 또는 progress.md에 design exception으로 기록해야 하며, 그렇게 완화된 계약은 plan-auditor 재검토 대상이다(외부 독립 리뷰 잔여 정합성 이슈 1). | 사용자 지시 §4, §2(리뷰) |
| REQ-EVIDENCE-017 | Ubiquitous | M4(corpus 확장)가 새 relevant evidence를 추가하면, 그 evidence를 참조하도록 benchmark ground truth를 사람이 검토(human review)해 갱신한 뒤 **freeze**해야 하며, 이후 §D의 최종 비교(REQ-EVIDENCE-016, algorithm effect)는 그 freeze된 benchmark에서만 수행한다. **algorithm effect**(동일 frozen corpus 위에서 `baselineRetriever` vs `newRetriever`, REQ-EVIDENCE-016)와 **corpus expansion effect**(초기 corpus → 최종 frozen corpus의 coverage delta 측정 — cross-corpus Recall@5 직접 비교가 아님, design.md §3.4B)는 `.moai/reports/`에 **서로 다른 항목**으로 기록해야 하며, 하나의 수치로 합쳐 보고하지 않는다. freeze 시 수행하는 human review는 각 BenchmarkCase의 query에 대해 freeze 대상 production corpus 전체를 검토하여 relevant로 판정된 evidence의 **complete** 집합으로 `knownRelevantEvidenceIds`를 확정해야 한다(REQ-EVIDENCE-015 completeness 조건) — 예시적으로 일부만 반영해서는 안 된다. | 외부 독립 리뷰 이슈 1, 2 |

### E. counterEvidenceIds=[] 원인 진단

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-EVIDENCE-018 | Unwanted | 어떤 코드·테스트·문서도 "모든 사건에서 `counterEvidenceIds`가 최소 1개 나와야 한다"를 acceptance로 강제해서는 안 된다 — 반박 근거가 실제로 없는 사건에서는 빈 배열이 정상일 수 있다. | 사용자 지시 §5 |
| REQ-EVIDENCE-019 | Ubiquitous | 최소 1개의 고정 diagnostic fixture 사건에서, `ResearchQuery` → `EvidenceRetriever`가 제공한 evidence ID → Skeptic에게 실제 전달된 evidence ID → `Challenge.supportingEvidenceIds` → `Challenge.counterEvidenceIds`의 각 단계 값을 테스트에서 관측 가능해야 하며, known counter-relevant evidence가 corpus에 존재하고 benchmark query에 relevant로 정의된 fixture에서는 Retriever가 그 evidence를 candidate로 제공하는지를 최소한 (A) corpus 자체에 없음 / (B) corpus에는 있으나 top-K 탈락 / (C-전제조건) Skeptic 프롬프트에 전달됨, 세 단계를 구분 가능한 방식으로 검증해야 한다. **이 fixture는 진단 harness 자체가 정상 동작하는지를 검증하는 것이지, 2026-08-27/2026-08-28 실제 Gemini smoke의 원인을 판정하는 것이 아니다** — fixture에서 A=true/B=true/C-전제조건=true가 나왔다는 사실이 실제 smoke의 A/B 후보를 배제한다고 서술해서는 안 된다(외부 독립 리뷰 이슈 3). | 사용자 지시 §5, §3(리뷰) |
| REQ-EVIDENCE-020 | Ubiquitous + Unwanted | 실제 smoke(2026-08-27/2026-08-28)의 원인 후보(corpus 부족/Retriever 후보 부족/Skeptic prompt semantics/model behavior)를 좁히려면, 그 smoke가 사용한 de-identified case/query snapshot을 안전하게 재현 가능한 경우에만 `동일 production corpus → planQueries() → retrieveEvidence() → Skeptic 프롬프트 candidate`를 실제로 replay해 관측해야 한다. 그 snapshot이 없거나 안전하게 재현할 수 없는 경우, 실제 smoke의 원인은 계속 "corpus/Retriever/prompt/model behavior 미확정"으로 남겨야 하며, synthetic fixture(REQ-EVIDENCE-019) 결과만으로 그 미확정 상태를 해소했다고 서술해서는 안 된다. | 외부 독립 리뷰 이슈 3 |

### F. Evidence 품질 규율

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-EVIDENCE-021 | Ubiquitous | production evidence record는 **`sourceUrl`이 실제로 확인 가능한 경우** 그 출처 URL, source identifier(사건번호/결정번호/법령 조문 번호 등), evidenceType, 과장하지 않은 요약(content)을 보유해야 하며(`sourceUrl`이 nullable인 설계와 일치 — research.md §1.2), 판례의 결론을 보험금 지급 확정처럼 서술하거나 판례의 사실관계·법리를 현재 사건에 자동 적용된다고 서술해서는 안 된다. | 사용자 지시 §6 |
| REQ-EVIDENCE-022 | Ubiquitous + Unwanted | 하나의 source에서 여러 proposition을 별도 record로 나누는 것은 허용하되, 동일 proposition의 중복 record를 만들어서는 안 된다. 중복 판정은 **issueType 교집합이 아니라** (a) 동일 `sourceIdentifier` 또는 동일 `sourceUrl`, AND (b) 동일하거나 실질적으로 동일한 정규화된(normalized) proposition/content를 기준으로 한다 — 동일 source가 서로 다른 proposition을 다루면서 같은 issueType을 공유하는 것은 정상이며 중복이 아니다(외부 독립 리뷰 이슈 6). LLM 기반 semantic equivalence 자동 판정 시스템은 이번 SPEC에서 만들지 않는다 — 정규화(공백/구두점 정리 등) 수준의 최소 규칙만 사용한다. | 사용자 지시 §6, §6(리뷰) |

### G. 기존 pipeline 계약 보존 (회귀 방지)

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-EVIDENCE-023 | Ubiquitous + Unwanted | 이번 SPEC의 어떤 변경도 사건당 논리적 `generateStructured()` 호출 수(Researcher=1, Skeptic=1, Verifier=1, 총 3)를 늘려서는 안 된다 — evidence candidate 개수나 metadata 확장이 프롬프트 배치 호출 횟수에 영향을 주지 않아야 한다(SPEC-GEMINI-RUNTIME-001 REQ-GEMINI-RUNTIME-019 계약 보존). | 사용자 지시 §3, §7 |
| REQ-EVIDENCE-024 | Ubiquitous + Unwanted | 다음 기존 계약은 변경되지 않아야 한다: query별 evidence isolation(다른 query/finding에 전달된 evidence ID 인용 금지), Researcher `supportingEvidenceIds.length >= 1` 그라운딩, 위조(forged) evidence ID 차단(Verifier 조용히 제거), semantic Verifier fail-closed, `findSafetyViolations()` 3개소 적용, `pnpm test:e2e`의 결정론적 provider 경로, 프로세스 로컬 Gemini 동시성 락(`pipelineChain`)/`RateScheduler`, 실제 Gemini model/env 계약(`GEMINI_RESEARCH_MODEL`/`GEMINI_FAST_MODEL`/`GEMINI_*_RPM_BUDGET`). | 사용자 지시 §7 |

### H. DB/Schema 변경

| ID | 유형 | 요구사항 | 근거 |
|----|------|----------|------|
| REQ-EVIDENCE-025 | Ubiquitous | §B의 신규 컬럼은 Drizzle migration(`drizzle-kit generate` + 결과 SQL 커밋)으로 추가해야 하며, 기존 `evidence` 테이블의 컬럼(`id`/`category`/`evidenceType`/`scope`/`title`/`content`/`sourceUrl`/`createdAt`)과 기존 seed 재실행/idempotency 계약(REQ-EVIDENCE-004)을 깨서는 안 된다. | 사용자 지시 §9 |

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

- vector DB, embeddings, Elasticsearch/OpenSearch, 외부 검색 API 기반 실시간 RAG를 도입하지 않는다. 현재 DB + TypeScript 규칙 기반 구조 위에서만 개선한다(design.md §2/§6).

### Out of Scope — 데이터 수집 자동화

- crawler·자동 웹 스크래핑 시스템, LLM 기반 ingestion pipeline을 만들지 않는다 — corpus 큐레이션은 사람(또는 run-phase 에이전트의 개별 WebFetch)이 개별 검토하는 수작업 절차다(design.md §5).

### Out of Scope — 인프라/운영 확장

- 별도 microservice, Redis/BullMQ, 관리자 CMS를 신설하지 않는다 — 모든 변경은 기존 Next.js monorepo의 `lib/pipeline/`, `lib/db/` 안에 머문다.

### Out of Scope — corpus 규모/담보 확장

- 수천/수만 건 규모의 corpus를 만들지 않는다(목표는 약 50~100건, §A). 상해후유장해/질병후유장해 두 담보 외 다른 보험 담보로 확장하지 않는다.

### Out of Scope — 주관적 metadata

- `claimant`/`insurer` stance 라벨이나 판례·법령을 보험사측/청구인측으로 분류하는 스키마를 도입하지 않는다(REQ-EVIDENCE-008).

## §5. 잔여 위험 (Residual Risks)

- **corpus 확장 규모의 실현 가능성**: plan-phase는 coverage matrix 프레임워크를 정의하지만, 실제 50~100건의 검증 가능한 공개 출처 수집은 run-phase 실행 시점의 웹 접근 도구 가용성에 의존한다 — plan-phase 시점에는 이 SPEC 저자가 WebSearch/WebFetch에 접근하지 못했다(research.md §0 명시). run-phase 착수 전 이 가용성을 재확인해야 한다.
- **counterEvidenceIds=[] 원인이 여전히 미확정으로 남을 가능성**: §E의 진단 장치는 A/B/C 세 경우를 "구분 가능하게" 만들 뿐, 반드시 하나의 원인으로 확정짓는다고 보장하지 않는다 — model behavior(D)가 실제 원인이라면 이 SPEC의 corpus/Retriever 개선만으로는 여전히 빈 배열이 재현될 수 있다.
- **issueType ranking의 부작용**: score 함수에 issueType 가중치를 추가하면 기존 키워드-only 벤치마크(있다면)의 순위가 바뀔 수 있다 — REQ-EVIDENCE-010의 회귀 벤치마크로 완화한다.
- **기존 10건 재감사(REQ-EVIDENCE-005)가 corpus를 줄일 수 있다**: 재감사 결과 일부 기존 record가 OTHER로 downgrade되거나 제외되면, 확장 이전보다 오히려 PRECEDENT/STATUTE/DISPUTE_CASE/POLICY 유효 corpus가 줄어들 수 있다 — 이는 이번 SPEC의 authenticity 원칙(REQ-EVIDENCE-002)이 의도한 결과이며 결함이 아니지만, M4의 50~100건 목표 달성을 더 어렵게 만들 수 있다는 점을 인지해야 한다.
- **frozen benchmark 재실행 비용**: REQ-EVIDENCE-017의 freeze 절차는 M4에서 corpus가 바뀔 때마다 ground truth 사람 검토 + 두 알고리즘 재실행을 요구한다 — corpus 확장이 여러 차례 반복되면 이 절차도 여러 차례 반복돼야 하므로, M4를 소수의 큰 배치로 묶어 freeze 횟수를 줄이는 것이 바람직하다(plan.md M4 참고).
