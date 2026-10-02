import { describe, expect, it } from "vitest";
import { CONSENT_POLICY_VERSION, CONSULT_POLICY_NOT_READY_NOTICE } from "./consent-policy";

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

// SPEC-B2C-CONSULT-001 design.md §4 — 정책 미준비 상태(isPolicyReady=false)의
// 제출 영역 안내 문구. 법무·운영이 확정한 문장이 아닌 잠정 문구이므로 값이
// 확정되면 이 상수만 교체한다(문구가 바뀌면 이 테스트도 함께 갱신한다).
describe("CONSULT_POLICY_NOT_READY_NOTICE", () => {
  it("SPEC이 정한 잠정 문구와 정확히 일치한다", () => {
    expect(CONSULT_POLICY_NOT_READY_NOTICE).toBe(
      "상담 신청은 아직 준비 중입니다. 준비가 끝나면 이용하실 수 있어요."
    );
  });
});
