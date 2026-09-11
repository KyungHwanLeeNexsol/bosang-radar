import { describe, expect, it } from "vitest";
import { toSafeErrorMeta } from "./safe-error";

// SPEC-PILOT-READY-001 v0.6.0 (외부 구현 검토 5차 반영) — PII 비노출 로깅
// 헬퍼. error.message는 사건 입력 원문(incidentDescription/diagnosisName/
// disabilityBodyPart)이 우연히 반사될 위험이 있으므로 절대 읽지 않는다.
describe("lib/logging/safe-error toSafeErrorMeta (SPEC-PILOT-READY-001 v0.6.0)", () => {
  it("Error 인스턴스는 .name만 errorName으로 추출하고 .message는 절대 읽지 않는다", () => {
    const error = new Error("이 메시지에는 민감한 사건 입력 원문이 들어있을 수 있다");
    const meta = toSafeErrorMeta(error);

    expect(meta.errorName).toBe("Error");
    expect(meta.errorCode).toBeUndefined();
    expect(JSON.stringify(meta)).not.toContain("민감한 사건 입력 원문");
  });

  it("code 속성이 문자열이면 errorCode로 포함한다(DB 드라이버 오류 등)", () => {
    class DbError extends Error {
      code = "SQLITE_CONSTRAINT";
    }
    const meta = toSafeErrorMeta(new DbError("constraint failed with sensitive input xyz"));

    expect(meta.errorName).toBe("Error");
    expect(meta.errorCode).toBe("SQLITE_CONSTRAINT");
  });

  it("code 속성이 숫자이면 문자열로 변환해 errorCode에 포함한다", () => {
    class NumericCodeError extends Error {
      code = 500;
    }
    const meta = toSafeErrorMeta(new NumericCodeError("boom"));

    expect(meta.errorCode).toBe("500");
  });

  it("Error가 아닌 값(문자열, 객체, null)을 던진 경우 UnknownError로 폴백한다", () => {
    expect(toSafeErrorMeta("plain string throw with 민감 정보")).toEqual({
      errorName: "UnknownError",
    });
    expect(toSafeErrorMeta({ some: "object" })).toEqual({ errorName: "UnknownError" });
    expect(toSafeErrorMeta(null)).toEqual({ errorName: "UnknownError" });
    expect(toSafeErrorMeta(undefined)).toEqual({ errorName: "UnknownError" });
  });

  it("커스텀 Error 서브클래스는 그 name을 errorName으로 사용한다", () => {
    class LeaseFencedError extends Error {}
    const err = new LeaseFencedError("입력 원문 유출 위험 메시지");
    err.name = "LeaseFencedError";

    const meta = toSafeErrorMeta(err);

    expect(meta.errorName).toBe("LeaseFencedError");
  });
});
