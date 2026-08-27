import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type {
  GenerateRequest,
  GenerateResponse,
  GenerateStructuredRequest,
  LLMProvider,
  StructuredResult,
} from "../provider";

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

  // SPEC-RESEARCH-001 M2: generate()/generateStructured() 공유 재시도 헬퍼
  // (design.md §4 — 순수 내부 리팩토링, 외부 계약 무변경).
  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let attempt = 0;

    while (true) {
      try {
        return await operation();
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

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    return this.withRetry(async () => {
      const response = await this.client.models.generateContent({
        model: request.model ?? this.model,
        contents: request.prompt,
      });
      return { text: response.text ?? "" };
    });
  }

  // SPEC-RESEARCH-001 M2: Zod 스키마 기반 구조화 출력(design.md §4).
  // Gemini의 responseJsonSchema/responseMimeType 등 SDK 세부사항은 이 메서드
  // 내부에만 존재하며, 호출부(Researcher 등)는 이를 전혀 알지 못한다
  // (REQ-RESEARCH-009/015).
  async generateStructured<T>(request: GenerateStructuredRequest<T>): Promise<StructuredResult<T>> {
    const jsonSchema = z.toJSONSchema(request.schema); // zod 4.4.3 네이티브 변환 — 신규 의존성 불필요
    const response = await this.withRetry(() =>
      this.client.models.generateContent({
        model: request.model ?? this.model,
        contents: request.prompt,
        config: { responseMimeType: "application/json", responseJsonSchema: jsonSchema },
      })
    );

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.text ?? "");
    } catch {
      return { ok: false, reason: "invalid_json", raw: response.text ?? "" };
    }

    const result = request.schema.safeParse(parsed);
    if (!result.success) {
      return { ok: false, reason: "schema_validation_failed", raw: response.text ?? "" };
    }
    return { ok: true, data: result.data };
  }
}
