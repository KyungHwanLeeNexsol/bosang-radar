// 도구 버전과 휠 sha256의 관측(ADR C0 (a)). CLI가 null로 넘기던 toolVersionObserved·wheelSha256Observed를 실제 관측 결과로 채운다.
//
// 이 모듈은 파일·프로세스를 직접 만지지 않는다: 프로세스는 ProcessPort(버전 확인 자식), 파일 바이트는 ArtifactHashPort(휠 해시),
// 폴더는 FsPort, 시간은 Clock으로만 만진다. 그래서 child_process를 가져오지 않고(어댑터는 process-node.ts·artifact-node.ts) 시험은 가짜
// 포트와 가상 시계로 결정적이다. 어떤 경로로 끝나도 던지지 않고 "관측했다" 또는 "관측하지 못했다(이유 토큰)"를 돌려준다 — 관측하지 못한
// 값을 핀의 값으로 채우거나 추정하지 않는다(null은 호출자가 사전 검사에 그대로 넘겨 TOOL_VERSION_UNVERIFIED·WHEEL_HASH_UNVERIFIED가 된다).
//
// ── 버전 확인 프로세스 (LSP 서버 프로세스와 별개) ─────────────────────────────────────────────────────────────────────
//  · 명령은 호출자가 준 절대 경로의 실행 파일 하나와 인자 **배열**이다(셸 문자열 아님, PATH 탐색 없음). CLI는 `--semgrep-bin`과
//    VERSION_ARGS(`["--version"]`)만 넘긴다.
//  · 시간 제한(timeoutMs), stdout·stderr 크기 제한, 취소(AbortSignal)를 지킨다. 제한을 넘기거나 취소되면 SIGKILL로 끝내고 종료를
//    관찰한다(killWaitMs). 어떤 경로로 끝나도 마지막에 dispose를 부른다(자식·스트림·리스너를 남기지 않는다).
//  · 해석 계약(이 계약은 하네스가 정한 것이며 실제 Semgrep으로 확인하지 않았다 — 형식을 확정하지 못하면 관측 실패다):
//      1. 종료 코드가 0이고 신호로 끝나지 않았다.
//      2. 버전은 **stdout에서만** 읽는다. stderr는 해석하지 않으며 바이트 수만 기록한다(경고가 섞여도 버전 해석에 쓰지 않고, 버전이
//         stderr에만 있으면 관측 실패다).
//      3. stdout은 유효한 UTF-8이고(BOM 불허) 끝의 줄 끝(`\n` 또는 `\r\n`) 하나를 뺀 나머지가 **정확히 한 줄**이다.
//      4. 그 한 줄이 정확히 `숫자.숫자.숫자`(앞자리 0 불허, 접두·접미·공백·`v` 불허)이다. 그 문자열을 그대로 버전으로 쓴다.
//
// ── 휠 해시 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
//  · 호출자가 명시한 파일 하나의 **실제 바이트**로 SHA-256을 계산한다. 경로가 없으면, 파일이 없거나 읽을 수 없거나 크기 제한을 넘거나
//    읽는 도중 바뀌면 관측 실패다(성공값으로 보정하지 않는다). 자동 탐색·다운로드·기본 경로는 없다.
//  · 이 해시는 **그 파일의 바이트**에 대한 사실이다. 실행한 `semgrep` 실행 파일이 그 휠에서 설치되었다는 사실이 아니다(설치 출처
//    검증은 하지 않았다). 관측값과 핀의 기대값·verified 상태는 서로 다른 사실이며 이 모듈은 핀을 읽지도 바꾸지도 않는다.
//
// 공개 API:
//   observeToolVersion({ process, clock }, request): Promise<ToolVersionObservation>
//   observeWheelHash({ hasher }, request): Promise<WheelObservation>
//   runToolObservation(ports, inputs): Promise<ToolObservationResult>     두 관측을 잇고 증거용 요약을 만든다(던지지 않는다)
//   parseVersionStdout(bytes) / buildToolObservationSummary(...) / VERSION_ARGS / DEFAULT_VERSION_LIMITS
//   ArtifactHashPort / ArtifactHashError / DEFAULT_WHEEL_MAX_BYTES

import type {
  ChildHandle,
  Clock,
  ExitInfo,
  FsPort,
  MetricsObserver,
  ObservationStatus,
  Pin,
  ProcessPort,
  Provenance,
  RunToolObservation,
  TimerHandle,
  ToolObservationSummary,
  VersionCheckChildState,
} from "./types";

// ── 버전 확인 ────────────────────────────────────────────────────

/** 버전 확인에 넘기는 인자. 다른 인자(예: LSP 서버의 `lsp --debug`)와 섞지 않는다. */
export const VERSION_ARGS = ["--version"] as const;

export interface VersionCheckLimits {
  /** 시작부터 종료까지의 한도(ms). */
  timeoutMs: number;
  maxStdoutBytes: number;
  maxStderrBytes: number;
  /** 끝내라고 한 뒤 종료를 기다리는 한도(ms). */
  killWaitMs: number;
}

// UNVERIFIED: 실제 Semgrep의 `--version` 소요 시간·출력 크기는 실측하지 못한 추정이다(파이썬 시작 시간이 길 수 있다).
export const DEFAULT_VERSION_LIMITS: VersionCheckLimits = Object.freeze({
  timeoutMs: 30_000,
  maxStdoutBytes: 4096,
  maxStderrBytes: 16_384,
  killWaitMs: 5000,
});

export type ToolVersionFailure =
  | "LOCK_NOT_HELD"
  | "CANCELLED"
  | "STATE_DIR_NOT_CREATED"
  | "SPAWN_FAILED"
  | "TIMEOUT"
  | "OUTPUT_LIMIT_EXCEEDED"
  | "STREAM_READ_FAILED"
  | "KILLED_BY_SIGNAL"
  | "NONZERO_EXIT"
  | "OUTPUT_EMPTY"
  | "OUTPUT_NOT_UTF8"
  | "OUTPUT_NOT_SINGLE_LINE"
  | "OUTPUT_UNRECOGNIZED"
  | "UNEXPECTED_ERROR";

export interface ToolVersionRequest {
  /** 호출자가 검증한 절대 경로의 실행 파일. 이 모듈은 PATH를 탐색하지 않는다. */
  command: string;
  /** 인자 배열(셸 문자열이 아니다). CLI는 VERSION_ARGS를 넘긴다. */
  args: readonly string[];
  cwd: string;
  env: Readonly<Record<string, string>>;
  limits?: Partial<VersionCheckLimits>;
  signal?: AbortSignal;
}

export interface ToolVersionObservation {
  status: ObservationStatus;
  /** OBSERVED일 때만 있다. stdout의 한 줄 그대로다. */
  version: string | null;
  failure: ToolVersionFailure | null;
  /** 시작을 시도하지 않았으면 null. */
  provenance: Provenance | null;
  args: string[] | null;
  exit: ExitInfo | null;
  stdoutBytes: number | null;
  stderrBytes: number | null;
  durationMs: number | null;
  childProcess: VersionCheckChildState;
}

type ParsedVersion = { ok: true; version: string } | { ok: false; failure: ToolVersionFailure };

const VERSION_LINE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** 버전 확인의 stdout 해석 계약(파일 머리말 3·4). 던지지 않는다. */
export function parseVersionStdout(bytes: Uint8Array): ParsedVersion {
  let text: string;
  try {
    // ignoreBOM: true — BOM을 지우지 않고 그대로 두어 형식 검사가 거절하게 한다.
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return { ok: false, failure: "OUTPUT_NOT_UTF8" };
  }
  const body = text.endsWith("\r\n")
    ? text.slice(0, -2)
    : text.endsWith("\n")
      ? text.slice(0, -1)
      : text;
  if (body.length === 0) return { ok: false, failure: "OUTPUT_EMPTY" };
  if (/[\r\n]/.test(body)) return { ok: false, failure: "OUTPUT_NOT_SINGLE_LINE" };
  if (!VERSION_LINE.test(body)) return { ok: false, failure: "OUTPUT_UNRECOGNIZED" };
  return { ok: true, version: body };
}

interface Drain {
  chunks: Uint8Array[];
  total: number;
  overflow: boolean;
  failed: boolean;
}

/** 스트림을 한도까지 모은다. 한도를 넘으면 onOverflow를 부르고 읽기를 그만둔다. 던지지 않는다. */
async function drain(
  stream: AsyncIterable<Uint8Array>,
  acc: Drain,
  limit: number,
  onOverflow: () => void
): Promise<Drain> {
  try {
    for await (const chunk of stream) {
      acc.total += chunk.byteLength;
      if (acc.total > limit) {
        acc.overflow = true;
        onOverflow();
        return acc;
      }
      acc.chunks.push(chunk);
    }
  } catch {
    acc.failed = true;
  }
  return acc;
}

function joinChunks(chunks: readonly Uint8Array[]): Uint8Array {
  const size = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** promise가 ms 안에 이행하면 true. 시간이 먼저 되면 false. 타이머는 항상 해제한다. */
async function settledWithin(
  clock: Clock,
  promise: Promise<unknown>,
  ms: number
): Promise<boolean> {
  let fire: () => void = () => {};
  const timeout = new Promise<boolean>((resolve) => {
    fire = () => resolve(false);
  });
  const handle: TimerHandle = clock.setTimer(() => fire(), ms);
  try {
    return await Promise.race([promise.then(() => true), timeout]);
  } finally {
    handle.cancel();
  }
}

function versionResult(
  partial: Pick<ToolVersionObservation, "status" | "failure"> & Partial<ToolVersionObservation>
): ToolVersionObservation {
  return {
    version: null,
    provenance: null,
    args: null,
    exit: null,
    stdoutBytes: null,
    stderrBytes: null,
    durationMs: null,
    childProcess: "NOT_SPAWNED",
    ...partial,
  };
}

/** 시작하지 않은 관측(예: 잠금이 없다). 프로세스 포트를 만지지 않는다. */
export function notAttemptedVersion(failure: ToolVersionFailure): ToolVersionObservation {
  return versionResult({ status: "NOT_ATTEMPTED", failure });
}

type StopReason = "TIMEOUT" | "CANCELLED" | "OUTPUT_LIMIT_EXCEEDED";

// @MX:ANCHOR: [AUTO] 버전 확인 자식 프로세스의 유일한 생명주기 — 띄우고, 제한하고, 어떤 경로로든 끝내고 정리한다.
// @MX:REASON: "관측하지 못한 값을 채우지 않는다"와 "자식·스트림·리스너를 남기지 않는다"가 이 함수의 finally 한 곳에서만 지켜진다.
export async function observeToolVersion(
  ports: { process: ProcessPort; clock: Clock },
  request: ToolVersionRequest
): Promise<ToolVersionObservation> {
  const { clock } = ports;
  const limits: VersionCheckLimits = { ...DEFAULT_VERSION_LIMITS, ...(request.limits ?? {}) };
  const provenance = ports.process.provenance;
  const args = [...request.args];
  const signal = request.signal;

  if (signal?.aborted) return notAttemptedVersion("CANCELLED");

  const startedAt = clock.now();
  const elapsed = (): number => Math.max(0, Math.round(clock.now() - startedAt));

  let child: ChildHandle;
  try {
    child = await ports.process.spawn({
      command: request.command,
      args,
      cwd: request.cwd,
      env: request.env,
    });
  } catch {
    // 오류 원문(경로·시스템 메시지)은 증거에 싣지 않는다. 토큰만 남긴다.
    return versionResult({
      status: "FAILED",
      failure: "SPAWN_FAILED",
      provenance,
      args,
      durationMs: elapsed(),
    });
  }

  const state = { exit: null as ExitInfo | null, killedByUs: false };
  let stopReason: StopReason | null = null;
  let resolveStop: (reason: StopReason) => void = () => {};
  const stopped = new Promise<StopReason>((resolve) => {
    resolveStop = resolve;
  });
  const stop = (reason: StopReason): void => {
    if (stopReason !== null) return;
    stopReason = reason;
    resolveStop(reason);
  };

  const timer = clock.setTimer(() => stop("TIMEOUT"), limits.timeoutMs);
  const onAbort = (): void => stop("CANCELLED");
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) stop("CANCELLED"); // 띄우는 동안 취소됐다

  const out: Drain = { chunks: [], total: 0, overflow: false, failed: false };
  const err: Drain = { chunks: [], total: 0, overflow: false, failed: false };
  const exitedP = child.exited.then(
    (info) => {
      state.exit = info;
    },
    () => {
      // exited는 거부하지 않는 계약이다. 어겨도 종료를 관측하지 못한 것으로 둔다.
    }
  );
  const outP = drain(child.stdout, out, limits.maxStdoutBytes, () => stop("OUTPUT_LIMIT_EXCEEDED"));
  const errP = drain(child.stderr, err, limits.maxStderrBytes, () => stop("OUTPUT_LIMIT_EXCEEDED"));
  const finished = Promise.all([exitedP, outP, errP]);

  let status: ObservationStatus = "FAILED";
  let failure: ToolVersionFailure | null = null;
  let version: string | null = null;
  try {
    const settled = await Promise.race([
      finished.then(() => ({ kind: "done" as const })),
      stopped.then((reason) => ({ kind: "stop" as const, reason })),
    ]);
    if (settled.kind === "stop") {
      failure = settled.reason;
    } else if (out.overflow || err.overflow) {
      failure = "OUTPUT_LIMIT_EXCEEDED";
    } else if (out.failed || err.failed) {
      failure = "STREAM_READ_FAILED";
    } else {
      const exit = state.exit as ExitInfo | null;
      if (exit === null) failure = "STREAM_READ_FAILED";
      else if (exit.signal !== null) failure = "KILLED_BY_SIGNAL";
      else if (exit.code !== 0) failure = "NONZERO_EXIT";
      else {
        const parsed = parseVersionStdout(joinChunks(out.chunks));
        if (parsed.ok) {
          status = "OBSERVED";
          version = parsed.version;
        } else failure = parsed.failure;
      }
    }
  } catch {
    failure = "UNEXPECTED_ERROR";
  } finally {
    timer.cancel();
    signal?.removeEventListener("abort", onAbort);
    // 아직 살아 있으면(시간 초과·출력 초과·취소) 끝낸다. 끝낼 것이 없는 버전 확인이라 곧바로 SIGKILL이다.
    if (state.exit === null) {
      state.killedByUs = true;
      try {
        child.kill("SIGKILL");
      } catch {
        // kill이 던져도 아래 dispose가 다시 끝내려 한다.
      }
      await settledWithin(clock, exitedP, limits.killWaitMs);
    }
    try {
      await child.dispose();
    } catch {
      // dispose는 던지지 않는 계약이다. 어겨도 관측 결과를 바꾸지 않는다.
    }
  }

  const exitNow = state.exit as ExitInfo | null;
  const childProcess: VersionCheckChildState =
    exitNow === null ? "KILL_NOT_OBSERVED" : state.killedByUs ? "KILLED" : "EXITED";
  return versionResult({
    status,
    failure,
    version,
    provenance,
    args,
    exit: exitNow,
    stdoutBytes: out.total,
    stderrBytes: err.total,
    durationMs: elapsed(),
    childProcess,
  });
}

// ── 휠 해시 ──────────────────────────────────────────────────────

export type ArtifactHashFailureReason =
  | "NOT_FOUND"
  | "NOT_A_FILE"
  | "TOO_LARGE"
  | "READ_FAILED"
  | "FILE_CHANGED_DURING_READ"
  | "CANCELLED";

export type WheelFailure =
  ArtifactHashFailureReason | "ARTIFACT_NOT_GIVEN" | "HASH_MALFORMED" | "LOCK_NOT_HELD";

/** 아티팩트 해시 포트가 실패를 알리는 방법. reason은 증거에 남는 토큰이다(경로·시스템 메시지를 담지 않는다). */
export class ArtifactHashError extends Error {
  constructor(
    readonly reason: ArtifactHashFailureReason,
    message: string
  ) {
    super(message);
    this.name = "ArtifactHashError";
  }
}

export interface ArtifactHashPort {
  /**
   * 파일의 실제 바이트로 SHA-256(소문자 16진 64자)을 계산한다. 읽기만 한다. 일반 파일이 아니거나(NOT_A_FILE), 없거나(NOT_FOUND),
   * maxBytes를 넘거나(TOO_LARGE), 읽는 도중 크기가 바뀌었거나(FILE_CHANGED_DURING_READ), 취소되었거나(CANCELLED), 읽지 못하면
   * (READ_FAILED) ArtifactHashError로 거부한다. 부분 결과를 돌려주지 않는다.
   */
  hashFile(
    path: string,
    options: { maxBytes: number; signal?: AbortSignal }
  ): Promise<{ sha256: string; sizeBytes: number }>;
}

// UNVERIFIED: 실제 휠의 크기 상한은 실측하지 못한 추정이다(rev 1이 보고한 크기는 약 58 MB). 근거 없이 줄이지 않는다.
export const DEFAULT_WHEEL_MAX_BYTES = 1024 * 1024 * 1024;

export interface WheelRequest {
  /** 명시한 아티팩트 파일. null이면 시도하지 않는다(기본 경로·자동 탐색 없음). */
  path: string | null;
  maxBytes?: number;
  signal?: AbortSignal;
}

export interface WheelObservation {
  status: ObservationStatus;
  failure: WheelFailure | null;
  sha256: string | null;
  sizeBytes: number | null;
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

export function notAttemptedWheel(failure: WheelFailure): WheelObservation {
  return { status: "NOT_ATTEMPTED", failure, sha256: null, sizeBytes: null };
}

export async function observeWheelHash(
  ports: { hasher: ArtifactHashPort },
  request: WheelRequest
): Promise<WheelObservation> {
  if (request.path === null) return notAttemptedWheel("ARTIFACT_NOT_GIVEN");
  if (request.signal?.aborted) return notAttemptedWheel("CANCELLED");
  const failed = (failure: WheelFailure): WheelObservation => ({
    status: "FAILED",
    failure,
    sha256: null,
    sizeBytes: null,
  });
  try {
    const hashed = await ports.hasher.hashFile(request.path, {
      maxBytes: request.maxBytes ?? DEFAULT_WHEEL_MAX_BYTES,
      ...(request.signal ? { signal: request.signal } : {}),
    });
    // 어댑터가 형식이 틀린 값을 돌려주면 성공으로 보정하지 않는다.
    if (
      typeof hashed?.sha256 !== "string" ||
      !SHA256_HEX.test(hashed.sha256) ||
      !Number.isSafeInteger(hashed.sizeBytes) ||
      hashed.sizeBytes < 0
    ) {
      return failed("HASH_MALFORMED");
    }
    return {
      status: "OBSERVED",
      failure: null,
      sha256: hashed.sha256,
      sizeBytes: hashed.sizeBytes,
    };
  } catch (error) {
    return failed(error instanceof ArtifactHashError ? error.reason : "READ_FAILED");
  }
}

// ── 두 관측을 잇는다 ─────────────────────────────────────────────

export interface ToolObservationInputs {
  fs: Pick<FsPort, "mkdirp">;
  process: ProcessPort;
  clock: Clock;
  hasher: ArtifactHashPort;
  /**
   * 호출자가 공유 실행 잠금과 증거 표지를 모두 얻었는가. true일 때만 관측을 시작한다(버전 확인 프로세스는 증거 폴더 안에서 돌고,
   * 잠금이 없는 실행은 아무 프로세스도 띄우지 않는다).
   */
  lockHeld: boolean;
  version: {
    command: string;
    cwd: string;
    /** 버전 확인 전용 상태 폴더(증거 폴더 안). LSP 서버의 상태·로그와 섞지 않는다. 시작 전에 만든다. */
    stateDir: string;
    env: Readonly<Record<string, string>>;
    limits?: Partial<VersionCheckLimits>;
  };
  wheelPath: string | null;
  wheelMaxBytes?: number;
  /** 버전 확인이 도는 동안 늘어난 요청 건수를 재기 위한 읽기 포트. */
  receiver: MetricsObserver | null;
  signal?: AbortSignal;
}

export interface ToolObservationResult {
  /** 하네스의 toolVersionObserved. 관측하지 못했으면 null. */
  toolVersionObserved: string | null;
  /** 하네스의 wheelSha256Observed. 관측하지 못했으면 null. */
  wheelSha256Observed: string | null;
  summary: ToolObservationSummary;
  versionChildProcess: VersionCheckChildState;
}

function hitsOf(receiver: MetricsObserver | null): number | null {
  if (receiver === null) return null;
  try {
    return receiver.observe().hits;
  } catch {
    return null;
  }
}

export function buildToolObservationSummary(
  version: ToolVersionObservation,
  wheel: WheelObservation,
  metricsHitsDuring: number | null
): ToolObservationSummary {
  return {
    version_check: {
      process_role: "version-check",
      provenance: version.provenance,
      status: version.status,
      failure: version.failure,
      version: version.version,
      args: version.args === null ? null : [...version.args],
      exit: version.exit === null ? null : { ...version.exit },
      stdout_bytes: version.stdoutBytes,
      stderr_bytes: version.stderrBytes,
      duration_ms: version.durationMs,
      child_process: version.childProcess,
      metrics_hits_during: metricsHitsDuring,
    },
    wheel_hash: {
      status: wheel.status,
      failure: wheel.failure,
      sha256: wheel.sha256,
      size_bytes: wheel.sizeBytes,
    },
    not_established: {
      executable_provenance: "NOT_VERIFIED",
      version_output_format: "UNVERIFIED",
    },
  };
}

/**
 * 관측 요약에 핀과의 비교를 덧붙인다(증거용). **핀을 바꾸지 않는다** — 관측했다는 이유로 verified나 승인 상태를 올리지 않는다.
 * 관측값은 호출자가 하네스에 넘긴 값(observedVersion·observedWheel)이다. 비교 규칙은 사전 검사와 같다: 핀의 휠 해시가 null이거나
 * verified가 아니면 관측값이 있어도 비교할 기준이 없다(PIN_UNVERIFIED).
 */
export function completeToolObservation(
  summary: ToolObservationSummary,
  pin: Pick<Pin, "semgrep">,
  observedVersion: string | null,
  observedWheel: string | null
): RunToolObservation {
  const wheelPin = pin.semgrep.wheel;
  const pinVerified = wheelPin.sha256 !== null && wheelPin.verified === true;
  return {
    ...structuredClone(summary),
    pin: {
      version: {
        expected: pin.semgrep.version,
        observed: observedVersion,
        comparison:
          observedVersion === null
            ? "NOT_OBSERVED"
            : observedVersion === pin.semgrep.version
              ? "MATCH"
              : "MISMATCH",
      },
      wheel: {
        expected_sha256: wheelPin.sha256,
        verified: wheelPin.verified === true,
        observed: observedWheel,
        comparison: !pinVerified
          ? "PIN_UNVERIFIED"
          : observedWheel === null
            ? "NOT_OBSERVED"
            : observedWheel === wheelPin.sha256
              ? "MATCH"
              : "MISMATCH",
      },
    },
  };
}

/**
 * 호출자가 준 관측 요약이 하네스에 넘긴 관측값과 모순되지 않는지 본다. 모순이면 사유 문구를, 아니면 null을 돌려준다.
 * 요약에 적힌 값과 사전 검사·지문이 쓰는 값이 다르면 증거가 사실과 어긋나므로 쓰기 전에 거절한다.
 */
export function toolObservationConflict(
  summary: ToolObservationSummary,
  observedVersion: string | null,
  observedWheel: string | null
): string | null {
  const v = summary.version_check;
  const w = summary.wheel_hash;
  if ((v.status === "OBSERVED") !== (v.version !== null))
    return "버전 관측 상태와 버전 값이 모순된다";
  if ((w.status === "OBSERVED") !== (w.sha256 !== null)) return "휠 관측 상태와 해시 값이 모순된다";
  if (v.version !== observedVersion) return "관측 요약의 버전이 toolVersionObserved와 다르다";
  if (w.sha256 !== observedWheel) return "관측 요약의 휠 해시가 wheelSha256Observed와 다르다";
  return null;
}

/**
 * 버전 확인 → 휠 해시 순으로 관측한다. 던지지 않는다. 잠금이 없으면 아무것도 시작하지 않고(프로세스·파일 읽기 없음), 하나가 실패해도
 * 다른 하나는 관측을 시도한다. 반환한 값은 관측한 값뿐이며 실패·미시도는 null이다.
 */
export async function runToolObservation(
  inputs: ToolObservationInputs
): Promise<ToolObservationResult> {
  const finish = (
    version: ToolVersionObservation,
    wheel: WheelObservation,
    hitsDuring: number | null
  ): ToolObservationResult => ({
    toolVersionObserved: version.status === "OBSERVED" ? version.version : null,
    wheelSha256Observed: wheel.status === "OBSERVED" ? wheel.sha256 : null,
    summary: buildToolObservationSummary(version, wheel, hitsDuring),
    versionChildProcess: version.childProcess,
  });

  if (!inputs.lockHeld) {
    return finish(notAttemptedVersion("LOCK_NOT_HELD"), notAttemptedWheel("LOCK_NOT_HELD"), null);
  }
  // 이미 취소됐으면 폴더도 만들지 않고 어떤 것도 시작하지 않는다.
  if (inputs.signal?.aborted) {
    return finish(notAttemptedVersion("CANCELLED"), notAttemptedWheel("CANCELLED"), null);
  }

  let version: ToolVersionObservation;
  let hitsDuring: number | null = null;
  let stateDirReady = true;
  try {
    await inputs.fs.mkdirp(inputs.version.stateDir);
  } catch {
    stateDirReady = false;
  }
  if (!stateDirReady) {
    version = notAttemptedVersion("STATE_DIR_NOT_CREATED");
  } else {
    const before = hitsOf(inputs.receiver);
    try {
      version = await observeToolVersion(
        { process: inputs.process, clock: inputs.clock },
        {
          command: inputs.version.command,
          args: VERSION_ARGS,
          cwd: inputs.version.cwd,
          env: inputs.version.env,
          ...(inputs.version.limits ? { limits: inputs.version.limits } : {}),
          ...(inputs.signal ? { signal: inputs.signal } : {}),
        }
      );
    } catch {
      version = versionResult({ status: "FAILED", failure: "UNEXPECTED_ERROR" });
    }
    const after = hitsOf(inputs.receiver);
    hitsDuring = before !== null && after !== null ? Math.max(0, after - before) : null;
  }

  let wheel: WheelObservation;
  try {
    wheel = await observeWheelHash(
      { hasher: inputs.hasher },
      {
        path: inputs.wheelPath,
        ...(inputs.wheelMaxBytes === undefined ? {} : { maxBytes: inputs.wheelMaxBytes }),
        ...(inputs.signal ? { signal: inputs.signal } : {}),
      }
    );
  } catch {
    wheel = { status: "FAILED", failure: "READ_FAILED", sha256: null, sizeBytes: null };
  }
  return finish(version, wheel, hitsDuring);
}
