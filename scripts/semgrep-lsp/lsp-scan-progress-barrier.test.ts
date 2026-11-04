// LSP-SCAN-1 초기 진행 메시지 장벽: 재현 시험(TS). 2026-11-03 실제 1회 관측이 ABORTED 로 끝난 경위를 합성 입력으로 다시 만든다.
//
// 재현하는 일(외부 검토가 TS·PowerShell 양쪽에서 확인한 순서):
//   1. 초기화 응답과 첫 진행 묶음·rulesRefreshed 수신
//   2. stderr 의 `Scanned open documents` 줄 수신
//   3. 장벽이 ready=true, clean=true 가 된다            ← 수정 전에는 여기서 열렸다
//   4. didOpen 송신
//   5. 늦게 전달된 두 번째 초기 진행 요청(progress/create)에서 A6 중단
// 수정 뒤에는 stdout 에서 두 번째 진행 수명주기(create·begin·end)가 **완전한 프레임으로** 읽히기 전에는 장벽이 열리지 않고 didOpen 이 나가지 않는다.
//
// 이 파일의 입력은 합성이다. 실제 Semgrep 이 아니며, 소스↔바이너리 대응은 미확인이다. 토큰 값도 이번 관측의 값이 아닌 합성 값이다.

import { describe, expect, it } from "vitest";
import { VirtualClock } from "./clock";
import { FrameDecoder } from "./framing";
import { buildLspMinEnv } from "./lsp-min";
import { analyzeScanStdout, buildScanDidOpenMessage } from "./lsp-scan";
import { judgeScanResponse } from "./lsp-scan-record";
import { ScanLiveWatch } from "./lsp-scan-watch";
import { runScanObservation, type ScanPorts, type ScanRequest } from "./lsp-scan-run";
import { readFileSync } from "node:fs";
import { FakeMetricsReceiver } from "./testing/fake-metrics";
import { MemoryArtifactHasher } from "./testing/memory-artifact";
import { MemoryFs } from "./testing/memory-fs";
import { CORE, EXE, STUB_VERSION, URL as METRICS_URL } from "./testing/rules-facts";
import { crlf, preambleLines } from "./testing/rules-fixtures";
import {
  RULES_REFRESHED,
  bytesOf,
  frames,
  openDocumentsProgress,
  progressBegin,
  progressCreate,
  progressEnd,
  refreshProgress,
  scanInitResponse,
  scanLay as layout,
  scanPreOpenLines,
} from "./testing/scan-fixtures";
import { watchConfig } from "./testing/scan-watch-cases";
import { drive } from "./testing/stub-lsp";
import { FsBackedHasher } from "./testing/stub-lsp-rules";
import {
  barrierLines,
  happyAfterDidOpen,
  scanLineSteps,
  scanPort,
  type ScanChild,
  type ScanScript,
  type ScanStep,
} from "./testing/stub-lsp-scan";
import { SyntheticLister, row, snapshotOf } from "./testing/synthetic-processes";
import type { ProcessRow } from "./types";

// ── 감시기 수준 ───────────────────────────────────────────────────

const preamble = (): Uint8Array => bytesOf(preambleLines(layout.rulesDir));
const barrierStderr = (): Uint8Array => bytesOf(scanPreOpenLines()).subarray(preamble().byteLength);

/** 서두 → 초기화 응답 → initialized → 첫 진행 묶음·rulesRefreshed → stderr 장벽 줄까지 먹인다. 두 번째 진행 묶음은 아직 오지 않았다. */
function watchUntilStderrScanned(): ScanLiveWatch {
  const w = new ScanLiveWatch(watchConfig());
  w.feedStderr(preamble(), 100);
  w.feedStdout(frames([scanInitResponse()]), 200);
  w.markInitializedSent();
  w.feedStdout(frames([...refreshProgress(), RULES_REFRESHED]), 600);
  w.feedStderr(barrierStderr(), 650);
  return w;
}

describe("재현: 두 번째 초기 진행 묶음이 stderr 완료 줄보다 늦게 오면 장벽이 열리지 않는다", () => {
  it("stderr 가 `Scanned open documents` 까지 왔어도 두 번째 진행 묶음이 없으면 장벽은 열리지 않는다", () => {
    const w = watchUntilStderrScanned();
    expect(w.stderrWatcher.scannedOpenDocumentsSeen).toBe(true);
    expect(w.stdoutTracker.rulesRefreshedSeen).toBe(true);
    expect(w.barrierReady()).toBe(false);
    const b = w.barrierStatus();
    expect(b.ready).toBe(false);
    expect(b.clean).toBe(false);
  });

  it("두 번째 create 만, create+begin 만, end 프레임 일부만 와도 열리지 않고, end 프레임이 완전히 온 뒤에야 연다", () => {
    const w = watchUntilStderrScanned();
    const [create, begin, end] = openDocumentsProgress();
    w.feedStdout(frames([create]), 700);
    expect(w.barrierReady(), "create 만").toBe(false);
    w.feedStdout(frames([begin]), 710);
    expect(w.barrierReady(), "create+begin").toBe(false);
    const endBytes = frames([end]);
    w.feedStdout(endBytes.subarray(0, endBytes.byteLength - 5), 720);
    expect(w.barrierReady(), "end 프레임 일부").toBe(false);
    expect(w.barrierStatus().clean).toBe(false);
    w.feedStdout(endBytes.subarray(endBytes.byteLength - 5), 730);
    expect(w.barrierReady(), "end 프레임 완성").toBe(true);
    const b = w.barrierStatus();
    expect(b.clean).toBe(true);
    expect(b.problems).toEqual([]);
  });
});

// ── 실행기 수준 ───────────────────────────────────────────────────

const PROBE_BYTES = new Uint8Array(
  readFileSync(new URL("./data/lsp-rules-1-probe.yaml", import.meta.url))
);
const TARGET_FILE_BYTES = new Uint8Array(
  readFileSync(new URL("./data/lsp-scan-1-target.txt", import.meta.url))
);

function tree(): ProcessRow[] {
  return [
    row({ pid: 4242, ppid: 100, name: "semgrep.exe" }),
    row({ pid: 5000, ppid: 4242, name: "python.exe" }),
    row({ pid: 5001, ppid: 5000, name: "semgrep-core.exe" }),
  ];
}

function makeRig(script: Partial<ScanScript>) {
  const clock = new VirtualClock();
  const fs = new MemoryFs();
  const hasher = new FsBackedHasher(fs, new MemoryArtifactHasher({ [CORE]: "core-binary-v1" }));
  const full: ScanScript = {
    lay: layout,
    init: { kind: "result" },
    onShutdown: () =>
      void fs.writeFileExclusive(
        `${layout.homeDir}/.semgrep/cache/fingerprinted_ignored_findings/ws.txt`,
        new Uint8Array()
      ),
    ...script,
  };
  const { port, children } = scanPort(full, clock);
  const lister = new SyntheticLister(async () => {
    const child = children[0];
    const alive = child !== undefined && !child.hasExitedNow;
    return { ok: true as const, snapshot: snapshotOf(alive ? tree() : []) };
  });
  const ports: ScanPorts = {
    process: port,
    clock,
    fs,
    receiver: new FakeMetricsReceiver({ hits: 0 }),
    lister,
    hasher,
  };
  const request: ScanRequest = {
    runId: "run-1",
    command: EXE,
    args: ["lsp", "--debug"],
    layout,
    env: buildLspMinEnv(layout, "C:/Windows", METRICS_URL),
    expectedVersion: STUB_VERSION,
    artifacts: [{ label: "semgrep-core", path: CORE }],
    probeBytes: PROBE_BYTES,
    targetBytes: TARGET_FILE_BYTES,
  };
  return { clock, children, ports, request };
}

const stdoutAt = (atMs: number, m: Parameters<typeof frames>[0][number]): ScanStep => ({
  atMs,
  stdout: m,
});

/**
 * `initialized` 를 받은 시각부터의 지연으로: stderr 장벽 줄(5ms 간격)과 첫 진행 묶음·rulesRefreshed 는 일찍,
 * 두 번째 진행 묶음은 stderr 의 `Scanned open documents` 줄보다 훨씬 늦게(`secondAt`) 도착한다. 스트림이 독립이라 이런 순서가 가능하다.
 */
function lateSecondProgress(secondAt: number, upTo: 1 | 2 | 3 = 3): ScanStep[] {
  const first = refreshProgress();
  const second = openDocumentsProgress();
  return [
    ...scanLineSteps(barrierLines()),
    stdoutAt(12, first[0]),
    stdoutAt(13, first[1]),
    stdoutAt(52, first[2]),
    stdoutAt(53, RULES_REFRESHED),
    ...second.slice(0, upTo).map((m, i) => stdoutAt(secondAt + i, m)),
  ];
}

const methodsOf = (child: ScanChild): string[] => {
  const decoder = new FrameDecoder();
  const out: string[] = [];
  for (const chunk of child.stdinWrites)
    out.push(...decoder.push(chunk).messages.map((m) => String(m.method)));
  return out;
};

const run = (rig: ReturnType<typeof makeRig>) =>
  drive(rig.clock, runScanObservation(rig.ports, rig.request));

describe("재현: 실행기는 두 번째 초기 진행 묶음이 다 읽히기 전에 didOpen 을 보내지 않는다", () => {
  it("두 번째 묶음이 늦게 와도 didOpen 은 그 묶음을 다 읽은 뒤 정확히 한 번 나가고, 관측은 중단 없이 성립한다", async () => {
    const rig = makeRig({
      afterInitialized: lateSecondProgress(600),
      afterDidOpen: happyAfterDidOpen(),
    });
    const { record } = await run(rig);
    const child = rig.children[0];
    expect(child.didOpenCount).toBe(1);
    expect(child.didOpenAtMs! - child.initializedAtMs!).toBeGreaterThanOrEqual(602);
    expect(record.verdict).toBe("SCAN_RESPONSE_OBSERVED");
    expect(record.conditions.map((c) => c.result)).toEqual(Array(16).fill("PASS"));
    expect(methodsOf(child)).toEqual([
      "initialize",
      "initialized",
      "textDocument/didOpen",
      "shutdown",
      "exit",
    ]);
  });

  it("두 번째 묶음이 create·begin 까지만 오고 끝나지 않으면 didOpen 은 나가지 않는다(기존 장벽 한도 안에서만 기다린다)", async () => {
    const rig = makeRig({ afterInitialized: lateSecondProgress(600, 2) });
    const { record } = await run(rig);
    expect(rig.children[0].didOpenCount).toBe(0);
    expect(record.verdict).toBe("NOT_OBSERVED:RULES_TIMEOUT");
    expect(methodsOf(rig.children[0])).toEqual(["initialize", "initialized"]);
  });
});

// ── 사후 재해석 ───────────────────────────────────────────────────

describe("재현: 사후 재해석은 러너의 장벽 선언을 믿지 않고 didOpen 송신 위치의 stdout 원문에서 다시 확인한다", () => {
  it("didOpen 이 두 번째 진행 묶음보다 앞선 위치에서 나갔다면 이유가 DID_OPEN_BEFORE_BARRIER_PROGRESS 로 남고 성립하지 않는다", async () => {
    const rig = makeRig({
      afterInitialized: lateSecondProgress(600),
      afterDidOpen: happyAfterDidOpen(),
    });
    const { facts } = await run(rig);
    expect(judgeScanResponse(facts).verdict).toBe("SCAN_RESPONSE_OBSERVED");

    // 같은 원문에서 didOpen 의 stdout 위치만 두 번째 create 프레임의 시작으로 되돌린다(러너는 장벽을 열었다고 선언한 채다).
    const list = analyzeScanStdout(facts.stdout.bytes, true).frameList;
    const creates = list.filter((f) => f.method === "window/workDoneProgress/create");
    expect(creates).toHaveLength(2);
    const offset = creates[1].startByte;
    const marker = facts.markers.didOpenSent!;
    const early = {
      ...facts,
      markers: { ...facts.markers, didOpenSent: { ...marker, stdoutOffset: offset } },
      sends: facts.sends.map((s) =>
        s.label === "didOpen" ? { ...s, stdoutBytesAtSend: offset } : s
      ),
    };
    const verdict = judgeScanResponse(early);
    expect(verdict.status).not.toBe("OBSERVED");
    expect(verdict.reasons).toContain("DID_OPEN_BEFORE_BARRIER_PROGRESS");
    expect(verdict.conditions[3].result).toBe("FAIL");
  });
});

// ── 실행기: 위반·추가 요청·기록 ────────────────────────────────────

describe("실행기: 초기 진행 메시지가 계약을 어기면 didOpen 을 보내지 않고, 장벽 뒤의 추가 서버 요청은 여전히 A6 이다", () => {
  it("두 번째 수명주기의 begin 이 등록되지 않은 토큰이면(INVALID) didOpen 은 0건이고 이유와 사유가 기록에 남는다", async () => {
    const first = refreshProgress();
    const second = openDocumentsProgress();
    const rig = makeRig({
      afterInitialized: [
        ...scanLineSteps(barrierLines()),
        stdoutAt(12, first[0]),
        stdoutAt(13, first[1]),
        stdoutAt(52, first[2]),
        stdoutAt(53, RULES_REFRESHED),
        stdoutAt(58, second[0]),
        stdoutAt(
          59,
          progressBegin("not-the-token", "Semgrep Scan in Progress", "Scanning Open Documents")
        ),
        stdoutAt(66, progressEnd("not-the-token")),
      ],
    });
    const { record } = await run(rig);
    expect(rig.children[0].didOpenCount).toBe(0);
    expect(record.status).toBe("NOT_CONFIRMED");
    expect(record.verdict_reasons).toContain("BARRIER_PROGRESS_INVALID");
    expect(record.verdict_reasons).toContain("DID_OPEN_NOT_SENT");
    const pb = record.evidence.progress_barrier;
    expect(pb.state).toBe("INVALID");
    expect(pb.violations).toContain("PROGRESS_TOKEN_UNREGISTERED");
    expect(pb.requests).toHaveLength(2);
    expect(pb.notifications.filter((n) => n.outcome === "UNREGISTERED_TOKEN")).toHaveLength(2);
    expect(record.conditions[3].result).toBe("FAIL");
    expect(methodsOf(rig.children[0])).not.toContain("textDocument/didOpen");
  });

  it("초기 진행을 모두 확인한 뒤 didOpen 이후에 서버가 추가 요청을 보내면 여전히 A6(REQUEST_AFTER_DID_OPEN)으로 중단한다", async () => {
    const rig = makeRig({
      afterInitialized: lateSecondProgress(70),
      afterDidOpen: [
        ...happyAfterDidOpen(),
        stdoutAt(300, progressCreate("synthetic-request-extra", "synthetic-token-extra")),
      ],
    });
    const { record, facts } = await run(rig);
    expect(rig.children[0].didOpenCount).toBe(1);
    expect(record.verdict).toBe("ABORTED:SERVER_REQUEST_NOT_ALLOWED");
    expect(facts.abort).toMatchObject({ condition: "A6", detail: "REQUEST_AFTER_DID_OPEN" });
    expect(methodsOf(rig.children[0])).toEqual([
      "initialize",
      "initialized",
      "textDocument/didOpen",
    ]);
  });

  it("그 요청의 토큰이 stderr 의 토큰 생성 줄과 같아도 예외로 허용하거나 사전 요청으로 소급하지 않는다", async () => {
    const rig = makeRig({
      afterInitialized: lateSecondProgress(70),
      afterDidOpen: [
        ...happyAfterDidOpen(),
        {
          atMs: 290,
          stderr: crlf([
            "[01.30][DEBUG](default): Creating progress token synthetic-token-extra (Semgrep Scan in Progress: Scanning Open Documents)",
          ]),
        },
        stdoutAt(300, progressCreate("synthetic-request-extra", "synthetic-token-extra")),
      ],
    });
    const { record, facts } = await run(rig);
    expect(record.verdict).toBe("ABORTED:SERVER_REQUEST_NOT_ALLOWED");
    expect(facts.abort).toMatchObject({ condition: "A6", detail: "REQUEST_AFTER_DID_OPEN" });
    // 사후 재해석도 그 요청을 didOpen 이후로 센다(사전 요청으로 소급하지 않는다)
    const marker = record.evidence.did_open_marker!;
    expect(record.evidence.progress_barrier.evaluated_stdout_offset).toBe(marker.stdout_offset);
    expect(record.evidence.progress_barrier.requests).toHaveLength(2);
    expect(record.server_messages.server_requests.after_did_open).toBe(1);
  });

  it("정상 경로의 기록에는 요청·토큰·begin/end·완료 여부가 남고 평가 위치는 didOpen 송신 위치다", async () => {
    const rig = makeRig({
      afterInitialized: lateSecondProgress(600),
      afterDidOpen: happyAfterDidOpen(),
    });
    const { record } = await run(rig);
    const pb = record.evidence.progress_barrier;
    expect(pb).toMatchObject({
      state: "COMPLETE",
      complete: true,
      problems: [],
      pending: [],
      violations: [],
    });
    expect(pb.evaluated_stdout_offset).toBe(record.evidence.did_open_marker!.stdout_offset);
    expect(
      pb.lifecycles.map((l) => [l.ordinal, l.stage, l.status, l.token_type, l.request_id_type])
    ).toEqual([
      [0, "REFRESH_RULES", "COMPLETE", "string", "string"],
      [1, "SCAN_OPEN_DOCUMENTS", "COMPLETE", "string", "string"],
    ]);
    expect(pb.lifecycles.every((l) => l.token !== l.request_id)).toBe(true);
    expect(pb.rules_refreshed_frames).toHaveLength(1);
    // 모든 초기 진행 프레임이 didOpen 송신 위치 앞에서 끝난다
    for (const r of pb.requests)
      expect(r.end_byte!).toBeLessThanOrEqual(pb.evaluated_stdout_offset!);
    for (const n of pb.notifications)
      expect(n.end_byte!).toBeLessThanOrEqual(pb.evaluated_stdout_offset!);
  });
});

// ── 변이 점검이 드러낸 빈틈의 보강 ─────────────────────────────────

describe("송신 직전 방어선과 감시기의 얼림: 장벽 판단과 별개로 마지막에 한 번 더 막는다", () => {
  it("장벽은 열렸지만 초기 진행이 계약 위반(INVALID)일 때 시험 이음새로 didOpen 을 시도하면 방어선이 거절한다 → ABORTED:SEND_REFUSED, 쓰지 않는다", async () => {
    const first = refreshProgress();
    const second = openDocumentsProgress();
    const rig = makeRig({
      afterInitialized: [
        ...scanLineSteps(barrierLines()),
        stdoutAt(12, first[0]),
        stdoutAt(13, first[1]),
        stdoutAt(52, first[2]),
        stdoutAt(53, RULES_REFRESHED),
        stdoutAt(58, second[0]),
        stdoutAt(
          59,
          progressBegin("not-the-token", "Semgrep Scan in Progress", "Scanning Open Documents")
        ),
        stdoutAt(66, progressEnd("not-the-token")),
      ],
    });
    const didOpen = buildScanDidOpenMessage(layout, TARGET_FILE_BYTES);
    const { record, facts } = await drive(
      rig.clock,
      runScanObservation(rig.ports, rig.request, {
        attemptSends: [{ after: "barrier", label: "didOpen", message: didOpen }],
      })
    );
    expect(rig.children[0].didOpenCount).toBe(0);
    expect(record.verdict).toBe("ABORTED:SEND_REFUSED");
    expect(facts.abort).toMatchObject({
      condition: "A10",
      detail: "didOpen:DID_OPEN_BEFORE_PROGRESS",
    });
    expect(methodsOf(rig.children[0])).toEqual(["initialize", "initialized"]);
  });

  it("didOpen 을 쓰기 직전에 감시기가 진행 추적기를 얼린다: 그 뒤에 온 서버 요청은 사전 장벽의 상태를 바꾸지 못한다", () => {
    const w = watchUntilStderrScanned();
    w.feedStdout(frames(openDocumentsProgress()), 700);
    expect(w.progressComplete()).toBe(true);
    w.markDidOpenSent(1000);
    // didOpen 뒤에 늦게 읽힌 요청 하나: 얼리지 않았다면 create 가 세 건이 되어 INVALID 로 바뀐다
    w.feedStdout(
      frames([progressCreate("synthetic-request-extra", "synthetic-token-extra")]),
      1100
    );
    expect(w.progressComplete()).toBe(true);
    expect(w.barrierStatus().progressState).toBe("COMPLETE");
    expect(w.barrierStatus().problems.filter((t) => t.startsWith("PROGRESS_"))).toEqual([]);
  });
});
