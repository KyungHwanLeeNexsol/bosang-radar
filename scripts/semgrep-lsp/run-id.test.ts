import { describe, expect, it } from "vitest";
import { RUN_ID_RULE, isValidRunId } from "./run-id";
import { INVALID_RUN_IDS, VALID_RUN_IDS } from "./testing/run-id-cases";

// CLI·하네스·대조 기록 읽기 어댑터가 함께 쓰는 순수 규칙. 사례 표(testing/run-id-cases.ts)가 세 곳의 공통 계약이다.

describe("isValidRunId", () => {
  it.each([
    ...INVALID_RUN_IDS,
    { name: "빈 문자열", value: "" },
    { name: "NUL 문자", value: "a\u0000b" },
  ])("$name은 거절한다", ({ value }) => {
    expect(isValidRunId(value)).toBe(false);
  });

  it.each(VALID_RUN_IDS)("$name은 받아들인다", ({ value }) => {
    expect(isValidRunId(value)).toBe(true);
  });

  it("길이 경계: 1자와 128자는 받아들이고 129자는 거절한다", () => {
    expect(isValidRunId("a")).toBe(true);
    expect(isValidRunId("a".repeat(128))).toBe(true);
    expect(isValidRunId("a".repeat(129))).toBe(false);
  });

  it("문자열이 아닌 값은 모두 거절한다(타입 가드)", () => {
    for (const value of [undefined, null, 0, 1, true, {}, [], ["a"], Symbol("a"), () => "a"]) {
      expect(isValidRunId(value), typeof value).toBe(false);
    }
  });

  it("반복 호출해도 결과가 같다(상태가 없는 정규식)", () => {
    for (let i = 0; i < 5; i++) expect(isValidRunId("same-value")).toBe(true);
  });

  it("규칙 설명 문구가 있다(오류 문구에 쓴다)", () => {
    expect(RUN_ID_RULE).toContain("128");
  });
});
