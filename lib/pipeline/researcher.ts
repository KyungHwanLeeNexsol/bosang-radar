import { z } from "zod";
import type { LLMProvider } from "../ai/provider";
import { findSafetyViolations } from "./safety-validator";
import type { DraftFinding, EvidenceCandidate, ResearchQuery } from "./types";

// Researcher (4/6) — 리서치 쿼리 + evidence로부터 초안 소견을 생성한다
// (REQ-RESEARCH-016/017). SPEC-GEMINI-RUNTIME-001 M2: 쿼리 개수만큼(N회)
// 호출하던 것을 사건당 1회 논리적 배치 호출로 전환한다(REQ-GEMINI-RUNTIME-004).
//
// 구조 검증은 Zod 스키마로만 수행하며(.refine()/.min() 없음) — 배치 안의 한
// 항목이 위조 evidence ID를 인용하거나 evidence가 비어 있어도, Zod의 배열
// 검증 특성상 항목 하나의 스키마 위반이 배치 전체를 실패시키는 것을 피하기
// 위해서다. evidence-ID 무결성(그라운딩 계약, 최소 1건)은 파싱 성공 이후
// 애플리케이션 코드가 항목별로 적용한다(design.md §2,
// REQ-GEMINI-RUNTIME-007 5단계 순서).
//
// @MX:ANCHOR: [AUTO] runPipeline()의 유일한 정상 앱 호출부(index.ts) 외에
// 형제 파이프라인 단계 모듈이 이 파일을 직접 import하지 않는다
// (AC-SCAFFOLD-012 — lib/pipeline/boundary.test.ts로 검증).
// @MX:REASON: 파이프라인 단계 모듈 간 형제-import를 금지하는 구조적 경계가
// evidence-ID 무결성 방어선의 위치(각 단계가 자신의 evidence만 본다)와
// 직접 맞물려 있다.
const findingItemSchema = z.object({
  queryId: z.string(),
  summary: z.string(),
  supportingEvidenceIds: z.array(z.string()),
});

function buildFindingBatchSchema() {
  return z.object({
    findings: z.array(findingItemSchema),
  });
}

interface ResearchCandidate {
  query: ResearchQuery;
  evidence: EvidenceCandidate[];
}

function buildResearchBatchPrompt(candidates: ResearchCandidate[]): string {
  const blocks = candidates.map(({ query, evidence }) => {
    const evidenceLines = evidence
      .map((item) => `- [${item.id}] ${item.title}: ${item.content}`)
      .join("\n");
    return [
      `[RESEARCH] 쿼리 ID: ${query.id}`,
      `쟁점: ${query.topic}`,
      `초점: ${query.focus}`,
      "아래 evidence 목록만을 근거로 검토 소견을 작성하라. 목록에 없는 evidence ID는 인용하지 말 것:",
      evidenceLines,
    ].join("\n");
  });

  return [
    ...blocks,
    "각 쿼리 ID에 대해 findings 배열에 정확히 한 개의 항목을 생성하라. 각 항목의 queryId 필드에는 " +
      "그 항목이 대응하는 쿼리 ID를 그대로 반환할 것.",
    "보험금 지급 확정, 반드시 지급, 구체적인 지급 확률·액수를 확정하는 표현은 사용하지 말 것 — " +
      '"검토 필요"/"관련 가능성 있음"/"현재 정보만으로 판단 불충분" 형태로만 서술할 것.',
  ].join("\n\n");
}

export async function research(
  queries: ResearchQuery[],
  evidence: Map<string, EvidenceCandidate[]>,
  provider: LLMProvider
): Promise<DraftFinding[]> {
  // evidence가 있는 query만 배치 candidate로 모은다 — evidence가 없는 query는
  // 억지 finding을 만들지 않고 candidate에서 제외한다(기존 continue 동작과
  // 동일한 제외 규칙, REQ-GEMINI-RUNTIME-004).
  const candidates: ResearchCandidate[] = queries
    .map((query) => ({ query, evidence: evidence.get(query.id) ?? [] }))
    .filter((candidate) => candidate.evidence.length > 0);

  if (candidates.length === 0) {
    return [];
  }

  const validEvidenceByQuery = new Map<string, Set<string>>(
    candidates.map((candidate) => [
      candidate.query.id,
      new Set(candidate.evidence.map((item) => item.id)),
    ])
  );
  const candidateQueryIds = new Set(candidates.map((candidate) => candidate.query.id));

  const result = await provider.generateStructured({
    prompt: buildResearchBatchPrompt(candidates),
    schema: buildFindingBatchSchema(),
  });

  // 배치 응답 전체가 최상위에서 파싱 불가능한 진짜 구조적 실패는 이번 호출
  // 전체를 findings 없음으로 처리한다(REQ-GEMINI-RUNTIME-007 단서).
  if (!result.ok) {
    return [];
  }

  const findings: DraftFinding[] = [];
  const seenQueryIds = new Set<string>();

  for (const item of result.data.findings) {
    // (1) candidate 소속 확인
    if (!candidateQueryIds.has(item.queryId)) {
      continue;
    }
    // (2) 중복 응답 처리 — 같은 queryId의 두 번째 이후 항목은 폐기(첫 응답만 채택)
    if (seenQueryIds.has(item.queryId)) {
      continue;
    }
    seenQueryIds.add(item.queryId);

    // (3) Researcher 항목에 한해 그라운딩 계약을 재검증(D-NEW2) — 최소 1개의
    // 실제 query-evidence ID를 인용해야 한다. 위반 시 이 항목만 폐기하고
    // 같은 배치의 다른 정상 항목에는 영향을 주지 않는다(AC-GEMINI-RUNTIME-009a).
    if (item.supportingEvidenceIds.length < 1) {
      continue;
    }

    // (4) evidence ID가 그 query 고유의 유효 집합의 부분집합인지 확인 —
    // 다른 query에게 전달된 evidence ID를 인용하면 폐기한다(query별
    // evidence 격리, REQ-GEMINI-RUNTIME-008).
    const validIds = validEvidenceByQuery.get(item.queryId);
    if (!validIds || !item.supportingEvidenceIds.every((id) => validIds.has(id))) {
      continue;
    }

    // (4.5) post-run fix: summary가 빈 문자열이면 그 항목만 개별 폐기한다 —
    // Zod 스키마는 summary: z.string()으로만 검증하고 .min(1)을 두지 않으므로
    // (배치 부분 실패 설계 유지, 상단 주석 참고), 파싱 성공 이후 항목별
    // 업무 규칙으로 비어있지 않음을 재확인한다(배치 전환 이전 summary:
    // z.string().min(1) 계약의 의미적 회귀를 원복).
    if (item.summary.length < 1) {
      continue;
    }

    // (5) safety-validator — 보험금 지급 확정성 금지 표현 방어선(Fix-A).
    if (findSafetyViolations(item.summary).length > 0) {
      continue;
    }

    findings.push({
      queryId: item.queryId,
      summary: item.summary,
      supportingEvidenceIds: item.supportingEvidenceIds,
    });
  }

  return findings;
}
