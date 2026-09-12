import { AsyncLocalStorage } from "node:async_hooks";

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];
type FetchLogger = (line: string) => void;

interface ObservationContext {
  jobId: string;
}

const observationContext = new AsyncLocalStorage<ObservationContext>();
let installed = false;

function requestUrl(input: FetchInput): URL | undefined {
  try {
    if (typeof input === "string") return new URL(input);
    if (input instanceof URL) return input;
    return new URL(input.url);
  } catch {
    return undefined;
  }
}

function requestMethod(input: FetchInput, init?: FetchInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (input instanceof Request) return input.method.toUpperCase();
  return "GET";
}

function geminiModel(url: URL): string | undefined {
  if (url.hostname !== "generativelanguage.googleapis.com") return undefined;
  const match = /\/models\/([^/:]+):generateContent$/.exec(url.pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

export function createGeminiObservedFetch(
  originalFetch: typeof fetch,
  getJobId: () => string | undefined,
  log: FetchLogger = console.info,
  now: () => number = Date.now
): typeof fetch {
  return async (input: FetchInput, init?: FetchInit) => {
    const url = requestUrl(input);
    const model = url ? geminiModel(url) : undefined;
    const jobId = getJobId();
    if (!model || !jobId) return originalFetch(input, init);

    const startedAt = now();
    try {
      const response = await originalFetch(input, init);
      log(
        JSON.stringify({
          event: "gemini_request_observed",
          jobId,
          method: requestMethod(input, init),
          model,
          status: response.status,
          ok: response.ok,
          durationMs: Math.max(0, now() - startedAt),
        })
      );
      return response;
    } catch (error) {
      log(
        JSON.stringify({
          event: "gemini_request_observed",
          jobId,
          method: requestMethod(input, init),
          model,
          status: null,
          ok: false,
          durationMs: Math.max(0, now() - startedAt),
          errorName: error instanceof Error ? error.name : "UnknownError",
        })
      );
      throw error;
    }
  };
}

function installGeminiFetchObserver(): void {
  if (installed) return;
  globalThis.fetch = createGeminiObservedFetch(
    globalThis.fetch.bind(globalThis),
    () => observationContext.getStore()?.jobId
  );
  installed = true;
}

export function withGeminiFetchObservation<T>(jobId: string, task: () => Promise<T>): Promise<T> {
  installGeminiFetchObserver();
  return observationContext.run({ jobId }, task);
}
