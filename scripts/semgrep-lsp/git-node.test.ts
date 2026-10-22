import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assertAllowedGitArgs, createNodeGit, type GitRunResult, type GitRunner } from "./git-node";
import { gitBlobSha1 } from "./sha";

// 이 시험은 이 작업 트리 자신의 저장소를 읽기 전용으로만 본다(git 쓰기 명령은 어댑터에 없다).

const SHA40 = /^[0-9a-f]{40}$/;
const REPO = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const enc = new TextEncoder();

/** HEAD 커밋을 .git 파일에서 직접 읽는다(허용 목록 밖의 git 명령을 쓰지 않으려는 것이다). */
function headSha(repo: string): string {
  const dotGit = join(repo, ".git");
  const text = readFileSync(dotGit, "utf8").trim();
  const gitdir = text.startsWith("gitdir:") ? resolve(repo, text.slice(7).trim()) : dotGit;
  const head = readFileSync(join(gitdir, "HEAD"), "utf8").trim();
  if (SHA40.test(head)) return head;
  const ref = head.replace(/^ref:\s*/, "");
  const commonFile = join(gitdir, "commondir");
  const common = existsSync(commonFile)
    ? resolve(gitdir, readFileSync(commonFile, "utf8").trim())
    : gitdir;
  for (const dir of [gitdir, common]) {
    const refPath = join(dir, ref);
    if (existsSync(refPath)) return readFileSync(refPath, "utf8").trim();
  }
  for (const line of readFileSync(join(common, "packed-refs"), "utf8").split("\n")) {
    const [sha, name] = line.trim().split(" ");
    if (name === ref && SHA40.test(sha)) return sha;
  }
  throw new Error(`HEAD를 해석하지 못했다: ${head}`);
}

function recordingRunner(result: GitRunResult | ((args: readonly string[]) => GitRunResult)): {
  runner: GitRunner;
  calls: { args: readonly string[]; maxBytes: number }[];
} {
  const calls: { args: readonly string[]; maxBytes: number }[] = [];
  const runner: GitRunner = async (args, maxBytes) => {
    calls.push({ args: [...args], maxBytes });
    return typeof result === "function" ? result(args) : result;
  };
  return { runner, calls };
}

describe("createNodeGit — 이 저장소를 읽기 전용으로", () => {
  const head = headSha(REPO);
  const git = createNodeGit({ repoDir: REPO, env: process.env });

  it("HEAD는 커밋으로 해석되고, 40자 16진수이지만 커밋이 아닌 값은 null이다", async () => {
    expect(await git.resolveCommit(head)).toBe(head);
    expect(await git.resolveCommit("c".repeat(40))).toBeNull();
  });

  it("lsTree(HEAD)에 package.json이 있고, 표본 blob의 내용 SHA·크기가 항목과 일치한다", async () => {
    const entries = await git.lsTree(head);
    const pkg = entries.find((e) => e.path === "package.json");
    expect(pkg).toBeDefined();
    expect(pkg?.type).toBe("blob");
    expect(pkg?.mode).toBe("100644");
    const blobs = entries.filter((e) => e.type === "blob");
    expect(blobs.length).toBeGreaterThan(0);
    // 앞쪽 20개와 package.json을 표본으로 읽는다(개수·SHA는 상수로 두지 않는다).
    const sample = [...new Set([...blobs.slice(0, 20), pkg!])];
    for (const entry of sample) {
      const bytes = await git.readBlob(entry.blobSha);
      expect(gitBlobSha1(bytes), entry.path).toBe(entry.blobSha);
      expect(bytes.byteLength, entry.path).toBe(entry.size);
    }
    // 트리 항목은 나오지 않는다(-r).
    expect(entries.every((e) => e.type === "blob" || e.type === "commit")).toBe(true);
  });

  it("GIT_* 환경변수를 물려받지 않는다(잘못된 GIT_DIR이 있어도 동작한다)", async () => {
    const polluted = createNodeGit({
      repoDir: REPO,
      env: { ...process.env, GIT_DIR: join(tmpdir(), "no-such-git-dir"), GIT_WORK_TREE: tmpdir() },
    });
    expect(await polluted.resolveCommit(head)).toBe(head);
  });

  it("저장소가 아닌 폴더는 null이 아니라 거부된다(git 오류를 숨기지 않는다)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "semgrep-lsp-git-"));
    try {
      const notRepo = createNodeGit({ repoDir: dir, env: process.env });
      await expect(notRepo.resolveCommit("a".repeat(40))).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("createNodeGit — 인자와 허용 목록", () => {
  it("형식이 잘못된 rev는 null이고 git(실행기)을 부르지 않는다", async () => {
    const { runner, calls } = recordingRunner({ exitCode: 0, stdout: new Uint8Array() });
    const git = createNodeGit({ repoDir: "/r", env: {}, runner });
    for (const rev of [
      "main",
      "HEAD",
      "abc1234",
      "A".repeat(40),
      `${"a".repeat(39)}g`,
      "",
      `${"a".repeat(40)}\n`,
    ]) {
      expect(await git.resolveCommit(rev), rev).toBeNull();
    }
    await expect(git.lsTree("main")).rejects.toThrow(TypeError);
    await expect(git.readBlob("HEAD:package.json")).rejects.toThrow(TypeError);
    expect(calls).toHaveLength(0);
  });

  it("세 연산은 정확히 정해진 인자로만 실행기를 부른다", async () => {
    const sha = "a".repeat(40);
    const { runner, calls } = recordingRunner((args) => {
      if (args[2] === "rev-parse") return { exitCode: 0, stdout: enc.encode(`${sha}\n`) };
      if (args[2] === "ls-tree") return { exitCode: 0, stdout: new Uint8Array() };
      return { exitCode: 0, stdout: enc.encode("data") };
    });
    const git = createNodeGit({ repoDir: "/r", env: {}, runner });
    expect(await git.resolveCommit(sha)).toBe(sha);
    expect(await git.lsTree(sha)).toEqual([]);
    expect(new TextDecoder().decode(await git.readBlob(sha))).toBe("data");
    expect(calls.map((c) => c.args)).toEqual([
      ["-C", "/r", "rev-parse", "--verify", "--quiet", `${sha}^{commit}`],
      ["-C", "/r", "ls-tree", "-r", "-l", "-z", sha],
      ["-C", "/r", "cat-file", "blob", sha],
    ]);
  });

  it("rev-parse: 종료 코드 1은 null, 다른 비정상 종료·이상한 출력은 거부", async () => {
    const sha = "b".repeat(40);
    const one = createNodeGit({
      repoDir: "/r",
      env: {},
      runner: recordingRunner({ exitCode: 1, stdout: new Uint8Array() }).runner,
    });
    expect(await one.resolveCommit(sha)).toBeNull();
    const fatal = createNodeGit({
      repoDir: "/r",
      env: {},
      runner: recordingRunner({ exitCode: 128, stdout: new Uint8Array() }).runner,
    });
    await expect(fatal.resolveCommit(sha)).rejects.toThrow();
    const odd = createNodeGit({
      repoDir: "/r",
      env: {},
      runner: recordingRunner({ exitCode: 0, stdout: enc.encode("not-a-sha\n") }).runner,
    });
    await expect(odd.resolveCommit(sha)).rejects.toThrow();
  });

  it("허용 목록 밖의 인자는 모양을 하나만 바꿔도 거부한다", () => {
    const sha = "a".repeat(40);
    const ok = [["-C", "/r", "cat-file", "blob", sha]];
    for (const args of ok) expect(() => assertAllowedGitArgs(args, "/r")).not.toThrow();
    const bad: string[][] = [
      ["-C", "/r", "status"],
      ["-C", "/r", "log", "-1"],
      ["-C", "/r", "checkout", sha],
      ["-C", "/r", "cat-file", "-p", sha],
      ["-C", "/r", "cat-file", "blob", sha, "extra"],
      ["-C", "/r", "cat-file", "blob", "HEAD"],
      ["-C", "/r", "ls-tree", "-r", "-l", sha],
      ["-C", "/r", "ls-tree", "-r", "-l", "-z", "HEAD"],
      ["-C", "/r", "rev-parse", "--verify", sha],
      ["-C", "/r", "rev-parse", "--verify", "--quiet", sha],
      ["-C", "/other", "cat-file", "blob", sha],
      ["-c", "core.pager=x", "-C", "/r", "cat-file", "blob", sha],
      ["cat-file", "blob", sha],
      [],
    ];
    for (const args of bad)
      expect(() => assertAllowedGitArgs(args, "/r"), args.join(" ")).toThrow();
  });

  it("repoDir가 비었거나 옵션처럼 보이면 만들지 못한다", () => {
    expect(() => createNodeGit({ repoDir: "", env: {} })).toThrow(TypeError);
    expect(() => createNodeGit({ repoDir: "--upload-pack=x", env: {} })).toThrow(TypeError);
  });
});

describe("createNodeGit — ls-tree 파싱", () => {
  const sha = "a".repeat(40);
  const blob1 = "1".repeat(40);
  const blob2 = "2".repeat(40);
  const sub = "3".repeat(40);
  const record = (meta: string, path: string): string => `${meta}\t${path}\0`;

  function gitWith(text: string) {
    const { runner } = recordingRunner({ exitCode: 0, stdout: enc.encode(text) });
    return createNodeGit({ repoDir: "/r", env: {}, runner });
  }

  it("-l의 공백 채움·서브모듈(크기 '-')·공백/유니코드/탭이 든 경로를 그대로 읽는다", async () => {
    const text =
      record(`100644 blob ${blob1}      12`, "src/a b.ts") +
      record(`120000 blob ${blob2}       5`, "한글/link\tTab") +
      record(`160000 commit ${sub}       -`, "vendor/mod");
    expect(await gitWith(text).lsTree(sha)).toEqual([
      { path: "src/a b.ts", mode: "100644", type: "blob", blobSha: blob1, size: 12 },
      { path: "한글/link\tTab", mode: "120000", type: "blob", blobSha: blob2, size: 5 },
      { path: "vendor/mod", mode: "160000", type: "commit", blobSha: sub, size: null },
    ]);
  });

  it("잘린 출력·모양이 깨진 레코드·알 수 없는 종류는 거부한다", async () => {
    const good = record(`100644 blob ${blob1}      12`, "a");
    await expect(gitWith(good.slice(0, -1)).lsTree(sha)).rejects.toThrow();
    await expect(gitWith(`100644 blob ${blob1} 12 a\0`).lsTree(sha)).rejects.toThrow();
    await expect(gitWith(record(`100644 blob nothex 12`, "a")).lsTree(sha)).rejects.toThrow();
    await expect(
      gitWith(record(`040000 tree ${blob1}       -`, "d")).lsTree(sha)
    ).rejects.toThrow();
    await expect(
      gitWith(record(`100644 blob ${blob1}     abc`, "a")).lsTree(sha)
    ).rejects.toThrow();
  });

  it("UTF-8이 아닌 경로 바이트는 거부한다(fail-closed)", async () => {
    const bytes = new Uint8Array([...enc.encode(`100644 blob ${blob1}       1\t`), 0xff, 0xfe, 0]);
    const { runner } = recordingRunner({ exitCode: 0, stdout: bytes });
    await expect(createNodeGit({ repoDir: "/r", env: {}, runner }).lsTree(sha)).rejects.toThrow();
  });

  it("비정상 종료 코드는 거부한다", async () => {
    const { runner } = recordingRunner({ exitCode: 128, stdout: new Uint8Array() });
    const git = createNodeGit({ repoDir: "/r", env: {}, runner });
    await expect(git.lsTree(sha)).rejects.toThrow();
    await expect(git.readBlob(sha)).rejects.toThrow();
  });
});
