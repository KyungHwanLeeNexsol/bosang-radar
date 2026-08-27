import { beforeEach, describe, expect, it, vi } from "vitest";

const validInput = {
  incidentDescription: "2024년 3월, 계단에서 미끄러져 우측 발목을 다쳤습니다.",
  diagnosisName: "우측 발목 인대 파열",
  disabilityBodyPart: "우측 발목",
  incidentDate: "2024-03-15",
};

// createCase() 내부에서 runPipeline()을 호출하므로(REQ-SCAFFOLD-016), getDb()
// mock은 EvidenceRetriever(M4)의 select().from() 조회 경로와 cases/reports
// insert() 저장 경로를 모두 만족해야 한다 — lib/pipeline/index.test.ts의
// "../db/client" 목업 패턴과 동일하다. 실제 GEMINI_API_KEY 없이도
// getLLMProvider()가 결정론적 provider로 해석되도록 LLM_PROVIDER_MODE도
// 함께 설정한다(REQ-RESEARCH-012, lib/ai/provider-factory.ts).
const { insertMock, valuesMock, getDbMock } = vi.hoisted(() => {
  const valuesMock = vi.fn().mockResolvedValue(undefined);
  const insertMock = vi.fn(() => ({ values: valuesMock }));
  const getDbMock = vi.fn(() => ({
    insert: insertMock,
    select: () => ({ from: async () => [] }),
  }));
  return { insertMock, valuesMock, getDbMock };
});

vi.mock("../db/client", () => ({
  getDb: getDbMock,
}));

describe("lib/cases/create-case createCase (REQ-SCAFFOLD-016, AC-SCAFFOLD-015)", () => {
  beforeEach(() => {
    insertMock.mockClear();
    valuesMock.mockClear();
    getDbMock.mockClear();
    process.env.LLM_PROVIDER_MODE = "deterministic";
  });

  it("유효한 입력이면 파이프라인을 실행하고 case+report를 저장한 뒤 caseId를 반환한다", async () => {
    const { createCase } = await import("./create-case");

    const result = await createCase("owner-1", validInput);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(typeof result.caseId).toBe("string");
      expect(result.caseId.length).toBeGreaterThan(0);
    }
    // cases + reports 두 테이블에 각각 1회 insert 되어야 한다.
    expect(insertMock).toHaveBeenCalledTimes(2);
  });

  it("저장된 case row는 ownerUserId를 그대로 보존한다", async () => {
    const { createCase } = await import("./create-case");

    await createCase("owner-42", validInput);

    const caseValuesCall = valuesMock.mock.calls[0][0];
    expect(caseValuesCall.ownerUserId).toBe("owner-42");
  });

  it("PII 형식(주민등록번호)이 포함된 입력은 파이프라인 호출 전에 거부되고 DB에 도달하지 않는다 (AC-SCAFFOLD-011)", async () => {
    const { createCase } = await import("./create-case");

    const result = await createCase("owner-1", {
      ...validInput,
      incidentDescription: "환자 주민등록번호는 901231-1234567 입니다.",
    });

    expect(result.success).toBe(false);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("스키마에 정의되지 않은 필드가 섞인 입력은 구조적으로 거부한다", async () => {
    const { createCase } = await import("./create-case");

    const result = await createCase("owner-1", {
      ...validInput,
      address: "서울특별시 강남구 테헤란로 123",
    });

    expect(result.success).toBe(false);
    expect(insertMock).not.toHaveBeenCalled();
  });
});
