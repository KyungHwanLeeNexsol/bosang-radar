// 시험 전용: LSP-RULES-1 시험이 함께 쓰는 stderr·stdout 합성 조립기. 실제 Semgrep이 아니다.
//
// 모양은 LSP-MIN-1에서 실제로 관측한 stderr(6,244 B, CRLF, 머리말 있는 20항목 + 머리말 없는 App 줄 7개, 여러 줄 JSON·세션 덤프, 안내문 배너)를
// 본떴다. `initialized` 이후의 줄(규칙 새로고침·열린 문서 스캔)은 소스에서 도출한 **예측**이며 실제 바이너리에서는 관측된 적이 없다 —
// 여기서 만든 입력으로 통과한 시험은 판정 로직이 합성 입력에서 의도대로 동작한다는 것만 보여 준다.

import { encodeFrame } from "../framing";
import type { JsonRpcMessage } from "../types";

export const PROBE_FILE_NAME = "lsp-rules-1-probe.yaml";

export const enc = (text: string): Uint8Array => new TextEncoder().encode(text);
export const crlf = (lines: readonly string[]): string => lines.map((l) => `${l}\r\n`).join("");

/** 실제 관측과 같은 모양의 서두: 안내문 배너, 첫 요청 덤프(JSON), 초기화 덤프, 세션 덤프, 초기화 응답 덤프. */
export function preambleLines(rulesDir: string): string[] {
  const jsonRules = rulesDir.replace(/\\/g, "\\\\");
  return [
    "[00.11][DEBUG](default): Skipping logs for: [networking.http, cohttp.lwt.client, semgrep.parsing, bos]",
    "[00.11][DEBUG](default): Showing logs for: [application]",
    "[00.11][DEBUG](default): !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
    "[00.11][DEBUG](default): ",
    "If you want to show the logs of a particular library",
    "(e.g., the semgrep targeting library), you'll need to adjust the",
    "SEMGREP_LOG_SRCS environment variable as in",
    "",
    '  SEMGREP_LOG_SRCS="semgrep.targeting" semgrep ... --debug',
    "",
    "You can see the list of possible libraries above in this log as in",
    "...",
    "[00.04][DEBUG](default): Skipping logs for semgrep.targeting",
    "...",
    "For more information, See",
    "https://www.notion.so/semgrep/Logging-in-semgrep",
    "",
    "[00.11][DEBUG](default): !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
    "[00.11][DEBUG](default): Logging setup for osemgrep: color=Console.Auto level=debug",
    "[00.11][DEBUG](default): Executed as: osemgrep lsp --debug",
    "[00.11][DEBUG](default): Starting semgrep-lsp",
    "Starting legacy language server",
    "[00.11][DEBUG](default): Starting Semgrep Language Server",
    "[00.11][DEBUG](default): Handling request:",
    "{",
    '  "id": 0,',
    '  "params": {',
    '    "capabilities": {},',
    '    "initializationOptions": {',
    '      "scan": {',
    '        "ci": false,',
    '        "configuration": [',
    `          "${jsonRules}"`,
    "        ],",
    '        "onlyGitDirty": false',
    "      },",
    '      "metrics": { "enabled": false }',
    "    }",
    "  },",
    '  "method": "initialize",',
    '  "jsonrpc": "2.0"',
    "}",
    "Initializing server",
    "[00.11][DEBUG](default): Initializing server with initializationOptions:",
    "{",
    '  "scan": {',
    '    "ci": false,',
    '    "configuration": [',
    `      "${jsonRules}"`,
    "    ]",
    "  }",
    "}",
    "[00.11][DEBUG](default): Initializing preemptive threads",
    "Caching workspace targets",
    "Finished caching workspace targets",
    "[00.11][DEBUG](default): Initialized server with session:",
    "{ Legacy_session.capabilities =",
    "  {",
    '    "codeActionProvider": true,',
    '    "executeCommandProvider": {',
    '      "commands": [ "semgrep/ignore", "semgrep/autofix" ]',
    "    }",
    "  };",
    "  workspace_folders =",
    "  [c:\\ProgramData\\x\\work\\lsp\\ws];",
    "  cached_workspace_targets = <opaque>; cached_scans = <opaque>;",
    "  cached_session =",
    "  { Legacy_session.rules = <opaque>; skipped_app_fingerprints = [];",
    "    open_documents = []; initialized = false; deployment_id = None;",
    "    lock = <opaque> };",
    "  is_intellij = false }",
    "Server initialized",
    "[00.24][DEBUG](default): Sending response {",
    '  "id": "lsp-rules-init-1",',
    '  "jsonrpc": "2.0",',
    '  "result": {',
    '    "capabilities": { "hoverProvider": true },',
    '    "serverInfo": { "name": "Semgrep", "version": "9.9.9" }',
    "  }",
    "}",
  ];
}

export interface RefreshOptions {
  rulesDir: string;
  /** 로딩 줄의 파일 이름. 기본은 프로브. */
  file?: string;
  /** 구분자: 기본은 역슬래시(Windows). */
  separator?: "\\" | "/";
}

/** 예측한 정상 경로의 `initialized` 이후 줄(소스에서 도출). */
export function refreshLines(o: RefreshOptions): string[] {
  const sep = o.separator ?? "\\";
  const file = `${o.rulesDir.replace(/[\\/]+$/, "")}${sep}${o.file ?? PROBE_FILE_NAME}`;
  return [
    '[00.80][DEBUG](default): Handling notification { "method": "initialized", "params": {}, "jsonrpc": "2.0" }',
    "Refreshing rules",
    "[00.80][INFO]: Checking for API token in environment variables",
    "[00.80][INFO]: No API token found in environment variables",
    "[00.80][INFO]: No settings file found, using default settings",
    "[00.81][DEBUG](default): CI disabled, not checking API token",
    `[00.81][INFO]: loading local config from ${file}`,
    `[00.82][INFO]: Done loading local config from ${file}`,
    "[00.82][INFO]: Got 0 errors while refreshing rules in language server",
    "Rules refreshed",
    "Scanning open documents",
    "[00.83][WARNING]: No targets to scan! Not scanning anything.",
    "Scanned open documents",
  ];
}

export const SHUTDOWN_LINES: string[] = [
  "[00.90][DEBUG](default): Handling request:",
  '{ "id": 0, "method": "shutdown", "jsonrpc": "2.0" }',
  "Shutting down server",
  '[00.90][DEBUG](default): Handling notification { "method": "exit", "jsonrpc": "2.0" }',
  "[00.90][DEBUG](default): Server exiting",
  "Server stopped",
  "[00.90][DEBUG](default): Producing exit code 0 (OK)",
];

/** 서두 + 정상 새로고침 + 종료 줄. 필요하면 줄 단위로 바꿔 시나리오를 만든다. */
export function happyStderrLines(rulesDir: string): string[] {
  return [...preambleLines(rulesDir), ...refreshLines({ rulesDir }), ...SHUTDOWN_LINES];
}

// ── stdout 프레임 ─────────────────────────────────────────────────

export const RULES_REFRESHED: JsonRpcMessage = {
  jsonrpc: "2.0",
  method: "semgrep/rulesRefreshed",
  params: {},
};

export const progressCreate = (id: number | string, token: string): JsonRpcMessage => ({
  jsonrpc: "2.0",
  id,
  method: "window/workDoneProgress/create",
  params: { token },
});

export const progressNotification = (token: string, kind: string): JsonRpcMessage => ({
  jsonrpc: "2.0",
  method: "$/progress",
  params: { token, value: { kind, title: "x" } },
});

export function frames(messages: readonly JsonRpcMessage[]): Uint8Array {
  const parts = messages.map((m) => encodeFrame(m));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}
