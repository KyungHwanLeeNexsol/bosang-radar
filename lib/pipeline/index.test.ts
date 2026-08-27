import { describe, expect, it, vi } from "vitest";
import { createDeterministicLLMProvider } from "../ai/providers/deterministic";

// 결정론적 provider(design.md §1)로 Gemini API 호출 없이 파이프라인 전 구간을
// 검증한다. EvidenceRetriever(M4)가 정적 seed JSON 대신 실제 Drizzle DB
// 조회로 재작성되면서(evidence-retriever.ts) retrieveEvidence()의 기본
// 인자(db = getDb())가 TURSO_DATABASE_URL 등 app 스코프 환경변수를 요구하게
// 되었다 — runPipeline()은 db를 옵션으로 노출하지 않으므로,
// evidence-retriever.test.ts가 db를 직접 주입받는 것과 동일한 효과를 이
// 통합 테스트에서는 "../db/client" 모듈 목업으로 재현한다(get-case-for-owner.test.ts와
// 동일한 vi.mock 패턴).
const { fakeEvidenceRows } = vi.hoisted(() => ({
  fakeEvidenceRows: [
    {
      id: "vitest-index-evidence-1",
      category: "상해후유장해",
      evidenceType: "PRECEDENT",
      scope: "UNIVERSAL",
      title: "우측 발목 관련 결정론적 테스트 근거자료",
      content: "우측 발목 상해 관련 검토용 테스트 콘텐츠입니다.",
      sourceUrl: null,
    },
  ],
}));

vi.mock("../db/client", () => ({
  getDb: vi.fn(() => ({
    select: () => ({
      from: async () => fakeEvidenceRows,
    }),
  })),
}));

const validInput = {
  incidentDescription: "2024년 3월, 계단에서 미끄러져 우측 발목을 다쳤습니다.",
  diagnosisName: "우측 발목 인대 파열",
  disabilityBodyPart: "우측 발목",
  incidentDate: "2024-03-15",
};

describe("lib/pipeline/index runPipeline end-to-end (AC-SCAFFOLD-013, REQ-SCAFFOLD-014, AC-RESEARCH-025)", () => {
  it("6단계(CaseNormalizer→QueryPlanner→EvidenceRetriever→Researcher→Skeptic→Verifier)를 순차 실행해 seed evidence와 연결된 Research Report를 생성한다", async () => {
    const { runPipeline } = await import("./index");

    // 결정론적 provider를 명시 주입한다 — Gemini API 키가 없는 테스트 환경에서도
    // 실제 네트워크 호출 없이 파이프라인 전 구간을 검증한다(design.md §1, §3,
    // AC-RESEARCH-025). options.provider가 있으면 getLLMProvider()(env 기반
    // 선택)는 호출되지 않는다(lib/pipeline/index.ts).
    const report = await runPipeline(validInput, {
      provider: createDeterministicLLMProvider(),
    });

    expect(report.caseSummary.incidentDescription).toBe(validInput.incidentDescription);
    expect(report.verifiedClaims.length).toBeGreaterThan(0);
    // VERIFIED claim은 반드시 evidence를 갖고, INSUFFICIENT claim은 반드시
    // 비어 있어야 한다(2차 코드 리뷰 item 1 — semantic verification fail-closed
    // 시 claim.status와 supportingEvidenceIds가 항상 함께 비워지도록 정합화됨).
    // 최소 하나는 VERIFIED로 evidence-backed claim이 실제로 존재함을 확인한다.
    for (const claim of report.verifiedClaims) {
      if (claim.status === "VERIFIED") {
        expect(claim.supportingEvidenceIds.length).toBeGreaterThan(0);
      } else {
        expect(claim.supportingEvidenceIds.length).toBe(0);
      }
    }
    expect(report.verifiedClaims.some((claim) => claim.status === "VERIFIED")).toBe(true);
    expect(() => new Date(report.generatedAt).toISOString()).not.toThrow();
  });
});
