import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createNodeProcessPort } from "./process-node";
import type { ChildHandle, SpawnSpec } from "./types";

// 이 시험이 띄우는 자식은 `process.execPath`(Node)가 실행하는 짧은 인라인 스크립트뿐이다. 모든 스크립트는 스스로
// 끝나는 감시(WATCHDOG)를 갖고, 시험은 afterEach에서 dispose로 정리한다. Semgrep은 어디에도 없다.

const WATCHDOG = "setTimeout(() => process.exit(99), 20000).unref();";
const dec = new TextDecoder();

const children: ChildHandle[] = [];
let workDir = "";

afterEach(async () => {
  await Promise.all(children.splice(0).map((c) => c.dispose()));
  if (workDir) await rm(workDir, { recursive: true, force: true });
  workDir = "";
});

const port = createNodeProcessPort({ provenance: "stub" });

async function launch(
  script: string,
  extra: Partial<SpawnSpec> & { args?: readonly string[] } = {}
): Promise<ChildHandle> {
  const child = await port.spawn({
    command: process.execPath,
    args: ["-e", `${WATCHDOG}${script}`, ...(extra.args ?? [])],
    cwd: extra.cwd ?? tmpdir(),
    env: extra.env ?? {},
  });
  children.push(child);
  return child;
}

async function readAll(stream: AsyncIterable<Uint8Array>): Promise<string> {
  const parts: Uint8Array[] = [];
  for await (const chunk of stream) parts.push(chunk);
  return dec.decode(Buffer.concat(parts));
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as { code?: string }).code === "EPERM";
  }
}

describe("createNodeProcessPort — 실제 포트는 실수로 얻을 수 없다", () => {
  it("provenance는 필수이며 기본값이 없다(타입과 실행 모두)", () => {
    // @ts-expect-error provenance 없이 부를 수 없다
    expect(() => createNodeProcessPort()).toThrow(TypeError);
    // @ts-expect-error provenance 없이 부를 수 없다
    expect(() => createNodeProcessPort({})).toThrow(TypeError);
    const invalid = { provenance: "yes" } as never; // 허용되지 않은 값
    expect(() => createNodeProcessPort(invalid)).toThrow(TypeError);
    expect(createNodeProcessPort({ provenance: "stub" }).provenance).toBe("stub");
  });
});

describe("createNodeProcessPort — 띄우기", () => {
  it("없는 실행 파일은 spawn 약속이 거부된다", async () => {
    await expect(
      port.spawn({
        command: join(tmpdir(), "semgrep-lsp-no-such-binary-xyz"),
        args: [],
        cwd: tmpdir(),
        env: {},
      })
    ).rejects.toThrow();
  });

  it("잘못된 사양은 거부된다", async () => {
    await expect(port.spawn({ command: "", args: [], cwd: tmpdir(), env: {} })).rejects.toThrow(
      TypeError
    );
    await expect(
      port.spawn({
        command: process.execPath,
        args: [],
        cwd: tmpdir(),
        env: { A: 1 as unknown as string },
      })
    ).rejects.toThrow(TypeError);
  });

  it("환경은 준 값 그대로다(부모 환경을 물려받지 않는다)", async () => {
    const child = await launch(
      "process.stdout.write(JSON.stringify(Object.keys(process.env).filter(k => !k.startsWith('=')).sort()))",
      { env: { B_VAR: "2", A_VAR: "1" } }
    );
    const keys = JSON.parse(await readAll(child.stdout)) as string[];
    // Windows에서는 libuv가 필수 변수 11개(PATH·SYSTEMROOT 등)가 없으면 부모 값으로 채워 넣는다(관측한 사실).
    // 그 목록 밖의 변수는 어느 플랫폼에서든 물려받지 않는다.
    const libuvWindowsRequired = new Set([
      "HOMEDRIVE",
      "HOMEPATH",
      "LOGONSERVER",
      "PATH",
      "SYSTEMDRIVE",
      "SYSTEMROOT",
      "TEMP",
      "USERDOMAIN",
      "USERNAME",
      "USERPROFILE",
      "WINDIR",
    ]);
    const extra = keys.filter((k) => k !== "A_VAR" && k !== "B_VAR");
    expect(keys).toContain("A_VAR");
    expect(keys).toContain("B_VAR");
    if (process.platform === "win32") {
      expect(extra.every((k) => libuvWindowsRequired.has(k.toUpperCase()))).toBe(true);
    } else {
      expect(extra).toEqual([]);
    }
    expect((await child.exited).code).toBe(0);
  });

  it("인자는 셸 해석 없이 그대로 전달된다", async () => {
    const odd = ["a b", "&", "$HOME", "%PATH%", '"q"', "x;y"];
    const child = await launch("process.stdout.write(JSON.stringify(process.argv.slice(1)))", {
      args: odd,
    });
    expect(JSON.parse(await readAll(child.stdout))).toEqual(odd);
  });

  it("작업 폴더(cwd)가 지켜진다", async () => {
    workDir = await mkdtemp(join(tmpdir(), "semgrep-lsp-proc-"));
    const child = await launch("process.stdout.write(process.cwd())", { cwd: workDir });
    expect(await realpath(await readAll(child.stdout))).toBe(await realpath(workDir));
  });
});

describe("createNodeProcessPort — 스트림", () => {
  it("stderr를 읽지 않아도 stdout이 끝까지 읽힌다(두 스트림은 독립이다)", async () => {
    const child = await launch(
      "process.stderr.write('e'.repeat(2 * 1024 * 1024)); process.stdout.write('OUT-DONE')"
    );
    // stdout만 끝까지 읽는다. stderr를 안 읽어도 자식이 막히지 않아야 한다.
    expect(await readAll(child.stdout)).toBe("OUT-DONE");
    expect((await readAll(child.stderr)).length).toBe(2 * 1024 * 1024);
    expect((await child.exited).code).toBe(0);
  });

  it("stdout과 stderr를 동시에 소비할 수 있다", async () => {
    const child = await launch(
      "process.stdout.write('o'.repeat(300000)); process.stderr.write('e'.repeat(300000))"
    );
    const [out, err] = await Promise.all([readAll(child.stdout), readAll(child.stderr)]);
    expect(out.length).toBe(300000);
    expect(err.length).toBe(300000);
  });

  it("writeStdin은 쓰기 뒤에 이행하고 endStdin으로 자식이 끝난다", async () => {
    const child = await launch("process.stdin.pipe(process.stdout)");
    await child.writeStdin(new TextEncoder().encode("hello "));
    await child.writeStdin(new TextEncoder().encode("한글"));
    await child.endStdin();
    expect(await readAll(child.stdout)).toBe("hello 한글");
    expect((await child.exited).code).toBe(0);
  });

  it("끝난 자식에게 쓰면 거부된다", async () => {
    const child = await launch("process.exit(0)");
    await child.exited;
    await expect(child.writeStdin(new Uint8Array([1]))).rejects.toThrow();
  });

  it("stdin을 닫은 뒤 쓰면 거부된다", async () => {
    const child = await launch("process.stdin.resume()");
    await child.endStdin();
    await expect(child.writeStdin(new Uint8Array([1]))).rejects.toThrow();
  });
});

describe("createNodeProcessPort — 종료", () => {
  it("exited는 코드와 함께 한 번 이행한다", async () => {
    const child = await launch("process.exit(5)");
    expect(await child.exited).toEqual({ code: 5, signal: null });
    expect(await child.exited).toEqual({ code: 5, signal: null });
  });

  it("살아 있는 자식은 kill로 끝나고 pid가 사라진다", async () => {
    const child = await launch("process.stdin.resume()");
    const pid = child.pid as number;
    expect(typeof pid).toBe("number");
    expect(alive(pid)).toBe(true);
    child.kill("SIGTERM");
    const info = await child.exited;
    // POSIX는 신호 이름, Windows는 taskkill에 의한 비정상 코드다. 어느 쪽이든 정상 종료(0)가 아니다.
    expect(info.signal !== null || info.code !== 0).toBe(true);
    expect(alive(pid)).toBe(false);
  });

  it("이미 끝난 자식에게 kill은 아무 일도 하지 않는다", async () => {
    const child = await launch("process.exit(0)");
    await child.exited;
    expect(() => child.kill("SIGKILL")).not.toThrow();
  });

  it("dispose는 멱등이고 살아 있는 자식을 끝낸다", async () => {
    const child = await launch("process.stdin.resume()");
    const pid = child.pid as number;
    const first = child.dispose();
    const second = child.dispose();
    expect(second).toBe(first);
    await first;
    await child.dispose();
    expect(alive(pid)).toBe(false);
    await expect(child.writeStdin(new Uint8Array([1]))).rejects.toThrow();
  });

  it("dispose 뒤에도 읽던 스트림은 오류 없이 끝난다", async () => {
    const child = await launch("process.stdin.resume()");
    const reading = Promise.all([readAll(child.stdout), readAll(child.stderr)]);
    await child.dispose();
    await expect(reading).resolves.toEqual(["", ""]);
  });
});
