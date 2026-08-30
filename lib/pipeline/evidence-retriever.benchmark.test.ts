import { describe, expect, it } from "vitest";
import evidenceM2Snapshot from "../../db/seed/evidence-m2-snapshot.json";
import evidenceSeed from "../../db/seed/evidence.json";
import { retrieveEvidence, type EligibilityStrategy } from "./evidence-retriever";
import type { EvidenceCandidate, ResearchQuery } from "./types";

// SPEC-EVIDENCE-001 M2 — Curated Retrieval Benchmark (design.md §3, plan.md M2).
//
// [M2 EXPLORATORY] 섹션: 10건짜리 초기 corpus(evidence-m2-snapshot.json)를
// 기반으로 전략 A/B "방향"을 결정하는 탐색적 측정.
// [M5 REGRESSION] 섹션: production evidence.json(19건+)을 사용한 회귀 방지.
// [M4d FINAL] 섹션: M4 frozen corpus 위에서 true baseline vs new algorithm
// 최종 측정 (Blocker1 수정 후 computeBaselineScore 사용).
//
// Blocker2(SPEC-EVIDENCE-001): 벤치마크가 mutable production evidence.json을
// 직접 import하면 M4+에서 항목이 추가될 때마다 M2 탐색적 수치가 달라진다.
// evidence-m2-snapshot.json(10건 고정)을 분리해 M2 결과를 immutable하게 유지한다.

// ─────────────────────────────────────────────────────────────────────────────
// Section A — Imports, shared helpers, row builders
// ─────────────────────────────────────────────────────────────────────────────

type SeedRow = EvidenceCandidate & { createdAt: Date };

// M2 snapshot rows (10건 고정 — 절대로 수정하지 말 것)
const m2SnapshotRows: SeedRow[] = (evidenceM2Snapshot as EvidenceCandidate[]).map((r) => ({
  ...r,
  createdAt: new Date("2026-01-01T00:00:00Z"),
}));

// Production seed rows (M5 회귀 방지 + M4d FINAL 용)
const seedRows: SeedRow[] = (evidenceSeed as EvidenceCandidate[]).map((r) => ({
  ...r,
  createdAt: new Date("2026-01-01T00:00:00Z"),
}));

function makeFakeDb(rows: SeedRow[]): Parameters<typeof retrieveEvidence>[1] {
  return {
    select: () => ({
      from: async () => rows,
    }),
  } as unknown as Parameters<typeof retrieveEvidence>[1];
}

interface BenchmarkCase {
  id: string;
  query: ResearchQuery;
  knownRelevantEvidenceIds: string[];
}

// design.md §3.2 커버리지 — 두 담보(INJURY_DISABILITY/DISEASE_DISABILITY) ×
// {CAUSATION, DISABILITY_GRADE_CRITERIA, DIAGNOSIS 또는 DISABILITY_LOCATION}
// 각 3건 + PRE_EXISTING_CONDITION 1건 = 최소 7건(AC-EVIDENCE-012).
//
// bm-injury-preexisting-01은 REQ-EVIDENCE-013가 지정한 target case다 —
// query.keywords(["연골 손상"])는 db/seed/evidence-m2-snapshot.json 전체 corpus
// 어디에도 등장하지 않으므로(node로 사전 검증) keywordScore는 항상 0이고,
// 전략 A(키워드 필수)는 반드시 miss한다. 전략 B는 issueType exact match
// (PRE_EXISTING_CONDITION)만으로 candidate에 진입시켜 hit한다.
const BENCHMARK_CASES: BenchmarkCase[] = [
  {
    id: "bm-injury-preexisting-01",
    query: {
      id: "q-injury-preexisting",
      topic: "발목 상해후유장해 기왕증·퇴행성 가능성 검토",
      focus: "발목",
      domain: "INJURY_DISABILITY",
      issueType: "PRE_EXISTING_CONDITION",
      keywords: ["연골 손상"],
    },
    knownRelevantEvidenceIds: ["seed-evidence-005", "seed-evidence-006"],
  },
  {
    id: "bm-injury-causation-01",
    query: {
      id: "q-injury-causation",
      topic: "발목 상해후유장해 인과관계 쟁점 검토",
      focus: "발목",
      domain: "INJURY_DISABILITY",
      issueType: "CAUSATION",
      keywords: ["인과관계"],
    },
    knownRelevantEvidenceIds: ["seed-evidence-005"],
  },
  {
    id: "bm-injury-grade-01",
    query: {
      id: "q-injury-grade",
      topic: "발목 상해후유장해 장해 평가 기준 검토",
      focus: "발목",
      domain: "INJURY_DISABILITY",
      issueType: "DISABILITY_GRADE_CRITERIA",
      keywords: ["관절가동범위"],
    },
    knownRelevantEvidenceIds: ["seed-evidence-001"],
  },
  {
    id: "bm-injury-location-01",
    query: {
      id: "q-injury-location",
      topic: "발목 상해후유장해 담보 검토",
      focus: "발목",
      domain: "INJURY_DISABILITY",
      issueType: "DISABILITY_LOCATION",
      keywords: ["발목 인대"],
    },
    knownRelevantEvidenceIds: ["seed-evidence-001"],
  },
  {
    id: "bm-disease-causation-01",
    query: {
      id: "q-disease-causation",
      topic: "질병후유장해 인과관계 쟁점 검토",
      focus: "진단명",
      domain: "DISEASE_DISABILITY",
      issueType: "CAUSATION",
      keywords: ["인과관계"],
    },
    // Blocker2 주의: seed-evidence-003은 M4에서 OTHER로 downgrade될 수 있음.
    // M4c ground truth freeze 단계에서 evidence.json 상태 확인 후 갱신 필요.
    knownRelevantEvidenceIds: ["seed-evidence-003", "seed-evidence-008", "seed-evidence-009"],
  },
  {
    id: "bm-disease-grade-01",
    query: {
      id: "q-disease-grade",
      topic: "질병후유장해 장해 평가 기준 검토",
      focus: "질병후유장해 등급",
      domain: "DISEASE_DISABILITY",
      issueType: "DISABILITY_GRADE_CRITERIA",
      keywords: ["감정"],
    },
    knownRelevantEvidenceIds: ["seed-evidence-004"],
  },
  {
    id: "bm-disease-diagnosis-01",
    query: {
      id: "q-disease-diagnosis",
      topic: "질병후유장해 진단명 검토",
      focus: "진단명",
      domain: "DISEASE_DISABILITY",
      issueType: "DIAGNOSIS",
      keywords: ["진단명"],
    },
    knownRelevantEvidenceIds: ["seed-evidence-008"],
  },
];

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
  return relevantReturned / 5;
}

interface StrategyMetrics {
  strategy: EligibilityStrategy;
  perCase: Array<{ id: string; recall: number; hit: 0 | 1; precision: number }>;
  meanRecall: number;
  meanHit: number;
  meanPrecision: number;
}

async function measureStrategy(
  strategy: EligibilityStrategy,
  rows: SeedRow[]
): Promise<StrategyMetrics> {
  const db = makeFakeDb(rows);
  const perCase: StrategyMetrics["perCase"] = [];

  for (const bc of BENCHMARK_CASES) {
    const result = await retrieveEvidence([bc.query], db, strategy);
    const candidates = result.get(bc.query.id) ?? [];
    perCase.push({
      id: bc.id,
      recall: recallAt5(candidates, bc.knownRelevantEvidenceIds),
      hit: hitAt5(candidates, bc.knownRelevantEvidenceIds),
      precision: precisionAt5(candidates, bc.knownRelevantEvidenceIds),
    });
  }

  const meanRecall = perCase.reduce((s, c) => s + c.recall, 0) / perCase.length;
  const meanHit = perCase.reduce((s, c) => s + c.hit, 0) / perCase.length;
  const meanPrecision = perCase.reduce((s, c) => s + c.precision, 0) / perCase.length;

  return { strategy, perCase, meanRecall, meanHit, meanPrecision };
}

// ─────────────────────────────────────────────────────────────────────────────
// Section B — [M2 EXPLORATORY] benchmark (10건 고정 corpus)
// ─────────────────────────────────────────────────────────────────────────────

describe("evidence-retriever [M2 EXPLORATORY] benchmark (REQ-EVIDENCE-014, AC-EVIDENCE-012)", () => {
  it("[M2 EXPLORATORY] 최소 7개 벤치마크 케이스가 두 담보 × 3개 issueType 조합 + PRE_EXISTING_CONDITION 1건을 커버한다", () => {
    expect(BENCHMARK_CASES.length).toBeGreaterThanOrEqual(7);

    const byDomain = (domain: "INJURY_DISABILITY" | "DISEASE_DISABILITY") =>
      BENCHMARK_CASES.filter((c) => c.query.domain === domain).map((c) => c.query.issueType);

    for (const domain of ["INJURY_DISABILITY", "DISEASE_DISABILITY"] as const) {
      const issueTypes = byDomain(domain);
      expect(issueTypes).toContain("CAUSATION");
      expect(issueTypes).toContain("DISABILITY_GRADE_CRITERIA");
      expect(issueTypes.includes("DIAGNOSIS") || issueTypes.includes("DISABILITY_LOCATION")).toBe(
        true
      );
    }

    expect(BENCHMARK_CASES.some((c) => c.query.issueType === "PRE_EXISTING_CONDITION")).toBe(true);
  });

  it("[M2 EXPLORATORY] 모든 knownRelevantEvidenceIds가 M2 snapshot(10건)의 실제 id 집합에 존재한다 (AC-EVIDENCE-013 (a) 부분)", () => {
    const actualIds = new Set((evidenceM2Snapshot as EvidenceCandidate[]).map((r) => r.id));
    for (const bc of BENCHMARK_CASES) {
      for (const id of bc.knownRelevantEvidenceIds) {
        expect(actualIds.has(id)).toBe(true);
      }
    }
  });

  it("[M2 EXPLORATORY] REQ-EVIDENCE-013 target case: 전략 A는 miss, 전략 B는 hit한다 — 이 관측이 전략 B 채택의 근거다", async () => {
    const db = makeFakeDb(m2SnapshotRows);
    const targetCase = BENCHMARK_CASES.find((c) => c.id === "bm-injury-preexisting-01");
    if (!targetCase) throw new Error("target case not found");

    const resultA = await retrieveEvidence([targetCase.query], db, "A");
    const candidatesA = resultA.get(targetCase.query.id) ?? [];
    expect(hitAt5(candidatesA, targetCase.knownRelevantEvidenceIds)).toBe(0);

    const resultB = await retrieveEvidence([targetCase.query], db, "B");
    const candidatesB = resultB.get(targetCase.query.id) ?? [];
    expect(hitAt5(candidatesB, targetCase.knownRelevantEvidenceIds)).toBe(1);
  });

  it("[M2 EXPLORATORY] 전략 A/B의 Recall@5/Hit@5/Precision@5를 측정·기록한다 — non-regression 계약(design.md §3.3b) 확인 (Blocker1 수정 후 corrected baseline)", async () => {
    const metricsA = await measureStrategy("A", m2SnapshotRows);
    const metricsB = await measureStrategy("B", m2SnapshotRows);

    // [M2 EXPLORATORY] 라벨: 이 console.log 출력은 progress.md에 그대로 옮겨
    // 기록되며, M4d의 frozen 최종 비교와는 별개 절로 분리 서술된다.
    // Blocker1 수정 후 재측정: strategy A는 computeBaselineScore(issueTypeWeight=0) 적용.
    console.log("[M2 EXPLORATORY] strategy A (corrected baseline):", JSON.stringify(metricsA, null, 2));
    console.log("[M2 EXPLORATORY] strategy B:", JSON.stringify(metricsB, null, 2));

    // design.md §3.3b 권고 기본값 — new(B) >= baseline(A) on all 3 metrics
    // Blocker1 수정 후에도 B >= A 계약이 유지되어야 한다.
    // 만약 이 assertion이 실패하면 Blocker report를 반환한다(임의 조정 금지).
    expect(metricsB.meanRecall).toBeGreaterThanOrEqual(metricsA.meanRecall);
    expect(metricsB.meanHit).toBeGreaterThanOrEqual(metricsA.meanHit);
    expect(metricsB.meanPrecision).toBeGreaterThanOrEqual(metricsA.meanPrecision);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section C — [M5 REGRESSION] (production evidence.json 사용)
// ─────────────────────────────────────────────────────────────────────────────

describe("evidence-retriever [M5 REGRESSION] (REQ-EVIDENCE-010, AC-EVIDENCE-009)", () => {
  // SPEC-EVIDENCE-001 M5 — REQ-EVIDENCE-010 회귀 방지 벤치마크 케이스
  // (AC-EVIDENCE-009, design.md §2.2 issueTypeWeight 설계 근거).
  //
  // seed-evidence-004/seed-evidence-017은 issueType이 DISABILITY_GRADE_CRITERIA
  // 이지만 content에 query keyword "진단"이 우연히 등장한다("진단서 소견"/
  // "진단확정일") — 전략 B(issueType exact match를 OR 조건으로 채택)에서
  // 이 두 레코드는 키워드 우연 일치만으로 candidate에 진입한다. 이 케이스는
  // score 함수의 issueTypeWeight(10)이 실제로 "쟁점이 정확히 일치하는
  // known-relevant evidence"를 "키워드 하나만 우연히 겹치는 무관 evidence"
  // 보다 항상 위에 배치하는지 real seed corpus로 회귀 방지한다.
  it("[REQ-EVIDENCE-010] 무관 evidence가 키워드 하나로 우연히 매칭돼도 known-relevant evidence보다 상위로 회귀하지 않는다 (AC-EVIDENCE-009)", async () => {
    const db = makeFakeDb(seedRows);
    const query: ResearchQuery = {
      id: "q-disease-diagnosis-irrelevant-regression",
      topic: "질병후유장해 진단명 검토 — 무관 evidence 키워드 우연 매칭 회귀 확인",
      focus: "진단명",
      domain: "DISEASE_DISABILITY",
      issueType: "DIAGNOSIS",
      keywords: ["진단"],
    };
    const knownRelevantIds = ["seed-evidence-003", "seed-evidence-008", "seed-evidence-019"];
    // seed-evidence-004/017: issueTypes=["DISABILITY_GRADE_CRITERIA"]이며
    // DIAGNOSIS와 무관하지만, content에 query keyword "진단"이 우연히
    // 등장해(각각 "진단서 소견", "진단확정일") 전략 B에서 candidate에
    // 진입한다 — 의도적으로 배치한 "무관하지만 키워드 하나가 우연히
    // 겹치는 evidence"(design.md §3의 정의).
    const irrelevantButKeywordMatched = ["seed-evidence-004", "seed-evidence-017"];

    const result = await retrieveEvidence([query], db, "B");
    const candidates = result.get(query.id) ?? [];
    const ids = candidates.map((c) => c.id);

    // 사전 조건: 이 회귀 방지 케이스가 실제로 두 evidence 클래스를 함께
    // 반환함을 확인한다(공허한 검증이 아님).
    expect(ids.some((id) => knownRelevantIds.includes(id))).toBe(true);
    expect(ids.some((id) => irrelevantButKeywordMatched.includes(id))).toBe(true);

    const lastKnownRelevantRank = Math.max(
      ...knownRelevantIds.map((id) => ids.indexOf(id)).filter((idx) => idx >= 0)
    );
    const firstIrrelevantRank = Math.min(
      ...irrelevantButKeywordMatched.map((id) => ids.indexOf(id)).filter((idx) => idx >= 0)
    );

    // 무관 evidence는 known-relevant evidence 중 어느 것보다도 앞선
    // 순위로 들어오지 않는다(acceptance.md AC-EVIDENCE-009).
    expect(firstIrrelevantRank).toBeGreaterThan(lastKnownRelevantRank);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section D — [M4d FINAL] benchmark placeholder (M4c freeze 후 채워짐)
// ─────────────────────────────────────────────────────────────────────────────

describe("evidence-retriever [M4d FINAL] (algorithm effect — frozen corpus)", () => {
  // M4c ground truth freeze 완료 후 이 섹션을 채운다.
  // 각 BenchmarkCase에 대해 baseline(A) vs new(B)를 frozen corpus로 측정한다.
  // 모든 테스트는 [FROZEN] 라벨을 사용한다.
  // AC-EVIDENCE-014: REQ-013 target case(bm-injury-preexisting-01)는
  //   - strategy A: Hit@5 = 0 (키워드 없으면 miss)
  //   - strategy B: Hit@5 = 1 (issueType exact match로 복구)
  // 위 두 조건이 동시에 만족되어야 한다.
  // non-regression 계약: B >= A on meanRecall, meanHit, meanPrecision

  it.todo("[FROZEN] bm-injury-preexisting-01: baseline(A) miss, new(B) hit — REQ-013 target case");
  it.todo("[FROZEN] bm-injury-causation-01: baseline vs new Recall@5/Hit@5/Precision@5");
  it.todo("[FROZEN] bm-injury-grade-01: baseline vs new Recall@5/Hit@5/Precision@5");
  it.todo("[FROZEN] bm-injury-location-01: baseline vs new Recall@5/Hit@5/Precision@5");
  it.todo("[FROZEN] bm-disease-causation-01: baseline vs new Recall@5/Hit@5/Precision@5");
  it.todo("[FROZEN] bm-disease-grade-01: baseline vs new Recall@5/Hit@5/Precision@5");
  it.todo("[FROZEN] bm-disease-diagnosis-01: baseline vs new Recall@5/Hit@5/Precision@5");
  it.todo("[FROZEN] overall: B >= A non-regression 계약 (meanRecall, meanHit, meanPrecision)");
});
