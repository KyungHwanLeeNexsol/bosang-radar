import { copyFile, mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { SystemClock } from "./clock";
import { createNodeFs } from "./fs-node";
import { createNodeProcessLister } from "./process-list-node";
import { createNodeProcessPort } from "./process-node";
import { runForeignProcessObservation } from "./process-observation";
import type { ChildHandle, ForeignServerObservationSummary } from "./types";

// ── 이 시험이 확인하는 것 / 확인하지 않는 것 ─────────────────────────────────────────────────────
//
// 실제 운영체제의 프로세스 목록을 읽는다(Windows: PowerShell CIM, Linux: /proc). 그 목록 안에서 이 시험이 직접 띄운 **무해한 Node 스텁**
// (testing/stub-sleeper.mjs)을 찾아, 어댑터 → 해석 → 판정 전체가 실제 운영체제 자료 위에서 이어지는지 본다. 스텁은 `semgrep lsp`처럼
// 보이는 **인자 배열**을 가졌을 뿐 Semgrep이 아니다.
//
//   확인하는 것: 실제 목록에 자기 자신·조상·자손이 보인다 / 스텁의 인자 배열로 역할(서버·버전 확인·검사)이 갈린다 / 인자 속 경로와
//                (Linux에서는) 작업 폴더가 실제 위치(링크 포함)로 풀려 서버 트리와 견주어진다 / 관측이 다른 프로세스를 끝내지 않는다.
//   확인하지 않는 것: 실제 Semgrep 프로세스를 이 규칙이 식별하는지(실제 Semgrep은 설치하지도 실행하지도 않았다), 이 장비에서 건수 0이
//                확정되는지(장비에 읽을 수 없는 python 계열 프로세스가 있으면 정당하게 미확인이다), macOS(지원하지 않는다).
//   플랫폼: 이 시험은 실행한 운영체제에서만 의미가 있다. Windows 11 + Node 24에서 실행해 확인했고, Linux 분기(작업 폴더 단서)는 작성만
//           하고 이 장비에서는 실행하지 못했다. 지원하지 않는 운영체제에서는 건너뛴다.

const SUPPORTED = process.platform === "win32" || process.platform === "linux";
const STUB_SOURCE = fileURLToPath(new URL("./testing/stub-sleeper.mjs", import.meta.url));

describe.skipIf(!SUPPORTED)("실제 운영체제 프로세스 목록 — 무해한 Node 스텁으로 확인", () => {
  const port = createNodeProcessPort({ provenance: "stub" });
  const nodeFs = createNodeFs();
  const children: ChildHandle[] = [];
  let tmp = "";
  let tree = "";
  let other = "";
  let semgrepStub = "";
  let plainStub = "";

  beforeAll(async () => {
    tmp = await mkdtemp(join(tmpdir(), "semgrep-lsp-proclist-"));
    tree = join(tmp, "tree");
    other = join(tmp, "other");
    await mkdir(tree);
    await mkdir(other);
    // 프로그램 이름이 `semgrep`인 확장자 없는 스크립트(내용은 대기 스텁)와, 이름이 다른 평범한 스크립트.
    semgrepStub = join(tmp, "semgrep");
    plainStub = join(tmp, "plain-stub");
    await copyFile(STUB_SOURCE, semgrepStub);
    await copyFile(STUB_SOURCE, plainStub);
  });

  afterEach(async () => {
    await Promise.all(children.splice(0).map((c) => c.dispose()));
  });

  afterAll(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  const stubEnv = (): Record<string, string> => ({
    PATH: process.env.PATH ?? "",
    ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
    STUB_LIFETIME_MS: "30000",
  });

  async function start(script: string, args: string[], cwd: string): Promise<ChildHandle> {
    const child = await port.spawn({
      command: process.execPath,
      args: [script, ...args],
      cwd,
      env: stubEnv(),
    });
    children.push(child);
    return child;
  }

  function alive(pid: number | null): boolean {
    if (pid === null) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  async function observe(ownPid: number): Promise<ForeignServerObservationSummary> {
    const lister = createNodeProcessLister({
      platform: process.platform,
      process: port,
      clock: new SystemClock(),
      systemRoot: process.env.SystemRoot ?? process.env.SYSTEMROOT ?? null,
      env: {
        PATH: process.env.PATH ?? "",
        ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
      },
    });
    const result = await runForeignProcessObservation({
      lister,
      fs: nodeFs,
      lockHeld: true,
      context: { ownPid, serverTree: tree, semgrepBin: semgrepStub },
    });
    return result.summary;
  }

  const LONG = { timeout: 60_000 };

  it(
    "실제 목록에 자기 자신과 조상이 보이고 목록이 읽힌다(자료의 출처는 이 시험이 쓴 포트의 stub 표시)",
    LONG,
    async () => {
      const summary = await observe(process.pid);
      expect(summary.failure).toBeNull();
      expect(summary.status === "OBSERVED" || summary.status === "INCONCLUSIVE").toBe(true);
      expect(summary.listing.source).toBe(
        process.platform === "win32" ? "windows-cim" : "linux-proc"
      );
      expect(summary.listing.rows).toBeGreaterThan(10);
      expect(summary.counts.own_process).toBe(1);
      expect(summary.counts.own_ancestors).toBeGreaterThanOrEqual(1);
      expect(summary.scope).toBe("POINT_IN_TIME");
      expect(summary.listing.provenance).toBe("stub"); // 시험은 포트를 stub으로만 만든다 — 실제 Semgrep 관측이 아니다
    }
  );

  it("이 시험이 띄운 스텁은 하네스의 자손이다 — 다른 서버로 세지 않는다", LONG, async () => {
    await start(semgrepStub, ["lsp", "--root", tree], other);
    const summary = await observe(process.pid);
    expect(summary.counts.servers_same_tree).toBe(0);
    expect(summary.counts.own_descendants).toBeGreaterThanOrEqual(1);
  });

  it(
    "하네스가 아닌 프로세스의 `semgrep lsp --root <서버 트리>`는 같은 트리 서버 1건으로 센다",
    LONG,
    async () => {
      const self = await start(plainStub, ["me"], other); // 이 스텁을 '하네스'로 지정한다
      await start(semgrepStub, ["lsp", "--root", tree], other);
      const summary = await observe(self.pid as number);
      expect(summary.counts.servers_same_tree).toBe(1);
      expect(summary.foreign_server_processes).toBe(1);
      expect(summary.status).toBe("OBSERVED");
    }
  );

  it("역할 구분: 같은 프로그램 이름이라도 `--version`·scan은 서버가 아니다", LONG, async () => {
    const self = await start(plainStub, ["me"], other);
    await start(semgrepStub, ["--version"], tree);
    await start(semgrepStub, ["scan", tree], tree);
    const summary = await observe(self.pid as number);
    expect(summary.counts.version_check).toBeGreaterThanOrEqual(1);
    expect(summary.counts.other_semgrep).toBeGreaterThanOrEqual(1);
    expect(summary.counts.servers_same_tree).toBe(0);
  });

  it(
    "경로 별칭: 서버 트리를 가리키는 링크로 적은 인자도 실제 위치로 풀려 같은 트리가 된다",
    LONG,
    async (ctx) => {
      const alias = join(tmp, "alias-to-tree");
      try {
        await symlink(tree, alias, "junction"); // POSIX에서는 폴더 링크가 된다
      } catch {
        ctx.skip(); // 링크를 만들 수 없는 환경: 검증하지 못한 것으로 보고한다
      }
      const self = await start(plainStub, ["me"], other);
      await start(semgrepStub, ["lsp", `--root=${alias}/sub`], other);
      const summary = await observe(self.pid as number);
      expect(summary.counts.servers_same_tree).toBe(1);
    }
  );

  it(
    "서버 트리와 겹치지 않는 서버는 '다른 트리'가 아니라 판별 불가다 — Windows는 작업 폴더를 알 수 없어서, Linux는 작업 폴더가 트리와 달라도 서버의 작업 공간이 보이지 않아서",
    LONG,
    async () => {
      const self = await start(plainStub, ["me"], other);
      await start(semgrepStub, ["lsp"], other);
      const summary = await observe(self.pid as number);
      // 어느 운영체제에서도 0으로 확정하지 않는다.
      expect(summary.counts.servers_same_tree).toBe(0);
      expect(summary.counts.servers_undetermined).toBeGreaterThanOrEqual(1);
      expect(summary.foreign_server_processes).toBeNull();
      expect(summary.status).toBe("INCONCLUSIVE");
      if (process.platform === "win32") {
        // 이 장비(Windows)에서 실행해 확인했다.
        expect(summary.undetermined_reasons.CWD_UNAVAILABLE).toBeGreaterThanOrEqual(1);
      } else {
        // Linux: /proc/<pid>/cwd를 읽어 트리와 견주지만 겹치지 않는다. (작성만 했고 이 장비에서는 실행하지 못했다.)
        expect(summary.undetermined_reasons.TREE_BINDING_UNOBSERVABLE).toBeGreaterThanOrEqual(1);
      }
    }
  );

  it(
    "[Linux 전용·이 장비에서 실행하지 못함] 작업 폴더가 서버 트리 안인 서버는 같은 트리다",
    LONG,
    async (ctx) => {
      if (process.platform !== "linux") ctx.skip();
      const self = await start(plainStub, ["me"], other);
      await start(semgrepStub, ["lsp"], tree);
      const summary = await observe(self.pid as number);
      expect(summary.counts.servers_same_tree).toBe(1);
    }
  );

  it(
    "관측은 읽기만 한다 — 목록을 읽은 뒤에도 띄워 둔 프로세스는 모두 살아 있다",
    LONG,
    async () => {
      const self = await start(plainStub, ["me"], other);
      const server = await start(semgrepStub, ["lsp", "--root", tree], other);
      const scan = await start(semgrepStub, ["scan"], tree);
      await observe(self.pid as number);
      for (const child of [self, server, scan])
        expect(alive(child.pid), String(child.pid)).toBe(true);
    }
  );

  it("요약에는 명령줄·경로·PID가 없다 — 실제 운영체제 자료로도 같다", LONG, async () => {
    const self = await start(plainStub, ["me"], other);
    await start(semgrepStub, ["lsp", "--root", tree, "--token=tok-SECRET-0123456789"], other);
    const summary = await observe(self.pid as number);
    const text = JSON.stringify(summary);
    for (const leak of [tmp, tree, other, "tok-SECRET", "--token", "plain-stub"]) {
      expect(text, leak).not.toContain(leak);
    }
  });

  it("이미 취소된 신호로는 아무것도 읽지 않는다", LONG, async () => {
    const lister = createNodeProcessLister({
      platform: process.platform,
      process: port,
      clock: new SystemClock(),
      systemRoot: process.env.SystemRoot ?? null,
      env: { PATH: process.env.PATH ?? "" },
    });
    const controller = new AbortController();
    controller.abort();
    expect(await lister.list({ signal: controller.signal })).toEqual({
      ok: false,
      failure: "CANCELLED",
    });
  });
});
