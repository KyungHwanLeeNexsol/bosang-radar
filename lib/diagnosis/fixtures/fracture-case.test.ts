import { describe, expect, it } from "vitest";
import { DiagnosisResultSchema } from "../schema";
import { buildFractureResult, FRACTURE_FIXTURE_INPUT } from "./fracture-case";

// SPEC-B2C-RESULT-001 M2 — review 전용 골절 사례 fixture 검증(design.md §7,
// REQ-B2CRESULT-001/002/007/008/010). buildFractureResult()가 반환하는
// DiagnosisResult가 DiagnosisResultSchema(§1b)를 통과하는지, 그리고
// design.md §7이 정한 고정 값(4카테고리 전부 포함, 확인 우선순위 3개)을
// 지키는지 확인한다.

describe("FRACTURE_FIXTURE_INPUT", () => {
  it("빈 문자열이 아니다(mockJudge 정확 일치 트리거)", () => {
    expect(FRACTURE_FIXTURE_INPUT.length).toBeGreaterThan(0);
  });
});

describe("buildFractureResult — DiagnosisResultSchema 통과(REQ-B2CRESULT-001/014)", () => {
  it("응답 없이 호출해도 스키마를 통과하는 완전한 DiagnosisResult를 반환한다", () => {
    const result = buildFractureResult(FRACTURE_FIXTURE_INPUT, {});
    const parsed = DiagnosisResultSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it("응답이 있을 때도 스키마를 통과한다", () => {
    const result = buildFractureResult(FRACTURE_FIXTURE_INPUT, {
      surgery: "수술 받음",
      hospitalization: "입원함",
      accidentLocation: "헬스장",
    });
    const parsed = DiagnosisResultSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it("rawInput을 그대로 보존한다", () => {
    const result = buildFractureResult(FRACTURE_FIXTURE_INPUT, {});
    expect(result.rawInput).toBe(FRACTURE_FIXTURE_INPUT);
  });

  it("확인 우선순위는 정확히 3개다(design.md §7)", () => {
    const result = buildFractureResult(FRACTURE_FIXTURE_INPUT, {});
    expect(result.priorityChecks).toHaveLength(3);
  });

  it("4개 담보 카테고리를 모두 포함한다", () => {
    const result = buildFractureResult(FRACTURE_FIXTURE_INPUT, {});
    const categories = new Set(result.items.map((item) => item.category));
    expect(categories).toEqual(new Set(["reimbursement", "fixed", "disability", "special"]));
  });

  it("가능성 낮음(low-likelihood) 항목은 reasonNote를 갖는다(REQ-B2CRESULT-005)", () => {
    const result = buildFractureResult(FRACTURE_FIXTURE_INPUT, {});
    const lowLikelihoodItems = result.items.filter((item) => item.status === "low-likelihood");
    expect(lowLikelihoodItems.length).toBeGreaterThan(0);
    for (const item of lowLikelihoodItems) {
      expect(item.reasonNote.length).toBeGreaterThan(0);
    }
  });

  it("응답이 없는 질문 ID는 factChips에 나타나지 않는다(REQ-B2CRESULT-008)", () => {
    const result = buildFractureResult(FRACTURE_FIXTURE_INPUT, {});
    const allChipQuestionIds = result.items.flatMap((item) =>
      item.factChips.map((chip) => chip.questionId)
    );
    expect(allChipQuestionIds).toHaveLength(0);
  });

  it("응답이 있는 질문 ID는 매핑된 카드의 factChips에 나타난다(REQ-B2CRESULT-007)", () => {
    const result = buildFractureResult(FRACTURE_FIXTURE_INPUT, { surgery: "수술 받음" });
    const allChipQuestionIds = result.items.flatMap((item) =>
      item.factChips.map((chip) => chip.questionId)
    );
    expect(allChipQuestionIds).toContain("surgery");
  });
});
