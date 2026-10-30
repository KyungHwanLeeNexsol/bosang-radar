// 시험 전용: 판정 모듈(lsp-rules-record.ts)을 먼저 따로 시험하기 위한 "정상 사실" 조립기. 실제 Semgrep이 아니다.
// happyFacts()는 13개 조건을 모두 통과하는 합성 사실이고, 시험은 여기서 한 부분씩 바꿔 각 조건이 판정을 어떻게 바꾸는지 본다.

import { LSP_RULES_PROBE_SHA256, rulesLayout, probePathOf, LSP_RULES_LIMITS } from "../lsp-rules";
import type { RulesFacts } from "../lsp-rules-record";
import type { JsonRpcMessage } from "../types";
import {
  crlf,
  enc,
  frames,
  happyStderrLines,
  preambleLines,
  progressCreate,
  progressNotification,
  RULES_REFRESHED,
} from "./rules-fixtures";

export const WORK = "C:/work/rules-1";
export const layout = rulesLayout(WORK);
export const URL = "http://127.0.0.1:41999";
export const EXE = "C:/venv/Scripts/semgrep.exe";
export const CORE = "C:/venv/Lib/site-packages/semgrep/bin/semgrep-core.exe";
export const STUB_VERSION = "9.9.9";
export const HOME_OK = ".semgrep/cache/fingerprinted_ignored_findings/ws.txt";

export const initResponse = (version: string = STUB_VERSION): JsonRpcMessage => ({
  jsonrpc: "2.0",
  id: "lsp-rules-init-1",
  result: {
    capabilities: { textDocumentSync: 1 },
    serverInfo: { name: "Semgrep", version },
  },
});

/** 정상 경로의 stdout 프레임: 초기화 응답 → 진행 요청·알림 → rulesRefreshed → 진행 요청·알림. */
export function happyStdoutMessages(): JsonRpcMessage[] {
  return [
    initResponse(),
    progressCreate(1, "refresh-token"),
    progressNotification("refresh-token", "begin"),
    RULES_REFRESHED,
    progressNotification("refresh-token", "end"),
    progressCreate(2, "scan-token"),
    progressNotification("scan-token", "begin"),
    progressNotification("scan-token", "end"),
  ];
}

export function happyStderrBytes(rulesDir: string = layout.rulesDir): Uint8Array {
  return enc(crlf(happyStderrLines(rulesDir)));
}

/** `initialized`를 보내기 직전까지 읽은 stderr의 크기(서두 줄 전체). */
export function preambleByteLength(rulesDir: string = layout.rulesDir): number {
  return enc(crlf(preambleLines(rulesDir))).byteLength;
}

/** stdout 바이트 맨 앞 프레임 하나의 길이(헤더 포함). 프레임이 없으면 0. 정상 경로에서 `initialized` 직전에 읽은 stdout은 초기화 응답 프레임 하나뿐이다. */
export function firstFrameLength(bytes: Uint8Array): number {
  const head = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.byteLength, 64)));
  const m = /^Content-Length: (\d+)\r\n\r\n/.exec(head);
  return m === null ? 0 : m[0].length + Number(m[1]);
}

export function happyFacts(over: Partial<RulesFacts> = {}): RulesFacts {
  const stdoutBytes = frames(happyStdoutMessages());
  const stderrBytes = happyStderrBytes();
  const base: RulesFacts = {
    runId: "run-1",
    provenance: "stub",
    refusals: [],
    limits: { ...LSP_RULES_LIMITS },
    expectedVersion: STUB_VERSION,
    probePath: probePathOf(layout),
    spawn: { attempted: true, ok: true, pid: 4242 },
    sends: [
      { label: "initialize", tMs: 0, ok: true, stderrBytesAtSend: 0, stdoutBytesAtSend: 0 },
      {
        label: "initialized",
        tMs: 300,
        ok: true,
        stderrBytesAtSend: preambleByteLength(),
        stdoutBytesAtSend: firstFrameLength(stdoutBytes),
      },
      {
        label: "shutdown",
        tMs: 2500,
        ok: true,
        stderrBytesAtSend: stderrBytes.byteLength,
        stdoutBytesAtSend: stdoutBytes.byteLength,
      },
      {
        label: "exit",
        tMs: 2501,
        ok: true,
        stderrBytesAtSend: stderrBytes.byteLength,
        stdoutBytesAtSend: stdoutBytes.byteLength,
      },
    ],
    stdout: {
      bytes: stdoutBytes,
      total: stdoutBytes.byteLength,
      overflow: false,
      eof: true,
      readFailed: false,
    },
    stderr: {
      bytes: stderrBytes,
      total: stderrBytes.byteLength,
      overflow: false,
      eof: true,
      readFailed: false,
    },
    frameError: null,
    initResponseAtMs: 200,
    barrier: { reachedAtMs: 400, settledAtMs: 2400 },
    exit: { observed: true, code: 0, signal: null, tMs: 2600 },
    stdinClosed: { byHarness: false, ok: null, tMs: null },
    kill: { count: 0, firstTMs: null, confirmed: null },
    trigger: "NORMAL",
    also: [],
    abort: null,
    live: {
      stderrCheckedBytes: stderrBytes.byteLength,
      stdoutFramesChecked: 8,
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
        filesBefore: 0,
        filesAfter: 0,
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
    artifacts: [{ label: "semgrep-core", before: "core-v1", after: "core-v1" }],
    externalReasons: [],
    timeline: { observationMs: 2600, cleanupMs: 20 },
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
  const merged: RulesFacts = { ...base, ...over };
  // 시험이 stdout만 바꿨다면 `initialized` 직전에 읽은 stdout도 그 stdout의 첫 프레임(초기화 응답)까지로 맞춘다.
  // (예전의 임의값 100은 "initialized 이전 stdout" 검사가 없던 시절의 자리 채움이었다.)
  if (over.stdout !== undefined && over.sends === undefined) {
    const cut = firstFrameLength(over.stdout.bytes);
    merged.sends = merged.sends.map((s) =>
      s.label === "initialized" ? { ...s, stdoutBytesAtSend: cut } : s
    );
  }
  return merged;
}

// ── 러너 결과 JSON·관리자 문맥 JSON ───────────────────────────────
// 아래 두 모양이 Windows 러너(lsp-rules-runner.ps1)의 출력과 관리자 진입점(Test-LspRulesObservation.ps1)의 문맥 파일의 계약이다.
// factsFromRulesRunnerResult·reinterpretRulesRun이 읽는 모양과 같고, PowerShell 시험은 자기 출력을 이 모양과 대조한다.

const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64");

export function runnerResultJson(
  f: RulesFacts,
  over: Record<string, unknown> = {}
): Record<string, unknown> {
  const stream = (s: RulesFacts["stdout"]) => ({
    b64: b64(s.bytes),
    bytesRead: s.total,
    overflow: s.overflow,
    readFailed: s.readFailed,
    eof: s.eof,
    error: s.readFailed ? (s.readError ?? "Error: read") : null,
  });
  return {
    schema: 1,
    kind: "lsp-rules-runner-result",
    runToken: "tok-1",
    mode: f.provenance === "real" ? "semgrep-lsp" : "stub",
    refused: null,
    refusals: [],
    error: null,
    errorPhase: null,
    child: { started: f.spawn.ok, pid: f.spawn.pid },
    sends: f.sends.map((s) => ({ ...s })),
    stdout: stream(f.stdout),
    stderr: stream(f.stderr),
    frameError: f.frameError,
    initResponseAtMs: f.initResponseAtMs,
    barrier: { ...f.barrier },
    exit: { ...f.exit },
    stdinClosed: { ...f.stdinClosed },
    kill: { ...f.kill },
    trigger: f.trigger,
    also: [...f.also],
    abort: f.abort,
    live: {
      stderrCheckedBytes: f.live.stderrCheckedBytes,
      stdoutFramesChecked: f.live.stdoutFramesChecked,
      processes: { ...f.live.processes },
      files: { ...f.live.files },
    },
    roots: f.roots.map((r) => ({
      role: r.role,
      filesBefore: r.filesBefore,
      filesAfter: r.filesAfter,
      added: [...r.added],
      removed: [...r.removed],
    })),
    artifacts: f.artifacts.map((a) => ({ ...a })),
    timeline: { ...f.timeline },
    cleanup: { ...f.cleanup, problems: [...f.cleanup.problems] },
    ...over,
  };
}

export function adminContextJson(
  f: RulesFacts,
  over: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    schema: "lsp-rules-admin-context/1",
    kind: "lsp-rules-admin-context",
    runId: f.runId,
    runToken: "tok-1",
    mode: "stub",
    work: WORK,
    runnerLaunched: true,
    refusals: [],
    expectedVersion: f.expectedVersion,
    limits: { ...f.limits },
    receiver: { ...f.live.receiver },
    probe: { ...f.probe },
    identity: { ok: true },
    binding: { ok: true },
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
