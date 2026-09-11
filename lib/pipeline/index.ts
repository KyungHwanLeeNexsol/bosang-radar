import type { RoleProviders } from "../ai/provider-factory";
import { getDefaultLLMProviders } from "../ai/provider-factory";
import { toSafeErrorMeta } from "../logging/safe-error";
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

// @MX:NOTE: [AUTO] 동시 사건 제한(design.md §4, REQ-GEMINI-RUNTIME-013/014) —
// 순수 인메모리 Promise 체인 뮤텍스다(신규 의존성 없음, Redis 없음, 큐
// 프레임워크 없음). 프로세스 로컬 보호일 뿐이며 분산 락이 아니다 — Node.js
// 모듈 스코프 변수이므로 Netlify의 서로 다른 serverless 인스턴스(별도
// 프로세스) 사이에서는 전혀 공유되지 않는다. 대기 시간에 참된 상한은
// 없다(design.md §4 D4) — 락 보유자의 Gemini 네트워크 지연, RateScheduler
// 페이싱 대기, GeminiProvider.withRetry() 재시도 대기가 모두 이 대기
// 시간에 합산되며, 이 중 어느 것도 maxTotalWaitMs(재시도 sleep 구간에만
// 적용되는 상한)로 유계화되지 않는다.
let pipelineChain: Promise<unknown> = Promise.resolve();

function withPipelineLock<T>(task: () => Promise<T>): Promise<T> {
  const settled = pipelineChain.then(task, task); // 앞선 작업의 성공/실패와 무관하게 항상 실행
  pipelineChain = settled.then(
    () => undefined,
    () => undefined // 체인이 한번 끊기면 이후 모든 호출이 즉시 실행돼버리므로, 실패도 반드시 삼켜 체인을 이어간다
  );
  return settled;
}

// SPEC-PILOT-READY-001 M2(REQ-PILOT-READY-008) — 파이프라인 각 단계
// (CaseNormalizer→QueryPlanner→EvidenceRetriever→Researcher→Skeptic→Verifier)
// 실패 시 단계 이름과 오류 요약을 로그로 남긴다. 사건 입력 원문(자유 텍스트
// 3개 필드)은 절대 로그에 포함하지 않는다(PII 최소화 원칙 유지) — 이
// 헬퍼는 stage 이름과 error 요약만 기록하며 task의 인자를 로그에 담지 않는다.
//
// v0.6.0(외부 구현 검토 5차 반영) — `error: String(error)`는 근본 원인
// 오류의 .message가 우연히 사건 입력 원문을 반사할 위험이 있어,
// toSafeErrorMeta()로 화이트리스트 메타데이터(errorName/errorCode)만
// 기록하도록 강화했다(lib/logging/safe-error.ts).
function withStageLogging<T>(stage: string, task: () => T): T {
  try {
    return task();
  } catch (error) {
    console.error(
      JSON.stringify({ event: "pipeline_stage_failed", stage, ...toSafeErrorMeta(error) })
    );
    throw error;
  }
}

async function withAsyncStageLogging<T>(stage: string, task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch (error) {
    console.error(
      JSON.stringify({ event: "pipeline_stage_failed", stage, ...toSafeErrorMeta(error) })
    );
    throw error;
  }
}

export async function runPipeline(
  input: CaseInput,
  options: RunPipelineOptions = {}
): Promise<ResearchReport> {
  const { research: researchProvider, fast: fastProvider } =
    options.providers ?? getDefaultLLMProviders();
  const caseSummary = withStageLogging("CaseNormalizer", () => normalizeCase(input));
  const queries = withStageLogging("QueryPlanner", () => planQueries(caseSummary));
  const evidence = await withAsyncStageLogging("EvidenceRetriever", () =>
    retrieveEvidence(queries)
  );
  const verification = await withPipelineLock(async () => {
    const findings = await withAsyncStageLogging("Researcher", () =>
      research(queries, evidence, researchProvider)
    );
    const challenges = await withAsyncStageLogging("Skeptic", () =>
      challenge(findings, evidence, fastProvider)
    );
    return withAsyncStageLogging("Verifier", () =>
      verify(queries, findings, challenges, evidence, fastProvider)
    );
  });

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
