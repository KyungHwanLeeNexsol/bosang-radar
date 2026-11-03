import { describe, expect, it } from "vitest";
import { LSP_SCAN_LIMITS } from "./lsp-scan";
import {
  buildScanRecord,
  deriveScanEvidence,
  judgeScanResponse,
  type ScanFacts,
} from "./lsp-scan-record";
import { sha256Hex } from "./sha";
import {
  barrierStdoutMessages,
  frames,
  goodNotification,
  scanStderrParts,
  TARGET_BYTES,
} from "./testing/scan-fixtures";
import { scanFacts, streamFacts } from "./testing/scan-facts";

// 핵심 원칙(LSP-RULES-1 failclosed 시험과 같다): 알 수 없음·없음·깨짐·모호함을 "문제 없음"으로 읽지 않는다. null·누락·읽기 실패는 정상 값으로 채우지 않는다.
// 아래는 모두 "성공(SCAN_RESPONSE_OBSERVED)이 될 수 없다"를 확인한다.

const OK = "SCAN_RESPONSE_OBSERVED";
const verdictOf = (f: ScanFacts): string => judgeScanResponse(f).verdict;
const statusOf = (f: ScanFacts): string => judgeScanResponse(f).status;
const notSuccess = (f: ScanFacts): void => {
  expect(verdictOf(f)).not.toBe(OK);
};

describe("F1 didOpen 송신 위치를 모르면 사전·사후 분할이 무효다 → 성공이 아니다", () => {
  const unknowns: [string, (f: ScanFacts) => ScanFacts][] = [
    ["표시가 null", (f) => ({ ...f, markers: { ...f.markers, didOpenSent: null } })],
    [
      "표시의 stderr 위치가 null",
      (f) => ({
        ...f,
        markers: {
          ...f.markers,
          didOpenSent: { ...(f.markers.didOpenSent as object), stderrOffset: null } as never,
        },
      }),
    ],
    [
      "표시의 stdout 위치가 NaN",
      (f) => ({
        ...f,
        markers: {
          ...f.markers,
          didOpenSent: { ...(f.markers.didOpenSent as object), stdoutOffset: Number.NaN } as never,
        },
      }),
    ],
    [
      "표시의 위치가 음수",
      (f) => ({
        ...f,
        markers: {
          ...f.markers,
          didOpenSent: { ...(f.markers.didOpenSent as object), stderrOffset: -1 } as never,
        },
      }),
    ],
    [
      "표시의 위치가 소수",
      (f) => ({
        ...f,
        markers: {
          ...f.markers,
          didOpenSent: { ...(f.markers.didOpenSent as object), stderrOffset: 10.5 } as never,
        },
      }),
    ],
    [
      "표시의 시각이 null",
      (f) => ({
        ...f,
        markers: {
          ...f.markers,
          didOpenSent: { ...(f.markers.didOpenSent as object), tMs: null } as never,
        },
      }),
    ],
    [
      "송신 기록의 stderr 바이트 수 null",
      (f) => ({
        ...f,
        sends: f.sends.map((s) => (s.label === "didOpen" ? { ...s, stderrBytesAtSend: null } : s)),
      }),
    ],
    [
      "송신 기록의 stdout 바이트 수 null",
      (f) => ({
        ...f,
        sends: f.sends.map((s) => (s.label === "didOpen" ? { ...s, stdoutBytesAtSend: null } : s)),
      }),
    ],
    [
      "표시와 송신 기록의 위치가 다름",
      (f) => ({
        ...f,
        sends: f.sends.map((s) =>
          s.label === "didOpen" ? { ...s, stderrBytesAtSend: (s.stderrBytesAtSend ?? 0) + 1 } : s
        ),
      }),
    ],
  ];
  for (const [name, mutate] of unknowns) {
    it(name, () => {
      const f = mutate(scanFacts());
      notSuccess(f);
      // 위치를 모르는 채로 사후 증거가 "있었던 것처럼" 읽히지 않는다
      expect(statusOf(f)).toMatch(/NOT_OBSERVED|NOT_CONFIRMED/);
    });
  }

  it("표시가 없을 때 이번 스캔의 증거를 사후로 읽지 않는다 (전부 사전)", () => {
    const f = { ...scanFacts(), markers: { barrierDoneAtMs: 700, didOpenSent: null } };
    const ev = deriveScanEvidence({
      stdout: f.stdout.bytes,
      stderr: f.stderr.bytes,
      chunks: f.chunks,
      didOpen: null,
      barrierDoneAtMs: 700,
      workspace: f.workspace,
      expectedTargetUri: f.expectedTargetUri,
      scanMs: LSP_SCAN_LIMITS.scanMs,
      settleMs: LSP_SCAN_LIMITS.settleMs,
      stdoutEof: true,
    });
    expect(ev.diagnostics.state).toBe("NONE");
    expect(ev.logBundle.state).toBe("INCOMPLETE");
    expect(ev.bothCompleteAtMs).toBeNull();
    expect(ev.preOpen.evidence).toBe(true);
  });

  it("장벽 끝 표시가 없으면(null) 성공이 아니다", () => {
    notSuccess(
      scanFacts(
        {},
        { markers: { barrierDoneAtMs: null, didOpenSent: scanFacts().markers.didOpenSent } }
      )
    );
  });
});

describe("F2 청크 시간표를 믿을 수 없으면 시각 판단을 하지 않는다 → NOT_OBSERVED:CHUNK_TIMELINE_INVALID", () => {
  const f0 = scanFacts();
  const chunks = f0.chunks ?? [];
  const mutations: [string, ScanFacts["chunks"]][] = [
    ["시간표가 null", null],
    ["시간표가 빔", []],
    ["첫 청크가 0 에서 시작하지 않음", chunks.map((c, i) => (i === 0 ? { ...c, offset: 1 } : c))],
    ["청크 사이에 틈", chunks.filter((_, i) => i !== 2)],
    ["길이가 0 인 청크", chunks.map((c, i) => (i === 1 ? { ...c, length: 0 } : c))],
    ["시각이 NaN", chunks.map((c, i) => (i === 1 ? { ...c, tMs: Number.NaN } : c))],
    ["시각이 null", chunks.map((c, i) => (i === 1 ? { ...c, tMs: null as never } : c))],
    ["같은 스트림 안에서 시각이 거꾸로", chunks.map((c, i) => (i === 4 ? { ...c, tMs: 1 } : c))],
    [
      "스트림 이름이 틀림",
      chunks.map((c, i) => (i === 0 ? { ...c, stream: "stdin" as never } : c)),
    ],
    [
      "총 길이가 바이트 수와 다름",
      [...chunks, { stream: "stderr", offset: f0.stderr.bytes.byteLength, length: 5, tMs: 99_999 }],
    ],
  ];
  for (const [name, bad] of mutations) {
    it(name, () => {
      const f = { ...scanFacts(), chunks: bad };
      const j = judgeScanResponse(f);
      expect(j.verdict, name).toBe("NOT_OBSERVED:CHUNK_TIMELINE_INVALID");
      expect(buildScanRecord(f).evidence.timeline_valid).toBe(false);
      // 시각을 모르는 채로 완성 시각을 지어내지 않는다
      const ev = deriveScanEvidence({
        stdout: f.stdout.bytes,
        stderr: f.stderr.bytes,
        chunks: bad,
        didOpen: f.markers.didOpenSent,
        barrierDoneAtMs: 700,
        workspace: f.workspace,
        expectedTargetUri: f.expectedTargetUri,
        scanMs: 30_000,
        settleMs: 2000,
        stdoutEof: true,
      });
      expect(ev.diagnostics.completeAtMs).toBeNull();
      expect(ev.logBundle.completeAtMs).toBeNull();
      expect(ev.bothCompleteAtMs).toBeNull();
    });
  }
});

describe("F3 initialized 이전 stdout 에 초기화 응답 말고 다른 프레임이 있으면 성립하지 않는다", () => {
  it("응답보다 앞에 진행 요청이 있었다", () => {
    const msgs = barrierStdoutMessages();
    const f = scanFacts({ stdoutPre: [msgs[1], msgs[0], ...msgs.slice(2)] });
    expect(statusOf(f)).toBe("NOT_OBSERVED");
  });
  it("initialized 송신의 stdout 위치가 응답 끝이 아니다 (조각이 더 와 있었다)", () => {
    const f0 = scanFacts();
    const f = {
      ...f0,
      sends: f0.sends.map((s) =>
        s.label === "initialized" ? { ...s, stdoutBytesAtSend: (s.stdoutBytesAtSend ?? 0) + 3 } : s
      ),
    };
    expect(statusOf(f)).toBe("NOT_OBSERVED");
  });
  it("initialized 송신 위치를 모르면(null) 성립하지 않는다", () => {
    const f0 = scanFacts();
    for (const patch of [{ stderrBytesAtSend: null }, { stdoutBytesAtSend: null }]) {
      const f = {
        ...f0,
        sends: f0.sends.map((s) => (s.label === "initialized" ? { ...s, ...patch } : s)),
      };
      expect(verdictOf(f), JSON.stringify(patch)).toBe("NOT_OBSERVED:INITIALIZED_OFFSET_UNKNOWN");
    }
  });
});

describe("F4 끝에서 열려 있는 블록은 뒤의 줄을 삼킨다 → 성공이 될 수 없다", () => {
  const swallow = (extra: string[]): ScanFacts => {
    const post = scanStderrParts().post;
    const at = post.indexOf("Scanned 1 files");
    const lines = [
      ...post.slice(0, at),
      "[01.20][DEBUG](default): Dump {",
      ...post.slice(at, at + 2),
      ...extra,
    ];
    return scanFacts({ stderrPost: [{ lines, tMs: 1500 }], tail: [] });
  };
  it("삼켜진 필수 줄은 묶음을 가린다 → NOT_CONFIRMED:LOG_SHAPE_UNRECOGNIZED", () => {
    const f = swallow([]);
    expect(verdictOf(f)).toBe("NOT_CONFIRMED:LOG_SHAPE_UNRECOGNIZED");
  });
  it("삼켜진 줄이 작업 영역 스캔·네트워크 문구면 NOT_OBSERVED", () => {
    expect(statusOf(swallow(["Scanning workspace"]))).toBe("NOT_OBSERVED");
    expect(statusOf(swallow(["trying to download from https://x"]))).toBe("NOT_OBSERVED");
  });
});

describe("F5 스스로 끝난 경로에서 스트림이 닫히지 않았으면 로그가 덜 온 것일 수 있다", () => {
  it("stdout EOF 가 아니면 NOT_OBSERVED:STREAM_NOT_CLOSED:stdout", () => {
    const f0 = scanFacts();
    expect(verdictOf({ ...f0, stdout: { ...f0.stdout, eof: false } })).toBe(
      "NOT_OBSERVED:STREAM_NOT_CLOSED:stdout"
    );
  });
  it("stderr EOF 가 아니면 NOT_OBSERVED:STREAM_NOT_CLOSED:stderr", () => {
    const f0 = scanFacts();
    expect(verdictOf({ ...f0, stderr: { ...f0.stderr, eof: false } })).toBe(
      "NOT_OBSERVED:STREAM_NOT_CLOSED:stderr"
    );
  });
  it("읽기 실패·출력 상한·프레임 오류는 각각 자기 사유로 성립하지 않는다", () => {
    const f0 = scanFacts();
    expect(verdictOf({ ...f0, stdout: { ...f0.stdout, readFailed: true } })).toBe(
      "NOT_OBSERVED:STREAM_READ_FAILED"
    );
    expect(verdictOf({ ...f0, stderr: { ...f0.stderr, overflow: true } })).toBe(
      "NOT_OBSERVED:OUTPUT_LIMIT"
    );
    const cut = scanFacts(
      {},
      { stdout: streamFacts(frames([goodNotification()]).subarray(0, 20)) }
    );
    notSuccess(cut);
  });
});

describe("F6 settle 증거 — 시각을 모르면 감시를 마쳤다고 말하지 않는다", () => {
  const withSettle = (settle: unknown, shutdownAtMs?: number): ScanFacts =>
    scanFacts({ shutdownAtMs }, { settle: settle as never });
  it("settle 구조·시각이 null·NaN·문자열이면 성립하지 않는다", () => {
    for (const settle of [
      null,
      {},
      { endedAtMs: null },
      { endedAtMs: Number.NaN },
      { endedAtMs: "3500" },
      { endedAtMs: Number.POSITIVE_INFINITY },
    ]) {
      expect(verdictOf(withSettle(settle)), JSON.stringify(settle)).toBe(
        "NOT_OBSERVED:SETTLE_WATCH_NOT_CONFIRMED"
      );
    }
  });
  it("shutdown 송신 기록이 없거나 시각을 모르면 성립하지 않는다", () => {
    const f0 = scanFacts();
    const noShutdown = { ...f0, sends: f0.sends.filter((s) => s.label !== "shutdown") };
    notSuccess(noShutdown);
    const badTime = {
      ...f0,
      sends: f0.sends.map((s) => (s.label === "shutdown" ? { ...s, tMs: Number.NaN } : s)),
    };
    notSuccess(badTime);
  });
});

describe("F7 한도가 이상하면 기본값으로 덮지 않고 성립하지 않는다", () => {
  const withLimits = (over: Record<string, unknown>): ScanFacts =>
    scanFacts({}, { limits: { ...LSP_SCAN_LIMITS, ...over } as never });
  it("scanMs·settleMs 가 NaN·0·음수·문자열·상한 초과면 NOT_OBSERVED:LIMITS_INVALID", () => {
    for (const over of [
      { scanMs: Number.NaN },
      { scanMs: 0 },
      { scanMs: -1 },
      { scanMs: "30000" },
      { scanMs: 30_001 },
      { settleMs: 2001 },
      { settleMs: Number.NaN },
      { totalMs: 150_001 },
    ]) {
      expect(verdictOf(withLimits(over)), JSON.stringify(over)).toBe("NOT_OBSERVED:LIMITS_INVALID");
    }
  });
  it("정상 한도(낮춘 값 포함)는 영향이 없다", () => {
    expect(verdictOf(withLimits({ scanMs: 29_000 }))).toBe(OK);
  });
});

describe("G1 설치물·대상 파일·규칙 파일 해시를 읽지 못했거나 비었으면 변하지 않았다고 말하지 않는다", () => {
  it("설치물 전후 해시가 null·빈 문자열이면 같아 보여도 같은 것이 아니다", () => {
    for (const [before, after] of [
      [null, null],
      ["", ""],
      ["a", null],
      [null, "a"],
      ["a", ""],
    ] as [string | null, string | null][]) {
      const f = scanFacts({}, { artifacts: [{ label: "semgrep-core", before, after }] });
      notSuccess(f);
      expect(statusOf(f)).toBe("NOT_OBSERVED");
    }
  });
  it("대상 파일 해시를 읽지 못하면(null) 변하지 않았다고 말하지 않는다", () => {
    const f0 = scanFacts();
    for (const patch of [
      { sourceSha256: null },
      { afterWriteSha256: null },
      { afterRunSha256: null },
      { afterRunSha256: "" },
      { sourceSha256: "x" },
    ]) {
      const f = { ...f0, target: { ...f0.target, ...patch } };
      expect(statusOf(f), JSON.stringify(patch)).toBe("NOT_OBSERVED");
    }
  });
  it("규칙(프로브) 파일 해시를 읽지 못하면 성립하지 않는다", () => {
    const f0 = scanFacts();
    for (const patch of [
      { sourceSha256: null },
      { afterCopySha256: null },
      { afterRunSha256: null },
      { afterRunSha256: "x" },
    ]) {
      const f = { ...f0, probe: { ...f0.probe, ...patch } };
      expect(statusOf(f), JSON.stringify(patch)).toBe("NOT_OBSERVED");
    }
  });
  it("감시 폴더의 전후 파일 수를 모르면(null) 성립하지 않는다", () => {
    const f0 = scanFacts();
    for (const role of ["WORKSPACE", "RULES_DIR", "HOME_DIR"] as const) {
      const f = {
        ...f0,
        roots: f0.roots.map((r) => (r.role === role ? { ...r, filesAfter: null } : r)),
      };
      expect(statusOf(f), role).toBe("NOT_OBSERVED");
    }
    notSuccess({ ...f0, roots: f0.roots.filter((r) => r.role !== "WORKSPACE") });
  });
});

describe("G2 수신기·프로세스 표본을 읽지 못하면 접촉이 없었다고 말하지 않는다", () => {
  it("수신기 접촉 수를 모르면(null) 성립하지 않는다", () => {
    const f0 = scanFacts();
    for (const receiver of [
      { ...f0.live.receiver, baselineHits: null },
      { ...f0.live.receiver, finalHits: null },
      { ...f0.live.receiver, finalHits: 1 },
    ]) {
      const f = { ...f0, live: { ...f0.live, receiver } };
      expect(statusOf(f)).toBe("NOT_OBSERVED");
    }
  });
});

describe("G3 모르는 값을 정상 값으로 채우지 않는다 (기록)", () => {
  it("자식 PATH·작업 폴더·시각·해시가 null 이면 기록에도 null 로 남는다", () => {
    const f = scanFacts(
      {},
      {
        childEnv: { path: null, workingDirectory: null },
        target: { sourceSha256: null, afterWriteSha256: null, afterRunSha256: null },
      }
    );
    const r = buildScanRecord(f);
    expect(r.child_env).toEqual({ path_value: null, working_directory: null });
    expect(r.target).toMatchObject({
      source_sha256: null,
      after_write_sha256: null,
      after_run_sha256: null,
    });
    expect(r.verdict).not.toBe(OK);
  });
  it("받은 진단 URI 원문을 정규화한 값으로 바꿔 쓰지 않는다", () => {
    const f = scanFacts({
      stdoutPost: [
        {
          messages: [
            {
              jsonrpc: "2.0",
              method: "textDocument/publishDiagnostics",
              params: { uri: "file:///c%3A/work/scan-1/ws/lsp-scan-1-target.txt", diagnostics: [] },
            },
          ],
          tMs: 1400,
        },
      ],
    });
    const frames0 = buildScanRecord(f).diagnostic.frames;
    expect(frames0[0].raw_uri).toBe("file:///c%3A/work/scan-1/ws/lsp-scan-1-target.txt");
    expect(frames0[0].uri_comparison).toBe("MATCH");
  });
  it("진단 프레임이 없으면 확인된 필드도 없다 (null)", () => {
    const r = buildScanRecord(scanFacts({ stdoutPost: [] }));
    expect(r.diagnostic.fields).toBeNull();
    expect(r.diagnostic.confirmed).toBe(false);
    expect(r.engine_rule_count_passed).toBe(1); // 로그에서 관측된 값은 알림 유무와 무관하게 기록된다
    const none = buildScanRecord(scanFacts({ stderrPost: [], stdoutPost: [] }));
    expect(none.engine_rule_count_passed).toBeNull();
  });
});

describe("G4 provenance 는 승격하지 않는다", () => {
  it("스텁·null 출처의 성공도, 실제 출처의 성공도 real_binary_verified 는 false 다 (한 번의 반응일 뿐)", () => {
    for (const provenance of ["stub", null, "real"] as const) {
      const r = buildScanRecord(scanFacts({}, { provenance }));
      expect(r.verdict).toBe(OK);
      expect(r.real_binary_verified).toBe(false);
    }
  });
  it("성공이 아니면 세워 주는 것이 없다", () => {
    const r = buildScanRecord(scanFacts({ stdoutPost: [] }));
    expect(r.established).toEqual([]);
    expect(r.diagnostic.confirmed).toBe(false);
  });
});

describe("G5 사전 구간에 완전한 묶음을 옮겨 놓아도 성공이 아니다", () => {
  it("묶음 전체와 정상 알림이 didOpen 앞에만 있다", () => {
    const parts = scanStderrParts();
    const f = scanFacts({
      pre: [...parts.pre, ...parts.post.slice(0, parts.post.indexOf("Found 1 matches") + 1)],
      stderrPost: [],
      stdoutPre: [...barrierStdoutMessages(), goodNotification()],
      stdoutPost: [],
      shutdownAtMs: 31_100,
    });
    expect(verdictOf(f)).not.toBe(OK);
    const ev = deriveScanEvidence({
      stdout: f.stdout.bytes,
      stderr: f.stderr.bytes,
      chunks: f.chunks,
      didOpen: f.markers.didOpenSent,
      barrierDoneAtMs: 700,
      workspace: f.workspace,
      expectedTargetUri: f.expectedTargetUri,
      scanMs: 30_000,
      settleMs: 2000,
      stdoutEof: true,
    });
    expect(ev.logBundle.state).toBe("INCOMPLETE");
    expect(ev.diagnostics.state).toBe("NONE");
  });
});

describe("G6 보조: 원문 바이트가 기록의 해시와 같다", () => {
  it("스트림 해시는 원문 바이트의 sha256 이다", () => {
    const f = scanFacts();
    const r = buildScanRecord(f);
    expect(r.streams.stdout.sha256).toBe(sha256Hex(f.stdout.bytes));
    expect(r.streams.stderr.sha256).toBe(sha256Hex(f.stderr.bytes));
    expect(sha256Hex(TARGET_BYTES)).toBe(r.target.expected_sha256);
  });
});
