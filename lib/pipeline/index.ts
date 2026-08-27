import type { RoleProviders } from "../ai/provider-factory";
import { getDefaultLLMProviders } from "../ai/provider-factory";
import { normalizeCase } from "./case-normalizer";
import { retrieveEvidence } from "./evidence-retriever";
import { research } from "./researcher";
import { planQueries } from "./query-planner";
import { challenge } from "./skeptic";
import type { CaseInput, ResearchReport, ReviewTarget } from "./types";
import { verify } from "./verifier";

// 파이프라인 오케스트레이터 — 6단계(CaseNormalizer → QueryPlanner →
// EvidenceRetriever → Researcher → Skeptic → Verifier)를 순차 실행해
// seed evidence와 연결된 Research Report를 생성한다(REQ-SCAFFOLD-014,
// AC-SCAFFOLD-013). index.ts만 각 단계 모듈을 import하는 유일한 파일이다
// (AC-SCAFFOLD-012).
//
// 오케스트레이터 수준 역할별(Research/Fast) provider 주입 지점(design.md §1,
// §3) — options.providers가 없으면 getDefaultLLMProviders()(프로세스 생애주기
// 싱글턴, design.md §1 D-NEW1)가 env 기반으로 선택한 research/fast provider를
// research()에는 researchProvider를, challenge()/verify()에는 fastProvider를
// 전달한다. 세 함수는 provider를 필수 인자로 요구하며(선택적 기본값 없음),
// 이 오케스트레이터가 provider 선택 로직의 유일한 정상 앱 경로다.
//
// @MX:ANCHOR: [AUTO] research()/challenge()/verify() 세 함수 모두의 유일한
// 정상 앱 진입점 — provider 인자를 누락하지 않고 전달하는 책임을 이 함수가
// 단독으로 진다(design.md §3).
// @MX:REASON: provider가 생략되면 세 함수 모두 컴파일 오류가 나도록
// 설계되었으므로(선택적 기본값 없음), 이 호출부가 provider 전달을
// 빠뜨리면 파이프라인 전체가 컴파일되지 않는다 — 이 anchor가 그 계약을
// 명시한다.
//
// @MX:WARN: [AUTO] 6단계를 순차 async로 실행하는 체인 — 한 단계의 실패가
// 전체 파이프라인 실패로 즉시 전파된다.
// @MX:REASON: 각 단계가 이전 단계의 출력에 의존하는 순차 실행이므로,
// 병렬화하면 이 순차성 가정이 깨진다(plan.md §F).
export interface RunPipelineOptions {
  providers?: RoleProviders;
}

export async function runPipeline(
  input: CaseInput,
  options: RunPipelineOptions = {}
): Promise<ResearchReport> {
  const { research: researchProvider, fast: fastProvider } =
    options.providers ?? getDefaultLLMProviders();
  const caseSummary = normalizeCase(input);
  const queries = planQueries(caseSummary);
  const evidence = await retrieveEvidence(queries);
  const findings = await research(queries, evidence, researchProvider);
  const challenges = await challenge(findings, evidence, fastProvider);
  const verification = await verify(queries, findings, challenges, evidence, fastProvider);

  // reviewTargets 도출 — planQueries()가 이미 (domain, issueType) 쌍마다
  // 유일한 ResearchQuery를 생성하므로(design.md §5), 쿼리 하나당 하나의
  // ReviewTarget으로 그대로 매핑한다(design.md §8 "검토할 담보 목록").
  const reviewTargets: ReviewTarget[] = queries.map((query) => ({
    domain: query.domain,
    issueType: query.issueType,
    description: query.topic,
  }));

  // VerificationResult(verify()의 반환값)의 세 필드를 그대로 옮겨 담는다
  // (design.md §3, §8) — missingMaterials/uncertainty를 별도로 재계산하지
  // 않는다.
  return {
    caseSummary,
    reviewTargets,
    verifiedClaims: verification.verifiedClaims,
    missingMaterials: verification.missingMaterials,
    uncertainty: verification.uncertainty,
    generatedAt: new Date().toISOString(),
  };
}
