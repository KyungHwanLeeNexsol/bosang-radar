// Windows 러너(앞으로 만들 scripts/semgrep-lsp-isolation/windows/lsp-scan-runner.ps1)가 남긴 결과 JSON 을 LSP-SCAN-1 사실(ScanFacts)로 옮기는 순수 어댑터.
//
// 러너는 흐름만 정한다(`initialized`·`didOpen` 을 보낼지, 장벽과 두 묶음을 기다릴지, 중단 조건과 상한을 지킨다). 초기화 응답의 해석, 로그 신호의 해석, 16개 조건의
// 판정, 두 묶음과 settle 창의 시각 계산은 여기서 하지 않는다 — 원문 바이트(stdout·stderr)와 청크 시간표와 표시를 lsp-scan-record.ts 가 다시 풀어서 한다.
// 그래서 TS 실행기(lsp-scan-run.ts)와 Windows 러너의 기록이 같은 규칙으로 해석된다. 러너의 자기 보고(결과 JSON)는 사실 후보일 뿐이다.
//
// 러너 결과가 형식에 맞지 않으면 사실에 `RUNNER_RESULT_MALFORMED:<필드>` 사유를 싣고 안전한 쪽(관측 불성립·정리 실패)의 값으로 둔다. 관측하지 못한 값을
// 채우지 않는다: 빠졌거나 형식이 틀리거나 서로 어긋난 것(오프셋이 이어지지 않음, 시각이 줄어듦, 해시가 원문과 다름)은 기본값이 아니라 사유가 된다.
// 수신기(A3)·파일 해시·신원·결합·복구는 러너 밖(관리자 쪽)에서 재서 문맥(ScanRunnerContext)으로 넘긴다.
//
// ── 결과 JSON 스키마 (kind "lsp-scan-runner-result", schema 1) ─────────────────────────────────────────────────
//   schema:1  kind:"lsp-scan-runner-result"  runToken:string  mode:"stub"|"semgrep-lsp"
//   refused:string|null  refusals:string[]      요청을 거절했다(아무것도 만들지 않았다): refused 가 비어 있지 않으면 이 둘만 읽는다
//   error:string|null  errorPhase:"CLEANUP"|string|null
//   request: { envNames:string[]  (자식에게 준 환경 이름 11개, 순서 무관, 정확히 LSP_MIN_ENV_NAMES 집합),
//              envPath:string     (자식에게 준 PATH **값**),  workingDirectory:string (자식의 작업 폴더) }      ← started 일 때 필수
//   child: { started:boolean, pid:number|null }
//   sends: [{ label:"initialize"|"initialized"|"didOpen"|"shutdown"|"exit", tMs:number, ok:boolean,
//             stderrBytesAtSend:int>=0, stdoutBytesAtSend:int>=0       (initialized·didOpen 은 필수: 쓰기 직전까지 읽은 바이트 수),
//             didOpen?: { uri:string, languageId:string, version:number, textSha256:hex64 }   (label==="didOpen" 일 때 필수) }]
//   trigger: ScanTrigger  also:ScanTrigger[]
//   abort: { condition:"A1".."A7"|"A9"|"A10", detail:string, tMs:number } | null
//   frameError: { kind:"MALFORMED"|"TRUNCATED", detail:string, atByte:number } | null
//   initResponseAtMs:number|null
//   markers: { barrierDoneAtMs:number|null, didOpenSent:{ tMs:number, stdoutOffset:int>=0, stderrOffset:int>=0 }|null }   (키는 반드시 있어야 한다)
//   settle:  { endedAtMs:number|null }
//   chunks:  [{ stream:"stdout"|"stderr", offset:int>=0, length:int>0, tMs:number }]       스트림별로 offset 이 빈틈·겹침 없이 이어지고 tMs 가 줄지 않는다
//   liveView:{ preOpenEvidence:boolean, diagnosticsState:"NONE"|"ONE"|"MULTIPLE", diagnosticsCompleteAtMs:number|null,
//              logState:"INCOMPLETE"|"COMPLETE"|"VIOLATED", logCompleteAtMs:number|null, bothCompleteAtMs:number|null }       ← started 일 때 필수
//   stdout / stderr: { b64:string(원문; 별도 .bin 파일이면 생략하고 문맥 rawBytes 로 준다), bytesRead:int(읽은 전체), sha256:hex64(보관한 바이트의 해시),
//                      overflow:boolean, eof:boolean, readFailed:boolean, error:string|null }
//   exit: { observed:boolean, code:number|null, signal:string|null, tMs:number|null }
//   stdinClosed: { byHarness:boolean, ok:boolean|null, tMs:number|null }   kill: { count:int, firstTMs:number|null, confirmed:boolean|null }
//   live: { stderrCheckedBytes:int, stdoutFramesChecked:int, processes:{ samples, failures, maxDescendants, imagesSeen:string[], disallowed:string[] }, files:{ samples, failures } }
//   roots: [{ role:"WORKSPACE"|"RULES_DIR"|"HOME_DIR", filesBefore:int|null, filesAfter:int|null, added:string[], removed:string[] }]   (세 역할 모두)
//   files: { target:{ sourceSha256, afterWriteSha256, afterRunSha256 }, probe:{ sourceSha256, afterCopySha256, afterRunSha256 } }   (각 hex64|null)
//   artifacts: [{ label:string, before:hex64|null, after:hex64|null }]
//   timeline: { observationMs:number|null, cleanupMs:number|null }
//   cleanup: { childExitConfirmed:boolean, streamsClosed:boolean|null, descendantsAliveAfter:int|null, descendantTracking:"ROOT_PRESENT"|"ROOT_GONE"|null,
//              dispose:"OK"|"FAILED"|"NOT_CALLED", timersCancelled:boolean, problems:string[] }
//
// 공개 API:
//   factsFromScanRunnerResult(json, ctx): ScanFacts
//   SCAN_RUNNER_RESULT_SCHEMA / SCAN_RUNNER_RESULT_KIND

import type { FrameDecodeError } from "./framing";
import {
  LSP_MIN_ENV_NAMES,
  WATCHED_ROLES,
  type ArtifactFacts,
  type StreamFacts,
  type WatchedRole,
  type WatchedRootFacts,
} from "./lsp-min";
import { probePathOf } from "./lsp-rules";
import {
  LSP_SCAN_LIMITS,
  LSP_SCAN_SEND_ORDER,
  scanLayout,
  scanTargetUri,
  type ScanAbortCondition,
  type ScanLimits,
  type ScanSendLabel,
  type ScanTrigger,
} from "./lsp-scan";
import type {
  ScanChunk,
  ScanDidOpenMarker,
  ScanFacts,
  ScanLiveView,
  ScanProbeFacts,
  ScanRecoveryFacts,
  ScanSendFact,
  ScanTargetFacts,
} from "./lsp-scan-record";
import { sha256Hex } from "./sha";
import type { Provenance } from "./types";

export const SCAN_RUNNER_RESULT_SCHEMA = 1;
export const SCAN_RUNNER_RESULT_KIND = "lsp-scan-runner-result";

export interface ScanRunnerContext {
  runId: string;
  /** 러너에게 준 작업 폴더(`<작업 폴더>\lsp-scan`). 로딩 줄·외부 명령 줄·진단 URI 의 기대값을 여기서 도출한다. 없으면 경로를 비교할 수 없다. */
  work: string | null;
  expectedVersion?: string | null;
  /** 요청에 실은 한도. 없으면 기본 상한. */
  limits?: ScanLimits;
  /** 관리자 쪽이 수신기를 실행 전후에 읽은 값. 주지 않으면 관측 불성립이다. */
  receiver?: {
    baselineHits: number | null;
    finalHits: number | null;
    samples: number;
    failures: number;
  };
  /** 관리자 쪽이 잰 프로브 해시. 필드를 주면(null 포함) 그 값이 러너가 보고한 값보다 우선한다. */
  probe?: Partial<ScanProbeFacts>;
  /** 관리자 쪽이 잰 합성 파일 해시. 위와 같다. */
  target?: Partial<ScanTargetFacts>;
  /** 원문 바이트를 결과 JSON 이 아닌 별도 파일(.bin)에 둔 경우의 내용. 있으면 b64 대신 쓰고 sha256 으로 대조한다. */
  rawBytes?: { stdout?: Uint8Array; stderr?: Uint8Array };
  /** 관리자가 자식에게 주라고 한 PATH 값. 주면 러너가 보고한 값과 같아야 한다. */
  expectedPath?: string | null;
  /** 시스템 복구 결과(관측 판정과 따로 기록된다). */
  recovery?: ScanRecoveryFacts | null;
}

const TRIGGERS: readonly ScanTrigger[] = [
  "NORMAL",
  "INIT_INVALID",
  "INIT_TIMEOUT",
  "RULES_TIMEOUT",
  "SCAN_TIMEOUT",
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
const CONDITIONS: readonly ScanAbortCondition[] = [
  "A1",
  "A2",
  "A3",
  "A4",
  "A5",
  "A6",
  "A7",
  "A9",
  "A10",
];
const LABELS = LSP_SCAN_SEND_ORDER as readonly ScanSendLabel[];
const SHA = /^[0-9a-f]{64}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const DIAG_STATES = ["NONE", "ONE", "MULTIPLE"];
const LOG_STATES = ["INCOMPLETE", "COMPLETE", "VIOLATED"];

type Dict = Record<string, unknown>;

function dict(value: unknown): Dict | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Dict)
    : null;
}
function arr(value: unknown): unknown[] {
  // PowerShell 5.1 의 ConvertTo-Json 은 원소 하나짜리 배열을 스칼라로, 빈 배열을 null 이나 빈 객체로 쓰는 경우가 있어 둘 다 받아 준다.
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
function int0(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}
function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}
function hex(value: unknown): string | null {
  return typeof value === "string" && SHA.test(value) ? value : null;
}
/** 키가 반드시 있어야 하는 `number | null` 필드. 키가 없거나 다른 형식이면 undefined. */
function numOrNullStrict(d: Dict | null, key: string): number | null | undefined {
  if (d === null || !(key in d)) return undefined;
  const v = d[key];
  if (v === null) return null;
  return num(v) ?? undefined;
}

function streamOf(
  name: "stdout" | "stderr",
  value: unknown,
  raw: Uint8Array | undefined,
  bad: string[]
): StreamFacts {
  const d = dict(value);
  if (d === null) {
    bad.push(name);
    return { bytes: new Uint8Array(0), total: 0, overflow: false, eof: false, readFailed: true };
  }
  const overflow = bool(d.overflow);
  const readFailed = bool(d.readFailed);
  const eof = bool(d.eof);
  if (overflow === null || readFailed === null || eof === null) bad.push(`${name}.state`);
  let bytes: Uint8Array = new Uint8Array(0);
  let have = false;
  if (raw !== undefined) {
    bytes = raw;
    have = true;
  } else if (typeof d.b64 === "string" && BASE64.test(d.b64)) {
    bytes = Uint8Array.from(Buffer.from(d.b64, "base64"));
    have = true;
  } else {
    bad.push(`${name}.b64`);
  }
  if (have) {
    const sha = hex(d.sha256);
    if (sha === null || sha !== sha256Hex(bytes)) bad.push(`${name}.sha256`);
    const read = int0(d.bytesRead);
    if (read === null || (overflow !== true && read !== bytes.byteLength))
      bad.push(`${name}.bytesRead`);
  }
  return {
    bytes,
    total: int0(d.bytesRead) ?? bytes.byteLength,
    overflow: overflow ?? false,
    eof: eof ?? false,
    readFailed: have ? (readFailed ?? true) : true,
    readError: readFailed === true ? str(d.error) : null,
  };
}

function chunksOf(
  value: unknown,
  stdoutLen: number,
  stderrLen: number,
  bad: string[]
): ScanChunk[] | null {
  if (!Array.isArray(value) && value !== null && dict(value) === null) {
    bad.push("chunks");
    return null;
  }
  const out: ScanChunk[] = [];
  let ok = true;
  const next = { stdout: 0, stderr: 0 };
  const last = { stdout: -Infinity, stderr: -Infinity };
  for (const item of arr(value)) {
    const c = dict(item);
    const stream = c === null ? null : c.stream;
    const offset = c === null ? null : int0(c.offset);
    const length = c === null ? null : int0(c.length);
    const tMs = c === null ? null : num(c.tMs);
    if (
      c === null ||
      (stream !== "stdout" && stream !== "stderr") ||
      offset === null ||
      length === null ||
      length === 0 ||
      tMs === null ||
      tMs < 0
    ) {
      ok = false;
      continue;
    }
    if (offset !== next[stream]) bad.push("chunks.not_contiguous");
    next[stream] = offset + length;
    if (tMs < last[stream]) bad.push("chunks.time_decreasing");
    else last[stream] = tMs;
    out.push({ stream, offset, length, tMs });
  }
  if (!ok) {
    bad.push("chunks");
    return null;
  }
  if (next.stdout !== stdoutLen || next.stderr !== stderrLen) bad.push("chunks.total_mismatch");
  return out;
}

function liveViewOf(value: unknown, bad: string[]): ScanLiveView | null {
  const d = dict(value);
  const diag = d === null ? undefined : d.diagnosticsState;
  const log = d === null ? undefined : d.logState;
  const dAt = numOrNullStrict(d, "diagnosticsCompleteAtMs");
  const lAt = numOrNullStrict(d, "logCompleteAtMs");
  const bAt = numOrNullStrict(d, "bothCompleteAtMs");
  if (
    d === null ||
    typeof d.preOpenEvidence !== "boolean" ||
    typeof diag !== "string" ||
    !DIAG_STATES.includes(diag) ||
    typeof log !== "string" ||
    !LOG_STATES.includes(log) ||
    dAt === undefined ||
    lAt === undefined ||
    bAt === undefined
  ) {
    bad.push("liveView");
    return null;
  }
  return {
    preOpenEvidence: d.preOpenEvidence,
    diagnosticsState: diag as ScanLiveView["diagnosticsState"],
    diagnosticsCompleteAtMs: dAt,
    logState: log as ScanLiveView["logState"],
    logCompleteAtMs: lAt,
    bothCompleteAtMs: bAt,
  };
}

/**
 * 러너 결과(JSON 을 읽은 값)에서 사실을 만든다. 던지지 않는다. 형식이 틀린 필드는 externalReasons 에 `RUNNER_RESULT_MALFORMED:<필드>` 로 남긴다.
 * 거절된 요청(러너가 서버를 띄우지 않았다)은 refusals 만 채우고 spawn.attempted 는 false 다.
 */
export function factsFromScanRunnerResult(json: unknown, ctx: ScanRunnerContext): ScanFacts {
  const limits = ctx.limits ?? { ...LSP_SCAN_LIMITS };
  const bad: string[] = [];
  const cleanupBad: string[] = [];
  const r = dict(json);
  const layout = ctx.work === null ? null : scanLayout(ctx.work);
  const hexPick = (admin: string | null | undefined, runner: string | null): string | null =>
    admin !== undefined ? admin : runner;
  const receiver = ctx.receiver ?? { baselineHits: null, finalHits: null, samples: 0, failures: 0 };
  const base = (over: Partial<ScanFacts>): ScanFacts => ({
    runId: ctx.runId,
    provenance: null,
    refusals: [],
    limits,
    expectedVersion: ctx.expectedVersion ?? null,
    probePath: layout === null ? null : probePathOf(layout),
    workspace: layout === null ? null : layout.workspace,
    expectedTargetUri: layout === null ? null : scanTargetUri(layout),
    spawn: { attempted: false, ok: false, pid: null },
    sends: [],
    stdout: { bytes: new Uint8Array(0), total: 0, overflow: false, eof: false, readFailed: false },
    stderr: { bytes: new Uint8Array(0), total: 0, overflow: false, eof: false, readFailed: false },
    chunks: [],
    markers: { barrierDoneAtMs: null, didOpenSent: null },
    liveView: null,
    frameError: null,
    initResponseAtMs: null,
    settle: { endedAtMs: null },
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
    probe: {
      sourceSha256: ctx.probe?.sourceSha256 ?? null,
      afterCopySha256: ctx.probe?.afterCopySha256 ?? null,
      afterRunSha256: ctx.probe?.afterRunSha256 ?? null,
    },
    target: {
      sourceSha256: ctx.target?.sourceSha256 ?? null,
      afterWriteSha256: ctx.target?.afterWriteSha256 ?? null,
      afterRunSha256: ctx.target?.afterRunSha256 ?? null,
    },
    artifacts: [],
    childEnv: { path: null, workingDirectory: null },
    externalReasons: [],
    recovery: ctx.recovery ?? null,
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

  if (r === null || r.schema !== SCAN_RUNNER_RESULT_SCHEMA || r.kind !== SCAN_RUNNER_RESULT_KIND) {
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

  // 자식에게 준 환경: 이름 집합이 계약과 같고, PATH 값과 작업 폴더를 알려야 한다 (계획 3.6절의 빈틈).
  let childEnv: ScanFacts["childEnv"] = { path: null, workingDirectory: null };
  const reasons: string[] = [];
  if (started === true) {
    const req = dict(r.request);
    if (req === null) bad.push("request");
    else {
      const names = arr(req.envNames).map(String);
      const same =
        names.length === LSP_MIN_ENV_NAMES.length &&
        new Set(names).size === names.length &&
        LSP_MIN_ENV_NAMES.every((n) => names.includes(n));
      if (!same) bad.push("request.envNames");
      const path = str(req.envPath);
      const cwd = str(req.workingDirectory);
      if (path === null) bad.push("request.envPath");
      if (cwd === null) bad.push("request.workingDirectory");
      childEnv = { path, workingDirectory: cwd };
      if (path !== null && typeof ctx.expectedPath === "string" && path !== ctx.expectedPath) {
        reasons.push("RUNNER_PATH_UNEXPECTED");
      }
    }
  }

  const sends: ScanSendFact[] = [];
  for (const item of arr(r.sends)) {
    const d = dict(item);
    const label = d === null ? null : (str(d.label) as ScanSendLabel | null);
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
    const stderrAt = int0(d.stderrBytesAtSend);
    const stdoutAt = int0(d.stdoutBytesAtSend);
    // initialized 와 didOpen 은 송신 위치(쓰기 직전까지 읽은 바이트 수)가 있어야 "그 이전" 신호를 사후에 가려낼 수 있다. 빠졌으면 채우지 않고 형식 문제로 남긴다.
    if (label === "initialized" || label === "didOpen") {
      if (stderrAt === null) bad.push("sends.stderrBytesAtSend");
      if (stdoutAt === null) bad.push("sends.stdoutBytesAtSend");
    }
    const fact: ScanSendFact = {
      label,
      tMs: num(d.tMs) as number,
      ok: d.ok as boolean,
      stderrBytesAtSend: stderrAt,
      stdoutBytesAtSend: stdoutAt,
    };
    if (label === "didOpen") {
      const o = dict(d.didOpen);
      const uri = o === null ? null : str(o.uri);
      const languageId = o === null ? null : str(o.languageId);
      const version = o === null ? null : num(o.version);
      const textSha256 = o === null ? null : hex(o.textSha256);
      if (
        o === null ||
        uri === null ||
        languageId === null ||
        version === null ||
        textSha256 === null
      ) {
        bad.push("sends.didOpen");
      } else {
        fact.didOpen = { uri, languageId, version, textSha256 };
      }
    }
    sends.push(fact);
  }

  const trigger = str(r.trigger) as ScanTrigger | null;
  if (trigger === null || !TRIGGERS.includes(trigger)) bad.push("trigger");
  const also = arr(r.also)
    .map((x) => str(x) as ScanTrigger)
    .filter((x) => TRIGGERS.includes(x));

  let abort: ScanFacts["abort"] = null;
  if (r.abort !== null && r.abort !== undefined) {
    const a = dict(r.abort);
    const cond = a === null ? null : (str(a.condition) as ScanAbortCondition | null);
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

  // 표시와 시간표: 두 스트림의 사전/사후 경계와 도착 시각. 서버를 띄웠다면 반드시 있어야 한다(없으면 시각 판단을 하지 않고 관측 불성립이다).
  const markersRaw = dict(r.markers);
  let barrierDoneAtMs: number | null = null;
  let didOpenSent: ScanDidOpenMarker | null = null;
  if (markersRaw === null) {
    if (started === true) bad.push("markers");
  } else {
    const barrier = numOrNullStrict(markersRaw, "barrierDoneAtMs");
    if (barrier === undefined) bad.push("markers.barrierDoneAtMs");
    else barrierDoneAtMs = barrier;
    if (!("didOpenSent" in markersRaw)) bad.push("markers.didOpenSent");
    else if (markersRaw.didOpenSent !== null) {
      const m = dict(markersRaw.didOpenSent);
      const tMs = m === null ? null : num(m.tMs);
      const so = m === null ? null : int0(m.stdoutOffset);
      const eo = m === null ? null : int0(m.stderrOffset);
      if (tMs === null || so === null || eo === null) bad.push("markers.didOpenSent");
      else didOpenSent = { tMs, stdoutOffset: so, stderrOffset: eo };
    }
  }
  const settleRaw = dict(r.settle);
  let settleEndedAtMs: number | null = null;
  if (settleRaw === null) {
    if (started === true) bad.push("settle");
  } else {
    const ended = numOrNullStrict(settleRaw, "endedAtMs");
    if (ended === undefined) bad.push("settle.endedAtMs");
    else settleEndedAtMs = ended;
  }

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
        filesBefore: int0(item.filesBefore),
        filesAfter: int0(item.filesAfter),
        added: arr(item.added).map(String),
        removed: arr(item.removed).map(String),
        samples: 0,
        failures: 0,
      });
    }
  }

  // 합성 파일·프로브 해시: 관리자 문맥의 값이 있으면(null 포함) 그 값, 없으면 러너가 보고한 값.
  const filesRaw = dict(r.files);
  const targetRaw = filesRaw === null ? null : dict(filesRaw.target);
  const probeRaw = filesRaw === null ? null : dict(filesRaw.probe);
  if (filesRaw === null || targetRaw === null || probeRaw === null) bad.push("files");
  const reported = (d: Dict | null, role: string, key: string): string | null => {
    if (d === null) return null;
    const v = d[key];
    if (v === null || v === undefined) return null;
    const h = hex(v);
    if (h === null) bad.push(`files.${role}.${key}`);
    return h;
  };
  const probe: ScanProbeFacts = {
    sourceSha256: hexPick(ctx.probe?.sourceSha256, reported(probeRaw, "probe", "sourceSha256")),
    afterCopySha256: hexPick(
      ctx.probe?.afterCopySha256,
      reported(probeRaw, "probe", "afterCopySha256")
    ),
    afterRunSha256: hexPick(
      ctx.probe?.afterRunSha256,
      reported(probeRaw, "probe", "afterRunSha256")
    ),
  };
  const target: ScanTargetFacts = {
    sourceSha256: hexPick(ctx.target?.sourceSha256, reported(targetRaw, "target", "sourceSha256")),
    afterWriteSha256: hexPick(
      ctx.target?.afterWriteSha256,
      reported(targetRaw, "target", "afterWriteSha256")
    ),
    afterRunSha256: hexPick(
      ctx.target?.afterRunSha256,
      reported(targetRaw, "target", "afterRunSha256")
    ),
  };

  const artifacts: ArtifactFacts[] = arr(r.artifacts)
    .map(dict)
    .filter((d): d is Dict => d !== null)
    .map((d) => ({ label: str(d.label) ?? "", before: str(d.before), after: str(d.after) }));

  const timeline = dict(r.timeline);
  const cleanup = dict(r.cleanup);
  if (cleanup === null) cleanupBad.push("RUNNER_RESULT_MALFORMED:cleanup");
  const dispose = cleanup === null ? null : str(cleanup.dispose);

  const stdout = streamOf("stdout", r.stdout, ctx.rawBytes?.stdout, bad);
  const stderr = streamOf("stderr", r.stderr, ctx.rawBytes?.stderr, bad);
  const chunks =
    started === true || r.chunks !== undefined
      ? chunksOf(r.chunks, stdout.bytes.byteLength, stderr.bytes.byteLength, bad)
      : [];
  const liveView = started === true ? liveViewOf(r.liveView, bad) : null;
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
    chunks,
    markers: { barrierDoneAtMs, didOpenSent },
    liveView,
    frameError,
    initResponseAtMs: num(r.initResponseAtMs),
    settle: { endedAtMs: settleEndedAtMs },
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
    probe,
    target,
    artifacts,
    childEnv,
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
    externalReasons: [
      ...[...new Set(bad)].map((field) => `RUNNER_RESULT_MALFORMED:${field}`),
      ...reasons,
    ],
  });
}
