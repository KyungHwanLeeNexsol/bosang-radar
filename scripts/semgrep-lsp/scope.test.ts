import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SCOPE_REASON, buildScanTree, computeScope, resolveTarget, verifyScanTree } from "./scope";
import { gitBlobSha1, sha256Hex } from "./sha";
import { representativeStatus } from "./status";
import { MemoryFs } from "./testing/memory-fs";
import { MemoryGit, type MemoryGitCommits } from "./testing/memory-git";
import type { GitPort, GitTreeEntry, ScopeConfig, ScopeResult } from "./types";

const scopeConfig = JSON.parse(
  readFileSync(fileURLToPath(new URL("./data/scope.json", import.meta.url)), "utf8")
) as ScopeConfig;

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const SHA_C = "c".repeat(40);
const enc = new TextEncoder();

function compareBytes(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

function reasonOf(scope: ScopeResult, path: string): string | null | undefined {
  return scope.entries.find((e) => e.path === path)?.reason;
}

/** 호출 횟수를 세는 GitPort 감시자. */
function spied(inner: GitPort) {
  const calls = { resolveCommit: 0, lsTree: 0, readBlob: 0 };
  const port: GitPort = {
    resolveCommit: async (rev) => {
      calls.resolveCommit++;
      return inner.resolveCommit(rev);
    },
    lsTree: async (sha) => {
      calls.lsTree++;
      return inner.lsTree(sha);
    },
    readBlob: async (sha) => {
      calls.readBlob++;
      return inner.readBlob(sha);
    },
  };
  return { port, calls };
}

const MAX = scopeConfig.max_target_bytes;

const mixed: MemoryGitCommits = {
  [SHA_A]: {
    "src/a.ts": "export const a = 1;\n",
    "src/b.tsx": "export const b = 2;\n",
    "lib/c.js": "module.exports = 3;\n",
    "lib/d.mjs": "export default 4;\n",
    "lib/e.cjs": "module.exports = 5;\n",
    "lib/f.jsx": "export default 6;\n",
    "README.md": "# readme\n",
    "package.json": "{}\n",
    "types/x.d.ts": "export {};\n",
    "public/lib.min.js": "var a=1;\n",
    "node_modules/pkg/index.js": "x\n",
    "build/out.js": "x\n",
    "src/test/helper.ts": "x\n",
    "src/tests/helper.ts": "x\n",
    "src/__tests__/ok.ts": "x\n",
    "src/foo.test.ts": "x\n",
    "src/bar.spec.tsx": "x\n",
    "e2e/flow.ts": "x\n",
    ".claude/tool.ts": "x\n",
    ".moai/tool.ts": "x\n",
    "scripts/semgrep-lsp/self.ts": "x\n",
    "src/link.ts": { content: "a.ts", mode: "120000" },
    "vendor-sub": { content: "d".repeat(40), mode: "160000" },
    "src/huge.ts": "x".repeat(MAX + 1),
    "src/exact.ts": "x".repeat(MAX),
    "node_modules/pkg/types.d.ts": "x\n",
    "e2e/spec.test.ts": "x\n",
    "test/huge.ts": "x".repeat(MAX + 1),
    "docs/note.md": "x\n",
    "src/exec.ts": { content: "export {};\n", mode: "100755" },
    "src/odd.ts": { content: "x\n", mode: "100664" },
    "src/.hidden.ts": "x\n",
  },
};

describe("resolveTarget", () => {
  const git = new MemoryGit({ [SHA_A]: { "a.ts": "x" } });

  it("전체 40자 소문자 SHA는 해석된다", async () => {
    expect(await resolveTarget(git, SHA_A)).toEqual({ ok: true, sha: SHA_A });
  });

  it.each([
    ["브랜치 이름", "main"],
    ["HEAD", "HEAD"],
    ["약식 SHA", "aaaaaaa"],
    ["39자", "a".repeat(39)],
    ["41자", "a".repeat(41)],
    ["대문자 SHA", "A".repeat(40)],
    ["앞뒤 공백", ` ${SHA_A}`],
    ["빈 문자열", ""],
    ["16진수가 아닌 40자", "g".repeat(40)],
    ["ref 표현", `${SHA_A}~1`],
  ])("거부: %s — git 포트를 호출하지 않는다", async (_name, rev) => {
    const { port, calls } = spied(git);
    const result = await resolveTarget(port, rev);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons.map((r) => r.code)).toEqual(["TARGET_SHA_UNRESOLVED"]);
      expect(representativeStatus(result.reasons)).toBe("MANIFEST_MISMATCH");
    }
    expect(calls).toEqual({ resolveCommit: 0, lsTree: 0, readBlob: 0 });
  });

  it("git이 해석하지 못하면 TARGET_SHA_UNRESOLVED", async () => {
    const result = await resolveTarget(git, SHA_C);
    expect(result).toMatchObject({ ok: false, reasons: [{ code: "TARGET_SHA_UNRESOLVED" }] });
  });

  it("git이 다른 SHA를 돌려주면(별칭 해석) 거부한다", async () => {
    const liar: GitPort = {
      ...git,
      resolveCommit: async () => SHA_B,
      lsTree: git.lsTree,
      readBlob: git.readBlob,
    };
    const result = await resolveTarget(liar, SHA_A);
    expect(result.ok).toBe(false);
  });

  it("git 포트가 예외를 던져도 사유로 바꾼다", async () => {
    const broken: GitPort = {
      resolveCommit: async () => {
        throw new Error("boom");
      },
      lsTree: git.lsTree,
      readBlob: git.readBlob,
    };
    const result = await resolveTarget(broken, SHA_A);
    expect(result).toMatchObject({ ok: false, reasons: [{ code: "TARGET_SHA_UNRESOLVED" }] });
  });
});

describe("computeScope: 결정과 사유 우선순위", () => {
  const git = new MemoryGit(mixed);

  it("모든 추적 경로가 정확히 한 번 나온다", async () => {
    const tree = await git.lsTree(SHA_A);
    const scope = await computeScope(git, SHA_A, scopeConfig);
    expect(scope.entries).toHaveLength(tree.length);
    expect(new Set(scope.entries.map((e) => e.path)).size).toBe(tree.length);
    expect(scope.targetSha).toBe(SHA_A);
  });

  it("포함: JS/TS 확장자 여섯 가지와 점 파일, 실행 비트 파일", async () => {
    const scope = await computeScope(git, SHA_A, scopeConfig);
    const included = scope.included.map((e) => e.path);
    for (const path of [
      "src/a.ts",
      "src/b.tsx",
      "lib/c.js",
      "lib/d.mjs",
      "lib/e.cjs",
      "lib/f.jsx",
      "src/.hidden.ts",
      "src/exec.ts",
      "src/exact.ts",
      "src/__tests__/ok.ts",
    ]) {
      expect(included).toContain(path);
      expect(reasonOf(scope, path)).toBeNull();
    }
  });

  it("비정규 파일(심볼릭 링크·서브모듈·알 수 없는 모드)은 non-regular-file", async () => {
    const scope = await computeScope(git, SHA_A, scopeConfig);
    expect(reasonOf(scope, "src/link.ts")).toBe(SCOPE_REASON.nonRegularFile);
    expect(reasonOf(scope, "vendor-sub")).toBe(SCOPE_REASON.nonRegularFile);
    expect(reasonOf(scope, "src/odd.ts")).toBe(SCOPE_REASON.nonRegularFile);
  });

  it("JS/TS 확장자가 아니면 not-js-ts-extension", async () => {
    const scope = await computeScope(git, SHA_A, scopeConfig);
    for (const path of ["README.md", "package.json", "docs/note.md"]) {
      expect(reasonOf(scope, path)).toBe(SCOPE_REASON.notJsTsExtension);
    }
  });

  it("Semgrep 언어 제외: .d.ts, .min.js", async () => {
    const scope = await computeScope(git, SHA_A, scopeConfig);
    expect(reasonOf(scope, "types/x.d.ts")).toBe(SCOPE_REASON.languageExcluded);
    expect(reasonOf(scope, "public/lib.min.js")).toBe(SCOPE_REASON.languageExcluded);
  });

  it("Semgrep 기본 ignore: 디렉터리 이름(경로 중간 포함)", async () => {
    const scope = await computeScope(git, SHA_A, scopeConfig);
    for (const path of [
      "node_modules/pkg/index.js",
      "build/out.js",
      "src/test/helper.ts",
      "src/tests/helper.ts",
    ]) {
      expect(reasonOf(scope, path)).toBe(SCOPE_REASON.semgrepDefaultIgnore);
    }
  });

  it("디렉터리 이름이 부분 문자열로만 겹치면 제외하지 않는다(__tests__)", async () => {
    const scope = await computeScope(git, SHA_A, scopeConfig);
    expect(reasonOf(scope, "src/__tests__/ok.ts")).toBeNull();
  });

  it("명시적 제외: scope.json의 id가 사유가 된다", async () => {
    const scope = await computeScope(git, SHA_A, scopeConfig);
    expect(reasonOf(scope, "src/foo.test.ts")).toBe("test-or-spec-file");
    expect(reasonOf(scope, "src/bar.spec.tsx")).toBe("test-or-spec-file");
    expect(reasonOf(scope, "e2e/flow.ts")).toBe("e2e-directory");
    expect(reasonOf(scope, ".claude/tool.ts")).toBe("tool-scaffold-claude");
    expect(reasonOf(scope, ".moai/tool.ts")).toBe("tool-metadata-moai");
  });

  it("하네스 코드는 제외하지 않는다(ADR D6)", async () => {
    const scope = await computeScope(git, SHA_A, scopeConfig);
    expect(reasonOf(scope, "scripts/semgrep-lsp/self.ts")).toBeNull();
  });

  it("max_target_bytes: 초과만 제외하고 정확히 같은 크기는 포함한다", async () => {
    const scope = await computeScope(git, SHA_A, scopeConfig);
    expect(reasonOf(scope, "src/huge.ts")).toBe(SCOPE_REASON.maxTargetBytes);
    expect(reasonOf(scope, "src/exact.ts")).toBeNull();
  });

  it("우선순위: 비정규 → 확장자 → 언어 제외 → 기본 ignore → 명시적 → 크기", async () => {
    const scope = await computeScope(git, SHA_A, scopeConfig);
    // 언어 제외가 기본 ignore보다 앞선다.
    expect(reasonOf(scope, "node_modules/pkg/types.d.ts")).toBe(SCOPE_REASON.languageExcluded);
    // 기본 ignore가 명시적 제외·크기보다 앞선다.
    expect(reasonOf(scope, "test/huge.ts")).toBe(SCOPE_REASON.semgrepDefaultIgnore);
    // 명시적 제외 안에서는 scope.json의 위에서 아래 순서.
    expect(reasonOf(scope, "e2e/spec.test.ts")).toBe("test-or-spec-file");
    // 비정규가 확장자 검사보다 앞선다: 링크 대상이 .md여도 사유는 non-regular-file.
  });

  it("비정규 파일은 확장자와 무관하게 non-regular-file이 먼저다", async () => {
    const git2 = new MemoryGit({
      [SHA_A]: {
        "doc.md": { content: "x", mode: "120000" },
        "x/node_modules.ts": { content: "x", mode: "120000" },
      },
    });
    const scope = await computeScope(git2, SHA_A, scopeConfig);
    expect(reasonOf(scope, "doc.md")).toBe(SCOPE_REASON.nonRegularFile);
    expect(reasonOf(scope, "x/node_modules.ts")).toBe(SCOPE_REASON.nonRegularFile);
  });

  it("excludedCounts는 사유별 개수이고 합이 제외 항목 수와 같다", async () => {
    const scope = await computeScope(git, SHA_A, scopeConfig);
    const excluded = scope.entries.filter((e) => e.decision === "exclude");
    const sum = Object.values(scope.excludedCounts).reduce((a, b) => a + b, 0);
    expect(sum).toBe(excluded.length);
    expect(scope.included.length + excluded.length).toBe(scope.entries.length);
    for (const [reason, count] of Object.entries(scope.excludedCounts)) {
      expect(excluded.filter((e) => e.reason === reason)).toHaveLength(count);
    }
  });

  it("scopeSha256은 포함 항목의 '경로\\tblobSha\\n' 줄(경로 바이트순)의 sha256이다", async () => {
    const scope = await computeScope(git, SHA_A, scopeConfig);
    const lines = scope.included
      .map((e) => `${e.path}\t${e.blobSha}\n`)
      .sort((a, b) => compareBytes(a, b));
    // 경로 정렬과 줄 정렬이 같은지 독립적으로 확인한다(경로 접두 관계가 없는 이 입력에서는 같다).
    expect(scope.included.map((e) => e.path)).toEqual(
      [...scope.included.map((e) => e.path)].sort(compareBytes)
    );
    expect(scope.scopeSha256).toBe(sha256Hex(lines.join("")));
  });

  it("같은 입력이면 결과가 같고(결정적), 파일 내용이 바뀌면 scopeSha256이 바뀐다", async () => {
    const a1 = await computeScope(git, SHA_A, scopeConfig);
    const a2 = await computeScope(git, SHA_A, scopeConfig);
    expect(a2).toEqual(a1);
    const changed = new MemoryGit({
      [SHA_A]: { ...mixed[SHA_A], "src/a.ts": "export const a = 999;\n" },
    });
    expect((await computeScope(changed, SHA_A, scopeConfig)).scopeSha256).not.toBe(a1.scopeSha256);
  });

  it("제외 항목만 바뀌면 scopeSha256은 그대로다", async () => {
    const a1 = await computeScope(git, SHA_A, scopeConfig);
    const changed = new MemoryGit({
      [SHA_A]: { ...mixed[SHA_A], "README.md": "# 다른 내용\n" },
    });
    expect((await computeScope(changed, SHA_A, scopeConfig)).scopeSha256).toBe(a1.scopeSha256);
  });

  it("전체 40자가 아닌 SHA는 lsTree를 부르기 전에 예외로 막는다", async () => {
    const { port, calls } = spied(git);
    await expect(computeScope(port, "main", scopeConfig)).rejects.toThrow(/40/);
    expect(calls.lsTree).toBe(0);
  });

  it("크기를 알 수 없는 일반 blob은 조용히 넘기지 않고 예외로 알린다", async () => {
    const sizeless: GitPort = {
      resolveCommit: async (r) => r,
      lsTree: async (): Promise<GitTreeEntry[]> => [
        { path: "a.ts", mode: "100644", type: "blob", blobSha: "1".repeat(40), size: null },
      ],
      readBlob: async () => new Uint8Array(0),
    };
    await expect(computeScope(sizeless, SHA_A, scopeConfig)).rejects.toThrow(/a\.ts/);
  });

  it("lsTree가 같은 경로를 두 번 돌려주면 예외로 알린다", async () => {
    const dup: GitPort = {
      resolveCommit: async (r) => r,
      lsTree: async (): Promise<GitTreeEntry[]> => [
        { path: "a.ts", mode: "100644", type: "blob", blobSha: "1".repeat(40), size: 1 },
        { path: "a.ts", mode: "100644", type: "blob", blobSha: "2".repeat(40), size: 1 },
      ],
      readBlob: async () => new Uint8Array(0),
    };
    await expect(computeScope(dup, SHA_A, scopeConfig)).rejects.toThrow(/a\.ts/);
  });
});

describe("computeScope: 바이트 순서 정렬", () => {
  it("U+FF21(EF BC A1)이 U+1F600(F0 9F 98 80)보다 앞선다(UTF-16 순서와 반대)", async () => {
    const fullwidth = "app/\uFF21.ts";
    const emoji = "app/\u{1F600}.ts";
    // UTF-16 코드 단위 순서로는 이모지(서로게이트 D83D)가 먼저라는 점이 시험의 전제다.
    expect([emoji, fullwidth].sort()[0]).toBe(emoji);
    const git = new MemoryGit({ [SHA_A]: { [emoji]: "e\n", [fullwidth]: "f\n" } });
    const scope = await computeScope(git, SHA_A, scopeConfig);
    expect(scope.included.map((e) => e.path)).toEqual([fullwidth, emoji]);
    expect(scope.entries.map((e) => e.path)).toEqual([fullwidth, emoji]);
    const expectedHash = sha256Hex(
      `${fullwidth}\t${gitBlobSha1(enc.encode("f\n"))}\n${emoji}\t${gitBlobSha1(enc.encode("e\n"))}\n`
    );
    expect(scope.scopeSha256).toBe(expectedHash);
  });
});

describe("computeScope: 대상 SHA 사이의 변화가 E에 반영된다", () => {
  const commits: MemoryGitCommits = {
    [SHA_A]: {
      "src/keep.ts": "keep\n",
      "src/change.ts": "v1\n",
      "src/delete.ts": "gone\n",
      "src/old-name.ts": "moved\n",
    },
    [SHA_B]: {
      "src/keep.ts": "keep\n",
      "src/change.ts": "v2\n",
      "src/new-name.ts": "moved\n",
      "src/added.ts": "new\n",
    },
  };
  const git = new MemoryGit(commits);

  it("추가·삭제·이름 변경·내용 변경", async () => {
    const a = await computeScope(git, SHA_A, scopeConfig);
    const b = await computeScope(git, SHA_B, scopeConfig);
    const pathsA = a.included.map((e) => e.path);
    const pathsB = b.included.map((e) => e.path);
    expect(pathsB).toContain("src/added.ts");
    expect(pathsA).not.toContain("src/added.ts");
    expect(pathsA).toContain("src/delete.ts");
    expect(pathsB).not.toContain("src/delete.ts");
    expect(pathsA).toContain("src/old-name.ts");
    expect(pathsB).not.toContain("src/old-name.ts");
    expect(pathsB).toContain("src/new-name.ts");
    const moved = (s: ScopeResult, p: string) => s.included.find((e) => e.path === p)?.blobSha;
    expect(moved(b, "src/new-name.ts")).toBe(moved(a, "src/old-name.ts"));
    expect(moved(b, "src/change.ts")).not.toBe(moved(a, "src/change.ts"));
    expect(b.scopeSha256).not.toBe(a.scopeSha256);
  });

  it("빈 E도 잘 형성된 결과를 돌려준다", async () => {
    const empty = new MemoryGit({ [SHA_A]: { "README.md": "x\n" }, [SHA_B]: {} });
    const onlyDocs = await computeScope(empty, SHA_A, scopeConfig);
    expect(onlyDocs.included).toEqual([]);
    expect(onlyDocs.entries).toHaveLength(1);
    expect(onlyDocs.scopeSha256).toBe(sha256Hex(""));
    expect(onlyDocs.excludedCounts).toEqual({ [SCOPE_REASON.notJsTsExtension]: 1 });
    const none = await computeScope(empty, SHA_B, scopeConfig);
    expect(none).toMatchObject({ entries: [], included: [], excludedCounts: {}, targetSha: SHA_B });
  });
});

describe("buildScanTree / verifyScanTree", () => {
  const commits: MemoryGitCommits = {
    [SHA_A]: {
      "src/a.ts": "a\n",
      "src/한글.tsx": "k\n",
      "lib/b.js": "b\n",
      "README.md": "x\n",
      "src/a.test.ts": "x\n",
      "src/link.ts": { content: "a.ts", mode: "120000" },
    },
    [SHA_B]: {
      "src/a.ts": "a\n",
      "src/한글.tsx": "k\n",
      "lib/b.js": "b\n",
      "lib/new-product.ts": "n\n",
    },
  };
  const git = new MemoryGit(commits);
  const ROOT = "/scan/tree";

  async function built(sha = SHA_A) {
    const scope = await computeScope(git, sha, scopeConfig);
    const fs = new MemoryFs();
    const result = await buildScanTree(fs, git, scope, ROOT);
    return { scope, fs, result };
  }

  it("E에 해당하는 파일만 저장소 상대 경로로 쓴다", async () => {
    const { scope, fs, result } = await built();
    expect(result.written).toBe(scope.included.length);
    expect(await fs.listFilesRecursive(ROOT)).toEqual(
      scope.included.map((e) => e.path).sort(compareBytes)
    );
    expect(new TextDecoder().decode(await fs.readFile(`${ROOT}/src/a.ts`))).toBe("a\n");
    expect(await fs.exists(`${ROOT}/README.md`)).toBe(false);
    expect(await fs.exists(`${ROOT}/src/link.ts`)).toBe(false);
  });

  it("만든 트리는 검증을 통과한다", async () => {
    const { scope, fs } = await built();
    expect(await verifyScanTree(fs, scope, ROOT, scopeConfig)).toEqual([]);
  });

  it("옛 목록을 복사한 트리: 새로 생긴 제품 파일이 빠졌으면 SCAN_TREE_FILE_MISSING", async () => {
    const stale = await built(SHA_A);
    const scopeB = await computeScope(git, SHA_B, scopeConfig);
    const reasons = await verifyScanTree(stale.fs, scopeB, ROOT, scopeConfig);
    const missing = reasons.filter((r) => r.code === "SCAN_TREE_FILE_MISSING");
    expect(missing.map((r) => r.detail)).toEqual(["lib/new-product.ts"]);
    expect(representativeStatus(reasons)).toBe("MANIFEST_MISMATCH");
  });

  it("트리에 E에 없는 파일이 있으면 SCAN_TREE_FILE_ADDED", async () => {
    const { scope, fs } = await built();
    await fs.writeFileExclusive(`${ROOT}/lib/extra.js`, enc.encode("e\n"));
    const reasons = await verifyScanTree(fs, scope, ROOT, scopeConfig);
    expect(reasons).toEqual([{ code: "SCAN_TREE_FILE_ADDED", detail: "lib/extra.js" }]);
  });

  it("내용이 다르면 SCAN_TREE_FILE_CHANGED(바이트 하나)", async () => {
    const { scope } = await built();
    const tampered = new MemoryFs();
    await buildScanTree(tampered, git, scope, ROOT);
    // 같은 경로의 내용을 바꾼 새 트리.
    const fs2 = new MemoryFs();
    for (const path of await tampered.listFilesRecursive(ROOT)) {
      const data = await tampered.readFile(`${ROOT}/${path}`);
      await fs2.writeFileExclusive(
        `${ROOT}/${path}`,
        path === "lib/b.js" ? enc.encode("b!\n") : data
      );
    }
    const reasons = await verifyScanTree(fs2, scope, ROOT, scopeConfig);
    expect(reasons.map((r) => r.code)).toEqual(["SCAN_TREE_FILE_CHANGED"]);
    expect(reasons[0].detail).toContain("lib/b.js");
  });

  it("기본 ignore 이름의 디렉터리가 트리에 있으면 SCAN_TREE_IGNORED_DIR_NAME", async () => {
    const { scope, fs } = await built();
    await fs.writeFileExclusive(`${ROOT}/src/build/x.ts`, enc.encode("x\n"));
    const reasons = await verifyScanTree(fs, scope, ROOT, scopeConfig);
    const codes = reasons.map((r) => r.code);
    expect(codes).toContain("SCAN_TREE_IGNORED_DIR_NAME");
    expect(codes).toContain("SCAN_TREE_FILE_ADDED");
    expect(reasons.find((r) => r.code === "SCAN_TREE_IGNORED_DIR_NAME")?.detail).toBe("src/build");
  });

  it("점 디렉터리(.env)도 기본 ignore 이름이면 잡는다", async () => {
    const { scope, fs } = await built();
    await fs.writeFileExclusive(`${ROOT}/.env/x.ts`, enc.encode("x\n"));
    const reasons = await verifyScanTree(fs, scope, ROOT, scopeConfig);
    expect(reasons.map((r) => r.code)).toContain("SCAN_TREE_IGNORED_DIR_NAME");
  });

  it("빈 트리는 E 전체를 누락으로 보고한다", async () => {
    const scope = await computeScope(git, SHA_A, scopeConfig);
    const reasons = await verifyScanTree(new MemoryFs(), scope, ROOT, scopeConfig);
    expect(reasons.filter((r) => r.code === "SCAN_TREE_FILE_MISSING")).toHaveLength(
      scope.included.length
    );
  });

  it("빈 E: 트리를 만들면 빈 디렉터리만 있고 검증을 통과한다", async () => {
    const emptyGit = new MemoryGit({ [SHA_A]: { "README.md": "x\n" } });
    const scope = await computeScope(emptyGit, SHA_A, scopeConfig);
    const fs = new MemoryFs();
    expect((await buildScanTree(fs, emptyGit, scope, ROOT)).written).toBe(0);
    expect(await fs.exists(ROOT)).toBe(true);
    expect(await verifyScanTree(fs, scope, ROOT, scopeConfig)).toEqual([]);
  });

  it("이미 있는 파일 위에는 쓰지 않는다(독점 쓰기)", async () => {
    const { scope, fs } = await built();
    await expect(buildScanTree(fs, git, scope, ROOT)).rejects.toThrow(/EEXIST/);
  });

  it("blob 내용이 SHA와 다르면 쓰지 않고 예외로 알린다", async () => {
    const scope = await computeScope(git, SHA_A, scopeConfig);
    const lying: GitPort = {
      ...git,
      resolveCommit: git.resolveCommit,
      lsTree: git.lsTree,
      readBlob: async () => enc.encode("다른 내용"),
    };
    const fs = new MemoryFs();
    await expect(buildScanTree(fs, lying, scope, ROOT)).rejects.toThrow(/SHA/);
    expect(await fs.listFilesRecursive(ROOT)).toEqual([]);
  });

  it("경로 탈출이 있는 항목은 쓰지 않는다", async () => {
    const scope = await computeScope(git, SHA_A, scopeConfig);
    const forged: ScopeResult = {
      ...scope,
      included: [{ ...scope.included[0], path: "../escape.ts" }],
    };
    const fs = new MemoryFs();
    await expect(buildScanTree(fs, git, forged, ROOT)).rejects.toThrow(/경로/);
    expect(await fs.exists("/scan/escape.ts")).toBe(false);
  });

  it("Windows 형식 루트(역슬래시, 끝 구분자)도 같은 위치에 쓴다", async () => {
    const scope = await computeScope(git, SHA_A, scopeConfig);
    const fs = new MemoryFs();
    await buildScanTree(fs, git, scope, "C:\\scan\\tree\\");
    expect(await fs.exists("C:/scan/tree/src/a.ts")).toBe(true);
    expect(await verifyScanTree(fs, scope, "C:\\scan\\tree", scopeConfig)).toEqual([]);
  });
});
