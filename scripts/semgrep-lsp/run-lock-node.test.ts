import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RUN_LOCK_SCHEMA, acquireRunLock, releaseRunLock, type RunLockPort } from "./run-lock";
import { canonicalTreePath, createNodeRunLockPort, treeKeyOf } from "./run-lock-node";
import { MemoryRunLock } from "./testing/memory-run-lock";
import { createPosixPathOps } from "./testing/posix-path-ops";

// 실제 디스크(운영체제 임시 폴더 아래의 시험 전용 폴더) 위에서 공유 실행 잠금의 노드 어댑터를 확인한다. 메모리 모의가 아니다.
// 서로 다른 프로세스 사이의 경쟁은 run-lock-node.integration.test.ts가 자식 프로세스로 확인한다.

let base: string;

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), "semgrep-lsp-lock-test-"));
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

let counter = 0;
/** 이 시험만의 새 폴더(트리의 부모가 된다). */
async function freshDir(): Promise<string> {
  counter += 1;
  const dir = join(base, `case-${counter}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

const request = (treePath: string, runId = "run-1") => ({ treePath, runId, mode: "target" });

describe("노드 포트 — 잠금 파일의 위치와 소유자 정보", () => {
  it("잠금 파일은 트리의 부모 폴더에 만들어지고, 트리 안에는 아무것도 만들지 않는다", async () => {
    const parent = await freshDir();
    const tree = join(parent, "scan");
    await mkdir(tree);
    await writeFile(join(tree, "a.ts"), "export const a = 1;\n");
    const port = createNodeRunLockPort();
    const outcome = await acquireRunLock(port, request(tree));
    if (outcome.state !== "ACQUIRED") throw new Error(`전제: ${outcome.state}`);
    expect((await readdir(tree)).sort()).toEqual(["a.ts"]); // 스캔 트리는 E에 해당하는 파일만 담는다
    const names = (await readdir(parent)).sort();
    expect(names).toHaveLength(2);
    expect(names).toContain("scan");
    const lockName = names.find((n) => n !== "scan")!;
    expect(lockName).toMatch(/^semgrep-lsp-tree-[0-9a-f]{32}\.lock$/);
    expect(outcome.handle.lockPath).toBe(join(await canonicalTreePath(parent), lockName));
    expect(
      outcome.keySha256.startsWith(lockName.slice("semgrep-lsp-tree-".length, -".lock".length))
    ).toBe(true);
    await releaseRunLock(port, outcome.handle);
  });

  it("소유자 문서에 실제 pid·hostname·시각·무작위 토큰이 들어 있다", async () => {
    const parent = await freshDir();
    const port = createNodeRunLockPort();
    const outcome = await acquireRunLock(port, request(join(parent, "scan"), "run-owner"));
    if (outcome.state !== "ACQUIRED") throw new Error("전제");
    const doc = JSON.parse(await readFile(outcome.handle.lockPath, "utf8")) as Record<
      string,
      unknown
    >;
    expect(doc).toMatchObject({
      schema: RUN_LOCK_SCHEMA,
      token: outcome.handle.token,
      run_id: "run-owner",
      mode: "target",
      pid: process.pid,
      hostname: hostname(),
      tree_key_sha256: outcome.keySha256,
    });
    expect(String(doc.token)).toMatch(/^[0-9a-f]{32}$/);
    expect(Number.isNaN(Date.parse(String(doc.acquired_at)))).toBe(false);
    await releaseRunLock(port, outcome.handle);
  });

  it("아직 없는 트리도 잠글 수 있고, 트리 폴더를 만들지는 않는다(부모는 만든다)", async () => {
    const parent = await freshDir();
    const tree = join(parent, "deep", "not-yet", "scan");
    const port = createNodeRunLockPort();
    const outcome = await acquireRunLock(port, request(tree));
    expect(outcome.state).toBe("ACQUIRED");
    const names = await readdir(join(parent, "deep", "not-yet"));
    expect(names.some((n) => n === "scan")).toBe(false);
    expect(names.some((n) => n.endsWith(".lock"))).toBe(true);
    if (outcome.state === "ACQUIRED") await releaseRunLock(port, outcome.handle);
  });
});

describe("노드 포트 — 같은 트리 판정(경로 정규화)", () => {
  async function keyOf(port: ReturnType<typeof createNodeRunLockPort>, path: string) {
    return (await port.resolveTree(path)).keySha256;
  }

  it("끝의 구분자·중복 구분자·`.`·`..`로 달리 적어도 같은 키다", async () => {
    const parent = await freshDir();
    const tree = join(parent, "scan");
    await mkdir(tree);
    const port = createNodeRunLockPort();
    const expected = await keyOf(port, tree);
    for (const spelled of [
      `${tree}/`,
      `${tree}${"/"}.`,
      join(parent, "other", "..", "scan"),
      join(parent, ".", "scan"),
      `${parent}//scan`,
    ]) {
      expect(await keyOf(port, spelled), spelled).toBe(expected);
    }
  });

  it("아직 없는 트리도 달리 적은 경로가 같은 키·같은 잠금 파일이다", async () => {
    const parent = await freshDir();
    const port = createNodeRunLockPort();
    const a = await port.resolveTree(join(parent, "later", "scan"));
    const b = await port.resolveTree(join(parent, "x", "..", "later", "scan") + "/");
    expect(b).toEqual(a);
  });

  it("다른 트리는 다른 키·다른 잠금 파일이다", async () => {
    const parent = await freshDir();
    const port = createNodeRunLockPort();
    const a = await port.resolveTree(join(parent, "scan-a"));
    const b = await port.resolveTree(join(parent, "scan-b"));
    expect(a.keySha256).not.toBe(b.keySha256);
    expect(a.lockPath).not.toBe(b.lockPath);
  });

  it("심볼릭 링크(Windows는 junction)로 돌아가는 별칭 경로도 같은 트리다", async (ctx) => {
    const parent = await freshDir();
    const real = join(parent, "real");
    await mkdir(join(real, "scan"), { recursive: true });
    const alias = join(parent, "alias");
    try {
      await symlink(real, alias, "junction"); // POSIX에서는 type 인자가 무시되고 폴더 링크가 된다
    } catch {
      ctx.skip(); // 링크를 만들 수 없는 환경(권한 등): 이 항목은 검증하지 못한 것으로 보고한다
      return;
    }
    const port = createNodeRunLockPort();
    const viaReal = await port.resolveTree(join(real, "scan"));
    const viaAlias = await port.resolveTree(join(alias, "scan"));
    expect(viaAlias).toEqual(viaReal);
    // 별칭을 통해 이미 잡은 잠금은 원래 경로로도 막는다.
    const first = await acquireRunLock(port, request(join(alias, "scan"), "via-alias"));
    const second = await acquireRunLock(port, request(join(real, "scan"), "via-real"));
    expect(first.state).toBe("ACQUIRED");
    expect(second).toMatchObject({ state: "REFUSED", reason: "HELD_BY_OTHER" });
    if (first.state === "ACQUIRED") await releaseRunLock(port, first.handle);
  });

  it("대소문자를 구분하지 않는 플랫폼에서는 표기만 다른 트리가 같은 잠금이다(옵션으로 두 경우를 모두 확인)", async () => {
    const parent = await freshDir();
    const insensitive = createNodeRunLockPort({ caseInsensitive: true });
    const sensitive = createNodeRunLockPort({ caseInsensitive: false });
    const upper = join(parent, "ScanTree");
    const lower = join(parent, "scantree");
    expect(await insensitive.resolveTree(upper)).toEqual(await insensitive.resolveTree(lower));
    const a = await sensitive.resolveTree(upper);
    const b = await sensitive.resolveTree(lower);
    expect(a.keySha256).not.toBe(b.keySha256);
  });

  it("키 계산: 구분자 통일·끝의 구분자 제거·NFC, 대소문자는 플랫폼에 따라 접는다", () => {
    expect(treeKeyOf("/a/b/", false)).toBe("/a/b");
    expect(treeKeyOf("/", false)).toBe("/");
    expect(treeKeyOf("/Café/x", false)).toBe(treeKeyOf("/Café/x", false)); // NFC와 NFD
    expect(treeKeyOf("/A/B", true)).toBe("/a/b");
    expect(treeKeyOf("/A/B", false)).toBe("/A/B");
  });

  it("루트 폴더는 트리로 잠글 수 없다(ERROR TREE_UNRESOLVABLE)", async () => {
    const root = (await canonicalTreePath(base)).split(/[\\/]/)[0] + "/";
    const outcome = await acquireRunLock(createNodeRunLockPort(), request(root));
    expect(outcome).toMatchObject({ state: "ERROR", reason: "TREE_UNRESOLVABLE" });
  });
});

describe("노드 포트 — 원자성과 상호 배제", () => {
  it("createExclusive: 같은 경로에 동시에 50번 시도하면 정확히 한 번만 만들어지고 내용은 그 승자의 것이다", async () => {
    const parent = await freshDir();
    const path = join(parent, "x.lock");
    const port = createNodeRunLockPort();
    const texts = Array.from({ length: 50 }, (_v, i) => `owner-${i}\n`);
    const results = await Promise.all(texts.map((t) => port.createExclusive(path, t)));
    expect(results.filter((r) => r === "CREATED")).toHaveLength(1);
    expect(results.filter((r) => r === "EXISTS")).toHaveLength(49);
    const winner = results.indexOf("CREATED");
    expect(await readFile(path, "utf8")).toBe(texts[winner]);
  });

  it("같은 트리에 20개 실행이 동시에 덤벼도 정확히 하나만 얻고, 나머지는 거절된다(소유자를 읽었거나 읽지 못했거나)", async () => {
    const parent = await freshDir();
    const tree = join(parent, "scan");
    const port = createNodeRunLockPort();
    const outcomes = await Promise.all(
      Array.from({ length: 20 }, (_v, i) => acquireRunLock(port, request(tree, `run-${i}`)))
    );
    const winners = outcomes.filter((o) => o.state === "ACQUIRED");
    expect(winners).toHaveLength(1);
    for (const o of outcomes) {
      if (o.state === "ACQUIRED") continue;
      expect(o.state).toBe("REFUSED");
      expect(["HELD_BY_OTHER", "OWNER_UNREADABLE"]).toContain((o as { reason: string }).reason);
    }
    // 읽을 수 있었던 거절은 승자를 소유자로 알려 준다.
    const winnerHandle = (winners[0] as { handle: { token: string } }).handle;
    const doc = JSON.parse(
      await readFile((winners[0] as { handle: { lockPath: string } }).handle.lockPath, "utf8")
    ) as { token: string; run_id: string };
    expect(doc.token).toBe(winnerHandle.token);
    for (const o of outcomes) {
      if (o.state === "REFUSED" && o.holder !== null) expect(o.holder.run_id).toBe(doc.run_id);
    }
    // 잠금 파일은 하나뿐이다.
    expect((await readdir(parent)).filter((n) => n.endsWith(".lock"))).toHaveLength(1);
    await releaseRunLock(
      port,
      (winners[0] as { handle: Parameters<typeof releaseRunLock>[1] }).handle
    );
  });
});

describe("노드 포트 — 해제와 남의 잠금 보호", () => {
  it("자기 잠금을 해제하면 파일이 사라지고, 같은 트리를 다시 잡을 수 있다", async () => {
    const parent = await freshDir();
    const tree = join(parent, "scan");
    const port = createNodeRunLockPort();
    const first = await acquireRunLock(port, request(tree, "run-1"));
    if (first.state !== "ACQUIRED") throw new Error("전제");
    expect(await releaseRunLock(port, first.handle)).toEqual({ state: "RELEASED" });
    expect((await readdir(parent)).filter((n) => n.endsWith(".lock"))).toHaveLength(0);
    const second = await acquireRunLock(port, request(tree, "run-2"));
    expect(second.state).toBe("ACQUIRED");
    if (second.state === "ACQUIRED") await releaseRunLock(port, second.handle);
  });

  it("다른 실행의 잠금으로 바뀐 파일은 해제하지 않는다", async () => {
    const parent = await freshDir();
    const tree = join(parent, "scan");
    const port = createNodeRunLockPort();
    const mine = await acquireRunLock(port, request(tree, "mine"));
    if (mine.state !== "ACQUIRED") throw new Error("전제");
    // 내 잠금이 사라지고(운영자가 지움) 다른 실행이 새로 잡았다.
    await rm(mine.handle.lockPath);
    const theirs = await acquireRunLock(port, request(tree, "theirs"));
    if (theirs.state !== "ACQUIRED") throw new Error("전제");
    const before = await readFile(theirs.handle.lockPath, "utf8");
    expect(await releaseRunLock(port, mine.handle)).toEqual({
      state: "NOT_RELEASED",
      reason: "OTHER_OWNER",
    });
    expect(await readFile(theirs.handle.lockPath, "utf8")).toBe(before);
    await releaseRunLock(port, theirs.handle);
  });

  it("내용을 읽을 수 없게 된 파일(디렉터리가 있는 경우 포함)은 지우지 않는다", async () => {
    const parent = await freshDir();
    const tree = join(parent, "scan");
    const port = createNodeRunLockPort();
    const mine = await acquireRunLock(port, request(tree));
    if (mine.state !== "ACQUIRED") throw new Error("전제");
    await writeFile(mine.handle.lockPath, "{ 깨진 내용");
    expect(await releaseRunLock(port, mine.handle)).toEqual({
      state: "NOT_RELEASED",
      reason: "UNREADABLE",
    });
    expect(await readFile(mine.handle.lockPath, "utf8")).toBe("{ 깨진 내용");
  });
});

describe("노드 포트 — 오래된 잠금은 자동으로 지우지 않는다", () => {
  it("해제하지 못하고 끝난 실행의 잠금(오래된 잠금)은 새 실행을 계속 거절하고, 운영자가 직접 지워야 풀린다", async () => {
    const parent = await freshDir();
    const tree = join(parent, "scan");
    const crashed = createNodeRunLockPort();
    const first = await acquireRunLock(crashed, request(tree, "crashed-run"));
    if (first.state !== "ACQUIRED") throw new Error("전제");
    // 첫 실행이 해제 없이 사라졌다고 본다(핸들을 버린다). 새 프로세스를 흉내 내려고 새 포트를 쓴다.
    const fresh = createNodeRunLockPort();
    const before = await readFile(first.handle.lockPath, "utf8");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const again = await acquireRunLock(fresh, request(tree, `retry-${attempt}`));
      expect(again).toMatchObject({
        state: "REFUSED",
        reason: "HELD_BY_OTHER",
        holder: { run_id: "crashed-run", pid: process.pid },
      });
      expect(await readFile(first.handle.lockPath, "utf8")).toBe(before); // 한 번도 지우지 않았다
    }
    // README의 복구 절차: 소유자가 끝났음을 확인한 뒤 잠금 파일을 직접 지운다.
    await rm(first.handle.lockPath);
    const recovered = await acquireRunLock(fresh, request(tree, "after-recovery"));
    expect(recovered.state).toBe("ACQUIRED");
    if (recovered.state === "ACQUIRED") await releaseRunLock(fresh, recovered.handle);
  });

  it("잠금 파일 자리에 폴더가 있어도(읽을 수 없는 소유자) 거절하고 지우지 않는다", async () => {
    const parent = await freshDir();
    const tree = join(parent, "scan");
    const port = createNodeRunLockPort();
    const { lockPath } = await port.resolveTree(tree);
    await mkdir(lockPath);
    const outcome = await acquireRunLock(port, request(tree));
    expect(outcome).toMatchObject({ state: "REFUSED", reason: "OWNER_UNREADABLE", holder: null });
    expect((await readdir(parent)).includes(lockPath.split(/[\\/]/).pop()!)).toBe(true);
  });

  it("만들다 만 빈 잠금 파일도 거절하고 지우지 않는다", async () => {
    const parent = await freshDir();
    const tree = join(parent, "scan");
    const port = createNodeRunLockPort();
    const { lockPath } = await port.resolveTree(tree);
    await writeFile(lockPath, "");
    expect(await acquireRunLock(port, request(tree))).toMatchObject({
      state: "REFUSED",
      reason: "OWNER_UNREADABLE",
    });
    expect(await readFile(lockPath, "utf8")).toBe("");
  });
});

describe("노드 포트 — 실패는 던지지 않고 얻은 것으로 보정하지 않는다", () => {
  it("부모 자리에 일반 파일이 있어 잠금 파일을 만들 수 없으면 ERROR(ACQUIRE_FAILED)이고 아무것도 남기지 않는다", async () => {
    const parent = await freshDir();
    const blocker = join(parent, "blocker");
    await writeFile(blocker, "not a directory");
    const outcome = await acquireRunLock(createNodeRunLockPort(), request(join(blocker, "scan")));
    expect(outcome).toMatchObject({ state: "ERROR", reason: "ACQUIRE_FAILED" });
    expect((await readdir(parent)).sort()).toEqual(["blocker"]);
  });

  it("read·remove: 없는 파일은 각각 null·false다", async () => {
    const parent = await freshDir();
    const port = createNodeRunLockPort();
    expect(await port.read(join(parent, "none.lock"))).toBeNull();
    expect(await port.remove(join(parent, "none.lock"))).toBe(false);
  });

  it("토큰은 무작위 32자 16진수이고 겹치지 않는다", () => {
    const port = createNodeRunLockPort();
    const tokens = new Set(Array.from({ length: 1000 }, () => port.newToken()));
    expect(tokens.size).toBe(1000);
    for (const token of tokens) expect(token).toMatch(/^[0-9a-f]{32}$/);
  });
});

// ── 심볼릭 링크 뒤의 `..` ────────────────────────────────────────────────────
//
// 결함: canonicalTreePath가 realpath보다 먼저 resolve()로 경로를 정리하면 `route/link/../tree`가 링크를 풀기도 전에
// `route/tree`로 바뀐다. POSIX(Linux·macOS)에서 운영체제는 링크를 따라간 뒤의 `..`를 링크 대상의 부모로 읽으므로 실제 접근은
// `physical/tree`에 닿는다 — 잠금은 route/tree 기준의 다른 키·다른 잠금 파일이고, 쓰기는 physical/tree에 닿아 두 실행이 모두
// 잠금을 얻는다. 원칙: 잠금 대상의 정규화는 실제 파일 접근과 같은 경로 의미를 보존한다(운영체제에 해석을 맡긴다).
//
// 검증 범위(README '공유 실행 잠금'과 같은 문장): 이 컴퓨터는 Windows라 운영체제가 `..`를 먼저 지워서 위 결함을 실제 디스크로
// 재현할 수 없다. 그래서 (1) POSIX 의미를 메모리 표로 모의한 시험(아래 첫 블록)이 결함 구조를 재현하고, (2) 실제 디스크 시험(둘째
// 블록)은 "잠금이 예측한 자리 == 쓰기가 실제로 닿는 자리"를 운영체제가 무엇이든 측정한다. **Linux·macOS의 실제 디스크는 확인하지
// 못했다** — 그 운영체제에서 이 파일을 돌려야 한다.

const FAKE = "/fake/base";
const slashes = (p: string): string => p.replace(/\\/g, "/");

/** 모의 POSIX 표 위의 노드 포트 + 파일 연산은 메모리(실제 디스크에 /fake를 만들지 않는다). */
function posixLockPort(table: Parameters<typeof createPosixPathOps>[0]) {
  const memory = new MemoryRunLock();
  const node = createNodeRunLockPort({
    pathOps: createPosixPathOps(table),
    caseInsensitive: false,
  });
  const port: RunLockPort = {
    resolveTree: (p) => node.resolveTree(p),
    newToken: () => memory.newToken(),
    identity: () => memory.identity(),
    createExclusive: (p, t) => memory.createExclusive(p, t),
    read: (p) => memory.read(p),
    remove: (p) => memory.remove(p),
  };
  return { port, memory };
}

describe("노드 포트 — 심볼릭 링크 뒤의 `..` (POSIX 의미 모의, 실제 Linux 디스크의 증거가 아님)", () => {
  // 외부 검토가 보고한 구조: physical/branch, physical/tree, route/link → physical/branch.
  const table = {
    dirs: [
      `${FAKE}/physical/branch/sub/deep`,
      `${FAKE}/physical/tree`,
      `${FAKE}/route`,
      `${FAKE}/route2`,
      `${FAKE}/a`,
      `${FAKE}/elsewhere`,
    ],
    files: [`${FAKE}/physical/file.txt`],
    links: {
      [`${FAKE}/route/link`]: `${FAKE}/physical/branch`,
      [`${FAKE}/route/l1`]: `${FAKE}/physical/branch/sub`,
      [`${FAKE}/route2/l2`]: `${FAKE}/route/l1`, // 링크의 링크
      [`${FAKE}/route/dangling`]: `${FAKE}/physical/gone`, // 대상이 없는 링크
      [`${FAKE}/a/dl`]: `${FAKE}/elsewhere`,
    },
  };
  const ops = createPosixPathOps(table);

  it("보고된 구조: 운영체제가 같은 physical/tree로 푸는 두 입력은 같은 키·같은 잠금 파일이고, 두 번째 획득은 거절된다", async () => {
    const direct = `${FAKE}/physical/tree`;
    const viaLink = `${FAKE}/route/link/../tree`;
    // 전제: 모의 운영체제가 두 입력을 같은 자리로 푼다.
    expect(await ops.realpath(viaLink)).toBe(await ops.realpath(direct));

    const { port, memory } = posixLockPort(table);
    const a = await port.resolveTree(direct);
    const b = await port.resolveTree(viaLink);
    expect(b).toEqual(a);
    expect(slashes(a.lockPath)).toBe(
      `${FAKE}/physical/semgrep-lsp-tree-${a.keySha256.slice(0, 32)}.lock`
    );

    const first = await acquireRunLock(port, { treePath: direct, runId: "direct", mode: "target" });
    const second = await acquireRunLock(port, { treePath: viaLink, runId: "link", mode: "target" });
    expect(first.state).toBe("ACQUIRED");
    expect(second).toMatchObject({
      state: "REFUSED",
      reason: "HELD_BY_OTHER",
      holder: { run_id: "direct" },
    });
    expect(memory.files.size).toBe(1); // 잠금 파일은 하나뿐이다
  });

  it("아직 없는 대상도 같은 원칙이다: 링크 뒤의 `..`를 운영체제가 푼 자리에서 키가 정해진다", async () => {
    const { port } = posixLockPort(table);
    const direct = await port.resolveTree(`${FAKE}/physical/newtree`);
    const viaLink = await port.resolveTree(`${FAKE}/route/link/../newtree`);
    expect(viaLink).toEqual(direct);
    // 잠금 파일은 route가 아니라 physical에 만들어진다.
    expect(slashes(viaLink.lockPath).startsWith(`${FAKE}/physical/semgrep-lsp-tree-`)).toBe(true);
  });

  it("여러 단계 링크와 `..` 조합: 링크의 링크, 여러 번의 `..`, 없는 칸을 지나는 `..`", async () => {
    const { port } = posixLockPort(table);
    const key = async (p: string) => (await port.resolveTree(p)).keySha256;
    // route2/l2 → route/l1 → physical/branch/sub 이므로 l2/../.. 는 physical이다.
    expect(await key(`${FAKE}/route2/l2/../../tree3`)).toBe(await key(`${FAKE}/physical/tree3`));
    // 존재하는 deep을 지나 올라간 뒤(→ physical/branch), 없는 x를 들어갔다 나와 tree4.
    expect(await key(`${FAKE}/route/l1/deep/../../x/../tree4`)).toBe(
      await key(`${FAKE}/physical/branch/tree4`)
    );
    // 이미 있는 대상도 같다.
    expect(await ops.realpath(`${FAKE}/route2/l2/../../tree`)).toBe(`${FAKE}/physical/tree`);
    expect(await key(`${FAKE}/route2/l2/../../tree`)).toBe(await key(`${FAKE}/physical/tree`));
    // 링크가 없는 평범한 경로에서 없는 칸 뒤의 `..`는 예전처럼 접힌다.
    expect(await key(`${FAKE}/physical/missing/../tree`)).toBe(await key(`${FAKE}/physical/tree`));
  });

  it("없는 칸을 접은 뒤에 존재하는 링크가 나타나도 링크를 푼 자리에서 키가 정해진다(독립 검토 F1)", async () => {
    // a/n1이 없고 a/dl이 elsewhere를 가리키는 링크다. mkdir -p는 n1을 만든 뒤 `..`로 a로 돌아와 dl(링크)을 따라가므로 쓰기는
    // elsewhere/tree에 닿는다. 사전식으로 접은 a/dl/tree로 키를 만들면 다른 트리를 잠그게 된다.
    const { port, memory } = posixLockPort(table);
    const key = async (p: string) => (await port.resolveTree(p)).keySha256;
    expect(await key(`${FAKE}/a/n1/../dl/tree`)).toBe(await key(`${FAKE}/elsewhere/tree`));
    expect(await key(`${FAKE}/route/nonexist/../link/tree`)).toBe(
      await key(`${FAKE}/physical/branch/tree`)
    );
    const first = await acquireRunLock(port, {
      treePath: `${FAKE}/elsewhere/tree`,
      runId: "direct",
      mode: "target",
    });
    const second = await acquireRunLock(port, {
      treePath: `${FAKE}/a/n1/../dl/tree`,
      runId: "folded",
      mode: "target",
    });
    expect(first.state).toBe("ACQUIRED");
    expect(second).toMatchObject({ state: "REFUSED", reason: "HELD_BY_OTHER" });
    expect(memory.files.size).toBe(1);
  });

  it("서로 다른 트리는 계속 독립적으로 잠긴다", async () => {
    const { port } = posixLockPort(table);
    const trees = [
      `${FAKE}/route/link/../tree-a`, // physical/tree-a
      `${FAKE}/route/link/../tree-b`, // physical/tree-b
      `${FAKE}/route/link/tree-a`, // physical/branch/tree-a (링크 안쪽)
      `${FAKE}/route/tree-a`, // route/tree-a (링크 옆)
    ];
    const keys = new Set(
      (await Promise.all(trees.map((t) => port.resolveTree(t)))).map((r) => r.keySha256)
    );
    expect(keys.size).toBe(trees.length);
    for (const [i, treePath] of trees.entries()) {
      const outcome = await acquireRunLock(port, { treePath, runId: `r${i}`, mode: "target" });
      expect(outcome.state, treePath).toBe("ACQUIRED");
    }
  });

  it("안전하게 해석할 수 없는 경로는 거절하고 아무 잠금도 만들지 않는다: 끊어진 링크, 파일 아래의 `..`", async () => {
    for (const treePath of [
      `${FAKE}/route/dangling`, // 대상이 없는 링크 — 잠그면 링크 자리를 잠그고 쓰기는 다른 곳에 닿는다
      `${FAKE}/route/dangling/sub`,
      `${FAKE}/physical/file.txt/../x`, // 파일 뒤의 `..`는 풀 수 없다
      `${FAKE}/physical/missing/../../tree`, // 없는 칸을 접고도 남는 `..`가 존재하는 접두 위로 빠져나간다
    ]) {
      const { port, memory } = posixLockPort(table);
      const outcome = await acquireRunLock(port, { treePath, runId: "r", mode: "target" });
      expect(outcome, treePath).toMatchObject({ state: "ERROR", reason: "TREE_UNRESOLVABLE" });
      expect(memory.files.size, treePath).toBe(0);
      expect(
        memory.calls.filter((c) => c.startsWith("create:")),
        treePath
      ).toEqual([]);
    }
  });
});

describe("노드 포트 — 실제 디스크: 잠금이 예측한 자리와 쓰기가 실제로 닿는 자리", () => {
  // 운영체제가 무엇이든 성립해야 하는 불변식: 경로를 원문 그대로 건넸을 때, 만들기 전에 예측한 정규 경로가 만든 뒤 운영체제가
  // 알려 주는 실제 경로(realpath)와 같다. Windows는 `..`를 먼저 지우고 POSIX는 링크를 푼 뒤 `..`를 적용하는데, 둘 다 이 불변식을
  // 지켜야 한다.

  async function makeLink(ctx: { skip: () => never }, target: string, path: string): Promise<void> {
    await mkdir(join(path, ".."), { recursive: true });
    try {
      await symlink(target, path, "junction"); // POSIX에서는 type 인자가 무시되고 폴더 링크가 된다
    } catch {
      ctx.skip(); // 링크를 만들 수 없는 환경(권한 등): 이 항목은 검증하지 못한 것으로 보고한다
    }
  }

  async function expectLandsWhereLocked(raw: string): Promise<string> {
    const predicted = await canonicalTreePath(raw);
    await mkdir(raw, { recursive: true }); // 실제 접근(쓰기)이 닿는 자리를 만든다
    const landed = await realpath(raw);
    expect(predicted, raw).toBe(landed);
    return landed;
  }

  it("보고된 구조(physical/branch·physical/tree·route/link): 두 입력의 키가 같은 것은 운영체제가 같은 자리로 풀 때뿐이다", async (ctx) => {
    const parent = await freshDir();
    await mkdir(join(parent, "physical", "branch"), { recursive: true });
    await mkdir(join(parent, "physical", "tree"), { recursive: true });
    await makeLink(ctx, join(parent, "physical", "branch"), join(parent, "route", "link"));
    const direct = join(parent, "physical", "tree");
    const viaLink = `${parent}/route/link/../tree`; // join()은 `..`를 미리 지우므로 원문 그대로 이어 붙인다

    const osDirect = await realpath(direct);
    const osViaLink = await realpath(viaLink).catch(() => null);
    const sameByOs = osViaLink === osDirect;
    // POSIX는 링크를 푼 뒤 `..`를 적용해 physical/tree에 닿고, Windows는 `..`를 먼저 지워 존재하지 않는 route/tree가 된다.
    expect(sameByOs).toBe(process.platform !== "win32");

    const port = createNodeRunLockPort();
    const a = await port.resolveTree(direct);
    const b = await port.resolveTree(viaLink);
    expect(a.keySha256 === b.keySha256).toBe(sameByOs);
    expect(a.lockPath === b.lockPath).toBe(sameByOs);

    const first = await acquireRunLock(port, { treePath: direct, runId: "direct", mode: "target" });
    const second = await acquireRunLock(port, { treePath: viaLink, runId: "link", mode: "target" });
    expect(first.state).toBe("ACQUIRED");
    if (sameByOs) expect(second).toMatchObject({ state: "REFUSED", reason: "HELD_BY_OTHER" });
    else expect(second.state).toBe("ACQUIRED"); // 서로 다른 트리는 독립적으로 잠긴다
    for (const o of [first, second])
      if (o.state === "ACQUIRED") await releaseRunLock(port, o.handle);

    // 어느 쪽이든 viaLink 잠금이 믿는 자리에 실제로 쓴다.
    expect(await expectLandsWhereLocked(viaLink)).toBe(osViaLink ?? (await realpath(viaLink)));
  });

  it("아직 없는 대상: 링크 뒤의 `..`를 지난 경로도 예측한 자리에 실제로 만들어진다", async (ctx) => {
    const parent = await freshDir();
    await mkdir(join(parent, "physical", "branch"), { recursive: true });
    await makeLink(ctx, join(parent, "physical", "branch"), join(parent, "route", "link"));
    await expectLandsWhereLocked(`${parent}/route/link/../newtree`);
  });

  it("여러 단계 링크·`..` 조합: 링크의 링크, 여러 번의 `..`, 없는 칸을 지나는 `..`", async (ctx) => {
    const parent = await freshDir();
    await mkdir(join(parent, "physical", "branch", "sub", "deep"), { recursive: true });
    await makeLink(ctx, join(parent, "physical", "branch", "sub"), join(parent, "route", "l1"));
    await makeLink(ctx, join(parent, "route", "l1"), join(parent, "route2", "l2"));
    for (const raw of [
      `${parent}/route2/l2/../../tree3`,
      `${parent}/route/l1/deep/../../x/../tree4`,
      `${parent}/route2/l2/./deep/../../tree5/`,
      `${parent}/physical/missing/../tree6`,
      `${parent}/route/nonexist/../l1/tree7`, // 없는 칸을 접은 뒤에 존재하는 링크가 나온다(독립 검토 F1)
    ]) {
      await expectLandsWhereLocked(raw);
    }
  });

  it("끊어진 링크(대상이 사라진 심볼릭 링크·junction)는 잠그지 않고 거절한다 — 아무 잠금 파일도 만들지 않는다", async (ctx) => {
    const parent = await freshDir();
    const gone = join(parent, "gone");
    await mkdir(gone, { recursive: true });
    await makeLink(ctx, gone, join(parent, "route", "dangling"));
    await rm(gone, { recursive: true });
    for (const treePath of [join(parent, "route", "dangling"), `${parent}/route/dangling/sub`]) {
      const outcome = await acquireRunLock(createNodeRunLockPort(), {
        treePath,
        runId: "r",
        mode: "target",
      });
      expect(outcome, treePath).toMatchObject({ state: "ERROR", reason: "TREE_UNRESOLVABLE" });
    }
    expect((await readdir(join(parent, "route"))).sort()).toEqual(["dangling"]);
    expect(await readdir(parent)).toEqual(["route"]);
  });

  it("상대 경로는 작업 폴더 기준으로 같은 자리를 가리킨다(기존 처리 유지)", async () => {
    const parent = await freshDir();
    const tree = join(parent, "scan");
    await mkdir(tree);
    const rel = relative(process.cwd(), tree);
    if (rel === tree) return; // 다른 드라이브라 상대 경로가 없다: 이 항목은 해당 환경에서 확인하지 못한 것이다
    const port = createNodeRunLockPort();
    expect(await port.resolveTree(rel)).toEqual(await port.resolveTree(tree));
    expect(await port.resolveTree(`${rel}/`)).toEqual(await port.resolveTree(tree));
  });

  it("서로 다른 트리는 링크가 끼어 있어도 독립적으로 잠긴다", async (ctx) => {
    const parent = await freshDir();
    await mkdir(join(parent, "physical", "branch"), { recursive: true });
    await makeLink(ctx, join(parent, "physical", "branch"), join(parent, "route", "link"));
    const port = createNodeRunLockPort();
    const trees = [
      `${parent}/route/link/tree-a`,
      `${parent}/route/link/tree-b`,
      `${parent}/route/link/../tree-a`,
      `${parent}/physical/tree-a`,
    ];
    const keys = await Promise.all(trees.map(async (t) => (await port.resolveTree(t)).keySha256));
    // 링크 안쪽의 tree-a·tree-b는 항상 다르다. `..`를 지난 두 개는 운영체제에 따라 서로 같거나 달라도 되지만, 안쪽 것과는 다르다.
    expect(new Set(keys.slice(0, 2)).size).toBe(2);
    expect(keys[2]).not.toBe(keys[0]);
    expect(keys[3]).not.toBe(keys[0]);
  });
});
