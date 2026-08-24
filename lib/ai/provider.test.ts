import { describe, expect, it } from "vitest";
import type { LLMProvider } from "./provider";

class FakeProvider implements LLMProvider {
  async generate(request: { prompt: string }) {
    return { text: `echo: ${request.prompt}` };
  }
}

describe("lib/ai/provider LLMProvider", () => {
  it("generate() 하나만으로 구현 가능하다 (REQ-SCAFFOLD-006)", async () => {
    const provider: LLMProvider = new FakeProvider();
    const result = await provider.generate({ prompt: "hello" });

    expect(result.text).toBe("echo: hello");
  });

  it("embed() 등 미사용 메서드를 요구하지 않는다 (research.md §6-4)", () => {
    const provider = new FakeProvider();

    expect((provider as unknown as { embed?: unknown }).embed).toBeUndefined();
  });
});
