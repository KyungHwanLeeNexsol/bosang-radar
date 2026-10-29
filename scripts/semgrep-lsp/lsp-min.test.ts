import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical";
import { buildChildEnv, buildVersionChildEnv } from "./cli";
import { encodeFrame } from "./framing";
import {
  ABORT_NETWORK_PATTERNS,
  ABORT_SCAN_PATTERNS,
  ALLOWED_IMAGES,
  LSP_MIN_ARGS,
  LSP_MIN_ENV_NAMES,
  LSP_MIN_INIT_ID,
  LSP_MIN_LIMITS,
  LSP_MIN_SEND_ORDER,
  StderrWatcher,
  analyzeInitResponse,
  analyzeStderrBytes,
  analyzeStdoutBytes,
  assertAllowedOutbound,
  buildExitMessage,
  buildInitializeMessage,
  buildInitializeParams,
  buildLspMinChildEnv,
  buildLspMinEnv,
  buildObservationRecord,
  buildShutdownMessage,
  checkLspMinRequest,
  classifyInitResponseCore,
  classifyServerMessage,
  descendantsOf,
  findAbortPattern,
  imageNameOf,
  lspMinLayout,
  resolveLimits,
  rootViolation,
  type LspMinFacts,
  type LspMinRequestShape,
} from "./lsp-min";
import type { JsonRpcMessage, ProcessRow, ProcessSnapshot } from "./types";

// ── 공통 재료 ───────────────────────────────────────────────────

const layout = lspMinLayout("C:\\Users\\bsi\\work\\run-1");
const WIN = "C:\\Windows";
const URL_LOOPBACK = "http://127.0.0.1:41999";

function goodRequest(over: Partial<LspMinRequestShape> = {}): LspMinRequestShape {
  return {
    runId: "run-1",
    command: "C:\\venv\\Scripts\\semgrep.exe",
    args: ["lsp", "--debug"],
    layout,
    env: buildLspMinEnv(layout, WIN, URL_LOOPBACK),
    ...over,
  };
}

function response(result: unknown, over: Record<string, unknown> = {}): JsonRpcMessage {
  return { jsonrpc: "2.0", id: LSP_MIN_INIT_ID, result, ...over } as JsonRpcMessage;
}

const GOOD = {
  capabilities: { textDocumentSync: 1 },
  serverInfo: { name: "Semgrep", version: "9.9.9" },
};

function row(partial: Partial<ProcessRow> & { pid: number }): ProcessRow {
  return {
    ppid: null,
    startTime: null,
    name: null,
    executable: null,
    args: null,
    cwd: null,
    vanished: false,
    ...partial,
  };
}

function snapshotOf(rows: ProcessRow[], parentLinkNeedsStartTime = false): ProcessSnapshot {
  return { source: "windows-cim", parentLinkNeedsStartTime, rows };
}

// ── 고정 계약 ───────────────────────────────────────────────────

describe("고정 계약", () => {
  it("실행 인자는 정확히 [lsp, --debug]이고 얼려 있다", () => {
    expect([...LSP_MIN_ARGS]).toEqual(["lsp", "--debug"]);
    expect(Object.isFrozen(LSP_MIN_ARGS)).toBe(true);
  });

  it("보낼 수 있는 메시지는 initialize → shutdown → exit 셋뿐이다", () => {
    expect([...LSP_MIN_SEND_ORDER]).toEqual(["initialize", "shutdown", "exit"]);
  });

  it("새 실행기 전용 상한: 전체 150초, stdout 1 MiB, stderr 256 KiB (소유자 결정)", () => {
    expect(LSP_MIN_LIMITS.totalMs).toBe(150_000);
    expect(LSP_MIN_LIMITS.maxStdoutBytes).toBe(1024 * 1024);
    expect(LSP_MIN_LIMITS.maxStderrBytes).toBe(256 * 1024);
    // 나머지는 기존 REAL_LIMITS와 같은 값에서 가져온 것이다(init 60초, exit 30초, 유예 10초).
    expect(LSP_MIN_LIMITS.initMs).toBe(60_000);
    expect(LSP_MIN_LIMITS.exitMs).toBe(30_000);
    expect(LSP_MIN_LIMITS.stdinCloseGraceMs).toBe(10_000);
    expect(LSP_MIN_LIMITS.killConfirmMs).toBe(10_000);
  });

  it("기존 REAL_LIMITS는 바꾸지 않았다(cli.ts의 원문 값 그대로)", () => {
    const cli = readFileSync(new URL("./cli.ts", import.meta.url), "utf8");
    const block = /const REAL_LIMITS: SessionLimits = \{([^}]*)\};/.exec(cli)?.[1] ?? "";
    expect(block.replace(/\s+/g, " ").trim()).toBe(
      "init: 60_000, rules: 600_000, scan: 1_800_000, echo: 60_000, exit: 30_000, killGrace: 10_000,"
    );
  });

  it("허용 이미지는 다섯 개뿐이다", () => {
    expect([...ALLOWED_IMAGES].sort()).toEqual(
      ["conhost.exe", "pysemgrep.exe", "python.exe", "semgrep-core.exe", "semgrep.exe"].sort()
    );
  });

  it("환경 이름 집합에 SEMGREP_ENABLE_VERSION_CHECK가 없다(소유자 결정)", () => {
    expect(LSP_MIN_ENV_NAMES).not.toContain("SEMGREP_ENABLE_VERSION_CHECK");
    const env = buildLspMinEnv(layout, WIN, URL_LOOPBACK);
    expect(Object.keys(env)).not.toContain("SEMGREP_ENABLE_VERSION_CHECK");
  });
});

describe("resolveLimits", () => {
  it("아무것도 안 주면 기본값이다", () => {
    expect(resolveLimits(undefined)).toEqual({ limits: { ...LSP_MIN_LIMITS }, problems: [] });
  });
  it("기본값 이하로는 줄일 수 있다", () => {
    const r = resolveLimits({ totalMs: 1000, maxStdoutBytes: 10 });
    expect(r.problems).toEqual([]);
    expect(r.limits.totalMs).toBe(1000);
    expect(r.limits.maxStdoutBytes).toBe(10);
  });
  it("기본값을 넘겨 올리면 거절한다", () => {
    expect(resolveLimits({ totalMs: 150_001 }).problems).toEqual(["LIMIT_ABOVE_CAP:totalMs"]);
    expect(resolveLimits({ maxStderrBytes: 262_145 }).problems).toEqual([
      "LIMIT_ABOVE_CAP:maxStderrBytes",
    ]);
  });
  it("0, 음수, NaN, 문자열, 알 수 없는 키를 거절한다", () => {
    expect(resolveLimits({ initMs: 0 }).problems).toEqual(["LIMIT_INVALID:initMs"]);
    expect(resolveLimits({ initMs: -1 }).problems).toEqual(["LIMIT_INVALID:initMs"]);
    expect(resolveLimits({ initMs: Number.NaN }).problems).toEqual(["LIMIT_INVALID:initMs"]);
    expect(resolveLimits({ initMs: "5" as unknown as number }).problems).toEqual([
      "LIMIT_INVALID:initMs",
    ]);
    expect(resolveLimits({ bogus: 1 } as never).problems).toEqual(["LIMIT_UNKNOWN:bogus"]);
  });
});

// ── 요청 검사 ───────────────────────────────────────────────────

describe("checkLspMinRequest", () => {
  it("정상 요청은 거절 사유가 없다", () => {
    expect(checkLspMinRequest(goodRequest())).toEqual([]);
  });

  it.each([
    [
      "다른 실행 파일 이름",
      { command: "C:\\venv\\Scripts\\pysemgrep.exe" },
      "COMMAND_NAME_NOT_ALLOWED",
    ],
    ["semgrep-core.exe", { command: "C:\\x\\semgrep-core.exe" }, "COMMAND_NAME_NOT_ALLOWED"],
    ["확장자 없음", { command: "C:\\x\\semgrep" }, "COMMAND_NAME_NOT_ALLOWED"],
    ["상대 경로", { command: "Scripts\\semgrep.exe" }, "COMMAND_NOT_ABSOLUTE"],
    ["이름만", { command: "semgrep.exe" }, "COMMAND_NOT_ABSOLUTE"],
    ["인자 없음", { args: [] }, "ARGS_NOT_FIXED"],
    ["lsp만", { args: ["lsp"] }, "ARGS_NOT_FIXED"],
    ["인자 순서 바뀜", { args: ["--debug", "lsp"] }, "ARGS_NOT_FIXED"],
    ["인자 추가(--legacy)", { args: ["lsp", "--debug", "--legacy"] }, "ARGS_NOT_FIXED"],
    ["--x-eio-ls", { args: ["lsp", "--debug", "--x-eio-ls"] }, "ARGS_NOT_FIXED"],
    ["--version", { args: ["--version"] }, "ARGS_NOT_FIXED"],
    ["runId 형식", { runId: "../escape" }, "RUN_ID_INVALID"],
  ] as const)("거절: %s", (_name, over, token) => {
    expect(checkLspMinRequest(goodRequest(over as Partial<LspMinRequestShape>))).toContain(token);
  });

  it("작업 폴더가 절대 경로가 아니면 거절한다", () => {
    const rel = lspMinLayout("work\\run-1");
    expect(
      checkLspMinRequest(goodRequest({ layout: rel, env: buildLspMinEnv(rel, WIN, URL_LOOPBACK) }))
    ).toContain("WORK_DIR_NOT_ABSOLUTE");
  });

  it("배치: 작업 폴더에서 도출한 값과 다른 폴더를 가리키는 요청은 거절한다 (감시 폴더를 다른 곳으로 돌리지 못한다)", () => {
    for (const key of ["workspace", "stateDir", "rulesDir", "homeDir", "tmpDir"] as const) {
      const bad = { ...layout, [key]: "C:\\elsewhere\\x" };
      expect(checkLspMinRequest(goodRequest({ layout: bad })), key).toContain("LAYOUT_MISMATCH");
    }
    expect(checkLspMinRequest(goodRequest())).not.toContain("LAYOUT_MISMATCH");
  });

  it.each(["download", "registry", "Refreshing Rules", "Error Initializing Server"])(
    "실행 파일 경로에 중단 문구(%s)가 있으면 시작 전에 거절한다 — 단 한 번의 실행이 스스로 중단되지 않게",
    (phrase) => {
      const refusals = checkLspMinRequest(goodRequest({ command: `C:\\${phrase}\\semgrep.exe` }));
      expect(refusals).toContain("PATH_CONTAINS_ABORT_PATTERN:COMMAND");
      expect(JSON.stringify(refusals)).not.toContain(phrase);
    }
  );

  it("환경: 허용 목록 밖의 이름은 이름만 사유에 남기고 거절한다(값은 싣지 않는다)", () => {
    const env = { ...buildLspMinEnv(layout, WIN, URL_LOOPBACK), HTTPS_PROXY: "http://user:pass@x" };
    const refusals = checkLspMinRequest(goodRequest({ env }));
    expect(refusals).toContain("ENV_NAME_NOT_ALLOWED:HTTPS_PROXY");
    expect(JSON.stringify(refusals)).not.toContain("user:pass");
  });

  it("환경: SEMGREP_ENABLE_VERSION_CHECK를 더하면 거절한다 — 값이 0이어도", () => {
    const env = { ...buildLspMinEnv(layout, WIN, URL_LOOPBACK), SEMGREP_ENABLE_VERSION_CHECK: "0" };
    expect(checkLspMinRequest(goodRequest({ env }))).toContain(
      "ENV_NAME_NOT_ALLOWED:SEMGREP_ENABLE_VERSION_CHECK"
    );
  });

  it.each([
    "GITHUB_TOKEN",
    "SEMGREP_APP_TOKEN",
    "HOME",
    "APPDATA",
    "PYTHONPATH",
    "HTTP_PROXY",
    "SEMGREP_LOG_LEVEL",
  ])("환경: %s 는 거절한다", (name) => {
    const env = { ...buildLspMinEnv(layout, WIN, URL_LOOPBACK), [name]: "x" };
    expect(checkLspMinRequest(goodRequest({ env }))).toContain(`ENV_NAME_NOT_ALLOWED:${name}`);
  });

  it("환경: 필수 이름이 빠지거나 값이 계약과 다르면 거절한다", () => {
    const env = buildLspMinEnv(layout, WIN, URL_LOOPBACK) as Record<string, string>;
    const withoutHome = Object.fromEntries(
      Object.entries(env).filter(([name]) => name !== "USERPROFILE")
    );
    expect(checkLspMinRequest(goodRequest({ env: withoutHome }))).toContain(
      "ENV_NAME_MISSING:USERPROFILE"
    );
    expect(
      checkLspMinRequest(goodRequest({ env: { ...env, USERPROFILE: "C:\\Users\\parent" } }))
    ).toContain("ENV_VALUE_UNEXPECTED:USERPROFILE");
    expect(checkLspMinRequest(goodRequest({ env: { ...env, TEMP: "C:\\Temp" } }))).toContain(
      "ENV_VALUE_UNEXPECTED:TEMP"
    );
  });

  it("환경: 수신기 주소는 127.0.0.1의 http 주소여야 한다", () => {
    for (const url of [
      "http://example.com:80",
      "http://localhost:5",
      "https://127.0.0.1:5",
      "http://127.0.0.1",
      "http://0.0.0.0:5",
    ]) {
      const env = buildLspMinEnv(layout, WIN, url);
      expect(checkLspMinRequest(goodRequest({ env }))).toContain("ENV_URL_NOT_LOOPBACK");
    }
  });

  it("한도를 올리려 하면 거절한다", () => {
    expect(checkLspMinRequest(goodRequest({ limits: { totalMs: 999_999 } }))).toContain(
      "LIMIT_ABOVE_CAP:totalMs"
    );
  });

  it.each(["Downloads", "registry-x", "Scanning workspace", "Rules Refreshed"])(
    "감시 폴더 경로에 중단 문구(%s)가 있으면 스스로 중단되지 않게 거절한다",
    (word) => {
      const bad = lspMinLayout(`C:\\work\\${word}\\run-1`);
      const refusals = checkLspMinRequest(
        goodRequest({ layout: bad, env: buildLspMinEnv(bad, WIN, URL_LOOPBACK) })
      );
      expect(refusals.some((r) => r.startsWith("PATH_CONTAINS_ABORT_PATTERN:"))).toBe(true);
    }
  );

  it("설치물 경로도 같은 검사를 받는다", () => {
    expect(
      checkLspMinRequest(
        goodRequest({ artifacts: [{ label: "w", path: "C:\\x\\registry\\a.whl" }] })
      )
    ).toContain("PATH_CONTAINS_ABORT_PATTERN:ARTIFACT");
    expect(
      checkLspMinRequest(goodRequest({ artifacts: [{ label: "w", path: "rel\\a.whl" }] }))
    ).toContain("ARTIFACT_PATH_NOT_ABSOLUTE");
  });
});

// ── 환경 ────────────────────────────────────────────────────────

describe("환경 구성", () => {
  it("이름 집합은 정확히 열한 개이고, 전용 홈과 작업 폴더 안의 임시 폴더를 쓴다", () => {
    const env = buildLspMinEnv(layout, WIN, URL_LOOPBACK);
    expect(Object.keys(env).sort()).toEqual([...LSP_MIN_ENV_NAMES].sort());
    expect(env.USERPROFILE).toBe(layout.homeDir);
    expect(env.TEMP).toBe(layout.tmpDir);
    expect(env.TMP).toBe(layout.tmpDir);
    expect(env.PATH).toBe("C:\\Windows\\System32;C:\\Windows");
    for (const key of ["SEMGREP_APP_URL", "SEMGREP_METRICS_URL", "SEMGREP_VERSION_CHECK_URL"]) {
      expect(env[key]).toBe(URL_LOOPBACK);
    }
    for (const key of ["SEMGREP_LOG_FILE", "SEMGREP_SETTINGS_FILE", "SEMGREP_VERSION_CACHE_PATH"]) {
      expect(env[key].startsWith(layout.stateDir)).toBe(true);
    }
  });

  it("부모 환경에서는 SYSTEMROOT 하나만 읽는다 — 토큰·프록시·홈은 복사하지 않는다", () => {
    const parent: Record<string, string> = {
      SYSTEMROOT: "C:\\Windows",
      PATH: "C:\\evil",
      TEMP: "C:\\Temp",
      USERPROFILE: "C:\\Users\\parent",
      HOME: "C:\\Users\\parent",
      HTTPS_PROXY: "http://u:p@x",
      GITHUB_TOKEN: "tok",
      SEMGREP_ENABLE_VERSION_CHECK: "1",
    };
    const env = buildLspMinChildEnv(
      { getEnv: (n) => parent[n], platform: "win32" },
      layout,
      URL_LOOPBACK
    );
    expect(env).toEqual(buildLspMinEnv(layout, "C:\\Windows", URL_LOOPBACK));
    expect(JSON.stringify(env)).not.toMatch(/evil|parent|u:p|tok/);
  });

  it("Windows가 아니거나 SYSTEMROOT가 없으면 만들지 않는다", () => {
    expect(() =>
      buildLspMinChildEnv({ getEnv: () => "x", platform: "linux" }, layout, URL_LOOPBACK)
    ).toThrow();
    expect(() =>
      buildLspMinChildEnv({ getEnv: () => undefined, platform: "win32" }, layout, URL_LOOPBACK)
    ).toThrow();
    expect(() =>
      buildLspMinChildEnv({ getEnv: () => "", platform: "win32" }, layout, URL_LOOPBACK)
    ).toThrow();
  });

  it("버전 관측 환경과 이름 집합이 같고 SEMGREP_ENABLE_VERSION_CHECK만 다르다(서버 쪽 환경 계약은 퍼뜨리지 않았다)", () => {
    const parent: Record<string, string> = {
      SYSTEMROOT: "C:\\Windows",
      PATH: "P",
      TEMP: "T",
      TMP: "T",
    };
    const deps = { getEnv: (n: string) => parent[n], platform: "win32" };
    const server = buildChildEnv(deps, "C:/ev/run-1", URL_LOOPBACK, "lsp-state");
    const version = buildVersionChildEnv(deps, "C:/ev/run-1", URL_LOOPBACK);
    const lsp = buildLspMinEnv(layout, WIN, URL_LOOPBACK);
    expect(Object.keys(lsp).sort()).toEqual(Object.keys(server).sort());
    expect(Object.keys(version).sort()).toEqual(
      [...Object.keys(lsp), "SEMGREP_ENABLE_VERSION_CHECK"].sort()
    );
    expect(Object.keys(server)).not.toContain("SEMGREP_ENABLE_VERSION_CHECK");
  });
});

// ── 보내는 메시지 ───────────────────────────────────────────────

describe("보내는 메시지", () => {
  it("initialize: 요청 id가 고정이고 initializationOptions는 허용 키뿐이며 규칙은 빈 로컬 폴더다", () => {
    const message = buildInitializeMessage(layout);
    expect(message.method).toBe("initialize");
    expect(message.id).toBe("lsp-min-init-1");
    const params = message.params as {
      processId: unknown;
      capabilities: unknown;
      rootUri: string;
      workspaceFolders: unknown;
      initializationOptions: { scan: { configuration: string[]; ci: boolean }; metrics: unknown };
    };
    expect(params.processId).toBeNull();
    expect(params.capabilities).toEqual({});
    expect(params.rootUri).toMatch(/^file:\/\/\/C:\/Users\/bsi\/work\/run-1\/ws$/);
    expect(params.workspaceFolders).toEqual([{ uri: params.rootUri, name: "ws" }]);
    expect(params.initializationOptions.scan.configuration).toEqual([layout.rulesDir]);
    expect(params.initializationOptions.scan.ci).toBe(false);
    expect(params.initializationOptions.metrics).toEqual({ enabled: false });
    expect(Object.keys(params.initializationOptions).sort()).toEqual(["metrics", "scan"]);
    // 레지스트리로 떨어지는 값("auto", r/·p/·s/ 약식, http 주소)이 규칙 구성에 없다.
    const sources = params.initializationOptions.scan.configuration as string[];
    expect(sources).toHaveLength(1);
    expect(sources[0]).not.toMatch(/^(auto$|[rps]\/|https?:\/\/)/i);
    expect(JSON.stringify(params)).not.toMatch(/"auto"|https?:/);
  });

  it("shutdown은 요청, exit는 알림이다", () => {
    expect(buildShutdownMessage()).toMatchObject({ method: "shutdown", id: "lsp-min-shutdown-1" });
    const exit = buildExitMessage();
    expect(exit.method).toBe("exit");
    expect(exit.id).toBeUndefined();
  });

  it("쓰기 직전 방어선: 라벨과 메서드가 맞는 셋만 통과한다", () => {
    expect(() => assertAllowedOutbound("initialize", buildInitializeMessage(layout))).not.toThrow();
    expect(() => assertAllowedOutbound("shutdown", buildShutdownMessage())).not.toThrow();
    expect(() => assertAllowedOutbound("exit", buildExitMessage())).not.toThrow();
  });

  it.each([
    ["initialized 알림", "exit", { jsonrpc: "2.0", method: "initialized", params: {} }],
    ["didOpen", "exit", { jsonrpc: "2.0", method: "textDocument/didOpen", params: {} }],
    [
      "스캔 요청 알림",
      "exit",
      { jsonrpc: "2.0", method: "semgrep/scanWorkspace", params: { full: true } },
    ],
    ["debug/echo 요청", "shutdown", { jsonrpc: "2.0", id: "x", method: "debug/echo" }],
    ["라벨과 다른 메서드", "initialize", { jsonrpc: "2.0", id: "x", method: "shutdown" }],
    ["exit에 id가 붙음", "exit", { jsonrpc: "2.0", id: 1, method: "exit" }],
    ["shutdown에 id가 없음", "shutdown", { jsonrpc: "2.0", method: "shutdown" }],
  ] as const)("쓰기 방어선이 거절한다: %s", (_n, label, message) => {
    expect(() => assertAllowedOutbound(label, message as JsonRpcMessage)).toThrow();
  });
});

// ── initialize 응답 검증 ────────────────────────────────────────

describe("classifyInitResponseCore — error 부재만으로 성공으로 치지 않는다", () => {
  it("정상: capabilities가 객체이고 error·retry가 없다 (빈 객체도 허용)", () => {
    expect(classifyInitResponseCore(response(GOOD))).toEqual({ ok: true });
    expect(classifyInitResponseCore(response({ capabilities: {} }))).toEqual({ ok: true });
  });

  it("알 수 없는 추가 키는 막지 않는다(서버 확장)", () => {
    expect(classifyInitResponseCore(response({ capabilities: {}, extra: 1 }))).toEqual({
      ok: true,
    });
  });

  it("공개 소스가 보내는 InitializeError 모양 {retry:false} 는 error 필드가 없어도 거절한다", () => {
    const r = classifyInitResponseCore(response({ retry: false }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reasons).toContain("INIT_RESULT_IS_INITIALIZE_ERROR");
      expect(r.reasons).toContain("INIT_CAPABILITIES_MISSING");
    }
  });

  it("retry 키가 capabilities와 함께 와도 거절한다", () => {
    const r = classifyInitResponseCore(response({ capabilities: {}, retry: true }));
    expect(r).toEqual({ ok: false, reasons: ["INIT_RESULT_IS_INITIALIZE_ERROR"] });
  });

  it("JSON-RPC error 응답은 거절한다", () => {
    const m = {
      jsonrpc: "2.0",
      id: LSP_MIN_INIT_ID,
      error: { code: -1, message: "x" },
    } as JsonRpcMessage;
    expect(classifyInitResponseCore(m)).toEqual({ ok: false, reasons: ["INIT_ERROR_RESPONSE"] });
  });

  it("error가 null이어도 키가 있으면 error 응답으로 센다", () => {
    const m = { jsonrpc: "2.0", id: LSP_MIN_INIT_ID, error: null } as unknown as JsonRpcMessage;
    expect(classifyInitResponseCore(m)).toEqual({ ok: false, reasons: ["INIT_ERROR_RESPONSE"] });
  });

  it("result와 error가 함께 있으면 거절한다", () => {
    const m = response(GOOD, { error: { code: 1, message: "x" } });
    expect(classifyInitResponseCore(m)).toEqual({ ok: false, reasons: ["INIT_RESULT_AND_ERROR"] });
  });

  it("result도 error도 없으면 거절한다", () => {
    const m = { jsonrpc: "2.0", id: LSP_MIN_INIT_ID } as JsonRpcMessage;
    expect(classifyInitResponseCore(m)).toEqual({ ok: false, reasons: ["INIT_RESULT_MISSING"] });
  });

  it.each([
    ["null", null],
    ["배열", []],
    ["문자열", "ok"],
    ["숫자", 1],
    ["참", true],
  ])("result가 객체가 아니면 거절한다: %s", (_n, value) => {
    expect(classifyInitResponseCore(response(value))).toEqual({
      ok: false,
      reasons: ["INIT_RESULT_NOT_OBJECT"],
    });
  });

  it.each([
    ["capabilities 없음", { serverInfo: { name: "x" } }, "INIT_CAPABILITIES_MISSING"],
    ["capabilities null", { capabilities: null }, "INIT_CAPABILITIES_NOT_OBJECT"],
    ["capabilities 배열", { capabilities: [] }, "INIT_CAPABILITIES_NOT_OBJECT"],
    ["capabilities 문자열", { capabilities: "{}" }, "INIT_CAPABILITIES_NOT_OBJECT"],
    ["capabilities 숫자", { capabilities: 0 }, "INIT_CAPABILITIES_NOT_OBJECT"],
  ])("구조 거절: %s", (_n, result, token) => {
    const r = classifyInitResponseCore(response(result));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons).toContain(token);
  });

  it("서버가 보낸 요청(method가 있음)은 응답으로 인정하지 않는다", () => {
    const m = {
      jsonrpc: "2.0",
      id: LSP_MIN_INIT_ID,
      method: "client/registerCapability",
      result: GOOD,
    } as JsonRpcMessage;
    const r = classifyInitResponseCore(m);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons).toContain("INIT_MESSAGE_HAS_METHOD");
  });
});

describe("analyzeInitResponse", () => {
  it("정상 응답의 사실을 뽑는다: serverInfo, capabilities 해시(키 순서에 무관), result 키 이름", () => {
    const a = analyzeInitResponse(
      response({ capabilities: { b: 1, a: 2 }, serverInfo: { name: "Semgrep", version: "9.9.9" } })
    );
    const b = analyzeInitResponse(
      response({ serverInfo: { version: "9.9.9", name: "Semgrep" }, capabilities: { a: 2, b: 1 } })
    );
    expect(a.valid).toBe(true);
    expect(a.serverInfo).toEqual({ name: "Semgrep", version: "9.9.9" });
    expect(a.resultKeys).toEqual(["capabilities", "serverInfo"]);
    expect(a.capabilitiesSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(a.capabilitiesSha256).toBe(b.capabilitiesSha256);
  });

  it("serverInfo가 없어도 유효하다 (기록만 하고 판정하지 않는다)", () => {
    const a = analyzeInitResponse(response({ capabilities: {} }));
    expect(a.valid).toBe(true);
    expect(a.serverInfo).toBeNull();
  });

  it.each([
    ["serverInfo가 문자열", { capabilities: {}, serverInfo: "Semgrep" }],
    ["serverInfo가 null", { capabilities: {}, serverInfo: null }],
    ["serverInfo가 배열", { capabilities: {}, serverInfo: [] }],
    ["name이 문자열이 아님", { capabilities: {}, serverInfo: { name: 1 } }],
    ["name 없음", { capabilities: {}, serverInfo: { version: "1" } }],
    ["version이 숫자", { capabilities: {}, serverInfo: { name: "x", version: 1 } }],
  ])("분석 규칙 V9: %s → INIT_SERVERINFO_MALFORMED", (_n, result) => {
    const a = analyzeInitResponse(response(result));
    expect(a.valid).toBe(false);
    expect(a.reasons).toContain("INIT_SERVERINFO_MALFORMED");
  });

  it("InitializeError 모양에서는 capabilities 해시를 만들지 않는다", () => {
    const a = analyzeInitResponse(response({ retry: false }));
    expect(a.valid).toBe(false);
    expect(a.capabilitiesSha256).toBeNull();
    expect(a.resultKeys).toEqual(["retry"]);
  });
});

describe("classifyServerMessage", () => {
  it("응답·서버 요청·알림·잘못된 메시지를 가른다", () => {
    expect(classifyServerMessage({ jsonrpc: "2.0", id: 1, result: {} })).toBe("response");
    expect(
      classifyServerMessage({ jsonrpc: "2.0", id: "a", error: { code: 1, message: "" } })
    ).toBe("response");
    expect(classifyServerMessage({ jsonrpc: "2.0", id: 1, method: "m" })).toBe("server-request");
    expect(classifyServerMessage({ jsonrpc: "2.0", method: "m" })).toBe("notification");
    expect(classifyServerMessage({ jsonrpc: "2.0" })).toBe("invalid");
    expect(classifyServerMessage({ jsonrpc: "2.0", id: null, result: {} })).toBe("invalid");
  });
});

// ── 중단 문구 ───────────────────────────────────────────────────

describe("findAbortPattern / StderrWatcher", () => {
  const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

  it("A1·A2 문구를 대소문자 무시로 찾고 A1을 먼저 본다", () => {
    expect(findAbortPattern("xx refreshing rules yy")).toEqual({
      condition: "A1",
      pattern: "refreshing rules",
    });
    expect(findAbortPattern("download registry")).toEqual({ condition: "A2", pattern: "download" });
    expect(findAbortPattern("scanning workspace download")?.condition).toBe("A1");
    expect(findAbortPattern("starting legacy language server")).toBeNull();
  });

  it("모든 A1·A2 문구가 실제로 잡힌다", () => {
    for (const pattern of [...ABORT_SCAN_PATTERNS, ...ABORT_NETWORK_PATTERNS]) {
      const w = new StderrWatcher();
      expect(w.push(enc(`[00.04][DEBUG](default): ${pattern.toUpperCase()} now\n`))?.pattern).toBe(
        pattern
      );
    }
  });

  it.each(ABORT_SCAN_PATTERNS.concat(ABORT_NETWORK_PATTERNS))(
    "문구 '%s' 는 청크 경계가 어디에 있어도 잡힌다(모든 분할 위치)",
    (pattern) => {
      const text = `prefix ${pattern} suffix`;
      const bytes = enc(text);
      for (let cut = 1; cut < bytes.length; cut++) {
        const w = new StderrWatcher();
        const first = w.push(bytes.slice(0, cut));
        const second = w.push(bytes.slice(cut));
        expect(first?.pattern ?? second?.pattern).toBe(pattern);
        // 이미 찾았다면 다시 알리지 않는다(첫 발견만).
        if (first) expect(second).toBeNull();
        expect(w.hit?.pattern).toBe(pattern);
      }
    }
  );

  it("개행이 없는 마지막 줄에서도 찾는다", () => {
    const w = new StderrWatcher();
    expect(w.push(enc("[00.05][DEBUG](default): Scanning workspace"))?.condition).toBe("A1");
  });

  it("청크 경계에 걸친 멀티바이트 문자가 문구 감시를 깨지 않는다", () => {
    const bytes = enc("가나다 download 라마바");
    for (let cut = 1; cut < bytes.length; cut++) {
      const w = new StderrWatcher();
      w.push(bytes.slice(0, cut));
      w.push(bytes.slice(cut));
      expect(w.hit?.pattern).toBe("download");
    }
  });

  it("초기화 오류 로그 문구를 따로 센다(중단은 아니다)", () => {
    const w = new StderrWatcher();
    const hit = w.push(enc("[00.01][ERROR](default): Error initializing server: boom\n"));
    expect(hit).toBeNull();
    expect(w.initErrorLogged).toBe(true);
  });

  it("무해한 시작 로그와 initialize 옵션 덤프는 오탐하지 않는다", () => {
    const w = new StderrWatcher();
    const dump = JSON.stringify(buildInitializeParams(layout), null, 2);
    expect(w.push(enc("Starting legacy language server\n"))).toBeNull();
    expect(w.push(enc(`[00.02][DEBUG](default): Handling request:\n${dump}\n`))).toBeNull();
    expect(w.push(enc("[00.03][DEBUG](default): Caching workspace targets\n"))).toBeNull();
    expect(w.hit).toBeNull();
    expect(w.checkedBytes).toBeGreaterThan(100);
  });

  it("스트림이 어디서 끊겨도 같은 결과다: 한 덩어리와 바이트 단위가 같다", () => {
    const text = "alpha\nRefreshing rules\nomega\n";
    const whole = new StderrWatcher();
    whole.push(enc(text));
    const bytewise = new StderrWatcher();
    for (const b of enc(text)) bytewise.push(Uint8Array.of(b));
    expect(bytewise.hit).toEqual(whole.hit);
  });
});

// ── 원문 바이트 사후 해석 ───────────────────────────────────────

describe("analyzeStdoutBytes", () => {
  it("이어 붙은 프레임을 푼다", () => {
    const a = encodeFrame(response(GOOD));
    const b = encodeFrame({ jsonrpc: "2.0", method: "window/logMessage", params: {} });
    const joined = new Uint8Array([...a, ...b]);
    const r = analyzeStdoutBytes(joined, true);
    expect(r.frames).toBe(2);
    expect(r.frameError).toBeNull();
  });

  it("끝에 덜 온 프레임은 EOF에서 TRUNCATED다. EOF 전이면 오류가 아니다", () => {
    const a = encodeFrame(response(GOOD));
    const cut = a.slice(0, a.length - 3);
    expect(analyzeStdoutBytes(cut, true).frameError?.kind).toBe("TRUNCATED");
    expect(analyzeStdoutBytes(cut, false).frameError).toBeNull();
  });

  it("깨진 프레임은 MALFORMED다", () => {
    expect(
      analyzeStdoutBytes(new TextEncoder().encode("garbage\r\n\r\n"), true).frameError?.kind
    ).toBe("MALFORMED");
  });

  it("빈 바이트는 오류가 아니다", () => {
    expect(analyzeStdoutBytes(new Uint8Array(0), true)).toMatchObject({
      frames: 0,
      frameError: null,
    });
  });
});

describe("analyzeStderrBytes", () => {
  it("머리말이 있는 줄과 없는 줄을 센다(CRLF 포함)", () => {
    const text =
      "Starting legacy language server\r\n[00.04][DEBUG](default): hello\r\n[00.05][ERROR](x): bad\r\nplain\r\n";
    const r = analyzeStderrBytes(new TextEncoder().encode(text));
    expect(r).toMatchObject({
      lines: 4,
      linesWithHeader: 2,
      linesWithoutHeader: 2,
      partialTail: false,
    });
  });

  it("개행으로 끝나지 않으면 마지막 줄을 partial로 표시한다", () => {
    expect(analyzeStderrBytes(new TextEncoder().encode("a\nb")).partialTail).toBe(true);
    expect(analyzeStderrBytes(new TextEncoder().encode("")).lines).toBe(0);
  });

  it("중단 문구와 초기화 오류 로그를 찾는다", () => {
    const r = analyzeStderrBytes(
      new TextEncoder().encode("Error initializing server\nRules refreshed\n")
    );
    expect(r.initErrorLogged).toBe(true);
    expect(r.hit).toEqual({ condition: "A1", pattern: "rules refreshed" });
  });
});

// ── 프로세스 목록 ───────────────────────────────────────────────

describe("descendantsOf / imageNameOf", () => {
  it("부모 PID를 따라 자손을 모은다", () => {
    const snap = snapshotOf([
      row({ pid: 10, ppid: 1, name: "semgrep.exe" }),
      row({ pid: 11, ppid: 10, name: "python.exe" }),
      row({ pid: 12, ppid: 11, name: "python.exe" }),
      row({ pid: 13, ppid: 12, name: "semgrep-core.exe" }),
      row({ pid: 99, ppid: 1, name: "other.exe" }),
    ]);
    const r = descendantsOf(snap, 10);
    expect(r.rows.map((x) => x.pid).sort()).toEqual([11, 12, 13]);
    expect(r.tracking).toBe("ROOT_PRESENT");
  });

  it("Windows처럼 부모 연결이 믿기 어려우면 부모보다 먼저 시작한 '자식'(PID 재사용)은 뺀다", () => {
    const snap = snapshotOf(
      [
        row({ pid: 10, ppid: 1, name: "semgrep.exe", startTime: 1000 }),
        row({ pid: 11, ppid: 10, name: "python.exe", startTime: 1100 }),
        row({ pid: 12, ppid: 10, name: "old.exe", startTime: 500 }),
        row({ pid: 13, ppid: 10, name: "unknown.exe", startTime: null }),
      ],
      true
    );
    expect(descendantsOf(snap, 10).rows.map((x) => x.pid)).toEqual([11]);
  });

  it("루트가 목록에 없으면 부모 PID만으로 잇고 그 사실을 표시한다", () => {
    const snap = snapshotOf([row({ pid: 11, ppid: 10, name: "python.exe" })]);
    expect(descendantsOf(snap, 10)).toMatchObject({ tracking: "ROOT_GONE" });
    expect(descendantsOf(snap, 10).rows).toHaveLength(1);
  });

  it("순환·자기 자신 참조에서 끝없이 돌지 않는다", () => {
    const snap = snapshotOf([
      row({ pid: 10, ppid: 12, name: "a" }),
      row({ pid: 11, ppid: 10, name: "b" }),
      row({ pid: 12, ppid: 11, name: "c" }),
    ]);
    expect(descendantsOf(snap, 10).rows.length).toBeLessThanOrEqual(3);
  });

  it("사라진 행은 건너뛴다", () => {
    const snap = snapshotOf([row({ pid: 11, ppid: 10, name: "x", vanished: true })]);
    expect(descendantsOf(snap, 10).rows).toHaveLength(0);
  });

  it("이미지 이름: 이름이 우선, 없으면 실행 파일 경로의 끝, 둘 다 없으면 null (소문자)", () => {
    expect(imageNameOf(row({ pid: 1, name: "Python.EXE" }))).toBe("python.exe");
    expect(imageNameOf(row({ pid: 1, executable: "C:\\Py\\Scripts\\SEMGREP.exe" }))).toBe(
      "semgrep.exe"
    );
    expect(imageNameOf(row({ pid: 1 }))).toBeNull();
  });
});

describe("rootViolation", () => {
  it("작업 영역과 규칙 폴더는 파일이 하나라도 생기면 위반이다", () => {
    expect(rootViolation("WORKSPACE", "a.txt")).toBe(true);
    expect(rootViolation("RULES_DIR", "r.yaml")).toBe(true);
  });
  it("홈은 shutdown이 쓰는 지문 폴더 밖이 위반이다 (구분자는 '/' 또는 '\\')", () => {
    expect(rootViolation("HOME_DIR", ".semgrep/cache/fingerprinted_ignored_findings/ws.txt")).toBe(
      false
    );
    expect(
      rootViolation("HOME_DIR", ".semgrep\\cache\\fingerprinted_ignored_findings\\ws.txt")
    ).toBe(false);
    expect(rootViolation("HOME_DIR", ".semgrep/cache/fingerprints/x")).toBe(true);
    expect(rootViolation("HOME_DIR", ".semgrep/settings.yml")).toBe(true);
    expect(rootViolation("HOME_DIR", "other.txt")).toBe(true);
  });
});

// ── 관측 기록 ───────────────────────────────────────────────────

function stdoutOf(...messages: JsonRpcMessage[]): Uint8Array {
  const parts = messages.map((m) => encodeFrame(m));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function goodFacts(over: Partial<LspMinFacts> = {}): LspMinFacts {
  const stdout = stdoutOf(response(GOOD));
  const stderr = new TextEncoder().encode(
    "Starting legacy language server\n[00.02][DEBUG](default): x\n"
  );
  return {
    runId: "run-1",
    provenance: "stub",
    refusals: [],
    limits: { ...LSP_MIN_LIMITS },
    expectedVersion: "9.9.9",
    spawn: { attempted: true, ok: true, pid: 4242 },
    sends: [
      { label: "initialize", tMs: 0, ok: true },
      { label: "shutdown", tMs: 120, ok: true },
      { label: "exit", tMs: 121, ok: true },
    ],
    stdout: { bytes: stdout, total: stdout.length, overflow: false, eof: true, readFailed: false },
    stderr: { bytes: stderr, total: stderr.length, overflow: false, eof: true, readFailed: false },
    frameError: null,
    initResponseAtMs: 100,
    exit: { observed: true, code: 0, signal: null, tMs: 150 },
    stdinClosed: { byHarness: false, ok: null, tMs: null },
    kill: { count: 0, firstTMs: null, confirmed: null },
    trigger: "NORMAL",
    also: [],
    abort: null,
    live: {
      stderrCheckedBytes: stderr.length,
      stdoutFramesChecked: 1,
      receiver: { baselineHits: 0, finalHits: 0, samples: 3, failures: 0 },
      processes: {
        samples: 3,
        failures: 0,
        maxDescendants: 3,
        imagesSeen: ["semgrep.exe"],
        disallowed: [],
      },
      files: { samples: 3, failures: 0 },
    },
    roots: [
      {
        role: "WORKSPACE",
        filesBefore: 0,
        filesAfter: 0,
        added: [],
        removed: [],
        samples: 0,
        failures: 0,
      },
      {
        role: "RULES_DIR",
        filesBefore: 0,
        filesAfter: 0,
        added: [],
        removed: [],
        samples: 0,
        failures: 0,
      },
      {
        role: "HOME_DIR",
        filesBefore: 0,
        filesAfter: 1,
        added: [".semgrep/cache/fingerprinted_ignored_findings/ws.txt"],
        removed: [],
        samples: 0,
        failures: 0,
      },
    ],
    artifacts: [{ label: "semgrep-core", before: "a".repeat(64), after: "a".repeat(64) }],
    timeline: { observationMs: 150, cleanupMs: 20 },
    cleanup: {
      childExitConfirmed: true,
      streamsClosed: true,
      descendantsAliveAfter: 0,
      descendantTracking: "ROOT_GONE",
      dispose: "OK",
      timersCancelled: true,
      problems: [],
    },
    ...over,
  };
}

describe("buildObservationRecord", () => {
  it("정상: OBSERVED이고 응답 사실이 기록된다", () => {
    const r = buildObservationRecord(goodFacts());
    expect(r.status).toBe("OBSERVED");
    expect(r.status_reasons).toEqual([]);
    expect(r.initialize).toMatchObject({
      response: "VALID",
      latency_ms: 100,
      pin_version_comparison: "MATCH",
      server_info: { name: "Semgrep", version: "9.9.9" },
    });
    expect(r.termination).toMatchObject({
      trigger: "NORMAL",
      path: "SELF_EXIT",
      exit: { code: 0, signal: null },
    });
    expect(r.cleanup.ok).toBe(true);
    expect(r.request.initialized_sent).toBe(false);
    expect(r.request.args).toEqual(["lsp", "--debug"]);
  });

  it("기록은 항상 COMPLETE·보안 통과·대조 참조·정상 시작·규칙 로딩·스캔·핀 검증을 세우지 않는다", () => {
    const states = [
      goodFacts(),
      goodFacts({ abort: { condition: "A1", detail: "x", tMs: 5 } }),
      goodFacts({ refusals: ["X"] }),
    ];
    for (const facts of states) {
      const r = buildObservationRecord(facts);
      expect(r.not_established).toEqual({
        complete: "NOT_ESTABLISHED",
        security_pass: "NOT_ESTABLISHED",
        control_reference: "NOT_ESTABLISHED",
        normal_startup: "NOT_ESTABLISHED",
        rules_loading: "NOT_ESTABLISHED",
        scanning: "NOT_ESTABLISHED",
        pin_verification: "NOT_ESTABLISHED",
      });
    }
  });

  it("기록은 정규 직렬화할 수 있다(undefined·함수·순환이 없다)", () => {
    expect(() => canonicalJson(buildObservationRecord(goodFacts()))).not.toThrow();
    expect(() =>
      canonicalJson(buildObservationRecord(goodFacts({ refusals: ["A"] })))
    ).not.toThrow();
  });

  it("경로·줄 원문·환경 값은 기록에 싣지 않는다", () => {
    const secretLine = "SECRET-LINE-CONTENT C:\\Users\\bsi\\private";
    const stderr = new TextEncoder().encode(`${secretLine}\n`);
    const r = buildObservationRecord(
      goodFacts({
        stderr: {
          bytes: stderr,
          total: stderr.length,
          overflow: false,
          eof: true,
          readFailed: false,
        },
        roots: [
          {
            role: "HOME_DIR",
            filesBefore: 0,
            filesAfter: 1,
            added: [".semgrep/cache/fingerprinted_ignored_findings/ws.txt"],
            removed: [],
            samples: 0,
            failures: 0,
          },
        ],
      })
    );
    const text = JSON.stringify(r);
    expect(text).not.toContain("SECRET-LINE-CONTENT");
    expect(text).not.toContain("C:\\\\Users");
    expect(text).not.toContain("semgrep.exe\\\\");
  });

  it("stub 출처는 미관측에 STUB를 붙인다. real 출처에는 붙이지 않는다", () => {
    expect(buildObservationRecord(goodFacts({ provenance: "stub" })).coverage.unobserved[0]).toBe(
      "PROVENANCE_STUB_NOT_REAL_SEMGREP"
    );
    expect(
      buildObservationRecord(goodFacts({ provenance: "real" })).coverage.unobserved
    ).not.toContain("PROVENANCE_STUB_NOT_REAL_SEMGREP");
  });

  it("미관측 목록: 감시 폴더 밖 파일시스템, 표본 사이 프로세스, 루프백 밖 네트워크가 항상 들어 있다", () => {
    const u = buildObservationRecord(goodFacts()).coverage.unobserved;
    expect(u).toEqual(
      expect.arrayContaining([
        "FILESYSTEM_OUTSIDE_WATCHED_ROOTS",
        "PROCESSES_BETWEEN_SAMPLES",
        "NETWORK_OTHER_THAN_LOOPBACK_RECEIVER",
        "BINARY_SOURCE_CORRESPONDENCE",
      ])
    );
  });

  it("실시간(SAMPLING)·사후 비교·미관측이 서로 다른 구역에 있다", () => {
    const c = buildObservationRecord(goodFacts()).coverage;
    expect(c.live.mode).toBe("SAMPLING");
    expect(c.post_hoc.watched_roots.map((x) => x.role)).toEqual([
      "WORKSPACE",
      "RULES_DIR",
      "HOME_DIR",
    ]);
    expect(c.post_hoc.network_events).toBe("COLLECTED_OUTSIDE_THIS_MODULE");
    expect(Array.isArray(c.unobserved)).toBe(true);
  });

  describe("initialize 응답이 판정을 정한다", () => {
    it("응답이 아예 없으면 NOT_OBSERVED(INIT_NO_RESPONSE)", () => {
      const r = buildObservationRecord(
        goodFacts({
          stdout: {
            bytes: new Uint8Array(0),
            total: 0,
            overflow: false,
            eof: true,
            readFailed: false,
          },
          initResponseAtMs: null,
          trigger: "INIT_TIMEOUT",
          sends: [{ label: "initialize", tMs: 0, ok: true }],
        })
      );
      expect(r.status).toBe("NOT_OBSERVED");
      expect(r.initialize.response).toBe("NONE");
      expect(r.status_reasons).toContain("INIT_NO_RESPONSE");
    });

    it("error 응답이면 NOT_OBSERVED", () => {
      const out = stdoutOf({
        jsonrpc: "2.0",
        id: LSP_MIN_INIT_ID,
        error: { code: -1, message: "x" },
      });
      const r = buildObservationRecord(
        goodFacts({
          stdout: { bytes: out, total: out.length, overflow: false, eof: true, readFailed: false },
        })
      );
      expect(r.status).toBe("NOT_OBSERVED");
      expect(r.status_reasons).toContain("INIT_ERROR_RESPONSE");
    });

    it("result 안의 InitializeError({retry:false})이면 NOT_OBSERVED — error 필드가 없어도", () => {
      const out = stdoutOf(
        { jsonrpc: "2.0", method: "window/logMessage", params: {} },
        response({ retry: false })
      );
      const r = buildObservationRecord(
        goodFacts({
          stdout: { bytes: out, total: out.length, overflow: false, eof: true, readFailed: false },
        })
      );
      expect(r.status).toBe("NOT_OBSERVED");
      expect(r.initialize.response).toBe("INVALID");
      expect(r.status_reasons).toContain("INIT_RESULT_IS_INITIALIZE_ERROR");
      expect(r.server_messages.notifications.methods["window/logMessage"]).toBe(1);
    });

    it("id가 다른 응답(숫자 1, 문자열 '1', 다른 문자열, null)은 응답으로 인정하지 않는다", () => {
      for (const id of [1, "1", "LSP-MIN-INIT-1", "lsp-min-init-2", null]) {
        const out = stdoutOf({ jsonrpc: "2.0", id, result: GOOD } as JsonRpcMessage);
        const r = buildObservationRecord(
          goodFacts({
            stdout: {
              bytes: out,
              total: out.length,
              overflow: false,
              eof: true,
              readFailed: false,
            },
          })
        );
        expect(r.initialize.response, `id=${String(id)}`).toBe("NONE");
        expect(r.status).toBe("NOT_OBSERVED");
      }
    });

    it("멀쩡한 응답이어도 서버가 초기화 오류를 로그로 남겼으면 성공으로 치지 않는다", () => {
      const stderr = new TextEncoder().encode(
        "[00.01][ERROR](default): Error initializing server: boom\n"
      );
      const r = buildObservationRecord(
        goodFacts({
          stderr: {
            bytes: stderr,
            total: stderr.length,
            overflow: false,
            eof: true,
            readFailed: false,
          },
        })
      );
      expect(r.status).toBe("NOT_OBSERVED");
      expect(r.status_reasons).toContain("INIT_ERROR_LOGGED");
    });

    it("같은 id의 두 번째 응답: 첫 응답의 판정은 그대로 두되 관측은 성립시키지 않는다(서버가 한 번 답한 뒤 다른 말을 했다)", () => {
      const out = stdoutOf(response(GOOD), response({ retry: false }));
      const r = buildObservationRecord(
        goodFacts({
          stdout: { bytes: out, total: out.length, overflow: false, eof: true, readFailed: false },
        })
      );
      expect(r.initialize.response).toBe("VALID");
      expect(r.status).toBe("NOT_OBSERVED");
      expect(r.status_reasons).toContain("INIT_RESPONSE_DUPLICATE");
      expect(r.server_messages.anomalies).toContain("INIT_RESPONSE_DUPLICATE");
    });

    it("같은 id의 두 번째 응답이 첫 응답과 같은 내용이어도 중복이다(관측 불성립)", () => {
      const out = stdoutOf(response(GOOD), response(GOOD));
      const r = buildObservationRecord(
        goodFacts({
          stdout: { bytes: out, total: out.length, overflow: false, eof: true, readFailed: false },
        })
      );
      expect(r.status).toBe("NOT_OBSERVED");
      expect(r.status_reasons).toContain("INIT_RESPONSE_DUPLICATE");
    });

    it.each(["semgrep/rulesRefreshed", "textDocument/publishDiagnostics"])(
      "실시간 감시가 놓친 stdout 알림(%s)은 원문에서 다시 찾아 관측을 성립시키지 않는다",
      (method) => {
        const out = stdoutOf(response(GOOD), { jsonrpc: "2.0", method, params: {} });
        const r = buildObservationRecord(
          goodFacts({
            stdout: {
              bytes: out,
              total: out.length,
              overflow: false,
              eof: true,
              readFailed: false,
            },
          })
        );
        expect(r.termination.abort).toBeNull();
        expect(r.status).toBe("NOT_OBSERVED");
        expect(r.status_reasons).toContain("STDOUT_ABORT_METHOD_NOT_CAUGHT_LIVE");
      }
    );

    it("중단된 기록에도 러너 결과 쪽 외부 사유가 status_reasons에 남는다", () => {
      const r = buildObservationRecord(
        goodFacts({
          abort: { condition: "A5", detail: "WORKSPACE", tMs: 10 },
          externalReasons: ["RUNNER_RESULT_MALFORMED:cleanup"],
        })
      );
      expect(r.status).toBe("ABORTED");
      expect(r.status_reasons).toEqual(
        expect.arrayContaining(["ABORT:A5", "RUNNER_RESULT_MALFORMED:cleanup"])
      );
    });

    it("서버가 요청을 보내면 센다(답하지 않는다). 미해결 응답과 shutdown 응답도 센다", () => {
      const out = stdoutOf(
        { jsonrpc: "2.0", id: 7, method: "client/registerCapability", params: {} },
        { jsonrpc: "2.0", id: "zzz", result: null },
        response(GOOD),
        { jsonrpc: "2.0", id: "lsp-min-shutdown-1", result: null }
      );
      const r = buildObservationRecord(
        goodFacts({
          stdout: { bytes: out, total: out.length, overflow: false, eof: true, readFailed: false },
        })
      );
      expect(r.server_messages.server_requests).toEqual({
        count: 1,
        methods: ["client/registerCapability"],
      });
      expect(r.server_messages.responses_unmatched).toBe(1);
      expect(r.server_messages.anomalies).toEqual(
        expect.arrayContaining([
          "SERVER_REQUESTS_SEEN",
          "UNMATCHED_RESPONSES",
          "SHUTDOWN_RESPONSE_SEEN",
        ])
      );
      expect(r.status).toBe("OBSERVED");
    });

    it("핀 버전 비교는 기록만 한다 — 불일치해도 status는 그대로", () => {
      const r = buildObservationRecord(goodFacts({ expectedVersion: "1.180.0" }));
      expect(r.initialize.pin_version_comparison).toBe("MISMATCH");
      expect(r.status).toBe("OBSERVED");
      expect(
        buildObservationRecord(goodFacts({ expectedVersion: null })).initialize
          .pin_version_comparison
      ).toBe("NOT_GIVEN");
    });

    it("응답 지연은 송신 시각과 도착 시각의 차다", () => {
      expect(
        buildObservationRecord(goodFacts({ initResponseAtMs: 2500 })).initialize.latency_ms
      ).toBe(2500);
      expect(
        buildObservationRecord(goodFacts({ initResponseAtMs: null })).initialize.latency_ms
      ).toBeNull();
    });
  });

  describe("다른 사유", () => {
    it("shutdown·exit를 보내지 못했으면 NOT_OBSERVED", () => {
      const r = buildObservationRecord(
        goodFacts({
          sends: [
            { label: "initialize", tMs: 0, ok: true },
            { label: "shutdown", tMs: 5, ok: false },
          ],
        })
      );
      expect(r.status).toBe("NOT_OBSERVED");
      expect(r.status_reasons).toContain("SHUTDOWN_EXIT_NOT_SENT");
    });
    it("프레임 오류·출력 초과·읽기 실패·전체 상한·stdin 오류·자식이 먼저 끝남", () => {
      const base = goodFacts();
      const cases: [Partial<LspMinFacts>, string][] = [
        [{ frameError: { kind: "MALFORMED", detail: "x", atByte: 0 } }, "FRAME_ERROR:MALFORMED"],
        [{ stdout: { ...base.stdout, overflow: true } }, "OUTPUT_LIMIT"],
        [{ stderr: { ...base.stderr, overflow: true } }, "OUTPUT_LIMIT"],
        [{ stdout: { ...base.stdout, readFailed: true } }, "STREAM_READ_FAILED"],
        [{ trigger: "TOTAL_TIMEOUT" }, "TOTAL_TIMEOUT"],
        [{ trigger: "STDIN_ERROR" }, "STDIN_ERROR"],
        [{ trigger: "CHILD_EXITED_EARLY" }, "CHILD_EXITED_EARLY"],
      ];
      for (const [over, token] of cases) {
        const r = buildObservationRecord(goodFacts(over));
        expect(r.status, token).toBe("NOT_OBSERVED");
        expect(r.status_reasons, token).toContain(token);
      }
    });
    it("관측 성립을 막는 사유는 먼저 일어난 trigger뿐 아니라 뒤따른 also에서도 읽는다 (순서는 그대로 보존한다)", () => {
      const blocking = [
        "TOTAL_TIMEOUT",
        "STDIN_ERROR",
        "STREAM_READ_FAILED",
        "CHILD_EXITED_EARLY",
        "OUTPUT_LIMIT",
      ] as const;
      for (const token of blocking) {
        // 첫 사유인 경우
        const first = buildObservationRecord(goodFacts({ trigger: token }));
        expect(first.status, `first ${token}`).toBe("NOT_OBSERVED");
        expect(first.status_reasons, `first ${token}`).toContain(token);
        // 후속 사유인 경우: 앞선 사유가 관측을 막지 않는 EXIT_TIMEOUT이어도 뒤따른 사유가 막는다
        const later = buildObservationRecord(goodFacts({ trigger: "EXIT_TIMEOUT", also: [token] }));
        expect(later.status, `later ${token}`).toBe("NOT_OBSERVED");
        expect(later.status_reasons, `later ${token}`).toContain(token);
        expect(later.termination.trigger).toBe("EXIT_TIMEOUT");
        expect(later.termination.also).toEqual([token]);
      }
    });
    it("후속 사유가 관측을 막지 않는 종류뿐이면 관측은 성립한다 (EXIT_TIMEOUT 뒤 stdin 닫기로 끝난 경로)", () => {
      const r = buildObservationRecord(
        goodFacts({
          trigger: "EXIT_TIMEOUT",
          also: ["INIT_TIMEOUT"],
          stdinClosed: { byHarness: true, ok: true, tMs: 30_000 },
        })
      );
      expect(r.status).toBe("OBSERVED");
      expect(r.termination.path).toBe("STDIN_CLOSED");
      expect(r.termination.path).not.toBe("SELF_EXIT");
    });
    it("강제 종료가 필요했다면 NOT_OBSERVED이고, 실제로 관측한 사실(응답·송신)은 그대로 남는다", () => {
      const r = buildObservationRecord(
        goodFacts({
          trigger: "EXIT_TIMEOUT",
          stdinClosed: { byHarness: true, ok: true, tMs: 30_000 },
          kill: { count: 1, firstTMs: 40_000, confirmed: true },
        })
      );
      expect(r.status).toBe("NOT_OBSERVED");
      expect(r.status_reasons).toContain("FORCE_KILL_REQUIRED");
      expect(r.termination.path).toBe("FORCE_KILLED");
      expect(r.initialize.response).toBe("VALID");
      expect(r.sent.map((s) => s.label)).toEqual(["initialize", "shutdown", "exit"]);
      // 관측 결과와 정리 결과는 따로다: 강제 종료가 정리 결과를 바꾸지 않는다.
      expect(r.cleanup.ok).toBe(true);
    });
    it("읽기 실패는 정상 EOF와 합쳐지지 않고, 받은 바이트와 오류 토큰이 남는다", () => {
      const base = goodFacts();
      const r = buildObservationRecord(
        goodFacts({
          stdout: {
            ...base.stdout,
            eof: false,
            readFailed: true,
            readError: "IOException: pipe\r\nbroken \u0007 at C:\\secret\\path",
          },
          trigger: "STREAM_READ_FAILED",
        })
      );
      expect(r.status).toBe("NOT_OBSERVED");
      expect(r.status_reasons).toContain("STREAM_READ_FAILED");
      expect(r.status_reasons).not.toContain("STDIN_ERROR");
      expect(r.streams.stdout).toMatchObject({ read_failed: true, eof: false });
      expect(r.streams.stdout.bytes).toBe(base.stdout.total);
      expect(r.streams.stdout.read_error).toMatch(/^IOException: pipe\?\?broken \? at C:/);
      expect(r.streams.stdout.read_error).not.toMatch(/[\\\r\n\u0007]/);
      expect(r.streams.stderr.read_error).toBeNull();
    });
    it("띄우지 못했으면 NOT_OBSERVED(SPAWN_FAILED)이고 termination.path는 NOT_SPAWNED", () => {
      const r = buildObservationRecord(
        goodFacts({
          provenance: "stub",
          spawn: { attempted: true, ok: false, pid: null },
          sends: [],
          trigger: "SPAWN_FAILED",
          exit: { observed: false, code: null, signal: null, tMs: null },
          stdout: {
            bytes: new Uint8Array(0),
            total: 0,
            overflow: false,
            eof: false,
            readFailed: false,
          },
        })
      );
      expect(r.status).toBe("NOT_OBSERVED");
      expect(r.status_reasons).toContain("SPAWN_FAILED");
      expect(r.termination.path).toBe("NOT_SPAWNED");
    });
    it("요청을 거절했으면 NOT_ATTEMPTED이고 사유가 그대로 남는다", () => {
      const r = buildObservationRecord(
        goodFacts({
          refusals: ["ARGS_NOT_FIXED"],
          provenance: null,
          spawn: { attempted: false, ok: false, pid: null },
        })
      );
      expect(r.status).toBe("NOT_ATTEMPTED");
      expect(r.status_reasons).toEqual(["ARGS_NOT_FIXED"]);
      expect(r.request.refusals).toEqual(["ARGS_NOT_FIXED"]);
    });
    it("라이브 중단이 있으면 다른 사유보다 ABORTED가 앞선다", () => {
      const r = buildObservationRecord(
        goodFacts({
          abort: { condition: "A4", detail: "cmd.exe", tMs: 50 },
          trigger: "LIVE_ABORT",
          kill: { count: 1, firstTMs: 50, confirmed: true },
        })
      );
      expect(r.status).toBe("ABORTED");
      expect(r.termination.abort).toEqual({ condition: "A4", detail: "cmd.exe", t_ms: 50 });
      expect(r.termination.path).toBe("FORCE_KILLED");
    });
  });

  describe("실시간 표본이 놓친 위반은 사후 값으로 드러나고 관측 성립으로 치지 않는다", () => {
    it("stderr 문구가 실시간에는 안 잡혔는데 원문에 있다", () => {
      const stderr = new TextEncoder().encode("Scanning workspace\n");
      const r = buildObservationRecord(
        goodFacts({
          stderr: {
            bytes: stderr,
            total: stderr.length,
            overflow: false,
            eof: true,
            readFailed: false,
          },
        })
      );
      expect(r.status).toBe("NOT_OBSERVED");
      expect(r.status_reasons).toContain("STDERR_PATTERN_NOT_CAUGHT_LIVE");
      expect(r.coverage.post_hoc.stderr_pattern_missed_live).toBe(true);
    });
    it("수신기 건수가 마지막 표본 사이에 늘었다 / 마지막 값을 읽지 못했다", () => {
      const a = buildObservationRecord(
        goodFacts({
          live: {
            ...goodFacts().live,
            receiver: { baselineHits: 0, finalHits: 2, samples: 1, failures: 0 },
          },
        })
      );
      expect(a.status_reasons).toContain("RECEIVER_HITS_INCREASED");
      const b = buildObservationRecord(
        goodFacts({
          live: {
            ...goodFacts().live,
            receiver: { baselineHits: 0, finalHits: null, samples: 1, failures: 0 },
          },
        })
      );
      expect(b.status_reasons).toContain("RECEIVER_FINAL_UNOBSERVABLE");
    });
    it("감시 폴더의 금지된 변경 (작업 영역, 규칙 폴더, 홈의 예상 밖 위치)", () => {
      for (const [role, path] of [
        ["WORKSPACE", "a.txt"],
        ["RULES_DIR", "r.yaml"],
        ["HOME_DIR", ".semgrep/settings.yml"],
      ] as const) {
        const roots = goodFacts().roots.map((x) =>
          x.role === role ? { ...x, added: [path], filesAfter: 1 } : x
        );
        const r = buildObservationRecord(goodFacts({ roots }));
        expect(r.status_reasons, role).toContain(`WATCHED_ROOT_VIOLATION:${role}`);
        expect(r.status).toBe("NOT_OBSERVED");
      }
    });
    it("허용 밖 이미지를 봤다", () => {
      const f = goodFacts();
      const r = buildObservationRecord(
        goodFacts({
          live: { ...f.live, processes: { ...f.live.processes, disallowed: ["cmd.exe"] } },
        })
      );
      expect(r.status_reasons).toContain("DISALLOWED_IMAGE_SEEN");
    });
  });

  describe("관측 결과와 정리 결과는 서로를 바꾸지 않는다", () => {
    const badCleanup = {
      childExitConfirmed: false,
      streamsClosed: false,
      descendantsAliveAfter: 2,
      descendantTracking: "ROOT_PRESENT" as const,
      dispose: "FAILED" as const,
      timersCancelled: false,
      problems: ["KILL_NOT_OBSERVED", "DISPOSE_FAILED"],
    };
    it("관측은 성공했지만 정리가 실패한 경우", () => {
      const r = buildObservationRecord(goodFacts({ cleanup: badCleanup }));
      expect(r.status).toBe("OBSERVED");
      expect(r.cleanup.ok).toBe(false);
      expect(r.cleanup.problems).toEqual(["KILL_NOT_OBSERVED", "DISPOSE_FAILED"]);
    });
    it("관측은 실패했지만 정리는 깔끔한 경우", () => {
      const r = buildObservationRecord(
        goodFacts({
          trigger: "INIT_TIMEOUT",
          stdout: {
            bytes: new Uint8Array(0),
            total: 0,
            overflow: false,
            eof: true,
            readFailed: false,
          },
        })
      );
      expect(r.status).toBe("NOT_OBSERVED");
      expect(r.cleanup.ok).toBe(true);
    });
    it("정리의 각 항목이 하나라도 어긋나면 cleanup.ok는 false다", () => {
      const ok = goodFacts().cleanup;
      const variants = [
        { childExitConfirmed: false },
        { streamsClosed: false },
        { streamsClosed: null },
        { descendantsAliveAfter: 1 },
        { descendantsAliveAfter: null },
        { dispose: "FAILED" as const },
        { dispose: "NOT_CALLED" as const },
        { timersCancelled: false },
        { problems: ["X"] },
      ];
      for (const v of variants) {
        expect(
          buildObservationRecord(goodFacts({ cleanup: { ...ok, ...v } })).cleanup.ok,
          JSON.stringify(v)
        ).toBe(false);
      }
    });
    it("정리 결과를 합친 한 줄 판정 키가 기록에 없다", () => {
      const r = buildObservationRecord(goodFacts()) as unknown as Record<string, unknown>;
      expect(Object.keys(r)).not.toContain("verdict");
      expect(Object.keys(r)).not.toContain("ok");
      expect(Object.keys(r)).not.toContain("passed");
    });
  });

  it("종료 경로: SELF_EXIT / STDIN_CLOSED / FORCE_KILLED / NOT_OBSERVED", () => {
    expect(buildObservationRecord(goodFacts()).termination.path).toBe("SELF_EXIT");
    expect(
      buildObservationRecord(goodFacts({ stdinClosed: { byHarness: true, ok: true, tMs: 5 } }))
        .termination.path
    ).toBe("STDIN_CLOSED");
    expect(
      buildObservationRecord(goodFacts({ kill: { count: 1, firstTMs: 5, confirmed: true } }))
        .termination.path
    ).toBe("FORCE_KILLED");
    expect(
      buildObservationRecord(
        goodFacts({ exit: { observed: false, code: null, signal: null, tMs: null } })
      ).termination.path
    ).toBe("NOT_OBSERVED");
  });

  it("설치물 해시 비교: 같음/바뀜/비교 불가", () => {
    const r = buildObservationRecord(
      goodFacts({
        artifacts: [
          { label: "a", before: "1".repeat(64), after: "1".repeat(64) },
          { label: "b", before: "1".repeat(64), after: "2".repeat(64) },
          { label: "c", before: null, after: "2".repeat(64) },
        ],
      })
    );
    expect(r.coverage.post_hoc.artifact_hashes.map((x) => x.comparison)).toEqual([
      "SAME",
      "CHANGED",
      "NOT_COMPARED",
    ]);
  });

  it("목록 길이를 제한한다(알림 메서드 이름, 추가된 파일 이름)", () => {
    const many = Array.from({ length: 80 }, (_, i) => `f${i}.txt`);
    const r = buildObservationRecord(
      goodFacts({
        roots: goodFacts().roots.map((x) => (x.role === "WORKSPACE" ? { ...x, added: many } : x)),
      })
    );
    const ws = r.coverage.post_hoc.watched_roots.find((x) => x.role === "WORKSPACE");
    expect(ws?.added.length).toBe(51);
    expect(ws?.added[50]).toBe("+30");
  });
});
