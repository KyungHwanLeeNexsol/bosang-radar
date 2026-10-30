import { describe, expect, it } from "vitest";
import { buildRulesRecord } from "./lsp-rules-record";
import { reinterpretRulesRun, runRulesReinterpretCli } from "./lsp-rules-reinterpret";
import { factsFromRulesRunnerResult } from "./lsp-rules-runner-result";
import { crlf, enc, happyStderrLines } from "./testing/rules-fixtures";
import {
  WORK,
  adminContextJson,
  happyFacts,
  layout,
  runnerResultJson,
} from "./testing/rules-facts";

const verdict = (runner: unknown, context: unknown): string =>
  reinterpretRulesRun(runner, context).record.verdict;
const good = (): { runner: Record<string, unknown>; context: Record<string, unknown> } => {
  const f = happyFacts();
  return { runner: runnerResultJson(f), context: adminContextJson(f) };
};

describe("러너 결과 + 관리자 문맥 → 기록", () => {
  it("정상: 직접 만든 기록과 같은 판정이다 (원문 바이트를 다시 풀어 판정한다)", () => {
    const { runner, context } = good();
    const out = reinterpretRulesRun(runner, context);
    expect(out.schema).toBe("lsp-rules-reinterpretation/1");
    expect(out.record.verdict).toBe("RULES_LOAD_OBSERVED");
    expect(out.admin).toEqual({ externalReasons: [], contextProblems: [] });
    const direct = buildRulesRecord(happyFacts());
    expect(out.record.conditions).toEqual(direct.conditions);
    expect(out.record.streams.stderr.sha256).toBe(direct.streams.stderr.sha256);
    expect(out.record.sent).toEqual(direct.sent);
  });

  it("러너가 스스로 성공이라 적어도 믿지 않는다: 러너 결과의 stderr 원문이 다르면 판정이 따라 바뀐다", () => {
    const { runner, context } = good();
    const f = happyFacts();
    const lines = happyStderrLines(layout.rulesDir).filter((l) => l !== "Scanned open documents");
    const bytes = enc(crlf(lines));
    const tampered = runnerResultJson({
      ...f,
      stderr: { ...f.stderr, bytes, total: bytes.byteLength },
    });
    expect(verdict(tampered, context)).toBe("NOT_CONFIRMED:SIGNAL_ABSENT");
    expect(verdict(runner, context)).toBe("RULES_LOAD_OBSERVED");
  });

  it("스트림 원문 base64와 상태가 사실로 그대로 옮겨진다", () => {
    const f = happyFacts();
    const back = factsFromRulesRunnerResult(runnerResultJson(f), {
      runId: "run-1",
      work: WORK,
      expectedVersion: f.expectedVersion,
    });
    expect(Buffer.from(back.stdout.bytes).equals(Buffer.from(f.stdout.bytes))).toBe(true);
    expect(Buffer.from(back.stderr.bytes).equals(Buffer.from(f.stderr.bytes))).toBe(true);
    expect(back.sends).toEqual(f.sends);
    expect(back.barrier).toEqual(f.barrier);
    expect(back.provenance).toBe("stub");
  });
});

describe("관리자 쪽 사유는 기동 뒤의 실패이므로 NOT_OBSERVED다 (NOT_ATTEMPTED가 아니다)", () => {
  const cases: [string, Record<string, unknown>, string][] = [
    ["신원 확인 실패", { identity: { ok: false } }, "ADMIN_IDENTITY_UNVERIFIED"],
    ["신원 확인 없음", { identity: null }, "ADMIN_IDENTITY_UNVERIFIED"],
    ["결합 실패", { binding: { ok: false } }, "ADMIN_BINDING_FAILED"],
    ["설치물 해시 변경", { hashesUnchanged: false }, "ADMIN_HASH_CHANGED"],
    [
      "자손 경로 위반",
      { descendantPathViolations: ["C:\\x\\evil.exe"] },
      "ADMIN_DESCENDANT_PATH_UNEXPECTED",
    ],
    ["감독이 강제 종료함", { supervisor: { forcedKill: true } }, "ADMIN_SUPERVISOR_FORCED_KILL"],
    ["감독 마감", { supervisor: { deadlineReached: true } }, "ADMIN_SUPERVISOR_DEADLINE"],
    [
      "중단 파일 전달 실패",
      { supervisor: { abortRequested: true, abortDelivered: false } },
      "ADMIN_ABORT_DELIVERY_FAILED",
    ],
    ["러너 결과 없음", { supervisor: { resultMissing: true } }, "ADMIN_RESULT_MISSING"],
    [
      "OS 차단 수집 불확실",
      { osBlock: { usable: false, attributedCount: null } },
      "ADMIN_OS_BLOCK_UNCONFIRMED",
    ],
    [
      "OS 차단 건수를 모름",
      { osBlock: { usable: true, attributedCount: null } },
      "ADMIN_OS_BLOCK_UNCONFIRMED",
    ],
    [
      "OS 차단 귀속",
      { osBlock: { usable: true, attributedCount: 2 } },
      "ADMIN_OS_BLOCK_ATTRIBUTED",
    ],
  ];
  for (const [name, patch, reason] of cases) {
    it(`${name} → NOT_OBSERVED:${reason}`, () => {
      const f = happyFacts();
      const merged = adminContextJson(f);
      for (const [k, v] of Object.entries(patch)) {
        merged[k] =
          v !== null && typeof v === "object" && !Array.isArray(v) && merged[k] !== null
            ? { ...(merged[k] as object), ...(v as object) }
            : v;
      }
      const out = reinterpretRulesRun(runnerResultJson(f), merged);
      expect(out.record.verdict).toBe(`NOT_OBSERVED:${reason}`);
      expect(out.record.status).not.toBe("NOT_ATTEMPTED");
      // 실행 사실은 지워지지 않는다.
      expect(out.record.sent.map((s) => s.label)).toEqual([
        "initialize",
        "initialized",
        "shutdown",
        "exit",
      ]);
    });
  }

  it("토큰이 다르면 이번 실행의 결과가 아니다", () => {
    const { runner, context } = good();
    expect(verdict({ ...runner, runToken: "someone-else" }, context)).toBe(
      "NOT_OBSERVED:ADMIN_TOKEN_MISMATCH"
    );
  });

  it("수신기를 읽지 못했거나 건수가 늘었으면 성립하지 않는다", () => {
    const f = happyFacts();
    const ctx = (receiver: Record<string, unknown>): Record<string, unknown> =>
      adminContextJson(f, { receiver });
    expect(
      verdict(
        runnerResultJson(f),
        ctx({ baselineHits: 0, finalHits: null, samples: 1, failures: 1 })
      )
    ).toBe("NOT_OBSERVED:RECEIVER_UNOBSERVABLE");
    expect(
      verdict(runnerResultJson(f), ctx({ baselineHits: 0, finalHits: 3, samples: 9, failures: 0 }))
    ).toBe("NOT_OBSERVED:RECEIVER_HITS_INCREASED");
  });
});

describe("프로브 해시는 관리자가 잰 값으로 대조한다", () => {
  const wrong = "0".repeat(64);
  it("실행 뒤 해시가 다르거나, 없거나, 형식이 틀리면 성립하지 않는다", () => {
    const f = happyFacts();
    const { runner } = good();
    for (const afterRunSha256 of [wrong, null, "NOT-A-HASH"]) {
      const context = adminContextJson(f, { probe: { ...f.probe, afterRunSha256 } });
      expect(verdict(runner, context), String(afterRunSha256)).toBe(
        "NOT_OBSERVED:PROBE_CHANGED_DURING_RUN"
      );
    }
    expect(
      verdict(runner, adminContextJson(f, { probe: { ...f.probe, afterCopySha256: wrong } }))
    ).toBe("NOT_OBSERVED:PROBE_COPY_HASH_UNEXPECTED");
    expect(
      verdict(runner, adminContextJson(f, { probe: { ...f.probe, sourceSha256: wrong } }))
    ).toBe("NOT_OBSERVED:PROBE_SOURCE_HASH_UNEXPECTED");
  });

  it("프로브 경로는 문맥의 작업 폴더에서 도출하고, 다르면 로딩 경로가 어긋난 것이다", () => {
    const f = happyFacts();
    const out = reinterpretRulesRun(
      runnerResultJson(f),
      adminContextJson(f, { work: "C:/work/another-run" })
    );
    expect(out.record.verdict).toBe("NOT_CONFIRMED:LOADING_PATH_UNEXPECTED");
  });
});

describe("서버를 띄우지 않았을 때만 NOT_ATTEMPTED다", () => {
  it("관리자가 러너를 띄우지 않았다고 알리면(사전 조건 실패) 러너 결과가 없어도 NOT_ATTEMPTED", () => {
    const f = happyFacts();
    const context = adminContextJson(f, {
      runnerLaunched: false,
      refusals: ["PRECONDITION_T08_FAILED"],
      identity: { ok: false },
      hashesUnchanged: false,
    });
    const out = reinterpretRulesRun(null, context);
    expect(out.record.verdict).toBe("NOT_ATTEMPTED:PRECONDITION_T08_FAILED");
    expect(out.record.sent).toEqual([]);
    expect(out.admin.externalReasons).toEqual([]);
  });

  it("사유 없이 띄우지 않았다고만 알리면 ADMIN_RUNNER_NOT_LAUNCHED", () => {
    const f = happyFacts();
    const out = reinterpretRulesRun(null, adminContextJson(f, { runnerLaunched: false }));
    expect(out.record.verdict).toBe("NOT_ATTEMPTED:ADMIN_RUNNER_NOT_LAUNCHED");
  });

  it("러너가 요청을 거절했으면(서버 기동 없음) 그 사유로 NOT_ATTEMPTED", () => {
    const f = happyFacts();
    const refused = {
      schema: 1,
      kind: "lsp-rules-runner-result",
      runToken: "tok-1",
      mode: "stub",
      refused: "LAYOUT_MISMATCH",
      refusals: ["LAYOUT_MISMATCH"],
    };
    expect(verdict(refused, adminContextJson(f))).toBe("NOT_ATTEMPTED:LAYOUT_MISMATCH");
  });

  it("러너를 띄웠는데 결과가 없거나 깨졌으면 NOT_ATTEMPTED가 아니라 NOT_OBSERVED (서버가 떴는지 모른다)", () => {
    const f = happyFacts();
    for (const runner of [null, "garbage", { schema: 2, kind: "x" }, {}]) {
      const out = reinterpretRulesRun(runner, adminContextJson(f));
      expect(out.record.status, JSON.stringify(runner)).toBe("NOT_OBSERVED");
      expect(out.record.verdict).toContain("RUNNER_RESULT_MALFORMED");
    }
  });

  it("관리자 문맥이 없거나 깨졌어도 성공이 되지 않는다", () => {
    const { runner } = good();
    for (const context of [null, "x", {}, { schema: "lsp-rules-admin-context/1" }]) {
      const out = reinterpretRulesRun(runner, context);
      expect(out.record.verdict, JSON.stringify(context)).not.toBe("RULES_LOAD_OBSERVED");
      expect(out.admin.contextProblems.length).toBeGreaterThan(0);
    }
    const f = happyFacts();
    const noLaunch = adminContextJson(f);
    delete noLaunch.runnerLaunched;
    expect(reinterpretRulesRun(runner, noLaunch).admin.contextProblems).toContain("runnerLaunched");
  });
});

describe("러너 결과의 형식 문제는 관측 불성립이다", () => {
  const mutate = (patch: Record<string, unknown>): string => {
    const f = happyFacts();
    return verdict({ ...runnerResultJson(f), ...patch }, adminContextJson(f));
  };

  it("필드가 빠지거나 틀리면 RUNNER_RESULT_MALFORMED", () => {
    expect(mutate({ stdout: null })).toMatch(/^NOT_OBSERVED:RUNNER_RESULT_MALFORMED/);
    expect(mutate({ sends: [{ label: "bogus", tMs: 1, ok: true }] })).toMatch(
      /^NOT_OBSERVED:RUNNER_RESULT_MALFORMED:sends/
    );
    expect(mutate({ trigger: "WHATEVER" })).toMatch(
      /^NOT_OBSERVED:RUNNER_RESULT_MALFORMED:trigger/
    );
    expect(mutate({ barrier: null })).toMatch(/^NOT_OBSERVED:RUNNER_RESULT_MALFORMED:barrier/);
    expect(mutate({ roots: [] })).toMatch(/^NOT_OBSERVED:RUNNER_RESULT_MALFORMED:roots/);
    expect(mutate({ mode: "wild" })).toMatch(/^NOT_OBSERVED:RUNNER_RESULT_MALFORMED:mode/);
  });

  it("관측 구간의 러너 오류는 관측 불성립, 정리 구간의 오류는 정리 문제로만 센다", () => {
    expect(mutate({ error: "boom", errorPhase: "OBSERVATION" })).toBe(
      "NOT_OBSERVED:RUNNER_RESULT_MALFORMED:runner.error"
    );
    const f = happyFacts();
    const out = reinterpretRulesRun(
      { ...runnerResultJson(f), error: "late", errorPhase: "CLEANUP" },
      adminContextJson(f)
    );
    expect(out.record.verdict).toBe("RULES_LOAD_OBSERVED");
    expect(out.record.cleanup.problems).toContain("RUNNER_ERROR_IN_CLEANUP");
    expect(out.record.cleanup.ok).toBe(false);
  });

  it("PowerShell 5.1 JSON의 배열 흔들림(원소 하나는 스칼라, 빈 배열은 null·빈 객체)을 받아 준다", () => {
    const f = happyFacts();
    const base = runnerResultJson(f);
    const shaky = {
      ...base,
      also: null,
      sends: f.sends,
      roots: (base.roots as Record<string, unknown>[]).map((r) => ({
        ...r,
        added: r.added instanceof Array && r.added.length === 0 ? {} : r.added,
        removed: null,
      })),
      artifacts: { label: "semgrep-core", before: "core-v1", after: "core-v1" },
      cleanup: { ...(base.cleanup as object), problems: null },
    };
    expect(verdict(shaky, adminContextJson(f))).toBe("RULES_LOAD_OBSERVED");
  });

  it("스트림 읽기 실패와 출력 상한 초과 표시는 사실로 옮겨진다", () => {
    const f = happyFacts();
    const broken = runnerResultJson({
      ...f,
      stderr: { ...f.stderr, readFailed: true, eof: false, readError: "IOException: pipe" },
    });
    expect(verdict(broken, adminContextJson(f))).toBe("NOT_OBSERVED:STREAM_READ_FAILED");
    const overflow = runnerResultJson({ ...f, stdout: { ...f.stdout, overflow: true } });
    expect(verdict(overflow, adminContextJson(f))).toBe("NOT_OBSERVED:OUTPUT_LIMIT");
  });
});

describe("재해석 CLI의 순수 부분", () => {
  const files = (map: Record<string, string>) => {
    const written: Record<string, string> = {};
    return {
      written,
      io: {
        read: (path: string): string => {
          if (!(path in map)) throw new Error("ENOENT");
          return map[path];
        },
        write: (path: string, text: string): void => {
          written[path] = text;
        },
      },
    };
  };
  const argv = ["--runner-result", "r.json", "--context", "c.json", "--out", "o.json"];

  it("정상: 기록을 쓰고 판정을 메시지에 싣는다 (종료 코드 0)", () => {
    const f = happyFacts();
    const { io, written } = files({
      "r.json": JSON.stringify(runnerResultJson(f)),
      "c.json": JSON.stringify(adminContextJson(f)),
    });
    const out = runRulesReinterpretCli(argv, io);
    expect(out).toEqual({ exitCode: 0, message: "RECORD_WRITTEN verdict=RULES_LOAD_OBSERVED" });
    expect(JSON.parse(written["o.json"]).record.verdict).toBe("RULES_LOAD_OBSERVED");
  });

  it("판정이 실패여도 종료 코드는 0 (기록을 썼다는 뜻)", () => {
    const f = happyFacts();
    const { io } = files({
      "r.json": JSON.stringify(runnerResultJson(f)),
      "c.json": JSON.stringify(adminContextJson(f, { hashesUnchanged: false })),
    });
    expect(runRulesReinterpretCli(argv, io)).toEqual({
      exitCode: 0,
      message: "RECORD_WRITTEN verdict=NOT_OBSERVED:ADMIN_HASH_CHANGED",
    });
  });

  it("인자 오류는 2, 문맥을 읽지 못하면 3, 출력을 쓰지 못해도 3 — 메시지에 경로를 싣지 않는다", () => {
    const f = happyFacts();
    expect(runRulesReinterpretCli(["--out", "o.json"], files({}).io).exitCode).toBe(2);
    expect(runRulesReinterpretCli(argv, files({ "r.json": "{}" }).io)).toEqual({
      exitCode: 3,
      message: "CONTEXT_UNREADABLE",
    });
    const broken = files({
      "r.json": JSON.stringify(runnerResultJson(f)),
      "c.json": JSON.stringify(adminContextJson(f)),
    });
    broken.io.write = () => {
      throw new Error("EACCES c:/secret");
    };
    const out = runRulesReinterpretCli(argv, broken.io);
    expect(out).toEqual({ exitCode: 3, message: "OUTPUT_NOT_WRITTEN" });
  });

  it("러너 결과를 읽지 못하면 기록은 RUNNER_RESULT_MALFORMED로 관측 불성립이다", () => {
    const f = happyFacts();
    const { io, written } = files({ "c.json": JSON.stringify(adminContextJson(f)) });
    const out = runRulesReinterpretCli(argv, io);
    expect(out.exitCode).toBe(0);
    expect(out.message).toContain("NOT_OBSERVED:RUNNER_RESULT_MALFORMED");
    expect(Object.keys(written)).toEqual(["o.json"]);
  });
});
