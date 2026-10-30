import { describe, expect, it } from "vitest";
import { analyzeRulesStdout } from "./lsp-rules";
import { buildRulesRecord, judgeRulesLoad, type RulesFacts } from "./lsp-rules-record";
import { reinterpretRulesRun } from "./lsp-rules-reinterpret";
import { factsFromRulesRunnerResult } from "./lsp-rules-runner-result";
import { analyzeRulesLog } from "./rules-log";
import {
  crlf,
  enc,
  frames,
  happyStderrLines,
  progressCreate,
  progressNotification,
  RULES_REFRESHED,
} from "./testing/rules-fixtures";
import {
  WORK,
  adminContextJson,
  happyFacts,
  happyStdoutMessages,
  initResponse,
  layout,
  runnerResultJson,
} from "./testing/rules-facts";
import type { JsonRpcMessage } from "./types";

// 독립 감사에서 확인된 결함의 재현 시험(실패 먼저). 핵심 원칙: 알 수 없음·없음·깨짐·모호함을 "문제 없음"으로 읽지 않는다.
// 각 시험은 고치기 전에 일부러 실패시켜 재현을 확인한 것이다.

const verdictOf = (f: RulesFacts): string => judgeRulesLoad(f).verdict;
const reasonsOf = (f: RulesFacts): string[] => judgeRulesLoad(f).reasons;
const reinterpret = (runner: unknown, context: unknown) => reinterpretRulesRun(runner, context);

function stderrFacts(l: string[], over: Partial<RulesFacts> = {}): RulesFacts {
  const bytes = enc(crlf(l));
  return happyFacts({
    stderr: { bytes, total: bytes.byteLength, overflow: false, eof: true, readFailed: false },
    ...over,
  });
}

function stdoutFacts(messages: JsonRpcMessage[], over: Partial<RulesFacts> = {}): RulesFacts {
  const bytes = frames(messages);
  return happyFacts({
    stdout: { bytes, total: bytes.byteLength, overflow: false, eof: true, readFailed: false },
    ...over,
  });
}

const withInitializedSend = (f: RulesFacts, patch: Record<string, unknown>): RulesFacts => ({
  ...f,
  sends: f.sends.map((s) => (s.label === "initialized" ? { ...s, ...patch } : s)),
});

// ── F1: initialized 송신 위치를 모르면 성립하지 않는다 ─────────────────────

describe("F1 initialized 송신 위치를 모르면 이전 신호 검사가 무효가 된다 → 성립하지 않는다", () => {
  const unknowns: [string, Record<string, unknown>][] = [
    ["stderr 바이트 수 null", { stderrBytesAtSend: null }],
    ["stdout 바이트 수 null", { stdoutBytesAtSend: null }],
    ["둘 다 null", { stderrBytesAtSend: null, stdoutBytesAtSend: null }],
    ["NaN", { stderrBytesAtSend: Number.NaN }],
    ["Infinity", { stdoutBytesAtSend: Number.POSITIVE_INFINITY }],
    ["음수", { stderrBytesAtSend: -1 }],
  ];
  for (const [name, patch] of unknowns) {
    it(`${name} → NOT_OBSERVED:INITIALIZED_OFFSET_UNKNOWN`, () => {
      const f = withInitializedSend(happyFacts(), patch);
      expect(verdictOf(f)).toBe("NOT_OBSERVED:INITIALIZED_OFFSET_UNKNOWN");
    });
  }

  it("새로고침 로그가 통째로 initialized 위치 앞인데 위치가 null이면 성공이 아니다", () => {
    // 위치를 null로 두면 옛 코드는 0으로 읽어 "이전 신호 없음"으로 통과시켰다.
    const f = withInitializedSend(happyFacts(), { stderrBytesAtSend: null });
    expect(verdictOf(f)).not.toBe("RULES_LOAD_OBSERVED");
  });

  it("러너 결과에서 initialized 송신 기록에 바이트 수가 빠지면 RUNNER_RESULT_MALFORMED:sends.<필드>다", () => {
    const f = happyFacts();
    const runner = runnerResultJson(f);
    const sends = (runner.sends as Record<string, unknown>[]).map((s) =>
      s.label === "initialized" ? { ...s, stderrBytesAtSend: null } : s
    );
    expect(reinterpret({ ...runner, sends }, adminContextJson(f)).record.verdict).toBe(
      "NOT_OBSERVED:RUNNER_RESULT_MALFORMED:sends.stderrBytesAtSend"
    );
    const missing = (runner.sends as Record<string, unknown>[]).map((s) => {
      if (s.label !== "initialized") return s;
      const copy = { ...s };
      delete copy.stdoutBytesAtSend;
      return copy;
    });
    expect(reinterpret({ ...runner, sends: missing }, adminContextJson(f)).record.verdict).toBe(
      "NOT_OBSERVED:RUNNER_RESULT_MALFORMED:sends.stdoutBytesAtSend"
    );
  });

  it("정상 사실은 그대로 성공이다 (위치를 알면 영향 없음)", () => {
    expect(verdictOf(happyFacts())).toBe("RULES_LOAD_OBSERVED");
  });
});

// ── F2: initialized 이전의 stdout에는 초기화 응답 하나뿐이어야 한다 ───────────

describe("F2 initialized 이전 stdout에 초기화 응답 말고 다른 프레임이 있으면 NOT_OBSERVED", () => {
  const rest = (): JsonRpcMessage[] => [
    progressNotification("refresh-token", "begin"),
    RULES_REFRESHED,
    progressNotification("refresh-token", "end"),
    progressCreate(2, "scan-token"),
    progressNotification("scan-token", "begin"),
    progressNotification("scan-token", "end"),
  ];
  it("rulesRefreshed 알림이 응답보다 앞에 있었다 (알림은 전체에서 1회뿐이다)", () => {
    const messages = [
      RULES_REFRESHED,
      initResponse(),
      ...rest().filter((m) => m !== RULES_REFRESHED),
    ];
    const cut = frames([RULES_REFRESHED, initResponse()]).byteLength;
    const f = withInitializedSend(stdoutFacts(messages), { stdoutBytesAtSend: cut });
    expect(verdictOf(f)).toBe("NOT_OBSERVED:PRE_INITIALIZED_STDOUT_MESSAGE");
  });

  it("올바른 모양의 진행 요청(create)이 응답보다 앞에 있었다", () => {
    const messages = [
      progressCreate(1, "early"),
      initResponse(),
      progressNotification("refresh-token", "begin"),
      RULES_REFRESHED,
      progressNotification("refresh-token", "end"),
      progressCreate(2, "scan-token"),
      progressNotification("scan-token", "begin"),
      progressNotification("scan-token", "end"),
    ];
    const cut = frames([progressCreate(1, "early"), initResponse()]).byteLength;
    const f = withInitializedSend(stdoutFacts(messages), { stdoutBytesAtSend: cut });
    expect(verdictOf(f)).toBe("NOT_OBSERVED:PRE_INITIALIZED_STDOUT_MESSAGE");
  });

  it("아무 알림이나 응답보다 앞에 있었다", () => {
    const messages = [
      { jsonrpc: "2.0", method: "custom/telemetry", params: {} } as JsonRpcMessage,
      initResponse(),
      ...rest(),
    ];
    const cut = frames(messages.slice(0, 2)).byteLength;
    const f = withInitializedSend(stdoutFacts(messages), { stdoutBytesAtSend: cut });
    expect(verdictOf(f)).toBe("NOT_OBSERVED:PRE_INITIALIZED_STDOUT_MESSAGE");
  });

  it("응답 뒤에 덜 온 프레임 조각이 이미 와 있었다", () => {
    const messages = [initResponse(), ...rest()];
    const cut = frames([initResponse()]).byteLength + 12; // 다음 프레임의 머리 12바이트
    const f = withInitializedSend(stdoutFacts(messages), { stdoutBytesAtSend: cut });
    expect(verdictOf(f)).toBe("NOT_OBSERVED:PRE_INITIALIZED_STDOUT_MESSAGE");
  });

  it("응답 하나만 있었다면 정상이다 (경계가 정확히 응답 끝)", () => {
    const messages = [initResponse(), ...rest()];
    const cut = frames([initResponse()]).byteLength;
    const f = withInitializedSend(stdoutFacts(messages), { stdoutBytesAtSend: cut });
    expect(verdictOf(f)).toBe("RULES_LOAD_OBSERVED");
  });

  it("러너 결과 경로에서도 같다 (원문 stdout을 다시 풀어 판정한다)", () => {
    const messages = [
      progressCreate(1, "early"),
      initResponse(),
      progressNotification("refresh-token", "begin"),
      RULES_REFRESHED,
      progressNotification("refresh-token", "end"),
      progressCreate(2, "scan-token"),
      progressNotification("scan-token", "begin"),
      progressNotification("scan-token", "end"),
    ];
    const cut = frames([progressCreate(1, "early"), initResponse()]).byteLength;
    const f = withInitializedSend(stdoutFacts(messages), { stdoutBytesAtSend: cut });
    expect(reinterpret(runnerResultJson(f), adminContextJson(f)).record.verdict).toBe(
      "NOT_OBSERVED:PRE_INITIALIZED_STDOUT_MESSAGE"
    );
  });
});

// ── F3: 끝까지 닫히지 않은 괄호 블록 ──────────────────────────────────────

describe("F3 끝에서 열려 있는 블록은 뒤의 맨줄을 삼킨다 → 성공이 될 수 없다", () => {
  const lines = (): string[] => happyStderrLines(layout.rulesDir);

  it("로그 해석이 끝에서 열린 블록을 알린다 (counters·signals에는 넣지 않는다)", () => {
    const a = analyzeRulesLog(enc(crlf([...lines(), "[00.84][INFO]: note {", "tail"])));
    expect(a.openBlockAtEnd).toBe(true);
    expect(a.counters).not.toHaveProperty("openBlockAtEnd");
    const closed = analyzeRulesLog(enc(crlf([...lines(), "[00.84][INFO]: note {", "}"])));
    expect(closed.openBlockAtEnd).toBe(false);
    expect(analyzeRulesLog(enc(crlf(lines()))).openBlockAtEnd).toBe(false);
  });

  it("삼켜진 엔진 줄(Running Semgrep…, Found N matches)이 있으면 NOT_OBSERVED", () => {
    const f = stderrFacts([
      ...lines(),
      "[00.84][INFO]: note {",
      "Running Semgrep with 3 rules",
      "Found 2 matches",
    ]);
    const j = judgeRulesLoad(f);
    expect(j.status).toBe("NOT_OBSERVED");
    expect(j.reasons).toContain("FORBIDDEN_RUNNING_RULES_IN_BLOCK");
    expect(j.reasons).toContain("FORBIDDEN_FOUND_MATCHES_IN_BLOCK");
  });

  it("삼켜진 네트워크 줄도 마찬가지다", () => {
    const f = stderrFacts([
      ...lines(),
      "[00.84][INFO]: note {",
      "No rules source specified, using auto",
    ]);
    expect(judgeRulesLoad(f).reasons).toContain("FORBIDDEN_USING_AUTO_IN_BLOCK");
    expect(judgeRulesLoad(f).status).toBe("NOT_OBSERVED");
  });

  it("삼켜진 금지 문구가 없어도 끝에서 열려 있으면 NOT_CONFIRMED:LOG_SHAPE_UNRECOGNIZED", () => {
    const f = stderrFacts([...lines(), "[00.84][INFO]: note {", "something"]);
    const j = judgeRulesLoad(f);
    expect(j.verdict).toBe("NOT_CONFIRMED:LOG_SHAPE_UNRECOGNIZED");
    expect(j.reasons).toContain("UNTERMINATED_BLOCK");
    expect(j.conditions[9].detail).toContain("UNTERMINATED_BLOCK");
  });

  it("닫힌 덤프 안의 같은 문구는 이전처럼 신호가 아니다 (닫힌 블록은 건드리지 않는다)", () => {
    const f = stderrFacts([
      ...lines(),
      "[00.84][DEBUG](default): Initialized server with session:",
      "{ Legacy_session.capabilities =",
      "Scanning workspace",
      "Running Semgrep with 1 rules",
      "  is_intellij = false }",
    ]);
    expect(verdictOf(f)).toBe("RULES_LOAD_OBSERVED");
  });
});

// ── F4: stdout 분석의 빈틈 ────────────────────────────────────────────────

describe("F4 stdout 분석: __proto__ 메서드와 짝 없는 응답·id 없는 메시지", () => {
  const rest = (): JsonRpcMessage[] => happyStdoutMessages().slice(1);
  const withExtra = (extra: JsonRpcMessage): RulesFacts =>
    stdoutFacts([initResponse(), ...rest(), extra], {
      sends: happyFacts().sends.map((s) =>
        s.label === "initialized"
          ? { ...s, stdoutBytesAtSend: frames([initResponse()]).byteLength }
          : s
      ),
    });

  it("메서드 이름이 __proto__인 알림이 사라지지 않고 허용 밖 알림으로 센다", () => {
    const a = analyzeRulesStdout(
      frames([
        initResponse(),
        { jsonrpc: "2.0", method: "__proto__", params: {} } as JsonRpcMessage,
      ]),
      true
    );
    expect(Object.keys(a.otherNotifications)).toEqual(["__proto__"]);
    const f = withExtra({ jsonrpc: "2.0", method: "__proto__", params: {} } as JsonRpcMessage);
    expect(verdictOf(f)).toBe("NOT_CONFIRMED:UNEXPECTED_NOTIFICATION");
    expect(buildRulesRecord(f).server_messages.unexpected_notifications).toEqual(
      JSON.parse('{"__proto__":1}')
    );
    expect(JSON.stringify(buildRulesRecord(f).server_messages.unexpected_notifications)).toBe(
      '{"__proto__":1}'
    );
  });

  const unexpected: [string, JsonRpcMessage][] = [
    ["모르는 id의 오류 응답", { jsonrpc: "2.0", id: "someone", error: { code: -1, message: "x" } }],
    ["id만 있는 결과 응답", { jsonrpc: "2.0", id: 77, result: null }],
    ["method도 id도 없는 메시지", { jsonrpc: "2.0" } as JsonRpcMessage],
    [
      "id가 null인 오류 응답",
      { jsonrpc: "2.0", id: null, error: { code: -1, message: "x" } } as unknown as JsonRpcMessage,
    ],
  ];
  for (const [name, message] of unexpected) {
    it(`${name} → NOT_CONFIRMED:UNEXPECTED_STDOUT_MESSAGE`, () => {
      expect(verdictOf(withExtra(message))).toBe("NOT_CONFIRMED:UNEXPECTED_STDOUT_MESSAGE");
    });
  }

  it("우리 shutdown id에 맞는 응답은 기록만 하고 성공을 막지 않는다", () => {
    const f = withExtra({ jsonrpc: "2.0", id: "lsp-rules-shutdown-1", result: null });
    expect(verdictOf(f)).toBe("RULES_LOAD_OBSERVED");
    expect(buildRulesRecord(f).server_messages.shutdown_response_seen).toBe(true);
  });
});

// ── F5: 한도 ──────────────────────────────────────────────────────────────

describe("F5 관리자 문맥의 한도가 없거나 틀리면 기본값으로 덮지 않고 성립하지 않는다", () => {
  const verdictFor = (patchLimits: (l: Record<string, unknown>) => unknown): string => {
    const f = happyFacts();
    const context = adminContextJson(f);
    const limits = { ...(context.limits as Record<string, unknown>) };
    context.limits = patchLimits(limits);
    return reinterpret(runnerResultJson(f), context).record.verdict;
  };

  it("limits가 통째로 없으면 ADMIN_CONTEXT_MALFORMED:limits", () => {
    const f = happyFacts();
    const context = adminContextJson(f);
    delete context.limits;
    const out = reinterpret(runnerResultJson(f), context);
    expect(out.record.verdict).toBe("NOT_OBSERVED:ADMIN_CONTEXT_MALFORMED:limits");
    expect(out.admin.contextProblems).toContain("limits");
  });

  it("한 항목이 빠지거나, 상한을 넘거나, 숫자가 아니거나, 0 이하면 같다", () => {
    const want = "NOT_OBSERVED:ADMIN_CONTEXT_MALFORMED:limits";
    expect(verdictFor((l) => (delete l.rulesMs, l))).toBe(want);
    expect(verdictFor((l) => ({ ...l, rulesMs: 120_000 }))).toBe(want);
    expect(verdictFor((l) => ({ ...l, settleMs: "2000" }))).toBe(want);
    expect(verdictFor((l) => ({ ...l, exitMs: 0 }))).toBe(want);
    expect(verdictFor((l) => ({ ...l, totalMs: -5 }))).toBe(want);
    expect(verdictFor(() => "limits")).toBe(want);
    expect(verdictFor(() => null)).toBe(want);
  });

  it("정상 한도는 영향이 없다", () => {
    expect(verdictFor((l) => l)).toBe("RULES_LOAD_OBSERVED");
  });
});

// ── F6: 빠지거나 형식이 틀린 필드를 "문제 없음"으로 읽지 않는다 ─────────────

describe("F6a 감독 필드는 불리언이어야 한다", () => {
  const supervisorVerdict = (patch: Record<string, unknown>, remove: string[] = []): string => {
    const f = happyFacts();
    const context = adminContextJson(f);
    const supervisor = { ...(context.supervisor as Record<string, unknown>), ...patch };
    for (const key of remove) delete supervisor[key];
    context.supervisor = supervisor;
    return reinterpret(runnerResultJson(f), context).record.verdict;
  };
  for (const field of ["forcedKill", "deadlineReached", "abortRequested", "resultMissing"]) {
    it(`${field}가 빠지면 ADMIN_CONTEXT_MALFORMED:supervisor.${field}`, () => {
      expect(supervisorVerdict({}, [field])).toBe(
        `NOT_OBSERVED:ADMIN_CONTEXT_MALFORMED:supervisor.${field}`
      );
    });
    it(`${field}가 불리언이 아니면 (문자열 "false") 같다`, () => {
      expect(supervisorVerdict({ [field]: "false" })).toBe(
        `NOT_OBSERVED:ADMIN_CONTEXT_MALFORMED:supervisor.${field}`
      );
    });
  }
  it("abortRequested가 true인데 abortDelivered가 불리언이 아니면 성립하지 않는다", () => {
    expect(supervisorVerdict({ abortRequested: true, abortDelivered: null })).toMatch(
      /^NOT_OBSERVED:ADMIN_(ABORT_DELIVERY_FAILED|CONTEXT_MALFORMED:supervisor\.abortDelivered)/
    );
    expect(supervisorVerdict({ abortRequested: true, abortDelivered: "yes" })).toMatch(
      /^NOT_OBSERVED:/
    );
    expect(
      reinterpret(
        runnerResultJson(happyFacts()),
        adminContextJson(happyFacts(), {
          supervisor: {
            abortRequested: true,
            abortReason: "A7:X",
            abortDelivered: "yes",
            forcedKill: false,
            deadlineReached: false,
            resultMissing: false,
          },
        })
      ).admin.contextProblems
    ).toContain("supervisor.abortDelivered");
  });
  it("전부 불리언이면 영향 없다", () => {
    expect(supervisorVerdict({})).toBe("RULES_LOAD_OBSERVED");
  });
});

describe("F6b exit.signal 형식", () => {
  it("문자열도 null도 아니면 RUNNER_RESULT_MALFORMED:exit.signal", () => {
    const f = happyFacts();
    for (const signal of [5, true, {}, ["SIGKILL"]]) {
      const runner = { ...runnerResultJson(f), exit: { ...f.exit, signal } };
      expect(reinterpret(runner, adminContextJson(f)).record.verdict, JSON.stringify(signal)).toBe(
        "NOT_OBSERVED:RUNNER_RESULT_MALFORMED:exit.signal"
      );
    }
  });
  it("null과 문자열은 형식 문제가 아니다 (문자열이면 신호 종료 사유가 따로 붙는다)", () => {
    const f = happyFacts();
    const nullSignal = { ...runnerResultJson(f), exit: { ...f.exit, signal: null } };
    expect(reinterpret(nullSignal, adminContextJson(f)).record.verdict).toBe("RULES_LOAD_OBSERVED");
    const back = factsFromRulesRunnerResult(
      { ...runnerResultJson(f), exit: { ...f.exit, signal: "SIGKILL" } },
      { runId: "run-1", work: WORK, expectedVersion: f.expectedVersion }
    );
    expect(back.exit.signal).toBe("SIGKILL");
    expect(back.externalReasons).toEqual([]);
  });
});

describe("F6c 스스로 끝난 경로에서 스트림이 닫히지 않았으면 로그가 덜 온 것일 수 있다", () => {
  it("stdout EOF가 아니면 NOT_OBSERVED:STREAM_NOT_CLOSED:stdout", () => {
    const f = happyFacts();
    expect(verdictOf({ ...f, stdout: { ...f.stdout, eof: false } })).toBe(
      "NOT_OBSERVED:STREAM_NOT_CLOSED:stdout"
    );
  });
  it("stderr EOF가 아니면 NOT_OBSERVED:STREAM_NOT_CLOSED:stderr", () => {
    const f = happyFacts();
    expect(verdictOf({ ...f, stderr: { ...f.stderr, eof: false } })).toBe(
      "NOT_OBSERVED:STREAM_NOT_CLOSED:stderr"
    );
  });
  it("읽기 실패·출력 상한이 우선한다 (이전과 같은 사유가 앞선다)", () => {
    const f = happyFacts();
    expect(verdictOf({ ...f, stderr: { ...f.stderr, eof: false, readFailed: true } })).toBe(
      "NOT_OBSERVED:STREAM_READ_FAILED"
    );
    expect(verdictOf({ ...f, stdout: { ...f.stdout, eof: false, overflow: true } })).toBe(
      "NOT_OBSERVED:OUTPUT_LIMIT"
    );
    expect(reasonsOf({ ...f, stdout: { ...f.stdout, eof: false, overflow: true } })).not.toContain(
      "STREAM_NOT_CLOSED:stdout"
    );
  });
  it("강제 종료했거나 시간 초과인 경로는 이 사유를 따로 붙이지 않는다", () => {
    const f = happyFacts();
    const killed: RulesFacts = {
      ...f,
      stdout: { ...f.stdout, eof: false },
      kill: { count: 1, firstTMs: 2600, confirmed: true },
      trigger: "EXIT_TIMEOUT",
    };
    expect(reasonsOf(killed)).not.toContain("STREAM_NOT_CLOSED:stdout");
  });
});

describe("F6d 장벽 뒤 감시를 마쳤다는 증거가 있어야 성공이다", () => {
  const withBarrier = (barrier: RulesFacts["barrier"], shutdownTMs?: number): RulesFacts => {
    const f = happyFacts({ barrier });
    return shutdownTMs === undefined
      ? f
      : {
          ...f,
          sends: f.sends.map((s) => (s.label === "shutdown" ? { ...s, tMs: shutdownTMs } : s)),
        };
  };
  const want = "NOT_OBSERVED:SETTLE_WATCH_NOT_CONFIRMED";
  it("장벽 도달·감시 종료 시각이 없으면 성립하지 않는다", () => {
    expect(verdictOf(withBarrier({ reachedAtMs: null, settledAtMs: 2400 }))).toBe(want);
    expect(verdictOf(withBarrier({ reachedAtMs: 400, settledAtMs: null }))).toBe(want);
    expect(verdictOf(withBarrier({ reachedAtMs: Number.NaN, settledAtMs: 2400 }))).toBe(want);
  });
  it("감시 구간이 settleMs보다 짧으면 성립하지 않는다", () => {
    expect(verdictOf(withBarrier({ reachedAtMs: 400, settledAtMs: 2399 }))).toBe(want);
    expect(verdictOf(withBarrier({ reachedAtMs: 400, settledAtMs: 400 }))).toBe(want);
  });
  it("shutdown이 감시 종료보다 먼저 나갔으면 성립하지 않는다", () => {
    expect(verdictOf(withBarrier({ reachedAtMs: 400, settledAtMs: 2400 }, 2399))).toBe(want);
  });
  it("정확히 settleMs만큼 감시했고 shutdown이 그 뒤면 성공이다 (경계 포함)", () => {
    expect(verdictOf(withBarrier({ reachedAtMs: 400, settledAtMs: 2400 }, 2400))).toBe(
      "RULES_LOAD_OBSERVED"
    );
  });
  it("러너 결과 경로에서도 같다", () => {
    const f = happyFacts({ barrier: { reachedAtMs: 400, settledAtMs: 1000 } });
    expect(reinterpret(runnerResultJson(f), adminContextJson(f)).record.verdict).toBe(want);
  });
});

// ── 변이 점검에서 살아남은 방어: 읽지 못한 해시끼리·빠진 값은 "같다/변하지 않았다"가 아니다 ───────

describe("G1 설치물 해시를 전후 모두 읽지 못했거나 비었으면 변하지 않았다고 말하지 않는다", () => {
  const want = "NOT_OBSERVED:ARTIFACT_HASH_UNCHANGED_NOT_CONFIRMED";
  const cases: [string, string | null, string | null][] = [
    ["전후 모두 null", null, null],
    ["전후 모두 빈 문자열", "", ""],
    ["전만 null", null, "a"],
    ["후만 빈 문자열", "a", ""],
  ];
  for (const [name, before, after] of cases) {
    it(`${name} → ${want}`, () => {
      const f = happyFacts({ artifacts: [{ label: "semgrep-core", before, after }] });
      expect(verdictOf(f)).toBe(want);
    });
  }

  it("전후가 같은 유효 해시면 영향이 없다", () => {
    const f = happyFacts({
      artifacts: [{ label: "semgrep-core", before: "a".repeat(64), after: "a".repeat(64) }],
    });
    expect(verdictOf(f)).toBe("RULES_LOAD_OBSERVED");
  });
});

describe("G2 관리자 문맥의 hashesUnchanged는 true일 때만 변하지 않은 것이다", () => {
  const run = (patch: (c: Record<string, unknown>) => void) => {
    const f = happyFacts();
    const context = adminContextJson(f);
    patch(context);
    return reinterpret(runnerResultJson(f), context);
  };

  const bad: [string, (c: Record<string, unknown>) => void][] = [
    ["없음", (c) => void delete c.hashesUnchanged],
    ["null", (c) => void (c.hashesUnchanged = null)],
    ["문자열 'true'", (c) => void (c.hashesUnchanged = "true")],
    ["숫자 1", (c) => void (c.hashesUnchanged = 1)],
    ["false", (c) => void (c.hashesUnchanged = false)],
  ];
  for (const [name, patch] of bad) {
    it(`${name} → ADMIN_HASH_CHANGED, 성공이 아니다`, () => {
      const out = run(patch);
      expect(out.admin.externalReasons).toContain("ADMIN_HASH_CHANGED");
      expect(out.record.verdict).not.toBe("RULES_LOAD_OBSERVED");
    });
  }

  it("true면 영향이 없다", () => {
    const out = run((c) => void (c.hashesUnchanged = true));
    expect(out.admin.externalReasons).not.toContain("ADMIN_HASH_CHANGED");
    expect(out.record.verdict).toBe("RULES_LOAD_OBSERVED");
  });
});
