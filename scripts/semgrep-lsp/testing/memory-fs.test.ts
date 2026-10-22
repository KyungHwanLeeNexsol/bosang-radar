import { describe, expect, it } from "vitest";
import { MemoryFs, normalizePath } from "./memory-fs";

const enc = new TextEncoder();
const dec = new TextDecoder();

describe("normalizePath", () => {
  it("역슬래시·중복 슬래시·점 구간을 정리한다", () => {
    expect(normalizePath("a\\b//c/./d")).toBe("a/b/c/d");
    expect(normalizePath("/x/y/../z/")).toBe("/x/z");
    expect(normalizePath("/")).toBe("/");
  });
});

describe("MemoryFs", () => {
  it("초기 파일을 읽을 수 있고 없는 파일은 거부된다", async () => {
    const fs = new MemoryFs({ "/r/a.txt": "안녕", "/r/b.bin": new Uint8Array([1, 2]) });
    expect(dec.decode(await fs.readFile("/r/a.txt"))).toBe("안녕");
    expect([...(await fs.readFile("/r/b.bin"))]).toEqual([1, 2]);
    await expect(fs.readFile("/r/missing")).rejects.toThrow();
  });

  it("읽은 바이트를 바꿔도 저장된 내용은 변하지 않는다", async () => {
    const fs = new MemoryFs({ "/a": "abc" });
    const first = await fs.readFile("/a");
    first[0] = 0;
    expect(dec.decode(await fs.readFile("/a"))).toBe("abc");
  });

  it("writeFileExclusive는 새 파일을 쓰고 이미 있으면 거부한다", async () => {
    const fs = new MemoryFs();
    await fs.writeFileExclusive("/e/run.json", enc.encode("1"));
    expect(await fs.exists("/e/run.json")).toBe(true);
    await expect(fs.writeFileExclusive("/e/run.json", enc.encode("2"))).rejects.toThrow();
    expect(dec.decode(await fs.readFile("/e/run.json"))).toBe("1");
  });

  it("역슬래시 경로도 같은 파일로 본다", async () => {
    const fs = new MemoryFs({ "/a/b.txt": "x" });
    expect(await fs.exists("\\a\\b.txt")).toBe(true);
  });

  it("mkdirp는 디렉터리를 기록하고 exists가 참이 된다", async () => {
    const fs = new MemoryFs();
    expect(await fs.exists("/out/deep")).toBe(false);
    await fs.mkdirp("/out/deep");
    expect(await fs.exists("/out/deep")).toBe(true);
    expect(await fs.exists("/out")).toBe(true);
    expect(fs.directories).toEqual(["/out", "/out/deep"]);
    await fs.mkdirp("/out/deep");
  });

  it("listFilesRecursive: 상대 경로, 점 파일 포함, 바이트순 오름차순, 디렉터리 제외", async () => {
    const fs = new MemoryFs({
      "/root/b.txt": "b",
      "/root/.hidden": "h",
      "/root/sub/z.txt": "z",
      "/root/sub/a.txt": "a",
      "/root/Upper.txt": "U",
      "/other/x.txt": "x",
      "/rootish/y.txt": "y",
    });
    await fs.mkdirp("/root/emptydir");
    expect(await fs.listFilesRecursive("/root")).toEqual([
      ".hidden",
      "Upper.txt",
      "b.txt",
      "sub/a.txt",
      "sub/z.txt",
    ]);
    expect(await fs.listFilesRecursive("/root/")).toEqual(await fs.listFilesRecursive("/root"));
    expect(await fs.listFilesRecursive("/nothing")).toEqual([]);
  });

  it("listFilesRecursive: 정렬은 UTF-16 단위가 아니라 UTF-8 바이트 순서다", async () => {
    // U+FF21(UTF-8 EF BC A1)은 U+1F600(UTF-8 F0 9F 98 80)보다 바이트로는 앞이지만 UTF-16으로는 뒤다.
    const fs = new MemoryFs({ "/r/\u{1F600}": "1", "/r/Ａ": "2" });
    expect(await fs.listFilesRecursive("/r")).toEqual(["Ａ", "\u{1F600}"]);
  });
});
