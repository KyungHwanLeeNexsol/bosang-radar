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

### 1.2 `sourceIdentifier`/`sourceDate` — 기본값은 "추가하지 않는다" (외부 독립 리뷰 v0.3.0 이슈 7 재단순화)

REQ-EVIDENCE-006/027(027은 v0.2.0 당시 병합되어 현재 사용되지 않는 구 번호) 통합 조항에 따라, 이 두 컬럼은 M1 migration에 **사전 포함하지 않는다**. 이번
개정(v0.3.0)은 여기서 한 걸음 더 나아가, `sourceIdentifier`의 기본 입장 자체를 **"불필요하면
아예 추가하지 않는다"**로 재단순화한다 — v0.2.0은 "조건 충족 시 추가"로만 서술해 마치 추가가
거의 확정적인 것처럼 읽혔지만, §6의 `isDuplicate()`가 이미 `sourceUrl` 단독으로도 동작하도록
설계돼 있다(§6 원문: "이 SPEC의 기본 구현은 `sourceIdentifier` 컬럼을 도입하지 않으므로,
`isDuplicate()`는 `sourceUrl` 동일성만으로 동작한다"). 즉 dedup이라는 유일한 실제 소비처 후보가 **이미 `sourceIdentifier` 없이도 충족**되므로,
불필요한 두 번째 migration을 미리 예고할 이유가 없다.

- `sourceIdentifier`: **기본적으로 추가하지 않는다.** run-phase 중 `sourceUrl` + 정규화된
  `content` 동일성(§6)만으로 dedup 요구를 실제로 충족하는지 M5에서 먼저 검증하고, 그것으로
  충분하면 이 컬럼은 이 SPEC에서 끝까지 추가되지 않는다. 오직 §6 또는 §5.2(authenticity 재감사)에서
  `sourceUrl`만으로는 해결할 수 없는 실제 필요(예: 동일 판례가 여러 `sourceUrl`로 미러링돼
  `sourceUrl` 동일성 판정이 무력화되는 사례가 실측으로 발견되는 경우)가 명확히 입증된 경우에만
  별도 migration으로 추가하며, 추가 시점에 그 코드가 실제로 `sourceIdentifier`를 읽어
  source-integrity 검증 또는 dedup 판정을 수행함을 acceptance.md AC로 검증해야 한다(단순 존재
  여부 구조 검증만으로는 REQ-EVIDENCE-006를 충족하지 못한다).
- `sourceDate`: "있으면 좋은 metadata"라는 이유만으로 추가하지 않는다 — ranking/benchmark/authenticity
  어느 코드 경로도 이 SPEC 범위에서 `sourceDate`를 소비하지 않으므로, 현재 계획으로는 이번 SPEC에서
  전혀 추가되지 않는다(§C 소비처가 실제로 필요하다고 판명되면 별도 migration, 후속 SPEC 범위일
  가능성이 높다).

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

### 1.4a `QueryIssueType` 8개 값의 단일 SSOT (optional 일관성 검토, 외부 독립 리뷰 잔여 정합성 이슈 4)

현재 `QueryIssueType`은 `lib/pipeline/types.ts`에 8개 리터럴 유니온으로 직접 선언돼 있고,
§1.5의 zod 스키마는 동일한 8개 값을 별도 리터럴 배열로 다시 선언한다 — 두 선언이 물리적으로
분리돼 있어 한쪽만 수정되면 drift가 발생할 수 있다. 이 SPEC은 `lib/pipeline/types.ts`를
아래처럼 const-first로 바꿔 이 위험을 없앤다(신규 파일 없음, 순수 타입 리팩터 — 과설계 아님):

```typescript
// lib/pipeline/types.ts
export const QUERY_ISSUE_TYPES = [
  "DISABILITY_LOCATION", // 장해 부위
  "DIAGNOSIS", // 진단명
  "INCIDENT_CIRCUMSTANCE", // 사고 경위
  "INJURY_DISEASE_RELATION", // 상해·질병 관련성
  "DISABILITY_GRADE_CRITERIA", // 장해 평가 기준 검토
  "PRE_EXISTING_CONDITION", // 기왕증·퇴행성 가능성
  "CAUSATION", // 인과관계 쟁점
  "ADDITIONAL_CONFIRMATION_NEEDED", // 추가 확인 필요 조건
] as const;

export type QueryIssueType = (typeof QUERY_ISSUE_TYPES)[number];
```

`db/seed/evidence-seed-schema.ts`(§1.5)는 이 `QUERY_ISSUE_TYPES`를 import해서 zod enum에
그대로 쓰며, 8개 값을 별도로 하드코딩하지 않는다. 이 변경은 기존 subagent boundary나 기존
파일 경계를 깨지 않으며(`lib/pipeline/types.ts`는 이미 M1이 편집 대상으로 계획한 파일), 타입
사용처(`ResearchQuery.issueType`, `EvidenceCandidate.issueTypes` 등)는 `QueryIssueType`
타입 이름을 그대로 참조하므로 다른 코드는 변경할 필요가 없다.

### 1.5 production seed loading 시 runtime validation (REQ-EVIDENCE-007 보강, 외부 독립 리뷰 v0.3.0 이슈 2)

**왜 TypeScript 타입만으로 부족한가**: `issueTypes`는 전략 B(§2.1)에서 keyword가 전혀 없어도
candidate eligibility를 성립시킬 수 있는 **강한** retrieval signal이다 — 값이 잘못되면(예:
`QueryIssueType`에 없는 임의 문자열, 또는 오분류된 issueType) 조용히 잘못된 evidence를 후보로
끌어올린다. 그런데 현재 `scripts/db-seed.ts`(`loadSeedRecords()`)는 `JSON.parse(readFileSync(...))
as EvidenceSeedRecord[]`로 **타입 단언(assertion)만** 수행한다 — TypeScript 타입은 컴파일 타임
구조일 뿐 런타임에는 아무 검사도 하지 않으므로, `db/seed/evidence.json`에 실수로 잘못된 값이
들어가도 `as` 단언은 그것을 조용히 통과시키고 DB에 그대로 insert된다.

**설계 — 기존 `lib/validation/case-input.ts` 패턴을 재사용한 최소 zod 스키마** (신규 라이브러리
도입 없음, `zod`는 이미 프로젝트 의존성):

```typescript
// db/seed/evidence-seed-schema.ts (신규, 최소)
import { z } from "zod";
import { QUERY_ISSUE_TYPES } from "../../lib/pipeline/types.ts"; // 8개 값의 단일 SSOT(§1.4a) — 별도 리터럴 배열을 여기 두지 않는다

const EVIDENCE_TYPES = ["POLICY", "PRECEDENT", "DISPUTE_CASE", "STATUTE", "OTHER"] as const;
const SCOPES = ["DOMAIN_SPECIFIC", "UNIVERSAL"] as const;
const CATEGORIES = ["상해후유장해", "질병후유장해", "공통"] as const;

export const evidenceSeedRecordSchema = z
  .object({
    id: z.string().min(1),
    category: z.enum(CATEGORIES),
    evidenceType: z.enum(EVIDENCE_TYPES),
    scope: z.enum(SCOPES),
    title: z.string().min(1),
    content: z.string().min(1),
    sourceUrl: z.union([z.null(), z.string().url()]),
    issueTypes: z.array(z.enum(QUERY_ISSUE_TYPES)),
  })
  .refine((r) => new Set(r.issueTypes).size === r.issueTypes.length, {
    message: "issueTypes에 중복 값이 있습니다",
  })
  .refine((r) => !(r.scope === "UNIVERSAL" && r.category !== "공통"), {
    message: "scope=UNIVERSAL이면 category는 '공통'이어야 합니다(명백한 불일치)",
  })
  .refine((r) => !(r.scope === "DOMAIN_SPECIFIC" && r.category === "공통"), {
    message: "scope=DOMAIN_SPECIFIC이면 category는 특정 담보여야 합니다(명백한 불일치)",
  });

export const evidenceSeedFileSchema = z.array(evidenceSeedRecordSchema);
```

- `sourceUrl`은 `null` 또는 `z.string().url()`만 허용 — 빈 문자열이나 형식이 아닌 문자열은
  거부한다.
- `scope`/`category` 불일치 검증은 "명백한" 경우만 다룬다(UNIVERSAL인데 특정 담보 category이거나,
  DOMAIN_SPECIFIC인데 공통 category인 경우) — 이 이상의 정교한 상호 검증은 이번 SPEC 범위 밖이다
  (overengineering 회피).
- `scripts/db-seed.ts`의 `loadSeedRecords()`가 `JSON.parse(...) as EvidenceSeedRecord[]` 대신
  `evidenceSeedFileSchema.parse(JSON.parse(...))`를 쓰도록 변경한다 — 검증 실패 시 zod가
  `ZodError`를 던지고, `runSeed()`는 **이 예외를 잡아 DB insert를 전혀 시도하지 않고 fail-fast**한다
  (부분 insert 없음 — 파일 전체가 유효해야 seed가 진행된다).
- 이 스키마는 `db/seed/evidence.json`(production)에만 적용한다 — benchmark/diagnostic fixture는
  이 검증 대상이 아니다(REQ-EVIDENCE-003이 이미 물리적으로 분리를 보장).

## §2. Requirement C — Retriever 쟁점 중심 Ranking

### 2.1 candidate eligibility(관련성 판정 술어) — 전략 A/B 비교 (외부 독립 리뷰 이슈 1 전면 재설계)

**이전 설계의 결함**: candidate eligibility(어떤 evidence가 애초에 top-K 정렬 대상에 들어가는가)를
현행 구조로 사전에 고정하고 issueType을 정렬(ranking)에만 쓰면, exact-issueType-match evidence라도
`query.focus`나 고정 keyword 문자열이 `title`/`content`에 없으면 **후보 집합에 진입조차 못한다** —
score를 아무리 잘 설계해도 애초에 candidate 목록에 없는 evidence는 정렬될 기회가 없다. 이번 SPEC의
목표가 쟁점 중심 retrieval이므로, 이 결함은 사전에 고칠 대상이지 감수할 trade-off가 아니다.

**설계**: run-phase M2는 동일 corpus·동일 벤치마크(§3)로 최소 두 전략을 비교해야 한다 —
design.md 시점에는 어느 쪽도 확정하지 않는다(REQ-EVIDENCE-009):

```typescript
// 전략 A — 현행 (eligibility는 M4d baseline과 동일 — design.md §3.4A `trueBaselineEligible()` 참고.
// **score 함수는 별개다** — §2.2 참고. 전략 A의 candidate eligibility 자체는 M4d baseline
// eligibility와 같지만, "전략 A"라는 이름이 M4d의 baseline **score** 함수까지 가리킨다고
// 오해해서는 안 된다(외부 독립 리뷰 측정방법론 이슈 1).
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
  이유로 무조건 배제하는 hard filter(AND 방향의 강한 조건)는 도입하지 않는다(REQ-EVIDENCE-009 통합
  조항). `issueTypes`가 비어 있는 레코드(마이그레이션 직후 기존 10건 포함)는 `issueTypeExactMatch =
  false`로 자연 폴백하므로, 전략 B에서도 전략 A와 동일하게 동작한다(REQ-EVIDENCE-004 idempotency
  이후 회귀 없음과 정합).
- run-phase M2는 §3의 exploratory baseline 측정에서 전략 A/B 둘 다의 Recall@5를 측정해 채택 여부를
  결정한다 — design.md는 두 후보 구현을 제시할 뿐, 최종 채택은 §3.4의 실측 결과가 정한다.
- **M2 vs M4d의 "baseline" 용어 구분(외부 독립 리뷰 측정방법론 이슈 1)**: 위 `relevantA()`는 §3.4A가
  정의하는 M4d의 `trueBaselineEligible()`과 **동일한 식**이다(eligibility는 변경되지 않는다). 다만
  M2의 탐색적 전략 A/B 비교는 §2.2의 `computeScore()`(issueTypeWeight 포함)를 전략 A/B **양쪽에
  동일하게** 적용해 eligibility 효과만 격리한다 — 이는 M2 단계에서만 유효한 의도적 단순화다. 반면
  M4d의 baseline은 issueTypeWeight를 전혀 참조하지 않는 별도의 `trueBaselineScore()`(§3.4A)를
  사용해야 한다. "전략 A = baseline"이라는 이름은 eligibility에만 해당하며, score 함수까지 두
  맥락에서 같다고 가정해서는 안 된다.

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
  evidence"보다 항상 위에 오도록 한다(REQ-EVIDENCE-010 회귀 방지의 설계 근거). 정확한 값(10)은
  run-phase M2에서 §3 벤치마크로 검증하며, 벤치마크가 이 값을 정당화하지 못하면 조정한다 — 이
  design.md는 "출발점"을 제시하는 것이지 확정값을 강제하지 않는다.
- `issueTypes`가 비어 있는 레코드(마이그레이션 직후 기존 10건, 또는 아직 분류 안 된 신규 레코드)는
  `issueTypeWeight = 0`으로 자연 폴백한다 — 명시적 특수 케이스 분기 없이 `Array.includes()`가
  빈 배열에서 항상 `false`를 반환하는 것으로 충분하다.
- 이 score 함수는 §2.1이 채택한 전략(A 또는 B)이 반환한 candidate 집합 **위에서만** 정렬에
  적용된다 — eligibility(§2.1)와 ranking(§2.2)은 별개 단계이며, 전략 B를 채택해도 score 함수
  자체는 바뀌지 않는다(같은 정렬 로직을 candidate 진입 조건만 넓힌 집합에 적용).
- **M2 exploratory scoring — NOT the M4d baseline function(외부 독립 리뷰 측정방법론 이슈 1 —
  §2.2/§3.4 내적 모순 수정)**: 위 `computeScore()`는 M2의 탐색적 전략 A/B 비교에서 **두 전략
  모두에 동일하게 적용**되는 M2 exploratory scoring function이다 — eligibility(§2.1)만 다르게
  하고 score 함수는 고정해, "eligibility 변경의 효과"만 격리해서 관측하기 위한 의도적 설계다(원래
  design 의도, 변경 없음). **이 `computeScore()`는 §3.4A의 M4d(algorithm effect) 최종 비교에서
  `baselineRetriever`가 사용하는 함수가 아니다** — M4d의 baseline은 `evidence.issueTypes`를 전혀
  참조하지 않는(구조적으로 참조할 수 없는) 별도 함수 `trueBaselineScore()`(§3.4A)를 사용해야 한다.
  이 두 함수(`computeScore()` vs `trueBaselineScore()`)를 혼동하는 것은 §2.2가 M4d의 baseline
  정의(§3.4가 명시하는 "issueType 가중치 없음")와 내적으로 모순되게 읽히던 결함의 원인이었다 —
  이 절이 그 모순을 해소한다. Production `retrieveEvidence()`(실제 파이프라인이 호출하는 경로)는
  항상 채택된 전략(§2.1) + 이 `computeScore()`를 사용하며, `trueBaselineScore()`/
  `trueBaselineEligible()`은 §3.4A의 M4d 벤치마크 비교 **전용**이고 production 코드 경로에는
  존재하지 않는다.

### 2.3 결정론적 정렬 (tie-break)

```typescript
.sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))
```

동점일 때 `id` 오름차순으로 고정한다(REQ-EVIDENCE-012). `TOP_N = 5`는 변경하지 않는다
(REQ-EVIDENCE-011) — run-phase M2가 벤치마크로 조정 필요성을 판단한 뒤에만 바꾼다.

## §3. Requirement D — Curated Retrieval Benchmark

### 3.1 파일 위치와 형태

신규 파일 `lib/pipeline/evidence-retriever.benchmark.test.ts`(또는 `db/seed/evidence-benchmark.json`
+ 이를 로드하는 테스트) — vitest 테스트로 실행되며 `pnpm test`에 포함된다(별도 CI 파이프라인
신설 안 함, spec.md §4 Out of Scope).

```typescript
interface BenchmarkCase {
  id: string;                    // "bm-injury-causation-01" 형태
  query: ResearchQuery;          // 고정 쟁점 쿼리(합성이지만 REQ-EVIDENCE-015 대상 아님 — query 자체는 evidence가 아님)
  knownRelevantEvidenceIds: string[]; // production evidence corpus의 실제 id 부분집합(REQ-EVIDENCE-015)
}
```

### 3.1a M2 exploratory benchmark corpus 불변성 (외부 독립 리뷰 측정방법론 이슈 2, REQ-EVIDENCE-014 범위)

**결함**: M2의 탐색적 벤치마크(§3.2)는 `db/seed/evidence.json`을 **라이브(live)로 import**해서 구현될
위험이 있다 — 실제로 M2 milestone이 `evidence-retriever.benchmark.test.ts`에서
`import evidenceSeed from "../../db/seed/evidence.json"`로 구현됐다(progress.md §E.2 M2). 그런데
M4(§5)가 이 파일을 계속 확장하므로(M1 시점 10건 → M4 파일럿 시점 19건 → M4 전체 확장 목표
50~100건), 이 벤치마크 테스트를 재실행할 때마다 "M2 exploratory 10건 baseline"이라고 progress.md에
기록된 수치가 실제로는 그 시점의 현재 corpus 크기를 측정하는 것으로 **조용히 바뀐다** — 과거에
기록된 측정값이 재현 불가능해진다.

**설계 — 물리적으로 별도인 불변(immutable) fixture 스냅샷을 사용한다**: `evidence-retriever.benchmark.test.ts`
(§3.1)는 M1 완료 시점의 10건 corpus를 그대로 얼린(freeze) 별도 파일 또는 인라인 배열을 사용해야
하며, `db/seed/evidence.json`에 대한 라이브 `import`를 포함해서는 안 된다. 허용되는 형태:

- 신규 파일 `lib/pipeline/__fixtures__/evidence-m2-baseline-snapshot.json`(M1 완료 시점
  `db/seed/evidence.json` 10건을 그대로 복사한 정적 스냅샷), 또는
- 벤치마크 테스트 파일 안에 하드코딩된 인라인 `EvidenceCandidate[]` 배열(fixture 데이터를 코드에
  직접 선언).

어느 형태든 이 스냅샷은 M4 이후 production seed가 계속 확장돼도 **절대 갱신되지 않는다** — M2
exploratory 측정의 재현성을 보장하는 것이 유일한 목적이다.

**M4d의 frozen 최종 비교(§3.4A)와 혼동 금지**: M4d는 이와 **반대로** M4c에서 freeze된 **최종**
production corpus(50~100건 목표)를 사용해야 한다 — 이것은 의도적으로 다른 종류의 불변성(최종
시점 고정)이며, M2의 불변성(M1 시점 10건 고정)과 목적이 다르다. 둘 다 "불변"이지만 서로 다른
corpus 스냅샷을 가리키며, 하나로 대체할 수 없다.

**기존 위반에 대한 조치**: 이 요건을 위반한 채(라이브 import로) 이미 기록된 과거 M2 측정값(progress.md
§E.2 M2의 "전략 A/B 채택 결정" 수치)은, run-phase가 위 불변 스냅샷을 도입한 뒤 "이후 corpus 확장의
영향을 받음 — 불변 스냅샷 기준 재측정 필요"로 재라벨링해야 한다 — 이 재측정 자체는 코드 변경을
수반하는 run-phase/orchestrator 작업이며, 이 design.md 개정은 그 재측정이 따라야 할 요건만 명시한다.

### 3.2 커버리지 (REQ-EVIDENCE-014)

최소 6개 케이스: 두 담보(INJURY_DISABILITY/DISEASE_DISABILITY) × {CAUSATION,
DISABILITY_GRADE_CRITERIA, DIAGNOSIS 또는 DISABILITY_LOCATION} 조합에서 각 담보당 3개, 총
6개 — 여기에 기왕증/퇴행성(`PRE_EXISTING_CONDITION`) 케이스 1개를 추가해 총 7개 이상.

### 3.3a 지표 계산 — Recall@5 / Hit@5 / Precision@5 (외부 독립 리뷰 v0.3.0 이슈 4 반영)

**Recall@5만으로는 부족한 이유**: 이번 SPEC의 전략 B(§2.1)는 candidate eligibility 자체를
넓힌다(keyword가 없어도 issueType exact match만으로 candidate에 진입 가능) — eligibility를
넓히면 recall이 오르는 대신 관련 없는 evidence가 섞여 들어와 precision이 떨어질 위험이 구조적으로
존재한다. Recall@5만 보고 전략 A/B를 선택하면 이 위험을 놓친다.

```typescript
function recallAt5(candidates: EvidenceCandidate[], knownRelevantIds: string[]): number {
  const returned = new Set(candidates.map((c) => c.id));
  const hits = knownRelevantIds.filter((id) => returned.has(id)).length;
  return knownRelevantIds.length === 0 ? 1 : hits / knownRelevantIds.length;
}

function hitAt5(candidates: EvidenceCandidate[], knownRelevantIds: string[]): 0 | 1 {
  const returned = new Set(candidates.map((c) => c.id));
  return knownRelevantIds.some((id) => returned.has(id)) ? 1 : 0;
}

function precisionAt5(candidates: EvidenceCandidate[], knownRelevantIds: string[]): number {
  const knownRelevant = new Set(knownRelevantIds);
  const relevantReturned = candidates.slice(0, 5).filter((c) => knownRelevant.has(c.id)).length;
  return relevantReturned / 5; // 표준 정의로 통일 — top-5 슬롯 중 relevant 수 / 5(외부 독립 리뷰 잔여 정합성 이슈 2). 실제 반환 개수를 분모로 쓰는 대안(Precision@Returned)은 채택하지 않는다.
}
```

세 지표 모두 §3.4A의 frozen 최종 비교에서 **함께** 측정·기록한다 — Recall@5만 보고하고 Precision@5를
누락하지 않는다. **이 지표가 유효하려면 `knownRelevantEvidenceIds`가 해당 query에 대한 complete
human-reviewed relevance set이어야 한다(REQ-EVIDENCE-015, REQ-EVIDENCE-017 completeness 조건, §3.4A)** —
completeness가 확보되지 않은 benchmark case의 Precision@5는 exploratory 참고용으로만 쓰고 최종
acceptance 근거로 사용하지 않는다.

### 3.3b Non-regression 계약 — 결과에 맞춘 사후 retrofit 금지 (외부 독립 리뷰 v0.3.0 이슈 4 반영)

design.md 시점(baseline 측정 전)에는 임의의 절대 숫자(예: "Recall@5 ≥ 0.8")를 정하지 않는다.
대신 **상대적 non-regression 계약**을 plan 단계에서 미리 정해 둔다 — 권고 기본값:

```
new(전략B) Recall@5    >= baseline(전략A) Recall@5
new(전략B) Hit@5       >= baseline(전략A) Hit@5
new(전략B) Precision@5 >= baseline(전략A) Precision@5
```

그리고 REQ-EVIDENCE-013가 지정한 타깃 케이스("exact issueType이지만 query keyword가 없는
known-relevant evidence")에서는, baseline이 miss(recall 실패)하고 new가 hit(recall 성공)하는
것이 **실제로 관측**되어야 한다 — 이것이 §2.1 candidate eligibility 재설계의 존재 이유이므로,
관측되지 않으면 전략 B 채택 근거 자체가 무너진다.

**결과가 이 계약을 만족하지 못하면(예: new Precision@5 < baseline Precision@5인 recall/precision
trade-off가 실제로 관측되면), 그 결과에 맞춰 threshold를 낮추거나 계약을 조용히 수정해 PASS로
만들지 않는다.** 대신 다음 중 하나를 사람이 명시적으로 판단해 acceptance.md/progress.md에
기록한다: (a) `issueTypeWeight`(§2.2, 현재 10) 등 score 함수 파라미터를 재조정해 trade-off를
줄인다, (b) trade-off를 감수할 가치가 있다는 근거(예: "recall 개선폭이 precision 하락폭보다
제품적으로 더 중요하다")를 명시적으로 문서화하고 계약을 의도적으로 완화한다. 두 경우 모두
"측정 후 자동 조정"이 아니라 "측정 결과를 보고 사람이 내린 결정"임을 기록에 남긴다. **(b)로 계약을 완화하기로 결정한 경우, 그렇게 변경된 acceptance 계약(REQ-EVIDENCE-016/AC-EVIDENCE-014)은 plan-auditor 재검토 대상이다** — trade-off 수용 판단 자체가 SPEC의 acceptance 기준을 바꾸는 결정이므로, 독립 감사 없이 조용히 확정하지 않는다(외부 독립 리뷰 잔여 정합성 이슈 1).

**M2 exploratory(10건 corpus)는 방향 탐색용이며 acceptance 근거가 아니다 — M4 frozen benchmark만이
최종 acceptance다.** 이 구분은 §3.4에서 이어진다.

### 3.4 측정 절차 — Algorithm effect와 Corpus expansion effect의 정확한 분리 (외부 독립 리뷰 v0.3.0 이슈 1 반영)

**v0.2.0의 남은 개념 오류**: v0.2.0은 "M2(10건) exploratory"와 "M4 이후 frozen 최종 비교"를
분리했지만, 그 frozen 비교(**동일한** frozen corpus 위에서 `baselineRetriever` vs `newRetriever`를
비교)를 "Corpus 확장 효과"라고 잘못 명명했다 — corpus는 두 실행 모두 **동일**(frozen 최종
corpus)하고 바뀐 것은 **알고리즘**뿐이므로, 이 비교가 실제로 측정하는 것은 "최종 corpus에서의
algorithm effect"다. "corpus 확장 효과"라는 이름은 이 비교가 corpus 크기 변화의 효과를 측정하는
것처럼 오독하게 만든다.

**설계 — 두 효과를 서로 다른 측정 방법으로 분리**:

#### A. Algorithm effect (frozen 최종 corpus, 동일 corpus 위에서 알고리즘만 교체)

M4가 corpus 확장 + 재감사를 마치면, 각 `BenchmarkCase`의 query에 대해 **freeze 대상 production
corpus 전체를 검토하여** relevant로 판정된 evidence의 **complete human-reviewed set**으로
`knownRelevantEvidenceIds`를 확정하고(일부 예시적 evidence만 반영한 부분 집합이어서는 안 됨 —
REQ-EVIDENCE-015, REQ-EVIDENCE-017 completeness 조건, 외부 독립 리뷰 잔여 정합성 이슈 2), 그 시점의 corpus
스냅샷 + 벤치마크를 **freeze**한다(더 이상 수정하지 않는 고정 버전으로 커밋). **동일한** freeze된 corpus +
**동일한** freeze된 `BenchmarkCase` + **동일한** `knownRelevantEvidenceIds` 위에서
`baselineRetriever`(전략 A, issueType 가중치 없음, 현재 `main`의 알고리즘)와 `newRetriever`(M2가
채택한 전략 + score 함수)를 실행해 Recall@5 / Hit@5 / Precision@5(§3.3a)를 비교한다. **이것이
"algorithm effect"이며, acceptance threshold(REQ-EVIDENCE-016)의 유일한 근거다.** 이 completeness 검토가 이루어지지 않았다면, 그 BenchmarkCase의 Precision@5는 최종 acceptance 판단에 사용하지 않는다(§3.3a).

**`baselineRetriever`/`newRetriever`의 정확한 정의 (외부 독립 리뷰 측정방법론 이슈 1 — §2.2와
분리된 별도 함수, `computeScore()`/`relevantB()`와 이름을 다르게 두어 혼동을 원천 차단한다)**:

```typescript
// M4d baseline 전용 — §2.2의 computeScore()/§2.1의 relevantB()와 절대 혼동하지 않는다.
// production retrieveEvidence()의 코드 경로에는 존재하지 않는다(M4d 벤치마크 비교 전용).
function trueBaselineEligible(
  domainMatch: boolean,
  isUniversal: boolean,
  keywordScore: number
): boolean {
  return isUniversal ? keywordScore > 0 : domainMatch && keywordScore > 0;
  // ↑ §2.1의 relevantA()와 문자 그대로 동일한 식 — eligibility는 이 SPEC 착수 이전과 변경되지 않는다.
}

function trueBaselineScore(
  domainMatch: boolean,
  isUniversal: boolean,
  keywordScore: number
): number {
  const domainWeight = domainMatch ? 2 : 0;
  const universalWeight = isUniversal ? 1 : 0;
  return domainWeight + universalWeight + keywordScore;
  // ↑ issueTypeWeight 항이 아예 없다 — 이 함수는 evidence.issueTypes를 참조하는 코드 경로를
  //   구조적으로 갖지 않는다(파라미터 목록에 issueTypes/query.issueType이 없음).
}
```

`baselineRetriever` = `trueBaselineEligible()`(candidate 진입) + `trueBaselineScore()`(정렬) 조합이며,
`newRetriever` = §2.1이 채택한 전략(`relevantB()`, 전략 B — M2가 실측으로 확정) + §2.2의
`computeScore()`(issueTypeWeight 포함) 조합이다. **`baselineRetriever`는 `computeScore()`를 절대
호출하지 않는다** — M2 exploratory 비교(§2.2)에서 전략 A/B 둘 다에 `computeScore()`를 적용한 것은
M2 단계에서만 유효한 의도적 단순화이며, 그 값을 M4d의 baseline에 재사용하는 것은 이 SPEC의 측정
방법론 결함이다. Production 코드 경로(실제 파이프라인이 호출하는 `retrieveEvidence()`)는 항상
`relevantB()` + `computeScore()`만 사용하며, `trueBaselineEligible()`/`trueBaselineScore()`는
M4d 벤치마크 비교 목적의 테스트 전용 함수로 production에 존재하지 않는다.

#### B. Corpus expansion effect (초기 vs 최종 corpus의 coverage delta — cross-corpus Recall 비교 아님)

**cross-corpus Recall@5 직접 비교로 "corpus 확장 효과"를 주장하지 않는다** — corpus가 확장되면
ground truth(`knownRelevantEvidenceIds`) 자체가 달라지므로(새로 추가된 relevant evidence가
반영됨), 서로 다른 ground truth에 대한 Recall@5 수치를 직접 비교하는 것은 방법론적으로 무효다
(같은 잣대로 잰 것이 아니다). 대신 M1 시점(초기, 10건)과 M4 freeze 시점(최종, N건) 두 corpus
스냅샷 사이의 **coverage delta**를 기록한다:

```
## Corpus expansion effect (초기 10건 → 최종 N건, coverage delta)
domain × issueType authenticated coverage matrix:
  (N/A 아닌 셀별 authenticated evidence 건수, 초기 → 최종)

evidence 0건인 coverage cell 수: 초기 X개 → 최종 Y개 (N/A 아닌 16-k칸 중)

benchmark query 중 authenticated known-relevant evidence가 최소 1개 존재하는
query 수/비율: 초기 X/M (P%) → 최종 Y/M (Q%)
```

"authenticated"는 design.md §5.3의 source 진위 재감사(manifest에서 "유지"로 결정)와 issueTypes
검토(같은 §5.3, 외부 독립 리뷰 v0.3.0 이슈 3)를 모두 통과한 evidence만 이 delta 집계에 포함됨을
뜻한다 — 재감사에서 downgrade/제외된 evidence나 issueTypes 검토를 통과하지 못한 evidence는 이
집계에서 제외한다.

**ranking algorithm 효과(A)와 corpus coverage 효과(B)를 하나의 수치로 합치지 않는다** — 두 절은
서로 다른 측정 방법(A는 IR 지표 비교, B는 coverage delta)을 쓰며, `.moai/reports/`에도 별도
섹션으로 기록한다(REQ-EVIDENCE-017).

acceptance threshold(예: "frozen corpus에서 평균 Recall@5 ≥ X")는 A의 실측값을 본 뒤
acceptance.md 개정으로 확정한다 — design.md 시점에는 임의 숫자를 박아넣지 않는다. 실측 결과
recall/precision trade-off(예: Recall@5는 개선되지만 Precision@5가 하락)가 관측되면, 그 결과에
맞춰 threshold를 자동으로 낮춰 PASS시키지 않는다 — 전략/가중치(§2.2의 `issueTypeWeight` 등)를
재검토하거나, trade-off를 감수할 근거를 명시적으로 문서화하는 것 중 하나를 사람이 판단한다
(§3.3b).

## §4. Requirement E — counterEvidenceIds=[] 진단 장치

### 4.1 설계 원칙 — 무엇을 자동화하고 무엇을 하지 않는가

A(corpus에 없음)와 B(top-K 탈락)는 **완전히 결정론적으로 unit-test 가능**하다 — 둘 다 순수
TypeScript 함수(`retrieveEvidence()`)의 입출력이기 때문이다. C(Skeptic이 전달받았지만 선택하지
않음)는 실제 Gemini 모델의 판단이므로 **unit test로 강제할 수 없다** — 대신 진단 장치는 C의
**전제 조건**(Skeptic 프롬프트에 counter-relevant evidence ID가 실제로 포함되어 전달되었는가)까지만
결정론적으로 검증하고, 그 이후 "모델이 실제로 그것을 counterEvidenceIds로 골랐는가"는 실 Gemini
smoke(이미 2회 수행)의 몫으로 명시적으로 남긴다. 이 경계를 흐리지 않는 것이 REQ-EVIDENCE-018("모든
사건에서 counterEvidenceIds ≥ 1을 강제하지 않는다")의 설계적 귀결이다.

### 4.2 diagnostic fixture 구조

신규 파일 `lib/pipeline/evidence-diagnostic.test.ts`:

```typescript
// 1) 고정 synthetic 사건 (case-input.test.ts 등 기존 fixture 패턴 재사용, PII 없음)
const fixtureCase: NormalizedCase = { /* ... */ };

// 2) 고정 evidence corpus 스냅샷 — production corpus의 부분집합 또는 동형 fixture.
//    최소 1건은 "counter-relevant"로 의도적으로 배치한 evidence여야 한다(REQ-EVIDENCE-019).
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

세 단계 모두 결정론적 fake/mock만 사용한다(REQ-EVIDENCE-023, REQ-EVIDENCE-024 — 실제 Gemini 호출 없음, 논리적
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
배제되고 C 또는 model behavior만 남는다"는 서술은 이 SPEC에서 금지한다(REQ-EVIDENCE-019) — fixture
evidence corpus는 실제 smoke가 쓴 production corpus의 그 시점 상태와 다를 수 있고, fixture query도
실제 smoke의 query와 다르기 때문에, fixture의 성공이 실제 smoke의 A/B 배제를 논리적으로 함의하지
않는다.

### 4.4 실제 smoke의 A/B를 좁히는 유일한 방법 — production snapshot replay (REQ-EVIDENCE-020)

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
   반영하는지 확인(REQ-EVIDENCE-021) 후에만 `db/seed/evidence.json`에 추가.
3. `DISPUTE_CASE`(금융감독원 분쟁조정) 후보는 결정문 원문 또는 금융감독원 공식 공개 요약만
   허용 — 3자 블로그/카페의 재구성 요약은 원 출처로 인정하지 않는다(REQ-EVIDENCE-002).
4. 검증 불가능한 후보는 `evidenceType: "OTHER"`로 낮추거나 아예 제외한다 — "그럴듯하지만
   확인 안 됨"을 PRECEDENT/STATUTE/DISPUTE_CASE로 분류하지 않는다.

### 5.1a Source 우선순위 (외부 독립 리뷰 v0.3.0 이슈 6)

production evidence의 `sourceUrl`은 다음 우선순위로 선택한다:

1. **공식 원문** — 대법원 종합법률정보, 국가법령정보센터(`law.go.kr`), 금융감독원 공식
   결정문/공개자료, 생명보험협회·손해보험협회 공식 표준약관/장해분류표 등.
2. **공식기관 공개 요약** — 위 기관이 직접 발행한 요약·보도자료(원문 링크가 없는 경우).
3. **신뢰 가능한 2차 출처/미러** — `casenote.kr` 등 판례 검색 서비스. 원문을 그대로 미러링하고
   출처를 명시하는 서비스에 한한다.

`casenote.kr` 같은 2차 DB는 **discovery(후보 발견)와 cross-check(교차 검증)에는 자유롭게
사용**할 수 있다 — research.md §0/§4.1이 이미 이 방식으로 기존 `seed-evidence-005`/
`seed-evidence-008`을 재검증했다. 다만 **production `sourceUrl`로 채택할 때는**, 공식 원문
URL을 실제로 확보할 수 있는 경우 그것을 우선한다 — 2차 출처를 그대로 `sourceUrl`로 쓰지 않는다.
공식 source를 현실적으로 확보할 수 없는 경우(예: 법원 공식 사이트가 특정 판례의 개별 URL을
제공하지 않는 구조인 경우)에만 검증 가능한 2차 source를 `sourceUrl`로 사용하고, manifest(§5.3)에
"공식 source 미확보, 사유: ..."를 명시적으로 기록한다.

### 5.2 기존 production evidence 10건 재감사 (REQ-EVIDENCE-005, 외부 독립 리뷰 이슈 5)

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
4. `content`가 원문 취지를 과장하지 않는지 재검토(REQ-EVIDENCE-021).
5. 위 검토를 통과하지 못하면, 그 레코드를 (a) `evidenceType: "OTHER"`로 downgrade하거나 (b)
   production corpus에서 제외하는 것 중 **하나를 명시적으로 결정**해 기록한다 — 판단을 유보한 채
   방치하지 않는다.
6. issueTypes 검토(§5.3 참고): source 진위 검토와 별개로, 이 레코드의 `issueTypes` 배열이
   실제 담보-쟁점 분류를 올바르게 반영하는지 사람이 재검토하고 그 결과를 manifest에 기록한다.

### 5.3 curated source-audit manifest (자동 테스트가 대신할 수 없는 부분의 기록 장치)

자동 테스트(acceptance.md AC-EVIDENCE-002)는 구조적으로 검증 가능한 것(`sourceUrl` 또는
`sourceIdentifier` 존재 여부)만 이진 판정할 수 있다 — "이 판례가 실제로 이렇게 판시했다"는 사실
자체의 진위는 자동화할 수 없다(사람 또는 run-phase 에이전트의 WebFetch가 대신 판단). 이 수작업
검증의 **결과**를 남기기 위해, 신규 파일 `.moai/reports/evidence-source-audit-manifest.md`(또는
동등한 구조화 문서)를 두고, production evidence 각 레코드마다 다음을 기록한다:

```
| id | evidenceType | sourceUrl 접근 확인일 | 원문 대조 결과 | issueTypes | issueTypes 검토 결과/tagging rationale | 결정(유지/OTHER downgrade/제외) | 검토자 |
```

**§D의 benchmark ground truth(`knownRelevantEvidenceIds`)는 이 manifest에서 "유지"로 결정된
evidence id 중, source 진위 검토와 issueTypes 검토를 모두 통과한 evidence만 참조할 수 있다**
(REQ-EVIDENCE-015 개정판 — 외부 독립 리뷰 v0.3.0 이슈 3). 두 검토 중 하나라도 미완료이면 해당
evidence는 "authenticated"로 간주하지 않는다(§3.4 정의 참고).

**issueTypes 검토 규칙 (과도한 tagging 방지)**:

- 모든 production evidence에 무조건 모든 issueType을 붙이는 식의 과도한 tagging을 허용하지
  않는다. 각 issueType은 그 evidence가 실제로 해당 쟁점에 대한 담보-쟁점 분류를 진술하는 경우에만
  부여한다(§1의 "evidence 자신의 담보-쟁점 분류이지 특정 사건에 대한 판정이 아니어야 한다" 원칙
  참고).
- `issueTypes`가 빈 배열(`[]`)인 것은 허용되지만, manifest의 "issueTypes 검토 결과" 컬럼에
  왜 이 evidence가 현재 8개 `QueryIssueType` 값 중 어느 것에도 안전하게 매핑되지 않는지 사유를
  기록해야 한다 — 빈 배열을 사유 없이 방치하지 않는다.
- 새 LLM 기반 tagging 시스템은 만들지 않는다. 수동 curated metadata 검토만 한다 — §6의
  duplicate 판정과 마찬가지로, semantic 분류 자동화는 이번 SPEC의 범위 밖이다(spec.md §4 Out
  of Scope 정신 계승).

## §6. Requirement F — 중복(duplicate) 판정 규칙 (REQ-EVIDENCE-022 개정, 외부 독립 리뷰 이슈 6)

**이전 설계의 결함**: "동일 source의 record들은 issueTypes 교집합이 비어야 한다"는 규칙은 너무
강하다 — 하나의 판례가 인과관계(`CAUSATION`)와 장해 평가 기준(`DISABILITY_GRADE_CRITERIA`) 두
쟁점을 동시에 다루면서도 서로 다른 proposition을 진술하는 것은 정상이며, 이런 경우를 issueType
겹침만으로 "중복"이라 판정하면 정당한 레코드를 강제로 병합/삭제하게 된다.

**설계 — 기본 구현은 sourceUrl + 정규화된 content 비교만 사용(외부 독립 리뷰 잔여 정합성 이슈
3, sourceIdentifier 미도입 기본안(§1.2)과 일치시킴)**:

```typescript
function normalizeForDuplicateCheck(content: string): string {
  return content.replace(/\s+/g, " ").trim(); // 공백/개행 정규화만 — 의미 판정 아님
}

function isDuplicate(a: EvidenceCandidate, b: EvidenceCandidate): boolean {
  const sameSource = Boolean(a.sourceUrl) && a.sourceUrl === b.sourceUrl;
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
- **이 SPEC의 기본 구현은 `sourceIdentifier` 컬럼을 도입하지 않으므로(§1.2), `isDuplicate()`는
  `EvidenceCandidate.sourceIdentifier` 필드를 전혀 참조하지 않는다.** `sourceIdentifier`가
  §1.2 조건을 만족해 실제로 별도 migration으로 추가되는 시점에는, `EvidenceCandidate` 타입에
  그 필드를 추가하는 것과 **함께** 이 함수에 `(a.sourceIdentifier && a.sourceIdentifier ===
  b.sourceIdentifier) ||` 조건을 추가한다 — 그 전까지는 존재하지 않는 필드를 참조하는 코드를
  두지 않는다.

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
