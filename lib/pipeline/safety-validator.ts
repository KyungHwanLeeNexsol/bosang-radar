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
    // "지급 확률"/"성공 확률"이 구체적 수치 퍼센트와 함께 쓰인 경우
    name: "지급/성공 확률 + 구체적 수치",
    regex: /(?:지급|성공)\s*확률[^%]{0,15}\d+(?:\.\d+)?\s*%/,
  },
  {
    // 숫자 바로 뒤에 %가 오는 구체적 수치 표현 전반(단독으로도 위반)
    name: "구체적 수치 퍼센트 표현",
    regex: /\d+(?:\.\d+)?\s*%/,
  },
  {
    // "1,000만원을 (반드시) 지급합니다/됩니다/될 것입니다" 형태의
    // 구체적 지급액 + 확정성 서술어 결합(헤지되지 않은 단정)
    name: "구체적 지급액 확정 서술",
    regex: /\d[\d,]*\s*만?\s*원[^\n]{0,10}지급(?:합니다|됩니다|될\s*것입니다|할\s*것입니다)/,
  },
];

/**
 * 텍스트에서 보험금 지급 확정성 관련 금지 표현을 탐지한다.
 * 위반이 없으면 빈 배열을 반환한다.
 */
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
