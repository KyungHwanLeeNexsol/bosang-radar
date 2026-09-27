import { describe, expect, it } from "vitest";
import { CONSENT_POLICY_VERSION } from "./consent-policy";

// SPEC-B2C-CONSULT-001 M4 (design.md §6.1) — CONSENT_POLICY_VERSION 단일
// 소스 검증. M2가 app/api/consultations/route.ts 안에 비공개로 정의했던
// 상수를 이 파일로 추출한다(progress.md M2 잔여 위험 해소) — 서버·클라이언트
// 양쪽이 이 값 하나만 참조해야 한다.

describe("CONSENT_POLICY_VERSION", () => {
  it("비어 있지 않은 문자열 리터럴이다", () => {
    expect(typeof CONSENT_POLICY_VERSION).toBe("string");
    expect(CONSENT_POLICY_VERSION.length).toBeGreaterThan(0);
  });

  it("YYYY-MM-DD-vN 형식을 따른다", () => {
    expect(CONSENT_POLICY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}-v\d+$/);
  });
});
