// stderr 줄 인식. 메시지 본문 전체 일치로만 판정한다(접두 일치 금지).
//
// 공개 API (B2가 쓴다):
//   classifyStderrLine(text, fmt?): ClassifiedLine | null   알 수 없는 줄은 null(예외 없음)
//   LogFormat { extractMessage(line): string }              줄에서 메시지 본문을 꺼내는 주입점
//   defaultLogFormat                                        줄 전체의 앞뒤 공백 제거
//   normalizeLoadingPath(path): string                      로딩 쌍 비교용 구분자 정규화
//   LogKey, SimpleLogKey, ClassifiedLine                    키 합집합과 매개변수 타입
//
// 키와 메시지 본문의 표는 README.md의 "순수 판정의 규칙" 절과 같다(소스 문자열, Semgrep v1.180.0).
// 실제 stderr에 이 모양으로 나오는지, 앞에 시각·수준 접두어가 붙는지는 미확인(ADR U3)이다.
// 그래서 접두어 처리는 코드에 넣지 않고 LogFormat으로 주입한다. 첫 실제 실행의 원문으로 형식이
// 동결되기 전까지 기본값(줄 전체)은 접두어가 없다는 가정이다.

export interface LogFormat {
  /** 한 줄에서 메시지 본문을 꺼낸다. 본문은 아래 표의 문자열과 전체 일치해야 한다. */
  extractMessage(line: string): string;
}

/** 줄 전체(앞뒤 공백과 CR 제거). 접두어가 없다는 가정이다. */
export const defaultLogFormat: LogFormat = {
  extractMessage: (line) => line.trim(),
};

const SIMPLE_MESSAGES = {
  "Refreshing rules": "refreshingRules",
  "Rules refreshed": "rulesRefreshed",
  "Scanning open documents": "scanningOpenDocuments",
  "Scanned open documents": "scannedOpenDocuments",
  "Scanning workspace": "scanningWorkspace",
  "Scanned workspace": "scannedWorkspace",
  "Scanning workspace complete": "barrier",
  "Scanning workspace, full: true": "fullScan",
  "CI disabled, not checking API token": "ciDisabled",
  "No rules source specified, using auto": "usingAuto",
  "Scanning single file": "scanningSingleFile",
} as const;

export type SimpleLogKey = (typeof SIMPLE_MESSAGES)[keyof typeof SIMPLE_MESSAGES];

export type ClassifiedLine =
  | { key: SimpleLogKey; params: Record<string, never> }
  | { key: "gotErrors"; params: { count: number } }
  | { key: "loading"; params: { path: string } }
  | { key: "doneLoading"; params: { path: string } }
  | { key: "skippingRule"; params: { ruleId: string; error: string } }
  | { key: "download"; params: { url: string } }
  | { key: "runningRules"; params: { n: number } }
  | { key: "engineErrors"; params: { text: string } }
  | { key: "skippedRules"; params: { s: number } }
  | { key: "scannedFiles"; params: { k: number } }
  | { key: "foundMatches"; params: { m: number } };

export type LogKey = ClassifiedLine["key"];

const SIMPLE = new Map<string, SimpleLogKey>(Object.entries(SIMPLE_MESSAGES));

// 숫자는 정준 표기(앞의 0 없음)만 받는다. [\s\S]는 s 플래그(ES2018)를 쓰지 않으려는 선택이다.
const NUM = "(0|[1-9][0-9]*)";
const GOT_ERRORS = new RegExp(`^Got ${NUM} errors while refreshing rules in language server$`);
const LOADING = /^loading local config from (.+)$/;
const DONE_LOADING = /^Done loading local config from (.+)$/;
const SKIPPING_RULE = /^skipping rule (\S+), error = ([\s\S]*)$/;
const DOWNLOAD = /^trying to download from (.+)$/;
const RUNNING_RULES = new RegExp(`^Running Semgrep with ${NUM} rules$`);
// "Semgrep errors: " 뒤가 비어 있는 줄(C4의 기대 상태)도 인식해야 하므로 본문은 선택적이다.
const ENGINE_ERRORS = /^Semgrep errors:(?: ([\s\S]*))?$/;
const SKIPPED_RULES = new RegExp(`^Semgrep skipped ${NUM} rules$`);
const SCANNED_FILES = new RegExp(`^Scanned ${NUM} files$`);
const FOUND_MATCHES = new RegExp(`^Found ${NUM} matches$`);

function toCount(digits: string): number | null {
  const n = Number(digits);
  return Number.isSafeInteger(n) ? n : null;
}

/** 매개변수를 뽑지 못하면(안전 정수 초과 등) 그 줄은 인식하지 않는다. */
function numeric<
  K extends "gotErrors" | "runningRules" | "skippedRules" | "scannedFiles" | "foundMatches",
>(key: K, param: string, digits: string): ClassifiedLine | null {
  const n = toCount(digits);
  if (n === null) return null;
  return { key, params: { [param]: n } } as unknown as ClassifiedLine;
}

function classifyMessage(message: string): ClassifiedLine | null {
  const simple = SIMPLE.get(message);
  if (simple !== undefined) return { key: simple, params: {} };

  let m: RegExpExecArray | null;
  if ((m = GOT_ERRORS.exec(message))) return numeric("gotErrors", "count", m[1]);
  if ((m = LOADING.exec(message))) return { key: "loading", params: { path: m[1] } };
  if ((m = DONE_LOADING.exec(message))) return { key: "doneLoading", params: { path: m[1] } };
  if ((m = SKIPPING_RULE.exec(message))) {
    return { key: "skippingRule", params: { ruleId: m[1], error: m[2] } };
  }
  if ((m = DOWNLOAD.exec(message))) return { key: "download", params: { url: m[1] } };
  if ((m = RUNNING_RULES.exec(message))) return numeric("runningRules", "n", m[1]);
  if ((m = ENGINE_ERRORS.exec(message))) {
    return { key: "engineErrors", params: { text: m[1] ?? "" } };
  }
  if ((m = SKIPPED_RULES.exec(message))) return numeric("skippedRules", "s", m[1]);
  if ((m = SCANNED_FILES.exec(message))) return numeric("scannedFiles", "k", m[1]);
  if ((m = FOUND_MATCHES.exec(message))) return numeric("foundMatches", "m", m[1]);
  return null;
}

/**
 * stderr 한 줄을 키로 분류한다. 메시지 본문(fmt.extractMessage의 결과)이 표의 문자열과 **전체**
 * 일치할 때만 인식한다 — `Scanned workspace`는 `Scanning workspace complete`가 아니고,
 * `Scanning workspace, full: true`는 `Scanning workspace`가 아니다. 알 수 없는 줄, 주입된
 * extractMessage의 예외는 모두 null이다(필수 줄이 없으면 호출자가 그 부재를 사유로 만든다).
 */
export function classifyStderrLine(
  text: string,
  fmt: LogFormat = defaultLogFormat
): ClassifiedLine | null {
  let message: string;
  try {
    message = fmt.extractMessage(text);
  } catch {
    return null;
  }
  if (typeof message !== "string") return null;
  return classifyMessage(message);
}

/**
 * 로딩 쌍의 경로를 비교용으로 정규화한다: 역슬래시를 '/'로, 연속 구분자를 하나로.
 * 앞의 './'나 드라이브 문자는 건드리지 않는다 — 실제 형식이 미확인(U3)이라 추측하지 않고,
 * 기대 경로와 다르면 LOADING_PAIR_UNEXPECTED로 드러나게 둔다.
 */
export function normalizeLoadingPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
}
