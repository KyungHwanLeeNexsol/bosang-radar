// 메모리 /proc. 합성 자료만 담는다(실제 /proc을 읽지 않는다). 실패(없음·권한 없음·읽는 도중 사라짐)를 정확히 재현할 수 있다.

import type { ProcFsPort } from "../process-list-node";

export interface MemoryProc {
  status?: string | null;
  /** NUL로 구분된 원문. null이면 읽을 수 없다(권한). */
  cmdline?: string | null;
  exe?: string | null;
  cwd?: string | null;
}

type Fault = "ENOENT" | "EACCES" | "EIO";

function errorWith(code: string): Error {
  return Object.assign(new Error(`합성 오류 ${code}`), { code });
}

export class MemoryProcFs implements ProcFsPort {
  private readonly procs = new Map<number, MemoryProc>();
  private readonly faults = new Map<string, Fault>();
  private rootFault: Fault | null = null;
  /** 파일별 읽기 횟수(어떤 경로를 읽었는지 확인하는 용도). */
  readonly reads: string[] = [];
  /** 이 경로를 읽는 순간 프로세스를 지운다(읽는 도중 사라짐을 재현). 경로 → 지울 PID. */
  private readonly vanishOnRead = new Map<string, number>();

  add(pid: number, proc: MemoryProc): this {
    this.procs.set(pid, proc);
    return this;
  }

  /** 특정 경로(`/proc/<pid>/status` 등)를 읽으면 오류가 나게 한다. */
  fault(path: string, code: Fault): this {
    this.faults.set(path, code);
    return this;
  }

  /** `/proc` 나열 자체를 실패시킨다. */
  failRoot(code: Fault): this {
    this.rootFault = code;
    return this;
  }

  /** path를 처음 읽는 순간 pid의 프로세스가 사라진다. */
  vanishWhenReading(path: string, pid: number): this {
    this.vanishOnRead.set(path, pid);
    return this;
  }

  private touch(path: string): void {
    this.reads.push(path);
    const pid = this.vanishOnRead.get(path);
    if (pid !== undefined) {
      this.vanishOnRead.delete(path);
      this.procs.delete(pid);
    }
    const fault = this.faults.get(path);
    if (fault !== undefined) throw errorWith(fault);
  }

  private lookup(path: string): { proc: MemoryProc; file: keyof MemoryProc } {
    const m = /^\/proc\/(\d+)\/(status|cmdline|exe|cwd)$/.exec(path);
    if (m === null) throw errorWith("ENOENT");
    const proc = this.procs.get(Number(m[1]));
    if (proc === undefined) throw errorWith("ENOENT");
    return { proc, file: m[2] as keyof MemoryProc };
  }

  async readdir(path: string): Promise<string[]> {
    this.reads.push(path);
    if (path !== "/proc") throw errorWith("ENOENT");
    if (this.rootFault !== null) throw errorWith(this.rootFault);
    // 숫자가 아닌 항목(self·sys 등)도 섞어 둔다 — 어댑터가 걸러야 한다.
    return ["self", "sys", "net", ...[...this.procs.keys()].map(String)];
  }

  async readFile(path: string): Promise<Uint8Array> {
    this.touch(path);
    const { proc, file } = this.lookup(path);
    const value = proc[file];
    if (value === null) throw errorWith("EACCES");
    return new TextEncoder().encode(value ?? "");
  }

  async readlink(path: string): Promise<string> {
    this.touch(path);
    const { proc, file } = this.lookup(path);
    const value = proc[file];
    if (value === null) throw errorWith("EACCES");
    if (value === undefined) throw errorWith("ENOENT"); // 커널 스레드처럼 링크가 없다
    return value;
  }
}

/** /proc/<pid>/status 본문(필요한 줄만). */
export function statusText(name: string, ppid: number): string {
  return `Name:\t${name}\nUmask:\t0022\nState:\tS (sleeping)\nPid:\t1\nPPid:\t${ppid}\n`;
}

/** NUL로 구분한 cmdline 원문. */
export function cmdlineOf(...args: string[]): string {
  return `${args.join("\0")}\0`;
}
