# Design — SPEC-B2C-RESULT-001

이 문서는 후속 run-phase가 그대로 구현할 수 있도록 기술 결정을 코드베이스 조사(`research.md`) 근거로 구체화한다. 이번 plan-phase는 문서만 작성하며, 아래 경로·컴포넌트는 아직 존재하지 않는다(단, "최소 확장" 대상으로 명시된 기존 파일은 이미 존재한다).

## 0. 아키텍처 요약

- **02는 별도 Next.js 라우트다(`/result`)** — 01처럼 하나의 상태 머신 안의 한 단계가 아니다. SPEC-B2C-DIAGNOSIS-001 `design.md` §18.2가 이미 이 경계를 예고했다: "실제 라우팅(예: `router.push('/result')`)은 02 SPEC이 구현한다."
- **서버 저장 없음** — 01→02 인계 데이터는 `sessionStorage`를 통해 클라이언트 메모리 수준에서만 이동한다(§3 참고).
- **동일 데이터 원본** — Desktop/Mobile 레이아웃은 `DiagnosisResult` 하나를 공유하며, 레이아웃별 별도 fetch·재가공이 없다.

## 1. `DiagnosisResult` 데이터 타입 (`lib/diagnosis/types.ts`, 신규)

SPEC-B2C-DIAGNOSIS-001 `design.md` §9가 예고한 느슨한 `DiagnosisHandoff { rawInput, answers }`를 이 SPEC이 확정 스키마로 구체화한다.

```ts
// [설계 의도 — run-phase가 실제 코드로 작성한다]
export type CoverageCategory =
  | "reimbursement"   // 실손 의료비
  | "fixed"            // 정액 담보
  | "disability"        // 후유장해
  | "special";          // 특별 보상

export type CoverageStatus = "review" | "needs-info" | "low-likelihood";
// 라벨 매핑(코드는 영문 식별자, 화면 텍스트만 한글):
//   review        → "검토 대상"
//   needs-info    → "추가 정보 필요"
//   low-likelihood → "가능성 낮음"
// design/MIGRATION-PLAN.md §4 "청구 가능/조건부/해당 없음은 구 표현" 참고 —
// 이 세 값이 유일한 현행 상태 정의다.

// 라벨+값 2단 타이포그래피(약한 톤 라벨 + 강조 톤 값)를 공유하는 최소 구조.
// "입력하신 사고 내용" 카드의 언제/어디서/어떻게/어디를 4칩과, 담보 카드 위
// Fact Chip(FactChip, 아래)이 화면에서 동일한 시각 패턴을 쓰므로 하나의 타입을
// 공유한다(02/M02-B/M02-C/M02-D 5개 화면 재대조 결과, review 피드백 3차 반영).
export interface AccidentSummaryFact {
  label: string;   // 예: "언제" — 약한 톤
  value: string;   // 예: "3일 전" — 강조 톤
}

// "입력하신 사고 내용" 카드가 렌더링하는 4개 필수 사실. rawInput 원문을 그대로
// 재노출하거나 화면이 /result 쪽에서 rawInput을 재파싱해 만들지 않는다 —
// fixture(또는 실제 엔진)가 이미 4개 필드로 구조화해 넘긴다(REQ-B2CRESULT-001).
export interface InputAccidentSummary {
  title: string;                  // 예: "무릎·아래다리의 골절" — 카드 제목
  when: AccidentSummaryFact;      // "언제" — 예: { label: "언제", value: "3일 전" }
  where: AccidentSummaryFact;     // "어디서" — 예: { label: "어디서", value: "헬스장" }
  mechanism: AccidentSummaryFact; // "어떻게" — 예: { label: "어떻게", value: "벤치프레스 중" }
  bodyPart: AccidentSummaryFact;  // "어디를" — 예: { label: "어디를", value: "무릎 골절" }
}

// AccidentSummaryFact를 상속해 questionId(식별용)를 더한다 — 담보 카드 위
// Fact Chip과 "추가 질문 답변" strip이 동일한 라벨/값 2단 타이포그래피로
// 렌더링되기 때문이다(§7 참고). 과거 결합 문자열(`label: "수술 여부: 예"`)
// 설계는 라벨/값을 서로 다른 톤으로 독립 렌더링할 수 없어 폐기됐다.
export interface FactChip extends AccidentSummaryFact {
  questionId: string;   // 01-B 질문 ID
}

// "먼저 확인할 항목" 카드의 각 행. 문자열 배열이 아니라 제목/설명/이동 대상을
// 함께 갖는 구조체다 — 선택 시 어느 카테고리로 이동할지(targetCategory)가
// UI 동작(§6)의 근거가 된다.
export interface PriorityCheck {
  id: string;
  title: string;              // 예: "실손 의료비 가입 세대 확인"
  description: string;        // 예: "가입 시기에 따라 자기부담금과 보장 범위가 달라집니다"
  targetCategory: CoverageCategory;
}

// 담보 카드가 다는 보조 배지("가입 확인 필요"/"보험증권 확인 필요"/"시설 가입
// 여부 확인"/"단체보험 가입 여부 확인" 등)를 데이터로 일반화한다. 과거의
// `multiMatch?: boolean` / `subscriptionGenBadge?: string` 같은 단일 목적
// optional 필드는 폐기되고 이 배열 하나로 대체된다 — 카드가 배지를 0개, 1개,
// 또는 여러 개 가질 수 있으며, 어떤 조합도 이 배열 하나로 표현된다.
export type CoverageBadgeKind =
  | "subscription-check"    // 일반 가입 여부 확인 (관찰된 라벨: "가입 확인 필요")
  | "generation-check"      // 실손 의료비 가입 세대 확인 (§ "먼저 확인할 항목" #1과 연동)
  | "policy-type-check"     // 보험증권 확인 (관찰된 라벨: "보험증권 확인 필요")
  | "hospital-type-check"   // 병원 종별(상급종합/종합 등) 확인
  | "facility-check"        // 시설 가입 여부 확인 (관찰된 라벨: "시설 가입 여부 확인")
  | "group-insurance-check" // 단체보험 가입 여부 확인 (관찰된 라벨: "단체보험 가입 여부 확인")
  | "individual-check"      // 개인 가입 확인(단체보험과 대비되는 개별 계약 확인)
  | "multi-match"           // 복수 확인 — 하나의 사고가 여러 세부 담보에 걸칠 때
  | "custom";                // 위 8종에 속하지 않는 케이스 전용 배지(문구는 fixture가 제공)

export interface CoverageBadge {
  id: string;
  label: string;             // 화면에 표시되는 문구 — 케이스 전용 값이며 컴포넌트에 하드코딩되지 않는다
  kind: CoverageBadgeKind;
}

// 보장 방식·가입금액 표시. 모든 분기가 카드에 그대로 표시되는 label(예: "보장
// 방식", "일반적인 가입금액 예시", "현재 정보상")과 displayText를 함께 갖는다
// — UI는 label+displayText 쌍을 그대로 출력할 뿐 min/max/value를 직접 조합해
// 문구를 만들지 않는다(REQ-B2CRESULT-006, AC-B2CRESULT-006). "formula"는
// 계산식은 있으나 case별 숫자가 없는 서술(예: "가입금액 × 장해지급률")을,
// "conditional"은 증권·특약 확인 등 조건에 따라 갈리는 서술(예: "증권 확인
// 필요", "상대방 보험 · 별도 산정")을, "unavailable"은 가능성 낮음이라 산정
// 자체를 시도하지 않은 케이스(예: "현재 정보상 / 가능성 낮음")를 표현한다.
export type BenefitDisplay =
  | { kind: "range"; label: string; min: number; max: number; displayText: string }
  | { kind: "fixed"; label: string; value: number; displayText: string }
  | { kind: "formula"; label: string; displayText: string }
  | { kind: "conditional"; label: string; displayText: string }
  | { kind: "unavailable"; label: string; displayText: string };
// 런타임 파싱은 `lib/diagnosis/schema.ts`의 `BenefitDisplaySchema`
// (`z.discriminatedUnion("kind", [...])`, kind별 5개 `z.strictObject` 분기 —
// 알 수 없는 키는 거부한다)가 맡는다 — AC-B2CRESULT-006 추가 시나리오
// ("kind: range인데 min/max 없음"을 `safeParse`가 거부)가 검증하는 스키마가
// 바로 이것이다. `DiagnosisResult` 전체 계약의 zod 대응은 아래 "1b. 런타임
// 검증 스키마" 참고(run-phase가 최종 구현을 작성한다).

// CoverageItem은 status로 판별되는 discriminated union이다 — REQ-B2CRESULT-005가
// 요구하는 "가능성 낮음은 reasonNote 필수"를 타입 체크 시점에 강제하기 위해,
// reasonNote는 개별 optional 필드가 아니라 status별 분기 안에서만 필수/선택이
// 결정되도록 구성한다. benefit은 이 판별과 독립적으로 base가 항상 요구하는
// 공통 필수 필드다 — "가능성 낮음" 분기에서도 benefit 자체는 생략되지 않고
// kind가 "unavailable"/"conditional"로 산정 불가 상태를 표현할 뿐이다.
interface CoverageItemBase {
  id: string;
  category: CoverageCategory;
  name: string;                       // 예: "5대 골절 진단비"
  description: string;                // 담보/보장 방식 설명(카테고리·케이스 공통이 아닌, 이 항목 전용 문구)
  whyCheck: string;                   // "왜 이 담보를 확인해야 하는지"에 대한 설명
  badges: CoverageBadge[];            // 카드별 보조 배지(0개 이상)
  benefit: BenefitDisplay;            // 보장 방식·가입금액 표시 — 항상 필수
  factChips: FactChip[];              // 이 카드에 매핑된 01-B 응답(0개 이상)
  evidenceRefs?: string[];            // 판정 근거 참조(예: 약관 조항, 답변 요약)
  additionalInfoNote?: string;        // status === "needs-info"일 때의 안내 문구
  requiredDocuments?: string[];       // 청구/확인에 필요한 서류 목록
}

export type CoverageItem =
  | (CoverageItemBase & { status: "review"; reasonNote?: never })
  | (CoverageItemBase & { status: "needs-info"; reasonNote?: never })
  | (CoverageItemBase & { status: "low-likelihood"; reasonNote: string });
// ↑ "low-likelihood" 분기에서만 reasonNote가 필수 필드다(REQ-B2CRESULT-005,
// AC-B2CRESULT-005 추가 시나리오) — "review"/"needs-info" 분기는 reasonNote가
// "선택(optional)"이 아니라 `reasonNote?: never`로 명시적으로 금지된다(그 필드에
// 값을 채우면 타입 체크가 실패한다). 런타임에도 동일한 금지가 적용된다 — §1b
// CoverageItemSchema의 review/needs-info 분기는 z.strictObject로 선언되어
// reasonNote 키가 존재하는 객체를 거부한다(알 수 없는 키 거부).
// amount?: CoverageAmount 같은 status별 optional 분기는 더 이상 없다 — benefit은
// base의 공통 필수 필드이기 때문이다(위 CoverageItemBase 참고).

// 이 계약의 버전 상수 — 03 SPEC 등 후속 소비자가 형태 변화를 감지하는 기준값이다.
// DiagnosisResult.schemaVersion은 이 리터럴 타입으로 고정되며(런타임 zod 대응은
// §1b DiagnosisResultSchema의 z.literal(DIAGNOSIS_SCHEMA_VERSION)), 계약이
// 바뀌면(스키마 버전 업) 이 상수를 갱신하고 이전 버전과의 호환 처리는 후속
// SPEC이 결정한다.
export const DIAGNOSIS_SCHEMA_VERSION = "1" as const;

export interface DiagnosisResult {
  resultId: string;                    // 결과 인스턴스 식별자(REQ-B2CRESULT-001) — run-phase가 UUID 등으로 생성, 빈 문자열 불가(§1b DiagnosisResultSchema resultId: z.string().min(1))
  schemaVersion: typeof DIAGNOSIS_SCHEMA_VERSION; // 이 계약의 버전 — 런타임에는 §1b DiagnosisResultSchema가 z.literal(DIAGNOSIS_SCHEMA_VERSION)으로 강제한다
  rawInput: string;
  answers: Record<string, string>;
  inputSummary: InputAccidentSummary;   // 사고 내용 구조화 요약 — title + 4개 AccidentSummaryFact
  priorityChecks: PriorityCheck[];      // "확인 우선순위" — id/title/description/targetCategory 구조체 배열
  items: CoverageItem[];
  generatedAt: string; // ISO 8601(offset 포함) — DiagnosisResult 전체가 sessionStorage에
                        // 기록되는 대상이므로(§3 writeDiagnosisHandoff), generatedAt도 그
                        // 왕복(write → read)에 그대로 포함되어 보존된다 — 표시 전용
                        // "이면서 저장되지 않는" 필드가 아니라, 저장되는 객체의
                        // 일부로서 표시에 쓰이는 필드다. 런타임에는 §1b
                        // DiagnosisResultSchema가 z.iso.datetime({ offset: true })로
                        // 형식을 검증한다.
}
```

**결정 (확정)**: 카테고리·상태·배지 kind는 문자열 리터럴 union으로 고정하며 `string` 타입으로 느슨화하지 않는다(REQ-B2CRESULT-001) — TypeScript strict 모드가 정의되지 않은 값 추가를 컴파일 시점에 차단하는 것이 목적이다. `CoverageItem`은 `status`로 판별되는 discriminated union이며, `reasonNote`의 필수/선택 여부는 (zod refine 같은 런타임 검증이 아니라) 타입 정의 자체에서 결정된다 — 컴파일 시점에 "가능성 낮음인데 reasonNote 누락"을 차단하는 것이 목적이다. `benefit`은 `status` 판별과 무관하게 `CoverageItemBase`가 요구하는 공통 필수 필드이며, `BenefitDisplay`는 `kind`로 판별되는 별도의 5분기 discriminated union이다 — 두 판별 유니언은 서로 독립적이다(예: `status: "low-likelihood"` 이면서 `benefit.kind: "range"`인 조합도 타입상 허용된다 — 실제로는 fixture가 low-likelihood 항목에 `"unavailable"`/`"conditional"`을 선택하지만, 타입 레벨의 강제는 아니다).

**하드코딩 문구 금지 (REQ-B2CRESULT-001, AC-B2CRESULT-006 추가 시나리오)**: `components/result/*` 컴포넌트는 사고 요약·확인 우선순위·카테고리 설명·whyCheck·배지 라벨·보장 방식 문구 등 케이스별로 달라지는 문구를 절대 리터럴로 직접 작성하지 않는다 — 모든 동적 문구는 위 `DiagnosisResult`/`CoverageItem`/`PriorityCheck`/`CoverageBadge`/`BenefitDisplay` 필드에서 오거나(케이스별 값), 상태 pill 라벨("검토 대상"/"추가 정보 필요"/"가능성 낮음") 같은 케이스 무관 고정 문구는 `lib/diagnosis/labels.ts` 같은 공용 상수 모듈 하나에서만 온다.

## 1b. 런타임 검증 스키마 (`lib/diagnosis/schema.ts`, 신규)

§1의 `DiagnosisResult` TypeScript 계약은 컴파일 시점 강제만 제공한다 — `sessionStorage`에서 읽은 값(§3)은 컴파일러가 보증하지 않는 외부 입력이므로, 동일한 계약을 런타임에도 강제하는 zod 스키마가 필요하다(REQ-B2CRESULT-014, AC-B2CRESULT-006/014). 파일 위치는 `lib/diagnosis/`(신규 디렉터리) 하위로 통일한다 — `lib/validation/`은 01 전용 입력 스키마(`lib/validation/diagnosis-input.ts`, `research.md` §2)가 이미 점유한 디렉터리이므로, 02의 결과 계약 스키마는 타입 정의와 같은 `lib/diagnosis/` 아래(`types.ts`와 나란히)에 둔다.

**엄격성 결정 (확정)**: 모든 분기는 `z.strictObject(...)`(또는 동등한 `.object({...}).strict()`)로 선언하며, `z.object`(느슨한 기본 동작 — 알 수 없는 키를 무시하고 통과시킴)를 사용하지 않는다. 이유: 01 응답이 `factChips`/`badges` 등 배열 요소로 그대로 흘러 들어오는 구조이므로, 오염된 키(예: 오래된 스키마 버전의 잔여 필드, 다른 모듈이 실수로 병합한 값)가 known-key 검증만으로는 조용히 통과해 화면에 반영되지 않는 죽은 데이터로 남을 수 있다 — `safeParse` 단계에서 미지 키를 명시적으로 거부해야 그런 오염을 구조 불일치로 즉시 표면화할 수 있다.

```ts
// [설계 의도 — run-phase가 실제 코드로 작성한다, lib/diagnosis/schema.ts]
import { z } from "zod";
import { DIAGNOSIS_SCHEMA_VERSION } from "./types";

export const CoverageCategorySchema = z.enum([
  "reimbursement", "fixed", "disability", "special",
]);

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

// §1의 FactChip은 AccidentSummaryFact를 TS interface extends로 상속하지만,
// zod strictObject는 상속을 그대로 반영하지 않으므로 필드 집합을 questionId와
// 함께 다시 나열한다(구조는 AccidentSummaryFactSchema + questionId와 동일) —
// label/value에는 AccidentSummaryFactSchema와 동일한 .min(1) 의미 검증을
// 적용한다(동일 TS 타입을 상속하므로 두 스키마의 빈 문자열 허용 여부가 어긋나서는
// 안 된다). questionId는 식별자이며 별도 의미 검증 대상으로 지정되지 않았다.
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
  "subscription-check", "generation-check", "policy-type-check",
  "hospital-type-check", "facility-check", "group-insurance-check",
  "individual-check", "multi-match", "custom",
]);

export const CoverageBadgeSchema = z.strictObject({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: CoverageBadgeKindSchema,
});

// 5분기 모두 strictObject — kind별로 허용되는 필드 집합이 다르므로(range/fixed만
// min/max/value를 갖는다), AC-B2CRESULT-006 추가 시나리오("kind: range인데
// min/max 없음"을 safeParse가 거부)가 검증하는 대상이 바로 이 discriminatedUnion이다.
// label/displayText는 모든 분기 공통으로 카드에 그대로 표시되는 문구이므로
// .min(1)로 빈 문자열을 거부한다.
export const BenefitDisplaySchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("range"), label: z.string().min(1), min: z.number(), max: z.number(), displayText: z.string().min(1) }),
  z.strictObject({ kind: z.literal("fixed"), label: z.string().min(1), value: z.number(), displayText: z.string().min(1) }),
  z.strictObject({ kind: z.literal("formula"), label: z.string().min(1), displayText: z.string().min(1) }),
  z.strictObject({ kind: z.literal("conditional"), label: z.string().min(1), displayText: z.string().min(1) }),
  z.strictObject({ kind: z.literal("unavailable"), label: z.string().min(1), displayText: z.string().min(1) }),
]);

// CoverageItemBase(§1)의 공통 필수 필드 — status discriminatedUnion의 세 분기가
// 스프레드로 재사용해 중복 나열을 피한다. 필드 목록은 §1 CoverageItemBase와
// 1:1로 대응한다. id/name/description/whyCheck는 카드에 그대로 표시되는
// 식별자·문구이므로 .min(1)로 빈 문자열을 거부한다.
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

// status: "low-likelihood" 분기만 reasonNote를 요구한다 — §1 TS 타입 정의가
// 컴파일 시점에 강제하는 것과 동일한 강제를 런타임에도 재현한다
// (REQ-B2CRESULT-005, AC-B2CRESULT-005 추가 시나리오). reasonNote는 빈
// 문자열이면 "사유"로서 의미가 없으므로 .min(1)을 적용한다. "review"/
// "needs-info" 분기는 CoverageItemCommonFields에 reasonNote 필드가 없고
// z.strictObject이므로, reasonNote 키를 가진 객체가 주어지면 safeParse가
// 거부한다(§1의 `reasonNote?: never` TS 금지와 동일한 강제를 런타임에 재현) —
// 별도의 스키마 수정 없이 strictObject의 미지 키 거부 동작이 그대로 이 금지를
// 구현한다.
export const CoverageItemSchema = z.discriminatedUnion("status", [
  z.strictObject({ ...CoverageItemCommonFields, status: z.literal("review") }),
  z.strictObject({ ...CoverageItemCommonFields, status: z.literal("needs-info") }),
  z.strictObject({ ...CoverageItemCommonFields, status: z.literal("low-likelihood"), reasonNote: z.string().min(1) }),
]);

// DiagnosisResult 전체 계약 — 01→02 인계 채널(§3)이 sessionStorage에서 읽은
// 원시 JSON을 이 스키마로 safeParse해 유효성을 판정한다.
// readDiagnosisHandoff()(§3)의 "invalid" 분기는 이 safeParse 실패
// (JSON.parse 실패를 포함)를 근거로 판정된다. resultId/rawInput은 .min(1)로
// 빈 문자열을, schemaVersion은 z.literal(DIAGNOSIS_SCHEMA_VERSION)로 계약
// 버전 불일치를, generatedAt은 z.iso.datetime({ offset: true })로 ISO-8601
// 형식 위반을 각각 safeParse 실패로 거부한다(AC-B2CRESULT-014 추가 시나리오 —
// 빈 resultId·미지원 schemaVersion·비-ISO-8601 generatedAt 3가지 모두
// "invalid"). 프로젝트의 zod 버전(4.4.3)은 z.iso 네임스페이스(z.iso.datetime
// 등)를 제공하므로 이 형태를 사용한다 — 구버전 zod에서는 동등한
// z.string().datetime({ offset: true })로 대체한다.
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
```

## 2. 집계 함수 (`lib/diagnosis/aggregate.ts`, 신규)

```ts
// [설계 의도]
export interface DiagnosisAggregate {
  total: number;
  review: number;
  needsInfo: number;
  lowLikelihood: number;
}

export function computeAggregate(items: readonly CoverageItem[]): DiagnosisAggregate {
  // items.length와 status별 reduce만으로 구현 — 하드코딩된 상수 없음(REQ-B2CRESULT-002)
}

// "입력하신 사고 내용" 카드의 "추가 질문 답변" strip이 소비하는 값. 별도
// DiagnosisResult 저장 필드가 아니라 items[].factChips의 순수 파생값이다 —
// questionId 기준으로 중복을 제거하며, items 배열과 각 item의 factChips 배열을
// 그 순서 그대로 스캔해 먼저 발견된 항목을 유지한다(REQ-B2CRESULT-001/007/008).
export function collectAnsweredFacts(items: readonly CoverageItem[]): FactChip[] {
  // items를 순회하며 factChips를 펼치고(flat), 이미 등장한 questionId는 건너뛴다.
  // rawInput/answers를 직접 재순회하지 않는다 — SSOT는 항상 items[].factChips다.
}
```

`result-aggregate-banner.tsx`는 `computeAggregate`의 반환값만 렌더링하며, 디자인 목업의 예시 숫자(15/8/6/1, `design/MIGRATION-PLAN.md` §4)는 픽스처 데이터 안에만 존재하고 코드 상수로는 어디에도 등장하지 않는다. `result-input-summary.tsx`(§5)는 `collectAnsweredFacts`의 반환값만 렌더링하며, `answers`를 직접 순회해 strip을 만들지 않는다.

## 3. 01→02 인계 채널 (`lib/diagnosis/handoff.ts`, 신규) — 결정 및 근거

**검토한 대안 세 가지**:

| 대안 | 장점 | 단점 | 채택 여부 |
|---|---|---|---|
| URL 쿼리 파라미터(base64 JSON) | 새로고침·북마크 가능, 서버 미경유 | `answers` 확장 시 URL 길이 관리 필요, 인코딩/디코딩 로직 추가 | 미채택 |
| `sessionStorage` | 서버 미경유, 라우트 전환에도 생존, 구현 단순 | 동일 탭에서는 새로고침·뒤로가기 후에도 재사용 가능하며, 탭 종료 시 브라우저가 정리함 | **채택** |
| 서버 API 왕복(임시 세션 레코드) | 데이터 크기 제약 없음 | REQ-B2CDIAG-021/REQ-B2CFOUND 원칙(서버 영구 저장 없음)과 충돌, 신규 API 라우트 필요(Out of Scope) | 미채택 |

**결정 (확정)**: `sessionStorage`. 저장·조회·삭제를 3개의 분리된 함수로 노출한다 — 어떤 함수도 "읽으면서 동시에 지운다"는 암묵적 부수효과를 갖지 않는다(review 피드백 반영: 이전 초안의 read-once-then-clear 설계는 새로고침 시 결과가 사라지는 문제가 있어 철회한다).

```ts
// [설계 의도]
export function writeDiagnosisHandoff(result: DiagnosisResult): void { /* ... */ }

// readDiagnosisHandoff()는 3갈래 판별 유니언으로 반환한다 — sessionStorage에
// 값이 아예 없는 경우("empty")와, 값은 있으나 DiagnosisResultSchema(§1b)의
// safeParse가 거부하는 경우("invalid")를 서로 다른 상태로 구분해야
// result-view.tsx(§5)가 02 전용 "결과 없음"(REQ-B2CRESULT-013)과 "오류"
// (REQ-B2CRESULT-014) 상태를 혼동 없이 갈라 렌더링할 수 있다 — boolean 반환이나
// 예외 throw로는 이 세 상태를 하나의 호출 결과로 구분해 전달할 수 없다.
export type DiagnosisHandoffReadResult =
  | { status: "empty" }
  | { status: "valid"; result: DiagnosisResult }
  | { status: "invalid"; reason: string };

export function readDiagnosisHandoff(): DiagnosisHandoffReadResult {
  /* 읽기만 하며, 어떤 분기에서도 sessionStorage를 변경하지 않는다.
     1) sessionStorage에 키가 없으면            → { status: "empty" }
     2) 값은 있으나 JSON.parse가 실패하거나,
        DiagnosisResultSchema.safeParse(§1b)가
        success: false를 반환하면                → { status: "invalid", reason }
     3) safeParse가 success: true를 반환하면      → { status: "valid", result: data } */
}

export function clearDiagnosisHandoff(): void { /* 명시적 트리거에서만 호출 */ }
```

`writeDiagnosisHandoff(result: DiagnosisResult)`는 진단 중 단계가 `"result"`로 완료되는 시점에 `buildFractureResult(rawInput, answers)`가 구성한 **완전한** `DiagnosisResult`를 1회 기록한다(§4) — `rawInput`/`answers`만 저장하고 결과 구성을 `/result` 쪽으로 미루지 않는다(REQ-B2CRESULT-010). `/result` 마운트 시 `readDiagnosisHandoff()`가 `DiagnosisHandoffReadResult`(위 3갈래)를 반환하며, `result-view.tsx`(§5)는 이 값을 그대로 분기한다 — `"empty"`이면 02 전용 "결과 없음" 상태(REQ-B2CRESULT-013), `"invalid"`이면 02 전용 오류 상태(REQ-B2CRESULT-014, "구문적으로 유효한 JSON이지만 스키마 불일치"인 경우도 포함), `"valid"`이면 `result` 필드를 렌더링한다. 세 경우 모두 이 호출은 `sessionStorage`를 변경하지 않는다(REQ-B2CRESULT-016, AC-B2CRESULT-016). SSR 환경(`typeof window === "undefined"`)에서는 `readDiagnosisHandoff()`가 안전하게 `{ status: "empty" }`를 반환하고, `writeDiagnosisHandoff`/`clearDiagnosisHandoff`는 no-op이다. 키는 프로젝트 네임스페이스를 포함한 전용 문자열을 사용한다(REQ-B2CRESULT-017, 예: `"bosang-radar:diagnosis-handoff-v1"`— 실제 값은 run-phase가 확정).

**왜 탭 세션 동안 유지하는가(수명 정책, REQ-B2CRESULT-016)**: 이전 초안의 "1회 읽고 즉시 삭제" 설계는 새로고침·뒤로가기 시 결과가 사라지는 부작용이 있었다(review 피드백 — 사용자가 결과를 다시 보려고 새로고침하면 "결과 없음" 상태로 튕기는 것은 좋은 경험이 아니다). 새 설계는 데이터를 동일 탭 세션 동안 유지하고, `clearDiagnosisHandoff()`를 아래 세 경우에만 명시적으로 호출한다:

1. **새 진단 시작** — 01 입력 화면에서 새 입력을 제출해 새로운 `loading` 사이클이 시작될 때(`diagnosis-flow.tsx`가 호출).
2. **상담 신청 완료** — 03 상담 신청 SPEC의 범위. 이 SPEC은 `clearDiagnosisHandoff()`를 상담 신청 완료 콜백에서 호출한다는 **트리거 지점만 예약**하며, 03의 실제 구현은 다루지 않는다(§12 참고).
3. **사용자의 명시적 초기화 요청** — run-phase가 UI 형태(예: "새로 진단하기" 버튼)를 확정한다.

이 세 트리거 밖에서는(단순 페이지 조회·새로고침·뒤로가기) 데이터가 보존되며, 02 화면 안에서의 탭 전환·인터랙션은 모두 React state(마운트 시 1회 읽은 값)로 처리된다.

## 4. 기존 01 mock 판정 로직 확장 (`step-loading.tsx`, 기존 파일 최소 확장) — 충돌 회피 결정

SPEC-B2C-DIAGNOSIS-001의 `mockJudge(input)`는 현재 다음과 같다:

```ts
export function mockJudge(input: string): "result-none" | "error" {
  return input.includes("오류") ? "error" : "result-none";
}
```

이 SPEC은 세 번째 결과("결과 있음")를 추가해야 하지만, **부분 문자열 키워드 방식을 그대로 확장하면 기존 01 E2E 회귀가 발생한다**: `e2e/diagnosis-flow-01.spec.ts`의 `RESULT_NONE_INPUT = "무릎 골절로 수술을 받았어요"`가 이미 "골절"이라는 단어를 포함하고 있고, 이 브리프가 제시한 예시 fixture 입력(`"3일 전에 헬스장에서 벤치프레스 하다가 무릎이 골절됐어요"`, `step-input.tsx` placeholder와 동일)도 "골절"을 포함한다 — 만약 "골절" 포함 여부로 새 분기를 만들면 기존 `RESULT_NONE_INPUT` 테스트가 더 이상 `result-none`으로 판정되지 않아 깨진다.

**결정 (확정)**: 신규 분기는 **정확 문자열 일치(exact match)** 로만 트리거하며, **fixture 실행 여부는 항상 명시적 boolean 인자로 게이트한다** — `<DiagnosisFlow />`가 마운트되었다는 사실(즉 `productionReady || reviewEnabled`가 참이었다는 암묵적 추론)만으로는 fixture를 허용하지 않는다(REQ-B2CRESULT-009 — review 피드백: defense-in-depth). `mockJudge`는 `reviewEnabled`를 2번째 인자로 받는다.

```ts
// [설계 의도 — 실제 판정 순서]
export function mockJudge(input: string, reviewEnabled: boolean): "result-none" | "error" | "result" {
  if (reviewEnabled && input === FRACTURE_FIXTURE_INPUT) return "result";
  if (input.includes("오류")) return "error";
  return "result-none";
}
```

`FRACTURE_FIXTURE_INPUT`은 `lib/diagnosis/fixtures/fracture-case.ts`에서 import한다(단일 정의처, 중복 금지). `reviewEnabled`는 `DiagnosisFlow`가 이미 prop으로 받는 `enableDevStates`(§0, `app/page.tsx`의 `computeDiagnosisFlags()` 결과)를 `StepLoading`에 그대로 전달(prop drilling)한 값이다 — `StepLoading`이 `process.env`를 직접 읽거나 다른 상태로부터 이 값을 추론하지 않는다. 조건 순서(reviewEnabled && exact 일치 → "오류" 포함 → 기본값)는 `FRACTURE_FIXTURE_INPUT` 문자열 자체가 "오류"를 포함하지 않으므로 순서 자체가 동작에 영향을 주지는 않지만, 가장 구체적인 조건을 먼저 둔다. 기존 `RESULT_NONE_INPUT`("무릎 골절로 수술을 받았어요")과 `ERROR_INPUT`("분석 중 오류가 발생했어요")은 `FRACTURE_FIXTURE_INPUT`과 정확히 다른 문자열이므로 `reviewEnabled` 값과 무관하게 각각 기존과 동일하게 `result-none`/`error`로 판정된다(REQ-B2CRESULT-011, AC-B2CRESULT-011/011b).

**`diagnosis-flow.tsx` 최소 확장**: `StepLoading`이 `onDone(step: "result-none" | "error" | "result")`를 호출할 때, `"result"`인 경우 `FORCE_STEP` dispatch(기존 상태 머신 전이)가 아니라 다음 순서의 사이드 이펙트를 수행하는 분기를 추가한다 — `DiagnosisStep` 유니언 타입 자체에는 `"result"`를 추가하지 않는다(01의 6단계 상태 머신은 변경하지 않고, "결과 있음"은 애초에 라우트 이동이므로 상태값이 아니라 사이드 이펙트로 처리한다, Enforce Simplicity):

1. `buildFractureResult(state.input, state.answers)`를 호출해 완전한 `DiagnosisResult`를 구성한다(§1/§7).
2. `writeDiagnosisHandoff(result)`로 그 결과 전체를 기록한다(§3) — `rawInput`/`answers`만 별도로 저장하지 않는다.
3. `router.push('/result')`로 이동한다.

동일 컴포넌트가 소유한 reducer가 새 진단을 시작하는 액션(예: 입력 화면으로 돌아가 새 입력을 제출)을 처리할 때는 `clearDiagnosisHandoff()`를 호출해 이전 세션의 handoff를 제거한다(§3의 새 진단 시작 트리거).

## 5. `/result` 라우트 셸 (`app/result/page.tsx`, 신규) + 게이트 공유 리팩터

`app/page.tsx`가 현재 인라인으로 계산하는 `productionReady`/`reviewEnabled`/`shouldRenderDiagnosis`(§19, REQ-B2CDIAG-025)를 `lib/diagnosis/flags.ts`의 `computeDiagnosisFlags(env)` 단일 함수로 추출한다(REQ-B2CRESULT-012). `app/page.tsx`는 이 함수를 호출하도록 최소 리팩터되며(기존 `app/page.test.tsx`의 5행 동작 행렬은 회귀 없이 계속 PASS해야 한다), `app/result/page.tsx`는 동일 함수를 재사용한다.

```
app/
└── result/
    └── page.tsx   # [신규] Server Component — computeDiagnosisFlags() 재사용
                    #        shouldRenderDiagnosis=false → 기존과 동일한 "서비스 준비 중입니다" placeholder
                    #        shouldRenderDiagnosis=true  → <Suspense fallback={<ResultSkeleton/>}><ResultView/></Suspense>

components/
└── result/          # [신규]
    ├── result-view.tsx              # "use client" — 마운트 시 handoff 1회 읽기, Desktop/Mobile 분기
    ├── result-skeleton.tsx          # Suspense fallback
    ├── result-input-summary.tsx     # "입력하신 사고 내용" 카드 — inputSummary 4-fact + collectAnsweredFacts strip + "사고 내용 수정" 버튼(stub)
    ├── result-aggregate-banner.tsx
    ├── result-priority-checklist.tsx # "먼저 확인할 항목" 카드 — priorityChecks 렌더링 + 선택 시 targetCategory로 이동(§6)
    ├── coverage-category-section.tsx
    ├── coverage-item-card.tsx       # badges + benefit.label/displayText + factChips 렌더링(REQ-B2CRESULT-001/005/006/007/008)
    ├── result-category-tabs.tsx     # Mobile 전용 tablist/tab/tabpanel
    ├── result-cta-bar.tsx           # 3곳 CTA, 03 부재로 stub
    ├── result-no-data.tsx           # REQ-B2CRESULT-013
    └── result-error.tsx             # REQ-B2CRESULT-014

lib/
└── diagnosis/        # [신규]
    ├── types.ts
    ├── schema.ts                    # DiagnosisResultSchema 전체(§1b, 모든 하위 타입을 미러링하는 zod 스키마) — 모든 분기 z.strictObject
    ├── aggregate.ts
    ├── handoff.ts
    ├── flags.ts                     # computeDiagnosisFlags() — app/page.tsx도 이 함수로 리팩터
    └── fixtures/
        └── fracture-case.ts         # FRACTURE_FIXTURE_INPUT + buildFractureResult(rawInput, answers): DiagnosisResult
```

**Server/Client 경계**: `app/result/page.tsx`는 `app/page.tsx`와 동일하게 Server Component로 유지한다. `sessionStorage` 접근은 브라우저 API이므로 `result-view.tsx`부터 하위 전체가 `"use client"`다.

## 6. Desktop/Mobile 컴포넌트 재사용 경계

`result-view.tsx`가 `useMediaQuery(DESKTOP_MEDIA_QUERY)`(`components/diagnosis/use-media-query.ts` 재사용, 복제하지 않음)로 분기한다:

- **Desktop**: `items`를 4개 카테고리로 `groupBy` 한 뒤 `coverage-category-section.tsx`를 4번(카테고리 순서 고정) 렌더링 — 전부 동시에 DOM에 존재.
- **Mobile**: `result-category-tabs.tsx`가 선택된 카테고리 하나만 `coverage-category-section.tsx`에 전달 — 나머지 3개는 렌더 트리에서 제외(REQ-B2CRESULT-003, "한 번에 하나만"이 디자인 의도이므로 `hidden` CSS가 아니라 조건부 렌더링).

두 분기 모두 `coverage-category-section.tsx`/`coverage-item-card.tsx`를 그대로 재사용하며, 이 SPEC은 Desktop 전용·Mobile 전용 카드 컴포넌트를 별도로 만들지 않는다(REQ-B2CRESULT-004, Enforce Simplicity).

`result-input-summary.tsx`와 `result-priority-checklist.tsx`(§5)는 Desktop/Mobile 분기 밖에서 한 번만 렌더링되며 — 두 레이아웃 모두 동일한 `inputSummary`/`priorityChecks` 데이터를 동일한 컴포넌트로 표시한다(별도 Desktop/Mobile 변형 없음, REQ-B2CRESULT-004와 동일한 원칙).

**확인 우선순위 카드 선택 시 이동 동작(REQ-B2CRESULT-001 `priorityChecks` 상세)**: `result-priority-checklist.tsx`의 각 행을 선택하면 `targetCategory`가 가리키는 카테고리로 이동한다 — Desktop에서는 4개 카테고리 섹션이 이미 모두 DOM에 있으므로 해당 `coverage-category-section.tsx`로 스크롤 이동(anchor scroll)하고, Mobile에서는 `result-category-tabs.tsx`의 활성 탭을 `targetCategory`로 전환한 뒤 그 패널 상단으로 스크롤한다. 두 분기 모두 `result-category-tabs.tsx`가 이미 갖는 "탭 전환 시 패널 제목으로 포커스 이동" 패턴(REQ-B2CRESULT-021)을 재사용하며, 이 이동을 위한 별도 라우팅이나 페이지 이동은 발생하지 않는다.

## 7. Fact Chip · 배지 · 보장 방식 매핑 (fixture 구성 규칙)

`buildFractureResult(rawInput, answers): DiagnosisResult`(review 전용 fixture 빌더)는 `DiagnosisResult` 전체(`resultId`/`schemaVersion`/`inputSummary`/`priorityChecks`/`items`/`generatedAt`, §1)를 골절 사례 고정 데이터로 채워 반환한다 — 반환값은 즉시 `writeDiagnosisHandoff()`로 기록되는 최종 형태이며(§3/§4), `/result`가 추가로 가공하지 않는다.

**`inputSummary`**: `{ title: "무릎·아래다리의 골절", when: { label: "언제", value: "3일 전" }, where: { label: "어디서", value: "헬스장" }, mechanism: { label: "어떻게", value: "벤치프레스 중" }, bodyPart: { label: "어디를", value: "무릎 골절" } }` — 02/M02/M02-B/M02-C/M02-D 5개 화면 상단에 공통으로 표시되는 고정값이다(`design/exports/` 재대조 결과).

**`priorityChecks`**: 정확히 3개 행("먼저 확인할 항목" 카드 #1~#3)을 고정 반환한다 — `{ id: "priority-1", title: "실손 의료비 가입 세대 확인", description: "가입 시기에 따라 자기부담금과 보장 범위가 달라집니다", targetCategory: "reimbursement" }`, `{ id: "priority-2", title: "골절·상해수술비 가입 여부 확인", description: "정액 담보는 가입한 특약 수만큼 각각 검토됩니다", targetCategory: "fixed" }`, `{ id: "priority-3", title: "치료 후 무릎 운동 범위 확인", description: "후유장해는 치료 종결 후에 판단할 수 있습니다", targetCategory: "disability" }`. `targetCategory`는 §6의 선택-시-이동 동작이 소비한다.

**`CoverageItem.factChips`**: 골절 사례 고정 담보 목록 위에 `answers` 딕셔너리를 매핑해 생성한다 — 매핑 규칙(질문 ID → 어느 카드에 Chip을 붙일지)은 fixture 내부에 하드코딩된 골절 사례 전용 테이블이며, 실제 매칭 엔진이 결정되기 전까지는 일반화하지 않는다(§ Out of Scope와 일치). 응답이 `answers`에 없는 질문 ID는 매핑 테이블에서 제외되어 Chip이 생성되지 않는다(REQ-B2CRESULT-008). 각 Chip은 `{ questionId, label, value }` 구조로 채워진다(예: `{ questionId: "surgery", label: "수술 여부", value: "수술 받음" }`) — 결합 문자열이 아니라 라벨/값을 독립 필드로 채우는 것은 §1 `FactChip` 타입 변경의 직접적인 귀결이다.

**"추가 질문 답변" strip**: `result-input-summary.tsx`가 렌더링하는 이 strip은 fixture가 별도로 반환하는 필드가 아니다 — `collectAnsweredFacts(result.items)`(§2)가 `items[].factChips`를 questionId 기준으로 중복 제거해 파생한다. 골절 fixture는 "수술 여부"/"입원 여부"/"사고 장소" 3개 질문에 대한 응답을 여러 카드의 `factChips`에 중복 매핑하지만(예: "수술 여부" 응답이 "골절수술비"·"상해수술비" 두 카드 모두에 Chip으로 붙을 수 있다), strip에는 questionId당 정확히 1회만 나타난다.

**`badges`**: 카드마다 관찰된 라벨을 `CoverageBadgeKind`로 매핑한다 — "가입 확인 필요" → `"subscription-check"`(실손 의료비 카테고리의 "통원 실손의료비"/"입원 실손의료비" 카드는 `"generation-check"`로 구분 — "먼저 확인할 항목" #1 "실손 의료비 가입 세대 확인"과 연동), "보험증권 확인 필요" → `"policy-type-check"`, "시설 가입 여부 확인" → `"facility-check"`, "단체보험 가입 여부 확인" → `"group-insurance-check"`. "5대 골절 진단비" 카드처럼 보조 배지가 없는 카드는 `badges: []`(빈 배열)로 표현하며, `undefined`나 생략은 허용하지 않는다(§1 `badges: CoverageBadge[]`는 필수 필드).

**`benefit`**: "보장 방식" 서술형 문구("자기부담금 차감 후 보상", "가입금액 × 장해지급률")는 `kind: "formula"`, "일반적인 가입금액 예시"/"일반적인 한도 예시" 범위값("30만~50만원", "연 250만원~300만원")은 `kind: "range"`(`min`/`max`는 원 단위 정수, `displayText`는 화면 표시 문자열), "증권 확인 필요"/"상대방 보험 · 별도 산정" 같은 조건부 서술은 `kind: "conditional"`, "5대 골절 진단비"의 "현재 정보상 / 가능성 낮음"은 `kind: "unavailable"`로 매핑한다. 현재 골절 fixture에는 `kind: "fixed"` 사례가 없으나(모든 정액 담보가 범위 표기), 타입은 향후 fixture 확장을 위해 이 분기를 유지한다.

컴포넌트별 설명 문구(`description`/`whyCheck`/`requiredDocuments` 등)도 이 fixture가 골절 사례 전용 값으로 채워 넣으며, 컴포넌트에 리터럴로 존재하지 않는다(§1 하드코딩 문구 금지). "실손보험 가입 시기를 알려주시면…" 세대 선택 위젯(2009년 이전/2009~2017/2017~2021/2021년 이후/모르겠어요)은 고정 옵션을 갖는 UI 전용 인터랙션 컴포넌트다 — 선택 결과가 `DiagnosisResult`를 변경하거나 서버에 전송되지 않으므로 이 SPEC의 데이터 계약에 필드를 추가하지 않는다(run-phase가 로컬 UI 상태로만 처리).

## 8. 03 상담 CTA — stub 처리 (결정 확정)

`design/MIGRATION-PLAN.md` §4 "상담 CTA 배치(3곳)"를 그대로 배치하되(상단 탑바 "카톡 상담", 후유장해 섹션 "내 장해율이 얼마나 나올지 궁금하신가요?", 하단 "N가지를 전부 청구하시겠어요?"), 03 라우트가 존재하지 않으므로 클릭 시 실제 페이지 이동을 수행하지 않는다(REQ-B2CRESULT-023).

**결정 (확정, review 피드백 반영 — 더 이상 run-phase 미결정 항목이 아니다)**: 네이티브 `disabled` 속성은 사용하지 않는다 — `disabled` 버튼은 키보드 포커스 대상에서 완전히 제외되고 일부 스크린리더 조합에서 존재 자체가 인지되지 않아, "왜 이 버튼이 비활성인지" 사용자가 알 수 없다. 대신:

- `aria-disabled="true"`를 부여해 버튼을 포커스 가능하게 유지한다(`tabindex`로 제외하지 않는다).
- 클릭 핸들러와 `Enter`/`Space` 키 활성화 모두 동일한 no-op 경로로 처리하며, 실제 네비게이션(`router.push`/`<a href>` 등) 없이 "준비 중" 안내를 표시한다(토스트 또는 `aria-live` 영역 — run-phase가 기존 `components/ui/*`의 알림 패턴을 재사용해 구현 형태를 정한다).
- "준비 중" 안내는 스크린리더가 인지할 수 있는 텍스트로 전달되어야 한다 — 시각적으로만 보이는 툴팁 하나로 끝내지 않는다(AC-B2CRESULT-023 스크린리더 시맨틱 시나리오).

이 결정으로 `plan.md` §B의 "미결정" 행은 제거되었다(§ 결정 이력은 `plan.md` §B 및 `progress.md` §G 참고).

## 9. review 전용 결정론적 진입 (시각 검증용)

01 SPEC이 확립한 `?devStep=`(`ENABLE_DIAGNOSIS_DEV_STATES` 게이트) 패턴을 `/result`에도 동일하게 적용한다 — `reviewEnabled`가 참인 환경에서 `/result?devFixture=fracture`로 직접 접근하면 01 플로우를 매번 완주하지 않고도 `buildFractureResult(rawInput, answers)`의 고정 데이터로 `ResultView`를 결정론적으로 렌더링할 수 있다. 이는 `pnpm visual:verify`가 5개 신규 화면을 안정적으로 캡처하기 위한 전용 진입점이며, `reviewEnabled=false`(프로덕션 기본값)에서는 무시된다(01의 `?devStep=` 계약과 동일한 안전 원칙). 이 진입점은 §4의 `mockJudge` boolean 게이트와 **같은 `reviewEnabled` 값**을 재사용한다 — `/result` 라우트 자체가 별도의 게이트 로직을 인라인으로 다시 계산하지 않는다(REQ-B2CRESULT-009/012, AC-B2CRESULT-009 추가 시나리오).

## 10. 접근성

- `result-category-tabs.tsx`: WAI-ARIA Tabs 패턴(`role="tablist"`/`role="tab"` + `aria-selected`/`role="tabpanel"`), 방향키로 탭 이동.
- 탭 전환 시 포커스는 새 패널의 카테고리 제목(`<h2>`)으로 이동한다(01의 "질문 전환 시 포커스가 새 제목으로 이동" 패턴 재사용, REQ-B2CRESULT-021).
- 상태 pill은 텍스트 라벨을 항상 포함한다(REQ-B2CRESULT-020) — 배경/보더 색상은 보조 신호일 뿐이다.
- 모든 애니메이션은 `prefers-reduced-motion` 존중(기존 `diagnosis-flow.tsx`/`popover.tsx` 패턴 재사용).

## 11. 금액·문구 정책 (재확인)

`design/MIGRATION-PLAN.md` §5를 그대로 따른다 — 놀라움의 축은 담보 개수, 금액은 범위 표기(정액 담보만 예외), 면책 문구 항상 노출, 단정형 표현 금지(REQ-B2CRESULT-022). 이 원칙은 `product.md`가 이미 프로젝트 전역 원칙으로 채택했으므로 이 SPEC은 새로 결정하지 않고 그대로 적용한다.

## 12. 03 상담 신청과의 전달 경계 (비구속 설계 노트)

이 절은 **결정이 아니라 노트**다 — 03 상담 신청 SPEC의 실제 설계는 그 SPEC 자신이 한다(§ Out of Scope). 다만 이 SPEC이 03을 막지 않도록 두 가지만 기록해 둔다:

- `DiagnosisResult`의 `resultId`/`schemaVersion`(§1)은 03이 "어느 진단 결과에 대한 상담 신청인지"를 참조할 수 있는 안정적인 식별자·버전 표지로 설계되었다 — 03이 별도 식별자 체계를 새로 만들 필요 없이 이 값을 그대로 소비할 수 있다.
- `clearDiagnosisHandoff()`(§3)는 상담 신청 "완료" 시점에 호출될 트리거 지점으로 예약되어 있다 — 03이 실제로 이 함수를 호출하는 코드(상담 신청 완료 콜백 등)를 작성하는 것은 이 SPEC의 범위 밖이며, 이 SPEC은 그 함수가 존재하고 호출 가능하다는 것만 보장한다.
