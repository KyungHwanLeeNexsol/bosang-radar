import { describe, expect, it } from "vitest";
import { toSafeErrorMeta } from "./safe-error";

// 사건 입력 원문 PII 테스트 문자열 — lib/cases/create-case.test.ts의
// validInput과 동일한 값을 사용해, errorName/errorCode/errorMessage 중
// 어느 필드를 통해서도 이 문자열이 새어 나오지 않음을 검증한다
// (SPEC-PILOT-READY-001 v0.7.0, 외부 구현 검토 6차 반영).
const PII_INCIDENT_DESCRIPTION = "2024년 3월, 계단에서 미끄러져 우측 발목을 다쳤습니다.";
const PII_DIAGNOSIS_NAME = "우측 발목 인대 파열";
const PII_DISABILITY_BODY_PART = "우측 발목";

// SPEC-PILOT-READY-001 v0.7.0 (외부 구현 검토 6차 반영) — PII 비노출 로깅
// 헬퍼. error.message는 사건 입력 원문(incidentDescription/diagnosisName/
// disabilityBodyPart)이 우연히 반사될 위험이 있으므로 절대 읽지 않는다.
// v0.7.0부터는 errorName/errorCode도 고정된 화이트리스트를 통과해야만
// 반영되며, 목록에 없는 값은 절대 그대로 통과되지 않는다.
describe("lib/logging/safe-error toSafeErrorMeta (SPEC-PILOT-READY-001 v0.7.0)", () => {
  it("Error 인스턴스는 .name만 errorName으로 추출하고 .message는 절대 읽지 않는다", () => {
    const error = new Error("이 메시지에는 민감한 사건 입력 원문이 들어있을 수 있다");
    const meta = toSafeErrorMeta(error);

    expect(meta.errorName).toBe("Error");
    expect(meta.errorCode).toBeUndefined();
    expect(JSON.stringify(meta)).not.toContain("민감한 사건 입력 원문");
  });

  it("code 속성이 화이트리스트에 있는 문자열이면 errorCode로 포함한다(DB 드라이버 오류 등)", () => {
    class DbError extends Error {
      code = "SQLITE_CONSTRAINT";
    }
    const meta = toSafeErrorMeta(new DbError("constraint failed with sensitive input xyz"));

    expect(meta.errorName).toBe("Error");
    expect(meta.errorCode).toBe("SQLITE_CONSTRAINT");
  });

  it("code 속성이 화이트리스트에 없는 값(문자열/숫자)이면 errorCode 필드 자체를 생략한다", () => {
    class UnknownStringCodeError extends Error {
      code = "SOME_UNLISTED_CODE";
    }
    class UnknownNumericCodeError extends Error {
      code = 500;
    }

    expect(toSafeErrorMeta(new UnknownStringCodeError("boom")).errorCode).toBeUndefined();
    expect(toSafeErrorMeta(new UnknownNumericCodeError("boom")).errorCode).toBeUndefined();
  });

  it("Error가 아닌 값(문자열, 객체, null)을 던진 경우 UnknownError로 폴백한다", () => {
    expect(toSafeErrorMeta("plain string throw with 민감 정보")).toEqual({
      errorName: "UnknownError",
    });
    expect(toSafeErrorMeta({ some: "object" })).toEqual({ errorName: "UnknownError" });
    expect(toSafeErrorMeta(null)).toEqual({ errorName: "UnknownError" });
    expect(toSafeErrorMeta(undefined)).toEqual({ errorName: "UnknownError" });
  });

  it("화이트리스트에 있는 커스텀 Error 서브클래스는 그 name을 errorName으로 사용한다", () => {
    class LeaseFencedError extends Error {}
    const err = new LeaseFencedError("입력 원문 유출 위험 메시지");
    err.name = "LeaseFencedError";

    const meta = toSafeErrorMeta(err);

    expect(meta.errorName).toBe("LeaseFencedError");
  });

  it("화이트리스트에 있는 라이브러리 Error 이름(LibsqlError)은 그대로 errorName으로 사용한다", () => {
    class LibsqlError extends Error {
      code: string;
      constructor(message: string, code: string) {
        super(message);
        this.name = "LibsqlError";
        this.code = code;
      }
    }
    const err = new LibsqlError("constraint failed", "SQLITE_CONSTRAINT_UNIQUE");

    const meta = toSafeErrorMeta(err);

    expect(meta.errorName).toBe("LibsqlError");
    expect(meta.errorCode).toBe("SQLITE_CONSTRAINT_UNIQUE");
  });

  // 주입 시나리오 1/3 — error.message에 사건 입력 원문이 주입되는 경우.
  // toSafeErrorMeta는 .message를 절대 읽지 않으므로 어떤 값이 담기든
  // 결과에 반영되지 않는다.
  it("[주입 시나리오: message] error.message에 사건 입력 원문을 주입해도 반영되지 않는다", () => {
    const error = new Error(
      `${PII_INCIDENT_DESCRIPTION} / ${PII_DIAGNOSIS_NAME} / ${PII_DISABILITY_BODY_PART}`
    );

    const meta = toSafeErrorMeta(error);
    const serialized = JSON.stringify(meta);

    expect(serialized).not.toContain(PII_INCIDENT_DESCRIPTION);
    expect(serialized).not.toContain(PII_DIAGNOSIS_NAME);
    expect(serialized).not.toContain(PII_DISABILITY_BODY_PART);
  });

  // 주입 시나리오 2/3 — error.name에 사건 입력 원문이 주입되는 경우
  // (공격자/라이브러리가 임의로 .name을 설정할 수 있음). 화이트리스트에
  // 없으므로 UnclassifiedError로 대체되어야 한다.
  it("[주입 시나리오: name] error.name에 사건 입력 원문을 주입해도 UnclassifiedError로 대체된다", () => {
    const error = new Error("boom");
    error.name = PII_DIAGNOSIS_NAME;

    const meta = toSafeErrorMeta(error);
    const serialized = JSON.stringify(meta);

    expect(meta.errorName).toBe("UnclassifiedError");
    expect(serialized).not.toContain(PII_DIAGNOSIS_NAME);
  });

  // 주입 시나리오 3/3 — error.code에 사건 입력 원문이 주입되는 경우
  // (예: 검증 라이브러리가 실패한 필드값을 code에 그대로 담는 경우).
  // 화이트리스트에 없으므로 errorCode 필드 자체가 생략되어야 한다.
  it("[주입 시나리오: code] error.code에 사건 입력 원문을 주입해도 errorCode가 생략된다", () => {
    const error = new Error("boom") as Error & { code?: string };
    error.code = PII_DISABILITY_BODY_PART;

    const meta = toSafeErrorMeta(error);
    const serialized = JSON.stringify(meta);

    expect(meta.errorCode).toBeUndefined();
    expect(serialized).not.toContain(PII_DISABILITY_BODY_PART);
  });
});
