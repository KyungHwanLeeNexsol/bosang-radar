import { createHash, randomBytes } from "node:crypto";
import { appendFile, mkdir, mkdtemp, rm, writeFile, type FileHandle } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createNodeArtifactHasher, type OpenForRead } from "./artifact-node";
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
