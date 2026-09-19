import { describe, expect, it } from "vitest";
import { validateDiagnosisInput } from "./diagnosis-input";

// SPEC-B2C-DIAGNOSIS-001 M3 (REQ-B2CDIAG-020) — 01 화면 검색어 입력 zod 스키마.
// 전화번호·주민등록번호 형식(하이픈 포함/미포함 모두)만 구조적으로 거부하고,
// 이름 등 그 외 개인식별정보는 오탐 위험 때문에 구조적으로 거부하지 않는다
// (design.md §4). lib/validation/case-input.ts는 참고만 하고 import하지 않는다.

describe("validateDiagnosisInput — REQ-B2CDIAG-020", () => {
  it("하이픈 포함 전화번호 형식을 거부한다", () => {
    const result = validateDiagnosisInput({ searchText: "010-1234-5678" });
    expect(result.success).toBe(false);
  });

  it("하이픈 미포함 전화번호 형식을 거부한다", () => {
    const result = validateDiagnosisInput({ searchText: "01012345678" });
    expect(result.success).toBe(false);
  });

  it("하이픈 포함 주민등록번호 형식을 거부한다", () => {
    const result = validateDiagnosisInput({ searchText: "901231-1234567" });
    expect(result.success).toBe(false);
  });

  it("하이픈 미포함 주민등록번호 형식을 거부한다", () => {
    const result = validateDiagnosisInput({ searchText: "9012311234567" });
    expect(result.success).toBe(false);
  });

  it("문장 중간에 포함된 전화번호 형식도 거부한다", () => {
    const result = validateDiagnosisInput({
      searchText: "제 번호는 010-1234-5678 입니다",
    });
    expect(result.success).toBe(false);
  });

  it("정상적인 사고 경위 텍스트는 통과한다", () => {
    const result = validateDiagnosisInput({ searchText: "계단에서 넘어져 발목을 다쳤어요" });
    expect(result.success).toBe(true);
  });

  it("이름 형식 문자열은 구조적으로 거부하지 않는다 (design.md §4 — 오탐 위험)", () => {
    const result = validateDiagnosisInput({ searchText: "홍길동" });
    expect(result.success).toBe(true);
  });

  it("빈 문자열은 거부한다", () => {
    const result = validateDiagnosisInput({ searchText: "" });
    expect(result.success).toBe(false);
  });

  it("200자를 초과하는 문자열은 거부한다", () => {
    const result = validateDiagnosisInput({ searchText: "가".repeat(201) });
    expect(result.success).toBe(false);
  });

  it("정확히 200자인 문자열은 통과한다", () => {
    const result = validateDiagnosisInput({ searchText: "가".repeat(200) });
    expect(result.success).toBe(true);
  });

  it("스키마에 정의되지 않은 키를 포함하면 거부한다(.strict())", () => {
    const result = validateDiagnosisInput({ searchText: "정상 텍스트", extra: "field" });
    expect(result.success).toBe(false);
  });
});
