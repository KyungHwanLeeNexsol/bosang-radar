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

describe("lib/ai/provider-factory getLLMProvider (SPEC-RESEARCH-001 M2, design.md §1)", () => {
  beforeEach(() => {
    generateContentMock.mockReset();
    GoogleGenAIMock.mockClear();
  });

  it("LLM_PROVIDER_MODE가 deterministic이면 결정론적 provider를 반환한다", async () => {
    const { getLLMProvider } = await import("./provider-factory");

    const provider = getLLMProvider({
      LLM_PROVIDER_MODE: "deterministic",
    } as unknown as NodeJS.ProcessEnv);
    const result = await provider.generate({ prompt: "질의" });

    expect(result.text).toBe("[deterministic] 질의");
    expect(GoogleGenAIMock).not.toHaveBeenCalled();
  });

  it("LLM_PROVIDER_MODE가 미설정이면 GeminiProvider를 반환하고, 동일 env의 GEMINI_API_KEY를 생성자에 그대로 전달한다 (design.md §1 3차 revision)", async () => {
    const { getLLMProvider } = await import("./provider-factory");

    const testEnv = { GEMINI_API_KEY: "injected-test-key" } as unknown as NodeJS.ProcessEnv;
    getLLMProvider(testEnv);

    expect(GoogleGenAIMock).toHaveBeenCalledWith({ apiKey: "injected-test-key" });
  });

  it("env를 생략하면 기본값으로 process.env를 사용한다", async () => {
    const { getLLMProvider } = await import("./provider-factory");
    const originalMode = process.env.LLM_PROVIDER_MODE;
    process.env.LLM_PROVIDER_MODE = "deterministic";

    const provider = getLLMProvider();
    const result = await provider.generate({ prompt: "질의" });

    expect(result.text).toBe("[deterministic] 질의");

    if (originalMode === undefined) {
      delete process.env.LLM_PROVIDER_MODE;
    } else {
      process.env.LLM_PROVIDER_MODE = originalMode;
    }
  });
});
