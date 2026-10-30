// Windows 러너(scripts/semgrep-lsp-isolation/windows/lsp-rules-runner.ps1)가 남긴 결과 JSON을 LSP-RULES-1 사실(RulesFacts)로 옮기는 순수 어댑터.
//
// 러너는 흐름만 정한다(`initialized`를 보낼지, 장벽을 기다릴지, 중단 조건과 상한을 지킨다). 초기화 응답의 해석, 로그 신호의 해석, 13개 조건의 판정은 여기서
// 하지 않는다 — 원문 바이트(stdout·stderr)를 lsp-rules-record.ts가 다시 풀어서 한다. 그래서 실시간 실행기(lsp-rules-run.ts)와 Windows 러너의 기록이
// 같은 규칙으로 해석된다. 러너의 자기 보고(결과 JSON)는 사실 후보일 뿐이다.
//
// 러너 결과가 형식에 맞지 않으면 사실에 `RUNNER_RESULT_MALFORMED:<필드>` 사유를 싣고 안전한 쪽(관측 불성립·정리 실패)의 값으로 둔다. 관측하지 못한 값을
// 채우지 않는다. 수신기(A3)·프로브 해시·신원·결합은 러너 밖(관리자 쪽)에서 재서 문맥(RulesRunnerContext)으로 넘긴다.
//
// 공개 API:
//   factsFromRulesRunnerResult(json, ctx): RulesFacts
//   RULES_RUNNER_RESULT_SCHEMA / RULES_RUNNER_RESULT_KIND

import type { FrameDecodeError } from "./framing";
import {
  WATCHED_ROLES,
  type ArtifactFacts,
  type StreamFacts,
  type WatchedRole,
  type WatchedRootFacts,
} from "./lsp-min";
import {
  LSP_RULES_LIMITS,
  probePathOf,
  rulesLayout,
  type RulesAbortCondition,
  type RulesLimits,
  type RulesSendLabel,
  type RulesTrigger,
} from "./lsp-rules";
import type { RulesFacts, RulesProbeFacts, RulesSendFact } from "./lsp-rules-record";
import type { Provenance } from "./types";

export const RULES_RUNNER_RESULT_SCHEMA = 1;
export const RULES_RUNNER_RESULT_KIND = "lsp-rules-runner-result";

export interface RulesRunnerContext {
  runId: string;
  /** 러너에게 준 작업 폴더. 로딩 줄의 기대 경로(프로브 파일의 전체 경로)를 여기서 도출한다. 없으면 경로를 비교할 수 없다. */
  work: string | null;
  expectedVersion?: string | null;
  /** 요청에 실은 한도. 없으면 기본 상한. */
  limits?: RulesLimits;
  /** 관리자 쪽이 수신기를 실행 전후에 읽은 값. 주지 않으면 관측 불성립이다. */
  receiver?: {
    baselineHits: number | null;
    finalHits: number | null;
    samples: number;
    failures: number;
  };
  /** 관리자 쪽이 잰 프로브 해시(복사 전 원본, 복사 직후, 실행 뒤). 주지 않으면 해시를 알 수 없다. */
  probe?: Partial<RulesProbeFacts>;
}

const TRIGGERS: readonly RulesTrigger[] = [
  "NORMAL",
  "INIT_INVALID",
  "INIT_TIMEOUT",
  "RULES_TIMEOUT",
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
const CONDITIONS: readonly RulesAbortCondition[] = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A9"];
const LABELS: readonly RulesSendLabel[] = ["initialize", "initialized", "shutdown", "exit"];

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
    readError: readFailed === true ? str(d.error) : null,
  };
}

/**
 * 러너 결과(JSON을 읽은 값)에서 사실을 만든다. 던지지 않는다. 형식이 틀린 필드는 externalReasons에 `RUNNER_RESULT_MALFORMED:<필드>`로 남긴다.
 * 거절된 요청(러너가 서버를 띄우지 않았다)은 refusals만 채우고 spawn.attempted는 false다.
 */
export function factsFromRulesRunnerResult(json: unknown, ctx: RulesRunnerContext): RulesFacts {
  const limits = ctx.limits ?? { ...LSP_RULES_LIMITS };
  const bad: string[] = [];
  const cleanupBad: string[] = [];
  const r = dict(json);
  const probePath = ctx.work === null ? null : probePathOf(rulesLayout(ctx.work));
  const probe: RulesProbeFacts = {
    sourceSha256: ctx.probe?.sourceSha256 ?? null,
    afterCopySha256: ctx.probe?.afterCopySha256 ?? null,
    afterRunSha256: ctx.probe?.afterRunSha256 ?? null,
  };
  const receiver = ctx.receiver ?? { baselineHits: null, finalHits: null, samples: 0, failures: 0 };
  const base = (over: Partial<RulesFacts>): RulesFacts => ({
    runId: ctx.runId,
    provenance: null,
    refusals: [],
    limits,
    expectedVersion: ctx.expectedVersion ?? null,
    probePath,
    spawn: { attempted: false, ok: false, pid: null },
    sends: [],
    stdout: { bytes: new Uint8Array(0), total: 0, overflow: false, eof: false, readFailed: false },
    stderr: { bytes: new Uint8Array(0), total: 0, overflow: false, eof: false, readFailed: false },
    frameError: null,
    initResponseAtMs: null,
    barrier: { reachedAtMs: null, settledAtMs: null },
    exit: { observed: false, code: null, signal: null, tMs: null },
    stdinClosed: { byHarness: false, ok: null, tMs: null },
    kill: { count: 0, firstTMs: null, confirmed: null },
    trigger: null,
    also: [],
    abort: null,
    live: {
      stderrCheckedBytes: 0,
      stdoutFramesChecked: 0,
      receiver,
      processes: { samples: 0, failures: 0, maxDescendants: 0, imagesSeen: [], disallowed: [] },
      files: { samples: 0, failures: 0 },
    },
    roots: [],
    probe,
    artifacts: [],
    externalReasons: [],
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
    ...over,
  });

  if (
    r === null ||
    r.schema !== RULES_RUNNER_RESULT_SCHEMA ||
    r.kind !== RULES_RUNNER_RESULT_KIND
  ) {
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
    if (str(r.errorPhase) === "CLEANUP") cleanupBad.push("RUNNER_ERROR_IN_CLEANUP");
    else bad.push("runner.error");
  }

  const child = dict(r.child);
  const started = child === null ? null : bool(child.started);
  if (started === null) bad.push("child.started");

  const sends: RulesSendFact[] = [];
  for (const item of arr(r.sends)) {
    const d = dict(item);
    const label = d === null ? null : (str(d.label) as RulesSendLabel | null);
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
    const stderrAt = num(d.stderrBytesAtSend);
    const stdoutAt = num(d.stdoutBytesAtSend);
    // `initialized`는 송신 위치(쓰기 직전까지 읽은 바이트 수)가 있어야 "initialized 이전" 신호를 사후에 가려낼 수 있다. 빠졌으면 채우지 않고 형식 문제로 남긴다.
    if (label === "initialized") {
      if (stderrAt === null || stderrAt < 0) bad.push("sends.stderrBytesAtSend");
      if (stdoutAt === null || stdoutAt < 0) bad.push("sends.stdoutBytesAtSend");
    }
    sends.push({
      label,
      tMs: num(d.tMs) as number,
      ok: d.ok as boolean,
      stderrBytesAtSend: stderrAt,
      stdoutBytesAtSend: stdoutAt,
    });
  }

  const trigger = str(r.trigger) as RulesTrigger | null;
  if (trigger === null || !TRIGGERS.includes(trigger)) bad.push("trigger");
  const also = arr(r.also)
    .map((x) => str(x) as RulesTrigger)
    .filter((x) => TRIGGERS.includes(x));

  let abort: RulesFacts["abort"] = null;
  if (r.abort !== null && r.abort !== undefined) {
    const a = dict(r.abort);
    const cond = a === null ? null : (str(a.condition) as RulesAbortCondition | null);
    if (a === null || cond === null || !CONDITIONS.includes(cond) || num(a.tMs) === null) {
      bad.push("abort");
    } else abort = { condition: cond, detail: str(a.detail) ?? "", tMs: num(a.tMs) as number };
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
  // 신호 이름이 문자열도 null도 아니면 "신호 없이 끝났다"로 읽지 않는다.
  else if (exit.signal !== undefined && exit.signal !== null && typeof exit.signal !== "string") {
    bad.push("exit.signal");
  }
  const stdinClosed = dict(r.stdinClosed);
  if (stdinClosed === null || bool(stdinClosed.byHarness) === null) bad.push("stdinClosed");
  const kill = dict(r.kill);
  if (kill === null || num(kill.count) === null) bad.push("kill");
  const barrier = dict(r.barrier);
  if (barrier === null) bad.push("barrier");

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
    barrier: {
      reachedAtMs: barrier === null ? null : num(barrier.reachedAtMs),
      settledAtMs: barrier === null ? null : num(barrier.settledAtMs),
    },
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
