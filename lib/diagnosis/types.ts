// SPEC-B2C-RESULT-001 M1 — 02 화면(보상 진단 결과) 데이터 계약의 단일 SSOT.
// 실제 담보 매칭 엔진은 이 SPEC의 범위 밖이며, 이 타입은 엔진과 UI 사이의
// 유일한 계약이다(design.md §1, REQ-B2CRESULT-001).

/** 담보 카테고리 — 정확히 4개로 고정(케이스별 확장 없음, REQ-B2CRESULT-001). */
export type CoverageCategory =
  | "reimbursement" // 실손 의료비
  | "fixed" // 정액 담보
  | "disability" // 후유장해
  | "special"; // 특별 보상

/**
 * 담보 카드의 3톤 상태.
 * 라벨 매핑(코드는 영문 식별자, 화면 텍스트만 한글):
 *   review        → "검토 대상"
 *   needs-info    → "추가 정보 필요"
 *   low-likelihood → "가능성 낮음"
 */
export type CoverageStatus = "review" | "needs-info" | "low-likelihood";

/**
 * 라벨+값 2단 타이포그래피(약한 톤 라벨 + 강조 톤 값)를 공유하는 최소 구조.
 * "입력하신 사고 내용" 카드의 4칩과 담보 카드 위 Fact Chip이 동일한 시각
 * 패턴을 쓰므로 하나의 타입을 공유한다.
 */
export interface AccidentSummaryFact {
  label: string; // 예: "언제" — 약한 톤
  value: string; // 예: "3일 전" — 강조 톤
}

/**
 * "입력하신 사고 내용" 카드가 렌더링하는 4개 필수 사실. rawInput 원문을 재노출하거나
 * `/result`가 rawInput을 재파싱해 만들지 않는다 — fixture(또는 실제 엔진)가
 * 이미 4개 필드로 구조화해 넘긴다(REQ-B2CRESULT-001).
 */
export interface InputAccidentSummary {
  title: string; // 예: "무릎·아래다리의 골절" — 카드 제목
  when: AccidentSummaryFact; // "언제"
  where: AccidentSummaryFact; // "어디서"
  mechanism: AccidentSummaryFact; // "어떻게"
  bodyPart: AccidentSummaryFact; // "어디를"
}

/**
 * AccidentSummaryFact를 상속해 questionId(식별용)를 더한다 — 담보 카드 위
 * Fact Chip과 "추가 질문 답변" strip이 동일한 라벨/값 2단 타이포그래피로
 * 렌더링되기 때문이다(REQ-B2CRESULT-001/007/008).
 */
export interface FactChip extends AccidentSummaryFact {
  questionId: string; // 01-B 질문 ID
}

/**
 * "먼저 확인할 항목" 카드의 각 행. 문자열 배열이 아니라 제목/설명/이동 대상을
 * 함께 갖는 구조체다 — targetCategory는 선택 시 이동할 담보 카테고리다.
 */
export interface PriorityCheck {
  id: string;
  title: string; // 예: "실손 의료비 가입 세대 확인"
  description: string; // 예: "가입 시기에 따라 자기부담금과 보장 범위가 달라집니다"
  targetCategory: CoverageCategory;
}

/**
 * 담보 카드가 다는 보조 배지 종류 — 9종 고정 유니언(REQ-B2CRESULT-001/005).
 * 과거의 `multiMatch?: boolean` / `subscriptionGenBadge?: string` 같은 단일
 * 목적 optional 필드는 폐기되고 이 유니언 + CoverageBadge[] 배열로 대체된다.
 */
export type CoverageBadgeKind =
  | "subscription-check" // 일반 가입 여부 확인
  | "generation-check" // 실손 의료비 가입 세대 확인
  | "policy-type-check" // 보험증권 확인
  | "hospital-type-check" // 병원 종별 확인
  | "facility-check" // 시설 가입 여부 확인
  | "group-insurance-check" // 단체보험 가입 여부 확인
  | "individual-check" // 개인 가입 확인
  | "multi-match" // 복수 확인
  | "custom"; // 위 8종에 속하지 않는 케이스 전용 배지

export interface CoverageBadge {
  id: string;
  label: string; // 화면에 표시되는 문구 — 케이스 전용 값, 컴포넌트에 하드코딩되지 않음
  kind: CoverageBadgeKind;
}

/**
 * 보장 방식·가입금액 표시. 모든 분기가 카드에 그대로 표시되는 label(예: "보장
 * 방식", "일반적인 가입금액 예시")과 displayText를 함께 갖는다 — UI는
 * label+displayText 쌍을 그대로 출력할 뿐 min/max/value를 직접 조합해
 * 문구를 만들지 않는다(REQ-B2CRESULT-006).
 */
export type BenefitDisplay =
  | { kind: "range"; label: string; min: number; max: number; displayText: string }
  | { kind: "fixed"; label: string; value: number; displayText: string }
  | { kind: "formula"; label: string; displayText: string }
  | { kind: "conditional"; label: string; displayText: string }
  | { kind: "unavailable"; label: string; displayText: string };

/**
 * CoverageItem의 status-무관 공통 필수 필드. benefit은 status discriminated
 * union과 독립적으로 항상 필수다 — "가능성 낮음" 분기에서도 benefit 자체는
 * 생략되지 않고 kind가 "unavailable"/"conditional"로 산정 불가 상태를 표현할
 * 뿐이다(REQ-B2CRESULT-005/006).
 */
interface CoverageItemBase {
  id: string;
  category: CoverageCategory;
  name: string; // 예: "5대 골절 진단비"
  description: string; // 담보/보장 방식 설명(이 항목 전용 문구)
  whyCheck: string; // "왜 이 담보를 확인해야 하는지"
  badges: CoverageBadge[]; // 카드별 보조 배지(0개 이상)
  benefit: BenefitDisplay; // 보장 방식·가입금액 표시 — 항상 필수
  factChips: FactChip[]; // 이 카드에 매핑된 01-B 응답(0개 이상)
  evidenceRefs?: string[]; // 판정 근거 참조
  additionalInfoNote?: string; // status === "needs-info"일 때의 안내 문구
  requiredDocuments?: string[]; // 청구/확인에 필요한 서류 목록
}

/**
 * status로 판별되는 discriminated union — "low-likelihood" 분기에서만
 * reasonNote가 필수다. "review"/"needs-info" 분기는 reasonNote가 선택
 * (optional)이 아니라 `reasonNote?: never`로 명시적으로 금지된다
 * (REQ-B2CRESULT-005).
 */
export type CoverageItem =
  | (CoverageItemBase & { status: "review"; reasonNote?: never })
  | (CoverageItemBase & { status: "needs-info"; reasonNote?: never })
  | (CoverageItemBase & { status: "low-likelihood"; reasonNote: string });

/**
 * 이 계약의 버전 상수 — 후속 소비자(예: 03 SPEC)가 형태 변화를 감지하는
 * 기준값이다. DiagnosisResult.schemaVersion은 이 리터럴 타입으로 고정된다.
 */
export const DIAGNOSIS_SCHEMA_VERSION = "1" as const;

export interface DiagnosisResult {
  resultId: string; // 결과 인스턴스 식별자(REQ-B2CRESULT-001) — 빈 문자열 불가
  schemaVersion: typeof DIAGNOSIS_SCHEMA_VERSION; // 이 계약의 버전
  rawInput: string;
  answers: Record<string, string>;
  inputSummary: InputAccidentSummary; // 사고 내용 구조화 요약
  priorityChecks: PriorityCheck[]; // "확인 우선순위"
  items: CoverageItem[];
  generatedAt: string; // ISO 8601(offset 포함) — sessionStorage 왕복에 그대로 포함되어 보존됨
}
