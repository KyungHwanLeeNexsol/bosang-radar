// Windows 표준 입력 러너(scripts/semgrep-lsp-isolation/windows/lsp-min-runner.ps1)가 남긴 결과 JSON을 LSP-MIN-1 관측 기록으로 옮기는 순수 어댑터.
//
// 러너는 흐름만 정한다(핵심 규칙으로 shutdown·exit를 보낼지 정하고, 중단 조건과 상한을 지킨다). 초기화 응답의 해석(서버 정보, 분석 규칙 V9~V11)과 사후
// 위반 검출(수신기 증가, 감시 폴더 위반, 허용 밖 이미지, 놓친 stderr 문구)은 여기서 TS 모듈(lsp-min.ts)이 원문 바이트로 다시 한다 — 그래서 실시간 실행기(lsp-min-run.ts)와
// Windows 러너의 기록이 같은 규칙으로 해석된다.
//
// 러너 결과가 형식에 맞지 않으면 기록은 NOT_OBSERVED(RUNNER_RESULT_MALFORMED:<필드>)가 된다. 관측하지 못한 값을 채우지 않는다.
// 수신기(A3)는 러너 밖에서 읽는다 — 호출자(관리자 쪽)가 실행 전후의 수신기 건수를 ctx.receiver로 넘긴다. 넘기지 않으면 기록은 RECEIVER_FINAL_UNOBSERVABLE로 관측 불성립이 된다.
//
// 공개 API:
//   factsFromRunnerResult(json, ctx): LspMinFacts
//   RUNNER_RESULT_SCHEMA / RUNNER_RESULT_KIND

import type { FrameDecodeError } from "./framing";
import {
  LSP_MIN_LIMITS,
  WATCHED_ROLES,
  type AbortCondition,
  type ArtifactFacts,
  type LspMinFacts,
  type LspMinLimits,
  type LspMinSendLabel,
  type LspMinTrigger,
  type StreamFacts,
  type WatchedRole,
  type WatchedRootFacts,
} from "./lsp-min";
import type { Provenance } from "./types";

export const RUNNER_RESULT_SCHEMA = 1;
export const RUNNER_RESULT_KIND = "lsp-min-runner-result";

export interface RunnerResultContext {
  /** 요청에 실은 한도(러너가 받은 값). 없으면 기본 상한. */
  limits?: LspMinLimits;
  runId: string;
  expectedVersion?: string | null;
  /** 관리자 쪽이 수신기를 실행 전후에 읽은 값. 읽지 못했으면 null을 넣는다. 이 인자를 주지 않으면 관측 불성립이다. */
  receiver?: {
    baselineHits: number | null;
    finalHits: number | null;
    samples: number;
    failures: number;
  };
}

const TRIGGERS: readonly LspMinTrigger[] = [
  "NORMAL",
  "INIT_INVALID",
  "INIT_TIMEOUT",
  "LIVE_ABORT",
  "TOTAL_TIMEOUT",
  "OUTPUT_LIMIT",
  "FRAME_ERROR",
  "STDIN_ERROR",
  "STREAM_READ_FAILED",
  "CHILD_EXITED_EARLY",
  "EXIT_TIMEOUT",
  "SPAWN_FAILED",
];
const CONDITIONS: readonly AbortCondition[] = ["A1", "A2", "A3", "A4", "A5", "A7", "A8"];
const LABELS: readonly LspMinSendLabel[] = ["initialize", "shutdown", "exit"];

type Dict = Record<string, unknown>;

function dict(value: unknown): Dict | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Dict)
    : null;
}
function arr(value: unknown): unknown[] {
  // PowerShell 5.1의 ConvertTo-Json은 원소 하나짜리 배열을 스칼라로, 빈 배열을 null이나 빈 객체로 쓰는 경우가 있어 둘 다 받아 준다.
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  if (dict(value) !== null && Object.keys(value as Dict).length === 0) return [];
  return [value];
}
function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function bytesOfStream(name: string, value: unknown, bad: string[]): StreamFacts {
  const d = dict(value);
  if (d === null || typeof d.b64 !== "string") {
    bad.push(name);
    return { bytes: new Uint8Array(0), total: 0, overflow: false, eof: false, readFailed: true };
  }
  const overflow = bool(d.overflow);
  const readFailed = bool(d.readFailed);
  const eof = bool(d.eof);
  if (overflow === null || readFailed === null || eof === null) bad.push(`${name}.state`);
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(Buffer.from(d.b64, "base64"));
  } catch {
    bad.push(`${name}.b64`);
    bytes = new Uint8Array(0);
  }
  return {
    bytes,
    total: num(d.bytesRead) ?? bytes.byteLength,
    overflow: overflow ?? false,
    eof: eof ?? false,
    readFailed: readFailed ?? true,
    // 러너가 남긴 읽기 오류 문구(형식: 메시지). 기록에 싣기 전의 걸러내기는 buildObservationRecord가 한다.
    readError: readFailed === true ? str(d.error) : null,
  };
}

/**
 * 러너 결과(JSON을 읽은 값)에서 기록용 사실을 만든다. 던지지 않는다. 형식이 틀린 필드는 externalReasons에 `RUNNER_RESULT_MALFORMED:<필드>`로 남기고
 * 안전한 쪽(관측 불성립·정리 실패)의 값으로 둔다.
 */
export function factsFromRunnerResult(json: unknown, ctx: RunnerResultContext): LspMinFacts {
  const limits = ctx.limits ?? { ...LSP_MIN_LIMITS };
  // 관측 쪽 필드의 형식 오류는 bad(→ status), 정리 쪽 필드의 오류는 cleanupBad(→ cleanup.problems)로만 간다. 한 필드가 양쪽에 영향을 주지 않는다.
  const bad: string[] = [];
  const cleanupBad: string[] = [];
  const r = dict(json);
  const base = (over: Partial<LspMinFacts>): LspMinFacts => ({
    runId: ctx.runId,
    provenance: null,
    refusals: [],
    limits,
    expectedVersion: ctx.expectedVersion ?? null,
    spawn: { attempted: false, ok: false, pid: null },
    sends: [],
    stdout: { bytes: new Uint8Array(0), total: 0, overflow: false, eof: false, readFailed: false },
    stderr: { bytes: new Uint8Array(0), total: 0, overflow: false, eof: false, readFailed: false },
    frameError: null,
    initResponseAtMs: null,
    exit: { observed: false, code: null, signal: null, tMs: null },
    stdinClosed: { byHarness: false, ok: null, tMs: null },
    kill: { count: 0, firstTMs: null, confirmed: null },
    trigger: null,
    also: [],
    abort: null,
    live: {
      stderrCheckedBytes: 0,
      stdoutFramesChecked: 0,
      receiver: { baselineHits: null, finalHits: null, samples: 0, failures: 0 },
      processes: { samples: 0, failures: 0, maxDescendants: 0, imagesSeen: [], disallowed: [] },
      files: { samples: 0, failures: 0 },
    },
    roots: [],
    artifacts: [],
    timeline: { observationMs: null, cleanupMs: null },
    cleanup: {
      childExitConfirmed: false,
      streamsClosed: null,
      descendantsAliveAfter: null,
      descendantTracking: null,
      dispose: "NOT_CALLED",
      timersCancelled: false,
      problems: [],
    },
    externalReasons: [],
    ...over,
  });

  if (r === null || r.schema !== RUNNER_RESULT_SCHEMA || r.kind !== RUNNER_RESULT_KIND) {
    return base({
      externalReasons: ["RUNNER_RESULT_MALFORMED:schema"],
      cleanup: { ...base({}).cleanup, problems: ["RUNNER_RESULT_MALFORMED"] },
    });
  }

  const mode = str(r.mode);
  const provenance: Provenance | null =
    mode === "stub" ? "stub" : mode === "semgrep-lsp" ? "real" : null;
  if (provenance === null) bad.push("mode");

  // 거절된 요청: 아무것도 띄우지 않았다.
  const refused = str(r.refused);
  if (refused !== null && refused !== "") {
    const tokens = arr(r.refusals).map(String);
    return base({ refusals: tokens.length > 0 ? tokens : [refused] });
  }
  if (str(r.error) !== null && str(r.error) !== "") {
    // 러너가 관측 구간이 끝난 뒤(정리 구간)에 던졌다고 적었으면 정리 문제로만 센다. 단계를 모르거나 관측 구간이면 관측 불성립이다.
    if (str(r.errorPhase) === "CLEANUP") cleanupBad.push("RUNNER_ERROR_IN_CLEANUP");
    else bad.push("runner.error");
  }

  const child = dict(r.child);
  const started = child === null ? null : bool(child.started);
  if (started === null) bad.push("child.started");
  const sends: LspMinFacts["sends"] = [];
  for (const item of arr(r.sends)) {
    const d = dict(item);
    const label = d === null ? null : (str(d.label) as LspMinSendLabel | null);
    if (
      d === null ||
      label === null ||
      !LABELS.includes(label) ||
      num(d.tMs) === null ||
      bool(d.ok) === null
    ) {
      bad.push("sends");
      continue;
    }
    sends.push({ label, tMs: num(d.tMs) as number, ok: d.ok as boolean });
  }

  const trigger = str(r.trigger) as LspMinTrigger | null;
  if (trigger === null || !TRIGGERS.includes(trigger)) bad.push("trigger");
  const also = arr(r.also)
    .map((x) => str(x) as LspMinTrigger)
    .filter((x) => TRIGGERS.includes(x));

  let abort: LspMinFacts["abort"] = null;
  if (r.abort !== null && r.abort !== undefined) {
    const a = dict(r.abort);
    const cond = a === null ? null : (str(a.condition) as AbortCondition | null);
    if (a === null || cond === null || !CONDITIONS.includes(cond) || num(a.tMs) === null)
      bad.push("abort");
    else abort = { condition: cond, detail: str(a.detail) ?? "", tMs: num(a.tMs) as number };
  }

  const fe = dict(r.frameError);
  const frameError: FrameDecodeError | null =
    fe === null
      ? null
      : {
          kind: fe.kind === "TRUNCATED" ? "TRUNCATED" : "MALFORMED",
          detail: str(fe.detail) ?? "",
          atByte: num(fe.atByte) ?? 0,
        };

  const exit = dict(r.exit);
  if (exit === null || bool(exit.observed) === null) bad.push("exit");
  const stdinClosed = dict(r.stdinClosed);
  if (stdinClosed === null || bool(stdinClosed.byHarness) === null) bad.push("stdinClosed");
  const kill = dict(r.kill);
  if (kill === null || num(kill.count) === null) bad.push("kill");

  const live = dict(r.live);
  const processes = live === null ? null : dict(live.processes);
  const files = live === null ? null : dict(live.files);
  if (live === null || processes === null || files === null) bad.push("live");

  const roots: WatchedRootFacts[] = [];
  for (const role of WATCHED_ROLES) {
    const item =
      arr(r.roots)
        .map(dict)
        .find((d) => d !== null && d.role === role) ?? null;
    if (item === null) {
      bad.push(`roots.${role}`);
      roots.push({
        role,
        filesBefore: null,
        filesAfter: null,
        added: [],
        removed: [],
        samples: 0,
        failures: 0,
      });
    } else {
      roots.push({
        role: role as WatchedRole,
        filesBefore: num(item.filesBefore),
        filesAfter: num(item.filesAfter),
        added: arr(item.added).map(String),
        removed: arr(item.removed).map(String),
        samples: 0,
        failures: 0,
      });
    }
  }

  const artifacts: ArtifactFacts[] = arr(r.artifacts)
    .map(dict)
    .filter((d): d is Dict => d !== null)
    .map((d) => ({ label: str(d.label) ?? "", before: str(d.before), after: str(d.after) }));

  const timeline = dict(r.timeline);
  const cleanup = dict(r.cleanup);
  if (cleanup === null) cleanupBad.push("RUNNER_RESULT_MALFORMED:cleanup");
  const dispose = cleanup === null ? null : str(cleanup.dispose);

  const stdout = bytesOfStream("stdout", r.stdout, bad);
  const stderr = bytesOfStream("stderr", r.stderr, bad);

  const receiver = ctx.receiver ?? { baselineHits: null, finalHits: null, samples: 0, failures: 0 };
  const problems = [...arr(cleanup?.problems).map(String), ...cleanupBad];

  return base({
    provenance,
    spawn: {
      attempted: started === true || trigger === "SPAWN_FAILED",
      ok: started === true,
      pid: child === null ? null : num(child.pid),
    },
    sends,
    stdout,
    stderr,
    frameError,
    initResponseAtMs: num(r.initResponseAtMs),
    exit: {
      observed: exit?.observed === true,
      code: exit === null ? null : num(exit.code),
      signal: exit === null ? null : str(exit.signal),
      tMs: exit === null ? null : num(exit.tMs),
    },
    stdinClosed: {
      byHarness: stdinClosed?.byHarness === true,
      ok: stdinClosed === null ? null : bool(stdinClosed.ok),
      tMs: stdinClosed === null ? null : num(stdinClosed.tMs),
    },
    kill: {
      count: kill === null ? 0 : (num(kill.count) ?? 0),
      firstTMs: kill === null ? null : num(kill.firstTMs),
      confirmed: kill === null ? null : bool(kill.confirmed),
    },
    trigger: trigger !== null && TRIGGERS.includes(trigger) ? trigger : null,
    also,
    abort,
    live: {
      stderrCheckedBytes: num(live?.stderrCheckedBytes) ?? 0,
      stdoutFramesChecked: num(live?.stdoutFramesChecked) ?? 0,
      receiver,
      processes: {
        samples: num(processes?.samples) ?? 0,
        failures: num(processes?.failures) ?? 0,
        maxDescendants: num(processes?.maxDescendants) ?? 0,
        imagesSeen: arr(processes?.imagesSeen).map(String),
        disallowed: arr(processes?.disallowed).map(String),
      },
      files: { samples: num(files?.samples) ?? 0, failures: num(files?.failures) ?? 0 },
    },
    roots,
    artifacts,
    timeline: {
      observationMs: timeline === null ? null : num(timeline.observationMs),
      cleanupMs: timeline === null ? null : num(timeline.cleanupMs),
    },
    cleanup: {
      childExitConfirmed: cleanup?.childExitConfirmed === true,
      streamsClosed: cleanup === null ? null : bool(cleanup.streamsClosed),
      descendantsAliveAfter: cleanup === null ? null : num(cleanup.descendantsAliveAfter),
      descendantTracking:
        cleanup?.descendantTracking === "ROOT_PRESENT" ||
        cleanup?.descendantTracking === "ROOT_GONE"
          ? cleanup.descendantTracking
          : null,
      dispose: dispose === "OK" || dispose === "FAILED" ? dispose : "NOT_CALLED",
      timersCancelled: cleanup === null ? false : cleanup.timersCancelled === true,
      problems,
    },
    externalReasons: bad.map((field) => `RUNNER_RESULT_MALFORMED:${field}`),
  });
}
