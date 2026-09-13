import { describe, expect, it, vi } from "vitest";
import { createGeminiObservedFetch } from "./gemini-fetch-observer";

describe("Gemini fetch observer", () => {
  it("Gemini 응답의 모델·상태·소요시간만 구조화 로그로 남기고 API key를 노출하지 않는다", async () => {
    const originalFetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const log = vi.fn();
    const onObservation = vi.fn();
    const now = vi.fn().mockReturnValueOnce(1_000).mockReturnValueOnce(1_125);
    const observedFetch = createGeminiObservedFetch(
      originalFetch,
      () => ({ jobId: "job-123", onObservation }),
      log,
      now
    );

    const response = await observedFetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=secret",
      { method: "POST", headers: { "x-goog-api-key": "secret" } }
    );

    expect(response.status).toBe(200);
    expect(originalFetch).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledOnce();
    expect(onObservation).toHaveBeenCalledOnce();
    const line = log.mock.calls[0]?.[0] as string;
    expect(JSON.parse(line)).toEqual({
      event: "gemini_request_observed",
      jobId: "job-123",
      method: "POST",
      model: "gemini-3.6-flash",
      status: 200,
      ok: true,
      durationMs: 125,
    });
    expect(line).not.toContain("secret");
    expect(line).not.toContain("key=");
  });

  it("Gemini가 아닌 fetch는 로그 없이 그대로 전달한다", async () => {
    const originalFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const log = vi.fn();
    const observedFetch = createGeminiObservedFetch(
      originalFetch,
      () => ({ jobId: "job-123", onObservation: vi.fn() }),
      log
    );

    const response = await observedFetch("https://example.test/resource");

    expect(response.status).toBe(204);
    expect(log).not.toHaveBeenCalled();
  });

  it("관측 컨텍스트 밖의 Gemini 요청은 job 연관 로그를 남기지 않는다", async () => {
    const originalFetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const log = vi.fn();
    const observedFetch = createGeminiObservedFetch(originalFetch, () => undefined, log);

    await observedFetch(
      new Request(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
        { method: "POST" }
      )
    );

    expect(log).not.toHaveBeenCalled();
  });
});
