// 시험 전용: LSP-SCAN-1 시험이 함께 쓰는 stderr·stdout 합성 조립기. 실제 Semgrep이 아니다.
//
// 서두와 규칙 새로고침(장벽) 구간은 LSP-RULES-1 조립기(rules-fixtures.ts)를 그대로 쓰고, 장벽 구간에 계획 3.5절의 외부 명령 줄(D3 사전 열기 1건)을 더한다.
// `didOpen` 뒤의 줄(단일 파일 스캔)은 공개 소스(Legacy_scan_helpers.ml)에서 도출한 **예측**이며 실제 바이너리에서는 관측된 적이 없다 —
// 여기서 만든 입력으로 통과한 시험은 판정 로직이 합성 입력에서 의도대로 동작한다는 것만 보여 준다.

import {
  LSP_SCAN_EXPECTED_DIAGNOSTIC,
  LSP_SCAN_INIT_ID,
  scanLayout,
  scanTargetUri,
  type ScanLayout,
} from "../lsp-scan";
import type { JsonRpcMessage } from "../types";
import {
  crlf,
  enc,
  frames,
  preambleLines,
  progressCreate,
  progressNotification,
  RULES_REFRESHED,
  SHUTDOWN_LINES,
  refreshLines,
} from "./rules-fixtures";

export const SCAN_WORK = "C:/work/scan-1";
export const scanLay: ScanLayout = scanLayout(SCAN_WORK);
export const SCAN_URL = "http://127.0.0.1:41999";
export const SCAN_STUB_VERSION = "9.9.9";

/** 합성 대상 파일의 전문(저장소의 data/lsp-scan-1-target.txt 와 같아야 한다: lsp-scan.test.ts 가 대조한다). */
export const TARGET_TEXT =
  "LSP-SCAN-1 synthetic target. This is not a source file.\n" +
  "marker: LSP_RULES_1_PROBE_TOKEN_THAT_IS_NEVER_PRESENT\n" +
  "end of synthetic target.\n";
export const TARGET_BYTES = enc(TARGET_TEXT);
export const TARGET_URI = scanTargetUri(scanLay);

/** 기대하는 진단 하나(소스에서 도출한 값). */
export const GOOD_DIAGNOSTIC = {
  range: { start: { line: 1, character: 8 }, end: { line: 1, character: 53 } },
  severity: 3,
  code: LSP_SCAN_EXPECTED_DIAGNOSTIC.codes[0],
  source: LSP_SCAN_EXPECTED_DIAGNOSTIC.source,
  message: LSP_SCAN_EXPECTED_DIAGNOSTIC.message,
};

export const publishDiagnostics = (
  uri: unknown,
  diagnostics: unknown,
  extra: Record<string, unknown> = {}
): JsonRpcMessage => ({
  jsonrpc: "2.0",
  method: "textDocument/publishDiagnostics",
  params: { uri, diagnostics, ...extra },
});

export const goodNotification = (uri: string = TARGET_URI): JsonRpcMessage =>
  publishDiagnostics(uri, [GOOD_DIAGNOSTIC]);

export const scanInitResponse = (version: string = SCAN_STUB_VERSION): JsonRpcMessage => ({
  jsonrpc: "2.0",
  id: LSP_SCAN_INIT_ID,
  result: {
    capabilities: { textDocumentSync: 1 },
    serverInfo: { name: "Semgrep", version },
  },
});

/**
 * 진행 알림(`$/progress`) 조립기. 모양은 고정 소스의 `Legacy_lsp_.ml`(`create_progress`·`end_progress`)와 2026-11-03 실제 관측의 프레임에서 읽은 것이다:
 * 시작은 `{ kind:"begin", title, message }`, 끝은 `{ kind:"end" }`(메시지·제목 없음). 제목·문구는 일부러 상수 대신 **문자열 그대로** 적는다 —
 * 계약이 바뀌면 이 시험이 먼저 깨지게 하려는 것이다(이번 실행의 토큰 값은 쓰지 않는다).
 */
export const progressBegin = (
  token: string | number,
  title: string,
  message: string
): JsonRpcMessage => ({
  jsonrpc: "2.0",
  method: "$/progress",
  params: { token, value: { kind: "begin", title, message } },
});
export const progressEnd = (token: string | number): JsonRpcMessage => ({
  jsonrpc: "2.0",
  method: "$/progress",
  params: { token, value: { kind: "end" } },
});

/** 초기 진행 두 수명주기의 합성 값(요청 id 와 토큰은 서로 다른 값이다). */
export const PROGRESS_REFRESH = {
  id: "synthetic-request-refresh",
  token: "synthetic-token-refresh",
};
export const PROGRESS_SCAN = { id: "synthetic-request-scan", token: "synthetic-token-scan" };

/** 새로고침 수명주기: create → begin("Semgrep" / "Refreshing Rules") → end. */
export const refreshProgress = (p = PROGRESS_REFRESH): JsonRpcMessage[] => [
  progressCreate(p.id, p.token),
  progressBegin(p.token, "Semgrep", "Refreshing Rules"),
  progressEnd(p.token),
];
/** 초기 열린 문서 스캔 수명주기: create → begin("Semgrep Scan in Progress" / "Scanning Open Documents") → end. */
export const openDocumentsProgress = (p = PROGRESS_SCAN): JsonRpcMessage[] => [
  progressCreate(p.id, p.token),
  progressBegin(p.token, "Semgrep Scan in Progress", "Scanning Open Documents"),
  progressEnd(p.token),
];

/** 장벽까지의 stdout: 초기화 응답 → 진행 요청·알림 → rulesRefreshed → 진행 요청·알림(열린 문서 스캔). */
export function barrierStdoutMessages(): JsonRpcMessage[] {
  // 순서는 고정 소스(Legacy_scan_helpers.ml: create_progress → 규칙 읽기 → end_progress → rulesRefreshed → 열린 문서 스캔의 create_progress …)와
  // 2026-11-03 실제 관측 프레임의 순서를 따른다. 이전 조립기는 새로고침의 end 를 rulesRefreshed **뒤**에 놓았고 begin 의 제목·문구도 "x" 였다(소스와 다름) —
  // 이 SCAN 전용 조립기를 정정했다(RULES 조립기 rules-fixtures.ts 는 바꾸지 않았다).
  return [scanInitResponse(), ...refreshProgress(), RULES_REFRESHED, ...openDocumentsProgress()];
}

/** Windows 서버가 로그에 남기는 작업 영역 경로 모양: 역슬래시, 드라이브 문자 소문자(LSP-RULES-1 stderr:227). */
export function logWorkspacePath(workspace: string = scanLay.workspace): string {
  const back = workspace.replace(/\//g, "\\");
  return back.replace(/^([A-Za-z]):/, (_m, d: string) => `${d.toLowerCase()}:`);
}

/** D3 모양의 외부 명령 INFO 줄. */
export function externalCommandLine(
  workspace: string = scanLay.workspace,
  stamp: string = "00.83"
): string {
  return `[${stamp}][INFO]: Running external command: "git" "-C" "${logWorkspacePath(workspace)}" "rev-parse" "--show-toplevel"`;
}

/** `didOpen` 이전 stderr 줄: 서두 + 정상 새로고침(장벽) + 열린 문서 스캔 구간의 외부 명령 줄 1건. */
export function scanPreOpenLines(lay: ScanLayout = scanLay): string[] {
  const refresh = refreshLines({ rulesDir: lay.rulesDir });
  const at = refresh.indexOf("Scanning open documents");
  return [
    ...preambleLines(lay.rulesDir),
    ...refresh.slice(0, at + 1),
    externalCommandLine(lay.workspace),
    ...refresh.slice(at + 1),
  ];
}

/** `didOpen` 이후의 정상 단일 파일 스캔 줄(소스에서 도출한 예측). */
export function scanPostOpenLines(lay: ScanLayout = scanLay): string[] {
  return [
    '[01.00][DEBUG](default): Handling notification { "method": "textDocument/didOpen", "params": { "textDocument": { "uri": "x" } }, "jsonrpc": "2.0" }',
    "Scanning single file",
    "Scanned single file",
    externalCommandLine(lay.workspace, "01.01"),
    "[01.02][INFO]: Scanning 1 targets",
    "[01.02][DEBUG](default): Running Semgrep with 1 rules",
    "[01.20][INFO]: Found 1 matches before processing",
    "Semgrep errors: ",
    "Semgrep skipped 0 rules",
    "Scanned 1 files",
    "Found 1 matches",
    "[01.21][DEBUG](default): Sending notification {",
    '  "params": { "diagnostics": [ { "code": "rules-probe.lsp-rules-1-probe" } ] },',
    '  "method": "textDocument/publishDiagnostics",',
    '  "jsonrpc": "2.0"',
    "}",
  ];
}

export interface ScanStderrParts {
  pre: string[];
  post: string[];
  tail: string[];
}

export function scanStderrParts(lay: ScanLayout = scanLay): ScanStderrParts {
  return { pre: scanPreOpenLines(lay), post: scanPostOpenLines(lay), tail: [...SHUTDOWN_LINES] };
}

export const bytesOf = (lines: readonly string[]): Uint8Array => enc(crlf(lines));

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}

export { crlf, enc, frames, progressCreate, progressNotification, RULES_REFRESHED };
