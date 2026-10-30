import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildLspMinEnv } from "./lsp-min";
import {
  LSP_RULES_ARGS,
  LSP_RULES_LIMITS,
  LSP_RULES_PROBE_BYTES,
  LSP_RULES_PROBE_FILE,
  LSP_RULES_PROBE_SHA256,
  LSP_RULES_SEND_ORDER,
  RulesStderrWatcher,
  RulesStdoutTracker,
  analyzeRulesStdout,
  assertAllowedRulesOutbound,
  buildRulesExitMessage,
  buildRulesInitializeMessage,
  buildRulesInitializedMessage,
  buildRulesShutdownMessage,
  checkRulesRequest,
  forbiddenFragmentIn,
  isDriveAbsolute,
  isValidProgressCreate,
  probePathOf,
  resolveRulesLimits,
  rulesLayout,
  rulesRootViolation,
  type RulesRequestShape,
} from "./lsp-rules";
import { enc, frames, progressCreate, RULES_REFRESHED } from "./testing/rules-fixtures";
import {
  CORE,
  EXE,
  URL as METRICS_URL,
  WORK,
  happyStdoutMessages,
  layout,
} from "./testing/rules-facts";
import type { JsonRpcMessage } from "./types";

const sha = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
const PROBE = new Uint8Array(
  readFileSync(new URL("./data/lsp-rules-1-probe.yaml", import.meta.url))
);

const request = (over: Partial<RulesRequestShape> = {}): RulesRequestShape => ({
  runId: "run-1",
  command: EXE,
  args: ["lsp", "--debug"],
  layout,
  env: buildLspMinEnv(layout, "C:/Windows", METRICS_URL),
  artifacts: [{ label: "core", path: CORE }],
  probeBytes: PROBE,
  ...over,
});
const refusals = (over: Partial<RulesRequestShape> = {}): string[] =>
  checkRulesRequest(request(over), sha);

describe("프로브 규칙 파일", () => {
  it("저장소의 파일 바이트가 계약의 크기·sha256과 같다 (구현 상수와 파일이 어긋나지 않는다)", () => {
    expect(PROBE.byteLength).toBe(LSP_RULES_PROBE_BYTES);
    expect(sha(PROBE)).toBe(LSP_RULES_PROBE_SHA256);
    expect(LSP_RULES_PROBE_FILE).toBe("lsp-rules-1-probe.yaml");
  });

  it("규칙 본문은 보고서 6.2절의 전문과 같다", () => {
    expect(new TextDecoder().decode(PROBE)).toBe(
      [
        "rules:",
        "  - id: lsp-rules-1-probe",
        "    message: LSP-RULES-1 probe rule. It is loaded but is not expected to match any target.",
        "    severity: INFO",
        "    languages:",
        "      - generic",
        "    pattern: LSP_RULES_1_PROBE_TOKEN_THAT_IS_NEVER_PRESENT",
        "",
      ].join("\n")
    );
  });
});

describe("요청 검사 (checkRulesRequest)", () => {
  it("정상 요청은 거절 사유가 없다", () => {
    expect(refusals()).toEqual([]);
  });

  it("실행 파일·인자", () => {
    expect(refusals({ command: "semgrep.exe" })).toContain("COMMAND_NOT_ABSOLUTE");
    expect(refusals({ command: "/usr/bin/semgrep.exe" })).toContain("COMMAND_NOT_ABSOLUTE");
    expect(refusals({ command: "\\\\server\\share\\semgrep.exe" })).toContain(
      "COMMAND_NOT_ABSOLUTE"
    );
    expect(refusals({ command: "C:/venv/Scripts/python.exe" })).toContain(
      "COMMAND_NAME_NOT_ALLOWED"
    );
    for (const args of [
      ["lsp"],
      ["lsp", "--debug", "--x"],
      ["--debug", "lsp"],
      ["lsp", "--verbose"],
    ]) {
      expect(refusals({ args }), args.join(" ")).toContain("ARGS_NOT_FIXED");
    }
    expect([...LSP_RULES_ARGS]).toEqual(["lsp", "--debug"]);
  });

  it("실행 ID와 한도", () => {
    expect(refusals({ runId: "bad id!" })).toContain("RUN_ID_INVALID");
    expect(refusals({ limits: { rulesMs: LSP_RULES_LIMITS.rulesMs + 1 } })).toContain(
      "LIMIT_ABOVE_CAP:rulesMs"
    );
    expect(refusals({ limits: { settleMs: 0 } })).toContain("LIMIT_INVALID:settleMs");
    expect(refusals({ limits: { rulesMs: 30_000, settleMs: 1_000 } })).toEqual([]);
  });

  it("작업 폴더: 드라이브 문자로 시작하는 절대 경로만 (UNC·유닉스식·상대 경로는 거절)", () => {
    for (const work of ["/tmp/w", "\\\\server\\share\\w", "work/w", "w", ""]) {
      const l = rulesLayout(work);
      const r = refusals({ layout: l, env: buildLspMinEnv(l, "C:/Windows", METRICS_URL) });
      expect(r, work).toContain("WORK_DIR_NOT_DRIVE_ABSOLUTE");
      expect(r, work).toContain("RULES_DIR_NOT_DRIVE_ABSOLUTE");
    }
    expect(isDriveAbsolute("C:\\x")).toBe(true);
    expect(isDriveAbsolute("d:/x")).toBe(true);
    expect(isDriveAbsolute("C:x")).toBe(false);
  });

  it("배치는 작업 폴더에서 도출한 것과 같아야 한다", () => {
    expect(refusals({ layout: { ...layout, rulesDir: "C:/elsewhere/rules" } })).toContain(
      "LAYOUT_MISMATCH"
    );
    expect(refusals({ layout: { ...layout, homeDir: "C:/elsewhere/home" } })).toContain(
      "LAYOUT_MISMATCH"
    );
  });

  it("레지스트리·내려받기·토큰으로 읽힐 문구가 경로에 있으면 시작 전에 거절한다", () => {
    for (const word of ["registry", "download", "Scanning", "using auto", "api token"]) {
      const l = rulesLayout(`C:/work/${word}-run`);
      const r = refusals({ layout: l, env: buildLspMinEnv(l, "C:/Windows", METRICS_URL) });
      expect(
        r.some((x) => x.startsWith("PATH_CONTAINS_FORBIDDEN_FRAGMENT")),
        word
      ).toBe(true);
    }
    expect(
      forbiddenFragmentIn("C:/ProgramData/bosang-semgrep-iso/20261029T060257Z-5386c62f/work/rules")
    ).toBeNull();
    expect(refusals({ command: "C:/registry/semgrep.exe" })).toContain(
      "PATH_CONTAINS_FORBIDDEN_FRAGMENT:COMMAND"
    );
    expect(refusals({ artifacts: [{ label: "x", path: "C:/download/core.exe" }] })).toContain(
      "PATH_CONTAINS_FORBIDDEN_FRAGMENT:ARTIFACT"
    );
    expect(refusals({ artifacts: [{ label: "x", path: "core.exe" }] })).toContain(
      "ARTIFACT_PATH_NOT_DRIVE_ABSOLUTE"
    );
    expect(refusals({ artifacts: [{ label: "", path: CORE }] })).toContain(
      "ARTIFACT_LABEL_INVALID"
    );
  });

  it("환경은 LSP-MIN-1과 같은 11개 이름·값이어야 한다: 로그 출처·토큰·버전 확인 이름은 허용하지 않는다", () => {
    const env = buildLspMinEnv(layout, "C:/Windows", METRICS_URL);
    expect(Object.keys(env)).toHaveLength(11);
    for (const extra of [
      "SEMGREP_LOG_SRCS",
      "SEMGREP_APP_TOKEN",
      "SEMGREP_ENABLE_VERSION_CHECK",
      "HTTP_PROXY",
    ]) {
      expect(refusals({ env: { ...env, [extra]: "x" } }), extra).toContain(
        `ENV_NAME_NOT_ALLOWED:${extra}`
      );
    }
    const missing: Record<string, string> = { ...env };
    delete missing.PATH;
    expect(refusals({ env: missing })).toContain("ENV_NAME_MISSING:PATH");
    expect(refusals({ env: { ...env, USERPROFILE: "C:/Users/someone" } })).toContain(
      "ENV_VALUE_UNEXPECTED:USERPROFILE"
    );
    expect(refusals({ env: { ...env, SEMGREP_APP_URL: "https://semgrep.dev" } })).toContain(
      "ENV_URL_NOT_LOOPBACK"
    );
    expect(refusals({ env: { ...env, SEMGREP_APP_URL: "http://localhost:80" } })).toContain(
      "ENV_URL_NOT_LOOPBACK"
    );
  });

  it("프로브: 없거나 크기·해시가 다르면 복사 전에 거절한다", () => {
    expect(refusals({ probeBytes: undefined })).toContain("PROBE_BYTES_MISSING");
    expect(refusals({ probeBytes: PROBE.slice(0, 232) })).toContain("PROBE_SIZE_MISMATCH");
    const flipped = PROBE.slice();
    flipped[10] ^= 1;
    expect(refusals({ probeBytes: flipped })).toContain("PROBE_HASH_MISMATCH");
    const crlf = enc(new TextDecoder().decode(PROBE).replace(/\n/g, "\r\n"));
    expect(refusals({ probeBytes: crlf })).toEqual(
      expect.arrayContaining([expect.stringMatching(/^PROBE_(SIZE|HASH)_MISMATCH$/)])
    );
  });

  it("거절 사유에는 경로·환경 값이 들어가지 않는다", () => {
    const env = {
      ...buildLspMinEnv(layout, "C:/Windows", METRICS_URL),
      SECRET_NAME: "super-secret-value",
    };
    const joined = refusals({ env, command: "C:/Users/someone/private/tool.exe" }).join(" ");
    expect(joined).not.toContain("super-secret-value");
    expect(joined).not.toContain("someone");
  });
});

describe("보내는 메시지와 쓰기 직전 방어선", () => {
  it("네 메시지의 모양", () => {
    expect([...LSP_RULES_SEND_ORDER]).toEqual(["initialize", "initialized", "shutdown", "exit"]);
    expect(buildRulesInitializedMessage()).toEqual({
      jsonrpc: "2.0",
      method: "initialized",
      params: {},
    });
    expect(buildRulesShutdownMessage()).toEqual({
      jsonrpc: "2.0",
      id: "lsp-rules-shutdown-1",
      method: "shutdown",
    });
    expect(buildRulesExitMessage()).toEqual({ jsonrpc: "2.0", method: "exit" });
    const init = buildRulesInitializeMessage(layout);
    expect(init.id).toBe("lsp-rules-init-1");
    const params = init.params as {
      initializationOptions: { scan: Record<string, unknown>; metrics: Record<string, unknown> };
    };
    expect(params.initializationOptions.scan.configuration).toEqual([layout.rulesDir]);
    expect(params.initializationOptions.scan.ci).toBe(false);
    expect(params.initializationOptions.scan.onlyGitDirty).toBe(false);
    expect(params.initializationOptions.metrics).toEqual({ enabled: false });
  });

  it("허용된 넷은 통과한다", () => {
    assertAllowedRulesOutbound("initialize", buildRulesInitializeMessage(layout));
    assertAllowedRulesOutbound("initialized", buildRulesInitializedMessage());
    assertAllowedRulesOutbound("shutdown", buildRulesShutdownMessage());
    assertAllowedRulesOutbound("exit", buildRulesExitMessage());
  });

  it("문서 알림·작업 영역 변경·scanWorkspace·refreshRules·debug/echo, 서버 요청에 대한 응답은 어느 이름으로도 못 쓴다", () => {
    const bad: JsonRpcMessage[] = [
      { jsonrpc: "2.0", method: "textDocument/didOpen", params: {} },
      { jsonrpc: "2.0", method: "textDocument/didChange", params: {} },
      { jsonrpc: "2.0", method: "textDocument/didSave", params: {} },
      { jsonrpc: "2.0", method: "textDocument/didClose", params: {} },
      { jsonrpc: "2.0", method: "workspace/didChangeWorkspaceFolders", params: {} },
      { jsonrpc: "2.0", method: "semgrep/scanWorkspace", params: {} },
      { jsonrpc: "2.0", method: "semgrep/refreshRules", params: {} },
      { jsonrpc: "2.0", id: "x", method: "debug/echo", params: {} },
      { jsonrpc: "2.0", id: 1, result: null }, // window/workDoneProgress/create에 대한 응답
      { jsonrpc: "2.0", id: 1, error: { code: -32601, message: "no" } },
    ];
    for (const label of LSP_RULES_SEND_ORDER) {
      for (const message of bad) {
        expect(
          () => assertAllowedRulesOutbound(label, message),
          `${label} ${String(message.method)}`
        ).toThrow();
      }
    }
  });

  it("initialized는 params가 정확히 {}이고 id가 없어야 한다. shutdown·exit에는 params가 없다", () => {
    expect(() =>
      assertAllowedRulesOutbound("initialized", { jsonrpc: "2.0", method: "initialized" })
    ).toThrow();
    expect(() =>
      assertAllowedRulesOutbound("initialized", {
        jsonrpc: "2.0",
        method: "initialized",
        params: { a: 1 },
      })
    ).toThrow();
    expect(() =>
      assertAllowedRulesOutbound("initialized", {
        jsonrpc: "2.0",
        id: 1,
        method: "initialized",
        params: {},
      })
    ).toThrow();
    expect(() =>
      assertAllowedRulesOutbound("exit", { jsonrpc: "2.0", method: "exit", params: {} })
    ).toThrow();
    expect(() =>
      assertAllowedRulesOutbound("shutdown", {
        jsonrpc: "2.0",
        id: "x",
        method: "shutdown",
        params: {},
      })
    ).toThrow();
    expect(() =>
      assertAllowedRulesOutbound("initialize", { jsonrpc: "2.0", method: "initialize" })
    ).toThrow();
  });
});

describe("서버 진행 요청의 올바른 모양 (window/workDoneProgress/create)", () => {
  it("올바른 모양만 허용한다", () => {
    expect(isValidProgressCreate(progressCreate(1, "t"))).toBe(true);
    expect(isValidProgressCreate(progressCreate("a-1", "t"))).toBe(true);
    expect(
      isValidProgressCreate({
        jsonrpc: "2.0",
        id: 2,
        method: "window/workDoneProgress/create",
        params: { token: 7 },
      })
    ).toBe(true);
  });

  const invalid: [string, Record<string, unknown>][] = [
    [
      "jsonrpc 버전",
      { jsonrpc: "1.0", id: 1, method: "window/workDoneProgress/create", params: { token: "t" } },
    ],
    [
      "id 없음",
      { jsonrpc: "2.0", method: "window/workDoneProgress/create", params: { token: "t" } },
    ],
    [
      "id가 null",
      {
        jsonrpc: "2.0",
        id: null,
        method: "window/workDoneProgress/create",
        params: { token: "t" },
      },
    ],
    [
      "id가 불리언",
      {
        jsonrpc: "2.0",
        id: true,
        method: "window/workDoneProgress/create",
        params: { token: "t" },
      },
    ],
    ["params 없음", { jsonrpc: "2.0", id: 1, method: "window/workDoneProgress/create" }],
    [
      "params가 배열",
      { jsonrpc: "2.0", id: 1, method: "window/workDoneProgress/create", params: [] },
    ],
    ["token 없음", { jsonrpc: "2.0", id: 1, method: "window/workDoneProgress/create", params: {} }],
    [
      "token 형식",
      { jsonrpc: "2.0", id: 1, method: "window/workDoneProgress/create", params: { token: {} } },
    ],
    [
      "params의 다른 키",
      {
        jsonrpc: "2.0",
        id: 1,
        method: "window/workDoneProgress/create",
        params: { token: "t", x: 1 },
      },
    ],
    [
      "최상위의 다른 키",
      {
        jsonrpc: "2.0",
        id: 1,
        method: "window/workDoneProgress/create",
        params: { token: "t" },
        result: null,
      },
    ],
    [
      "다른 메서드",
      { jsonrpc: "2.0", id: 1, method: "window/showMessageRequest", params: { token: "t" } },
    ],
    [
      "대소문자",
      { jsonrpc: "2.0", id: 1, method: "Window/workDoneProgress/create", params: { token: "t" } },
    ],
  ];
  for (const [name, message] of invalid) {
    it(`거절: ${name}`, () => {
      expect(isValidProgressCreate(message as unknown as JsonRpcMessage)).toBe(false);
    });
  }
});

describe("감시 폴더 규칙 (A5′)", () => {
  it("작업 영역은 아무 파일도 안 되고, 규칙 폴더는 프로브 하나만 되며, 홈은 지문 폴더 아래만 된다", () => {
    expect(rulesRootViolation("WORKSPACE", "a.txt")).toBe(true);
    expect(rulesRootViolation("RULES_DIR", "lsp-rules-1-probe.yaml")).toBe(false);
    expect(rulesRootViolation("RULES_DIR", "LSP-RULES-1-PROBE.YAML")).toBe(false); // Windows는 대소문자를 구별하지 않는다
    expect(rulesRootViolation("RULES_DIR", "other.yaml")).toBe(true);
    expect(rulesRootViolation("RULES_DIR", "sub/lsp-rules-1-probe.yaml")).toBe(true);
    expect(rulesRootViolation("RULES_DIR", "lsp-rules-1-probe.yaml.bak")).toBe(true);
    expect(
      rulesRootViolation("HOME_DIR", ".semgrep/cache/fingerprinted_ignored_findings/ws.txt")
    ).toBe(false);
    expect(
      rulesRootViolation("HOME_DIR", ".semgrep\\cache\\fingerprinted_ignored_findings\\ws.txt")
    ).toBe(false);
    expect(rulesRootViolation("HOME_DIR", ".semgrep/settings.yml")).toBe(true);
  });

  it("프로브 경로는 규칙 폴더 + 파일 이름이다", () => {
    expect(probePathOf(layout)).toBe(`${layout.rulesDir}/lsp-rules-1-probe.yaml`);
    expect(layout.work).toBe(WORK);
  });
});

describe("stdout 분석과 실시간 추적", () => {
  it("정상 stdout: 알림 1회, 진행 요청 2건 모두 허용, 허용 밖 알림 없음", () => {
    const a = analyzeRulesStdout(frames(happyStdoutMessages()), true);
    expect(a.rulesRefreshedCount).toBe(1);
    expect(a.serverRequestCount).toBe(2);
    expect(a.serverRequests.every((r) => r.allowed)).toBe(true);
    expect(a.diagnosticsCount).toBe(0);
    expect(a.otherNotifications).toEqual({});
    expect(a.initMessage).not.toBeNull();
    expect(a.frameError).toBeNull();
  });

  it("추적기: initialized 전 알림은 A1, 허용 밖 요청·3건째는 A6, 진단은 A1", () => {
    const t = new RulesStdoutTracker();
    expect(t.onMessage(RULES_REFRESHED)).toEqual({
      condition: "A1",
      detail: "PRE_INITIALIZED:rulesRefreshed",
    });
    const u = new RulesStdoutTracker();
    expect(u.onMessage(progressCreate(1, "a"))).toEqual({
      condition: "A6",
      detail: "REQUEST_BEFORE_INITIALIZED",
    });
    const v = new RulesStdoutTracker();
    v.initializedSent = true;
    expect(v.onMessage(progressCreate(1, "a"))).toBeNull();
    expect(v.onMessage(progressCreate(2, "b"))).toBeNull();
    expect(v.onMessage(progressCreate(3, "c"))).toEqual({
      condition: "A6",
      detail: "TOO_MANY_PROGRESS_REQUESTS",
    });
    expect(v.onMessage(RULES_REFRESHED)).toBeNull();
    expect(v.rulesRefreshedSeen).toBe(true);
    expect(
      v.onMessage({ jsonrpc: "2.0", method: "textDocument/publishDiagnostics", params: {} })
    ).toEqual({ condition: "A1", detail: "textDocument/publishDiagnostics" });
    expect(
      v.onMessage({ jsonrpc: "2.0", id: 9, method: "workspace/configuration", params: {} })
    ).toEqual({ condition: "A6", detail: "workspace/configuration" });
  });
});

describe("stderr 실시간 감시기", () => {
  it("initialized 전의 새로고침·스캔 신호는 A1, 이후에는 정상이다", () => {
    const before = new RulesStderrWatcher();
    expect(before.push(enc("Refreshing rules\r\n"))).toEqual({
      condition: "A1",
      detail: "PRE_INITIALIZED:refreshingRules",
    });
    const after = new RulesStderrWatcher();
    after.initializedSent = true;
    expect(after.push(enc("Refreshing rules\r\nScanning open documents\r\n"))).toBeNull();
    expect(after.scannedOpenDocumentsSeen).toBe(false);
    expect(after.push(enc("Scanned open documents\r\n"))).toBeNull();
    expect(after.scannedOpenDocumentsSeen).toBe(true);
  });

  it("장벽의 stderr 쪽 절반은 initialized를 보낸 뒤, 모양이 맞는 맨줄일 때만 채워진다", () => {
    const early = new RulesStderrWatcher();
    early.push(enc("Scanned open documents\r\n"));
    expect(early.scannedOpenDocumentsSeen).toBe(false);
    const headed = new RulesStderrWatcher();
    headed.initializedSent = true;
    headed.push(enc("[00.1][INFO]: Scanned open documents\r\n"));
    expect(headed.scannedOpenDocumentsSeen).toBe(false);
    const embedded = new RulesStderrWatcher();
    embedded.initializedSent = true;
    embedded.push(
      enc(
        '[00.1][DEBUG](default): Handling request:\r\n{\r\n  "m": [\r\nScanned open documents\r\n]\r\n}\r\n'
      )
    );
    expect(embedded.scannedOpenDocumentsSeen).toBe(false);
  });

  it("금지 키는 initialized 뒤에도 중단이다: 스캔 계열 A1, 네트워크 계열 A2", () => {
    const scan = new RulesStderrWatcher();
    scan.initializedSent = true;
    expect(scan.push(enc("Running Semgrep with 1 rules\r\n"))).toEqual({
      condition: "A1",
      detail: "runningRules",
    });
    const net = new RulesStderrWatcher();
    net.initializedSent = true;
    expect(net.push(enc("[00.1][INFO]: Found API token in environment variables\r\n"))).toEqual({
      condition: "A2",
      detail: "tokenFound",
    });
  });

  it("download·registry는 청크 경계에 걸쳐도 어디에 있든 A2다 (LSP-MIN-1과 같은 감시)", () => {
    const w = new RulesStderrWatcher();
    w.initializedSent = true;
    expect(w.push(enc("[00.1][DEBUG](default): a down"))).toBeNull();
    expect(w.push(enc("load b\r\n"))).toEqual({ condition: "A2", detail: "download" });
    expect(w.push(enc("registry\r\n"))).toBeNull(); // 처음 찾은 것만 돌려준다
    expect(w.hit?.detail).toBe("download");
  });

  it("초기화 오류 로그 문구를 청크 경계에 걸쳐도 기억한다", () => {
    const w = new RulesStderrWatcher();
    w.push(enc("[00.1][ERROR]: Error initia"));
    w.push(enc("lizing server: boom\r\n"));
    expect(w.initErrorLogged).toBe(true);
  });

  it("개행 없는 마지막 줄은 end에서 본다", () => {
    const w = new RulesStderrWatcher();
    w.initializedSent = true;
    expect(w.push(enc("Scanning workspace"))).toBeNull();
    expect(w.end()).toEqual({ condition: "A1", detail: "scanningWorkspace" });
  });
});

describe("한도 해석", () => {
  it("기본값은 소유자 결정: 장벽 60초, 장벽 뒤 2초, 전체 150초", () => {
    expect(LSP_RULES_LIMITS.rulesMs).toBe(60_000);
    expect(LSP_RULES_LIMITS.settleMs).toBe(2_000);
    expect(LSP_RULES_LIMITS.totalMs).toBe(150_000);
    expect(LSP_RULES_LIMITS.initMs).toBe(60_000);
    expect(LSP_RULES_LIMITS.exitMs).toBe(30_000);
  });

  it("낮추는 것만 된다", () => {
    expect(resolveRulesLimits({ rulesMs: 1_000 }).limits.rulesMs).toBe(1_000);
    expect(resolveRulesLimits({ rulesMs: 60_001 }).problems).toEqual(["LIMIT_ABOVE_CAP:rulesMs"]);
    expect(resolveRulesLimits({ totalMs: 150_001 }).problems).toEqual(["LIMIT_ABOVE_CAP:totalMs"]);
    expect(resolveRulesLimits({ nope: 1 } as never).problems).toEqual(["LIMIT_UNKNOWN:nope"]);
    expect(resolveRulesLimits({ settleMs: Number.NaN }).problems).toEqual([
      "LIMIT_INVALID:settleMs",
    ]);
  });
});
