import { GoogleGenAI } from "@google/genai";
import type { GenerateRequest, GenerateResponse, LLMProvider } from "../provider";

const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_DELAY_MS = 1000;

export interface GeminiProviderOptions {
  apiKey?: string;
  maxRetries?: number;
  initialDelayMs?: number;
  sleepFn?: (ms: number) => Promise<void>;
}

function isRateLimitError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status?: unknown }).status === 429
  );
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// @MX:WARN: [AUTO] Gemini 429(rate limit) 응답에 대한 지수 백오프 재시도 루프
// @MX:REASON: 재시도가 소진됐을 때 예외를 삼키면 파이프라인이 실패를 인지하지
// 못한 채 조용히 잘못된 결과를 반환할 위험이 있다 — 반드시 예외를 전파해
// 파이프라인 실행 결과를 실패로 표시해야 한다 (REQ-SCAFFOLD-008, research.md §3).
export class GeminiProvider implements LLMProvider {
  private readonly client: GoogleGenAI;
  private readonly model: string;
  private readonly maxRetries: number;
  private readonly initialDelayMs: number;
  private readonly sleepFn: (ms: number) => Promise<void>;

  constructor(options: GeminiProviderOptions = {}) {
    const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY 환경변수가 설정되어야 합니다.");
    }

    this.client = new GoogleGenAI({ apiKey });
    this.model = DEFAULT_MODEL;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.initialDelayMs = options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
    this.sleepFn = options.sleepFn ?? defaultSleep;
  }

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    let attempt = 0;

    while (true) {
      try {
        const response = await this.client.models.generateContent({
          model: request.model ?? this.model,
          contents: request.prompt,
        });
        return { text: response.text ?? "" };
      } catch (error) {
        const isLastAttempt = attempt >= this.maxRetries;
        if (!isRateLimitError(error) || isLastAttempt) {
          // 429가 아닌 오류는 즉시 전파하고, 429라도 재시도가 소진되면
          // 예외를 삼키지 않고 그대로 전파한다 (REQ-SCAFFOLD-008).
          throw error;
        }

        const delayMs = this.initialDelayMs * 2 ** attempt;
        await this.sleepFn(delayMs);
        attempt += 1;
      }
    }
  }
}
