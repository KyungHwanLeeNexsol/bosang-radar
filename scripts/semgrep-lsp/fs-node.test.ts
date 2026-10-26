import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createNodeFs } from "./fs-node";
import { keyIsSameOrInside } from "./path-containment";
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

// ── physicalKey: 실제로 접근할 자리 ───────────────────────────────

describe("createNodeFs — physicalKey (증거 경로 겹침 판정의 바탕)", () => {
  async function linkOrSkip(ctx: { skip: () => never }, target: string, path: string) {
    try {
      await symlink(target, path, "junction"); // POSIX에서는 type 인자가 무시되고 폴더 링크가 된다
    } catch {
      ctx.skip(); // 링크를 만들 수 없는 환경: 검증하지 못한 것으로 보고한다
    }
  }

  it("같은 위치를 절대·상대·`.`·`..`·끝 구분자·중복 구분자로 적어도 같은 키다", async () => {
    const fs = createNodeFs();
    const tree = join(tmp, "tree");
    await mkdir(tree);
    await mkdir(join(tmp, "outside"));
    const expected = await fs.physicalKey(tree);
    const spellings = [
      `${tree}/`,
      `${tree}/.`,
      `${tmp}/outside/../tree`, // join()은 `..`를 미리 지우므로 원문 그대로 이어 붙인다
      `${tmp}//tree`,
      `${tmp}/nowhere/../tree`, // 아직 없는 폴더를 지나 돌아온다
    ];
    const rel = relative(process.cwd(), tree);
    if (!isAbsolute(rel)) spellings.push(rel, `${rel}/`); // 다른 드라이브면 상대 경로가 없다
    for (const spelled of spellings) expect(await fs.physicalKey(spelled), spelled).toBe(expected);
  });

  it("아직 없는 하위 폴더는 존재하는 접두를 기준으로 붙고, 서버 트리 안으로 판정된다", async () => {
    const fs = createNodeFs();
    const tree = join(tmp, "tree");
    await mkdir(tree);
    const treeKey = await fs.physicalKey(tree);
    const deep = await fs.physicalKey(`${tree}/a/b/c`);
    expect(deep).toBe(`${treeKey}/a/b/c`);
    expect(keyIsSameOrInside(deep, treeKey)).toBe(true);
    expect(keyIsSameOrInside(treeKey, treeKey)).toBe(true);
  });

  it("이름 접두만 비슷한 별도 폴더와 나란한 폴더는 안이 아니다", async () => {
    const fs = createNodeFs();
    const tree = join(tmp, "tree");
    await mkdir(tree);
    const treeKey = await fs.physicalKey(tree);
    for (const other of [`${tmp}/tree-evidence/run`, `${tmp}/tree2`, `${tmp}/evidence`, tmp]) {
      expect(keyIsSameOrInside(await fs.physicalKey(other), treeKey), other).toBe(false);
    }
  });

  it("서버 트리를 가리키는 링크(junction) 아래의 경로는 같은 자리다 — 아직 없는 하위 폴더도, 링크로 적은 서버 트리도", async (ctx) => {
    const fs = createNodeFs();
    const tree = join(tmp, "tree");
    await mkdir(tree);
    await linkOrSkip(ctx, tree, join(tmp, "alias"));
    const treeKey = await fs.physicalKey(tree);
    expect(await fs.physicalKey(join(tmp, "alias"))).toBe(treeKey);
    expect(keyIsSameOrInside(await fs.physicalKey(join(tmp, "alias", "evidence")), treeKey)).toBe(
      true
    );
    expect(keyIsSameOrInside(await fs.physicalKey(`${tmp}/alias/a/b/c`), treeKey)).toBe(true);
    // 서버 트리를 링크로 적고 증거를 원래 경로로 적어도 같다.
    const viaAlias = await fs.physicalKey(join(tmp, "alias"));
    expect(keyIsSameOrInside(await fs.physicalKey(join(tree, "ev")), viaAlias)).toBe(true);
  });

  it("끊어진 링크(대상이 사라진 junction)는 풀지 않고 던진다 — 호출자는 쓰기 전에 거절한다", async (ctx) => {
    const fs = createNodeFs();
    const gone = join(tmp, "gone");
    await mkdir(gone);
    await linkOrSkip(ctx, gone, join(tmp, "dangling"));
    await rm(gone, { recursive: true });
    await expect(fs.physicalKey(join(tmp, "dangling", "evidence"))).rejects.toMatchObject({
      code: "DANGLING_LINK",
    });
  });

  it("읽기만 한다: 없는 경로를 물어도, 존재하는 서버 트리 아래를 물어도 아무것도 만들지 않는다(탐침 폴더·파일 없음)", async () => {
    const fs = createNodeFs();
    const tree = join(tmp, "tree");
    await mkdir(join(tree, "src"), { recursive: true });
    await writeFile(join(tree, "src", "a.ts"), "export const a = 1;\n");
    const before = {
      top: (await readdir(tmp)).sort(),
      tree: (await readdir(tree, { recursive: true })).sort(),
      bytes: (await readFile(join(tree, "src", "a.ts"))).toString("hex"),
    };
    await fs.physicalKey(`${tmp}/nowhere/a/b`);
    await fs.physicalKey(`${tree}/evidence/run-1`);
    await fs.physicalKey(`${tmp}/outside/../tree/evidence`);
    expect({
      top: (await readdir(tmp)).sort(),
      tree: (await readdir(tree, { recursive: true })).sort(),
      bytes: (await readFile(join(tree, "src", "a.ts"))).toString("hex"),
    }).toEqual(before);
  });

  it("대소문자를 구분하지 않는 플랫폼(옵션)에서는 소문자로 접은 키를 돌려준다", async () => {
    const lower = createNodeFs({ caseInsensitive: true });
    const exact = createNodeFs({ caseInsensitive: false });
    const path = `${tmp}/Not-Yet/SubDir`;
    expect(await lower.physicalKey(path)).toBe((await exact.physicalKey(path)).toLowerCase());
  });
});
