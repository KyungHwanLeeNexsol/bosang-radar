import { describe, expect, it } from "vitest";
import { formatPhoneDisplay, maskPhone, normalizePhone } from "./phone";

// SPEC-B2C-CONSULT-001 M1 — 연락처 정규화/표시/마스킹 단위 테스트
// (design.md §6.1, AC-B2CCONSULT-011).

describe("normalizePhone — AC-B2CCONSULT-011", () => {
  it("하이픈·공백이 섞인 입력을 숫자만 남긴 정규화 값으로 반환한다", () => {
    expect(normalizePhone("010 0000 0000")).toBe("01000000000");
    expect(normalizePhone("010-0000-0000")).toBe("01000000000");
  });

  it("+82 국가코드를 국내 형식(0으로 시작)으로 변환한다", () => {
    expect(normalizePhone("+82 10 0000 0000")).toBe("01000000000");
  });

  it("0082 국가코드를 국내 형식으로 변환한다", () => {
    expect(normalizePhone("0082-10-0000-0000")).toBe("01000000000");
  });

  it("숫자가 아닌 문자가 섞인 입력은 null을 반환한다(정규화 실패)", () => {
    expect(normalizePhone("010-abcd-0000")).toBeNull();
  });

  it("국내 휴대폰 번호 자릿수 범위를 벗어나면 null을 반환한다(정규화 실패)", () => {
    expect(normalizePhone("12345")).toBeNull();
  });
});

describe("formatPhoneDisplay", () => {
  it("정규화된 11자리 값을 010-0000-0000 형식으로 되돌린다", () => {
    expect(formatPhoneDisplay("01000000000")).toBe("010-0000-0000");
  });

  it("정규화된 10자리 값을 010-000-0000 형식으로 되돌린다", () => {
    expect(formatPhoneDisplay("0110000000")).toBe("011-000-0000");
  });
});

describe("maskPhone — AC-B2CCONSULT-011", () => {
  it("가운데 구간을 마스킹한다", () => {
    expect(maskPhone("01000000000")).toBe("010-****-0000");
  });
});
