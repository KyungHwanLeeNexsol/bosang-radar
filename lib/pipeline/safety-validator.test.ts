import { describe, expect, it } from "vitest";
import { findSafetyViolations, isSafe } from "./safety-validator";

// safety-validator: 코드 리뷰 지적 사항(Fix-A) — buildResearchPrompt()가 프롬프트로만
// 금지 표현을 지시할 뿐, 구조화 출력의 summary 문자열 CONTENT를 검증하지 않는 결함에 대한
// 공통 방어선. 테스트는 안전한 문자열만 검사하는 방식이 아니라, 실제 adversarial fixture를
// 넣어 차단되는지를 1차로 확인한다(코드 리뷰 명시 지침).

describe("lib/pipeline/safety-validator findSafetyViolations (Fix-A)", () => {
  it("adversarial: '보험금 지급 확률은 95%입니다.' 는 반드시 차단되어야 한다", () => {
    const violations = findSafetyViolations("보험금 지급 확률은 95%입니다.");

    expect(violations.length).toBeGreaterThan(0);
  });

  it("adversarial: '보험금 1,000만원을 반드시 지급합니다.' 는 반드시 차단되어야 한다", () => {
    const violations = findSafetyViolations("보험금 1,000만원을 반드시 지급합니다.");

    expect(violations.length).toBeGreaterThan(0);
  });

  it("보험금 지급 확정 표현(변형 포함)은 차단되어야 한다", () => {
    expect(findSafetyViolations("보험금 지급 확정 안내드립니다.").length).toBeGreaterThan(0);
    expect(findSafetyViolations("지급이 확정되었습니다.").length).toBeGreaterThan(0);
  });

  it("반드시 지급 표현(변형 포함)은 차단되어야 한다", () => {
    expect(findSafetyViolations("반드시 지급받으실 수 있습니다.").length).toBeGreaterThan(0);
  });

  it("bare 숫자%% 패턴은 차단되어야 한다", () => {
    expect(findSafetyViolations("승인 가능성은 80% 입니다.").length).toBeGreaterThan(0);
  });

  it("안전한 헤지 표현(SPEC 설계가 요구하는 형태)은 차단되지 않는다", () => {
    expect(isSafe("검토가 필요합니다.")).toBe(true);
    expect(isSafe("관련 가능성이 있습니다.")).toBe(true);
    expect(isSafe("현재 정보만으로는 판단이 불충분합니다.")).toBe(true);
  });

  it("빈 위반 목록일 때 findSafetyViolations는 빈 배열을 반환한다", () => {
    expect(findSafetyViolations("검토가 필요합니다.")).toEqual([]);
  });

  it("위반 항목은 pattern과 matchedText를 모두 포함한다", () => {
    const violations = findSafetyViolations("보험금 지급 확률은 95%입니다.");

    for (const violation of violations) {
      expect(typeof violation.pattern).toBe("string");
      expect(violation.pattern.length).toBeGreaterThan(0);
      expect(typeof violation.matchedText).toBe("string");
      expect(violation.matchedText.length).toBeGreaterThan(0);
    }
  });
});
