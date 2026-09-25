import { z } from "zod";
import { DIAGNOSIS_SCHEMA_VERSION } from "./types";

// SPEC-B2C-RESULT-001 M1 — lib/diagnosis/types.ts의 DiagnosisResult 계약을
// 런타임에도 강제하는 zod 스키마(design.md §1b, REQ-B2CRESULT-014). 01의
// lib/validation/diagnosis-input.ts와는 별개 디렉터리(lib/diagnosis/)에
// 둔다 — lib/validation/은 01 전용 입력 스키마가 이미 점유하고 있다.
//
// 엄격성 결정: 모든 분기는 z.strictObject로 선언해 미지 키를 거부한다 —
// 오염된 키가 known-key 검증만으로 조용히 통과하는 것을 막기 위함이다.

export const CoverageCategorySchema = z.enum(["reimbursement", "fixed", "disability", "special"]);

export const CoverageStatusSchema = z.enum(["review", "needs-info", "low-likelihood"]);

export const AccidentSummaryFactSchema = z.strictObject({
  label: z.string().min(1),
  value: z.string().min(1),
});

export const InputAccidentSummarySchema = z.strictObject({
  title: z.string().min(1),
  when: AccidentSummaryFactSchema,
  where: AccidentSummaryFactSchema,
  mechanism: AccidentSummaryFactSchema,
  bodyPart: AccidentSummaryFactSchema,
});

// types.ts의 FactChip은 AccidentSummaryFact를 TS interface extends로
// 상속하지만, zod strictObject는 상속을 그대로 반영하지 않으므로 필드
// 집합을 questionId와 함께 다시 나열한다. label/value에는
// AccidentSummaryFactSchema와 동일한 .min(1) 의미 검증을 적용한다.
export const FactChipSchema = z.strictObject({
  questionId: z.string(),
  label: z.string().min(1),
  value: z.string().min(1),
});

export const PriorityCheckSchema = z.strictObject({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  targetCategory: CoverageCategorySchema,
});

export const CoverageBadgeKindSchema = z.enum([
  "subscription-check",
  "generation-check",
  "policy-type-check",
  "hospital-type-check",
  "facility-check",
  "group-insurance-check",
  "individual-check",
  "multi-match",
  "custom",
]);

export const CoverageBadgeSchema = z.strictObject({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: CoverageBadgeKindSchema,
});

// 5분기 모두 strictObject — kind별로 허용되는 필드 집합이 다르므로
// (range/fixed만 min/max/value를 갖는다), "kind: range인데 min/max 없음"을
// safeParse가 거부하는 대상이 바로 이 discriminatedUnion이다.
export const BenefitDisplaySchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("range"),
    label: z.string().min(1),
    min: z.number(),
    max: z.number(),
    displayText: z.string().min(1),
  }),
  z.strictObject({
    kind: z.literal("fixed"),
    label: z.string().min(1),
    value: z.number(),
    displayText: z.string().min(1),
  }),
  z.strictObject({
    kind: z.literal("formula"),
    label: z.string().min(1),
    displayText: z.string().min(1),
  }),
  z.strictObject({
    kind: z.literal("conditional"),
    label: z.string().min(1),
    displayText: z.string().min(1),
  }),
  z.strictObject({
    kind: z.literal("unavailable"),
    label: z.string().min(1),
    displayText: z.string().min(1),
  }),
]);

// CoverageItemBase(types.ts)의 공통 필수 필드 — status discriminatedUnion의
// 세 분기가 스프레드로 재사용해 중복 나열을 피한다.
const CoverageItemCommonFields = {
  id: z.string().min(1),
  category: CoverageCategorySchema,
  name: z.string().min(1),
  description: z.string().min(1),
  whyCheck: z.string().min(1),
  badges: z.array(CoverageBadgeSchema),
  benefit: BenefitDisplaySchema,
  factChips: z.array(FactChipSchema),
  evidenceRefs: z.array(z.string()).optional(),
  additionalInfoNote: z.string().optional(),
  requiredDocuments: z.array(z.string()).optional(),
};

// status: "low-likelihood" 분기만 reasonNote를 요구한다(REQ-B2CRESULT-005).
// "review"/"needs-info" 분기는 CoverageItemCommonFields에 reasonNote 필드가
// 없고 z.strictObject이므로, reasonNote 키를 가진 객체가 주어지면
// safeParse가 거부한다(types.ts의 `reasonNote?: never` TS 금지와 동일한
// 강제를 런타임에 재현).
export const CoverageItemSchema = z.discriminatedUnion("status", [
  z.strictObject({ ...CoverageItemCommonFields, status: z.literal("review") }),
  z.strictObject({ ...CoverageItemCommonFields, status: z.literal("needs-info") }),
  z.strictObject({
    ...CoverageItemCommonFields,
    status: z.literal("low-likelihood"),
    reasonNote: z.string().min(1),
  }),
]);

// DiagnosisResult 전체 계약 — 01→02 인계 채널(lib/diagnosis/handoff.ts,
// 후속 milestone)이 sessionStorage에서 읽은 원시 JSON을 이 스키마로
// safeParse해 유효성을 판정한다. resultId/rawInput은 .min(1)로 빈 문자열을,
// schemaVersion은 z.literal(DIAGNOSIS_SCHEMA_VERSION)로 계약 버전 불일치를,
// generatedAt은 z.iso.datetime({ offset: true })로 ISO-8601 형식 위반을
// 각각 safeParse 실패로 거부한다.
export const DiagnosisResultSchema = z.strictObject({
  resultId: z.string().min(1),
  schemaVersion: z.literal(DIAGNOSIS_SCHEMA_VERSION),
  rawInput: z.string().min(1),
  answers: z.record(z.string(), z.string()),
  inputSummary: InputAccidentSummarySchema,
  priorityChecks: z.array(PriorityCheckSchema),
  items: z.array(CoverageItemSchema),
  generatedAt: z.iso.datetime({ offset: true }),
});

export type DiagnosisResultParsed = z.infer<typeof DiagnosisResultSchema>;
