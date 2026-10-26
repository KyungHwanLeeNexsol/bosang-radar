// 운영체제 프로세스 목록 어댑터(ProcessLister). 목록을 **읽어 오는 일**만 한다 — 해석은 process-list.ts, 판정은 process-observation.ts다.
//
// 읽기 전용이다: 다른 프로세스에 신호를 보내거나 끝내거나 정리하지 않는다. 끝낼 수 있는 것은 이 어댑터가 목록을 읽으려고 직접 띄운 조회
// 자식(Windows의 PowerShell)뿐이고, 그것도 시간 초과·출력 한도·취소로 조회를 포기할 때만 끝낸다.
//
//  · win32: ProcessPort로 `powershell.exe`(SystemRoot 아래 고정 경로, PATH 탐색 없음)를 셸 없이 인자 배열로 한 번 실행해 Win32_Process를 읽는다
//    (스크립트는 process-list.ts). 시간 제한·출력 크기 제한·취소를 지키고 어떤 경로로 끝나도 dispose한다. 작업 폴더는 알 수 없다(null).
//  · linux: /proc을 읽는다(디렉터리 나열, status·cmdline, exe·cwd 링크). 다른 사용자의 exe·cwd는 권한이 없어 null이다. 읽는 도중 사라진
//    프로세스는 vanished로 표시한다. hidepid로 숨겨진 프로세스·다른 PID 이름공간은 보이지 않는다. 시간·취소는 읽기가 돌아온 뒤 배치 사이와 마지막
//    배치 뒤에 확인한다(기한을 넘겨 끝난 목록은 TIMEOUT이다. 돌아오지 않는 읽기를 끊지는 못한다).
//  · 그 밖(darwin 등): 지원하지 않는다 — UNSUPPORTED_PLATFORM이며 호출자는 null(미확인)로 다룬다. macOS는 검증하지 않았다.
//
// 공개 API:
//   createNodeProcessLister({ platform, process, clock, systemRoot, env }): ProcessLister   플랫폼에 맞는 어댑터를 고른다
//   createWindowsProcessLister(...) / createProcProcessLister(...) / createNodeProcFs() / createUnsupportedProcessLister(...)
//   DEFAULT_LIST_LIMITS

import { readFile, readdir, readlink } from "node:fs/promises";
import {
  WINDOWS_EXIT_PERMISSION_DENIED,
  parseProcStatus,
  parseWindowsListing,
  splitProcCmdline,
  windowsListArgs,
} from "./process-list";
import { drain, joinChunks, settledWithin, type Drain } from "./tool-observation";
import type {
  ChildHandle,
  Clock,
  ExitInfo,
  ProcessListFailure,
  ProcessListResult,
  ProcessLister,
  ProcessPort,
  ProcessRow,
  TimerHandle,
  Provenance,
} from "./types";

export interface ListLimits {
  /** 조회 전체의 시간 한도(ms). */
  timeoutMs: number;
  /** 출력 바이트 한도(Windows). */
  maxStdoutBytes: number;
  maxStderrBytes: number;
  /** 끝내라고 한 뒤 종료를 기다리는 한도(ms). */
  killWaitMs: number;
  /** 행 수 한도. 넘으면 OUTPUT_LIMIT_EXCEEDED다. */
  maxRows: number;
}

// UNVERIFIED: 실제 장비의 목록 크기·조회 시간은 이 장비(Windows 11, 약 300개, 1초 안팎)에서만 쟀다. 한도는 그보다 넉넉한 추정이다.
export const DEFAULT_LIST_LIMITS: ListLimits = Object.freeze({
  timeoutMs: 30_000,
  maxStdoutBytes: 32 * 1024 * 1024,
  maxStderrBytes: 64 * 1024,
  killWaitMs: 5000,
  maxRows: 100_000,
});

function errorCode(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : null;
}

const fail = (failure: ProcessListFailure): ProcessListResult => ({ ok: false, failure });

// ── 지원하지 않는 환경 ───────────────────────────────────────────

export function createUnsupportedProcessLister(provenance: Provenance): ProcessLister {
  return { provenance, source: null, list: async () => fail("UNSUPPORTED_PLATFORM") };
}

// ── Windows (ProcessPort로 PowerShell 조회) ──────────────────────

export interface WindowsListerOptions {
  process: ProcessPort;
  clock: Clock;
  /** SystemRoot의 절대 경로. powershell.exe는 이 아래의 고정 경로만 쓴다. */
  systemRoot: string;
  /** 조회 자식의 환경(아무것도 물려받지 않는다). 호출자가 최소 목록만 넘긴다. */
  env: Readonly<Record<string, string>>;
  limits?: Partial<ListLimits>;
}

const ABSOLUTE_WINDOWS = /^[A-Za-z]:[\\/]/;

export function createWindowsProcessLister(options: WindowsListerOptions): ProcessLister {
  const limits: ListLimits = { ...DEFAULT_LIST_LIMITS, ...(options.limits ?? {}) };
  const root = options.systemRoot.replace(/[\\/]+$/, "");
  const powershell = `${root}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
  if (!ABSOLUTE_WINDOWS.test(options.systemRoot)) {
    return createUnsupportedProcessLister(options.process.provenance);
  }

  return {
    provenance: options.process.provenance,
    source: "windows-cim",
    async list({ signal }: { signal?: AbortSignal }): Promise<ProcessListResult> {
      if (signal?.aborted) return fail("CANCELLED");
      const { clock } = options;

      let child: ChildHandle;
      try {
        child = await options.process.spawn({
          command: powershell,
          args: windowsListArgs(),
          cwd: root,
          env: options.env,
        });
      } catch (error) {
        const code = errorCode(error);
        return fail(code === "EACCES" || code === "EPERM" ? "PERMISSION_DENIED" : "SPAWN_FAILED");
      }

      type Stop = "TIMEOUT" | "CANCELLED" | "OUTPUT_LIMIT_EXCEEDED";
      let stopReason: Stop | null = null;
      let resolveStop: (reason: Stop) => void = () => {};
      const stopped = new Promise<Stop>((resolve) => {
        resolveStop = resolve;
      });
      const stop = (reason: Stop): void => {
        if (stopReason !== null) return;
        stopReason = reason;
        resolveStop(reason);
      };
      const onAbort = (): void => stop("CANCELLED");
      const state = { exit: null as ExitInfo | null };
      const out: Drain = { chunks: [], total: 0, overflow: false, failed: false };
      const err: Drain = { chunks: [], total: 0, overflow: false, failed: false };
      let timer: TimerHandle | null = null;
      let exitedP: Promise<void> = Promise.resolve();

      // 조회 자식을 띄운 뒤의 모든 준비(타이머·취소 리스너·출력 수집)도 try 안에 둔다 — 준비 중 무엇이 던져도 finally가 자식을 끝내고 정리한다.
      let result: ProcessListResult;
      try {
        timer = clock.setTimer(() => stop("TIMEOUT"), limits.timeoutMs);
        signal?.addEventListener("abort", onAbort, { once: true });
        if (signal?.aborted) stop("CANCELLED");
        exitedP = child.exited.then(
          (info) => {
            state.exit = info;
          },
          () => {}
        );
        const outP = drain(child.stdout, out, limits.maxStdoutBytes, () =>
          stop("OUTPUT_LIMIT_EXCEEDED")
        );
        const errP = drain(child.stderr, err, limits.maxStderrBytes, () =>
          stop("OUTPUT_LIMIT_EXCEEDED")
        );
        const finished = Promise.all([exitedP, outP, errP]);
        const settled = await Promise.race([
          finished.then(() => ({ kind: "done" as const })),
          stopped.then((reason) => ({ kind: "stop" as const, reason })),
        ]);
        if (settled.kind === "stop") result = fail(settled.reason);
        else if (out.overflow || err.overflow) result = fail("OUTPUT_LIMIT_EXCEEDED");
        else if (out.failed || err.failed) result = fail("READ_FAILED");
        else {
          const exit = state.exit as ExitInfo | null;
          if (exit === null) result = fail("READ_FAILED");
          else if (exit.signal !== null) result = fail("NONZERO_EXIT");
          else if (exit.code === WINDOWS_EXIT_PERMISSION_DENIED) result = fail("PERMISSION_DENIED");
          else if (exit.code !== 0) result = fail("NONZERO_EXIT");
          else {
            const parsed = parseWindowsListing(joinChunks(out.chunks), { maxRows: limits.maxRows });
            result = parsed.ok
              ? {
                  ok: true,
                  snapshot: {
                    source: "windows-cim",
                    parentLinkNeedsStartTime: true,
                    rows: parsed.value,
                  },
                }
              : fail("OUTPUT_MALFORMED");
          }
        }
      } catch {
        result = fail("UNEXPECTED_ERROR");
      } finally {
        timer?.cancel();
        signal?.removeEventListener("abort", onAbort);
        // 끝내는 것은 이 어댑터가 띄운 조회 자식뿐이다.
        if (state.exit === null) {
          try {
            child.kill("SIGKILL");
          } catch {
            // dispose가 다시 끝내려 한다.
          }
          await settledWithin(clock, exitedP, limits.killWaitMs);
        }
        try {
          await child.dispose();
        } catch {
          // dispose는 던지지 않는 계약이다.
        }
      }
      return result;
    },
  };
}

// ── Linux (/proc) ────────────────────────────────────────────────

/** /proc을 읽는 최소 포트. 실패는 Node 오류처럼 code(ENOENT·ESRCH·EACCES·EPERM…)를 가진다. */
export interface ProcFsPort {
  readdir(path: string): Promise<string[]>;
  readFile(path: string): Promise<Uint8Array>;
  readlink(path: string): Promise<string>;
}

export function createNodeProcFs(): ProcFsPort {
  return {
    readdir: (path) => readdir(path),
    readFile: (path) => readFile(path),
    readlink: (path) => readlink(path),
  };
}

export interface ProcListerOptions {
  procFs: ProcFsPort;
  clock: Clock;
  /** procFs의 출처. 실제 /proc이면 "real", 합성 자료이면 "stub". */
  provenance: Provenance;
  limits?: Partial<ListLimits>;
}

const BATCH = 32;
const GONE = new Set(["ENOENT", "ESRCH"]);
const DENIED = new Set(["EACCES", "EPERM"]);

type Read<T> = { kind: "ok"; value: T } | { kind: "gone" } | { kind: "denied" } | { kind: "error" };

async function attempt<T>(run: () => Promise<T>): Promise<Read<T>> {
  try {
    return { kind: "ok", value: await run() };
  } catch (error) {
    const code = errorCode(error);
    if (code !== null && GONE.has(code)) return { kind: "gone" };
    if (code !== null && DENIED.has(code)) return { kind: "denied" };
    return { kind: "error" };
  }
}

const decoder = new TextDecoder("utf-8");

/**
 * 한 프로세스를 읽는다. 상태가 깨졌으면(비어 있지 않은데 Name·PPid를 못 읽음) "MALFORMED"(= 목록 파손), 상태나 인자를 권한 오류도 사라짐도 아닌
 * 읽기 오류(EIO 등)로 읽지 못했으면 "READ_ERROR"(= 빈 행으로 보정하지 않고 목록 전체를 실패로 본다). 권한이 없어 못 읽은 칸은 null로 남는다.
 */
async function readProcRow(
  procFs: ProcFsPort,
  pid: number
): Promise<ProcessRow | "MALFORMED" | "READ_ERROR"> {
  const base = `/proc/${pid}`;
  const vanishedRow: ProcessRow = {
    pid,
    ppid: null,
    startTime: null,
    name: null,
    executable: null,
    args: null,
    cwd: null,
    vanished: true,
  };
  const [status, cmdline, exe, cwd] = await Promise.all([
    attempt(() => procFs.readFile(`${base}/status`)),
    attempt(() => procFs.readFile(`${base}/cmdline`)),
    attempt(() => procFs.readlink(`${base}/exe`)),
    attempt(() => procFs.readlink(`${base}/cwd`)),
  ]);
  if (status.kind === "gone" || cmdline.kind === "gone") return vanishedRow;
  if (status.kind === "error" || cmdline.kind === "error") return "READ_ERROR";

  let name: string | null = null;
  let ppid: number | null = null;
  if (status.kind === "ok") {
    if (status.value.byteLength === 0) return vanishedRow; // 끝나는 중이라 비어 있다
    const parsed = parseProcStatus(decoder.decode(status.value));
    if (parsed === null) return "MALFORMED";
    name = parsed.name;
    ppid = parsed.ppid;
  }

  // exe·cwd가 없다고만 나오면 커널 스레드일 수도, 막 끝난 것일 수도 있다 — 상태를 다시 읽어 가른다.
  if (exe.kind === "gone" || cwd.kind === "gone") {
    const probe = await attempt(() => procFs.readFile(`${base}/status`));
    if (probe.kind === "gone") return vanishedRow;
  }

  return {
    pid,
    ppid,
    startTime: null,
    name,
    executable: exe.kind === "ok" ? exe.value : null,
    args: cmdline.kind === "ok" ? splitProcCmdline(cmdline.value) : null,
    cwd: cwd.kind === "ok" ? cwd.value : null,
    vanished: false,
  };
}

export function createProcProcessLister(options: ProcListerOptions): ProcessLister {
  const limits: ListLimits = { ...DEFAULT_LIST_LIMITS, ...(options.limits ?? {}) };
  const { procFs, clock } = options;
  return {
    provenance: options.provenance,
    source: "linux-proc",
    async list({ signal }: { signal?: AbortSignal }): Promise<ProcessListResult> {
      if (signal?.aborted) return fail("CANCELLED");
      // 기한 = 조회 시작 시각 + timeoutMs. 끝난 시각이 기한을 **넘으면**(경과 > timeoutMs) TIMEOUT이고, 정확히 timeoutMs에 끝난 조회는 기한 안이다.
      // 시각은 읽기가 돌아온 뒤에만 확인한다 — 돌아오지 않는 읽기를 끊지는 않는다(범위 밖).
      const deadline = clock.now() + limits.timeoutMs;

      let entries: string[];
      try {
        entries = await procFs.readdir("/proc");
      } catch (error) {
        const code = errorCode(error);
        if (code !== null && DENIED.has(code)) return fail("PERMISSION_DENIED");
        if (code === "ENOENT" || code === "ENOTDIR") return fail("UNSUPPORTED_PLATFORM");
        return fail("READ_FAILED");
      }
      const pids = entries
        .filter((e) => /^[1-9]\d{0,9}$/.test(e))
        .map(Number)
        .sort((a, b) => a - b);
      if (pids.length > limits.maxRows) return fail("OUTPUT_LIMIT_EXCEEDED");

      const rows: ProcessRow[] = [];
      for (let i = 0; i < pids.length; i += BATCH) {
        if (signal?.aborted) return fail("CANCELLED");
        if (clock.now() > deadline) return fail("TIMEOUT");
        let batch: (ProcessRow | "MALFORMED" | "READ_ERROR")[];
        try {
          batch = await Promise.all(
            pids.slice(i, i + BATCH).map((pid) => readProcRow(procFs, pid))
          );
        } catch {
          return fail("UNEXPECTED_ERROR");
        }
        for (const row of batch) {
          if (row === "MALFORMED") return fail("OUTPUT_MALFORMED");
          if (row === "READ_ERROR") return fail("READ_FAILED");
          rows.push(row);
        }
      }
      // 반복 앞의 검사는 다음 배치를 읽기 전에만 시각을 본다. 마지막 배치가 기한을 넘겨 끝나도 성공 목록을 내보내지 않도록 같은 기준으로 한 번 더 본다.
      if (signal?.aborted) return fail("CANCELLED");
      if (clock.now() > deadline) return fail("TIMEOUT");
      return {
        ok: true,
        snapshot: { source: "linux-proc", parentLinkNeedsStartTime: false, rows },
      };
    },
  };
}

// ── 플랫폼 선택 ──────────────────────────────────────────────────

export interface NodeListerOptions {
  /** process.platform 값. */
  platform: string;
  /** 조회 자식을 띄우는 포트(Windows). 이 포트의 provenance가 조회의 출처가 된다. */
  process: ProcessPort;
  clock: Clock;
  /** Windows: SystemRoot 절대 경로. 없으면 지원하지 않는 환경이다. */
  systemRoot: string | null;
  /** Windows: 조회 자식의 환경. */
  env: Readonly<Record<string, string>>;
  limits?: Partial<ListLimits>;
}

export function createNodeProcessLister(options: NodeListerOptions): ProcessLister {
  const limits = options.limits ?? {};
  if (options.platform === "win32") {
    return options.systemRoot === null
      ? createUnsupportedProcessLister(options.process.provenance)
      : createWindowsProcessLister({
          process: options.process,
          clock: options.clock,
          systemRoot: options.systemRoot,
          env: options.env,
          limits,
        });
  }
  if (options.platform === "linux") {
    return createProcProcessLister({
      procFs: createNodeProcFs(),
      clock: options.clock,
      provenance: options.process.provenance,
      limits,
    });
  }
  return createUnsupportedProcessLister(options.process.provenance);
}
