import { describe, expect, it } from "vitest";
import { encodeFrame } from "./framing";
import {
  ADMIN_CONTEXT_KIND,
  ADMIN_CONTEXT_SCHEMA,
  REINTERPRETATION_SCHEMA,
  parseReinterpretArgs,
  reinterpretRunnerRun,
  runReinterpretCli,
  type ReinterpretIo,
} from "./lsp-min-reinterpret";
import { RUNNER_RESULT_KIND, RUNNER_RESULT_SCHEMA } from "./lsp-min-runner-result";
import type { JsonRpcMessage } from "./types";

// 관리자 진입점이 모은 문맥과 러너 결과를 합쳐 기록을 다시 만드는 순수 모듈의 시험. 입력은 모두 손으로 만든 합성 값이다(실제 Semgrep·실제 Windows 아님).

const TOKEN = "lsp-20261029T120000Z-0a1b2c3d-" + "a".repeat(32);
const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64");
const frame = (m: JsonRpcMessage): Uint8Array => encodeFrame(m);
const GOOD = {
  capabilities: { textDocumentSync: 1 },
  serverInfo: { name: "Semgrep", version: "9.9.9" },
};

function stream(bytes: Uint8Array): Record<string, unknown> {
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
  };
}

function goodResult(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: RUNNER_RESULT_SCHEMA,
    kind: RUNNER_RESULT_KIND,
    runToken: TOKEN,
    mode: "stub",
    refused: null,
    refusals: [],
    error: null,
    child: {
      started: true,
      pid: 4321,
      startUtc: "2026-10-29T00:00:00.0000000Z",
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
        imagesSeen: ["powershell.exe"],
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

function goodContext(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: ADMIN_CONTEXT_SCHEMA,
    kind: ADMIN_CONTEXT_KIND,
    runId: "20261029T120000Z-0a1b2c3d",
    runToken: TOKEN,
    mode: "stub",
    expectedVersion: "9.9.9",
    limits: null,
    receiver: { baselineHits: 0, finalHits: 0, samples: 9, failures: 0 },
    identity: { ok: true, failures: [] },
    binding: { ok: true, failures: [] },
    supervisor: {
      abortRequested: false,
      abortReason: null,
      abortDelivered: null,
      forcedKill: false,
      deadlineReached: false,
      resultMissing: false,
    },
    descendantPathViolations: [],
    hashesUnchanged: true,
    osBlock: { usable: true, attributedCount: 0 },
    ...over,
  };
}

describe("reinterpretRunnerRun — 정상 대조군", () => {
  it("정상 결과와 정상 문맥: OBSERVED이고 관리자 사유가 없다", () => {
    const r = reinterpretRunnerRun(goodResult(), goodContext());
    expect(r.schema).toBe(REINTERPRETATION_SCHEMA);
    expect(r.record.status).toBe("OBSERVED");
    expect(r.record.status_reasons).toEqual([]);
    expect(r.admin).toEqual({ externalReasons: [], contextProblems: [] });
    expect(r.record.streams.stdout.bytes).toBeGreaterThan(0);
  });

  it("수신기 숫자는 문맥에서 와서 기록에 실린다", () => {
    const r = reinterpretRunnerRun(
      goodResult(),
      goodContext({ receiver: { baselineHits: 0, finalHits: 0, samples: 9, failures: 0 } })
    );
    expect(JSON.stringify(r.record)).toContain('"samples":9');
  });
});

describe("reinterpretRunnerRun — 관리자 쪽 사실이 관측을 막는다", () => {
  const cases: { name: string; ctx: Record<string, unknown>; reason: string }[] = [
    {
      name: "신원 교차 확인 실패",
      ctx: { identity: { ok: false, failures: ["CHILD_OWNER_MISMATCH"] } },
      reason: "ADMIN_IDENTITY_UNVERIFIED",
    },
    { name: "신원 정보 자체가 없다", ctx: { identity: null }, reason: "ADMIN_IDENTITY_UNVERIFIED" },
    {
      name: "결과 결합 실패",
      ctx: { binding: { ok: false, failures: ["TOKEN_MISMATCH"] } },
      reason: "ADMIN_BINDING_FAILED",
    },
    {
      name: "감독이 전용 계정 프로세스를 직접 끝냈다",
      ctx: {
        supervisor: {
          abortRequested: true,
          abortReason: "A7:SUPERVISOR_DEADLINE",
          abortDelivered: true,
          forcedKill: true,
          deadlineReached: true,
          resultMissing: false,
        },
      },
      reason: "ADMIN_SUPERVISOR_FORCED_KILL",
    },
    {
      name: "관측 마감에 닿았다",
      ctx: {
        supervisor: {
          abortRequested: true,
          abortReason: "A7:SUPERVISOR_DEADLINE",
          abortDelivered: true,
          forcedKill: false,
          deadlineReached: true,
          resultMissing: false,
        },
      },
      reason: "ADMIN_SUPERVISOR_DEADLINE",
    },
    {
      name: "중단을 요청했는데 파일 전달이 실패했다",
      ctx: {
        supervisor: {
          abortRequested: true,
          abortReason: "A3:RECEIVER_HIT",
          abortDelivered: false,
          forcedKill: false,
          deadlineReached: false,
          resultMissing: false,
        },
      },
      reason: "ADMIN_ABORT_DELIVERY_FAILED",
    },
    {
      name: "중단을 요청했는데 전달 여부를 모른다(null)",
      ctx: {
        supervisor: {
          abortRequested: true,
          abortReason: "A3:RECEIVER_HIT",
          abortDelivered: null,
          forcedKill: false,
          deadlineReached: false,
          resultMissing: false,
        },
      },
      reason: "ADMIN_ABORT_DELIVERY_FAILED",
    },
    {
      name: "관리자가 결과 파일을 못 받았다고 적었다",
      ctx: {
        supervisor: {
          abortRequested: false,
          abortReason: null,
          abortDelivered: null,
          forcedKill: false,
          deadlineReached: false,
          resultMissing: true,
        },
      },
      reason: "ADMIN_RESULT_MISSING",
    },
    {
      name: "허용 폴더 밖 자손",
      ctx: { descendantPathViolations: ["pid=77"] },
      reason: "ADMIN_DESCENDANT_PATH_UNEXPECTED",
    },
    {
      name: "설치물 해시가 바뀌었다",
      ctx: { hashesUnchanged: false },
      reason: "ADMIN_HASH_CHANGED",
    },
    {
      name: "해시 비교 정보가 없다(true 가 아니면 통과가 아니다)",
      ctx: { hashesUnchanged: null },
      reason: "ADMIN_HASH_CHANGED",
    },
    {
      name: "귀속된 5157 이 1건",
      ctx: { osBlock: { usable: true, attributedCount: 1 } },
      reason: "ADMIN_OS_BLOCK_ATTRIBUTED",
    },
    {
      name: "5157 수집을 믿을 수 없다(usable=false)",
      ctx: { osBlock: { usable: false, attributedCount: null } },
      reason: "ADMIN_OS_BLOCK_UNCONFIRMED",
    },
    {
      name: "5157 usable 이어도 건수가 null 이면 확인 못 한 것",
      ctx: { osBlock: { usable: true, attributedCount: null } },
      reason: "ADMIN_OS_BLOCK_UNCONFIRMED",
    },
    {
      name: "5157 요약이 문맥에 없다",
      ctx: { osBlock: null },
      reason: "ADMIN_OS_BLOCK_UNCONFIRMED",
    },
  ];
  for (const c of cases) {
    it(`${c.name} → NOT_OBSERVED(${c.reason}), 러너가 본 사실은 그대로`, () => {
      const r = reinterpretRunnerRun(goodResult(), goodContext(c.ctx));
      expect(r.record.status).toBe("NOT_OBSERVED");
      expect(r.record.status_reasons).toContain(c.reason);
      expect(r.record.initialize.response).toBe("VALID");
      expect(r.record.sent.map((s) => s.label)).toEqual(["initialize", "shutdown", "exit"]);
    });
  }

  it("러너가 되돌려 쓴 토큰이 문맥의 토큰과 다르면 ADMIN_TOKEN_MISMATCH", () => {
    const r = reinterpretRunnerRun(goodResult({ runToken: "lsp-stale" }), goodContext());
    expect(r.record.status).toBe("NOT_OBSERVED");
    expect(r.record.status_reasons).toContain("ADMIN_TOKEN_MISMATCH");
  });

  it("수신기: 최종 값을 읽지 못했으면(null) 0건으로 채우지 않고 RECEIVER_FINAL_UNOBSERVABLE", () => {
    const r = reinterpretRunnerRun(
      goodResult(),
      goodContext({ receiver: { baselineHits: 0, finalHits: null, samples: 3, failures: 2 } })
    );
    expect(r.record.status).toBe("NOT_OBSERVED");
    expect(r.record.status_reasons).toContain("RECEIVER_FINAL_UNOBSERVABLE");
  });

  it("수신기: 건수가 늘었으면 RECEIVER_HITS_INCREASED", () => {
    const r = reinterpretRunnerRun(
      goodResult(),
      goodContext({ receiver: { baselineHits: 0, finalHits: 2, samples: 3, failures: 0 } })
    );
    expect(r.record.status_reasons).toContain("RECEIVER_HITS_INCREASED");
    expect(r.record.status).toBe("NOT_OBSERVED");
  });

  it("여러 사실이 겹치면 사유가 모두 남는다", () => {
    const r = reinterpretRunnerRun(
      goodResult(),
      goodContext({ hashesUnchanged: false, identity: { ok: false, failures: [] } })
    );
    expect(r.admin.externalReasons).toEqual(
      expect.arrayContaining(["ADMIN_HASH_CHANGED", "ADMIN_IDENTITY_UNVERIFIED"])
    );
  });
});

describe("reinterpretRunnerRun — 입력이 깨졌을 때", () => {
  it("문맥이 없으면(null) 던지지 않고 관측 불성립이며 문맥 형식 사유를 남긴다", () => {
    const r = reinterpretRunnerRun(goodResult(), null);
    expect(r.record.status).toBe("NOT_OBSERVED");
    expect(r.admin.contextProblems).toEqual(
      expect.arrayContaining(["schema", "runId", "runToken", "receiver"])
    );
    expect(r.record.status_reasons).toContain("ADMIN_CONTEXT_MALFORMED:schema");
  });

  it("스키마 문자열이 다르면 문맥을 받아들이지 않는다", () => {
    const r = reinterpretRunnerRun(goodResult(), goodContext({ schema: "other/1" }));
    expect(r.record.status).toBe("NOT_OBSERVED");
    expect(r.admin.contextProblems).toContain("schema");
  });

  it("러너 결과가 없으면(null) RUNNER_RESULT_MALFORMED 로 관측 불성립", () => {
    const r = reinterpretRunnerRun(null, goodContext());
    expect(r.record.status).toBe("NOT_OBSERVED");
    expect(r.record.status_reasons).toContain("RUNNER_RESULT_MALFORMED:schema");
    expect(r.record.status_reasons).toContain("ADMIN_TOKEN_MISMATCH");
  });

  it("러너 결과가 객체가 아니면(문자열) 같다", () => {
    const r = reinterpretRunnerRun("{}", goodContext());
    expect(r.record.status).toBe("NOT_OBSERVED");
  });

  it("supervisor 절이 없으면 문맥 형식 문제로 센다", () => {
    const ctx = goodContext();
    delete ctx.supervisor;
    const r = reinterpretRunnerRun(goodResult(), ctx);
    expect(r.admin.contextProblems).toContain("supervisor");
    expect(r.record.status).toBe("NOT_OBSERVED");
  });

  it("PowerShell 5.1 이 빈 배열을 빈 객체로 쓴 경우도 받아 준다", () => {
    const r = reinterpretRunnerRun(goodResult(), goodContext({ descendantPathViolations: {} }));
    expect(r.record.status).toBe("OBSERVED");
  });

  it("한도가 계약 상한을 넘으면 문맥의 한도를 쓰지 않고 기본 상한을 쓴다(기록의 한도가 부풀지 않는다)", () => {
    const big = {
      totalMs: 999999999,
      initMs: 1,
      exitMs: 1,
      stdinCloseGraceMs: 1,
      killConfirmMs: 1,
      maxStdoutBytes: 1,
      maxStderrBytes: 1,
      sampleIntervalMs: 1,
    };
    const r = reinterpretRunnerRun(goodResult(), goodContext({ limits: big }));
    expect(r.record.request.limits.total_ms).toBeLessThanOrEqual(150000);
  });
});

describe("reinterpretRunnerRun — 중단된 실행", () => {
  it("러너가 A3(수신기 적중)로 중단했으면 ABORTED 이고 관리자 사유가 함께 남는다", () => {
    const res = goodResult({
      trigger: "LIVE_ABORT",
      abort: { condition: "A3", detail: "RECEIVER_HIT", tMs: 300 },
      sends: [{ label: "initialize", tMs: 107, ok: true }],
      stdout: stream(new Uint8Array(0)),
      kill: { count: 1, firstTMs: 320, confirmed: true },
    });
    const ctx = goodContext({
      receiver: { baselineHits: 0, finalHits: 1, samples: 9, failures: 0 },
      supervisor: {
        abortRequested: true,
        abortReason: "A3:RECEIVER_HIT",
        abortDelivered: true,
        forcedKill: false,
        deadlineReached: false,
        resultMissing: false,
      },
    });
    const r = reinterpretRunnerRun(res, ctx);
    expect(r.record.status).toBe("ABORTED");
    expect(r.record.status_reasons).toContain("ABORT:A3");
  });
});

describe("CLI 의 순수 부분", () => {
  const memIo = (
    files: Record<string, string>,
    failWrite = false
  ): ReinterpretIo & { written: Record<string, string> } => {
    const written: Record<string, string> = {};
    return {
      written,
      read: (p) => {
        if (!(p in files)) throw new Error("ENOENT");
        return files[p];
      },
      write: (p, t) => {
        if (failWrite) throw new Error("EACCES");
        written[p] = t;
      },
    };
  };
  const argv = ["--runner-result", "r.json", "--context", "c.json", "--out", "o.json"];

  it("인자: 셋이 모두 있고 중복·모르는 이름·값 없음은 거절", () => {
    expect(parseReinterpretArgs(argv)).toEqual({
      runnerResult: "r.json",
      context: "c.json",
      out: "o.json",
    });
    expect(parseReinterpretArgs(["--runner-result", "r"])).toEqual({ error: "USAGE" });
    expect(parseReinterpretArgs([...argv, "--out", "x"])).toEqual({ error: "USAGE" });
    expect(parseReinterpretArgs(["--bogus", "x", ...argv.slice(2)])).toEqual({ error: "USAGE" });
    expect(parseReinterpretArgs(["--runner-result", "--context", "c", "--out", "o"])).toEqual({
      error: "USAGE",
    });
  });

  it("정상: 종료 0, 출력 파일에 기록이 쓰이고 메시지에 경로가 없다", () => {
    const io = memIo({
      "r.json": JSON.stringify(goodResult()),
      "c.json": JSON.stringify(goodContext()),
    });
    const r = runReinterpretCli(argv, io);
    expect(r.exitCode).toBe(0);
    expect(r.message).toBe("RECORD_WRITTEN status=OBSERVED");
    expect(JSON.parse(io.written["o.json"]).record.status).toBe("OBSERVED");
  });

  it("러너 결과를 읽지 못하면 기록을 쓰되 관측 불성립(종료 0)", () => {
    const io = memIo({ "c.json": JSON.stringify(goodContext()) });
    const r = runReinterpretCli(argv, io);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(io.written["o.json"]).record.status).toBe("NOT_OBSERVED");
  });

  it("러너 결과가 깨진 JSON 이어도 같다", () => {
    const io = memIo({ "r.json": "{not json", "c.json": JSON.stringify(goodContext()) });
    expect(runReinterpretCli(argv, io).exitCode).toBe(0);
    expect(JSON.parse(io.written["o.json"]).record.status).toBe("NOT_OBSERVED");
  });

  it("문맥을 읽지 못하면 종료 3 이고 아무것도 쓰지 않는다", () => {
    const io = memIo({ "r.json": JSON.stringify(goodResult()) });
    const r = runReinterpretCli(argv, io);
    expect(r).toEqual({ exitCode: 3, message: "CONTEXT_UNREADABLE" });
    expect(io.written).toEqual({});
  });

  it("출력을 쓰지 못하면 종료 3", () => {
    const io = memIo(
      { "r.json": JSON.stringify(goodResult()), "c.json": JSON.stringify(goodContext()) },
      true
    );
    expect(runReinterpretCli(argv, io)).toEqual({ exitCode: 3, message: "OUTPUT_NOT_WRITTEN" });
  });

  it("인자가 틀리면 종료 2", () => {
    expect(runReinterpretCli(["--out", "x"], memIo({})).exitCode).toBe(2);
  });
});
