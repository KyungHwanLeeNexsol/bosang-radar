import { describe, expect, it } from "vitest";
import type {
  GenerateResponse,
  GenerateStructuredRequest,
  LLMProvider,
  StructuredResult,
} from "../ai/provider";
import { challenge } from "./skeptic";
import { planQueries } from "./query-planner";
import { retrieveEvidence } from "./evidence-retriever";
import type { DraftFinding, EvidenceCandidate, NormalizedCase } from "./types";

// SPEC-EVIDENCE-001 M3 — counterEvidenceIds=[] 진단 fixture (design.md §4.1/§4.2).
//
// 이 파일은 A(corpus에 없음)/B(top-K 탈락)/C-전제조건(Skeptic 프롬프트 누락)
// 3단계를 결정론적 fake/mock만으로 단위 테스트한다(REQ-EVIDENCE-023/024 — 실제
// Gemini 호출 없음, 논리적 호출 수 불변). 이 fixture는 harness 자신이 A/B/C-전제
// 3단계를 정상적으로 관측할 수 있는지를 검증하는 self-test다 — 2026-08-27/
// 2026-08-28 실제 Gemini smoke의 counterEvidenceIds=[] 원인을 판정하지 않는다
// (REQ-EVIDENCE-019, design.md §4.3 해석표 참고). "이 fixture에서 A/B가
// 확인됐으므로 실제 smoke의 A/B는 배제된다"는 서술은 어디에도 남기지 않는다.

// 1) 고정 synthetic 사건 — PII 없음(합성 사고 경위/진단명, 실명·주민번호·
// 전화번호 없음). "이전"/"기존"/"퇴행성" 키워드를 의도적으로 포함해
// PRE_EXISTING_CONDITION 쿼리가 조건부로 생성되도록 한다(query-planner.ts).
const fixtureCase: NormalizedCase = {
  incidentDescription:
    "이전에 진단받은 기존 퇴행성 변화가 있는 상태에서 계단에서 넘어지는 사고로 발목을 심하게 다쳤다.",
  diagnosisName: "좌측 발목 관절 인대 파열",
  disabilityBodyPart: "좌측 발목",
  incidentDate: "2026-01-01",
  normalizedAt: "2026-01-01T00:00:00.000Z",
};

// 2) 고정 evidence corpus 스냅샷 — 최소 1건은 "counter-relevant"로 의도적으로
// 배치한 evidence다(REQ-EVIDENCE-019). title/content 어디에도 query keyword
// ("좌측 발목"/"기왕증"/"퇴행성")를 포함하지 않도록 설계해, 전략 B의 issueType
// exact match 경로(design.md §2.1)만으로 candidate에 진입함을 확인한다 —
// M2가 채택한 ADOPTED_STRATEGY="B"(evidence-retriever.ts)가 실제로 이
// evidence를 후보로 끌어올리는지가 이 fixture의 관측 대상이다.
const fixtureEvidence: EvidenceCandidate[] = [
  {
    id: "known-counter-relevant-id",
    category: "상해후유장해",
    evidenceType: "PRECEDENT",
    scope: "DOMAIN_SPECIFIC",
    title: "이미 존재하던 신체 소인의 결과 기여도에 관한 판단",
    content:
      "이미 존재하던 신체 소인이 사고 이후 결과에 기여했다고 인정되는 경우, 그 기여도를 반영해 지급액을 " +
      "조정할 수 있다는 취지의 판단이 실무상 다투어진다.",
    sourceUrl: null,
    issueTypes: ["PRE_EXISTING_CONDITION"],
  },
];

function makeFakeDb(rows: EvidenceCandidate[]): Parameters<typeof retrieveEvidence>[1] {
  return {
    select: () => ({
      from: async () => rows,
    }),
  } as unknown as Parameters<typeof retrieveEvidence>[1];
}

function makeCapturingProvider(): { provider: LLMProvider; capturedPrompt: () => string } {
  let captured = "";
  const provider: LLMProvider = {
    async generate(): Promise<GenerateResponse> {
      return { text: "stub" };
    },
    async generateStructured<T>(
      request: GenerateStructuredRequest<T>
    ): Promise<StructuredResult<T>> {
      captured = request.prompt;
      const candidate = { challenges: [] };
      const result = request.schema.safeParse(candidate);
      return result.success
        ? { ok: true, data: result.data }
        : { ok: false, reason: "schema_validation_failed", raw: JSON.stringify(candidate) };
    },
  };
  return { provider, capturedPrompt: () => captured };
}

const queries = planQueries(fixtureCase);
const targetQuery = queries.find(
  (q) => q.domain === "INJURY_DISABILITY" && q.issueType === "PRE_EXISTING_CONDITION"
);
if (!targetQuery) {
  throw new Error(
    "fixture 오류 — PRE_EXISTING_CONDITION 쿼리가 planQueries()에서 생성되지 않았다(query-planner.ts 트리거 키워드 확인 필요)"
  );
}
const targetQueryId = targetQuery.id;

describe("lib/pipeline/evidence-diagnostic — A/B/C-전제조건 진단 fixture (REQ-EVIDENCE-019, design.md §4.2)", () => {
  it("A: corpus에 counter-relevant evidence가 존재하는지 확인 (AC-EVIDENCE-016a)", () => {
    expect(fixtureEvidence.some((e) => e.id === "known-counter-relevant-id")).toBe(true);
  });

  it("B: Retriever가 그 evidence를 후보로 반환하는지 확인 — top-K 탈락 여부 (AC-EVIDENCE-016b)", async () => {
    const candidates = await retrieveEvidence(queries, makeFakeDb(fixtureEvidence));
    const relevantForQuery = candidates.get(targetQueryId) ?? [];

    expect(relevantForQuery.some((c) => c.id === "known-counter-relevant-id")).toBe(true);
  });

  it("C-전제조건: Skeptic 프롬프트에 그 evidence ID가 실제로 포함되어 전달되는지 확인 (AC-EVIDENCE-016c)", async () => {
    const candidates = await retrieveEvidence(queries, makeFakeDb(fixtureEvidence));
    const findings: DraftFinding[] = [
      {
        queryId: targetQueryId,
        summary: "발목 후유장해 판정 시 기존 신체 상태의 영향 여부 검토",
        supportingEvidenceIds: [],
      },
    ];
    const { provider, capturedPrompt } = makeCapturingProvider();

    await challenge(findings, candidates, provider);

    // 이 지점 이후("모델이 실제로 counterEvidenceIds에 포함시켰는가")는 이
    // unit test의 범위 밖 — 실 Gemini smoke 리포트
    // (.moai/reports/gemini-*-smoke-*.md)와 상호 참조한다(design.md §4.1).
    expect(capturedPrompt()).toContain("known-counter-relevant-id");
  });
});
