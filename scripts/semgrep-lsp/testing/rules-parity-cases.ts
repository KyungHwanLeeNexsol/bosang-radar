// 시험 전용: LSP-RULES-1 TS 구현과 PowerShell 이식본이 **같은 입력에 같은 출력**을 내는지 대조하는 사례 생성기. 실제 Semgrep이 아니다.
//
// 이 사례들(입력 + TS가 계산한 기대 출력)은 JSON 골든 파일(scripts/semgrep-lsp-isolation/windows/tests/lsp-rules-parity.json)로 저장된다.
//  · TS 쪽 시험(rules-parity.test.ts)은 "골든 파일 = 지금 TS가 계산하는 값"을 지킨다. TS 구현이 바뀌면 골든 갱신 없이는 실패한다.
//  · PowerShell 쪽 시험(tests/Test-LspRulesRunner.ps1)은 "PS 이식본의 출력 = 골든 파일"을 지킨다. PS가 TS와 어긋나면 실패한다.
// 그래서 어느 한쪽만 바뀌어도 대조가 깨진다. 사례의 입력은 바이트까지 정해져 있다(base64): 인코딩 해석 차이가 대조를 흐리지 않는다.

import {
  assertAllowedRulesOutbound,
  isValidProgressCreate,
  RulesStderrWatcher,
  RulesStdoutTracker,
  rulesRootViolation,
} from "../lsp-rules";
import { RulesLogScanner } from "../rules-log";
import type { JsonRpcMessage } from "../types";
import {
  crlf,
  enc,
  happyStderrLines,
  preambleLines,
  progressCreate,
  progressNotification,
  refreshLines,
  RULES_REFRESHED,
  SHUTDOWN_LINES,
} from "./rules-fixtures";

export interface ParityCase {
  id: string;
  /** log-scan | stderr-watch | stdout-track | progress-create | root-violation | outbound */
  kind: string;
  input: unknown;
  expected: unknown;
}

const RULES_DIR = "C:/work/rules-1/lsp-state/rules-probe";
const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64");

// PowerShell의 -ceq·-ccontains 같은 연산자는 서수(ordinal) 비교가 아니라 문화권 비교라서, 소프트 하이픈(U+00AD)이나 NUL 같은 "무시되는 문자"가 끼어 있어도 같다고 본다.
// TS의 ===·Set.has 는 서수 비교다. 이 문자들을 낀 사례로 두 쪽이 갈라지지 않는지 대조한다. 소스에는 이스케이프 대신 문자 코드로 만든다.
const SHY = String.fromCharCode(0x00ad);
const NUL = String.fromCharCode(0);

/** 사례 id에는 ASCII 밖 문자와 제어 문자를 그대로 싣지 않는다. */
const safeId = (text: string): string => text.replace(/[^\x21-\x7e]/g, "?");

// ── log-scan ──────────────────────────────────────────────────────

function scanExpected(bytes: Uint8Array, chunk: number): unknown {
  const scanner = new RulesLogScanner();
  const step = chunk > 0 ? chunk : bytes.length || 1;
  for (let at = 0; at < bytes.length; at += step) scanner.push(bytes.subarray(at, at + step));
  scanner.end();
  return {
    signals: scanner.signals.map((s) => ({
      key: s.key,
      level: s.level,
      tag: s.tag,
      source: s.source,
      shape: s.shape,
      byteOffset: s.byteOffset,
      recordIndex: s.recordIndex,
      path: typeof s.params.path === "string" ? s.params.path : null,
      count: typeof s.params.count === "number" ? s.params.count : null,
    })),
    counters: { ...scanner.counters },
  };
}

function scanCase(id: string, text: string, chunk = 0): ParityCase {
  const bytes = enc(text);
  return {
    id,
    kind: "log-scan",
    input: { b64: b64(bytes), chunk },
    expected: scanExpected(bytes, chunk),
  };
}

function logScanCases(): ParityCase[] {
  const happy = crlf(happyStderrLines(RULES_DIR));
  const refresh = refreshLines({ rulesDir: RULES_DIR });
  return [
    scanCase("scan/happy-crlf", happy),
    scanCase("scan/happy-lf", happyStderrLines(RULES_DIR).join("\n") + "\n"),
    scanCase("scan/happy-chunk-1", happy, 1),
    scanCase("scan/happy-chunk-7", happy, 7),
    scanCase("scan/happy-chunk-64", happy, 64),
    scanCase("scan/preamble-only", crlf(preambleLines(RULES_DIR))),
    scanCase("scan/shutdown-lines", crlf(SHUTDOWN_LINES)),
    scanCase(
      "scan/embedded-json",
      crlf([
        "[00.01][DEBUG](default): Handling request:",
        "{",
        '  "message": "Scanned open documents",',
        '  "list": [ "Rules refreshed" ]',
        "}",
        "Rules refreshed",
      ])
    ),
    scanCase(
      "scan/embedded-bare-in-braces",
      crlf([
        "[00.01][DEBUG](default): Initialized server with session:",
        "{ Legacy_session.capabilities =",
        "Rules refreshed",
        "Scanned open documents",
        "  is_intellij = false }",
        "Server initialized",
      ])
    ),
    scanCase(
      "scan/header-opens-brace",
      crlf([
        "[00.01][DEBUG](default): Sending response {",
        '  "x": 1,',
        "Scanning workspace",
        "}",
        "Refreshing rules",
      ])
    ),
    scanCase(
      "scan/unclosed-brace-swallows",
      crlf([
        "[00.01][DEBUG](default): oops { never closed",
        "Rules refreshed",
        "Scanned open documents",
      ])
    ),
    scanCase(
      "scan/unclosed-then-header",
      crlf(["[00.01][DEBUG](default): oops {", "[00.02][INFO]: x", "Rules refreshed"])
    ),
    scanCase(
      "scan/banner-free-text",
      crlf(["[00.01][DEBUG](default): ", "some banner text", "", "more", "Refreshing rules"])
    ),
    scanCase(
      "scan/header-variants",
      crlf([
        "[00.01][TRACE]: Refreshing rules",
        "[00.02][INFO](a)(b): Rules refreshed",
        "[00.03] x",
      ])
    ),
    scanCase(
      "scan/error-record",
      crlf(["[00.01][ERROR]: Unhandled message", "[00.02][ERROR]: Rules refreshed"])
    ),
    scanCase(
      "scan/unknown-warning-info-debug",
      crlf([
        "[00.01][WARNING]: something odd",
        "[00.02][INFO]: hello",
        "[00.03][DEBUG](default): hi",
      ])
    ),
    scanCase("scan/orphan-lines", crlf(["stray text", "Refreshing rules"])),
    scanCase(
      "scan/level-mismatch",
      crlf([
        "[00.01][INFO]: No targets to scan! Not scanning anything.",
        "[00.02][WARNING]: loading local config from C:\\a.yaml",
        "[00.03][INFO]: Refreshing rules",
      ])
    ),
    scanCase(
      "scan/forbidden-keys",
      crlf([
        "Running Semgrep with 1 rules",
        "[00.01][DEBUG](default): Running Semgrep with 2 rules",
        "Semgrep errors: ",
        "Scanned 3 files",
        "Found 0 matches",
        "Semgrep skipped 1 rules",
        "Scanning single file",
        "Scanning workspace",
        "Scanned workspace",
        "Scanning workspace complete",
        "Scanning workspace, full: true",
      ])
    ),
    scanCase(
      "scan/network-token-lines",
      crlf([
        "[00.8][INFO]: No rules source specified, using auto",
        "[00.8][INFO]: trying to download from https://example.invalid/x",
        "[00.8][INFO]: Found API token in environment variables",
        "[00.8][INFO]: Settings file found at C:\\x",
        "[00.8][INFO]: No settings file found, using default settings",
        "[00.8][INFO]: Checking for API token in environment variables",
        "[00.8][INFO]: No API token found in environment variables",
        "[00.8][DEBUG](default): CI disabled, not checking API token",
        "Rules not loaded yet, nothing to do",
        "[00.8][WARNING]: No rules to run! Not scanning anything.",
      ])
    ),
    scanCase(
      "scan/skipping-rule",
      crlf(["[00.81][WARNING](semgrep.parsing): skipping rule lsp-rules-1-probe, error = x"])
    ),
    scanCase("scan/multibyte-offset", "[00.01][INFO]: 한글 경로 ✓\r\nRefreshing rules\r\n"),
    scanCase("scan/partial-tail", "Refreshing rules\nRules refreshed"),
    scanCase(
      "scan/got-errors-counts",
      crlf([
        "[1][INFO]: Got 0 errors while refreshing rules in language server",
        "[1][INFO]: Got 12 errors while refreshing rules in language server",
        "[1][INFO]: Got 012 errors while refreshing rules in language server",
      ])
    ),
    scanCase("scan/loading-paths", crlf([refresh[6], refresh[7]])),
    scanCase("scan/empty", ""),
    scanCase("scan/blank-lines", "\r\n\r\n   \r\nRefreshing rules\r\n"),
    // 무시되는 문자(소프트 하이픈·NUL)가 낀 줄은 알려진 문구가 아니다: 서수 비교로만 같은 문구다.
    scanCase(
      "scan/ignorable-chars",
      crlf([
        `[00.01][WARNING]: No targets to scan!${SHY} Not scanning anything.`,
        `[00.02][INFO]: Checking for API token in environment variable${SHY}s`,
        `[00.03][INFO]: Server initialized${NUL}`,
        `Server initialized${NUL}`,
        `Refreshing${SHY} rules`,
        "Rules refreshed",
      ])
    ),
  ];
}

// ── stderr-watch ─────────────────────────────────────────────────

interface WatchInput {
  initializedSent: boolean;
  chunks: string[];
  end: boolean;
}

function watchExpected(input: WatchInput): unknown {
  const w = new RulesStderrWatcher();
  w.initializedSent = input.initializedSent;
  const returned: unknown[] = [];
  for (const chunk of input.chunks) returned.push(w.push(enc(chunk)));
  if (input.end) returned.push(w.end());
  return {
    returned,
    hit: w.hit,
    scannedOpenDocumentsSeen: w.scannedOpenDocumentsSeen,
    initErrorLogged: w.initErrorLogged,
  };
}

function watchCase(id: string, input: WatchInput): ParityCase {
  return { id, kind: "stderr-watch", input, expected: watchExpected(input) };
}

function watchCases(): ParityCase[] {
  return [
    watchCase("watch/pre-init-refreshing", {
      initializedSent: false,
      chunks: ["Refreshing rules\r\n"],
      end: false,
    }),
    watchCase("watch/pre-init-scanned", {
      initializedSent: false,
      chunks: ["Scanned open documents\r\n"],
      end: false,
    }),
    watchCase("watch/after-init-normal", {
      initializedSent: true,
      chunks: ["Refreshing rules\r\nScanning open documents\r\n"],
      end: false,
    }),
    watchCase("watch/after-init-barrier", {
      initializedSent: true,
      chunks: ["Refreshing rules\r\nScanning open documents\r\n", "Scanned open documents\r\n"],
      end: false,
    }),
    watchCase("watch/headed-barrier-line", {
      initializedSent: true,
      chunks: ["[00.1][INFO]: Scanned open documents\r\n"],
      end: false,
    }),
    watchCase("watch/embedded-barrier-line", {
      initializedSent: true,
      chunks: [
        '[00.1][DEBUG](default): Handling request:\r\n{\r\n  "m": [\r\nScanned open documents\r\n]\r\n}\r\n',
      ],
      end: false,
    }),
    watchCase("watch/engine-line", {
      initializedSent: true,
      chunks: ["Running Semgrep with 1 rules\r\n"],
      end: false,
    }),
    watchCase("watch/token-found", {
      initializedSent: true,
      chunks: ["[00.1][INFO]: Found API token in environment variables\r\n"],
      end: false,
    }),
    watchCase("watch/download-split", {
      initializedSent: true,
      chunks: ["[00.1][DEBUG](default): a down", "load b\r\n", "registry\r\n"],
      end: false,
    }),
    watchCase("watch/registry-word", {
      initializedSent: true,
      chunks: ["[00.1][DEBUG](default): registry lookup\r\n"],
      end: false,
    }),
    watchCase("watch/init-error-split", {
      initializedSent: false,
      chunks: ["[00.1][ERROR]: Error initia", "lizing server: boom\r\n"],
      end: false,
    }),
    watchCase("watch/partial-tail-engine", {
      initializedSent: true,
      chunks: ["Scanning workspace"],
      end: true,
    }),
    watchCase("watch/multibyte-split-free", {
      initializedSent: true,
      chunks: ["[00.1][INFO]: 한글 ", "경로\r\nRefreshing rules\r\n"],
      end: false,
    }),
  ];
}

// ── stdout-track ─────────────────────────────────────────────────

interface TrackInput {
  initializedSent: boolean;
  messages: JsonRpcMessage[];
}

function trackExpected(input: TrackInput): unknown {
  const t = new RulesStdoutTracker();
  t.initializedSent = input.initializedSent;
  const aborts = input.messages.map((m) => t.onMessage(m));
  const a = t.analysis;
  return {
    aborts,
    rulesRefreshedCount: a.rulesRefreshedCount,
    rulesRefreshedSeen: t.rulesRefreshedSeen,
    serverRequestCount: a.serverRequestCount,
    allowedRequests: a.serverRequests.filter((r) => r.allowed).length,
    diagnosticsCount: a.diagnosticsCount,
    progressNotifications: a.progressNotifications,
    otherNotifications: a.otherNotifications,
    errorNotifications: a.errorNotifications,
    initResponseSeen: a.initMessage !== null,
    initDuplicate: a.initDuplicate,
    shutdownResponseSeen: a.shutdownResponseSeen,
    unmatchedResponses: a.unmatchedResponses,
    messagesWithoutMethodOrId: a.messagesWithoutMethodOrId,
  };
}

function trackCase(id: string, input: TrackInput): ParityCase {
  return { id, kind: "stdout-track", input, expected: trackExpected(input) };
}

const INIT: JsonRpcMessage = {
  jsonrpc: "2.0",
  id: "lsp-rules-init-1",
  result: { capabilities: {} },
};

function trackCases(): ParityCase[] {
  const diag: JsonRpcMessage = {
    jsonrpc: "2.0",
    method: "textDocument/publishDiagnostics",
    params: {},
  };
  const config: JsonRpcMessage = {
    jsonrpc: "2.0",
    id: 9,
    method: "workspace/configuration",
    params: {},
  };
  return [
    trackCase("track/happy", {
      initializedSent: true,
      messages: [
        INIT,
        progressCreate(1, "a"),
        progressNotification("a", "begin"),
        RULES_REFRESHED,
        progressNotification("a", "end"),
        progressCreate(2, "b"),
      ],
    }),
    trackCase("track/notification-before-init", {
      initializedSent: false,
      messages: [RULES_REFRESHED],
    }),
    trackCase("track/request-before-init", {
      initializedSent: false,
      messages: [progressCreate(1, "a")],
    }),
    trackCase("track/third-request", {
      initializedSent: true,
      messages: [
        progressCreate(1, "a"),
        progressCreate(2, "b"),
        progressCreate(3, "c"),
        RULES_REFRESHED,
      ],
    }),
    trackCase("track/diagnostics", { initializedSent: true, messages: [diag] }),
    trackCase("track/other-request", { initializedSent: true, messages: [config] }),
    trackCase("track/bad-create", {
      initializedSent: true,
      messages: [{ jsonrpc: "2.0", id: 5, method: "window/workDoneProgress/create", params: {} }],
    }),
    trackCase("track/unexpected-notification", {
      initializedSent: true,
      messages: [{ jsonrpc: "2.0", method: "custom/telemetry", params: {} }],
    }),
    trackCase("track/error-notification", {
      initializedSent: true,
      messages: [
        { jsonrpc: "2.0", method: "window/showMessage", params: { type: 1, message: "boom" } },
        { jsonrpc: "2.0", method: "window/logMessage", params: { type: 3, message: "fine" } },
      ],
    }),
    trackCase("track/duplicates-and-responses", {
      initializedSent: true,
      messages: [
        INIT,
        INIT,
        { jsonrpc: "2.0", id: "lsp-rules-shutdown-1", result: null },
        { jsonrpc: "2.0", id: "someone", result: 1 },
        { jsonrpc: "2.0" } as JsonRpcMessage,
        RULES_REFRESHED,
        RULES_REFRESHED,
      ],
    }),
    // 무시되는 문자가 낀 메서드·id는 알려진 것이 아니다(서수 비교).
    trackCase("track/method-soft-hyphen", {
      initializedSent: true,
      messages: [{ jsonrpc: "2.0", method: `textDocument/publish${SHY}Diagnostics`, params: {} }],
    }),
    trackCase("track/method-nul", {
      initializedSent: true,
      messages: [{ jsonrpc: "2.0", method: `textDocument/publish${NUL}Diagnostics`, params: {} }],
    }),
    trackCase("track/rules-refreshed-soft-hyphen", {
      initializedSent: false,
      messages: [{ jsonrpc: "2.0", method: `semgrep/rules${SHY}Refreshed`, params: {} }],
    }),
    trackCase("track/init-id-soft-hyphen", {
      initializedSent: true,
      messages: [
        { jsonrpc: "2.0", id: `lsp-rules-init-1${SHY}`, result: { capabilities: {} } },
        { jsonrpc: "2.0", id: `lsp-rules-shutdown-1${NUL}`, result: null },
      ],
    }),
  ];
}

// ── 단순 표 ──────────────────────────────────────────────────────

function progressCases(): ParityCase[] {
  const base = {
    jsonrpc: "2.0",
    id: 1,
    method: "window/workDoneProgress/create",
    params: { token: "t" },
  };
  const variants: [string, Record<string, unknown>][] = [
    ["valid", base],
    ["valid-string-id", { ...base, id: "a-1" }],
    ["valid-number-token", { ...base, params: { token: 7 } }],
    ["bad-jsonrpc", { ...base, jsonrpc: "1.0" }],
    ["no-id", { jsonrpc: "2.0", method: base.method, params: base.params }],
    ["null-id", { ...base, id: null }],
    ["bool-id", { ...base, id: true }],
    ["no-params", { jsonrpc: "2.0", id: 1, method: base.method }],
    ["array-params", { ...base, params: [] }],
    ["no-token", { ...base, params: {} }],
    ["object-token", { ...base, params: { token: {} } }],
    ["extra-param-key", { ...base, params: { token: "t", x: 1 } }],
    ["extra-top-key", { ...base, result: null }],
    ["other-method", { ...base, method: "window/showMessageRequest" }],
    ["method-case", { ...base, method: "Window/workDoneProgress/create" }],
    ["method-soft-hyphen", { ...base, method: `window/workDone${SHY}Progress/create` }],
    ["method-nul", { ...base, method: `window/workDoneProgress/create${NUL}` }],
    ["jsonrpc-soft-hyphen", { ...base, jsonrpc: `2.0${SHY}` }],
    ["param-key-soft-hyphen", { ...base, params: { [`tok${SHY}en`]: "t" } }],
  ];
  return variants.map(([name, message]) => ({
    id: `progress/${name}`,
    kind: "progress-create",
    input: message,
    expected: isValidProgressCreate(message as unknown as JsonRpcMessage),
  }));
}

function rootCases(): ParityCase[] {
  const table: [string, string][] = [
    ["WORKSPACE", "a.txt"],
    ["RULES_DIR", "lsp-rules-1-probe.yaml"],
    ["RULES_DIR", "LSP-RULES-1-PROBE.YAML"],
    ["RULES_DIR", "other.yaml"],
    ["RULES_DIR", "sub/lsp-rules-1-probe.yaml"],
    ["RULES_DIR", "lsp-rules-1-probe.yaml.bak"],
    ["HOME_DIR", ".semgrep/cache/fingerprinted_ignored_findings/ws.txt"],
    ["HOME_DIR", ".semgrep\\cache\\fingerprinted_ignored_findings\\ws.txt"],
    ["HOME_DIR", ".semgrep/settings.yml"],
    ["RULES_DIR", `lsp-rules-1-pro${SHY}be.yaml`],
    ["RULES_DIR", `lsp-rules-1-probe.yaml${NUL}`],
  ];
  return table.map(([role, rel]) => ({
    id: `root/${role}/${safeId(rel)}`,
    kind: "root-violation",
    input: { role, relativePath: rel },
    expected: rulesRootViolation(role as "WORKSPACE" | "RULES_DIR" | "HOME_DIR", rel),
  }));
}

function outboundCases(): ParityCase[] {
  const init: JsonRpcMessage = {
    jsonrpc: "2.0",
    id: "lsp-rules-init-1",
    method: "initialize",
    params: {},
  };
  const table: [string, string, JsonRpcMessage][] = [
    ["initialize", "ok", init],
    ["initialized", "ok", { jsonrpc: "2.0", method: "initialized", params: {} }],
    ["shutdown", "ok", { jsonrpc: "2.0", id: "lsp-rules-shutdown-1", method: "shutdown" }],
    ["exit", "ok", { jsonrpc: "2.0", method: "exit" }],
    ["initialized", "no-params", { jsonrpc: "2.0", method: "initialized" }],
    [
      "initialized",
      "params-not-empty",
      { jsonrpc: "2.0", method: "initialized", params: { a: 1 } },
    ],
    ["initialized", "has-id", { jsonrpc: "2.0", id: 1, method: "initialized", params: {} }],
    ["exit", "has-params", { jsonrpc: "2.0", method: "exit", params: {} }],
    ["shutdown", "has-params", { jsonrpc: "2.0", id: "x", method: "shutdown", params: {} }],
    ["initialize", "no-id", { jsonrpc: "2.0", method: "initialize" }],
    ["initialize", "did-open", { jsonrpc: "2.0", method: "textDocument/didOpen", params: {} }],
    [
      "initialized",
      "scan-workspace",
      { jsonrpc: "2.0", method: "semgrep/scanWorkspace", params: {} },
    ],
    [
      "initialized",
      "refresh-rules",
      { jsonrpc: "2.0", method: "semgrep/refreshRules", params: {} },
    ],
    ["initialize", "debug-echo", { jsonrpc: "2.0", id: "x", method: "debug/echo", params: {} }],
    ["shutdown", "response", { jsonrpc: "2.0", id: 1, result: null }],
    ["exit", "error-response", { jsonrpc: "2.0", id: 1, error: { code: -32601, message: "no" } }],
    [
      "initialized",
      "workspace-folders",
      { jsonrpc: "2.0", method: "workspace/didChangeWorkspaceFolders", params: {} },
    ],
    // 무시되는 문자가 낀 라벨·메서드는 허용된 것이 아니다(서수 비교).
    [
      `init${SHY}ialized`,
      "label-soft-hyphen",
      { jsonrpc: "2.0", method: "initialized", params: {} },
    ],
    [
      "initialized",
      "method-soft-hyphen",
      { jsonrpc: "2.0", method: `initial${SHY}ized`, params: {} },
    ],
    ["initialized", "method-nul", { jsonrpc: "2.0", method: `initialized${NUL}`, params: {} }],
    ["exit", "method-soft-hyphen", { jsonrpc: "2.0", method: `ex${SHY}it` }],
  ];
  return table.map(([label, name, message]) => {
    let result: "ok" | "throws" = "ok";
    try {
      assertAllowedRulesOutbound(label as "initialize", message);
    } catch {
      result = "throws";
    }
    return {
      id: `outbound/${safeId(label)}/${name}`,
      kind: "outbound",
      input: { label, message },
      expected: result,
    };
  });
}

/** 모든 사례(순서 고정). 골든 파일은 이 배열의 JSON이다. */
export function parityCases(): ParityCase[] {
  return [
    ...logScanCases(),
    ...watchCases(),
    ...trackCases(),
    ...progressCases(),
    ...rootCases(),
    ...outboundCases(),
  ];
}
