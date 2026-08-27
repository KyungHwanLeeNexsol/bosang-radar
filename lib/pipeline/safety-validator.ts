// safety-validator — 보험금 지급 확정성 표현에 대한 공통 방어선(Fix-A).
//
// 코드 리뷰 지적: researcher.ts의 buildResearchPrompt()는 LLM에게 프롬프트로만
// "보험금 지급 확정", "반드시 지급", 구체적 지급 확률·액수를 서술하지 말 것을
// 지시할 뿐, buildFindingSchema()의 Zod 스키마는 summary 문자열의 CONTENT를
// 전혀 검증하지 않는다(비어있지 않다는 것만 확인). 실제/악의적 LLM 출력이
// 금지 표현을 그대로 담고 있어도 그대로 통과한다.
//
// 이 모듈은 순수·동기·의존성 없는(leaf) 검증 함수만 제공한다 — researcher.ts와
// (추후 마일스톤의) verifier.ts가 모두 재사용할 수 있도록 lib/pipeline/*.ts에
// 대한 import를 일절 두지 않는다(순환 import 위험 원천 차단).

export interface SafetyViolation {
  /** 어떤 규칙이 매칭되었는지에 대한 사람이 읽을 수 있는 이름 */
  pattern: string;
  /** 실제로 매칭을 유발한 부분 문자열 */
  matchedText: string;
}

interface NamedPattern {
  name: string;
  regex: RegExp;
}

// 코드 리뷰가 명시한 최소 차단 패턴 목록.
//
// 후속 코드 리뷰 지적(item 3): 기존 "구체적 수치 퍼센트 표현"(/\d+%/)은
// 모든 퍼센트를 차단해 장해지급률/ROM 제한율/기왕증 기여도 같은 정상적인
// 보험·의학적 수치까지 함께 막았다. SPEC이 실제로 금지하는 대상은 숫자
// 기반 "보험금 지급/성공 확률"이지 percentage 전반이 아니므로, 아래
// "지급/성공/승인/수령/받을 확률·가능성 + 구체적 수치" 패턴 하나로
// 좁힌다 — "확률"/"가능성" 단어가 명시적으로 등장할 때만 매칭되므로
// "장해지급률 10%", "관절가동범위 50% 제한", "기왕증 기여도 30%"는
// 매칭되지 않는다.
const BLOCKED_PATTERNS: NamedPattern[] = [
  {
    // "보험금 지급 확정", "지급이 확정" 등 지급 확정 단정 표현
    name: "보험금 지급 확정 단정 표현",
    regex: /지급\s*(?:이|가)?\s*확정/,
  },
  {
    // "반드시 지급" 및 근접 변형("반드시 지급받으실" 등)
    name: "반드시 지급 단정 표현",
    regex: /반드시\s*지급/,
  },
  {
    // "지급/성공/승인/수령/받을 확률·가능성" 뒤에 구체적 수치 퍼센트가
    // 붙는 경우만 차단한다(예: "보험금 지급 확률 95%", "성공 확률 80%",
    // "보험금 받을 확률 90%", "승인 가능성은 80%").
    name: "지급/성공/승인 확률·가능성 + 구체적 수치",
    regex: /(?:지급|성공|승인|수령|받을)\s*(?:확률|가능성)[^%]{0,15}\d+(?:\.\d+)?\s*%/,
  },
  {
    // "1,000만원입니다"/"500만원 수령 가능합니다"/"1억원 보상이 확정됩니다"
    // 형태의 구체적 지급액 + 확정성 서술 결합(헤지되지 않은 단정). MVP에서는
    // 사건별 예상 보험금 자동 산정이 Out of Scope이므로 이런 claim-specific
    // 확정액 표현은 차단한다(억/만원 단위 모두 대상).
    name: "구체적 지급액 확정 서술",
    regex:
      /\d[\d,]*\s*(?:억|만)?\s*원[^\n]{0,15}(?:입니다|확정(?:됩니다|될\s*것입니다)?|수령\s*가능(?:합니다)?|지급(?:합니다|됩니다|될\s*것입니다|할\s*것입니다))/,
  },
];

/**
 * 텍스트에서 보험금 지급 확정성 관련 금지 표현을 탐지한다.
 * 위반이 없으면 빈 배열을 반환한다.
 */
// @MX:ANCHOR: [AUTO] researcher.ts/skeptic.ts/verifier.ts 3곳에서 호출되는
// 공용 안전장치 진입점(fan_in>=3) — 보험금 확정성 관련 금지 표현 검증의
// 유일한 판정 함수다.
// @MX:REASON: 이 함수의 시그니처나 판정 로직을 바꾸면 Researcher(1차 방어선),
// Skeptic(반론 생성), Verifier(최종 defense-in-depth) 세 단계 모두의 안전
// 검증 동작이 동시에 바뀐다.
export function findSafetyViolations(text: string): SafetyViolation[] {
  const violations: SafetyViolation[] = [];

  for (const { name, regex } of BLOCKED_PATTERNS) {
    const match = regex.exec(text);
    if (match) {
      violations.push({ pattern: name, matchedText: match[0] });
    }
  }

  return violations;
}

/** 텍스트에 금지 표현이 하나도 없으면 true. */
export function isSafe(text: string): boolean {
  return findSafetyViolations(text).length === 0;
}
