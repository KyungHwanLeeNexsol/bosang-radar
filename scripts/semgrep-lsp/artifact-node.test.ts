import { createHash, randomBytes } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  appendFile,
  mkdir,
  mkdtemp,
  open as openFile,
  rm,
  symlink,
  writeFile,
  type FileHandle,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createNodeArtifactHasher, readOnlyOpenFlags, type OpenForRead } from "./artifact-node";
import { createNodeProcessPort } from "./process-node";
import { LINUX_OPEN_CONSTANTS, PosixOpenEmulator } from "./testing/posix-open-emulator";
import { ArtifactHashError, observeWheelHash } from "./tool-observation";

// 실제 임시 파일로 확인한다. 기대 해시는 이 어댑터와 겹치지 않는 별도 계산(node:crypto를 시험에서 직접 호출)이다.
// 실제 휠이나 실제 Semgrep은 읽지 않는다.

const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");
const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"; // 알려진 상수

let dir = "";
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "semgrep-lsp-artifact-"));
});
afterAll(async () => {
  if (dir !== "") await rm(dir, { recursive: true, force: true });
});

const hasher = createNodeArtifactHasher();
const opts = { maxBytes: 1024 * 1024 * 1024 };

async function fileWith(name: string, data: Uint8Array): Promise<string> {
  const path = join(dir, name);
  await writeFile(path, data);
  return path;
}

async function reason(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ArtifactHashError) return error.reason;
    throw error;
  }
  return "NO_ERROR";
}

describe("createNodeArtifactHasher — 실제 파일", () => {
  it("작은 파일의 해시가 독립 계산값과 같다", async () => {
    const data = new TextEncoder().encode("not a real wheel\n");
    const path = await fileWith("small.whl", data);
    expect(await hasher.hashFile(path, opts)).toEqual({
      sha256: sha256(data),
      sizeBytes: data.length,
    });
  });

  it("여러 조각(1 MiB 단위)에 걸친 파일도 같다", async () => {
    const data = new Uint8Array(randomBytes(3 * 1024 * 1024 + 12_345));
    const path = await fileWith("multi.whl", data);
    expect(await hasher.hashFile(path, opts)).toEqual({
      sha256: sha256(data),
      sizeBytes: data.length,
    });
  });

  it("조각 경계 크기(정확히 1 MiB, 1 MiB±1)도 같다", async () => {
    for (const size of [1024 * 1024 - 1, 1024 * 1024, 1024 * 1024 + 1]) {
      const data = new Uint8Array(randomBytes(size));
      const path = await fileWith(`edge-${size}.whl`, data);
      expect((await hasher.hashFile(path, opts)).sha256, String(size)).toBe(sha256(data));
    }
  });

  it("빈 파일의 해시는 알려진 상수다", async () => {
    const path = await fileWith("empty.whl", new Uint8Array(0));
    expect(await hasher.hashFile(path, opts)).toEqual({ sha256: EMPTY_SHA256, sizeBytes: 0 });
  });

  it("파일이 바뀌면 해시가 바뀌고, 되돌리면 같아진다(하루 한 번 같은 경로를 다시 읽는 상황)", async () => {
    const original = new Uint8Array(randomBytes(4096));
    const path = await fileWith("mutable.whl", original);
    const first = await hasher.hashFile(path, opts);

    const changed = original.slice();
    changed[2048] ^= 0x01; // 한 비트만 바꾼다
    await writeFile(path, changed);
    const second = await hasher.hashFile(path, opts);

    await writeFile(path, original);
    const third = await hasher.hashFile(path, opts);

    expect(second.sha256).toBe(sha256(changed));
    expect(second.sha256).not.toBe(first.sha256);
    expect(third.sha256).toBe(first.sha256);

    await appendFile(path, new Uint8Array([0])); // 끝에 1바이트 덧붙여도 바뀐다
    expect((await hasher.hashFile(path, opts)).sha256).not.toBe(first.sha256);
  });

  it("내용이 같으면 파일 이름이 달라도 해시가 같다(이름이 아니라 바이트를 본다)", async () => {
    const data = new Uint8Array(randomBytes(2048));
    const a = await fileWith("name-a.whl", data);
    const b = await fileWith("totally-different-name.zip", data);
    expect((await hasher.hashFile(a, opts)).sha256).toBe((await hasher.hashFile(b, opts)).sha256);
  });

  it("없는 파일은 NOT_FOUND다", async () => {
    expect(await reason(hasher.hashFile(join(dir, "nope.whl"), opts))).toBe("NOT_FOUND");
    expect(await reason(hasher.hashFile(join(dir, "no-dir", "nope.whl"), opts))).toBe("NOT_FOUND");
  });

  it("디렉터리는 NOT_A_FILE이다(성공값으로 보정하지 않는다)", async () => {
    const sub = join(dir, "a-directory");
    await mkdir(sub, { recursive: true });
    const r = await reason(hasher.hashFile(sub, opts));
    // Windows는 디렉터리 열기가 EISDIR·EPERM 등으로 갈릴 수 있다 — 어느 쪽이든 성공해서는 안 된다.
    expect(["NOT_A_FILE", "READ_FAILED"]).toContain(r);
  });

  it("잘못된 입력(빈 문자열·NUL·문자열이 아님)은 READ_FAILED이며 파일을 만들지 않는다", async () => {
    expect(await reason(hasher.hashFile("", opts))).toBe("READ_FAILED");
    expect(await reason(hasher.hashFile("a\u0000b", opts))).toBe("READ_FAILED");
    expect(await reason(hasher.hashFile(undefined as unknown as string, opts))).toBe("READ_FAILED");
  });

  it("크기 상한: 상한과 같으면 읽고, 넘으면 TOO_LARGE다", async () => {
    const data = new Uint8Array(randomBytes(1000));
    const path = await fileWith("limit.whl", data);
    expect((await hasher.hashFile(path, { maxBytes: 1000 })).sha256).toBe(sha256(data));
    expect(await reason(hasher.hashFile(path, { maxBytes: 999 }))).toBe("TOO_LARGE");
    expect(await reason(hasher.hashFile(path, { maxBytes: 0 }))).toBe("TOO_LARGE");
  });

  it("이미 취소됐으면 읽지 않는다(CANCELLED)", async () => {
    const path = await fileWith("cancel.whl", new Uint8Array(10));
    expect(await reason(hasher.hashFile(path, { ...opts, signal: AbortSignal.abort() }))).toBe(
      "CANCELLED"
    );
  });

  it("코어와 함께: 실제 파일의 관측이 독립 계산값과 같고, 없는 파일은 해시 없이 실패한다", async () => {
    const data = new Uint8Array(randomBytes(70_000));
    const path = await fileWith("core.whl", data);
    expect(await observeWheelHash({ hasher }, { path })).toEqual({
      status: "OBSERVED",
      failure: null,
      sha256: sha256(data),
      sizeBytes: 70_000,
    });
    expect(await observeWheelHash({ hasher }, { path: join(dir, "missing.whl") })).toEqual({
      status: "FAILED",
      failure: "NOT_FOUND",
      sha256: null,
      sizeBytes: null,
    });
  });

  it("읽기 전용이다: 읽은 뒤 파일 바이트와 수정 시각이 그대로다", async () => {
    const data = new Uint8Array(randomBytes(5000));
    const path = await fileWith("readonly-check.whl", data);
    const { statSync, readFileSync } = await import("node:fs");
    const before = statSync(path);
    await hasher.hashFile(path, opts);
    const after = statSync(path);
    expect(after.mtimeMs).toBe(before.mtimeMs);
    expect(after.size).toBe(before.size);
    expect(sha256(new Uint8Array(readFileSync(path)))).toBe(sha256(data));
  });
});

// ── 주입한 open으로 읽는 도중의 사건을 결정적으로 재현한다 ─────────────────────────────────────

interface FakeFileOptions {
  size: number;
  /** read가 돌려줄 전체 바이트(크기와 다를 수 있다). */
  content?: Uint8Array;
  /** 두 번째 stat이 돌려줄 크기·수정 시각. */
  after?: { size: number; mtimeMs: number };
  before?: { mtimeMs: number };
  isFile?: boolean;
  readError?: Error;
  statError?: Error;
}

function fakeOpen(file: FakeFileOptions): { open: OpenForRead; closed: () => number } {
  let closes = 0;
  const content = file.content ?? new Uint8Array(file.size);
  const open: OpenForRead = async () => {
    let statCalls = 0;
    let offset = 0;
    const handle = {
      async stat() {
        statCalls += 1;
        if (file.statError) throw file.statError;
        const second = statCalls >= 2 && file.after;
        return {
          isFile: () => file.isFile ?? true,
          size: second ? file.after!.size : file.size,
          mtimeMs: second ? file.after!.mtimeMs : (file.before?.mtimeMs ?? 1000),
        };
      },
      async read(buffer: Uint8Array, bufferOffset: number, length: number) {
        if (file.readError) throw file.readError;
        const count = Math.min(length, content.length - offset);
        buffer.set(content.subarray(offset, offset + count), bufferOffset);
        offset += count;
        return { bytesRead: count, buffer };
      },
      async close() {
        closes += 1;
      },
    };
    return handle as unknown as FileHandle;
  };
  return { open, closed: () => closes };
}

describe("createNodeArtifactHasher — 읽는 도중의 사건(주입한 open)", () => {
  const run = (file: FakeFileOptions, o: { maxBytes: number; signal?: AbortSignal } = opts) => {
    const fake = fakeOpen(file);
    return { fake, promise: createNodeArtifactHasher({ open: fake.open }).hashFile("/x", o) };
  };

  it("정상: 해시를 돌려주고 핸들을 닫는다", async () => {
    const content = new Uint8Array(randomBytes(2000));
    const { fake, promise } = run({ size: 2000, content });
    expect(await promise).toEqual({ sha256: sha256(content), sizeBytes: 2000 });
    expect(fake.closed()).toBe(1);
  });

  it("읽은 바이트 수가 처음 확인한 크기와 다르면 FILE_CHANGED_DURING_READ다(부분 결과를 주지 않는다)", async () => {
    const { fake, promise } = run({ size: 100, content: new Uint8Array(150) });
    expect(await reason(promise)).toBe("FILE_CHANGED_DURING_READ");
    expect(fake.closed()).toBe(1);
  });

  it("읽은 뒤 크기가 달라졌으면 FILE_CHANGED_DURING_READ다", async () => {
    const { promise } = run({ size: 100, after: { size: 101, mtimeMs: 1000 } });
    expect(await reason(promise)).toBe("FILE_CHANGED_DURING_READ");
  });

  it("읽은 뒤 수정 시각이 달라졌으면 FILE_CHANGED_DURING_READ다", async () => {
    const { promise } = run({ size: 100, after: { size: 100, mtimeMs: 2000 } });
    expect(await reason(promise)).toBe("FILE_CHANGED_DURING_READ");
  });

  it("읽는 도중 상한을 넘으면 TOO_LARGE다(처음 확인한 크기가 작았어도)", async () => {
    const { fake, promise } = run({ size: 10, content: new Uint8Array(50) }, { maxBytes: 20 });
    expect(await reason(promise)).toBe("TOO_LARGE");
    expect(fake.closed()).toBe(1);
  });

  it("처음 확인한 크기가 상한을 넘으면 TOO_LARGE이고 읽지도 않는다(큰 파일을 읽다가 실패하지 않는다)", async () => {
    // 읽으면 READ_FAILED가 되도록 해 둔다 — 사전 검사가 있으면 읽기에 이르지 않아 TOO_LARGE다.
    const { fake, promise } = run(
      { size: 1000, content: new Uint8Array(1000), readError: new Error("읽으면 안 된다") },
      { maxBytes: 10 }
    );
    expect(await reason(promise)).toBe("TOO_LARGE");
    expect(fake.closed()).toBe(1);
  });

  it("일반 파일이 아니면 NOT_A_FILE이고 읽지 않는다", async () => {
    const { fake, promise } = run({
      size: 5,
      isFile: false,
      readError: new Error("읽으면 안 된다"),
    });
    expect(await reason(promise)).toBe("NOT_A_FILE");
    expect(fake.closed()).toBe(1);
  });

  it("읽기 오류는 READ_FAILED이고 오류 원문을 담지 않는다", async () => {
    const { fake, promise } = run({ size: 5, readError: new Error("EIO at /secret/disk") });
    let message = "";
    try {
      await promise;
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toContain("/secret/disk");
    expect(fake.closed()).toBe(1);
    expect(await reason(run({ size: 5, readError: new Error("EIO") }).promise)).toBe("READ_FAILED");
  });

  it("stat 오류는 READ_FAILED이고 핸들을 닫는다", async () => {
    const { fake, promise } = run({ size: 5, statError: new Error("stat 실패") });
    expect(await reason(promise)).toBe("READ_FAILED");
    expect(fake.closed()).toBe(1);
  });

  it("열 때의 오류 코드를 토큰으로 바꾼다: ENOENT·ENOTDIR → NOT_FOUND, EISDIR → NOT_A_FILE, 그 밖 → READ_FAILED", async () => {
    const failing =
      (code: string): OpenForRead =>
      async () => {
        throw Object.assign(new Error(`${code}: /secret`), { code });
      };
    const map: [string, string][] = [
      ["ENOENT", "NOT_FOUND"],
      ["ENOTDIR", "NOT_FOUND"],
      ["EISDIR", "NOT_A_FILE"],
      ["EACCES", "READ_FAILED"],
      ["EMFILE", "READ_FAILED"],
    ];
    for (const [code, expected] of map) {
      const h = createNodeArtifactHasher({ open: failing(code) });
      expect(await reason(h.hashFile("/x", opts)), code).toBe(expected);
    }
  });
});

// ── 일반 파일이 아닌 입력: 열기 자체가 막히지 않는다 ───────────────────────────────────────────────
//
// 결함(PR #32 외부 검토): FIFO를 --wheel-artifact로 주면 open(path, "r")이 쓰기 쪽이 열릴 때까지 운영체제 안에서 대기한다. 그 대기는
// libuv 스레드풀에서 일어나 AbortSignal로 끊을 수 없고, 호출한 CLI의 잠금·수신기 정리가 영원히 시작되지 않았다.
// 수정은 대기를 "끊는" 것이 아니라 생기지 않게 하는 것이다: 읽기 전용 + O_NONBLOCK으로 열면 FIFO도 곧바로 열리고, 열린 핸들의
// fstat이 일반 파일이 아님을 알려 준다.
//
// 이 절의 시험은 세 층이다.
//  1) 순수 계산: 어떤 플래그를 쓰는가(readOnlyOpenFlags).
//  2) 에뮬레이트한 POSIX 열기(모든 플랫폼에서 돈다): 모델이 "O_NONBLOCK 없는 열기는 대기한다"를 재현하므로 옛 구현은 여기서 매달린다.
//     모델은 문서의 규칙일 뿐 커널의 증거가 아니다 — 아래 3)이 실제 확인이다.
//  3) 실제 FIFO·장치(POSIX 전용, Windows에서는 건너뛴다)와 실제 Windows 특수 입력(NUL 장치·파이프 경로, Windows 전용).
// 모든 시험에는 시간 한도와 정리가 있다: 한도는 시험 쪽 장치일 뿐이며(제품 코드의 대기를 끊는 것이 아니다), 실패하는 구현이 시험 프로세스나
// 열기 작업을 남기지 않도록 한도 뒤에 대기 중인 열기를 풀어 준다.

/** 시험 쪽 시간 한도. 한도 안에 끝나면 true, 아니면 false(매달림). work의 성공·실패는 묻지 않는다. */
async function settledWithin(work: Promise<unknown>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });
  try {
    return await Promise.race([
      work.then(
        () => true,
        () => true
      ),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** 성공하면 "OK", ArtifactHashError면 그 토큰, 그 밖의 예외는 다시 던진다. */
async function outcomeOf(work: Promise<unknown>): Promise<string> {
  try {
    await work;
    return "OK";
  } catch (error) {
    if (error instanceof ArtifactHashError) return error.reason;
    throw error;
  }
}

const {
  O_RDONLY: L_RDONLY,
  O_NONBLOCK: L_NONBLOCK,
  O_NOCTTY: L_NOCTTY,
  O_WRONLY: L_WRONLY,
  O_RDWR: L_RDWR,
  O_CREAT: L_CREAT,
  O_EXCL: L_EXCL,
  O_TRUNC: L_TRUNC,
  O_APPEND: L_APPEND,
} = LINUX_OPEN_CONSTANTS;
const WRITE_BITS = L_WRONLY | L_RDWR | L_CREAT | L_EXCL | L_TRUNC | L_APPEND;

/** 에뮬레이트한 POSIX 열기로 hashFile을 돌린다. 한도 뒤에는 대기 중인 열기를 풀어 어떤 구현이든 아무것도 남기지 않는다. */
async function hashEmulated(
  emu: PosixOpenEmulator,
  path: string,
  options: { signal?: AbortSignal; maxBytes?: number; ms?: number } = {}
): Promise<{ settled: boolean; outcome: string }> {
  const hasher = createNodeArtifactHasher({
    open: emu.open,
    openFlags: readOnlyOpenFlags(LINUX_OPEN_CONSTANTS, "linux"),
  });
  const work = hasher.hashFile(path, {
    maxBytes: options.maxBytes ?? 1 << 20,
    ...(options.signal ? { signal: options.signal } : {}),
  });
  const settled = await settledWithin(work, options.ms ?? 2000);
  emu.releasePending(); // 매달린 구현이 있어도 이 줄 뒤에는 끝난다 — 남는 열기 작업이 없다
  const finished = await settledWithin(work, 2000);
  return { settled, outcome: finished ? await outcomeOf(work) : "STILL_PENDING" };
}

describe("readOnlyOpenFlags — 열기 플래그 계산", () => {
  it("POSIX: 읽기 전용 + 비차단 + 제어 터미널 금지이고, 쓰기 계열 비트가 하나도 없다", () => {
    const flags = readOnlyOpenFlags(LINUX_OPEN_CONSTANTS, "linux");
    expect(flags).toBe(L_RDONLY | L_NONBLOCK | L_NOCTTY);
    expect((flags as number) & WRITE_BITS).toBe(0);
  });

  it("다른 POSIX(상수 값이 다른 darwin 모양)도 같은 규칙이다", () => {
    const darwinLike = { O_RDONLY: 0, O_NONBLOCK: 0x4, O_NOCTTY: 0x20000 };
    expect(readOnlyOpenFlags(darwinLike, "darwin")).toBe(0x4 | 0x20000);
  });

  it("O_NOCTTY가 없어도 O_NONBLOCK이 있으면 열 수 있다(제어 터미널 금지는 덧붙이는 방어다)", () => {
    expect(readOnlyOpenFlags({ O_RDONLY: 0, O_NONBLOCK: 0x800 }, "linux")).toBe(0x800);
  });

  it("win32: O_RDONLY 하나다 — 예전 'r' 열기와 같은 값이어서 Windows의 동작이 바뀌지 않는다", () => {
    expect(readOnlyOpenFlags({ O_RDONLY: 0 }, "win32")).toBe(0);
    // win32에는 O_NONBLOCK이 있어도 쓰지 않는다(예전 열기와 같은 값을 유지한다).
    expect(readOnlyOpenFlags({ O_RDONLY: 0, O_NONBLOCK: 0x800 }, "win32")).toBe(0);
  });

  it("O_NONBLOCK이 없는 POSIX는 null이다 — 막힐 수 있는 열기로 되돌아가지 않는다", () => {
    expect(readOnlyOpenFlags({ O_RDONLY: 0 }, "linux")).toBeNull();
    expect(readOnlyOpenFlags({ O_RDONLY: 0 }, "freebsd")).toBeNull();
  });

  it("이 플랫폼의 실제 상수: Windows는 O_RDONLY, 그 밖은 O_NONBLOCK 포함 읽기 전용이다", () => {
    const flags = readOnlyOpenFlags(fsConstants, process.platform);
    expect(flags).not.toBeNull();
    const writeBits =
      fsConstants.O_WRONLY |
      fsConstants.O_RDWR |
      fsConstants.O_CREAT |
      fsConstants.O_EXCL |
      fsConstants.O_TRUNC |
      fsConstants.O_APPEND;
    expect((flags as number) & writeBits).toBe(0);
    if (process.platform === "win32") {
      expect(flags).toBe(fsConstants.O_RDONLY);
    } else {
      expect((flags as number) & fsConstants.O_NONBLOCK).toBe(fsConstants.O_NONBLOCK);
    }
  });
});

describe("createNodeArtifactHasher — 열기 플래그가 실제로 쓰인다", () => {
  const regular = { "/w": { kind: "file", data: new Uint8Array([1, 2, 3]) } } as const;

  it("주입한 플래그가 그대로 open에 전달되고, 쓰기 계열 열기는 한 번도 없다", async () => {
    const emu = new PosixOpenEmulator({ ...regular });
    const flags = L_RDONLY | L_NONBLOCK | L_NOCTTY;
    await createNodeArtifactHasher({ open: emu.open, openFlags: flags }).hashFile("/w", opts);
    expect(emu.opens.map((o) => o.flags)).toEqual([flags]);
    expect(emu.writeAttempts).toBe(0);
    expect(emu.openHandles()).toBe(0);
  });

  it("플래그를 주입하지 않으면 이 플랫폼의 readOnlyOpenFlags를 쓴다(문자열 'r'이 아니다)", async () => {
    const emu = new PosixOpenEmulator({ ...regular });
    await createNodeArtifactHasher({ open: emu.open }).hashFile("/w", opts);
    expect(emu.opens).toHaveLength(1);
    expect(emu.opens[0].flags).toBe(readOnlyOpenFlags(fsConstants, process.platform));
    expect(typeof emu.opens[0].flags).toBe("number");
  });

  it("플래그를 정할 수 없으면(null) 열지 않고 READ_FAILED로 거절한다", async () => {
    const emu = new PosixOpenEmulator({ ...regular });
    const hasher = createNodeArtifactHasher({ open: emu.open, openFlags: null });
    expect(await reason(hasher.hashFile("/w", opts))).toBe("READ_FAILED");
    expect(emu.opens).toEqual([]);
  });
});

describe("createNodeArtifactHasher — 일반 파일이 아닌 입력(에뮬레이트한 POSIX 열기)", () => {
  const sizeable = new Uint8Array(3 * 1024 * 1024 + 7).fill(7); // 조각 3개 이상

  it("쓰기 쪽이 없는 FIFO: 열기가 대기하지 않고 NOT_A_FILE로 거절된다 — 해시도 읽기도 없고 핸들을 남기지 않는다", async () => {
    const emu = new PosixOpenEmulator({ "/fifo.whl": { kind: "fifo" } });
    const { settled, outcome } = await hashEmulated(emu, "/fifo.whl");
    expect(settled, "쓰기 쪽이 없어도 한도 안에 끝나야 한다").toBe(true);
    expect(outcome).toBe("NOT_A_FILE");
    expect(emu.pendingOpens()).toBe(0);
    expect(emu.openHandles()).toBe(0);
    expect(emu.readCalls).toBe(0);
    expect(emu.writeAttempts).toBe(0);
    expect((emu.opens[0].flags as number) & L_NONBLOCK).toBe(L_NONBLOCK);
  });

  it("FIFO를 가리키는 심볼릭 링크도 같다(링크 하나·링크 사슬)", async () => {
    for (const path of ["/link.whl", "/link2.whl"]) {
      const emu = new PosixOpenEmulator({
        "/fifo.whl": { kind: "fifo" },
        "/link.whl": { kind: "symlink", target: "/fifo.whl" },
        "/link2.whl": { kind: "symlink", target: "/link.whl" },
      });
      const { settled, outcome } = await hashEmulated(emu, path);
      expect(settled, path).toBe(true);
      expect(outcome, path).toBe("NOT_A_FILE");
      expect(emu.opens[0].resolvedKind, path).toBe("fifo");
      expect(emu.pendingOpens(), path).toBe(0);
      expect(emu.openHandles(), path).toBe(0);
      expect(emu.readCalls, path).toBe(0);
    }
  });

  it("쓰기 쪽이 이미 열린 FIFO와 디렉터리도 성공 해시 없이 NOT_A_FILE이다", async () => {
    const emu = new PosixOpenEmulator({
      "/fifo-w.whl": { kind: "fifo", hasWriter: true },
      "/dir": { kind: "dir" },
    });
    for (const path of ["/fifo-w.whl", "/dir"]) {
      const { settled, outcome } = await hashEmulated(emu, path);
      expect(settled, path).toBe(true);
      expect(outcome, path).toBe("NOT_A_FILE");
    }
    expect(emu.openHandles()).toBe(0);
    expect(emu.readCalls).toBe(0);
  });

  it("외부 쓰기 쪽을 열어 주지 않아도(releasePending을 부르지 않는다) 거절이 끝난다", async () => {
    const emu = new PosixOpenEmulator({ "/fifo.whl": { kind: "fifo" } });
    const hasher = createNodeArtifactHasher({
      open: emu.open,
      openFlags: readOnlyOpenFlags(LINUX_OPEN_CONSTANTS, "linux"),
    });
    const work = hasher.hashFile("/fifo.whl", opts);
    try {
      expect(await settledWithin(work, 2000)).toBe(true);
      expect(await outcomeOf(work)).toBe("NOT_A_FILE");
      expect(emu.pendingOpens()).toBe(0);
    } finally {
      emu.releasePending(); // 실패하는 구현이 남긴 대기가 있다면 여기서 풀린다
      await settledWithin(work, 2000);
    }
  });

  it("진행 중 취소(열기 직후): FIFO 열기가 대기하지 않으므로 취소해도 끝나고, 해시 없이 NOT_A_FILE 또는 CANCELLED다", async () => {
    const emu = new PosixOpenEmulator({ "/fifo.whl": { kind: "fifo" } });
    const controller = new AbortController();
    const hasher = createNodeArtifactHasher({
      open: emu.open,
      openFlags: readOnlyOpenFlags(LINUX_OPEN_CONSTANTS, "linux"),
    });
    const work = hasher.hashFile("/fifo.whl", { ...opts, signal: controller.signal });
    controller.abort(); // 열기가 진행 중인 바로 그 순간에 취소한다
    try {
      expect(await settledWithin(work, 2000), "취소했는데도 끝나지 않는다").toBe(true);
      expect(["NOT_A_FILE", "CANCELLED"]).toContain(await outcomeOf(work));
      expect(emu.pendingOpens()).toBe(0);
      expect(emu.openHandles()).toBe(0);
    } finally {
      emu.releasePending();
      await settledWithin(work, 2000);
    }
  });

  it("진행 중 취소(읽는 도중): 다음 조각을 읽지 않고 CANCELLED이며 핸들을 닫는다", async () => {
    const emu = new PosixOpenEmulator({ "/big.whl": { kind: "file", data: sizeable } });
    const controller = new AbortController();
    let openGate!: () => void;
    const gate = new Promise<void>((resolve) => (openGate = resolve));
    let first = true;
    emu.beforeRead = async () => {
      if (first) {
        first = false;
        await gate; // 첫 조각을 읽는 중에 멈춘다
      }
    };
    const hasher = createNodeArtifactHasher({
      open: emu.open,
      openFlags: readOnlyOpenFlags(LINUX_OPEN_CONSTANTS, "linux"),
    });
    const work = hasher.hashFile("/big.whl", { maxBytes: 1 << 30, signal: controller.signal });
    try {
      for (let i = 0; i < 200 && emu.readCalls === 0; i++)
        await new Promise((r) => setTimeout(r, 5));
      expect(emu.readCalls).toBe(1); // 읽는 중이다
      controller.abort();
      openGate();
      expect(await settledWithin(work, 2000)).toBe(true);
      expect(await outcomeOf(work)).toBe("CANCELLED");
      expect(emu.readCalls).toBe(1); // 취소 뒤에는 더 읽지 않았다
      expect(emu.openHandles()).toBe(0);
    } finally {
      openGate();
      emu.releasePending();
      await settledWithin(work, 2000);
    }
  });

  it("진행 중 취소(느린 열기): 열기가 끝난 뒤 늦게 온 핸들을 닫고 CANCELLED이며 읽지 않는다", async () => {
    const emu = new PosixOpenEmulator({ "/w": { kind: "file", data: new Uint8Array([1, 2, 3]) } });
    const controller = new AbortController();
    let finishOpen!: () => void;
    const slow = new Promise<void>((resolve) => (finishOpen = resolve));
    const open: OpenForRead = async (path, flags) => {
      await slow;
      return emu.open(path, flags);
    };
    const hasher = createNodeArtifactHasher({
      open,
      openFlags: readOnlyOpenFlags(LINUX_OPEN_CONSTANTS, "linux"),
    });
    const work = hasher.hashFile("/w", { ...opts, signal: controller.signal });
    try {
      controller.abort();
      finishOpen();
      expect(await settledWithin(work, 2000)).toBe(true);
      expect(await outcomeOf(work)).toBe("CANCELLED");
      expect(emu.readCalls).toBe(0);
      expect(emu.openHandles()).toBe(0); // 늦게 온 핸들을 남기지 않는다
    } finally {
      finishOpen();
      await settledWithin(work, 2000);
    }
  });

  it("일반 파일의 계약은 그대로다: 해시·크기 제한·변경 확인이 같은 토큰을 낸다", async () => {
    const data = new Uint8Array(randomBytes(2 * 1024 * 1024 + 99));
    const emu = new PosixOpenEmulator({ "/ok.whl": { kind: "file", data } });
    const hasher = createNodeArtifactHasher({
      open: emu.open,
      openFlags: readOnlyOpenFlags(LINUX_OPEN_CONSTANTS, "linux"),
    });
    expect(await hasher.hashFile("/ok.whl", { maxBytes: 1 << 30 })).toEqual({
      sha256: sha256(data),
      sizeBytes: data.length,
    });
    expect(await outcomeOf(hasher.hashFile("/ok.whl", { maxBytes: 10 }))).toBe("TOO_LARGE");
    expect(emu.openHandles()).toBe(0);
    expect(emu.writeAttempts).toBe(0);
  });
});

describe("createNodeArtifactHasher — 일반 파일의 결과는 열기 방식과 무관하다", () => {
  it("알려진 값: 'abc'의 SHA-256", async () => {
    const path = await fileWith("abc.whl", new TextEncoder().encode("abc"));
    expect(await hasher.hashFile(path, opts)).toEqual({
      sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      sizeBytes: 3,
    });
  });

  it("새 열기 플래그와 예전 열기(O_RDONLY만)의 결과가 같다 — 여러 조각 파일", async () => {
    const data = new Uint8Array(randomBytes(3 * 1024 * 1024 + 4321));
    const path = await fileWith("compare.whl", data);
    const legacy = createNodeArtifactHasher({ openFlags: fsConstants.O_RDONLY });
    const current = createNodeArtifactHasher();
    const a = await legacy.hashFile(path, opts);
    const b = await current.hashFile(path, opts);
    expect(b).toEqual(a);
    expect(b.sha256).toBe(sha256(data));
  });

  it("FIFO를 거절한 뒤에도 같은 어댑터로 일반 파일을 읽는다(상태를 남기지 않는다)", async () => {
    const emu = new PosixOpenEmulator({
      "/fifo.whl": { kind: "fifo" },
      "/ok.whl": { kind: "file", data: new Uint8Array([9, 8, 7]) },
    });
    const h = createNodeArtifactHasher({
      open: emu.open,
      openFlags: readOnlyOpenFlags(LINUX_OPEN_CONSTANTS, "linux"),
    });
    const fifoWork = h.hashFile("/fifo.whl", opts);
    try {
      expect(await settledWithin(fifoWork, 2000)).toBe(true);
      expect(await outcomeOf(fifoWork)).toBe("NOT_A_FILE");
    } finally {
      emu.releasePending();
      await settledWithin(fifoWork, 2000);
    }
    expect((await h.hashFile("/ok.whl", opts)).sizeBytes).toBe(3);
    expect(emu.openHandles()).toBe(0);
  });
});

// ── 실제 FIFO (POSIX 전용) ─────────────────────────────────────────────────────────────────────────
//
// 이 절은 Windows에서 건너뛴다. 개발 PC(Windows 11)에서는 한 번도 돌리지 못했다 — Linux/macOS에서 확인이 필요하다.
// 쓰기 쪽을 아무도 열지 않는 진짜 FIFO를 만들어 hashFile을 부른다. 구현이 열기에서 매달리면 시험 쪽 한도(2초) 뒤에 FIFO의 쓰기 쪽을
// 비차단으로 열었다 닫아 매달린 열기를 풀어 준다 — 그래서 실패해도 시험 프로세스에 열기 작업이 남지 않는다.

describe.skipIf(process.platform === "win32")("createNodeArtifactHasher — 실제 POSIX FIFO", () => {
  /** 매달린 읽기 열기가 있다면 쓰기 쪽을 비차단으로 열었다 닫아 풀어 준다. 기다리는 읽기 쪽이 없으면 ENXIO가 나며 그것이 정상이다. */
  async function releaseBlockedOpen(fifoPath: string): Promise<void> {
    try {
      const writer = await openFile(fifoPath, fsConstants.O_WRONLY | fsConstants.O_NONBLOCK);
      await writer.close();
    } catch {
      /* ENXIO: 기다리는 읽기 쪽이 없다 */
    }
  }

  /** work가 끝날 때까지(최대 약 2초) 매달린 열기를 반복해서 풀어 준다. */
  async function drain(work: Promise<unknown>, fifoPath: string): Promise<boolean> {
    for (let i = 0; i < 20; i++) {
      if (await settledWithin(work, 100)) return true;
      await releaseBlockedOpen(fifoPath);
    }
    return settledWithin(work, 100);
  }

  /** FIFO를 만든다. 프로세스는 이 저장소가 허용하는 프로세스 포트("stub" 출처)로만 띄운다 — mkfifo 하나, 셸 없음. */
  async function makeFifo(name: string): Promise<string> {
    const path = join(dir, name);
    const child = await createNodeProcessPort({ provenance: "stub" }).spawn({
      command: "mkfifo",
      args: [path],
      cwd: dir,
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
    });
    const exit = await child.exited;
    await child.dispose();
    if (exit.code !== 0)
      throw new Error(`시험 준비 실패: mkfifo가 종료 코드 ${exit.code}로 끝났다`);
    return path;
  }

  it("쓰기 쪽이 없는 FIFO: 한도 안에 NOT_A_FILE로 거절된다(외부에서 쓰기 쪽을 열어 주지 않는다)", async () => {
    const fifo = await makeFifo("plain.fifo");
    const work = hasher.hashFile(fifo, opts);
    try {
      expect(await settledWithin(work, 2000), "열기가 쓰기 쪽을 기다리며 매달렸다").toBe(true);
      expect(await outcomeOf(work)).toBe("NOT_A_FILE");
    } finally {
      expect(await drain(work, fifo)).toBe(true);
    }
  });

  it("FIFO를 가리키는 심볼릭 링크도 같다", async () => {
    const fifo = await makeFifo("target.fifo");
    const link = join(dir, "to-fifo.whl");
    await symlink(fifo, link);
    const work = hasher.hashFile(link, opts);
    try {
      expect(await settledWithin(work, 2000), "링크를 따라 FIFO를 열다가 매달렸다").toBe(true);
      expect(await outcomeOf(work)).toBe("NOT_A_FILE");
    } finally {
      expect(await drain(work, fifo)).toBe(true);
    }
  });

  it("진행 중 취소: 취소해도 끝나며 해시는 나오지 않는다", async () => {
    const fifo = await makeFifo("cancel.fifo");
    const controller = new AbortController();
    const work = hasher.hashFile(fifo, { ...opts, signal: controller.signal });
    controller.abort();
    try {
      expect(await settledWithin(work, 2000), "취소했는데도 끝나지 않는다").toBe(true);
      expect(["NOT_A_FILE", "CANCELLED"]).toContain(await outcomeOf(work));
    } finally {
      expect(await drain(work, fifo)).toBe(true);
    }
  });

  it("문자 장치(/dev/null)도 읽지 않고 NOT_A_FILE로 거절된다", async () => {
    const work = hasher.hashFile("/dev/null", opts);
    expect(await settledWithin(work, 2000)).toBe(true);
    expect(await outcomeOf(work)).toBe("NOT_A_FILE");
  });

  it("FIFO를 거절한 뒤에도 같은 어댑터가 일반 파일을 읽는다", async () => {
    const fifo = await makeFifo("then-regular.fifo");
    const work = hasher.hashFile(fifo, opts);
    try {
      expect(await settledWithin(work, 2000)).toBe(true);
      expect(await outcomeOf(work)).toBe("NOT_A_FILE");
    } finally {
      expect(await drain(work, fifo)).toBe(true);
    }
    const data = new Uint8Array(randomBytes(70_000));
    const path = await fileWith("after-fifo.whl", data);
    expect(await hasher.hashFile(path, opts)).toEqual({
      sha256: sha256(data),
      sizeBytes: data.length,
    });
  });
});

// ── 실제 Windows 특수 입력 (Windows 전용) ──────────────────────────────────────────────────────────
//
// Windows에는 FIFO가 없다. 이 PC(Windows 11)에서 실제로 돌릴 수 있는 "일반 파일이 아닌 입력"은 두 가지다.
//  · NUL 장치(\\.\NUL): 실제로 열리고 문자 장치로 보인다 → 읽지 않고 NOT_A_FILE.
//  · 서버가 없는 이름 있는 파이프 경로: 열 수 없다(ENOENT) → NOT_FOUND. 기다리지 않는다.
// 서버가 있는 이름 있는 파이프는 net 모듈이 필요해 이 시험에서는 다루지 않는다(구조 시험이 net 사용을 두 파일로 제한한다).
// 그 경우는 수정 전 구현으로 한 번 손으로 확인했다: 연결은 되고 6ms 만에 NOT_A_FILE이었다(README '플랫폼별 검증 범위').

describe.skipIf(process.platform !== "win32")(
  "createNodeArtifactHasher — 실제 Windows 특수 입력",
  () => {
    it("NUL 장치: 열리지만 일반 파일이 아니어서 읽지 않고 NOT_A_FILE로 거절된다", async () => {
      const work = hasher.hashFile("\\\\.\\NUL", opts);
      expect(await settledWithin(work, 3000), "NUL 장치 열기가 매달렸다").toBe(true);
      expect(await outcomeOf(work)).toBe("NOT_A_FILE");
    });

    it("서버가 없는 이름 있는 파이프 경로: 기다리지 않고 NOT_FOUND다", async () => {
      const path = `\\\\.\\pipe\\semgrep-lsp-artifact-none-${process.pid}-${randomBytes(4).toString("hex")}`;
      const work = hasher.hashFile(path, opts);
      expect(await settledWithin(work, 3000), "파이프 열기가 매달렸다").toBe(true);
      expect(await outcomeOf(work)).toBe("NOT_FOUND");
    });
  }
);
