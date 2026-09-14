import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { startCaseJobMock, cancelCaseJobMock, getCurrentSessionMock, fetchMock } = vi.hoisted(
  () => ({
    startCaseJobMock: vi.fn(),
    cancelCaseJobMock: vi.fn(),
    getCurrentSessionMock: vi.fn(),
    fetchMock: vi.fn(),
  })
);

vi.mock("@/lib/cases/create-case", () => ({
  startCaseJob: startCaseJobMock,
  cancelCaseJob: cancelCaseJobMock,
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
    startCaseJobMock.mockReset();
    cancelCaseJobMock.mockReset();
    cancelCaseJobMock.mockResolvedValue(undefined);
    getCurrentSessionMock.mockReset();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
  });

  it("로그인 세션이 없으면 401을 반환하고 createCase를 호출하지 않는다", async () => {
    getCurrentSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");

    const response = await POST(postRequest(validInput));

    expect(response.status).toBe(401);
    expect(startCaseJobMock).not.toHaveBeenCalled();
  });

  it("유효한 입력이면 202와 jobId를 반환하고 Background Function을 호출한다", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { id: "owner-1" } });
    startCaseJobMock.mockResolvedValue({ success: true, jobId: "job-123" });
    const { POST } = await import("./route");

    const response = await POST(postRequest(validInput));
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toEqual({ jobId: "job-123", status: "processing" });
    expect(startCaseJobMock).toHaveBeenCalledWith("owner-1", validInput);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("검증 실패면 400과 fieldErrors를 반환한다", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { id: "owner-1" } });
    startCaseJobMock.mockResolvedValue({
      success: false,
      fieldErrors: { incidentDescription: ["주민등록번호 형식을 포함할 수 없습니다."] },
    });
    const { POST } = await import("./route");

    const response = await POST(postRequest(validInput));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.fieldErrors.incidentDescription).toBeDefined();
  });

  it("Background Function이 enqueue를 거부하면 생성한 job과 리스를 취소하고 502를 반환한다", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { id: "owner-1" } });
    startCaseJobMock.mockResolvedValue({ success: true, jobId: "job-123" });
    fetchMock.mockResolvedValue({ ok: false });
    const { POST } = await import("./route");

    const response = await POST(postRequest(validInput));

    expect(response.status).toBe(502);
    expect(cancelCaseJobMock).toHaveBeenCalledWith("owner-1", "job-123");
  });

  it("Background Function enqueue 요청 자체가 실패해도 생성한 job과 리스를 취소하고 502를 반환한다", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { id: "owner-1" } });
    startCaseJobMock.mockResolvedValue({ success: true, jobId: "job-123" });
    fetchMock.mockRejectedValue(new TypeError("network error"));
    const { POST } = await import("./route");

    const response = await POST(postRequest(validInput));

    expect(response.status).toBe(502);
    expect(cancelCaseJobMock).toHaveBeenCalledWith("owner-1", "job-123");
  });

  it("이미 처리 중인 요청이면 409를 반환한다 (REQ-PILOT-READY-007)", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { id: "owner-1" } });
    startCaseJobMock.mockResolvedValue({ success: false, alreadyProcessing: true });
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
    startCaseJobMock.mockResolvedValue({ success: true, jobId: "job-123" });
    const { POST } = await import("./route");

    await POST(postRequest(validInput));

    expect(infoSpy).toHaveBeenCalled();
    infoSpy.mockRestore();
  });
});
