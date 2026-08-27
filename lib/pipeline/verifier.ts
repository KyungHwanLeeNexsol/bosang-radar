import { z } from "zod";
import type { LLMProvider } from "../ai/provider";
import { findSafetyViolations } from "./safety-validator";
import type {
  Challenge,
  DraftFinding,
  EvidenceCandidate,
  MissingMaterial,
  ResearchQuery,
  VerificationResult,
  VerifiedClaim,
  VerifiedCounterArgument,
} from "./types";

// Verifier (6/6) — Researcher의 claim과 Skeptic의 evidence 양쪽을 evidence
// 대비 재검증하는 2차 방어선(design.md §7 defense-in-depth)이자, 원본
// queries와 findings를 대조해 missingMaterials를 산출한다(4차 revision).
// product.md §핵심 원칙 — "AI 판단은 evidence와 연결" — 을 satisfy하기 위해
// 각 claim은 재검증을 통과한 supportingEvidenceIds만 유지한다.
//
// 코드 리뷰 지적(Fix-B): 구조적 evidence-ID 존재 여부만 검증할 뿐, evidence의
// CONTENT가 실제로 claim을 뒷받침하는지는 전혀 검증하지 않았다 — 실존하지만
// 무관한 evidence ID 하나만 인용해도 "VERIFIED"가 될 수 있었다. 이 파일은
// 구조적 필터링(아래 (a)/(b))을 그대로 유지한 채, 그 위에 provider 기반
// 의미 검증 단계를 추가한다.
//
// 후속 코드 리뷰 지적(item 1): Fix-B의 의미 검증은 DraftFinding.summary +
// finding.supportingEvidenceIds만 대상으로 했고, VerifiedCounterArgument
// (Skeptic 반론)의 supportingEvidenceIds/counterEvidenceIds는 ID 존재
// 여부만 구조적으로 검사되었다 — evidence 내용이 실제 반론을 뒷받침하는지는
// 검사되지 않았다. 아래 의미 검증 단계는 사건당 1회 구조화 호출 원칙을
// 유지한 채, claim과 counterArgument를 모두 하나의 호출에 담아 검증한다.
// 반환 계약도 단순 supported:boolean 대신, 실제로 의미 검증을 통과한
// evidence ID의 부분집합(supportedEvidenceIds/counterEvidenceIds)을
// 반환하도록 바뀌었다 — LLM이 반환하는 모든 evidence ID는 반드시 해당
// candidate가 실제로 받은 evidence ID 집합의 부분집합이어야 한다(.refine()).

// --- 의미 검증(semantic verification) 단계 (Fix-B + item 1 확장) -----------

interface SemanticClaimVerdict {
  queryId: string;
  supportedEvidenceIds: string[];
  reason: string;
}

interface SemanticCounterArgumentVerdict {
  queryId: string;
  counterArgumentIndex: number;
  supportedEvidenceIds: string[];
  counterEvidenceIds: string[];
  reason: string;
}

interface SemanticVerificationResponse {
  claims: SemanticClaimVerdict[];
  counterArguments: SemanticCounterArgumentVerdict[];
}

interface SemanticClaimCandidate {
  workingIndex: number;
  queryId: string;
  summary: string;
  evidenceIds: string[];
  evidenceItems: EvidenceCandidate[];
}

interface SemanticCounterArgumentCandidate {
  workingIndex: number;
  caIndex: number;
  queryId: string;
  counterArgumentIndex: number;
  summary: string;
  supportingEvidenceIds: string[];
  counterEvidenceIds: string[];
  supportingEvidenceItems: EvidenceCandidate[];
  counterEvidenceItems: EvidenceCandidate[];
}

function counterArgumentKey(queryId: string, index: number): string {
  return `${queryId}::${index}`;
}

// 전체 배치(claim + counterArgument)를 한 번의 구조화 호출로 처리하기 위한
// 단일 스키마(비용 최소화, 사건당 Verifier structured call 1회 원칙 유지).
// skeptic.ts의 buildChallengeSchema와 동일한 "LLM은 식별자를 지어낼 수
// 없다" 원칙을 적용한다: 반환된 모든 queryId/(queryId, counterArgumentIndex)는
// 실제로 전달된 candidate 집합의 원소여야 하고(.refine() 1), candidate
// 집합과 정확히 1:1 대응해야 한다(.refine() 2). 추가로(item 1) 각 candidate가
// 반환하는 evidence ID는 그 candidate에게 실제로 전달된 evidence ID 집합의
// 부분집합이어야 한다(.refine() 3).
function buildSemanticVerificationSchema(
  claimCandidates: SemanticClaimCandidate[],
  counterArgumentCandidates: SemanticCounterArgumentCandidate[]
) {
  const claimQueryIds = new Set(claimCandidates.map((c) => c.queryId));
  const claimEvidenceById = new Map(
    claimCandidates.map((c) => [c.queryId, new Set(c.evidenceIds)])
  );

  const caKeys = new Set(
    counterArgumentCandidates.map((c) => counterArgumentKey(c.queryId, c.counterArgumentIndex))
  );
  const caSupportingById = new Map(
    counterArgumentCandidates.map((c) => [
      counterArgumentKey(c.queryId, c.counterArgumentIndex),
      new Set(c.supportingEvidenceIds),
    ])
  );
  const caCounterById = new Map(
    counterArgumentCandidates.map((c) => [
      counterArgumentKey(c.queryId, c.counterArgumentIndex),
      new Set(c.counterEvidenceIds),
    ])
  );

  const claimSchema = z
    .array(
      z.object({
        queryId: z.string(),
        supportedEvidenceIds: z.array(z.string()),
        reason: z.string().min(1),
      })
    )
    .refine((items) => items.every((item) => claimQueryIds.has(item.queryId)), {
      message: "claim 후보 목록에 없는 queryId가 포함되었습니다.",
    })
    .refine(
      (items) =>
        items.length === claimQueryIds.size &&
        new Set(items.map((item) => item.queryId)).size === claimQueryIds.size,
      { message: "claim candidate 개수와 정확히 1:1로 대응해야 합니다(누락 또는 중복 금지)." }
    )
    .refine(
      (items) =>
        items.every((item) =>
          item.supportedEvidenceIds.every((id) =>
            (claimEvidenceById.get(item.queryId) ?? new Set<string>()).has(id)
          )
        ),
      { message: "claim에 실제로 전달되지 않은 evidence ID가 포함되었습니다." }
    );

  const counterArgumentSchema = z
    .array(
      z.object({
        queryId: z.string(),
        counterArgumentIndex: z.number().int().nonnegative(),
        supportedEvidenceIds: z.array(z.string()),
        counterEvidenceIds: z.array(z.string()),
        reason: z.string().min(1),
      })
    )
    .refine(
      (items) =>
        items.every((item) =>
          caKeys.has(counterArgumentKey(item.queryId, item.counterArgumentIndex))
        ),
      { message: "반론 후보 목록에 없는 (queryId, counterArgumentIndex)가 포함되었습니다." }
    )
    .refine(
      (items) =>
        items.length === caKeys.size &&
        new Set(items.map((item) => counterArgumentKey(item.queryId, item.counterArgumentIndex)))
          .size === caKeys.size,
      { message: "반론 candidate 개수와 정확히 1:1로 대응해야 합니다(누락 또는 중복 금지)." }
    )
    .refine(
      (items) =>
        items.every((item) => {
          const key = counterArgumentKey(item.queryId, item.counterArgumentIndex);
          const validSupport = caSupportingById.get(key) ?? new Set<string>();
          const validCounter = caCounterById.get(key) ?? new Set<string>();
          return (
            item.supportedEvidenceIds.every((id) => validSupport.has(id)) &&
            item.counterEvidenceIds.every((id) => validCounter.has(id))
          );
        }),
      { message: "반론에 실제로 전달되지 않은 evidence ID가 포함되었습니다." }
    );

  return z.object({
    claims: claimSchema,
    counterArguments: counterArgumentSchema,
  });
}

// 프롬프트에는 각 candidate의 식별자와, 구조적으로 유효한 evidence의 실제
// title+content를 포함한다 — LLM이 ID만으로는 content 기반 판단을 할 수
// 없기 때문이다. claim 블록은 "쿼리 ID: <id>"로, counterArgument 블록은
// "반론 쿼리 ID: <id>" + "반론 번호: <n>"으로 시작 줄을 고정해, deterministic
// provider/테스트 stub이 정규식으로 candidate 집합을 추출할 수 있게 한다.
function buildSemanticVerificationPrompt(
  claimCandidates: SemanticClaimCandidate[],
  counterArgumentCandidates: SemanticCounterArgumentCandidate[]
): string {
  const claimBlocks = claimCandidates.map((candidate) => {
    const evidenceLines = candidate.evidenceItems
      .map((item) => `  - [${item.id}] ${item.title}: ${item.content}`)
      .join("\n");
    return [
      `쿼리 ID: ${candidate.queryId}`,
      `소견: ${candidate.summary}`,
      "근거자료:",
      evidenceLines,
    ].join("\n");
  });

  const counterArgumentBlocks = counterArgumentCandidates.map((candidate) => {
    const supportingLines = candidate.supportingEvidenceItems
      .map((item) => `  - [${item.id}] ${item.title}: ${item.content}`)
      .join("\n");
    const counterLines = candidate.counterEvidenceItems
      .map((item) => `  - [${item.id}] ${item.title}: ${item.content}`)
      .join("\n");
    return [
      `반론 쿼리 ID: ${candidate.queryId}`,
      `반론 번호: ${candidate.counterArgumentIndex}`,
      `반론 내용: ${candidate.summary}`,
      "뒷받침 근거자료(supportingEvidence):",
      supportingLines || "  (없음)",
      "반박 근거자료(counterEvidence):",
      counterLines || "  (없음)",
    ].join("\n");
  });

  const sections: string[] = [];
  if (claimBlocks.length > 0) {
    sections.push(
      [
        "아래 각 소견(쿼리 ID별)이 제시된 근거자료의 실제 CONTENT로 뒷받침되는지 판단하라.",
        "새로운 사실·출처·evidence ID를 만들어내지 말 것 — 오직 주어진 근거자료 텍스트가",
        "주어진 소견의 구체적 쟁점을 실제로 다루는지만 판단할 것. 실제로 그 소견을",
        "뒷받침하는 evidence ID만 supportedEvidenceIds에 담을 것(일부만 뒷받침되면",
        "그 ID만 남길 것 — 전부 무관하면 빈 배열을 반환할 것).",
        "",
        claimBlocks.join("\n\n"),
      ].join("\n")
    );
  }
  if (counterArgumentBlocks.length > 0) {
    sections.push(
      [
        "아래 각 반론(쿼리 ID + 반론 번호별)이 제시된 근거자료의 실제 CONTENT로",
        "뒷받침/반박되는지 판단하라. 뒷받침 근거자료가 실제로 반론 내용을 지지하면",
        "그 ID만 supportedEvidenceIds에, 반박 근거자료가 실제로 반론에 반박이 되면",
        "그 ID만 counterEvidenceIds에 담을 것. 새로운 evidence ID를 만들어내지 말 것.",
        "",
        counterArgumentBlocks.join("\n\n"),
      ].join("\n")
    );
  }
  return sections.join("\n\n---\n\n");
}

interface WorkingClaim {
  finding: DraftFinding;
  supportingEvidenceIds: string[];
  status: VerifiedClaim["status"];
  counterArguments: VerifiedCounterArgument[];
}

export async function verify(
  queries: ResearchQuery[],
  findings: DraftFinding[],
  challenges: Challenge[],
  evidence: Map<string, EvidenceCandidate[]>,
  provider: LLMProvider
): Promise<VerificationResult> {
  const verifiedClaims: VerifiedClaim[] = [];
  const missingMaterials: MissingMaterial[] = [];
  const uncertainty: string[] = [];

  const working: WorkingClaim[] = [];

  for (const finding of findings) {
    const validIds = new Set((evidence.get(finding.queryId) ?? []).map((item) => item.id));

    // (a) Researcher claim 재검증 — 위조 ID는 조용히 제거한다.
    const supportingEvidenceIds = finding.supportingEvidenceIds.filter((id) => validIds.has(id));
    const status: VerifiedClaim["status"] =
      supportingEvidenceIds.length > 0 ? "VERIFIED" : "INSUFFICIENT";

    if (status === "INSUFFICIENT") {
      uncertainty.push(
        `쿼리 ${finding.queryId}에 대한 소견을 뒷받침하는 유효한 근거자료가 없어 판단불충분으로 처리되었습니다.`
      );
    }

    // (b) Skeptic evidence 재검증 — 재검증을 통과한 evidence ID는 구조화된
    // 형태로 보존된다(design.md §7 3차 revision, §8 VerifiedCounterArgument).
    const counterArguments: VerifiedCounterArgument[] = challenges
      .filter((item) => item.findingId === finding.queryId)
      .map((item) => ({
        summary: item.counterArgument,
        supportingEvidenceIds: (item.supportingEvidenceIds ?? []).filter((id) => validIds.has(id)),
        counterEvidenceIds: (item.counterEvidenceIds ?? []).filter((id) => validIds.has(id)),
      }));

    working.push({ finding, supportingEvidenceIds, status, counterArguments });
  }

  // 구조적 필터링을 통과한(즉 유효 evidence ID가 1개 이상 남은) claim만
  // 의미 검증의 candidate가 된다 — 이미 INSUFFICIENT인 claim은 재확인할
  // 필요가 없다(이미 판단불충분). counterArgument는 claim의 status와
  // 무관하게, 구조적으로 유효한 evidence ID를 1개 이상 인용한 경우에만
  // candidate가 된다(item 1) — 인용된 evidence가 없으면 검증할 CONTENT가
  // 없기 때문이다.
  const claimCandidates: SemanticClaimCandidate[] = [];
  working.forEach((item, workingIndex) => {
    if (item.status !== "VERIFIED") {
      return;
    }
    const queryEvidence = evidence.get(item.finding.queryId) ?? [];
    claimCandidates.push({
      workingIndex,
      queryId: item.finding.queryId,
      summary: item.finding.summary,
      evidenceIds: item.supportingEvidenceIds,
      evidenceItems: queryEvidence.filter((ev) => item.supportingEvidenceIds.includes(ev.id)),
    });
  });

  const counterArgumentCandidates: SemanticCounterArgumentCandidate[] = [];
  working.forEach((item, workingIndex) => {
    const queryEvidence = evidence.get(item.finding.queryId) ?? [];
    item.counterArguments.forEach((ca, caIndex) => {
      if (ca.supportingEvidenceIds.length === 0 && ca.counterEvidenceIds.length === 0) {
        return;
      }
      counterArgumentCandidates.push({
        workingIndex,
        caIndex,
        queryId: item.finding.queryId,
        counterArgumentIndex: caIndex,
        summary: ca.summary,
        supportingEvidenceIds: ca.supportingEvidenceIds,
        counterEvidenceIds: ca.counterEvidenceIds,
        supportingEvidenceItems: queryEvidence.filter((ev) =>
          ca.supportingEvidenceIds.includes(ev.id)
        ),
        counterEvidenceItems: queryEvidence.filter((ev) => ca.counterEvidenceIds.includes(ev.id)),
      });
    });
  });

  if (claimCandidates.length > 0 || counterArgumentCandidates.length > 0) {
    const result = await provider.generateStructured({
      prompt: buildSemanticVerificationPrompt(claimCandidates, counterArgumentCandidates),
      schema: buildSemanticVerificationSchema(claimCandidates, counterArgumentCandidates),
    });

    if (!result.ok) {
      // Fail-closed(명시적 코드 리뷰 요구사항) — 호출 실패 시 fail-open(구조적
      // 검증만으로 유지)하지 않는다. claim candidate는 전부 INSUFFICIENT로
      // 처리하고, counterArgument candidate는 evidence 연결을 전부 비워
      // "의미상 뒷받침 확인 안 됨" 상태로 처리한다.
      for (const candidate of claimCandidates) {
        working[candidate.workingIndex].status = "INSUFFICIENT";
        uncertainty.push(
          `쿼리 ${candidate.queryId}에 대한 의미 검증을 완료하지 못해(${result.reason}) 판단불충분으로 처리되었습니다.`
        );
      }
      for (const candidate of counterArgumentCandidates) {
        const target = working[candidate.workingIndex].counterArguments[candidate.caIndex];
        working[candidate.workingIndex].counterArguments[candidate.caIndex] = {
          ...target,
          supportingEvidenceIds: [],
          counterEvidenceIds: [],
        };
        uncertainty.push(
          `쿼리 ${candidate.queryId}의 반론에 대한 의미 검증을 완료하지 못해(${result.reason}) 근거 연결이 제거되었습니다.`
        );
      }
    } else {
      const response = result.data as SemanticVerificationResponse;

      const claimByQueryId = new Map(response.claims.map((entry) => [entry.queryId, entry]));
      for (const candidate of claimCandidates) {
        const item = working[candidate.workingIndex];
        const verdict = claimByQueryId.get(candidate.queryId);
        // .refine()이 candidate 집합과의 1:1 대응을 이미 보장하지만,
        // 방어적으로 누락 케이스도 INSUFFICIENT로 처리한다.
        if (!verdict) {
          item.status = "INSUFFICIENT";
          uncertainty.push(
            `쿼리 ${candidate.queryId}에 대한 의미 검증 결과를 찾을 수 없어 판단불충분으로 처리되었습니다.`
          );
          continue;
        }
        // 실제로 의미 검증을 통과한 evidence ID의 부분집합만 최종
        // supportingEvidenceIds에 남긴다 — 존재하지만 내용상 무관한
        // evidence ID는 여기서 제거된다.
        item.supportingEvidenceIds = verdict.supportedEvidenceIds;
        if (verdict.supportedEvidenceIds.length === 0) {
          item.status = "INSUFFICIENT";
          uncertainty.push(`쿼리 ${candidate.queryId}: ${verdict.reason}`);
        }
      }

      const caByKey = new Map(
        response.counterArguments.map((entry) => [
          counterArgumentKey(entry.queryId, entry.counterArgumentIndex),
          entry,
        ])
      );
      for (const candidate of counterArgumentCandidates) {
        const key = counterArgumentKey(candidate.queryId, candidate.counterArgumentIndex);
        const verdict = caByKey.get(key);
        const target = working[candidate.workingIndex].counterArguments[candidate.caIndex];
        if (!verdict) {
          working[candidate.workingIndex].counterArguments[candidate.caIndex] = {
            ...target,
            supportingEvidenceIds: [],
            counterEvidenceIds: [],
          };
          uncertainty.push(
            `쿼리 ${candidate.queryId}의 반론에 대한 의미 검증 결과를 찾을 수 없어 근거 연결이 제거되었습니다.`
          );
          continue;
        }
        // 반론도 claim과 동일하게, 실제로 의미 검증을 통과한 evidence ID의
        // 부분집합만 최종 supportingEvidenceIds/counterEvidenceIds에 남긴다.
        working[candidate.workingIndex].counterArguments[candidate.caIndex] = {
          ...target,
          supportingEvidenceIds: verdict.supportedEvidenceIds,
          counterEvidenceIds: verdict.counterEvidenceIds,
        };
      }
    }
  }

  // 안전장치(safety-validator) defense-in-depth — 의미 검증 결과와 무관하게
  // 최종적으로 적용되는 마지막 방어선이다(코드 리뷰 지적).
  //
  // 후속 코드 리뷰 지적(item 2): 기존에는 status === "VERIFIED"인 item만
  // 검사했기 때문에, 이미 INSUFFICIENT가 된 item의 unsafe counterArgument가
  // 최종 report에 그대로 남을 수 있었다. 최종 safety 스캔은 status와
  // 무관하게 모든 item에 대해 수행한다. 금지 표현이 있는 counterArgument는
  // 부모 claim status만 바꾸는 방식이 아니라 최종 counterArguments 배열에서
  // 직접 제거한다.
  for (const item of working) {
    if (item.status === "VERIFIED" && findSafetyViolations(item.finding.summary).length > 0) {
      item.status = "INSUFFICIENT";
      uncertainty.push(
        `쿼리 ${item.finding.queryId}: 금지된 확정성 표현이 감지되어 판단불충분으로 처리되었습니다.`
      );
    }

    const safeCounterArguments = item.counterArguments.filter(
      (ca) => findSafetyViolations(ca.summary).length === 0
    );
    if (safeCounterArguments.length !== item.counterArguments.length) {
      item.counterArguments = safeCounterArguments;
      uncertainty.push(
        `쿼리 ${item.finding.queryId}: 반론 중 금지된 확정성 표현이 감지되어 제외되었습니다.`
      );
    }
  }

  for (const item of working) {
    verifiedClaims.push({
      summary: item.finding.summary,
      supportingEvidenceIds: item.supportingEvidenceIds,
      counterArguments: item.counterArguments,
      status: item.status,
    });
  }

  // query↔finding 대조 — 대응하는 finding이 없는 query는 evidence 부재 또는
  // Researcher structured validation 실패로 인해 finding이 생성되지 못한
  // 경우다(design.md §7 4차 revision). relatedIssueType은 항상 대조된
  // ResearchQuery.issueType에서 직접 가져온다 — 추측하거나 기본값을 넣지
  // 않는다.
  for (const query of queries) {
    const hasFinding = findings.some((finding) => finding.queryId === query.id);
    if (hasFinding) {
      continue;
    }

    missingMaterials.push({
      description: `${query.topic}에 대한 근거자료가 부족하여 판단할 수 없습니다.`,
      relatedIssueType: query.issueType,
    });
    uncertainty.push(
      `쿼리 ${query.id}(${query.issueType})에 대해 검토할 소견을 생성하지 못해 추가 확인이 필요합니다.`
    );
  }

  return { verifiedClaims, missingMaterials, uncertainty };
}
