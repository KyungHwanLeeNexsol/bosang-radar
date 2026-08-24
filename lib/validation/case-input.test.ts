import { describe, expect, it } from "vitest";
import { caseInputSchema, validateCaseInput } from "./case-input";

const validInput = {
  incidentDescription: "2024년 3월, 계단에서 미끄러져 우측 발목을 다쳤습니다.",
  diagnosisName: "우측 발목 인대 파열",
  disabilityBodyPart: "우측 발목",
  incidentDate: "2024-03-15",
};

describe("lib/validation/case-input caseInputSchema (REQ-SCAFFOLD-012, AC-SCAFFOLD-011)", () => {
  it("PII가 없는 유효한 사건 입력을 통과시킨다", () => {
    const result = validateCaseInput(validInput);

    expect(result.success).toBe(true);
  });

  it("주민등록번호 형식(하이픈 포함)이 포함된 입력을 거부한다", () => {
    const result = validateCaseInput({
      ...validInput,
      incidentDescription: "환자 주민등록번호는 901231-1234567 입니다.",
    });

    expect(result.success).toBe(false);
  });

  it("주민등록번호 형식(하이픈 없음, 13자리 연속 숫자)이 포함된 입력을 거부한다", () => {
    const result = validateCaseInput({
      ...validInput,
      diagnosisName: "환자번호 9012311234567 확인 요망",
    });

    expect(result.success).toBe(false);
  });

  it("전화번호 형식(하이픈 포함)이 포함된 입력을 거부한다", () => {
    const result = validateCaseInput({
      ...validInput,
      incidentDescription: "연락처는 010-1234-5678 입니다.",
    });

    expect(result.success).toBe(false);
  });

  it("전화번호 형식(하이픈 없음)이 포함된 입력을 거부한다", () => {
    const result = validateCaseInput({
      ...validInput,
      incidentDescription: "연락처는 01012345678 입니다.",
    });

    expect(result.success).toBe(false);
  });

  it("상세주소 필드는 스키마에 존재하지 않으며, 전달 시 구조적으로 거부된다", () => {
    const result = validateCaseInput({
      ...validInput,
      address: "서울특별시 강남구 테헤란로 123",
    });

    expect(result.success).toBe(false);
  });

  it("의료기록 원본 필드는 스키마에 존재하지 않으며, 전달 시 구조적으로 거부된다", () => {
    const result = validateCaseInput({
      ...validInput,
      medicalRecordRaw: "원본 진료기록 전문...",
    });

    expect(result.success).toBe(false);
  });

  it("caseInputSchema.safeParse도 동일한 엔트리 포인트로 사용할 수 있다", () => {
    const result = caseInputSchema.safeParse(validInput);

    expect(result.success).toBe(true);
  });

  it("필수 필드가 비어 있으면 거부한다", () => {
    const result = validateCaseInput({
      ...validInput,
      incidentDescription: "",
    });

    expect(result.success).toBe(false);
  });
});
