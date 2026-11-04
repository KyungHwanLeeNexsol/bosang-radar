import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALLOWED_IMAGES, buildLspMinEnv } from "./lsp-min";
import {
  LSP_RULES_LIMITS,
  LSP_RULES_PROBE_SHA256,
  assertAllowedRulesOutbound,
  checkRulesRequest,
} from "./lsp-rules";
import {
  LSP_SCAN_ARGS,
  LSP_SCAN_DID_OPEN_LANGUAGE_ID,
  LSP_SCAN_DID_OPEN_VERSION,
  LSP_SCAN_EXPECTED_DIAGNOSTIC,
  LSP_SCAN_EXPECTED_RANGE,
  LSP_SCAN_INIT_ID,
  LSP_SCAN_JOBS,
  LSP_SCAN_LIMITS,
  LSP_SCAN_SEND_ORDER,
  LSP_SCAN_TARGET_BYTES,
  LSP_SCAN_TARGET_FILE,
  LSP_SCAN_TARGET_SHA256,
  LSP_SCAN_TARGET_TOKEN,
  SCAN_ABORT_NAME,
  SCAN_UNOBSERVED_ALWAYS,
  analyzeScanStdout,
  assertAllowedScanOutbound,
  buildScanDidOpenMessage,
  buildScanExitMessage,
  buildScanInitializationOptions,
  buildScanInitializeMessage,
  buildScanInitializeParams,
  buildScanInitializedMessage,
  buildScanShutdownMessage,
  checkScanRequest,
  evaluateScanDiagnostic,
  resolveScanLimits,
  scanLayout,
  scanRootUri,
  scanTargetUri,
  validateScanInitializationOptions,
  type ScanRequestShape,
  type ScanSendGuardContext,
  type ScanSendLabel,
} from "./lsp-scan";
import { RULES_UNOBSERVED_ALWAYS } from "./lsp-rules";
import { validateInitializationOptions } from "./settings";
import {
  GOOD_DIAGNOSTIC,
  SCAN_URL,
  SCAN_WORK,
  TARGET_BYTES,
  TARGET_TEXT,
  TARGET_URI,
  barrierStdoutMessages,
  concat,
  enc,
  frames,
  goodNotification,
  publishDiagnostics,
  scanLay,
} from "./testing/scan-fixtures";
import type { JsonRpcMessage } from "./types";

const sha = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
const REAL_TARGET = new Uint8Array(
  readFileSync(new URL("./data/lsp-scan-1-target.txt", import.meta.url))
);
const PROBE = new Uint8Array(
  readFileSync(new URL("./data/lsp-rules-1-probe.yaml", import.meta.url))
);

// ── 합성 대상 파일 ──────────────────────────────────────────────

describe("합성 대상 파일 (data/lsp-scan-1-target.txt)", () => {
  it("크기 135바이트, sha256 고정값, CR 없음 — 구현 상수와 파일이 어긋나지 않는다", () => {
    expect(REAL_TARGET.byteLength).toBe(135);
    expect(LSP_SCAN_TARGET_BYTES).toBe(135);
    expect(sha(REAL_TARGET)).toBe(
      "097b6a5ddb0f1f822b91ccebad23fa448d1970222502e4f18447479d0cd741ba"
    );
    expect(LSP_SCAN_TARGET_SHA256).toBe(sha(REAL_TARGET));
    expect(REAL_TARGET.includes(0x0d)).toBe(false);
    expect(REAL_TARGET[REAL_TARGET.byteLength - 1]).toBe(0x0a);
    expect(LSP_SCAN_TARGET_FILE).toBe("lsp-scan-1-target.txt");
  });

  it("전문이 계획 4.6절과 같고 시험 조립기의 상수와 같다", () => {
    const text = new TextDecoder().decode(REAL_TARGET);
    expect(text).toBe(
      [
        "LSP-SCAN-1 synthetic target. This is not a source file.",
        "marker: LSP_RULES_1_PROBE_TOKEN_THAT_IS_NEVER_PRESENT",
        "end of synthetic target.",
        "",
      ].join("\n")
    );
    expect(TARGET_TEXT).toBe(text);
    expect(Array.from(TARGET_BYTES)).toEqual(Array.from(REAL_TARGET));
  });

  it("프로브 토큰은 정확히 한 번, 둘째 줄 0 기준 문자 8..53 에 있다", () => {
    const text = new TextDecoder().decode(REAL_TARGET);
    expect(text.split(LSP_SCAN_TARGET_TOKEN).length - 1).toBe(1);
    const lines = text.split("\n");
    expect(lines[1].indexOf(LSP_SCAN_TARGET_TOKEN)).toBe(8);
    expect(8 + LSP_SCAN_TARGET_TOKEN.length).toBe(53);
    expect(LSP_SCAN_EXPECTED_RANGE).toEqual({
      start: { line: 1, character: 8 },
      end: { line: 1, character: 53 },
    });
    // 프로브 규칙의 pattern 이 이 토큰이다 (규칙 파일 바이트는 바뀌지 않았다)
    expect(new TextDecoder().decode(PROBE)).toContain(`pattern: ${LSP_SCAN_TARGET_TOKEN}`);
    expect(sha(PROBE)).toBe(LSP_RULES_PROBE_SHA256);
    expect(PROBE.byteLength).toBe(233);
  });

  it("토큰이 한 낱말로 갈라지지 않는다: 앞뒤가 공백·줄 끝이다", () => {
    const line = new TextDecoder().decode(REAL_TARGET).split("\n")[1];
    expect(line).toBe(`marker: ${LSP_SCAN_TARGET_TOKEN}`);
  });
});

// ── 한도 ────────────────────────────────────────────────────────

describe("한도: scanMs·settleMs 고정, 낮추는 것만 된다", () => {
  it("scanMs 30,000 · settleMs 2,000, 기존 한도는 그대로 상속한다", () => {
    expect(LSP_SCAN_LIMITS.scanMs).toBe(30_000);
    expect(LSP_SCAN_LIMITS.settleMs).toBe(2_000);
    expect(LSP_SCAN_LIMITS.totalMs).toBe(150_000);
    expect(LSP_SCAN_LIMITS.rulesMs).toBe(60_000);
    expect(LSP_SCAN_LIMITS.initMs).toBe(LSP_RULES_LIMITS.initMs);
    expect(LSP_SCAN_LIMITS.exitMs).toBe(LSP_RULES_LIMITS.exitMs);
    expect(Object.isFrozen(LSP_SCAN_LIMITS)).toBe(true);
  });

  it("낮추기는 되고, 올리거나 잘못된 값은 모두 거절한다 (자동 연장 없음)", () => {
    expect(resolveScanLimits({ scanMs: 1000, settleMs: 10 }).problems).toEqual([]);
    expect(resolveScanLimits({ scanMs: 1000 }).limits.scanMs).toBe(1000);
    expect(resolveScanLimits(undefined).limits).toEqual({ ...LSP_SCAN_LIMITS });
    for (const key of Object.keys(LSP_SCAN_LIMITS) as (keyof typeof LSP_SCAN_LIMITS)[]) {
      const up = resolveScanLimits({ [key]: LSP_SCAN_LIMITS[key] + 1 });
      expect(up.problems, key).toEqual([`LIMIT_ABOVE_CAP:${key}`]);
      expect(up.limits[key], key).toBe(LSP_SCAN_LIMITS[key]); // 올린 값은 반영되지 않는다
    }
    expect(resolveScanLimits({ scanMs: 0 }).problems).toEqual(["LIMIT_INVALID:scanMs"]);
    expect(resolveScanLimits({ scanMs: Number.NaN }).problems).toEqual(["LIMIT_INVALID:scanMs"]);
    expect(resolveScanLimits({ scanMs: -1 }).problems).toEqual(["LIMIT_INVALID:scanMs"]);
    expect(resolveScanLimits({ nope: 1 } as never).problems).toEqual(["LIMIT_UNKNOWN:nope"]);
  });
});

// ── 배치 ────────────────────────────────────────────────────────

describe("배치와 URI", () => {
  it("scanLayout 은 규칙 관측과 같은 모양에 대상 파일 경로를 더한다", () => {
    expect(scanLay.workspace).toBe(`${SCAN_WORK}/ws`);
    expect(scanLay.stateDir).toBe(`${SCAN_WORK}/lsp-state`);
    expect(scanLay.rulesDir).toBe(`${SCAN_WORK}/lsp-state/rules-probe`);
    expect(scanLay.homeDir).toBe(`${SCAN_WORK}/lsp-state/home`);
    expect(scanLay.tmpDir).toBe(`${SCAN_WORK}/lsp-state/tmp`);
    expect(scanLay.targetPath).toBe(`${SCAN_WORK}/ws/lsp-scan-1-target.txt`);
    const win = scanLayout("C:\\ProgramData\\x\\RUN\\work\\lsp-scan");
    expect(win.workspace).toBe("C:\\ProgramData\\x\\RUN\\work\\lsp-scan\\ws");
    expect(win.targetPath).toBe(
      "C:\\ProgramData\\x\\RUN\\work\\lsp-scan\\ws\\lsp-scan-1-target.txt"
    );
  });

  it("대상 URI 는 작업 영역 URI + /lsp-scan-1-target.txt (같은 접두 문자열)", () => {
    expect(scanTargetUri(scanLay)).toBe(`${scanRootUri(scanLay)}/lsp-scan-1-target.txt`);
    expect(scanRootUri(scanLay)).toBe("file:///C:/work/scan-1/ws");
    expect(TARGET_URI).toBe("file:///C:/work/scan-1/ws/lsp-scan-1-target.txt");
  });
});

// ── 보내는 메시지 ───────────────────────────────────────────────

describe("보내는 메시지", () => {
  it("송신 순서는 initialize, initialized, didOpen, shutdown, exit 다섯뿐이다", () => {
    expect(LSP_SCAN_SEND_ORDER).toEqual([
      "initialize",
      "initialized",
      "didOpen",
      "shutdown",
      "exit",
    ]);
    expect(Object.isFrozen(LSP_SCAN_SEND_ORDER)).toBe(true);
    expect(LSP_SCAN_ARGS).toEqual(["lsp", "--debug"]);
  });

  it("initialize: RULES 와 같은 형태 + scan.jobs = 1 (정수)", () => {
    const params = buildScanInitializeParams(scanLay) as Record<string, unknown>;
    const options = params.initializationOptions as {
      scan: Record<string, unknown>;
      metrics: Record<string, unknown>;
    };
    expect(options.scan).toEqual({
      ci: false,
      configuration: [scanLay.rulesDir],
      maxTargetBytes: 1_000_000,
      onlyGitDirty: false,
      pro_intrafile: false,
      timeout: 30,
      timeoutThreshold: 3,
      jobs: 1,
    });
    expect(options.metrics).toEqual({ enabled: false });
    expect(LSP_SCAN_JOBS).toBe(1);
    expect(params.rootUri).toBe("file:///C:/work/scan-1/ws");
    expect(params.workspaceFolders).toEqual([{ uri: "file:///C:/work/scan-1/ws", name: "ws" }]);
    expect(params.processId).toBeNull();
    const msg = buildScanInitializeMessage(scanLay);
    expect(msg.id).toBe(LSP_SCAN_INIT_ID);
    expect(msg.method).toBe("initialize");
  });

  it("initialized·shutdown·exit 의 모양", () => {
    expect(buildScanInitializedMessage()).toEqual({
      jsonrpc: "2.0",
      method: "initialized",
      params: {},
    });
    const shutdown = buildScanShutdownMessage();
    expect(shutdown.method).toBe("shutdown");
    expect(shutdown.id).toBeDefined();
    expect("params" in shutdown).toBe(false);
    expect(buildScanExitMessage()).toEqual({ jsonrpc: "2.0", method: "exit" });
  });

  it("didOpen: 본문은 실제 파일 바이트 그대로, uri 는 대상 URI, languageId plaintext, version 1", () => {
    const msg = buildScanDidOpenMessage(scanLay, REAL_TARGET);
    expect(msg.method).toBe("textDocument/didOpen");
    expect(msg.id).toBeUndefined();
    expect(msg.params).toEqual({
      textDocument: {
        uri: scanTargetUri(scanLay),
        languageId: "plaintext",
        version: 1,
        text: new TextDecoder().decode(REAL_TARGET),
      },
    });
    expect(LSP_SCAN_DID_OPEN_LANGUAGE_ID).toBe("plaintext");
    expect(LSP_SCAN_DID_OPEN_VERSION).toBe(1);
    // 본문의 UTF-8 바이트가 파일과 같다
    const text = (msg.params as { textDocument: { text: string } }).textDocument.text;
    expect(sha(enc(text))).toBe(LSP_SCAN_TARGET_SHA256);
  });

  it("didOpen 생성기는 크기·해시가 고정값과 다른 바이트를 받으면 던진다", () => {
    expect(() => buildScanDidOpenMessage(scanLay, enc("short"))).toThrow();
    const changed = Uint8Array.from(REAL_TARGET);
    changed[0] = 0x4d;
    expect(() => buildScanDidOpenMessage(scanLay, changed)).toThrow();
    expect(() => buildScanDidOpenMessage(scanLay, concat(REAL_TARGET, enc("x")))).toThrow();
  });
});

// ── 쓰기 직전 방어선 ────────────────────────────────────────────

describe("assertAllowedScanOutbound", () => {
  const expected = {
    uri: scanTargetUri(scanLay),
    text: new TextDecoder().decode(REAL_TARGET),
  };
  const ctx = (over: Partial<ScanSendGuardContext> = {}): ScanSendGuardContext => ({
    barrierDone: false,
    progressComplete: false,
    sent: [],
    expectedDidOpen: expected,
    ...over,
  });
  const afterBarrier = (over: Partial<ScanSendGuardContext> = {}): ScanSendGuardContext =>
    ctx({
      barrierDone: true,
      progressComplete: true,
      sent: ["initialize", "initialized"],
      ...over,
    });
  const didOpen = (): JsonRpcMessage => buildScanDidOpenMessage(scanLay, REAL_TARGET);

  it("정상 순서의 다섯 메시지는 통과한다", () => {
    const sent: ScanSendLabel[] = [];
    const run = (label: ScanSendLabel, m: JsonRpcMessage, barrierDone: boolean) => {
      assertAllowedScanOutbound(
        label,
        m,
        ctx({ sent: [...sent], barrierDone, progressComplete: barrierDone })
      );
      sent.push(label);
    };
    run("initialize", buildScanInitializeMessage(scanLay), false);
    run("initialized", buildScanInitializedMessage(), false);
    run("didOpen", didOpen(), true);
    run("shutdown", buildScanShutdownMessage(), true);
    run("exit", buildScanExitMessage(), true);
  });

  it("장벽 앞의 didOpen 은 거절한다", () => {
    expect(() =>
      assertAllowedScanOutbound("didOpen", didOpen(), ctx({ sent: ["initialize", "initialized"] }))
    ).toThrow(/장벽/);
  });

  it("장벽을 넘었어도 초기 진행 메시지를 다 읽기 전의 didOpen 은 거절한다(값이 없거나 true 가 아니어도 같다)", () => {
    const sent: ScanSendLabel[] = ["initialize", "initialized"];
    expect(() =>
      assertAllowedScanOutbound(
        "didOpen",
        didOpen(),
        ctx({ barrierDone: true, progressComplete: false, sent })
      )
    ).toThrow(/진행 메시지/);
    const missing = { ...ctx({ barrierDone: true, sent }) } as Partial<ScanSendGuardContext>;
    delete missing.progressComplete;
    expect(() =>
      assertAllowedScanOutbound("didOpen", didOpen(), missing as ScanSendGuardContext)
    ).toThrow(/진행 메시지/);
    expect(() =>
      assertAllowedScanOutbound(
        "didOpen",
        didOpen(),
        ctx({ barrierDone: true, progressComplete: "yes" as unknown as boolean, sent })
      )
    ).toThrow(/진행 메시지/);
    // 진행 메시지를 다 읽었으면 통과한다
    expect(() => assertAllowedScanOutbound("didOpen", didOpen(), afterBarrier())).not.toThrow();
  });

  it("initialized 를 보내기 전의 didOpen 도 거절한다", () => {
    expect(() =>
      assertAllowedScanOutbound(
        "didOpen",
        didOpen(),
        ctx({ barrierDone: true, sent: ["initialize"] })
      )
    ).toThrow();
  });

  it("두 번째 didOpen, 두 번째 initialized 는 거절한다", () => {
    expect(() =>
      assertAllowedScanOutbound(
        "didOpen",
        didOpen(),
        afterBarrier({ sent: ["initialize", "initialized", "didOpen"] })
      )
    ).toThrow(/두 번/);
    expect(() =>
      assertAllowedScanOutbound(
        "initialized",
        buildScanInitializedMessage(),
        ctx({ sent: ["initialize", "initialized"] })
      )
    ).toThrow(/두 번/);
  });

  it("shutdown 뒤에는 didOpen 을 보낼 수 없다 (순서 역행)", () => {
    expect(() =>
      assertAllowedScanOutbound(
        "didOpen",
        didOpen(),
        afterBarrier({ sent: ["initialize", "initialized", "shutdown"] })
      )
    ).toThrow();
  });

  it("didOpen 의 uri 가 다르거나 본문이 한 글자라도 다르면 거절한다", () => {
    const other = didOpen();
    (other.params as { textDocument: { uri: string } }).textDocument.uri = `${expected.uri}x`;
    expect(() => assertAllowedScanOutbound("didOpen", other, afterBarrier())).toThrow(/uri/);
    const text = didOpen();
    (text.params as { textDocument: { text: string } }).textDocument.text += " ";
    expect(() => assertAllowedScanOutbound("didOpen", text, afterBarrier())).toThrow(/본문/);
    const ver = didOpen();
    (ver.params as { textDocument: { version: number } }).textDocument.version = 2;
    expect(() => assertAllowedScanOutbound("didOpen", ver, afterBarrier())).toThrow();
    const lang = didOpen();
    (lang.params as { textDocument: { languageId: string } }).textDocument.languageId = "python";
    expect(() => assertAllowedScanOutbound("didOpen", lang, afterBarrier())).toThrow();
  });

  it("didOpen params 에 알려지지 않은 키가 있으면 거절한다", () => {
    const extra = didOpen();
    (extra.params as Record<string, unknown>).contentChanges = [];
    expect(() => assertAllowedScanOutbound("didOpen", extra, afterBarrier())).toThrow();
    const inner = didOpen();
    (inner.params as { textDocument: Record<string, unknown> }).textDocument.extra = 1;
    expect(() => assertAllowedScanOutbound("didOpen", inner, afterBarrier())).toThrow();
  });

  it("didSave·didChange·didClose·scanWorkspace·refreshRules·작업 영역 변경·파일 생성·응답은 어느 라벨로도 못 쓴다", () => {
    const methods = [
      "textDocument/didSave",
      "textDocument/didChange",
      "textDocument/didClose",
      "semgrep/scanWorkspace",
      "semgrep/refreshRules",
      "workspace/didChangeWorkspaceFolders",
      "workspace/didCreateFiles",
      "debug/echo",
    ];
    const labels: ScanSendLabel[] = ["initialize", "initialized", "didOpen", "shutdown", "exit"];
    for (const method of methods) {
      for (const label of labels) {
        const message: JsonRpcMessage = { jsonrpc: "2.0", method, params: {} };
        expect(
          () => assertAllowedScanOutbound(label, message, afterBarrier({ sent: [] })),
          `${label}/${method}`
        ).toThrow();
      }
    }
    const reply: JsonRpcMessage = { jsonrpc: "2.0", id: 1, result: null };
    expect(() => assertAllowedScanOutbound("didOpen", reply, afterBarrier())).toThrow();
    // 알 수 없는 라벨
    expect(() =>
      assertAllowedScanOutbound("didSave" as ScanSendLabel, didOpen(), afterBarrier())
    ).toThrow();
  });

  it("initialized 는 params 가 정확히 {} 이어야 한다", () => {
    const bad: JsonRpcMessage = { jsonrpc: "2.0", method: "initialized", params: { x: 1 } };
    expect(() =>
      assertAllowedScanOutbound("initialized", bad, ctx({ sent: ["initialize"] }))
    ).toThrow();
  });

  it("기존 RULES 방어선은 didOpen 을 여전히 막는다 (RULES 경계는 바뀌지 않았다)", () => {
    expect(() => assertAllowedRulesOutbound("initialized" as never, didOpen())).toThrow();
  });
});

// ── 설정 검사 ───────────────────────────────────────────────────

describe("initializationOptions 검사 (SCAN 경계)", () => {
  const good = () => buildScanInitializationOptions(scanLay);

  it("만들어진 옵션은 통과한다", () => {
    expect(validateScanInitializationOptions(good())).toEqual([]);
  });

  it("jobs 는 정수 1 만 통과한다", () => {
    for (const jobs of [2, 0, -1, 1.5, "1", true, null, undefined, [1], { a: 1 }]) {
      const o = good() as unknown as { scan: Record<string, unknown> };
      o.scan.jobs = jobs;
      expect(validateScanInitializationOptions(o).length, String(jobs)).toBeGreaterThan(0);
    }
    const missing = good() as unknown as { scan: Record<string, unknown> };
    delete missing.scan.jobs;
    expect(validateScanInitializationOptions(missing)).toContain("SCAN_JOBS_MISSING");
  });

  it("다른 키·중첩 객체·빠진 최상위 키·ci/onlyGitDirty/metrics 값 변경을 모두 거절한다", () => {
    const withKey = (
      patch: (
        o: { scan: Record<string, unknown>; metrics: Record<string, unknown> } & Record<
          string,
          unknown
        >
      ) => void
    ) => {
      const o = good() as unknown as {
        scan: Record<string, unknown>;
        metrics: Record<string, unknown>;
      } & Record<string, unknown>;
      patch(o);
      return validateScanInitializationOptions(o);
    };
    expect(withKey((o) => (o.scan.extra = 1)).length).toBeGreaterThan(0);
    expect(withKey((o) => (o.scan.configuration = { a: 1 })).length).toBeGreaterThan(0);
    expect(withKey((o) => (o.top = 1)).length).toBeGreaterThan(0);
    expect(withKey((o) => delete (o as Record<string, unknown>).metrics).length).toBeGreaterThan(0);
    expect(withKey((o) => (o.scan.ci = true)).length).toBeGreaterThan(0);
    expect(withKey((o) => (o.scan.onlyGitDirty = true)).length).toBeGreaterThan(0);
    expect(withKey((o) => (o.metrics.enabled = true)).length).toBeGreaterThan(0);
    expect(validateScanInitializationOptions("x")).not.toEqual([]);
    expect(validateScanInitializationOptions(null)).not.toEqual([]);
  });

  it("기존 RULES·MIN 경계의 검사는 바뀌지 않았다: jobs 키는 여전히 거절한다", () => {
    const reasons = validateInitializationOptions(good());
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons.map((r) => r.detail).join("|")).toContain("scan.jobs");
  });
});

// ── 요청 검사 ───────────────────────────────────────────────────

describe("요청 검사 (checkScanRequest)", () => {
  const EXE = "C:/venv/Scripts/semgrep.exe";
  const request = (over: Partial<ScanRequestShape> = {}): ScanRequestShape => ({
    runId: "run-1",
    command: EXE,
    args: ["lsp", "--debug"],
    layout: scanLay,
    env: buildLspMinEnv(scanLay, "C:/Windows", SCAN_URL),
    artifacts: [{ label: "core", path: "C:/venv/Lib/site-packages/semgrep/bin/semgrep-core.exe" }],
    probeBytes: PROBE,
    targetBytes: REAL_TARGET,
    ...over,
  });
  const refusals = (over: Partial<ScanRequestShape> = {}): string[] =>
    checkScanRequest(request(over), sha);

  it("정상 요청은 거절 사유가 없다", () => {
    expect(refusals()).toEqual([]);
  });

  it("한도: scanMs 도 낮추는 것만 된다", () => {
    expect(refusals({ limits: { scanMs: 1000 } })).toEqual([]);
    expect(refusals({ limits: { scanMs: 30_001 } })).toEqual(["LIMIT_ABOVE_CAP:scanMs"]);
    expect(refusals({ limits: { totalMs: 150_001 } })).toEqual(["LIMIT_ABOVE_CAP:totalMs"]);
    expect(refusals({ limits: { settleMs: 2_001 } })).toEqual(["LIMIT_ABOVE_CAP:settleMs"]);
    expect(refusals({ limits: { nope: 1 } as never })).toEqual(["LIMIT_UNKNOWN:nope"]);
    // 기존 RULES 경계는 scanMs 를 모른다 (바뀌지 않았다)
    const rules = checkRulesRequest(
      {
        runId: "run-1",
        command: EXE,
        args: ["lsp", "--debug"],
        layout: scanLay,
        env: buildLspMinEnv(scanLay, "C:/Windows", SCAN_URL),
        limits: { scanMs: 1000 } as never,
        probeBytes: PROBE,
      },
      sha
    );
    expect(rules).toContain("LIMIT_UNKNOWN:scanMs");
  });

  it("대상 파일: 없거나 크기·해시가 다르면 복사 전에 거절한다", () => {
    expect(refusals({ targetBytes: undefined })).toEqual(["TARGET_BYTES_MISSING"]);
    expect(refusals({ targetBytes: enc("x") })).toEqual(["TARGET_SIZE_MISMATCH"]);
    const changed = Uint8Array.from(REAL_TARGET);
    changed[3] = 0x58;
    expect(refusals({ targetBytes: changed })).toEqual(["TARGET_HASH_MISMATCH"]);
    expect(refusals({ probeBytes: undefined })).toEqual(["PROBE_BYTES_MISSING"]);
    const probe = Uint8Array.from(PROBE);
    probe[0] ^= 1;
    expect(refusals({ probeBytes: probe })).toEqual(["PROBE_HASH_MISMATCH"]);
  });

  it("배치: 대상 경로가 작업 영역 + 파일 이름이 아니면 거절한다", () => {
    expect(
      refusals({ layout: { ...scanLay, targetPath: `${scanLay.workspace}/other.txt` } })
    ).toContain("LAYOUT_MISMATCH");
    expect(refusals({ layout: { ...scanLay, workspace: "C:/elsewhere/ws" } })).toContain(
      "LAYOUT_MISMATCH"
    );
  });

  it("실행 파일·인자·환경은 RULES 와 같은 규칙이다", () => {
    expect(refusals({ command: "C:/venv/Scripts/other.exe" })).toContain(
      "COMMAND_NAME_NOT_ALLOWED"
    );
    expect(refusals({ args: ["lsp"] })).toContain("ARGS_NOT_FIXED");
    expect(refusals({ runId: "bad id!" })).toContain("RUN_ID_INVALID");
    expect(
      refusals({
        env: { ...buildLspMinEnv(scanLay, "C:/Windows", SCAN_URL), SEMGREP_APP_TOKEN: "x" },
      })
    ).toContain("ENV_NAME_NOT_ALLOWED:SEMGREP_APP_TOKEN");
  });

  it("initializationOptions 가 함께 오면 SCAN 검사를 거친다", () => {
    const bad = buildScanInitializationOptions(scanLay) as unknown as {
      scan: Record<string, unknown>;
    };
    bad.scan.jobs = 2;
    expect(refusals({ initializationOptions: bad })).toContain("SETTINGS_KEY_NOT_ALLOWED");
    expect(refusals({ initializationOptions: buildScanInitializationOptions(scanLay) })).toEqual(
      []
    );
  });

  it("대상 파일 경로에 금지 문구가 있으면 거절한다", () => {
    const lay = scanLayout("C:/work/scanning-x");
    expect(refusals({ layout: lay })).toContain("PATH_CONTAINS_FORBIDDEN_FRAGMENT:WORKSPACE");
  });
});

// ── 허용 이미지 ─────────────────────────────────────────────────

describe("허용 이미지 목록은 바뀌지 않았다", () => {
  it("git 은 허용 목록에 없다", () => {
    expect(ALLOWED_IMAGES).toEqual([
      "semgrep.exe",
      "python.exe",
      "semgrep-core.exe",
      "pysemgrep.exe",
      "conhost.exe",
    ]);
    for (const image of ALLOWED_IMAGES) expect(image.toLowerCase()).not.toContain("git");
  });
});

// ── 진단 평가 ───────────────────────────────────────────────────

describe("evaluateScanDiagnostic", () => {
  const evalWith = (patch: Record<string, unknown>) =>
    evaluateScanDiagnostic({ ...structuredClone(GOOD_DIAGNOSTIC), ...patch });

  it("정상 진단: 모든 필드가 일치하고 알 수 없는 필드가 없다", () => {
    const e = evaluateScanDiagnostic(GOOD_DIAGNOSTIC);
    expect(e.ok).toBe(true);
    expect(e.mismatches).toEqual([]);
    expect(e.unknownFields).toEqual([]);
    expect(e.codeDescriptionAbsent).toBe(true);
    expect(e.fields.range.class).toBe("EXACT");
    expect(e.fields.code.actual).toBe("rules-probe.lsp-rules-1-probe");
  });

  it("code 는 두 문자열 모두 서수로 허용하고 실제 값을 기록한다", () => {
    for (const code of LSP_SCAN_EXPECTED_DIAGNOSTIC.codes) {
      const e = evalWith({ code });
      expect(e.ok, code).toBe(true);
      expect(e.fields.code.actual).toBe(code);
    }
  });

  it("code 는 접두 제거·접미 비교·대소문자 무시·다른 형·공백을 허용하지 않는다", () => {
    for (const code of [
      "x.rules-probe.lsp-rules-1-probe",
      "rules-probe.lsp-rules-1-probe.x",
      "Rules-Probe.lsp-rules-1-probe",
      "LSP-RULES-1-PROBE",
      "probe",
      "lsp-rules-1-probe ",
      " lsp-rules-1-probe",
      "",
      1,
      null,
      { a: 1 },
    ]) {
      const e = evalWith({ code });
      expect(e.ok, String(code)).toBe(false);
      expect(e.mismatches).toContain("CODE");
    }
    expect(evaluateScanDiagnostic({ ...GOOD_DIAGNOSTIC, code: undefined }).mismatches).toContain(
      "CODE"
    );
  });

  it("source·message·severity 는 서수 비교다 (같아 보이는 다른 값도 거절)", () => {
    expect(evalWith({ source: "semgrep" }).mismatches).toEqual(["SOURCE"]);
    expect(evalWith({ source: "Semgrep\u00ad" }).mismatches).toEqual(["SOURCE"]);
    expect(evalWith({ message: `${GOOD_DIAGNOSTIC.message} ` }).mismatches).toEqual(["MESSAGE"]);
    expect(
      evalWith({ message: GOOD_DIAGNOSTIC.message.replace("is loaded", "is  loaded") }).mismatches
    ).toEqual(["MESSAGE"]);
    expect(evalWith({ message: undefined }).mismatches).toEqual(["MESSAGE"]);
    for (const severity of [1, 2, 4, "3", 3.5, null, undefined, true]) {
      expect(evalWith({ severity }).mismatches, String(severity)).toEqual(["SEVERITY"]);
    }
  });

  it("범위: 정확히 일치해야 한다. 어느 끝이든 ±1 은 성공이 아니고 실제 값을 돌려준다", () => {
    const range = (sl: number, sc: number, el: number, ec: number) => ({
      start: { line: sl, character: sc },
      end: { line: el, character: ec },
    });
    expect(evalWith({ range: range(1, 8, 1, 53) }).ok).toBe(true);
    const shifted: [string, ReturnType<typeof range>, string][] = [
      ["시작 열 -1", range(1, 7, 1, 53), "MISMATCH"],
      ["시작 열 +1", range(1, 9, 1, 53), "MISMATCH"],
      ["끝 열 -1", range(1, 8, 1, 52), "END_SHIFTED_BY_ONE"],
      ["끝 열 +1", range(1, 8, 1, 54), "END_SHIFTED_BY_ONE"],
      ["시작 줄 +1", range(2, 8, 1, 53), "MISMATCH"],
      ["끝 줄 +1", range(1, 8, 2, 53), "MISMATCH"],
      ["끝 열 +2", range(1, 8, 1, 55), "MISMATCH"],
      ["1 기준 표기", range(2, 9, 2, 54), "MISMATCH"],
    ];
    for (const [name, r, cls] of shifted) {
      const e = evalWith({ range: r });
      expect(e.ok, name).toBe(false);
      expect(e.mismatches, name).toEqual(["RANGE"]);
      expect(e.fields.range.class, name).toBe(cls);
      expect(e.fields.range.actual, name).toEqual(r); // 값을 고치지 않고 그대로 기록한다
    }
    for (const bad of [
      null,
      "x",
      { start: 1 },
      { start: { line: "1", character: 8 }, end: { line: 1, character: 53 } },
      { start: { line: 1.5, character: 8 }, end: { line: 1, character: 53 } },
    ]) {
      const e = evalWith({ range: bad });
      expect(e.mismatches, JSON.stringify(bad)).toEqual(["RANGE"]);
      expect(e.fields.range.class).toBe("MISMATCH");
    }
  });

  it("codeDescription 이 있으면 (값이 무엇이든) 필드 불일치다", () => {
    for (const value of [{ href: "https://x" }, null, "", 0]) {
      const e = evalWith({ codeDescription: value });
      expect(e.codeDescriptionAbsent).toBe(false);
      expect(e.mismatches).toEqual(["CODE_DESCRIPTION_PRESENT"]);
      expect(e.ok).toBe(false);
    }
  });

  it("알려지지 않은 필드는 기록하되 성공도 실패도 만들지 않는다", () => {
    const e = evalWith({ tags: [1], data: { a: 1 }, relatedInformation: [] });
    expect(e.unknownFields).toEqual(["data", "relatedInformation", "tags"]);
    expect(e.ok).toBe(true);
    expect(e.mismatches).toEqual([]);
  });

  it("객체가 아니면 NOT_OBJECT 로 거절한다", () => {
    for (const bad of [null, undefined, 1, "x", [], [GOOD_DIAGNOSTIC]]) {
      const e = evaluateScanDiagnostic(bad);
      expect(e.ok).toBe(false);
      expect(e.mismatches).toEqual(["NOT_OBJECT"]);
    }
  });

  it("필드가 둘 이상 틀리면 모두 보고한다", () => {
    const e = evalWith({ source: "x", severity: 1, code: "y" });
    expect(e.mismatches.sort()).toEqual(["CODE", "SEVERITY", "SOURCE"]);
  });
});

// ── stdout 분석 ─────────────────────────────────────────────────

describe("analyzeScanStdout", () => {
  it("진단 프레임마다 stdout 바이트 구간(첫 바이트, 마지막 바이트 다음)과 내용을 돌려준다", () => {
    const pre = frames(barrierStdoutMessages());
    const n1 = goodNotification();
    const n2 = publishDiagnostics("file:///c%3A/other", []);
    const f1 = frames([n1]);
    const f2 = frames([n2]);
    const a = analyzeScanStdout(concat(pre, f1, f2), true);
    expect(a.frameError).toBeNull();
    expect(a.diagnosticFrames).toHaveLength(2);
    expect(a.diagnosticFrames[0].startByte).toBe(pre.byteLength);
    expect(a.diagnosticFrames[0].endByte).toBe(pre.byteLength + f1.byteLength);
    expect(a.diagnosticFrames[1].startByte).toBe(pre.byteLength + f1.byteLength);
    expect(a.diagnosticFrames[1].endByte).toBe(pre.byteLength + f1.byteLength + f2.byteLength);
    expect(a.diagnosticFrames[0].uri).toBe(TARGET_URI);
    expect(a.diagnosticFrames[0].diagnostics).toEqual([GOOD_DIAGNOSTIC]);
    expect(a.diagnosticFrames[0].shapeOk).toBe(true);
    expect(a.diagnosticFrames[1].diagnostics).toEqual([]);
    // 기존 분석 필드는 그대로
    expect(a.diagnosticsCount).toBe(2);
    expect(a.initMessage).not.toBeNull();
    expect(a.initDuplicate).toBe(false);
    expect(a.rulesRefreshedCount).toBe(1);
    expect(a.serverRequestCount).toBe(2);
    expect(a.unmatchedResponses).toBe(0);
    expect(a.frameList).toHaveLength(8 + 2);
    expect(a.frameList[0].kind).toBe("response");
    expect(a.frameList[9].method).toBe("textDocument/publishDiagnostics");
  });

  it("params 모양이 틀린 진단 프레임(진단 목록이 배열이 아님·params 없음)은 shapeOk=false 로 돌려준다 (uri 가 문자열인지는 URI 비교의 몫이다)", () => {
    const a = analyzeScanStdout(
      frames([
        publishDiagnostics(5, [GOOD_DIAGNOSTIC]),
        publishDiagnostics(TARGET_URI, "x"),
        { jsonrpc: "2.0", method: "textDocument/publishDiagnostics" },
        publishDiagnostics(TARGET_URI, [], { version: 3 }),
      ]),
      true
    );
    expect(a.diagnosticFrames.map((f) => f.shapeOk)).toEqual([true, false, false, true]);
    expect(a.diagnosticFrames[0].uri).toBe(5); // 원문 그대로
    expect(a.diagnosticFrames[3].paramsKeys).toEqual(["diagnostics", "uri", "version"]);
  });

  it("스캔 init id 의 응답을 초기화 응답으로 센다 (짝 없는 응답이 아니다)", () => {
    const a = analyzeScanStdout(frames([barrierStdoutMessages()[0]]), true);
    expect(a.initMessage).not.toBeNull();
    expect(a.unmatchedResponses).toBe(0);
    const dup = analyzeScanStdout(
      frames([barrierStdoutMessages()[0], barrierStdoutMessages()[0]]),
      true
    );
    expect(dup.initDuplicate).toBe(true);
    const other = analyzeScanStdout(
      frames([{ jsonrpc: "2.0", id: "lsp-rules-init-1", result: {} }]),
      true
    );
    expect(other.unmatchedResponses).toBe(1);
  });

  it("프레임 오류(잘림·깨짐)는 그대로 알려 준다", () => {
    const whole = frames([goodNotification()]);
    const cut = analyzeScanStdout(whole.subarray(0, whole.byteLength - 5), true);
    expect(cut.frameError?.kind).toBe("TRUNCATED");
    expect(cut.diagnosticFrames).toHaveLength(0);
    const open = analyzeScanStdout(whole.subarray(0, whole.byteLength - 5), false);
    expect(open.frameError).toBeNull();
    const bad = analyzeScanStdout(concat(frames([goodNotification()]), enc("garbage")), true);
    expect(bad.frameError).not.toBeNull();
    expect(bad.diagnosticFrames).toHaveLength(1); // 오류 앞에서 완성된 프레임은 남는다
  });

  it("서버 요청·알 수 없는 알림·id/method 없는 메시지를 RULES 분석과 같이 센다", () => {
    const a = analyzeScanStdout(
      frames([
        { jsonrpc: "2.0", id: 9, method: "workspace/configuration", params: {} },
        { jsonrpc: "2.0", method: "telemetry/event", params: {} },
        { jsonrpc: "2.0", method: "window/showMessage", params: { type: 1, message: "x" } },
        { jsonrpc: "2.0", result: null } as unknown as JsonRpcMessage,
      ]),
      true
    );
    expect(a.serverRequestCount).toBe(1);
    expect(a.serverRequests[0].allowed).toBe(false);
    expect(a.otherNotifications["telemetry/event"]).toBe(1);
    expect(a.errorNotifications).toBe(1);
    expect(a.messagesWithoutMethodOrId).toBe(1);
    expect(a.frameList.map((f) => f.kind)).toEqual([
      "server-request",
      "notification",
      "notification",
      "invalid",
    ]);
  });
});

// ── 상수 ────────────────────────────────────────────────────────

describe("미관측 목록과 중단 이름", () => {
  it("SCAN 목록은 RULES 의 정적 목록과 별개다 (RULES 목록은 바뀌지 않았다)", () => {
    expect(RULES_UNOBSERVED_ALWAYS).toContain("LOADED_RULE_COUNT");
    expect(RULES_UNOBSERVED_ALWAYS).toHaveLength(10);
    expect(SCAN_UNOBSERVED_ALWAYS).not.toBe(RULES_UNOBSERVED_ALWAYS);
    for (const item of [
      "RULE_DETECTION_PERFORMANCE_IN_GENERAL",
      "REAL_REPOSITORY_SCAN_SECURITY",
      "NEGATIVE_CONTROLS",
      "CONTROL_REFERENCE_QUALIFICATION",
      "WHOLE_ISOLATION_EFFECT",
      "BINARY_SOURCE_CORRESPONDENCE",
      "PIN_AND_LOG_FORMAT_VERIFICATION",
      "GIT_PROCESS_CREATION_AND_OUTCOME",
    ]) {
      expect(SCAN_UNOBSERVED_ALWAYS, item).toContain(item);
    }
    expect(Object.isFrozen(SCAN_UNOBSERVED_ALWAYS)).toBe(true);
  });

  it("중단 조건은 계획 5.2절의 이름으로 대응한다", () => {
    expect(SCAN_ABORT_NAME.A1).toBe("FORBIDDEN_SIGNAL");
    expect(SCAN_ABORT_NAME.A2).toBe("FORBIDDEN_SIGNAL");
    expect(SCAN_ABORT_NAME.A4).toBe("UNEXPECTED_IMAGE");
    expect(SCAN_ABORT_NAME.A10).toBe("SEND_REFUSED");
  });
});
