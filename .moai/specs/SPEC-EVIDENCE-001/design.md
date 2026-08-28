# SPEC-EVIDENCE-001 — design.md

## §0. 이 SPEC의 핵심 프레이밍

두 개의 독립적 설계 축이 있다 — **(축1) corpus를 쟁점 중심으로 검증 가능하게 확장**하는 것과
**(축2) counterEvidenceIds=[] 현상을 A/B/C 세 단계로 분해해 관측 가능하게 만드는 것**이다. 두
축 모두 "vector DB 없이 현재 DB + TypeScript 규칙 기반 구조 위에서"라는 제약 안에서 설계한다
(spec.md §4 Out of Scope).

## §1. Requirement A/H — Evidence 스키마 확장 (Drizzle migration)

### 1.1 신규 컬럼 (research.md §4 근거)

`lib/db/schema.ts` `evidence` 테이블에 다음을 추가한다:

```typescript
export const evidence = sqliteTable("evidence", {
  // ...기존 8개 컬럼 변경 없음...
  issueTypes: text("issue_types", { mode: "json" }).notNull().default("[]"),
  sourceIdentifier: text("source_identifier"),   // nullable — 사건번호/조문번호 등
  sourceDate: text("source_date"),               // nullable — ISO 8601 date string, 선고일/시행일 등
});
```

- `issueTypes`는 `QueryIssueType[]`(8개 값의 부분집합)을 JSON 배열로 저장한다 — 별도 join 테이블을
  두지 않는다(evidence 1건이 여러 issueType에 걸칠 수 있음 — 예: 인과관계 판례가 동시에 기왕증
  쟁점도 다룰 수 있음). `.default("[]")`로 기존 10건 레코드가 마이그레이션 직후 빈 배열을 가지며,
  score 계산에서 issueType 가중치 0으로 안전하게 폴백한다(§2.2, 하위 호환).
- `sourceIdentifier`/`sourceDate`는 nullable — 기존 10건은 `null`로 유지해도 무방하다(REQ-EVIDENCE-004
  idempotency와 충돌하지 않음, 값을 채우는 것은 run-phase의 corpus 큐레이션 작업이지 스키마
  자체의 의무가 아니다).
- `keywords` 필드는 이 시점에 스키마에 추가하지 않는다(research.md §4 "보류") — run-phase M2가
  benchmark baseline을 측정한 뒤 실제로 substring 매칭 대비 이득이 있는지 확인하고서야 추가 여부를
  결정한다. 이 SPEC의 plan.md는 그 결정 자체를 M2의 산출물로 명시한다.

### 1.2 Migration 절차

`drizzle-kit generate`로 SQL migration 파일을 생성해 `drizzle/` 아래 커밋한다(기존 SPEC-RUNTIME-001의
migration 방식과 동일 — `pnpm db:migrate`가 추적 테이블 기준으로 안전하게 재실행 가능). ALTER
TABLE ADD COLUMN만 사용하며(SQLite 제약상 컬럼 삭제/타입 변경은 이 SPEC에서 하지 않음), 기존
행 데이터는 변경하지 않는다.

### 1.3 `EvidenceCandidate`/`EvidenceSeedRecord` 타입 확장

`lib/pipeline/types.ts`의 `EvidenceCandidate`에 `issueTypes: QueryIssueType[]` 필드를 추가한다
(nullable 아님 — DB `.default("[]")`가 항상 배열을 보장하므로). `scripts/db-seed.ts`의
`EvidenceSeedRecord` interface와 upsert `values`/`set` 양쪽에 3개 신규 필드를 추가한다 — 기존
`onConflictDoUpdate` 패턴을 그대로 확장(REQ-EVIDENCE-004).

## §2. Requirement C — Retriever 쟁점 중심 Ranking

### 2.1 관련성 술어(relevant predicate) — 변경 없음

REQ-EVIDENCE-008이 명시한 대로 현행 구조를 보존한다:

```
relevant = isUniversal ? keywordScore > 0 : (domainMatch AND keywordScore > 0)
```

issueType 불일치만으로 evidence를 관련성 판정에서 배제하지 않는다 — issueType은 **정렬(ranking)
전용 signal**이며 필터(relevant) 조건에 추가하지 않는다. 이는 의도적 설계 결정이다: `issueTypes`가
아직 비어 있는(마이그레이션 직후) 기존 10건이 필터에서 통째로 탈락하면 REQ-EVIDENCE-004(idempotency
이후 회귀 없음) 정신에 반한다 — score만 낮게 받고 relevant 판정에는 여전히 참여해야 한다.

### 2.2 score 함수 — issueType 가중치 추가

```typescript
function computeScore(
  evidence: EvidenceCandidate,
  query: ResearchQuery,
  domainMatch: boolean,
  isUniversal: boolean,
  keywordScore: number
): number {
  const issueTypeWeight = evidence.issueTypes.includes(query.issueType) ? 10 : 0;
  const domainWeight = domainMatch ? 2 : 0;
  const universalWeight = isUniversal ? 1 : 0;
  return issueTypeWeight + domainWeight + universalWeight + keywordScore;
}
```

- `issueTypeWeight = 10`은 의도적으로 `domainWeight(2)`와 일반적인 `keywordScore`(관측상 1~3
  범위)를 합친 것보다 크게 잡아, "쟁점이 정확히 일치하는 evidence"가 "우연히 키워드 하나만 겹치는
  evidence"보다 항상 위에 오도록 한다(REQ-EVIDENCE-009 회귀 방지의 설계 근거). 정확한 값(10)은
  run-phase M2에서 §D 벤치마크로 검증하며, 벤치마크가 이 값을 정당화하지 못하면 조정한다 — 이
  design.md는 "출발점"을 제시하는 것이지 확정값을 강제하지 않는다.
- `issueTypes`가 비어 있는 레코드(마이그레이션 직후 기존 10건, 또는 아직 분류 안 된 신규 레코드)는
  `issueTypeWeight = 0`으로 자연 폴백한다 — 명시적 특수 케이스 분기 없이 `Array.includes()`가
  빈 배열에서 항상 `false`를 반환하는 것으로 충분하다.

### 2.3 결정론적 정렬 (tie-break)

```typescript
.sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))
```

동점일 때 `id` 오름차순으로 고정한다(REQ-EVIDENCE-011). `TOP_N = 5`는 변경하지 않는다
(REQ-EVIDENCE-010) — run-phase M2가 벤치마크로 조정 필요성을 판단한 뒤에만 바꾼다.

## §3. Requirement D — Curated Retrieval Benchmark

### 3.1 파일 위치와 형태

신규 파일 `lib/pipeline/evidence-retriever.benchmark.test.ts`(또는 `db/seed/evidence-benchmark.json`
+ 이를 로드하는 테스트) — vitest 테스트로 실행되며 `pnpm test`에 포함된다(별도 CI 파이프라인
신설 안 함, spec.md §4 Out of Scope).

```typescript
interface BenchmarkCase {
  id: string;                    // "bm-injury-causation-01" 형태
  query: ResearchQuery;          // 고정 쟁점 쿼리(합성이지만 REQ-EVIDENCE-013 대상 아님 — query 자체는 evidence가 아님)
  knownRelevantEvidenceIds: string[]; // production evidence corpus의 실제 id 부분집합(REQ-EVIDENCE-013)
}
```

### 3.2 커버리지 (REQ-EVIDENCE-012)

최소 6개 케이스: 두 담보(INJURY_DISABILITY/DISEASE_DISABILITY) × {CAUSATION,
DISABILITY_GRADE_CRITERIA, DIAGNOSIS 또는 DISABILITY_LOCATION} 조합에서 각 담보당 3개, 총
6개 — 여기에 기왕증/퇴행성(`PRE_EXISTING_CONDITION`) 케이스 1개를 추가해 총 7개 이상.

### 3.3 지표 계산과 baseline

```typescript
function recallAt5(candidates: EvidenceCandidate[], knownRelevantIds: string[]): number {
  const returned = new Set(candidates.map((c) => c.id));
  const hits = knownRelevantIds.filter((id) => returned.has(id)).length;
  return knownRelevantIds.length === 0 ? 1 : hits / knownRelevantIds.length;
}
```

run-phase M2는 이 함수를 (a) §2.1 변경 전(순수 domain+keyword score) baseline과 (b) §2.2 issueType
가중치 적용 후, 두 번 실행해 벤치마크 케이스별·평균 Recall@5를 `.moai/reports/`에 기록한다
(REQ-EVIDENCE-014). acceptance threshold(예: "평균 Recall@5 ≥ baseline + 유의미한 개선폭")는 이
두 실측값을 본 뒤 acceptance.md 개정으로 확정한다 — design.md 시점에는 임의 숫자를 박아넣지 않는다.

## §4. Requirement E — counterEvidenceIds=[] 진단 장치

### 4.1 설계 원칙 — 무엇을 자동화하고 무엇을 하지 않는가

A(corpus에 없음)와 B(top-K 탈락)는 **완전히 결정론적으로 unit-test 가능**하다 — 둘 다 순수
TypeScript 함수(`retrieveEvidence()`)의 입출력이기 때문이다. C(Skeptic이 전달받았지만 선택하지
않음)는 실제 Gemini 모델의 판단이므로 **unit test로 강제할 수 없다** — 대신 진단 장치는 C의
**전제 조건**(Skeptic 프롬프트에 counter-relevant evidence ID가 실제로 포함되어 전달되었는가)까지만
결정론적으로 검증하고, 그 이후 "모델이 실제로 그것을 counterEvidenceIds로 골랐는가"는 실 Gemini
smoke(이미 2회 수행)의 몫으로 명시적으로 남긴다. 이 경계를 흐리지 않는 것이 REQ-EVIDENCE-015("모든
사건에서 counterEvidenceIds ≥ 1을 강제하지 않는다")의 설계적 귀결이다.

### 4.2 diagnostic fixture 구조

신규 파일 `lib/pipeline/evidence-diagnostic.test.ts`:

```typescript
// 1) 고정 synthetic 사건 (case-input.test.ts 등 기존 fixture 패턴 재사용, PII 없음)
const fixtureCase: NormalizedCase = { /* ... */ };

// 2) 고정 evidence corpus 스냅샷 — production corpus의 부분집합 또는 동형 fixture.
//    최소 1건은 "counter-relevant"로 의도적으로 배치한 evidence여야 한다(REQ-EVIDENCE-016).
const fixtureEvidence: EvidenceCandidate[] = [ /* ... */ ];

it("A: corpus에 counter-relevant evidence가 존재하는지 확인", () => {
  expect(fixtureEvidence.some((e) => e.id === "known-counter-relevant-id")).toBe(true);
});

it("B: Retriever가 그 evidence를 후보로 반환하는지 확인 (top-K 탈락 여부)", async () => {
  const candidates = await retrieveEvidence(queries, mockDbReturning(fixtureEvidence));
  const relevantForQuery = candidates.get(targetQueryId) ?? [];
  expect(relevantForQuery.some((c) => c.id === "known-counter-relevant-id")).toBe(true);
});

it("C-전제조건: Skeptic 프롬프트에 그 evidence ID가 실제로 포함되어 전달되는지 확인", async () => {
  const provider = makeCapturingProvider(); // 프롬프트 텍스트를 캡처하는 결정론적 fake provider
  await challenge(findings, evidenceMap, provider);
  expect(provider.capturedPrompt).toContain("known-counter-relevant-id");
  // 이 지점 이후("모델이 실제로 counterEvidenceIds에 포함시켰는가")는 이 unit test의 범위 밖 —
  // 실 Gemini smoke 리포트(.moai/reports/gemini-*-smoke-*.md)와 상호 참조한다.
});
```

세 단계 모두 결정론적 fake/mock만 사용한다(REQ-EVIDENCE-019/020 — 실제 Gemini 호출 없음, 논리적
호출 수 불변). 세 번째 테스트("C-전제조건")가 실패하면 C가 아니라 B의 변형(evidence가 top-K에는
들었지만 Skeptic 프롬프트 조립 단계에서 누락)이라는 신호이므로, 실패 지점 자체가 진단 정보다.

### 4.3 A/B/C 결과 해석표 (run-phase가 실제로 채우는 표, plan.md M3 산출물)

| A(corpus 존재) | B(Retriever 후보 포함) | C-전제(Skeptic 프롬프트 포함) | 실 smoke counterEvidenceIds | 해석 |
|:---:|:---:|:---:|:---:|------|
| ✅ | ✅ | ✅ | 빈 배열 | 모델이 실제로 선택하지 않음(순수 C) — corpus/Retriever 문제 아님 |
| ✅ | ❌ | — | (B 실패로 도달 불가) | top-K cutoff 또는 score 함수 문제(B) |
| ❌ | — | — | (A 실패로 도달 불가) | corpus 자체의 공백(A) — corpus 확장 필요 |

## §5. Requirement A/F — Corpus 큐레이션 워크플로 (run-phase 절차, 코드 아님)

1. spec.md REQ-EVIDENCE-001의 coverage matrix를 `.moai/docs/` 또는 `.moai/specs/SPEC-EVIDENCE-001/`
   내 별도 표로 먼저 작성 — 담보 × issueType 교차표, 각 셀의 현재 건수(대부분 0)와 목표 건수.
2. research.md §3 후보 출처 카탈로그를 이번 SPEC의 run-phase 세션(WebSearch 또는 실제 등록된
   `law.go.kr` OC 키가 있는 세션)에서 실제로 조사 — 각 후보 레코드마다 (a) 원문 URL 접근 확인,
   (b) 사건번호/조문 번호가 원문과 일치하는지 확인, (c) content 요약이 과장 없이 원문 취지를
   반영하는지 확인(REQ-EVIDENCE-017) 후에만 `db/seed/evidence.json`에 추가.
3. `DISPUTE_CASE`(금융감독원 분쟁조정) 후보는 결정문 원문 또는 금융감독원 공식 공개 요약만
   허용 — 3자 블로그/카페의 재구성 요약은 원 출처로 인정하지 않는다(REQ-EVIDENCE-002).
4. 검증 불가능한 후보는 `evidenceType: "OTHER"`로 낮추거나 아예 제외한다 — "그럴듯하지만
   확인 안 됨"을 PRECEDENT/STATUTE/DISPUTE_CASE로 분류하지 않는다.

## §6. Out of Scope 경계 재확인

vector DB/embedding/Elasticsearch 미도입 확인: §2의 ranking은 순수 TypeScript 산술 함수이며 외부
검색 엔진 의존성을 추가하지 않는다. crawler/자동 스크래핑 미도입 확인: §5의 큐레이션은 사람(또는
run-phase 에이전트의 개별 WebFetch 호출)이 각 레코드를 검토하는 수작업 절차이며 자동 대량 수집
스크립트를 만들지 않는다. microservice/Redis/BullMQ 미도입 확인: 모든 변경은 기존 Next.js
monorepo 안의 `lib/pipeline/`, `lib/db/`에 머문다.
