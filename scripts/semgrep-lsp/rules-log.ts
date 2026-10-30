// LSP-RULES-1용 stderr 판독기(순수 모듈). 파일·프로세스·시계·네트워크를 만지지 않는다.
//
// 기존 log-matcher.ts는 "줄 전체가 메시지 본문"이라는 가정이라 실제 머리말(`[00.11][DEBUG](default): …`)이 붙은 줄을 하나도 읽지 못한다.
// 그쪽은 평가기(evaluate.ts)가 쓰므로 바꾸지 않고, 이 모듈이 머리말을 벗기는 쪽을 맡는다. 메시지 본문의 분류는 log-matcher의 분류기를
// 그대로 재사용하고(같은 키·같은 정규식), 이 단계에서 새로 필요한 키만 더한다.
//
// 실제 stderr(LSP-MIN-1, 6,244 B)에서 확인한 형태 — 이 판독기가 맞춰진 사실:
//   · 줄 끝은 CRLF다.
//   · 머리말은 `[초.소수][수준](태그)(출처): 본문`이다. DEBUG는 `(default)` 태그가 붙고, App 수준 줄(`Server initialized` 등)은 머리말이 없다.
//   · 한 로그 항목의 본문이 여러 줄이다: `Handling request:` 뒤의 JSON, `Sending response {` 뒤의 JSON, `Initialized server with session:` 뒤의
//     세션 덤프, 안내문 배너(빈 첫 줄, `...` 줄, URL). 이어지는 줄에는 머리말이 없다.
//   · 머리말 없는 App 수준 줄이 JSON 블록이 닫힌 바로 뒤에 나온다(`}` 다음 줄에 `Initializing server`).
//
// 그래서 줄을 이렇게 나눈다(상태 기계, 바이트 단위):
//   1. 머리말 모양(`[숫자`로 시작)인 줄은 언제나 새 항목의 시작이다. 해석에 실패하거나 수준이 DEBUG/INFO/WARNING/ERROR가 아니면 "머리말 해석 불가"로
//      세고 신호로 쓰지 않는다.
//   2. 머리말 없는 줄이 열린 괄호 블록 안(`{ [` 깊이 > 0, 문자열 안의 괄호는 세지 않는다)이면 덤프의 일부다. 독립 신호로 보지 않는다.
//   3. 블록 밖의 머리말 없는 줄이 알려진 메시지와 전체 일치하면 그것이 독립 항목(App 수준 신호)이다.
//   4. 그 밖의 머리말 없는 줄은 직전 항목의 이어지는 줄이다. 직전 항목의 본문이 `:`로 끝났으면 블록의 시작으로 보고 괄호 깊이를 센다.
//      직전 항목이 없으면 "고아 줄"로 센다.
// 신호로 쓰이는 것은 항목의 **첫 줄 본문**뿐이다. 이어지는 줄 안에 신호 문구와 같은 텍스트가 있어도 세지 않는다(`embeddedSignalText`로만 센다).
//
// 한계(미확인): INFO·WARNING 머리말 형태와 아래 새 키의 정확한 문구는 이 바이너리에서 한 번도 관측되지 않았다(소스 읽기에서 도출). 문구나 수준이
// 다르면 신호가 안 보이거나 "형태 불일치"로 남고, 판정은 NOT_CONFIRMED로 끝난다 — 성공으로 보정하지 않는다.
//
// 공개 API:
//   parseHeader(line): ParsedHeader | { malformed: string } | null     머리말 한 줄 해석(머리말 모양이 아니면 null)
//   classifyRulesMessage(message): { key, params } | null              본문 분류(log-matcher + 이 단계의 새 키)
//   RulesLogScanner                                                    바이트 청크를 먹이고 새 신호를 받는다
//   analyzeRulesLog(bytes): RulesLogAnalysis                           전체 바이트의 사후 해석(실시간 경로와 같은 상태 기계)
//   FORBIDDEN_SCAN_KEYS / FORBIDDEN_NETWORK_KEYS / REQUIRED_BARE_KEYS

import { classifyStderrLine, normalizeLoadingPath, type ClassifiedLine } from "./log-matcher";

export type LogLevel = "DEBUG" | "INFO" | "WARNING" | "ERROR";
const LEVELS: readonly LogLevel[] = ["DEBUG", "INFO", "WARNING", "ERROR"];

export interface LogHeader {
  seconds: string;
  level: LogLevel;
  /** DEBUG 항목의 첫 괄호(`(default)`). 다른 수준은 null이다. */
  tag: string | null;
  /** 기본이 아닌 로그 출처(`(semgrep.parsing)`). 없으면 null이다. */
  source: string | null;
  /** 머리말 뒤의 본문(첫 줄). */
  message: string;
}

export type HeaderResult = ({ malformed?: undefined } & LogHeader) | { malformed: string };

const HEADER_LIKE = /^\[\d/;
const HEADER = /^\[(\d+(?:\.\d+)?)\]\[([A-Za-z]+)\]((?:\([^()]*\))*): ?([\s\S]*)$/;

/** 줄이 머리말 모양이 아니면 null. 모양이면 해석하고, 해석할 수 없거나 알 수 없는 수준이면 `{ malformed }`. */
export function parseHeader(line: string): HeaderResult | null {
  if (!HEADER_LIKE.test(line)) return null;
  const m = HEADER.exec(line);
  if (m === null) return { malformed: "HEADER_SHAPE" };
  const level = m[2] as LogLevel;
  if (!LEVELS.includes(level)) return { malformed: "HEADER_LEVEL" };
  const parens = [...m[3].matchAll(/\(([^()]*)\)/g)].map((x) => x[1]);
  let tag: string | null = null;
  let source: string | null = null;
  if (level === "DEBUG") {
    if (parens.length > 2) return { malformed: "HEADER_PARENS" };
    tag = parens[0] ?? null;
    source = parens[1] ?? null;
  } else {
    if (parens.length > 1) return { malformed: "HEADER_PARENS" };
    source = parens[0] ?? null;
  }
  return { seconds: m[1], level, tag, source, message: m[4] };
}

// ── 키 ────────────────────────────────────────────────────────────

export type RulesLogKey =
  // 필요한 신호
  | "refreshingRules"
  | "rulesRefreshed"
  | "scanningOpenDocuments"
  | "scannedOpenDocuments"
  | "loading"
  | "doneLoading"
  | "gotErrors"
  | "noTargets"
  | "ciDisabled"
  // 로딩 실패·규칙 없음을 말하는 신호
  | "noRules"
  | "rulesNotLoaded"
  | "skippingRule"
  // 이 단계에서 나오면 안 되는 신호: 스캔·엔진
  | "scanningWorkspace"
  | "scannedWorkspace"
  | "scanningWorkspaceComplete"
  | "fullScan"
  | "scanningSingleFile"
  | "runningRules"
  | "engineErrors"
  | "skippedRules"
  | "scannedFiles"
  | "foundMatches"
  // 이 단계에서 나오면 안 되는 신호: 네트워크·토큰·설정 파일
  | "usingAuto"
  | "download"
  | "tokenFound"
  | "settingsFileFound"
  // 무해한 알려진 줄
  | "tokenBenign"
  | "lifecycle"
  // 머리말 수준에서 정해지는 것
  | "errorRecord"
  | "unexpectedWarning";

/** 맨줄(App 수준)이어야 하는 필요한 신호 4개. 순서가 이 배열의 순서다. */
export const REQUIRED_BARE_KEYS = [
  "refreshingRules",
  "rulesRefreshed",
  "scanningOpenDocuments",
  "scannedOpenDocuments",
] as const;

/** 스캔·엔진·작업 영역 신호: `initialized` 뒤에도 나오면 안 된다(A1′). */
export const FORBIDDEN_SCAN_KEYS: readonly RulesLogKey[] = Object.freeze([
  "scanningWorkspace",
  "scannedWorkspace",
  "scanningWorkspaceComplete",
  "fullScan",
  "scanningSingleFile",
  "runningRules",
  "engineErrors",
  "skippedRules",
  "scannedFiles",
  "foundMatches",
]);

/** 레지스트리·내려받기·토큰·설정 파일 신호(A2′). */
export const FORBIDDEN_NETWORK_KEYS: readonly RulesLogKey[] = Object.freeze([
  "usingAuto",
  "download",
  "tokenFound",
  "settingsFileFound",
]);

/** `initialized` 송신 전에 나오면 안 되는 새로고침·열린 문서 스캔 신호. */
export const PRE_INITIALIZED_KEYS: readonly RulesLogKey[] = Object.freeze([
  "refreshingRules",
  "rulesRefreshed",
  "scanningOpenDocuments",
  "scannedOpenDocuments",
]);

/** 키가 어떤 모양으로 나와야 하는가. "any"는 모양과 상관없이 같은 뜻이다(나오면 안 되는 신호). */
type Form = "bare" | "INFO" | "WARNING" | "DEBUG|INFO" | "any";

const FORM: Record<RulesLogKey, Form> = {
  refreshingRules: "bare",
  rulesRefreshed: "bare",
  scanningOpenDocuments: "bare",
  scannedOpenDocuments: "bare",
  loading: "INFO",
  doneLoading: "INFO",
  gotErrors: "INFO",
  noTargets: "WARNING",
  ciDisabled: "DEBUG|INFO",
  noRules: "WARNING",
  rulesNotLoaded: "bare",
  skippingRule: "any",
  scanningWorkspace: "any",
  scannedWorkspace: "any",
  scanningWorkspaceComplete: "any",
  fullScan: "any",
  scanningSingleFile: "any",
  runningRules: "any",
  engineErrors: "any",
  skippedRules: "any",
  scannedFiles: "any",
  foundMatches: "any",
  usingAuto: "any",
  download: "any",
  tokenFound: "any",
  settingsFileFound: "any",
  tokenBenign: "any",
  lifecycle: "bare",
  errorRecord: "any",
  unexpectedWarning: "any",
};

export interface RulesSignal {
  key: RulesLogKey;
  params: Record<string, unknown>;
  /** 머리말 수준. 머리말이 없으면(App 수준) null. */
  level: LogLevel | null;
  tag: string | null;
  source: string | null;
  /** 줄이 시작한 바이트 위치(스트림 처음부터). */
  byteOffset: number;
  /** 몇 번째 항목인가(0부터). */
  recordIndex: number;
  /** 키가 기대하는 모양(머리말 유무·수준)과 같은가. */
  shape: "OK" | "SHAPE_MISMATCH";
}

// ── 본문 분류 ─────────────────────────────────────────────────────

const NO_TARGETS = "No targets to scan! Not scanning anything.";
const NO_RULES = "No rules to run! Not scanning anything.";
const TOKEN_BENIGN = new Set([
  "Checking for API token in environment variables",
  "No API token found in environment variables",
  "No settings file found, using default settings",
]);
const LIFECYCLE = new Set([
  "Starting legacy language server",
  "Initializing server",
  "Caching workspace targets",
  "Finished caching workspace targets",
  "Server initialized",
  "Shutting down server",
  "Server stopped",
]);
// 문구가 소스에서 도출한 것이라 접두어로만 본다(정확한 전문은 미관측).
const RULES_NOT_LOADED = /^Rules not loaded yet/i;
const TOKEN_FOUND = /^Found API token/i;
const SETTINGS_FILE_FOUND = /^Settings file found/i;
const USING_AUTO = /\busing auto\b/i;

export interface MessageClass {
  key: RulesLogKey;
  params: Record<string, unknown>;
}

/** 본문(머리말을 벗긴 첫 줄)을 키로 분류한다. 알 수 없으면 null. 기존 분류기를 먼저 쓰고 이 단계의 새 키를 더한다. */
export function classifyRulesMessage(message: string): MessageClass | null {
  const text = message.trim();
  if (text === NO_TARGETS) return { key: "noTargets", params: {} };
  if (text === NO_RULES) return { key: "noRules", params: {} };
  if (TOKEN_BENIGN.has(text)) return { key: "tokenBenign", params: {} };
  if (LIFECYCLE.has(text)) return { key: "lifecycle", params: {} };
  if (RULES_NOT_LOADED.test(text)) return { key: "rulesNotLoaded", params: {} };
  if (TOKEN_FOUND.test(text)) return { key: "tokenFound", params: {} };
  if (SETTINGS_FILE_FOUND.test(text)) return { key: "settingsFileFound", params: {} };
  const base: ClassifiedLine | null = classifyStderrLine(text);
  if (base !== null) {
    const key: RulesLogKey = base.key === "barrier" ? "scanningWorkspaceComplete" : base.key;
    return { key, params: { ...base.params } };
  }
  // "No rules source specified, using auto"의 표현이 달라도 `using auto`가 보이면 레지스트리로 넘어간 것으로 본다(fail-closed).
  if (USING_AUTO.test(text)) return { key: "usingAuto", params: {} };
  return null;
}

function shapeOf(key: RulesLogKey, level: LogLevel | null): "OK" | "SHAPE_MISMATCH" {
  const form = FORM[key];
  if (form === "any") return "OK";
  if (form === "bare") return level === null ? "OK" : "SHAPE_MISMATCH";
  if (level === null) return "SHAPE_MISMATCH";
  if (form === "DEBUG|INFO") return level === "DEBUG" || level === "INFO" ? "OK" : "SHAPE_MISMATCH";
  return form === level ? "OK" : "SHAPE_MISMATCH";
}

// ── 괄호 깊이 ─────────────────────────────────────────────────────

/** 한 줄이 괄호 깊이를 얼마나 바꾸는가. 문자열(큰따옴표 안, 백슬래시 이스케이프 포함) 안의 괄호는 세지 않는다. 문자열은 줄을 넘지 않는다고 본다. */
export function bracketDelta(line: string): number {
  let delta = 0;
  let inString = false;
  let escaped = false;
  for (const ch of line) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") delta += 1;
    else if (ch === "}" || ch === "]") delta -= 1;
  }
  return delta;
}

// ── 스캐너 ────────────────────────────────────────────────────────

export interface RulesLogCounters {
  /** 줄 수(마지막 덜 온 줄 제외). */
  lines: number;
  records: number;
  headedRecords: number;
  bareRecords: number;
  /** 머리말 모양이지만 해석하지 못한 줄(알 수 없는 수준 포함). */
  malformedHeaders: number;
  /** 항목 없이 나온 머리말 없는 줄(알려진 메시지도 아니고 이어질 항목도 없다). */
  orphanBareLines: number;
  /** 블록 안이나 이어지는 줄에서 알려진 신호 문구와 같은 텍스트가 나온 횟수. 신호로 세지 않는다. */
  embeddedSignalText: number;
  /** 키로 분류되지 않은 머리말 항목 수(수준별). ERROR는 신호(errorRecord)가 되므로 여기 없다. */
  unclassifiedInfo: number;
  unclassifiedDebug: number;
  partialTail: boolean;
  totalBytes: number;
}

interface Current {
  index: number;
  pendingBlock: boolean;
  depth: number;
  /** 이 항목의 열린 블록 안에서 알려진 신호 문구로 분류된 줄의 키(신호로는 세지 않는다). 끝까지 열려 있는 블록을 판정할 때만 쓴다. */
  embeddedKeys: RulesLogKey[];
}

export class RulesLogScanner {
  private carry: number[] = [];
  /** 아직 개행이 오지 않은 줄이 시작한 스트림 위치. */
  private carryStart = 0;
  private readonly signalsOut: RulesSignal[] = [];
  private current: Current | null = null;
  private recordCount = 0;
  private readonly c: RulesLogCounters = {
    lines: 0,
    records: 0,
    headedRecords: 0,
    bareRecords: 0,
    malformedHeaders: 0,
    orphanBareLines: 0,
    embeddedSignalText: 0,
    unclassifiedInfo: 0,
    unclassifiedDebug: 0,
    partialTail: false,
    totalBytes: 0,
  };

  get signals(): readonly RulesSignal[] {
    return this.signalsOut;
  }
  get counters(): Readonly<RulesLogCounters> {
    return this.c;
  }
  /**
   * 지금(보통 스트림 끝) 괄호 블록이 열려 있는가. 끝까지 닫히지 않은 블록은 뒤따르는 맨줄을 전부 "덤프의 일부"로 삼켜 신호로 읽히지 않게 하므로,
   * 호출자는 이것을 "로그 모양을 읽지 못함"으로 다뤄야 한다. 카운터·신호에는 넣지 않는다(골든 출력 불변).
   */
  get openBlockAtEnd(): boolean {
    return this.current !== null && this.current.depth > 0;
  }
  /** 끝까지 열려 있는 블록이 삼킨 줄 중 알려진 신호 문구로 분류된 것의 키. 열린 블록이 없으면 빈 배열. */
  get openBlockEmbeddedKeys(): RulesLogKey[] {
    return this.current !== null && this.current.depth > 0 ? [...this.current.embeddedKeys] : [];
  }

  /** 새 청크를 먹이고, 이번에 새로 나온 신호를 돌려준다. 줄은 개행(LF)이 온 뒤에야 처리한다. */
  push(chunk: Uint8Array): RulesSignal[] {
    const before = this.signalsOut.length;
    const base = this.c.totalBytes;
    this.c.totalBytes += chunk.byteLength;
    for (let i = 0; i < chunk.length; i += 1) {
      const byte = chunk[i];
      if (byte === 0x0a) {
        this.line(this.carry, this.carryStart);
        this.carry = [];
        this.carryStart = base + i + 1;
      } else {
        this.carry.push(byte);
      }
    }
    return this.signalsOut.slice(before);
  }

  /** 스트림이 끝났다: 개행 없는 마지막 줄도 처리한다. */
  end(): RulesSignal[] {
    const before = this.signalsOut.length;
    if (this.carry.length > 0) {
      this.c.partialTail = true;
      this.line(this.carry, this.carryStart);
      this.carry = [];
    }
    return this.signalsOut.slice(before);
  }

  private pushSignal(
    cls: MessageClass,
    header: LogHeader | null,
    byteOffset: number,
    recordIndex: number
  ): void {
    const level = header === null ? null : header.level;
    this.signalsOut.push({
      key: cls.key,
      params: cls.params,
      level,
      tag: header === null ? null : header.tag,
      source: header === null ? null : header.source,
      byteOffset,
      recordIndex,
      shape: shapeOf(cls.key, level),
    });
  }

  private newRecord(): number {
    const index = this.recordCount;
    this.recordCount += 1;
    this.c.records += 1;
    return index;
  }

  private line(bytes: number[], byteOffset: number): void {
    this.c.lines += 1;
    const raw = new TextDecoder("utf-8", { fatal: false, ignoreBOM: true }).decode(
      Uint8Array.from(bytes)
    );
    const text = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    const header = parseHeader(text);
    if (header !== null) return this.headedLine(header, byteOffset);
    this.bareLine(text, byteOffset);
  }

  private headedLine(parsed: HeaderResult, byteOffset: number): void {
    if (parsed.malformed !== undefined) {
      // 머리말처럼 보이지만 읽지 못한 줄: 새 항목처럼 블록을 끊되 신호로는 쓰지 않는다.
      this.c.malformedHeaders += 1;
      this.current = null;
      return;
    }
    const header: LogHeader = parsed;
    const index = this.newRecord();
    this.c.headedRecords += 1;
    this.current = {
      index,
      pendingBlock: header.message.trimEnd().endsWith(":"),
      depth: Math.max(0, bracketDelta(header.message)),
      embeddedKeys: [],
    };
    const cls = classifyRulesMessage(header.message);
    if (cls !== null) this.pushSignal(cls, header, byteOffset, index);
    // ERROR 수준 항목은 본문이 알려진 키여도 오류 기록이다(성공으로 읽지 않는다).
    if (header.level === "ERROR") {
      this.pushSignal(
        { key: "errorRecord", params: { message: header.message } },
        header,
        byteOffset,
        index
      );
    } else if (cls !== null) {
      // 위에서 처리했다.
    } else if (header.level === "WARNING") {
      this.pushSignal(
        { key: "unexpectedWarning", params: { message: header.message } },
        header,
        byteOffset,
        index
      );
    } else if (header.level === "INFO") {
      this.c.unclassifiedInfo += 1;
    } else {
      this.c.unclassifiedDebug += 1;
    }
  }

  private bareLine(text: string, byteOffset: number): void {
    const cur = this.current;
    // 열린 괄호 블록 안: 덤프의 일부다.
    if (cur !== null && cur.depth > 0) {
      const embedded = classifyRulesMessage(text);
      if (embedded !== null) {
        this.c.embeddedSignalText += 1;
        cur.embeddedKeys.push(embedded.key);
      }
      cur.depth = Math.max(0, cur.depth + bracketDelta(text));
      return;
    }
    // 블록 밖에서 알려진 메시지와 전체 일치: 독립 항목(App 수준 신호).
    const cls = text.trim() === "" ? null : classifyRulesMessage(text);
    if (cls !== null) {
      const index = this.newRecord();
      this.c.bareRecords += 1;
      this.current = { index, pendingBlock: false, depth: 0, embeddedKeys: [] };
      this.pushSignal(cls, null, byteOffset, index);
      return;
    }
    // 나머지: 직전 항목의 이어지는 줄.
    if (cur === null) {
      if (text.trim() !== "") this.c.orphanBareLines += 1;
      return;
    }
    if (cur.pendingBlock && text.trim() !== "") {
      cur.pendingBlock = false;
      cur.depth = Math.max(0, bracketDelta(text));
    }
  }
}

// ── 사후 해석 ─────────────────────────────────────────────────────

export interface RulesLogAnalysis {
  signals: RulesSignal[];
  counters: RulesLogCounters;
  /** 스트림 끝에서 괄호 블록이 아직 열려 있었는가(뒤의 맨줄이 삼켜졌을 수 있다). 카운터·신호가 아니다: 골든 출력에 들어가지 않는다. */
  openBlockAtEnd: boolean;
  /** 끝까지 열려 있던 블록이 삼킨 줄 중 알려진 신호 문구로 분류된 것의 키. */
  openBlockEmbeddedKeys: RulesLogKey[];
}

/** 전체 바이트를 실시간 경로와 같은 상태 기계로 해석한다. */
export function analyzeRulesLog(bytes: Uint8Array): RulesLogAnalysis {
  const scanner = new RulesLogScanner();
  scanner.push(bytes);
  scanner.end();
  return {
    signals: [...scanner.signals],
    counters: { ...scanner.counters },
    openBlockAtEnd: scanner.openBlockAtEnd,
    openBlockEmbeddedKeys: scanner.openBlockEmbeddedKeys,
  };
}

/** 로딩 줄의 경로를 비교용으로 정규화한다(구분자 통일, 소문자: Windows 경로는 대소문자를 구별하지 않는다). */
export function comparableLoadingPath(path: string): string {
  return normalizeLoadingPath(path).toLowerCase();
}
