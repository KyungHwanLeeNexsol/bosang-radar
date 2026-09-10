import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { createCaseMock, getCurrentSessionMock } = vi.hoisted(() => ({
  createCaseMock: vi.fn(),
  getCurrentSessionMock: vi.fn(),
}));

vi.mock("@/lib/cases/create-case", () => ({
  createCase: createCaseMock,
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentSession: getCurrentSessionMock,
}));

const validInput = {
  incidentDescription: "2024년 3월, 계단에서 미끄러져 우측 발목을 다쳤습니다.",
  diagnosisName: "우측 발목 인대 파열",
  disabilityBodyPart: "우측 발목",
  incidentDate: "2024-03-15",
};

function postRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/cases", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("app/api/cases POST (REQ-SCAFFOLD-016, AC-SCAFFOLD-015)", () => {
  beforeEach(() => {
    createCaseMock.mockReset();
    getCurrentSessionMock.mockReset();
  });

  it("로그인 세션이 없으면 401을 반환하고 createCase를 호출하지 않는다", async () => {
    getCurrentSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");

    const response = await POST(postRequest(validInput));

    expect(response.status).toBe(401);
    expect(createCaseMock).not.toHaveBeenCalled();
  });

  it("유효한 입력이면 201과 caseId를 반환한다", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { id: "owner-1" } });
    createCaseMock.mockResolvedValue({ success: true, caseId: "case-123" });
    const { POST } = await import("./route");

    const response = await POST(postRequest(validInput));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.caseId).toBe("case-123");
    expect(createCaseMock).toHaveBeenCalledWith("owner-1", validInput);
  });

  it("검증 실패면 400과 fieldErrors를 반환한다", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { id: "owner-1" } });
    createCaseMock.mockResolvedValue({
      success: false,
      fieldErrors: { incidentDescription: ["주민등록번호 형식을 포함할 수 없습니다."] },
    });
    const { POST } = await import("./route");

    const response = await POST(postRequest(validInput));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.fieldErrors.incidentDescription).toBeDefined();
  });

  it("이미 처리 중인 요청이면 409를 반환한다 (REQ-PILOT-READY-007)", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { id: "owner-1" } });
    createCaseMock.mockResolvedValue({ success: false, alreadyProcessing: true });
    const { POST } = await import("./route");

    const response = await POST(postRequest(validInput));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBeDefined();
  });

  it("route segment의 maxDuration은 300초(리스 TTL 최소 330초보다 짧은 안전한 하한)로 설정되어 있다", async () => {
    const routeModule = await import("./route");

    expect(routeModule.maxDuration).toBe(300);
  });

  it("요청 시작 시점에 console.info로 최소 1회 구조적 로그를 남긴다 (REQ-PILOT-READY-008, M2)", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    getCurrentSessionMock.mockResolvedValue({ user: { id: "owner-1" } });
    createCaseMock.mockResolvedValue({ success: true, caseId: "case-123" });
    const { POST } = await import("./route");

    await POST(postRequest(validInput));

    expect(infoSpy).toHaveBeenCalled();
    infoSpy.mockRestore();
  });
});
