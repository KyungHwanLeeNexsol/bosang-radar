import { describe, expect, it } from "vitest";
import { encodeFrame } from "./framing";
import { LSP_MIN_LIMITS, buildObservationRecord } from "./lsp-min";
import {
  RUNNER_RESULT_KIND,
  RUNNER_RESULT_SCHEMA,
  factsFromRunnerResult,
  type RunnerResultContext,
} from "./lsp-min-runner-result";
import type { JsonRpcMessage } from "./types";

// Windows 러너(lsp-min-runner.ps1)가 남기는 결과 JSON의 모양을 손으로 만든 합성 입력으로 어댑터를 확인한다.
// 러너가 실제로 남긴 결과를 이 어댑터에 먹이는 시험은 windows/tests/Test-LspMinRunner.ps1 이 한다(tsx로 이 모듈을 불러 대조).

const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64");
const frame = (m: JsonRpcMessage): Uint8Array => encodeFrame(m);
const GOOD = {
  capabilities: { textDocumentSync: 1 },
  serverInfo: { name: "Semgrep", version: "9.9.9" },
};
const receiverOk = { baselineHits: 0, finalHits: 0, samples: 5, failures: 0 };

function stream(bytes: Uint8Array, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    b64: b64(bytes),
    bytesKept: bytes.length,
    bytesRead: bytes.length,
    limit: 1000,
    overflow: false,
    readFailed: false,
    eof: true,
    state: "EOF",
    error: null,
    ...over,
  };
}

function goodResult(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: RUNNER_RESULT_SCHEMA,
    kind: RUNNER_RESULT_KIND,
    runToken: "t",
    mode: "stub",
    refused: null,
    refusals: [],
    error: null,
    child: {
      started: true,
      pid: 4321,
      startUtc: "2026-10-28T00:00:00.0000000Z",
      mainModule: null,
      spawnError: null,
    },
    sends: [
      { label: "initialize", tMs: 107, ok: true },
      { label: "shutdown", tMs: 860, ok: true },
      { label: "exit", tMs: 861, ok: true },
    ],
    stdout: stream(frame({ jsonrpc: "2.0", id: "lsp-min-init-1", result: GOOD })),
    stderr: stream(new Uint8Array(0)),
    frameError: null,
    initResponseAtMs: 800,
    exit: { observed: true, code: 0, signal: null, tMs: 1001 },
    stdinClosed: { byHarness: false, ok: null, tMs: null },
    kill: { count: 0, firstTMs: null, confirmed: null },
    trigger: "NORMAL",
    also: [],
    abort: null,
    live: {
      stderrCheckedBytes: 0,
      stdoutFramesChecked: 1,
      initErrorLogged: false,
      receiver: { abortFileChecks: 5 },
      processes: {
        samples: 5,
        failures: 0,
        maxDescendants: 1,
        imagesSeen: ["conhost.exe", "powershell.exe"],
        disallowed: [],
      },
      files: { samples: 6, failures: 0 },
    },
    roots: [
      { role: "WORKSPACE", filesBefore: 0, filesAfter: 0, added: [], removed: [] },
      { role: "RULES_DIR", filesBefore: 0, filesAfter: 0, added: [], removed: [] },
      { role: "HOME_DIR", filesBefore: 0, filesAfter: 0, added: [], removed: [] },
    ],
    artifacts: [],
    timeline: { observationMs: 1001, cleanupMs: 360 },
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

const ctx = { runId: "run-1", expectedVersion: "9.9.9", receiver: receiverOk };
const record = (json: unknown, c: RunnerResultContext = ctx) =>
  buildObservationRecord(factsFromRunnerResult(json, c));

describe("factsFromRunnerResult", () => {
  it("정상 결과: OBSERVED이고 서버 정보·응답 지연·종료 경로가 같은 규칙으로 해석된다", () => {
    const r = record(goodResult());
    expect(r.status).toBe("OBSERVED");
    expect(r.provenance).toBe("stub");
    expect(r.initialize).toMatchObject({
      response: "VALID",
      latency_ms: 693,
      pin_version_comparison: "MATCH",
      server_info: { name: "Semgrep", version: "9.9.9" },
    });
    expect(r.termination).toMatchObject({
      trigger: "NORMAL",
      path: "SELF_EXIT",
      exit: { code: 0, signal: null },
    });
    expect(r.cleanup.ok).toBe(true);
    expect(r.not_established.complete).toBe("NOT_ESTABLISHED");
  });

  it("mode가 semgrep-lsp면 provenance는 real, stub이면 stub이다. 알 수 없는 mode는 관측 불성립", () => {
    expect(record(goodResult({ mode: "semgrep-lsp" })).provenance).toBe("real");
    const r = record(goodResult({ mode: "anything" }));
    expect(r.status).toBe("NOT_OBSERVED");
    expect(r.status_reasons).toContain("RUNNER_RESULT_MALFORMED:mode");
  });

  it("러너가 거절한 요청은 NOT_ATTEMPTED이고 사유 토큰이 그대로 남는다", () => {
    const r = record({
      schema: 1,
      kind: RUNNER_RESULT_KIND,
      mode: "stub",
      refused: "ARGS_NOT_FIXED,ENV_NAME_NOT_ALLOWED:HOME",
      refusals: ["ARGS_NOT_FIXED", "ENV_NAME_NOT_ALLOWED:HOME"],
    });
    expect(r.status).toBe("NOT_ATTEMPTED");
    expect(r.status_reasons).toEqual(["ARGS_NOT_FIXED", "ENV_NAME_NOT_ALLOWED:HOME"]);
    expect(r.provenance).toBeNull();
  });

  it.each([
    ["null", null],
    ["배열", []],
    ["문자열", "x"],
    ["스키마 번호가 다름", { schema: 2, kind: RUNNER_RESULT_KIND }],
    ["kind가 다름", { schema: 1, kind: "version-runner-result" }],
  ])("형식이 틀린 결과(%s)는 관측 불성립이고 정리도 실패로 본다", (_n, json) => {
    const r = record(json);
    expect(r.status).toBe("NOT_OBSERVED");
    expect(r.status_reasons).toContain("RUNNER_RESULT_MALFORMED:schema");
    expect(r.cleanup.ok).toBe(false);
  });

  it("필수 필드가 빠지면 어느 필드인지 사유에 남긴다", () => {
    const base = goodResult();
    for (const field of [
      "child",
      "exit",
      "stdinClosed",
      "kill",
      "live",
      "stdout",
      "stderr",
      "trigger",
    ]) {
      const copy = { ...base };
      delete copy[field];
      const r = record(copy);
      expect(r.status, field).toBe("NOT_OBSERVED");
      expect(
        r.status_reasons.some((x) => x.startsWith("RUNNER_RESULT_MALFORMED")),
        field
      ).toBe(true);
      // 관측 쪽 필드의 형식 오류는 정리 결과를 건드리지 않는다.
      expect(r.cleanup.problems, field).not.toContain("RUNNER_RESULT_MALFORMED");
    }
  });

  it("정리 블록이 빠지면 정리만 실패로 적고 관측 상태는 바꾸지 않는다", () => {
    const copy = goodResult();
    delete copy.cleanup;
    const r = record(copy);
    expect(r.cleanup.ok).toBe(false);
    expect(r.cleanup.problems).toContain("RUNNER_RESULT_MALFORMED:cleanup");
    expect(r.status_reasons.some((x) => x.includes("cleanup"))).toBe(false);
    expect(r.status).toBe(record(goodResult()).status);
  });

  it("러너가 오류로 끝났다고 적었으면(구간을 모르면) 관측 불성립", () => {
    const r = record(goodResult({ error: "boom" }));
    expect(r.status).toBe("NOT_OBSERVED");
    expect(r.status_reasons).toContain("RUNNER_RESULT_MALFORMED:runner.error");
    expect(r.cleanup.problems).not.toContain("RUNNER_ERROR_IN_CLEANUP");
  });

  it("관측 구간에서 던졌다고 적었으면 관측 불성립", () => {
    const r = record(goodResult({ error: "boom", errorPhase: "OBSERVATION" }));
    expect(r.status).toBe("NOT_OBSERVED");
    expect(r.status_reasons).toContain("RUNNER_RESULT_MALFORMED:runner.error");
  });

  it("정리 구간에서 던졌다고 적었으면 정리만 실패로 적고 관측 상태는 바꾸지 않는다", () => {
    const clean = record(goodResult());
    const r = record(goodResult({ error: "boom", errorPhase: "CLEANUP" }));
    expect(r.status).toBe(clean.status);
    expect(r.status_reasons).toEqual(clean.status_reasons);
    expect(r.cleanup.ok).toBe(false);
    expect(r.cleanup.problems).toContain("RUNNER_ERROR_IN_CLEANUP");
  });

  it("중단된 기록에서도 러너 결과의 형식 오류가 status_reasons에 남는다", () => {
    const r = record(
      goodResult({
        trigger: "LIVE_ABORT",
        abort: { condition: "A5", detail: "WORKSPACE", tMs: 5 },
        kill: "broken",
      })
    );
    expect(r.status).toBe("ABORTED");
    expect(r.status_reasons).toEqual(
      expect.arrayContaining(["ABORT:A5", "RUNNER_RESULT_MALFORMED:kill"])
    );
  });

  it("수신기 정보(관리자 쪽이 읽은 값)를 넘기지 않으면 OBSERVED가 될 수 없다", () => {
    const r = buildObservationRecord(factsFromRunnerResult(goodResult(), { runId: "run-1" }));
    expect(r.status).toBe("NOT_OBSERVED");
    expect(r.status_reasons).toContain("RECEIVER_FINAL_UNOBSERVABLE");
  });

  it("수신기 건수가 늘었으면 사후 위반으로 드러난다", () => {
    const r = record(goodResult(), {
      ...ctx,
      receiver: { baselineHits: 0, finalHits: 2, samples: 5, failures: 0 },
    });
    expect(r.status_reasons).toContain("RECEIVER_HITS_INCREASED");
  });

  it("초기화 실패 결과: result 안의 InitializeError는 러너가 판단하지 않아도 TS 해석에서 걸린다", () => {
    const out = new Uint8Array([
      ...frame({ jsonrpc: "2.0", method: "window/logMessage", params: {} }),
      ...frame({ jsonrpc: "2.0", id: "lsp-min-init-1", result: { retry: false } }),
    ]);
    const r = record(
      goodResult({
        stdout: stream(out),
        sends: [{ label: "initialize", tMs: 0, ok: true }],
        trigger: "INIT_INVALID",
        stdinClosed: { byHarness: true, ok: true, tMs: 900 },
      })
    );
    expect(r.status).toBe("NOT_OBSERVED");
    expect(r.initialize.response).toBe("INVALID");
    expect(r.status_reasons).toContain("INIT_RESULT_IS_INITIALIZE_ERROR");
    expect(r.termination).toMatchObject({ trigger: "INIT_INVALID", path: "STDIN_CLOSED" });
  });

  it("라이브 중단 결과: ABORTED와 조건·종료 경로가 그대로 옮겨진다", () => {
    const r = record(
      goodResult({
        trigger: "LIVE_ABORT",
        abort: { condition: "A1", detail: "refreshing rules", tMs: 400 },
        kill: { count: 1, firstTMs: 400, confirmed: true },
        exit: { observed: true, code: null, signal: null, tMs: 450 },
      })
    );
    expect(r.status).toBe("ABORTED");
    expect(r.termination.abort).toEqual({ condition: "A1", detail: "refreshing rules", t_ms: 400 });
    expect(r.termination.path).toBe("FORCE_KILLED");
  });

  it("알 수 없는 중단 조건·트리거 문자열은 받아들이지 않는다", () => {
    const r = record(
      goodResult({ trigger: "WHATEVER", abort: { condition: "A9", detail: "x", tMs: 1 } })
    );
    expect(r.status).toBe("NOT_OBSERVED");
    expect(r.status_reasons).toEqual(
      expect.arrayContaining(["RUNNER_RESULT_MALFORMED:trigger", "RUNNER_RESULT_MALFORMED:abort"])
    );
  });

  it("PowerShell 5.1이 배열을 스칼라나 빈 객체로 쓰는 경우도 받아 준다 (also, refusals, 추가된 파일, 이미지 목록)", () => {
    const r = record(
      goodResult({
        // 이 시험의 목적은 배열 모양이다. 관측 성립을 막지 않는 사유를 쓴다(막는 사유는 아래 "후속 사유" 시험이 다룬다).
        also: "EXIT_TIMEOUT",
        live: {
          stderrCheckedBytes: 0,
          stdoutFramesChecked: 1,
          receiver: { abortFileChecks: 1 },
          processes: {
            samples: 1,
            failures: 0,
            maxDescendants: 1,
            imagesSeen: "semgrep.exe",
            disallowed: {},
          },
          files: { samples: 1, failures: 0 },
        },
        roots: [
          { role: "WORKSPACE", filesBefore: 0, filesAfter: 0, added: {}, removed: {} },
          { role: "RULES_DIR", filesBefore: 0, filesAfter: 0, added: [], removed: [] },
          {
            role: "HOME_DIR",
            filesBefore: 0,
            filesAfter: 1,
            added: ".semgrep/cache/fingerprinted_ignored_findings/ws.txt",
            removed: [],
          },
        ],
      })
    );
    expect(r.termination.also).toEqual(["EXIT_TIMEOUT"]);
    expect(r.coverage.live.processes.images_seen).toEqual(["semgrep.exe"]);
    expect(r.coverage.live.processes.disallowed).toEqual([]);
    expect(r.coverage.post_hoc.watched_roots.find((x) => x.role === "HOME_DIR")?.added).toEqual([
      ".semgrep/cache/fingerprinted_ignored_findings/ws.txt",
    ]);
    expect(r.status).toBe("OBSERVED");
  });

  it("감시 폴더의 위반은 러너가 놓쳤어도 사후 해석이 잡는다", () => {
    const roots = [
      { role: "WORKSPACE", filesBefore: 0, filesAfter: 1, added: ["x.txt"], removed: [] },
      { role: "RULES_DIR", filesBefore: 0, filesAfter: 0, added: [], removed: [] },
      { role: "HOME_DIR", filesBefore: 0, filesAfter: 0, added: [], removed: [] },
    ];
    const r = record(goodResult({ roots }));
    expect(r.status_reasons).toContain("WATCHED_ROOT_VIOLATION:WORKSPACE");
  });

  it("stderr에 중단 문구가 있었는데 러너가 못 잡았다면 STDERR_PATTERN_NOT_CAUGHT_LIVE", () => {
    const r = record(goodResult({ stderr: stream(new TextEncoder().encode("Rules refreshed\n")) }));
    expect(r.status_reasons).toContain("STDERR_PATTERN_NOT_CAUGHT_LIVE");
  });

  it("정리 결과를 관측 결과와 따로 옮긴다: 남은 자손과 종료 미확인", () => {
    const r = record(
      goodResult({
        cleanup: {
          childExitConfirmed: false,
          streamsClosed: false,
          descendantsAliveAfter: 2,
          descendantTracking: "ROOT_PRESENT",
          dispose: "OK",
          timersCancelled: true,
          problems: ["KILL_NOT_OBSERVED", "LEFTOVER_DESCENDANTS_KILLED:2"],
        },
      })
    );
    expect(r.status).toBe("OBSERVED");
    expect(r.cleanup.ok).toBe(false);
    expect(r.cleanup.problems).toEqual(["KILL_NOT_OBSERVED", "LEFTOVER_DESCENDANTS_KILLED:2"]);
  });

  it("요청 한도를 ctx로 넘기면 기록에 그 값이 실린다. 안 넘기면 기본 상한이다", () => {
    expect(record(goodResult()).request.limits.total_ms).toBe(LSP_MIN_LIMITS.totalMs);
    expect(
      record(goodResult(), { ...ctx, limits: { ...LSP_MIN_LIMITS, totalMs: 1234 } }).request.limits
        .total_ms
    ).toBe(1234);
  });

  it("깨진 base64는 관측 불성립", () => {
    const bad = goodResult({ stdout: { ...stream(new Uint8Array(0)), b64: 12345 } });
    expect(record(bad).status_reasons).toContain("RUNNER_RESULT_MALFORMED:stdout");
  });

  // exit·stdin EOF를 모두 무시해 EXIT_TIMEOUT 뒤 유예가 전체 상한에 잘려 강제 종료된 러너 결과(TS 실행기의 같은 시험과 같은 판정이어야 한다).
  const forcedAfterExitTimeout = (over: Record<string, unknown> = {}) =>
    goodResult({
      trigger: "EXIT_TIMEOUT",
      also: ["TOTAL_TIMEOUT"],
      exit: { observed: true, code: null, signal: null, tMs: 55_050 },
      stdinClosed: { byHarness: true, ok: true, tMs: 50_000 },
      kill: { count: 1, firstTMs: 55_000, confirmed: true },
      ...over,
    });

  it("후속 사유(EXIT_TIMEOUT 뒤 TOTAL_TIMEOUT)와 강제 종료가 관측을 막는다. 사유 순서와 실제 관측 사실은 그대로다", () => {
    const r = record(forcedAfterExitTimeout());
    expect(r.status).toBe("NOT_OBSERVED");
    expect(r.status_reasons).toEqual(
      expect.arrayContaining(["TOTAL_TIMEOUT", "FORCE_KILL_REQUIRED"])
    );
    expect(r.termination).toMatchObject({
      trigger: "EXIT_TIMEOUT",
      also: ["TOTAL_TIMEOUT"],
      path: "FORCE_KILLED",
    });
    expect(r.initialize.response).toBe("VALID");
    expect(r.sent.map((s) => s.label)).toEqual(["initialize", "shutdown", "exit"]);
  });

  it("TOTAL_TIMEOUT이 첫 사유인 결과도 같은 판정이다", () => {
    const r = record(forcedAfterExitTimeout({ trigger: "TOTAL_TIMEOUT", also: [] }));
    expect(r.status).toBe("NOT_OBSERVED");
    expect(r.status_reasons).toEqual(
      expect.arrayContaining(["TOTAL_TIMEOUT", "FORCE_KILL_REQUIRED"])
    );
  });

  it.each(["TOTAL_TIMEOUT", "STDIN_ERROR", "STREAM_READ_FAILED", "CHILD_EXITED_EARLY"])(
    "후속 사유 %s도 관측을 막는다 (강제 종료 없이도)",
    (token) => {
      const r = record(goodResult({ trigger: "EXIT_TIMEOUT", also: [token] }));
      expect(r.status).toBe("NOT_OBSERVED");
      expect(r.status_reasons).toContain(token);
      expect(r.status_reasons).not.toContain("RUNNER_RESULT_MALFORMED:trigger");
      expect(r.termination.also).toEqual([token]);
    }
  );

  it("stdin EOF로 끝난 결과는 OBSERVED로 남고 SELF_EXIT와 구분된다", () => {
    const r = record(
      goodResult({
        trigger: "EXIT_TIMEOUT",
        stdinClosed: { byHarness: true, ok: true, tMs: 30_000 },
        exit: { observed: true, code: 0, signal: null, tMs: 30_020 },
      })
    );
    expect(r.status).toBe("OBSERVED");
    expect(r.termination.path).toBe("STDIN_CLOSED");
    expect(record(goodResult()).termination.path).toBe("SELF_EXIT");
  });

  it("읽기 실패 결과: STREAM_READ_FAILED로 올라오고 STDIN_ERROR가 아니며, 받은 바이트와 오류 문구가 남는다", () => {
    const received = frame({ jsonrpc: "2.0", id: "lsp-min-init-1", result: GOOD });
    const r = record(
      goodResult({
        trigger: "STREAM_READ_FAILED",
        sends: [{ label: "initialize", tMs: 107, ok: true }],
        stdout: stream(received, {
          eof: false,
          readFailed: true,
          state: "READ_FAILED",
          error: "IOException: The pipe is being closed.",
        }),
        exit: { observed: true, code: null, signal: null, tMs: 900 },
        kill: { count: 1, firstTMs: 800, confirmed: true },
      })
    );
    expect(r.status).toBe("NOT_OBSERVED");
    expect(r.status_reasons).toContain("STREAM_READ_FAILED");
    expect(r.status_reasons).not.toContain("STDIN_ERROR");
    expect(r.status_reasons).not.toContain("RUNNER_RESULT_MALFORMED:trigger");
    expect(r.termination.trigger).toBe("STREAM_READ_FAILED");
    expect(r.streams.stdout).toMatchObject({
      read_failed: true,
      eof: false,
      bytes: received.length,
      read_error: "IOException: The pipe is being closed.",
    });
    expect(r.streams.stderr.read_error).toBeNull();
    // 실제 관측 사실(유효한 응답)은 보존되고, 쓰지 못한 shutdown·exit는 별도 사유로 남는다.
    expect(r.initialize.response).toBe("VALID");
    expect(r.status_reasons).toContain("SHUTDOWN_EXIT_NOT_SENT");
  });
});
