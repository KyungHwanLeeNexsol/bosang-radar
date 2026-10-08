// SPEC-B2C-LAUNCH-001 M4 (REQ-B2CLAUNCH-013, AC-B2CLAUNCH-013) — 배포 직후 smoke 검사 로직.
//
// D-LAUNCH-06 설계 (a) "두 상태 수용": 진단 게이트가 닫혀 있든(placeholder) 열려 있든 같은 판정 규칙을 쓴다.
// 판정에 쓰는 것은 배포 건강 둘뿐이다.
//   1) GET / 가 2xx를 돌려준다(기동 직후를 위해 제한된 횟수만 다시 시도한다).
//   2) 본문이 가리키는 CSS 청크가 있고 그 청크가 2xx로 서빙된다(standalone 정적 자산 복사 누락을 잡는다).
// 게이트 상태(placeholder 문구의 유무)는 정보로 기록할 뿐 판정에 쓰지 않는다 — 예전 인라인 검사는 placeholder
// 문구가 없으면 실패해서 진단 플래그를 여는 순간 정상 배포가 실패로 보였다(LF-04, LF-19).
//
// 이 모듈은 네트워크·시간을 주입받는 순수 로직이다. 기준 주소는 호출하는 쪽이 넘기며(인자 또는 환경 입력),
// 저장소에 기본 주소·호스트를 두지 않는다. 응답 본문은 어디에도 출력하지 않는다.

export const GATE_CLOSED_MARKER = "서비스 준비 중입니다";
export const DEFAULT_ATTEMPTS = 10;
export const DEFAULT_RETRY_DELAY_MS = 2000;
export const REQUEST_TIMEOUT_MS = 5000;

export type GateState = "closed" | "open" | "unknown";

export const GATE_STATE_LABEL: Readonly<Record<GateState, string>> = {
  closed: "닫힘",
  open: "열림",
  unknown: "알 수 없음",
};

export interface SmokeResponse {
  readonly status: number;
  text(): Promise<string>;
}

export type SmokeFetch = (url: string) => Promise<SmokeResponse>;

export interface SmokeCheck {
  readonly name: "home" | "css-referenced" | "css-served";
  readonly ok: boolean;
  readonly detail: string;
}

export interface SmokeReport {
  readonly ok: boolean;
  readonly checks: readonly SmokeCheck[];
  /** 정보용 관측. 판정에 쓰지 않는다. */
  readonly gateState: GateState;
}

export interface SmokeOptions {
  readonly baseUrl: string;
  readonly attempts?: number;
  readonly retryDelayMs?: number;
  readonly fetchImpl?: SmokeFetch;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly log?: (line: string) => void;
}

export type ParsedSmokeArgs =
  | {
      readonly ok: true;
      readonly baseUrl: string;
      readonly attempts: number;
      readonly retryDelayMs: number;
    }
  | { readonly ok: false; readonly error: string };

// 예전 인라인 검사의 `grep -oE '/_next/static/chunks/[^"]+\.css'`와 같은 패턴이다.
const CSS_CHUNK_PATTERN = /\/_next\/static\/chunks\/[^"]+\.css/;

/** 본문이 가리키는 첫 CSS 청크 경로. 없으면 null. */
export function findCssChunkPath(html: string): string | null {
  const match = CSS_CHUNK_PATTERN.exec(html);
  return match ? match[0] : null;
}

/** 정보용 게이트 상태: placeholder 문구가 있으면 닫힘, 본문이 있는데 없으면 열림, 본문이 비면 알 수 없음. */
export function observeGateState(html: string): GateState {
  if (html === "") return "unknown";
  return html.includes(GATE_CLOSED_MARKER) ? "closed" : "open";
}

/**
 * 실제 fetch를 감싼다. 3xx를 따라가지 않고(curl 기본 동작과 같다 — 3xx는 2xx가 아니므로 실패다) 요청마다
 * 시간 상한을 둔다(예전 `--max-time 5`).
 */
export function createSmokeFetch(timeoutMs: number = REQUEST_TIMEOUT_MS): SmokeFetch {
  // @MX:WARN: [AUTO] 자체 try/catch가 없는 async 화살표 함수 — fetch 거부(연결 거부·AbortSignal.timeout 만료)가 그대로 reject된다
  // @MX:REASON: 잡지 않는 것이 계약이다. 이 함수를 부르는 곳은 attemptFetch뿐이고(runSmokeCheck가 홈은 재시도 루프에서, CSS 청크는 한 번 거친다), attemptFetch의 try/catch가 거부를 상태 0(전송 실패)으로 바꾼다. 상태 0은 홈에서는 재시도 또는 실패 판정이 되고 CSS 청크에서는 css-served 실패가 된다. 이 함수가 직접 연 자원은 없고, 응답 본문은 runSmokeCheck가 읽거나 drain이 읽어 버린다.
  // @MX:SPEC: SPEC-B2C-LAUNCH-001
  return async (url) => {
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { status: response.status, text: () => response.text() };
  };
}

const isSuccess = (status: number): boolean => status >= 200 && status < 300;

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** 응답 본문을 읽어 버린다 — 쓰지 않는 응답이 연결을 붙잡지 않게 한다. */
async function drain(response: SmokeResponse): Promise<void> {
  try {
    await response.text();
  } catch {
    // 이미 끊긴 응답이면 버릴 것이 없다.
  }
}

interface Attempt {
  /** 전송 실패(연결 거부·시간 초과 등)는 0이다 — curl의 "000"과 같다. */
  readonly status: number;
  readonly response: SmokeResponse | null;
}

async function attemptFetch(fetchImpl: SmokeFetch, url: string): Promise<Attempt> {
  try {
    const response = await fetchImpl(url);
    return { status: response.status, response };
  } catch {
    return { status: 0, response: null };
  }
}

const statusText = (status: number): string =>
  status === 0 ? "응답 없음(전송 실패, 상태 0)" : `상태 ${status}`;

/**
 * smoke 검사를 한다. 홈이 2xx가 아니면 CSS 검사는 하지 않는다. 판정(ok)은 검사 결과의 논리곱이고
 * 게이트 상태는 포함하지 않는다.
 */
export async function runSmokeCheck(options: SmokeOptions): Promise<SmokeReport> {
  const attempts = options.attempts ?? DEFAULT_ATTEMPTS;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const fetchImpl = options.fetchImpl ?? createSmokeFetch();
  const sleep = options.sleep ?? defaultSleep;
  const homeUrl = new URL("/", options.baseUrl).href;

  let home: Attempt = { status: 0, response: null };
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    home = await attemptFetch(fetchImpl, homeUrl);
    if (isSuccess(home.status)) break;
    if (home.response) await drain(home.response);
    const last = attempt === attempts;
    options.log?.(
      `  시도 ${attempt}/${attempts}: GET / → ${statusText(home.status)}` +
        (last ? " (마지막 시도, 더 이상 다시 시도하지 않음)" : ` (${retryDelayMs}ms 뒤 다시 시도)`)
    );
    if (!last) await sleep(retryDelayMs);
  }

  if (!isSuccess(home.status) || home.response === null) {
    return {
      ok: false,
      checks: [
        {
          name: "home",
          ok: false,
          detail: `GET / ${statusText(home.status)} — 2xx가 아니다(${attempts}회 시도)`,
        },
      ],
      gateState: "unknown",
    };
  }

  let body = "";
  try {
    body = await home.response.text();
  } catch {
    body = "";
  }
  const checks: SmokeCheck[] = [
    { name: "home", ok: true, detail: `GET / ${statusText(home.status)}` },
  ];
  const gateState = observeGateState(body);

  const cssPath = findCssChunkPath(body);
  if (cssPath === null) {
    checks.push({
      name: "css-referenced",
      ok: false,
      detail: "본문에 CSS 청크 참조가 없다(정적 자산 복사 누락 가능)",
    });
    return { ok: false, checks, gateState };
  }
  checks.push({ name: "css-referenced", ok: true, detail: cssPath });

  const css = await attemptFetch(fetchImpl, new URL(cssPath, homeUrl).href);
  if (css.response) await drain(css.response);
  checks.push({
    name: "css-served",
    ok: isSuccess(css.status),
    detail: `GET ${cssPath} ${statusText(css.status)}`,
  });
  return { ok: checks.every((check) => check.ok), checks, gateState };
}

const CHECK_LABEL: Readonly<Record<SmokeCheck["name"], string>> = {
  home: "홈 응답",
  "css-referenced": "CSS 청크 참조",
  "css-served": "CSS 청크 응답",
};

/** 관측을 한 줄씩 적는다. 응답 본문과 기준 주소는 적지 않는다. */
export function formatSmokeReport(report: SmokeReport): string[] {
  return [
    "== smoke 검사 ==",
    ...report.checks.map(
      (check) => `- ${CHECK_LABEL[check.name]}: ${check.detail} → ${check.ok ? "통과" : "실패"}`
    ),
    `- 진단 게이트 상태(정보용, 판정에 쓰지 않음): ${GATE_STATE_LABEL[report.gateState]}`,
    `판정: ${report.ok ? "통과" : "실패"}`,
  ];
}

const KNOWN_FLAGS = ["base-url", "attempts", "retry-delay-ms"] as const;

/**
 * 명령줄 인자(`--base-url=` 등)와 환경 입력(SMOKE_BASE_URL)을 읽는다. 기준 주소에 기본값은 없다.
 * 오류 문구에는 입력 값을 되풀이하지 않는다.
 */
export function parseSmokeArgs(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>
): ParsedSmokeArgs {
  const flags = new Map<string, string>();
  for (const arg of argv) {
    const match = /^--([a-z-]+)=([\s\S]*)$/.exec(arg);
    if (!match || !(KNOWN_FLAGS as readonly string[]).includes(match[1])) {
      return { ok: false, error: `알 수 없는 인자${match ? ` "--${match[1]}"` : ""}` };
    }
    flags.set(match[1], match[2]);
  }

  const rawBase = flags.get("base-url") ?? env.SMOKE_BASE_URL;
  if (rawBase === undefined || rawBase === "") {
    return { ok: false, error: "--base-url 인자 또는 SMOKE_BASE_URL 환경 입력이 필요하다" };
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawBase);
  } catch {
    return { ok: false, error: "기준 주소를 주소로 읽지 못했다" };
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return { ok: false, error: "기준 주소는 http 또는 https여야 한다" };
  }

  const rawAttempts = flags.get("attempts");
  if (rawAttempts !== undefined && !/^[1-9]\d*$/.test(rawAttempts)) {
    return { ok: false, error: "--attempts는 1 이상의 정수여야 한다" };
  }
  const rawDelay = flags.get("retry-delay-ms");
  if (rawDelay !== undefined && !/^\d+$/.test(rawDelay)) {
    return { ok: false, error: "--retry-delay-ms는 0 이상의 정수여야 한다" };
  }

  return {
    ok: true,
    baseUrl: rawBase,
    attempts: rawAttempts === undefined ? DEFAULT_ATTEMPTS : Number(rawAttempts),
    retryDelayMs: rawDelay === undefined ? DEFAULT_RETRY_DELAY_MS : Number(rawDelay),
  };
}
