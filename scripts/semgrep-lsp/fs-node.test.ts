import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createNodeFs } from "./fs-node";
import { MemoryFs } from "./testing/memory-fs";
import type { FsPort } from "./types";

// 실제 파일 시스템 시험. OS 임시 폴더(mkdtemp)에서만 쓰고 시험마다 지운다.

const enc = new TextEncoder();
const dec = new TextDecoder();

let tmp = "";
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "semgrep-lsp-fs-"));
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("createNodeFs — 기본 동작", () => {
  it("파일을 읽는다(순수 Uint8Array 사본)·없는 파일은 거부된다", async () => {
    const fs = createNodeFs();
    await writeFile(join(tmp, "a.txt"), "안녕");
    const bytes = await fs.readFile(join(tmp, "a.txt"));
    expect(dec.decode(bytes)).toBe("안녕");
    expect(Object.getPrototypeOf(bytes)).toBe(Uint8Array.prototype);
    await expect(fs.readFile(join(tmp, "missing"))).rejects.toThrow();
  });

  it("writeFileExclusive: 새 파일은 쓰고, 이미 있으면 거부하며 내용을 바꾸지 않는다", async () => {
    const fs = createNodeFs();
    const target = join(tmp, "out", "deep", "run.json");
    await fs.writeFileExclusive(target, enc.encode("1"));
    await expect(fs.writeFileExclusive(target, enc.encode("2"))).rejects.toThrow();
    expect(await readFile(target, "utf8")).toBe("1");
  });

  it("writeFileExclusive: 같은 이름의 디렉터리가 있어도 거부한다", async () => {
    const fs = createNodeFs();
    await mkdir(join(tmp, "dir"));
    await expect(fs.writeFileExclusive(join(tmp, "dir"), enc.encode("x"))).rejects.toThrow();
  });

  it("exists는 파일·디렉터리 모두 true, 없으면 false(상위가 파일이어도 false)", async () => {
    const fs = createNodeFs();
    await writeFile(join(tmp, "f"), "x");
    await mkdir(join(tmp, "d"));
    expect(await fs.exists(join(tmp, "f"))).toBe(true);
    expect(await fs.exists(join(tmp, "d"))).toBe(true);
    expect(await fs.exists(join(tmp, "nope"))).toBe(false);
    expect(await fs.exists(join(tmp, "f", "child"))).toBe(false);
  });

  it("mkdirp는 멱등이다", async () => {
    const fs = createNodeFs();
    await fs.mkdirp(join(tmp, "a", "b"));
    await fs.mkdirp(join(tmp, "a", "b"));
    expect(await fs.exists(join(tmp, "a", "b"))).toBe(true);
  });
});

// ── MemoryFs와의 일치(대응표) ─────────────────────────────────────

interface Backend {
  name: string;
  fs: FsPort;
  /** 시험용 루트. */
  root: string;
}

const FILES: Record<string, string> = {
  "b.txt": "b",
  ".hidden": "h",
  "sub/z.txt": "z",
  "sub/a.txt": "a",
  "Upper.txt": "U",
  "sub/deeper/x.ts": "x",
  "\u{1F600}": "1",
  Ａ: "2",
};

async function backends(): Promise<Backend[]> {
  const node = createNodeFs();
  const nodeRoot = join(tmp, "root");
  for (const [rel, text] of Object.entries(FILES)) {
    await node.writeFileExclusive(join(nodeRoot, rel), enc.encode(text));
  }
  await node.mkdirp(join(nodeRoot, "emptydir"));
  const memoryInitial: Record<string, string> = {};
  for (const [rel, text] of Object.entries(FILES)) memoryInitial[`/root/${rel}`] = text;
  const memory = new MemoryFs(memoryInitial);
  await memory.mkdirp("/root/emptydir");
  return [
    { name: "node", fs: node, root: nodeRoot },
    { name: "memory", fs: memory, root: "/root" },
  ];
}

describe("createNodeFs — MemoryFs와의 일치", () => {
  it("listFilesRecursive: 점 파일 포함·파일만·UTF-8 바이트순(두 구현의 결과가 같다)", async () => {
    const [node, memory] = await backends();
    const fromNode = await node.fs.listFilesRecursive(node.root);
    const fromMemory = await memory.fs.listFilesRecursive(memory.root);
    expect(fromNode).toEqual(fromMemory);
    expect(fromNode).toEqual([
      ".hidden",
      "Upper.txt",
      "b.txt",
      "sub/a.txt",
      "sub/deeper/x.ts",
      "sub/z.txt",
      "Ａ", // U+FF21 (EF BC A1)
      "\u{1F600}", // U+1F600 (F0 9F 98 80) — 바이트로는 뒤, UTF-16 코드 단위로는 앞
    ]);
  });

  it("listFilesRecursive: 끝 슬래시 루트는 같은 결과, 없는 루트는 빈 목록", async () => {
    for (const b of await backends()) {
      expect(await b.fs.listFilesRecursive(`${b.root}/`), b.name).toEqual(
        await b.fs.listFilesRecursive(b.root)
      );
      expect(await b.fs.listFilesRecursive(`${b.root}-nothing`), b.name).toEqual([]);
    }
  });

  it("listFilesRecursive: 루트가 파일이면 빈 목록", async () => {
    for (const b of await backends()) {
      expect(await b.fs.listFilesRecursive(`${b.root}/b.txt`), b.name).toEqual([]);
    }
  });

  it("readFile·exists·writeFileExclusive 의미가 같다", async () => {
    for (const b of await backends()) {
      const p = (rel: string): string => `${b.root}/${rel}`;
      expect(dec.decode(await b.fs.readFile(p("sub/a.txt"))), b.name).toBe("a");
      await expect(b.fs.readFile(p("missing")), b.name).rejects.toThrow();
      expect(await b.fs.exists(p("sub")), b.name).toBe(true);
      expect(await b.fs.exists(p("emptydir")), b.name).toBe(true);
      expect(await b.fs.exists(p("sub/a.txt")), b.name).toBe(true);
      expect(await b.fs.exists(p("sub/none")), b.name).toBe(false);
      await expect(
        b.fs.writeFileExclusive(p("b.txt"), enc.encode("new")),
        b.name
      ).rejects.toThrow();
      expect(dec.decode(await b.fs.readFile(p("b.txt"))), b.name).toBe("b");
      await b.fs.writeFileExclusive(p("fresh/dir/new.txt"), enc.encode("n"));
      expect(dec.decode(await b.fs.readFile(p("fresh/dir/new.txt"))), b.name).toBe("n");
      await b.fs.mkdirp(p("fresh/dir"));
      await b.fs.mkdirp(p("fresh/dir"));
    }
  });
});

// ── 심볼릭 링크: fail-closed ──────────────────────────────────────

describe("createNodeFs — 심볼릭 링크는 거부한다", () => {
  it("하위 디렉터리 링크(Windows는 junction)를 만나면 따라가지 않고 오류로 거부한다", async () => {
    const fs = createNodeFs();
    const outside = join(tmp, "outside");
    await mkdir(outside);
    await writeFile(join(outside, "secret.txt"), "s");
    const root = join(tmp, "tree");
    await mkdir(root);
    await writeFile(join(root, "ok.txt"), "ok");
    await symlink(outside, join(root, "link"), "junction");
    await expect(fs.listFilesRecursive(root)).rejects.toThrow(/심볼릭 링크/);
  });

  it("파일 링크도 거부한다(권한이 없는 환경에서는 건너뛴다)", async (ctx) => {
    const fs = createNodeFs();
    const root = join(tmp, "tree2");
    await mkdir(root);
    await writeFile(join(root, "real.txt"), "r");
    try {
      await symlink(join(root, "real.txt"), join(root, "alias.txt"), "file");
    } catch (error) {
      if ((error as { code?: string }).code === "EPERM") ctx.skip();
      throw error;
    }
    await expect(fs.listFilesRecursive(root)).rejects.toThrow(/심볼릭 링크/);
  });

  it("루트 자신이 링크여도 거부한다", async () => {
    const fs = createNodeFs();
    const real = join(tmp, "real");
    await mkdir(real);
    await writeFile(join(real, "a.txt"), "a");
    await symlink(real, join(tmp, "rootlink"), "junction");
    await expect(fs.listFilesRecursive(join(tmp, "rootlink"))).rejects.toThrow(/심볼릭 링크/);
  });
});
