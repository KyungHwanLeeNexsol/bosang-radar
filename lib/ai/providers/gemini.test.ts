import { beforeEach, describe, expect, it, vi } from "vitest";

const { generateContentMock, GoogleGenAIMock } = vi.hoisted(() => {
  const generateContentMock = vi.fn();
  const GoogleGenAIMock = vi.fn().mockImplementation(function MockGoogleGenAI() {
    return { models: { generateContent: generateContentMock } };
  });
  return { generateContentMock, GoogleGenAIMock };
});

vi.mock("@google/genai", () => ({
  GoogleGenAI: GoogleGenAIMock,
}));

class RateLimitError extends Error {
  status = 429;
}

describe("lib/ai/providers/gemini GeminiProvider", () => {
  beforeEach(() => {
    generateContentMock.mockReset();
    GoogleGenAIMock.mockClear();
  });

  it("429 응답을 지수 백오프로 재시도한 뒤 성공하면 결과를 반환한다 (AC-SCAFFOLD-007)", async () => {
    const { GeminiProvider } = await import("./gemini");
    generateContentMock
      .mockRejectedValueOnce(new RateLimitError("rate limited"))
      .mockRejectedValueOnce(new RateLimitError("rate limited"))
      .mockResolvedValueOnce({ text: "ok" });

    const sleepCalls: number[] = [];
    const provider = new GeminiProvider({
      apiKey: "test-key",
      maxRetries: 3,
      initialDelayMs: 10,
      sleepFn: async (ms: number) => {
        sleepCalls.push(ms);
      },
    });

    const result = await provider.generate({ prompt: "질의" });

    expect(result.text).toBe("ok");
    expect(generateContentMock).toHaveBeenCalledTimes(3);
    expect(sleepCalls).toEqual([10, 20]);
  });

  it("재시도가 모두 소진되면 예외를 전파한다 — 삼키지 않는다 (REQ-SCAFFOLD-008)", async () => {
    const { GeminiProvider } = await import("./gemini");
    generateContentMock.mockRejectedValue(new RateLimitError("rate limited"));

    const provider = new GeminiProvider({
      apiKey: "test-key",
      maxRetries: 2,
      initialDelayMs: 1,
      sleepFn: async () => {},
    });

    await expect(provider.generate({ prompt: "질의" })).rejects.toThrow();
    expect(generateContentMock).toHaveBeenCalledTimes(3);
  });

  it("429가 아닌 오류는 재시도 없이 즉시 전파한다", async () => {
    const { GeminiProvider } = await import("./gemini");
    generateContentMock.mockRejectedValue(new Error("network error"));

    const provider = new GeminiProvider({
      apiKey: "test-key",
      maxRetries: 3,
      initialDelayMs: 1,
      sleepFn: async () => {},
    });

    await expect(provider.generate({ prompt: "질의" })).rejects.toThrow("network error");
    expect(generateContentMock).toHaveBeenCalledTimes(1);
  });

  it("apiKey가 없으면 생성 시점에 예외를 던진다", async () => {
    const { GeminiProvider } = await import("./gemini");
    const originalKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    expect(() => new GeminiProvider()).toThrow();

    if (originalKey !== undefined) {
      process.env.GEMINI_API_KEY = originalKey;
    }
  });
});
