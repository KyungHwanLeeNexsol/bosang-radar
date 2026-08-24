import { normalizeCase } from "./case-normalizer";
import { retrieveEvidence } from "./evidence-retriever";
import { research } from "./researcher";
import { planQueries } from "./query-planner";
import { challenge } from "./skeptic";
import type { CaseInput, ResearchReport } from "./types";
import { verify } from "./verifier";

// 파이프라인 오케스트레이터 — 6단계(CaseNormalizer → QueryPlanner →
// EvidenceRetriever → Researcher → Skeptic → Verifier)를 순차 실행해
// seed evidence와 연결된 Research Report를 생성한다(REQ-SCAFFOLD-014,
// AC-SCAFFOLD-013). index.ts만 각 단계 모듈을 import하는 유일한 파일이다
// (AC-SCAFFOLD-012).
//
// @MX:WARN: [AUTO] 6단계를 순차 async로 실행하는 체인 — 한 단계의 실패가
// 전체 파이프라인 실패로 즉시 전파된다.
// @MX:REASON: 각 단계가 이전 단계의 출력에 의존하는 순차 실행이므로,
// 병렬화하면 이 순차성 가정이 깨진다(plan.md §F).
export async function runPipeline(input: CaseInput): Promise<ResearchReport> {
  const caseSummary = normalizeCase(input);
  const queries = planQueries(caseSummary);
  const evidence = await retrieveEvidence(queries);
  const findings = await research(queries, evidence);
  const challenges = await challenge(findings);
  const claims = await verify(findings, challenges);

  return {
    caseSummary,
    claims,
    generatedAt: new Date().toISOString(),
  };
}
