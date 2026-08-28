# SPEC-EVIDENCE-001 — design.md

## §0. 이 SPEC의 핵심 프레이밍

두 개의 독립적 설계 축이 있다 — **(축1) corpus를 쟁점 중심으로 검증 가능하게 확장**하는 것과
**(축2) counterEvidenceIds=[] 현상을 A/B/C 세 단계로 분해해 관측 가능하게 만드는 것**이다. 두
축 모두 "vector DB 없이 현재 DB + TypeScript 규칙 기반 구조 위에서"라는 제약 안에서 설계한다
(spec.md §4 Out of Scope).

## §1. Requirement A/H — Evidence 스키마 확장 (Drizzle migration)

### 1.1 M1 신규 컬럼 — `issueTypes` 1개만 (외부 독립 리뷰 이슈 4 반영, research.md §4 근거)

`lib/db/schema.ts` `evidence` 테이블에 M1에서 추가하는 컬럼은 **1개뿐**이다:

```typescript
export const evidence = sqliteTable("evidence", {
  // ...기존 8개 컬럼 변경 없음...
  issueTypes: text("issue_types", { mode: "json" }).notNull().default("[]"),
});
```

- `issueTypes`는 `QueryIssueType[]`(8개 값의 부분집합)을 JSON 배열로 저장한다 — 별도 join 테이블을
  두지 않는다(evidence 1건이 여러 issueType에 걸칠 수 있음 — 예: 인과관계 판례가 동시에 기왕증
  쟁점도 다룰 수 있음). `.default("[]")`로 기존 10건 레코드가 마이그레이션 직후 빈 배열을 가지며,
  candidate eligibility/score 계산에서 issueType 가중치 0으로 안전하게 폴백한다(§2, 하위 호환).
- `keywords` 필드는 이 시점에 스키마에 추가하지 않는다(research.md §4 "보류") — run-phase M2가
  benchmark baseline을 측정한 뒤 실제로 substring 매칭 대비 이득이 있는지 확인하고서야 추가 여부를
  결정한다.

### 1.2 `sourceIdentifier`/`sourceDate` — 조건부 추가(M1에 포함하지 않음)

REQ-EVIDENCE-005/027 통합 조항에 따라, 이 두 컬럼은 M1 migration에 **사전 포함하지 않는다**.
run-phase 중 다음 조건을 만족하는 시점에만 별도 migration으로 추가한다:

- `sourceIdentifier`: §6(dedup 판정) 또는 §5.2(authenticity 재감사)의 실제 소비 코드가 설계·구현된
  이후에만 추가한다 — 추가 시점에 그 코드가 실제로 `sourceIdentifier`를 읽어 source-integrity
  검증 또는 dedup 판정을 수행함을 acceptance.md AC로 검증해야 한다(단순 존재 여부 구조 검증만으로는
  REQ-EVIDENCE-005를 충족하지 못한다).
- `sourceDate`: "있으면 좋은 metadata"라는 이유만으로 추가하지 않는다 — ranking/benchmark/authenticity
  어느 코드 경로도 이 SPEC 범위에서 `sourceDate`를 소비하지 않으므로, 현재 계획으로는 이번 SPEC에서
  전혀 추가되지 않을 수 있다(§C 소비처가 실제로 필요하다고 판명되면 별도 migration).

### 1.3 Migration 절차

`drizzle-kit generate`로 SQL migration 파일을 생성해 `drizzle/` 아래 커밋한다(기존 SPEC-RUNTIME-001의
migration 방식과 동일 — `pnpm db:migrate`가 추적 테이블 기준으로 안전하게 재실행 가능). ALTER
TABLE ADD COLUMN만 사용하며(SQLite 제약상 컬럼 삭제/타입 변경은 이 SPEC에서 하지 않음), 기존
행 데이터는 변경하지 않는다. `sourceIdentifier`/`sourceDate`가 §1.2 조건을 만족해 추가되는 경우,
그 시점에 별도 migration 파일을 생성한다 — M1의 단일 migration에 미리 끼워 넣지 않는다.

### 1.4 `EvidenceCandidate`/`EvidenceSeedRecord` 타입 확장

`lib/pipeline/types.ts`의 `EvidenceCandidate`에 `issueTypes: QueryIssueType[]` 필드를 추가한다
(nullable 아님 — DB `.default("[]")`가 항상 배열을 보장하므로). `scripts/db-seed.ts`의
`EvidenceSeedRecord` interface와 upsert `values`/`set` 양쪽에 `issueTypes` 1개 신규 필드를
추가한다 — 기존 `onConflictDoUpdate` 패턴을 그대로 확장(REQ-EVIDENCE-004). `sourceIdentifier`/
`sourceDate`가 §1.2 조건에 따라 추가될 경우 그 시점에 동일한 패턴으로 확장한다.

## §2. Requirement C — Retriever 쟁점 중심 Ranking

### 2.1 candidate eligibility(관련성 판정 술어) — 전략 A/B 비교 (외부 독립 리뷰 이슈 1 전면 재설계)

**이전 설계의 결함**: candidate eligibility(어떤 evidence가 애초에 top-K 정렬 대상에 들어가는가)를
현행 구조로 사전에 고정하고 issueType을 정렬(ranking)에만 쓰면, exact-issueType-match evidence라도
`query.focus`나 고정 keyword 문자열이 `title`/`content`에 없으면 **후보 집합에 진입조차 못한다** —
score를 아무리 잘 설계해도 애초에 candidate 목록에 없는 evidence는 정렬될 기회가 없다. 이번 SPEC의
목표가 쟁점 중심 retrieval이므로, 이 결함은 사전에 고칠 대상이지 감수할 trade-off가 아니다.

**설계**: run-phase M2는 동일 corpus·동일 벤치마크(§3)로 최소 두 전략을 비교해야 한다 —
design.md 시점에는 어느 쪽도 확정하지 않는다(REQ-EVIDENCE-008):

```typescript
// 전략 A — 현행 (baseline)
function relevantA(domainMatch: boolean, isUniversal: boolean, keywordScore: number): boolean {
  return isUniversal ? keywordScore > 0 : domainMatch && keywordScore > 0;
}

// 전략 B — 최소 확장안 (issueType을 eligibility에도 반영)
function relevantB(
  domainMatch: boolean,
  isUniversal: boolean,
  keywordScore: number,
  issueTypeExactMatch: boolean
): boolean {
  return isUniversal
    ? keywordScore > 0 || issueTypeExactMatch
    : domainMatch && (keywordScore > 0 || issueTypeExactMatch);
}
```

- 두 전략 모두 `domainMatch`(UNIVERSAL이 아닌 한) 요건은 유지한다 — 담보가 아예 다른 evidence까지
  끌어오지는 않는다.
- 전략 B는 keyword 매칭을 issueType exact match로 **OR 대체**할 수 있게 한다 — issueType 불일치를
  이유로 무조건 배제하는 hard filter(AND 방향의 강한 조건)는 도입하지 않는다(REQ-EVIDENCE-008 통합
  조항). `issueTypes`가 비어 있는 레코드(마이그레이션 직후 기존 10건 포함)는 `issueTypeExactMatch =
  false`로 자연 폴백하므로, 전략 B에서도 전략 A와 동일하게 동작한다(REQ-EVIDENCE-004 idempotency
  이후 회귀 없음과 정합).
- run-phase M2는 §3의 exploratory baseline 측정에서 전략 A/B 둘 다의 Recall@5를 측정해 채택 여부를
  결정한다 — design.md는 두 후보 구현을 제시할 뿐, 최종 채택은 §3.4의 실측 결과가 정한다.

### 2.2 score 함수 — issueType 가중치 (정렬, 채택된 전략 위에 적용)

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
  run-phase M2에서 §3 벤치마크로 검증하며, 벤치마크가 이 값을 정당화하지 못하면 조정한다 — 이
  design.md는 "출발점"을 제시하는 것이지 확정값을 강제하지 않는다.
- `issueTypes`가 비어 있는 레코드(마이그레이션 직후 기존 10건, 또는 아직 분류 안 된 신규 레코드)는
  `issueTypeWeight = 0`으로 자연 폴백한다 — 명시적 특수 케이스 분기 없이 `Array.includes()`가
  빈 배열에서 항상 `false`를 반환하는 것으로 충분하다.
- 이 score 함수는 §2.1이 채택한 전략(A 또는 B)이 반환한 candidate 집합 **위에서만** 정렬에
  적용된다 — eligibility(§2.1)와 ranking(§2.2)은 별개 단계이며, 전략 B를 채택해도 score 함수
  자체는 바뀌지 않는다(같은 정렬 로직을 candidate 진입 조건만 넓힌 집합에 적용).

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

### 3.3 지표 계산

```typescript
function recallAt5(candidates: EvidenceCandidate[], knownRelevantIds: string[]): number {
  const returned = new Set(candidates.map((c) => c.id));
  const hits = knownRelevantIds.filter((id) => returned.has(id)).length;
  return knownRelevantIds.length === 0 ? 1 : hits / knownRelevantIds.length;
}
```

### 3.4 측정 절차 — exploratory baseline과 frozen 최종 비교의 분리 (외부 독립 리뷰 이슈 2 반영)

**이전 설계의 결함**: M2(10건 corpus)에서 baseline/개선 측정 → M4(50~100건 corpus 확장) → 재측정
순서는, "ranking 알고리즘이 개선했다"는 효과와 "corpus가 커져서 개선됐다"는 효과를 하나의 최종
수치에 섞어버린다. 두 효과는 서로 다른 원인이며 분리해서 보고해야 한다.

**설계 — 2단계 측정**:

1. **exploratory 단계(M2, 10건 corpus)**: §2.1의 전략 A/B, §2.2의 score 함수 적용/미적용 조합을
   현재 10건 corpus + §3.2 벤치마크로 측정한다. 이 수치는 알고리즘 방향을 결정하는 데만 쓰며,
   `.moai/reports/`에 **"exploratory"로 명시적으로 라벨링**해 기록한다 — 최종 acceptance threshold의
   근거로 직접 인용하지 않는다.
2. **frozen 최종 비교(M4 이후)**: M4가 corpus 확장을 마치면, 새로 추가된 relevant evidence를
   반영해 벤치마크 `knownRelevantEvidenceIds`를 사람이 검토(human review)해 갱신한다. 갱신이
   끝나면 그 시점의 corpus 스냅샷 + 벤치마크를 **freeze**한다(더 이상 수정하지 않는 고정 버전으로
   커밋). freeze된 corpus/벤치마크 위에서 `baselineRetriever`(전략 A + issueType 가중치 없음,
   현재 `main`의 알고리즘)와 `newRetriever`(M2가 채택한 전략 + score 함수)를 **동일 입력**으로
   실행해 비교한다. 이 frozen 비교 수치만이 acceptance threshold(REQ-EVIDENCE-014)의 근거다.

**보고 형식(REQ-EVIDENCE-030)** — `.moai/reports/`에 최소 다음 두 항목을 분리해 기록한다:

```
## Ranking 알고리즘 효과 (10건 corpus, exploratory)
baseline(전략A) Recall@5: ...
newRetriever(전략B+score) Recall@5: ...

## Corpus 확장 효과 (frozen 최종 corpus, N건)
baselineRetriever(frozen corpus) Recall@5: ...
newRetriever(frozen corpus) Recall@5: ...
```

acceptance threshold(예: "frozen corpus에서 평균 Recall@5 ≥ X")는 두 번째 표의 실측값을 본 뒤
acceptance.md 개정으로 확정한다 — design.md 시점에는 임의 숫자를 박아넣지 않는다.

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

### 4.3 A/B/C 결과 해석표 — **synthetic fixture 자신에 대해서만 유효** (외부 독립 리뷰 이슈 3 반영)

| A(corpus 존재) | B(Retriever 후보 포함) | C-전제(Skeptic 프롬프트 포함) | 해석 |
|:---:|:---:|:---:|------|
| ✅ | ✅ | ✅ | 이 fixture 사건에서 harness의 A/B/C-전제 3단계가 정상 동작함을 확인 — **fixture 진단 harness 자체의 self-test 결과** |
| ✅ | ❌ | — | (B 실패로 도달 불가) — fixture에서 top-K cutoff 또는 score 함수 로직에 결함이 있다는 신호(harness 버그) |
| ❌ | — | — | (A 실패로 도달 불가) — fixture corpus 구성 자체가 잘못됐다는 신호(fixture 버그, corpus 부족의 실제 증거 아님) |

**이 표는 fixture 자신이 정상 동작하는지 확인하는 self-test 결과이지, 2026-08-27/2026-08-28 실제
Gemini smoke의 원인 판정이 아니다.** "fixture에서 A✅/B✅/C-전제✅가 나왔으므로 실제 smoke의 A/B는
배제되고 C 또는 model behavior만 남는다"는 서술은 이 SPEC에서 금지한다(REQ-EVIDENCE-016) — fixture
evidence corpus는 실제 smoke가 쓴 production corpus의 그 시점 상태와 다를 수 있고, fixture query도
실제 smoke의 query와 다르기 때문에, fixture의 성공이 실제 smoke의 A/B 배제를 논리적으로 함의하지
않는다.

### 4.4 실제 smoke의 A/B를 좁히는 유일한 방법 — production snapshot replay (REQ-EVIDENCE-031)

실제 smoke의 원인 후보(corpus 부족/Retriever 후보 부족/Skeptic prompt semantics/model behavior)를
좁히려면, **fixture가 아니라 그 smoke가 실제로 사용한 입력을 재현**해야 한다:

```typescript
// 실제 smoke가 사용한 de-identified case/query snapshot이 안전하게 보존·재현 가능한 경우에만:
const replayCase = /* 실제 smoke 당시의 NormalizedCase (PII 없는 de-identified 형태로 보존된 경우) */;
const replayQueries = planQueries(replayCase);                          // 그 시점의 QueryPlanner 규칙
const replayCandidates = await retrieveEvidence(replayQueries, prodDb); // 그 시점의 production corpus
// → replayCandidates를 검사해 counter-relevant evidence가 실제로 candidate에 있었는지 직접 관측한다.
```

**전제조건**: 이 replay는 (a) 실제 smoke가 사용한 case/query가 de-identified 형태로 안전하게
보존돼 있고, (b) 그 시점의 production corpus 상태(또는 그 이후 corpus 변경분)를 재현할 수 있을
때만 수행한다. 두 조건 중 하나라도 만족하지 못하면 이 replay는 수행하지 않으며, 실제 smoke의
원인은 계속 "corpus/Retriever/prompt/model behavior 미확정"으로 문서에 남긴다 — fixture 결과로
그 미확정 상태를 임의로 해소하지 않는다.

## §5. Requirement A/F — Corpus 큐레이션 워크플로 (run-phase 절차, 코드 아님)

### 5.1 신규 record 큐레이션

1. spec.md REQ-EVIDENCE-001의 coverage matrix를 `.moai/docs/` 또는 `.moai/specs/SPEC-EVIDENCE-001/`
   내 별도 표로 먼저 작성 — 담보 × issueType 교차표(N/A 허용, §8), 각 셀의 현재 건수와 목표 건수.
2. research.md §3 후보 출처 카탈로그를 이번 SPEC의 run-phase 세션(WebSearch 또는 실제 등록된
   `law.go.kr` OC 키가 있는 세션)에서 실제로 조사 — 각 후보 레코드마다 (a) 원문 URL 접근 확인,
   (b) 사건번호/조문 번호가 원문과 일치하는지 확인, (c) content 요약이 과장 없이 원문 취지를
   반영하는지 확인(REQ-EVIDENCE-017) 후에만 `db/seed/evidence.json`에 추가.
3. `DISPUTE_CASE`(금융감독원 분쟁조정) 후보는 결정문 원문 또는 금융감독원 공식 공개 요약만
   허용 — 3자 블로그/카페의 재구성 요약은 원 출처로 인정하지 않는다(REQ-EVIDENCE-002).
4. 검증 불가능한 후보는 `evidenceType: "OTHER"`로 낮추거나 아예 제외한다 — "그럴듯하지만
   확인 안 됨"을 PRECEDENT/STATUTE/DISPUTE_CASE로 분류하지 않는다.

### 5.2 기존 production evidence 10건 재감사 (REQ-EVIDENCE-026, 외부 독립 리뷰 이슈 5)

**신규 record만 감사하는 것으로는 REQ-EVIDENCE-002의 authenticity 원칙이 반쪽짜리가 된다** —
`db/seed/evidence.json`의 기존 10건(research.md §1.1)도 동일 규칙으로, 예외 없이 재검토한다.

절차(각 레코드마다):

1. `sourceUrl`이 실제로 접근 가능한지 재확인(§0의 `curl` 검증 기법을 재사용 가능 — 이미
   `seed-evidence-005`/`seed-evidence-008`은 이번 plan-phase에서 재검증 완료, research.md §1.1).
2. `evidenceType`이 `PRECEDENT`/`STATUTE`/`DISPUTE_CASE`/`POLICY`인 레코드는 원문과 사건번호/조문
   번호/내용이 실제로 일치하는지 확인. `POLICY` 레코드(`seed-evidence-001`, `seed-evidence-003`)도
   예외 없이 포함 — 현재 `insclaim.co.kr`/`insu-fit.com` 같은 3자 블로그성 출처는 REQ-EVIDENCE-002의
   "신뢰 가능한 공공기관 자료" 기준을 만족하는지 재검토 대상이다.
3. `sourceIdentifier`가 필요한지(§1.2 조건) 이 레코드에 한해 개별 판단.
4. `content`가 원문 취지를 과장하지 않는지 재검토(REQ-EVIDENCE-017).
5. 위 검토를 통과하지 못하면, 그 레코드를 (a) `evidenceType: "OTHER"`로 downgrade하거나 (b)
   production corpus에서 제외하는 것 중 **하나를 명시적으로 결정**해 기록한다 — 판단을 유보한 채
   방치하지 않는다.

### 5.3 curated source-audit manifest (자동 테스트가 대신할 수 없는 부분의 기록 장치)

자동 테스트(acceptance.md AC-EVIDENCE-002)는 구조적으로 검증 가능한 것(`sourceUrl` 또는
`sourceIdentifier` 존재 여부)만 이진 판정할 수 있다 — "이 판례가 실제로 이렇게 판시했다"는 사실
자체의 진위는 자동화할 수 없다(사람 또는 run-phase 에이전트의 WebFetch가 대신 판단). 이 수작업
검증의 **결과**를 남기기 위해, 신규 파일 `.moai/reports/evidence-source-audit-manifest.md`(또는
동등한 구조화 문서)를 두고, production evidence 각 레코드마다 다음을 기록한다:

```
| id | evidenceType | sourceUrl 접근 확인일 | 원문 대조 결과 | 결정(유지/OTHER downgrade/제외) | 검토자 |
```

§D의 benchmark ground truth(`knownRelevantEvidenceIds`)는 이 manifest에서 "유지"로 결정된 evidence
id만 참조할 수 있다(REQ-EVIDENCE-013 개정판).

## §6. Requirement F — 중복(duplicate) 판정 규칙 (REQ-EVIDENCE-018 개정, 외부 독립 리뷰 이슈 6)

**이전 설계의 결함**: "동일 source의 record들은 issueTypes 교집합이 비어야 한다"는 규칙은 너무
강하다 — 하나의 판례가 인과관계(`CAUSATION`)와 장해 평가 기준(`DISABILITY_GRADE_CRITERIA`) 두
쟁점을 동시에 다루면서도 서로 다른 proposition을 진술하는 것은 정상이며, 이런 경우를 issueType
겹침만으로 "중복"이라 판정하면 정당한 레코드를 강제로 병합/삭제하게 된다.

**설계 — sourceIdentifier/sourceUrl + 정규화된 content 비교**:

```typescript
function normalizeForDuplicateCheck(content: string): string {
  return content.replace(/\s+/g, " ").trim(); // 공백/개행 정규화만 — 의미 판정 아님
}

function isDuplicate(a: EvidenceCandidate, b: EvidenceCandidate): boolean {
  const sameSource =
    (a.sourceIdentifier && a.sourceIdentifier === b.sourceIdentifier) ||
    (a.sourceUrl && a.sourceUrl === b.sourceUrl);
  if (!sameSource) return false;
  return normalizeForDuplicateCheck(a.content) === normalizeForDuplicateCheck(b.content);
}
```

- 같은 source에서 나온 두 레코드라도 `content`가 실질적으로 다르면(서로 다른 proposition) 중복이
  아니다 — `issueTypes` 겹침 여부는 이 판정에 전혀 관여하지 않는다.
- LLM 기반 semantic equivalence 자동 판정 시스템은 만들지 않는다(spec.md §4 Out of Scope 정신
  확장) — 공백/개행 정규화 수준의 최소 문자열 비교만 사용한다. 문자열은 다르지만 의미가 같은
  진짜 중복(paraphrase)은 이 규칙으로 잡히지 않을 수 있으며, 이는 §5.3 manifest의 사람 검토
  단계에서 보완한다(자동화 범위 밖임을 명시).
- `sourceIdentifier`가 아직 스키마에 없는 경우(§1.2), 이 판정은 `sourceUrl` 동일성만으로 동작한다
  — `sourceIdentifier` 도입 이전에도 최소 형태로 유효하다.

## §7. Coverage Matrix — `N/A` 셀 허용 (REQ-EVIDENCE-001 개정, 외부 독립 리뷰 이슈 7)

두 담보 × 8개 issueType = 16칸은 §5.1의 coverage matrix 표에 전부 유지한다 — 칸 자체를 지우지
않는다(추적 가능성 보존). 다만 `lib/pipeline/query-planner.ts`가 실제로 그 조합을 생성하지 않거나
(예: 특정 도메인에서 의미상 발생하지 않는 issueType 조합), 도메인 의미상 그 issueType이 해당
담보에 적용되지 않는 경우, 그 셀은 `N/A`로 명시하고 목표 건수를 배정하지 않는다. `N/A` 판정 근거는
`query-planner.ts`의 실제 조건부 트리거 로직(research.md §1.3)을 대조해 문서화한다 — "귀찮아서
N/A"가 아니라 "QueryPlanner가 이 조합을 애초에 생성하지 않는다"는 코드 근거가 있어야 한다. coverage
목표는 `N/A`가 아닌 셀 중에서도, 실제 사건에서 자주 발생할 것으로 예상되는(제품적으로 의미 있는)
조합을 우선한다.

## §8. Out of Scope 경계 재확인

vector DB/embedding/Elasticsearch 미도입 확인: §2의 candidate eligibility/ranking은 순수 TypeScript
산술/불리언 함수이며 외부 검색 엔진 의존성을 추가하지 않는다. crawler/자동 스크래핑 미도입 확인:
§5의 큐레이션(신규 record와 기존 10건 재감사 모두)은 사람(또는 run-phase 에이전트의 개별 WebFetch
호출)이 각 레코드를 검토하는 수작업 절차이며 자동 대량 수집 스크립트를 만들지 않는다.
microservice/Redis/BullMQ 미도입 확인: 모든 변경은 기존 Next.js monorepo 안의 `lib/pipeline/`,
`lib/db/`에 머문다. LLM 기반 semantic dedup 미도입 확인: §6의 중복 판정은 문자열 정규화만 쓴다.
