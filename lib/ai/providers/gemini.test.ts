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

class UnavailableError extends Error {
  status = 503;
}

class BadRequestError extends Error {
  status = 400;
}

// design.md §5 — ApiError.message는 JSON.stringify(errorBody) 문자열이며,
// retryDelay는 .error.details[]의 RetryInfo 항목에서 파싱한다.
class HintedRetryError extends Error {
  status = 429;
  constructor(retryDelay: string) {
    super(
      JSON.stringify({
        error: {
          code: 429,
          message: "rate limited",
          details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay }],
        },
      })
    );
  }
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

  describe("429/503 재시도 + 스케줄러 통합 (SPEC-GEMINI-RUNTIME-001 M3, design.md §5, D2)", () => {
    it("503(UNAVAILABLE) 응답도 429와 동일하게 지수 백오프로 재시도한다", async () => {
      const { GeminiProvider } = await import("./gemini");
      generateContentMock
        .mockRejectedValueOnce(new UnavailableError("service unavailable"))
        .mockRejectedValueOnce(new UnavailableError("service unavailable"))
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

    it("400처럼 일시적이지 않은 상태 코드는 재시도하지 않고 즉시 전파한다", async () => {
      const { GeminiProvider } = await import("./gemini");
      generateContentMock.mockRejectedValue(new BadRequestError("bad request"));

      const provider = new GeminiProvider({
        apiKey: "test-key",
        maxRetries: 3,
        initialDelayMs: 1,
        sleepFn: async () => {},
      });

      await expect(provider.generate({ prompt: "질의" })).rejects.toThrow("bad request");
      expect(generateContentMock).toHaveBeenCalledTimes(1);
    });

    it("retryDelay 힌트가 있으면 지수 백오프 대신 힌트 값을 사용한다 (design.md §5)", async () => {
      const { GeminiProvider } = await import("./gemini");
      generateContentMock
        .mockRejectedValueOnce(new HintedRetryError("3s"))
        .mockResolvedValueOnce({ text: "ok" });

      const sleepCalls: number[] = [];
      const provider = new GeminiProvider({
        apiKey: "test-key",
        maxRetries: 3,
        initialDelayMs: 999, // 힌트가 있으면 이 값은 무시되어야 한다
        sleepFn: async (ms: number) => {
          sleepCalls.push(ms);
        },
      });

      const result = await provider.generate({ prompt: "질의" });

      expect(result.text).toBe("ok");
      expect(sleepCalls).toEqual([3000]);
    });

    it("retryDelay 힌트가 MAX_SINGLE_DELAY_MS(60000ms)보다 크면 상한으로 잘라낸다", async () => {
      const { GeminiProvider } = await import("./gemini");
      generateContentMock
        .mockRejectedValueOnce(new HintedRetryError("120s"))
        .mockResolvedValueOnce({ text: "ok" });

      const sleepCalls: number[] = [];
      const provider = new GeminiProvider({
        apiKey: "test-key",
        maxRetries: 3,
        initialDelayMs: 1,
        sleepFn: async (ms: number) => {
          sleepCalls.push(ms);
        },
      });

      const result = await provider.generate({ prompt: "질의" });

      expect(result.text).toBe("ok");
      expect(sleepCalls).toEqual([60000]);
    });

    it("총 재시도 횟수(maxRetries) 상한에 도달하면 예외를 전파한다", async () => {
      const { GeminiProvider } = await import("./gemini");
      generateContentMock.mockRejectedValue(new RateLimitError("rate limited"));

      const sleepCalls: number[] = [];
      const provider = new GeminiProvider({
        apiKey: "test-key",
        maxRetries: 2,
        initialDelayMs: 10,
        maxTotalWaitMs: 100_000,
        sleepFn: async (ms: number) => {
          sleepCalls.push(ms);
        },
      });

      await expect(provider.generate({ prompt: "질의" })).rejects.toThrow("rate limited");
      expect(generateContentMock).toHaveBeenCalledTimes(3); // 최초 시도 + 2회 재시도
      expect(sleepCalls).toEqual([10, 20]);
    });

    it("총 누적 대기 시간(maxTotalWaitMs) 상한에 먼저 도달하면 재시도를 중단하고 원본 예외를 전파한다", async () => {
      const { GeminiProvider } = await import("./gemini");
      generateContentMock.mockRejectedValue(new RateLimitError("rate limited"));

      const sleepCalls: number[] = [];
      const provider = new GeminiProvider({
        apiKey: "test-key",
        maxRetries: 5, // 총 대기 시간 상한이 먼저 걸리도록 재시도 횟수 상한은 충분히 크게
        initialDelayMs: 10,
        maxTotalWaitMs: 15, // 10(1차 백오프)은 통과, 10+20=30이 되는 2차 백오프에서 상한 초과
        sleepFn: async (ms: number) => {
          sleepCalls.push(ms);
        },
      });

      await expect(provider.generate({ prompt: "질의" })).rejects.toThrow("rate limited");
      expect(generateContentMock).toHaveBeenCalledTimes(2); // 최초 시도 + 1회 재시도 시도 후 상한 초과로 중단
      expect(sleepCalls).toEqual([10]);
    });

    it("sleepFn을 생략하면 기본 setTimeout 기반 sleep으로 재시도가 동작한다", async () => {
      const { GeminiProvider } = await import("./gemini");
      generateContentMock
        .mockRejectedValueOnce(new RateLimitError("rate limited"))
        .mockResolvedValueOnce({ text: "ok" });

      const provider = new GeminiProvider({
        apiKey: "test-key",
        maxRetries: 3,
        initialDelayMs: 0, // 기본 setTimeout(0) 경로를 빠르게 통과시킨다
      });

      const result = await provider.generate({ prompt: "질의" });

      expect(result.text).toBe("ok");
      expect(generateContentMock).toHaveBeenCalledTimes(2);
    });

    it("D2 회귀 — 낮은 rpmBudget 스케줄러가 주입되면 재시도가 백오프 완료 후에도 스케줄러의 다음 가용 슬롯까지 대기한다 (waitForSlot()이 매 시도마다 호출됨을 증명)", async () => {
      const { GeminiProvider } = await import("./gemini");
      const { RateScheduler } = await import("../rate-scheduler");

      generateContentMock
        .mockRejectedValueOnce(new RateLimitError("rate limited"))
        .mockResolvedValueOnce({ text: "ok" });

      let currentTime = 0;
      const sleepCalls: number[] = [];
      const sharedSleepFn = async (ms: number) => {
        sleepCalls.push(ms);
        currentTime += ms;
      };
      const sharedNowFn = () => currentTime;

      const scheduler = new RateScheduler({
        rpmBudget: 4, // 최소 간격 = 60000/4 = 15000ms
        nowFn: sharedNowFn,
        sleepFn: sharedSleepFn,
      });

      const provider = new GeminiProvider({
        apiKey: "test-key",
        scheduler,
        maxRetries: 3,
        initialDelayMs: 2000, // 백오프 지연(2000ms)이 스케줄러 최소 간격(15000ms)보다 짧다
        sleepFn: sharedSleepFn,
      });

      const result = await provider.generate({ prompt: "질의" });

      expect(result.text).toBe("ok");
      expect(generateContentMock).toHaveBeenCalledTimes(2);
      // 재시도 분기가 sleepFn(2000)으로 백오프를 먼저 기다린 뒤, 루프 최상단으로 돌아가
      // scheduler.waitForSlot()을 다시 호출한다 — 스케줄러가 부족한 13000ms를 추가로
      // 대기시킨다. 실제 다음 시도 시각 = max(2000, 15000) = 15000.
      expect(sleepCalls).toEqual([2000, 13000]);
      expect(currentTime).toBe(15000);
    });

    it("D2 회귀 — 스케줄러의 최소 간격이 이미 충족돼 있으면 waitForSlot()이 재시도 시에도 즉시 반환한다", async () => {
      const { GeminiProvider } = await import("./gemini");
      const { RateScheduler } = await import("../rate-scheduler");

      generateContentMock
        .mockRejectedValueOnce(new RateLimitError("rate limited"))
        .mockResolvedValueOnce({ text: "ok" });

      let currentTime = 0;
      const sleepCalls: number[] = [];
      const sharedSleepFn = async (ms: number) => {
        sleepCalls.push(ms);
        currentTime += ms;
      };
      const sharedNowFn = () => currentTime;

      const scheduler = new RateScheduler({
        rpmBudget: 4000, // 최소 간격 = 60000/4000 = 15ms — 백오프 대기(1000ms)보다 훨씬 짧다
        nowFn: sharedNowFn,
        sleepFn: sharedSleepFn,
      });

      const provider = new GeminiProvider({
        apiKey: "test-key",
        scheduler,
        maxRetries: 3,
        initialDelayMs: 1000,
        sleepFn: sharedSleepFn,
      });

      const result = await provider.generate({ prompt: "질의" });

      expect(result.text).toBe("ok");
      expect(generateContentMock).toHaveBeenCalledTimes(2);
      // 백오프 대기(1000ms)가 스케줄러 최소 간격(15ms)보다 이미 크므로,
      // 재시도 전 두 번째 waitForSlot()은 추가 sleepFn 호출 없이 즉시 반환한다.
      expect(sleepCalls).toEqual([1000]);
    });
  });
});
