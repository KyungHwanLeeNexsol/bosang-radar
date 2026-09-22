// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearDiagnosisHandoff, readDiagnosisHandoff, writeDiagnosisHandoff } from "./handoff";
import { DIAGNOSIS_SCHEMA_VERSION, type DiagnosisResult } from "./types";

// SPEC-B2C-RESULT-001 M2 — 01→02 인계 채널 단위 테스트(design.md §3,
// REQ-B2CRESULT-010/013/014/016/017). readDiagnosisHandoff()가 절대
// sessionStorage를 변경하지 않는다는 것(읽기 전용)과, "empty"/"invalid"/
// "valid" 3갈래를 정확히 구분한다는 것을 검증한다.

function buildValidDiagnosisResult(): DiagnosisResult {
  return {
    resultId: "result-1",
    schemaVersion: DIAGNOSIS_SCHEMA_VERSION,
    rawInput: "3일 전에 헬스장에서 벤치프레스 하다가 무릎이 골절됐어요",
    answers: { surgery: "수술 받음" },
    inputSummary: {
      title: "무릎·아래다리의 골절",
      when: { label: "언제", value: "3일 전" },
      where: { label: "어디서", value: "헬스장" },
      mechanism: { label: "어떻게", value: "벤치프레스 중" },
      bodyPart: { label: "어디를", value: "무릎 골절" },
    },
    priorityChecks: [
      {
        id: "priority-1",
        title: "실손 의료비 가입 세대 확인",
        description: "가입 시기에 따라 자기부담금과 보장 범위가 달라집니다",
        targetCategory: "reimbursement",
      },
    ],
    items: [
      {
        id: "item-1",
        category: "reimbursement",
        name: "통원 실손의료비",
        description: "통원 치료 시 발생한 의료비를 보상합니다.",
        whyCheck: "통원 치료를 받았기 때문입니다.",
        badges: [],
        benefit: { kind: "formula", label: "보장 방식", displayText: "자기부담금 차감 후 보상" },
        factChips: [{ questionId: "surgery", label: "수술 여부", value: "수술 받음" }],
        status: "review",
      },
    ],
    generatedAt: "2026-09-22T10:00:00+09:00",
  };
}

const STORAGE_KEY = "bosang-radar:diagnosis-handoff-v1";

describe("handoff — sessionStorage 왕복(REQ-B2CRESULT-010/016)", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("write → read 왕복은 valid 결과를 반환한다", () => {
    const result = buildValidDiagnosisResult();
    writeDiagnosisHandoff(result);

    const read = readDiagnosisHandoff();
    expect(read).toEqual({ status: "valid", result });
  });

  it("빈 sessionStorage는 empty를 반환한다", () => {
    expect(readDiagnosisHandoff()).toEqual({ status: "empty" });
  });

  it("구문이 깨진 JSON은 invalid와 사유를 반환한다", () => {
    window.sessionStorage.setItem(STORAGE_KEY, "{not valid json");

    const read = readDiagnosisHandoff();
    expect(read.status).toBe("invalid");
    expect(read.status === "invalid" && read.reason.length > 0).toBe(true);
  });

  it("구문은 유효하나 스키마와 불일치하는 JSON은 invalid를 반환한다(AC-B2CRESULT-014)", () => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ resultId: "" }));

    const read = readDiagnosisHandoff();
    expect(read.status).toBe("invalid");
  });

  it("readDiagnosisHandoff는 어떤 분기에서도 sessionStorage를 변경하지 않는다(읽기 전용)", () => {
    const result = buildValidDiagnosisResult();
    writeDiagnosisHandoff(result);

    readDiagnosisHandoff();
    readDiagnosisHandoff();

    // 여러 번 읽어도 값이 그대로 남아 있다 — "읽으면서 동시에 지운다"는
    // 부수효과가 없다(design.md §3, REQ-B2CRESULT-016).
    expect(readDiagnosisHandoff()).toEqual({ status: "valid", result });
  });

  it("clearDiagnosisHandoff 호출 후에는 empty로 되돌아간다(명시적 트리거에서만 제거)", () => {
    writeDiagnosisHandoff(buildValidDiagnosisResult());
    expect(readDiagnosisHandoff().status).toBe("valid");

    clearDiagnosisHandoff();

    expect(readDiagnosisHandoff()).toEqual({ status: "empty" });
  });
});

describe('handoff — SSR 가드(design.md §3, typeof window === "undefined")', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("window가 없는 환경에서 write/read/clear 모두 예외 없이 안전하게 동작한다", () => {
    vi.stubGlobal("window", undefined);

    expect(() => writeDiagnosisHandoff(buildValidDiagnosisResult())).not.toThrow();
    expect(readDiagnosisHandoff()).toEqual({ status: "empty" });
    expect(() => clearDiagnosisHandoff()).not.toThrow();
  });
});
