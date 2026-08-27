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
// @MX:WARN: [AUTO] top-N(5) cutoff은 seed 데이터 규모(10개)를 전제로 한
// 초기 파라미터다.
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
  };
}

const TOP_N = 5;

export async function retrieveEvidence(
  queries: ResearchQuery[],
  db: DrizzleDb = getDb()
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
        // 관련성 술어: DOMAIN_SPECIFIC은 domain AND keyword, UNIVERSAL은 keyword만
        const relevant = isUniversal ? keywordScore > 0 : domainMatch && keywordScore > 0;
        // 정렬 전용 — 관련성 판정에는 미사용
        const score = (domainMatch ? 2 : 0) + (isUniversal ? 1 : 0) + keywordScore;
        return { item, score, relevant };
      })
      .filter((entry) => entry.relevant)
      .sort((a, b) => b.score - a.score)
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
