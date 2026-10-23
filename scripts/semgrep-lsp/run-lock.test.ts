import { describe, expect, it } from "vitest";
import {
  RECOVERY_HINT,
  RUN_LOCK_SCHEMA,
  acquireRunLock,
  lockSummaryOf,
  releaseRunLock,
} from "./run-lock";
import { MemoryRunLock } from "./testing/memory-run-lock";

// 공유 실행 잠금의 코어 로직(메모리 포트). 실제 디스크의 원자성·경로 정규화·프로세스 경쟁은 run-lock-node*.test.ts가 확인한다.

const TREE = "/work/trees/scan-a";
const req = (over: Partial<{ treePath: string; runId: string; mode: string }> = {}) => ({
  treePath: TREE,
  runId: "run-1",
  mode: "target",
  ...over,
});

async function acquired(port: MemoryRunLock, over: Parameters<typeof req>[0] = {}) {
  const outcome = await acquireRunLock(port, req(over));
  if (outcome.state !== "ACQUIRED") throw new Error(`획득 전제가 깨졌다: ${outcome.state}`);
  return outcome;
}

describe("acquireRunLock — 획득", () => {
  it("없는 잠금을 얻고, 소유자 정보를 잠금 파일에 남긴다", async () => {
    const port = new MemoryRunLock({
      pid: 777,
      hostname: "host-a",
      nowIso: "2026-10-23T01:02:03.000Z",
    });
    const outcome = await acquired(port);
    expect(port.files.size).toBe(1);
    const text = port.files.get(outcome.handle.lockPath)!;
    const doc = JSON.parse(text) as Record<string, unknown>;
    expect(doc).toMatchObject({
      schema: RUN_LOCK_SCHEMA,
      token: outcome.handle.token,
      run_id: "run-1",
      mode: "target",
      pid: 777,
      hostname: "host-a",
      acquired_at: "2026-10-23T01:02:03.000Z",
      tree_key_sha256: outcome.keySha256,
    });
    expect(String(doc.token).length).toBeGreaterThanOrEqual(16);
    expect(outcome.handle.released).toBe(false);
  });

  it("같은 트리를 이미 잡은 실행이 있으면 runId·mode가 달라도 거절한다 — 소유자를 알려 주고 잠금은 그대로다", async () => {
    const port = new MemoryRunLock({ pid: 11, hostname: "first-host" });
    const first = await acquired(port, { runId: "run-first", mode: "control" });
    const before = port.files.get(first.handle.lockPath);
    const otherProcess = new MemoryRunLock({ files: port.files, pid: 22, hostname: "second-host" });
    const second = await acquireRunLock(otherProcess, req({ runId: "run-second" }));
    expect(second).toMatchObject({
      state: "REFUSED",
      reason: "HELD_BY_OTHER",
      keySha256: first.keySha256,
      lockPath: first.handle.lockPath,
      holder: { run_id: "run-first", mode: "control", pid: 11, hostname: "first-host" },
    });
    expect(port.files.get(first.handle.lockPath)).toBe(before); // 남의 잠금은 건드리지 않는다
    expect(port.files.size).toBe(1);
  });

  it("같은 실행이 같은 트리를 두 번 잡으려 해도 거절한다(재진입 없음)", async () => {
    const port = new MemoryRunLock();
    await acquired(port);
    const again = await acquireRunLock(port, req());
    expect(again).toMatchObject({ state: "REFUSED", reason: "HELD_BY_OTHER" });
  });

  it("다른 트리는 서로 막지 않는다", async () => {
    const port = new MemoryRunLock();
    const a = await acquired(port, { treePath: "/work/trees/scan-a" });
    const b = await acquired(port, { treePath: "/work/trees/scan-b", runId: "run-2" });
    expect(a.keySha256).not.toBe(b.keySha256);
    expect(port.files.size).toBe(2);
  });

  it("트리를 달리 적어도(끝의 구분자·중복 구분자·`..`) 같은 트리면 같은 잠금이다", async () => {
    const port = new MemoryRunLock();
    await acquired(port, { treePath: "/work/trees/scan-a" });
    for (const spelled of [
      "/work/trees/scan-a/",
      "/work//trees/./scan-a",
      "/work/trees/x/../scan-a",
    ]) {
      const outcome = await acquireRunLock(port, req({ treePath: spelled, runId: "other" }));
      expect(outcome, spelled).toMatchObject({ state: "REFUSED", reason: "HELD_BY_OTHER" });
    }
  });

  it("획득은 배타 생성 한 번이다 — 기다리지도 다시 시도하지도 지우지도 않는다", async () => {
    const port = new MemoryRunLock();
    await acquired(port);
    port.calls.length = 0;
    await acquireRunLock(port, req({ runId: "other" }));
    expect(port.calls.filter((c) => c.startsWith("create:"))).toHaveLength(1);
    expect(port.calls.some((c) => c.startsWith("remove:"))).toBe(false);
  });
});

describe("acquireRunLock — 오래된 잠금과 읽을 수 없는 소유자는 자동으로 지우지 않는다", () => {
  const lockPathOf = async (port: MemoryRunLock) => (await port.resolveTree(TREE)).lockPath;

  it("아주 오래전에 만든 것처럼 보이는 잠금도 소유자 상태를 확인하지 않고 거절하며 그대로 둔다", async () => {
    const port = new MemoryRunLock();
    const path = await lockPathOf(port);
    const old = `${JSON.stringify({
      schema: RUN_LOCK_SCHEMA,
      token: "t".repeat(32),
      run_id: "crashed-run",
      mode: "target",
      pid: 1,
      hostname: "gone-host",
      acquired_at: "2020-01-01T00:00:00.000Z",
      tree_key_sha256: "0".repeat(64),
    })}\n`;
    port.files.set(path, old);
    const outcome = await acquireRunLock(port, req());
    expect(outcome).toMatchObject({
      state: "REFUSED",
      reason: "HELD_BY_OTHER",
      holder: { run_id: "crashed-run", acquired_at: "2020-01-01T00:00:00.000Z", pid: 1 },
    });
    expect(port.files.get(path)).toBe(old);
    expect(port.calls.some((c) => c.startsWith("remove:"))).toBe(false);
    expect(RECOVERY_HINT).toMatch(/직접 지운다/);
  });

  it.each([
    ["빈 파일(만들다 만 잠금)", ""],
    ["깨진 JSON", "{not json"],
    ["다른 스키마", JSON.stringify({ schema: "other/1", token: "t".repeat(32) })],
    [
      "토큰이 짧음",
      JSON.stringify({
        schema: RUN_LOCK_SCHEMA,
        token: "short",
        run_id: "r",
        mode: "m",
        pid: 1,
        hostname: "h",
        acquired_at: "t",
      }),
    ],
    ["필드 누락", JSON.stringify({ schema: RUN_LOCK_SCHEMA, token: "t".repeat(32) })],
    [
      "pid가 정수가 아님",
      JSON.stringify({
        schema: RUN_LOCK_SCHEMA,
        token: "t".repeat(32),
        run_id: "r",
        mode: "m",
        pid: 1.5,
        hostname: "h",
        acquired_at: "t",
      }),
    ],
    ["배열", "[]"],
  ])("소유자를 읽을 수 없는 잠금(%s)도 거절하고 지우지 않는다", async (_name, content) => {
    const port = new MemoryRunLock();
    const path = await lockPathOf(port);
    port.files.set(path, content);
    const outcome = await acquireRunLock(port, req());
    expect(outcome).toMatchObject({ state: "REFUSED", reason: "OWNER_UNREADABLE", holder: null });
    expect(port.files.get(path)).toBe(content);
    expect(port.calls.some((c) => c.startsWith("remove:"))).toBe(false);
  });

  it("소유자 파일을 읽다 실패해도 거절이고 지우지 않는다", async () => {
    const port = new MemoryRunLock();
    const path = await lockPathOf(port);
    port.files.set(path, "x");
    port.fail.read = Object.assign(new Error("EIO"), { code: "EIO" });
    const outcome = await acquireRunLock(port, req());
    expect(outcome).toMatchObject({ state: "REFUSED", reason: "OWNER_UNREADABLE" });
    expect(port.files.has(path)).toBe(true);
  });

  it("소유자 문서의 긴 문자열은 잘라서 알려 준다", async () => {
    const port = new MemoryRunLock();
    const path = await lockPathOf(port);
    port.files.set(
      path,
      JSON.stringify({
        schema: RUN_LOCK_SCHEMA,
        token: "t".repeat(32),
        run_id: "r".repeat(500),
        mode: "m".repeat(50),
        pid: 5,
        hostname: "h".repeat(600),
        acquired_at: "a".repeat(100),
      })
    );
    const outcome = await acquireRunLock(port, req());
    if (outcome.state !== "REFUSED" || outcome.holder === null) throw new Error("전제");
    expect(outcome.holder.run_id).toHaveLength(128);
    expect(outcome.holder.mode).toHaveLength(16);
    expect(outcome.holder.hostname).toHaveLength(255);
    expect(outcome.holder.acquired_at).toHaveLength(40);
  });
});

describe("acquireRunLock — 실패는 던지지 않고, 얻은 것으로 보정하지 않는다", () => {
  it("트리를 해석하지 못하면 ERROR(TREE_UNRESOLVABLE)이고 아무것도 만들지 않는다", async () => {
    const port = new MemoryRunLock();
    port.fail.resolve = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    const outcome = await acquireRunLock(port, req());
    expect(outcome).toEqual({
      state: "ERROR",
      reason: "TREE_UNRESOLVABLE",
      keySha256: null,
      lockPath: null,
      code: "ENOENT",
    });
    expect(port.files.size).toBe(0);
  });

  it("잠금 파일을 만들다 실패하면 ERROR(ACQUIRE_FAILED)이고 시스템 오류 코드만 알린다", async () => {
    const port = new MemoryRunLock();
    port.fail.create = Object.assign(new Error("EACCES: /secret/path 거부"), { code: "EACCES" });
    const outcome = await acquireRunLock(port, req());
    expect(outcome).toMatchObject({ state: "ERROR", reason: "ACQUIRE_FAILED", code: "EACCES" });
    expect(JSON.stringify(outcome)).not.toContain("secret");
    expect(port.files.size).toBe(0);
  });

  it("오류에 코드가 없으면 code는 null이다", async () => {
    const port = new MemoryRunLock();
    port.fail.create = new Error("boom");
    expect(await acquireRunLock(port, req())).toMatchObject({ state: "ERROR", code: null });
  });
});

describe("releaseRunLock — 자기 잠금만 해제한다", () => {
  it("자기 토큰이 든 잠금을 지운다", async () => {
    const port = new MemoryRunLock();
    const { handle } = await acquired(port);
    expect(await releaseRunLock(port, handle)).toEqual({ state: "RELEASED" });
    expect(port.files.size).toBe(0);
    expect(handle.released).toBe(true);
  });

  it("두 번 해제하지 않는다(이미 해제함)", async () => {
    const port = new MemoryRunLock();
    const { handle } = await acquired(port);
    await releaseRunLock(port, handle);
    // 그 사이 다른 실행이 같은 트리를 잡았다.
    const other = await acquired(port, { runId: "run-2" });
    expect(await releaseRunLock(port, handle)).toEqual({
      state: "NOT_RELEASED",
      reason: "ALREADY_RELEASED",
    });
    expect(port.files.has(other.handle.lockPath)).toBe(true);
  });

  it("파일이 다른 실행의 것으로 바뀌었으면 지우지 않는다(남의 잠금 보호)", async () => {
    const port = new MemoryRunLock();
    const mine = await acquired(port);
    // 운영자가 내 잠금을 지우고 다른 실행이 새로 잡은 상황.
    port.files.delete(mine.handle.lockPath);
    const theirs = await acquired(port, { runId: "theirs" });
    const before = port.files.get(theirs.handle.lockPath);
    expect(await releaseRunLock(port, mine.handle)).toEqual({
      state: "NOT_RELEASED",
      reason: "OTHER_OWNER",
    });
    expect(port.files.get(theirs.handle.lockPath)).toBe(before);
    expect(port.calls.filter((c) => c.startsWith("remove:"))).toHaveLength(0);
    expect(mine.handle.released).toBe(false);
  });

  it("파일이 이미 없으면 MISSING이고 던지지 않는다", async () => {
    const port = new MemoryRunLock();
    const { handle } = await acquired(port);
    port.files.clear();
    expect(await releaseRunLock(port, handle)).toEqual({
      state: "NOT_RELEASED",
      reason: "MISSING",
    });
  });

  it.each([
    ["빈 내용", ""],
    ["깨진 내용", "{"],
    ["다른 스키마", JSON.stringify({ schema: "x" })],
  ])("내용을 읽을 수 없으면(%s) 지우지 않는다", async (_name, content) => {
    const port = new MemoryRunLock();
    const { handle } = await acquired(port);
    port.files.set(handle.lockPath, content);
    expect(await releaseRunLock(port, handle)).toEqual({
      state: "NOT_RELEASED",
      reason: "UNREADABLE",
    });
    expect(port.files.get(handle.lockPath)).toBe(content);
  });

  it("읽다가 실패해도 지우지 않고 던지지 않는다", async () => {
    const port = new MemoryRunLock();
    const { handle } = await acquired(port);
    port.fail.read = new Error("EIO");
    expect(await releaseRunLock(port, handle)).toEqual({
      state: "NOT_RELEASED",
      reason: "UNREADABLE",
    });
    expect(port.files.has(handle.lockPath)).toBe(true);
  });

  it("지우다 실패하면 FAILED이고, 해제한 것으로 표시하지 않는다(다시 시도할 수 있다)", async () => {
    const port = new MemoryRunLock();
    const { handle } = await acquired(port);
    port.fail.remove = new Error("EPERM");
    expect(await releaseRunLock(port, handle)).toEqual({ state: "NOT_RELEASED", reason: "FAILED" });
    expect(handle.released).toBe(false);
    port.fail.remove = null;
    expect(await releaseRunLock(port, handle)).toEqual({ state: "RELEASED" });
  });

  it("해제한 뒤에는 같은 트리를 다시 잡을 수 있다(새 토큰)", async () => {
    const port = new MemoryRunLock();
    const first = await acquired(port);
    await releaseRunLock(port, first.handle);
    const second = await acquired(port, { runId: "run-2" });
    expect(second.handle.token).not.toBe(first.handle.token);
  });
});

describe("lockSummaryOf — 증거 요약은 경로·소유자 정보를 싣지 않는다", () => {
  it("획득", async () => {
    const port = new MemoryRunLock({ hostname: "secret-host", pid: 31337 });
    const outcome = await acquired(port);
    const summary = lockSummaryOf(outcome, true);
    expect(summary).toEqual({
      scope: "server-tree",
      tree_key_sha256: outcome.keySha256,
      state: "ACQUIRED",
      reason: null,
      evidence_marker: "CREATED",
    });
    const text = JSON.stringify(summary);
    expect(text).not.toContain(outcome.handle.lockPath);
    expect(text).not.toContain("secret-host");
    expect(text).not.toContain("31337");
    expect(text).not.toContain(outcome.handle.token);
  });

  it("거절·오류와 표지 미생성", async () => {
    const port = new MemoryRunLock({ hostname: "secret-host" });
    await acquired(port);
    const refused = await acquireRunLock(port, req({ runId: "other" }));
    expect(lockSummaryOf(refused, false)).toMatchObject({
      state: "REFUSED",
      reason: "HELD_BY_OTHER",
      evidence_marker: "NOT_CREATED",
    });
    expect(JSON.stringify(lockSummaryOf(refused, false))).not.toContain("secret-host");
    port.fail.resolve = new Error("x");
    const failed = await acquireRunLock(port, req());
    expect(lockSummaryOf(failed, false)).toEqual({
      scope: "server-tree",
      tree_key_sha256: null,
      state: "ERROR",
      reason: "TREE_UNRESOLVABLE",
      evidence_marker: "NOT_CREATED",
    });
  });
});
