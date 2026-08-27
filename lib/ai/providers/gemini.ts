import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type {
  GenerateRequest,
  GenerateResponse,
  GenerateStructuredRequest,
  LLMProvider,
  StructuredResult,
} from "../provider";
import type { RateScheduler } from "../rate-scheduler";

// SPEC-GEMINI-RUNTIME-001 M1 (design.md §1 D1): 정상 앱 경로(provider-factory.ts)는
// model 옵션을 항상 명시적으로 채워 넘기므로, 이 폴백은 정상 경로에서 구조적으로
// 도달할 수 없다 — 단위 테스트가 model을 생략하고 직접 생성하는 경우 등에만
// 실제로 쓰인다. Fast 역할 기본값과 동일한 검증된 Stable 값으로 맞춘다
// (provider-factory.ts의 상수를 import하지 않는다 — 순환 의존 방지, 값은
// 우연히 일치하도록 독립적으로 유지).
const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_DELAY_MS = 1000;
// 단일 재시도 지연의 상한(design.md §5) — SDK 자체 DEFAULT_RETRY_MAX_DELAY=60s와 동일 근거.
const MAX_SINGLE_DELAY_MS = 60_000;
// 재시도 sleep 구간에만 적용되는 총 누적 대기 시간 상한(design.md §5 — 스케줄러 대기나
// 순수 네트워크 지연은 이 상한의 대상이 아니다).
const DEFAULT_MAX_TOTAL_WAIT_MS = 120_000;

export interface GeminiProviderOptions {
  apiKey?: string;
  model?: string;
  // 이미 구성된 RateScheduler 인스턴스를 주입받는다(design.md §1 D3) — 더 이상
  // rpmBudget 숫자를 직접 받아 스스로 생성하지 않는다. 이렇게 해야
  // provider-factory.ts가 model ID가 같은 두 역할에 동일 인스턴스를 공유시킬
  // 수 있다. M1 시점에는 옵션만 수용하며, 실제 waitForSlot() 통합은 M3에서
  // withRetry() 루프 안으로 배선된다(design.md §5 D2).
  scheduler?: RateScheduler;
  // 재시도 sleep 구간의 총 누적 대기 시간 상한(M3에서 withRetry()가 소비).
  maxTotalWaitMs?: number;
  maxRetries?: number;
  initialDelayMs?: number;
  sleepFn?: (ms: number) => Promise<void>;
}

// 429(RESOURCE_EXHAUSTED)와 503(UNAVAILABLE) 모두 공식적으로 일시적(transient)·재시도
// 가능으로 분류된다(design.md §5, ai.google.dev/gemini-api/docs/troubleshooting 재확인).
function isRetryableStatus(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return false;
  }
  const status = (error as { status?: unknown }).status;
  return status === 429 || status === 503;
}

// ApiError.message는 throwErrorIfNotOK()가 만든 JSON.stringify(errorBody) 문자열이다.
// retryDelay는 .error.details[]에서 RetryInfo 항목의 .retryDelay(예: "41s")를 찾아
// 파싱한다 — ApiError/ApiErrorInfo 어디에도 .details가 1급 필드로 노출되지 않는다
// (design.md §5, research.md §2 SDK 소스 근거).
function parseRetryDelayMs(error: unknown): number | null {
  if (!(error instanceof Error)) return null;
  try {
    const parsed = JSON.parse(error.message) as {
      error?: { details?: Array<{ "@type"?: string; retryDelay?: string }> };
    };
    const info = parsed.error?.details?.find(
      (d) => d["@type"] === "type.googleapis.com/google.rpc.RetryInfo"
    );
    const match = info?.retryDelay ? /^(\d+(?:\.\d+)?)s$/.exec(info.retryDelay) : null;
    return match ? Math.round(Number(match[1]) * 1000) : null;
  } catch {
    return null; // message가 JSON이 아니거나 details가 없음 — 힌트 없음, 예외를 던지지 않는다.
  }
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
  private readonly scheduler?: RateScheduler;
  private readonly maxTotalWaitMs: number;
  private readonly maxRetries: number;
  private readonly initialDelayMs: number;
  private readonly sleepFn: (ms: number) => Promise<void>;

  constructor(options: GeminiProviderOptions = {}) {
    const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY 환경변수가 설정되어야 합니다.");
    }

    this.client = new GoogleGenAI({ apiKey });
    this.model = options.model ?? DEFAULT_MODEL;
    this.scheduler = options.scheduler;
    this.maxTotalWaitMs = options.maxTotalWaitMs ?? DEFAULT_MAX_TOTAL_WAIT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.initialDelayMs = options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
    this.sleepFn = options.sleepFn ?? defaultSleep;
  }

  // SPEC-RESEARCH-001 M2: generate()/generateStructured() 공유 재시도 헬퍼
  // (design.md §4 — 순수 내부 리팩토링, 외부 계약 무변경).
  //
  // SPEC-GEMINI-RUNTIME-001 M3 (design.md §5, D2): waitForSlot()을 루프 최상단으로
  // 옮겨 매 시도(최초 시도 + 모든 재시도 시도)가 실제 호출 직전에 반드시 스케줄러를
  // 거치도록 한다 — 이전 버전은 withRetry() 호출 전 딱 한 번만 스케줄러를 거쳐
  // 재시도 시도가 스케줄러를 완전히 우회하는 결함이 있었다.
  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let attempt = 0;
    let cumulativeWaitMs = 0;

    while (true) {
      await this.scheduler?.waitForSlot(); // (D2) 최초 시도 + 모든 재시도 시도 각각에 적용
      try {
        return await operation();
      } catch (error) {
        const isLastAttempt = attempt >= this.maxRetries;
        if (!isRetryableStatus(error) || isLastAttempt) {
          // 429/503이 아닌 오류는 즉시 전파하고, 재시도가 소진되면
          // 예외를 삼키지 않고 그대로 전파한다 (REQ-SCAFFOLD-008).
          throw error;
        }

        const hinted = parseRetryDelayMs(error);
        const backoffDelay = hinted ?? this.initialDelayMs * 2 ** attempt;
        const delayMs = Math.min(backoffDelay, MAX_SINGLE_DELAY_MS);
        if (cumulativeWaitMs + delayMs > this.maxTotalWaitMs) {
          // 총 누적 대기 시간 상한 초과 — 원본 오류를 전파한다.
          throw error;
        }

        cumulativeWaitMs += delayMs;
        await this.sleepFn(delayMs);
        attempt += 1;
        // 루프 최상단으로 돌아가 scheduler.waitForSlot()을 다시 거친다.
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
