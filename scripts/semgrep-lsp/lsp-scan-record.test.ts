import { describe, expect, it } from "vitest";
import { ALLOWED_IMAGES } from "./lsp-min";
import { LSP_SCAN_LIMITS, SCAN_UNOBSERVED_ALWAYS } from "./lsp-scan";
import {
  SCAN_CONDITION_NAMES,
  ScanEvidenceTracker,
  buildScanRecord,
  deriveScanEvidence,
  judgeScanResponse,
  type ScanEvidenceInput,
  type ScanFacts,
} from "./lsp-scan-record";
import {
  scanStderrParts,
  TARGET_URI,
  GOOD_DIAGNOSTIC,
  publishDiagnostics,
  goodNotification,
  externalCommandLine,
  barrierStdoutMessages,
  scanLay,
} from "./testing/scan-fixtures";
import { defaultPostParts, replayLiveView, scanFacts, type ScanBuild } from "./testing/scan-facts";
import type { JsonRpcMessage } from "./types";

const OK = "SCAN_RESPONSE_OBSERVED";
const POST = (): string[] => scanStderrParts().post;
const verdictOf = (f: ScanFacts): string => judgeScanResponse(f).verdict;
const evidenceOf = (f: ScanFacts) =>
  deriveScanEvidence({
    stdout: f.stdout.bytes,
    stderr: f.stderr.bytes,
    chunks: f.chunks,
    didOpen: f.markers.didOpenSent,
    barrierDoneAtMs: f.markers.barrierDoneAtMs,
    workspace: f.workspace,
    expectedTargetUri: f.expectedTargetUri,
    scanMs: f.limits.scanMs,
    settleMs: f.limits.settleMs,
    stdoutEof: f.stdout.eof,
  } satisfies ScanEvidenceInput);

/** 사후 stderr 를 줄 변환으로 바꾼 사실. */
const postEdit = (
  fn: (post: string[]) => string[],
  build: ScanBuild = {},
  over: Partial<ScanFacts> = {}
) => scanFacts({ stderrPost: defaultPostParts(1500, fn(POST())), ...build }, over);
const preEdit = (
  fn: (pre: string[]) => string[],
  build: ScanBuild = {},
  over: Partial<ScanFacts> = {}
) => scanFacts({ pre: fn(scanStderrParts().pre), ...build }, over);
const withFrames = (...messages: JsonRpcMessage[]) => ({
  stdoutPost: messages.map((m, i) => ({ messages: [m], tMs: 1400 + i * 5 })),
});
const diag = (over: Record<string, unknown> = {}) => ({
  ...structuredClone(GOOD_DIAGNOSTIC),
  ...over,
});
const frameWith = (over: Record<string, unknown>) =>
  withFrames(publishDiagnostics(TARGET_URI, [diag(over)]));
const without =
  (...needles: string[]) =>
  (post: string[]) =>
    post.filter((l) => !needles.some((n) => l.includes(n)));
const replaceLine = (needle: string, text: string) => (post: string[]) =>
  post.map((l) => (l.includes(needle) ? text : l));
const afterFound =
  (...extra: string[]) =>
  (post: string[]) => {
    const at = post.indexOf("Found 1 matches");
    return [...post.slice(0, at + 1), ...extra, ...post.slice(at + 1)];
  };

// ── 정상과 기록 ───────────────────────────────────────────────────

describe("정상 사실", () => {
  it("16개 조건이 모두 PASS 이고 SCAN_RESPONSE_OBSERVED 다", () => {
    const j = judgeScanResponse(scanFacts());
    expect(j.verdict).toBe(OK);
    expect(j.status).toBe("OBSERVED");
    expect(j.reasons).toEqual([]);
    expect(j.conditions).toHaveLength(16);
    expect(j.conditions.map((c) => c.result)).toEqual(Array(16).fill("PASS"));
    expect(j.conditions.map((c) => c.name)).toEqual([...SCAN_CONDITION_NAMES]);
    expect(j.conditions.map((c) => c.id)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
  });

  it("같은 사실이면 같은 기록이다", () => {
    expect(JSON.stringify(buildScanRecord(scanFacts()))).toBe(
      JSON.stringify(buildScanRecord(scanFacts()))
    );
  });

  it("기록: 확인된 진단 필드, 실제 code 와 URI 원문, 정규화 비교 결과, 엔진에 넘긴 규칙 수", () => {
    const r = buildScanRecord(scanFacts());
    expect(r.verdict).toBe(OK);
    expect(r.diagnostic.confirmed).toBe(true);
    expect(r.diagnostic.fields).toMatchObject({
      raw_uri: TARGET_URI,
      uri_comparison: "MATCH",
      uri_reject_reason: null,
      code_actual: "rules-probe.lsp-rules-1-probe",
      code_match: true,
      source_actual: "Semgrep",
      severity_actual: 3,
      range_actual: GOOD_DIAGNOSTIC.range,
      range_class: "EXACT",
      code_description_absent: true,
      unknown_fields: [],
    });
    expect(r.diagnostic.post_open_frames).toBe(1);
    expect(r.engine_rule_count_passed).toBe(1);
    expect(r.engine).toMatchObject({
      targets: 1,
      matches_before: 1,
      matches: 1,
      scanned_files: 1,
      skipped: 0,
      errors_text: "",
    });
    expect(r.evidence.both_complete_at_ms).toBe(1500);
    expect(r.evidence.settle).toEqual({ start_ms: 1500, end_ms: 3500 });
    expect(r.evidence.tracker_comparison).toBe("MATCH");
  });

  it("두 허용 code 문자열 모두 성공이고 실제 값을 기록한다", () => {
    for (const code of ["rules-probe.lsp-rules-1-probe", "lsp-rules-1-probe"]) {
      const f = scanFacts({}, {});
      const g = scanFacts(frameWith({ code }));
      expect(verdictOf(f)).toBe(OK);
      expect(verdictOf(g), code).toBe(OK);
      expect(buildScanRecord(g).diagnostic.fields?.code_actual).toBe(code);
    }
  });

  it("URI 변형(c:·C:·c%3A·C%3a)과 퍼센트 인코딩은 성공이고 원문을 기록한다", () => {
    for (const uri of [
      "file:///C:/work/scan-1/ws/lsp-scan-1-target.txt",
      "file:///c:/work/scan-1/ws/lsp-scan-1-target.txt",
      "file:///c%3A/work/scan-1/ws/lsp-scan-1-target.txt",
      "file:///C%3a/work/scan-1/ws/lsp-scan-1-target.txt",
      "file:///c%3A/work/scan-1/ws/lsp-scan-1-target%2Etxt",
    ]) {
      const f = scanFacts(withFrames(publishDiagnostics(uri, [diag()])));
      expect(verdictOf(f), uri).toBe(OK);
      const fields = buildScanRecord(f).diagnostic.fields;
      expect(fields?.raw_uri).toBe(uri);
      expect(fields?.uri_comparison).toBe("MATCH");
    }
  });

  it("알려지지 않은 진단 필드는 기록하되 성공도 실패도 만들지 않는다", () => {
    const f = scanFacts(frameWith({ tags: [1], data: { a: 1 } }));
    expect(verdictOf(f)).toBe(OK);
    expect(buildScanRecord(f).diagnostic.fields?.unknown_fields).toEqual(["data", "tags"]);
  });

  it("스텁(합성) 성공은 실제 바이너리 검증으로 승격하지 않는다", () => {
    const r = buildScanRecord(scanFacts());
    expect(r.provenance).toBe("stub");
    expect(r.real_binary_verified).toBe(false);
    expect(r.evidence_scope).toBe("SYNTHETIC_STUB_ONLY");
    expect(r.coverage.unobserved).toContain("PROVENANCE_STUB_NOT_REAL_SEMGREP");
    const none = buildScanRecord(scanFacts({}, { provenance: null }));
    expect(none.real_binary_verified).toBe(false);
    expect(none.evidence_scope).toBe("SYNTHETIC_STUB_ONLY");
    const real = buildScanRecord(scanFacts({}, { provenance: "real" }));
    expect(real.verdict).toBe(OK);
    expect(real.real_binary_verified).toBe(false); // 한 번의 합성 입력 반응일 뿐 — 바이너리 검증이 아니다
    expect(real.evidence_scope).toBe("ONE_SYNTHETIC_INPUT_REACTION");
    expect(real.coverage.unobserved).not.toContain("PROVENANCE_STUB_NOT_REAL_SEMGREP");
  });

  it("성공이어도 세워 주는 것은 합성 입력 한 건의 반응·엔진이 받은 규칙 수·확인된 필드뿐이다 (나머지는 미확립)", () => {
    const r = buildScanRecord(scanFacts());
    expect(r.established).toEqual([
      "ONE_SYNTHETIC_INPUT_DIAGNOSTIC_REACTION",
      "ENGINE_GIVEN_RULE_COUNT_PARTIAL_OBSERVATION",
      "DIAGNOSTIC_FIELDS_CONFIRMED",
    ]);
    expect(r.not_established).toEqual({
      rule_detection_performance_in_general: "NOT_ESTABLISHED",
      real_repository_scan_security: "NOT_ESTABLISHED",
      negative_controls: "NOT_ESTABLISHED",
      control_reference_qualification: "NOT_ESTABLISHED",
      whole_isolation_effect: "NOT_ESTABLISHED",
      binary_source_correspondence: "NOT_ESTABLISHED",
      pin_and_log_format_verification: "NOT_ESTABLISHED",
      loaded_rule_count: "PARTIAL_OBSERVATION_ONLY",
      git_process_creation: "NOT_ESTABLISHED",
    });
    for (const item of SCAN_UNOBSERVED_ALWAYS) expect(r.coverage.unobserved).toContain(item);
    // 성공이 아니면 아무것도 세우지 않는다
    expect(buildScanRecord(scanFacts(frameWith({ source: "x" }))).established).toEqual([]);
  });

  it("세 결과(관측 판정·프로세스 정리·시스템 복구)는 서로 독립이다", () => {
    const bad = scanFacts(
      {},
      {
        cleanup: {
          childExitConfirmed: true,
          streamsClosed: true,
          descendantsAliveAfter: 1,
          descendantTracking: "ROOT_GONE",
          dispose: "OK",
          timersCancelled: true,
          problems: ["DESCENDANT_ALIVE"],
        },
        recovery: { status: "DIFFERENT", detail: ["X"] },
      }
    );
    const r = buildScanRecord(bad);
    expect(r.verdict).toBe(OK); // 정리·복구 결과가 관측 판정을 바꾸지 않는다
    expect(r.outcomes.observation).toEqual({ status: "OBSERVED", verdict: OK });
    expect(r.outcomes.process_cleanup.ok).toBe(false);
    expect(r.outcomes.system_recovery).toEqual({ status: "DIFFERENT", detail: ["X"] });
    // 그리고 성공이 정리·복구를 보증하지 않는다
    const missing = buildScanRecord(scanFacts({}, { recovery: null }));
    expect(missing.outcomes.system_recovery.status).toBe("NOT_OBSERVED");
    expect(missing.outcomes.process_cleanup.ok).toBe(true);
  });

  it("자식 환경의 PATH 값과 작업 폴더를 기록하고, 모르면 null 로 둔다 (정상 값으로 채우지 않는다)", () => {
    const r = buildScanRecord(scanFacts());
    expect(r.child_env).toEqual({
      path_value: "C:/Windows\\System32;C:/Windows",
      working_directory: scanLay.stateDir,
    });
    const unknown = buildScanRecord(
      scanFacts({}, { childEnv: { path: null, workingDirectory: null } })
    );
    expect(unknown.child_env).toEqual({ path_value: null, working_directory: null });
  });
});

// ── 도착 순서 행렬: 완전하고 일관된 증거면 어느 순서든 같은 성공 ──────────

describe("도착 순서 행렬", () => {
  const D = (t: number) => ({ stdoutPost: [{ messages: [goodNotification()], tMs: t }] });
  const L = (t: number) => ({ stderrPost: defaultPostParts(t) });
  const cases: [string, ScanBuild, number][] = [
    ["진단 먼저 (1400) → 로그 (1500)", { ...D(1400), ...L(1500) }, 1500],
    ["로그 먼저 (1300) → 진단 (1450)", { ...D(1450), ...L(1300) }, 1450],
    ["동시 도착 (1450 / 1450)", { ...D(1450), ...L(1450) }, 1450],
    ["진단이 일찍 (1100), 로그가 한참 뒤 (9100)", { ...D(1100), ...L(9100) }, 9100],
    ["로그가 일찍 (1100), 진단이 한참 뒤 (9100)", { ...D(9100), ...L(1100) }, 9100],
    ["1바이트 청크", { chunkSize: 1 }, 1500],
    ["1바이트 청크, 로그 먼저", { chunkSize: 1, ...D(1450), ...L(1300) }, 1450],
    ["1바이트 청크, 진단이 뒤늦게", { chunkSize: 1, ...D(9100), ...L(1100) }, 9100],
    ["2바이트 청크", { chunkSize: 2 }, 1500],
    ["7바이트 청크", { chunkSize: 7 }, 1500],
    ["13바이트 청크, 동시", { chunkSize: 13, ...D(1450), ...L(1450) }, 1450],
    ["64바이트 청크", { chunkSize: 64 }, 1500],
    ["333바이트 청크, 로그 먼저", { chunkSize: 333, ...D(1450), ...L(1300) }, 1450],
  ];
  for (const [name, build, both] of cases) {
    it(`${name} → 같은 성공, 두 묶음 완성 시각은 늦은 쪽 ${both}`, () => {
      const f = scanFacts(build);
      const j = judgeScanResponse(f);
      expect(j.verdict, name).toBe(OK);
      expect(j.conditions.every((c) => c.result === "PASS")).toBe(true);
      const ev = evidenceOf(f);
      expect(ev.bothCompleteAtMs).toBe(both);
      expect(ev.settle).toEqual({ startMs: both, endMs: both + 2000 });
      const r = buildScanRecord(f);
      expect(r.evidence.both_complete_at_ms).toBe(both);
      expect(r.evidence.tracker_comparison).toBe("MATCH");
    });
  }

  it("추적기는 청크를 먹이는 대로 같은 순간에 같은 상태가 된다 (1바이트 청크)", () => {
    const f = scanFacts({
      chunkSize: 1,
      stdoutPost: [{ messages: [goodNotification()], tMs: 1450 }],
      stderrPost: defaultPostParts(1300),
    });
    const tracker = new ScanEvidenceTracker({
      workspace: f.workspace,
      expectedTargetUri: f.expectedTargetUri,
      scanMs: f.limits.scanMs,
      settleMs: f.limits.settleMs,
    });
    expect(f.chunks).not.toBeNull();
    type Ev = { t: number; run: () => void };
    const events: Ev[] = (f.chunks ?? []).map((c) => ({
      t: c.tMs,
      run: () => {
        const src = c.stream === "stdout" ? f.stdout.bytes : f.stderr.bytes;
        const piece = src.subarray(c.offset, c.offset + c.length);
        if (c.stream === "stdout") tracker.feedStdout(piece, c.tMs);
        else tracker.feedStderr(piece, c.tMs);
      },
    }));
    const marker = f.markers.didOpenSent;
    expect(marker).not.toBeNull();
    events.push({
      t: (marker?.tMs ?? 0) + 0.5,
      run: () => tracker.markDidOpenSent(marker?.tMs ?? 0),
    });
    events.sort((a, b) => a.t - b.t);
    let firstDiag: number | null = null;
    let firstLog: number | null = null;
    let firstBoth: number | null = null;
    for (const e of events) {
      e.run();
      const s = tracker.snapshot(e.t);
      if (firstDiag === null && s.diagnosticsState === "ONE") firstDiag = e.t;
      if (firstLog === null && s.logState === "COMPLETE") firstLog = e.t;
      if (firstBoth === null && s.bothCompleteAtMs !== null) firstBoth = e.t;
    }
    expect(firstDiag).toBe(1450);
    expect(firstLog).toBe(1300);
    expect(firstBoth).toBe(1450);
    const end = tracker.snapshot(null);
    expect(end.bothCompleteAtMs).toBe(1450);
    expect(end.settleStartMs).toBe(1450);
    expect(end.settleEndMs).toBe(3450);
    expect(end.preOpenEvidence).toBe(false);
    expect(end.violations).toEqual([]);
  });
});

// ── 한쪽만 도착, 사전 증거, 늦음, 없음 ────────────────────────────

describe("한쪽 증거만 있거나 아무것도 없으면 성공이 아니다 — 서로 다른 사유", () => {
  it("진단 알림만 있고 엔진 로그 묶음이 없다 → ENGINE_LOG_MISSING", () => {
    const f = postEdit((post) => post.slice(0, 1));
    expect(verdictOf(f)).toBe("NOT_CONFIRMED:ENGINE_LOG_MISSING");
    // 일부 줄만 있어도 같다
    const partial = postEdit((post) =>
      post.slice(0, post.indexOf("[01.20][INFO]: Found 1 matches before processing"))
    );
    expect(verdictOf(partial)).toBe("NOT_CONFIRMED:ENGINE_LOG_MISSING");
  });

  it("엔진 로그 묶음만 있고 진단 알림이 없다 → NO_DIAGNOSTIC_NOTIFICATION", () => {
    const f = scanFacts({ stdoutPost: [] });
    expect(verdictOf(f)).toBe("NOT_CONFIRMED:NO_DIAGNOSTIC_NOTIFICATION");
  });

  it("둘 다 없이 한도를 넘겼다 → SCAN_TIMEOUT (강제 종료가 있으면 NOT_OBSERVED)", () => {
    const base = scanFacts(
      { stderrPost: [], stdoutPost: [], shutdownAtMs: 31_100 },
      { trigger: "SCAN_TIMEOUT" }
    );
    expect(verdictOf(base)).toBe("NOT_CONFIRMED:SCAN_TIMEOUT");
    const killed = scanFacts(
      { stderrPost: [], stdoutPost: [], shutdownAtMs: 31_100 },
      {
        trigger: "EXIT_TIMEOUT",
        also: ["SCAN_TIMEOUT"],
        kill: { count: 1, firstTMs: 62_000, confirmed: true },
        exit: { observed: true, code: null, signal: "SIGKILL", tMs: 62_100 },
      }
    );
    expect(judgeScanResponse(killed).status).toBe("NOT_OBSERVED");
  });

  it("로그가 마감 뒤에 완성됐다 → EVIDENCE_AFTER_DEADLINE (없는 것과 다른 사유)", () => {
    const late = scanFacts({ stderrPost: defaultPostParts(31_001) });
    const j = judgeScanResponse(late);
    expect(j.verdict).toBe("NOT_CONFIRMED:EVIDENCE_AFTER_DEADLINE");
    const r = buildScanRecord(late);
    expect(r.evidence.log_bundle.late).toBe(true);
    expect(r.evidence.diagnostics.late).toBe(false);
    expect(verdictOf(scanFacts({ stderrPost: [], stdoutPost: [] }))).not.toBe(j.verdict);
  });

  it("마감 경계: didOpen 으로부터 정확히 scanMs 는 시간 안, 1ms 넘으면 늦다 (진단·로그 모두)", () => {
    expect(verdictOf(scanFacts({ stderrPost: defaultPostParts(31_000) }))).toBe(OK);
    expect(verdictOf(scanFacts({ stderrPost: defaultPostParts(31_001) }))).toBe(
      "NOT_CONFIRMED:EVIDENCE_AFTER_DEADLINE"
    );
    expect(
      verdictOf(scanFacts({ stdoutPost: [{ messages: [goodNotification()], tMs: 31_000 }] }))
    ).toBe(OK);
    expect(
      verdictOf(scanFacts({ stdoutPost: [{ messages: [goodNotification()], tMs: 31_001 }] }))
    ).toBe("NOT_CONFIRMED:EVIDENCE_AFTER_DEADLINE");
    // 한도를 낮추면 그에 맞춰 마감이 앞당겨진다
    const short = scanFacts({}, { limits: { ...LSP_SCAN_LIMITS, scanMs: 400 } });
    expect(verdictOf(short)).toBe("NOT_CONFIRMED:EVIDENCE_AFTER_DEADLINE"); // 로그 1500 > 1000 + 400
    const fits = scanFacts({}, { limits: { ...LSP_SCAN_LIMITS, scanMs: 500 } });
    expect(verdictOf(fits)).toBe(OK); // 1500 = 1000 + 500
  });

  it("didOpen 이전에 도착한 증거는 이번 스캔의 증거가 아니다 → PRE_OPEN_EVIDENCE", () => {
    // (a) 사전 구간에 스캔 시작 줄이 있다
    const a = preEdit((pre) => {
      const at = pre.indexOf("Scanned open documents");
      return [...pre.slice(0, at + 1), "Scanning single file", ...pre.slice(at + 1)];
    });
    expect(verdictOf(a)).toBe("NOT_CONFIRMED:PRE_OPEN_EVIDENCE");
    // (b) 사전 구간에 진단 프레임이 있다
    const b = scanFacts({ stdoutPre: [...barrierStdoutMessages(), goodNotification()] });
    expect(verdictOf(b)).toBe("NOT_CONFIRMED:PRE_OPEN_EVIDENCE");
    // (c) 사후 구간의 증거를 전부 사전 구간으로 옮기면 성공이 아니다 (사전 증거를 이번 스캔으로 쓰지 않는다)
    const { post } = scanStderrParts();
    const c = scanFacts({
      pre: [...scanStderrParts().pre, ...post.slice(0, post.indexOf("Found 1 matches") + 1)],
      stderrPost: [],
      stdoutPre: [...barrierStdoutMessages(), goodNotification()],
      stdoutPost: [],
      shutdownAtMs: 31_100,
    });
    const j = judgeScanResponse(c);
    expect(j.verdict).toBe("NOT_CONFIRMED:PRE_OPEN_EVIDENCE");
    expect(j.reasons).toContain("SCAN_TIMEOUT"); // 사후에는 아무것도 도착하지 않았다
  });

  it("사전 구간에 증거가 있어도 사후 증거가 완전하면 사전 증거 때문에만 실패한다 (사후 묶음은 따로 센다)", () => {
    const f = preEdit((pre) => [...pre, "Scanned 1 files"]);
    const ev = evidenceOf(f);
    expect(ev.preOpen.evidence).toBe(true);
    expect(ev.logBundle.state).toBe("COMPLETE");
    expect(ev.diagnostics.state).toBe("ONE");
  });
});

// ── 진단 내용 ────────────────────────────────────────────────────

describe("진단: 중복·다른 URI·다른 규칙·다른 범위", () => {
  it("대상 URI 알림 2건, 또는 진단 2개 → DUPLICATE_DIAGNOSTICS", () => {
    expect(verdictOf(scanFacts(withFrames(goodNotification(), goodNotification())))).toBe(
      "NOT_CONFIRMED:DUPLICATE_DIAGNOSTICS"
    );
    expect(verdictOf(scanFacts(withFrames(publishDiagnostics(TARGET_URI, [diag(), diag()]))))).toBe(
      "NOT_CONFIRMED:DUPLICATE_DIAGNOSTICS"
    );
  });

  it("대상이 아닌 URI → WRONG_URI, 대상 URI 와 함께 다른 URI → EXTRA_URI, 거절된 URI → URI_REJECTED", () => {
    const other = "file:///C:/work/scan-1/ws/other.txt";
    expect(verdictOf(scanFacts(withFrames(publishDiagnostics(other, [diag()]))))).toBe(
      "NOT_CONFIRMED:WRONG_URI"
    );
    expect(
      verdictOf(scanFacts(withFrames(goodNotification(), publishDiagnostics(other, []))))
    ).toBe("NOT_CONFIRMED:EXTRA_URI");
    for (const bad of [
      `${TARGET_URI}?x=1`,
      `${TARGET_URI}#a`,
      "file://host/share/x",
      "file:///C:/work/scan-1/ws//lsp-scan-1-target.txt",
      5,
    ]) {
      expect(verdictOf(scanFacts(withFrames(publishDiagnostics(bad, [diag()])))), String(bad)).toBe(
        "NOT_CONFIRMED:URI_REJECTED"
      );
    }
  });

  it("params 모양이 깨진 진단 프레임(진단 목록이 배열이 아님·params 없음)은 DIAGNOSTIC_FRAME_MALFORMED", () => {
    expect(verdictOf(scanFacts(withFrames(publishDiagnostics(TARGET_URI, "x"))))).toBe(
      "NOT_CONFIRMED:DIAGNOSTIC_FRAME_MALFORMED"
    );
    expect(
      verdictOf(
        scanFacts(withFrames({ jsonrpc: "2.0", method: "textDocument/publishDiagnostics" }))
      )
    ).toBe("NOT_CONFIRMED:DIAGNOSTIC_FRAME_MALFORMED");
  });

  it("다른 규칙 id → SCAN_FAILED:WRONG_RULE, message·source·severity·codeDescription → SCAN_FAILED:DIAGNOSTIC_FIELD_MISMATCH", () => {
    expect(verdictOf(scanFacts(frameWith({ code: "other.rule" })))).toBe("SCAN_FAILED:WRONG_RULE");
    expect(verdictOf(scanFacts(frameWith({ code: undefined })))).toBe("SCAN_FAILED:WRONG_RULE");
    for (const patch of [
      { message: "x" },
      { source: "semgrep" },
      { severity: 2 },
      { codeDescription: { href: "https://x" } },
    ]) {
      const j = judgeScanResponse(scanFacts(frameWith(patch)));
      expect(j.verdict, JSON.stringify(patch)).toBe("SCAN_FAILED:DIAGNOSTIC_FIELD_MISMATCH");
    }
    expect(judgeScanResponse(scanFacts(frameWith({ message: "x" }))).reasons).toContain("MESSAGE");
  });

  it("범위가 어느 끝이든 ±1 이면 성공이 아니고 실제 값을 그대로 기록한다", () => {
    const range = (sl: number, sc: number, el: number, ec: number) => ({
      start: { line: sl, character: sc },
      end: { line: el, character: ec },
    });
    const cases: [string, ReturnType<typeof range>, boolean][] = [
      ["시작 열 -1", range(1, 7, 1, 53), false],
      ["시작 열 +1", range(1, 9, 1, 53), false],
      ["끝 열 -1", range(1, 8, 1, 52), true],
      ["끝 열 +1", range(1, 8, 1, 54), true],
      ["줄 이동", range(2, 8, 2, 53), false],
    ];
    for (const [name, r, uncertain] of cases) {
      const f = scanFacts(frameWith({ range: r }));
      const j = judgeScanResponse(f);
      expect(j.verdict, name).toBe("NOT_CONFIRMED:RANGE_MISMATCH");
      expect(j.reasons.includes("RANGE_CONVENTION_UNCERTAIN"), name).toBe(uncertain);
      expect(buildScanRecord(f).diagnostic.fields?.range_actual, name).toEqual(r);
      expect(buildScanRecord(f).diagnostic.confirmed).toBe(false);
    }
  });

  it("엔진 오류: ERROR 줄, Semgrep errors 내용, 건너뛴 규칙 1개 이상, 오류 알림 → SCAN_FAILED:ENGINE_ERROR", () => {
    expect(verdictOf(postEdit(afterFound("[01.30][ERROR]: boom")))).toBe(
      "SCAN_FAILED:ENGINE_ERROR"
    );
    expect(
      verdictOf(postEdit(replaceLine("Semgrep errors:", "Semgrep errors: parse failure")))
    ).toBe("SCAN_FAILED:ENGINE_ERROR");
    expect(verdictOf(postEdit(replaceLine("Semgrep skipped", "Semgrep skipped 1 rules")))).toBe(
      "SCAN_FAILED:ENGINE_ERROR"
    );
    expect(verdictOf(postEdit(afterFound("[01.30][INFO]: skipping rule a.b, error = bad")))).toBe(
      "SCAN_FAILED:ENGINE_ERROR"
    );
    const notified = scanFacts({
      stdoutPost: [
        { messages: [goodNotification()], tMs: 1400 },
        {
          messages: [
            { jsonrpc: "2.0", method: "window/showMessage", params: { type: 1, message: "x" } },
          ],
          tMs: 1410,
        },
      ],
    });
    expect(verdictOf(notified)).toBe("SCAN_FAILED:ENGINE_ERROR");
  });

  it("로그의 매치 수와 알림의 진단 수가 다르면 COUNT_MISMATCH", () => {
    const f = postEdit((post) =>
      post.map((l) =>
        l === "Found 1 matches"
          ? "Found 2 matches"
          : l.replace("Found 1 matches before", "Found 2 matches before")
      )
    );
    expect(verdictOf(f)).toBe("NOT_CONFIRMED:COUNT_MISMATCH");
  });

  it("엔진이 돌았는데 매치 0건 → SCAN_FAILED:NO_MATCH (빈 알림이든 알림 없음이든)", () => {
    const zero = (post: string[]) =>
      post.map((l) =>
        l === "Found 1 matches"
          ? "Found 0 matches"
          : l.replace("Found 1 matches before", "Found 0 matches before")
      );
    expect(verdictOf(postEdit(zero, withFrames(publishDiagnostics(TARGET_URI, []))))).toBe(
      "SCAN_FAILED:NO_MATCH"
    );
    expect(verdictOf(postEdit(zero, { stdoutPost: [] }))).toBe("SCAN_FAILED:NO_MATCH");
    // 매치 0건이라고 했는데 알림에는 진단이 있으면 NO_MATCH 가 아니다
    expect(verdictOf(postEdit(zero))).toBe("NOT_CONFIRMED:COUNT_MISMATCH");
  });

  it("엔진에 넘긴 규칙 수가 1 이 아니면 성공이 아니다 (부분 관측이지만 어긋나면 알린다)", () => {
    const f = postEdit(
      replaceLine("Running Semgrep with", "[01.02][DEBUG](default): Running Semgrep with 2 rules")
    );
    expect(verdictOf(f)).toBe("NOT_CONFIRMED:RULE_COUNT_UNEXPECTED");
    expect(buildScanRecord(f).engine_rule_count_passed).toBe(2);
    const targets = postEdit(
      replaceLine("Scanning 1 targets", "[01.02][INFO]: Scanning 2 targets")
    );
    expect(verdictOf(targets)).toBe("NOT_CONFIRMED:ENGINE_COUNTS_UNEXPECTED");
    const scanned = postEdit(replaceLine("Scanned 1 files", "Scanned 2 files"));
    expect(verdictOf(scanned)).toBe("NOT_CONFIRMED:ENGINE_COUNTS_UNEXPECTED");
  });
});

// ── 대상 없음·규칙 없음 ───────────────────────────────────────────

describe("didOpen 뒤의 대상 없음·규칙 없음·로딩 안 됨", () => {
  const stop = (line: string) => (post: string[]) => [
    post[0],
    "Scanning single file",
    "Scanned single file",
    externalCommandLine(scanLay.workspace, "01.01"),
    line,
  ];
  it("No targets to scan! → NO_TARGET (장벽 단계의 같은 줄은 정상이다)", () => {
    const f = postEdit(stop("[01.02][WARNING]: No targets to scan! Not scanning anything."), {
      stdoutPost: [],
    });
    expect(verdictOf(f)).toBe("NOT_CONFIRMED:NO_TARGET");
  });
  it("No rules to run! → NO_RULES, Rules not loaded yet → RULES_NOT_LOADED", () => {
    expect(
      verdictOf(
        postEdit(stop("[01.02][WARNING]: No rules to run! Not scanning anything."), {
          stdoutPost: [],
        })
      )
    ).toBe("NOT_CONFIRMED:NO_RULES");
    expect(
      verdictOf(postEdit(stop("Rules not loaded yet, not scanning anything."), { stdoutPost: [] }))
    ).toBe("NOT_CONFIRMED:RULES_NOT_LOADED");
  });
});

// ── 스트림 안의 순서 ─────────────────────────────────────────────

describe("스트림 안의 순서", () => {
  it("엔진 로그의 순서가 어긋나면 ORDER_VIOLATION (두 스트림 사이의 순서는 보지 않는다)", () => {
    const swapped = postEdit((post) =>
      post.map((l) =>
        l === "Scanned 1 files"
          ? "Found 1 matches"
          : l === "Found 1 matches"
            ? "Scanned 1 files"
            : l
      )
    );
    expect(verdictOf(swapped)).toBe("NOT_CONFIRMED:ORDER_VIOLATION");
    const swappedErrors = postEdit((post) =>
      post.map((l) =>
        l.startsWith("Semgrep errors:")
          ? "Semgrep skipped 0 rules"
          : l === "Semgrep skipped 0 rules"
            ? "Semgrep errors: "
            : l
      )
    );
    expect(verdictOf(swappedErrors)).toBe("NOT_CONFIRMED:ORDER_VIOLATION");
  });

  it("Scanned single file 은 완료 신호가 아니다: Scanning single file 뒤 어디에 있어도 성공이다", () => {
    for (const at of [2, 5, 9, 10, 15]) {
      const f = postEdit((post) => {
        const rest = post.filter((l) => l !== "Scanned single file");
        return [...rest.slice(0, at), "Scanned single file", ...rest.slice(at)];
      });
      // 너무 일찍(Scanning single file 앞)은 위반이므로 at ≥ 2 만 쓴다
      expect(verdictOf(f), `at=${at}`).toBe(OK);
    }
  });

  it("Scanned single file 이 Scanning single file 보다 앞서면 ORDER_VIOLATION", () => {
    const f = postEdit((post) => {
      const rest = post.filter((l) => l !== "Scanned single file");
      return [rest[0], "Scanned single file", ...rest.slice(1)];
    });
    expect(verdictOf(f)).toBe("NOT_CONFIRMED:ORDER_VIOLATION");
  });
});

// ── settle 감시: 늦은 묶음에서 시작한다 ───────────────────────────

describe("settle 감시", () => {
  it("settle 은 늦은 묶음의 완성 시각에서 시작한다: 진단 1100 / 로그 9100 → [9100, 11100]", () => {
    const build: ScanBuild = {
      stdoutPost: [{ messages: [goodNotification()], tMs: 1100 }],
      stderrPost: defaultPostParts(9100),
    };
    const f = scanFacts(build);
    const ev = evidenceOf(f);
    expect(ev.diagnostics.completeAtMs).toBe(1100);
    expect(ev.logBundle.completeAtMs).toBe(9100);
    expect(ev.bothCompleteAtMs).toBe(9100);
    expect(ev.settle).toEqual({ startMs: 9100, endMs: 11100 });
    expect(verdictOf(f)).toBe(OK);
    // 이른 쪽(1100)에서 세어 3100 에 끝낸 감시는 인정하지 않는다
    const early = scanFacts({ ...build, settleEndAtMs: 3100, shutdownAtMs: 3200 });
    expect(verdictOf(early)).toBe("NOT_OBSERVED:SETTLE_WATCH_NOT_CONFIRMED");
    // 반대 순서도 같다: 로그 1100 / 진단 9100 → [9100, 11100]
    const reverse = scanFacts({
      stderrPost: defaultPostParts(1100),
      stdoutPost: [{ messages: [goodNotification()], tMs: 9100 }],
    });
    expect(evidenceOf(reverse).settle).toEqual({ startMs: 9100, endMs: 11100 });
    expect(verdictOf(reverse)).toBe(OK);
  });

  it("경계: 감시 구간이 settleMs 보다 1ms 짧으면 성립하지 않고, 정확히 settleMs 이면 성공이다", () => {
    expect(verdictOf(scanFacts({ settleEndAtMs: 3499 }))).toBe(
      "NOT_OBSERVED:SETTLE_WATCH_NOT_CONFIRMED"
    );
    expect(verdictOf(scanFacts({ settleEndAtMs: 3500, shutdownAtMs: 3500 }))).toBe(OK);
    expect(verdictOf(scanFacts({ settleEndAtMs: 3500, shutdownAtMs: 3499 }))).toBe(
      "NOT_OBSERVED:SETTLE_WATCH_NOT_CONFIRMED"
    );
    expect(verdictOf(scanFacts({ settleEndAtMs: null }))).toBe(
      "NOT_OBSERVED:SETTLE_WATCH_NOT_CONFIRMED"
    );
  });

  it("settle 창 안의 두 번째 스캔 줄 → EXTRA_SCAN (창 안임을 기록한다)", () => {
    const post = POST();
    const at = post.indexOf("Found 1 matches") + 1;
    const f = scanFacts({
      stderrPost: [
        { lines: post.slice(0, at), tMs: 1500 },
        { lines: ["Scanning single file"], tMs: 2000 },
        { lines: post.slice(at), tMs: 2010 },
      ],
    });
    const j = judgeScanResponse(f);
    expect(j.verdict).toBe("NOT_CONFIRMED:EXTRA_SCAN");
    const extra = evidenceOf(f).extras.find((e) => e.kind === "DUPLICATE_LINE");
    expect(extra?.phase).toBe("SETTLE");
    expect(extra?.atMs).toBe(2000);
    // 창이 끝난 뒤의 추가도 실패다
    const lateExtra = scanFacts({
      stderrPost: [
        { lines: post.slice(0, at), tMs: 1500 },
        { lines: ["Scanning single file"], tMs: 3600 },
        { lines: post.slice(at), tMs: 3610 },
      ],
      settleEndAtMs: 3500,
      shutdownAtMs: 3550,
    });
    expect(verdictOf(lateExtra)).toBe("NOT_CONFIRMED:EXTRA_SCAN");
    expect(evidenceOf(lateExtra).extras.find((e) => e.kind === "DUPLICATE_LINE")?.phase).toBe(
      "AFTER_SETTLE"
    );
  });

  it("settle 창 안의 두 번째 진단 알림 → DUPLICATE_DIAGNOSTICS", () => {
    const f = scanFacts({
      stdoutPost: [
        { messages: [goodNotification()], tMs: 1400 },
        { messages: [goodNotification()], tMs: 2500 },
      ],
    });
    expect(verdictOf(f)).toBe("NOT_CONFIRMED:DUPLICATE_DIAGNOSTICS");
    expect(evidenceOf(f).extras.find((e) => e.kind === "DUPLICATE_DIAGNOSTICS")?.phase).toBe(
      "SETTLE"
    );
  });

  it("settle 창 안의 서버 요청, 금지 신호는 실패다 (사후에 드러나면 실시간에 놓친 것으로 적는다)", () => {
    const req = scanFacts({
      stdoutPost: [
        { messages: [goodNotification()], tMs: 1400 },
        {
          messages: [
            {
              jsonrpc: "2.0",
              id: 9,
              method: "window/workDoneProgress/create",
              params: { token: "t" },
            },
          ],
          tMs: 2000,
        },
      ],
    });
    expect(judgeScanResponse(req).status).toBe("NOT_OBSERVED");
    expect(judgeScanResponse(req).reasons).toContain(
      "SERVER_REQUEST_AFTER_DID_OPEN_NOT_CAUGHT_LIVE"
    );
    const post = POST();
    const at = post.indexOf("Found 1 matches") + 1;
    const forbidden = scanFacts({
      stderrPost: [
        { lines: post.slice(0, at), tMs: 1500 },
        { lines: ["Scanning workspace"], tMs: 2000 },
        { lines: post.slice(at), tMs: 2010 },
      ],
    });
    expect(judgeScanResponse(forbidden).status).toBe("NOT_OBSERVED");
    expect(judgeScanResponse(forbidden).reasons).toContain(
      "FORBIDDEN_WORKSPACE_SCAN_NOT_CAUGHT_LIVE"
    );
    // 실시간 중단이 기록돼 있으면 중단 사유가 판정이다
    const aborted = scanFacts(
      {},
      { abort: { condition: "A1", detail: "scanningWorkspace", tMs: 2000 } }
    );
    expect(verdictOf(aborted)).toBe("ABORTED:FORBIDDEN_SIGNAL");
  });

  it("settle 창 안에 프로세스가 끝나면 성공이 아니다", () => {
    const f = scanFacts({}, { exit: { observed: true, code: 0, signal: null, tMs: 2500 } });
    const j = judgeScanResponse(f);
    expect(j.status).toBe("NOT_OBSERVED");
    expect(j.reasons).toContain("EXIT_DURING_SETTLE");
    const cut = scanFacts(
      {},
      { exit: { observed: true, code: 0, signal: null, tMs: 2500 }, trigger: "CHILD_EXITED_EARLY" }
    );
    expect(judgeScanResponse(cut).status).toBe("NOT_OBSERVED");
  });
});

// ── 실시간 추적기와 사후 재해석 ──────────────────────────────────

describe("추적기와 재해석의 일치", () => {
  it("실행기가 기록한 실시간 보기가 재해석과 같으면 비교 결과는 MATCH 다", () => {
    const f = scanFacts();
    expect(f.liveView).not.toBeNull();
    expect(buildScanRecord(f).evidence.tracker_comparison).toBe("MATCH");
    expect(replayLiveView(f)).toEqual(f.liveView);
  });

  it("어느 필드든 다르면 TRACKER_DISAGREEMENT 이고 성공이 아니다", () => {
    const live = scanFacts().liveView;
    expect(live).not.toBeNull();
    const patches: Record<string, unknown>[] = [
      { preOpenEvidence: true },
      { diagnosticsState: "MULTIPLE" },
      { diagnosticsCompleteAtMs: 1401 },
      { logState: "VIOLATED" },
      { logCompleteAtMs: 1499 },
      { bothCompleteAtMs: 1400 },
      { bothCompleteAtMs: null },
    ];
    for (const patch of patches) {
      const f = scanFacts({}, { liveView: { ...(live as object), ...patch } as never });
      const j = judgeScanResponse(f);
      expect(j.verdict, JSON.stringify(patch)).toBe("NOT_OBSERVED:TRACKER_DISAGREEMENT");
      expect(j.reasons.some((r) => r.startsWith("TRACKER_DISAGREEMENT:"))).toBe(true);
      expect(buildScanRecord(f).evidence.tracker_comparison).toBe("DISAGREE");
    }
  });

  it("실시간 보기가 없으면(null) 비교하지 않았다고 적고 판정은 재해석만으로 한다", () => {
    const f = scanFacts({}, { liveView: null });
    expect(verdictOf(f)).toBe(OK);
    expect(buildScanRecord(f).evidence.tracker_comparison).toBe("NOT_PROVIDED");
  });

  it("추적기의 마감·settle 상태: 마감 전에는 만료가 아니고, 묶음이 완성되면 settle 이 끝나기 전까지 진행 중이다", () => {
    const t = new ScanEvidenceTracker({
      workspace: scanLay.workspace,
      expectedTargetUri: TARGET_URI,
      scanMs: 30_000,
      settleMs: 2000,
    });
    expect(t.snapshot(0)).toMatchObject({
      diagnosticsState: "NONE",
      logState: "INCOMPLETE",
      bothCompleteAtMs: null,
      deadlineAtMs: null,
    });
    t.markDidOpenSent(1000);
    expect(t.snapshot(1000).deadlineAtMs).toBe(31_000);
    expect(t.snapshot(31_000).deadlineExpired).toBe(false);
    expect(t.snapshot(31_001).deadlineExpired).toBe(true);
  });
});

// ── 5.2절 표의 모든 행 ────────────────────────────────────────────

describe("계획 5.2절 판정표", () => {
  const A = (condition: "A1" | "A2" | "A3" | "A4" | "A5" | "A6" | "A10") =>
    ({ abort: { condition, detail: "X", tMs: 1200 } }) as Partial<ScanFacts>;
  const rows: [string, ScanFacts, string][] = [
    [
      "진단·로그 둘 다 없이 한도 초과",
      scanFacts(
        { stderrPost: [], stdoutPost: [], shutdownAtMs: 31_100 },
        { trigger: "SCAN_TIMEOUT" }
      ),
      "NOT_CONFIRMED:SCAN_TIMEOUT",
    ],
    [
      "didOpen 뒤 No targets",
      postEdit(
        (p) => [
          p[0],
          "Scanning single file",
          "Scanned single file",
          externalCommandLine(scanLay.workspace, "01.01"),
          "[01.02][WARNING]: No targets to scan! Not scanning anything.",
        ],
        { stdoutPost: [] }
      ),
      "NOT_CONFIRMED:NO_TARGET",
    ],
    [
      "No rules to run",
      postEdit(
        (p) => [
          p[0],
          "Scanning single file",
          "Scanned single file",
          externalCommandLine(scanLay.workspace, "01.01"),
          "[01.02][WARNING]: No rules to run! Not scanning anything.",
        ],
        { stdoutPost: [] }
      ),
      "NOT_CONFIRMED:NO_RULES",
    ],
    [
      "Rules not loaded yet",
      postEdit((p) => [p[0], "Rules not loaded yet, not scanning anything."], { stdoutPost: [] }),
      "NOT_CONFIRMED:RULES_NOT_LOADED",
    ],
    [
      "엔진 매치 0건 + 빈 알림",
      postEdit(
        (p) =>
          p.map((l) =>
            l === "Found 1 matches"
              ? "Found 0 matches"
              : l.replace("Found 1 matches before", "Found 0 matches before")
          ),
        withFrames(publishDiagnostics(TARGET_URI, []))
      ),
      "SCAN_FAILED:NO_MATCH",
    ],
    [
      "알림만 있고 엔진 로그 없음",
      postEdit((p) => p.slice(0, 1)),
      "NOT_CONFIRMED:ENGINE_LOG_MISSING",
    ],
    [
      "엔진 로그만 있고 알림 없음",
      scanFacts({ stdoutPost: [] }),
      "NOT_CONFIRMED:NO_DIAGNOSTIC_NOTIFICATION",
    ],
    [
      "대상 URI 알림 2건",
      scanFacts(withFrames(goodNotification(), goodNotification())),
      "NOT_CONFIRMED:DUPLICATE_DIAGNOSTICS",
    ],
    [
      "진단 2개",
      scanFacts(withFrames(publishDiagnostics(TARGET_URI, [diag(), diag()]))),
      "NOT_CONFIRMED:DUPLICATE_DIAGNOSTICS",
    ],
    [
      "대상이 아닌 URI 만",
      scanFacts(withFrames(publishDiagnostics("file:///C:/x/y.txt", [diag()]))),
      "NOT_CONFIRMED:WRONG_URI",
    ],
    [
      "추가 URI",
      scanFacts(withFrames(goodNotification(), publishDiagnostics("file:///C:/x/y.txt", []))),
      "NOT_CONFIRMED:EXTRA_URI",
    ],
    ["code 가 허용 집합 밖", scanFacts(frameWith({ code: "z" })), "SCAN_FAILED:WRONG_RULE"],
    [
      "message 불일치",
      scanFacts(frameWith({ message: "z" })),
      "SCAN_FAILED:DIAGNOSTIC_FIELD_MISMATCH",
    ],
    [
      "source 불일치",
      scanFacts(frameWith({ source: "z" })),
      "SCAN_FAILED:DIAGNOSTIC_FIELD_MISMATCH",
    ],
    [
      "severity 불일치",
      scanFacts(frameWith({ severity: 1 })),
      "SCAN_FAILED:DIAGNOSTIC_FIELD_MISMATCH",
    ],
    [
      "range 불일치",
      scanFacts(
        frameWith({ range: { start: { line: 1, character: 8 }, end: { line: 1, character: 54 } } })
      ),
      "NOT_CONFIRMED:RANGE_MISMATCH",
    ],
    [
      "Semgrep errors 에 내용",
      postEdit(replaceLine("Semgrep errors:", "Semgrep errors: boom")),
      "SCAN_FAILED:ENGINE_ERROR",
    ],
    [
      "skipped 1",
      postEdit(replaceLine("Semgrep skipped", "Semgrep skipped 1 rules")),
      "SCAN_FAILED:ENGINE_ERROR",
    ],
    ["ERROR 머리말", postEdit(afterFound("[01.30][ERROR]: x")), "SCAN_FAILED:ENGINE_ERROR"],
    [
      "매치 수 불일치",
      postEdit((p) =>
        p.map((l) =>
          l === "Found 1 matches"
            ? "Found 2 matches"
            : l.replace("Found 1 matches before", "Found 2 matches before")
        )
      ),
      "NOT_CONFIRMED:COUNT_MISMATCH",
    ],
    ["didOpen 이 장벽 앞서 나가려 함 (송신 거절)", scanFacts({}, A("A10")), "ABORTED:SEND_REFUSED"],
    ["금지 신호", scanFacts({}, A("A1")), "ABORTED:FORBIDDEN_SIGNAL"],
    ["네트워크 신호", scanFacts({}, A("A2")), "ABORTED:FORBIDDEN_SIGNAL"],
    ["수신기 접촉", scanFacts({}, A("A3")), "ABORTED:FORBIDDEN_SIGNAL"],
    [
      "허용 밖 이미지(git.exe 포함)",
      scanFacts(
        {},
        {
          ...A("A4"),
          live: {
            ...scanFacts().live,
            processes: { ...scanFacts().live.processes, disallowed: ["git.exe"] },
          },
        }
      ),
      "ABORTED:UNEXPECTED_IMAGE",
    ],
    ["감시 폴더 변경(실시간)", scanFacts({}, A("A5")), "ABORTED:FILES_CHANGED"],
    [
      "합성 파일 변경",
      scanFacts(
        {},
        {
          target: {
            sourceSha256: scanFacts().target.sourceSha256,
            afterWriteSha256: scanFacts().target.afterWriteSha256,
            afterRunSha256: "0".repeat(64),
          },
        }
      ),
      "NOT_OBSERVED:FILES_CHANGED",
    ],
    [
      "작업 영역 파일 증가",
      scanFacts(
        {},
        {
          roots: scanFacts().roots.map((r) =>
            r.role === "WORKSPACE" ? { ...r, filesAfter: 2, added: ["x.txt"] } : r
          ),
        }
      ),
      "NOT_OBSERVED:FILES_CHANGED",
    ],
    [
      "작업 영역 파일 감소",
      scanFacts(
        {},
        {
          roots: scanFacts().roots.map((r) =>
            r.role === "WORKSPACE" ? { ...r, filesAfter: 0, removed: ["lsp-scan-1-target.txt"] } : r
          ),
        }
      ),
      "NOT_OBSERVED:FILES_CHANGED",
    ],
    [
      "규칙 폴더 파일 증가",
      scanFacts(
        {},
        {
          roots: scanFacts().roots.map((r) =>
            r.role === "RULES_DIR" ? { ...r, filesAfter: 2, added: ["y.yaml"] } : r
          ),
        }
      ),
      "NOT_OBSERVED:FILES_CHANGED",
    ],
    [
      "홈 밖 쓰기",
      scanFacts(
        {},
        {
          roots: scanFacts().roots.map((r) =>
            r.role === "HOME_DIR" ? { ...r, added: [".git/config"] } : r
          ),
        }
      ),
      "NOT_OBSERVED:FILES_CHANGED",
    ],
    [
      "신원 확인 실패",
      scanFacts({}, { externalReasons: ["ADMIN_IDENTITY_UNVERIFIED"] }),
      "NOT_OBSERVED:ADMIN_IDENTITY_UNVERIFIED",
    ],
    [
      "결합 확인 실패",
      scanFacts({}, { externalReasons: ["ADMIN_BINDING_FAILED"] }),
      "NOT_OBSERVED:ADMIN_BINDING_FAILED",
    ],
    [
      "5157 수집 불가",
      scanFacts({}, { externalReasons: ["ADMIN_OS_BLOCK_UNCONFIRMED"] }),
      "NOT_OBSERVED:ADMIN_OS_BLOCK_UNCONFIRMED",
    ],
    [
      "서버를 띄우지 못함",
      scanFacts(
        { stderrPost: [], stdoutPost: [] },
        {
          refusals: ["PROBE_HASH_MISMATCH"],
          spawn: { attempted: false, ok: false, pid: null },
          sends: [],
        }
      ),
      "NOT_ATTEMPTED:PROBE_HASH_MISMATCH",
    ],
  ];
  for (const [name, facts, expected] of rows) {
    it(`${name} → ${expected}`, () => {
      expect(verdictOf(facts)).toBe(expected);
    });
  }

  it("서버 요청 이상(허용 밖 메서드)은 실시간 중단이 없으면 NOT_OBSERVED 로 사후에 드러난다", () => {
    const f = scanFacts({
      stdoutPost: [
        { messages: [goodNotification()], tMs: 1400 },
        {
          messages: [{ jsonrpc: "2.0", id: 5, method: "workspace/applyEdit", params: {} }],
          tMs: 1410,
        },
      ],
    });
    expect(judgeScanResponse(f).status).toBe("NOT_OBSERVED");
  });
});

// ── D3: 외부 명령 시도 줄 ────────────────────────────────────────

describe("D3 외부 명령 시도 (정확한 모양, 사전 1건 + 사후 1건)", () => {
  const ws = scanLay.workspace;
  const good = (stamp: string) => externalCommandLine(ws, stamp);
  const preSwap = (line: string) => (pre: string[]) =>
    pre.map((l) => (l.includes("Running external command") ? line : l));
  const postSwap = (line: string) => replaceLine("Running external command", line);

  it("기대 모양 2건(사전 1·사후 1)은 성공이고, 줄 사실과 프로세스 생성 사실을 따로 적는다", () => {
    const r = buildScanRecord(scanFacts());
    expect(r.verdict).toBe(OK);
    expect(r.external_command.attempt_lines).toMatchObject({
      pre: 1,
      post: 1,
      shape_ok: true,
      problems: [],
    });
    expect(r.external_command.git_process_creation).toMatchObject({
      established: false,
      basis: "NOT_ESTABLISHED_NO_GIT_IMAGE_SAMPLED",
      observed_images: [],
    });
    // 표본에서 못 본 것을 "생성되지 않았다"로 쓰지 않는다
    expect(JSON.stringify(r.external_command.git_process_creation)).not.toMatch(
      /\babsent\b|not created|never created/i
    );
    expect(r.not_established.git_process_creation).toBe("NOT_ESTABLISHED");
  });

  const shapes: [string, string][] = [
    [
      "다른 명령",
      `[00.83][INFO]: Running external command: "curl" "-C" "c:\\work\\scan-1\\ws" "rev-parse" "--show-toplevel"`,
    ],
    [
      "다른 인자",
      `[00.83][INFO]: Running external command: "git" "--git-dir" "c:\\work\\scan-1\\ws" "rev-parse" "--show-toplevel"`,
    ],
    [
      "다른 경로",
      `[00.83][INFO]: Running external command: "git" "-C" "c:\\elsewhere\\ws" "rev-parse" "--show-toplevel"`,
    ],
    [
      "경로 접두만 같음",
      `[00.83][INFO]: Running external command: "git" "-C" "c:\\work\\scan-1\\ws\\sub" "rev-parse" "--show-toplevel"`,
    ],
    [
      "인자 하나 더",
      `[00.83][INFO]: Running external command: "git" "-C" "c:\\work\\scan-1\\ws" "rev-parse" "--show-toplevel" "--extra"`,
    ],
    [
      "머리말 수준이 다름",
      `[00.83][DEBUG](default): Running external command: "git" "-C" "c:\\work\\scan-1\\ws" "rev-parse" "--show-toplevel"`,
    ],
  ];
  for (const [name, line] of shapes) {
    it(`사전 구간의 ${name} → EXTERNAL_COMMAND_SHAPE`, () => {
      expect(verdictOf(preEdit(preSwap(line)))).toBe("NOT_CONFIRMED:EXTERNAL_COMMAND_SHAPE");
    });
    it(`사후 구간의 ${name} → EXTERNAL_COMMAND_SHAPE`, () => {
      expect(verdictOf(postEdit(postSwap(line.replace("[00.83]", "[01.01]"))))).toBe(
        "NOT_CONFIRMED:EXTERNAL_COMMAND_SHAPE"
      );
    });
  }

  it("세 번째 시도(사후 둘째) → EXTERNAL_COMMAND_COUNT, 사전 둘째도 같다", () => {
    const third = postEdit((post) =>
      post.flatMap((l) => (l.includes("Running external command") ? [l, good("01.01")] : [l]))
    );
    expect(verdictOf(third)).toBe("NOT_CONFIRMED:EXTERNAL_COMMAND_COUNT");
    const preTwo = preEdit((pre) =>
      pre.flatMap((l) => (l.includes("Running external command") ? [l, good("00.83")] : [l]))
    );
    expect(verdictOf(preTwo)).toBe("NOT_CONFIRMED:EXTERNAL_COMMAND_COUNT");
  });

  it("엉뚱한 구간의 시도 → EXTERNAL_COMMAND_COUNT (구간 위반)", () => {
    const wrongPre = preEdit((pre) => {
      const rest = pre.filter((l) => !l.includes("Running external command"));
      const at = rest.indexOf("Scanned open documents");
      return [...rest.slice(0, at + 1), good("00.84"), ...rest.slice(at + 1)];
    });
    expect(verdictOf(wrongPre)).toBe("NOT_CONFIRMED:EXTERNAL_COMMAND_COUNT");
    const wrongPost = postEdit((post) => {
      const rest = post.filter((l) => !l.includes("Running external command"));
      const at = rest.indexOf("[01.02][INFO]: Scanning 1 targets");
      return [...rest.slice(0, at + 1), good("01.03"), ...rest.slice(at + 1)];
    });
    expect(verdictOf(wrongPost)).toBe("NOT_CONFIRMED:EXTERNAL_COMMAND_COUNT");
  });

  it("건수 부족: 사전 구간에 시도 줄이 없거나, 사후 묶음이 완성됐는데 사후 시도 줄이 없으면 COUNT", () => {
    expect(
      verdictOf(preEdit((pre) => pre.filter((l) => !l.includes("Running external command"))))
    ).toBe("NOT_CONFIRMED:EXTERNAL_COMMAND_COUNT");
    expect(verdictOf(postEdit(without("Running external command")))).toBe(
      "NOT_CONFIRMED:EXTERNAL_COMMAND_COUNT"
    );
  });

  it("부분 문자열 흉내(문장 중간의 같은 문구)는 시도 줄이 아니다: 진짜 줄이 없으면 건수 부족이다", () => {
    const look = `[01.01][INFO]: note: Running external command: "git" "-C" "c:\\work\\scan-1\\ws" "rev-parse" "--show-toplevel"`;
    expect(verdictOf(postEdit(postSwap(look)))).toBe("NOT_CONFIRMED:EXTERNAL_COMMAND_COUNT");
  });

  it("드라이브 문자 대소문자와 설정 경로의 구분자 차이는 같은 경로다", () => {
    expect(
      verdictOf(
        preEdit(
          preSwap(
            `[00.83][INFO]: Running external command: "git" "-C" "C:\\work\\scan-1\\ws" "rev-parse" "--show-toplevel"`
          )
        )
      )
    ).toBe(OK);
  });

  it("외부 명령의 오류 출력 줄은 시도 줄이 아니다 → EXTERNAL_COMMAND_OUTPUT", () => {
    expect(
      verdictOf(postEdit(afterFound("[01.30][INFO]: error output: fatal: not a git repository")))
    ).toBe("NOT_CONFIRMED:EXTERNAL_COMMAND_OUTPUT");
  });

  it("git 이미지가 관측되면 기존 중단 정책이 적용된다: 허용 목록에 git 은 없다", () => {
    for (const image of ALLOWED_IMAGES) expect(image.toLowerCase()).not.toContain("git");
    const seen = scanFacts(
      {},
      {
        live: {
          ...scanFacts().live,
          processes: {
            ...scanFacts().live.processes,
            imagesSeen: ["git.exe", "semgrep.exe"],
            disallowed: ["git.exe"],
          },
        },
      }
    );
    const j = judgeScanResponse(seen);
    expect(j.status).toBe("NOT_OBSERVED");
    expect(j.reasons).toContain("DISALLOWED_IMAGE_SEEN");
    const r = buildScanRecord(seen);
    expect(r.external_command.git_process_creation.established).toBe(true);
    expect(r.external_command.git_process_creation.basis).toBe("GIT_IMAGE_OBSERVED");
    expect(r.external_command.git_process_creation.observed_images).toEqual(["git.exe"]);
    // 실시간 중단이 있었다면 그 사유가 판정이다
    const aborted = scanFacts(
      {},
      { abort: { condition: "A4", detail: "git.exe", tMs: 1300 }, live: seen.live }
    );
    expect(verdictOf(aborted)).toBe("ABORTED:UNEXPECTED_IMAGE");
  });
});

// ── 송신 사실 ─────────────────────────────────────────────────────

describe("송신 사실 (C05)", () => {
  const sends = (fn: (s: ScanFacts["sends"]) => ScanFacts["sends"]) =>
    scanFacts({}, { sends: fn(scanFacts().sends) });
  it("didOpen 이 둘이면 성공이 아니다", () => {
    const f = sends((s) => [...s.slice(0, 3), s[2], ...s.slice(3)]);
    const j = judgeScanResponse(f);
    expect(j.status).toBe("NOT_OBSERVED");
    expect(
      j.reasons.some((r) => r.startsWith("DID_OPEN_SENDS_2") || r === "SEND_ORDER_UNEXPECTED")
    ).toBe(true);
  });
  it("didOpen 이 장벽 끝 표시보다 앞서면 성공이 아니다", () => {
    const f = scanFacts({ barrierDoneAtMs: 1200 });
    expect(judgeScanResponse(f).reasons).toContain("DID_OPEN_BEFORE_BARRIER");
    expect(judgeScanResponse(f).status).toBe("NOT_OBSERVED");
  });
  it("보낸 uri·본문 해시·languageId·version 이 기대와 다르면 성공이 아니다", () => {
    const patch = (over: Record<string, unknown>) =>
      sends((s) =>
        s.map((x) =>
          x.label === "didOpen"
            ? { ...x, didOpen: { ...(x.didOpen as object), ...over } as never }
            : x
        )
      );
    expect(verdictOf(patch({ uri: `${TARGET_URI}x` }))).toBe(
      "NOT_OBSERVED:DID_OPEN_URI_UNEXPECTED"
    );
    expect(verdictOf(patch({ textSha256: "0".repeat(64) }))).toBe(
      "NOT_OBSERVED:DID_OPEN_TEXT_UNEXPECTED"
    );
    expect(verdictOf(patch({ languageId: "python" }))).toBe(
      "NOT_OBSERVED:DID_OPEN_PARAMS_UNEXPECTED"
    );
    expect(verdictOf(patch({ version: 2 }))).toBe("NOT_OBSERVED:DID_OPEN_PARAMS_UNEXPECTED");
    const none = sends((s) => s.map((x) => (x.label === "didOpen" ? { ...x, didOpen: null } : x)));
    expect(verdictOf(none)).toBe("NOT_OBSERVED:DID_OPEN_PARAMS_UNEXPECTED");
  });
  it("허용 밖 순서·라벨은 성공이 아니다", () => {
    const f = sends((s) => [s[0], s[2], s[1], ...s.slice(3)]);
    expect(judgeScanResponse(f).status).toBe("NOT_OBSERVED");
    const extra = sends((s) => [
      ...s.slice(0, 3),
      {
        label: "didSave" as never,
        tMs: 1100,
        ok: true,
        stderrBytesAtSend: 1,
        stdoutBytesAtSend: 1,
      },
      ...s.slice(3),
    ]);
    expect(judgeScanResponse(extra).reasons).toContain("SEND_ORDER_UNEXPECTED");
  });
  it("쓰기 실패한 didOpen 은 성공이 아니다", () => {
    const f = sends((s) => s.map((x) => (x.label === "didOpen" ? { ...x, ok: false } : x)));
    expect(judgeScanResponse(f).reasons).toContain("DID_OPEN_WRITE_FAILED");
  });
});
