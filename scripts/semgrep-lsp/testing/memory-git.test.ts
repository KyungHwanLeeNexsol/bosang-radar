import { describe, expect, it } from "vitest";
import { MemoryGit } from "./memory-git";

const C1 = "a".repeat(40);
const C2 = "b".repeat(40);
const SUB = "c".repeat(40);
const dec = new TextDecoder();

function makeGit(): MemoryGit {
  return new MemoryGit({
    [C1]: {
      "src/b.ts": "hello\n",
      "src/a.ts": { content: "", mode: "100644" },
      link: { content: "src/a.ts", mode: "120000" },
      vendor: { content: SUB, mode: "160000" },
      "bin.dat": new Uint8Array([0, 1, 2]),
    },
    [C2]: { "only.txt": "다른 커밋" },
  });
}

describe("MemoryGit", () => {
  it("resolveCommit은 40자 소문자 16진수이면서 아는 커밋일 때만 돌려준다", async () => {
    const git = makeGit();
    expect(await git.resolveCommit(C1)).toBe(C1);
    expect(await git.resolveCommit("c".repeat(40))).toBeNull();
    expect(await git.resolveCommit("main")).toBeNull();
    expect(await git.resolveCommit(C1.slice(0, 7))).toBeNull();
    expect(await git.resolveCommit(C1.toUpperCase())).toBeNull();
    expect(await git.resolveCommit("")).toBeNull();
  });

  it("lsTree: 경로 바이트순, 기본 모드 100644, git과 같은 blob SHA, 바이트 크기", async () => {
    const entries = await makeGit().lsTree(C1);
    expect(entries.map((e) => e.path)).toEqual([
      "bin.dat",
      "link",
      "src/a.ts",
      "src/b.ts",
      "vendor",
    ]);
    const byPath = Object.fromEntries(entries.map((e) => [e.path, e]));
    expect(byPath["src/a.ts"]).toEqual({
      path: "src/a.ts",
      mode: "100644",
      type: "blob",
      blobSha: "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391",
      size: 0,
    });
    expect(byPath["src/b.ts"]).toMatchObject({
      mode: "100644",
      blobSha: "ce013625030ba8dba906f756967f9e9ca394464a",
      size: 6,
    });
    expect(byPath["bin.dat"].size).toBe(3);
    expect(byPath.link).toMatchObject({ mode: "120000", type: "blob", size: 8 });
  });

  it("모드 160000은 type commit이고 blobSha는 내용의 SHA, size는 null이다", async () => {
    const entries = await makeGit().lsTree(C1);
    expect(entries.find((e) => e.path === "vendor")).toEqual({
      path: "vendor",
      mode: "160000",
      type: "commit",
      blobSha: SUB,
      size: null,
    });
  });

  it("크기는 문자 수가 아니라 UTF-8 바이트 수다", async () => {
    const entries = await makeGit().lsTree(C2);
    expect(entries[0].size).toBe(new TextEncoder().encode("다른 커밋").byteLength);
  });

  it("알 수 없는 커밋의 lsTree는 거부된다", async () => {
    await expect(makeGit().lsTree("d".repeat(40))).rejects.toThrow();
  });

  it("lsTree가 돌려준 항목을 바꿔도 저장소는 변하지 않는다", async () => {
    const git = makeGit();
    (await git.lsTree(C1))[0].path = "tampered";
    expect((await git.lsTree(C1))[0].path).toBe("bin.dat");
  });

  it("readBlob은 어느 커밋에든 있는 blob의 내용을 돌려주고 없으면 거부된다", async () => {
    const git = makeGit();
    expect(dec.decode(await git.readBlob("ce013625030ba8dba906f756967f9e9ca394464a"))).toBe(
      "hello\n"
    );
    const other = (await git.lsTree(C2))[0];
    expect(dec.decode(await git.readBlob(other.blobSha))).toBe("다른 커밋");
    await expect(git.readBlob("0".repeat(40))).rejects.toThrow();
    // 서브모듈 SHA는 blob이 아니라 읽을 수 없다.
    await expect(git.readBlob(SUB)).rejects.toThrow();
  });

  it("잘못된 커밋 SHA나 서브모듈 내용은 생성 시점에 거부한다", () => {
    expect(() => new MemoryGit({ short: { "a.txt": "x" } })).toThrow();
    expect(
      () => new MemoryGit({ [C1]: { sub: { content: "not-a-sha", mode: "160000" } } })
    ).toThrow();
  });
});
