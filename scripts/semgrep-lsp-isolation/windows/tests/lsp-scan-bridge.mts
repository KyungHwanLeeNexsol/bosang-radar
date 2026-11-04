// tests/Test-LspScanRunner.ps1 이 tsx 로 부르는 작은 다리(시험 전용, 아무것도 쓰지 않는다). 실제 TS 모듈(scripts/semgrep-lsp)을 읽어서
//  · golden   : TS ↔ PowerShell 골든 사례(URI 비교, 감시 대본, 요청 검사, 송신 방어선, 한도 해석)를 만든다. tests/lsp-scan-parity.json 은 이 출력이다.
//  · verdicts : 러너 결과 JSON 들을 실제 어댑터(factsFromScanRunnerResult)와 기록 만들기(buildScanRecord)에 통과시켜 판정을 돌려준다.
//  · contract : PowerShell 계약 이식본(LspScanContract.ps1)과 대조할 TS 쪽 값(상수, 메시지, 환경, 배치)을 돌려준다.
//  · frames   : tests/Test-LspScanFrame.ps1 이 만든 바이트 조각(hex)을 실제 TS FrameDecoder 에 그대로 먹이고 프레임 수·오류 종류·오류 위치를 돌려준다.
// 인자: <사용 안 함> <golden|verdicts|contract|frames> <입력 파일 또는 작업 폴더>. 결과는 표준 출력에 JSON 한 줄이다.
// 실제 Semgrep 과 무관하다. 사례의 입력은 합성 값이며 소스에서 도출한 예측을 담는다(실제 바이너리 출력이 아니다).

import { readFileSync } from "node:fs";
import { FrameDecoder } from "../../../semgrep-lsp/framing";
import * as lm from "../../../semgrep-lsp/lsp-min";
import * as lr from "../../../semgrep-lsp/lsp-rules";
import * as ls from "../../../semgrep-lsp/lsp-scan";
import {
  analyzeScanProgress,
  type ScanProgressAnalysis,
} from "../../../semgrep-lsp/lsp-scan-progress";
import * as rec from "../../../semgrep-lsp/lsp-scan-record";
import * as rr from "../../../semgrep-lsp/lsp-scan-runner-result";
import {
  runScanWatchScript,
  type ScanWatchEvent,
  type ScanWatchScript,
} from "../../../semgrep-lsp/lsp-scan-watch";
import { compareScanUri } from "../../../semgrep-lsp/scan-uri";
import { sha256Hex } from "../../../semgrep-lsp/sha";
import {
  bytesOf,
  externalCommandLine,
  frames,
  goodNotification,
  publishDiagnostics,
  scanLay,
  scanPostOpenLines,
  scanStderrParts,
  barrierStdoutMessages,
  GOOD_DIAGNOSTIC,
  PROGRESS_REFRESH,
  PROGRESS_SCAN,
  RULES_REFRESHED,
  TARGET_URI,
  openDocumentsProgress,
  progressBegin,
  progressCreate,
  progressEnd,
  refreshProgress,
  scanInitResponse,
} from "../../../semgrep-lsp/testing/scan-fixtures";
import { chunked, toHex, watchConfig } from "../../../semgrep-lsp/testing/scan-watch-cases";
import { preambleLines } from "../../../semgrep-lsp/testing/rules-fixtures";

const mode = process.argv[3];
const arg = process.argv[4] ?? "";

interface Case {
  id: string;
  kind: string;
  input: unknown;
  expected: unknown;
}

// ── 감시 대본 조립 ────────────────────────────────────────────────

interface Build {
  /** 장벽까지(서두·초기화 응답·장벽 줄)의 청크 크기. 없으면 한 덩어리. */
  preSize?: number;
  /** didOpen 뒤 청크 크기. 없으면 한 덩어리. */
  postSize?: number;
  diagAtMs?: number;
  logAtMs?: number;
  didOpenAtMs?: number;
  pre?: string[];
  post?: string[];
  postMessages?: Parameters<typeof frames>[0];
  logFirst?: boolean;
  /** 로그 묶음 뒤 나머지 덤프를 따로 보내지 않는다(묶음 끝에서 stderr 가 끝난다). */
  noRest?: boolean;
  /** 진단과 로그 묶음 도착을 같은 시각으로 놓는다. */
  config?: Partial<ReturnType<typeof watchConfig>>;
}

function script(o: Build = {}): ScanWatchScript {
  const parts = scanStderrParts();
  const pre = o.pre ?? parts.pre;
  const post = o.post ?? parts.post;
  const diagAt = o.diagAtMs ?? 1400;
  const logAt = o.logAtMs ?? 1500;
  const didOpenAt = o.didOpenAtMs ?? 1000;
  const preamble = bytesOf(preambleLines(scanLay.rulesDir));
  const barrierLines = bytesOf(pre).subarray(preamble.byteLength);
  const messages = barrierStdoutMessages();
  const events: ScanWatchEvent[] = [
    ...chunked("stderr", preamble, 100, o.preSize),
    ...chunked("stdout", frames(messages.slice(0, 1)), 200, o.preSize),
    { op: "initializedSent" },
    ...chunked("stdout", frames(messages.slice(1)), 600, o.preSize),
    ...chunked("stderr", barrierLines, 650, o.preSize),
    { op: "barrierDone", tMs: 700 },
    { op: "didOpenSent", tMs: didOpenAt },
  ];
  const cut = post.indexOf("Found 1 matches") + 1;
  const logBundle = bytesOf(cut > 0 ? post.slice(0, cut) : post);
  const logRest = cut > 0 && o.noRest !== true ? bytesOf(post.slice(cut)) : new Uint8Array(0);
  const diag = frames(o.postMessages ?? [goodNotification()]);
  const diagEvents = chunked("stdout", diag, diagAt, o.postSize);
  const logEvents = [
    ...chunked("stderr", logBundle, logAt, o.postSize),
    ...(logRest.byteLength > 0 ? chunked("stderr", logRest, logAt + 10, o.postSize) : []),
  ];
  const ordered =
    o.logFirst === true ? [...logEvents, ...diagEvents] : [...diagEvents, ...logEvents];
  return { config: { ...watchConfig(), ...(o.config ?? {}) }, events: [...events, ...ordered] };
}

const goodPost = scanPostOpenLines(scanLay);
const withLine = (line: string, at = goodPost.length - 6): string[] => [
  ...goodPost.slice(0, at),
  line,
  ...goodPost.slice(at),
];
const swap = (lines: string[], a: string, b: string): string[] => {
  const out = [...lines];
  const i = out.indexOf(a);
  const j = out.indexOf(b);
  [out[i], out[j]] = [out[j], out[i]];
  return out;
};
const preLines = scanStderrParts().pre;
const preWith = (line: string): string[] => {
  const at = preLines.indexOf("Scanned open documents");
  return [...preLines.slice(0, at), line, ...preLines.slice(at)];
};

function watchCases(): Case[] {
  const defs: [string, Build][] = [
    ["happy", {}],
    ["happy-log-first", { logFirst: true, logAtMs: 1200, diagAtMs: 1400 }],
    ["happy-simultaneous", { diagAtMs: 1500, logAtMs: 1500 }],
    ["happy-chunks-64", { preSize: 64, postSize: 64 }],
    ["happy-post-chunks-9", { postSize: 9 }],
    ["happy-log-first-post-chunks-23", { logFirst: true, postSize: 23 }],
    ["settle-from-later-bundle", { didOpenAtMs: 900, diagAtMs: 1000, logAtMs: 9000 }],
    [
      "settle-from-later-diagnostic",
      { didOpenAtMs: 900, diagAtMs: 9000, logAtMs: 1000, logFirst: true },
    ],
    ["late-log", { logAtMs: 31500, diagAtMs: 1400 }],
    ["late-diag", { diagAtMs: 31500, logAtMs: 1500 }],
    ["diag-only", { post: [] }],
    ["log-only", { postMessages: [] }],
    ["duplicate-diag", { postMessages: [goodNotification(), goodNotification()] }],
    [
      "other-uri",
      { postMessages: [goodNotification("file:///c%3A/other/ws/lsp-scan-1-target.txt")] },
    ],
    [
      "malformed-diag-params",
      {
        postMessages: [
          {
            jsonrpc: "2.0",
            method: "textDocument/publishDiagnostics",
            params: { uri: TARGET_URI },
          },
        ],
      },
    ],
    [
      "wrong-log-order",
      {
        post: swap(
          goodPost,
          "[01.02][INFO]: Scanning 1 targets",
          "[01.20][INFO]: Found 1 matches before processing"
        ),
      },
    ],
    ["engine-error-line", { post: withLine("[01.10][ERROR]: engine failure") }],
    [
      "skipped-rule",
      {
        post: goodPost.map((l) =>
          l === "Semgrep skipped 0 rules" ? "Semgrep skipped 1 rules" : l
        ),
      },
    ],
    [
      "errors-nonempty",
      { post: goodPost.map((l) => (l === "Semgrep errors: " ? "Semgrep errors: boom" : l)) },
    ],
    [
      "no-targets",
      { post: withLine("[01.05][WARNING]: No targets to scan! Not scanning anything.") },
    ],
    ["extra-scan-in-settle", { post: [...goodPost, "Scanning single file"] }],
    ["pre-open-scan-line", { pre: preWith("Scanning single file") }],
    ["pre-open-diagnostic-frame", {}],
    ["external-ok-twice", { post: withLine(externalCommandLine(scanLay.workspace, "01.03"), 4) }],
    [
      "external-wrong-command",
      {
        post: goodPost.map((l) =>
          l.includes("Running external command") ? l.replace('"git"', '"hg"') : l
        ),
      },
    ],
    [
      "external-wrong-path",
      {
        post: goodPost.map((l) =>
          l.includes("Running external command")
            ? l.replace(/"[a-z]:\\[^"]*"/, '"c:\\\\elsewhere"')
            : l
        ),
      },
    ],
    ["workspace-scan-line", { post: withLine("Scanning workspace") }],
    [
      "download-line",
      { post: withLine("[01.10][INFO]: trying to download from https://example.invalid/x") },
    ],
    ["server-request-after-didopen", {}],
    ["unexpected-notification-after-didopen", {}],
  ];
  const out: Case[] = [];
  for (const [id, build] of defs) {
    let s = script(build);
    if (id === "pre-open-diagnostic-frame") {
      // 장벽 직전(didOpen 전)에 진단 프레임이 이미 와 있다.
      const at = s.events.findIndex((e) => e.op === "barrierDone");
      const ev: ScanWatchEvent = {
        op: "stdout",
        hex: toHex(frames([goodNotification()])),
        tMs: 690,
      };
      s = { ...s, events: [...s.events.slice(0, at), ev, ...s.events.slice(at)] };
    }
    if (id === "server-request-after-didopen") {
      const ev: ScanWatchEvent = {
        op: "stdout",
        hex: toHex(
          frames([
            {
              jsonrpc: "2.0",
              id: 9,
              method: "window/workDoneProgress/create",
              params: { token: "t" },
            },
          ])
        ),
        tMs: 1300,
      };
      const at = s.events.findIndex((e) => e.op === "didOpenSent");
      s = { ...s, events: [...s.events.slice(0, at + 1), ev, ...s.events.slice(at + 1)] };
    }
    if (id === "unexpected-notification-after-didopen") {
      const ev: ScanWatchEvent = {
        op: "stdout",
        hex: toHex(frames([{ jsonrpc: "2.0", method: "semgrep/unknownThing", params: {} }])),
        tMs: 1300,
      };
      const at = s.events.findIndex((e) => e.op === "didOpenSent");
      s = { ...s, events: [...s.events.slice(0, at + 1), ev, ...s.events.slice(at + 1)] };
    }
    out.push({
      id: `watch:${id}`,
      kind: "watch-script",
      input: JSON.parse(JSON.stringify(s)),
      expected: JSON.parse(JSON.stringify(runScanWatchScript(s))),
    });
  }
  // 끝 처리: 덜 온 마지막 줄과 덜 온 프레임.
  const tail: ScanWatchScript = {
    config: watchConfig(),
    events: [
      {
        op: "stderr",
        hex: toHex(
          new TextEncoder().encode("[00.10][DEBUG](default): partial line without newline")
        ),
        tMs: 10,
      },
      { op: "stdout", hex: toHex(frames([goodNotification()]).subarray(0, 40)), tMs: 11 },
      { op: "stderrEnd" },
      { op: "stdoutEnd" },
    ],
  };
  out.push({
    id: "watch:ends",
    kind: "watch-script",
    input: JSON.parse(JSON.stringify(tail)),
    expected: JSON.parse(JSON.stringify(runScanWatchScript(tail))),
  });
  return out;
}

// ── URI 비교 ─────────────────────────────────────────────────────

function uriCases(): Case[] {
  const exp =
    "file:///c%3A/ProgramData/bosang-semgrep-iso/run-1/work/lsp-scan/ws/lsp-scan-1-target.txt";
  const list: [string, unknown, string][] = [
    ["identical", exp, exp],
    [
      "drive-colon-lower",
      "file:///c:/ProgramData/bosang-semgrep-iso/run-1/work/lsp-scan/ws/lsp-scan-1-target.txt",
      exp,
    ],
    [
      "drive-colon-upper",
      "file:///C:/ProgramData/bosang-semgrep-iso/run-1/work/lsp-scan/ws/lsp-scan-1-target.txt",
      exp,
    ],
    [
      "drive-encoded-upper-lower-hex",
      "file:///C%3a/ProgramData/bosang-semgrep-iso/run-1/work/lsp-scan/ws/lsp-scan-1-target.txt",
      exp,
    ],
    [
      "drive-encoded-lower-upper-hex",
      "file:///c%3A/ProgramData/bosang-semgrep-iso/run-1/work/lsp-scan/ws/lsp-scan-1-target.txt",
      exp,
    ],
    [
      "segment-case-differs",
      "file:///c%3A/ProgramData/Bosang-Semgrep-Iso/run-1/work/lsp-scan/ws/lsp-scan-1-target.txt",
      exp,
    ],
    [
      "file-case-differs",
      "file:///c%3A/ProgramData/bosang-semgrep-iso/run-1/work/lsp-scan/ws/LSP-SCAN-1-target.txt",
      exp,
    ],
    [
      "hyphen-encoded-same",
      "file:///c%3A/ProgramData/bosang%2Dsemgrep-iso/run-1/work/lsp-scan/ws/lsp-scan-1-target.txt",
      exp,
    ],
    [
      "other-file",
      "file:///c%3A/ProgramData/bosang-semgrep-iso/run-1/work/lsp-scan/ws/other.txt",
      exp,
    ],
    ["prefix-only", "file:///c%3A/ProgramData/bosang-semgrep-iso/run-1/work/lsp-scan/ws", exp],
    ["longer-than-expected", exp + "/x", exp],
    ["host", "file://localhost/c%3A/x/lsp-scan-1-target.txt", exp],
    ["unc", "file://server/share/lsp-scan-1-target.txt", exp],
    ["scheme-upper", "FILE:///c%3A/ProgramData/x", exp],
    ["scheme-http", "http://example.com/x", exp],
    ["single-slash", "file:/c%3A/ProgramData/x", exp],
    ["query", exp + "?a=1", exp],
    ["fragment", exp + "#frag", exp],
    ["truncated-percent", "file:///c%3A/ProgramData/bosang%2", exp],
    ["bad-hex-percent", "file:///c%3A/ProgramData/bosang%ZZ/x", exp],
    ["double-encoded", "file:///c%3A/ProgramData/bosang%252Dsemgrep-iso/x", exp],
    ["backslash", "file:///c%3A\\ProgramData\\x", exp],
    ["empty-segment", "file:///c%3A//ProgramData/x", exp],
    ["dot-segment", "file:///c%3A/ProgramData/./x", exp],
    ["dotdot-segment", "file:///c%3A/ProgramData/../x", exp],
    ["encoded-slash-segment", "file:///c%3A/ProgramData%2Fx", exp],
    ["encoded-nul-segment", "file:///c%3A/Program%00Data/x", exp],
    ["trailing-slash", exp + "/", exp],
    ["non-ascii", "file:///c%3A/ProgramData/한글.txt", exp],
    ["space", "file:///c%3A/Program Data/x", exp],
    ["empty-path", "file:///", exp],
    ["number", 7, exp],
    ["null", null, exp],
    ["expected-invalid", exp, "not-a-uri"],
    ["invalid-utf8", "file:///c%3A/%ff%fe/x", exp],
  ];
  return list.map(([id, actual, expected]) => ({
    id: `uri:${id}`,
    kind: "uri-compare",
    input: { actual, expected },
    expected: JSON.parse(JSON.stringify(compareScanUri(actual, expected))),
  }));
}

// ── 요청 검사 ────────────────────────────────────────────────────

const WORK = "C:\\ProgramData\\bosang-semgrep-iso\\run-1\\work\\lsp-scan";
const EXE = "C:\\dist\\venv\\Scripts\\semgrep.exe";
const TARGET_BYTES = new Uint8Array(
  readFileSync(new URL("../../../semgrep-lsp/data/lsp-scan-1-target.txt", import.meta.url))
);
const PROBE_BYTES = new Uint8Array(
  readFileSync(new URL("../../../semgrep-lsp/data/lsp-rules-1-probe.yaml", import.meta.url))
);
const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64");

interface PsRequest {
  mode: string;
  exe: string;
  args: string[];
  layout: Record<string, string>;
  env: Record<string, string>;
  limits: Record<string, unknown>;
  artifacts: { label: string; path: string }[];
  probeB64: string;
  targetB64: string;
}

function baseRequest(): PsRequest {
  const layout = ls.scanLayout(WORK);
  return {
    mode: "semgrep-lsp",
    exe: EXE,
    args: ["lsp", "--debug"],
    layout: { ...layout } as unknown as Record<string, string>,
    env: lm.buildLspMinEnv(layout, "C:\\Windows", "http://127.0.0.1:41999") as Record<
      string,
      string
    >,
    limits: {},
    artifacts: [],
    probeB64: b64(PROBE_BYTES),
    targetB64: b64(TARGET_BYTES),
  };
}

function tsRefusals(r: PsRequest): string[] {
  const bytes = (v: string): Uint8Array | undefined =>
    v === "" ? undefined : new Uint8Array(Buffer.from(v, "base64"));
  const out = ls.checkScanRequest(
    {
      runId: "run-1",
      command: r.exe,
      args: r.args,
      layout: r.layout as unknown as ls.ScanLayout,
      env: r.env,
      limits: r.limits as Partial<ls.ScanLimits>,
      artifacts: r.artifacts,
      probeBytes: bytes(r.probeB64),
      targetBytes: bytes(r.targetB64),
    },
    sha256Hex
  );
  return [...new Set(out)].sort();
}

function requestCases(): Case[] {
  const mutate = (id: string, f: (r: PsRequest) => void): Case => {
    const r = baseRequest();
    f(r);
    return { id: `request:${id}`, kind: "request-check", input: r, expected: tsRefusals(r) };
  };
  const flip = (b64s: string, at: number): string => {
    const bytes = new Uint8Array(Buffer.from(b64s, "base64"));
    bytes[at] ^= 1;
    return b64(bytes);
  };
  return [
    mutate("ok", () => {}),
    mutate("scan-ms-lowered", (r) => {
      r.limits = { scanMs: 1500, settleMs: 400 };
    }),
    mutate("scan-ms-raised", (r) => {
      r.limits = { scanMs: 60000 };
    }),
    mutate("scan-ms-zero", (r) => {
      r.limits = { scanMs: 0 };
    }),
    mutate("scan-ms-string", (r) => {
      r.limits = { scanMs: "x" };
    }),
    mutate("settle-raised", (r) => {
      r.limits = { settleMs: 5000 };
    }),
    mutate("rules-raised", (r) => {
      r.limits = { rulesMs: 120000 };
    }),
    mutate("limit-unknown", (r) => {
      r.limits = { retryMs: 10 };
    }),
    mutate("mode-exe-not-semgrep", (r) => {
      r.exe = "C:\\Windows\\System32\\cmd.exe";
    }),
    mutate("exe-relative", (r) => {
      r.exe = "semgrep.exe";
    }),
    mutate("args-extra", (r) => {
      r.args = ["lsp", "--debug", "--legacy"];
    }),
    mutate("args-version", (r) => {
      r.args = ["--version"];
    }),
    mutate("env-extra-log-srcs", (r) => {
      r.env.SEMGREP_LOG_SRCS = "x";
    }),
    mutate("env-extra-token", (r) => {
      r.env.SEMGREP_APP_TOKEN = "x";
    }),
    mutate("env-userprofile-wrong", (r) => {
      r.env.USERPROFILE = "C:\\Users\\other";
    }),
    mutate("env-path-wrong", (r) => {
      r.env.PATH = "C:\\Windows\\System32;C:\\Windows;C:\\extra";
    }),
    mutate("env-path-missing", (r) => {
      delete r.env.PATH;
    }),
    mutate("env-url-not-loopback", (r) => {
      r.env.SEMGREP_APP_URL = "http://example.com:80";
    }),
    mutate("layout-workspace-wrong", (r) => {
      r.layout.workspace = "C:\\elsewhere\\ws";
    }),
    mutate("layout-target-path-wrong", (r) => {
      r.layout.targetPath = "C:\\elsewhere\\ws\\lsp-scan-1-target.txt";
    }),
    mutate("layout-rules-dir-min", (r) => {
      r.layout.rulesDir = r.layout.stateDir + "\\rules-empty";
    }),
    mutate("work-unc", (r) => {
      r.layout = { ...ls.scanLayout("\\\\server\\share\\run") } as unknown as Record<
        string,
        string
      >;
    }),
    mutate("path-forbidden-fragment", (r) => {
      r.layout = {
        ...ls.scanLayout("C:\\ProgramData\\downloads\\run\\lsp-scan"),
      } as unknown as Record<string, string>;
      r.env = lm.buildLspMinEnv(
        r.layout as unknown as ls.ScanLayout,
        "C:\\Windows",
        "http://127.0.0.1:41999"
      ) as Record<string, string>;
    }),
    mutate("artifact-relative", (r) => {
      r.artifacts = [{ label: "w", path: "rel\\a.whl" }];
    }),
    mutate("probe-missing", (r) => {
      r.probeB64 = "";
    }),
    mutate("probe-hash", (r) => {
      r.probeB64 = flip(r.probeB64, 0);
    }),
    mutate("probe-size", (r) => {
      r.probeB64 = b64(new Uint8Array(10));
    }),
    mutate("target-missing", (r) => {
      r.targetB64 = "";
    }),
    mutate("target-hash", (r) => {
      r.targetB64 = flip(r.targetB64, 0);
    }),
    mutate("target-size", (r) => {
      r.targetB64 = b64(new Uint8Array(10));
    }),
    mutate("target-one-byte-longer", (r) => {
      r.targetB64 = b64(new Uint8Array([...TARGET_BYTES, 10]));
    }),
  ];
}

// ── 송신 방어선 ──────────────────────────────────────────────────

function outboundCases(): Case[] {
  const layout = ls.scanLayout(WORK);
  const text = new TextDecoder().decode(TARGET_BYTES);
  const ctx = (over: Partial<ls.ScanSendGuardContext> = {}): ls.ScanSendGuardContext => ({
    barrierDone: true,
    progressComplete: true,
    sent: ["initialize", "initialized"],
    expectedDidOpen: { uri: ls.scanTargetUri(layout), text },
    ...over,
  });
  const didOpen = ls.buildScanDidOpenMessage(layout, TARGET_BYTES);
  const withDoc = (patch: Record<string, unknown>): unknown => {
    const m = JSON.parse(JSON.stringify(didOpen)) as {
      params: { textDocument: Record<string, unknown> };
    };
    Object.assign(m.params.textDocument, patch);
    return m;
  };
  const list: [string, ls.ScanSendLabel, unknown, ls.ScanSendGuardContext][] = [
    ["initialize", "initialize", ls.buildScanInitializeMessage(layout), ctx({ sent: [] })],
    ["initialized", "initialized", ls.buildScanInitializedMessage(), ctx({ sent: ["initialize"] })],
    ["didOpen", "didOpen", didOpen, ctx()],
    [
      "shutdown",
      "shutdown",
      ls.buildScanShutdownMessage(),
      ctx({ sent: ["initialize", "initialized", "didOpen"] }),
    ],
    [
      "exit",
      "exit",
      ls.buildScanExitMessage(),
      ctx({ sent: ["initialize", "initialized", "didOpen", "shutdown"] }),
    ],
    ["didOpen-before-barrier", "didOpen", didOpen, ctx({ barrierDone: false })],
    ["didOpen-before-progress-complete", "didOpen", didOpen, ctx({ progressComplete: false })],
    [
      "didOpen-progress-complete-missing",
      "didOpen",
      didOpen,
      ctx({ progressComplete: undefined as unknown as boolean }),
    ],
    [
      "didOpen-progress-complete-not-boolean",
      "didOpen",
      didOpen,
      ctx({ progressComplete: "true" as unknown as boolean }),
    ],
    ["didOpen-twice", "didOpen", didOpen, ctx({ sent: ["initialize", "initialized", "didOpen"] })],
    ["didOpen-before-initialized", "didOpen", didOpen, ctx({ sent: ["initialize"] })],
    [
      "initialized-twice",
      "initialized",
      ls.buildScanInitializedMessage(),
      ctx({ sent: ["initialize", "initialized"] }),
    ],
    [
      "initialized-before-initialize",
      "initialized",
      ls.buildScanInitializedMessage(),
      ctx({ sent: [] }),
    ],
    ["initialize-after-initialized", "initialize", ls.buildScanInitializeMessage(layout), ctx()],
    ["shutdown-before-didopen-allowed-order", "shutdown", ls.buildScanShutdownMessage(), ctx()],
    [
      "exit-before-shutdown-order",
      "exit",
      ls.buildScanExitMessage(),
      ctx({ sent: ["initialize", "initialized", "exit"] }),
    ],
    ["didOpen-uri-other", "didOpen", withDoc({ uri: "file:///c%3A/other/x.txt" }), ctx()],
    ["didOpen-text-other", "didOpen", withDoc({ text: text + "x" }), ctx()],
    ["didOpen-language-other", "didOpen", withDoc({ languageId: "python" }), ctx()],
    ["didOpen-version-other", "didOpen", withDoc({ version: 2 }), ctx()],
    ["didOpen-extra-key", "didOpen", withDoc({ extra: 1 }), ctx()],
    [
      "didOpen-missing-key",
      "didOpen",
      {
        jsonrpc: "2.0",
        method: "textDocument/didOpen",
        params: { textDocument: { uri: ls.scanTargetUri(layout) } },
      },
      ctx(),
    ],
    [
      "didOpen-extra-params-key",
      "didOpen",
      {
        jsonrpc: "2.0",
        method: "textDocument/didOpen",
        params: {
          textDocument: (didOpen as { params: { textDocument: unknown } }).params.textDocument,
          z: 1,
        },
      },
      ctx(),
    ],
    ["didSave", "didOpen", { jsonrpc: "2.0", method: "textDocument/didSave", params: {} }, ctx()],
    [
      "didChange",
      "didOpen",
      { jsonrpc: "2.0", method: "textDocument/didChange", params: {} },
      ctx(),
    ],
    [
      "didClose",
      "shutdown",
      { jsonrpc: "2.0", method: "textDocument/didClose", params: {} },
      ctx(),
    ],
    [
      "scanWorkspace",
      "initialized",
      { jsonrpc: "2.0", method: "semgrep/scanWorkspace", params: {} },
      ctx({ sent: ["initialize"] }),
    ],
    [
      "refreshRules",
      "initialized",
      { jsonrpc: "2.0", method: "semgrep/refreshRules", params: {} },
      ctx({ sent: ["initialize"] }),
    ],
    [
      "workspace-folders",
      "initialized",
      { jsonrpc: "2.0", method: "workspace/didChangeWorkspaceFolders", params: {} },
      ctx({ sent: ["initialize"] }),
    ],
    [
      "files-created",
      "initialized",
      { jsonrpc: "2.0", method: "workspace/didCreateFiles", params: {} },
      ctx({ sent: ["initialize"] }),
    ],
    [
      "response-to-server-request",
      "exit",
      { jsonrpc: "2.0", id: 7, result: null },
      ctx({ sent: ["initialize", "initialized", "didOpen", "shutdown"] }),
    ],
    [
      "initialized-with-params",
      "initialized",
      { jsonrpc: "2.0", method: "initialized", params: { a: 1 } },
      ctx({ sent: ["initialize"] }),
    ],
    [
      "initialized-with-id",
      "initialized",
      { jsonrpc: "2.0", id: 1, method: "initialized", params: {} },
      ctx({ sent: ["initialize"] }),
    ],
    [
      "exit-with-params",
      "exit",
      { jsonrpc: "2.0", method: "exit", params: {} },
      ctx({ sent: ["initialize", "initialized", "didOpen", "shutdown"] }),
    ],
    [
      "label-unknown",
      "initialised" as ls.ScanSendLabel,
      { jsonrpc: "2.0", method: "initialised", params: {} },
      ctx({ sent: ["initialize"] }),
    ],
  ];
  return list.map(([id, label, message, c]) => {
    let verdict = "ok";
    try {
      ls.assertAllowedScanOutbound(label, message as never, c);
    } catch {
      verdict = "throws";
    }
    return {
      id: `outbound:${id}`,
      kind: "outbound",
      input: {
        label,
        message,
        ctx: {
          barrierDone: c.barrierDone,
          progressComplete: c.progressComplete,
          sent: [...c.sent],
          expectedUri: c.expectedDidOpen.uri,
          expectedText: c.expectedDidOpen.text,
        },
      },
      expected: verdict,
    };
  });
}

function limitCases(): Case[] {
  const list: [string, unknown][] = [
    ["empty", {}],
    ["scan-lower", { scanMs: 1000 }],
    ["scan-raised", { scanMs: 30001 }],
    ["scan-zero", { scanMs: 0 }],
    ["scan-nan-string", { scanMs: "x" }],
    [
      "all-lowered",
      { totalMs: 5000, initMs: 2000, exitMs: 2000, rulesMs: 3000, settleMs: 100, scanMs: 2000 },
    ],
    ["unknown", { barrierMs: 10 }],
    ["settle-raised", { settleMs: 2001 }],
  ];
  return list.map(([id, over]) => {
    const r = ls.resolveScanLimits(over as Partial<ls.ScanLimits>);
    return {
      id: `limits:${id}`,
      kind: "limits",
      input: over,
      expected: JSON.parse(JSON.stringify({ limits: r.limits, problems: r.problems })),
    };
  });
}

// ── 초기 진행 메시지 장벽 ─────────────────────────────────────────

type Msg = Parameters<typeof frames>[0][number];

function progressSummary(a: ScanProgressAnalysis): unknown {
  return {
    state: a.state,
    complete: a.complete,
    problems: [...a.problems],
    pending: [...a.pending],
    violations: [...a.violations],
    lifecycles: a.lifecycles.map((l) => ({
      ordinal: l.ordinal,
      stage: l.stage,
      status: l.status,
      tokenType: l.tokenType,
      requestIdType: l.requestIdType,
    })),
    requestsValid: a.requests.filter((r) => r.valid).length,
    notificationOutcomes: a.notifications.map((n) => n.outcome),
  };
}

function progressCases(): Case[] {
  const [c1, b1, e1] = refreshProgress();
  const [c2, b2, e2] = openDocumentsProgress();
  const raw = (m: unknown): Msg => m as Msg;
  const create = (id: number | string, token: number | string): Msg =>
    raw({ jsonrpc: "2.0", id, method: "window/workDoneProgress/create", params: { token } });
  const list: [string, Msg[]][] = [
    ["good", [c1, b1, e1, RULES_REFRESHED, c2, b2, e2]],
    ["empty", []],
    ["first-only", [c1, b1, e1, RULES_REFRESHED]],
    ["second-create-only", [c1, b1, e1, RULES_REFRESHED, c2]],
    ["second-create-begin", [c1, b1, e1, RULES_REFRESHED, c2, b2]],
    ["no-rules-refreshed", [c1, b1, e1, c2, b2, e2]],
    ["token-duplicate", [c1, c1, b1, e1, RULES_REFRESHED, c2, b2, e2]],
    [
      "request-id-duplicate",
      [
        c1,
        b1,
        e1,
        RULES_REFRESHED,
        progressCreate(PROGRESS_REFRESH.id, PROGRESS_SCAN.token),
        b2,
        e2,
      ],
    ],
    ["third-create", [c1, b1, e1, RULES_REFRESHED, c2, b2, e2, progressCreate("third", "t3")]],
    [
      "create-invalid-no-params",
      [
        raw({ jsonrpc: "2.0", id: 1, method: "window/workDoneProgress/create" }),
        c1,
        b1,
        e1,
        RULES_REFRESHED,
        c2,
        b2,
        e2,
      ],
    ],
    [
      "begin-unregistered-token",
      [
        c1,
        progressBegin("nobody", "Semgrep", "Refreshing Rules"),
        b1,
        e1,
        RULES_REFRESHED,
        c2,
        b2,
        e2,
      ],
    ],
    ["begin-before-create", [b1, c1, e1, RULES_REFRESHED, c2, b2, e2]],
    ["begin-duplicate", [c1, b1, b1, e1, RULES_REFRESHED, c2, b2, e2]],
    ["end-duplicate", [c1, b1, e1, e1, RULES_REFRESHED, c2, b2, e2]],
    ["end-without-begin", [c1, e1, b1, RULES_REFRESHED, c2, b2, e2]],
    [
      "kind-report",
      [
        c1,
        b1,
        raw({
          jsonrpc: "2.0",
          method: "$/progress",
          params: { token: PROGRESS_REFRESH.token, value: { kind: "report", message: "x" } },
        }),
        e1,
        RULES_REFRESHED,
        c2,
        b2,
        e2,
      ],
    ],
    [
      "stage-unknown",
      [
        c1,
        progressBegin(PROGRESS_REFRESH.token, "Semgrep", "Something Else"),
        e1,
        RULES_REFRESHED,
        c2,
        b2,
        e2,
      ],
    ],
    [
      "stage-swapped",
      [
        c1,
        progressBegin(
          PROGRESS_REFRESH.token,
          "Semgrep Scan in Progress",
          "Scanning Open Documents"
        ),
        e1,
        RULES_REFRESHED,
        c2,
        progressBegin(PROGRESS_SCAN.token, "Semgrep", "Refreshing Rules"),
        e2,
      ],
    ],
    [
      "notification-no-value",
      [
        c1,
        raw({ jsonrpc: "2.0", method: "$/progress", params: { token: PROGRESS_REFRESH.token } }),
        b1,
        e1,
        RULES_REFRESHED,
        c2,
        b2,
        e2,
      ],
    ],
    [
      "end-extra-key",
      [
        c1,
        b1,
        raw({
          jsonrpc: "2.0",
          method: "$/progress",
          params: { token: PROGRESS_REFRESH.token, value: { kind: "end", message: "done" } },
        }),
        RULES_REFRESHED,
        c2,
        b2,
        e2,
      ],
    ],
    ["rules-refreshed-twice", [c1, b1, e1, RULES_REFRESHED, c2, b2, e2, RULES_REFRESHED]],
    [
      "token-type-mismatch-number-vs-string",
      [
        create("a", 1),
        progressBegin("1", "Semgrep", "Refreshing Rules"),
        progressEnd("1"),
        RULES_REFRESHED,
        c2,
        b2,
        e2,
      ],
    ],
    [
      "token-number-and-string-are-different",
      [
        create("a", 1),
        progressBegin(1, "Semgrep", "Refreshing Rules"),
        progressEnd(1),
        RULES_REFRESHED,
        create("b", "1"),
        progressBegin("1", "Semgrep Scan in Progress", "Scanning Open Documents"),
        progressEnd("1"),
      ],
    ],
    [
      "numeric-ids-and-tokens-ok",
      [
        create(10, 7),
        progressBegin(7, "Semgrep", "Refreshing Rules"),
        progressEnd(7),
        RULES_REFRESHED,
        create(11, 8),
        progressBegin(8, "Semgrep Scan in Progress", "Scanning Open Documents"),
        progressEnd(8),
      ],
    ],
    [
      "request-id-used-as-token",
      [
        c1,
        progressBegin(PROGRESS_REFRESH.id, "Semgrep", "Refreshing Rules"),
        b1,
        e1,
        RULES_REFRESHED,
        c2,
        b2,
        e2,
      ],
    ],
    ["order-second-create-before-first-end", [c1, b1, c2, e1, RULES_REFRESHED, b2, e2]],
    ["order-rules-refreshed-before-first-end", [c1, b1, RULES_REFRESHED, e1, c2, b2, e2]],
    ["order-second-create-before-rules-refreshed", [c1, b1, e1, c2, b2, RULES_REFRESHED, e2]],
  ];
  return list.map(([id, messages]) => {
    const input = JSON.parse(JSON.stringify({ messages }));
    const a = analyzeScanProgress(
      messages.map((message, index) => ({ index, startByte: null, endByte: null, message }))
    );
    return {
      id: `progress:${id}`,
      kind: "progress-analysis",
      input,
      expected: JSON.parse(JSON.stringify(progressSummary(a))),
    };
  });
}

/** 두 번째 초기 진행 묶음이 stderr 의 `Scanned open documents` 줄 뒤에 늦게 오는 감시 대본(스트림이 독립이라 가능한 순서). */
function lateProgressWatchCases(): Case[] {
  const [c1, b1, e1] = refreshProgress();
  const [c2, b2, e2] = openDocumentsProgress();
  const parts = scanStderrParts();
  const preamble = bytesOf(preambleLines(scanLay.rulesDir));
  const barrierLines = bytesOf(parts.pre).subarray(preamble.byteLength);
  const happy = script({});
  const open = happy.events.findIndex((e) => e.op === "didOpenSent");
  const tail = happy.events.slice(open); // didOpenSent, 진단, 로그
  const head = (first: Msg[]): ScanWatchEvent[] => [
    ...chunked("stderr", preamble, 100),
    ...chunked("stdout", frames([scanInitResponse()]), 200),
    { op: "initializedSent" },
    ...chunked("stdout", frames(first), 600),
    ...chunked("stderr", barrierLines, 650),
  ];
  const secondEvents = (messages: Msg[], size?: number): ScanWatchEvent[] =>
    messages.flatMap((m, i) => chunked("stdout", frames([m]), 700 + 10 * i, size));
  const make = (id: string, first: Msg[], second: ScanWatchEvent[], open_: boolean): Case => {
    const s: ScanWatchScript = {
      config: watchConfig(),
      events: [
        ...head(first),
        ...second,
        ...(open_ ? [{ op: "barrierDone", tMs: 800 } as ScanWatchEvent, ...tail] : []),
      ],
    };
    return {
      id: `watch:${id}`,
      kind: "watch-script",
      input: JSON.parse(JSON.stringify(s)),
      expected: JSON.parse(JSON.stringify(runScanWatchScript(s))),
    };
  };
  const full = [c1, b1, e1, RULES_REFRESHED];
  const endBytes = frames([e2]);
  return [
    make("late-second-progress-complete", full, secondEvents([c2, b2, e2]), true),
    make("late-second-progress-chunks-7", full, secondEvents([c2, b2, e2], 7), true),
    make("late-second-progress-none", full, [], false),
    make("late-second-progress-create-only", full, secondEvents([c2]), false),
    make("late-second-progress-create-begin", full, secondEvents([c2, b2]), false),
    make(
      "late-second-progress-end-partial",
      full,
      [
        ...secondEvents([c2, b2]),
        { op: "stdout", hex: toHex(endBytes.subarray(0, endBytes.byteLength - 3)), tMs: 730 },
      ],
      false
    ),
    make(
      "late-second-progress-wrong-token",
      full,
      secondEvents([
        c2,
        progressBegin("not-the-token", "Semgrep Scan in Progress", "Scanning Open Documents"),
        progressEnd("not-the-token"),
      ]),
      false
    ),
    make(
      "late-second-progress-token-reused",
      full,
      secondEvents(openDocumentsProgress({ id: "other-request", token: PROGRESS_REFRESH.token })),
      false
    ),
    make(
      "old-order-end-after-rules-refreshed",
      [c1, b1, RULES_REFRESHED, e1],
      secondEvents([c2, b2, e2]),
      false
    ),
  ];
}

function goldenCases(): Case[] {
  return [
    ...uriCases(),
    ...watchCases(),
    ...lateProgressWatchCases(),
    ...progressCases(),
    ...requestCases(),
    ...outboundCases(),
    ...limitCases(),
  ];
}

if (mode === "golden") {
  console.log(
    `[\n${goldenCases()
      .map((c) => JSON.stringify(c))
      .join(",\n")}\n]`
  );
} else if (mode === "verdicts") {
  const items: { name: string; path: string; ctx: rr.ScanRunnerContext }[] = JSON.parse(
    readFileSync(arg, "utf8")
  );
  const out = items.map((item) => {
    const json = JSON.parse(readFileSync(item.path, "utf8").replace(/^\uFEFF/, ""));
    const facts = rr.factsFromScanRunnerResult(json, item.ctx);
    const r = rec.buildScanRecord(facts);
    return {
      name: item.name,
      status: r.status,
      verdict: r.verdict,
      reasons: r.verdict_reasons,
      cleanupOk: r.cleanup.ok,
      trigger: r.termination.trigger,
      abort: r.termination.abort ? r.termination.abort.condition : null,
      sent: r.sent.map((s) => s.label),
      external: facts.externalReasons ?? [],
      bothCompleteAtMs: facts.liveView ? facts.liveView.bothCompleteAtMs : null,
    };
  });
  console.log(JSON.stringify(out));
} else if (mode === "frames") {
  // 입력: [{ id, chunks: [hex, ...] }]. 같은 바이트를 같은 조각 나눔으로 TS 디코더에 먹인다(첫 오류만 기록, 이후 조각은 영구 실패 상태에서 버려진다).
  const items: { id: string; chunks: string[] }[] = JSON.parse(readFileSync(arg, "utf8"));
  const fromHex = (hex: string): Uint8Array =>
    Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16));
  const out = items.map((item) => {
    const decoder = new FrameDecoder();
    let frames = 0;
    let error: { kind: string; atByte: number } | null = null;
    for (const hex of item.chunks) {
      const r = decoder.push(fromHex(hex));
      frames += r.messages.length;
      if (r.error && error === null) error = { kind: r.error.kind, atByte: r.error.atByte };
    }
    return {
      id: item.id,
      frames,
      failed: decoder.failed,
      kind: error ? error.kind : null,
      atByte: error ? error.atByte : null,
    };
  });
  console.log(JSON.stringify(out));
} else if (mode === "contract") {
  const work = arg;
  const layout = ls.scanLayout(work);
  const text = new TextDecoder().decode(TARGET_BYTES);
  console.log(
    JSON.stringify({
      consts: {
        args: [...ls.LSP_SCAN_ARGS],
        initId: ls.LSP_SCAN_INIT_ID,
        shutdownId: ls.LSP_SCAN_SHUTDOWN_ID,
        probeFile: ls.LSP_SCAN_PROBE_FILE,
        probeSha: ls.LSP_SCAN_PROBE_SHA256,
        probeBytes: ls.LSP_SCAN_PROBE_BYTES,
        targetFile: ls.LSP_SCAN_TARGET_FILE,
        targetSha: ls.LSP_SCAN_TARGET_SHA256,
        targetBytes: ls.LSP_SCAN_TARGET_BYTES,
        targetToken: ls.LSP_SCAN_TARGET_TOKEN,
        sendOrder: [...ls.LSP_SCAN_SEND_ORDER],
        limits: ls.LSP_SCAN_LIMITS,
        jobs: ls.LSP_SCAN_JOBS,
        codes: [...ls.LSP_SCAN_EXPECTED_DIAGNOSTIC.codes],
        source: ls.LSP_SCAN_EXPECTED_DIAGNOSTIC.source,
        message: ls.LSP_SCAN_EXPECTED_DIAGNOSTIC.message,
        severity: ls.LSP_SCAN_EXPECTED_DIAGNOSTIC.severity,
        didOpenLanguage: ls.LSP_SCAN_DID_OPEN_LANGUAGE_ID,
        didOpenVersion: ls.LSP_SCAN_DID_OPEN_VERSION,
        envNames: [...lm.LSP_MIN_ENV_NAMES],
        abortNames: ls.SCAN_ABORT_NAME,
        progressMethod: lr.PROGRESS_CREATE_METHOD,
      },
      layout,
      rootUri: ls.scanRootUri(layout),
      targetUri: ls.scanTargetUri(layout),
      init: ls.buildScanInitializeMessage(layout),
      initialized: ls.buildScanInitializedMessage(),
      didOpen: ls.buildScanDidOpenMessage(layout, TARGET_BYTES),
      shutdown: ls.buildScanShutdownMessage(),
      exit: ls.buildScanExitMessage(),
      env: lm.buildLspMinEnv(layout, "C:\\Windows", "http://127.0.0.1:41999"),
      text,
      goodDiagnostic: GOOD_DIAGNOSTIC,
      publish: publishDiagnostics("u", []),
    })
  );
} else {
  console.error("unknown mode");
  process.exit(2);
}
