import { describe, expect, it } from "vitest";
import { BenefitDisplaySchema, CoverageItemSchema, DiagnosisResultSchema } from "./schema";
import { DIAGNOSIS_SCHEMA_VERSION, type CoverageItem, type DiagnosisResult } from "./types";

// SPEC-B2C-RESULT-001 M1 — DiagnosisResultSchema 및 하위 스키마의 런타임
// 검증 테스트(design.md §1b, REQ-B2CRESULT-001/005/006/014).

function buildReviewItem() {
  return {
    id: "item-1",
    category: "reimbursement",
    name: "통원 실손의료비",
    description: "통원 치료 시 발생한 의료비를 보상합니다.",
    whyCheck: "통원 치료를 받았기 때문입니다.",
    badges: [{ id: "badge-1", label: "가입 확인 필요", kind: "subscription-check" }],
    benefit: {
      kind: "range",
      label: "일반적인 가입금액 예시",
      min: 300000,
      max: 500000,
      displayText: "30만~50만원",
    },
    factChips: [{ questionId: "surgery-status", label: "수술 여부", value: "수술 받음" }],
    status: "review",
  } satisfies CoverageItem;
}

function buildLowLikelihoodItem() {
  return {
    id: "item-2",
    category: "fixed",
    name: "5대 골절 진단비",
    description: "5대 골절 진단 시 정액을 지급합니다.",
    whyCheck: "골절 진단을 받았기 때문입니다.",
    badges: [],
    benefit: {
      kind: "unavailable",
      label: "현재 정보상",
      displayText: "현재 정보상 / 가능성 낮음",
    },
    factChips: [],
    status: "low-likelihood",
    reasonNote: "진단서 상 5대 골절에 해당하지 않습니다.",
  } satisfies CoverageItem;
}

function buildValidDiagnosisResult(): DiagnosisResult {
  return {
    resultId: "result-1",
    schemaVersion: DIAGNOSIS_SCHEMA_VERSION,
    rawInput: "3일 전에 헬스장에서 벤치프레스 하다가 무릎이 골절됐어요",
    answers: { "surgery-status": "수술 받음" },
    inputSummary: {
      title: "무릎·아래다리의 골절",
      when: { label: "언제", value: "3일 전" },
      where: { label: "어디서", value: "헬스장" },
      mechanism: { label: "어떻게", value: "벤치프레스 중" },
      bodyPart: { label: "어디를", value: "무릎 골절" },
    },
    priorityChecks: [
      {
        id: "priority-1",
        title: "실손 의료비 가입 세대 확인",
        description: "가입 시기에 따라 자기부담금과 보장 범위가 달라집니다",
        targetCategory: "reimbursement",
      },
    ],
    items: [buildReviewItem(), buildLowLikelihoodItem()],
    generatedAt: "2026-09-22T10:00:00+09:00",
  };
}

describe("DiagnosisResultSchema — REQ-B2CRESULT-001/005/006/014", () => {
  it("유효한 DiagnosisResult는 통과한다", () => {
    const result = DiagnosisResultSchema.safeParse(buildValidDiagnosisResult());
    expect(result.success).toBe(true);
  });

  it("빈 resultId는 거부한다", () => {
    const input = { ...buildValidDiagnosisResult(), resultId: "" };
    expect(DiagnosisResultSchema.safeParse(input).success).toBe(false);
  });

  it("빈 rawInput은 거부한다", () => {
    const input = { ...buildValidDiagnosisResult(), rawInput: "" };
    expect(DiagnosisResultSchema.safeParse(input).success).toBe(false);
  });

  it("미지원 schemaVersion은 거부한다(z.literal)", () => {
    const input = { ...buildValidDiagnosisResult(), schemaVersion: "2" };
    expect(DiagnosisResultSchema.safeParse(input).success).toBe(false);
  });

  it("비-ISO-8601 generatedAt(오프셋 누락)은 거부한다", () => {
    const input = { ...buildValidDiagnosisResult(), generatedAt: "2026-09-22" };
    expect(DiagnosisResultSchema.safeParse(input).success).toBe(false);
  });

  it("ISO-8601 오프셋을 포함한 generatedAt은 통과한다", () => {
    const input = { ...buildValidDiagnosisResult(), generatedAt: "2026-09-22T10:00:00Z" };
    expect(DiagnosisResultSchema.safeParse(input).success).toBe(true);
  });

  it("사고 요약 title이 빈 문자열이면 거부한다", () => {
    const input = buildValidDiagnosisResult();
    input.inputSummary = { ...input.inputSummary, title: "" };
    expect(DiagnosisResultSchema.safeParse(input).success).toBe(false);
  });

  it("사고 요약 fact의 label/value가 빈 문자열이면 거부한다", () => {
    const input = buildValidDiagnosisResult();
    input.inputSummary = {
      ...input.inputSummary,
      when: { label: "", value: "3일 전" },
    };
    expect(DiagnosisResultSchema.safeParse(input).success).toBe(false);
  });

  it("확인 우선순위 id/title/description이 빈 문자열이면 거부한다", () => {
    const input = buildValidDiagnosisResult();
    input.priorityChecks = [{ ...input.priorityChecks[0], title: "" }];
    expect(DiagnosisResultSchema.safeParse(input).success).toBe(false);
  });

  it("담보 배지 id/label이 빈 문자열이면 거부한다", () => {
    const input = buildValidDiagnosisResult();
    const [firstItem, ...rest] = input.items;
    input.items = [
      { ...firstItem, badges: [{ id: "", label: "가입 확인 필요", kind: "subscription-check" }] },
      ...rest,
    ];
    expect(DiagnosisResultSchema.safeParse(input).success).toBe(false);
  });

  it("담보 카드 id/name/description/whyCheck가 빈 문자열이면 거부한다", () => {
    const input = buildValidDiagnosisResult();
    const [firstItem, ...rest] = input.items;
    input.items = [{ ...firstItem, name: "" }, ...rest];
    expect(DiagnosisResultSchema.safeParse(input).success).toBe(false);
  });

  it("보장 방식 표시 label/displayText가 빈 문자열이면 거부한다", () => {
    const input = buildValidDiagnosisResult();
    const [firstItem, ...rest] = input.items;
    input.items = [
      {
        ...firstItem,
        benefit: { ...firstItem.benefit, displayText: "" } as CoverageItem["benefit"],
      },
      ...rest,
    ];
    expect(DiagnosisResultSchema.safeParse(input).success).toBe(false);
  });

  it("가능성 낮음 항목의 reasonNote가 빈 문자열이면 거부한다", () => {
    const input = buildValidDiagnosisResult();
    input.items = [buildReviewItem(), { ...buildLowLikelihoodItem(), reasonNote: "" }];
    expect(DiagnosisResultSchema.safeParse(input).success).toBe(false);
  });

  it("정의되지 않은 키를 포함하면 거부한다(.strictObject)", () => {
    const input = { ...buildValidDiagnosisResult(), extra: "field" };
    expect(DiagnosisResultSchema.safeParse(input).success).toBe(false);
  });
});

describe("CoverageItemSchema — reasonNote 금지 분기(REQ-B2CRESULT-005)", () => {
  it("review 분기에 reasonNote가 존재하면 거부한다(strictObject 미지 키)", () => {
    const input = { ...buildReviewItem(), reasonNote: "허용되지 않는 사유" };
    expect(CoverageItemSchema.safeParse(input).success).toBe(false);
  });

  it("needs-info 분기에 reasonNote가 존재하면 거부한다(strictObject 미지 키)", () => {
    const input = {
      ...buildReviewItem(),
      status: "needs-info" as const,
      reasonNote: "허용되지 않는 사유",
    };
    expect(CoverageItemSchema.safeParse(input).success).toBe(false);
  });

  it("low-likelihood 분기는 reasonNote 없이는 거부한다", () => {
    const fullItem: Record<string, unknown> = { ...buildLowLikelihoodItem() };
    delete fullItem.reasonNote;
    expect(CoverageItemSchema.safeParse(fullItem).success).toBe(false);
  });

  it("low-likelihood 분기는 reasonNote와 함께 통과한다", () => {
    expect(CoverageItemSchema.safeParse(buildLowLikelihoodItem()).success).toBe(true);
  });
});

describe("BenefitDisplaySchema — kind별 discriminated union(REQ-B2CRESULT-006)", () => {
  it("kind: range인데 min/max가 없으면 거부한다", () => {
    const input = { kind: "range", label: "일반적인 가입금액 예시", displayText: "30만~50만원" };
    expect(BenefitDisplaySchema.safeParse(input).success).toBe(false);
  });

  it("kind: range이고 min/max/label/displayText가 모두 있으면 통과한다", () => {
    const input = {
      kind: "range",
      label: "일반적인 가입금액 예시",
      min: 300000,
      max: 500000,
      displayText: "30만~50만원",
    };
    expect(BenefitDisplaySchema.safeParse(input).success).toBe(true);
  });

  it("kind: unavailable은 min/max/value 없이 통과한다", () => {
    const input = {
      kind: "unavailable",
      label: "현재 정보상",
      displayText: "현재 정보상 / 가능성 낮음",
    };
    expect(BenefitDisplaySchema.safeParse(input).success).toBe(true);
  });
});
