import { getDb } from "../db/client";
import { evidence as evidenceTable } from "../db/schema";
import type { CoverageDomain, EvidenceCandidate, ResearchQuery } from "./types";

// EvidenceRetriever (3/6) — 리서치 쿼리별로 관련성 있는 근거자료 후보를 DB에서
// 조회·필터링해 Map<queryId, EvidenceCandidate[]>로 반환한다
// (REQ-RESEARCH-004/005/006/007, design.md §6 2차 revision).
//
// 관련성 판정은 스코어(정렬용)와 분리된 필터 술어다: scope이
// DOMAIN_SPECIFIC인 evidence는 담보 도메인 일치 AND 키워드 매칭 ≥1을,
// scope이 UNIVERSAL인 evidence는 도메인과 무관하게 키워드 매칭 ≥1만
// 만족하면 관련 있는 것으로 본다. "담보 도메인만 일치해도(키워드 매칭
// 0건이어도) 포함"되던 1차 설계의 결함을 필터 술어 수준에서 구조적으로
// 차단한다(design.md §6, AC-RESEARCH-005).
//
// @MX:WARN: [AUTO] top-N(5) cutoff은 seed 데이터 규모(10개→M4 확장 후)를 전제로 한
// 초기 파라미터다. Blocker1(SPEC-EVIDENCE-001) 이후 전략 A는 computeBaselineScore,
// 전략 B는 computeScore로 분리되었다 — score 함수 선택 로직은 아래 분기 참조.
// @MX:REASON: spec.md §5 잔여 위험에 기록된 대로, evidence가 대규모로
// 늘어나면 cutoff/스코어링 방식을 후속 SPEC에서 재조정해야 한다.
const DOMAIN_CATEGORY_LABEL: Record<CoverageDomain, string> = {
  INJURY_DISABILITY: "상해후유장해",
  DISEASE_DISABILITY: "질병후유장해",
};

type DrizzleDb = ReturnType<typeof getDb>;
type EvidenceRow = typeof evidenceTable.$inferSelect;

function toCandidate(row: EvidenceRow): EvidenceCandidate {
  return {
    id: row.id,
    category: row.category,
    evidenceType: row.evidenceType as EvidenceCandidate["evidenceType"],
    scope: row.scope as EvidenceCandidate["scope"],
    title: row.title,
    content: row.content,
    sourceUrl: row.sourceUrl,
    // SPEC-EVIDENCE-001 M1(design.md §1.4) — issueTypes는 JSON 컬럼이라
    // 정적 타입이 없다(다른 필드와 동일한 캐스팅 관례). M1은 스키마/타입
    // 배선만 담당하며, candidate eligibility/score에서의 실제 소비는
    // M2(§C) 범위다.
    issueTypes: (row.issueTypes ?? []) as EvidenceCandidate["issueTypes"],
  };
}

const TOP_N = 5;

// SPEC-EVIDENCE-001 M2(design.md §2.1) — candidate eligibility 전략 A/B.
// 전략 A(현행): DOMAIN_SPECIFIC은 domain AND keyword, UNIVERSAL은 keyword만.
// 전략 B(issueType 반영): keyword 매칭을 issueType exact match로 OR
// 대체할 수 있게 한다 — issueType 불일치를 이유로 무조건 배제하는 hard
// filter는 도입하지 않는다(REQ-EVIDENCE-009 통합 조항).
export type EligibilityStrategy = "A" | "B";

// M2 exploratory 측정(§3.4) 결과 채택된 전략. 전략 B만이 REQ-EVIDENCE-013
// target case("exact issueType, no keyword" known-relevant evidence)를
// 실제로 복구하므로(evidence-retriever.benchmark.test.ts 참고) 전략 B를
// 채택한다 — 전략 A는 이 케이스에서 항상 recall 0으로 측정된다.
const ADOPTED_STRATEGY: EligibilityStrategy = "B";

export function relevantA(
  domainMatch: boolean,
  isUniversal: boolean,
  keywordScore: number
): boolean {
  return isUniversal ? keywordScore > 0 : domainMatch && keywordScore > 0;
}

export function relevantB(
  domainMatch: boolean,
  isUniversal: boolean,
  keywordScore: number,
  issueTypeExactMatch: boolean
): boolean {
  return isUniversal
    ? keywordScore > 0 || issueTypeExactMatch
    : domainMatch && (keywordScore > 0 || issueTypeExactMatch);
}

// SPEC-EVIDENCE-001 Blocker1(design.md §3.4A) — 전략 A(baselineRetriever)용
// true baseline score 함수. issueTypeWeight를 포함하지 않는다.
// 전략 A는 "SPEC 착수 전 main Retriever와 의미적으로 동일한 baseline"이므로
// issueTypeWeight 없이 domainWeight + universalWeight + keywordScore만 계산한다.
// REQ-EVIDENCE-016: 동일 frozen corpus 위에서 baseline(A)과 new(B)를 비교하는
// 목적상, 전략 A가 issueTypeWeight를 포함하면 true baseline이 되지 않는다.
export function computeBaselineScore(
  _evidence: EvidenceCandidate,
  _query: ResearchQuery,
  domainMatch: boolean,
  isUniversal: boolean,
  keywordScore: number
): number {
  const domainWeight = domainMatch ? 2 : 0;
  const universalWeight = isUniversal ? 1 : 0;
  return domainWeight + universalWeight + keywordScore;
}

// design.md §2.2 — score 함수(정렬 전용, eligibility와 별개 단계).
// issueTypeWeight(10)은 domainWeight(2)+keywordScore(관측상 1~3)를 합친
// 것보다 크게 잡아 "쟁점이 정확히 일치하는 evidence"가 항상 위에 오도록
// 한다(REQ-EVIDENCE-010 회귀 방지의 설계 근거).
export function computeScore(
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

// SPEC-EVIDENCE-001 M5(design.md §6) — 중복(duplicate) 판정 규칙(REQ-EVIDENCE-022
// 개정). 공백/개행 정규화만 수행한다 — 의미(semantic) 판정이 아니다.
export function normalizeForDuplicateCheck(content: string): string {
  return content.replace(/\s+/g, " ").trim();
}

// 동일 sourceUrl + 정규화된 content 동일성 기준으로만 중복을 판정한다.
// issueTypes 겹침 여부는 이 판정에 전혀 관여하지 않는다 — 하나의 판례가
// 서로 다른 두 쟁점을 동시에 다루면서도 서로 다른 proposition을 진술하는
// 것은 정상이다(외부 독립 리뷰 이슈 6).
//
// 이 SPEC의 기본 구현은 sourceIdentifier 컬럼을 도입하지 않으므로
// (design.md §1.2), 이 함수는 EvidenceCandidate.sourceIdentifier 필드를
// 전혀 참조하지 않는다. sourceIdentifier가 §1.2 조건을 만족해 추후
// 별도 migration으로 추가되는 시점에, 이 함수에
// `(a.sourceIdentifier && a.sourceIdentifier === b.sourceIdentifier) ||`
// 조건을 함께 추가한다 — 그 전까지는 존재하지 않는 필드를 참조하지 않는다.
export function isDuplicate(a: EvidenceCandidate, b: EvidenceCandidate): boolean {
  const sameSource = Boolean(a.sourceUrl) && a.sourceUrl === b.sourceUrl;
  if (!sameSource) return false;
  return normalizeForDuplicateCheck(a.content) === normalizeForDuplicateCheck(b.content);
}

export async function retrieveEvidence(
  queries: ResearchQuery[],
  db: DrizzleDb = getDb(),
  strategy: EligibilityStrategy = ADOPTED_STRATEGY
): Promise<Map<string, EvidenceCandidate[]>> {
  const rows = await db.select().from(evidenceTable);
  const all = rows.map(toCandidate);
  const result = new Map<string, EvidenceCandidate[]>();

  for (const query of queries) {
    const domainCategory = DOMAIN_CATEGORY_LABEL[query.domain];

    const scored = all
      .map((item) => {
        const keywordScore = query.keywords.filter(
          (kw) => item.title.includes(kw) || item.content.includes(kw)
        ).length;
        const domainMatch = item.category === domainCategory;
        const isUniversal = item.scope === "UNIVERSAL";
        const issueTypeExactMatch = item.issueTypes.includes(query.issueType);
        // 관련성 술어: 전략 A는 keyword 필수, 전략 B는 issueType exact
        // match로 keyword 요건을 OR 대체 가능(design.md §2.1)
        const relevant =
          strategy === "A"
            ? relevantA(domainMatch, isUniversal, keywordScore)
            : relevantB(domainMatch, isUniversal, keywordScore, issueTypeExactMatch);
        // Blocker1(design.md §3.4A): 전략 A는 computeBaselineScore(issueTypeWeight=0),
        // 전략 B는 computeScore(issueTypeWeight 포함) — true baseline 분리
        const score =
          strategy === "A"
            ? computeBaselineScore(item, query, domainMatch, isUniversal, keywordScore)
            : computeScore(item, query, domainMatch, isUniversal, keywordScore);
        return { item, score, relevant };
      })
      .filter((entry) => entry.relevant)
      // 결정론적 정렬 — score 동점 시 id 오름차순 고정(design.md §2.3,
      // REQ-EVIDENCE-012)
      .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))
      .slice(0, TOP_N);

    // 매칭되는 evidence가 없는 쿼리는 빈 배열을 값으로 갖는다 — 전체
    // evidence로 폴백하지 않는다(design.md §6).
    result.set(
      query.id,
      scored.map((entry) => entry.item)
    );
  }

  return result;
}
