// 시험 전용: 판정 모듈(lsp-scan-record.ts)을 따로 시험하기 위한 "정상 사실" 조립기. 실제 Semgrep이 아니다.
// scanFacts()는 16개 조건을 모두 통과하는 합성 사실이고, 시험은 여기서 한 부분(줄, 프레임, 도착 시각, 청크 크기)씩 바꿔 각 조건이 판정을 어떻게 바꾸는지 본다.
//
// 시각 설계(ms): initialize 0 → 초기화 응답 200 → initialized 300 → 장벽 끝 표시 700 → didOpen 1000 → 진단 프레임 1400 → 엔진 로그 묶음 1500
// → 두 묶음 완성 = 1500 → settle 창 [1500, 3500] → shutdown 3600 → exit 3601 → 프로세스 종료 3700.

import { LSP_RULES_PROBE_SHA256, probePathOf } from "../lsp-rules";
import { LSP_SCAN_LIMITS, LSP_SCAN_TARGET_SHA256, scanTargetUri } from "../lsp-scan";
import {
  ScanEvidenceTracker,
  deriveScanEvidence,
  type ScanChunk,
  type ScanFacts,
  type ScanLiveView,
  type ScanSendFact,
} from "../lsp-scan-record";
import { sha256Hex } from "../sha";
import type { JsonRpcMessage } from "../types";
import {
  SCAN_STUB_VERSION,
  TARGET_BYTES,
  barrierStdoutMessages,
  bytesOf,
  concat,
  frames,
  goodNotification,
  scanLay,
  scanStderrParts,
} from "./scan-fixtures";

export const HOME_OK = ".semgrep/cache/fingerprinted_ignored_findings/ws.txt";
export const CORE_EXE = "C:/venv/Lib/site-packages/semgrep/bin/semgrep-core.exe";

export interface PostPart {
  lines: string[];
  tMs: number;
}
export interface StdoutPostPart {
  messages: JsonRpcMessage[];
  tMs: number;
}

export interface ScanBuild {
  /** 사전 구간 stderr 줄(서두 + 장벽 + 열린 문서 스캔의 외부 명령 줄). */
  pre?: string[];
  /** 사후 구간 stderr 를 (줄, 도착 시각) 조각으로. 기본은 [묶음 끝까지 @1500, 나머지 @1510]. */
  stderrPost?: PostPart[];
  tail?: string[];
  stdoutPre?: JsonRpcMessage[];
  /** 사후 구간 stdout 를 (프레임, 도착 시각) 조각으로. 기본은 [정상 진단 알림 @1400]. */
  stdoutPost?: StdoutPostPart[];
  didOpenAtMs?: number;
  barrierDoneAtMs?: number;
  /** 지정하면 모든 조각을 이 크기의 청크로 다시 나눈다(조각 안에서 시각을 선형으로 퍼뜨린다; 조각의 마지막 청크는 조각의 시각이다). */
  chunkSize?: number;
  /** settle 감시를 마친 시각. 기본은 두 묶음 완성 시각 + settleMs. */
  settleEndAtMs?: number | null;
  shutdownAtMs?: number;
}

/** 사후 구간 stderr 의 기본 줄: 묶음 끝(`Found 1 matches`)까지와 나머지(알림 덤프)로 나눈다. */
export function defaultPostParts(
  logDoneAtMs: number = 1500,
  post: string[] = scanStderrParts().post
): PostPart[] {
  const at = post.indexOf("Found 1 matches");
  const cut = at < 0 ? post.length : at + 1;
  const parts: PostPart[] = [{ lines: post.slice(0, cut), tMs: logDoneAtMs }];
  if (cut < post.length) parts.push({ lines: post.slice(cut), tMs: logDoneAtMs + 10 });
  return parts;
}

/** [바이트, 도착 시각, (선택) 퍼뜨림 시작 하한]. 하한은 청크 시각이 이 값 아래로 내려가지 않게 한다. */
type TimedBytes = [Uint8Array, number, number?];

/** (바이트, 도착 시각) 조각들을 청크 목록으로. chunkSize 가 있으면 조각을 더 잘게 나눈다. */
function chunkify(
  stream: "stdout" | "stderr",
  parts: TimedBytes[],
  chunkSize: number | undefined
): { bytes: Uint8Array; chunks: ScanChunk[] } {
  const chunks: ScanChunk[] = [];
  let offset = 0;
  let prevT = 0;
  for (const [bytes, tMs, floor] of parts) {
    if (bytes.byteLength === 0) continue;
    const from = Math.min(tMs, Math.max(prevT, floor ?? 0));
    const size = chunkSize === undefined ? bytes.byteLength : Math.max(1, chunkSize);
    const n = Math.ceil(bytes.byteLength / size);
    for (let j = 0; j < n; j += 1) {
      const length = Math.min(size, bytes.byteLength - j * size);
      const t = j === n - 1 ? tMs : from + Math.round(((tMs - from) * (j + 1)) / n);
      chunks.push({ stream, offset: offset + j * size, length, tMs: t });
    }
    offset += bytes.byteLength;
    prevT = tMs;
  }
  return { bytes: concat(...parts.map((p) => p[0])), chunks };
}

export function streamFacts(bytes: Uint8Array): ScanFacts["stdout"] {
  return { bytes, total: bytes.byteLength, overflow: false, eof: true, readFailed: false };
}

/** 정상 경로의 합성 사실. 인자로 줄·프레임·시각·청크 크기를 바꿔 시나리오를 만든다. */
export function scanFacts(build: ScanBuild = {}, over: Partial<ScanFacts> = {}): ScanFacts {
  const didOpenAtMs = build.didOpenAtMs ?? 1000;
  const parts = scanStderrParts();
  const pre = build.pre ?? parts.pre;
  const tail = build.tail ?? parts.tail;
  const stderrPost = build.stderrPost ?? defaultPostParts();
  const stdoutPre = frames(build.stdoutPre ?? barrierStdoutMessages());
  const stdoutPost = build.stdoutPost ?? [{ messages: [goodNotification()], tMs: 1400 }];

  // stdout: 초기화 응답 프레임 @200, 나머지 장벽 프레임 @600, 사후 조각들
  const stdoutPreMessages = build.stdoutPre ?? barrierStdoutMessages();
  const firstFrame = frames(stdoutPreMessages.slice(0, 1));
  const restPre = frames(stdoutPreMessages.slice(1));
  const stdoutParts: TimedBytes[] = [
    [firstFrame, 200],
    [restPre, 600],
    ...stdoutPost.map((p): TimedBytes => [frames(p.messages), p.tMs, didOpenAtMs + 1]),
  ];
  const stdout = chunkify("stdout", stdoutParts, build.chunkSize);

  // stderr: 서두 @150, 장벽 줄 @650, 사후 조각들, 종료 줄
  const initializedAt = pre.findIndex((l) => l.includes('"method": "initialized"'));
  const preamble = bytesOf(pre.slice(0, initializedAt < 0 ? pre.length : initializedAt));
  const preBytes = bytesOf(pre);
  const barrierBytes = preBytes.subarray(preamble.byteLength);
  const lastPostT = stderrPost.length > 0 ? Math.max(...stderrPost.map((p) => p.tMs)) : didOpenAtMs;
  const bothAtMs = Math.max(
    stdoutPost.length > 0 ? Math.min(...stdoutPost.map((p) => p.tMs)) : 0,
    stderrPost.length > 0 ? stderrPost[0].tMs : 0
  );
  const shutdownAtMs =
    build.shutdownAtMs ?? Math.max(bothAtMs, lastPostT) + LSP_SCAN_LIMITS.settleMs + 100;
  const stderrParts: TimedBytes[] = [
    [preamble, 150],
    [barrierBytes, 650],
    ...stderrPost.map((p): TimedBytes => [bytesOf(p.lines), p.tMs, didOpenAtMs + 1]),
    [bytesOf(tail), Math.max(shutdownAtMs + 50, lastPostT + 1)],
  ];
  const stderr = chunkify("stderr", stderrParts, build.chunkSize);

  const stderrPreLen = preBytes.byteLength;
  const stdoutPreLen = stdoutPre.byteLength;
  const sends: ScanSendFact[] = [
    { label: "initialize", tMs: 0, ok: true, stderrBytesAtSend: 0, stdoutBytesAtSend: 0 },
    {
      label: "initialized",
      tMs: 300,
      ok: true,
      stderrBytesAtSend: preamble.byteLength,
      stdoutBytesAtSend: firstFrame.byteLength,
    },
    {
      label: "didOpen",
      tMs: didOpenAtMs,
      ok: true,
      stderrBytesAtSend: stderrPreLen,
      stdoutBytesAtSend: stdoutPreLen,
      didOpen: {
        uri: scanTargetUri(scanLay),
        languageId: "plaintext",
        version: 1,
        textSha256: LSP_SCAN_TARGET_SHA256,
      },
    },
    {
      label: "shutdown",
      tMs: shutdownAtMs,
      ok: true,
      stderrBytesAtSend: stderr.bytes.byteLength,
      stdoutBytesAtSend: stdout.bytes.byteLength,
    },
    {
      label: "exit",
      tMs: shutdownAtMs + 1,
      ok: true,
      stderrBytesAtSend: stderr.bytes.byteLength,
      stdoutBytesAtSend: stdout.bytes.byteLength,
    },
  ];

  const base: ScanFacts = {
    runId: "run-1",
    provenance: "stub",
    refusals: [],
    limits: { ...LSP_SCAN_LIMITS },
    expectedVersion: SCAN_STUB_VERSION,
    probePath: probePathOf(scanLay),
    workspace: scanLay.workspace,
    expectedTargetUri: scanTargetUri(scanLay),
    spawn: { attempted: true, ok: true, pid: 4242 },
    sends,
    stdout: streamFacts(stdout.bytes),
    stderr: streamFacts(stderr.bytes),
    chunks: [...stdout.chunks, ...stderr.chunks],
    markers: {
      barrierDoneAtMs: build.barrierDoneAtMs ?? 700,
      didOpenSent: { tMs: didOpenAtMs, stdoutOffset: stdoutPreLen, stderrOffset: stderrPreLen },
    },
    liveView: null,
    frameError: null,
    initResponseAtMs: 200,
    settle: { endedAtMs: null },
    exit: { observed: true, code: 0, signal: null, tMs: shutdownAtMs + 100 },
    stdinClosed: { byHarness: false, ok: null, tMs: null },
    kill: { count: 0, firstTMs: null, confirmed: null },
    trigger: "NORMAL",
    also: [],
    abort: null,
    live: {
      stderrCheckedBytes: stderr.bytes.byteLength,
      stdoutFramesChecked: 9,
      receiver: { baselineHits: 0, finalHits: 0, samples: 60, failures: 0 },
      processes: {
        samples: 60,
        failures: 0,
        maxDescendants: 2,
        imagesSeen: ["python.exe", "semgrep-core.exe", "semgrep.exe"],
        disallowed: [],
      },
      files: { samples: 60, failures: 0 },
    },
    roots: [
      {
        role: "WORKSPACE",
        filesBefore: 1,
        filesAfter: 1,
        added: [],
        removed: [],
        samples: 0,
        failures: 0,
      },
      {
        role: "RULES_DIR",
        filesBefore: 1,
        filesAfter: 1,
        added: [],
        removed: [],
        samples: 0,
        failures: 0,
      },
      {
        role: "HOME_DIR",
        filesBefore: 0,
        filesAfter: 1,
        added: [HOME_OK],
        removed: [],
        samples: 0,
        failures: 0,
      },
    ],
    probe: {
      sourceSha256: LSP_RULES_PROBE_SHA256,
      afterCopySha256: LSP_RULES_PROBE_SHA256,
      afterRunSha256: LSP_RULES_PROBE_SHA256,
    },
    target: {
      sourceSha256: sha256Hex(TARGET_BYTES),
      afterWriteSha256: sha256Hex(TARGET_BYTES),
      afterRunSha256: sha256Hex(TARGET_BYTES),
    },
    artifacts: [{ label: "semgrep-core", before: "core-v1", after: "core-v1" }],
    childEnv: {
      path: "C:/Windows\\System32;C:/Windows",
      workingDirectory: scanLay.stateDir,
    },
    externalReasons: [],
    recovery: { status: "EQUAL", detail: [] },
    timeline: { observationMs: shutdownAtMs + 100, cleanupMs: 20 },
    cleanup: {
      childExitConfirmed: true,
      streamsClosed: true,
      descendantsAliveAfter: 0,
      descendantTracking: "ROOT_GONE",
      dispose: "OK",
      timersCancelled: true,
      problems: [],
    },
  };
  const merged: ScanFacts = { ...base, ...over };
  // settle 감시를 마친 시각: 지정하지 않으면 두 묶음이 완성된 시각 + settleMs (완성된 묶음이 없으면 null)
  if (build.settleEndAtMs !== undefined) merged.settle = { endedAtMs: build.settleEndAtMs };
  else if (over.settle === undefined) {
    const ev = deriveScanEvidence({
      stdout: merged.stdout.bytes,
      stderr: merged.stderr.bytes,
      chunks: merged.chunks,
      didOpen: merged.markers.didOpenSent,
      barrierDoneAtMs: merged.markers.barrierDoneAtMs,
      workspace: merged.workspace,
      expectedTargetUri: merged.expectedTargetUri,
      scanMs: merged.limits.scanMs,
      settleMs: merged.limits.settleMs,
      stdoutEof: merged.stdout.eof,
    });
    merged.settle = {
      endedAtMs: ev.bothCompleteAtMs === null ? null : ev.bothCompleteAtMs + merged.limits.settleMs,
    };
  }
  if (over.liveView === undefined) merged.liveView = replayLiveView(merged);
  return merged;
}

/** 청크 시간표를 시간 순서로 실시간 추적기에 먹여, 실행기가 기록했을 법한 마지막 실시간 보기를 만든다. */
export function replayLiveView(f: ScanFacts): ScanLiveView | null {
  if (f.chunks === null || f.markers.didOpenSent === null) return null;
  const tracker = new ScanEvidenceTracker({
    workspace: f.workspace,
    expectedTargetUri: f.expectedTargetUri,
    scanMs: f.limits.scanMs,
    settleMs: f.limits.settleMs,
  });
  type Ev = { t: number; order: number; run: () => void };
  const events: Ev[] = f.chunks.map((c, i) => ({
    t: c.tMs,
    order: i,
    run: () => {
      const src = c.stream === "stdout" ? f.stdout.bytes : f.stderr.bytes;
      const piece = src.subarray(c.offset, c.offset + c.length);
      if (c.stream === "stdout") tracker.feedStdout(piece, c.tMs);
      else tracker.feedStderr(piece, c.tMs);
    },
  }));
  const marker = f.markers.didOpenSent;
  events.push({ t: marker.tMs, order: -1, run: () => tracker.markDidOpenSent(marker.tMs) });
  if (f.markers.barrierDoneAtMs !== null) {
    const at = f.markers.barrierDoneAtMs;
    events.push({ t: at, order: -2, run: () => tracker.markBarrierDone(at) });
  }
  // 같은 시각이면 청크가 먼저(표시는 청크 뒤): 표시의 order 를 가장 크게 한다
  // 같은 시각이면 청크가 먼저, 표시(order < 0)가 나중이다.
  const rank = (e: Ev): number => (e.order < 0 ? 1 : 0);
  events.sort((a, b) => a.t - b.t || rank(a) - rank(b) || a.order - b.order);
  for (const e of events) e.run();
  const snap = tracker.snapshot(null);
  return {
    preOpenEvidence: snap.preOpenEvidence,
    diagnosticsState: snap.diagnosticsState,
    diagnosticsCompleteAtMs: snap.diagnosticsCompleteAtMs,
    logState: snap.logState,
    logCompleteAtMs: snap.logCompleteAtMs,
    bothCompleteAtMs: snap.bothCompleteAtMs,
  };
}
