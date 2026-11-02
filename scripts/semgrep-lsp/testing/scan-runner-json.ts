// 시험 전용: 사실(ScanFacts)에서 PowerShell 러너가 남길 모양의 결과 JSON·관리자 문맥을 만든다. 러너 결과 어댑터(lsp-scan-runner-result.ts)의 스키마 문서와
// 같은 필드를 쓴다. 실제 러너가 아니다 — 어댑터와 재해석 시험이 같은 생산자를 쓰게 하려는 조립기다.

import { LSP_SCAN_LIMITS } from "../lsp-scan";
import { SCAN_ADMIN_CONTEXT_KIND, SCAN_ADMIN_CONTEXT_SCHEMA } from "../lsp-scan-reinterpret";
import type { ScanFacts } from "../lsp-scan-record";
import { SCAN_RUNNER_RESULT_KIND, SCAN_RUNNER_RESULT_SCHEMA } from "../lsp-scan-runner-result";
import { sha256Hex } from "../sha";

export const b64Of = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64");

function streamJson(s: ScanFacts["stdout"], withBytes: boolean): Record<string, unknown> {
  return {
    ...(withBytes ? { b64: b64Of(s.bytes) } : {}),
    bytesRead: s.total,
    sha256: sha256Hex(s.bytes),
    overflow: s.overflow,
    eof: s.eof,
    readFailed: s.readFailed,
    error: s.readError ?? null,
  };
}

export interface RunnerJsonOptions {
  /** 자식에게 준 환경 이름(시험이 buildLspMinEnv 의 키나 LSP_MIN_ENV_NAMES 를 넘긴다). */
  envNames: readonly string[];
  /** false 면 원문은 .bin 으로 따로 둔 것으로 본다. */
  withBytes?: boolean;
}

/** 사실에서 러너가 남길 JSON 을 만든다. */
export function runnerJsonFromFacts(
  f: ScanFacts,
  options: RunnerJsonOptions
): Record<string, unknown> {
  const withBytes = options.withBytes ?? true;
  return {
    schema: SCAN_RUNNER_RESULT_SCHEMA,
    kind: SCAN_RUNNER_RESULT_KIND,
    runToken: "token-1",
    mode: f.provenance === "real" ? "semgrep-lsp" : "stub",
    refused: null,
    refusals: [],
    error: null,
    errorPhase: null,
    request: {
      envNames: [...options.envNames],
      envPath: f.childEnv.path,
      workingDirectory: f.childEnv.workingDirectory,
    },
    child: { started: f.spawn.ok, pid: f.spawn.pid },
    sends: f.sends.map((s) => ({ ...s })),
    trigger: f.trigger,
    also: f.also,
    abort: f.abort,
    frameError: f.frameError,
    initResponseAtMs: f.initResponseAtMs,
    markers: { ...f.markers },
    settle: { ...f.settle },
    chunks: (f.chunks ?? []).map((c) => ({ ...c })),
    liveView: f.liveView,
    stdout: streamJson(f.stdout, withBytes),
    stderr: streamJson(f.stderr, withBytes),
    exit: { ...f.exit },
    stdinClosed: { ...f.stdinClosed },
    kill: { ...f.kill },
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
      added: r.added,
      removed: r.removed,
    })),
    files: { target: { ...f.target }, probe: { ...f.probe } },
    artifacts: f.artifacts,
    timeline: { ...f.timeline },
    cleanup: { ...f.cleanup },
  };
}

/** 모든 점검이 통과한 관리자 문맥. 시험이 필드를 하나씩 깨뜨려 본다. */
export function adminContextFor(
  f: ScanFacts,
  work: string,
  over: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    schema: SCAN_ADMIN_CONTEXT_SCHEMA,
    kind: SCAN_ADMIN_CONTEXT_KIND,
    runId: f.runId,
    runToken: "token-1",
    work,
    expectedVersion: f.expectedVersion,
    expectedPath: f.childEnv.path,
    limits: { ...LSP_SCAN_LIMITS },
    runnerLaunched: true,
    refusals: [],
    receiver: { baselineHits: 0, finalHits: 0, samples: 60, failures: 0 },
    probe: { ...f.probe },
    target: { ...f.target },
    identity: { ok: true },
    binding: { ok: true },
    supervisor: {
      forcedKill: false,
      deadlineReached: false,
      abortRequested: false,
      abortDelivered: false,
      resultMissing: false,
    },
    descendantPathViolations: [],
    hashesUnchanged: true,
    osBlock: { usable: true, attributedCount: 0 },
    recovery: { status: "EQUAL", detail: [] },
    ...over,
  };
}
