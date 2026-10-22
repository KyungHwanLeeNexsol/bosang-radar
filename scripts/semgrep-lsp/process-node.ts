// 실제 자식 프로세스 어댑터(ProcessPort). 이 파일과 git-node.ts만 child_process를 쓴다(structure.test.ts가 지킨다).
//
// 공개 API:
//   createNodeProcessPort({ provenance }): ProcessPort
//
// "실제" 포트는 실수로 얻을 수 없어야 한다: provenance는 필수 인자이고 기본값이 없다. 시험과 스텁 통합은
// 항상 "stub"을 넘기므로 그 기록은 SYNTHETIC·UNVERIFIED로 남는다. "real"을 넘기는 곳은 cli.ts의 실제 실행 분기뿐이다.
//
// 동작:
//  · spawn: shell:false, windowsHide:true, env는 spec.env를 그대로(아무것도 물려받지 않는다), stdio는 pipe 셋.
//    띄우지 못하면(ENOENT 등) spawn() 약속이 거부된다.
//  · stdout·stderr: 'data'로 즉시 흘려 서로 독립인 바이트 큐에 쌓는다 — 한쪽을 읽지 않아도 다른 쪽(과 자식)이
//    막히지 않는다. 스트림이 닫히면 큐도 닫힌다.
//  · writeStdin: 쓰기 콜백 뒤에 이행하고, EPIPE·닫힌 stdin·이미 끝난 자식이면 거부한다. 자식이 끝나거나 dispose되면
//    아직 끝나지 않은 쓰기도 거부한다(영원히 매달리지 않는다). 파이프가 가득 차 콜백이 오지 않는 경우의 한도는
//    호출자(session.ts)의 몫이다.
//  · kill: win32에서는 `taskkill /pid <pid> /T /F`로 프로세스 트리를 끝낸다(이 파일 안에서만). 그 밖에는 자식에게
//    신호를 보낸다(프로세스 그룹은 쓰지 않는다 — 자손까지 끝내려면 별도 결정이 필요하다).
//  · exited: 'close'(모든 stdio가 닫힌 뒤)에 한 번 이행한다. 'exit'만 오고 'close'가 오지 않으면(자손이 파이프를
//    쥔 경우) CLOSE_GRACE_MS 뒤 스트림을 닫고 이행한다. 절대 거부하지 않는다.
//  · dispose: 멱등. 살아 있으면 끝내고, 스트림·리스너를 풀고, 종료를 한정된 시간 안에 기다린다. 던지지 않는다.

import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";
import { AsyncByteQueue } from "./streams";
import type { ChildHandle, ExitInfo, ProcessPort, Provenance, SpawnSpec } from "./types";

export interface NodeProcessPortOptions {
  /** 필수. 기본값이 없다 — "real"은 cli.ts의 방지 장치를 통과한 실행에서만 넘긴다. */
  provenance: Provenance;
}

/** 'exit' 뒤 'close'를 기다리는 한도(ms). */
const CLOSE_GRACE_MS = 2000;
/** dispose가 종료를 기다리는 한도(ms). */
const DISPOSE_WAIT_MS = 5000;

function asBytes(chunk: unknown): Uint8Array {
  const buf = chunk as Buffer;
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

class NodeChild implements ChildHandle {
  readonly pid: number | null;
  readonly stdout: AsyncIterable<Uint8Array>;
  readonly stderr: AsyncIterable<Uint8Array>;
  readonly exited: Promise<ExitInfo>;

  private readonly outQueue = new AsyncByteQueue();
  private readonly errQueue = new AsyncByteQueue();
  private resolveExited: (info: ExitInfo) => void = () => {};
  private exitInfo: ExitInfo | null = null;
  private pendingExit: ExitInfo | null = null;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly pendingWrites = new Set<(error: Error) => void>();
  private readonly killers = new Set<Promise<void>>();
  private disposePromise: Promise<void> | null = null;
  private listenersRemoved = false;

  constructor(private readonly cp: ChildProcess) {
    this.pid = cp.pid ?? null;
    this.stdout = this.outQueue;
    this.stderr = this.errQueue;
    this.exited = new Promise<ExitInfo>((resolve) => {
      this.resolveExited = resolve;
    });

    // 'error' 리스너는 마지막까지 남긴다(없으면 처리되지 않은 예외로 프로세스가 죽는다).
    cp.stdin?.on("error", () => {});
    cp.stdout?.on("error", (error) => this.outQueue.fail(error));
    cp.stderr?.on("error", (error) => this.errQueue.fail(error));
    cp.stdout?.on("data", this.onStdout);
    cp.stderr?.on("data", this.onStderr);
    cp.stdout?.once("close", this.onStdoutClose);
    cp.stderr?.once("close", this.onStderrClose);
    cp.once("exit", this.onExit);
    cp.once("close", this.onClose);
    cp.on("error", () => {});
  }

  // ── 이벤트 ────────────────────────────────────────────────────

  private readonly onStdout = (chunk: unknown): void => this.outQueue.push(asBytes(chunk));
  private readonly onStderr = (chunk: unknown): void => this.errQueue.push(asBytes(chunk));
  private readonly onStdoutClose = (): void => this.outQueue.end();
  private readonly onStderrClose = (): void => this.errQueue.end();

  private readonly onExit = (code: number | null, signal: NodeJS.Signals | null): void => {
    this.pendingExit = { code, signal };
    this.rejectPendingWrites(new Error("자식 프로세스가 이미 끝났다"));
    this.closeTimer = setTimeout(() => {
      // 'close'가 오지 않는다: 자손이 파이프를 쥐고 있을 수 있다. 읽기를 끝내고 종료를 알린다.
      this.destroyStreams();
      this.settle();
    }, CLOSE_GRACE_MS);
  };

  private readonly onClose = (code: number | null, signal: NodeJS.Signals | null): void => {
    this.pendingExit ??= { code, signal };
    this.outQueue.end();
    this.errQueue.end();
    this.settle();
  };

  private settle(): void {
    if (this.closeTimer !== null) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    if (this.exitInfo !== null) return;
    this.exitInfo = this.pendingExit ?? { code: null, signal: null };
    this.rejectPendingWrites(new Error("자식 프로세스가 이미 끝났다"));
    this.resolveExited(this.exitInfo);
  }

  private rejectPendingWrites(error: Error): void {
    for (const reject of [...this.pendingWrites]) reject(error);
    this.pendingWrites.clear();
  }

  private destroyStreams(): void {
    this.cp.stdin?.destroy();
    this.cp.stdout?.destroy();
    this.cp.stderr?.destroy();
    this.outQueue.end();
    this.errQueue.end();
  }

  private removeListeners(): void {
    if (this.listenersRemoved) return;
    this.listenersRemoved = true;
    this.cp.stdout?.off("data", this.onStdout);
    this.cp.stderr?.off("data", this.onStderr);
    this.cp.stdout?.off("close", this.onStdoutClose);
    this.cp.stderr?.off("close", this.onStderrClose);
    this.cp.off("exit", this.onExit);
    this.cp.off("close", this.onClose);
  }

  /** spawn이 실패했을 때: 이 자식은 처음부터 없었다. */
  discard(): void {
    this.rejectPendingWrites(new Error("자식 프로세스를 띄우지 못했다"));
    this.destroyStreams();
    this.removeListeners();
    this.settle();
  }

  // ── ChildHandle ───────────────────────────────────────────────

  writeStdin(data: Uint8Array): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const stdin = this.cp.stdin;
      if (this.exitInfo !== null || this.pendingExit !== null) {
        reject(new Error("write after exit: 자식 프로세스가 이미 끝났다"));
        return;
      }
      if (!stdin || stdin.destroyed || stdin.writableEnded) {
        reject(new Error("write after end: stdin이 이미 닫혔다"));
        return;
      }
      const fail = (error: Error): void => {
        this.pendingWrites.delete(fail);
        reject(error);
      };
      this.pendingWrites.add(fail);
      try {
        stdin.write(data, (error) => {
          if (!this.pendingWrites.delete(fail)) return; // 이미 거부됐다
          if (error) reject(error);
          else resolve();
        });
      } catch (error) {
        this.pendingWrites.delete(fail);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  endStdin(): Promise<void> {
    return new Promise<void>((resolve) => {
      const stdin = this.cp.stdin;
      if (!stdin || stdin.destroyed || stdin.writableEnded) {
        resolve();
        return;
      }
      stdin.once("close", () => resolve());
      stdin.end(() => resolve());
    });
  }

  kill(signal: "SIGTERM" | "SIGKILL" = "SIGTERM"): void {
    if (this.exitInfo !== null || this.pendingExit !== null) return;
    if (process.platform === "win32" && this.pid !== null) {
      // 트리 전체를 끝낸다. 실패하면 자식에게 직접 신호를 보낸다.
      const killer = new Promise<void>((resolve) => {
        try {
          const tk = nodeSpawn("taskkill", ["/pid", String(this.pid), "/T", "/F"], {
            shell: false,
            windowsHide: true,
            stdio: "ignore",
          });
          tk.once("error", () => {
            this.cp.kill(signal);
            resolve();
          });
          tk.once("close", () => resolve());
        } catch {
          this.cp.kill(signal);
          resolve();
        }
      });
      this.killers.add(killer);
      void killer.then(() => this.killers.delete(killer));
      return;
    }
    this.cp.kill(signal);
  }

  dispose(): Promise<void> {
    this.disposePromise ??= this.doDispose();
    return this.disposePromise;
  }

  private async doDispose(): Promise<void> {
    try {
      if (this.exitInfo === null) {
        this.kill("SIGKILL");
        this.cp.stdin?.destroy();
      }
      // 종료와 종료 신호 전달(taskkill)을 한정된 시간 안에 기다린다.
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, DISPOSE_WAIT_MS);
        void Promise.all([this.exited, ...this.killers]).then(() => {
          clearTimeout(timer);
          resolve();
        });
      });
      this.rejectPendingWrites(new Error("dispose됨"));
      this.destroyStreams();
      this.removeListeners();
      // 종료를 관측하지 못했다면 exited를 이행시키지 않는다 — 세션이 "종료를 관측하지 못했다"로 정리 실패를 기록한다.
    } catch {
      // dispose는 던지지 않는다.
    }
  }
}

function assertSpec(spec: SpawnSpec): void {
  if (typeof spec.command !== "string" || spec.command.length === 0) {
    throw new TypeError("spec.command가 비어 있다");
  }
  if (typeof spec.cwd !== "string" || spec.cwd.length === 0) {
    throw new TypeError("spec.cwd가 비어 있다");
  }
  for (const [name, value] of Object.entries(spec.env)) {
    if (typeof value !== "string") throw new TypeError(`spec.env.${name}가 문자열이 아니다`);
  }
}

export function createNodeProcessPort(options: NodeProcessPortOptions): ProcessPort {
  const provenance = options?.provenance;
  if (provenance !== "real" && provenance !== "stub") {
    throw new TypeError('provenance는 "real" 또는 "stub"을 명시해야 한다(기본값 없음)');
  }
  return {
    provenance,
    spawn(spec: SpawnSpec): Promise<ChildHandle> {
      return new Promise<ChildHandle>((resolve, reject) => {
        let child: NodeChild;
        try {
          assertSpec(spec);
          const cp = nodeSpawn(spec.command, [...spec.args], {
            cwd: spec.cwd,
            env: { ...spec.env } as NodeJS.ProcessEnv,
            shell: false,
            windowsHide: true,
            stdio: ["pipe", "pipe", "pipe"],
          });
          child = new NodeChild(cp);
          let spawned = false;
          cp.once("error", (error) => {
            // 'spawn' 전의 오류(ENOENT 등)만 거부 사유가 된다. 이후의 오류는 NodeChild가 삼킨다.
            if (spawned) return;
            child.discard();
            reject(error);
          });
          cp.once("spawn", () => {
            spawned = true;
            resolve(child);
          });
        } catch (error) {
          reject(error);
        }
      });
    },
  };
}
