import { describe, expect, it, vi } from "vitest";
import type { LLMProvider } from "../ai/provider";
import { createDeterministicLLMProvider } from "../ai/providers/deterministic";

vi.mock("../db/client", () => ({
  getDb: vi.fn(() => ({
    select: () => ({
      from: async () => [
        {
          id: "hybrid-evidence-1",
          category: "공통 근거",
          evidenceType: "PRECEDENT",
          scope: "UNIVERSAL",
          title: "하이브리드 라우팅 테스트 근거",
          content: "장해와 인과관계를 검토할 때 참고하는 테스트 근거입니다.",
          sourceUrl: null,
          issueTypes: "[]",
        },
      ],
    }),
  })),
}));

function observingProvider(prompts: string[]): LLMProvider {
  const base = createDeterministicLLMProvider();
  return {
    generate: (request) => base.generate(request),
    generateStructured: (request) => {
      prompts.push(request.prompt);
      return base.generateStructured(request);
    },
  };
}

const standardInput = {
  incidentDescription: "2024년 3월 계단에서 미끄러져 오른쪽 발목을 다쳤습니다.",
  diagnosisName: "우측 발목 인대 파열",
  disabilityBodyPart: "우측 발목",
  incidentDate: "2024-03-15",
};

describe("runPipeline hybrid research routing", () => {
  it("일반 사건의 Researcher를 Lite에 보내고 Premium 호출을 아낀다", async () => {
    const { runPipeline } = await import("./index");
    const premiumPrompts: string[] = [];
    const litePrompts: string[] = [];

    const report = await runPipeline(standardInput, {
      providers: {
        research: observingProvider(premiumPrompts),
        fast: observingProvider(litePrompts),
      },
    });

    expect(report.verifiedClaims.some((claim) => claim.status === "VERIFIED")).toBe(true);
    expect(premiumPrompts).toHaveLength(0);
    expect(litePrompts.some((prompt) => prompt.includes("[RESEARCH]"))).toBe(true);
  });

  it("기왕증 신호가 있는 복합 사건은 처음부터 Premium Researcher에 보낸다", async () => {
    const { runPipeline } = await import("./index");
    const premiumPrompts: string[] = [];
    const litePrompts: string[] = [];

    await runPipeline(
      {
        ...standardInput,
        incidentDescription:
          "기존 퇴행성 소견이 있던 상태에서 계단에서 미끄러져 오른쪽 발목을 다쳤습니다.",
      },
      {
        providers: {
          research: observingProvider(premiumPrompts),
          fast: observingProvider(litePrompts),
        },
      }
    );

    expect(premiumPrompts.filter((prompt) => prompt.includes("[RESEARCH]"))).toHaveLength(1);
    expect(litePrompts.some((prompt) => prompt.includes("[RESEARCH]"))).toBe(false);
  });
});
