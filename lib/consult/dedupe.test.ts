import { describe, expect, it } from "vitest";
import { computeConsultationDuplicateKey } from "./dedupe";

// SPEC-B2C-CONSULT-001 M4 (design.md §5 파일 트리, §8 "resultId + 정규화
// 연락처 복합 키") — 서버·클라이언트가 공유 가능한 비즈니스 중복 판정 키
// 도출 순수 함수. app/api/consultations/route.ts(M2)는 이 키를 문자열로
// 합성하지 않고 drizzle의 and(eq, eq) 복합 조건으로 직접 판정하므로(§8.1
// 8번), 이 함수는 그 비즈니스 규칙을 서버·클라이언트가 공유 가능한 형태로
// 별도 도출한다 — route.ts의 기존 동작은 변경하지 않는다.

describe("computeConsultationDuplicateKey", () => {
  it("resultId와 정규화 연락처를 결합한 결정론적 문자열을 반환한다", () => {
    const key = computeConsultationDuplicateKey({
      resultId: "result-1",
      contactNormalized: "01000000000",
    });

    expect(key).toBe("result-1::01000000000");
  });

  it("동일 입력에는 항상 동일한 키를 반환한다(결정론적)", () => {
    const input = { resultId: "result-1", contactNormalized: "01000000000" };
    expect(computeConsultationDuplicateKey(input)).toBe(computeConsultationDuplicateKey(input));
  });

  it("resultId가 다르면 키가 달라진다", () => {
    const a = computeConsultationDuplicateKey({
      resultId: "result-1",
      contactNormalized: "01000000000",
    });
    const b = computeConsultationDuplicateKey({
      resultId: "result-2",
      contactNormalized: "01000000000",
    });
    expect(a).not.toBe(b);
  });

  it("정규화 연락처가 다르면 키가 달라진다", () => {
    const a = computeConsultationDuplicateKey({
      resultId: "result-1",
      contactNormalized: "01000000000",
    });
    const b = computeConsultationDuplicateKey({
      resultId: "result-1",
      contactNormalized: "01099999999",
    });
    expect(a).not.toBe(b);
  });
});
