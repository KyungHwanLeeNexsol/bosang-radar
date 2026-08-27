import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

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

  describe("model 옵션 (SPEC-GEMINI-RUNTIME-001 M1, design.md §1 D1)", () => {
    it("model 옵션 없이 생성하면 DEFAULT_MODEL(gemini-3.5-flash-lite)이 SDK 호출에 전달된다 (AC-GEMINI-RUNTIME-001)", async () => {
      const { GeminiProvider } = await import("./gemini");
      generateContentMock.mockResolvedValueOnce({ text: "ok" });

      const provider = new GeminiProvider({ apiKey: "test-key" });
      await provider.generate({ prompt: "질의" });

      expect(generateContentMock).toHaveBeenCalledWith(
        expect.objectContaining({ model: "gemini-3.5-flash-lite" })
      );
    });

    it("model 옵션을 명시하면 그 값이 그대로 SDK 호출에 전달된다 (AC-GEMINI-RUNTIME-001)", async () => {
      const { GeminiProvider } = await import("./gemini");
      generateContentMock.mockResolvedValueOnce({ text: "ok" });

      const provider = new GeminiProvider({ apiKey: "test-key", model: "gemini-3.6-flash" });
      await provider.generate({ prompt: "질의" });

      expect(generateContentMock).toHaveBeenCalledWith(
        expect.objectContaining({ model: "gemini-3.6-flash" })
      );
    });
  });

  describe("generateStructured() (SPEC-RESEARCH-001 M2, design.md §4)", () => {
    const schema = z.object({ summary: z.string().min(1) });

    it("responseJsonSchema/responseMimeType 설정으로 generateContent를 호출하고 safeParse를 통과하는 데이터를 반환한다 (REQ-RESEARCH-013)", async () => {
      const { GeminiProvider } = await import("./gemini");
      generateContentMock.mockResolvedValueOnce({ text: '{"summary":"결과"}' });

      const provider = new GeminiProvider({ apiKey: "test-key" });
      const result = await provider.generateStructured({ prompt: "질의", schema });

      expect(result).toEqual({ ok: true, data: { summary: "결과" } });
      expect(generateContentMock).toHaveBeenCalledTimes(1);
      const call = generateContentMock.mock.calls[0][0];
      expect(call.config).toMatchObject({ responseMimeType: "application/json" });
      expect(call.config.responseJsonSchema).toBeDefined();
    });

    it("잘못된 JSON이 반환되면 invalid_json으로 실패를 보고한다 (REQ-RESEARCH-014)", async () => {
      const { GeminiProvider } = await import("./gemini");
      generateContentMock.mockResolvedValueOnce({ text: "이것은 JSON이 아닙니다" });

      const provider = new GeminiProvider({ apiKey: "test-key" });
      const result = await provider.generateStructured({ prompt: "질의", schema });

      expect(result).toEqual({
        ok: false,
        reason: "invalid_json",
        raw: "이것은 JSON이 아닙니다",
      });
    });

    it("JSON은 유효하지만 스키마 검증에 실패하면 schema_validation_failed로 보고한다 (REQ-RESEARCH-014)", async () => {
      const { GeminiProvider } = await import("./gemini");
      generateContentMock.mockResolvedValueOnce({ text: '{"summary":""}' });

      const provider = new GeminiProvider({ apiKey: "test-key" });
      const result = await provider.generateStructured({ prompt: "질의", schema });

      expect(result).toEqual({
        ok: false,
        reason: "schema_validation_failed",
        raw: '{"summary":""}',
      });
    });

    it("429 응답을 generate()와 동일한 지수 백오프로 재시도한다 (429 재시도 공유, design.md §4)", async () => {
      const { GeminiProvider } = await import("./gemini");
      generateContentMock
        .mockRejectedValueOnce(new RateLimitError("rate limited"))
        .mockResolvedValueOnce({ text: '{"summary":"재시도 후 성공"}' });

      const sleepCalls: number[] = [];
      const provider = new GeminiProvider({
        apiKey: "test-key",
        initialDelayMs: 5,
        sleepFn: async (ms: number) => {
          sleepCalls.push(ms);
        },
      });

      const result = await provider.generateStructured({ prompt: "질의", schema });

      expect(result).toEqual({ ok: true, data: { summary: "재시도 후 성공" } });
      expect(generateContentMock).toHaveBeenCalledTimes(2);
      expect(sleepCalls).toEqual([5]);
    });
  });
});
