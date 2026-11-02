import { describe, expect, it } from "vitest";
import { LSP_MIN_ENV_NAMES } from "./lsp-min";
import { LSP_RULES_PROBE_SHA256 } from "./lsp-rules";
import { LSP_SCAN_LIMITS, LSP_SCAN_TARGET_SHA256 } from "./lsp-scan";
import { buildScanRecord, type ScanFacts } from "./lsp-scan-record";
import {
  SCAN_RUNNER_RESULT_KIND,
  SCAN_RUNNER_RESULT_SCHEMA,
  factsFromScanRunnerResult,
  type ScanRunnerContext,
} from "./lsp-scan-runner-result";
import { scanFacts } from "./testing/scan-facts";
import { SCAN_WORK } from "./testing/scan-fixtures";
import { runnerJsonFromFacts } from "./testing/scan-runner-json";

// 러너 결과 JSON 은 사실에서 만든다 (PowerShell 러너가 쓸 모양의 시험용 생산자: testing/scan-runner-json.ts). 시험이 필드를 하나씩 깨뜨려 본다.
const runnerJsonFrom = (f: ScanFacts): Record<string, unknown> =>
  runnerJsonFromFacts(f, { envNames: LSP_MIN_ENV_NAMES });

const baseFacts = (): ScanFacts => scanFacts();
const ctxFor = (f: ScanFacts, over: Partial<ScanRunnerContext> = {}): ScanRunnerContext => ({
  runId: f.runId,
  work: SCAN_WORK,
  expectedVersion: f.expectedVersion,
  limits: { ...LSP_SCAN_LIMITS },
  receiver: { baselineHits: 0, finalHits: 0, samples: 60, failures: 0 },
  probe: { ...f.probe },
  target: { ...f.target },
  ...over,
});
const parse = (json: unknown, f: ScanFacts = baseFacts(), over: Partial<ScanRunnerContext> = {}) =>
  factsFromScanRunnerResult(json, ctxFor(f, over));
const verdictOf = (facts: ScanFacts): string => buildScanRecord(facts).verdict;
const edit = (mutate: (j: Record<string, unknown>) => void): Record<string, unknown> => {
  const json = structuredClone(runnerJsonFrom(baseFacts())) as Record<string, unknown>;
  mutate(json);
  return json;
};
const asRec = (v: unknown): Record<string, unknown> => v as Record<string, unknown>;

describe("정상 러너 결과 → 사실 → 성공 기록", () => {
  it("정상 JSON 은 형식 문제 없이 풀리고 판정이 성공이다 (원문 바이트에서 다시 만든 기록)", () => {
    const f = baseFacts();
    const facts = parse(runnerJsonFrom(f), f);
    expect(facts.externalReasons).toEqual([]);
    expect(facts.spawn).toEqual({ attempted: true, ok: true, pid: 4242 });
    expect(facts.provenance).toBe("stub");
    expect(verdictOf(facts)).toBe("SCAN_RESPONSE_OBSERVED");
    expect(buildScanRecord(facts).evidence.tracker_comparison).toBe("MATCH");
  });

  it("자식에게 준 PATH 값과 작업 폴더가 사실로 옮겨진다 (이름만이 아니다)", () => {
    const f = baseFacts();
    const facts = parse(runnerJsonFrom(f), f);
    expect(facts.childEnv).toEqual({
      path: f.childEnv.path,
      workingDirectory: f.childEnv.workingDirectory,
    });
    expect(buildScanRecord(facts).child_env.path_value).toBe(f.childEnv.path);
  });

  it("청크 시간표·표시·liveView·settle 이 그대로 옮겨진다", () => {
    const f = baseFacts();
    const facts = parse(runnerJsonFrom(f), f);
    expect(facts.chunks).toEqual(f.chunks);
    expect(facts.markers).toEqual(f.markers);
    expect(facts.liveView).toEqual(f.liveView);
    expect(facts.settle).toEqual(f.settle);
  });

  it("합성 파일·프로브 해시는 관리자 문맥 값이 있으면 그 값이, 없으면 러너가 보고한 값이 쓰인다", () => {
    const f = baseFacts();
    const json = runnerJsonFrom(f);
    const fromRunner = factsFromScanRunnerResult(json, {
      ...ctxFor(f),
      probe: undefined,
      target: undefined,
    });
    expect(fromRunner.target.afterRunSha256).toBe(LSP_SCAN_TARGET_SHA256);
    expect(fromRunner.probe.afterRunSha256).toBe(LSP_RULES_PROBE_SHA256);
    const admin = parse(json, f, { target: { afterRunSha256: "a".repeat(64) } });
    expect(admin.target.afterRunSha256).toBe("a".repeat(64));
    // 관리자가 잴 수 없었다(null)고 알리면 러너 값으로 덮지 않는다
    const unknown = parse(json, f, { target: { afterRunSha256: null } });
    expect(unknown.target.afterRunSha256).toBeNull();
    expect(verdictOf(unknown)).toBe("NOT_OBSERVED:FILE_STATE_NOT_CONFIRMED");
  });

  it("원문 바이트를 별도 파일(.bin)로 두는 경우: 문맥의 rawBytes 가 b64 대신 쓰이고 해시로 대조한다", () => {
    const f = baseFacts();
    const json = edit((j) => {
      delete asRec(j.stdout).b64;
      delete asRec(j.stderr).b64;
    });
    const ok = parse(json, f, { rawBytes: { stdout: f.stdout.bytes, stderr: f.stderr.bytes } });
    expect(ok.externalReasons).toEqual([]);
    expect(verdictOf(ok)).toBe("SCAN_RESPONSE_OBSERVED");
    const tampered = f.stderr.bytes.slice();
    tampered[tampered.length - 1] ^= 1;
    const bad = parse(json, f, { rawBytes: { stdout: f.stdout.bytes, stderr: tampered } });
    expect(bad.externalReasons).toContain("RUNNER_RESULT_MALFORMED:stderr.sha256");
    expect(verdictOf(bad)).toMatch(/^NOT_OBSERVED:/);
    const missing = parse(json, f, {});
    expect(missing.externalReasons).toContain("RUNNER_RESULT_MALFORMED:stdout.b64");
  });
});

describe("형식이 틀리면 채우지 않고 관측 불성립(NOT_OBSERVED)으로 기운다", () => {
  const cases: [string, (j: Record<string, unknown>) => void, string][] = [
    ["schema 번호", (j) => (j.schema = 2), "schema"],
    ["kind", (j) => (j.kind = "lsp-rules-runner-result"), "schema"],
    ["mode", (j) => (j.mode = "other"), "mode"],
    ["child.started 가 불리언이 아님", (j) => (asRec(j.child).started = "yes"), "child.started"],
    ["trigger", (j) => (j.trigger = "WHATEVER"), "trigger"],
    ["exit 없음", (j) => delete j.exit, "exit"],
    ["live 없음", (j) => delete j.live, "live"],
    ["stdout 없음", (j) => delete j.stdout, "stdout"],
    ["stdout 상태가 불리언이 아님", (j) => (asRec(j.stdout).eof = "true"), "stdout.state"],
    ["sends 의 label", (j) => (asRec((j.sends as unknown[])[0]).label = "didSave"), "sends"],
    [
      "didOpen 송신 위치가 없음",
      (j) => {
        const open = (j.sends as Record<string, unknown>[]).find((s) => s.label === "didOpen");
        delete (open as Record<string, unknown>).stderrBytesAtSend;
      },
      "sends.stderrBytesAtSend",
    ],
    [
      "didOpen 송신 내용 요약이 없음",
      (j) => {
        const open = (j.sends as Record<string, unknown>[]).find((s) => s.label === "didOpen");
        delete (open as Record<string, unknown>).didOpen;
      },
      "sends.didOpen",
    ],
    ["markers 없음", (j) => delete j.markers, "markers"],
    [
      "didOpen 표시의 오프셋이 음수",
      (j) => (asRec(asRec(j.markers).didOpenSent).stderrOffset = -1),
      "markers.didOpenSent",
    ],
    [
      "barrierDoneAtMs 키 없음",
      (j) => delete asRec(j.markers).barrierDoneAtMs,
      "markers.barrierDoneAtMs",
    ],
    ["settle 없음", (j) => delete j.settle, "settle"],
    ["chunks 없음", (j) => delete j.chunks, "chunks"],
    ["chunk 항목이 객체가 아님", (j) => ((j.chunks as unknown[])[0] = "x"), "chunks"],
    ["chunk 의 stream 이름", (j) => (asRec((j.chunks as unknown[])[0]).stream = "stdin"), "chunks"],
    ["liveView 없음", (j) => delete j.liveView, "liveView"],
    ["liveView 필드 형식", (j) => (asRec(j.liveView).diagnosticsState = 5), "liveView"],
    ["request 없음", (j) => delete j.request, "request"],
    ["PATH 값 없음", (j) => delete asRec(j.request).envPath, "request.envPath"],
    ["작업 폴더 없음", (j) => delete asRec(j.request).workingDirectory, "request.workingDirectory"],
    [
      "환경 이름 목록이 계약과 다름",
      (j) => (asRec(j.request).envNames = ["PATH", "HOME"]),
      "request.envNames",
    ],
    ["files 없음", (j) => delete j.files, "files"],
    [
      "files 해시 형식",
      (j) => (asRec(asRec(j.files).target).afterWriteSha256 = "xyz"),
      "files.target.afterWriteSha256",
    ],
    [
      "roots 의 한 역할 없음",
      (j) =>
        (j.roots = (j.roots as Record<string, unknown>[]).filter((r) => r.role !== "WORKSPACE")),
      "roots.WORKSPACE",
    ],
  ];
  for (const [name, mutate, field] of cases) {
    it(`${name} → RUNNER_RESULT_MALFORMED:${field}`, () => {
      const facts = parse(edit(mutate));
      const reasons = [...(facts.externalReasons ?? []), ...facts.cleanup.problems];
      expect(reasons.join(","), name).toContain(`RUNNER_RESULT_MALFORMED:${field}`);
      expect(verdictOf(facts), name).not.toBe("SCAN_RESPONSE_OBSERVED");
    });
  }

  it("cleanup 이 없으면 정리 실패로만 남는다 — 관측 판정은 정리 결과와 독립이다 (빠진 값을 정상으로 채우지 않는다)", () => {
    const facts = parse(edit((j) => delete j.cleanup));
    expect(facts.cleanup.problems).toContain("RUNNER_RESULT_MALFORMED:cleanup");
    const record = buildScanRecord(facts);
    expect(record.cleanup.ok).toBe(false);
    expect(record.outcomes.process_cleanup.ok).toBe(false);
    expect(record.outcomes.observation.verdict).toBe(record.verdict);
  });

  it("JSON 이 아예 객체가 아니면(null·문자열·배열) 서버를 띄운 사실도 인정하지 않는다", () => {
    for (const bad of [null, "x", [], 7]) {
      const facts = parse(bad);
      expect(facts.externalReasons).toContain("RUNNER_RESULT_MALFORMED:schema");
      expect(verdictOf(facts)).not.toBe("SCAN_RESPONSE_OBSERVED");
    }
  });

  it("PowerShell 5.1 이 쓰는 모양(원소 하나짜리 배열이 스칼라, 빈 배열이 null)을 받아 준다", () => {
    const f = baseFacts();
    const json = edit((j) => {
      j.also = null;
      asRec(j.live).processes = {
        ...asRec(asRec(j.live).processes),
        imagesSeen: "semgrep.exe",
        disallowed: null,
      };
    });
    const facts = parse(json, f);
    expect(facts.externalReasons).toEqual([]);
    expect(facts.also).toEqual([]);
    expect(facts.live.processes.imagesSeen).toEqual(["semgrep.exe"]);
    expect(facts.live.processes.disallowed).toEqual([]);
  });
});

describe("바이트와 시간표의 일관성 — 불일치는 채우지 않고 문제로 남긴다", () => {
  it("stdout/stderr 해시가 원문과 다르면 sha256 형식 문제", () => {
    const json = edit((j) => (asRec(j.stdout).sha256 = "0".repeat(64)));
    expect(parse(json).externalReasons).toContain("RUNNER_RESULT_MALFORMED:stdout.sha256");
  });

  it("해시가 64자리 16진수가 아니면 형식 문제", () => {
    const json = edit((j) => delete asRec(j.stderr).sha256);
    expect(parse(json).externalReasons).toContain("RUNNER_RESULT_MALFORMED:stderr.sha256");
  });

  it("bytesRead 가 원문 길이와 다르면(넘침 없음) 형식 문제", () => {
    const json = edit((j) => (asRec(j.stderr).bytesRead = 5));
    expect(parse(json).externalReasons).toContain("RUNNER_RESULT_MALFORMED:stderr.bytesRead");
  });

  it("b64 가 올바른 base64 가 아니면 형식 문제", () => {
    const json = edit((j) => (asRec(j.stdout).b64 = "@@@"));
    expect(parse(json).externalReasons).toContain("RUNNER_RESULT_MALFORMED:stdout.b64");
  });

  it("청크 오프셋이 이어지지 않으면 chunks.not_contiguous 로 남고 판정은 시간표 무효로 NOT_OBSERVED", () => {
    const json = edit((j) => {
      const chunks = j.chunks as Record<string, unknown>[];
      const at = chunks.findIndex((c) => c.stream === "stderr" && (c.offset as number) > 0);
      chunks[at].offset = (chunks[at].offset as number) + 1;
    });
    const facts = parse(json);
    expect(facts.externalReasons).toContain("RUNNER_RESULT_MALFORMED:chunks.not_contiguous");
    expect(verdictOf(facts)).toMatch(/^NOT_OBSERVED:/);
  });

  it("스트림 안에서 시각이 줄어들면 chunks.time_decreasing", () => {
    const json = edit((j) => {
      const chunks = j.chunks as Record<string, unknown>[];
      const idx = chunks.map((c, i) => (c.stream === "stderr" ? i : -1)).filter((i) => i >= 0);
      chunks[idx[2]].tMs = (chunks[idx[1]].tMs as number) - 1;
    });
    expect(parse(json).externalReasons).toContain("RUNNER_RESULT_MALFORMED:chunks.time_decreasing");
  });

  it("청크 길이의 합이 원문 길이와 다르면 chunks.total_mismatch", () => {
    const json = edit((j) => {
      const chunks = j.chunks as Record<string, unknown>[];
      const last = chunks.filter((c) => c.stream === "stdout").pop() as Record<string, unknown>;
      last.length = (last.length as number) + 3;
    });
    expect(parse(json).externalReasons).toContain("RUNNER_RESULT_MALFORMED:chunks.total_mismatch");
  });
});

describe("실시간 추적기 보기가 재해석과 다르면 성공이 아니다 (TRACKER_DISAGREEMENT)", () => {
  it("러너가 낸 liveView 를 바꾸면 기록이 TRACKER_DISAGREEMENT 로 내려앉는다", () => {
    const f = baseFacts();
    const json = edit((j) => (asRec(j.liveView).bothCompleteAtMs = 123));
    const facts = parse(json, f);
    const record = buildScanRecord(facts);
    expect(record.evidence.tracker_comparison).toBe("DISAGREE");
    expect(record.verdict).toBe("NOT_OBSERVED:TRACKER_DISAGREEMENT");
  });
});

describe("거절·미기동·오류", () => {
  it("러너가 요청을 거절했다 → 사유만 싣고 spawn.attempted 는 false (NOT_ATTEMPTED)", () => {
    const facts = parse({
      schema: SCAN_RUNNER_RESULT_SCHEMA,
      kind: SCAN_RUNNER_RESULT_KIND,
      runToken: "token-1",
      mode: "stub",
      refused: "PATH_ESCAPES_WORK",
      refusals: ["PATH_ESCAPES_WORK"],
    });
    expect(facts.refusals).toEqual(["PATH_ESCAPES_WORK"]);
    expect(facts.spawn.attempted).toBe(false);
    expect(verdictOf(facts)).toBe("NOT_ATTEMPTED:PATH_ESCAPES_WORK");
  });

  it("정리 구간의 러너 오류는 정리 실패로만 남고, 그 밖의 러너 오류는 관측 불성립이다", () => {
    const cleanup = parse(edit((j) => ((j.error = "boom"), (j.errorPhase = "CLEANUP"))));
    expect(cleanup.cleanup.problems).toContain("RUNNER_ERROR_IN_CLEANUP");
    expect(cleanup.externalReasons).toEqual([]);
    const other = parse(edit((j) => (j.error = "boom")));
    expect(other.externalReasons).toContain("RUNNER_RESULT_MALFORMED:runner.error");
  });

  it("문맥이 알려 준 예상 PATH 값과 다르면 사유로 남긴다", () => {
    const f = baseFacts();
    const facts = parse(runnerJsonFrom(f), f, { expectedPath: "C:/Windows;C:/Git/bin" });
    expect(facts.externalReasons).toContain("RUNNER_PATH_UNEXPECTED");
    const same = parse(runnerJsonFrom(f), f, { expectedPath: f.childEnv.path });
    expect(same.externalReasons).toEqual([]);
  });

  it("시스템 복구 결과는 문맥에서 들어오고 관측 판정과 따로다", () => {
    const f = baseFacts();
    const facts = parse(runnerJsonFrom(f), f, { recovery: { status: "EQUAL", detail: [] } });
    const record = buildScanRecord(facts);
    expect(record.outcomes.system_recovery).toEqual({ status: "EQUAL", detail: [] });
    const failed = parse(runnerJsonFrom(f), f, {
      recovery: { status: "DIFFERENT", detail: ["X"] },
    });
    expect(buildScanRecord(failed).verdict).toBe("SCAN_RESPONSE_OBSERVED");
  });

  it("문맥이 없는 한도·수신기·작업 폴더는 기본값으로 덮지 않는다 (수신기는 읽을 수 없음으로 남는다)", () => {
    const f = baseFacts();
    const facts = factsFromScanRunnerResult(runnerJsonFrom(f), { runId: "run-1", work: null });
    expect(facts.probePath).toBeNull();
    expect(facts.workspace).toBeNull();
    expect(facts.live.receiver.baselineHits).toBeNull();
    expect(verdictOf(facts)).not.toBe("SCAN_RESPONSE_OBSERVED");
  });
});
