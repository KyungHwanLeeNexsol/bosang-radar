import { describe, expect, it } from "vitest";
import evidenceSeed from "../../db/seed/evidence.json";
import { isDuplicate, normalizeForDuplicateCheck } from "./evidence-retriever";
import type { EvidenceCandidate } from "./types";

// SPEC-EVIDENCE-001 M5 — 중복(duplicate) 판정 규칙 테스트 (REQ-EVIDENCE-022,
// AC-EVIDENCE-018, design.md §6).
//
// design.md §6의 기본 구현은 sourceUrl 동일성 + 정규화된 content 동일성만
// 사용한다 — sourceIdentifier 컬럼은 이 SPEC의 기본안에 포함되지 않으므로
// (design.md §1.2), isDuplicate()는 sourceIdentifier를 전혀 참조하지 않는다.

function makeCandidate(overrides: Partial<EvidenceCandidate>): EvidenceCandidate {
  return {
    id: "test-id",
    category: "상해후유장해",
    evidenceType: "OTHER",
    scope: "DOMAIN_SPECIFIC",
    title: "제목",
    content: "본문 내용",
    sourceUrl: null,
    issueTypes: [],
    ...overrides,
  };
}

describe("normalizeForDuplicateCheck (design.md §6)", () => {
  it("연속 공백과 개행을 단일 공백으로 정규화하고 앞뒤 공백을 제거한다", () => {
    expect(normalizeForDuplicateCheck("  같은   내용\n\n입니다  ")).toBe("같은 내용 입니다");
  });

  it("이미 정규화된 문자열은 그대로 반환한다", () => {
    expect(normalizeForDuplicateCheck("같은 내용")).toBe("같은 내용");
  });
});

describe("isDuplicate (REQ-EVIDENCE-022, design.md §6)", () => {
  it("동일 sourceUrl + 동일 content(공백/개행 정규화 후) → 중복이다", () => {
    const a = makeCandidate({
      id: "a",
      sourceUrl: "https://example.com/1",
      content: "같은  내용\n입니다",
    });
    const b = makeCandidate({
      id: "b",
      sourceUrl: "https://example.com/1",
      content: "같은 내용 입니다",
    });

    expect(isDuplicate(a, b)).toBe(true);
  });

  it("동일 sourceUrl + 다른 content → 중복이 아니다(서로 다른 proposition)", () => {
    const a = makeCandidate({
      id: "a",
      sourceUrl: "https://example.com/1",
      content: "발목 장해 판정 기준",
    });
    const b = makeCandidate({
      id: "b",
      sourceUrl: "https://example.com/1",
      content: "손가락 장해 판정 기준",
    });

    expect(isDuplicate(a, b)).toBe(false);
  });

  it("다른 sourceUrl + 동일 content → 중복이 아니다(design.md §6 — sameSource 우선 게이트, sourceIdentifier 미도입 기본안과 정합)", () => {
    const a = makeCandidate({
      id: "a",
      sourceUrl: "https://example.com/1",
      content: "동일한 본문 내용",
    });
    const b = makeCandidate({
      id: "b",
      sourceUrl: "https://example.com/2",
      content: "동일한 본문 내용",
    });

    // isDuplicate()는 sameSource 게이트를 먼저 통과해야 content 비교로
    // 진입한다 — sourceUrl이 다르면 content가 완전히 동일해도 중복으로
    // 판정하지 않는다(design.md §6 원문: "if (!sameSource) return false").
    expect(isDuplicate(a, b)).toBe(false);
  });

  it("sourceUrl이 둘 다 null이면 content가 동일해도 중복이 아니다 (Boolean(null) === false 게이트)", () => {
    const a = makeCandidate({ id: "a", sourceUrl: null, content: "동일한 본문" });
    const b = makeCandidate({ id: "b", sourceUrl: null, content: "동일한 본문" });

    expect(isDuplicate(a, b)).toBe(false);
  });

  it("issueTypes 겹침 여부는 중복 판정에 전혀 관여하지 않는다(외부 독립 리뷰 이슈 6)", () => {
    const a = makeCandidate({
      id: "a",
      sourceUrl: "https://example.com/1",
      content: "인과관계와 장해 평가 기준을 함께 다룬다",
      issueTypes: ["CAUSATION", "DISABILITY_GRADE_CRITERIA"],
    });
    const b = makeCandidate({
      id: "b",
      sourceUrl: "https://example.com/1",
      content: "전혀 다른 내용의 판례",
      issueTypes: ["CAUSATION", "DISABILITY_GRADE_CRITERIA"],
    });

    // issueTypes가 완전히 겹치지만 content가 다르므로 중복이 아니다.
    expect(isDuplicate(a, b)).toBe(false);
  });

  it("AC-EVIDENCE-018: production evidence.json에서 동일 sourceUrl을 가진 모든 레코드 쌍은 isDuplicate() === false다", () => {
    const records = evidenceSeed as EvidenceCandidate[];
    const byUrl = new Map<string, EvidenceCandidate[]>();
    for (const r of records) {
      if (!r.sourceUrl) continue;
      const list = byUrl.get(r.sourceUrl) ?? [];
      list.push(r);
      byUrl.set(r.sourceUrl, list);
    }

    // 이 검증이 공허(vacuous)하지 않음을 확인 — 실제로 동일 sourceUrl을
    // 공유하는 레코드 쌍이 production corpus에 존재해야 한다
    // (seed-evidence-011/012/013, seed-evidence-017/018).
    const sharedUrlGroups = [...byUrl.values()].filter((list) => list.length >= 2);
    expect(sharedUrlGroups.length).toBeGreaterThanOrEqual(1);

    const duplicatePairs: Array<[string, string]> = [];
    for (const group of sharedUrlGroups) {
      for (let i = 0; i < group.length; i += 1) {
        for (let j = i + 1; j < group.length; j += 1) {
          if (isDuplicate(group[i], group[j])) {
            duplicatePairs.push([group[i].id, group[j].id]);
          }
        }
      }
    }

    expect(duplicatePairs).toEqual([]);
  });
});
