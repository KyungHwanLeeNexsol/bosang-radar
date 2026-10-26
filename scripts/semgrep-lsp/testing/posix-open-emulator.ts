// 시험 전용: POSIX "읽기 전용 열기"의 의미 중 휠 해시 어댑터가 의존하는 부분만 흉내 내는 열기 함수(OpenForRead).
//
// 모델이다 — 실제 커널 동작의 증거가 아니다. 모델이 따르는 규칙은 open(2)·fifo(7) 문서의 이것뿐이다:
//  · FIFO를 읽기 전용으로 열면, O_NONBLOCK이 없을 때는 쓰기 쪽이 열릴 때까지 열기가 대기한다.
//  · O_NONBLOCK이 있으면 쓰기 쪽이 없어도 열기가 곧바로 성공한다.
//  · 일반 파일·디렉터리는 곧바로 열린다. 심볼릭 링크는 따라간다. 없는 경로는 ENOENT.
// 실제 FIFO로 같은 것을 확인하는 시험은 artifact-node.test.ts의 POSIX 전용 구간이다(Windows에서는 건너뛴다).
//
// 이 에뮬레이터는 쓰기 계열 플래그(O_WRONLY·O_RDWR·O_CREAT·O_TRUNC·O_APPEND)로 여는 시도를 거절하고 기록한다 — 어댑터의 읽기 전용
// 계약을 시험이 직접 볼 수 있게 한다. 열린 핸들 수·대기 중인 열기 수를 세어, 실패한 구현이 핸들이나 대기를 남기는지도 본다.
// node:fs를 가져오지 않는다(핸들은 필요한 메서드만 가진 객체다).

import type { OpenForRead } from "../artifact-node";

/** Linux(x86-64)의 open(2) 플래그 값. 에뮬레이터와 시험이 같은 값을 쓰도록 한 곳에 둔다. */
export const LINUX_OPEN_CONSTANTS = {
  O_RDONLY: 0,
  O_WRONLY: 1,
  O_RDWR: 2,
  O_CREAT: 0o100,
  O_EXCL: 0o200,
  O_NOCTTY: 0o400,
  O_TRUNC: 0o1000,
  O_APPEND: 0o2000,
  O_NONBLOCK: 0o4000,
} as const;

export type EmulatedNode =
  | { kind: "file"; data: Uint8Array; mtimeMs?: number }
  | { kind: "fifo"; /** true면 쓰기 쪽이 이미 열려 있다. */ hasWriter?: boolean }
  | { kind: "dir" }
  | { kind: "symlink"; target: string };

export interface OpenRecord {
  path: string;
  flags: number | string;
  /** 따라간 뒤 실제로 열린 노드 종류. 열지 못했으면 null. */
  resolvedKind: EmulatedNode["kind"] | null;
}

type Handle = Awaited<ReturnType<OpenForRead>>;

function errno(code: string): Error {
  return Object.assign(new Error(`${code}: 시험용 가짜 오류`), { code });
}

export class PosixOpenEmulator {
  readonly opens: OpenRecord[] = [];
  /** 쓰기 계열 플래그로 열려 한 횟수. 읽기 전용 어댑터에서는 0이어야 한다. */
  writeAttempts = 0;
  /** read()가 불린 횟수(모든 핸들 합계). 일반 파일이 아닌 노드에서는 0이어야 한다. */
  readCalls = 0;
  private opened = 0;
  private closed = 0;
  private waiting: (() => void)[] = [];
  /** 모든 read 직전에 기다리는 지점. 시험이 읽기 도중의 사건(취소 등)을 결정적으로 만들 때 쓴다. */
  beforeRead: (() => Promise<void>) | null = null;

  constructor(
    private readonly nodes: Record<string, EmulatedNode>,
    private readonly constants: typeof LINUX_OPEN_CONSTANTS = LINUX_OPEN_CONSTANTS
  ) {}

  /** 열려 있는(닫히지 않은) 핸들 수. */
  openHandles(): number {
    return this.opened - this.closed;
  }

  /** 아직 끝나지 않은 열기 수(쓰기 쪽이 열리기를 기다리는 FIFO 열기). */
  pendingOpens(): number {
    return this.waiting.length;
  }

  /** "쓰기 쪽이 드디어 열렸다"를 흉내 낸다: 대기 중인 열기를 모두 풀어 준다. 시험의 정리에서 쓴다. */
  releasePending(): void {
    const all = this.waiting;
    this.waiting = [];
    for (const release of all) release();
  }

  readonly open: OpenForRead = (path, flags) => {
    const numeric = typeof flags === "number" ? flags : 0; // 문자열 "r"은 O_RDONLY와 같다
    const record: OpenRecord = { path, flags, resolvedKind: null };
    this.opens.push(record);

    const c = this.constants;
    if (numeric & (c.O_WRONLY | c.O_RDWR | c.O_CREAT | c.O_TRUNC | c.O_APPEND)) {
      this.writeAttempts += 1;
      return Promise.reject(errno("EACCES"));
    }

    let node: EmulatedNode | undefined = this.nodes[path];
    for (let hops = 0; node?.kind === "symlink"; hops++) {
      if (hops >= 8) return Promise.reject(errno("ELOOP"));
      node = this.nodes[node.target];
    }
    if (node === undefined) return Promise.reject(errno("ENOENT"));
    record.resolvedKind = node.kind;

    if (node.kind === "fifo" && !node.hasWriter && !(numeric & c.O_NONBLOCK)) {
      // 쓰기 쪽이 없고 비차단도 아니다: 열기가 끝나지 않고 대기한다(운영체제가 열기를 붙잡는 상황).
      return new Promise<Handle>((resolve) => {
        this.waiting.push(() => resolve(this.makeHandle(node)));
      });
    }
    return Promise.resolve(this.makeHandle(node));
  };

  private makeHandle(node: EmulatedNode): Handle {
    this.opened += 1;
    let offset = 0;
    let isClosed = false;
    // 화살표 함수로 만들어 this(에뮬레이터)를 그대로 쓴다.
    const handle = {
      stat: async () => ({
        isFile: () => node.kind === "file",
        isDirectory: () => node.kind === "dir",
        isFIFO: () => node.kind === "fifo",
        size: node.kind === "file" ? node.data.length : 0,
        mtimeMs: node.kind === "file" ? (node.mtimeMs ?? 1000) : 0,
      }),
      read: async (buffer: Uint8Array, bufferOffset: number, length: number) => {
        this.readCalls += 1;
        if (node.kind !== "file") throw errno("EISDIR"); // 일반 파일이 아닌 노드를 읽으면 안 된다
        if (this.beforeRead !== null) await this.beforeRead();
        const count = Math.min(length, node.data.length - offset);
        buffer.set(node.data.subarray(offset, offset + count), bufferOffset);
        offset += count;
        return { bytesRead: count, buffer };
      },
      close: async () => {
        if (!isClosed) {
          isClosed = true;
          this.closed += 1;
        }
      },
    };
    return handle as unknown as Handle;
  }
}
