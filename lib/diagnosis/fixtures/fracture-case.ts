import { DIAGNOSIS_SCHEMA_VERSION } from "../types";
import type { CoverageItem, DiagnosisResult, FactChip, PriorityCheck } from "../types";

// SPEC-B2C-RESULT-001 M2 (design.md §4/§7, REQ-B2CRESULT-009/010) — review
// 전용 골절 사례 fixture. ENABLE_DIAGNOSIS_DEV_STATES가 활성화된
// 비프로덕션 환경에서 mockJudge(step-loading.tsx)의 `reviewEnabled` boolean
// 게이트를 통과한 정확 문자열 일치 입력에 한해서만 호출된다 — 이 파일
// 자체는 별도의 게이트를 갖지 않는다(호출부가 이미 게이트되어 있다).
// DIAGNOSIS_ENGINE_READY를 true로 전환하지 않으며, 실제 담보 매칭 엔진과는
// 무관하다(REQ-B2CRESULT-024).

// step-input.tsx placeholder와 동일한 문자열 — mockJudge의 정확 일치
// 트리거로 사용된다(부분 문자열 매칭이 아님, REQ-B2CRESULT-010, design.md §4).
export const FRACTURE_FIXTURE_INPUT = "3일 전에 헬스장에서 벤치프레스 하다가 무릎이 골절됐어요";

// 01-B 질문 ID → 화면에 표시되는 라벨. fixture 내부 전용 매핑 테이블이며
// 실제 매칭 엔진이 결정되기 전까지는 일반화하지 않는다(design.md §7).
const QUESTION_LABELS: Record<string, string> = {
  surgery: "수술 여부",
  hospitalization: "입원 여부",
  accidentLocation: "사고 장소",
};

/**
 * answers에서 questionIds에 해당하는 응답만 FactChip으로 변환한다. 응답이
 * 없는 질문 ID는 결과에서 제외되어 Chip이 생성되지 않는다(REQ-B2CRESULT-008).
 */
function buildFactChips(
  answers: Record<string, string>,
  questionIds: readonly string[]
): FactChip[] {
  const chips: FactChip[] = [];
  for (const questionId of questionIds) {
    const value = answers[questionId];
    if (value === undefined) {
      continue;
    }
    chips.push({ questionId, label: QUESTION_LABELS[questionId] ?? questionId, value });
  }
  return chips;
}

// "먼저 확인할 항목" 카드 — 정확히 3개 행(design.md §7).
const PRIORITY_CHECKS: PriorityCheck[] = [
  {
    id: "priority-1",
    title: "실손 의료비 가입 세대 확인",
    description: "가입 시기에 따라 자기부담금과 보장 범위가 달라집니다",
    targetCategory: "reimbursement",
  },
  {
    id: "priority-2",
    title: "골절·상해수술비 가입 여부 확인",
    description: "정액 담보는 가입한 특약 수만큼 각각 검토됩니다",
    targetCategory: "fixed",
  },
  {
    id: "priority-3",
    title: "치료 후 무릎 운동 범위 확인",
    description: "후유장해는 치료 종결 후에 판단할 수 있습니다",
    targetCategory: "disability",
  },
];

// 골절 사례 고정 담보 목록 — 4개 카테고리(reimbursement/fixed/disability/
// special)를 모두 포함하며, badges/benefit/factChips 매핑 규칙은
// design.md §7의 fixture 구성 규칙을 그대로 따른다. answers 딕셔너리를
// 매핑해 factChips를 생성한다.
function buildItems(answers: Record<string, string>): CoverageItem[] {
  return [
    {
      id: "item-reimbursement-outpatient",
      category: "reimbursement",
      name: "통원 실손의료비",
      description: "통원 치료 시 발생한 의료비를 보상합니다.",
      whyCheck: "골절 치료 후 통원 진료를 받았기 때문입니다.",
      badges: [
        {
          id: "badge-outpatient-gen",
          label: "실손 의료비 가입 세대 확인",
          kind: "generation-check",
        },
      ],
      benefit: { kind: "formula", label: "보장 방식", displayText: "자기부담금 차감 후 보상" },
      factChips: buildFactChips(answers, ["hospitalization"]),
      status: "review",
    },
    {
      id: "item-reimbursement-inpatient",
      category: "reimbursement",
      name: "입원 실손의료비",
      description: "입원 치료 시 발생한 의료비를 보상합니다.",
      whyCheck: "골절로 입원 치료가 필요할 수 있기 때문입니다.",
      badges: [
        {
          id: "badge-inpatient-gen",
          label: "실손 의료비 가입 세대 확인",
          kind: "generation-check",
        },
      ],
      benefit: { kind: "conditional", label: "보장 방식", displayText: "증권 확인 필요" },
      factChips: buildFactChips(answers, ["hospitalization"]),
      additionalInfoNote: "가입 증권을 확인한 뒤 정확한 보장 범위를 안내드립니다.",
      status: "needs-info",
    },
    {
      id: "item-fixed-5-fracture",
      category: "fixed",
      name: "5대 골절 진단비",
      description: "약관상 지정된 5대 부위 골절 진단 시 정액을 지급합니다.",
      whyCheck: "골절 진단을 받았기 때문입니다.",
      badges: [],
      benefit: {
        kind: "unavailable",
        label: "현재 정보상",
        displayText: "현재 정보상 / 가능성 낮음",
      },
      factChips: [],
      status: "low-likelihood",
      reasonNote: "진단서 상 5대 골절 지정 부위에 해당하지 않습니다.",
    },
    {
      id: "item-fixed-fracture-surgery",
      category: "fixed",
      name: "골절수술비",
      description: "골절로 수술을 받은 경우 정액을 지급합니다.",
      whyCheck: "수술 여부에 따라 보상 대상이 달라지기 때문입니다.",
      badges: [
        { id: "badge-fracture-policy", label: "보험증권 확인 필요", kind: "policy-type-check" },
      ],
      benefit: {
        kind: "range",
        label: "일반적인 가입금액 예시",
        min: 300000,
        max: 500000,
        displayText: "30만~50만원",
      },
      factChips: buildFactChips(answers, ["surgery"]),
      status: "review",
    },
    {
      id: "item-fixed-injury-surgery",
      category: "fixed",
      name: "상해수술비",
      description: "상해로 수술을 받은 경우 정액을 지급합니다.",
      whyCheck: "수술 여부가 지급 요건이기 때문입니다.",
      badges: [{ id: "badge-injury-multi", label: "복수 확인", kind: "multi-match" }],
      benefit: {
        kind: "range",
        label: "일반적인 가입금액 예시",
        min: 200000,
        max: 400000,
        displayText: "20만~40만원",
      },
      factChips: buildFactChips(answers, ["surgery"]),
      status: "review",
    },
    {
      id: "item-disability-knee",
      category: "disability",
      name: "후유장해",
      description: "치료 종결 후 남은 장해 정도에 따라 지급합니다.",
      whyCheck: "무릎 골절은 치료 후 운동 범위 제한이 남을 수 있기 때문입니다.",
      badges: [],
      benefit: { kind: "formula", label: "보장 방식", displayText: "가입금액 × 장해지급률" },
      factChips: buildFactChips(answers, ["accidentLocation"]),
      additionalInfoNote: "치료 종결 후 장해진단서로 정확한 지급률을 확인합니다.",
      status: "needs-info",
    },
    {
      id: "item-special-group-insurance",
      category: "special",
      name: "단체보험 상해특약",
      description: "소속 단체가 가입한 보험의 상해 특약을 확인합니다.",
      whyCheck:
        "헬스장 이용 중 발생한 사고는 단체보험 가입 여부에 따라 중복 청구가 가능할 수 있기 때문입니다.",
      badges: [
        {
          id: "badge-group-insurance",
          label: "단체보험 가입 여부 확인",
          kind: "group-insurance-check",
        },
      ],
      benefit: { kind: "conditional", label: "보장 방식", displayText: "상대방 보험 · 별도 산정" },
      factChips: buildFactChips(answers, ["accidentLocation"]),
      status: "review",
    },
  ];
}

/**
 * review 전용 골절 사례 fixture 빌더 — 반환값은 즉시
 * writeDiagnosisHandoff()로 기록되는 최종 형태이며, `/result`가 추가로
 * 가공하지 않는다(design.md §7).
 */
export function buildFractureResult(
  rawInput: string,
  answers: Record<string, string>
): DiagnosisResult {
  return {
    resultId: `fracture-${Date.now()}`,
    schemaVersion: DIAGNOSIS_SCHEMA_VERSION,
    rawInput,
    answers,
    inputSummary: {
      title: "무릎·아래다리의 골절",
      when: { label: "언제", value: "3일 전" },
      where: { label: "어디서", value: "헬스장" },
      mechanism: { label: "어떻게", value: "벤치프레스 중" },
      bodyPart: { label: "어디를", value: "무릎 골절" },
    },
    priorityChecks: PRIORITY_CHECKS,
    items: buildItems(answers),
    generatedAt: new Date().toISOString(),
  };
}
