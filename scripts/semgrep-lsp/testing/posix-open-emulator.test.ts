import { describe, expect, it } from "vitest";
import { LINUX_OPEN_CONSTANTS as C, PosixOpenEmulator } from "./posix-open-emulator";

// 에뮬레이터 자체의 시험이다. 이 에뮬레이터 위에 쌓은 시험(막히는 열기)이 의미를 가지려면, 모델이 "O_NONBLOCK 없이 쓰기 쪽 없는 FIFO를
// 읽기로 열면 대기한다"를 실제로 재현해야 한다. 모델이 문서의 규칙을 따르는지만 본다(실제 커널은 보지 않는다).

const settledWithin = async (promise: Promise<unknown>, ms: number): Promise<boolean> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });
  try {
    return await Promise.race([
      promise.then(
        () => true,
        () => true
      ),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
};

const nodes = () => ({
  "/f": { kind: "file", data: new Uint8Array([1, 2, 3]) } as const,
  "/fifo": { kind: "fifo" } as const,
  "/fifo-with-writer": { kind: "fifo", hasWriter: true } as const,
  "/dir": { kind: "dir" } as const,
  "/link-fifo": { kind: "symlink", target: "/fifo" } as const,
  "/loop-a": { kind: "symlink", target: "/loop-b" } as const,
  "/loop-b": { kind: "symlink", target: "/loop-a" } as const,
});

describe("PosixOpenEmulator — 모델이 문서의 규칙을 따른다", () => {
  it("일반 파일은 곧바로 열리고 읽힌다", async () => {
    const emu = new PosixOpenEmulator(nodes());
    const handle = await emu.open("/f", C.O_RDONLY);
    const st = await handle.stat();
    expect(st.isFile()).toBe(true);
    const buf = new Uint8Array(8);
    expect((await handle.read(buf, 0, 8, null)).bytesRead).toBe(3);
    await handle.close();
    expect(emu.openHandles()).toBe(0);
  });

  it("FIFO를 O_NONBLOCK 없이 읽기로 열면 쓰기 쪽이 열릴 때까지 대기한다 — 풀어 주면 끝난다", async () => {
    const emu = new PosixOpenEmulator(nodes());
    const opening = emu.open("/fifo", C.O_RDONLY);
    expect(await settledWithin(opening, 50)).toBe(false);
    expect(emu.pendingOpens()).toBe(1);
    emu.releasePending();
    expect(await settledWithin(opening, 1000)).toBe(true);
    expect(emu.pendingOpens()).toBe(0);
    expect(emu.openHandles()).toBe(1);
  });

  it('예전 방식의 문자열 "r"도 O_NONBLOCK이 없는 열기다(대기한다)', async () => {
    const emu = new PosixOpenEmulator(nodes());
    const opening = emu.open("/fifo", "r" as unknown as number);
    expect(await settledWithin(opening, 50)).toBe(false);
    emu.releasePending();
    await opening;
  });

  it("FIFO를 O_NONBLOCK으로 읽기 열면 쓰기 쪽이 없어도 곧바로 열린다(일반 파일이 아님이 보인다)", async () => {
    const emu = new PosixOpenEmulator(nodes());
    const handle = await emu.open("/fifo", C.O_RDONLY | C.O_NONBLOCK);
    expect((await handle.stat()).isFile()).toBe(false);
    expect(emu.pendingOpens()).toBe(0);
    await handle.close();
    expect(emu.openHandles()).toBe(0);
  });

  it("쓰기 쪽이 이미 있으면 O_NONBLOCK 없이도 열린다", async () => {
    const emu = new PosixOpenEmulator(nodes());
    const handle = await emu.open("/fifo-with-writer", C.O_RDONLY);
    expect((await handle.stat()).isFile()).toBe(false);
  });

  it("심볼릭 링크를 따라간다: 링크 → FIFO도 같은 규칙이다", async () => {
    const emu = new PosixOpenEmulator(nodes());
    expect(await settledWithin(emu.open("/link-fifo", C.O_RDONLY), 50)).toBe(false);
    emu.releasePending();
    const handle = await emu.open("/link-fifo", C.O_RDONLY | C.O_NONBLOCK);
    expect((await handle.stat()).isFile()).toBe(false);
    expect(emu.opens.at(-1)?.resolvedKind).toBe("fifo");
  });

  it("없는 경로는 ENOENT, 링크 순환은 ELOOP, 디렉터리는 열린다(일반 파일이 아님)", async () => {
    const emu = new PosixOpenEmulator(nodes());
    await expect(emu.open("/nope", C.O_RDONLY)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(emu.open("/loop-a", C.O_RDONLY)).rejects.toMatchObject({ code: "ELOOP" });
    const dir = await emu.open("/dir", C.O_RDONLY);
    expect((await dir.stat()).isFile()).toBe(false);
  });

  it("쓰기 계열 플래그로 열려 하면 거절하고 기록한다(읽기 전용 계약을 시험이 볼 수 있다)", async () => {
    const emu = new PosixOpenEmulator(nodes());
    for (const flag of [C.O_WRONLY, C.O_RDWR, C.O_CREAT, C.O_TRUNC, C.O_APPEND]) {
      await expect(emu.open("/f", C.O_RDONLY | flag)).rejects.toMatchObject({ code: "EACCES" });
    }
    expect(emu.writeAttempts).toBe(5);
    expect(emu.openHandles()).toBe(0);
  });

  it("일반 파일이 아닌 노드를 읽으면 오류이고 읽기 횟수가 센다", async () => {
    const emu = new PosixOpenEmulator(nodes());
    const handle = await emu.open("/fifo", C.O_RDONLY | C.O_NONBLOCK);
    await expect(handle.read(new Uint8Array(4), 0, 4, null)).rejects.toMatchObject({
      code: "EISDIR",
    });
    expect(emu.readCalls).toBe(1);
  });
});
