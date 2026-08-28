import { beforeEach, describe, expect, it, vi } from "vitest";

// SPEC-GEMINI-RUNTIME-001 M1 (design.md §1): getLLMProvider() 단일 함수를
// getLLMProviders(env) 역할별 2-provider 반환으로 재작성 — GeminiProvider
// 생성자를 mock해 provider-factory.ts가 model/scheduler를 어떻게 확정해
// 넘기는지 spy로 확인한다. GoogleGenAI 자체는 GeminiProvider 내부로 옮겨졌으므로
// 이 파일에서는 더 이상 직접 mock하지 않는다.
const { GeminiProviderMock } = vi.hoisted(() => {
  const GeminiProviderMock = vi.fn().mockImplementation(function (
    this: { options: unknown; generate: unknown; generateStructured: unknown },
    options: unknown
  ) {
    this.options = options;
    this.generate = vi.fn().mockResolvedValue({ text: "mock" });
    this.generateStructured = vi.fn();
  });
  return { GeminiProviderMock };
});

vi.mock("./providers/gemini", () => ({
  GeminiProvider: GeminiProviderMock,
}));

interface MockedProvider {
  options: { model?: string; scheduler?: { rpmBudget: number } };
}

describe("lib/ai/provider-factory getLLMProviders (SPEC-GEMINI-RUNTIME-001 M1, design.md §1)", () => {
  beforeEach(() => {
    GeminiProviderMock.mockClear();
  });

  it("LLM_PROVIDER_MODE가 deterministic이면 research/fast 모두 동일한 결정론적 provider를 반환한다 (AC-GEMINI-RUNTIME-004)", async () => {
    const { getLLMProviders } = await import("./provider-factory");

    const { research, fast } = getLLMProviders({
      LLM_PROVIDER_MODE: "deterministic",
    } as unknown as NodeJS.ProcessEnv);

    expect(research).toBe(fast);
    const result = await research.generate({ prompt: "질의" });
    expect(result.text).toBe("[deterministic] 질의");
    expect(GeminiProviderMock).not.toHaveBeenCalled();
  });

  it("env에 GEMINI_RESEARCH_MODEL/GEMINI_FAST_MODEL이 설정되면 GeminiProvider 생성 이전에 확정된 model 문자열을 명시적으로 전달한다 (AC-GEMINI-RUNTIME-002)", async () => {
    const { getLLMProviders } = await import("./provider-factory");
    const env = {
      GEMINI_RESEARCH_MODEL: "gemini-test-research",
      GEMINI_FAST_MODEL: "gemini-test-fast",
      GEMINI_API_KEY: "test-key",
    } as unknown as NodeJS.ProcessEnv;

    getLLMProviders(env);

    expect(GeminiProviderMock).toHaveBeenCalledTimes(2);
    const [researchArgs, fastArgs] = GeminiProviderMock.mock.calls.map(
      (call) => call[0] as MockedProvider["options"]
    );
    expect(researchArgs.model).toBe("gemini-test-research");
    expect(fastArgs.model).toBe("gemini-test-fast");
  });

  it("env가 미설정이면 provider-factory.ts 자신의 기본값을 명시적으로 전달한다 — GeminiProvider 내부 DEFAULT_MODEL 폴백에 위임하지 않는다 (AC-GEMINI-RUNTIME-003)", async () => {
    const { getLLMProviders } = await import("./provider-factory");

    getLLMProviders({ GEMINI_API_KEY: "test-key" } as unknown as NodeJS.ProcessEnv);

    const [researchArgs, fastArgs] = GeminiProviderMock.mock.calls.map(
      (call) => call[0] as MockedProvider["options"]
    );
    expect(researchArgs.model).toBe("gemini-3.6-flash");
    expect(fastArgs.model).toBe("gemini-3.5-flash-lite");
  });

  it("research/fast의 확정된 model ID가 다르면 서로 독립된 RateScheduler를 각자의 budget으로 구성한다 (AC-GEMINI-RUNTIME-014)", async () => {
    const { getLLMProviders } = await import("./provider-factory");
    const env = {
      GEMINI_RESEARCH_MODEL: "gemini-research-only",
      GEMINI_FAST_MODEL: "gemini-fast-only",
      GEMINI_RESEARCH_RPM_BUDGET: "60",
      GEMINI_FAST_RPM_BUDGET: "4",
      GEMINI_API_KEY: "test-key",
    } as unknown as NodeJS.ProcessEnv;

    getLLMProviders(env);

    const [researchArgs, fastArgs] = GeminiProviderMock.mock.calls.map(
      (call) => call[0] as MockedProvider["options"]
    );
    expect(researchArgs.scheduler).not.toBe(fastArgs.scheduler);
    expect(researchArgs.scheduler?.rpmBudget).toBe(60);
    expect(fastArgs.scheduler?.rpmBudget).toBe(4);
  });

  it("research/fast의 확정된 model ID가 같으면 하나의 RateScheduler를 공유하고 두 budget 중 더 작은 값을 적용한다 (AC-GEMINI-RUNTIME-014a, D3)", async () => {
    const { getLLMProviders } = await import("./provider-factory");
    const env = {
      GEMINI_RESEARCH_MODEL: "gemini-shared-model",
      GEMINI_FAST_MODEL: "gemini-shared-model",
      GEMINI_RESEARCH_RPM_BUDGET: "10",
      GEMINI_FAST_RPM_BUDGET: "4",
      GEMINI_API_KEY: "test-key",
    } as unknown as NodeJS.ProcessEnv;

    getLLMProviders(env);

    const [researchArgs, fastArgs] = GeminiProviderMock.mock.calls.map(
      (call) => call[0] as MockedProvider["options"]
    );
    expect(researchArgs.scheduler).toBe(fastArgs.scheduler);
    expect(researchArgs.scheduler?.rpmBudget).toBe(4);
  });

  it("GEMINI_RESEARCH_RPM_BUDGET/GEMINI_FAST_RPM_BUDGET이 미설정이면 보수적 코드 기본값(4)을 사용한다 (AC-GEMINI-RUNTIME-015)", async () => {
    const { getLLMProviders } = await import("./provider-factory");

    getLLMProviders({
      GEMINI_RESEARCH_MODEL: "gemini-research-only",
      GEMINI_FAST_MODEL: "gemini-fast-only",
      GEMINI_API_KEY: "test-key",
    } as unknown as NodeJS.ProcessEnv);

    const [researchArgs, fastArgs] = GeminiProviderMock.mock.calls.map(
      (call) => call[0] as MockedProvider["options"]
    );
    expect(researchArgs.scheduler?.rpmBudget).toBe(4);
    expect(fastArgs.scheduler?.rpmBudget).toBe(4);
  });

  // post-run fix: GeminiProvider 생성자(gemini.ts)의 `options.apiKey ??
  // process.env.GEMINI_API_KEY` 폴백 때문에, 주입된 env에 GEMINI_API_KEY가
  // 없으면 조용히 전역 process.env 값과 섞일 수 있었다 — "env 주입과
  // process.env 격리" 계약(provider-factory.ts 상단 @MX:NOTE)에 대한 회귀.
  // deterministic 모드는 이 검사 이전에 조기 반환하므로 영향받지 않는다.
  it("process.env.GEMINI_API_KEY가 설정돼 있어도 주입된 env에 GEMINI_API_KEY가 없으면 전역 process.env로 폴백하지 않고 명시적으로 throw한다 (env 격리 회귀 방지)", async () => {
    const { getLLMProviders } = await import("./provider-factory");
    const originalApiKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "global-process-env-secret";

    try {
      const customEnv = {
        GEMINI_RESEARCH_MODEL: "gemini-test-research",
        GEMINI_FAST_MODEL: "gemini-test-fast",
        // GEMINI_API_KEY 의도적으로 생략 — 주입된 env 자체에는 apiKey가 없다.
      } as unknown as NodeJS.ProcessEnv;

      let thrown: unknown;
      try {
        getLLMProviders(customEnv);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(Error);
      // 실 secret 값이 오류 메시지에 노출되지 않아야 한다.
      expect((thrown as Error).message).not.toContain("global-process-env-secret");
      // 전역 process.env 값으로 폴백해 GeminiProvider가 생성되는 일이 없어야 한다.
      expect(GeminiProviderMock).not.toHaveBeenCalled();
    } finally {
      if (originalApiKey === undefined) {
        delete process.env.GEMINI_API_KEY;
      } else {
        process.env.GEMINI_API_KEY = originalApiKey;
      }
    }
  });

  describe("getDefaultLLMProviders() — 프로세스 생애주기 싱글턴 (D-NEW1, REQ-GEMINI-RUNTIME-025)", () => {
    it("최초 호출 시 getLLMProviders(process.env) 결과를 캐시하고, 이후 호출은 동일한 참조를 반환한다", async () => {
      vi.resetModules();
      const originalMode = process.env.LLM_PROVIDER_MODE;
      process.env.LLM_PROVIDER_MODE = "deterministic";

      try {
        const { getDefaultLLMProviders } = await import("./provider-factory");
        const first = getDefaultLLMProviders();
        const second = getDefaultLLMProviders();

        expect(first).toBe(second);
      } finally {
        if (originalMode === undefined) {
          delete process.env.LLM_PROVIDER_MODE;
        } else {
          process.env.LLM_PROVIDER_MODE = originalMode;
        }
      }
    });
  });
});
