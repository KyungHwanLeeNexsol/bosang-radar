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
//
// Fix1(SPEC-EVIDENCE-001): M2_BENCHMARK_CASES를 BENCHMARK_CASES에서 분리.
// M2_BENCHMARK_CASES는 M2 당시 10건 corpus 기준 ground truth — 절대 수정 금지.
// BENCHMARK_CASES(FINAL)는 M4c freeze 기준 21건 corpus ground truth.

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

// ─────────────────────────────────────────────────────────────────────────────
// M2_BENCHMARK_CASES: M2 당시 10건 corpus 기준 ground truth (FROZEN — 수정 금지)
// M2 시점: evidence.json에 seed-001~010만 존재하던 때.
// seed-020/021 등 M4 이후 추가 항목은 여기에 포함하지 않는다.
// ─────────────────────────────────────────────────────────────────────────────
const M2_BENCHMARK_CASES: BenchmarkCase[] = [
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
    // M2 당시 ground truth (10건 corpus 기준) — 이후 변경 금지
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
    // M2 당시: seed-003은 POLICY였음(나중에 OTHER downgrade) — M2 snapshot 시점 기준 포함
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
    // M2 당시: seed-004는 항상 OTHER였으나 downgrade된 항목이 아님 — 포함
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

// ─────────────────────────────────────────────────────────────────────────────
// BENCHMARK_CASES: M4c freeze — 21건 corpus 기준 FINAL ground truth
// design.md §3.2 커버리지 — 두 담보(INJURY_DISABILITY/DISEASE_DISABILITY) ×
// {CAUSATION, DISABILITY_GRADE_CRITERIA, DIAGNOSIS 또는 DISABILITY_LOCATION}
// 각 3건 + PRE_EXISTING_CONDITION 1건 = 최소 7건(AC-EVIDENCE-012).
//
// AC-EVIDENCE-013 정정(Fix3):
// "manifest에서 OTHER downgrade된" 항목만 제외 대상.
// seed-004/017/018은 처음부터 OTHER이며 downgrade된 적 없음 → 포함 가능.
// seed-021 DIAGNOSIS 태깅 제거(Fix4) → bm-disease-diagnosis-01에서 제외.
// ─────────────────────────────────────────────────────────────────────────────
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
    // M4c freeze: seed-evidence-006(OTHER 제외), seed-evidence-016/020 추가
    knownRelevantEvidenceIds: ["seed-evidence-005", "seed-evidence-016", "seed-evidence-020"],
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
    // M4c freeze: seed-evidence-015/016/020 추가 (CAUSATION + 인과관계 keyword/issueType 매칭)
    knownRelevantEvidenceIds: [
      "seed-evidence-005",
      "seed-evidence-015",
      "seed-evidence-016",
      "seed-evidence-020",
    ],
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
    // M4c freeze: seed-evidence-011/012/013/020 추가
    knownRelevantEvidenceIds: [
      "seed-evidence-001",
      "seed-evidence-011",
      "seed-evidence-012",
      "seed-evidence-013",
      "seed-evidence-020",
    ],
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
    // M4c freeze: seed-evidence-011/012/013 추가
    knownRelevantEvidenceIds: [
      "seed-evidence-001",
      "seed-evidence-011",
      "seed-evidence-012",
      "seed-evidence-013",
    ],
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
    // M4c freeze: seed-evidence-003 제거(OTHER downgrade), seed-evidence-016/021 추가
    // seed-021은 CAUSATION issueType 유지 (Fix4: DIAGNOSIS만 제거)
    knownRelevantEvidenceIds: [
      "seed-evidence-008",
      "seed-evidence-009",
      "seed-evidence-016",
      "seed-evidence-021",
    ],
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
    // AC-EVIDENCE-013 정정(Fix3): seed-004/017/018은 처음부터 OTHER이며
    // downgrade된 적 없음 → 포함.
    // seed-004: 질병후유장해 등급 판정 시 감정의 역할 (직접 관련)
    // seed-017: 질병후유장해 지급률 확정 시기 180일 기준 (직접 관련)
    // seed-018: 장해지급률 확정 후 악화 재산정 (UNIVERSAL, 직접 관련)
    knownRelevantEvidenceIds: ["seed-evidence-004", "seed-evidence-017", "seed-evidence-018"],
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
    // M4c freeze: seed-evidence-003 제거(OTHER downgrade), seed-evidence-019 추가
    // Fix4: seed-021에서 DIAGNOSIS 태깅 제거 → 여기서도 제외
    // (seed-021은 고지의무/계약해지 판례 — DIAGNOSIS 쟁점 아님)
    knownRelevantEvidenceIds: ["seed-evidence-008", "seed-evidence-019"],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Metric functions — Fix5: 빈 ground-truth → null 반환, mean에서 제외
// ─────────────────────────────────────────────────────────────────────────────

// knownRelevantEvidenceIds가 빈 케이스는 null 반환 — 평균에서 제외(M4e coverage gap)
function recallAt5(candidates: EvidenceCandidate[], knownRelevantIds: string[]): number | null {
  if (knownRelevantIds.length === 0) return null;
  const returned = new Set(candidates.map((c) => c.id));
  const hits = knownRelevantIds.filter((id) => returned.has(id)).length;
  return hits / knownRelevantIds.length;
}

function hitAt5(candidates: EvidenceCandidate[], knownRelevantIds: string[]): number | null {
  if (knownRelevantIds.length === 0) return null;
  const returned = new Set(candidates.map((c) => c.id));
  return knownRelevantIds.some((id) => returned.has(id)) ? 1 : 0;
}

function precisionAt5(candidates: EvidenceCandidate[], knownRelevantIds: string[]): number | null {
  if (knownRelevantIds.length === 0) return null;
  const knownRelevant = new Set(knownRelevantIds);
  const relevantReturned = candidates.slice(0, 5).filter((c) => knownRelevant.has(c.id)).length;
  return relevantReturned / 5;
}

interface StrategyMetrics {
  strategy: EligibilityStrategy;
  perCase: Array<{
    id: string;
    recall: number | null;
    hit: number | null;
    precision: number | null;
    skipped: boolean; // true when knownRelevantEvidenceIds was empty
  }>;
  meanRecall: number; // average over non-null cases only
  meanHit: number;
  meanPrecision: number;
  skippedCases: string[]; // IDs of cases excluded from mean (empty ground truth)
}

// Fix2: measureStrategy에 cases 파라미터 추가 — 호출자가 M2/FINAL 케이스를 선택
async function measureStrategy(
  strategy: EligibilityStrategy,
  rows: SeedRow[],
  cases: BenchmarkCase[]
): Promise<StrategyMetrics> {
  const db = makeFakeDb(rows);
  const perCase: StrategyMetrics["perCase"] = [];

  for (const bc of cases) {
    const result = await retrieveEvidence([bc.query], db, strategy);
    const candidates = result.get(bc.query.id) ?? [];
    const recall = recallAt5(candidates, bc.knownRelevantEvidenceIds);
    const hit = hitAt5(candidates, bc.knownRelevantEvidenceIds);
    const precision = precisionAt5(candidates, bc.knownRelevantEvidenceIds);
    perCase.push({
      id: bc.id,
      recall,
      hit,
      precision,
      skipped: bc.knownRelevantEvidenceIds.length === 0,
    });
  }

  // null 케이스(빈 ground truth) 제외하고 mean 계산
  const validCases = perCase.filter((c) => !c.skipped);
  const meanRecall =
    validCases.length > 0
      ? validCases.reduce((s, c) => s + (c.recall ?? 0), 0) / validCases.length
      : 0;
  const meanHit =
    validCases.length > 0
      ? validCases.reduce((s, c) => s + (c.hit ?? 0), 0) / validCases.length
      : 0;
  const meanPrecision =
    validCases.length > 0
      ? validCases.reduce((s, c) => s + (c.precision ?? 0), 0) / validCases.length
      : 0;
  const skippedCases = perCase.filter((c) => c.skipped).map((c) => c.id);

  return { strategy, perCase, meanRecall, meanHit, meanPrecision, skippedCases };
}

// ─────────────────────────────────────────────────────────────────────────────
// Section B — [M2 EXPLORATORY] benchmark (10건 고정 corpus)
// ─────────────────────────────────────────────────────────────────────────────

describe("evidence-retriever [M2 EXPLORATORY] benchmark (REQ-EVIDENCE-014, AC-EVIDENCE-012)", () => {
  it("[M2 EXPLORATORY] 최소 7개 벤치마크 케이스가 두 담보 × 3개 issueType 조합 + PRE_EXISTING_CONDITION 1건을 커버한다", () => {
    // Fix2: M2_BENCHMARK_CASES 사용 (BENCHMARK_CASES → M2_BENCHMARK_CASES)
    expect(M2_BENCHMARK_CASES.length).toBeGreaterThanOrEqual(7);

    const byDomain = (domain: "INJURY_DISABILITY" | "DISEASE_DISABILITY") =>
      M2_BENCHMARK_CASES.filter((c) => c.query.domain === domain).map((c) => c.query.issueType);

    for (const domain of ["INJURY_DISABILITY", "DISEASE_DISABILITY"] as const) {
      const issueTypes = byDomain(domain);
      expect(issueTypes).toContain("CAUSATION");
      expect(issueTypes).toContain("DISABILITY_GRADE_CRITERIA");
      expect(issueTypes.includes("DIAGNOSIS") || issueTypes.includes("DISABILITY_LOCATION")).toBe(
        true
      );
    }

    expect(M2_BENCHMARK_CASES.some((c) => c.query.issueType === "PRE_EXISTING_CONDITION")).toBe(
      true
    );
  });

  it("[M2 EXPLORATORY] M2_BENCHMARK_CASES의 knownRelevantEvidenceIds가 m2SnapshotRows(001~010 범위)에 실제로 존재함을 확인한다 (AC-EVIDENCE-013 (a) 부분)", () => {
    // Fix2: M2_BENCHMARK_CASES의 모든 id가 seed-001~010 범위 내임을 검증
    const m2SnapshotIds = new Set((evidenceM2Snapshot as EvidenceCandidate[]).map((r) => r.id));
    for (const bc of M2_BENCHMARK_CASES) {
      for (const id of bc.knownRelevantEvidenceIds) {
        // M2_BENCHMARK_CASES의 모든 id는 M2 snapshot 내에 있어야 한다
        expect(m2SnapshotIds.has(id)).toBe(true);
      }
    }
  });

  it("[M2 EXPLORATORY] REQ-EVIDENCE-013 target case: 전략 A는 miss, 전략 B는 hit한다 — 이 관측이 전략 B 채택의 근거다", async () => {
    const db = makeFakeDb(m2SnapshotRows);
    // Fix2: M2_BENCHMARK_CASES에서 target case 찾기
    const targetCase = M2_BENCHMARK_CASES.find((c) => c.id === "bm-injury-preexisting-01");
    if (!targetCase) throw new Error("target case not found");

    const resultA = await retrieveEvidence([targetCase.query], db, "A");
    const candidatesA = resultA.get(targetCase.query.id) ?? [];
    expect(hitAt5(candidatesA, targetCase.knownRelevantEvidenceIds)).toBe(0);

    const resultB = await retrieveEvidence([targetCase.query], db, "B");
    const candidatesB = resultB.get(targetCase.query.id) ?? [];
    expect(hitAt5(candidatesB, targetCase.knownRelevantEvidenceIds)).toBe(1);
  });

  it("[M2 EXPLORATORY] 전략 A/B의 Recall@5/Hit@5/Precision@5를 측정·기록한다 — non-regression 계약(design.md §3.3b) 확인 (Blocker1 수정 후 corrected baseline)", async () => {
    // Fix2: measureStrategy에 M2_BENCHMARK_CASES 전달
    const metricsA = await measureStrategy("A", m2SnapshotRows, M2_BENCHMARK_CASES);
    const metricsB = await measureStrategy("B", m2SnapshotRows, M2_BENCHMARK_CASES);

    // [M2 EXPLORATORY] 라벨: 이 console.log 출력은 progress.md에 그대로 옮겨
    // 기록되며, M4d의 frozen 최종 비교와는 별개 절로 분리 서술된다.
    // Blocker1 수정 후 재측정: strategy A는 computeBaselineScore(issueTypeWeight=0) 적용.
    console.log(
      "[M2 EXPLORATORY] strategy A (corrected baseline):",
      JSON.stringify(metricsA, null, 2)
    );
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
// Section D — [M4d FINAL] benchmark (M4c freeze 후 채워짐, post-correction 재측정)
// ─────────────────────────────────────────────────────────────────────────────

describe("evidence-retriever [M4d FINAL] (algorithm effect — frozen corpus 21건)", () => {
  // M4c ground truth freeze 완료 후 채운 최종 측정 섹션.
  // Corpus: db/seed/evidence.json (21건, M4 full 확장 후 frozen).
  // Baseline: strategy A (computeBaselineScore — issueTypeWeight=0, Blocker1 수정)
  // New:      strategy B (computeScore — issueTypeWeight=10 포함)
  //
  // Fix1/3/4/5 post-correction 재측정:
  // - Fix1: 전략 A sort = score desc only (기존 main baseline)
  // - Fix3: bm-disease-grade-01 ground truth 수정 (004/017/018 포함)
  // - Fix4: seed-021 DIAGNOSIS 제거 → bm-disease-diagnosis-01에서 제외
  // - Fix5: 빈 ground-truth → null + mean 제외 (now no empty cases)
  // 모든 테스트는 [FROZEN] 라벨을 사용한다.

  it("[FROZEN] REQ-013 target case: strategy A miss, strategy B hit — bm-injury-preexisting-01", async () => {
    // REQ-EVIDENCE-013: keywords=["연골 손상"]은 21건 corpus 어디에도 없어 keywordScore=0.
    // strategy A(computeBaselineScore) = keyword 필수 → miss.
    // strategy B = issueType exact match(PRE_EXISTING_CONDITION)로 seed-005/016/020 복구 → hit.
    const db = makeFakeDb(seedRows);
    const targetCase = BENCHMARK_CASES.find((c) => c.id === "bm-injury-preexisting-01");
    if (!targetCase) throw new Error("target case not found");

    const resultA = await retrieveEvidence([targetCase.query], db, "A");
    const candidatesA = resultA.get(targetCase.query.id) ?? [];
    // REQ-013 invariant i: baseline(A)는 반드시 miss
    expect(hitAt5(candidatesA, targetCase.knownRelevantEvidenceIds)).toBe(0);

    const resultB = await retrieveEvidence([targetCase.query], db, "B");
    const candidatesB = resultB.get(targetCase.query.id) ?? [];
    // REQ-013 invariant ii: new(B)는 반드시 hit
    expect(hitAt5(candidatesB, targetCase.knownRelevantEvidenceIds)).toBe(1);
  });

  it("[FROZEN] B >= A non-regression 계약 및 전체 케이스 metric 측정 (post-correction re-measurement)", async () => {
    // Fix2: measureStrategy에 BENCHMARK_CASES(FINAL) 전달
    const metricsA = await measureStrategy("A", seedRows, BENCHMARK_CASES);
    const metricsB = await measureStrategy("B", seedRows, BENCHMARK_CASES);

    // [FROZEN] post-correction 재측정 기록 (Fix1/3/4/5 적용 후)
    console.log(
      "[M4d FROZEN post-correction] strategy A (true baseline, issueTypeWeight=0):",
      JSON.stringify(metricsA, null, 2)
    );
    console.log(
      "[M4d FROZEN post-correction] strategy B (new, issueTypeWeight=10):",
      JSON.stringify(metricsB, null, 2)
    );

    // design.md §3.3b: B >= A on all 3 metrics (non-regression contract)
    // 이 assertion이 실패하면 임의 조정 금지 — blocker report로 반환한다.
    expect(metricsB.meanRecall).toBeGreaterThanOrEqual(metricsA.meanRecall);
    expect(metricsB.meanHit).toBeGreaterThanOrEqual(metricsA.meanHit);
    expect(metricsB.meanPrecision).toBeGreaterThanOrEqual(metricsA.meanPrecision);
  });
});
