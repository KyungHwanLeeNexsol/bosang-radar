import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RUN_LOCK_SCHEMA, acquireRunLock, releaseRunLock } from "./run-lock";
import { canonicalTreePath, createNodeRunLockPort, treeKeyOf } from "./run-lock-node";

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
