import { beforeEach, describe, expect, it, vi } from "vitest";

const { processCaseJobMock, withGeminiFetchObservationMock } = vi.hoisted(() => ({
  processCaseJobMock: vi.fn(),
  withGeminiFetchObservationMock: vi.fn(async (_jobId: string, task: () => Promise<void>) =>
    task()
  ),
}));

vi.mock("../lib/cases/create-case", () => ({
  processCaseJob: processCaseJobMock,
}));

vi.mock("../lib/observability/gemini-fetch-observer", () => ({
  withGeminiFetchObservation: withGeminiFetchObservationMock,
}));

describe("process-case-background Netlify Function", () => {
  beforeEach(() => {
    processCaseJobMock.mockReset();
    processCaseJobMock.mockResolvedValue(undefined);
    withGeminiFetchObservationMock.mockClear();
  });

  it("JSON이 아니면 400을 반환하고 job을 실행하지 않는다", async () => {
    const { default: handler } = await import("./functions/process-case-background");

    const response = await handler(
      new Request("http://localhost/.netlify/functions/process-case-background", {
        method: "POST",
        body: "not-json",
      })
    );

    expect(response.status).toBe(400);
    expect(processCaseJobMock).not.toHaveBeenCalled();
  });

  it("jobId가 없으면 400을 반환한다", async () => {
    const { default: handler } = await import("./functions/process-case-background");

    const response = await handler(
      new Request("http://localhost/.netlify/functions/process-case-background", {
        method: "POST",
        body: JSON.stringify({}),
      })
    );

    expect(response.status).toBe(400);
    expect(processCaseJobMock).not.toHaveBeenCalled();
  });

  it("유효한 jobId면 해당 job을 처리하고 202를 반환한다", async () => {
    const { default: handler } = await import("./functions/process-case-background");

    const response = await handler(
      new Request("http://localhost/.netlify/functions/process-case-background", {
        method: "POST",
        body: JSON.stringify({ jobId: "job-123" }),
      })
    );

    expect(response.status).toBe(202);
    expect(withGeminiFetchObservationMock).toHaveBeenCalledOnce();
    expect(withGeminiFetchObservationMock).toHaveBeenCalledWith("job-123", expect.any(Function));
    expect(processCaseJobMock).toHaveBeenCalledOnce();
    expect(processCaseJobMock).toHaveBeenCalledWith("job-123");
  });

  it("함수 설정은 background 모드를 명시한다", async () => {
    const { config } = await import("./functions/process-case-background");

    expect(config).toEqual({ background: true });
  });
});
