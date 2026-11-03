import { describe, expect, it } from "vitest";
import { MAX_PROGRESS_CREATE } from "./lsp-rules";
import {
  ScanLiveWatch,
  ScanStderrWatcher,
  ScanStdoutTracker,
  evaluateScanBarrier,
  runScanWatchScript,
  scanHexToBytes,
  scanWatchedViolation,
  type ScanAbort,
  type ScanWatchScript,
} from "./lsp-scan-watch";
import { analyzeScanProgress } from "./lsp-scan-progress";
import { analyzeScanLog } from "./scan-log";
import { chunked, happyWatchScript, toHex, watchConfig } from "./testing/scan-watch-cases";
import {
  bytesOf,
  externalCommandLine,
  frames,
  goodNotification,
  openDocumentsProgress,
  progressCreate,
  publishDiagnostics,
  refreshProgress,
  RULES_REFRESHED,
  scanLay,
  scanPostOpenLines,
  scanPreOpenLines,
  scanInitResponse,
} from "./testing/scan-fixtures";
import { preambleLines } from "./testing/rules-fixtures";

const preambleBytes = (): Uint8Array => bytesOf(preambleLines(scanLay.rulesDir));
const barrierBytes = (): Uint8Array =>
  bytesOf(scanPreOpenLines()).subarray(preambleBytes().byteLength);

function stderrWatcher(): ScanStderrWatcher {
  return new ScanStderrWatcher({
    workspace: scanLay.workspace,
    probePath: watchConfig().probePath,
  });
}
function pushAll(w: ScanStderrWatcher, bytes: Uint8Array, size?: number): ScanAbort | null {
  let hit: ScanAbort | null = null;
  const step = size ?? bytes.byteLength;
  for (let at = 0; at < bytes.byteLength; at += step) {
    hit ??= w.push(bytes.subarray(at, at + step));
  }
  return hit;
}

// ── stdout 추적기: 메시지 단위 중단 ─────────────────────────────────

describe("ScanStdoutTracker — 메시지 단위 중단", () => {
  it("이 관측의 초기화 응답 id(lsp-scan-init-1)로 초기화 응답을 알아본다", () => {
    const t = new ScanStdoutTracker();
    expect(t.onMessage(scanInitResponse())).toBeNull();
    expect(t.analysis.initMessage).not.toBeNull();
    expect(t.analysis.unmatchedResponses).toBe(0);
    t.onMessage(scanInitResponse());
    expect(t.analysis.initDuplicate).toBe(true);
  });

  it("initialized 전의 rulesRefreshed·진단 알림은 A1이다", () => {
    expect(new ScanStdoutTracker().onMessage(RULES_REFRESHED)).toEqual({
      condition: "A1",
      detail: "PRE_INITIALIZED:rulesRefreshed",
    });
    expect(new ScanStdoutTracker().onMessage(goodNotification())).toEqual({
      condition: "A1",
      detail: "PRE_INITIALIZED:publishDiagnostics",
    });
  });

  it("initialized 뒤 didOpen 전의 진단 알림은 중단이 아니다(사전 증거로 기록되고 판정이 PRE_OPEN_EVIDENCE 로 본다)", () => {
    const t = new ScanStdoutTracker();
    t.initializedSent = true;
    expect(t.onMessage(goodNotification())).toBeNull();
    expect(t.preOpenDiagnostics).toBe(1);
  });

  it("didOpen 뒤의 진단 알림은 몇 건이든 중단이 아니다(중복·다른 URI 는 판정이 가른다)", () => {
    const t = new ScanStdoutTracker();
    t.initializedSent = true;
    t.didOpenSent = true;
    expect(t.onMessage(goodNotification())).toBeNull();
    expect(t.onMessage(goodNotification())).toBeNull();
    expect(t.onMessage(publishDiagnostics("file:///other", []))).toBeNull();
  });

  it("서버 요청: 허용 진행 요청은 2건까지, 3건째·모양 불일치·initialized 전은 A6", () => {
    const t = new ScanStdoutTracker();
    expect(t.onMessage(progressCreate(1, "a"))).toEqual({
      condition: "A6",
      detail: "REQUEST_BEFORE_INITIALIZED",
    });
    const u = new ScanStdoutTracker();
    u.initializedSent = true;
    expect(u.onMessage(progressCreate(1, "a"))).toBeNull();
    expect(u.onMessage(progressCreate(2, "b"))).toBeNull();
    expect(MAX_PROGRESS_CREATE).toBe(2);
    expect(u.onMessage(progressCreate(3, "c"))).toEqual({
      condition: "A6",
      detail: "TOO_MANY_PROGRESS_REQUESTS",
    });
    const bad = new ScanStdoutTracker();
    bad.initializedSent = true;
    expect(
      bad.onMessage({ jsonrpc: "2.0", id: 9, method: "workspace/configuration", params: {} })
        ?.condition
    ).toBe("A6");
    const malformed = new ScanStdoutTracker();
    malformed.initializedSent = true;
    expect(
      malformed.onMessage({
        jsonrpc: "2.0",
        id: 9,
        method: "window/workDoneProgress/create",
        params: {},
      })?.condition
    ).toBe("A6");
  });

  it("didOpen 뒤에 온 서버 요청은 올바른 진행 요청이어도 A6 이다", () => {
    const t = new ScanStdoutTracker();
    t.initializedSent = true;
    t.didOpenSent = true;
    expect(t.onMessage(progressCreate(1, "late"))).toEqual({
      condition: "A6",
      detail: "REQUEST_AFTER_DID_OPEN",
    });
  });
});

// ── stderr 감시기 ───────────────────────────────────────────────────

describe("ScanStderrWatcher — 장벽 줄과 중단", () => {
  it("정상 서두·장벽 줄은 중단하지 않고 장벽 상태를 깨끗하게 채운다", () => {
    const w = stderrWatcher();
    expect(w.push(preambleBytes())).toBeNull();
    w.markInitializedSent();
    expect(w.push(barrierBytes())).toBeNull();
    expect(w.barrier.scannedOpenDocumentsSeen).toBe(true);
    expect(w.barrier.problems).toEqual([]);
    expect(w.barrier.clean).toBe(true);
  });

  it("청크를 어떻게 쪼개도(1바이트·7바이트·한 덩어리) 같은 장벽 상태와 같은 중단 결과다", () => {
    const states = [undefined, 1, 7, 64].map((size) => {
      const w = stderrWatcher();
      pushAll(w, preambleBytes(), size);
      w.markInitializedSent();
      const hit = pushAll(w, barrierBytes(), size);
      return { hit, barrier: w.barrier, checked: w.checkedBytes };
    });
    for (const s of states) expect(s).toEqual(states[0]);
    expect(states[0].barrier.clean).toBe(true);
  });

  it("장벽 줄이 아직 덜 왔으면 scannedOpenDocumentsSeen 은 false 다(줄이 끝나야 센다)", () => {
    const w = stderrWatcher();
    w.push(preambleBytes());
    w.markInitializedSent();
    const text = new TextDecoder().decode(barrierBytes());
    const cut = text.lastIndexOf("Scanned open documents");
    w.push(new TextEncoder().encode(text.slice(0, cut + "Scanned open documents".length)));
    expect(w.barrier.scannedOpenDocumentsSeen).toBe(false);
    w.push(new TextEncoder().encode(text.slice(cut + "Scanned open documents".length)));
    expect(w.barrier.scannedOpenDocumentsSeen).toBe(true);
  });

  it("initialized 전에 나온 새로고침·열린 문서 스캔 줄은 A1 이다", () => {
    const w = stderrWatcher();
    expect(w.push(bytesOf(["Refreshing rules"]))).toEqual({
      condition: "A1",
      detail: "PRE_INITIALIZED:refreshingRules",
    });
  });

  it("작업 영역 스캔 신호는 A1, 레지스트리·내려받기·토큰·설정 파일 신호는 A2 이다", () => {
    const cases: [string, ScanAbort][] = [
      ["Scanning workspace", { condition: "A1", detail: "scanningWorkspace" }],
      ["Scanning workspace complete", { condition: "A1", detail: "scanningWorkspaceComplete" }],
      [
        "[00.9][INFO]: No rules source specified, using auto",
        { condition: "A2", detail: "usingAuto" },
      ],
      [
        "[00.9][INFO]: Found API token in environment variables",
        { condition: "A2", detail: "tokenFound" },
      ],
      [
        "[00.9][INFO]: Settings file found at C:\\x",
        { condition: "A2", detail: "settingsFileFound" },
      ],
    ];
    for (const [line, expected] of cases) {
      const w = stderrWatcher();
      w.markInitializedSent();
      expect(w.push(bytesOf([line])), line).toEqual(expected);
    }
  });

  it("download·registry 문구는 청크 경계에 걸쳐도 A2 이다", () => {
    const w = stderrWatcher();
    w.markInitializedSent();
    expect(w.push(new TextEncoder().encode("[00.9][DEBUG](default): down"))).toBeNull();
    expect(w.push(new TextEncoder().encode("load of x\r\n"))?.condition).toBe("A2");
    const r = stderrWatcher();
    r.markInitializedSent();
    expect(pushAll(r, bytesOf(["trying registry x"]), 1)?.condition).toBe("A2");
  });

  it("처음 찾은 중단 사유만 돌려주고, 이후 청크는 새 중단을 만들지 않는다(hit 는 유지)", () => {
    const w = stderrWatcher();
    w.markInitializedSent();
    const first = w.push(bytesOf(["Scanning workspace"]));
    expect(first).not.toBeNull();
    expect(w.push(bytesOf(["[00.9][INFO]: using auto"]))).toBeNull();
    expect(w.hit).toEqual(first);
  });

  it("초기화 오류 로그 문구는 중단은 아니고 initErrorLogged 로 알린다", () => {
    const w = stderrWatcher();
    expect(w.push(bytesOf(["[00.2][ERROR]: Error initializing server: boom"]))).toBeNull();
    expect(w.initErrorLogged).toBe(true);
  });

  it("ERROR 머리말·두 번째 스캔 줄·두 번째 진단 대응 줄은 중단이 아니다(판정이 SCAN_FAILED·EXTRA_SCAN 으로 가른다)", () => {
    const w = stderrWatcher();
    w.push(preambleBytes());
    w.markInitializedSent();
    w.push(barrierBytes());
    w.markDidOpenSent();
    expect(w.push(bytesOf(["[01.0][ERROR]: boom"]))).toBeNull();
    expect(w.push(bytesOf(["Scanning single file"]))).toBeNull();
    expect(w.push(bytesOf(["Scanning single file"]))).toBeNull();
    expect(w.push(bytesOf(["Scanning open documents"]))).toBeNull();
  });
});

describe("ScanStderrWatcher — 외부 명령 시도 줄 (결정 D3)", () => {
  function upToBarrierLines(extraBeforeScanned?: string[]): string[] {
    const lines = scanPreOpenLines();
    if (extraBeforeScanned === undefined) return lines;
    const at = lines.indexOf("Scanned open documents");
    return [...lines.slice(0, at), ...extraBeforeScanned, ...lines.slice(at)];
  }
  function runLines(lines: string[], thenPost: string[] = []): ScanAbort | null {
    const w = stderrWatcher();
    let hit: ScanAbort | null = null;
    const pre = bytesOf(lines);
    const preambleLen = preambleBytes().byteLength;
    hit ??= w.push(pre.subarray(0, preambleLen));
    w.markInitializedSent();
    hit ??= w.push(pre.subarray(preambleLen));
    if (thenPost.length > 0) {
      w.markDidOpenSent();
      hit ??= w.push(bytesOf(thenPost));
    }
    return hit;
  }

  it("모양이 맞는 사전 1건 + 사후 1건은 중단이 아니다", () => {
    expect(runLines(scanPreOpenLines(), scanPostOpenLines())).toBeNull();
  });

  it("다른 명령·다른 인자·다른 경로·다른 머리말 수준은 모두 A1 EXTERNAL_COMMAND_SHAPE", () => {
    const variants: [string, string][] = [
      [
        "다른 명령",
        '[00.83][INFO]: Running external command: "curl" "-C" "X" "rev-parse" "--show-toplevel"',
      ],
      [
        "다른 인자",
        `[00.83][INFO]: Running external command: "git" "-C" "${scanLay.workspace.replace(/\//g, "\\")}" "status" "--short"`,
      ],
      [
        "다른 경로",
        '[00.83][INFO]: Running external command: "git" "-C" "c:\\elsewhere" "rev-parse" "--show-toplevel"',
      ],
      ["DEBUG 수준", externalCommandLine(scanLay.workspace).replace("[INFO]", "[DEBUG](default)")],
    ];
    for (const [name, line] of variants) {
      const lines = scanPreOpenLines().map((l) =>
        l === externalCommandLine(scanLay.workspace) ? line : l
      );
      const hit = runLines(lines);
      expect(hit?.condition, name).toBe("A1");
      expect(hit?.detail, name).toMatch(/^EXTERNAL_COMMAND_SHAPE:/);
    }
  });

  it("같은 구간의 두 번째 시도 줄, 구간 밖 시도 줄은 A1 EXTERNAL_COMMAND_COUNT", () => {
    const second = runLines(upToBarrierLines([externalCommandLine(scanLay.workspace, "00.84")]));
    expect(second).toEqual({ condition: "A1", detail: "EXTERNAL_COMMAND_COUNT" });
    const post = scanPostOpenLines();
    const atTargets = post.indexOf("[01.02][INFO]: Scanning 1 targets");
    const twoInScan = [
      ...post.slice(0, atTargets),
      externalCommandLine(scanLay.workspace, "01.015"),
      ...post.slice(atTargets),
    ];
    expect(runLines(scanPreOpenLines(), twoInScan)?.detail).toBe("EXTERNAL_COMMAND_COUNT");
    const late = [...post, externalCommandLine(scanLay.workspace, "01.5")];
    expect(runLines(scanPreOpenLines(), late)?.detail).toBe("EXTERNAL_COMMAND_COUNT");
  });

  it("부족(사후 시도 줄이 없음)은 실시간 중단이 아니다 — 부족 판단은 판정 모듈의 몫이다", () => {
    const noExternal = scanPostOpenLines().filter((l) => !l.includes("Running external command"));
    expect(runLines(scanPreOpenLines(), noExternal)).toBeNull();
  });
});

// ── 장벽 평가 ───────────────────────────────────────────────────────

describe("evaluateScanBarrier — didOpen 을 보내도 되는 장벽인가", () => {
  const analyze = (lines: string[]) =>
    analyzeScanLog(bytesOf(lines), { workspace: scanLay.workspace, didOpenOffset: null });
  const probe = watchConfig().probePath;
  /** 완전한 초기 진행 묶음(두 수명주기 + rulesRefreshed)의 분석: stderr 쪽 평가만 따로 보려고 stdout 쪽은 정상으로 둔다. */
  const complete = analyzeScanProgress(
    [...refreshProgress(), RULES_REFRESHED, ...openDocumentsProgress()].map((message, index) => ({
      index,
      startByte: null,
      endByte: null,
      message,
    }))
  );

  it("정상 줄이면 ready·clean 이다", () => {
    const s = evaluateScanBarrier(analyze(scanPreOpenLines()), 1, probe, complete);
    expect(s).toEqual({
      rulesRefreshedSeen: true,
      scannedOpenDocumentsSeen: true,
      progressState: "COMPLETE",
      ready: true,
      clean: true,
      problems: [],
    });
  });

  it("stdout rulesRefreshed 가 없으면 ready 가 아니다", () => {
    const s = evaluateScanBarrier(analyze(scanPreOpenLines()), 0, probe, complete);
    expect(s.ready).toBe(false);
    expect(s.clean).toBe(false);
  });

  const cases: [string, (l: string[]) => string[], RegExp][] = [
    [
      "Got 1 errors",
      (l) => l.map((x) => x.replace("Got 0 errors", "Got 1 errors")),
      /GOT_ERRORS_NONZERO/,
    ],
    [
      "프로브가 아닌 다른 파일 로딩",
      (l) => l.map((x) => x.replace("lsp-rules-1-probe.yaml", "other.yaml")),
      /LOADING_PATH_UNEXPECTED/,
    ],
    ["Rules refreshed 중복", (l) => [...l, "Rules refreshed"], /rulesRefreshed_COUNT/],
    ["No targets 줄 없음", (l) => l.filter((x) => !x.includes("No targets")), /NO_TARGETS_COUNT_0/],
    [
      "Done loading 없음",
      (l) => l.filter((x) => !x.includes("Done loading")),
      /DONE_LOADING_COUNT_0/,
    ],
    ["사전 스캔 증거 줄", (l) => [...l, "Scanning single file"], /PRE_OPEN_EVIDENCE/],
    ["오류 머리말", (l) => [...l, "[00.9][ERROR]: boom"], /PRE_ERROR_RECORD/],
    ["예상 밖 경고", (l) => [...l, "[00.9][WARNING]: something else"], /PRE_UNEXPECTED_WARNING/],
  ];
  for (const [name, edit, expected] of cases) {
    it(`${name} → clean 이 아니다`, () => {
      const s = evaluateScanBarrier(analyze(edit(scanPreOpenLines())), 1, probe, complete);
      expect(s.clean, name).toBe(false);
      expect(s.problems.join(",")).toMatch(expected);
    });
  }

  it("프로브 경로를 모르면 로딩 경로를 확인할 수 없으므로 clean 이 아니다", () => {
    const s = evaluateScanBarrier(analyze(scanPreOpenLines()), 1, null, complete);
    expect(s.clean).toBe(false);
    expect(s.problems).toContain("LOADING_PATH_UNVERIFIABLE");
  });
});

// ── 감시 폴더 위반 ──────────────────────────────────────────────────

describe("scanWatchedViolation — 감시 폴더 안의 금지된 변경", () => {
  it("작업 영역은 합성 대상 파일 하나만(대소문자 무시), 규칙 폴더는 프로브 하나만, 홈은 지문 폴더 아래만", () => {
    expect(scanWatchedViolation("WORKSPACE", "lsp-scan-1-target.txt")).toBe(false);
    expect(scanWatchedViolation("WORKSPACE", "LSP-SCAN-1-TARGET.TXT")).toBe(false);
    expect(scanWatchedViolation("WORKSPACE", "other.txt")).toBe(true);
    expect(scanWatchedViolation("WORKSPACE", ".git/config")).toBe(true);
    expect(scanWatchedViolation("RULES_DIR", "lsp-rules-1-probe.yaml")).toBe(false);
    expect(scanWatchedViolation("RULES_DIR", "second.yaml")).toBe(true);
    expect(
      scanWatchedViolation("HOME_DIR", ".semgrep/cache/fingerprinted_ignored_findings/ws.txt")
    ).toBe(false);
    expect(scanWatchedViolation("HOME_DIR", "settings.yml")).toBe(true);
  });
});

// ── 결합 감시기: 도착 순서와 settle ──────────────────────────────────

function finalSnapshot(script: ScanWatchScript) {
  const t = runScanWatchScript(script);
  return t.final.snapshot;
}

describe("도착 순서 행렬 — 증거가 완전하고 일관되면 같은 결과다 (브리프 4절)", () => {
  const base = finalSnapshot(happyWatchScript());
  const strip = (s: typeof base) => ({
    preOpenEvidence: s.preOpenEvidence,
    diagnosticsState: s.diagnosticsState,
    logState: s.logState,
    violations: s.violations,
  });

  it("기준 경로: 두 묶음이 완성되고 사전 증거와 위반이 없다", () => {
    expect(base.diagnosticsState).toBe("ONE");
    expect(base.logState).toBe("COMPLETE");
    expect(base.preOpenEvidence).toBe(false);
    expect(base.violations).toEqual([]);
    expect(base.diagnosticsCompleteAtMs).toBe(1400);
    expect(base.logCompleteAtMs).toBe(1500);
    expect(base.bothCompleteAtMs).toBe(1500);
    expect([base.settleStartMs, base.settleEndMs]).toEqual([1500, 3500]);
  });

  it("stdout 진단이 먼저 / stderr 로그가 먼저 / 동시 도착이어도 판단에 쓰는 값이 같다 (시각 필드만 다르다)", () => {
    const stdoutFirst = finalSnapshot(happyWatchScript({ diagAtMs: 1100, logAtMs: 1500 }));
    const stderrFirst = finalSnapshot(
      happyWatchScript({ diagAtMs: 1500, logAtMs: 1100, logFirst: true })
    );
    const same = finalSnapshot(happyWatchScript({ diagAtMs: 1300, logAtMs: 1300 }));
    for (const s of [stdoutFirst, stderrFirst, same]) expect(strip(s)).toEqual(strip(base));
    expect(stdoutFirst.bothCompleteAtMs).toBe(1500);
    expect(stderrFirst.bothCompleteAtMs).toBe(1500);
    expect(same.bothCompleteAtMs).toBe(1300);
  });

  it("청크를 1바이트·3바이트·13바이트로 쪼개도 같은 결과다", () => {
    for (const chunkSize of [1, 3, 13, 200]) {
      expect(strip(finalSnapshot(happyWatchScript({ chunkSize }))), String(chunkSize)).toEqual(
        strip(base)
      );
    }
  });

  it("무작위 청크 분할(고정 시드)에서도 같은 결과다", () => {
    let seed = 12345;
    const rnd = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed;
    };
    const script = happyWatchScript();
    const split: ScanWatchScript = {
      config: script.config,
      events: script.events.flatMap((e) => {
        if (e.op !== "stdout" && e.op !== "stderr") return [e];
        const bytes = scanHexToBytes(e.hex);
        const out: typeof script.events = [];
        let at = 0;
        while (at < bytes.byteLength) {
          const n = 1 + (rnd() % 29);
          out.push({ op: e.op, hex: toHex(bytes.subarray(at, at + n)), tMs: e.tMs });
          at += n;
        }
        return out;
      }),
    };
    expect(strip(finalSnapshot(split))).toEqual(strip(base));
  });

  it("중단 결정도 도착 순서에 따라 바뀌지 않는다 (금지 신호가 어느 쪽에서 먼저 와도 중단은 일어난다)", () => {
    const withRequest = (logFirst: boolean) => {
      const s = happyWatchScript({
        logFirst,
        postMessages: [goodNotification(), progressCreate(1, "late")],
      });
      return runScanWatchScript(s).steps.some((x) => x.abort !== null);
    };
    expect(withRequest(false)).toBe(true);
    expect(withRequest(true)).toBe(true);
  });
});

describe("settle 은 늦은 묶음의 완성 시각에서 시작한다", () => {
  it("진단 t=1000, 로그 완성 t=9000 → 창은 [9000, 11000] (1000 에서 거꾸로 세지 않는다)", () => {
    const s = finalSnapshot(happyWatchScript({ diagAtMs: 1000, logAtMs: 9000, didOpenAtMs: 900 }));
    expect([s.settleStartMs, s.settleEndMs]).toEqual([9000, 11000]);
    expect(s.bothCompleteAtMs).toBe(9000);
  });

  it("로그가 먼저(t=1000)이고 진단이 늦으면(t=9000) 그 늦은 쪽이 기준이다", () => {
    const s = finalSnapshot(
      happyWatchScript({ diagAtMs: 9000, logAtMs: 1000, logFirst: true, didOpenAtMs: 900 })
    );
    expect([s.settleStartMs, s.settleEndMs]).toEqual([9000, 11000]);
  });
});

describe("한쪽 증거만 있거나 사전 증거가 있으면 완성이 아니다", () => {
  it("진단만 있으면 로그 묶음은 INCOMPLETE, 완성 시각은 null", () => {
    const s = happyWatchScript();
    const onlyDiag: ScanWatchScript = {
      ...s,
      events: s.events.filter((e) => !(e.op === "stderr" && e.tMs >= 1500)),
    };
    const snap = finalSnapshot(onlyDiag);
    expect(snap.diagnosticsState).toBe("ONE");
    expect(snap.logState).toBe("INCOMPLETE");
    expect(snap.bothCompleteAtMs).toBeNull();
  });

  it("로그만 있으면 진단은 NONE", () => {
    const s = happyWatchScript();
    const onlyLog: ScanWatchScript = {
      ...s,
      events: s.events.filter((e) => !(e.op === "stdout" && e.tMs === 1400)),
    };
    const snap = finalSnapshot(onlyLog);
    expect(snap.diagnosticsState).toBe("NONE");
    expect(snap.logState).toBe("COMPLETE");
    expect(snap.bothCompleteAtMs).toBeNull();
  });

  it("didOpen 전에 온 스캔 증거 줄은 사전 증거이고 이번 스캔의 증거가 아니다", () => {
    const s = happyWatchScript();
    const idx = s.events.findIndex((e) => e.op === "barrierDone");
    const events = [...s.events];
    events.splice(idx, 0, {
      op: "stderr",
      hex: toHex(bytesOf(["Scanning single file"])),
      tMs: 690,
    });
    const snap = finalSnapshot({ ...s, events });
    expect(snap.preOpenEvidence).toBe(true);
    expect(snap.violations).toContain("PRE_OPEN_EVIDENCE");
  });

  it("didOpen 전에 온 진단 프레임도 사전 증거다(재사용하지 않는다)", () => {
    const s = happyWatchScript();
    const idx = s.events.findIndex((e) => e.op === "barrierDone");
    const events = [...s.events];
    events.splice(idx, 0, { op: "stdout", hex: toHex(frames([goodNotification()])), tMs: 690 });
    const snap = finalSnapshot({ ...s, events });
    expect(snap.preOpenEvidence).toBe(true);
    // 사후의 정상 진단은 따로 세어진다: 사전 프레임이 사후 묶음으로 새지 않는다
    expect(snap.diagnosticsState).toBe("ONE");
  });
});

describe("ScanLiveWatch — 실행기가 쓰는 결합 감시기", () => {
  function feed(w: ScanLiveWatch, script: ScanWatchScript): void {
    for (const e of script.events) {
      if (e.op === "stdout") w.feedStdout(scanHexToBytes(e.hex), e.tMs);
      else if (e.op === "stderr") w.feedStderr(scanHexToBytes(e.hex), e.tMs);
      else if (e.op === "initializedSent") w.markInitializedSent();
      else if (e.op === "barrierDone") w.markBarrierDone(e.tMs);
      else if (e.op === "didOpenSent") w.markDidOpenSent(e.tMs);
    }
  }

  it("barrierReady 는 stdout rulesRefreshed 와 stderr Scanned open documents 가 모두 있어야 true 다", () => {
    const w = new ScanLiveWatch(watchConfig());
    const s = happyWatchScript();
    const cut = s.events.findIndex((e) => e.op === "barrierDone");
    for (const e of s.events.slice(0, cut)) {
      if (e.op === "stdout") w.feedStdout(scanHexToBytes(e.hex), e.tMs);
      else if (e.op === "stderr") w.feedStderr(scanHexToBytes(e.hex), e.tMs);
      else if (e.op === "initializedSent") w.markInitializedSent();
      if (e.op === "stdout" && e.tMs === 200) {
        expect(w.barrierStatus().ready).toBe(false);
        expect(w.barrierReady()).toBe(false);
      }
    }
    expect(w.barrierReady()).toBe(true);
    expect(w.barrierStatus()).toMatchObject({ ready: true, clean: true, problems: [] });
    // 양쪽 절반이 모두 있어야 한다: stdout 의 rulesRefreshed 만, 또는 stderr 의 Scanned open documents 만으로는 아니다
    const stdoutOnly = new ScanLiveWatch(watchConfig());
    const stderrOnly = new ScanLiveWatch(watchConfig());
    for (const e of s.events.slice(0, cut)) {
      if (e.op === "initializedSent") {
        stdoutOnly.markInitializedSent();
        stderrOnly.markInitializedSent();
      } else if (e.op === "stdout") stdoutOnly.feedStdout(scanHexToBytes(e.hex), e.tMs);
      else if (e.op === "stderr") stderrOnly.feedStderr(scanHexToBytes(e.hex), e.tMs);
    }
    expect(stdoutOnly.barrierReady()).toBe(false);
    expect(stderrOnly.barrierReady()).toBe(false);
  });

  it("마감과 settle 만료는 주어진 시각(nowMs)으로 따진다", () => {
    const w = new ScanLiveWatch(watchConfig());
    const s = happyWatchScript({ diagAtMs: 1400, logAtMs: 50_000 });
    const noLog: ScanWatchScript = {
      ...s,
      events: s.events.filter((e) => !(e.op === "stderr" && e.tMs >= 50_000)),
    };
    feed(w, noLog);
    expect(w.snapshot(1000 + 29_999).deadlineExpired).toBe(false);
    expect(w.snapshot(1000 + 30_001).deadlineExpired).toBe(true);
    const done = new ScanLiveWatch(watchConfig());
    feed(done, happyWatchScript());
    expect(done.snapshot(3499).settleElapsed).toBe(false);
    expect(done.snapshot(3500).settleElapsed).toBe(true);
    expect(done.snapshot(10 ** 9).deadlineExpired).toBe(false); // 완성된 뒤에는 마감 만료가 아니다
  });

  it("스트림별로 받은 바이트 수는 증거 입력의 길이와 같다(송신 위치 표시의 기준)", () => {
    const w = new ScanLiveWatch(watchConfig());
    feed(w, happyWatchScript());
    const input = w.toEvidenceInput();
    expect(w.stdoutBytes).toBe(input.stdout.byteLength);
    expect(w.stderrBytes).toBe(input.stderr.byteLength);
    expect(input.didOpen).toMatchObject({ tMs: 1000 });
  });

  it("프레임 오류는 한 번 보고하고 이후 stdout 은 풀지 않되 바이트는 계속 남긴다", () => {
    const w = new ScanLiveWatch(watchConfig());
    const r = w.feedStdout(new TextEncoder().encode("Content-Length: x\r\n\r\n{}"), 10);
    expect(r.frameError).not.toBeNull();
    const r2 = w.feedStdout(new TextEncoder().encode("more"), 11);
    expect(r2.frameError).toBeNull();
    expect(w.stdoutBytes).toBeGreaterThan(20);
  });
});

// ── JSON 대본 ───────────────────────────────────────────────────────

describe("runScanWatchScript — JSON 입력·JSON 출력 (골든 대조용)", () => {
  it("출력은 순수 JSON 값이다 (직렬화·역직렬화해도 같다)", () => {
    const t = runScanWatchScript(happyWatchScript());
    expect(JSON.parse(JSON.stringify(t))).toEqual(t);
    expect(t.steps).toHaveLength(happyWatchScript().events.length);
  });

  it("같은 대본이면 같은 출력이다(시계·무작위 없음)", () => {
    expect(runScanWatchScript(happyWatchScript())).toEqual(runScanWatchScript(happyWatchScript()));
  });

  it("단계마다 이벤트 이름·중단·장벽 상태·스냅샷을 싣는다", () => {
    const t = runScanWatchScript(happyWatchScript());
    const step = t.steps[t.steps.length - 1];
    expect(Object.keys(step).sort()).toEqual(
      ["abort", "barrier", "frameError", "i", "initArrived", "op", "snapshot"].sort()
    );
    expect(Object.keys(step.barrier).sort()).toEqual(
      [
        "clean",
        "problems",
        "progressState",
        "ready",
        "rulesRefreshedSeen",
        "scannedOpenDocumentsSeen",
      ].sort()
    );
    const arrivals = t.steps.filter((s) => s.initArrived);
    expect(arrivals).toHaveLength(1);
    expect(arrivals[0].op).toBe("stdout");
  });

  it("중단이 있는 대본은 첫 중단 단계에서 중단 사유를 싣는다", () => {
    const s = happyWatchScript();
    const idx = s.events.findIndex((e) => e.op === "didOpenSent");
    const events = [...s.events];
    events.splice(idx + 1, 0, {
      op: "stderr",
      hex: toHex(bytesOf(["Scanning workspace"])),
      tMs: 1100,
    });
    const t = runScanWatchScript({ ...s, events });
    const aborted = t.steps.filter((x) => x.abort !== null);
    expect(aborted).toHaveLength(1);
    expect(aborted[0].abort).toEqual({ condition: "A1", detail: "scanningWorkspace" });
  });

  it("hex 조각이 홀수 길이거나 16진수가 아니면 던진다(대본 오류)", () => {
    expect(() => scanHexToBytes("abc")).toThrow();
    expect(() => scanHexToBytes("zz")).toThrow();
  });

  it("chunked 도우미는 지정한 크기로 같은 시각의 이벤트를 만든다", () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    expect(chunked("stdout", bytes, 5, 2).map((e) => (e.op === "stdout" ? e.hex : ""))).toEqual([
      "0102",
      "0304",
      "05",
    ]);
  });
});
