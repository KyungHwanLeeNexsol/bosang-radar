import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  startCaseJobMock,
  processCaseJobMock,
  getCurrentSessionMock,
  withGeminiFetchObservationMock,
  recordGeminiRequestObservationMock,
  afterMock,
} = vi.hoisted(() => ({
  startCaseJobMock: vi.fn(),
  processCaseJobMock: vi.fn(),
  getCurrentSessionMock: vi.fn(),
  withGeminiFetchObservationMock: vi.fn((_jobId: string, _onObservation: unknown, fn: () => unknown) =>
    fn()
  ),
  recordGeminiRequestObservationMock: vi.fn(),
  afterMock: vi.fn(),
}));

vi.mock("@/lib/cases/create-case", () => ({
  startCaseJob: startCaseJobMock,
  processCaseJob: processCaseJobMock,
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentSession: getCurrentSessionMock,
}));

vi.mock("@/lib/observability/gemini-fetch-observer", () => ({
  withGeminiFetchObservation: withGeminiFetchObservationMock,
}));

vi.mock("@/lib/observability/gemini-observation-store", () => ({
  recordGeminiRequestObservation: recordGeminiRequestObservationMock,
}));

// after()는 실제 Next.js 요청 스코프 밖(직접 POST() 호출)에서는 동작하지 않으므로,
// 콜백을 캡처만 하는 목으로 대체한다 — 자체 호스팅 전환(SPEC-ORACLE-HOSTING-001)의
// 핵심 변경: Netlify Background Function HTTP 재호출 대신 after()로 같은 프로세스
// 안에서 백그라운드 처리한다.
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: afterMock };
});

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
    processCaseJobMock.mockReset();
    processCaseJobMock.mockResolvedValue(undefined);
    getCurrentSessionMock.mockReset();
    withGeminiFetchObservationMock.mockClear();
    withGeminiFetchObservationMock.mockImplementation(
      (_jobId: string, _onObservation: unknown, fn: () => unknown) => fn()
    );
    recordGeminiRequestObservationMock.mockReset();
    afterMock.mockReset();
  });

  it("로그인 세션이 없으면 401을 반환하고 createCase를 호출하지 않는다", async () => {
    getCurrentSessionMock.mockResolvedValue(null);
    const { POST } = await import("./route");

    const response = await POST(postRequest(validInput));

    expect(response.status).toBe(401);
    expect(startCaseJobMock).not.toHaveBeenCalled();
  });

  it("유효한 입력이면 202와 jobId를 반환하고 after()로 백그라운드 처리를 예약한다", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { id: "owner-1" } });
    startCaseJobMock.mockResolvedValue({ success: true, jobId: "job-123" });
    const { POST } = await import("./route");

    const response = await POST(postRequest(validInput));
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toEqual({ jobId: "job-123", status: "processing" });
    expect(startCaseJobMock).toHaveBeenCalledWith("owner-1", validInput);
    expect(afterMock).toHaveBeenCalledTimes(1);

    // after()에 넘긴 콜백을 직접 실행해, 같은 프로세스 안에서 processCaseJob이
    // (Netlify Background Function HTTP 재호출 없이) 바로 호출되는지 확인한다.
    await afterMock.mock.calls[0][0]();
    expect(withGeminiFetchObservationMock).toHaveBeenCalledWith(
      "job-123",
      expect.any(Function),
      expect.any(Function)
    );
    expect(processCaseJobMock).toHaveBeenCalledWith("job-123");
  });

  it("after() 콜백 내부에서 processCaseJob이 실패해도 예외를 삼키고 로그만 남긴다", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { id: "owner-1" } });
    startCaseJobMock.mockResolvedValue({ success: true, jobId: "job-123" });
    processCaseJobMock.mockRejectedValue(new Error("pipeline boom"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { POST } = await import("./route");

    const response = await POST(postRequest(validInput));
    expect(response.status).toBe(202);

    await expect(afterMock.mock.calls[0][0]()).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
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
