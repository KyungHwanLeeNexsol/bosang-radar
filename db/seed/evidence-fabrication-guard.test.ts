import { describe, expect, it } from "vitest";
import evidenceSeed from "./evidence.json";
import type { EvidenceCandidate } from "../../lib/pipeline/types";

// SPEC-EVIDENCE-001 M5 — fabrication guard 구조 검증 (REQ-EVIDENCE-002/003,
// AC-EVIDENCE-002).
//
// 정직한 범위 고지(overclaim 금지, verification-claim-integrity 원칙): 이
// 테스트는 evidenceType이 PRECEDENT/STATUTE/DISPUTE_CASE/POLICY인 레코드가
// sourceUrl 또는 sourceIdentifier 중 하나 이상을 갖는지만 기계적으로
// 확인한다 — "출처 미상 채로 PRECEDENT 등으로 분류되는 것"만 구조적으로
// 차단할 뿐이다. 실제 원문 대조(그 판례가 실제로 이렇게 판시했는가)는
// 자동화 불가능한 수작업 절차이며, M4a/4b의 사람 검토 +
// `.moai/reports/evidence-source-audit-manifest.md`가 이미 담당한다
// (design.md §5.3, acceptance.md §C). 이 테스트는 authenticity PASS를
// 전혀 주장하지 않는다.
//
// sourceIdentifier 컬럼은 이 SPEC의 기본 구현에 도입되지 않았다
// (design.md §1.2) — EvidenceCandidate/EvidenceSeedRecord 어느 타입에도
// 존재하지 않으므로, 이 검증은 현재 sourceUrl 존재 여부만으로 이진
// 판정한다. sourceIdentifier가 추후 별도 migration으로 추가되면 이 검증도
// 함께 확장한다.

const AUTHENTICITY_REQUIRED_TYPES = new Set(["PRECEDENT", "STATUTE", "DISPUTE_CASE", "POLICY"]);

/**
 * PRECEDENT/STATUTE/DISPUTE_CASE/POLICY 레코드 중 sourceUrl(또는, 도입되면
 * sourceIdentifier)이 없는 위반 레코드의 id 목록을 반환한다.
 */
function findFabricationGuardViolations(
  records: Array<Pick<EvidenceCandidate, "id" | "evidenceType" | "sourceUrl">>
): string[] {
  return records
    .filter((r) => AUTHENTICITY_REQUIRED_TYPES.has(r.evidenceType) && !r.sourceUrl)
    .map((r) => r.id);
}

describe("evidence-fabrication-guard (REQ-EVIDENCE-002/003, AC-EVIDENCE-002)", () => {
  it("검출 능력 확인(mutation sanity) — 위반 레코드를 주입하면 실제로 감지된다(공허하지 않은 검증 확인)", () => {
    const fixtureWithViolation: Array<
      Pick<EvidenceCandidate, "id" | "evidenceType" | "sourceUrl">
    > = [
      { id: "ok-1", evidenceType: "PRECEDENT", sourceUrl: "https://example.com/1" },
      { id: "bad-1", evidenceType: "PRECEDENT", sourceUrl: null },
      { id: "bad-2", evidenceType: "STATUTE", sourceUrl: null },
      { id: "n-a-1", evidenceType: "OTHER", sourceUrl: null }, // OTHER는 대상 아님
    ];

    expect(findFabricationGuardViolations(fixtureWithViolation).sort()).toEqual(["bad-1", "bad-2"]);
  });

  it("evidenceType이 PRECEDENT/STATUTE/DISPUTE_CASE/POLICY인 모든 production evidence는 sourceUrl 또는 sourceIdentifier를 갖는다", () => {
    const records = evidenceSeed as unknown as Array<
      Pick<EvidenceCandidate, "id" | "evidenceType" | "sourceUrl">
    >;

    // 대상 evidenceType이 실제로 corpus에 존재해 이 검증이 공허하지 않음을
    // 먼저 확인한다.
    const targeted = records.filter((r) => AUTHENTICITY_REQUIRED_TYPES.has(r.evidenceType));
    expect(targeted.length).toBeGreaterThan(0);

    expect(findFabricationGuardViolations(records)).toEqual([]);
  });
});
