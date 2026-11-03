// LSP-SCAN-1 단일 파일 스캔 경로의 stderr 판독기(순수 모듈). 파일·프로세스·시계·네트워크를 만지지 않는다.
//
// rules-log.ts(LSP-RULES-1)의 머리말 해석(`parseHeader`)·본문 분류(`classifyRulesMessage`)·괄호 블록 처리(`bracketDelta`)를 그대로 가져다 쓰고,
// 그 위에 이 단계에서 필요한 것만 더한다:
//   · 줄마다 바이트 구간(첫 바이트, 줄 끝 다음)을 기록하고, `didOpen` 송신 시점의 stderr 바이트 위치로 두 구간을 나눈다(줄의 **첫 바이트**가 소속을 정한다).
//   · 단일 파일 스캔 경로의 문구(`Scanned single file`, `Scanning N targets`, `Found N matches before processing`, `Running external command: …`,
//     `error output: …`, 대상이 아니라는 DEBUG 줄)를 분류한다. 정확한 문구는 공개 소스(Legacy_scan_helpers.ml 61-184, 282-314)에서 도출했다.
//   · 사후 구간의 필수 묶음(9줄)을 각 정확히 한 번, 스트림 안의 순서대로 확인한다. 스트림 사이의 순서는 말하지 않는다(브리프 4절).
//   · 외부 명령 시도 줄을 D3의 정확한 모양(`"git" "-C" "<작업 영역>" "rev-parse" "--show-toplevel"`)으로만 받는다. 부분 문자열 검사는 하지 않는다.
//
// 이 모듈은 줄을 해석할 뿐 판정하지 않는다. 건수 부족(사후 시도 줄이 없음 등)은 문제로 올리지 않고 숫자만 돌려준다(부족 판단은 판정 모듈의 몫).
// 결과는 평범한 JSON 값이다(골든 대조·PowerShell 이식용).
//
// 사후 필수 묶음(스트림 안의 순서):
//   Scanning single file(맨줄) → [외부 명령 시도(INFO)] → Scanning 1 targets(INFO) → Running Semgrep with 1 rules(DEBUG) → Found 1 matches before processing(INFO)
//   → Semgrep errors: (맨줄, 빈 목록) → Semgrep skipped 0 rules(맨줄) → Scanned 1 files(맨줄) → Found 1 matches(맨줄)
//   `Scanned single file`(맨줄)은 비동기 작업을 **만들기만 한** 시점에 찍히므로 순서의 기준도 완료 신호도 아니다: `Scanning single file` 뒤 어디에 있어도 된다.
//
// 한계(미확인): 위 문구와 순서는 소스에서 도출한 것이고 이 바이너리에서 한 번도 관측되지 않았다. 다르면 묶음이 완성되지 않고 판정은 NOT_CONFIRMED 로 끝난다.

import {
  bracketDelta,
  classifyRulesMessage,
  parseHeader,
  type HeaderResult,
  type LogHeader,
  type LogLevel,
  type RulesLogKey,
} from "./rules-log";

export type ScanLogKey =
  | RulesLogKey
  | "scannedSingleFile"
  | "scanningTargets"
  | "foundMatchesBefore"
  | "externalCommand"
  | "errorOutput"
  | "fileNotInTargets";

export type ScanSegment = "PRE_OPEN" | "POST_OPEN";

/** 사후 필수 묶음의 줄. 이 순서로 보고한다(`missing` 등). */
export const SCAN_BUNDLE_KEYS: readonly ScanLogKey[] = Object.freeze([
  "scanningSingleFile",
  "scannedSingleFile",
  "scanningTargets",
  "runningRules",
  "foundMatchesBefore",
  "engineErrors",
  "skippedRules",
  "scannedFiles",
  "foundMatches",
]);

/** 스트림 안의 순서 기준(`Scanned single file`은 기준이 아니다). */
const ORDER_KEYS: readonly ScanLogKey[] = Object.freeze([
  "scanningSingleFile",
  "scanningTargets",
  "runningRules",
  "foundMatchesBefore",
  "engineErrors",
  "skippedRules",
  "scannedFiles",
  "foundMatches",
]);

/** `didOpen` 송신 전에 나오면 안 되는 스캔 증거 모양의 줄. */
export const SCAN_EVIDENCE_KEYS: readonly ScanLogKey[] = Object.freeze([
  ...SCAN_BUNDLE_KEYS,
  "fileNotInTargets",
]);

// ── 본문 분류 ─────────────────────────────────────────────────────

const NUM = "(0|[1-9][0-9]*)";
const SCANNING_TARGETS = new RegExp(`^Scanning ${NUM} targets$`);
const MATCHES_BEFORE = new RegExp(`^Found ${NUM} matches before processing$`);
// `Fpath.pp`가 찍는 경로가 들어간다. OCaml 문자열 이음(`\` 줄 바꿈)이 공백 하나를 남기므로 문구는 한 줄이다.
const FILE_NOT_IN_TARGETS =
  /^File .+ is not in the session targets recalculating targets just in case$/;
const EXTERNAL_PREFIX = "Running external command:";
const ERROR_OUTPUT_PREFIX = "error output:";

export interface ScanMessageClass {
  key: ScanLogKey;
  params: Record<string, unknown>;
}

function toCount(digits: string): number | null {
  const n = Number(digits);
  return Number.isSafeInteger(n) ? n : null;
}

/** 본문(머리말을 벗긴 첫 줄)을 키로 분류한다. 이 단계의 새 문구를 먼저 보고, 나머지는 rules-log 분류기에 맡긴다. 알 수 없으면 null. */
export function classifyScanMessage(message: string): ScanMessageClass | null {
  const text = message.trim();
  if (text === "Scanned single file") return { key: "scannedSingleFile", params: {} };
  let m: RegExpExecArray | null;
  if ((m = SCANNING_TARGETS.exec(text))) {
    const n = toCount(m[1]);
    if (n !== null) return { key: "scanningTargets", params: { n } };
  }
  if ((m = MATCHES_BEFORE.exec(text))) {
    const n = toCount(m[1]);
    if (n !== null) return { key: "foundMatchesBefore", params: { m: n } };
  }
  if (text.startsWith(EXTERNAL_PREFIX)) {
    return { key: "externalCommand", params: { rest: text.slice(EXTERNAL_PREFIX.length) } };
  }
  if (text.startsWith(ERROR_OUTPUT_PREFIX)) return { key: "errorOutput", params: {} };
  if (FILE_NOT_IN_TARGETS.test(text)) return { key: "fileNotInTargets", params: {} };
  const base = classifyRulesMessage(message);
  return base === null ? null : { key: base.key, params: { ...base.params } };
}

type Form = "bare" | "INFO" | "WARNING" | "DEBUG" | "DEBUG|INFO" | "any";
// 장벽 구간의 키는 rules-log.ts 의 FORM 표와 같다(시험이 같은 로그에서 모양이 같음을 대조한다). 스캔 경로의 키는 소스의 Logs.app/info/debug 호출에 맞춘다.
const FORM: Partial<Record<ScanLogKey, Form>> = {
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
  lifecycle: "bare",
  scanningSingleFile: "bare",
  scannedSingleFile: "bare",
  scanningTargets: "INFO",
  runningRules: "DEBUG",
  foundMatchesBefore: "INFO",
  engineErrors: "bare",
  skippedRules: "bare",
  scannedFiles: "bare",
  foundMatches: "bare",
  externalCommand: "INFO",
  errorOutput: "INFO",
  fileNotInTargets: "DEBUG",
};

function shapeOf(key: ScanLogKey, level: LogLevel | null): "OK" | "SHAPE_MISMATCH" {
  const form = FORM[key] ?? "any";
  if (form === "any") return "OK";
  if (form === "bare") return level === null ? "OK" : "SHAPE_MISMATCH";
  if (level === null) return "SHAPE_MISMATCH";
  if (form === "DEBUG|INFO") return level === "DEBUG" || level === "INFO" ? "OK" : "SHAPE_MISMATCH";
  return form === level ? "OK" : "SHAPE_MISMATCH";
}

// ── 외부 명령 시도 줄 ─────────────────────────────────────────────

export type ExternalCommandShape =
  "OK" | "BAD_LEVEL" | "BAD_TOKENS" | "BAD_COMMAND" | "BAD_ARGS" | "BAD_WORKSPACE";
export type ExternalCommandWindow = "BARRIER" | "SCAN" | "OTHER";

const FIVE_TOKENS = /^"([^"]*)" "([^"]*)" "([^"]*)" "([^"]*)" "([^"]*)"$/;
const DRIVE_PATH = /^[A-Za-z]:\\/;

/**
 * 로그의 작업 영역 경로가 설정된 작업 영역 폴더와 같은가(결정 D3). 좁게 정한다:
 *  · 설정된 경로는 구분자를 `\`로 통일해 비교한다. 로그의 경로는 **`\`만** 쓰고 `/`가 있으면 다른 경로다(LSP-RULES-1 stderr:227 이 `\`를 보여 준다).
 *  · 드라이브 문자(첫 글자)만 대소문자를 무시한다(서버가 `rootUri`의 `c%3A`를 디코딩해 소문자로 찍는다). 나머지는 서수 비교다.
 *  · 끝 구분자, 하위 폴더, 접두만 같은 경로, 빈 경로는 모두 다른 경로다.
 */
export function workspacePathMatches(logPath: string, configured: string | null): boolean {
  if (configured === null) return false;
  const want = configured.replace(/\//g, "\\");
  if (!DRIVE_PATH.test(want) || !DRIVE_PATH.test(logPath) || logPath.includes("/")) return false;
  return want[0].toLowerCase() + want.slice(1) === logPath[0].toLowerCase() + logPath.slice(1);
}

/** 외부 명령 INFO 줄의 본문(접두 뒤)을 정확한 모양으로만 받는다. */
export function externalCommandShape(
  level: LogLevel | null,
  rest: string,
  workspace: string | null
): ExternalCommandShape {
  if (level !== "INFO") return "BAD_LEVEL";
  if (!rest.startsWith(" ")) return "BAD_TOKENS";
  const m = FIVE_TOKENS.exec(rest.slice(1));
  if (m === null) return "BAD_TOKENS";
  if (m[1] !== "git") return "BAD_COMMAND";
  if (m[2] !== "-C" || m[4] !== "rev-parse" || m[5] !== "--show-toplevel") return "BAD_ARGS";
  return workspacePathMatches(m[3], workspace) ? "OK" : "BAD_WORKSPACE";
}

// ── 결과 모양 ─────────────────────────────────────────────────────

export interface ScanLogLine {
  /** 몇 번째 항목인가(0부터). */
  index: number;
  startByte: number;
  /** 줄 끝(LF) 다음 위치. 개행 없는 마지막 줄은 스트림 끝. */
  endByte: number;
  terminated: boolean;
  segment: ScanSegment;
  level: LogLevel | null;
  key: ScanLogKey;
  shape: "OK" | "SHAPE_MISMATCH";
  params: Record<string, unknown>;
}

export type ScanLogExtraKind =
  | "DUPLICATE_LINE"
  | "WORKSPACE_SCAN"
  | "OPEN_DOCUMENTS_SCAN"
  | "RULES_REFRESH"
  | "NO_TARGETS"
  | "NO_RULES"
  | "RULES_NOT_LOADED"
  | "ERROR_RECORD"
  | "UNEXPECTED_WARNING"
  | "SKIPPING_RULE"
  | "FORBIDDEN_NETWORK"
  | "ERROR_OUTPUT"
  | "FILE_NOT_IN_TARGETS"
  | "ENGINE_ERRORS_NONEMPTY"
  | "SKIPPED_RULES_NONZERO";

export interface ScanLogExtra {
  kind: ScanLogExtraKind;
  key: ScanLogKey;
  segment: ScanSegment;
  startByte: number;
  endByte: number;
}

export interface ScanKeyCount {
  ok: number;
  mismatch: number;
}

export interface ScanBundleNumbers {
  targets: number | null;
  rules: number | null;
  matchesBefore: number | null;
  skipped: number | null;
  scanned: number | null;
  matches: number | null;
  errorsText: string | null;
}

export interface ScanBundle {
  /** 아홉 줄이 모두 정확히 한 번(모양·줄 끝 정상)이고 스트림 안의 순서가 맞다. */
  complete: boolean;
  /** 아홉 줄이 모두 한 번 이상 보였다(중복·순서 위반이 있어도). 완료 시각 계산에 쓴다. */
  seenAll: boolean;
  missing: ScanLogKey[];
  orderViolations: string[];
  /** 각 줄의 **처음** 모습 중 가장 늦은 줄의 끝(LF 다음) 바이트 위치. seenAll 이 아니면 null. */
  completeEndByte: number | null;
  numbers: ScanBundleNumbers;
}

export interface ExternalCommandAttempt {
  lineIndex: number;
  segment: ScanSegment;
  window: ExternalCommandWindow;
  shape: ExternalCommandShape;
  startByte: number;
  endByte: number;
}

export interface ScanLogCounters {
  lines: number;
  records: number;
  headedRecords: number;
  bareRecords: number;
  malformedHeaders: number;
  orphanBareLines: number;
  embeddedSignalText: number;
  unclassifiedInfo: number;
  unclassifiedDebug: number;
  partialTail: boolean;
  totalBytes: number;
}

export interface ScanLogAnalysis {
  didOpenOffset: number | null;
  /** 항목(머리말이 있거나 알려진 맨줄)의 첫 줄 중 키로 분류된 것. */
  lines: ScanLogLine[];
  counters: ScanLogCounters;
  openBlockAtEnd: boolean;
  openBlockEmbeddedKeys: ScanLogKey[];
  pre: {
    /** 사전 구간에 있는 스캔 증거 모양의 줄의 키(나온 순서). 하나라도 있으면 PRE_OPEN_EVIDENCE 다. */
    scanEvidence: ScanLogKey[];
    counts: Record<string, ScanKeyCount>;
    extras: ScanLogExtra[];
  };
  post: {
    counts: Record<string, ScanKeyCount>;
    extras: ScanLogExtra[];
    shapeMismatch: ScanLogKey[];
    bundle: ScanBundle;
  };
  externalCommand: {
    preCount: number;
    postCount: number;
    attempts: ExternalCommandAttempt[];
    shapeOk: boolean;
    /** EXTERNAL_COMMAND_SHAPE · EXTERNAL_COMMAND_COUNT · EXTERNAL_COMMAND_OUT_OF_PHASE. 건수 부족은 여기에 없다. */
    problems: string[];
  };
}

export interface ScanLogOptions {
  /** 설정된 작업 영역 폴더(외부 명령 경로 비교용). null 이면 경로를 확인할 수 없으므로 모양 불일치다. */
  workspace: string | null;
  /** `didOpen`을 쓰기 직전까지 읽은 stderr 바이트 수. null 이면 보내지 않았으므로 전부 사전 구간이다. */
  didOpenOffset: number | null;
}

// ── 스캐너 ────────────────────────────────────────────────────────

interface Current {
  index: number;
  key: ScanLogKey | null;
  line: ScanLogLine | null;
  pendingBlock: boolean;
  depth: number;
  embeddedKeys: ScanLogKey[];
}

const NETWORK_KEYS: readonly ScanLogKey[] = [
  "usingAuto",
  "download",
  "tokenFound",
  "settingsFileFound",
];
const WORKSPACE_KEYS: readonly ScanLogKey[] = [
  "scanningWorkspace",
  "scannedWorkspace",
  "scanningWorkspaceComplete",
  "fullScan",
];

class Scanner {
  readonly lines: ScanLogLine[] = [];
  readonly continuation = new Map<number, string>();
  readonly c: ScanLogCounters = {
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
  current: Current | null = null;
  private recordCount = 0;

  constructor(private readonly didOpenOffset: number | null) {}

  get openBlockAtEnd(): boolean {
    return this.current !== null && this.current.depth > 0;
  }
  get openBlockEmbeddedKeys(): ScanLogKey[] {
    return this.current !== null && this.current.depth > 0 ? [...this.current.embeddedKeys] : [];
  }

  run(bytes: Uint8Array): void {
    this.c.totalBytes = bytes.byteLength;
    let start = 0;
    for (let i = 0; i < bytes.length; i += 1) {
      if (bytes[i] === 0x0a) {
        this.line(bytes.subarray(start, i), start, i + 1, true);
        start = i + 1;
      }
    }
    if (start < bytes.length) {
      this.c.partialTail = true;
      this.line(bytes.subarray(start), start, bytes.length, false);
    }
  }

  private segmentOf(startByte: number): ScanSegment {
    return this.didOpenOffset !== null && startByte >= this.didOpenOffset
      ? "POST_OPEN"
      : "PRE_OPEN";
  }

  private push(
    cls: ScanMessageClass,
    header: LogHeader | null,
    startByte: number,
    endByte: number,
    terminated: boolean,
    index: number
  ): ScanLogLine {
    const level = header === null ? null : header.level;
    const line: ScanLogLine = {
      index,
      startByte,
      endByte,
      terminated,
      segment: this.segmentOf(startByte),
      level,
      key: cls.key,
      shape: shapeOf(cls.key, level),
      params: cls.params,
    };
    this.lines.push(line);
    return line;
  }

  private newRecord(): number {
    const index = this.recordCount;
    this.recordCount += 1;
    this.c.records += 1;
    return index;
  }

  private line(slice: Uint8Array, start: number, end: number, terminated: boolean): void {
    this.c.lines += 1;
    const raw = new TextDecoder("utf-8", { fatal: false, ignoreBOM: true }).decode(slice);
    const text = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    const header = parseHeader(text);
    if (header !== null) this.headed(header, start, end, terminated);
    else this.bare(text, start, end, terminated);
  }

  private headed(parsed: HeaderResult, start: number, end: number, terminated: boolean): void {
    if (parsed.malformed !== undefined) {
      this.c.malformedHeaders += 1;
      this.current = null;
      return;
    }
    const header: LogHeader = parsed;
    const index = this.newRecord();
    this.c.headedRecords += 1;
    const cur: Current = {
      index,
      key: null,
      line: null,
      pendingBlock: header.message.trimEnd().endsWith(":"),
      depth: Math.max(0, bracketDelta(header.message)),
      embeddedKeys: [],
    };
    this.current = cur;
    const cls = classifyScanMessage(header.message);
    if (cls !== null) {
      cur.key = cls.key;
      cur.line = this.push(cls, header, start, end, terminated, index);
    } else if (header.level === "ERROR") {
      cur.key = "errorRecord";
      cur.line = this.push(
        { key: "errorRecord", params: { message: header.message } },
        header,
        start,
        end,
        terminated,
        index
      );
    } else if (header.level === "WARNING") {
      cur.key = "unexpectedWarning";
      cur.line = this.push(
        { key: "unexpectedWarning", params: { message: header.message } },
        header,
        start,
        end,
        terminated,
        index
      );
    } else if (header.level === "INFO") {
      this.c.unclassifiedInfo += 1;
    } else {
      this.c.unclassifiedDebug += 1;
    }
  }

  private bare(text: string, start: number, end: number, terminated: boolean): void {
    const cur = this.current;
    // 열린 괄호 블록 안: 덤프의 일부다. 신호로 세지 않는다.
    if (cur !== null && cur.depth > 0) {
      const embedded = classifyScanMessage(text);
      if (embedded !== null) {
        this.c.embeddedSignalText += 1;
        cur.embeddedKeys.push(embedded.key);
      }
      cur.depth = Math.max(0, cur.depth + bracketDelta(text));
      return;
    }
    // 블록 밖에서 알려진 메시지와 전체 일치: 독립 항목(App 수준 신호).
    const cls = text.trim() === "" ? null : classifyScanMessage(text);
    if (cls !== null) {
      const index = this.newRecord();
      this.c.bareRecords += 1;
      const line = this.push(cls, null, start, end, terminated, index);
      this.current = {
        index,
        key: cls.key,
        line,
        pendingBlock: false,
        depth: 0,
        embeddedKeys: [],
      };
      return;
    }
    if (cur === null) {
      if (text.trim() !== "") this.c.orphanBareLines += 1;
      return;
    }
    if (cur.pendingBlock && text.trim() !== "") {
      cur.pendingBlock = false;
      cur.depth = Math.max(0, bracketDelta(text));
    }
    // `Semgrep errors:` 바로 뒤에 이어진 내용 있는 줄: 오류 내용이 다음 줄로 이어진 것이다.
    if (cur.key === "engineErrors" && cur.line !== null && text.trim() !== "") {
      if (!this.continuation.has(cur.line.index)) {
        this.continuation.set(cur.line.index, text.trim().slice(0, 200));
      }
    }
  }
}

// ── 해석 ──────────────────────────────────────────────────────────

function countsOf(
  lines: readonly ScanLogLine[],
  segment: ScanSegment
): Record<string, ScanKeyCount> {
  const out: Record<string, ScanKeyCount> = Object.create(null) as Record<string, ScanKeyCount>;
  for (const l of lines) {
    if (l.segment !== segment || !l.terminated) continue;
    const entry = (out[l.key] ??= { ok: 0, mismatch: 0 });
    if (l.shape === "OK") entry.ok += 1;
    else entry.mismatch += 1;
  }
  return { ...out };
}

function extraKindsOf(
  line: ScanLogLine,
  segment: ScanSegment,
  continuation: Map<number, string>
): ScanLogExtraKind[] {
  const out: ScanLogExtraKind[] = [];
  const key = line.key;
  const post = segment === "POST_OPEN";
  if (WORKSPACE_KEYS.includes(key)) out.push("WORKSPACE_SCAN");
  if (post && (key === "scanningOpenDocuments" || key === "scannedOpenDocuments")) {
    out.push("OPEN_DOCUMENTS_SCAN");
  }
  if (post && (key === "refreshingRules" || key === "rulesRefreshed")) out.push("RULES_REFRESH");
  if (post && key === "noTargets") out.push("NO_TARGETS");
  if (key === "noRules") out.push("NO_RULES");
  if (key === "rulesNotLoaded") out.push("RULES_NOT_LOADED");
  if (line.level === "ERROR" || key === "errorRecord") out.push("ERROR_RECORD");
  if (key === "unexpectedWarning") out.push("UNEXPECTED_WARNING");
  if (key === "skippingRule") out.push("SKIPPING_RULE");
  if (NETWORK_KEYS.includes(key)) out.push("FORBIDDEN_NETWORK");
  if (key === "errorOutput") out.push("ERROR_OUTPUT");
  if (post && key === "fileNotInTargets") out.push("FILE_NOT_IN_TARGETS");
  if (post && key === "engineErrors") {
    const text = String(line.params.text ?? "").trim();
    if (text !== "" || continuation.has(line.index)) out.push("ENGINE_ERRORS_NONEMPTY");
  }
  if (post && key === "skippedRules") {
    const s = line.params.s;
    if (typeof s === "number" && s >= 1) out.push("SKIPPED_RULES_NONZERO");
  }
  return out;
}

/** 로그 전체 바이트를 해석한다. 같은 바이트와 옵션이면 같은 결과다(시계·무작위 없음). */
export function analyzeScanLog(bytes: Uint8Array, options: ScanLogOptions): ScanLogAnalysis {
  const didOpenOffset =
    typeof options.didOpenOffset === "number" && Number.isFinite(options.didOpenOffset)
      ? options.didOpenOffset
      : null;
  const scanner = new Scanner(didOpenOffset);
  scanner.run(bytes);
  const lines = scanner.lines;
  const inSegment = (segment: ScanSegment): ScanLogLine[] =>
    lines.filter((l) => l.segment === segment);
  const pre = inSegment("PRE_OPEN");
  const post = inSegment("POST_OPEN");

  // 추가 항목
  const extrasOf = (segment: ScanSegment, list: ScanLogLine[]): ScanLogExtra[] => {
    const out: ScanLogExtra[] = [];
    const seen = new Map<ScanLogKey, number>();
    for (const l of list) {
      for (const kind of extraKindsOf(l, segment, scanner.continuation)) {
        out.push({ kind, key: l.key, segment, startByte: l.startByte, endByte: l.endByte });
      }
      if (segment === "POST_OPEN" && SCAN_BUNDLE_KEYS.includes(l.key) && l.shape === "OK") {
        const n = (seen.get(l.key) ?? 0) + 1;
        seen.set(l.key, n);
        if (n >= 2) {
          out.push({
            kind: "DUPLICATE_LINE",
            key: l.key,
            segment,
            startByte: l.startByte,
            endByte: l.endByte,
          });
        }
      }
    }
    return out.sort((a, b) => a.startByte - b.startByte);
  };

  // 사후 묶음
  const firstOk = new Map<ScanLogKey, ScanLogLine>();
  const occurrences = new Map<ScanLogKey, number>();
  for (const l of post) {
    if (!SCAN_BUNDLE_KEYS.includes(l.key)) continue;
    occurrences.set(l.key, (occurrences.get(l.key) ?? 0) + 1);
    if (l.shape === "OK" && l.terminated && !firstOk.has(l.key)) firstOk.set(l.key, l);
  }
  const missing = SCAN_BUNDLE_KEYS.filter((k) => !firstOk.has(k));
  const orderViolations: string[] = [];
  const present = ORDER_KEYS.filter((k) => firstOk.has(k));
  for (let i = 0; i + 1 < present.length; i += 1) {
    const a = firstOk.get(present[i]) as ScanLogLine;
    const b = firstOk.get(present[i + 1]) as ScanLogLine;
    if (a.startByte >= b.startByte) orderViolations.push(`ORDER:${present[i]}>${present[i + 1]}`);
  }
  const started = firstOk.get("scanningSingleFile");
  const scannedOne = firstOk.get("scannedSingleFile");
  if (
    started !== undefined &&
    scannedOne !== undefined &&
    scannedOne.startByte <= started.startByte
  ) {
    orderViolations.push("ORDER:scanningSingleFile>scannedSingleFile");
  }
  const seenAll = missing.length === 0;
  const exactlyOnce = SCAN_BUNDLE_KEYS.every((k) => occurrences.get(k) === 1);
  const completeEndByte = seenAll
    ? Math.max(...SCAN_BUNDLE_KEYS.map((k) => (firstOk.get(k) as ScanLogLine).endByte))
    : null;
  const num = (key: ScanLogKey, param: string): number | null => {
    const v = firstOk.get(key)?.params[param];
    return typeof v === "number" ? v : null;
  };
  const errorsLine = firstOk.get("engineErrors");
  let errorsText: string | null = null;
  if (errorsLine !== undefined) {
    const same = String(errorsLine.params.text ?? "")
      .trim()
      .slice(0, 200);
    errorsText = same !== "" ? same : (scanner.continuation.get(errorsLine.index) ?? "");
  }
  const postCounts = countsOf(lines, "POST_OPEN");
  const shapeMismatch: ScanLogKey[] = [];
  for (const l of post) {
    if (l.shape !== "OK" && !shapeMismatch.includes(l.key)) shapeMismatch.push(l.key);
  }

  // 외부 명령 시도
  const preAt = (key: ScanLogKey): number | null => {
    const l = pre.find((x) => x.key === key && x.shape === "OK");
    return l === undefined ? null : l.startByte;
  };
  const scanningOpen = preAt("scanningOpenDocuments");
  const scannedOpen = preAt("scannedOpenDocuments");
  const scanStart = firstOk.get("scanningSingleFile")?.startByte ?? null;
  const scanTargets = firstOk.get("scanningTargets")?.startByte ?? null;
  const attempts: ExternalCommandAttempt[] = [];
  for (const l of lines) {
    if (l.key !== "externalCommand") continue;
    let window: ExternalCommandWindow = "OTHER";
    if (l.segment === "PRE_OPEN") {
      if (
        scanningOpen !== null &&
        l.startByte > scanningOpen &&
        (scannedOpen === null || l.startByte < scannedOpen)
      ) {
        window = "BARRIER";
      }
    } else if (
      scanStart !== null &&
      l.startByte > scanStart &&
      (scanTargets === null || l.startByte < scanTargets)
    ) {
      window = "SCAN";
    }
    attempts.push({
      lineIndex: l.index,
      segment: l.segment,
      window,
      shape: externalCommandShape(l.level, String(l.params.rest ?? ""), options.workspace),
      startByte: l.startByte,
      endByte: l.endByte,
    });
  }
  const inPre = attempts.filter((x) => x.segment === "PRE_OPEN");
  const inPost = attempts.filter((x) => x.segment === "POST_OPEN");
  const problems: string[] = [];
  const shapeOk = attempts.every((x) => x.shape === "OK");
  if (!shapeOk) problems.push("EXTERNAL_COMMAND_SHAPE");
  const outOfPhase = attempts.some((x) => x.window === "OTHER");
  if (
    inPre.filter((x) => x.window === "BARRIER").length > 1 ||
    inPost.filter((x) => x.window === "SCAN").length > 1 ||
    outOfPhase
  ) {
    problems.push("EXTERNAL_COMMAND_COUNT");
  }
  if (outOfPhase) problems.push("EXTERNAL_COMMAND_OUT_OF_PHASE");

  return {
    didOpenOffset,
    lines,
    counters: { ...scanner.c },
    openBlockAtEnd: scanner.openBlockAtEnd,
    openBlockEmbeddedKeys: scanner.openBlockEmbeddedKeys,
    pre: {
      scanEvidence: pre.filter((l) => SCAN_EVIDENCE_KEYS.includes(l.key)).map((l) => l.key),
      counts: countsOf(lines, "PRE_OPEN"),
      extras: extrasOf("PRE_OPEN", pre),
    },
    post: {
      counts: postCounts,
      extras: extrasOf("POST_OPEN", post),
      shapeMismatch,
      bundle: {
        complete:
          seenAll &&
          exactlyOnce &&
          orderViolations.length === 0 &&
          shapeMismatch.every((k) => !SCAN_BUNDLE_KEYS.includes(k)),
        seenAll,
        missing,
        orderViolations,
        completeEndByte,
        numbers: {
          targets: num("scanningTargets", "n"),
          rules: num("runningRules", "n"),
          matchesBefore: num("foundMatchesBefore", "m"),
          skipped: num("skippedRules", "s"),
          scanned: num("scannedFiles", "k"),
          matches: num("foundMatches", "m"),
          errorsText,
        },
      },
    },
    externalCommand: {
      preCount: inPre.length,
      postCount: inPost.length,
      attempts,
      shapeOk,
      problems,
    },
  };
}
